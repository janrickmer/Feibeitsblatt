// draftcode.test.mjs – Online-Zwischenstand mit Zwischenstand-Code: die reinen Hilfsfunktionen aus index.html (Block DRAFTCODE:BEGIN …
// DRAFTCODE:END), die Ableitung gegen node:crypto, der Umschlag gegen die Prüfung des Servers und die Stellen im Skript, die sie nutzen
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pbkdf2Sync, hkdfSync, webcrypto, createDecipheriv } from "node:crypto";
import { LIMITS, DRAFT_ID_RE, validateDraftId, validateDraftEnvelope } from "../../worker/lib.js";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const i = html.indexOf("/* DRAFTCODE:BEGIN"), j = html.indexOf("/* DRAFTCODE:END */");
const block = html.slice(i, j);
const NAMES = "DC_ALPHABET, DC_LEN, DC_RE, DC_ID_RE, DC_DAYS, DC_KDF_PREFIX, DC_KDF_SALT, DC_KDF_ITER, DC_INFO_ID, DC_INFO_ENC, DC_BTN, DC_BUSY, DC_EXAMPLE, " +
  "dcNorm, dcValid, dcFmt, dcNew, dcState, dcOut, dcTimes, dcB64, dcUnB64, dcDerive, dcSeal, dcOpen, dcEnvFits, dcDay, dcDate, dcClock, dcNoteParts, dcSavedText, " +
  "dcFailReason, dcFailText, dcPdfHead, dcPdfLine, dcPdfSecret, dcPdfFresh, DC_PDF_UPLOAD, DC_LEN_ERR, DC_BAD, DC_LOADING, DC_NOT_FOUND, DC_BROKEN, DC_LOADED, " +
  "dcNewerText, DC_NEWER_OK, dcCancelText";
const D = new Function(block + "\nreturn { " + NAMES + " };")();
const subtle = webcrypto.subtle;
const body = (start, end) => { const a = html.indexOf(start), b = html.indexOf(end, a); assert.ok(a > 0 && b > a, start); return html.slice(a, b); };
const fnSrc = (head) => body(head, "\n}\n") + "\n}\n";
// wie NO_TT in den E2E-Tests: an sichtbaren Stellen steht zur Tippzeit-Messung nur der eine Satz der Kurzfassung
const NO_TT = /Tippzeit|misst|Messung|gemessen|Zeitmess|Schreibprozess|widersprech|Widerspruch|Schalter|Haken/i;
const rnd = (n) => webcrypto.getRandomValues(new Uint8Array(n));
// deterministischer Zufall (Eigenschaftstests sollen bei jedem Lauf gleich sein)
function rng(seed) { let s = seed >>> 0; return (n) => { const u = new Uint8Array(n); for (let k = 0; k < n; k++) { s = (s * 1664525 + 1013904223) >>> 0; u[k] = s >>> 24; } return u; }; }
const AT = new Date(2026, 10, 24, 9, 5).getTime(), UNTIL = new Date(2026, 11, 24, 9, 5).getTime();   // Ortszeit (wie die Seite formatiert)

