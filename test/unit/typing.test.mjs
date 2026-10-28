// typing.test.mjs – Tippzeiten: die reinen Hilfsfunktionen aus index.html (Block TYPING:BEGIN … TYPING:END)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LIMITS, REPLACE_WINDOW_MS } from "../../worker/lib.js";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const i = html.indexOf("/* TYPING:BEGIN"), j = html.indexOf("/* TYPING:END */");
const block = html.slice(i, j);
const NAMES = "TT_RED_MS, TT_YELLOW_MS, TT_SLOW, TT_NONE, TT_HIGH_PCT, TT_MAX_LEN, TT_B64_MAX, TT_ENV_MAX, TT_UNDO_MAX, TT_UNDO_CHARS, TT_SEG_MAX, " +
  "TT_KEEP_IN_DRAFT, cellText, tableText, tableRows, ttDiff, ttNew, ttApply, ttCodes, ttClass, ttEncode, ttDecode, ttGraphemes, ttSegments, " +
  "ttShare, ttHigh, ttCellText, ttTableText, ttTableCells, ttTableLines, ttEnvelopeFits, ttHasData, ttDraftOut, ttCleanDraft, ttCleanPayload, " +
  "ttShareParts, ttPctText, ttSummary, TT_ZERO_NOTE, ttSegmentsCut, ttCutNote, TT_CUT_NOTES, ttDraftStrip, ttDetail, " +
  "ttOptOutPayload, ttDraftFlags, ttStoredFlags, ttKeepOptOut, TT_OPTOUT_NOTE, TT_USE";
// Intl als Parameter: so lässt sich der Rückfall ohne Intl.Segmenter (Firefox vor Version 125) prüfen
const load = (src, intl) => new Function("Intl", src + "\nreturn { " + NAMES + " };")(intl === undefined ? Intl : intl);
const T = load(block);
const {
  TT_SLOW, TT_NONE, TT_B64_MAX, TT_ENV_MAX, TT_UNDO_MAX, TT_UNDO_CHARS, TT_SEG_MAX, TT_KEEP_IN_DRAFT,
  cellText, tableText, tableRows, ttDiff, ttNew, ttApply, ttCodes, ttClass, ttEncode, ttDecode, ttGraphemes, ttSegments,
  ttShare, ttHigh, ttCellText, ttTableText, ttTableCells, ttTableLines, ttEnvelopeFits, ttHasData, ttDraftOut, ttCleanDraft, ttCleanPayload,
  ttShareParts, ttPctText, ttSummary, TT_ZERO_NOTE, ttSegmentsCut, ttCutNote, TT_CUT_NOTES, ttDraftStrip, ttDetail,
  ttOptOutPayload, ttDraftFlags, ttStoredFlags, ttKeepOptOut, TT_OPTOUT_NOTE, TT_USE,
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
  // … und höchstens TT_UNDO_CHARS Zeichen – gekappt von den ältesten her, der neueste Abschnitt bleibt immer (auch allein zu groß)
  assert.equal(TT_UNDO_CHARS, 2 * T.TT_MAX_LEN);
  const big = ttNew("y".repeat(TT_UNDO_CHARS + 1), null);
  ttApply(big, "", 1000, "deleteContentBackward");
  assert.deepEqual(big.undo.map((u) => u.text.length), [TT_UNDO_CHARS + 1]);
  const two = ttNew("a".repeat(9000) + "b".repeat(8000), null);
  ttApply(two, "a".repeat(9000), 1000, "deleteContentBackward");   // 8000 b
  ttApply(two, "a".repeat(9000) + "c", 1001, "insertText");
  ttApply(two, "c", 1002, "deleteContentBackward");                // 9000 a → zusammen 17 000 > 16 200
  assert.deepEqual(two.undo.map((u) => u.text.length), [9000]);
  const pair = ttNew("a".repeat(5000) + "b".repeat(3000), null);   // zwei frühere Löschungen unter der Grenze bleiben beide
  ttApply(pair, "a".repeat(5000), 1000, "deleteContentBackward");
  ttApply(pair, "a".repeat(5000) + "c", 1001, "insertText");
  ttApply(pair, "c", 1002, "deleteContentBackward");
  assert.deepEqual(pair.undo.map((u) => u.text.length), [3000, 5000]);
});

