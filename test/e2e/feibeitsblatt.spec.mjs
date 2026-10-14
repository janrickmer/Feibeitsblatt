// feibeitsblatt.spec.mjs – kompletter Ablauf im echten Browser gegen den echten Worker (wrangler dev --local, lokale D1).
// Simuliert werden nur LanguageTool (page.route) und die KI (test/mock-ai.mjs als Anbieter „custom“, eingerichtet über
// die Oberfläche). Die Tests bauen aufeinander auf (eine Datenbank, eine Lehrkraft) → seriell, ein Worker.
import { test, expect } from "@playwright/test";
import { expectedResults } from "../mock-ai.mjs";
import { deriveTeacherKeys, makeEnvelope } from "../smoke.mjs";
import { MOCK_URL } from "./env.mjs";
import {
  PASTE_MSG, UNKNOWN_CODE_MSG, NO_SOLUTION_NOTE, GREEN, RED, openPage, closePage, confirmDialog, teacherLogin,
  lineHeightOf, gapAfterTask, mockState, mockReset, mockMode, d1Query, scanState,
} from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

/* ---------- Testdaten (frei erfunden) ---------- */
const PW = "Lehrkraft-Passwort 2026!";
const NEW_PW = "Neues Passwort für 2027?";
const AI_KEY = "e2e-test-key-WXYZ";
const AI_MODEL = "openai/gpt-oss-120b";
const TITLE = "Das Gewissen – Ethik";
const TASKS = [
  { text: "Erkläre, was das Gewissen ist.",
    solution: "- Innere Instanz des Menschen\n- Unterscheidet zwischen gut und böse\n- Meldet sich als schlechtes Gewissen" },
  { text: "Nenne ein Beispiel aus deinem Alltag,\nin dem sich dein Gewissen gemeldet hat.",
    solution: "- Konkrete Situation aus dem Alltag\n- Begründung, warum sich das Gewissen meldet" },
  { text: "Wie fühlst du dich, wenn du etwas falsch gemacht hast?", solution: "" },
];
const SOLUTION_LINES = TASKS.flatMap((t) => t.solution.split("\n").map((l) => l.replace(/^- /, "")).filter(Boolean));
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}$/;

// Schüler:in A: tippt Kürzel klein/groß gemischt, überarbeitet nach dem Feedback
const A = {
  input: { vorname: "max", nachname: "MU", geb: "2011-05-04", klasse: " 8b " },
  person: { vorname: "Max", nachname: "Mu", geburtsdatum: "2011-05-04", klasse: "8b" },
  lines1: ["Das Gewissn ist eine innere Instanz.", "Es unterscheidet zwischen gut und böse.", "Man hört es im Kopf."],
  line4: "Das finde ich sehr toll.",
  a2start: "Eine konkrete ", a2rest: "Situation: Ich habe meine Schwester angelogen.",
  a3: "Ich fühle mich schlecht und entschuldige mich.",
  rev1: "\nEs meldet sich als schlechtes Gewissen.",
  rev2: " Die Begründung: Lügen ist unfair.",
};
A.first = [[...A.lines1, A.line4].join("\n"), A.a2start + A.a2rest, A.a3];
A.final = [A.first[0] + A.rev1, A.first[1] + A.rev2, A.first[2]];
// LanguageTool-Attrappe: Gewissn → Gewissen, „gut und böse“ → „Gut und Böse“; Stilhinweis „sehr toll“ bleibt
const A_LT = "Das Gewissen ist eine innere Instanz.\nEs unterscheidet zwischen Gut und Böse.\nMan hört es im Kopf.\nDas finde ich sehr toll.";

// Schüler:in B: Umlaute im Kürzel, andere Klasse; gibt ohne Überarbeitung ab
const B = {
  input: { vorname: "özg", nachname: "ün", geb: "2012-01-15", klasse: "7a" },
  person: { vorname: "Özg", nachname: "Ün", geburtsdatum: "2012-01-15", klasse: "7a" },
  first: ["Das Gewissen ist eine innere Stimme.", "Keine Ahnung, ehrlich gesagt.", "Schlecht, dann rede ich darüber."],
};
B.final = B.first.slice();

const S = { code: "", shown: "", sheetBodies: [] };   // gemeinsamer Zustand der Tests
const fmtDe = (iso) => iso.split("-").reverse().join(".");