test("draftcode: Block gefunden, ohne Abhängigkeiten; Alphabet, Länge und Kennung wie bei den Blatt-Codes bzw. beim Server", () => {
  assert.ok(i > 0 && j > i);
  assert.doesNotMatch(block, /\bdocument\b|\bwindow\b|[^\w.]S\.|\$\(|\bh\(|\bapi\(|\bfetch\(|localStorage|\bstore\./);
  assert.equal(D.DC_ALPHABET, "ABCDEFGHJKMNPQRSTUVWXYZ23456789");
  assert.ok(html.includes("const CODE_RE = /^[" + D.DC_ALPHABET + "]{6}$/;"));   // dasselbe Alphabet wie die Blatt-Codes (ohne I, L, O, 0, 1)
  assert.equal(D.DC_ALPHABET.length, 31);
  assert.equal(D.DC_LEN, 8);
  assert.equal(D.DC_RE.source, "^[" + D.DC_ALPHABET + "]{8}$");
  assert.equal(D.DC_ID_RE.source, DRAFT_ID_RE.source);
  assert.equal(D.DC_DAYS, LIMITS.draftDays);
  assert.equal(D.DC_DAYS, 30);
  // Ableitung: Parameter und info-Texte sind Teil des Formats (nie ändern – sonst sind alle online gesicherten Stände verloren)
  assert.deepEqual([D.DC_KDF_PREFIX, D.DC_KDF_SALT, D.DC_KDF_ITER, D.DC_INFO_ID, D.DC_INFO_ENC],
    ["feibeitsblatt/draft/v1|", "feibeitsblatt/draft/v1", 600000, "feibeitsblatt/draft/id/v1", "feibeitsblatt/draft/enc/v1"]);
  assert.ok(D.dcValid(D.dcNorm(D.DC_EXAMPLE)));   // das Beispiel in den Meldungen ist ein möglicher Code
});

test("draftcode: Eingabe normalisieren, prüfen, anzeigen (XXXX-XXXX)", () => {
  for (const [raw, norm] of [["7kqm-4xwp", "7KQM4XWP"], [" 7KQM 4XWP ", "7KQM4XWP"], ["7KQM–4XWP", "7KQM4XWP"], ["7-K-Q-M-4-X-W-P", "7KQM4XWP"], [null, ""], [undefined, ""], [12345678, "12345678"]])
    assert.equal(D.dcNorm(raw), norm, String(raw));
  assert.equal(html.match(/function normCode\(s\) \{ return (.*?); \}/)[1], 'String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "")');   // dieselbe Normalisierung wie beim Blatt-Code
  for (const ok of ["7KQM4XWP", "A2345678", "ABCDEFG2", "2345678Z"]) assert.equal(D.dcValid(ok), true, ok);
  for (const bad of ["", "7KQM4XW", "7KQM4XWPA", "ABCDEFGH", "23456789", "7KQM4XWI", "7KQM4XWL", "7KQM4XWO", "7KQM4XW0", "7KQM4XW1", "7kqm4xwp", "7KQM-4XW", " 7KQM4XW", null, undefined, 12345678, ["7KQM4XWP"], {}])
    assert.equal(D.dcValid(bad), false, String(bad));
  assert.equal(D.dcFmt("7KQM4XWP"), "7KQM-4XWP");
  assert.equal(D.dcFmt("K7QM4X"), "K7QM4X");   // nur 8 Zeichen werden getrennt
  assert.equal(D.dcFmt(null), "");
});

test("draftcode: neuer Code – 8 Zeichen aus dem Alphabet, mindestens ein Buchstabe und eine Ziffer, ohne Modulo-Bias", () => {
  const next = rng(20261124), count = Object.fromEntries([...D.DC_ALPHABET].map((c) => [c, 0])), seen = new Set();
  for (let k = 0; k < 4000; k++) {
    const c = D.dcNew(next);
    assert.ok(D.dcValid(c), c);
    seen.add(c);
    for (const ch of c) count[ch]++;
  }
  assert.ok(seen.size > 3990);   // praktisch keine Wiederholungen
  // jedes Zeichen etwa gleich oft (32 000 Zeichen / 31 ≈ 1032; Codes ohne Buchstabe bzw. Ziffer entfallen, das verschiebt kaum)
  for (const [ch, n] of Object.entries(count)) assert.ok(n > 850 && n < 1220, ch + " " + n);
  // Bytes ab 248 (= 8 × 31) werden verworfen, nie auf die ersten 8 Zeichen des Alphabets abgebildet
  const feed = (bytes) => { let k = 0; return (n) => { const u = new Uint8Array(n); for (let x = 0; x < n; x++) u[x] = bytes[k++ % bytes.length]; return u; }; };
  assert.equal(D.dcNew(feed([255, 250, 248, 0, 249, 23, 31, 54, 247, 1, 2, 3])), "A2A29BCD");   // 0→A, 23→2, 31→A, 54→2, 247→9, 1→B, 2→C, 3→D
  // nur Buchstaben bzw. nur Ziffern: neu gewürfelt, bis beides vorkommt
  assert.equal(D.dcNew(feed([0, 1, 2, 3, 4, 5, 6, 7, 0, 0, 0, 0, 0, 0, 0, 0, 23, 24, 25, 26, 27, 28, 29, 30, 23, 23, 23, 23, 23, 23, 23, 23, 0, 23, 1, 24, 2, 25, 3, 26])), "A2B3C4D5");
  // im Skript: echte Zufallsbytes (crypto.getRandomValues), nie Math.random
  assert.ok(html.includes("if (!S.saveCode) { S.saveCode = dcNew(rand); saveDraft(); }"));
  assert.ok(html.includes("function rand(n) { const u = new Uint8Array(n); crypto.getRandomValues(u); return u; }"));
  assert.doesNotMatch(block, /Math\.random/);
});

test("draftcode: Angaben im Zwischenstand – Code nur in gültiger Form, Zeitpunkte nur zusammen und plausibel", () => {
  const ok = { saveCode: "7KQM4XWP", savedOnlineAt: AT, savedOnlineUntil: UNTIL };
  assert.deepEqual(D.dcState(ok), { code: "7KQM4XWP", at: AT, until: UNTIL });
  assert.deepEqual(D.dcState({ saveCode: "7KQM4XWP" }), { code: "7KQM4XWP", at: 0, until: 0 });   // Code erzeugt, online noch nie gesichert
  for (const bad of [null, undefined, "7KQM4XWP", 5, [], {}, { saveCode: "7kqm4xwp" }, { saveCode: "7KQM-4XWP" }, { saveCode: "ABCDEFGH" }, { saveCode: 12345678 }, { saveCode: ["7KQM4XWP"] }, { savedOnlineAt: AT, savedOnlineUntil: UNTIL }])
    assert.deepEqual(D.dcState(bad), { code: "", at: 0, until: 0 }, JSON.stringify(bad));
  for (const t of [{ savedOnlineAt: AT }, { savedOnlineUntil: UNTIL }, { savedOnlineAt: UNTIL, savedOnlineUntil: AT }, { savedOnlineAt: AT, savedOnlineUntil: AT }, { savedOnlineAt: String(AT), savedOnlineUntil: UNTIL },
    { savedOnlineAt: AT + 0.5, savedOnlineUntil: UNTIL }, { savedOnlineAt: -1, savedOnlineUntil: UNTIL }, { savedOnlineAt: AT, savedOnlineUntil: Infinity }, { savedOnlineAt: NaN, savedOnlineUntil: UNTIL }])
    assert.deepEqual(D.dcState({ saveCode: "7KQM4XWP", ...t }), { code: "7KQM4XWP", at: 0, until: 0 }, JSON.stringify(t));
  // so schreibt draftRecord sie: ohne Code nichts, ohne gelungenes Online-Sichern nur der Code
  assert.deepEqual(D.dcOut("", 0, 0), {});
  assert.deepEqual(D.dcOut("", AT, UNTIL), {});
  assert.deepEqual(D.dcOut("kaputt", AT, UNTIL), {});
  assert.deepEqual(D.dcOut("7KQM4XWP", 0, 0), { saveCode: "7KQM4XWP" });
  assert.deepEqual(D.dcOut("7KQM4XWP", AT, 0), { saveCode: "7KQM4XWP" });
  assert.deepEqual(D.dcOut("7KQM4XWP", AT, UNTIL), ok);
  assert.deepEqual(D.dcState(D.dcOut("7KQM4XWP", AT, UNTIL)), { code: "7KQM4XWP", at: AT, until: UNTIL });
  // Antwort des Servers (PUT /api/draft, POST /api/draft/load)
  assert.deepEqual(D.dcTimes({ ok: true, savedAt: AT, expiresAt: UNTIL, days: 30 }), { at: AT, until: UNTIL });
  for (const bad of [null, undefined, {}, { savedAt: AT }, { expiresAt: UNTIL }, { savedAt: UNTIL, expiresAt: AT }, { savedAt: "1", expiresAt: "2" }, { savedAt: 0, expiresAt: UNTIL }])
    assert.equal(D.dcTimes(bad), null, JSON.stringify(bad));
  // im Skript: draftRecord schreibt sie, cleanDraft und openEditor lesen sie nur über dcState
  assert.ok(body("function draftRecord() {", "\n}\n").includes("...dcOut(S.saveCode, S.savedOnlineAt, S.savedOnlineUntil) };"));
  const clean = body("function cleanDraft(o) {", "\n}\n");
  assert.ok(clean.includes("const dc = dcState(o);"));
  assert.ok(clean.includes("saveCode: dc.code, savedOnlineAt: dc.at, savedOnlineUntil: dc.until,"));
  const ed = body("async function openEditor(fromPerson) {", "\n}\n");
  assert.ok(ed.includes("const dc = dcState(d);\n      S.saveCode = dc.code; S.savedOnlineAt = dc.at; S.savedOnlineUntil = dc.until;"));
  assert.ok(!ed.includes("d.saveCode"));   // nie ungeprüft
});

test("draftcode: Ableitung – PBKDF2-HMAC-SHA256 (600 000) und HKDF-SHA256 wie festgelegt (gegen node:crypto), Schlüssel nicht exportierbar", async () => {
  const code = "7KQM4XWP";
  const master = pbkdf2Sync(Buffer.from("feibeitsblatt/draft/v1|" + code, "utf8"), Buffer.from("feibeitsblatt/draft/v1", "utf8"), 600000, 32, "sha256");
  const id = Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), Buffer.from("feibeitsblatt/draft/id/v1", "utf8"), 32)).toString("hex");
  const raw = Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), Buffer.from("feibeitsblatt/draft/enc/v1", "utf8"), 32));
  // leeres Salt = 32 Nullbytes (RFC 5869)
  assert.equal(Buffer.from(hkdfSync("sha256", master, Buffer.alloc(32), Buffer.from("feibeitsblatt/draft/id/v1", "utf8"), 32)).toString("hex"), id);
  const k = await D.dcDerive(subtle, code);
  assert.equal(k.id, id);
  assert.match(k.id, /^[0-9a-f]{64}$/);
  assert.equal(validateDraftId(k.id), k.id);   // so nimmt sie der Server an
  assert.equal(k.key.type, "secret");
  assert.equal(k.key.extractable, false);
  assert.deepEqual(k.key.algorithm, { name: "AES-GCM", length: 256 });
  assert.deepEqual([...k.key.usages].sort(), ["decrypt", "encrypt"]);
  await assert.rejects(subtle.exportKey("raw", k.key));
  // der abgeleitete Schlüssel ist genau der aus node:crypto: ein Umschlag lässt sich damit dort öffnen
  const rec = { v: 1, kind: "feibeitsblatt-draft", answers: ["Größe – „x“ 😀"] };
  const env = await D.dcSeal(subtle, k.key, rec, rnd);
  const ct = Buffer.from(env.ct, "base64"), dec = createDecipheriv("aes-256-gcm", raw, Buffer.from(env.iv, "base64"));
  dec.setAuthTag(ct.subarray(ct.length - 16));
  assert.deepEqual(JSON.parse(Buffer.concat([dec.update(ct.subarray(0, ct.length - 16)), dec.final()]).toString("utf8")), rec);
  // ein anderer Code: andere Kennung, anderer Schlüssel; ungültige Codes werden nie abgeleitet
  const k2 = await D.dcDerive(subtle, "7KQM4XWQ");
  assert.notEqual(k2.id, k.id);
  await assert.rejects(D.dcOpen(subtle, k2.key, env));
  for (const bad of ["", "7kqm4xwp", "7KQM-4XWP", "K7QM4X", null]) await assert.rejects(D.dcDerive(subtle, bad), /Code/);
  // im Skript: je Code im Arbeitsspeicher gemerkt (PBKDF2 dauert), ein Fehlschlag nicht
  const keys = body("function draftKeys(code) {", "\n}\n");
  assert.ok(keys.includes("p = dcDerive(subtle, code);"));
  assert.ok(keys.includes("dcKeyCache.set(code, p);"));
  assert.ok(keys.includes("p.catch(() => { if (dcKeyCache.get(code) === p) dcKeyCache.delete(code); });"));
});

