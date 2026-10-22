// Worker-Test ohne wrangler: worker/index.js im Prozess, D1 als node:sqlite-Nachbau, Mock-KI auf freiem Port.
// Prüft API-Vertrag, Verschlüsselung at rest, Schlüsselwechsel, IP-getrennte Sperren und ≤ 50 D1-Abfragen je Request.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import worker from "../../worker/index.js";
import { startMockAI, expectedResults, mockAIBinding } from "../mock-ai.mjs";
import { RATE, LIMITS, cleanFileName, sha256Hex, bucketOf } from "../../worker/lib.js";
import { nextUtcMidnight, TTL } from "../../worker/ai.js";
import { makePng } from "../png.mjs";
import { createTeacher, makeEnvelope, openEnvelope, openPrivateKey, deriveTeacherKeys, b64 } from "../smoke.mjs";

/* ---------- D1-Nachbau (gleiche Aufrufform wie die Workers-API) ---------- */
function makeD1() {
  const db = new DatabaseSync(":memory:");
  const d1 = { db, queries: 0, fail: null };
  const exec = (sql, args) => {
    d1.queries++;
    if (d1.fail) throw new Error(d1.fail);
    const st = db.prepare(sql);
    const isSelect = /^\s*(select|with|pragma)\b/i.test(sql);
    if (isSelect || /\breturning\b/i.test(sql)) {
      const rows = st.all(...args).map((r) => ({ ...r }));
      return { results: rows, success: true, meta: { changes: isSelect ? 0 : rows.length } };
    }
    const i = st.run(...args);
    return { results: [], success: true, meta: { changes: Number(i.changes), last_row_id: Number(i.lastInsertRowid) } };
  };
  const stmt = (sql, args = []) => ({
    sql, args, bind: (...a) => stmt(sql, a),
    first: async (col) => { const r = exec(sql, args).results[0] ?? null; return col ? (r ? r[col] : null) : r; },
    all: async () => exec(sql, args), run: async () => exec(sql, args),
  });
  d1.prepare = (sql) => stmt(sql);
  d1.batch = async (list) => {
    db.exec("BEGIN");
    try { const out = list.map((s) => exec(s.sql, s.args)); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; }
  };
  return d1;
}

const d1 = makeD1();
const SECRET = b64(crypto.getRandomValues(new Uint8Array(32)));
let assetsCalls = 0;
const ASSETS = { fetch: async () => { assetsCalls++; return new Response("<!doctype html><title>Feibeitsblatt</title>", { headers: { "content-type": "text/html" } }); } };
const ENV = { DB: d1, ASSETS, SETTINGS_SECRET: SECRET };
let mock, maxQueries = 0;

async function call(method, path, { body, auth, ip = "198.51.100.1", env = ENV, raw, nocount } = {}) {
  const headers = { "CF-Connecting-IP": ip };
  if (body !== undefined || raw !== undefined) headers["content-type"] = "application/json";
  if (auth) headers.authorization = "Bearer " + auth;
  const req = new Request("https://feibeitsblatt.example.workers.dev" + path,
    { method, headers, body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body) });
  d1.queries = 0;
  const waits = [];
  const res = await worker.fetch(req, env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  const text = await res.text();
  if (!nocount) {   // nocount: parallele Aufrufe teilen sich den Zähler (nur je Aufruf aussagekräftig)
    maxQueries = Math.max(maxQueries, d1.queries);
    assert.ok(d1.queries <= 50, path + ": " + d1.queries + " D1-Abfragen");
  }
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, text, json, queries: d1.queries };
}
const settingsRow = (key) => { const r = d1.db.prepare("SELECT value FROM settings WHERE key=?").get(key); return r ? JSON.parse(r.value) : null; };

let T, auth, code;
const PASSWORD = "Unit-Test-Passwort 42";
const tasks = [
  { text: "Erkläre die Photosynthese.", solution: "- Photosynthese braucht Licht\n- Chloroplasten sind beteiligt\n- Sauerstoff entsteht" },
  { text: "Deine Meinung?", solution: "" },
];

before(async () => { mock = await startMockAI({ port: 0 }); T = await createTeacher(PASSWORD, 100000); auth = T.authKey; });
after(async () => { await mock.close(); });

test("static pages go to ASSETS, /api/health works without D1", async () => {
  const res = await worker.fetch(new Request("https://x.workers.dev/"), ENV, { waitUntil() {} });
  assert.equal(res.status, 200); assert.equal(assetsCalls, 1);
  await worker.fetch(new Request("https://x.workers.dev/apifoo"), ENV, { waitUntil() {} });
  assert.equal(assetsCalls, 2);
  const h = await call("GET", "/api/health");
  assert.deepEqual(h.json, { ok: true, service: "feibeitsblatt" }); assert.equal(h.queries, 0);
  const n = await call("GET", "/api");
  assert.equal(n.status, 404); assert.equal(n.json.code, "not_found");
});

test("setup, door, login", async () => {
  let r = await call("POST", "/api/teacher/door", { body: { doorCode: "1104" } });
  assert.deepEqual(r.json, { ok: true, setup: false, kdf: null });
  r = await call("POST", "/api/teacher/setup", { body: { doorCode: 1104, authKey: auth, kdf: T.kdf, publicKey: T.publicKey, encPrivateKey: T.encPrivateKey } });
  assert.deepEqual(r.json, { ok: true });
  const stored = settingsRow("teacher");
  assert.equal(stored.authHash.length, 64); assert.equal(JSON.stringify(stored).includes(auth), false, "authKey nie im Klartext");
  r = await call("POST", "/api/teacher/door", { body: { doorCode: "1104" } });
  assert.deepEqual(r.json.kdf, T.kdf);
  const k = await deriveTeacherKeys(PASSWORD, r.json.kdf);
  r = await call("POST", "/api/teacher/login", { auth: k.authKey });
  assert.equal(r.status, 200);
  await openPrivateKey(k.encKey, r.json.encPrivateKey);
  r = await call("POST", "/api/teacher/login", { auth: "kein-base64" });
  assert.equal(r.status, 401); assert.equal(r.json.error, "Passwort falsch.");
  r = await call("POST", "/api/teacher/login", { auth: b64(new Uint8Array(32)) });
  assert.equal(r.status, 401);
});

test("custom door code via env.TEACHER_DOOR_CODE", async () => {
  const env = { ...ENV, TEACHER_DOOR_CODE: "7777" };
  assert.equal((await call("POST", "/api/teacher/door", { body: { doorCode: "1104" }, env, ip: "198.51.100.77" })).status, 403);
  assert.equal((await call("POST", "/api/teacher/door", { body: { doorCode: "7777" }, env, ip: "198.51.100.77" })).json.setup, true);
});

test("AI settings: preselected Workers AI is not active until saved; custom key encrypted at rest, key never returned", async () => {
  let r = await call("GET", "/api/teacher/ai", { auth });
  assert.deepEqual({ p: r.json.provider, k: r.json.hasKey, h: r.json.keyHint, l: r.json.label, ready: r.json.ready, saved: r.json.saved, kl: r.json.keyless },
    { p: "cloudflare", k: false, h: "", l: "Cloudflare Workers AI", ready: false, saved: false, kl: true });
  assert.equal(r.json.keyError, "Noch nicht gespeichert – bitte Anbieter wählen und „Speichern“ klicken.");
  assert.equal(r.json.quotaUntil, null); assert.deepEqual(r.json.usage, { day: new Date().toISOString().slice(0, 10), requests: 0, neurons: 0, limit: 10000 });
  r = await call("PUT", "/api/teacher/ai", { auth, body: { provider: "custom", model: "", baseUrl: mock.url, apiKey: "sk-unit-SECRET-1234" } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.keyHint, "…1234"); assert.equal(r.text.includes("SECRET"), false);
  const s = settingsRow("ai");
  assert.equal(s.apiKey, undefined); assert.ok(s.apiKeyEnc.iv && s.apiKeyEnc.ct);
  assert.equal(JSON.stringify(s).includes("SECRET"), false);
  assert.deepEqual(s.fallbacks, ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "qwen/qwen3-32b"]);
  r = await call("POST", "/api/teacher/ai/test", { auth });
  assert.equal(r.json.sample, "Verbindung steht.");
});

test("sheets: create, list, public view never contains solutions", async () => {
  let r = await call("POST", "/api/teacher/sheets", { auth, body: { title: "Bio", tasks } });
  assert.equal(r.status, 200, r.text);
  code = r.json.code;
  r = await call("GET", "/api/sheet/" + code.slice(0, 3).toLowerCase() + "-" + code.slice(3));
  assert.deepEqual(r.json.sheet, { code, title: "Bio", tasks: tasks.map((t) => ({ text: t.text, textFmt: [], material: [], images: [], files: [], answer: { type: "text" } })), publicKey: T.publicKey, aiFeedback: true, aiProvider: "127.0.0.1:" + mock.port,
    aiRecipients: [{ id: "custom:127.0.0.1:" + mock.port, label: "127.0.0.1:" + mock.port + " (Betreiber und Sitz: von der Lehrkraft zu prüfen)" }] });
  assert.equal(/Chloroplasten|Sauerstoff|solution/.test(r.text), false);
  r = await call("GET", "/api/teacher/sheets", { auth });
  assert.deepEqual(r.json.sheets.map((s) => [s.code, s.title, s.taskCount, s.submissionCount]), [[code, "Bio", 2, 0]]);
});

test("sheet material: gespeichert, öffentlich und für die Lehrkraft geliefert, ungültige Links abgelehnt", async () => {
  const material = [[{ t: "Lies den " }, { t: "Auszug", f: "b" }, { t: " aufmerksam." }], [], [{ t: "Quelle", h: "https://beispiel.de/" }]];
  let r = await call("POST", "/api/teacher/sheets", { auth, body: { title: "Material", tasks: [{ text: "A", solution: "k", material }, { text: "B" }] } });
  assert.equal(r.status, 200, r.text);
  const c = r.json.code;
  r = await call("GET", "/api/sheet/" + c);
  assert.deepEqual(r.json.sheet.tasks.map((t) => t.material), [material, []]);
  assert.equal(/solution|musterl/i.test(r.text), false);
  r = await call("GET", "/api/teacher/sheets/" + c, { auth });
  assert.deepEqual(r.json.sheet.tasks[0], { text: "A", textFmt: [], solution: "k", material, images: [], files: [], answer: { type: "text" } });
  r = await call("POST", "/api/teacher/sheets", { auth, body: { title: "x", tasks: [{ text: "A", material: [[{ t: "x", h: "javascript:alert(1)" }]] }] } });
  assert.equal(r.status, 400); assert.match(r.json.error, /^Aufgabe 1: Ein Link im Material ist ungültig/);
  r = await call("POST", "/api/teacher/sheets", { auth, body: { title: "x", tasks: [{ text: "A", material: "fett" }] } });
  assert.equal(r.status, 400);
  await call("DELETE", "/api/teacher/sheets/" + c, { auth });
});

