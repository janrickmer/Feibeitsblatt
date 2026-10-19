// worldmap.mjs – erzeugt die Weltkarte für die Antwortart „Weltkarten-Zuordnung“ und bettet sie in index.html ein.
// Quelle: Natural Earth 1:110m (gemeinfrei) aus dem npm-Paket world-atlas@2 (countries-110m.json, ISC), Projektion
// Equal Earth (flächentreu) mit d3-geo, viewBox 0 0 1000 520, Koordinaten mit einer Nachkommastelle. Je Staat: Kennung
// (ISO 3166-1 numerisch, 3 Ziffern – wie in world-atlas), deutscher Name, SVG-Pfad und Ankerpunkt (Mittelpunkt des größten
// Teilgebiets: der Punkt, der am weitesten von dessen Grenze entfernt liegt – dorthin zeigen die Pfeile). Gebiete ohne
// ISO-Kennung (Kosovo, Nordzypern, Somaliland) werden gezeichnet, sind aber nicht anklickbar.
// Aufruf: node scripts/worldmap.mjs (schreibt index.html zwischen den Markierungen) bzw. --check (nur prüfen).
// world-atlas, d3-geo und topojson-client sind devDependencies – zur Laufzeit lädt die Seite nichts nach.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { geoEqualEarth, geoPath, geoContains } from "d3-geo";
import { feature, merge } from "topojson-client";

const require = createRequire(import.meta.url);
const topo = require("world-atlas/countries-110m.json");
const W = 1000, H = 520;

// Deutsche Kurzformen (wie im Unterricht und beim Auswärtigen Amt üblich); Schlüssel = Kennung in world-atlas
export const NAMES_DE = {
  "004": "Afghanistan", "008": "Albanien", "010": "Antarktis", "012": "Algerien", "024": "Angola", "031": "Aserbaidschan",
  "032": "Argentinien", "036": "Australien", "040": "Österreich", "044": "Bahamas", "050": "Bangladesch", "051": "Armenien",
  "056": "Belgien", "064": "Bhutan", "068": "Bolivien", "070": "Bosnien und Herzegowina", "072": "Botsuana", "076": "Brasilien",
  "084": "Belize", "090": "Salomonen", "096": "Brunei", "100": "Bulgarien", "104": "Myanmar", "108": "Burundi", "112": "Belarus",
  "116": "Kambodscha", "120": "Kamerun", "124": "Kanada", "140": "Zentralafrikanische Republik", "144": "Sri Lanka", "148": "Tschad",
  "152": "Chile", "156": "China", "158": "Taiwan", "170": "Kolumbien", "178": "Republik Kongo", "180": "Demokratische Republik Kongo",
  "188": "Costa Rica", "191": "Kroatien", "192": "Kuba", "196": "Zypern", "203": "Tschechien", "204": "Benin", "208": "Dänemark",
  "214": "Dominikanische Republik", "218": "Ecuador", "222": "El Salvador", "226": "Äquatorialguinea", "231": "Äthiopien",
  "232": "Eritrea", "233": "Estland", "238": "Falklandinseln", "242": "Fidschi", "246": "Finnland", "250": "Frankreich",
  "260": "Französische Süd- und Antarktisgebiete", "262": "Dschibuti", "266": "Gabun", "268": "Georgien", "270": "Gambia",
  "275": "Palästinensische Gebiete", "276": "Deutschland", "288": "Ghana", "300": "Griechenland", "304": "Grönland",
  "320": "Guatemala", "324": "Guinea", "328": "Guyana", "332": "Haiti", "340": "Honduras", "348": "Ungarn", "352": "Island",
  "356": "Indien", "360": "Indonesien", "364": "Iran", "368": "Irak", "372": "Irland", "376": "Israel", "380": "Italien",
  "384": "Elfenbeinküste", "388": "Jamaika", "392": "Japan", "398": "Kasachstan", "400": "Jordanien", "404": "Kenia",
  "408": "Nordkorea", "410": "Südkorea", "414": "Kuwait", "417": "Kirgisistan", "418": "Laos", "422": "Libanon", "426": "Lesotho",
  "428": "Lettland", "430": "Liberia", "434": "Libyen", "440": "Litauen", "442": "Luxemburg", "450": "Madagaskar", "454": "Malawi",
  "458": "Malaysia", "466": "Mali", "478": "Mauretanien", "484": "Mexiko", "496": "Mongolei", "498": "Moldau", "499": "Montenegro",
  "504": "Marokko", "508": "Mosambik", "512": "Oman", "516": "Namibia", "524": "Nepal", "528": "Niederlande", "540": "Neukaledonien",
  "548": "Vanuatu", "554": "Neuseeland", "558": "Nicaragua", "562": "Niger", "566": "Nigeria", "578": "Norwegen", "586": "Pakistan",
  "591": "Panama", "598": "Papua-Neuguinea", "600": "Paraguay", "604": "Peru", "608": "Philippinen", "616": "Polen", "620": "Portugal",
  "624": "Guinea-Bissau", "626": "Osttimor", "630": "Puerto Rico", "634": "Katar", "642": "Rumänien", "643": "Russland",
  "646": "Ruanda", "682": "Saudi-Arabien", "686": "Senegal", "688": "Serbien", "694": "Sierra Leone", "703": "Slowakei",
  "704": "Vietnam", "705": "Slowenien", "706": "Somalia", "710": "Südafrika", "716": "Simbabwe", "724": "Spanien", "728": "Südsudan",
  "729": "Sudan", "732": "Westsahara", "740": "Suriname", "748": "Eswatini", "752": "Schweden", "756": "Schweiz", "760": "Syrien",
  "762": "Tadschikistan", "764": "Thailand", "768": "Togo", "780": "Trinidad und Tobago", "784": "Vereinigte Arabische Emirate",
  "788": "Tunesien", "792": "Türkei", "795": "Turkmenistan", "800": "Uganda", "804": "Ukraine", "807": "Nordmazedonien",
  "818": "Ägypten", "826": "Vereinigtes Königreich", "834": "Tansania", "840": "USA", "854": "Burkina Faso", "858": "Uruguay",
  "860": "Usbekistan", "862": "Venezuela", "887": "Jemen", "894": "Sambia",
};
// Gebiete ohne ISO-Kennung (nach dem englischen Namen in world-atlas): nur gezeichnet
const NO_ID_DE = { "Kosovo": "Kosovo", "N. Cyprus": "Nordzypern", "Somaliland": "Somaliland" };
// Weitere gebräuchliche Namen für die Eingabe „Land eingeben“ (Vorschlagsliste und Prüfung)
export const ALIASES_DE = {
  "112": ["Weißrussland"], "384": ["Côte d’Ivoire", "Côte d'Ivoire"], "498": ["Moldawien", "Republik Moldau"], "626": ["Timor-Leste"],
  "748": ["Swasiland"], "807": ["Mazedonien"], "826": ["Großbritannien"], "840": ["Vereinigte Staaten", "Vereinigte Staaten von Amerika"],
  "203": ["Tschechische Republik"], "104": ["Birma"], "275": ["Palästina"],
};

