// helpers.mjs – Hilfen für die Browser-Tests: LanguageTool-Attrappe, Seiten mit Fehler-/Netz-Protokoll, Dialoge,
// Mock-KI-Zustand, lokale D1 (wrangler d1 execute) und Rohdaten-Scan des Zustandsordners.
import { expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { E2E_STATE, MOCK_URL, ROOT } from "./env.mjs";

export const PASTE_MSG = "Einfügen aus der Zwischenablage ist hier nicht erlaubt – bitte selbst tippen.";
export const UNKNOWN_CODE_MSG = "Zu diesem Code gibt es kein Feibeitsblatt. Bitte prüfe den Code.";
export const NO_SOLUTION_NOTE = "Zu dieser Aufgabe gibt es kein KI-Feedback.";
export const GREEN = "rgb(31, 107, 42)", RED = "rgb(179, 38, 30)";

/* ---------- LanguageTool-Attrappe (Antwortformat wie /v2/check) ---------- */
// [falsch, Vorschläge|null, Kategorie, Regel, typeName]
const LT_DICT = [
  ["Gewissn", ["Gewissen"], "TYPOS", "GERMAN_SPELLER_RULE", "UnknownWord"],
  ["weis", ["weiß"], "TYPOS", "GERMAN_SPELLER_RULE", "UnknownWord"],
  ["gut und böse", ["Gut und Böse"], "CASING", "DE_CASE", "Other"],
  ["sehr toll", ["großartig"], "COLLOQUIALISMS", "TOLL_STIL", "Hint"],   // Stil: darf nie angewendet werden
];
function ltMatches(text) {
  const out = [];
  for (const [needle, repl, cat, id, typeName] of LT_DICT) {
    for (let off = text.indexOf(needle); off >= 0; off = text.indexOf(needle, off + 1)) {
      const len = needle.length, from = Math.max(0, off - 40), to = Math.min(text.length, off + len + 40);
      const pre = from > 0 ? "..." : "", post = to < text.length ? "..." : "";
      out.push({
        message: cat === "TYPOS" ? "Möglicher Tippfehler gefunden." : "Möglicher Fehler.", shortMessage: "",
        replacements: (repl || []).map((value) => ({ value })), offset: off, length: len,
        context: { text: pre + text.slice(from, to).replace(/\n/g, " ") + post, offset: pre.length + off - from, length: len },
        sentence: text, type: { typeName },
        rule: { id, description: id, issueType: cat === "TYPOS" ? "misspelling" : "uncategorized", category: { id: cat, name: cat } },
      });
    }
  }
  return out.sort((a, b) => a.offset - b.offset);
}
export async function installLanguageTool(context, log) {
  await context.route("https://api.languagetool.org/**", async (route) => {
    const req = route.request();
    const params = Object.fromEntries(new URLSearchParams(req.postData() || ""));
    log.push({ method: req.method(), url: req.url(), headers: await req.allHeaders(), params });
    const text = params.text || "";
    await route.fulfill({
      status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        software: { name: "LanguageTool", version: "6.7", apiVersion: 1, premium: false, status: "" },
        warnings: { incompleteResults: false },
        language: { name: "German (Germany)", code: "de-DE" },
        matches: ltMatches(text), sentenceRanges: [[0, text.length]],
      }),
    });
  });
}

