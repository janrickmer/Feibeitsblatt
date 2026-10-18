// feibeitsblatt.spec.mjs – kompletter Ablauf im echten Browser gegen den echten Worker (wrangler dev --local, lokale D1).
// Simuliert werden nur LanguageTool (page.route) und die KI (test/mock-ai.mjs als Anbieter „custom“, eingerichtet über
// die Oberfläche). Die Tests bauen aufeinander auf (eine Datenbank, eine Lehrkraft) → seriell, ein Worker.
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { inflateSync, deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { expectedResults } from "../mock-ai.mjs";
import { deriveTeacherKeys, makeEnvelope } from "../smoke.mjs";
import { makePng } from "../png.mjs";
import { MOCK_URL, BASE_URL } from "./env.mjs";
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
  input: { vorname: "max", nachname: "MU", geb: "2009-05-04", klasse: " 8b " },
  person: { vorname: "Max", nachname: "Mu", geburtsdatum: "2009-05-04", klasse: "8b" },
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
// Schüler:in C: Die KI fällt zweimal aus → Abgabe ohne KI-Feedback (sortiert als Letzte: Klasse 9c)
const C = {
  input: { vorname: "lea", nachname: "sc", geb: "2012-06-30", klasse: "9 c" },   // „9 c“ → Klasse 9c
  person: { vorname: "Lea", nachname: "Sc", geburtsdatum: "2012-06-30", klasse: "9c" },
  first: ["Das Gewissen sagt mir, was richtig ist.", "Ich habe einmal gelogen und mich danach schlecht gefühlt.", "Ich schäme mich dann."],
};
// Schüler:in D: holt nur das KI-Feedback und gibt nicht ab → „Erstversuch ohne Überarbeitung“ (orange in der Lehrkraft-Ansicht)
const D = {
  input: { vorname: "tom", nachname: "ze", geb: "2010-02-02", klasse: "9c" },
  person: { vorname: "Tom", nachname: "Ze", geburtsdatum: "2010-02-02", klasse: "9c" },
  first: ["Das Gewissen ist so etwas wie ein innerer Richter.", "Ich habe beim Test abgeschrieben und mich danach mies gefühlt.", "Ich will es dann wiedergutmachen."],
};
// Schüler:in E: die KI bleibt ausgelastet → bricht das Warten zweimal ab, darf dann ohne KI-Feedback abgeben (gibt nicht ab)
const E = {
  input: { vorname: "ida", nachname: "kr", geb: "2011-09-09", klasse: "8b" },
  first: ["Das Gewissen ist wie eine innere Stimme.", "Ich habe gelogen.", "Nicht gut."],
};
const RECIPIENT_SUFFIX = " (Betreiber und Sitz: von der Lehrkraft zu prüfen)";   // Empfänger-Label des eigenen Dienstes
const ORANGE = "rgb(184, 92, 0)";   // .st-first
const ATTEMPT = /^[0-9a-f]{16}$/;

const S = { code: "", shown: "", sheetBodies: [], imgs: [], material: [], pdf: null };   // gemeinsamer Zustand der Tests (imgs: Bilder, material: Material je Aufgabe, pdf: PDF-Datei zu Aufgabe 2)
// PDF-Datei der Lehrkraft zu Aufgabe 2 (600 KB → zwei Teile beim Hochladen und Herunterladen)
const PDF_BUF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(600 * 1024, 0x41), Buffer.from("\n%%EOF\n")]);
const PDF_NAME = "Arbeitsblatt- Zelle.pdf";   // aus „Arbeitsblatt: Zelle.pdf“ – Doppelpunkt ist in Dateinamen nicht erlaubt
// Material, das Test 1 im Editor erzeugt (Aufgabe 1 getippt und formatiert, Aufgabe 2 als HTML eingefügt)
const LINK_URL = BASE_URL + "/api/health";
const LINK_URL2 = LINK_URL + "?v=2";
const MATERIAL_1 = [
  [{ t: "Lies zuerst den " }, { t: "Textauszug", f: "b" }, { t: " und dann " }, { t: "diese Seite", f: "i" }, { t: ":" }],
  [{ t: "Hinweis:", f: "u" }, { t: " " }, { t: "Quelle 2", h: LINK_URL2 }, { t: " – Verlag" }],
];
const MATERIAL_2 = [[{ t: "Siehe " }, { t: "Kapitel 3", f: "b" }, { t: " und böse sowie " }, { t: "gut", h: "https://example.org/x" }, { t: "." }]];
const fmtDe = (iso) => iso.split("-").reverse().join(".");