test("draftcode: Umschlag {v:1, iv, ct} – hin und zurück, vom Server angenommen, falscher Schlüssel und veränderte Daten scheitern", async () => {
  const k = await D.dcDerive(subtle, "A2B3C4D5");
  const rec = { v: 1, kind: "feibeitsblatt-draft", code: "K7QM4X", sheetTitle: "Titel", person: { vorname: "Uma", nachname: "Re", geburtsdatum: "--06-11", klasse: "7c" },
    t: AT, answers: ["Antwort mit Umlauten: äöüß – „Zitat“", "", "😀"], first: null, feedback: null, saveCode: "A2B3C4D5" };
  const env = await D.dcSeal(subtle, k.key, rec, rnd);
  assert.deepEqual(Object.keys(env), ["v", "iv", "ct"]);
  assert.equal(env.v, 1);
  assert.match(env.iv, /^[A-Za-z0-9+/]{16}$/);   // 12 Byte
  assert.match(env.ct, /^[A-Za-z0-9+/]+={0,2}$/);
  assert.deepEqual(await D.dcOpen(subtle, k.key, env), rec);
  assert.deepEqual(await D.dcOpen(subtle, k.key, JSON.parse(JSON.stringify(env))), rec);
  // der Server nimmt genau diese Form (und speichert sie unverändert als JSON-Text); kein Klartext, kein Name, kein Code im Umschlag
  const stored = validateDraftEnvelope(env);
  assert.deepEqual(JSON.parse(stored), env);
  // (kurze Wörter wie ein Kürzel können in zufälligem Base64 zufällig vorkommen – geprüft werden längere bzw. solche mit Zeichen außerhalb von Base64)
  for (const plain of ["Antwort", "vorname", "K7QM4X", "A2B3C4D5", "--06-11", "„Zitat“", "klasse"]) assert.ok(!stored.includes(plain), plain);
  // jedes Sichern mit neuem iv: derselbe Datensatz ergibt einen anderen Umschlag
  const env2 = await D.dcSeal(subtle, k.key, rec, rnd);
  assert.notEqual(env2.iv, env.iv); assert.notEqual(env2.ct, env.ct);
  // verändert, vertauscht, falsche Form → wirft (die Seite meldet dann „lässt sich nicht lesen“)
  const flip = (s) => (s[0] === "A" ? "B" : "A") + s.slice(1);
  for (const bad of [null, undefined, "x", {}, { ...env, v: 2 }, { ...env, v: "1" }, { v: 1, iv: env.iv }, { v: 1, ct: env.ct }, { ...env, iv: env.iv + "AAAA" }, { ...env, iv: "AAAA" }, { ...env, iv: env.iv.replace(/.$/, "!") },
    { ...env, ct: flip(env.ct) }, { ...env, iv: flip(env.iv) }, { ...env, ct: env.ct.slice(0, -4) }, { ...env, ct: "" }, { ...env, ct: 5 }, { ...env, ct: env2.ct }])
    await assert.rejects(D.dcOpen(subtle, k.key, bad), undefined, String(JSON.stringify(bad)).slice(0, 60));
  // kein JSON darin → wirft ebenfalls
  const iv = rnd(12), junk = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, k.key, new TextEncoder().encode("kein JSON")));
  await assert.rejects(D.dcOpen(subtle, k.key, { v: 1, iv: D.dcB64(iv), ct: D.dcB64(junk) }));
  // Größe wie der Server misst (JSON-Text des Umschlags): Abgabe-Grenze, bei Blättern mit Foto-Aufgabe die größere
  assert.equal(D.dcEnvFits(env, LIMITS.envelopeBytes), true);
  const big = { v: 1, iv: env.iv, ct: "A".repeat(LIMITS.envelopeBytes) };
  assert.equal(D.dcEnvFits(big, LIMITS.envelopeBytes), false);
  assert.throws(() => validateDraftEnvelope(big), (e) => e.status === 413 && e.code === "too_large");
  assert.equal(D.dcEnvFits(big, LIMITS.photoEnvelopeBytes), true);
  // an der Grenze entscheiden Browser und Server gleich (ct in Vierergruppen: gültiges Base64)
  const room = LIMITS.envelopeBytes - JSON.stringify({ v: 1, iv: env.iv, ct: "" }).length, n4 = room - (room % 4);
  const edge = { v: 1, iv: env.iv, ct: "A".repeat(n4) }, over = { v: 1, iv: env.iv, ct: "A".repeat(n4 + 4) };
  assert.equal(D.dcEnvFits(edge, LIMITS.envelopeBytes), true);
  assert.ok(validateDraftEnvelope(edge).length <= LIMITS.envelopeBytes);
  assert.equal(D.dcEnvFits(over, LIMITS.envelopeBytes), false);
  assert.throws(() => validateDraftEnvelope(over), (e) => e.status === 413 && e.code === "too_large");
  assert.equal(D.dcEnvFits(null, 10), false);
  // Base64-Helfer: Standard-Base64 wie im übrigen Skript
  assert.equal(D.dcB64(new Uint8Array([251, 255, 254])), "+//+");
  assert.deepEqual([...D.dcUnB64("+//+")], [251, 255, 254]);
  for (const bad of ["", "abc", "ab=c", "a b=", "-_8=", null, 5]) assert.throws(() => D.dcUnB64(bad));
  const long = rng(7)(100000);
  assert.deepEqual(D.dcUnB64(D.dcB64(long)), long);
});