// Punkt im Inneren eines Rings mit dem größten Abstand zur Grenze (Gittersuche, zweimal verfeinert) – „visueller Mittelpunkt“
function insideRing(x, y, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function visualCenter(rings) {   // rings[0] = Außenring, weitere = Löcher (projizierte Koordinaten)
  const inside = (x, y) => insideRing(x, y, rings[0]) && !rings.slice(1).some((r) => insideRing(x, y, r));
  const dist = (x, y) => Math.min(...rings.map((r) => Math.min(...r.map((p, i) => segDist(x, y, p, r[(i + 1) % r.length])))));
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of rings[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  let best = null;
  for (let pass = 0; pass < 3; pass++) {
    const n = 40, sx = (x1 - x0) / n, sy = (y1 - y0) / n;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const x = x0 + i * sx, y = y0 + j * sy;
      if (!inside(x, y)) continue;
      const d = dist(x, y);
      if (!best || d > best.d) best = { x, y, d };
    }
    if (!best) break;
    const rx = (x1 - x0) / 8, ry = (y1 - y0) / 8;   // um den besten Punkt verfeinern
    [x0, y0, x1, y1] = [best.x - rx, best.y - ry, best.x + rx, best.y + ry];
  }
  return best;
}
const ringArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2); };
const r1 = (v) => Math.round(v * 10) / 10;

// Natural Earth zeichnet „de facto“-Grenzen und damit die Krim bei Russland. Deutschland, die EU und die UN-Generalversammlung
// (Resolution 68/262) erkennen die Annexion nicht an – deshalb kommt die Krim hier zur Ukraine (Grenze bei Perekop entfällt).
const CRIMEA = [34.1, 45.0];
export function countries() {
  const list = topo.objects.countries.geometries, ru = list.find((g) => g.id === "643"), ua = list.find((g) => g.id === "804");
  const k = ru && ua && ru.type === "MultiPolygon" ? ru.arcs.findIndex((poly) => geoContains(feature(topo, { type: "Polygon", arcs: poly }), CRIMEA)) : -1;
  if (k < 0) throw new Error("Krim nicht gefunden – Kartendaten prüfen");
  const crimea = ru.arcs[k];
  return list.map((g) => {
    if (g === ru) return feature(topo, { ...ru, arcs: ru.arcs.filter((_, i) => i !== k) });
    if (g === ua) return { type: "Feature", id: ua.id, properties: ua.properties, geometry: merge(topo, [ua, { type: "Polygon", arcs: crimea }]) };
    return feature(topo, g);
  });
}

