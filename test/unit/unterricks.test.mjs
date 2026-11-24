// unterricks.test.mjs – Zwischenstand-PDF aus Unterricks (#von-unterricks, Übergabe-Protokoll v1): die reinen Hilfsfunktionen aus
// index.html (Block UNTERRICKS:BEGIN … UNTERRICKS:END) und die Stellen im Skript, die sie benutzen
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const i = html.indexOf("/* UNTERRICKS:BEGIN"), j = html.indexOf("/* UNTERRICKS:END */");
const U = new Function(html.slice(i, j) + "\nreturn { UNTERRICKS_ORIGINS, unterricksHash, unterricksLocal, unterricksOriginOk, unterricksReadyTargets, " +
  "unterricksReady, unterricksParse, unterricksDecide, unterricksReply };")();
const MAX = 5 * 1024 * 1024;   // = PDF_MAX_BYTES in index.html
const PROD = ["https://unterricks.janrickmer.de", "https://unterricks.feindt.workers.dev"];

test("unterricks: Block in index.html gefunden, Grenze wie PDF_MAX_BYTES", () => {
  assert.ok(i > 0 && j > i);
  assert.match(html, /\nconst PDF_MAX_BYTES = 5 \* 1024 \* 1024;/);
  assert.deepEqual([...U.UNTERRICKS_ORIGINS], PROD);
  assert.ok(Object.isFrozen(U.UNTERRICKS_ORIGINS));
});

test("unterricks: nur genau #von-unterricks", () => {
  assert.equal(U.unterricksHash("#von-unterricks"), true);
  for (const h of ["", null, undefined, "#", "#von-unterricks2", "#von-unterricks?x", "#von-unterricks/", "#Von-Unterricks", "#VON-UNTERRICKS",
    " #von-unterricks", "von-unterricks", "#escape=von-unterricks", "#checkliste=K7QM4X", "#impressum"]) assert.equal(U.unterricksHash(h), false, String(h));
});

test("unterricks: lokal nur auf 127.0.0.1 und localhost", () => {
  for (const host of ["127.0.0.1", "localhost"]) assert.equal(U.unterricksLocal(host), true, host);
  for (const host of ["feibeitsblatt.janrickmer.de", "feibeitsblatt.feindt.workers.dev", "[::1]", "::1", "127.0.0.2", "localhost.example.org",
    "evil-localhost", "127.0.0.1.example.org", "", null, undefined]) assert.equal(U.unterricksLocal(host), false, String(host));
});

test("unterricks: erlaubte Herkunft – genau die Adressen von Unterricks, lokale nur, wenn die Seite selbst lokal läuft", () => {
  for (const local of [false, true]) for (const o of PROD) assert.equal(U.unterricksOriginOk(o, local), true, o);
  const local = ["http://127.0.0.1:8790", "http://127.0.0.1:5173", "http://localhost:3000", "http://localhost", "http://127.0.0.1"];
  for (const o of local) { assert.equal(U.unterricksOriginOk(o, true), true, o); assert.equal(U.unterricksOriginOk(o, false), false, o); }
  for (const o of ["http://unterricks.janrickmer.de", "https://unterricks.janrickmer.de/", "https://unterricks.janrickmer.de:8443",
    "https://evil.unterricks.janrickmer.de", "https://unterricks.janrickmer.de.example.org", "https://unterricks.feindt.workers.dev.example.org",
    "https://feibeitsblatt.janrickmer.de", "https://janrickmer.de", "null", "", "*", "https://127.0.0.1:8790", "http://127.0.0.1:8790/",
    "http://127.0.0.1.example.org:80", "http://localhost.example.org", "http://[::1]:8790", "http://127.0.0.1:123456", "file://", "HTTPS://UNTERRICKS.JANRICKMER.DE"]) {
    for (const loc of [false, true]) assert.equal(U.unterricksOriginOk(o, loc), false, o + " " + loc);
  }
  for (const o of [null, undefined, 42, {}, ["https://unterricks.janrickmer.de"]]) assert.equal(U.unterricksOriginOk(o, true), false, String(o));
});