/* ---------- YouTube-/Google-Attrappe ---------- */
// Alle Hosts von YouTube und Google (Player, Vorschaubilder, Videodaten, Skripte, Werbung): Die Tests erreichen nie das echte YouTube.
// Der eingebettete Player (www.youtube-nocookie.com/embed/…) und „Video in neuem Tab öffnen“ (www.youtube.com/watch?v=…) bekommen eine
// kleine HTML-Seite ohne Unterressourcen, alles andere wird abgebrochen. log = [{url, method, headers, isNav}] je Anfrage.
export const YT_HOST_RE = /^(?:[a-z0-9-]+\.)*(?:youtube(?:-nocookie)?\.com|youtu\.be|ytimg\.com|ggpht\.com|googlevideo\.com|google(?:apis|usercontent|tagmanager|syndication|adservices)?\.com|google\.[a-z]{2,3}(?:\.[a-z]{2})?|gstatic\.com|doubleclick\.net)$/;
const YT_ROUTE_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:youtube(?:-nocookie)?\.com|youtu\.be|ytimg\.com|ggpht\.com|googlevideo\.com|google(?:apis|usercontent|tagmanager|syndication|adservices)?\.com|google\.[a-z]{2,3}(?:\.[a-z]{2})?|gstatic\.com|doubleclick\.net)(?::\d+)?\//;
export const YT_STUB = '<!doctype html><meta charset="utf-8"><title>Attrappe</title><p id="yt-stub">Video (Attrappe)</p>';
export async function installYouTube(context, log) {
  await context.route(YT_ROUTE_RE, async (route) => {
    const req = route.request(), u = new URL(req.url());
    log.push({ url: req.url(), method: req.method(), headers: await req.allHeaders(), isNav: req.isNavigationRequest() });
    const stub = (u.hostname === "www.youtube-nocookie.com" && u.pathname.startsWith("/embed/")) || (u.hostname === "www.youtube.com" && u.pathname === "/watch");
    if (stub) await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: YT_STUB });
    else await route.abort("blockedbyclient");
  });
}
// Anfragen, die YouTube bzw. Google erreichen sollen (zugelassen erst nach dem Klick der Schüler:innen, siehe closePage)
export const isYouTubeUrl = (url) => { try { return YT_HOST_RE.test(new URL(url).hostname); } catch (e) { return false; } };

/* ---------- Seiten mit Protokoll ---------- */
// Jede Seite in eigenem Kontext (eigener localStorage); protokolliert API-Antworten, Seitenfehler und CSP-Verstöße.
// yt = Anfragen an YouTube/Google (Attrappe), foreign = alle Anfragen an fremde Hosts (auch aus iframes und Popups)
export async function openPage(browser, { clipboard = false } = {}) {
  const context = await browser.newContext();
  if (clipboard) await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const lt = [], yt = [], foreign = [];
  await installLanguageTool(context, lt);
  await installYouTube(context, yt);
  context.on("request", (r) => {
    let host = "";
    try { host = new URL(r.url()).hostname; } catch (e) { return; }
    if (host && host !== "127.0.0.1" && host !== "localhost" && host !== "api.languagetool.org") foreign.push(r.url());
  });
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + e.blockedURI));
  });
  const page = await context.newPage();
  const errors = [], api = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.accept().catch(() => {}));   // nur beforeunload (die Seite nutzt eigene Dialoge)
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/")) return;
    const entry = { method: r.request().method(), path: u.pathname, query: u.search, status: r.status(), body: "", reqBody: r.request().postData() || "" };
    entry.ready = r.text().then((b) => { entry.body = b; }, () => {});
    api.push(entry);
  });
  await page.goto("/");
  await expect(page.locator("#screen-start")).toHaveClass(/active/);
  // API-Aufrufe dieser Seite (mit vollständig gelesenem Antworttext), optional gefiltert
  const calls = async (filter = () => true) => { await Promise.all(api.map((e) => e.ready)); return api.filter(filter); };
  return { context, page, errors, api, calls, lt, yt, foreign };
}
// p.allowYouTube = true erlaubt Anfragen an den eingebetteten Player (www.youtube-nocookie.com/embed/…) und an
// www.youtube.com/watch?v=… (Video in neuem Tab) – nur Tests, in denen Schüler:innen ein Video laden; sonst keine einzige
export async function closePage(p) {
  const csp = await p.page.evaluate(() => window.__csp).catch(() => []);
  expect(p.errors, "keine JavaScript-Fehler auf der Seite").toEqual([]);
  expect(csp, "keine CSP-Verstöße").toEqual([]);
  const google = p.foreign.filter(isYouTubeUrl);
  const allowed = (u) => /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}\?/.test(u) || /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}(&t=\d+s)?$/.test(u);
  expect(google, "keine Anfrage an YouTube/Google").toEqual(p.allowYouTube ? google.filter(allowed) : []);
  await p.context.close();
}

