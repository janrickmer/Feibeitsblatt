// fbtask.test.mjs – KI-Feedback zu einzelnen Aufgaben: die reinen Hilfsfunktionen aus index.html (Block FBTASK:BEGIN … FBTASK:END)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const i = html.indexOf("/* FBTASK:BEGIN"), j = html.indexOf("/* FBTASK:END */");
const block = html.slice(i, j);
const NAMES = "FBT_NO_AI, FBT_LABEL, FBT_DONE, FBT_REST, fbtAria, fbtList, fbtTo, fbtCleanAiTasks, fbtPerTask, fbtHas, fbtNums, fbtSig, fbtPartial, fbtOpen, " +
  "fbtRequest, fbtMerge, fbtPairs, fbtAts, fbtAtsOut, fbtTeacher, fbtNoFbList, fbtAtsDiffer, fbtEmptyOne, fbtEmptyRest, FBT_FINAL, FBT_NO_AI_MORE, " +
  "fbtDialog, fbtRest, fbtFinText, fbtReviseText, fbtEdHint, fbtFallback, fbtBusyIn, fbtArrived, fbtGot, FBT_PDF_ONCE, fbtFirstHint, FBT_FIRST_NONE_AI, FBT_FIRST_NONE, fbtMeta";
const F = new Function(block + "\nreturn { " + NAMES + " };")();
const body = (start, end) => { const a = html.indexOf(start), b = html.indexOf(end, a); assert.ok(a > 0 && b > a, start); return html.slice(a, b); };
// normFb aus index.html (die Normalisierung einer Rückmeldung) – fbtMerge, fbtPairs und fbtTeacher bekommen sie als Parameter
const normFb = new Function(body("function normFb(r) {", "\n}\n") + "\n}\nreturn normFb;")();
const FB_VOLUNTARY = new Function(body("const FB_VOLUNTARY = ", ";\n") + ";\nreturn FB_VOLUNTARY;")();
// wie NO_TT in den E2E-Tests: an sichtbaren Stellen nur der eine Satz der Kurzfassung zur Tippzeit-Messung
const NO_TT = /Tippzeit|misst|Messung|gemessen|Zeitmess|Schreibprozess|widersprech|Widerspruch|Schalter|Haken/i;

