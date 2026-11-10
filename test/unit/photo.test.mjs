// photo.test.mjs – Antwortart Foto: die reinen Hilfsfunktionen aus index.html (Block PHOTO:BEGIN … PHOTO:END) und die Grenzen dazu:
// ein Foto ist ein vom Browser verkleinertes JPEG (data:-URL) und steckt nur im verschlüsselten Umschlag der Abgabe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { LIMITS, validateEnvelope } from "../../worker/lib.js";
import { makeEnvelope, b64 } from "../smoke.mjs";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const i = html.indexOf("/* PHOTO:BEGIN"), j = html.indexOf("/* PHOTO:END */");
const block = html.slice(i, j);
const NAMES = "PHOTO_TEXT, PHOTO_PREFIX, PHOTO_MAX_SIDE, PHOTO_MAX_BYTES, PHOTO_TOTAL_BYTES, PHOTO_TASKS, PHOTO_ENV_MAX, PHOTO_DATA_MAX, PHOTO_STEPS, " +
  "photoBudget, cleanPhoto, photoBytes, photoInfo, jpegInfo, pdfPhotoOk";
const P = new Function(block + "\nreturn { " + NAMES + " };")();
const { PHOTO_TEXT, PHOTO_PREFIX, PHOTO_MAX_SIDE, PHOTO_MAX_BYTES, PHOTO_TOTAL_BYTES, PHOTO_TASKS, PHOTO_ENV_MAX, PHOTO_DATA_MAX, PHOTO_STEPS,
  photoBudget, cleanPhoto, photoBytes, photoInfo, jpegInfo, pdfPhotoOk } = P;

// Kopf eines JPEG wie aus canvas.toBlob: SOI, APP0 (JFIF), DQT, SOFn (Breite, Höhe, Farbkanäle), DHT, SOS … – die Bilddaten danach egal
function jpegHead({ w = 1280, h = 960, comps = 3, sof = 0xC0, fill = false, exif = 0 } = {}) {
  const seg = (m, body) => [0xFF, m, ((body.length + 2) >> 8) & 255, (body.length + 2) & 255, ...body];
  const out = [0xFF, 0xD8];
  out.push(...seg(0xE0, [0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]));
  if (exif) out.push(...seg(0xE1, new Array(exif).fill(0x45)));
  out.push(...seg(0xDB, [0, ...new Array(64).fill(1)]));
  if (fill) out.push(0xFF, 0xFF);   // Füllbytes vor einem Marker sind erlaubt
  const c = []; for (let k = 0; k < comps; k++) c.push(k + 1, 0x11, 0);
  out.push(...seg(sof, [8, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, comps, ...c]));
  out.push(...seg(0xC4, [0, ...new Array(16).fill(0)]));
  out.push(...seg(0xDA, [comps, ...new Array(comps * 2 + 3).fill(0)]), 0x12, 0x34, 0xFF, 0xD9);
  return Uint8Array.from(out);
}
const dataUrl = (u8) => PHOTO_PREFIX + Buffer.from(u8).toString("base64");

