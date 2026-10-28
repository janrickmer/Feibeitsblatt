// lib.js – reine Hilfsfunktionen des Feibeitsblatt-Workers (ohne D1, ohne Netz; per Unit-Test geprüft).

/* ---------- Aufgabencodes ---------- */
// 31 Zeichen ohne I, L, O, 0, 1 (verwechslungsarm); 6 Stellen ≈ 887 Mio. Kombinationen
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/;

export function normalizeCode(input) {
  return String(input == null ? "" : input).toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export function isValidCode(code) {
  return typeof code === "string" && CODE_RE.test(code) && /[A-Z]/.test(code) && /[0-9]/.test(code);
}
export function formatCode(code) {
  return code.length === 6 ? code.slice(0, 3) + "-" + code.slice(3) : code;
}
// Ohne Modulo-Verzerrung: nur Bytes < 248 (= 8 · 31) verwenden; mindestens ein Buchstabe und eine Ziffer
export function generateCode(rand = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  for (;;) {
    let out = "";
    while (out.length < CODE_LENGTH) {
      for (const b of rand(16)) {
        if (b < limit) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
        if (out.length === CODE_LENGTH) break;
      }
    }
    if (isValidCode(out)) return out;
  }
}

/* ---------- Base64, Hex, Hash, Vergleich ---------- */
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
export function b64Bytes(s) {   // Länge der dekodierten Bytes ohne zu dekodieren; -1 = kein gültiges Base64
  if (typeof s !== "string" || s.length % 4 !== 0 || !B64_RE.test(s)) return -1;
  const pad = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  return (s.length / 4) * 3 - pad;
}
export function isB64(s, minBytes = 1, maxBytes = Infinity) {
  const n = b64Bytes(s);
  return n >= minBytes && n <= maxBytes;
}
export function b64ToBytes(s) {
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToB64(bytes) {
  let bin = ""; const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(bin);
}
const HEX = Array.from({ length: 256 }, (_, i) => (i < 16 ? "0" : "") + i.toString(16));   // Tabelle statt padStart/join: bis zu 400 Prüfwerte beim Anlegen (10 ms CPU)
export function toHex(buf) {
  const u = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i++) s += HEX[u[i]];
  return s;
}
const TE = new TextEncoder();
export async function sha256Hex(data) {
  const bytes = typeof data === "string" ? TE.encode(data) : data;
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}
// Vergleich in konstanter Zeit (Länge ist kein Geheimnis: Hashes haben feste Länge)
export function timingSafeEqualStr(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);   // außerhalb: NaN | 0 = 0
  return diff === 0;
}

/* ---------- Eingabeprüfung ---------- */
export const LIMITS = {
  bodyBytes: 1024 * 1024,          // Request-Body
  envelopeBytes: 400 * 1024,       // verschlüsselte Abgabe (realistisch ≤ ~150 KB)
  tasks: 30, taskText: 4000, solution: 8000, title: 200,
  answer: 8000, answersTotal: 40000,
  submissionsPerSheet: 400,        // Schutz vor Vollschreiben der Datenbank (eine Klasse braucht ≤ ~100)
  sheetBytes: 40 * 1024 * 1024,    // Summe aller Umschläge je Blatt
  submissionsPage: 50,             // Abgaben je Seite der Lehrkraft-Liste (Arbeitsspeicher des Workers)
  deleteIds: 50,                   // Einträge je Löschauftrag einer Person (DELETE …/submissions mit {ids}; gebunden ≤ 100 Parameter)
  pageBytes: 8 * 1024 * 1024,      // … und höchstens so viele Umschlag-Bytes je Seite
  imageBytes: 500 * 1024,          // ein Bild zu einer Aufgabe (der Browser verkleinert vorher auf ≤ 1600 px)
  imagesPerTask: 5,                // Bilder je Aufgabe
  sheetImageBytes: 12 * 1024 * 1024, // Summe aller Bilder je Blatt (D1-Speicher)
  imageSide: 4096,                 // größte erlaubte Kantenlänge laut Kopfdaten
  imageAlt: 200,                   // Bildbeschreibung (wird vorgelesen)
  fileBytes: 6 * 1024 * 1024,      // eine PDF-Datei zu einer Aufgabe
  filesPerTask: 3,                 // PDF-Dateien je Aufgabe
  sheetFileBytes: 20 * 1024 * 1024, // Summe aller PDF-Dateien je Blatt (D1-Speicher)
  fileChunk: 512 * 1024,           // Dateien werden in Teilen hochgeladen (Body ≤ 1 MB, D1-Zeile klein halten)
  fileName: 120,                   // Dateiname (Anzeige und Download)
  storageBytes: 200 * 1024 * 1024, // Bilder und PDF-Dateien ALLER Blätter zusammen (roh; als Base64 ≈ 267 MB) – D1 Free
                                   // erlaubt 500 MB je Datenbank, der Rest bleibt für Abgaben, Blätter und Zähler
  material: 8000,                  // Material je Aufgabe (Zeichen), formatiert als Absätze aus Läufen
  materialParagraphs: 200, materialRuns: 600, materialLinks: 60, href: 1000,
  // Antwortarten (answer je Aufgabe): Tabelle und Weltkarten-Zuordnung
  tableColumns: 8, columnName: 60, tableRows: 30,
  mapItems: 40, itemId: 40, itemLabel: 120, itemHint: 400, itemCountries: 10, countryName: 80,
  mapChecks: 400,                  // Prüfwerte (Länder aller Karten) je Blatt – der Worker hasht sie beim Anlegen
  cardsPerTask: 40,                // Kartenbilder (mode "card") je Aufgabe – zählen nicht zu imagesPerTask
  // Automatische Löschfrist für Abgaben und Erstversuche in Tagen (settings `privacy`)
  retentionMin: 7, retentionMax: 365, retentionDefault: 30,
  // Checkliste zum analogen Arbeitsblatt (über den QR-Code öffentlich): Punkte je Aufgabe, Zeichen je Punkt
  checkPoints: 8, checkPoint: 160,
  // Feibeitsblatt als Finale eines Escape-Rooms: Name des Raums (die Kennung prüft ESCAPE_ID_RE)
  escapeName: 80,
};

export class InputError extends Error {
  constructor(message, code = "bad_request", status = 400) { super(message); this.code = code; this.status = status; }
}
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;   // Steuerzeichen außer Tab/Zeilenumbruch
export const cleanText = (s) => String(s).replace(/\r\n?/g, "\n").replace(CTRL_RE, "");

export function validateKdf(kdf) {
  if (!isObj(kdf)) throw new InputError("KDF-Parameter fehlen.");
  const it = kdf.iterations;
  if (!Number.isInteger(it) || it < 100000 || it > 10000000) throw new InputError("Ungültige KDF-Parameter (iterations).");
  if (!isB64(kdf.salt, 16, 64)) throw new InputError("Ungültige KDF-Parameter (salt).");
  return { salt: kdf.salt, iterations: it };
}
export function validateEncPrivateKey(k) {
  if (!isObj(k) || !isB64(k.iv, 12, 12) || !isB64(k.ct, 64, 16384)) throw new InputError("Verschlüsselter privater Schlüssel ungültig.");
  return { iv: k.iv, ct: k.ct };
}
export function decodeAuthKey(s) {   // 32 Rohbytes als Base64 → Uint8Array oder null
  if (!isB64(s, 32, 32)) return null;
  try { return b64ToBytes(s); } catch { return null; }
}
export async function importPublicKey(b64) {   // SPKI prüfen (nur Import – keine Schlüsselerzeugung im Worker)
  if (!isB64(b64, 100, 4096)) throw new InputError("Öffentlicher Schlüssel ungültig.");
  let key;
  try { key = await crypto.subtle.importKey("spki", b64ToBytes(b64), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]); }
  catch { throw new InputError("Öffentlicher Schlüssel ungültig."); }
  const bits = key.algorithm && key.algorithm.modulusLength;
  if (!(bits >= 2048 && bits <= 8192)) throw new InputError("Öffentlicher Schlüssel ungültig (Schlüssellänge).");
  return key;
}