/* ---------- Hilfen für den Schreibbereich ---------- */
async function enterCode(page, typed) {
  await page.fill("#code-input", typed);
  await page.press("#code-input", "Enter");
}
async function fillPerson(page, input) {
  await expect(page.locator("#p-vorname")).toBeFocused();   // die Seite setzt den Fokus kurz nach dem Öffnen; danach stiehlt sie ihn nicht mehr
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

  // lokal (127.0.0.1) spricht die Seite ihren eigenen Ursprung an; nur außerhalb von workers.dev/localhost die Worker-Adresse
  expect(await page.evaluate(() => [window.FEIBEITSBLATT_API, /^https:\/\/[a-z0-9.-]+\.workers\.dev$/.test(window.FEIBEITSBLATT_WORKER)])).toEqual(["", true]);
  expect(await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content)).toContain("connect-src 'self' https://api.languagetool.org " + await page.evaluate(() => window.FEIBEITSBLATT_WORKER));
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

  // Reserve-KI: eigener Block mit eigenem Schlüssel, Test über ?which=reserve, „entfernen“ räumt wieder auf
  await expect(page.locator("#ai2-key-hint")).toHaveText("Keine Reserve-KI eingerichtet.");
  await expect(page.locator("#ai2-test")).toBeDisabled();
  await expect(page.locator("#ai2-remove")).toBeDisabled();
  await page.selectOption("#ai2-prov", "custom");
  await expect(page.locator("#ai2-base-field")).toBeVisible();
  await page.fill("#ai2-base", MOCK_URL + "/v1");
  await page.fill("#ai2-model", AI_MODEL);
  await page.click("#ai2-save");
  await expect(page.locator("#ai2-status")).toHaveText("Bitte den API-Schlüssel der Reserve eintragen.");
  await page.fill("#ai2-key", "e2e-reserve-key-5555");
  await page.click("#ai2-save");
  const rtext = await confirmDialog(page, "Weiteren KI-Empfänger hinzufügen?");   // jede Reserve = weiterer Empfänger: ausdrückliche Bestätigung
  expect(rtext).toContain("„127.0.0.1:"); expect(rtext).toContain("Datenschutzbeauftragte");
  await expect(page.locator("#ai2-status")).toHaveText(/^Reserve gespeichert\. \d+ passende Modelle gefunden\./, { timeout: 30_000 });
  await expect(page.locator("#ai2-key")).toHaveValue("");
  await expect(page.locator("#ai2-key-hint")).toHaveText("Gespeichert: …5555 – leer lassen, um ihn zu behalten.");
  await expect(page.locator("#ai-key-hint")).toHaveText("Gespeichert: …" + AI_KEY.slice(-4) + " – leer lassen, um ihn zu behalten.");   // erster Anbieter unberührt
  await page.click("#ai2-test");
  await expect(page.locator("#ai2-status")).toHaveText(/^Reserve erfolgreich: Eigener Dienst, Modell „openai\/gpt-oss-120b“\. Testantwort: „Verbindung steht\.“/, { timeout: 60_000 });
  await page.click("#ai-back");
  await expect(page.locator("#t-aiinfo")).toHaveText(/^KI-Feedback über Eigener Dienst \(Modell: openai\/gpt-oss-120b\)\. Reserve: Eigener Dienst \(Modell: openai\/gpt-oss-120b\)\.$/);
  await page.click("#t-ai");
  await expect(page.locator("#ai2-prov")).toHaveValue("custom");
  await page.click("#ai2-remove");
  await confirmDialog(page, "Reserve-KI entfernen?");
  await expect(page.locator("#ai2-status")).toHaveText("Reserve-KI entfernt.");
  await expect(page.locator("#ai2-key-hint")).toHaveText("Keine Reserve-KI eingerichtet.");
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

  // Material zu Aufgabe 1: tippen, fett/kursiv per Tastenkürzel, unterstrichen per Knopf, Link per Dialog
  const ed1 = page.locator("#b-rows > tr").nth(0).locator(".bmat-edit");
  await expect(ed1).toHaveAttribute("aria-label", "Material zu Aufgabe 1");
  await expect(ed1).toHaveClass(/is-empty/);
  await ed1.click();
  await page.keyboard.type("Lies zuerst den ");
  await page.keyboard.press("Control+B"); await page.keyboard.type("Textauszug"); await page.keyboard.press("Control+B");
  await page.keyboard.type(" und dann ");
  await page.keyboard.press("Control+I"); await page.keyboard.type("diese Seite"); await page.keyboard.press("Control+I");
  await page.keyboard.type(":");
  await page.keyboard.press("Enter");
  const row0 = page.locator("#b-rows > tr").nth(0);
  await row0.locator(".fmtbtn", { hasText: "U" }).click(); await page.keyboard.type("Hinweis:"); await row0.locator(".fmtbtn", { hasText: "U" }).click();
  await page.keyboard.type(" Quelle");
  for (let i = 0; i < 6; i++) await page.keyboard.press("Shift+ArrowLeft");   // „Quelle“ markieren
  await row0.locator(".fmtbtn", { hasText: "Link" }).click();
  await expect(page.locator("#linkdlg")).toHaveClass(/open/);
  await expect(page.locator("#ld-title")).toHaveText("Link einfügen");
  await expect(page.locator("#ld-text")).toHaveValue("Quelle");
  await page.fill("#ld-url", "javascript:alert(1)");
  await page.click("#ld-ok");
  await expect(page.locator("#ld-err")).toHaveText("Bitte eine gültige Adresse eingeben, z. B. https://www.beispiel.de");
  await page.fill("#ld-url", LINK_URL);
  await page.keyboard.press("Enter");
  await expect(page.locator("#linkdlg")).not.toHaveClass(/open/);
  await expect(ed1.locator("a")).toHaveText("Quelle");
  await expect(ed1.locator("b")).toHaveText("Textauszug");
  await expect(ed1).not.toHaveClass(/is-empty/);
  // Link bearbeiten: Cursor im Link → Dialog zeigt die Adresse, „Link entfernen“ steht bereit; Abbrechen ändert nichts
  await ed1.locator("a").click();
  await row0.locator(".fmtbtn", { hasText: "Link" }).click();
  await expect(page.locator("#ld-title")).toHaveText("Link bearbeiten");
  await expect(page.locator("#ld-url")).toHaveValue(LINK_URL);
  await expect(page.locator("#ld-remove")).toBeVisible();
  await page.click("#ld-cancel");
  await expect(ed1.locator("a")).toHaveCount(1);
  // Link bearbeiten („Übernehmen“): Text und Adresse ändern
  await ed1.locator("a").click();
  await row0.locator(".fmtbtn", { hasText: "Link" }).click();
  await expect(page.locator("#ld-ok")).toHaveText("Übernehmen");
  await page.fill("#ld-text", "Quelle 2"); await page.fill("#ld-url", LINK_URL2);
  await page.click("#ld-ok");
  await expect(ed1.locator("a")).toHaveText("Quelle 2");
  await expect(ed1.locator("a")).toHaveAttribute("href", LINK_URL2);
  // neuen Link ohne Markierung am Ende einfügen (Adresse ohne Schema → https://), dann wieder entfernen
  await ed1.click(); await page.keyboard.press("Control+End");
  await page.keyboard.type(" – ");
  await row0.locator(".fmtbtn", { hasText: "Link" }).click();
  await expect(page.locator("#ld-title")).toHaveText("Link einfügen");
  await expect(page.locator("#ld-text")).toHaveValue("");
  await page.fill("#ld-text", "Verlag"); await page.fill("#ld-url", "www.beispiel.de");
  await page.keyboard.press("Enter");
  await expect(ed1.locator("a")).toHaveCount(2);
  await expect(ed1.locator("a").nth(1)).toHaveAttribute("href", "https://www.beispiel.de/");
  await ed1.locator("a").nth(1).click();
  await row0.locator(".fmtbtn", { hasText: "Link" }).click();
  await expect(page.locator("#ld-url")).toHaveValue("https://www.beispiel.de/");
  await page.click("#ld-remove");
  await expect(ed1.locator("a")).toHaveCount(1);
  await expect(ed1).toContainText("Hinweis: Quelle 2 – Verlag");
  // Tab bleibt im Link-Dialog (erst den Anfangsfokus des Dialogs abwarten, dann vom letzten Knopf weiter)
  await row0.locator(".fmtbtn", { hasText: "Link" }).click();
  await expect(page.locator("#ld-text")).toBeFocused();
  await page.locator("#ld-ok").focus(); await page.keyboard.press("Tab");
  await expect(page.locator("#ld-text")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#ld-ok")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#linkdlg")).not.toHaveClass(/open/);
  // Werkzeugleiste: Zustand der Formatknöpfe folgt dem Cursor
  await ed1.locator("b").click();
  await expect(row0.locator('.fmtbtn[aria-pressed="true"]')).toHaveCount(1);
  await expect(row0.locator(".fmtbtn", { hasText: "F" })).toHaveAttribute("aria-pressed", "true");
  // Material zu Aufgabe 2 aus der Zwischenablage (HTML): nur fett/kursiv/unterstrichen und http(s)-Links bleiben
  const ed2 = page.locator("#b-rows > tr").nth(1).locator(".bmat-edit");
  await ed2.click();
  await ed2.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData("text/html", '<b style="font-weight:normal" id="docs-internal-guid-1"><p style="color:red">Siehe <span style="font-weight:700">Kapitel 3</span> und <a href="javascript:alert(1)">böse</a> sowie <a href="https://example.org/x">gut</a>.</p></b><script>window.__pasted = 1</script><img src="https://example.org/t.png">');
    dt.setData("text/plain", "Siehe Kapitel 3 und böse sowie gut.");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(ed2.locator("b")).toHaveText("Kapitel 3");
  await expect(ed2.locator("a")).toHaveCount(1);
  await expect(ed2.locator("a")).toHaveAttribute("href", "https://example.org/x");
  await expect(ed2.locator("img, script")).toHaveCount(0);
  expect(await page.evaluate(() => window.__pasted)).toBeUndefined();

  // Bilder zu Aufgabe 1: ein großes PNG wird auf 1600 px verkleinert, ein „Foto“ wird als JPEG neu kodiert; je Bild die Anzeigeart
  const row1 = page.locator("#b-rows > tr").nth(0);
  await expect(row1.locator(".bimg-add")).toHaveText("+ Bild hinzufügen");
  await row1.locator("input.bimg-input").setInputFiles([
    { name: "skizze.png", mimeType: "image/png", buffer: makePng(2400, 1200, (x, y) => [x & 255, (y >> 2) & 255, 60]) },
    { name: "foto.jpg", mimeType: "image/jpeg", buffer: makePng(300, 450, [30, 90, 160]) },
  ]);
  await expect(row1.locator(".bimg")).toHaveCount(2, { timeout: 30_000 });
  await expect(row1.locator(".bimg").nth(0).locator(".bimg-meta")).toHaveText(/^1600 × 800 px · \d+ KB$/);
  await expect(row1.locator(".bimg").nth(1).locator(".bimg-meta")).toHaveText(/^300 × 450 px · \d+ KB$/);
  await expect(row1.locator(".bimg img").nth(0)).toHaveAttribute("src", /^blob:/);
  await expect(row1.locator(".bimg-mode").nth(0)).toHaveValue("thumb");
  await row1.locator(".bimg-mode").nth(1).selectOption("inline");
  await row1.locator(".bimg-alt").nth(0).fill("Skizze: Zelle mit Zellkern");
  // unlesbare Datei → Meldung, kein Eintrag; Grenze: höchstens 5 je Aufgabe
  await row1.locator("input.bimg-input").setInputFiles([{ name: "text.heic", mimeType: "image/heic", buffer: Buffer.from("kein Bild") }]);
  await expect(row1.locator(".bimg-stat")).toContainText("„text.heic“: Das Bild kann der Browser nicht lesen");
  await expect(row1.locator(".bimg")).toHaveCount(2);
  await row1.locator("input.bimg-input").setInputFiles(Array.from({ length: 4 }, (_, i) => ({ name: `b${i}.png`, mimeType: "image/png", buffer: makePng(8, 8, [i * 40, 0, 0]) })));
  await expect(row1.locator(".bimg")).toHaveCount(5, { timeout: 30_000 });
  await expect(row1.locator(".bimg-stat")).toContainText("Nur noch 3 Bilder möglich (höchstens 5 je Aufgabe)");
  await expect(row1.locator(".bimg-add")).toBeDisabled();
  for (let i = 0; i < 3; i++) await row1.locator(".bimg .iconbtn.x").nth(2).click();   // die drei kleinen wieder entfernen
  await expect(row1.locator(".bimg")).toHaveCount(2);
  await expect(row1.locator(".bimg-add")).toBeEnabled();
  await expect(page.locator("#b-rows > tr").nth(1).locator(".bimg")).toHaveCount(0);
  // PDF-Datei zu Aufgabe 2: keine PDF → Meldung; eine echte PDF wird angenommen (Name ohne Doppelpunkt); höchstens 3 je Aufgabe
  const row2 = page.locator("#b-rows > tr").nth(1);
  await expect(row2.locator(".bfile-add")).toHaveText("+ PDF-Datei hinzufügen");
  await row2.locator("input.bfile-input").setInputFiles([{ name: "text.pdf", mimeType: "application/pdf", buffer: Buffer.from("kein PDF") }]);
  await expect(row2.locator(".bfile-stat")).toContainText("„text.pdf“: Das ist keine PDF-Datei");
  await expect(row2.locator(".bfile")).toHaveCount(0);
  await row2.locator("input.bfile-input").setInputFiles([{ name: "Arbeitsblatt: Zelle.pdf", mimeType: "application/pdf", buffer: PDF_BUF }]);
  await expect(row2.locator(".bfile")).toHaveCount(1);
  await expect(row2.locator(".bfile-name")).toHaveText(PDF_NAME);
  await expect(row2.locator(".bfile .bimg-meta")).toHaveText("600 KB");
  await row2.locator("input.bfile-input").setInputFiles(Array.from({ length: 3 }, (_, i) => ({ name: `k${i}.pdf`, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%k\n") })));
  await expect(row2.locator(".bfile")).toHaveCount(3);
  await expect(row2.locator(".bfile-stat")).toContainText("Nur noch 2 PDF-Dateien möglich (höchstens 3 je Aufgabe)");
  await expect(row2.locator(".bfile-add")).toBeDisabled();
  for (let i = 0; i < 2; i++) await row2.locator(".bfile .iconbtn.x").nth(1).click();   // die zwei kleinen wieder entfernen
  await expect(row2.locator(".bfile")).toHaveCount(1);
  await expect(row2.locator(".bfile-add")).toBeEnabled();
  await expect(row1.locator(".bfile")).toHaveCount(0);
  // der erste Bild-Upload scheitert (simulierter Serverfehler) → das zweite Bild derselben Aufgabe wird zurückgestellt;
  // von der PDF-Datei kommt Teil 1 an, Teil 2 scheitert. Das Blatt ist trotzdem angelegt, „Fehlende Dateien erneut
  // hochladen“ holt beide Bilder in der richtigen Reihenfolge nach und setzt die PDF-Datei beim fehlenden Teil fort
  let failOnce = true;
  await page.route("**/api/teacher/sheets/*/images", (route) => {
    if (!failOnce) return route.continue();
    failOnce = false;
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Testfehler", code: "server_error" }) });
  });
  let failPartOnce = true;
  await page.route("**/api/teacher/sheets/*/files", (route) => {
    if (!failPartOnce || JSON.parse(route.request().postData() || "{}").n !== 1) return route.continue();
    failPartOnce = false;
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Testfehler", code: "server_error" }) });
  });
  await page.click("#b-gen");
  await expect(page.locator("#b-result")).toBeVisible();
  await expect(page.locator("#b-res-img")).toHaveText("3 Dateien konnten nicht gespeichert werden (Aufgabe 1, Bild 1: Testfehler; Aufgabe 1, Bild 2: zurückgestellt; Aufgabe 2, PDF-Datei 1: Testfehler). Das Feibeitsblatt selbst ist angelegt.", { timeout: 60_000 });
  await expect(page.locator("#b-res-retry")).toBeVisible();
  await expect(page.locator("#b-res-retry")).toHaveText("Fehlende Dateien erneut hochladen");
  await expect(page.locator("#b-res-back")).toBeEnabled();
  await page.click("#b-res-retry");
  S.shown = (await page.locator("#b-res-code").textContent()).trim();
  expect(S.shown).toMatch(CODE_RE);
  expect(S.shown).toMatch(/[A-Z]/); expect(S.shown).toMatch(/[2-9]/);
  S.code = S.shown.replace("-", "");
  await expect(page.locator("#b-res-title")).toHaveText(TITLE);
  const created = (await t.calls((r) => r.method === "POST" && r.path === "/api/teacher/sheets"))[0];
  const sentTasks = JSON.parse(created.reqBody).tasks;
  expect(sentTasks.map((x) => x.material)).toEqual([MATERIAL_1, MATERIAL_2, undefined]);   // Modell statt HTML
  expect(created.reqBody).not.toContain("<");
  S.material = [MATERIAL_1, MATERIAL_2, []];
  await expect(page.locator("#b-res-img")).toHaveText("2 Bilder und 1 PDF-Datei sind gespeichert.", { timeout: 60_000 });
  await expect(page.locator("#b-res-retry")).toBeHidden();
  await page.unroute("**/api/teacher/sheets/*/images");
  await page.unroute("**/api/teacher/sheets/*/files");
  const allUps = await t.calls((r) => r.method === "POST" && r.path.endsWith("/images"));
  expect(allUps.map((r) => r.status)).toEqual([500, 200, 200]);
  const ups = allUps.filter((r) => r.status === 200);
  expect(JSON.parse(allUps[0].reqBody).id).toBe(JSON.parse(ups[0].reqBody).id);   // Wiederholung mit derselben Kennung
  for (const [i, u] of ups.entries()) {
    const req = JSON.parse(u.reqBody), res = JSON.parse(u.body);
    expect(Object.keys(req).sort()).toEqual(["alt", "data", "id", "mode", "task"]);   // kein Dateiname, nichts Persönliches
    expect(req).toMatchObject({ task: 1, mode: i === 0 ? "thumb" : "inline", alt: i === 0 ? "Skizze: Zelle mit Zellkern" : "" });
    expect(req.id).toMatch(/^[0-9a-f]{16}$/);
    expect(req.data).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(res.image).toMatchObject({ id: req.id, task: 1, pos: i, mode: req.mode, alt: req.alt, w: i === 0 ? 1600 : 300, h: i === 0 ? 800 : 450 });
    expect(res.image.bytes).toBeLessThanOrEqual(500 * 1024);
    S.imgs.push(res.image);
  }
  expect(S.imgs[1].mime).toBe("image/jpeg");
  // die PDF-Datei ging in zwei Teilen (je ≤ 512 KB) an den Server; nach dem Fehler bei Teil 2 setzt die Wiederholung genau
  // dort fort (Teil 1 wird nicht noch einmal gesendet); erst der zweite Teil macht die Datei vollständig
  const fAll = await t.calls((r) => r.method === "POST" && r.path.endsWith("/files"));
  expect(fAll.map((r) => [JSON.parse(r.reqBody).n, r.status])).toEqual([[0, 200], [1, 500], [1, 200]]);
  const fUps = fAll.filter((r) => r.status === 200);
  for (const [n, u] of fUps.entries()) {
    const req = JSON.parse(u.reqBody), res = JSON.parse(u.body);
    expect(Object.keys(req).sort()).toEqual(["bytes", "chunks", "data", "id", "n", "name", "task"]);
    expect(req).toMatchObject({ task: 2, name: PDF_NAME, bytes: PDF_BUF.length, chunks: 2, n });
    expect(req.id).toMatch(/^[0-9a-f]{16}$/);
    expect(Buffer.from(req.data, "base64").length).toBe(n === 0 ? 512 * 1024 : PDF_BUF.length - 512 * 1024);
    expect(res.file).toMatchObject({ id: req.id, task: 2, n, chunks: 2, complete: n === 1 });
    expect(res.existing).toBeUndefined();
    if (n === 0) S.pdf = { id: res.file.id, name: res.file.name, bytes: res.file.bytes };
  }
  expect(S.pdf).toEqual({ id: expect.stringMatching(/^[0-9a-f]{16}$/), name: PDF_NAME, bytes: PDF_BUF.length });
  await page.click("#b-res-back");
  await expect(page.locator("#t-sel")).toBeVisible();
  await expect(page.locator("#t-sel-code")).toHaveText(S.shown);
  await expect(page.locator("#t-subs-sum")).toHaveText("Noch keine Abgaben.");
  const row = page.locator("#t-sheets-body tr", { hasText: S.shown });
  await expect(row.locator("td")).toHaveText([TITLE, S.shown, /\d\d\.\d\d\.\d{4}, \d\d:\d\d/, "3", "0"]);
  await page.locator("#t-sel-det summary").click();
  await expect(page.locator("#t-sel-tasks .si")).toHaveCount(3);
  await expect(page.locator("#t-sel-tasks .si").nth(2)).toContainText("– keine –");
  const si0 = page.locator("#t-sel-tasks .si").nth(0);
  await expect(si0.locator(".material p")).toHaveCount(2);
  await expect(si0.locator(".material a")).toHaveAttribute("target", "_blank");
  await expect(page.locator("#t-sel-tasks .si").nth(2).locator(".material")).toHaveCount(0);
  await expect(si0.locator(".timgs .thumbbtn")).toHaveCount(2);
  await expect(si0.locator(".timgs .thumbbtn img").nth(0)).toHaveAttribute("src", /^data:image\/(png|jpeg);base64,/, { timeout: 15_000 });
  expect(await si0.locator(".timgs .thumbbtn img").nth(0).evaluate((e) => [e.naturalWidth, e.naturalHeight])).toEqual([1600, 800]);
  await expect(si0.locator(".timgs .thumbbtn").nth(0)).toHaveAttribute("title", "Miniatur rechts (Klick vergrößert) – Skizze: Zelle mit Zellkern");
  await expect(si0.locator(".timgs .thumbbtn").nth(1)).toHaveAttribute("title", "Groß zwischen Aufgabe und Antwortfeld");
  await expect(page.locator("#t-sel-tasks .si").nth(1).locator(".timgs")).toHaveCount(0);
  // die PDF-Datei erscheint bei Aufgabe 2 als Download-Button (Name und Größe), sonst nirgends
  const si1 = page.locator("#t-sel-tasks .si").nth(1);
  await expect(si1.locator(".tfiles .filebtn")).toHaveCount(1);
  await expect(si1.locator(".tfiles .filebtn .filebtn-name")).toHaveText(PDF_NAME);
  await expect(si1.locator(".tfiles .filebtn .filebtn-meta")).toHaveText("PDF, 600 KB · herunterladen");
  await expect(page.locator("#t-sel-tasks .si").nth(0).locator(".tfiles")).toHaveCount(0);
  await expect(page.locator("#t-sel-tasks .si").nth(2).locator(".tfiles")).toHaveCount(0);

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
  await expect(page.locator("#who-name")).toHaveText("Max · Mu · 04.05.2009 · Klasse 8b");
  await expect(page.locator("#ed-title")).toHaveText(TITLE);
  await expect(page.locator("#sheet-title")).toHaveText(TITLE);
  await expect(page.locator("#tasks .task-label")).toHaveText(["Aufgabe 1", "Aufgabe 2", "Aufgabe 3"]);
  expect(await page.locator("#q-2").textContent()).toBe(TASKS[1].text);
  expect(await page.$eval("#q-2", (e) => getComputedStyle(e).whiteSpace)).toBe("pre-wrap");
  const css = await page.$eval("#a-1", (e) => { const c = getComputedStyle(e); return { fs: c.fontSize, ov: c.overflowY, rs: c.resize, ac: e.getAttribute("autocomplete") }; });
  expect(css).toEqual({ fs: "18.5px", ov: "hidden", rs: "none", ac: "off" });
  const lh = await lineHeightOf(page, "#a-1");
  expect(Math.abs(lh - 1.78 * 18.5)).toBeLessThan(0.1);

  // Material der Lehrkraft unter der Aufgabenstellung: Formatierung erhalten, Links öffnen in neuem Tab (ohne Opener)
  const mat1 = page.locator("#t-1 .task-material");
  await expect(mat1.locator(".sublabel")).toHaveText("Material");
  await expect(mat1.locator(".material p")).toHaveCount(2);
  await expect(mat1.locator(".material p").nth(0)).toHaveText("Lies zuerst den Textauszug und dann diese Seite:");
  await expect(mat1.locator("b")).toHaveText("Textauszug"); await expect(mat1.locator("i")).toHaveText("diese Seite"); await expect(mat1.locator("u")).toHaveText("Hinweis:");
  const matLink = mat1.locator("a");
  expect(await matLink.evaluate((e) => e.firstChild.textContent)).toBe("Quelle 2");
  await expect(matLink.locator(".sr-only")).toHaveText("(öffnet in neuem Tab)");
  await expect(matLink).toHaveAttribute("href", LINK_URL2);
  await expect(matLink).toHaveAttribute("target", "_blank");
  expect(await matLink.getAttribute("rel")).toMatch(/noopener/);
  const [popup] = await Promise.all([page.context().waitForEvent("page"), matLink.click()]);
  await popup.waitForLoadState();
  expect(popup.url()).toBe(LINK_URL2);
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await popup.close();
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);   // das Blatt bleibt offen
  await expect(page.locator("#t-2 .task-material a")).toHaveAttribute("href", "https://example.org/x");
  await expect(page.locator("#t-2 .task-material")).toContainText("Siehe Kapitel 3 und böse sowie gut");
  await expect(page.locator("#t-3 .task-material")).toHaveCount(0);
  expect(JSON.parse(lookup.body).sheet.tasks.map((x) => x.material)).toEqual(S.material);
  expect(lookup.body).not.toContain("<b>");

  // PDF-Datei der Lehrkraft unter Aufgabe 2: Klick lädt sie in zwei Teilen und speichert sie unter ihrem Namen (Inhalt gleich)
  await expect(page.locator("#t-1 .task-files, #t-3 .task-files")).toHaveCount(0);
  const fileBtn = page.locator("#t-2 .task-files .filebtn");
  await expect(fileBtn).toHaveCount(1);
  await expect(page.locator("#t-2 .task-files .sublabel")).toHaveText("Material zum Herunterladen");
  await expect(fileBtn).toHaveAttribute("aria-label", `${PDF_NAME} (PDF, 600 KB) herunterladen – Datei zu Aufgabe 2`);
  await expect(fileBtn.locator(".filebtn-name")).toHaveText(PDF_NAME);
  expect(await s.calls((r) => r.path.includes("/files/"))).toEqual([]);   // vor dem Klick wird nichts geladen
  // erster Klick scheitert (simulierter Serverfehler) → „erneut versuchen“, auch für Screenreader; der zweite Klick lädt
  await page.route("**/api/sheet/*/files/**", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Testfehler", code: "server_error" }) }));
  await fileBtn.click();
  await expect(fileBtn).toHaveClass(/failed/);
  await expect(fileBtn.locator(".filebtn-meta")).toHaveText("konnte nicht geladen werden – erneut versuchen");
  await expect(fileBtn).toHaveAttribute("aria-label", `${PDF_NAME} konnte nicht geladen werden, erneut versuchen – Datei zu Aufgabe 2`);
  await page.unroute("**/api/sheet/*/files/**");
  const [fdl] = await Promise.all([page.waitForEvent("download"), fileBtn.click()]);
  expect(fdl.suggestedFilename()).toBe(PDF_NAME);
  expect(Buffer.compare(await readFile(await fdl.path()), PDF_BUF)).toBe(0);
  await expect(fileBtn).not.toHaveClass(/loading|failed/);
  await expect(fileBtn.locator(".filebtn-meta")).toHaveText("PDF, 600 KB · herunterladen");
  await expect(fileBtn).toHaveAttribute("aria-label", `${PDF_NAME} (PDF, 600 KB) herunterladen – Datei zu Aufgabe 2`);
  const fGets = await s.calls((r) => r.path.includes("/files/"));
  expect(fGets.map((r) => [r.method, r.status, r.path.endsWith("/files/" + S.pdf.id), r.query])).toEqual([["GET", 500, true, ""], ["GET", 200, true, ""], ["GET", 200, true, "?part=1"]]);
  expect(JSON.parse(lookup.body).sheet.tasks.map((x) => x.files)).toEqual([[], [S.pdf], []]);

  // Bilder der Lehrkraft: Miniatur rechts neben Aufgabe 1 und Antwortfeld, das zweite größer zwischen Aufgabenstellung und Antwortfeld
  const t1 = page.locator("#t-1");
  await expect(t1).toHaveClass(/has-thumbs/);
  await expect(t1.locator(".task-thumbs .thumbbtn")).toHaveCount(1);
  await expect(t1.locator(".task-body .task-figs .figbtn")).toHaveCount(1);
  const thumbImg = t1.locator(".task-thumbs .thumbbtn img"), figImg = t1.locator(".task-figs .figbtn img");
  await expect(thumbImg).toHaveAttribute("src", /^data:image\/(png|jpeg);base64,/, { timeout: 15_000 });
  await expect(figImg).toHaveAttribute("src", /^data:image\/jpeg;base64,/, { timeout: 15_000 });
  await expect(thumbImg).toHaveAttribute("alt", "Skizze: Zelle mit Zellkern");            // Bildbeschreibung der Lehrkraft
  await expect(figImg).toHaveAttribute("alt", "Bild 2 zu Aufgabe 1");                      // ohne Beschreibung: Standardtext
  await expect(t1.locator(".task-thumbs .thumbbtn")).toHaveAttribute("aria-label", "Skizze: Zelle mit Zellkern – vergrößern");
  await expect(t1.locator(".task-thumbs .thumbbtn")).toBeEnabled();
  await expect(t1.locator(".task-thumbs .thumbbtn .spinner")).toHaveCount(0);
  expect(await thumbImg.evaluate((e) => [e.naturalWidth, e.naturalHeight, Math.round(e.getBoundingClientRect().width)])).toEqual([1600, 800, 110]);
  const [qBox, figBox, aBox1, thBox, aBox2] = await Promise.all(["#q-1", "#t-1 .task-figs .figbtn img", "#a-1", "#t-1 .task-thumbs", "#a-2"].map((sel) => page.locator(sel).boundingBox()));
  expect(figBox.height).toBeLessThanOrEqual(300);                        // 300 × 450 → auf 300 px Höhe skaliert …
  expect(Math.round(figBox.width)).toBeGreaterThanOrEqual(199); expect(Math.round(figBox.width)).toBeLessThanOrEqual(201);   // … also 200 px breit
  expect(thBox.x).toBeGreaterThan(aBox1.x + aBox1.width - 1);           // Miniatur rechts neben dem Antwortfeld …
  expect(thBox.y).toBeLessThan(qBox.y + qBox.height);                    // … auf Höhe der Aufgabenstellung
  expect(aBox2.width - aBox1.width).toBeGreaterThan(100);                // Aufgabe 2 ohne Bilder nutzt die volle Breite
  expect(figBox.y).toBeGreaterThanOrEqual(qBox.y + qBox.height - 1);     // Reihenfolge: Aufgabenstellung → Bild → Antwortfeld
  expect(aBox1.y).toBeGreaterThanOrEqual(figBox.y + figBox.height - 1);
  await expect(page.locator("#t-2 .thumbbtn, #t-2 .figbtn, #t-3 .thumbbtn, #t-3 .figbtn")).toHaveCount(0);
  // Frage und Antwortteil bleiben direkt untereinander (die Miniaturspalte erzeugt keinen Leerraum im Raster)
  const [qArea, bodyArea] = await Promise.all(["#t-1 .task-q", "#t-1 .task-body"].map((sel) => page.locator(sel).boundingBox()));
  expect(bodyArea.y - (qArea.y + qArea.height)).toBeLessThan(10);
  // schmaler Bildschirm: Miniaturen als Reihe zwischen Aufgabenstellung und Antwortfeld, Antwortfeld in voller Breite
  await page.setViewportSize({ width: 400, height: 800 });
  const [mq, mth, ma1, ma2] = await Promise.all(["#q-1", "#t-1 .task-thumbs", "#a-1", "#a-2"].map((sel) => page.locator(sel).boundingBox()));
  expect(mth.y).toBeGreaterThanOrEqual(mq.y + mq.height - 1);
  expect(ma1.y).toBeGreaterThanOrEqual(mth.y + mth.height - 1);
  expect(Math.abs(ma1.width - ma2.width)).toBeLessThan(1);
  await page.setViewportSize({ width: 1280, height: 800 });
  // Klick auf die Miniatur vergrößert (mit Bildunterschrift); Esc schließt und gibt den Fokus zurück; Klick ins große Bild schließt ebenfalls
  await t1.locator(".task-thumbs .thumbbtn").click();
  await expect(page.locator("#lightbox")).toBeVisible();
  await expect(page.locator("#lb-img")).toHaveAttribute("src", /^data:image\//);
  await expect(page.locator("#lb-img")).toHaveAttribute("alt", "Skizze: Zelle mit Zellkern");
  await expect(page.locator("#lb-cap")).toHaveText("Skizze: Zelle mit Zellkern");
  await expect(page.locator("#lb-close")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#lightbox")).toBeHidden();
  await expect(t1.locator(".task-thumbs .thumbbtn")).toBeFocused();
  await t1.locator(".task-figs .figbtn").click();
  await expect(page.locator("#lightbox")).toBeVisible();
  await page.locator("#lb-img").click();
  await expect(page.locator("#lightbox")).toBeHidden();
  // Bilddaten kommen nur über den Bild-Endpunkt (Base64), nicht im Blatt-JSON
  expect(lookup.body.length).toBeLessThan(20_000);
  expect(JSON.parse(lookup.body).sheet.tasks[0].images.map((m) => m.id)).toEqual(S.imgs.map((m) => m.id));
  expect((await s.calls((r) => /\/api\/sheet\/[^/]+\/images\//.test(r.path))).map((r) => r.status)).toEqual([200, 200]);
  await expect(page.locator("#submit-btn")).toBeDisabled();
  await expect(page.locator("#submit-hint")).toHaveText("Der Button „Abgeben“ wird freigeschaltet, sobald du das KI-Feedback erhalten hast.");
  await expect(page.locator("#fb-btn")).toHaveText("KI um ein Feedback bitten");
  await expect(page.locator("#fb-btn")).toBeEnabled();
  const aiProvider = JSON.parse(lookup.body).sheet.aiProvider;
  expect(aiProvider).toMatch(/^127\.0\.0\.1:\d+$/);
  const privacy = page.locator("#privacy");
  await expect(privacy).toContainText("ohne Namenskürzel, Geburtsdatum und Klasse");
  await expect(privacy).toContainText("„" + aiProvider + RECIPIENT_SUFFIX + "“");   // Empfänger mit Betreiber-Hinweis
  await expect(privacy).toContainText("wiederholt diese Seite die Anfrage automatisch (bis zu 5 Versuche");
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

  // Rechtschreibung und Grammatik (LanguageTool-Attrappe): A ist 17 → Button da, aber erst nach Altersbestätigung
  await expect(page.locator("#t-1 .ltbtn")).toHaveText("Rechtschreibung und Grammatik prüfen");
  await expect(page.locator(".ltbtn")).toHaveCount(3);
  await expect(page.locator(".lt-off")).toHaveCount(0);
  await page.click("#t-1 .ltbtn");
  await expect(page.locator("#dlg-ok")).toHaveText("Ich bin mindestens 16 Jahre alt – prüfen");
  await expect(page.locator("#dlg-cancel")).toHaveText("Nicht prüfen");
  const consent = await confirmDialog(page, "Rechtschreibung und Grammatik prüfen", false);   // erst ablehnen
  for (const p of ["LanguageTool", "Learneo, Inc., USA", "ab 16 Jahren", "mindestens 16 Jahre alt", "solange dieses Feibeitsblatt geöffnet ist"]) expect(consent).toContain(p);
  await expect(page.locator("#t-1 .ltstat:not(.lt-off)")).toHaveText("Ohne Bestätigung wird nichts an LanguageTool gesendet.");
  await expect(page.locator("#t-1 .lt-out")).toBeHidden();
  expect(s.lt).toHaveLength(0);                                   // ohne Bestätigung geht nichts raus
  await page.click("#t-1 .ltbtn");
  await confirmDialog(page, "Rechtschreibung und Grammatik prüfen");   // jetzt bestätigen
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
  // zweite Prüfung in derselben Sitzung: keine erneute Bestätigung (gleicher Text → aus dem Zwischenspeicher)
  await page.click("#t-1 .ltbtn");
  await expect(page.locator("#dlg")).not.toHaveClass(/open/);
  await expect(out).toBeVisible();
  expect(s.lt).toHaveLength(1);

  // KI-Feedback (eine Anfrage an die KI, nur Aufgaben mit Musterlösung, keine Personendaten)
  await expect(page.locator("#submit-btn")).toBeDisabled();
  await mockReset();
  await requestFeedback(page);
  const fbReq = await s.calls((r) => r.path === "/api/feedback");
  expect(fbReq).toHaveLength(1);
  expect(fbReq[0].status).toBe(200);
  const sent = JSON.parse(fbReq[0].reqBody);
  expect(Object.keys(sent).sort()).toEqual(["answers", "code", "recipients"]);   // recipients = Empfänger, über die informiert wurde
  expect(sent).toEqual({ code: S.code, answers: A.first, recipients: ["custom:" + aiProvider] });
  const ms = await mockState();
  expect(ms.count).toBe(1);
  const prompt = JSON.stringify(ms.requests[0].messages);
  expect(prompt).toContain("innere Instanz");
  expect(prompt).not.toContain(A.a3);                                   // Aufgabe ohne Musterlösung geht nicht an die KI
  for (const p of ["2009-05-04", "04.05.2009", "8b", "Max"]) expect(prompt).not.toContain(p);
  expect(prompt).toContain(JSON.stringify("Material zur Aufgabe (von der Lehrkraft bereitgestellt):\n<<<\nLies zuerst den Textauszug und dann diese Seite:\nHinweis: Quelle 2 – Verlag\n>>>").slice(1, -1));   // prompt ist JSON-kodiert
  expect(prompt).not.toContain(LINK_URL);

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

  // Mit dem Feedback geht die erste Fassung verschlüsselt als „Erstversuch“ an die Lehrkraft (Kennung wie später die Abgabe)
  await expect.poll(async () => (await s.calls((r) => r.path === "/api/submit")).length, { timeout: 30_000 }).toBe(1);
  const firstPost = (await s.calls((r) => r.path === "/api/submit"))[0];
  expect(firstPost.status).toBe(200);
  const fp = JSON.parse(firstPost.reqBody);
  expect(Object.keys(fp).sort()).toEqual(["attempt", "code", "envelope", "stage"]);
  expect(fp.stage).toBe("first");
  expect(fp.attempt).toMatch(ATTEMPT);
  expect(Object.keys(fp.envelope).sort()).toEqual(["ct", "ek", "iv", "v"]);
  for (const p of ["Gewissn", "Schwester", "Max", "2009-05-04", "vorname"]) expect(firstPost.reqBody).not.toContain(p);

  // Überarbeiten → die Prüfung von Aufgabe 1 bezieht sich jetzt auf einen älteren Stand
  await typeAt(page, "#a-1", A.rev1);
  await typeAt(page, "#a-2", A.rev2);
  await expect(page.locator("#t-1 .lt-out")).toHaveClass(/stale/);
  await expect(page.locator("#t-1 .lt-stale")).toBeVisible();
  for (let i = 0; i < 3; i++) expect(await page.inputValue("#a-" + (i + 1))).toBe(A.final[i]);

  // Zwischenstand als PDF-Datei: eine Seite mit orangem Hinweiskasten und Link (URI-Aktion), Daten als eingebettete Datei
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#ed-pdf")]);
  expect(dl.suggestedFilename()).toMatch(new RegExp("^Feibeitsblatt-Zwischenstand-" + S.shown + "-\\d{4}-\\d\\d-\\d\\d_\\d\\d-\\d\\d\\.pdf$"));
  const pdfPath = await dl.path();
  const pdf = await readFile(pdfPath);
  const pdfText = pdf.toString("latin1");
  expect(pdfText.startsWith("%PDF-1.7")).toBe(true);
  expect(pdfText).toContain("/Type /Pages /Kids [3 0 R] /Count 1");                         // genau eine Seite
  expect(pdfText).toContain("/Subtype /Link /Rect [");
  expect(pdfText).toContain("/A << /S /URI /URI (https://feibeitsblatt.janrickmer.de/) >>");   // Link klickbar (öffnet im Browser)
  expect(pdfText).toContain("1 0.93 0.82 rg 0.86 0.45 0 RG 1.5 w");                            // orangener Hinweiskasten
  expect(pdfText).toContain("(Zwischenstand f\\374r ein Feibeitsblatt) Tj");                  // sichtbarer Titel (WinAnsi: ü = \374)
  expect(pdfText).toContain("(So arbeitest du weiter:) Tj");
  expect(pdfText).toContain("(https://feibeitsblatt.janrickmer.de/) Tj");
  const i0 = pdf.indexOf("/FbDraft 1"), d0 = pdf.indexOf("stream\n", i0) + 7, d1 = pdf.indexOf("\nendstream", d0);
  expect(i0).toBeGreaterThan(0);
  const draft = JSON.parse(pdf.subarray(d0, d1).toString("utf8"));
  expect(draft).toMatchObject({ v: 1, kind: "feibeitsblatt-draft", code: S.code, sheetTitle: TITLE, person: A.person, answers: A.final, first: A.first, attempt: fp.attempt, firstSent: true });
  expect(draft.feedback.map((f) => ({ covered: f.covered, missing: f.missing, ...noteOf(f) }))).toEqual(exp);
  await expect(page.locator("#save-state")).toHaveText("Zwischenstand als PDF-Datei gesichert – bewahre die Datei gut auf");
  // … auf einem „frischen“ Gerät (neuer Kontext ohne Browserdaten) hochgeladen: erst eine fremde PDF → Meldung, dann die echte →
  // Antworten, Feedback und Kennung sind zurück, kein neuer Erstversuch, Abgabe möglich
  const fresh = await openPage(browser);
  await fresh.page.setInputFiles("#start-pdf-file", { name: "irgendwas.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n") });
  await expect(fresh.page.locator("#start-err")).toHaveText(/^In dieser Datei steckt kein Feibeitsblatt-Zwischenstand\./);
  await expect(fresh.page.locator("#screen-start")).toHaveClass(/active/);
  await fresh.page.setInputFiles("#start-pdf-file", pdfPath);
  await expect(fresh.page.locator("#screen-editor")).toHaveClass(/active/, { timeout: 30_000 });
  await expect(fresh.page.locator("#who-name")).toHaveText("Max · Mu · 04.05.2009 · Klasse 8b");
  for (let i = 0; i < 3; i++) expect(await fresh.page.inputValue("#a-" + (i + 1))).toBe(A.final[i]);
  await expect(fresh.page.locator("#save-state")).toHaveText("Zwischenstand aus der PDF-Datei übernommen");
  await expect(fresh.page.locator("#t-1 .fbbox")).toBeVisible();
  await expect(fresh.page.locator("#fb-btn")).toBeDisabled();
  await expect(fresh.page.locator("#submit-btn")).toBeEnabled();
  expect(await fresh.calls((r) => r.path === "/api/submit")).toEqual([]);
  expect(await fresh.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("feibeitsblatt:draft:")).length)).toBe(1);
  expect(JSON.parse(await fresh.page.evaluate(() => localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("feibeitsblatt:draft:")))))).toMatchObject({ attempt: fp.attempt, firstSent: true });
  await closePage(fresh);

  // Abgabe: nur {code, envelope, stage, attempt}, alles verschlüsselt; Entwurf auf dem Gerät gelöscht
  await submit(page);
  // Bestätigung: großer grüner Haken, Hinweis mit zwei Gründen, „Meine Lösungen als PDF herunterladen“ (mehrseitig möglich)
  await expect(page.locator("#done-h")).toHaveText("Abgabe erfolgreich");
  await expect(page.locator("#screen-done .done-check")).toBeVisible();
  expect(await page.locator("#screen-done .done-check circle").evaluate((e) => getComputedStyle(e).fill)).toBe(GREEN);
  expect((await page.locator("#screen-done .done-check").boundingBox()).width).toBeGreaterThanOrEqual(96);
  await expect(page.locator("#screen-done .donehint")).toContainText("aus zwei Gründen");
  await expect(page.locator("#screen-done .donelist li")).toHaveCount(2);
  await expect(page.locator("#screen-done .donelist li").nth(0)).toContainText("technischen Problemen");
  await expect(page.locator("#screen-done .donelist li").nth(1)).toContainText("Klassenarbeit");
  const [sdl] = await Promise.all([page.waitForEvent("download"), page.click("#done-pdf")]);
  expect(sdl.suggestedFilename()).toMatch(new RegExp("^Feibeitsblatt-Loesungen-" + S.shown + "-\\d{4}-\\d\\d-\\d\\d\\.pdf$"));
  await expect(page.locator("#done-status")).toHaveText("Die PDF-Datei wird heruntergeladen – speichere sie in deinen Unterlagen.");
  const sol = (await readFile(await sdl.path())).toString("latin1");
  expect(sol.startsWith("%PDF-1.7")).toBe(true);
  expect(sol).toMatch(/\/Type \/Pages \/Kids \[[^\]]+\] \/Count [1-9]/);
  expect(sol).toContain("(Meine L\\366sungen \\226 " + TITLE.replace("–", "\\226") + ") Tj");   // Titel (WinAnsi: ö = \366, – = \226)
  expect(sol).toContain("(Aufgabe 1) Tj"); expect(sol).toContain("(Aufgabe 3) Tj");
  expect(sol).toContain("(Meine L\\366sung \\(abgegebene Fassung\\):) Tj");
  expect(sol).toContain("(Erste Fassung \\(vor dem KI-Feedback\\):) Tj");   // A hat überarbeitet
  expect(sol).toContain("Max \\267 Mu \\267 Klasse 8b");
  expect(sol).not.toContain("2009-05-04"); expect(sol).not.toContain("04.05.2009");   // kein Geburtsdatum in der Datei
  const sub = await s.calls((r) => r.path === "/api/submit");
  expect(sub).toHaveLength(2);                                   // Erstversuch (beim Feedback) + Abgabe
  expect(sub.map((r) => r.status)).toEqual([200, 200]);
  const sb = JSON.parse(sub[1].reqBody);
  expect(Object.keys(sb).sort()).toEqual(["attempt", "code", "envelope", "stage"]);
  expect(sb.stage).toBe("final");
  expect(sb.attempt).toBe(fp.attempt);                           // ersetzt den Erstversuch auf dem Server
  expect(Object.keys(sb.envelope).sort()).toEqual(["ct", "ek", "iv", "v"]);
  for (const p of ["Gewissn", "Schwester", "Max", "2009-05-04", "vorname"]) expect(sub[1].reqBody).not.toContain(p);
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
  // B ist laut Geburtsdatum unter 16: keine Rechtschreibprüfung, nur ein Hinweis – Absatz zum Feedback-Hinweis stimmt
  await expect(page.locator(".ltbtn")).toHaveCount(0);
  await expect(page.locator(".lt-off")).toHaveCount(3);
  await expect(page.locator("#t-1 .lt-off")).toHaveText("Die Rechtschreibprüfung (LanguageTool) gibt es erst ab 16 Jahren.");
  await expect(page.locator("#privacy")).toContainText("erst ab 16 Jahren und nur nach deiner Bestätigung");
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
  await expect(page.locator("#fb-fallback")).toBeHidden();
  await expect(page.locator("#t-1 .fbbox")).toBeHidden();
  expect(await page.$eval("#a-1", (e) => e.readOnly)).toBe(false);

  // zweiter Fehlschlag → Abgabe ohne KI-Feedback wird freigeschaltet (niemand sitzt fest), Feedback bleibt möglich
  await mockMode("500");
  try {
    await page.click("#fb-btn");
    await confirmDialog(page, "KI-Feedback anfordern?");
    await expect(page.locator("#fb-fallback")).toBeVisible({ timeout: 90_000 });
  } finally { await mockMode("ok"); }
  await expect(page.locator("#fb-fallback")).toContainText("Das KI-Feedback ist gerade nicht möglich");
  await expect(page.locator("#submit-btn")).toBeEnabled();
  await expect(page.locator("#submit-hint")).toHaveText("Du kannst ohne KI-Feedback abgeben. Deine Antworten werden verschlüsselt; nur deine Lehrkraft kann sie lesen.");
  await expect(page.locator("#fb-btn")).toBeEnabled();

  // dritter Versuch klappt → normales Feedback, Hinweis verschwindet
  await page.click("#fb-btn");
  await confirmDialog(page, "KI-Feedback anfordern?");
  await expect(page.locator("#t-1 .fbbox")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("#fb-fallback")).toBeHidden();
  const exp = expectedResults(TASKS, B.first);
  for (let n = 1; n <= 3; n++) {
    const f = await feedbackOf(page, n);
    expect({ covered: f.covered, missing: f.missing, ...noteOf(f) }, "Aufgabe " + n).toEqual(exp[n - 1]);
  }
  await submit(page);
  S.sheetBodies.push(...(await s.calls((r) => r.path.startsWith("/api/sheet/"))).map((r) => r.body));
  await closePage(s);
});

test("3b Schüler:in C: KI fällt zweimal aus → Abgabe ohne KI-Feedback", async ({ browser }) => {
  const s = await openPage(browser);
  const { page } = s;
  await enterCode(page, S.shown);
  await fillPerson(page, C.input);
  await expect(page.locator("#who-name")).toHaveText("Lea · Sc · 30.06.2012 · Klasse 9c");
  for (let i = 0; i < 3; i++) await typeAt(page, "#a-" + (i + 1), C.first[i]);
  await mockMode("500");
  try {
    for (let k = 0; k < 2; k++) {
      await page.click("#fb-btn");
      await confirmDialog(page, "KI-Feedback anfordern?");
      await expect(page.locator("#fb-status")).toHaveClass(/\bbad\b/, { timeout: 90_000 });
      await expect(page.locator("#fb-btn")).toBeEnabled();
    }
  } finally { await mockMode("ok"); }
  await expect(page.locator("#fb-fallback")).toBeVisible();
  await expect(page.locator("#t-1 .fbbox")).toBeHidden();
  await expect(page.locator("#submit-btn")).toBeEnabled();
  await page.click("#submit-btn");
  const text = await confirmDialog(page, "Jetzt abgeben?");
  expect(text).toContain("ohne KI-Feedback");
  await expect(page.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  const sub = await s.calls((r) => r.path === "/api/submit");
  expect(sub.map((r) => r.status)).toEqual([200]);
  await closePage(s);
});

test("3c Schüler:in D: holt nur das KI-Feedback und gibt nicht ab → Erstversuch liegt verschlüsselt bei der Lehrkraft", async ({ browser }) => {
  const s = await openPage(browser);
  const { page } = s;
  await enterCode(page, S.shown);
  await fillPerson(page, D.input);
  await expect(page.locator("#who-name")).toHaveText("Tom · Ze · 02.02.2010 · Klasse 9c");
  for (let i = 0; i < 3; i++) await typeAt(page, "#a-" + (i + 1), D.first[i]);
  // Ausgelastete KI: zweimal 429 ai_busy (Attrappe über route, retryAfter 5 s) → die Seite wartet mit Countdown und wiederholt
  // von selbst; währenddessen darf weitergeschrieben werden, der dritte Versuch schickt den aktuellen Text und geht durch
  let busy = 0;
  await page.route("**/api/feedback", async (route) => {
    if (busy < 2) { busy++; await route.fulfill({ status: 429, contentType: "application/json", headers: { "retry-after": "5" }, body: JSON.stringify({ ok: false, error: "Die KI ist gerade ausgelastet.", code: "ai_busy", aiCode: "RATE_LIMIT", retryAfter: 5 }) }); return; }
    await route.continue();
  });
  await expect(page.locator("#submit-btn")).toBeDisabled();
  await page.click("#fb-btn");
  const dlgText = await confirmDialog(page, "KI-Feedback anfordern?");
  expect(dlgText).toContain("an den KI-Dienst „127.0.0.1:");                       // der Empfänger steht im Dialog, nicht nur im Kleingedruckten
  expect(dlgText).toContain(RECIPIENT_SUFFIX + "“");
  expect(dlgText).toContain("ohne Namenskürzel, Geburtsdatum und Klasse");
  await expect(page.locator("#fb-status")).toContainText("Versuch 2 von 5", { timeout: 20_000 });
  await expect(page.locator("#fb-status")).toContainText("die KI ist ausgelastet");
  await expect(page.locator("#fb-wait")).toBeVisible();
  await expect(page.locator("#fb-wait-num")).toHaveText(/^Nächster Versuch in \d+ s$/);
  await expect(page.locator("#fb-btn")).toBeDisabled();
  expect(await page.$eval("#a-1", (e) => e.readOnly)).toBe(false);                 // im Wartefenster schreibbar …
  await typeAt(page, "#a-3", " Nachtrag.");                                         // … und der nächste Versuch schickt den aktuellen Text
  await expect(page.locator("#t-1 .fbbox")).toBeVisible({ timeout: 60_000 });
  await page.unroute("**/api/feedback");
  const fbCalls = await s.calls((r) => r.path === "/api/feedback");
  expect(fbCalls.map((r) => r.status)).toEqual([429, 429, 200]);
  const lastBody = JSON.parse(fbCalls[2].reqBody);
  expect(lastBody.answers[2]).toBe(D.first[2] + " Nachtrag.");
  expect(lastBody.recipients).toEqual([expect.stringMatching(/^custom:127\.0\.0\.1:\d+$/)]);   // worüber informiert wurde
  await expect(page.locator("#fb-wait")).toBeHidden();
  await expect(page.locator("#fb-fallback")).toBeHidden();
  await expect.poll(async () => (await s.calls((r) => r.path === "/api/submit")).length, { timeout: 30_000 }).toBe(1);
  const [post] = await s.calls((r) => r.path === "/api/submit");
  expect(post.status).toBe(200);
  const body = JSON.parse(post.reqBody);
  expect(body.stage).toBe("first");
  expect(body.attempt).toMatch(ATTEMPT);
  for (const p of ["Richter", "Tom", "2010-02-02", "vorname", "klasse"]) expect(post.reqBody).not.toContain(p);   // („9c“ wäre als Base64-Zufallstreffer möglich)
  await expect(page.locator("#submit-btn")).toBeEnabled();   // … gibt aber nicht ab
  await closePage(s);
});

test("3d Schüler:in E: KI bleibt ausgelastet → „Nicht länger warten“ zählt als Fehlversuch; nach dem zweiten Abbruch ist Abgeben ohne KI möglich", async ({ browser }) => {
  const s = await openPage(browser);
  const { page } = s;
  await enterCode(page, S.shown);
  await fillPerson(page, E.input);
  for (let i = 0; i < 3; i++) await typeAt(page, "#a-" + (i + 1), E.first[i]);
  let n = 0;
  await page.route("**/api/feedback", (route) => { n++; return route.fulfill({ status: 429, contentType: "application/json", headers: { "retry-after": "30" }, body: JSON.stringify({ ok: false, error: "Gerade fragen sehr viele gleichzeitig.", code: "ai_busy", aiCode: "BUSY", retryAfter: 30 }) }); });
  for (let cycle = 1; cycle <= 2; cycle++) {
    await page.click("#fb-btn");
    await confirmDialog(page, "KI-Feedback anfordern?");
    await expect(page.locator("#fb-wait")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#fb-status")).toContainText("Versuch 2 von 5");
    await expect(page.locator("#fb-status")).not.toContainText("in einer Minute noch einmal");   // kein Servertext während des automatischen Wartens
    await page.click("#fb-wait-stop");
    await expect(page.locator("#fb-status")).toHaveText("Du wartest nicht länger. Deine Antworten bleiben gespeichert – du kannst das KI-Feedback später noch einmal anfordern.");
    await expect(page.locator("#fb-wait")).toBeHidden();
    await expect(page.locator("#fb-btn")).toBeEnabled();
    if (cycle === 1) { await expect(page.locator("#fb-fallback")).toBeHidden(); await expect(page.locator("#submit-btn")).toBeDisabled(); }
  }
  expect(n).toBe(2);   // je Zyklus genau eine Anfrage – nach dem Abbruch wird nichts mehr gesendet
  await expect(page.locator("#fb-fallback")).toBeVisible();
  await expect(page.locator("#fb-fallback")).toContainText("KI ausgelastet");
  await expect(page.locator("#submit-btn")).toBeEnabled();
  const draft = JSON.parse(await page.evaluate(() => localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("feibeitsblatt:draft:")))));
  expect(draft).toMatchObject({ fbFails: 2, fbUnavailable: "KI ausgelastet" });   // Fehlversuche überdauern ein Neuladen
  expect(await s.calls((r) => r.path === "/api/submit")).toEqual([]);           // nichts beim Server (E gibt nicht ab)
  await closePage(s);
});

test("4 Lehrkraft: Anmelden → Abgaben eingeklappt (4 Spalten, sortiert) → Aufklappen zeigt erste und überarbeitete Fassung", async ({ browser }) => {
  const t = await openPage(browser);
  const { page } = t;
  await teacherLogin(page, PW);
  const row = page.locator("#t-sheets-body tr", { hasText: S.shown });
  await expect(row.locator("td").nth(4)).toHaveText(/^3 \+1 Erstversuch ohne Überarbeitung$/);   // „+1“ orange, Rest nur für Screenreader
  expect(await row.locator("td").nth(4).locator(".st-first").evaluate((e) => getComputedStyle(e).color)).toBe(ORANGE);
  await row.click();
  await expect(page.locator("#t-subs-sum")).toHaveText("3 Abgaben · 1 Erstversuch ohne Überarbeitung");
  await expect(page.locator("#t-subs-legend")).toBeVisible();
  await expect(page.locator("#t-subs-legend")).toHaveText("Grün = Abgabe nach der Überarbeitung · Orange = Erstversuch ohne Überarbeitung (nur KI-Feedback angefordert, noch nicht abgegeben)");

  // Kopf: schmale Pfeilspalte + genau vier sichtbare Datenspalten
  const heads = await page.$$eval("#t-subs thead th", (ths) => ths.map((th) => ({ text: th.textContent.trim(), arrow: th.classList.contains("arrowcol"),
    srOnly: !!th.querySelector(".sr-only"), w: th.getBoundingClientRect().width })));
  expect(heads).toHaveLength(5);
  expect(heads[0].arrow && heads[0].srOnly).toBe(true);
  expect(heads[0].w).toBeLessThan(60);
  expect(heads.slice(1).map((h) => h.text)).toEqual(["Kürzel Nachname", "Kürzel Vorname", "Geburtstag", "Klasse"]);

  // eingeklappt und sortiert nach Klasse, Nachname, Vorname (B: 7a vor A: 8b, obwohl A zuerst abgegeben hat)
  const mains = page.locator("#t-subs-body tr.main");
  await expect(mains).toHaveCount(4);
  for (let i = 0; i < 4; i++) await expect(mains.nth(i)).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#t-subs-body tr.details:visible")).toHaveCount(0);
  const cells = (i) => mains.nth(i).locator("td:not(.arrowcol)");
  await expect(cells(0)).toHaveText([B.person.nachname, B.person.vorname, fmtDe(B.person.geburtsdatum), B.person.klasse]);
  await expect(cells(1)).toHaveText([A.person.nachname, A.person.vorname, fmtDe(A.person.geburtsdatum), A.person.klasse]);
  await expect(cells(2)).toHaveText([C.person.nachname, C.person.vorname, fmtDe(C.person.geburtsdatum), C.person.klasse]);
  await expect(cells(3)).toHaveText([D.person.nachname, D.person.vorname, fmtDe(D.person.geburtsdatum), D.person.klasse]);
  await expect(page.locator("#t-subs-body")).not.toContainText(A.first[1]);   // Lösungen erst nach dem Aufklappen
  // Kürzel: grün bei Abgaben nach der Überarbeitung (A, B, C), orange beim Erstversuch ohne Überarbeitung (D); Screenreader-Text dazu
  for (let i = 0; i < 3; i++) {
    await expect(cells(i).nth(0)).toHaveClass("st-final"); await expect(cells(i).nth(1)).toHaveClass("st-final");
    expect(await cells(i).nth(0).evaluate((e) => getComputedStyle(e).color)).toBe(GREEN);
    await expect(mains.nth(i).locator(".arrowcol .sr-only")).toHaveText("Abgabe nach der Überarbeitung");
  }
  await expect(cells(3).nth(0)).toHaveClass("st-first"); await expect(cells(3).nth(1)).toHaveClass("st-first");
  expect(await cells(3).nth(0).evaluate((e) => getComputedStyle(e).color)).toBe(ORANGE);
  expect(await cells(3).nth(1).evaluate((e) => getComputedStyle(e).color)).toBe(ORANGE);
  expect(await cells(3).nth(2).evaluate((e) => getComputedStyle(e).color)).not.toBe(ORANGE);   // nur die Kürzel sind orange
  await expect(mains.nth(3).locator(".arrowcol .sr-only")).toHaveText("Erstversuch ohne Überarbeitung");

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
    await expect(dt.locator(".timgs .thumbbtn")).toHaveCount(i === 0 ? 2 : 0);   // Bilder der Aufgabe auch in der Detailansicht
    await expect(dt.locator(".tfiles .filebtn")).toHaveCount(i === 1 ? 1 : 0);   // … und die PDF-Datei
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

  // C: ohne KI-Feedback abgegeben → Hinweis, beide Spalten gleich
  await mains.nth(2).click();
  const detC = page.locator("#t-subs-body tr.details").nth(2);
  await expect(detC.locator(".moodle-hint")).toContainText("Ohne KI-Feedback abgegeben");
  await expect(detC.locator(".dmeta")).not.toContainText("KI-Feedback am");
  const tdC = detC.locator(".dtask").nth(0).locator("table.cmp tbody td");
  expect(await tdC.nth(0).textContent()).toBe(C.first[0]);
  expect(await tdC.nth(1).textContent()).toBe(C.first[0] + "(unverändert)");
  await expect(detC.locator(".dfb")).toHaveCount(0);
  await mains.nth(2).click();

  // D: Erstversuch ohne Überarbeitung → Hinweis, Spalte 1 = erste Fassung, Spalte 2 „(noch nicht überarbeitet)“, Feedback dabei
  await mains.nth(3).click();
  const detD = page.locator("#t-subs-body tr.details").nth(3);
  await expect(detD.locator(".dmeta")).toHaveText(/^Erstversuch ohne Überarbeitung – noch nicht abgegeben · KI-Feedback am \d\d\.\d\d\.\d{4}, \d\d:\d\d$/);
  await expect(detD.locator(".dmeta")).toHaveClass(/st-first/);
  await expect(detD.locator(".moodle-hint")).toContainText("hat das KI-Feedback angefordert, aber (noch) nicht abgegeben");
  const tdD = detD.locator(".dtask").nth(0).locator("table.cmp tbody td");
  expect(await tdD.nth(0).textContent()).toBe(D.first[0]);
  expect(await tdD.nth(1).textContent()).toBe("(noch nicht überarbeitet)");
  const expD = expectedResults(TASKS, D.first);
  await expect(detD.locator(".dtask").nth(0).locator(".dfb ul.fb-miss li")).toHaveText(expD[0].missing);
  await mains.nth(3).click();

  // Alle aufklappen / zuklappen; B: erste = letzte Fassung
  await page.click("#t-expand-all");
  await expect(page.locator("#t-subs-body tr.details:visible")).toHaveCount(4);
  await expect(page.locator("#t-expand-all")).toHaveText("Alle zuklappen");
  const bFirst = page.locator("#t-subs-body tr.details").nth(0).locator(".dtask").nth(0).locator("table.cmp tbody td");
  expect(await bFirst.nth(0).textContent()).toBe(B.first[0]);
  expect(await bFirst.nth(1).textContent()).toBe(B.final[0] + "(unverändert)");
  await page.click("#t-expand-all");
  await expect(page.locator("#t-subs-body tr.details:visible")).toHaveCount(0);

  // „Als Vorlage verwenden“ nimmt die Bilder samt Anzeigeart mit
  await page.click("#t-template");
  await expect(page.locator("#tv-builder")).toBeVisible();
  const vRow = page.locator("#b-rows > tr").nth(0);
  await expect(vRow.locator(".bimg")).toHaveCount(2);
  await expect(vRow.locator(".bimg-mode").nth(0)).toHaveValue("thumb");
  await expect(vRow.locator(".bimg-mode").nth(1)).toHaveValue("inline");
  await expect(vRow.locator(".bimg").nth(0).locator(".bimg-meta")).toHaveText(/^1600 × 800 px · \d+ KB$/);
  await expect(vRow.locator(".bimg-alt").nth(0)).toHaveValue("Skizze: Zelle mit Zellkern");
  await expect(vRow.locator(".bmat-edit b")).toHaveText("Textauszug");
  await expect(vRow.locator(".bmat-edit a")).toHaveAttribute("href", LINK_URL2);
  const vRow2 = page.locator("#b-rows > tr").nth(1);   // … und die PDF-Datei (vom Server geladen)
  await expect(vRow2.locator(".bfile")).toHaveCount(1);
  await expect(vRow2.locator(".bfile-name")).toHaveText(PDF_NAME);
  await expect(vRow2.locator(".bfile .bimg-meta")).toHaveText("600 KB");
  await expect(page.locator("#b-err")).toHaveText("");
  // … und bis zum neuen Blatt: Bilder und PDF-Datei werden erneut hochgeladen (Reihenfolge, Art und Beschreibung bleiben)
  await page.click("#b-gen");
  await expect(page.locator("#b-result")).toBeVisible();
  await expect(page.locator("#b-res-img")).toHaveText("2 Bilder und 1 PDF-Datei sind gespeichert.", { timeout: 60_000 });
  const newCode = (await page.locator("#b-res-code").textContent()).trim().replace("-", "");
  expect(newCode).not.toBe(S.code);
  const tUps = (await t.calls((r) => r.method === "POST" && r.path.endsWith("/images"))).map((r) => JSON.parse(r.body).image);
  expect(tUps.map((m) => [m.task, m.pos, m.mode, m.alt, m.w, m.h])).toEqual([[1, 0, "thumb", "Skizze: Zelle mit Zellkern", 1600, 800], [1, 1, "inline", "", 300, 450]]);
  const pub = await (await t.page.request.get("/api/sheet/" + newCode)).json();
  expect(pub.sheet.tasks[0].images.map((m) => [m.mode, m.w, m.h, m.alt])).toEqual([["thumb", 1600, 800, "Skizze: Zelle mit Zellkern"], ["inline", 300, 450, ""]]);
  expect(pub.sheet.tasks.map((x) => x.material)).toEqual(S.material);   // Material der Vorlage unverändert übernommen
  expect(pub.sheet.tasks.map((x) => x.files)).toEqual([[], [{ id: expect.stringMatching(/^[0-9a-f]{16}$/), name: PDF_NAME, bytes: PDF_BUF.length }], []]);
  expect(pub.sheet.tasks[1].files[0].id).not.toBe(S.pdf.id);
  const copied = await (await t.page.request.get("/api/sheet/" + newCode + "/files/" + pub.sheet.tasks[1].files[0].id + "?part=1")).json();
  expect(Buffer.from(copied.data, "base64").equals(PDF_BUF.subarray(512 * 1024))).toBe(true);
  // das Vorlagen-Blatt wieder löschen (die späteren Tests rechnen mit genau einem Blatt)
  await page.click("#b-res-back");
  await expect(page.locator("#t-sel-code")).toHaveText(newCode.slice(0, 3) + "-" + newCode.slice(3));
  await page.click("#t-del-sheet");
  await confirmDialog(page, "Feibeitsblatt löschen?");
  await expect(page.locator("#t-list-status")).toHaveText("Feibeitsblatt gelöscht.");
  await expect(page.locator("#t-sheets-body tr", { hasText: S.shown })).toHaveCount(1);
  await closePage(t);
});

// Stream mit Kennzeichen (z. B. „/FbBlob (…)“) aus einer von Feibeitsblatt erzeugten PDF: {start, len, dict}
function pdfStream(pdf, mark) {
  const s = pdf.toString("latin1"), j = s.indexOf(mark);
  expect(j, mark).toBeGreaterThan(0);
  const obj = s.lastIndexOf(" obj", j) + 4, st = s.indexOf("stream\n", j);
  const dict = s.slice(obj, st);
  return { obj, dict, start: st + 7, len: +/\/Length (\d+)/.exec(dict)[1] };
}
// Wie ein PDF-Programm, das neu speichert: den Stream komprimieren (FlateDecode), die Länge als Verweis ans Dateiende
function resavePdf(pdf, mark) {
  const x = pdfStream(pdf, mark), packed = deflateSync(pdf.subarray(x.start, x.start + x.len));
  const eof = pdf.toString("latin1").lastIndexOf("%%EOF");
  return Buffer.concat([pdf.subarray(0, x.obj), Buffer.from(x.dict.replace(/\/Length \d+/, "/Filter /FlateDecode /Length 999 0 R") + "stream\n", "latin1"),
    packed, pdf.subarray(x.start + x.len, eof), Buffer.from(`999 0 obj\n${packed.length}\nendobj\n%%EOF\n`, "latin1")]);
}

test("4b Lehrkraft: Feibeitsblatt als PDF-Datei sichern → wieder hochladen → neuer Code mit denselben Aufgaben, Musterlösungen, Material, Bildern und PDF-Dateien", async ({ browser }) => {
  const t = await openPage(browser);
  const { page } = t;
  await teacherLogin(page, PW);
  await expect(page.locator("#t-storage")).toHaveText(/^Bilder und PDF-Dateien aller Feibeitsblätter belegen \d+(,\d)? (KB|MB) von 200 MB\.$/);
  await expect(page.locator("#t-storage")).not.toHaveClass(/bad/);
  await page.locator("#t-sheets-body tr", { hasText: S.shown }).click();
  await expect(page.locator("#t-sel-meta")).toContainText("3 Aufgaben");

  // Sichern: Dateiname mit Code und Titel; sichtbar Aufgaben, Bilder (als JPEG) und Hinweis; im Hintergrund alles
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#t-export")]);
  expect(dl.suggestedFilename()).toBe(`Feibeitsblatt-${S.shown}-Das Gewissen - Ethik.pdf`);   // Titel nur ASCII („–“ → „-“)
  await expect(page.locator("#t-export-status")).toHaveText(/^Die PDF-Datei \(\d+(,\d)? (KB|MB)\) wird heruntergeladen\. Bewahren Sie sie gut auf – sie enthält auch die Musterlösungen\.$/);
  const pdf = await readFile(await dl.path()), text = pdf.toString("latin1");
  expect(text.startsWith("%PDF-1.7")).toBe(true);
  expect((text.match(/\/Subtype \/Image /g) || []).length).toBe(2);   // beide Bilder sichtbar
  expect(text).toContain("/Filter /DCTDecode");
  expect(text).toContain("(Aufgabe 1) Tj");
  expect(text).toContain("(Nicht an Sch\\374ler:innen weitergeben");   // Warnung (fett, rot) – Umbruch je nach Breite
  const dx = pdfStream(pdf, "/FbSheet 1");
  expect(dx.dict).toContain("/Filter /FlateDecode");
  const rec = JSON.parse(inflateSync(pdf.subarray(dx.start, dx.start + dx.len)).toString("utf8"));
  expect(rec).toMatchObject({ kind: "feibeitsblatt-sheet", v: 1, code: S.code, title: TITLE });
  expect(rec.exportId).toMatch(/^[0-9a-f]{16}$/);
  expect(rec.tasks.map((x) => [x.text, x.solution])).toEqual(TASKS.map((x) => [x.text, x.solution]));
  expect(rec.tasks.map((x) => x.material)).toEqual(S.material);
  expect(rec.tasks[0].images.map((m) => [m.mode, m.alt, m.mime, m.w, m.h])).toEqual(S.imgs.map((m) => [m.mode, m.alt, m.mime, m.w, m.h]));
  expect(rec.tasks.map((x) => x.images.length)).toEqual([2, 0, 0]);
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  expect(rec.tasks.map((x) => x.files)).toEqual([[], [{ ref: rec.exportId + "-3", name: PDF_NAME, bytes: PDF_BUF.length, sha256: sha(PDF_BUF) }], []]);
  const blob = (ref) => { const x = pdfStream(pdf, "/FbBlob (" + ref + ")"); return pdf.subarray(x.start, x.start + x.len); };
  expect(blob(rec.tasks[1].files[0].ref).equals(PDF_BUF)).toBe(true);   // PDF-Datei unverändert angehängt
  for (const [k, m] of rec.tasks[0].images.entries()) {   // Bilder: Original-Bytes wie auf dem Server, Prüfsumme stimmt
    const srv = Buffer.from((await (await page.request.get("/api/sheet/" + S.code + "/images/" + S.imgs[k].id)).json()).data, "base64");
    expect(blob(m.ref).equals(srv)).toBe(true);
    expect([m.bytes, m.sha256]).toEqual([srv.length, sha(srv)]);
  }
  for (const p of [...A.first, ...A.final, A.person.vorname, "2009-05-04"]) expect(JSON.stringify(rec)).not.toContain(p);   // keine Abgaben

  // eine fremde PDF und ein Zwischenstand von Schüler:innen → Meldung, der Editor öffnet sich nicht
  await page.setInputFiles("#t-import-file", { name: "fremd.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n") });
  await expect(page.locator("#t-import-status")).toHaveText("In dieser PDF-Datei steckt kein Feibeitsblatt. Bitte wählen Sie eine Datei, die Sie mit „Als PDF-Datei herunterladen“ gesichert haben.");
  await page.setInputFiles("#t-import-file", { name: "z.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n9 0 obj\n<< /Type /EmbeddedFile /FbDraft 1 /Length 2 >>\nstream\n{}\nendstream\nendobj\n%%EOF\n") });
  await expect(page.locator("#t-import-status")).toHaveText(/^Das ist ein Zwischenstand von Schüler:innen, kein gesichertes Feibeitsblatt\./);
  await expect(page.locator("#tv-overview")).toBeVisible();

  // Laden: eine „neu gespeicherte“ Fassung (angehängte PDF-Datei komprimiert, Länge als Verweis) füllt den Editor vollständig
  const resaved = resavePdf(pdf, "/FbBlob (" + rec.tasks[1].files[0].ref + ")");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("#t-import")]);   // Button öffnet die Dateiauswahl
  await chooser.setFiles({ name: "Feibeitsblatt.pdf", mimeType: "application/pdf", buffer: resaved });
  await expect(page.locator("#tv-builder")).toBeVisible();
  await expect(page.locator("#t-import-status")).toHaveText("");
  await expect(page.locator("#b-import")).toBeVisible();
  await expect(page.locator("#b-import")).toContainText(`„${TITLE}“ wurde aus der PDF-Datei geladen (bisheriger Code ${S.shown}, gesichert am `);
  await expect(page.locator("#b-import")).toContainText("bekommt einen neuen Code");
  await expect(page.locator("#b-err")).toHaveText("");
  await expect(page.locator("#b-title")).toHaveValue(TITLE);
  const rows = page.locator("#b-rows > tr");
  await expect(rows).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(rows.nth(i).locator("textarea.q:not(.measure)")).toHaveValue(TASKS[i].text);
    await expect(rows.nth(i).locator("textarea.s:not(.measure)")).toHaveValue(TASKS[i].solution);
  }
  await expect(rows.nth(0).locator(".bmat-edit b")).toHaveText("Textauszug");
  await expect(rows.nth(0).locator(".bimg")).toHaveCount(2);
  await expect(rows.nth(0).locator(".bimg-mode").nth(0)).toHaveValue("thumb");
  await expect(rows.nth(0).locator(".bimg-mode").nth(1)).toHaveValue("inline");
  await expect(rows.nth(0).locator(".bimg-alt").nth(0)).toHaveValue("Skizze: Zelle mit Zellkern");
  await expect(rows.nth(0).locator(".bimg").nth(0).locator(".bimg-meta")).toHaveText(/^1600 × 800 px · \d+ KB$/);
  await expect(rows.nth(1).locator(".bfile-name")).toHaveText(PDF_NAME);
  await expect(rows.nth(2).locator(".bimg, .bfile")).toHaveCount(0);

  // neuer Titel für die Parallelgruppe → neues Blatt mit neuem Code; Bilder und PDF-Datei werden hochgeladen
  // (nicht „…klasse“: Test 5 sucht dieses Wort als Klartext-Feldnamen im Datenbankordner)
  const TITLE2 = TITLE + " – Kurs B";
  await page.fill("#b-title", TITLE2);
  await page.click("#b-gen");
  await expect(page.locator("#b-result")).toBeVisible();
  await expect(page.locator("#b-res-img")).toHaveText("2 Bilder und 1 PDF-Datei sind gespeichert.", { timeout: 60_000 });
  const newCode = (await page.locator("#b-res-code").textContent()).trim().replace("-", "");
  expect(newCode).not.toBe(S.code);
  const [row] = await d1Query(`SELECT title, tasks FROM sheets WHERE code='${newCode}'`);
  expect(row.title).toBe(TITLE2);
  expect(JSON.parse(row.tasks).map((x) => [x.text, x.solution, x.material || []])).toEqual(rec.tasks.map((x) => [x.text, x.solution, x.material]));
  const pub = await (await page.request.get("/api/sheet/" + newCode)).json();
  expect(pub.sheet.tasks[0].images.map((m) => [m.mode, m.alt, m.w, m.h])).toEqual(S.imgs.map((m) => [m.mode, m.alt, m.w, m.h]));
  for (const [k, m] of pub.sheet.tasks[0].images.entries()) {
    const a = await (await page.request.get("/api/sheet/" + newCode + "/images/" + m.id)).json(), b = await (await page.request.get("/api/sheet/" + S.code + "/images/" + S.imgs[k].id)).json();
    expect(a.data).toBe(b.data);   // byte-genau dasselbe Bild
  }
  const f = pub.sheet.tasks[1].files[0];
  expect([pub.sheet.tasks[1].files.length, f.name, f.bytes]).toEqual([1, PDF_NAME, PDF_BUF.length]);
  const p0 = await (await page.request.get(`/api/sheet/${newCode}/files/${f.id}`)).json(), p1 = await (await page.request.get(`/api/sheet/${newCode}/files/${f.id}?part=1`)).json();
  expect(Buffer.concat([Buffer.from(p0.data, "base64"), Buffer.from(p1.data, "base64")]).equals(PDF_BUF)).toBe(true);

  // Übersicht: zwei getrennte Blätter, das neue ohne Abgaben; das alte bleibt unverändert. Danach das neue wieder löschen
  await page.click("#b-res-back");
  const fmt = (c) => c.slice(0, 3) + "-" + c.slice(3);
  await expect(page.locator("#t-sel-code")).toHaveText(fmt(newCode));
  await expect(page.locator("#t-sheets-body tr", { hasText: fmt(newCode) }).locator("td").nth(4)).toHaveText("0");
  await expect(page.locator("#t-sheets-body tr", { hasText: S.shown }).locator("td").nth(4)).toHaveText(/^3 \+1/);
  await page.click("#t-del-sheet");
  await confirmDialog(page, "Feibeitsblatt löschen?");
  await expect(page.locator("#t-list-status")).toHaveText("Feibeitsblatt gelöscht.");
  await expect(page.locator("#t-sheets-body tr")).toHaveCount(1);
  await closePage(t);
});

