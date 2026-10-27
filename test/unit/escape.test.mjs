// escape.test.mjs – Feibeitsblatt als Finale eines Escape-Rooms: die reinen Hilfsfunktionen aus index.html (Blöcke BDAY, GROUP
// und ESCAPE) und die Abbildung von Zeichen außerhalb von WinAnsi in PDF-Dateien (pdfPlain)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fbEscapeHash as hashCopy, escHull, b64url, overviewPdf } from "../escape-fixture.mjs";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const block = (name) => { const i = html.indexOf("/* " + name + ":BEGIN"), j = html.indexOf("/* " + name + ":END */"); assert.ok(i > 0 && j > i, name); return html.slice(i, j); };
// Blöcke BDAY, GROUP, ESCAPE und PDFREAD (der PDF-Leser braucht nur td = TextDecoder)
const E = new Function("td", block("BDAY") + block("GROUP") + block("ESCAPE") + block("PDFREAD") +
  "\nreturn { fbEscapeHash, escCheck, escLine, escText, escIso, cleanEscapeSpec, escCleanPayload, escSummary, ESC_KIND, ESC_MAX_BYTES, ESC_ID_RE, " +
  "escB64urlBytes, escHull, escBirth, cleanEscape, escKuerzel, escPerson, escPayload, escTrim, escHasDetails, readStartPdf, feibeitsblattPdfKind };")(new TextDecoder());
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

// Datensatz des Raums (brief 3.2) – frei erfundene Werte; confirm ist eine beliebige Ziffernfolge
const record = (o = {}) => ({
  code: "K7QM4X",
  room: { id: "test-escape", name: "FastFashion-Test", url: "https://escape.example/" },
  person: { vorname: "Maximilian", nachname: "Mustermann", geburtsdatum: "04.05.2010", klasse: "10 b" },
  confirm: "31415926", word: "GLOBUS", completedAt: "2026-10-27T10:15:00.000Z",
  stations: payload().stations,
  notes: [{ label: "Station 1 · Was steckt im Preis?", text: "Der Preis enthält viele Anteile.\n\nGenaue Daten: −23,8 % gegenüber dem Vorjahr; ≈ 81 % Anteil." }],
  resumes: payload().resumes,
  ...o,
});

test("escape: Link (#escape=…) – Base64url, Padding, Prozentkodierung; falsche Zeichen, zu lang (vor dem Dekodieren), kaputtes UTF-8 und fremde Hüllen → null", () => {
  const hull = escHull(record()), json = JSON.stringify(hull), raw = b64url(json);
  assert.deepEqual(E.escHull(E.escB64urlBytes(raw)), hull);
  const padded = Buffer.from(json, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");   // mit „=“ am Ende
  assert.deepEqual(E.escHull(E.escB64urlBytes(padded)), hull);
  assert.deepEqual(E.escHull(E.escB64urlBytes(raw.replace(/A/g, "%41"))), hull);   // prozentkodiert (manche Programme kodieren den Hash)
  assert.deepEqual(E.escHull(json), hull);   // auch als Text und als Objekt (Zwischenstand) – immer ein neues Objekt mit genau vier Feldern
  const extra = E.escHull({ ...hull, extra: 1 });
  assert.deepEqual(Object.keys(extra), ["kind", "v", "d", "s"]);
  for (const bad of ["", "%%%", "%E0%A4%A", raw + "!", raw + "+", raw.slice(0, 1), "A".repeat(4 * 33000)]) assert.equal(E.escB64urlBytes(bad), null, bad.slice(0, 20));
  const t0 = performance.now();
  assert.equal(E.escB64urlBytes("A".repeat(10_000_000)), null);   // viel zu lang: sofort abgelehnt
  assert.ok(performance.now() - t0 < 20);
  assert.equal(E.escHull(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])), null);   // kein gültiges UTF-8
  assert.equal(E.escHull(null), null);
  for (const o of [{ kind: "feibeitsblatt-draft" }, { v: 2 }, { v: "1" }, { d: {} }, { s: "XYZ" }, { s: "ABCDEF0123456789" }, { s: "g".repeat(16) }, { s: undefined }])
    assert.equal(E.escHull({ ...hull, ...o }), null, JSON.stringify(o));
  // Obergrenze 96 KB – auch für Objekte aus dem Zwischenstand gemessen (kompakte Form, UTF-8)
  assert.equal(E.escHull({ ...hull, d: "ü".repeat(E.ESC_MAX_BYTES / 2) }), null);
  assert.notEqual(E.escHull({ ...hull, d: "x".repeat(E.ESC_MAX_BYTES - 200) }), null);
});

