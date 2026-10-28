// index.js – Cloudflare Worker für Feibeitsblatt (ES-Modul): API unter /api/*, sonst statische Seite aus ./dist.
// Der Server sieht nie Klartext-Abgaben oder das Lehrkraft-Passwort (Ende-zu-Ende, siehe SPEC §2). Free-Plan:
// nur SHA-256/AES-GCM im Worker (kein PBKDF2, keine RSA-Erzeugung), D1-Abfragen gebündelt (batch).
import {
  normalizeCode, isValidCode, generateCode, sha256Hex, timingSafeEqualStr, decodeAuthKey, importPublicKey,
  validateKdf, validateEncPrivateKey, validateEnvelope, validateSheetInput, validateAnswers, validateOnly, validateAiInput,
  keyHintOf, sealSecret, openSecret, bucketOf, ipKey, rateMessage, RATE, LIMITS, InputError,
  validateImageUpload, imagesForTask, generateImageId, IMAGE_ID_RE, validateSubmitMeta, validateDeleteIds, validateFileUpload, filesForTask, cleanFileName, FILE_ID_RE, FILE_MIME,
  withMapChecks, teacherAnswer, publicAnswer,
  validatePrivacyInput, privacyOut, PURGE_SQL, DROP_SCHOOL_SQL, OLDER_THAN_SQL, RETENTION_OPTIONS, COUNT_OLDER_SQL, SAVE_PRIVACY_SQL, DELETE_OLDER_SQL,
  validateChecklist, checklistOut, escapeOut, REPLACE_WINDOW_MS,
} from "./lib.js";
import {
  PROVIDERS, DEFAULT_PROVIDER, AIError, PUBLIC_MSG, callAI, testKey, pickFallbacks, providerLabel,
  buildFeedbackMessages, normalizeFeedback, feedbackResults, feedbackAcceptor, FEEDBACK_SCHEMA_GEMINI,
  TEST_MESSAGES, reserveSlot, skipQuery, skipStatements, gateKey, recipientLabel, wantsFeedback,
  CF_NO_BINDING, CF_DAILY_NEURONS, utcDay, recipientTransfer,
  buildChecklistMessages, normalizeChecklist, checklistAcceptor, CHECKLIST_SCHEMA_GEMINI,
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
  aiNotSaved: "Noch nicht gespeichert – bitte Anbieter wählen und „Speichern“ klicken.",
  aiKeyless: "Für Cloudflare Workers AI ist kein API-Schlüssel nötig – bitte das Feld leer lassen.",
  aiSameAccount: "Cloudflare Workers AI ist schon der erste Anbieter. Eine Reserve im selben Cloudflare-Konto bringt kein zusätzliches Kontingent – bitte einen anderen Anbieter wählen.",
  aiCfModel: "Bitte eine Modell-ID von Workers AI angeben (beginnt mit „@cf/“) oder das Feld leer lassen.",
  aiMainFirst: "Bitte zuerst den ersten Anbieter speichern – die Reserve-KI springt nur für ihn ein.",
  noChecklist: "Zu diesem Feibeitsblatt gibt es noch keine Checkliste.",
  ckNoAi: "Es ist kein KI-Dienst eingerichtet, der gerade genutzt werden kann. Bitte prüfen Sie die KI-Einstellungen – die Punkte der Checkliste können Sie auch selbst eintragen.",
  ckQuota: "Das kostenlose Tageskontingent von Cloudflare Workers AI ist aufgebraucht (es gilt für das ganze Cloudflare-Konto). Ab 0:00 Uhr UTC (1:00 Uhr MEZ bzw. 2:00 Uhr MESZ) geht es wieder.",
  ckEscape: "Zu einem Feibeitsblatt für einen Escape-Room gibt es kein analoges Arbeitsblatt.",
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
  // Geschätzter Verbrauch von Workers AI je Tag (UTC) – das Gratiskontingent (Neurons) gilt für das ganze Cloudflare-Konto
  "CREATE TABLE IF NOT EXISTS ai_usage (day TEXT NOT NULL, provider TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0, neurons REAL NOT NULL DEFAULT 0, PRIMARY KEY(day, provider))",
  // Automatische Löschung nach der Frist der Lehrkraft (PURGE_SQL in lib.js) sucht über den Eingangszeitpunkt
  "CREATE INDEX IF NOT EXISTS idx_submissions_received ON submissions(received_at)",
  // Checkliste zum analogen Arbeitsblatt je Blatt: draft = Vorschlag der KI (noch nicht gespeichert, nie öffentlich), final = von der
  // Lehrkraft gespeichert (über den QR-Code öffentlich) – beides JSON {v:1, ai, tasks:[{n, points}]}
  "CREATE TABLE IF NOT EXISTS sheet_checklists (sheet_code TEXT PRIMARY KEY, draft TEXT, final TEXT, updated_at INTEGER NOT NULL)",
];
// Belegter Speicher für Bilder und PDF-Dateien aller Blätter (roh, Bytes) – als SQL-Ausdruck für Bedingungen und Listen
const STORAGE_SQL = "((SELECT COALESCE(SUM(bytes),0) FROM sheet_files WHERE n=0)+(SELECT COALESCE(SUM(bytes),0) FROM sheet_images))";
let schemaReady = false;   // kein geteiltes Promise: workerd erlaubt kein I/O über Request-Grenzen hinweg
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  await ensureColumns(db);
  schemaReady = true;
}
// Nachträgliche Spalten: Erstversuche (submissions.stage, .attempt) und Escape-Room-Blätter (sheets.escape_id, .escape_name; NULL =
// normales Blatt). ALTER TABLE ist nicht idempotent, deshalb vorher nachsehen (beide Tabellen in einem Batch). Kommt ein paralleler
// Isolate zuvor, schlägt das ALTER fehl – dann genügt es, dass die Spalten jetzt da sind.
const LATER_COLUMNS = [
  ["submissions", "stage", "ALTER TABLE submissions ADD COLUMN stage TEXT NOT NULL DEFAULT 'final'"],
  ["submissions", "attempt", "ALTER TABLE submissions ADD COLUMN attempt TEXT"],
  ["sheets", "escape_id", "ALTER TABLE sheets ADD COLUMN escape_id TEXT"],
  ["sheets", "escape_name", "ALTER TABLE sheets ADD COLUMN escape_name TEXT"],
];
export async function ensureColumns(db) {
  const have = async () => {
    const [sub, sh] = await db.batch([db.prepare("PRAGMA table_info(submissions)"), db.prepare("PRAGMA table_info(sheets)")]);
    const names = (r) => new Set(((r || {}).results || []).map((x) => String(x.name)));
    return { submissions: names(sub), sheets: names(sh) };
  };
  const missing = (cols) => LATER_COLUMNS.filter(([t, c]) => !cols[t].has(c));
  let todo = missing(await have());
  if (todo.length) {
    try { await db.batch(todo.map(([, , sql]) => db.prepare(sql))); }
    catch (e) { todo = missing(await have()); if (todo.length) throw e; }
  }
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_submissions_attempt ON submissions(sheet_code, attempt)").run();
}

/* Aufräumen: Abgaben und Erstversuche nach der Löschfrist (PURGE_SQL; ohne gespeicherte Frist nichts), früher gespeicherte Angaben
   einer Schule (DROP_SCHOOL_SQL – verantwortlich ist der Betreiber, siehe index.html), abgelaufene Zähler und Sperren,
   Verbrauchszeilen von Workers AI älter als zwei Tage. Täglich per Cron Trigger (scheduled), beim Öffnen der Lehrkräfte-Übersicht
   (routeSheetsList) und gelegentlich bei anderen API-Aufrufen. */