/* ---------- Hilfen für den Schreibbereich ---------- */
async function enterCode(page, typed) {
  await page.fill("#code-input", typed);
  await page.press("#code-input", "Enter");
}
async function fillPerson(page, input) {
  await page.fill("#p-vorname", input.vorname);
  await page.fill("#p-nachname", input.nachname);
  await page.fill("#p-geb", input.geb);
  await page.fill("#p-klasse", input.klasse);
  await page.click("#p-btn");
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
}
async function typeAt(page, sel, text) {
  await page.click(sel);
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text);
}
async function requestFeedback(page) {
  await expect(page.locator("#submit-btn")).toBeDisabled();
  await page.click("#fb-btn");
  await confirmDialog(page, "KI-Feedback anfordern?");
  await expect(page.locator("#t-1 .fbbox")).toBeVisible({ timeout: 60_000 });
}
async function submit(page) {
  await expect(page.locator("#submit-btn")).toBeEnabled();
  await page.click("#submit-btn");
  await confirmDialog(page, "Jetzt abgeben?");
  await expect(page.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await expect(page.locator("#done-time")).toHaveText(/^Abgegeben am [A-Za-z]+, \d\d\.\d\d\.\d{4} um \d\d:\d\d Uhr\.$/);
}
// Feedback-Box einer Aufgabe auslesen
const feedbackOf = (page, n) => page.$eval("#t-" + n + " .fbbox", (box) => {
  const list = (sel) => { const ul = box.querySelector(sel); return ul ? Array.from(ul.children).map((li) => li.textContent) : []; };
  const color = (sel) => { const ul = box.querySelector(sel); return ul ? getComputedStyle(ul).color : null; };
  const note = box.querySelector(".fb-note");
  return { covered: list("ul.fb-ok"), missing: list("ul.fb-miss"), note: note ? note.textContent : undefined,
    okColor: color("ul.fb-ok"), missColor: color("ul.fb-miss") };
});
const noteOf = (r) => (r.note === undefined ? {} : { note: r.note });

/* ====================================================================== */

test("1 Lehrkraft: 1104 → Passwort festlegen → KI-Einstellungen (Mock) + Verbindungstest → Feibeitsblatt mit Code", async ({ browser, request }) => {
  const t = await openPage(browser, { clipboard: true });
  const { page } = t;

  await enterCode(page, "1104");
  await expect(page.locator("#screen-tsetup")).toHaveClass(/active/);
  await page.fill("#ts-pw1", "zu kurz"); await page.fill("#ts-pw2", "zu kurz"); await page.click("#ts-btn");
  await expect(page.locator("#ts-err")).toHaveText("Das Passwort muss mindestens 10 Zeichen lang sein.");
  await page.fill("#ts-pw1", PW); await page.fill("#ts-pw2", PW + "x"); await page.click("#ts-btn");
  await expect(page.locator("#ts-err")).toHaveText("Die beiden Passwörter stimmen nicht überein.");
  await page.fill("#ts-pw2", PW); await page.click("#ts-btn");
  await expect(page.locator("#screen-teacher")).toHaveClass(/active/, { timeout: 60_000 });
  await expect(page.locator("#tv-overview h1")).toHaveText("Lehrkräfte-Übersicht");
  await expect(page.locator("#t-aiwarn")).toBeVisible();
  await expect(page.locator("#t-sheets-body")).toContainText("Noch keine Feibeitsblätter");

  // Die Einrichtung geht nur einmal (409), und die Tür liefert jetzt die KDF-Parameter fürs Anmelden
  const again = await request.post("/api/teacher/setup", { data: { doorCode: "1104", authKey: "x" } });
  expect(again.status()).toBe(409);
  expect((await again.json()).code).toBe("already_setup");
  const door = await (await request.post("/api/teacher/door", { data: { doorCode: "1104" } })).json();
  expect(door).toMatchObject({ ok: true, setup: true, kdf: { iterations: 600000 } });

  // KI-Einstellungen: anderer OpenAI-kompatibler Dienst = Mock-KI
  await page.click("#t-ai");
  await expect(page.locator("#tv-ai")).toBeVisible();
  await expect(page.locator("#ai-save")).toBeEnabled();
  await expect(page.locator("#ai-prov")).toHaveValue("groq");
  await page.selectOption("#ai-prov", "custom");
  await expect(page.locator("#ai-base-field")).toBeVisible();
  await expect(page.locator('.provinfo[data-prov="custom"]')).toBeVisible();
  await page.fill("#ai-base", "http://ki.example.org/v1");
  await page.fill("#ai-model", AI_MODEL);
  await page.fill("#ai-key", AI_KEY);
  await page.click("#ai-save");
  await expect(page.locator("#ai-status")).toHaveText("Die Basis-URL muss mit https:// beginnen (http:// nur für 127.0.0.1 oder localhost).");
  await page.fill("#ai-base", MOCK_URL + "/v1/");
  await page.click("#ai-save");
  await expect(page.locator("#ai-status")).toHaveText(/^Gespeichert\. \d+ passende Modelle gefunden\./, { timeout: 30_000 });
  await expect(page.locator("#ai-status")).toHaveClass(/\bok\b/);
  await expect(page.locator("#ai-key")).toHaveValue("");
  await expect(page.locator("#ai-key-hint")).toHaveText("Gespeichert: …" + AI_KEY.slice(-4) + " – leer lassen, um ihn zu behalten.");
  await mockReset();
  await page.click("#ai-test");
  await expect(page.locator("#ai-status")).toHaveText(/^Verbindung erfolgreich: Eigener Dienst, Modell „openai\/gpt-oss-120b“\. Testantwort: „Verbindung steht\.“/, { timeout: 60_000 });
  expect((await mockState()).count).toBeGreaterThanOrEqual(1);
  await page.click("#ai-back");
  await expect(page.locator("#t-aiinfo")).toHaveText(/^KI-Feedback über Eigener Dienst \(Modell: openai\/gpt-oss-120b\)\.$/);
  await expect(page.locator("#t-aiwarn")).toBeHidden();

  // Neues Feibeitsblatt: 3 Zeilen, Musterlösung 1 per Strg+V (für die Lehrkraft erlaubt = Gegenprobe zur Sperre)
  await page.click("#t-new");
  await expect(page.locator("#tv-builder")).toBeVisible();
  await expect(page.locator("#b-rows > tr")).toHaveCount(3);
  await page.fill("#b-title", TITLE);
  await page.fill("#bq-1", TASKS[0].text);
  await page.evaluate((s) => navigator.clipboard.writeText(s), TASKS[0].solution);
  await page.click("#bs-1");
  await page.keyboard.press("Control+V");
  await expect(page.locator("#bs-1")).toHaveValue(TASKS[0].solution);
  await page.fill("#bq-2", TASKS[1].text); await page.fill("#bs-2", TASKS[1].solution);
  await page.fill("#bq-3", TASKS[2].text);
  await page.click("#b-gen");
  await expect(page.locator("#b-result")).toBeVisible();
  S.shown = (await page.locator("#b-res-code").textContent()).trim();
  expect(S.shown).toMatch(CODE_RE);
  expect(S.shown).toMatch(/[A-Z]/); expect(S.shown).toMatch(/[2-9]/);
  S.code = S.shown.replace("-", "");
  await expect(page.locator("#b-res-title")).toHaveText(TITLE);
  await page.click("#b-res-back");
  await expect(page.locator("#t-sel")).toBeVisible();
  await expect(page.locator("#t-sel-code")).toHaveText(S.shown);
  await expect(page.locator("#t-subs-sum")).toHaveText("Noch keine Abgaben.");
  const row = page.locator("#t-sheets-body tr", { hasText: S.shown });
  await expect(row.locator("td")).toHaveText([TITLE, S.shown, /\d\d\.\d\d\.\d{4}, \d\d:\d\d/, "3", "0"]);
  await page.locator("#t-sel-det summary").click();
  await expect(page.locator("#t-sel-tasks .si")).toHaveCount(3);
  await expect(page.locator("#t-sel-tasks .si").nth(2)).toContainText("– keine –");

  // Der API-Schlüssel verlässt den Server nie
  for (const r of await t.calls()) expect(r.body, r.method + " " + r.path).not.toContain(AI_KEY);
  await closePage(t);
});

test("2 Schüler:in A: Code → Angaben → Schreiben, Einfügen gesperrt, Feld wächst, LanguageTool, KI-Feedback, Überarbeiten, Abgabe", async ({ browser }) => {
  const s = await openPage(browser, { clipboard: true });
  const { page } = s;

  // Code klein, mit Bindestrich und Leerzeichen → wird normalisiert (Enter löst aus)
  await enterCode(page, " " + S.code.slice(0, 3).toLowerCase() + " - " + S.code.slice(3).toLowerCase() + " ");
  await expect(page.locator("#screen-person")).toHaveClass(/active/);
  const [lookup] = await s.calls((r) => r.path.startsWith("/api/sheet/"));
  expect(lookup.status).toBe(200);
  await expect(page.locator("#p-sheet")).toContainText(TITLE);
  await expect(page.locator("#p-sheet small")).toHaveText("Code " + S.shown + " · 3 Aufgaben");

  // Angaben: Prüfungen der Reihe nach
  const err = page.locator("#p-err");
  const tryPerson = async (sel, value, msg) => {
    if (sel) await page.fill(sel, value);
    await page.click("#p-btn");
    await expect(err).toHaveText(msg);
    await expect(page.locator("#screen-person")).toHaveClass(/active/);
  };
  const nextYear = new Date().getFullYear() + 1;
  await tryPerson(null, "", "Bitte gib die ersten drei Buchstaben deines Vornamens ein.");
  await expect(page.locator("#p-vorname")).toHaveClass(/invalid/);
  await tryPerson("#p-vorname", "M4x", "Beim Vornamen sind nur Buchstaben erlaubt.");
  await tryPerson("#p-vorname", "M", "Bitte gib die ersten drei Buchstaben deines Vornamens ein (bei kürzerem Vornamen den ganzen Vornamen).");
  await tryPerson("#p-vorname", A.input.vorname, "Bitte gib die ersten zwei Buchstaben deines Nachnamens ein.");
  await tryPerson("#p-nachname", "M1", "Beim Nachnamen sind nur Buchstaben erlaubt.");
  await tryPerson("#p-nachname", A.input.nachname, "Bitte gib dein Geburtsdatum ein.");
  await tryPerson("#p-geb", nextYear + "-01-01", "Bitte prüfe dein Geburtsdatum.");
  await tryPerson("#p-geb", "1949-12-31", "Bitte prüfe dein Geburtsdatum.");
  await tryPerson("#p-geb", A.input.geb, "Bitte gib deine Klasse ein (z. B. 8b).");
  await tryPerson("#p-klasse", "8b!", "Bitte gib deine Klasse nur mit Buchstaben und Ziffern ein (z. B. 8b).");
  await page.fill("#p-klasse", A.input.klasse);
  await page.click("#p-btn");
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);

  // Schreibbereich
  await expect(page.locator("#who-name")).toHaveText("Max · Mu · 04.05.2011 · Klasse 8b");
  await expect(page.locator("#ed-title")).toHaveText(TITLE);
  await expect(page.locator("#sheet-title")).toHaveText(TITLE);
  await expect(page.locator("#tasks .task-label")).toHaveText(["Aufgabe 1", "Aufgabe 2", "Aufgabe 3"]);
  expect(await page.locator("#q-2").textContent()).toBe(TASKS[1].text);
  expect(await page.$eval("#q-2", (e) => getComputedStyle(e).whiteSpace)).toBe("pre-wrap");
  const css = await page.$eval("#a-1", (e) => { const c = getComputedStyle(e); return { fs: c.fontSize, ov: c.overflowY, rs: c.resize, ac: e.getAttribute("autocomplete") }; });
  expect(css).toEqual({ fs: "18.5px", ov: "hidden", rs: "none", ac: "off" });
  const lh = await lineHeightOf(page, "#a-1");
  expect(Math.abs(lh - 1.78 * 18.5)).toBeLessThan(0.1);
  await expect(page.locator("#submit-btn")).toBeDisabled();
  await expect(page.locator("#submit-hint")).toHaveText("Der Button „Abgeben“ wird freigeschaltet, sobald du das KI-Feedback erhalten hast.");
  await expect(page.locator("#fb-btn")).toHaveText("KI um ein Feedback bitten");
  await expect(page.locator("#fb-btn")).toBeEnabled();
  const aiProvider = JSON.parse(lookup.body).sheet.aiProvider;
  expect(aiProvider).toMatch(/^127\.0\.0\.1:\d+$/);
  const privacy = page.locator("#privacy");
  await expect(privacy).toContainText("ohne Namenskürzel, Geburtsdatum und Klasse");
  await expect(privacy).toContainText("„" + aiProvider + "“");
  await expect(privacy).toContainText("speichert selbst nichts davon");
  await expect(privacy).toContainText("LanguageTool");
  expect(await privacy.evaluate((e) => getComputedStyle(e).color)).toBe("rgb(111, 103, 90)");

  // Abstand zur nächsten Aufgabe: eine Leerzeile
  expect(Math.abs((await gapAfterTask(page, 1)) - lh)).toBeLessThan(1);

  // Tippen: drei Zeilen passen ins Feld, die vierte vergrößert es um genau eine Zeile und schiebt Aufgabe 2 und 3 nach unten
  await page.click("#a-1");
  await page.keyboard.type(A.lines1.join("\n"));
  const geo = () => page.evaluate(() => {
    const a = document.getElementById("a-1"), top = a.getBoundingClientRect().top;
    return { h: a.offsetHeight, sh: a.scrollHeight, ch: a.clientHeight,
      l2: document.getElementById("l-2").getBoundingClientRect().top - top, l3: document.getElementById("l-3").getBoundingClientRect().top - top };
  });
  const g3 = await geo();
  await page.keyboard.type("\n" + A.line4);
  const g4 = await geo();
  const grow = g4.h - g3.h;
  expect(grow).toBeGreaterThanOrEqual(lh - 1.5);
  expect(grow).toBeLessThanOrEqual(lh + 1.5);
  expect(Math.abs((g4.l2 - g3.l2) - grow)).toBeLessThan(1.01);
  expect(Math.abs((g4.l3 - g3.l3) - grow)).toBeLessThan(1.01);
  expect(g4.sh).toBeLessThanOrEqual(g4.ch + 1);   // kein innerer Scrollbereich
  expect(Math.abs((await gapAfterTask(page, 1)) - lh)).toBeLessThan(1);
  expect(await page.inputValue("#a-1")).toBe(A.first[0]);

  // Einfügen gesperrt: Strg+V mit gefüllter Zwischenablage
  const CLIP = "Kopierter Text aus dem Internet, den ich nicht selbst geschrieben habe.";
  await page.evaluate((c) => navigator.clipboard.writeText(c), CLIP);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(CLIP);
  await page.click("#a-2");
  await page.keyboard.type(A.a2start);
  await page.keyboard.press("Control+V");
  await expect(page.locator("#pe-2")).toHaveText(PASTE_MSG);
  expect(await page.inputValue("#a-2")).toBe(A.a2start);
  // synthetisches paste, dragover/drop, beforeinput insertFromPaste/-Drop und der Sprung-Fallback
  const synth = await page.$eval("#a-2", (ta) => {
    const pe = document.getElementById("pe-2"), res = {};
    const fire = (name, ev) => { pe.textContent = ""; const notCancelled = ta.dispatchEvent(ev); res[name] = { cancelled: !notCancelled || ev.defaultPrevented, warned: pe.textContent !== "" }; };
    const dt = () => { const d = new DataTransfer(); d.setData("text/plain", "Fremder Text aus einer anderen Quelle"); return d; };
    fire("paste", new ClipboardEvent("paste", { clipboardData: dt(), bubbles: true, cancelable: true }));
    fire("dragover", new DragEvent("dragover", { dataTransfer: dt(), bubbles: true, cancelable: true }));
    fire("drop", new DragEvent("drop", { dataTransfer: dt(), bubbles: true, cancelable: true }));
    fire("beforeinputPaste", new InputEvent("beforeinput", { inputType: "insertFromPaste", data: "x", bubbles: true, cancelable: true }));
    fire("beforeinputDrop", new InputEvent("beforeinput", { inputType: "insertFromDrop", data: "x", bubbles: true, cancelable: true }));
    const prev = ta.value;
    pe.textContent = "";
    ta.value = prev + "Das wurde irgendwie hineinkopiert, ohne zu tippen.";
    ta.dispatchEvent(new InputEvent("input", { inputType: "", bubbles: true }));
    res.fallback = { reverted: ta.value === prev, warned: pe.textContent !== "" };
    res.value = ta.value;
    return res;
  });
  for (const k of ["paste", "drop", "beforeinputPaste", "beforeinputDrop"]) expect(synth[k], k).toEqual({ cancelled: true, warned: true });
  expect(synth.dragover.cancelled, "dragover").toBe(true);
  expect(synth.fallback).toEqual({ reverted: true, warned: true });
  expect(synth.value).toBe(A.a2start);
  // echtes Ziehen von markiertem Text (Aufgabenstellung) ins Feld: Das Feld ist kein Ablageziel (dropEffect „none“)
  await page.evaluate(() => {
    window.__drag = [];
    for (const type of ["dragstart", "dragover", "drop"]) document.addEventListener(type, (e) => window.__drag.push(type + ":" + (e.target.id || e.target.nodeName)), true);
    const r = document.createRange(); r.selectNodeContents(document.getElementById("q-2")); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  });
  const from = await page.locator("#q-2").boundingBox(), to = await page.locator("#a-2").boundingBox();
  await page.mouse.move(from.x + 30, from.y + 10); await page.mouse.down();
  await page.mouse.move(to.x + 200, to.y + 20, { steps: 12 }); await page.mouse.up();
  const drag = await page.evaluate(() => window.__drag);
  expect(drag.some((d) => d.startsWith("dragstart:")), JSON.stringify(drag)).toBe(true);
  expect(drag).toContain("dragover:a-2");
  expect(await page.inputValue("#a-2")).toBe(A.a2start);
  // selbst weitertippen geht
  await typeAt(page, "#a-2", A.a2rest);
  await typeAt(page, "#a-3", A.a3);
  for (let i = 0; i < 3; i++) expect(await page.inputValue("#a-" + (i + 1))).toBe(A.first[i]);

  // Rechtschreibung und Grammatik (LanguageTool-Attrappe)
  await expect(page.locator("#t-1 .ltbtn")).toHaveText("Rechtschreibung und Grammatik prüfen");
  await page.click("#t-1 .ltbtn");
  const out = page.locator("#t-1 .lt-out");
  await expect(out).toBeVisible();
  expect(s.lt).toHaveLength(1);
  expect(s.lt[0].method).toBe("POST");
  expect(s.lt[0].url).toBe("https://api.languagetool.org/v2/check");
  expect(s.lt[0].params).toMatchObject({ text: A.first[0], language: "de-DE", enabledRules: "GERMAN_WORD_REPEAT_RULE" });
  expect(s.lt[0].headers.authorization).toBeUndefined();
  expect(s.lt[0].headers.referer).toBeUndefined();
  expect(await out.locator(".lt-text").textContent()).toBe(A_LT);
  await expect(out.locator(".lt-text mark")).toHaveText(["Gewissen", "Gut und Böse"]);
  expect(await out.locator(".lt-text").evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeLessThanOrEqual(15);
  const note = out.locator(".lt-note");
  await expect(note).toContainText("Dies ist die Antwort einer KI (LanguageTool). Sie kann selbst Fehler machen. Nutze sie, um Rechtschreibung und Grammatik deines eigenen Textes zu überarbeiten – übernimm nichts ungeprüft.");
  expect(await note.evaluate((e) => { const c = getComputedStyle(e); return [c.color, c.fontSize]; })).toEqual(["rgb(111, 103, 90)", "12px"]);
  const link = note.locator('a[href^="https://languagetool.org"]');
  await expect(link).toBeVisible();
  expect(await link.getAttribute("rel") || "").not.toContain("nofollow");
  expect(await page.inputValue("#a-1")).toBe(A.first[0]);   // das Feld selbst bleibt unverändert
  expect(Math.abs((await gapAfterTask(page, 1)) - lh)).toBeLessThan(1);

  // KI-Feedback (eine Anfrage an die KI, nur Aufgaben mit Musterlösung, keine Personendaten)
  await expect(page.locator("#submit-btn")).toBeDisabled();
  await mockReset();
  await requestFeedback(page);
  const fbReq = await s.calls((r) => r.path === "/api/feedback");
  expect(fbReq).toHaveLength(1);
  expect(fbReq[0].status).toBe(200);
  const sent = JSON.parse(fbReq[0].reqBody);
  expect(Object.keys(sent).sort()).toEqual(["answers", "code"]);
  expect(sent).toEqual({ code: S.code, answers: A.first });
  const ms = await mockState();
  expect(ms.count).toBe(1);
  const prompt = JSON.stringify(ms.requests[0].messages);
  expect(prompt).toContain("innere Instanz");
  expect(prompt).not.toContain(A.a3);                                   // Aufgabe ohne Musterlösung geht nicht an die KI
  for (const p of ["2011-05-04", "04.05.2011", "8b", "Max"]) expect(prompt).not.toContain(p);

  const exp = expectedResults(TASKS, A.first);
  expect(exp[0].missing).toEqual(["Meldet sich als schlechtes Gewissen"]);   // Plausibilität der Testdaten
  for (let n = 1; n <= 3; n++) {
    const f = await feedbackOf(page, n);
    expect({ covered: f.covered, missing: f.missing, ...noteOf(f) }, "Aufgabe " + n).toEqual(exp[n - 1]);
    if (f.covered.length) expect(f.okColor).toBe(GREEN);
    if (f.missing.length) expect(f.missColor).toBe(RED);
  }
  await expect(page.locator("#t-1 .fb-sub.fb-ok")).toHaveText("Angesprochen");
  await expect(page.locator("#t-1 .fb-sub.fb-miss")).toHaveText("Noch nicht angesprochen");
  await expect(page.locator("#t-3 .fb-note")).toHaveText(NO_SOLUTION_NOTE);
  await expect(page.locator("#fb-btn")).toBeDisabled();
  await expect(page.locator("#fb-btn")).toHaveText("KI-Feedback erhalten");
  await expect(page.locator("#revise-hint")).toBeVisible();
  await expect(page.locator("#revise-hint")).toHaveText(/^Lies das KI-Feedback zu jeder Aufgabe und überarbeite jetzt deine Antworten/);
  await expect(page.locator("#submit-btn")).toBeEnabled();
  expect(Math.abs((await gapAfterTask(page, 1)) - lh)).toBeLessThan(1);

  // Überarbeiten → die Prüfung von Aufgabe 1 bezieht sich jetzt auf einen älteren Stand
  await typeAt(page, "#a-1", A.rev1);
  await typeAt(page, "#a-2", A.rev2);
  await expect(page.locator("#t-1 .lt-out")).toHaveClass(/stale/);
  await expect(page.locator("#t-1 .lt-stale")).toBeVisible();
  for (let i = 0; i < 3; i++) expect(await page.inputValue("#a-" + (i + 1))).toBe(A.final[i]);

  // Abgabe: nur {code, envelope}, alles verschlüsselt; Entwurf auf dem Gerät gelöscht
  await submit(page);
  const sub = await s.calls((r) => r.path === "/api/submit");
  expect(sub).toHaveLength(1);
  expect(sub[0].status).toBe(200);
  const sb = JSON.parse(sub[0].reqBody);
  expect(Object.keys(sb).sort()).toEqual(["code", "envelope"]);
  expect(Object.keys(sb.envelope).sort()).toEqual(["ct", "ek", "iv", "v"]);
  for (const p of ["Gewissn", "Schwester", "Max", "2011-05-04", "vorname"]) expect(sub[0].reqBody).not.toContain(p);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("feibeitsblatt:draft:")))).toEqual([]);
  S.sheetBodies.push(lookup.body);
  await closePage(s);
});

