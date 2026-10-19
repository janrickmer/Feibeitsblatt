// index.js – Cloudflare Worker für Feibeitsblatt (ES-Modul): API unter /api/*, sonst statische Seite aus ./dist.
// Der Server sieht nie Klartext-Abgaben oder das Lehrkraft-Passwort (Ende-zu-Ende, siehe SPEC §2). Free-Plan:
// nur SHA-256/AES-GCM im Worker (kein PBKDF2, keine RSA-Erzeugung), D1-Abfragen gebündelt (batch).
import {
  normalizeCode, isValidCode, generateCode, sha256Hex, timingSafeEqualStr, decodeAuthKey, importPublicKey,
  validateKdf, validateEncPrivateKey, validateEnvelope, validateSheetInput, validateAnswers, validateAiInput,
  keyHintOf, sealSecret, openSecret, bucketOf, ipKey, rateMessage, RATE, LIMITS, InputError,
  validateImageUpload, imagesForTask, generateImageId, IMAGE_ID_RE, validateSubmitMeta, validateFileUpload, filesForTask, cleanFileName, FILE_ID_RE, FILE_MIME,
  withMapChecks, teacherAnswer, publicAnswer,
} from "./lib.js";
import {
  PROVIDERS, DEFAULT_PROVIDER, AIError, PUBLIC_MSG, callAI, testKey, pickFallbacks, providerLabel,
  buildFeedbackMessages, normalizeFeedback, feedbackResults, feedbackAcceptor, FEEDBACK_SCHEMA_GEMINI,
  TEST_MESSAGES, reserveSlot, skipQuery, skipStatements, gateKey, recipientLabel,
} from "./ai.js";

