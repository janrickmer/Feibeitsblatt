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
  envelopeBytes: 400 * 1024,       // verschlüsselte Abgabe
  tasks: 30, taskText: 4000, solution: 8000, title: 200,
  answer: 8000, answersTotal: 40000,
  submissionsPerSheet: 1000,       // Schutz vor Vollschreiben der Datenbank
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
    return { text, solution };
  });
  return { title, tasks };
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

/* ---------- Rate-Limits ---------- */
export const RATE = {
  door: { max: 10, windowMs: 3600e3 },
  auth: { max: 10, windowMs: 3600e3 },
  lookup_miss: { max: 30, windowMs: 600e3 },
  feedback: { max: 120, windowMs: 3600e3 },
  submit: { max: 120, windowMs: 3600e3 },
};
const minutes = (s) => { const m = Math.max(1, Math.ceil(s / 60)); return m + (m === 1 ? " Minute" : " Minuten"); };
export function rateMessage(kind, retryAfter) {
  const t = minutes(retryAfter);
  switch (kind) {
    case "auth": return "Zu viele Fehlversuche. Bitte versuchen Sie es in etwa " + t + " erneut.";
    case "door": return "Zu viele Fehlversuche. Ein neuer Versuch ist in etwa " + t + " möglich.";   // neutral: Lehrkraft oder Schüler:in
    case "lookup_miss": return "Zu viele unbekannte Codes. Bitte prüfe den Code und versuche es in etwa " + t + " erneut.";
    case "feedback": return "Gerade wurden von diesem Netzwerk sehr viele KI-Rückmeldungen angefordert. Bitte versuche es in etwa " + t + " erneut.";
    case "submit": return "Gerade wurden von diesem Netzwerk sehr viele Abgaben gesendet. Bitte versuche es in etwa " + t + " erneut – deine Antworten bleiben auf diesem Gerät gespeichert.";
    default: return "Zu viele Anfragen. Bitte versuche es in etwa " + t + " erneut.";
  }
}
// Bucket ohne Klartext-IP; mit SETTINGS_SECRET als Pfeffer (sonst wäre der Hash einer IPv4 leicht umkehrbar)
export async function bucketOf(kind, ip, pepper = "") {
  return kind + ":" + (await sha256Hex(ip + "|" + kind + (pepper ? "|" + pepper : ""))).slice(0, 32);
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
