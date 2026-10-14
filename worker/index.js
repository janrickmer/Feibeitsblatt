// index.js – Cloudflare Worker für Feibeitsblatt (ES-Modul): API unter /api/*, sonst statische Seite aus ./dist.
// Der Server sieht nie Klartext-Abgaben oder das Lehrkraft-Passwort (Ende-zu-Ende, siehe SPEC §2). Free-Plan:
// nur SHA-256/AES-GCM im Worker (kein PBKDF2, keine RSA-Erzeugung), D1-Abfragen gebündelt (batch).
import {
  normalizeCode, isValidCode, generateCode, sha256Hex, timingSafeEqualStr, decodeAuthKey, importPublicKey,
  validateKdf, validateEncPrivateKey, validateEnvelope, validateSheetInput, validateAnswers, validateAiInput,
  keyHintOf, sealSecret, openSecret, bucketOf, rateMessage, RATE, LIMITS, InputError,
} from "./lib.js";
import {
  PROVIDERS, DEFAULT_PROVIDER, AIError, PUBLIC_MSG, callAI, testKey, pickFallbacks, providerLabel,
  buildFeedbackMessages, normalizeFeedback, feedbackResults, feedbackAcceptor, FEEDBACK_SCHEMA_GEMINI,
  TEST_MESSAGES, reserveSlot, skipQuery, skipStatements,
} from "./ai.js";

const MSG = {
  unknownCode: "Zu diesem Code gibt es kein Feibeitsblatt. Bitte prüfe den Code.",
  notFound: "Diese Adresse gibt es nicht.",
  method: "Diese Methode ist hier nicht erlaubt.",
  badJson: "Die Anfrage konnte nicht gelesen werden (ungültiges JSON).",
  tooLarge: "Die Anfrage ist zu groß.",
  server: "Auf dem Server ist ein Fehler aufgetreten. Bitte später erneut versuchen.",
  dbLimit: "Die Datenbank hat ihr kostenloses Tageskontingent erreicht. Bitte morgen erneut versuchen.",
  sheetGone: "Dieses Feibeitsblatt gibt es nicht mehr. Bitte laden Sie die Übersicht neu.",
  unauthorized: "Passwort falsch.",
  notSetup: "Es ist noch kein Lehrkraft-Passwort festgelegt.",
  alreadySetup: "Für diese Seite ist bereits ein Lehrkraft-Passwort festgelegt.",
  aiNotConfigured: "Die Lehrkraft hat das KI-Feedback noch nicht eingerichtet.",
  aiNoKey: "Bitte zuerst einen API-Schlüssel speichern.",
  aiKeyLost: "Bitte den API-Schlüssel neu eintragen.",
  tooMany: "Für dieses Feibeitsblatt sind bereits sehr viele Abgaben gespeichert. Bitte wende dich an deine Lehrkraft.",
};

/* ---------- Antworten ---------- */
const API_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "Retry-After",
};
const respond = (body, status = 200, extra = {}) => new Response(body, { status, headers: { ...API_HEADERS, ...extra } });
const json = (data, status = 200, extra = {}) => respond(JSON.stringify(data), status, extra);

class HttpError extends Error {
  constructor(status, code, message, extra = {}) { super(message); this.status = status; this.code = code; this.extra = extra; }
}
function fail(status, code, error, extra = {}) {
  const headers = extra.retryAfter ? { "Retry-After": String(extra.retryAfter) } : {};
  return json({ ok: false, error, code, ...extra }, status, headers);
}

/* ---------- Schema (einmal je Isolate, idempotent) ---------- */
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS sheets (code TEXT PRIMARY KEY, title TEXT NOT NULL, tasks TEXT NOT NULL, created_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, sheet_code TEXT NOT NULL, received_at INTEGER NOT NULL, envelope TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_submissions_sheet ON submissions(sheet_code)",
  "CREATE TABLE IF NOT EXISTS rate_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS ai_gate (provider TEXT PRIMARY KEY, next_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS ai_skip (provider TEXT NOT NULL, model TEXT NOT NULL, until INTEGER NOT NULL, reason TEXT, PRIMARY KEY(provider, model))",
];
let schemaReady = false;   // kein geteiltes Promise: workerd erlaubt kein I/O über Request-Grenzen hinweg
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  schemaReady = true;
}

