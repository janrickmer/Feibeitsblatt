// escape-fixture.mjs – Gegenseite der Escape-Room-Schnittstelle (v1) für Tests: Prüfsumme, Hülle und Link-Kodierung genau wie im
// Quelltext eines Escape-Rooms. Unabhängige Kopie – die Tests vergleichen sie mit dem Block ESCAPE in index.html.
import { deflateSync } from "node:zlib";
export function fbEscapeHash(str){ // cyrb53-Variante wie saveHash der Vorlage jg6, 64 Bit als 16 Hex-Zeichen
  let h1=0xdeadbeef^str.length, h2=0x41c6ce57^str.length;
  for(let i=0;i<str.length;i++){ const ch=str.charCodeAt(i); h1=Math.imul(h1^ch,2654435761); h2=Math.imul(h2^ch,1597334677); }
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
  h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return (h2>>>0).toString(16).padStart(8,'0')+(h1>>>0).toString(16).padStart(8,'0');
}
// Daten → Hülle {kind, v, d, s} (d = JSON-Text der Daten, s = Prüfsumme über "FbEscape|v1|" + d)
export function escHull(data) {
  const d = JSON.stringify(data);
  return { kind: "feibeitsblatt-escape", v: 1, d, s: fbEscapeHash("FbEscape|v1|" + d) };
}
// Link-Kodierung des Raums: UTF-8 → Base64url ohne „=“
export function b64url(str){
  const bytes = new TextEncoder().encode(str); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// Überblick-PDF des Raums mit eingebetteter Hülle – Objektaufbau genau wie PdfDoc.build im Escape-Room (1 Katalog, 2 Seiten, 3/4 Schriften,
// je Seite Inhalt + Seite, Link-Annotation, Filespec, EmbeddedFile mit /FbEscape 1, Info; binäre Zeichenkette, Offsets = Länge).
// Varianten wie nach dem Neuspeichern in einem PDF-Programm: flate (FlateDecode), marker:false (ohne Kennzeichen), compact
// („/Type/EmbeddedFile“ ohne Leerzeichen), lenRef (Länge als Verweis „/Length n 0 R“). hull: Objekt oder roher Text (z. B. kaputtes JSON).
export function overviewPdf(hull, { flate = false, marker = true, compact = false, lenRef = false } = {}) {
  const json = Buffer.from(typeof hull === "string" ? hull : JSON.stringify(hull), "utf8");
  const data = flate ? deflateSync(json) : json, bin = data.toString("latin1");
  const objects = [null, null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"];
  const add = (s) => { objects.push(s); return objects.length; };
  const content = "0.071 0.078 0.09 rg\nBT\n/F2 20 Tf\n56 774 Td\n(\xDCberblick deiner Antworten) Tj\nET\n0.29 0.31 0.341 rg\nBT\n/F1 8.5 Tf\n56 32 Td\n(Copyright Jan-Rickmer Feindt) Tj\nET";
  const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const pageId = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R /Annots [7 0 R] >>`);
  add("<< /Type /Annot /Subtype /Link /Rect [56 600 300 615] /Border [0 0 0] /A << /S /URI /URI (https://feibeitsblatt.janrickmer.de/) >> >>");
  const specId = objects.length + 1, fileId = specId + 1, lenId = specId + 3;   // Länge als Verweis: eigenes Objekt hinter der Info
  add(`<< /Type /Filespec /F (feibeitsblatt-escape.json) /UF (feibeitsblatt-escape.json) /Desc (Escape-Room FastFashion) /AFRelationship /Data /EF << /F ${fileId} 0 R /UF ${fileId} 0 R >> >>`);
  const len = lenRef ? `${lenId} 0 R` : String(data.length), filter = flate ? (compact ? "/Filter/FlateDecode" : " /Filter /FlateDecode") : "";
  add((compact ? `<</Type/EmbeddedFile/Subtype/application#2Fjson${marker ? "/FbEscape 1" : ""}/Params<</Size ${json.length}>>${filter}/Length ${len}>>`
    : `<< /Type /EmbeddedFile /Subtype /application#2Fjson${marker ? " /FbEscape 1" : ""} /Params << /Size ${json.length} >>${filter} /Length ${len} >>`) + `\nstream\n${bin}\nendstream`);
  let title = "FEFF"; for (const ch of "Überblick Escape-Room FastFashion") title += ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0");
  const infoId = add(`<< /Title <${title}> /Producer (Escape-Room FastFashion) /CreationDate (D:20261027120000) >>`);
  if (lenRef) add(String(data.length));
  objects[1] = `<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`;
  objects[0] = `<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(feibeitsblatt-escape.json) ${specId} 0 R] >> >> /AF [${specId} 0 R] >>`;
  let pdf = "%PDF-1.7\n%\xE2\xE3\xCF\xD3\n"; const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
