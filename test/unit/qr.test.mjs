// qr.test.mjs – QR-Code für den Link zur Checkliste: der reine Block aus index.html (QR:BEGIN … QR:END). Geprüft gegen
// Referenzwerte aus ISO/IEC 18004, gegen eine unabhängige Nachrechnung hier im Test (eigene GF(256)-Tabellen, Funktionsmuster,
// Auslesen, Entschränken, Syndrome, Strafpunkte) und mit dem Decoder jsQR (devDependency, nur für Tests).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import jsQR from "jsqr";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const i = html.indexOf("/* QR:BEGIN"), j = html.indexOf("/* QR:END */");
const { QR_MAX_VERSION, QR_TOTAL, QR_EC_M, qrCapacity, qrRsEcc, qrFormatBits, qrVersionBits, qrBase, qrCodewords, qrPenalty, qrMatrix } =
  new Function(html.slice(i, j) + "\nreturn { QR_MAX_VERSION, QR_TOTAL, QR_EC_M, qrCapacity, qrRsEcc, qrFormatBits, qrVersionBits, qrBase, qrCodewords, qrPenalty, qrMatrix };")();

/* ---------- Werte aus der Norm (unabhängig von der Schreibweise im Block) ---------- */
// Tabelle 9, Stufe M: je Version die Blockgruppen [Zahl der Blöcke, Codewörter je Block c, Datencodewörter je Block k]
const BLOCKS_M = [null,
  [[1, 26, 16]], [[1, 44, 28]], [[1, 70, 44]], [[2, 50, 32]], [[2, 67, 43]],
  [[4, 43, 27]], [[4, 49, 31]], [[2, 60, 38], [2, 61, 39]], [[3, 58, 36], [2, 59, 37]], [[4, 69, 43], [1, 70, 44]]];
// Tabelle 7: Byte-Modus, Stufe M – höchstens so viele Bytes je Version
const BYTES_M = [null, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213];
// Tabelle 1: Restbits je Version
const REMAINDER = [null, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0];
// Anhang E: Mittelpunkte der Ausrichtungsmuster
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
// gültige Format-Infos der Stufe M (Fehlerkorrektur-Bits 00) für die Masken 000 … 111, schon mit 101010000010010 maskiert
const FORMAT_M = ["101010000010010", "101000100100101", "101111001111100", "101101101001011",
  "100010111111001", "100000011001110", "100111110010111", "100101010100000"];
// Versions-Infos (18 Bit) der Versionen 7–10
const VERSION_INFO = { 7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3 };

/* ---------- unabhängige Hilfen ---------- */
// GF(256) über Logarithmen-Tabellen (der Block multipliziert bitweise)
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let k = 0, x = 1; k < 255; k++) { EXP[k] = x; LOG[x] = k; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let k = 255; k < 512; k++) EXP[k] = EXP[k - 255];
const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
// ein gültiges Reed-Solomon-Codewort hat die Nullstellen α^0 … α^(n−1) des Generators: c(α^r) = 0
function syndromesZero(codeword, n) {
  for (let r = 0; r < n; r++) {
    let s = 0;
    for (const x of codeword) s = gmul(s, EXP[r]) ^ x;
    if (s) return false;
  }
  return true;
}
// Rest einer Division über GF(2) (für die BCH-Codes der Format- und Versions-Info)
function polyMod(value, gen) {
  const gl = gen.toString(2).length;
  for (let b = 31 - Math.clz32(value); b >= gl - 1; b--) if ((value >>> b) & 1) value ^= gen << (b - gl + 1);
  return value;
}
const utf8 = (s) => new TextEncoder().encode(s);
// deterministischer Text mit genau n UTF-8-Bytes, mit Umlauten, typografischen Zeichen und einem Emoji
function textOfBytes(n, seed) {
  const parts = ["Grüße", " ", "Äpfel", " – ", "Öl", "ß", "„Zitat“", "€", "x", "Übung", "😀", "…"];
  let s = "", b = 0, r = seed;
  for (;;) {
    r = (r * 1103515245 + 12345) % 2147483648;
    const p = parts[(r >>> 8) % parts.length], len = utf8(p).length;
    if (b + len > n) break;
    s += p; b += len;
  }
  return s + "x".repeat(n - b);
}
const at = (q, x, y) => q.dark[y * q.size + x];