/* ---------- Body lesen (≤ 1 MB) ---------- */
async function readJson(request) {
  const cl = Number(request.headers.get("content-length"));
  if (cl > LIMITS.bodyBytes) throw new HttpError(413, "too_large", MSG.tooLarge);
  let text = "";
  if (request.body) {
    const reader = request.body.getReader(), chunks = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n <= LIMITS.bodyBytes) chunks.push(value);
      else if (n > 8 * LIMITS.bodyBytes) { try { await reader.cancel(); } catch {} break; }   // Rest verwerfen, sehr große Bodies abbrechen
    }
    if (n > LIMITS.bodyBytes) throw new HttpError(413, "too_large", MSG.tooLarge);
    const all = new Uint8Array(n); let o = 0;
    for (const c of chunks) { all.set(c, o); o += c.byteLength; }
    text = new TextDecoder().decode(all);
  }
  let data;
  try { data = JSON.parse(text); } catch { throw new HttpError(400, "bad_json", MSG.badJson); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new HttpError(400, "bad_json", MSG.badJson);
  return data;
}

/* ---------- Einstellungen ---------- */
const settingStmt = (db, key) => db.prepare("SELECT value FROM settings WHERE key=?1").bind(key);
function parseSetting(row) {
  if (!row || typeof row.value !== "string") return null;
  try { const v = JSON.parse(row.value); return v && typeof v === "object" ? v : null; } catch { return null; }
}
const firstRow = (res) => (res && res.results && res.results[0]) || null;

// settings.ai → nutzbare Konfiguration (API-Schlüssel entschlüsselt; nicht entschlüsselbar → „kein Schlüssel“)
async function aiConfig(env, row) {
  const s = parseSetting(row) || {};
  const provider = PROVIDERS[s.provider] ? s.provider : DEFAULT_PROVIDER;
  let apiKey = "", keyError = "";
  if (s.apiKeyEnc) { apiKey = (await openSecret(s.apiKeyEnc, env.SETTINGS_SECRET)) || ""; if (!apiKey) keyError = MSG.aiKeyLost; }
  else if (typeof s.apiKey === "string") apiKey = s.apiKey;
  const fallbacks = Array.isArray(s.fallbacks) ? s.fallbacks.filter((x) => typeof x === "string").slice(0, 10) : [];
  return { provider, model: typeof s.model === "string" ? s.model : "", baseUrl: provider === "custom" && typeof s.baseUrl === "string" ? s.baseUrl : "",
    fallbacks, apiKey, keyError, stored: s, raw: row ? row.value : null };
}
const hasStoredKey = (s) => !!(s && (s.apiKeyEnc || (typeof s.apiKey === "string" && s.apiKey)));
function aiPublicView(ai) {
  const p = PROVIDERS[ai.provider];
  const out = { provider: ai.provider, label: p.label, model: ai.model, defaultModel: p.defaultModel, baseUrl: ai.baseUrl,
    hasKey: !!ai.apiKey, keyHint: ai.apiKey ? keyHintOf(ai.apiKey) : "", fallbacks: ai.fallbacks };
  if (ai.keyError) out.keyError = ai.keyError;
  return out;
}
const cfgOf = (ai, skip = []) => ({ provider: ai.provider, apiKey: ai.apiKey, model: ai.model, fallbacks: ai.fallbacks, skip, base: ai.baseUrl });