test("formatierte Aufgabenstellung (textFmt): nur mit Formatierung gespeichert, öffentlich und für die Lehrkraft geliefert, die KI bekommt nur den reinen Text", async () => {
  const textFmt = [[{ t: "Erkläre mit " }, { t: "eigenen Worten", f: "b" }, { t: ", was auf " }, { t: "dieser Seite", h: "https://beispiel.de/fotosynthese" }, { t: " steht." }], [], [{ t: "Nutze das Material.", f: "iu" }]];
  const plain = "Erkläre mit eigenen Worten, was auf dieser Seite steht.\n\nNutze das Material.";
  let r = await call("POST", "/api/teacher/sheets", { auth, body: { title: "Formatiert", tasks: [{ text: "veraltet", textFmt, solution: "Achte auf Licht und Wasser." }, { text: "B", textFmt: [[{ t: "Nur " }, { t: "Text" }]] }] } });
  assert.equal(r.status, 200, r.text);
  const c = r.json.code;
  const stored = JSON.parse(d1.db.prepare("SELECT tasks FROM sheets WHERE code=?").get(c).tasks);
  assert.deepEqual(stored.map((t) => [t.text, "textFmt" in t]), [[plain, true], ["Nur Text", false]]);   // ohne Formatierung nur der reine Text
  r = await call("GET", "/api/sheet/" + c);
  assert.deepEqual(r.json.sheet.tasks.map((t) => [t.text, t.textFmt]), [[plain, textFmt], ["Nur Text", []]]);
  assert.equal(/solution|Achte auf Licht/.test(r.text), false);
  r = await call("GET", "/api/teacher/sheets/" + c, { auth });
  assert.deepEqual(r.json.sheet.tasks[0], { text: plain, textFmt, solution: "Achte auf Licht und Wasser.", material: [], images: [], files: [], answer: { type: "text" } });
  assert.deepEqual(r.json.sheet.tasks[1].textFmt, []);
  // KI: die Aufgabenstellung nur als reiner Text – ohne Formatierung und ohne Link-Adresse
  const before = mock.state.requests.length;
  r = await call("POST", "/api/feedback", { body: { code: c, answers: ["Pflanzen brauchen Licht.", "x"], recipients: ["custom:127.0.0.1:" + mock.port] } });
  assert.equal(r.status, 200, r.text);
  const prompt = mock.state.requests.slice(before).map((q) => q.messages.map((m) => m.content).join("\n")).join("\n");
  assert.ok(prompt.includes("### Aufgabe 1\nAufgabenstellung:\n<<<\n" + plain + "\n>>>"), prompt);
  assert.equal(/beispiel\.de|textFmt|"f":/.test(prompt), false);
  // unsichere Links, Grenzen der Aufgabenstellung, falsches Format → 400 mit deutscher Meldung
  r = await call("POST", "/api/teacher/sheets", { auth, body: { title: "x", tasks: [{ text: "A" }, { text: "B", textFmt: [[{ t: "B", h: "javascript:alert(1)" }]] }] } });
  assert.equal(r.status, 400); assert.equal(r.json.error, "Aufgabe 2: Ein Link in der Aufgabenstellung ist ungültig (erlaubt sind nur Adressen mit http:// oder https://).");
  r = await call("POST", "/api/teacher/sheets", { auth, body: { title: "x", tasks: [{ text: "A", textFmt: [[{ t: "x".repeat(LIMITS.taskText + 1), f: "b" }]] }] } });
  assert.equal(r.status, 400); assert.equal(r.json.error, "Aufgabe 1: Die Aufgabenstellung ist zu lang (höchstens 4000 Zeichen).");
  r = await call("POST", "/api/teacher/sheets", { auth, body: { title: "x", tasks: [{ text: "A", textFmt: "<b>A</b>" }] } });
  assert.equal(r.status, 400); assert.equal(r.json.error, "Aufgabe 1: Die Aufgabenstellung hat ein ungültiges Format.");
  await call("DELETE", "/api/teacher/sheets/" + c, { auth });
});

test("sheet images: Grenzen je Aufgabe und je Blatt (12 MB), wiederholbarer Upload mit id, Bildbeschreibung", async () => {
  let r = await call("POST", "/api/teacher/sheets", { auth, body: { title: "Bilder", tasks: [{ text: "A" }, { text: "B" }] } });
  const c = r.json.code, png = makePng(4, 4).toString("base64");
  const up = (body) => call("POST", "/api/teacher/sheets/" + c + "/images", { auth, body });
  r = await up({ task: 1, mode: "thumb", data: png, alt: "  Skizze   einer Zelle " });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.json.image.pos, r.json.image.alt, r.json.existing], [0, "Skizze einer Zelle", undefined]);
  const id = r.json.image.id;
  // gleicher Upload mit derselben id (Wiederholung nach Timeout) → dieselbe Zeile, kein Duplikat
  r = await up({ id, task: 1, mode: "thumb", data: png });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.json.existing, r.json.image.id, r.json.image.pos, r.json.image.alt], [true, id, 0, "Skizze einer Zelle"]);
  assert.equal(d1.db.prepare("SELECT COUNT(*) AS n FROM sheet_images WHERE sheet_code=?").get(c).n, 1);
  // eigene id wird übernommen; fremde (vergebene) id eines anderen Blattes → 400
  r = await up({ id: "0123456789abcdef", task: 2, mode: "inline", data: png });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.image.id, "0123456789abcdef");
  r = await call("POST", "/api/teacher/sheets/" + code + "/images", { auth, body: { id: "0123456789abcdef", task: 1, mode: "thumb", data: png } });
  assert.equal(r.status, 400); assert.equal(r.json.error, "Diese Bild-Kennung ist schon vergeben.");
  r = await call("GET", "/api/sheet/" + c);
  assert.deepEqual(r.json.sheet.tasks.map((t) => t.images), [[{ id, mode: "thumb", w: 4, h: 4, alt: "Skizze einer Zelle" }], [{ id: "0123456789abcdef", mode: "inline", w: 4, h: 4, alt: "" }]]);
  assert.equal(r.text.includes('"data"'), false);
  // 12 MB je Blatt: Summe direkt in die Datenbank schreiben, dann ein kleines Bild → 413 mit der Meldung
  d1.db.prepare("INSERT INTO sheet_images(id,sheet_code,task,pos,mode,mime,w,h,bytes,created_at,alt,data) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("ffffffffffffff01", c, 2, 1, "thumb", "image/png", 4, 4, LIMITS.sheetImageBytes - 100, 0, "", "x");
  r = await up({ task: 1, mode: "thumb", data: png });
  assert.equal(r.status, 413, r.text);
  assert.deepEqual([r.json.code, r.json.error], ["too_large", "Die Bilder dieses Feibeitsblattes sind zusammen zu groß (höchstens 12 MB)."]);
  d1.db.prepare("DELETE FROM sheet_images WHERE id='ffffffffffffff01'").run();
  // höchstens 5 je Aufgabe (geht der Gesamtgröße vor), Aufgabe 3 gibt es nicht
  for (let i = 1; i < 5; i++) { r = await up({ task: 1, mode: "inline", data: png }); assert.equal(r.status, 200, r.text); assert.equal(r.json.image.pos, i); }
  r = await up({ task: 1, mode: "thumb", data: png });
  assert.equal(r.status, 400); assert.equal(r.json.code, "too_many_images");
  r = await up({ task: 3, mode: "thumb", data: png });
  assert.equal(r.status, 400); assert.equal(r.json.error, "Aufgabe 3 gibt es in diesem Feibeitsblatt nicht.");
  r = await up({ task: 1, mode: "thumb", data: png, alt: "x".repeat(201) });
  assert.equal(r.status, 400);
  r = await call("GET", "/api/sheet/" + c + "/images/" + id);
  assert.equal(r.status, 200); assert.equal(r.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(Buffer.from(r.json.data, "base64").equals(makePng(4, 4)), true);
  // Blatt löschen → Bilder weg
  r = await call("DELETE", "/api/teacher/sheets/" + c, { auth });
  assert.equal(r.status, 200);
  assert.equal(d1.db.prepare("SELECT COUNT(*) AS n FROM sheet_images WHERE sheet_code=?").get(c).n, 0);
  r = await call("GET", "/api/sheet/" + c + "/images/" + id);
  assert.equal(r.status, 404);
});