test("3 Schüler:in B (andere Angaben) gibt ebenfalls ab – vorher schlägt eine KI-Anfrage fehl", async ({ browser }) => {
  const s = await openPage(browser);
  const { page } = s;
  await enterCode(page, S.shown);
  await expect(page.locator("#screen-person")).toHaveClass(/active/);
  await fillPerson(page, B.input);
  await expect(page.locator("#who-name")).toHaveText("Özg · Ün · 15.01.2012 · Klasse 7a");
  for (let i = 0; i < 3; i++) await typeAt(page, "#a-" + (i + 1), B.first[i]);

  // KI lehnt ab (Mock: HTTP 401) → kurze Meldung ohne Interna, Feedback erneut möglich, „Abgeben“ bleibt gesperrt
  await mockMode("401");
  try {
    await page.click("#fb-btn");
    await confirmDialog(page, "KI-Feedback anfordern?");
    await expect(page.locator("#fb-status")).toHaveClass(/\bbad\b/, { timeout: 60_000 });
  } finally { await mockMode("ok"); }
  await expect(page.locator("#fb-status")).toHaveText("Die KI-Rückmeldung ist gerade nicht verfügbar. Bitte versuche es später noch einmal oder frag deine Lehrkraft.");
  const failed = await s.calls((r) => r.path === "/api/feedback");
  expect(failed.map((r) => r.status)).toEqual([502]);
  expect(JSON.parse(failed[0].body)).toMatchObject({ ok: false, code: "ai_error" });
  expect(failed[0].body).not.toContain(AI_KEY);
  await expect(page.locator("#fb-btn")).toBeEnabled();
  await expect(page.locator("#submit-btn")).toBeDisabled();
  await expect(page.locator("#t-1 .fbbox")).toBeHidden();
  expect(await page.$eval("#a-1", (e) => e.readOnly)).toBe(false);

  await requestFeedback(page);
  const exp = expectedResults(TASKS, B.first);
  for (let n = 1; n <= 3; n++) {
    const f = await feedbackOf(page, n);
    expect({ covered: f.covered, missing: f.missing, ...noteOf(f) }, "Aufgabe " + n).toEqual(exp[n - 1]);
  }
  await submit(page);
  S.sheetBodies.push(...(await s.calls((r) => r.path.startsWith("/api/sheet/"))).map((r) => r.body));
  await closePage(s);
});