/* ---------- Rate-Limits (festes Zeitfenster, IP nur gehasht) ---------- */
const rlSelect = (db, bucket) => db.prepare("SELECT count, reset_at FROM rate_limits WHERE bucket=?1").bind(bucket);
const rlHit = (db, bucket, kind, now) => db.prepare(
  "INSERT INTO rate_limits(bucket,count,reset_at) VALUES(?1,1,?2+?3) ON CONFLICT(bucket) DO UPDATE SET " +
  "count=CASE WHEN reset_at<=?2 THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at<=?2 THEN ?2+?3 ELSE reset_at END " +
  "RETURNING count, reset_at").bind(bucket, now, RATE[kind].windowMs);
function retryAfterOf(row, kind, now, inclusive = true) {   // > 0 → gesperrt
  if (!row || row.reset_at <= now) return 0;
  const over = inclusive ? row.count >= RATE[kind].max : row.count > RATE[kind].max;
  return over ? Math.max(1, Math.ceil((row.reset_at - now) / 1000)) : 0;
}
const limited = (kind, retryAfter) => new HttpError(429, "rate_limited", rateMessage(kind, retryAfter), { retryAfter });
const bucket = (c, kind) => bucketOf(kind, c.ip, c.env.SETTINGS_SECRET || "");
async function countEvery(c, kind) {   // jede Anfrage zählt (feedback, submit)
  const row = await rlHit(c.db, await bucket(c, kind), kind, c.now).first();
  const ra = retryAfterOf(row, kind, c.now, false);
  if (ra) throw limited(kind, ra);
}

/* ---------- Lehrkraft-Zugang ---------- */
const doorCodeOf = (env) => String(env.TEACHER_DOOR_CODE || "1104");
async function checkDoor(c, doorCode, rlRow, b) {
  const ra = retryAfterOf(rlRow, "door", c.now);
  if (ra) throw limited("door", ra);
  const given = typeof doorCode === "string" ? doorCode.trim() : typeof doorCode === "number" ? String(doorCode) : "";
  if (!timingSafeEqualStr(given, doorCodeOf(c.env))) {
    await rlHit(c.db, b, "door", c.now).run();
    throw new HttpError(403, "wrong_code", MSG.unknownCode);
  }
}
async function requireTeacher(c) {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(c.request.headers.get("authorization") || "");
  if (!m) throw new HttpError(401, "unauthorized", MSG.unauthorized);
  const b = await bucket(c, "auth");
  const [rl, st] = await c.db.batch([rlSelect(c.db, b), settingStmt(c.db, "teacher")]);
  const ra = retryAfterOf(firstRow(rl), "auth", c.now);
  if (ra) throw limited("auth", ra);
  const row = firstRow(st), teacher = parseSetting(row);
  if (!teacher || typeof teacher.authHash !== "string") throw new HttpError(409, "not_setup", MSG.notSetup);
  const raw = decodeAuthKey(m[1]);
  const hash = await sha256Hex(raw || new Uint8Array(32));
  if (!raw || !timingSafeEqualStr(hash, teacher.authHash)) {
    await rlHit(c.db, b, "auth", c.now).run();
    throw new HttpError(401, "unauthorized", MSG.unauthorized);
  }
  return { teacher, raw: row.value };
}

async function routeDoor(c) {
  const body = await readJson(c.request);
  const b = await bucket(c, "door");
  const [rl, st] = await c.db.batch([rlSelect(c.db, b), settingStmt(c.db, "teacher")]);
  await checkDoor(c, body.doorCode, firstRow(rl), b);
  const t = parseSetting(firstRow(st));
  return json({ ok: true, setup: !!t, kdf: t ? t.kdf : null });
}