test("answer types: table + map stored, public view has only checks, card images counted separately (≤ 40), table hint for the AI", async () => {
  const answer = { type: "map", map: "world", items: [
    { id: "kaffee", label: "Kaffee", hint: "Bohnen", image: "00000000000000c1", countries: [{ id: "076", name: "Brasilien" }, { id: "704", name: "Vietnam" }] },
    { id: "kakao", label: "Kakao", countries: [{ id: "384", name: "Elfenbeinküste" }] }] };
  let r = await call("POST", "/api/teacher/sheets", { auth, body: { title: "Welt", tasks: [{ text: "Ordne zu", solution: "geheime Lösung", answer }, { text: "Fülle aus", solution: "Weizen\nReis", answer: { type: "table", columns: ["Produkt", "Land"], rows: 2 } }] } });
  assert.equal(r.status, 200, r.text);
  const c = r.json.code, png = makePng(4, 4).toString("base64");
  const up = (body) => call("POST", "/api/teacher/sheets/" + c + "/images", { auth, body });
  r = await up({ id: "00000000000000c1", task: 1, mode: "card", data: png, alt: "Kaffeebohnen" });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.image.mode, "card");
  for (let i = 0; i < 5; i++) { r = await up({ task: 1, mode: "thumb", data: png }); assert.equal(r.status, 200, r.text); }   // 5 Bilder trotz Kartenbild
  r = await up({ task: 1, mode: "inline", data: png });
  assert.equal(r.status, 400); assert.equal(r.json.code, "too_many_images");
  for (let i = 1; i < LIMITS.cardsPerTask; i++) d1.db.prepare("INSERT INTO sheet_images(id,sheet_code,task,pos,mode,mime,w,h,bytes,created_at,alt,data) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("ffffffffffff" + String(i).padStart(4, "0"), c, 1, 10 + i, "card", "image/png", 4, 4, 10, 0, "", "x");
  r = await up({ task: 1, mode: "card", data: png });
  assert.equal(r.status, 400); assert.deepEqual([r.json.code, r.json.error], ["too_many_images", "Höchstens 40 Kartenbilder je Aufgabe."]);
  r = await up({ task: 2, mode: "card", data: png });   // Kartenbilder nur bei der Weltkarte
  assert.equal(r.status, 400); assert.equal(r.json.error, "Kartenbilder gibt es nur bei Aufgaben mit Weltkarten-Zuordnung.");
  r = await call("GET", "/api/sheet/" + c);
  assert.equal(r.status, 200);
  const pub = r.json.sheet.tasks;
  assert.deepEqual(pub[0].answer.items.map((it) => [it.id, it.label, it.hint, it.image, it.checks.length]), [["kaffee", "Kaffee", "Bohnen", "00000000000000c1", 2], ["kakao", "Kakao", undefined, undefined, 1]]);
  assert.equal(pub[0].answer.items[0].checks[1], await sha256Hex(c + "|kaffee|704"));
  assert.deepEqual(pub[1].answer, { type: "table", columns: ["Produkt", "Land"], rows: 2 });
  assert.equal(/Brasilien|Vietnam|Elfenbein|countries|geheime|"076"/.test(r.text), false);
  assert.equal(pub[0].images.filter((m) => m.mode === "card").length, 40);
  r = await call("GET", "/api/teacher/sheets/" + c, { auth });
  assert.deepEqual(r.json.sheet.tasks[0].answer, answer);
  assert.equal(r.json.sheet.tasks[0].solution, "");   // Weltkarte: kein Auftrag an die KI
  // KI: nur Aufgabe 2 (Tabelle) mit der Zeile zu den Spalten; die Weltkarte geht nie an die KI
  const before = mock.state.requests.length;
  r = await call("POST", "/api/feedback", { body: { code: c, answers: ["Kaffee → Brasilien\nZugeordnet: 1 von 2", "Produkt | Land\nWeizen | Indien"], recipients: ["custom:127.0.0.1:" + mock.port] } });
  assert.equal(r.status, 200, r.text);
  const prompt = mock.state.requests.slice(before).map((q) => JSON.stringify(q.body || q)).join("\n");
  assert.match(prompt, /### Antwort zu Aufgabe 2\\nAntwort als Tabelle mit den Spalten: Produkt, Land\\n<<<\\nProdukt \| Land/);
  assert.equal(/Aufgabe 1|Brasilien/.test(prompt), false);
  assert.equal(r.json.results[0].note, "Zu dieser Aufgabe gibt es kein KI-Feedback.");
  r = await call("POST", "/api/teacher/sheets", { auth, body: { title: "x", tasks: [{ text: "A", answer: { type: "table", columns: ["A"], rows: 99 } }] } });
  assert.equal(r.status, 400); assert.match(r.json.error, /^Aufgabe 1: Die Tabelle braucht 1 bis 30 Zeilen/);
  await call("DELETE", "/api/teacher/sheets/" + c, { auth });
});

test("sheet files (PDF): chunked upload, only complete files listed, part-wise download, limits, sanitized names", async () => {
  assert.deepEqual(["Arbeits/blatt Zelle.PDF", "Skript", "", "..\\..\\x.pdf", "a\u0000b\u200b.pdf", "x".repeat(200) + ".pdf",
    "Rechnung\u2067fdp.exe\u2069", "a\u0085b\u061c\u00ad.pdf", "x".repeat(115) + "😀yyy", "\ud83dx.pdf"].map(cleanFileName),
    ["Arbeits-blatt Zelle.PDF", "Skript.pdf", "Datei.pdf", "-..-x.pdf", "ab.pdf", "x".repeat(116) + ".pdf",
      "Rechnungfdp.exe.pdf", "a b.pdf", "x".repeat(115) + ".pdf", "x.pdf"]);   // Bidi-Isolate, C1, Format, kein halbes Emoji
  let r = await call("POST", "/api/teacher/sheets", { auth, body: { title: "PDFs", tasks: [{ text: "A" }, { text: "B" }] } });
  const c = r.json.code;
  const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(700 * 1024 - 9, 0x41)]);   // 700 KB → 2 Teile
  const CH = LIMITS.fileChunk, chunks = Math.ceil(pdf.length / CH);
  assert.equal(chunks, 2);
  const part = (n) => pdf.subarray(n * CH, Math.min(pdf.length, (n + 1) * CH)).toString("base64");
  const up = (body) => call("POST", "/api/teacher/sheets/" + c + "/files", { auth, body });
  const id = "00000000000000a1";
  const meta = { id, task: 1, name: "Arbeits/blatt Zelle.PDF", bytes: pdf.length, chunks };
  r = await call("POST", "/api/teacher/sheets/" + c + "/files", { body: { ...meta, n: 0, data: part(0) } });
  assert.equal(r.status, 401);
  // Teil 1 vor Teil 0 → 400 (erster Teil fehlt)
  r = await up({ ...meta, n: 1, data: part(1) });
  assert.equal(r.status, 400, r.text); assert.equal(r.json.code, "bad_request");
  // Teil 0 → angelegt, aber unvollständig: nicht gelistet, kein Download
  r = await up({ ...meta, n: 0, data: part(0) });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.file, { id, task: 1, pos: 0, name: "Arbeits-blatt Zelle.PDF", bytes: pdf.length, chunks: 2, n: 0, complete: false });
  r = await call("GET", "/api/sheet/" + c);
  assert.deepEqual(r.json.sheet.tasks.map((t) => t.files), [[], []]);
  r = await call("GET", "/api/sheet/" + c + "/files/" + id);
  assert.equal(r.status, 404);
  // Teil 1 → vollständig; Wiederholungen (nach Timeout) speichern nichts doppelt
  r = await up({ ...meta, n: 1, data: part(1) });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.json.existing, r.json.file], [undefined, { id, task: 1, n: 1, chunks: 2, complete: true }]);
  r = await up({ ...meta, n: 1, data: part(1) });
  assert.deepEqual([r.status, r.json.existing, r.json.file.complete], [200, true, true]);
  r = await up({ ...meta, n: 0, data: part(0) });
  assert.deepEqual([r.status, r.json.existing, r.json.file.pos, r.json.file.complete], [200, true, 0, true]);
  assert.equal(d1.db.prepare("SELECT COUNT(*) AS n FROM sheet_files WHERE sheet_code=?").get(c).n, 2);
  // gelistet ohne Dateidaten – öffentlich und für die Lehrkraft
  r = await call("GET", "/api/sheet/" + c);
  assert.deepEqual(r.json.sheet.tasks.map((t) => t.files), [[{ id, name: "Arbeits-blatt Zelle.PDF", bytes: pdf.length }], []]);
  assert.equal(r.text.includes('"data"'), false);
  r = await call("GET", "/api/teacher/sheets/" + c, { auth });
  assert.deepEqual(r.json.sheet.tasks[0].files, [{ id, name: "Arbeits-blatt Zelle.PDF", bytes: pdf.length }]);
  // Download in Teilen (?part=0 ist die Vorgabe), zusammen ergeben sie die Datei; part=2 oder Unsinn → 404
  r = await call("GET", "/api/sheet/" + c + "/files/" + id);
  assert.equal(r.status, 200, r.text); assert.equal(r.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.deepEqual([r.json.name, r.json.mime, r.json.bytes, r.json.chunks, r.json.n], ["Arbeits-blatt Zelle.PDF", "application/pdf", pdf.length, 2, 0]);
  const r1 = await call("GET", "/api/sheet/" + c + "/files/" + id + "?part=1");
  assert.equal(r1.status, 200, r1.text); assert.equal(r1.json.n, 1);
  assert.equal(Buffer.concat([Buffer.from(r.json.data, "base64"), Buffer.from(r1.json.data, "base64")]).equals(pdf), true);
  for (const q of ["?part=2", "?part=-1", "?part=x"]) { r = await call("GET", "/api/sheet/" + c + "/files/" + id + q); assert.equal(r.status, 404, q); }
  r = await call("GET", "/api/sheet/" + code + "/files/" + id); assert.equal(r.status, 404);   // Datei eines anderen Blattes
  // keine PDF, falsche Teilgröße, falsche Stückelung, über 6 MB, Teil zu einer Datei eines anderen Blattes
  r = await up({ id: "00000000000000a2", task: 1, name: "x.pdf", bytes: 10, chunks: 1, n: 0, data: Buffer.from("kein PDF!!").toString("base64") });
  assert.equal(r.status, 400); assert.equal(r.json.code, "bad_file");
  r = await up({ ...meta, id: "00000000000000a3", n: 0, data: part(1) });
  assert.equal(r.status, 400); assert.equal(r.json.code, "bad_file");
  r = await up({ ...meta, id: "00000000000000a3", chunks: 3, n: 0, data: part(0) });
  assert.equal(r.status, 400); assert.equal(r.json.code, "bad_request");
  r = await up({ ...meta, id: "00000000000000a3", bytes: LIMITS.fileBytes + 1, chunks: Math.ceil((LIMITS.fileBytes + 1) / CH), n: 0, data: part(0) });
  assert.equal(r.status, 413); assert.equal(r.json.code, "too_large");
  r = await call("POST", "/api/teacher/sheets/" + code + "/files", { auth, body: { ...meta, n: 1, data: part(1) } });
  assert.equal(r.status, 400);
  r = await call("POST", "/api/teacher/sheets/" + code + "/files", { auth, body: { ...meta, n: 0, data: part(0) } });   // Kennung eines anderen Blattes
  assert.equal(r.status, 400, r.text); assert.equal(r.json.error, "Diese Datei-Kennung ist schon vergeben.");
  r = await up({ ...meta, task: 2, n: 0, data: part(0) });   // gleiche Kennung, andere Aufgabe → keine Wiederholung derselben Datei
  assert.equal(r.status, 400, r.text); assert.equal(r.json.error, "Diese Datei-Kennung ist schon vergeben.");
  r = await up({ ...meta, task: 2, n: 1, data: part(1) });   // Teil passt nicht zu Teil 0 → nichts gespeichert, kein „existing“
  assert.equal(r.status, 400, r.text); assert.equal(r.json.error, "Dieser Teil passt nicht zur Datei (Aufgabe oder Größe weichen ab).");
  assert.equal(d1.db.prepare("SELECT COUNT(*) AS n FROM sheet_files").get().n, 2);
  // kleine PDFs: Name ohne Endung bekommt .pdf, leerer Name → Datei.pdf, höchstens 3 je Aufgabe, Aufgabe 3 gibt es nicht
  const small = Buffer.from("%PDF-1.4\n%klein\n");
  const sm = (id, task, name) => up({ id, task, name, bytes: small.length, chunks: 1, n: 0, data: small.toString("base64") });
  r = await sm("00000000000000b1", 1, "Skript"); assert.equal(r.status, 200, r.text); assert.deepEqual([r.json.file.pos, r.json.file.name, r.json.file.complete], [1, "Skript.pdf", true]);
  r = await sm("00000000000000b2", 1, ""); assert.equal(r.status, 200, r.text); assert.deepEqual([r.json.file.pos, r.json.file.name], [2, "Datei.pdf"]);
  r = await sm("00000000000000b3", 1, "vier.pdf"); assert.equal(r.status, 400); assert.equal(r.json.code, "too_many_files");
  r = await sm("00000000000000b3", 3, "drei.pdf"); assert.equal(r.status, 400); assert.equal(r.json.error, "Aufgabe 3 gibt es in diesem Feibeitsblatt nicht.");
  // 20 MB je Blatt, genau an der Grenze: ein Byte darüber → 413 mit Meldung, genau bis zur Grenze → gespeichert
  const sheetSum = () => d1.db.prepare("SELECT SUM(bytes) AS s FROM sheet_files WHERE sheet_code=? AND n=0").get(c).s;
  d1.db.prepare("INSERT INTO sheet_files(id,n,sheet_code,task,pos,name,mime,bytes,chunks,created_at,data) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .run("ffffffffffffff02", 0, c, 2, 0, "gross.pdf", "application/pdf", LIMITS.sheetFileBytes - sheetSum() - small.length + 1, 1, 0, "x");
  r = await sm("00000000000000b4", 2, "noch.pdf");
  assert.equal(r.status, 413, r.text); assert.deepEqual([r.json.code, r.json.error], ["too_large", "Die PDF-Dateien dieses Feibeitsblattes sind zusammen zu groß (höchstens 20 MB)."]);
  d1.db.prepare("UPDATE sheet_files SET bytes=bytes-1 WHERE id='ffffffffffffff02'").run();
  r = await sm("00000000000000b4", 2, "passt.pdf");
  assert.equal(r.status, 200, r.text); assert.equal(sheetSum(), LIMITS.sheetFileBytes);
  d1.db.prepare("DELETE FROM sheet_files WHERE id IN ('ffffffffffffff02','00000000000000b4')").run();
  // gemeinsame Grenze für Bilder und PDF-Dateien aller Blätter (200 MB): ein großes Bild eines anderen Blattes direkt in die
  // Datenbank → weitere Dateien und Bilder → 413 storage_full; die Übersicht meldet den belegten Speicher
  const used = () => d1.db.prepare("SELECT (SELECT COALESCE(SUM(bytes),0) FROM sheet_files WHERE n=0)+(SELECT COALESCE(SUM(bytes),0) FROM sheet_images) AS u").get().u;
  d1.db.prepare("INSERT INTO sheet_images(id,sheet_code,task,pos,mode,mime,w,h,bytes,created_at,alt,data) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("ffffffffffffff03", code, 1, 0, "thumb", "image/png", 4, 4, LIMITS.storageBytes - used() - small.length + 1, 0, "", "x");
  r = await sm("00000000000000b5", 2, "voll.pdf");
  assert.equal(r.status, 413, r.text); assert.equal(r.json.code, "storage_full");
  assert.match(r.json.error, /^Der Speicher für Bilder und PDF-Dateien ist voll \(höchstens 200 MB für alle Feibeitsblätter zusammen\)/);
  r = await call("POST", "/api/teacher/sheets/" + c + "/images", { auth, body: { task: 1, mode: "thumb", data: makePng(4, 4).toString("base64") } });
  assert.equal(r.status, 413, r.text); assert.equal(r.json.code, "storage_full");
  r = await call("GET", "/api/teacher/sheets", { auth });
  assert.deepEqual(r.json.storage, { used: LIMITS.storageBytes - small.length + 1, limit: LIMITS.storageBytes });
  d1.db.prepare("UPDATE sheet_images SET bytes=bytes-1 WHERE id='ffffffffffffff03'").run();
  r = await sm("00000000000000b5", 2, "passt.pdf");
  assert.equal(r.status, 200, r.text); assert.equal(used(), LIMITS.storageBytes);
  d1.db.prepare("DELETE FROM sheet_images WHERE id='ffffffffffffff03'").run();
  d1.db.prepare("DELETE FROM sheet_files WHERE id='00000000000000b5'").run();
  r = await call("GET", "/api/sheet/" + c);
  assert.deepEqual(r.json.sheet.tasks[0].files.map((f) => f.name), ["Arbeits-blatt Zelle.PDF", "Skript.pdf", "Datei.pdf"]);
  // Blatt löschen → Dateien weg
  r = await call("DELETE", "/api/teacher/sheets/" + c, { auth });
  assert.equal(r.status, 200);
  assert.equal(d1.db.prepare("SELECT COUNT(*) AS n FROM sheet_files WHERE sheet_code=?").get(c).n, 0);
  r = await call("GET", "/api/sheet/" + c + "/files/" + id);
  assert.equal(r.status, 404);
});

test("reserve AI: stored separately (encrypted), tested via ?which=reserve, used when the first provider fails", async () => {
  // Reserve speichern, ohne den ersten Anbieter anzufassen
  let r = await call("PUT", "/api/teacher/ai", { auth, body: { reserve: { provider: "custom", model: "", baseUrl: mock.url, apiKey: "sk-reserve-SECRET-9876" } } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual({ p: r.json.provider, k: r.json.hasKey, h: r.json.keyHint }, { p: "custom", k: true, h: "…1234" });   // unverändert
  assert.deepEqual({ p: r.json.reserve.provider, k: r.json.reserve.hasKey, h: r.json.reserve.keyHint, m: r.json.reserve.model }, { p: "custom", k: true, h: "…9876", m: "" });
  assert.equal(r.text.includes("SECRET"), false);
  let s = settingsRow("ai");
  assert.ok(s.apiKeyEnc && s.reserve.apiKeyEnc); assert.equal(s.reserve.apiKey, undefined);
  assert.equal(JSON.stringify(s).includes("SECRET"), false);
  assert.deepEqual(s.reserve.fallbacks, ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "qwen/qwen3-32b"]);
  r = await call("POST", "/api/teacher/ai/test?which=reserve", { auth });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.which, "reserve"); assert.equal(r.json.sample, "Verbindung steht.");
  r = await call("GET", "/api/teacher/ai", { auth });
  assert.equal(r.json.reserve.hasKey, true); assert.equal(r.json.hasKey, true);
  // Schüler:innen erfahren beide Empfänger (Datenschutzhinweis), erster Anbieter zuerst
  r = await call("GET", "/api/sheet/" + code);
  const rcpt = "127.0.0.1:" + mock.port + " (Betreiber und Sitz: von der Lehrkraft zu prüfen)";
  assert.equal(r.json.sheet.aiProvider, "127.0.0.1:" + mock.port);
  assert.deepEqual(r.json.sheet.aiRecipients, [{ id: "custom:127.0.0.1:" + mock.port, label: rcpt }, { id: "custom:127.0.0.1:" + mock.port, label: rcpt }]);
  // Reserve ohne Schlüssel für einen anderen Dienst → 400, nichts geändert
  r = await call("PUT", "/api/teacher/ai", { auth, body: { reserve: { provider: "groq", model: "" } } });
  assert.equal(r.status, 400); assert.match(r.json.error, /neuen Anbieter/);
  assert.equal(settingsRow("ai").reserve.provider, "custom");
  // Erster Anbieter nicht erreichbar (geschlossener Port) → die Reserve antwortet
  r = await call("PUT", "/api/teacher/ai", { auth, body: { provider: "custom", model: "tot", baseUrl: "http://127.0.0.1:9/v1", apiKey: "sk-dead" } });
  assert.equal(r.status, 200, r.text); assert.ok(r.json.warning, "Verbindung nicht prüfbar → Warnung, trotzdem gespeichert");
  assert.equal(r.json.reserve.hasKey, true);   // Reserve blieb erhalten
  r = await call("GET", "/api/sheet/" + code);
  assert.deepEqual(r.json.sheet.aiRecipients.map((x) => x.id), ["custom:127.0.0.1:9", "custom:127.0.0.1:" + mock.port]);
  mock.reset();
  r = await call("POST", "/api/feedback", { body: { code, answers: ["Licht", ""] } });
  assert.equal(r.status, 200, r.text);
  assert.equal(mock.state.requests.length, 1, "genau eine Anfrage – bei der Reserve");
  assert.deepEqual(r.json.results, expectedResults(tasks, ["Licht", ""]));
  // Transparenz: Der Browser nennt die Empfänger, über die informiert wurde – fehlt der erste Anbieter → 409, fehlt die Reserve → sie bleibt außen vor
  r = await call("POST", "/api/feedback", { body: { code, answers: ["Licht", ""], recipients: ["custom:127.0.0.1:" + mock.port] } });
  assert.equal(r.status, 409); assert.equal(r.json.code, "ai_changed"); assert.match(r.json.error, /Datenschutzhinweis/);
  mock.reset();
  r = await call("POST", "/api/feedback", { body: { code, answers: ["Licht", ""], recipients: ["custom:127.0.0.1:9"] } });
  assert.equal(r.status, 502); assert.equal(mock.state.requests.length, 0, "Reserve ohne Information nie");
  r = await call("POST", "/api/feedback", { body: { code, answers: ["Licht", ""], recipients: ["custom:127.0.0.1:9", "custom:127.0.0.1:" + mock.port] } });
  assert.equal(r.status, 200); assert.equal(mock.state.requests.length, 1);
  // Erster Anbieter wieder der Mock; Reserve entfernen → auch der Hinweis für Schüler:innen verschwindet
  r = await call("PUT", "/api/teacher/ai", { auth, body: { provider: "custom", model: "", baseUrl: mock.url, apiKey: "sk-unit-SECRET-1234", reserve: null } });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.reserve, null);
  s = settingsRow("ai"); assert.equal(s.reserve, undefined); assert.ok(s.apiKeyEnc);
  r = await call("GET", "/api/sheet/" + code);
  assert.equal(r.json.sheet.aiRecipients.length, 1);
  r = await call("POST", "/api/teacher/ai/test?which=reserve", { auth });
  assert.equal(r.status, 400); assert.equal(r.json.error, "Es ist keine Reserve-KI mit API-Schlüssel gespeichert.");
});

