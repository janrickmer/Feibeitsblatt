// Unit-Tests der reinen Hilfsfunktionen (worker/lib.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_ALPHABET, normalizeCode, isValidCode, formatCode, generateCode, b64Bytes, isB64, b64ToBytes, bytesToB64,
  sha256Hex, timingSafeEqualStr, validateKdf, validateEncPrivateKey, decodeAuthKey, importPublicKey, validateEnvelope,
  validateSheetInput, validateAnswers, normalizeBaseUrl, isAllowedBase, validateAiInput, keyHintOf, defaultTitle,
  bucketOf, ipKey, rateMessage, RATE, sealSecret, openSecret, InputError, LIMITS,
  validateAnswerSpec, withMapChecks, publicAnswer, teacherAnswer, mapCheck,
} from "../../worker/lib.js";
import { PROVIDERS } from "../../worker/ai.js";

const b64 = (n, fill = 7) => bytesToB64(new Uint8Array(n).fill(fill));
const rejectsWith = (fn, code, status = 400) => assert.throws(fn, (e) => e instanceof InputError && e.code === code && e.status === status);

test("code alphabet: 31 characters without I, L, O, 0, 1", () => {
  assert.equal(CODE_ALPHABET.length, 31);
  assert.equal(new Set(CODE_ALPHABET).size, 31);
  for (const ch of "ILO01") assert.equal(CODE_ALPHABET.includes(ch), false);
});
test("normalizeCode / isValidCode / formatCode", () => {
  assert.equal(normalizeCode(" k7q-m4x "), "K7QM4X");
  assert.equal(normalizeCode("k7q m4x\n"), "K7QM4X");
  assert.equal(normalizeCode(null), "");
  assert.ok(isValidCode("K7QM4X"));
  assert.equal(isValidCode("AAAAAA"), false, "mindestens eine Ziffer");
  assert.equal(isValidCode("234567"), false, "mindestens ein Buchstabe");
  assert.equal(isValidCode("K7QM4O"), false, "O ist nicht im Alphabet");
  assert.equal(isValidCode("K7QM41"), false, "1 ist nicht im Alphabet");
  assert.equal(isValidCode("K7QM4"), false);
  assert.equal(isValidCode("K7QM4XX"), false);
  assert.equal(isValidCode("1104"), false);
  assert.equal(formatCode("K7QM4X"), "K7Q-M4X");
});
test("generateCode: valid, unique, rejection sampling without modulo bias", () => {
  const seen = new Set();
  for (let i = 0; i < 3000; i++) { const c = generateCode(); assert.ok(isValidCode(c), c); seen.add(c); }
  assert.ok(seen.size > 2990);
  // Bytes ≥ 248 werden verworfen: 248 → verworfen, 0 → „A“, 30 → „9“
  let calls = 0;
  const rand = () => { calls++; return calls === 1 ? new Uint8Array([248, 255, 0, 0, 0, 0, 0, 30]) : new Uint8Array(16); };
  assert.equal(generateCode(rand), "AAAAA9");
  // ohne Ziffer → neu würfeln
  let n = 0;
  const rand2 = () => (++n === 1 ? new Uint8Array(16) : new Uint8Array([0, 1, 2, 3, 4, 23]));
  assert.equal(generateCode(rand2), "ABCDE2");
  // Gleichverteilung grob prüfen (jedes Zeichen kommt vor)
  const counts = {};
  for (let i = 0; i < 2000; i++) for (const ch of generateCode()) counts[ch] = (counts[ch] || 0) + 1;
  assert.equal(Object.keys(counts).length, 31);
});
test("base64 helpers", () => {
  assert.equal(b64Bytes("QUJD"), 3); assert.equal(b64Bytes("QUI="), 2); assert.equal(b64Bytes("QQ=="), 1);
  assert.equal(b64Bytes("QUJ"), -1); assert.equal(b64Bytes("QU!D"), -1); assert.equal(b64Bytes(12), -1);
  assert.ok(isB64(b64(12), 12, 12)); assert.equal(isB64(b64(11), 12, 12), false);
  const u = new Uint8Array(70000).map((_, i) => (i * 7919) & 255);
  assert.deepEqual(b64ToBytes(bytesToB64(u)), u);
});
test("sha256Hex and timingSafeEqualStr", async () => {
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.ok(timingSafeEqualStr("abc", "abc"));
  assert.equal(timingSafeEqualStr("abc", "abd"), false);
  assert.equal(timingSafeEqualStr("abc", "abcd"), false);
  assert.equal(timingSafeEqualStr("", "a"), false);
  assert.ok(timingSafeEqualStr("", ""));
});
test("teacher key material validation", async () => {
  assert.deepEqual(validateKdf({ salt: b64(16), iterations: 600000, extra: 1 }), { salt: b64(16), iterations: 600000 });
  rejectsWith(() => validateKdf({ salt: b64(16), iterations: 99999 }), "bad_request");
  rejectsWith(() => validateKdf({ salt: b64(8), iterations: 600000 }), "bad_request");
  rejectsWith(() => validateKdf(null), "bad_request");
  assert.deepEqual(validateEncPrivateKey({ iv: b64(12), ct: b64(1900) }), { iv: b64(12), ct: b64(1900) });
  rejectsWith(() => validateEncPrivateKey({ iv: b64(16), ct: b64(1900) }), "bad_request");
  assert.equal(decodeAuthKey(b64(32)).length, 32);
  assert.equal(decodeAuthKey(b64(31)), null);
  assert.equal(decodeAuthKey("x"), null);
  const pair = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
  const spki = bytesToB64(new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey)));
  const key = await importPublicKey(spki);
  assert.equal(key.algorithm.modulusLength, 2048);
  await assert.rejects(importPublicKey(b64(300)), InputError);
  await assert.rejects(importPublicKey("QUJD"), InputError);
});
test("validateEnvelope: shape, base64, size cap, unknown fields dropped", () => {
  const env = { v: 1, ek: b64(384), iv: b64(12), ct: b64(1000), extra: "weg" };
  assert.deepEqual(JSON.parse(validateEnvelope(env)), { v: 1, ek: env.ek, iv: env.iv, ct: env.ct });
  rejectsWith(() => validateEnvelope({ ...env, v: 2 }), "bad_envelope");
  rejectsWith(() => validateEnvelope({ ...env, v: "1" }), "bad_envelope");
  rejectsWith(() => validateEnvelope({ ...env, iv: b64(16) }), "bad_envelope");
  rejectsWith(() => validateEnvelope({ ...env, ek: "nicht base64!" }), "bad_envelope");
  rejectsWith(() => validateEnvelope({ ...env, ct: "" }), "bad_envelope");
  rejectsWith(() => validateEnvelope(null), "bad_envelope");
  rejectsWith(() => validateEnvelope([]), "bad_envelope");
  rejectsWith(() => validateEnvelope({ ...env, ct: b64(310 * 1024) }), "too_large", 413);
  assert.ok(validateEnvelope({ ...env, ct: b64(290 * 1024) }).length <= LIMITS.envelopeBytes);
});
test("validateSheetInput: trimming, defaults, limits", () => {
  const now = Date.UTC(2026, 9, 14, 23, 30);   // 15.10. in Berlin
  const r = validateSheetInput({ title: "  Mein\n Blatt ", tasks: [{ text: "  Aufgabe\r\n eins  ", solution: " Lösung " }, { text: "Zwei" }] }, now);
  assert.deepEqual(r, { title: "Mein Blatt", tasks: [{ text: "Aufgabe\n eins", solution: "Lösung" }, { text: "Zwei", solution: "" }] });
  assert.equal(validateSheetInput({ tasks: [{ text: "x" }] }, now).title, "Feibeitsblatt vom 15.10.2026");
  assert.equal(defaultTitle(Date.UTC(2026, 0, 2, 12)), "Feibeitsblatt vom 02.01.2026");
  rejectsWith(() => validateSheetInput({ title: "x", tasks: [] }), "bad_request");
  rejectsWith(() => validateSheetInput({ title: "x", tasks: Array.from({ length: 31 }, () => ({ text: "a" })) }), "bad_request");
  assert.equal(validateSheetInput({ tasks: Array.from({ length: 30 }, () => ({ text: "a" })) }).tasks.length, 30);
  rejectsWith(() => validateSheetInput({ tasks: [{ text: " \n " }] }), "bad_request");
  rejectsWith(() => validateSheetInput({ tasks: [{ text: "a".repeat(4001) }] }), "bad_request");
  assert.equal(validateSheetInput({ tasks: [{ text: "a".repeat(4000), solution: "b".repeat(8000) }] }).tasks[0].solution.length, 8000);
  rejectsWith(() => validateSheetInput({ tasks: [{ text: "a", solution: "b".repeat(8001) }] }), "bad_request");
  rejectsWith(() => validateSheetInput({ title: "t".repeat(201), tasks: [{ text: "a" }] }), "bad_request");
  rejectsWith(() => validateSheetInput({ tasks: [{ text: "a", solution: 5 }] }), "bad_request");
  rejectsWith(() => validateSheetInput({ tasks: "a" }), "bad_request");
  assert.equal(validateSheetInput({ tasks: [{ text: "a\u0000b\u0007" }] }).tasks[0].text, "ab");
});
test("validateAnswers: count, per-answer and total limits", () => {
  assert.deepEqual(validateAnswers(["a", null, "c\r\nd"], 3), ["a", "", "c\nd"]);
  rejectsWith(() => validateAnswers(["a"], 2), "bad_answers");
  rejectsWith(() => validateAnswers("a", 1), "bad_answers");
  rejectsWith(() => validateAnswers([5], 1), "bad_answers");
  rejectsWith(() => validateAnswers(["a".repeat(8001)], 1), "too_long");
  assert.equal(validateAnswers(Array(5).fill("a".repeat(8000)), 5).length, 5);   // genau 40 000
  rejectsWith(() => validateAnswers(Array(6).fill("a".repeat(7000)), 6), "too_long");
});
test("custom base URL: https required, http only for 127.0.0.1/localhost", () => {
  assert.equal(normalizeBaseUrl("https://api.cerebras.ai/v1/"), "https://api.cerebras.ai/v1");
  assert.equal(normalizeBaseUrl("http://127.0.0.1:8812/v1"), "http://127.0.0.1:8812/v1");
  assert.equal(normalizeBaseUrl("http://localhost:1234/v1"), "http://localhost:1234/v1");
  assert.equal(normalizeBaseUrl("http://example.com/v1"), null);
  assert.equal(normalizeBaseUrl("http://127.0.0.1.evil.com/v1"), null);
  assert.equal(normalizeBaseUrl("https://user:pw@example.com/v1"), null);
  assert.equal(normalizeBaseUrl("https://example.com/v1?x=1"), null);
  assert.equal(normalizeBaseUrl("javascript:alert(1)"), null);
  assert.equal(normalizeBaseUrl("kein url"), null);
  assert.equal(normalizeBaseUrl(""), "");
  assert.ok(isAllowedBase("https://a.b/v1")); assert.equal(isAllowedBase(""), false); assert.equal(isAllowedBase("http://a.b"), false);
});
test("validateAiInput", () => {
  assert.deepEqual(validateAiInput({ provider: "groq", model: " openai/gpt-oss-120b ", apiKey: " gsk_abc " }, PROVIDERS),
    { provider: "groq", model: "openai/gpt-oss-120b", baseUrl: "", apiKey: "gsk_abc" });
  assert.equal(validateAiInput({ provider: "gemini", model: "models/gemini-3.6-flash" }, PROVIDERS).model, "gemini-3.6-flash");
  assert.equal(validateAiInput({ provider: "groq", baseUrl: "https://x.y" }, PROVIDERS).baseUrl, "", "baseUrl nur bei custom");
  assert.equal(validateAiInput({ provider: "custom", baseUrl: "https://x.y/v1/" }, PROVIDERS).baseUrl, "https://x.y/v1");
  rejectsWith(() => validateAiInput({ provider: "custom", baseUrl: "http://x.y/v1" }, PROVIDERS), "bad_request");
  rejectsWith(() => validateAiInput({ provider: "custom" }, PROVIDERS), "bad_request");
  rejectsWith(() => validateAiInput({ provider: "toString" }, PROVIDERS), "bad_request");
  rejectsWith(() => validateAiInput({ provider: "groq", model: "a b" }, PROVIDERS), "bad_request");
  rejectsWith(() => validateAiInput({ provider: "groq", apiKey: "a b" }, PROVIDERS), "bad_request");
  rejectsWith(() => validateAiInput({ provider: "groq", apiKey: 5 }, PROVIDERS), "bad_request");
  assert.equal(keyHintOf("gsk_1234abcd"), "…abcd"); assert.equal(keyHintOf(""), "");
});
test("rate-limit buckets never contain the IP; messages in German", async () => {
  const b = await bucketOf("door", "203.0.113.7");
  assert.match(b, /^door:[0-9a-f]{32}$/);
  assert.equal(b.includes("203"), false);
  assert.notEqual(await bucketOf("door", "203.0.113.7", "pfeffer"), b);
  assert.notEqual(await bucketOf("auth", "203.0.113.7"), b.replace("door", "auth"));
  assert.deepEqual(Object.fromEntries(Object.entries(RATE).map(([k, v]) => [k, [v.max, v.windowMs / 60000]])),
    { door: [10, 15], auth: [10, 15], auth_all: [200, 60], lookup_miss: [30, 10], feedback: [240, 60], feedback_chars: [800000, 60],
      sheet_feedback: [600, 1440], submit: [240, 60], submit_bytes: [60 * 1024 * 1024, 60] });
  assert.match(rateMessage("auth", 61), /^Zu viele falsche Passwörter\. Mit dem richtigen Passwort .* in etwa 2 Minuten möglich\.$/);
  assert.equal(rateMessage("door", 30), "Zu viele Fehlversuche. Ein neuer Versuch ist in etwa 1 Minute möglich.");
  assert.match(rateMessage("lookup_miss", 120), /richtigen Code geht es weiter/);
  assert.match(rateMessage("submit", 600), /10 Minuten/);
});
test("ipKey: IPv4 unchanged, IPv6 reduced to its /64 prefix, mapped IPv4 unwrapped", () => {
  assert.equal(ipKey("203.0.113.7"), "203.0.113.7");
  assert.equal(ipKey("local"), "local");
  assert.equal(ipKey("2001:db8:1:2::1"), "2001:0db8:0001:0002::/64");
  assert.equal(ipKey("2001:DB8:1:2:ffff:ffff:ffff:ffff"), "2001:0db8:0001:0002::/64");
  assert.equal(ipKey("2001:db8:1:2::1"), ipKey("2001:db8:1:2:abcd::9"));
  assert.notEqual(ipKey("2001:db8:1:2::1"), ipKey("2001:db8:1:3::1"));
  assert.equal(ipKey("::1"), "0000:0000:0000:0000::/64");
  assert.equal(ipKey("::ffff:198.51.100.3"), "198.51.100.3");
  assert.equal(ipKey("[2001:db8::5]"), "2001:0db8:0000:0000::/64");
  assert.equal(ipKey("fe80::1%eth0"), "fe80:0000:0000:0000::/64");
  assert.equal(ipKey("1:2:3"), "1:2:3");   // ungültig: unverändert (eigener Bucket)
});
test("sealSecret/openSecret: AES-GCM at rest, wrong/missing secret → null", async () => {
  const secret = b64(32, 9);
  const sealed = await sealSecret("gsk_geheim", secret);
  assert.equal(JSON.stringify(sealed).includes("geheim"), false);
  assert.equal(await openSecret(sealed, secret), "gsk_geheim");
  assert.equal(await openSecret(sealed, b64(32, 8)), null);
  assert.equal(await openSecret(sealed, ""), null);
  assert.equal(await openSecret({ iv: "x", ct: "y" }, secret), null);
  const sealed2 = await sealSecret("k", "kein base64 – wird gehasht");
  assert.equal(await openSecret(sealed2, "kein base64 – wird gehasht"), "k");
});

