// liveclient.test.mjs – Live-Gruppenarbeit im Browser: die reinen Hilfsfunktionen aus index.html (Block LIVE:BEGIN … LIVE:END) –
// Wortliste, Zahlencode, Normalisierung, Takt, Ableitung und Wert-Format gegen die Helfer aus test/smoke.mjs (so prüft der Smoke-Test
// den Server), Zustandshelfer (Sperren verfallen, „der Raum gewinnt“), Texte – und die Stellen im Skript, die sie nutzen
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { deriveLiveKeys, sealLive, openLive } from "../smoke.mjs";
import { LIVE, ROOM_RE, isLiveValue } from "../../worker/live.js";
import { LIMITS } from "../../worker/lib.js";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const blk = (n) => { const a = html.indexOf("/* " + n + ":BEGIN"), b = html.indexOf("/* " + n + ":END */", a); assert.ok(a > 0 && b > a, n); return html.slice(a, b); };
const block = blk("LIVE");
const NAMES = "LIVE_WORDS, LIVE_NUM_LEN, LIVE_NUM_MIN, LIVE_NUM_SPAN, LIVE_WORD_MAX, LIVE_ROOM_RE, LIVE_KDF_PREFIX, LIVE_KDF_SALT, LIVE_KDF_ITER, LIVE_INFO_ID, LIVE_INFO_ENC, " +
  "LIVE_CREATE_TRIES, LIVE_PV_MS, LIVE_SET_IDLE_MS, LIVE_SET_MAX_MS, LIVE_UNLOCK_MS, LIVE_PING_MS, LIVE_PONG_MS, LIVE_INIT_MS, LIVE_ACK_MS, LIVE_RETRY_MAX_MS, LIVE_GRACE_MS, " +
  "LIVE_MSG_WINDOW_MS, LIVE_PV_BUDGET, LIVE_SET_BUDGET, LIVE_SOL_MAX, LIVE_TEXT_MAX, LIVE_PHOTO_MAX, LIVE_META_MAX, LIVE_IDLE_DAYS, LIVE_FB2_PENDING_MS, " +
  "liveRandom, liveWord, liveNumber, normLiveWord, normLiveNumber, liveWordOk, liveNumberOk, liveB64, liveUnB64, liveDerive, liveSeal, liveOpen, liveWsUrl, liveRetryMs, " +
  "liveHold, liveHeld, liveExpire, liveBudget, liveReconcile, liveCleanMeta, liveCleanAnswer, liveCleanFb, liveCleanSig, liveCleanSub, liveLastOut, liveLastIn, liveFits, " +
  "LIVE_MODE_D, LIVE_SETUP, LIVE_SETUP_FAIL, LIVE_LOCAL_HINT, LIVE_INFO_TEXT, LIVE_JOINING, LIVE_JOIN_WORD, LIVE_JOIN_NUM, LIVE_JOIN_WRONG, LIVE_JOIN_FAIL, LIVE_OTHER_SHEET, " +
  "LIVE_GONE, LIVE_FULL, liveResumeParts, LIVE_RESUME_BTN, LIVE_RESUME_DEL, liveStateText, LIVE_SAVED, LIVE_SAVING, LIVE_OFFLINE, LIVE_HINT_WRITE, LIVE_HINT_AI, LIVE_HINT_SUBMIT, " +
  "LIVE_HINT_STALE, LIVE_HINT_UNSAVED, LIVE_LEAVE_BTN, LIVE_LEAVE, LIVE_PDF_BTN, LIVE_PDF_BUSY, LIVE_PDF_DONE, LIVE_ASK_FB, LIVE_ASK_SUBMIT, liveDenyText, liveDoneText, " +
  "LIVE_DONE_PDF, LIVE_DONE_WAIT, LIVE_DONE_GONE, LIVE_DONE_NONE, liveDoneGroup, livePdfHead, LIVE_PDF_LINE";
// der Block braucht nur asciiDigits (Block BDAY)
const L = new Function(blk("BDAY") + block + "\nreturn { " + NAMES + " };")();
const G = new Function(blk("GROUP") + "\nreturn { cleanGroup };")();
const subtle = webcrypto.subtle;
const rnd = (n) => webcrypto.getRandomValues(new Uint8Array(n));
function rng(seed) { let s = seed >>> 0; return (n) => { const u = new Uint8Array(n); for (let k = 0; k < n; k++) { s = (s * 1664525 + 1013904223) >>> 0; u[k] = s >>> 24; } return u; }; }
// wie NO_TT in den E2E-Tests: bei Gruppen wird nie gemessen – die Texte der Live-Gruppenarbeit nennen die Messung nirgends
const NO_TT = /Tippzeit|misst|Messung|gemessen|Zeitmess|Schreibprozess|widersprech|Widerspruch|Schalter|Haken/i;
const body = (start, end) => { const a = html.indexOf(start), b = html.indexOf(end, a); assert.ok(a > 0 && b > a, start); return html.slice(a, b); };