test("reserve only on availability failures: a moderation refusal (403) never reaches the reserve; a server error does", async () => {
  const mock2 = await startMockAI({ port: 0 });
  try {
    let r = await call("PUT", "/api/teacher/ai", { auth, body: { reserve: { provider: "custom", model: "", baseUrl: mock2.url, apiKey: "sk-reserve-two" } } });
    assert.equal(r.status, 200, r.text);
    mock.setMode("403flag"); mock.reset(); mock2.reset();
    r = await call("POST", "/api/feedback", { body: { code, answers: ["Licht", ""] }, ip: "203.0.113.40" });
    assert.equal(r.status, 502); assert.equal(r.json.aiCode, "FILTERED"); assert.equal(r.json.error, "Die KI hat diese Antworten nicht bewertet. Bitte frag deine Lehrkraft.");
    assert.equal(mock2.state.requests.length, 0, "Inhaltsfilter: nichts an die Reserve");
    mock.setMode("500"); mock.reset(); mock2.reset();
    r = await call("POST", "/api/feedback", { body: { code, answers: ["Licht", ""] }, ip: "203.0.113.41" });
    assert.equal(r.status, 200, r.text); assert.equal(mock2.state.requests.length, 1, "Serverfehler: Reserve springt ein");
    assert.equal(d1.db.prepare("SELECT COUNT(*) AS n FROM ai_skip WHERE provider='custom'").get().n > 0, true, "Sperren des ersten Anbieters liegen unter seinem Schlüssel");
    assert.equal(d1.db.prepare("SELECT COUNT(*) AS n FROM ai_skip WHERE provider='custom#r'").get().n, 0, "Reserve ohne Sperren");
  } finally {
    mock.setMode("ok");
    await call("PUT", "/api/teacher/ai", { auth, body: { reserve: null } });
    d1.db.prepare("DELETE FROM ai_skip").run();
    await mock2.close();
  }
});