test("4 Lehrkraft: Anmelden → Abgaben eingeklappt (4 Spalten, sortiert) → Aufklappen zeigt erste und überarbeitete Fassung", async ({ browser }) => {
  const t = await openPage(browser);
  const { page } = t;
  await teacherLogin(page, PW);
  const row = page.locator("#t-sheets-body tr", { hasText: S.shown });
  await expect(row.locator("td").nth(4)).toHaveText("2");
  await row.click();
  await expect(page.locator("#t-subs-sum")).toHaveText("2 Abgaben");

  // Kopf: schmale Pfeilspalte + genau vier sichtbare Datenspalten
  const heads = await page.$$eval("#t-subs thead th", (ths) => ths.map((th) => ({ text: th.textContent.trim(), arrow: th.classList.contains("arrowcol"),
    srOnly: !!th.querySelector(".sr-only"), w: th.getBoundingClientRect().width })));
  expect(heads).toHaveLength(5);
  expect(heads[0].arrow && heads[0].srOnly).toBe(true);
  expect(heads[0].w).toBeLessThan(60);
  expect(heads.slice(1).map((h) => h.text)).toEqual(["Kürzel Nachname", "Kürzel Vorname", "Geburtstag", "Klasse"]);

  // eingeklappt und sortiert nach Klasse, Nachname, Vorname (B: 7a vor A: 8b, obwohl A zuerst abgegeben hat)
  const mains = page.locator("#t-subs-body tr.main");
  await expect(mains).toHaveCount(2);
  for (let i = 0; i < 2; i++) await expect(mains.nth(i)).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#t-subs-body tr.details:visible")).toHaveCount(0);
  const cells = (i) => mains.nth(i).locator("td:not(.arrowcol)");
  await expect(cells(0)).toHaveText([B.person.nachname, B.person.vorname, fmtDe(B.person.geburtsdatum), B.person.klasse]);
  await expect(cells(1)).toHaveText([A.person.nachname, A.person.vorname, fmtDe(A.person.geburtsdatum), A.person.klasse]);
  await expect(page.locator("#t-subs-body")).not.toContainText(A.first[1]);   // Lösungen erst nach dem Aufklappen

  // A aufklappen: je Aufgabe Spalte 1 = erste Eingabe (vor dem Feedback), Spalte 2 = überarbeitete Eingabe
  await mains.nth(1).click();
  await expect(mains.nth(1)).toHaveAttribute("aria-expanded", "true");
  const det = page.locator("#t-subs-body tr.details:visible");
  await expect(det).toHaveCount(1);
  await expect(det.locator(".dmeta")).toHaveText(/^Abgegeben am \d\d\.\d\d\.\d{4}, \d\d:\d\d · KI-Feedback am \d\d\.\d\d\.\d{4}, \d\d:\d\d$/);
  const tasks = det.locator(".dtask");
  await expect(tasks).toHaveCount(3);
  const expA = expectedResults(TASKS, A.first);
  for (let i = 0; i < 3; i++) {
    const dt = tasks.nth(i);
    await expect(dt.locator(".task-label")).toHaveText("Aufgabe " + (i + 1));
    expect(await dt.locator(".dtask-text").textContent()).toBe(TASKS[i].text);
    await expect(dt.locator("table.cmp thead th")).toHaveText(["Erste Eingabe (vor dem KI-Feedback)", "Eingabe nach dem KI-Feedback"]);
    const td = dt.locator("table.cmp tbody td");
    await expect(td).toHaveCount(2);
    expect(await td.nth(0).textContent()).toBe(A.first[i]);
    if (A.final[i] === A.first[i]) expect(await td.nth(1).textContent()).toBe(A.final[i] + "(unverändert)");
    else expect(await td.nth(1).textContent()).toBe(A.final[i]);
    // angezeigtes KI-Feedback klein darunter (grün/rot)
    const fb = dt.locator(".dfb");
    if (expA[i].note) await expect(fb.locator(".fb-note")).toHaveText(expA[i].note);
    for (const c of expA[i].covered) await expect(fb.locator("ul.fb-ok")).toContainText(c);
    for (const m of expA[i].missing) await expect(fb.locator("ul.fb-miss")).toContainText(m);
  }
  expect(await tasks.nth(0).locator(".dfb ul.fb-ok").evaluate((e) => getComputedStyle(e).color)).toBe(GREEN);
  expect(await tasks.nth(0).locator(".dfb ul.fb-miss").evaluate((e) => getComputedStyle(e).color)).toBe(RED);

  // Alle aufklappen / zuklappen; B: erste = letzte Fassung
  await page.click("#t-expand-all");
  await expect(page.locator("#t-subs-body tr.details:visible")).toHaveCount(2);
  await expect(page.locator("#t-expand-all")).toHaveText("Alle zuklappen");
  const bFirst = page.locator("#t-subs-body tr.details").nth(0).locator(".dtask").nth(0).locator("table.cmp tbody td");
  expect(await bFirst.nth(0).textContent()).toBe(B.first[0]);
  expect(await bFirst.nth(1).textContent()).toBe(B.final[0] + "(unverändert)");
  await page.click("#t-expand-all");
  await expect(page.locator("#t-subs-body tr.details:visible")).toHaveCount(0);
  await closePage(t);
});