export function validateEnvelope(env) {
  if (!isObj(env)) throw new InputError("Die Abgabe ist unvollständig (Umschlag fehlt).", "bad_envelope");
  if (env.v !== 1) throw new InputError("Unbekanntes Abgabeformat.", "bad_envelope");
  if (!isB64(env.ek, 128, 1024) || !isB64(env.iv, 12, 12) || !isB64(env.ct, 17, Infinity))
    throw new InputError("Die Abgabe ist beschädigt (Verschlüsselung ungültig).", "bad_envelope");
  const json = JSON.stringify({ v: 1, ek: env.ek, iv: env.iv, ct: env.ct });   // nur bekannte Felder speichern
  if (json.length > LIMITS.envelopeBytes) throw new InputError("Die Abgabe ist zu groß.", "too_large", 413);
  return json;
}

/* Erstversuch oder Abgabe: stage "first" = erste Fassung samt KI-Feedback (noch nicht abgegeben), "final" = Abgabe.
   attempt = vom Browser erzeugte Kennung je Bearbeitung; die Abgabe ersetzt damit den Erstversuch derselben Bearbeitung. */
export const ATTEMPT_RE = /^[0-9a-f]{16}$/;
export const REPLACE_WINDOW_MS = 15 * 60e3;   // zweite KI-Rückmeldung nachreichen: nur so lange nach dem Eingang der Abgabe
export function validateSubmitMeta(body) {
  let stage = body.stage == null ? "final" : body.stage;
  // „feedback2“: die schon angekommene Abgabe derselben Bearbeitung um die zweite KI-Rückmeldung ergänzen (ersetzen, nie neu
  // anlegen) – ein eigener Wert, damit ein älterer Server ihn ablehnt statt eine Abgabe daraus zu machen
  const replace = stage === "feedback2";
  if (replace) stage = "final";
  if (stage !== "first" && stage !== "final") throw new InputError("Unbekannte Art der Abgabe.", "bad_request");
  let attempt = null;
  if (body.attempt != null) {
    attempt = String(body.attempt).toLowerCase();
    if (!ATTEMPT_RE.test(attempt)) throw new InputError("Ungültige Kennung der Bearbeitung.", "bad_request");
  }
  if (stage === "first" && !attempt) throw new InputError("Ein Erstversuch braucht eine Kennung der Bearbeitung.", "bad_request");
  if (!replace) return { stage, attempt, replace: false, receivedAt: null };
  // nur genau die eigene Abgabe: Kennung und der Eingangszeitpunkt, den der Server bei der Abgabe gemeldet hat
  const receivedAt = body.receivedAt;
  if (!attempt || !Number.isSafeInteger(receivedAt) || receivedAt <= 0) throw new InputError("Ergänzen geht nur für die eigene Abgabe.", "bad_request");
  return { stage, attempt, replace, receivedAt };
}

/* Einzelne Einträge löschen (Lösch- oder Einschränkungswunsch einer Person): {ids: [1–50 positive Ganzzahlen]} → ids ohne
   Doppelte; kein Body (null) = alle Abgaben und Erstversuche des Blattes → null. Ein Body ohne gültige ids löscht nie alles. */
export function validateDeleteIds(body) {
  if (body == null) return null;
  const ids = isObj(body) ? body.ids : null;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > LIMITS.deleteIds || !ids.every((x) => Number.isSafeInteger(x) && x > 0))
    throw new InputError(`Bitte geben Sie 1 bis ${LIMITS.deleteIds} Einträge zum Löschen an.`, "bad_request");
  return [...new Set(ids)];
}

export function defaultTitle(now = Date.now()) {
  let d;
  try {
    d = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(now));
  } catch {
    const x = new Date(now); d = String(x.getUTCDate()).padStart(2, "0") + "." + String(x.getUTCMonth() + 1).padStart(2, "0") + "." + x.getUTCFullYear();
  }
  return "Feibeitsblatt vom " + d;
}

export function validateSheetInput(body, now = Date.now()) {
  if (!isObj(body)) throw new InputError("Ungültige Anfrage.");
  if (body.title != null && typeof body.title !== "string") throw new InputError("Der Titel muss ein Text sein.");
  let title = cleanText(body.title || "").replace(/\s+/g, " ").trim();
  if (title.length > LIMITS.title) throw new InputError("Der Titel ist zu lang (höchstens " + LIMITS.title + " Zeichen).");
  if (!title) title = defaultTitle(now);
  if (!Array.isArray(body.tasks) || body.tasks.length < 1) throw new InputError("Bitte mindestens eine Aufgabe eintragen.");
  if (body.tasks.length > LIMITS.tasks) throw new InputError("Höchstens " + LIMITS.tasks + " Aufgaben pro Feibeitsblatt.");
  const tasks = body.tasks.map((t, i) => {
    const n = i + 1;
    if (!isObj(t) || (typeof t.text !== "string" && t.textFmt == null)) throw new InputError("Aufgabe " + n + ": Aufgabenstellung fehlt.");
    if (t.solution != null && typeof t.solution !== "string") throw new InputError("Aufgabe " + n + ": Der Auftrag an die KI muss ein Text sein.");
    const answer = validateAnswerSpec(t.answer, n), isMap = !!answer && answer.type === "map";
    // textFmt = formatierte Aufgabenstellung (Läufe wie beim Material); der reine Text wird daraus abgeleitet – er geht an die KI
    // (ohne Link-Adressen), in die PDF-Dateien und an ältere Seiten. Gespeichert wird textFmt nur, wenn etwas formatiert oder verlinkt ist.
    const textFmt = validateTextFmt(t.textFmt, n);
    const text = (textFmt.length ? materialText(textFmt) : cleanText(typeof t.text === "string" ? t.text : "")).trim(), solution = isMap ? "" : cleanText(t.solution || "").trim();   // solution = Auftrag an die KI; Weltkarte: keiner, kein KI-Feedback
    if (!text) throw new InputError("Aufgabe " + n + ": Bitte eine Aufgabenstellung eintragen.");
    if (text.length > LIMITS.taskText) throw new InputError("Aufgabe " + n + ": Die Aufgabenstellung ist zu lang (höchstens " + LIMITS.taskText + " Zeichen).");
    if (solution.length > LIMITS.solution) throw new InputError("Aufgabe " + n + ": Der Auftrag an die KI ist zu lang (höchstens " + LIMITS.solution + " Zeichen).");
    const material = validateMaterial(t.material, n);
    const task = { text, solution };
    if (isFormatted(textFmt)) task.textFmt = textFmt;
    if (material.length) task.material = material;
    if (answer) task.answer = answer;
    return task;
  });
  const checks = tasks.reduce((k, t) => k + (t.answer && t.answer.type === "map" ? t.answer.items.reduce((m, it) => m + it.countries.length, 0) : 0), 0);
  if (checks > LIMITS.mapChecks) throw new InputError("Zu viele Länder in den Weltkarten-Aufgaben (höchstens " + LIMITS.mapChecks + " Zuordnungen je Feibeitsblatt zusammen).");
  return { title, tasks, escape: validateEscapeSpec(body.escape) };
}