test("photo: Block in index.html gefunden, ohne Abhängigkeiten; Grenzen wie im Worker", () => {
  assert.ok(i > 0 && j > i);
  assert.doesNotMatch(block, /\bdocument\b|\bwindow\b|[^\w.]S\.|\$\(|\bh\(/);
  assert.equal(PHOTO_TEXT, "[Foto]");
  assert.equal(PHOTO_PREFIX, "data:image/jpeg;base64,");
  assert.equal(PHOTO_TASKS, LIMITS.photoTasks);
  assert.equal(PHOTO_ENV_MAX, LIMITS.photoEnvelopeBytes);
  const ans = /const ANS_LIMITS = \{[^}]*\bphotoTasks: (\d+)/.exec(html);
  assert.ok(ans, "ANS_LIMITS.photoTasks"); assert.equal(Number(ans[1]), LIMITS.photoTasks);   // Blatt-Editor prüft wie der Worker
  assert.equal(PHOTO_DATA_MAX, PHOTO_PREFIX.length + 4 * Math.ceil(PHOTO_MAX_BYTES / 3));
  assert.ok(PHOTO_STEPS.every(([side, q]) => side <= PHOTO_MAX_SIDE && q > 0 && q <= 1));
  assert.ok(PHOTO_STEPS.every(([side], k) => !k || side <= PHOTO_STEPS[k - 1][0]), "Schritte werden kleiner");
});

test("photo: Budget je Foto – je ≤ 200 KB, zusammen ≤ 400 KB (1–3 Foto-Aufgaben)", () => {
  assert.equal(photoBudget(1), PHOTO_MAX_BYTES);
  assert.equal(photoBudget(2), PHOTO_MAX_BYTES);
  assert.equal(photoBudget(3), Math.floor(PHOTO_TOTAL_BYTES / 3));
  assert.equal(photoBudget(0), PHOTO_MAX_BYTES);
  assert.equal(photoBudget(undefined), PHOTO_MAX_BYTES);
  assert.equal(photoBudget(9), photoBudget(PHOTO_TASKS));   // mehr gibt es nicht (Worker: höchstens LIMITS.photoTasks)
  for (let n = 1; n <= PHOTO_TASKS; n++) assert.ok(n * photoBudget(n) <= PHOTO_TOTAL_BYTES);
});

test("photo: cleanPhoto nimmt nur eine data:-URL eines JPEG (Standard-Base64, ≤ PHOTO_DATA_MAX) – sonst kein Foto", () => {
  const ok = dataUrl(jpegHead());
  assert.equal(cleanPhoto(ok), ok);
  for (const bad of [
    null, undefined, 42, {}, "", PHOTO_PREFIX,
    "data:image/png;base64,iVBORw0KGgo=",                               // kein JPEG
    "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUg==",                   // Kopf kein FF D8 FF
    "DATA:image/jpeg;base64," + ok.slice(PHOTO_PREFIX.length),           // Groß-/Kleinschreibung
    ok + "=",                                                            // Länge kein Vielfaches von 4
    ok.slice(0, 40) + " " + ok.slice(41),                                // Leerraum
    ok.slice(0, 40) + "-_" + ok.slice(42),                               // Base64url
    "data:image/jpeg;base64,/9j/" + "A".repeat(PHOTO_DATA_MAX),          // zu lang
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "javascript:alert(1)",
  ]) assert.equal(cleanPhoto(bad), "", String(bad).slice(0, 40));
  // genau an der Grenze
  const max = "data:image/jpeg;base64,/9j/" + "A".repeat(PHOTO_DATA_MAX - PHOTO_PREFIX.length - 4);
  assert.equal(max.length, PHOTO_DATA_MAX); assert.equal(cleanPhoto(max), max);
});

test("photo: JPEG-Kopf lesen (jpegInfo) – Größe und Art für die PDF-Datei; Unlesbares → null", () => {
  assert.deepEqual(jpegInfo(jpegHead()), { w: 1280, h: 960, comps: 3, sof: 0xC0 });
  assert.deepEqual(jpegInfo(jpegHead({ w: 960, h: 1280, fill: true, exif: 3000 })), { w: 960, h: 1280, comps: 3, sof: 0xC0 });
  assert.deepEqual(jpegInfo(jpegHead({ sof: 0xC2, comps: 1, w: 7, h: 5 })), { w: 7, h: 5, comps: 1, sof: 0xC2 });
  assert.equal(jpegInfo(null), null);
  assert.equal(jpegInfo(Uint8Array.from([0x89, 0x50, 0x4E, 0x47])), null);   // PNG
  assert.equal(jpegInfo(jpegHead().slice(0, 30)), null);   // abgeschnitten vor dem SOF
  assert.equal(jpegInfo(Uint8Array.from([0xFF, 0xD8, 0xFF, 0xDA, 0, 4, 0, 0, 0xFF, 0xD9])), null);   // Bilddaten vor dem Kopf
  assert.equal(jpegInfo(Uint8Array.from([0xFF, 0xD8, 0x00, 0x00, 0, 0])), null);   // kein Marker
  assert.equal(jpegInfo(jpegHead({ w: 0 })), null);
  // in eine PDF-Datei (/DCTDecode) nur Baseline/progressiv, Graustufen oder RGB, ≤ 4096 px
  assert.equal(pdfPhotoOk(jpegInfo(jpegHead())), true);
  assert.equal(pdfPhotoOk(jpegInfo(jpegHead({ sof: 0xC2, comps: 1 }))), true);
  assert.equal(pdfPhotoOk(jpegInfo(jpegHead({ sof: 0xC3 }))), false);   // verlustfrei
  assert.equal(pdfPhotoOk(jpegInfo(jpegHead({ comps: 4 }))), false);    // CMYK
  assert.equal(pdfPhotoOk(jpegInfo(jpegHead({ w: 5000 }))), false);
  assert.equal(pdfPhotoOk(null), false);
  // aus der data:-URL: Bytes und Größe (der Kopf genügt)
  const head = jpegHead({ w: 640, h: 480 }), url = dataUrl(head);
  assert.deepEqual(Array.from(photoBytes(url)), Array.from(head));
  assert.deepEqual(photoInfo(url), { w: 640, h: 480, bytes: head.length });
  for (const n of [1, 2, 3]) { const u = dataUrl(Uint8Array.from([0xFF, 0xD8, 0xFF, ...new Array(n).fill(0)])); assert.equal(photoInfo(u).bytes, 3 + n); }
  assert.deepEqual(photoInfo(dataUrl(Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0]))), { w: 0, h: 0, bytes: 4 });   // unlesbarer Kopf: nur die Größe
});

