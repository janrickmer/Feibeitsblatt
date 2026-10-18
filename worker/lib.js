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
export function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function sha256Hex(data) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
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
  pageBytes: 8 * 1024 * 1024,      // … und höchstens so viele Umschlag-Bytes je Seite
  imageBytes: 500 * 1024,          // ein Bild zu einer Aufgabe (der Browser verkleinert vorher auf ≤ 1600 px)
  imagesPerTask: 5,                // Bilder je Aufgabe
  sheetImageBytes: 12 * 1024 * 1024, // Summe aller Bilder je Blatt (D1-Speicher)
  imageSide: 4096,                 // größte erlaubte Kantenlänge laut Kopfdaten
  imageAlt: 200,                   // Bildbeschreibung (wird vorgelesen)
  material: 8000,                  // Material je Aufgabe (Zeichen), formatiert als Absätze aus Läufen
  materialParagraphs: 200, materialRuns: 600, materialLinks: 60, href: 1000,
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
    if (!isObj(t) || typeof t.text !== "string") throw new InputError("Aufgabe " + n + ": Aufgabenstellung fehlt.");
    if (t.solution != null && typeof t.solution !== "string") throw new InputError("Aufgabe " + n + ": Die Musterlösung muss ein Text sein.");
    const text = cleanText(t.text).trim(), solution = cleanText(t.solution || "").trim();
    if (!text) throw new InputError("Aufgabe " + n + ": Bitte eine Aufgabenstellung eintragen.");
    if (text.length > LIMITS.taskText) throw new InputError("Aufgabe " + n + ": Die Aufgabenstellung ist zu lang (höchstens " + LIMITS.taskText + " Zeichen).");
    if (solution.length > LIMITS.solution) throw new InputError("Aufgabe " + n + ": Die Musterlösung ist zu lang (höchstens " + LIMITS.solution + " Zeichen).");
    const material = validateMaterial(t.material, n);
    const task = { text, solution };
    if (material.length) task.material = material;
    return task;
  });
  return { title, tasks };
}

/* ---------- Material zu Aufgaben: Absätze aus Läufen {t, f?, h?} – f ⊆ "biu" (fett/kursiv/unterstrichen), h = Link.
   Kein HTML: das Frontend baut daraus DOM-Knoten (nie innerHTML), Links nur http(s) und immer in neuem Tab. ---------- */
export function cleanHref(raw) {   // → normalisierte http(s)-Adresse oder "" (javascript:, data:, mailto: … werden verworfen)
  const s = String(raw == null ? "" : raw).trim();
  if (!s || s.length > LIMITS.href || /[\u0000-\u0020\u007f]/.test(s)) return "";
  let u; try { u = new URL(s); } catch { return ""; }
  return (u.protocol === "http:" || u.protocol === "https:") && u.href.length <= LIMITS.href ? u.href : "";   // Länge nach der Normalisierung (Prozent-Kodierung)
}
export function validateMaterial(raw, n) {
  if (raw == null) return [];
  const where = n ? "Aufgabe " + n + ": " : "";
  const bad = () => new InputError(where + "Das Material hat ein ungültiges Format.");
  if (!Array.isArray(raw)) throw bad();
  if (raw.length > LIMITS.materialParagraphs) throw new InputError(where + "Das Material hat zu viele Absätze (höchstens " + LIMITS.materialParagraphs + ").");
  // Grenzen so früh wie möglich prüfen (10 ms CPU): Läufe zählen vor dem Verarbeiten, Zeichen und Links beim Zählen
  const tooLong = () => new InputError(where + "Das Material ist zu lang (höchstens " + LIMITS.material + " Zeichen).");
  let chars = 0, runs = 0, links = 0;
  const out = raw.map((para) => {
    if (!Array.isArray(para)) throw bad();
    runs += para.length;
    if (runs > LIMITS.materialRuns) throw new InputError(where + "Das Material ist zu kleinteilig formatiert (höchstens " + LIMITS.materialRuns + " Abschnitte).");
    const line = [];
    for (const r of para) {
      if (!isObj(r) || typeof r.t !== "string" || (r.f != null && typeof r.f !== "string") || (r.h != null && typeof r.h !== "string")) throw bad();
      if (r.t.length > LIMITS.material) throw tooLong();
      const t = cleanText(r.t).replace(/[\t\n\r\u00a0]+/g, " ");   // innerhalb eines Laufs keine Zeilenumbrüche
      if (!t) continue;
      chars += t.length;
      if (chars > LIMITS.material) throw tooLong();
      const f = ["b", "i", "u"].filter((c) => String(r.f || "").includes(c)).join("");
      let h = "";
      if (r.h) { h = cleanHref(r.h); if (!h) throw new InputError(where + "Ein Link im Material ist ungültig (erlaubt sind nur Adressen mit http:// oder https://)."); }
      const prev = line[line.length - 1];
      if (prev && (prev.f || "") === f && (prev.h || "") === h) { prev.t += t; continue; }
      const run = { t }; if (f) run.f = f;
      if (h) { run.h = h; links++; if (links > LIMITS.materialLinks) throw new InputError(where + "Zu viele Links im Material (höchstens " + LIMITS.materialLinks + ")."); }
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

/* ---------- Bilder zu Aufgaben: nur die Kopfdaten lesen (kein Dekodieren im Worker – 10 ms CPU) ---------- */
export const IMAGE_MODES = ["thumb", "inline"];   // thumb = Miniatur rechts neben Aufgabe und Antwort, inline = größer unter der Aufgabenstellung
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
  if (!IMAGE_MODES.includes(mode)) throw new InputError("Ungültige Anzeigeart für das Bild (thumb oder inline).");
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
// Bild-Metadaten aus D1-Zeilen für eine Aufgabe (ohne Bilddaten)
export function imagesForTask(rows, task) {
  return (rows || []).filter((r) => Number(r.task) === task).map((r) => ({ id: String(r.id), mode: r.mode === "inline" ? "inline" : "thumb", w: Number(r.w) || 0, h: Number(r.h) || 0, alt: typeof r.alt === "string" ? r.alt : "" }));
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
  feedback: { max: 120, windowMs: 3600e3 },        // KI-Anfragen je IP
  feedback_chars: { max: 400000, windowMs: 3600e3 },   // … gewichtet nach Zeichen der Antworten
  sheet_feedback: { max: 300, windowMs: 86400e3 },     // KI-Anfragen je Blatt und Tag (schützt das Kontingent der Lehrkraft)
  submit: { max: 120, windowMs: 3600e3 },          // Abgaben je IP
  submit_bytes: { max: 30 * 1024 * 1024, windowMs: 3600e3 },   // … gewichtet nach Umschlag-Bytes
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
