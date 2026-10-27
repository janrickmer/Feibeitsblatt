// typing.test.mjs – Tippzeiten: die reinen Hilfsfunktionen aus index.html (Block TYPING:BEGIN … TYPING:END)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LIMITS } from "../../worker/lib.js";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const i = html.indexOf("/* TYPING:BEGIN"), j = html.indexOf("/* TYPING:END */");
const block = html.slice(i, j);
const NAMES = "TT_RED_MS, TT_YELLOW_MS, TT_SLOW, TT_NONE, TT_HIGH_PCT, TT_MAX_LEN, TT_B64_MAX, TT_ENV_MAX, TT_UNDO_MAX, TT_UNDO_CHARS, TT_SEG_MAX, " +
  "TT_KEEP_IN_DRAFT, cellText, tableText, tableRows, ttDiff, ttNew, ttApply, ttCodes, ttClass, ttEncode, ttDecode, ttGraphemes, ttSegments, " +
  "ttShare, ttHigh, ttCellText, ttTableText, ttTableCells, ttTableLines, ttEnvelopeFits, ttHasData, ttDraftOut, ttCleanDraft, ttCleanPayload, " +
  "ttShareParts, ttPctText, ttSummary, TT_ZERO_NOTE";
// Intl als Parameter: so lässt sich der Rückfall ohne Intl.Segmenter (Firefox vor Version 125) prüfen
const load = (src, intl) => new Function("Intl", src + "\nreturn { " + NAMES + " };")(intl === undefined ? Intl : intl);
const T = load(block);
const {
  TT_SLOW, TT_NONE, TT_B64_MAX, TT_ENV_MAX, TT_UNDO_MAX, TT_UNDO_CHARS, TT_SEG_MAX, TT_KEEP_IN_DRAFT,
  cellText, tableText, tableRows, ttDiff, ttNew, ttApply, ttCodes, ttClass, ttEncode, ttDecode, ttGraphemes, ttSegments,
  ttShare, ttHigh, ttCellText, ttTableText, ttTableCells, ttTableLines, ttEnvelopeFits, ttHasData, ttDraftOut, ttCleanDraft, ttCleanPayload,
  ttShareParts, ttPctText, ttSummary, TT_ZERO_NOTE,
} = T;

const codesOf = (tt) => Array.from(ttCodes(tt));
/* Tippen wie im Browser: je Zeichen ein Ereignis (Zeitpunkte in ms), am Ende angehängt */
function typeText(tt, text, t0, gap) { let t = t0; for (const ch of text) { ttApply(tt, tt.text + ch, t, "insertText"); t += gap; } return t; }
// deterministischer Zufall (Eigenschaftstests sollen bei jedem Lauf gleich sein)
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const randCode = (r) => (r() < 0.15 ? TT_NONE : Math.floor(r() * (TT_SLOW + 1)));