test("5 Datenbank enthält keinen Klartext der Abgaben; /api/sheet liefert nie Musterlösungen", async ({ request }) => {
  // gespeicherte Umschläge (wrangler d1 execute auf derselben lokalen D1)
  const rows = await d1Query("SELECT id, sheet_code, received_at, envelope FROM submissions ORDER BY id");
  expect(rows).toHaveLength(2);
  const forbidden = [...A.first, ...A.final, ...B.first].flatMap((a) => a.split("\n")).concat(
    ["Gewissn", "Schwester angelogen", "Lügen ist unfair", "innere Stimme", "Keine Ahnung",
      '"Max"', '"Mu"', '"8b"', '"Özg"', '"Ün"', '"7a"', "Özg", "2011-05-04", "2012-01-15", "vorname", "nachname", "geburtsdatum", "klasse", "person"]);
  for (const r of rows) {
    expect(r.sheet_code).toBe(S.code);
    expect(Object.keys(r).sort()).toEqual(["envelope", "id", "received_at", "sheet_code"]);
    const env = JSON.parse(r.envelope);
    expect(Object.keys(env).sort()).toEqual(["ct", "ek", "iv", "v"]);
    expect(env.v).toBe(1);
    for (const k of ["ct", "ek", "iv"]) expect(env[k]).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    for (const f of forbidden) expect(r.envelope, "Klartext „" + f + "“ in der Datenbank").not.toContain(f);
  }
  const sheets = await d1Query("SELECT code, title, tasks FROM sheets");
  expect(sheets.map((s) => s.code)).toEqual([S.code]);
  const settings = await d1Query("SELECT key, value FROM settings ORDER BY key");
  expect(settings.map((s) => s.key)).toEqual(["ai", "teacher"]);
  const ai = JSON.parse(settings[0].value);
  expect(ai.apiKey).toBeUndefined();                // mit SETTINGS_SECRET verschlüsselt
  expect(Object.keys(ai.apiKeyEnc).sort()).toEqual(["ct", "iv"]);
  expect(settings[0].value).not.toContain(AI_KEY);
  expect(settings[1].value).not.toContain(PW);

  // Rohbytes aller Dateien des lokalen Zustands (inkl. WAL); Gegenprobe: Aufgabentext und Umschlag sind auffindbar
  const control = [TASKS[0].text, '"ek":"', '"apiKeyEnc"'];
  const scan = await scanState([...control, ...forbidden.filter((f) => f.length >= 6 || /[^A-Za-z0-9]/.test(f)), AI_KEY, PW]);
  expect(scan.files).toBeGreaterThan(0);
  for (const c of control) expect(scan.count[c], "Gegenprobe „" + c + "“").toBeGreaterThan(0);
  for (const [needle, n] of Object.entries(scan.count)) if (!control.includes(needle)) expect(n, "Klartext „" + needle + "“ im Zustandsordner").toBe(0);

  // öffentlicher Abruf (auch mit Kleinbuchstaben/Bindestrich): nur Aufgabentexte, nie Musterlösungen
  for (const c of [S.code, S.shown.toLowerCase(), S.shown]) {
    const res = await request.get("/api/sheet/" + encodeURIComponent(c));
    expect(res.status()).toBe(200);
    const body = await res.text();
    const j = JSON.parse(body);
    expect(Object.keys(j.sheet).sort()).toEqual(["aiProvider", "code", "publicKey", "tasks", "title"]);
    expect(j.sheet.tasks).toEqual(TASKS.map((t) => ({ text: t.text })));
    S.sheetBodies.push(body);
  }
  expect(S.sheetBodies.length).toBeGreaterThanOrEqual(5);
  for (const body of S.sheetBodies) for (const line of SOLUTION_LINES) expect(body).not.toContain(line);
});