test("unterricks: Bereitschaftsnachricht – online genau an die beiden Adressen, lokal an „*“; Inhalt nur kind und v", () => {
  assert.deepEqual(U.unterricksReadyTargets(false), PROD);
  assert.ok(!U.unterricksReadyTargets(false).includes("*"));
  const t = U.unterricksReadyTargets(false); t.push("*");   // eine Kopie – die erlaubten Adressen bleiben unverändert
  assert.deepEqual(U.unterricksReadyTargets(false), PROD);
  assert.deepEqual([...U.UNTERRICKS_ORIGINS], PROD);
  assert.deepEqual(U.unterricksReadyTargets(true), ["*"]);
  assert.deepEqual(U.unterricksReady(), { kind: "feibeitsblatt-bereit", v: 1 });
});

test("unterricks: Nachricht prüfen – nur kind/v des Protokolls, PDF als ArrayBuffer bis zur Grenze", () => {
  const msg = (pdf, extra) => ({ kind: "unterricks-zwischenstand", v: 1, name: "Zwischenstand.pdf", pdf, ...extra });
  const buf = new TextEncoder().encode("%PDF-1.7\n…").buffer;
  assert.deepEqual(U.unterricksParse(msg(buf), MAX), { pdf: buf });
  assert.equal(U.unterricksParse(msg(buf), MAX).pdf, buf);
  assert.deepEqual(U.unterricksParse(msg(new ArrayBuffer(MAX)), MAX), { pdf: U.unterricksParse(msg(new ArrayBuffer(MAX)), MAX).pdf });
  assert.equal(U.unterricksParse(msg(new ArrayBuffer(MAX)), MAX).pdf.byteLength, MAX);
  assert.deepEqual(U.unterricksParse(msg(new ArrayBuffer(MAX + 1)), MAX), { grund: "zu-gross" });
  assert.deepEqual(U.unterricksParse(msg(buf, { name: undefined }), MAX), { pdf: buf });   // der Dateiname wird nicht gebraucht
  // ArrayBuffer aus einem anderen Realm (so kommt er per postMessage an)
  const foreign = runInNewContext("new ArrayBuffer(16)");
  assert.equal(foreign instanceof ArrayBuffer, false);
  assert.equal(U.unterricksParse(msg(foreign), MAX).pdf, foreign);
  // kein PDF als ArrayBuffer
  for (const pdf of [undefined, null, "%PDF-1.7", new Uint8Array(8), new DataView(new ArrayBuffer(8)), [37, 80, 68, 70], { byteLength: 8 }, new ArrayBuffer(0),
    new Blob(["%PDF-"])]) assert.deepEqual(U.unterricksParse(msg(pdf), MAX), { grund: "kein-pdf" }, String(pdf));
  // nicht für diese Übergabe: nicht beachten
  for (const d of [undefined, null, "unterricks-zwischenstand", 1, [], [msg(buf)], {}, msg(buf, { kind: "feibeitsblatt-bereit" }), msg(buf, { kind: "Unterricks-Zwischenstand" }),
    msg(buf, { v: "1" }), msg(buf, { v: 2 }), msg(buf, { v: undefined }), { kind: "unterricks-zwischenstand", pdf: buf }]) assert.equal(U.unterricksParse(d, MAX), null, JSON.stringify(d));
});

