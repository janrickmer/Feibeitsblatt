// escape.test.mjs – Feibeitsblatt als Finale eines Escape-Rooms: die reinen Hilfsfunktionen aus index.html (Blöcke BDAY, GROUP
// und ESCAPE) und die Abbildung von Zeichen außerhalb von WinAnsi in PDF-Dateien (pdfPlain)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fbEscapeHash as hashCopy, escHull } from "../escape-fixture.mjs";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const block = (name) => { const i = html.indexOf("/* " + name + ":BEGIN"), j = html.indexOf("/* " + name + ":END */"); assert.ok(i > 0 && j > i, name); return html.slice(i, j); };
const E = new Function(block("BDAY") + block("GROUP") + block("ESCAPE") +
  "\nreturn { fbEscapeHash, escCheck, escLine, escText, escIso, cleanEscapeSpec, escCleanPayload, escSummary, ESC_KIND, ESC_MAX_BYTES, ESC_ID_RE };")();
const plainSrc = /const pdfPlain = [\s\S]*?;\n/.exec(html)[0];
const pdfPlain = new Function(plainSrc + "return pdfPlain;")();

test("escape: Prüfsumme – Testvektoren der Schnittstelle v1 und dieselben Werte wie die Kopie des Raums", () => {
  assert.equal(E.fbEscapeHash("FbEscape|v1|{}"), "0bdda452e8d9ff95");
  assert.equal(E.fbEscapeHash('FbEscape|v1|{"a":"Größe – „x“"}'), "6721119dc06e029b");
  const chars = "abcXYZ019 äöüß–„“😀\n\t\"\\{}";
  for (let k = 0; k < 200; k++) {
    let str = "";
    for (let i = 0, n = Math.floor(Math.random() * 60); i < n; i++) str += chars[Math.floor(Math.random() * chars.length)];
    assert.equal(E.fbEscapeHash(str), hashCopy(str), JSON.stringify(str));
  }
  assert.equal(E.ESC_KIND, "feibeitsblatt-escape");
  assert.equal(E.ESC_MAX_BYTES, 96 * 1024);
});

test("escape: escCheck – ok bei unveränderten Daten, mismatch nach einer Änderung von d", () => {
  const hull = escHull({ code: "K7QM4X", word: "GLOBUS" });
  assert.equal(E.escCheck(hull), "ok");
  assert.equal(E.escCheck({ ...hull, d: hull.d.replace("GLOBUS", "GLOBUZ") }), "mismatch");
  assert.equal(E.escCheck({ ...hull, s: "0".repeat(16) }), "mismatch");
});

test("escape: escLine/escText/escIso – Steuer- und Formatzeichen, Kappung ohne halbes Ersatzzeichen-Paar, nur Texte", () => {
  assert.equal(E.escLine("  a\u0000b\tc\u202Ed\u200Be  \n f ", 100), "a b cde f");
  assert.equal(E.escLine(5, 10), "");
  assert.equal(E.escLine("x".repeat(10), 4), "xxxx");
  assert.equal(E.escLine("ab😀", 3), "ab");   // 😀 = zwei UTF-16-Einheiten: nicht halbieren
  assert.equal(E.escText("Erläuterung.\r\n\r\n\r\n\r\nGenaue Daten: −23,8 %\u0007 ", 100), "Erläuterung.\n\nGenaue Daten: −23,8 %");
  assert.equal(E.escText("a\u202E\n  b  ", 100), "a\nb");
  assert.equal(E.escIso("2026-10-27T10:00:00.000Z"), "2026-10-27T10:00:00.000Z");
  assert.equal(E.escIso("2026-10-27T12:00:00+02:00"), "2026-10-27T10:00:00.000Z");
  for (const v of ["", "gestern", 1761559200000, null, "2026-13-45", "x".repeat(41)]) assert.equal(E.escIso(v), "", String(v));
});

test("escape: cleanEscapeSpec – Blatt-Feld {id, name} wie validateEscapeSpec im Worker, aber null statt Fehler", () => {
  assert.deepEqual(E.cleanEscapeSpec({ id: " Powi-JG10-FastFashion ", name: " Fast\u202EFashion ", url: "https://x.example/" }), { id: "powi-jg10-fastfashion", name: "FastFashion" });
  assert.deepEqual(E.cleanEscapeSpec({ id: "abc", name: "x".repeat(80) }).name.length, 80);
  for (const v of [null, undefined, "abc", ["abc", "N"], { id: "ab", name: "N" }, { id: "a".repeat(61), name: "N" }, { id: "a_b", name: "N" },
    { id: "abc", name: "" }, { id: "abc", name: "\u200B " }, { id: "abc", name: "x".repeat(81) }, { id: 123, name: "N" }]) assert.equal(E.cleanEscapeSpec(v), null, JSON.stringify(v));
});

