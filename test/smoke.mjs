// smoke.mjs – API-Durchlauf gegen einen echten `wrangler dev --local` (lokale D1) und die Mock-KI.
//
//   node test/smoke.mjs        (SMOKE_PORT=8811, SMOKE_MOCK_PORT=8812, SMOKE_STATE=.wrangler/smoke-state)
//
// Startet selbst: Build (dist/), Mock-KI und wrangler dev mit frischem Zustand; beendet beides am Ende.
// Die Krypto-Helfer (exakt SPEC §2) sind exportiert und auch für andere Tests nutzbar.
import { spawn } from "node:child_process";
import { readFile, rm, readdir, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makePng } from "./png.mjs";

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder(), td = new TextDecoder();
export const b64 = (u8) => Buffer.from(u8 instanceof ArrayBuffer ? new Uint8Array(u8) : u8).toString("base64");
export const unb64 = (s) => new Uint8Array(Buffer.from(s, "base64"));

/* ---------- Krypto wie im Browser (SPEC §2) ---------- */
export async function deriveTeacherKeys(password, kdf) {
  const base = await subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  const master = await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(kdf.salt), iterations: kdf.iterations }, base, 256);
  const hk = await subtle.importKey("raw", master, "HKDF", false, ["deriveBits", "deriveKey"]);
  const encKey = await subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: te.encode("feibeitsblatt/enc/v1") },
    hk, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const authRaw = await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: te.encode("feibeitsblatt/auth/v1") }, hk, 256);
  return { encKey, authKey: b64(authRaw) };
}
export async function sealPrivateKey(encKey, pkcs8) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv: b64(iv), ct: b64(await subtle.encrypt({ name: "AES-GCM", iv }, encKey, pkcs8)) };
}
export async function openPrivateKey(encKey, encPrivateKey) {
  const pkcs8 = await subtle.decrypt({ name: "AES-GCM", iv: unb64(encPrivateKey.iv) }, encKey, unb64(encPrivateKey.ct));
  return subtle.importKey("pkcs8", pkcs8, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
}
export async function createTeacher(password, iterations = 600000) {
  const kdf = { salt: b64(crypto.getRandomValues(new Uint8Array(16))), iterations };
  const { encKey, authKey } = await deriveTeacherKeys(password, kdf);
  const pair = await subtle.generateKey({ name: "RSA-OAEP", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
  const publicKey = b64(await subtle.exportKey("spki", pair.publicKey));
  const pkcs8 = new Uint8Array(await subtle.exportKey("pkcs8", pair.privateKey));
  return { kdf, authKey, encKey, publicKey, pkcs8, privateKey: pair.privateKey, encPrivateKey: await sealPrivateKey(encKey, pkcs8) };
}
export async function makeEnvelope(publicKeyB64, payload) {
  const pub = await subtle.importKey("spki", unb64(publicKeyB64), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const k = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, k, te.encode(JSON.stringify(payload)));
  const ek = await subtle.encrypt({ name: "RSA-OAEP" }, pub, await subtle.exportKey("raw", k));
  return { v: 1, ek: b64(ek), iv: b64(iv), ct: b64(ct) };
}
export async function openEnvelope(privateKey, env) {
  const raw = await subtle.decrypt({ name: "RSA-OAEP" }, privateKey, unb64(env.ek));
  const k = await subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  return JSON.parse(td.decode(await subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, k, unb64(env.ct))));
}

/* ---------- Durchlauf ---------- */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UNKNOWN_CODE_MSG = "Zu diesem Code gibt es kein Feibeitsblatt. Bitte prüfe den Code.";

async function filesUnder(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await filesUnder(p))); else out.push(p);
  }
  return out;
}