test("burst: parallel feedback requests spread over the provider's models (mock: 2 per model, 3 models = 6 slots); locks are written at once", async () => {
  mock.setMode("tpm", null, 2); mock.reset();
  d1.db.prepare("DELETE FROM ai_skip").run(); d1.db.prepare("DELETE FROM ai_gate").run();
  try {
    const t0 = Date.now();
    // 6 gleichzeitige Anfragen (der Mock-Anbieter „custom“ hat ein Gate je Anbieter mit 1 s Abstand – mehr wäre hier nur Wartezeit)
    const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => call("POST", "/api/feedback", { body: { code, answers: ["Licht", ""] }, ip: "203.0.113." + (50 + i), nocount: true })));
    const took = Date.now() - t0;
    assert.deepEqual(rs.map((r) => r.status), Array(6).fill(200), rs.map((r) => r.text).join("\n"));
    const okModels = new Set(mock.state.requests.map((q) => q.model));
    assert.equal(okModels.size, 3, "6 Erfolge bei 2 je Modell → alle drei Modelle genutzt: " + [...okModels].join(", "));
    assert.ok(took < 40000, "6 Anfragen in unter 40 s (" + took + " ms)");   // großzügig: parallele Testprozesse bremsen
    const locks = d1.db.prepare("SELECT model, until, reason FROM ai_skip WHERE provider='custom'").all();
    // Der Mock zählt auch die mit 429 abgelehnten Anfragen. Mehr als 6 → es gab ein Minutenlimit → die Sperre muss sofort
    // geschrieben sein. Genau 6 → die zufälligen Startmodelle lagen genau 2/2/2 (etwa jeder 8. Lauf), kein 429, keine Sperre.
    const rejected = mock.state.requests.length - 6;
    if (rejected > 0) assert.ok(locks.length >= 1, "Minutenlimit-Sperren geschrieben (" + rejected + " × 429)");
    else assert.equal(locks.length, 0, "ohne 429 keine Sperre");
    for (const l of locks) { assert.match(l.reason, /Minutenlimit/); assert.ok(l.until - Date.now() <= 5000 && l.until > Date.now() - 20000, "kurze Sperre (retry-after 2 s → min 5 s)"); }
    // Kontingent aller Modelle erschöpft (1 je Modell, höchstens 7 Modelle) → 429 ai_busy mit kurzem retryAfter (kein Fehlversuch)
    mock.setMode("tpm", null, 1);
    const more = await Promise.all(Array.from({ length: 8 }, (_, i) => call("POST", "/api/feedback", { body: { code, answers: ["Licht", ""] }, ip: "203.0.113." + (70 + i), nocount: true })));
    const busy = more.filter((r) => r.status === 429);
    assert.ok(busy.length >= 1, "mindestens eine Anfrage wartet: " + more.map((r) => r.status).join(","));
    for (const r of busy) { assert.equal(r.json.code, "ai_busy"); assert.ok(r.json.retryAfter >= 5 && r.json.retryAfter <= 60, "retryAfter " + r.json.retryAfter); assert.equal(r.headers.get("retry-after"), String(r.json.retryAfter)); }
    assert.ok(more.every((r) => r.status === 200 || r.status === 429));
    // ein einzelner Aufruf bei erschöpftem Kontingent läuft alle Modelle ab und bleibt unter 50 D1-Abfragen (der Zähler gilt je Aufruf)
    const one = await call("POST", "/api/feedback", { body: { code, answers: ["Licht", ""] }, ip: "203.0.113.80" });
    assert.ok(one.status === 200 || one.status === 429, one.text);
  } finally { mock.setMode("ok"); d1.db.prepare("DELETE FROM ai_skip").run(); d1.db.prepare("DELETE FROM ai_gate").run(); }
});

test("gemini needs the billing confirmation (EEA terms) before a key is stored", async () => {
  let r = await call("PUT", "/api/teacher/ai", { auth, body: { reserve: { provider: "gemini", model: "", apiKey: "AIza-test" } } });
  assert.equal(r.status, 400); assert.match(r.json.error, /Abrechnungskonto/);
  r = await call("PUT", "/api/teacher/ai", { auth, body: { reserve: { provider: "gemini", model: "", apiKey: "AIza-test", confirmBilling: true } } });
  assert.equal(r.status, 200, r.text); assert.equal(settingsRow("ai").reserve.billingConfirmed, true);
  r = await call("PUT", "/api/teacher/ai", { auth, body: { reserve: null } });
  assert.equal(r.status, 200);
});