test("typing: Rückgängig nach dem Löschen eines langen Textes (Strg+A, Entf, Strg+Z) und Wiederholen eines langen Blocks bleiben gemessen", () => {
  // 4500 Zeichen langsam getippt (über der früheren Grenze von 4000 Zeichen), alles gelöscht, Rückgängig → wieder die alten Werte, kein Rot
  const r = rng(7), long = Array.from({ length: 4500 }, () => pick(r, ["a", "b", "c", " ", "d", "e"])).join("");
  const tt = ttNew("", null);
  typeText(tt, long, 1000, 150);
  const before = codesOf(tt);
  ttApply(tt, "", 1e6, "deleteContentBackward");
  ttApply(tt, long, 1e6 + 500, "historyUndo");
  assert.deepEqual(codesOf(tt), before);
  assert.equal(ttShare([[tt.text, ttCodes(tt)]]).r, 0);
  // alles markiert und überschrieben, dann Rückgängig: der lange Text kommt mit seinen Werten zurück
  ttApply(tt, "x", 2e6, "insertText");
  ttApply(tt, long, 2e6 + 500, "historyUndo");
  assert.deepEqual(codesOf(tt), before);
  // Chrome: durchgehend getippter Text ist ein Rückgängig-Schritt – Strg+Z und gleich Strg+Y bei 8000 Zeichen (MAX_ANSWER)
  const max = "w".repeat(LIMITS.answer), m = ttNew("", null);
  typeText(m, max, 0, 100);
  const mBefore = codesOf(m);
  ttApply(m, "", 1e7, "historyUndo");
  ttApply(m, max, 1e7 + 300, "historyRedo");
  assert.deepEqual(codesOf(m), mBefore);
  assert.equal(ttShare([[m.text, ttCodes(m)]]).pct, 0);
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
  // Obergrenze: zu viele Wechsel → Gelb und Grün zusammen (grün); dann nur Rot; immer noch zu viele → gar keine Färbung
  const yg = "abcdef", ygc = Uint8Array.from([30, 71, 30, 71, 0, 0]);
  assert.deepEqual(ttSegmentsCut(yg, ygc, 3), { segs: [{ s: "abcd", c: "g" }, { s: "ef", c: "r" }], cut: 1 });
  assert.deepEqual(ttSegmentsCut(yg, ygc, 5), { segs: [{ s: "a", c: "y" }, { s: "b", c: "g" }, { s: "c", c: "y" }, { s: "d", c: "g" }, { s: "ef", c: "r" }], cut: 0 });
  assert.deepEqual(ttSegments(yg, ygc, 3), [{ s: "abcd", c: "g" }, { s: "ef", c: "r" }]);
  // ein Leerzeichen zwischen Gelb und Grün übernimmt nach dem Zusammenfassen die Klasse
  assert.deepEqual(ttSegmentsCut("ab cd", Uint8Array.from([30, 30, 255, 71, 71]), 2), { segs: [{ s: "ab cd", c: "g" }], cut: 1 });
  // \n trennt: zusammengefasst noch zu viele, nur Rot passt
  assert.deepEqual(ttSegmentsCut("ab\ncd", Uint8Array.from([30, 0, 255, 71, 0]), 4), { segs: [{ s: "a", c: "" }, { s: "b", c: "r" }, { s: "\nc", c: "" }, { s: "d", c: "r" }], cut: 2 });
  assert.deepEqual(ttSegmentsCut(yg, Uint8Array.from([0, 71, 0, 71, 0, 71]), 3), { segs: [{ s: yg, c: "" }], cut: 3 });
  assert.deepEqual(ttSegments(yg, Uint8Array.from([0, 71, 0, 71, 0, 71]), 3), [{ s: yg, c: "" }]);
  assert.deepEqual(ttSegmentsCut("", null), { segs: [], cut: 0 });
  assert.deepEqual(ttSegmentsCut("abc", null), { segs: [{ s: "abc", c: "" }], cut: 0 });
  // lange, normal getippte Antwort ohne Rot mit mehr als TT_SEG_MAX Wechseln: gemessene Zeichen bleiben gefärbt (grün), nie „ohne Messung“
  const many = "ab".repeat(TT_SEG_MAX + 1), mc = Uint8Array.from({ length: many.length }, (_, x) => (x % 2 ? 30 : 71));
  assert.deepEqual(ttSegmentsCut(many, mc), { segs: [{ s: many, c: "g" }], cut: 1 });
  // 8000 Zeichen mit Wörtern, Rot dazwischen: Verkettung bleibt der Text, Rot bleibt rot, nie mehr als TT_SEG_MAX Läufe
  const r3 = rng(3);
  let text = ""; const codes = [];
  while (text.length < 8000) { const w = pick(r3, ["Haus", "Baum", "Tür", "Fenster"]); text += w + " "; codes.push(...Array.from(w, () => (r3() < 0.02 ? 0 : r3() < 0.3 ? 40 : 71)), 255); }
  const res = ttSegmentsCut(text, Uint8Array.from(codes));
  assert.equal(res.cut, 1);
  assert.ok(res.segs.length <= TT_SEG_MAX);
  assert.equal(res.segs.map((x) => x.s).join(""), text);
  assert.ok(res.segs.every((x) => x.c !== "y"));
  const reds = (segs) => segs.filter((x) => x.c === "r").map((x) => x.s.trim()).join("|");
  assert.equal(reds(res.segs), reds(ttSegmentsCut(text, Uint8Array.from(codes), 1e6).segs));
  // Hinweis in der Zeile zum Rot-Anteil
  const line = [{ t: "Tippzeiten – Rot-Anteil: ", high: false }, { t: "0 % (von 4.002 Zeichen)", high: false }];
  assert.equal(ttCutNote(line, 0), line);
  assert.deepEqual(ttCutNote(line, 1).map((x) => x.t).join(""), "Tippzeiten – Rot-Anteil: 0 % (von 4.002 Zeichen). " + TT_CUT_NOTES[1]);
  assert.equal(ttCutNote([{ t: "X 60 % – hoch. " + TT_ZERO_NOTE, high: false }], 2).map((x) => x.t).join(""), "X 60 % – hoch. " + TT_ZERO_NOTE + " " + TT_CUT_NOTES[2]);
  assert.equal(ttCutNote(line, 3).at(-1).high, false);
  assert.deepEqual(TT_CUT_NOTES.slice(1), ["Wegen der Länge sind Gelb und Grün in der Färbung zusammengefasst (beides grün).",
    "Wegen der Länge ist in der Färbung nur Rot markiert.", "Wegen der Länge ist diese Antwort nicht gefärbt."]);
  assert.equal(ttCutNote(null, 1), null);
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
  // Vorgabe = TT_KEEP_IN_DRAFT (eingecheckt: false – Annahme des Betreibers: Speichern im Zwischenstand bräuchte eine Einwilligung nach
  // § 25 TDDDG); dieselbe Seite in beiden Stellungen gespeichert verhält sich wie keep = true bzw. false
  assert.equal(TT_KEEP_IN_DRAFT, false);
  assert.equal(ttDraftOut([a], [b]), null);
  assert.equal(ttCleanDraft({ v: 1, answers: [a] }, ["ab "], null), null);
  const SW = /const TT_KEEP_IN_DRAFT = (true|false);/g;
  assert.equal(block.match(SW).length, 1);
  const on = load(block.replace(SW, "const TT_KEEP_IN_DRAFT = true;")), off = load(block.replace(SW, "const TT_KEEP_IN_DRAFT = false;"));
  assert.equal(on.TT_KEEP_IN_DRAFT, true);
  assert.deepEqual(on.ttDraftOut([a], null), { v: 1, answers: [a], first: null });
  assert.deepEqual(on.ttCleanDraft({ v: 1, answers: [a] }, ["ab "], null), { v: 1, answers: [a], first: null });
  assert.equal(off.TT_KEEP_IN_DRAFT, false);
  assert.equal(off.ttDraftOut([a], [b]), null);
  assert.equal(off.ttCleanDraft({ v: 1, answers: [a] }, ["ab "], null), null);
  assert.deepEqual(off.ttDraftOut([a], null, true), { v: 1, answers: [a], first: null });   // ausdrücklich übergeben gilt weiter
  // Stände aus der Zeit mit Schalter an: ohne Schalter werden ihre Tippzeiten beim Laden der Seite entfernt (Text und Zeitpunkt bleiben)
  const old = () => ({ v: 1, t: 123, answers: ["ab "], typing: { v: 1, answers: [a], first: null } });
  const d0 = old();
  assert.equal(ttDraftStrip(d0, true), false);
  assert.deepEqual(d0, old());
  assert.equal(on.ttDraftStrip(d0), false);   // Schalter an: nichts entfernen
  assert.deepEqual(d0, old());
  assert.equal(off.ttDraftStrip(d0), true);
  assert.deepEqual(d0, { v: 1, t: 123, answers: ["ab "] });
  assert.equal(off.ttDraftStrip(d0), false);   // schon ohne: nichts zu tun (nicht neu speichern)
  const d1 = old();
  assert.equal(ttDraftStrip(d1, false), true);
  assert.equal("typing" in d1, false);
  for (const bad of [null, undefined, 5, "x", [], { v: 1, answers: [] }]) assert.equal(ttDraftStrip(bad, false), false);
  assert.equal(ttDraftStrip({ typing: null }, false), true);   // auch ein leeres Feld fällt weg
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

test("typing: Lehrkraft-Details – Abgabe, Erstversuch, ohne KI-Feedback, Weltkarten, ohne Messung, weggelassen", () => {
  const join = (pieces) => (pieces ? pieces.map((x) => x.t).join("") : null);
  const enc = (arr) => ttEncode(Uint8Array.from(arr));
  // erste Fassung „abc“ (b rot), abgegebene „abcd“ (alles grün) → beide Teile mit Bezeichnung
  const p = { answers: [{ first: "abc", final: "abcd" }, { first: "", final: "" }],
    typing: { list: [{ first: enc([71, 0, 71]), final: enc([71, 71, 71, 71]) }, { first: "", final: "" }] } };
  const fin = ttDetail(p, ["text", "text"], 2, false, false);
  assert.equal(join(fin.sum), "Tippzeiten – Rot-Anteil über alle Aufgaben: erste Fassung 33 % (von 3 Zeichen) · abgegebene Fassung 0 % (von 4 Zeichen)");
  assert.equal(join(fin.per[0].line), "Tippzeiten – Rot-Anteil: erste Eingabe 33 % (von 3 Zeichen) · nach dem KI-Feedback 0 % (von 4 Zeichen)");
  assert.deepEqual(Array.from(fin.per[0].first), [71, 0, 71]);
  assert.deepEqual(Array.from(fin.per[0].fin), [71, 71, 71, 71]);
  assert.equal(fin.per[1].line, null);   // leere Antwort: keine Zeile
  // Erstversuch: nur die erste Fassung (final ist leer)
  const fp = { answers: [{ first: "abc", final: "" }, { first: "", final: "" }], typing: { list: [{ first: enc([71, 0, 71]), final: null }, { first: "", final: null }] } };
  const first = ttDetail(fp, ["text", "text"], 2, true, false);
  assert.equal(join(first.sum), "Tippzeiten – Rot-Anteil über alle Aufgaben: erste Fassung 33 % (von 3 Zeichen)");
  assert.equal(join(first.per[0].line), "Tippzeiten – Rot-Anteil: erste Eingabe 33 % (von 3 Zeichen)");
  // ohne KI-Feedback: eine Fassung ohne Bezeichnung – die abgegebene (auch wenn first abweicht)
  const nf = { answers: [{ first: "abc", final: "abcd" }], typing: { list: [{ first: enc([0, 0, 0]), final: enc([71, 0, 0, 0]) }] } };
  const one = ttDetail(nf, ["text"], 1, false, true);
  assert.equal(join(one.per[0].line), "Tippzeiten – Rot-Anteil: 75 % (von 4 Zeichen) – hoch. " + TT_ZERO_NOTE);
  assert.equal(join(one.sum), "Tippzeiten – Rot-Anteil über alle Aufgaben: 75 % (von 4 Zeichen) – hoch. " + TT_ZERO_NOTE);
  assert.deepEqual(one.sum.filter((x) => x.high).map((x) => x.t), ["75 % (von 4 Zeichen) – hoch"]);   // auch in der Gesamtzeile markiert
  // „=“: gleiche Werte wie die abgegebene Fassung, nur bei gleichem Text
  const eq = { answers: [{ first: "ab", final: "ab" }], typing: { list: [{ first: "=", final: enc([71, 20]) }] } };
  assert.deepEqual(Array.from(ttDetail(eq, ["text"], 1, false, false).per[0].first), [71, 20]);
  const neq = { answers: [{ first: "ab", final: "abc" }], typing: { list: [{ first: "=", final: enc([71, 20, 71]) }] } };
  assert.equal(ttDetail(neq, ["text"], 1, false, false).per[0].first, null);
  // Tabelle: Kopf zählt nicht; Weltkarte wird übersprungen; nur Weltkarten → keine Zeilen
  const tab = ttTableText(["A", "B"], [["xy", "z"]], [[Uint8Array.from([71, 0]), Uint8Array.from([71])]]);
  const tp = { answers: [{ first: tab.text, final: tab.text }, { first: "Peru → Peru", final: "Peru → Peru" }],
    typing: { list: [{ first: "=", final: ttEncode(tab.codes) }, { first: null, final: null }] } };
  const tdet = ttDetail(tp, ["table", "map"], 2, false, false);
  assert.equal(join(tdet.per[0].line), "Tippzeiten – Rot-Anteil: erste Eingabe 33 % (von 3 Zeichen) · nach dem KI-Feedback 33 % (von 3 Zeichen)");
  assert.equal(tdet.per[1].line, null);
  assert.equal(join(tdet.sum), "Tippzeiten – Rot-Anteil über alle Aufgaben: erste Fassung 33 % (von 3 Zeichen) · abgegebene Fassung 33 % (von 3 Zeichen)");
  assert.deepEqual(ttDetail(tp, ["map", "map"], 2, false, false), { sum: null, per: [{ first: null, fin: null, line: null }, { first: null, fin: null, line: null }] });
  // ohne Messung (ältere Stände), weggelassen, fehlende Antworten und Arten
  assert.equal(join(ttDetail({ answers: [{ first: "a", final: "a" }], typing: null }, ["text"], 1, false, false).sum), "Tippzeiten: ohne Messung (älterer Stand).");
  assert.equal(join(ttDetail({ answers: [], typing: { omitted: "too_large" } }, [], 1, false, false).sum), "Tippzeiten: nicht übermittelt – die Abgabe wäre sonst zu groß gewesen.");
  assert.equal(join(ttDetail({ answers: [], typing: { omitted: "error" } }, null, 1, false, false).sum), "Tippzeiten: nicht übermittelt (technischer Fehler beim Senden).");
  const part = ttDetail({ answers: [{ first: "ab", final: "ab" }], typing: { list: [{ first: "=", final: null }] } }, ["text", "text"], 2, false, false);
  assert.equal(join(part.per[0].line), "Tippzeiten – Rot-Anteil: erste Eingabe ohne Messung · nach dem KI-Feedback ohne Messung");
  assert.equal(part.per[1].line, null);
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
  // auch ein per Rechtsklick übernommener Korrekturvorschlag des Browsers kommt in einem Zug (insertReplacementText) – LanguageTool nie
  assert.equal(TT_ZERO_NOTE, "Fast alle roten Zeichen kamen zusammen mit anderen in einem Zug (z. B. Wortvorschlag, Wischen, Autokorrektur, Diktat oder ein übernommener Korrekturvorschlag des Browsers).");
  assert.doesNotMatch(TT_ZERO_NOTE, /LanguageTool|Rechtschreibprüfung/);
  const sum = ttSummary("Tippzeiten – Rot-Anteil über alle Aufgaben: ", [{ label: "erste Fassung", share: ttShare([[text, codes], ...ttShareParts(ex.text, ex.codes, true)]) }]);
  assert.equal(join(sum), "Tippzeiten – Rot-Anteil über alle Aufgaben: erste Fassung 45 % (von 40 Zeichen)");
  // ohne Bezeichnung (eine Fassung); nicht hoch → kein Hinweis, auch wenn alle roten Zeichen 0 ms haben
  assert.equal(join(ttSummary("Tippzeiten – Rot-Anteil: ", [{ label: "", share: sText }])), "Tippzeiten – Rot-Anteil: 41 % (von 29 Zeichen)");
  // hoch, aber weniger als 90 % der roten Zeichen aus einem Zug → kein Hinweis
  const fast = { n: 10, r: 6, y: 0, g: 4, zero: 5, none: 0, pct: 60 };
  assert.equal(join(ttSummary("X: ", [{ label: "", share: fast }])), "X: 60 % (von 10 Zeichen) – hoch");
  assert.equal(join(ttSummary("X: ", [{ label: "a", share: { ...fast, zero: 6 } }, { label: "b", share: { n: 0, r: 0, zero: 0, none: 0, pct: null } }])), "X: a 60 % (von 10 Zeichen) – hoch · b leer. " + TT_ZERO_NOTE);
});

test("typing: Widerspruch – Nutzlast ohne Werte, Lehrkraft sieht „ohne Messung (widersprochen)“, der Zwischenstand merkt ihn", () => {
  const join = (pieces) => (pieces ? pieces.map((x) => x.t).join("") : null);
  const a = ttEncode(Uint8Array.from([71, 0])), ans = [{ first: "ab", final: "ab" }, { first: "x", final: "xy" }];
  // Erstversuch und Abgabe: {v:1, optOut:true} – je Aufruf ein neues Objekt (sealPayload ersetzt typing bei Bedarf), kein Versuch ohne Messung nötig
  assert.deepEqual(ttOptOutPayload(), { v: 1, optOut: true });
  assert.notEqual(ttOptOutPayload(), ttOptOutPayload());
  assert.equal(ttHasData(ttOptOutPayload()), false);
  // Lehrkraft (loadSubs): widersprochen schlägt mitgeschickte Werte; nur genau true zählt, andere Version → ohne Messung (älterer Stand)
  assert.deepEqual(ttCleanPayload({ v: 1, optOut: true }, ans), { optOut: true });
  assert.deepEqual(ttCleanPayload({ v: 1, optOut: true, answers: [{ first: "=", final: a }, { first: a, final: null }] }, ans), { optOut: true });
  assert.deepEqual(ttCleanPayload({ v: 1, optOut: true, omitted: "too_large" }, ans), { optOut: true });
  assert.equal(ttCleanPayload({ v: 1, optOut: "ja" }, ans), null);
  assert.equal(ttCleanPayload({ v: 1, optOut: 1 }, ans), null);
  assert.equal(ttCleanPayload({ v: 2, optOut: true }, ans), null);
  assert.deepEqual(ttCleanPayload({ v: 1, optOut: false, answers: [{ first: "=", final: a }, {}] }, ans).list[0], { first: "=", final: a });
  // Details: eine Zeile für den ganzen Eintrag, keine je Aufgabe, keine Werte (also keine Färbung); Blatt nur mit Weltkarten: nichts
  const det = ttDetail({ answers: ans, typing: { optOut: true } }, ["text", "table"], 2, false, false);
  assert.equal(join(det.sum), "Tippzeiten: ohne Messung (widersprochen).");
  assert.equal(TT_OPTOUT_NOTE, "Tippzeiten: ohne Messung (widersprochen).");
  assert.deepEqual(det.per, [{ first: null, fin: null, line: null }, { first: null, fin: null, line: null }]);
  assert.equal(join(ttDetail({ answers: ans, typing: { optOut: true } }, ["text", "text"], 2, true, false).sum), TT_OPTOUT_NOTE);   // auch beim Erstversuch
  assert.equal(join(ttDetail({ answers: ans, typing: { optOut: true } }, ["text", "text"], 2, false, true).sum), TT_OPTOUT_NOTE);   // auch ohne KI-Feedback
  assert.equal(ttDetail({ answers: ans, typing: { optOut: true } }, ["map", "map"], 2, false, false).sum, null);
  // Zwischenstand (Gerät, Zwischenstand-PDF): Widerspruch und ein noch zu ersetzender Erstversuch (nur nach dem Senden; bleibt auch,
  // wenn der Widerspruch zurückgenommen wurde – der gesendete Eintrag trägt ja noch Tippzeiten)
  assert.deepEqual(ttDraftFlags({ ttOptOut: true, ttResend: true, firstSent: true }), { optOut: true, resend: true });
  assert.deepEqual(ttDraftFlags({ ttOptOut: true, ttResend: true, firstSent: false }), { optOut: true, resend: false });
  assert.deepEqual(ttDraftFlags({ ttOptOut: true }), { optOut: true, resend: false });
  assert.deepEqual(ttDraftFlags({ ttResend: true, firstSent: true }), { optOut: false, resend: true });
  for (const bad of [null, undefined, 5, "x", [], {}, { ttOptOut: "true" }, { ttOptOut: 1 }, { ttResend: "true", firstSent: true }, [{ ttOptOut: true }]])
    assert.deepEqual(ttDraftFlags(bad), { optOut: false, resend: false });
  // derselbe Zweck überall: Hinweis der Lehrkraft und ausführlicher Datenschutzhinweis nutzen denselben Wortlaut (die Kurzfassungen
  // nennen nur die Messung und wo man widerspricht – siehe nächster Test)
  assert.equal(TT_USE, "nur als Anlass für ein Gespräch über die Arbeitsweise – nicht für Noten und nicht bei einem Täuschungsverdacht");
  assert.ok(html.includes("Nutzen Sie die Färbung " + TT_USE + "."));
  assert.ok(html.includes("Die Färbung dient ${TT_USE};"));
  assert.ok(html.includes("die Tippzeiten dienen ${TT_USE}."));
  assert.equal(html.split("Die Färbung dient ${TT_USE}. ").length - 1, 0);   // früher: Kurzfassung du/ihr (TT_SHORT) und renderPrivacy
  assert.ok(!/\blit\./.test(html));   // Schreibweise „Buchst.“, nie „lit.“
});

test("typing: Kurzfassungen nennen die Messung in genau einem neutralen Satz (TT_SHORT); der ausführliche Hinweis hat den eigenen Abschnitt zum Widerspruch und den Satz zu § 25 TDDDG", () => {
  const body = (start, end) => { const a = html.indexOf(start), b = html.indexOf(end, a); assert.ok(a > 0 && b > a, start); return html.slice(a, b); };
  const code = (src) => src.replace(/^\s*\/\/.*$/gm, "");   // ganze Kommentarzeilen zählen nicht
  const TT_WORDS = /Tippzeit|misst|Messung|gemessen|[Ww]idersprech|Widerspruch|Schalter|Haken/;
  // die Bausteine (TT_OBJ_HEAD, TT_SHORT, TT_ACCESS) aus index.html – sie hängen nur an TT_KEEP_IN_DRAFT
  const blocks = (keep) => new Function("TT_KEEP_IN_DRAFT", body("const TT_OBJ_HEAD = ", "const ttMeasured = ") + "\nreturn { TT_OBJ_HEAD, TT_SHORT, TT_ACCESS };")(keep);
  const B = blocks(TT_KEEP_IN_DRAFT), on = blocks(true), off = blocks(false);
  const SHORT_DU = "Beim Schreiben misst diese Seite außerdem die Tippzeiten; widersprechen kannst du unter „Alle Informationen zum Datenschutz“.";
  const SHORT_IHR = "Beim Schreiben misst diese Seite außerdem die Tippzeiten; widersprechen könnt ihr unter „Alle Informationen zum Datenschutz“.";
  assert.equal(B.TT_SHORT(false), SHORT_DU);
  assert.equal(B.TT_SHORT(true), SHORT_IHR);
  assert.equal(B.TT_OBJ_HEAD, "Widerspruch gegen die Tippzeit-Messung");
  // Angaben-Bildschirm und Vorschau der Lehrkraft (privacyShortText): mit Messung genau dieser Satz am Ende, sonst nichts zur Messung
  const shortSrc = body("function privacyShortText(", "\n}\n") + "\n}";
  assert.match(shortSrc, /^function privacyShortText\(p, list, withAi, group, typing\) \{/);
  const short = new Function("OP_NAME", "RESERVE_WHEN", "TT_SHORT", shortSrc + "\nreturn privacyShortText;")("Betreiber", "nicht antwortet", B.TT_SHORT);
  const one = [{ id: "groq", label: "Groq" }], two = [{ id: "groq", label: "Groq" }, { id: "cloudflare", label: "Cloudflare" }];
  for (const g of [false, true]) for (const withAi of [false, true]) for (const list of [[], one, two]) for (const p of [null, { retentionDays: 30 }]) {
    const s = B.TT_SHORT(g), on1 = short(p, list, withAi, g, true), off1 = short(p, list, withAi, g, false);
    assert.ok(on1.endsWith(" " + s), on1);
    assert.equal(on1.split(s).length - 1, 1);
    assert.equal(on1, off1 + " " + s);
    assert.doesNotMatch(off1, TT_WORDS);   // Blatt nur mit Weltkarten: kein Wort zur Messung
    assert.doesNotMatch(on1, g ? /\b(du|dein\w*|dir|dich)\b/i : /\b(ihr|euer|eure\w*|euch)\b/i);
  }
  assert.equal((html.match(/privacyShortText\(/g) || []).length, 3);   // Definition, Angaben-Bildschirm, Vorschau der Lehrkraft
  assert.ok(html.includes("privacyShortText(sh.privacy, list, sh.aiFeedback, g, ttMeasured(sh))"));
  assert.ok(html.includes("privacyShortText(p, list, true, false, true)"));   // Vorschau: ein Blatt mit KI-Feedback und Messung
  // Schreibbereich (renderPrivacy bis zum ausführlichen Hinweis): derselbe Satz in der du-Form, nur bei Blättern mit Messung, sonst nichts
  const SHORT_EXPR = '(ttMeasured(S.sheet) ? TT_SHORT(false) + " " : "")';
  const ed = code(body("function renderPrivacy()", 'const full = $("privfull-ed")'));
  assert.equal(ed.split(SHORT_EXPR).length - 1, 1);
  assert.doesNotMatch(ed.replace(SHORT_EXPR, ""), /Tippzeit|misst|Messung|[Ww]idersprech|Widerspruch|Schalter|\bTT_|ttMeasured|typing/);
  // § 25 TDDDG: nur die Tatsache (Zugriff auf das Gerät) – keine behauptete Ausnahme, keine Einwilligung; Zwischenstand nur mit keep;
  // mit KI-Feedback (ai, Vorgabe) auch, dass die Seite sie nach der Abgabe hält, bis die zweite Rückmeldung nachgereicht ist (sendFeedback2)
  const HELD = (g) => ` (und, wenn die KI-Rückmeldung zu ${g ? "eurer" : "deiner"} abgegebenen Fassung noch nachgereicht wird, bis dahin)`;
  for (const g of [false, true]) {
    for (const ai of [true, false]) {
      const a1 = on.TT_ACCESS(g, true, ai), a0 = off.TT_ACCESS(g, false, ai);
      for (const x of [a1, a0]) {
        assert.match(x, /^Für die Tippzeiten liest diese Seite beim Schreiben in (deinem|eurem) Browser die Zeitpunkte (deiner|eurer) Eingaben aus/);
        assert.ok(x.includes("bis zur Abgabe" + (ai ? HELD(g) : "") + " im Arbeitsspeicher"), x);
        assert.equal(x.includes("nachgereicht"), ai, x);
        assert.match(x, /\(nach einem Widerspruch nicht mehr\) – das ist ein Zugriff auf (dein|euer) Gerät im Sinne von § 25 TDDDG\.$/);
        assert.doesNotMatch(x, /unbedingt erforderlich|Einwilligung|Abs\. [12]|Ausnahme|zulässig/);
        assert.doesNotMatch(x, g ? /\b(du|dein\w*|dir|dich)\b/i : /\b(ihr|euer|eure\w*|euch)\b/i);
      }
      assert.match(a1, /Zwischenstand/);
      assert.ok(a1.includes(`speichert die Tippzeiten bis ${ai ? "zur Abgabe" : "dahin"} auch in ${g ? "eurem" : "deinem"} Zwischenstand`), a1);
      assert.doesNotMatch(a0, /Zwischenstand/);
    }
    assert.equal(on.TT_ACCESS(g), on.TT_ACCESS(g, true, true));   // Vorgabe: Blatt mit KI-Feedback
    assert.equal(B.TT_ACCESS(g), B.TT_ACCESS(g, TT_KEEP_IN_DRAFT, true));
  }
  assert.equal(off.TT_ACCESS(false), "Für die Tippzeiten liest diese Seite beim Schreiben in deinem Browser die Zeitpunkte deiner Eingaben aus und hält sie bis zur Abgabe " +
    "(und, wenn die KI-Rückmeldung zu deiner abgegebenen Fassung noch nachgereicht wird, bis dahin) im Arbeitsspeicher " +
    "(nach einem Widerspruch nicht mehr) – das ist ein Zugriff auf dein Gerät im Sinne von § 25 TDDDG.");
  assert.equal(off.TT_ACCESS(false, false, false), "Für die Tippzeiten liest diese Seite beim Schreiben in deinem Browser die Zeitpunkte deiner Eingaben aus und hält sie bis zur Abgabe im Arbeitsspeicher " +
    "(nach einem Widerspruch nicht mehr) – das ist ein Zugriff auf dein Gerät im Sinne von § 25 TDDDG.");   // Blatt ohne KI-Feedback: wie bisher
  // … und nach einem Widerspruch liest die Seite wirklich keine Zeitpunkte mehr (Capture-Listener „input“, ttSync)
  assert.ok(html.includes("if (!S.ttOptOut) { ta._evType = e.inputType || \"\"; ta._evTs = performance.now(); }"));
  assert.ok(html.includes("if (S.ttOptOut) { el._evTs = el._evType = undefined; return; }"));
  // der ausführliche Hinweis: Zweck, Rechtsgrundlage mit Widerspruch, Daten samt § 25 TDDDG, Empfänger, Speicherdauer – und ein eigener
  // Abschnitt „Widerspruch gegen die Tippzeit-Messung“ mit dem Schalter vor „Deine Rechte“ (dort nur ein Verweis)
  const full = body("function privacyNoticeDom(", "\n}\n");
  for (const x of ["TT_PURPOSE(g)", "TT_SWITCH_DU", "TT_SWITCH_IHR", "mit ihren Tippzeiten", "Sie sieht auch die Tippzeiten", "(samt Tippzeiten)",
    "Die Tippzeiten gehören zu", "Die Tippzeiten misst diese Seite, solange", "(siehe „${TT_OBJ_HEAD}“)", "– siehe „${TT_OBJ_HEAD}“. "]) assert.ok(full.includes(x), x);
  const at = (x) => { const k = full.indexOf(x); assert.ok(k > 0, x); assert.equal(full.indexOf(x, k + 1), -1, x); return k; };
  const order = ['head("Welche Daten?")', "tt ? para(TT_ACCESS(g, TT_KEEP_IN_DRAFT, withAi)) : null", 'head("Wer bekommt die Daten?")', 'head(t("Entscheidet die KI über dich?"',
    "tt ? head(TT_OBJ_HEAD) : null", "tt ? ttSwitchDom(o, g, withAi) : null", 'head(t("Deine Rechte", "Eure Rechte"))'].map(at);
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
  assert.equal(full.indexOf("ttSwitchDom", order[5] + "tt ? ttSwitchDom".length), -1);   // der Schalter steht nicht (mehr) unter „Deine Rechte“
  assert.ok(!full.includes("Schalter unter „"));
  // … auf dem Angaben-Bildschirm und im Schreibbereich mit dem Schalter (live), in der Vorschau der Lehrkraft gesperrt
  assert.equal((html.match(/typing: ttMeasured\((sh|S\.sheet)\), ttSwitch: "live"/g) || []).length, 2);
  assert.ok(html.includes('id: "pv-privfull", ttSwitch: "preview"'));
  // Seite „Impressum & Datenschutz“: kein Schalter, aber ein Absatz, wo er steht (im eigenen Abschnitt)
  assert.ok(body("function ttSwitchDom(", "\n}\n").includes("steht im Abschnitt „${TT_OBJ_HEAD}“ der Schalter „${TT_SWITCH_DU}“. "));
});

test("typing: Widerspruch eines anderen Tabs und beim Import einer Zwischenstand-PDF – gespeichert gewinnt der Widerspruch", () => {
  // ttStoredFlags: roher Text aus dem Speicher; geparst nur mit Kennzeichen, eine Antwort mit demselben Text zählt nicht (maskiert)
  const rec = (o) => JSON.stringify({ v: 1, t: 1, answers: ["x"], attempt: "0123456789abcdef", firstSent: true, ...o });
  assert.deepEqual(ttStoredFlags(rec({ ttOptOut: true })), { resend: false, attempt: "0123456789abcdef" });
  assert.deepEqual(ttStoredFlags(rec({ ttOptOut: true, ttResend: true })), { resend: true, attempt: "0123456789abcdef" });
  assert.deepEqual(ttStoredFlags(rec({ ttOptOut: true, ttResend: true, firstSent: false })), { resend: false, attempt: "0123456789abcdef" });
  assert.equal(ttStoredFlags(rec({})), null);
  assert.equal(ttStoredFlags(rec({ ttResend: true })), null);   // nur ein fälliges Ersetzen, kein Widerspruch
  assert.equal(ttStoredFlags(rec({ answers: ['"ttOptOut":true'] })), null);
  assert.equal(ttStoredFlags(JSON.stringify({ answers: ["a"], note: '{"ttOptOut":true}' })), null);
  for (const bad of [null, undefined, 5, {}, "", '"ttOptOut":true', '{"ttOptOut":true', '["ttOptOut":true]', '{"ttOptOut":"true"}'])
    assert.equal(ttStoredFlags(bad), null);
  assert.deepEqual(ttStoredFlags('{"ttOptOut":true,"attempt":5}'), { resend: false, attempt: "" });
  // ttKeepOptOut: der Widerspruch auf dem Gerät bleibt; Werte aus der Datei weg; ein gesendeter Erstversuch aus der Datei wird ersetzt
  const fb = [{ covered: [], missing: [] }], ty = { v: 1, answers: ["AQ=="], first: null };
  const pdf = (o) => ({ v: 1, answers: ["x"], first: ["x"], feedback: fb, attempt: "aaaaaaaaaaaaaaaa", firstSent: true, ttOptOut: false, ttResend: false, typing: ty, ...o });
  const local = (o) => ({ v: 1, attempt: "aaaaaaaaaaaaaaaa", firstSent: true, ttOptOut: true, ...o });
  let d = ttKeepOptOut(pdf(), local());
  assert.deepEqual([d.ttOptOut, d.ttResend, d.typing], [true, true, null]);
  d = ttKeepOptOut(pdf({ firstSent: false }), local());
  assert.deepEqual([d.ttOptOut, d.ttResend, d.typing], [true, false, null]);   // nicht gesendet: geht ohnehin ohne Tippzeiten
  d = ttKeepOptOut(pdf({ feedback: null, first: null }), local());
  assert.deepEqual([d.ttOptOut, d.ttResend], [true, false]);
  // schon in der Datei widersprochen und ersetzt: nur ein auf dem Gerät noch fälliges Ersetzen derselben Bearbeitung gilt weiter
  d = ttKeepOptOut(pdf({ ttOptOut: true, typing: null }), local());
  assert.deepEqual([d.ttOptOut, d.ttResend], [true, false]);
  d = ttKeepOptOut(pdf({ ttOptOut: true, typing: null }), local({ ttResend: true }));
  assert.deepEqual([d.ttOptOut, d.ttResend], [true, true]);
  d = ttKeepOptOut(pdf({ ttOptOut: true, typing: null }), local({ ttResend: true, attempt: "bbbbbbbbbbbbbbbb" }));
  assert.deepEqual([d.ttOptOut, d.ttResend], [true, false]);
  // ohne Widerspruch auf dem Gerät: unverändert (derselbe Gegenstand)
  for (const l of [null, undefined, {}, local({ ttOptOut: false }), local({ ttOptOut: "true" }), [local()]]) {
    const x = pdf();
    assert.equal(ttKeepOptOut(x, l), x);
    assert.deepEqual(x, pdf());
  }
  assert.equal(ttKeepOptOut(null, local()), null);
});

test("typing: Datenschutzhinweis – Wirkung und Geltungsbereich des Schalters folgen TT_KEEP_IN_DRAFT", () => {
  // die beiden Bausteine aus index.html (stehen außerhalb des Blocks TYPING, hängen nur an BACKUP_DAYS und TT_KEEP_IN_DRAFT)
  const a = html.indexOf("const TT_SWITCH_EFFECT = "), b = html.indexOf("function ttSwitchDom(");
  assert.ok(a > 0 && b > a);
  const BD = html.match(/const BACKUP_DAYS = ("[^"]+");/)[1];
  const texts = (keep) => new Function("TT_KEEP_IN_DRAFT", "BACKUP_DAYS", html.slice(a, b) + "\nreturn { TT_SWITCH_EFFECT, TT_SWITCH_SCOPE };")(keep, JSON.parse(BD));
  const on = texts(true), off = texts(false);
  for (const g of [false, true]) for (const ai of [false, true]) {
    const e1 = on.TT_SWITCH_EFFECT(g, ai), e0 = off.TT_SWITCH_EFFECT(g, ai), s1 = on.TT_SWITCH_SCOPE(g, ai), s0 = off.TT_SWITCH_SCOPE(g, ai);
    assert.match(e1, /auch in (deinem|eurem) Zwischenstand/);
    assert.doesNotMatch(e0, /Zwischenstand/);   // ohne Speichern im Zwischenstand nichts dazu
    assert.match(s1, /Eine schon gesicherte Zwischenstand-PDF-Datei enthält die bisherigen Tippzeiten weiter/);
    assert.doesNotMatch(s0, /enthält die bisherigen Tippzeiten/);
    for (const x of [e1, e0, s1, s0]) assert.doesNotMatch(x, g ? /\b(du|dein\w*|dir|dich)\b/i : /\b(ihr|euer|eure\w*|euch)\b/i);
    // Erstversuch nur bei Blättern mit KI-Feedback – samt Datensicherung nach dem Ersetzen und dem Erstversuch eines anderen Geräts
    assert.equal(/Erstversuch/.test(e1) && /Datensicherung der Datenbank/.test(e1), ai);
    assert.equal(/auf einem anderen Gerät gesendet/.test(s1), ai);
    // Geltungsbereich und nach der Abgabe: nur zusammen mit der ganzen Abgabe
    assert.match(s0, /gilt für (deine|eure) Bearbeitung auf diesem Gerät/);
    assert.match(s0, /nur zusammen mit (deiner|eurer) ganzen Abgabe löschen/);
    assert.doesNotMatch(e1 + s1, /LanguageTool/);
  }
  assert.equal(on.TT_SWITCH_EFFECT(false, true), "Setzt du den Haken, misst diese Seite bei diesem Feibeitsblatt keine Tippzeiten mehr und verwirft die schon gemessenen – auch in deinem Zwischenstand. " +
    "Einen schon an deine Lehrkraft gesendeten Erstversuch ersetzt sie durch einen ohne Tippzeiten; die alte Fassung bleibt verschlüsselt noch bis zu 7 Tage (bei einem bezahlten Cloudflare-Tarif bis zu 30 Tage) in der Datensicherung der Datenbank. " +
    "Bei deiner Abgabe sieht deine Lehrkraft dann „ohne Messung (widersprochen)“ – das ist dein Recht und für deine Lehrkraft kein Anlass für einen Verdacht. Nimmst du den Haken wieder weg, misst die Seite erst ab dann wieder.");
});

test("typing: nach der Abgabe – die angenommene Nutzlast (mit Tippzeiten) nur getrennt von S.lastSubmission und nur, bis die zweite Rückmeldung nachgereicht ist", () => {
  const body = (start, end) => { const a = html.indexOf(start), b = html.indexOf(end, a); assert.ok(a > 0 && b > a, start); return html.slice(a, b); };
  // höchstens so lange, wie der Server ein Nachreichen annimmt
  assert.match(html, /const FB2_HOLD_MS = 15 \* 60e3;/);
  assert.equal(15 * 60e3, REPLACE_WINDOW_MS);
  // S.lastSubmission (daraus entstehen die PDF-Dateien der Schüler:innen) trägt nie die Nutzlast, ihre Tippzeiten oder den Schlüssel
  const last = body("S.lastSubmission = {", "};");
  for (const x of ["payload,", "payload:", "typing", "pub", "fb2Base"]) assert.ok(!last.includes(x), x);
  for (const f of ["function makeSolutionsPdf(", "function escPdfPages("]) {
    const src = body(f, "\n}\n");
    for (const x of ["fb2Base", "typing", ".payload"]) assert.ok(!src.includes(x), f + " " + x);
  }
  // gemerkt nur mit erstem Feedback, nach der Annahme (sendSealed hat die Rückfälle schon angewandt); die Tippzeiten der ersten Fassung weg
  const submit = body("async function submitAll()", "\n}\n");
  const kSent = submit.indexOf("await sendSealed(payload"), kHold = submit.indexOf("if (withFb) fb2Hold(S.lastSubmission, payload, r, sentAt);");
  assert.ok(kSent > 0 && kHold > kSent);
  assert.ok(submit.indexOf("const sentAt = Date.now();") > 0 && submit.indexOf("const sentAt = Date.now();") < kSent);   // Frist ab dem Absenden: nie länger als beim Server
  assert.ok(submit.indexOf("S.firstTyping = null;") > kSent);
  // Nachreichen: genau diese Nutzlast + feedback2, dieselben Rückfälle wie bei der Abgabe (sendSealed), danach immer freigegeben
  const send = body("async function sendFeedback2(sub)", "\n}\n");
  assert.ok(send.includes("const payload = { ...base.payload, feedback2: "));
  assert.ok(send.includes("await sendSealed(payload, (envelope) => ({ code: sub.code, envelope, stage: \"feedback2\", attempt: base.attempt, receivedAt: base.submitAt }), base.pub);"));
  assert.ok(send.includes("} finally { fb2Release(sub); }"));
  // freigegeben, sobald nichts mehr nachgereicht wird
  assert.ok(body("function finalFeedbackGone(sub)", "\n}\n").includes("fb2Release(sub);"));
  const req = body("async function requestFinalFeedback()", "\n}\n");
  assert.ok(req.includes("if (!sub || !Array.isArray(sub.feedback)) { fb2Release(sub); return; }"));
  assert.ok(req.indexOf("fb2Release(sub);   // nichts nachzureichen") > req.indexOf("same: true"));
  assert.ok(body("function resetStudent()", "\n}\n").includes("fb2Release();"));
  const hold = body("function fb2Hold(", "\n}\n");
  assert.ok(hold.includes("sub.fb2Until = (Number.isFinite(sentAt) && sentAt > 0 ? sentAt : Date.now()) + FB2_HOLD_MS;"));
  assert.ok(hold.includes("base.until = performance.now() + Math.max(0, sub.fb2Until - Date.now());"));
  assert.ok(hold.indexOf("fb2Check();") > hold.indexOf("S.fb2Base = base;"));   // freigegeben spätestens nach FB2_HOLD_MS (fb2Check, eigener Test)
});

test("typing: Widerspruch aus einem anderen Tab nach der Abgabe – die gehaltene Nutzlast verliert die Tippzeit-Werte, nachgereicht wird ohne sie", () => {
  const body = (start, end) => { const a = html.indexOf(start), b = html.indexOf(end, a); assert.ok(a > 0 && b > a, start); return html.slice(a, b); };
  const src = body("const fb2OptedOut = ", "\n}\n") + "\n}\n";
  const run = (S, stored) => {
    const store = { get: (k) => { if (k !== "k1") throw new Error("Schlüssel"); return stored; } };
    const f = new Function("S", "store", "ttStoredFlags", "ttOptOutPayload", src + "\nreturn { fb2OptedOut, fb2FollowOptOut };");
    return f(S, store, ttStoredFlags, ttOptOutPayload);
  };
  const values = () => ({ v: 1, answers: [{ first: "=", final: "R0dH" }] });
  const mk = (typing, extra = {}) => ({ fb2Base: { key: "k1", payload: { v: 1, answers: [], typing } }, ttOptOut: false, ttLastRaw: null, ...extra });
  const OPT = JSON.stringify({ v: 1, answers: ["a"], ttOptOut: true, attempt: "0123456789abcdef" });
  const NO = JSON.stringify({ v: 1, answers: ["a"], attempt: "0123456789abcdef" });
  // ein anderer Tab hat (unter dem Schlüssel der Abgabe) widersprochen → {optOut}
  let S = mk(values());
  let fns = run(S, OPT);
  assert.equal(fns.fb2FollowOptOut(), true);
  assert.deepEqual(S.fb2Base.payload.typing, { v: 1, optOut: true });
  assert.equal(fns.fb2OptedOut(S.fb2Base), true);
  assert.equal(fns.fb2FollowOptOut(), false);   // schon übernommen
  // auch über das storage-Ereignis (raw übergeben, der Speicher wird dann nicht gelesen)
  S = mk(values()); fns = run(S, null);
  assert.equal(fns.fb2FollowOptOut(OPT), true);
  // kein Widerspruch, gelöschter Stand, eigener zuletzt geschriebener Stand, kaputter Text → unverändert
  for (const [raw, extra] of [[NO, {}], [null, {}], [OPT, { ttLastRaw: OPT }], ["{kaputt\"ttOptOut\":true", {}]]) {
    S = mk(values(), extra); fns = run(S, raw);
    assert.equal(fns.fb2FollowOptOut(), false);
    assert.deepEqual(S.fb2Base.payload.typing, values());
  }
  // Widerspruch kam schon, während die Abgabe gesendet wurde (S.ttOptOut) → ebenso; auch „nicht übermittelt“ wird zu {optOut}
  S = mk(values(), { ttOptOut: true }); fns = run(S, null);
  assert.equal(fns.fb2FollowOptOut(), true);
  S = mk({ v: 1, omitted: "too_large" }, { ttOptOut: true }); fns = run(S, null);
  assert.equal(fns.fb2FollowOptOut(), true);
  assert.deepEqual(S.fb2Base.payload.typing, { v: 1, optOut: true });
  // nichts gehalten → nichts zu tun
  fns = run({ fb2Base: null, ttOptOut: true }, OPT);
  assert.equal(fns.fb2FollowOptOut(), false);
  // geprüft beim storage-Ereignis und vor jedem Nachreichen; kam der Widerspruch, während die Werte unterwegs waren, gleich noch einmal
  assert.ok(html.includes("if (e.key && S.fb2Base && e.key === S.fb2Base.key) fb2FollowOptOut(e.newValue);"));
  const send = body("async function sendFeedback2(sub)", "\n}\n");
  const kFollow = send.indexOf("fb2FollowOptOut();"), kUse = send.indexOf("if (fb2OptedOut(base)) payload.typing = base.payload.typing;"), kSend = send.indexOf("await sendSealed(payload");
  assert.ok(kFollow > send.indexOf("for (let tries = 1;") && kUse > kFollow && kSend > kUse);
  assert.ok(send.indexOf("if (withValues && fb2OptedOut(base) && S.fb2Base === base) { tries = 0; continue; }") > kSend);
  assert.ok(body("function fb2Hold(", "\n}\n").includes("key: S.draftKey"));
});

test("zweite Rückmeldung: Hinweise, wenn sie die Lehrkraft nicht erreicht – Ergebnis → Text (ruhig, ohne Tippzeiten), nichts bei „gesendet“ und „unverändert“", () => {
  const body = (start, end) => { const a = html.indexOf(start), b = html.indexOf(end, a); assert.ok(a > 0 && b > a, start); return html.slice(a, b); };
  const X = new Function(body("const FB2_HOLD_MS = ", "/* Die angenommene Nutzlast") + "\nreturn { FB2_MIN, fb2TeacherText, fb2RetryText };")();
  assert.equal(X.FB2_MIN, REPLACE_WINDOW_MS / 60e3);
  const ok = " Deine Abgabe ist davon nicht betroffen.";
  // „Die neue Rückmeldung“ wie im Abgabe-Dialog; nie behaupten, was die Lehrkraft jetzt hat (Abgabe bzw. Blatt womöglich gelöscht)
  assert.equal(X.fb2TeacherText("expired"), "Die neue Rückmeldung siehst nur du: An deine Lehrkraft lässt sie sich nur in den ersten 15 Minuten nach der Abgabe übermitteln." + ok);
  assert.equal(X.fb2TeacherText("gone"), "Die neue Rückmeldung ließ sich nicht mehr an deine Lehrkraft übermitteln." + ok);
  for (const r of ["failed", "skipped"]) assert.equal(X.fb2TeacherText(r), "Die neue Rückmeldung ließ sich nicht an deine Lehrkraft übermitteln." + ok);
  assert.match(html, /„Die neue Rückmeldung geht danach verschlüsselt auch an deine Lehrkraft\.“/);   // so kündigt es der Abgabe-Dialog an
  for (const r of ["expired", "gone", "failed", "skipped"]) assert.doesNotMatch(X.fb2TeacherText(r), /sie hat|hat deine Abgabe|bekommt deine Abgabe/);
  for (const r of ["sent", "same", "", undefined]) assert.equal(X.fb2TeacherText(r), "");
  assert.equal(X.fb2RetryText("expired"), "Seit deiner Abgabe sind mehr als 15 Minuten vergangen: Eine neue Rückmeldung siehst nur du – an deine Lehrkraft lässt sie sich nicht mehr übermitteln.");
  assert.equal(X.fb2RetryText("skipped"), "Eine neue Rückmeldung siehst nur du – an deine Lehrkraft lässt sie sich nicht übermitteln.");
  assert.equal(X.fb2RetryText("ok"), "");
  // keine weiteren Tippzeit-Sätze an sichtbaren Stellen (wie NO_TT in den E2E-Tests)
  const NO_TT = /Tippzeit|misst|Messung|gemessen|Zeitmess|Schreibprozess|widersprech|Widerspruch|Schalter|Haken/i;
  for (const x of ["expired", "gone", "failed", "skipped"]) { assert.doesNotMatch(X.fb2TeacherText(x), NO_TT); assert.doesNotMatch(X.fb2RetryText(x), NO_TT); }
  // angezeigt nur, solange dieselbe Abgabe auf der Bestätigungsseite steht – erst einblenden, dann füllen (sonst nicht angesagt)
  const show = body("function fb2TeacherShow(", "\n}\n");
  assert.ok(show.includes("if (!text || S.lastSubmission !== sub) return;") && show.includes("liveFill(el, el, text, () => S.lastSubmission === sub);"));
  assert.ok(body("async function requestFinalFeedback()", "\n}\n").includes("sendFeedback2(sub).catch(() => \"failed\").then((res) => fb2TeacherShow(sub, res));"));
  assert.ok(body("function finalFeedbackFailed(", "\n}\n").includes("fb2RetryNote();"));
  assert.match(html, /<p class="donefb-note hidden" id="done-fb-teacher" role="status"><\/p>/);
  assert.match(html, /<button type="button" class="btn ghost small hidden" id="done-fb-retry" aria-describedby="done-fb-retry-note">Rückmeldung erneut anfordern<\/button>\s*<p class="donefb-note hidden" id="done-fb-retry-note" role="status"><\/p>/);
});

test("zweite Rückmeldung: sendFeedback2 liefert ein Ergebnis – nur „sent“ zählt als gesendet (gone, Frist vorbei, gescheitert, nie gehalten nicht)", async () => {
  const body = (start, end) => { const a = html.indexOf(start), b = html.indexOf(end, a); assert.ok(a > 0 && b > a, start); return html.slice(a, b); };
  const src = [body("class ApiError extends Error {", "\n}\n") + "\n}\n", body("function fb2Release(sub)", "/* Unter „Rückmeldung erneut anfordern“"),
    body("const fb2OptedOut = ", "\n}\n") + "\n}\n", body("async function sendFeedback2(sub)", "\n}\n") + "\n}\n"].join("\n");
  const VALUES = { v: 1, answers: [{ first: "=", final: "R0dH" }] };
  // replies: je Aufruf von sendSealed eine Antwort (Objekt) oder ein Fehler (Funktion, die wirft); before(n, S, sub) läuft vor der Antwort
  const run = async ({ replies = [], held = true, until = Date.now() + 60e3, same = false, before } = {}) => {
    const sub = { code: "K7QM4X", fb2Sent: false, fb2Until: until, feedback2: { at: "2026-10-28T10:00:00.000Z", same, kept: [false, true], results: [{ covered: ["a"], missing: [] }, { covered: ["b"], missing: [] }] } };
    const S = { lastSubmission: sub, ttOptOut: false, ttLastRaw: null, fb2Base: null };
    if (held) S.fb2Base = { sub, payload: { v: 1, stage: "final", typing: VALUES }, pub: "PUB", attempt: "0123456789abcdef", submitAt: 1761645600000, key: "k1", timer: 0 };
    const calls = [];
    const f = new Function("S", "store", "ttStoredFlags", "ttOptOutPayload", "ttHasData", "sendSealed", "sleep", "fbOut", "normFb",
      src + "\nreturn { sendFeedback2, fb2Reach, ApiError };");
    let fns;
    const sendSealed = async (payload, bodyOf, pub) => {
      calls.push({ payload: JSON.parse(JSON.stringify(payload)), body: bodyOf("ENV"), pub });
      if (before) before(calls.length, S, sub);
      const r = replies[calls.length - 1];
      if (typeof r === "function") r(fns.ApiError);
      return r || { ok: true, id: 1, replaced: "final" };
    };
    fns = f(S, { get: () => null }, ttStoredFlags, ttOptOutPayload, ttHasData, sendSealed, async () => {}, (x) => x, (x) => x);
    const reachBefore = fns.fb2Reach(sub);
    const res = await fns.sendFeedback2(sub);
    return { res, calls, sub, S, reachBefore };
  };
  const err = (code, status) => (E) => { throw new E(code, "", status); };
  // angekommen: genau die gehaltene Nutzlast + feedback2 (nur neu beurteilte Aufgaben), als stage „feedback2“ mit Kennung und Eingang
  let r = await run();
  assert.deepEqual([r.res, r.sub.fb2Sent, r.S.fb2Base, r.calls.length, r.reachBefore], ["sent", true, null, 1, "ok"]);
  assert.deepEqual(r.calls[0].body, { code: "K7QM4X", envelope: "ENV", stage: "feedback2", attempt: "0123456789abcdef", receivedAt: 1761645600000 });
  assert.deepEqual(r.calls[0].payload.feedback2, { at: "2026-10-28T10:00:00.000Z", results: [{ covered: ["a"], missing: [] }, null] });
  // {ok:true, gone:true}: nichts ersetzt – nicht gesendet, kein weiterer Versuch
  r = await run({ replies: [{ ok: true, gone: true }] });
  assert.deepEqual([r.res, r.sub.fb2Sent, r.S.fb2Base, r.calls.length], ["gone", false, null, 1]);
  // gone, und inzwischen ist auch die Frist auf diesem Gerät vorbei → „expired“
  r = await run({ replies: [{ ok: true, gone: true }], before: (n, S, sub) => { sub.fb2Until = Date.now() - 1; } });
  assert.deepEqual([r.res, r.sub.fb2Sent], ["expired", false]);
  // Frist schon vorbei (Zeitgeber im Hintergrund gedrosselt): nichts gesendet, freigegeben
  r = await run({ until: Date.now() - 1 });
  assert.deepEqual([r.res, r.sub.fb2Sent, r.S.fb2Base, r.calls.length, r.reachBefore], ["expired", false, null, 0, "expired"]);
  // nie gehalten (z. B. ohne Kennung oder Eingang) → „skipped“, nichts gesendet
  r = await run({ held: false, until: 0 });
  assert.deepEqual([r.res, r.calls.length, r.reachBefore], ["skipped", 0, "skipped"]);
  // Frist abgelaufen (Zeitgeber hat freigegeben) → „expired“
  r = await run({ held: false, until: Date.now() - 1 });
  assert.deepEqual([r.res, r.calls.length], ["expired", 0]);
  // endgültig gescheitert (4xx außer 408/429) nach einem Versuch; dreimal vorübergehend → „failed“; vorübergehend, dann angekommen → „sent“
  r = await run({ replies: [err("bad_request", 400)] });
  assert.deepEqual([r.res, r.sub.fb2Sent, r.calls.length], ["failed", false, 1]);
  // das Blatt ist inzwischen gelöscht (404 not_found – mit ihm alle Abgaben): wie „gone“, nach Fristablauf „expired“; kein weiterer Versuch
  r = await run({ replies: [err("not_found", 404)] });
  assert.deepEqual([r.res, r.sub.fb2Sent, r.calls.length, r.S.fb2Base], ["gone", false, 1, null]);
  r = await run({ replies: [err("not_found", 404)], before: (n, S, sub) => { sub.fb2Until = Date.now() - 1; } });
  assert.deepEqual([r.res, r.calls.length], ["expired", 1]);
  r = await run({ replies: [err("server_error", 503), err("network", 0), err("rate_limited", 429)] });
  assert.deepEqual([r.res, r.sub.fb2Sent, r.calls.length, r.S.fb2Base], ["failed", false, 3, null]);
  r = await run({ replies: [err("server_error", 503)] });
  assert.deepEqual([r.res, r.sub.fb2Sent, r.calls.length], ["sent", true, 2]);
  // Frist läuft zwischen zwei Versuchen ab → „expired“, kein weiterer Versuch
  r = await run({ replies: [err("server_error", 503)], before: (n, S, sub) => { sub.fb2Until = Date.now() - 1; } });
  assert.deepEqual([r.res, r.calls.length], ["expired", 1]);
  // unverändert: nichts nachzureichen
  r = await run({ same: true });
  assert.deepEqual([r.res, r.calls.length, r.S.fb2Base], ["same", 0, null]);
  // Widerspruch, während die Werte unterwegs waren: einmal angekommen bleibt angekommen, auch wenn das Senden ohne Werte danach scheitert
  r = await run({ replies: [null, err("bad_request", 400)], before: (n, S) => { if (n === 1) S.fb2Base.payload.typing = { v: 1, optOut: true }; } });   // wie fb2FollowOptOut
  assert.deepEqual([r.res, r.sub.fb2Sent, r.calls.length], ["sent", true, 2]);
  assert.deepEqual([r.calls[0].payload.typing, r.calls[1].payload.typing], [VALUES, { v: 1, optOut: true }]);
  // „Neues Feibeitsblatt öffnen“ zwischen zwei Versuchen → „skipped“ (dann zeigt die Seite ohnehin nichts mehr dazu)
  r = await run({ replies: [err("server_error", 503)], before: (n, S) => { S.lastSubmission = null; } });
  assert.deepEqual([r.res, r.calls.length, r.sub.fb2Sent], ["skipped", 1, false]);
});

test("zweite Rückmeldung: fb2Check rechnet die Frist nach – auch wenn die Wanduhr springt (Ruhezustand) oder zurückgestellt wird; freigegeben spätestens nach FB2_HOLD_MS", () => {
  const body = (start, end) => { const a = html.indexOf(start), b = html.indexOf(end, a); assert.ok(a > 0 && b > a, start); return html.slice(a, b); };
  const src = body("const FB2_TICK_MS = ", "\n}\n") + "\n}\n";
  // nachgebaut: Wanduhr (Date.now) und Zeitgeber-Uhr (performance.now) getrennt steuerbar, Zeitgeber werden nur aufgezeichnet
  const run = ({ wallLeft, monoLeft }) => {
    let wall = 1_800_000_000_000, mono = 5_000, notes = 0;
    const timers = [], cleared = [];
    const sub = { fb2Until: wall + wallLeft };
    const base = { sub, timer: 0, until: mono + monoLeft };
    const S = { fb2Base: base };
    const env = { S, Date: { now: () => wall }, performance: { now: () => mono }, fb2RetryNote: () => { notes++; },
      setTimeout: (f, ms) => { timers.push(ms); return timers.length; }, clearTimeout: (id) => cleared.push(id) };
    const X = new Function(...Object.keys(env), src + "\nreturn { FB2_TICK_MS, fb2Check };")(...Object.values(env));
    X.fb2Check();
    return { X, S, base, timers, cleared, notes: () => notes, jump: (dWall, dMono) => { wall += dWall; mono += dMono; } };
  };
  // noch 10 Minuten: gehalten, nächste Prüfung nach FB2_TICK_MS (nicht erst nach 10 Minuten – ein Zeitgeber zählt die Schlafzeit nicht)
  let r = run({ wallLeft: 10 * 60e3, monoLeft: 10 * 60e3 });
  assert.equal(r.X.FB2_TICK_MS, 15e3);
  assert.equal(r.S.fb2Base, r.base);
  assert.deepEqual(r.timers, [15e3]);
  assert.equal(r.notes(), 1);   // der Hinweis unter dem Knopf wird jedes Mal nachgeführt
  // Ruhezustand: die Wanduhr springt 16 Minuten, die Zeitgeber-Uhr kaum → bei der nächsten Prüfung freigegeben, kein weiterer Zeitgeber
  r.jump(16 * 60e3, 15e3);
  r.X.fb2Check();
  assert.equal(r.S.fb2Base, null);
  assert.deepEqual(r.timers, [15e3]);
  assert.equal(r.notes(), 2);
  // kurz vor Ablauf: der letzte Zeitgeber trifft genau die Frist
  r = run({ wallLeft: 4e3, monoLeft: 4e3 });
  assert.deepEqual(r.timers, [4e3]);
  // Wanduhr zurückgestellt (wallLeft groß), seit dem Halten aber 15 Minuten vergangen (monoLeft ≤ 0) → trotzdem freigegeben
  r = run({ wallLeft: 60 * 60e3, monoLeft: 0 });
  assert.equal(r.S.fb2Base, null);
  assert.deepEqual(r.timers, []);
  // nichts gehalten: nur der Hinweis wird nachgeführt
  const none = run({ wallLeft: 1, monoLeft: 1 });
  none.S.fb2Base = null;
  none.X.fb2Check();
  assert.equal(none.notes(), 2);
  // aufgerufen beim Zurückkehren, vor dem Klick (Fokus, Mauszeiger auf dem Knopf) und aus fb2Hold
  assert.ok(html.includes('document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") fb2Check(); });'));
  assert.ok(html.includes('window.addEventListener("pageshow", () => fb2Check());') && html.includes('window.addEventListener("focus", () => fb2Check());'));
  assert.ok(html.includes('for (const ev of ["focus", "pointerenter"]) $("done-fb-retry").addEventListener(ev, () => fb2Check());'));
  assert.ok(!body("function fb2Hold(", "\n}\n").includes("setTimeout"));   // kein einzelner langer Zeitgeber mehr – fb2Check übernimmt
});