/* ---------- Bilder zu Aufgaben: Kopfdaten lesen ---------- */
import { imageInfo, validateImageUpload, imagesForTask, generateImageId, strictB64, IMAGE_ID_RE, IMAGE_MODES } from "../../worker/lib.js";
import { makePng, jpegHeader, webpHeader } from "../png.mjs";

test("imageInfo: PNG, JPEG (SOF0/SOF2, mit Füll- und Kommentarsegmenten), WebP (VP8X/VP8L/VP8)", () => {
  assert.deepEqual(imageInfo(makePng(3, 2)), { mime: "image/png", w: 3, h: 2 });
  assert.deepEqual(imageInfo(new Uint8Array(makePng(1600, 900))), { mime: "image/png", w: 1600, h: 900 });
  assert.deepEqual(imageInfo(jpegHeader(640, 480)), { mime: "image/jpeg", w: 640, h: 480 });
  assert.deepEqual(imageInfo(jpegHeader(1234, 77, { padding: 60000, sofMarker: 0xc2 })), { mime: "image/jpeg", w: 1234, h: 77 });
  const padded = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xff, 0xff]), jpegHeader(20, 10).subarray(2)]);   // Füllbytes vor dem ersten Marker
  assert.deepEqual(imageInfo(padded), { mime: "image/jpeg", w: 20, h: 10 });
  assert.deepEqual(imageInfo(webpHeader("VP8X", 800, 600)), { mime: "image/webp", w: 800, h: 600 });
  assert.deepEqual(imageInfo(webpHeader("VP8L", 1024, 1)), { mime: "image/webp", w: 1024, h: 1 });
  assert.deepEqual(imageInfo(webpHeader("VP8 ", 320, 240)), { mime: "image/webp", w: 320, h: 240 });
});