test("feedback: one AI call, expected covered/missing (= gut/tipps of the mock), ≤ 50 D1 queries", async () => {
  mock.reset();
  const answers = ["Licht ist wichtig für die photosynthese", ""];
  const r = await call("POST", "/api/feedback", { body: { code, answers } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.results, expectedResults(tasks, answers));
  assert.deepEqual(r.json.results[0], { covered: ["Photosynthese braucht Licht"], missing: ["Chloroplasten sind beteiligt", "Sauerstoff entsteht"] });
  assert.equal(mock.state.requests.length, 1);
  assert.equal(mock.state.requests[0].temperature, 0.1);
});

test("aiFeedback flag: false when no task has an Auftrag an die KI (map tasks never count); feedback then needs no AI", async () => {
  const map = { type: "map", map: "world", items: [{ id: "kaffee", label: "Kaffee", countries: [{ id: "076", name: "Brasilien" }] }] };
  let r = await call("POST", "/api/teacher/sheets", { auth, body: { title: "Ohne KI", tasks: [{ text: "Ordne zu", solution: "wird verworfen", answer: map }, { text: "Schreibe", solution: "  " }] } });
  assert.equal(r.status, 200, r.text);
  const c = r.json.code;
  r = await call("GET", "/api/sheet/" + c);
  assert.equal(r.json.sheet.aiFeedback, false);
  assert.equal(/wird verworfen|solution/.test(r.text), false);
  mock.reset();
  r = await call("POST", "/api/feedback", { body: { code: c, answers: ["", "Text"] } });
  assert.equal(r.status, 200, r.text);
  assert.equal(mock.state.requests.length, 0);
  r = await call("GET", "/api/sheet/" + code);
  assert.equal(r.json.sheet.aiFeedback, true);
  r = await call("DELETE", "/api/teacher/sheets/" + c, { auth });
  assert.equal(r.status, 200, r.text);
});

test("AI gate spaces parallel requests (custom: 1 s)", async () => {
  mock.reset();
  const t0 = Date.now();
  const [a, b] = await Promise.all([1, 2].map(() => call("POST", "/api/feedback", { body: { code, answers: ["Licht", ""] }, ip: "198.51.100.9" })));
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const at = mock.state.requests.map((x) => x.at).sort();
  assert.ok(at[1] - at[0] >= 900, "Abstand " + (at[1] - at[0]) + " ms");
  assert.ok(Date.now() - t0 < 10000);
});

test("submit and list submissions (decryptable), counts", async () => {
  const payload = { v: 1, sheetCode: code, person: { vorname: "Max", nachname: "Mu", geburtsdatum: "2011-05-04", klasse: "8b" }, answers: [{ first: "a", final: "b" }] };
  const envelope = await makeEnvelope(T.publicKey, payload);
  let r = await call("POST", "/api/submit", { body: { code, envelope } });
  assert.equal(r.status, 200, r.text);
  r = await call("GET", "/api/teacher/sheets/" + code + "/submissions", { auth });
  assert.equal(r.json.submissions.length, 1); assert.equal(r.json.next, null);
  assert.deepEqual(await openEnvelope(T.privateKey, r.json.submissions[0].envelope), payload);
  assert.equal(typeof r.json.submissions[0].receivedAt, "number");
  const rows = d1.db.prepare("SELECT * FROM submissions").all();
  assert.deepEqual(Object.keys(rows[0]).sort(), ["attempt", "envelope", "id", "received_at", "sheet_code", "stage"]);
  assert.equal(rows[0].stage, "final"); assert.equal(rows[0].attempt, null);   // ohne Angabe: Abgabe ohne Kennung
  assert.equal(rows[0].envelope.includes("Max"), false);
  // Seitenweise: 52 weitere Abgaben → Seite 1 hat 50 + next, Seite 2 den Rest; Kappung je Blatt (Anzahl und Bytes)
  for (let i = 0; i < 52; i++) await call("POST", "/api/submit", { body: { code, envelope }, ip: "198.51.100." + (2 + (i % 100)) });
  r = await call("GET", "/api/teacher/sheets/" + code + "/submissions", { auth });
  assert.equal(r.json.submissions.length, 50); assert.equal(r.json.next, r.json.submissions[49].id);
  const r2 = await call("GET", "/api/teacher/sheets/" + code + "/submissions?after=" + r.json.next, { auth });
  assert.equal(r2.json.submissions.length, 3); assert.equal(r2.json.next, null);
  assert.ok(r2.json.submissions.every((s) => s.id > r.json.next));
  const { LIMITS } = await import("../../worker/lib.js");
  const savedMax = LIMITS.submissionsPerSheet; LIMITS.submissionsPerSheet = 53;
  try {
    const full = await call("POST", "/api/submit", { body: { code, envelope } });
    assert.equal(full.status, 409); assert.equal(full.json.code, "too_many_submissions");
  } finally { LIMITS.submissionsPerSheet = savedMax; }
  d1.db.prepare("DELETE FROM submissions WHERE id > ?").run(rows[0].id);
});

test("first attempt (stage first) is replaced by the final submission of the same attempt; never the other way round", async () => {
  const mk = (stage) => makeEnvelope(T.publicKey, { v: 1, stage, sheetCode: code, person: { vorname: "Tom", nachname: "Ze", geburtsdatum: "2010-02-02", klasse: "9c" }, answers: [{ first: "a", final: stage === "first" ? null : "b" }] });
  const attempt = "0123456789ABCDEF";   // wird klein geschrieben gespeichert
  const before = (await call("GET", "/api/teacher/sheets", { auth })).json.sheets[0];
  // ungültige Angaben → 400, nichts gespeichert
  let r = await call("POST", "/api/submit", { body: { code, envelope: await mk("first"), stage: "first" } });
  assert.equal(r.status, 400); assert.equal(r.json.error, "Ein Erstversuch braucht eine Kennung der Bearbeitung.");
  r = await call("POST", "/api/submit", { body: { code, envelope: await mk("first"), stage: "draft", attempt } });
  assert.equal(r.status, 400); assert.equal(r.json.error, "Unbekannte Art der Abgabe.");
  r = await call("POST", "/api/submit", { body: { code, envelope: await mk("final"), attempt: "zz" } });
  assert.equal(r.status, 400); assert.equal(r.json.error, "Ungültige Kennung der Bearbeitung.");
  // Erstversuch → zählt als firstCount, Liste liefert stage "first"
  r = await call("POST", "/api/submit", { body: { code, envelope: await mk("first"), stage: "first", attempt } });
  assert.equal(r.status, 200, r.text); const id = r.json.id;
  let sheets = (await call("GET", "/api/teacher/sheets", { auth })).json.sheets[0];
  assert.deepEqual([sheets.submissionCount, sheets.firstCount], [before.submissionCount, 1]);
  let list = (await call("GET", "/api/teacher/sheets/" + code + "/submissions", { auth })).json.submissions;
  assert.deepEqual(list.filter((s) => s.id === id).map((s) => s.stage), ["first"]);
  assert.ok(list.every((s) => s.stage === "first" || s.stage === "final"));
  assert.equal(d1.db.prepare("SELECT attempt FROM submissions WHERE id=?").get(id).attempt, attempt.toLowerCase());
  // zweiter Erstversuch derselben Bearbeitung ersetzt den ersten (gleiche id, keine zweite Zeile)
  r = await call("POST", "/api/submit", { body: { code, envelope: await mk("first"), stage: "first", attempt } });
  assert.equal(r.status, 200); assert.equal(r.json.id, id); assert.equal(r.json.replaced, "first");
  // Abgabe derselben Bearbeitung ersetzt den Erstversuch in derselben Zeile
  r = await call("POST", "/api/submit", { body: { code, envelope: await mk("final"), stage: "final", attempt: attempt.toLowerCase() } });
  assert.equal(r.status, 200); assert.equal(r.json.id, id); assert.equal(r.json.replaced, "first");
  sheets = (await call("GET", "/api/teacher/sheets", { auth })).json.sheets[0];
  assert.deepEqual([sheets.submissionCount, sheets.firstCount], [before.submissionCount + 1, 0]);
  list = (await call("GET", "/api/teacher/sheets/" + code + "/submissions", { auth })).json.submissions;
  assert.deepEqual(list.filter((s) => s.id === id).map((s) => s.stage), ["final"]);
  assert.deepEqual((await openEnvelope(T.privateKey, list.find((s) => s.id === id).envelope)).answers, [{ first: "a", final: "b" }]);
  // ein später eintreffender Erstversuch überschreibt die Abgabe nicht
  r = await call("POST", "/api/submit", { body: { code, envelope: await mk("first"), stage: "first", attempt } });
  assert.equal(r.status, 200); assert.equal(r.json.id, id); assert.equal(r.json.kept, true);
  list = (await call("GET", "/api/teacher/sheets/" + code + "/submissions", { auth })).json.submissions;
  assert.deepEqual(list.filter((s) => s.id === id).map((s) => s.stage), ["final"]);
  assert.deepEqual((await openEnvelope(T.privateKey, list.find((s) => s.id === id).envelope)).answers, [{ first: "a", final: "b" }]);
  // andere Kennung → eigene Zeile; Abgabe ohne Kennung ebenfalls
  r = await call("POST", "/api/submit", { body: { code, envelope: await mk("first"), stage: "first", attempt: "fedcba9876543210" } });
  assert.equal(r.status, 200); assert.notEqual(r.json.id, id);
  r = await call("POST", "/api/submit", { body: { code, envelope: await mk("final"), stage: "final" } });
  assert.equal(r.status, 200);
  sheets = (await call("GET", "/api/teacher/sheets", { auth })).json.sheets[0];
  assert.deepEqual([sheets.submissionCount, sheets.firstCount], [before.submissionCount + 2, 1]);
  d1.db.prepare("DELETE FROM submissions WHERE id >= ?").run(id);
});

test("schema upgrade: an old submissions table without stage/attempt gets the columns added (idempotent)", async () => {
  const { ensureSubmissionColumns } = await import("../../worker/index.js");
  d1.db.exec("CREATE TABLE old_submissions(id INTEGER PRIMARY KEY AUTOINCREMENT, sheet_code TEXT NOT NULL, received_at INTEGER NOT NULL, envelope TEXT NOT NULL)");
  d1.db.exec("ALTER TABLE submissions RENAME TO submissions_new; ALTER TABLE old_submissions RENAME TO submissions");
  try {
    d1.db.prepare("INSERT INTO submissions(sheet_code, received_at, envelope) VALUES (?, ?, ?)").run(code, 1, "{}");
    for (let i = 0; i < 2; i++) await ensureSubmissionColumns(d1);   // zweimal: nichts doppelt
    const cols = d1.db.prepare("PRAGMA table_info(submissions)").all().map((c) => c.name);
    assert.deepEqual(cols, ["id", "sheet_code", "received_at", "envelope", "stage", "attempt"]);
    const row = d1.db.prepare("SELECT stage, attempt FROM submissions").get();
    assert.deepEqual({ ...row }, { stage: "final", attempt: null });   // alte Zeilen gelten als Abgaben
    assert.ok(d1.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_submissions_attempt'").get());
  } finally {
    d1.db.exec("DROP TABLE submissions; ALTER TABLE submissions_new RENAME TO submissions");
  }
});

test("key at rest: changed secret → hasKey false + hint, feedback 503; no secret → never plaintext (503)", async () => {
  const other = { ...ENV, SETTINGS_SECRET: b64(new Uint8Array(32).fill(1)) };
  let r = await call("GET", "/api/teacher/ai", { auth, env: other });
  assert.equal(r.json.hasKey, false); assert.equal(r.json.keyError, "Bitte den API-Schlüssel neu eintragen.");
  r = await call("POST", "/api/feedback", { body: { code, answers: ["x", ""] }, env: other });
  assert.equal(r.status, 503); assert.equal(r.json.code, "ai_not_configured");
  assert.equal(r.json.error, "Die Lehrkraft hat das KI-Feedback noch nicht eingerichtet.");
  const noSecret = { DB: d1, ASSETS };
  r = await call("GET", "/api/teacher/ai", { auth, env: noSecret });
  assert.equal(r.json.hasKey, false); assert.match(r.json.keyError, /SETTINGS_SECRET fehlt/);
  r = await call("PUT", "/api/teacher/ai", { auth, env: noSecret, body: { provider: "custom", model: "mock-x", baseUrl: mock.url, apiKey: "sk-dev" } });
  assert.equal(r.status, 503); assert.equal(r.json.code, "server_not_configured");
  assert.equal(JSON.stringify(settingsRow("ai")).includes("sk-dev"), false, "nie im Klartext gespeichert");
  r = await call("PUT", "/api/teacher/ai", { auth, body: { provider: "custom", model: "mock-x", baseUrl: mock.url, apiKey: "sk-dev" } });
  assert.equal(r.status, 200);
  r = await call("PUT", "/api/teacher/ai", { auth, body: { provider: "custom", model: "", baseUrl: mock.url } });   // ohne apiKey, gleicher Dienst: bleibt
  assert.equal(r.json.hasKey, true); assert.equal(settingsRow("ai").apiKey, undefined); assert.ok(settingsRow("ai").apiKeyEnc);
});

test("stored key is never sent to another provider/host: new provider or base URL needs a new key", async () => {
  let r = await call("PUT", "/api/teacher/ai", { auth, body: { provider: "groq", model: "" } });
  assert.equal(r.status, 400); assert.match(r.json.error, /neuen Anbieter/);
  r = await call("PUT", "/api/teacher/ai", { auth, body: { provider: "custom", model: "m", baseUrl: "https://example.org/v1" } });
  assert.equal(r.status, 400);
  assert.equal(mock.state.requests.length, mock.state.requests.length);   // kein Aufruf nach außen
  r = await call("GET", "/api/teacher/ai", { auth });
  assert.equal(r.json.hasKey, true); assert.equal(r.json.provider, "custom");   // unverändert
});

test("feedback without configured AI → 503; sheet without instructions for the AI needs no AI", async () => {
  d1.db.prepare("DELETE FROM settings WHERE key='ai'").run();
  let r = await call("GET", "/api/sheet/" + code);
  assert.equal(r.json.sheet.aiProvider, null);
  r = await call("POST", "/api/feedback", { body: { code, answers: ["x", ""] } });
  assert.equal(r.status, 503); assert.equal(r.json.code, "ai_not_configured");
  const c2 = (await call("POST", "/api/teacher/sheets", { auth, body: { title: "", tasks: [{ text: "Frei" }] } })).json.code;
  r = await call("POST", "/api/feedback", { body: { code: c2, answers: ["egal"] } });
  assert.deepEqual(r.json, { ok: true, results: [{ covered: [], missing: [], note: "Zu dieser Aufgabe gibt es kein KI-Feedback." }] });
});

test("lockouts count only failures per (hashed) IP; correct door code and password always pass; IPv6 by /64", async () => {
  for (let i = 0; i < 10; i++) assert.equal((await call("POST", "/api/teacher/door", { body: { doorCode: "0" }, ip: "203.0.113.1" })).status, 403);
  let r = await call("POST", "/api/teacher/door", { body: { doorCode: "0" }, ip: "203.0.113.1" });
  assert.equal(r.status, 429); assert.ok(r.json.retryAfter > 600 && r.json.retryAfter <= 900); assert.equal(r.headers.get("retry-after"), String(r.json.retryAfter));
  assert.equal((await call("POST", "/api/teacher/door", { body: { doorCode: "1104" }, ip: "203.0.113.1" })).status, 200, "richtiger Code trotz Sperre");
  assert.equal((await call("POST", "/api/teacher/door", { body: { doorCode: "0" }, ip: "203.0.113.2" })).status, 403, "andere IP: eigener Zähler");
  // Passwort: 10 falsche → 401, danach 429 (mit Bremse), das richtige geht weiter
  const wrong = b64(new Uint8Array(32).fill(9));
  for (let i = 0; i < 10; i++) assert.equal((await call("POST", "/api/teacher/login", { auth: wrong, ip: "203.0.113.3" })).status, 401);
  const t0 = Date.now();
  r = await call("POST", "/api/teacher/login", { auth: wrong, ip: "203.0.113.3" });
  assert.equal(r.status, 429); assert.ok(Date.now() - t0 >= 1900, "Bremse");
  assert.equal((await call("POST", "/api/teacher/login", { auth, ip: "203.0.113.3" })).status, 200, "richtiges Passwort trotz Sperre");
  assert.equal((await call("GET", "/api/teacher/sheets", { auth, ip: "203.0.113.3" })).status, 200, "laufende Sitzung trotz Sperre");
  // IPv6: zwei Adressen im selben /64 teilen sich den Zähler
  for (let i = 0; i < 10; i++) await call("POST", "/api/teacher/door", { body: { doorCode: "0" }, ip: "2001:db8:1:2::" + (i + 1).toString(16) });
  assert.equal((await call("POST", "/api/teacher/door", { body: { doorCode: "0" }, ip: "2001:db8:1:2:ffff::1" })).status, 429);
  assert.equal((await call("POST", "/api/teacher/door", { body: { doorCode: "0" }, ip: "2001:db8:1:3::1" })).status, 403);
  const buckets = d1.db.prepare("SELECT bucket FROM rate_limits").all().map((x) => x.bucket);
  assert.ok(buckets.every((b) => /^[a-z_]+:[0-9a-f]{32}$/.test(b)));
  assert.equal(JSON.stringify(buckets).includes("203.0.113"), false);
});

test("unknown sheet codes lock only unknown codes; valid codes still open", async () => {
  for (let i = 0; i < 30; i++) assert.equal((await call("GET", "/api/sheet/QQQQQ" + "23456789"[i % 8], { ip: "203.0.113.4" })).status, 404);
  assert.equal((await call("GET", "/api/sheet/QQQQQ2", { ip: "203.0.113.4" })).status, 429);
  assert.equal((await call("GET", "/api/sheet/" + code, { ip: "203.0.113.4" })).status, 200);
});

test("feedback counts only valid AI calls (per IP, chars, per sheet/day); BUSY/RATE_LIMIT → 429 ai_busy", async () => {
  const saved = { f: RATE.feedback.max, s: RATE.sheet_feedback.max };
  assert.equal((await call("PUT", "/api/teacher/ai", { auth, body: { provider: "custom", model: "", baseUrl: mock.url, apiKey: "sk-unit-again" } })).status, 200);
  try {
    RATE.feedback.max = 2;
    assert.equal((await call("POST", "/api/feedback", { body: { code: "AAAAA2", answers: [] }, ip: "203.0.113.5" })).status, 404);   // zählt nicht
    assert.equal((await call("POST", "/api/feedback", { body: { code, answers: ["Licht", ""] }, ip: "203.0.113.5" })).status, 200);
    assert.equal((await call("POST", "/api/feedback", { body: { code, answers: ["Licht", ""] }, ip: "203.0.113.5" })).status, 200);
    let r = await call("POST", "/api/feedback", { body: { code, answers: ["Licht", ""] }, ip: "203.0.113.5" });
    assert.equal(r.status, 429); assert.equal(r.json.code, "rate_limited");
    RATE.feedback.max = saved.f; RATE.sheet_feedback.max = 1;
    r = await call("POST", "/api/feedback", { body: { code, answers: ["Licht", ""] }, ip: "203.0.113.6" });
    assert.equal(r.status, 429); assert.match(r.json.error, /dieses Feibeitsblatt/);
    RATE.sheet_feedback.max = saved.s;
    mock.setMode("429soft");   // kurzzeitiges Limit → nach Wartezeit wieder ok; ein Modell, Mock antwortet weiter 429 → BUSY/RATE_LIMIT
    r = await call("POST", "/api/feedback", { body: { code, answers: ["Licht", ""] }, ip: "203.0.113.7" });
    assert.equal(r.status, 429, r.text); assert.equal(r.json.code, "ai_busy"); assert.ok(r.json.retryAfter >= 5 && r.json.retryAfter <= 60, "retryAfter " + r.json.retryAfter);
    assert.equal(r.headers.get("retry-after"), String(r.json.retryAfter));
  } finally { RATE.feedback.max = saved.f; RATE.sheet_feedback.max = saved.s; mock.setMode("ok"); }
});

test("Workers AI (Binding): nur nach „Speichern“ aktiv, ohne Schlüssel; Empfänger; Feedback und Test über env.AI; lokal CONFIG; Tageskontingent mit Sperre bis 0:00 UTC, Reserve mit vollem Budget, sonst 503 ai_quota ohne Zählung", async () => {
  const cf = mockAIBinding(mock), CFENV = { ...ENV, AI: cf };
  const CF_LABEL = "Cloudflare, Inc. (San Francisco, USA) – betreibt auch den Server, der die Abgaben speichert";
  const mockId = "custom:127.0.0.1:" + mock.port, GEMMA = "@cf/google/gemma-4-26b-a4b-it";
  const lockRow = () => d1.db.prepare("SELECT until FROM ai_skip WHERE provider='cloudflare' AND model='*'").get();
  const usageRow = () => d1.db.prepare("SELECT requests, neurons FROM ai_usage WHERE provider='cloudflare' AND day=?").get(new Date().toISOString().slice(0, 10));
  d1.db.prepare("DELETE FROM settings WHERE key='ai'").run(); d1.db.prepare("DELETE FROM ai_skip").run(); d1.db.prepare("DELETE FROM ai_usage").run();
  try {
    // Frisch: Vorauswahl cloudflare, aber nicht gespeichert → nicht nutzbar, keine Empfänger, kein Feedback
    let r = await call("GET", "/api/teacher/ai", { auth, env: CFENV });
    assert.deepEqual({ p: r.json.provider, k: r.json.hasKey, ready: r.json.ready, kl: r.json.keyless, saved: r.json.saved }, { p: "cloudflare", k: false, ready: false, kl: true, saved: false });
    r = await call("POST", "/api/teacher/sheets", { auth, env: CFENV, body: { title: "CF", tasks } });
    assert.equal(r.status, 200, r.text); const c = r.json.code;
    r = await call("GET", "/api/sheet/" + c, { env: CFENV });
    assert.equal(r.json.sheet.aiRecipients, undefined); assert.equal(r.json.sheet.aiProvider, null);
    r = await call("POST", "/api/feedback", { env: CFENV, body: { code: c, answers: ["Licht", ""] } });
    assert.equal(r.status, 503); assert.equal(r.json.code, "ai_not_configured"); assert.equal(cf.calls.length, 0);
    r = await call("POST", "/api/teacher/ai/test", { auth, env: CFENV });
    assert.equal(r.status, 400); assert.match(r.json.error, /Noch nicht gespeichert/);
    // Eine Reserve ohne gespeicherten ersten Anbieter wäre der einzige Empfänger, während die Übersicht „nicht eingerichtet“ zeigt:
    // abgelehnt; ältere Einstellungen dieser Art geben der Reserve keine Schülertexte
    r = await call("PUT", "/api/teacher/ai", { auth, env: CFENV, body: { reserve: { provider: "cloudflare", model: "" } } });
    assert.equal(r.status, 400); assert.equal(r.json.error, "Bitte zuerst den ersten Anbieter speichern – die Reserve-KI springt nur für ihn ein.");
    assert.equal(settingsRow("ai"), null);
    d1.db.prepare("INSERT INTO settings(key,value) VALUES('ai',?)").run(JSON.stringify({ reserve: { provider: "cloudflare", model: "" } }));
    r = await call("GET", "/api/sheet/" + c, { env: CFENV });
    assert.equal(r.json.sheet.aiRecipients, undefined);
    r = await call("POST", "/api/feedback", { env: CFENV, body: { code: c, answers: ["Licht", ""] } });
    assert.equal(r.status, 503); assert.equal(r.json.code, "ai_not_configured"); assert.equal(cf.calls.length, 0);
    r = await call("GET", "/api/teacher/ai", { auth, env: CFENV });
    assert.equal(r.json.saved, false); assert.equal(r.json.reserve.provider, "cloudflare");   // sichtbar (und entfernbar) bleibt sie
    d1.db.prepare("DELETE FROM settings WHERE key='ai'").run();
    // Erst custom mit Schlüssel, dann Wechsel auf cloudflare ohne Schlüssel → erlaubt, der Schlüssel verschwindet
    r = await call("PUT", "/api/teacher/ai", { auth, env: CFENV, body: { provider: "custom", model: "", baseUrl: mock.url, apiKey: "sk-x-1234" } });
    assert.equal(r.status, 200, r.text);
    r = await call("PUT", "/api/teacher/ai", { auth, env: CFENV, body: { provider: "cloudflare", model: "", apiKey: "geheim" } });
    assert.equal(r.status, 400); assert.match(r.json.error, /kein API-Schlüssel nötig/);
    r = await call("PUT", "/api/teacher/ai", { auth, env: CFENV, body: { provider: "cloudflare", model: "openai/gpt-oss-120b" } });
    assert.equal(r.status, 400); assert.match(r.json.error, /„@cf\/“/);
    r = await call("PUT", "/api/teacher/ai", { auth, env: { ...CFENV, SETTINGS_SECRET: undefined }, body: { provider: "cloudflare", model: "" } });
    assert.equal(r.status, 200, r.text);   // ohne SETTINGS_SECRET speicherbar (kein Schlüssel)
    assert.deepEqual({ ready: r.json.ready, k: r.json.hasKey, h: r.json.keyHint, saved: r.json.saved, w: r.json.warning, err: r.json.keyError }, { ready: true, k: true, h: "", saved: true, w: undefined, err: undefined });
    assert.match(r.json.tierNote, /10\.000 Neurons/); assert.equal(r.json.modelCount, undefined);
    let s = settingsRow("ai"); assert.equal(s.apiKeyEnc, undefined); assert.equal(s.provider, "cloudflare"); assert.equal(JSON.stringify(s).includes("sk-x"), false);
    assert.deepEqual(s.fallbacks, [GEMMA, "@cf/zai-org/glm-4.7-flash", "@cf/qwen/qwen3-30b-a3b-fp8"]);
    // Empfänger: Rechtsträger und Sitz
    r = await call("GET", "/api/sheet/" + c, { env: CFENV });
    assert.deepEqual(r.json.sheet.aiRecipients, [{ id: "cloudflare", label: CF_LABEL }]); assert.equal(r.json.sheet.aiProvider, "Cloudflare Workers AI");
    // Ohne Binding (älterer Deploy): kein Empfänger, die Lehrkraft sieht den Grund; Speichern geht mit Warnung
    r = await call("GET", "/api/sheet/" + c, { env: ENV });
    assert.equal(r.json.sheet.aiRecipients, undefined);
    r = await call("GET", "/api/teacher/ai", { auth, env: ENV });
    assert.equal(r.json.ready, false); assert.equal(r.json.saved, true); assert.match(r.json.keyError, /Binding „AI“ fehlt/);
    r = await call("PUT", "/api/teacher/ai", { auth, env: ENV, body: { provider: "cloudflare", model: "" } });
    assert.equal(r.status, 200); assert.match(r.json.warning, /^Gespeichert, aber: Workers AI ist für diesen Worker nicht eingerichtet/);
    // Verbindungstest über das Binding: kurze Ausgabegrenze, Token-Zahlen (ohne Inhalt) für die Lehrkraft, Verbrauch gezählt
    r = await call("POST", "/api/teacher/ai/test", { auth, env: CFENV });
    assert.equal(r.status, 200, r.text); assert.equal(r.json.sample, "Verbindung steht."); assert.equal(r.json.modelCount, 3);
    assert.equal(cf.calls.at(-1).inputs.max_completion_tokens, 200);
    assert.ok(r.json.usage.prompt_tokens > 0 && r.json.usage.completion_tokens > 0); assert.equal(r.json.usage.reasoning_tokens, 0);
    assert.equal(usageRow().requests, 1);
    // Feedback über das Binding: Gemma mit Denkmodus aus und Ausgabegrenze 800 + 300 je Aufgabe, ≤ 18 D1-Abfragen
    cf.calls = []; mock.reset();
    r = await call("POST", "/api/feedback", { env: CFENV, body: { code: c, answers: ["Pflanzen brauchen Licht.", "x"], recipients: ["cloudflare"] } });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json.results, expectedResults(tasks, ["Pflanzen brauchen Licht.", "x"]));
    assert.equal(cf.calls.length, 1); assert.equal(cf.calls[0].model, GEMMA);
    assert.deepEqual(mock.state.requests[0].chat_template_kwargs, { enable_thinking: false }); assert.equal(mock.state.requests[0].max_completion_tokens, 1100);
    assert.deepEqual(Object.keys(cf.calls[0].opts).sort(), ["returnRawResponse", "signal"]);
    assert.ok(r.queries <= 18, "D1-Abfragen: " + r.queries);
    assert.equal(usageRow().requests, 2); assert.ok(usageRow().neurons > 0);
    r = await call("GET", "/api/teacher/ai", { auth, env: CFENV });
    assert.equal(r.json.usage.requests, 2); assert.equal(r.json.usage.limit, 10000); assert.equal(r.json.quotaUntil, null);
    // Lokal (wrangler dev --local): Binding da, Aufruf scheitert → Feedback 503 ai_not_configured, Test 502 mit Hinweis
    cf.mode = "local";
    r = await call("POST", "/api/feedback", { env: CFENV, body: { code: c, answers: ["Licht", ""] } });
    assert.equal(r.status, 503); assert.equal(r.json.code, "ai_not_configured");
    r = await call("POST", "/api/teacher/ai/test", { auth, env: CFENV });
    assert.equal(r.status, 502); assert.equal(r.json.aiCode, "CONFIG"); assert.match(r.json.error, /lokalen Entwicklung/);
    cf.mode = "ok";
    // Eine Reserve im selben Cloudflare-Konto bringt nichts: abgelehnt – in beiden Reihenfolgen
    r = await call("PUT", "/api/teacher/ai", { auth, env: CFENV, body: { reserve: { provider: "cloudflare", model: "" } } });
    assert.equal(r.status, 400); assert.match(r.json.error, /selben Cloudflare-Konto/);
    r = await call("PUT", "/api/teacher/ai", { auth, env: CFENV, body: { provider: "custom", model: "", baseUrl: mock.url, apiKey: "sk-y-5678", reserve: { provider: "cloudflare", model: "" } } });
    assert.equal(r.status, 200, r.text); assert.equal(r.json.reserve.ready, true);
    r = await call("GET", "/api/sheet/" + c, { env: CFENV });
    assert.deepEqual(r.json.sheet.aiRecipients.map((x) => x.id), [mockId, "cloudflare"]);
    r = await call("PUT", "/api/teacher/ai", { auth, env: CFENV, body: { provider: "cloudflare", model: "" } });
    assert.equal(r.status, 400); assert.match(r.json.error, /selben Cloudflare-Konto/);
    assert.equal(settingsRow("ai").provider, "custom");   // unverändert
    // Workers AI zuerst, Reserve custom mit vier Modellen: Tageskontingent (3036) → die Reserve antwortet; danach fragt der
    // Server Workers AI bis 0:00 UTC nicht mehr, und die Reserve bekommt das volle Budget (6 statt 3 Versuche)
    r = await call("PUT", "/api/teacher/ai", { auth, env: CFENV, body: { provider: "cloudflare", model: "", reserve: { provider: "custom", model: "mock-extra", baseUrl: mock.url, apiKey: "sk-r-5555" } } });
    assert.equal(r.status, 200, r.text);
    cf.mode = "cf3036"; cf.calls = []; mock.reset();
    r = await call("POST", "/api/feedback", { env: CFENV, body: { code: c, answers: ["Licht", ""], recipients: ["cloudflare", mockId] }, ip: "203.0.113.90" });
    assert.equal(r.status, 200, r.text); assert.equal(cf.calls.length, 1); assert.equal(mock.state.requests.length, 1);
    assert.equal(lockRow().until, nextUtcMidnight());
    r = await call("GET", "/api/teacher/ai", { auth, env: CFENV });
    assert.equal(r.json.quotaUntil, nextUtcMidnight());
    cf.calls = []; mock.reset(); mock.setMode("badjson");
    r = await call("POST", "/api/feedback", { env: CFENV, body: { code: c, answers: ["Licht", ""], recipients: ["cloudflare", mockId] }, ip: "203.0.113.91" });
    assert.equal(r.status, 502); assert.equal(r.json.aiCode, "BAD_JSON");
    assert.equal(cf.calls.length, 0, "keine Anfrage an Workers AI bis 0:00 UTC");
    assert.deepEqual(mock.state.requests.map((q) => q.model).sort(), ["llama-3.3-70b-versatile", "mock-extra", "openai/gpt-oss-120b", "qwen/qwen3-32b"], "volles Budget: alle vier Modelle (Startmodell zufällig versetzt)");
    mock.setMode("ok"); d1.db.prepare("DELETE FROM ai_skip WHERE provider='custom'").run();
    // Erneutes Speichern hebt die Sperre nicht auf (sie gilt für das Konto); ohne Reserve: 503 ai_quota ohne Retry-After und ohne Zählung
    r = await call("PUT", "/api/teacher/ai", { auth, env: CFENV, body: { provider: "cloudflare", model: "", reserve: null } });
    assert.equal(r.status, 200); assert.equal(r.json.quotaUntil, nextUtcMidnight()); assert.ok(lockRow());
    const saved = RATE.feedback.max;
    RATE.feedback.max = 1;
    try {
      for (let k = 0; k < 2; k++) {
        r = await call("POST", "/api/feedback", { env: CFENV, body: { code: c, answers: ["Licht", ""] }, ip: "203.0.113.92" });
        assert.equal(r.status, 503); assert.equal(r.json.code, "ai_quota"); assert.equal(r.json.error, "Das KI-Kontingent für heute ist aufgebraucht. Morgen geht es wieder.");
        assert.equal(r.headers.get("retry-after"), null); assert.equal(r.json.retryAfter, undefined);
      }
      assert.equal(cf.calls.length, 0);
      // Ohne Sperre trifft der Aufruf selbst auf 3036: gezählt wird erst, dann erstattet; die Sperre entsteht sofort
      d1.db.prepare("DELETE FROM ai_skip").run();
      r = await call("POST", "/api/feedback", { env: CFENV, body: { code: c, answers: ["Licht", ""] }, ip: "203.0.113.93" });
      assert.equal(r.status, 503); assert.equal(r.json.code, "ai_quota"); assert.equal(cf.calls.length, 1); assert.ok(lockRow());
      const b = await bucketOf("feedback", "203.0.113.93", SECRET);
      assert.equal(d1.db.prepare("SELECT count FROM rate_limits WHERE bucket=?").get(b).count, 0, "Zählung erstattet");
    } finally { RATE.feedback.max = saved; }
    // Ein erfolgreicher Verbindungstest (z. B. nach einem Wechsel auf Workers Paid) hebt die Sperre auf
    cf.mode = "ok";
    r = await call("POST", "/api/teacher/ai/test", { auth, env: CFENV });
    assert.equal(r.status, 200, r.text); assert.equal(lockRow(), undefined);
    r = await call("GET", "/api/teacher/ai", { auth, env: CFENV });
    assert.equal(r.json.quotaUntil, null);
    // Der Verbindungstest selbst auf 3036: Sperre sofort (Schüler:innen bekommen dann gleich ai_quota)
    cf.mode = "cf3036";
    r = await call("POST", "/api/teacher/ai/test", { auth, env: CFENV });
    assert.equal(r.status, 502); assert.equal(r.json.aiCode, "DAILY_LIMIT"); assert.match(r.json.error, /Tageskontingent von Workers AI/); assert.ok(lockRow());
    // Unbekannte Ablehnung (400) bei allen Modellen → kein HTTP-Abbruch nach dem ersten Modell, sondern alle Modelle versucht;
    // gesperrt werden sie nur kurz (TTL.soft) – eine einzelne seltsame Anfrage ändert die Modellfolge nicht für einen ganzen Tag
    d1.db.prepare("DELETE FROM ai_skip").run(); cf.mode = "cf400"; cf.calls = [];
    r = await call("POST", "/api/feedback", { env: CFENV, body: { code: c, answers: ["Licht", ""] }, ip: "203.0.113.94" });
    assert.equal(r.status, 502); assert.equal(r.json.code, "ai_error");
    assert.deepEqual([...new Set(cf.calls.map((x) => x.model))], [GEMMA, "@cf/zai-org/glm-4.7-flash"], "6 Versuche: Gemma dreimal, GLM dreimal");
    assert.equal(cf.calls.length, 6);
    assert.deepEqual(cf.calls.slice(0, 3).map((x) => [!!x.inputs.chat_template_kwargs, !!x.inputs.response_format]), [[true, true], [true, false], [false, false]], "erst ohne JSON-Modus, Denkmodus bleibt aus");
    const locks = d1.db.prepare("SELECT model, until FROM ai_skip WHERE provider='cloudflare' AND model<>'*'").all();
    assert.equal(locks.length, 2); assert.ok(locks.every((x) => x.until - Date.now() <= TTL.soft), JSON.stringify(locks));
    // Aufräumen: alte Verbrauchszeilen (älter als zwei Tage) verschwinden beim gelegentlichen Aufräumen
    d1.db.prepare("INSERT INTO ai_usage VALUES('2000-01-01','cloudflare',5,10)").run();
    const rnd = Math.random; Math.random = () => 0;
    try { await call("GET", "/api/sheet/" + c, { env: CFENV }); } finally { Math.random = rnd; }
    assert.equal(d1.db.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE day='2000-01-01'").get().n, 0);
    assert.ok(usageRow(), "heutige Zeile bleibt");
    assert.equal((await call("DELETE", "/api/teacher/sheets/" + c, { auth })).status, 200);
  } finally {
    cf.mode = "ok"; mock.setMode("ok");
    d1.db.prepare("DELETE FROM ai_skip").run();
    await call("PUT", "/api/teacher/ai", { auth, body: { provider: "custom", model: "", baseUrl: mock.url, apiKey: "sk-unit-again", reserve: null } });
  }
});

// D1-Abfragen je Feedback (Anweisungen eines Batches einzeln gezählt, Schema schon angelegt): Aufräumen 3 + Blatt/Einstellungen 2 +
// Sperren je Eintrag 1 + Zählung 3 + je Versuch ≤ 3 (Warteschlange voll: Reservierung + Nachfrage 2; sonst Reservierung + Sperre)
// + Verbrauch/Sperre 2 + Erstattung 3 → ohne Reserve (6 Versuche) ≤ 32, mit Reserve (6 + 3 Versuche) ≤ 42 – unter der Grenze 50
test("feedback: ungünstiger Fall mit Reserve (alle Warteschlangen voll, Aufräumen, Erstattung) bleibt unter der Grenze von 42 D1-Abfragen", async () => {
  const cf = mockAIBinding(mock), CFENV = { ...ENV, AI: cf };
  let r = await call("PUT", "/api/teacher/ai", { auth, env: CFENV, body: { provider: "custom", model: "", baseUrl: mock.url, apiKey: "sk-unit-again", reserve: { provider: "cloudflare", model: "" } } });
  assert.equal(r.status, 200, r.text);
  r = await call("POST", "/api/teacher/sheets", { auth, env: CFENV, body: { title: "D1", tasks } });
  assert.equal(r.status, 200, r.text); const c = r.json.code;
  const full = d1.db.prepare("INSERT INTO ai_gate(provider,next_at) VALUES(?,?) ON CONFLICT(provider) DO UPDATE SET next_at=excluded.next_at");
  for (const k of ["custom", "cloudflare"]) full.run(k, Date.now() + 120000);   // beide Warteschlangen 2 Minuten voll
  const rnd = Math.random; Math.random = () => 0;   // das gelegentliche Aufräumen läuft mit
  try {
    cf.calls = []; mock.reset();
    r = await call("POST", "/api/feedback", { env: CFENV, body: { code: c, answers: ["Licht", ""], recipients: ["custom:127.0.0.1:" + mock.port, "cloudflare"] }, ip: "203.0.113.96" });
  } finally { Math.random = rnd; d1.db.prepare("DELETE FROM ai_gate").run(); }
  assert.equal(r.status, 429, r.text); assert.equal(r.json.code, "ai_busy");
  assert.equal(cf.calls.length, 0); assert.equal(mock.state.requests.length, 0);   // nichts ging an eine KI
  console.log("# D1-Abfragen im ungünstigen Fall mit Reserve: " + r.queries);
  assert.ok(r.queries >= 30 && r.queries <= 42, "D1-Abfragen: " + r.queries);
  assert.equal((await call("DELETE", "/api/teacher/sheets/" + c, { auth })).status, 200);
  assert.equal((await call("PUT", "/api/teacher/ai", { auth, body: { reserve: null } })).status, 200);
});

test("password change keeps key pair; delete flow", async () => {
  const kdf = { salt: b64(crypto.getRandomValues(new Uint8Array(16))), iterations: 100000 };
  const k2 = await deriveTeacherKeys("Ganz neues Passwort!", kdf);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k2.encKey, T.pkcs8);
  let r = await call("POST", "/api/teacher/password", { auth, body: { newAuthKey: k2.authKey, kdf, encPrivateKey: { iv: b64(iv), ct: b64(ct) } } });
  assert.deepEqual(r.json, { ok: true });
  assert.equal((await call("GET", "/api/teacher/sheets", { auth })).status, 401);
  auth = k2.authKey;
  r = await call("POST", "/api/teacher/login", { auth });
  assert.equal(r.json.publicKey, T.publicKey);
  r = await call("DELETE", "/api/teacher/sheets/" + code + "/submissions", { auth });
  assert.deepEqual(r.json, { ok: true, deleted: 1 });
  r = await call("DELETE", "/api/teacher/sheets/" + code, { auth });
  assert.equal(r.json.ok, true);
  assert.equal((await call("GET", "/api/sheet/" + code)).status, 404);
});

test("unexpected errors → 500 without internals; D1 daily limit → 503", async () => {
  d1.fail = "D1_ERROR: no such table: geheim_intern";
  let r = await call("GET", "/api/sheet/K7QM4X");
  assert.equal(r.status, 500); assert.equal(r.json.code, "server_error"); assert.equal(r.text.includes("geheim"), false);
  d1.fail = "D1_ERROR: Your account has exceeded D1's free tier daily row read limit";
  r = await call("GET", "/api/sheet/K7QM4X");
  assert.equal(r.status, 503); assert.equal(r.json.code, "db_limit");
  d1.fail = "D1_ERROR: Exceeded maximum DB size";   // Datenbank voll → eigene Meldung statt „Fehler auf dem Server“
  r = await call("GET", "/api/sheet/K7QM4X");
  assert.equal(r.status, 503); assert.equal(r.json.code, "db_full");
  d1.fail = null;
  console.log("# höchste Zahl an D1-Abfragen je Request: " + maxQueries);
});
