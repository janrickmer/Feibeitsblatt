// Konfiguration (wrangler.jsonc): täglicher Zeitplan für die Löschfrist, keine gespeicherten Protokolle bei Cloudflare.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// JSONC → JSON: Kommentare (// und /* */) außerhalb von Strings entfernen; Strings unverändert übernehmen
function stripJsonc(src) {
  let out = "", i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1); i = j + 1;
    } else if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") i++; }
    else if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; }
    else { out += c; i++; }
  }
  return out;
}
const cfg = JSON.parse(stripJsonc(readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8")));

test("wrangler.jsonc: Cron Trigger für die automatische Löschung (täglich 02:17 UTC)", () => {
  assert.deepEqual(cfg.triggers, { crons: ["17 2 * * *"] });
});
test("wrangler.jsonc: Workers Logs, Aufrufprotokolle, Traces und Issues ausdrücklich aus; kein Logpush", () => {
  const o = cfg.observability;
  assert.equal(o.enabled, false);
  assert.equal(o.logs.enabled, false); assert.equal(o.logs.invocation_logs, false);
  assert.equal(o.traces.enabled, false);
  assert.equal(o.issues.enabled, false);
  assert.notEqual(cfg.logpush, true);
  assert.equal(JSON.stringify(cfg).includes('"enabled":true'), false);
});
test("wrangler.jsonc: Grundeinstellungen unverändert (D1 per Name, Assets mit run_worker_first, Workers AI ohne Gateway)", () => {
  assert.equal(cfg.main, "worker/index.js");
  assert.deepEqual(cfg.d1_databases, [{ binding: "DB", database_name: "feibeitsblatt-db" }]);
  assert.deepEqual(cfg.assets.run_worker_first, ["/api/*"]);
  assert.equal(cfg.ai.binding, "AI"); assert.equal("gateway" in cfg.ai, false);
  assert.equal(cfg.compatibility_flags, undefined);   // kein nodejs_compat
});