/* ---------- Feibeitsblatt als Finale eines Escape-Rooms ----------
 * escape = {id, name}: id = Kennung des Raums (ESCAPE_ROOM.id in dessen Quelltext; a–z, 0–9, Bindestrich, 3–60 Zeichen), name =
 * Name des Raums (1–80 Zeichen, einzeilig). Nur beim Anlegen (Blätter bleiben unveränderlich); gespeichert in den Spalten
 * sheets.escape_id/escape_name (fehlt = normales Blatt). Die Daten aus dem Raum selbst sieht der Server nie im Klartext – sie
 * stehen nur im verschlüsselten Umschlag von Erstversuch und Abgabe. */
export const ESCAPE_ID_RE = /^[a-z0-9-]{3,60}$/;
export function validateEscapeSpec(raw) {   // null/undefined → null (normales Blatt)
  if (raw == null) return null;
  if (!isObj(raw)) throw new InputError("Escape-Room: Die Angaben haben ein ungültiges Format.");
  const id = typeof raw.id === "string" ? raw.id.trim().toLowerCase() : "";
  if (!ESCAPE_ID_RE.test(id)) throw new InputError("Escape-Room: Die Kennung braucht 3 bis 60 Zeichen (nur a–z, 0–9 und Bindestrich).");
  const name = typeof raw.name === "string" ? cleanLine(raw.name) : "";
  if (!name) throw new InputError("Escape-Room: Bitte den Namen des Escape-Rooms eintragen.");
  if (name.length > LIMITS.escapeName) throw new InputError("Escape-Room: Der Name ist zu lang (höchstens " + LIMITS.escapeName + " Zeichen).");
  return { id, name };
}
// Aus D1 gelesen: erneut prüfen (die Zeile könnte von Hand geändert sein) – sonst null, also ein normales Blatt
export const escapeOut = (id, name) => (typeof id === "string" && ESCAPE_ID_RE.test(id) && typeof name === "string" && cleanLine(name)
  ? { id, name: cleanLine(name).slice(0, LIMITS.escapeName) } : null);

/* ---------- Antwortarten: answer je Aufgabe (fehlt = Textfeld). Unbekannte Felder entfallen, Fehlerhaftes → 400. ----------
 * {type:"table", columns:[1–8 Überschriften], rows:1–30}
 * {type:"map", map:"world", items:[1–40 × {id, label, hint?, image? (16 Hex, Kartenbild mode "card"), countries:[1–10 × {id (ISO 3166-1
 *   numerisch, 3 Ziffern), name}]}]} – eine richtige Zuordnung genügt; Schüler:innen bekommen die Länder nur als Prüfwerte. */
export const ITEM_ID_RE = /^[a-z0-9-]{1,40}$/;
export const COUNTRY_ID_RE = /^\d{3}$/;
const oneLine = (v) => cleanText(v).replace(/\s+/g, " ").trim();   // einzeilig: Leerraum und Zeilenumbrüche → ein Leerzeichen
export function validateAnswerSpec(raw, n) {
  if (raw == null) return null;
  const where = n ? "Aufgabe " + n + ": " : "";
  const bad = (msg) => new InputError(where + (msg || "Die Antwortart hat ein ungültiges Format."));
  if (!isObj(raw)) throw bad();
  if (raw.type === "text") return null;
  if (raw.type === "table") {
    const cols = raw.columns;
    if (!Array.isArray(cols) || cols.length < 1) throw bad("Die Tabelle braucht mindestens eine Spalte.");
    if (cols.length > LIMITS.tableColumns) throw bad("Die Tabelle hat zu viele Spalten (höchstens " + LIMITS.tableColumns + ").");
    const columns = cols.map((c, k) => {
      if (typeof c !== "string") throw bad();
      const t = oneLine(c).replace(/\|/g, "/");   // „|“ trennt in der Textform der Antwort die Zellen
      if (!t) throw bad("Spalte " + (k + 1) + " der Tabelle braucht eine Überschrift.");
      if (t.length > LIMITS.columnName) throw bad("Die Überschrift von Spalte " + (k + 1) + " ist zu lang (höchstens " + LIMITS.columnName + " Zeichen).");
      return t;
    });
    const rows = raw.rows;
    if (!Number.isInteger(rows) || rows < 1 || rows > LIMITS.tableRows) throw bad("Die Tabelle braucht 1 bis " + LIMITS.tableRows + " Zeilen.");
    return { type: "table", columns, rows };
  }
  if (raw.type === "map") {
    if (raw.map != null && raw.map !== "world") throw bad("Unbekannte Karte (möglich ist nur die Weltkarte).");
    const list = raw.items;
    if (!Array.isArray(list) || list.length < 1) throw bad("Die Weltkarten-Zuordnung braucht mindestens eine Karte.");
    if (list.length > LIMITS.mapItems) throw bad("Die Weltkarten-Zuordnung hat zu viele Karten (höchstens " + LIMITS.mapItems + ").");
    const ids = new Set(), labels = new Set();
    const items = list.map((it, k) => {
      const c = "Karte " + (k + 1) + ": ";
      if (!isObj(it)) throw bad();
      const id = typeof it.id === "string" ? it.id.trim().toLowerCase() : "";
      if (!ITEM_ID_RE.test(id)) throw bad(c + "Ungültige Kennung (nur a–z, 0–9 und Bindestrich, höchstens " + LIMITS.itemId + " Zeichen).");
      if (ids.has(id)) throw bad(c + "Die Kennung „" + id + "“ kommt doppelt vor.");
      ids.add(id);
      if (typeof it.label !== "string" || (it.hint != null && typeof it.hint !== "string")) throw bad();
      const label = oneLine(it.label), hint = oneLine(it.hint || "");
      if (!label) throw bad(c + "Bitte eine Bezeichnung eintragen.");
      if (label.length > LIMITS.itemLabel) throw bad(c + "Die Bezeichnung ist zu lang (höchstens " + LIMITS.itemLabel + " Zeichen).");
      if (labels.has(label)) throw bad(c + "Die Bezeichnung „" + label + "“ kommt doppelt vor.");   // sonst ist die Textform der Antwort mehrdeutig
      labels.add(label);
      if (hint.length > LIMITS.itemHint) throw bad(c + "Der Hinweis ist zu lang (höchstens " + LIMITS.itemHint + " Zeichen).");
      let image = "";
      if (it.image != null && it.image !== "") {
        image = typeof it.image === "string" ? it.image.toLowerCase() : "";
        if (!IMAGE_ID_RE.test(image)) throw bad(c + "Ungültige Bild-Kennung.");
      }
      const cs = it.countries;
      if (!Array.isArray(cs) || cs.length < 1) throw bad(c + "Bitte mindestens ein Land auswählen.");
      if (cs.length > LIMITS.itemCountries) throw bad(c + "Zu viele Länder (höchstens " + LIMITS.itemCountries + ").");
      const seen = new Set(), countries = [];
      for (const x of cs) {
        if (!isObj(x) || typeof x.id !== "string" || !COUNTRY_ID_RE.test(x.id) || typeof x.name !== "string") throw bad(c + "Ein Land hat ein ungültiges Format.");
        const name = oneLine(x.name);
        if (!name || name.length > LIMITS.countryName) throw bad(c + "Ein Ländername fehlt oder ist zu lang.");
        if (!seen.has(x.id)) { seen.add(x.id); countries.push({ id: x.id, name }); }
      }
      const out = { id, label };
      if (hint) out.hint = hint;
      if (image) out.image = image;
      out.countries = countries;
      return out;
    });
    return { type: "map", map: "world", items };
  }
  throw bad("Unbekannte Antwortart (möglich: Textfeld, Tabelle, Weltkarten-Zuordnung).");
}
// Prüfwert einer Zuordnung: SHA-256 (hex) von „Code|Karten-Kennung|Länder-Kennung“ – der Browser vergleicht den angeklickten Staat
export const mapCheck = (code, itemId, countryId) => sha256Hex(code + "|" + itemId + "|" + countryId);
// Beim Anlegen (Code steht fest): Prüfwerte je Karte speichern, damit das öffentliche Blatt sie nicht bei jedem Abruf neu hasht
export async function withMapChecks(tasks, code) {
  return Promise.all(tasks.map(async (t) => {
    if (!t.answer || t.answer.type !== "map") return t;
    const items = await Promise.all(t.answer.items.map(async (it) => ({ ...it, checks: await Promise.all(it.countries.map((c) => mapCheck(code, it.id, c.id))) })));
    return { ...t, answer: { ...t.answer, items } };
  }));
}
// Antwortart aus D1 für die Lehrkraft (ganz, ohne Prüfwerte) bzw. für Schüler:innen (Länder NIE im Klartext, nur Prüfwerte;
// ein Kartenbild nur, wenn es als Kartenbild dieser Aufgabe gespeichert ist)
export function teacherAnswer(a) {
  if (!isObj(a) || (a.type !== "table" && a.type !== "map")) return { type: "text" };
  if (a.type === "table") return { type: "table", columns: Array.isArray(a.columns) ? a.columns.map(String) : [], rows: Number(a.rows) || 1 };
  return { type: "map", map: "world", items: (Array.isArray(a.items) ? a.items : []).filter(isObj).map((it) => {
    const o = { id: String(it.id), label: String(it.label || "") };
    if (it.hint) o.hint = String(it.hint);
    if (it.image) o.image = String(it.image);
    o.countries = (Array.isArray(it.countries) ? it.countries : []).filter(isObj).map((c) => ({ id: String(c.id), name: String(c.name || "") }));
    return o;
  }) };
}
export async function publicAnswer(a, code, cardIds) {
  if (!isObj(a) || (a.type !== "table" && a.type !== "map")) return { type: "text" };
  if (a.type === "table") return teacherAnswer(a);
  const items = await Promise.all((Array.isArray(a.items) ? a.items : []).filter(isObj).map(async (it) => {
    const countries = (Array.isArray(it.countries) ? it.countries : []).filter(isObj);
    const ok = Array.isArray(it.checks) && it.checks.length === countries.length && it.checks.every((h) => typeof h === "string" && /^[0-9a-f]{64}$/.test(h));
    const o = { id: String(it.id), label: String(it.label || "") };
    if (it.hint) o.hint = String(it.hint);
    if (it.image && cardIds && cardIds.has(String(it.image))) o.image = String(it.image);
    o.checks = ok ? it.checks : await Promise.all(countries.map((c) => mapCheck(code, String(it.id), String(c.id))));
    return o;
  }));
  return { type: "map", map: "world", items };
}