test("live: Block gefunden, ohne Abhängigkeiten zur Seite; Grenzen und Kennung wie beim Server", () => {
  assert.doesNotMatch(block, /\bdocument\b|\bwindow\b|[^\w.]S\.|\$\(|\bh\(|\bapi\(|\bfetch\(|localStorage|\bstore\.|WebSocket/);
  assert.equal(L.LIVE_ROOM_RE.source, ROOM_RE.source);
  assert.deepEqual([L.LIVE_KDF_PREFIX, L.LIVE_KDF_SALT, L.LIVE_KDF_ITER, L.LIVE_INFO_ID, L.LIVE_INFO_ENC],
    ["feibeitsblatt/live/v1|", "feibeitsblatt/live/v1", 600000, "feibeitsblatt/live/id/v1", "feibeitsblatt/live/enc/v1"]);   // Teil des Formats – nie ändern
  assert.deepEqual([L.LIVE_SOL_MAX, L.LIVE_TEXT_MAX, L.LIVE_PHOTO_MAX, L.LIVE_META_MAX, L.LIVE_IDLE_DAYS], [LIVE.solValue, LIVE.textValue, LIVE.photoValue, LIVE.metaValue, LIVE.idleDays]);
  assert.equal(L.LIVE_CREATE_TRIES, 6);
  assert.ok(LIMITS.liveRoomsPerSheet >= 30);
});

test("live: Wortliste – mindestens 300 verschiedene Wörter nur aus a–z, 4 bis 9 Buchstaben, schon in der Form der Eingabe", () => {
  const w = L.LIVE_WORDS;
  assert.ok(w.length >= 300, String(w.length));
  assert.equal(new Set(w).size, w.length, "jedes Wort nur einmal");
  for (const x of w) {
    assert.match(x, /^[a-z]{4,9}$/, x);
    assert.equal(L.normLiveWord(x), x, x);                       // die Eingabe-Normalisierung lässt jedes Wort, wie es ist
    assert.equal(L.liveWordOk(x), true);
    assert.doesNotMatch(x, /ae|oe|ue/.test(x) && /^(bauer|feuer|mauer|treue|neue|blaue)$/.test(x) ? /x^/ : /ä|ö|ü|ß/);
  }
  // keine umschriebenen Umlaute (ein „baer“ wäre schwer zu lesen): ae/oe/ue kommen nur in echten Wörtern ohne Umlaut vor
  for (const x of w.filter((y) => /ae|oe|ue/.test(y))) assert.ok(["quelle", "qualle", "quark", "quarz", "abend"].includes(x) || /qu/.test(x), x);
  // nichts, was als Spott oder Marke taugt (Stichprobe der bewusst weggelassenen Wörter)
  for (const bad of ["esel", "affe", "schwein", "kuh", "ziege", "gans", "ratte", "gurke", "pflaume", "flasche", "kamel", "puma", "pelikan", "tempo", "mars", "feuer", "wort", "zahl", "blatt", "name"])
    assert.equal(w.includes(bad), false, bad);
  // zu ähnliche Paare bewusst nur einmal (wer „kohl“ liest, tippt sonst leicht „kohle“)
  for (const [a, b] of [["kohl", "kohle"], ["buch", "buche"], ["rolle", "roller"], ["ball", "ballon"], ["hase", "hasel"], ["wiese", "wiesel"], ["reise", "reis"], ["kies", "kiesel"], ["lama", "lamm"]])
    assert.ok(!(w.includes(a) && w.includes(b)), a + "/" + b);
});

test("live: Zugangswort und Zahlencode würfeln – aus der Liste bzw. 10000–99999, ohne Modulo-Bias", () => {
  const next = rng(20261124), seenW = new Map(), seenN = new Set();
  for (let k = 0; k < 20000; k++) {
    const w = L.liveWord(next), n = L.liveNumber(next);
    assert.ok(L.LIVE_WORDS.includes(w));
    assert.match(n, /^[1-9][0-9]{4}$/); assert.equal(L.liveNumberOk(n), true);
    seenW.set(w, (seenW.get(w) || 0) + 1); seenN.add(n);
  }
  assert.equal(seenW.size, L.LIVE_WORDS.length, "jedes Wort kommt vor");
  const exp = 20000 / L.LIVE_WORDS.length;
  for (const [w, c] of seenW) assert.ok(c > exp * 0.4 && c < exp * 1.9, w + " " + c);   // grob gleich verteilt
  assert.ok(seenN.size > 17000);
  // Verwerfen statt Modulo: Werte ab der größten Vielfachen der Spanne werden neu gezogen
  const bytes = [[255, 255], [0, 7]], take = () => Uint8Array.from(bytes.shift());
  assert.equal(L.liveRandom(take, 402), 7);                       // 65535 liegt über der Grenze → verworfen, dann 7
  assert.equal(L.liveRandom(() => Uint8Array.from([0, 0, 0]), 90000), 0);
  assert.equal(L.liveRandom(() => Uint8Array.from([0, 1, 0]), 90000), 256);
  assert.equal(L.liveNumber(() => Uint8Array.from([0, 0, 0])), "10000");
  assert.equal(L.LIVE_NUM_MIN + L.LIVE_NUM_SPAN - 1, 99999); assert.equal(L.LIVE_NUM_LEN, 5);
});

test("live: Eingaben normalisieren – Zugangswort klein und nur a–z (Umlaute umschrieben), Zahlencode nur Ziffern (auch anderer Schriften), gültig genau 5", () => {
  for (const [raw, norm] of [["Birke", "birke"], ["  BIRKE \n", "birke"], ["bir-ke", "birke"], ["bir ke", "birke"], ["Bär", "baer"], ["Öl", "oel"], ["Tür", "tuer"], ["Straße", "strasse"],
    ["Ähre", "aehre"], ["birke7!", "birke"], [null, ""], [undefined, ""], [42, ""], ["x".repeat(40), "x".repeat(20)]])
    assert.equal(L.normLiveWord(raw), norm, String(raw));
  for (const [raw, norm] of [["48213", "48213"], [" 48 213 ", "48213"], ["48-213", "48213"], ["٤٨٢١٣", "48213"], ["４８２１３", "48213"], ["4821", "4821"], ["482134", "482134"], [null, ""], [48213, "48213"], ["ab", ""]])
    assert.equal(L.normLiveNumber(raw), norm, String(raw));
  for (const ok of ["48213", "10000", "99999", "01234"]) assert.equal(L.liveNumberOk(ok), true, ok);
  for (const bad of ["", "4821", "482134", "4821a", 48213, null, " 48213"]) assert.equal(L.liveNumberOk(bad), false, String(bad));
  for (const bad of ["", "a", "Birke", "bir ke", "bär", "x".repeat(21), null, 5]) assert.equal(L.liveWordOk(bad), false, String(bad));
});

test("live: Takt – Vorschau oft, Speichern selten; unter der Grenze des Raums; Neuverbinden mit wachsender Pause bis 15 s", () => {
  assert.deepEqual([L.LIVE_PV_MS, L.LIVE_SET_IDLE_MS, L.LIVE_SET_MAX_MS, L.LIVE_UNLOCK_MS], [1000, 1500, 8000, 4000]);
  assert.deepEqual([L.LIVE_PING_MS, L.LIVE_PONG_MS, L.LIVE_INIT_MS], [25000, 10000, 12000]);
  assert.ok(L.LIVE_UNLOCK_MS < LIVE.lockMs, "die Seite gibt frei, lange bevor die Sperre beim Raum verfällt");
  assert.ok(L.LIVE_SET_MAX_MS < LIVE.lockMs && L.LIVE_ACK_MS < LIVE.lockMs);
  assert.ok(L.LIVE_PV_BUDGET < L.LIVE_SET_BUDGET && L.LIVE_SET_BUDGET < LIVE.setsPerMin, "nie so viele Nachrichten, dass der Raum die Verbindung trennt");
  // Dauertippen in einer Aufgabe: 60 Vorschauen + höchstens 60 000 / 1500 Speicherungen je Minute bleiben unter der Grenze des Raums
  assert.ok(60000 / L.LIVE_PV_MS + 60000 / L.LIVE_SET_IDLE_MS <= L.LIVE_PV_BUDGET);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9, 99].map(L.liveRetryMs), [1000, 2000, 4000, 8000, 15000, 15000, 15000, 15000]);
  assert.equal(L.LIVE_RETRY_MAX_MS, 15000);
  assert.ok(L.LIVE_GRACE_MS > 0 && L.LIVE_GRACE_MS <= 5000);
  // Zähler je Minute: alte Zeitpunkte fallen heraus
  const times = [];
  for (let k = 0; k < 5; k++) { assert.equal(L.liveBudget(times, 1000 + k, 5), true); times.push(1000 + k); }
  assert.equal(L.liveBudget(times, 1010, 5), false);
  assert.equal(L.liveBudget(times, 1000 + L.LIVE_MSG_WINDOW_MS + 1, 5), true); assert.equal(times.length, 3);
});

test("live: Ableitung liefert dieselbe Raum-Kennung und denselben Schlüssel wie die Helfer des Smoke-Tests (so prüft er den Server)", async () => {
  const a = await L.liveDerive(subtle, "K7QM4X", "birke", "48213"), b = await deriveLiveKeys("K7QM4X", "birke", "48213");
  assert.equal(a.room, b.room); assert.match(a.room, L.LIVE_ROOM_RE);
  assert.equal(a.key.extractable, false); assert.deepEqual(a.key.usages.slice().sort(), ["decrypt", "encrypt"]);
  // Wert-Format in beide Richtungen: Base64(IV 12 Byte ‖ AES-GCM) über UTF-8-JSON
  const value = { t: "Größe – „Zitat“ 😀\nzweite Zeile", p: "" };
  const sealed = await L.liveSeal(subtle, a.key, value, rnd);
  assert.match(sealed, /^[A-Za-z0-9+/]+={0,2}$/); assert.equal(isLiveValue(sealed, LIVE.textValue), true);
  assert.deepEqual(await openLive(b.key, sealed), value);
  assert.deepEqual(await L.liveOpen(subtle, a.key, await sealLive(b.key, value)), value);
  assert.notEqual(sealed, await L.liveSeal(subtle, a.key, value, rnd), "jedes Mal ein neuer IV");
  // jede Zutat zählt: anderes Wort, andere Zahl, anderer Blatt-Code → anderer Raum, anderer Schlüssel
  for (const [c, w, n] of [["K7QM4X", "birke", "48214"], ["K7QM4X", "buche", "48213"], ["K7QM4Y", "birke", "48213"]]) {
    const o = await L.liveDerive(subtle, c, w, n);
    assert.notEqual(o.room, a.room);
    await assert.rejects(L.liveOpen(subtle, o.key, sealed));
  }
  // verändert oder verstümmelt → Fehler (nie halbe Daten)
  await assert.rejects(L.liveOpen(subtle, a.key, sealed.slice(0, -8) + "AAAAAAA="));
  for (const bad of ["", "kurz", "!!!!", null, 5, sealed.slice(0, 20)]) await assert.rejects(L.liveOpen(subtle, a.key, bad));
  // nur gültige Zutaten (so, wie die Eingabe sie normalisiert)
  for (const [c, w, n] of [["k7qm4x", "birke", "48213"], ["K7QM4X", "Birke", "48213"], ["K7QM4X", "birke", "4821"], ["K7Q-M4X", "birke", "48213"], ["K7QM4X", "", "48213"]])
    await assert.rejects(L.liveDerive(subtle, c, w, n));
});

test("live: Angaben der Gruppe (meta) passen verschlüsselt in den Raum – auch die größte Gruppe", async () => {
  const k = await L.liveDerive(subtle, "K7QM4X", "birke", "48213", 1000);
  const meta = { v: 1, gruppe: ["MaxMu", "LiMu", "ÖzgÜn", "TimBe", "AnnKa", "JonSc", "MiaLe", "BenWo", "EmmFi", "PauHo"], klasse: "10b/E1-ab", attempt: "aabbccddeeff0011" };
  const v = await L.liveSeal(subtle, k.key, meta, rnd);
  assert.ok(L.liveFits(v, L.LIVE_META_MAX)); assert.equal(isLiveValue(v, LIVE.metaValue), true);
  assert.deepEqual(L.liveCleanMeta(await L.liveOpen(subtle, k.key, v), G.cleanGroup), { gruppe: meta.gruppe, klasse: "10b/E1-ab", attempt: meta.attempt });
  // längste Antwort (8000 Zeichen, Umlaute und Zeilenumbrüche) und die Signatur passen in ihre Grenzen
  const long = await L.liveSeal(subtle, k.key, { t: ("äöü ß\n".repeat(1400)).slice(0, 8000) }, rnd);
  assert.ok(L.liveFits(long, L.LIVE_TEXT_MAX), String(long.length));
  const sig = await L.liveSeal(subtle, k.key, { sig: Array.from({ length: 30 }, (_, i) => i + 1).join(",") }, rnd);
  assert.ok(sig.length <= LIVE.sigValue, String(sig.length));
});

test("live: Entschlüsseltes ist fremde Eingabe – Angaben, Antwort, Feedback, Signatur und Vermerk werden geprüft und gekappt", () => {
  const cg = G.cleanGroup, at = "aabbccddeeff0011";
  assert.deepEqual(L.liveCleanMeta({ v: 1, gruppe: ["max mu", "LiMu"], klasse: " 8 b ", attempt: at, extra: 1 }, cg), { gruppe: ["MaxMu", "LiMu"], klasse: "8b", attempt: at });
  for (const bad of [null, [], "x", { v: 2, gruppe: ["MaxMu", "LiMu"], klasse: "8b", attempt: at }, { v: 1, gruppe: ["MaxMu"], klasse: "8b", attempt: at },
    { v: 1, gruppe: ["MaxMu", "LiMu"], klasse: "8b", attempt: "kurz" }, { v: 1, gruppe: ["MaxMu", "LiMu"], klasse: "8b!", attempt: at }, { v: 1, gruppe: "MaxMu", klasse: "8b", attempt: at },
    { v: 1, gruppe: ["MaxMu", "<b>"], klasse: "8b", attempt: at }, JSON.parse('{"v":1,"__proto__":{"gruppe":["MaxMu","LiMu"]},"klasse":"8b","attempt":"' + at + '"}')])
    assert.equal(L.liveCleanMeta(bad, cg), null, JSON.stringify(bad));
  const photo = (p) => (typeof p === "string" && p.startsWith("data:image/jpeg;base64,/9j/") ? p : "");
  assert.deepEqual(L.liveCleanAnswer({ t: "abc", p: "data:image/jpeg;base64,/9j/AAAA", x: 1 }, 2, photo), { t: "ab", p: "data:image/jpeg;base64,/9j/AAAA" });
  assert.deepEqual(L.liveCleanAnswer({ t: "abc", p: "javascript:alert(1)" }, 8000, photo), { t: "abc", p: "" });
  assert.deepEqual(L.liveCleanAnswer({ t: "abc", p: "data:image/jpeg;base64,/9j/AAAA" }, 8000, null), { t: "abc", p: "" });   // keine Foto-Aufgabe: kein Foto
  for (const bad of [null, "text", 5, [], { t: 5 }, { p: "x" }]) assert.deepEqual(L.liveCleanAnswer(bad, 8000, photo), { t: "", p: "" });
  const norm = (f) => ({ covered: Array.isArray(f.covered) ? f.covered.filter((x) => typeof x === "string") : [], missing: [] });
  assert.deepEqual(L.liveCleanFb({ first: "abcdef", fb: { covered: ["gut", 5] }, at: "2026-11-24T08:00:00.000Z" }, 3, norm), { first: "abc", fb: { covered: ["gut"], missing: [] }, at: "2026-11-24T08:00:00.000Z" });
  assert.equal(L.liveCleanFb({ first: "a", fb: { covered: [] } }, 9, norm).at, null);
  for (const bad of [null, [], { first: 5, fb: {} }, { first: "a" }, { first: "a", fb: [] }, { first: "a", fb: "x" }]) assert.equal(L.liveCleanFb(bad, 9, norm), null);
  for (const [o, sig] of [[{ sig: "1,3" }, "1,3"], [{ sig: "" }, ""], [{ sig: "12" }, "12"], [{ sig: "1,x" }, null], [{ sig: 5 }, null], [null, null], [{ sig: "1,,2" }, null], [{ sig: "123" }, null]])
    assert.equal(L.liveCleanSig(o), sig, JSON.stringify(o));
  assert.deepEqual(L.liveCleanSub({ receivedAt: 1790000000000, at: 1790000000500, gone: true, x: 1 }), { receivedAt: 1790000000000, at: 1790000000500, gone: true });
  assert.deepEqual(L.liveCleanSub({ receivedAt: "x", at: -1 }), { receivedAt: 0, at: 0, gone: false });
  assert.equal(L.liveCleanSub(null), null);
});

test("live: Sperren und Zusagen verfallen von selbst – eigene (auch frühere) Verbindungen sind kein fremdes Gerät", () => {
  const own = new Set(["me1", "me2"]), h = L.liveHold("other", 30000, 1000);
  assert.deepEqual(h, { by: "other", until: 31000 });
  assert.equal(L.liveHeld(h, 30999, own), true);
  assert.equal(L.liveHeld(h, 31000, own), false);                 // abgelaufen (der Raum meldet den Ablauf nicht)
  assert.equal(L.liveHeld(L.liveHold("me1", 30000, 1000), 2000, own), false);   // die eigene, gerade abgerissene Verbindung
  assert.equal(L.liveHeld(null, 0, own), false); assert.equal(L.liveHeld(undefined, 0, null), false);
  assert.equal(L.liveHold("x", undefined, 5).until, 5); assert.equal(L.liveHold("x", -1, 5).until, 5); assert.equal(L.liveHold("x", 1e12, 0).until, 600000);
  const map = { a0: L.liveHold("o", 100, 0), a1: L.liveHold("o", 300, 0), a2: null };
  assert.equal(L.liveExpire(map, 200), true); assert.deepEqual(Object.keys(map), ["a1"]);
  assert.equal(L.liveExpire(map, 250), false);
});

test("live: nach einer Unterbrechung – unveränderter Raum → erneut senden, sonst gewinnt der Raum", () => {
  const R = L.liveReconcile;
  assert.equal(R(null, 3, "x"), "take");
  assert.equal(R({ text: "abc", dirty: false, sent: null, base: 3 }, 4, "neu"), "take");            // keine eigene Eingabe offen
  assert.equal(R({ text: "abc", dirty: true, sent: null, base: 3 }, 3, "alt"), "send");             // Raum unverändert
  assert.equal(R({ text: "abc", dirty: false, sent: "abc", base: 3 }, 3, "alt"), "send");           // Speichern kam nie an
  assert.equal(R({ text: "abc", dirty: false, sent: "abc", base: 3 }, 4, "abc"), "same");           // kam an, nur die Bestätigung fehlte
  assert.equal(R({ text: "abcd", dirty: true, sent: "abc", base: 3 }, 4, "abc"), "acked");          // kam an, inzwischen weitergetippt
  assert.equal(R({ text: "abcd", dirty: true, sent: "abc", base: 3 }, 5, "abc"), "lost");           // zwei Versionen weiter: jemand anderes
  assert.equal(R({ text: "abc", dirty: true, sent: null, base: 3 }, 4, "ganz anders"), "lost");     // jemand hat inzwischen geändert
  assert.equal(R({ text: "abc", dirty: true, sent: null, base: 3 }, 4, "abc"), "same");
  assert.equal(R({ text: "", dirty: true, sent: null, base: 0 }, 0, ""), "send");
});

test("live: Adresse des WebSockets – dieselbe Herkunft (ws/wss) bzw. die Worker-Adresse mit wss", () => {
  const room = "ab".repeat(32);
  assert.equal(L.liveWsUrl("", { protocol: "http:", host: "127.0.0.1:8787" }, "K7QM4X", room), "ws://127.0.0.1:8787/api/live/ws?code=K7QM4X&room=" + room);
  assert.equal(L.liveWsUrl("", { protocol: "https:", host: "feibeitsblatt.feindt.workers.dev" }, "K7QM4X", room), "wss://feibeitsblatt.feindt.workers.dev/api/live/ws?code=K7QM4X&room=" + room);
  assert.equal(L.liveWsUrl("https://feibeitsblatt.feindt.workers.dev", { protocol: "https:", host: "feibeitsblatt.janrickmer.de" }, "K7QM4X", room),
    "wss://feibeitsblatt.feindt.workers.dev/api/live/ws?code=K7QM4X&room=" + room);
  // die Adresse des Workers steht mit wss:// in der Content-Security-Policy (GitHub Pages)
  const worker = html.match(/window\.FEIBEITSBLATT_WORKER = "(https:\/\/[^"]+)"/)[1];
  assert.ok(html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)[1].includes(" " + worker.replace(/^https/, "wss") + ";"));
});

