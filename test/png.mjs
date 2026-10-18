// png.mjs – winziger PNG-Erzeuger für Tests (ohne Abhängigkeiten): einfarbige oder gestreifte RGB-Bilder beliebiger Größe.
import { deflateSync } from "node:zlib";

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const t = Buffer.from(type, "latin1"), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
/* RGB-PNG w×h; rgb = [r,g,b] oder (x,y) => [r,g,b] */
export function makePng(w, h, rgb = [200, 60, 40]) {
  const px = typeof rgb === "function" ? rgb : () => rgb;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;   // Filter: none
    for (let x = 0; x < w; x++) { const [r, g, b] = px(x, y), o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
/* Minimaler JPEG-Kopf (SOI, APP0, SOF0 mit Maßen) – nur für Kopfdaten-Tests, nicht dekodierbar */
export function jpegHeader(w, h, { padding = 0, sofMarker = 0xc0 } = {}) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const pad = padding ? Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from([(padding + 2) >> 8, (padding + 2) & 0xff]), Buffer.alloc(padding)]) : Buffer.alloc(0);   // COM-Segment
  const sof = Buffer.from([0xff, sofMarker, 0x00, 0x11, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, pad, sof, Buffer.from([0xff, 0xda, 0x00, 0x02]), Buffer.from([0xff, 0xd9])]);
}
/* WebP-Köpfe (VP8X/VP8L/VP8) – nur Kopfdaten */
export function webpHeader(kind, w, h) {
  const riff = Buffer.from("RIFF\0\0\0\0WEBP", "latin1"); riff.writeUInt32LE(30, 4);
  if (kind === "VP8X") { const b = Buffer.alloc(18); b.write("VP8X", 0, "latin1"); b.writeUInt32LE(10, 4); b.writeUIntLE(w - 1, 12, 3); b.writeUIntLE(h - 1, 15, 3); return Buffer.concat([riff, b]); }
  if (kind === "VP8L") { const b = Buffer.alloc(13); b.write("VP8L", 0, "latin1"); b.writeUInt32LE(5, 4); b[8] = 0x2f; b.writeUInt32LE(((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14), 9); return Buffer.concat([riff, b]); }
  const b = Buffer.alloc(18); b.write("VP8 ", 0, "latin1"); b.writeUInt32LE(10, 4); b[11] = 0x9d; b[12] = 0x01; b[13] = 0x2a; b.writeUInt16LE(w, 14); b.writeUInt16LE(h, 16);
  return Buffer.concat([riff, b]);
}
