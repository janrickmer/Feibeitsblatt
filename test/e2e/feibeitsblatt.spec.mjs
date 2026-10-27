// feibeitsblatt.spec.mjs – kompletter Ablauf im echten Browser gegen den echten Worker (wrangler dev --local, lokale D1).
// Simuliert werden nur LanguageTool (page.route) und die KI (test/mock-ai.mjs als Anbieter „custom“, eingerichtet über
// die Oberfläche). Die Tests bauen aufeinander auf (eine Datenbank, eine Lehrkraft) → seriell, ein Worker.
import { test, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync, deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { expectedResults, expectedChecklist } from "../mock-ai.mjs";
import jsQR from "jsqr";
import { deriveTeacherKeys, makeEnvelope, openPrivateKey, openEnvelope } from "../smoke.mjs";
import { makePng } from "../png.mjs";
import { escHull, b64url, overviewPdf } from "../escape-fixture.mjs";
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
// solution = Auftrag an die KI (interner Feldname); hier als Stichpunkte – der Mock macht aus jeder Zeile einen Stichpunkt
const TASKS = [
  { text: "Erkläre, was das Gewissen ist.",
    solution: "- Innere Instanz des Menschen\n- Unterscheidet zwischen gut und böse\n- Meldet sich als schlechtes Gewissen" },
  { text: "Nenne ein Beispiel aus deinem Alltag,\nin dem sich dein Gewissen gemeldet hat.",
    solution: "- Konkrete Situation aus dem Alltag\n- Begründung, warum sich das Gewissen meldet" },
  { text: "Wie fühlst du dich, wenn du etwas falsch gemacht hast?", solution: "" },
];
const SOLUTION_LINES = TASKS.flatMap((t) => t.solution.split("\n").map((l) => l.replace(/^- /, "")).filter(Boolean));
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}$/;
// Schalter in index.html: Tippzeiten im Zwischenstand speichern (true) oder nur im Arbeitsspeicher halten (false)
const TT_KEEP = /\bconst TT_KEEP_IN_DRAFT = true;/.test(readFileSync(new URL("../../index.html", import.meta.url), "utf8"));
/* Ablauf-Kasten „So gehst du vor“ (oben auf dem Blatt) */
const STEP_LATE = "– nur direkt nach der Abgabe auf der Bestätigungsseite (nicht nach Neuladen oder „Neues Feibeitsblatt öffnen“)";
const STEPS_AI = ["Aufgaben bearbeiten", "KI-Feedback anfordern (freiwillig, empfohlen)", "Lösungen mithilfe des KI-Feedbacks überarbeiten", "Abgeben",
  "Lösungen und letztes Feedback herunterladen " + STEP_LATE];
const STEPS_NO_AI = ["Aufgaben bearbeiten", "Abgeben", "Lösungen herunterladen " + STEP_LATE];
const STEP_FB_BLOCKED = "KI-Feedback anfordern (freiwillig, empfohlen – gerade nicht möglich)";   // kein KI-Dienst eingerichtet bzw. Grund gemeldet
/* Tippzeiten im Zwischenstand: je Antwort (bzw. erster Fassung) genau so viele Werte wie Zeichen – oder gar keine (Schalter aus) */
function expectDraftTyping(d, answers, first) {
  if (!TT_KEEP) { expect(d.typing).toBeUndefined(); return; }
  expect(d.typing.v).toBe(1);
  expect(d.typing.answers.map((b) => Buffer.from(b, "base64").length)).toEqual(answers.map((a) => a.length));
  if (first) expect(d.typing.first.map((b) => Buffer.from(b, "base64").length)).toEqual(first.map((a) => a.length));
  else expect(d.typing.first).toBeNull();
}

// Schüler:in A: tippt Kürzel klein/groß gemischt, überarbeitet nach dem Feedback
const A = {
  input: { vorname: "max", nachname: "MU", geb: "--05-04", klasse: " 8b " },
  person: { vorname: "Max", nachname: "Mu", geburtsdatum: "--05-04", klasse: "8b" },
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
  input: { vorname: "özg", nachname: "ün", geb: "--01-15", klasse: "7a" },
  person: { vorname: "Özg", nachname: "Ün", geburtsdatum: "--01-15", klasse: "7a" },
  first: ["Das Gewissen ist eine innere Stimme.", "Keine Ahnung, ehrlich gesagt.", "Schlecht, dann rede ich darüber."],
};
B.final = B.first.slice();
// Schüler:in C: Die KI fällt zweimal aus → Abgabe ohne KI-Feedback (sortiert als Letzte: Klasse 9c)
const C = {
  input: { vorname: "lea", nachname: "sc", geb: "--02-29", klasse: "9 c" },   // „9 c“ → Klasse 9c; Geburtstag am 29. Februar
  person: { vorname: "Lea", nachname: "Sc", geburtsdatum: "--02-29", klasse: "9c" },
  first: ["Das Gewissen sagt mir, was richtig ist.", "Ich habe einmal gelogen und mich danach schlecht gefühlt.", "Ich schäme mich dann."],
};
// Schüler:in D: holt nur das KI-Feedback und gibt nicht ab → „Erstversuch ohne Überarbeitung“ (orange in der Lehrkraft-Ansicht)
const D = {
  input: { vorname: "tom", nachname: "ze", geb: "--02-02", klasse: "9c" },
  person: { vorname: "Tom", nachname: "Ze", geburtsdatum: "--02-02", klasse: "9c" },
  first: ["Das Gewissen ist so etwas wie ein innerer Richter.", "Ich habe beim Test abgeschrieben und mich danach mies gefühlt.", "Ich will es dann wiedergutmachen."],
};
// Schüler:in E: die KI bleibt ausgelastet → bricht das Warten zweimal ab, sieht dann den Grund (gibt nicht ab)
const E = {
  input: { vorname: "ida", nachname: "kr", geb: "--09-09", klasse: "8b" },
  first: ["Das Gewissen ist wie eine innere Stimme.", "Ich habe gelogen.", "Nicht gut."],
};
const RECIPIENT_SUFFIX = " (Betreiber und Sitz: vom Betreiber dieser Seite zu prüfen)";   // Empfänger-Label des eigenen Dienstes
// KI-Einstellungen: Workers AI ohne Schlüssel; Reserve im selben Cloudflare-Konto
const KEYLESS_HINT = "Kein API-Schlüssel nötig – der Server nutzt Workers AI in seinem eigenen Cloudflare-Konto.";
const AI_SAME_ACCOUNT = "Cloudflare Workers AI ist schon der erste Anbieter. Eine Reserve im selben Cloudflare-Konto bringt kein zusätzliches Kontingent – bitte einen anderen Anbieter wählen.";
const AI_SAME_RESERVE = "Die Reserve-KI ist schon Cloudflare Workers AI – beide teilten sich dasselbe Kontingent des Cloudflare-Kontos. Bitte zuerst die Reserve ändern oder entfernen.";
const AI_MAIN_FIRST = "Bitte zuerst den ersten Anbieter speichern – die Reserve-KI springt nur für ihn ein.";
const CF_TIER = "Kostenloses Kontingent: 10.000 Neurons pro Tag für das ganze Cloudflare-Konto (Neustart 0:00 Uhr UTC).";
const CF_RECIPIENT = "Cloudflare, Inc. (San Francisco, USA) – betreibt auch den Server, der die Abgaben speichert";
const GROQ_RECIPIENT = "Groq LLC (USA) – Vertragspartner im EWR: Groq UK Limited (London); Datenhaltung in den USA, Verarbeitung auch in anderen Ländern";
const QUOTA_REASON = "KI-Kontingent für heute aufgebraucht";
const FB_VOLUNTARY = "Das KI-Feedback ist freiwillig – du kannst auch ohne KI-Feedback abgeben, ohne dass dir daraus ein Nachteil entsteht.";
const FIN_TEXT = "Wenn du alle Aufgaben bearbeitet hast, kannst du die KI um ein Feedback bitten und deine Antworten danach überarbeiten. " + FB_VOLUNTARY;
const SUBMIT_HINT_NO_FB = "Du kannst auch ohne KI-Feedback abgeben – dann geht bei der Abgabe nichts an die KI. Deine Antworten werden verschlüsselt; nur deine Lehrkraft kann sie lesen.";
// Abgabe-Dialog ohne KI-Feedback, wenn das KI-Feedback nicht möglich war (Grund) bzw. noch nie versucht wurde
const NO_FB_TAIL = " Du kannst es später noch einmal versuchen oder jetzt ohne KI-Feedback abgeben – ohne dass dir daraus ein Nachteil entsteht.\nNach der Abgabe kannst du deine Antworten nicht mehr ändern. Bei der Abgabe geht nichts an die KI. Deine Antworten gehen verschlüsselt an deine Lehrkraft; sie sieht, dass das KI-Feedback nicht möglich war.";
const noFbDialog = (reason) => "Das KI-Feedback hat bisher nicht geklappt (" + reason + ")." + NO_FB_TAIL;
const ORANGE = "rgb(184, 92, 0)";   // .st-first
// Rechtschreibprüfung: Selbstauskunft im Dialog (Altersgrenze des Anbieters) und Hinweis nach „Trifft nicht zu“
const LT_CONSENT = "Die Prüfung übernimmt LanguageTool (languagetool.org, Betreiber Learneo, Inc., USA). Dabei wird nur der Text dieser Antwort an LanguageTool gesendet – ohne deinen Namen oder deine Angaben, aber mit der Internetadresse deines Geräts. Die Prüfung ist freiwillig.\n\n" +
  "Laut Anbieter darfst du LanguageTool nur nutzen, wenn du\n• mindestens 18 Jahre alt bist oder\n• 16 oder 17 Jahre alt bist und deine Eltern es dir erlaubt haben.\n\n" +
  "Trifft das nicht auf dich zu, wähle „Trifft nicht zu“ – du schreibst und gibst ganz normal ab, ohne Nachteil.\nDie Bestätigung gilt, solange dieses Feibeitsblatt geöffnet ist.";
const LT_OFF = "Rechtschreibprüfung (LanguageTool): erst ab 16 Jahren – mit 16 und 17 nur mit Erlaubnis deiner Eltern.";
const LT_PRIVACY = "Die Rechtschreibprüfung ist freiwillig, laut Anbieter erst ab 16 Jahren (mit 16 und 17 nur mit Erlaubnis deiner Eltern) und läuft nur nach deiner Bestätigung";
const ATTEMPT = /^[0-9a-f]{16}$/;
// Datenschutz: verantwortlich ist der Betreiber (fest in index.html, window.FEIBEITSBLATT_OPERATOR – bei einer eigenen Installation
// hier dieselben Angaben eintragen), keine Schule; Kennzeichnung KI-erzeugter Inhalte
const OP = { name: "Jan-Rickmer Feindt", addr: "An der Bauna 30, 34270 Schauenburg, Deutschland", email: "j.feindt@kollegium.lg-ks.de" };
const OP_AUTH = "Der Hessische Beauftragte für Datenschutz und Informationsfreiheit, Gustav-Stresemann-Ring 1, 65189 Wiesbaden";
const OP_AUTH_URL = "https://datenschutz.hessen.de";
const OP_RESP = OP.name + ", " + OP.addr + ", E-Mail: " + OP.email + ". Feibeitsblatt ist ein privates, nicht kommerzielles und kostenloses Angebot – kein Angebot einer Schule.";
const OP_SHORT = "Verantwortlich ist " + OP.name + " – Feibeitsblatt ist ein privates, kostenloses Angebot.";
const OP_COMPLAIN = "Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren – für den Betreiber zuständig ist: " + OP_AUTH + ", datenschutz.hessen.de (öffnet in neuem Tab).";
const OP_INFO = "Verantwortlich für den Datenschutz: " + OP.name + " (Betreiber dieser Seite, privates Angebot). ";
// Rechtsgrundlagen (du-Form): Bearbeiten/Abgeben/KI-Feedback (b), Tippzeiten (f, Widerspruch per Schalter), LanguageTool (a),
// Aufruf/Missbrauchsschutz (f), Speicher im Browser (§ 25 TDDDG – nur Angaben und Antworten im Zwischenstand, nicht die Tippzeiten)
const TT_USE = "nur als Anlass für ein Gespräch über die Arbeitsweise – nicht für Noten und nicht bei einem Täuschungsverdacht";
const TT_SWITCH = "Tippzeiten für dieses Feibeitsblatt nicht messen", TT_SWITCH_G = "Tippzeiten für euer Feibeitsblatt nicht messen";
// Tippzeiten im ausführlichen Hinweis (du-Form, Blatt mit KI-Feedback): Zweck, Wirkung und Geltungsbereich des Schalters für den
// Widerspruch – was zum Zwischenstand gesagt wird, folgt dem Schalter TT_KEEP_IN_DRAFT (beide Stellungen)
const TT_PURPOSE = "Beim Schreiben misst diese Seite außerdem die Tippzeiten – wie viel Zeit zwischen zwei eingegebenen Zeichen vergeht –, um den Schreibprozess sichtbar zu machen: " +
  "Deine Lehrkraft sieht deine Antworten farbig markiert und den Anteil roter Zeichen in Prozent (je Aufgabe und für die ganze Abgabe); rot sind Zeichen, die sehr schnell oder zusammen mit anderen in einem Zug entstanden sind, zum Beispiel " +
  "durch Wortvorschläge, Autokorrektur, Diktat oder einen übernommenen Korrekturvorschlag des Browsers. So kann sie bei Auffälligkeiten mit dir über deine Arbeitsweise sprechen. " +
  "Die Färbung dient " + TT_USE + "; sie ist kein Beweis, und es gibt keine automatische Entscheidung. Beim Schreiben zeigt dir die Seite die Messung nicht an.";
// erste Ebene (Kurzfassung auf dem Angaben-Bildschirm und in der Vorschau der Lehrkraft, Hinweis im Schreibbereich): zur Tippzeit-Messung
// genau dieser eine neutrale Satz (Gruppe auf dem Angaben-Bildschirm: „ihr“-Form) – Schalter, Wirkung und Geltungsbereich stehen im
// eigenen Abschnitt „Widerspruch gegen die Tippzeit-Messung“ des ausführlichen Hinweises (Entscheidung des Betreibers, zweite Fassung)
const TT_SHORT = "Beim Schreiben misst diese Seite außerdem die Tippzeiten; widersprechen kannst du unter „Alle Informationen zum Datenschutz“.";
const TT_SHORT_G = "Beim Schreiben misst diese Seite außerdem die Tippzeiten; widersprechen könnt ihr unter „Alle Informationen zum Datenschutz“.";
const TT_OBJ_HEAD = "Widerspruch gegen die Tippzeit-Messung";
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NO_TT = /Tippzeit|misst|Messung|gemessen|Zeitmess|Schreibprozess|widersprech|Widerspruch|Schalter|Haken/i;
// Feibeitsblatt als Finale eines Escape-Rooms: Sätze im Datenschutzhinweis (ein Blatt mit Namen, „Impressum & Datenschutz“ allgemein)
const ESC_PURPOSE = (name) => `Dieses Feibeitsblatt ist das Finale des Escape-Rooms „${name}“: Damit du nichts noch einmal eintragen musst, übernimmt diese Seite deine Angaben und Ergebnisse aus dem Escape-Room, und deine Lehrkraft sieht, wie du die Stationen gelöst hast.`;
const ESC_PURPOSE_GENERAL = "Ist ein Feibeitsblatt das Finale eines Escape-Rooms, übernimmt diese Seite deine Angaben und Ergebnisse aus dem Escape-Room, damit du nichts noch einmal eintragen musst, und deine Lehrkraft sieht, wie du die Stationen gelöst hast.";
const ESC_DATA = (name) => `Bei einem Escape-Room-Finale übernimmt diese Seite aus dem Escape-Room${name ? ` „${name}“` : ""} deinen vollen Namen, dein Geburtsdatum, deine Klasse, deinen Bestätigungscode und deine Ergebnisse ` +
  "(je Station die Zahl der Versuche und die Fehler im ersten Versuch mit deinen Antworten, die Lösungserläuterungen, wann du fertig warst und wann du Zwischenstand-Dateien des Escape-Rooms genutzt hast). " +
  "Daraus bildet sie deine Kürzel und deinen Geburtstag ohne Jahr. Sie gehören zum Bearbeiten und Abgeben (Art. 6 Abs. 1 Buchst. b DSGVO; im Zwischenstand auf diesem Gerät § 25 Abs. 2 Nr. 2 TDDDG).";
const ESC_TEACHER = "Bei einem Escape-Room-Finale bekommt deine Lehrkraft verschlüsselt auch deine Ergebnisse aus dem Escape-Room und ob die Prüfsumme des Datensatzes stimmt – nicht deinen vollen Namen, " +
  "dein Geburtsdatum, deinen Bestätigungscode oder die Lösungserläuterungen. Gespeichert werden diese Ergebnisse wie deine Antworten nur verschlüsselt bei Cloudflare (Server und Datenbank dieser Seite). " +
  "An einen KI-Dienst gehen die Daten aus dem Escape-Room nie.";
const ESC_MAIL = "Nur wenn deine Abgabe bei einem Escape-Room-Finale wegen eines technischen Fehlers scheitert und du deine Abschluss-PDF per E-Mail schickst: der Betreiber (" + OP.name + ", E-Mail " + OP.email + "). " +
  "Die Datei enthält deinen vollen Namen, dein Geburtsdatum, deinen Bestätigungscode, deine Antworten, das KI-Feedback und deine Ergebnisse aus dem Escape-Room; sie geht unverschlüsselt über deinen E-Mail-Anbieter und den des Betreibers.";
const ESC_STAY = "Bei einem Escape-Room-Finale stehen dein voller Name, dein Geburtsdatum und dein Bestätigungscode bis zur Abgabe auch in deinem Zwischenstand und in jeder Zwischenstand-PDF-Datei, " +
  "die du sicherst, und – wenn du sie herunterlädst – in deiner Abschluss-PDF; diese Dateien löschst du selbst. Der Link aus dem Escape-Room enthält dieselben Daten: Diese Seite entfernt ihn " +
  "sofort aus der Adresszeile, im Verlauf deines Browsers bleibt er aber in der Regel stehen – lösche ihn dort auf einem geteilten Gerät. " +
  "Ist die Synchronisierung des Verlaufs eingeschaltet (z. B. über ein Google- oder Firefox-Konto), gelangt er auch dorthin. " +
  "Schickst du deine Abschluss-PDF nach einer gescheiterten Abgabe per E-Mail an den Betreiber, bewahrt der Betreiber sie auf, bis deine Lehrkraft sie übernommen hat.";
// Kurzfassung (Locator): genau einmal der Satz, sonst kein Wort zur Messung
async function expectTtShort(loc, sentence = TT_SHORT) {
  const txt = await loc.textContent();
  expect(txt.split(sentence).length - 1, txt).toBe(1);
  expect(txt.split(sentence).join(" ")).not.toMatch(NO_TT);
}
// … und sonst nirgends, solange „Alle Informationen zum Datenschutz“ zu ist: alles Sichtbare (innerText lässt den Inhalt eines
// geschlossenen details weg), dazu Namen und Beschreibungen sichtbarer Elemente (aria-label, title, placeholder, alt und die Texte
// hinter aria-labelledby/-describedby), auch in einem offenen Dialog; n = wie oft der Satz sichtbar ist (eine Kurzfassung je Bildschirm)
async function expectOnlyTtShort(page, where, n = 1) {
  const r = await page.evaluate(([src, shorts]) => {
    const re = new RegExp(src, "i"), out = [], strip = (x) => shorts.reduce((y, k) => y.split(k).join(" "), x);
    const text = document.body.innerText;
    let count = 0; for (const k of shorts) count += text.split(k).length - 1;
    for (const d of document.querySelectorAll("details.privfull")) if (d.open && d.checkVisibility()) out.push("offen: " + (d.parentElement.id || d.id));
    for (const line of strip(text).split("\n")) if (re.test(line)) out.push(line.trim());
    for (const el of document.querySelectorAll("[aria-label], [title], [placeholder], [alt], [aria-labelledby], [aria-describedby]")) {
      if (!el.checkVisibility()) continue;
      for (const a of ["aria-label", "title", "placeholder", "alt"]) { const v = el.getAttribute(a); if (v && re.test(strip(v))) out.push(a + ": " + v); }
      for (const a of ["aria-labelledby", "aria-describedby"]) {
        for (const id of (el.getAttribute(a) || "").split(/\s+/).filter(Boolean)) {
          const t = document.getElementById(id);
          if (t && re.test(strip(t.textContent))) out.push(a + " #" + id + ": " + t.textContent.trim());
        }
      }
    }
    return { out, count };
  }, [NO_TT.source, [TT_SHORT, TT_SHORT_G]]);
  expect(r.out, where).toEqual([]);
  expect(r.count, where).toBe(n);
}
const BACKUP = "bis zu 7 Tage (bei einem bezahlten Cloudflare-Tarif bis zu 30 Tage)";
const TT_EFFECT = "Setzt du den Haken, misst diese Seite bei diesem Feibeitsblatt keine Tippzeiten mehr und verwirft die schon gemessenen" + (TT_KEEP ? " – auch in deinem Zwischenstand" : "") + ". " +
  "Einen schon an deine Lehrkraft gesendeten Erstversuch ersetzt sie durch einen ohne Tippzeiten; die alte Fassung bleibt verschlüsselt noch " + BACKUP + " in der Datensicherung der Datenbank. " +
  "Bei deiner Abgabe sieht deine Lehrkraft dann „ohne Messung (widersprochen)“ – das ist dein Recht und für deine Lehrkraft kein Anlass für einen Verdacht. " +
  "Nimmst du den Haken wieder weg, misst die Seite erst ab dann wieder.";
const TT_SCOPE = "Der Haken gilt für deine Bearbeitung auf diesem Gerät und für Zwischenstand-PDF-Dateien, die du danach sicherst. " +
  "Fängst du auf einem anderen Gerät oder nach „Abbrechen und Zwischenstand löschen“ neu an, setze ihn erneut. " +
  (TT_KEEP ? "Eine schon gesicherte Zwischenstand-PDF-Datei enthält die bisherigen Tippzeiten weiter – lösche sie und sichere den Zwischenstand bei Bedarf neu. " : "") +
  "Einen Erstversuch, den du auf einem anderen Gerät gesendet hast, kann diese Seite nicht ersetzen – wende dich dafür an deine Lehrkraft (sie kann ihn löschen). " +
  "Nach der Abgabe lassen sich die Tippzeiten nur zusammen mit deiner ganzen Abgabe löschen – wende dich für einen Widerspruch dann an deine Lehrkraft oder an den Betreiber.";
const TT_EFFECT_G = "Setzt ihr den Haken, misst diese Seite bei eurem Feibeitsblatt keine Tippzeiten mehr und verwirft die schon gemessenen" + (TT_KEEP ? " – auch in eurem Zwischenstand" : "") + ". " +
  "Einen schon an eure Lehrkraft gesendeten Erstversuch ersetzt sie durch einen ohne Tippzeiten; die alte Fassung bleibt verschlüsselt noch " + BACKUP + " in der Datensicherung der Datenbank. " +
  "Bei eurer Abgabe sieht eure Lehrkraft dann „ohne Messung (widersprochen)“ – das ist euer Recht und für eure Lehrkraft kein Anlass für einen Verdacht. " +
  "Nehmt ihr den Haken wieder weg, misst die Seite erst ab dann wieder.";
const TT_SCOPE_G = "Der Haken gilt für eure Bearbeitung auf diesem Gerät und für Zwischenstand-PDF-Dateien, die ihr danach sichert. " +
  "Fangt ihr auf einem anderen Gerät oder nach „Abbrechen und Zwischenstand löschen“ neu an, setzt ihn erneut. " +
  (TT_KEEP ? "Eine schon gesicherte Zwischenstand-PDF-Datei enthält die bisherigen Tippzeiten weiter – löscht sie und sichert den Zwischenstand bei Bedarf neu. " : "") +
  "Einen Erstversuch, den ihr auf einem anderen Gerät gesendet habt, kann diese Seite nicht ersetzen – wendet euch dafür an eure Lehrkraft (sie kann ihn löschen). " +
  "Nach der Abgabe lassen sich die Tippzeiten nur zusammen mit eurer ganzen Abgabe löschen – wendet euch für einen Widerspruch dann an eure Lehrkraft oder an den Betreiber.";
// „Welche Daten?“: Zugriff auf das Gerät im Sinne von § 25 TDDDG – nur die Tatsache (Zwischenstand nur mit TT_KEEP_IN_DRAFT); bei Blättern
// mit KI-Feedback (alle Prüfungen hier) hält die Seite sie nach der Abgabe, bis die zweite Rückmeldung nachgereicht ist (TT_HELD)
const TT_HELD = " (und, wenn die KI-Rückmeldung zu deiner abgegebenen Fassung noch nachgereicht wird, bis dahin)";
const TT_HELD_G = " (und, wenn die KI-Rückmeldung zu eurer abgegebenen Fassung noch nachgereicht wird, bis dahin)";
const TT_ACCESS = "Für die Tippzeiten liest diese Seite beim Schreiben in deinem Browser die Zeitpunkte deiner Eingaben aus" +
  (TT_KEEP ? ", hält sie bis zur Abgabe" + TT_HELD + " im Arbeitsspeicher und speichert die Tippzeiten bis zur Abgabe auch in deinem Zwischenstand in diesem Browser" : " und hält sie bis zur Abgabe" + TT_HELD + " im Arbeitsspeicher") +
  " (nach einem Widerspruch nicht mehr) – das ist ein Zugriff auf dein Gerät im Sinne von § 25 TDDDG.";
const TT_ACCESS_G = "Für die Tippzeiten liest diese Seite beim Schreiben in eurem Browser die Zeitpunkte eurer Eingaben aus" +
  (TT_KEEP ? ", hält sie bis zur Abgabe" + TT_HELD_G + " im Arbeitsspeicher und speichert die Tippzeiten bis zur Abgabe auch in eurem Zwischenstand in diesem Browser" : " und hält sie bis zur Abgabe" + TT_HELD_G + " im Arbeitsspeicher") +
  " (nach einem Widerspruch nicht mehr) – das ist ein Zugriff auf euer Gerät im Sinne von § 25 TDDDG.";
// „Wie lange …?“: Tippzeiten im Zwischenstand und in einer Zwischenstand-PDF (die bleibt, bis sie gelöscht wird) – nur mit TT_KEEP_IN_DRAFT
const TT_STAY = "Die Tippzeiten gehören zu Erstversuch und Abgabe und werden mit ihnen gelöscht; " + (TT_KEEP
  ? "bis zur Abgabe stehen sie auch in deinem Zwischenstand – und in jeder Zwischenstand-PDF-Datei, die du sicherst, bis du sie löschst."
  : "bis zur Abgabe" + TT_HELD + " hält diese Seite sie nur im Arbeitsspeicher – in deinem Zwischenstand und in einer Zwischenstand-PDF-Datei stehen sie nicht.");
// Rechtsgrundlagen: Tippzeiten eigene Grundlage (Buchst. f); Buchst. b und § 25 TDDDG nehmen sie ausdrücklich aus
const ttWhere = (your, withAi) => [TT_KEEP && "in " + your + " Zwischenstand", withAi && "im Erstversuch", "in der Abgabe"].filter(Boolean).join(", ").replace(/, (?=[^,]*$)/, " und ");
// Buchst. b nimmt die Tippzeiten aus – ohne TT_KEEP nur bei Erstversuch und Abgabe (im Zwischenstand stehen dann keine)
const ttOutB = (withAi) => " (" + (TT_KEEP ? "" : withAi ? "bei Erstversuch und Abgabe " : "bei der Abgabe ") + "außer den Tippzeiten darin, siehe nächster Punkt)";
const privBases = (withAi, deliver) => [
  "Bearbeiten und Abgeben – deine Angaben (bei Partner- oder Gruppenarbeit auch die Kürzel der anderen), dein Zwischenstand" + (withAi ? ", der Erstversuch" : "") + " und die Abgabe" + ttOutB(withAi) +
    (withAi ? " – und das KI-Feedback, wenn du es anforderst: " : ": ") + "Art. 6 Abs. 1 Buchst. b DSGVO. Du nutzt dieses kostenlose Angebot und forderst " + (withAi ? "diese Funktionen" : "es") + " selbst an.",
  "Tippzeiten (wie viel Zeit zwischen zwei eingegebenen Zeichen vergeht; sie stehen " + ttWhere("deinem", withAi) + "): " +
    "Art. 6 Abs. 1 Buchst. f DSGVO – das berechtigte Interesse, den Schreibprozess sichtbar zu machen, damit deine Lehrkraft bei Auffälligkeiten mit dir über deine Arbeitsweise sprechen kann; " +
    "die Tippzeiten dienen " + TT_USE + ". Der Messung kannst du widersprechen – mit dem Schalter „" + TT_SWITCH + "“ (siehe „" + TT_OBJ_HEAD + "“).",
  "Rechtschreibprüfung (LanguageTool): deine Einwilligung, Art. 6 Abs. 1 Buchst. a DSGVO. Du gibst sie mit dem Klick auf „Rechtschreibung und Grammatik prüfen“ und deiner Bestätigung im Dialog – ohne Bestätigung wird nichts gesendet. " +
    "Du kannst sie jederzeit für die Zukunft widerrufen, indem du die Prüfung nicht mehr nutzt.",
  "Aufruf und Auslieferung dieser Seite (" + deliver + ") und Schutz vor Missbrauch und Überlastung (Zähler mit unkenntlich gemachter IP-Adresse): Art. 6 Abs. 1 Buchst. f DSGVO – " +
    "das berechtigte Interesse, die Seite sicher und zuverlässig bereitzustellen. Dagegen kannst du Widerspruch einlegen (siehe „Deine Rechte“).",
  "Speichern im Browser deines Geräts (dein Zwischenstand" + (TT_KEEP ? " – außer den Tippzeiten darin –" : "") + ", die Häkchen einer Checkliste): § 25 Abs. 2 Nr. 2 TDDDG – für die von dir gewünschte Funktion unbedingt erforderlich.",
];
const DELIVER_WORKER = "über Cloudflare; die Checklisten-Seite über GitHub Pages";   // Tests: die Seite kommt vom Worker, der QR-Code führt auf GitHub Pages
const PRIV_HEADS = ["Wer ist verantwortlich?", "Wozu werden deine Daten verarbeitet?", "Rechtsgrundlage", "Welche Daten?",
  "Wer bekommt die Daten?", "Wie lange werden die Daten gespeichert?", "Musst du mitmachen?", "Entscheidet die KI über dich?", TT_OBJ_HEAD, "Deine Rechte"];
// Angaben-Bildschirm einer Partner- / Gruppenarbeit: derselbe Hinweis in der „ihr“-Form
const PRIV_HEADS_GROUP = ["Wer ist verantwortlich?", "Wozu werden eure Daten verarbeitet?", "Rechtsgrundlage", "Welche Daten?",
  "Wer bekommt die Daten?", "Wie lange werden die Daten gespeichert?", "Müsst ihr mitmachen?", "Entscheidet die KI über euch?", TT_OBJ_HEAD, "Eure Rechte"];
const KLASSE_HINT = "z. B. 8b oder E1. Deine Angaben gehen verschlüsselt an deine Lehrkraft, sobald du das KI-Feedback bekommst (als „Erstversuch“) – ohne KI-Feedback erst bei der Abgabe. Bis dahin bleibt dein Zwischenstand nur auf diesem Gerät.";
const AI_SOURCE = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";
// Partner- / Gruppenarbeit: Texte in der „ihr“-Form dort, wo es um alle geht (Angaben, Datenschutz-Kurzfassung, Rechtschreibprüfung)
const MEMBERS_HINT = "Tragt für jede Person die ersten drei Buchstaben des Vornamens und die ersten zwei des Nachnamens in ein Feld ein, z. B. „MaxMu“ für Max Mustermann (bei kürzerem Vornamen den ganzen Vornamen). Tragt nur Personen ein, die mitarbeiten – alle sollten wissen, dass ihre Kürzel mit eurer Abgabe an die Lehrkraft gehen.";
const KLASSE_HINT_GROUP = "z. B. 8b oder E1. Eure Angaben gehen verschlüsselt an eure Lehrkraft, sobald ihr das KI-Feedback bekommt (als „Erstversuch“) – ohne KI-Feedback erst bei der Abgabe. Bis dahin bleibt euer Zwischenstand nur auf diesem Gerät.";
const LT_CONSENT_GROUP = "Die Prüfung übernimmt LanguageTool (languagetool.org, Betreiber Learneo, Inc., USA). Dabei wird nur der Text dieser Antwort an LanguageTool gesendet – ohne eure Namen oder eure Angaben, aber mit der Internetadresse eures Geräts. Die Prüfung ist freiwillig.\n\n" +
  "Laut Anbieter darf LanguageTool nur nutzen, wer\n• mindestens 18 Jahre alt ist oder\n• 16 oder 17 Jahre alt ist und die Erlaubnis der Eltern hat.\n\n" +
  "Trifft das auf alle in eurer Gruppe zu? Wenn nicht, wählt „Trifft nicht auf alle zu“ – ihr schreibt und gebt ganz normal ab, ohne Nachteil.\nDie Bestätigung gilt, solange dieses Feibeitsblatt geöffnet ist.";
const GROUP_DATA = "bei Partner- oder Gruppenarbeit die Kürzel aller Mitglieder (je die ersten Buchstaben von Vor- und Nachnamen) und die Klasse, kein Geburtstag – wer die Angaben einträgt, trägt die Kürzel der anderen mit ein, deshalb sollen alle in der Gruppe davon wissen.";
// GRUPPE_SHOTS_OUT=<Ordner> npm run test:e2e speichert Bildschirmfotos von Arbeitsform, Gruppen-Angaben und Lehrkraft-Liste (375 und 1280 px)
const SHOTS_OUT = process.env.GRUPPE_SHOTS_OUT || "";
async function shots(page, name, widths = [375, 1280], out = SHOTS_OUT) {
  if (!out) return;
  await mkdir(out, { recursive: true });
  const vp = page.viewportSize();
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(out, `${name}-${w}.png`), fullPage: true });
  }
  await page.setViewportSize(vp);
}
const DAYS = 14;   // Löschfrist, die die Lehrkraft in Test 1b speichert
const deDate = (ms) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(ms));
// KI-Kennzeichnung einer Box: [data-ai-generated, data-ai-content, data-digital-source-type] (null = nicht gekennzeichnet)
const aiMarks = (loc) => loc.evaluate((e) => [e.getAttribute("data-ai-generated"), e.getAttribute("data-ai-content"), e.getAttribute("data-digital-source-type")]);
// Aufbau einer im Browser erzeugten PDF-Datei prüfen: startxref → xref, jeder Eintrag zeigt auf „n 0 obj“, /Size stimmt, jede /Length
// endet genau vor „endstream“ → {s (Latin-1), count, objAt(n) → Text des Objekts}; info = Nummer des Info-Objekts
function pdfStructure(buf, info = 5) {
  const s = buf.toString("latin1");
  const sx = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(s)[1]);
  const head = /^xref\n0 (\d+)\n/.exec(s.slice(sx));
  expect(head, "xref an startxref").not.toBeNull();
  const count = Number(head[1]), rows = s.slice(sx + head[0].length).split("\n").slice(0, count), offs = [];
  expect(rows[0]).toBe("0000000000 65535 f ");
  for (let i = 1; i < count; i++) {
    expect(rows[i]).toMatch(/^\d{10} 00000 n $/);
    offs[i] = Number(rows[i].slice(0, 10));
    expect(s.slice(offs[i], offs[i] + String(i).length + 6), "xref-Eintrag " + i).toBe(i + " 0 obj");
  }
  expect(s).toContain("/Size " + count + " /Root 1 0 R /Info " + info + " 0 R");
  for (const m of s.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    expect(s.slice(start + Number(m[1]), start + Number(m[1]) + 10), "/Length bei Byte " + m.index).toBe("\nendstream");
  }
  return { s, count, objAt: (n) => s.slice(offs[n], s.indexOf("endobj", offs[n])) };
}

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
const fmtBd = (b) => b.slice(5) + "." + b.slice(2, 4) + ".";   // "--05-04" → "04.05."
// Sichtbarer Text einer im Browser erzeugten PDF-Datei: alle „(…) Tj“ in Reihenfolge (WinAnsi-Oktal → Zeichen), mit Leerzeichen verbunden
const WIN = { 0x84: "„", 0x93: "“", 0x95: "•", 0x96: "–" };
const pdfShownText = (buf) => [...buf.toString("latin1").matchAll(/\(((?:\\[\s\S]|[^\\)])*)\) Tj/g)]
  .map((m) => m[1].replace(/\\([0-7]{3}|[\s\S])/g, (_, c) => (c.length === 3 ? WIN[parseInt(c, 8)] || String.fromCharCode(parseInt(c, 8)) : c))).join(" ");

/* ---------- Hilfen für den Schreibbereich ---------- */
async function enterCode(page, typed) {
  await page.fill("#code-input", typed);
  await page.press("#code-input", "Enter");
}
// Nach dem Code fragt die Seite nach der Arbeitsform: „Einzelarbeit“ → Angaben wie bisher (Kürzel, Geburtstag, Klasse)
async function chooseSingle(page) {
  await expect(page.locator("#screen-mode")).toHaveClass(/active/);
  await expect(page.locator("#mode-single")).toBeFocused();
  await page.click("#mode-single");
  await expect(page.locator("#screen-person")).toHaveClass(/active/);
}
async function fillPerson(page, input) {
  await expect(page.locator("#screen-mode.active, #screen-person.active")).toHaveCount(1);   // nach dem Code (Blatt geladen) oder schon gewählt
  if (await page.locator("#screen-mode.active").count()) await chooseSingle(page);
  await expect(page.locator("#p-vorname")).toBeFocused();   // die Seite setzt den Fokus kurz nach dem Öffnen; danach stiehlt sie ihn nicht mehr
  await page.fill("#p-vorname", input.vorname);
  await page.fill("#p-nachname", input.nachname);
  const [, mm, dd] = /^--(\d\d)-(\d\d)$/.exec(input.geb);   // Geburtstag "--MM-TT" → Felder Tag und Monat (ohne führende Null)
  await page.fill("#p-gtag", String(+dd));
  await page.fill("#p-gmonat", String(+mm));
  await page.fill("#p-klasse", input.klasse);
  await page.click("#p-btn");
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
}
async function typeAt(page, sel, text, opts) {   // opts z. B. { delay: 120 } (Tippzeiten: jede Taste mit Pause)
  await page.click(sel);
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text, opts);
}
async function requestFeedback(page, inDialog) {
  await expect(page.locator("#submit-btn")).toBeEnabled();   // das KI-Feedback ist freiwillig: Abgeben geht immer
  await page.click("#fb-btn");
  if (inDialog) { await expect(page.locator("#dlg.open")).toBeVisible(); await inDialog(); }
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
  // die Worker-Kopie (dist/) trägt das Kennzeichen aus scripts/build.mjs – die Kopie im Repository (GitHub Pages) nicht
  expect(await page.evaluate(() => document.querySelectorAll('meta[name="feibeitsblatt-host"][content="worker"]').length)).toBe(1);
  expect(await readFile(new URL("../../index.html", import.meta.url), "utf8")).not.toContain('<meta name="feibeitsblatt-host"');
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
  // Vorauswahl Workers AI ist noch nicht gespeichert: ein Hinweis, keine doppelte Aufforderung
  await expect(page.locator("#t-aiwarn")).toHaveText("Das KI-Feedback ist noch nicht eingerichtet. Schüler:innen können dann nur ohne KI-Feedback abgeben – bitte wählen Sie unter „KI-Einstellungen“ einen Anbieter (empfohlen: Cloudflare Workers AI, ohne API-Schlüssel) und klicken Sie auf „Speichern“.");
  // Neuinstallation: automatische Löschung nach 30 Tagen als Vorgabe – keine Warnung; verantwortlich ist der Betreiber (fest eingetragen)
  await expect(page.locator("#t-privwarn")).toBeHidden();
  await expect(page.locator("#t-privinfo")).toHaveText(OP_INFO + "Abgaben und Erstversuche werden 30 Tage nach dem Eingang automatisch gelöscht (Vorgabe – unter „Datenschutz und Löschfrist“ änderbar).");
  await expect(page.locator("#t-sheets-body")).toContainText("Noch keine Feibeitsblätter");

  // Die Einrichtung geht nur einmal (409), und die Tür liefert jetzt die KDF-Parameter fürs Anmelden
  const again = await request.post("/api/teacher/setup", { data: { doorCode: "1104", authKey: "x" } });
  expect(again.status()).toBe(409);
  expect((await again.json()).code).toBe("already_setup");
  const door = await (await request.post("/api/teacher/door", { data: { doorCode: "1104" } })).json();
  expect(door).toMatchObject({ ok: true, setup: true, kdf: { iterations: 600000 } });

  // KI-Einstellungen: Vorauswahl Cloudflare Workers AI – ohne Schlüssel, aktiv erst nach „Speichern“; lokal (wrangler dev --local)
  // antwortet Workers AI nie, der Verbindungstest sagt das
  await page.click("#t-ai");
  await expect(page.locator("#tv-ai")).toBeVisible();
  await expect(page.locator("#ai-save")).toBeEnabled();
  await expect(page.locator("#ai-prov")).toHaveValue("cloudflare");
  await expect(page.locator("#ai-prov option:checked")).toHaveText("Cloudflare Workers AI – Empfehlung (ohne API-Schlüssel)");
  const cfInfo = page.locator('.provinfo[data-prov="cloudflare"]');
  await expect(cfInfo).toBeVisible();
  await expect(cfInfo).toContainText("Die Datenbank liegt in der EU, die KI-Verarbeitung durch Workers AI kann aber auch außerhalb der EU stattfinden");
  await expect(cfInfo).toContainText("Der Server nutzt kein AI Gateway");
  await expect(page.locator("#ai-key-field")).toBeHidden();
  await expect(page.locator("#ai-keyless-hint")).toHaveText(KEYLESS_HINT + " Aktiv wird Workers AI erst, wenn Sie „Speichern“ klicken.");
  await expect(page.locator("#ai-usage")).toHaveText("Heute (UTC) geschätzt verbraucht: ca. 0 von 10.000 Neurons (0 Anfragen) – genau im Cloudflare-Dashboard unter „Workers AI“.");
  await expect(page.locator("#ai-usage")).not.toHaveClass(/\bover\b/);
  await page.click("#ai-test");   // nicht gespeichert: nichts wird getestet
  await expect(page.locator("#ai-status")).toHaveText("Bitte zuerst „Speichern“ klicken – erst dann ist Workers AI aktiv.");
  // Eine Reserve ohne gespeicherten ersten Anbieter wäre der einzige Empfänger: abgelehnt, bevor ein Dialog kommt
  await expect(page.locator("#ai2-prov")).toHaveValue("groq");
  await page.fill("#ai2-key", "gsk-e2e-nicht-gespeichert");
  await page.click("#ai2-save");
  await expect(page.locator("#dlg.open")).toHaveCount(0);
  await expect(page.locator("#ai2-status")).toHaveText(AI_MAIN_FIRST);
  await page.fill("#ai2-key", "");
  await page.click("#ai-save");
  await expect(page.locator("#ai-status")).toHaveText("Gespeichert. " + CF_TIER + " Mit „Verbindung testen“ prüfen Sie, ob die KI antwortet.");
  await expect(page.locator("#ai2-status")).toHaveText("");   // der Hinweis der Reserve gilt nicht mehr
  await expect(page.locator("#ai-keyless-hint")).toHaveText(KEYLESS_HINT);
  await page.click("#ai-test");
  await expect(page.locator("#ai-status")).toHaveText(/lokalen Entwicklung \(wrangler dev --local\) gibt es keine Verbindung/, { timeout: 60_000 });
  await expect(page.locator("#ai-status")).toHaveClass(/\bbad\b/);
  // Erfolgreicher Test über Workers AI (lokal nicht erreichbar → Antwort des Servers vorgegeben): Token-Zahlen ohne Inhalt
  const cfTest = { ok: true, which: "main", provider: "cloudflare", label: "Cloudflare Workers AI", model: "@cf/google/gemma-4-26b-a4b-it", sample: "Verbindung steht.",
    fallbacks: [], modelCount: 3, rotated: [], tierNote: CF_TIER, usage: { prompt_tokens: 1234, completion_tokens: 12, reasoning_tokens: 0 } };
  await page.route("**/api/teacher/ai/test", (route) => route.fulfill({ json: cfTest }));
  await page.click("#ai-test");
  await expect(page.locator("#ai-status")).toHaveText("Verbindung erfolgreich: Cloudflare Workers AI, Modell „@cf/google/gemma-4-26b-a4b-it“. Testantwort: „Verbindung steht.“ " + CF_TIER + " Token dieses Tests: 1.234 Eingabe, 12 Ausgabe (davon 0 im Denkmodus).");
  await expect(page.locator("#ai-status")).toHaveClass(/\bok\b/);
  await page.unroute("**/api/teacher/ai/test");
  // Eine Reserve im selben Cloudflare-Konto: sofort ein Hinweis, „Reserve speichern“ fragt gar nicht erst
  await page.selectOption("#ai2-prov", "cloudflare");
  await expect(page.locator("#ai2-status")).toHaveText(AI_SAME_ACCOUNT);
  await expect(page.locator("#ai2-key-field")).toBeHidden();
  await page.click("#ai2-save");
  await expect(page.locator("#dlg.open")).toHaveCount(0);
  await expect(page.locator("#ai2-status")).toHaveText(AI_SAME_ACCOUNT);
  // Ungeeignete Reserve: die Warnung steht im selben Dialog wie der weitere Empfänger (ein Dialog, nicht zwei); Abbrechen speichert nichts
  await page.selectOption("#ai2-prov", "gemini");
  await expect(page.locator("#ai2-status")).toHaveText("");
  await expect(page.locator("#ai2-info .provwarn")).toHaveText(/^Nicht für den Schuleinsatz geeignet: Laut den Zusatzbedingungen der Gemini-API/);
  await page.fill("#ai2-key", "AIza-e2e-nicht-gespeichert");
  await page.check("#ai2-gemini-ok");
  await page.click("#ai2-save");
  await expect(page.locator("#dlg-ok")).toHaveText("Trotzdem speichern");
  expect(await confirmDialog(page, "Weiteren KI-Empfänger hinzufügen?", false)).toMatch(/^Achtung: „Google Gemini“ ist für den Einsatz mit Schüler:innen nicht geeignet: Laut den Zusatzbedingungen [\s\S]* freigegeben hat\.\n\nMit dieser Reserve kann jede Feedback-Anfrage zusätzlich an „Google \(Gemini-API/);
  await expect(page.locator("#dlg.open")).toHaveCount(0);
  await expect(page.locator("#ai2-key-hint")).toHaveText("Keine Reserve-KI eingerichtet.");
  await page.fill("#ai2-key", "");
  await page.selectOption("#ai2-prov", "groq");
  await expect(page.locator("#ai2-status")).toHaveText("");
  // Ungeeignete Anbieter: gekennzeichnet (Option, roter Hinweis), Speichern nur nach Bestätigung – Abbrechen speichert nichts
  await page.fill("#ai-model", "@cf/test/x");
  await page.selectOption("#ai-prov", "gemini");
  await expect(page.locator("#ai-model")).toHaveValue("");   // eine Modell-ID passt nur zu ihrem Anbieter
  await expect(page.locator("#ai-prov option:checked")).toHaveText("Google Gemini – nicht für den Schuleinsatz geeignet");
  const warn = page.locator('.provinfo[data-prov="gemini"] .provwarn');
  await expect(warn).toBeVisible();
  await expect(warn).toHaveText(/^Nicht für den Schuleinsatz geeignet: Laut den Zusatzbedingungen der Gemini-API \(Stand 28\.04\.2026\) müssen Nutzer:innen mindestens 18 Jahre alt sein/);
  await expect(warn).toHaveCSS("color", RED);
  await expect(page.locator("#ai-key-field")).toBeVisible();
  await expect(page.locator("#ai-key-hint")).toHaveText("Noch kein Schlüssel gespeichert.");
  await page.fill("#ai-key", "AIza-e2e-nicht-gespeichert");
  await page.check("#ai-gemini-ok");
  await page.click("#ai-save");
  expect(await confirmDialog(page, "Anbieter trotz Warnung speichern?", false)).toMatch(/^„Google Gemini“ ist für den Einsatz mit Schüler:innen nicht geeignet: Laut den Zusatzbedingungen .* Speichern Sie diesen Anbieter nur, wenn der Betreiber dieser Seite \(verantwortlich für den Datenschutz\) ihn ausdrücklich geprüft und freigegeben hat\.$/);
  await expect(page.locator("#ai-status")).toHaveText("");
  for (const pv of ["openrouter", "cerebras"]) await expect(page.locator('#ai-prov option[value="' + pv + '"]')).toHaveText(/ – nicht für den Schuleinsatz geeignet$/);
  await page.click("#ai-back");
  await expect(page.locator("#t-aiinfo")).toHaveText("KI-Feedback über Cloudflare Workers AI.");   // gespeichert bleibt Workers AI
  // „Trotzdem speichern“: die Übersicht kennzeichnet den Anbieter weiter. Gespeichert wird hier nur scheinbar (Antworten des
  // Servers vorgegeben) – ein echter Gemini-Schlüssel wäre nötig; der Serverweg steht in den Unit-Tests.
  const geminiView = (j) => ({ ...j, provider: "gemini", label: "Google Gemini", model: "", defaultModel: "gemini-flash-latest", baseUrl: "", hasKey: true, ready: true,
    saved: true, keyless: false, keyHint: "…wert", keyError: undefined, quotaUntil: null });
  let geminiSaved = false, lastView = null;
  await page.route("**/api/teacher/ai", async (route) => {
    if (route.request().method() === "PUT") {   // nie zum Server
      geminiSaved = true;
      return route.fulfill({ json: { ...geminiView(lastView), warning: "Gespeichert, aber die Verbindung konnte nicht geprüft werden: Netzwerkfehler." } });
    }
    lastView = await (await route.fetch()).json();
    return route.fulfill({ json: geminiSaved ? geminiView(lastView) : lastView });
  });
  await page.click("#t-ai");
  await expect(page.locator("#ai-save")).toBeEnabled();   // openAi hat die Einstellungen geladen
  await page.selectOption("#ai-prov", "gemini");
  await page.fill("#ai-key", "AIza-e2e-nur-scheinbar-wert");
  await page.check("#ai-gemini-ok");
  await page.click("#ai-save");
  await confirmDialog(page, "Anbieter trotz Warnung speichern?");
  await expect(page.locator("#ai-status")).toHaveText("Gespeichert, aber die Verbindung konnte nicht geprüft werden: Netzwerkfehler.");
  await page.click("#ai-back");
  await expect(page.locator("#t-aiinfo")).toHaveText("KI-Feedback über Google Gemini – nicht für den Schuleinsatz geeignet.");
  await page.unroute("**/api/teacher/ai");
  // Tageskontingent aufgebraucht (Sperre bis 0:00 UTC) – lokal nicht herbeizuführen: Verbrauch und Sperre in der Antwort vorgegeben
  const until = Date.now() + 3 * 3600e3, untilText = await page.evaluate((ms) => {   // wie fmtUntil (Ortszeit des Browsers)
    const d = new Date(ms);
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + " um " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr";
  }, until);
  await page.route("**/api/teacher/ai", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const res = await route.fetch();
    return route.fulfill({ json: { ...(await res.json()), quotaUntil: until, usage: { day: "2026-10-22", requests: 37, neurons: 10012, limit: 10000 } } });
  });
  await page.click("#t-ai");
  await expect(page.locator("#ai-save")).toBeEnabled();
  await expect(page.locator("#ai-usage")).toHaveText("Heute (UTC) geschätzt verbraucht: ca. 10.012 von 10.000 Neurons (37 Anfragen) – genau im Cloudflare-Dashboard unter „Workers AI“. Tageskontingent aufgebraucht bis " + untilText + " (Neustart 0:00 Uhr UTC).");
  await expect(page.locator("#ai-usage")).toHaveClass(/\bover\b/);
  await expect(page.locator("#ai-usage")).toHaveCSS("color", RED);
  await page.click("#ai-back");
  await expect(page.locator("#t-aiinfo")).toHaveText("KI-Feedback über Cloudflare Workers AI. Das Tageskontingent von Cloudflare Workers AI ist aufgebraucht bis " + untilText + " (Neustart 0:00 Uhr UTC).");
  await page.unroute("**/api/teacher/ai");
  // Gespeichert, aber nicht nutzbar (älterer Deploy ohne Binding „AI“): nur der Grund – keine Aufforderung, etwas zu speichern
  const noBinding = "Workers AI ist für diesen Worker nicht eingerichtet (Binding „AI“ fehlt). Bitte den Workflow „Deploy“ erneut ausführen – die aktuelle wrangler.jsonc enthält es.";
  await page.route("**/api/teacher/ai", async (route) => route.fulfill({ json: { ...(await (await route.fetch()).json()), hasKey: false, ready: false, keyError: noBinding } }));
  await page.click("#t-ai");
  await expect(page.locator("#ai-save")).toBeEnabled();
  await page.click("#ai-back");
  await expect(page.locator("#t-aiwarn")).toHaveText(noBinding + " Bis dahin können Schüler:innen nur ohne KI-Feedback abgeben.");
  await expect(page.locator("#t-aiinfo")).toBeHidden();
  await page.unroute("**/api/teacher/ai");
  await page.click("#t-ai");
  await expect(page.locator("#ai-save")).toBeEnabled();
  await expect(page.locator("#ai-prov")).toHaveValue("cloudflare");
  await expect(page.locator("#ai-key")).toHaveValue("");
  // anderer OpenAI-kompatibler Dienst = Mock-KI
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
  expect(rtext).toContain("„127.0.0.1:"); expect(rtext).toContain("stimmen Sie sich mit dem Betreiber dieser Seite ab (verantwortlich für den Datenschutz, falls Sie es nicht selbst sind)");
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
  // Workers AI als Reserve (ohne Schlüssel): eigener Text im Entfernen-Dialog; der Konflikt-Hinweis beim ersten Anbieter
  // („Reserve ist schon Workers AI“) verschwindet mit dem Entfernen
  await page.selectOption("#ai2-prov", "cloudflare");
  await expect(page.locator("#ai2-key-field")).toBeHidden();
  await page.click("#ai2-save");
  expect(await confirmDialog(page, "Weiteren KI-Empfänger hinzufügen?")).toContain("„" + CF_RECIPIENT + "“");
  await expect(page.locator("#ai2-status")).toHaveText("Reserve gespeichert. " + CF_TIER + " Mit „Reserve testen“ prüfen Sie, ob sie antwortet.", { timeout: 30_000 });
  await page.selectOption("#ai-prov", "cloudflare");
  await expect(page.locator("#ai-status")).toHaveText(AI_SAME_RESERVE);
  await page.click("#ai2-remove");
  expect(await confirmDialog(page, "Reserve-KI entfernen?")).toBe("Die Reserve-KI (Cloudflare Workers AI) wird entfernt. Der erste Anbieter bleibt unverändert.");
  await expect(page.locator("#ai2-status")).toHaveText("Reserve-KI entfernt.");
  await expect(page.locator("#ai-status")).toHaveText("");
  await page.selectOption("#ai-prov", "custom");
  await expect(page.locator("#ai-model")).toHaveValue(AI_MODEL);   // gespeicherter Anbieter: sein Modell kommt zurück
  await page.click("#ai-back");
  await expect(page.locator("#t-aiinfo")).toHaveText(/^KI-Feedback über Eigener Dienst \(Modell: openai\/gpt-oss-120b\)\.$/);
  await expect(page.locator("#t-aiwarn")).toBeHidden();

  // Neues Feibeitsblatt: 3 Zeilen, Auftrag an die KI 1 per Strg+V (für die Lehrkraft erlaubt = Gegenprobe zur Sperre)
  await page.click("#t-new");
  await expect(page.locator("#tv-builder")).toBeVisible();
  await expect(page.locator("#b-rows > tr")).toHaveCount(3);
  // Spalte 2 ist der Auftrag an die KI (intern weiter „solution“): Kopf, Beschriftung, Platzhalter und Hinweis erklären ihn
  await expect(page.locator("table.builder thead th").nth(1)).toHaveText("Auftrag an die KI (nur für das KI-Feedback, für Schüler:innen unsichtbar)");
  await expect(page.locator('label[for="bs-1"]')).toHaveText("Auftrag an die KI 1");
  await expect(page.locator("#bs-1")).toHaveAttribute("placeholder", /^Worauf soll die KI beim Feedback achten\? z\. B\. „/);
  await expect(page.locator("#b-soltip")).toContainText("kein starres Ziel");
  await expect(page.locator("#b-soltip")).toContainText("Tipps zum Überarbeiten");
  await expect(page.locator("#b-soltip")).toContainText("Ohne Auftrag gibt es zu dieser Aufgabe kein KI-Feedback.");
  await expect(page.locator("#b-soltip b").nth(1)).toHaveText("Beispiel");
  for (const w of ["Musterlösung", "Kernpunkt", "angesprochen"]) await expect(page.locator("#tv-builder")).not.toContainText(w);
  await page.fill("#b-title", TITLE);
  // Aufgabenstellung: derselbe formatierbare Editor wie beim Material (Name über aria-labelledby, eigene Werkzeugleiste)
  await expect(page.locator("#bq-1")).toHaveAttribute("contenteditable", "true");
  await expect(page.locator("#bq-1")).toHaveAttribute("role", "textbox");
  await expect(page.locator("#bq-1")).toHaveAttribute("aria-placeholder", "Aufgabenstellung …");
  await expect(page.locator("#bq-1")).toHaveAccessibleName("Aufgabe 1");
  await expect(page.locator("#b-rows > tr").nth(0).locator('.bq-bar[role="toolbar"]')).toHaveAttribute("aria-label", "Formatierung der Aufgabenstellung 1");
  await expect(page.locator("#b-rows > tr").nth(0).locator(".bq-bar .fmtbtn")).toHaveText(["F", "K", "U", "Link"]);
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
  await row0.locator(".bmat .fmtbtn", { hasText: "U" }).click(); await page.keyboard.type("Hinweis:"); await row0.locator(".bmat .fmtbtn", { hasText: "U" }).click();
  await page.keyboard.type(" Quelle");
  for (let i = 0; i < 6; i++) await page.keyboard.press("Shift+ArrowLeft");   // „Quelle“ markieren
  await row0.locator(".bmat .fmtbtn", { hasText: "Link" }).click();
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
  await row0.locator(".bmat .fmtbtn", { hasText: "Link" }).click();
  await expect(page.locator("#ld-title")).toHaveText("Link bearbeiten");
  await expect(page.locator("#ld-url")).toHaveValue(LINK_URL);
  await expect(page.locator("#ld-remove")).toBeVisible();
  await page.click("#ld-cancel");
  await expect(ed1.locator("a")).toHaveCount(1);
  // Link bearbeiten („Übernehmen“): Text und Adresse ändern
  await ed1.locator("a").click();
  await row0.locator(".bmat .fmtbtn", { hasText: "Link" }).click();
  await expect(page.locator("#ld-ok")).toHaveText("Übernehmen");
  await page.fill("#ld-text", "Quelle 2"); await page.fill("#ld-url", LINK_URL2);
  await page.click("#ld-ok");
  await expect(ed1.locator("a")).toHaveText("Quelle 2");
  await expect(ed1.locator("a")).toHaveAttribute("href", LINK_URL2);
  // neuen Link ohne Markierung am Ende einfügen (Adresse ohne Schema → https://), dann wieder entfernen
  await ed1.click(); await page.keyboard.press("Control+End");
  await page.keyboard.type(" – ");
  await row0.locator(".bmat .fmtbtn", { hasText: "Link" }).click();
  await expect(page.locator("#ld-title")).toHaveText("Link einfügen");
  await expect(page.locator("#ld-text")).toHaveValue("");
  await page.fill("#ld-text", "Verlag"); await page.fill("#ld-url", "www.beispiel.de");
  await page.keyboard.press("Enter");
  await expect(ed1.locator("a")).toHaveCount(2);
  await expect(ed1.locator("a").nth(1)).toHaveAttribute("href", "https://www.beispiel.de/");
  await ed1.locator("a").nth(1).click();
  await row0.locator(".bmat .fmtbtn", { hasText: "Link" }).click();
  await expect(page.locator("#ld-url")).toHaveValue("https://www.beispiel.de/");
  await page.click("#ld-remove");
  await expect(ed1.locator("a")).toHaveCount(1);
  await expect(ed1).toContainText("Hinweis: Quelle 2 – Verlag");
  // Tab bleibt im Link-Dialog (erst den Anfangsfokus des Dialogs abwarten, dann vom letzten Knopf weiter)
  await row0.locator(".bmat .fmtbtn", { hasText: "Link" }).click();
  await expect(page.locator("#ld-text")).toBeFocused();
  await page.locator("#ld-ok").focus(); await page.keyboard.press("Tab");
  await expect(page.locator("#ld-text")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#ld-ok")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#linkdlg")).not.toHaveClass(/open/);
  // Werkzeugleiste: Zustand der Formatknöpfe folgt dem Cursor
  await ed1.locator("b").click();
  await expect(row0.locator('.bmat .fmtbtn[aria-pressed="true"]')).toHaveCount(1);
  await expect(row0.locator(".bmat .fmtbtn", { hasText: "F" })).toHaveAttribute("aria-pressed", "true");
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
  await expect(page.locator("#t-sel-det summary")).toHaveText("Aufgaben und Aufträge an die KI");
  await expect(page.locator("#t-sel-tasks .si")).toHaveCount(3);
  await expect(page.locator("#t-sel-tasks .si").nth(0).locator(".task-label").last()).toHaveText("Auftrag an die KI");
  await expect(page.locator("#t-sel-tasks .si").nth(0).locator(".sol")).toHaveText(TASKS[0].solution);
  await expect(page.locator("#t-sel-tasks .si").nth(2).locator(".sol")).toHaveText("– keiner (kein KI-Feedback) –");
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

// Am Worker (Tests: 127.0.0.1) ist die Checklisten-Seite hinter dem QR-Code eine andere Adresse (PUBLIC_URL, GitHub Pages)
const CHECK_GITHUB = "Nur wenn du eine Checkliste über den QR-Code öffnest: GitHub, Inc. (USA) liefert die Checklisten-Seite (feibeitsblatt.janrickmer.de) aus (GitHub Pages) " +
  "und verarbeitet dabei technisch die Internetadresse deines Geräts. Für Übermittlungen in die USA stützt sich GitHub auf das EU-US Data Privacy Framework, ersatzweise auf Standardvertragsklauseln.";
// Über GitHub Pages ausgeliefert: GitHub ist Empfänger für die ganze Seite
const GITHUB_PAGES_ITEM = "GitHub, Inc. (USA) liefert diese Seite aus (GitHub Pages) und verarbeitet dabei technisch die Internetadresse deines Geräts. Für Übermittlungen in die USA stützt sich GitHub auf das EU-US Data Privacy Framework, ersatzweise auf Standardvertragsklauseln.";
// Liste „Wer bekommt die Daten?“ im ausführlichen Hinweis (H = Ebene der Abschnittsüberschriften) – die Rechtsgrundlagen nennen GitHub Pages auch
const recipients = (loc, H) => loc.locator(H + '.privh:text-is("Wer bekommt die Daten?") + ul > li');
// Seite „Impressum & Datenschutz“ (#screen-legal) prüfen: Impressum aus window.FEIBEITSBLATT_OPERATOR, darunter der vollständige
// Hinweis mit Frist und KI-Empfängern von GET /api/privacy
async function checkLegal(lp, { days = 30, deliver = DELIVER_WORKER, github = CHECK_GITHUB } = {}) {
  await expect(lp.locator("#screen-legal")).toHaveClass(/active/);
  await expect(lp.locator("#legal-h")).toHaveText("Impressum & Datenschutz");
  await expect(lp.locator("#legal-h")).toBeFocused();
  await expect(lp.locator("#screen-legal h2").first()).toHaveText("Impressum");
  await expect(lp.locator(".legal-lead")).toHaveText("Angaben gemäß § 18 Abs. 1 Medienstaatsvertrag (MStV)");
  expect(await lp.locator("#legal-addr").innerText()).toBe("Jan-Rickmer Feindt\nAn der Bauna 30\n34270 Schauenburg\nDeutschland");
  await expect(lp.locator("#legal-mail")).toHaveText("E-Mail: " + OP.email);
  await expect(lp.locator("#legal-mail a")).toHaveAttribute("href", "mailto:" + OP.email);
  await expect(lp.locator(".legal-free")).toHaveText("Feibeitsblatt ist ein nicht kommerzielles Angebot und wird unentgeltlich bereitgestellt.");
  await expect(lp.locator("#legal-status")).toHaveText("");
  const lpriv = lp.locator("#legal-privfull");
  await expect(lpriv.locator("h2")).toHaveText("Datenschutzerklärung");   // offen, kein details – Abschnitte als h3
  await expect(lpriv.locator("details")).toHaveCount(0);
  await expect(lpriv.locator("h3.privh")).toHaveText(PRIV_HEADS);
  await expect(lpriv).toContainText(OP_RESP);
  await expect(lpriv.locator('h3.privh:text-is("Rechtsgrundlage") + ul > li')).toHaveText(privBases(true, deliver));
  await expect(lpriv).toContainText("wird " + days + " Tage nach dem Eingang auf dem Server automatisch gelöscht (oder kurz danach)");   // Frist von GET /api/privacy
  await expect(lpriv).toContainText(new RegExp("Nur wenn du das KI-Feedback anforderst: der KI-Dienst „127\\.0\\.0\\.1:\\d+ \\(Betreiber und Sitz: vom Betreiber dieser Seite zu prüfen\\)“\\."));   // Empfänger wie bei einem Blatt
  await expect(lpriv).toContainText("Grundlage einer Übermittlung außerhalb der EU: vom Betreiber dieser Seite beim Anbieter zu prüfen.");
  await expect(lpriv).toContainText("Wende dich dafür an den Betreiber (E-Mail: " + OP.email + ").");
  await expect(lpriv).toContainText("Einer Verarbeitung nach Art. 6 Abs. 1 Buchst. f DSGVO kannst du aus Gründen, die sich aus deiner besonderen Situation ergeben, jederzeit widersprechen (Art. 21 DSGVO).");
  await expect(lpriv).toContainText(OP_COMPLAIN);
  // Widerspruch gegen die Tippzeit-Messung: ohne geöffnetes Blatt kein Schalter, aber wo er steht und was er bewirkt
  await expect(lpriv.locator("input")).toHaveCount(0);
  // (eigener Abschnitt, gleiche Ebene wie die übrigen, vor „Deine Rechte“ – dort nur ein Verweis)
  await expect(lpriv.locator(`h3.privh:text-is("${TT_OBJ_HEAD}") + p`)).toHaveText("Der Messung der Tippzeiten kannst du direkt widersprechen, sobald du ein Feibeitsblatt geöffnet hast: Unter „Alle Informationen zum Datenschutz“ – " +
    "auf der Seite „Deine Angaben“ und im Schreibbereich unter den Aufgaben – steht im Abschnitt „" + TT_OBJ_HEAD + "“ der Schalter „" + TT_SWITCH + "“. " + TT_EFFECT + " " + TT_SCOPE);
  await expect(lpriv.locator(`h3.privh:text-is("${TT_OBJ_HEAD}") + p + h3`)).toHaveText("Deine Rechte");
  await expect(lpriv).toContainText("Der Tippzeit-Messung kannst du direkt mit einem Schalter widersprechen – siehe „" + TT_OBJ_HEAD + "“.");
  await expect(lpriv).toContainText(TT_PURPOSE);
  await expect(lpriv.locator('h3.privh:text-is("Welche Daten?") + p + p')).toHaveText(TT_ACCESS);   // § 25 TDDDG: nur die Tatsache
  await expect(recipients(lpriv, "h3").filter({ hasText: "GitHub" })).toHaveText([github]);
  const auth = lpriv.locator(`a[href="${OP_AUTH_URL}"]`);
  await expect(auth).toHaveAttribute("target", "_blank");
  await expect(auth).toHaveAttribute("rel", "noopener noreferrer");
  await expect(lp.locator("#legal-other")).toHaveText("Bei Feibeitsblättern ohne KI-Feedback (ohne Auftrag an die KI) entfallen die Angaben zum KI-Feedback – deine Antworten gehen dann an keine KI. " +
    "Bei Partner- oder Gruppenarbeit gilt alles ebenso für alle in der Gruppe; wer die Angaben einträgt, trägt die Kürzel der anderen mit ein. " +
    "Was für dein Feibeitsblatt gilt, steht nach der Eingabe des Codes auf der Seite „Deine Angaben“ und im Schreibbereich unter den Aufgaben.");
  // Feibeitsblatt als Finale eines Escape-Rooms: eigener Abschnitt in allgemeiner Form (der Hinweis darüber bleibt unverändert)
  const lesc = lp.locator("#legal-escape");
  await expect(lesc.locator("h2")).toHaveText("Feibeitsblatt als Finale eines Escape-Rooms");
  await expect(lesc.locator("p")).toHaveText([
    "Manche Feibeitsblätter sind das Finale eines Escape-Rooms: Du öffnest sie über den Link am Ende des Escape-Rooms oder mit deiner Überblick-PDF (auf der Startseite „Zwischenstand-PDF hochladen“); es gibt dann nur Einzelarbeit. Zusätzlich zu den Angaben oben gilt:",
    ESC_PURPOSE_GENERAL, ESC_DATA(""), ESC_TEACHER, ESC_MAIL, ESC_STAY]);
  await expect(lesc.locator(`a[href="mailto:${OP.email}"]`)).toHaveCount(1);
  for (const w of ["Deine Schule", "Datenschutzbeauftragte", "Schulgesetz", "HSchG", "frag deine Lehrkraft"]) await expect(lp.locator("#screen-legal")).not.toContainText(w);
  await expect(lp.locator("#foot-legal")).toBeHidden();   // auf der Seite selbst kein Link auf sich
  await expect(lp.locator("#pagefoot")).toContainText("Copyright Jan-Rickmer Feindt");
}
// Link „Impressum & Datenschutz“ in der Fußzeile: öffnet die Seite in einem neuen Tab (die erste Seite bleibt, wie sie war)
async function openLegalTab(page) {
  const foot = page.locator("#foot-legal");
  await expect(foot).toBeVisible();
  await expect(foot).toHaveText("Impressum & Datenschutz (öffnet in neuem Tab)");
  expect(await foot.evaluate((a) => [a.getAttribute("href"), a.target, a.rel])).toEqual(["#impressum", "_blank", "noopener"]);
  const ctx = page.context(), errors = [];
  const loaded = ctx.waitForEvent("response", (r) => new URL(r.url()).pathname === "/api/privacy");
  const [lp] = await Promise.all([ctx.waitForEvent("page"), foot.click()]);
  lp.on("pageerror", (e) => errors.push(String(e)));
  expect((await loaded).status()).toBe(200);
  expect(new URL(lp.url()).hash).toBe("#impressum");
  return { lp, errors };
}
// PRIVAT_SHOTS_OUT=<Ordner> npm run test:e2e speichert Bildschirmfotos der Seite „Impressum & Datenschutz“, des Lehrkraft-Bereichs
// „Datenschutz und Löschfrist“ und des Angaben-Bildschirms mit der Kurzfassung (375 und 1280 px)
const PRIVAT_SHOTS = process.env.PRIVAT_SHOTS_OUT || "";
test("1b Datenschutz: verantwortlich ist der Betreiber (privates Angebot) – „Impressum & Datenschutz“ über die Fußzeile (neuer Tab) und #impressum, auch über GitHub Pages; Lehrkraft: Betreiber schreibgeschützt, Löschfrist, Vorschau", async ({ browser }) => {
  // Schüler:in: Startseite mit Link in der Fußzeile → neuer Tab, die Startseite bleibt
  const s = await openPage(browser);
  const sp = s.page;
  await expect(sp.locator("#start-privacy")).toHaveText("Datenschutz: Beim Laden dieser Seite und beim Prüfen des Codes verarbeitet Cloudflare, Inc. (USA; betreibt den Server dieser Seite) technisch die Internetadresse (IP-Adresse) deines Geräts. " +
    "Alle Informationen zum Datenschutz – auch, wer verantwortlich ist – findest du unter „Impressum & Datenschutz“ ganz unten auf der Seite und nach der Eingabe des Codes passend zu deinem Feibeitsblatt.");
  const { lp, errors } = await openLegalTab(sp);
  await expect(sp.locator("#screen-start")).toHaveClass(/active/);
  await checkLegal(lp);
  await shots(lp, "impressum", [375, 1280], PRIVAT_SHOTS);
  // „← zur Startseite“: Hash weg, Startseite mit Fokus im Code-Feld
  await lp.click("#legal-home");
  await expect(lp.locator("#screen-start")).toHaveClass(/active/);
  expect(new URL(lp.url()).hash).toBe("");
  await expect(lp.locator("#code-input")).toBeFocused();
  await expect(lp.locator("#foot-legal")).toBeVisible();
  expect(errors).toEqual([]);
  await lp.close();
  // direkt über #impressum: nur der Hash ändert sich (hashchange) – und mit „Zurück“ wieder zur Startseite
  await sp.goto("/#impressum");
  await checkLegal(sp);
  await sp.goBack();
  await expect(sp.locator("#screen-start")).toHaveClass(/active/);
  // Abruf scheitert: allgemeine Angaben statt falscher (KI-Dienst wird vor dem Senden genannt, Frist nach der Eingabe des Codes)
  await sp.route("**/api/privacy", (r) => r.abort());
  await sp.goto("/#impressum");
  await expect(sp.locator("#legal-status")).toHaveText("Die aktuellen Angaben zum KI-Dienst und zur Löschfrist konnten gerade nicht geladen werden – deshalb stehen hier allgemeine Angaben. " +
    "Den KI-Dienst (und eine Reserve) nennt dir diese Seite, bevor etwas gesendet wird; die Löschfrist steht nach der Eingabe des Codes auf der Seite „Deine Angaben“.");
  await expect(sp.locator("#legal-privfull")).toContainText("Nur wenn du das KI-Feedback anforderst: der KI-Dienst, den deine Lehrkraft eingerichtet hat – und, falls sie eine Reserve eingerichtet hat, ein zweiter KI-Dienst, wenn der erste nicht antwortet, ausgelastet ist, sein Tageskontingent aufgebraucht hat oder kein brauchbares Feedback liefert. Diese Seite nennt dir jeden mit Sitz und Grundlage der Übermittlung, bevor etwas gesendet wird.");
  await expect(sp.locator("#legal-privfull")).toContainText("wird nach der Frist automatisch gelöscht, die deine Lehrkraft festgelegt hat – sie steht nach der Eingabe des Codes auf der Seite „Deine Angaben“");
  await expect(sp.locator("#legal-privfull")).toContainText(OP_RESP);
  await sp.unroute("**/api/privacy");
  await sp.click("#legal-home2");
  await expect(sp.locator("#screen-start")).toHaveClass(/active/);

  // Angaben-Bildschirm (Zeitpunkt der Erhebung): Kurzfassung und alle Informationen nennen den Betreiber; Frist 30 Tage (Vorgabe)
  await enterCode(sp, S.shown);
  await chooseSingle(sp);
  await expect(sp.locator("#p-klasse-hint")).toHaveText(KLASSE_HINT);   // die Angaben gehen schon mit dem KI-Feedback (Erstversuch) an die Lehrkraft
  const short = sp.locator("#p-privacy-short");
  await expect(short).toHaveText(new RegExp("^Datenschutz: " + OP_SHORT.replace(/[.()]/g, "\\$&") + " Auf dem Server werden deine Angaben und Antworten nur verschlüsselt gespeichert – lesen kann sie dort nur deine Lehrkraft\\. Nach 30 Tagen werden sie automatisch gelöscht\\. " +
    "Das KI-Feedback ist freiwillig: Nur wenn du es anforderst, gehen deine Antworten – ohne deine Angaben – an den KI-Dienst „127\\.0\\.0\\.1:\\d+ \\(Betreiber und Sitz: vom Betreiber dieser Seite zu prüfen\\)“, bei der Abgabe dann noch einmal die danach geänderten Antworten\\. Auch die Rechtschreibprüfung ist freiwillig\\. " +
    reEsc(TT_SHORT) + "$"));
  await expectTtShort(short);   // zur Tippzeit-Messung nur dieser eine Satz – Schalter, Wirkung und Geltungsbereich im ausführlichen Hinweis darunter
  await shots(sp, "angaben", [375, 1280], PRIVAT_SHOTS);
  const full = sp.locator("#p-privfull");
  expect(await full.evaluate((e) => e.open)).toBe(false);   // aufklappbar
  await full.locator("summary").click();
  await expect(full.locator("summary")).toHaveText("Alle Informationen zum Datenschutz");
  await expect(full.locator("h2.privh")).toHaveText(PRIV_HEADS);   // unter h1 „Deine Angaben“ → h2
  await expect(full).toContainText(OP_RESP + " Deine Angaben und Antworten liest deine Lehrkraft, die das Feibeitsblatt mit dem Lehrkraft-Zugang dieser Seite angelegt hat. Bei Fragen kannst du dich an den Betreiber oder an deine Lehrkraft wenden.");
  await expect(full.locator('h2.privh:text-is("Rechtsgrundlage") + ul > li')).toHaveText(privBases(true, DELIVER_WORKER));
  await expect(full).toContainText("wird 30 Tage nach dem Eingang auf dem Server automatisch gelöscht");
  await expect(full).toContainText("bis zu 7 Tage (bei einem bezahlten Cloudflare-Tarif bis zu 30 Tage)");
  // nie behaupten, der Server sehe die Antworten nur verschlüsselt: für das KI-Feedback verarbeitet er sie kurz unverschlüsselt
  await expect(full).toContainText("Für das KI-Feedback verarbeitet der Server deine Antworten – ohne deine Angaben – kurz unverschlüsselt, um sie an den KI-Dienst weiterzugeben; er speichert sie nicht.");
  await expect(full).toContainText("Grundlage einer Übermittlung außerhalb der EU: vom Betreiber dieser Seite beim Anbieter zu prüfen.");
  await expect(full).toContainText("Learneo ist nach dem EU-US Data Privacy Framework zertifiziert");
  await expect(full).toContainText("in Zählern, die Missbrauch und Überlastung verhindern (z. B. zu viele Abgaben aus einem Netz) – höchstens etwa einen Tag lang.");
  // die Checklisten-Seite hinter dem QR-Code eines ausgedruckten Arbeitsblattes verweist hierher: Zweck und Speicherdauer der Häkchen
  // Diese Seite kommt hier vom Worker, der QR-Code führt aber auf GitHub Pages (PUBLIC_URL): dort liegt die Checklisten-Seite
  await expect(full).toContainText("Bekommst du ein Feibeitsblatt ausgedruckt, kann ein QR-Code darauf zu einer Checkliste deiner Lehrkraft führen: Dort hakst du ab, was deine Antwort schon erfüllt. Dafür lädt die Checklisten-Seite (feibeitsblatt.janrickmer.de) nur die Checkliste vom Server – ohne Angaben zu dir; die Internetadresse deines Geräts wird dabei wie beim Laden der Seite verarbeitet. Deine Häkchen bleiben auf diesem Gerät und werden nicht gesendet.");
  await expect(full).toContainText("Die Häkchen einer solchen Checkliste löscht die Checklisten-Seite (feibeitsblatt.janrickmer.de) beim nächsten Aufruf in diesem Browser, wenn du sie 7 Tage nicht geändert hast; früher geht es mit „Alle Häkchen entfernen“.");
  await expect(full).toContainText("Deine Einwilligung zur Rechtschreibprüfung kannst du jederzeit für die Zukunft widerrufen – nutze die Prüfung dann einfach nicht mehr; Prüfungen, die schon stattgefunden haben, bleiben davon unberührt.");
  await expect(full).toContainText(OP_COMPLAIN);
  expect(await full.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")))).toEqual(["mailto:" + OP.email, "mailto:" + OP.email, OP_AUTH_URL]);
  // Tippzeiten: Zweck (nur als Anlass für ein Gespräch), Daten samt Zugriff auf das Gerät (§ 25 TDDDG), Empfänger, Speicherdauer,
  // Freiwilligkeit – und der Schalter im eigenen Abschnitt „Widerspruch gegen die Tippzeit-Messung“ vor „Deine Rechte“
  await expect(full).toContainText(TT_PURPOSE);
  await expect(full.locator('h2.privh:text-is("Welche Daten?") + p + p')).toHaveText(TT_ACCESS);
  await expect(full).toContainText("Außerdem deine Antworten mit ihren Tippzeiten (je eingegebenem Zeichen, wie viele Millisekunden seit dem vorangehenden Zeichen vergangen sind – längere Pausen nur als „mehr als 70 Millisekunden“, keine Uhrzeiten; nach einem Widerspruch keine), die KI-Rückmeldungen");
  await expect(recipients(full, "h2").first()).toHaveText("Deine Lehrkraft – nur sie kann deine auf dem Server gespeicherten Angaben und Antworten lesen. Sie sieht auch die Tippzeiten – als Färbung deiner Antworten; an einen KI-Dienst oder an die Rechtschreibprüfung gehen die Tippzeiten nie.");
  await expect(full).toContainText("Gespeichert werden deine Angaben und Antworten (samt Tippzeiten) dort nur verschlüsselt.");
  await expect(full).toContainText(TT_STAY);
  await expect(full).toContainText("Die Tippzeiten misst diese Seite, solange du nicht widersprichst (siehe „" + TT_OBJ_HEAD + "“).");
  await expect(full).toContainText("Einer Verarbeitung nach Art. 6 Abs. 1 Buchst. f DSGVO kannst du aus Gründen, die sich aus deiner besonderen Situation ergeben, jederzeit widersprechen (Art. 21 DSGVO). " +
    "Der Tippzeit-Messung kannst du direkt mit einem Schalter widersprechen – siehe „" + TT_OBJ_HEAD + "“. Deine Einwilligung zur Rechtschreibprüfung");
  const ttSw = full.getByRole("checkbox", { name: TT_SWITCH });
  // eigener Abschnitt: Überschrift (h2 wie die übrigen) → Schalter mit Wirkung und Geltungsbereich → „Deine Rechte“
  expect(await ttSw.evaluate((e) => { const b = e.closest(".ttoptbox"); return [b.previousElementSibling.tagName, b.previousElementSibling.className, b.previousElementSibling.textContent, b.nextElementSibling.textContent]; }))
    .toEqual(["H2", "privh", TT_OBJ_HEAD, "Deine Rechte"]);
  await expect(ttSw).toBeEnabled();
  await expect(ttSw).not.toBeChecked();
  // Wirkung und Geltungsbereich per aria-describedby (zwei Absätze); die Rückmeldung (role=status) direkt unter dem Schalter
  expect(await ttSw.evaluate((e) => [e.id, e.getAttribute("aria-describedby").split(" ").map((id) => document.getElementById(id).textContent),
    e.closest(".ttoptbox").firstElementChild.textContent, e.closest("label").nextElementSibling.className]))
    .toEqual(["p-privfull-ttoff", [TT_EFFECT, TT_SCOPE], "Der Messung der Tippzeiten kannst du direkt hier widersprechen:", "ttopt-st"]);
  expect(await ttSw.evaluate((e) => e.closest("label").getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);   // ganze Zeile klickbar
  // die Seite kommt hier vom Worker: GitHub nur für die Checklisten-Seite hinter dem QR-Code
  await expect(recipients(full, "h2").filter({ hasText: "GitHub" })).toHaveText([CHECK_GITHUB]);
  await expect(full).not.toContainText("liefert diese Seite aus");
  for (const w of ["sieht deine Angaben und Antworten nur verschlüsselt", "erst bei der Abgabe verschlüsselt an die Lehrkraft", "Deine Schule", "Datenschutzbeauftragte", "Schulgesetz"]) await expect(sp.locator("#screen-person")).not.toContainText(w);
  await closePage(s);

  // dieselbe Seite über GitHub Pages ausgeliefert (FEIBEITSBLATT_API ≠ ""): GitHub ist ein weiterer Empfänger (IP-Adresse)
  const gctx = await browser.newContext();
  await gctx.addInitScript(() => { window.FEIBEITSBLATT_API = location.origin; });
  const gp = await gctx.newPage();
  const gerrors = [];
  gp.on("pageerror", (e) => gerrors.push(String(e)));
  await gp.goto("/");
  await expect(gp.locator("#start-privacy")).toContainText("verarbeiten GitHub, Inc. (USA; liefert diese Seite aus) und Cloudflare, Inc. (USA; betreibt den Server dieser Seite)");
  const g = await openLegalTab(gp);   // der neue Tab bekommt dasselbe Init-Skript (GitHub Pages)
  await checkLegal(g.lp, { deliver: "über Cloudflare und GitHub Pages", github: GITHUB_PAGES_ITEM });
  expect(g.errors).toEqual([]);
  await g.lp.close();
  await gp.goto("/#impressum");
  await checkLegal(gp, { deliver: "über Cloudflare und GitHub Pages", github: GITHUB_PAGES_ITEM });
  await gp.click("#legal-home");
  await enterCode(gp, S.shown);
  await chooseSingle(gp);
  await gp.locator("#p-privfull summary").click();
  await expect(recipients(gp.locator("#p-privfull"), "h2").filter({ hasText: "GitHub" })).toHaveText([GITHUB_PAGES_ITEM]);
  await expect(gp.locator('#p-privfull h2.privh:text-is("Rechtsgrundlage") + ul > li')).toHaveText(privBases(true, "über Cloudflare und GitHub Pages"));
  await expect(gp.locator("#p-privfull")).toContainText("Dafür lädt diese Seite nur die Checkliste vom Server");   // hier ist es dieselbe Seite
  expect(gerrors).toEqual([]);
  await gctx.close();

  // Lehrkraft: keine Warnung (Frist 30 Tage gilt), Infozeile nennt den Betreiber → „Datenschutz und Löschfrist“
  const t = await openPage(browser);
  const page = t.page;
  await teacherLogin(page, PW);
  await expect(page.locator("#t-privwarn")).toBeHidden();
  await expect(page.locator("#t-privinfo")).toHaveText(OP_INFO + "Abgaben und Erstversuche werden 30 Tage nach dem Eingang automatisch gelöscht (Vorgabe – unter „Datenschutz und Löschfrist“ änderbar).");
  await page.click("#t-privacy");
  await expect(page.locator("#tv-privacy")).toBeVisible();
  await expect(page.locator("#tv-privacy h1")).toHaveText("Datenschutz und Löschfrist");
  await expect(page.locator("#tv-privacy .sub")).toHaveText("Feibeitsblatt ist ein privates, nicht kommerzielles Angebot, kein Angebot einer Schule. Verantwortlich für die Verarbeitung ist der Betreiber dieser Seite – ihn nennt der Datenschutzhinweis, den die Schüler:innen vor dem Schreiben sehen (Informationspflicht nach Art. 13 DSGVO). Hier legen Sie fest, wann Abgaben und Erstversuche automatisch gelöscht werden.");
  // Betreiber und Aufsichtsbehörde: schreibgeschützt (fest in index.html), keine Schulfelder und keine Vorlage „Hessen“ mehr
  await expect(page.locator("#tv-privacy h2.pvh").first()).toHaveText("Verantwortlich (fest in index.html eingetragen)");
  await expect(page.locator("#pv-operator p")).toHaveText([OP.name + ", " + OP.addr + ", E-Mail: " + OP.email,
    "Feibeitsblatt ist ein privates, nicht kommerzielles und kostenloses Angebot – kein Angebot einer Schule.",
    "Zuständige Datenschutz-Aufsichtsbehörde: " + OP_AUTH + ", datenschutz.hessen.de (öffnet in neuem Tab)"]);
  await expect(page.locator("#pv-operator input, #pv-operator textarea")).toHaveCount(0);
  await expect(page.locator("#pv-operator-hint a")).toHaveAttribute("href", "#impressum");
  await expect(page.locator("#pv-operator-hint a")).toHaveAttribute("target", "_blank");
  for (const id of ["pv-name", "pv-addr", "pv-dpo", "pv-basis", "pv-auth", "pv-url", "pv-hessen"]) await expect(page.locator("#" + id)).toHaveCount(0);
  await expect(page.locator("#pv-days")).toHaveValue("30");
  await expect(page.locator("#pv-days")).toBeFocused();
  await expect(page.locator("#pv-days option")).toHaveText(["7 Tagen", "14 Tagen", "30 Tagen (Vorgabe)", "60 Tagen", "90 Tagen", "180 Tagen", "365 Tagen"]);
  await expect(page.locator("#pv-status")).toHaveText("Die Löschfrist von 30 Tagen ist die Vorgabe dieser Installation – mit „Speichern“ legen Sie sie selbst fest.");
  await expect(page.locator("#pv-days-effect")).toHaveText("Mit dieser Frist würde jetzt nichts gelöscht.");
  const pv = page.locator("#pv-preview");
  expect(await pv.locator("details.privfull").evaluate((e) => e.open)).toBe(true);   // Vorschau aufgeklappt
  await expect(pv.locator("h3.privh")).toHaveText(PRIV_HEADS);
  await expect(pv.getByRole("checkbox", { name: TT_SWITCH })).toBeDisabled();   // Vorschau: der Schalter der Schüler:innen ohne Wirkung
  await expect(pv.locator(".privacy")).toContainText(OP_SHORT);
  await expect(pv.locator(".privacy")).toContainText("Auch die Rechtschreibprüfung ist freiwillig.");   // Vorschau: dieselbe Kurzfassung wie auf dem Angaben-Bildschirm …
  await expectTtShort(pv.locator(".privacy"));   // … mit dem einen Satz zur Tippzeit-Messung
  await expect(pv.locator("details.privfull")).toContainText(TT_PURPOSE);   // alles Weitere steht im ausführlichen Hinweis
  await expect(pv.locator(`h3.privh:text-is("${TT_OBJ_HEAD}") + .ttoptbox`)).toHaveCount(1);
  await expect(pv).toContainText(OP_RESP);
  // die Vorschau gilt für diese Adresse (Worker): GitHub nur für die Checklisten-Seite, für die ganze Seite als Zusatz darunter
  // (Zwischenstand-PDF und QR-Code führen auf GitHub Pages)
  await expect(recipients(pv, "h3").filter({ hasText: "GitHub" })).toHaveText([CHECK_GITHUB]);
  await expect(page.locator("#pv-preview-note")).toHaveText("Rufen die Schüler:innen die Seite über GitHub Pages auf (feibeitsblatt.janrickmer.de, z. B. über den Link in der Zwischenstand-PDF oder den QR-Code des analogen Arbeitsblattes), " +
    "nennt der Hinweis GitHub bei den Empfängern für die ganze Seite statt nur für die Checklisten-Seite: „GitHub, Inc. (USA) liefert diese Seite aus (GitHub Pages) und verarbeitet dabei technisch die Internetadresse deines Geräts. " +
    "Für Übermittlungen in die USA stützt sich GitHub auf das EU-US Data Privacy Framework, ersatzweise auf Standardvertragsklauseln.“ " +
    "Bei Feibeitsblättern nur mit Weltkarten-Zuordnung entfallen der Satz zur Tippzeit-Messung in der Kurzfassung und alle Angaben dazu im ausführlichen Hinweis samt dem Abschnitt „" + TT_OBJ_HEAD + "“ – dort wird nichts gemessen. " +
    "Bei Feibeitsblättern ohne Auftrag an die KI entfallen die Angaben zum KI-Feedback. " +
    "Bei Feibeitsblättern für einen Escape-Room kommen Sätze zu den Daten aus dem Escape-Room hinzu (voller Name, Geburtsdatum und Bestätigungscode bleiben auf dem Gerät " +
    "der Schüler:innen – außer sie schicken nach einer technisch gescheiterten Abgabe ihre Abschluss-PDF per E-Mail; ihre Ergebnisse gehen verschlüsselt an Sie). " +
    "Bei Partner- oder Gruppenarbeit stehen auf dem Angaben-Bildschirm die Kurzfassung und dieser Hinweis in der „ihr“-Form („Auf dem Server werden eure Angaben …“, „Eure Rechte“).");
  // Vorschau mit der (noch ungespeicherten) Frist – derselbe Baustein wie bei den Schüler:innen
  await page.selectOption("#pv-days", String(DAYS));
  await expect(page.locator("#pv-days-effect")).toHaveText("Mit dieser Frist würde jetzt nichts gelöscht.");
  await expect(pv.locator(".privacy")).toContainText("Nach " + DAYS + " Tagen werden sie automatisch gelöscht.");
  await expect(pv).toContainText("wird " + DAYS + " Tage nach dem Eingang auf dem Server automatisch gelöscht (oder kurz danach)");
  await expect(pv).toContainText("Für Übermittlungen in die USA stützt sich Cloudflare auf das EU-US Data Privacy Framework, ersatzweise auf Standardvertragsklauseln.");
  await expect(pv).toContainText(OP_COMPLAIN);
  const link = pv.locator(`a[href="${OP_AUTH_URL}"]`);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(link.locator(".sr-only")).toHaveText(" (öffnet in neuem Tab)");
  await shots(page, "lehrkraft-datenschutz", [375, 1280], PRIVAT_SHOTS);
  // eine ältere, noch gecachte Seite schickte Schulangaben mit: der Server speichert trotzdem nur die Frist
  await page.route("**/api/teacher/privacy", async (r) => {
    if (r.request().method() !== "PUT") return r.continue();
    const body = JSON.parse(r.request().postData());
    expect(Object.keys(body).sort()).toEqual(["confirmDelete", "retentionDays"]);   // die Seite schickt nur die Frist
    return r.continue({ postData: JSON.stringify({ ...body, school: { name: "Musterschule am See" } }) });
  });
  await page.click("#pv-save");
  await expect(page.locator("#pv-status")).toHaveText("Gespeichert. Die Schüler:innen sehen die Löschfrist beim nächsten Öffnen eines Feibeitsblattes.");
  await expect(page.locator("#pv-status")).toHaveClass(/\bok\b/);
  await page.unroute("**/api/teacher/privacy");
  const stored = JSON.parse((await d1Query("SELECT value FROM settings WHERE key='privacy'"))[0].value);
  expect(Object.keys(stored).sort()).toEqual(["retentionDays", "updatedAt", "v"]);   // jetzt von der Lehrkraft festgelegt (kein auto), keine Schule
  expect(stored).toMatchObject({ v: 1, retentionDays: DAYS });
  await page.click("#pv-back");   // gespeichert → ohne Nachfrage zurück
  await expect(page.locator("#tv-overview")).toBeVisible();
  await expect(page.locator("#t-privwarn")).toBeHidden();
  await expect(page.locator("#t-privinfo")).toHaveText(OP_INFO + "Abgaben und Erstversuche werden " + DAYS + " Tage nach dem Eingang automatisch gelöscht.");
  // früher gespeicherte Angaben einer Schule (ältere Version): das Aufräumen beim Laden der Übersicht entfernt sie, die Frist bleibt
  await d1Query(`UPDATE settings SET value=json_set(value,'$.school',json('{"name":"Musterschule am See","dpo":"ds@example.org"}')) WHERE key='privacy'`);
  expect(JSON.parse((await d1Query("SELECT value FROM settings WHERE key='privacy'"))[0].value).school.name).toBe("Musterschule am See");
  await page.locator("#t-sheets-body tr", { hasText: S.shown }).click();
  await page.click("#t-refresh");   // lädt die Übersicht neu (GET /api/teacher/sheets räumt vorher auf)
  await expect(page.locator("#t-refresh")).toHaveText("Aktualisieren");
  await expect.poll(async () => JSON.parse((await d1Query("SELECT value FROM settings WHERE key='privacy'"))[0].value)).toEqual(stored);
  // ungespeicherte Änderung der Frist → Nachfrage beim Zurückgehen
  await page.click("#t-privacy");
  await expect(page.locator("#pv-days")).toHaveValue(String(DAYS));
  await expect(page.locator("#pv-status")).toHaveText("");
  await page.selectOption("#pv-days", "60");
  await expect(page.locator("#pv-days-effect")).toHaveText("Mit dieser Frist würde jetzt nichts gelöscht.");
  await page.click("#pv-back");
  expect(await confirmDialog(page, "Ohne Speichern zurück?")).toBe("Die geänderte Löschfrist geht verloren.");
  await expect(page.locator("#tv-overview")).toBeVisible();
  expect(JSON.parse((await d1Query("SELECT value FROM settings WHERE key='privacy'"))[0].value).retentionDays).toBe(DAYS);
  // der Link im Kasten öffnet „Impressum & Datenschutz“ in einem neuen Tab – mit der gespeicherten Frist
  await page.click("#t-privacy");
  const [ip] = await Promise.all([page.context().waitForEvent("page"), page.click("#pv-operator-hint a")]);
  await checkLegal(ip, { days: DAYS });
  await ip.close();
  await page.click("#pv-back");
  await closePage(t);
});

test("2 Schüler:in A: Code → Einzelarbeit → Angaben → Schreiben, Einfügen gesperrt, Feld wächst, LanguageTool, KI-Feedback, Überarbeiten, Abgabe", async ({ browser }) => {
  const s = await openPage(browser, { clipboard: true });
  const { page } = s;

  // Code klein, mit Bindestrich und Leerzeichen → wird normalisiert (Enter löst aus)
  await enterCode(page, " " + S.code.slice(0, 3).toLowerCase() + " - " + S.code.slice(3).toLowerCase() + " ");
  await chooseSingle(page);
  const [lookup] = await s.calls((r) => r.path.startsWith("/api/sheet/"));
  expect(lookup.status).toBe(200);
  await expect(page.locator("#p-sheet")).toContainText(TITLE);
  await expect(page.locator("#p-sheet small")).toHaveText("Code " + S.shown + " · 3 Aufgaben");
  // Datenschutzhinweis zum Zeitpunkt der Erhebung: Betreiber und die in Test 1b gespeicherte Frist, alles nur per textContent
  await expect(page.locator("#p-privacy-short")).toContainText(OP_SHORT + " Auf dem Server werden deine Angaben und Antworten nur verschlüsselt gespeichert – lesen kann sie dort nur deine Lehrkraft. Nach " + DAYS + " Tagen werden sie automatisch gelöscht.");
  await expectTtShort(page.locator("#p-privacy-short"));
  await expect(page.locator("#p-klasse-hint")).toHaveText(KLASSE_HINT);
  const pfull = page.locator("#p-privfull");
  await pfull.locator("summary").click();
  await expect(pfull).toContainText(OP_RESP);
  await expect(pfull.locator('h2.privh:text-is("Rechtsgrundlage") + ul > li')).toHaveText(privBases(true, DELIVER_WORKER));
  await expect(pfull).toContainText("Cloudflare, Inc. (San Francisco, USA) betreibt den Server und die Datenbank dieser Seite; die Datenbank liegt in der EU.");
  await expect(pfull).toContainText("LanguageTool (Learneo, Inc., USA)");
  await expect(pfull).toContainText(OP_COMPLAIN);
  await expect(pfull).toContainText("wird " + DAYS + " Tage nach dem Eingang auf dem Server automatisch gelöscht (oder kurz danach)");
  const auth = pfull.locator(`a[href="${OP_AUTH_URL}"]`);
  await expect(auth).toHaveAttribute("target", "_blank");
  expect(await auth.getAttribute("rel")).toBe("noopener noreferrer");
  await expect(pfull.locator('a[href^="mailto:"]')).toHaveText([OP.email, OP.email]);   // Verantwortlicher und Kontakt für die Rechte
  await pfull.locator("summary").click();   // wieder zu
  await expectOnlyTtShort(page, "Angaben (Einzelarbeit)");

  // Angaben: Prüfungen der Reihe nach
  const err = page.locator("#p-err");
  const tryPerson = async (sel, value, msg) => {
    if (sel) await page.fill(sel, value);
    await page.click("#p-btn");
    await expect(err).toHaveText(msg);
    await expect(page.locator("#screen-person")).toHaveClass(/active/);
  };
  await tryPerson(null, "", "Bitte gib die ersten drei Buchstaben deines Vornamens ein.");
  await expect(page.locator("#p-vorname")).toHaveClass(/invalid/);
  await tryPerson("#p-vorname", "M4x", "Beim Vornamen sind nur Buchstaben erlaubt.");
  await tryPerson("#p-vorname", "M", "Bitte gib die ersten drei Buchstaben deines Vornamens ein (bei kürzerem Vornamen den ganzen Vornamen).");
  await tryPerson("#p-vorname", A.input.vorname, "Bitte gib die ersten zwei Buchstaben deines Nachnamens ein.");
  await tryPerson("#p-nachname", "M1", "Beim Nachnamen sind nur Buchstaben erlaubt.");
  await tryPerson("#p-nachname", A.input.nachname, "Bitte gib deinen Geburtstag ein (Tag und Monat).");
  await expect(page.locator("#p-gtag")).toHaveClass(/invalid/);
  await expect(page.locator("#p-gtag")).toBeFocused();
  await tryPerson("#p-gtag", "0", "Bitte gib beim Tag eine Zahl von 1 bis 31 ein.");
  await tryPerson("#p-gtag", "32", "Bitte gib beim Tag eine Zahl von 1 bis 31 ein.");
  await tryPerson("#p-gtag", "30", "Bitte gib den Monat deines Geburtstags ein.");
  await expect(page.locator("#p-gmonat")).toBeFocused();
  await tryPerson("#p-gmonat", "13", "Bitte gib beim Monat eine Zahl von 1 bis 12 ein (z. B. 5 für Mai).");
  await tryPerson("#p-gmonat", "2", "Den 30. Februar gibt es nicht. Bitte prüfe deinen Geburtstag.");
  await expect(page.locator("#p-gtag")).toBeFocused();
  await tryPerson("#p-gtag", "29", "Bitte gib deine Klasse ein (z. B. 8b).");   // 29. Februar gibt es
  await expect(page.locator("#p-gtag")).not.toHaveClass(/invalid/);
  await page.fill("#p-gtag", "٣١"); await tryPerson("#p-gmonat", "٤", "Den 31. April gibt es nicht. Bitte prüfe deinen Geburtstag.");   // Ziffern anderer Schriften zählen wie 0–9
  await page.fill("#p-gtag", "04"); await page.fill("#p-gmonat", "5");          // führende Null ist erlaubt
  // Autofill-Werte für den Geburtstag (WCAG 2.2, 1.3.5); die übrigen Angaben ohne Autofill
  expect(await page.$eval("#p-gtag", (e) => [e.inputMode, e.maxLength, e.autocomplete, e.labels[0].textContent])).toEqual(["numeric", 2, "bday-day", "Tag"]);
  expect(await page.$eval("#p-gmonat", (e) => [e.inputMode, e.maxLength, e.autocomplete, e.labels[0].textContent, e.closest("fieldset").querySelector("legend").textContent])).toEqual(["numeric", 2, "bday-month", "Monat", "Geburtstag (Tag und Monat)"]);
  for (const id of ["#p-vorname", "#p-nachname", "#p-klasse"]) expect(await page.$eval(id, (e) => e.autocomplete)).toBe("off");
  await tryPerson("#p-klasse", "8b!", "Bitte gib deine Klasse nur mit Buchstaben und Ziffern ein (z. B. 8b).");
  await page.fill("#p-klasse", A.input.klasse);
  await page.click("#p-btn");
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);

  // Schreibbereich
  await expect(page.locator("#who-name")).toHaveText("Max · Mu · 04.05. · Klasse 8b");
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
  await expect(page.locator("#submit-btn")).toBeEnabled();
  await expect(page.locator("#submit-hint")).toHaveText(SUBMIT_HINT_NO_FB);
  await expect(page.locator("#fin-text")).toHaveText(FIN_TEXT);
  await expect(page.locator("#fb-btn")).toHaveText("KI um ein Feedback bitten");
  await expect(page.locator("#fb-btn")).toBeEnabled();
  const aiProvider = JSON.parse(lookup.body).sheet.aiProvider;
  expect(aiProvider).toMatch(/^127\.0\.0\.1:\d+$/);
  const privacy = page.locator("#privacy");
  await expect(privacy).toContainText("ohne Namenskürzel, Geburtstag und Klasse");
  await expect(privacy).toContainText("„" + aiProvider + RECIPIENT_SUFFIX + "“");   // Empfänger mit Betreiber-Hinweis
  await expect(privacy).toContainText("wiederholt diese Seite die Anfrage automatisch (bis zu 5 Versuche");
  await expect(privacy).toContainText("speichert selbst nichts davon");
  await expect(privacy).toContainText("Bei der Abgabe gehen die Antworten, die du nach dem ersten KI-Feedback geändert hast, auf demselben Weg noch einmal an die KI – dafür bekommst du zu diesen Aufgaben eine zweite Rückmeldung, die danach verschlüsselt auch an deine Lehrkraft geht (hast du nichts geändert, wird nichts gesendet).");
  await expect(privacy).toContainText("LanguageTool");
  await expect(privacy).toContainText("(Cloudflare, Inc., USA; Datenbank in der EU)");
  await expect(privacy).toContainText("Erstversuch und Abgabe werden " + DAYS + " Tage nach dem Eingang automatisch gelöscht; deine Lehrkraft kann sie auch früher löschen.");
  await expect(privacy).not.toContainText("Die Lehrkraft löscht alles nach der Durchsicht.");
  // Tippzeiten: wie in der Kurzfassung auf dem Angaben-Bildschirm nur der eine Satz – Schalter, Wirkung und Geltungsbereich im ausführlichen Hinweis darunter
  await expectTtShort(privacy);
  await expect(privacy).toContainText("deine Lehrkraft kann sie auch früher löschen. " + TT_SHORT + " Dein Zwischenstand liegt bis zur Abgabe nur auf diesem Gerät");   // ohne Hervorhebung im Fließtext
  await expect(page.locator("#privfull-ed")).toContainText(TT_PURPOSE);
  await expect(page.locator("#privfull-ed")).toContainText(TT_STAY);
  expect(await privacy.evaluate((e) => getComputedStyle(e).color)).toBe("rgb(111, 103, 90)");
  // darunter alle Informationen (beim Weiterschreiben gibt es keinen Angaben-Bildschirm) – Überschriften unter h2 „Abschluss“ als h3
  await expect(page.locator("#privfull-ed details.privfull summary")).toHaveText("Alle Informationen zum Datenschutz");
  await expect(page.locator("#privfull-ed h3.privh")).toHaveText(PRIV_HEADS);
  await expect(page.locator("#privfull-ed")).toContainText(OP_RESP);
  // der ausführliche Hinweis ist beim Öffnen zu – der Schalter darin ist dann weder sichtbar noch per Tab oder Skript fokussierbar
  expect(await page.locator("#privfull-ed details.privfull").evaluate((d) => d.open)).toBe(false);
  expect(await page.locator("#privfull-ed-d-ttoff").evaluate((el) => { el.focus(); return document.activeElement === el; })).toBe(false);
  await expectOnlyTtShort(page, "Schreibbereich vor dem Tippen");

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

  // Rechtschreibung und Grammatik (LanguageTool-Attrappe): Button bei jedem Textfeld, aber erst nach der Selbstauskunft im Dialog
  // (ohne Geburtsjahr kennt die Seite das Alter nicht); „Trifft nicht zu“ prüft Test 3
  await expect(page.locator("#t-1 .ltbtn")).toHaveText("Rechtschreibung und Grammatik prüfen");
  await expect(page.locator(".ltbtn")).toHaveCount(3);
  await expect(page.locator(".lt-off")).toHaveCount(0);
  await page.click("#t-1 .ltbtn");
  await expect(page.locator("#dlg-ok")).toHaveText("Trifft auf mich zu – prüfen");
  await expect(page.locator("#dlg-cancel")).toHaveText("Trifft nicht zu");
  await expect(page.locator("#dlg-cancel")).toBeFocused();   // der sichere Knopf hat den Fokus
  expect(s.lt).toHaveLength(0);                               // vor der Bestätigung geht nichts raus
  await expectOnlyTtShort(page, "Dialog vor der Rechtschreibprüfung");
  expect(await confirmDialog(page, "Rechtschreibung und Grammatik prüfen")).toBe(LT_CONSENT);
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

  // KI-Feedback (eine Anfrage an die KI, nur Aufgaben mit Auftrag an die KI, keine Personendaten)
  await expect(page.locator("#submit-btn")).toBeEnabled();
  await mockReset();
  await requestFeedback(page, () => expectOnlyTtShort(page, "Dialog vor dem KI-Feedback"));
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
  expect(prompt).not.toContain(A.a3);                                   // Aufgabe ohne Auftrag geht nicht an die KI
  for (const p of [A.person.geburtsdatum, fmtBd(A.person.geburtsdatum), "8b", "Max"]) expect(prompt).not.toContain(p);
  // Format der Nachricht: erst Aufgaben, Material und Aufträge der Lehrkraft (je Blatt gleich → Präfix-Caching), dann die Antworten
  const user = ms.requests[0].messages.find((m) => m.role === "user").content;
  expect(user.startsWith("Aufgaben, Material und Aufträge der Lehrkraft (Nummern: 1, 2):\n\n### Aufgabe 1\nAufgabenstellung:\n<<<\n" + TASKS[0].text + "\n>>>\n")).toBe(true);
  for (const t of TASKS.slice(0, 2)) expect(user).toContain("Auftrag der Lehrkraft für das Feedback:\n<<<\n" + t.solution + "\n>>>");
  expect(user.lastIndexOf("Auftrag der Lehrkraft für das Feedback:")).toBeLessThan(user.indexOf("Antworten der Schülerin bzw. des Schülers:\n\n### Antwort zu Aufgabe 1\n<<<\n" + A.first[0] + "\n>>>"));
  expect(user.endsWith("\n\nGib für jede der 2 Aufgaben (Nummern: 1, 2) dein Feedback als JSON zurück.")).toBe(true);
  expect(user).not.toContain("Musterlösung der Lehrkraft");
  expect(ms.requests[0].messages[0].role).toBe("system");
  expect(ms.requests[0].messages[0].content).toContain('{"aufgaben":[{"nr":1,"gut":["…"],"tipps":["…"]}]}');
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
  // Unterüberschriften: was schon gelingt (covered = „gut“), Tipps zum Überarbeiten (missing = „tipps“)
  await expect(page.locator("#t-1 .fb-sub.fb-ok")).toHaveText("Das gelingt dir schon");
  await expect(page.locator("#t-1 .fb-sub.fb-miss")).toHaveText("Tipps zum Überarbeiten");
  await expect(page.locator("#t-1 .fb-sub + ul.fb-list")).toHaveCount(2);   // jede Überschrift steht direkt über ihrer Liste
  await expect(page.locator("#t-3 .fb-note")).toHaveText(NO_SOLUTION_NOTE);
  // maschinenlesbare KI-Kennzeichnung (Art. 50 Abs. 2 KI-VO): Boxen mit KI-Stichpunkten, nicht der Hinweis ohne KI; die Antwort ebenso
  expect(await aiMarks(page.locator("#t-1 .fbbox"))).toEqual(["true", "feedback", AI_SOURCE]);
  expect(await aiMarks(page.locator("#t-2 .fbbox"))).toEqual(["true", "feedback", AI_SOURCE]);
  expect(await aiMarks(page.locator("#t-3 .fbbox"))).toEqual([null, null, null]);
  expect(JSON.parse(fbReq[0].body)).toMatchObject({ aiGenerated: true, digitalSourceType: AI_SOURCE });
  // der Zwischenstand vermerkt es ebenfalls (cleanDraft liest das Feld nicht)
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("feibeitsblatt:draft:"))))).feedbackAi).toEqual({ aiGenerated: true, digitalSourceType: AI_SOURCE });
  await expect(page.locator("#fb-btn")).toBeDisabled();
  await expect(page.locator("#fb-btn")).toHaveText("KI-Feedback erhalten");
  await expect(page.locator("#revise-hint")).toBeVisible();
  await expect(page.locator("#revise-hint")).toHaveText(/^Lies das KI-Feedback zu jeder Aufgabe und überarbeite jetzt deine Antworten/);
  await expect(page.locator("#submit-btn")).toBeEnabled();
  expect(Math.abs((await gapAfterTask(page, 1)) - lh)).toBeLessThan(1);
  await expectOnlyTtShort(page, "Schreibbereich nach dem KI-Feedback");

  // Mit dem Feedback geht die erste Fassung verschlüsselt als „Erstversuch“ an die Lehrkraft (Kennung wie später die Abgabe)
  await expect.poll(async () => (await s.calls((r) => r.path === "/api/submit")).length, { timeout: 30_000 }).toBe(1);
  const firstPost = (await s.calls((r) => r.path === "/api/submit"))[0];
  expect(firstPost.status).toBe(200);
  const fp = JSON.parse(firstPost.reqBody);
  expect(Object.keys(fp).sort()).toEqual(["attempt", "code", "envelope", "stage"]);
  expect(fp.stage).toBe("first");
  expect(fp.attempt).toMatch(ATTEMPT);
  expect(Object.keys(fp.envelope).sort()).toEqual(["ct", "ek", "iv", "v"]);
  // kein Klartext neben dem Umschlag (der Umschlag selbst ist Base64 – Klartext oder ein „-“ wie in „--05-04“ kann darin nicht stehen)
  for (const p of ["Gewissn", "Schwester", "Max", A.person.geburtsdatum, "vorname"]) expect(firstPost.reqBody).not.toContain(p);

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
  expectDraftTyping(draft, A.final, A.first);   // Tippzeiten im selben Datensatz (unverschlüsselt in der PDF – zeigen nur das Tempo)
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
  await expect(fresh.page.locator("#who-name")).toHaveText("Max · Mu · 04.05. · Klasse 8b");
  for (let i = 0; i < 3; i++) expect(await fresh.page.inputValue("#a-" + (i + 1))).toBe(A.final[i]);
  await expect(fresh.page.locator("#save-state")).toHaveText("Zwischenstand aus der PDF-Datei übernommen");
  await expect(fresh.page.locator("#t-1 .fbbox")).toBeVisible();
  await expect(fresh.page.locator("#fb-btn")).toBeDisabled();
  await expect(fresh.page.locator("#submit-btn")).toBeEnabled();
  expect(await fresh.calls((r) => r.path === "/api/submit")).toEqual([]);
  expect(await fresh.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("feibeitsblatt:draft:")).length)).toBe(1);
  const freshDraft = JSON.parse(await fresh.page.evaluate(() => localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("feibeitsblatt:draft:")))));
  expect(freshDraft).toMatchObject({ attempt: fp.attempt, firstSent: true });
  expectDraftTyping(freshDraft, A.final, A.first);   // aus der PDF übernommen (cleanDraft prüft sie gegen die Texte)
  if (TT_KEEP) expect(freshDraft.typing).toEqual(draft.typing);
  await closePage(fresh);

  // Abgabe: nur {code, envelope, stage, attempt}, alles verschlüsselt; Entwurf auf dem Gerät gelöscht. Danach holt die Seite eine
  // zweite KI-Rückmeldung zur abgegebenen Fassung – hier hält der Test sie zuerst an und lässt den ersten Versuch scheitern
  let releaseFb2, fb2Calls = 0;
  const fb2Gate = new Promise((r) => { releaseFb2 = r; });
  await page.route("**/api/feedback", async (route) => {
    if (++fb2Calls > 1) return route.continue();
    await fb2Gate;
    return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Die KI-Rückmeldung ist gerade nicht verfügbar. Bitte versuche es später noch einmal oder frag deine Lehrkraft.", code: "ai_error" }) });
  });
  await expect(page.locator("#submit-hint")).toHaveText(/Nach der Abgabe bekommst du zu den Aufgaben, die die KI beurteilt und deren Antwort du nach dem KI-Feedback geändert hast, eine neue KI-Rückmeldung\.$/);
  await page.click("#submit-btn");
  await expect(page.locator("#dlg.open")).toBeVisible();
  await expectOnlyTtShort(page, "Abgabe-Dialog");
  const submitText = await confirmDialog(page, "Jetzt abgeben?");
  // A hat die Aufgaben 1 und 2 überarbeitet (Aufgabe 3 hat keinen Auftrag): nur diese gehen noch einmal an die KI
  expect(submitText).toContain("Danach bekommst du eine neue KI-Rückmeldung zu den Aufgaben 1 und 2: Von den Aufgaben, die die KI beurteilt, hast du nur diese nach dem KI-Feedback geändert – nur sie gehen noch einmal an die KI. Die neue Rückmeldung geht danach verschlüsselt auch an deine Lehrkraft. Deine Antworten gehen");
  expect(submitText).toContain("„" + aiProvider + RECIPIENT_SUFFIX + "“");   // Empfänger stehen im Entscheidungsmoment
  await expect(page.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await expect(page.locator("#done-time")).toHaveText(/^Abgegeben am [A-Za-z]+, \d\d\.\d\d\.\d{4} um \d\d:\d\d Uhr\.$/);
  await expect(page.locator("#done-fb")).toBeVisible();
  await expect(page.locator("#done-fb .donefb-h")).toHaveText("KI-Rückmeldung zu deiner abgegebenen Fassung");
  await expect(page.locator("#done-fb-status")).toHaveText("Die KI sieht sich deine geänderten Antworten an (Aufgaben 1 und 2) … das kann bis zu einer Minute dauern.");
  // Bestätigung: großer grüner Haken; Download-Button ganz oben über der zweiten KI-Rückmeldung, darunter ein kleiner, blasser Hinweis
  await expect(page.locator("#done-h")).toHaveText("Abgabe erfolgreich");
  await expect(page.locator("#screen-done .done-check")).toBeVisible();
  expect(await page.locator("#screen-done .done-check circle").evaluate((e) => getComputedStyle(e).fill)).toBe(GREEN);
  expect((await page.locator("#screen-done .done-check").boundingBox()).width).toBeGreaterThanOrEqual(96);
  await expect(page.locator("#done-pdf")).toHaveText("Lade dir deine Lösungen herunter und speichere sie in deinen Unterlagen zu unserem Unterricht");
  await expect(page.locator("#done-pdf-note")).toHaveText("Es ist möglich, dass du mit diesen Aufgaben für die Klausur / Klassenarbeit relevante Inhalte erlernt hast.");
  await expect(page.locator("#done-pdf")).toHaveAttribute("aria-describedby", "done-pdf-note");
  expect(await page.$eval("#done-pdf", (e) => e.nextElementSibling.id)).toBe("done-pdf-note");   // Hinweis direkt unter dem Button
  // Löschdatum laut Frist beim Server (Antwort von /api/submit), zwischen Zeitpunkt und Download-Button
  const subRes = JSON.parse((await s.calls((r) => r.path === "/api/submit"))[1].body);
  expect(subRes.retentionDays).toBe(DAYS);
  await expect(page.locator("#done-del")).toHaveText("Bei deiner Lehrkraft wird deine Abgabe nach " + DAYS + " Tagen automatisch gelöscht (am " + deDate(subRes.receivedAt + DAYS * 864e5) + " oder kurz danach). Wenn du deine Lösungen behalten möchtest, lade sie dir herunter.");
  expect(await page.$eval("#done-del", (e) => [e.previousElementSibling.id, e.nextElementSibling.id])).toEqual(["done-time", "done-pdf"]);
  const [pdfBox, noteBox, fbBox] = await Promise.all(["#done-pdf", "#done-pdf-note", "#done-fb"].map((sel) => page.locator(sel).boundingBox()));
  expect(pdfBox.y + pdfBox.height).toBeLessThanOrEqual(noteBox.y);
  expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(fbBox.y);                              // Button und Hinweis über der Rückmeldung
  const [noteCss, btnCss, mutedCss] = await page.evaluate(() => [getComputedStyle(document.getElementById("done-pdf-note")), getComputedStyle(document.getElementById("done-pdf")), getComputedStyle(document.querySelector("#screen-done .sub"))].map((c) => ({ size: parseFloat(c.fontSize), color: c.color })));
  expect(noteCss.size).toBeLessThan(btnCss.size);                                                 // klein …
  expect(noteCss.color).toBe(mutedCss.color);                                                     // … und blass (gedämpfte Farbe wie „Deine Lösung ist … angekommen.“)
  await expect(page.locator("#screen-done .donehint, #screen-done .donelist")).toHaveCount(0);
  await expectOnlyTtShort(page, "Bestätigung nach der Abgabe", 0);   // keine Kurzfassung mehr – und nichts zur Messung
  // PDF schon während die zweite Rückmeldung lädt: Hinweis in der Datei und auf der Seite
  const [sdl] = await Promise.all([page.waitForEvent("download"), page.click("#done-pdf")]);
  expect(sdl.suggestedFilename()).toMatch(new RegExp("^Feibeitsblatt-Loesungen-" + S.shown + "-\\d{4}-\\d\\d-\\d\\d\\.pdf$"));
  await expect(page.locator("#done-status")).toHaveText("Die PDF-Datei wird heruntergeladen – die KI-Rückmeldung zu deiner abgegebenen Fassung ist noch nicht darin. Lade die Datei noch einmal herunter, sobald die Rückmeldung darunter erscheint.");
  const sol = (await readFile(await sdl.path())).toString("latin1");
  expect(sol).toContain("(Die KI-R\\374ckmeldung zu deiner abgegebenen Fassung lag");
  expect(sol).not.toContain("(KI-R\\374ckmeldung zur abgegebenen Fassung");
  expect(sol.startsWith("%PDF-1.7")).toBe(true);
  expect(sol).toMatch(/\/Type \/Pages \/Kids \[[^\]]+\] \/Count [1-9]/);
  expect(sol).toContain("(Meine L\\366sungen \\226 " + TITLE.replace("–", "\\226") + ") Tj");   // Titel (WinAnsi: ö = \366, – = \226)
  expect(sol).toContain("(Aufgabe 1) Tj"); expect(sol).toContain("(Aufgabe 3) Tj");
  expect(sol).toContain("(Meine L\\366sung \\(abgegebene Fassung\\):) Tj");
  expect(sol).toContain("(Erste Fassung \\(vor dem KI-Feedback\\):) Tj");   // A hat überarbeitet
  expect(sol).toContain("Max \\267 Mu \\267 Klasse 8b");
  expect(sol).not.toContain("--05-04"); expect(sol).not.toMatch(/04\.05\.(?!\d)/);   // kein Geburtstag in der Datei („04.05.2026“ wäre ein Abgabedatum)
  // KI-Kennzeichnung: sichtbarer Hinweis, Subject/Keywords, XMP mit IPTC „compositeSynthetic“ (Schülertext + KI-Text); Aufbau gültig
  expect(pdfShownText(Buffer.from(sol, "latin1"))).toContain("Die Rückmeldungen in dieser Datei hat eine KI erzeugt (KI-Feedback). Sie können Fehler enthalten.");
  const st1 = pdfStructure(Buffer.from(sol, "latin1"));
  const xmpNo = Number(/\/Type \/Catalog \/Pages 2 0 R \/Metadata (\d+) 0 R/.exec(st1.objAt(1))[1]);
  expect(xmpNo).toBe(st1.count - 1);   // das letzte Objekt
  expect(st1.objAt(xmpNo)).toMatch(/^\d+ 0 obj\n<< \/Type \/Metadata \/Subtype \/XML \/Length \d+ >>\nstream\n/);
  expect(st1.objAt(5)).toMatch(/\/Subject <FEFF[0-9a-f]+> \/Keywords <FEFF[0-9a-f]+>/);
  const xmp = Buffer.from(/stream\n([\s\S]*)\nendstream/.exec(st1.objAt(xmpNo))[1], "latin1").toString("utf8");
  expect(xmp).toContain("<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/compositeSynthetic</Iptc4xmpExt:DigitalSourceType>");
  expect(xmp).toContain("<rdf:li xml:lang=\"x-default\">Meine Lösungen – " + TITLE + "</rdf:li>");   // UTF-8, Titel XML-maskiert
  expect(await page.evaluate((x) => { const d = new DOMParser().parseFromString(x.slice(x.indexOf("<x:xmpmeta"), x.indexOf("<?xpacket end")), "application/xml"); return d.getElementsByTagName("parsererror").length; }, xmp)).toBe(0);

  // der erste Versuch der zweiten Rückmeldung scheitert → Hinweis, Abgabe unberührt, „Rückmeldung erneut anfordern“
  releaseFb2();
  await expect(page.locator("#done-fb-status")).toHaveText("Die KI-Rückmeldung ist gerade nicht verfügbar. Bitte versuche es später noch einmal oder frag deine Lehrkraft. Deine Abgabe ist davon nicht betroffen – du kannst die Rückmeldung noch einmal anfordern.");
  await expect(page.locator("#done-fb-status")).toHaveClass(/\bbad\b/);
  await expect(page.locator("#done-fb-retry")).toBeVisible();
  await page.click("#done-fb-retry");
  // … dann klappt es: je Aufgabe die Rückmeldung zur abgegebenen Fassung (Stichpunkte wie im Editor, keine Zählung)
  await expect(page.locator("#done-fb .fbbox")).toHaveCount(3, { timeout: 60_000 });
  await expect(page.locator("#done-fb-status")).toHaveText("So sieht die KI deine abgegebene Fassung:");
  await expect(page.locator("#done-fb-retry")).toBeHidden();
  const exp1 = expectedResults(TASKS, A.first), exp2 = expectedResults(TASKS, A.final);
  expect(exp2[0].covered.length).toBeGreaterThan(exp1[0].covered.length);   // Plausibilität: die Überarbeitung bringt einen „gut“-Stichpunkt mehr
  expect(exp2[0].missing.length).toBeLessThan(exp1[0].missing.length);      // … und einen Tipp weniger
  for (let n = 1; n <= 3; n++) {
    const box = page.locator("#done-fb-" + n);
    await expect(box.locator(".fb-head")).toHaveText("Aufgabe " + n);
    const list = async (sel) => (await box.locator(sel + " li").allTextContents());
    const f = { covered: await list("ul.fb-ok"), missing: await list("ul.fb-miss") };
    if (await box.locator(".fb-note").count()) f.note = await box.locator(".fb-note").textContent();
    expect(f, "Aufgabe " + n).toEqual(exp2[n - 1]);
    // A hat die Aufgaben 1 und 2 überarbeitet (neu beurteilt), Aufgabe 3 hat keinen Auftrag: nirgends „unverändert“, keine Zählung
    await expect(box.locator(".fb-sum")).toHaveCount(0);
    await expect(box.locator(".fb-sub.fb-ok")).toHaveText(exp2[n - 1].covered.length ? ["Das gelingt dir schon"] : []);
    await expect(box.locator(".fb-sub.fb-miss")).toHaveText(exp2[n - 1].missing.length ? ["Tipps zum Weiterlernen"] : []);   // nach der Abgabe
  }
  await expect(page.locator("#done-fb")).not.toContainText("Kernpunkt");
  await expect(page.locator("#done-fb")).not.toContainText("ngesprochen");
  await expect(page.locator("#done-fb-3 .fb-note")).toHaveText(NO_SOLUTION_NOTE);
  await expect(page.locator("#done-status")).toHaveText("Die KI-Rückmeldung zu deiner abgegebenen Fassung ist jetzt da. Lade die PDF-Datei noch einmal herunter, damit sie darin steht.");
  await page.unroute("**/api/feedback");
  // gesendet wurden nur Code, die geänderten Antworten (Aufgabe 3 leer – sie hat keinen Auftrag), ihre Nummern und die Empfänger –
  // keine Personendaten; die KI bekam die neue Fassung
  const fb2Reqs = (await s.calls((r) => r.path === "/api/feedback")).slice(1);
  expect(fb2Reqs.map((r) => r.status)).toEqual([502, 200]);
  for (const r of fb2Reqs) expect(JSON.parse(r.reqBody)).toEqual({ code: S.code, answers: [A.final[0], A.final[1], ""], recipients: ["custom:" + aiProvider], only: [1, 2] });
  const ms2 = await mockState();
  expect(ms2.count).toBe(2);   // erstes Feedback + zweite Rückmeldung (der gescheiterte Versuch kam nicht bei der KI an)
  const prompt2 = JSON.stringify(ms2.requests[1].messages);
  expect(prompt2).toContain("Es meldet sich als schlechtes Gewissen.");
  for (const p of [A.person.geburtsdatum, fmtBd(A.person.geburtsdatum), "8b", "Max"]) expect(prompt2).not.toContain(p);
  // die PDF-Datei enthält jetzt beide Rückmeldungen
  const [sdl2] = await Promise.all([page.waitForEvent("download"), page.click("#done-pdf")]);
  await expect(page.locator("#done-status")).toHaveText("Die PDF-Datei wird heruntergeladen – speichere sie in deinen Unterlagen.");
  const sol2 = (await readFile(await sdl2.path())).toString("latin1");
  S.solA = pdfShownText(Buffer.from(sol2, "latin1"));   // Test 4: die Lösungs-PDF aus der Übersicht der Lehrkraft zeigt genau denselben Text
  expect(sol2).toContain("(KI-R\\374ckmeldung zur abgegebenen Fassung:) Tj");   // ohne Zählung
  pdfStructure(Buffer.from(sol2, "latin1"));
  expect(sol2).toContain("/Metadata ");
  // auch nach der Abgabe gekennzeichnet: Boxen der zweiten Rückmeldung (nicht Aufgabe 3 ohne Auftrag an die KI)
  expect(await aiMarks(page.locator("#done-fb-1"))).toEqual(["true", "feedback-final", AI_SOURCE]);
  expect(await aiMarks(page.locator("#done-fb-3"))).toEqual([null, null, null]);
  expect(sol2).toContain("(KI-Feedback zur ersten Fassung:) Tj");
  expect(sol2).not.toContain("lag beim Herunterladen noch nicht vor");
  for (const c of exp2[0].covered) expect(sol2).toContain("(\\225 Gelingt schon: " + c.slice(0, 20));   // • = \225 (WinAnsi)
  for (const m of exp1[0].missing) expect(sol2).toContain("(\\225 Tipp: " + m.slice(0, 20));       // aus dem ersten Feedback
  for (const w of ["Kernpunkt", "ngesprochen", "fehlt:"]) expect(sol2).not.toContain(w);
  // Erstversuch (beim Feedback) + Abgabe + danach die zweite Rückmeldung verschlüsselt an die Lehrkraft (ersetzt nur die Abgabe)
  await expect.poll(async () => (await s.calls((r) => r.path === "/api/submit")).length).toBe(3);
  const sub = await s.calls((r) => r.path === "/api/submit");
  expect(sub.map((r) => r.status)).toEqual([200, 200, 200]);
  const rb = JSON.parse(sub[2].reqBody);
  expect(Object.keys(rb).sort()).toEqual(["attempt", "code", "envelope", "receivedAt", "stage"]);
  expect([rb.stage, rb.attempt, rb.receivedAt]).toEqual(["feedback2", fp.attempt, JSON.parse(sub[1].body).receivedAt]);   // genau die eigene Abgabe
  expect(JSON.parse(sub[2].body)).toMatchObject({ ok: true, replaced: "final" });
  for (const p of ["Gewissn", "Schwester", "Max", A.person.geburtsdatum, "vorname", "Gelingt"]) expect(sub[2].reqBody).not.toContain(p);
  const sb = JSON.parse(sub[1].reqBody);
  expect(Object.keys(sb).sort()).toEqual(["attempt", "code", "envelope", "stage"]);
  expect(sb.stage).toBe("final");
  expect(sb.attempt).toBe(fp.attempt);                           // ersetzt den Erstversuch auf dem Server
  expect(Object.keys(sb.envelope).sort()).toEqual(["ct", "ek", "iv", "v"]);
  for (const p of ["Gewissn", "Schwester", "Max", A.person.geburtsdatum, "vorname"]) expect(sub[1].reqBody).not.toContain(p);   // kein Klartext neben dem Umschlag (s. o.)
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("feibeitsblatt:draft:")))).toEqual([]);
  S.sheetBodies.push(lookup.body);
  await closePage(s);
});

test("2b Partner- / Gruppenarbeit: nach dem Code Einzel- oder Gruppenarbeit → Kürzel aller Mitglieder (hinzufügen, entfernen, Grenzen) und einmal die Klasse → KI-Feedback ohne Kürzel, Weiterschreiben, Zwischenstand-PDF, Abgabe → Lehrkraft sieht alle Kürzel als eine Gruppe", async ({ browser }) => {
  // eigenes Blatt mit zwei Aufgaben mit Auftrag an die KI; am Ende gelöscht (die folgenden Tests zählen die Einträge des Hauptblattes)
  const t = await openPage(browser);
  const tp = t.page;
  await teacherLogin(tp, PW);
  await tp.click("#t-new");
  const GTITLE = "Gruppenarbeit – Gewissen";
  await tp.fill("#b-title", GTITLE);
  for (let i = 0; i < 2; i++) { await tp.fill("#bq-" + (i + 1), TASKS[i].text); await tp.fill("#bs-" + (i + 1), TASKS[i].solution); }
  await tp.click("#b-gen");
  await expect(tp.locator("#b-result")).toBeVisible();
  const shown = (await tp.locator("#b-res-code").textContent()).trim();
  const G = { first: ["Das Gewissen ist eine innere Instanz, die zwischen richtig und falsch unterscheidet.", "Wir haben einmal geflunkert."], rev2: " Die Begründung: Lügen ist unfair." };
  const NAMES = ["MaxMu", "LiMu", "TimBe"];

  const s = await openPage(browser);
  const { page } = s;
  await enterCode(page, shown);
  // Arbeitsform: zwei große Buttons mit Erklärzeile, Fokus auf „Einzelarbeit“
  await expect(page.locator("#screen-mode")).toHaveClass(/active/);
  await expect(page.locator("#mode-h")).toHaveText("Wie arbeitest du?");
  await expect(page.locator("#m-sheet")).toContainText(GTITLE);
  await expect(page.locator("#m-sheet small")).toHaveText("Code " + shown + " · 2 Aufgaben");
  await expect(page.locator("#mode-single")).toBeFocused();
  await expect(page.getByRole("button", { name: "Einzelarbeit", exact: true })).toHaveAttribute("id", "mode-single");
  await expect(page.getByRole("button", { name: "Partner- / Gruppenarbeit", exact: true })).toHaveAttribute("id", "mode-group");
  await expect(page.locator("#mode-single-d")).toHaveText("Du bearbeitest das Feibeitsblatt allein.");
  await expect(page.locator("#mode-group-d")).toHaveText("Ihr bearbeitet es zu zweit oder in einer Gruppe (bis zu 10 Personen) an einem Gerät und gebt gemeinsam ab.");
  await expect(page.locator("#mode-group")).toHaveAttribute("aria-describedby", "mode-group-d");
  await shots(page, "1-arbeitsform");
  // „anderen Code eingeben“ führt zur Startseite (der Code steht noch im Feld)
  await expect(page.locator("#m-back")).toHaveText("← anderen Code eingeben");
  await page.click("#m-back");
  await expect(page.locator("#screen-start")).toHaveClass(/active/);
  await expect(page.locator("#code-input")).toBeFocused();
  await page.press("#code-input", "Enter");
  await expect(page.locator("#screen-mode")).toHaveClass(/active/);
  // Einzelarbeit wie bisher; der Backlink dort führt zurück zur Auswahl
  await page.click("#mode-single");
  await expect(page.locator("#person-h")).toHaveText("Deine Angaben");
  await expect(page.locator("#p-vorname")).toBeFocused();
  await expect(page.locator("#p-gtag")).toBeVisible();
  await expect(page.locator("#p-group")).toBeHidden();
  await expect(page.locator("#p-klasse-hint")).toHaveText(KLASSE_HINT);
  await page.locator("#p-privfull summary").click();   // Einzelarbeit: alle Informationen in der „du“-Form, „Welche Daten?“ nennt beide Formen
  await expect(page.locator("#p-privfull h2.privh")).toHaveText(PRIV_HEADS);
  await expect(page.locator("#p-privfull")).toContainText("Bei Einzelarbeit die ersten Buchstaben deines Vor- und Nachnamens, dein Geburtstag (Tag und Monat, ohne Jahr) und deine Klasse; " + GROUP_DATA + " Außerdem deine Antworten");
  await page.locator("#p-privfull summary").click();
  await expect(page.locator("#p-back")).toHaveText("← zurück zur Auswahl");
  await page.click("#p-back");
  await expect(page.locator("#screen-mode")).toHaveClass(/active/);
  await expect(page.locator("#mode-single")).toBeFocused();

  // Partner- / Gruppenarbeit: „ihr“-Form, ein Feld je Person, kein Geburtstag
  await page.click("#mode-group");
  await expect(page.locator("#screen-person")).toHaveClass(/active/);
  await expect(page.locator("#person-h")).toHaveText("Eure Angaben");
  await expect(page.locator("#p-sub")).toHaveText("Bitte tragt eure Angaben ein. Danach öffnet sich der Schreibbereich.");
  await expect(page.locator("#p-members-hint")).toHaveText(MEMBERS_HINT);
  await expect(page.locator("#p-group legend")).toHaveText("Kürzel aller Personen");
  await expect(page.locator("#p-single")).toBeHidden();
  await expect(page.locator("#p-gtag")).toBeHidden();
  await expect(page.locator("#p-members input")).toHaveCount(1);
  await expect(page.locator("#p-m-1")).toBeFocused();
  expect(await page.$eval("#p-m-1", (e) => [e.labels[0].textContent, e.autocomplete, e.getAttribute("autocorrect"), e.spellcheck, e.maxLength, e.placeholder]))
    .toEqual(["Person 1", "off", "off", false, 8, "z. B. MaxMu"]);
  await expect(page.locator("#p-members button")).toHaveCount(0);   // Person 1 bleibt immer
  await expect(page.locator("#p-add")).toHaveText("Person hinzufügen");
  await expect(page.locator("#p-add-hint")).toBeHidden();
  await expect(page.locator("#p-klasse-hint")).toHaveText(KLASSE_HINT_GROUP);
  await expect(page.locator("#p-privacy-short")).toHaveText(new RegExp("^Datenschutz: " + OP_SHORT.replace(/[.()]/g, "\\$&") + " Auf dem Server werden eure Angaben und Antworten nur verschlüsselt gespeichert – lesen kann sie dort nur eure Lehrkraft\\. " +
    "Nach " + DAYS + " Tagen werden sie automatisch gelöscht\\. Das KI-Feedback ist freiwillig: Nur wenn ihr es anfordert, gehen eure Antworten – ohne eure Angaben – an den KI-Dienst „127\\.0\\.0\\.1:\\d+ \\(Betreiber und Sitz: vom Betreiber dieser Seite zu prüfen\\)“, " +
    "bei der Abgabe dann noch einmal die danach geänderten Antworten\\. Auch die Rechtschreibprüfung ist freiwillig\\. " + reEsc(TT_SHORT_G) + "$"));
  await expectTtShort(page.locator("#p-privacy-short"), TT_SHORT_G);   // zur Messung nur der eine Satz in der „ihr“-Form, alles Weitere im ausführlichen Hinweis
  // auch alle Informationen zum Datenschutz in der „ihr“-Form (derselbe Inhalt; „Welche Daten?“ nennt beide Arbeitsformen)
  await page.locator("#p-privfull summary").click();
  await expect(page.locator("#p-privfull h2.privh")).toHaveText(PRIV_HEADS_GROUP);
  await expect(page.locator("#p-privfull")).toContainText("Bei Partner- oder Gruppenarbeit (so wie bei euch) die Kürzel aller Mitglieder (je die ersten Buchstaben von Vor- und Nachnamen) und die Klasse, kein Geburtstag – " +
    "wer die Angaben einträgt, trägt die Kürzel der anderen mit ein, deshalb sollen alle in der Gruppe davon wissen; bei Einzelarbeit die ersten Buchstaben des Vor- und Nachnamens, der Geburtstag (Tag und Monat, ohne Jahr) und die Klasse. Außerdem eure Antworten");
  await expect(page.locator("#p-privfull")).toContainText("Eure Lehrkraft – nur sie kann eure auf dem Server gespeicherten Angaben und Antworten lesen.");
  await expect(page.locator("#p-privfull")).toContainText("Jede und jeder von euch kann Auskunft über die eigenen gespeicherten Daten verlangen");
  await expect(page.locator("#p-privfull")).toContainText("– ohne eure Namenskürzel und die Klasse –");
  await expect(page.locator("#p-privfull")).toContainText(OP_RESP + " Eure Angaben und Antworten liest eure Lehrkraft, die das Feibeitsblatt mit dem Lehrkraft-Zugang dieser Seite angelegt hat. Bei Fragen könnt ihr euch an den Betreiber oder an eure Lehrkraft wenden.");
  await expect(page.locator('#p-privfull h2.privh:text-is("Rechtsgrundlage") + ul > li')).toHaveText([
    "Bearbeiten und Abgeben – eure Angaben (die Kürzel aller in der Gruppe und die Klasse), euer Zwischenstand, der Erstversuch und die Abgabe" + ttOutB(true) + " – und das KI-Feedback, wenn ihr es anfordert: Art. 6 Abs. 1 Buchst. b DSGVO. Ihr nutzt dieses kostenlose Angebot und fordert diese Funktionen selbst an.",
    "Tippzeiten (wie viel Zeit zwischen zwei eingegebenen Zeichen vergeht; sie stehen " + ttWhere("eurem", true) + "): Art. 6 Abs. 1 Buchst. f DSGVO – das berechtigte Interesse, den Schreibprozess sichtbar zu machen, damit eure Lehrkraft bei Auffälligkeiten mit euch über eure Arbeitsweise sprechen kann; " +
      "die Tippzeiten dienen " + TT_USE + ". Der Messung könnt ihr widersprechen – mit dem Schalter „" + TT_SWITCH_G + "“ (siehe „" + TT_OBJ_HEAD + "“).",
    "Rechtschreibprüfung (LanguageTool): eure Einwilligung, Art. 6 Abs. 1 Buchst. a DSGVO. Ihr gebt sie mit dem Klick auf „Rechtschreibung und Grammatik prüfen“ und eurer Bestätigung im Dialog – ohne Bestätigung wird nichts gesendet. Ihr könnt sie jederzeit für die Zukunft widerrufen, indem ihr die Prüfung nicht mehr nutzt.",
    "Aufruf und Auslieferung dieser Seite (" + DELIVER_WORKER + ") und Schutz vor Missbrauch und Überlastung (Zähler mit unkenntlich gemachter IP-Adresse): Art. 6 Abs. 1 Buchst. f DSGVO – das berechtigte Interesse, die Seite sicher und zuverlässig bereitzustellen. Dagegen könnt ihr Widerspruch einlegen (siehe „Eure Rechte“).",
    "Speichern im Browser eures Geräts (euer Zwischenstand" + (TT_KEEP ? " – außer den Tippzeiten darin –" : "") + ", die Häkchen einer Checkliste): § 25 Abs. 2 Nr. 2 TDDDG – für die von euch gewünschte Funktion unbedingt erforderlich."]);
  await expect(page.locator("#p-privfull")).toContainText("Wendet euch dafür an den Betreiber (E-Mail: " + OP.email + ").");
  await expect(page.locator('#p-privfull h2.privh:text-is("Welche Daten?") + p + p')).toHaveText(TT_ACCESS_G);
  await expect(page.locator("#p-privfull")).toContainText("Der Tippzeit-Messung könnt ihr direkt mit einem Schalter widersprechen – siehe „" + TT_OBJ_HEAD + "“.");
  await expect(page.locator(`#p-privfull h2.privh:text-is("${TT_OBJ_HEAD}") + .ttoptbox + h2`)).toHaveText("Eure Rechte");
  await expect(page.locator("#p-privfull")).toContainText("Außerdem könnt ihr euch bei einer Datenschutz-Aufsichtsbehörde beschweren – für den Betreiber zuständig ist: " + OP_AUTH + ", datenschutz.hessen.de (öffnet in neuem Tab).");
  expect(await page.locator("#p-privfull").textContent()).not.toMatch(/\b(du|dein\w*|dir|dich)\b/i);
  await page.locator("#p-privfull summary").click();
  await expectOnlyTtShort(page, "Angaben (Partner- / Gruppenarbeit)");

  // Prüfungen: leeres Feld, eine Person, Zeichen, doppeltes Kürzel, Form; Fehler in #p-err, Feld markiert und fokussiert
  const err = page.locator("#p-err");
  const tryGroup = async (msg, focus) => {
    await page.click("#p-btn");
    await expect(err).toHaveText(msg);
    await expect(page.locator("#screen-person")).toHaveClass(/active/);
    await expect(page.locator(focus)).toBeFocused();
  };
  await tryGroup("Bitte tragt für Person 1 die ersten drei Buchstaben des Vornamens und die ersten zwei des Nachnamens ein (z. B. „MaxMu“).", "#p-m-1");
  await expect(page.locator("#p-m-1")).toHaveClass(/invalid/);
  await page.fill("#p-m-1", "max mu");
  await tryGroup("Für Partner- oder Gruppenarbeit tragt bitte mindestens zwei Personen ein. Arbeitest du allein, wähle „Einzelarbeit“.", "#p-add");
  await expect(page.locator("#p-m-1")).not.toHaveClass(/invalid/);
  await page.click("#p-add");
  await expect(page.locator("#p-m-2")).toBeFocused();
  await expect(page.locator("#p-members label")).toHaveText(["Person 1", "Person 2"]);
  await expect(page.locator("#p-members button")).toHaveCount(1);
  await expect(page.locator("#p-members button")).toHaveAttribute("aria-label", "Person 2 entfernen");
  await tryGroup("Bitte tragt für Person 2 die ersten drei Buchstaben des Vornamens und die ersten zwei des Nachnamens ein (z. B. „MaxMu“) – oder entfernt das leere Feld.", "#p-m-2");
  await page.fill("#p-m-2", "Li7");
  await tryGroup("Bei Person 2 sind nur Buchstaben erlaubt – zwischen Vor- und Nachnamen auch ein Leerzeichen oder ein Bindestrich.", "#p-m-2");
  await page.fill("#p-m-2", "MAXMU");   // ohne Groß-/Kleinschreibung dasselbe Kürzel
  await tryGroup("Person 1 und Person 2 haben dasselbe Kürzel („MaxMu“). Bitte prüft eure Eingaben – heißen zwei von euch wirklich so, lasst bei einer Person einen Buchstaben weg (z. B. „MaMu“ statt „MaxMu“).", "#p-m-2");
  await expect(page.locator("#p-m-2")).toHaveClass(/invalid/);
  await page.fill("#p-m-2", "li-mu");
  await page.click("#p-add");
  await page.keyboard.type("Tom Berg");
  await tryGroup("Bitte tragt für Person 3 die ersten drei Buchstaben des Vornamens und die ersten zwei des Nachnamens ein, z. B. „MaxMu“ (bei kürzerem Vornamen den ganzen Vornamen).", "#p-m-3");
  // Person 3 entfernen: Person 4 rückt nach (Nummer, Beschriftung, Entfernen-Knopf), der Fokus bleibt an dieser Stelle
  await page.click("#p-add");
  await expect(page.locator("#p-m-4")).toBeFocused();
  await page.keyboard.type("tim be");
  await page.getByRole("button", { name: "Person 3 entfernen" }).click();
  await expect(page.locator("#p-members input")).toHaveCount(3);
  await expect(page.locator("#p-m-3")).toHaveValue("tim be");
  await expect(page.locator("#p-m-3")).toBeFocused();
  await expect(page.locator("#p-members label")).toHaveText(["Person 1", "Person 2", "Person 3"]);
  await expect(page.locator("#p-members button")).toHaveCount(2);
  expect(await page.locator("#p-members button").evaluateAll((b) => b.map((x) => x.getAttribute("aria-label")))).toEqual(["Person 2 entfernen", "Person 3 entfernen"]);
  await expect(err).toHaveText("");   // die Meldung betraf das entfernte Feld
  await expect(page.locator("#p-members input.invalid")).toHaveCount(0);
  // betrifft die Meldung ein Feld vor der entfernten Zeile, bleibt sie samt Markierung (die Nummer stimmt weiter)
  const EMPTY2 = "Bitte tragt für Person 2 die ersten drei Buchstaben des Vornamens und die ersten zwei des Nachnamens ein (z. B. „MaxMu“) – oder entfernt das leere Feld.";
  await page.fill("#p-m-2", "");
  await page.click("#p-add");
  await page.keyboard.type("ali ka");
  await tryGroup(EMPTY2, "#p-m-2");
  await page.getByRole("button", { name: "Person 4 entfernen" }).click();
  await expect(page.locator("#p-members input")).toHaveCount(3);
  await expect(err).toHaveText(EMPTY2);
  await expect(page.locator("#p-m-2")).toHaveClass(/invalid/);
  await page.fill("#p-m-2", "li-mu");
  // höchstens 10 Personen: danach ist „Person hinzufügen“ gesperrt
  for (let n = 4; n <= 10; n++) { await page.click("#p-add"); await expect(page.locator("#p-m-" + n)).toBeFocused(); }
  await expect(page.locator("#p-members input")).toHaveCount(10);
  await expect(page.locator("#p-add")).toBeDisabled();
  await expect(page.locator("#p-add-hint")).toBeVisible();
  await expect(page.locator("#p-add-hint")).toHaveText("Höchstens 10 Personen.");
  // gesperrt per aria-disabled: per Tab erreichbar, der Grund steht in der Beschreibung; der Hinweis ist eine Statusmeldung
  await expect(page.locator("#p-add")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("#p-add")).toHaveAttribute("aria-describedby", "p-add-hint");
  await expect(page.locator("#p-add-hint")).toHaveAttribute("role", "status");
  await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Person 10 entfernen" })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(page.locator("#p-add")).toBeFocused();
  await expect(page.locator("#p-add")).toHaveAccessibleDescription("Höchstens 10 Personen.");
  await page.keyboard.press("Enter");   // tut nichts
  await expect(page.locator("#p-members input")).toHaveCount(10);
  await expect(page.locator("#p-add")).toBeFocused();
  await page.getByRole("button", { name: "Person 10 entfernen" }).click();
  await expect(page.locator("#p-m-9")).toBeFocused();   // das letzte Feld entfernt → das vorige
  await expect(page.locator("#p-add")).toBeEnabled();
  await expect(page.locator("#p-add")).toHaveAttribute("aria-disabled", "false");
  await expect(page.locator("#p-add-hint")).toBeHidden();
  await expect(page.locator("#p-add-hint")).toHaveText("");
  for (let n = 9; n >= 4; n--) await page.getByRole("button", { name: `Person ${n} entfernen` }).click();
  await expect(page.locator("#p-members input")).toHaveCount(3);
  // Enter springt ins nächste Feld, am Ende zur Klasse (einmal für die ganze Gruppe)
  await page.focus("#p-m-1");
  await page.keyboard.press("Enter"); await expect(page.locator("#p-m-2")).toBeFocused();
  await page.keyboard.press("Enter"); await expect(page.locator("#p-m-3")).toBeFocused();
  await page.keyboard.press("Enter"); await expect(page.locator("#p-klasse")).toBeFocused();
  await page.click("#p-btn");
  await expect(err).toHaveText("Bitte gebt eure Klasse ein (z. B. 8b).");
  await expect(page.locator("#p-klasse")).toHaveClass(/invalid/);
  // eine Person hinzufügen und wieder entfernen: die Meldung betrifft die Klasse – sie bleibt samt Markierung stehen
  await page.click("#p-add");
  await page.getByRole("button", { name: "Person 4 entfernen" }).click();
  await expect(page.locator("#p-m-3")).toBeFocused();
  await expect(err).toHaveText("Bitte gebt eure Klasse ein (z. B. 8b).");
  await expect(page.locator("#p-klasse")).toHaveClass(/invalid/);
  await page.fill("#p-klasse", "8b!");
  await page.click("#p-btn");
  await expect(err).toHaveText("Bitte gebt eure Klasse nur mit Buchstaben und Ziffern ein (z. B. 8b).");
  await shots(page, "2a-gruppe-fehler", [375]);
  await page.fill("#p-klasse", "8 b");
  if (SHOTS_OUT) await page.evaluate(() => { document.getElementById("p-err").textContent = ""; document.getElementById("p-klasse").classList.remove("invalid"); document.activeElement.blur(); });   // Foto ohne die alte Meldung
  await shots(page, "2-gruppe-angaben");
  await page.press("#p-klasse", "Enter");
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
  await expect(page.locator("#who-lbl")).toHaveText("Gruppe");
  await expect(page.locator("#who-name")).toHaveText("MaxMu, LiMu, TimBe · Klasse 8b");
  await shots(page, "2b-editor", [375]);
  await expect(page.locator("#privacy")).toContainText("werden deine erste Fassung und das Feedback zusammen mit den Namenskürzeln der Gruppe und der Klasse verschlüsselt");
  await expect(page.locator("#privacy")).toContainText("werden nur deine Antworten – ohne die Namenskürzel der Gruppe und die Klasse – an den Server dieser Seite geschickt");
  await expect(page.locator("#privacy")).not.toContainText("Geburtstag");
  // auch der ausführliche Hinweis im Schreibbereich („du“-Form) nennt bei der Gruppe keinen Geburtstag beim KI-Dienst
  await expect(page.locator("#privfull-ed")).toContainText("– ohne die Namenskürzel der Gruppe und die Klasse – und verarbeitet sie");
  await expect(page.locator("#privfull-ed")).not.toContainText("ohne Namenskürzel, Geburtstag und Klasse");
  for (let i = 0; i < 2; i++) await typeAt(page, "#a-" + (i + 1), G.first[i]);

  // Rechtschreibprüfung: die Altersgrenze gilt für alle, die mitschreiben – der Dialog fragt die ganze Gruppe
  await page.click("#t-1 .ltbtn");
  await expect(page.locator("#dlg-ok")).toHaveText("Trifft auf alle in eurer Gruppe zu – prüfen");
  await expect(page.locator("#dlg-cancel")).toHaveText("Trifft nicht auf alle zu");
  await expect(page.locator("#dlg-cancel")).toBeFocused();
  expect(await confirmDialog(page, "Rechtschreibung und Grammatik prüfen")).toBe(LT_CONSENT_GROUP);
  await expect(page.locator("#t-1 .lt-out .lt-text")).toHaveText("Keine Rechtschreib- oder Grammatikfehler gefunden.");
  expect(s.lt.map((r) => r.params.text)).toEqual([G.first[0]]);   // nur der Text der Antwort

  // KI-Feedback: weder Kürzel noch Klasse gehen an den Server oder die KI (der Dialog nennt keinen Geburtstag)
  await mockReset();
  await page.click("#fb-btn");
  const fbDlg = await confirmDialog(page, "KI-Feedback anfordern?");
  expect(fbDlg).toContain("Deine Antworten gehen – ohne die Namenskürzel der Gruppe und die Klasse – über den Server dieser Seite an den KI-Dienst „");
  expect(fbDlg).not.toContain("Geburtstag");
  await expect(page.locator("#t-1 .fbbox")).toBeVisible({ timeout: 60_000 });
  const [fbCall] = await s.calls((r) => r.path === "/api/feedback");
  expect(Object.keys(JSON.parse(fbCall.reqBody)).sort()).toEqual(["answers", "code", "recipients"]);
  const prompt = JSON.stringify((await mockState()).requests.map((r) => r.messages));
  expect(prompt).toContain(G.first[1]);
  for (const w of [...NAMES, "Klasse 8b"]) { expect(prompt).not.toContain(w); expect(fbCall.reqBody).not.toContain(w); }
  await expect.poll(async () => (await s.calls((r) => r.path === "/api/submit" && r.status === 200)).length, { timeout: 30_000 }).toBe(1);   // Erstversuch
  const firstSub = JSON.parse((await s.calls((r) => r.path === "/api/submit"))[0].reqBody);
  expect(firstSub.stage).toBe("first");
  for (const w of NAMES) expect(JSON.stringify(firstSub)).not.toContain(w);   // nur verschlüsselt

  // Neu laden → „Weiterschreiben?“ nennt die Gruppe → direkt in den Schreibbereich
  await typeAt(page, "#a-2", G.rev2);
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator("#resume-box")).toBeVisible();
  await expect(page.locator("#resume-text")).toHaveText("Auf diesem Gerät liegt ein Zwischenstand der Gruppe MaxMu, LiMu, TimBe · Klasse 8b (Code " + shown + "). Seid ihr das?");
  await page.click("#resume-btn");
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
  await expect(page.locator("#who-name")).toHaveText("MaxMu, LiMu, TimBe · Klasse 8b");
  expect(await page.inputValue("#a-2")).toBe(G.first[1] + G.rev2);
  await expect(page.locator("#t-1 .fbbox")).toBeVisible();
  // dieselbe Gruppe in anderer Reihenfolge (gleiches Gerät, zweiter Tab) findet denselben Zwischenstand
  const tab2 = await s.context.newPage();
  await tab2.goto("/");
  await enterCode(tab2, shown);
  await tab2.click("#mode-group");
  await tab2.fill("#p-m-1", "TimBe"); await tab2.click("#p-add"); await tab2.keyboard.type("limu"); await tab2.click("#p-add"); await tab2.keyboard.type("Max Mu");
  await tab2.fill("#p-klasse", "8b");
  await tab2.click("#p-btn");
  await expect(tab2.locator("#screen-editor")).toHaveClass(/active/);
  await expect(tab2.locator("#save-state")).toHaveText("Zwischenstand von diesem Gerät wiederhergestellt");
  await expect(tab2.locator("#who-name")).toHaveText("TimBe, Limu, MaxMu · Klasse 8b");   // „limu“ ohne Groß-/Kleinwechsel bleibt ein Teil – gleich ohne Groß-/Kleinschreibung
  expect(await tab2.inputValue("#a-2")).toBe(G.first[1] + G.rev2);
  await tab2.close();

  // Zwischenstand-PDF: Gruppe sichtbar und im Datensatz (ohne Geburtstag) → auf einem anderen Gerät wieder hochladen
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#ed-pdf")]);
  expect(dl.suggestedFilename()).toMatch(new RegExp("^Feibeitsblatt-Zwischenstand-" + shown + "-\\d{4}-\\d\\d-\\d\\d_\\d\\d-\\d\\d\\.pdf$"));
  const dpdf = await readFile(await dl.path());
  expect(pdfShownText(dpdf)).toContain("Gruppe: MaxMu, LiMu, TimBe · Klasse 8b");
  const i0 = dpdf.indexOf("/FbDraft 1"), d0 = dpdf.indexOf("stream\n", i0) + 7, d1 = dpdf.indexOf("\nendstream", d0);
  const draft = JSON.parse(dpdf.subarray(d0, d1).toString("utf8"));
  expect(draft.person).toEqual({ gruppe: NAMES, klasse: "8b" });
  expect(draft.answers).toEqual([G.first[0], G.first[1] + G.rev2]);
  const fresh = await openPage(browser);
  await fresh.page.setInputFiles("#start-pdf-file", await dl.path());
  await expect(fresh.page.locator("#screen-editor")).toHaveClass(/active/, { timeout: 30_000 });
  await expect(fresh.page.locator("#who-lbl")).toHaveText("Gruppe");
  await expect(fresh.page.locator("#who-name")).toHaveText("MaxMu, LiMu, TimBe · Klasse 8b");
  await expect(fresh.page.locator("#save-state")).toHaveText("Zwischenstand aus der PDF-Datei übernommen");
  expect(await fresh.page.inputValue("#a-2")).toBe(G.first[1] + G.rev2);
  await closePage(fresh);

  // Ein anderes Gerät: dieselbe Gruppe in anderer Reihenfolge holt ebenfalls KI-Feedback (eigener Erstversuch), gibt aber nicht ab
  const o = await openPage(browser);
  await enterCode(o.page, shown);
  await o.page.click("#mode-group");
  await o.page.fill("#p-m-1", "TimBe"); await o.page.click("#p-add"); await o.page.keyboard.type("LiMu"); await o.page.click("#p-add"); await o.page.keyboard.type("maxmu");
  await o.page.fill("#p-klasse", "8b");
  await o.page.click("#p-btn");
  await expect(o.page.locator("#screen-editor")).toHaveClass(/active/);
  for (let i = 0; i < 2; i++) await typeAt(o.page, "#a-" + (i + 1), "Unsere erste Idee " + (i + 1) + ".");
  await requestFeedback(o.page);
  await expect.poll(async () => (await o.calls((r) => r.path === "/api/submit" && r.status === 200)).length, { timeout: 30_000 }).toBe(1);
  await closePage(o);
  // Einzelarbeit derselben Klasse (gibt ohne KI-Feedback ab) – steht in der Liste vor der Gruppe
  const e = await openPage(browser);
  await enterCode(e.page, shown);
  await fillPerson(e.page, { vorname: "eva", nachname: "zo", geb: "--07-07", klasse: "8b" });
  for (let i = 0; i < 2; i++) await typeAt(e.page, "#a-" + (i + 1), "Meine Antwort " + (i + 1) + ".");
  await e.page.click("#submit-btn");
  await confirmDialog(e.page, "Ohne KI-Feedback abgeben?");
  await expect(e.page.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await closePage(e);

  // Abgabe der Gruppe → Lösungs-PDF nennt die Gruppe (Kopf und Fußzeile), der Dateiname keine Kürzel
  await page.click("#submit-btn");
  const subDlg = await confirmDialog(page, "Jetzt abgeben?");
  expect(subDlg).toContain("Deine Antworten gehen – ohne die Namenskürzel der Gruppe und die Klasse – über den Server");
  await expect(page.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await expect(page.locator("#done-fb .fbbox")).toHaveCount(2, { timeout: 60_000 });
  const [sdl] = await Promise.all([page.waitForEvent("download"), page.click("#done-pdf")]);
  expect(sdl.suggestedFilename()).toMatch(new RegExp("^Feibeitsblatt-Loesungen-" + shown + "-\\d{4}-\\d\\d-\\d\\d\\.pdf$"));
  const sol = pdfShownText(await readFile(await sdl.path()));
  expect(sol).toMatch(/Gruppe: MaxMu, LiMu, TimBe · Klasse 8b · abgegeben am \d\d\.\d\d\.\d{4}, \d\d:\d\d Uhr · Code /);
  expect(sol).toContain("Feibeitsblatt · " + GTITLE + " · Gruppe MaxMu, LiMu, TimBe · Seite 1 von ");
  expect(sol).not.toContain("undefined");
  await closePage(s);

  // Lehrkraft: Einzelarbeit unverändert, die Gruppe in einer Zeile mit allen Kürzeln und „Gruppe (3)“; der Erstversuch derselben
  // Gruppe (andere Reihenfolge, anderes Gerät) ist ausgeblendet
  await tp.click("#b-res-back");
  await expect(tp.locator("#t-sel-code")).toHaveText(shown);
  await expect(tp.locator("#t-subs-sum")).toHaveText("2 Abgaben · 1 älterer Erstversuch von Schüler:innen, die inzwischen abgegeben haben, wird nicht angezeigt");
  const mains = tp.locator("#t-subs-body tr.main");
  await expect(mains).toHaveCount(2);
  await expect(mains.nth(0).locator("td:not(.arrowcol)")).toHaveText(["Zo", "Eva", "07.07.", "8b"]);
  await expect(mains.nth(1).locator("td:not(.arrowcol)")).toHaveText(["MaxMu, LiMu, TimBe Gruppe (3)", "–", "8b"]);
  await expect(mains.nth(1).locator("td.grpcell .grpnames")).toHaveText("MaxMu, LiMu, TimBe");
  await expect(mains.nth(1).locator("td.grpcell .grpbadge")).toHaveText("Gruppe (3)");
  await expect(mains.nth(1).locator("td.grpcell")).toHaveAttribute("colspan", "2");
  await expect(mains.nth(1).locator("td.grpcell")).toHaveClass(/st-final/);
  expect(await mains.nth(1).locator(".sr-only").evaluateAll((x) => x.map((e) => e.closest("td").className))).toEqual(["arrowcol"]);   // Screenreader-Text nur in der Pfeilspalte
  await shots(tp, "3-lehrkraft-liste");
  await mains.nth(1).click();
  const det = tp.locator("#t-subs-body tr.details:visible");
  await expect(det.locator(".detbox:not(.older) > .dgroup")).toHaveText("Gruppenarbeit: MaxMu, LiMu, TimBe");
  const older = det.locator("details.dolder");
  await expect(older.locator("summary")).toHaveText("1 älterer Erstversuch dieser Gruppe (in der Liste ausgeblendet)");
  await older.locator("summary").click();
  await expect(older.locator(".detbox.older .dgroup")).toHaveText("Gruppenarbeit: TimBe, LiMu, MaxMu");
  await expect(older.locator(".detbox.older .moodle-hint")).toHaveText("Eine frühere Bearbeitung derselben Gruppe (z. B. auf einem anderen Gerät): erste Fassung mit dem KI-Feedback. In der Liste ist sie ausgeblendet, weil diese Gruppe inzwischen abgegeben hat.");
  await shots(tp, "4-lehrkraft-details", [1280]);
  // „Diesen Eintrag löschen“ nennt alle Kürzel und löscht die ganze Gruppenabgabe samt dem ausgeblendeten Erstversuch
  await det.getByRole("button", { name: "Diesen Eintrag löschen" }).click();
  expect(await confirmDialog(tp, "Diesen Eintrag löschen?")).toMatch(/^Die Abgabe der Gruppe MaxMu, LiMu, TimBe \(Klasse 8b\) vom \d\d\.\d\d\.\d{4}, \d\d:\d\d wird endgültig aus der Datenbank gelöscht – mitsamt einem älteren, ausgeblendeten Erstversuch derselben Gruppe\. Alle anderen Einträge bleiben\. Das lässt sich nicht rückgängig machen\.$/);
  await expect(tp.locator("#t-subs-status")).toHaveText("2 Einträge gelöscht.");
  await expect(mains).toHaveCount(1);
  await expect(mains.nth(0).locator("td:not(.arrowcol)")).toHaveText(["Zo", "Eva", "07.07.", "8b"]);
  // aufräumen: das Blatt samt der Einzelabgabe löschen
  await tp.click("#t-del-sheet");
  await confirmDialog(tp, "Feibeitsblatt löschen?");
  await expect(tp.locator("#t-list-status")).toHaveText("Feibeitsblatt gelöscht.");
  await closePage(t);
});

test("3 Schüler:in B (andere Angaben) gibt ebenfalls ab – vorher schlägt eine KI-Anfrage fehl", async ({ browser }) => {
  const s = await openPage(browser);
  const { page } = s;
  await enterCode(page, S.shown);
  await chooseSingle(page);
  await fillPerson(page, B.input);
  await expect(page.locator("#who-name")).toHaveText("Özg · Ün · 15.01. · Klasse 7a");
  // Ohne Geburtsjahr kennt die Seite das Alter nicht: Der Button steht bei jedem Textfeld, B (unter 16) lehnt im Dialog ab → nichts geht raus
  await expect(page.locator(".ltbtn")).toHaveCount(3);
  await expect(page.locator(".lt-off")).toHaveCount(0);
  await expect(page.locator("#privacy")).toContainText(LT_PRIVACY);
  for (let i = 0; i < 3; i++) await typeAt(page, "#a-" + (i + 1), B.first[i]);
  await page.click("#t-1 .ltbtn");
  await expect(page.locator("#dlg-title")).toHaveText("Rechtschreibung und Grammatik prüfen");
  await expect(page.locator("#dlg-cancel")).toBeFocused();
  // Klick neben den Dialog (z. B. vertippt auf dem Tablet): schließt nur – nichts gesendet, keine Antwort, die Buttons bleiben
  await page.waitForTimeout(450);                                        // (ein Klick direkt nach dem Öffnen zählt absichtlich nicht)
  await page.mouse.click(5, 5);
  await expect(page.locator("#dlg")).not.toHaveClass(/open/);
  await expect(page.locator(".ltbtn")).toHaveCount(3);
  await expect(page.locator(".lt-off")).toHaveCount(0);
  await expect(page.locator("#t-1 .ltstat:not(.lt-off)")).toHaveText("Ohne Bestätigung wird nichts an LanguageTool gesendet.");
  await expect(page.locator("#t-1 .ltbtn")).toBeFocused();
  expect(s.lt).toHaveLength(0);
  await page.click("#t-1 .ltbtn");                                       // der Dialog fragt wieder
  await expect(page.locator("#dlg-title")).toHaveText("Rechtschreibung und Grammatik prüfen");
  await expect(page.locator("#t-1 .ltstat:not(.lt-off)")).toHaveText("");
  await page.keyboard.press("Escape");                                   // Esc gilt wie „Trifft nicht zu“
  await expect(page.locator("#dlg")).not.toHaveClass(/open/);
  await expect(page.locator(".ltbtn")).toHaveCount(0);                   // für dieses geöffnete Blatt kein Button mehr …
  await expect(page.locator(".lt-off")).toHaveText([LT_OFF, LT_OFF, LT_OFF]);   // … sondern der Hinweis
  await expect(page.locator("#t-1 .lt-off")).toBeFocused();
  await expect(page.locator("#t-1 .ltstat:not(.lt-off)")).toHaveText("Ohne Bestätigung wird nichts an LanguageTool gesendet.");
  expect(s.lt).toHaveLength(0);
  await typeAt(page, "#a-1", " Ja.");                                    // Weiterschreiben räumt die Meldung weg
  await expect(page.locator("#t-1 .ltstat:not(.lt-off)")).toHaveText("");
  await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace");
  expect(await page.inputValue("#a-1")).toBe(B.first[0]);
  // gespeichert wird die Auswahl nicht: nach dem Neuladen („Weiterschreiben“) gibt es die Buttons wieder
  await page.waitForTimeout(700);
  await page.reload();
  await page.click("#resume-btn");
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
  // „Weiterschreiben“ überspringt den Angaben-Bildschirm – der vollständige Datenschutzhinweis steht deshalb auch im Editor
  await expect(page.locator("#screen-person")).not.toHaveClass(/active/);
  await page.locator("#privfull-ed summary").click();
  await expect(page.locator("#privfull-ed h3.privh")).toHaveText(PRIV_HEADS);
  await expect(page.locator("#privfull-ed")).toContainText(OP_RESP);
  await expect(page.locator('#privfull-ed h3.privh:text-is("Rechtsgrundlage") + ul > li')).toHaveText(privBases(true, DELIVER_WORKER));
  await expect(page.locator(".ltbtn")).toHaveCount(3);
  await expect(page.locator(".lt-off")).toHaveCount(0);
  for (let i = 0; i < 3; i++) expect(await page.inputValue("#a-" + (i + 1))).toBe(B.first[i]);
  // der Knopf „Trifft nicht zu“ selbst wirkt wie Esc
  await page.click("#t-1 .ltbtn");
  await expect(page.locator("#dlg-cancel")).toHaveText("Trifft nicht zu");
  await page.click("#dlg-cancel");
  await expect(page.locator("#dlg")).not.toHaveClass(/open/);
  await expect(page.locator(".ltbtn")).toHaveCount(0);
  await expect(page.locator(".lt-off")).toHaveText([LT_OFF, LT_OFF, LT_OFF]);
  await expect(page.locator("#t-1 .lt-off")).toBeFocused();
  expect(s.lt).toHaveLength(0);

  // KI lehnt ab (Mock: HTTP 401) → kurze Meldung ohne Interna, Feedback erneut möglich; „Abgeben“ ging die ganze Zeit
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
  await expect(page.locator("#submit-btn")).toBeEnabled();
  await expect(page.locator("#submit-hint")).toHaveText(SUBMIT_HINT_NO_FB);
  await expect(page.locator("#fb-fallback")).toBeHidden();
  await expect(page.locator("#t-1 .fbbox")).toBeHidden();
  expect(await page.$eval("#a-1", (e) => e.readOnly)).toBe(false);

  // zweiter Fehlschlag → Hinweis, dass das KI-Feedback gerade nicht möglich ist (die Lehrkraft sieht den Grund), Feedback bleibt möglich
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
  // B hat nach dem Feedback nichts geändert: der Dialog sagt es, und es geht keine weitere Anfrage an die KI
  await page.click("#submit-btn");
  expect(await confirmDialog(page, "Jetzt abgeben?")).toContain("An den Aufgaben, die die KI beurteilt, hast du nach dem KI-Feedback nichts geändert – deshalb wird nichts noch einmal an die KI gesendet");
  await expect(page.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await expect(page.locator("#done-fb-status")).toHaveText("An den Aufgaben, die die KI beurteilt, hast du nach dem ersten Feedback nichts verändert – die Rückmeldung bleibt dieselbe:");
  await expect(page.locator("#done-fb .fbbox")).toHaveCount(3);
  await expect(page.locator("#done-fb .fb-sum")).toHaveCount(0);   // alles unverändert: der Status sagt es schon, keine Zählung
  const bexp = expectedResults(TASKS, B.first);
  for (let n = 1; n <= 3; n++) {   // es gilt die erste Rückmeldung
    const box = page.locator("#done-fb-" + n);
    await expect(box.locator("ul.fb-ok li")).toHaveText(bexp[n - 1].covered);
    await expect(box.locator("ul.fb-miss li")).toHaveText(bexp[n - 1].missing);
  }
  expect(bexp[1].missing.length).toBeGreaterThan(0);   // Plausibilität: „Keine Ahnung“ bekommt Tipps
  await expect(page.locator("#done-fb-2 .fb-sub.fb-miss")).toHaveText("Tipps zum Weiterlernen");
  expect((await s.calls((r) => r.path === "/api/feedback")).map((r) => r.status)).toEqual([502, 502, 200]);
  const [bdl] = await Promise.all([page.waitForEvent("download"), page.click("#done-pdf")]);
  const bsol = (await readFile(await bdl.path())).toString("latin1");
  expect(bsol).toContain("(KI-Feedback \\(gilt auch f\\374r die abgegebene Fassung\\):) Tj");
  expect(bsol).not.toContain("lag beim Herunterladen noch nicht vor");
  S.sheetBodies.push(...(await s.calls((r) => r.path.startsWith("/api/sheet/"))).map((r) => r.body));
  await closePage(s);
});

test("3b Schüler:in C: KI fällt zweimal aus → Abgabe ohne KI-Feedback (der Dialog nennt den Grund)", async ({ browser }) => {
  const s = await openPage(browser);
  const { page } = s;
  await enterCode(page, S.shown);
  await fillPerson(page, C.input);
  await expect(page.locator("#who-name")).toHaveText("Lea · Sc · 29.02. · Klasse 9c");
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
  await expect(page.locator("#dlg-ok")).toHaveText("Ohne KI-Feedback abgeben");
  expect(await confirmDialog(page, "Ohne KI-Feedback abgeben?")).toBe(noFbDialog("KI nicht erreichbar"));
  await expect(page.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await expect(page.locator("#done-fb")).toBeHidden();   // ohne erstes Feedback keine zweite Rückmeldung
  await expect(page.locator("#done-del")).toContainText("nach " + DAYS + " Tagen automatisch gelöscht");
  // Lösungs-PDF ohne KI-Inhalt: keine KI-Kennzeichnung (kein Hinweis, kein XMP, kein Subject/Keywords), Aufbau gültig
  const [dlC] = await Promise.all([page.waitForEvent("download"), page.click("#done-pdf")]);
  const pdfC = await readFile(await dlC.path());
  const stC = pdfStructure(pdfC);
  for (const w of ["/Metadata", "compositeSynthetic", "/Keywords", "/Subject"]) expect(stC.s).not.toContain(w);
  expect(pdfShownText(pdfC)).not.toContain("hat eine KI erzeugt");
  const sub = await s.calls((r) => r.path === "/api/submit");
  expect(sub.map((r) => r.status)).toEqual([200]);
  expect((await s.calls((r) => r.path === "/api/feedback")).length).toBe(2);   // nur die zwei gescheiterten Versuche
  await closePage(s);
});

test("3c Schüler:in D: holt nur das KI-Feedback und gibt nicht ab → Erstversuch liegt verschlüsselt bei der Lehrkraft", async ({ browser }) => {
  const s = await openPage(browser);
  const { page } = s;
  await enterCode(page, S.shown);
  await fillPerson(page, D.input);
  await expect(page.locator("#who-name")).toHaveText("Tom · Ze · 02.02. · Klasse 9c");
  for (let i = 0; i < 3; i++) await typeAt(page, "#a-" + (i + 1), D.first[i]);
  // Ausgelastete KI: zweimal 429 ai_busy (Attrappe über route, retryAfter 5 s) → die Seite wartet mit Countdown und wiederholt
  // von selbst; währenddessen darf weitergeschrieben werden, der dritte Versuch schickt den aktuellen Text und geht durch
  let busy = 0;
  await page.route("**/api/feedback", async (route) => {
    if (busy < 2) { busy++; await route.fulfill({ status: 429, contentType: "application/json", headers: { "retry-after": "5" }, body: JSON.stringify({ ok: false, error: "Die KI ist gerade ausgelastet.", code: "ai_busy", aiCode: "RATE_LIMIT", retryAfter: 5 }) }); return; }
    await route.continue();
  });
  await expect(page.locator("#submit-btn")).toBeEnabled();
  await page.click("#fb-btn");
  const dlgText = await confirmDialog(page, "KI-Feedback anfordern?");
  expect(dlgText).toContain(FB_VOLUNTARY);
  expect(dlgText).toContain("an den KI-Dienst „127.0.0.1:");                       // der Empfänger steht im Dialog, nicht nur im Kleingedruckten
  expect(dlgText).toContain(RECIPIENT_SUFFIX + "“");
  expect(dlgText).toContain("ohne Namenskürzel, Geburtstag und Klasse");
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
  // kein Klartext neben dem Base64-Umschlag („9c“ fehlt in der Liste: als Base64-Zufallstreffer möglich)
  for (const p of ["Richter", "Tom", D.person.geburtsdatum, "vorname", "klasse"]) expect(post.reqBody).not.toContain(p);
  await expect(page.locator("#submit-btn")).toBeEnabled();   // … gibt aber nicht ab
  // „Abbrechen“ nimmt den Erstversuch nicht zurück – der Dialog sagt es (und wie falsche Angaben gelöscht werden)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("feibeitsblatt:draft:")))).firstSent)).toBe(true);
  await page.click("#ed-cancel");
  expect(await confirmDialog(page, "Zwischenstand löschen?", false)).toBe("Deine Antworten und Angaben werden von diesem Gerät gelöscht und nicht abgegeben. Das lässt sich nicht rückgängig machen. " +
    "Deine erste Fassung mit dem KI-Feedback und deinen Angaben hat deine Lehrkraft schon verschlüsselt als Erstversuch bekommen; waren deine Angaben falsch, sag ihr Bescheid – sie kann den Eintrag löschen.");
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
  await closePage(s);
});

test("3d Schüler:in E: KI bleibt ausgelastet → „Nicht länger warten“ zählt als Fehlversuch; nach dem zweiten Abbruch nennt die Seite den Grund (KI ausgelastet)", async ({ browser }) => {
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
    if (cycle === 1) { await expect(page.locator("#fb-fallback")).toBeHidden(); await expect(page.locator("#submit-btn")).toBeEnabled(); }
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

test("3e Übergang: Zwischenstände und Zwischenstand-PDFs mit vollem Geburtsdatum bleiben nutzbar (der jüngste gewinnt), unmögliche Geburtstage nicht – danach liegt nur noch Tag und Monat auf dem Gerät; nach BDAY_LEGACY_UNTIL wird nicht mehr gesucht", async ({ browser }) => {
  const s = await openPage(browser);
  const { page } = s;
  // Feste Uhrzeit im Browser vor bzw. nach dem Ende des Übergangs – so hängt der Test nicht vom heutigen Datum ab
  const until = /const BDAY_LEGACY_UNTIL = "(\d{4}-\d{2}-\d{2})";/.exec(await readFile(new URL("../../index.html", import.meta.url), "utf8"))[1];
  const T_IN = new Date(until + "T10:00:00").getTime() - 14 * 864e5, T_OUT = new Date(until + "T10:00:00").getTime() + 864e5;
  await page.clock.setFixedTime(T_IN);
  const OLD = { vorname: "Ole", nachname: "Al", geburtsdatum: "2010-03-07", klasse: "8a" };   // so speicherte die Seite bis zur Umstellung
  const OLD2 = { ...OLD, geburtsdatum: "2011-03-07" };                                         // gleiche Angaben, anderes Jahr
  const NEW = { ...OLD, geburtsdatum: "--03-07" };
  // Speicherschlüssel wie draftKeyFor in index.html: SHA-256 über Code|Kürzel|Geburtstag|Klasse (klein geschrieben)
  const keyOf = (p) => "feibeitsblatt:draft:" + createHash("sha256").update([S.code, p.vorname, p.nachname, p.geburtsdatum, p.klasse].join("|").toLocaleLowerCase("de-DE")).digest("hex");
  const oldKey = keyOf(OLD), oldKey2 = keyOf(OLD2), newKey = keyOf(NEW);
  expect(new Set([oldKey, oldKey2, newKey]).size).toBe(3);
  const draft = { v: 1, t: T_IN - 2 * 3600e3, answers: ["Alter Stand eins.", "", "Alter Stand drei."], first: null, feedback: null, feedbackAt: null, fbUnavailable: "", fbFails: 0, attempt: "00112233445566aa", firstSent: false };
  const draft2 = { ...draft, t: T_IN - 3600e3, answers: ["Jüngerer Stand eins.", "", "Jüngerer Stand drei."], attempt: "00112233445566bb" };
  const stored = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("feibeitsblatt:")).sort());
  const values = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("feibeitsblatt:")).map((k) => localStorage.getItem(k)).join("\n"));
  const setItems = (pairs) => page.evaluate((pairs) => { for (const [k, v] of pairs) localStorage.setItem(k, JSON.stringify(v)); }, pairs);
  const restored = async (state, d = draft) => {
    await expect(page.locator("#screen-editor")).toHaveClass(/active/);
    await expect(page.locator("#who-name")).toHaveText("Ole · Al · 07.03. · Klasse 8a");
    expect(await page.inputValue("#a-1")).toBe(d.answers[0]);
    expect(await page.inputValue("#a-3")).toBe(d.answers[2]);
    await expect(page.locator("#save-state")).toHaveText(state);
    expect(await stored()).toEqual([newKey, "feibeitsblatt:last"].sort());   // umgezogen, alte Schlüssel weg
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem("feibeitsblatt:last"))).person).toEqual(NEW);
    for (const g of [OLD.geburtsdatum, OLD2.geburtsdatum]) expect(await values()).not.toContain(g);
  };
  const cancel = async () => {
    await page.click("#ed-cancel");
    await confirmDialog(page, "Zwischenstand löschen?");
    await expect(page.locator("#screen-start")).toHaveClass(/active/);
    expect(await stored()).toEqual([]);
  };

  // 1) „Weiterschreiben“ nach Neuladen: Angaben und Speicherschlüssel noch mit vollem Datum → Anzeige ohne Jahr, Umzug beim Laden
  await setItems([[oldKey, draft], ["feibeitsblatt:last", { v: 1, t: T_IN - 2 * 3600e3, code: S.code, person: OLD }]]);
  await page.reload();
  await expect(page.locator("#resume-text")).toHaveText(`Auf diesem Gerät liegt ein Zwischenstand von Ole · Al · 07.03. · Klasse 8a (Code ${S.shown}). Bist du das?`);
  expect(await stored()).toEqual([newKey, "feibeitsblatt:last"].sort());
  await page.click("#resume-btn");
  await restored("Zwischenstand von diesem Gerät wiederhergestellt");
  await cancel();

  // 1b) Speicher des Geräts voll: Der Umzug löscht zuerst den alten Schlüssel – derselbe Stand passt dann unter den neuen
  const fill = () => page.evaluate(() => {   // bis zum Quota-Fehler füllen (zuletzt Zeichen für Zeichen)
    let n = 0;
    for (let size = 1 << 20; size >= 1;) { try { localStorage.setItem("fill:" + n, "x".repeat(size)); n++; } catch (e) { size >>= 1; } }
    return n;
  });
  const unfill = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("fill:")).forEach((k) => localStorage.removeItem(k)));
  await setItems([[oldKey, draft], ["feibeitsblatt:last", { v: 1, t: T_IN - 2 * 3600e3, code: S.code, person: OLD }]]);
  expect(await fill()).toBeGreaterThan(0);
  expect(await page.evaluate(() => { try { localStorage.setItem("fill:probe", "x"); return true; } catch (e) { return false; } })).toBe(false);
  await page.reload();
  await expect(page.locator("#resume-text")).toContainText("Ole · Al · 07.03. · Klasse 8a");
  await page.click("#resume-btn");
  await restored("Zwischenstand von diesem Gerät wiederhergestellt");
  await cancel();
  await unfill();

  // 1c) Scheitert das Speichern unter dem neuen Schlüssel trotzdem, bleibt der Stand für diese Sitzung im Arbeitsspeicher: Die
  //     Antworten sind da, die Statuszeile sagt, dass nicht gespeichert werden konnte; „Abbrechen und Zwischenstand löschen“ löscht
  //     auch diese Kopie
  await setItems([[oldKey, draft]]);
  await page.evaluate((k) => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, v) { if (key === k) throw new DOMException("Speicher voll", "QuotaExceededError"); return set.call(this, key, v); };
  }, newKey);
  await enterCode(page, S.shown);
  await fillPerson(page, { vorname: "ole", nachname: "al", geb: "--03-07", klasse: "8a" });
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
  expect(await page.inputValue("#a-1")).toBe(draft.answers[0]);
  expect(await page.inputValue("#a-3")).toBe(draft.answers[2]);
  await expect(page.locator("#save-state")).toHaveText("Zwischenstand konnte auf diesem Gerät nicht gespeichert werden");
  await expect(page.locator("#save-state")).toHaveClass(/\bbad\b/);
  expect(await stored()).toEqual(["feibeitsblatt:last"]);   // alter Schlüssel weg, neuer nicht speicherbar
  await cancel();
  await enterCode(page, S.shown);
  await fillPerson(page, { vorname: "ole", nachname: "al", geb: "--03-07", klasse: "8a" });
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
  expect(await page.inputValue("#a-1")).toBe("");            // nichts mehr da – auch nicht im Arbeitsspeicher
  await cancel();
  await page.reload();                                       // Speicher wieder normal

  // 2) Code und Angaben neu eingegeben (nur Tag und Monat): von zwei alten Ständen (verschiedene Jahre) gilt der jüngste,
  //    beide alten Schlüssel verschwinden (mit Tag und Monat lassen sie sich nicht mehr unterscheiden)
  await setItems([[oldKey, draft], [oldKey2, draft2]]);
  await enterCode(page, S.shown);
  await fillPerson(page, { vorname: "ole", nachname: "al", geb: "--03-07", klasse: "8a" });
  await restored("Zwischenstand von diesem Gerät wiederhergestellt", draft2);
  await cancel();

  // 3) Zwischenstand-PDF aus der Zeit davor (eingebetteter Datensatz mit vollem Datum, wie ihn makeDraftPdf schrieb) → das Jahr wird verworfen
  const draftPdf = (person) => {
    const rec = Buffer.from(JSON.stringify({ ...draft, kind: "feibeitsblatt-draft", code: S.code, sheetTitle: TITLE, person }), "utf8");
    return Buffer.concat([Buffer.from(`%PDF-1.7\n6 0 obj\n<< /Type /EmbeddedFile /Subtype /application#2Fjson /FbDraft 1 /Length ${rec.length} >>\nstream\n`), rec, Buffer.from("\nendstream\nendobj\n%%EOF\n")]);
  };
  // … liegt auf dem Gerät (noch unter einem alten Schlüssel) ein neuerer Stand, fragt die Seite; „Neueren Stand von diesem Gerät“
  // nimmt den umgezogenen Stand
  await setItems([[oldKey2, draft2]]);
  await page.setInputFiles("#start-pdf-file", { name: "alt.pdf", mimeType: "application/pdf", buffer: draftPdf(OLD) });
  await expect(page.locator("#dlg-title")).toHaveText("Neuerer Zwischenstand auf diesem Gerät");
  await expect(page.locator("#dlg-cancel")).toHaveText("Neueren Stand von diesem Gerät");
  await page.click("#dlg-cancel");
  await restored("Zwischenstand von diesem Gerät wiederhergestellt", draft2);
  await cancel();
  // … sonst gilt die PDF-Datei
  await page.setInputFiles("#start-pdf-file", { name: "alt.pdf", mimeType: "application/pdf", buffer: draftPdf(OLD) });
  await restored("Zwischenstand aus der PDF-Datei übernommen");
  await cancel();
  // … aber kein Zwischenstand mit einem Geburtstag, den es nicht gibt
  for (const [k, g] of ["--02-30", "--13-01", "2011-02-29"].entries()) {
    await page.evaluate(() => { document.getElementById("start-err").textContent = ""; });
    await page.setInputFiles("#start-pdf-file", { name: `falsch-${k}.pdf`, mimeType: "application/pdf", buffer: draftPdf({ ...NEW, geburtsdatum: g }) });
    await expect(page.locator("#start-err")).toContainText("In dieser Datei steckt kein Feibeitsblatt-Zwischenstand.");
    await expect(page.locator("#screen-start")).toHaveClass(/active/);
  }
  expect(await stored()).toEqual([]);

  // 4) Nach BDAY_LEGACY_UNTIL sucht die Seite nicht mehr unter alten Schlüsseln (nach DRAFT_DAYS gibt es dort ohnehin nichts mehr)
  await page.clock.setFixedTime(T_OUT);
  await setItems([[oldKey, { ...draft, t: T_OUT - 3600e3 }]]);
  await enterCode(page, S.shown);
  await fillPerson(page, { vorname: "ole", nachname: "al", geb: "--03-07", klasse: "8a" });
  await expect(page.locator("#save-state")).toHaveText("Zwischenstand wird auf diesem Gerät gespeichert");
  expect(await page.inputValue("#a-1")).toBe("");
  expect(await stored()).toEqual([oldKey, "feibeitsblatt:last"].sort());
  await page.click("#ed-cancel");
  await confirmDialog(page, "Zwischenstand löschen?");
  await expect(page.locator("#screen-start")).toHaveClass(/active/);
  expect(await stored()).toEqual([oldKey]);   // bleibt liegen, bis cleanupDrafts ihn nach DRAFT_DAYS löscht
  await page.evaluate(() => localStorage.clear());
  expect(await s.calls((r) => r.path === "/api/submit")).toEqual([]);   // nichts beim Server
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
  await expect(cells(0)).toHaveText([B.person.nachname, B.person.vorname, fmtBd(B.person.geburtsdatum), B.person.klasse]);
  await expect(cells(1)).toHaveText([A.person.nachname, A.person.vorname, fmtBd(A.person.geburtsdatum), A.person.klasse]);
  await expect(cells(2)).toHaveText([C.person.nachname, C.person.vorname, fmtBd(C.person.geburtsdatum), C.person.klasse]);
  await expect(cells(3)).toHaveText([D.person.nachname, D.person.vorname, fmtBd(D.person.geburtsdatum), D.person.klasse]);
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
  await expect(det.locator(".dmeta")).toHaveText(/^Abgegeben am \d\d\.\d\d\.\d{4}, \d\d:\d\d · KI-Feedback am \d\d\.\d\d\.\d{4}, \d\d:\d\d · automatische Löschung ab dem \d\d\.\d\d\.\d{4}$/);
  const [, gotA, delA] = /^Abgegeben am (\d\d\.\d\d\.\d{4}).* automatische Löschung ab dem (\d\d\.\d\d\.\d{4})$/.exec(await det.locator(".dmeta").textContent()) || [];
  const dmy = (x) => { const [d, m, y] = x.split(".").map(Number); return Date.UTC(y, m - 1, d); };
  expect([DAYS - 1, DAYS]).toContain(Math.round((dmy(delA) - dmy(gotA)) / 864e5));   // Eingang + Frist (Ortszeit: bei Zeitumstellung kurz nach Mitternacht ein Tag weniger)
  await expect(page.locator("#t-subs-retention")).toHaveText("Abgaben und Erstversuche werden " + DAYS + " Tage nach dem Eingang automatisch gelöscht. Notieren Sie, was Sie länger brauchen (z. B. Bewertungen), außerhalb von Feibeitsblatt.");
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
    const fb = dt.locator(".dfb:not(.dfb2)");
    if (expA[i].note) await expect(fb.locator(".fb-note")).toHaveText(expA[i].note);
    for (const c of expA[i].covered) await expect(fb.locator("ul.fb-ok")).toContainText(c);
    for (const m of expA[i].missing) await expect(fb.locator("ul.fb-miss")).toContainText(m);
  }
  const fb1 = (i) => tasks.nth(i).locator(".dfb:not(.dfb2)");
  expect(await aiMarks(fb1(0))).toEqual(["true", "feedback", AI_SOURCE]);   // KI-Kennzeichnung auch hier
  expect(await aiMarks(fb1(2))).toEqual([null, null, null]);                  // Aufgabe 3: nur der Hinweis ohne KI
  expect(await fb1(0).locator("ul.fb-ok").evaluate((e) => getComputedStyle(e).color)).toBe(GREEN);
  expect(await fb1(0).locator("ul.fb-miss").evaluate((e) => getComputedStyle(e).color)).toBe(RED);
  await expect(fb1(0).locator("p.fb-ok")).toHaveText("Gelingt schon:");
  await expect(fb1(0).locator("p.fb-miss")).toHaveText("Tipps zum Überarbeiten:");
  await expect(det).not.toContainText("ngesprochen");
  // die nachgereichte zweite KI-Rückmeldung: nur bei den nach dem Feedback geänderten Aufgaben 1 und 2 (Aufgabe 3 ohne Auftrag)
  const expA2 = expectedResults(TASKS, A.final);
  for (let i = 0; i < 3; i++) {
    const f2 = tasks.nth(i).locator(".dfb2");
    if (i === 2) { await expect(f2).toHaveCount(0); continue; }
    await expect(f2.locator(".fb-head")).toHaveText("KI-Rückmeldung zur abgegebenen Fassung");
    await expect(f2.locator("ul.fb-ok li")).toHaveText(expA2[i].covered);
    await expect(f2.locator("ul.fb-miss li")).toHaveText(expA2[i].missing);
    if (expA2[i].missing.length) await expect(f2.locator("p.fb-miss")).toHaveText("Tipps zum Weiterlernen:");
  }
  expect(await aiMarks(tasks.nth(0).locator(".dfb2"))).toEqual(["true", "feedback-final", AI_SOURCE]);
  // Lösungs-PDF aus der Übersicht: dieselbe Datei, die A nach der Abgabe bekam (gleicher sichtbarer Text, Test 3); Dateiname mit Klasse,
  // Kürzel und Abgabedatum, nie mit dem Geburtstag
  await expect(det.locator(".ddel button")).toHaveText(["Lösungs-PDF herunterladen", "Diesen Eintrag löschen"]);
  const [adl] = await Promise.all([page.waitForEvent("download"), det.locator("button.dpdf").click()]);
  const [dd, mm, yy] = gotA.split(".");
  expect(adl.suggestedFilename()).toBe(`Feibeitsblatt-Loesungen-${S.shown}-8b-MaxMu-${yy}-${mm}-${dd}.pdf`);
  const aBuf = await readFile(await adl.path());
  pdfStructure(aBuf);
  expect(aBuf.toString("latin1")).toContain("/Metadata ");   // KI-Kennzeichnung wie bei der Schülerin
  expect(pdfShownText(aBuf)).toBe(S.solA);
  expect(pdfShownText(aBuf)).not.toContain(fmtBd(A.person.geburtsdatum));
  await expect(page.locator("#t-subs-status")).toHaveText("");

  // C: ohne KI-Feedback abgegeben, weil die KI ausfiel → Hinweis mit Grund, nur eine Spalte (die abgegebene Fassung)
  await mains.nth(2).click();
  const detC = page.locator("#t-subs-body tr.details").nth(2);
  await expect(detC.locator(".moodle-hint")).toHaveText("Ohne KI-Feedback abgegeben – das KI-Feedback war nicht möglich (KI nicht erreichbar).");
  await expect(detC.locator(".dmeta")).toHaveText(/^Abgegeben am \d\d\.\d\d\.\d{4}, \d\d:\d\d · ohne KI-Feedback · automatische Löschung ab dem \d\d\.\d\d\.\d{4}$/);
  await expect(detC.locator(".dtask").nth(0).locator("table.cmp thead th")).toHaveText(["Abgegebene Fassung (ohne KI-Feedback)"]);
  const tdC = detC.locator(".dtask").nth(0).locator("table.cmp tbody td");
  await expect(tdC).toHaveCount(1);
  expect(await tdC.nth(0).textContent()).toBe(C.first[0]);
  await expect(detC.locator(".dfb")).toHaveCount(0);
  const [cdl] = await Promise.all([page.waitForEvent("download"), detC.locator("button.dpdf").click()]);
  const cText = pdfShownText(await readFile(await cdl.path()));
  expect(cText).toContain("Ohne KI-Feedback abgegeben – das KI-Feedback war nicht möglich (KI nicht erreichbar).");
  expect(cText).not.toContain("KI-Rückmeldung");
  await mains.nth(2).click();

  // D: Erstversuch ohne Überarbeitung → Hinweis, Spalte 1 = erste Fassung, Spalte 2 „(noch nicht überarbeitet)“, Feedback dabei
  await mains.nth(3).click();
  const detD = page.locator("#t-subs-body tr.details").nth(3);
  await expect(detD.locator(".dmeta")).toHaveText(/^Erstversuch ohne Überarbeitung – noch nicht abgegeben · KI-Feedback am \d\d\.\d\d\.\d{4}, \d\d:\d\d · automatische Löschung ab dem \d\d\.\d\d\.\d{4}$/);
  await expect(detD.locator(".dmeta")).toHaveClass(/st-first/);
  await expect(detD.locator(".moodle-hint")).toContainText("hat das KI-Feedback angefordert, aber (noch) nicht abgegeben");
  const tdD = detD.locator(".dtask").nth(0).locator("table.cmp tbody td");
  expect(await tdD.nth(0).textContent()).toBe(D.first[0]);
  expect(await tdD.nth(1).textContent()).toBe("(noch nicht überarbeitet)");
  const expD = expectedResults(TASKS, D.first);
  await expect(detD.locator(".dtask").nth(0).locator(".dfb ul.fb-miss li")).toHaveText(expD[0].missing);
  await expect(detD.locator("button.dpdf")).toHaveCount(0);   // ein Erstversuch hat noch keine abgegebene Fassung
  await expect(detD.locator(".dfb2")).toHaveCount(0);
  await mains.nth(3).click();

  // Alle aufklappen / zuklappen; B: erste = letzte Fassung
  await page.click("#t-expand-all");
  await expect(page.locator("#t-subs-body tr.details:visible")).toHaveCount(4);
  await expect(page.locator("#t-expand-all")).toHaveText("Alle zuklappen");
  const bFirst = page.locator("#t-subs-body tr.details").nth(0).locator(".dtask").nth(0).locator("table.cmp tbody td");
  expect(await bFirst.nth(0).textContent()).toBe(B.first[0]);
  expect(await bFirst.nth(1).textContent()).toBe(B.final[0] + "(unverändert)");
  const detB = page.locator("#t-subs-body tr.details").nth(0);
  await expect(detB.locator(".dfb2")).toHaveCount(0);   // nichts geändert: keine zweite Rückmeldung, es gilt die erste
  const [bdl] = await Promise.all([page.waitForEvent("download"), detB.locator("button.dpdf").click()]);
  const bText = pdfShownText(await readFile(await bdl.path()));
  expect(bText).toContain("KI-Feedback (gilt auch für die abgegebene Fassung):");
  expect(bText).not.toContain("nicht an die Lehrkraft übermittelt");
  expect(bdl.suggestedFilename()).toMatch(/^Feibeitsblatt-Loesungen-[A-Z0-9]{3}-[A-Z0-9]{3}-7a-OezgUen-\d{4}-\d\d-\d\d\.pdf$/);   // Umlaute als ASCII
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
// Wie ein PDF-Programm, das neu speichert: Wörterbuch und Daten eines Streams ändern; lenRef = Länge als Verweis ans Dateiende
function editStream(pdf, mark, { dict = (d) => d, data = (b) => b, lenRef = 0 } = {}) {
  const x = pdfStream(pdf, mark), body = data(Buffer.from(pdf.subarray(x.start, x.start + x.len)));
  const d = dict(x.dict).replace(/\/Length \d+/, lenRef ? `/Length ${lenRef} 0 R` : "/Length " + body.length);
  const eof = pdf.toString("latin1").lastIndexOf("%%EOF");
  return Buffer.concat([pdf.subarray(0, x.obj), Buffer.from(d + "stream\n", "latin1"), body, pdf.subarray(x.start + x.len, eof),
    Buffer.from((lenRef ? `${lenRef} 0 obj\n${body.length}\nendobj\n` : "") + "%%EOF\n", "latin1")]);
}

test("4b Lehrkraft: Feibeitsblatt als PDF-Datei sichern → wieder hochladen → neuer Code mit denselben Aufgaben, Aufträgen an die KI, Material, Bildern und PDF-Dateien", async ({ browser }) => {
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
  await expect(page.locator("#t-export-status")).toHaveText(/^Die PDF-Datei \(\d+(,\d)? (KB|MB)\) wird heruntergeladen\. Bewahren Sie sie gut auf – sie enthält auch Ihre Aufträge an die KI\.$/);
  const pdf = await readFile(await dl.path()), text = pdf.toString("latin1");
  expect(text.startsWith("%PDF-1.7")).toBe(true);
  expect((text.match(/\/Subtype \/Image /g) || []).length).toBe(2);   // beide Bilder sichtbar
  expect(text).toContain("/Filter /DCTDecode");
  expect(text).toContain("(Aufgabe 1) Tj");
  expect(text).toContain("(Nicht an Sch\\374ler:innen weitergeben");   // Warnung (fett, rot) – Umbruch je nach Breite
  expect(text).toContain("Auftr\\344ge");                              // … die Datei enthält die Aufträge an die KI (ä = \344)
  expect(text).not.toContain("Musterl\\366sung");
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
  for (const p of [...A.first, ...A.final, A.person.vorname, A.person.geburtsdatum]) expect(JSON.stringify(rec)).not.toContain(p);   // keine Abgaben

  // eine fremde PDF und ein Zwischenstand von Schüler:innen → Meldung, der Editor öffnet sich nicht
  await page.setInputFiles("#t-import-file", { name: "fremd.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n") });
  await expect(page.locator("#t-import-status")).toHaveText("In dieser PDF-Datei steckt kein Feibeitsblatt. Bitte wählen Sie eine Datei, die Sie mit „Als PDF-Datei herunterladen“ gesichert haben.");
  await page.setInputFiles("#t-import-file", { name: "z.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n9 0 obj\n<< /Type /EmbeddedFile /FbDraft 1 /Length 2 >>\nstream\n{}\nendstream\nendobj\n%%EOF\n") });
  await expect(page.locator("#t-import-status")).toHaveText(/^Das ist ein Zwischenstand von Schüler:innen, kein gesichertes Feibeitsblatt\./);
  await expect(page.locator("#tv-overview")).toBeVisible();

  // ein beschädigtes Bild (Prüfsumme falsch) wird mit Hinweis weggelassen, der Rest geladen; zurück zur Übersicht
  const [img1, img2] = rec.tasks[0].images.map((m) => m.ref), fileRef = rec.tasks[1].files[0].ref;
  const damaged = editStream(pdf, "/FbBlob (" + img2 + ")", { data: (b) => { b[b.length - 10] ^= 0xff; return b; } });
  await page.setInputFiles("#t-import-file", { name: "beschaedigt.pdf", mimeType: "application/pdf", buffer: damaged });
  await expect(page.locator("#tv-builder")).toBeVisible();
  await expect(page.locator("#b-err")).toHaveText("Ein Bild aus der PDF-Datei war beschädigt oder nicht lesbar und fehlt hier.");
  await expect(page.locator("#b-rows > tr").nth(0).locator(".bimg")).toHaveCount(1);
  await expect(page.locator("#b-rows > tr").nth(1).locator(".bfile")).toHaveCount(1);
  await page.click("#b-back");
  await expect(page.locator("#tv-overview")).toBeVisible();
  await expect(page.locator("#t-import-status")).toHaveText("");

  // Laden einer „neu gespeicherten“ Fassung, wie sie PDF-Programme schreiben: die angehängte PDF-Datei komprimiert, das
  // Kennzeichen kompakt („/FbBlob(…)“, Bindestrich oktal maskiert), Länge als Verweis; bei Bild 1 fehlt das Kennzeichen
  // ganz (wird über Größe und Prüfsumme gefunden) – der Editor wird trotzdem vollständig gefüllt
  let resaved = editStream(pdf, "/FbBlob (" + fileRef + ")", { lenRef: 999, data: (b) => deflateSync(b),
    dict: (d) => d.replace("/FbBlob (" + fileRef + ")", "/FbBlob(" + fileRef.replace("-", "\\055") + ")").replace("/Length", "/Filter/FlateDecode/Length") });
  resaved = editStream(resaved, "/FbBlob (" + img1 + ")", { dict: (d) => d.replace("/FbBlob (", "/XxBlob (") });
  // dieselbe Objektnummer der Länge kommt vorher noch einmal mit anderem Wert vor (wie in einer angehängten PDF-Datei)
  const hdr = resaved.indexOf("\n", 9) + 1;
  resaved = Buffer.concat([resaved.subarray(0, hdr), Buffer.from("999 0 obj\n43\nendobj\n", "latin1"), resaved.subarray(hdr)]);
  expect(resaved.toString("latin1")).toContain("/FbBlob(" + fileRef.slice(0, 16) + "\\0553)");
  expect(resaved.toString("latin1")).toContain("/Filter/FlateDecode/Length 999 0 R");
  expect(resaved.toString("latin1")).not.toContain("/FbBlob (" + img1 + ")");
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
    await expect(rows.nth(i).locator(".bq-edit")).toHaveText(TASKS[i].text, { useInnerText: true });
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
  // die Sicherung selbst (mit den Aufträgen an die KI) lässt sich nicht als Material für Schüler:innen anhängen
  await rows.nth(2).locator("input.bfile-input").setInputFiles({ name: "Sicherung.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(rows.nth(2).locator(".bfile-stat")).toHaveText("„Sicherung.pdf“: Das ist eine gesicherte Feibeitsblatt-Datei – sie enthält die Aufträge an die KI und darf nicht an Schüler:innen gehen. Zum Wiederverwenden: „Feibeitsblatt aus PDF-Datei laden“ in der Übersicht.");
  await expect(rows.nth(2).locator(".bfile")).toHaveCount(0);
  // … auch dann nicht, wenn ein PDF-Programm das Kennzeichen /FbSheet entfernt hat (erkannt am eingebetteten Datensatz)
  const unmarked = editStream(pdf, "/FbSheet 1", { dict: (d) => d.replace("/FbSheet 1", "/XxSheet 1") });
  expect(unmarked.toString("latin1")).not.toContain("/FbSheet");
  await rows.nth(2).locator("input.bfile-input").setInputFiles({ name: "Sicherung2.pdf", mimeType: "application/pdf", buffer: unmarked });
  await expect(rows.nth(2).locator(".bfile-stat")).toContainText("„Sicherung2.pdf“: Das ist eine gesicherte Feibeitsblatt-Datei");
  await expect(rows.nth(2).locator(".bfile")).toHaveCount(0);

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

test("5 Datenbank enthält keinen Klartext der Abgaben; /api/sheet liefert nie die Aufträge an die KI", async ({ request }) => {
  // gespeicherte Umschläge (wrangler d1 execute auf derselben lokalen D1)
  const rows = await d1Query("SELECT id, sheet_code, received_at, envelope, stage, attempt FROM submissions ORDER BY id");
  expect(rows).toHaveLength(4);
  expect(rows.map((r) => r.stage)).toEqual(["final", "final", "final", "first"]);   // A (Erstversuch → Abgabe, eine Zeile), B, C, D
  for (const r of rows) expect(r.attempt).toMatch(ATTEMPT);
  expect(new Set(rows.map((r) => r.attempt)).size).toBe(4);
  // Klartext, der nur verschlüsselt gespeichert sein darf. Im Umschlag selbst (Base64, geprüft per Regex) kann keiner dieser Texte
  // stehen – die Liste fängt Klartext neben dem Umschlag und unten in allen Dateien des lokalen Zustands (Logs, WAL)
  const forbidden = [...A.first, ...A.final, ...B.first, ...C.first, ...D.first].flatMap((a) => a.split("\n")).concat(
    ["Gewissn", "Schwester angelogen", "Lügen ist unfair", "innere Stimme", "Keine Ahnung", "innerer Richter",
      '"Max"', '"Mu"', '"8b"', '"Özg"', '"Ün"', '"7a"', "Özg", '"Lea"', '"9c"', '"Tom"', '"Ze"', ...[A, B, C, D].map((x) => x.person.geburtsdatum),
      "vorname", "nachname", "geburtsdatum", "klasse", "person", "feedbackError", "unavailable"]);   // C: noAi "unavailable"
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
  expect(settings.map((s) => s.key)).toEqual(["ai", "privacy", "teacher"]);
  expect(Object.keys(JSON.parse(settings[1].value)).sort()).toEqual(["retentionDays", "updatedAt", "v"]);   // nur die Löschfrist (keine Schulangaben)
  for (const f of forbidden) expect(settings[1].value).not.toContain(f);
  const ai = JSON.parse(settings[0].value);
  expect(ai.apiKey).toBeUndefined();                // mit SETTINGS_SECRET verschlüsselt
  expect(Object.keys(ai.apiKeyEnc).sort()).toEqual(["ct", "iv"]);
  expect(settings[0].value).not.toContain(AI_KEY);
  expect(settings[2].value).not.toContain(PW);

  // Rohbytes aller Dateien des lokalen Zustands (inkl. WAL); Gegenprobe: Aufgabentext und Umschlag sind auffindbar
  const control = [TASKS[0].text, '"ek":"', '"apiKeyEnc"'];
  const scan = await scanState([...control, ...forbidden.filter((f) => f.length >= 6 || /[^A-Za-z0-9]/.test(f)), AI_KEY, PW]);
  expect(scan.files).toBeGreaterThan(0);
  for (const c of control) expect(scan.count[c], "Gegenprobe „" + c + "“").toBeGreaterThan(0);
  for (const [needle, n] of Object.entries(scan.count)) if (!control.includes(needle)) expect(n, "Klartext „" + needle + "“ im Zustandsordner").toBe(0);

  // öffentlicher Abruf (auch mit Kleinbuchstaben/Bindestrich): nur Aufgabentexte, nie die Aufträge an die KI (solution)
  for (const c of [S.code, S.shown.toLowerCase(), S.shown]) {
    const res = await request.get("/api/sheet/" + encodeURIComponent(c));
    expect(res.status()).toBe(200);
    const body = await res.text();
    const j = JSON.parse(body);
    expect(Object.keys(j.sheet).sort()).toEqual(["aiFeedback", "aiProvider", "aiRecipients", "code", "escape", "privacy", "publicKey", "tasks", "title"]);
    expect(j.sheet.aiFeedback).toBe(true);
    expect(j.sheet.escape).toBe(null);   // kein Finale eines Escape-Rooms
    expect(j.sheet.aiRecipients).toEqual([{ id: "custom:" + j.sheet.aiProvider, label: j.sheet.aiProvider + RECIPIENT_SUFFIX, transfer: "vom Betreiber dieser Seite beim Anbieter zu prüfen" }]);
    expect(j.sheet.privacy).toEqual({ retentionDays: DAYS });   // nur die Frist (ohne updatedAt; verantwortlich ist der Betreiber, fest in index.html)
    expect(j.sheet.tasks).toEqual(TASKS.map((t, i) => ({ text: t.text, textFmt: [], material: S.material[i], images: i === 0 ? S.imgs.map((m) => ({ id: m.id, mode: m.mode, w: m.w, h: m.h, alt: m.alt })) : [], files: i === 1 ? [S.pdf] : [], answer: { type: "text" } })));
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

test("7b Schüler:in F: nur Aufgabe 2 überarbeitet, Aufgabe 1 nur ein Leerzeichen → neu beurteilt wird nur Aufgabe 2", async ({ browser }) => {
  // eigenes kleines Blatt mit zwei Aufgaben mit Auftrag an die KI (das Blatt der früheren Tests ist gelöscht); am Ende wieder löschen
  const t = await openPage(browser);
  await teacherLogin(t.page, PW);
  await t.page.click("#t-new");
  await t.page.fill("#b-title", "Zweite Rückmeldung");
  for (let i = 0; i < 2; i++) { await t.page.fill("#bq-" + (i + 1), TASKS[i].text); await t.page.fill("#bs-" + (i + 1), TASKS[i].solution); }
  await t.page.click("#b-gen");
  await expect(t.page.locator("#b-result")).toBeVisible();
  const shownF = (await t.page.locator("#b-res-code").textContent()).trim();
  const TASKS_F = TASKS.slice(0, 2);
  const F = { first: ["Das Gewissen ist eine innere Instanz.", "Ich habe einmal gelogen."], rev2: " Die Begründung: Lügen ist unfair." };
  const s = await openPage(browser);
  const { page } = s;
  await enterCode(page, shownF);
  await fillPerson(page, { vorname: "ina", nachname: "fe", geb: "--09-09", klasse: "8a" });
  for (let i = 0; i < 2; i++) await typeAt(page, "#a-" + (i + 1), F.first[i]);
  await mockReset();
  await requestFeedback(page);
  const exp1 = expectedResults(TASKS_F, F.first);
  // Aufgabe 1: nur ein Leerzeichen am Ende (für den Server derselbe Text), Aufgabe 2 inhaltlich überarbeitet
  await typeAt(page, "#a-1", " ");
  await typeAt(page, "#a-2", F.rev2);
  const finals = [F.first[0] + " ", F.first[1] + F.rev2];
  await page.click("#submit-btn");
  expect(await confirmDialog(page, "Jetzt abgeben?")).toContain("Danach bekommst du eine neue KI-Rückmeldung zu Aufgabe 2: Von den Aufgaben, die die KI beurteilt, hast du nur diese nach dem KI-Feedback geändert – nur sie geht noch einmal an die KI; für die übrigen Aufgaben gilt das erste Feedback weiter. Die neue Rückmeldung geht danach verschlüsselt auch an deine Lehrkraft. Deine Antworten gehen");
  await expect(page.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await expect(page.locator("#done-fb .fbbox")).toHaveCount(2, { timeout: 60_000 });
  await expect(page.locator("#done-fb-status")).toHaveText("So sieht die KI deine abgegebene Fassung:");
  const exp2 = expectedResults(TASKS_F, finals);
  const read = async (n) => { const box = page.locator("#done-fb-" + n); return { covered: await box.locator("ul.fb-ok li").allTextContents(), missing: await box.locator("ul.fb-miss li").allTextContents() }; };
  // Aufgabe 1 bleibt bei der ersten Rückmeldung (nicht neu beurteilt) und sagt das …
  expect(exp1[0].covered.length + exp1[0].missing.length).toBeGreaterThan(0);
  expect(await read(1)).toEqual({ covered: exp1[0].covered, missing: exp1[0].missing });
  await expect(page.locator("#done-fb-1 .fb-sum")).toHaveText("Unverändert abgegeben – wie beim ersten Feedback.");
  // … Aufgabe 2 zeigt die neue Rückmeldung (ohne Hinweis und ohne Zählung)
  expect(exp2[1].covered.length).toBeGreaterThan(exp1[1].covered.length);   // Plausibilität: die Begründung bringt einen „gut“-Stichpunkt mehr
  expect(await read(2)).toEqual({ covered: exp2[1].covered, missing: exp2[1].missing });
  await expect(page.locator("#done-fb-2 .fb-sum")).toHaveCount(0);
  await expect(page.locator("#done-fb-2 .fb-sub.fb-ok")).toHaveText("Das gelingt dir schon");
  // genau eine weitere Anfrage an die KI – nur mit Aufgabe 2 (Antwort und Nummer); Aufgabe 1 geht leer mit und nicht an die KI
  const fbCalls = await s.calls((r) => r.path === "/api/feedback");
  expect(fbCalls.map((r) => r.status)).toEqual([200, 200]);
  const fb2Body = JSON.parse(fbCalls[1].reqBody);
  expect(fb2Body.answers).toEqual(["", finals[1]]);
  expect(fb2Body.only).toEqual([2]);
  const msF = await mockState();
  expect(msF.count).toBe(2);
  const prompt2 = msF.requests[1].messages[1].content;
  expect(prompt2).toContain("(Nummern: 2):");
  expect(prompt2).not.toContain("### Aufgabe 1");
  expect(prompt2).not.toContain(F.first[0]);
  expect(prompt2).not.toContain(TASKS_F[0].text);
  // PDF: neue Rückmeldung nur bei Aufgabe 2; Aufgabe 1 „gilt auch für die abgegebene Fassung“, ohne „Erste Fassung“ (nur ein Leerzeichen)
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#done-pdf")]);
  const sol = (await readFile(await dl.path())).toString("latin1");
  expect(sol.split("(KI-R\\374ckmeldung zur abgegebenen Fassung").length - 1).toBe(1);
  expect(sol).toContain("(KI-Feedback \\(gilt auch f\\374r die abgegebene Fassung\\):) Tj");
  expect(sol).toContain("(KI-Feedback zur ersten Fassung:) Tj");
  expect(sol.split("(Erste Fassung \\(vor dem KI-Feedback\\):) Tj").length - 1).toBe(1);
  await closePage(s);
  // aufräumen: das Blatt samt Abgabe löschen (die Tests 8 und 9 legen ihre eigenen Blätter an)
  await t.page.click("#b-res-back");
  await expect(t.page.locator("#t-sel-code")).toHaveText(shownF);
  await t.page.click("#t-del-sheet");
  await confirmDialog(t.page, "Feibeitsblatt löschen?");
  await expect(t.page.locator("#t-list-status")).toHaveText("Feibeitsblatt gelöscht.");
  await closePage(t);
});

test("7h Tageskontingent der KI aufgebraucht (503 ai_quota): Q bekommt sofort den Weg ohne KI-Feedback (kein automatischer Versuch), R nach der Abgabe keine Wiederholung der zweiten Rückmeldung; die Lehrkraft sieht den Grund", async ({ browser }) => {
  const t = await openPage(browser);
  const tp = t.page;
  await teacherLogin(tp, PW);
  await tp.click("#t-new");
  await tp.fill("#b-title", "Kontingent");
  for (let i = 0; i < 2; i++) { await tp.fill("#bq-" + (i + 1), TASKS[i].text); await tp.fill("#bs-" + (i + 1), TASKS[i].solution); }
  await tp.click("#b-gen");
  await expect(tp.locator("#b-result")).toBeVisible();
  const shownQ = (await tp.locator("#b-res-code").textContent()).trim();
  const quota = (route) => route.fulfill({ status: 503, contentType: "application/json",
    body: JSON.stringify({ ok: false, error: "Das KI-Kontingent für heute ist aufgebraucht. Morgen geht es wieder.", code: "ai_quota", aiCode: "DAILY_LIMIT" }) });

  // Q: schon die erste Anfrage trifft auf das aufgebrauchte Kontingent. Empfänger wie bei Workers AI als erstem Anbieter und Groq als
  // Reserve (Antwort des Servers ergänzt): Hinweis und Dialog sagen, wann die Reserve einspringt, und widersprechen sich beim Sitz nicht
  const Q = { input: { vorname: "quirin", nachname: "qu", geb: "--11-11", klasse: "8a" }, first: ["Das Gewissen ist eine innere Stimme.", "Ich habe gelogen."] };
  const s = await openPage(browser);
  const { page } = s;
  const codeQ = shownQ.replace("-", "");
  await page.route((u) => u.pathname === "/api/sheet/" + codeQ, async (route) => {
    const res = await route.fetch(), j = await res.json();
    return route.fulfill({ json: { ...j, sheet: { ...j.sheet, aiProvider: "Cloudflare Workers AI", aiRecipients: [{ id: "cloudflare", label: CF_RECIPIENT }, { id: "groq", label: GROQ_RECIPIENT }] } } });
  });
  await enterCode(page, shownQ);
  await fillPerson(page, Q.input);
  await expect(page.locator("#privacy")).toContainText("an den KI-Dienst „" + CF_RECIPIENT + "“ weiter – nur wenn dieser nicht antwortet, ausgelastet ist, sein Tageskontingent aufgebraucht hat oder kein brauchbares Feedback liefert, nacheinander an „" + GROQ_RECIPIENT + "“ – und speichert selbst nichts davon; der KI-Dienst verarbeitet sie nach seinen eigenen Bedingungen, bei Cloudflare auch außerhalb der EU möglich, bei den übrigen Diensten mit Sitz in den USA außerhalb der EU. ");
  for (let i = 0; i < 2; i++) await typeAt(page, "#a-" + (i + 1), Q.first[i]);
  await page.route("**/api/feedback", quota);
  await page.click("#fb-btn");
  expect(await confirmDialog(page, "KI-Feedback anfordern?")).toContain("Deine Antworten gehen – ohne Namenskürzel, Geburtstag und Klasse – über den Server dieser Seite an den KI-Dienst „" + CF_RECIPIENT + "“. " +
    "Nur wenn dieser Dienst nicht antwortet, ausgelastet ist, sein Tageskontingent aufgebraucht hat oder kein brauchbares Feedback liefert, geht dieselbe Anfrage danach an „" + GROQ_RECIPIENT + "“. " +
    "Bei Cloudflare ist die KI-Verarbeitung auch außerhalb der EU möglich. Die übrigen Dienste mit Sitz in den USA verarbeiten deine Texte außerhalb der EU.\n");
  const QUOTA_FALLBACK = "Das KI-Feedback ist gerade nicht möglich (" + QUOTA_REASON + "). Du kannst es morgen noch einmal versuchen oder ohne KI-Feedback abgeben – deine Lehrkraft sieht dann, dass das KI-Feedback nicht möglich war.";
  await expect(page.locator("#fb-status")).toHaveText("Das KI-Kontingent für heute ist aufgebraucht. Du kannst ohne KI-Feedback abgeben oder es morgen noch einmal versuchen.");
  await expect(page.locator("#fb-fallback")).toHaveText(QUOTA_FALLBACK);
  await expect(page.locator("#ed-steps-list li").nth(1)).toHaveText(STEP_FB_BLOCKED);
  await expect(page.locator("#ed-steps-list li.cur")).toHaveText(STEPS_AI[0]);
  await expect(page.locator("#fb-wait")).toBeHidden();   // kein automatischer neuer Versuch
  await page.waitForTimeout(500);
  expect((await s.calls((r) => r.path === "/api/feedback")).length).toBe(1);
  // Zwischenstand von gestern (das Kontingent wird um 0:00 UTC erneuert): kein „morgen“ mehr und kein Grund für die Lehrkraft –
  // der Fehlversuch bleibt
  const today = new Date().toISOString().slice(0, 10), yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const dKey = await page.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith("feibeitsblatt:draft:")));
  const d0 = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), dKey));
  expect(d0).toMatchObject({ fbUnavailable: QUOTA_REASON, fbUnavailableDay: today, fbFails: 1 });
  // erst nach dem Speichern beim Verlassen der Seite (beforeunload der Seite läuft vorher) den Tag zurückdatieren
  await page.evaluate(([k, day]) => window.addEventListener("beforeunload", () => {
    const d = JSON.parse(localStorage.getItem(k)); d.fbUnavailableDay = day; localStorage.setItem(k, JSON.stringify(d));
  }), [dKey, yesterday]);
  await page.reload();
  await page.click("#resume-btn");
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
  await expect(page.locator("#fb-fallback")).toBeHidden();
  await expect(page.locator("#fb-btn")).toBeEnabled();
  await expect(page.locator("#ed-steps-list li")).toHaveText(STEPS_AI);   // Kontingent erneuert: wieder „(freiwillig, empfohlen)“
  expect(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), dKey))).toMatchObject({ fbUnavailable: "", fbUnavailableDay: "", fbFails: 1 });
  await page.click("#submit-btn");
  expect(await confirmDialog(page, "Ohne KI-Feedback abgeben?", false)).toBe(noFbDialog("Anfrage nicht abgeschlossen"));
  // heute noch einmal versucht: wieder aufgebraucht – jetzt gilt der Grund wieder
  await page.click("#fb-btn");
  await confirmDialog(page, "KI-Feedback anfordern?");
  await expect(page.locator("#fb-fallback")).toHaveText(QUOTA_FALLBACK);
  await page.click("#submit-btn");
  expect(await confirmDialog(page, "Ohne KI-Feedback abgeben?")).toBe("Das KI-Feedback hat bisher nicht geklappt (" + QUOTA_REASON + "). Du kannst es morgen noch einmal versuchen oder jetzt ohne KI-Feedback abgeben – ohne dass dir daraus ein Nachteil entsteht.\nNach der Abgabe kannst du deine Antworten nicht mehr ändern. Bei der Abgabe geht nichts an die KI. Deine Antworten gehen verschlüsselt an deine Lehrkraft; sie sieht, dass das KI-Feedback nicht möglich war.");
  await expect(page.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await expect(page.locator("#done-fb")).toBeHidden();
  await closePage(s);

  // R: bekommt das erste Feedback, überarbeitet und gibt ab – die zweite Rückmeldung trifft auf das aufgebrauchte Kontingent
  const R = { input: { vorname: "rosa", nachname: "ro", geb: "--12-12", klasse: "8a" }, first: ["Eine innere Stimme.", "Ich habe geschummelt."] };
  const s2 = await openPage(browser);
  const p2 = s2.page;
  await enterCode(p2, shownQ);
  await fillPerson(p2, R.input);
  for (let i = 0; i < 2; i++) await typeAt(p2, "#a-" + (i + 1), R.first[i]);
  await requestFeedback(p2);
  await typeAt(p2, "#a-2", " Das war unfair.");
  await p2.route("**/api/feedback", quota);
  await submit(p2);
  await expect(p2.locator("#done-fb-status")).toHaveText("Das KI-Kontingent für heute ist aufgebraucht – eine Rückmeldung zu deiner abgegebenen Fassung gibt es diesmal nicht. Deine Abgabe ist davon nicht betroffen.", { timeout: 30_000 });
  await expect(p2.locator("#done-fb-retry")).toBeHidden();
  await p2.waitForTimeout(500);
  expect((await s2.calls((r) => r.path === "/api/feedback")).map((r) => r.status)).toEqual([200, 503]);
  expect((await s2.calls((r) => r.path === "/api/submit")).length).toBe(2);   // Erstversuch + Abgabe – keine zweite Rückmeldung, nichts nachgereicht
  await closePage(s2);

  // Lehrkraft: Q mit Grund, R wie gewohnt; danach aufräumen
  await tp.click("#b-res-back");
  await expect(tp.locator("#t-sel-code")).toHaveText(shownQ);
  await expect(tp.locator("#t-subs-body tr.main")).toHaveCount(2);
  await tp.click("#t-expand-all");
  const notes = tp.locator("#t-subs-body tr.details .moodle-hint");
  await expect(notes).toHaveCount(1);
  await expect(notes).toHaveText("Ohne KI-Feedback abgegeben – das KI-Feedback war nicht möglich (" + QUOTA_REASON + ").");
  // R: geändert, aber keine zweite Rückmeldung – die Lösungs-PDF aus der Übersicht sagt das
  const detR = tp.locator("#t-subs-body tr.details").nth(1);
  await expect(detR.locator(".dfb2")).toHaveCount(0);
  const [rdl] = await Promise.all([tp.waitForEvent("download"), detR.locator("button.dpdf").click()]);
  const rText = pdfShownText(await readFile(await rdl.path()));
  expect(rText).toContain("Eine KI-Rückmeldung zur abgegebenen Fassung wurde nicht an die Lehrkraft übermittelt.");
  expect(rText).toContain("KI-Feedback zur ersten Fassung:");
  await tp.click("#t-del-sheet");
  await confirmDialog(tp, "Feibeitsblatt löschen?");
  await expect(tp.locator("#t-list-status")).toHaveText("Feibeitsblatt gelöscht.");
  await closePage(t);
});

test("7f Freiwilliges KI-Feedback: G gibt ohne KI ab (nichts an die KI, kein Erstversuch), H/P entscheiden um, während die KI arbeitet, I nach einem Fehlversuch, J/N brechen eine laufende bzw. wartende Anfrage ab (Abgabe scheitert erst), M scheitert hinter dem Dialog, K ohne eingerichtete KI, L schließt den Tab während der Anfrage, O ältere Abgabe ohne Vermerk; Blatt ohne Auftrag an die KI hat keinen Feedback-Button; Lehrkraft sieht neutrale Hinweise", async ({ browser, request }) => {
  const t = await openPage(browser);
  const tp = t.page;
  await teacherLogin(tp, PW);
  const makeSheet = async (title, rows) => {
    await tp.click("#t-new");
    await tp.fill("#b-title", title);
    for (let i = 0; i < rows.length; i++) {
      await tp.fill("#bq-" + (i + 1), rows[i].text);
      if (rows[i].solution) await tp.fill("#bs-" + (i + 1), rows[i].solution);
    }
    await tp.click("#b-gen");
    await expect(tp.locator("#b-result")).toBeVisible();
    return (await tp.locator("#b-res-code").textContent()).trim();
  };
  const shownG = await makeSheet("Freiwillig", TASKS.slice(0, 2));
  const student = async (who) => {
    const s = await openPage(browser);
    await enterCode(s.page, shownG);
    await fillPerson(s.page, who.input);
    return s;
  };
  const draftPdfText = async (page) => {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#ed-pdf")]);
    return pdfShownText(await readFile(await dl.path()));
  };
  const solutionsPdfText = async (page) => {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#done-pdf")]);
    return pdfShownText(await readFile(await dl.path()));
  };
  const toTeacherUnavailable = " Deine Antworten gehen verschlüsselt an deine Lehrkraft; sie sieht, dass das KI-Feedback nicht möglich war.";
  const draftOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("feibeitsblatt:draft:")))));
  const NOT_DONE_NOTE = "Ohne KI-Feedback abgegeben – das KI-Feedback war nicht möglich (Anfrage nicht abgeschlossen).";
  const busyDialogStart = "Deine Anfrage um KI-Feedback läuft noch. Gibst du jetzt ab, wird sie abgebrochen. Was schon gesendet wurde, hat der KI-Dienst bereits erhalten.";

  // G: Abschluss-Text, Hinweis und Datenschutz nennen die Freiwilligkeit; „Abgeben“ geht sofort – aber nicht mit lauter leeren Feldern
  const G = { input: { vorname: "jan", nachname: "gr", geb: "--03-03", klasse: "7b" }, first: ["Das Gewissen ist eine innere Stimme.", ""] };
  const s = await student(G);
  const { page } = s;
  await expect(page.locator("#fin-text")).toHaveText(FIN_TEXT);
  await expect(page.locator("#privacy")).toContainText("Das KI-Feedback ist freiwillig: Nur wenn du auf „KI um ein Feedback bitten“ klickst und das bestätigst, gehen deine Antworten an eine KI; du kannst auch ohne KI-Feedback abgeben, ohne dass dir daraus ein Nachteil entsteht.");
  await expect(page.locator("#privacy")).toContainText("Gibst du ohne KI-Feedback ab, wird nur deine Abgabe gespeichert (ebenso verschlüsselt, mit dem Vermerk „ohne KI-Feedback“ und – falls das KI-Feedback nicht möglich war – dem Grund).");
  await expect(page.locator("#submit-btn")).toBeEnabled();
  await expect(page.locator("#submit-btn")).toHaveAccessibleDescription(SUBMIT_HINT_NO_FB);
  await page.click("#submit-btn");
  await expect(page.locator("#submit-status")).toHaveText("Bitte beantworte zuerst die Aufgaben – alle Felder sind noch leer.");
  await expect(page.locator("#dlg.open")).toHaveCount(0);   // ganz leer: kein Dialog, nichts gesendet
  await typeAt(page, "#a-1", G.first[0]);
  expect(await draftPdfText(page)).toContain("Stand: 1 von 2 Aufgaben mit Text · KI-Feedback nicht angefordert");
  await mockReset();
  // Erst abbrechen: nichts passiert, der Fokus kehrt zu „Abgeben“ zurück
  await page.click("#submit-btn");
  await expect(page.locator("#dlg-cancel")).toBeFocused();   // die sichere Wahl hat den Fokus
  await expect(page.locator("#dlg-ok")).toHaveText("Ohne KI-Feedback abgeben");
  await expect(page.locator("#dlg-cancel")).toHaveText("Weiterschreiben");
  const dlg = await confirmDialog(page, "Ohne KI-Feedback abgeben?", false);
  expect(dlg).toBe("Achtung: Aufgabe 2 ist noch leer.\nDu hast kein KI-Feedback angefordert. Das ist in Ordnung: " + FB_VOLUNTARY + "\nNach der Abgabe kannst du deine Antworten nicht mehr ändern. An die KI wird nichts gesendet. Deine Antworten gehen verschlüsselt an deine Lehrkraft; sie sieht, dass du ohne KI-Feedback abgegeben hast.");
  await expect(page.locator("#submit-btn")).toBeFocused();
  // Umkehrbar bis zur Abgabe: der Feedback-Dialog nennt die Freiwilligkeit (hier abgebrochen)
  await page.click("#fb-btn");
  expect(await confirmDialog(page, "Noch nicht alles beantwortet", false)).toContain(FB_VOLUNTARY);   // Aufgabe 2 ist leer
  await page.click("#submit-btn");
  await confirmDialog(page, "Ohne KI-Feedback abgeben?");
  await expect(page.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await expect(page.locator("#done-fb")).toBeHidden();
  expect(await s.calls((r) => r.path === "/api/feedback")).toEqual([]);
  expect((await mockState()).count).toBe(0);
  const subs = await s.calls((r) => r.path === "/api/submit");
  expect(subs.map((r) => [r.status, JSON.parse(r.reqBody).stage])).toEqual([[200, "final"]]);   // kein Erstversuch
  const solG = await solutionsPdfText(page);
  expect(solG).toContain("Ohne KI-Feedback abgegeben.");
  expect(solG).not.toMatch(/nicht möglich|KI-Feedback zur|KI-Rückmeldung zur|Gelingt schon|Tipp:/);
  await closePage(s);

  // H: fordert Feedback an, will während der Anfrage doch ohne KI abgeben – die Antwort kommt, solange der Dialog offen ist
  const H = { input: { vorname: "eva", nachname: "ha", geb: "--04-04", klasse: "7b" }, first: ["Das Gewissen ist eine innere Instanz.", "Ich habe gelogen."] };
  const s2 = await student(H);
  const p2 = s2.page;
  for (let i = 0; i < 2; i++) await typeAt(p2, "#a-" + (i + 1), H.first[i]);
  let release;
  const gate = new Promise((r) => { release = r; });
  await p2.route("**/api/feedback", async (route) => { await gate; await route.continue(); });
  await p2.click("#fb-btn");
  await confirmDialog(p2, "KI-Feedback anfordern?");
  await expect(p2.locator("#fb-status")).toContainText("Die KI arbeitet");
  await p2.click("#submit-btn");
  await expect(p2.locator("#dlg.open")).toBeVisible();
  await expect(p2.locator("#dlg-cancel")).toHaveText("Auf das KI-Feedback warten");
  release();
  await expect(p2.locator("#t-1 .fbbox")).toBeVisible({ timeout: 60_000 });   // hinter dem Dialog angekommen …
  await p2.waitForTimeout(200);
  await expect(p2.locator("#dlg-cancel")).toBeFocused();                       // … ohne den Fokus aus dem Dialog zu holen
  expect(await confirmDialog(p2, "Ohne KI-Feedback abgeben?")).toBe(busyDialogStart + "\nNach der Abgabe kannst du deine Antworten nicht mehr ändern. Bei der Abgabe geht nichts mehr an die KI." + toTeacherUnavailable);
  await expect(p2.locator("#submit-status")).toHaveText("Gerade ist dein KI-Feedback angekommen – es steht jetzt unter deinen Antworten. Abgegeben wurde noch nichts: Lies es dir durch, überarbeite, wenn du möchtest, und klicke dann erneut auf „Abgeben“.");
  await expect(p2.locator("#revise-hint")).toBeFocused();   // der beim Eintreffen unterdrückte Fokuswechsel wird nachgeholt
  await expect(p2.locator("#screen-editor")).toHaveClass(/active/);
  await p2.unroute("**/api/feedback");
  await expect.poll(async () => (await s2.calls((r) => r.path === "/api/submit")).map((r) => JSON.parse(r.reqBody).stage), { timeout: 30_000 }).toEqual(["first"]);
  await submit(p2);   // jetzt normal mit KI-Feedback („Jetzt abgeben?“)
  await expect(p2.locator("#done-fb")).toBeVisible();
  await closePage(s2);

  // I: ein gescheiterter Versuch → die Abgabe ohne Feedback gilt nicht als „ohne Anfrage“; Zwischenstand-PDF und Dialog sagen es
  const I = { input: { vorname: "ina", nachname: "ib", geb: "--06-06", klasse: "7b" }, first: ["Eine innere Stimme.", "Ich habe geschwindelt."] };
  const s4 = await student(I);
  const p4 = s4.page;
  for (let i = 0; i < 2; i++) await typeAt(p4, "#a-" + (i + 1), I.first[i]);
  await p4.route("**/api/feedback", (route) => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Die KI-Rückmeldung ist gerade nicht verfügbar. Bitte versuche es später noch einmal oder frag deine Lehrkraft.", code: "ai_error" }) }));
  await p4.click("#fb-btn");
  await confirmDialog(p4, "KI-Feedback anfordern?");
  await expect(p4.locator("#fb-status")).toHaveClass(/\bbad\b/);
  await expect(p4.locator("#fb-fallback")).toBeHidden();   // erst nach dem zweiten Fehlversuch
  await expect(p4.locator("#submit-hint")).toHaveText(SUBMIT_HINT_NO_FB);
  expect(await draftPdfText(p4)).toContain("Stand: 2 von 2 Aufgaben mit Text · KI-Feedback bisher nicht geklappt (Anfrage nicht abgeschlossen)");
  await p4.click("#submit-btn");
  expect(await confirmDialog(p4, "Ohne KI-Feedback abgeben?")).toBe(noFbDialog("Anfrage nicht abgeschlossen"));
  await expect(p4.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  expect(await solutionsPdfText(p4)).toContain("Ohne KI-Feedback abgegeben – das KI-Feedback war nicht möglich (Anfrage nicht abgeschlossen).");
  expect((await s4.calls((r) => r.path === "/api/submit")).map((r) => JSON.parse(r.reqBody).stage)).toEqual(["final"]);
  await closePage(s4);

  // J: die Abgabe bricht eine laufende Anfrage ab und scheitert dann selbst → Felder und Feedback-Button sind wieder frei;
  // die abgebrochene Anfrage (fetch abgebrochen) liefert kein Feedback und keinen Erstversuch; der zweite Anlauf klappt
  const J = { input: { vorname: "jon", nachname: "jo", geb: "--07-07", klasse: "7b" }, first: ["Das Gewissen urteilt.", "Ich habe etwas versteckt."] };
  const s5 = await student(J);
  const p5 = s5.page;
  for (let i = 0; i < 2; i++) await typeAt(p5, "#a-" + (i + 1), J.first[i]);
  let releaseJ;
  const gateJ = new Promise((r) => { releaseJ = r; });
  await p5.route("**/api/feedback", async (route) => {
    await gateJ;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, results: [{ covered: ["Zu spät"], missing: [] }, { covered: ["Zu spät"], missing: [] }] }) }).catch(() => {});
  });
  let submitsJ = 0;
  await p5.route("**/api/submit", (route) => (++submitsJ === 1
    ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Auf dem Server ist ein Fehler aufgetreten.", code: "server_error" }) })
    : route.continue()));
  await mockReset();
  await p5.click("#fb-btn");
  await confirmDialog(p5, "KI-Feedback anfordern?");
  await expect(p5.locator("#fb-status")).toContainText("Die KI arbeitet");
  expect(await p5.$eval("#a-1", (e) => e.readOnly)).toBe(true);
  await p5.click("#submit-btn");
  expect(await confirmDialog(p5, "Ohne KI-Feedback abgeben?")).toContain("Was schon gesendet wurde, hat der KI-Dienst bereits erhalten.");
  await expect(p5.locator("#submit-status")).toContainText("Deine Antworten sind noch da – versuche es gleich noch einmal.");
  await expect(p5.locator("#screen-editor")).toHaveClass(/active/);
  expect(await p5.$eval("#a-1", (e) => e.readOnly)).toBe(false);   // wieder schreibbar …
  await expect(p5.locator("#fb-btn")).toBeEnabled();                // … Feedback wieder möglich …
  await expect(p5.locator("#fb-status")).toHaveText("");            // … und kein „Die KI arbeitet …“ mehr
  await expect(p5.locator("#submit-btn")).toBeEnabled();
  await expect(p5.locator("#ed-steps-list li")).toHaveText(STEPS_AI);   // der Kasten steht wieder auf „Aufgaben bearbeiten“
  await expect(p5.locator("#ed-steps-list li.cur")).toHaveText(STEPS_AI[0]);
  await expect(p5.locator("#ed-steps-list li[aria-current]")).toHaveCount(1);
  await typeAt(p5, "#a-2", " Nachtrag.");
  releaseJ();
  await p5.waitForTimeout(500);
  await expect(p5.locator("#t-1 .fbbox")).toBeHidden();
  expect(JSON.parse(await p5.evaluate(() => localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("feibeitsblatt:draft:")))))).toMatchObject({ fbFails: 1, feedback: null });
  await p5.click("#submit-btn");
  expect(await confirmDialog(p5, "Ohne KI-Feedback abgeben?")).toBe(noFbDialog("Anfrage nicht abgeschlossen"));
  await expect(p5.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await p5.waitForTimeout(300);
  const subsJ = await s5.calls((r) => r.path === "/api/submit");
  expect(subsJ.map((r) => [r.status, JSON.parse(r.reqBody).stage])).toEqual([[500, "final"], [200, "final"]]);   // kein Erstversuch
  expect(new Set(subsJ.map((r) => JSON.parse(r.reqBody).attempt)).size).toBe(1);   // dieselbe Bearbeitung
  expect((await mockState()).count).toBe(0);   // die angehaltene Anfrage hat die KI nie erreicht
  await closePage(s5);

  // K: Blatt mit Auftrag an die KI, aber keine KI eingerichtet (Antwort ohne Empfänger nachgestellt: beim Laden und beim ersten
  // Nachsehen, danach „eingerichtet“) → Hinweis und Dialog nennen keinen KI-Dienst; der Feedback-Button sieht nach (nur GET), sendet nichts
  const K = { input: { vorname: "kai", nachname: "ka", geb: "--08-08", klasse: "7b" }, first: ["Mein Gewissen.", "Beim Spielen geschummelt."] };
  const s6 = await openPage(browser);
  const p6 = s6.page;
  let sheetGets = 0;
  await p6.route("**/api/sheet/" + shownG.replace("-", ""), async (route) => {
    const res = await route.fetch();
    const j = await res.json();
    if (++sheetGets <= 2) { delete j.sheet.aiRecipients; delete j.sheet.aiReserve; j.sheet.aiProvider = null; }
    await route.fulfill({ response: res, json: j });
  });
  await enterCode(p6, shownG);
  await fillPerson(p6, K.input);
  const NO_AI_SET = "Ein KI-Dienst ist für dieses Feibeitsblatt gerade nicht eingerichtet – deine Antworten gehen an keine KI.";
  await expect(p6.locator("#privacy")).toContainText(NO_AI_SET + " Richtet deine Lehrkraft einen ein, nennt dir diese Seite ihn, bevor etwas gesendet wird.");
  await expect(p6.locator("#privacy")).not.toContainText("KI-Dienst deiner Lehrkraft");
  await expect(p6.locator("#privfull-ed")).toContainText(NO_AI_SET);   // derselbe Inhalt wie im ausführlichen Hinweis
  await expect(p6.locator("#ed-steps-list li").nth(1)).toHaveText(STEP_FB_BLOCKED);   // schon vor dem ersten Klick erkennbar
  await expect(p6.locator("#ed-steps-list li.cur")).toHaveText(STEPS_AI[0]);
  for (let i = 0; i < 2; i++) await typeAt(p6, "#a-" + (i + 1), K.first[i]);
  await p6.click("#submit-btn");
  expect(await confirmDialog(p6, "Ohne KI-Feedback abgeben?", false)).toBe("Das KI-Feedback ist gerade nicht möglich (KI nicht eingerichtet). Du kannst es später versuchen oder jetzt ohne KI-Feedback abgeben – ohne dass dir daraus ein Nachteil entsteht.\nNach der Abgabe kannst du deine Antworten nicht mehr ändern. Bei der Abgabe geht nichts an die KI." + toTeacherUnavailable);
  await p6.focus("#fb-btn");
  await p6.keyboard.press("Enter");   // per Tastatur: während des Nachsehens ist der Button gesperrt – danach hat er den Fokus wieder
  await expect(p6.locator("#fb-status")).toHaveText("Deine Lehrkraft hat das KI-Feedback noch nicht eingerichtet – du kannst ohne KI-Feedback abgeben.");
  await expect(p6.locator("#fb-btn")).toBeFocused();
  await expect(p6.locator("#dlg.open")).toHaveCount(0);   // kein Dialog
  await expect(p6.locator("#fb-fallback")).toHaveText("Das KI-Feedback ist gerade nicht möglich (KI nicht eingerichtet). Du kannst es später noch einmal versuchen oder ohne KI-Feedback abgeben – deine Lehrkraft sieht dann, dass das KI-Feedback nicht möglich war.");
  expect(sheetGets).toBe(2);
  expect((await draftOf(p6)).fbUnavailable).toBe("KI nicht eingerichtet");
  // inzwischen eingerichtet: der nächste Klick lädt die Empfänger neu und zeigt den normalen Dialog mit dem echten Empfänger;
  // „Weiterschreiben“ gibt den Fokus an den Button zurück (nicht an body, obwohl er während des Nachsehens gesperrt war)
  await p6.focus("#fb-btn");
  await p6.keyboard.press("Enter");
  expect(await confirmDialog(p6, "KI-Feedback anfordern?", false)).toContain("an den KI-Dienst „127.0.0.1:");
  await expect(p6.locator("#fb-btn")).toBeFocused();
  expect(sheetGets).toBe(3);
  await expect(p6.locator("#fb-fallback")).toBeHidden();   // „KI nicht eingerichtet“ gilt nicht mehr …
  await expect(p6.locator("#ed-steps-list li")).toHaveText(STEPS_AI);
  await expect(p6.locator("#submit-hint")).toHaveText(SUBMIT_HINT_NO_FB);
  await expect(p6.locator("#privacy")).toContainText("an den KI-Dienst „127.0.0.1:");
  expect(await s6.calls((r) => r.path === "/api/feedback")).toEqual([]);   // nichts gesendet
  await p6.click("#submit-btn");   // … die Abgabe trägt aber den Grund des gescheiterten Versuchs
  expect(await confirmDialog(p6, "Ohne KI-Feedback abgeben?")).toBe(noFbDialog("KI nicht eingerichtet"));
  await expect(p6.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await closePage(s6);

  // M: die laufende Anfrage scheitert, während der Abgabe-Dialog offen ist → der Fokus bleibt im Dialog; eingestuft wird
  // erst nach dem Dialog (wasBusy): „nicht möglich (Anfrage nicht abgeschlossen)“
  const M = { input: { vorname: "mia", nachname: "mo", geb: "--10-10", klasse: "7b" }, first: ["Das Gewissen mahnt.", "Ich war unfair."] };
  const s8 = await student(M);
  const p8 = s8.page;
  for (let i = 0; i < 2; i++) await typeAt(p8, "#a-" + (i + 1), M.first[i]);
  let releaseM;
  const gateM = new Promise((r) => { releaseM = r; });
  await p8.route("**/api/feedback", async (route) => {
    await gateM;
    await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Die KI-Rückmeldung ist gerade nicht verfügbar. Bitte versuche es später noch einmal oder frag deine Lehrkraft.", code: "ai_error" }) });
  });
  await p8.click("#fb-btn");
  await confirmDialog(p8, "KI-Feedback anfordern?");
  await expect(p8.locator("#fb-status")).toContainText("Die KI arbeitet");
  await p8.click("#submit-btn");
  await expect(p8.locator("#dlg-cancel")).toHaveText("Auf das KI-Feedback warten");
  await expect(p8.locator("#dlg-cancel")).toBeFocused();
  releaseM();
  await expect(p8.locator("#fb-status")).toHaveClass(/\bbad\b/);   // hinter dem Dialog gescheitert …
  await p8.waitForTimeout(200);
  await expect(p8.locator("#dlg-cancel")).toBeFocused();            // … der Fokus bleibt im Dialog
  expect(await confirmDialog(p8, "Ohne KI-Feedback abgeben?")).toContain(busyDialogStart);   // Text vom Öffnen des Dialogs
  await expect(p8.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  expect(await solutionsPdfText(p8)).toContain(NOT_DONE_NOTE);
  await closePage(s8);

  // N: die Abgabe bricht eine nach „ausgelastet“ wartende Anfrage ab (Countdown) und scheitert dann selbst → Countdown und
  // Wartehinweis sind weg, der Feedback-Button ist frei; der zweite Anlauf trägt „nicht möglich (Anfrage nicht abgeschlossen)“
  const N = { input: { vorname: "nik", nachname: "ne", geb: "--11-11", klasse: "7b" }, first: ["Eine innere Waage.", "Ich habe geflunkert."] };
  const s9 = await student(N);
  const p9 = s9.page;
  for (let i = 0; i < 2; i++) await typeAt(p9, "#a-" + (i + 1), N.first[i]);
  await p9.route("**/api/feedback", (route) => route.fulfill({ status: 429, contentType: "application/json", headers: { "Retry-After": "30" },
    body: JSON.stringify({ ok: false, error: "Die KI ist gerade ausgelastet.", code: "ai_busy", retryAfter: 30 }) }));
  let submitsN = 0;
  await p9.route("**/api/submit", (route) => (++submitsN === 1
    ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Auf dem Server ist ein Fehler aufgetreten.", code: "server_error" }) })
    : route.continue()));
  await p9.click("#fb-btn");
  await confirmDialog(p9, "KI-Feedback anfordern?");
  await expect(p9.locator("#fb-wait")).toBeVisible();
  await p9.click("#submit-btn");
  expect(await confirmDialog(p9, "Ohne KI-Feedback abgeben?")).toContain(busyDialogStart);
  await expect(p9.locator("#submit-status")).toContainText("Deine Antworten sind noch da – versuche es gleich noch einmal.");
  await expect(p9.locator("#fb-wait")).toBeHidden();
  await expect(p9.locator("#fb-status")).toHaveText("");
  await expect(p9.locator("#fb-btn")).toBeEnabled();
  expect(await p9.$eval("#a-1", (e) => e.readOnly)).toBe(false);
  expect(await draftOf(p9)).toMatchObject({ fbFails: 1, fbPending: false, feedback: null });
  await p9.click("#submit-btn");
  expect(await confirmDialog(p9, "Ohne KI-Feedback abgeben?")).toBe(noFbDialog("Anfrage nicht abgeschlossen"));
  await expect(p9.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  expect(await solutionsPdfText(p9)).toContain(NOT_DONE_NOTE);
  await closePage(s9);

  // P: wie H, aber „Auf das KI-Feedback warten“ → kein Hinweis unter „Abgeben“, der Fokus springt zum Überarbeiten-Hinweis
  const P = { input: { vorname: "pia", nachname: "pi", geb: "--12-12", klasse: "7b" }, first: ["Das Gewissen ist ein Kompass.", "Ich habe Kekse genascht."] };
  const s10 = await student(P);
  const p10 = s10.page;
  for (let i = 0; i < 2; i++) await typeAt(p10, "#a-" + (i + 1), P.first[i]);
  let releaseP;
  const gateP = new Promise((r) => { releaseP = r; });
  await p10.route("**/api/feedback", async (route) => { await gateP; await route.continue(); });
  await p10.click("#fb-btn");
  await confirmDialog(p10, "KI-Feedback anfordern?");
  await expect(p10.locator("#fb-status")).toContainText("Die KI arbeitet");
  await p10.click("#submit-btn");
  await expect(p10.locator("#dlg.open")).toBeVisible();
  releaseP();
  await expect(p10.locator("#t-1 .fbbox")).toBeVisible({ timeout: 60_000 });
  await p10.waitForTimeout(200);
  await expect(p10.locator("#dlg-cancel")).toBeFocused();
  await confirmDialog(p10, "Ohne KI-Feedback abgeben?", false);
  await expect(p10.locator("#revise-hint")).toBeFocused();
  await expect(p10.locator("#submit-status")).toHaveText("");
  await p10.unroute("**/api/feedback");
  await expect.poll(async () => (await s10.calls((r) => r.path === "/api/submit")).map((r) => JSON.parse(r.reqBody).stage), { timeout: 30_000 }).toEqual(["first"]);
  await submit(p10);
  await closePage(s10);

  // L: schließt den Tab, während die KI-Anfrage läuft (die KI hat die Antworten schon) → beim nächsten Öffnen zählt das als
  // Fehlversuch: „bisher nicht geklappt“, die Abgabe trägt „nicht möglich“ – nie „ohne Anfrage“
  const L = { input: { vorname: "lis", nachname: "lu", geb: "--09-09", klasse: "7b" }, first: ["Satz eins mit Inhalt.", "Satz zwei mit Inhalt."] };
  const s7 = await student(L);
  let p7 = s7.page;
  for (let i = 0; i < 2; i++) await typeAt(p7, "#a-" + (i + 1), L.first[i]);
  await mockReset();
  await fetch(MOCK_URL + "/__mock/mode", { method: "POST", body: JSON.stringify({ mode: "slow", delayMs: 6000 }) });
  await p7.click("#fb-btn");
  await confirmDialog(p7, "KI-Feedback anfordern?");
  await expect.poll(async () => (await mockState()).count, { timeout: 15_000 }).toBe(1);   // die KI hat die Antworten erhalten …
  expect(JSON.stringify((await mockState()).requests[0].messages)).toContain(L.first[0]);
  await mockMode("ok");   // gilt für spätere Anfragen; diese wartet weiter
  expect(await draftOf(p7)).toMatchObject({ fbPending: true, fbFails: 0, feedback: null });   // … vor dem Senden vermerkt
  expect(await draftPdfText(p7)).toContain("KI-Feedback angefordert, beim Sichern noch nicht erhalten");
  const keep = await s7.context.newPage();   // derselbe Browser (derselbe Speicher) bleibt offen
  keep.on("pageerror", (e) => s7.errors.push(String(e)));
  await keep.goto("/");
  await p7.close({ runBeforeUnload: false });   // Tab zu, ohne dass die Seite noch etwas tun kann
  p7 = s7.page = keep;
  await expect(p7.locator("#resume-box")).toBeVisible();
  expect(await draftOf(p7)).toMatchObject({ fbPending: true, fbFails: 0, feedback: null });   // die Seite konnte nichts mehr zählen
  await p7.click("#resume-btn");
  await expect(p7.locator("#screen-editor")).toHaveClass(/active/);
  await expect(p7.locator("#a-1")).toHaveValue(L.first[0]);
  expect(await draftOf(p7)).toMatchObject({ fbPending: false, fbFails: 1, feedback: null });   // einmal gezählt und gespeichert
  await p7.click("#submit-btn");
  expect(await confirmDialog(p7, "Ohne KI-Feedback abgeben?")).toBe(noFbDialog("Anfrage nicht abgeschlossen"));
  await expect(p7.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  expect(await solutionsPdfText(p7)).toContain(NOT_DONE_NOTE);
  await closePage(s7);

  // O: ältere Abgabe ohne noAi (früher nur möglich, wenn die KI nicht erreichbar war) → „nicht möglich (Grund)“
  const codeG = shownG.replace("-", "");
  const pubG = (await (await request.get("/api/sheet/" + codeG)).json()).sheet.publicKey;
  const old = { v: 1, stage: "final", sheetCode: codeG, sheetTitle: "Freiwillig", person: { vorname: "Ole", nachname: "Ol", geburtsdatum: "2010-01-01", klasse: "7b" },
    answers: [{ first: "Ein altes Gewissen.", final: "Ein altes Gewissen." }, { first: "Eine alte Lüge.", final: "Eine alte Lüge." }],
    feedback: null, feedbackAt: null, feedbackError: "KI nicht erreichbar", submittedAt: new Date().toISOString() };
  expect((await request.post("/api/submit", { data: { code: codeG, envelope: await makeEnvelope(pubG, old) } })).status()).toBe(200);

  // Lehrkraft: neutrale Hinweise – G „Ohne KI-Feedback abgegeben.“ (keine Wertung, kein „selbst gewählt“), I/J/K/L/M/N/O mit
  // Grund; H und P wie gewohnt
  await tp.click("#b-res-back");
  await expect(tp.locator("#t-sel-code")).toHaveText(shownG);
  await expect(tp.locator(".batchhint", { hasText: "Klicken Sie auf eine Zeile" })).toHaveText("Klicken Sie auf eine Zeile, um die Lösungen zu sehen: links die erste Eingabe vor dem KI-Feedback, rechts die überarbeitete Eingabe (ohne KI-Feedback: nur die abgegebene Fassung).");
  const mains = tp.locator("#t-subs-body tr.main");
  await expect(mains).toHaveCount(10);
  for (const [k, n] of ["Gr", "Ha", "Ib", "Jo", "Ka", "Lu", "Mo", "Ne", "Ol", "Pi"].entries()) await expect(mains.nth(k).locator("td:not(.arrowcol)").nth(0)).toHaveText(n);
  await tp.click("#t-expand-all");
  const det = (k) => tp.locator("#t-subs-body tr.details").nth(k);
  await expect(det(0).locator(".moodle-hint")).toHaveText("Ohne KI-Feedback abgegeben.");
  await expect(det(0).locator(".dmeta")).toHaveText(/ · ohne KI-Feedback · automatische Löschung ab dem \d\d\.\d\d\.\d{4}$/);
  await expect(det(0).locator(".dtask").nth(0).locator("table.cmp.one thead th")).toHaveText(["Abgegebene Fassung (ohne KI-Feedback)"]);
  await expect(det(0).locator(".dtask").nth(0).locator("table.cmp tbody td")).toHaveText([G.first[0]]);
  await expect(det(0).locator(".dtask").nth(1).locator("table.cmp tbody td")).toHaveText(["(leer)"]);
  await expect(det(0).locator(".dfb")).toHaveCount(0);
  await expect(det(1).locator(".moodle-hint")).toHaveCount(0);
  await expect(det(1).locator(".dtask").nth(0).locator("table.cmp thead th")).toHaveCount(2);
  await expect(det(1).locator(".dfb")).toHaveCount(2);
  for (const k of [2, 3, 5, 6, 7]) {
    await expect(det(k).locator(".moodle-hint")).toHaveText(NOT_DONE_NOTE);
    await expect(det(k).locator("table.cmp.one")).toHaveCount(2);
  }
  await expect(det(3).locator(".dtask").nth(1).locator("table.cmp tbody td")).toHaveText([J.first[1] + " Nachtrag."]);
  await expect(det(4).locator(".moodle-hint")).toHaveText("Ohne KI-Feedback abgegeben – das KI-Feedback war nicht möglich (KI nicht eingerichtet).");
  await expect(det(8).locator(".moodle-hint")).toHaveText("Ohne KI-Feedback abgegeben – das KI-Feedback war nicht möglich (KI nicht erreichbar).");   // ältere Abgabe ohne noAi
  await expect(det(8).locator(".dtask").nth(0).locator("table.cmp.one tbody td")).toHaveText([old.answers[0].final]);
  await expect(det(9).locator(".moodle-hint")).toHaveCount(0);
  await expect(det(9).locator(".dfb")).toHaveCount(2);
  await expect(tp.locator("#t-subs-body")).not.toContainText("selbst gewählt");

  // Blatt ohne Auftrag an die KI: kein Feedback-Button, Datenschutz ohne KI-Dienst, schlichter Abgabe-Dialog, keine Kennzeichnung
  const shownN = await makeSheet("Ohne Auftrag", [{ text: "Wie fühlst du dich, wenn du etwas falsch gemacht hast?", solution: "" }]);
  const s3 = await openPage(browser);
  const p3 = s3.page;
  await enterCode(p3, shownN);
  await fillPerson(p3, { vorname: "kim", nachname: "no", geb: "--05-05", klasse: "7b" });
  expect(JSON.parse((await s3.calls((r) => r.path.startsWith("/api/sheet/")))[0].body).sheet.aiFeedback).toBe(false);
  await expect(p3.locator("#fb-btn")).toBeHidden();
  await expect(p3.locator("#fin-text")).toHaveText("Zu diesem Feibeitsblatt gibt es kein KI-Feedback. Wenn du alle Aufgaben bearbeitet hast, gib ab.");
  await expect(p3.locator("#ed-steps-list li")).toHaveText(STEPS_NO_AI);   // Ablauf-Kasten: drei Schritte, ohne KI-Feedback
  await expect(p3.locator("#ed-steps-list li").nth(0)).toHaveAttribute("aria-current", "step");
  await expect(p3.locator("#ed-steps-list li[aria-current]")).toHaveCount(1);
  await expect(p3.locator("#privacy")).toContainText("Zu diesem Feibeitsblatt gibt es kein KI-Feedback – deine Antworten gehen an keine KI.");
  await expect(p3.locator("#privacy")).not.toContainText("KI-Dienst");
  // ausführlicher Hinweis und Klasse-Hinweis ohne KI: kein KI-Dienst, kein Abschnitt zur KI, Angaben erst bei der Abgabe
  await expect(p3.locator("#p-klasse-hint")).toHaveText("z. B. 8b oder E1. Deine Angaben gehen erst bei der Abgabe verschlüsselt an deine Lehrkraft. Bis dahin bleibt dein Zwischenstand nur auf diesem Gerät.");
  await expect(p3.locator("#privfull-ed h3.privh")).toHaveText(PRIV_HEADS.filter((x) => x !== "Entscheidet die KI über dich?"));
  await expect(p3.locator("#privfull-ed")).toContainText("Zu diesem Feibeitsblatt gibt es kein KI-Feedback – deine Antworten gehen an keine KI.");
  await expect(p3.locator("#privfull-ed")).not.toContainText("kurz unverschlüsselt");   // keine Verarbeitung für eine KI
  await expect(p3.locator("#privfull-ed")).toContainText("Dein Zwischenstand liegt bis zur Abgabe unverschlüsselt in diesem Browser");
  await expect(p3.locator("#privfull-ed")).toContainText("Deine Häkchen bleiben auf diesem Gerät und werden nicht gesendet.");   // auch ohne KI: die Checklisten-Seite
  await expect(p3.locator("#submit-hint")).toHaveText("Deine Antworten werden verschlüsselt; nur deine Lehrkraft kann sie lesen.");
  await typeAt(p3, "#a-1", "Ich schäme mich dann.");
  const draftN = await draftPdfText(p3);
  expect(draftN).toContain("Stand: 1 von 1 Aufgabe mit Text");
  expect(draftN).not.toContain("KI-Feedback");   // kein Hinweis zum KI-Feedback, das es hier nicht gibt
  await p3.click("#submit-btn");
  expect(await confirmDialog(p3, "Jetzt abgeben?")).toBe("Nach der Abgabe kannst du deine Antworten nicht mehr ändern. Deine Antworten gehen verschlüsselt an deine Lehrkraft; nur sie kann sie lesen.");
  await expect(p3.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  expect(await solutionsPdfText(p3)).not.toContain("Ohne KI-Feedback");
  expect(await s3.calls((r) => r.path === "/api/feedback")).toEqual([]);
  await closePage(s3);
  await tp.click("#b-res-back");
  await expect(tp.locator("#t-sel-code")).toHaveText(shownN);
  await tp.locator("#t-subs-body tr.main").first().click();
  const detN = tp.locator("#t-subs-body tr.details").first();
  await expect(detN.locator(".moodle-hint")).toHaveCount(0);
  await expect(detN.locator("table.cmp.one tbody td")).toHaveText(["Ich schäme mich dann."]);

  // aufräumen: beide Blätter samt Abgaben löschen
  for (const c of [shownN, shownG]) {
    await tp.locator("#t-sheets-body tr", { hasText: c }).click();
    await expect(tp.locator("#t-sel-code")).toHaveText(c);
    await tp.click("#t-del-sheet");
    await confirmDialog(tp, "Feibeitsblatt löschen?");
    await expect(tp.locator("#t-list-status")).toHaveText("Feibeitsblatt gelöscht.");
  }
  await closePage(t);
});

test("7g Übergang Geburtstag: Lehrkraft sieht auch bei älteren Abgaben und Erstversuchen mit vollem Geburtsdatum nur Tag und Monat; Erstversuch (altes Format) und Abgabe (neues Format) derselben Person gehören zusammen – die Details der Abgabe zeigen den ausgeblendeten Erstversuch, „Diesen Eintrag löschen“ löscht beide (auch sehr viele, in Blöcken), alle anderen bleiben; ein nicht lesbarer Eintrag lässt sich einzeln löschen", async ({ browser, request }) => {
  const t = await openPage(browser);
  const tp = t.page;
  await teacherLogin(tp, PW);
  await tp.click("#t-new");
  await tp.fill("#b-title", "Übergang");
  await tp.fill("#bq-1", "Beschreibe deinen Schulweg.");
  await tp.click("#b-gen");
  await expect(tp.locator("#b-result")).toBeVisible();
  const shown = (await tp.locator("#b-res-code").textContent()).trim(), code = shown.replace("-", "");
  const pub = (await (await request.get("/api/sheet/" + code)).json()).sheet.publicKey;
  const now = new Date().toISOString();
  const send = async (payload, meta = {}) => expect((await request.post("/api/submit", { data: { code, envelope: await makeEnvelope(pub, payload), ...meta } })).status()).toBe(200);
  const base = (vorname, nachname, geburtsdatum, text) => ({ v: 1, sheetCode: code, sheetTitle: "Übergang", person: { vorname, nachname, geburtsdatum, klasse: "9c" },
    answers: [{ first: text, final: text }], feedback: [{ covered: [], missing: [], note: NO_SOLUTION_NOTE }], feedbackAt: now, submittedAt: now });
  // Ole: ältere Abgabe mit vollem Geburtsdatum
  await send(base("Ole", "Ol", "2009-11-30", "Ich gehe zu Fuß."));
  // Kim: Erstversuch noch mit vollem Datum, Abgabe (andere Bearbeitung) nur mit Tag und Monat → derselbe Mensch
  const kimFirst = base("Kim", "Wo", "2010-02-03", "Ich fahre mit dem Rad.");
  await send({ ...kimFirst, stage: "first", answers: [{ first: kimFirst.answers[0].first, final: null }], submittedAt: null }, { stage: "first", attempt: "0123456789abcdef" });
  await send(base("Kim", "Wo", "--02-03", "Ich fahre jeden Tag mit dem Rad zur Schule."));
  // Ute: nur ein Erstversuch mit vollem Datum (noch nicht abgegeben) → bleibt sichtbar, ebenfalls ohne Jahr
  const uteFirst = base("Ute", "Un", "2011-06-15", "Mit dem Bus.");
  await send({ ...uteFirst, stage: "first", answers: [{ first: uteFirst.answers[0].first, final: null }], submittedAt: null }, { stage: "first", attempt: "fedcba9876543210" });

  await tp.click("#b-res-back");
  await expect(tp.locator("#t-sel-code")).toHaveText(shown);
  await expect(tp.locator("#t-subs-sum")).toHaveText("2 Abgaben · 1 Erstversuch ohne Überarbeitung · 1 älterer Erstversuch von Schüler:innen, die inzwischen abgegeben haben, wird nicht angezeigt");
  const mains = tp.locator("#t-subs-body tr.main");
  await expect(mains).toHaveCount(3);
  await expect(mains.nth(0).locator("td:not(.arrowcol)")).toHaveText(["Ol", "Ole", "30.11.", "9c"]);
  await expect(mains.nth(1).locator("td:not(.arrowcol)")).toHaveText(["Un", "Ute", "15.06.", "9c"]);
  await expect(mains.nth(1).locator("td.st-first")).toHaveCount(2);
  await expect(mains.nth(2).locator("td:not(.arrowcol)")).toHaveText(["Wo", "Kim", "03.02.", "9c"]);

  // Auskunft: die Details von Kims Abgabe zeigen den in der Liste ausgeblendeten älteren Erstversuch auf Wunsch (erst beim
  // Aufklappen gebaut, ohne eigenen Löschknopf)
  await mains.nth(2).click();
  const detKim = tp.locator("#t-subs-body tr.details:visible");
  await expect(detKim).toHaveCount(1);
  const olderKim = detKim.locator("details.dolder");
  await expect(olderKim.locator("summary")).toHaveText("1 älterer Erstversuch dieser Person (in der Liste ausgeblendet)");
  await expect(olderKim.locator(".detbox")).toHaveCount(0);
  await olderKim.locator("summary").click();
  await expect(olderKim.locator(".detbox.older")).toHaveCount(1);
  await expect(olderKim.locator(".dmeta")).toHaveText(/^Älterer Erstversuch vom \d\d\.\d\d\.\d{4}, \d\d:\d\d \(ohne Überarbeitung\) · KI-Feedback am /);
  await expect(olderKim.locator("table.cmp tbody td")).toHaveText([kimFirst.answers[0].first, "(noch nicht überarbeitet)"]);
  await expect(olderKim.locator("button")).toHaveCount(0);
  // Tippzeiten: diese Stände wurden ohne Messung abgegeben – ein Satz statt Prozenten, keine Färbung
  await expect(detKim.locator(".detbox:not(.older) > .dtt-sum")).toHaveText("Tippzeiten: ohne Messung (älterer Stand).");
  await expect(olderKim.locator(".detbox.older > .dtt-sum")).toHaveText("Tippzeiten: ohne Messung (älterer Stand).");
  await expect(detKim.locator(".dtt")).toHaveCount(0);
  await expect(tp.locator("#t-subs-body .tt-r, #t-subs-body .tt-y, #t-subs-body .tt-g")).toHaveCount(0);
  await expect(detKim.getByRole("button", { name: "Diesen Eintrag löschen" })).toHaveCount(1);
  // Löschwunsch einer Person: „Diesen Eintrag löschen“ löscht Kims Abgabe samt dem ausgeblendeten Erstversuch, alle anderen bleiben
  await detKim.getByRole("button", { name: "Diesen Eintrag löschen" }).click();
  await expect(tp.locator("#dlg-ok")).toHaveText("Eintrag löschen");
  expect(await confirmDialog(tp, "Diesen Eintrag löschen?", false)).toMatch(/^Die Abgabe von Wo · Kim \(Geburtstag 03\.02\., Klasse 9c\) vom \d\d\.\d\d\.\d{4}, \d\d:\d\d wird endgültig aus der Datenbank gelöscht – mitsamt einem älteren, ausgeblendeten Erstversuch derselben Person\. Alle anderen Einträge bleiben\. Das lässt sich nicht rückgängig machen\.$/);
  expect(await d1Query(`SELECT COUNT(*) AS n FROM submissions WHERE sheet_code='${code}'`)).toEqual([{ n: 4 }]);   // Abbrechen ändert nichts

  // Viele ausgeblendete Erstversuche mit Kims Angaben (z. B. über das öffentliche /api/submit angelegt) – mehr, als der Server je
  // Löschauftrag annimmt (50) – und ein Eintrag, der sich nicht entschlüsseln lässt
  await d1Query(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 54) INSERT INTO submissions (sheet_code, received_at, envelope, stage, attempt) SELECT s.sheet_code, s.received_at + n.i, s.envelope, 'first', printf('%016x', n.i) FROM submissions s, n WHERE s.sheet_code='${code}' AND s.attempt='0123456789abcdef'`);
  await d1Query(`INSERT INTO submissions (sheet_code, received_at, envelope, stage) VALUES ('${code}', ${Date.now()}, '{"v":1,"ek":"AAAA","iv":"AAAAAAAAAAAAAAAA","ct":"AAAA"}', 'final')`);
  await tp.click("#t-refresh");
  await expect(tp.locator("#t-subs-sum")).toHaveText("3 Abgaben · 1 Erstversuch ohne Überarbeitung · 55 ältere Erstversuche von Schüler:innen, die inzwischen abgegeben haben, werden nicht angezeigt");
  const errRow = tp.locator("#t-subs-body tr.errrow");
  await expect(errRow).toHaveCount(1);
  await expect(errRow).toContainText("konnte nicht entschlüsselt werden");
  await errRow.getByRole("button", { name: "Eintrag löschen" }).click();
  expect(await confirmDialog(tp, "Diesen Eintrag löschen?")).toMatch(/^Die Abgabe vom \d\d\.\d\d\.\d{4}, \d\d:\d\d, die sich nicht entschlüsseln lässt, wird endgültig aus der Datenbank gelöscht\. Alle anderen Einträge bleiben\. Das lässt sich nicht rückgängig machen\.$/);
  await expect(tp.locator("#t-subs-status")).toHaveText("1 Eintrag gelöscht.");
  await expect(errRow).toHaveCount(0);
  await expect(mains).toHaveCount(3);
  await mains.nth(2).click();
  await expect(detKim.locator("details.dolder summary")).toHaveText("55 ältere Erstversuche dieser Person (in der Liste ausgeblendet)");
  await detKim.getByRole("button", { name: "Diesen Eintrag löschen" }).click();
  expect(await confirmDialog(tp, "Diesen Eintrag löschen?")).toContain(" – mitsamt 55 älteren, ausgeblendeten Erstversuchen derselben Person. ");
  await expect(tp.locator("#t-subs-status")).toHaveText("56 Einträge gelöscht.");
  await expect(tp.locator("#t-subs-sum")).toHaveText("1 Abgabe · 1 Erstversuch ohne Überarbeitung");
  await expect(mains).toHaveCount(2);
  await expect(mains.nth(0).locator("td:not(.arrowcol)")).toHaveText(["Ol", "Ole", "30.11.", "9c"]);
  await expect(mains.nth(1).locator("td:not(.arrowcol)")).toHaveText(["Un", "Ute", "15.06.", "9c"]);
  const delCalls = (await t.calls((r) => r.method === "DELETE" && r.path.endsWith("/submissions"))).map((r) => [r.status, JSON.parse(r.reqBody).ids]);
  expect(delCalls.map(([st, ids]) => [st, ids.length])).toEqual([[200, 1], [200, 50], [200, 6]]);   // der nicht lesbare, dann Kim in zwei Blöcken
  const delIds = delCalls.flatMap(([, ids]) => ids);
  const left = (await d1Query(`SELECT id, stage FROM submissions WHERE sheet_code='${code}' ORDER BY id`));
  expect(left.map((r) => r.stage)).toEqual(["final", "first"]);   // Ole (Abgabe) und Ute (Erstversuch)
  expect(left.some((r) => delIds.includes(r.id))).toBe(false);
  await expect(tp.locator("#t-sheets-body tr", { hasText: "Übergang" }).locator("td").nth(4)).toHaveText(/^1 \+1/);   // Zähler neu geladen

  // aufräumen
  await tp.click("#t-del-sheet");
  await confirmDialog(tp, "Feibeitsblatt löschen?");
  await expect(tp.locator("#t-list-status")).toHaveText("Feibeitsblatt gelöscht.");
  await closePage(t);
});

/* ---------- Antwortarten: Tabelle und Weltkarten-Zuordnung ---------- */
const FIXTURE = new URL("../fixtures/02_Feibeitsblatt_Ein-Auto-eine-Welt.pdf", import.meta.url);
// Punkt im Inneren eines Landes (das Land muss dort auch oben liegen) in Bildschirmkoordinaten
const countryPoint = (page, n, id) => page.evaluate(([n, id]) => {
  const p = document.querySelector(`#a-${n} .mapw-svg path[data-id="${id}"]`);
  const bb = p.getBBox(), m = p.getScreenCTM();
  for (const f of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) for (const g of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
    const pt = new DOMPoint(bb.x + bb.width * f, bb.y + bb.height * g);
    if (!p.isPointInFill(pt)) continue;
    const s = pt.matrixTransform(m);
    if (document.elementFromPoint(s.x, s.y) === p) return { x: s.x, y: s.y };
  }
  return null;
}, [n, id]);
async function clickCountry(page, n, id) {
  await page.locator(`#a-${n} .mapw-map`).scrollIntoViewIfNeeded();
  const pt = await countryPoint(page, n, id);
  expect(pt, "Land " + id + " sichtbar").not.toBeNull();
  await page.mouse.click(pt.x, pt.y);
}
// Datensatz einer gesicherten Feibeitsblatt-PDF lesen (tolerant: Länge direkt oder als Verweis, komprimiert oder roh)
function sheetRecordOf(pdf) {
  const s = pdf.toString("latin1"), j = s.search(/\/FbSheet\s+1\b/);
  expect(j).toBeGreaterThan(0);
  const st = s.indexOf("stream", j), from = st + (s.slice(st, st + 8).startsWith("stream\r\n") ? 8 : 7), to = s.indexOf("endstream", from);
  const raw = pdf.subarray(from, to).subarray(0, to - from), dict = s.slice(s.lastIndexOf(" obj", j), st);
  let body = raw;
  if (/FlateDecode/.test(dict)) { for (let cut = 0; cut <= 2; cut++) { try { body = inflateSync(raw.subarray(0, raw.length - cut)); break; } catch (e) { body = null; } } }
  return JSON.parse(body.toString("utf8"));
}

test("7c Antwortarten: Lehrkraft legt Weltkarten-Zuordnung (mit Kartenbild) und Tabelle an → Schüler:in ordnet zu, füllt die Tabelle, lädt neu und gibt ab → Lehrkraft sieht Tabelle und Zuordnungen", async ({ browser, request }) => {
  const t = await openPage(browser);
  const tp = t.page;
  await teacherLogin(tp, PW);
  await tp.click("#t-new");
  await tp.fill("#b-title", "Welthandel");
  await tp.fill("#bq-1", "Ordne die Produkte ihren Herkunftsländern zu.");
  await tp.fill("#bs-1", "wird nicht gespeichert");
  await tp.selectOption("#bt-1", "map");
  await expect(tp.locator("#bs-1")).toBeHidden();   // kein Auftrag an die KI bei der Weltkarte
  await expect(tp.locator("#b-rows > tr").nth(0).locator(".nosol")).toHaveText("Für die Weltkarten-Zuordnung gibt es keinen Auftrag an die KI: Die richtigen Länder stehen bei den Karten links, und diese Aufgabe geht nicht an die KI.");
  const r1 = tp.locator("#b-rows > tr").nth(0);
  const card = async (k, label, hint, countries) => {
    if (k > 0) await r1.locator(".bitem-add").click();
    const it = r1.locator(".bitem").nth(k);
    await it.locator(".bitem-label").fill(label);
    if (hint) await it.locator(".bitem-hint").fill(hint);
    for (const c of countries) { await it.locator(".bitem-country").fill(c); await it.locator(".bitem-country").press("Enter"); }
  };
  await card(0, "Kaffee", "Bohnen aus dem Hochland", ["Brasilien", "Vietnam"]);
  await r1.locator(".bitem").nth(0).locator(".bitem-file").setInputFiles({ name: "kaffee.png", mimeType: "image/png", buffer: makePng(60, 40, [120, 70, 20]) });
  await expect(r1.locator(".bitem").nth(0).locator(".bitem-pic img")).toHaveCount(1);
  await card(1, "Tee", "", ["Indien"]);
  await card(2, "Kakao", "", ["Elfenbeinküste"]);
  await card(3, "Auto", "Montage", ["Deutschland"]);
  await expect(r1.locator(".bchip")).toHaveText(["Brasilien✕", "Vietnam✕", "Indien✕", "Elfenbeinküste✕", "Deutschland✕"]);
  await r1.locator(".bitem").nth(3).locator(".bitem-country").fill("Atlantis");
  await r1.locator(".bitem").nth(3).locator(".bitem-cadd").click();
  await expect(r1.locator(".bitem-stat")).toHaveText("„Atlantis“ gibt es auf der Weltkarte nicht – bitte einen Namen aus der Vorschlagsliste wählen.");
  await tp.fill("#bq-2", "Trage zwei Produkte und ihr Herkunftsland ein.");
  await tp.fill("#bs-2", "- Weizen\n- Reis");
  await tp.selectOption("#bt-2", "table");
  await tp.fill("#bc-2", "Produkt; Land");
  await expect(tp.locator("#b-rows > tr").nth(1).locator(".bans-prev th")).toHaveText(["Produkt", "Land"]);
  await tp.fill("#br-2", "2");
  await tp.fill("#bq-3", "Warum handeln Länder miteinander?");
  await tp.fill("#bs-3", "- Spezialisierung");
  await tp.click("#b-gen");
  await expect(tp.locator("#b-result")).toBeVisible();
  await expect(tp.locator("#b-res-img")).toHaveText("Das Bild ist gespeichert.", { timeout: 30_000 });
  const shown = (await tp.locator("#b-res-code").textContent()).trim(), code = shown.replace("-", "");
  // Gespeichert: Antwortarten vollständig für die Lehrkraft; öffentlich nie die Länder, nur Prüfwerte
  const pub = await (await request.get("/api/sheet/" + code)).json();
  expect(pub.sheet.tasks.map((x) => x.answer.type)).toEqual(["map", "table", "text"]);
  expect(pub.sheet.tasks[1].answer).toEqual({ type: "table", columns: ["Produkt", "Land"], rows: 2 });
  expect(pub.sheet.tasks[0].answer.items.map((x) => [x.id, x.label, x.checks.length])).toEqual([["kaffee", "Kaffee", 2], ["tee", "Tee", 1], ["kakao", "Kakao", 1], ["auto", "Auto", 1]]);
  expect(pub.sheet.tasks[0].answer.items[0].checks).toContain(createHash("sha256").update(code + "|kaffee|076").digest("hex"));
  expect(pub.sheet.tasks[0].images.map((m) => m.mode)).toEqual(["card"]);
  expect(JSON.stringify(pub)).not.toMatch(/Brasilien|Vietnam|Indien|Elfenbein|Deutschland|countries|"076"|wird nicht gespeichert/);

  // Schüler:in
  const s = await openPage(browser);
  const { page } = s;
  await enterCode(page, shown);
  await fillPerson(page, { vorname: "jo", nachname: "ka", geb: "--10-10", klasse: "8c" });
  const cards = page.locator("#a-1 .mcard");
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(0).locator(".mcard-img img")).toHaveCount(1);
  await expect(cards.nth(0)).toContainText("Bohnen aus dem Hochland");
  await expect(page.locator("#mp-1")).toHaveText("0 von 4 Karten zugeordnet");
  await expect(page.locator("#t-1 .ltbtn, #t-2 .ltbtn")).toHaveCount(0);   // Rechtschreibprüfung nur für Textfelder
  // ohne gewählte Karte passiert nichts
  await clickCountry(page, 1, "076");
  await expect(page.locator("#a-1 path.done")).toHaveCount(0);
  // falsches Land: Karte und Land 3 s rot, die Wahl bleibt
  await cards.nth(0).click();
  await expect(cards.nth(0)).toHaveAttribute("aria-pressed", "true");
  await clickCountry(page, 1, "124");
  await expect(cards.nth(0)).toHaveClass(/wrong/);
  await expect(page.locator('#a-1 path[data-id="124"]')).toHaveClass(/wrong/);
  await expect(cards.nth(0).locator(".mcard-ans")).toHaveText("✗ Kanada passt nicht");
  await expect(cards.nth(0)).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(1500);
  await expect(cards.nth(0)).toHaveClass(/wrong/);   // noch rot …
  await expect(cards.nth(0)).not.toHaveClass(/wrong/, { timeout: 3000 });   // … nach 3 s nicht mehr
  await expect(page.locator('#a-1 path[data-id="124"]')).not.toHaveClass(/wrong/);
  await expect(cards.nth(0)).toHaveAttribute("aria-pressed", "true");
  // richtiges Land: gleiche Farbe für Karte, Land und Pfeil; Name unter der Karte; Karte erledigt
  await clickCountry(page, 1, "076");
  await expect(cards.nth(0)).toHaveClass(/done/);
  await expect(cards.nth(0).locator(".mcard-ans")).toHaveText("✓ Brasilien");
  await expect(cards.nth(0)).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#mp-1")).toHaveText("1 von 4 Karten zugeordnet");
  const colorOf = async (k, id) => page.evaluate(([k, id]) => {
    const c = document.querySelectorAll("#a-1 .mcard")[k], p = document.querySelector(`#a-1 path[data-id="${id}"]`), a = document.querySelector(`#a-1 .mapw-arrows g.arrow[data-item="${["kaffee", "tee", "kakao", "auto"][k]}"] .shaft`);
    const norm = (v) => { const d = document.createElement("i"); d.style.color = v; document.body.appendChild(d); const x = getComputedStyle(d).color; d.remove(); return x; };
    return { card: norm(getComputedStyle(c).getPropertyValue("--mc").trim()), land: getComputedStyle(p).fill, arrow: a ? norm(a.getAttribute("stroke")) : null };
  }, [k, id]);
  const c1 = await colorOf(0, "076");
  expect(c1.land).toBe(c1.card); expect(c1.arrow).toBe(c1.card);
  expect(c1.card).not.toBe("rgb(217, 48, 37)");
  await cards.nth(1).click();
  await clickCountry(page, 1, "356");
  await expect(cards.nth(1).locator(".mcard-ans")).toHaveText("✓ Indien");
  const c2 = await colorOf(1, "356");
  expect(c2.land).toBe(c2.card); expect(c2.arrow).toBe(c2.card); expect(c2.card).not.toBe(c1.card);
  await expect(page.locator("#a-1 .mapw-arrows g.arrow")).toHaveCount(2);
  // Zoomen: „+“ vergrößert, „−“ verkleinert; Mausrad zoomt um den Mauszeiger (Deutschland bleibt darunter); „Ansicht zurücksetzen“
  const scale = () => page.$eval("#a-1 .vp", (g) => Number(/scale\(([\d.]+)\)/.exec(g.getAttribute("transform"))[1]));
  expect(await scale()).toBe(1);
  await expect(page.locator("#a-1 .mapw-zbtn[aria-label='Karte verkleinern']")).toBeDisabled();
  await page.click("#a-1 .mapw-zbtn[aria-label='Karte vergrößern']");
  expect(await scale()).toBeCloseTo(1.6, 3);
  await page.click("#a-1 .mapw-zbtn[aria-label='Karte verkleinern']");
  expect(await scale()).toBe(1);
  await page.locator("#a-1 .mapw-map").scrollIntoViewIfNeeded();
  const de = await countryPoint(page, 1, "276");
  await page.mouse.move(de.x, de.y);
  await page.mouse.wheel(0, -400);   // ohne Klick in die Karte scrollt das Mausrad die Seite (Hinweis), statt zu zoomen
  await expect(page.locator("#a-1 .mapw-tip")).toHaveText("Zum Zoomen erst in die Karte klicken (oder Strg + Mausrad)");
  expect(await scale()).toBe(1);
  await page.locator("#a-1 .mapw-map").scrollIntoViewIfNeeded();
  const deA = await countryPoint(page, 1, "276");
  await page.mouse.move(deA.x, deA.y);
  await page.keyboard.down("Control"); await page.mouse.wheel(0, -400); await page.keyboard.up("Control");
  await expect.poll(scale).toBeGreaterThan(1.5);
  const de2 = await countryPoint(page, 1, "276");
  expect(Math.hypot(de2.x - deA.x, de2.y - deA.y)).toBeLessThan(60);   // Deutschland bleibt unter dem Mauszeiger
  await cards.nth(3).click();
  await clickCountry(page, 1, "276");
  await expect(cards.nth(3).locator(".mcard-ans")).toHaveText("✓ Deutschland");
  await page.click("#a-1 .mapw-zbtn:has-text('Ansicht zurücksetzen')");
  expect(await scale()).toBe(1);
  // ohne Maus: Karte per Tastatur wählen → Eingabefeld „Land eingeben“
  await cards.nth(2).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#mi-1")).toBeFocused();
  await page.keyboard.type("Ghana"); await page.keyboard.press("Enter");
  await expect(cards.nth(2).locator(".mcard-ans")).toHaveText("✗ Ghana passt nicht");
  await page.keyboard.type("Elfenbeinküste"); await page.keyboard.press("Enter");   // der falsche Name ist markiert und wird ersetzt
  await expect(cards.nth(2).locator(".mcard-ans")).toHaveText("✓ Elfenbeinküste");
  await expect(page.locator("#mp-1")).toHaveText("4 von 4 Karten zugeordnet");
  await expect(page.locator("#a-1 .mapw-arrows g.arrow")).toHaveCount(4);
  // Tabelle: Tab wandert durch die Zellen, Einfügen gesperrt, „+ Zeile“
  const cells = page.locator("#a-2 textarea.tcell:not(.measure)");
  await expect(page.locator("#a-2 th")).toHaveText(["Produkt", "Land"]);
  await expect(cells).toHaveCount(4);
  await cells.nth(0).click();
  await page.keyboard.type("Weizen"); await page.keyboard.press("Tab"); await page.keyboard.type("Kanada");
  await page.keyboard.press("Tab"); await page.keyboard.type("Reis");
  await page.keyboard.press("Enter");   // Enter → Zelle darunter (neue Zeile)
  await expect(cells).toHaveCount(6);
  await page.keyboard.type("Tee"); await page.keyboard.press("Shift+Tab"); await page.keyboard.type("China");   // zurück in Zeile 2, Spalte „Land“
  await cells.nth(1).dispatchEvent("paste");
  await expect(page.locator("#pe-2")).toHaveText(PASTE_MSG);
  await page.click("#a-2 .tbl-add");
  await expect(cells).toHaveCount(8);
  expect(await cells.evaluateAll((l) => l.map((x) => x.value))).toEqual(["Weizen", "Kanada", "Reis", "China", "Tee", "", "", ""]);
  await typeAt(page, "#a-3", "Weil sich Länder spezialisieren.");
  // Neu laden → „Weiterschreiben“: Tabelle und Zuordnungen kommen zurück (Zuordnungen erneut gegen die Prüfwerte geprüft)
  await page.waitForTimeout(700);
  await page.reload();
  await page.click("#resume-btn");
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
  await expect(page.locator("#mp-1")).toHaveText("4 von 4 Karten zugeordnet");
  await expect(page.locator("#a-1 .mcard-ans")).toHaveText(["✓ Brasilien", "✓ Indien", "✓ Elfenbeinküste", "✓ Deutschland"]);
  await expect(page.locator("#a-1 .mapw-arrows g.arrow")).toHaveCount(4);
  expect(await cells.evaluateAll((l) => l.map((x) => x.value))).toEqual(["Weizen", "Kanada", "Reis", "China", "Tee", ""]);   // leere Zeilen entfallen
  // „Alle Zuordnungen löschen“ mit Bestätigung (abgebrochen: alles bleibt)
  await page.click("#a-1 .mapw-clear");
  await confirmDialog(page, "Alle Zuordnungen löschen?", false);
  await expect(page.locator("#mp-1")).toHaveText("4 von 4 Karten zugeordnet");
  // KI-Feedback: die Weltkarte geht nicht an die KI, die Tabelle mit ihren Spalten
  const mapText = "Kaffee → Brasilien\nTee → Indien\nAuto → Deutschland\nKakao → Elfenbeinküste\nZugeordnet: 4 von 4";
  const tableText = "Produkt | Land\nWeizen | Kanada\nReis | China\nTee |";
  await mockReset();
  await page.click("#fb-btn");
  await confirmDialog(page, "KI-Feedback anfordern?");
  await expect(page.locator("#t-2 .fbbox")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("#t-1 .fbbox")).toBeHidden();   // kein KI-Feedback zur Weltkarte
  const prompt = (await mockState()).requests[0].messages.map((m) => m.content).join("\n");
  expect(prompt).toContain("### Antwort zu Aufgabe 2\nAntwort als Tabelle mit den Spalten: Produkt, Land\n<<<\n" + tableText + "\n>>>");
  expect(prompt).not.toMatch(/Brasilien|Kaffee|Aufgabe 1\b/);
  const fbCall = (await s.calls((r) => r.path === "/api/feedback"))[0];
  expect(JSON.parse(fbCall.reqBody).answers).toEqual([mapText, tableText, "Weil sich Länder spezialisieren."]);
  await submit(page);
  await closePage(s);

  // Lehrkraft: Antwortart in den Blattdetails, Tabelle und Zuordnungen in den Abgaben
  await tp.click("#b-res-back");
  await expect(tp.locator("#t-sel-code")).toHaveText(shown);
  await expect(tp.locator("#t-sel-tasks .ansinfo").nth(0)).toContainText("Antwortart: Weltkarten-Zuordnung (4 Karten)");
  await expect(tp.locator("#t-sel-tasks .ansmap li").nth(0)).toHaveText("Kaffee – Bohnen aus dem Hochland: Brasilien, Vietnam");
  await expect(tp.locator("#t-sel-tasks .ansinfo").nth(1)).toContainText("Spalten: Produkt · Land – 2 Zeilen vorgegeben");
  await tp.locator("#t-subs-body tr.main").first().click();
  const det = tp.locator("#t-subs-body tr.details").first();
  await expect(det.locator(".dtask").nth(0).locator(".task-label").first()).toHaveText("Aufgabe 1 · Weltkarten-Zuordnung");
  const finalCell = (k) => det.locator(".dtask").nth(k).locator("table.cmp > tbody > tr > td").nth(1);   // Spalte „Eingabe nach dem KI-Feedback“
  await expect(finalCell(0).locator(".mapans-list li")).toHaveText(["Kaffee → zugeordnet zu Brasilien", "Tee → zugeordnet zu Indien", "Auto → zugeordnet zu Deutschland", "Kakao → zugeordnet zu Elfenbeinküste"]);
  await expect(finalCell(0).locator(".mapans-sum")).toHaveText("Zugeordnet: 4 von 4");
  await expect(det.locator(".dtask").nth(1).locator(".task-label").first()).toHaveText("Aufgabe 2 · Tabelle");
  await expect(finalCell(1).locator("table.anstable th")).toHaveText(["Produkt", "Land"]);
  await expect(finalCell(1).locator("table.anstable tbody tr")).toHaveCount(3);
  await expect(finalCell(1).locator("table.anstable tbody td")).toHaveText(["Weizen", "Kanada", "Reis", "China", "Tee", ""]);

  // Sichern und wieder laden: Antwortarten und Kartenbild reisen mit
  const [dl] = await Promise.all([tp.waitForEvent("download"), tp.click("#t-export")]);
  const pdf = await readFile(await dl.path());
  const rec = sheetRecordOf(pdf);
  expect(rec.tasks.map((x) => (x.answer || { type: "text" }).type)).toEqual(["map", "table", "text"]);
  expect(rec.tasks[0].images).toEqual([expect.objectContaining({ mode: "card", ref: rec.tasks[0].answer.items[0].image })]);
  expect(rec.tasks[0].answer.items.map((x) => x.countries.map((c) => c.id))).toEqual([["076", "704"], ["356"], ["384"], ["276"]]);
  expect(pdf.toString("latin1")).toContain("(Antwortart: Weltkarten-Zuordnung mit 4 Karten");
  await tp.setInputFiles("#t-import-file", { name: "w.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(tp.locator("#tv-builder")).toBeVisible({ timeout: 30_000 });
  expect(await tp.$$eval(".bans-type", (l) => l.map((x) => x.value))).toEqual(["map", "table", "text"]);
  expect(await tp.locator("#b-rows > tr").nth(0).locator(".bitem-label").evaluateAll((l) => l.map((x) => x.value))).toEqual(["Kaffee", "Tee", "Kakao", "Auto"]);
  await expect(tp.locator("#b-rows > tr").nth(0).locator(".bitem-pic img")).toHaveCount(1);
  await expect(tp.locator("#bc-2")).toHaveValue("Produkt\nLand");
  await expect(tp.locator("#b-err")).toHaveText("");
  // aufräumen
  await tp.click("#b-back");   // frisch geladen, nichts geändert → ohne Rückfrage
  await expect(tp.locator("#tv-overview")).toBeVisible();
  await tp.locator("#t-sheets-body tr", { hasText: shown }).click();
  await expect(tp.locator("#t-sel-code")).toHaveText(shown);
  await tp.click("#t-del-sheet");
  await confirmDialog(tp, "Feibeitsblatt löschen?");
  await expect(tp.locator("#t-list-status")).toHaveText("Feibeitsblatt gelöscht.");
  await closePage(t);
});

test("7d Testdatei „Ein Auto – eine Welt“: Import übernimmt alles (Weltkarte mit Kartenbildern, Tabelle, Textaufgaben) → neues Blatt erscheint bei den Schüler:innen richtig", async ({ browser }) => {
  const pdf = await readFile(FIXTURE), rec = sheetRecordOf(pdf);
  const types = rec.tasks.map((x) => (x.answer && x.answer.type) || "text");
  expect(types).toEqual(["map", "table", "text", "text"]);
  const map = rec.tasks[0].answer, cardImgs = rec.tasks[0].images.filter((m) => m.mode === "card");
  expect(map.items).toHaveLength(12); expect(cardImgs).toHaveLength(12);
  const t = await openPage(browser);
  const tp = t.page;
  await teacherLogin(tp, PW);
  await tp.setInputFiles("#t-import-file", FIXTURE.pathname);
  await expect(tp.locator("#tv-builder")).toBeVisible({ timeout: 30_000 });
  await expect(tp.locator("#b-import")).toContainText(`„${rec.title}“ wurde aus der PDF-Datei geladen`);
  await expect(tp.locator("#b-err")).toHaveText("");
  expect(await tp.$$eval(".bans-type", (l) => l.map((x) => x.value))).toEqual(types);
  const r1 = tp.locator("#b-rows > tr").nth(0);
  expect(await r1.locator(".bitem-label").evaluateAll((l) => l.map((x) => x.value))).toEqual(map.items.map((x) => x.label));
  await expect(r1.locator(".bitem-pic img")).toHaveCount(map.items.filter((x) => x.image).length);
  await expect(r1.locator(".bchip")).toHaveCount(map.items.reduce((n, x) => n + x.countries.length, 0));
  await expect(r1.locator(".bchip.bad")).toHaveCount(0);   // alle Länder sind auf der Weltkarte anklickbar
  await expect(tp.locator("#bs-1")).toBeHidden();
  await expect(tp.locator("#bc-2")).toHaveValue(rec.tasks[1].answer.columns.join("\n"));
  await expect(tp.locator("#br-2")).toHaveValue(String(rec.tasks[1].answer.rows));
  for (const [i, x] of rec.tasks.entries()) await expect(tp.locator("#bq-" + (i + 1))).toHaveText(x.text, { useInnerText: true });
  await tp.click("#b-gen");
  await expect(tp.locator("#b-result")).toBeVisible();
  await expect(tp.locator("#b-res-img")).toHaveText(`Alle ${cardImgs.length} Bilder sind gespeichert.`, { timeout: 60_000 });
  const shown = (await tp.locator("#b-res-code").textContent()).trim();
  expect(shown).not.toBe(fmtCodeOf(rec.code));
  // Schüler:innen: zwölf Karten mit Bild, Tabelle mit den Spalten, zwei Textfelder; eine Zuordnung klappt
  const s = await openPage(browser);
  const { page } = s;
  await enterCode(page, shown);
  await fillPerson(page, { vorname: "mo", nachname: "si", geb: "--11-11", klasse: "7b" });
  await expect(page.locator("#a-1 .mcard")).toHaveCount(12);
  await expect(page.locator("#a-1 .mcard-label")).toHaveText(map.items.map((x) => x.label));
  await expect(page.locator("#a-1 .mcard-img img")).toHaveCount(map.items.filter((x) => x.image).length);
  await expect(page.locator("#a-2 th")).toHaveText(rec.tasks[1].answer.columns);
  await expect(page.locator("#a-2 tbody tr")).toHaveCount(rec.tasks[1].answer.rows);
  await expect(page.locator("textarea.answer:not(.measure)")).toHaveCount(2);
  await expect(page.locator("#t-1 .task-material")).toHaveCount(rec.tasks[0].material.length ? 1 : 0);
  const big = map.items.findIndex((x) => x.countries.some((c) => ["076", "036", "156", "643", "840", "124"].includes(c.id)));
  const cid = map.items[big].countries.find((c) => ["076", "036", "156", "643", "840", "124"].includes(c.id)).id;
  await page.locator("#a-1 .mcard").nth(big).click();
  await clickCountry(page, 1, cid);
  await expect(page.locator("#a-1 .mcard").nth(big)).toHaveClass(/done/);
  await expect(page.locator("#mp-1")).toHaveText("1 von 12 Karten zugeordnet");
  await closePage(s);
  // aufräumen
  await tp.click("#b-res-back");
  await expect(tp.locator("#t-sel-code")).toHaveText(shown);
  await tp.click("#t-del-sheet");
  await confirmDialog(tp, "Feibeitsblatt löschen?");
  await expect(tp.locator("#t-list-status")).toHaveText("Feibeitsblatt gelöscht.");
  await closePage(t);
});
const fmtCodeOf = (c) => String(c || "").slice(0, 3) + "-" + String(c || "").slice(3);

test("7e Formatierte Aufgabenstellung: Lehrkraft setzt ein Wort fett und fügt einen Link ein → Schüler:in sieht beides (Link in neuem Tab), die KI nur den reinen Text; Vorlage und Sicherung → Import behalten die Formatierung", async ({ browser, request }) => {
  const LINK = BASE_URL + "/api/health?q=aufgabe";
  const PLAIN1 = "Erkläre den Wasserkreislauf.\nNutze die Grafik auf dieser Seite";
  const FMT1 = [[{ t: "Erkläre den " }, { t: "Wasserkreislauf", f: "b" }, { t: "." }], [{ t: "Nutze die Grafik auf " }, { t: "dieser Seite", h: LINK }]];
  const FMT2 = [[{ t: "Beschreibe " }, { t: "einen", f: "i" }, { t: " Regentag." }]];
  const TEXT3 = "Was passiert mit Pfützen in der Sonne?\n\n    Tipp: Denk an die Wärme.";   // Leerzeile und Einrückung bleiben
  const t = await openPage(browser);
  const tp = t.page;
  await teacherLogin(tp, PW);
  await tp.click("#t-new");
  await tp.fill("#b-title", "Formatierte Aufgaben");
  const r0 = tp.locator("#b-rows > tr").nth(0), q1 = tp.locator("#bq-1");
  await expect(q1).toHaveClass(/is-empty/);
  // Aufgabe 1: tippen, ein Wort per Strg+B fett, Zeilenumbruch, Link über die Werkzeugleiste der Aufgabenstellung
  await q1.click();
  await tp.keyboard.type("Erkläre den ");
  await tp.keyboard.press("Control+B"); await tp.keyboard.type("Wasserkreislauf"); await tp.keyboard.press("Control+B");
  await tp.keyboard.type(".");
  await tp.keyboard.press("Enter");
  await tp.keyboard.type("Nutze die Grafik auf dieser Seite");
  for (let i = 0; i < "dieser Seite".length; i++) await tp.keyboard.press("Shift+ArrowLeft");
  await r0.locator(".bq-bar .fmtbtn", { hasText: "Link" }).click();
  await expect(tp.locator("#linkdlg")).toHaveClass(/open/);
  await expect(tp.locator("#ld-text")).toHaveValue("dieser Seite");
  await tp.fill("#ld-url", "javascript:alert(1)");
  await tp.click("#ld-ok");
  await expect(tp.locator("#ld-err")).toHaveText("Bitte eine gültige Adresse eingeben, z. B. https://www.beispiel.de");
  await tp.fill("#ld-url", LINK);
  await tp.keyboard.press("Enter");
  await expect(tp.locator("#linkdlg")).not.toHaveClass(/open/);
  await expect(q1.locator("b")).toHaveText("Wasserkreislauf");
  await expect(q1.locator("a")).toHaveText("dieser Seite");
  await expect(q1.locator("a")).toHaveAttribute("href", LINK);
  await expect(q1).not.toHaveClass(/is-empty/);
  await expect(r0.locator(".bmat-edit a, .bmat-edit b")).toHaveCount(0);   // das Material bleibt unberührt
  // die Knöpfe der Aufgabenstellung folgen dem Cursor, die des Materials nicht
  await q1.locator("b").click();
  await expect(r0.locator(".bq-bar .fmtbtn", { hasText: "F" })).toHaveAttribute("aria-pressed", "true");
  await expect(r0.locator('.bmat .fmtbtn[aria-pressed="true"]')).toHaveCount(0);
  await tp.fill("#bs-1", "Achte darauf, ob Verdunstung und Niederschlag erklärt werden.");
  // Aufgabe 2: HTML aus der Zwischenablage – nur fett/kursiv/unterstrichen und http(s)-Links bleiben (wie beim Material)
  await tp.locator("#bq-2").click();
  await tp.locator("#bq-2").evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData("text/html", '<p style="color:red">Beschreibe <i>einen</i> <a href="javascript:alert(1)">Regen</a>tag.</p><script>window.__q = 1</script><img src="https://example.org/t.png">');
    dt.setData("text/plain", "Beschreibe einen Regentag.");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(tp.locator("#bq-2 i")).toHaveText("einen");
  await expect(tp.locator("#bq-2 a, #bq-2 img, #bq-2 script")).toHaveCount(0);
  expect(await tp.evaluate(() => window.__q)).toBeUndefined();
  // Aufgabe 3: reiner Text (bleibt ohne textFmt), getippt mit Leerzeile und eingerückter Zeile
  await tp.locator("#bq-3").click();
  await tp.keyboard.type("Was passiert mit Pfützen in der Sonne?");
  await tp.keyboard.press("Enter"); await tp.keyboard.press("Enter");
  await tp.keyboard.type("    Tipp: Denk an die Wärme.");
  await tp.fill("#bs-3", "Achte auf das Wort Verdunstung.");
  await tp.click("#b-gen");
  await expect(tp.locator("#b-result")).toBeVisible();
  const shown = (await tp.locator("#b-res-code").textContent()).trim(), code = shown.replace("-", "");
  const [row] = await d1Query(`SELECT tasks FROM sheets WHERE code='${code}'`);
  expect(JSON.parse(row.tasks).map((x) => [x.text, x.textFmt])).toEqual([[PLAIN1, FMT1], ["Beschreibe einen Regentag.", FMT2], [TEXT3, undefined]]);
  const pub = await (await request.get("/api/sheet/" + code)).json();
  expect(pub.sheet.tasks.map((x) => [x.text, x.textFmt])).toEqual([[PLAIN1, FMT1], ["Beschreibe einen Regentag.", FMT2], [TEXT3, []]]);
  expect(JSON.stringify(pub)).not.toMatch(/Verdunstung und Niederschlag|solution/);

  // Schüler:in: fettes Wort und Link (neuer Tab, ohne Opener/Referrer); der übrige Text ist dann normal, damit Fett auffällt
  const s = await openPage(browser);
  const { page } = s;
  await enterCode(page, shown);
  await fillPerson(page, { vorname: "jo", nachname: "wa", geb: "--04-04", klasse: "7c" });
  await expect(page.locator("#q-1 b")).toHaveText("Wasserkreislauf");
  const a = page.locator("#q-1 a");
  await expect(a).toHaveAttribute("href", LINK);
  await expect(a).toHaveAttribute("target", "_blank");
  await expect(a).toHaveAttribute("rel", "noopener noreferrer");
  await expect(a.locator(".sr-only")).toHaveText("(öffnet in neuem Tab)");
  await expect(page.locator("#q-1 p")).toHaveCount(2);   // zwei Zeilen wie im Editor
  await expect(page.locator("#q-1")).toHaveClass(/has-b/);
  expect(await page.$eval("#q-1", (e) => getComputedStyle(e).fontWeight)).toBe("400");
  expect(await page.$eval("#q-1 b", (e) => getComputedStyle(e).fontWeight)).toBe("700");
  await expect(page.locator("#q-2 i")).toHaveText("einen");
  expect(await page.$eval("#q-2", (e) => getComputedStyle(e).fontWeight)).toBe("700");   // ohne Fettes bleibt die Aufgabenstellung fett
  await expect(page.locator("#q-3")).toHaveText(TEXT3);
  await expect(page.locator("#q-3")).not.toHaveClass(/qtext/);
  expect(await page.$eval("#q-1", (e) => getComputedStyle(e).fontFamily)).toBe(await page.$eval("#q-3", (e) => getComputedStyle(e).fontFamily));
  // KI: die Aufgabenstellung nur als reiner Text – ohne Formatierung und ohne Link-Adresse
  for (let i = 1; i <= 3; i++) await typeAt(page, "#a-" + i, "Wasser verdunstet in der Sonne.");
  await mockReset();
  await requestFeedback(page);
  const prompt = (await mockState()).requests[0].messages.map((m) => m.content).join("\n");
  expect(prompt).toContain("### Aufgabe 1\nAufgabenstellung:\n<<<\n" + PLAIN1 + "\n>>>");
  expect(prompt).toContain("### Aufgabe 3\nAufgabenstellung:\n<<<\n" + TEXT3 + "\n>>>");
  expect(prompt).not.toContain("/api/health");
  expect(prompt).not.toMatch(/<b>|"f":|textFmt/);
  await submit(page);
  await closePage(s);

  // Lehrkraft: Blattdetails und Abgaben-Details zeigen die Formatierung, Links in neuem Tab
  await tp.click("#b-res-back");
  await expect(tp.locator("#t-sel-code")).toHaveText(shown);
  const si0 = tp.locator("#t-sel-tasks .si").nth(0);
  await expect(si0.locator(".qtext b")).toHaveText("Wasserkreislauf");
  await expect(si0.locator(".qtext a")).toHaveAttribute("target", "_blank");
  await expect(tp.locator("#t-sel-tasks .si").nth(2).locator(".qtext")).toHaveCount(0);
  await tp.click("#t-refresh");
  await expect(tp.locator("#t-subs-body tr.main")).toHaveCount(1);
  await tp.locator("#t-subs-body tr.main").nth(0).click();
  const dt0 = tp.locator("#t-subs-body tr.details:visible .dtask").nth(0);
  await expect(dt0.locator(".dtask-text b")).toHaveText("Wasserkreislauf");
  await expect(dt0.locator(".dtask-text a")).toHaveAttribute("rel", "noopener noreferrer");
  expect(await tp.locator("#t-subs-body tr.details:visible .dtask").nth(2).locator(".dtask-text").textContent()).toBe(TEXT3);

  // „Als Vorlage verwenden“ übernimmt die Formatierung in den Editor
  await tp.click("#t-template");
  await expect(tp.locator("#tv-builder")).toBeVisible();
  await expect(tp.locator("#bq-1 b")).toHaveText("Wasserkreislauf");
  await expect(tp.locator("#bq-1 a")).toHaveAttribute("href", LINK);
  await expect(tp.locator("#bq-3")).toHaveText(TEXT3);
  await tp.click("#b-back");   // nichts geändert → ohne Rückfrage
  await expect(tp.locator("#tv-overview")).toBeVisible();

  // Sicherung: Datensatz mit textFmt (nur bei formatierten Aufgaben); Import → Editor formatiert → neues Blatt mit derselben Formatierung
  await tp.locator("#t-sheets-body tr", { hasText: shown }).click();
  await expect(tp.locator("#t-sel-code")).toHaveText(shown);
  const [dl] = await Promise.all([tp.waitForEvent("download"), tp.click("#t-export")]);
  const pdf = await readFile(await dl.path()), rec = sheetRecordOf(pdf);
  expect(rec.tasks.map((x) => [x.text, x.textFmt])).toEqual([[PLAIN1, FMT1], ["Beschreibe einen Regentag.", FMT2], [TEXT3, undefined]]);
  await tp.setInputFiles("#t-import-file", { name: "Formatiert.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(tp.locator("#tv-builder")).toBeVisible();
  await expect(tp.locator("#b-err")).toHaveText("");
  await expect(tp.locator("#bq-1 b")).toHaveText("Wasserkreislauf");
  await expect(tp.locator("#bq-1 a")).toHaveAttribute("href", LINK);
  await expect(tp.locator("#bq-1")).toHaveText(PLAIN1, { useInnerText: true });
  await expect(tp.locator("#bq-2 i")).toHaveText("einen");
  await tp.click("#b-gen");
  await expect(tp.locator("#b-result")).toBeVisible();
  const shown2 = (await tp.locator("#b-res-code").textContent()).trim();
  expect(shown2).not.toBe(shown);
  const pub2 = await (await request.get("/api/sheet/" + shown2.replace("-", ""))).json();
  expect(pub2.sheet.tasks.map((x) => [x.text, x.textFmt])).toEqual(pub.sheet.tasks.map((x) => [x.text, x.textFmt]));

  // aufräumen: beide Blätter löschen
  await tp.click("#b-res-back");
  for (const c of [shown2, shown]) {
    await tp.locator("#t-sheets-body tr", { hasText: c }).click();
    await expect(tp.locator("#t-sel-code")).toHaveText(c);
    await tp.click("#t-del-sheet");
    await confirmDialog(tp, "Feibeitsblatt löschen?");
    await expect(tp.locator("#t-list-status")).toHaveText("Feibeitsblatt gelöscht.");
  }
  await closePage(t);
});

test("7i Löschfrist: Kürzen fragt nach und löscht ältere Einträge sofort (der Server löscht nie mehr als bestätigt), Verlängern erinnert an die neue Information, Laden/Speichern scheitert ohne Folgen; aufgeklappte Abgaben nennen nach einer Friständerung sofort das neue Löschdatum; der tägliche Zeitplan löscht nach der Frist (lokal ausgelöst)", async ({ browser, request }) => {
  const t = await openPage(browser);
  const page = t.page;
  await teacherLogin(page, PW);
  // eigenes Blatt mit drei Abgaben (ohne KI-Auftrag); eine davon per D1 zehn Tage zurückdatiert
  await page.click("#t-new");
  await page.fill("#b-title", "Löschfrist");
  await page.fill("#bq-1", "Wie heißt deine Lieblingsstadt?");
  await page.click("#b-gen");
  await expect(page.locator("#b-result")).toBeVisible();
  const code = (await page.locator("#b-res-code").textContent()).trim().replace("-", "");
  const sheet = (await (await request.get("/api/sheet/" + code)).json()).sheet;
  expect(sheet.privacy.retentionDays).toBe(DAYS);
  const ids = [];
  for (const v of ["Ole", "Pia", "Uwe"]) {
    const env = await makeEnvelope(sheet.publicKey, { v: 1, sheetCode: code, sheetTitle: sheet.title, person: { vorname: v, nachname: "Lf", geburtsdatum: "--06-06", klasse: "6a" },
      answers: [{ first: "Rom", final: "Rom" }], feedback: null, feedbackAt: null, noAi: "none", submittedAt: new Date().toISOString() });
    const r = await request.post("/api/submit", { data: { code, envelope: env } });
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.retentionDays).toBe(DAYS);
    ids.push(j.id);
  }
  const back10 = (id) => d1Query(`UPDATE submissions SET received_at = received_at - ${10 * 864e5} WHERE id = ${id}`);
  const idsNow = async () => (await d1Query(`SELECT id FROM submissions WHERE sheet_code='${code}' ORDER BY id`)).map((r) => r.id);
  const storedDays = async () => JSON.parse((await d1Query("SELECT value FROM settings WHERE key='privacy'"))[0].value).retentionDays;
  await back10(ids[1]);
  await page.click("#b-res-back");
  const row = page.locator("#t-sheets-body tr", { hasText: "Löschfrist" });
  await expect(row.locator("td").nth(4)).toHaveText("3");   // innerhalb der Frist von 14 Tagen bleibt alles
  await expect(page.locator("#t-subs-sum")).toHaveText("3 Abgaben");

  // Laden scheitert: Frist und „Speichern“ bleiben gesperrt (sonst stünde eine falsche Frist darin, und „Speichern“ überschriebe
  // sie und löschte ohne Nachfrage); „Erneut laden“ holt den Stand
  await page.route("**/api/teacher/privacy", (r) => r.request().method() === "GET"
    ? r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Der Server ist gerade nicht erreichbar.", code: "unavailable" }) })
    : r.continue());
  await page.click("#t-privacy");
  await expect(page.locator("#pv-status")).toHaveText("Die gespeicherte Löschfrist konnte nicht geladen werden: Der Server ist gerade nicht erreichbar. Speichern ist erst möglich, wenn sie geladen ist.");
  for (const id of ["#pv-save", "#pv-days"]) await expect(page.locator(id)).toBeDisabled();
  await expect(page.locator("#pv-days-effect")).toHaveText("");
  await expect(page.locator("#pv-reload")).toBeVisible();
  await expect(page.locator("#pv-reload")).toBeFocused();
  await page.unroute("**/api/teacher/privacy");
  await page.click("#pv-reload");
  await expect(page.locator("#pv-save")).toBeEnabled();
  await expect(page.locator("#pv-reload")).toBeHidden();
  await expect(page.locator("#pv-days")).toHaveValue(String(DAYS));

  // Kürzen auf 7 Tage: die Seite nennt, was jetzt gelöscht würde, und fragt vor dem Speichern nach (Abbrechen ändert nichts)
  await page.selectOption("#pv-days", "7");
  await expect(page.locator("#pv-days-effect")).toHaveText("Mit dieser Frist würde jetzt 1 älterer Eintrag gelöscht.");
  await page.click("#pv-save");
  await expect(page.locator("#dlg-ok")).toHaveText("Speichern und löschen");
  expect(await confirmDialog(page, "Ältere Abgaben jetzt löschen?", false)).toBe("Mit einer Frist von 7 Tagen wird 1 Abgabe bzw. Erstversuch, der älter ist, sofort endgültig gelöscht. Das lässt sich nicht rückgängig machen.");
  expect(await storedDays()).toBe(DAYS);
  expect(await idsNow()).toEqual(ids);
  // inzwischen ist eine zweite Abgabe älter geworden (die Seite war lange offen): Der Server löscht nie mehr als bestätigt –
  // er speichert nichts, die Seite fragt mit der neuen Zahl erneut (Abbrechen ändert weiter nichts)
  await back10(ids[2]);
  await page.click("#pv-save");
  // erste Rückfrage mit der alten Zahl bestätigen; lokal antwortet der Server so schnell, dass die zweite Rückfrage (dieselbe
  // Dialogbox) erscheint, bevor die erste sichtbar geschlossen ist – deshalb hier auf den neuen Text warten statt aufs Schließen
  await expect(page.locator("#dlg.open")).toBeVisible();
  await expect(page.locator("#dlg-title")).toHaveText("Ältere Abgaben jetzt löschen?");
  await expect(page.locator("#dlg-text")).toHaveText("Mit einer Frist von 7 Tagen wird 1 Abgabe bzw. Erstversuch, der älter ist, sofort endgültig gelöscht. Das lässt sich nicht rückgängig machen.");
  await page.click("#dlg-ok");
  await expect(page.locator("#dlg-text")).toHaveText(/^Nach dem aktuellen Stand/);
  expect(await confirmDialog(page, "Ältere Abgaben jetzt löschen?", false)).toBe("Nach dem aktuellen Stand ist mehr zu löschen als zuvor angezeigt. Mit einer Frist von 7 Tagen werden 2 Abgaben bzw. Erstversuche, die älter sind, sofort endgültig gelöscht. Das lässt sich nicht rückgängig machen.");
  await expect(page.locator("#pv-status")).toHaveText("Nicht gespeichert – es wurde nichts gelöscht.");
  await expect(page.locator("#pv-days-effect")).toHaveText("Mit dieser Frist würden jetzt 2 ältere Einträge gelöscht.");
  expect(await storedDays()).toBe(DAYS);
  expect(await idsNow()).toEqual(ids);
  await page.click("#pv-save");
  await confirmDialog(page, "Ältere Abgaben jetzt löschen?");
  await expect(page.locator("#pv-status")).toHaveText("Gespeichert. Die Schüler:innen sehen die Löschfrist beim nächsten Öffnen eines Feibeitsblattes. 2 ältere Einträge wurden gelöscht.");
  await expect(page.locator("#pv-days-effect")).toHaveText("Mit dieser Frist würde jetzt nichts gelöscht.");
  expect(await idsNow()).toEqual([ids[0]]);
  // Speichern scheitert (Server-Fehler): nichts gespeichert, nichts gelöscht, die Seite sagt es
  await page.selectOption("#pv-days", String(DAYS));
  await page.route("**/api/teacher/privacy", (r) => r.request().method() === "PUT"
    ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Interner Fehler.", code: "internal" }) })
    : r.continue());
  await page.click("#pv-save");
  await expect(page.locator("#pv-status")).toHaveText("Nicht gespeichert – Interner Fehler.");
  await page.unroute("**/api/teacher/privacy");
  expect(await storedDays()).toBe(7);
  // wieder verlängern: gilt auch für schon gespeicherte Abgaben → Hinweis, die Schüler:innen neu zu informieren
  await page.click("#pv-save");
  await expect(page.locator("#pv-status")).toHaveText("Gespeichert. Die Schüler:innen sehen die Löschfrist beim nächsten Öffnen eines Feibeitsblattes. Die längere Frist gilt auch für schon gespeicherte Abgaben – informieren Sie die Schüler:innen neu.");
  // zurück: die Übersicht lädt Blätter und Abgaben neu (gelöschte Einträge zählen sofort nicht mehr – ohne „Aktualisieren“)
  await page.click("#pv-back");
  await expect(page.locator("#t-privinfo")).toContainText(DAYS + " Tage nach dem Eingang automatisch gelöscht.");
  await expect(row.locator("td").nth(4)).toHaveText("1");
  await expect(page.locator("#t-subs-sum")).toHaveText("1 Abgabe");
  // Frist ändern, ohne dass etwas gelöscht wird: ein schon aufgeklapptes Detail nennt sofort das neue Löschdatum
  await page.locator("#t-subs-body tr.main").first().click();
  const dmeta = page.locator("#t-subs-body tr.details:visible .dmeta");
  const dmy = (x) => { const [d, m, y] = x.split(".").map(Number); return Date.UTC(y, m - 1, d); };
  const keepDays = async () => {
    const [, got, del] = /^Abgegeben am (\d\d\.\d\d\.\d{4}).* automatische Löschung ab dem (\d\d\.\d\d\.\d{4})$/.exec(await dmeta.textContent()) || [];
    return Math.round((dmy(del) - dmy(got)) / 864e5);
  };
  expect([DAYS - 1, DAYS]).toContain(await keepDays());
  for (const d of [30, DAYS]) {   // verlängern, dann wieder kürzen (nichts ist älter als die Frist)
    await page.click("#t-privacy");
    await expect(page.locator("#pv-save")).toBeEnabled();
    await page.selectOption("#pv-days", String(d));
    await page.click("#pv-save");
    await expect(page.locator("#pv-status")).toHaveText(/^Gespeichert\./);
    await page.click("#pv-back");
    await expect(dmeta).toBeVisible();
    await expect.poll(async () => [d - 1, d].includes(await keepDays())).toBe(true);   // Eingang + Frist (Ortszeit: bei Zeitumstellung ein Tag weniger)
  }

  // täglicher Zeitplan (Cron „17 2 * * *“, lokal über /cdn-cgi/local/scheduled): löscht, was älter als die Frist ist; das Blatt bleibt
  await d1Query(`UPDATE submissions SET received_at = received_at - ${(DAYS + 1) * 864e5} WHERE id = ${ids[0]}`);
  const cron = await request.get("/cdn-cgi/local/scheduled?cron=" + encodeURIComponent("17 2 * * *") + "&format=json");
  expect(cron.status()).toBe(200);
  expect(await cron.json()).toMatchObject({ outcome: "ok" });
  expect(await d1Query(`SELECT id FROM submissions WHERE sheet_code='${code}'`)).toEqual([]);
  expect((await request.get("/api/sheet/" + code)).status()).toBe(200);
  await page.click("#t-del-sheet");
  await confirmDialog(page, "Feibeitsblatt löschen?");
  await expect(page.locator("#t-list-status")).toHaveText("Feibeitsblatt gelöscht.");
  await closePage(t);
});

test("7j Während die Abgabe gesendet wird: KI-Feedback und „Abbrechen“ sind gesperrt, ein währenddessen geöffneter Dialog schließt sich mit der Bestätigung; ein Nachsehen der Empfänger verwandelt keinen offenen Abgabe-Dialog; erstes Feedback, aber beim Weiterschreiben kein Empfänger → keine zweite Rückmeldung, nichts gesendet", async ({ browser }) => {
  const t = await openPage(browser);
  const tp = t.page;
  await teacherLogin(tp, PW);
  await tp.click("#t-new");
  await tp.fill("#b-title", "Abgabe läuft");
  await tp.fill("#bq-1", TASKS[0].text);
  await tp.fill("#bs-1", TASKS[0].solution);
  await tp.click("#b-gen");
  await expect(tp.locator("#b-result")).toBeVisible();
  const shown = (await tp.locator("#b-res-code").textContent()).trim();

  const s = await openPage(browser);
  const { page } = s;
  await enterCode(page, shown);
  await fillPerson(page, { vorname: "sam", nachname: "se", geb: "--09-09", klasse: "7b" });
  await typeAt(page, "#a-1", "Das Gewissen ist eine innere Stimme.");
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route("**/api/submit", async (route) => { await held; await route.continue(); });   // die Abgabe hängt (langsames Netz)
  await page.click("#submit-btn");
  await confirmDialog(page, "Ohne KI-Feedback abgeben?");
  await expect(page.locator("#submit-status")).toHaveText("Deine Abgabe wird verschlüsselt und gesendet …");
  await expect(page.locator("#fb-btn")).toBeDisabled();   // kein KI-Feedback nach „ohne KI-Feedback abgegeben“
  await page.click("#ed-cancel");   // „Abbrechen“ fragt nicht erst – die Abgabe käme trotzdem an
  await expect(page.locator("#submit-status")).toHaveText("Deine Abgabe wird gerade gesendet – abbrechen geht jetzt nicht mehr.");
  await expect(page.locator("#dlg.open")).toHaveCount(0);
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
  // ein Dialog, der während des Sendens aufgeht (Rechtschreibprüfung), bleibt nicht über der Bestätigung stehen
  await page.click("#t-1 .ltbtn");
  await expect(page.locator("#dlg.open")).toBeVisible();
  release();
  await expect(page.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await expect(page.locator("#dlg.open")).toHaveCount(0);
  await expect(page.locator("#done-btn")).toBeFocused();
  expect((await s.calls((r) => r.path === "/api/submit")).map((r) => r.status)).toEqual([200]);
  expect(await s.calls((r) => r.path === "/api/feedback")).toEqual([]);
  expect(s.lt).toEqual([]);   // nichts an LanguageTool
  await closePage(s);

  // Beim Laden kennt die Seite keinen KI-Dienst; „KI um ein Feedback bitten“ sieht nach (GET, hier angehalten) – währenddessen
  // öffnet die Schülerin „Abgeben“. Die Antwort (KI inzwischen eingerichtet) verwandelt den offenen Dialog nicht in „KI-Feedback
  // anfordern?“: dieselbe Frage, derselbe Text, nichts geht an die KI; die Abgabe trägt den Grund, den der Dialog genannt hat
  const code = shown.replace("-", "");
  const noAiSheet = (j) => { delete j.sheet.aiRecipients; delete j.sheet.aiReserve; j.sheet.aiProvider = null; };
  const s2 = await openPage(browser);
  const p2 = s2.page;
  let gets2 = 0, releaseGet;
  const heldGet = new Promise((r) => { releaseGet = r; });
  await p2.route("**/api/sheet/" + code, async (route) => {
    const n = ++gets2;
    if (n === 2) await heldGet;
    const res = await route.fetch();
    const j = await res.json();
    if (n === 1) noAiSheet(j);
    await route.fulfill({ response: res, json: j });
  });
  await enterCode(p2, shown);
  await fillPerson(p2, { vorname: "ria", nachname: "ra", geb: "--04-04", klasse: "7b" });
  await typeAt(p2, "#a-1", "Das Gewissen meldet sich.");
  await p2.click("#fb-btn");
  await expect(p2.locator("#fb-status")).toHaveText("Einen Moment …");
  await expect(p2.locator("#submit-btn")).toBeEnabled();   // Abgeben geht auch jetzt
  await p2.click("#submit-btn");
  await expect(p2.locator("#dlg-title")).toHaveText("Ohne KI-Feedback abgeben?");
  const asked = await p2.locator("#dlg-text").textContent();
  expect(asked).toMatch(/^Das KI-Feedback ist gerade nicht möglich \(KI nicht eingerichtet\)\./);
  releaseGet();
  await expect(p2.locator("#privacy")).toContainText("an den KI-Dienst „127.0.0.1:");   // die Antwort ist angekommen
  await p2.waitForTimeout(300);
  await expect(p2.locator("#dlg-title")).toHaveText("Ohne KI-Feedback abgeben?");
  await expect(p2.locator("#dlg-ok")).toHaveText("Ohne KI-Feedback abgeben");
  await expect(p2.locator("#dlg-text")).toHaveText(asked);
  await expect(p2.locator("#fb-status")).toHaveText("");
  expect(await confirmDialog(p2, "Ohne KI-Feedback abgeben?")).toBe(asked);
  await expect(p2.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  expect(await s2.calls((r) => r.path === "/api/feedback")).toEqual([]);
  expect((await s2.calls((r) => r.path === "/api/submit")).map((r) => [r.status, JSON.parse(r.reqBody).stage])).toEqual([[200, "final"]]);
  await closePage(s2);

  // Erstes KI-Feedback geholt und überarbeitet; beim Weiterschreiben kennt die Seite keinen KI-Dienst mehr (z. B. inzwischen
  // entfernt): Hinweis, Abgabe-Dialog und Bestätigung sagen, dass es keine zweite Rückmeldung gibt – nichts geht noch einmal an
  // den Server
  const FB2_NO_AI = "Eine KI-Rückmeldung zu deiner abgegebenen Fassung gibt es diesmal nicht – ein KI-Dienst ist für dieses Feibeitsblatt gerade nicht eingerichtet";
  await mockMode("ok");
  await mockReset();
  const s3 = await openPage(browser);
  const p3 = s3.page;
  let strip = false;
  await p3.route("**/api/sheet/" + code, async (route) => {
    const res = await route.fetch();
    const j = await res.json();
    if (strip) noAiSheet(j);
    await route.fulfill({ response: res, json: j });
  });
  await enterCode(p3, shown);
  await fillPerson(p3, { vorname: "tom", nachname: "to", geb: "--06-06", klasse: "7b" });
  await typeAt(p3, "#a-1", "Das Gewissen ist eine innere Stimme.");
  await requestFeedback(p3);
  await expect.poll(async () => (await s3.calls((r) => r.path === "/api/submit")).map((r) => JSON.parse(r.reqBody).stage), { timeout: 30_000 }).toEqual(["first"]);
  await typeAt(p3, "#a-1", " Es meldet sich nach einer Tat.");
  await p3.waitForTimeout(700);
  strip = true;
  await p3.reload();
  await p3.click("#resume-btn");
  await expect(p3.locator("#screen-editor")).toHaveClass(/active/);
  await expect(p3.locator("#t-1 .fbbox")).toBeVisible();
  await expect(p3.locator("#submit-hint")).toHaveText("Abgegeben werden beide Fassungen: deine Antworten vor dem KI-Feedback und deine überarbeiteten Antworten. Alles wird verschlüsselt; nur deine Lehrkraft kann es lesen. " + FB2_NO_AI + ".");
  await p3.click("#submit-btn");
  expect(await confirmDialog(p3, "Jetzt abgeben?")).toBe("Nach der Abgabe kannst du deine Antworten nicht mehr ändern. Abgegeben werden deine erste Fassung (vor dem KI-Feedback) und deine überarbeitete Fassung.\n" + FB2_NO_AI + "; an die KI wird nichts gesendet.");
  await expect(p3.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await expect(p3.locator("#done-fb-status")).toHaveText(FB2_NO_AI + ". Deine Abgabe ist davon nicht betroffen.");
  await expect(p3.locator("#done-fb-retry")).toBeHidden();
  await p3.waitForTimeout(300);
  expect((await s3.calls((r) => r.path === "/api/feedback")).length).toBe(1);   // nur das erste Feedback
  expect((await s3.calls((r) => r.path === "/api/submit")).map((r) => JSON.parse(r.reqBody).stage)).toEqual(["first", "final"]);
  expect((await mockState()).count).toBe(1);
  const [dl3] = await Promise.all([p3.waitForEvent("download"), p3.click("#done-pdf")]);
  expect(pdfShownText(await readFile(await dl3.path()))).toContain("Eine KI-Rückmeldung zu deiner abgegebenen Fassung gab es diesmal nicht.");
  await closePage(s3);

  await tp.click("#b-res-back");
  await expect(tp.locator("#t-sel-code")).toHaveText(shown);
  await expect(tp.locator("#t-subs-sum")).toHaveText("3 Abgaben");
  const mains = tp.locator("#t-subs-body tr.main");
  for (const [k, n] of ["Ra", "Se", "To"].entries()) await expect(mains.nth(k).locator("td:not(.arrowcol)").nth(0)).toHaveText(n);
  await tp.click("#t-expand-all");
  const det = (k) => tp.locator("#t-subs-body tr.details").nth(k);
  await expect(det(0).locator(".moodle-hint")).toHaveText("Ohne KI-Feedback abgegeben – das KI-Feedback war nicht möglich (KI nicht eingerichtet).");
  await expect(det(1).locator(".moodle-hint")).toHaveText("Ohne KI-Feedback abgegeben.");
  await expect(det(2).locator(".moodle-hint")).toHaveCount(0);
  await expect(det(2).locator(".dtask").nth(0).locator("table.cmp tbody td")).toHaveText(["Das Gewissen ist eine innere Stimme.", "Das Gewissen ist eine innere Stimme. Es meldet sich nach einer Tat."]);
  await tp.click("#t-del-sheet");
  await confirmDialog(tp, "Feibeitsblatt löschen?");
  await expect(tp.locator("#t-list-status")).toHaveText("Feibeitsblatt gelöscht.");
  await closePage(t);
});

/* ---------- Analoges Arbeitsblatt (PDF zum Ausdrucken) und Checkliste hinter dem QR-Code ---------- */
// Stream-Objekte einer im Browser erzeugten PDF-Datei in Reihenfolge: {num, dict, data (entpackt, falls FlateDecode)}
function pdfStreams(buf) {
  const s = buf.toString("latin1"), out = [];
  for (const m of s.matchAll(/(\d+) 0 obj\n(<<(?:(?!endobj)[\s\S])*?>>)\nstream\n/g)) {
    const len = Number(/\/Length (\d+)/.exec(m[2])[1]), start = m.index + m[0].length;
    const raw = buf.subarray(start, start + len);
    out.push({ num: Number(m[1]), dict: m[2], data: /\/FlateDecode/.test(m[2]) ? inflateSync(raw) : raw });
  }
  return out;
}
const pdfDecode = (str) => str.replace(/\\([0-7]{3}|[\s\S])/g, (_, c) => (c.length === 3 ? WIN[parseInt(c, 8)] || String.fromCharCode(parseInt(c, 8)) : c));
// Textstücke einer Seite {x, y, font, size, t} und die Zeilen (Stücke gleicher Höhe von links nach rechts verbunden, von oben nach unten)
function pdfPieces(content) {
  return [...content.matchAll(/BT [\d. ]+ rg \/(F\d) ([\d.]+) Tf ([\d.]+) ([\d.]+) Td \(((?:\\[\s\S]|[^\\)])*)\) Tj ET/g)]
    .map((m) => ({ font: m[1], size: Number(m[2]), x: Number(m[3]), y: Number(m[4]), t: pdfDecode(m[5]) }));
}
function pdfLinesOf(content) {
  const rows = new Map();
  for (const p of pdfPieces(content)) { if (!rows.has(p.y)) rows.set(p.y, []); rows.get(p.y).push(p); }
  return [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, ps]) => ps.sort((a, b) => a.x - b.x).map((p) => p.t).join(""));
}
// QR-Code aus dem Inhalt lesen: Module als Rechtecke in Modul-Einheiten (mit Ruhezone) → Bild → jsQR
function pdfQr(content) {
  const m = /q 0 g ([\d.]+) 0 0 -([\d.]+) ([\d.]+) ([\d.]+) cm\n((?:\d+ \d+ \d+ 1 re\n)+)f\nQ/.exec(content);
  if (!m) return null;
  const rects = m[5].trim().split("\n").map((l) => l.split(" ").map(Number));
  const n = Math.max(...rects.map(([c, , len]) => c + len), ...rects.map(([, r]) => r + 1)) + 4, sc = 4, w = n * sc;
  expect(Math.min(...rects.map(([c]) => c)), "Ruhezone links").toBe(4);
  expect(Math.min(...rects.map(([, r]) => r)), "Ruhezone oben").toBe(4);
  const img = new Uint8ClampedArray(w * w * 4).fill(255);
  for (const [c, r, len] of rects) for (let x = c * sc; x < (c + len) * sc; x++) for (let y = r * sc; y < (r + 1) * sc; y++) { const o = (y * w + x) * 4; img[o] = img[o + 1] = img[o + 2] = 0; }
  const res = jsQR(img, w, w, { inversionAttempts: "dontInvert" });
  return { text: res && res.data, module: Number(m[1]), side: n * Number(m[1]) };
}
function analogPdfOf(buf) {
  const streams = pdfStreams(buf), contents = streams.filter((x) => !/\/Subtype/.test(x.dict)).map((x) => x.data.toString("latin1"));
  return { streams, contents, lines: contents.map(pdfLinesOf), pieces: contents.map(pdfPieces), all: contents.join("\n"),
    form: streams.find((x) => /\/Subtype \/Form/.test(x.dict)), images: streams.filter((x) => /\/Subtype \/Image/.test(x.dict)) };
}

test("7k Analoges Arbeitsblatt: KI schlägt die Checkliste einmal vor → Lehrkraft ändert und ergänzt → PDF mit Schreiblinien, Tabelle, Umrisskarte, Links als Adresse und QR-Code; die Checklisten-Seite zeigt nur Gespeichertes, Häkchen bleiben auf dem Gerät", async ({ browser, request }) => {
  const TITLE_A = "Wasser und Welt – analog";
  const SOL1 = "- Verdunstung über dem Meer\n- Kondensation zu Wolken\n- Niederschlag als Regen", SOL2 = "Weizen. Reis.";
  const QUELLE = "https://example.org/quelle";
  // Wikipedia-Adresse mit Umlaut: gedruckt lesbar, die Annotation kodiert; zwei Links direkt hintereinander: getrennt gedruckt
  const WIKI = "https://de.wikipedia.org/wiki/Gewässer", WIKI_ENC = "https://de.wikipedia.org/wiki/Gew%C3%A4sser", ZWEI = "https://example.org/zwei";
  const t = await openPage(browser);
  const tp = t.page;
  await teacherLogin(tp, PW);
  await tp.click("#t-new");
  await tp.fill("#b-title", TITLE_A);
  await tp.click("#b-add");
  const rows = tp.locator("#b-rows > tr");
  const paste = (loc, html, text) => loc.evaluate((el, [html, text]) => {
    const dt = new DataTransfer();
    dt.setData("text/html", html); dt.setData("text/plain", text);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [html, text]);
  // Aufgabe 1: Textfeld – ein Wort fett, Auftrag an die KI mehrzeilig, Material mit dem Link „hier klicken“
  await tp.locator("#bq-1").click();
  await paste(tp.locator("#bq-1"), "<p>Erkläre den <b>Wasserkreislauf</b> mit eigenen Worten.</p>", "Erkläre den Wasserkreislauf mit eigenen Worten.");
  await expect(tp.locator("#bq-1 b")).toHaveText("Wasserkreislauf");
  await tp.fill("#bs-1", SOL1);
  const mat1 = rows.nth(0).locator(".bmat-edit");
  await mat1.click();
  await paste(mat1, `<p>Lies den Text <a href="${QUELLE}">hier klicken</a> und notiere Stichworte.</p><p>Mehr: <a href="${WIKI}">Gewässer</a><a href="${ZWEI}">Teil zwei</a>.</p>` +
    `<p>Den <a href="${QUELLE}">Quellen</a>-Text kennst du schon.</p>`,
    "Lies den Text hier klicken und notiere Stichworte.\nMehr: GewässerTeil zwei.\nDen Quellen-Text kennst du schon.");
  await expect(mat1.locator("a")).toHaveCount(4);
  await expect(mat1.locator("a").nth(0)).toHaveAttribute("href", QUELLE);
  // Aufgabe 2: Tabelle mit 3 Spalten und 4 Zeilen
  await tp.fill("#bq-2", "Trage Lebensmittel, ihr Herkunftsland und die Menge ein.");
  await tp.fill("#bs-2", SOL2);
  await tp.selectOption("#bt-2", "table");
  await tp.fill("#bc-2", "Produkt; Land; Menge");
  await tp.fill("#br-2", "4");
  // Aufgabe 3: Weltkarte mit zwei Karten (eine mit Hinweis und Bild)
  await tp.fill("#bq-3", "Ordne die Produkte ihren Herkunftsländern zu.");
  await tp.selectOption("#bt-3", "map");
  const r3 = rows.nth(2);
  await r3.locator(".bitem").nth(0).locator(".bitem-label").fill("Kaffee");
  await r3.locator(".bitem").nth(0).locator(".bitem-hint").fill("Bohnen aus dem Hochland");
  await r3.locator(".bitem").nth(0).locator(".bitem-country").fill("Brasilien");
  await r3.locator(".bitem").nth(0).locator(".bitem-country").press("Enter");
  await r3.locator(".bitem").nth(0).locator(".bitem-file").setInputFiles({ name: "kaffee.png", mimeType: "image/png", buffer: makePng(60, 40, [120, 70, 20]) });
  await expect(r3.locator(".bitem").nth(0).locator(".bitem-pic img")).toHaveCount(1);
  await r3.locator(".bitem-add").click();
  await r3.locator(".bitem").nth(1).locator(".bitem-label").fill("Tee");
  await r3.locator(".bitem").nth(1).locator(".bitem-country").fill("Indien");
  await r3.locator(".bitem").nth(1).locator(".bitem-country").press("Enter");
  // Aufgabe 4: Textfeld ohne Auftrag an die KI
  await tp.fill("#bq-4", "Was hat dir heute gefallen?");
  await tp.click("#b-gen");
  await expect(tp.locator("#b-result")).toBeVisible();
  await expect(tp.locator("#b-res-img")).toHaveText("Das Bild ist gespeichert.", { timeout: 30_000 });
  const shown = (await tp.locator("#b-res-code").textContent()).trim(), code = shown.replace("-", "");
  const CHECK_URL = "https://feibeitsblatt.janrickmer.de/#checkliste=" + code;
  await tp.click("#b-res-back");
  await expect(tp.locator("#t-sel-code")).toHaveText(shown);
  await expect(tp.locator("#t-sel-tasks .si")).toHaveCount(4);
  await expect(tp.locator("#t-analog")).toHaveText("Analoges Arbeitsblatt als PDF herunterladen");

  // Erstes Öffnen: die KI schlägt einmal vor (nur Aufgaben mit Auftrag; ohne Antworten, Länder oder Personendaten) – als Entwurf
  await mockReset();
  await tp.click("#t-analog");
  await expect(tp.locator("#tv-analog")).toBeVisible();
  await expect(tp.locator("#ck-sheet")).toHaveText(`${TITLE_A} · Code ${shown}`);
  const draft1 = expectedChecklist(SOL1), draft2 = expectedChecklist(SOL2);
  expect(draft1).toEqual(["Du beachtest: Verdunstung über dem Meer", "Du beachtest: Kondensation zu Wolken", "Du beachtest: Niederschlag als Regen"]);
  await expect(tp.locator("#ck-1")).toHaveValue(draft1.join("\n"));
  await expect(tp.locator("#ck-2")).toHaveValue(draft2.join("\n"));
  await expect(tp.locator("#ck-3")).toHaveValue("");
  await expect(tp.locator("#ck-4")).toHaveValue("");
  await expect(tp.locator("#ck-state")).toContainText("Vorschlag der KI – noch nicht gespeichert");
  await expect(tp.locator("#ck-status")).toHaveText("Die KI hat eine Checkliste vorgeschlagen.");
  await expect(tp.locator("#ck-hint-1")).toHaveText("Höchstens 8 Punkte, je höchstens 160 Zeichen.");
  await expect(tp.locator("#ck-hint-3")).toHaveText("Ohne Auftrag an die KI – Punkte können Sie selbst eintragen. Höchstens 8 Punkte, je höchstens 160 Zeichen.");
  await expect(tp.locator("#ck-hint-4")).toHaveText("Ohne Auftrag an die KI – Punkte können Sie selbst eintragen. Höchstens 8 Punkte, je höchstens 160 Zeichen.");
  await expect(tp.locator("#ck-1")).toHaveAccessibleName("Punkte der Checkliste zu Aufgabe 1 – eine Zeile je Punkt");
  await expect(tp.locator("#ck-4")).toHaveAccessibleName("Punkte der Checkliste zu Aufgabe 4 – eine Zeile je Punkt");
  await expect(tp.locator("#ck-open")).toBeHidden();   // noch nichts gespeichert
  await expect(tp.locator("#ck-aiwarn")).toBeHidden();
  let mock = await mockState();
  expect(mock.requests).toHaveLength(1);
  const sys = mock.requests[0].messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const user = mock.requests[0].messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  expect(sys).toContain("Checkliste");
  expect(user).toContain("Auftrag der Lehrkraft für das Feedback:\n<<<\n" + SOL1 + "\n>>>");
  expect(user).toContain("Produkt | Land | Menge");
  expect(user).not.toMatch(/### Aufgabe 3|### Aufgabe 4|### Antwort|Brasilien|Indien|Kaffee/);
  const posts = () => t.calls((r) => r.method === "POST" && r.path === `/api/teacher/sheets/${code}/checklist`);
  expect(await posts()).toHaveLength(1);

  // Schüler:in: vor dem Speichern gibt es keine Checkliste (der Entwurf ist nicht öffentlich) – auch beim Wechsel des Hashes
  const s = await openPage(browser);
  const { page } = s;
  await page.goto("/#checkliste=" + shown.toLowerCase());   // nur der Hash ändert sich: hashchange; der Code wird normalisiert
  await expect(page.locator("#screen-check")).toHaveClass(/active/);
  await expect(page.locator("#chk-err")).toHaveText("Zu diesem Feibeitsblatt gibt es noch keine Checkliste.");
  await expect(page.locator("#chk-sheet")).toHaveText("Code " + shown);
  await expect(page.locator("#chk-open")).toBeVisible();
  await expect(page.locator("#chk-body")).toBeHidden();
  await expect(page.locator("#chk-privacy")).toHaveText("Datenschutz: Deine Häkchen bleiben auf diesem Gerät und werden nicht gesendet. Beim Laden dieser Seite und der Checkliste verarbeitet Cloudflare, Inc. (USA; betreibt den Server dieser Seite) technisch die Internetadresse (IP-Adresse) deines Geräts. Alle Informationen zum Datenschutz – auch, wer verantwortlich ist, und was mit den Häkchen geschieht – findest du unter „Impressum & Datenschutz“ ganz unten auf der Seite; " +
    "passend zu deinem Feibeitsblatt auch, wenn du es mit seinem Code digital öffnest (auf der Startseite „Weiter“).");
  await expect(page.locator("#foot-legal")).toBeVisible();   // der Link dorthin steht auch unter der Checkliste

  // Lehrkraft: Grenzen wie der Server; dann einen Punkt ändern, einen ergänzen (Doppeltes und Leerzeilen entfallen) → speichern
  await tp.fill("#ck-2", Array.from({ length: 9 }, (_, k) => "Punkt " + (k + 1)).join("\n"));
  await tp.click("#ck-save");
  await expect(tp.locator("#ck-status")).toHaveText("Aufgabe 2: höchstens 8 Punkte.");
  await expect(tp.locator("#ck-2")).toHaveAttribute("aria-invalid", "true");
  await expect(tp.locator("#ck-2")).toBeFocused();
  await tp.fill("#ck-2", "x".repeat(161));
  await tp.click("#ck-save");
  await expect(tp.locator("#ck-status")).toHaveText("Aufgabe 2: Ein Punkt ist zu lang (höchstens 160 Zeichen).");
  await tp.fill("#ck-2", draft2.join("\n") + "\n\n  du beachtest:   weizen ");
  await expect(tp.locator("#ck-2")).not.toHaveAttribute("aria-invalid", "true");
  const final1 = ["Du nennst die Verdunstung über dem Meer.", draft1[1], draft1[2]], final4 = ["Du nennst etwas, das dir gefallen hat."];
  await tp.fill("#ck-1", final1.join("\n"));
  await tp.fill("#ck-4", final4[0]);
  const [dl] = await Promise.all([tp.waitForEvent("download"), tp.click("#ck-save")]);
  await expect(tp.locator("#ck-status")).toHaveText(/^Gespeichert\. Das PDF \(\d+ KB\) wird heruntergeladen\.$/, { timeout: 30_000 });
  expect(dl.suggestedFilename()).toBe(`Feibeitsblatt-Arbeitsblatt-${shown}-Wasser und Welt - analog.pdf`);
  const put = (await t.calls((r) => r.method === "PUT" && r.path === `/api/teacher/sheets/${code}/checklist`))[0];
  expect(JSON.parse(put.reqBody)).toEqual({ ai: true, tasks: [{ n: 1, points: final1 }, { n: 2, points: draft2 }, { n: 3, points: [] }, { n: 4, points: final4 }] });
  const [ckRow] = await d1Query(`SELECT draft, final FROM sheet_checklists WHERE sheet_code='${code}'`);
  expect(ckRow.draft).toBeNull();
  expect(JSON.parse(ckRow.final).tasks.map((x) => x.points)).toEqual([final1, draft2, [], final4]);
  await expect(tp.locator("#ck-2")).toHaveValue(draft2.join("\n"));   // so, wie gespeichert (ohne Doppeltes)
  await expect(tp.locator("#ck-state")).toHaveText(/^Gespeicherte Checkliste vom \d\d\.\d\d\.\d{4}, \d\d:\d\d Uhr – über den QR-Code sichtbar\.$/);
  await expect(tp.locator("#ck-open")).toBeVisible();
  await expect(tp.locator("#ck-open")).toHaveAttribute("href", CHECK_URL);   // genau das Ziel des QR-Codes
  await expect(tp.locator("#ck-open")).toHaveAttribute("rel", "noopener noreferrer");

  // Das PDF
  const buf = await readFile(await dl.path());
  if (process.env.ANALOG_PDF_OUT) { await mkdir(process.env.ANALOG_PDF_OUT, { recursive: true }); await writeFile(join(process.env.ANALOG_PDF_OUT, "7k-analog.pdf"), buf); }
  const st = pdfStructure(buf, 7);
  expect(st.s).toMatch(/\/Type \/Font \/Subtype \/Type1 \/BaseFont \/Helvetica-BoldOblique \/Encoding \/WinAnsiEncoding/);
  const A = analogPdfOf(buf), text = A.lines.map((ls) => ls.join("\n")).join("\n"), flat = A.lines.flat().join(" ");
  expect(A.contents.length).toBeGreaterThanOrEqual(2);
  expect(A.lines[0][0]).toBe(TITLE_A);
  expect(flat).toContain(`Du kannst dieses Arbeitsblatt mit dem Code ${shown} auch digital auf https://feibeitsblatt.janrickmer.de/ aufrufen. Dort steht dir eine KI-Rückmeldung zu deinen Antworten zur Verfügung, die es auf dem Papier nicht gibt.`);
  expect(A.pieces[0].find((p) => p.t === shown).font).toBe("F2");   // der Code fett
  expect(A.pieces[0].filter((p) => /^(Name|Klasse|Datum):$/.test(p.t)).map((p) => p.t)).toEqual(["Name:", "Klasse:", "Datum:"]);
  expect(text).toContain("Erkläre den Wasserkreislauf mit eigenen Worten.");
  expect(A.pieces.flat().find((p) => p.t === "Wasserkreislauf").font).toBe("F2");
  // Link im Material: nur die Adresse (nie der Linktext), anklickbar
  expect(text).toContain("Lies den Text " + QUELLE + " und notiere Stichworte.");
  expect(text).not.toContain("hier klicken");
  expect(st.s).toContain(`/A << /S /URI /URI (${QUELLE}) >>`);
  expect(text).toContain(`Mehr: ${WIKI} ${ZWEI}.`);   // Umlaut lesbar, die beiden Adressen getrennt; der Punkt danach bleibt dran
  expect(text).toContain(`Den ${QUELLE} -Text kennst du schon.`);   // „[Quellen]-Text“: sonst sähe „…/quelle-Text“ wie eine Adresse aus
  expect(text).not.toContain("Quellen-Text");
  expect(text).not.toMatch(/Teil zwei|%C3%A4/);
  expect(st.s).toContain(`/A << /S /URI /URI (${WIKI_ENC}) >>`);
  expect(st.s).toContain(`/A << /S /URI /URI (${ZWEI}) >>`);
  expect(st.s).toContain("/A << /S /URI /URI (https://feibeitsblatt.janrickmer.de/) >>");
  // Schreiblinien: 8 je Textaufgabe (Aufgaben 1 und 4), Abstand 24 pt, über die volle Breite
  const lineYs = A.contents.map((c) => [...c.matchAll(/q 0\.6 G 0\.5 w 50\.00 ([\d.]+) m 545\.28 \1 l S Q/g)].map((m) => Number(m[1])));
  expect(lineYs.flat()).toHaveLength(16);
  for (const ys of lineYs) for (let k = 1; k < ys.length; k++) if (ys[k - 1] - ys[k] < 30) expect(ys[k - 1] - ys[k]).toBeCloseTo(24, 2);
  // Tabelle: Kopf mit den Spalten, 4 Zeilen zu je zwei Schreibzeilen (helle Hilfslinie in der Mitte)
  expect(A.all.match(/q 0\.8 G 0\.4 w 50\.00 [\d.]+ m 545\.28 [\d.]+ l S Q/g)).toHaveLength(4);
  for (const c of ["Produkt", "Land", "Menge"]) expect(A.pieces.flat().some((p) => p.t === c && p.font === "F2")).toBe(true);
  // Weltkarte: alle Umrisse einmal als Form-XObject (y gespiegelt), darunter die Karten mit Hinweis, Bild und Linie für das Land
  const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  const mapSrc = html.slice(html.indexOf("const WORLD_MAP"), html.indexOf("/* WORLDMAP:END */"));
  const form = A.form.data.toString("latin1");
  expect(form.startsWith("1 0 0 -1 0 520 cm 1 g 0.5 G ")).toBe(true);
  expect(form.match(/ m\n/g)).toHaveLength(mapSrc.match(/[Z"]M-?\d/g).length);
  expect(form.match(/ l\n/g).length).toBeGreaterThan(5000);
  expect(A.all).toMatch(/q [\d.]+ 0 0 [\d.]+ 50\.00 [\d.]+ cm \/Wm Do Q/);
  expect(text).toContain("Schreibe zu jeder Karte das passende Land.");
  expect(A.pieces.flat().filter((p) => /^\d\.$|^Kaffee$|^Tee$|^Bohnen aus dem Hochland$|^Land:$/.test(p.t)).map((p) => p.t)).toEqual(["1.", "Kaffee", "Bohnen aus dem Hochland", "Land:", "2.", "Tee", "Land:"]);
  expect(A.images).toHaveLength(1);   // das Kartenbild (als JPEG)
  expect(A.images[0].dict).toContain("/Filter /DCTDecode");
  // Keine Aufträge an die KI, keine Länder, keine Checklistenpunkte im PDF – nur der QR-Code mit der Adresse
  expect(text).not.toMatch(/Verdunstung|Kondensation|Niederschlag|Weizen|Reis|Brasilien|Indien|Du beachtest|Du nennst/);
  const qr = pdfQr(A.contents[A.contents.length - 1]);
  expect(qr.text).toBe(CHECK_URL);
  expect(qr.side).toBeCloseTo(90, 1);
  const last = A.lines[A.lines.length - 1];
  expect(last).toContain("Checkliste");
  expect(last.join(" ")).toContain("Scanne den QR-Code. Dort kannst du für jede Aufgabe abhaken, ob deine Antwort die Erwartungen erfüllt.");
  expect(last).toContain(CHECK_URL);
  expect(st.s).toContain(`/A << /S /URI /URI (${CHECK_URL}) >>`);
  // Fußzeile jeder Seite
  A.pieces.forEach((ps, k) => {
    expect(ps.map((p) => p.t)).toContain(`Feibeitsblatt ${shown} · ${TITLE_A}`);
    expect(ps.map((p) => p.t)).toContain(`Seite ${k + 1} von ${A.pieces.length}`);
  });

  // Schüler:in: die Seite zeigt jetzt die gespeicherten Punkte (Aufgaben ohne Punkte entfallen)
  await page.reload();
  await expect(page.locator("#screen-check")).toHaveClass(/active/);
  await expect(page.locator("#chk-sheet")).toHaveText(TITLE_A + "Code " + shown);
  await expect(page.locator("#chk-err")).toHaveText("");
  await expect(page.locator("#chk-ai")).toHaveText("Die Punkte hat eine KI aus den Vorgaben deiner Lehrkraft vorgeschlagen; deine Lehrkraft hat sie geprüft.");
  // maschinenlesbar gekennzeichnet wie das KI-Feedback (KI-Vorschlag, von der Lehrkraft geprüft und ggf. geändert)
  await expect(page.locator("#chk-tasks")).toHaveAttribute("data-ai-generated", "true");
  await expect(page.locator("#chk-tasks")).toHaveAttribute("data-ai-content", "checklist");
  await expect(page.locator("#chk-tasks")).toHaveAttribute("data-digital-source-type", "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia");
  await expect(page.locator("#chk-lead")).toHaveText("Hake ab, was deine Antwort schon erfüllt. Was noch fehlt, kannst du ergänzen.");
  await expect(page.locator("#chk-tasks legend")).toHaveText(["Aufgabe 1", "Aufgabe 2", "Aufgabe 4"]);
  await expect(page.locator("#chk-t-1 .chk-text")).toHaveText("Erkläre den Wasserkreislauf mit eigenen Worten.");
  await expect(page.locator("#chk-t-1 .chk-item")).toHaveText(final1);
  await expect(page.locator("#chk-t-2 .chk-item")).toHaveText(draft2);
  await expect(page.locator("#chk-t-4 .chk-item")).toHaveText(final4);
  await expect(page.locator("#chk-c-1")).toHaveText("0 von 3 abgehakt");
  expect(await page.locator("#chk-1-1").evaluate((e) => e.closest("label").getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await page.locator("label[for=chk-1-1]").click();
  await page.locator("#chk-1-3").check();
  await page.locator("#chk-4-1").check();
  await expect(page.locator("#chk-c-1")).toHaveText("2 von 3 abgehakt");
  await expect(page.locator("#chk-c-4")).toHaveText("1 von 1 abgehakt");
  await expect(page.locator("#chk-c-4")).toHaveClass(/full/);
  await expect(page.locator("#ck-live")).toHaveText("Aufgabe 4: 1 von 1 abgehakt.");
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), "feibeitsblatt:check:" + code);
  expect(stored.ticks).toEqual({ 1: [0, 2], 4: [0] });
  expect(stored.sig).toMatch(/^[0-9a-f]{8}$/);
  // eine ungespeicherte Änderung der Lehrkraft erscheint nicht; die Häkchen bleiben nach dem Neuladen
  await tp.fill("#ck-1", "Ungespeicherter Punkt");
  await page.reload();
  await expect(page.locator("#chk-t-1 .chk-item")).toHaveText(final1);
  await expect(page.locator("#chk-1-1")).toBeChecked();
  await expect(page.locator("#chk-1-2")).not.toBeChecked();
  await expect(page.locator("#chk-1-3")).toBeChecked();
  await expect(page.locator("#chk-c-1")).toHaveText("2 von 3 abgehakt");
  // „Alle Häkchen entfernen“ fragt nach
  await page.click("#chk-clear");
  await confirmDialog(page, "Alle Häkchen entfernen?");
  await expect(page.locator("#chk-tasks input:checked")).toHaveCount(0);
  await expect(page.locator("#chk-c-1")).toHaveText("0 von 3 abgehakt");
  expect(await page.evaluate((k) => localStorage.getItem(k), "feibeitsblatt:check:" + code)).toBeNull();
  // „Feibeitsblatt digital öffnen“: Startseite mit eingetragenem Code, ohne Hash, Fokus auf „Weiter“
  await page.click("#chk-open");
  await expect(page.locator("#screen-start")).toHaveClass(/active/);
  await expect(page.locator("#code-input")).toHaveValue(shown);
  await expect(page.locator("#start-btn")).toBeFocused();
  expect(new URL(page.url()).hash).toBe("");
  // unbekannter Code → die bekannte Meldung; zurück zur Startseite über den Hash
  await page.goto("/#checkliste=ZZZ999");
  await expect(page.locator("#screen-check")).toHaveClass(/active/);
  await expect(page.locator("#chk-err")).toHaveText(UNKNOWN_CODE_MSG);
  await expect(page.locator("#chk-open")).toBeHidden();
  await page.evaluate(() => { location.hash = ""; });
  await expect(page.locator("#screen-start")).toHaveClass(/active/);

  // Lehrkraft: ungespeicherte Änderung → „Ohne Speichern zurück?“; erneutes Öffnen fragt die KI nicht noch einmal
  await tp.click("#ck-back");
  await confirmDialog(tp, "Ohne Speichern zurück?");
  await expect(tp.locator("#tv-overview")).toBeVisible();
  await tp.click("#t-analog");
  await expect(tp.locator("#ck-state")).toContainText("Gespeicherte Checkliste vom");
  await expect(tp.locator("#ck-1")).toHaveValue(final1.join("\n"));
  await expect(tp.locator("#ck-status")).toHaveText("");
  expect(await posts()).toHaveLength(1);
  mock = await mockState();
  expect(mock.requests).toHaveLength(1);
  // Tageskontingent aufgebraucht (Antwort vom Server vorgegeben): der Grund steht nur einmal da, der Editor bleibt stehen
  const QUOTA = "Das kostenlose Tageskontingent von Cloudflare Workers AI ist aufgebraucht (es gilt für das ganze Cloudflare-Konto). Ab 0:00 Uhr UTC (1:00 Uhr MEZ bzw. 2:00 Uhr MESZ) geht es wieder.";
  const ckRoute = `**/api/teacher/sheets/${code}/checklist`;
  await tp.route(ckRoute, (route) => (route.request().method() === "POST"
    ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, code: "ai_quota", error: QUOTA, aiCode: "DAILY_LIMIT" }) })
    : route.continue()));
  await tp.click("#ck-regen");
  await confirmDialog(tp, "Neu vorschlagen lassen?");
  await expect(tp.locator("#ck-status")).toHaveText("Die KI konnte gerade keine Checkliste vorschlagen. " + QUOTA + " Sie können die Punkte selbst eintragen.");
  await expect(tp.locator("#ck-1")).toHaveValue(final1.join("\n"));
  await expect(tp.locator("#ck-regen")).toBeEnabled();
  await expect(tp.locator("#ck-regen")).toBeFocused();   // der Fokus geht nach dem Sperren nicht verloren
  await tp.unroute(ckRoute);
  // „Neu von der KI vorschlagen lassen“ fragt erst, ersetzt den Editorinhalt; die gespeicherte Checkliste bleibt öffentlich
  await tp.click("#ck-regen");
  await confirmDialog(tp, "Neu vorschlagen lassen?");
  await expect(tp.locator("#ck-1")).toHaveValue(draft1.join("\n"));
  await expect(tp.locator("#ck-state")).toContainText("Vorschlag der KI – noch nicht gespeichert");
  await expect(tp.locator("#ck-regen")).toBeFocused();
  expect((await mockState()).requests).toHaveLength(2);
  const pubCk = await (await request.get(`/api/sheet/${code}/checklist`)).json();
  expect(pubCk.tasks.map((x) => x.points)).toEqual([final1, draft2, [], final4]);
  // Ohne Punkte: Rückfrage, gespeichert wird eine leere Checkliste, das PDF hat keinen QR-Code
  for (let n = 1; n <= 4; n++) await tp.fill("#ck-" + n, "");
  await tp.click("#ck-save");
  const noQrText = await confirmDialog(tp, "Ohne QR-Code herunterladen?", false);
  expect(noQrText).toBe("Ohne Checklistenpunkte enthält das PDF keinen QR-Code. Trotzdem herunterladen?");
  const [dl2] = await Promise.all([tp.waitForEvent("download"), (async () => { await tp.click("#ck-save"); await confirmDialog(tp, "Ohne QR-Code herunterladen?"); })()]);
  await expect(tp.locator("#ck-status")).toHaveText(/^Gespeichert\. Das PDF \(\d+ KB\) wird heruntergeladen\. Ohne Checklistenpunkte enthält es keinen QR-Code\.$/, { timeout: 30_000 });
  const B = analogPdfOf(await readFile(await dl2.path()));
  expect(pdfQr(B.all)).toBeNull();
  expect(B.lines.flat()).not.toContain("Checkliste");
  await page.goto("/#checkliste=" + code);
  await expect(page.locator("#chk-tasks")).toHaveText("Deine Lehrkraft hat zu diesem Feibeitsblatt keine Checkliste hinterlegt.");
  await expect(page.locator("#chk-tasks")).not.toHaveAttribute("data-ai-generated", "true");
  await expect(page.locator("#chk-clear")).toBeHidden();
  await closePage(s);

  // Zurück, während gespeichert wird: Die Rückfrage sagt, dass das Speichern weiterläuft – nur das PDF bleibt aus
  await tp.fill("#ck-1", "Während des Speicherns zurück");
  let releasePut;
  const putHeld = new Promise((r) => { releasePut = r; });
  await tp.route(ckRoute, async (route) => { if (route.request().method() === "PUT") await putHeld; return route.continue(); });
  const putDone = tp.waitForResponse((res) => res.request().method() === "PUT" && new URL(res.url()).pathname === `/api/teacher/sheets/${code}/checklist`);
  let lateDownload = false;
  const onDownload = () => { lateDownload = true; };
  tp.on("download", onDownload);
  await tp.click("#ck-save");
  await expect(tp.locator("#ck-status")).toHaveText("Die Checkliste wird gespeichert …");
  await tp.click("#ck-back");
  expect(await confirmDialog(tp, "Zurück zur Übersicht?", false)).toBe("Die Checkliste wird gerade gespeichert. Das Speichern läuft weiter, auch wenn Sie jetzt zurückgehen – das PDF wird dann aber nicht heruntergeladen.");
  await expect(tp.locator("#tv-analog")).toBeVisible();   // „Hier bleiben“
  await tp.click("#ck-back");
  await confirmDialog(tp, "Zurück zur Übersicht?");
  await expect(tp.locator("#tv-overview")).toBeVisible();
  releasePut();
  expect((await putDone).status()).toBe(200);
  await tp.unroute(ckRoute);
  expect((await (await request.get(`/api/sheet/${code}/checklist`)).json()).tasks[0].points).toEqual(["Während des Speicherns zurück"]);

  // Antworten des Servers vorgegeben: ein Blatt ganz ohne Auftrag an die KI (der Hinweis sagt, warum im PDF kein Satz zur KI-Rückmeldung
  // steht) und eine Tabelle mit vielen Spalten (der Kopf wird kleiner – bis 7 pt –, statt Wörter mitten im Wort zu trennen; erst darunter mit „-“)
  const wideCols = ["Land", "Hauptstadt", "Besonderheit", "Einwohnerzahl (geschätzt, 2024)", "Fläche", "Sprache", "Währung", "Donaudampfschifffahrtskapitän"];
  const sheetRoute = `**/api/teacher/sheets/${code}`;
  await tp.route(sheetRoute, async (route) => {
    const res = await route.fetch(), json = await res.json();
    json.sheet.tasks[1].answer.columns = wideCols;
    return route.fulfill({ response: res, json });
  });
  await tp.route(ckRoute, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch(), json = await res.json();
    return route.fulfill({ response: res, json: Object.assign(json, { aiFeedback: false }) });
  });
  await tp.locator("#t-sheets-body tr", { hasText: shown }).click();
  await expect(tp.locator("#t-sel-tasks .si")).toHaveCount(4);
  await tp.click("#t-analog");
  await expect(tp.locator("#ck-1")).toHaveValue("Während des Speicherns zurück");
  await expect(tp.locator("#ck-aiwarn")).toHaveText("Zu keiner Aufgabe dieses Blattes gibt es einen Auftrag an die KI. Deshalb steht im PDF kein Satz zur KI-Rückmeldung (digital gibt es zu diesem Blatt keine), und die KI schlägt keine Checkliste vor – tragen Sie die Punkte selbst ein.");
  await expect(tp.locator("#ck-regen")).toBeHidden();
  expect(lateDownload).toBe(false);   // nach dem Verlassen kam kein PDF mehr
  tp.off("download", onDownload);
  const [dl3] = await Promise.all([tp.waitForEvent("download"), tp.click("#ck-save")]);
  await expect(tp.locator("#ck-status")).toHaveText(/^Gespeichert\. Das PDF \(\d+ KB\) wird heruntergeladen\.$/, { timeout: 30_000 });
  await tp.unroute(sheetRoute); await tp.unroute(ckRoute);
  const bufC = await readFile(await dl3.path());
  if (process.env.ANALOG_PDF_OUT) await writeFile(join(process.env.ANALOG_PDF_OUT, "7k-analog-breit.pdf"), bufC);
  const C = analogPdfOf(bufC);
  expect(C.lines.flat().join(" ")).not.toContain("KI-Rückmeldung");
  const headCells = C.pieces.flat().filter((p) => p.font === "F2" && p.size < 10);
  expect([...new Set(headCells.map((p) => p.size))]).toEqual([7]);
  const HEAD = ["Land", "Hauptstadt", "Besonderheit", "Einwohnerzahl", "(geschätzt,", "2024)", "Fläche", "Sprache", "Währung", "Donaudampfs-", "chifffahrtskapi-", "tän"];
  expect(headCells.map((p) => p.t).slice(0, HEAD.length)).toEqual(HEAD);   // (der Kopf wiederholt sich auf einer neuen Seite)
  expect(headCells.length % HEAD.length).toBe(0);

  // Frische Seite (Bilder nicht im Zwischenspeicher): Scheitert das Speichern, während „Zurück zur Übersicht?“ offen ist, fragt die
  // Bestätigung neu – jetzt gingen ungespeicherte Änderungen verloren; während das PDF entsteht, sind die Felder gesperrt
  const t2 = await openPage(browser);
  const tp2 = t2.page;
  await teacherLogin(tp2, PW);
  await tp2.locator("#t-sheets-body tr", { hasText: shown }).click();
  await tp2.click("#t-analog");
  await expect(tp2.locator("#ck-1")).toHaveValue("Während des Speicherns zurück");
  await tp2.fill("#ck-1", "Gleich scheitert das Speichern");
  let failPut;
  const putFails = new Promise((r) => { failPut = r; });
  await tp2.route(ckRoute, async (route) => { if (route.request().method() !== "PUT") return route.continue(); await putFails; return route.abort("failed"); });
  await tp2.click("#ck-save");
  await expect(tp2.locator("#ck-status")).toHaveText("Die Checkliste wird gespeichert …");
  await tp2.click("#ck-back");
  await expect(tp2.locator("#dlg-title")).toHaveText("Zurück zur Übersicht?");
  failPut();
  await expect(tp2.locator("#ck-status")).toHaveText(/^Nicht gespeichert – /);
  await tp2.click("#dlg-ok");   // die Rückfrage versprach, dass weiter gespeichert wird – das stimmt nicht mehr
  expect(await confirmDialog(tp2, "Ohne Speichern zurück?", false)).toBe("Ihre Änderungen an der Checkliste gehen verloren.");
  await expect(tp2.locator("#tv-analog")).toBeVisible();
  await expect(tp2.locator("#ck-1")).toHaveValue("Gleich scheitert das Speichern");
  await expect(tp2.locator("#ck-1")).toHaveJSProperty("readOnly", false);
  await tp2.unroute(ckRoute);
  // Das PDF anhalten: die Kompression seiner Inhalte wartet (die Bilder liegen schon im Speicher der Seite)
  await tp2.evaluate(() => {
    const Orig = window.CompressionStream;
    let go;
    const gate = new Promise((r) => { go = r; });
    window.__pdfGo = go; window.__pdfWaits = 0;
    window.CompressionStream = class {
      constructor(f) {
        window.__pdfWaits++;
        const c = new Orig(f);
        this.writable = c.writable;
        this.readable = c.readable.pipeThrough(new TransformStream({ async transform(ch, ctl) { await gate; ctl.enqueue(ch); } }));
      }
    };
  });
  const dl4 = tp2.waitForEvent("download");
  await tp2.click("#ck-save");
  await expect.poll(() => tp2.evaluate(() => window.__pdfWaits)).toBeGreaterThan(0);   // gespeichert, das PDF entsteht
  await expect(tp2.locator("#ck-status")).toHaveText(/^Gespeichert\. /);
  await expect(tp2.locator("#ck-1")).toHaveJSProperty("readOnly", true);
  await tp2.evaluate(() => window.__pdfGo());
  await dl4;
  await expect(tp2.locator("#ck-1")).toHaveJSProperty("readOnly", false);
  expect((await (await request.get(`/api/sheet/${code}/checklist`)).json()).tasks[0].points).toEqual(["Gleich scheitert das Speichern"]);
  await closePage(t2);

  // aufräumen: Blatt löschen – die Checkliste verschwindet mit
  await tp.click("#ck-back");
  await expect(tp.locator("#tv-overview")).toBeVisible();
  await tp.click("#t-del-sheet");
  await confirmDialog(tp, "Feibeitsblatt löschen?");
  await expect(tp.locator("#t-list-status")).toHaveText("Feibeitsblatt gelöscht.");
  expect(await d1Query(`SELECT sheet_code FROM sheet_checklists WHERE sheet_code='${code}'`)).toEqual([]);
  await closePage(t);
});

test("7l Tippzeiten und Ablauf-Kasten: Schüler:in tippt (langsam), fügt per Wortvorschlag ein und füllt eine Tabelle → Werte je Zeichen im Zwischenstand, auch nach Neuladen vor und nach dem KI-Feedback; nie an die KI; Erstversuch und Abgabe tragen sie verschlüsselt; der Kasten zeigt den aktuellen Schritt; 413 → einmal ohne Messung; Lehrkraft sieht Textmarker, Rot-Anteile (ab 50 % „hoch“, auch in der Gesamtzeile) beim Erstversuch, bei der Abgabe, ohne KI-Feedback und bei einem ausgeblendeten älteren Erstversuch (lang: Gelb und Grün zusammengefasst), Legende, Hinweis und „Färbung aus“ (auch nach einem Neubau der Details); Blatt nur mit Weltkarten ohne Tippzeiten-Kasten", async ({ browser, request }) => {
  const t = await openPage(browser);
  const tp = t.page;
  await teacherLogin(tp, PW);
  // Schlüssel der Lehrkraft zum Entschlüsseln dessen, was der Browser sendet (wie die Lehrkraft-Seite, nur in Node)
  const teacher = JSON.parse((await d1Query("SELECT value FROM settings WHERE key='teacher'"))[0].value);
  const priv = await openPrivateKey((await deriveTeacherKeys(PW, teacher.kdf)).encKey, teacher.encPrivateKey);
  await tp.click("#t-new");
  await tp.fill("#b-title", "Tippzeiten");
  await tp.fill("#bq-1", "Schreibe einen kurzen Satz.");
  await tp.fill("#bs-1", "- Ein Satz");
  await tp.fill("#bq-2", "Erkläre einen Begriff.");
  await tp.fill("#bs-2", "- Haus");
  await tp.selectOption("#bt-2", "table");
  await tp.fill("#bc-2", "Begriff; Erklärung");
  await tp.fill("#br-2", "2");
  await tp.click("#b-gen");
  await expect(tp.locator("#b-result")).toBeVisible();
  const shown = (await tp.locator("#b-res-code").textContent()).trim(), code = shown.replace("-", "");
  const rowsOf = () => d1Query(`SELECT id, stage, attempt, envelope FROM submissions WHERE sheet_code='${code}' ORDER BY id`);

  /* ---------- Schüler:in 1 ---------- */
  const s = await openPage(browser);
  const { page } = s;
  const logTypes = () => page.evaluate(() => { window.__types = []; document.addEventListener("input", (e) => window.__types.push(e.inputType + ":" + (e.data || "").length), true); });
  await logTypes();
  await enterCode(page, shown);
  await fillPerson(page, { vorname: "tim", nachname: "ti", geb: "--01-02", klasse: "7a" });
  // Ablauf-Kasten: fünf Schritte, der erste aktuell (fett, aria-current), zwischen Kopf und Aufgaben im Fluss des Blattes
  const steps = page.locator("#ed-steps-list li"), cur = page.locator("#ed-steps-list li.cur");
  await expect(page.locator("#ed-steps-h")).toHaveText("So gehst du vor");
  await expect(steps).toHaveText(STEPS_AI);
  await expect(steps.nth(0)).toHaveAttribute("aria-current", "step");
  await expect(page.locator("#ed-steps-list li[aria-current]")).toHaveCount(1);
  await expect(page.locator("#a-1")).toBeFocused();
  expect(await page.evaluate(() => {
    const e = document.getElementById("ed-steps");
    return { pos: getComputedStyle(e).position, prev: e.previousElementSibling.className, next: e.nextElementSibling.id,
      weight: getComputedStyle(document.querySelector("#ed-steps-list li.cur")).fontWeight, top: document.getElementById("paperwrap").scrollTop };
  })).toEqual({ pos: "static", prev: "sheet-head", next: "tasks", weight: "700", top: 0 });   // beim Öffnen nicht weggescrollt
  const moved = await page.evaluate(() => {
    const w = document.getElementById("paperwrap"), e = document.getElementById("ed-steps"), y0 = e.getBoundingClientRect().top;
    w.scrollTop = 200; const d = w.scrollTop, y1 = e.getBoundingClientRect().top; w.scrollTop = 0;
    return { d, dy: y0 - y1 };
  });
  expect(moved.d).toBeGreaterThan(0);
  expect(moved.dy).toBeCloseTo(moved.d, 0);   // scrollt mit dem Blatt (weder sticky noch fixed)

  // Tippen mit Pausen (grün), ein Wortvorschlag in einem Zug (erstes Zeichen gemessen, der Rest 0 ms = rot), Tabelle
  await page.click("#a-1");
  await page.keyboard.type("Ich tippe ", { delay: 120 });
  await page.waitForTimeout(150);
  await page.keyboard.insertText("Wortvorschlag");
  await page.keyboard.type(" ja", { delay: 120 });
  const cells = page.locator("#a-2 textarea.tcell:not(.measure)");
  await cells.nth(0).click(); await page.waitForTimeout(150);
  await page.keyboard.type("Haus", { delay: 120 });
  await cells.nth(1).click(); await page.waitForTimeout(150);
  await page.keyboard.insertText("Gebäude");
  const types = await page.evaluate(() => window.__types);
  expect(types).toContain("insertText:13");   // so lässt sich ein Fehlschlag deuten (Eingabeart und Länge je Ereignis)
  expect(types).toContain("insertText:7");
  const A1 = "Ich tippe Wortvorschlag ja", A1b = A1 + " weiter", A1c = A1b + " Ende", A2 = "Begriff | Erklärung\nHaus | Gebäude";
  const rep = (v, n) => Array(n).fill(v), codesOf = (b) => Array.from(Buffer.from(b, "base64"));
  const EXP1 = [71, 71, 71, 255, 71, 71, 71, 71, 71, 255, 71, ...rep(0, 12), 255, 71, 71], W = [255, ...rep(71, 6)], E = [255, ...rep(71, 4)];
  const EXP2 = [...rep(255, 20), 71, 71, 71, 71, 255, 255, 255, 71, ...rep(0, 6)];
  const draftOf = (pg) => pg.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith("feibeitsblatt:draft:")); return k ? JSON.parse(localStorage.getItem(k)) : null; });
  const draftWhen = async (pred, pg = page) => { await expect.poll(async () => { const d = await draftOf(pg); return !!d && pred(d); }, { timeout: 10_000 }).toBe(true); return draftOf(pg); };
  let d = await draftWhen((x) => x.answers[0] === A1 && x.answers[1] === A2);
  if (TT_KEEP) {
    expect(codesOf(d.typing.answers[0])).toEqual(EXP1);
    expect(codesOf(d.typing.answers[1])).toEqual(EXP2);   // Kopf, „ | “ und Zeilenumbruch ohne Messung (255)
    expect(d.typing.first).toBeNull();
    // Neuladen: die Werte bleiben (eingefroren), ein neues Zeichen dahinter gilt als Pause
    await page.reload();
    await logTypes();
    await page.click("#resume-btn");
    await expect(page.locator("#screen-editor")).toHaveClass(/active/);
    await typeAt(page, "#a-1", " weiter", { delay: 120 });
    d = await draftWhen((x) => x.answers[0] === A1b);
    expect(codesOf(d.typing.answers[0])).toEqual([...EXP1, ...W]);
    expect(codesOf(d.typing.answers[1])).toEqual(EXP2);
  } else {   // Schalter aus: nur im Arbeitsspeicher – nach Neuladen wäre der Text „ohne Messung“, deshalb hier ohne Neuladen
    expect(d.typing).toBeUndefined();
    await typeAt(page, "#a-1", " weiter", { delay: 120 });
  }

  // KI-Feedback: während die Anfrage läuft, ist Schritt 2 aktuell, danach Schritt 3; an die KI gehen nur die Texte
  let releaseFb; const fbHeld = new Promise((r) => { releaseFb = r; });
  await page.route("**/api/feedback", async (route) => { await fbHeld; await route.continue(); });
  await page.click("#fb-btn");
  await confirmDialog(page, "KI-Feedback anfordern?");
  await expect(cur).toHaveText(STEPS_AI[1]);
  await expect(steps.nth(1)).toHaveAttribute("aria-current", "step");
  releaseFb();
  await expect(page.locator("#t-1 .fbbox")).toBeVisible({ timeout: 60_000 });
  await page.unroute("**/api/feedback");
  await expect(cur).toHaveText(STEPS_AI[2]);
  await expect(page.locator("#ed-steps-list li[aria-current]")).toHaveCount(1);
  const fb1 = await s.calls((e) => e.path === "/api/feedback");
  expect(fb1).toHaveLength(1);
  expect(Object.keys(JSON.parse(fb1[0].reqBody)).sort()).toEqual(["answers", "code", "recipients"]);
  expect(JSON.parse(fb1[0].reqBody).answers).toEqual([A1b, A2]);
  expect(fb1[0].reqBody).not.toContain("typing");

  // Erstversuch (im Hintergrund gesendet): erst seine Zeile in D1 abwarten, dann den gespeicherten Umschlag entschlüsseln – derselbe
  // Inhalt wie gesendet; Tippzeiten der ersten Fassung, final null
  const sealed = async (stage) => {
    const c = (await s.calls((e) => e.path === "/api/submit" && e.status === 200)).map((e) => JSON.parse(e.reqBody)).filter((b) => b.stage === stage);
    return c.length ? openEnvelope(priv, c.at(-1).envelope) : null;
  };
  await expect.poll(async () => (await rowsOf()).map((x) => x.stage), { timeout: 30_000 }).toEqual(["first"]);
  const [row1] = await rowsOf();
  expect(Object.keys(JSON.parse(row1.envelope)).sort()).toEqual(["ct", "ek", "iv", "v"]);   // beim Server nur der Umschlag
  const first = await openEnvelope(priv, JSON.parse(row1.envelope));
  await expect.poll(async () => !!(await sealed("first")), { timeout: 30_000 }).toBe(true);
  expect(await sealed("first")).toEqual(first);
  expect(first.stage).toBe("first");
  expect(first.answers).toEqual([{ first: A1b, final: null }, { first: A2, final: null }]);
  expect(first.typing.v).toBe(1);
  expect(first.typing.answers.map((a) => a.final)).toEqual([null, null]);
  expect(codesOf(first.typing.answers[0].first)).toEqual([...EXP1, ...W]);
  expect(codesOf(first.typing.answers[1].first)).toEqual(EXP2);
  // die Lehrkraft sieht den Erstversuch: nur die erste Fassung mit ihrem Rot-Anteil (zweite Spalte „noch nicht überarbeitet“)
  const ZERO = "Fast alle roten Zeichen kamen zusammen mit anderen in einem Zug (z. B. Wortvorschlag, Wischen, Autokorrektur, Diktat oder ein übernommener Korrekturvorschlag des Browsers).";
  await tp.click("#b-res-back");
  await expect(tp.locator("#t-sel-code")).toHaveText(shown);
  await expect(tp.locator("#t-subs-sum")).toHaveText("1 Erstversuch ohne Überarbeitung");
  await expect(tp.locator("#t-tt")).toBeVisible();
  await tp.locator("#t-subs-body tr.main").first().click();
  const detF = tp.locator("#t-subs-body tr.details:visible"), dtF = (k) => detF.locator(".dtask").nth(k);
  await expect(detF.locator(".dtt-sum")).toHaveText("Tippzeiten – Rot-Anteil über alle Aufgaben: erste Fassung 45 % (von 40 Zeichen)");
  await expect(dtF(0).locator("table.cmp tbody td")).toHaveText([A1b, "(noch nicht überarbeitet)"]);
  await expect(dtF(0).locator("table.cmp tbody td").first().locator(".tt-r")).toHaveText(["ortvorschlag"]);
  await expect(dtF(0).locator(".dtt")).toHaveText("Tippzeiten – Rot-Anteil: erste Eingabe 41 % (von 29 Zeichen)");
  await expect(dtF(1).locator(".dtt")).toHaveText("Tippzeiten – Rot-Anteil: erste Eingabe 55 % (von 11 Zeichen) – hoch. " + ZERO);
  await expect(dtF(1).locator(".dtt .tt-high")).toHaveText(["erste Eingabe 55 % (von 11 Zeichen) – hoch"]);
  if (TT_KEEP) {
    // Neuladen nach dem KI-Feedback: die erste Fassung behält ihre Werte (Abgabe nach „Weiterschreiben“)
    d = await draftWhen((x) => x.firstSent === true && Array.isArray(x.typing && x.typing.first));
    expect(d.typing.first).toEqual(first.typing.answers.map((a) => a.first));
    await page.reload();
    await page.click("#resume-btn");
    await expect(page.locator("#screen-editor")).toHaveClass(/active/);
    await expect(cur).toHaveText(STEPS_AI[2]);
    await typeAt(page, "#a-1", " Ende", { delay: 120 });
    d = await draftWhen((x) => x.answers[0] === A1c);
    expect(d.typing.first).toEqual(first.typing.answers.map((a) => a.first));
  } else await typeAt(page, "#a-1", " Ende", { delay: 120 });

  // Abgabe: während des Sendens ist „Abgeben“ der aktuelle Schritt; der Erstversuch geht ungehindert durch
  let releaseSub; const subHeld = new Promise((r) => { releaseSub = r; });
  await page.route("**/api/submit", async (route) => { if (JSON.parse(route.request().postData() || "{}").stage === "final") await subHeld; await route.continue(); });
  await page.click("#submit-btn");
  await confirmDialog(page, "Jetzt abgeben?");
  await expect(cur).toHaveText("Abgeben");
  await expect(steps.nth(3)).toHaveAttribute("aria-current", "step");
  await expect(page.locator("#ed-steps-list li[aria-current]")).toHaveCount(1);
  releaseSub();
  await expect(page.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await expect(page.locator("#ed-steps-list li")).toHaveCount(0);   // Schreibfläche geleert (gemeinsam genutzte Geräte)
  // die Abgabe ersetzt den Erstversuch (gleiche Kennung, dieselbe Zeile); gespeichert ist genau das Gesendete (die zweite Rückmeldung
  // kann im Hintergrund schon nachgereicht sein – unten genauer)
  const rows2 = await rowsOf();
  expect(rows2.map((x) => [x.id, x.stage, x.attempt])).toEqual([[row1.id, "final", row1.attempt]]);
  const noFb2 = (x) => { const y = { ...x }; delete y.feedback2; return y; };
  const fin = await sealed("final");
  expect(noFb2(await openEnvelope(priv, JSON.parse(rows2[0].envelope)))).toEqual(fin);
  expect(fin.answers).toEqual([{ first: A1b, final: A1c }, { first: A2, final: A2 }]);
  expect(fin.answers.every((a) => typeof a.first === "string" && typeof a.final === "string")).toBe(true);
  expect(fin.typing.v).toBe(1);
  expect(fin.typing.answers[0].first).toBe(first.typing.answers[0].first);
  expect(codesOf(fin.typing.answers[0].final)).toEqual([...EXP1, ...W, ...E]);
  expect(fin.typing.answers[1].first).toBe("=");   // Tabelle unverändert: gleiche Werte, gleicher Text
  expect(codesOf(fin.typing.answers[1].final)).toEqual(EXP2);
  // die zweite KI-Rückmeldung bekommt wieder nur Texte
  await expect.poll(async () => (await s.calls((e) => e.path === "/api/feedback")).length, { timeout: 30_000 }).toBe(2);
  const fb2 = (await s.calls((e) => e.path === "/api/feedback"))[1];
  expect(Object.keys(JSON.parse(fb2.reqBody)).sort()).toEqual(["answers", "code", "only", "recipients"]);
  expect(fb2.reqBody).not.toContain("typing");
  // … und geht danach verschlüsselt an die Lehrkraft: genau die angenommene Abgabe + feedback2 (nur Aufgabe 1 wurde geändert) –
  // die Tippzeiten bleiben dabei erhalten
  await expect.poll(async () => !!(await sealed("feedback2")), { timeout: 30_000 }).toBe(true);
  const fb2Sent = await sealed("feedback2");
  expect(noFb2(fb2Sent)).toEqual(fin);
  expect(fb2Sent.typing).toEqual(fin.typing);
  expect(fb2Sent.feedback2.results[0].covered.length + fb2Sent.feedback2.results[0].missing.length).toBeGreaterThan(0);
  expect(fb2Sent.feedback2.results[1]).toBeNull();   // die Tabelle blieb unverändert: es gilt das erste Feedback
  const fb2Body = (await s.calls((e) => e.path === "/api/submit" && e.status === 200)).map((e) => JSON.parse(e.reqBody)).find((b) => b.stage === "feedback2");
  expect([fb2Body.attempt, Object.keys(fb2Body).sort()]).toEqual([row1.attempt, ["attempt", "code", "envelope", "receivedAt", "stage"]]);
  const rows3 = await rowsOf();
  expect(rows3.map((x) => [x.id, x.stage, x.attempt])).toEqual([[row1.id, "final", row1.attempt]]);
  expect(await openEnvelope(priv, JSON.parse(rows3[0].envelope))).toEqual(fb2Sent);
  // die Lösungs-PDF (aus dem Arbeitsspeicher der Bestätigungsseite) enthält Texte, nie Tippzeiten
  await expect(page.locator("#done-fb-list .fbbox")).not.toHaveCount(0, { timeout: 30_000 });
  const [sdl] = await Promise.all([page.waitForEvent("download"), page.click("#done-pdf")]);
  const sol = await readFile(await sdl.path());
  expect(pdfShownText(sol)).toContain(A1c);
  for (const b of [fin.typing.answers[0].first, fin.typing.answers[0].final, fin.typing.answers[1].final]) expect(sol.toString("latin1")).not.toContain(b);
  expect(sol.toString("latin1")).not.toContain("typing");   // (der Titel des Blattes heißt „Tippzeiten“)
  await closePage(s);

  /* ---------- Schüler:in 2: der Server lehnt die erste Abgabe als zu groß ab → einmal dieselbe Nutzlast ohne Tippzeiten ---------- */
  const s2 = await openPage(browser);
  const p2 = s2.page, bodies = [];
  await p2.route("**/api/submit", async (route) => {
    bodies.push(route.request().postData());
    if (bodies.length === 1) return route.fulfill({ status: 413, contentType: "application/json", body: JSON.stringify({ ok: false, code: "too_large", error: "Die Abgabe ist zu groß." }) });
    return route.continue();
  });
  await enterCode(p2, shown);
  await fillPerson(p2, { vorname: "uli", nachname: "ul", geb: "--03-04", klasse: "7a" });
  await typeAt(p2, "#a-1", "Kurz", { delay: 120 });
  // Neuladen (in beiden Stellungen des Schalters): mit TT_KEEP_IN_DRAFT behält „Kurz“ seine Werte, ohne gilt es danach als
  // „ohne Messung“ (255, nie rot) – neu Getipptes wird weiter gemessen
  const d2 = await draftWhen((x) => x.answers[0] === "Kurz", p2);
  if (TT_KEEP) expect(codesOf(d2.typing.answers[0])).toEqual([71, 71, 71, 71]);
  else {
    expect(d2.typing).toBeUndefined();
    // ein Stand aus der Zeit mit Schalter an (Tippzeiten im Zwischenstand) – nach dem Speichern beim Verlassen der Seite nachgestellt
    await p2.evaluate(() => window.addEventListener("beforeunload", () => {
      const k = Object.keys(localStorage).find((x) => x.startsWith("feibeitsblatt:draft:")), d = JSON.parse(localStorage.getItem(k));
      d.typing = { v: 1, answers: ["R0dHRw==", ""], first: null }; localStorage.setItem(k, JSON.stringify(d)); sessionStorage.setItem("tt-t", String(d.t));
    }));
  }
  await p2.reload();
  if (!TT_KEEP) {   // … beim Laden der Seite sind die Tippzeiten weg, Text und Zeitpunkt bleiben (auch ohne „Weiterschreiben“)
    const d2b = await draftOf(p2);
    expect(d2b.typing).toBeUndefined();
    expect([d2b.answers, String(d2b.t)]).toEqual([["Kurz", ""], await p2.evaluate(() => sessionStorage.getItem("tt-t"))]);
  }
  await p2.click("#resume-btn");
  await expect(p2.locator("#screen-editor")).toHaveClass(/active/);
  await expect(p2.locator("#a-1")).toHaveValue("Kurz");
  await typeAt(p2, "#a-1", " da", { delay: 120 });
  await draftWhen((x) => x.answers[0] === "Kurz da", p2);
  await p2.click("#submit-btn");
  await confirmDialog(p2, "Ohne KI-Feedback abgeben?");
  await expect(p2.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  expect(bodies).toHaveLength(2);
  const e1 = await openEnvelope(priv, JSON.parse(bodies[0]).envelope), e2 = await openEnvelope(priv, JSON.parse(bodies[1]).envelope);
  expect(e1.answers).toEqual([{ first: "Kurz da", final: "Kurz da" }, { first: "", final: "" }]);
  expect(e1.typing.answers.map((a) => a.first)).toEqual(["=", "="]);   // ohne KI-Feedback: erste = abgegebene Fassung
  expect(codesOf(e1.typing.answers[0].final)).toEqual([...(TT_KEEP ? [71, 71, 71, 71] : [255, 255, 255, 255]), 255, 71, 71]);
  expect(e1.typing.answers[1].final).toBe("");   // leere Tabelle: leerer Text, keine Werte
  expect(e2.typing).toEqual({ v: 1, omitted: "too_large" });
  const strip = (x) => { const y = { ...x }; delete y.typing; return y; };
  expect(strip(e2)).toEqual(strip(e1));
  await closePage(s2);

  /* ---------- Schüler:in 3: ohne KI-Feedback, ein Wort per Wortvorschlag → eine Fassung, Rot-Anteil hoch (auch über alle Aufgaben) ---------- */
  const s3 = await openPage(browser);
  const p3 = s3.page;
  await enterCode(p3, shown);
  await fillPerson(p3, { vorname: "vic", nachname: "vo", geb: "--05-06", klasse: "7a" });
  await p3.click("#a-1");
  await p3.keyboard.insertText("Vorschlag");
  await p3.click("#submit-btn");
  await confirmDialog(p3, "Ohne KI-Feedback abgeben?");
  await expect(p3.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await closePage(s3);

  // ein älterer Erstversuch von Schüler:in 1 (z. B. auf einem anderen Gerät), sehr lang und im üblichen Tempo getippt: mehr Farbwechsel,
  // als die Ansicht zeigt → Gelb und Grün zusammengefasst (grün) mit Hinweis, nie „ohne Messung“
  const pub = (await (await request.get("/api/sheet/" + code)).json()).sheet.publicKey;
  const LONG = "ab".repeat(1100), nowIso = new Date().toISOString();
  const olderPayload = { v: 1, stage: "first", sheetCode: code, sheetTitle: "Tippzeiten", person: { vorname: "Tim", nachname: "Ti", geburtsdatum: "--01-02", klasse: "7a" },
    answers: [{ first: LONG, final: null }, { first: "", final: null }], feedback: [{ covered: ["Ein Satz"], missing: [] }, { covered: [], missing: ["Haus"] }],
    feedbackAt: nowIso, submittedAt: null,
    typing: { v: 1, answers: [{ first: Buffer.from(Array.from(LONG, (_, x) => (x % 2 ? 30 : 71))).toString("base64"), final: null }, { first: "", final: null }] } };
  expect((await request.post("/api/submit", { data: { code, stage: "first", attempt: "00112233445566aa", envelope: await makeEnvelope(pub, olderPayload) } })).status()).toBe(200);

  /* ---------- Lehrkraft: Textmarker, Rot-Anteile, Legende, Hinweis, „Färbung aus“ ---------- */
  await tp.click("#t-refresh");
  await expect(tp.locator("#t-sel-code")).toHaveText(shown);
  await expect(tp.locator("#t-subs-sum")).toHaveText("3 Abgaben · 1 älterer Erstversuch von Schüler:innen, die inzwischen abgegeben haben, wird nicht angezeigt");
  await expect(tp.locator("#t-tt")).toBeVisible();
  await expect(tp.locator("#t-tt-legend")).toHaveText("Tippzeiten in den aufgeklappten Lösungen (je Zeichen der Abstand zum vorangehenden Zeichen): rot (unterstrichen) = höchstens 15 ms oder zusammen mit anderen Zeichen in einem Zug eingegeben (z. B. Wortvorschlag, Autokorrektur, Diktat, ein übernommener Korrekturvorschlag des Browsers) · gelb = über 15 bis 70 ms · grün = mehr als 70 ms oder erstes Zeichen · ohne Färbung = Text ohne Messung (" + (TT_KEEP ? "z. B. ältere Stände oder nach einem Widerspruch" : "z. B. ältere Stände, nach einem Widerspruch oder vor einem Neuladen der Seite geschrieben – der Zwischenstand speichert keine Tippzeiten") + "); Leerzeichen zählen nicht mit. Den Rot-Anteil nennen die Details unter jeder Aufgabe (ab 50 % mit „hoch“).");
  await expect(tp.locator("#t-tt-hint")).toHaveText("Die Färbung zeigt nur, wie schnell Zeichen eingegeben wurden – nicht, wer sie verfasst hat. Rot entsteht z. B. durch Wortvorschläge, Wischen, Autokorrektur oder Diktat der Tastatur, durch einen per Rechtsklick übernommenen Korrekturvorschlag des Browsers, durch sehr schnelles Tippen oder gedrückt gehaltene Tasten, und wer sich technisch auskennt, kann die Messung verändern. Nutzen Sie die Färbung " + TT_USE + ". Schüler:innen können der Messung widersprechen: Die Kurzfassung des Datenschutzhinweises nennt die Messung in einem Satz, im ausführlichen Hinweis („Alle Informationen zum Datenschutz“) steht im Abschnitt „" + TT_OBJ_HEAD + "“ der Schalter „" + TT_SWITCH + "“. Nach einem Widerspruch steht in den Details „ohne Messung (widersprochen)“ – das ist ihr Recht und kein Anlass für einen Verdacht.");
  const off = tp.locator("#t-tt-off");
  await expect(off).toHaveAttribute("aria-pressed", "false");
  const mains = tp.locator("#t-subs-body tr.main");
  await expect(mains).toHaveCount(3);
  await expect(mains.nth(0).locator("td:not(.arrowcol)")).toHaveText(["Ti", "Tim", "02.01.", "7a"]);
  expect(await tp.locator("#t-subs-body").textContent()).not.toContain("%");   // der Rot-Anteil steht nie in der Liste
  await mains.nth(0).click();
  const det = tp.locator("#t-subs-body tr.details:visible");
  await expect(det.locator(".dtt-sum")).toHaveText("Tippzeiten – Rot-Anteil über alle Aufgaben: erste Fassung 45 % (von 40 Zeichen) · abgegebene Fassung 41 % (von 44 Zeichen)");
  const dt = (k) => det.locator(".dtask").nth(k);
  // Aufgabe 1: der Text der Zellen bleibt genau die Antwort; grün getippt, der Wortvorschlag rot (bis auf sein erstes Zeichen)
  const td1 = dt(0).locator("table.cmp tbody td");
  expect(await td1.nth(0).textContent()).toBe(A1b);
  expect(await td1.nth(1).textContent()).toBe(A1c);
  await expect(td1.nth(0).locator(".tt-g")).toHaveText(["Ich tippe W", "ja weiter"]);
  await expect(td1.nth(1).locator(".tt-g")).toHaveText(["Ich tippe W", "ja weiter Ende"]);
  await expect(td1.nth(1).locator(".tt-r")).toHaveText(["ortvorschlag"]);
  await expect(dt(0).locator(".tt-y")).toHaveCount(0);
  await expect(dt(0).locator(".dtt")).toHaveText("Tippzeiten – Rot-Anteil: erste Eingabe 41 % (von 29 Zeichen) · nach dem KI-Feedback 36 % (von 33 Zeichen)");
  await expect(dt(0).locator(".dtt .tt-high")).toHaveCount(0);
  // Aufgabe 2 (Tabelle): je Zelle gefärbt, der Kopf nie; Rot-Anteil hoch – fast alles in einem Zug
  await expect(dt(1).locator("table.anstable td")).toHaveText(["Haus", "Gebäude", "Haus", "Gebäude"]);
  await expect(dt(1).locator("table.anstable td .tt-r")).toHaveText(["ebäude", "ebäude"]);
  await expect(dt(1).locator("table.anstable td .tt-g")).toHaveText(["Haus", "G", "Haus", "G"]);
  await expect(dt(1).locator("table.anstable th span")).toHaveCount(0);
  await expect(dt(1).locator(".dtt")).toHaveText("Tippzeiten – Rot-Anteil: erste Eingabe 55 % (von 11 Zeichen) – hoch · nach dem KI-Feedback 55 % (von 11 Zeichen) – hoch. " + ZERO);
  await expect(dt(1).locator(".dtt .tt-high")).toHaveText(["erste Eingabe 55 % (von 11 Zeichen) – hoch", "nach dem KI-Feedback 55 % (von 11 Zeichen) – hoch"]);
  expect(await dt(1).locator(".dtt .tt-high").first().evaluate((e) => getComputedStyle(e).color)).toBe(RED);
  // der ausgeblendete ältere Erstversuch: gemessen, aber zu viele Wechsel für die Anzeige → grün zusammengefasst, mit Hinweis
  const older = det.locator("details.dolder");
  await expect(older.locator("summary")).toHaveText("1 älterer Erstversuch dieser Person (in der Liste ausgeblendet)");
  await older.locator("summary").click();
  const olderBox = older.locator(".detbox.older");
  await expect(older.locator(".detbox.older > .dtt-sum")).toHaveText("Tippzeiten – Rot-Anteil über alle Aufgaben: erste Fassung 0 % (von 2.200 Zeichen)");
  await expect(olderBox.locator(".dtask").nth(0).locator(".dtt")).toHaveText("Tippzeiten – Rot-Anteil: erste Eingabe 0 % (von 2.200 Zeichen). Wegen der Länge sind Gelb und Grün in der Färbung zusammengefasst (beides grün).");
  await expect(olderBox.locator(".dtask").nth(0).locator("table.cmp tbody td").first().locator(".tt-g")).toHaveText([LONG]);
  await expect(olderBox.locator(".tt-y, .tt-r")).toHaveCount(0);
  await expect(olderBox.locator(".dtask").nth(1).locator(".dtt")).toHaveCount(0);   // leere Antwort: keine Zeile
  await older.locator("summary").click();
  const red = dt(0).locator(".tt-r").first();
  const look = (loc) => loc.evaluate((e) => { const c = getComputedStyle(e); return [c.backgroundColor, c.textDecorationLine]; });
  expect(await look(red)).toEqual(["rgb(255, 196, 189)", "underline"]);   // Rot nicht nur über die Farbe: unterstrichen
  // „Färbung aus“: gedrückt (sichtbar gefüllt), alle Details ohne Farben, der Text bleibt; die Legende bleibt farbig; übersteht Aktualisieren
  await off.click();
  await expect(off).toHaveAttribute("aria-pressed", "true");
  await expect(tp.locator("#t-subs")).toHaveClass(/\btt-off\b/);
  await tp.mouse.move(0, 0);   // ohne Hover; die Farbe geht mit einem Übergang über
  await expect(off).toHaveCSS("background-color", "rgb(34, 31, 26)");
  expect(await look(red)).toEqual(["rgba(0, 0, 0, 0)", "none"]);
  expect(await td1.nth(1).textContent()).toBe(A1c);
  expect(await tp.locator("#t-tt-legend .tt-r").evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(255, 196, 189)");
  // aufgeklappte Details werden neu gebaut (renderRetentionHint – hier über „Datenschutz und Löschfrist“ und zurück): auch dann ohne Farben
  const builtBefore = await dt(0).elementHandle();
  await tp.click("#t-privacy");
  await expect(tp.locator("#pv-days")).toBeEnabled();
  await tp.click("#pv-back");
  await expect(tp.locator("#t-subs")).toBeVisible();
  expect(await builtBefore.evaluate((e) => e.isConnected)).toBe(false);   // wirklich neu gebaut
  await expect(dt(0).locator(".dtt")).toHaveCount(1);
  expect(await look(dt(0).locator(".tt-r").first())).toEqual(["rgba(0, 0, 0, 0)", "none"]);
  expect(await td1.nth(1).textContent()).toBe(A1c);
  await tp.click("#t-refresh");
  await expect(mains).toHaveCount(3);
  await expect(off).toHaveAttribute("aria-pressed", "true");
  await expect(tp.locator("#t-subs")).toHaveClass(/\btt-off\b/);
  await off.click();
  await expect(off).toHaveAttribute("aria-pressed", "false");
  await expect(tp.locator("#t-subs")).not.toHaveClass(/\btt-off\b/);
  // Schüler:in 2: Tippzeiten wegen der Größe weggelassen – ein Satz, keine Färbung
  await mains.nth(1).click();
  const det2 = tp.locator("#t-subs-body tr.details:visible").filter({ hasText: "Kurz da" });
  await expect(det2.locator(".dtt-sum")).toHaveText("Tippzeiten: nicht übermittelt – die Abgabe wäre sonst zu groß gewesen.");
  await expect(det2.locator(".dtt")).toHaveCount(0);
  await expect(det2.locator(".tt-r, .tt-y, .tt-g")).toHaveCount(0);
  expect(await det2.locator("table.cmp.one tbody td").first().textContent()).toBe("Kurz da");
  // Schüler:in 3 (ohne KI-Feedback): eine Spalte, eine Zeile ohne Bezeichnung; hoch – auch die Gesamtzeile rot und fett hervorgehoben
  await mains.nth(2).click();
  const det3 = tp.locator("#t-subs-body tr.details:visible").filter({ hasText: "Vorschlag" });
  await expect(det3.locator("table.cmp.one tbody td").first().locator(".tt-r")).toHaveText(["orschlag"]);
  await expect(det3.locator("table.cmp.one tbody td").first().locator(".tt-g")).toHaveText(["V"]);
  await expect(det3.locator(".dtask").nth(0).locator(".dtt")).toHaveText("Tippzeiten – Rot-Anteil: 89 % (von 9 Zeichen) – hoch. " + ZERO);
  await expect(det3.locator(".dtask").nth(1).locator(".dtt")).toHaveCount(0);
  await expect(det3.locator(".dtt-sum")).toHaveText("Tippzeiten – Rot-Anteil über alle Aufgaben: 89 % (von 9 Zeichen) – hoch. " + ZERO);
  const sumHigh = det3.locator(".dtt-sum .tt-high");
  await expect(sumHigh).toHaveText(["89 % (von 9 Zeichen) – hoch"]);
  expect(await sumHigh.evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).fontWeight])).toEqual([RED, "700"]);
  // Blatt nur mit Weltkarten (hier per Antwort des Servers nachgestellt): dort wird nie gemessen – kein Tippzeiten-Kasten, keine Zeilen
  const sheetUrl = "**/api/teacher/sheets/" + code;
  const mapOnly = async (route) => {
    const res = await route.fetch(), j = await res.json();
    j.sheet.tasks = j.sheet.tasks.map((x) => ({ ...x, answer: { type: "map", map: "world", items: [{ id: "x", label: "X", countries: [{ id: "276", name: "Deutschland" }] }] } }));
    await route.fulfill({ response: res, json: j });
  };
  await tp.route(sheetUrl, mapOnly);
  await tp.locator("#t-sheets-body tr", { hasText: shown }).click();
  await expect(mains).toHaveCount(3);
  await expect(tp.locator("#t-subs-legend")).toBeVisible();
  await expect(tp.locator("#t-tt")).toBeHidden();
  await mains.nth(0).click();
  await expect(tp.locator("#t-subs-body tr.details:visible .dtask")).toHaveCount(2);
  await expect(tp.locator("#t-subs-body .dtt-sum, #t-subs-body .dtt, #t-subs-body .tt-r, #t-subs-body .tt-g")).toHaveCount(0);
  await tp.unroute(sheetUrl, mapOnly);
  await tp.locator("#t-sheets-body tr", { hasText: shown }).click();
  await expect(mains).toHaveCount(3);
  await expect(tp.locator("#t-tt")).toBeVisible();
  // … und bei den Schüler:innen: weder die Kurzfassung (kein TT_SHORT) noch der ausführliche Hinweis (kein Abschnitt zum Widerspruch,
  // kein Satz zu § 25 TDDDG für die Tippzeiten, kein Schalter) nennen die Messung
  const m = await openPage(browser);
  await m.page.route("**/api/sheet/" + code, async (route) => {
    const res = await route.fetch(), j = await res.json();
    j.sheet.tasks = j.sheet.tasks.map((x) => ({ ...x, answer: { type: "map", map: "world", items: [{ id: "x", label: "X", checks: [] }] } }));
    await route.fulfill({ response: res, json: j });
  });
  await enterCode(m.page, shown);
  await chooseSingle(m.page);
  await expect(m.page.locator("#p-privacy-short")).toContainText("Auch die Rechtschreibprüfung ist freiwillig.");
  await expect(m.page.locator("#p-privacy-short")).not.toHaveText(NO_TT);
  const mfull = m.page.locator("#p-privfull");
  await mfull.locator("summary").click();
  await expect(mfull.locator("h2.privh")).toHaveText(PRIV_HEADS.filter((x) => x !== TT_OBJ_HEAD));
  await expect(mfull).not.toContainText("Tippzeit");
  await expect(mfull).not.toContainText("Zugriff auf dein Gerät");
  await expect(mfull.locator("input")).toHaveCount(0);
  await closePage(m);

  /* ---------- Schüler:in 4 und 5: die zweite Rückmeldung nachreichen – mit feedback2 zu groß bzw. es kommt nichts an ---------- */
  // fb2: Antwort des Servers je Nachreichen (n = 1, 2, …): eine Antwort per route.fulfill oder null = weiter zum Server;
  // posts: so viele Versuche, dann ist die Seite fertig (geklappt bzw. aufgegeben)
  const fb2Case = async (who, fb2, posts) => {
    const x = await openPage(browser), xp = x.page, posted = [];
    await enterCode(xp, shown);
    await fillPerson(xp, who);
    await typeAt(xp, "#a-1", "Ein Satz von " + who.vorname, { delay: 30 });
    await xp.click("#fb-btn");
    await confirmDialog(xp, "Noch nicht alles beantwortet");   // die Tabelle bleibt leer
    await expect(xp.locator("#t-1 .fbbox")).toBeVisible({ timeout: 60_000 });
    await typeAt(xp, "#a-1", " und mehr", { delay: 30 });
    await xp.route("**/api/submit", (route) => {
      const b = JSON.parse(route.request().postData());
      if (b.stage !== "feedback2") return route.continue();
      posted.push(b);
      const res = fb2(posted.length);
      return res ? route.fulfill({ status: res.status, contentType: "application/json", body: JSON.stringify(res.body) }) : route.continue();
    });
    await submit(xp);
    await expect(xp.locator("#done-fb-list .fbbox").first()).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => posted.length, { timeout: 30_000 }).toBe(posts);
    await xp.waitForTimeout(2500);   // danach kein weiterer Versuch mehr (der nächste käme nach höchstens 2 s Pause)
    expect(posted.length).toBe(posts);
    const fin = await openEnvelope(priv, JSON.parse((await x.calls((e) => e.path === "/api/submit" && e.status === 200)).map((e) => e.reqBody).find((b) => JSON.parse(b).stage === "final")).envelope);
    const sent = await Promise.all(posted.map((b) => openEnvelope(priv, b.envelope)));
    const row = (await rowsOf()).filter((x) => x.attempt === posted[0].attempt);
    expect(row.length).toBe(1);
    await closePage(x);
    return { fin, sent, posted, got: await openEnvelope(priv, JSON.parse(row[0].envelope)) };
  };
  const noTyping = (x) => { const y = { ...x }; delete y.typing; return y; };
  const ttHasValues = (t) => !!t && Array.isArray(t.answers) && t.answers.some((a) => [a.first, a.final].some((b) => typeof b === "string" && b.length > 1));
  // 4: der Umschlag mit feedback2 ist zu groß (413) → dieselbe Nutzlast ohne Tippzeit-Werte; Antworten, Feedback und Angaben bleiben
  const TOO_LARGE = { status: 413, body: { ok: false, error: "Die Abgabe ist zu groß.", code: "too_large" } };
  const c4 = await fb2Case({ vorname: "via", nachname: "vi", geb: "--04-04", klasse: "7a" }, (n) => (n === 1 ? TOO_LARGE : null), 2);
  expect(c4.sent.length).toBe(2);
  expect(ttHasValues(c4.fin.typing)).toBe(true);
  expect(c4.sent[0].typing).toEqual(c4.fin.typing);   // erst die angenommene Nutzlast unverändert + feedback2
  expect(noFb2(c4.sent[0])).toEqual(c4.fin);
  expect(c4.sent[1].typing).toEqual({ v: 1, omitted: "too_large" });   // dann ohne die Tippzeit-Werte – sonst nichts geändert
  expect(noTyping(c4.sent[1])).toEqual(noTyping(c4.sent[0]));
  expect(c4.sent[1].feedback2.results[0]).toBeTruthy();
  expect(c4.got).toEqual(c4.sent[1]);   // angekommen: mit der zweiten Rückmeldung, die Tippzeiten als „nicht übermittelt“
  // 5: das Nachreichen scheitert jedes Mal (503) → nach drei Versuchen aufgegeben; die Abgabe beim Server bleibt genau, wie sie war
  const DOWN = { status: 503, body: { ok: false, error: "Der Server ist gerade nicht erreichbar.", code: "server_error" } };
  const c5 = await fb2Case({ vorname: "wim", nachname: "wi", geb: "--05-05", klasse: "7a" }, () => DOWN, 3);
  expect(c5.sent.length).toBe(3);
  for (const x of c5.sent) expect(noFb2(x)).toEqual(c5.fin);
  expect(c5.got).toEqual(c5.fin);
  expect(ttHasValues(c5.got.typing)).toBe(true);
  // aufräumen
  await tp.click("#t-del-sheet");
  await confirmDialog(tp, "Feibeitsblatt löschen?");
  await expect(tp.locator("#t-list-status")).toHaveText("Feibeitsblatt gelöscht.");
  await closePage(t);
});

test("7m Widerspruch gegen die Tippzeit-Messung: Schalter im Datenschutzhinweis (Schreibbereich; Angaben-Bildschirm, auch einer Gruppe in der „ihr“-Form) → keine Tippzeiten mehr im Zwischenstand und in der Zwischenstand-PDF, ein schon gesendeter Erstversuch wird mit derselben Kennung ohne sie ersetzt (scheitert das, beim nächsten Öffnen; auch beim Öffnen über „Deine Angaben“), Zurücknehmen misst nur ab dann, auch während einer laufenden KI-Anfrage; gilt sofort im zweiten Tab, bleibt beim Neuladen ohne Eingabe und beim Hochladen einer älteren Zwischenstand-PDF; während des Sendens abgelehnt; Abgabe trägt optOut, die Lehrkraft sieht „ohne Messung (widersprochen)“ – auch beim Erstversuch und beim ausgeblendeten älteren Erstversuch", async ({ browser }) => {
  const t = await openPage(browser);
  const tp = t.page;
  await teacherLogin(tp, PW);
  const teacher = JSON.parse((await d1Query("SELECT value FROM settings WHERE key='teacher'"))[0].value);
  const priv = await openPrivateKey((await deriveTeacherKeys(PW, teacher.kdf)).encKey, teacher.encPrivateKey);
  await tp.click("#t-new");
  await tp.fill("#b-title", "Widerspruch");
  await tp.fill("#bq-1", "Schreibe einen kurzen Satz.");
  await tp.fill("#bs-1", "- Ein Satz");
  await tp.fill("#bq-2", "Erkläre einen Begriff.");
  await tp.fill("#bs-2", "- Haus");
  await tp.selectOption("#bt-2", "table");
  await tp.fill("#bc-2", "Begriff; Erklärung");
  await tp.fill("#br-2", "2");
  await tp.click("#b-gen");
  await expect(tp.locator("#b-result")).toBeVisible();
  const shown = (await tp.locator("#b-res-code").textContent()).trim(), code = shown.replace("-", "");
  await tp.click("#b-res-back");
  await expect(tp.locator("#t-sel-code")).toHaveText(shown);
  // gespeicherte Einträge dieses Blattes, entschlüsselt wie auf der Lehrkraft-Seite
  const rows = async () => Promise.all((await d1Query(`SELECT id, stage, attempt, envelope FROM submissions WHERE sheet_code='${code}' ORDER BY id`))
    .map(async (r) => ({ id: r.id, stage: r.stage, attempt: r.attempt, p: await openEnvelope(priv, JSON.parse(r.envelope)) })));
  const rowsOf = async (vorname) => (await rows()).filter((x) => x.p.person.vorname === vorname);
  const draftOf = (pg) => pg.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith("feibeitsblatt:draft:")); return k ? JSON.parse(localStorage.getItem(k)) : null; });
  const draftWhen = async (pg, pred) => { await expect.poll(async () => { const d = await draftOf(pg); return !!d && pred(d); }, { timeout: 10_000 }).toBe(true); return draftOf(pg); };
  const codesOf = (b) => Array.from(Buffer.from(b, "base64"));
  // Wirkung und Geltungsbereich des Schalters (aria-describedby: zwei Absätze)
  const described = (sw) => sw.evaluate((e) => [e.id, e.getAttribute("aria-describedby").split(" ").map((id) => document.getElementById(id).textContent)]);
  // Messungen in den Feldern (Textfeld und die vier Zellen der Tabelle): null = verworfen
  const ttStateOf = (pg) => pg.evaluate(() => [document.getElementById("a-1")._tt, Array.from(document.querySelectorAll("#a-2 textarea.tcell:not(.measure)"), (c) => c._tt)]);
  const NONE = [null, [null, null, null, null]];
  const ON = "Widerspruch eingetragen: Auf diesem Gerät misst diese Seite bei diesem Feibeitsblatt keine Tippzeiten mehr.";
  const ON_G = "Widerspruch eingetragen: Auf diesem Gerät misst diese Seite bei eurem Feibeitsblatt keine Tippzeiten mehr.";
  const OFF = "Widerspruch zurückgenommen: Ab jetzt misst diese Seite die Tippzeiten wieder.";
  const TAB = "Widerspruch eingetragen (in einem anderen Tab mit diesem Feibeitsblatt): Auf diesem Gerät misst diese Seite bei diesem Feibeitsblatt keine Tippzeiten mehr.";
  const LATE = "Deine Abgabe wird gerade gesendet – für sie gilt ein Widerspruch nicht mehr. Scheitert das Senden, kannst du den Haken danach setzen. " +
    "Nach der Abgabe lassen sich die Tippzeiten nur zusammen mit deiner ganzen Abgabe löschen – wende dich für einen Widerspruch dann an deine Lehrkraft oder an den Betreiber.";
  const LATE_OFF = "Deine Abgabe wird gerade gesendet – ohne Tippzeiten, wie du es eingetragen hast. Scheitert das Senden, kannst du den Haken danach entfernen.";
  const ORANGE_INK = "rgb(138, 69, 0)";   // --orange-ink: Ablehnung während des Sendens – keine Erfolgsfarbe
  // eine Anfrage anhalten, bis der Test sie freigibt (dann weiter zum Server bzw. abgebrochen)
  const hold = async (pg, path, how = "continue") => {
    let release; const held = new Promise((r) => { release = r; });
    await pg.route("**" + path, async (route) => { await held; await (how === "abort" ? route.abort() : route.continue()); });
    return () => release();
  };

  /* ---------- Schüler:in 1: KI-Feedback (Erstversuch mit Tippzeiten), dann Widerspruch im Schreibbereich ---------- */
  const s = await openPage(browser);
  const { page } = s, warns = [];
  page.on("console", (m) => { if (m.type() === "warning" && m.text().startsWith("Feibeitsblatt")) warns.push(m.text()); });
  await enterCode(page, shown);
  await fillPerson(page, { vorname: "wil", nachname: "wi", geb: "--07-08", klasse: "7a" });
  await typeAt(page, "#a-1", "Ich tippe", { delay: 120 });
  const cells = page.locator("#a-2 textarea.tcell:not(.measure)");
  await cells.nth(0).click();
  await page.keyboard.type("Haus", { delay: 120 });
  const A2 = "Begriff | Erklärung\nHaus |";
  let d = await draftWhen(page, (x) => x.answers[0] === "Ich tippe" && x.answers[1] === A2);
  if (TT_KEEP) expect(codesOf(d.typing.answers[0])).toEqual([71, 71, 71, 255, 71, 71, 71, 71, 71]);
  await requestFeedback(page);
  await expect.poll(async () => (await rows()).map((x) => x.stage), { timeout: 30_000 }).toEqual(["first"]);
  const [r1] = await rows();
  expect(r1.p.answers).toEqual([{ first: "Ich tippe", final: null }, { first: A2, final: null }]);
  expect(codesOf(r1.p.typing.answers[0].first)).toEqual([71, 71, 71, 255, 71, 71, 71, 71, 71]);
  d = await draftWhen(page, (x) => x.firstSent === true);
  if (TT_KEEP) expect(d.typing.first.map((b) => Buffer.from(b, "base64").length)).toEqual(["Ich tippe".length, A2.length]);

  // der Schalter steht im ausführlichen Hinweis unter den Aufgaben („du“), per Tastatur bedienbar; das Ersetzen scheitert erst
  let aborted = 0;
  await page.route("**/api/submit", (route) => { aborted++; return route.abort(); });
  const ed = page.locator("#privfull-ed");
  await ed.locator("summary").click();
  const sw = ed.getByRole("checkbox", { name: TT_SWITCH });
  await expect(sw).not.toBeChecked();
  expect(await described(sw)).toEqual(["privfull-ed-d-ttoff", [TT_EFFECT, TT_SCOPE]]);
  await sw.focus();
  await page.keyboard.press("Space");
  await expect(sw).toBeChecked();
  await expect(sw).toBeFocused();
  await expect(ed.locator(".ttopt-st")).toHaveText(ON);
  await expect(ed.locator(".ttopt-st")).toHaveAttribute("role", "status");
  // sofort gespeichert: keine Tippzeiten mehr, der Widerspruch und das noch fällige Ersetzen gemerkt
  d = await draftWhen(page, (x) => x.ttOptOut === true && x.ttResend === true);
  expect(d.typing).toBeUndefined();
  expect(await ttStateOf(page)).toEqual(NONE);   // Messungen in den Feldern verworfen
  await expect.poll(() => aborted, { timeout: 10_000 }).toBe(1);
  await expect.poll(() => warns.length).toBe(1);
  expect(warns[0]).toBe("Feibeitsblatt: Erstversuch ohne Tippzeiten noch nicht ersetzt – wird beim nächsten Öffnen nachgeholt.");   // leise, ohne Inhalte
  expect((await rows())[0].p.typing.answers).toBeTruthy();   // noch der alte Eintrag
  await page.unroute("**/api/submit");
  // ohne Messung weitergeschrieben: nichts gemessen, nichts gespeichert
  await typeAt(page, "#a-1", " neu", { delay: 120 });
  d = await draftWhen(page, (x) => x.answers[0] === "Ich tippe neu");
  expect(d.typing).toBeUndefined();
  expect(await ttStateOf(page)).toEqual(NONE);
  // die Zwischenstand-PDF merkt sich den Widerspruch (und das noch fällige Ersetzen) – ohne Tippzeiten
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#ed-pdf")]);
  const pdf = await readFile(await dl.path());
  const i0 = pdf.indexOf("/FbDraft 1"), d0 = pdf.indexOf("stream\n", i0) + 7, d1 = pdf.indexOf("\nendstream", d0);
  const rec = JSON.parse(pdf.subarray(d0, d1).toString("utf8"));
  expect([rec.ttOptOut, rec.ttResend, rec.typing, rec.answers[0]]).toEqual([true, true, undefined, "Ich tippe neu"]);

  // Neuladen → „Weiterschreiben“: der Schalter zeigt den Widerspruch, das Ersetzen wird nachgeholt (dieselbe Zeile, dieselbe Kennung)
  await page.reload();
  await page.click("#resume-btn");
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
  await expect.poll(async () => (await rows())[0].p.typing, { timeout: 30_000 }).toEqual({ v: 1, optOut: true });
  const [r2] = await rows();
  expect([r2.id, r2.stage, r2.attempt]).toEqual([r1.id, "first", r1.attempt]);
  expect([r2.p.answers, r2.p.feedback, r2.p.person]).toEqual([r1.p.answers, r1.p.feedback, r1.p.person]);   // sonst derselbe Erstversuch
  d = await draftWhen(page, (x) => x.ttOptOut === true && !("ttResend" in x));
  await ed.locator("summary").click();
  await expect(sw).toBeChecked();
  await expect(ed.locator(".ttopt-st")).toHaveText("");
  // die Zwischenstand-PDF auf einem anderen Gerät hochgeladen: der Widerspruch gilt dort weiter (Schalter gesetzt, nichts gemessen)
  const o = await openPage(browser);
  await o.page.setInputFiles("#start-pdf-file", { name: "stand.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(o.page.locator("#screen-editor")).toHaveClass(/active/);
  await o.page.locator("#privfull-ed summary").click();
  await expect(o.page.locator("#privfull-ed").getByRole("checkbox", { name: TT_SWITCH })).toBeChecked();
  await typeAt(o.page, "#a-1", "!", { delay: 120 });
  const od = await draftWhen(o.page, (x) => x.answers[0] === "Ich tippe neu!" && !("ttResend" in x));   // das Ersetzen ist erledigt
  expect([od.ttOptOut, od.typing]).toEqual([true, undefined]);
  await closePage(o);
  expect((await rows())[0].p.typing).toEqual({ v: 1, optOut: true });

  // zurücknehmen: ab jetzt wird wieder gemessen – der vorhandene Text bleibt „ohne Messung“ (255), auch die erste Fassung
  await sw.click();
  await expect(sw).not.toBeChecked();
  await expect(ed.locator(".ttopt-st")).toHaveText(OFF);
  await typeAt(page, "#a-1", " ja", { delay: 120 });
  d = await draftWhen(page, (x) => x.answers[0] === "Ich tippe neu ja");
  expect(d.ttOptOut).toBeUndefined();
  if (TT_KEEP) {
    expect(codesOf(d.typing.answers[0])).toEqual([...Array(13).fill(255), 255, 71, 71]);
    expect(codesOf(d.typing.answers[1]).every((c) => c === 255)).toBe(true);
    expect(d.typing.first).toEqual([null, null]);
  }
  // … und wieder widersprechen; die Abgabe trägt dann nur den Widerspruch
  await sw.click();
  await expect(sw).toBeChecked();
  await expect(ed.locator(".ttopt-st")).toHaveText(ON);
  d = await draftWhen(page, (x) => x.ttOptOut === true);
  expect(d.typing).toBeUndefined();
  // während die Abgabe gesendet wird, wirkt der Schalter nicht (die Nutzlast ist gebaut): der Haken bleibt, die Meldung sagt warum
  const go1 = await hold(page, "/api/submit");
  await page.click("#submit-btn");
  await confirmDialog(page, "Jetzt abgeben?");
  await expect(page.locator("#submit-status")).toHaveText("Deine Abgabe wird verschlüsselt und gesendet …");
  await sw.click();
  await expect(sw).toBeChecked();
  await expect(ed.locator(".ttopt-st")).toHaveText(LATE_OFF);
  expect(await ed.locator(".ttopt-st").evaluate((e) => getComputedStyle(e).color)).toBe(ORANGE_INK);
  go1();
  await expect(page.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await page.unroute("**/api/submit");
  await expect.poll(async () => (await rows()).map((x) => [x.id, x.stage]), { timeout: 30_000 }).toEqual([[r1.id, "final"]]);
  const fin = (await rows())[0].p;
  expect(fin.typing).toEqual({ v: 1, optOut: true });
  expect(fin.answers).toEqual([{ first: "Ich tippe", final: "Ich tippe neu ja" }, { first: A2, final: A2 }]);
  // an die KI gingen nie Tippzeiten (erstes Feedback und zweite Rückmeldung)
  await expect.poll(async () => (await s.calls((e) => e.path === "/api/feedback")).length, { timeout: 30_000 }).toBe(2);
  for (const c of await s.calls((e) => e.path === "/api/feedback")) expect(c.reqBody).not.toMatch(/typing|ttOptOut|optOut/);
  // die nachgereichte zweite Rückmeldung ersetzt die Abgabe – der Widerspruch bleibt dabei erhalten
  await expect.poll(async () => !!(await rows())[0].p.feedback2, { timeout: 30_000 }).toBe(true);
  const fin2 = (await rows())[0].p;
  expect(fin2.typing).toEqual({ v: 1, optOut: true });
  expect(fin2.answers).toEqual(fin.answers);
  await closePage(s);

  /* ---------- Schüler:in 2, Gerät 1: Erstversuch mit Tippzeiten → neu über „Deine Angaben“ geöffnet, Haken schon dort ---------- */
  const Z = { vorname: "zwe", nachname: "zw", geb: "--09-10", klasse: "7a" };
  const z = await openPage(browser);
  const zp = z.page;
  await enterCode(zp, shown);
  await fillPerson(zp, Z);
  await typeAt(zp, "#a-1", "Zwei", { delay: 120 });
  await zp.click("#fb-btn");
  await confirmDialog(zp, "Noch nicht alles beantwortet");   // Aufgabe 2 bleibt leer
  await expect(zp.locator("#t-1 .fbbox")).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await rowsOf("Zwe")).length, { timeout: 30_000 }).toBe(1);
  const [z1] = await rowsOf("Zwe");
  expect(codesOf(z1.p.typing.answers[0].first)).toEqual([71, 71, 71, 71]);
  await draftWhen(zp, (x) => x.firstSent === true);
  await zp.reload();
  await enterCode(zp, shown);
  await chooseSingle(zp);
  await zp.fill("#p-vorname", Z.vorname);
  await zp.fill("#p-nachname", Z.nachname);
  await zp.fill("#p-gtag", "10");
  await zp.fill("#p-gmonat", "9");
  await zp.fill("#p-klasse", Z.klasse);
  const zpf = zp.locator("#p-privfull");
  await zpf.locator("summary").click();
  const zsw = zpf.getByRole("checkbox", { name: TT_SWITCH });
  expect(await described(zsw)).toEqual(["p-privfull-ttoff", [TT_EFFECT, TT_SCOPE]]);
  await zsw.check();
  await expect(zpf.locator(".ttopt-st")).toHaveText(ON);
  await zp.click("#p-btn");
  await expect(zp.locator("#screen-editor")).toHaveClass(/active/);
  await expect(zp.locator("#a-1")).toHaveValue("Zwei");
  // sofort: Zwischenstand ohne Tippzeiten (auch die der ersten Fassung), derselbe Erstversuch (Zeile, Kennung) ohne sie ersetzt
  d = await draftWhen(zp, (x) => x.ttOptOut === true);
  expect(d.typing).toBeUndefined();
  expect(await ttStateOf(zp)).toEqual(NONE);
  await expect.poll(async () => (await rowsOf("Zwe")).map((x) => [x.id, x.stage, x.attempt, x.p.typing]), { timeout: 30_000 })
    .toEqual([[z1.id, "first", z1.attempt, { v: 1, optOut: true }]]);
  expect((await rowsOf("Zwe"))[0].p.answers).toEqual(z1.p.answers);
  await draftWhen(zp, (x) => x.ttOptOut === true && !("ttResend" in x));
  await closePage(z);

  /* ---------- Schüler:in 2, Gerät 2 (andere Kennung, kein Widerspruch): Schalter während des Sendens, zweiter Tab ---------- */
  const z2 = await openPage(browser);
  const za = z2.page;
  await enterCode(za, shown);
  await fillPerson(za, Z);
  const zed = za.locator("#privfull-ed");
  await zed.locator("summary").click();
  const zsa = zed.getByRole("checkbox", { name: TT_SWITCH });
  await expect(zsa).not.toBeChecked();   // der Widerspruch steht im Zwischenstand von Gerät 1, nicht beim Server
  await typeAt(za, "#a-1", "Drei", { delay: 120 });
  await draftWhen(za, (x) => x.answers[0] === "Drei");
  // Abgabe wird gesendet (angehalten): Haken springt zurück, Meldung ohne Erfolgsfarbe; das Senden scheitert → Meldung weg, Schalter wirkt
  const go2 = await hold(za, "/api/submit", "abort");
  await za.click("#submit-btn");
  await confirmDialog(za, "Ohne KI-Feedback abgeben?");
  await expect(za.locator("#submit-status")).toHaveText("Deine Abgabe wird verschlüsselt und gesendet …");
  await zsa.click();
  await expect(zsa).not.toBeChecked();
  const zst = zed.locator(".ttopt-st");
  await expect(zst).toHaveText(LATE);
  expect(await zst.evaluate((e) => getComputedStyle(e).color)).toBe(ORANGE_INK);
  go2();
  await expect(za.locator("#submit-status")).toContainText("Deine Antworten sind noch da");
  await expect(zst).toHaveText("");
  await za.unroute("**/api/submit");
  expect(await rowsOf("Zwe")).toHaveLength(1);   // nichts angekommen
  // zweiter Tab mit demselben Stand (gleicher Speicher): ein Widerspruch im ersten gilt sofort auch dort
  const zb = await z2.context.newPage();
  const zbErrors = [];
  zb.on("pageerror", (e) => zbErrors.push(String(e)));
  await zb.goto("/");
  await zb.click("#resume-btn");
  await expect(zb.locator("#screen-editor")).toHaveClass(/active/);
  await expect(zb.locator("#a-1")).toHaveValue("Drei");
  await zsa.click();
  await expect(zsa).toBeChecked();
  await expect(zst).toHaveText(ON);
  await expect(zst).not.toHaveClass(/late/);
  await zb.locator("#privfull-ed summary").click();
  const zsb = zb.locator("#privfull-ed").getByRole("checkbox", { name: TT_SWITCH });
  await expect(zsb).toBeChecked();
  await expect(zb.locator("#privfull-ed .ttopt-st")).toHaveText(TAB);
  expect(await ttStateOf(zb)).toEqual(NONE);
  await typeAt(zb, "#a-1", " B", { delay: 120 });
  d = await draftWhen(zb, (x) => x.answers[0] === "Drei B");
  expect([d.ttOptOut, d.typing]).toEqual([true, undefined]);   // der zweite Tab überschreibt den Widerspruch nicht
  await zb.click("#submit-btn");
  await confirmDialog(zb, "Ohne KI-Feedback abgeben?");
  await expect(zb.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await expect.poll(async () => (await rowsOf("Zwe")).map((x) => x.stage), { timeout: 30_000 }).toEqual(["first", "final"]);
  const zf = (await rowsOf("Zwe"))[1];
  expect(zf.attempt).not.toBe(z1.attempt);   // anderes Gerät, andere Kennung: der Erstversuch von Gerät 1 bleibt (ausgeblendet)
  expect([zf.p.typing, zf.p.answers[0]]).toEqual([{ v: 1, optOut: true }, { first: "Drei B", final: "Drei B" }]);
  expect(zbErrors).toEqual([]);
  await closePage(z2);

  /* ---------- Schüler:in 3: Haken während einer laufenden KI-Anfrage an und wieder aus; ältere Zwischenstand-PDF hochgeladen ---------- */
  const v = await openPage(browser);
  const vp = v.page;
  await enterCode(vp, shown);
  await fillPerson(vp, { vorname: "vie", nachname: "vi", geb: "--11-12", klasse: "7a" });
  await typeAt(vp, "#a-1", "Vier", { delay: 120 });
  await draftWhen(vp, (x) => x.answers[0] === "Vier");
  const [dl4] = await Promise.all([vp.waitForEvent("download"), vp.click("#ed-pdf")]);   // vor dem Widerspruch gesichert (samt Tippzeiten)
  const pdf4 = await readFile(await dl4.path());
  const go4 = await hold(vp, "/api/feedback");
  await vp.click("#fb-btn");
  await confirmDialog(vp, "Noch nicht alles beantwortet");   // Aufgabe 2 bleibt leer
  await expect(vp.locator("#fb-status")).toHaveText("Die KI arbeitet … das kann bis zu einer Minute dauern.");
  const ved = vp.locator("#privfull-ed");
  await ved.locator("summary").click();
  const vsw = ved.getByRole("checkbox", { name: TT_SWITCH });
  await vsw.click();
  await expect(vsw).toBeChecked();
  await vsw.click();
  await expect(vsw).not.toBeChecked();
  go4();
  await expect(vp.locator("#t-1 .fbbox")).toBeVisible({ timeout: 60_000 });
  await vp.unroute("**/api/feedback");
  // die vor dem Widerspruch gelesenen Werte gelten nicht mehr: erste Fassung ohne Messung (Zwischenstand und Erstversuch)
  d = await draftWhen(vp, (x) => x.firstSent === true);
  if (TT_KEEP) expect(d.typing.first).toEqual([null, null]);
  else expect(d.typing).toBeUndefined();
  await expect.poll(async () => (await rowsOf("Vie")).length, { timeout: 30_000 }).toBe(1);
  const [v1] = await rowsOf("Vie");
  expect(v1.p.typing).toEqual({ v: 1, answers: [{ first: null, final: null }, { first: null, final: null }] });
  // widersprechen (der Erstversuch wird ersetzt), dann auf diesem Gerät die ältere Zwischenstand-PDF hochladen und ihren Stand wählen
  await vsw.click();
  await expect(vsw).toBeChecked();
  await expect.poll(async () => (await rowsOf("Vie")).map((x) => [x.id, x.p.typing]), { timeout: 30_000 }).toEqual([[v1.id, { v: 1, optOut: true }]]);
  await draftWhen(vp, (x) => x.ttOptOut === true && !("ttResend" in x));
  await vp.reload();
  await vp.setInputFiles("#start-pdf-file", { name: "alt.pdf", mimeType: "application/pdf", buffer: pdf4 });
  await confirmDialog(vp, "Neuerer Zwischenstand auf diesem Gerät");   // „Stand aus der PDF-Datei“
  await expect(vp.locator("#screen-editor")).toHaveClass(/active/);
  await expect(vp.locator("#a-1")).toHaveValue("Vier");
  await ved.locator("summary").click();
  await expect(vsw).toBeChecked();   // ein Import nimmt den Widerspruch auf diesem Gerät nie zurück
  d = await draftWhen(vp, (x) => x.ttOptOut === true && x.answers[0] === "Vier");
  expect([d.typing, d.feedback]).toEqual([undefined, null]);
  expect(await ttStateOf(vp)).toEqual(NONE);
  await closePage(v);

  /* ---------- Gruppe: Widerspruch schon auf dem Angaben-Bildschirm („ihr“-Form) → sofort gespeichert, auch ohne Eingabe ---------- */
  const g = await openPage(browser);
  const gp = g.page;
  await enterCode(gp, shown);
  await expect(gp.locator("#screen-mode")).toHaveClass(/active/);
  await gp.click("#mode-group");
  await expect(gp.locator("#screen-person")).toHaveClass(/active/);
  await gp.fill("#p-m-1", "max mu");
  await gp.click("#p-add");
  await gp.fill("#p-m-2", "li mu");
  await gp.fill("#p-klasse", "7a");
  const pf = gp.locator("#p-privfull");
  await pf.locator("summary").click();
  const gsw = pf.getByRole("checkbox", { name: TT_SWITCH_G });
  await expect(gsw).not.toBeChecked();
  expect(await gsw.evaluate((e) => [e.getAttribute("aria-describedby").split(" ").map((id) => document.getElementById(id).textContent), e.closest(".ttoptbox").firstElementChild.textContent]))
    .toEqual([[TT_EFFECT_G, TT_SCOPE_G], "Der Messung der Tippzeiten könnt ihr direkt hier widersprechen – es genügt, wenn eine oder einer von euch das möchte:"]);
  await expect(pf).toContainText("Die Tippzeiten misst diese Seite, solange ihr nicht widersprecht (siehe „" + TT_OBJ_HEAD + "“).");
  await gsw.click();
  await expect(gsw).toBeChecked();
  await expect(pf.locator(".ttopt-st")).toHaveText(ON_G);
  expect(await pf.textContent()).not.toMatch(/\b(du|dein\w*|dir|dich)\b/i);
  await gp.click("#p-btn");
  await expect(gp.locator("#screen-editor")).toHaveClass(/active/);
  d = await draftWhen(gp, (x) => x.ttOptOut === true);   // ohne eine Eingabe gespeichert
  expect(d.answers.every((a) => a === "")).toBe(true);
  // neu geladen, bevor jemand tippt; dieselbe Gruppe (andere Reihenfolge) öffnet wieder über „Eure Angaben“ → der Widerspruch gilt
  await gp.reload();
  await enterCode(gp, shown);
  await gp.click("#mode-group");
  await gp.fill("#p-m-1", "li mu");
  await gp.click("#p-add");
  await gp.fill("#p-m-2", "max mu");
  await gp.fill("#p-klasse", "7a");
  await gp.click("#p-btn");
  await expect(gp.locator("#screen-editor")).toHaveClass(/active/);
  // im Schreibbereich derselbe Schalter („du“-Form wie der ganze Schreibbereich), schon gesetzt
  await gp.locator("#privfull-ed summary").click();
  await expect(gp.locator("#privfull-ed").getByRole("checkbox", { name: TT_SWITCH })).toBeChecked();
  await typeAt(gp, "#a-1", "Wir", { delay: 120 });
  await gp.locator("#a-2 textarea.tcell:not(.measure)").nth(0).click();
  await gp.keyboard.type("Ort", { delay: 120 });
  d = await draftWhen(gp, (x) => x.answers[0] === "Wir" && x.answers[1] === "Begriff | Erklärung\nOrt |");
  expect([d.ttOptOut, d.typing]).toEqual([true, undefined]);
  expect(await ttStateOf(gp)).toEqual(NONE);   // in keinem Feld gemessen
  await gp.click("#submit-btn");
  await confirmDialog(gp, "Ohne KI-Feedback abgeben?");
  await expect(gp.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await expect.poll(async () => (await rows()).filter((x) => x.p.person.gruppe).length, { timeout: 30_000 }).toBe(1);
  const grp = (await rows()).find((x) => x.p.person.gruppe).p;
  expect([grp.person.gruppe, grp.typing]).toEqual([["LiMu", "MaxMu"], { v: 1, optOut: true }]);
  await closePage(g);

  /* ---------- Lehrkraft: „ohne Messung (widersprochen)“ bei Abgaben, beim Erstversuch und beim ausgeblendeten älteren Erstversuch ---------- */
  await tp.click("#t-refresh");
  const mains = tp.locator("#t-subs-body tr.main");
  await expect(mains).toHaveCount(4);   // Wil, Zwe (Erstversuch von Gerät 1 ausgeblendet), Vie (Erstversuch), Gruppe
  await tp.click("#t-expand-all");
  const dets = tp.locator("#t-subs-body tr.details:visible");
  await expect(dets).toHaveCount(4);
  await expect(dets.locator(".detbox > .dtt-sum")).toHaveText(Array(4).fill("Tippzeiten: ohne Messung (widersprochen)."));
  await expect(dets.locator(".dtt, .tt-r, .tt-y, .tt-g")).toHaveCount(0);
  const wil = dets.filter({ hasText: "Ich tippe neu ja" });
  expect(await wil.locator(".dtask").nth(0).locator("table.cmp tbody td").nth(1).textContent()).toBe("Ich tippe neu ja");
  const vie = dets.filter({ hasText: "Erstversuch ohne Überarbeitung – noch nicht abgegeben" });
  await expect(vie.locator(".detbox > .dtt-sum")).toHaveText("Tippzeiten: ohne Messung (widersprochen).");
  const older = dets.locator("details.dolder");
  await expect(older).toHaveCount(1);
  await expect(older.locator("summary")).toHaveText("1 älterer Erstversuch dieser Person (in der Liste ausgeblendet)");
  await older.locator("summary").click();
  await expect(older.locator(".detbox.older > .dtt-sum")).toHaveText("Tippzeiten: ohne Messung (widersprochen).");
  await expect(older.locator(".dtt, .tt-r, .tt-y, .tt-g")).toHaveCount(0);
  // aufräumen
  await tp.click("#t-del-sheet");
  await confirmDialog(tp, "Feibeitsblatt löschen?");
  await expect(tp.locator("#t-list-status")).toHaveText("Feibeitsblatt gelöscht.");
  await closePage(t);
});

/* ---------- Feibeitsblatt als Finale eines Escape-Rooms (Schnittstelle v1) ----------
 * Daten frei erfunden; confirm ist eine beliebige Ziffernfolge. Die Gegenseite (Hülle, Link-Kodierung, Überblick-PDF) baut
 * test/escape-fixture.mjs genau wie der Quelltext eines Escape-Rooms. */
const ESC_ROOM = { id: "test-escape", name: "FastFashion-Test" };
const ESC_STATIONS = [
  { label: "Station 1 · Was steckt im Preis?", attempts: 1, errors: [] },
  { label: "Station 2 · Feld oder Ölquelle?", attempts: 3, errors: [{ item: "Rohstoff für Polyester", wrong: "Baumwolle", right: "Erdöl", note: "Polyester ist ein Kunststoff." }, { item: "Wasserbedarf", right: "Wasser" }] },
  { label: "Station 3 · Nähen für die Welt", attempts: 2, errors: [{ item: "Lohnanteil am Preis", wrong: "10 %", right: "ca. 1 %" }] },
  { label: "Station 4 · Ware unter Verdacht", attempts: 1, errors: [] },
  { label: "Station 5 · Zweites Leben oder Müll?", attempts: 1, errors: [] },
  { label: "Station 6 · Was darf Kaya posten?", attempts: 1, errors: [] },
];
const escRec = (code, o = {}) => ({
  code, room: { ...ESC_ROOM, url: "https://escape.example/" },
  person: { vorname: "Maximilian", nachname: "Mustermann", geburtsdatum: "04.05.2010", klasse: "10b" },
  confirm: "31415926", word: "GLOBUS", completedAt: "2026-10-27T10:15:00.000Z", stations: ESC_STATIONS,
  notes: ESC_STATIONS.map((st, i) => ({ label: st.label, text: `Erläuterung zu Station ${i + 1}.\n\nGenaue Daten: −23,8 % gegenüber dem Vorjahr; ≈ 81 % Anteil.` })),
  resumes: [{ place: "nach Station 2", savedAt: "2026-10-26T09:00:00.000Z", loadedAt: "2026-10-27T08:00:00.000Z" }],
  ...o,
});
const escLink = (hull) => "/#escape=" + b64url(JSON.stringify(hull));
const ESCT = { code: "", shown: "", normalShown: "" };   // gemeinsamer Zustand von 7n und 7o
const ESC_START_MSG = "Dieses Feibeitsblatt gehört zum Escape-Room „FastFashion-Test“. Öffne es über den Arena-Tunnel am Ende des Escape-Rooms – oder lade deine Überblick-PDF unter „Zwischenstand-PDF hochladen“ hoch.";
const ESC_LINK_BAD = "Der Link aus dem Escape-Room ist unvollständig. Lade deine Überblick-PDF unter „Zwischenstand-PDF hochladen“ hoch.";
const ESC_PDF_BAD = "In dieser Überblick-PDF steckt kein vollständiger Datensatz aus dem Escape-Room. Lade genau die Datei hoch, die du im Escape-Room heruntergeladen hast – kein Screenshot und kein Ausdruck davon.";
const ESC_NOT_OPEN = "Dieses Escape-Room-Finale ist noch nicht freigeschaltet. Deine Lehrkraft sagt dir, wann es losgeht – dann kommst du über den Arena-Tunnel am Ende des Escape-Rooms hierher (mit der Zwischenstand-Datei des Escape-Rooms kommst du dorthin zurück).";
const ESC_NO_SHEET = "Zu diesem Escape-Room-Finale gibt es kein Feibeitsblatt (mehr). Bitte sag deiner Lehrkraft Bescheid.";
const ESC_WRONG = "Die Daten aus dem Escape-Room passen nicht zu diesem Feibeitsblatt. Bitte sag deiner Lehrkraft Bescheid.";
const ESC_NEED = "Dieser Zwischenstand gehört zu einem Escape-Room-Finale, enthält aber keine Daten aus dem Escape-Room. Lade deine Überblick-PDF unter „Zwischenstand-PDF hochladen“ hoch.";
const ESC_BACK = "Diese Seite hat deine Daten aus dem Escape-Room nicht gespeichert. Du kannst jederzeit über den Arena-Tunnel oder mit deiner Überblick-PDF zurückkommen.";
// per Link angekommen: der Link steht im Verlauf des Browsers (replaceState entfernt ihn nur aus der Adresszeile)
const ESC_BACK_LINK = "Diese Seite hat deine Daten aus dem Escape-Room nicht gespeichert. Der Link aus dem Escape-Room mit diesen Daten steht aber noch im Verlauf deines Browsers – " +
  "auf einem geteilten Gerät lösche ihn dort. Du kannst jederzeit über den Arena-Tunnel oder mit deiner Überblick-PDF zurückkommen.";
const ESC_UPDATED = "Die Daten aus dem Escape-Room „FastFashion-Test“ in deinem Zwischenstand wurden durch die gerade mitgebrachten ersetzt (Escape-Room abgeschlossen am 27.10.2026, 11:15 Uhr).";
const ESC_NOTE = "Du kommst aus dem Escape-Room „FastFashion-Test“ – deine Angaben sind schon eingetragen.";
const ESC_SHORT = "Aus dem Escape-Room „FastFashion-Test“ bleiben dein voller Name, dein Geburtsdatum und dein Bestätigungscode auf diesem Gerät; nur deine Ergebnisse dort gehen verschlüsselt an deine Lehrkraft.";
const ESC_EDITOR = "Aus dem Escape-Room „FastFashion-Test“ stehen dein voller Name, dein Geburtsdatum und dein Bestätigungscode nur in deinem Zwischenstand auf diesem Gerät und in PDF-Dateien, die du herunterlädst; " +
  "an deine Lehrkraft gehen davon nur deine Ergebnisse aus dem Escape-Room – verschlüsselt mit Erstversuch und Abgabe, nie an eine KI.";
const ESC_STEP_LAST = "Lösungen, letztes Feedback und Escape-Room-Überblick herunterladen " + STEP_LATE;
const DONE_PDF_ESC = "Lade dir deine Lösungen und deinen Escape-Room-Überblick herunter und speichere sie in deinen Unterlagen zu unserem Unterricht";
const ESC_FAILED = "Noch nicht abgegeben: Die Abgabe ist wegen eines technischen Fehlers fehlgeschlagen. Reiche diese Datei bitte per E-Mail bei " + OP.email + " ein.";
const personValues = (page) => page.evaluate(() => ["p-vorname", "p-nachname", "p-gtag", "p-gmonat", "p-klasse"].map((id) => document.getElementById(id).value));
const draftOfPage = (pg) => pg.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith("feibeitsblatt:draft:")); return k ? JSON.parse(localStorage.getItem(k)) : null; });
const embedPdf = (obj, marker = "/FbDraft 1") => {   // kleine PDF-Datei mit einem eingebetteten Datensatz (wie eine Zwischenstand-PDF)
  const j = Buffer.from(JSON.stringify(obj), "utf8");
  return Buffer.concat([Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Type /EmbeddedFile ${marker} /Length ${j.length} >>\nstream\n`, "latin1"), j, Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1")]);
};
// ESCAPE_PDF_OUT=<Ordner> npm run test:e2e speichert die PDF-Dateien aus 7n/7o und Bildschirmfotos der Ankunft lokal zum Ansehen
const ESC_OUT = process.env.ESCAPE_PDF_OUT || "";
const escSave = async (name, buf) => { if (ESC_OUT) { await mkdir(ESC_OUT, { recursive: true }); await writeFile(join(ESC_OUT, name), buf); } };
// Typ jedes Downloads mitschreiben (application/octet-stream: nur speichern, nie im Tab öffnen)
const blobSpy = () => {
  window.__blobTypes = [];
  const orig = URL.createObjectURL;
  URL.createObjectURL = function (b) { try { window.__blobTypes.push(b && b.type); } catch (e) { /* egal */ } return orig.apply(this, arguments); };
};
const ymd = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };

test("7n Escape-Room-Finale (1): Lehrkraft legt das Blatt an (Name und Kennung geprüft, Überblick-PDF als Material abgelehnt) → Code-Eingabe gesperrt → Ankunft per Link (Laden, Hash-Wechsel, Netzfehler mit „Erneut versuchen“) und mit der Überblick-PDF (auch neu gespeichert und mit manipulierter Prüfsumme) → Angaben vorausgefüllt, Datenschutzhinweis mit den Daten aus dem Raum → Zwischenstand mit der Hülle, Neuladen, Zwischenstand-PDF → vorhandener Zwischenstand direkt; Fehlerfälle (nicht freigeschaltet, fremder Raum, kaputt, ohne Daten aus dem Raum, Hash im Schreibbereich, liegen gebliebene Ankunft; „Weiterschreiben“ bleibt erreichbar)", async ({ browser }) => {
  /* ---------- 1. Lehrkraft ---------- */
  const t = await openPage(browser);
  const tp = t.page;
  await teacherLogin(tp, PW);
  await tp.click("#t-new");   // ein normales Blatt für den Wechsel aus einer liegen gebliebenen Ankunft (Schritt 7)
  await tp.fill("#b-title", "Normales Blatt");
  await tp.fill("#bq-1", "Schreibe einen Satz.");
  await tp.fill("#bs-1", "- Ein Satz");
  await tp.click("#b-gen");
  await expect(tp.locator("#b-result")).toBeVisible();
  ESCT.normalShown = (await tp.locator("#b-res-code").textContent()).trim();
  await tp.click("#b-res-back");
  await tp.click("#t-new");
  await tp.fill("#b-title", "Finale FastFashion");
  await tp.fill("#bq-1", "Fasse Kayas wichtigste Erkenntnis zusammen.");
  await tp.fill("#bs-1", "- Kaya\n- Preis");
  await tp.fill("#bq-2", "Begründe deine Meinung.");
  await tp.fill("#bs-2", "- Meinung");
  await expect(tp.locator("#b-esc-fields")).toBeHidden();
  await tp.check("#b-esc");
  await expect(tp.locator("#b-esc-fields")).toBeVisible();
  await expect(tp.locator("#b-esc")).toBeFocused();   // kein Fokussprung beim Setzen des Hakens (WCAG 3.2.2) – die Felder folgen per Tab
  await tp.keyboard.press("Tab");
  await expect(tp.locator("#b-esc-name")).toBeFocused();
  // Name und Kennung prüft schon der Browser (dieselben Regeln wie der Server)
  await tp.click("#b-gen");
  await expect(tp.locator("#b-err")).toHaveText("Escape-Room: Bitte den Namen des Escape-Rooms eintragen.");
  await expect(tp.locator("#b-esc-name")).toBeFocused();
  await expect(tp.locator("#b-esc-name")).toHaveClass(/invalid/);
  await tp.fill("#b-esc-name", ESC_ROOM.name);
  await tp.fill("#b-esc-id", "Test Escape");
  await tp.click("#b-gen");
  await expect(tp.locator("#b-err")).toHaveText("Escape-Room: Die Kennung braucht 3 bis 60 Zeichen (nur a–z, 0–9 und Bindestrich) – genau wie ESCAPE_ROOM.id im Quelltext des Escape-Rooms.");
  await expect(tp.locator("#b-esc-id")).toBeFocused();
  await expect(tp.locator("#b-result")).toBeHidden();
  await tp.fill("#b-esc-id", " Test-Escape ");   // Großbuchstaben und Leerraum am Rand werden zur Kennung „test-escape“
  await tp.locator("#b-rows tr").first().locator("input.bfile-input").setInputFiles({ name: "Ueberblick.pdf", mimeType: "application/pdf", buffer: overviewPdf(escHull(escRec("K7QM4X"))) });
  await expect(tp.locator("#b-rows tr .bfile-stat").first()).toContainText("Das ist eine Überblick-PDF aus einem Escape-Room mit persönlichen Angaben von Schüler:innen – bitte nicht als Material anhängen.");
  // … auch neu gespeichert ohne Kennzeichen (erkannt an der eingebetteten Hülle)
  await tp.locator("#b-rows tr").first().locator("input.bfile-input").setInputFiles({ name: "Ueberblick2.pdf", mimeType: "application/pdf", buffer: overviewPdf(escHull(escRec("K7QM4X")), { flate: true, marker: false, compact: true }) });
  await expect(tp.locator("#b-rows tr .bfile-stat").first()).toContainText("„Ueberblick2.pdf“: Das ist eine Überblick-PDF aus einem Escape-Room");
  await expect(tp.locator("#b-rows tr").first().locator(".bfile")).toHaveCount(0);
  await tp.click("#b-gen");
  await expect(tp.locator("#b-result")).toBeVisible();
  await expect(tp.locator("#b-res-esc")).toHaveText("Tragen Sie diesen Code im Quelltext des Escape-Rooms „FastFashion-Test“ ein (FEIBEITSBLATT_CODE). Schüler:innen öffnen das Feibeitsblatt über den Arena-Tunnel am Ende des Escape-Rooms oder mit ihrer Überblick-PDF.");
  await expect(tp.locator("#b-res-normal")).toBeHidden();
  ESCT.shown = (await tp.locator("#b-res-code").textContent()).trim(); ESCT.code = ESCT.shown.replace("-", "");
  const pub = await (await tp.request.get("/api/sheet/" + ESCT.code)).json();
  expect(pub.sheet.escape).toEqual(ESC_ROOM);   // öffentlich nur Kennung und Name
  await tp.click("#b-res-back");
  const row = tp.locator("#t-sheets-body tr", { hasText: "Finale FastFashion" });
  await expect(row.locator("td").nth(1)).toHaveText("Escape-Room " + ESC_ROOM.name);   // kein Code in der Liste
  await expect(row).not.toContainText(ESCT.shown);
  await expect(tp.locator("#t-sheets-body tr", { hasText: "Normales Blatt" })).toContainText(ESCT.normalShown);
  await row.click();
  await expect(tp.locator("#t-sel-code-lbl")).toHaveText("Code für den Quelltext des Escape-Rooms");
  await expect(tp.locator("#t-sel-code")).toHaveText(ESCT.shown);
  await expect(tp.locator("#t-sel-meta")).toContainText(" · Escape-Room „FastFashion-Test“ (Kennung test-escape)");
  await expect(tp.locator("#t-sel-esc")).toHaveText("Schüler:innen öffnen dieses Feibeitsblatt nur über den Escape-Room „FastFashion-Test“ (Arena-Tunnel am Ende oder ihre Überblick-PDF); " +
    "die Eingabe des Codes auf der Startseite ist gesperrt. Die Prüfsumme in den Abgaben zeigt nur, ob der Datensatz aus dem Escape-Room unverändert ankam – ein Indiz, kein Beweis (der Quelltext ist öffentlich).");
  await expect(tp.locator("#t-analog")).toBeHidden();
  await expect(tp.locator("#t-analog-hint")).toBeHidden();
  // ein normales Blatt danach: wieder „Code für die Schüler:innen“ und analoges Arbeitsblatt
  await tp.locator("#t-sheets-body tr", { hasText: "Normales Blatt" }).click();
  await expect(tp.locator("#t-sel-code-lbl")).toHaveText("Code für die Schüler:innen");
  await expect(tp.locator("#t-sel-esc")).toBeHidden();
  await expect(tp.locator("#t-analog")).toBeVisible();
  await closePage(t);

  /* ---------- 2. Code-Eingabe gesperrt ---------- */
  const s = await openPage(browser);
  const { page } = s;
  await enterCode(page, ESCT.shown);
  await expect(page.locator("#start-err")).toHaveText(ESC_START_MSG);
  await expect(page.locator("#screen-start")).toHaveClass(/active/);
  await expect(page.locator("#code-input")).toBeFocused();

  /* ---------- 3. Ankunft per Link (Seite neu geladen): Adresse sofort ohne Daten, Angaben vorausgefüllt, nur Einzelarbeit ---------- */
  const hull = escHull(escRec(ESCT.code));
  await s.context.addInitScript(blobSpy);
  await page.goto("about:blank");
  await page.goto(escLink(hull));
  await expect(page.locator("#screen-person")).toHaveClass(/active/);
  expect(page.url()).toBe(BASE_URL + "/");
  expect(await page.evaluate(() => [location.hash, history.state, "FEIBEITSBLATT_ESCAPE_LINK" in window])).toEqual(["", null, false]);   // Übergabe aus dem Kopf-Skript gelöscht
  expect(await personValues(page)).toEqual(["Max", "Mu", "4", "5", "10b"]);
  await expect(page.locator("#p-escape")).toHaveText(ESC_NOTE);
  await expect(page.locator("#p-sheet small")).toHaveText("Escape-Room „FastFashion-Test“ · 2 Aufgaben");
  await expect(page.locator("#p-back")).toHaveText("← zur Startseite");
  await expect(page.locator("#p-btn")).toBeFocused();
  await expect(page.locator("#p-btn")).toHaveAttribute("aria-describedby", "p-escape");   // der Hinweis wird beim Ankommen mit vorgelesen
  await expect(page.locator("#p-group")).toBeHidden();
  await expect(page.locator("#p-privacy-esc")).toHaveText(ESC_SHORT);
  await expectTtShort(page.locator("#p-privacy-short"));
  await expectOnlyTtShort(page, "Angaben (Escape-Room)");
  const pf = page.locator("#p-privfull");
  await expect(pf.locator('h2.privh:text-is("Welche Daten?") + p + p + p')).toHaveText(ESC_DATA(ESC_ROOM.name));   // nach dem Satz zu § 25 TDDDG
  for (const x of [ESC_PURPOSE(ESC_ROOM.name), ESC_STAY]) await expect(pf).toContainText(x);
  await expect(recipients(pf, "h2").filter({ hasText: "Escape-Room" })).toHaveText([ESC_TEACHER, ESC_MAIL]);
  await expect(pf.locator('h2.privh:text-is("Rechtsgrundlage") + ul > li')).toHaveText(privBases(true, DELIVER_WORKER));   // die Liste bleibt gleich
  await shots(page, "escape-angaben", [375, 1280], ESC_OUT);

  /* ---------- 4. Schreibbereich: Hülle sofort im Zwischenstand, Neuladen → Weiterschreiben ---------- */
  await page.click("#p-btn");
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
  await expect(page.locator("#who-name")).toHaveText("Max · Mu · 04.05. · Klasse 10b");
  await expect(page.locator("#sheet-meta")).toContainText("Finale des Escape-Rooms „FastFashion-Test“");
  await expect(page.locator("#esc-updated")).toBeHidden();   // noch kein Zwischenstand – nichts ersetzt
  await expect.poll(async () => ((await draftOfPage(page)) || {}).escape).toEqual(hull);
  await expect(page.locator("#ed-steps-list li")).toHaveText([...STEPS_AI.slice(0, 4), ESC_STEP_LAST]);
  await expect(page.locator("#privacy-esc")).toHaveText(ESC_EDITOR);
  await expect(page.locator("#privfull-ed")).toContainText(ESC_PURPOSE(ESC_ROOM.name));
  const TXT = "Kaya prüft die Preise.";
  await typeAt(page, "#a-1", TXT);
  await expect.poll(async () => ((await draftOfPage(page)) || { answers: [] }).answers[0]).toBe(TXT);
  await page.reload();
  await expect(page.locator("#resume-box")).toBeVisible();
  await page.click("#resume-btn");
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
  expect(await page.inputValue("#a-1")).toBe(TXT);
  expect((await draftOfPage(page)).escape).toEqual(hull);
  await expect(page.locator("#privacy-esc")).toBeVisible();

  /* ---------- 5. Zwischenstand-PDF: trägt die Hülle, nennt den Escape-Room; auf einem anderen Gerät hochgeladen geht es weiter ---------- */
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#ed-pdf")]);
  expect((await page.evaluate(() => window.__blobTypes)).at(-1)).toBe("application/octet-stream");   // voller Name, Geburtsdatum, Bestätigungscode: nur speichern
  const dpdf = await readFile(await dl.path());
  await escSave("7n-zwischenstand.pdf", dpdf);
  const i0 = dpdf.indexOf("/FbDraft 1"), d0 = dpdf.indexOf("stream\n", i0) + 7, d1 = dpdf.indexOf("\nendstream", d0);
  const ddraft = JSON.parse(dpdf.subarray(d0, d1).toString("utf8"));
  expect(ddraft.escape).toEqual(hull);
  expect(dpdf.includes("/FbEscape 1")).toBe(false);   // ein Zwischenstand, keine Überblick-PDF
  const dtext = pdfShownText(dpdf);
  expect(dtext).toContain("Escape-Room: „FastFashion-Test“ – mit deinen Daten aus dem Escape-Room");
  expect(dtext).toContain("Die Datei enthält auch deine Daten aus dem Escape-Room (voller Name, Geburtsdatum, Bestätigungscode und Ergebnisse)");
  const f = await openPage(browser);
  await f.page.setInputFiles("#start-pdf-file", { name: "z.pdf", mimeType: "application/pdf", buffer: dpdf });
  await expect(f.page.locator("#screen-editor")).toHaveClass(/active/, { timeout: 30_000 });
  expect(await f.page.inputValue("#a-1")).toBe(TXT);
  await expect.poll(async () => ((await draftOfPage(f.page)) || {}).escape).toEqual(hull);
  // … ohne die Daten aus dem Raum (umgebaut) → nicht möglich
  const noEsc = { ...ddraft }; delete noEsc.escape;
  const g = await openPage(browser);
  await g.page.setInputFiles("#start-pdf-file", { name: "z.pdf", mimeType: "application/pdf", buffer: embedPdf(noEsc) });
  await expect(g.page.locator("#start-err")).toHaveText(ESC_NEED);
  await expect(g.page.locator("#screen-start")).toHaveClass(/active/);
  await closePage(g);
  await closePage(f);

  /* ---------- 6. Überblick-PDF hochladen ---------- */
  const u = await openPage(browser);
  const up = u.page;
  const upload = (buf) => up.setInputFiles("#start-pdf-file", { name: "Ueberblick.pdf", mimeType: "application/pdf", buffer: buf });
  await upload(overviewPdf(hull));
  await expect(up.locator("#screen-person")).toHaveClass(/active/);
  expect(await personValues(up)).toEqual(["Max", "Mu", "4", "5", "10b"]);
  await up.click("#p-back");   // zur Startseite: die Daten werden verworfen
  await expect(up.locator("#screen-start")).toHaveClass(/active/);
  await expect(up.locator("#start-status")).toHaveText(ESC_BACK);
  await expect(up.locator("#code-input")).toBeFocused();
  await upload(overviewPdf(hull, { flate: true, marker: false, compact: true, lenRef: true }));   // neu gespeichert
  await expect(up.locator("#screen-person")).toHaveClass(/active/);
  await expect(up.locator("#start-status")).toHaveText("");
  await up.click("#p-back");
  // Prüfsumme manipuliert (FlateDecode): die Daten werden trotzdem übernommen – ob sie stimmt, sieht nur die Lehrkraft (Test 7o)
  const forged = { ...hull, d: hull.d.replace('"attempts":3', '"attempts":1') };
  expect(forged.d).not.toBe(hull.d);
  await upload(overviewPdf(forged, { flate: true }));
  await expect(up.locator("#screen-person")).toHaveClass(/active/);
  expect(await personValues(up)).toEqual(["Max", "Mu", "4", "5", "10b"]);
  await expect(up.locator("#p-escape")).toHaveText(ESC_NOTE);
  await up.click("#p-back");
  await upload(overviewPdf(escHull(escRec(""))));
  await expect(up.locator("#start-err")).toHaveText(ESC_NOT_OPEN);
  await upload(overviewPdf(escHull(escRec(ESCT.code, { room: { id: "anderer-raum", name: "Anders" } }))));
  await expect(up.locator("#start-err")).toHaveText(ESC_WRONG);
  await upload(overviewPdf('{"kind":"feibeitsblatt-escape","v":1,"d":"{'));
  await expect(up.locator("#start-err")).toHaveText(ESC_PDF_BAD);
  // unvollständige Angaben: die Lücken nennt der Hinweis, der Fokus steht im ersten leeren Feld
  await upload(overviewPdf(escHull(escRec(ESCT.code, { person: { vorname: "Maximilian", nachname: "Mustermann", geburtsdatum: "31.04.2010", klasse: "" } }))));
  await expect(up.locator("#p-escape")).toHaveText(ESC_NOTE + " Bitte trage noch deinen Geburtstag und deine Klasse ein.");
  await expect(up.locator("#p-gtag")).toBeFocused();
  await expect(up.locator("#p-gtag")).toHaveAttribute("aria-describedby", "p-escape");
  await expect(up.locator("#p-btn")).not.toHaveAttribute("aria-describedby", /p-escape/);
  await up.click("#p-back");

  /* ---------- 7. Link-Varianten ---------- */
  await up.goto("about:blank"); await up.goto("/#escape=%%%");
  await expect(up.locator("#start-err")).toHaveText(ESC_LINK_BAD);
  expect(up.url()).toBe(BASE_URL + "/");
  await up.evaluate((x) => { location.hash = x; }, escLink(hull).slice(1));   // Hash-Wechsel auf der Startseite
  await expect(up.locator("#screen-person")).toHaveClass(/active/);
  expect(up.url()).toBe(BASE_URL + "/");
  await up.click("#p-back");
  await expect(up.locator("#start-status")).toHaveText(ESC_BACK_LINK);   // per Link angekommen: der Link steht im Verlauf des Browsers
  // Netzfehler beim Laden des Blattes: die Daten bleiben, „Erneut versuchen“ holt es nach – scheitert auch das, bleibt der Fokus auf dem Knopf
  let aborted = 0;
  await up.route("**/api/sheet/*", (r) => (aborted++ < 2 ? r.abort() : r.continue()));
  await up.goto("about:blank"); await up.goto(escLink(hull));
  await expect(up.locator("#start-err")).toHaveText(/Deine Daten aus dem Escape-Room sind noch da – versuche es gleich noch einmal\.$/);
  await expect(up.locator("#start-esc-retry")).toBeVisible();
  await up.focus("#start-esc-retry");
  await up.keyboard.press("Enter");
  await expect.poll(() => aborted).toBe(2);
  await expect(up.locator("#start-esc-retry")).toBeVisible();
  await expect(up.locator("#start-esc-retry")).toBeFocused();
  await up.keyboard.press("Enter");
  await expect(up.locator("#screen-person")).toHaveClass(/active/);
  await expect(up.locator("#start-esc-retry")).toBeHidden();
  await up.unroute("**/api/sheet/*");
  // fremde Texte bleiben Text
  const xss = escHull(escRec(ESCT.code, { person: { vorname: "<img src=x onerror=window.__x=1>", nachname: "Mustermann", geburtsdatum: "04.05.2010", klasse: "10b" },
    stations: [{ label: "<img src=x onerror=window.__x=2>", attempts: 2, errors: [{ item: "<img src=x onerror=window.__x=3>" }] }] }));
  await up.goto("about:blank"); await up.goto(escLink(xss));
  await expect(up.locator("#screen-person")).toHaveClass(/active/);
  expect(await up.evaluate(() => [document.querySelectorAll("img[src=x]").length, window.__x])).toEqual([0, undefined]);
  // liegen gebliebene Ankunft: über „Impressum & Datenschutz“ weg, dann ein normaler Code → keine Daten aus dem Raum
  await up.evaluate(() => { location.hash = "#impressum"; });
  await expect(up.locator("#screen-legal")).toHaveClass(/active/);
  await up.click("#legal-home");
  await enterCode(up, ESCT.normalShown);
  await fillPerson(up, { vorname: "Max", nachname: "Mu", geb: "--05-04", klasse: "10b" });
  await expect(up.locator("#privacy-esc")).toBeHidden();
  await typeAt(up, "#a-1", "Ein Satz.");
  await expect.poll(async () => !!(await draftOfPage(up))).toBe(true);
  expect((await draftOfPage(up)).escape).toBeUndefined();
  await expect(up.locator("#ed-steps-list li")).toHaveText(STEPS_AI);
  // Wettlauf: das Escape-Blatt lädt langsam, währenddessen kommt ein Zwischenstand eines normalen Blattes → die späte Antwort ändert
  // nichts mehr; Schreibbereich und Abgabe gehören zum normalen Blatt
  let release;
  const held = new Promise((r) => { release = r; });
  await up.route(`**/api/sheet/${ESCT.code}`, async (r) => { await held; await r.continue(); });
  await up.goto("about:blank"); await up.goto(escLink(hull));
  await expect(up.locator("#start-btn")).toBeDisabled();   // lädt (angehalten)
  const normalCode = ESCT.normalShown.replace("-", "");
  const lia = { v: 1, kind: "feibeitsblatt-draft", code: normalCode, sheetTitle: "Normales Blatt", t: Date.now(),
    person: { vorname: "Lia", nachname: "Wa", geburtsdatum: "--03-02", klasse: "10c" }, answers: ["Satz aus dem Wettlauf."] };
  await up.setInputFiles("#start-pdf-file", { name: "z.pdf", mimeType: "application/pdf", buffer: embedPdf(lia) });
  await expect(up.locator("#screen-editor")).toHaveClass(/active/);
  const late = up.waitForResponse((r) => r.url().endsWith("/api/sheet/" + ESCT.code));
  release();
  await late;
  await up.waitForTimeout(300);   // die späte Antwort ist verarbeitet
  await up.unroute(`**/api/sheet/${ESCT.code}`);
  await expect(up.locator("#screen-editor")).toHaveClass(/active/);
  await expect(up.locator("#sheet-title")).toHaveText("Normales Blatt");
  await expect(up.locator("#tasks .task")).toHaveCount(1);
  await expect(up.locator("#ed-steps-list li")).toHaveText(STEPS_AI);
  await expect(up.locator("#privacy-esc")).toBeHidden();
  expect(await up.inputValue("#a-1")).toBe("Satz aus dem Wettlauf.");
  const posted = [];
  await up.route("**/api/submit", (r) => { posted.push(JSON.parse(r.request().postData()).code); return r.abort(); });
  await up.click("#submit-btn");
  await confirmDialog(up, "Ohne KI-Feedback abgeben?");
  await expect.poll(() => posted.length).toBe(1);
  expect(posted).toEqual([normalCode]);   // nicht an das Escape-Blatt
  await expect(up.locator("#submit-status")).toHaveClass(/bad/);
  await expect(up.locator("#submit-esc")).toBeHidden();
  await up.unroute("**/api/submit");
  await closePage(u);
  // Der Hash verschwindet schon im Kopf der Seite – auch wenn das große Skript gar nicht läuft (hier mit einem eingeschleusten Syntaxfehler)
  const bctx = await browser.newContext();
  const bp = await bctx.newPage();
  await bp.route((url) => url.pathname === "/", async (r) => {
    const resp = await r.fetch(), html = await resp.text(), mark = '"use strict";\n(function(){';
    expect(html.split(mark).length).toBe(2);
    await r.fulfill({ response: resp, body: html.replace(mark, mark + " @@@ ") });
  });
  const perr = [];
  bp.on("pageerror", (e) => perr.push(String(e)));
  await bp.goto(escLink(hull));
  await expect.poll(() => perr.length).toBeGreaterThan(0);   // das große Skript scheitert …
  expect(bp.url()).toBe(BASE_URL + "/");                      // … die Daten stehen trotzdem nicht mehr in der Adresse
  expect(await bp.evaluate(() => [location.hash, typeof window.FEIBEITSBLATT_ESCAPE_LINK])).toEqual(["", "string"]);
  await bctx.close();
  // Link im Schreibbereich: sofort aus der Adresse entfernt, nichts übernommen
  const other = escHull(escRec(ESCT.code, { confirm: "27182818" }));
  await page.evaluate((x) => { location.hash = x; }, escLink(other).slice(1));
  await expect.poll(() => page.url()).toBe(BASE_URL + "/");
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
  expect(await page.inputValue("#a-1")).toBe(TXT);
  expect((await draftOfPage(page)).escape).toEqual(hull);

  /* ---------- 8. Vorhandener Zwischenstand: erneute Ankunft → direkt in den Schreibbereich (neue Daten gewinnen, sichtbar gemeldet) ---------- */
  await page.goto("about:blank");
  await page.goto(escLink(other));
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
  expect(await page.inputValue("#a-1")).toBe(TXT);
  await expect.poll(async () => ((await draftOfPage(page)) || {}).escape).toEqual(other);
  await expect(page.locator("#esc-updated")).toBeVisible();
  await expect(page.locator("#esc-updated")).toHaveText(ESC_UPDATED);
  // dieselben Daten noch einmal: keine Meldung
  await page.goto("about:blank");
  await page.goto(escLink(other));
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
  await expect(page.locator("#save-state")).toHaveText(/./);
  await expect(page.locator("#esc-updated")).toBeHidden();
  // Fehler bei der Ankunft: der vorhandene Zwischenstand bleibt über „Weiterschreiben“ erreichbar
  for (const [link, msg] of [["/#escape=%%%", ESC_LINK_BAD], [escLink(escHull(escRec(""))), ESC_NOT_OPEN]]) {
    await page.goto("about:blank"); await page.goto(link);
    await expect(page.locator("#start-err")).toHaveText(msg);
    expect(page.url()).toBe(BASE_URL + "/");
    await expect(page.locator("#resume-box")).toBeVisible();
  }
  await page.click("#resume-btn");
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
  expect(await page.inputValue("#a-1")).toBe(TXT);
  expect((await draftOfPage(page)).escape).toEqual(other);
  await closePage(s);
});

test("7o Escape-Room-Finale (2): Abgabe mit den Ergebnissen aus dem Raum (verschlüsselt, ohne vollen Namen und Bestätigungscode, nie an die KI) → Abschluss-PDF (nur zum Speichern, mit Überblick und Lösungserläuterungen, ohne Tippzeiten) → technisch gescheiterte Abgabe mit E-Mail-Weg (403 ja, bad_envelope nein) → Lehrkraft: Kurzfassung, Prüfsumme, Überblick, PDF mit Kürzeln; Überblick-PDF ist keine Sicherung; „Als Vorlage“ und Sicherung → Import → neues Blatt für denselben Raum; Blatt gelöscht → Finale meldet es", async ({ browser }) => {
  const teacher = JSON.parse((await d1Query("SELECT value FROM settings WHERE key='teacher'"))[0].value);
  const priv = await openPrivateKey((await deriveTeacherKeys(PW, teacher.kdf)).encKey, teacher.encPrivateKey);
  const SECRET = ["Maximilian", "Mustermann", "04.05.2010", "31415926", "Erika", "Musterfrau", "09.11.2009", "27182818", "Genaue Daten", "escape.example"];
  const mock0 = (await mockState()).requests.length;

  /* ---------- 9. Abgabe mit KI-Feedback ---------- */
  const s = await openPage(browser);
  const { page } = s;
  await s.context.addInitScript(blobSpy);
  const hull = escHull(escRec(ESCT.code));
  await page.goto("about:blank"); await page.goto(escLink(hull));
  await expect(page.locator("#screen-person")).toHaveClass(/active/);
  await page.click("#p-btn");
  await expect(page.locator("#screen-editor")).toHaveClass(/active/);
  await typeAt(page, "#a-1", "Kaya hat gelernt, dass der Preis wenig über die Herstellung sagt.");
  await typeAt(page, "#a-2", "Ich finde, sie sollte nicht werben.");
  await requestFeedback(page);
  await expect.poll(async () => (await s.calls((e) => e.path === "/api/submit" && e.status === 200)).length, { timeout: 30_000 }).toBe(1);   // Erstversuch
  await typeAt(page, "#a-2", " Denn Fast Fashion schadet.");
  await submit(page);
  // an die KI und an den Server: nie die Daten aus dem Raum im Klartext
  const fbCalls = await s.calls((e) => e.path === "/api/feedback");
  expect(fbCalls.length).toBeGreaterThanOrEqual(1);
  for (const c of fbCalls) for (const x of [...SECRET, "Rohstoff für Polyester", "GLOBUS", "escape"]) expect(c.reqBody, x).not.toContain(x);
  for (const r of (await mockState()).requests.slice(mock0)) for (const x of [...SECRET, "Rohstoff für Polyester", "GLOBUS"]) expect(JSON.stringify(r.messages), x).not.toContain(x);
  const subCalls = (await s.calls((e) => e.path === "/api/submit" && e.status === 200)).map((e) => JSON.parse(e.reqBody));
  for (const b of subCalls.filter((x) => x.stage !== "feedback2")) expect(Object.keys(b).sort()).toEqual(["attempt", "code", "envelope", "stage"]);   // das Nachreichen (unten) mit receivedAt
  const firstP = await openEnvelope(priv, subCalls.find((b) => b.stage === "first").envelope);
  const finalP = await openEnvelope(priv, subCalls.find((b) => b.stage === "final").envelope);
  for (const p of [firstP, finalP]) {
    expect(Object.keys(p.escape)).toEqual(["room", "word", "completedAt", "stations", "resumes", "check"]);
    expect(p.escape.check).toBe("ok");
    expect(p.escape.room).toEqual(ESC_ROOM);
    expect(p.escape.stations).toEqual(ESC_STATIONS);
    expect(p.person).toEqual({ vorname: "Max", nachname: "Mu", geburtsdatum: "--05-04", klasse: "10b" });
    for (const x of SECRET) expect(JSON.stringify(p), x).not.toContain(x);
  }
  const rows = await d1Query(`SELECT stage, envelope FROM submissions WHERE sheet_code='${ESCT.code}'`);
  expect(rows.map((r) => r.stage)).toEqual(["final"]);   // die Abgabe ersetzt den Erstversuch
  const noFb2 = (x) => { const y = { ...x }; delete y.feedback2; return y; };
  expect(noFb2(await openEnvelope(priv, JSON.parse(rows[0].envelope)))).toEqual(finalP);   // (die zweite Rückmeldung kann schon nachgereicht sein)
  const scan = await scanState(SECRET.slice(0, 4).concat(["Rohstoff für Polyester"]));
  expect(Object.values(scan.count)).toEqual([0, 0, 0, 0, 0]);   // beim Server nur verschlüsselt

  /* ---------- 10. Abschluss-PDF ---------- */
  await expect(page.locator("#done-pdf")).toHaveText(DONE_PDF_ESC);
  await expect(page.locator("#done-pdf-note")).toHaveText("Es ist möglich, dass du mit diesen Aufgaben für die Klausur / Klassenarbeit relevante Inhalte erlernt hast.");
  await expect(page.locator("#done-fb-list .fbbox").first()).toBeVisible({ timeout: 60_000 });   // zweite Rückmeldung abwarten (steht dann in der Datei)
  // … sie geht danach verschlüsselt an die Lehrkraft: genau die angenommene Abgabe + feedback2 – die Daten aus dem Raum (ohne vollen
  // Namen und Bestätigungscode) und die Tippzeiten bleiben dabei erhalten, nie an die KI
  const fb2Call = async () => (await s.calls((e) => e.path === "/api/submit" && e.status === 200)).map((e) => JSON.parse(e.reqBody)).find((b) => b.stage === "feedback2");
  await expect.poll(async () => !!(await fb2Call()), { timeout: 30_000 }).toBe(true);
  const fb2Body = await fb2Call();
  expect(Object.keys(fb2Body).sort()).toEqual(["attempt", "code", "envelope", "receivedAt", "stage"]);
  const fb2P = await openEnvelope(priv, fb2Body.envelope);
  expect(noFb2(fb2P)).toEqual(finalP);
  expect([fb2P.escape, fb2P.typing]).toEqual([finalP.escape, finalP.typing]);
  expect(fb2P.typing.answers.some((a) => typeof a.final === "string" && a.final.length > 1)).toBe(true);
  expect(fb2P.feedback2.results.map((x) => !!x)).toEqual([false, true]);   // nur Aufgabe 2 wurde nach dem Feedback geändert
  for (const x of SECRET) expect(JSON.stringify(fb2P), x).not.toContain(x);
  const rowsFb2 = await d1Query(`SELECT stage, envelope FROM submissions WHERE sheet_code='${ESCT.code}'`);
  expect(rowsFb2.map((r) => r.stage)).toEqual(["final"]);
  expect(await openEnvelope(priv, JSON.parse(rowsFb2[0].envelope))).toEqual(fb2P);
  const [sdl] = await Promise.all([page.waitForEvent("download"), page.click("#done-pdf")]);
  expect(sdl.suggestedFilename()).toBe(`Escape-Room-FastFashion-Test-Abschluss-${ymd()}.pdf`);
  expect((await page.evaluate(() => window.__blobTypes)).at(-1)).toBe("application/octet-stream");
  const spdf = await readFile(await sdl.path());
  await escSave("7o-abschluss.pdf", spdf);
  pdfStructure(spdf, 5);
  const stext = pdfShownText(spdf);
  const at = (x) => { const k = stext.indexOf(x); expect(k, x).toBeGreaterThan(-1); return k; };
  const order = ["Meine Lösungen – Finale FastFashion", "Escape-Room „FastFashion-Test“ – Überblick", "Lösungserläuterungen", "Verwendung von Zwischenstand-Dateien des Escape-Rooms"].map(at);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  for (const x of ["Name: Maximilian Mustermann", "Geburtsdatum: 04.05.2010 · Klasse: 10b", "Bestätigungscode: 31415926", "Codewort: GLOBUS", "Stationen im ersten Versuch fehlerfrei: 4 von 6",
    "Fehler im ersten Versuch insgesamt: 3", "• Rohstoff für Polyester", "Antwort: Baumwolle", "Richtig: Erdöl", "Genaue Daten: -23,8 % gegenüber dem Vorjahr; ~ 81 % Anteil.", "• nach Station 2"]) at(x);
  expect(stext).not.toContain("Tippzeit");
  expect(stext).not.toContain("?23,8");
  for (const a of finalP.typing.answers) for (const b of [a.first, a.final]) if (typeof b === "string" && b.length > 4) expect(spdf.toString("latin1")).not.toContain(b);
  await closePage(s);

  /* ---------- 11. Abgabe technisch gescheitert: E-Mail-Weg mit Abschluss-PDF (Prüfsumme manipuliert → „stimmt nicht“) ---------- */
  const f = await openPage(browser);
  const fp = f.page;
  const erika = escRec(ESCT.code, { person: { vorname: "Erika", nachname: "Musterfrau", geburtsdatum: "09.11.2009", klasse: "10a" }, confirm: "27182818",
    stations: [{ label: "Station 1 · Was steckt im Preis?", attempts: 2, errors: [{ item: "<img src=x onerror=window.__x=1>", wrong: "<b>w</b>" }] }], resumes: [] });
  const bad = { ...escHull(erika), s: "0123456789abcdef" };
  await f.context.addInitScript(blobSpy);
  await fp.goto("about:blank"); await fp.goto(escLink(bad));
  await expect(fp.locator("#screen-person")).toHaveClass(/active/);
  expect(await personValues(fp)).toEqual(["Eri", "Mu", "9", "11", "10a"]);
  await fp.click("#p-btn");
  await expect(fp.locator("#screen-editor")).toHaveClass(/active/);
  await typeAt(fp, "#a-1", "Antwort von Eri.");
  // jede Antwort auf /api/submit vorgeben (status 0 = Netzfehler); ein Versuch gilt erst als beendet, wenn er gesendet hat und
  // „Abgeben“ wieder frei ist (sonst prüfte die Erwartung noch den Zustand des vorigen Versuchs)
  let posts = 0;
  const failWith = async (status, body) => {
    await fp.unroute("**/api/submit");
    await fp.route("**/api/submit", (r) => { posts++; return status ? r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }) : r.abort(); });
  };
  const trySubmit = async () => {
    const n = posts;
    await fp.click("#submit-btn");
    await confirmDialog(fp, "Ohne KI-Feedback abgeben?");
    await expect.poll(() => posts).toBeGreaterThan(n);
    await expect(fp.locator("#submit-btn")).toBeEnabled();
    await expect(fp.locator("#submit-status")).toHaveClass(/bad/);
  };
  await failWith(0);
  await trySubmit();
  const box = fp.locator("#submit-esc");
  await expect(box).toBeVisible();
  await expect(fp.locator("#submit-esc-text")).toHaveText("Noch nicht abgegeben: Die Abgabe ist wegen eines technischen Fehlers fehlgeschlagen. Versuche es gleich noch einmal. Klappt es nicht, lade diese Datei herunter und reiche sie per E-Mail bei " + OP.email + " ein.");
  await expect(fp.locator(`#submit-esc-text a[href="mailto:${OP.email}"]`)).toHaveCount(1);
  await expect(fp.locator("#submit-esc-note")).toHaveText("Die Datei enthält deinen vollen Namen, dein Geburtsdatum, deinen Bestätigungscode und deine Antworten – schicke sie nur an diese Adresse.");
  const [fdl] = await Promise.all([fp.waitForEvent("download"), fp.click("#submit-esc-pdf")]);
  expect(fdl.suggestedFilename()).toBe(`Escape-Room-FastFashion-Test-Abschluss-${ymd()}-nicht-abgegeben.pdf`);
  expect((await fp.evaluate(() => window.__blobTypes)).at(-1)).toBe("application/octet-stream");
  const fpdf = await readFile(await fdl.path());
  await escSave("7o-nicht-abgegeben.pdf", fpdf);
  await shots(fp, "escape-gescheitert", [375, 1280], ESC_OUT);
  pdfStructure(fpdf, 5);
  const ftext = pdfShownText(fpdf);
  expect(ftext.indexOf(ESC_FAILED)).toBe(0);   // ganz oben
  for (const x of ["noch nicht abgegeben", "Antwort von Eri.", "Name: Erika Musterfrau", "Bestätigungscode: 27182818", "• <img src=x onerror=window.__x=1>"]) expect(ftext).toContain(x);
  expect(ftext).not.toContain("Tippzeit");
  expect(ftext).not.toContain("abgegeben am");
  // Antwort ohne JSON (z. B. eine Zwischenstelle) → ebenso technisch
  await fp.unroute("**/api/submit");
  await fp.route("**/api/submit", (r) => { posts++; return r.fulfill({ status: 403, contentType: "text/html", body: "<html><body>Forbidden</body></html>" }); });
  await trySubmit();
  await expect(box).toBeVisible();
  // Prüffehler des Servers → kein E-Mail-Weg (neu laden und noch einmal abgeben hilft)
  await failWith(400, { ok: false, error: "Die Abgabe ist beschädigt.", code: "bad_envelope" });
  await trySubmit();
  await expect(box).toBeHidden();
  // Blatt voll (409): zuerst die Lehrkraft (sie kann Einträge löschen) – der E-Mail-Weg erst, wenn es danach wieder scheitert
  await failWith(409, { ok: false, error: "Für dieses Feibeitsblatt sind bereits sehr viele Abgaben gespeichert. Bitte wende dich an deine Lehrkraft.", code: "too_many_submissions" });
  await trySubmit();
  await expect(fp.locator("#submit-status")).toContainText("Bitte wende dich an deine Lehrkraft.");
  await expect(box).toBeHidden();
  await trySubmit();
  await expect(box).toBeVisible();
  // Blatt gelöscht (404): sofort
  await failWith(404, { ok: false, error: "Zu diesem Code gibt es kein Feibeitsblatt.", code: "not_found" });
  await trySubmit();
  await expect(box).toBeVisible();
  // zu viele Abgaben aus diesem Netz (429): erst warten – vor Ablauf der Wartezeit kein E-Mail-Weg, auch nicht beim zweiten Mal …
  const RATE = "Gerade wurden von diesem Netzwerk sehr viele Abgaben gesendet. Bitte versuche es in etwa 1 Minute erneut – deine Antworten bleiben auf diesem Gerät gespeichert.";
  await failWith(429, { ok: false, error: RATE, code: "rate_limited", retryAfter: 60 });
  await trySubmit();
  await expect(fp.locator("#submit-status")).toHaveText(RATE + " Deine Antworten sind noch da.");
  await expect(box).toBeHidden();
  await trySubmit();
  await expect(box).toBeHidden();
  // … nach der Wartezeit schon (hier 1 Sekunde; ein Netzfehler dazwischen beginnt neu)
  await failWith(0);
  await trySubmit();
  await expect(box).toBeVisible();
  await failWith(429, { ok: false, error: RATE, code: "rate_limited", retryAfter: 1 });
  await trySubmit();
  await expect(box).toBeHidden();
  await fp.waitForTimeout(1200);
  await trySubmit();
  await expect(box).toBeVisible();
  await fp.unroute("**/api/submit");
  await fp.click("#submit-btn");
  await confirmDialog(fp, "Ohne KI-Feedback abgeben?");
  await expect(fp.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  await expect(box).toBeHidden();
  expect(await fp.evaluate(() => [document.querySelectorAll("img[src=x]").length, window.__x])).toEqual([0, undefined]);
  await closePage(f);

  /* ---------- 11b. Abgabe zu groß (zweimal 413): erst ohne Tippzeiten, dann ohne die Fehler-Einzelheiten – sie scheitert nie daran ---------- */
  const l = await openPage(browser);
  const lp = l.page;
  const lena = escRec(ESCT.code, { person: { vorname: "Lena", nachname: "Beispiel", geburtsdatum: "12.03.2010", klasse: "10c" }, confirm: "16180339" });
  await lp.goto("about:blank"); await lp.goto(escLink(escHull(lena)));
  await expect(lp.locator("#screen-person")).toHaveClass(/active/);
  await lp.click("#p-btn");
  await expect(lp.locator("#screen-editor")).toHaveClass(/active/);
  await typeAt(lp, "#a-1", "Antwort von Len.");
  const sent = [];
  await lp.route("**/api/submit", (r) => {
    sent.push(JSON.parse(r.request().postData()));
    return sent.length <= 2 ? r.fulfill({ status: 413, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Die Abgabe ist zu groß.", code: "too_large" }) }) : r.continue();
  });
  await lp.click("#submit-btn");
  await confirmDialog(lp, "Ohne KI-Feedback abgeben?");
  await expect(lp.locator("#screen-done")).toHaveClass(/active/, { timeout: 30_000 });
  expect(sent.length).toBe(3);
  const [l1, l2, l3] = await Promise.all(sent.map((b) => openEnvelope(priv, b.envelope)));
  const withErrors = (x) => x.stations.some((st) => st.errors.length > 0);
  expect(l1.typing.answers.length).toBe(2);   // erst mit Tippzeiten und Fehlern
  expect(withErrors(l1.escape)).toBe(true);
  expect(l2.typing).toEqual({ v: 1, omitted: "too_large" });   // dann ohne Tippzeiten
  expect(withErrors(l2.escape)).toBe(true);
  expect(l3.typing).toEqual({ v: 1, omitted: "too_large" });   // zuletzt auch ohne die Fehler-Einzelheiten
  expect(l3.escape.omitted).toBe("too_large");
  expect(withErrors(l3.escape)).toBe(false);
  expect(l3.escape.stations.map((st) => st.attempts)).toEqual(ESC_STATIONS.map((st) => st.attempts));
  await lp.unroute("**/api/submit");
  await closePage(l);

  /* ---------- 12. Lehrkraft-Ansicht ---------- */
  const t = await openPage(browser);
  const tp = t.page;
  await t.context.addInitScript(blobSpy);
  await tp.reload();
  await expect(tp.locator("#screen-start")).toHaveClass(/active/);
  await teacherLogin(tp, PW);
  await tp.locator("#t-sheets-body tr", { hasText: "Finale FastFashion" }).click();
  await expect(tp.locator("#t-subs-body tr.main")).toHaveCount(3);
  await tp.click("#t-expand-all");
  const dmax = tp.locator("#t-subs-body tr.details", { hasText: "Kaya hat gelernt" }).locator(".desc").first();
  const deri = tp.locator("#t-subs-body tr.details", { hasText: "Antwort von Eri." }).locator(".desc").first();
  await expect(tp.locator("#t-subs-body tr.details .desc")).toHaveCount(3);
  // Lena: Abgabe nur ohne Tippzeiten und ohne Fehler-Einzelheiten angekommen (11b)
  const dlen = tp.locator("#t-subs-body tr.details", { hasText: "Antwort von Len." });
  await expect(dlen.locator(".desc-sum")).toHaveText("Abgeschlossen am 27.10.2026, 11:15 Uhr · im ersten Versuch fehlerfrei: 4 von 6 Stationen · " +
    "Fehler im ersten Versuch: nicht übermittelt (die Abgabe wäre sonst zu groß gewesen) · Zwischenstand-Dateien des Escape-Rooms: 1");
  await expect(dlen.locator(".dtt-sum")).toHaveText("Tippzeiten: nicht übermittelt – die Abgabe wäre sonst zu groß gewesen.");
  await dlen.locator("details.desc-more summary").click();
  await expect(dlen.locator(".desc-att, .desc-ok").nth(1)).toHaveText("3 Versuche – die Fehler im ersten Versuch wurden nicht übermittelt");
  await expect(dmax.locator(".desc-h")).toHaveText("Escape-Room „FastFashion-Test“");
  await expect(dmax.locator(".desc-sum")).toHaveText("Abgeschlossen am 27.10.2026, 11:15 Uhr · im ersten Versuch fehlerfrei: 4 von 6 Stationen · Fehler im ersten Versuch insgesamt: 3 · Zwischenstand-Dateien des Escape-Rooms: 1");
  await expect(dmax.locator(".desc-check")).toHaveText("Prüfsumme des Datensatzes: stimmt – ein Indiz, kein Beweis.");
  await expect(deri.locator(".desc-check")).toHaveText("Prüfsumme des Datensatzes: stimmt nicht – der Datensatz wurde verändert oder ist beschädigt.");
  await expect(deri.locator(".desc-check")).toHaveClass(/bad/);
  await expect(deri.locator(".desc-sum")).toHaveText(/ · im ersten Versuch fehlerfrei: 0 von 1 Station · Fehler im ersten Versuch insgesamt: 1 · Zwischenstand-Dateien des Escape-Rooms: keine$/);
  // „Überblick ansehen“ wird erst beim Aufklappen gebaut: Codewort, je Station Versuche und Fehler, Zwischenstand-Dateien
  await expect(dmax.locator(".desc-body")).toHaveCount(0);
  await dmax.locator("details.desc-more summary").click();
  const mbody = dmax.locator(".desc-body");
  await expect(mbody.locator(".desc-word")).toHaveText("Codewort: GLOBUS");
  await expect(mbody.locator("h5")).toHaveText([...ESC_STATIONS.map((st) => st.label), "Zwischenstand-Dateien des Escape-Rooms"]);
  await expect(mbody.locator(".desc-ok, .desc-att")).toHaveText(["1 Versuch – fehlerfrei", "3 Versuche – beim ersten Versuch nicht korrekt:", "2 Versuche – beim ersten Versuch nicht korrekt:",
    "1 Versuch – fehlerfrei", "1 Versuch – fehlerfrei", "1 Versuch – fehlerfrei"]);
  await expect(mbody.locator(".desc-errs li").first()).toHaveText("Rohstoff für PolyesterAntwort: BaumwolleRichtig: ErdölPolyester ist ein Kunststoff.");
  await expect(mbody.locator(".desc-errs li b")).toHaveText(["Rohstoff für Polyester", "Wasserbedarf", "Lohnanteil am Preis"]);
  await expect(mbody.locator(".desc-res li")).toHaveText(["nach Station 2 · gespeichert am 26.10.2026, 10:00 Uhr · geladen am 27.10.2026, 09:00 Uhr"]);
  await deri.locator("details.desc-more summary").click();
  await expect(deri.locator(".desc-errs li b")).toHaveText(["<img src=x onerror=window.__x=1>"]);
  await expect(deri.locator(".desc-body > p").last()).toHaveText("Keine.");
  expect(await tp.evaluate(() => [document.querySelectorAll("img[src=x]").length, window.__x])).toEqual([0, undefined]);
  for (const x of ["Maximilian", "Mustermann", "31415926", "27182818", "Erika", "Beispiel", "16180339"]) await expect(tp.locator("#t-subs")).not.toContainText(x);
  const [tdl] = await Promise.all([tp.waitForEvent("download"), dmax.locator("button.desc-pdf").click()]);
  expect(tdl.suggestedFilename()).toMatch(new RegExp(`^Escape-Room-FastFashion-Test-Ueberblick-${ESCT.shown}-Eintrag-\\d+\\.pdf$`));
  const tpdf = await readFile(await tdl.path());
  await escSave("7o-lehrkraft-ueberblick.pdf", tpdf);
  pdfStructure(tpdf, 5);
  expect((await tp.evaluate(() => window.__blobTypes)).at(-1)).toBe("application/octet-stream");
  const ttext = pdfShownText(tpdf);
  expect(ttext).toContain("Mu · Max · Geburtstag 04.05. · Klasse 10b");
  expect(ttext).toContain("Prüfsumme des Datensatzes: stimmt – ein Indiz, kein Beweis.");
  for (const x of ["Maximilian", "Mustermann", "31415926", "Bestätigungscode:", "Genaue Daten"]) expect(ttext).not.toContain(x);
  // Lösungs-PDF der Abgabe (wie bei jedem Blatt): nur die Lösungsseiten samt nachgereichter zweiter Rückmeldung – ohne die Seiten aus dem
  // Escape-Room (dafür „Überblick als PDF herunterladen“), ohne Tippzeiten, ohne vollen Namen und Bestätigungscode
  const detMax = tp.locator("#t-subs-body tr.details", { hasText: "Kaya hat gelernt" });
  await expect(detMax.locator(".dtask").nth(1).locator(".dfb2 .fb-head")).toHaveText("KI-Rückmeldung zur abgegebenen Fassung");
  await expect(detMax.locator(".dtask").nth(0).locator(".dfb2")).toHaveCount(0);
  await expect(detMax.locator(".dtt-sum")).toHaveCount(1);   // die Tippzeiten sind nach dem Nachreichen noch da
  const [ldl] = await Promise.all([tp.waitForEvent("download"), detMax.locator("button.dpdf").click()]);
  expect(ldl.suggestedFilename()).toBe(`Feibeitsblatt-Loesungen-${ESCT.shown}-10b-MaxMu-${ymd()}.pdf`);
  const lpdf = await readFile(await ldl.path());
  await escSave("7o-lehrkraft-loesungen.pdf", lpdf);
  pdfStructure(lpdf, 5);
  expect(lpdf.toString("latin1")).toContain("/Metadata ");   // KI-Kennzeichnung (XMP) wie bei den Schüler:innen
  const ltext = pdfShownText(lpdf);
  for (const x of ["Meine Lösungen – Finale FastFashion", "Max · Mu · Klasse 10b", "KI-Rückmeldung zur abgegebenen Fassung:", "Ich finde, sie sollte nicht werben. Denn Fast Fashion schadet."]) expect(ltext, x).toContain(x);
  for (const x of [...SECRET, "Überblick", "Escape-Room", "Codewort", "GLOBUS", "Rohstoff für Polyester", "Lösungserläuterungen", "Tippzeit"]) expect(ltext, x).not.toContain(x);
  for (const a of finalP.typing.answers) for (const b of [a.first, a.final]) if (typeof b === "string" && b.length > 4) expect(lpdf.toString("latin1")).not.toContain(b);
  // eine Überblick-PDF ist keine Sicherung eines Feibeitsblatts
  await tp.setInputFiles("#t-import-file", { name: "Ueberblick.pdf", mimeType: "application/pdf", buffer: overviewPdf(hull) });
  await expect(tp.locator("#t-import-status")).toHaveText("Das ist eine Überblick-PDF aus einem Escape-Room (von Schüler:innen), kein gesichertes Feibeitsblatt. Bitte wählen Sie eine Datei, die Sie mit „Als PDF-Datei herunterladen“ gesichert haben.");
  // „Als Vorlage verwenden“: das neue Blatt gehört wieder zum Escape-Room
  const finale = tp.locator("#t-sheets-body tr", { hasText: "Finale FastFashion" });
  await finale.click();
  await expect(tp.locator("#t-sel-meta")).toContainText("2 Aufgaben");
  await tp.click("#t-template");
  await expect(tp.locator("#tv-builder")).toBeVisible();
  await expect(tp.locator("#b-esc")).toBeChecked();
  await expect(tp.locator("#b-esc-fields")).toBeVisible();
  expect([await tp.inputValue("#b-esc-name"), await tp.inputValue("#b-esc-id")]).toEqual([ESC_ROOM.name, ESC_ROOM.id]);
  await expect(tp.locator("#b-import")).toHaveText("Das neue Feibeitsblatt gehört wieder zum Escape-Room „FastFashion-Test“ und bekommt einen neuen Code – tragen Sie ihn danach im Quelltext des Escape-Rooms ein.");
  // der Hinweis gilt nur, solange das neue Blatt wirklich zu diesem Escape-Room gehört (Haken, Name und Kennung)
  await tp.click("#b-esc");
  await expect(tp.locator("#b-esc")).not.toBeChecked();
  await expect(tp.locator("#b-esc")).toBeFocused();   // kein Fokussprung
  await expect(tp.locator("#b-import")).toBeHidden();
  await tp.click("#b-esc");
  await expect(tp.locator("#b-esc")).toBeFocused();
  await expect(tp.locator("#b-import")).toBeVisible();
  await tp.fill("#b-esc-name", "Anderer Raum");
  await expect(tp.locator("#b-import")).toBeHidden();
  await tp.fill("#b-esc-name", ESC_ROOM.name);
  await expect(tp.locator("#b-import")).toBeVisible();
  await tp.click("#b-back");   // geändert (und zurückgeändert) → Rückfrage
  await confirmDialog(tp, "Eingaben verwerfen?");
  await expect(tp.locator("#tv-overview")).toBeVisible();
  // Sicherung: Datensatz mit escape (ohne Abgaben), sichtbar eine Zeile zum Escape-Room → Import → neues Blatt für denselben Raum
  await finale.click();
  await expect(tp.locator("#t-sel-meta")).toContainText("2 Aufgaben");
  const [xdl] = await Promise.all([tp.waitForEvent("download"), tp.click("#t-export")]);
  expect(xdl.suggestedFilename()).toBe(`Feibeitsblatt-${ESCT.shown}-Finale FastFashion.pdf`);
  const xpdf = await readFile(await xdl.path());
  await escSave("7o-sicherung.pdf", xpdf);
  const xs = pdfStream(xpdf, "/FbSheet 1"), xraw = xpdf.subarray(xs.start, xs.start + xs.len);
  const xrec = JSON.parse((xs.dict.includes("/FlateDecode") ? inflateSync(xraw) : xraw).toString("utf8"));
  expect(xrec).toMatchObject({ kind: "feibeitsblatt-sheet", v: 1, code: ESCT.code, title: "Finale FastFashion", escape: ESC_ROOM });
  for (const x of [...SECRET, "Kaya hat gelernt", "Antwort von Eri.", "GLOBUS", "Rohstoff für Polyester"]) expect(JSON.stringify(xrec), x).not.toContain(x);   // keine Abgaben
  expect(pdfShownText(xpdf)).toContain("Escape-Room: „FastFashion-Test“ (Kennung test-escape) – Schüler:innen öffnen dieses Feibeitsblatt über den Escape-Room.");
  await tp.setInputFiles("#t-import-file", { name: "Sicherung.pdf", mimeType: "application/pdf", buffer: xpdf });
  await expect(tp.locator("#tv-builder")).toBeVisible();
  await expect(tp.locator("#b-esc")).toBeChecked();
  expect([await tp.inputValue("#b-esc-name"), await tp.inputValue("#b-esc-id")]).toEqual([ESC_ROOM.name, ESC_ROOM.id]);
  await expect(tp.locator("#b-import")).toContainText(`(bisheriger Code ${ESCT.shown}`);
  await expect(tp.locator("#b-import")).toContainText("Es gehört zum Escape-Room „FastFashion-Test“ – den neuen Code tragen Sie danach im Quelltext des Escape-Rooms ein.");
  await tp.uncheck("#b-esc");   // ohne Haken: ein normales Blatt – der Satz zum Escape-Room verschwindet, der übrige Hinweis bleibt
  await expect(tp.locator("#b-import-esc")).toBeHidden();
  await expect(tp.locator("#b-import")).toBeVisible();
  await tp.check("#b-esc");
  await expect(tp.locator("#b-import-esc")).toBeVisible();
  await tp.fill("#b-title", "Finale FastFashion – Kurs B");
  await tp.click("#b-gen");
  await expect(tp.locator("#b-res-esc")).toBeVisible();
  const code2 = (await tp.locator("#b-res-code").textContent()).trim();
  expect(code2).not.toBe(ESCT.shown);
  expect((await (await tp.request.get("/api/sheet/" + code2.replace("-", ""))).json()).sheet.escape).toEqual(ESC_ROOM);
  await tp.click("#b-res-back");
  await expect(tp.locator("#t-sel-code")).toHaveText(code2);
  await tp.click("#t-del-sheet");
  await confirmDialog(tp, "Feibeitsblatt löschen?");
  await expect(tp.locator("#t-list-status")).toHaveText("Feibeitsblatt gelöscht.");
  // Blatt löschen: der Dialog nennt den Escape-Room; danach meldet das Finale, dass es kein Blatt mehr gibt
  await finale.click();
  await expect(tp.locator("#t-sel-code")).toHaveText(ESCT.shown);
  await tp.click("#t-del-sheet");
  expect(await confirmDialog(tp, "Feibeitsblatt löschen?")).toContain("Der Escape-Room „FastFashion-Test“ verweist mit seinem Arena-Tunnel auf diesen Code");
  await expect(tp.locator("#t-sheets-body tr", { hasText: "Finale FastFashion" })).toHaveCount(0);
  await closePage(t);
  const n = await openPage(browser);
  await n.page.goto("about:blank"); await n.page.goto(escLink(hull));
  await expect(n.page.locator("#start-err")).toHaveText(ESC_NO_SHEET);
  await expect(n.page.locator("#screen-start")).toHaveClass(/active/);
  await closePage(n);
});

test("8 Passwort ändern: neues Passwort gilt, altes nicht mehr; bisherige Abgaben bleiben lesbar", async ({ browser, request }) => {
  const t = await openPage(browser);
  const { page } = t;
  await teacherLogin(page, PW);

  // neues Blatt (Titel leer → „Feibeitsblatt vom …“) und eine Abgabe vor dem Passwortwechsel
  await page.click("#t-new");
  await page.fill("#bs-2", "Auftrag an die KI ohne Aufgabe");
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
  const payload = { v: 1, sheetCode: code2, sheetTitle: sheet.title, person: { vorname: "Kim", nachname: "Wo", geburtsdatum: "--02-03", klasse: "9c" },
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
  await expect(page.locator("#t-subs-body tr.main td:not(.arrowcol)")).toHaveText(["Wo", "Kim", "03.02.", "9c"]);
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
