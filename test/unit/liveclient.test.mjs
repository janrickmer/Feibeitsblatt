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
  "LIVE_DONE_PDF, LIVE_DONE_WAIT, LIVE_DONE_GONE, LIVE_DONE_NONE, liveDoneGroup, livePdfHead, LIVE_PDF_LINE, " +
  "LIVE_LOCK_MS, liveKeyIdx, liveSig, liveSolOut, liveCleanSol, LIVE_GROUP_SUB, LIVE_NEXT_BTN, LIVE_DONE_DL, LIVE_FINAL_LOCKED";
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

test("live: Lösungen nach der Abgabe (sol) – alles für die Lösungs-PDF, nie Tippzeiten; fremde Eingabe wird geprüft und gekappt; passt samt Fotos in den Raum", async () => {
  const PH = "data:image/jpeg;base64,/9j/" + "A".repeat(400);
  const deps = { cleanGroup: G.cleanGroup, cleanPhoto: (v) => (typeof v === "string" && v.startsWith("data:image/jpeg;base64,/9j/") ? v : ""), normFb: (r) => ({ covered: (r && r.covered) || [], missing: (r && r.missing) || [] }), max: 8000 };
  const sub = { code: "K7QM4X", title: "Das Gewissen", tasks: ["Aufgabe eins", "Foto"], kinds: ["text", "photo"], person: { gruppe: ["MaxMu", "LiMu"], klasse: "8b" },
    answers: [{ first: "erste", final: "letzte" }, { first: "[Foto]", final: "[Foto]", photo: PH }], feedback: [{ covered: ["a"], missing: ["b"] }, null], feedbackError: "", noAi: "",
    receivedAt: 1790000000000, serverAt: 1790000000123, finalWanted: true, fb2Want: true, fb2State: "loading", fb2Final: false, feedback2: null, checklist: undefined,
    typing: { v: 1 }, attempt: "0123456789abcdef", recipients: ["groq"], fb2Until: 1, gateOpen: false };
  const out = L.liveSolOut(sub, true);
  assert.deepEqual(Object.keys(out).sort(), ["answers", "checklist", "code", "fb2", "feedback", "feedback2", "feedbackError", "finalWanted", "kinds", "noAi", "person", "receivedAt", "tasks", "title", "v"]);
  assert.equal(JSON.stringify(out).includes("typing"), false);   // nie Tippzeiten, keine Kennung, keine Empfänger
  assert.equal(JSON.stringify(out).includes("0123456789abcdef"), false);
  assert.deepEqual([out.fb2, out.checklist, out.receivedAt, out.answers[1].photo], ["pending", null, 1790000000123, PH]);
  assert.equal(L.liveSolOut(sub, false).answers[1].photo, undefined);                    // zu groß: ohne Fotos
  // Stand der finalen KI-Rückmeldung: läuft / da / keine (abgewählt, nicht angeboten, gescheitert, nicht abgewartet)
  assert.equal(L.liveSolOut({ ...sub, fb2State: "" }, true).fb2, "pending");
  assert.equal(L.liveSolOut({ ...sub, fb2State: "failed" }, true).fb2, "none");
  assert.equal(L.liveSolOut({ ...sub, fb2State: "dropped" }, true).fb2, "none");
  assert.equal(L.liveSolOut({ ...sub, fb2Final: true }, true).fb2, "none");
  assert.equal(L.liveSolOut({ ...sub, fb2Want: false, finalWanted: false }, true).fb2, "none");
  const done = L.liveSolOut({ ...sub, fb2State: "done", feedback2: { results: [{ covered: ["gut"], missing: ["fehlt"] }, { covered: [], missing: [] }], final: true, at: "2026-11-24T10:00:00.000Z" }, checklist: { ai: true, points: [["Punkt"], []] } }, true);
  assert.deepEqual([done.fb2, done.feedback2.final, done.checklist], ["done", true, { ai: true, points: [["Punkt"], []] }]);
  assert.equal(L.liveSolOut({ ...sub, checklist: false }, true).checklist, false);
  // … und zurück: derselbe Datensatz für makeSolutionsPdf
  const back = L.liveCleanSol(JSON.parse(JSON.stringify(done)), deps);
  assert.deepEqual(back.answers, sub.answers);
  assert.deepEqual([back.code, back.title, back.tasks, back.kinds, back.person, back.receivedAt, back.finalWanted, back.fb2], ["K7QM4X", "Das Gewissen", sub.tasks, sub.kinds, sub.person, 1790000000123, true, "done"]);
  assert.deepEqual(back.feedback, [{ covered: ["a"], missing: ["b"] }, null]);
  assert.deepEqual(back.feedback2.results[0], { covered: ["gut"], missing: ["fehlt"] });
  assert.deepEqual(back.checklist, { ai: true, points: [["Punkt"], []] });
  // fremde Eingabe: Unbrauchbares → null; Zusätze entfallen, Längen gekappt, Fotos nur geprüft
  for (const bad of [null, "x", [], { v: 2 }, { v: 1, code: "K7QM4X", answers: [], person: { gruppe: ["Nur"], klasse: "8b" } }, { v: 1, code: "k7", answers: [], person: sub.person }]) assert.equal(L.liveCleanSol(bad, deps), null);
  const evil = L.liveCleanSol({ v: 1, code: "K7QM4X", title: "T".repeat(999), tasks: [1, "x".repeat(9999)], kinds: ["text", "geheim"], person: { gruppe: ["MaxMu", "LiMu"], klasse: "8b", extra: 1 },
    answers: [{ first: "a".repeat(9000), final: 7, photo: "javascript:alert(1)" }, "kaputt"], feedback: "x", feedback2: { results: "x" }, noAi: "frei", receivedAt: -5, finalWanted: "ja", fb2: "sonstwas", checklist: { points: [[1, " ", "p".repeat(500)]] }, typing: { v: 1 }, __proto__: { x: 1 } }, deps);
  assert.deepEqual([evil.title.length, evil.tasks, evil.kinds], [200, ["", "x".repeat(4000)], ["text", "text"]]);
  assert.deepEqual(evil.answers, [{ first: "a".repeat(8000), final: "" }, { first: "", final: "" }]);
  assert.deepEqual([evil.feedback, evil.feedback2, evil.noAi, evil.receivedAt, evil.finalWanted, evil.fb2, evil.typing], [null, null, "", 0, undefined, "none", undefined]);
  assert.deepEqual(evil.checklist, { ai: false, points: [["p".repeat(160)]] });
  assert.deepEqual(Object.keys(evil.person), ["gruppe", "klasse"]);
  assert.equal(L.liveCleanSol({ ...JSON.parse(JSON.stringify(done)), fb2: "pending", feedback2: null }, deps).fb2, "pending");
  // die größte Abgabe (3 Fotos mit je 200 KB, lange Texte) passt verschlüsselt in den Raum; ohne Fotos erst recht
  const big = "data:image/jpeg;base64,/9j/" + "B".repeat(4 * Math.ceil(200 * 1024 / 3) - 4);
  const large = L.liveSolOut({ ...sub, tasks: Array(6).fill("t".repeat(4000)), kinds: ["text", "text", "text", "photo", "photo", "photo"],
    answers: [...Array(3).fill({ first: "ä".repeat(8000), final: "ö".repeat(8000) }), ...Array(3).fill({ first: "[Foto]", final: "[Foto]", photo: big })], feedback: null }, true);
  const { key } = await L.liveDerive(subtle, "K7QM4X", "birke", "48213", 1000);
  const sealed = await L.liveSeal(subtle, key, large, rnd);
  assert.ok(isLiveValue(sealed, LIVE.solValue), "passt: " + sealed.length);
  assert.deepEqual(await openLive(key, sealed), JSON.parse(JSON.stringify(large)));
});