test("draftcode: Texte – Code sichtbar im Schreibbereich, Statuszeile, Meldungen der Startseite, Dialoge; nichts zur Tippzeit-Messung", () => {
  // dauerhaft sichtbar im Kopf des Blattes: [vor dem Code, Code (fett), danach]
  assert.deepEqual(D.dcNoteParts("7KQM4XWP", AT, UNTIL), ["Zwischenstand-Code: ", "7KQM-4XWP",
    " – online gesichert am 24.11. um 09:05 Uhr, abrufbar bis 24.12.2026. Was du danach schreibst, ist erst nach erneutem Sichern online."]);
  assert.equal(D.dcDay(new Date(2027, 0, 3, 23, 59).getTime()), "03.01.");
  assert.equal(D.dcDate(new Date(2027, 0, 3, 23, 59).getTime()), "03.01.2027");
  assert.equal(D.dcClock(new Date(2027, 0, 3, 0, 7).getTime()), "00:07");
  assert.equal(D.dcSavedText("7KQM4XWP"), "Zwischenstand online und als PDF-Datei gesichert – dein Zwischenstand-Code: 7KQM-4XWP");
  assert.equal(D.DC_BTN, "Zwischenstand sichern (online und als PDF-Datei)");
  assert.ok(html.includes('<button type="button" class="linkbtn" id="ed-pdf">' + D.DC_BTN + "</button>"));
  assert.equal(D.DC_BUSY, "Zwischenstand wird gesichert …");
  // Online-Speichern gescheitert: nur die Datei – mit dem Grund, und dass sie sich wie bisher hochladen lässt
  const fail = (code, status) => D.dcFailText(code, status);
  assert.equal(fail("network", 0), "Zwischenstand nur als PDF-Datei gesichert – online hat es nicht geklappt (keine Verbindung zum Server). Die Datei kannst du wie bisher unter „Zwischenstand-PDF hochladen“ hochladen.");
  for (const [code, status, why] of [["timeout", 0, "keine Verbindung zum Server"], ["too_large", 413, "der Zwischenstand ist dafür zu groß"], ["http_413", 413, "der Zwischenstand ist dafür zu groß"],
    ["rate_limited", 429, "gerade kommen zu viele Anfragen aus diesem Netz"], ["http_429", 429, "gerade kommen zu viele Anfragen aus diesem Netz"],
    ["too_many_drafts", 409, "zu diesem Feibeitsblatt sind schon sehr viele Zwischenstände online gesichert"], ["not_found", 404, "dieses Feibeitsblatt gibt es auf dem Server nicht mehr"],
    ["crypto", 0, "dieser Browser konnte ihn nicht verschlüsseln"], ["server_error", 500, "der Server hat ihn nicht angenommen"], ["bad_envelope", 400, "der Server hat ihn nicht angenommen"], ["http_502", 502, "der Server hat ihn nicht angenommen"]])
    assert.equal(D.dcFailReason(code, status), why, code);
  // Startseite
  assert.equal(D.DC_LEN_ERR, "Ein Code hat 6 Zeichen (z. B. K7Q-M4X), ein Zwischenstand-Code 8 (z. B. 7KQM-4XWP). Bitte prüfe deine Eingabe.");
  assert.equal(D.DC_BAD, "Diesen Zwischenstand-Code gibt es nicht. Bitte prüfe den Code. (In Codes kommen I, L, O, 0 und 1 nicht vor.)");
  assert.equal(D.DC_NOT_FOUND, "Zu diesem Zwischenstand-Code ist kein Zwischenstand gespeichert (mehr). Prüfe den Code – online gesicherte Zwischenstände werden 30 Tage nach dem letzten Sichern gelöscht. " +
    "Hast du die Zwischenstand-PDF noch, lade sie unter „Zwischenstand-PDF hochladen“ hoch.");
  assert.equal(D.DC_BROKEN, "Der online gesicherte Zwischenstand zu diesem Code lässt sich nicht lesen. Hast du die Zwischenstand-PDF noch, lade sie unter „Zwischenstand-PDF hochladen“ hoch.");
  assert.equal(D.DC_LOADING, "Dein online gesicherter Zwischenstand wird geladen …");
  assert.equal(D.DC_LOADED, "Online gesicherten Zwischenstand übernommen");
  assert.equal(D.dcNewerText("24.11.2026, 10:00", "24.11.2026, 09:05"),
    "Auf diesem Gerät liegt schon ein Zwischenstand von 24.11.2026, 10:00 Uhr; der online gesicherte Stand ist von 24.11.2026, 09:05 Uhr. Welchen Stand möchtest du verwenden?");
  assert.equal(D.DC_NEWER_OK, "Online gesicherten Stand");
  // „Abbrechen und Zwischenstand von diesem Gerät löschen“: der online gesicherte Stand bleibt – der Dialog sagt es (mit Code und Frist)
  assert.equal(D.dcCancelText("7KQM4XWP", AT, UNTIL), " Dein online gesicherter Zwischenstand (Stand vom 24.11. um 09:05 Uhr) wird dabei nicht gelöscht: Mit deinem Zwischenstand-Code 7KQM-4XWP kannst du ihn bis zum 24.12.2026 auf der Startseite wieder laden.");
  // Zwischenstand-PDF
  assert.equal(D.dcPdfHead("7KQM4XWP"), "Zwischenstand-Code: 7KQM-4XWP");
  assert.equal(D.dcPdfLine(UNTIL), "Mit diesem Code lädst du diesen Zwischenstand bis zum 24.12.2026 auf der Startseite von Feibeitsblatt wieder – ohne die Datei hochzuladen. Gib ihn dort in das Feld „Code“ ein.");
  assert.match(D.dcPdfSecret(false), /^Die Datei enthält deine Antworten lesbar und deinen Zwischenstand-Code: Wer den Code kennt, kann deinen online gesicherten Zwischenstand laden\. Gib Datei und Code nicht weiter/);
  assert.match(D.dcPdfSecret(true), /^Die Datei enthält deine Antworten lesbar – auch deine Fotos – und deinen Zwischenstand-Code: /);
  assert.match(D.dcPdfFresh(AT), /^Online liegt der Stand vom 24\.11\.2026, 09:05 Uhr – was du danach schreibst, erst nach erneutem Sichern\. .*Dein Zwischenstand-Code bleibt derselbe, eine ältere Datei enthält nur den älteren Stand\.$/);
  assert.match(D.DC_PDF_UPLOAD, /^Diese Datei kannst du weiterhin hochladen/);
  // an sichtbaren Stellen kein Wort zur Tippzeit-Messung (dort steht nur der eine Satz der Kurzfassung); du-Form; echte Anführungszeichen
  const all = [D.dcNoteParts("7KQM4XWP", AT, UNTIL).join(""), D.dcSavedText("7KQM4XWP"), fail("network", 0), fail("too_large", 413), fail("rate_limited", 429), fail("too_many_drafts", 409), fail("not_found", 404),
    fail("crypto", 0), fail("x", 500), D.DC_BTN, D.DC_BUSY, D.DC_LEN_ERR, D.DC_BAD, D.DC_NOT_FOUND, D.DC_BROKEN, D.DC_LOADING, D.DC_LOADED, D.dcNewerText("a", "b"), D.DC_NEWER_OK, D.dcCancelText("7KQM4XWP", AT, UNTIL),
    D.dcPdfHead("7KQM4XWP"), D.dcPdfLine(UNTIL), D.dcPdfSecret(true), D.dcPdfFresh(AT), D.DC_PDF_UPLOAD];
  for (const x of all) {
    assert.doesNotMatch(x, NO_TT, x);
    assert.doesNotMatch(x, /\b(ihr|euer|eure\w*|euch|Sie|Ihre\w*)\b/, x);
    assert.doesNotMatch(x, /["']|Server in der EU/, x);
  }
  // Startseite im HTML: Untertitel, Hinweis unter dem Feld, Hinweis unter „Zwischenstand-PDF hochladen“
  assert.ok(html.includes('<p class="sub">Gib den Code ein, den du von deiner Lehrkraft bekommen hast – oder deinen Zwischenstand-Code.</p>'));
  assert.ok(html.includes('<p class="fhint" id="code-hint">6 Zeichen, z. B. K7Q-M4X. Dein Zwischenstand-Code (8 Zeichen, steht oben in deiner Zwischenstand-PDF) gehört auch hierher.</p>'));
  assert.ok(html.includes('<p class="fhint">Am einfachsten gibst du oben deinen Zwischenstand-Code ein. Ohne Code kannst du hier die PDF-Datei hochladen, mit der du deinen Zwischenstand gesichert hast, und weiterarbeiten. Kommst du aus einem Escape-Room, lade hier deine Überblick-PDF hoch.</p>'));
  assert.ok(html.includes('<p class="notebox hidden" id="draft-code" role="status"></p>'));
  assert.ok(!html.includes("Zwischenstand als PDF-Datei sichern"));   // der Knopf heißt nirgends mehr so
});

/* Startseite mit nachgebauter Umgebung: Zwischenstand-Code → Kennung ableiten → POST /api/draft/load → entschlüsseln → cleanDraft (das echte,
   aus den reinen Blöcken) → derselbe Weg wie eine hochgeladene Zwischenstand-PDF (openLoadedDraft). Der Server ist eine Attrappe mit den
   Prüfungen aus worker/lib.js. */
const blk = (n) => { const a = html.indexOf("/* " + n + ":BEGIN"), b = html.indexOf("/* " + n + ":END */", a); assert.ok(a > 0 && b > a, n); return html.slice(a, b); };
const START_SRC = body("const dcKeyCache = new Map();", "// → true, wenn danach der Schreibbereich offen ist; sonst steht die Meldung auf der Startseite\nasync function loadDraftByCode(") +
  fnSrc("async function loadDraftByCode(code8) {") + fnSrc("async function openLoadedDraft(d, run, src) {");
function fakeServer() {
  const rows = new Map(), log = [];
  const fail = (status, code) => Object.assign(new Error(code), { status, code });
  return { rows, log,
    put(id, code, envelope, now) { rows.set(validateDraftId(id), { code, data: validateDraftEnvelope(envelope), savedAt: now }); },
    async api(method, path, opts) {
      log.push({ method, path, body: JSON.parse(JSON.stringify(opts.body)) });
      if (this.error) throw this.error;
      assert.equal(method + " " + path, "POST /api/draft/load");
      const row = rows.get(validateDraftId(opts.body.id));
      if (!row) throw fail(404, "draft_not_found");
      return { ok: true, code: row.code, savedAt: row.savedAt, expiresAt: row.savedAt + 30 * 864e5, days: 30, envelope: JSON.parse(row.data) };
    } };
}
function startHarness(server, o = {}) {
  return new Function("o", "server", "subtle", `
let screen = "screen-start";
const S = {}, ESC = { run: 0 }, els = {}, log = [];
const $ = (id) => els[id] || (els[id] = { id, textContent: "", value: "x", classList: { add() {}, remove() {} }, focus() {} });
const td = new TextDecoder(), te = new TextEncoder();
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/, ATTEMPT_RE = /^[0-9a-f]{16}$/, DAY_RE = /^\\d{4}-\\d{2}-\\d{2}$/, MAX_ANSWER = 8000;
function normCode(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
class ApiError extends Error { constructor(code, serverMsg, status) { super(code); this.code = code; this.status = status || 0; } }
const api = async (m, p, opts) => { try { return await server.api(m, p, opts); } catch (e) { throw e instanceof ApiError ? e : new ApiError(e.code || "network", "", e.status); } };
${blk("BDAY")}${blk("GROUP")}${blk("ESCAPE")}${blk("DRAFTCODE")}${blk("TYPING")}${blk("PHOTO")}${blk("FBTASK")}
${fnSrc("function normFb(r) {")}${fnSrc("function cleanDraft(o) {")}
const busy = () => {}, setStatus = (el, text, kind) => { el.textContent = text; log.push("status:" + kind + ":" + text); }, fmtDT = (t) => "T" + t;
const showResume = () => log.push("showResume");
const escDrop = () => { ESC.run++; };
const resetStudent = () => { log.push("resetStudent"); screen = "screen-start"; };
const fetchSheet = async (code) => { log.push("fetch:" + code); if (o.fetchError) throw o.fetchError; return { code, sheet: o.sheet || { tasks: [{}, {}], escape: null } }; };
const useSheet = (x) => { S.code = x.code; S.sheet = x.sheet; };
const escFromHull = () => null;
const draftRaw = async () => (o.local ? JSON.stringify(o.local) : null);
const askConfirm = (opts) => { log.push("ask:" + opts.title + "|" + opts.text + "|" + opts.ok + "|" + opts.cancel); if (o.onAsk) o.onAsk(ESC); return Promise.resolve(o.answer); };
const openEditor = async () => { log.push("openEditor"); screen = "screen-editor"; };
const startErr = (e) => "START " + e.code;
const NO_CRYPTO = "KEINE KRYPTO", ESC_NEED = "ESC NÖTIG";
${START_SRC}
return { loadDraftByCode, draftKeys, ESC, state: () => ({ screen, err: $("start-err").textContent, status: $("start-status").textContent, log, S, cached: dcKeyCache.size }) };`)(o, server, subtle);
}
const PERSON = { vorname: "Uma", nachname: "Re", geburtsdatum: "--06-11", klasse: "7c" };
const REC = (x) => ({ v: 1, t: 1000, kind: "feibeitsblatt-draft", code: "K7QM4X", sheetTitle: "Titel", person: PERSON, answers: ["Erste Antwort", ""], first: null, feedback: null, attempt: "0123456789abcdef", ...x });
async function stored(server, code8, rec, now = AT, sheet = "K7QM4X") {
  const k = await D.dcDerive(subtle, code8);
  server.put(k.id, sheet, await D.dcSeal(subtle, k.key, rec, rnd), now);
  return k.id;
}

test("draftcode: Startseite – der Zwischenstand-Code lädt genau diesen Stand (an den Server geht nur die Kennung), danach derselbe Weg wie eine Zwischenstand-PDF", async () => {
  const server = fakeServer(), code8 = "7KQM4XWP";
  const id = await stored(server, code8, REC({ saveCode: code8 }));
  let h = startHarness(server);
  assert.equal(await h.loadDraftByCode(code8), true);
  let st = h.state();
  assert.equal(st.screen, "screen-editor");
  assert.equal(st.err, "");
  // genau eine Anfrage: POST /api/draft/load {id} – 64 Hex, nie der Code, kein Name
  assert.deepEqual(server.log, [{ method: "POST", path: "/api/draft/load", body: { id } }]);
  assert.match(id, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(server.log).includes(code8));
  // der Stand, sein Code und die Zeitpunkte des Servers gehen an openEditor (S.importDraft – geprüft von cleanDraft)
  assert.deepEqual(st.S.importDraft.answers, ["Erste Antwort", ""]);
  assert.deepEqual(st.S.person, PERSON);
  assert.equal(st.S.importDraft.attempt, "0123456789abcdef");
  assert.deepEqual([st.S.importDraft.saveCode, st.S.importDraft.savedOnlineAt, st.S.importDraft.savedOnlineUntil], [code8, AT, AT + 30 * 864e5]);
  assert.equal(st.S.importFrom, "code");
  assert.deepEqual(st.S.importCode, { code: code8, at: AT, until: AT + 30 * 864e5 });
  assert.deepEqual(st.log.filter((x) => /^(fetch|openEditor|status)/.test(x)), ["status:busy:" + D.DC_LOADING, "status::", "fetch:K7QM4X", "openEditor"]);
  assert.equal(st.status, "");
  // steht im Datensatz kein oder ein anderer Code, gilt trotzdem der eingegebene (unter ihm liegt der Stand)
  for (const inner of [{}, { saveCode: "A2B3C4D5" }, { saveCode: "kaputt" }]) {
    const s2 = fakeServer();
    await stored(s2, code8, REC(inner));
    h = startHarness(s2);
    assert.equal(await h.loadDraftByCode(code8), true);
    assert.equal(h.state().S.importDraft.saveCode, code8);
  }
  // Ableitung je Code nur einmal (im Arbeitsspeicher gemerkt)
  h = startHarness(server);
  const p1 = h.draftKeys(code8), p2 = h.draftKeys(code8);
  assert.equal(p1, p2);
  assert.equal((await p1).id, id);
  assert.equal(h.state().cached, 1);
});

test("draftcode: Startseite – falscher Code, gelöschter oder beschädigter Stand, anderes Blatt, Netz: Meldung auf der Startseite, nichts geöffnet", async () => {
  const code8 = "7KQM4XWP";
  const check = async (server, o, code, msg, requests) => {
    const h = startHarness(server, o);
    assert.notEqual(await h.loadDraftByCode(code), true, msg);
    const st = h.state();
    assert.equal(st.err, msg);
    assert.equal(st.screen, "screen-start");
    assert.ok(!st.log.includes("openEditor"));
    assert.equal(st.status, "");   // „wird geladen …“ bleibt nicht stehen
    assert.equal(server.log.length, requests, msg);
    return st;
  };
  // kein möglicher Code (I, L, O, 0, 1; nur Buchstaben): keine Anfrage
  for (const bad of ["7KQM4XWI", "7KQM4XW0", "ABCDEFGH"]) await check(fakeServer(), {}, bad, D.DC_BAD, 0);
  // unbekannt (nie gesichert, nach 30 Tagen, nach der Abgabe oder mit dem Blatt gelöscht)
  let server = fakeServer();
  await stored(server, code8, REC());
  await check(server, {}, "7KQM4XWQ", D.DC_NOT_FOUND, 1);
  // der Server antwortet 404 ohne den Code (älterer Worker ohne die Route): dieselbe Meldung
  server = fakeServer(); server.error = Object.assign(new Error("x"), { status: 404, code: "not_found" });
  await check(server, {}, code8, D.DC_NOT_FOUND, 1);
  // zu viele Fehlversuche aus diesem Netz, Netzfehler: die übliche Meldung
  server = fakeServer(); server.error = Object.assign(new Error("x"), { status: 429, code: "rate_limited" });
  await check(server, {}, code8, "START rate_limited", 1);
  server = fakeServer(); server.error = Object.assign(new Error("x"), { code: "network" });
  await check(server, {}, code8, "START network", 1);
  // Umschlag mit einem anderen Schlüssel verschlüsselt bzw. verändert: lässt sich nicht lesen
  server = fakeServer();
  const k = await D.dcDerive(subtle, code8), other = await D.dcDerive(subtle, "A2B3C4D5");
  server.put(k.id, "K7QM4X", await D.dcSeal(subtle, other.key, REC(), rnd), AT);
  await check(server, {}, code8, D.DC_BROKEN, 1);
  // entschlüsselbar, aber kein Zwischenstand (cleanDraft lehnt ab) bzw. für ein anderes Blatt, als der Server nennt
  for (const [rec, sheet] of [[{ irgendwas: 1 }, "K7QM4X"], [REC({ kind: "feibeitsblatt-sheet" }), "K7QM4X"], [REC({ person: { vorname: "x" } }), "K7QM4X"], [REC(), "A2B3C4"]]) {
    server = fakeServer();
    server.put(k.id, sheet, await D.dcSeal(subtle, k.key, rec, rnd), AT);
    await check(server, {}, code8, D.DC_BROKEN, 1);
  }
  // das Blatt passt nicht (andere Aufgabenzahl) bzw. ist nicht ladbar
  server = fakeServer(); await stored(server, code8, REC());
  let st = await check(server, { sheet: { tasks: [{}], escape: null } }, code8, "Der Zwischenstand passt nicht zu diesem Feibeitsblatt (andere Anzahl Aufgaben). Bitte frag deine Lehrkraft.", 1);
  assert.ok(st.log.includes("resetStudent"));
  server = fakeServer(); await stored(server, code8, REC());
  await check(server, { fetchError: Object.assign(new Error("weg"), { code: "not_found" }) }, code8, "START not_found", 1);
  // Finale eines Escape-Rooms ohne Daten aus dem Raum im Stand
  server = fakeServer(); await stored(server, code8, REC());
  await check(server, { sheet: { tasks: [{}, {}], escape: { id: "raum", name: "Raum" } } }, code8, "ESC NÖTIG", 1);
});

test("draftcode: Startseite – neuerer Stand auf dem Gerät: Rückfrage wie bei der PDF-Datei; der Code gilt auch für den Stand des Geräts; ein anderer Weg währenddessen gewinnt", async () => {
  const code8 = "7KQM4XWP", local = { v: 1, t: 2000, answers: ["a", "später auf dem Gerät"] };
  for (const [answer, imported] of [[true, true], [false, false], [null, false]]) {
    const server = fakeServer(); await stored(server, code8, REC({ saveCode: code8 }));
    const h = startHarness(server, { local, answer });
    assert.equal(await h.loadDraftByCode(code8), true, String(answer));
    const st = h.state();
    assert.ok(st.log.includes("ask:Neuerer Zwischenstand auf diesem Gerät|" + D.dcNewerText("T2000", "T1000") + "|" + D.DC_NEWER_OK + "|Neueren Stand von diesem Gerät"), st.log.join("\n"));
    assert.equal(st.S.importDraft === null, !imported);
    assert.equal(st.S.importFrom, imported ? "code" : "");
    assert.deepEqual(st.S.importCode, { code: code8, at: AT, until: AT + 30 * 864e5 });   // openEditor übernimmt ihn, wenn der Stand des Geräts keinen hat
  }
  // älterer Stand auf dem Gerät: keine Rückfrage
  let server = fakeServer(); await stored(server, code8, REC());
  let h = startHarness(server, { local: { ...local, t: 500 } });
  assert.equal(await h.loadDraftByCode(code8), true);
  assert.ok(!h.state().log.some((x) => x.startsWith("ask:")));
  // Widerspruch gegen die Tippzeit-Messung im Stand dieses Geräts gilt weiter (ttKeepOptOut), auch mit dem online gesicherten Stand
  server = fakeServer(); await stored(server, code8, REC());
  h = startHarness(server, { local: { v: 1, t: 500, answers: ["a", ""], ttOptOut: true } });
  assert.equal(await h.loadDraftByCode(code8), true);
  assert.equal(h.state().S.importDraft.ttOptOut, true);
  // während der Rückfrage ein anderer Weg von der Startseite: nichts geöffnet
  server = fakeServer(); await stored(server, code8, REC());
  h = startHarness(server, { local, answer: true, onAsk: (esc) => { esc.run++; } });
  assert.notEqual(await h.loadDraftByCode(code8), true);
  assert.ok(!h.state().log.includes("openEditor"));
  // … ebenso während der Server antwortet: die späte Antwort ändert nichts (keine Meldung, kein Blatt)
  server = fakeServer(); await stored(server, code8, REC());
  h = startHarness(server);
  const orig = server.api.bind(server);
  server.api = async (...a) => { const r = await orig(...a); h.ESC.run++; return r; };
  assert.notEqual(await h.loadDraftByCode(code8), true);
  assert.deepEqual(h.state().log.filter((x) => /^(fetch|openEditor)/.test(x)), []);
  assert.equal(h.state().err, "");
});

/* Zwischenstand-PDF: makeDraftPdf aus index.html mit den Bausteinen, die sie braucht */
const PDF = new Function(`
const te = new TextEncoder();
const pad2 = (n) => String(n).padStart(2, "0");
${body("function toDate(v) {", "/* ---------- Geburtstag ohne Jahr")}
function fmtCode(c) { c = String(c || ""); return c.length === 6 ? c.slice(0, 3) + "-" + c.slice(3) : c; }
const isGroup = (p) => !!(p && Array.isArray(p.gruppe));
const personLabel = (p) => (isGroup(p) ? p.gruppe.join(", ") + " · Klasse " + p.klasse : p.vorname + " · " + p.nachname + " · Klasse " + p.klasse);
const PUBLIC_URL = "https://feibeitsblatt.janrickmer.de/", FB_NOT_DONE = "Anfrage nicht abgeschlossen";
${block}${blk("FBTASK")}
${body("const PDF_W_REG = ", "/* PDF-Leser (Zwischenstand")}
return { makeDraftPdf };`)();
const pdfText = (u) => Buffer.from(u).toString("latin1");
const pdfOps = (s) => [...s.matchAll(/BT ([\d. ]+) rg \/(F[12]) ([\d.]+) Tf ([\d.]+) ([\d.]+) Td \((.*?)\) Tj ET/g)].map((m) => ({ color: m[1], font: m[2], size: Number(m[3]), x: Number(m[4]), y: Number(m[5]), text: m[6] }));
const pdfDraft = (u) => { const b = Buffer.from(u), i0 = b.indexOf("/FbDraft 1"), d0 = b.indexOf("stream\n", i0) + 7, d1 = b.indexOf("\nendstream", d0); return JSON.parse(b.subarray(d0, d1).toString("utf8")); };
// Aufbau: jede Stelle der Querverweistabelle zeigt auf ihr Objekt
function pdfXrefOk(u) {
  const s = pdfText(u), x = Number(s.match(/startxref\n(\d+)\n%%EOF\n$/)[1]);
  assert.ok(s.startsWith("xref\n0 11\n", x));
  const offs = s.slice(x).split("\n").slice(3, 13).map((l) => Number(l.slice(0, 10)));
  offs.forEach((o, k) => assert.ok(s.startsWith(`${k + 1} 0 obj\n`, o), "Objekt " + (k + 1)));
}

test("draftcode: Zwischenstand-PDF – online gesichert: ganz oben rot und fett der Code, darunter rot die Frist; sonst wie bisher; der Datensatz bleibt hochladbar", () => {
  const rec = (x) => ({ v: 1, t: AT, kind: "feibeitsblatt-draft", code: "K7QM4X", sheetTitle: "Die wehrhafte Demokratie", person: PERSON, answers: ["a", "b", ""], first: null, feedback: null, ...x });
  const online = { code: "7KQM4XWP", at: AT, until: UNTIL };
  const d = rec({ saveCode: online.code, savedOnlineAt: AT, savedOnlineUntil: UNTIL });
  const on = PDF.makeDraftPdf(d, true, "", false, online), off = PDF.makeDraftPdf(rec({ saveCode: online.code }), true, "", false, null), old = PDF.makeDraftPdf(rec(), true, "", false);
  for (const u of [on, off, old]) {
    const s = pdfText(u);
    assert.ok(s.startsWith("%PDF-1.7"));
    assert.ok(s.includes("/Type /Pages /Kids [3 0 R] /Count 1"));   // weiter genau eine Seite
    assert.ok(s.includes("(Zwischenstand f\\374r ein Feibeitsblatt) Tj"));
    assert.ok(s.includes("(So arbeitest du weiter:) Tj"));
    assert.ok(s.includes("/A << /S /URI /URI (https://feibeitsblatt.janrickmer.de/) >>"));
    pdfXrefOk(u);
  }
  // online: die erste Textzeile ist der Code – rot (rg 0.75 0.1 0.1), fett (F2), deutlich größer als der Fließtext (11 pt) und über dem Titel
  const ops = pdfOps(pdfText(on)), RED = "0.75 0.1 0.1";
  assert.deepEqual({ ...ops[0] }, { color: RED, font: "F2", size: 20, x: 56, y: ops[0].y, text: "Zwischenstand-Code: 7KQM-4XWP" });
  const title = ops.find((o) => o.text.startsWith("Zwischenstand f"));
  assert.ok(ops[0].y > title.y && ops[0].y < 841.89 - 40);
  assert.deepEqual([title.color, title.font, title.size], ["0.1 0.1 0.1", "F2", 21]);   // danach geht es schwarz weiter
  // darunter rot der Satz mit der Frist (umbrochen), zwischen Code und Titel
  const red = ops.filter((o) => o.color === RED);
  assert.ok(red.length >= 3);
  assert.ok(red.slice(1).every((o) => o.font === "F1" && o.size === 11 && o.y < ops[0].y && o.y > title.y));
  const cp1252 = new TextDecoder("windows-1252");   // WinAnsi: Bytes außerhalb von ASCII stehen oktal in der Zeichenkette
  const plain = (t) => t.replace(/\\(\d{3})/g, (_, o) => cp1252.decode(Uint8Array.of(parseInt(o, 8)))).replace(/\\([()\\])/g, "$1");
  assert.equal(red.slice(1).map((o) => plain(o.text)).join(" "), D.dcPdfLine(UNTIL));
  assert.equal(ops.filter((o) => o.text.includes("Zwischenstand-Code: 7KQM-4XWP")).length, 1);
  // „Bitte beachte“: Datei und Code nicht weitergeben, online nur der Stand vom Sichern, die Datei bleibt hochladbar
  const all = ops.map((o) => plain(o.text)).join(" ");
  for (const x of [D.dcPdfSecret(false), D.dcPdfFresh(AT), D.DC_PDF_UPLOAD]) assert.ok(all.includes(x), x);
  assert.ok(!all.includes("Sichere nach jeder Arbeitsphase eine neue Datei"));
  // ohne Online-Speicherung (gescheitert): keine rote Zeile, kein Wort vom Code – die Datei sieht aus wie bisher
  for (const u of [off, old]) {
    const o2 = pdfOps(pdfText(u));
    assert.ok(!pdfText(u).includes(RED + " rg"));
    assert.ok(o2[0].text.startsWith("Zwischenstand f") && o2[0].y === 841.89 - 96);
    const t2 = o2.map((o) => plain(o.text)).join(" ");
    assert.ok(!/Zwischenstand-Code|online/i.test(t2), t2);
    assert.ok(t2.includes("Die Datei enthält deine Antworten lesbar. Gib sie nicht weiter und lade sie nirgendwo sonst hoch."));
    assert.ok(t2.includes("Sichere nach jeder Arbeitsphase eine neue Datei – eine ältere Datei enthält nur den älteren Stand."));
  }
  // der sichtbare Teil ohne Online-Speicherung hängt nicht am Code im Datensatz
  assert.deepEqual(pdfOps(pdfText(off)), pdfOps(pdfText(old)));
  // eingebetteter Datensatz unverändert der Zwischenstand – zusätzlich saveCode (und nach gelungenem Sichern Zeitpunkt und Frist)
  assert.deepEqual(pdfDraft(on), d);
  assert.deepEqual(pdfDraft(off), rec({ saveCode: online.code }));
  assert.deepEqual(pdfDraft(old), rec());
  assert.equal(D.dcState(pdfDraft(on)).code, online.code);
  // alles bleibt auf der einen Seite – auch im ungünstigsten Fall (langer Titel, Gruppe mit 10 Personen, Escape-Room, Fotos, Feedback zu einzelnen Aufgaben)
  const worst = PDF.makeDraftPdf(rec({ saveCode: online.code, sheetTitle: "Ein sehr langer Titel eines Feibeitsblattes, der in der Zeile ganz sicher umbrochen werden muss, weil er so lang ist", escape: { d: "{}" },
    photos: ["x", null, null], first: ["a", null, "c"], feedback: [{ covered: ["x"], missing: [] }, null, { covered: [], missing: ["y"] }], fbPending: true,
    person: { gruppe: ["MaxMu", "LiMu", "AnnBe", "TimKr", "UmaRe", "JonSc", "EvaLo", "BenHa", "MiaWe", "TomBa"], klasse: "10b" } }), true, "FastFashion – der lange Weg eines T-Shirts um die Welt", true, online);
  const wo = pdfOps(pdfText(worst)), foot = wo.find((o) => o.text.startsWith("Erstellt mit Feibeitsblatt"));
  assert.ok(wo.filter((o) => o !== foot).every((o) => o.y > foot.y + 30 && o.y < 841.89 - 40), "Text über der Fußzeile und unter dem oberen Rand");
  assert.ok(wo.map((o) => plain(o.text)).join(" ").includes(D.dcPdfSecret(true)));
  pdfXrefOk(worst);
});

test("draftcode: im Skript – online nur auf Klick; Reihenfolge auf der Startseite; nach der Abgabe wird gelöscht, bei „Abbrechen“ nicht", () => {
  // Startseite: Türcode (nur Ziffern) → 8 Zeichen = Zwischenstand-Code → 6 Zeichen = Blatt-Code; Längenfehler nennt beide
  const go = body("async function startGo() {", "\n}\n");
  const kDoor = go.indexOf("if (DOOR_RE.test(code)) return teacherDoor(code);"), kDraft = go.indexOf("if (code.length === DC_LEN) return loadDraftByCode(code);"), kLen = go.indexOf("if (code.length !== 6) { err.textContent = DC_LEN_ERR; return; }");
  assert.ok(kDoor > 0 && kDraft > kDoor && kLen > kDraft);
  assert.ok(go.indexOf("const code = normCode($(\"code-input\").value);") < kDoor);
  // an den Server geht der Zwischenstand nur aus dem Klick auf #ed-pdf (PUT), geladen wird nur von der Startseite, gelöscht nur nach der Abgabe
  assert.equal(html.split('"/api/draft"').length - 1, 2);
  assert.equal(html.split('"/api/draft/load"').length - 1, 1);
  const click = body('$("ed-pdf").addEventListener("click", async () => {', "\n});\n");
  assert.ok(click.includes('api("PUT", "/api/draft", { body: { id: k.id, code: sheetCode, envelope }, timeout: 60000 })'));   // nur Kennung, Blatt-Code, Umschlag – kein Name, nie der Zwischenstand-Code
  assert.ok(body("async function loadDraftByCode(code8) {", "\n}\n").includes('api("POST", "/api/draft/load", { body: { id: k.id }, timeout: 60000 })'));
  assert.ok(body("function dropOnlineDraft(code8) {", "\n}\n").includes('api("DELETE", "/api/draft", { body: { id: k.id } })).catch('));
  for (const f of ["function saveDraft() {", "function draftRecord() {", "async function openEditor(fromPerson) {", "function scheduleSave() {"])
    assert.doesNotMatch(body(f, f === "function scheduleSave() {" ? "\n" : "\n}\n"), /api\(|draftKeys|dcSeal|dropOnlineDraft/, f);
  // der Klick: lokal speichern → Code holen/erzeugen → verschlüsseln → PUT → PDF (mit Code nur nach gelungenem Online-Sichern) → Statuszeile
  const order = ["busy(btn, true, DC_BUSY);", "saveDraft();", "if (!S.saveCode) { S.saveCode = dcNew(rand); saveDraft(); }", "const d = Object.assign(draftRecord(), { kind: \"feibeitsblatt-draft\", code: sheetCode, sheetTitle: S.sheet.title, person: personOut(S.person) });",
    "const k = await draftKeys(code8);", "const envelope = await dcSeal(subtle, k.key, d, rand);", "if (!dcEnvFits(envelope, envMax)) throw new ApiError(\"too_large\", \"\", 413);", 'api("PUT", "/api/draft"',
    "if (dcGone.has(code8)) { if (online) dropOnlineDraft(code8); return; }", "S.savedOnlineAt = online.at; S.savedOnlineUntil = online.until; saveDraft(); renderDraftCode();",
    "makeDraftPdf(d, withAi, escName, perTask, online ? { code: code8, at: online.at, until: online.until } : null)", "if (same) setSaveState(online ? dcSavedText(code8) : dcFailText(fail.code, fail.status), !online);", "finally { busy(btn, false); }"]
    .map((x) => { const k = click.indexOf(x); assert.ok(k > 0, x); return k; });
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(click.includes("const code8 = S.saveCode, sheetCode = S.code, envMax = sheetPhotoCount(S.sheet) ? PHOTO_ENV_MAX : TT_ENV_MAX;"));
  assert.ok(click.includes("if (btn.disabled || S.submitted || S.submitting || !S.sheet || !S.person) return;"));
  assert.doesNotMatch(click, /askConfirm/);   // kein Bestätigungsdialog
  // Grenzen wie beim Server
  assert.ok(html.includes("const TT_ENV_MAX = 400 * 1024;") && LIMITS.envelopeBytes === 400 * 1024);
  assert.ok(html.includes("const PHOTO_ENV_MAX = 1000 * 1024;") && LIMITS.photoEnvelopeBytes === 1000 * 1024);
  // nach der Abgabe: Online-Stand löschen (best effort), der Code gilt nicht mehr – erst nachdem die Abgabe angekommen ist
  const submit = body("async function submitAll()", "\n}\n");
  const kSent = submit.indexOf("await sendSealed(payload"), kDrop = submit.indexOf("if (S.saveCode) { dcGone.add(S.saveCode); dropOnlineDraft(S.saveCode); }");
  assert.ok(kSent > 0 && kDrop > kSent);
  assert.ok(submit.indexOf('S.saveCode = ""; S.savedOnlineAt = 0; S.savedOnlineUntil = 0;') > kDrop);
  assert.equal(html.split("dropOnlineDraft(").length - 1, 3);   // Definition, nach der Abgabe, ein Sichern, das erst nach der Abgabe ankam
  // „Abbrechen und Zwischenstand von diesem Gerät löschen“ und „Nein, Zwischenstand von diesem Gerät löschen“ löschen den Online-Stand nicht
  const cancel = body('$("ed-cancel").addEventListener("click", async () => {', "\n});\n");
  assert.doesNotMatch(cancel, /dropOnlineDraft|api\(|dcGone/);
  assert.ok(cancel.includes("(S.saveCode && S.savedOnlineAt && S.savedOnlineUntil ? dcCancelText(S.saveCode, S.savedOnlineAt, S.savedOnlineUntil) : \"\")"));
  assert.doesNotMatch(body('$("resume-del").addEventListener("click", async () => {', "\n});\n"), /dropOnlineDraft|api\(/);
  // der Code steht im Schreibbereich, sobald es einen online gesicherten Stand gibt – nach Neuladen/Weiterschreiben wieder (aus dem Zwischenstand)
  const note = body("function renderDraftCode() {", "\n}\n");
  assert.ok(note.includes("on = !!(S.saveCode && S.savedOnlineAt && S.savedOnlineUntil);"));
  assert.ok(note.includes('box.append(parts[0], h("b", { class: "dcode", text: parts[1] }), parts[2]);'));   // nur Textknoten, nie innerHTML
  assert.doesNotMatch(note, /innerHTML/);
  const ed = body("async function openEditor(fromPerson) {", "\n}\n");
  assert.equal(ed.split("renderDraftCode();").length - 1, 2);
  assert.ok(ed.includes('imported ? (importFrom === "code" ? DC_LOADED : "Zwischenstand aus der PDF-Datei übernommen")'));
  // ein über Code oder PDF geladener Code gilt auch, wenn der neuere Stand dieses Geräts weitergeführt wird und noch keinen hat (bei demselben
  // Code zählt der spätere Zeitpunkt des Online-Sicherns) – dann sofort speichern
  assert.ok(ed.includes("const adopted = !!(importCode && importCode.code) && (!S.saveCode || (S.saveCode === importCode.code && importCode.at > S.savedOnlineAt));"));
  assert.ok(ed.includes("if (adopted) { S.saveCode = importCode.code; S.savedOnlineAt = importCode.at; S.savedOnlineUntil = importCode.until; }"));
  assert.ok(ed.includes("(imported || pendingLost || held || quotaOver || ttChanged || arrived || adopted) && !saveDraft();"));
  // Lehrkraft: der Dialog „Feibeitsblatt löschen?“ sagt, dass online gesicherte Zwischenstände mit dem Blatt gelöscht werden
  assert.ok(html.includes('" Auch Zwischenstände, die Schüler:innen zu diesem Feibeitsblatt online gesichert haben, werden dabei gelöscht (ihre Zwischenstand-PDF-Dateien bleiben)." +'));
  // Zurücksetzen: nichts bleibt für das nächste Blatt bzw. die nächste Person stehen
  assert.ok(body("function resetStudent() {", "\n}\n").includes('saveCode: "", savedOnlineAt: 0, savedOnlineUntil: 0, importFrom: "", importCode: null });'));
  assert.ok(body("function clearEditor() {", "\n}\n").includes('dcb.classList.add("hidden"); dcb.textContent = "";'));
});

test("draftcode: Datenschutztexte – nennen das Online-Sichern (nur auf Klick, verschlüsselt, Schlüssel aus dem Code, 30 Tage), bleiben wahr und ohne Wörter zur Tippzeit-Messung", () => {
  const BACKUP = "bis zu 7 Tage (bei einem bezahlten Cloudflare-Tarif bis zu 30 Tage)";
  assert.ok(html.includes('const BACKUP_DAYS = "' + BACKUP + '";'));
  const P = new Function("DRAFT_DAYS", "DC_BTN", "DC_DAYS", "BACKUP_DAYS", body("const DRAFT_STAY = ", "// Checklisten-Seite hinter dem QR-Code") + "\nreturn { DRAFT_STAY, DRAFT_ONLINE_DU };")(7, D.DC_BTN, D.DC_DAYS, BACKUP);
  // „Wie lange …?“: der bisherige Text zum Gerät bleibt wörtlich, dahinter der Server
  assert.equal(P.DRAFT_STAY, "Dein Zwischenstand liegt bis zur Abgabe unverschlüsselt in diesem Browser auf diesem Gerät – wer denselben Browser nutzt, kann ihn lesen. " +
    "Ist er älter als 7 Tage, löscht diese Seite ihn beim nächsten Aufruf in diesem Browser; bis dahin bleibt er gespeichert. " +
    "Auf einem geteilten Gerät gib deshalb ab oder lösche ihn („Abbrechen und Zwischenstand löschen“). " +
    "Nur wenn du auf „Zwischenstand sichern (online und als PDF-Datei)“ klickst, wird er zusätzlich verschlüsselt auf dem Server gespeichert. Dort wird er 30 Tage nach dem letzten Sichern gelöscht – " +
    "schon vorher, wenn du deine Arbeit abgibst (dann löscht ihn diese Seite von dem Gerät aus, auf dem du mit ihm weitergearbeitet hast) oder wenn deine Lehrkraft das Feibeitsblatt löscht – " +
    "und liegt danach noch " + BACKUP + " in der Datensicherung der Datenbank; „Abbrechen und Zwischenstand löschen“ löscht nur den Stand auf diesem Gerät. " +
    "Die PDF-Datei mit deinem Zwischenstand, die du dabei herunterlädst, löschst du selbst.");
  assert.deepEqual(P.DRAFT_ONLINE_DU, {
    draftPurpose: " Sicherst du deinen Zwischenstand online, kannst du ihn mit deinem Zwischenstand-Code auf jedem Gerät wieder laden und weiterarbeiten – ohne eine Datei hochzuladen.",
    draftTeacher: " Einen Zwischenstand, den du online sicherst, kann auch sie nicht lesen – ihn kann nur laden, wer deinen Zwischenstand-Code kennt.",
    draftCloud: " Sicherst du deinen Zwischenstand online („Zwischenstand sichern (online und als PDF-Datei)“), liegt auch er dort – verschlüsselt mit einem Schlüssel, den diese Seite in deinem Browser aus deinem Zwischenstand-Code bildet; " +
      "den Code erhält der Server nie. Er speichert dazu nur den Code des Feibeitsblattes, den Zeitpunkt und die Größe – keinen Namen. Wer den Zwischenstand-Code kennt (er steht auch in der Zwischenstand-PDF-Datei), kann den Stand laden.",
    draftChoice: " Ob du deinen Zwischenstand online sicherst, entscheidest du selbst – ohne deinen Klick bleibt er nur auf diesem Gerät.",
    draftRights: " Einen online gesicherten Zwischenstand kann auch der Betreiber nur mit deinem Zwischenstand-Code finden und löschen.",
  });
  // dieselben Bausteine in der „ihr“-Form (Angaben-Bildschirm einer Gruppe)
  const ihr = body("const PRIV_IHR = {", "\n};\n");
  for (const x of ["Nur wenn ihr auf „${DC_BTN}“ klickt, wird er zusätzlich verschlüsselt auf dem Server gespeichert.", "Dort wird er ${DC_DAYS} Tage nach dem letzten Sichern gelöscht – ",
    "und liegt danach noch ${BACKUP_DAYS} in der Datensicherung der Datenbank;", "draftPurpose: \" Sichert ihr euren Zwischenstand online,", "draftTeacher: \" Einen Zwischenstand, den ihr online sichert, kann auch sie nicht lesen",
    "draftCloud: ` Sichert ihr euren Zwischenstand online („${DC_BTN}“), liegt auch er dort", "draftChoice: \" Ob ihr euren Zwischenstand online sichert, entscheidet ihr selbst", "draftRights: \" Einen online gesicherten Zwischenstand kann auch der Betreiber nur mit eurem Zwischenstand-Code finden und löschen.\""])
    assert.ok(ihr.includes(x), x);
  assert.ok(html.includes("const PRIV_DU = { draftStay: DRAFT_STAY, ...DRAFT_ONLINE_DU, checkPurpose:"));
  // ausführlicher Hinweis: Zweck, Lehrkraft-Punkt, Cloudflare-Punkt, Rechtsgrundlage (erster Punkt), Freiwilligkeit, Rechte
  const full = body("function privacyNoticeDom(", "\n}\n");
  for (const x of ["B.checkPurpose + B.draftPurpose)", "B.draftTeacher })];", "B.draftCloud +", "dein Zwischenstand (auch der online gesicherte)${withAi", "euer Zwischenstand (auch der online gesicherte)${withAi", "B.draftChoice +", "+ B.draftRights),"])
    assert.equal(full.split(x).length - 1, 1, x);
  // Kurzfassung (Angaben-Bildschirm, Vorschau der Lehrkraft): ein Satz nach der Löschfrist, du und ihr
  const short = new Function("OP_NAME", "RESERVE_WHEN", "TT_SHORT", fnSrc("function privacyShortText(") + "\nreturn privacyShortText;")("Betreiber", "nicht antwortet", () => "TT.");
  const one = [{ id: "groq", label: "Groq" }];
  assert.ok(short({ retentionDays: 30 }, one, true, false, false).includes("lesen kann sie dort nur deine Lehrkraft. Nach 30 Tagen werden sie automatisch gelöscht. " +
    "Nur wenn du deinen Zwischenstand online sicherst, liegt auch er verschlüsselt auf dem Server – laden kann ihn nur, wer deinen Zwischenstand-Code kennt. Das KI-Feedback ist freiwillig."));
  assert.ok(short(null, [], false, true, false).includes("Eure Lehrkraft löscht sie nach der Durchsicht. " +
    "Nur wenn ihr euren Zwischenstand online sichert, liegt auch er verschlüsselt auf dem Server – laden kann ihn nur, wer euren Zwischenstand-Code kennt. Zu diesem Feibeitsblatt gibt es kein KI-Feedback."));
  // Angaben-Bildschirm (Klasse) und Schreibbereich: nicht mehr „nur auf diesem Gerät“ ohne die Ausnahme
  for (const x of ["Bis dahin bleibt dein Zwischenstand nur auf diesem Gerät – außer du sicherst ihn selbst online.", "Bis dahin bleibt euer Zwischenstand nur auf diesem Gerät – außer ihr sichert ihn selbst online."])
    assert.equal(html.split(x).length - 1, x.includes("dein") ? 3 : 2, x);   // du: HTML + mit/ohne KI; ihr: mit/ohne KI
  assert.ok(!/Zwischenstand nur auf diesem Gerät\./.test(html));
  const rp = body("function renderPrivacy()", 'const full = $("privfull-ed")');
  for (const x of ["`Dein Zwischenstand liegt bis zur Abgabe nur auf diesem Gerät (ist er älter als ${DRAFT_DAYS} Tage, löscht ihn diese Seite beim nächsten Aufruf in diesem Browser) – ` +",
    "`Nur wenn du oben auf „${DC_BTN}“ klickst, wird er zusätzlich verschlüsselt auf dem Server dieser Seite gespeichert, und du bekommst eine PDF-Datei mit deinem Zwischenstand-Code – mit dem Code lädst du den Stand auf jedem Gerät wieder. ` +",
    "`Den Schlüssel bildet der Code, den der Server nie erhält: Wer den Code kennt, kann den Stand laden; die Datei enthält außerdem deine Antworten lesbar – gib Datei und Code nicht weiter. ` +",
    "`Online wird der Stand ${DC_DAYS} Tage nach dem letzten Sichern gelöscht, schon vorher nach deiner Abgabe oder mit dem Feibeitsblatt; „Abbrechen und Zwischenstand löschen“ löscht ihn dort nicht.` +"])
    assert.ok(rp.includes(x), x);
  assert.ok(rp.includes("(Cloudflare, Inc., USA; Datenbank in der EU)"));   // der Server dieser Seite ist dort schon benannt – nie „Server in der EU“
  // Escape-Room-Finale und Foto-Aufgabe: was im Zwischenstand steht, liegt mit einem online gesicherten Stand verschlüsselt auch auf dem Server
  for (const x of ["auf diesem Gerät – außer du sicherst deinen Zwischenstand online (dann liegen sie verschlüsselt mit darin); nur deine Ergebnisse dort gehen verschlüsselt an deine Lehrkraft.`;",
    "nur in deinem Zwischenstand (auf diesem Gerät und – wenn du ihn online sicherst – verschlüsselt auf dem Server) und in PDF-Dateien, die du herunterlädst; ` +",
    "auch in deinem Zwischenstand (sicherst du ihn online, verschlüsselt auch auf dem Server) und in jeder Zwischenstand-PDF-Datei, \" +",
    "steht bis zur Abgabe in deinem Zwischenstand (auf diesem Gerät und – wenn du ihn online sicherst – verschlüsselt auf dem Server) \" +",
    "steht bis zur Abgabe in eurem Zwischenstand (auf diesem Gerät und – wenn ihr ihn online sichert – verschlüsselt auf dem Server) \" +",
    "(und in jeder Zwischenstand-PDF-Datei, die du sicherst – sicherst du ihn online, verschlüsselt auch auf dem Server); an deine Lehrkraft geht es nur verschlüsselt mit deiner Abgabe.",
    "(und in jeder Zwischenstand-PDF-Datei, die ihr sichert – sichert ihr ihn online, verschlüsselt auch auf dem Server); an eure Lehrkraft geht es nur verschlüsselt mit eurer Abgabe.",
    "außer sie sichern ihren Zwischenstand online (dann liegen sie verschlüsselt mit darin) oder schicken nach einer technisch gescheiterten Abgabe ihre Abschluss-PDF per E-Mail;"])
    assert.equal(html.split(x).length - 1, 1, x);
  // nirgends ein Wort zur Tippzeit-Messung, nie „Server in der EU“, keine Schule
  const texts = [P.DRAFT_STAY, ...Object.values(P.DRAFT_ONLINE_DU), short({ retentionDays: 30 }, one, true, false, false), short(null, [], false, true, false)];
  for (const x of texts) { assert.doesNotMatch(x, NO_TT, x); assert.doesNotMatch(x, /Server in der EU|Schule|Datenschutzbeauftragte/, x); }
  assert.ok(!html.includes("Server in der EU"));
});
