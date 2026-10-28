// Konfiguration (wrangler.jsonc): täglicher Zeitplan für die Löschfrist, keine gespeicherten Protokolle bei Cloudflare; dazu die
// Content-Security-Policy in _headers und im Meta-Tag von index.html.
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

/* ---------- Content-Security-Policy: _headers (Worker) und <meta http-equiv> in index.html (GitHub Pages; am Worker gelten beide –
   eine Quelle muss in beiden erlaubt sein) ---------- */
const read = (f) => readFileSync(new URL("../../" + f, import.meta.url), "utf8");
const cspOf = (s) => Object.fromEntries(s.split(";").map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]));
const headers = read("_headers");
const headerCsp = cspOf((headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m) || [])[1] || "");
const metaCsp = cspOf((read("index.html").match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/) || [])[1] || "");
const workerUrl = (read("index.html").match(/window\.FEIBEITSBLATT_WORKER = "([^"]+)"/) || [])[1];

test("CSP: frame-src nur https://www.youtube-nocookie.com – in _headers und im Meta-Tag; keine Vorschaubilder, kein anderer YouTube-Host", () => {
  for (const [name, csp] of [["_headers", headerCsp], ["index.html", metaCsp]]) {
    assert.deepEqual(csp["frame-src"], ["https://www.youtube-nocookie.com"], name);
    assert.equal("child-src" in csp, false, name);   // fiele sonst für frame-src zurück
    assert.deepEqual(csp["img-src"], ["'self'", "data:", "blob:"], name);   // nie i.ytimg.com: kein Vorschaubild vor dem Klick
    assert.deepEqual(csp["default-src"], ["'self'"], name);
    const all = Object.values(csp).flat();
    assert.equal(all.some((s) => /ytimg|ggpht|googlevideo|(^|[/.])youtube\.com|youtu\.be|\*/.test(s)), false, name + ": " + all.join(" "));
  }
});
test("CSP: _headers und Meta-Tag gleich – bis auf connect-src (Worker-Adresse) und frame-ancestors (nur als Header möglich)", () => {
  assert.deepEqual(headerCsp["connect-src"], ["'self'", "https://api.languagetool.org"]);
  assert.ok(workerUrl && /^https:\/\//.test(workerUrl));
  assert.deepEqual(metaCsp["connect-src"], ["'self'", "https://api.languagetool.org", workerUrl]);   // Worker-Adresse hier und im Skript gleich
  assert.deepEqual(headerCsp["frame-ancestors"], ["'none'"]); assert.equal("frame-ancestors" in metaCsp, false);
  const rest = (csp) => Object.fromEntries(Object.entries(csp).filter(([k]) => k !== "connect-src" && k !== "frame-ancestors"));
  assert.deepEqual(rest(metaCsp), rest(headerCsp));
  // Sicherheitsheader bleiben: die Seite selbst lässt sich nicht einrahmen, kein Referrer (das Video-iframe setzt selbst
  // referrerpolicy="strict-origin-when-cross-origin" – nur die Herkunft geht an YouTube)
  for (const h of ["X-Frame-Options: DENY", "Referrer-Policy: no-referrer", "X-Content-Type-Options: nosniff", "Permissions-Policy: camera=(), microphone=(), geolocation=()"])
    assert.ok(headers.includes(h), h);
});