const cleanupStatements = (db, now) => [
  db.prepare(PURGE_SQL).bind(now),
  db.prepare(DROP_SCHOOL_SQL),
  db.prepare("DELETE FROM rate_limits WHERE reset_at<?1").bind(now),
  db.prepare("DELETE FROM ai_skip WHERE until<?1").bind(now),
  db.prepare("DELETE FROM ai_usage WHERE day<?1").bind(utcDay(now - 2 * 86400e3)),
];

/* ---------- Body lesen (≤ 1 MB) ---------- */
// optional: ein leerer Body ist erlaubt → null (DELETE …/submissions ohne Body = alle Einträge)
async function readJson(request, optional = false) {
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
  if (optional && !text.trim()) return null;
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
// (API-Schlüssel entschlüsselt; nicht entschlüsselbar → „kein Schlüssel“). explicit = von der Lehrkraft gespeichert (sonst
// nur die Vorauswahl DEFAULT_PROVIDER der Oberfläche). Workers AI (keyless): nie ein Schlüssel, dafür das Binding env.AI.
async function aiEntry(env, s) {
  const explicit = !!PROVIDERS[s.provider];
  const provider = explicit ? s.provider : DEFAULT_PROVIDER, keyless = !!PROVIDERS[provider].keyless;
  let apiKey = "", keyError = "";
  if (s.apiKeyEnc && !keyless) { apiKey = (await openSecret(s.apiKeyEnc, env.SETTINGS_SECRET)) || ""; if (!apiKey) keyError = env.SETTINGS_SECRET ? MSG.aiKeyLost : MSG.noSecret; }
  const ai = keyless && env.AI && typeof env.AI.run === "function" ? env.AI : null;
  if (keyless) keyError = !explicit ? MSG.aiNotSaved : ai ? "" : CF_NO_BINDING;
  const fallbacks = Array.isArray(s.fallbacks) ? s.fallbacks.filter((x) => typeof x === "string").slice(0, 10) : [];
  return { provider, model: typeof s.model === "string" ? s.model : "", baseUrl: provider === "custom" && typeof s.baseUrl === "string" ? s.baseUrl : "",
    fallbacks, apiKey, keyError, stored: s, explicit, keyless, ai };
}
// Nutzbar = bekommt Schülertexte: mit entschlüsselbarem Schlüssel bzw. (Workers AI) ausdrücklich gespeichert und Binding da
const usable = (e) => !!e && (e.keyless ? !!(e.explicit && e.ai) : !!e.apiKey);
// Empfänger der Schülertexte in dieser Reihenfolge: erster Anbieter, dann die Reserve – die Reserve nur, wenn der erste nutzbar
// ist (sie springt für ihn ein). Sonst sagt die Lehrkräfte-Übersicht zu Recht „nur ohne KI-Feedback“ (auch bei älteren
// Einstellungen, in denen nur eine Reserve gespeichert ist; neue lehnt routeAiPut ab).
const activeEntries = (ai) => (usable(ai) ? [ai, ai.reserve].filter(usable) : []);
// Schlüssel für ai_gate/ai_skip: die Reserve hat eigene Kontingente → eigener Schlüssel (provider#r); Anbieter mit einem
// Kontingent je Konto (Workers AI) behalten ihren Namen – die Sperre „Tageskontingent aufgebraucht“ gilt für beide Rollen
const entryKey = (provider, reserve) => (reserve && !(PROVIDERS[provider] || {}).accountDaily ? provider + "#r" : provider);
// settings.ai → erster Anbieter (+ `reserve`: zweiter Anbieter, der einspringt, wenn der erste ausgelastet ist, sein
// Tageskontingent erreicht hat oder nicht antwortet – so addieren sich zwei Kontingente)
async function aiConfig(env, row) {
  const s = parseSetting(row) || {};
  const ai = await aiEntry(env, s);
  ai.key = entryKey(ai.provider, false);
  ai.reserve = s.reserve && typeof s.reserve === "object" && PROVIDERS[s.reserve.provider] ? await aiEntry(env, s.reserve) : null;
  if (ai.reserve) ai.reserve.key = entryKey(ai.reserve.provider, true);
  ai.raw = row ? row.value : null;
  return ai;
}
// Kennung eines Eintrags für die Empfängerliste der Schüler:innen (beim eigenen Dienst zählt der Host)
function entryId(e) {
  if (e.provider !== "custom") return e.provider;
  try { return "custom:" + new URL(e.baseUrl).host; } catch { return "custom:" + String(e.baseUrl || ""); }
}
const hasStoredKey = (s) => !!(s && s.apiKeyEnc);
// hasKey = nutzbar (so verstehen es auch ältere, noch gecachte Seiten), ready = dasselbe, saved = von der Lehrkraft gespeichert
function entryView(e) {
  const p = PROVIDERS[e.provider];
  const out = { provider: e.provider, label: p.label, model: e.model, defaultModel: p.defaultModel, baseUrl: e.baseUrl,
    hasKey: usable(e), keyHint: e.apiKey ? keyHintOf(e.apiKey) : "", fallbacks: e.fallbacks, keyless: !!p.keyless, ready: usable(e), saved: !!e.explicit };
  if (e.keyError) out.keyError = e.keyError;
  return out;
}
const aiPublicView = (ai) => ({ ...entryView(ai), reserve: ai.reserve ? entryView(ai.reserve) : null });
const cfgOf = (e, skip = []) => ({ provider: e.provider, apiKey: e.apiKey, ai: e.ai, model: e.model, fallbacks: e.fallbacks, skip, base: e.baseUrl, key: e.key || e.provider });
// Workers AI: geschätzter Verbrauch je Tag (UTC) und Anbieter – ein Upsert je Aufruf, der etwas verbraucht hat
const usageStmt = (db, provider, cost, now) => db.prepare(
  "INSERT INTO ai_usage(day,provider,requests,neurons) VALUES(?1,?2,?3,?4) ON CONFLICT(day,provider) DO UPDATE SET " +
  "requests=requests+excluded.requests, neurons=neurons+excluded.neurons").bind(utcDay(now), provider, cost.requests, Math.round(cost.neurons * 1000) / 1000);
const spent = (cost) => !!cost && cost.requests > 0;
// Konto-Tageskontingent aufgebraucht: bis 0:00 UTC keine Anfrage mehr an diesen Anbieter (Sperre mit model "*")
const quotaLock = (db, key, until) => skipStatements(db, key, [{ model: "*", reason: "Tageskontingent aufgebraucht", until }], Date.now());

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
  // Eine Neuinstallation (noch ohne Feibeitsblätter) löscht von Anfang an automatisch nach 30 Tagen (auto = Vorgabe, die Lehrkraft
  // kann sie ändern). Nur wenn dieser Aufruf die Lehrkraft angelegt hat und noch keine Frist gespeichert ist: Beim Zurücksetzen
  // des Zugangs („Passwort vergessen“) bleibt eine gespeicherte Frist, und ohne gespeicherte Frist wird weiter nichts gelöscht.
  const privacy = JSON.stringify({ v: 1, retentionDays: LIMITS.retentionDefault, auto: true, updatedAt: c.now });
  const [r] = await c.db.batch([
    c.db.prepare("INSERT INTO settings(key,value) VALUES('teacher',?1) ON CONFLICT(key) DO NOTHING").bind(value),
    c.db.prepare("INSERT INTO settings(key,value) SELECT 'privacy',?1 WHERE (SELECT value FROM settings WHERE key='teacher')=?2 " +
      "AND NOT EXISTS(SELECT 1 FROM sheets) ON CONFLICT(key) DO NOTHING").bind(privacy, value),
  ]);
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
  // Beim Öffnen der Übersicht ganz aufräumen wie der tägliche Zeitplan (falls er fehlt oder scheiterte): Löschfrist, damit die Zahlen
  // stimmen, und abgelaufene Zähler/Sperren (gehashte IP-Adressen nur etwa einen Tag) – getrennt vom Lese-Batch und fehlertolerant:
  // scheitert das Löschen (z. B. Tageslimit geschriebener Zeilen), lädt die Übersicht trotzdem
  await c.db.batch(cleanupStatements(c.db, c.now)).catch(() => {});
  const [list, st] = await c.db.batch([
    c.db.prepare(
      "SELECT s.code, s.title, s.created_at, s.escape_id, s.escape_name, json_array_length(s.tasks) AS task_count, " +
      "(SELECT COUNT(*) FROM submissions WHERE sheet_code=s.code AND stage='final') AS submission_count, " +
      "(SELECT COUNT(*) FROM submissions WHERE sheet_code=s.code AND stage='first') AS first_count " +
      "FROM sheets s ORDER BY s.created_at DESC, s.code LIMIT 1000"),
    c.db.prepare("SELECT " + STORAGE_SQL + " AS used"),
  ]);
  return json({ ok: true, sheets: (list.results || []).map((r) => ({ code: r.code, title: r.title, createdAt: r.created_at,
    taskCount: r.task_count || 0, submissionCount: r.submission_count || 0, firstCount: r.first_count || 0, escape: escapeOut(r.escape_id, r.escape_name) })),
    storage: { used: Number((firstRow(st) || {}).used) || 0, limit: LIMITS.storageBytes } });
}