/* Eigener Bestätigungsdialog der Seite (#dlg) */
export async function confirmDialog(page, title, accept = true) {
  const dlg = page.locator("#dlg.open");
  await expect(dlg).toBeVisible();
  await expect(page.locator("#dlg-title")).toHaveText(title);
  const text = await page.locator("#dlg-text").textContent();
  await page.click(accept ? "#dlg-ok" : "#dlg-cancel");
  await expect(dlg).toBeHidden();
  return text;
}

/* Lehrkraft: Türcode + Passwort → Übersicht */
export async function teacherLogin(page, password) {
  await page.fill("#code-input", "1104");
  await page.click("#start-btn");
  await expect(page.locator("#screen-tlogin")).toHaveClass(/active/);
  await page.fill("#tl-pw", password);
  await page.click("#tl-btn");
  await expect(page.locator("#screen-teacher")).toHaveClass(/active/, { timeout: 30_000 });
  await expect(page.locator("#tv-overview")).toBeVisible();
}

/* Geometrie im Schreibbereich */
export const lineHeightOf = (page, sel) => page.$eval(sel, (e) => parseFloat(getComputedStyle(e).lineHeight));
export const topOf = (page, sel) => page.$eval(sel, (e) => e.getBoundingClientRect().top);
// Abstand zwischen dem unteren Rand des sichtbaren Antwortblocks von Aufgabe n (Feld, Prüf-Button, Ausgaben) und dem
// Beginn der nächsten Aufgabenstellung (Abschnitt; die Beschriftung „Aufgabe n“ steht darin 2px tiefer)
export const gapAfterTask = (page, n) => page.evaluate((n) => {
  const A = document.getElementById("t-" + n), B = document.getElementById("t-" + (n + 1));
  const kids = Array.from(A.children).filter((k) => k.offsetParent !== null && !k.classList.contains("measure"));
  const bottom = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom));
  return B.getBoundingClientRect().top - bottom;
}, n);

/* ---------- Mock-KI ---------- */
export const mockState = async () => (await fetch(MOCK_URL + "/__mock/state")).json();
export const mockReset = async () => (await fetch(MOCK_URL + "/__mock/reset", { method: "POST" })).json();
export const mockMode = async (mode) => (await fetch(MOCK_URL + "/__mock/mode", { method: "POST", body: JSON.stringify({ mode, delayMs: 0 }) })).json();

/* ---------- Lokale D1 ---------- */
const run = promisify(execFile);
export async function d1Query(sql) {
  const { stdout } = await run(join(ROOT, "node_modules", ".bin", "wrangler"),
    ["d1", "execute", "DB", "--local", "--persist-to", E2E_STATE, "--command", sql, "--json"],
    { cwd: ROOT, env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" }, maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
  const out = JSON.parse(stdout.slice(stdout.indexOf("[")));
  return out[0].results;
}
export async function filesUnder(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await filesUnder(p))); else out.push(p);
  }
  return out;
}
// Zählt je Suchtext, in wie vielen Dateien des Zustandsordners er als Rohbytes (UTF-8) vorkommt
export async function scanState(needles) {
  const count = Object.fromEntries(needles.map((n) => [n, 0]));
  let files = 0;
  for (const f of await filesUnder(E2E_STATE)) {
    const buf = await readFile(f).catch(() => null);
    if (!buf) continue;
    files++;
    for (const n of needles) if (buf.includes(Buffer.from(n, "utf8"))) count[n]++;
  }
  return { files, count };
}