test("unterricks: Entscheidung je Nachricht – nur vom öffnenden Tab, erlaubte Herkunft, einmal, nur auf der Startseite", () => {
  const opener = {}, other = {}, buf = new ArrayBuffer(100);
  const data = { kind: "unterricks-zwischenstand", v: 1, pdf: buf };
  const m = (x) => ({ done: false, opener, source: opener, origin: PROD[0], data, local: false, free: true, ...x });
  assert.deepEqual(U.unterricksDecide(m(), MAX), { pdf: buf });
  assert.deepEqual(U.unterricksDecide(m({ origin: PROD[1] }), MAX), { pdf: buf });
  // nicht beachten (keine Antwort): schon eine angenommen, anderer Tab, kein öffnender Tab, fremde Herkunft, anderer Inhalt
  assert.equal(U.unterricksDecide(m({ done: true }), MAX), null);
  assert.equal(U.unterricksDecide(m({ done: true, free: false }), MAX), null);
  assert.equal(U.unterricksDecide(m({ source: other }), MAX), null);
  assert.equal(U.unterricksDecide(m({ source: null }), MAX), null);
  assert.equal(U.unterricksDecide(m({ opener: null, source: null }), MAX), null);
  assert.equal(U.unterricksDecide(m({ opener: undefined, source: undefined }), MAX), null);
  assert.equal(U.unterricksDecide(m({ origin: "https://unterricks.example.org" }), MAX), null);
  assert.equal(U.unterricksDecide(m({ origin: "https://unterricks.example.org", free: false }), MAX), null);
  assert.equal(U.unterricksDecide(m({ origin: "http://127.0.0.1:8790" }), MAX), null);
  assert.deepEqual(U.unterricksDecide(m({ origin: "http://127.0.0.1:8790", local: true }), MAX), { pdf: buf });
  assert.equal(U.unterricksDecide(m({ data: { kind: "etwas-anderes", v: 1 } }), MAX), null);
  assert.equal(U.unterricksDecide(m({ data: { kind: "etwas-anderes", v: 1 }, free: false }), MAX), null);
  assert.equal(U.unterricksDecide(null, MAX), null);
  // ablehnen (mit Antwort): nicht auf der Startseite bzw. ein Dialog ist offen, kein PDF, zu groß
  assert.deepEqual(U.unterricksDecide(m({ free: false }), MAX), { grund: "beschaeftigt" });
  assert.deepEqual(U.unterricksDecide(m({ free: false, data: { ...data, pdf: new ArrayBuffer(MAX + 1) } }), MAX), { grund: "beschaeftigt" });
  assert.deepEqual(U.unterricksDecide(m({ data: { ...data, pdf: "x" } }), MAX), { grund: "kein-pdf" });
  assert.deepEqual(U.unterricksDecide(m({ data: { ...data, pdf: new ArrayBuffer(MAX + 1) } }), MAX), { grund: "zu-gross" });
});

test("unterricks: Antwort an Unterricks – ok, sonst ok:false mit einem bekannten Grund", () => {
  const base = { kind: "feibeitsblatt-zwischenstand-angekommen", v: 1 };
  assert.deepEqual(U.unterricksReply(true), { ...base, ok: true });
  assert.deepEqual(U.unterricksReply(true, "zu-gross"), { ...base, ok: true });
  assert.deepEqual(U.unterricksReply(false), { ...base, ok: false });
  for (const g of ["zu-gross", "kein-pdf", "beschaeftigt"]) assert.deepEqual(U.unterricksReply(false, g), { ...base, ok: false, grund: g });
  for (const g of ["", "irgendwas", "toString", null, 1]) assert.deepEqual(U.unterricksReply(false, g), { ...base, ok: false }, String(g));
  assert.deepEqual(U.unterricksReply("ja"), { ...base, ok: false });
  assert.deepEqual(U.unterricksReply(undefined), { ...base, ok: false });
});

test("unterricks: im Skript – Hash ganz oben entfernt, Übergabe nur mit Hash, eine Nachricht, derselbe Weg wie „Zwischenstand-PDF hochladen“", () => {
  const top = html.indexOf("let fromUnterricks = false;");
  assert.ok(top > 0 && top < html.indexOf("const API = String(window.FEIBEITSBLATT_API"), "gleich am Anfang des Skripts");
  assert.match(html.slice(top, top + 400), /if \(unterricksHash\(location\.hash\)\) \{ fromUnterricks = true; history\.replaceState\(null, "", location\.pathname \+ location\.search\); \}/);
  // Aufruf erst nach dem Aufbau der Seite und nur mit dem Hash; nur ein message-Listener im ganzen Skript
  assert.equal(html.split("unterricksListen()").length - 1, 2);   // Definition + ein Aufruf
  assert.match(html, /\nif \(fromUnterricks\) unterricksListen\(\);/);
  assert.equal(html.split('addEventListener("message"').length - 1, 1);
  const k = html.indexOf("function unterricksListen()"), body = html.slice(k, html.indexOf("\n}\n", k));
  assert.match(body, /const op = window\.opener;\n\s*if \(!op\) return;/);
  // erst zuhören, dann bereit melden
  assert.ok(body.indexOf('addEventListener("message"') < body.indexOf("op.postMessage(unterricksReady(), t)"));
  assert.match(body, /opener: window\.opener, source: ev\.source, origin: ev\.origin, data: ev\.data, local,/);
  assert.match(body, /free: screen === "screen-start" && !dlgResolve \}, PDF_MAX_BYTES\)/);
  assert.match(body, /done = true;/);
  assert.match(body, /removeEventListener\("message", onMessage\)/);
  // Antwort nur an den öffnenden Tab mit dessen Herkunft; nie "*"
  assert.match(body, /src\.postMessage\(unterricksReply\(ok, grund\), origin\)/);
  assert.equal(body.split("postMessage(").length - 1, 2);
  assert.match(body, /importDraftPdf\(new Blob\(\[d\.pdf\], \{ type: "application\/pdf" \}\)\)\.then\(\(r\) => reply\(r === true\), \(\) => reply\(false\)\)/);
  // dieselben Meldungen wie beim eigenen Hochladen
  assert.match(html, /if \(file\.size > PDF_MAX_BYTES\) \{ err\.textContent = PDF_TOO_BIG; return; \}/);
  assert.match(body, /d\.grund === "zu-gross" \? PDF_TOO_BIG : PDF_NOT_DRAFT/);
  // nichts an einen Server: kein api()/fetch in der Übergabe
  assert.doesNotMatch(body, /\bapi\(|\bfetch\(|XMLHttpRequest|sendBeacon/);
});

