// group.test.mjs – Partner- / Gruppenarbeit: die reinen Hilfsfunktionen aus index.html (Block GROUP:BEGIN … GROUP:END)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const i = html.indexOf("/* GROUP:BEGIN"), j = html.indexOf("/* GROUP:END */");
const { parseKuerzel, checkGroup, cleanGroup, groupSorted, isGroup, normKlasse, GROUP_MIN, GROUP_MAX } =
  new Function(html.slice(i, j) + "\nreturn { parseKuerzel, checkGroup, cleanGroup, groupSorted, isGroup, normKlasse, GROUP_MIN, GROUP_MAX };")();
const k = (raw) => parseKuerzel(raw).k;

test("group: Block in index.html gefunden, 2 bis 10 Personen", () => {
  assert.ok(i > 0 && j > i);
  assert.equal(GROUP_MIN, 2);
  assert.equal(GROUP_MAX, 10);
  // das Eingabefeld lässt „Max - Mu“ zu (maxlength im Markup von addMember)
  assert.match(html, /h\("input", \{ type: "text", maxlength: "8", autocomplete: "off", autocorrect: "off", spellcheck: "false"/);
});

test("group: Kürzel mit Trenner, Groß-/Kleinwechsel oder 3 + 2", () => {
  assert.equal(k("MaxMu"), "MaxMu");
  assert.equal(k("maxmu"), "MaxMu");      // 5 Buchstaben ohne Hinweis → 3 + 2
  assert.equal(k("MAXMU"), "MaxMu");
  assert.equal(k(" max mu "), "MaxMu");   // Leerzeichen als Trenner
  assert.equal(k("max-MU"), "MaxMu");     // Bindestrich als Trenner
  assert.equal(k("Max – Mu"), "MaxMu");   // Gedankenstrich mit Leerzeichen
  assert.equal(k("LiMu"), "LiMu");        // Groß-/Kleinwechsel: 2 + 2
  assert.equal(k("li mu"), "LiMu");
  assert.equal(k("maxM"), "MaxM");        // 3 + 1
  assert.equal(k("Lim"), "Lim");          // ohne Hinweis und weniger als 5: so lassen
  assert.equal(k("limu"), "Limu");
  assert.equal(k("özgün"), "ÖzgÜn");
  assert.equal(k("Jo"), undefined);       // zu kurz
  assert.equal(k("émi la"), "Émi" + "La");   // NFC: e + Akut → é
});

test("group: Fehlerarten", () => {
  assert.deepEqual(parseKuerzel(""), { err: "empty" });
  assert.deepEqual(parseKuerzel("  - "), { err: "empty" });
  assert.deepEqual(parseKuerzel("Ma1Mu"), { err: "chars" });
  assert.deepEqual(parseKuerzel("Max.Mu"), { err: "chars" });
  assert.deepEqual(parseKuerzel("Max Mus"), { err: "form" });    // Nachname höchstens 2
  assert.deepEqual(parseKuerzel("M Mu"), { err: "form" });       // Vorname mindestens 2
  assert.deepEqual(parseKuerzel("Maxi Mu"), { err: "form" });    // Vorname höchstens 3
  assert.deepEqual(parseKuerzel("MaxMus"), { err: "form" });     // ohne Trenner höchstens 5
  assert.deepEqual(parseKuerzel("Ma Mu Li"), { err: "form" });   // nur ein Trenner
});

test("group: noch einmal geprüft bleibt jedes Kürzel gleich (Zwischenstand, PDF)", () => {
  for (const raw of ["MaxMu", "maxmu", "li mu", "LiMu", "maxM", "Lim", "limu", "MAXMU", "ab-c", "özgün", "MaXmu", "LiMue"]) {
    const a = k(raw);
    if (a) assert.equal(k(a), a, raw);
  }
});

test("group: ganze Gruppe – Meldungen, doppelte Kürzel, mindestens zwei", () => {
  assert.deepEqual(checkGroup(["max mu", "LiMu", "tim-be"]), { gruppe: ["MaxMu", "LiMu", "TimBe"] });
  assert.deepEqual(checkGroup([""]), { err: "Bitte tragt für Person 1 die ersten drei Buchstaben des Vornamens und die ersten zwei des Nachnamens ein (z. B. „MaxMu“).", at: 0 });
  assert.deepEqual(checkGroup(["MaxMu", ""]), { err: "Bitte tragt für Person 2 die ersten drei Buchstaben des Vornamens und die ersten zwei des Nachnamens ein (z. B. „MaxMu“) – oder entfernt das leere Feld.", at: 1 });
  assert.deepEqual(checkGroup(["MaxMu", "Li7"]), { err: "Bei Person 2 sind nur Buchstaben erlaubt – zwischen Vor- und Nachnamen auch ein Leerzeichen oder ein Bindestrich.", at: 1 });
  assert.deepEqual(checkGroup(["MaxMu", "Tom Berg"]), { err: "Bitte tragt für Person 2 die ersten drei Buchstaben des Vornamens und die ersten zwei des Nachnamens ein, z. B. „MaxMu“ (bei kürzerem Vornamen den ganzen Vornamen).", at: 1 });
  assert.deepEqual(checkGroup(["MaxMu", "LiMu", "max mu"]), { err: "Person 1 und Person 3 haben dasselbe Kürzel („MaxMu“). Bitte prüft eure Eingaben – heißen zwei von euch wirklich so, lasst bei einer Person einen Buchstaben weg (z. B. „MaMu“ statt „MaxMu“).", at: 2 });
  assert.equal(checkGroup(["Limu", "LiMu"]).at, 1);   // ohne Groß-/Kleinschreibung gleich
  assert.deepEqual(checkGroup(["MaxMu"]), { err: "Für Partner- oder Gruppenarbeit tragt bitte mindestens zwei Personen ein. Arbeitest du allein, wähle „Einzelarbeit“.", at: -1 });
  assert.deepEqual(checkGroup([]).at, -1);
  const ten = ["AnnAb", "BenBa", "CemCe", "DanDe", "EmmEr", "FinFa", "GunGo", "HanHu", "IdaIl", "JanJo"];
  assert.deepEqual(checkGroup(ten), { gruppe: ten });
  assert.equal(checkGroup(ten.concat(["KimKo"])).err, "Höchstens 10 Personen.");
});

test("group: gespeicherte Gruppe prüfen, Reihenfolge egal", () => {
  assert.deepEqual(cleanGroup({ gruppe: ["maxmu", "Li Mu"], klasse: " 8 b " }), { gruppe: ["MaxMu", "LiMu"], klasse: "8b" });
  assert.equal(cleanGroup({ gruppe: ["MaxMu"], klasse: "8b" }), null);
  assert.equal(cleanGroup({ gruppe: ["MaxMu", "MaxMu"], klasse: "8b" }), null);
  assert.equal(cleanGroup({ gruppe: ["MaxMu", 7], klasse: "8b" }), null);
  assert.equal(cleanGroup({ gruppe: ["MaxMu", "LiMu"], klasse: "8b!" }), null);
  assert.equal(cleanGroup({ gruppe: ["MaxMu", "LiMu"] }), null);
  assert.equal(cleanGroup({ gruppe: Array.from({ length: 11 }, (_, n) => "Ab" + String.fromCharCode(65 + n)), klasse: "8b" }), null);
  assert.equal(cleanGroup({ vorname: "Max", nachname: "Mu", klasse: "8b" }), null);
  assert.equal(isGroup({ gruppe: [] }), true);
  assert.equal(isGroup({ vorname: "Max" }), false);
  assert.equal(isGroup(null), false);
  assert.deepEqual(groupSorted(["TimBe", "MaxMu", "LiMu"]), ["limu", "maxmu", "timbe"]);
  assert.deepEqual(groupSorted(["LiMu", "TimBe", "MaxMu"]), groupSorted(["MaxMu", "LiMu", "TimBe"]));
  assert.equal(normKlasse("8. b"), "8b");
});