test("6 Falscher Türcode → allgemeine Meldung; falsches Passwort → Fehler", async ({ browser }) => {
  const p = await openPage(browser);
  const { page } = p;
  await enterCode(page, "1105");
  await expect(page.locator("#start-err")).toHaveText(UNKNOWN_CODE_MSG);   // identisch zu einem unbekannten Blatt-Code
  expect((await p.calls((r) => r.path === "/api/teacher/door")).map((r) => r.status)).toEqual([403]);
  await expect(page.locator("#screen-start")).toHaveClass(/active/);
  await enterCode(page, "ABC-234");
  await expect(page.locator("#start-err")).toHaveText(UNKNOWN_CODE_MSG);
  expect((await p.calls((r) => r.path === "/api/sheet/ABC234")).map((r) => r.status)).toEqual([404]);

  await enterCode(page, "1104");
  await expect(page.locator("#screen-tlogin")).toHaveClass(/active/);
  await page.fill("#tl-pw", "Das ist falsch 123");
  await page.click("#tl-btn");
  await expect(page.locator("#tl-err")).toHaveText("Passwort falsch.", { timeout: 30_000 });
  await expect(page.locator("#screen-tlogin")).toHaveClass(/active/);
  expect((await p.calls((r) => r.path === "/api/teacher/login")).map((r) => r.status)).toEqual([401]);
  await closePage(p);
});