test("escape: cleanEscape – Grenzen aus der Schnittstelle, Code, Raum (ohne url), Person, Geburtsdatum, Klasse, confirm nur Ziffern", () => {
  const r = E.cleanEscape(record());
  assert.deepEqual(Object.keys(r), ["code", "room", "person", "confirm", "word", "completedAt", "stations", "notes", "resumes"]);
  assert.deepEqual(r.room, { id: "test-escape", name: "FastFashion-Test" });   // url entfällt
  assert.deepEqual(r.person, { vorname: "Maximilian", nachname: "Mustermann", geburtsdatum: "04.05.2010", klasse: "10b" });
  assert.equal(r.confirm, "31415926");
  assert.equal(r.notes[0].text, "Der Preis enthält viele Anteile.\n\nGenaue Daten: −23,8 % gegenüber dem Vorjahr; ≈ 81 % Anteil.");   // die Leerzeile bleibt
  assert.equal(E.cleanEscape(record({ code: "" })).code, "");   // noch nicht freigeschaltet
  assert.equal(E.cleanEscape(record({ code: "k7q-m4x" })).code, "K7QM4X");
  for (const code of ["K7QM4", "AAAAAA", "234567", "K7QM4I", undefined, 5, "K".repeat(41)]) assert.equal(E.cleanEscape(record({ code })), null, String(code));
  for (const room of [null, "x", { id: "ab" }, { id: "Test Escape" }, { name: "x" }]) assert.equal(E.cleanEscape(record({ room })), null, JSON.stringify(room));
  for (const bad of [null, "x", [], 5]) assert.equal(E.cleanEscape(bad), null);
  const p = (person) => E.cleanEscape(record({ person })).person;
  assert.deepEqual(p({ vorname: "V".repeat(80), nachname: " Mu‮ster\u0000mann ", geburtsdatum: "31.04.2010", klasse: "10b!!" }),
    { vorname: "V".repeat(60), nachname: "Muster mann", geburtsdatum: "", klasse: "" });
  for (const [g, want] of [["29.02.2011", ""], ["29.02.2012", "29.02.2012"], ["4.5.2010", ""], ["01.01.1899", ""], ["2010-05-04", ""], [" 04.05.2010", ""], ["31.12.2999", ""], [20100504, ""]])
    assert.equal(p({ geburtsdatum: g }).geburtsdatum, want, String(g));
  assert.equal(p({ klasse: "E 1" }).klasse, "E1");
  assert.equal(p({ klasse: "10 b" }).klasse, "10b");
  assert.equal(p({ klasse: "12345678901" }).klasse, "");   // länger als 10 → leer (die Seite fragt die Klasse ab)
  assert.deepEqual(p(null), { vorname: "", nachname: "", geburtsdatum: "", klasse: "" });
  for (const [c, want] of [["12345678", "12345678"], ["12a", ""], [123, ""], ["1".repeat(21), ""], ["", ""], [" 1", ""]]) assert.equal(E.cleanEscape(record({ confirm: c })).confirm, want, String(c));
  // Lösungserläuterungen: höchstens 20, Text 4000 Zeichen (Zeilenumbrüche bleiben, mehr als eine Leerzeile wird eine), Bezeichnung einzeilig
  const notes = E.cleanEscape(record({ notes: Array.from({ length: 25 }, () => ({ label: "a\nb", text: "x".repeat(5000) + "\n\n\n\ny" })) })).notes;
  assert.equal(notes.length, 20); assert.equal(notes[0].label, "a b"); assert.equal(notes[0].text.length, 4000);
  assert.equal(E.cleanEscape(record({ notes: [{ label: "L", text: "a\r\n\r\n\r\n\r\nb" }] })).notes[0].text, "a\n\nb");
  assert.deepEqual(E.cleanEscape(record({ word: "W".repeat(80), completedAt: "gestern" })).word.length, 60);
  assert.equal(E.cleanEscape(record({ completedAt: "gestern" })).completedAt, "");
});