/* ---------- Material zu Aufgaben: Absätze aus Läufen {t, f?, h?} – f ⊆ "biu" (fett/kursiv/unterstrichen), h = Link.
   Kein HTML: das Frontend baut daraus DOM-Knoten (nie innerHTML), Links nur http(s) und immer in neuem Tab. ---------- */
export function cleanHref(raw) {   // → normalisierte http(s)-Adresse oder "" (javascript:, data:, mailto: … werden verworfen)
  const s = String(raw == null ? "" : raw).trim();
  if (!s || s.length > LIMITS.href || /[\u0000-\u0020\u007f]/.test(s)) return "";
  let u; try { u = new URL(s); } catch { return ""; }
  return (u.protocol === "http:" || u.protocol === "https:") && u.href.length <= LIMITS.href ? u.href : "";   // Länge nach der Normalisierung (Prozent-Kodierung)
}
// Dieselben Läufe gibt es für das Material und für die formatierte Aufgabenstellung (textFmt): nur Zeichengrenze und Wortlaut
// der Meldungen unterscheiden sich; Absätze, Abschnitte und Links haben dieselben Grenzen
const FMT_MATERIAL = { chars: LIMITS.material, the: "Das Material", inThe: "im Material" };
const FMT_TASK_TEXT = { chars: LIMITS.taskText, the: "Die Aufgabenstellung", inThe: "in der Aufgabenstellung" };
export function validateMaterial(raw, n, kind = FMT_MATERIAL) {
  if (raw == null) return [];
  const where = n ? "Aufgabe " + n + ": " : "";
  const bad = () => new InputError(where + kind.the + " hat ein ungültiges Format.");
  if (!Array.isArray(raw)) throw bad();
  if (raw.length > LIMITS.materialParagraphs) throw new InputError(where + kind.the + " hat zu viele Absätze (höchstens " + LIMITS.materialParagraphs + ").");
  // Grenzen so früh wie möglich prüfen (10 ms CPU): Läufe zählen vor dem Verarbeiten, Zeichen und Links beim Zählen
  const tooLong = () => new InputError(where + kind.the + " ist zu lang (höchstens " + kind.chars + " Zeichen).");
  let chars = 0, runs = 0, links = 0;
  const out = raw.map((para) => {
    if (!Array.isArray(para)) throw bad();
    runs += para.length;
    if (runs > LIMITS.materialRuns) throw new InputError(where + kind.the + " ist zu kleinteilig formatiert (höchstens " + LIMITS.materialRuns + " Abschnitte).");
    const line = [];
    for (const r of para) {
      if (!isObj(r) || typeof r.t !== "string" || (r.f != null && typeof r.f !== "string") || (r.h != null && typeof r.h !== "string")) throw bad();
      if (r.t.length > kind.chars) throw tooLong();
      const t = cleanText(r.t).replace(/[\t\n\r\u00a0]+/g, " ");   // innerhalb eines Laufs keine Zeilenumbrüche
      if (!t) continue;
      chars += t.length;
      if (chars > kind.chars) throw tooLong();
      const f = ["b", "i", "u"].filter((c) => String(r.f || "").includes(c)).join("");
      let h = "";
      if (r.h) { h = cleanHref(r.h); if (!h) throw new InputError(where + "Ein Link " + kind.inThe + " ist ungültig (erlaubt sind nur Adressen mit http:// oder https://)."); }
      const prev = line[line.length - 1];
      if (prev && (prev.f || "") === f && (prev.h || "") === h) { prev.t += t; continue; }
      const run = { t }; if (f) run.f = f;
      if (h) { run.h = h; links++; if (links > LIMITS.materialLinks) throw new InputError(where + "Zu viele Links " + kind.inThe + " (höchstens " + LIMITS.materialLinks + ")."); }
      line.push(run);
    }
    return line;
  });
  while (out.length && !out[out.length - 1].length) out.pop();   // leere Absätze am Ende und Anfang weg
  while (out.length && !out[0].length) out.shift();
  return out;
}
// Material als reiner Text (für die KI: ohne Formatierung und ohne Links)
export const materialText = (m) => (Array.isArray(m) ? m : []).map((p) => (Array.isArray(p) ? p : []).map((r) => (r && typeof r.t === "string" ? r.t : "")).join("")).join("\n").trim();
// Formatierte Aufgabenstellung (textFmt): Läufe wie beim Material, aber mit der Zeichengrenze der Aufgabenstellung
export const validateTextFmt = (raw, n) => validateMaterial(raw, n, FMT_TASK_TEXT);
export const isFormatted = (m) => m.some((p) => p.some((r) => r.f || r.h));   // mindestens ein Lauf fett/kursiv/unterstrichen oder verlinkt