/* Funktionsmuster nach der Norm: Suchmuster mit Separator und Format-Bereich (je 9 × 9 bzw. 8 × 9), Taktmuster, Ausrichtungsmuster
   außer an den Suchmustern, Versions-Info ab Version 7 – 1 = kein Datenmodul */
function functionMap(v) {
  const size = 17 + 4 * v, f = new Uint8Array(size * size), mark = (x, y) => { f[y * size + x] = 1; };
  for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) mark(x, y);
  for (let y = 0; y <= 8; y++) for (let x = size - 8; x < size; x++) mark(x, y);
  for (let y = size - 8; y < size; y++) for (let x = 0; x <= 8; x++) mark(x, y);
  for (let k = 0; k < size; k++) { mark(6, k); mark(k, 6); }
  for (const cy of ALIGN[v]) for (const cx of ALIGN[v]) {
    if ((cx < 9 && cy < 9) || (cx > size - 9 && cy < 9) || (cx < 9 && cy > size - 9)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(cx + dx, cy + dy);
  }
  if (v >= 7) for (let a = 0; a < 6; a++) for (let b = size - 11; b < size - 8; b++) { mark(a, b); mark(b, a); }
  return f;
}
// Format-Info nach der Norm, Bit 14 zuerst: Kopie 1 in Zeile 8 (Spalten 0–5, 7, 8), dann Spalte 8 (Zeilen 7, 5 … 0);
// Kopie 2 in Spalte 8 von unten (Zeilen size−1 … size−7), dann Zeile 8 (Spalten size−8 … size−1)
function readFormat(q) {
  const c1 = [[0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8], [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0]], c2 = [];
  for (let y = q.size - 1; y >= q.size - 7; y--) c2.push([8, y]);
  for (let x = q.size - 8; x < q.size; x++) c2.push([x, 8]);
  const val = (cells) => cells.reduce((v, [x, y]) => (v << 1) | at(q, x, y), 0);
  return [val(c1), val(c2)];
}
// Versions-Info, Bit 17 zuerst: unten links Bit i in Spalte ⌊i/3⌋, Zeile size−11 + (i mod 3); oben rechts gespiegelt
function readVersion(q) {
  let a = 0, b = 0;
  for (let k = 17; k >= 0; k--) {
    const x = Math.floor(k / 3), y = q.size - 11 + (k % 3);
    a = (a << 1) | at(q, x, y); b = (b << 1) | at(q, y, x);
  }
  return [a, b];
}
const MASK = [(i, j) => (i + j) % 2 === 0, (i) => i % 2 === 0, (i, j) => j % 3 === 0, (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0, (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0, (i, j) => (((i * j) % 3) + ((i + j) % 2)) % 2 === 0];
// Datenmodule in Leserichtung (Spaltenpaare von rechts, abwechselnd aufwärts/abwärts, Spalte 6 ausgelassen), entmaskiert
function readBits(q, v, mask) {
  const fmap = functionMap(v), bits = [];
  let upward = true;
  for (let col = q.size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let r = 0; r < q.size; r++) {
      const y = upward ? q.size - 1 - r : r;
      for (const x of [col, col - 1]) if (!fmap[y * q.size + x]) bits.push(at(q, x, y) ^ (MASK[mask](y, x) ? 1 : 0));
    }
    upward = !upward;
  }
  return bits;
}
// erwartete Datencodewörter: 0100, Zeichenzahl, Bytes, Endmarke, Nullen bis zur Bytegrenze, 11101100/00010001
function expectedData(bytes, v) {
  const nData = BLOCKS_M[v].reduce((s, [n, , k]) => s + n * k, 0);
  let s = "0100" + bytes.length.toString(2).padStart(v < 10 ? 8 : 16, "0");
  for (const b of bytes) s += b.toString(2).padStart(8, "0");
  s += "0".repeat(Math.min(4, nData * 8 - s.length));
  s += "0".repeat((8 - (s.length % 8)) % 8);
  const out = [];
  for (let k = 0; k < s.length; k += 8) out.push(parseInt(s.slice(k, k + 8), 2));
  for (let p = 0; out.length < nData; p++) out.push(p % 2 ? 0x11 : 0xec);
  return out;
}
// Codewörter auf die Blöcke zurückverteilen (Tabelle 9): erst die Datencodewörter reihum, dann die Fehlerkorrektur
function deinterleave(cw, v) {
  const blocks = [];
  for (const [n, c, k] of BLOCKS_M[v]) for (let b = 0; b < n; b++) blocks.push({ c, k, data: [], ec: [] });
  let p = 0;
  for (let r = 0; r < Math.max(...blocks.map((b) => b.k)); r++) for (const b of blocks) if (r < b.k) b.data.push(cw[p++]);
  for (let r = 0; r < blocks[0].c - blocks[0].k; r++) for (const b of blocks) b.ec.push(cw[p++]);
  assert.equal(p, cw.length);
  return blocks;
}
// Strafpunkte, unabhängig über Zeichenketten gezählt (jedes Vorkommen von 1011101 mit 4 hellen Modulen davor oder danach)
function penaltyRef(dark, size) {
  const rows = [];
  for (let y = 0; y < size; y++) rows.push(Array.from(dark.subarray(y * size, (y + 1) * size)).join(""));
  const cols = rows[0].split("").map((_, x) => rows.map((r) => r[x]).join(""));
  let p = 0, d = 0;
  for (const line of [...rows, ...cols]) {
    for (const m of line.match(/0{5,}|1{5,}/g) || []) p += 3 + m.length - 5;
    const pad = "0000" + line + "0000";
    for (let k = 0; k + 7 <= line.length; k++)
      if (line.slice(k, k + 7) === "1011101" && (pad.slice(k, k + 4) === "0000" || pad.slice(k + 11, k + 15) === "0000")) p += 40;
  }
  for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) {
    const c = rows[y][x];
    if (rows[y][x + 1] === c && rows[y + 1][x] === c && rows[y + 1][x + 1] === c) p += 3;
  }
  for (const r of rows) for (const c of r) d += +c;
  return p + 10 * Math.floor(Math.abs(d * 100 - size * size * 50) / (size * size * 5));
}
// Bild wie gedruckt: Ruhezone 4 Module, je Modul 4 × 4 Pixel, schwarz auf weiß → jsQR
function scan(q, scale = 4, quiet = 4) {
  const w = (q.size + 2 * quiet) * scale, img = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (at(q, x, y))
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const o = (((y + quiet) * scale + dy) * w + (x + quiet) * scale + dx) * 4;
      img[o] = img[o + 1] = img[o + 2] = 0;
    }
  return jsQR(img, w, w, { inversionAttempts: "dontInvert" });
}
const CHECK_URL = "https://feibeitsblatt.janrickmer.de/#checkliste=K7QM4X";