async function routeSetup(c) {
  const body = await readJson(c.request);
  const b = await bucket(c, "door");
  const [rl, st] = await c.db.batch([rlSelect(c.db, b), settingStmt(c.db, "teacher")]);
  await checkDoor(c, body.doorCode, firstRow(rl), b);
  if (firstRow(st)) throw new HttpError(409, "already_setup", MSG.alreadySetup);
  const raw = decodeAuthKey(body.authKey);
  if (!raw) throw new InputError("Ungültiger Anmeldeschlüssel.");
  const kdf = validateKdf(body.kdf);
  await importPublicKey(body.publicKey);
  const encPrivateKey = validateEncPrivateKey(body.encPrivateKey);
  const value = JSON.stringify({ authHash: await sha256Hex(raw), kdf, publicKey: body.publicKey, encPrivateKey, createdAt: c.now });
  const r = await c.db.prepare("INSERT INTO settings(key,value) VALUES('teacher',?1) ON CONFLICT(key) DO NOTHING").bind(value).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(409, "already_setup", MSG.alreadySetup);
  return json({ ok: true });
}

async function routeLogin(c) {
  const { teacher } = await requireTeacher(c);
  return json({ ok: true, publicKey: teacher.publicKey, encPrivateKey: teacher.encPrivateKey, kdf: teacher.kdf });
}

async function routePassword(c) {
  const { teacher, raw } = await requireTeacher(c);
  const body = await readJson(c.request);
  const key = decodeAuthKey(body.newAuthKey);
  if (!key) throw new InputError("Ungültiger neuer Anmeldeschlüssel.");
  const kdf = validateKdf(body.kdf), encPrivateKey = validateEncPrivateKey(body.encPrivateKey);
  const value = JSON.stringify({ ...teacher, authHash: await sha256Hex(key), kdf, encPrivateKey, updatedAt: c.now });
  const r = await c.db.prepare("UPDATE settings SET value=?1 WHERE key='teacher' AND value=?2").bind(value, raw).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(409, "conflict", "Das Passwort wurde inzwischen geändert. Bitte melden Sie sich neu an.");
  return json({ ok: true });
}

/* ---------- Feibeitsblätter (Lehrkraft) ---------- */
function codeParam(s) {
  let v = s; try { v = decodeURIComponent(s); } catch {}
  return normalizeCode(v);
}
const sheetNotFound = () => new HttpError(404, "not_found", MSG.unknownCode);   // Schüler:innen
const sheetGone = () => new HttpError(404, "not_found", MSG.sheetGone);          // Lehrkraft
function parseTasks(text) {
  try { const t = JSON.parse(text); return Array.isArray(t) ? t : []; } catch { return []; }
}

async function routeSheetsList(c) {
  await requireTeacher(c);
  const { results } = await c.db.prepare(
    "SELECT s.code, s.title, s.created_at, json_array_length(s.tasks) AS task_count, " +
    "(SELECT COUNT(*) FROM submissions WHERE sheet_code=s.code) AS submission_count " +
    "FROM sheets s ORDER BY s.created_at DESC, s.code LIMIT 1000").all();
  return json({ ok: true, sheets: (results || []).map((r) => ({ code: r.code, title: r.title, createdAt: r.created_at,
    taskCount: r.task_count || 0, submissionCount: r.submission_count || 0 })) });
}

async function routeSheetCreate(c) {
  await requireTeacher(c);
  const { title, tasks } = validateSheetInput(await readJson(c.request), c.now);
  const tasksJson = JSON.stringify(tasks);
  for (let i = 0; i < 8; i++) {   // bei Kollision neu würfeln
    const code = generateCode();
    const r = await c.db.prepare("INSERT INTO sheets(code,title,tasks,created_at) VALUES(?1,?2,?3,?4) ON CONFLICT(code) DO NOTHING")
      .bind(code, title, tasksJson, c.now).run();
    if (r.meta && r.meta.changes) return json({ ok: true, code, title, createdAt: c.now, taskCount: tasks.length });
  }
  throw new Error("Kein freier Code gefunden");
}

async function routeSheetGet(c, codeRaw) {
  await requireTeacher(c);
  const code = codeParam(codeRaw);
  if (!isValidCode(code)) throw sheetGone();
  const [sh, cnt] = await c.db.batch([
    c.db.prepare("SELECT code, title, tasks, created_at FROM sheets WHERE code=?1").bind(code),
    c.db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE sheet_code=?1").bind(code),
  ]);
  const s = firstRow(sh);
  if (!s) throw sheetGone();
  const tasks = parseTasks(s.tasks).map((t) => ({ text: String(t.text || ""), solution: String(t.solution || "") }));
  return json({ ok: true, sheet: { code: s.code, title: s.title, createdAt: s.created_at, tasks, submissionCount: (firstRow(cnt) || {}).n || 0 } });
}