/* unterricksListen mit nachgebauter Umgebung: öffnender Tab (window.opener), Nachrichten, Startseite bzw. anderer Bildschirm, importDraftPdf */
const k0 = html.indexOf("// Nur mit #von-unterricks und öffnendem Tab"), k1 = html.indexOf("\n}\n", html.indexOf("function unterricksListen()")) + 3;
const LISTEN_SRC = html.slice(i, j) + html.slice(k0, k1);
function harness({ host = "feibeitsblatt.janrickmer.de", opener = true, importResult = true } = {}) {
  const log = [], listeners = new Set(), st = { err: "", imports: [] };
  const op = opener ? { postMessage: (data, target) => log.push({ to: "opener", data, target }) } : null;
  const win = {
    opener: op,
    addEventListener: (t, f) => { log.push({ listen: t }); if (t === "message") listeners.add(f); },
    removeEventListener: (t, f) => { if (t === "message") listeners.delete(f); },
  };
  const $ = (id) => { assert.equal(id, "start-err"); return { set textContent(v) { st.err = v; } }; };
  const importDraftPdf = async (blob) => { st.imports.push(blob); await new Promise((r) => setTimeout(r, 5)); if (importResult instanceof Error) throw importResult; return importResult; };
  const api = new Function("window", "location", "$", "importDraftPdf", "PDF_MAX_BYTES", "PDF_TOO_BIG", "PDF_NOT_DRAFT",
    "let screen = 'screen-start', dlgResolve = null;\n" + LISTEN_SRC + "\nreturn { unterricksListen, set: (s, d) => { screen = s; dlgResolve = d; } };")(
    win, { hostname: host }, $, importDraftPdf, MAX, "ZU GROSS", "KEIN ZWISCHENSTAND");
  const send = (ev) => { for (const f of [...listeners]) f(ev); };
  const replies = () => log.filter((x) => x.data && x.data.kind === "feibeitsblatt-zwischenstand-angekommen");
  return { api, win, op, log, st, send, listeners, replies, settle: () => new Promise((r) => setTimeout(r, 30)) };
}
const pdfMsg = (bytes = 64) => ({ kind: "unterricks-zwischenstand", v: 1, name: "Zwischenstand.pdf", pdf: new ArrayBuffer(bytes) });

test("unterricks: ohne öffnenden Tab geschieht nichts", () => {
  const h = harness({ opener: false });
  h.api.unterricksListen();
  assert.deepEqual(h.log, []);
  assert.equal(h.listeners.size, 0);
});