/* ---------- Tests ---------- */
test("qr: Block in index.html gefunden (nach BDAY, vor der Weltkarte)", () => {
  assert.ok(i > html.indexOf("/* BDAY:END */") && j > i && j < html.indexOf("/* WORLDMAP:BEGIN"));
  assert.equal(QR_MAX_VERSION, 10);
});

test("qr: Codewörter, Blöcke und Kapazität je Version wie in der Norm (Stufe M)", () => {
  for (let v = 1; v <= 10; v++) {
    const groups = BLOCKS_M[v], ec = groups[0][1] - groups[0][2];
    for (const [, c, k] of groups) assert.equal(c - k, ec, `v${v}: gleich viele Fehlerkorrektur-Codewörter je Block`);
    assert.equal(QR_TOTAL[v], groups.reduce((s, [n, c]) => s + n * c, 0), `v${v} Codewörter`);
    assert.deepEqual(QR_EC_M[v], [ec, groups.reduce((s, [n]) => s + n, 0)], `v${v} Blöcke`);
    assert.equal(qrCapacity(v), BYTES_M[v], `v${v} Bytes`);
  }
});

test("qr: Format-Info der Stufe M für alle 8 Masken (Referenzwerte, BCH nachgerechnet)", () => {
  for (let m = 0; m < 8; m++) {
    const bits = qrFormatBits(m);
    assert.equal(bits.toString(2).padStart(15, "0"), FORMAT_M[m], `Maske ${m}`);
    const raw = bits ^ 0x5412;
    assert.equal(raw >>> 10, m, "Stufe M = 00, dann die Maske");
    assert.equal(polyMod(raw, 0x537), 0, "BCH(15,5): durch x^10 + x^8 + x^5 + x^4 + x^2 + x + 1 teilbar");
  }
});