/* ---------- Bilder zu Aufgaben: nur die Kopfdaten lesen (kein Dekodieren im Worker – 10 ms CPU) ---------- */
export const IMAGE_MODES = ["thumb", "inline", "card"];   // thumb = Miniatur rechts neben Aufgabe und Antwort, inline = größer unter der Aufgabenstellung, card = Bild einer Karte der Weltkarten-Zuordnung
export const IMAGE_ID_RE = /^[0-9a-f]{16}$/;
export function generateImageId(rand = (n) => crypto.getRandomValues(new Uint8Array(n))) { return toHex(rand(8)); }
const be16 = (b, i) => (b[i] << 8) | b[i + 1];
const be32 = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const le16 = (b, i) => b[i] | (b[i + 1] << 8);
const le24 = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const dims = (mime, w, h) => (w >= 1 && h >= 1 && w <= LIMITS.imageSide && h <= LIMITS.imageSide ? { mime, w, h } : null);
// → {mime, w, h} für JPEG, PNG und WebP (lossy, lossless, extended) – sonst null. Liest nur die Kopfdaten.
export function imageInfo(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const n = b.length;
  if (n >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
      && b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52)
    return dims("image/png", be32(b, 16), be32(b, 20));
  if (n >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    const end = Math.min(n, 512 * 1024);
    for (let seg = 0; seg < 2000 && i + 3 < end; seg++) {   // Segmente bis zum SOF-Marker (Frame-Kopf mit Höhe/Breite)
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) { i++; continue; }                                                     // Füllbyte
      if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }   // Marker ohne Länge
      if (marker === 0xd9 || marker === 0xda) return null;                                          // Ende/Bilddaten vor dem Frame-Kopf
      const len = be16(b, i + 2);
      if (len < 2) return null;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        if (len < 7 || i + 8 >= n) return null;
        return dims("image/jpeg", be16(b, i + 7), be16(b, i + 5));
      }
      i += 2 + len;
    }
    return null;
  }
  if (n >= 25 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (fourcc === "VP8 ") return n >= 30 && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a ? dims("image/webp", le16(b, 26) & 0x3fff, le16(b, 28) & 0x3fff) : null;
    if (fourcc === "VP8L") {
      if (b[20] !== 0x2f) return null;
      const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
      return dims("image/webp", (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    if (fourcc === "VP8X") return n >= 30 ? dims("image/webp", le24(b, 24) + 1, le24(b, 27) + 1) : null;
    return null;
  }
  return null;
}
// Strenges Base64 → Binärstring oder null. atob statt Regex: über 680 KB kostet der Regex ~5 ms CPU, atob ~0,3 ms.
// Die Längenprüfung lehnt ab, was atob stillschweigend überliest (Leerraum), damit nur echtes Base64 gespeichert wird.
export function strictB64(s) {
  if (typeof s !== "string" || !s || s.length % 4 !== 0) return null;
  let bin; try { bin = atob(s); } catch { return null; }
  const pad = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  return bin.length === (s.length / 4) * 3 - pad ? bin : null;
}
// Upload-Body {task, mode, data, id?, alt?}: data = Base64 (so wird es auch gespeichert – Strings kosten im Worker kaum
// CPU, D1 liefert BLOBs als Zahlen-Array). Geprüft werden nur die Kopfdaten des Bildes (erste 144 KB). id = vom
// Browser erzeugte Kennung (Wiederholung nach Timeout speichert nichts doppelt), alt = Bildbeschreibung (Vorlesen).
const IMAGE_HEAD_BYTES = 144 * 1024;
export function validateImageUpload(body) {
  if (!isObj(body)) throw new InputError("Ungültige Anfrage.");
  const task = body.task;
  if (typeof task !== "number" || !Number.isInteger(task) || task < 1 || task > LIMITS.tasks) throw new InputError("Ungültige Aufgabennummer für das Bild.");
  const mode = String(body.mode || "").trim().toLowerCase();
  if (!IMAGE_MODES.includes(mode)) throw new InputError("Ungültige Anzeigeart für das Bild (thumb, inline oder card).");
  let id = null;
  if (body.id != null) { id = String(body.id).toLowerCase(); if (!IMAGE_ID_RE.test(id)) throw new InputError("Ungültige Bild-Kennung."); }
  if (body.alt != null && typeof body.alt !== "string") throw new InputError("Die Bildbeschreibung muss ein Text sein.");
  const alt = cleanText(body.alt || "").replace(/\s+/g, " ").trim();
  if (alt.length > LIMITS.imageAlt) throw new InputError("Die Bildbeschreibung ist zu lang (höchstens " + LIMITS.imageAlt + " Zeichen).");
  const data = body.data, bin = strictB64(data);
  if (!bin) throw new InputError("Das Bild konnte nicht gelesen werden (erlaubt sind JPG, PNG und WebP).", "bad_image");
  const bytes = bin.length;
  if (bytes > LIMITS.imageBytes) throw new InputError("Das Bild ist zu groß (höchstens " + Math.round(LIMITS.imageBytes / 1024) + " KB nach dem Verkleinern).", "too_large", 413);
  const n = Math.min(bytes, IMAGE_HEAD_BYTES), head = new Uint8Array(n);
  for (let i = 0; i < n; i++) head[i] = bin.charCodeAt(i);
  const info = imageInfo(head);
  if (!info) throw new InputError("Das Bild konnte nicht gelesen werden (erlaubt sind JPG, PNG und WebP).", "bad_image");
  return { task, mode, data, bytes, info, id, alt };
}
/* ---------- PDF-Dateien zu Aufgaben (gestückelt, Base64 je Teil wie bei Bildern) ---------- */
export const FILE_ID_RE = IMAGE_ID_RE;
export const FILE_MIME = "application/pdf";
// Dateiname für Anzeige und Download: keine Steuerzeichen, keine Pfadzeichen, endet auf .pdf
// Steuer- und Formatzeichen (Cc, Cf: u. a. Bidi-Steuerung und -Isolate, Nullbreite, weiches Trennzeichen) entfallen,
// Leerraum wird zu einem Leerzeichen; gekürzt wird ohne ein Ersatzzeichen-Paar (Emoji) zu zerschneiden.
export function cleanFileName(name) {
  let s = String(name == null ? "" : name).normalize("NFC").replace(/[\t\n\r\v\f\u0085\u2028\u2029]/g, " ").replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  if (!/\.pdf$/i.test(s)) s += ".pdf";
  if (s.length > LIMITS.fileName) { s = s.slice(0, LIMITS.fileName - 4); if (/[\uD800-\uDBFF]$/.test(s)) s = s.slice(0, -1); s = s.trim() + ".pdf"; }
  s = s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");   // einzelne Ersatzzeichen
  return s === ".pdf" ? "Datei.pdf" : s;
}
// Upload-Body {id, task, name, bytes, chunks, n, data}: Teil n (0-basiert) einer PDF-Datei als Base64; Teil 0 muss mit
// „%PDF-“ beginnen. Alle Teile außer dem letzten sind genau LIMITS.fileChunk Bytes lang, so passt die Summe zur Größe.
export function validateFileUpload(body) {
  if (!isObj(body)) throw new InputError("Ungültige Anfrage.");
  const task = body.task;
  if (typeof task !== "number" || !Number.isInteger(task) || task < 1 || task > LIMITS.tasks) throw new InputError("Ungültige Aufgabennummer für die Datei.");
  const id = String(body.id == null ? "" : body.id).toLowerCase();
  if (!FILE_ID_RE.test(id)) throw new InputError("Ungültige Datei-Kennung.");
  const bytes = body.bytes;
  if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes < 1) throw new InputError("Ungültige Dateigröße.");
  if (bytes > LIMITS.fileBytes) throw new InputError("Die Datei ist zu groß (höchstens " + Math.round(LIMITS.fileBytes / 1024 / 1024) + " MB je PDF-Datei).", "too_large", 413);
  const chunks = Math.ceil(bytes / LIMITS.fileChunk);
  if (body.chunks !== chunks) throw new InputError("Die Stückelung der Datei passt nicht zur Größe.");
  const n = body.n;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n >= chunks) throw new InputError("Ungültiger Teil der Datei.");
  const name = cleanFileName(body.name);
  const data = body.data, bin = strictB64(data);
  if (!bin) throw new InputError("Die Datei konnte nicht gelesen werden (erlaubt sind PDF-Dateien).", "bad_file");
  const expect = n < chunks - 1 ? LIMITS.fileChunk : bytes - n * LIMITS.fileChunk;
  if (bin.length !== expect) throw new InputError("Teil " + (n + 1) + " der Datei hat nicht die erwartete Größe.", "bad_file");
  if (n === 0 && !bin.startsWith("%PDF-")) throw new InputError("Das ist keine PDF-Datei (erlaubt sind nur PDF-Dateien).", "bad_file");
  return { task, id, name, bytes, chunks, n, data };
}
// Datei-Metadaten aus D1-Zeilen (nur Teil 0, nur vollständige Dateien) für eine Aufgabe – ohne Dateidaten
export function filesForTask(rows, task) {
  return (rows || []).filter((r) => Number(r.task) === task && Number(r.have) >= Number(r.chunks))
    .map((r) => ({ id: String(r.id), name: cleanFileName(r.name), bytes: Number(r.bytes) || 0 }));
}
// Bild-Metadaten aus D1-Zeilen für eine Aufgabe (ohne Bilddaten)
export function imagesForTask(rows, task) {
  return (rows || []).filter((r) => Number(r.task) === task).map((r) => ({ id: String(r.id), mode: r.mode === "inline" || r.mode === "card" ? r.mode : "thumb", w: Number(r.w) || 0, h: Number(r.h) || 0, alt: typeof r.alt === "string" ? r.alt : "" }));
}