test("unterricks: erst zuhören, dann bereit melden (online an beide Adressen) – genau eine Nachricht, Antwort erst nach dem Hochladen", async () => {
  const h = harness();
  h.api.unterricksListen();
  assert.deepEqual(h.log, [{ listen: "message" },
    { to: "opener", data: { kind: "feibeitsblatt-bereit", v: 1 }, target: PROD[0] }, { to: "opener", data: { kind: "feibeitsblatt-bereit", v: 1 }, target: PROD[1] }]);
  // nicht beachtet: anderer Tab, fremde Herkunft, lokale Herkunft (Seite läuft nicht lokal), anderer Inhalt
  h.send({ source: {}, origin: PROD[0], data: pdfMsg() });
  h.send({ source: h.op, origin: "https://unterricks.example.org", data: pdfMsg() });
  h.send({ source: h.op, origin: "http://127.0.0.1:8790", data: pdfMsg() });
  h.send({ source: h.op, origin: PROD[0], data: { kind: "etwas-anderes", v: 1 } });
  await h.settle();
  assert.deepEqual(h.replies(), []);
  assert.equal(h.st.imports.length, 0);
  // die richtige Nachricht: derselbe Weg wie „Zwischenstand-PDF hochladen“ (ein Blob mit genau diesen Bytes), dann ok:true an Unterricks
  const m = pdfMsg(1234);
  h.send({ source: h.op, origin: PROD[1], data: m });
  assert.equal(h.st.imports.length, 1);
  assert.equal(h.st.imports[0].size, 1234);
  assert.equal(h.st.imports[0].type, "application/pdf");
  assert.deepEqual(h.replies(), []);   // noch nicht: erst, wenn das Hochladen fertig ist
  await h.settle();
  assert.deepEqual(h.replies(), [{ to: "opener", data: { kind: "feibeitsblatt-zwischenstand-angekommen", v: 1, ok: true }, target: PROD[1] }]);
  // eine zweite Nachricht wird nicht mehr beachtet (der Listener ist weg)
  assert.equal(h.listeners.size, 0);
  h.send({ source: h.op, origin: PROD[1], data: pdfMsg() });
  await h.settle();
  assert.equal(h.st.imports.length, 1);
  assert.equal(h.replies().length, 1);
  assert.equal(h.st.err, "");
});

test("unterricks: nicht auf der Startseite bzw. Dialog offen → „beschaeftigt“, danach nichts mehr; zu groß/kein PDF mit Meldung; gescheitertes Hochladen → ok:false", async () => {
  for (const [scr, dlg] of [["screen-mode", null], ["screen-editor", null], ["screen-start", () => {}]]) {
    const h = harness();
    h.api.unterricksListen();
    h.api.set(scr, dlg);
    h.send({ source: h.op, origin: PROD[0], data: pdfMsg() });
    h.api.set("screen-start", null);
    h.send({ source: h.op, origin: PROD[0], data: pdfMsg() });   // auch danach nicht mehr (eine Nachricht je Seitenaufruf)
    await h.settle();
    assert.deepEqual(h.replies().map((x) => x.data), [{ kind: "feibeitsblatt-zwischenstand-angekommen", v: 1, ok: false, grund: "beschaeftigt" }], scr);
    assert.equal(h.st.imports.length, 0);
    assert.equal(h.st.err, "");   // ein anderer Bildschirm bleibt, wie er ist
  }
  for (const [data, grund, err] of [[pdfMsg(MAX + 1), "zu-gross", "ZU GROSS"], [{ ...pdfMsg(), pdf: "%PDF-1.7" }, "kein-pdf", "KEIN ZWISCHENSTAND"]]) {
    const h = harness();
    h.api.unterricksListen();
    h.send({ source: h.op, origin: PROD[0], data });
    h.send({ source: h.op, origin: PROD[0], data: pdfMsg() });
    await h.settle();
    assert.deepEqual(h.replies().map((x) => x.data), [{ kind: "feibeitsblatt-zwischenstand-angekommen", v: 1, ok: false, grund }]);
    assert.equal(h.st.err, err);
    assert.equal(h.st.imports.length, 0);
  }
  for (const importResult of [false, null, new Error("x")]) {   // null wie ein Rückweg ohne Ergebnis (undefined nähme die Vorgabe des Nachbaus)
    const h = harness({ importResult });
    h.api.unterricksListen();
    h.send({ source: h.op, origin: PROD[0], data: pdfMsg() });
    await h.settle();
    assert.deepEqual(h.replies().map((x) => x.data), [{ kind: "feibeitsblatt-zwischenstand-angekommen", v: 1, ok: false }], String(importResult));
  }
});