test("imageInfo: alles andere → null (kein Bild, zu groß, kaputte Köpfe, GIF/SVG/HTML)", () => {
  assert.equal(imageInfo(new Uint8Array(0)), null);
  assert.equal(imageInfo(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), null);
  assert.equal(imageInfo(Buffer.from("GIF89a\x01\x00\x01\x00", "latin1")), null);
  assert.equal(imageInfo(Buffer.from("<html><script>alert(1)</script>")), null);
  assert.equal(imageInfo(makePng(LIMITS.imageSide + 1, 10)), null);
  assert.equal(imageInfo(makePng(10, 10).subarray(0, 20)), null);                       // abgeschnitten vor IHDR-Maßen
  assert.equal(imageInfo(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9])), null);   // Bilddaten ohne Frame-Kopf
  assert.equal(imageInfo(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01])), null);     // Segmentlänge < 2
  assert.equal(imageInfo(Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x00, 0x00, 0x05])), null);   // Höhe 0
  const badSig = webpHeader("VP8 ", 5, 5); badSig[23] = 0x00;
  assert.equal(imageInfo(badSig), null);
  assert.equal(imageInfo(Buffer.from("RIFF\0\0\0\0WEBPXXXX" + "\0".repeat(20), "latin1")), null);
});

test("validateImageUpload: Aufgabennummer 1..LIMITS.tasks, Anzeigeart thumb|inline, Base64-Bild mit lesbaren Kopfdaten", () => {
  const png = makePng(40, 30), b64 = png.toString("base64");
  const v = validateImageUpload({ task: 1, mode: "thumb", data: b64 });
  assert.deepEqual([v.task, v.mode, v.bytes, v.info, v.data === b64, v.id, v.alt], [1, "thumb", png.length, { mime: "image/png", w: 40, h: 30 }, true, null, ""]);
  const w = validateImageUpload({ task: 1, mode: "thumb", data: b64, id: "0123456789ABCDEF", alt: "  Skizze \n einer   Zelle\u0007 " });
  assert.deepEqual([w.id, w.alt], ["0123456789abcdef", "Skizze einer Zelle"]);
  rejectsWith(() => validateImageUpload({ task: 1, mode: "thumb", data: b64, id: "nope" }), "bad_request");
  rejectsWith(() => validateImageUpload({ task: 1, mode: "thumb", data: b64, id: 5 }), "bad_request");
  rejectsWith(() => validateImageUpload({ task: 1, mode: "thumb", data: b64, alt: "x".repeat(LIMITS.imageAlt + 1) }), "bad_request");
  rejectsWith(() => validateImageUpload({ task: 1, mode: "thumb", data: b64, alt: ["a"] }), "bad_request");
  // Leerraum im Base64 (atob würde ihn überlesen) → abgelehnt, es wird nur echtes Base64 gespeichert
  rejectsWith(() => validateImageUpload({ task: 1, mode: "thumb", data: b64.slice(0, 8) + " \n  " + b64.slice(8) }), "bad_image");
  assert.equal(validateImageUpload({ task: 30, mode: "INLINE", data: b64 }).mode, "inline");
  for (const t of [0, 31, 1.5, "1", "a", "", null, undefined]) rejectsWith(() => validateImageUpload({ task: t, mode: "thumb", data: b64 }), "bad_request");
  for (const m of ["", "big", "thumbs", null]) rejectsWith(() => validateImageUpload({ task: 1, mode: m, data: b64 }), "bad_request");
  for (const d of ["", "kein base64!", "abc", null, 5, b64.slice(0, 20)]) rejectsWith(() => validateImageUpload({ task: 1, mode: "thumb", data: d }), "bad_image");
  rejectsWith(() => validateImageUpload({ task: 1, mode: "thumb", data: Buffer.from("<svg/>").toString("base64") }), "bad_image");
  rejectsWith(() => validateImageUpload({ task: 1, mode: "thumb", data: Buffer.alloc(LIMITS.imageBytes + 1).toString("base64") }), "too_large", 413);
  rejectsWith(() => validateImageUpload(null), "bad_request");
  // JPEG mit großem Kommentarsegment: Frame-Kopf liegt jenseits der ersten Bytes, aber innerhalb der dekodierten 144 KB
  const jpg = jpegHeader(800, 600, { padding: 60000 });
  assert.deepEqual(validateImageUpload({ task: 2, mode: "inline", data: jpg.toString("base64") }).info, { mime: "image/jpeg", w: 800, h: 600 });
  assert.deepEqual(IMAGE_MODES, ["thumb", "inline", "card"]);
});