export function validateAnswers(answers, taskCount) {
  if (!Array.isArray(answers) || answers.length !== taskCount)
    throw new InputError("Die Antworten passen nicht zu diesem Feibeitsblatt. Bitte lade die Seite neu.", "bad_answers");
  let total = 0;
  return answers.map((a, i) => {
    if (a == null) a = "";
    if (typeof a !== "string") throw new InputError("Antwort " + (i + 1) + " ist ungültig.", "bad_answers");
    if (a.length > LIMITS.answer) throw new InputError("Antwort " + (i + 1) + " ist zu lang (höchstens " + LIMITS.answer + " Zeichen).", "too_long");
    total += a.length;
    if (total > LIMITS.answersTotal) throw new InputError("Deine Antworten sind zusammen zu lang (höchstens " + LIMITS.answersTotal + " Zeichen).", "too_long");
    return cleanText(a);
  });
}
// Zweite KI-Rückmeldung (nach der Abgabe): nur diese Aufgaben gehen an die KI – die nach dem ersten Feedback geänderten,
// 1-basiert. Fehlt `only`, gelten alle (erstes Feedback) → null; sonst aufsteigend sortiert, ohne Doppelte.
export function validateOnly(only, taskCount) {
  if (only == null) return null;
  if (!Array.isArray(only) || !only.length || only.length > taskCount ||
    !only.every((n) => Number.isInteger(n) && n >= 1 && n <= taskCount) || new Set(only).size !== only.length)
    throw new InputError("Die Auswahl der Aufgaben passt nicht zu diesem Feibeitsblatt. Bitte lade die Seite neu.", "bad_answers");
  return [...only].sort((a, b) => a - b);
}

/* ---------- Löschfrist (settings `privacy`) ----------
 * {v:1, retentionDays (7–365), updatedAt, auto?} – auto:true = von einer Neuinstallation gesetzte Vorgabe (30 Tage), noch nicht von
 * der Lehrkraft gespeichert. Verantwortlich für den Datenschutz ist der Betreiber der Seite (fest in index.html eingetragen,
 * FEIBEITSBLATT_OPERATOR) – Angaben einer Schule speichert der Server nicht mehr; ältere Zeilen mit `school` räumt
 * DROP_SCHOOL_SQL auf. Die Frist ist öffentlich: GET /api/sheet/:code und GET /api/privacy liefern sie für den Datenschutzhinweis. */
export const RETENTION_OPTIONS = [7, 14, 30, 60, 90, 180, 365];
// Einzeilig: NFC, Zeilenumbrüche → Leerzeichen, Steuer- und Formatzeichen weg (u. a. Bidi-Steuerung gegen vertauschte Anzeige),
// Leerraum zusammengefasst
export const cleanLine = (v) => String(v == null ? "" : v).normalize("NFC").replace(/[\t\n\r\v\f\u0085\u2028\u2029]/g, " ")
  .replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim();
const isRetention = (d) => Number.isInteger(d) && d >= LIMITS.retentionMin && d <= LIMITS.retentionMax;
// PUT {retentionDays, confirmDelete}: ein mitgeschicktes `school` (ältere, noch gecachte Seite) wird ignoriert, nie gespeichert
export function validatePrivacyInput(body) {
  if (!isObj(body)) throw new InputError("Ungültige Anfrage.");
  if (!isRetention(body.retentionDays)) throw new InputError("Bitte wählen Sie eine Löschfrist zwischen " + LIMITS.retentionMin + " und " + LIMITS.retentionMax + " Tagen.");
  // Wie viele ältere Einträge die Lehrkraft zum Löschen bestätigt hat (fehlt = 0): Würde die neue Frist mehr löschen, speichert der
  // Server nichts (409 confirm_delete) – kein Löschen, das die Lehrkraft nicht gesehen hat
  const cd = body.confirmDelete == null ? 0 : body.confirmDelete;
  if (!Number.isInteger(cd) || cd < 0 || cd > 1e9) throw new InputError("Ungültige Anfrage.");
  return { retentionDays: body.retentionDays, confirmDelete: cd };
}
// Gespeicherte Frist erneut prüfen (die Zeile könnte von Hand geändert sein); eine ungültige Frist → null, also keine automatische
// Löschung – genau wie PURGE_SQL (Ganzzahl 7–365; JSON.stringify schreibt Ganzzahlen nie als 30.0). Nie Schulangaben ausliefern.
export function privacyOut(stored) {
  if (!isObj(stored)) return null;
  return { retentionDays: isRetention(stored.retentionDays) ? stored.retentionDays : null, auto: stored.auto === true };
}
// Früher gespeicherte Angaben einer Schule (settings privacy.school) entfernen – idempotent, ändert die Frist nicht (PURGE_SQL liest
// weiter $.retentionDays); steht in cleanupStatements (Cron, gelegentliches Aufräumen, Öffnen der Übersicht)
export const DROP_SCHOOL_SQL = "UPDATE settings SET value=json_remove(value,'$.school') WHERE key='privacy' AND json_valid(value) " +
  "AND json_type(value,'$.school') IS NOT NULL";