test("unterricks: lokal (Tests) bereit an „*“ und lokale Herkunft erlaubt", async () => {
  const h = harness({ host: "127.0.0.1" });
  h.api.unterricksListen();
  assert.deepEqual(h.log.slice(1), [{ to: "opener", data: { kind: "feibeitsblatt-bereit", v: 1 }, target: "*" }]);
  h.send({ source: h.op, origin: "http://127.0.0.1:8790", data: pdfMsg() });
  await h.settle();
  assert.deepEqual(h.replies(), [{ to: "opener", data: { kind: "feibeitsblatt-zwischenstand-angekommen", v: 1, ok: true }, target: "http://127.0.0.1:8790" }]);
});

/* importDraftPdf, escArrive und escLoad mit nachgebauter Umgebung: ihr Ergebnis wird die Antwort an Unterricks (ok: r === true) – true genau
   dann, wenn danach der Schreibbereich (bei einer Überblick-PDF aus einem Escape-Room: die Angaben bzw. der Schreibbereich) offen ist; sonst
   steht die Meldung auf der Startseite. Dieselben Funktionen nimmt auch „Zwischenstand-PDF hochladen“ (dort zählt das Ergebnis nicht). */
const fnSrc = (head) => { const a = html.indexOf(head); assert.ok(a > 0, head); return html.slice(a, html.indexOf("\n}\n", a) + 3); };
const IMPORT_SRC = fnSrc("async function importDraftPdf(file) {") + fnSrc("async function escArrive(hull, src) {") + fnSrc("async function escLoad(run) {");
function importHarness(o = {}) {
  return new Function("o", `
let screen = "screen-start";
const S = {}, ESC = { run: 0 }, CHK = { run: 0 }, LEGAL = { run: 0 }, subtle = o.noCrypto ? null : {}, els = {}, log = [];
const $ = (id) => els[id] || (els[id] = { id, textContent: "", value: "x", classList: { add() {}, remove() {} }, focus() {} });
const document = { activeElement: null };
const busy = () => {}, setStatus = () => {}, fmtDT = (t) => String(t), ttKeepOptOut = (d) => d, escCheck = () => "ok";
const showResume = () => log.push("showResume");
const escDrop = () => { ESC.run++; };
const resetStudent = () => { log.push("resetStudent"); screen = "screen-start"; };
const show = (s) => { screen = s; };
const readStartPdf = async (buf) => { log.push("read:" + buf.byteLength); if (o.readThrows) throw new Error(o.readThrows); return o.read; };
const cleanDraft = (x) => (x && Array.isArray(x.answers) ? x : null);
const fetchSheet = async (code) => { log.push("fetch:" + code); if (o.fetchError) throw o.fetchError; return { code, sheet: o.sheet }; };
const useSheet = (x) => { S.code = x.code; S.sheet = x.sheet; };
const escFromHull = () => o.escFromHull || null;
const draftRaw = async () => (o.local ? JSON.stringify(o.local) : null);
const askConfirm = (opts) => { log.push("ask:" + opts.title); if (o.onAsk) o.onAsk(ESC); return o.ask ? o.ask(opts) : Promise.resolve(true); };
const openEditor = async () => { log.push("openEditor"); if (o.editorFails) { resetStudent(); return; } screen = "screen-editor"; };
const openPerson = () => { log.push("openPerson"); screen = "screen-person"; };
const startErr = (e) => "START " + (e && e.message);
const errMsg = () => "NETZ.";
const cleanEscape = (x) => (x && typeof x.code === "string" && x.room ? x : null);
const escPerson = () => ({ complete: !!o.complete, person: { vorname: "Max", nachname: "Mu", geburtsdatum: "--05-04", klasse: "10b" } });
const PDF_MAX_BYTES = 100, PDF_TOO_BIG = "ZU GROSS", PDF_NOT_DRAFT = "KEIN ZWISCHENSTAND", ESC_PDF_BAD = "ESC KAPUTT", ESC_NEED = "ESC NÖTIG",
  NO_CRYPTO = "KEINE KRYPTO", ESC_LINK_BAD = "LINK KAPUTT", ESC_NOT_OPEN = "NICHT FREI", ESC_NO_SHEET = "KEIN BLATT", ESC_WRONG = "FALSCHER RAUM";
${IMPORT_SRC}
return { importDraftPdf, state: () => ({ screen, err: $("start-err").textContent, log, S, run: ESC.run }) };`)(o);
}
const PDF = () => new Blob(["%PDF-1.7 Zwischenstand"]);
const DRAFT = () => ({ v: 1, kind: "feibeitsblatt-draft", t: 1000, code: "K7QM4X", person: { vorname: "Uma", nachname: "Re", geburtsdatum: "--06-11", klasse: "7c" }, answers: ["a", ""] });
const SHEET = { tasks: [{}, {}], escape: null };
const tick = () => new Promise((r) => setTimeout(r, 20));