test("escape: cleanEscape mit fremden Daten – __proto__ auf jeder Ebene, 10 000 Einträge, tiefe Verschachtelung, HTML, U+202E und Nullbyte", () => {
  const evil = JSON.parse('{"__proto__":{"polluted":1},"code":"K7QM4X","room":{"id":"test-escape","__proto__":{"polluted":2}},' +
    '"person":{"__proto__":{"polluted":3},"vorname":"<img src=x onerror=alert(1)>","nachname":"Mu\\u202e\\u0000"},' +
    '"stations":[{"__proto__":{"polluted":4},"label":"S","attempts":1,"errors":[{"__proto__":{"polluted":5},"item":"<img src=x onerror=alert(2)>"}]}],' +
    '"notes":[{"__proto__":{"polluted":6},"label":"L","text":"T"}],"resumes":[{"__proto__":{"polluted":7},"place":"p"}]}');
  const out = E.cleanEscape(evil);
  assert.equal(({}).polluted, undefined);
  for (const o of [out, out.room, out.person, out.stations[0], out.stations[0].errors[0], out.notes[0], out.resumes[0]]) {
    assert.equal(o.polluted, undefined); assert.equal(Object.getPrototypeOf(o), Object.prototype);
  }
  assert.equal(out.person.vorname, "<img src=x onerror=alert(1)>");   // bleibt Text (Anzeige nur per textContent)
  assert.equal(out.person.nachname, "Mu");
  assert.equal(out.stations[0].errors[0].item, "<img src=x onerror=alert(2)>");
  const errors = Array.from({ length: 10000 }, () => ({ item: "i" })), notes = Array.from({ length: 10000 }, () => ({ label: "l", text: "t" }));
  const big = record({ stations: Array.from({ length: 10000 }, () => ({ attempts: 1, errors })), notes, resumes: Array.from({ length: 10000 }, () => ({ place: "p" })) });
  const t0 = performance.now(), r = E.cleanEscape(big), ms = performance.now() - t0;
  assert.equal(r.stations.length, 20); assert.equal(r.stations[0].errors.length, 30); assert.equal(r.notes.length, 20); assert.equal(r.resumes.length, 20);
  assert.ok(ms < 50, ms + " ms");
  // tief verschachtelte Daten: kein Absturz, kein Datensatz
  const deep = '{"a":'.repeat(5000) + "1" + "}".repeat(5000);
  let parsed = null; try { parsed = JSON.parse(deep); } catch (e) { parsed = null; }
  assert.equal(E.cleanEscape(parsed), null);
});

test("escape: Vorbelegung der Angaben – Kürzel aus den vollen Namen, Geburtstag ohne Jahr, Klasse; unvollständig bleibt unvollständig", () => {
  const pre = E.escPerson(E.cleanEscape(record()));
  assert.equal(pre.complete, true);
  assert.deepEqual([pre.vorname, pre.nachname, pre.gtag, pre.gmonat, pre.klasse], ["Max", "Mu", "4", "5", "10b"]);
  assert.deepEqual(pre.person, { vorname: "Max", nachname: "Mu", geburtsdatum: "--05-04", klasse: "10b" });
  for (const [v, n, kv, kn] of [["Anna-Lena", "Schmidt", "Ann", "Sc"], ["Özlem", "Çelik", "Özl", "Çe"], ["Jo", "de la Cruz", "Jo", "De"], ["MAX", "MÜLLER", "Max", "Mü"], ["  li ", "x", "Li", "X"]])
    assert.deepEqual(E.escKuerzel(v, n), { v: kv, n: kn }, v + " " + n);
  const part = (person) => E.escPerson(E.cleanEscape(record({ person: { ...record().person, ...person } })));
  assert.equal(part({ vorname: "O" }).complete, false); assert.equal(part({ vorname: "O" }).okV, false);   // ein Buchstabe reicht nicht
  assert.equal(part({ nachname: "" }).okN, false);
  assert.equal(part({ geburtsdatum: "31.04.2010" }).okBday, false); assert.equal(part({ geburtsdatum: "31.04.2010" }).gtag, "");
  assert.equal(part({ klasse: "" }).okK, false); assert.equal(part({ klasse: "" }).person, null);
  assert.deepEqual(part({ geburtsdatum: "29.02.2012" }).person.geburtsdatum, "--02-29");
});

test("escape: Nutzlast an die Lehrkraft – nur Ergebnisse (ohne Person, Bestätigungscode, Lösungserläuterungen, Code, url); Notfall ohne Fehler-Einzelheiten", () => {
  const rec = E.cleanEscape(record()), pay = E.escPayload(rec, "ok");
  assert.deepEqual(Object.keys(pay), ["room", "word", "completedAt", "stations", "resumes", "check"]);
  const text = JSON.stringify(pay);
  for (const x of ["Maximilian", "Mustermann", "04.05.2010", "31415926", "notes", "Genaue Daten", "K7QM4X", "escape.example", "person", "confirm"]) assert.ok(!text.includes(x), x);
  assert.deepEqual(pay.room, { id: "test-escape", name: "FastFashion-Test" });
  assert.deepEqual(E.escCleanPayload(pay), { ...pay });   // die Lehrkraft-Seite liest genau dieselbe Form
  assert.equal(E.escHasDetails(pay), true);
  const trimmed = E.escTrim(pay);
  assert.equal(trimmed.omitted, "too_large");
  assert.ok(trimmed.stations.every((st) => Array.isArray(st.errors) && !st.errors.length));
  assert.deepEqual(trimmed.stations.map((st) => st.attempts), pay.stations.map((st) => st.attempts));
  assert.equal(E.escHasDetails(trimmed), false); assert.equal(E.escHasDetails(undefined), false);
  assert.equal(pay.stations[1].errors.length, 2);   // escTrim verändert die ursprüngliche Nutzlast nicht
  assert.deepEqual(E.escCleanPayload(trimmed).omitted, "too_large");
});

