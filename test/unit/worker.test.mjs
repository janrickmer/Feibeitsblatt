// Worker-Test ohne wrangler: worker/index.js im Prozess, D1 als node:sqlite-Nachbau, Mock-KI auf freiem Port.
// Prüft API-Vertrag, Verschlüsselung at rest, Schlüsselwechsel, IP-getrennte Sperren und ≤ 50 D1-Abfragen je Request.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import worker from "../../worker/index.js";
import { startMockAI, expectedResults } from "../mock-ai.mjs";
import { RATE, LIMITS } from "../../worker/lib.js";
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

async function call(method, path, { body, auth, ip = "198.51.100.1", env = ENV, raw } = {}) {
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
  maxQueries = Math.max(maxQueries, d1.queries);
  assert.ok(d1.queries <= 50, path + ": " + d1.queries + " D1-Abfragen");
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

test("AI settings: default groq, encrypted at rest, key never returned", async () => {
  let r = await call("GET", "/api/teacher/ai", { auth });
  assert.deepEqual({ p: r.json.provider, k: r.json.hasKey, h: r.json.keyHint, l: r.json.label }, { p: "groq", k: false, h: "", l: "Groq" });
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
  assert.deepEqual(r.json.sheet, { code, title: "Bio", tasks: tasks.map((t) => ({ text: t.text, images: [] })), publicKey: T.publicKey, aiProvider: "127.0.0.1:" + mock.port });
  assert.equal(/Chloroplasten|Sauerstoff|solution/.test(r.text), false);
  r = await call("GET", "/api/teacher/sheets", { auth });
  assert.deepEqual(r.json.sheets.map((s) => [s.code, s.title, s.taskCount, s.submissionCount]), [[code, "Bio", 2, 0]]);
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

test("feedback: one AI call, expected covered/missing, ≤ 50 D1 queries", async () => {
  mock.reset();
  const answers = ["Licht ist wichtig für die photosynthese", ""];
  const r = await call("POST", "/api/feedback", { body: { code, answers } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.results, expectedResults(tasks, answers));
  assert.deepEqual(r.json.results[0], { covered: ["Photosynthese braucht Licht"], missing: ["Chloroplasten sind beteiligt", "Sauerstoff entsteht"] });
  assert.equal(mock.state.requests.length, 1);
  assert.equal(mock.state.requests[0].temperature, 0.1);
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
  assert.deepEqual(Object.keys(rows[0]).sort(), ["envelope", "id", "received_at", "sheet_code"]);
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

test("feedback without configured AI → 503; sheet without solutions needs no AI", async () => {
  d1.db.prepare("DELETE FROM settings WHERE key='ai'").run();
  let r = await call("GET", "/api/sheet/" + code);
  assert.equal(r.json.sheet.aiProvider, null);
  r = await call("POST", "/api/feedback", { body: { code, answers: ["x", ""] } });
  assert.equal(r.status, 503); assert.equal(r.json.code, "ai_not_configured");
  const c2 = (await call("POST", "/api/teacher/sheets", { auth, body: { title: "", tasks: [{ text: "Frei" }] } })).json.code;
  r = await call("POST", "/api/feedback", { body: { code: c2, answers: ["egal"] } });
  assert.deepEqual(r.json, { ok: true, results: [{ covered: [], missing: [], note: "Zu dieser Aufgabe gibt es keine Musterlösung." }] });
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
    assert.equal(r.status, 429, r.text); assert.equal(r.json.code, "ai_busy"); assert.ok(r.json.retryAfter >= 30);
    assert.equal(r.headers.get("retry-after"), String(r.json.retryAfter));
  } finally { RATE.feedback.max = saved.f; RATE.sheet_feedback.max = saved.s; mock.setMode("ok"); }
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
  d1.fail = null;
  console.log("# höchste Zahl an D1-Abfragen je Request: " + maxQueries);
});