async function main() {
  const PORT = Number(process.env.SMOKE_PORT || 8811), MOCK_PORT = Number(process.env.SMOKE_MOCK_PORT || 8812);
  const STATE = process.env.SMOKE_STATE || join(ROOT, ".wrangler", "smoke-state");
  const BASE = "http://127.0.0.1:" + PORT;
  const SECRET = b64(crypto.getRandomValues(new Uint8Array(32)));
  let wrangler = null, mock = null, log = "";
  let step = "Start";
  const ok = (name) => console.log("  ✓ " + name);

  const cleanup = async () => {
    if (wrangler && wrangler.exitCode == null) {
      try { process.kill(-wrangler.pid, "SIGTERM"); } catch {}
      for (let i = 0; i < 50 && wrangler.exitCode == null; i++) await sleep(100);
      try { process.kill(-wrangler.pid, "SIGKILL"); } catch {}
      for (let i = 0; i < 50; i++) {   // warten, bis der Port wirklich frei ist
        try { await fetch("http://127.0.0.1:" + (process.env.SMOKE_PORT || 8811) + "/api/health", { signal: AbortSignal.timeout(300) }); } catch { break; }
        await sleep(100);
      }
    }
    if (mock) await mock.close();
  };
  process.on("SIGINT", () => cleanup().then(() => process.exit(130)));

  try {
    step = "Build";
    await new Promise((resolve, reject) => {
      const b = spawn(process.execPath, [join(ROOT, "scripts", "build.mjs")], { stdio: "inherit" });
      b.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("Build fehlgeschlagen"))));
    });
    await rm(STATE, { recursive: true, force: true });
    await mkdir(STATE, { recursive: true });

    step = "Mock-KI";
    const { startMockAI, expectedResults, expectedChecklist } = await import(pathToFileURL(join(ROOT, "test", "mock-ai.mjs")).href);
    mock = await startMockAI({ port: MOCK_PORT });

    step = "wrangler dev";
    wrangler = spawn(join(ROOT, "node_modules", ".bin", "wrangler"),
      ["dev", "--local", "--ip", "127.0.0.1", "--port", String(PORT), "--persist-to", STATE, "--show-interactive-dev-session=false",
        "--var", "SETTINGS_SECRET:" + SECRET],
      { cwd: ROOT, detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    wrangler.stdout.on("data", (d) => { log += d; });
    wrangler.stderr.on("data", (d) => { log += d; });
    const t0 = Date.now();
    for (;;) {
      if (wrangler.exitCode != null) throw new Error("wrangler dev beendet:\n" + log.slice(-3000));
      try { const r = await fetch(BASE + "/api/health"); if (r.ok) break; } catch {}
      if (Date.now() - t0 > 120000) throw new Error("wrangler dev nicht bereit:\n" + log.slice(-3000));
      await sleep(300);
    }
    ok("wrangler dev bereit nach " + Math.round((Date.now() - t0) / 1000) + " s");

    const api = async (method, path, body, { auth, headers = {}, rawBody } = {}) => {
      const h = { ...headers };
      if ((body !== undefined || rawBody !== undefined) && !h["content-type"]) h["content-type"] = "application/json";
      if (auth) h.authorization = "Bearer " + auth;
      const init = { method, headers: h, body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined };
      if (rawBody instanceof ReadableStream) init.duplex = "half";
      const r = await fetch(BASE + path, init);
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      return { status: r.status, headers: r.headers, text, json };
    };
    const expectErr = (res, status, code, msg) => {
      assert.equal(res.status, status, step + ": HTTP " + res.status + " " + res.text.slice(0, 300));
      assert.equal(res.json && res.json.ok, false);
      assert.equal(res.json.code, code);
      assert.equal(typeof res.json.error, "string");
      if (msg) assert.equal(res.json.error, msg);
    };
    let doorFails = 0, authFails = 0, misses = 0, feedbackCount = 0, submitCount = 0;

    step = "Allgemein";
    let r = await api("GET", "/api/gibtsnicht");
    expectErr(r, 404, "not_found");
    assert.equal(r.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("access-control-allow-origin"), "*");
    ok("unbekannte Route → 404 JSON mit Sicherheits-/CORS-Headern");
    r = await api("OPTIONS", "/api/submit", undefined, { headers: { origin: "https://example.org", "access-control-request-method": "POST", "access-control-request-headers": "content-type, authorization" } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get("access-control-allow-origin"), "*");
    assert.match(r.headers.get("access-control-allow-headers"), /Authorization/);
    assert.match(r.headers.get("access-control-allow-methods"), /DELETE/);
    ok("OPTIONS → 204 mit CORS-Headern");
    r = await fetch(BASE + "/");
    const html = await r.text();
    assert.equal(r.status, 200);
    assert.equal(html, await readFile(join(ROOT, "dist", "index.html"), "utf8"));
    assert.match(r.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
    assert.equal(r.headers.get("x-frame-options"), "DENY");
    assert.equal((await fetch(BASE + "/_headers")).status, 404, "_headers darf nicht ausgeliefert werden");
    ok("GET / liefert dist/index.html mit Sicherheits-Headern aus _headers (die selbst nicht abrufbar ist)");
    expectErr(await api("POST", "/api/teacher/door", undefined, { rawBody: "{kaputt" }), 400, "bad_json");
    expectErr(await api("GET", "/api/feedback"), 405, "method_not_allowed");
    ok("ungültiges JSON → 400 bad_json, falsche Methode → 405");
    r = await api("POST", "/api/submit", undefined, { rawBody: JSON.stringify({ code: "ABC234", pad: "x".repeat(1100 * 1024) }) });
    expectErr(r, 413, "too_large");
    const big = new Uint8Array(1100 * 1024).fill(32);
    const stream = new ReadableStream({ start(c) { for (let i = 0; i < big.length; i += 65536) c.enqueue(big.subarray(i, i + 65536)); c.close(); } });
    expectErr(await api("POST", "/api/feedback", undefined, { rawBody: stream }), 413, "too_large");
    ok("Body > 1 MB → 413 (mit und ohne Content-Length)");

    step = "Tür";
    r = await api("POST", "/api/teacher/door", { doorCode: "0000" }); doorFails++;
    expectErr(r, 403, "wrong_code", UNKNOWN_CODE_MSG);
    r = await api("POST", "/api/teacher/door", { doorCode: "1104" });
    assert.deepEqual(r.json, { ok: true, setup: false, kdf: null });
    ok("Türcode falsch → 403 (Meldung wie unbekannter Code), richtig → setup:false");

    step = "Einrichtung";
    const PASSWORD = "Korrektes Pferd Batterie 1104";
    const T = await createTeacher(PASSWORD);
    expectErr(await api("GET", "/api/teacher/ai", undefined, { auth: T.authKey }), 409, "not_setup");
    const setupBody = { doorCode: "1104", authKey: T.authKey, kdf: T.kdf, publicKey: T.publicKey, encPrivateKey: T.encPrivateKey };
    r = await api("POST", "/api/teacher/setup", { ...setupBody, doorCode: "9999" }); doorFails++;
    expectErr(r, 403, "wrong_code");
    expectErr(await api("POST", "/api/teacher/setup", { ...setupBody, publicKey: "QUJD" }), 400, "bad_request");
    expectErr(await api("POST", "/api/teacher/setup", { ...setupBody, kdf: { salt: T.kdf.salt, iterations: 1000 } }), 400, "bad_request");
    r = await api("POST", "/api/teacher/setup", setupBody);
    assert.deepEqual(r.json, { ok: true }, r.text);
    expectErr(await api("POST", "/api/teacher/setup", setupBody), 409, "already_setup");
    r = await api("POST", "/api/teacher/door", { doorCode: " 1104 " });
    assert.deepEqual(r.json, { ok: true, setup: true, kdf: T.kdf });
    ok("Passwort festlegen (PBKDF2 600 000 → HKDF, RSA-OAEP 3072), zweites Setup → 409");

    step = "Anmeldung";
    const again = await deriveTeacherKeys(PASSWORD, r.json.kdf);
    assert.equal(again.authKey, T.authKey);
    r = await api("POST", "/api/teacher/login", undefined, { auth: again.authKey });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.publicKey, T.publicKey);
    assert.deepEqual(r.json.kdf, T.kdf);
    let privateKey = await openPrivateKey(again.encKey, r.json.encPrivateKey);
    const wrong = await deriveTeacherKeys("falsches Passwort", T.kdf);
    r = await api("POST", "/api/teacher/login", undefined, { auth: wrong.authKey }); authFails++;
    expectErr(r, 401, "unauthorized", "Passwort falsch.");
    expectErr(await api("GET", "/api/teacher/sheets"), 401, "unauthorized");
    ok("Anmeldung: privater Schlüssel entschlüsselbar; falsches Passwort → 401");

    step = "KI-Einstellungen";
    let auth = T.authKey;
    r = await api("GET", "/api/teacher/ai", undefined, { auth });
    // Vorauswahl Workers AI, aber erst nach „Speichern“ aktiv
    assert.equal(r.json.provider, "cloudflare"); assert.equal(r.json.hasKey, false); assert.equal(r.json.keyHint, ""); assert.equal(r.json.ready, false); assert.equal(r.json.saved, false);
    // Workers AI lokal: das Binding steht in wrangler.jsonc, gespeichert wird ohne Schlüssel; jeder Aufruf scheitert mit Hinweis (kein Konto nötig)
    r = await api("PUT", "/api/teacher/ai", { provider: "cloudflare", model: "" }, { auth });
    assert.equal(r.status, 200, r.text); assert.equal(r.json.ready, true); assert.equal(r.json.warning, undefined); assert.equal(r.json.keyHint, "");
    r = await api("POST", "/api/teacher/ai/test", undefined, { auth });
    expectErr(r, 502, "ai_error"); assert.match(r.json.error, /lokalen Entwicklung/); assert.equal(r.json.aiCode, "CONFIG");
    {   // Empfänger für den Datenschutzhinweis; Feedback lokal → 503 ai_not_configured
      const t = await api("POST", "/api/teacher/sheets", { title: "Workers AI", tasks: [{ text: "Frage", solution: "- Licht" }] }, { auth });
      assert.equal(t.status, 200, t.text);
      r = await api("GET", "/api/sheet/" + t.json.code);
      assert.deepEqual(r.json.sheet.aiRecipients, [{ id: "cloudflare", label: "Cloudflare, Inc. (San Francisco, USA) – betreibt auch den Server, der die Abgaben speichert",
        transfer: "EU-US Data Privacy Framework, ersatzweise Standardvertragsklauseln" }]);
      r = await api("POST", "/api/feedback", { code: t.json.code, answers: ["Licht"] }); feedbackCount++;
      expectErr(r, 503, "ai_not_configured");
      assert.equal((await api("DELETE", "/api/teacher/sheets/" + t.json.code, undefined, { auth })).status, 200);
    }
    r = await api("PUT", "/api/teacher/ai", { provider: "groq", model: "" }, { auth });   // zurück: ohne Schlüssel nicht nutzbar
    assert.equal(r.status, 200, r.text); assert.equal(r.json.hasKey, false); assert.equal(r.json.saved, true);
    expectErr(await api("PUT", "/api/teacher/ai", { provider: "custom", model: "", baseUrl: "http://example.com/v1", apiKey: "test" }, { auth }), 400, "bad_request");
    expectErr(await api("PUT", "/api/teacher/ai", { provider: "unbekannt", model: "" }, { auth }), 400, "bad_request");
    expectErr(await api("POST", "/api/teacher/ai/test", undefined, { auth }), 400, "ai_not_configured");
    r = await api("PUT", "/api/teacher/ai", { provider: "custom", model: "", baseUrl: mock.url, apiKey: "test" }, { auth });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.hasKey, true); assert.equal(r.json.keyHint, "…test"); assert.equal(r.json.warning, undefined);
    assert.deepEqual(r.json.fallbacks, ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "qwen/qwen3-32b"]);   // whisper aussortiert
    assert.equal(r.text.includes('"test"'), false, "API-Schlüssel darf die API nie verlassen");
    r = await api("GET", "/api/teacher/ai", undefined, { auth });
    assert.equal(r.json.provider, "custom"); assert.equal(r.json.baseUrl, mock.url); assert.equal(r.json.hasKey, true); assert.equal(r.json.keyHint, "…test");
    r = await api("PUT", "/api/teacher/ai", { provider: "custom", model: "", baseUrl: mock.url }, { auth });   // ohne apiKey: alter bleibt
    assert.equal(r.json.hasKey, true);
    mock.reset();
    r = await api("POST", "/api/teacher/ai/test", undefined, { auth });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.sample, "Verbindung steht."); assert.equal(r.json.model, "openai/gpt-oss-120b"); assert.equal(r.json.provider, "custom");
    assert.equal(mock.state.requests.length, 1);
    ok("KI: Vorauswahl Workers AI nicht aktiv; gespeichert ohne Schlüssel, lokal → CONFIG mit Hinweis, Empfänger Cloudflare; custom + Mock speichern (keyHint …test, Ausweich-Liste), Test → sample");

    step = "Feibeitsblatt anlegen";
    const tasks = [
      { text: "Erkläre, wie Pflanzen Energie gewinnen.", solution: "- Photosynthese findet in den Chloroplasten statt\n- Licht wird als Energiequelle benötigt\n- Sauerstoff entsteht als Nebenprodukt" },
      { text: "Was hat dir heute am besten gefallen?", solution: "" },
      { text: "Warum trocknet eine Pfütze?", solution: "Achte darauf, ob die Verdunstung durch Wärme erklärt wird. Verrate die Lösung nicht." },   // Auftrag an die KI
    ];
    expectErr(await api("POST", "/api/teacher/sheets", { title: "x", tasks: [] }, { auth }), 400, "bad_request");
    expectErr(await api("POST", "/api/teacher/sheets", { title: "x", tasks: Array.from({ length: 31 }, () => ({ text: "a" })) }, { auth }), 400, "bad_request");
    expectErr(await api("POST", "/api/teacher/sheets", { title: "x", tasks: [{ text: "   ", solution: "a" }] }, { auth }), 400, "bad_request");
    expectErr(await api("POST", "/api/teacher/sheets", { title: "x", tasks: [{ text: "a".repeat(4001) }] }, { auth }), 400, "bad_request");
    r = await api("POST", "/api/teacher/sheets", { title: "", tasks: [{ text: "Nur eine Aufgabe" }] }, { auth });
    assert.match(r.json.title, /^Feibeitsblatt vom \d{2}\.\d{2}\.\d{4}$/);
    const otherCode = r.json.code;
    r = await api("POST", "/api/teacher/sheets", { title: "  Smoke-Test: Pflanzen  ", tasks }, { auth });
    assert.equal(r.status, 200, r.text);
    const code = r.json.code;
    assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/); assert.match(code, /[A-Z]/); assert.match(code, /[0-9]/);
    assert.equal(r.json.title, "Smoke-Test: Pflanzen");
    r = await api("GET", "/api/teacher/sheets", undefined, { auth });
    assert.equal(r.json.sheets.length, 2);
    assert.equal(r.json.sheets.find((s) => s.code === code).taskCount, 3);
    assert.equal(r.json.sheets.find((s) => s.code === code).submissionCount, 0);
    r = await api("GET", "/api/teacher/sheets/" + code.toLowerCase(), undefined, { auth });
    assert.deepEqual(r.json.sheet.tasks, tasks.map((t) => ({ ...t, textFmt: [], material: [], images: [], files: [], answer: { type: "text" } })));
    ok("Blatt anlegen (Prüfungen, Titel-Vorgabe, Code-Format), Liste und Einzelansicht mit Aufträgen an die KI");

    step = "Bilder zu Aufgaben";
    const png = makePng(640, 400), pngBig = makePng(1200, 900, (x, y) => [x & 255, (y >> 3) & 255, 90]);
    const up = (sheet, task, mode, body, data) => api("POST", "/api/teacher/sheets/" + sheet + "/images",
      { task, mode, data: data !== undefined ? data : Buffer.isBuffer(body) ? body.toString("base64") : body }, { auth });
    expectErr(await api("POST", "/api/teacher/sheets/" + code + "/images", { task: 1, mode: "thumb", data: png.toString("base64") }), 401, "unauthorized");
    expectErr(await up(code, 4, "thumb", png), 400, "bad_request");                 // Aufgabe 4 gibt es nicht
    expectErr(await up(code, 0, "thumb", png), 400, "bad_request");
    expectErr(await up(code, "1", "thumb", png), 400, "bad_request");
    expectErr(await up(code, 1, "huge", png), 400, "bad_request");
    expectErr(await up(code, 1, "thumb", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")), 400, "bad_image");
    expectErr(await up(code, 1, "thumb", null, "kein base64!"), 400, "bad_image");
    expectErr(await up(code, 1, "thumb", null, ""), 400, "bad_image");
    expectErr(await up(code, 1, "thumb", Buffer.concat([png.subarray(0, 33), Buffer.alloc(520 * 1024)])), 413, "too_large");   // > 500 KB
    expectErr(await up("ZZZZZ9", 1, "thumb", png), 404, "not_found");
    r = await up(code, 1, "thumb", png); assert.equal(r.status, 200, r.text);
    const img1 = r.json.image;
    assert.match(img1.id, /^[0-9a-f]{16}$/);
    assert.deepEqual([img1.task, img1.pos, img1.mode, img1.mime, img1.w, img1.h, img1.bytes, img1.alt], [1, 0, "thumb", "image/png", 640, 400, png.length, ""]);
    r = await api("POST", "/api/teacher/sheets/" + code + "/images", { id: img1.id, task: 1, mode: "thumb", data: png.toString("base64") }, { auth });   // Wiederholung → kein Duplikat
    assert.equal(r.status, 200, r.text); assert.deepEqual([r.json.existing, r.json.image.pos], [true, 0]);
    r = await up(code, 1, "inline", pngBig); assert.equal(r.status, 200, r.text); const img2 = r.json.image; assert.equal(img2.pos, 1);
    r = await up(code, 2, "thumb", png); assert.equal(r.status, 200, r.text); const img3 = r.json.image; assert.equal(img3.pos, 0);
    for (let i = 0; i < 3; i++) { r = await up(code, 1, "thumb", png); assert.equal(r.status, 200, r.text); assert.equal(r.json.image.pos, 2 + i); }
    expectErr(await up(code, 1, "thumb", png), 400, "too_many_images");             // höchstens 5 je Aufgabe
    r = await api("GET", "/api/teacher/sheets/" + code, undefined, { auth });
    assert.equal(r.json.sheet.tasks[0].images.length, 5);
    assert.deepEqual(r.json.sheet.tasks[0].images[0], { id: img1.id, mode: "thumb", w: 640, h: 400, alt: "" });
    assert.deepEqual(r.json.sheet.tasks[0].images[1], { id: img2.id, mode: "inline", w: 1200, h: 900, alt: "" });
    assert.deepEqual(r.json.sheet.tasks[1].images, [{ id: img3.id, mode: "thumb", w: 640, h: 400, alt: "" }]);
    assert.deepEqual(r.json.sheet.tasks[2].images, []);
    assert.equal(r.text.includes('"data"'), false);
    r = await api("GET", "/api/sheet/" + code.toLowerCase() + "/images/" + img2.id);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual([r.json.id, r.json.mime, r.json.w, r.json.h], [img2.id, "image/png", 1200, 900]);
    assert.equal(Buffer.compare(Buffer.from(r.json.data, "base64"), pngBig), 0);
    r = await api("GET", "/api/sheet/" + otherCode + "/images/" + img2.id); expectErr(r, 404, "not_found", "Diese Adresse gibt es nicht.");   // Bild eines anderen Blattes
    r = await api("GET", "/api/sheet/" + code + "/images/0123456789abcdef"); expectErr(r, 404, "not_found", "Diese Adresse gibt es nicht.");
    r = await api("GET", "/api/sheet/" + code + "/images/nope"); expectErr(r, 404, "not_found", "Diese Adresse gibt es nicht.");
    r = await api("GET", "/api/sheet/ZZZZZ9/images/" + img2.id); misses++; expectErr(r, 404, "not_found", UNKNOWN_CODE_MSG);   // unbekannter Code zählt als Fehlgriff
    ok("Bilder: Upload-Prüfungen (Auth, Aufgabe, Art, Base64, Format, Größe, höchstens 5 je Aufgabe), Reihenfolge, Metadaten ohne Bilddaten, öffentlicher Abruf (Base64, cachebar)");

    step = "PDF-Dateien zu Aufgaben";
    const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(600 * 1024, 0x20), Buffer.from("\n%%EOF\n")]);   // 2 Teile
    const CH = 512 * 1024, pdfChunks = Math.ceil(pdf.length / CH);
    const pdfPart = (n) => pdf.subarray(n * CH, Math.min(pdf.length, (n + 1) * CH)).toString("base64");
    const fileId = "0123456789abcd01";
    const fup = (n, extra) => api("POST", "/api/teacher/sheets/" + code + "/files", { id: fileId, task: 2, name: "Arbeitsblatt: Zelle.pdf", bytes: pdf.length, chunks: pdfChunks, n, data: pdfPart(n), ...(extra || {}) }, { auth });
    expectErr(await api("POST", "/api/teacher/sheets/" + code + "/files", { id: fileId, task: 2, name: "x.pdf", bytes: pdf.length, chunks: pdfChunks, n: 0, data: pdfPart(0) }), 401, "unauthorized");
    expectErr(await fup(1), 400, "bad_request");                                   // Teil 1 vor Teil 0
    expectErr(await fup(0, { task: 4 }), 400, "bad_request");                      // Aufgabe 4 gibt es nicht
    expectErr(await fup(0, { data: Buffer.from("kein PDF" + " ".repeat(CH - 8)).toString("base64") }), 400, "bad_file");
    expectErr(await fup(0, { chunks: 1 }), 400, "bad_request");
    expectErr(await api("POST", "/api/teacher/sheets/" + code + "/files", { id: "0123456789abcd02", task: 1, name: "g.pdf", bytes: 7 * 1024 * 1024, chunks: 14, n: 0, data: pdfPart(0) }, { auth }), 413, "too_large");
    r = await fup(0); assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json.file, { id: fileId, task: 2, pos: 0, name: "Arbeitsblatt- Zelle.pdf", bytes: pdf.length, chunks: 2, n: 0, complete: false });
    r = await api("GET", "/api/sheet/" + code + "/files/" + fileId); expectErr(r, 404, "not_found");   // unvollständig: kein Download, nicht gelistet
    r = await api("GET", "/api/sheet/" + code); assert.deepEqual(r.json.sheet.tasks[1].files, []);
    r = await fup(1); assert.equal(r.status, 200, r.text); assert.deepEqual(r.json.file, { id: fileId, task: 2, n: 1, chunks: 2, complete: true });
    r = await fup(1); assert.equal(r.status, 200, r.text); assert.equal(r.json.existing, true);   // Wiederholung → kein Duplikat
    r = await fup(0); assert.equal(r.status, 200, r.text); assert.deepEqual([r.json.existing, r.json.file.complete], [true, true]);
    r = await api("GET", "/api/teacher/sheets/" + code, undefined, { auth });
    assert.deepEqual(r.json.sheet.tasks.map((t) => t.files), [[], [{ id: fileId, name: "Arbeitsblatt- Zelle.pdf", bytes: pdf.length }], []]);
    assert.equal(r.text.includes('"data"'), false);
    r = await api("GET", "/api/sheet/" + code.toLowerCase() + "/files/" + fileId);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.deepEqual([r.json.id, r.json.name, r.json.mime, r.json.bytes, r.json.chunks, r.json.n], [fileId, "Arbeitsblatt- Zelle.pdf", "application/pdf", pdf.length, 2, 0]);
    const r2 = await api("GET", "/api/sheet/" + code + "/files/" + fileId + "?part=1"); assert.equal(r2.status, 200, r2.text);
    assert.equal(Buffer.compare(Buffer.concat([Buffer.from(r.json.data, "base64"), Buffer.from(r2.json.data, "base64")]), pdf), 0);
    r = await api("GET", "/api/sheet/" + code + "/files/" + fileId + "?part=2"); expectErr(r, 404, "not_found", "Diese Adresse gibt es nicht.");
    r = await api("GET", "/api/sheet/" + otherCode + "/files/" + fileId); expectErr(r, 404, "not_found", "Diese Adresse gibt es nicht.");   // Datei eines anderen Blattes
    r = await api("GET", "/api/sheet/ZZZZZ9/files/" + fileId); misses++; expectErr(r, 404, "not_found", UNKNOWN_CODE_MSG);
    ok("PDF-Dateien: gestückelter Upload (Auth, Reihenfolge, Kennung, Größe, Stückelung), erst vollständig gelistet, Download in Teilen (cachebar)");

    step = "Öffentlicher Abruf";
    const display = code.slice(0, 3) + "-" + code.slice(3);
    r = await api("GET", "/api/sheet/" + encodeURIComponent(" " + display.toLowerCase() + " "));
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json.sheet.tasks.map((t) => t.text), tasks.map((t) => t.text));
    assert.deepEqual(r.json.sheet.tasks.map((t) => Object.keys(t).sort().join()), ["answer,files,images,material,text,textFmt", "answer,files,images,material,text,textFmt", "answer,files,images,material,text,textFmt"]);
    assert.equal(r.json.sheet.tasks[0].images.length, 5); assert.deepEqual(r.json.sheet.tasks[1].images, [{ id: img3.id, mode: "thumb", w: 640, h: 400, alt: "" }]); assert.deepEqual(r.json.sheet.tasks.map((t) => t.files), [[], [{ id: fileId, name: "Arbeitsblatt- Zelle.pdf", bytes: pdf.length }], []]);
    assert.equal(r.json.sheet.publicKey, T.publicKey); assert.equal(r.json.sheet.aiProvider, "127.0.0.1:" + MOCK_PORT);
    assert.equal(r.json.sheet.aiFeedback, true);   // mindestens eine Aufgabe mit Auftrag an die KI
    assert.deepEqual(r.json.sheet.aiRecipients, [{ id: "custom:127.0.0.1:" + MOCK_PORT, label: "127.0.0.1:" + MOCK_PORT + " (Betreiber und Sitz: vom Betreiber dieser Seite zu prüfen)",
      transfer: "vom Betreiber dieser Seite beim Anbieter zu prüfen" }]);   // Empfänger für den Datenschutzhinweis
    // Neuinstallation: Löschfrist 30 Tage als Vorgabe (öffentlich nur die Frist; verantwortlich ist der Betreiber, siehe index.html)
    assert.deepEqual(r.json.sheet.privacy, { retentionDays: 30 });
    assert.equal(r.json.sheet.title, "Smoke-Test: Pflanzen");
    for (const t of tasks) if (t.solution) for (const part of t.solution.split("\n")) assert.equal(r.text.includes(part.replace(/^- /, "")), false, "Auftrag an die KI im öffentlichen JSON!");
    assert.equal(/solution|musterl/i.test(r.text), false);
    r = await api("GET", "/api/sheet/ZZZZZ9"); misses++;
    expectErr(r, 404, "not_found", UNKNOWN_CODE_MSG);
    r = await api("GET", "/api/sheet/1104"); misses++;
    expectErr(r, 404, "not_found", UNKNOWN_CODE_MSG);
    ok("GET /api/sheet: nur Aufgabentexte (kein Auftrag an die KI), Schlüssel, Anbieter; unbekannt → 404");

    step = "Antwortarten";
    {
      const answer = { type: "map", map: "world", items: [
        { id: "kaffee", label: "Kaffee", image: "00000000000000c1", countries: [{ id: "076", name: "Brasilien" }, { id: "704", name: "Vietnam" }] },
        { id: "tee", label: "Tee", hint: "Blätter", countries: [{ id: "356", name: "Indien" }] }] };
      expectErr(await api("POST", "/api/teacher/sheets", { title: "x", tasks: [{ text: "a", answer: { type: "map", items: [{ id: "A B", label: "x", countries: [{ id: "276", name: "Deutschland" }] }] } }] }, { auth }), 400, "bad_request");
      expectErr(await api("POST", "/api/teacher/sheets", { title: "x", tasks: [{ text: "a", answer: { type: "table", columns: [], rows: 2 } }] }, { auth }), 400, "bad_request");
      r = await api("POST", "/api/teacher/sheets", { title: "Smoke: Welt", tasks: [{ text: "Ordne zu.", solution: "verworfen", answer }, { text: "Tabelle", solution: "- Weizen", answer: { type: "table", columns: ["Produkt", "Land | Ort"], rows: 2 } }] }, { auth });
      assert.equal(r.status, 200, r.text);
      const wc = r.json.code;
      r = await up(wc, 1, "card", png, undefined); assert.equal(r.status, 200, r.text);   // eigene Kennung bei Kartenbildern
      r = await api("POST", "/api/teacher/sheets/" + wc + "/images", { id: "00000000000000c1", task: 1, mode: "card", data: png.toString("base64") }, { auth }); assert.equal(r.status, 200, r.text);
      for (let i = 0; i < 5; i++) { r = await up(wc, 1, "thumb", png); assert.equal(r.status, 200, r.text); }   // Kartenbilder zählen nicht zu den 5 Bildern
      expectErr(await up(wc, 1, "inline", png), 400, "too_many_images");
      r = await api("GET", "/api/sheet/" + wc);
      assert.equal(r.status, 200, r.text);
      const pa = r.json.sheet.tasks[0].answer;
      assert.deepEqual(pa.items.map((it) => [it.id, it.label, it.hint, it.image, it.checks.length]), [["kaffee", "Kaffee", undefined, "00000000000000c1", 2], ["tee", "Tee", "Blätter", undefined, 1]]);
      assert.equal(pa.items[0].checks[0], createHash("sha256").update(wc + "|kaffee|076").digest("hex"));
      assert.deepEqual(r.json.sheet.tasks[1].answer, { type: "table", columns: ["Produkt", "Land / Ort"], rows: 2 });
      assert.equal(/Brasilien|Vietnam|Indien|countries|verworfen/.test(r.text), false, "Länder oder Auftrag an die KI im öffentlichen JSON");
      assert.equal(r.json.sheet.tasks[0].images.filter((m) => m.mode === "card").length, 2);
      r = await api("GET", "/api/teacher/sheets/" + wc, undefined, { auth });
      assert.deepEqual(r.json.sheet.tasks[0].answer, answer); assert.equal(r.json.sheet.tasks[0].solution, "");
      mock.reset();
      r = await api("POST", "/api/feedback", { code: wc, answers: ["Kaffee → Brasilien\nZugeordnet: 1 von 2", "Produkt | Land / Ort\nWeizen | Kanada"] }); feedbackCount++;
      assert.equal(r.status, 200, r.text);
      const msg = mock.state.requests.map((q) => q.messages.map((m) => m.content).join("\n")).join("\n");
      assert.ok(msg.includes("### Antwort zu Aufgabe 2\nAntwort als Tabelle mit den Spalten: Produkt, Land / Ort\n<<<\nProdukt | Land / Ort\nWeizen | Kanada\n>>>"), msg);
      assert.equal(/Kaffee|### Aufgabe 1\b/.test(msg), false);
      r = await api("DELETE", "/api/teacher/sheets/" + wc, undefined, { auth }); assert.equal(r.status, 200, r.text);
    }
    ok("Antwortarten: Tabelle und Weltkarte gespeichert, öffentlich nur Prüfwerte (keine Länder), Kartenbilder getrennt gezählt, Tabellen-Hinweis im Prompt");

    step = "KI-Feedback";
    const answers = ["Die Photosynthese braucht LICHT. Zebrafink-Marker", "Die Pause.", ""];
    mock.reset();
    r = await api("POST", "/api/feedback", { code: display, answers }); feedbackCount++;
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json.results, expectedResults(tasks, answers));
    assert.deepEqual(r.json.results, [
      { covered: ["Photosynthese findet in den Chloroplasten statt", "Licht wird als Energiequelle benötigt"], missing: ["Sauerstoff entsteht als Nebenprodukt"] },
      { covered: [], missing: [], note: "Zu dieser Aufgabe gibt es kein KI-Feedback." },
      { covered: [], missing: ["Achte darauf, ob die Verdunstung durch Wärme erklärt wird", "Verrate die Lösung nicht"] },
    ]);
    assert.equal(r.json.aiGenerated, true); assert.match(r.json.digitalSourceType, /\/trainedAlgorithmicMedia$/);   // KI-Kennzeichnung (Art. 50 KI-VO)
    assert.equal(mock.state.requests.length, 1, "eine KI-Anfrage je Blatt");
    const sent = mock.state.requests[0].messages.map((m) => m.content).join("\n");
    assert.match(sent, /### Aufgabe 1\n/); assert.match(sent, /### Aufgabe 3\n/); assert.doesNotMatch(sent, /### Aufgabe 2\n/);
    assert.equal(sent.includes(tasks[1].text), false, "Aufgabe ohne Auftrag an die KI geht nicht an die KI");
    // Format: erst Aufgaben, Material und Aufträge der Lehrkraft, dann die Antworten, zuletzt der Schlusssatz
    assert.ok(sent.includes("Aufgaben, Material und Aufträge der Lehrkraft (Nummern: 1, 3):\n\n### Aufgabe 1\n"), sent);
    assert.ok(sent.includes("Auftrag der Lehrkraft für das Feedback:\n<<<\n" + tasks[2].solution + "\n>>>\n\nAntworten der Schülerin bzw. des Schülers:\n\n### Antwort zu Aufgabe 1\n"), sent);
    assert.ok(sent.endsWith("\n\nGib für jede der 2 Aufgaben (Nummern: 1, 3) dein Feedback als JSON zurück."), sent);
    assert.equal(/Musterlösung der Lehrkraft|Kernpunkte/.test(mock.state.requests[0].messages[1].content), false);
    assert.match(mock.state.requests[0].messages[0].content, /"gut":\[.*"tipps":\[/);
    assert.deepEqual(mock.state.requests[0].response_format, { type: "json_object" });
    expectErr(await api("POST", "/api/feedback", { code, answers: ["a"] }), 400, "bad_answers"); feedbackCount++;
    expectErr(await api("POST", "/api/feedback", { code, answers: ["a".repeat(8001), "", ""] }), 400, "too_long"); feedbackCount++;
    expectErr(await api("POST", "/api/feedback", { code, answers: [1, "", ""] }), 400, "bad_answers"); feedbackCount++;
    expectErr(await api("POST", "/api/feedback", { code: "AAAAA2", answers: [] }), 404, "not_found"); feedbackCount++;
    r = await api("POST", "/api/feedback", { code: otherCode, answers: ["egal"] }); feedbackCount++;
    assert.deepEqual(r.json, { ok: true, results: [{ covered: [], missing: [], note: "Zu dieser Aufgabe gibt es kein KI-Feedback." }], aiGenerated: false });
    // zweite Rückmeldung nach der Abgabe: nur die geänderte Aufgabe 3 geht an die KI (only), die übrigen Ergebnisse sind null
    mock.reset();
    const only3 = ["", "", "Wasser verdunstet durch Wärme."];
    r = await api("POST", "/api/feedback", { code: display, answers: only3, only: [3] }); feedbackCount++;
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json.results, [null, null, expectedResults(tasks, only3)[2]]);
    assert.equal(mock.state.requests.length, 1);
    const sent3 = mock.state.requests[0].messages[1].content;
    assert.ok(sent3.startsWith("Aufgaben, Material und Aufträge der Lehrkraft (Nummern: 3):\n\n### Aufgabe 3\n"), sent3);
    assert.equal(sent3.includes(tasks[0].text) || /### (Antwort zu )?Aufgabe 1\n/.test(sent3), false, "Aufgabe 1 geht nicht mit");
    expectErr(await api("POST", "/api/feedback", { code, answers: ["a", "", ""], only: [4] }), 400, "bad_answers"); feedbackCount++;
    expectErr(await api("POST", "/api/feedback", { code, answers: ["a", "", ""], only: [] }), 400, "bad_answers"); feedbackCount++;
    assert.equal(mock.state.requests.length, 1);
    ok("Feedback: eine KI-Anfrage im neuen Format (Auftrag der Lehrkraft), gut/tipps wie erwartet, Aufgabe ohne Auftrag mit Hinweis; Längenprüfungen; zweite Rückmeldung nur für die gewählten Aufgaben (only)");

    mock.setMode("fenced");
    r = await api("POST", "/api/feedback", { code, answers }); feedbackCount++;
    assert.deepEqual(r.json.results, expectedResults(tasks, answers));
    mock.setMode("badjson");
    r = await api("POST", "/api/feedback", { code, answers }); feedbackCount++;
    expectErr(r, 502, "ai_error");
    assert.equal(r.json.aiCode, "BAD_JSON");
    mock.setMode("429");
    r = await api("POST", "/api/feedback", { code, answers }); feedbackCount++;
    expectErr(r, 502, "ai_error", "Das KI-Kontingent für heute ist aufgebraucht. Morgen geht es wieder.");   // Tageslimit eines Anbieters mit Schlüssel: 502 (nur Workers AI: 503 ai_quota)
    mock.setMode("ok");
    r = await api("POST", "/api/feedback", { code, answers }); feedbackCount++;
    assert.equal(r.status, 200, "erschöpfte Modelle bleiben als letzte Wahl nutzbar: " + r.text);
    ok("Feedback robust: Code-Zaun/<think> ok; kein JSON / Tageslimit → 502 ai_error mit Schülertext");

    step = "Checkliste";
    {
      let r;   // eigenes r: der Schritt „Abgabe“ braucht noch das Ergebnis des letzten Feedbacks
      const ckTasks = [
        { text: "Nenne Ursachen des Klimawandels.", solution: "- Abholzung\n- Verkehr\n- Industrie" },
        { text: "Was denkst du?", solution: "" },
        { text: "Fülle aus.", solution: "Weizen. Reis.", answer: { type: "table", columns: ["Produkt", "Land"], rows: 2 } },
      ];
      r = await api("POST", "/api/teacher/sheets", { title: "Smoke: Checkliste", tasks: ckTasks }, { auth });
      assert.equal(r.status, 200, r.text);
      const ck = r.json.code, ckPath = "/api/teacher/sheets/" + ck + "/checklist";
      expectErr(await api("GET", ckPath), 401, "unauthorized");
      expectErr(await api("POST", ckPath, {}), 401, "unauthorized");
      expectErr(await api("PUT", ckPath, { tasks: [] }), 401, "unauthorized");
      r = await api("GET", ckPath, undefined, { auth });
      assert.deepEqual(r.json, { ok: true, checklist: null, aiFeedback: true, aiReady: true });
      expectErr(await api("GET", "/api/sheet/" + ck + "/checklist"), 404, "no_checklist", "Zu diesem Feibeitsblatt gibt es noch keine Checkliste.");   // zählt nicht als Fehlgriff
      mock.reset();
      r = await api("POST", ckPath, undefined, { auth });
      assert.equal(r.status, 200, r.text);
      assert.deepEqual(r.json, { ok: true, generated: true, final: null,
        draft: { v: 1, ai: true, tasks: [{ n: 1, points: expectedChecklist(ckTasks[0].solution) }, { n: 2, points: [] }, { n: 3, points: expectedChecklist(ckTasks[2].solution) }] } });
      assert.equal(mock.state.requests.length, 1);
      const ckPrompt = mock.state.requests[0].messages.map((m) => m.content).join("\n");
      assert.ok(ckPrompt.includes("Die Antwort ist eine Tabelle mit den Spalten:\n<<<\nProdukt | Land\n>>>"), ckPrompt);
      assert.equal(/Was denkst du|Antwort zu Aufgabe|Antworten der Schülerin/.test(ckPrompt), false, "nur Aufgaben mit Auftrag, nie Antworten");
      r = await api("POST", ckPath, {}, { auth });
      assert.equal(r.json.generated, false); assert.equal(mock.state.requests.length, 1, "einmal: ohne force kein zweiter KI-Aufruf");
      expectErr(await api("PUT", ckPath, { ai: true, tasks: [{ n: 1, points: Array.from({ length: 9 }, (_, i) => "Punkt " + i) }] }, { auth }), 400, "bad_request", "Aufgabe 1: höchstens 8 Punkte.");
      const points = ["Du nennst Abholzung, Verkehr und Industrie.", "Du erklärst eine Ursache genauer."];
      r = await api("PUT", ckPath, { ai: true, tasks: [{ n: 1, points }] }, { auth });
      assert.equal(r.status, 200, r.text); assert.deepEqual(r.json.final.tasks.map((t) => t.points), [points, [], []]);
      r = await api("GET", "/api/sheet/" + ck.toLowerCase() + "/checklist");
      assert.equal(r.status, 200, r.text); assert.equal(r.headers.get("cache-control"), "no-store");
      assert.deepEqual(r.json, { ok: true, code: ck, title: "Smoke: Checkliste", ai: true, tasks: ckTasks.map((t, i) => ({ n: i + 1, text: t.text, points: i === 0 ? points : [] })) });
      assert.equal(/Du beachtest|Weizen|solution|draft/.test(r.text), false, "nie Entwurf oder Auftrag an die KI");
      r = await api("POST", ckPath, { force: true }, { auth });
      assert.equal(r.status, 200, r.text); assert.equal(r.json.generated, true); assert.deepEqual(r.json.final.tasks[0].points, points);
      assert.deepEqual((await api("GET", "/api/sheet/" + ck + "/checklist")).json.tasks[0].points, points, "neuer Vorschlag ersetzt die gespeicherte Checkliste nicht");
      r = await api("GET", "/api/sheet/ZZZZZ9/checklist"); misses++; expectErr(r, 404, "not_found", UNKNOWN_CODE_MSG);
      assert.equal((await api("DELETE", "/api/teacher/sheets/" + ck, undefined, { auth })).status, 200);
      r = await api("GET", "/api/sheet/" + ck + "/checklist"); misses++; expectErr(r, 404, "not_found", UNKNOWN_CODE_MSG);
      expectErr(await api("GET", ckPath, undefined, { auth }), 404, "not_found");
    }
    ok("Checkliste: Vorschlag der KI einmal (nur Aufgaben mit Auftrag, keine Antworten), Speichern mit Grenzen, öffentlich nur die gespeicherte, force lässt sie stehen, mit dem Blatt gelöscht");

    step = "Escape-Room-Blatt";
    {
      let r;   // eigenes r (siehe Checkliste)
      const esc = { id: "smoke-escape", name: "Smoke-Raum" }, escTasks = [{ text: "Erkläre Kayas Dossier.", solution: "- Fakten statt Meinung" }];
      expectErr(await api("POST", "/api/teacher/sheets", { title: "x", tasks: escTasks, escape: { id: "Kein Raum!", name: "X" } }, { auth }), 400, "bad_request");
      expectErr(await api("POST", "/api/teacher/sheets", { title: "x", tasks: escTasks, escape: { id: "smoke-escape", name: " " } }, { auth }), 400, "bad_request");
      r = await api("POST", "/api/teacher/sheets", { title: "Smoke: Finale", tasks: escTasks, escape: { ...esc, id: " SMOKE-escape " } }, { auth });
      assert.equal(r.status, 200, r.text); assert.deepEqual(r.json.escape, esc);
      const ec = r.json.code;
      r = await api("GET", "/api/sheet/" + ec);
      assert.equal(r.status, 200, r.text); assert.deepEqual(r.json.sheet.escape, esc);
      assert.equal((await api("GET", "/api/sheet/" + code)).json.sheet.escape, null);   // normale Blätter: null
      r = await api("GET", "/api/teacher/sheets", undefined, { auth });
      assert.deepEqual(r.json.sheets.find((x) => x.code === ec).escape, esc);
      assert.equal(r.json.sheets.find((x) => x.code === code).escape, null);
      assert.deepEqual((await api("GET", "/api/teacher/sheets/" + ec, undefined, { auth })).json.sheet.escape, esc);
      // kein analoges Arbeitsblatt
      expectErr(await api("POST", "/api/teacher/sheets/" + ec + "/checklist", {}, { auth }), 400, "escape_sheet");
      expectErr(await api("PUT", "/api/teacher/sheets/" + ec + "/checklist", { ai: false, tasks: [{ n: 1, points: ["Du nennst Fakten."] }] }, { auth }), 400, "escape_sheet");
      // Abgabe mit Daten aus dem Escape-Room: nur im verschlüsselten Umschlag (der Server speichert nur den Umschlag)
      const escPayload = { v: 1, sheetCode: ec, sheetTitle: "Smoke: Finale", person: { vorname: "Xav", nachname: "Qu", geburtsdatum: "--05-04", klasse: "10b" },
        answers: [{ first: "Fakten-Marker", final: "Fakten-Marker" }], feedback: null, noAi: "declined", submittedAt: new Date().toISOString(),
        escape: { room: esc, word: "GLOBUS", completedAt: new Date().toISOString(), stations: [{ label: "Station 1 · Test", attempts: 2, errors: [{ item: "Escape-Fehler-Marker", wrong: "a", right: "b" }] }], resumes: [], check: "ok" } };
      r = await api("POST", "/api/submit", { code: ec, envelope: await makeEnvelope(T.publicKey, escPayload) }); submitCount++;
      assert.equal(r.status, 200, r.text);
      r = await api("GET", "/api/teacher/sheets/" + ec + "/submissions", undefined, { auth });
      assert.equal(r.json.submissions.length, 1);
      assert.equal(/Escape-Fehler-Marker|GLOBUS|Fakten-Marker/.test(r.text), false, "nur der Umschlag");
      assert.deepEqual(await openEnvelope(privateKey, r.json.submissions[0].envelope), escPayload);
      await sleep(500);
      for (const f of await filesUnder(STATE)) {
        const buf = await readFile(f).catch(() => null); if (!buf) continue;
        for (const needle of ["Escape-Fehler-Marker", "Fakten-Marker", '"stations"']) assert.equal(buf.includes(Buffer.from(needle)), false, needle + " im Klartext in " + f);
      }
      assert.equal((await api("DELETE", "/api/teacher/sheets/" + ec, undefined, { auth })).status, 200);
    }
    ok("Escape-Room-Blatt: escape {id, name} beim Anlegen geprüft, öffentlich und für die Lehrkraft geliefert (normale Blätter null), kein analoges Arbeitsblatt, Daten aus dem Raum nur im verschlüsselten Umschlag");

    step = "Abgabe";
    const sheetPub = (await api("GET", "/api/sheet/" + code)).json.sheet;
    const payload = { v: 1, sheetCode: code, sheetTitle: sheetPub.title, person: { vorname: "Xav", nachname: "Qu", geburtsdatum: "2011-05-04", klasse: "8b" },
      answers: [{ first: answers[0], final: answers[0] + " Ergänzt-Marker" }, { first: "", final: "Die Pause." }, { first: "", final: "Wärme" }],
      feedback: r.json.results, feedbackAt: new Date().toISOString(), submittedAt: new Date().toISOString() };
    const envelope = await makeEnvelope(sheetPub.publicKey, payload);
    expectErr(await api("POST", "/api/submit", { code, envelope: { ...envelope, v: 2 } }), 400, "bad_envelope");   // ungültige Anfragen zählen nicht
    expectErr(await api("POST", "/api/submit", { code, envelope: { ...envelope, iv: "kein base64!" } }), 400, "bad_envelope");
    expectErr(await api("POST", "/api/submit", { code, envelope: { ...envelope, ct: "A".repeat(420 * 1024) } }), 413, "too_large");
    expectErr(await api("POST", "/api/submit", { code: "AAAAA2", envelope }), 404, "not_found");
    r = await api("POST", "/api/submit", { code: display, envelope }); submitCount++;
    assert.equal(r.status, 200, r.text);
    assert.equal(typeof r.json.id, "number"); assert.ok(Math.abs(r.json.receivedAt - Date.now()) < 60000);
    assert.equal(r.json.retentionDays, 30);   // Löschfrist für die Bestätigungsseite
    r = await api("GET", "/api/teacher/sheets/" + code + "/submissions", undefined, { auth });
    assert.equal(r.json.submissions.length, 1);
    assert.deepEqual(await openEnvelope(privateKey, r.json.submissions[0].envelope), payload);
    r = await api("GET", "/api/teacher/sheets", undefined, { auth });
    assert.equal(r.json.sheets.find((s) => s.code === code).submissionCount, 1);
    ok("Abgabe: Umschlag-Prüfungen; gespeicherter Umschlag mit dem privaten Schlüssel entschlüsselt = payload");

    step = "Erstversuch";
    const attempt = "0123456789abcdef";
    const firstPayload = { ...payload, stage: "first", answers: payload.answers.map((a) => ({ first: a.final, final: null })), submittedAt: null };
    const envFirst = await makeEnvelope(sheetPub.publicKey, firstPayload);
    expectErr(await api("POST", "/api/submit", { code, envelope: envFirst, stage: "first" }), 400, "bad_request");          // Kennung fehlt
    expectErr(await api("POST", "/api/submit", { code, envelope: envFirst, stage: "first", attempt: "nein" }), 400, "bad_request");
    r = await api("POST", "/api/submit", { code, envelope: envFirst, stage: "first", attempt }); submitCount++;
    assert.equal(r.status, 200, r.text); const firstId = r.json.id;
    r = await api("GET", "/api/teacher/sheets/" + code + "/submissions", undefined, { auth });
    assert.deepEqual(r.json.submissions.map((s) => s.stage), ["final", "first"]);
    r = await api("GET", "/api/teacher/sheets", undefined, { auth });
    assert.deepEqual([r.json.sheets[0].submissionCount, r.json.sheets[0].firstCount], [1, 1]);
    r = await api("POST", "/api/submit", { code, envelope, stage: "final", attempt }); submitCount++;   // Abgabe derselben Bearbeitung
    assert.equal(r.status, 200, r.text); assert.equal(r.json.id, firstId); assert.equal(r.json.replaced, "first");
    r = await api("POST", "/api/submit", { code, envelope: envFirst, stage: "first", attempt }); submitCount++;   // verspäteter Erstversuch
    assert.equal(r.status, 200, r.text); assert.equal(r.json.kept, true);
    r = await api("GET", "/api/teacher/sheets/" + code + "/submissions", undefined, { auth });
    assert.deepEqual(r.json.submissions.map((s) => s.stage), ["final", "final"]);
    assert.deepEqual(await openEnvelope(privateKey, r.json.submissions[1].envelope), payload);
    r = await api("GET", "/api/teacher/sheets", undefined, { auth });
    assert.deepEqual([r.json.sheets[0].submissionCount, r.json.sheets[0].firstCount], [2, 0]);
    ok("Erstversuch: stage first mit Kennung; die Abgabe derselben Bearbeitung ersetzt ihn; ein späterer Erstversuch bleibt wirkungslos");

    step = "Datenbank ohne Klartext";
    await sleep(500);
    let scanned = 0;
    const control = { "Sauerstoff entsteht als Nebenprodukt": 0, '"apiKeyEnc"': 0, '"ek":"': 0 };   // Gegenprobe: Scan sieht die DB
    for (const f of await filesUnder(STATE)) {
      const buf = await readFile(f).catch(() => null); if (!buf) continue;
      scanned++;
      for (const needle of ["Zebrafink-Marker", "Ergänzt-Marker", '"geburtsdatum"', '"apiKey":"test"', '"apiKey":']) {
        assert.equal(buf.includes(Buffer.from(needle)), false, needle + " im Klartext in " + f);
      }
      for (const needle of Object.keys(control)) if (buf.includes(Buffer.from(needle))) control[needle]++;
    }
    assert.ok(scanned > 0, "keine D1-Dateien gefunden");
    for (const [needle, n] of Object.entries(control)) assert.ok(n > 0, "Gegenprobe fehlt: " + needle);
    ok("D1-Dateien (" + scanned + ") enthalten weder Antworten, Personendaten noch den API-Schlüssel im Klartext");

    step = "Passwort ändern";
    const kdf2 = { salt: b64(crypto.getRandomValues(new Uint8Array(16))), iterations: 600000 };
    const T2 = await deriveTeacherKeys("Neues Passwort 2026!", kdf2);
    r = await api("POST", "/api/teacher/password", { newAuthKey: T2.authKey, kdf: kdf2, encPrivateKey: await sealPrivateKey(T2.encKey, T.pkcs8) }, { auth });
    assert.deepEqual(r.json, { ok: true }, r.text);
    expectErr(await api("POST", "/api/teacher/login", undefined, { auth }), 401, "unauthorized"); authFails++;
    auth = T2.authKey;
    r = await api("POST", "/api/teacher/login", undefined, { auth });
    assert.equal(r.json.publicKey, T.publicKey);
    privateKey = await openPrivateKey(T2.encKey, r.json.encPrivateKey);
    r = await api("GET", "/api/teacher/sheets/" + code + "/submissions", undefined, { auth });
    assert.deepEqual(await openEnvelope(privateKey, r.json.submissions[0].envelope), payload);
    ok("Passwort ändern: altes ungültig, neues gültig, Abgaben weiter lesbar");

    step = "Löschen";
    // ein einzelner Eintrag (Löschwunsch einer Person): nur diese id; ungültige ids → 400, nichts gelöscht
    const subIds = r.json.submissions.map((x) => x.id);
    assert.equal(subIds.length, 2);
    expectErr(await api("DELETE", "/api/teacher/sheets/" + code + "/submissions", { ids: [] }, { auth }), 400, "bad_request");
    r = await api("DELETE", "/api/teacher/sheets/" + code + "/submissions", { ids: [subIds[0]] }, { auth });
    assert.deepEqual(r.json, { ok: true, deleted: 1 }, r.text);
    r = await api("GET", "/api/teacher/sheets/" + code + "/submissions", undefined, { auth });
    assert.deepEqual(r.json.submissions.map((x) => x.id), [subIds[1]]);
    r = await api("DELETE", "/api/teacher/sheets/" + code + "/submissions", undefined, { auth });
    assert.deepEqual(r.json, { ok: true, deleted: 1 });
    r = await api("GET", "/api/teacher/sheets/" + code + "/submissions", undefined, { auth });
    assert.deepEqual(r.json, { ok: true, submissions: [], next: null });
    r = await api("POST", "/api/submit", { code, envelope }); submitCount++;
    assert.equal(r.status, 200);
    r = await api("DELETE", "/api/teacher/sheets/" + code, undefined, { auth });
    assert.equal(r.json.ok, true); assert.equal(r.json.deletedSubmissions, 1);
    expectErr(await api("GET", "/api/teacher/sheets/" + code, undefined, { auth }), 404, "not_found");
    r = await api("GET", "/api/sheet/" + code + "/images/" + img1.id); misses++; expectErr(r, 404, "not_found");   // Bilder mit dem Blatt gelöscht
    r = await api("GET", "/api/sheet/" + code + "/files/" + fileId); misses++; expectErr(r, 404, "not_found");   // PDF-Dateien mit dem Blatt gelöscht
    expectErr(await api("DELETE", "/api/teacher/sheets/" + code, undefined, { auth }), 404, "not_found");
    r = await api("GET", "/api/sheet/" + code); misses++;
    expectErr(r, 404, "not_found");
    ok("Abgaben löschen (einzeln per ids und alle, {deleted:n}), Blatt samt Abgaben löschen, danach 404");

    step = "Datenschutz und Löschfrist";
    r = await api("GET", "/api/teacher/privacy", undefined, { auth });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json.privacy, { retentionDays: 30, auto: true });
    expectErr(await api("PUT", "/api/teacher/privacy", { retentionDays: 3 }, { auth }), 400, "bad_request");
    expectErr(await api("PUT", "/api/teacher/privacy", { retentionDays: 7 }), 401, "unauthorized");   // ohne Anmeldung (zählt nicht als Fehlversuch)
    // eine ältere, noch gecachte Seite schickt Schulangaben mit: gespeichert wird nur die Frist
    r = await api("PUT", "/api/teacher/privacy", { school: { name: "Smoke-Schule" }, retentionDays: 7 }, { auth });
    assert.equal(r.status, 200, r.text); assert.deepEqual(r.json.privacy, { retentionDays: 7, auto: false }); assert.equal(r.json.deleted, 0);
    assert.equal(r.text.includes("Smoke-Schule"), false);
    // öffentlich für die Seite „Impressum & Datenschutz“: Frist und KI-Empfänger wie beim Blatt, nicht gecacht
    r = await api("GET", "/api/privacy");
    assert.equal(r.status, 200, r.text); assert.equal(r.headers.get("cache-control"), "no-store");
    assert.deepEqual(r.json, { ok: true, retentionDays: 7, aiRecipients: [{ id: "custom:127.0.0.1:" + MOCK_PORT, label: "127.0.0.1:" + MOCK_PORT + " (Betreiber und Sitz: vom Betreiber dieser Seite zu prüfen)",
      transfer: "vom Betreiber dieser Seite beim Anbieter zu prüfen" }] });
    // eigenes Blatt: der Zeitplan (scheduled) löscht nach der Frist – lokal ausgelöst über /cdn-cgi/local/scheduled (time = geplanter
    // Zeitpunkt). Ein Lauf in der Zukunft räumt auch alle Sperr-Zähler ab – deshalb erst ganz am Ende (Schritt „Zeitplan“).
    const cronSheet = await api("POST", "/api/teacher/sheets", { title: "Löschfrist", tasks: [{ text: "Frage" }] }, { auth });
    assert.equal(cronSheet.status, 200, cronSheet.text);
    assert.deepEqual((await api("GET", "/api/sheet/" + cronSheet.json.code)).json.sheet.privacy, { retentionDays: 7 });
    const cronEnv = await makeEnvelope(T.publicKey, { v: 1, sheetCode: cronSheet.json.code, person: { vorname: "Lö", nachname: "Fr", geburtsdatum: "--01-01", klasse: "5a" }, answers: [{ first: "x", final: "x" }] });
    r = await api("POST", "/api/submit", { code: cronSheet.json.code, envelope: cronEnv }); submitCount++;
    assert.equal(r.status, 200, r.text); assert.equal(r.json.retentionDays, 7);
    const cron = async (time) => {
      const res = await fetch(BASE + "/cdn-cgi/local/scheduled?cron=" + encodeURIComponent("17 2 * * *") + "&time=" + time + "&format=json");
      const body = await res.text();
      assert.equal(res.status, 200, "scheduled: " + body.slice(0, 300));
      assert.match(body, /"outcome":"ok"/);
    };
    const cronSubs = async () => (await api("GET", "/api/teacher/sheets/" + cronSheet.json.code + "/submissions", undefined, { auth })).json.submissions.length;
    await cron(Date.now());
    assert.equal(await cronSubs(), 1, "noch innerhalb der Frist");
    ok("Löschfrist: GET/PUT (Frist 7–365, Schulangaben ignoriert), öffentlich mit dem Blatt, über /api/privacy und mit der Abgabe; Zeitplan läuft (innerhalb der Frist bleibt alles)");

    step = "KI-Schlüssel abgelehnt";
    r = await api("PUT", "/api/teacher/ai", { provider: "custom", model: "", baseUrl: mock.url, apiKey: "bad" }, { auth });
    assert.equal(r.status, 200); assert.match(r.json.warning, /abgelehnt/);
    r = await api("POST", "/api/teacher/ai/test", undefined, { auth });
    expectErr(r, 502, "ai_error"); assert.match(r.json.error, /abgelehnt \(HTTP 401/);
    ok("abgelehnter Schlüssel: Speichern mit Warnung, Test → 502 mit ausführlicher Meldung für die Lehrkraft");

    step = "Sperren";
    for (; doorFails < 10; doorFails++) expectErr(await api("POST", "/api/teacher/door", { doorCode: "1234" }), 403, "wrong_code");
    r = await api("POST", "/api/teacher/door", { doorCode: "1234" });
    expectErr(r, 429, "rate_limited"); assert.ok(r.json.retryAfter > 600 && r.json.retryAfter <= 900); assert.equal(r.headers.get("retry-after"), String(r.json.retryAfter));
    r = await api("POST", "/api/teacher/door", { doorCode: "1104" });
    assert.equal(r.status, 200, "der richtige Türcode geht trotz Sperre: " + r.text);
    ok("Türcode: nach 10 Fehlversuchen 429 für falsche Codes (Retry-After gesetzt); der richtige Code geht weiter");
    for (; authFails < 10; authFails++) expectErr(await api("POST", "/api/teacher/login", undefined, { auth: wrong.authKey }), 401, "unauthorized");
    expectErr(await api("POST", "/api/teacher/login", undefined, { auth: wrong.authKey }), 429, "rate_limited");
    r = await api("POST", "/api/teacher/login", undefined, { auth });
    assert.equal(r.status, 200, "das richtige Passwort geht trotz Sperre: " + r.text);
    ok("Passwort: nach 10 Fehlversuchen 429 für falsche Passwörter; das richtige geht weiter");
    for (; misses < 30; misses++) expectErr(await api("GET", "/api/sheet/QQQQQ" + "23456789"[misses % 8]), 404, "not_found");
    expectErr(await api("GET", "/api/sheet/QQQQQ2"), 429, "rate_limited");
    r = await api("GET", "/api/sheet/" + otherCode);
    assert.equal(r.status, 200, "gültige Codes öffnen trotz Sperre: " + r.text);
    ok("unbekannte Codes: nach 30 Fehlgriffen 429; gültige Codes öffnen weiter");
    // Abgaben: jede gültige Abgabe und jeder Erstversuch zählt je IP (240/h); unbekannte Codes zählen nicht
    const otherPub = r.json.sheet.publicKey;
    const env2 = await makeEnvelope(otherPub, { v: 1, sheetCode: otherCode, person: { vorname: "Tes", nachname: "Tt", geburtsdatum: "2010-01-01", klasse: "5a" }, answers: [{ first: "", final: "x" }] });
    for (; submitCount < 240; submitCount++) { r = await api("POST", "/api/submit", { code: otherCode, envelope: env2 }); assert.equal(r.status, 200, r.text); }
    expectErr(await api("POST", "/api/submit", { code: otherCode, envelope: env2 }), 429, "rate_limited");
    expectErr(await api("POST", "/api/feedback", { code: "AAAAA2", answers: [] }), 404, "not_found");
    ok("Abgabe: die 241. gültige Abgabe je IP → 429 (unbekannte Codes zählen nicht)");

    step = "Zeitplan";
    await cron(Date.now() + 8 * 86400e3);   // acht Tage später: nach der Frist von 7 Tagen
    assert.equal(await cronSubs(), 0, "nach der Frist gelöscht");
    assert.equal((await api("GET", "/api/sheet/" + cronSheet.json.code)).status, 200);   // das Blatt selbst bleibt
    assert.equal((await api("POST", "/api/submit", { code: otherCode, envelope: env2 })).status, 200);   // abgelaufene Zähler sind mit aufgeräumt
    assert.equal((await api("DELETE", "/api/teacher/sheets/" + cronSheet.json.code, undefined, { auth })).status, 200);
    ok("Zeitplan (Cron 17 2 * * *, lokal per /cdn-cgi/local/scheduled): Abgaben nach der Frist gelöscht, das Blatt bleibt, abgelaufene Zähler weg");

    console.log("\nSmoke-Test bestanden.");
  } catch (e) {
    console.error("\n✗ Schritt „" + step + "“ fehlgeschlagen:\n", e);
    if (log) console.error("\n--- wrangler (Ende) ---\n" + log.slice(-2500));
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