test("strictB64: nur echtes Base64 mit passender Länge", () => {
  assert.equal(strictB64("aGFsbG8="), "hallo");
  assert.equal(strictB64("aGFsbG8"), null);        // Länge kein Vielfaches von 4
  assert.equal(strictB64("aGFs bG8="), null);      // Leerraum
  assert.equal(strictB64("aGFs=bG8="), null);      // Padding in der Mitte
  assert.equal(strictB64("aGFsbG8-"), null);       // url-safe-Zeichen
  assert.equal(strictB64(""), null); assert.equal(strictB64(null), null); assert.equal(strictB64(12), null);
  assert.equal(strictB64("YQ=="), "a"); assert.equal(strictB64("YWI="), "ab"); assert.equal(strictB64("YWJj"), "abc");
});

test("imagesForTask + generateImageId", () => {
  const rows = [{ id: "a", task: 2, mode: "inline", w: 10, h: 5, alt: "Zelle" }, { id: "b", task: "1", mode: "weird", w: "3", h: null }, { id: "c", task: 2, mode: "thumb", w: 1, h: 1, alt: null }];
  assert.deepEqual(imagesForTask(rows, 2), [{ id: "a", mode: "inline", w: 10, h: 5, alt: "Zelle" }, { id: "c", mode: "thumb", w: 1, h: 1, alt: "" }]);
  assert.deepEqual(imagesForTask(rows, 1), [{ id: "b", mode: "thumb", w: 3, h: 0, alt: "" }]);
  assert.deepEqual(imagesForTask(undefined, 1), []);
  for (let i = 0; i < 20; i++) assert.match(generateImageId(), IMAGE_ID_RE);
  assert.equal(generateImageId((n) => new Uint8Array(n).fill(255)), "ffffffffffffffff");
});