test("unterricks: importDraftPdf liefert true, sobald der Schreibbereich offen ist – sonst nicht (Meldung auf der Startseite)", async () => {
  // Zwischenstand ohne Stand auf dem Gerät: Blatt laden, Schreibbereich mit dem Stand aus der Datei
  let h = importHarness({ read: { kind: "draft", o: DRAFT() }, sheet: SHEET });
  assert.equal(await h.importDraftPdf(PDF()), true);
  assert.equal(h.state().screen, "screen-editor");
  assert.deepEqual(h.state().S.importDraft.answers, ["a", ""]);
  assert.deepEqual(h.state().log.filter((x) => /^(fetch|openEditor)/.test(x)), ["fetch:K7QM4X", "openEditor"]);
  // nicht geklappt: Ergebnis nie true, die Meldung steht auf der Startseite
  const fails = [
    [{ noCrypto: true }, /Verschlüsselung/],
    [{ size: 101 }, /^ZU GROSS$/],
    [{ read: { kind: "" } }, /^KEIN ZWISCHENSTAND$/],
    [{ readThrows: "kaputt" }, /^KEIN ZWISCHENSTAND$/],
    [{ readThrows: "escape-bad" }, /^ESC KAPUTT$/],
    [{ read: { kind: "draft", o: { kind: "feibeitsblatt-draft" } } }, /^KEIN ZWISCHENSTAND$/],
    [{ read: { kind: "draft", o: DRAFT() }, sheet: { tasks: [{}] } }, /andere Anzahl Aufgaben/],
    [{ read: { kind: "draft", o: DRAFT() }, sheet: { tasks: [{}, {}], escape: { id: "raum" } } }, /^ESC NÖTIG$/],
    [{ read: { kind: "draft", o: DRAFT() }, fetchError: Object.assign(new Error("weg"), { code: "not_found" }) }, /^START weg$/],
  ];
  for (const [o, msg] of fails) {
    h = importHarness({ sheet: SHEET, ...o });
    const r = await h.importDraftPdf(o.size ? new Blob([new Uint8Array(o.size)]) : PDF());
    assert.notEqual(r, true, JSON.stringify(o));
    assert.match(h.state().err, msg, JSON.stringify(o));
    assert.notEqual(h.state().screen, "screen-editor");
    assert.ok(!h.state().log.includes("openEditor"));
  }
  // der Schreibbereich öffnet sich nicht (openEditor bricht ab): false
  h = importHarness({ read: { kind: "draft", o: DRAFT() }, sheet: SHEET, editorFails: true });
  assert.equal(await h.importDraftPdf(PDF()), false);
  assert.equal(h.state().screen, "screen-start");
});