test("live: Schlüssel, Vergleichswert, Dauer der Sperre – wie beim Raum", () => {
  assert.equal(L.LIVE_LOCK_MS, LIVE.lockMs);
  assert.deepEqual([L.liveKeyIdx("a0", "a"), L.liveKeyIdx("a12", "a"), L.liveKeyIdx("f3", "f"), L.liveKeyIdx("f3", "a"), L.liveKeyIdx("a01", "a"), L.liveKeyIdx("fs", "f"), L.liveKeyIdx(null, "a")], [0, 12, 3, -1, -1, -1, -1]);
  assert.equal(L.liveSig({ t: "Text", p: "" }), "Text");
  assert.notEqual(L.liveSig({ t: "[Foto]", p: "data:1" }), L.liveSig({ t: "[Foto]", p: "data:2" }));   // anderes Foto, gleiche Textform
  assert.equal(L.liveSig(null), "");
});

test("live: im Skript – Takt beim Tippen, der Schreibende wird nie überschrieben, erst die Gruppe fragen, Zusage vor jeder Anfrage an die KI und vor der Abgabe", () => {
  // Eingaben gehen im Live-Modus an den Raum (getippt: Vorschau und spätes Speichern; Weltkarte und Foto sofort), sonst in den Zwischenstand
  assert.match(body("function answerChanged(el) {", "\n}\n"), /if \(S\.live\) liveInput\(ta\._idx, el\.tagName === "TEXTAREA"\); else scheduleSave\(\);/);
  const inp = body("function liveInput(i, typed) {", "\n}\n");
  assert.match(inp, /if \(!typed\) \{ liveSave\(i, true\);/);
  assert.match(inp, /Math\.max\(0, m\.pvAt \+ LIVE_PV_MS - now\)/);
  assert.match(inp, /LIVE_SET_IDLE_MS\)/); assert.match(inp, /LIVE_SET_MAX_MS\)/); assert.match(inp, /LIVE_UNLOCK_MS\)/);
  // Vorschau und Speichern bleiben unter der Grenze des Raums; Fotos nie als Vorschau
  assert.match(body("function livePreview(i) {", "\n}\n"), /t\._kind === "photo"\) return;[\s\S]*liveBudget\(L\.times, now, LIVE_PV_BUDGET\)/);
  const save = body("function liveSave(i, release) {", "\n}\n");
  assert.match(save, /if \(m\.sent != null \|\| !L\.open\) return;/);            // nie zwei Speicherungen derselben Aufgabe gleichzeitig
  assert.match(save, /liveBudget\(L\.times, now, LIVE_SET_BUDGET\)/);
  assert.match(save, /\{ t: "set", k: "a" \+ i, base: m\.base \}/);                 // mit der Version, auf der die Eingabe aufsetzt
  // der Raum lehnt ab: „stale“ mit genau dem eigenen Stand (nur die Bestätigung ging verloren) ist kein Verlust – sonst gewinnt der Raum
  const deny = body("async function liveOnDeny(L, m) {", "\n}\n");
  assert.match(deny, /if \(why === "stale" && me && liveSig\(L\.val\[k\] \|\| LIVE_EMPTY\) === liveSig\(liveLocal\(i\)\)\)/);
  assert.match(deny, /if \(why === "locked" && L\.own\.has\(String\(m\.by\)\)\) \{ retry\(3000\); return; \}/);   // die eigene, abgerissene Verbindung: Text behalten, erneut senden
  assert.match(deny, /if \(why === "stale"\) liveNote\(i, LIVE_HINT_STALE\);/);
  // freigegeben wird erst nach der Bestätigung des Speicherns
  assert.match(body("function liveOnAck(L, m) {", "\n}\n"), /else if \(me\.rel\) liveUnlock\(i\);/);
  // Nachrichten des Raums überschreiben kein Feld mit einer eigenen offenen Eingabe
  const msg = body("async function liveOnMessage(L, raw) {", "\n}\n") + body("async function liveOnSet(L, m) {", "\n}\n");
  assert.equal((msg.match(/if \(!liveMineBusy\(L, i[a]?\)\) liveShow\(i[a]?\);/g) || []).length, 3);   // lock frei, Vorschau, Speichern
  assert.doesNotMatch(body("function liveApply(i, v) {", "\n}\n"), /\.focus\(|scrollIntoView|answerChanged\(|liveInput\(/);   // kein Fokus, kein Scrollen, kein erneutes Senden
  // Alles Entschlüsselte geht durch die Prüfungen; ein unlesbarer Wert bricht nichts ab
  assert.ok(html.includes("async function liveOpenVal(L, v) { try { return await liveOpen(subtle, L.key, v); } catch (e) { return null; } }"));
  // KI-Feedback und Abgabe: immer zuerst das eigene Fenster, dann der bisherige Dialog (dessen „OK“ ein Doppelklick nicht gleich mitbestätigt)
  const rf = body("async function requestFeedback(target) {", "\n}\n"), sa = body("async function submitAll() {", "\n}\n");
  assert.ok(rf.indexOf("askConfirm(LIVE_ASK_FB)") > 0 && rf.indexOf("askConfirm(LIVE_ASK_FB)") < rf.indexOf("askConfirm(Object.assign({ guard: !!S.live }"));
  assert.ok(sa.indexOf("askConfirm(LIVE_ASK_SUBMIT)") > 0 && sa.indexOf("askConfirm(LIVE_ASK_SUBMIT)") < sa.indexOf("askConfirm(Object.assign({ guard: !!S.live }, submitDialog("));
  assert.match(html, /dlgGuardUntil = o\.guard \? dlgOpenedAt \+ 500 : 0;/);
  // ohne Zusage des Raums geht nichts an die KI bzw. an /api/submit
  assert.ok(rf.indexOf("await liveClaim()") > 0 && rf.indexOf("await liveClaim()") < rf.indexOf('api("POST", "/api/feedback"'));
  assert.ok(rf.indexOf("livePushFb(sel())") > rf.indexOf('api("POST", "/api/feedback"'));
  assert.ok(sa.indexOf("await liveClaimSub()") > 0 && sa.indexOf("await liveClaimSub()") < sa.indexOf("await sendSealed(payload"));
  assert.ok(sa.indexOf("liveSettle(S.live)") < sa.indexOf("const now = answersNow();"));   // abgegeben wird der gespeicherte gemeinsame Stand
  assert.ok(sa.indexOf("liveSubmitted(S.lastSubmission)") > sa.indexOf("await sendSealed(payload"));
  assert.match(sa, /if \(S\.live\) liveUnsub\(\);/);
  // Lösungen der anderen: nach Checkliste, finaler Rückmeldung bzw. deren Ausbleiben nachgereicht
  for (const fn of ["function fb2Drop(sub) {", "function finalFeedbackGone(sub) {", "function fb2LoadChecklist(sub) {", "async function requestFinalFeedback() {", "function finalFeedbackFailed(e) {"]) assert.match(body(fn, "\n}\n"), /liveSolPush\(sub\)/, fn);
  // Verbindung: erst nachfragen (POST /api/live/join), wachsende Pause, Lebenszeichen
  const lost = body("async function liveLost(L, gen, code, hadInit) {", "\n}\n");
  assert.match(lost, /if \(code === 4404\) \{ liveGone\(L\); return; \}/);
  assert.match(lost, /if \(!hadInit && code !== 4409\)[\s\S]*"\/api\/live\/join"/);
  assert.match(lost, /liveRetryMs\(L\.retry\+\+\)/);
  assert.match(body("function livePing(L) {", "\n}\n"), /L\.ws\.send\("ping"\)[\s\S]*LIVE_PONG_MS/);
  for (const ev of ['window.addEventListener("online", liveKick);', 'window.addEventListener("pagehide", liveFlushNow);']) assert.ok(html.includes(ev), ev);
  // zurücksetzen trennt die Verbindung; der lokale Weg (openEditor) ist nie live
  assert.match(body("function resetStudent() {", "\n}\n"), /liveClose\(S\.live\);/);
  assert.match(body("async function openEditor(fromPerson) {", "\n}\n"), /^[^\n]*\n  liveClose\(S\.live\); liveEditorLabels\(false\);/);
  // Gruppen: nie Messfelder (auch ohne Live-Verbindung)
  assert.match(body("async function openEditor(fromPerson) {", "\n}\n"), /if \(S\.ttOptOut \|\| isGroup\(p\)\) ttResetAll\(false\);/);
});

test("live: das Skript der Seite ist als Ganzes syntaktisch gültig (ein Fehler dort legte die ganze Seite still)", () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 3);
  for (const src of scripts) assert.doesNotThrow(() => new Function(src));   // nur übersetzen, nicht ausführen
});