/* Automatische Löschung: eine einzige Anweisung, ?1 = jetzt (ms). Abgaben und Erstversuche, deren Eingang länger als die Frist
   zurückliegt, werden gelöscht (Index idx_submissions_received). Ohne gültige Frist (keine Zeile, kein gültiges JSON, keine
   Ganzzahl 7–365) ist die Unterabfrage NULL – dann wird nichts gelöscht. Liegt hier, weil workerd in der Hauptdatei des Workers
   (index.js) nur Funktionen als Export zulässt. */
export const PURGE_SQL = "DELETE FROM submissions WHERE received_at < ?1 - 86400000 * (SELECT json_extract(value,'$.retentionDays') FROM settings " +
  "WHERE key='privacy' AND json_valid(value) AND json_type(value,'$.retentionDays')='integer' AND json_extract(value,'$.retentionDays') BETWEEN " +
  LIMITS.retentionMin + " AND " + LIMITS.retentionMax + ")";
// Wie viele Einträge würde jede wählbare Frist jetzt löschen? Eine Abfrage, eine Indexsuche (die kürzeste Frist schließt alle ein);
// ?1…?n = jetzt − Frist je RETENTION_OPTIONS
export const OLDER_THAN_SQL = "SELECT " + RETENTION_OPTIONS.map((d, i) => "SUM(received_at<?" + (i + 1) + ") AS d" + d).join(", ") +
  " FROM submissions WHERE received_at<?1";
/* PUT der Frist in einem Batch (eine Transaktion): ?1 = jetzt − neue Frist. COUNT_OLDER_SQL zählt, was die neue Frist löschen würde;
   SAVE_PRIVACY_SQL schreibt nur, wenn das nicht mehr ist als bestätigt (?2 = neuer Wert, ?3 = bestätigte Zahl); DELETE_OLDER_SQL
   löscht nur, wenn genau dieser Wert jetzt gespeichert ist (?2) – also nie ohne Bestätigung und nie ohne gespeicherte Frist. */
export const COUNT_OLDER_SQL = "SELECT COUNT(*) AS n FROM submissions WHERE received_at<?1";
export const SAVE_PRIVACY_SQL = "INSERT INTO settings(key,value) SELECT 'privacy',?2 WHERE (SELECT COUNT(*) FROM submissions WHERE received_at<?1)<=?3 " +
  "ON CONFLICT(key) DO UPDATE SET value=excluded.value";
export const DELETE_OLDER_SQL = "DELETE FROM submissions WHERE received_at<?1 AND (SELECT value FROM settings WHERE key='privacy')=?2";

/* ---------- Checkliste zum analogen Arbeitsblatt (Tabelle sheet_checklists, Spalten draft/final) ----------
 * {ai, tasks:[{n (1…taskCount, je einmal), points:[Text]}]} → {ai, tasks} mit genau taskCount Einträgen, sortiert nach n; fehlende
 * Aufgaben bekommen eine leere Liste. Je Punkt einzeilig (cleanLine: NFC, Steuer- und Formatzeichen weg, Leerraum zusammengefasst),
 * leere Punkte und Doppelte derselben Aufgabe (ohne Groß-/Kleinschreibung) entfallen – erst danach gelten die Grenzen
 * (LIMITS.checkPoints Punkte zu je LIMITS.checkPoint Zeichen). ai = die Punkte gehen auf einen Vorschlag der KI zurück. Die
 * gespeicherte Checkliste ist über den QR-Code für alle mit dem Link sichtbar. */
export function validateChecklist(raw, taskCount) {
  const bad = () => new InputError("Die Checkliste hat ein ungültiges Format.");
  if (!isObj(raw) || (raw.ai != null && typeof raw.ai !== "boolean")) throw bad();
  const list = raw.tasks == null ? [] : raw.tasks;
  if (!Array.isArray(list) || list.length > taskCount) throw bad();
  const byN = new Map();
  for (const t of list) {
    if (!isObj(t) || !Number.isInteger(t.n) || t.n < 1 || t.n > taskCount || byN.has(t.n)) throw bad();
    const pts = t.points == null ? [] : t.points;
    if (!Array.isArray(pts)) throw bad();
    const tooMany = () => new InputError("Aufgabe " + t.n + ": höchstens " + LIMITS.checkPoints + " Punkte.");
    const tooLong = () => new InputError("Aufgabe " + t.n + ": Ein Punkt ist zu lang (höchstens " + LIMITS.checkPoint + " Zeichen).");
    if (pts.length > 6 * LIMITS.checkPoints) throw tooMany();   // vor dem Bereinigen (10 ms CPU)
    const seen = new Set(), out = [];
    for (const p of pts) {
      if (typeof p !== "string") throw bad();
      if (p.length > 4 * LIMITS.checkPoint + 100) throw tooLong();
      const s = cleanLine(p);
      if (!s) continue;
      if (s.length > LIMITS.checkPoint) throw tooLong();
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k); out.push(s);
    }
    if (out.length > LIMITS.checkPoints) throw tooMany();
    byN.set(t.n, out);
  }
  return { ai: raw.ai === true, tasks: Array.from({ length: taskCount }, (_, i) => ({ n: i + 1, points: byN.get(i + 1) || [] })) };
}
// Gespeicherte Checkliste (JSON-Text aus draft bzw. final) erneut prüfen → {v:1, ai, tasks} oder null (fehlt oder unlesbar)
export function checklistOut(text, taskCount) {
  if (typeof text !== "string" || !text) return null;
  try { const c = validateChecklist(JSON.parse(text), taskCount); return { v: 1, ai: c.ai, tasks: c.tasks }; } catch { return null; }
}

// Basis-URL eines eigenen OpenAI-kompatiblen Dienstes: https Pflicht, http nur für 127.0.0.1/localhost (Tests)
export function normalizeBaseUrl(input) {
  const s = String(input || "").trim().replace(/\/+$/, "");
  if (!s) return "";
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.username || u.password || u.search || u.hash) return null;
  if (u.protocol === "https:") return s;
  if (u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return s;
  return null;
}
export function isAllowedBase(base) { return !!base && normalizeBaseUrl(base) === String(base).trim().replace(/\/+$/, ""); }