async function routeSheetDelete(c, codeRaw) {
  await requireTeacher(c);
  const code = codeParam(codeRaw);
  if (!isValidCode(code)) throw sheetGone();
  const [subs, sh] = await c.db.batch([
    c.db.prepare("DELETE FROM submissions WHERE sheet_code=?1").bind(code),
    c.db.prepare("DELETE FROM sheets WHERE code=?1").bind(code),
  ]);
  if (!sh.meta || !sh.meta.changes) throw sheetGone();
  return json({ ok: true, deletedSubmissions: (subs.meta && subs.meta.changes) || 0 });
}

async function routeSubmissionsList(c, codeRaw) {
  await requireTeacher(c);
  const code = codeParam(codeRaw);
  if (!isValidCode(code)) throw sheetGone();
  const [sh, subs] = await c.db.batch([
    c.db.prepare("SELECT 1 AS x FROM sheets WHERE code=?1").bind(code),
    c.db.prepare("SELECT id, received_at, envelope FROM submissions WHERE sheet_code=?1 ORDER BY id").bind(code),
  ]);
  if (!firstRow(sh)) throw sheetGone();
  // Umschläge liegen als von uns normalisiertes JSON vor → ohne erneutes Parsen einsetzen (spart CPU-Zeit)
  const items = (subs.results || []).map((r) => '{"id":' + Number(r.id) + ',"receivedAt":' + Number(r.received_at) + ',"envelope":' + r.envelope + "}");
  return respond('{"ok":true,"submissions":[' + items.join(",") + "]}");
}

async function routeSubmissionsDelete(c, codeRaw) {
  await requireTeacher(c);
  const code = codeParam(codeRaw);
  if (!isValidCode(code)) throw sheetGone();
  const [sh, del] = await c.db.batch([
    c.db.prepare("SELECT 1 AS x FROM sheets WHERE code=?1").bind(code),
    c.db.prepare("DELETE FROM submissions WHERE sheet_code=?1").bind(code),
  ]);
  if (!firstRow(sh)) throw sheetGone();
  return json({ ok: true, deleted: (del.meta && del.meta.changes) || 0 });
}

/* ---------- KI-Einstellungen (Lehrkraft) ---------- */
// Globaler Mindestabstand je Anbieter: höchstens 60 s warten und nur so lange, dass danach noch ~20 s für die KI bleiben
const gate = (c) => (provider, gapMs, remainingMs = 100000) => reserveSlot(c.db, provider, gapMs, Math.max(0, Math.min(60000, remainingMs - 20000)));

async function routeAiGet(c) {
  await requireTeacher(c);
  const ai = await aiConfig(c.env, await settingStmt(c.db, "ai").first());
  return json({ ok: true, ...aiPublicView(ai) });
}

async function storeAi(c, stored, apiKey) {
  const s = { ...stored };
  delete s.apiKey; delete s.apiKeyEnc;
  if (apiKey) {
    if (c.env.SETTINGS_SECRET) s.apiKeyEnc = await sealSecret(apiKey, c.env.SETTINGS_SECRET);
    else s.apiKey = apiKey;   // lokale Entwicklung ohne Secret
  }
  return JSON.stringify(s);
}

