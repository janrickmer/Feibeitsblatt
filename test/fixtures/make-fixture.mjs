// make-fixture.mjs – erzeugt test/fixtures/02_Feibeitsblatt_Ein-Auto-eine-Welt.pdf: eine gesicherte Feibeitsblatt-PDF, wie sie
// „Als PDF-Datei herunterladen“ schreibt, aber von einem fremden Programm in anderer Form (kompakte Kennzeichen „/FbBlob(…)“,
// Länge des Datensatzes als Verweis). Inhalt frei erfunden: Aufgabe 1 Weltkarten-Zuordnung mit zwölf Karten (je ein PNG als
// Anhang, mode "card"), Aufgabe 2 Tabelle, Aufgaben 3 und 4 Textfelder. Aufruf: node test/fixtures/make-fixture.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { makePng } from "../png.mjs";

const EXPORT_ID = "a1b2c3d4e5f60718";
const CARDS = [
  ["motorblock", "Motorblock", "Gegossen und montiert im Stammwerk", [["276", "Deutschland"]]],
  ["kautschuk", "Kautschuk für die Reifen", "Naturkautschuk aus Plantagen", [["764", "Thailand"], ["360", "Indonesien"], ["458", "Malaysia"]]],
  ["kabelbaum", "Kabelbaum", "Viel Handarbeit", [["504", "Marokko"], ["642", "Rumänien"], ["788", "Tunesien"]]],
  ["lithium", "Lithium für die Batterie", "Aus Salzseen oder Gestein", [["152", "Chile"], ["036", "Australien"], ["032", "Argentinien"]]],
  ["kobalt", "Kobalt für die Batterie", "", [["180", "Demokratische Republik Kongo"]]],
  ["eisenerz", "Eisenerz für den Stahl", "Für Karosserie und Fahrwerk", [["076", "Brasilien"], ["036", "Australien"]]],
  ["bauxit", "Bauxit für Aluminium", "Leichte Felgen und Motorteile", [["324", "Guinea"], ["036", "Australien"]]],
  ["mikrochips", "Mikrochips", "Steuergeräte und Bildschirm", [["158", "Taiwan"], ["410", "Südkorea"]]],
  ["leder", "Leder für die Sitze", "", [["032", "Argentinien"], ["076", "Brasilien"]]],
  ["platin", "Platin für den Katalysator", "", [["710", "Südafrika"], ["643", "Russland"]]],
  ["kupfer", "Kupfer für die Kabel", "", [["152", "Chile"], ["604", "Peru"]]],
  ["seltene-erden", "Seltene Erden für den Elektromotor", "Magnete", [["156", "China"]]],
];
const COLORS = [[200, 60, 40], [40, 120, 200], [60, 160, 80], [220, 170, 30], [120, 60, 160], [30, 150, 150], [180, 90, 30], [90, 90, 90], [150, 30, 90], [70, 130, 30], [200, 110, 150], [20, 60, 120]];
const sha = (b) => createHash("sha256").update(b).digest("hex");

const pngs = CARDS.map((_, k) => makePng(48 + k * 4, 40 + (k % 3) * 8, COLORS[k]));
const images = pngs.map((b, k) => { const [w, h] = [48 + k * 4, 40 + (k % 3) * 8]; return { ref: `${EXPORT_ID}-${k + 1}`, mime: "image/png", w, h, mode: "card", alt: "", bytes: b.length, sha256: sha(b) }; });
const record = {
  kind: "feibeitsblatt-sheet", v: 1, app: "Feibeitsblatt", exportId: EXPORT_ID, exportedAt: Date.UTC(2026, 8, 14, 9, 30), code: "K7QM4X",
  title: "Ein Auto – eine Welt", createdAt: Date.UTC(2026, 8, 1, 7, 45),
  tasks: [
    { text: "Ein Auto besteht aus Teilen und Rohstoffen aus der ganzen Welt. Ordne jede Karte einem Land zu, aus dem das Bauteil oder der Rohstoff häufig kommt.",
      solution: "", material: [[{ t: "Tipp: " , f: "b" }, { t: "Mit „+“ und „−“ vergrößerst du die Karte." }]], images, files: [],
      answer: { type: "map", map: "world", items: CARDS.map(([id, label, hint, cs], k) => Object.assign({ id, label }, hint ? { hint } : null, { image: images[k].ref, countries: cs.map(([cid, name]) => ({ id: cid, name })) })) } },
    { text: "Trage drei Bauteile, ihr Herkunftsland und den Kontinent in die Tabelle ein.", solution: "- Bauteil mit passendem Herkunftsland\n- Richtiger Kontinent",
      material: [], images: [], files: [], answer: { type: "table", columns: ["Bauteil", "Herkunftsland", "Kontinent"], rows: 3 } },
    { text: "Erkläre, warum ein Auto aus Teilen vieler Länder besteht.", solution: "- Rohstoffe kommen nur in bestimmten Ländern vor\n- Arbeitsteilung und Spezialisierung\n- Unterschiedliche Kosten (Löhne, Transport)",
      material: [], images: [], files: [] },
    { text: "Nenne eine Folge der weltweiten Arbeitsteilung für die Umwelt.", solution: "- Lange Transportwege\n- Mehr Ausstoß von CO2", material: [], images: [], files: [] },
  ],
};