const rawPdf = (objs) => {   // kleine PDF-Datei aus Objekten [dict, data] (Daten roh, /Length direkt)
  let s = "%PDF-1.7\n";
  objs.forEach(([dict, data], i) => { const b = Buffer.from(data, "utf8").toString("latin1"); s += `${i + 1} 0 obj\n<< ${dict} /Length ${Buffer.byteLength(data, "utf8")} >>\nstream\n${b}\nendstream\nendobj\n`; });
  return Buffer.from(s + "%%EOF\n", "latin1");
};
test("escape: readStartPdf – Überblick-PDF des Raums (unkomprimiert, neu gespeichert ohne Kennzeichen), Zwischenstand gewinnt, Fehlerfälle", async () => {
  const hull = escHull(record());
  const u8 = (b) => new Uint8Array(b.buffer, b.byteOffset, b.length);
  // (a) wie der Raum sie baut
  let r = await E.readStartPdf(u8(overviewPdf(hull)));
  assert.equal(r.kind, "escape"); assert.deepEqual(r.o, hull);
  assert.equal(await E.feibeitsblattPdfKind(u8(overviewPdf(hull))), "escape");
  // (b) FlateDecode, Länge als Verweis, ohne Kennzeichen, kompakt – wie nach dem Neuspeichern in einem PDF-Programm
  for (const opts of [{ flate: true }, { lenRef: true }, { marker: false }, { compact: true }, { flate: true, marker: false, compact: true, lenRef: true }]) {
    r = await E.readStartPdf(u8(overviewPdf(hull, opts)));
    assert.equal(r.kind, "escape", JSON.stringify(opts)); assert.deepEqual(r.o, hull);
    assert.equal(await E.feibeitsblattPdfKind(u8(overviewPdf(hull, opts))), "escape", JSON.stringify(opts));
  }
  // manipulierte Daten (FlateDecode): die Hülle wird gelesen, die Prüfsumme stimmt nicht – das sieht nur die Lehrkraft
  const forged = { ...hull, d: hull.d.replace('"attempts":3', '"attempts":1') };
  assert.notEqual(forged.d, hull.d);
  r = await E.readStartPdf(u8(overviewPdf(forged, { flate: true })));
  assert.equal(r.kind, "escape"); assert.deepEqual(r.o, forged);
  assert.equal(E.escCheck(r.o), "mismatch"); assert.equal(E.escCheck(hull), "ok");
  assert.equal(E.cleanEscape(JSON.parse(r.o.d)).stations[1].attempts, 1);
  // (c) ein Zwischenstand gewinnt – auch, wenn er hinter einer Hülle liegt (mit und ohne Kennzeichen)
  const draft = { v: 1, kind: "feibeitsblatt-draft", code: "K7QM4X", answers: ["a"], escape: hull };
  for (const [m1, m2] of [["/FbEscape 1", "/FbDraft 1"], ["", ""]]) {
    r = await E.readStartPdf(u8(rawPdf([[`/Type /EmbeddedFile ${m1}`, JSON.stringify(hull)], [`/Type /EmbeddedFile ${m2}`, JSON.stringify(draft)]])));
    assert.equal(r.kind, "draft"); assert.deepEqual(r.o, draft);
  }
  // (d) Kennzeichen, aber kaputtes JSON bzw. (f) zu große Hülle → escape-bad; (e) fremde PDF → nodraft, keine PDF → nopdf
  const fails = async (buf, msg) => { await assert.rejects(E.readStartPdf(u8(buf)), (e) => e.message === msg); };
  await fails(overviewPdf('{"kind":"feibeitsblatt-escape","v":1,"d":"{'), "escape-bad");
  await fails(overviewPdf({ ...hull, d: "x".repeat(E.ESC_MAX_BYTES) }), "escape-bad");
  await fails(overviewPdf({ ...hull, s: "nicht-hex" }), "escape-bad");
  await fails(rawPdf([["/Type /EmbeddedFile", JSON.stringify({ kind: "anderes" })]]), "nodraft");
  await fails(Buffer.from("Hallo"), "nopdf");
  assert.equal(await E.feibeitsblattPdfKind(u8(rawPdf([["/Type /EmbeddedFile", JSON.stringify({ kind: "anderes" })]]))), null);
});
