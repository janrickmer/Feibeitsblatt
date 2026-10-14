// Unit-Tests der reinen Hilfsfunktionen (worker/lib.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_ALPHABET, normalizeCode, isValidCode, formatCode, generateCode, b64Bytes, isB64, b64ToBytes, bytesToB64,
  sha256Hex, timingSafeEqualStr, validateKdf, validateEncPrivateKey, decodeAuthKey, importPublicKey, validateEnvelope,
  validateSheetInput, validateAnswers, normalizeBaseUrl, isAllowedBase, validateAiInput, keyHintOf, defaultTitle,
  bucketOf, rateMessage, RATE, sealSecret, openSecret, InputError, LIMITS,
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
    { door: [10, 60], auth: [10, 60], lookup_miss: [30, 10], feedback: [120, 60], submit: [120, 60] });
  assert.equal(rateMessage("auth", 61), "Zu viele Fehlversuche. Bitte versuchen Sie es in etwa 2 Minuten erneut.");
  assert.equal(rateMessage("door", 30), "Zu viele Fehlversuche. Ein neuer Versuch ist in etwa 1 Minute möglich.");
  assert.match(rateMessage("submit", 600), /10 Minuten/);
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