test("qr: Versions-Info 7–10 (Referenzwerte, BCH nachgerechnet)", () => {
  for (let v = 7; v <= 10; v++) {
    assert.equal(qrVersionBits(v), VERSION_INFO[v], `Version ${v}`);
    assert.equal(qrVersionBits(v) >>> 12, v);
    assert.equal(polyMod(qrVersionBits(v), 0x1f25), 0, "BCH(18,6): durch x^12 + x^11 + x^10 + x^9 + x^8 + x^5 + x^2 + 1 teilbar");
  }
});

test("qr: Reed-Solomon – Beispiel „01234567“ 1-M aus ISO/IEC 18004 Anhang I und „HELLO WORLD“ 1-M", () => {
  const iso = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
  const isoEc = [0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55];
  assert.deepEqual(Array.from(qrRsEcc(iso, 10)), isoEc);
  const hello = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(Array.from(qrRsEcc(hello, 10)), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  assert.ok(syndromesZero([...iso, ...isoEc], 10));
  // jede in Version 1–10 (Stufe M) vorkommende Länge: gültige Codewörter für den Generator der Norm
  for (const n of [10, 16, 18, 22, 24, 26]) for (const len of [16, 27, 44]) {
    const data = Array.from({ length: len }, (_, k) => (k * 37 + n * 11 + len) & 255);
    assert.ok(syndromesZero([...data, ...qrRsEcc(data, n)], n), `n=${n}, ${len} Datencodewörter`);
  }
});

test("qr: Funktionsmuster je Version 1–10 (Suchmuster, Separatoren, Takt, Ausrichtung, dunkles Modul, Zahl der Datenmodule)", () => {
  for (let v = 1; v <= 10; v++) {
    const q = qrMatrix("x".repeat(BYTES_M[v]), v % 8), { size } = q, fmap = functionMap(v);
    assert.equal(size, 17 + 4 * v);
    assert.deepEqual(Array.from(qrBase(v).fn), Array.from(fmap), `v${v}: reservierte Module`);
    const free = fmap.reduce((s, f) => s + (f ? 0 : 1), 0);
    assert.equal(free, QR_TOTAL[v] * 8 + REMAINDER[v], `v${v}: Datenmodule = Codewörter · 8 + Restbits`);
    for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]])
      for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++)
        assert.equal(at(q, ox + dx, oy + dy), Math.max(Math.abs(dx - 3), Math.abs(dy - 3)) === 2 ? 0 : 1, `v${v} Suchmuster`);
    for (let k = 0; k < 8; k++) {
      for (const [x, y] of [[k, 7], [7, k], [size - 1 - k, 7], [size - 8, k], [k, size - 8], [7, size - 1 - k]]) assert.equal(at(q, x, y), 0, `v${v} Separator`);
    }
    for (let k = 8; k < size - 8; k++) { assert.equal(at(q, k, 6), k % 2 ? 0 : 1); assert.equal(at(q, 6, k), k % 2 ? 0 : 1); }
    for (const cy of ALIGN[v]) for (const cx of ALIGN[v]) {
      if ((cx < 9 && cy < 9) || (cx > size - 9 && cy < 9) || (cx < 9 && cy > size - 9)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        assert.equal(at(q, cx + dx, cy + dy), Math.max(Math.abs(dx), Math.abs(dy)) === 1 ? 0 : 1, `v${v} Ausrichtung ${cx}/${cy}`);
    }
    assert.equal(at(q, 8, 4 * v + 9), 1, "dunkles Modul");
  }
});

