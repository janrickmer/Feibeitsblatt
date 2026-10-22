// bday.test.mjs – Geburtstag ohne Jahr: die reinen Hilfsfunktionen aus index.html (Block BDAY:BEGIN … BDAY:END)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const i = html.indexOf("/* BDAY:BEGIN"), j = html.indexOf("/* BDAY:END */");
const { bdayOf, fmtBday, asciiDigits, parseBdayInput, legacyBirthDates, BDAY_LEGACY_UNTIL } =
  new Function(html.slice(i, j) + "\nreturn { bdayOf, fmtBday, asciiDigits, parseBdayInput, legacyBirthDates, BDAY_LEGACY_UNTIL };")();

test("bday: Block in index.html gefunden", () => { assert.ok(i > 0 && j > i); });

test("bday: neues Format --MM-TT, 29.02. erlaubt, unmögliche Tage nicht", () => {
  assert.equal(bdayOf("--05-04"), "--05-04");
  assert.equal(bdayOf("--02-29"), "--02-29");
  assert.equal(bdayOf("--12-31"), "--12-31");
  for (const bad of ["--02-30", "--04-31", "--13-01", "--00-10", "--05-00", "--5-4", "05-04", "04.05.", "", null, undefined, 42])
    assert.equal(bdayOf(bad), "", String(bad));
});

test("bday: altes volles Datum → Jahr verworfen (nur echte Kalenderdaten)", () => {
  assert.equal(bdayOf("2009-05-04"), "--05-04");
  assert.equal(bdayOf("2012-02-29"), "--02-29");
  assert.equal(bdayOf(" 2010-02-02 "), "--02-02");
  assert.equal(bdayOf("2011-02-29"), "");   // kein Schaltjahr
  assert.equal(bdayOf("2011-04-31"), "");
  assert.equal(bdayOf("04.05.2009"), "");
});

test("bday: Anzeige TT.MM. für alt und neu, Unlesbares unverändert", () => {
  assert.equal(fmtBday("--05-04"), "04.05.");
  assert.equal(fmtBday("2009-05-04"), "04.05.");
  assert.equal(fmtBday("--02-29"), "29.02.");
  assert.equal(fmtBday(""), "–");
  assert.equal(fmtBday(undefined), "–");
  assert.equal(fmtBday("<b>x</b>"), "<b>x</b>");   // nur per textContent
});

test("bday: Eingabe Tag + Monat mit Meldungen", () => {
  const e = (d, m) => parseBdayInput(d, m);
  assert.deepEqual(e("", ""), { err: "Bitte gib deinen Geburtstag ein (Tag und Monat).", field: "d" });
  assert.deepEqual(e("", "5"), { err: "Bitte gib den Tag deines Geburtstags ein.", field: "d" });
  for (const d of ["0", "00", "32", "99", "a", "4a", "-1", "1,"]) assert.deepEqual(e(d, "5"), { err: "Bitte gib beim Tag eine Zahl von 1 bis 31 ein.", field: "d" }, d);
  assert.deepEqual(e("4", ""), { err: "Bitte gib den Monat deines Geburtstags ein.", field: "m" });
  for (const m of ["0", "13", "Mai", "5a"]) assert.deepEqual(e("4", m), { err: "Bitte gib beim Monat eine Zahl von 1 bis 12 ein (z. B. 5 für Mai).", field: "m" }, m);
  assert.deepEqual(e("30", "2"), { err: "Den 30. Februar gibt es nicht. Bitte prüfe deinen Geburtstag.", field: "d" });
  assert.deepEqual(e("31", "04"), { err: "Den 31. April gibt es nicht. Bitte prüfe deinen Geburtstag.", field: "d" });
  assert.deepEqual(e("31", "11"), { err: "Den 31. November gibt es nicht. Bitte prüfe deinen Geburtstag.", field: "d" });
  assert.deepEqual(e("4", "5"), { iso: "--05-04" });
  assert.deepEqual(e(" 04 ", "05"), { iso: "--05-04" });
  assert.deepEqual(e("4.", "5."), { iso: "--05-04" });
  assert.deepEqual(e("29", "2"), { iso: "--02-29" });
  assert.deepEqual(e("31", "12"), { iso: "--12-31" });
});

test("bday: Übergang – passende volle Daten für den alten Speicherschlüssel", () => {
  const now = new Date(2026, 9, 22, 12);
  const may = legacyBirthDates("--05-04", now);
  assert.equal(may.length, 2026 - 1950 + 1);
  assert.equal(may[0], "2026-05-04"); assert.equal(may.at(-1), "1950-05-04");
  assert.ok(may.includes("2009-05-04"));
  assert.ok(!legacyBirthDates("--12-24", now).includes("2026-12-24"));   // nichts in der Zukunft
  const leap = legacyBirthDates("--02-29", now);
  assert.equal(leap.length, 19);                                         // 1952 … 2024
  assert.ok(leap.every((g) => +g.slice(0, 4) % 4 === 0));
  assert.deepEqual(legacyBirthDates("", now), []);
  assert.deepEqual(legacyBirthDates("--02-30", now), []);
});

test("bday: Übergang endet nach BDAY_LEGACY_UNTIL (Ortszeit) – danach keine Suche nach alten Schlüsseln mehr", () => {
  assert.match(BDAY_LEGACY_UNTIL, /^\d{4}-\d{2}-\d{2}$/);
  const [y, m, d] = BDAY_LEGACY_UNTIL.split("-").map(Number);
  assert.ok(legacyBirthDates("--05-04", new Date(y, m - 1, d, 23, 59)).includes("2009-05-04"));   // am letzten Tag noch
  assert.deepEqual(legacyBirthDates("--05-04", new Date(y, m - 1, d + 1, 0, 0)), []);             // ab dem Tag danach nicht mehr
  assert.deepEqual(legacyBirthDates("--05-04", new Date(y + 1, 0, 1)), []);
});

test("bday: Ziffern anderer Schriften (Unicode-Kategorie Nd) zählen wie 0–9", () => {
  assert.equal(asciiDigits("0123456789"), "0123456789");
  assert.equal(asciiDigits("٠١٢٣٤٥٦٧٨٩"), "0123456789");                // arabisch-indisch
  assert.equal(asciiDigits("０１２３４５６７８９"), "0123456789");      // Vollbreite
  assert.equal(asciiDigits("०५"), "05");                                 // Devanagari
  assert.equal(asciiDigits("𝟎𝟗𝟘𝟡𝟿"), "09099");                           // mathematische Ziffern (mehrere Blöcke hintereinander)
  assert.equal(asciiDigits(" 4. "), " 4. ");
  assert.equal(asciiDigits(null), "");
  assert.deepEqual(parseBdayInput("٤", "٥"), { iso: "--05-04" });
  assert.deepEqual(parseBdayInput("２９", "０２"), { iso: "--02-29" });
  assert.deepEqual(parseBdayInput("３１", "４"), { err: "Den 31. April gibt es nicht. Bitte prüfe deinen Geburtstag.", field: "d" });
  assert.deepEqual(parseBdayInput("Ⅳ", "5"), { err: "Bitte gib beim Tag eine Zahl von 1 bis 31 ein.", field: "d" });   // römisch: keine Dezimalziffer
});