test("fbtask: Block gefunden, ohne Abhängigkeiten, Weltkarte und Foto nie an die KI", () => {
  assert.ok(i > 0 && j > i);
  assert.doesNotMatch(block, /\bdocument\b|\bwindow\b|[^\w.]S\.|\$\(|\bh\(/);
  assert.deepEqual(F.FBT_NO_AI, ["map", "photo"]);
  assert.ok(html.includes('const NO_AI_KINDS = new Set(["map", "photo"]);'));   // dieselben Antwortarten
  assert.equal(F.fbtList([3]), "3");
  assert.equal(F.fbtList([1, 2, 4]), "1, 2 und 4");
  assert.ok(html.includes('function listNums(arr) { return arr.length === 1 ? String(arr[0]) : arr.slice(0, -1).join(", ") + " und " + arr[arr.length - 1]; }'));
});

test("fbtask: aiTasks vom Server bereinigen – Ganzzahlen 1…n, sortiert, ohne Doppelte, ohne Weltkarte und Foto; fehlt → null", () => {
  const kinds = ["text", "table", "map", "photo", "text"];
  assert.deepEqual(F.fbtCleanAiTasks([5, 1, 2, 2, 3, 4, 0, 6, -1, 1.5, "2", null], kinds), [1, 2, 5]);
  assert.deepEqual(F.fbtCleanAiTasks([], kinds), []);
  for (const bad of [undefined, null, "1,2", { 0: 1 }, 3]) assert.equal(F.fbtCleanAiTasks(bad, kinds), null);
  assert.equal(F.fbtCleanAiTasks([1], null), null);
  assert.deepEqual(F.fbtCleanAiTasks(Array.from({ length: 100 }, (_, k) => 1 + (k % 3)), ["text", "text", "text"]), [1, 2, 3]);
  // Buttons je Aufgabe nur bei mindestens zwei Aufgaben mit Auftrag und einem Blatt mit KI-Feedback
  assert.equal(F.fbtPerTask([1, 2], true), true);
  assert.equal(F.fbtPerTask([1, 2], undefined), true);
  assert.equal(F.fbtPerTask([1], true), false);
  assert.equal(F.fbtPerTask([], true), false);
  assert.equal(F.fbtPerTask(null, true), false);   // älterer Worker ohne aiTasks: nur der Button unten
  assert.equal(F.fbtPerTask([1, 2], false), false);
  // fetchSheet liest das Feld (Antwortart je Aufgabe aus cleanAnswer)
  assert.ok(body("async function fetchSheet(", "\n}\n").includes("aiTasks: fbtCleanAiTasks(sh.aiTasks, sh.tasks.map((t) => cleanAnswer(t && t.answer).type)),"));
});

test("fbtask: Zustand je Aufgabe – erhalten, Kennzeichen, teilweise, offen für den Button unten", () => {
  const fb = [{ covered: ["a"], missing: [] }, null, { covered: [], missing: ["b"] }, null];
  assert.equal(F.fbtHas(fb, 0), true);
  assert.equal(F.fbtHas(fb, 1), false);
  assert.equal(F.fbtHas(null, 0), false);
  assert.deepEqual(F.fbtNums(fb), [1, 3]);
  assert.deepEqual(F.fbtNums(null), []);
  assert.equal(F.fbtSig(fb), "1,3");
  assert.equal(F.fbtSig(null), "");
  assert.equal(F.fbtPartial(fb), true);
  assert.equal(F.fbtPartial([{}, {}]), false);   // wie bisher: Feedback zu allen Aufgaben
  assert.equal(F.fbtPartial(null), false);
  // offen: ohne jedes Feedback null (der Button unten fragt wie bisher alle), sonst die Aufgaben mit Auftrag ohne Feedback
  assert.equal(F.fbtOpen(null, [1, 2], ["text", "text"]), null);
  assert.deepEqual(F.fbtOpen(fb, [1, 2, 3], ["text", "text", "text", "text"]), [2]);
  assert.deepEqual(F.fbtOpen(fb, [1, 3], ["text", "text", "text", "text"]), []);   // Aufgabe 2 und 4 ohne Auftrag: nichts mehr offen
  assert.deepEqual(F.fbtOpen([{}, {}, {}], [1, 2], ["text", "text", "text"]), []);
  // älterer Worker (ohne aiTasks): alle Aufgaben ohne Feedback außer Weltkarte und Foto
  assert.deepEqual(F.fbtOpen(fb, null, ["text", "map", "text", "table"]), [4]);
  assert.deepEqual(F.fbtOpen(fb, null, null), [2, 4]);
  assert.deepEqual(F.fbtOpen([null, {}], [0, 1, 2, 9, 1.5], ["text", "text"]), [1]);   // nur gültige Nummern
});

test("fbtask: Anfrage – nur die angefragten Antworten, die übrigen leer; ohne Ziel alle wie bisher", () => {
  const texts = ["eins", "zwei", "drei"];
  assert.deepEqual(F.fbtRequest(texts, [2]), ["", "zwei", ""]);
  assert.deepEqual(F.fbtRequest(texts, [1, 3]), ["eins", "", "drei"]);
  const all = F.fbtRequest(texts, null);
  assert.deepEqual(all, texts);
  assert.notEqual(all, texts);   // eine Kopie
  // requestFeedback: ohne Ziel derselbe Rumpf wie bisher (ohne only), mit Ziel only = die angefragten Nummern
  const req = body("async function requestFeedback(target) {", "\n}\n");
  assert.ok(req.includes("body: targets ? { code: S.code, answers, recipients, only: targets } : { code: S.code, answers, recipients },"));
  assert.ok(req.includes("let targets = one ? [target + 1] : S.feedback ? fbOpenNums() : null;"));
  assert.ok(req.includes('if (one && empty.length) { setStatus(st, fbtEmptyOne(target + 1), "bad"); return; }'));
  assert.ok(html.includes('$("fb-btn").addEventListener("click", () => requestFeedback(null));'));   // nie das Klick-Ereignis als Ziel
  assert.ok(html.includes('btn.addEventListener("click", () => requestFeedback(n - 1));'));
  // die finale KI-Rückmeldung bleibt unverändert: alle Aufgaben, nie only
  assert.ok(!body("async function requestFinalFeedback()", "\n}\n").includes("only"));
});

test("fbtask: Antwort einarbeiten – ohne Ziel wie bisher, sonst nur die angefragten Aufgaben", () => {
  const at = "2026-11-17T10:00:00.000Z", at2 = "2026-11-17T10:05:00.000Z";
  // ohne Ziel: erste Fassung = gesendete Antworten, alle Rückmeldungen (wie bisher results.map(normFb)), keine Zeitpunkte je Aufgabe
  const results = [{ covered: ["gut"], missing: [] }, { covered: [], missing: [], note: "Zu dieser Aufgabe gibt es kein KI-Feedback." }];
  const full = F.fbtMerge({}, null, ["a", "b"], ["AAA=", null], results, normFb, at);
  assert.deepEqual(full, { first: ["a", "b"], feedback: results.map(normFb), typing: ["AAA=", null], ats: null, at });
  assert.equal(F.fbtMerge({}, null, ["a", "b"], null, results, normFb, at).typing, null);   // widersprochen bzw. verworfen
  assert.equal(F.fbtMerge({}, null, ["a", "b"], null, [results[0]], normFb, at), null);   // falsche Länge → unvollständig
  assert.equal(F.fbtMerge({}, null, ["a", "b"], null, null, normFb, at), null);
  // eine Aufgabe (only:[2]): nur sie, die übrigen null
  const one = F.fbtMerge({ first: null, feedback: null, typing: null, ats: null, at: null }, [2], ["", "zwei", ""], ["X", "Y", "Z"],
    [null, { covered: ["c"], missing: ["d"], extra: 1 }, null], normFb, at);
  assert.deepEqual(one, { first: [null, "zwei", null], feedback: [null, { covered: ["c"], missing: ["d"] }, null], typing: [null, "Y", null], ats: [null, at, null], at });
  // danach die übrigen (only:[1, 3]) – Aufgabe 2 bleibt, der früheste Zeitpunkt bleibt feedbackAt
  const rest = F.fbtMerge(one, [1, 3], ["eins", "", "drei"], null, [{ covered: [], missing: ["e"] }, null, { covered: ["f"], missing: [] }], normFb, at2);
  assert.deepEqual(rest.first, ["eins", "zwei", "drei"]);
  assert.deepEqual(rest.feedback.map((f) => f && f.covered.concat(f.missing)), [["e"], ["c", "d"], ["f"]]);
  assert.deepEqual(rest.typing, [null, "Y", null]);   // inzwischen widersprochen: die neuen ohne Werte
  assert.deepEqual(rest.ats, [at2, at, at2]);
  assert.equal(rest.at, at);
  // unbrauchbar: keine Rückmeldung zu einer angefragten Aufgabe, falsche Länge, falsches Ziel
  assert.equal(F.fbtMerge(one, [1], ["eins", "", ""], null, [null, null, null], normFb, at2), null);
  assert.equal(F.fbtMerge(one, [1], ["eins", "", ""], null, ["text", null, null], normFb, at2), null);
  assert.equal(F.fbtMerge(one, [1], ["eins", "", ""], null, [{}, null], normFb, at2), null);
  assert.equal(F.fbtMerge(one, [4], ["eins", "", ""], null, [{}, null, null], normFb, at2), null);
  assert.equal(F.fbtMerge(one, [], ["eins", "", ""], null, [{}, null, null], normFb, at2), null);
  // ein älterer, voller Stand ohne Zeitpunkte je Aufgabe: die bisherigen bekommen feedbackAt
  const old = F.fbtMerge({ first: ["a", null], feedback: [{ covered: [], missing: [] }, null], typing: null, ats: null, at }, [2], ["", "b"], null,
    [null, { covered: ["x"], missing: [] }], normFb, at2);
  assert.deepEqual(old.ats, [at, at2]);
  assert.equal(old.typing, null);
  // requestFeedback arbeitet über fbtMerge ein (Tippzeiten nur ohne Widerspruch und ohne verworfene Messung)
  assert.ok(body("async function requestFeedback(target) {", "\n}\n").includes("S.ttOptOut || ttGen !== S.ttGen ? null : typing, r.results, normFb, new Date().toISOString());"));
});

test("fbtask: Zwischenstand – je Aufgabe beide oder keines; ältere Stände bleiben unverändert", () => {
  const fb = { covered: ["a"], missing: ["b"] };
  // älterer Stand: überall beide
  assert.deepEqual(F.fbtPairs(["x", ""], [fb, { covered: [], missing: [], note: "n" }], 2, normFb, 100),
    { first: ["x", ""], feedback: [fb, { covered: [], missing: [], note: "n" }] });
  // teilweise: die null-Paare bleiben (nie zu „angefordert, leer“)
  assert.deepEqual(F.fbtPairs([null, "y"], [null, fb], 2, normFb, 100), { first: [null, "y"], feedback: [null, fb] });
  // halbe Paare fallen weg; nichts übrig → beide null
  assert.deepEqual(F.fbtPairs(["x", null], [null, fb], 2, normFb, 100), { first: null, feedback: null });
  assert.deepEqual(F.fbtPairs(["x", "y"], [fb, "kaputt"], 2, normFb, 100), { first: ["x", null], feedback: [fb, null] });
  assert.deepEqual(F.fbtPairs(["x", "y"], [[fb], fb], 2, normFb, 100), { first: [null, "y"], feedback: [null, fb] });
  assert.deepEqual(F.fbtPairs(["x"], [fb], 2, normFb, 100), { first: null, feedback: null });   // falsche Länge
  assert.deepEqual(F.fbtPairs(null, [fb], 1, normFb, 100), { first: null, feedback: null });
  assert.deepEqual(F.fbtPairs(["abcdef"], [fb], 1, normFb, 3).first, ["abc"]);   // gekappt
  // Zeitpunkte je Aufgabe nur zu Aufgaben mit Feedback
  assert.deepEqual(F.fbtAts(["t1", "t2", 5], [fb, null, fb]), ["t1", null, null]);
  assert.deepEqual(F.fbtAts(["x".repeat(50)], [fb]), ["x".repeat(40)]);
  assert.equal(F.fbtAts(["t1"], [fb, fb]), null);
  assert.equal(F.fbtAts(null, [fb]), null);
  // in Erstversuch und Abgabe nur, wenn teilweise oder verschieden
  assert.equal(F.fbtAtsOut([fb, fb], ["t", "t"]), null);
  assert.deepEqual(F.fbtAtsOut([fb, fb], ["t", "u"]), ["t", "u"]);
  assert.deepEqual(F.fbtAtsOut([fb, null], ["t", null]), ["t", null]);
  assert.equal(F.fbtAtsOut(null, null), null);
  assert.equal(F.fbtAtsOut([fb, null], null), null);
  // Zwischenstand-PDF: „Stand: … · KI-Feedback zu den Aufgaben 1 und 3 erhalten“ (wie bisher „schon erhalten“ bei allen)
  assert.equal(F.fbtGot([fb, null, fb]), "zu den Aufgaben 1 und 3 erhalten");
  assert.equal(F.fbtGot([null, fb]), "zu Aufgabe 2 erhalten");
  assert.equal(F.fbtGot([fb, fb]), "schon erhalten");
  assert.doesNotMatch(F.FBT_PDF_ONCE, NO_TT);
  // openEditor und cleanDraft lesen über fbtPairs (null bleibt null)
  assert.ok(body("async function openEditor(fromPerson) {", "\n}\n").includes("fbtPairs(d.first.map((x) => (x == null ? null : String(x || \"\"))), d.feedback, sh.tasks.length, normFb, Infinity)"));
  assert.ok(body("function cleanDraft(o) {", "\n}\n").includes("fbtPairs(o.first, o.feedback, answers.length, normFb, MAX_ANSWER)"));
});

test("fbtask: Lehrkraft – je Aufgabe normalisiert oder null, Aufgaben ohne Feedback, Zeitpunkte", () => {
  assert.equal(F.fbtTeacher(null, normFb), null);
  assert.equal(F.fbtTeacher([null, null], normFb), null);   // ohne jede Rückmeldung wie ohne KI-Feedback
  assert.deepEqual(F.fbtTeacher([{ covered: ["a"], missing: 3 }, null, "x"], normFb), [{ covered: ["a"], missing: [] }, null, null]);
  assert.equal(F.fbtTeacher(Array.from({ length: 40 }, () => ({})), normFb).length, 30);
  assert.equal(F.fbtNoFbList(null, 3), null);
  assert.equal(F.fbtNoFbList([{}, {}], 2), null);   // ältere Einträge: wie bisher
  assert.deepEqual(F.fbtNoFbList([{}, null], 3), [false, true, true]);
  assert.equal(F.fbtAtsDiffer(["t", "t", null]), false);
  assert.equal(F.fbtAtsDiffer(["t", "u"]), true);
  assert.equal(F.fbtAtsDiffer(null), false);
  assert.equal(F.fbtMeta([1, 3], "17.11.2026, 10:00", false), "KI-Feedback zu den Aufgaben 1 und 3 am 17.11.2026, 10:00");
  assert.equal(F.fbtMeta([2], "17.11.2026, 10:00", true), "KI-Feedback zu Aufgabe 2, zuerst am 17.11.2026, 10:00");
  assert.equal(F.fbtFirstHint(false, [2]), "Diese Schülerin oder dieser Schüler hat KI-Feedback zu Aufgabe 2 angefordert, aber (noch) nicht abgegeben. " +
    "Gezeigt wird zu dieser Aufgabe die erste Fassung mit dem Feedback; die übrigen Antworten kommen erst mit der Abgabe. Eine spätere Abgabe ersetzt diesen Eintrag.");
  assert.match(F.fbtFirstHint(true, [1, 2]), /^Diese Gruppe hat KI-Feedback zu den Aufgaben 1 und 2 angefordert/);
  assert.equal(F.FBT_FIRST_NONE_AI, "(zu dieser Aufgabe noch kein KI-Feedback – noch nicht übermittelt)");
  // loadSubs und buildDetail nutzen sie; ältere Einträge (Feedback zu allen Aufgaben) sehen aus wie bisher
  const subs = body("async function loadSubs()", "\n}\n");
  assert.ok(subs.includes("if (Array.isArray(p.feedback)) p.feedback = fbtTeacher(p.feedback, normFb);"));
  const det = body("function buildDetail(", "\n}\n");
  assert.ok(det.includes("const partNo = fbtNoFbList(p.feedback, n)"));
  assert.ok(det.includes("n, isFirst, partNo || noFb); } catch (e) { tt = null; }"));
});

test("fbtask: Erstversuch – nach jedem weiteren Feedback ersetzt (Kennzeichen), Abgabe mit erster = abgegebener Fassung ohne Feedback", () => {
  const send = body("async function sendFirstAttempt() {", "\n}\n");
  assert.ok(send.includes("const grown = S.firstSent && fbtSig(S.feedback) !== S.firstSentSig;"));
  assert.ok(send.includes("S.firstSent = true; S.firstSentSig = sig;"));
  assert.ok(send.includes("if (fbtSig(S.feedback) !== sig) again = true;"));
  assert.ok(body("async function openEditor(fromPerson) {", "\n}\n").includes("if (S.feedback && (!S.firstSent || S.ttResend || fbtSig(S.feedback) !== S.firstSentSig)) sendFirstAttempt();"));
  // fbOut verträgt null (sonst scheitert die Abgabe mit „konnte nicht verschlüsselt werden“)
  const fbOut = new Function(body("const fbOut = ", ";\n") + ";\nreturn fbOut;")();
  assert.equal(fbOut(null), null);
  assert.deepEqual(fbOut({ covered: ["a"], missing: [], note: "n", x: 1 }), { covered: ["a"], missing: [], note: "n" });
  assert.deepEqual(fbOut({ covered: [], missing: ["b"] }), { covered: [], missing: ["b"] });
  const submit = body("async function submitAll()", "\n}\n");
  assert.ok(submit.includes("first: withFb && S.first[i] != null ? S.first[i] : fin, final: fin"));
  assert.ok(submit.includes("ft = withFb && S.feedback[i] ? (S.firstTyping && S.firstTyping[i]) || null : f;"));
  assert.ok(submit.includes("if (!!S.feedback !== withFb || fbtSig(S.feedback) !== fbSig) {"));
});

test("fbtask: Texte – Freiwilligkeit, Empfänger, „nur einmal“ je Aufgabe, keine Wörter zur Tippzeit-Messung", () => {
  const who = "Nur deine Antwort zu Aufgabe 2 geht – ohne Namenskürzel, Geburtstag und Klasse – über den Server dieser Seite an den KI-Dienst „X“.";
  const one = F.fbtDialog([2], true, [], FB_VOLUNTARY, who);
  assert.equal(one.title, "KI-Feedback zu Aufgabe 2 anfordern?");
  assert.equal(one.ok, "Feedback anfordern");
  assert.equal(one.cancel, "Weiterschreiben");
  assert.equal(one.safeFirst, true);
  assert.equal(one.text, `${FB_VOLUNTARY}\n${who}\nDas KI-Feedback zum Überarbeiten gibt es zu jeder Aufgabe nur einmal – zu Aufgabe 2 mit diesem Klick; ` +
    "nach der Abgabe gehen alle deine Antworten denselben Weg für die finale KI-Rückmeldung (beim Abgeben abwählbar; der Server speichert sie verschlüsselt zu deiner Abgabe, dort kann sie nur deine Lehrkraft lesen). " +
    "Deine Antwort zu Aufgabe 2 zum Zeitpunkt der Anfrage – ist die KI ausgelastet, dein Stand beim letzten automatischen Versuch – wird als erste Fassung gespeichert, " +
    "verschlüsselt an deine Lehrkraft übermittelt (als Erstversuch, der mit jedem weiteren KI-Feedback ersetzt wird) und später mit abgegeben.");
  const rest = F.fbtDialog([2, 4], false, [], FB_VOLUNTARY, "W");
  assert.equal(rest.title, "KI-Feedback zu den übrigen Aufgaben anfordern?");
  assert.ok(rest.text.includes("nur einmal – zu den Aufgaben 2 und 4 mit diesem Klick;"));
  assert.ok(rest.text.includes("Deine Antworten zu den Aufgaben 2 und 4 zum Zeitpunkt der Anfrage"));
  assert.ok(rest.text.includes(" werden als erste Fassung gespeichert"));
  assert.equal(F.fbtDialog([3], false, [], FB_VOLUNTARY, "W").title, "KI-Feedback zu Aufgabe 3 anfordern?");
  const empty = F.fbtDialog([2, 4], false, [4], FB_VOLUNTARY, "W");
  assert.equal(empty.title, "Noch nicht alles beantwortet");
  assert.equal(empty.ok, "Trotzdem anfordern");
  assert.match(empty.text, /^Aufgabe 4 ist noch leer\.\n/);
  assert.ok(empty.text.endsWith("Möchtest du es zu den Aufgaben 2 und 4 trotzdem jetzt anfordern?"));
  assert.match(F.fbtDialog([1, 2, 3], false, [1, 3], FB_VOLUNTARY, "W").text, /^Die Aufgaben 1 und 3 sind noch leer\./);
  for (const d of [one, rest, empty]) { assert.ok(d.text.includes(FB_VOLUNTARY)); assert.ok(d.text.includes("nur einmal")); }
  assert.equal(F.fbtEmptyOne(3), "Schreibe zuerst eine Antwort zu Aufgabe 3.");
  assert.equal(F.fbtEmptyRest([2]), "Bitte beantworte zuerst Aufgabe 2 – das Feld ist noch leer.");
  assert.equal(F.fbtEmptyRest([2, 3]), "Bitte beantworte zuerst die Aufgaben 2 und 3 – ihre Felder sind noch leer.");
  assert.equal(F.FBT_LABEL, "KI-Feedback nur zu dieser Aufgabe");
  assert.equal(F.FBT_DONE, "KI-Feedback zu dieser Aufgabe erhalten");
  assert.equal(F.FBT_REST, "KI-Feedback zu den übrigen Aufgaben");
  // der zugängliche Name enthält den sichtbaren Text und nennt die Nummer (WCAG 2.5.3, wie bei der Rechtschreibprüfung)
  assert.equal(F.fbtAria(2, false), "KI-Feedback nur zu dieser Aufgabe – Aufgabe 2");
  assert.equal(F.fbtAria(2, true), "KI-Feedback zu dieser Aufgabe erhalten – Aufgabe 2");
  assert.equal(F.fbtFinText([2, 4], FB_VOLUNTARY), "Wenn du alle Aufgaben bearbeitet hast, kannst du die KI um ein Feedback zu den übrigen Aufgaben (2 und 4) bitten und deine Antworten danach überarbeiten. " + FB_VOLUNTARY);
  assert.ok(F.fbtFinText([3], FB_VOLUNTARY).includes("um ein Feedback zu Aufgabe 3 bitten"));
  assert.equal(F.fbtReviseText([1], [3]), "Lies das KI-Feedback zu Aufgabe 1 und überarbeite dort deine Antwort: Nutze die Tipps, ergänze, was noch fehlt, und verbessere Rechtschreibung und Grammatik. " +
    "Zu Aufgabe 3 kannst du noch ein KI-Feedback anfordern. Wenn du fertig bist, klicke auf „Abgeben“ – abgegeben werden bei dieser Aufgabe beide Fassungen.");
  assert.ok(!F.fbtReviseText([1, 2], []).includes("noch ein KI-Feedback"));
  assert.equal(F.fbtEdHint([1, 2]), "Du hast das KI-Feedback zu den Aufgaben 1 und 2 erhalten. Überarbeite dort deine Antworten und gib danach ganz unten ab.");
  assert.equal(F.fbtFallback([2, 3], "KI ausgelastet", "später"), "Ein KI-Feedback zu den übrigen Aufgaben ist gerade nicht möglich (KI ausgelastet). Du kannst es später noch einmal versuchen oder trotzdem abgeben.");
  assert.ok(F.fbtFallback([2], "x", "morgen").startsWith("Ein KI-Feedback zu Aufgabe 2 ist"));
  // im Teil-Zustand nie „deine Lehrkraft sieht dann, dass das KI-Feedback nicht möglich war“ (noAi gibt es nur ganz ohne Feedback)
  assert.doesNotMatch(F.fbtFallback([2], "x", "später"), /Lehrkraft/);
  const all = [one.text, one.title, rest.text, rest.title, empty.text, F.fbtEmptyOne(1), F.fbtEmptyRest([1, 2]), F.FBT_LABEL, F.FBT_DONE, F.FBT_REST,
    F.fbtAria(1, false), F.fbtAria(1, true), F.fbtFinText([1], FB_VOLUNTARY), F.fbtReviseText([1], [2]), F.fbtEdHint([1]), F.fbtFallback([1], "x", "später"),
    F.FBT_NO_AI_MORE, F.FBT_FINAL, F.FBT_PDF_ONCE, F.fbtFirstHint(false, [1]), F.FBT_FIRST_NONE_AI, F.FBT_FIRST_NONE, F.fbtArrived([1]), F.fbtArrived([2, 3])];
  // keine Tippzeit-Wörter; Schüler:innen werden geduzt (nie „Sie“/„Ihr“, im Schreibbereich auch bei Gruppen kein „ihr“)
  for (const x of all) { assert.doesNotMatch(x, NO_TT, x); assert.doesNotMatch(x, /\b(ihr|euer|eure\w*|euch)\b/i, x); assert.doesNotMatch(x, /\b(Sie|Ihre?)\b/, x); }
});

test("fbtask: recipientSentence ohne Argument wie bisher (Abgabe-Dialog), mit Aufgaben „Nur deine Antwort zu …“", () => {
  const src = body("function recipientSentence(nums) {", "\n}\n") + "\n}";
  const make = (parts) => new Function("recipientParts", "noPersonData", "NO_AI_SET", "RESERVE_WHEN", "listNums", src + "\nreturn recipientSentence;")(
    () => parts, () => "ohne Namenskürzel, Geburtstag und Klasse", "KEIN", "nicht antwortet", (a) => a.slice(0, -1).join(", ") + " und " + a[a.length - 1]);
  const both = { first: "„A“", rest: ["„B“"], usa: true, cf: true, any: true };
  const rs = make(both);
  // bisheriger Wortlaut (fb2DialogLine im Abgabe-Dialog ruft sie ohne Argument)
  assert.equal(rs(), "Deine Antworten gehen – ohne Namenskürzel, Geburtstag und Klasse – über den Server dieser Seite an den KI-Dienst „A“. " +
    "Nur wenn dieser Dienst nicht antwortet, geht dieselbe Anfrage danach an „B“. Bei Cloudflare ist die KI-Verarbeitung auch außerhalb der EU möglich. " +
    "Die übrigen Dienste mit Sitz in den USA verarbeiten deine Texte außerhalb der EU.");
  assert.equal(rs(undefined), rs());
  assert.equal(rs([2]), "Nur deine Antwort zu Aufgabe 2 geht – ohne Namenskürzel, Geburtstag und Klasse – über den Server dieser Seite an den KI-Dienst „A“. " +
    "Nur wenn dieser Dienst nicht antwortet, geht dieselbe Anfrage danach an „B“. Bei Cloudflare ist die KI-Verarbeitung auch außerhalb der EU möglich. " +
    "Die übrigen Dienste mit Sitz in den USA verarbeiten deinen Text außerhalb der EU.");
  assert.match(rs([2, 4]), /^Nur deine Antworten zu den Aufgaben 2 und 4 gehen – /);
  assert.ok(rs([2, 4]).endsWith("verarbeiten deine Texte außerhalb der EU."));
  assert.equal(make({ first: "", rest: [], usa: false, cf: false, any: false })([1]), "KEIN Richtet deine Lehrkraft einen ein, nennt dir diese Seite ihn, bevor etwas gesendet wird.");
  assert.match(html, /"der Server speichert sie verschlüsselt zu deiner Abgabe, dort kann sie nur deine Lehrkraft lesen\. " \+ recipientSentence\(\)/);
});

test("fbtask: Tippzeiten der Lehrkraft (ttDetail) je Aufgabe – ohne eigenes KI-Feedback eine Fassung ohne Bezeichnung", () => {
  const tb = html.slice(html.indexOf("/* TYPING:BEGIN"), html.indexOf("/* TYPING:END */"));
  const { ttDetail, ttEncode } = new Function(tb + "\nreturn { ttDetail, ttEncode };")();
  const join = (pieces) => pieces.map((x) => x.t).join("");
  const b = (n, v) => ttEncode(new Uint8Array(n).fill(v));
  // Abgabe: Aufgabe 1 mit Feedback (erste Fassung anders), Aufgabe 2 ohne (erste = abgegebene, "=")
  const p = { answers: [{ first: "ab", final: "abc" }, { first: "xy", final: "xy" }], typing: { list: [{ first: b(2, 5), final: b(3, 50) }, { first: "=", final: b(2, 50) }] } };
  const det = ttDetail(p, ["text", "text"], 2, false, [false, true]);
  assert.equal(join(det.per[0].line), "Tippzeiten – Rot-Anteil: erste Eingabe 100 % (von 2 Zeichen) – hoch · nach dem KI-Feedback 0 % (von 3 Zeichen)");
  assert.equal(join(det.per[1].line), "Tippzeiten – Rot-Anteil: 0 % (von 2 Zeichen)");   // ohne „erste Eingabe/nach dem KI-Feedback“
  assert.match(join(det.sum), /^Tippzeiten – Rot-Anteil über alle Aufgaben: erste Fassung .* · abgegebene Fassung /);
  // als Boolean wie bisher; ein Array nur mit true = ganzer Eintrag ohne KI-Feedback
  assert.deepEqual(ttDetail(p, ["text", "text"], 2, false, [true, true]), ttDetail(p, ["text", "text"], 2, false, true));
  assert.deepEqual(ttDetail(p, ["text", "text"], 2, false, [false, false]), ttDetail(p, ["text", "text"], 2, false, false));
  // Erstversuch: Aufgabe ohne Feedback wurde nicht übermittelt (leer) → keine Zeile
  const fp = { answers: [{ first: "ab", final: "" }, { first: "", final: "" }], typing: { list: [{ first: b(2, 5), final: null }, { first: null, final: null }] } };
  const fdet = ttDetail(fp, ["text", "text"], 2, true, [false, true]);
  assert.equal(join(fdet.per[0].line), "Tippzeiten – Rot-Anteil: erste Eingabe 100 % (von 2 Zeichen) – hoch");
  assert.equal(fdet.per[1].line, null);
});

test("fbtask: Bildschirm – Buttons je Aufgabe, Datenschutzsatz unter dem Button, Ablauf-Kasten", () => {
  const dom = body("function fbtDom(n) {", "\n}\n");
  assert.ok(dom.includes('class: "btn ghost small fbtbtn", id: "fbt-btn-" + n, text: FBT_LABEL, "aria-label": fbtAria(n, false)'));
  assert.ok(dom.includes('class: "status fbt-stat", id: "fbt-st-" + n, role: "status", "aria-live": "polite"'));
  assert.ok(!dom.includes("ltbtn"));   // eigene Klasse (E2E zählt die Buttons der Rechtschreibprüfung)
  const bt = body("function buildTasks() {", "\n}\n");
  assert.ok(bt.includes("const fbt = perTask && (isText || spec.type === \"table\") && S.sheet.aiTasks.includes(n) ? fbtDom(n) : null;"));
  assert.ok(bt.includes('{ class: "fbbox hidden", id: "fb-" + n, tabindex: "-1" }'));
  // Ablauf-Kasten: beim Senden 4, während einer Anfrage 2, mit KI-Feedback 3, sonst 1
  assert.ok(body("function renderSteps() {", "\n}\n").includes("const cur = ai ? (S.submitting ? 4 : S.busyFeedback ? 2 : S.feedback ? 3 : 1) : (S.submitting ? 2 : 1);"));
  // #privacy: bei Blättern ohne Buttons je Aufgabe wörtlich wie bisher, sonst beide Wege und das Ersetzen des Erstversuchs
  const rp = body("function renderPrivacy()", 'const full = $("privfull-ed")');
  assert.ok(rp.includes("`Das KI-Feedback ist freiwillig: Nur wenn du auf „KI um ein Feedback bitten“ klickst und das bestätigst, gehen deine Antworten zum Überarbeiten an eine KI; du kannst auch ohne KI-Feedback abgeben, ohne dass dir daraus ein Nachteil entsteht. `"));
  assert.ok(rp.includes("beim Button einer Aufgabe nur deine Antwort zu dieser Aufgabe"));
  assert.ok(rp.includes("Bekommst du KI-Feedback nur zu einzelnen Aufgaben, enthält der Erstversuch nur diese Aufgaben und wird mit jedem weiteren KI-Feedback ersetzt. "));
  for (const m of rp.match(/`[^`]*`/g)) assert.doesNotMatch(m.replace(/\$\{[^}]*\}/g, ""), NO_TT);
});

test("fbtask: Feedback kommt an, während die Schüler:in in einem anderen Feld schreibt → Fokus und Ansicht bleiben, die Statuszeile sagt es an", () => {
  // die übrigen Felder bleiben während einer Anfrage zu einzelnen Aufgaben bearbeitbar: Eingabefelder (auch eine Tabellenzelle über answerOf)
  for (const tag of ["TEXTAREA", "INPUT", "SELECT"]) assert.equal(F.fbtBusyIn({ tagName: tag }, null), true, tag);
  assert.equal(F.fbtBusyIn({ tagName: "DIV", isContentEditable: true }, null), true);
  assert.equal(F.fbtBusyIn({ tagName: "DIV" }, { tagName: "TEXTAREA" }), true);
  // kein Feld: <body> (der gesperrte Button hat den Fokus verloren), ein Button, die Box selbst – dann wie bisher Fokus in die Box
  for (const el of [null, undefined, { tagName: "BODY" }, { tagName: "BUTTON" }, { tagName: "DIV", isContentEditable: false }]) assert.equal(F.fbtBusyIn(el, null), false);
  assert.equal(F.fbtArrived([3]), "Dein KI-Feedback zu Aufgabe 3 ist da – es steht unter deiner Antwort.");
  assert.equal(F.fbtArrived([3, 4]), "Dein KI-Feedback zu den Aufgaben 3 und 4 ist da – es steht jeweils unter deiner Antwort.");
  // requestFeedback: nur bei Anfragen zu einzelnen Aufgaben (targets; ohne Ziel waren alle Felder gesperrt – wie bisher), nicht bei offenem
  // Dialog; vor dem Scrollen und noch einmal vor dem Fokus geprüft
  const req = body("async function requestFeedback(target) {", "\n}\n");
  assert.ok(req.includes('const elsewhere = () => { const ae = document.activeElement; return !!targets && !$("dlg").classList.contains("open") && fbtBusyIn(ae, answerOf(ae)); };'));
  assert.ok(req.includes("const arrived = () => { if (st.textContent === \"\") setStatus(st, fbtArrived(targets), \"\"); };"));
  const a = req.indexOf("if (elsewhere()) { arrived(); return; }"), sc = req.indexOf("rh.scrollIntoView("), b = req.indexOf("if (elsewhere()) { arrived(); return; }", a + 1), fo = req.indexOf("rh.focus(");
  assert.ok(a > 0 && a < sc && sc < b && b < fo, "erst prüfen, dann scrollen; im Zeitgeber erneut prüfen, dann Fokus");
});

test("fbtask: KI-Feedback zu einer Aufgabe, danach Tageskontingent aufgebraucht → keine finale KI-Rückmeldung angeboten oder angekündigt (wie ohne erstes Feedback)", () => {
  const consts = ["FB_NOT_DONE", "FB_QUOTA", "FB_NO_AI", "FB2_NO_AI", "FB2_QUOTA", "FB2_CHECK_LABEL"].map((k) => body("const " + k + " = ", "\n")).join("\n");   // je eine Zeile (samt Kommentar)
  const S = { sheet: { aiFeedback: true }, fbUnavailable: "", fbUnavailableDay: "" };
  let any = true, expired = 0;
  const env = new Function("S", "recipientParts", "quotaExpired", "listNums", "laterFor", "FB_VOLUNTARY", "fb2TooLong", "recipientSentence",
    consts + "\n" + body("const emptyNums = ", ";\n") + ";\n" + body("const fb2DialogLine = ", ";\n") + ";\n" +
    body("function fb2Known() {", "\n}\n") + "\n}\n" + body("function fb2Offer(finals, na) {", "\n}\n") + "\n}\n" + body("function submitDialog(", "\n}\n") + "\n}\n" +
    "return { FB_QUOTA, FB_NO_AI, FB2_QUOTA, FB2_NO_AI, fb2Known, fb2Offer, submitDialog };")(
    S, () => ({ any }), () => { expired++; return false; }, (a) => a.join(" und "), () => "morgen", FB_VOLUNTARY, () => false, () => "WER.");
  assert.equal(env.FB2_QUOTA, "Eine finale KI-Rückmeldung gibt es diesmal nicht – das KI-Kontingent für heute ist aufgebraucht");
  assert.doesNotMatch(env.FB2_QUOTA, NO_TT);
  const finals = ["a", "b"];
  // ohne Grund: angeboten wie bisher (Dialog wörtlich wie bisher)
  assert.equal(env.fb2Known(), null);
  assert.equal(expired, 1);   // ein Kontingent von einem früheren Tag gilt nicht mehr
  assert.equal(env.fb2Offer(finals, env.fb2Known()), true);
  const offered = env.submitDialog(true, finals, null, true);
  assert.deepEqual(offered.check, { label: "Nach der Abgabe eine finale KI-Rückmeldung erhalten", checked: true });
  assert.ok(offered.text.endsWith("WER. Möchtest du das nicht, wähle die finale KI-Rückmeldung unten ab."));
  // Kontingent aufgebraucht (503 ai_quota bei einer weiteren Anfrage): nicht angeboten, kein Kästchen, der Dialog sagt warum – nie „zu lang“
  S.fbUnavailable = env.FB_QUOTA;
  assert.deepEqual(env.fb2Known(), { reason: env.FB_QUOTA });
  assert.equal(env.fb2Offer(finals, env.fb2Known()), false);
  const q = env.submitDialog(true, finals, env.fb2Known(), false);
  assert.equal(q.check, undefined);
  assert.equal(q.title, "Jetzt abgeben?");
  assert.equal(q.text, "Nach der Abgabe kannst du deine Antworten nicht mehr ändern. Abgegeben werden deine erste Fassung (vor dem KI-Feedback) und deine überarbeitete Fassung.\n" +
    env.FB2_QUOTA + "; an die KI wird nichts gesendet.");
  // keine KI eingerichtet (503 ai_not_configured), die Seite kennt aber noch Empfänger
  S.fbUnavailable = env.FB_NO_AI;
  assert.equal(env.fb2Offer(finals, env.fb2Known()), false);
  assert.ok(env.submitDialog(true, finals, env.fb2Known(), false).text.endsWith("\n" + env.FB2_NO_AI + "; an die KI wird nichts gesendet."));
  // ein vorübergehender Grund (ausgelastet) verhindert die finale Rückmeldung nicht – wie ohne erstes Feedback
  S.fbUnavailable = "KI ausgelastet";
  assert.equal(env.fb2Known(), null);
  // ohne Empfänger wie bisher
  any = false; S.fbUnavailable = "";
  assert.ok(env.submitDialog(true, finals, null, false).text.endsWith("\n" + env.FB2_NO_AI + "; an die KI wird nichts gesendet."));
  // submitAll und #submit-hint nutzen den Grund (ohne Feedback wie bisher noAiState)
  const submit = body("async function submitAll()", "\n}\n");
  assert.ok(submit.includes("const known = withFb ? fb2Known() : said;"));
  assert.ok(submit.includes("const offer = fb2Offer(finals, known);"));
  assert.ok(submit.includes("const ok = await askConfirm(submitDialog(withFb, finals, known, offer));"));
  const rfs = body("function renderFeedbackState() {", "\n}\n");
  assert.ok(rfs.includes("const known = has ? fb2Known() : null;"));
  assert.ok(rfs.includes('(!recipientParts().any || (known && known.reason === FB_NO_AI) ? FB2_NO_AI + "." : known ? FB2_QUOTA + "."'));
});