export function buildWorld() {
  const geo = { features: countries() };
  const proj = geoEqualEarth().fitExtent([[4, 4], [W - 4, H - 4]], { type: "Sphere" });
  const path = geoPath(proj).digits(1);
  const out = [];
  for (const f of geo.features) {
    const id = f.id == null ? "" : String(f.id).padStart(3, "0");
    const name = id ? NAMES_DE[id] : NO_ID_DE[f.properties.name];
    if (!name) throw new Error("Kein deutscher Name für " + (id || "") + " " + f.properties.name);
    const d = path(f);
    if (!d) throw new Error("Kein Pfad für " + name);
    // größtes Teilgebiet nach projizierter Fläche (Equal Earth ist flächentreu) – projiziert über einen Pfad je Polygon
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    let best = null;
    for (const poly of polys) {
      const pd = geoPath(proj).digits(3)({ type: "Polygon", coordinates: poly });
      if (!pd) continue;
      // projizierten Pfad in Ringe zerlegen (ein Schnitt am Antimeridian kann das Polygon teilen – dann zählt jedes Stück
      // einzeln); kleinere Ringe innerhalb des größten sind Löcher (z. B. Lesotho in Südafrika)
      const rings = pd.split("M").filter(Boolean).map((seg) => seg.replace(/Z$/, "").split("L").map((p) => p.split(",").map(Number)))
        .filter((r) => r.length >= 3 && r.every((p) => p.length === 2 && p.every(Number.isFinite)));
      for (const ring of rings) {
        const a = ringArea(ring);
        if (!best || a > best.a) best = { a, ring, holes: rings.filter((h) => h !== ring && ringArea(h) < a && insideRing(h[0][0], h[0][1], ring)) };
      }
    }
    const c = best ? visualCenter([best.ring, ...best.holes]) : null;
    const [ax, ay] = c ? [c.x, c.y] : path.centroid(f);
    out.push([id, name, d, r1(ax), r1(ay)]);
  }
  out.sort((a, b) => (a[0] || "zzz" + a[1]).localeCompare(b[0] || "zzz" + b[1]));
  const aliases = Object.fromEntries(Object.entries(ALIASES_DE).filter(([id]) => out.some((c) => c[0] === id)));
  return { w: W, h: H, countries: out, aliases };
}

const BEGIN = "/* WORLDMAP:BEGIN – erzeugt von scripts/worldmap.mjs, nicht von Hand ändern */", END = "/* WORLDMAP:END */";
export function worldBlock(world) {
  const rows = world.countries.map((c) => JSON.stringify(c)).join(",\n");
  return BEGIN + "\n// Natural Earth 1:110m (gemeinfrei) über world-atlas@2 (ISC); Equal-Earth-Projektion, viewBox 0 0 " + world.w + " " + world.h +
    "; je Eintrag [ISO-Kennung (\"\" = nicht anklickbar), deutscher Name, SVG-Pfad, Anker x, Anker y]\nconst WORLD_MAP = { w: " + world.w + ", h: " + world.h +
    ", aliases: " + JSON.stringify(world.aliases) + ", countries: [\n" + rows + "\n] };\n" + END;
}

if (process.argv[1] && process.argv[1].endsWith("worldmap.mjs")) {
  const file = new URL("../index.html", import.meta.url);
  const html = readFileSync(file, "utf8");
  const i = html.indexOf(BEGIN), j = html.indexOf(END);
  if (i < 0 || j < i) { console.error("Markierungen WORLDMAP:BEGIN/END in index.html fehlen."); process.exit(1); }
  const world = buildWorld();
  const next = html.slice(0, i) + worldBlock(world) + html.slice(j + END.length);
  const kb = (worldBlock(world).length / 1024).toFixed(0);
  if (process.argv.includes("--check")) {
    if (next !== html) { console.error("Die Weltkarte in index.html ist nicht aktuell – bitte node scripts/worldmap.mjs ausführen."); process.exit(1); }
    console.log("Weltkarte aktuell (" + world.countries.length + " Gebiete, " + kb + " KB).");
  } else {
    writeFileSync(file, next);
    console.log("Weltkarte geschrieben: " + world.countries.length + " Gebiete (" + world.countries.filter((c) => c[0]).length + " anklickbar), " + kb + " KB.");
  }
}