async function routeAiPut(c) {
  await requireTeacher(c);
  const input = validateAiInput(await readJson(c.request), PROVIDERS);
  const cur = await aiConfig(c.env, await settingStmt(c.db, "ai").first());
  const apiKey = input.apiKey || cur.apiKey;   // leer → alter Schlüssel bleibt
  let fallbacks = [], warning = "", tierNote = "", modelCount = null;
  if (apiKey) {   // Rangliste der Modelle → Ausweich-Liste
    try {
      const t = await testKey({ provider: input.provider, apiKey, base: input.baseUrl });
      fallbacks = pickFallbacks(t.models); tierNote = t.tierNote; modelCount = t.models.length;
    } catch (e) {
      if (!(e instanceof AIError)) throw e;
      warning = "Gespeichert, aber die Verbindung konnte nicht geprüft werden: " + e.message;
      if (cur.provider === input.provider && cur.baseUrl === input.baseUrl) fallbacks = cur.fallbacks;
    }
  }
  const stored = { provider: input.provider, model: input.model, baseUrl: input.baseUrl, keyHint: keyHintOf(apiKey), fallbacks, updatedAt: c.now };
  const value = await storeAi(c, stored, apiKey);
  await c.db.batch([
    c.db.prepare("INSERT INTO settings(key,value) VALUES('ai',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(value),
    c.db.prepare("DELETE FROM ai_skip WHERE provider=?1").bind(input.provider),   // neuer Schlüssel/Modell: Sperren aufheben
  ]);
  const view = aiPublicView({ ...input, apiKey, fallbacks, keyError: "" });
  const out = { ok: true, ...view };
  if (modelCount != null) out.modelCount = modelCount;
  if (tierNote) out.tierNote = tierNote;
  if (warning) out.warning = warning;
  return json(out);
}

async function routeAiTest(c) {
  await requireTeacher(c);
  const ai = await aiConfig(c.env, await settingStmt(c.db, "ai").first());
  if (!ai.apiKey) throw new HttpError(400, "ai_not_configured", ai.keyError || MSG.aiNoKey);
  let t;
  try { t = await testKey(cfgOf(ai)); }
  catch (e) { if (e instanceof AIError) throw new HttpError(502, "ai_error", e.message, { aiCode: e.code }); throw e; }
  ai.fallbacks = pickFallbacks(t.models);
  const skip = ((await skipQuery(c.db, ai.provider, c.now).all()).results || []).map((r) => r.model);
  let out;
  try {
    out = await callAI(cfgOf(ai, skip), TEST_MESSAGES, { temperature: 0.1, maxAttempts: 4, timeoutMs: 30000, deadlineMs: 60000, maxWaitMs: 10000,
      beforeAttempt: gate(c) });
  } catch (e) {
    if (!(e instanceof AIError)) throw e;
    rememberRotated(c, ai.provider, e.rotated);
    throw new HttpError(502, "ai_error", e.message, { aiCode: e.code });
  }
  const stored = { ...ai.stored, fallbacks: ai.fallbacks, testedAt: c.now };
  const stmts = [c.db.prepare("UPDATE settings SET value=?1 WHERE key='ai' AND value=?2").bind(JSON.stringify(stored), ai.raw),
    ...skipStatements(c.db, ai.provider, out.rotated, c.now)];
  await c.db.batch(stmts);
  const sample = String(out.json && typeof out.json.antwort === "string" ? out.json.antwort : out.text).slice(0, 200);
  const res = { ok: true, provider: ai.provider, label: PROVIDERS[ai.provider].label, model: out.model, sample, fallbacks: ai.fallbacks,
    modelCount: t.models.length, rotated: out.rotated.map((r) => ({ model: r.model, reason: r.reason })) };
  if (t.tierNote) res.tierNote = t.tierNote;
  return json(res);
}

function rememberRotated(c, provider, rotated) {
  const stmts = skipStatements(c.db, provider, rotated, Date.now());
  if (stmts.length) c.waitUntil(c.db.batch(stmts).catch(() => {}));
}

/* ---------- Öffentlich (Schüler:innen) ---------- */
async function routePublicSheet(c, codeRaw) {
  const code = codeParam(codeRaw);
  const b = await bucket(c, "lookup_miss");
  if (!isValidCode(code)) {
    const ra = retryAfterOf(await rlSelect(c.db, b).first(), "lookup_miss", c.now);
    if (ra) throw limited("lookup_miss", ra);
    await rlHit(c.db, b, "lookup_miss", c.now).run();
    throw sheetNotFound();
  }
  const [rl, sh, st] = await c.db.batch([
    rlSelect(c.db, b),
    c.db.prepare("SELECT code, title, tasks FROM sheets WHERE code=?1").bind(code),
    c.db.prepare("SELECT key, value FROM settings WHERE key IN ('teacher','ai')"),
  ]);
  const ra = retryAfterOf(firstRow(rl), "lookup_miss", c.now);
  if (ra) throw limited("lookup_miss", ra);   // auch für gültige Codes – sonst wäre die Sperre ein Orakel
  const s = firstRow(sh);
  if (!s) { await rlHit(c.db, b, "lookup_miss", c.now).run(); throw sheetNotFound(); }
  const rows = Object.fromEntries((st.results || []).map((r) => [r.key, r]));
  const teacher = parseSetting(rows.teacher), ai = parseSetting(rows.ai);
  const aiProvider = ai && PROVIDERS[ai.provider] && hasStoredKey(ai) ? providerLabel(ai.provider, ai.baseUrl) : null;
  // Niemals Musterlösungen ausliefern: nur der Aufgabentext verlässt den Server
  const tasks = parseTasks(s.tasks).map((t) => ({ text: String(t.text || "") }));
  return json({ ok: true, sheet: { code: s.code, title: s.title, tasks, publicKey: teacher ? teacher.publicKey : null, aiProvider } });
}

async function routeFeedback(c) {
  const body = await readJson(c.request);
  await countEvery(c, "feedback");
  const code = normalizeCode(body.code);
  if (!isValidCode(code)) throw sheetNotFound();
  const [sh, st] = await c.db.batch([
    c.db.prepare("SELECT tasks FROM sheets WHERE code=?1").bind(code),
    settingStmt(c.db, "ai"),
  ]);
  const s = firstRow(sh);
  if (!s) throw sheetNotFound();
  const tasks = parseTasks(s.tasks);
  const answers = validateAnswers(body.answers, tasks.length);
  const { messages, nrs } = buildFeedbackMessages(tasks, answers);
  if (!nrs.length) return json({ ok: true, results: feedbackResults(tasks, new Map()) });   // keine Musterlösung: keine KI nötig
  const ai = await aiConfig(c.env, firstRow(st));
  if (!ai.apiKey) throw new HttpError(503, "ai_not_configured", MSG.aiNotConfigured);
  const skip = ((await skipQuery(c.db, ai.provider, c.now).all()).results || []).map((r) => r.model);
  let out;
  try {
    out = await callAI(cfgOf(ai, skip), messages, {
      temperature: 0.1, geminiSchema: FEEDBACK_SCHEMA_GEMINI, accept: feedbackAcceptor(nrs),
      timeoutMs: 45000, deadlineMs: 100000, maxWaitMs: 20000,
      beforeAttempt: gate(c),
    });
  } catch (e) {
    if (!(e instanceof AIError)) throw e;
    rememberRotated(c, ai.provider, e.rotated);
    if (e.code === "NO_KEY" || e.code === "CONFIG" || e.code === "NO_MODEL") throw new HttpError(503, "ai_not_configured", MSG.aiNotConfigured);
    throw new HttpError(502, "ai_error", PUBLIC_MSG[e.code] || PUBLIC_MSG._, { aiCode: e.code });
  }
  rememberRotated(c, ai.provider, out.rotated);
  return json({ ok: true, results: feedbackResults(tasks, normalizeFeedback(out.json, nrs)) });
}

async function routeSubmit(c) {
  const body = await readJson(c.request);
  await countEvery(c, "submit");
  const code = normalizeCode(body.code);
  if (!isValidCode(code)) throw sheetNotFound();
  const envelope = validateEnvelope(body.envelope);
  const [sh, cnt] = await c.db.batch([
    c.db.prepare("SELECT 1 AS x FROM sheets WHERE code=?1").bind(code),
    c.db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE sheet_code=?1").bind(code),
  ]);
  if (!firstRow(sh)) throw sheetNotFound();
  if (((firstRow(cnt) || {}).n || 0) >= LIMITS.submissionsPerSheet) throw new HttpError(409, "too_many_submissions", MSG.tooMany);
  const r = await c.db.prepare("INSERT INTO submissions(sheet_code,received_at,envelope) VALUES(?1,?2,?3)").bind(code, c.now, envelope).run();
  return json({ ok: true, id: r.meta ? r.meta.last_row_id : null, receivedAt: c.now });
}

/* ---------- Routing ---------- */
const ROUTES = [
  ["/api/health", { GET: async () => json({ ok: true, service: "feibeitsblatt" }) }, { noDb: true }],
  [/^\/api\/sheet\/([^/]+)$/, { GET: routePublicSheet }],
  ["/api/feedback", { POST: routeFeedback }],
  ["/api/submit", { POST: routeSubmit }],
  ["/api/teacher/door", { POST: routeDoor }],
  ["/api/teacher/setup", { POST: routeSetup }],
  ["/api/teacher/login", { POST: routeLogin }],
  ["/api/teacher/password", { POST: routePassword }],
  ["/api/teacher/sheets", { GET: routeSheetsList, POST: routeSheetCreate }],
  [/^\/api\/teacher\/sheets\/([^/]+)$/, { GET: routeSheetGet, DELETE: routeSheetDelete }],
  [/^\/api\/teacher\/sheets\/([^/]+)\/submissions$/, { GET: routeSubmissionsList, DELETE: routeSubmissionsDelete }],
  ["/api/teacher/ai", { GET: routeAiGet, PUT: routeAiPut }],
  ["/api/teacher/ai/test", { POST: routeAiTest }],
];
function match(path) {
  for (const [pat, handlers, opts] of ROUTES) {
    if (typeof pat === "string") { if (pat === path) return { handlers, params: [], opts: opts || {} }; continue; }
    const m = pat.exec(path);
    if (m) return { handlers, params: m.slice(1), opts: opts || {} };
  }
  return null;
}

async function handleApi(request, env, ctx, path) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...API_HEADERS, "Access-Control-Max-Age": "86400" } });
  const route = match(path);
  if (!route) return fail(404, "not_found", MSG.notFound);
  const handler = route.handlers[request.method];
  if (!handler) return fail(405, "method_not_allowed", MSG.method);
  if (Number(request.headers.get("content-length")) > LIMITS.bodyBytes) return fail(413, "too_large", MSG.tooLarge);
  const c = {
    request, env, db: env.DB, now: Date.now(),
    ip: request.headers.get("CF-Connecting-IP") || "local",
    waitUntil: (p) => { if (ctx && ctx.waitUntil) ctx.waitUntil(p); },
  };
  if (!route.opts.noDb) {
    await ensureSchema(c.db);
    if (Math.random() < 0.02) c.waitUntil(c.db.batch([   // gelegentlich aufräumen
      c.db.prepare("DELETE FROM rate_limits WHERE reset_at<?1").bind(c.now),
      c.db.prepare("DELETE FROM ai_skip WHERE until<?1").bind(c.now),
    ]).catch(() => {}));
  }
  return handler(c, ...route.params);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    if (path !== "/api" && !path.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, env, ctx, path);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.code, e.message, e.extra);
      if (e instanceof InputError) return fail(e.status, e.code, e.message);
      const m = String((e && e.message) || "");
      if (/free tier|daily row (read|write) limit|exceeded D1/i.test(m)) return fail(503, "db_limit", MSG.dbLimit);
      console.error("Feibeitsblatt: unerwarteter Fehler", (e && e.name) || "Error", m.slice(0, 200));   // ohne Nutzdaten
      return fail(500, "server_error", MSG.server);
    }
  },
};