const MSG = {
  unknownCode: "Zu diesem Code gibt es kein Feibeitsblatt. Bitte prüfe den Code.",
  notFound: "Diese Adresse gibt es nicht.",
  method: "Diese Methode ist hier nicht erlaubt.",
  badJson: "Die Anfrage konnte nicht gelesen werden (ungültiges JSON).",
  tooLarge: "Die Anfrage ist zu groß.",
  imagesFull: "Die Bilder dieses Feibeitsblattes sind zusammen zu groß (höchstens " + Math.round(LIMITS.sheetImageBytes / 1024 / 1024) + " MB).",
  filesFull: "Die PDF-Dateien dieses Feibeitsblattes sind zusammen zu groß (höchstens " + Math.round(LIMITS.sheetFileBytes / 1024 / 1024) + " MB).",
  storageFull: "Der Speicher für Bilder und PDF-Dateien ist voll (höchstens " + Math.round(LIMITS.storageBytes / 1024 / 1024) + " MB für alle Feibeitsblätter zusammen). Bitte löschen Sie Feibeitsblätter, die Sie nicht mehr brauchen – vorher können Sie sie mit „Als PDF-Datei herunterladen“ sichern.",
  dbFull: "Der Speicher der Datenbank ist voll. Die Lehrkraft muss alte Feibeitsblätter löschen, bevor wieder etwas gespeichert werden kann.",
  server: "Auf dem Server ist ein Fehler aufgetreten. Bitte später erneut versuchen.",
  dbLimit: "Die Datenbank hat ihr kostenloses Tageskontingent erreicht. Bitte morgen erneut versuchen.",
  sheetGone: "Dieses Feibeitsblatt gibt es nicht mehr. Bitte laden Sie die Übersicht neu.",
  unauthorized: "Passwort falsch.",
  notSetup: "Es ist noch kein Lehrkraft-Passwort festgelegt.",
  alreadySetup: "Für diese Seite ist bereits ein Lehrkraft-Passwort festgelegt.",
  aiNotConfigured: "Die Lehrkraft hat das KI-Feedback noch nicht eingerichtet.",
  aiNoKey: "Bitte zuerst einen API-Schlüssel speichern.",
  aiNoReserve: "Es ist keine Reserve-KI mit API-Schlüssel gespeichert.",
  aiChanged: "Die Lehrkraft hat die KI-Einstellungen geändert. Die Seite lädt das Feibeitsblatt neu – lies dann bitte den Datenschutzhinweis noch einmal.",
  geminiBilling: "Für Google Gemini bitte bestätigen, dass für diesen Schlüssel ein Abrechnungskonto hinterlegt ist – nur dann gelten im EWR die Bedingungen der bezahlten Dienste (keine Nutzung der Eingaben zur Produktverbesserung).",
  aiKeyLost: "Bitte den API-Schlüssel neu eintragen.",
  aiKeyForNew: "Bitte für den neuen Anbieter bzw. die neue Adresse einen API-Schlüssel eintragen – der gespeicherte Schlüssel wird nie an einen anderen Dienst gesendet.",
  noSecret: "Der Server ist noch nicht vollständig eingerichtet (Secret SETTINGS_SECRET fehlt). Bitte den Workflow „Deploy“ erneut ausführen; erst danach lässt sich ein API-Schlüssel speichern.",
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
  // Bilder zu Aufgaben (Lehrkraft lädt sie beim Anlegen hoch; Schüler:innen holen sie per Code). pos = Reihenfolge je
  // Aufgabe, data = Base64 (Strings statt BLOB: D1 gäbe BLOBs als Zahlen-Array zurück – zu teuer für 10 ms CPU).
  // Spalten vor `data` halten, was Listen brauchen: SQLite liest sonst für jede Zeile den ~700 KB langen Datenteil mit.
  "CREATE TABLE IF NOT EXISTS sheet_images (id TEXT PRIMARY KEY, sheet_code TEXT NOT NULL, task INTEGER NOT NULL, pos INTEGER NOT NULL, mode TEXT NOT NULL, mime TEXT NOT NULL, w INTEGER NOT NULL, h INTEGER NOT NULL, bytes INTEGER NOT NULL, created_at INTEGER NOT NULL, alt TEXT NOT NULL DEFAULT '', data TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_sheet_images_sheet ON sheet_images(sheet_code, task, pos)",
  // PDF-Dateien zu Aufgaben: je Teil (n) eine Zeile mit Base64; Teil 0 trägt die Metadaten, `data` ist die letzte Spalte
  "CREATE TABLE IF NOT EXISTS sheet_files (id TEXT NOT NULL, n INTEGER NOT NULL, sheet_code TEXT NOT NULL, task INTEGER NOT NULL, pos INTEGER NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, chunks INTEGER NOT NULL, created_at INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(id, n))",
  "CREATE INDEX IF NOT EXISTS idx_sheet_files_sheet ON sheet_files(sheet_code, n, task, pos)",
  // Summen für die gemeinsame Speichergrenze (LIMITS.storageBytes) nur aus dem Index lesen
  "CREATE INDEX IF NOT EXISTS idx_sheet_files_bytes ON sheet_files(n, bytes)",
  "CREATE INDEX IF NOT EXISTS idx_sheet_images_bytes ON sheet_images(bytes)",
];
// Belegter Speicher für Bilder und PDF-Dateien aller Blätter (roh, Bytes) – als SQL-Ausdruck für Bedingungen und Listen
const STORAGE_SQL = "((SELECT COALESCE(SUM(bytes),0) FROM sheet_files WHERE n=0)+(SELECT COALESCE(SUM(bytes),0) FROM sheet_images))";
let schemaReady = false;   // kein geteiltes Promise: workerd erlaubt kein I/O über Request-Grenzen hinweg
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  await ensureSubmissionColumns(db);
  schemaReady = true;
}
// Nachträgliche Spalten für Erstversuche (stage, attempt): ALTER TABLE ist nicht idempotent, deshalb vorher nachsehen.
// Kommt ein paralleler Isolate zuvor, schlägt das ALTER fehl – dann genügt es, dass die Spalten jetzt da sind.
export async function ensureSubmissionColumns(db) {
  const have = async () => new Set((((await db.prepare("PRAGMA table_info(submissions)").all()) || {}).results || []).map((r) => String(r.name)));
  let cols = await have();
  const stmts = [];
  if (!cols.has("stage")) stmts.push(db.prepare("ALTER TABLE submissions ADD COLUMN stage TEXT NOT NULL DEFAULT 'final'"));
  if (!cols.has("attempt")) stmts.push(db.prepare("ALTER TABLE submissions ADD COLUMN attempt TEXT"));
  if (stmts.length) {
    try { await db.batch(stmts); }
    catch (e) { cols = await have(); if (!cols.has("stage") || !cols.has("attempt")) throw e; }
  }
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_submissions_attempt ON submissions(sheet_code, attempt)").run();
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

// Ein Anbieter-Eintrag aus settings.ai (erster Anbieter oder `reserve`) → nutzbare Konfiguration
// (API-Schlüssel entschlüsselt; nicht entschlüsselbar → „kein Schlüssel“)
async function aiEntry(env, s) {
  const provider = PROVIDERS[s.provider] ? s.provider : DEFAULT_PROVIDER;
  let apiKey = "", keyError = "";
  if (s.apiKeyEnc) { apiKey = (await openSecret(s.apiKeyEnc, env.SETTINGS_SECRET)) || ""; if (!apiKey) keyError = env.SETTINGS_SECRET ? MSG.aiKeyLost : MSG.noSecret; }
  const fallbacks = Array.isArray(s.fallbacks) ? s.fallbacks.filter((x) => typeof x === "string").slice(0, 10) : [];
  return { provider, model: typeof s.model === "string" ? s.model : "", baseUrl: provider === "custom" && typeof s.baseUrl === "string" ? s.baseUrl : "",
    fallbacks, apiKey, keyError, stored: s };
}
// settings.ai → erster Anbieter (+ `reserve`: zweiter Anbieter mit eigenem Schlüssel, der einspringt, wenn der erste
// ausgelastet ist, sein Tageskontingent erreicht hat oder nicht antwortet – so addieren sich zwei Kontingente)
async function aiConfig(env, row) {
  const s = parseSetting(row) || {};
  const ai = await aiEntry(env, s);
  ai.key = ai.provider;   // Schlüssel für ai_gate/ai_skip (die Reserve hat eigene Kontingente → eigener Schlüssel)
  ai.reserve = s.reserve && typeof s.reserve === "object" && PROVIDERS[s.reserve.provider] ? await aiEntry(env, s.reserve) : null;
  if (ai.reserve) ai.reserve.key = ai.reserve.provider + "#r";
  ai.raw = row ? row.value : null;
  return ai;
}
// Kennung eines Eintrags für die Empfängerliste der Schüler:innen (beim eigenen Dienst zählt der Host)
function entryId(e) {
  if (e.provider !== "custom") return e.provider;
  try { return "custom:" + new URL(e.baseUrl).host; } catch { return "custom:" + String(e.baseUrl || ""); }
}
const hasStoredKey = (s) => !!(s && s.apiKeyEnc);
function entryView(e) {
  const p = PROVIDERS[e.provider];
  const out = { provider: e.provider, label: p.label, model: e.model, defaultModel: p.defaultModel, baseUrl: e.baseUrl,
    hasKey: !!e.apiKey, keyHint: e.apiKey ? keyHintOf(e.apiKey) : "", fallbacks: e.fallbacks };
  if (e.keyError) out.keyError = e.keyError;
  return out;
}
const aiPublicView = (ai) => ({ ...entryView(ai), reserve: ai.reserve ? entryView(ai.reserve) : null });
const cfgOf = (e, skip = []) => ({ provider: e.provider, apiKey: e.apiKey, model: e.model, fallbacks: e.fallbacks, skip, base: e.baseUrl, key: e.key || e.provider });

/* ---------- Rate-Limits (festes Zeitfenster, IP nur gehasht) ----------
 * rlHit zählt atomar (Upsert … RETURNING): auch parallele Anfragen kommen nicht am Zähler vorbei. */
const rlHit = (db, bucket, kind, now, weight = 1) => db.prepare(
  "INSERT INTO rate_limits(bucket,count,reset_at) VALUES(?1,?4,?2+?3) ON CONFLICT(bucket) DO UPDATE SET " +
  "count=CASE WHEN reset_at<=?2 THEN ?4 ELSE count+?4 END, reset_at=CASE WHEN reset_at<=?2 THEN ?2+?3 ELSE reset_at END " +
  "RETURNING count, reset_at").bind(bucket, now, RATE[kind].windowMs, weight);
const rlRefund = (db, bucket, now, weight = 1) =>   // Zählung zurücknehmen (z. B. KI nicht erreichbar: nicht die Schuld der Schüler:innen)
  db.prepare("UPDATE rate_limits SET count=MAX(0,count-?3) WHERE bucket=?1 AND reset_at>?2").bind(bucket, now, weight);
function retryAfterOf(row, kind, now) {   // > 0 → über dem Limit (Sekunden bis zum Ende des Fensters)
  if (!row || row.reset_at <= now || row.count <= RATE[kind].max) return 0;
  return Math.max(1, Math.ceil((row.reset_at - now) / 1000));
}
const limited = (kind, retryAfter) => new HttpError(429, "rate_limited", rateMessage(kind, retryAfter), { retryAfter });
const bucket = (c, kind, key = c.ip) => bucketOf(kind, key, c.env.SETTINGS_SECRET || "");
// Fehlversuch zählen; über dem Limit → 429 statt der eigentlichen Fehlermeldung
async function countFailure(c, kind, key) {
  const row = await rlHit(c.db, await bucket(c, kind, key), kind, c.now).first();
  const ra = retryAfterOf(row, kind, c.now);
  if (ra) throw limited(kind, ra);
}
// Mehrere Zähler auf einmal (feedback, submit): alle werden erhöht, der erste über dem Limit sperrt
async function countAll(c, items) {   // items: [{kind, key?, weight?}]
  const buckets = await Promise.all(items.map((it) => bucket(c, it.kind, it.key)));
  const rows = await c.db.batch(items.map((it, i) => rlHit(c.db, buckets[i], it.kind, c.now, it.weight || 1)));
  items.forEach((it, i) => { const ra = retryAfterOf(firstRow(rows[i]), it.kind, c.now); if (ra) throw limited(it.kind, ra); });
  return () => c.waitUntil(c.db.batch(items.map((it, i) => rlRefund(c.db, buckets[i], c.now, it.weight || 1))).catch(() => {}));
}

/* ---------- Lehrkraft-Zugang ---------- */
const doorCodeOf = (env) => String(env.TEACHER_DOOR_CODE || "1104");
// Der richtige Türcode geht immer durch (er ist absichtlich öffentlich); nur falsche Codes zählen und werden gesperrt
async function checkDoor(c, doorCode) {
  const given = typeof doorCode === "string" ? doorCode.trim() : typeof doorCode === "number" ? String(doorCode) : "";
  if (timingSafeEqualStr(given, doorCodeOf(c.env))) return;
  await countFailure(c, "door");
  throw new HttpError(403, "wrong_code", MSG.unknownCode);
}
// Das richtige Passwort geht immer durch (sonst könnte jede:r im Schulnetz die Lehrkraft aussperren);
// falsche Passwörter zählen je IP und insgesamt
async function requireTeacher(c) {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(c.request.headers.get("authorization") || "");
  if (!m) throw new HttpError(401, "unauthorized", MSG.unauthorized);
  const row = await settingStmt(c.db, "teacher").first(), teacher = parseSetting(row);
  if (!teacher || typeof teacher.authHash !== "string") throw new HttpError(409, "not_setup", MSG.notSetup);
  const raw = decodeAuthKey(m[1]);
  const hash = await sha256Hex(raw || new Uint8Array(32));
  if (!raw || !timingSafeEqualStr(hash, teacher.authHash)) {
    const [perIp, all] = await c.db.batch([
      rlHit(c.db, await bucket(c, "auth"), "auth", c.now),
      rlHit(c.db, await bucket(c, "auth_all", "global"), "auth_all", c.now),
    ]);
    const ra = retryAfterOf(firstRow(perIp), "auth", c.now) || retryAfterOf(firstRow(all), "auth_all", c.now);
    if (ra) { await new Promise((r) => setTimeout(r, 2000)); throw limited("auth", ra); }   // Raten bremsen (Wartezeit kostet keine CPU)
    throw new HttpError(401, "unauthorized", MSG.unauthorized);
  }
  return { teacher, raw: row.value };
}

async function routeDoor(c) {
  const body = await readJson(c.request);
  await checkDoor(c, body.doorCode);
  const t = parseSetting(await settingStmt(c.db, "teacher").first());
  return json({ ok: true, setup: !!t, kdf: t ? t.kdf : null });
}

async function routeSetup(c) {
  const body = await readJson(c.request);
  await checkDoor(c, body.doorCode);
  if (await settingStmt(c.db, "teacher").first()) throw new HttpError(409, "already_setup", MSG.alreadySetup);
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
  const [list, st] = await c.db.batch([
    c.db.prepare(
      "SELECT s.code, s.title, s.created_at, json_array_length(s.tasks) AS task_count, " +
      "(SELECT COUNT(*) FROM submissions WHERE sheet_code=s.code AND stage='final') AS submission_count, " +
      "(SELECT COUNT(*) FROM submissions WHERE sheet_code=s.code AND stage='first') AS first_count " +
      "FROM sheets s ORDER BY s.created_at DESC, s.code LIMIT 1000"),
    c.db.prepare("SELECT " + STORAGE_SQL + " AS used"),
  ]);
  return json({ ok: true, sheets: (list.results || []).map((r) => ({ code: r.code, title: r.title, createdAt: r.created_at,
    taskCount: r.task_count || 0, submissionCount: r.submission_count || 0, firstCount: r.first_count || 0 })),
    storage: { used: Number((firstRow(st) || {}).used) || 0, limit: LIMITS.storageBytes } });
}

async function routeSheetCreate(c) {
  await requireTeacher(c);
  const { title, tasks } = validateSheetInput(await readJson(c.request), c.now);
  const hasMap = tasks.some((t) => t.answer && t.answer.type === "map");
  for (let i = 0; i < 8; i++) {   // bei Kollision neu würfeln
    const code = generateCode();
    const tasksJson = JSON.stringify(hasMap ? await withMapChecks(tasks, code) : tasks);   // Prüfwerte hängen vom Code ab
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
  const [sh, cnt, im, fi] = await c.db.batch([
    c.db.prepare("SELECT code, title, tasks, created_at FROM sheets WHERE code=?1").bind(code),
    c.db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE sheet_code=?1").bind(code),
    imagesStmt(c.db, code),
    filesStmt(c.db, code),
  ]);
  const s = firstRow(sh);
  if (!s) throw sheetGone();
  const tasks = parseTasks(s.tasks).map((t, i) => ({ text: String(t.text || ""), solution: String(t.solution || ""), material: Array.isArray(t.material) ? t.material : [], images: imagesForTask(im.results, i + 1), files: filesForTask(fi.results, i + 1), answer: teacherAnswer(t.answer) }));
  return json({ ok: true, sheet: { code: s.code, title: s.title, createdAt: s.created_at, tasks, submissionCount: (firstRow(cnt) || {}).n || 0 } });
}

async function routeSheetDelete(c, codeRaw) {
  await requireTeacher(c);
  const code = codeParam(codeRaw);
  if (!isValidCode(code)) throw sheetGone();
  const [subs, , sh] = await c.db.batch([
    c.db.prepare("DELETE FROM submissions WHERE sheet_code=?1").bind(code),
    c.db.prepare("DELETE FROM sheet_images WHERE sheet_code=?1").bind(code),
    c.db.prepare("DELETE FROM sheets WHERE code=?1").bind(code),
    c.db.prepare("DELETE FROM sheet_files WHERE sheet_code=?1").bind(code),
  ]);
  if (!sh.meta || !sh.meta.changes) throw sheetGone();
  return json({ ok: true, deletedSubmissions: (subs.meta && subs.meta.changes) || 0 });
}

/* ---------- Bilder zu Aufgaben ---------- */
// Nur Spalten vor `data` und eine Sortierung, die der Index abdeckt (pos ist je Blatt und Aufgabe eindeutig)
const imagesStmt = (db, code) => db.prepare("SELECT id, task, pos, mode, w, h, alt FROM sheet_images WHERE sheet_code=?1 ORDER BY task, pos").bind(code);

// POST …/sheets/:code/images – JSON {task (1-basiert), mode (thumb|inline|card), data (Base64 von JPEG/PNG/WebP), id?, alt?}.
// Kartenbilder (card, Weltkarten-Zuordnung) zählen getrennt: je Aufgabe ≤ cardsPerTask, die übrigen ≤ imagesPerTask.
// Ein einziger bedingter INSERT prüft Blatt, Aufgabennummer, Anzahl je Aufgabe und Gesamtgröße atomar. Mit einer vom
// Browser erzeugten id ist der Upload wiederholbar (Timeout nach erfolgreichem Speichern → kein Duplikat).
async function routeImageUpload(c, codeRaw) {
  await requireTeacher(c);
  const code = codeParam(codeRaw);
  if (!isValidCode(code)) throw sheetGone();
  const v = validateImageUpload(await readJson(c.request));
  const { task, mode, data, bytes, info, alt } = v, id = v.id || generateImageId();
  const card = mode === "card", perTask = card ? LIMITS.cardsPerTask : LIMITS.imagesPerTask;   // Kartenbilder zählen getrennt
  const row = await c.db.prepare(
    "INSERT INTO sheet_images(id,sheet_code,task,pos,mode,mime,w,h,bytes,created_at,alt,data) " +
    "SELECT ?1,?2,?3,(SELECT COUNT(*) FROM sheet_images WHERE sheet_code=?2 AND task=?3),?4,?5,?6,?7,?8,?10,?13,?9 " +
    "WHERE NOT EXISTS(SELECT 1 FROM sheet_images WHERE id=?1) " +
    "AND EXISTS(SELECT 1 FROM sheets WHERE code=?2 AND json_array_length(tasks)>=?3 AND (?4<>'card' OR json_extract(tasks,'$['||CAST(?3-1 AS INTEGER)||'].answer.type')='map')) " +
    "AND (SELECT COUNT(*) FROM sheet_images WHERE sheet_code=?2 AND task=?3 AND (mode='card')=(?4='card'))<?11 " +
    "AND (SELECT COALESCE(SUM(bytes),0) FROM sheet_images WHERE sheet_code=?2)+?8<=?12 " +
    "AND " + STORAGE_SQL + "+?8<=?14 RETURNING pos")
    .bind(id, code, task, mode, info.mime, info.w, info.h, bytes, data, c.now, perTask, LIMITS.sheetImageBytes, alt, LIMITS.storageBytes).first();
  if (!row) {   // Grund ermitteln (nur im Fehlerfall ein zweiter Lesezugriff)
    const [ex, sh, cnt, sum] = await c.db.batch([
      c.db.prepare("SELECT task, pos, mode, mime, w, h, bytes, alt FROM sheet_images WHERE id=?1 AND sheet_code=?2").bind(id, code),
      c.db.prepare("SELECT json_array_length(tasks) AS n, json_extract(tasks,'$['||CAST(?2-1 AS INTEGER)||'].answer.type') AS t FROM sheets WHERE code=?1").bind(code, task),
      c.db.prepare("SELECT COUNT(*) AS n FROM sheet_images WHERE sheet_code=?1 AND task=?2 AND (mode='card')=?3").bind(code, task, card ? 1 : 0),
      c.db.prepare("SELECT (SELECT COALESCE(SUM(bytes),0) FROM sheet_images WHERE sheet_code=?1) AS sheet, " + STORAGE_SQL + " AS used").bind(code),
    ]);
    const e = firstRow(ex);
    if (e) return json({ ok: true, existing: true, image: { id, task: Number(e.task), pos: Number(e.pos), mode: e.mode, mime: e.mime, w: Number(e.w), h: Number(e.h), bytes: Number(e.bytes), alt: String(e.alt || "") } });
    if (v.id) throw new InputError("Diese Bild-Kennung ist schon vergeben.");
    const s = firstRow(sh);
    if (!s) throw sheetGone();
    if (task > Number(s.n)) throw new InputError("Aufgabe " + task + " gibt es in diesem Feibeitsblatt nicht.");
    if (card && s.t !== "map") throw new InputError("Kartenbilder gibt es nur bei Aufgaben mit Weltkarten-Zuordnung.");
    if (Number((firstRow(cnt) || {}).n) >= perTask) throw new InputError(card ? "Höchstens " + perTask + " Kartenbilder je Aufgabe." : "Höchstens " + perTask + " Bilder je Aufgabe.", "too_many_images");
    const u = firstRow(sum) || {};
    if (Number(u.sheet) + bytes <= LIMITS.sheetImageBytes && Number(u.used) + bytes > LIMITS.storageBytes) throw new HttpError(413, "storage_full", MSG.storageFull);
    throw new HttpError(413, "too_large", MSG.imagesFull);
  }
  return json({ ok: true, image: { id, task, pos: Number(row.pos), mode, mime: info.mime, w: info.w, h: info.h, bytes, alt } });
}

// GET /api/sheet/:code/images/:id – öffentlich (der Code ist der Zugang): {mime, w, h, data (Base64)}; der Browser baut
// daraus eine data:-URL. Unveränderlich → lange cachebar.
async function routePublicImage(c, codeRaw, idRaw) {
  const code = codeParam(codeRaw);
  if (!isValidCode(code)) { await countFailure(c, "lookup_miss"); throw sheetNotFound(); }
  const id = String(idRaw || "").toLowerCase();
  if (!IMAGE_ID_RE.test(id)) throw new HttpError(404, "not_found", MSG.notFound);
  const [im, sh] = await c.db.batch([
    c.db.prepare("SELECT mime, w, h, data FROM sheet_images WHERE id=?1 AND sheet_code=?2").bind(id, code),
    c.db.prepare("SELECT 1 AS x FROM sheets WHERE code=?1").bind(code),
  ]);
  const row = firstRow(im);
  if (!row) {
    if (!firstRow(sh)) { await countFailure(c, "lookup_miss"); throw sheetNotFound(); }   // Code-Raten zählt wie beim Blatt
    throw new HttpError(404, "not_found", MSG.notFound);                                  // Blatt da, Bild nicht (ids sind nicht ratbar)
  }
  return json({ ok: true, id, mime: String(row.mime), w: Number(row.w), h: Number(row.h), data: String(row.data) },
    200, { "Cache-Control": "public, max-age=31536000, immutable" });
}

/* ---------- PDF-Dateien zu Aufgaben ---------- */
// Nur Teil 0 (Metadaten) und nur Spalten vor `data`; `have` = vorhandene Teile (vollständig, wenn have = chunks)
const filesStmt = (db, code) => db.prepare(
  "SELECT f.id, f.task, f.pos, f.name, f.bytes, f.chunks, (SELECT COUNT(*) FROM sheet_files c WHERE c.id=f.id) AS have " +
  "FROM sheet_files f WHERE f.sheet_code=?1 AND f.n=0 ORDER BY f.task, f.pos").bind(code);

// POST …/sheets/:code/files – JSON {id, task, name, bytes, chunks, n, data}: Teil n einer PDF-Datei (Base64). Teil 0 legt
// die Datei an (ein bedingter INSERT prüft Blatt, Aufgabe, Anzahl je Aufgabe und Gesamtgröße atomar); weitere Teile
// hängen an Teil 0 (gleiches Blatt, gleiche Größe). Wiederholungen speichern nichts doppelt. Vollständig = alle Teile da.
async function routeFileUpload(c, codeRaw) {
  await requireTeacher(c);
  const code = codeParam(codeRaw);
  if (!isValidCode(code)) throw sheetGone();
  const { task, id, name, bytes, chunks, n, data } = validateFileUpload(await readJson(c.request));
  if (n === 0) {
    const row = await c.db.prepare(
      "INSERT INTO sheet_files(id,n,sheet_code,task,pos,name,mime,bytes,chunks,created_at,data) " +
      "SELECT ?1,0,?2,?3,(SELECT COUNT(*) FROM sheet_files WHERE sheet_code=?2 AND task=?3 AND n=0),?4,?5,?6,?7,?8,?9 " +
      "WHERE NOT EXISTS(SELECT 1 FROM sheet_files WHERE id=?1) " +
      "AND EXISTS(SELECT 1 FROM sheets WHERE code=?2 AND json_array_length(tasks)>=?3) " +
      "AND (SELECT COUNT(*) FROM sheet_files WHERE sheet_code=?2 AND task=?3 AND n=0)<?10 " +
      "AND (SELECT COALESCE(SUM(bytes),0) FROM sheet_files WHERE sheet_code=?2 AND n=0)+?6<=?11 " +
      "AND " + STORAGE_SQL + "+?6<=?12 RETURNING pos")
      .bind(id, code, task, name, FILE_MIME, bytes, chunks, c.now, data, LIMITS.filesPerTask, LIMITS.sheetFileBytes, LIMITS.storageBytes).first();
    if (!row) {   // Grund ermitteln (nur im Fehlerfall ein zweiter Lesezugriff)
      const [ex, sh, cnt, taken, sum] = await c.db.batch([
        c.db.prepare("SELECT task, pos, name, bytes, chunks, (SELECT COUNT(*) FROM sheet_files c WHERE c.id=?1) AS have FROM sheet_files WHERE id=?1 AND n=0 AND sheet_code=?2").bind(id, code),
        c.db.prepare("SELECT json_array_length(tasks) AS n FROM sheets WHERE code=?1").bind(code),
        c.db.prepare("SELECT COUNT(*) AS n FROM sheet_files WHERE sheet_code=?1 AND task=?2 AND n=0").bind(code, task),
        c.db.prepare("SELECT 1 AS x FROM sheet_files WHERE id=?1 LIMIT 1").bind(id),
        c.db.prepare("SELECT (SELECT COALESCE(SUM(bytes),0) FROM sheet_files WHERE sheet_code=?1 AND n=0) AS sheet, " + STORAGE_SQL + " AS used").bind(code),
      ]);
      const e = firstRow(ex);
      // Wiederholung derselben Datei (gleiche Aufgabe, Größe, Stückelung) → vorhandene Zeile; sonst ist die Kennung vergeben
      if (e && Number(e.task) === task && Number(e.bytes) === bytes && Number(e.chunks) === chunks)
        return json({ ok: true, existing: true, file: { id, task, pos: Number(e.pos), name: String(e.name), bytes, chunks, n: 0, complete: Number(e.have) >= chunks } });
      if (e || firstRow(taken)) throw new InputError("Diese Datei-Kennung ist schon vergeben.");   // andere Datei oder anderes Blatt
      const s = firstRow(sh);
      if (!s) throw sheetGone();
      if (task > Number(s.n)) throw new InputError("Aufgabe " + task + " gibt es in diesem Feibeitsblatt nicht.");
      if (Number((firstRow(cnt) || {}).n) >= LIMITS.filesPerTask) throw new InputError("Höchstens " + LIMITS.filesPerTask + " PDF-Dateien je Aufgabe.", "too_many_files");
      const u = firstRow(sum) || {};
      if (Number(u.sheet) + bytes <= LIMITS.sheetFileBytes && Number(u.used) + bytes > LIMITS.storageBytes) throw new HttpError(413, "storage_full", MSG.storageFull);
      throw new HttpError(413, "too_large", MSG.filesFull);
    }
    return json({ ok: true, file: { id, task, pos: Number(row.pos), name, bytes, chunks, n: 0, complete: chunks === 1 } });
  }
  const [ins, have, mine] = await c.db.batch([
    c.db.prepare("INSERT OR IGNORE INTO sheet_files(id,n,sheet_code,task,pos,name,mime,bytes,chunks,created_at,data) " +
      "SELECT id,?2,sheet_code,task,pos,name,mime,bytes,chunks,?3,?4 FROM sheet_files WHERE id=?1 AND n=0 AND sheet_code=?5 AND task=?6 AND bytes=?7 AND chunks>?2")
      .bind(id, n, c.now, data, code, task, bytes),
    c.db.prepare("SELECT COUNT(*) AS have, MAX(chunks) AS chunks FROM sheet_files WHERE id=?1 AND +sheet_code=?2").bind(id, code),   // nur die Teile dieser Datei (Primärschlüssel)
    c.db.prepare("SELECT 1 AS x FROM sheet_files WHERE id=?1 AND n=?2 AND sheet_code=?3 AND task=?4 AND bytes=?5").bind(id, n, code, task, bytes),
  ]);
  const h = firstRow(have);
  if (!h || !Number(h.have)) throw new InputError("Zu dieser Datei fehlt der erste Teil – bitte den Upload neu beginnen.", "bad_request");
  if (!firstRow(mine)) throw new InputError("Dieser Teil passt nicht zur Datei (Aufgabe oder Größe weichen ab).", "bad_request");   // nichts gespeichert
  const existing = !(ins.meta && ins.meta.changes);
  return json({ ok: true, ...(existing ? { existing: true } : {}), file: { id, task, n, chunks: Number(h.chunks), complete: Number(h.have) >= Number(h.chunks) } });
}

// GET /api/sheet/:code/files/:id?part=n – öffentlich (der Code ist der Zugang): Teil n (0-basiert, Vorgabe 0) einer
// vollständigen PDF-Datei als {name, mime, bytes, chunks, n, data (Base64 des Teils)}. Je Aufruf nur eine D1-Zeile
// (≤ 683 KB Base64) – eine 6-MB-Datei in einem Stück zu lesen und zu serialisieren würde die 10 ms CPU sprengen; der
// Browser holt die Teile nacheinander und baut daraus die Datei. Unveränderlich → lange cachebar. Der Body wird ohne
// JSON.stringify zusammengesetzt (Base64 braucht keine Maskierung). Unvollständige Dateien werden nie ausgeliefert.
async function routePublicFile(c, codeRaw, idRaw) {
  const code = codeParam(codeRaw);
  if (!isValidCode(code)) { await countFailure(c, "lookup_miss"); throw sheetNotFound(); }
  const id = String(idRaw || "").toLowerCase();
  const part = new URL(c.request.url).searchParams.get("part");
  const n = part == null || part === "" ? 0 : (/^\d{1,3}$/.test(part) ? Number(part) : -1);
  if (!FILE_ID_RE.test(id) || n < 0) throw new HttpError(404, "not_found", MSG.notFound);
  const [fi, have, sh] = await c.db.batch([
    c.db.prepare("SELECT name, bytes, chunks, data FROM sheet_files WHERE id=?1 AND n=?3 AND +sheet_code=?2").bind(id, code, n),
    c.db.prepare("SELECT COUNT(*) AS have FROM sheet_files WHERE id=?1 AND +sheet_code=?2").bind(id, code),   // liest nur die Teile dieser Datei
    c.db.prepare("SELECT 1 AS x FROM sheets WHERE code=?1").bind(code),
  ]);
  const row = firstRow(fi), h = firstRow(have);
  if (!row || !h || Number(h.have) < Number(row.chunks)) {   // nicht da oder noch unvollständig
    if (!firstRow(sh)) { await countFailure(c, "lookup_miss"); throw sheetNotFound(); }
    throw new HttpError(404, "not_found", MSG.notFound);
  }
  const body = '{"ok":true,"id":"' + id + '","name":' + JSON.stringify(cleanFileName(row.name)) + ',"mime":"' + FILE_MIME + '","bytes":' + Number(row.bytes) +
    ',"chunks":' + Number(row.chunks) + ',"n":' + n + ',"data":"' + String(row.data) + '"}';
  return respond(body, 200, { "Cache-Control": "public, max-age=31536000, immutable" });
}

// Seitenweise (?after=<id>): je Seite höchstens LIMITS.submissionsPage Abgaben bzw. LIMITS.pageBytes – eine Flut von
// Abgaben darf weder den Arbeitsspeicher des Workers sprengen noch die echten Abgaben unlesbar machen
async function routeSubmissionsList(c, codeRaw) {
  await requireTeacher(c);
  const code = codeParam(codeRaw);
  if (!isValidCode(code)) throw sheetGone();
  const after = Math.max(0, parseInt(new URL(c.request.url).searchParams.get("after") || "0", 10) || 0);
  const [sh, subs] = await c.db.batch([
    c.db.prepare("SELECT 1 AS x FROM sheets WHERE code=?1").bind(code),
    c.db.prepare("SELECT id, received_at, envelope, stage FROM submissions WHERE sheet_code=?1 AND id>?2 ORDER BY id LIMIT ?3")
      .bind(code, after, LIMITS.submissionsPage + 1),
  ]);
  if (!firstRow(sh)) throw sheetGone();
  const rows = subs.results || [];
  // Umschläge liegen als von uns normalisiertes JSON vor → ohne erneutes Parsen einsetzen (spart CPU-Zeit)
  const items = []; let bytes = 0, next = null;
  for (const r of rows) {
    if (items.length >= LIMITS.submissionsPage || (items.length && bytes + r.envelope.length > LIMITS.pageBytes)) { next = items.length ? Number(rows[items.length - 1].id) : after; break; }
    items.push('{"id":' + Number(r.id) + ',"receivedAt":' + Number(r.received_at) + ',"stage":"' + (r.stage === "first" ? "first" : "final") + '","envelope":' + r.envelope + "}");
    bytes += r.envelope.length;
  }
  return respond('{"ok":true,"submissions":[' + items.join(",") + '],"next":' + (next == null ? "null" : next) + "}");
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
// Mindestabstand je Anbieter-Eintrag und (wo der Anbieter je Modell begrenzt) je Modell: höchstens 10 s warten – längeres
// Warten übernimmt der Browser per automatischer Wiederholung; die Reservierung gilt nur, wenn das Modell nicht gesperrt ist
// (lastResort: ein schon beim Start als gesperrt bekanntes Modell wird als letzte Möglichkeit trotzdem versucht)
const gate = (c) => (provider, gapMs, remainingMs = 100000, model = "", key = provider, opts = {}) =>
  reserveSlot(c.db, gateKey(provider, key, model), gapMs, Math.max(0, Math.min(10000, remainingMs - 20000)), opts && opts.lastResort ? null : key, model || null);
// Sperre eines Modells sofort schreiben (nicht erst nach Ende des Aufrufs), damit parallel laufende Anfragen sie sehen
const onRotate = (c) => (key, model, reason, until) => c.waitUntil(c.db.batch(skipStatements(c.db, key, [{ model, reason, until }], Date.now())).catch(() => {}));

async function routeAiGet(c) {
  await requireTeacher(c);
  const ai = await aiConfig(c.env, await settingStmt(c.db, "ai").first());
  return json({ ok: true, ...aiPublicView(ai) });
}

// Einen Anbieter-Eintrag (erster Anbieter oder Reserve) aus der Eingabe prüfen, Modell-Rangliste holen und den
// API-Schlüssel verschlüsseln (AES-GCM mit SETTINGS_SECRET – nie im Klartext). cur = bisheriger Eintrag oder null.
// Leerer Schlüssel → der alte bleibt, aber nur für denselben Dienst (ein Schlüssel geht nie an einen anderen Anbieter/Host).
async function prepareAiEntry(c, bodyPart, cur) {
  const input = validateAiInput(bodyPart, PROVIDERS);
  if (input.provider === "gemini" && bodyPart.confirmBilling !== true && !(cur && cur.provider === "gemini" && cur.stored && cur.stored.billingConfirmed))
    throw new InputError(MSG.geminiBilling);
  const sameService = !!cur && cur.provider === input.provider && cur.baseUrl === input.baseUrl;
  if (!input.apiKey && cur && cur.apiKey && !sameService) throw new InputError(MSG.aiKeyForNew);
  const apiKey = input.apiKey || (sameService ? cur.apiKey : "");
  if (apiKey && !c.env.SETTINGS_SECRET) throw new HttpError(503, "server_not_configured", MSG.noSecret);
  let fallbacks = [], warning = "", tierNote = "", modelCount = null;
  if (apiKey) {   // Rangliste der Modelle → Ausweich-Liste
    try {
      const t = await testKey({ provider: input.provider, apiKey, base: input.baseUrl });
      fallbacks = pickFallbacks(t.models); tierNote = t.tierNote; modelCount = t.models.length;
    } catch (e) {
      if (!(e instanceof AIError)) throw e;
      warning = "Gespeichert, aber die Verbindung konnte nicht geprüft werden: " + e.message;
      if (sameService) fallbacks = cur.fallbacks;
    }
  }
  const stored = { provider: input.provider, model: input.model, baseUrl: input.baseUrl, keyHint: keyHintOf(apiKey), fallbacks, updatedAt: c.now };
  if (input.provider === "gemini") stored.billingConfirmed = true;
  if (apiKey) stored.apiKeyEnc = await sealSecret(apiKey, c.env.SETTINGS_SECRET);
  return { stored, warning, tierNote, modelCount };
}

// PUT {provider, model, baseUrl?, apiKey?} ändert den ersten Anbieter; `reserve: {…}` bzw. `reserve: null` setzt oder
// entfernt die Reserve-KI. Was nicht angesprochen wird, bleibt wörtlich erhalten (samt verschlüsseltem Schlüssel).
async function routeAiPut(c) {
  await requireTeacher(c);
  const body = await readJson(c.request);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("Ungültige Anfrage.");
  const hasMain = body.provider != null, hasReserve = Object.prototype.hasOwnProperty.call(body, "reserve");
  if (!hasMain && !hasReserve) throw new InputError("Ungültige Anfrage.");
  const cur = await aiConfig(c.env, await settingStmt(c.db, "ai").first());
  const clear = [], out = { ok: true };
  let main = { ...cur.stored }; delete main.reserve;
  let reserve = cur.stored.reserve;
  if (hasMain) {
    const r = await prepareAiEntry(c, body, cur);
    main = r.stored; clear.push(main.provider);
    if (r.modelCount != null) out.modelCount = r.modelCount;
    if (r.tierNote) out.tierNote = r.tierNote;
    if (r.warning) out.warning = r.warning;
  }
  if (hasReserve) {
    if (body.reserve === null) reserve = undefined;
    else {
      if (!body.reserve || typeof body.reserve !== "object") throw new InputError("Ungültige Einstellungen für die Reserve-KI.");
      const r = await prepareAiEntry(c, body.reserve, cur.reserve);
      reserve = r.stored; clear.push(reserve.provider + "#r");   // Sperren der Reserve liegen unter ihrem eigenen Schlüssel
      if (r.modelCount != null) out.reserveModelCount = r.modelCount;
      if (r.tierNote) out.reserveTierNote = r.tierNote;
      if (r.warning) out.reserveWarning = r.warning;
    }
  }
  const value = JSON.stringify(reserve ? { ...main, reserve } : main);
  await c.db.batch([
    c.db.prepare("INSERT INTO settings(key,value) VALUES('ai',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(value),
    ...[...new Set(clear)].map((p) => c.db.prepare("DELETE FROM ai_skip WHERE provider=?1").bind(p)),   // neuer Schlüssel/Modell: Sperren aufheben
  ]);
  Object.assign(out, aiPublicView(await aiConfig(c.env, { value })));
  return json(out);
}

// POST …/ai/test testet den ersten Anbieter, …/ai/test?which=reserve die Reserve-KI
async function routeAiTest(c) {
  await requireTeacher(c);
  const ai = await aiConfig(c.env, await settingStmt(c.db, "ai").first());
  const which = new URL(c.request.url).searchParams.get("which") === "reserve" ? "reserve" : "main";
  const e = which === "reserve" ? ai.reserve : ai;
  if (!e || !e.apiKey) throw new HttpError(400, "ai_not_configured", (e && e.keyError) || (which === "reserve" ? MSG.aiNoReserve : MSG.aiNoKey));
  let t;
  try { t = await testKey(cfgOf(e)); }
  catch (x) { if (x instanceof AIError) throw new HttpError(502, "ai_error", x.message, { aiCode: x.code }); throw x; }
  e.fallbacks = pickFallbacks(t.models);
  const skip = ((await skipQuery(c.db, e.key, c.now).all()).results || []).map((r) => r.model);
  let out;
  try {
    out = await callAI(cfgOf(e, skip), TEST_MESSAGES, { temperature: 0.1, maxAttempts: 4, timeoutMs: 30000, deadlineMs: 60000, maxWaitMs: 10000,
      beforeAttempt: gate(c), onRotate: onRotate(c) });
  } catch (x) {
    if (!(x instanceof AIError)) throw x;
    throw new HttpError(502, "ai_error", x.message, { aiCode: x.code });
  }
  const stored = which === "reserve" ? { ...ai.stored, reserve: { ...ai.stored.reserve, fallbacks: e.fallbacks, testedAt: c.now } }
    : { ...ai.stored, fallbacks: e.fallbacks, testedAt: c.now };
  await c.db.prepare("UPDATE settings SET value=?1 WHERE key='ai' AND value=?2").bind(JSON.stringify(stored), ai.raw).run();
  const sample = String(out.json && typeof out.json.antwort === "string" ? out.json.antwort : out.text).slice(0, 200);
  const res = { ok: true, which, provider: e.provider, label: PROVIDERS[e.provider].label, model: out.model, sample, fallbacks: e.fallbacks,
    modelCount: t.models.length, rotated: out.rotated.map((r) => ({ model: r.model, reason: r.reason })) };
  if (t.tierNote) res.tierNote = t.tierNote;
  return json(res);
}


/* ---------- Öffentlich (Schüler:innen) ---------- */
// Gültige Codes gehen immer durch; nur unbekannte Codes zählen (887 Mio. mögliche Codes – Raten lohnt nicht,
// aber Tippfehler einer ganzen Schule dürfen niemanden aussperren)
async function routePublicSheet(c, codeRaw) {
  const code = codeParam(codeRaw);
  if (!isValidCode(code)) { await countFailure(c, "lookup_miss"); throw sheetNotFound(); }
  const [sh, st, im, fi] = await c.db.batch([
    c.db.prepare("SELECT code, title, tasks FROM sheets WHERE code=?1").bind(code),
    c.db.prepare("SELECT key, value FROM settings WHERE key IN ('teacher','ai')"),
    imagesStmt(c.db, code),
    filesStmt(c.db, code),
  ]);
  const s = firstRow(sh);
  if (!s) { await countFailure(c, "lookup_miss"); throw sheetNotFound(); }
  const rows = Object.fromEntries((st.results || []).map((r) => [r.key, r]));
  const teacher = parseSetting(rows.teacher);
  // Empfänger für den Datenschutzhinweis: erster Anbieter, dann die Reserve – nur Einträge mit nutzbarem Schlüssel
  // (ein nicht entschlüsselbarer Schlüssel bekommt nie Daten); id = Anbieter bzw. custom:Host, label = Rechtsträger und Sitz
  const ai = await aiConfig(c.env, rows.ai || null);
  const usable = [ai, ai.reserve].filter((e) => e && e.apiKey);
  const aiProvider = usable.length && usable[0] === ai ? providerLabel(ai.provider, ai.baseUrl) : null;
  const aiRecipients = usable.map((e) => ({ id: entryId(e), label: recipientLabel(e.provider, e.baseUrl) }));
  const aiReserve = usable.length > 1 ? providerLabel(usable[1].provider, usable[1].baseUrl) : null;   // für ältere, noch gecachte Seiten
  // Niemals Musterlösungen ausliefern: nur Aufgabentext und Bild-Metadaten verlassen den Server; die Länder einer Weltkarten-
  // Zuordnung nur als Prüfwerte (SHA-256 von Code|Karte|Land), Kartenbilder nur, wenn sie zu dieser Aufgabe gespeichert sind
  const tasks = await Promise.all(parseTasks(s.tasks).map(async (t, i) => {
    const images = imagesForTask(im.results, i + 1);
    return { text: String(t.text || ""), material: Array.isArray(t.material) ? t.material : [], images, files: filesForTask(fi.results, i + 1),
      answer: await publicAnswer(t.answer, code, new Set(images.filter((m) => m.mode === "card").map((m) => m.id))) };
  }));
  return json({ ok: true, sheet: { code: s.code, title: s.title, tasks, publicKey: teacher ? teacher.publicKey : null, aiProvider, ...(aiRecipients.length ? { aiRecipients } : {}), ...(aiReserve ? { aiReserve } : {}) } });
}

// KI-Fehler, bei denen Warten hilft → 429 mit Retry-After (der Browser wiederholt automatisch); sonst 502
const AI_WAIT = { BUSY: 30, RATE_LIMIT: 45, TIMEOUT: 30 };
const AI_REFUND = new Set(["BUSY", "RATE_LIMIT", "TIMEOUT", "SERVER", "NETWORK", "DAILY_LIMIT"]);   // nicht die Schuld der Schüler:innen
// Nur bei diesen Fehlern des ersten Anbieters geht dieselbe Anfrage an die Reserve-KI (Verfügbarkeit, zu lang, unbrauchbare
// Antwort). Nie bei Inhaltsfiltern (FILTERED) und nie bei Fehlkonfiguration (AUTH, CONFIG, PRIVACY_POLICY, REGION, PAYMENT):
// Datenminimierung – die Reserve bekommt Schülertexte nur, wenn der erste Anbieter nicht verfügbar ist.
const RESERVE_ON = new Set(["BUSY", "RATE_LIMIT", "DAILY_LIMIT", "TIMEOUT", "SERVER", "NETWORK", "NOT_FOUND", "NO_MODEL", "TOO_LARGE", "EMPTY", "BAD_JSON", "TRUNCATED", "HTTP"]);
const retryAfterOfErr = (e) => { const s = Math.ceil((e.retryAfterMs || 0) / 1000); return s > 0 ? Math.max(5, Math.min(60, s)) : (AI_WAIT[e.code] || 30); };

async function routeFeedback(c) {
  const body = await readJson(c.request);
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
  let entries = [ai, ai.reserve].filter((e) => e && e.apiKey);   // erster Anbieter, danach die Reserve-KI (falls eingerichtet)
  if (!entries.length) throw new HttpError(503, "ai_not_configured", MSG.aiNotConfigured);
  // Transparenz: Der Browser schickt mit, über welche Empfänger die Schülerin bzw. der Schüler vor dem Klick informiert war
  // (ids aus GET /api/sheet). Nur diese dürfen Daten bekommen; hat die Lehrkraft inzwischen den ersten Anbieter geändert
  // oder eine Reserve ergänzt, bekommt der Browser 409 und zeigt den neuen Hinweis, bevor etwas gesendet wird.
  if (Array.isArray(body.recipients)) {
    const allowed = new Set(body.recipients.filter((x) => typeof x === "string").slice(0, 10));
    if (!allowed.has(entryId(entries[0]))) throw new HttpError(409, "ai_changed", MSG.aiChanged);
    entries = entries.filter((e) => allowed.has(entryId(e)));
  }
  // Erst zählen, wenn die Anfrage gültig ist und wirklich zur KI geht: je IP (Anzahl und Zeichen) und je Blatt und Tag
  const chars = answers.reduce((n, a) => n + a.length, 0);
  const refund = await countAll(c, [{ kind: "feedback" }, { kind: "feedback_chars", weight: Math.max(1, chars) }, { kind: "sheet_feedback", key: code }]);
  // Zeitbudget: insgesamt 100 s (der Browser wartet bis 150 s); mit Reserve bekommt der erste Anbieter 45 s, die Reserve den
  // Rest – aber nur, wenn noch ≥ 35 s bleiben (sonst ein nutzloser Abbruch). Langes Warten erledigt der Browser (Wiederholung).
  const t0 = Date.now(), BUDGET = 100000, startAt = Math.floor(Math.random() * 64);
  let out = null, err = null;
  for (let i = 0; i < entries.length && !out; i++) {
    const e = entries[i], left = BUDGET - (Date.now() - t0);
    if (i > 0 && (left < 35000 || !(err && RESERVE_ON.has(err.code)))) break;   // Reserve nur bei Verfügbarkeitsproblemen
    const skip = ((await skipQuery(c.db, e.key, c.now).all()).results || []).map((r) => r.model);
    try {
      out = await callAI(cfgOf(e, skip), messages, {
        temperature: 0.1, geminiSchema: FEEDBACK_SCHEMA_GEMINI, accept: feedbackAcceptor(nrs),
        timeoutMs: 45000, deadlineMs: i === 0 ? (entries.length > 1 ? 45000 : left) : Math.min(40000, left), maxWaitMs: 15000,
        maxAttempts: i === 0 ? 6 : 3, startAt: startAt + i,
        beforeAttempt: gate(c), onRotate: onRotate(c),
      });
    } catch (x) {
      if (!(x instanceof AIError)) throw x;
      // Es zählt der letzte Fehler – außer die Reserve ist selbst falsch eingerichtet, dann bleibt der des ersten Anbieters
      if (!err || !(x.code === "NO_KEY" || x.code === "CONFIG" || x.code === "NO_MODEL")) err = x;
    }
  }
  if (!out) {
    if (AI_REFUND.has(err.code)) refund();
    if (err.code === "NO_KEY" || err.code === "CONFIG" || err.code === "NO_MODEL") throw new HttpError(503, "ai_not_configured", MSG.aiNotConfigured);
    if (AI_WAIT[err.code]) throw new HttpError(429, "ai_busy", PUBLIC_MSG[err.code] || PUBLIC_MSG._, { aiCode: err.code, retryAfter: retryAfterOfErr(err) });
    throw new HttpError(502, "ai_error", PUBLIC_MSG[err.code] || PUBLIC_MSG._, { aiCode: err.code });
  }
  return json({ ok: true, results: feedbackResults(tasks, normalizeFeedback(out.json, nrs)) });
}

// Abgabe (stage "final") oder Erstversuch (stage "first", nach dem KI-Feedback). Mit derselben attempt-Kennung ersetzt die
// Abgabe den Erstversuch derselben Bearbeitung; ein Erstversuch überschreibt nie eine Abgabe. Der Server sieht nur den Umschlag.
async function routeSubmit(c) {
  const body = await readJson(c.request);
  const code = normalizeCode(body.code);
  if (!isValidCode(code)) throw sheetNotFound();
  const envelope = validateEnvelope(body.envelope);
  const { stage, attempt } = validateSubmitMeta(body);
  const [sh, cnt, ex] = await c.db.batch([
    c.db.prepare("SELECT 1 AS x FROM sheets WHERE code=?1").bind(code),
    c.db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(length(envelope)),0) AS bytes FROM submissions WHERE sheet_code=?1").bind(code),
    attempt ? c.db.prepare("SELECT id, stage FROM submissions WHERE sheet_code=?1 AND attempt=?2 ORDER BY id DESC LIMIT 1").bind(code, attempt)
      : c.db.prepare("SELECT 1 AS x WHERE 0"),
  ]);
  if (!firstRow(sh)) throw sheetNotFound();
  await countAll(c, [{ kind: "submit" }, { kind: "submit_bytes", weight: envelope.length }]);   // nur gültige Abgaben zählen
  const prev = attempt ? firstRow(ex) : null;
  if (prev) {
    if (prev.stage === "final" && stage === "first") return json({ ok: true, id: Number(prev.id), receivedAt: c.now, kept: true });   // Abgabe bleibt
    await c.db.prepare("UPDATE submissions SET envelope=?1, received_at=?2, stage=?3 WHERE id=?4").bind(envelope, c.now, stage, prev.id).run();
    return json({ ok: true, id: Number(prev.id), receivedAt: c.now, replaced: prev.stage });
  }
  const use = firstRow(cnt) || {};
  if ((use.n || 0) >= LIMITS.submissionsPerSheet || (use.bytes || 0) + envelope.length > LIMITS.sheetBytes)
    throw new HttpError(409, "too_many_submissions", MSG.tooMany);
  const r = await c.db.prepare("INSERT INTO submissions(sheet_code,received_at,envelope,stage,attempt) VALUES(?1,?2,?3,?4,?5)").bind(code, c.now, envelope, stage, attempt).run();
  return json({ ok: true, id: r.meta ? r.meta.last_row_id : null, receivedAt: c.now });
}

/* ---------- Routing ---------- */
const ROUTES = [
  ["/api/health", { GET: async () => json({ ok: true, service: "feibeitsblatt" }) }, { noDb: true }],
  [/^\/api\/sheet\/([^/]+)$/, { GET: routePublicSheet }],
  [/^\/api\/sheet\/([^/]+)\/images\/([^/]+)$/, { GET: routePublicImage }],
  [/^\/api\/sheet\/([^/]+)\/files\/([^/]+)$/, { GET: routePublicFile }],
  ["/api/feedback", { POST: routeFeedback }],
  ["/api/submit", { POST: routeSubmit }],
  ["/api/teacher/door", { POST: routeDoor }],
  ["/api/teacher/setup", { POST: routeSetup }],
  ["/api/teacher/login", { POST: routeLogin }],
  ["/api/teacher/password", { POST: routePassword }],
  ["/api/teacher/sheets", { GET: routeSheetsList, POST: routeSheetCreate }],
  [/^\/api\/teacher\/sheets\/([^/]+)$/, { GET: routeSheetGet, DELETE: routeSheetDelete }],
  [/^\/api\/teacher\/sheets\/([^/]+)\/submissions$/, { GET: routeSubmissionsList, DELETE: routeSubmissionsDelete }],
  [/^\/api\/teacher\/sheets\/([^/]+)\/images$/, { POST: routeImageUpload }],
  [/^\/api\/teacher\/sheets\/([^/]+)\/files$/, { POST: routeFileUpload }],
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
    ip: ipKey(request.headers.get("CF-Connecting-IP") || "local"),
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
      // Datenbank voll („Exceeded maximum DB size“ laut Cloudflare-Doku; SQLite: „database or disk is full“)
      if (/maximum (db|database) size|database or disk is full|SQLITE_FULL|storage limit/i.test(m)) return fail(503, "db_full", MSG.dbFull);
      console.error("Feibeitsblatt: unerwarteter Fehler", (e && e.name) || "Error", m.slice(0, 200));   // ohne Nutzdaten
      return fail(500, "server_error", MSG.server);
    }
  },
};