test("5 Datenbank enthält keinen Klartext der Abgaben; /api/sheet liefert nie Musterlösungen", async ({ request }) => {
  // gespeicherte Umschläge (wrangler d1 execute auf derselben lokalen D1)
  const rows = await d1Query("SELECT id, sheet_code, received_at, envelope, stage, attempt FROM submissions ORDER BY id");
  expect(rows).toHaveLength(4);
  expect(rows.map((r) => r.stage)).toEqual(["final", "final", "final", "first"]);   // A (Erstversuch → Abgabe, eine Zeile), B, C, D
  for (const r of rows) expect(r.attempt).toMatch(ATTEMPT);
  expect(new Set(rows.map((r) => r.attempt)).size).toBe(4);
  const forbidden = [...A.first, ...A.final, ...B.first, ...C.first, ...D.first].flatMap((a) => a.split("\n")).concat(
    ["Gewissn", "Schwester angelogen", "Lügen ist unfair", "innere Stimme", "Keine Ahnung", "innerer Richter",
      '"Max"', '"Mu"', '"8b"', '"Özg"', '"Ün"', '"7a"', "Özg", '"Lea"', '"9c"', '"Tom"', '"Ze"', "2009-05-04", "2012-01-15", "2012-06-30", "2010-02-02", "vorname", "nachname", "geburtsdatum", "klasse", "person", "feedbackError"]);
  for (const r of rows) {
    expect(r.sheet_code).toBe(S.code);
    expect(Object.keys(r).sort()).toEqual(["attempt", "envelope", "id", "received_at", "sheet_code", "stage"]);
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
    expect(Object.keys(j.sheet).sort()).toEqual(["aiProvider", "aiRecipients", "code", "publicKey", "tasks", "title"]);
    expect(j.sheet.aiRecipients).toEqual([{ id: "custom:" + j.sheet.aiProvider, label: j.sheet.aiProvider + RECIPIENT_SUFFIX }]);
    expect(j.sheet.tasks).toEqual(TASKS.map((t, i) => ({ text: t.text, material: S.material[i], images: i === 0 ? S.imgs.map((m) => ({ id: m.id, mode: m.mode, w: m.w, h: m.h, alt: m.alt })) : [], files: i === 1 ? [S.pdf] : [] })));
    expect(j.sheet.tasks[0].images.map((m) => m.mode)).toEqual(["thumb", "inline"]);
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
  await expect(page.locator("#t-subs-sum")).toHaveText("3 Abgaben · 1 Erstversuch ohne Überarbeitung");
  await expect(page.locator("#t-del-subs")).toBeEnabled();
  // „Ganz unten“: die Lösch-Schaltflächen stehen unter der Abgaben-Tabelle
  const yTable = (await page.locator("#t-subs").boundingBox()).y, yDel = (await page.locator("#t-del-subs").boundingBox()).y;
  expect(yDel).toBeGreaterThan(yTable);

  await page.click("#t-del-subs");
  const text = await confirmDialog(page, "Alle Abgaben löschen?");
  expect(text).toContain("Alle 4 Abgaben und Erstversuche zu „" + TITLE + "“ werden endgültig");
  await expect(page.locator("#t-del-status")).toHaveText("4 Abgaben gelöscht.");
  await expect(page.locator("#t-subs-sum")).toHaveText("Noch keine Abgaben.");
  await expect(page.locator("#t-subs-legend")).toBeHidden();
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
  // die Bilder des Blattes sind mit gelöscht
  expect((await request.get("/api/sheet/" + S.code + "/images/" + S.imgs[0].id)).status()).toBe(404);
  expect(await d1Query("SELECT COUNT(*) AS n FROM sheet_images")).toEqual([{ n: 0 }]);
  // … die PDF-Dateien ebenso
  expect((await request.get("/api/sheet/" + S.code + "/files/" + S.pdf.id)).status()).toBe(404);
  expect(await d1Query("SELECT COUNT(*) AS n FROM sheet_files")).toEqual([{ n: 0 }]);
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

test("9 Sperre nach Fehlversuchen trifft nur falsche Eingaben: richtiges Passwort und 1104 gehen weiter", async ({ browser, request }) => {
  // Passwort: falsche Anmeldeschlüssel, bis der Server sperrt (10 Fehlversuche je Viertelstunde)
  const wrong = Buffer.alloc(32, 7).toString("base64");
  const auth = [];
  for (let i = 0; i < 12 && !auth.includes(429); i++)
    auth.push((await request.post("/api/teacher/login", { headers: { Authorization: "Bearer " + wrong } })).status());
  expect(auth.at(-1)).toBe(429);
  expect(auth.filter((s) => s === 401).length).toBeLessThanOrEqual(10);   // frühere Tests zählten schon Fehlversuche
  const p = await openPage(browser);
  const { page } = p;
  await enterCode(page, "1104");
  await page.fill("#tl-pw", "falsches Passwort 123");
  await page.click("#tl-btn");
  await expect(page.locator("#tl-err")).toHaveText(/^Zu viele falsche Passwörter\. Mit dem richtigen Passwort können Sie sich weiterhin anmelden; weitere Versuche sind in etwa 1[0-5] Minuten möglich\.$/, { timeout: 30_000 });
  await page.fill("#tl-pw", NEW_PW);   // das richtige Passwort geht trotz Sperre
  await page.click("#tl-btn");
  await expect(page.locator("#screen-teacher")).toHaveClass(/active/, { timeout: 30_000 });
  await page.click("#t-logout");
  await expect(page.locator("#screen-start")).toHaveClass(/active/);

  // Türcode: falsche Codes, bis gesperrt; 1104 öffnet weiterhin, falsche Zahlen zeigen die allgemeine Meldung
  const door = [];
  for (let i = 0; i < 12 && !door.includes(429); i++)
    door.push((await request.post("/api/teacher/door", { data: { doorCode: "9999" } })).status());
  expect(door.at(-1)).toBe(429);
  expect(door.filter((s) => s === 403).length).toBeLessThanOrEqual(10);
  const r = await request.post("/api/teacher/door", { data: { doorCode: "1104" } });
  expect(r.status()).toBe(200);
  await enterCode(page, "2011");
  await expect(page.locator("#start-err")).toHaveText(/^Zu viele Fehlversuche\. Ein neuer Versuch ist in etwa 1[0-5] Minuten möglich\.$/);
  await enterCode(page, "1104");
  await expect(page.locator("#screen-tlogin")).toHaveClass(/active/);
  await closePage(p);
});