async function routeSheetCreate(c) {
  await requireTeacher(c);
  const { title, tasks, escape } = validateSheetInput(await readJson(c.request), c.now);
  const hasMap = tasks.some((t) => t.answer && t.answer.type === "map");
  for (let i = 0; i < 8; i++) {   // bei Kollision neu würfeln
    const code = generateCode();
    const tasksJson = JSON.stringify(hasMap ? await withMapChecks(tasks, code) : tasks);   // Prüfwerte hängen vom Code ab
    const r = await c.db.prepare("INSERT INTO sheets(code,title,tasks,created_at,escape_id,escape_name) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(code) DO NOTHING")
      .bind(code, title, tasksJson, c.now, escape ? escape.id : null, escape ? escape.name : null).run();
    if (r.meta && r.meta.changes) return json({ ok: true, code, title, createdAt: c.now, taskCount: tasks.length, escape });
  }
  throw new Error("Kein freier Code gefunden");
}

async function routeSheetGet(c, codeRaw) {
  await requireTeacher(c);
  const code = codeParam(codeRaw);
  if (!isValidCode(code)) throw sheetGone();
  const [sh, cnt, im, fi] = await c.db.batch([
    c.db.prepare("SELECT code, title, tasks, created_at, escape_id, escape_name FROM sheets WHERE code=?1").bind(code),
    c.db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE sheet_code=?1").bind(code),
    imagesStmt(c.db, code),
    filesStmt(c.db, code),
  ]);
  const s = firstRow(sh);
  if (!s) throw sheetGone();
  const tasks = parseTasks(s.tasks).map((t, i) => ({ text: String(t.text || ""), textFmt: Array.isArray(t.textFmt) ? t.textFmt : [], solution: String(t.solution || ""), material: Array.isArray(t.material) ? t.material : [], images: imagesForTask(im.results, i + 1), files: filesForTask(fi.results, i + 1), answer: teacherAnswer(t.answer) }));
  return json({ ok: true, sheet: { code: s.code, title: s.title, createdAt: s.created_at, tasks, submissionCount: (firstRow(cnt) || {}).n || 0, escape: escapeOut(s.escape_id, s.escape_name) } });
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
    c.db.prepare("DELETE FROM sheet_checklists WHERE sheet_code=?1").bind(code),
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

// Ohne Body: alle Abgaben und Erstversuche des Blattes. Mit {ids: […]}: nur diese Einträge dieses Blattes – so setzt die Lehrkraft
// den Lösch- oder Einschränkungswunsch einer Person um (der Browser schickt dazu die ausgeblendeten Erstversuche derselben Person mit).
async function routeSubmissionsDelete(c, codeRaw) {
  await requireTeacher(c);
  const code = codeParam(codeRaw);
  if (!isValidCode(code)) throw sheetGone();
  const ids = validateDeleteIds(await readJson(c.request, true));
  const [sh, del] = await c.db.batch([
    c.db.prepare("SELECT 1 AS x FROM sheets WHERE code=?1").bind(code),
    ids ? c.db.prepare("DELETE FROM submissions WHERE sheet_code=?1 AND id IN (" + ids.map((_, i) => "?" + (i + 2)).join(",") + ")").bind(code, ...ids)
      : c.db.prepare("DELETE FROM submissions WHERE sheet_code=?1").bind(code),
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

// Für die KI-Einstellungen: Sperre „Tageskontingent aufgebraucht“ (quotaUntil) und geschätzter Verbrauch heute (UTC) von
// Workers AI – nur zur Orientierung; genau steht der Verbrauch im Cloudflare-Dashboard
const cfStatusStmts = (c) => [
  c.db.prepare("SELECT MAX(until) AS until FROM ai_skip WHERE provider='cloudflare' AND model='*' AND until>?1").bind(c.now),
  c.db.prepare("SELECT requests, neurons FROM ai_usage WHERE day=?1 AND provider='cloudflare'").bind(utcDay(c.now)),
];
function cfStatusView(c, q, u) {
  const until = Number((firstRow(q) || {}).until) || 0, row = firstRow(u) || {};
  return { quotaUntil: until > c.now ? until : null,
    usage: { day: utcDay(c.now), requests: Number(row.requests) || 0, neurons: Math.round(Number(row.neurons) || 0), limit: CF_DAILY_NEURONS } };
}
async function routeAiGet(c) {
  await requireTeacher(c);
  const [st, q, u] = await c.db.batch([settingStmt(c.db, "ai"), ...cfStatusStmts(c)]);
  const ai = await aiConfig(c.env, firstRow(st));
  return json({ ok: true, ...aiPublicView(ai), ...cfStatusView(c, q, u) });
}

// Einen Anbieter-Eintrag (erster Anbieter oder Reserve) aus der Eingabe prüfen, Modell-Rangliste holen und den
// API-Schlüssel verschlüsseln (AES-GCM mit SETTINGS_SECRET – nie im Klartext). cur = bisheriger Eintrag oder null.
// Leerer Schlüssel → der alte bleibt, aber nur für denselben Dienst (ein Schlüssel geht nie an einen anderen Anbieter/Host).
async function prepareAiEntry(c, bodyPart, cur) {
  const input = validateAiInput(bodyPart, PROVIDERS);
  if (PROVIDERS[input.provider].keyless) {   // Workers AI: nie einen Schlüssel speichern (kein SETTINGS_SECRET nötig), feste Modellliste
    if (input.apiKey) throw new InputError(MSG.aiKeyless);
    if (input.model && !/^@(cf|hf)\//.test(input.model)) throw new InputError(MSG.aiCfModel);
    const t = await testKey({ provider: input.provider });
    const stored = { provider: input.provider, model: input.model, baseUrl: "", keyHint: "", fallbacks: pickFallbacks(t.models), updatedAt: c.now };
    const bound = !!(c.env.AI && typeof c.env.AI.run === "function");
    return { stored, warning: bound ? "" : "Gespeichert, aber: " + CF_NO_BINDING, tierNote: t.tierNote, modelCount: null };
  }
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
    main = r.stored; clear.push(entryKey(main.provider, false));
    if (r.modelCount != null) out.modelCount = r.modelCount;
    if (r.tierNote) out.tierNote = r.tierNote;
    if (r.warning) out.warning = r.warning;
  }
  if (hasReserve) {
    if (body.reserve === null) reserve = undefined;
    else {
      if (!body.reserve || typeof body.reserve !== "object") throw new InputError("Ungültige Einstellungen für die Reserve-KI.");
      const r = await prepareAiEntry(c, body.reserve, cur.reserve);
      reserve = r.stored; clear.push(entryKey(reserve.provider, true));   // Sperren der Reserve liegen unter ihrem eigenen Schlüssel
      if (r.modelCount != null) out.reserveModelCount = r.modelCount;
      if (r.tierNote) out.reserveTierNote = r.tierNote;
      if (r.warning) out.reserveWarning = r.warning;
    }
  }
  // Eine Reserve ohne gespeicherten ersten Anbieter wäre der einzige Empfänger, obwohl die Übersicht „nicht eingerichtet“ zeigt
  if (reserve && !PROVIDERS[main.provider]) throw new InputError(MSG.aiMainFirst);
  // Workers AI als erster Anbieter und als Reserve: dasselbe Konto, dasselbe Kontingent – keine Reserve (beide Reihenfolgen)
  if (reserve && main.provider === reserve.provider && PROVIDERS[main.provider] && PROVIDERS[main.provider].accountDaily)
    throw new InputError(MSG.aiSameAccount);
  const value = JSON.stringify(reserve ? { ...main, reserve } : main);
  const [, , ...rest] = await c.db.batch([
    c.db.prepare("INSERT INTO settings(key,value) VALUES('ai',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(value),
    // neuer Schlüssel/Modell: Sperren aufheben – außer „Tageskontingent aufgebraucht“ (gilt für das Konto, nicht die Einstellung)
    c.db.prepare("DELETE FROM ai_skip WHERE provider IN (SELECT value FROM json_each(?1)) AND model<>'*'").bind(JSON.stringify([...new Set(clear)])),
    ...cfStatusStmts(c),
  ]);
  Object.assign(out, aiPublicView(await aiConfig(c.env, { value })), cfStatusView(c, rest[0], rest[1]));
  return json(out);
}

// POST …/ai/test testet den ersten Anbieter, …/ai/test?which=reserve die Reserve-KI
async function routeAiTest(c) {
  await requireTeacher(c);
  const ai = await aiConfig(c.env, await settingStmt(c.db, "ai").first());
  const which = new URL(c.request.url).searchParams.get("which") === "reserve" ? "reserve" : "main";
  const e = which === "reserve" ? ai.reserve : ai;
  if (!usable(e)) throw new HttpError(400, "ai_not_configured", (e && e.keyError) || (which === "reserve" ? MSG.aiNoReserve : MSG.aiNoKey));
  let t;
  try { t = await testKey(cfgOf(e)); }
  catch (x) { if (x instanceof AIError) throw new HttpError(502, "ai_error", x.message, { aiCode: x.code }); throw x; }
  e.fallbacks = pickFallbacks(t.models);
  const skip = ((await skipQuery(c.db, e.key, c.now).all()).results || []).map((r) => r.model);   // "*" ist kein Modell: der Test fragt trotzdem
  let out;
  try {
    // outTokens (nur Workers AI): die Testantwort ist kurz – eine kleine Grenze hält auch einen nicht abgeschalteten Denkmodus billig
    out = await callAI(cfgOf(e, skip), TEST_MESSAGES, { temperature: 0.1, maxAttempts: 4, timeoutMs: 30000, deadlineMs: 60000, maxWaitMs: 10000,
      outTokens: 200, beforeAttempt: gate(c), onRotate: onRotate(c) });
  } catch (x) {
    if (!(x instanceof AIError)) throw x;
    const writes = [];
    if (e.keyless && spent(x.cost)) writes.push(usageStmt(c.db, e.provider, x.cost, c.now));
    if (x.code === "DAILY_LIMIT" && x.accountWide && x.until > c.now) writes.push(...quotaLock(c.db, e.key, x.until));   // gilt sofort auch für die Schüler:innen
    if (writes.length) await c.db.batch(writes).catch(() => {});
    throw new HttpError(502, "ai_error", x.message, { aiCode: x.code });
  }
  const stored = which === "reserve" ? { ...ai.stored, reserve: { ...ai.stored.reserve, fallbacks: e.fallbacks, testedAt: c.now } }
    : { ...ai.stored, fallbacks: e.fallbacks, testedAt: c.now };
  await c.db.batch([
    c.db.prepare("UPDATE settings SET value=?1 WHERE key='ai' AND value=?2").bind(JSON.stringify(stored), ai.raw),
    // Workers AI antwortet wieder (z. B. nach einem Wechsel auf Workers Paid): die Sperre „Tageskontingent aufgebraucht“ endet
    ...(e.keyless ? [c.db.prepare("DELETE FROM ai_skip WHERE provider=?1 AND model='*'").bind(e.key)] : []),
    ...(e.keyless && spent(out.cost) ? [usageStmt(c.db, e.provider, out.cost, c.now)] : []),
  ]);
  const sample = String(out.json && typeof out.json.antwort === "string" ? out.json.antwort : out.text).slice(0, 200);
  const res = { ok: true, which, provider: e.provider, label: PROVIDERS[e.provider].label, model: out.model, sample, fallbacks: e.fallbacks,
    modelCount: t.models.length, rotated: out.rotated.map((r) => ({ model: r.model, reason: r.reason })) };
  if (t.tierNote) res.tierNote = t.tierNote;
  if (e.keyless && out.usage) res.usage = out.usage;   // nur Token-Zahlen: zeigt nach dem Deploy, ob der Denkmodus aus ist
  return json(res);
}

/* ---------- Löschfrist (Lehrkraft) und Angaben für den Datenschutzhinweis ---------- */
const DAY_MS = 86400e3;
const olderThanStmt = (c) => c.db.prepare(OLDER_THAN_SQL).bind(...RETENTION_OPTIONS.map((d) => c.now - d * DAY_MS));
const olderThanView = (row) => Object.fromEntries(RETENTION_OPTIONS.map((d) => [String(d), Number((row || {})["d" + d]) || 0]));
const privacyDefaults = { retentionDays: LIMITS.retentionDefault, options: RETENTION_OPTIONS, min: LIMITS.retentionMin, max: LIMITS.retentionMax };
// GET: gespeicherte Frist (null = nie gespeichert; auto = Vorgabe einer Neuinstallation), wie viele Einträge jede wählbare Frist jetzt
// löschen würde, und die KI-Empfänger wie für die Schüler:innen (für die Vorschau des Hinweises)
async function routePrivacyGet(c) {
  await requireTeacher(c);
  const [st, ai, old] = await c.db.batch([settingStmt(c.db, "privacy"), settingStmt(c.db, "ai"), olderThanStmt(c)]);
  const p = privacyOut(parseSetting(firstRow(st)));
  return json({ ok: true, privacy: p, defaults: privacyDefaults, olderThan: olderThanView(firstRow(old)),
    aiRecipients: recipientsFor(await aiConfig(c.env, firstRow(ai))) });
}
// PUT {retentionDays, confirmDelete}: speichert (ersetzt) und löscht im selben Batch, was nach der neuen Frist zu alt ist –
// eine Transaktion: scheitert sie, ist nichts gespeichert und nichts gelöscht. Die Oberfläche fragt vorher nach und schickt die
// bestätigte Zahl (confirmDelete); würde jetzt mehr gelöscht (die Seite war lange offen, die Zahl beim Öffnen nicht ladbar …),
// bleibt alles, wie es war: 409 confirm_delete mit der aktuellen Zahl (wouldDelete) und olderThan, damit sie neu fragen kann.
async function routePrivacyPut(c) {
  await requireTeacher(c);
  const { retentionDays, confirmDelete } = validatePrivacyInput(await readJson(c.request));   // ein mitgeschicktes school entfällt
  const value = JSON.stringify({ v: 1, retentionDays, updatedAt: c.now }), cutoff = c.now - retentionDays * DAY_MS;
  const [cnt, , del, old] = await c.db.batch([
    c.db.prepare(COUNT_OLDER_SQL).bind(cutoff),
    c.db.prepare(SAVE_PRIVACY_SQL).bind(cutoff, value, confirmDelete),
    c.db.prepare(DELETE_OLDER_SQL).bind(cutoff, value),
    olderThanStmt(c),
  ]);
  const n = Number((firstRow(cnt) || {}).n) || 0;
  if (n > confirmDelete) {
    throw new HttpError(409, "confirm_delete", `Mit dieser Frist ${n === 1 ? "würde jetzt 1 älterer Eintrag" : "würden jetzt " + n + " ältere Einträge"} gelöscht – ` +
      "mehr, als Sie bestätigt haben. Es wurde nichts gespeichert und nichts gelöscht.", { wouldDelete: n, olderThan: olderThanView(firstRow(old)) });
  }
  return json({ ok: true, privacy: privacyOut(JSON.parse(value)), deleted: (del.meta && del.meta.changes) || 0, olderThan: olderThanView(firstRow(old)) });
}
// GET /api/privacy – öffentlich, für die Seite „Impressum & Datenschutz“ (ohne Code): dieselben Angaben wie im Datenschutzhinweis
// eines Blattes (routePublicSheet) – Löschfrist (null = keine automatische Löschung) und nur nutzbare KI-Empfänger; eine Abfrage,
// kein Rate-Limit (keine Codes, nichts zu raten), nicht gecacht (Änderungen der Lehrkraft gelten sofort)
async function routePublicPrivacy(c) {
  const [st] = await c.db.batch([c.db.prepare("SELECT key, value FROM settings WHERE key IN ('ai','privacy')")]);
  const rows = Object.fromEntries((st.results || []).map((r) => [r.key, r]));
  const pv = privacyOut(parseSetting(rows.privacy));
  return json({ ok: true, retentionDays: pv ? pv.retentionDays : null, aiRecipients: recipientsFor(await aiConfig(c.env, rows.ai || null)) });
}

/* ---------- Öffentlich (Schüler:innen) ---------- */
// Empfänger der Schülertexte für den Datenschutzhinweis: erster Anbieter, dann die Reserve – nur nutzbare Einträge (usable: ein nicht
// entschlüsselbarer Schlüssel bzw. ein nicht gespeichertes Workers AI bekommt nie Daten); id = Anbieter bzw. custom:Host, label =
// Rechtsträger und Sitz, transfer = Grundlage der Übermittlung in ein Drittland (Art. 13 Abs. 1 Buchst. f DSGVO)
const recipientsFor = (ai) => activeEntries(ai).map((e) => ({ id: entryId(e), label: recipientLabel(e.provider, e.baseUrl), transfer: recipientTransfer(e.provider) }));
// Gültige Codes gehen immer durch; nur unbekannte Codes zählen (887 Mio. mögliche Codes – Raten lohnt nicht,
// aber Tippfehler einer ganzen Schule dürfen niemanden aussperren)
async function routePublicSheet(c, codeRaw) {
  const code = codeParam(codeRaw);
  if (!isValidCode(code)) { await countFailure(c, "lookup_miss"); throw sheetNotFound(); }
  const [sh, st, im, fi] = await c.db.batch([
    c.db.prepare("SELECT code, title, tasks, escape_id, escape_name FROM sheets WHERE code=?1").bind(code),
    c.db.prepare("SELECT key, value FROM settings WHERE key IN ('teacher','ai','privacy')"),   // eine Abfrage für alle drei
    imagesStmt(c.db, code),
    filesStmt(c.db, code),
  ]);
  const s = firstRow(sh);
  if (!s) { await countFailure(c, "lookup_miss"); throw sheetNotFound(); }
  const rows = Object.fromEntries((st.results || []).map((r) => [r.key, r]));
  const teacher = parseSetting(rows.teacher);
  // Empfänger für den Datenschutzhinweis (recipientsFor); Löschfrist (privacy, null = nie gespeichert)
  const ai = await aiConfig(c.env, rows.ai || null);
  const list = activeEntries(ai);
  const aiProvider = list.length && list[0] === ai ? providerLabel(ai.provider, ai.baseUrl) : null;
  const aiRecipients = recipientsFor(ai);
  const pv = privacyOut(parseSetting(rows.privacy));
  const aiReserve = list.length > 1 ? providerLabel(list[1].provider, list[1].baseUrl) : null;   // für ältere, noch gecachte Seiten
  // Niemals Aufträge an die KI (solution) ausliefern: nur Aufgabentext (rein und – falls vorhanden – formatiert als textFmt) und
  // Bild-Metadaten verlassen den Server; die Länder einer Weltkarten-Zuordnung nur als Prüfwerte (SHA-256 von Code|Karte|Land),
  // Kartenbilder nur, wenn sie zu dieser Aufgabe gespeichert sind
  // aiFeedback: Hat mindestens eine Aufgabe einen Auftrag an die KI (keine Weltkarte)? Sonst zeigt die Seite keinen
  // Feedback-Button (nur ein Ja/Nein – nie der Auftrag selbst)
  const parsed = parseTasks(s.tasks), aiFeedback = parsed.some(wantsFeedback);
  const tasks = await Promise.all(parsed.map(async (t, i) => {
    const images = imagesForTask(im.results, i + 1);
    return { text: String(t.text || ""), textFmt: Array.isArray(t.textFmt) ? t.textFmt : [], material: Array.isArray(t.material) ? t.material : [], images, files: filesForTask(fi.results, i + 1),
      answer: await publicAnswer(t.answer, code, new Set(images.filter((m) => m.mode === "card").map((m) => m.id))) };
  }));
  return json({ ok: true, sheet: { code: s.code, title: s.title, tasks, publicKey: teacher ? teacher.publicKey : null, aiFeedback, aiProvider, ...(aiRecipients.length ? { aiRecipients } : {}), ...(aiReserve ? { aiReserve } : {}),
    privacy: pv ? { retentionDays: pv.retentionDays } : null,
    // Finale eines Escape-Rooms: nur Kennung und Name des Raums (die Seite sperrt dann die Code-Eingabe), sonst null
    escape: escapeOut(s.escape_id, s.escape_name) } });
}

const AI_SOURCE_TYPE = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";
// KI-Fehler, bei denen Warten hilft → 429 mit Retry-After (der Browser wiederholt automatisch); sonst 502
const AI_WAIT = { BUSY: 30, RATE_LIMIT: 45, TIMEOUT: 30 };
const AI_REFUND = new Set(["BUSY", "RATE_LIMIT", "TIMEOUT", "SERVER", "NETWORK", "DAILY_LIMIT"]);   // nicht die Schuld der Schüler:innen
// Nur bei diesen Fehlern des ersten Anbieters geht dieselbe Anfrage an die Reserve-KI (Verfügbarkeit, zu lang, unbrauchbare
// Antwort). Nie bei Inhaltsfiltern (FILTERED) und nie bei Fehlkonfiguration (AUTH, CONFIG, PRIVACY_POLICY, REGION, PAYMENT):
// Datenminimierung – die Reserve bekommt Schülertexte nur, wenn der erste Anbieter nicht verfügbar ist.
const RESERVE_ON = new Set(["BUSY", "RATE_LIMIT", "DAILY_LIMIT", "TIMEOUT", "SERVER", "NETWORK", "NOT_FOUND", "NO_MODEL", "TOO_LARGE", "EMPTY", "BAD_JSON", "TRUNCATED", "HTTP"]);
const retryAfterOfErr = (e) => { const s = Math.ceil((e.retryAfterMs || 0) / 1000); return s > 0 ? Math.max(5, Math.min(60, s)) : (AI_WAIT[e.code] || 30); };

/* ---------- Eine KI-Anfrage: erster Anbieter, dann die Reserve (Feedback und Checkliste) ---------- */
// Gesperrte Modelle je Eintrag (einmal je Aufruf gelesen). Model "*" = Tageskontingent des ganzen Kontos aufgebraucht (Workers AI):
// bis 0:00 UTC keine Anfrage mehr dorthin.
function skipReader(c) {
  const skips = new Map();
  return async (e) => {
    if (!skips.has(e.key)) skips.set(e.key, ((await skipQuery(c.db, e.key, c.now).all()).results || []).map((r) => r.model));
    return skips.get(e.key);
  };
}
// Nur ein Eintrag, und sein Konto-Tageskontingent ist aufgebraucht: Es steht schon vorher fest, dass nichts zur KI geht – nicht zählen
const quotaBlocked = async (entries, skipOf) => entries.length === 1 && !!PROVIDERS[entries[0].provider].accountDaily && (await skipOf(entries[0])).includes("*");
const quotaErr = () => new AIError("DAILY_LIMIT", "Tageskontingent aufgebraucht.", { accountWide: true });
// Fragt die Einträge in dieser Reihenfolge (erster Anbieter, dann die Reserve) → {out, err}. Verbrauch von Workers AI und die Sperre
// „Tageskontingent aufgebraucht“ gehen per waitUntil in D1. Zeitbudget: insgesamt 100 s (der Browser wartet bis 150 s); mit Reserve
// bekommt der erste Anbieter 45 s, die Reserve den Rest – aber nur, wenn noch ≥ 35 s bleiben (sonst ein nutzloser Abbruch). Langes
// Warten erledigt der Browser (Wiederholung). Wurde der erste Anbieter gar nicht gefragt (nur wegen "*" übersprungen), bekommt die
// Reserve das volle Budget.
async function askAI(c, entries, skipOf, messages, { temperature, geminiSchema, accept, outTokens }) {
  const t0 = Date.now(), BUDGET = 100000, startAt = Math.floor(Math.random() * 64);
  let out = null, err = null, called = false;
  const usage = [];   // Workers AI: geschätzter Verbrauch je Aufruf (auch gescheiterter)
  for (let i = 0; i < entries.length && !out; i++) {
    const e = entries[i], left = BUDGET - (Date.now() - t0), lead = !called;   // lead: der erste Eintrag, der wirklich gefragt wird
    if (i > 0 && (!(err && RESERVE_ON.has(err.code)) || (!lead && left < 35000))) break;   // Reserve nur bei Verfügbarkeitsproblemen
    const skip = await skipOf(e);
    if (skip.includes("*")) { if (!err) err = quotaErr(); continue; }
    called = true;
    try {
      out = await callAI(cfgOf(e, skip), messages, {
        temperature, geminiSchema, accept,
        timeoutMs: 45000, deadlineMs: lead ? (i < entries.length - 1 ? 45000 : left) : Math.min(40000, left), maxWaitMs: 15000,
        maxAttempts: lead ? 6 : 3, startAt: startAt + i, outTokens,
        beforeAttempt: gate(c), onRotate: onRotate(c),
      });
      if (e.keyless && spent(out.cost)) usage.push(usageStmt(c.db, e.provider, out.cost, c.now));
    } catch (x) {
      if (!(x instanceof AIError)) throw x;
      if (e.keyless && spent(x.cost)) usage.push(usageStmt(c.db, e.provider, x.cost, c.now));
      if (x.code === "DAILY_LIMIT" && x.accountWide && x.until > c.now) usage.push(...quotaLock(c.db, e.key, x.until));   // für alle folgenden Anfragen bis 0:00 UTC
      // Es zählt der letzte Fehler – außer die Reserve ist selbst falsch eingerichtet, dann bleibt der des ersten Anbieters
      if (!err || !(x.code === "NO_KEY" || x.code === "CONFIG" || x.code === "NO_MODEL")) err = x;
    }
  }
  if (usage.length) c.waitUntil(c.db.batch(usage).catch(() => {}));
  return { out, err };
}

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
  // Zweite Rückmeldung nach der Abgabe: nur die nach dem ersten Feedback geänderten Aufgaben (spart Token und Kontingent)
  const only = validateOnly(body.only, tasks.length);
  const { messages, nrs } = buildFeedbackMessages(tasks, answers, only);
  if (!nrs.length) return json({ ok: true, results: feedbackResults(tasks, new Map(), only), aiGenerated: false });   // kein Auftrag an die KI: keine KI nötig
  const ai = await aiConfig(c.env, firstRow(st));
  let entries = activeEntries(ai);   // erster Anbieter, danach die Reserve-KI (falls eingerichtet)
  if (!entries.length) throw new HttpError(503, "ai_not_configured", MSG.aiNotConfigured);
  // Transparenz: Der Browser schickt mit, über welche Empfänger die Schülerin bzw. der Schüler vor dem Klick informiert war
  // (ids aus GET /api/sheet, in der Reihenfolge des Hinweises: erster Anbieter, dann die Reserve). Nur diese dürfen Daten bekommen,
  // und die Reihenfolge zählt („nur wenn der erste … nicht antwortet“): Steht der jetzige erste Anbieter dort nicht an erster Stelle
  // (geändert, mit der Reserve getauscht oder entfernt, sodass die Reserve nachrückt), bekommt der Browser 409 und zeigt den neuen
  // Hinweis, bevor etwas gesendet wird. Eine neu ergänzte Reserve, über die nicht informiert wurde, bleibt einfach außen vor.
  if (Array.isArray(body.recipients)) {
    const allowed = new Set(body.recipients.filter((x) => typeof x === "string").slice(0, 10));
    if (body.recipients[0] !== entryId(entries[0])) throw new HttpError(409, "ai_changed", MSG.aiChanged);
    entries = entries.filter((e) => allowed.has(entryId(e)));
  }
  // Ohne Reserve steht bei aufgebrauchtem Konto-Tageskontingent schon vorher fest, dass nichts zur KI geht – nicht zählen
  const skipOf = skipReader(c);
  if (await quotaBlocked(entries, skipOf)) throw new HttpError(503, "ai_quota", PUBLIC_MSG.DAILY_LIMIT, { aiCode: "DAILY_LIMIT" });
  // Erst zählen, wenn die Anfrage gültig ist und wirklich zur KI geht: je IP (Anzahl und Zeichen) und je Blatt und Tag
  const chars = answers.reduce((n, a) => n + a.length, 0);
  const refund = await countAll(c, [{ kind: "feedback" }, { kind: "feedback_chars", weight: Math.max(1, chars) }, { kind: "sheet_feedback", key: code }]);
  const { out, err } = await askAI(c, entries, skipOf, messages,
    { temperature: 0.1, geminiSchema: FEEDBACK_SCHEMA_GEMINI, accept: feedbackAcceptor(nrs), outTokens: Math.min(8192, 800 + 300 * nrs.length) });
  if (!out) {
    if (AI_REFUND.has(err.code)) refund();
    if (err.code === "NO_KEY" || err.code === "CONFIG" || err.code === "NO_MODEL") throw new HttpError(503, "ai_not_configured", MSG.aiNotConfigured);
    if (AI_WAIT[err.code]) throw new HttpError(429, "ai_busy", PUBLIC_MSG[err.code] || PUBLIC_MSG._, { aiCode: err.code, retryAfter: retryAfterOfErr(err) });
    // Konto-Tageskontingent (Workers AI): bis 0:00 UTC hilft keine Wiederholung – eigener Code, der Browser bietet die Abgabe ohne KI an
    if (err.code === "DAILY_LIMIT" && err.accountWide) throw new HttpError(503, "ai_quota", PUBLIC_MSG.DAILY_LIMIT, { aiCode: err.code });
    throw new HttpError(502, "ai_error", PUBLIC_MSG[err.code] || PUBLIC_MSG._, { aiCode: err.code });
  }
  // Maschinenlesbar gekennzeichnet (Art. 50 Abs. 2 KI-VO): die Stichpunkte hat eine KI erzeugt (IPTC Digital Source Type)
  return json({ ok: true, results: feedbackResults(tasks, normalizeFeedback(out.json, nrs), only), aiGenerated: true, digitalSourceType: AI_SOURCE_TYPE });
}

// Abgabe (stage "final") oder Erstversuch (stage "first", nach dem KI-Feedback). Mit derselben attempt-Kennung ersetzt die
// Abgabe den Erstversuch derselben Bearbeitung; ein Erstversuch überschreibt nie eine Abgabe. Der Server sieht nur den Umschlag.
async function routeSubmit(c) {
  const body = await readJson(c.request);
  const code = normalizeCode(body.code);
  if (!isValidCode(code)) throw sheetNotFound();
  const envelope = validateEnvelope(body.envelope);
  const { stage, attempt, replace, receivedAt } = validateSubmitMeta(body);
  const [sh, cnt, ex, pv] = await c.db.batch([
    c.db.prepare("SELECT 1 AS x FROM sheets WHERE code=?1").bind(code),
    c.db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(length(envelope)),0) AS bytes FROM submissions WHERE sheet_code=?1").bind(code),
    attempt ? c.db.prepare("SELECT id, stage, received_at FROM submissions WHERE sheet_code=?1 AND attempt=?2 ORDER BY id DESC LIMIT 1").bind(code, attempt)
      : c.db.prepare("SELECT 1 AS x WHERE 0"),
    settingStmt(c.db, "privacy"),   // Löschfrist jetzt (nicht beim Öffnen des Blattes): die Bestätigungsseite nennt das Löschdatum
  ]);
  if (!firstRow(sh)) throw sheetNotFound();
  // Nachgereichte zweite KI-Rückmeldung (stage „feedback2“): nur genau die eigene Abgabe ersetzen – dieselbe Kennung, derselbe
  // Eingang (eine inzwischen neuere Abgabe derselben Bearbeitung bleibt) und nur kurz danach (der Eingang bleibt stehen, also darf
  // so keine Abgabe Stunden später ausgetauscht werden). Gelöscht, ersetzt oder zu spät → nichts angelegt, nichts gezählt
  const old = attempt ? firstRow(ex) : null;
  if (replace && (!old || old.stage !== "final" || Number(old.received_at) !== receivedAt || receivedAt <= c.now - REPLACE_WINDOW_MS))
    return json({ ok: true, gone: true });
  await countAll(c, [{ kind: "submit" }, { kind: "submit_bytes", weight: envelope.length }]);   // nur gültige Abgaben zählen
  const retentionDays = (privacyOut(parseSetting(firstRow(pv))) || {}).retentionDays || null;   // null = keine automatische Löschung
  const prev = old;
  if (replace) {   // Eingang (received_at) bleibt der Zeitpunkt der Abgabe – auch für die Löschfrist; dieselben Bedingungen atomar
    const u = await c.db.prepare("UPDATE submissions SET envelope=?1 WHERE id=?2 AND stage='final' AND received_at=?3").bind(envelope, prev.id, receivedAt).run();
    if (!u.meta || !u.meta.changes) return json({ ok: true, gone: true });
    return json({ ok: true, id: Number(prev.id), replaced: "final", retentionDays });
  }
  if (prev) {
    if (prev.stage === "final" && stage === "first") return json({ ok: true, id: Number(prev.id), receivedAt: c.now, kept: true, retentionDays });   // Abgabe bleibt
    await c.db.prepare("UPDATE submissions SET envelope=?1, received_at=?2, stage=?3 WHERE id=?4").bind(envelope, c.now, stage, prev.id).run();
    return json({ ok: true, id: Number(prev.id), receivedAt: c.now, replaced: prev.stage, retentionDays });
  }
  const use = firstRow(cnt) || {};
  if ((use.n || 0) >= LIMITS.submissionsPerSheet || (use.bytes || 0) + envelope.length > LIMITS.sheetBytes)
    throw new HttpError(409, "too_many_submissions", MSG.tooMany);
  const r = await c.db.prepare("INSERT INTO submissions(sheet_code,received_at,envelope,stage,attempt) VALUES(?1,?2,?3,?4,?5)").bind(code, c.now, envelope, stage, attempt).run();
  return json({ ok: true, id: r.meta ? r.meta.last_row_id : null, receivedAt: c.now, retentionDays });
}

/* ---------- Checkliste zum analogen Arbeitsblatt ----------
 * Die KI schlägt aus den Aufträgen an die KI einmal je Blatt Punkte vor (draft, nur für die Lehrkraft); erst was die Lehrkraft
 * speichert (final), ist über den QR-Code des gedruckten Arbeitsblattes öffentlich. Die KI bekommt nur Aufgaben, Material und
 * Aufträge – keine Antworten, keine Daten von Schüler:innen (deshalb auch kein Abgleich der Empfänger wie beim Feedback). */
const checklistStmt = (db, code) => db.prepare("SELECT draft, final, updated_at FROM sheet_checklists WHERE sheet_code=?1").bind(code);
// Speichern nur, solange das Blatt existiert (sonst bliebe eine verwaiste Zeile, wenn es inzwischen gelöscht wurde)
const saveDraftStmt = (db, code, draft, now) => db.prepare(
  "INSERT INTO sheet_checklists(sheet_code,draft,final,updated_at) SELECT ?1,?2,NULL,?3 WHERE EXISTS(SELECT 1 FROM sheets WHERE code=?1) " +
  "ON CONFLICT(sheet_code) DO UPDATE SET draft=excluded.draft, updated_at=excluded.updated_at").bind(code, JSON.stringify(draft), now);
const saveFinalStmt = (db, code, final, now) => db.prepare(
  "INSERT INTO sheet_checklists(sheet_code,draft,final,updated_at) SELECT ?1,NULL,?2,?3 WHERE EXISTS(SELECT 1 FROM sheets WHERE code=?1) " +
  "ON CONFLICT(sheet_code) DO UPDATE SET draft=NULL, final=excluded.final, updated_at=excluded.updated_at").bind(code, JSON.stringify(final), now);
const emptyChecklist = (n, ai) => ({ v: 1, ai, tasks: Array.from({ length: n }, (_, i) => ({ n: i + 1, points: [] })) });

// GET …/sheets/:code/checklist → {checklist: {draft, final, updatedAt} | null, aiFeedback, aiReady}: aiFeedback = mindestens eine Aufgabe
// mit Auftrag an die KI, aiReady = ein KI-Dienst ist nutzbar (dann sagt das gedruckte Blatt, dass es digital KI-Feedback gibt)
async function routeChecklistGet(c, codeRaw) {
  await requireTeacher(c);
  const code = codeParam(codeRaw);
  if (!isValidCode(code)) throw sheetGone();
  const [sh, ck, st] = await c.db.batch([c.db.prepare("SELECT tasks FROM sheets WHERE code=?1").bind(code), checklistStmt(c.db, code), settingStmt(c.db, "ai")]);
  const s = firstRow(sh);
  if (!s) throw sheetGone();
  const tasks = parseTasks(s.tasks), row = firstRow(ck);
  const checklist = row ? { draft: checklistOut(row.draft, tasks.length), final: checklistOut(row.final, tasks.length), updatedAt: Number(row.updated_at) || null } : null;
  return json({ ok: true, checklist, aiFeedback: tasks.some(wantsFeedback), aiReady: activeEntries(await aiConfig(c.env, firstRow(st))).length > 0 });
}

// POST …/sheets/:code/checklist {force?} – die KI schlägt einmal vor: Gibt es schon einen Entwurf oder eine gespeicherte Checkliste,
// fragt der Server ohne force nicht erneut. Ohne Aufgabe mit Auftrag an die KI: leerer Entwurf ohne KI (noAi). Das Ergebnis wird
// als Entwurf gespeichert; eine gespeicherte Checkliste (final) bleibt unverändert öffentlich, bis die Lehrkraft neu speichert.
async function routeChecklistPost(c, codeRaw) {
  await requireTeacher(c);
  const code = codeParam(codeRaw);
  if (!isValidCode(code)) throw sheetGone();
  const body = (await readJson(c.request, true)) || {};
  if (body.force != null && typeof body.force !== "boolean") throw new InputError("Ungültige Anfrage.");
  const [sh, ck, st] = await c.db.batch([c.db.prepare("SELECT tasks, escape_id, escape_name FROM sheets WHERE code=?1").bind(code), checklistStmt(c.db, code), settingStmt(c.db, "ai")]);
  const s = firstRow(sh);
  if (!s) throw sheetGone();
  if (escapeOut(s.escape_id, s.escape_name)) throw new HttpError(400, "escape_sheet", MSG.ckEscape);   // kein analoges Arbeitsblatt
  const tasks = parseTasks(s.tasks), row = firstRow(ck) || {};
  const draft = checklistOut(row.draft, tasks.length), final = checklistOut(row.final, tasks.length);
  if (!body.force && (draft || final)) return json({ ok: true, draft, final, generated: false, ...(tasks.some(wantsFeedback) ? {} : { noAi: true }) });
  const save = async (d) => { const r = await saveDraftStmt(c.db, code, d, c.now).run(); if (!r.meta || !r.meta.changes) throw sheetGone(); return d; };
  const { messages, nrs } = buildChecklistMessages(tasks);
  if (!nrs.length) return json({ ok: true, draft: await save(emptyChecklist(tasks.length, false)), final, generated: false, noAi: true });
  const entries = activeEntries(await aiConfig(c.env, firstRow(st)));   // erster Anbieter, danach die Reserve-KI
  if (!entries.length) throw new HttpError(503, "ai_not_configured", MSG.ckNoAi);
  const skipOf = skipReader(c);
  if (await quotaBlocked(entries, skipOf)) throw new HttpError(503, "ai_quota", MSG.ckQuota, { aiCode: "DAILY_LIMIT" });
  const refund = await countAll(c, [{ kind: "checklist" }]);   // erst zählen, wenn die Anfrage wirklich zur KI geht
  const { out, err } = await askAI(c, entries, skipOf, messages,
    { temperature: 0.2, geminiSchema: CHECKLIST_SCHEMA_GEMINI, accept: checklistAcceptor(nrs), outTokens: Math.min(4096, 400 + 250 * nrs.length) });
  if (!out) {   // wie beim Feedback, aber mit der ausführlichen Meldung für die Lehrkraft (wie beim Verbindungstest)
    if (AI_REFUND.has(err.code)) refund();
    if (err.code === "NO_KEY" || err.code === "CONFIG" || err.code === "NO_MODEL") throw new HttpError(503, "ai_not_configured", err.message || MSG.ckNoAi, { aiCode: err.code });
    if (AI_WAIT[err.code]) throw new HttpError(429, "ai_busy", err.message, { aiCode: err.code, retryAfter: retryAfterOfErr(err) });
    if (err.code === "DAILY_LIMIT" && err.accountWide) throw new HttpError(503, "ai_quota", MSG.ckQuota, { aiCode: err.code });
    throw new HttpError(502, "ai_error", err.message, { aiCode: err.code });
  }
  const map = normalizeChecklist(out.json, nrs), d = emptyChecklist(tasks.length, true);
  for (const t of d.tasks) t.points = map.get(t.n) || [];
  return json({ ok: true, draft: await save(d), final, generated: true });
}

// PUT …/sheets/:code/checklist {ai, tasks} – speichert die geprüfte Checkliste (final, ab jetzt öffentlich) und verwirft den Entwurf
async function routeChecklistPut(c, codeRaw) {
  await requireTeacher(c);
  const code = codeParam(codeRaw);
  if (!isValidCode(code)) throw sheetGone();
  const body = await readJson(c.request);
  const sh = await c.db.prepare("SELECT json_array_length(tasks) AS n, escape_id, escape_name FROM sheets WHERE code=?1").bind(code).first();
  if (!sh) throw sheetGone();
  if (escapeOut(sh.escape_id, sh.escape_name)) throw new HttpError(400, "escape_sheet", MSG.ckEscape);
  const { ai, tasks } = validateChecklist(body, Number(sh.n) || 0), final = { v: 1, ai, tasks };
  const r = await saveFinalStmt(c.db, code, final, c.now).run();
  if (!r.meta || !r.meta.changes) throw sheetGone();
  return json({ ok: true, final, updatedAt: c.now });
}

// GET /api/sheet/:code/checklist – öffentlich (Ziel des QR-Codes): nur die gespeicherte Checkliste mit Titel und reinem Aufgabentext,
// nie der Entwurf und nie die Aufträge an die KI. Unbekannte Codes zählen wie beim Blatt; ein Blatt ohne Checkliste nicht.
async function routePublicChecklist(c, codeRaw) {
  const code = codeParam(codeRaw);
  if (!isValidCode(code)) { await countFailure(c, "lookup_miss"); throw sheetNotFound(); }
  const [sh, ck] = await c.db.batch([
    c.db.prepare("SELECT code, title, tasks FROM sheets WHERE code=?1").bind(code),
    c.db.prepare("SELECT final FROM sheet_checklists WHERE sheet_code=?1").bind(code),
  ]);
  const s = firstRow(sh);
  if (!s) { await countFailure(c, "lookup_miss"); throw sheetNotFound(); }
  const tasks = parseTasks(s.tasks), fin = checklistOut((firstRow(ck) || {}).final, tasks.length);
  if (!fin) throw new HttpError(404, "no_checklist", MSG.noChecklist);
  return json({ ok: true, code: s.code, title: s.title, ai: fin.ai, tasks: tasks.map((t, i) => ({ n: i + 1, text: String(t.text || ""), points: fin.tasks[i].points })) });
}

/* ---------- Routing ---------- */
const ROUTES = [
  ["/api/health", { GET: async () => json({ ok: true, service: "feibeitsblatt" }) }, { noDb: true }],
  ["/api/privacy", { GET: routePublicPrivacy }],
  [/^\/api\/sheet\/([^/]+)$/, { GET: routePublicSheet }],
  [/^\/api\/sheet\/([^/]+)\/images\/([^/]+)$/, { GET: routePublicImage }],
  [/^\/api\/sheet\/([^/]+)\/files\/([^/]+)$/, { GET: routePublicFile }],
  [/^\/api\/sheet\/([^/]+)\/checklist$/, { GET: routePublicChecklist }],
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
  [/^\/api\/teacher\/sheets\/([^/]+)\/checklist$/, { GET: routeChecklistGet, POST: routeChecklistPost, PUT: routeChecklistPut }],
  ["/api/teacher/ai", { GET: routeAiGet, PUT: routeAiPut }],
  ["/api/teacher/ai/test", { POST: routeAiTest }],
  ["/api/teacher/privacy", { GET: routePrivacyGet, PUT: routePrivacyPut }],
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
    // gelegentlich aufräumen – Rückfall, falls der tägliche Zeitplan fehlt (z. B. Cron-Kontingent des Kontos voll)
    if (Math.random() < 0.02) c.waitUntil(c.db.batch(cleanupStatements(c.db, c.now)).catch(() => {}));
  }
  return handler(c, ...route.params);
}

export default {
  // Täglich (Cron Trigger in wrangler.jsonc, 02:17 UTC): Löschfrist anwenden und aufräumen. now = geplanter Zeitpunkt (lokal per
  // /cdn-cgi/local/scheduled?cron=…&time=… testbar). Fehler nicht abfangen: ein gescheiterter Lauf erscheint im Dashboard unter
  // „Past Cron Events“ (ohne Inhalte – Protokolle sind abgeschaltet).
  async scheduled(controller, env) {
    const now = Number(controller && controller.scheduledTime) || Date.now();
    await ensureSchema(env.DB);
    await env.DB.batch(cleanupStatements(env.DB, now));
  },
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