/* ---------- Material zu Aufgaben ---------- */
import { validateMaterial, materialText, cleanHref } from "../../worker/lib.js";

test("cleanHref: nur http(s), normalisiert; alles andere leer", () => {
  assert.equal(cleanHref(" https://Beispiel.de/Weg?x=1#a "), "https://beispiel.de/Weg?x=1#a");
  assert.equal(cleanHref("http://127.0.0.1:8787/api/health"), "http://127.0.0.1:8787/api/health");
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "mailto:a@b.de", "ftp://x.de", "beispiel.de", "", null, undefined, "https://a b.de", "https://x.de/\u0007", "x".repeat(LIMITS.href + 1),
    "https://example.com/" + "ä".repeat(900)])   // nach der Prozent-Kodierung zu lang
    assert.equal(cleanHref(bad), "", String(bad).slice(0, 30));
  assert.equal(cleanHref("https://example.com/" + "ä".repeat(100)), "https://example.com/" + "%C3%A4".repeat(100));
});

test("validateMaterial: normalisiert Läufe, verbindet gleiche Formate, prüft Links und Grenzen", () => {
  assert.deepEqual(validateMaterial(undefined), []); assert.deepEqual(validateMaterial(null), []); assert.deepEqual(validateMaterial([]), []);
  const m = validateMaterial([
    [], [{ t: "Lies " }, { t: "den", f: "ub" }, { t: " Text", f: "" }, { t: "", f: "b" }, { t: "\tjetzt\n" }],
    [{ t: "Quelle", h: "HTTPS://Beispiel.de/x", f: "iii" }, { t: "  " }],
    [], [],
  ], 2);
  assert.deepEqual(m, [[{ t: "Lies " }, { t: "den", f: "bu" }, { t: " Text jetzt " }], [{ t: "Quelle", f: "i", h: "https://beispiel.de/x" }, { t: "  " }]]);
  rejectsWith(() => validateMaterial("x"), "bad_request"); rejectsWith(() => validateMaterial([{}]), "bad_request"); rejectsWith(() => validateMaterial([[5]]), "bad_request");
  rejectsWith(() => validateMaterial([[{ t: 5 }]]), "bad_request"); rejectsWith(() => validateMaterial([[{ t: "a", f: 1 }]]), "bad_request");
  assert.throws(() => validateMaterial([[{ t: "x", h: "javascript:alert(1)" }]], 3), (e) => e instanceof InputError && /Aufgabe 3: Ein Link im Material ist ungültig/.test(e.message));
  rejectsWith(() => validateMaterial([[{ t: "x".repeat(LIMITS.material + 1) }]]), "bad_request");
  rejectsWith(() => validateMaterial(Array.from({ length: LIMITS.materialParagraphs + 1 }, () => [])), "bad_request");
  rejectsWith(() => validateMaterial([Array.from({ length: LIMITS.materialRuns + 1 }, (_, i) => ({ t: "a", f: i % 2 ? "b" : "" }))]), "bad_request");
  rejectsWith(() => validateMaterial([Array.from({ length: LIMITS.materialRuns + 1 }, () => ({ t: "" }))]), "bad_request");   // leere Läufe zählen mit
  rejectsWith(() => validateMaterial([Array.from({ length: LIMITS.materialLinks + 1 }, (_, i) => ({ t: "a", h: "https://x.de/" + i }))]), "bad_request");
  // Steuerzeichen raus, NBSP → Leerzeichen
  assert.deepEqual(validateMaterial([[{ t: "a\u0000b\u00a0c" }]]), [[{ t: "ab c" }]]);
});