test("7 Alle Abgaben löschen → Tabelle leer; Feibeitsblatt löschen → Code ungültig", async ({ browser, request }) => {
  const t = await openPage(browser);
  const { page } = t;
  await teacherLogin(page, PW);
  await page.locator("#t-sheets-body tr", { hasText: S.shown }).click();
  await expect(page.locator("#t-subs-sum")).toHaveText("2 Abgaben");
  await expect(page.locator("#t-del-subs")).toBeEnabled();
  // „Ganz unten“: die Lösch-Schaltflächen stehen unter der Abgaben-Tabelle
  const yTable = (await page.locator("#t-subs").boundingBox()).y, yDel = (await page.locator("#t-del-subs").boundingBox()).y;
  expect(yDel).toBeGreaterThan(yTable);

  await page.click("#t-del-subs");
  const text = await confirmDialog(page, "Alle Abgaben löschen?");
  expect(text).toContain("Alle 2 Abgaben");
  await expect(page.locator("#t-del-status")).toHaveText("2 Abgaben gelöscht.");
  await expect(page.locator("#t-subs-sum")).toHaveText("Noch keine Abgaben.");
  await expect(page.locator("#t-subs-body tr.main")).toHaveCount(0);
  await expect(page.locator("#t-subs-body")).toHaveText("Zu diesem Feibeitsblatt ist noch nichts abgegeben worden.");
  await expect(page.locator("#t-del-subs")).toBeDisabled();
  await expect(page.locator("#t-sheets-body tr", { hasText: S.shown }).locator("td").nth(4)).toHaveText("0");
  expect(await d1Query("SELECT COUNT(*) AS n FROM submissions")).toEqual([{ n: 0 }]);

  await page.click("#t-del-sheet");
  await confirmDialog(page, "Feibeitsblatt löschen?");
  await expect(page.locator("#t-list-status")).toHaveText("Feibeitsblatt gelöscht.");
  await expect(page.locator("#t-sel")).toBeHidden();
  await expect(page.locator("#t-sheets-body")).toContainText("Noch keine Feibeitsblätter");
  await closePage(t);

  const s = await openPage(browser);
  await enterCode(s.page, S.shown);
  await expect(s.page.locator("#start-err")).toHaveText(UNKNOWN_CODE_MSG);
  await expect(s.page.locator("#screen-start")).toHaveClass(/active/);
  await closePage(s);
  const res = await request.get("/api/sheet/" + S.code);
  expect(res.status()).toBe(404);
  expect(await res.json()).toMatchObject({ ok: false, code: "not_found", error: UNKNOWN_CODE_MSG });
});