test("qr: kleinste passende Version, Bytes statt Zeichen, Grenzen", () => {
  for (let v = 1; v <= 10; v++) {
    assert.equal(qrMatrix("x".repeat(BYTES_M[v])).version, v);
    if (v < 10) assert.equal(qrMatrix("x".repeat(BYTES_M[v] + 1)).version, v + 1);
  }
  assert.equal(qrMatrix("ä".repeat(7)).version, 1);    // 14 Bytes
  assert.equal(qrMatrix("ä".repeat(8)).version, 2);    // 16 Bytes
  assert.equal(qrMatrix("").version, 1);
  assert.equal(qrMatrix(null).version, 1);
  assert.ok(qrMatrix(CHECK_URL).version <= 4);
  assert.throws(() => qrMatrix("x".repeat(214)), RangeError);
  assert.throws(() => qrMatrix("ü".repeat(107)), RangeError);   // 214 Bytes
  for (const bad of [8, -1, 1.5, "2", NaN]) assert.throws(() => qrMatrix("x", bad), RangeError, String(bad));
  for (let m = 0; m < 8; m++) assert.equal(qrMatrix("x", m).mask, m);
});

test("qr: jede Version 1–10 mit allen 8 Masken – Format-/Versions-Info, Codewörter, Blöcke, Reed-Solomon, Restbits, jsQR", () => {
  for (let v = 1; v <= 10; v++) {
    const text = textOfBytes(BYTES_M[v] - (v % 3), v), bytes = utf8(text);
    assert.ok(/[äöüßÄÖÜ]/.test(text), "mit Umlauten");
    for (let m = 0; m < 8; m++) {
      const q = qrMatrix(text, m), tag = `v${v} Maske ${m}`;
      assert.equal(q.version, v, tag);
      assert.equal(q.mask, m, tag);
      assert.deepEqual(readFormat(q), [qrFormatBits(m), qrFormatBits(m)], `${tag}: beide Kopien der Format-Info`);
      if (v >= 7) assert.deepEqual(readVersion(q), [VERSION_INFO[v], VERSION_INFO[v]], `${tag}: beide Kopien der Versions-Info`);
      const bits = readBits(q, v, m), n = QR_TOTAL[v] * 8, cw = [];
      for (let k = 0; k < n; k += 8) cw.push(parseInt(bits.slice(k, k + 8).join(""), 2));
      assert.deepEqual(bits.slice(n), new Array(REMAINDER[v]).fill(0), `${tag}: Restbits 0`);
      assert.deepEqual(cw, Array.from(qrCodewords(bytes, v)), `${tag}: Codewörter an ihrer Stelle`);
      const blocks = deinterleave(cw, v);
      assert.deepEqual(blocks.flatMap((b) => b.data), expectedData(bytes, v), `${tag}: Datencodewörter`);
      for (const b of blocks) assert.ok(syndromesZero([...b.data, ...b.ec], b.c - b.k), `${tag}: Reed-Solomon je Block`);
      const r = scan(q);
      assert.ok(r, `${tag}: jsQR findet den Code`);
      assert.equal(r.version, v, tag);
      assert.equal(r.data, text, tag);
      assert.deepEqual(Array.from(r.binaryData), Array.from(bytes), tag);
    }
  }
});