test("validateSheetInput nimmt Material je Aufgabe mit (nur wenn vorhanden) und materialText macht reinen Text", () => {
  const r = validateSheetInput({ title: "x", tasks: [{ text: "A", material: [[{ t: "Hallo " }, { t: "Welt", f: "b" }], [], [{ t: "Link", h: "https://x.de" }]] }, { text: "B", material: [] }, { text: "C" }] });
  assert.deepEqual(r.tasks[0].material, [[{ t: "Hallo " }, { t: "Welt", f: "b" }], [], [{ t: "Link", h: "https://x.de/" }]]);
  assert.equal("material" in r.tasks[1], false); assert.equal("material" in r.tasks[2], false);
  assert.equal(materialText(r.tasks[0].material), "Hallo Welt\n\nLink");
  assert.equal(materialText(undefined), ""); assert.equal(materialText([[{ t: "  x " }]]), "x");
});

/* ---------- Antwortarten (Tabelle, Weltkarten-Zuordnung) ---------- */
const MAP = { type: "map", map: "world", items: [
  { id: "kaffee", label: " Kaffee  ", hint: "Bohnen\naus Übersee", image: "0123456789ABCDEF", countries: [{ id: "076", name: "Brasilien" }, { id: "704", name: "Vietnam" }, { id: "076", name: "Brasilien" }], extra: 1 },
  { id: "kakao", label: "Kakao", countries: [{ id: "384", name: "Elfenbeinküste" }] },
] };
test("validateAnswerSpec: text, table and map are normalized; unknown fields dropped", () => {
  assert.equal(validateAnswerSpec(undefined, 1), null);
  assert.equal(validateAnswerSpec({ type: "text", columns: ["x"] }, 1), null);
  assert.deepEqual(validateAnswerSpec({ type: "table", columns: [" Land ", "Grund | Beleg"], rows: 3, foo: 1 }, 2), { type: "table", columns: ["Land", "Grund / Beleg"], rows: 3 });
  assert.deepEqual(validateAnswerSpec(MAP, 1), { type: "map", map: "world", items: [
    { id: "kaffee", label: "Kaffee", hint: "Bohnen aus Übersee", image: "0123456789abcdef", countries: [{ id: "076", name: "Brasilien" }, { id: "704", name: "Vietnam" }] },
    { id: "kakao", label: "Kakao", countries: [{ id: "384", name: "Elfenbeinküste" }] },
  ] });
});
test("validateAnswerSpec: broken specs → 400 with task number", () => {
  const bad = (a, re) => assert.throws(() => validateAnswerSpec(a, 3), (e) => e instanceof InputError && e.status === 400 && /^Aufgabe 3: /.test(e.message) && (!re || re.test(e.message)));
  bad("table"); bad({ type: "essay" }, /Unbekannte Antwortart/);
  bad({ type: "table", columns: [], rows: 1 }); bad({ type: "table", columns: ["a"], rows: 0 }); bad({ type: "table", columns: ["a"], rows: 31 });
  bad({ type: "table", columns: Array(9).fill("a"), rows: 1 }); bad({ type: "table", columns: ["x".repeat(61)], rows: 1 }); bad({ type: "table", columns: ["  "], rows: 1 }, /Spalte 1/);
  bad({ type: "table", columns: ["a"], rows: 1.5 }); bad({ type: "table", columns: [1], rows: 1 });
  const item = { id: "a", label: "A", countries: [{ id: "276", name: "Deutschland" }] };
  bad({ type: "map", map: "europe", items: [item] }); bad({ type: "map", items: [] }); bad({ type: "map", items: Array(41).fill(0).map((_, k) => ({ ...item, id: "a" + k })) });
  bad({ type: "map", items: [item, item] }, /doppelt/); bad({ type: "map", items: [item, { ...item, id: "b" }] }, /Bezeichnung „A“ kommt doppelt vor/); bad({ type: "map", items: [{ ...item, id: "a b" }] }); bad({ type: "map", items: [{ ...item, id: "x".repeat(41) }] });
  bad({ type: "map", items: [{ ...item, label: " " }] }); bad({ type: "map", items: [{ ...item, label: "x".repeat(121) }] }); bad({ type: "map", items: [{ ...item, hint: "x".repeat(401) }] });
  bad({ type: "map", items: [{ ...item, image: "nope" }] }); bad({ type: "map", items: [{ ...item, countries: [] }] });
  bad({ type: "map", items: [{ ...item, countries: Array(11).fill(0).map((_, k) => ({ id: String(100 + k), name: "x" })) }] });
  bad({ type: "map", items: [{ ...item, countries: [{ id: "76", name: "Brasilien" }] }] }); bad({ type: "map", items: [{ ...item, countries: [{ id: "076", name: "" }] }] });
});
test("validateSheetInput: answer stored, map without solution, at most 400 checks per sheet", () => {
  const r = validateSheetInput({ tasks: [{ text: "Ordne zu", solution: "geheim", answer: MAP }, { text: "Tabelle", solution: "k", answer: { type: "table", columns: ["A"], rows: 2 } }, { text: "Text", answer: { type: "text" } }] });
  assert.equal(r.tasks[0].solution, "");
  assert.deepEqual(r.tasks[1], { text: "Tabelle", solution: "k", answer: { type: "table", columns: ["A"], rows: 2 } });
  assert.deepEqual(r.tasks[2], { text: "Text", solution: "" });
  const items = (p) => Array(40).fill(0).map((_, k) => ({ id: p + k, label: "L" + k, countries: Array(10).fill(0).map((_, j) => ({ id: String(100 + j), name: "N" })) }));
  assert.doesNotThrow(() => validateSheetInput({ tasks: [{ text: "a", answer: { type: "map", items: items("a") } }] }));   // 400 genau
  assert.throws(() => validateSheetInput({ tasks: [{ text: "a", answer: { type: "map", items: items("a") } }, { text: "b", answer: { type: "map", items: items("b").slice(0, 1) } }] }), /höchstens 400/);
  assert.throws(() => validateSheetInput({ tasks: [{ text: "a", answer: { type: "table", columns: ["A"] } }] }), /Aufgabe 1: Die Tabelle braucht/);
});
test("map checks: SHA-256 of code|item|country, never countries in public answer, card image only when stored", async () => {
  const a = validateAnswerSpec(MAP, 1);
  const [t] = await withMapChecks([{ text: "x", solution: "", answer: a }], "K7QM4X");
  assert.deepEqual(t.answer.items[0].checks, [await sha256Hex("K7QM4X|kaffee|076"), await sha256Hex("K7QM4X|kaffee|704")]);
  assert.equal(await mapCheck("K7QM4X", "kakao", "384"), t.answer.items[1].checks[0]);
  const pub = await publicAnswer(t.answer, "K7QM4X", new Set());
  assert.deepEqual(pub.items[0], { id: "kaffee", label: "Kaffee", hint: "Bohnen aus Übersee", checks: t.answer.items[0].checks });
  assert.equal(/Brasilien|Vietnam|"076"|countries/.test(JSON.stringify(pub)), false);
  assert.equal((await publicAnswer(t.answer, "K7QM4X", new Set(["0123456789abcdef"]))).items[0].image, "0123456789abcdef");
  // ohne gespeicherte Prüfwerte (oder kaputte) werden sie berechnet
  assert.deepEqual((await publicAnswer(a, "K7QM4X", null)).items[1].checks, [await sha256Hex("K7QM4X|kakao|384")]);
  assert.deepEqual(teacherAnswer(t.answer).items[0], { id: "kaffee", label: "Kaffee", hint: "Bohnen aus Übersee", image: "0123456789abcdef", countries: [{ id: "076", name: "Brasilien" }, { id: "704", name: "Vietnam" }] });
  assert.deepEqual([teacherAnswer(undefined), await publicAnswer({ type: "evil" }, "K7QM4X")], [{ type: "text" }, { type: "text" }]);
});