const MODEL_RE = /^[A-Za-z0-9._:/@+-]{1,200}$/;
export function validateAiInput(body, providers) {
  if (!isObj(body)) throw new InputError("Ungültige Anfrage.");
  const provider = String(body.provider || "");
  if (!Object.prototype.hasOwnProperty.call(providers, provider)) throw new InputError("Unbekannter KI-Anbieter.");
  let model = typeof body.model === "string" ? body.model.trim() : "";
  if (provider === "gemini") model = model.replace(/^models\//, "");
  if (model && !MODEL_RE.test(model)) throw new InputError("Ungültige Modell-ID.");
  let baseUrl = "";
  if (provider === "custom") {
    baseUrl = normalizeBaseUrl(body.baseUrl);
    if (!baseUrl) throw new InputError("Bitte eine gültige Basis-URL eintragen (https://…/v1).");
  }
  let apiKey = body.apiKey == null ? "" : body.apiKey;
  if (typeof apiKey !== "string") throw new InputError("Ungültiger API-Schlüssel.");
  apiKey = apiKey.trim();
  if (apiKey && (apiKey.length > 512 || !/^[\x21-\x7E]+$/.test(apiKey))) throw new InputError("Der API-Schlüssel enthält unzulässige Zeichen.");
  return { provider, model, baseUrl, apiKey };
}
export const keyHintOf = (key) => (key ? "…" + key.slice(-4) : "");

/* ---------- Rate-Limits ----------
 * Nur Fehlversuche zählen (door, auth, lookup_miss): richtige Codes, Passwörter und Blatt-Codes gehen immer durch –
 * im Schulnetz teilen sich viele eine IP, und niemand darf die Lehrkraft oder die Klasse aussperren können.
 * feedback/submit: jede Anfrage zählt (feedback_chars/submit_bytes gewichtet nach Umfang, sheet_feedback je Blatt). */
export const RATE = {
  door: { max: 10, windowMs: 900e3 },             // falsche Türcodes je IP
  auth: { max: 10, windowMs: 900e3 },             // falsche Passwörter je IP
  auth_all: { max: 200, windowMs: 3600e3 },        // falsche Passwörter insgesamt (gegen verteiltes Raten)
  lookup_miss: { max: 30, windowMs: 600e3 },       // unbekannte Codes je IP
  // je Schüler:in bis zu zwei KI-Anfragen: Feedback zum Überarbeiten und Rückmeldung zur abgegebenen Fassung
  feedback: { max: 240, windowMs: 3600e3 },        // KI-Anfragen je IP
  feedback_chars: { max: 800000, windowMs: 3600e3 },   // … gewichtet nach Zeichen der Antworten
  sheet_feedback: { max: 600, windowMs: 86400e3 },     // KI-Anfragen je Blatt und Tag (begrenzt Missbrauch je Blatt; das kontoweite
                                                       // Tageskontingent von Workers AI ist kleiner und bleibt aufbrauchbar – dafür gibt es die Reserve)
  submit: { max: 360, windowMs: 3600e3 },          // Abgaben und Erstversuche je IP (je Schüler:in bis zu drei Aufrufe: Erstversuch, Abgabe, zweite Rückmeldung)
  submit_bytes: { max: 60 * 1024 * 1024, windowMs: 3600e3 },   // … gewichtet nach Umschlag-Bytes
  checklist: { max: 30, windowMs: 3600e3 },        // KI-Vorschläge für die Checkliste zum analogen Arbeitsblatt je IP (Lehrkraft)
};
const minutes = (s) => { const m = Math.max(1, Math.ceil(s / 60)); return m + (m === 1 ? " Minute" : " Minuten"); };
export function rateMessage(kind, retryAfter) {
  const t = minutes(retryAfter);
  switch (kind) {
    case "auth": case "auth_all": return "Zu viele falsche Passwörter. Mit dem richtigen Passwort können Sie sich weiterhin anmelden; weitere Versuche sind in etwa " + t + " möglich.";
    case "door": return "Zu viele Fehlversuche. Ein neuer Versuch ist in etwa " + t + " möglich.";   // neutral: Lehrkraft oder Schüler:in
    case "lookup_miss": return "Zu viele unbekannte Codes aus diesem Netzwerk. Mit einem richtigen Code geht es weiter; bitte prüfe deinen Code – ein neuer Versuch ist in etwa " + t + " möglich.";
    case "feedback": case "feedback_chars": return "Gerade wurden von diesem Netzwerk sehr viele KI-Rückmeldungen angefordert. Bitte versuche es in etwa " + t + " erneut.";
    case "sheet_feedback": return "Für dieses Feibeitsblatt wurden heute schon sehr viele KI-Rückmeldungen angefordert. Bitte sag deiner Lehrkraft Bescheid.";
    case "submit": case "submit_bytes": return "Gerade wurden von diesem Netzwerk sehr viele Abgaben gesendet. Bitte versuche es in etwa " + t + " erneut – deine Antworten bleiben auf diesem Gerät gespeichert.";
    case "checklist": return "Gerade wurden sehr viele Checklisten bei der KI angefragt. Bitte versuchen Sie es in etwa " + t + " erneut – Sie können die Punkte auch selbst eintragen.";
    default: return "Zu viele Anfragen. Bitte versuche es in etwa " + t + " erneut.";
  }
}
// Bucket ohne Klartext-IP; mit SETTINGS_SECRET als Pfeffer (sonst wäre der Hash einer IPv4 leicht umkehrbar)
export async function bucketOf(kind, ip, pepper = "") {
  return kind + ":" + (await sha256Hex(ip + "|" + kind + (pepper ? "|" + pepper : ""))).slice(0, 32);
}
/* IP → Schlüssel für die Buckets: IPv6 auf das /64-Präfix kürzen (ein Anschluss hat meist ein ganzes /64 –
   sonst ließe sich jede Sperre mit einer neuen Adresse umgehen); IPv4 unverändert. */
export function ipKey(ip) {
  const s = String(ip || "").trim();
  if (!s.includes(":")) return s;
  const m = /^\[?([0-9a-fA-F:.]+)\]?$/.exec(s.split("%")[0]);
  if (!m) return s;
  let a = m[1];
  const v4 = /:(\d+\.\d+\.\d+\.\d+)$/.exec(a);   // ::ffff:1.2.3.4 → IPv4
  if (v4 && /^::ffff:/i.test(a)) return v4[1];
  const parts = a.split("::");
  if (parts.length > 2) return s;
  const head = parts[0] ? parts[0].split(":") : [], tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const fill = Math.max(0, 8 - head.length - tail.length);
  const groups = [...head, ...(parts.length === 2 ? Array(fill).fill("0") : []), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return s;
  return groups.slice(0, 4).map((g) => g.toLowerCase().padStart(4, "0")).join(":") + "::/64";
}

/* ---------- API-Schlüssel at rest (AES-GCM mit SETTINGS_SECRET) ---------- */
const AAD = new TextEncoder().encode("feibeitsblatt/ai-key/v1");
const keyCache = new Map();
async function secretKey(secret) {
  if (keyCache.has(secret)) return keyCache.get(secret);
  let raw = null;
  if (isB64(secret, 32, 32)) raw = b64ToBytes(secret);
  if (!raw) raw = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  keyCache.set(secret, key);
  return key;
}
export async function sealSecret(plain, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, await secretKey(secret), new TextEncoder().encode(plain));
  return { iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
}
export async function openSecret(sealed, secret) {   // → Klartext oder null (Secret geändert/fehlt)
  if (!secret || !isObj(sealed) || !isB64(sealed.iv, 12, 12) || !isB64(sealed.ct, 17, 4096)) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(sealed.iv), additionalData: AAD }, await secretKey(secret), b64ToBytes(sealed.ct));
    return new TextDecoder().decode(pt);
  } catch { return null; }
}