test("unterricks: neuerer Stand auf dem Gerät – das Ergebnis kommt erst nach der Rückfrage, true bei beiden Antworten; ein anderer Weg währenddessen → nicht true", async () => {
  const local = { v: 1, t: 2000, answers: ["a", "später auf dem Gerät"] };
  for (const [answer, imported] of [[true, true], [false, false], [null, false]]) {   // null: keine Antwort (ein anderer Dialog war offen)
    let reply;
    const h = importHarness({ read: { kind: "draft", o: DRAFT() }, sheet: SHEET, local, ask: () => new Promise((r) => { reply = r; }) });
    let done = false, result;
    const p = h.importDraftPdf(PDF()).then((r) => { done = true; result = r; });
    await tick();
    assert.ok(h.state().log.includes("ask:Neuerer Zwischenstand auf diesem Gerät"));
    assert.equal(done, false, "kein Ergebnis, solange die Rückfrage offen ist");
    assert.equal(h.state().screen, "screen-start");
    reply(answer);
    await p;
    assert.equal(result, true, String(answer));
    assert.equal(h.state().screen, "screen-editor");
    assert.equal(h.state().S.importDraft === null, !imported, String(answer));   // null = der Stand vom Gerät
  }
  // ein älterer Stand auf dem Gerät: keine Rückfrage
  let h = importHarness({ read: { kind: "draft", o: DRAFT() }, sheet: SHEET, local: { ...local, t: 500 } });
  assert.equal(await h.importDraftPdf(PDF()), true);
  assert.ok(!h.state().log.some((x) => x.startsWith("ask:")));
  // während der Rückfrage ein anderer Weg von der Startseite (Code, „Weiterschreiben“ …): nichts geöffnet, Ergebnis nicht true
  h = importHarness({ read: { kind: "draft", o: DRAFT() }, sheet: SHEET, local, onAsk: (esc) => { esc.run++; } });
  assert.notEqual(await h.importDraftPdf(PDF()), true);
  assert.ok(!h.state().log.includes("openEditor"));
});

test("unterricks: Überblick-PDF aus einem Escape-Room – true, sobald die Angaben bzw. der Schreibbereich offen sind, sonst nicht", async () => {
  const rec = (x) => ({ code: "K7QM4X", room: { id: "raum", name: "Raum" }, ...x });
  const hull = (r) => ({ kind: "feibeitsblatt-escape", v: 1, d: JSON.stringify(r), s: "0000000000000000" });
  const esc = (r, x) => importHarness({ read: { kind: "escape", o: hull(r) }, sheet: { tasks: [{}], escape: { id: "raum", name: "Raum" } }, ...x });
  // Angaben vorausgefüllt
  let h = esc(rec());
  assert.equal(await h.importDraftPdf(PDF()), true);
  assert.equal(h.state().screen, "screen-person");
  assert.deepEqual(h.state().log.filter((x) => /^(fetch|open)/.test(x)), ["fetch:K7QM4X", "openPerson"]);
  // vollständige Angaben, aber noch kein Zwischenstand mit Text: auch die Angaben
  h = esc(rec(), { complete: true, local: { v: 1, t: 1, answers: ["", " "] } });
  assert.equal(await h.importDraftPdf(PDF()), true);
  assert.equal(h.state().screen, "screen-person");
  // vorhandener Zwischenstand derselben Person: direkt in den Schreibbereich
  h = esc(rec(), { complete: true, local: { v: 1, t: 1, answers: ["Text"] } });
  assert.equal(await h.importDraftPdf(PDF()), true);
  assert.equal(h.state().screen, "screen-editor");
  // … öffnet sich der Schreibbereich nicht: false
  h = esc(rec(), { complete: true, local: { v: 1, t: 1, answers: ["Text"] }, editorFails: true });
  assert.equal(await h.importDraftPdf(PDF()), false);
  // nicht geklappt: Meldung auf der Startseite, Ergebnis nicht true
  for (const [r, x, msg] of [
    [rec({ code: "" }), {}, /^NICHT FREI$/],
    [{ room: { id: "raum" } }, {}, /^ESC KAPUTT$/],
    [rec(), { sheet: { tasks: [{}], escape: { id: "anderer-raum" } } }, /^FALSCHER RAUM$/],
    [rec(), { sheet: { tasks: [{}], escape: null } }, /^FALSCHER RAUM$/],
    [rec(), { fetchError: Object.assign(new Error("weg"), { code: "not_found" }) }, /^KEIN BLATT$/],
    [rec(), { fetchError: Object.assign(new Error("Netz"), { code: "network" }) }, /^NETZ\. Deine Daten aus dem Escape-Room sind noch da – versuche es gleich noch einmal\.$/],
  ]) {
    h = esc(r, x);
    assert.notEqual(await h.importDraftPdf(PDF()), true, JSON.stringify([r, x]));
    assert.match(h.state().err, msg);
    assert.equal(h.state().screen, "screen-start");
  }
});
