// Unit-Tests der Weltkarte (scripts/worldmap.mjs): eingebettete Daten aktuell, deutsche Namen, Ankerpunkte im Inneren.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWorld, worldBlock, NAMES_DE, ALIASES_DE } from "../../scripts/worldmap.mjs";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const world = buildWorld();

test("worldmap: index.html enthält genau die erzeugte Weltkarte (node scripts/worldmap.mjs)", () => {
  assert.ok(html.includes(worldBlock(world)), "Weltkarte in index.html veraltet – bitte node scripts/worldmap.mjs ausführen");
});
test("worldmap: 177 Gebiete, 174 anklickbar mit ISO-Kennung und deutschem Namen; ohne Kennung Kosovo, Nordzypern, Somaliland", () => {
  assert.equal(world.countries.length, 177);
  const ids = world.countries.filter((c) => c[0]).map((c) => c[0]);
  assert.equal(ids.length, 174); assert.equal(new Set(ids).size, 174);
  assert.ok(ids.every((id) => /^\d{3}$/.test(id) && NAMES_DE[id]));
  assert.deepEqual(world.countries.filter((c) => !c[0]).map((c) => c[1]).sort(), ["Kosovo", "Nordzypern", "Somaliland"]);
  const names = world.countries.map((c) => c[1]);
  assert.equal(new Set(names).size, names.length, "Namen eindeutig");
  for (const [id, n] of [["276", "Deutschland"], ["840", "USA"], ["384", "Elfenbeinküste"], ["036", "Australien"], ["156", "China"]]) assert.equal(NAMES_DE[id], n);
  const all = new Set(names.map((n) => n.toLowerCase()));
  for (const list of Object.values(ALIASES_DE)) for (const a of list) assert.equal(all.has(a.toLowerCase()), false, "Alias " + a + " ist kein anderer Ländername");
});
test("worldmap: Pfade im viewBox 0 0 1000 520 mit einer Nachkommastelle, Anker im Kartenbereich", () => {
  assert.deepEqual([world.w, world.h], [1000, 520]);
  for (const [, name, d, ax, ay] of world.countries) {
    assert.match(d, /^M[\d.,LMZ-]+$/, name);
    assert.equal(/\d\.\d\d/.test(d), false, name + ": höchstens eine Nachkommastelle");
    assert.ok(ax > 0 && ax < 1000 && ay > 0 && ay < 520, name);
  }
  assert.ok(worldBlock(world).length < 160 * 1024, "Kartendaten ≤ 160 KB");
});
test("worldmap: die Krim gehört zur Ukraine (Natural Earth zeichnet sie de facto bei Russland)", async () => {
  const { countries } = await import("../../scripts/worldmap.mjs");
  const { geoContains } = await import("d3-geo");
  const f = countries(), ua = f.find((x) => x.id === "804"), ru = f.find((x) => x.id === "643");
  for (const pt of [[34.1, 45.0], [33.52, 44.6]]) { assert.equal(geoContains(ua, pt), true); assert.equal(geoContains(ru, pt), false); }
  assert.equal(geoContains(ru, [37.6, 55.75]), true);   // Moskau
  assert.equal(geoContains(ua, [30.5, 50.45]), true);   // Kyjiw
});