test("typing: Block in index.html gefunden, Grenzen", () => {
  assert.ok(i > 0 && j > i);
  assert.equal(TT_SLOW, 71);
  assert.equal(TT_NONE, 255);
  assert.equal(TT_B64_MAX, 4 * Math.ceil(T.TT_MAX_LEN / 3));
  assert.equal(TT_ENV_MAX, LIMITS.envelopeBytes);   // dieselbe Grenze wie validateEnvelope im Worker
  assert.equal(T.TT_MAX_LEN, LIMITS.answer + 100);   // wie die Kappung der Antworten in loadSubs
  assert.equal(typeof TT_KEEP_IN_DRAFT, "boolean");
  // der Block hängt von nichts aus der übrigen Seite ab (kein $, S, h, document, b64/unb64)
  assert.doesNotMatch(block, /\bdocument\b|\bwindow\b|[^\w.]S\.|\$\(|\bunb64\(|[^\w]b64\(/);
});

test("typing: Klassen – ≤ 15 ms rot, ≤ 70 ms gelb, sonst grün, 255 ohne Färbung", () => {
  assert.equal(ttClass(0), "r");
  assert.equal(ttClass(15), "r");
  assert.equal(ttClass(16), "y");
  assert.equal(ttClass(70), "y");
  assert.equal(ttClass(71), "g");
  assert.equal(ttClass(255), "");
});

test("typing: Werte – erstes Zeichen 71, aufgerundet, negativ 71, unbekannt, eingefroren, Leerraum", () => {
  // erstes Zeichen → 71; ceil: 15,25 → 16; genau 70 → 70; 70,0078125 → 71 (Zeitpunkte exakt darstellbar)
  const tt = ttNew("", null);
  ttApply(tt, "a", 1000, "insertText");
  assert.deepEqual(codesOf(tt), [71]);
  ttApply(tt, "ab", 1015.25, "insertText");
  ttApply(tt, "abc", 1085.25, "insertText");
  ttApply(tt, "abcd", 1155.2578125, "insertText");
  assert.deepEqual(codesOf(tt), [71, 16, 70, 71]);
  ttApply(tt, "abcde", 1155.2578125 + 15.2, "insertText");   // 15,2 → 16 (gelb)
  assert.equal(codesOf(tt)[4], 16);
  // Leerraum → 255
  const w = ttNew("", null);
  typeText(w, "a b\nc\td", 0, 5);
  assert.deepEqual(codesOf(w), [71, 255, 5, 255, 5, 255, 5]);
  // negativer Abstand (eingefügt mitten im Text): das Folgezeichen ist grün, nie rot
  const m = ttNew("", null);
  typeText(m, "ac", 1000, 100);
  ttApply(m, "abc", 2000, "insertText");
  assert.deepEqual(codesOf(m), [71, 71, 71]);
  // unbekannt ohne g → 255; Vorgänger unbekannt → 71
  const u = ttNew("Ha", null);
  assert.deepEqual(codesOf(u), [255, 255]);
  ttApply(u, "Hal", 3000, "insertText");
  assert.deepEqual(codesOf(u), [255, 255, 71]);
  // eingefroren (aus dem Zwischenstand) bleibt – auch wenn davor etwas eingefügt wird; neues Zeichen dahinter = Pause
  const f = ttNew("Ha", Uint8Array.from([3, 40]));
  assert.deepEqual(codesOf(f), [3, 40]);
  ttApply(f, "Hal", 5000, "insertText");
  ttApply(f, "xHal", 5001, "insertText");
  assert.deepEqual(codesOf(f), [71, 3, 40, 71]);
});

test("typing: Ereignisse – langsam, mehrere Zeichen auf einmal, Ersetzen, Komposition, Rücknahme", () => {
  const s = ttNew("", null);
  typeText(s, "Hallo", 0, 120);
  assert.deepEqual(codesOf(s), [71, 71, 71, 71, 71]);
  // Wortvorschlag: das erste Zeichen gemessen, die weiteren 0 ms
  const v = ttNew("", null);
  const t = typeText(v, "Ich ", 0, 120);
  assert.equal(ttApply(v, "Ich Wort", t + 150, "insertText"), true);
  assert.deepEqual(codesOf(v), [71, 71, 71, 255, 71, 0, 0, 0]);
  // Autokorrektur „teh“ → „the“: nur die geänderte Stelle neu (h gemessen, e 0 ms)
  const a = ttNew("", null);
  typeText(a, "teh", 1000, 100);
  ttApply(a, "the", 2000, "insertReplacementText");
  assert.deepEqual(codesOf(a), [71, 71, 0]);
  // Safari: deleteCompositionText ändert nichts, das folgende insertFromComposition mit gleichem Text auch nicht
  const c = ttNew("", null);
  typeText(c, "Haus", 0, 100);
  const before = codesOf(c), ver = c.ver;
  assert.equal(ttApply(c, "", 900, "deleteCompositionText"), false);
  assert.equal(c.text, "Haus");
  assert.equal(ttApply(c, "Haus", 901, "insertFromComposition"), false);
  assert.deepEqual(codesOf(c), before);
  assert.equal(c.ver, ver);
  // Rücknahme der Einfügesperre auf den alten Text: keine Änderung
  assert.equal(ttApply(c, "Haus", 950, "insertText"), false);
  // Länge stimmt nach jeder Art von Änderung
  for (const next of ["", "Maus", "Hausmaus", "aus", "H", "Haus"]) { ttApply(c, next, 1000, "insertText"); assert.equal(c.recs.length, next.length); }
});

test("typing: Abgleich – gemeinsamer Anfang/Ende, kein geteiltes Ersatzzeichen-Paar, Cursor bei gleichen Nachbarn", () => {
  assert.deepEqual(ttDiff("Haus", "Hauts"), { at: 3, del: 0, ins: "t" });
  assert.deepEqual(ttDiff("teh", "the"), { at: 1, del: 2, ins: "he" });
  assert.deepEqual(ttDiff("x😀", "x😃"), { at: 1, del: 2, ins: "😃" });   // 😀 → 😃: gleicher hoher Teil
  assert.deepEqual(ttDiff("😀y", "🈀y"), { at: 0, del: 2, ins: "🈀" });   // gleicher niedriger Teil
  assert.deepEqual(ttDiff("a", "a😀"), { at: 1, del: 0, ins: "😀" });
  // „aa“ → „aaa“: ohne Cursor am Ende des gemeinsamen Anfangs, mit Cursor (nach dem neuen Zeichen an Stelle 1) dort
  assert.deepEqual(ttDiff("aa", "aaa"), { at: 2, del: 0, ins: "a" });
  assert.deepEqual(ttDiff("aa", "aaa", 2), { at: 1, del: 0, ins: "a" });
  assert.deepEqual(ttDiff("Hallo", "Halo"), { at: 3, del: 1, ins: "" });
  assert.deepEqual(ttDiff("Hallo", "Halo", 2), { at: 2, del: 1, ins: "" });
  // unpassender Cursor → wie ohne
  assert.deepEqual(ttDiff("aa", "aaa", 0), { at: 2, del: 0, ins: "a" });
  assert.deepEqual(ttDiff("abab", "ababab", 1), { at: 4, del: 0, ins: "ab" });
  assert.deepEqual(ttDiff("abab", "ababab", 2), { at: 0, del: 0, ins: "ab" });
  assert.deepEqual(ttDiff("abab", "ababab", 3), { at: 1, del: 0, ins: "ba" });   // auch das passt: „a|ba|bab“
  assert.deepEqual(ttDiff("teh", "the", 1), { at: 1, del: 2, ins: "he" });   // Ersetzen: Cursor zählt nicht
  // nie mitten in einem Paar, auch mit Cursor
  assert.deepEqual(ttDiff("😀😀", "😀😀😀", 3), { at: 4, del: 0, ins: "😀" });
  // mit Cursor bekommt das wirklich getippte Zeichen die neue Zeit
  const tt = ttNew("", null);
  typeText(tt, "aa", 1000, 100);
  ttApply(tt, "aaa", 1150, "insertText", 2);
  assert.deepEqual(codesOf(tt), [71, 71, 71]);   // 1000, 1150, 1100 (Folgezeichen negativ → 71)
  const t2 = ttNew("", null);
  typeText(t2, "aa", 1000, 100);
  ttApply(t2, "aaa", 1150, "insertText");
  assert.deepEqual(codesOf(t2), [71, 71, 50]);
});

test("typing: Rückgängig/Wiederholen holen die alten Zeiten zurück, Puffer gekappt", () => {
  // fünfmal Rücktaste, dann Rückgängig „Hallo“ → wieder die alten Zeiten (gelb), nicht rot
  const tt = ttNew("", null);
  typeText(tt, "Hallo", 1000, 30);
  assert.deepEqual(codesOf(tt), [71, 30, 30, 30, 30]);
  for (let k = 0; k < 5; k++) ttApply(tt, tt.text.slice(0, -1), 2000 + k * 100, "deleteContentBackward");
  assert.equal(tt.text, "");
  assert.equal(tt.undo.length, 1);
  assert.equal(tt.undo[0].text, "Hallo");
  ttApply(tt, "Hallo", 5000, "historyUndo");
  assert.deepEqual(codesOf(tt), [71, 30, 30, 30, 30]);
  // Entf hintereinander ergeben ebenfalls einen Abschnitt
  const e = ttNew("", null);
  typeText(e, "Welt!", 1000, 30);
  for (let k = 0; k < 4; k++) ttApply(e, e.text.slice(1), 2000 + k, "deleteContentForward");
  assert.equal(e.undo[0].text, "Welt");
  ttApply(e, "Welt!", 3000, "historyUndo");
  assert.deepEqual(codesOf(e), [71, 30, 30, 30, 30]);   // auch „!“ hat wieder seinen alten Vorgänger
  // Wiederholen nach Rückgängig: Tippen rückgängig (= Löschen), dann wiederholen
  const r = ttNew("", null);
  typeText(r, "Hey", 1000, 40);
  ttApply(r, "", 2000, "historyUndo");
  ttApply(r, "Hey", 2100, "historyRedo");
  assert.deepEqual(codesOf(r), [71, 40, 40]);
  // kein Treffer im Puffer → wie ein Ereignis (rot ab dem zweiten Zeichen)
  const n = ttNew("", null);
  ttApply(n, "Welt", 1000, "historyUndo");
  assert.deepEqual(codesOf(n), [71, 0, 0, 0]);
  // nur beim Rückgängigmachen: dasselbe Wort neu getippt in einem Zug bleibt rot
  const p = ttNew("", null);
  typeText(p, "Hallo", 1000, 30);
  ttApply(p, "", 2000, "deleteContentBackward");
  ttApply(p, "Hallo", 3000, "insertText");
  assert.deepEqual(codesOf(p), [71, 0, 0, 0, 0]);
  // Kappung: höchstens TT_UNDO_MAX Abschnitte …
  const k = ttNew("", null);
  typeText(k, "abc", 0, 100);
  for (let x = 0; x < 25; x++) { ttApply(k, k.text + "x", 1000 + x * 10, "insertText"); ttApply(k, k.text.slice(0, -1), 1005 + x * 10, "deleteContentBackward"); }
  assert.equal(k.undo.length, TT_UNDO_MAX);
  // … und höchstens TT_UNDO_CHARS Zeichen (ein zu großer Abschnitt wird gar nicht gemerkt)
  const big = ttNew("y".repeat(TT_UNDO_CHARS + 1), null);
  ttApply(big, "", 1000, "deleteContentBackward");
  assert.equal(big.undo.length, 0);
  const two = ttNew("a".repeat(3000) + "b".repeat(2000), null);
  ttApply(two, "a".repeat(3000), 1000, "deleteContentBackward");   // 2000 b
  ttApply(two, "a".repeat(3000) + "c", 1001, "insertText");
  ttApply(two, "c", 1002, "deleteContentBackward");                // 3000 a → zusammen 5000 > 4000
  assert.deepEqual(two.undo.map((u) => u.text.length), [3000]);
});

test("typing: Rückgängig holt auch eingefrorene Werte und ein ersetztes Wort zurück; Löschen mit Cursor trifft die gelöschte Stelle", () => {
  // eingefroren (aus dem Zwischenstand): Rücktaste bis leer, dann Rückgängig → wieder genau diese Werte
  const f = ttNew("Haus", Uint8Array.from([71, 3, 40, 0]));
  for (let k = 0; k < 4; k++) ttApply(f, f.text.slice(0, -1), 1000 + k * 100, "deleteContentBackward");
  ttApply(f, "Haus", 2000, "historyUndo");
  assert.deepEqual(codesOf(f), [71, 3, 40, 0]);
  // Wort markiert und überschrieben, dann Rückgängig: das alte Wort mit seinen Zeiten, nicht rot
  const w = ttNew("", null);
  typeText(w, "Ein Wort", 1000, 30);
  assert.deepEqual(codesOf(w), [71, 30, 30, 255, 30, 30, 30, 30]);
  ttApply(w, "Ein x", 5000, "insertText", 5);
  assert.deepEqual(codesOf(w), [71, 30, 30, 255, 71]);
  ttApply(w, "Ein Wort", 6000, "historyUndo");
  assert.deepEqual(codesOf(w), [71, 30, 30, 255, 30, 30, 30, 30]);
  // „Hallo“ → „Halo“: mit Cursor (nach der Rücktaste an Stelle 2) verschwindet das erste „l“, ohne ihn das zweite
  const h = () => { const tt = ttNew("", null); typeText(tt, "Hallo", 0, 30); return tt; };   // Zeitpunkte 0, 30, 60, 90, 120
  const c1 = h(); ttApply(c1, "Halo", 500, "deleteContentBackward", 2);
  assert.deepEqual(codesOf(c1), [71, 30, 60, 30]);
  const c2 = h(); ttApply(c2, "Halo", 500, "deleteContentBackward");
  assert.deepEqual(codesOf(c2), [71, 30, 30, 60]);
  // Werte und Text passen nicht zusammen (nur bei manipuliertem Zustand) → null statt falscher Werte
  const bad = ttNew("ab", null); bad.recs.pop();
  assert.equal(ttCodes(bad), null);
});

test("typing: langsam getippt bleibt grün – egal wo eingefügt, gelöscht oder ersetzt wird (Eigenschaftstest)", () => {
  const r = rng(1104), pool = ["a", "B", "ä", "ß", " ", "\n", "😀", "e", "́", "x"];
  // Stellen zwischen Codepunkten (ein Cursor steht nie mitten in einem Ersatzzeichen-Paar)
  const stops = (s) => { const o = [0]; for (let x = 0; x < s.length;) { x += s.codePointAt(x) > 0xffff ? 2 : 1; o.push(x); } return o; };
  for (let run = 0; run < 60; run++) {
    const tt = ttNew("", null);
    let t = 1000;
    for (let k = 0; k < 80; k++) {
      t += 71 + Math.floor(r() * 300);   // jedes Ereignis mehr als 70 ms nach dem vorigen
      const s = tt.text, st = stops(s), op = r();
      let a = pick(r, st), b = pick(r, st);
      if (a > b) [a, b] = [b, a];
      if (op < 0.6 || !s) { const ch = pick(r, pool); ttApply(tt, s.slice(0, a) + ch + s.slice(a), t, "insertText", a + ch.length); }
      else if (op < 0.85) { if (b === a) continue; ttApply(tt, s.slice(0, a) + s.slice(b), t, "deleteContentBackward", a); }
      else { const ch = pick(r, pool); ttApply(tt, s.slice(0, a) + ch + s.slice(b), t, "insertText", a + ch.length); }
      assert.equal(tt.recs.length, tt.text.length);
      const c = ttCodes(tt), gs = ttGraphemes(tt.text);
      assert.equal(c.length, tt.text.length);
      for (let g = 0; g < gs.length - 1; g++) {
        const i = gs[g];
        if (/\s/.test(tt.text[i])) assert.equal(c[i], TT_NONE);
        else assert.equal(c[i], TT_SLOW, JSON.stringify([tt.text, i]));
      }
      const sh = ttShare([[tt.text, c]]);
      assert.equal(sh.r + sh.y, 0);
      assert.ok(ttSegments(tt.text, c).every((x) => x.c === "g" || x.c === ""));
    }
  }
});

test("typing: mehrere Zeichen in einem Ereignis – das erste gemessen, jedes weitere Graphem rot mit 0 ms (Eigenschaftstest)", () => {
  const r = rng(77), pool = ["a", "B", "ä", "ß", " ", " ", "\n", "😀", "👍🏽", "é", "Wort"];
  for (let run = 0; run < 200; run++) {
    const tt = ttNew("", null);
    let t = 0, red = 0, measured = 0;
    for (let k = 0, n = 1 + Math.floor(r() * 8); k < n; k++) {
      let chunk = ""; for (let x = 0, m = 1 + Math.floor(r() * 4); x < m; x++) chunk += pick(r, pool);
      t += 71 + Math.floor(r() * 500);
      ttApply(tt, tt.text + chunk, t, "insertText");
      const gs = ttGraphemes(chunk);
      for (let g = 0; g < gs.length - 1; g++) {
        if (/\s/.test(chunk[gs[g]])) continue;
        measured++;
        if (g > 0) red++;   // Vorgänger im selben Ereignis (auch ein Leerzeichen davor) → 0 ms
      }
    }
    const sh = ttShare([[tt.text, ttCodes(tt)]]);
    assert.deepEqual([sh.n, sh.r, sh.zero, sh.y, sh.none], [measured, red, red, 0, 0], JSON.stringify(tt.text));
  }
});

test("typing: Base64 wie Buffer in Node – Lehrkraft-Seite und Tests lesen dieselben Bytes", () => {
  const r = rng(3);
  for (const n of [0, 1, 2, 3, 4, 5, 8100, 0x8000 - 1, 0x8000, 0x8000 + 5, 3 * 0x8000 + 2]) {
    const codes = Uint8Array.from({ length: n }, () => randCode(r)), s = ttEncode(codes);
    assert.equal(s, Buffer.from(codes).toString("base64"), "Länge " + n);   // auch über die Blockgrenze von ttEncode hinweg
    if (n <= T.TT_MAX_LEN) assert.deepEqual(Array.from(ttDecode(Buffer.from(codes).toString("base64"), "x".repeat(n))), Array.from(codes));
  }
});

test("typing: Emoji und kombinierte Zeichen in einem Ereignis zählen als ein Graphem mit dem Wert der ersten Einheit", () => {
  for (const g of ["😀", "👍🏽", "é", "🇩🇪", "👨‍👩‍👧"]) {
    const tt = ttNew("", null);
    typeText(tt, "a", 1000, 0);
    ttApply(tt, "a" + g, 1200, "insertText");
    const c = ttCodes(tt);
    assert.equal(c[1], 71);
    const sh = ttShare([[tt.text, c]]);
    assert.deepEqual([sh.n, sh.r, sh.g], [2, 0, 2], JSON.stringify(g));
    const segs = ttSegments(tt.text, c);
    assert.deepEqual(segs, [{ s: tt.text, c: "g" }]);
  }
});

test("typing: Grapheme – Intl.Segmenter und Rückfall ohne ihn", () => {
  const F = load(block, {});   // Intl ohne Segmenter
  const texts = ["", "abc", "a😀b", "éx", "👍🏽!", "🇩🇪🇫🇷",
    "👨‍👩‍👧 ok", "❤️\nä"];
  for (const s of texts) assert.deepEqual(F.ttGraphemes(s), ttGraphemes(s), JSON.stringify(s));
  assert.deepEqual(ttGraphemes("a😀b"), [0, 1, 3, 4]);
  assert.deepEqual(ttGraphemes(""), [0]);
  // auch Intl ganz ohne Segmenter-Konstruktor (wirft) bricht nichts
  const G = load(block, { get Segmenter() { throw new Error("nein"); } });
  assert.deepEqual(G.ttGraphemes("ab"), [0, 1, 2]);
});

test("typing: Base64 – Rundlauf, abgelehnt wird alles, was nicht genau passt", () => {
  const r = rng(7);
  for (let n of [0, 1, 2, 3, 100, 8100]) {
    const codes = Uint8Array.from({ length: n }, () => randCode(r)), text = "x".repeat(n), s = ttEncode(codes);
    assert.deepEqual(Array.from(ttDecode(s, text)), Array.from(codes));
  }
  const ok = ttEncode(Uint8Array.from([0, 71, 255]));
  assert.ok(ttDecode(ok, "abc"));
  assert.equal(ttDecode(ok, "ab"), null);            // falsche Länge
  assert.equal(ttDecode(ok, "abcd"), null);
  assert.equal(ttDecode(null, ""), null);            // kein String
  assert.equal(ttDecode(5, "a"), null);
  assert.equal(ttDecode(ok, null), null);
  assert.equal(ttDecode(ttEncode(Uint8Array.from([0, 72, 1])), "abc"), null);    // 72 ungültig
  assert.equal(ttDecode(ttEncode(Uint8Array.from([0, 254, 1])), "abc"), null);   // 254 ungültig
  assert.equal(ttDecode("AAA", "aa"), null);          // keine Vierergruppe
  assert.equal(ttDecode("A@AA", "abc"), null);        // fremde Zeichen
  assert.equal(ttDecode("A=AA", "abc"), null);
  assert.equal(ttDecode("AAAAAAAA".repeat(TT_B64_MAX / 8 + 1), "x".repeat(6 * (TT_B64_MAX / 8 + 1))), null);   // zu lang
  assert.equal(ttDecode(ttEncode(new Uint8Array(8101)), "x".repeat(8101)), null);
});

test("typing: Abschnitte für die Anzeige – Verkettung = Text, Leerzeichen, \\n, ohne Werte, Obergrenze", () => {
  const r = rng(42), parts = ["a", "b", "Ä", " ", "  ", "\n", "😀", "é", "👍🏽", "\t", " "];
  for (let k = 0; k < 300; k++) {
    let text = ""; const len = Math.floor(r() * 30);
    for (let x = 0; x < len; x++) text += pick(r, parts);
    const codes = Uint8Array.from({ length: text.length }, () => randCode(r));
    const segs = ttSegments(text, codes);
    assert.equal(segs.map((s) => s.s).join(""), text);
    const starts = new Set(ttGraphemes(text));
    let pos = 0;
    for (const s of segs) { assert.ok(starts.has(pos), "nie mitten im Graphem"); pos += s.s.length; }
    for (let x = 1; x < segs.length; x++) assert.notEqual(segs[x].c, segs[x - 1].c);   // zusammengefasst
    for (const s of segs) if (s.c) assert.doesNotMatch(s.s, /\n/);
  }
  const R = (t) => Uint8Array.from(Array.from(t, (ch) => (/\s/.test(ch) ? 255 : 0)));
  assert.deepEqual(ttSegments("ab cd", R("ab cd")), [{ s: "ab cd", c: "r" }]);          // Leerzeichen übernimmt die Klasse
  assert.deepEqual(ttSegments("ab   cd", R("ab   cd")), [{ s: "ab   cd", c: "r" }]);
  assert.deepEqual(ttSegments("ab\ncd", R("ab\ncd")), [{ s: "ab", c: "r" }, { s: "\n", c: "" }, { s: "cd", c: "r" }]);   // \n trennt
  assert.deepEqual(ttSegments("ab\tcd", R("ab\tcd")), [{ s: "ab", c: "r" }, { s: "\t", c: "" }, { s: "cd", c: "r" }]);
  assert.deepEqual(ttSegments(" ab ", R(" ab ")), [{ s: " ", c: "" }, { s: "ab", c: "r" }, { s: " ", c: "" }]);
  assert.deepEqual(ttSegments("ab cd", Uint8Array.from([0, 0, 255, 71, 71])), [{ s: "ab", c: "r" }, { s: " ", c: "" }, { s: "cd", c: "g" }]);
  assert.deepEqual(ttSegments("ab", Uint8Array.from([255, 30])), [{ s: "a", c: "" }, { s: "b", c: "y" }]);
  assert.deepEqual(ttSegments("abc", null), [{ s: "abc", c: "" }]);
  assert.deepEqual(ttSegments("abc", new Uint8Array(2)), [{ s: "abc", c: "" }]);   // falsche Länge
  assert.deepEqual(ttSegments("", null), []);
  // Obergrenze: zu viele Wechsel → nur Rot; immer noch zu viele → gar keine Färbung
  const yg = "abcdef", ygc = Uint8Array.from([30, 71, 30, 71, 0, 0]);
  assert.deepEqual(ttSegments(yg, ygc, 3), [{ s: "abcd", c: "" }, { s: "ef", c: "r" }]);
  assert.deepEqual(ttSegments(yg, Uint8Array.from([0, 71, 0, 71, 0, 71]), 3), [{ s: yg, c: "" }]);
  const many = "ab".repeat(TT_SEG_MAX + 1), mc = Uint8Array.from({ length: many.length }, (_, x) => (x % 2 ? 30 : 71));
  assert.deepEqual(ttSegments(many, mc), [{ s: many, c: "" }]);
});

test("typing: Rot-Anteil – je Graphem ohne Leerraum und ohne 255, gerundet, ab 50 % hoch", () => {
  const s = ttShare([["abc d", Uint8Array.from([0, 5, 30, 255, 71])]]);
  assert.deepEqual(s, { n: 4, r: 2, y: 1, g: 1, zero: 1, none: 0, pct: 50 });
  assert.equal(ttHigh(s.pct), true);
  assert.equal(ttHigh(49), false);
  assert.equal(ttHigh(null), false);
  assert.equal(ttShare([["abc", Uint8Array.from([0, 71, 71])]]).pct, 33);
  assert.equal(ttShare([["abc", Uint8Array.from([0, 3, 71])]]).pct, 67);
  // ohne Werte bzw. 255 → none; über mehrere Texte
  assert.deepEqual(ttShare([["ab", null], ["c d", Uint8Array.from([0, 255, 255])], ["", null]]), { n: 1, r: 1, y: 0, g: 0, zero: 1, none: 3, pct: 100 });
  assert.deepEqual(ttShare([["ab", null]]), { n: 0, r: 0, y: 0, g: 0, zero: 0, none: 2, pct: null });
  assert.deepEqual(ttShare([]).pct, null);
  assert.deepEqual(ttShare(null).pct, null);
});

test("typing: Tabellen – Spiegel von tableText, tableRows und der Zerlegung in answerDom (Eigenschaftstest)", () => {
  const r = rng(2026);
  const bits = ["a", "B", "ä", "|", " ", "  ", "\t", " ", " ", "\n", "x|y", "😀", ""];
  const answerDomLines = (t) => t.split("\n").filter((l) => l.trim()).map((l) => l.split("|").map((x) => x.trim()));   // Referenz (wie bisher in answerDom)
  for (let k = 0; k < 400; k++) {
    const nCols = 1 + Math.floor(r() * 4), nRows = Math.floor(r() * 5);
    const cols = Array.from({ length: nCols }, (_, x) => (r() < 0.2 ? " Sp|alte " : "Spalte " + (x + 1)));
    const cell = () => { let s = ""; const n = Math.floor(r() * 6); for (let x = 0; x < n; x++) s += pick(r, bits); return s; };
    const grid = Array.from({ length: nRows }, () => Array.from({ length: nCols }, cell));
    const gridCodes = grid.map((row) => row.map((c) => (r() < 0.1 ? null : Uint8Array.from({ length: c.length }, () => randCode(r)))));
    const res = ttTableText(cols, grid, gridCodes), text = tableText(cols, grid);
    assert.equal(res.text, text);
    assert.equal(res.codes.length, text.length);
    // Zellen zurück (Wiederherstellen) und die Zerlegung der Lehrkraft-Ansicht
    const back = ttTableCells(res.text, res.codes, nCols);
    assert.deepEqual(back.map((row) => row.map((c) => c.v)), tableRows(text, nCols));
    assert.deepEqual(ttTableLines(res.text, res.codes).map((row) => row.map((c) => c.v)), answerDomLines(text));
    // jedes sichtbare Zeichen behält den Wert seiner Quelle (Zelle für Zelle)
    const kept = grid.map((row, ri) => ({ ri, cells: row.map((c, x) => ttCellText(c, gridCodes[ri][x])) })).filter((x) => x.cells.some((c) => c.text));
    assert.equal(back.length, kept.length);
    kept.forEach(({ cells }, ri) => cells.forEach((c, x) => {
      assert.equal(back[ri][x].v, c.text);
      assert.deepEqual(Array.from(back[ri][x].codes), Array.from(c.codes));
    }));
    // Kopf, Trenner und Zeilenumbrüche ohne Messung
    if (text) {
      const head = text.indexOf("\n") < 0 ? text.length : text.indexOf("\n");
      assert.ok(Array.from(res.codes.subarray(0, head)).every((x) => x === TT_NONE));
      for (let x = 0; x < text.length; x++) if (text[x] === "\n" || text[x] === "|" || text[x] === " ") assert.equal(res.codes[x], TT_NONE, "Struktur an " + x);
    }
    // ohne Werte: alles 255
    assert.ok(Array.from(ttTableText(cols, grid, null).codes).every((x) => x === TT_NONE));
  }
  // ttCellText = cellText, Werte wandern mit (auch „|“ → „/“)
  for (let k = 0; k < 500; k++) {
    let s = ""; const n = Math.floor(r() * 12); for (let x = 0; x < n; x++) s += pick(r, bits.concat([" ", "﻿", "　", "\r"]));
    const codes = Uint8Array.from({ length: s.length }, (_, x) => x % 72), o = ttCellText(s, codes);
    assert.equal(o.text, cellText(s));
    let src = 0;
    for (let x = 0; x < o.text.length; x++) {
      if (o.text[x] === " ") { assert.equal(o.codes[x], TT_NONE); continue; }
      while (/\s/.test(s[src])) src++;
      assert.equal(o.codes[x], codes[src]); src++;
    }
  }
  // Beispiel: Kopf, „ | “ und „\n“ 255, gekappte bzw. fehlende Zellen ohne Werte
  const ex = ttTableText(["Begriff", "Erklärung"], [["Haus", "Gebäude"], ["", ""]], [[Uint8Array.from([71, 71, 71, 71]), Uint8Array.from([71, 0, 0, 0, 0, 0, 0])], [null, null]]);
  assert.equal(ex.text, "Begriff | Erklärung\nHaus | Gebäude");
  assert.deepEqual(Array.from(ex.codes), [...Array(20).fill(255), 71, 71, 71, 71, 255, 255, 255, 71, 0, 0, 0, 0, 0, 0]);
  const cells = ttTableCells(ex.text, ex.codes, 3);
  assert.deepEqual(cells.map((row) => row.map((c) => c.v)), [["Haus", "Gebäude", ""]]);
  assert.deepEqual(Array.from(cells[0][1].codes), [71, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(ttTableCells(ex.text, null, 2)[0][0], { v: "Haus", codes: null });
  assert.deepEqual(ttTableCells(ex.text, new Uint8Array(3), 2)[0][0], { v: "Haus", codes: null });   // falsche Länge
});

test("typing: Umschlag passt genau wie validateEnvelope", () => {
  const env = (n) => ({ v: 1, ek: "A".repeat(512), iv: "B".repeat(16), ct: "C".repeat(n), extra: "zählt nicht" });
  const base = JSON.stringify({ v: 1, ek: "A".repeat(512), iv: "B".repeat(16), ct: "" }).length;
  assert.equal(ttEnvelopeFits(env(TT_ENV_MAX - base)), true);
  assert.equal(ttEnvelopeFits(env(TT_ENV_MAX - base + 1)), false);
  assert.equal(ttEnvelopeFits(null), false);
});

test("typing: Zwischenstand – nur passende Werte, Schalter TT_KEEP_IN_DRAFT", () => {
  const a = ttEncode(Uint8Array.from([71, 0, 255])), b = ttEncode(Uint8Array.from([71]));
  // passend: übernommen; falsche Länge, Unsinn → null je Antwort
  assert.deepEqual(ttCleanDraft({ v: 1, answers: [a, b, a], first: [b, "x"] }, ["ab ", "c", "zu lang"], ["d", "ef"], true),
    { v: 1, answers: [a, b, null], first: [b, null] });
  assert.deepEqual(ttCleanDraft({ v: 1, answers: [a], first: [a] }, ["ab "], null, true), { v: 1, answers: [a], first: null });
  assert.deepEqual(ttCleanDraft({ v: 1, answers: [a], first: [a, a] }, ["ab "], ["ab "], true), { v: 1, answers: [a], first: null });   // Länge passt nicht
  // falsche Zahl der Antworten, Version, Unsinn → null (wirft nie)
  for (const bad of [null, undefined, 5, "x", [], {}, { v: 2, answers: [a] }, { v: 1, answers: [a, a] }, { v: 1, answers: "x" }, { v: 1, get answers() { throw new Error("x"); } }])
    assert.equal(ttCleanDraft(bad, ["ab "], null, true), null);
  assert.equal(ttCleanDraft({ v: 1, answers: [a] }, null, null, true), null);
  // Schalter: ohne Speichern im Zwischenstand gibt es dort keine Tippzeiten – weder beim Schreiben noch beim Lesen
  assert.deepEqual(ttDraftOut([a, null], [b, null], true), { v: 1, answers: [a, null], first: [b, null] });
  assert.deepEqual(ttDraftOut([a], null, true), { v: 1, answers: [a], first: null });
  assert.equal(ttDraftOut([a, null], [b, null], false), null);
  assert.equal(ttCleanDraft({ v: 1, answers: [a] }, ["ab "], null, false), null);
  // Vorgabe = TT_KEEP_IN_DRAFT (eingecheckt: true); dieselbe Seite mit false gespeichert verhält sich wie keep = false
  assert.equal(TT_KEEP_IN_DRAFT, true);
  assert.deepEqual(ttDraftOut([a], null), { v: 1, answers: [a], first: null });
  assert.deepEqual(ttCleanDraft({ v: 1, answers: [a] }, ["ab "], null), { v: 1, answers: [a], first: null });
  const src = block.replace("const TT_KEEP_IN_DRAFT = true;", "const TT_KEEP_IN_DRAFT = false;");
  assert.notEqual(src, block);
  const off = load(src);
  assert.equal(off.TT_KEEP_IN_DRAFT, false);
  assert.equal(off.ttDraftOut([a], [b]), null);
  assert.equal(off.ttCleanDraft({ v: 1, answers: [a] }, ["ab "], null), null);
  assert.deepEqual(off.ttDraftOut([a], null, true), { v: 1, answers: [a], first: null });   // ausdrücklich übergeben gilt weiter
});

test("typing: Nutzlast für die Lehrkraft – Form, „=“ nur bei gleichem Text, omitted, wirft nie", () => {
  const a = ttEncode(Uint8Array.from([71, 0])), ans = [{ first: "ab", final: "ab" }, { first: "x", final: "xy" }, { first: "q", final: null }];
  assert.deepEqual(ttCleanPayload({ v: 1, answers: [{ first: "=", final: a }, { first: "=", final: a }, { first: a, final: null }] }, ans),
    { list: [{ first: "=", final: a }, { first: null, final: a }, { first: a, final: null }] });
  assert.deepEqual(ttCleanPayload({ v: 1, answers: [{ first: "x@", final: 5 }, null, "x"] }, ans),
    { list: [{ first: null, final: null }, { first: null, final: null }, { first: null, final: null }] });
  assert.deepEqual(ttCleanPayload({ v: 1, answers: [{ first: "A".repeat(TT_B64_MAX + 4), final: "AAA" }, {}, {}] }, ans).list[0], { first: null, final: null });
  assert.deepEqual(ttCleanPayload({ v: 1, omitted: "too_large" }, ans), { omitted: "too_large" });
  assert.deepEqual(ttCleanPayload({ v: 1, omitted: "error" }, ans), { omitted: "error" });
  assert.equal(ttCleanPayload({ v: 1, omitted: "anders" }, ans), null);
  assert.equal(ttCleanPayload({ v: 2, answers: [{}, {}, {}] }, ans), null);   // andere Version → ohne Messung
  assert.equal(ttCleanPayload({ v: 1, answers: [{}, {}] }, ans), null);       // falsche Länge
  for (const bad of [null, undefined, 0, "x", [], { v: 1 }, { v: 1, answers: "x" }, { v: 1, get answers() { throw new Error("x"); } }])
    assert.equal(ttCleanPayload(bad, ans), null);
  assert.equal(ttCleanPayload({ v: 1, answers: [] }, null), null);
  // ttHasData: nur mit mindestens einem Base64-Wert lohnt ein Versuch ohne
  assert.equal(ttHasData({ v: 1, answers: [{ first: null, final: a }] }), true);
  assert.equal(ttHasData({ v: 1, answers: [{ first: null, final: null }] }), false);
  assert.equal(ttHasData({ v: 1, omitted: "too_large" }), false);
  assert.equal(ttHasData(null), false);
});

test("typing: Lehrkraft – Anteile ohne Tabellenkopf, Rot-Anteil in Worten, Hinweis bei Zeichen aus einem Zug", () => {
  const join = (pieces) => pieces.map((x) => x.t).join("");
  // Text: wie im E2E-Test 7l („Wortvorschlag“ in einem Zug eingefügt) – Leerzeichen zählen nicht mit
  const text = "Ich tippe Wortvorschlag ja weiter", codes = new Uint8Array(text.length).fill(71);
  for (let x = 0; x < text.length; x++) if (text[x] === " ") codes[x] = TT_NONE;
  for (let x = text.indexOf("W") + 1; x < text.indexOf("W") + 13; x++) codes[x] = 0;
  assert.deepEqual(ttShareParts(text, codes, false), [[text, codes]]);
  assert.deepEqual(ttShareParts(text, undefined, false), [[text, null]]);
  const sText = ttShare(ttShareParts(text, codes, false));
  assert.deepEqual(sText, { n: 29, r: 12, y: 0, g: 17, zero: 12, none: 0, pct: 41 });
  assert.equal(ttPctText(sText), "41 % (von 29 Zeichen)");
  // Tabelle: nur die Zellen – Kopf und „|“ zählen weder als gemessen noch als „ohne Messung“
  const ex = ttTableText(["Begriff", "Erklärung"], [["Haus", "Gebäude"]], [[Uint8Array.from([71, 71, 71, 71]), Uint8Array.from([71, 0, 0, 0, 0, 0, 0])]]);
  assert.deepEqual(ttShareParts(ex.text, ex.codes, true).map(([v, c]) => [v, Array.from(c)]), [["Haus", [71, 71, 71, 71]], ["Gebäude", [71, 0, 0, 0, 0, 0, 0]]]);
  const sTab = ttShare(ttShareParts(ex.text, ex.codes, true));
  assert.deepEqual(sTab, { n: 11, r: 6, y: 0, g: 5, zero: 6, none: 0, pct: 55 });
  assert.equal(ttPctText(sTab), "55 % (von 11 Zeichen) – hoch");
  assert.deepEqual(ttShare(ttShareParts(ex.text, null, true)), { n: 0, r: 0, y: 0, g: 0, zero: 0, none: 11, pct: null });   // ohne Werte
  assert.deepEqual(ttShareParts("", null, true), []);
  // in Worten: teilweise gemessen (Tausenderpunkt), ohne Messung, leer
  assert.equal(ttPctText({ n: 1500, r: 3, zero: 0, none: 320, pct: 0 }), "0 % (von 1.500 Zeichen; 320 ohne Messung)");
  assert.equal(ttPctText({ n: 0, r: 0, zero: 0, none: 4, pct: null }), "ohne Messung");
  assert.equal(ttPctText({ n: 0, r: 0, zero: 0, none: 0, pct: null }), "leer");
  assert.equal(ttPctText(null), "leer");
  // Zeilen wie in den Details (Aufgabe 2 aus 7l: hoch, alle roten Zeichen 0 ms → Hinweis; die hohen Teile sind markiert)
  const two = ttSummary("Tippzeiten – Rot-Anteil: ", [{ label: "erste Eingabe", share: sTab }, { label: "nach dem KI-Feedback", share: sTab }]);
  assert.equal(join(two), "Tippzeiten – Rot-Anteil: erste Eingabe 55 % (von 11 Zeichen) – hoch · nach dem KI-Feedback 55 % (von 11 Zeichen) – hoch. " + TT_ZERO_NOTE);
  assert.deepEqual(two.map((x) => x.high), [false, true, false, true, false]);
  assert.equal(TT_ZERO_NOTE, "Fast alle roten Zeichen kamen zusammen mit anderen in einem Zug (z. B. Wortvorschlag, Wischen, Autokorrektur oder Diktat).");
  const sum = ttSummary("Tippzeiten – Rot-Anteil über alle Aufgaben: ", [{ label: "erste Fassung", share: ttShare([[text, codes], ...ttShareParts(ex.text, ex.codes, true)]) }]);
  assert.equal(join(sum), "Tippzeiten – Rot-Anteil über alle Aufgaben: erste Fassung 45 % (von 40 Zeichen)");
  // ohne Bezeichnung (eine Fassung); nicht hoch → kein Hinweis, auch wenn alle roten Zeichen 0 ms haben
  assert.equal(join(ttSummary("Tippzeiten – Rot-Anteil: ", [{ label: "", share: sText }])), "Tippzeiten – Rot-Anteil: 41 % (von 29 Zeichen)");
  // hoch, aber weniger als 90 % der roten Zeichen aus einem Zug → kein Hinweis
  const fast = { n: 10, r: 6, y: 0, g: 4, zero: 5, none: 0, pct: 60 };
  assert.equal(join(ttSummary("X: ", [{ label: "", share: fast }])), "X: 60 % (von 10 Zeichen) – hoch");
  assert.equal(join(ttSummary("X: ", [{ label: "a", share: { ...fast, zero: 6 } }, { label: "b", share: { n: 0, r: 0, zero: 0, none: 0, pct: null } }])), "X: a 60 % (von 10 Zeichen) – hoch · b leer. " + TT_ZERO_NOTE);
});