test("photo: die Abgabe mit den größten Fotos passt in den Umschlag (LIMITS.photoEnvelopeBytes) und in den Request-Body – samt reichlich Text", async () => {
  const pair = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
  const pub = b64(await crypto.subtle.exportKey("spki", pair.publicKey));
  const photoOf = (bytes) => { const u = new Uint8Array(randomBytes(bytes)); u.set([0xFF, 0xD8, 0xFF]); return dataUrl(u); };   // nicht komprimierbar
  const text = (n) => "Ä".repeat(n / 2);   // n Bytes UTF-8 (Umlaute zählen doppelt)
  for (const n of [1, 2, 3]) {
    const photos = Array.from({ length: n }, () => photoOf(photoBudget(n)));
    assert.ok(photos.every((p) => cleanPhoto(p) === p && p.length <= PHOTO_DATA_MAX));
    // Fotos + 150 KB Texte (erste und überarbeitete Fassung, Feedback, Angaben) – realistisch sind ein paar KB
    const payload = { v: 1, stage: "final", sheetCode: "K7QM4X", sheetTitle: "Plakat", person: { vorname: "Ida", nachname: "Fo", geburtsdatum: "--03-04", klasse: "7a" },
      answers: [...photos.map((photo) => ({ first: PHOTO_TEXT, final: PHOTO_TEXT, photo })), { first: text(75000), final: text(75000) }],
      feedback: null, submittedAt: new Date().toISOString(), finalMode: true, typing: { v: 1, omitted: "too_large" } };
    const env = await makeEnvelope(pub, payload), json = validateEnvelope(env, LIMITS.photoEnvelopeBytes);
    assert.ok(json.length <= LIMITS.photoEnvelopeBytes, n + " Fotos: " + json.length);
    const body = JSON.stringify({ code: "K7QM4X", envelope: env, stage: "final", attempt: "0123456789abcdef" });
    assert.ok(body.length <= LIMITS.bodyBytes, n + " Fotos: Body " + body.length);
  }
  // ohne die Grenze für Foto-Blätter (LIMITS.envelopeBytes) passte ein großes Foto gerade noch, zwei schon nicht mehr – deshalb die eigene Grenze
  const answer = (bytes) => ({ first: PHOTO_TEXT, final: PHOTO_TEXT, photo: photoOf(bytes) });
  assert.ok(validateEnvelope(await makeEnvelope(pub, { v: 1, answers: [answer(PHOTO_MAX_BYTES)] })).length <= LIMITS.envelopeBytes);
  const two = await makeEnvelope(pub, { v: 1, answers: [answer(photoBudget(2)), answer(photoBudget(2))] });
  assert.throws(() => validateEnvelope(two), (e) => e.code === "too_large");
  assert.ok(validateEnvelope(two, LIMITS.photoEnvelopeBytes).length <= LIMITS.photoEnvelopeBytes);
});
