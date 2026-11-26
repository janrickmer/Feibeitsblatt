// tablepre.test.mjs – Vorgaben der Lehrkraft in Tabellen: die reinen Hilfsfunktionen aus index.html (Block TABLEPRE:BEGIN … TABLEPRE:END)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LIMITS, validateAnswerSpec } from "../../worker/lib.js";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const i = html.indexOf("/* TABLEPRE:BEGIN"), j = html.indexOf("/* TABLEPRE:END */");
assert.ok(i > 0 && j > i, "Block TABLEPRE fehlt");
const block = html.slice(i, j);
for (const bad of [/\$\(/, /(^|[^\w.])S\.[a-z]/, /\bdocument\b/, /\bwindow\b/]) assert.equal(bad.test(block), false, "Block TABLEPRE ist nicht rein: " + bad);
const F = new Function(block + "\nreturn { PRE_LIMITS, preCell, cleanPrefill, prefillCheck, preHas, preLocked, tablePlace, tableFill, preOwn };")();
// Textform wie im Browser (Block TYPING): erste Zeile Überschriften, dann je nicht leerer Zeile „Zelle | Zelle“
const tt = html.slice(html.indexOf("/* TYPING:BEGIN"), html.indexOf("/* TYPING:END */"));
const { tableText, tableRows } = new Function(tt + "\nreturn { tableText, tableRows };")();

test("Grenzen wie im Worker", () => {
  assert.deepEqual(F.PRE_LIMITS, { cell: LIMITS.tableCell, total: LIMITS.tablePrefill, rows: LIMITS.tableRows });
});
test("cleanPrefill: fremde Daten gekappt, „|“ → „/“, leere Zeilen am Ende weg; wie der Server", () => {
  assert.equal(F.cleanPrefill(null, 2), null);
  assert.equal(F.cleanPrefill([["", ""]], 2), null);
  assert.deepEqual(F.cleanPrefill([[" Rom ", 3, "zu viel"], ["a|b"], []], 2), [["Rom", ""], ["a/b", ""]]);
  assert.equal(F.cleanPrefill([["x".repeat(300)]], 1)[0][0].length, 200);
  const big = F.cleanPrefill(Array(20).fill(["x".repeat(200)]), 1);
  assert.equal(big.flat().join("").length, 3000);
  const raw = [["Italien", null], ["", " Paris "]];
  assert.deepEqual(F.cleanPrefill(raw, 2), validateAnswerSpec({ type: "table", columns: ["A", "B"], rows: 2, cells: raw }, 1).cells);
});
test("prefillCheck: Meldungen wie der Server, mindestens eine offene Zelle", () => {
  assert.deepEqual(F.prefillCheck([["a", ""], ["", ""]], 2, 3), { cells: [["a", ""]], err: "" });
  assert.deepEqual(F.prefillCheck([["", ""]], 2, 3), { cells: null, err: "" });
  assert.deepEqual(F.prefillCheck([["a", "b"], ["c", "d"], ["e", "f"]], 2, 2), { cells: null, err: "In der Tabelle muss mindestens eine Zelle zum Ausfüllen leer bleiben." });
  assert.deepEqual(F.prefillCheck([["a", "b"]], 2, 2).cells, [["a", "b"]]);   // Zeile 2 bleibt offen
  assert.match(F.prefillCheck([["x".repeat(201)]], 1, 2).err, /Zeile 1 .*höchstens 200/);
  assert.match(F.prefillCheck(Array(16).fill(["x".repeat(200)]), 1, 30).err, /zusammen zu lang \(höchstens 3\.000/);
  assert.deepEqual(F.prefillCheck([["a"], ["b"], [""], ["c"]], 1, 3).cells, [["a"], ["b"]]);   // nur die Zeilen der Tabelle
});
test("tableFill/tablePlace: Wiederherstellen aus der Textform passt die Zeilen an die Vorlage an", () => {
  const cols = ["Land", "Hauptstadt"], pre = [["Italien", ""], ["", ""], ["Frankreich", ""], ["", "Madrid"]];
  const round = (grid) => F.tableFill(pre, tableRows(tableText(cols, grid), 2), 5, 2);
  // Leere Zeilen (ohne Vorgaben) entfallen in der Textform – die Zuordnung stellt sie wieder her
  const g1 = [["Italien", "Rom"], ["", ""], ["Frankreich", "Paris"], ["Spanien", "Madrid"], ["", ""]];
  assert.deepEqual(round(g1), g1);
  const g2 = [["Italien", ""], ["Polen", "Warschau"], ["Frankreich", ""], ["", "Madrid"], ["Peru", "Lima"]];
  assert.deepEqual(round(g2), g2);
  // Eine Zeile ohne Vorgaben, in der zufällig derselbe Text steht wie eine Vorgabe darunter
  const g3 = [["Italien", "Rom"], ["Frankreich", "x"], ["Frankreich", "Paris"], ["", "Madrid"], ["", ""]];
  assert.deepEqual(round(g3), g3);
  // Ohne Vorgaben: unverändert wie bisher
  assert.deepEqual(F.tablePlace(null, [["a"], ["b"]]), [0, 1]);
  // Mehr Zeilen als Platz: weitere Zeilen hinten (höchstens 30)
  const data = tableRows(tableText(cols, [["Italien", "Rom"], ["A", "1"], ["B", "2"], ["Frankreich", "Paris"]]), 2);
  const g = F.tableFill([["Italien", ""], ["", ""], ["Frankreich", ""]], data, 3, 2);
  assert.deepEqual(g[0], ["Italien", "Rom"]); assert.deepEqual(g[1], ["A", "1"]); assert.deepEqual(g[2], ["Frankreich", "Paris"]); assert.deepEqual(g[3], ["B", "2"]);
  // Vorgaben gewinnen immer gegen den Text in gesperrten Zellen
  assert.deepEqual(F.tableFill([["Italien", ""]], [["Anders", "Rom"]], 1, 2)[0], ["Italien", ""]);
  // Leere Antwort: die Vorlage
  assert.deepEqual(F.tableFill(pre, [], 2, 2), pre);
  assert.equal(F.tableFill(null, Array(40).fill(["a"]), 3, 1).length, 30);
});
test("preOwn: nur eigene Einträge zählen", () => {
  const pre = [["Italien", ""]];
  assert.equal(F.preOwn(pre, [["Italien", ""], ["", " "]]), false);
  assert.equal(F.preOwn(pre, [["Italien", "Rom"]]), true);
  assert.equal(F.preOwn(null, [["a"]]), true);
});