test("live: Eintrag für „Weiterschreiben?“ – Zugangswort und Zahlencode statt Angaben einer Person", () => {
  const d = L.liveLastOut("K7QM4X", "Das Gewissen", "birke", "48213", 1790000000000);
  assert.deepEqual(d, { v: 1, t: 1790000000000, code: "K7QM4X", title: "Das Gewissen", live: { word: "birke", num: "48213" } });
  assert.equal("person" in d, false);
  assert.deepEqual(L.liveLastIn(JSON.parse(JSON.stringify(d))), { code: "K7QM4X", title: "Das Gewissen", word: "birke", num: "48213" });
  for (const bad of [null, {}, { code: "K7QM4X" }, { code: "K7QM4X", live: { word: "Birke", num: "48213" } }, { code: "K7QM4X", live: { word: "birke", num: "4821" } }, { code: "k7qm4x", live: { word: "birke", num: "48213" } },
    { code: "K7QM4X", live: "birke" }, { code: 5, live: { word: "birke", num: "48213" } }]) assert.equal(L.liveLastIn(bad), null, JSON.stringify(bad));
  assert.equal(L.liveLastIn({ code: "K7QM4X", title: 5, live: { word: "birke", num: "48213" } }).title, "");
});

test("live: Texte – Wortlaut der Vorgaben, du-/ihr-Form, nie ein Wort zur Tippzeit-Messung", () => {
  assert.equal(L.LIVE_MODE_D, "Ihr arbeitet zu zweit oder in einer Gruppe (bis zu 10 Personen) live zusammen – an einem oder an mehreren Geräten – und gebt gemeinsam ab.");
  assert.equal(L.LIVE_SETUP, "Der Zugang für eure Gruppe wird eingerichtet …");
  assert.ok(L.LIVE_SETUP_FAIL.startsWith("Die Live-Verbindung für eure Gruppe ließ sich gerade nicht einrichten."));
  assert.equal(L.LIVE_INFO_TEXT, "Zeige das deinen Gruppenmitgliedern. Sie öffnen Feibeitsblatt, geben den Code des Feibeitsblattes ein, wählen „Partner- / Gruppenarbeit“ und dann „Ich schalte mich dazu“. " +
    "Zugangswort und Zahlencode stehen auch während der Arbeit oben in der Kopfzeile. Gebt beides nur an eure Gruppe weiter: Wer beides und den Code des Feibeitsblattes kennt, kann euren Stand lesen und ändern.");
  assert.equal(L.LIVE_JOIN_WRONG, "Zugangswort oder Zahlencode stimmen nicht.");
  assert.equal(L.LIVE_GONE, "Diese Gruppenarbeit gibt es nicht mehr.");
  assert.equal(L.LIVE_FULL, "Mit dieser Gruppenarbeit sind schon zu viele Geräte verbunden.");
  assert.equal(L.liveResumeParts("Das Gewissen", "birke", "48213").join(""), "Weiterarbeiten an eurer Gruppenarbeit zu „Das Gewissen“? (Zugangswort birke, Zahlencode 48213)");
  assert.equal(L.liveStateText(true, 3), "Live verbunden · 3 Geräte");
  assert.equal(L.liveStateText(true, 1), "Live verbunden · nur dieses Gerät");
  assert.equal(L.liveStateText(false, 3), "Verbindung unterbrochen – wird wiederhergestellt …");
  assert.equal(L.LIVE_HINT_WRITE, "Hier schreibt gerade jemand aus eurer Gruppe – du siehst den Text mitwachsen.");
  assert.equal(L.LIVE_HINT_AI, "Ein anderes Gerät eurer Gruppe fordert gerade KI-Feedback zu dieser Aufgabe an.");
  assert.equal(L.LIVE_HINT_STALE, "Jemand aus eurer Gruppe hat diese Aufgabe inzwischen geändert – deine letzte Eingabe wurde nicht übernommen.");
  assert.equal(L.LIVE_LEAVE_BTN, "Gruppenarbeit verlassen");
  assert.deepEqual([L.LIVE_LEAVE.title, L.LIVE_LEAVE.text], ["Gruppenarbeit verlassen?", "Der gemeinsame Stand bleibt für eure Gruppe erhalten. Mit dem Code des Feibeitsblattes, dem Zugangswort und dem Zahlencode kannst du dich wieder dazuschalten."]);
  assert.equal(L.LIVE_PDF_BTN, "Stand als PDF-Datei sichern");
  assert.deepEqual(L.LIVE_ASK_FB, { title: "Erst die Gruppe fragen", text: "Das KI-Feedback zum Überarbeiten gibt es für eure ganze Gruppe zu jeder Aufgabe nur einmal – egal, auf welchem Gerät es angefordert wird. " +
    "Hol dir deshalb zuerst die Zusage aller Gruppenmitglieder.", ok: "Alle sind einverstanden", cancel: "Noch nicht", safeFirst: true });
  assert.deepEqual(L.LIVE_ASK_SUBMIT, { title: "Erst die Gruppe fragen", text: "Abgeben kann eure Gruppe nur einmal – egal, auf welchem Gerät. Danach lässt sich auf keinem Gerät mehr etwas ändern. " +
    "Hol dir deshalb zuerst die Zusage aller Gruppenmitglieder.", ok: "Alle sind einverstanden", cancel: "Noch nicht", safeFirst: true });
  // Ablehnungen des Raums
  assert.equal(L.liveDenyText("set", 2, false), "Zu dieser Aufgabe hat eure Gruppe schon KI-Feedback bekommen.");
  assert.equal(L.liveDenyText("claimed", 2, false), "Ein anderes Gerät eurer Gruppe fordert gerade KI-Feedback zu dieser Aufgabe an.");
  assert.equal(L.liveDenyText("locked", 2, false), "In Aufgabe 2 schreibt gerade jemand aus eurer Gruppe – wartet, bis die Eingabe fertig ist.");
  assert.equal(L.liveDenyText("submitting", 0, false), "Ein anderes Gerät eurer Gruppe gibt gerade ab.");
  assert.equal(L.liveDenyText("locked", 3, true), "In Aufgabe 3 schreibt gerade jemand aus eurer Gruppe – wartet kurz und gebt dann ab.");
  assert.equal(L.liveDenyText("claimed", 0, true), "Ein anderes Gerät fordert gerade KI-Feedback an – wartet kurz und gebt dann ab.");
  assert.equal(L.liveDenyText("submitting", 0, true), "Ein anderes Gerät eurer Gruppe gibt gerade ab.");
  for (const why of ["error", "bad", "unknown", "timeout", undefined]) assert.match(L.liveDenyText(why, 0, false), /nicht geklappt/);
  // Abgabe-Ansicht
  assert.equal(L.liveDoneText("24.11.2026", "09:05"), "Ein Mitglied eurer Gruppe hat das Feibeitsblatt am 24.11.2026 um 09:05 Uhr abgegeben. Ändern lässt sich nichts mehr.");
  assert.equal(L.LIVE_DONE_PDF, "Abgegebene Lösungen als PDF-Datei herunterladen");
  assert.equal(L.LIVE_DONE_WAIT, "Die finale KI-Rückmeldung wird gerade erstellt – sie steht in der PDF-Datei, sobald dieser Hinweis verschwindet.");
  assert.equal(L.LIVE_DONE_GONE, "Die Abgabe wurde inzwischen gelöscht – die Lösungen lassen sich hier nicht mehr herunterladen.");
  assert.equal(L.LIVE_DONE_NONE, "Die Lösungen liegen hier noch nicht vor.");
  assert.equal(L.livePdfHead("birke", "48213", "K7Q-M4X"), "Zugangswort: birke · Zahlencode: 48213 (Code des Feibeitsblattes: K7Q-M4X)");
  assert.match(L.liveDoneGroup("birke", "48213"), /Zugangswort „birke“ und dem Zahlencode 48213\.$/);
  // nie ein Wort zur Tippzeit-Messung, nie „Server in der EU“
  const all = [];
  const walk = (x) => { if (typeof x === "string") all.push(x); else if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object" && !(x instanceof RegExp)) Object.values(x).forEach(walk); };
  for (const [name, val] of Object.entries(L)) {
    if (/^LIVE_(WORDS|KDF|INFO_(ID|ENC))/.test(name)) continue;
    if (typeof val === "function") { if (/^live(DenyText|DoneText|DoneGroup|PdfHead|StateText|ResumeParts)$/.test(name)) for (const args of [[true, 2, true], [false, 1, false], ["locked", 2, true], ["a", "b", "c"]]) { try { walk(val(...args)); } catch (e) { /* andere Parameter */ } } }
    else walk(val);
  }
  assert.ok(all.length > 40);
  for (const t of all) { assert.doesNotMatch(t, NO_TT, t); assert.doesNotMatch(t, /Server in der EU|Deine Schule|Datenschutzbeauftragte/, t); assert.doesNotMatch(t, /"/, "typografische Anführungszeichen: " + t); }
});

test("live: Datenschutz-Bausteine – Kurzsatz wörtlich, du- und ihr-Form mit denselben Feldern, ohne Tippzeit-Wörter", () => {
  const P = new Function("DRAFT_DAYS", "LIVE_IDLE_DAYS", body("const LIVE_SHORT = ", "// Dieselben Bausteine in der „ihr“-Form") + "\nreturn { LIVE_SHORT, LIVE_PRIV_DU, LIVE_PRIV_IHR, PV_LIVE_NOTE };")(7, L.LIVE_IDLE_DAYS);
  assert.equal(P.LIVE_SHORT, "Bei Partner- und Gruppenarbeit arbeitet ihr live zusammen: Was ihr schreibt, wird laufend verschlüsselt auf dem Server dieser Seite gespeichert, damit alle Geräte eurer Gruppe denselben Stand sehen. " +
    "Lesen und ändern kann ihn, wer den Code des Feibeitsblattes, euer Zugangswort und euren Zahlencode kennt – gebt beides nur an eure Gruppe weiter.");
  assert.deepEqual(Object.keys(P.LIVE_PRIV_DU), Object.keys(P.LIVE_PRIV_IHR));
  assert.deepEqual(Object.keys(P.LIVE_PRIV_DU), ["livePurpose", "liveData", "liveItem", "liveStay", "liveChoice", "liveRights"]);
  for (const B of [P.LIVE_PRIV_DU, P.LIVE_PRIV_IHR]) {
    for (const t of Object.values(B)) { assert.doesNotMatch(t, NO_TT, t); assert.doesNotMatch(t, /Server in der EU|Deine Schule|Datenschutzbeauftragte|frag deine Lehrkraft/, t); }
    assert.match(B.liveData, /Art\. 6 Abs\. 1 Buchst\. b DSGVO/);
    assert.match(B.liveData, /Zugangswort und Zahlencode erhält der Server nie/);
    assert.match(B.liveData, /Internetadresse \(IP-Adresse\)/); assert.match(B.liveData, /in welcher Aufgabe gerade geschrieben wird/);
    assert.match(B.liveItem, /liegt in der EU/);
    assert.match(B.liveStay, /30 Tage nach der letzten Änderung/); assert.match(B.liveStay, /§ 25 Abs\. 2 Nr\. 2 TDDDG/); assert.match(B.liveStay, /7 Tage/);
    assert.match(B.liveChoice, /Einzelarbeit/);
  }
  assert.match(P.LIVE_PRIV_IHR.liveData, /eure Antworten/); assert.match(P.LIVE_PRIV_DU.liveData, /eure Antworten|deine Antworten|die Antworten/);
  assert.doesNotMatch(P.PV_LIVE_NOTE, NO_TT);
  // privacyNoticeDom kennt die Option live; die drei Stellen der Kurzfassung
  assert.match(html, /const lv = o\.live/);
  for (const id of ["p-privacy-live", "lj-privacy-live", "privacy-live", "legal-live"]) assert.ok(html.includes(id), id);
});

test("live: Gruppen messen nie Tippzeiten – ttMeasured, Erfassung, Nutzlast (omitted live bzw. group) und die Anzeige der Lehrkraft", () => {
  const tm = new Function("NO_TYPING_KINDS", body("const ttMeasured = ", "\n") + "\nreturn ttMeasured;")(new Set(["map", "photo"]));
  const sh = { tasks: ["a", "b"], answers: [{ type: "text" }, { type: "photo" }] };
  assert.equal(tm(sh), true); assert.equal(tm(sh, false), true);
  assert.equal(tm(sh, true), false);                                   // Gruppe: nie
  assert.equal(tm({ tasks: ["a"], answers: [{ type: "map" }] }, false), false);
  // Erfassung und Abgleich: bei Gruppen kein Zeitpunkt, keine Werte
  assert.match(html, /const ttOff = \(\) => S\.ttOptOut \|\| isGroup\(S\.person\);/);
  assert.match(body("function ttSync(el) {", "\n}\n"), /if \(ttOff\(\)\) \{ el\._evTs = el\._evType = undefined; return; \}/);
  assert.match(body("function answersNow() {", "\n}\n"), /ttOff\(\) \? texts\.map\(\(\) => null\)/);
  assert.match(html, /if \(!ttOff\(\)\) \{ ta\._evType = e\.inputType \|\| ""; ta\._evTs = performance\.now\(\); \}/);
  // Nutzlast von Erstversuch und Abgabe
  const gt = new Function("S", "isGroup", body("const ttGroupPayload = ", "\n") + "\nreturn ttGroupPayload;");
  assert.deepEqual(gt({ live: {}, person: { gruppe: [] } }, (p) => Array.isArray(p.gruppe))(), { v: 1, omitted: "live" });
  assert.deepEqual(gt({ live: null, person: { gruppe: [] } }, (p) => Array.isArray(p.gruppe))(), { v: 1, omitted: "group" });
  assert.equal(gt({ live: null, person: { vorname: "Max" } }, (p) => Array.isArray(p.gruppe))(), null);
  for (const fn of ["async function sendFirstAttempt() {", "async function submitAll() {"]) assert.match(body(fn, "\n}\n"), /ttGroupPayload\(\)/, fn);
  // Lehrkraft
  const T = new Function(blk("TYPING") + "\nreturn { ttCleanPayload, ttDetail };")();
  assert.deepEqual(T.ttCleanPayload({ v: 1, omitted: "live" }, []), { omitted: "live" });
  assert.deepEqual(T.ttCleanPayload({ v: 1, omitted: "group" }, []), { omitted: "group" });
  assert.equal(T.ttCleanPayload({ v: 1, omitted: "sonstwas" }, []), null);
  const sum = (omitted) => T.ttDetail({ typing: { omitted }, answers: [{ first: "a", final: "a" }] }, ["text"], 1, false, true).sum.map((x) => x.t).join("");
  assert.equal(sum("live"), "Tippzeiten: ohne Messung (Live-Gruppenarbeit).");
  assert.equal(sum("group"), "Tippzeiten: ohne Messung (Partner- oder Gruppenarbeit).");
  assert.equal(sum("too_large"), "Tippzeiten: nicht übermittelt – die Abgabe wäre sonst zu groß gewesen.");
});

test("live: im Live-Modus kein Zwischenstand auf dem Gerät und kein Online-Zwischenstand – der Raum ist der Stand", () => {
  const open = body("async function liveOpenEditor(", "\n}\n");
  assert.match(open, /S\.draftKey = "";/);                           // saveDraft speichert ohne Schlüssel nichts
  assert.doesNotMatch(open, /saveDraft\(|store\.set\(S\.draftKey|draftRaw\(/);
  assert.match(open, /liveLastOut\(/);                               // „Weiterschreiben?“ merkt nur Zugangswort und Zahlencode
  assert.match(body("function saveDraft() {", "\n}\n"), /if \(!S\.draftKey \|\| S\.submitted\) return false;/);
  // „Stand als PDF-Datei sichern“: ohne eingebetteten Datensatz, ohne PUT /api/draft
  const pdf = body("function makeLivePdf(", "\n}\n");
  assert.doesNotMatch(pdf, /FbDraft|EmbeddedFile|typing|saveCode/);
  assert.match(pdf, /livePdfHead\(/); assert.match(pdf, /LIVE_PDF_LINE/);
  const click = body('$("ed-pdf").addEventListener("click", async () => {', "\n});\n");
  assert.match(click, /if \(S\.live\) \{ livePdfClick\(\); return; \}/);
  assert.ok(click.indexOf("if (S.live)") < click.indexOf("/api/draft"));
});