// Nutzlast an die Lehrkraft (so baut sie der Browser aus dem Datensatz des Raums) – frei erfundene Werte
const payload = () => ({
  room: { id: "test-escape", name: "FastFashion-Test" }, word: "GLOBUS", completedAt: "2026-10-27T10:15:00.000Z",
  stations: [
    { label: "Station 1 · Was steckt im Preis?", attempts: 1, errors: [] },
    { label: "Station 2 · Feld oder Ölquelle?", attempts: 3, errors: [{ item: "Rohstoff für Polyester", wrong: "Baumwolle", right: "Erdöl", note: "Polyester ist ein Kunststoff." }, { item: "Lücke 2", wrong: "", right: "Wasser" }] },
    { label: "Station 3 · Nähen für die Welt", attempts: 2, errors: [{ item: "Lohnanteil", wrong: "10 %", right: "ca. 1 %" }] },
  ],
  resumes: [{ place: "nach Station 2", savedAt: "2026-10-26T09:00:00.000Z", loadedAt: "2026-10-27T08:00:00.000Z" }],
  check: "ok",
});

test("escape: escCleanPayload – genau die erlaubten Schlüssel, Kappungen, check und omitted nur mit bekannten Werten", () => {
  const out = E.escCleanPayload(payload());
  assert.deepEqual(Object.keys(out), ["room", "word", "completedAt", "stations", "resumes", "check"]);
  assert.deepEqual(out.stations[1].errors, [{ item: "Rohstoff für Polyester", wrong: "Baumwolle", right: "Erdöl", note: "Polyester ist ein Kunststoff." }, { item: "Lücke 2", right: "Wasser" }]);   // leere Felder entfallen
  assert.deepEqual(out.resumes, payload().resumes);
  assert.equal(E.escCleanPayload({ ...payload(), check: "vielleicht" }).check, "unknown");
  assert.equal(E.escCleanPayload({ ...payload(), check: "mismatch" }).check, "mismatch");
  assert.equal(E.escCleanPayload({ ...payload(), omitted: "too_large" }).omitted, "too_large");
  assert.equal("omitted" in E.escCleanPayload({ ...payload(), omitted: "alles" }), false);
  // fremde Felder und Personendaten entfallen; Name leer → Kennung; ungültige Kennung → null
  const x = E.escCleanPayload({ ...payload(), person: { vorname: "Max" }, confirm: "123", notes: [{ label: "L", text: "T" }], room: { id: "test-escape", name: "", url: "javascript:alert(1)" } });
  assert.deepEqual(Object.keys(x), ["room", "word", "completedAt", "stations", "resumes", "check"]);
  assert.deepEqual(x.room, { id: "test-escape", name: "test-escape" });
  for (const bad of [null, "x", [], { ...payload(), room: { id: "Test Escape" } }, { ...payload(), room: null }]) assert.equal(E.escCleanPayload(bad), null);
  // Grenzen: 20 Stationen, 30 Fehler je Station, 20 Zwischenstände, 2000 Zeichen, Versuche 0–999; Fehler ohne item entfallen
  const many = E.escCleanPayload({ ...payload(), word: "W".repeat(100),
    stations: Array.from({ length: 25 }, (_, i) => ({ label: "L".repeat(2500), attempts: i === 0 ? 1000 : i === 1 ? -1 : i === 2 ? 2.5 : i === 3 ? "3" : 4,
      errors: Array.from({ length: 40 }, (_, k) => ({ item: k === 0 ? "" : "I" + k, wrong: "w".repeat(2500), right: 7 })) })),
    resumes: Array.from({ length: 30 }, () => ({ place: "p", savedAt: "x", loadedAt: 5 })) });
  assert.equal(many.word.length, 60);
  assert.equal(many.stations.length, 20);
  assert.deepEqual(many.stations.slice(0, 5).map((st) => st.attempts), [0, 0, 0, 0, 4]);
  assert.equal(many.stations[0].label.length, 2000);
  assert.equal(many.stations[0].errors.length, 29);   // 30 gelesen, der erste ohne item entfällt
  assert.deepEqual(Object.keys(many.stations[0].errors[0]), ["item", "wrong"]);
  assert.equal(many.stations[0].errors[0].wrong.length, 2000);
  assert.equal(many.resumes.length, 20);
  assert.deepEqual(many.resumes[0], { place: "p", savedAt: "", loadedAt: "" });
});