test("8 Passwort ändern: neues Passwort gilt, altes nicht mehr; bisherige Abgaben bleiben lesbar", async ({ browser, request }) => {
  const t = await openPage(browser);
  const { page } = t;
  await teacherLogin(page, PW);

  // neues Blatt (Titel leer → „Feibeitsblatt vom …“) und eine Abgabe vor dem Passwortwechsel
  await page.click("#t-new");
  await page.fill("#bs-2", "Musterlösung ohne Aufgabe");
  await page.click("#b-gen");
  await expect(page.locator("#b-err")).toHaveText("Zeile 2: Bitte eine Aufgabenstellung eintragen.");
  await expect(page.locator("#bq-2")).toHaveClass(/invalid/);
  await page.fill("#bs-2", "");
  await page.fill("#bq-1", "Beschreibe deinen Schulweg.");
  await page.click("#b-gen");
  await expect(page.locator("#b-result")).toBeVisible();
  await expect(page.locator("#b-res-title")).toHaveText(/^Feibeitsblatt vom \d\d\.\d\d\.\d{4}$/);
  const shown2 = (await page.locator("#b-res-code").textContent()).trim();
  expect(shown2).toMatch(CODE_RE);
  const code2 = shown2.replace("-", "");
  const sheet = (await (await request.get("/api/sheet/" + code2)).json()).sheet;
  const payload = { v: 1, sheetCode: code2, sheetTitle: sheet.title, person: { vorname: "Kim", nachname: "Wo", geburtsdatum: "2010-02-03", klasse: "9c" },
    answers: [{ first: "Ich fahre mit dem Rad.", final: "Ich fahre jeden Tag mit dem Rad zur Schule." }],
    feedback: [{ covered: [], missing: [], note: NO_SOLUTION_NOTE }], feedbackAt: new Date().toISOString(), submittedAt: new Date().toISOString() };
  const sub = await request.post("/api/submit", { data: { code: code2, envelope: await makeEnvelope(sheet.publicKey, payload) } });
  expect(sub.status()).toBe(200);

  // Passwort ändern
  await page.click("#b-res-back");
  await page.click("#t-pw");
  await expect(page.locator("#tv-pw")).toBeVisible();
  await page.fill("#pw-1", NEW_PW); await page.fill("#pw-2", NEW_PW + "!");
  await page.click("#pw-btn");
  await expect(page.locator("#pw-err")).toHaveText("Die beiden Passwörter stimmen nicht überein.");
  await page.fill("#pw-2", NEW_PW);
  await page.click("#pw-btn");
  await expect(page.locator("#pw-status")).toHaveText("Das Passwort wurde geändert. Melden Sie sich künftig mit dem neuen Passwort an.", { timeout: 30_000 });
  await page.click("#pw-back");
  await page.click("#t-logout");
  await expect(page.locator("#screen-start")).toHaveClass(/active/);

  // altes Passwort → abgelehnt
  await enterCode(page, "1104");
  await expect(page.locator("#screen-tlogin")).toHaveClass(/active/);
  await page.fill("#tl-pw", PW);
  await page.click("#tl-btn");
  await expect(page.locator("#tl-err")).toHaveText("Passwort falsch.", { timeout: 30_000 });
  await page.click("#tl-back");
  await expect(page.locator("#screen-start")).toHaveClass(/active/);

  // neues Passwort → angemeldet, die vorher abgegebene Abgabe wird entschlüsselt
  await teacherLogin(page, NEW_PW);
  await page.locator("#t-sheets-body tr", { hasText: shown2 }).click();
  await expect(page.locator("#t-subs-sum")).toHaveText("1 Abgabe");
  await expect(page.locator("#t-subs-body tr.main td:not(.arrowcol)")).toHaveText(["Wo", "Kim", "03.02.2010", "9c"]);
  await page.locator("#t-subs-body tr.main").click();
  const td = page.locator("#t-subs-body tr.details .dtask table.cmp tbody td");
  expect(await td.nth(0).textContent()).toBe(payload.answers[0].first);
  expect(await td.nth(1).textContent()).toBe(payload.answers[0].final);

  // auch auf API-Ebene: alter Anmeldeschlüssel 401, neuer gilt
  const kdf = (await (await request.post("/api/teacher/door", { data: { doorCode: "1104" } })).json()).kdf;
  const keysNew = await deriveTeacherKeys(NEW_PW, kdf);
  expect((await request.post("/api/teacher/login", { headers: { Authorization: "Bearer " + keysNew.authKey } })).status()).toBe(200);
  await closePage(t);
});

test("9 Sperre nach Fehlversuchen: Passwort (auth) und Türcode (door)", async ({ browser, request }) => {
  // Passwort: falsche Anmeldeschlüssel, bis der Server sperrt (höchstens 10 Fehlversuche je Stunde)
  const wrong = Buffer.alloc(32, 7).toString("base64");
  const auth = [];
  for (let i = 0; i < 12 && !auth.includes(429); i++)
    auth.push((await request.post("/api/teacher/login", { headers: { Authorization: "Bearer " + wrong } })).status());
  expect(auth.at(-1)).toBe(429);
  expect(auth.filter((s) => s === 401).length).toBeLessThanOrEqual(10);
  const p = await openPage(browser);
  const { page } = p;
  await enterCode(page, "1104");
  await page.fill("#tl-pw", NEW_PW);   // auch das richtige Passwort ist jetzt gesperrt
  await page.click("#tl-btn");
  await expect(page.locator("#tl-err")).toHaveText(/^Zu viele Fehlversuche\. Bitte versuchen Sie es in etwa (5\d|60) Minuten erneut\.$/, { timeout: 30_000 });
  await page.click("#tl-back");

  // Türcode: falsche Codes, bis gesperrt; danach öffnet auch 1104 nicht mehr
  const door = [];
  for (let i = 0; i < 12 && !door.includes(429); i++)
    door.push((await request.post("/api/teacher/door", { data: { doorCode: "9999" } })).status());
  expect(door.at(-1)).toBe(429);
  expect(door.filter((s) => s === 403).length).toBeLessThanOrEqual(10);
  const r = await request.post("/api/teacher/door", { data: { doorCode: "1104" } });
  expect(r.status()).toBe(429);
  expect(Number(r.headers()["retry-after"])).toBeGreaterThan(3000);
  await enterCode(page, "1104");
  await expect(page.locator("#start-err")).toHaveText(/^Zu viele Fehlversuche\. Ein neuer Versuch ist in etwa (5\d|60) Minuten möglich\.$/);
  await expect(page.locator("#screen-start")).toHaveClass(/active/);
  await closePage(p);
});