test("qr: jsQR liest typische Texte (beste Maske)", () => {
  const long = "Aufgabe 1: Du nennst Abholzung, Verkehr und Industrie. Du begründest, warum Öl, Gas und Kohle dem Klima schaden – „kurz“ und ü/ä/ß …";
  assert.ok(long.length >= 130 && long.length <= 160);
  for (const text of ["", "A", CHECK_URL, CHECK_URL.replace("K7QM4X", "ABC234"), long, "Prüfung 😀 ✓ € „…“"]) {
    const q = qrMatrix(text), r = scan(q);
    assert.ok(r, JSON.stringify(text));
    assert.equal(r.data, text);
    assert.equal(r.version, q.version);
    assert.deepEqual(Array.from(r.binaryData), Array.from(utf8(text)));
  }
});

test("qr: beste Maske = wenigste Strafpunkte, bei Gleichstand die kleinere Nummer", () => {
  // die letzten beiden: zwei Masken gleichauf (2/4 bzw. 4/5)
  const tied = ["https://feibeitsblatt.janrickmer.de/#checkliste=51", "Feibeitsblatt 7"];
  let ties = 0;
  for (const text of ["", CHECK_URL, textOfBytes(100, 3), "x".repeat(BYTES_M[7]), textOfBytes(200, 9), ...tied]) {
    const q = qrMatrix(text), pens = [];
    for (let m = 0; m < 8; m++) pens.push(qrPenalty(qrMatrix(text, m).dark, q.size));
    const best = pens.indexOf(Math.min(...pens));
    if (pens.lastIndexOf(pens[best]) !== best) ties++;
    assert.equal(q.mask, best, `${JSON.stringify(text.slice(0, 20))}: ${pens}`);
    assert.deepEqual(Array.from(q.dark), Array.from(qrMatrix(text, best).dark));
  }
  assert.ok(ties >= tied.length, "Gleichstand kommt vor");
});

test("qr: Strafpunkte N1–N4 an einfachen Mustern und gegen eine unabhängige Zählung", () => {
  const light = new Uint8Array(21 * 21);
  // N1: 42 Folgen zu 21 → je 19; N2: 20 × 20 Quadrate → je 3; N3: keins; N4: 0 % dunkel → 10 × 10
  assert.equal(qrPenalty(light, 21), 42 * 19 + 400 * 3 + 0 + 100);
  const board = light.map((_, k) => ((k % 21) + Math.floor(k / 21)) % 2 === 0 ? 1 : 0);
  assert.equal(qrPenalty(board, 21), 0);   // 221 von 441 dunkel → unter 5 % Abweichung
  // 11 × 11 hell, Zeile 5 = 00001011101: N1 10·9 + 5·6 + 6·9 = 174, N2 86 · 3 = 258, N3 40, N4 5/121 dunkel → 9 · 10
  const one = new Uint8Array(121);
  [...("00001011101")].forEach((c, x) => { one[5 * 11 + x] = +c; });
  assert.equal(qrPenalty(one, 11), 174 + 258 + 40 + 90);
  assert.equal(penaltyRef(one, 11), 174 + 258 + 40 + 90);
  // echte Symbole aller Masken und Zufallsmuster
  for (const text of [CHECK_URL, textOfBytes(60, 5), textOfBytes(180, 6)])
    for (let m = 0; m < 8; m++) { const q = qrMatrix(text, m); assert.equal(qrPenalty(q.dark, q.size), penaltyRef(q.dark, q.size), `Maske ${m}`); }
  let r = 42;
  for (const size of [21, 25, 45]) for (let n = 0; n < 10; n++) {
    const d = new Uint8Array(size * size).map(() => { r = (r * 1103515245 + 12345) % 2147483648; return (r >>> 16) % (n % 3 ? 2 : 5) ? 0 : 1; });
    assert.equal(qrPenalty(d, size), penaltyRef(d, size), `Zufall ${size}/${n}`);
  }
});