// PDF zusammensetzen (Latin-1-Text + Binärteile)
const parts = [], offsets = [];
let pos = 0;
const push = (x) => { const b = typeof x === "string" ? Buffer.from(x, "latin1") : x; parts.push(b); pos += b.length; };
const obj = (n, ...body) => { offsets[n] = pos; push(`${n} 0 obj\n`); body.forEach(push); push("\nendobj\n"); };
const json = Buffer.from(JSON.stringify(record), "utf8"), packed = deflateSync(json);
const blobObj = (k) => 10 + 2 * k, specObj = (k) => 11 + 2 * k, count = 10 + 2 * CARDS.length;
const names = [["0-feibeitsblatt.json", 8], ...CARDS.map((c, k) => [`01-karte${String(k + 1).padStart(2, "0")}`, specObj(k)])];
const page = "BT /F1 18 Tf 56 780 Td (Feibeitsblatt: Ein Auto - eine Welt) Tj ET\nBT /F1 11 Tf 56 750 Td (Gesichertes Feibeitsblatt mit Weltkarten-Zuordnung, Tabelle und zwei Textaufgaben.) Tj ET";
push("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n");
obj(1, `<</Type/Catalog/Pages 2 0 R/Names<</EmbeddedFiles<</Names[${names.map(([k, n]) => `(${k}) ${n} 0 R`).join(" ")}]>>>>>>`);
obj(2, "<</Type/Pages/Kids[3 0 R]/Count 1>>");
obj(3, "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595.28 841.89]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>");
obj(4, "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>");
obj(5, `<</Length ${page.length}>>\nstream\n${page}\nendstream`);
obj(6, `<</Type/EmbeddedFile/Subtype/application#2Fjson/FbSheet 1/Params<</Size ${json.length}>>/Filter/FlateDecode/Length 7 0 R>>\nstream\n`, packed, "\nendstream");
obj(7, String(packed.length));
obj(8, "<</Type/Filespec/F(feibeitsblatt.json)/UF(feibeitsblatt.json)/EF<</F 6 0 R>>>>");
obj(9, "<</Producer(Fremdes PDF-Programm)>>");
CARDS.forEach((c, k) => {
  obj(blobObj(k), `<</Type/EmbeddedFile/Subtype/image#2Fpng/FbBlob(${images[k].ref})/Length ${pngs[k].length}>>\nstream\n`, pngs[k], "\nendstream");
  obj(specObj(k), `<</Type/Filespec/F(karte${k + 1}.png)/EF<</F ${blobObj(k)} 0 R>>>>`);
});
const xref = pos;
let x = `xref\n0 ${count}\n0000000000 65535 f \n`;
for (let i = 1; i < count; i++) x += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
push(x + `trailer\n<</Size ${count}/Root 1 0 R/Info 9 0 R>>\nstartxref\n${xref}\n%%EOF\n`);
const out = new URL("./02_Feibeitsblatt_Ein-Auto-eine-Welt.pdf", import.meta.url);
writeFileSync(out, Buffer.concat(parts));
console.log("geschrieben:", out.pathname, pos, "Bytes");