test("escape: fremde Daten – __proto__ auf jeder Ebene, sehr lange Listen, HTML und Bidi-Steuerzeichen bleiben Text", () => {
  const evil = JSON.parse('{"__proto__":{"polluted":1},"room":{"id":"test-escape","name":"<img src=x onerror=alert(1)>","__proto__":{"polluted":2}},' +
    '"stations":[{"__proto__":{"polluted":3},"label":"S\\u202e1","attempts":2,"errors":[{"__proto__":{"polluted":4},"item":"<b>x</b>\\u0000"}]}],' +
    '"resumes":[{"__proto__":{"polluted":5},"place":"p"}],"check":"ok"}');
  const out = E.escCleanPayload(evil);
  assert.equal(({}).polluted, undefined);
  assert.equal(out.polluted, undefined); assert.equal(out.room.polluted, undefined); assert.equal(out.stations[0].polluted, undefined);
  assert.equal(out.stations[0].errors[0].polluted, undefined); assert.equal(out.resumes[0].polluted, undefined);
  assert.equal(Object.getPrototypeOf(out.room), Object.prototype);
  assert.equal(out.room.name, "<img src=x onerror=alert(1)>");   // bleibt Text (Anzeige nur per textContent)
  assert.equal(out.stations[0].label, "S1");
  assert.equal(out.stations[0].errors[0].item, "<b>x</b>");
  const errors = Array.from({ length: 10000 }, () => ({ item: "i" }));   // eine Liste für alle Stationen (sonst 100 Mio. Objekte im Test)
  const big = { room: { id: "test-escape" }, stations: Array.from({ length: 10000 }, () => ({ attempts: 1, errors })), resumes: Array.from({ length: 10000 }, () => ({ place: "p" })) };
  const t0 = performance.now(), r = E.escCleanPayload(big), ms = performance.now() - t0;
  assert.equal(r.stations.length, 20); assert.equal(r.stations[0].errors.length, 30); assert.equal(r.resumes.length, 20);
  assert.ok(ms < 50, ms + " ms");
});

test("escape: escSummary – fehlerfrei = genau ein Versuch ohne Fehler (wie die Überblick-PDF des Raums), Fehler zusammen, nicht übermittelt", () => {
  const out = E.escCleanPayload(payload());
  assert.deepEqual(E.escSummary(out.stations), { n: 3, clean: 1, errors: 3, attempts: 6 });
  // 0 Versuche zählen nicht als fehlerfrei; unstimmig (1 Versuch, aber Fehler) auch nicht
  assert.deepEqual(E.escSummary([{ attempts: 0, errors: [] }, { attempts: 1, errors: [{ item: "x" }] }, { attempts: 1, errors: [] }]), { n: 3, clean: 1, errors: 1, attempts: 2 });
  // Notfall ohne Fehler-Einzelheiten: Stationen mit mehreren Versuchen bleiben nicht fehlerfrei, die Fehlerzahl ist unbekannt
  assert.deepEqual(E.escSummary([{ attempts: 1, errors: [] }, { attempts: 3, errors: [] }], true), { n: 2, clean: 1, errors: null, attempts: 4 });
  assert.deepEqual(E.escSummary(undefined), { n: 0, clean: 0, errors: 0, attempts: 0 });
});

test("pdfPlain: Zeichen aus den Daten eines Escape-Rooms lesbar statt „?“ (Minuszeichen, ungefähr, geschützte Bindestriche, schmale Leerzeichen)", () => {
  assert.equal(pdfPlain("−23,8 %"), "-23,8 %");
  assert.equal(pdfPlain("≈ 81 %"), "~ 81 %");
  assert.equal(pdfPlain("Ultra‑Fast‐Fashion"), "Ultra-Fast-Fashion");
  assert.equal(pdfPlain("1 000 t"), "1 000 t");
  assert.equal(pdfPlain("Kaffee → Brasilien ✓"), "Kaffee -> Brasilien ");
});
