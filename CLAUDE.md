# Feibeitsblatt – Hinweise für die Entwicklung

Schreibeditor mit Aufgabencodes (Design und Tippzeit-Messung wie im Feiditor – die Färbung sieht nur die Lehrkraft; die Kurzfassung
des Datenschutzhinweises nennt die Messung in einem Satz, Widerspruch per Schalter im eigenen Abschnitt des ausführlichen Hinweises): Lehrkraft legt Aufgaben +
Aufträge an die KI an (worauf sie beim Feedback achten soll; intern `solution`; Aufgabenstellung und Material formatierbar; Antwort als Textfeld, Tabelle oder Weltkarten-Zuordnung) → Code → Einzel- oder Partner-/Gruppenarbeit → Schüler:innen schreiben (Einfügen gesperrt), LanguageTool-Prüfung, einmal KI-Feedback (freiwillig),
überarbeiten, verschlüsselt abgeben (danach zweite KI-Rückmeldung zur abgegebenen Fassung) → Lehrkräfte-Übersicht (Türcode 1104 + Passwort); Blätter lassen sich als PDF-Datei
sichern und mit neuem Code wieder laden (z. B. für Parallelklassen) oder als analoges Arbeitsblatt mit QR-Code zu einer
Checkliste drucken; ein Blatt kann auch das Finale eines Escape-Rooms sein (Ankunft per Link oder Überblick-PDF, siehe
Escape-Room-Anbindung). Privates, nicht kommerzielles Angebot: verantwortlich ist der Betreiber (fest in `index.html`), keine
Schule; Seite „Impressum & Datenschutz“ (`#impressum`). Oberfläche und Doku deutsch;
Schüler:innen werden geduzt, die Lehrkraft gesiezt; echte Umlaute und typografische Anführungszeichen („…“).

- **Architektur:** `index.html` = ganze Oberfläche in EINER Datei (keine externen Bibliotheken/Fonts).
  `npm run build` (`scripts/build.mjs`) kopiert `index.html` + `_headers` nach `dist/`; der Worker liefert `dist/`
  als Workers Static Assets aus. `wrangler.jsonc`: `run_worker_first: ["/api/*"]`, sonst `env.ASSETS.fetch(request)`;
  D1-Binding `DB` → `feibeitsblatt-db` per Name (kein `database_id`); kein `nodejs_compat`; Workers AI per
  `"ai": {"binding": "AI", "remote": true}` (kein AI Gateway; `remote:true` nur gegen die Warnung – unter `--local` ist
  `env.AI` da, `run()` wirft „Binding AI needs to be run remotely“); `triggers.crons: ["17 2 * * *"]` (Handler `scheduled`:
  Löschfrist + Aufräumen) und `observability` ausdrücklich aus (`enabled`, `logs.enabled`, `logs.invocation_logs`,
  `traces.enabled`, `issues.enabled` = false – ohne Eintrag gälte das Dashboard; Aufrufprotokolle enthielten die URL mit
  dem Blatt-Code). **Logs nie einschalten**, Fehlersuche live per `wrangler tail`; `test/unit/config.test.mjs` prüft beides.
  Worker-Code und Konfiguration nie in `dist/`.
  - `worker/index.js`: Routing, D1, Rate-Limits, Lehrkraft-Auth. `worker/lib.js`: Validierung, Codes, Buckets,
    `sealSecret`/`openSecret`. `worker/ai.js`: Anbieter (cloudflare = Vorauswahl/Empfehlung, groq, openrouter, gemini, cerebras, custom),
    `callAI`, `testKey`, Feedback-Prompt, `reserveSlot` – portiert aus janrickmer/check-des-feind-t-es.
  - Frontend ruft `API + "/api/…"` mit `API = window.FEIBEITSBLATT_API` (kleines Skript ganz oben): `""` = gleiche
    Herkunft auf `*.workers.dev`/localhost und überall, wo die Worker-Kopie läuft (`scripts/build.mjs` setzt in `dist/index.html`
    hinter `<meta charset>` das Kennzeichen `<meta name="feibeitsblatt-host" content="worker">` – auch für eine eigene Domain am
    Worker; davon hängt auch `PAGES_HOST` ab, GitHub als Empfänger), sonst `window.FEIBEITSBLATT_WORKER` (`https://feibeitsblatt.feindt.
    workers.dev`). Die Seite liegt zusätzlich auf GitHub Pages unter `feibeitsblatt.janrickmer.de` (`CNAME`,
    `.nojekyll`, Quelle Branch `main` Ordner `/`): dort gelten keine `_headers`, deshalb steht die CSP auch als
    `<meta http-equiv>` in `index.html` – Worker-Adresse dort (`connect-src`) und im Skript immer zusammen ändern.
- **API:** JSON, `{ok:true, …}` bzw. `{ok:false, error:"deutsche Meldung", code}`; CORS `*`, keine Cookies, Auth nur
  per `Authorization: Bearer <authKey>`. Öffentlich: `GET /api/sheet/:code` (**nie `solution`**, d. h. die Aufträge an die KI),
  `POST /api/feedback`, `POST /api/submit`. Lehrkraft: `/api/teacher/door`, `/setup`, `/login`, `/password`,
  `/sheets`, `/sheets/:code`, `/sheets/:code/submissions`, `/sheets/:code/checklist`, `/ai`, `/ai/test`, `/privacy` (Pfade
  unter `/api/teacher`); öffentlich außerdem `GET /api/sheet/:code/checklist` (siehe Analoges Arbeitsblatt) und `GET /api/privacy`
  (siehe Datenschutz-Angaben).
  `DELETE …/sheets/:code/submissions` ohne Body löscht alle Einträge des Blattes, mit JSON `{ids:[…]}` (1–`LIMITS.deleteIds`
  50 positive Ganzzahlen, `validateDeleteIds`; ein Body ohne gültige ids → 400, nie „alle“) nur diese Einträge dieses Blattes
  (eine gebundene Anweisung `… WHERE sheet_code=?1 AND id IN (…)`) → `{deleted}`.
  Bilder: `POST /api/teacher/sheets/:code/images` (JSON `{task (1-basiert), mode: thumb|inline|card, data: Base64}` →
  `{image:{id, task, pos, mode, mime, w, h, bytes}}`), öffentlich `GET /api/sheet/:code/images/:id` →
  `{mime, w, h, data: Base64}` mit `Cache-Control: public, max-age=31536000, immutable`; `GET /api/sheet/:code` und
  `GET /api/teacher/sheets/:code` liefern je Aufgabe `images: [{id, mode, w, h, alt}]` (nie Bilddaten),
  `material` (Absätze aus Läufen, siehe unten), `textFmt` (formatierte Aufgabenstellung, siehe unten; `[]` = nur `text`)
  und `files` (PDF-Dateien, siehe unten). `GET /api/sheet/:code` liefert außerdem `aiFeedback` (Ja/Nein: mindestens eine
  Aufgabe mit Auftrag an die KI, `wantsFeedback` aus ai.js; nie der Auftrag; fehlt bei älteren Workern = `true`) und
  `privacy: {retentionDays} | null` (siehe Datenschutz-Angaben; im bestehenden `IN`-Batch, keine Abfrage mehr).
  `GET /api/sheet/:code`, `GET /api/teacher/sheets` (je Blatt) und `GET /api/teacher/sheets/:code` liefern `escape: {id, name} |
  null` (Finale eines Escape-Rooms; öffentlich nie mehr als Kennung und Name), `POST /api/teacher/sheets` nimmt optional `escape`
  (siehe Escape-Room-Anbindung).
  `POST /api/feedback` nimmt optional `only: [n…]` (1-basierte Aufgabennummern, `validateOnly`: Ganzzahlen 1…Aufgabenzahl,
  ohne Doppelte, nicht leer, sonst 400 `bad_answers` – nie stillschweigend „alle“; fehlt/`null` = alle) für die zweite
  Rückmeldung: dann gehen nur diese Aufgaben (mit Auftrag) an die KI, `results` hat für die übrigen `null`; es antwortet
  zusätzlich `aiGenerated` (`true` + `digitalSourceType` IPTC `trainedAlgorithmicMedia`,
  wenn die KI gefragt wurde, sonst `false`); `POST /api/submit` liefert `retentionDays` (Frist jetzt, `null` = keine).
  Türcode `env.TEACHER_DOOR_CODE || "1104"`; das Frontend schickt rein numerische Eingaben (4–12 Ziffern) an
  `/door`, Blatt-Codes enthalten immer Buchstaben. `GET …/submissions?after=<id>` liefert seitenweise (≤ 50 bzw.
  ≤ 8 MB je Seite, `next` = letzte id oder `null`); das Frontend schleift über `next`. `GET /api/health` ohne
  Datenbank. KI-Fehler, bei denen Warten hilft (BUSY, RATE_LIMIT, TIMEOUT) → 429 `ai_busy` mit `retryAfter`,
  Tageskontingent von Workers AI (kontoweit) → 503 `ai_quota` ohne `retryAfter`, sonst 502 `ai_error`; ohne
  `SETTINGS_SECRET` → 503 `server_not_configured` (nur beim Speichern eines API-Schlüssels). `GET`/`PUT /api/teacher/ai`
  liefern je Eintrag `hasKey` (= nutzbar), `ready`, `saved`, `keyless`, `keyError?` und dazu `quotaUntil` (Sperre "*"
  oder `null`) und `usage: {day, requests, neurons, limit}` (Workers AI heute, UTC); `/ai/test` bei Workers AI `usage`
  (prompt/completion/reasoning_tokens, nie Inhalt).
- **Codes:** 6 Zeichen aus `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (≥ 1 Buchstabe, ≥ 1 Ziffer), Anzeige `K7Q-M4X`,
  Eingabe normalisieren (Großbuchstaben, nur `A–Z0–9`), Erzeugung mit `crypto.getRandomValues` ohne Modulo-Bias.
- **D1-Schema:** `settings(key, value)` (`teacher` = `{authHash, kdf, publicKey, encPrivateKey}`, `ai`, `privacy`), `sheets`,
  `submissions(id, sheet_code, received_at, envelope, stage TEXT DEFAULT 'final', attempt TEXT)` + Indizes
  (`sheet_code, id`, `sheet_code, attempt` und `received_at` für die Löschfrist), `sheet_images(id, sheet_code, task, pos, mode, mime,
  w, h, bytes, data TEXT = Base64, created_at)` + Index (`sheet_code, task, pos`), `rate_limits`, `ai_gate`,
  `ai_skip`, `ai_usage(day 'YYYY-MM-DD' UTC, provider, requests, neurons, PK(day, provider))`,
  `sheet_checklists(sheet_code PK, draft, final, updated_at)`. Angelegt per
  `CREATE TABLE IF NOT EXISTS` beim ersten Request je Isolate (ein `batch`), keine Migrationen → Schemaänderungen
  nur additiv und idempotent im `SCHEMA`-Array; nachträgliche Spalten wie `stage`/`attempt` und `sheets.escape_id`/`escape_name`
  (Escape-Room-Blatt, NULL = normales Blatt) per `ensureColumns` (`LATER_COLUMNS`; beide `PRAGMA table_info` in einem Batch →
  fehlende `ALTER TABLE … ADD COLUMN` in einem Batch, Fehler bei Wettlauf zweier Isolates werden durch erneutes Nachsehen abgefangen).
- **Erstversuch ↔ Abgabe:** `POST /api/submit` nimmt `{code, envelope, stage?: "first"|"final"|"feedback2", attempt?: 16 Hex, receivedAt?}`
  (`validateSubmitMeta`; `first` braucht `attempt`). Der Browser erzeugt je Bearbeitung eine Kennung (`S.attempt`,
  `hexOf(8 Zufallsbytes)`, im Zwischenstand gespeichert) und schickt nach erhaltenem KI-Feedback die erste Fassung +
  Feedback als Erstversuch (`sendFirstAttempt`, payload `stage:"first"`, `answers[].final = null`, `submittedAt:null`;
  scheitert das Senden, wird es beim nächsten Öffnen nachgeholt – `S.firstSent`). Gleiche `attempt` → `UPDATE`
  derselben Zeile (`replaced`), ein Erstversuch überschreibt nie eine Abgabe (`kept:true`); ohne `attempt` wird
  eingefügt. Widerspricht jemand nach dem Senden der Tippzeit-Messung, ersetzt der Browser den Erstversuch mit derselben
  `attempt` ohne Tippzeiten (`S.ttResend`, siehe Tippzeit-Messung). `stage: "feedback2"` (mit `attempt` und `receivedAt` der Abgabe-Antwort,
  `validateSubmitMeta` → `replace`) ersetzt nur genau die eigene Abgabe, legt nie eine an und zählt ohne passende Abgabe nicht (siehe Zweite
  KI-Rückmeldung). `/sheets` liefert `submissionCount` (nur `final`) und `firstCount`; die Abgabenliste liefert `stage`.
  `#p-klasse-hint` sagt es den Schüler:innen so: Angaben gehen mit dem KI-Feedback (Erstversuch), ohne KI-Feedback erst
  bei der Abgabe verschlüsselt an die Lehrkraft (Blatt ohne KI: nur bei der Abgabe).
  Lehrkraft-Ansicht: Kürzel `.st-final` (grün) / `.st-first` (orange, `#b85c00`), Legende `#t-subs-legend`,
  Zusammenfassung `subsSummary`; Erstversuche einer Person, die (anders) schon abgegeben hat, werden ausgeblendet
  (`T.subsHidden` = `[{id, who, s}]` per `subWho` – Klasse, Kürzel, Geburtstag; bei einer Gruppe Klasse + sortierte Kürzel, die
  Reihenfolge der Eingabe zählt nicht –, in Lösch-Dialogen mitgezählt; die Details
  der Abgabe zeigen sie in `details.dolder` „n ältere Erstversuche dieser Person (bzw. Gruppe) (in der Liste ausgeblendet)“, gebaut beim
  Aufklappen per `buildDetail(x.s, true)` ohne Löschknopf – sonst wäre die Auskunft unvollständig); Details:
  „Erstversuch ohne Überarbeitung – noch nicht abgegeben“, Spalte 2 „(noch nicht überarbeitet)“, am Ende „Diesen Eintrag
  löschen“ (`deleteEntry`, danger-Dialog mit Kürzel, Geburtstag, Klasse bzw. „der Gruppe MaxMu, LiMu (Klasse 8b)“; löscht die
  ausgeblendeten Erstversuche derselben Person bzw. Gruppe und zuletzt die id selbst in Blöcken zu `DELETE_IDS_MAX` = `LIMITS.deleteIds` (50) – scheitert ein Block, bleibt der
  Rest unter der Abgabe –, lädt Liste und Zähler neu, Status in `#t-subs-status`) – so setzt die Lehrkraft Löschwünsche um.
  Nicht entschlüsselbare Einträge (`tr.errrow`) haben einen eigenen Knopf „Eintrag löschen“. Screenreader-Text in der Pfeilspalte, nie im Kürzel (Tests lesen die Zellen).
- **Zwischenstand als PDF (ohne Bibliothek):** `makeDraftPdf(d)` baut eine A4-Seite (Helvetica/-Bold, WinAnsi,
  `pdfStr` oktal-maskiert, Breiten aus `PDF_W_REG/BOLD` für den Umbruch) mit orangem Kasten, URI-Link-Annotation
  auf `PUBLIC_URL` (`window.FEIBEITSBLATT_PUBLIC`) und dem Datensatz (`draftRecord()` + `kind:"feibeitsblatt-draft"`,
  `code`, `sheetTitle`, `person`) als UTF-8-JSON in einem `/Type /EmbeddedFile`-Stream mit Kennzeichen `/FbDraft 1`
  (zusätzlich im `/EmbeddedFiles`-Namensbaum, Info-Titel als UTF-16 `pdfUtf16`). `readStartPdf` (Block `PDFREAD`; liefert den Zwischenstand oder – Kennzeichen `/FbEscape 1` – die Hülle aus der Überblick-PDF eines Escape-Rooms) sucht die Kennzeichen
  im Latin-1-String, liest `/Length` (direkt oder Verweis, sonst bis `endstream`) und entpackt `FlateDecode` per
  `DecompressionStream` – neu gespeicherte PDFs bleiben lesbar; `cleanDraft` prüft wie die Eingabefelder (Code,
  Kürzel, Geburtstag per `bdayOf` – ein altes volles Datum wird auf Tag und Monat gekürzt –, Klasse bzw. eine Gruppe per `cleanGroup`, ≤ 30 Antworten, `first`+`feedback` nur gemeinsam, `attempt`,
  Tippzeiten `typing` per `ttCleanDraft` nur passend, Widerspruch `ttOptOut`/`ttResend` per `ttDraftFlags` – dann `typing: null`). Startseite: `#start-pdf` →
  `#start-pdf-file` → `importDraftPdf` (≤ `PDF_MAX_BYTES` 5 MB, Blatt laden, Aufgabenzahl prüfen, bei neuerem
  lokalen Stand nachfragen; ein Widerspruch gegen die Tippzeit-Messung im lokalen Stand bleibt – `ttKeepOptOut`) → `S.importDraft` → `openEditor` (importiert, speichert sofort lokal). Dateiname nur
  Code + Zeitstempel, nie Personendaten. Die Datei enthält Antworten lesbar – Hinweistexte dazu nicht entfernen.
  **Bestätigung nach der Abgabe** (`#screen-done`, nur nach HTTP 200 von `/api/submit`): großer grüner Haken
  (`.done-check`, SVG mit `var(--green)`), „Abgabe erfolgreich“, Zeitpunkt, `#done-del` (nur mit Frist: Löschdatum =
  `receivedAt` + `retentionDays` aus der Antwort von `/api/submit`, „oder kurz danach“), dann **ganz oben über der zweiten KI-Rückmeldung**
  Button `#done-pdf` „Lade dir deine Lösungen herunter und speichere sie in deinen Unterlagen zu unserem Unterricht“ (bei
  Escape-Blättern `DONE_PDF_ESC` „Lade dir deine Lösungen und deinen Escape-Room-Überblick herunter …“) und
  direkt darunter klein und blass `#done-pdf-note` (`.donenote`, `aria-describedby`) „Es ist möglich, dass du mit diesen
  Aufgaben für die Klausur / Klassenarbeit relevante Inhalte erlernt hast.“, danach `#done-status` (Meldungen zum Download). `S.lastSubmission` (Code, Titel, Aufgabentexte, person, answers
  first/final, feedback, receivedAt) bleibt nur im Arbeitsspeicher bis „Neues Feibeitsblatt öffnen“ (`resetStudent`);
  `makeSolutionsPdf` baut mehrseitig mit denselben Bausteinen (`pdfWrap`/`pdfStr`/`latin1`/`pdfUtf16`): je Aufgabe
  Aufgabenstellung, abgegebene Fassung + „KI-Rückmeldung zur abgegebenen Fassung:“ (`sub.feedback2`, ohne Zählung;
  Punkte „• Gelingt schon: …“ grün, „• Tipp: …“ rot), bei Überarbeitung erste Fassung + „KI-Feedback zur ersten Fassung:“ (unverändert abgegeben:
  „KI-Feedback (gilt auch für die abgegebene Fassung):“), fehlt `feedback2` noch, ein Hinweis unter dem Kopf;
  Fußzeile „Seite n von N“; nur mit KI-Stichpunkten (`hasAi`, vorab aus `items` berechnet) die KI-Kennzeichnung: sichtbar
  `AI_PDF_NOTE` unter dem Kopf, `/Subject` + `/Keywords` im Info-Dict, XMP-Stream (`xmpPacket`, UTF-8, `/Length` in Bytes,
  letztes Objekt `6 + 2·Seiten`, `/Metadata` im Katalog) mit `Iptc4xmpExt:DigitalSourceType` `compositeSynthetic`;
  Dateiname `Feibeitsblatt-Loesungen-<Code>-<Datum>.pdf`, ohne Geburtstag.
- **Zweite KI-Rückmeldung zur abgegebenen Fassung (im Browser, kein eigener Server-Endpunkt):** `submitAll`
  gibt **zuerst** ab (die Abgabe hängt nie von der KI ab), merkt sich in `S.lastSubmission` die Empfänger-ids
  (`recipients`) und ruft danach `requestFinalFeedback()` – nur mit erstem Feedback (`S.feedback`; ohne KI keine
  zweite Rückmeldung, `#done-fb` bleibt verborgen). „Geändert“ entscheidet `fb2Changes(firsts, finals, feedback)`
  genau wie der Server sieht: nur Aufgaben mit Stichpunkten im ersten Feedback und `fbText` (Zeilenumbrüche,
  Steuerzeichen, trim wie `cleanText`) verschieden – derselbe Helfer im Abgabe-Dialog. Nichts geändert → keine Anfrage,
  `feedback2 = {results: erstes Feedback, same: true}`; sonst werden nur geänderte Aufgaben übernommen, für die anderen
  bleibt die erste Rückmeldung (`kept[i]`, Anzeige „Unverändert abgegeben – wie beim ersten Feedback.“, im PDF „gilt auch
  für die abgegebene Fassung“) – nie zwei widersprüchliche Urteile für denselben Text. **Gesendet werden nur die geänderten
  Aufgaben** (spart Token/Kontingent): `only = fb2Nums(changed)`, `answers = fb2Sent(final, changed)` (unveränderte als `""`);
  ein Ergebnis fehlt für eine gewählte Aufgabe → `bad_result` (ein älterer Server ohne `only` liefert alle – passt auch).
  Zu lang (`fb2TooLong(final, changed)`, nur die gesendeten, wie `validateAnswers`) → keine Anfrage, Hinweis. Sonst
  `POST /api/feedback` mit `{code, answers, recipients, only}` (wie das erste: ohne Personendaten, 409 `ai_changed` → nichts
  gesendet, Hinweis); der Abgabe-Dialog nennt die Aufgaben (`fb2Which`: „Danach bekommst du eine neue KI-Rückmeldung zu
  Aufgabe 2: Von den Aufgaben, die die KI beurteilt, hast du nur diese … geändert“ – nie „nur diese hast du geändert“,
  geänderte Aufgaben ohne Auftrag zählen nicht mit; „für die übrigen Aufgaben gilt das erste Feedback weiter“ nur bei weiteren beurteilten
  Aufgaben), die Datenschutztexte sagen „die danach geänderten Antworten“, Lauf-Kennung
  `S.fbRun`/`S.fbAbort` (`resetStudent` → `stopFeedbackRun` bricht ab), bei `ai_busy` automatische Wiederholung wie beim
  ersten Feedback (`FB_TRIES`, `FB_MAX_MS`, Zufallsanteil, `waitFinalFeedback` mit Zähler `#done-fb-wait` außerhalb der
  Live-Region `#done-fb-status`), sonst `finalFeedbackFailed` + `#done-fb-retry` „Rückmeldung erneut anfordern“
  (höchstens `FB2_MANUAL` 3, nur bei vorübergehenden Fehlern `FB2_TRANSIENT`/429/5xx, nie bei `ai_quota`; endgültig → `finalFeedbackGone`,
  `fb2Final`). Anzeige `renderFinalFeedback` in
  `#done-fb-list` unter dem Download-Button: je Aufgabe `.fbbox#done-fb-n` **ohne Zählung** (der Auftrag ist keine Liste zum
  Abhaken; nur bei `kept[i]` ohne `same` ein `.fb-sum` „Unverändert abgegeben – wie beim ersten Feedback.“) und denselben
  Listen wie im Editor (`appendFbLists`: „Das gelingt dir schon“ `.fb-sub.fb-ok` / `.fb-sub.fb-miss` – im Editor „Tipps zum
  Überarbeiten“, nach der Abgabe „Tipps zum Weiterlernen“). PDF ohne zweite Rückmeldung
  heruntergeladen (lädt noch oder vorübergehend gescheitert) → `pdfBeforeFb2`, nach Ankunft Hinweis in `#done-status`,
  erneut herunterzuladen; kommt endgültig keine, sagt `#done-status` das und die PDF „gab es diesmal nicht“. E2E-Test
  7b (eigenes Blatt, wird gelöscht): Aufgabe 1 nur Leerzeichen, Aufgabe 2 überarbeitet → nur Aufgabe 2 neu (Anfrage mit `only:[2]`, Antwort 1 leer, im Prompt nur Aufgabe 2), nachgereicht mit `replaced:"final"` und ohne Hinweis darunter. E2E-Test 7p
  (eigenes Blatt, wird gelöscht; Hinweis wörtlich, neutrale Farbe): `{gone:true}` per `page.route` → ein Versuch, „gone“-Hinweis, PDF mit
  der Rückmeldung; Uhr der Seite per `page.clock` – `install` + `reload`, während die KI-Anfrage angehalten ist `setSystemTime` +16 min
  (Zeitgeber gedrosselt) → „expired“, nichts nachgereicht; erste Anfrage 502 → Knopf ohne Hinweis, dann Ruhezustand (`pauseAt` +
  `setSystemTime` +16 min, kein Zeitgeber läuft ab): P3 `visibilitychange` → Hinweis unter dem Knopf, Klick ohne Dialog → „expired“, nichts
  nachgereicht; P4 ohne Ereignis, `runFor(16 s)` → die regelmäßige Prüfung zeigt den Hinweis. Unit (`typing.test.mjs`): Texte je Ergebnis,
  `sendFeedback2` mit gestubbtem `sendSealed` (gone/404/expired/failed/skipped/same, Widerspruch unterwegs) und `fb2Check` mit getrennt
  gesteuerter Wand- und Zeitgeber-Uhr. Ist sie da (und nicht `same`), reicht `sendFeedback2(sub)` sie verschlüsselt an die Lehrkraft nach: **genau die Nutzlast, die
  der Server bei der Abgabe angenommen hat** (nach den Rückfällen von `sealPayload`/`sendSealed`, die `payload` dabei selbst kürzen –
  also auch `typing` `{optOut}`/`{omitted}` und ein per `escTrim` gekürztes `escape`; nichts neu gelesen) + `feedback2: {at, results}` (nur neu
  beurteilte Aufgaben, die übrigen `null`) – so bleiben Tippzeiten und Daten aus dem Escape-Room beim Ersetzen erhalten. Gemerkt in
  **`S.fb2Base`** = `{sub, payload, pub, attempt, submitAt = receivedAt der Abgabe-Antwort, key = S.draftKey, timer, until}` (`fb2Hold`, nur mit erstem
  Feedback), **getrennt von `S.lastSubmission`** (daraus entstehen die PDF-Dateien der Schüler:innen – nie Tippzeiten) und nur, solange
  noch nachgereicht werden kann: `fb2Release` nach dem Nachreichen (geklappt, `gone` oder endgültig gescheitert – `finally` in
  `sendFeedback2`), bei `same`, ohne erstes Feedback, in `finalFeedbackGone`, in `resetStudent` und spätestens nach `FB2_HOLD_MS`
  (= `REPLACE_WINDOW_MS`, Unit-Test vergleicht; `fb2Check`, siehe unten), die Tippzeit-Werte darin schon bei einem Widerspruch aus einem anderen Tab
  (`fb2FollowOptOut`, siehe Tippzeit-Messung, „Zweiter Tab“); `submitAll` setzt außerdem `S.firstTyping` nach der Abgabe auf `null` (`TT_ACCESS` sagt
  „bis zur Abgabe (und, wenn … nachgereicht wird, bis dahin)“). Wird der Umschlag erst mit `feedback2` zu groß (`ttEnvelopeFits` bzw. 413/409),
  gilt dieselbe Reihenfolge wie bei der Abgabe (`sendSealed(payload, bodyOf, base.pub)`): erst ohne Tippzeit-Werte (`omitted:"too_large"`),
  dann `escTrim` – **Entscheidung:** die zweite Rückmeldung scheitert wie die Abgabe nie an den Tippzeiten oder den Daten aus dem Raum,
  dafür können in diesem seltenen Fall deren Werte bzw. Fehler-Einzelheiten aus der gespeicherten Abgabe verschwinden (die Lehrkraft sieht
  „nicht übermittelt …“); „nie schlechter“ gilt für alles andere – Antworten, Feedback, Angaben, Vermerke, Kern der Escape-Daten bleiben
  genau wie angenommen, und kommt nichts an (Netz, 5xx, 413 trotz Rückfällen, Frist vorbei), bleibt die Abgabe beim Server, wie sie ist
  (der Server ersetzt atomar). Gesendet per `POST /api/submit` mit `stage: "feedback2"` (ein eigener Wert, den ein älterer
  Server mit 400 ablehnt, statt daraus eine Abgabe zu machen), `attempt` und `receivedAt` (`validateSubmitMeta` → `replace`) –
  der Server ersetzt nur genau diese Abgabe: `stage` final, dieselbe Kennung, `received_at` gleich `receivedAt` (eine inzwischen
  neuere Abgabe derselben Bearbeitung bleibt) und höchstens `REPLACE_WINDOW_MS` (15 min) nach dem Eingang (der Eingang bleibt
  stehen – ohne Frist ließe sich eine Abgabe Tage später austauschen); `UPDATE … SET envelope … AND received_at=?` atomar, sonst
  `{gone:true}` ohne Zählung und ohne Einfügen (eine gelöschte Abgabe kommt nie zurück); bis zu 3 Versuche, 4xx außer 408/429
  endgültig; bei Escape-Blättern genauso. `sendFeedback2` liefert ein Ergebnis: `"sent"` (nur das setzt `sub.fb2Sent`; einmal angekommen
  bleibt angekommen, auch wenn das erneute Senden ohne Tippzeit-Werte danach scheitert), `"gone"` (Antwort `{gone:true}` – zählt **nie**
  als gesendet; ebenso 404 `not_found`, wenn das Blatt samt Abgaben inzwischen gelöscht ist), `"expired"` (Frist vorbei: nichts gesendet
  bzw. `gone` nach Ablauf), `"failed"` (endgültig oder dreimal vorübergehend), `"skipped"` (nie gehalten bzw. „Neues Feibeitsblatt
  öffnen“), `"same"`. Die Frist zählt auf dem Gerät ab dem Absenden der Abgabe (`sentAt` in `submitAll` → `fb2Hold` → `sub.fb2Until`, nur
  ein Zeitpunkt in `S.lastSubmission`) – nie länger als beim Server – und wird nachgerechnet (`fb2Expired`, `fb2Reach` →
  `"ok"`/`"expired"`/`"skipped"`): Ein einzelner Zeitgeber käme im Hintergrund oder nach dem Ruhezustand des Geräts zu spät (er zählt die
  Schlafzeit nicht). Deshalb prüft `fb2Check`, solange `S.fb2Base` gehalten wird, alle `FB2_TICK_MS` (15 s), beim Zurückkehren
  (`visibilitychange` sichtbar, `pageshow`, `focus` des Fensters) und wenn „Rückmeldung erneut anfordern“ Fokus oder Mauszeiger bekommt:
  abgelaufen auf der Wanduhr oder seit dem Halten (`base.until` per `performance.now` – falls die Wanduhr zurückgestellt wird) → freigegeben
  und `fb2RetryNote`.
  **Entscheidung des Betreibers:** Erreicht die Rückmeldung die Lehrkraft nicht, sagt die Bestätigungsseite das ruhig und sachlich (der
  Abgabe-Dialog hatte es angekündigt): `requestFinalFeedback` → `sendFeedback2(sub).then(…fb2TeacherShow)` nur bei derselben
  `S.lastSubmission`, außer bei `"sent"`/`"same"` in `p#done-fb-teacher` (`role="status"`, unter `#done-fb-list`, per `liveFill` erst
  eingeblendet, dann gefüllt; `.donefb-note` in `--muted` wie `.donenote`, keine Erfolgs- oder Alarmfarbe), Texte aus `fb2TeacherText`:
  `"expired"` „Die neue Rückmeldung siehst nur du: An deine Lehrkraft lässt sie sich nur in den ersten 15 Minuten nach der Abgabe
  übermitteln. Deine Abgabe ist davon nicht betroffen.“, `"gone"` „Die neue Rückmeldung ließ sich nicht mehr an deine Lehrkraft
  übermitteln. …“, `"failed"`/`"skipped"` „Die neue Rückmeldung ließ sich nicht an deine Lehrkraft übermitteln. …“ – „Die neue
  Rückmeldung“ wie die Ankündigung im Abgabe-Dialog (für unverändert abgegebene Aufgaben gilt das erste Feedback, das mit der Abgabe ging),
  und nie eine Aussage darüber, was die Lehrkraft jetzt hat (Abgabe bzw. Blatt womöglich gelöscht oder neu abgegeben). Vorher, ohne Dialog:
  steht „Rückmeldung erneut anfordern“ da und ist die Frist vorbei (bzw. nie gehalten), sagt `p#done-fb-retry-note` (`role="status"`, per
  `aria-describedby` am Knopf; `fb2RetryNote` aus `finalFeedbackFailed`, beim Ausblenden des Knopfes und aus `fb2Check`)
  `fb2RetryText`: „Seit deiner Abgabe sind mehr als 15 Minuten vergangen: Eine neue Rückmeldung siehst nur du – an deine Lehrkraft lässt
  sie sich nicht mehr übermitteln.“ Die Hinweise nennen nie Tippzeiten; Kurzfassungen, Datenschutztexte und die PDF-Logik bleiben
  unverändert (eine schon geladene PDF enthält die Rückmeldung trotzdem; die Lehrkraft-Seite sagt per `fb2Missing` „… wurde nicht an die
  Lehrkraft übermittelt.“). **Lehrkraft:** `loadSubs` kappt `feedback2` (eigenes
  try/catch, wie `ttCleanPayload` und `escCleanPayload`), `fb2Of(p)`
  leitet wie der Browser ab (keine Änderung → `same`, die erste Rückmeldung gilt; sonst nur mit nachgereichtem `feedback2`,
  sonst `null`), `buildDetail` zeigt je geänderter Aufgabe `.dfb.dfb2` „KI-Rückmeldung zur abgegebenen Fassung“ („Tipps zum
  Weiterlernen“, `markAi` `feedback-final`) und für Abgaben (nicht Erstversuche) `.dpdf` „Lösungs-PDF herunterladen“ →
  `makeSolutionsPdf(teacherSolutionsSub(s))` (dieselbe Datei wie bei den Schüler:innen über `pdfPager`/`pdfAssemble`, samt XMP-/KI-Kennzeichnung;
  fehlt die zweite Rückmeldung: `fb2Missing` → „… wurde nicht an die Lehrkraft übermittelt.“; bei Escape-Blättern nur die
  Lösungsseiten – `teacherSolutionsSub` setzt kein `escape`, den Überblick gibt es über „Überblick als PDF herunterladen“ –, nie
  Tippzeiten, nie ein voller Name), daneben in den Details weiter `p.dtt`/`p.dtt-sum` und `escDetailDom`, Dateiname `teacherSolutionsName`
  `Feibeitsblatt-Loesungen-<Code>-<Klasse>-<Kürzel bzw. Gruppe-…>-<Abgabedatum>.pdf` (ASCII, nie Geburtstag). Abgabe-Dialog
  nennt die Empfänger (`recipientSentence`) bzw. „nichts geändert – nichts wird noch einmal gesendet“ und „Die neue Rückmeldung
  geht danach verschlüsselt auch an deine Lehrkraft.“; Datenschutzhinweis und Feedback-Dialog nennen das zweite Senden und dass
  die Lehrkraft die Rückmeldung bekommt. Je Schüler:in also bis zu zwei KI-Anfragen → Rate-Limits verdoppelt; bis zu drei
  Aufrufe von `/api/submit` (Erstversuch, Abgabe, Nachreichen) → `submit` 360/h.
- **Krypto (nur im Browser; Server sieht nie Passwort oder Klartext-Abgaben):** PBKDF2-HMAC-SHA256, 600 000
  Iterationen, Salt 16 Byte → `master`; HKDF-SHA256 mit `info` `feibeitsblatt/enc/v1` (AES-GCM-256-Schlüssel) und
  `feibeitsblatt/auth/v1` (`authKey`; Server speichert nur SHA-256 hex, Vergleich in konstanter Zeit).
  Schlüsselpaar RSA-OAEP 3072/SHA-256; privater Schlüssel (PKCS8) AES-GCM-verschlüsselt unter `encKey`.
  Abgabe-Umschlag `{v:1, ek, iv, ct}` (AES-GCM-256 mit Zufallsschlüssel, `ek` = RSA-OAEP); die Personendaten stehen
  nur im verschlüsselten payload. KDF-Parameter und `info`-Strings nie ändern ohne Versionswechsel – sonst sind
  Zugang und alle Abgaben verloren. `authKey`/privater Schlüssel nur im Arbeitsspeicher.
- **Free-Plan:** 10 ms CPU je Request → **kein PBKDF2 und keine RSA-Erzeugung im Worker**, dort nur SHA-256 und
  AES-GCM (Warten auf fetch/D1 zählt nicht; workerd begrenzt PBKDF2 ohnehin). ≤ 50 D1-Abfragen und ≤ 50
  Subrequests je Aufruf → `db.batch()`. D1: 5 Mio. gelesene / 100 000 geschriebene Zeilen pro Tag (seit 1.9.2026
  hart) → Indizes, `COUNT` über Index. Lange KI-Anfragen sind ok (keine Wall-Time-Grenze bei verbundenem Client).
- **KI:** Nie Personendaten an die KI – `/api/feedback` bekommt nur `{code, answers}`. Der Worker baut die Nachrichten
  **selbst** aus D1 (Aufgaben, reiner Text des Materials, Aufträge an die KI) und den Antworten (`buildFeedbackMessages`; nie `messages` vom
  Browser annehmen, sonst offenes KI-Relay); Daten zwischen `<<<`/`>>>` über `safeData`. Nur Aufgaben mit
  Auftrag an die KI (bei `only` nur diese – gleiches Format, nur weniger Aufgaben), eine Anfrage je Blatt. **Reihenfolge im Prompt nicht ändern:** erst der je Blatt gleiche Teil
  („Aufgaben, Material und Aufträge der Lehrkraft (Nummern: …):“, je `### Aufgabe n` mit Aufgabenstellung, Material,
  „Auftrag der Lehrkraft für das Feedback:“), dann alle Antworten (`### Antwort zu Aufgabe n`) –
  so greift das Präfix-Caching (Groq: gecachte Token zählen nicht gegen die Limits); `parseFeedbackPrompt` im Mock
  liest genau dieses Format. **Reserve-KI:** `settings.ai.reserve` = zweiter Eintrag gleicher Form (eigener
  `apiKeyEnc`, `fallbacks`); `PUT /api/teacher/ai` mit `reserve:{…}` bzw. `reserve:null` (ohne `provider` bleibt der
  erste Anbieter unberührt), `POST …/ai/test?which=reserve`; `routeFeedback` versucht erst den ersten Anbieter (mit
  Reserve: `deadlineMs` 60 s), dann die Reserve (eigenes `ai_gate`/`ai_skip` je Anbieter), Gesamtbudget 100 s;
  `GET /api/sheet/:code` liefert `aiRecipients: [{id, label, transfer}]` (`recipientsFor`; transfer = Grundlage der
  Übermittlung aus `PROVIDERS[].transfer` – cloudflare DPF + SCC, groq SCC, sonst `TRANSFER_UNKNOWN`; `activeEntries`: nur nutzbare Einträge, `usable`, die Reserve
  nur bei nutzbarem ersten Anbieter – eine Reserve ohne gespeicherten ersten lehnt `PUT` mit 400 `aiMainFirst` ab; id =
  Anbieter bzw. `custom:<host>`, label = `recipientLabel` mit Rechtsträger und Sitz) – Datenschutzhinweis **und**
  Bestätigungsdialog der Schüler:innen nennen alle; der Browser schickt `recipients` (ids) mit `POST /api/feedback`,
  der Server nutzt nur diese Einträge und antwortet 409 `ai_changed`, wenn der jetzige erste Anbieter dort nicht an erster
  Stelle steht (Reihenfolge des Hinweises: geändert, mit der Reserve getauscht oder entfernt, sodass die Reserve nachrückt;
  eine neu ergänzte Reserve wird nur nicht genutzt, kein 409) (Browser: `reloadRecipients`, Hinweis, nichts gesendet).
  Reserve nur bei Codes aus `RESERVE_ON` (Verfügbarkeit, zu lang, unbrauchbare Antwort) – nie bei FILTERED/AUTH/CONFIG/PRIVACY_POLICY/REGION/PAYMENT, nie parallel. Gemini
  (erster Anbieter oder Reserve) nur mit `confirmBilling:true` (→ `billingConfirmed`, EWR-Bedingungen).
  **Lastspitzen (30 Anfragen in einer Minute):** `ai_gate`-Schlüssel per `gateKey(provider, key, model)` – je
  Eintrag (`key` = provider bzw. `provider#r` für die Reserve) und bei `perModelGate` (groq, cerebras, gemini) je
  Modell; `reserveSlot(db, gateK, gap, maxWait ≤ 10 s, skipKey, model)` = ein Upsert mit RETURNING, das ein gerade
  gesperrtes Modell verweigert (BUSY mit `retryAfterMs`); `callAIInner`: Startmodell versetzt (`startAt`), BUSY am
  Gate → stilles Weiterrücken (`lastResort` für schon bekannte Sperren ohne Prüfung), Minuten-429 → sofortiger
  Modellwechsel und Sperre nur für retry-after (`RATE_LIMIT_TTL` 5–90 s) **sofort** über `onRotate` geschrieben
  (`skipStatements`: `until=MAX(...)`, eine lange Sperre wird nie verkürzt), `TTL.slow` 60 s nur bei echter
  Zeitüberschreitung, kein Versuch unter `minLeftMs` 15 s, am Ende einmal bis zur frühesten Sperre warten, Fehler
  tragen `retryAfterMs` → `retryAfterOfErr` (5–60 s) im 429 `ai_busy`. routeFeedback: Budget 100 s, erster Anbieter
  45 s (mit Reserve) und 6 Versuche, Reserve ≤ 40 s/3 Versuche nur bei ≥ 35 s Rest. D1-Abfragen je Feedback (Anweisungen
  eines Batches einzeln, Schema schon angelegt): Erfolg im ersten Versuch ≤ 18; je Versuch ≤ 3, dazu Aufräumen, Zählung,
  Verbrauch, Erstattung → höchstens 32 ohne, 42 mit Reserve (Unit-Tests: Erfolg über Workers AI ≤ 18, volle Warteschlangen
  mit Reserve ≤ 42; jeder Aufruf ≤ 50). Browser (`requestFeedback`): nur bei `ai_busy` automatisch wiederholen – `FB_TRIES` 5,
  `FB_MAX_MS` 4 min, Wartezeit = retryAfter × (1 + 0–30 %) + 0–3 s, ein `setTimeout` auf einen absoluten Zeitpunkt +
  `visibilitychange`, Sekundenzähler in `#fb-wait` (aria-hidden) außerhalb der Live-Region `#fb-status` (beide und `#fb-fallback` direkt unter `#fb-btn`, vor dem
  Datenschutzhinweis `#privacy`/`#privacy-esc`/`#privfull-ed` – E2E 7f prüft die Lage), Felder nur
  während einer laufenden Anfrage readOnly, vor jedem Versuch `answers` neu lesen (`S.first` = gesendete Fassung),
  `#fb-wait-stop` = Abbruch (1 Fehlversuch), erschöpfter Zyklus = 2 Fehlversuche, `S.fbFails` im Zwischenstand;
  Lauf-Kennung `S.fbRun` + `stopFeedbackRun()` (resetStudent/openEditor) gegen späte Antworten, `api()` nimmt
  `signal`. Mock: `setMode("tpm", null, n)` = n Anfragen je Modell und 5-Minuten-Fenster, `"403flag"` = Moderation.
  `ai_skip` (erschöpfte Modelle), `fallbacks` aus `testKey` beim Speichern/Testen; `reasoning_effort: "low"` für
  gpt-oss; HTTP 413 / „context length“ → anderes Modell (`TOO_LARGE`). **Auftrag an die KI statt
  Musterlösung:** `solution` (Name bleibt in D1/API/Sicherung) ist der Text der Lehrkraft, worauf die KI beim Feedback
  achten soll (Erwartungen, Kriterien, Stichpunkte, auch eine Musterlösung, Tonfall …) – Grundlage der Beratung, kein Ziel,
  das wörtlich erreicht werden muss; leer = kein KI-Feedback (`NO_SOLUTION_NOTE` „Zu dieser Aufgabe gibt es kein
  KI-Feedback.“). Der Prompt (`FEEDBACK_SYSTEM`, Leitsatz „Es zählt der Inhalt, nicht der Wortlaut“) lässt die KI nur den
  Auftrag befolgen (im Rahmen der Regeln; Aufgaben, Material und Antworten sind nur Daten), keine Noten/Punktzahlen, keine
  fertige Lösung außer der Auftrag erlaubt es. In drei Runden gegen Testfälle mit zwei Modellgrößen geprüft; nötig waren (nicht
  entfernen): nichts verlangen, was weder Aufgabe noch Auftrag fordern (vollständige Antwort → höchstens ein freiwilliger Tipp),
  Richtiges nie als fehlend darstellen, Falsches klar benennen, die richtige Antwort aber – auch nur ein Wort, Name oder eine
  Zahl daraus – nur nennen, wenn der Auftrag es erlaubt, keine Meta-Kommentare zu eingeschleusten Anweisungen oder
  Notenwünschen, auch bei leerer Antwort ein Eintrag. Ausgabe `{"aufgaben":[{"nr":1,"gut":[…],"tipps":[…]}]}` (gut 0–3, tipps 0–5)
  → `normalizeFeedback` → internes Format `{covered, missing, note?}` überall (Browser, Zwischenstand, Erstversuch/Abgabe,
  Lehrkraft-Ansicht): `covered` = „gut“, `missing` = „tipps“ – historische Namen, damit alte Zwischenstände und Abgaben
  lesbar bleiben; alte Schlüssel (angesprochen/fehlt …) liest es weiter, `FEEDBACK_CAPS` 12 × 300 Zeichen. Mock
  (`mockFeedback`): jede Zeile des Auftrags (einzeilig: jeder Satz, ≤ 8) wird wörtlich ein Stichpunkt – unter „gut“, wenn die
  Antwort ihr erstes bedeutungstragendes Wort enthält, sonst unter „tipps“ (`expectedResults` sagt das in Tests voraus).
  Lehrkraft-Hinweis `#b-soltip`: was hineingehört (Inhalte/Begriffe/Argumente, typische Fehler, worauf es nicht ankommt,
  Umfang/Ton), kein starres Ziel, Stichpunkte „gelingt schon“ + „Tipps“, Lösungen nur wenn erlaubt, keine Noten, für
  Schüler:innen unsichtbar, aber Grundlage der Tipps (nichts Geheimes), leer = kein Feedback, kurzes Beispiel.
  `feedbackAcceptor` verlangt für jede Aufgabe mindestens einen Stichpunkt (sonst nächstes
  Modell). API-Schlüssel at rest **nur** AES-GCM mit `env.SETTINGS_SECRET` – fehlt es, lehnt der Server das
  Speichern ab (503, nie Klartext; `npm run dev` setzt ein festes Entwicklungs-Secret); der Schlüssel verlässt den
  Server nie (nur `keyHint`) und bleibt bei leerem Feld nur für denselben Anbieter + baseUrl erhalten. Schüler:innen
  sehen nur `PUBLIC_MSG` (`DAILY_LIMIT` neutral „… Morgen geht es wieder.“ – den Weg ohne KI nennt nur der Browser vor der
  Abgabe), Details nur in Lehrkraft-Routen (`/api/teacher/ai/test` und der KI-Vorschlag `POST …/sheets/:code/checklist`).
  `custom`-baseUrl `http://` nur für `127.0.0.1`/`localhost`.
  **Cloudflare Workers AI** (`cloudflare`, `kind:"workers-ai"`, `keyless`, `accountDaily`, `spread:false`, `gapMs` 200, kein
  `perModelGate`): `DEFAULT_PROVIDER` nur als Vorauswahl – nutzbar erst, wenn gespeichert (`usable(e)` = keyless ?
  `explicit && env.AI` : entschlüsselbarer Schlüssel; gilt für `aiRecipients`, Feedback, Test, `hasKey`); nie `apiKeyEnc`
  (Schlüssel → 400 `aiKeyless`, Modell nur `@cf/`/`@hf/`, kein `SETTINGS_SECRET` nötig, ohne Binding Warnung bzw. keyError
  `CF_NO_BINDING`). `callAIInner`: `cfg.ai.run(model, buildWorkersAIInputs(…), {returnRawResponse: true, signal})` – **immer
  genau diese zwei Optionen** (das Binding speichert sie am geteilten Objekt), **nie `gateway`**; Nicht-Response wird verpackt,
  „needs to be run remotely“ → CONFIG `CF_LOCAL`, geworfenes „NNNN: …“ → Fehlerantwort. Modelle fest: Gemma 4 → GLM-4.7-Flash →
  Qwen3-30B (`CF_MODELS`: `maxField`, `think` = `chat_template_kwargs.enable_thinking:false`, `neurons` je Mio. Token),
  `outTokens` = min(8192, 800 + 300 × Aufgaben), Test 200. Codes: 3036 → DAILY_LIMIT `accountWide`, `until` = nächstes 0:00
  UTC, kein Modellwechsel; 3040 → wie Minutenlimit (10 s); 3006 → zu lang; 3007/3008 → 408; `CF_GONE` (5007, 3042, 5035,
  5016, 5018, 3041) → Modell 24 h; 3023/401 → FORBIDDEN; **jede andere 4xx**: dasselbe Modell erst ohne JSON-Modus (der
  Denkmodus bleibt aus – mit ihm kostet die Antwort ein Vielfaches), dann ohne kwargs (nennt die Meldung
  `chat_template_kwargs`/`enable_thinking`/`thinking`, zuerst die kwargs), dann nächstes Modell, gesperrt nur `TTL.soft`
  (5 min – eine einzelne seltsame Anfrage ändert die Modellfolge nicht für einen Tag) – `minRetryMs` bleibt, also am Ende
  eher `ai_busy` als `ai_error`. `parseWorkersAI` (choices, `{response}` als Text/Objekt, packt `{result}` aus),
  `cfUsage`/`cfNeurons`: `callAI` liefert `cost {requests, neurons}` (auch an Fehlern) → ein Upsert in `ai_usage` im
  `waitUntil`-Batch (keine zusätzliche Abfrage je Versuch), Aufräumen > 2 Tage. Kontoweite Sperre = `ai_skip` mit model `"*"`
  unter `entryKey` (bei `accountDaily` ohne `#r`, für erste und Reserve-Rolle gleich): `routeFeedback` fragt dann nicht,
  ohne Reserve schon **vor** `countAll` 503 `ai_quota` (nichts gezählt), mit Reserve bekommt diese das volle Budget (`lead`:
  deadline = Rest, 6 Versuche); ein Treffer im Aufruf erstattet die Zählung (DAILY_LIMIT ∈ `AI_REFUND`). Speichern löscht
  `"*"` nicht (`model<>'*'`), ein erfolgreicher Test eines keyless-Eintrags schon. Workers AI als erster Anbieter **und**
  Reserve → 400 `aiSameAccount` (beide Reihenfolgen). Empfänger-Label „Cloudflare, Inc. (San Francisco, USA) – betreibt
  auch den Server, der die Abgaben speichert“; `recipientSentence`/`renderPrivacy`: bei Cloudflare „auch außerhalb der EU
  möglich“, zusammen mit einem anderen US-Dienst „die übrigen Dienste mit Sitz in den USA … außerhalb der EU“; die Reserve
  springt ein, wenn der erste „nicht antwortet, ausgelastet ist, sein Tageskontingent aufgebraucht hat oder kein brauchbares
  Feedback liefert“ (`RESERVE_WHEN` – die Worte müssen alle Codes aus `RESERVE_ON` abdecken –, ebenso im Reserve-Dialog der
  Lehrkraft, in der Kurzfassung `privacyShortText` und im README-Textbaustein). Oberfläche: Optionen „– nicht für den Schuleinsatz geeignet“ (gemini, openrouter, cerebras; `unsuitable` im
  Browser-`PROVIDERS`, `.provwarn` per JS gefüllt, `askConfirm` „Anbieter trotz Warnung speichern?“ nur wenn nicht schon
  gespeichert; bei der Reserve im selben Dialog), Schlüsselfeld `#ai-key-field` bei keyless verborgen (`#ai-keyless-hint`),
  Modellfeld beim Anbieterwechsel leeren, `savedMain()` (nur `saved !== false`; `ai2Save` verlangt ihn, `AI_MAIN_FIRST`),
  `#ai-usage`/`#ai2-usage` (`renderCfUsage`, „Tageskontingent aufgebraucht bis …“, `.over` rot), Test zeigt `testUsageText`;
  Zahlen per `groupInt` bzw. `thousands` (ai.js) als „10.000“ wie `toLocaleString("de-DE")`; Konflikt-Hinweise („Reserve ist
  schon Workers AI“ u. ä.) räumt `clearStaleClash` nach Speichern/Entfernen weg. `#t-aiwarn`: gespeicherter, aber nicht
  nutzbarer Anbieter → nur `keyError` + `AI_WARN_UNTIL` („Bis dahin … nur ohne KI-Feedback“), die Aufforderung „wählen Sie …
  Speichern“ nur bei `saved:false`. Browser: `ai_quota` → sofort `S.fbUnavailable = FB_QUOTA` („KI-Kontingent für heute
  aufgebraucht“, `laterFor` → „morgen“) mit `S.fbUnavailableDay` (UTC-Tag, im Zwischenstand/PDF als `fbUnavailableDay`);
  `quotaExpired()` (openEditor – dann sofort gespeichert –, `renderFeedbackState`, `noAiState`) löscht den Grund an einem
  späteren UTC-Tag, `fbFails` bleibt; keine automatische Wiederholung.
- **Datenschutz-Angaben und Löschfrist (Art. 13 DSGVO):** Feibeitsblatt ist ein privates, nicht kommerzielles und
  kostenloses Angebot – verantwortlich ist der **Betreiber**, **keine Schule** (keine Schulfelder, keine Vorlage „Hessen“,
  keine:n Datenschutzbeauftragte:n nennen, keine Rückfälle „deine Schule … frag deine Lehrkraft“). Betreiber und
  Aufsichtsbehörde stehen nur im Konfigurationsskript ganz oben in `index.html`: `window.FEIBEITSBLATT_OPERATOR = {name,
  street, city, country, email, authority:{name, address, url}}` (Jan-Rickmer Feindt, An der Bauna 30, 34270 Schauenburg,
  j.feindt@kollegium.lg-ks.de; HBDI, Gustav-Stresemann-Ring 1, 65189 Wiesbaden, https://datenschutz.hessen.de – **nie eine
  andere E-Mail-Adresse**); im Skript nur die gekappte, eingefrorene Kopie `OPERATOR` lesen (E-Mail einfache ASCII-Form ≤ 120, URL ≤ 200 nur
  https), Bausteine `OP_NAME`, `OP_ADDR`, `AUTH_TEXT`, `mailLink()` (je Stelle ein neuer Knoten), `authorityLink`,
  `authorityTail`; E2E-Konstanten `OP*` müssen dazu passen. Der Server speichert keine Angaben einer Schule mehr. settings `privacy` = `{v:1, retentionDays 7–365, updatedAt, auto?}` (`auto:true` = Vorgabe 30 einer
  Neuinstallation). lib.js: `validatePrivacyInput` (nur Frist als Ganzzahl `retentionMin`–`retentionMax` und `confirmDelete`;
  ein mitgeschicktes `school` einer älteren, gecachten Seite wird ignoriert, nie gespeichert), `privacyOut` (→
  `{retentionDays, auto}`, prüft die Frist erneut, ungültig → `null`; nie Schulangaben), `cleanLine` (Checkliste),
  `RETENTION_OPTIONS` [7, 14, 30, 60, 90, 180, 365], `DROP_SCHOOL_SQL` (`json_remove(value,'$.school')`, idempotent, nur die
  Zeile `privacy`, ändert die Frist nicht),
  `PURGE_SQL`, `OLDER_THAN_SQL`, `COUNT_OLDER_SQL`, `SAVE_PRIVACY_SQL` und `DELETE_OLDER_SQL` – **in lib.js, weil workerd in
  index.js nur Funktions-Exporte zulässt** („Incorrect type for map entry“). `PURGE_SQL` = ein DELETE mit Unterabfrage auf
  settings (`json_valid`, `json_type(…)='integer'`, `BETWEEN 7 AND 365` – dieselben Grenzen wie `privacyOut`; ohne gültige Frist NULL → nichts gelöscht) über
  `idx_submissions_received`; `OLDER_THAN_SQL` = eine Abfrage mit `SUM(received_at<?n)` je Option. Gelöscht wird
  (`cleanupStatements`: PURGE, DROP_SCHOOL (früher gespeicherte Schulangaben), rate_limits, ai_skip, ai_usage) im Cron (`scheduled`, now = `scheduledTime`, Fehler nicht
  abfangen → „Past Cron Events“), im 2-%-Aufräumen und beim Öffnen der Übersicht in `routeSheetsList` – dort die ganzen
  `cleanupStatements` (auch abgelaufene Zähler und Sperren: ohne Zeitplan gilt „gehashte IP höchstens etwa einen Tag“ sonst
  nicht), **getrennt vor dem Lese-Batch und fehlertolerant** (`.catch`), damit die Übersicht auch bei erschöpftem Schreiblimit
  lädt. `GET /api/teacher/privacy` → `{privacy, defaults, olderThan:{"7":n…}, aiRecipients}`; `PUT`
  (`{retentionDays, confirmDelete}`; fehlt `confirmDelete` = 0) → ein Batch (eine Transaktion) [`COUNT_OLDER_SQL`,
  `SAVE_PRIVACY_SQL` (speichert nur bei ≤ bestätigter Zahl), `DELETE_OLDER_SQL` (löscht nur, wenn genau dieser Wert gespeichert
  ist), OLDER_THAN] → `{privacy, deleted, olderThan}`; würde mehr gelöscht als bestätigt → 409 `confirm_delete` mit
  `wouldDelete`/`olderThan`, nichts gespeichert oder gelöscht (der Browser fragt mit der neuen Zahl erneut, höchstens zweimal);
  `PURGE_SQL` steht nur in `cleanupStatements`. Öffentlich `GET /api/privacy` (Seite „Impressum & Datenschutz“, ohne Code) →
  `{ok, retentionDays, aiRecipients}` – dieselbe Logik wie `routePublicSheet` (`privacyOut`, `recipientsFor`), eine Abfrage,
  `no-store`, kein Rate-Limit, kein `lookup_miss`. `routeSetup` legt in einem Batch mit dem
  teacher-INSERT `privacy` {30, auto} an – nur wenn dieser Aufruf die Lehrkraft angelegt hat, noch keine Zeile da ist und
  es keine Blätter gibt (bestehende Installationen löschen erst nach dem ersten Speichern; „Passwort vergessen“ behält
  die Frist). Frist zählt ab `received_at` (Abgabe ersetzt Erstversuch → ab der Abgabe). Browser: `cleanPrivacy` (nur
  `{retentionDays}`), `privacyShortText(p, list, withAi, group, typing)` (Kurzfassung: „Verantwortlich ist <Betreiber> – Feibeitsblatt ist ein privates,
  kostenloses Angebot.“, nennt den KI-Dienst; mit `typing` (`ttMeasured`) am Ende **genau der eine Satz `TT_SHORT`**, siehe unten), `privacyNoticeDom(p, list, {h, withAi, pages, open, id, group, noBday, site,
  general, flat, summary, typing, ttSwitch, escape})` = `details.privfull` „Alle Informationen zum Datenschutz“ mit bis zu 10 Abschnitten (`.privh`: Wer ist
  verantwortlich? – Betreiber mit Anschrift und E-Mail, „privates, nicht kommerzielles und kostenloses Angebot – kein Angebot
  einer Schule“, die Lehrkraft liest; Wozu (mit `TT_PURPOSE`: Tippzeiten machen den Schreibprozess sichtbar, die Lehrkraft sieht
  die Färbung **und den Anteil roter Zeichen in Prozent (je Aufgabe und für die ganze Abgabe)**, Ursachen für Rot samt
  „übernommener Korrekturvorschlag des Browsers“, Zweck `TT_USE`, kein Beweis, keine automatische Entscheidung, beim Schreiben
  nicht angezeigt); Rechtsgrundlage als Liste: Bearbeiten/Abgeben/Zwischenstand/Erstversuch/Gruppe
  **und das KI-Feedback** Art. 6 Abs. 1 Buchst. b DSGVO (`ttOut`: „(bei Erstversuch und Abgabe außer den Tippzeiten darin, siehe
  nächster Punkt)“, ohne KI „(bei der Abgabe …)“, mit `TT_KEEP_IN_DRAFT` „(außer den Tippzeiten darin, …)“; bewusst keine
  Einwilligung, keine Altersabfrage), **Tippzeiten** Buchst. f („sie stehen …“ per `ttWhere`; berechtigtes Interesse, den
  Schreibprozess sichtbar zu machen, damit die Lehrkraft bei Auffälligkeiten über die Arbeitsweise sprechen kann; `TT_USE`;
  Widerspruch mit dem Schalter – vom Betreiber so entschieden), LanguageTool
  Einwilligung Buchst. a (Klick + Bestätigung im Altersdialog, Widerruf), Aufruf/Auslieferung/Missbrauchsschutz Buchst. f
  (Widerspruch), Speichern im Browser § 25 Abs. 2 Nr. 2 TDDDG für „dein Zwischenstand, die Häkchen einer Checkliste“ (mit
  `TT_KEEP_IN_DRAFT` „– außer den Tippzeiten darin –“; **nie stillschweigend auf die Tippzeiten ausdehnen** – nach Annahme des
  Betreibers bräuchte ihr Speichern im Zwischenstand eine Einwilligung nach § 25 Abs. 1 TDDDG) – Schreibweise „Buchst.“,
  nie „lit.“; Welche Daten („Außerdem deine Antworten mit ihren Tippzeiten (je eingegebenem Zeichen … keine Uhrzeiten; nach einem
  Widerspruch keine)“, darunter als eigener Absatz im Fließtext `TT_ACCESS(g, keep)`: „Für die Tippzeiten liest diese Seite beim
  Schreiben in deinem Browser die Zeitpunkte deiner Eingaben aus und hält sie bis zur Abgabe (und, wenn die KI-Rückmeldung zu deiner
  abgegebenen Fassung noch nachgereicht wird, bis dahin) im Arbeitsspeicher (nach einem Widerspruch nicht mehr) – das ist ein Zugriff auf
  dein Gerät im Sinne von § 25 TDDDG.“ – die Klammer `TT_HELD(g, ai)` nur bei Blättern mit KI-Feedback (`TT_ACCESS(g, keep, ai)`, Aufruf mit
  `withAi`; sonst wie bisher), denn bis dahin hält `S.fb2Base` die angenommene Nutzlast; mit `TT_KEEP_IN_DRAFT` „…, hält sie … und speichert die
  Tippzeiten bis zur Abgabe (ohne KI-Feedback: bis dahin) auch in deinem Zwischenstand …“; **nur die Tatsache – nie eine Ausnahme („unbedingt erforderlich“) oder eine
  Einwilligung behaupten** (Entscheidung des Betreibers nach Rechtsprüfung; offen – README „Weiter vom Betreiber zu prüfen“ –, ob schon
  das Erfassen samt Senden eine Einwilligung nach § 25 Abs. 1 TDDDG braucht); damit der Satz stimmt, merkt der Capture-Listener `input`
  nach einem Widerspruch keinen Zeitpunkt (`performance.now()` nur ohne `S.ttOptOut`)); Wer bekommt (Lehrkraft „Sie sieht auch die Tippzeiten – als Färbung …; an einen KI-Dienst oder an die
  Rechtschreibprüfung gehen die Tippzeiten nie.“, Cloudflare „(samt Tippzeiten)“);
  Wie lange („Die Tippzeiten gehören zu Erstversuch und Abgabe und werden mit ihnen gelöscht; bis zur Abgabe (und, wenn die
  KI-Rückmeldung zu deiner abgegebenen Fassung noch nachgereicht wird, bis dahin) hält diese Seite sie nur im Arbeitsspeicher – …“, ohne
  KI-Feedback wie bisher „… und werden mit ihr gelöscht; bis dahin hält …“, mit `TT_KEEP_IN_DRAFT` stattdessen „bis zur Abgabe stehen sie
  auch in deinem Zwischenstand – …“);
  Musst du („… solange du nicht widersprichst (siehe „Widerspruch gegen die Tippzeit-Messung“)“); Entscheidet die KI (nur mit KI);
  **Widerspruch gegen die Tippzeit-Messung** (`TT_OBJ_HEAD`, eigener Abschnitt nur mit Messung, gleiche Ebene wie die übrigen, vor
  „Deine Rechte“): der Schalter (`ttSwitchDom`, siehe Tippzeit-Messung; auf „Impressum & Datenschutz“ nur ein Absatz, wo er steht –
  „… steht im Abschnitt „Widerspruch gegen die Tippzeit-Messung“ der Schalter …“ –, mit `TT_SWITCH_EFFECT` und `TT_SWITCH_SCOPE`);
  Deine Rechte: Rechte samt Art. 21, ein kurzer Verweis („Der Tippzeit-Messung kannst du direkt mit einem Schalter widersprechen –
  siehe „Widerspruch gegen die Tippzeit-Messung“.“) und Widerruf, Kontakt Betreiber per E-Mail (die Lehrkraft liest/löscht die
  verschlüsselten Abgaben), Beschwerde bei der Aufsichtsbehörde mit Anschrift und Link. Die Rechtsgrundlage der Tippzeiten verweist
  ebenfalls auf den Abschnitt („(siehe „Widerspruch gegen die Tippzeit-Messung“)“). **Was zum Zwischenstand und zur Zwischenstand-PDF gesagt wird, hängt an `TT_KEEP_IN_DRAFT`** (`ttInDraft`
  in `privacyNoticeDom`, Parameter `keep` von `TT_SWITCH_EFFECT`/`TT_SWITCH_SCOPE`; ohne – eingecheckt –: „bis zur Abgabe (und, wenn …,
  bis dahin) hält diese Seite sie nur im Arbeitsspeicher – in deinem Zwischenstand und in einer Zwischenstand-PDF-Datei stehen sie nicht.“, kein „außer den
  Tippzeiten darin“ beim § 25) – nie fest verdrahten. Alle Tippzeit-Sätze entfallen bei Blättern nur mit Weltkarten (`typing:
  ttMeasured(sh)` – dort wird nichts gemessen; dann auch kein `TT_SHORT` und kein Abschnitt zum Widerspruch). **Kurzfassungen:
  genau ein neutraler Satz** – Entscheidung des Betreibers vom 27.10.2026, zweite Fassung nach Rechtsprüfung (die erste Fassung „gar
  nicht in der Kurzfassung“ ist überholt): `TT_SHORT(g)` „Beim Schreiben misst diese Seite außerdem die Tippzeiten; widersprechen
  kannst du unter „Alle Informationen zum Datenschutz“.“ (Angaben-Bildschirm einer Gruppe: „… widersprechen könnt ihr unter …“),
  ohne Hervorhebung, ohne Aufforderung, nur bei `ttMeasured` – am Ende von `privacyShortText` (Angaben-Bildschirm, Vorschau der
  Lehrkraft) und in `renderPrivacy` (Schreibbereich, immer „du“) vor dem Satz zum Zwischenstand. **Keine weiteren Tippzeit-Sätze in
  den Kurzfassungen oder an anderen sichtbaren Stellen** (Dialoge, Bestätigung) – Schalter, Wirkung und Geltungsbereich stehen nur im
  eigenen Abschnitt des ausführlichen Hinweises (`#p-privfull`, `#privfull-ed`) und beschreibend auf „Impressum & Datenschutz“; nicht
  ohne Rückfrage ändern (Unit-Test: `privacyShortText` ausgewertet, `renderPrivacy` im Quelltext, `TT_ACCESS`, Reihenfolge der
  Abschnitte; E2E 1b/2/2b: Kurzfassungen per `expectTtShort` – genau einmal der Satz, sonst nichts per `NO_TT`; E2E 2/2b außerdem
  `expectOnlyTtShort(page, where, n)` – alles Sichtbare samt aria-label/title/placeholder/alt und den Texten hinter
  aria-labelledby/-describedby bei geschlossenem `details.privfull` enthält zur Messung nur `n`-mal den Satz: Angaben einzeln und als
  Gruppe, Schreibbereich vor und nach dem KI-Feedback, Dialoge zur Rechtschreibprüfung, zum KI-Feedback und zur Abgabe (je 1),
  Bestätigung (0); dazu `#privfull-ed` beim Öffnen zu, Schalter nicht fokussierbar; 7l: Blatt nur mit Weltkarten ohne Satz und
  Abschnitt). Kurzfassungen und ausführlicher Hinweis dürfen sich nicht widersprechen. Der Abschnitt „Widerspruch gegen die
  Tippzeit-Messung“ bleibt getrennt von „Deine Rechte“ (Art. 21 Abs. 4 DSGVO); „ohne Messung (widersprochen)“ bleibt für die
  Lehrkraft sichtbar. Angaben `h2`
  `#p-privfull` mit `#p-privacy-short` in `renderPersonPrivacy`, Editor `h3` in `#privfull-ed` aus `renderPrivacy` –
  beim Weiterschreiben gibt es keinen Angaben-Bildschirm –, Vorschau der Lehrkraft `h3` `#pv-preview`: für ein Blatt mit
  KI-Feedback unter der Adresse der Lehrkraft, darunter `#pv-preview-note` – ist `!PAGES_HOST` und `PUBLIC_HOST` (aus
  `PUBLIC_URL`) eine andere Adresse (`CHECK_HOST`), nennt der Hinweis über GitHub Pages GitHub für die ganze Seite (Wortlaut
  `GITHUB_ITEM` wie im Hinweis) statt nur für die Checklisten-Seite, und bei Blättern ohne
  Auftrag an die KI entfallen die Angaben zum KI-Feedback). **Seite „Impressum & Datenschutz“** `#screen-legal` (Hash
  `#impressum` beim Laden; `hashchange` nur von Start, Arbeitsform, Angaben, Checkliste und ihr selbst; `openLegal` mit
  Lauf-Kennung `LEGAL.run`, `leaveLegal` → `leaveChecklist("")`, Backlinks `#legal-home`/`#legal-home2`, Fokus `#legal-h`):
  Impressum nach § 18 Abs. 1 MStV aus `OPERATOR` (`#legal-addr`, `#legal-mail` mailto, „nicht kommerzielles Angebot … unentgeltlich
  bereitgestellt“), darunter `privacyNoticeDom(…, {h:"h3", site:true, flat:true})` = `section.privflat#legal-privfull` mit h2
  „Datenschutzerklärung“ (kein details) und Frist/Empfängern von `GET /api/privacy`; scheitert der Abruf, `general:true`
  (allgemeine Sätze: KI-Dienst wird vor dem Senden genannt, Frist nach dem Code) und Hinweis in `#legal-status`; `#legal-other`
  zu Blättern ohne KI und Gruppen, danach `section#legal-escape` „Feibeitsblatt als Finale eines Escape-Rooms“ (allgemeine Form,
  siehe Escape-Room-Anbindung; `#legal-privfull` bleibt dafür unverändert). Fußzeile `#pagefoot`: „Copyright …“ · `a#foot-legal` `href="#impressum"`, `target="_blank"`,
  `rel="noopener"`, sr-only „(öffnet in neuem Tab)“ (`.copyright a` klickbar trotz `pointer-events:none`; auf der Seite selbst
  ausgeblendet per `body.on-legal`). Empfänger: Lehrkraft; Cloudflare (Sitz USA; betreibt
  Server und Datenbank, nur die Datenbank liegt in der EU – **nie „Server in der EU“** schreiben, der Worker läuft im
  nächstgelegenen Cloudflare-Rechenzentrum; gespeichert nur verschlüsselt, für das KI-Feedback **kurz unverschlüsselt im
  Server, nicht gespeichert** – nie behaupten, Cloudflare sehe die Antworten nur verschlüsselt; mit Workers AI im selben
  Eintrag als KI-Dienst, Verarbeitung auch außerhalb der EU); GitHub, Inc. nur bei `PAGES_HOST` (`API !== ""`, GitHub
  Pages); weitere KI-Dienste mit `transfer`; ohne Empfänger (keine KI eingerichtet) `NO_AI_SET` „Ein KI-Dienst ist … gerade
  nicht eingerichtet – deine Antworten gehen an keine KI.“ – auch in `recipientSentence`/`renderPrivacy`, nie ein
  Rückfall „KI-Dienst deiner Lehrkraft“; LanguageTool (Learneo, DPF). Alle mit DPF/SCC; unbekannte Grundlage `TRANSFER_UNKNOWN`
  „vom Betreiber dieser Seite beim Anbieter zu prüfen“. `#start-privacy`: ein Satz zur IP beim Laden und der Verweis auf
  „Impressum & Datenschutz“ ganz unten (`#chk-privacy` ebenso). Speicherdauer nennt Time Travel „bis zu 7 Tage (bei einem bezahlten Cloudflare-Tarif bis zu 30 Tage)“; den
  Zwischenstand auf dem Gerät beschreibt `DRAFT_STAY` (gelöscht nur beim nächsten Aufruf der Seite, `cleanupDrafts`) –
  **nie „höchstens 7 Tage“ zusagen**. `renderPrivacy` und der ausführliche Hinweis dürfen sich nicht widersprechen. Lehrkraft: `#t-privacy` → `#tv-privacy` (`openPrivacy`;
  oben schreibgeschützt `.opbox#pv-operator` „Verantwortlich (fest in index.html eingetragen)“ mit Betreiber und
  Aufsichtsbehörde, `#pv-operator-hint` mit Link auf `#impressum` (neuer Tab); nur noch `#pv-days` + `#pv-days-effect` aus
  `olderThan`; vor dem Löschen Dialog „Ältere Abgaben jetzt löschen?“ (danger); Fehler als „Nicht gespeichert – …“; `pvDirty`
  nur für die Frist → „Ohne Speichern zurück?“). Übersicht: `loadPrivacyState` → `#t-privinfo` (Betreiber und Frist)
  / `#t-privwarn` (nur ohne Frist), `#t-subs-retention`, je Abgabe in `buildDetail` „automatische Löschung
  am TT.MM.JJJJ“ – `renderRetentionHint` leert gebaute Details (`tr.details._s`) und baut aufgeklappte sofort neu, damit das
  Datum nach einer Friständerung stimmt. Lokal auslösen: `/cdn-cgi/local/scheduled?cron=17+2+*+*+*&time=<ms>&format=json` (ein `time` in der
  Zukunft räumt auch alle Sperr-Zähler ab – im Smoke-Test deshalb ganz am Ende).
- **KI-Kennzeichnung (Art. 50 Abs. 2 KI-VO):** `markAi(el, kind, on, source?)` setzt `data-ai-generated="true"`, `data-ai-content`
  (`feedback` | `feedback-final` | `checklist`) und `data-digital-source-type` = IPTC `…/trainedAlgorithmicMedia` (`AI_SOURCE`) – nur
  bei Boxen mit Stichpunkten (`hasAiPoints`), nie beim Hinweis ohne KI: Editor `#t-n .fbbox` (`renderFeedbackState`, entfernt sie beim
  Leeren), `#done-fb-n` (`renderFinalFeedback`), Lehrkraft `.dfb` (`buildDetail`); Checklisten-Seite `#chk-tasks` bei `ai:true` mit
  Punkten (`renderChecklist`, `AI_SOURCE_COMPOSITE` = `…/compositeWithTrainedAlgorithmicMedia`: KI-Vorschlag, von der Lehrkraft
  geprüft und ggf. geändert). Dazu `aiGenerated` in `/api/feedback`, `feedbackAi` im Zwischenstand (`draftRecord`; `cleanDraft` liest
  es nicht) und die XMP-Metadaten der Lösungs-PDF.
- **LanguageTool:** direkt aus dem Browser, nur auf Klick (Nutzungsbedingungen: keine automatisierten Anfragen).
  Altersgrenze des Anbieters (ab 18, mit 16/17 nur mit Erlaubnis der Eltern) **nur als Selbstauskunft** (es gibt kein
  Geburtsjahr): Button bei jedem Textfeld; vor der ersten Prüfung je geöffnetem Blatt der Dialog `ltConsent` (Wortlaut fest,
  OK „Trifft auf mich zu – prüfen“, Abbrechen „Trifft nicht zu“, `safeFirst`; bei Partner-/Gruppenarbeit eine Fassung für alle,
  „Trifft auf alle in eurer Gruppe zu – prüfen“ / „Trifft nicht auf alle zu“) – ohne Bestätigung wird nichts gesendet.
  „Trifft nicht zu“ (auch Esc) → `ltDecline`: `S.ltDeclined`, alle `.ltbtn` → Hinweis `span.ltstat.lt-off` (`LT_OFF_TEXT`,
  Fokus auf den Hinweis der Aufgabe); nichts speichern. Klick neben den Dialog (vertippt) ist keine Antwort: `askConfirm`
  mit `backdrop: null` → `ltConsent` liefert `null`, nur die Meldung „Ohne Bestätigung wird nichts …“, Buttons bleiben.
  `S.ltConsent`/`S.ltDeclined` in `openEditor`/`resetStudent` zurücksetzen (nach Neuladen fragt der Dialog wieder).
  `POST https://api.languagetool.org/v2/check`, Body `URLSearchParams`, **keine eigenen Header** (simple request,
  kein Preflight), `credentials:"omit"`, `referrerPolicy:"no-referrer"`; `language=de-DE`, `disabledCategories`
  (Stil u. a.), `enabledRules=GERMAN_WORD_REPEAT_RULE`; kein `preferredVariants`/`enabledOnly`/`level`. Offsets =
  UTF-16 = JS-Indizes; Ergebnis verwerfen, wenn sich der Text geändert hat. Nur Rechtschreibung, Grammatik,
  Groß-/Klein, Getrennt-/Zusammen, Zeichensetzung anwenden – nie Stil/Typografie/`Hint`. ≤ 20 000 UTF-8-Bytes.
  Sichtbarer Link auf https://languagetool.org ohne `rel="nofollow"` (Pflicht). Nicht über den Worker leiten
  (gemeinsame Cloudflare-IPs → ein Limit für alle). CSP `connect-src` muss `https://api.languagetool.org` erlauben.
- **Bilder zu Aufgaben:** höchstens `LIMITS.imagesPerTask` (5) je Aufgabe (Kartenbilder `mode:"card"` getrennt, siehe Antwortarten), `imageBytes` 500 KB je Bild,
  `sheetImageBytes` 12 MB je Blatt (das Frontend prüft die Summe vor dem Anlegen, `IMG_SHEET_BYTES`), `imageAlt`
  200 Zeichen Bildbeschreibung. Der Browser verkleinert vor dem Upload (`prepareImage`: längste Seite 1600 px,
  notfalls 1200/900 px, weißer Hintergrund, PNG für Grafiken sonst JPEG mit sinkender Qualität bis ≤ 500 KB;
  `createImageBitmap` mit EXIF-Drehung, `<img>` als Rückfall) und schickt JSON `{id, task, mode, alt, data}` mit
  Base64 und einer selbst erzeugten 16-Hex-id (Wiederholung nach Timeout → `existing:true`, kein Duplikat). Der
  Worker dekodiert **nie** ganze Bilder (10 ms CPU): `validateImageUpload` prüft Base64 mit `strictB64` (atob +
  Längenvergleich – ein Regex über 680 KB kostete ~5 ms) und liest nur die Kopfdaten (`imageInfo`: PNG/JPEG/WebP,
  Maße ≤ 4096) aus den ersten 144 KB. Gespeichert wird Base64 als TEXT, nicht BLOB (D1 gibt BLOBs als Zahlen-Array
  zurück – zu teuer); `data` ist die **letzte** Spalte und Listen (`imagesStmt`) lesen nur Spalten davor mit
  `ORDER BY task, pos` (Index), sonst liest SQLite je Zeile den ganzen Datenteil. Der Browser baut `data:`-URLs
  (`loadImage`, Cache je Code/id, ≤ 60 Einträge; CSP `img-src` erlaubt `data:` und `blob:`). Ein bedingter
  `INSERT … SELECT … RETURNING pos` prüft id, Blatt, Aufgabennummer, Anzahl und Gesamtgröße atomar; `pos` =
  Reihenfolge je Aufgabe, deshalb lädt das Frontend nacheinander hoch (`runUploads` mit Lauf-Kennung
  `T.uploadRun`; endet bei Abmeldung; „Zur Übersicht“ ist so lange gesperrt; vorübergehende Fehler stellen weitere
  Bilder derselben Aufgabe zurück und „erneut hochladen“ holt sie nach, endgültige Ablehnungen `PERMANENT_CODES`
  werden nur gemeldet). Blätter bleiben unveränderlich: Bilder nur beim Anlegen, gelöscht mit dem Blatt; „Als
  Vorlage verwenden“ lädt sie herunter und wieder hoch. Anzeige: `thumb` = 112 px rechts (`.task.has-thumbs`
  Grid-Areas mit `grid-template-rows:auto 1fr`, mobil als Reihe zwischen Frage und Antwortfeld), `inline` = ≤
  420×300 px zwischen Aufgabenstellung und Antwortfeld; `imgButton` zeigt beim Laden einen Spinner, bei Fehlern
  „erneut versuchen“; `alt` = Bildbeschreibung oder „Bild k zu Aufgabe n“; Klick → `#lightbox` mit Bildunterschrift
  (Esc/Klick schließt, Tab bleibt drin, Fokus zurück). Bilder gehen nie an die KI und sind unverschlüsselt
  (Lehrkraft-Inhalte). Test-Helfer `test/png.mjs` (PNG/JPEG-/WebP-Köpfe).
- **Gemeinsame Speichergrenze:** Bilder und PDF-Dateien **aller** Blätter zusammen ≤ `LIMITS.storageBytes` (200 MB roh,
  als Base64 ≈ 267 MB; D1 Free = 500 MB je Datenbank, der Rest bleibt für Abgaben). `STORAGE_SQL` (Summe über
  `idx_sheet_files_bytes(n, bytes)` und `idx_sheet_images_bytes(bytes)`) steht in den bedingten INSERTs von Bildern und
  Teil 0 der Dateien → 413 `storage_full` (`MSG.storageFull`, nennt „Als PDF-Datei herunterladen“ zum Sichern vor dem
  Löschen); `GET /api/teacher/sheets` liefert `storage: {used, limit}`, die Übersicht zeigt es in `#t-storage` (ab 80 %
  rot). D1 „Exceeded maximum DB size“ / „database or disk is full“ → 503 `db_full` (nach der `db_limit`-Prüfung).
- **PDF-Dateien zu Aufgaben (Material zum Herunterladen):** je Aufgabe ≤ `LIMITS.filesPerTask` (3) PDF-Dateien, `fileBytes`
  6 MB je Datei, `sheetFileBytes` 20 MB je Blatt, Name ≤ `fileName` 120 Zeichen (`cleanFileName` = `safeFileName` im
  Browser: NFC, Leerraum → Leerzeichen, `\p{Cc}`/`\p{Cf}` weg (Bidi-Steuerung/-Isolate, Nullbreite), `\/:*?"<>|` → `-`,
  endet auf `.pdf`, gekürzt ohne halbes Ersatzzeichen-Paar, leer → „Datei.pdf“). Tabelle `sheet_files(id, n,
  sheet_code, task, pos, name, mime, bytes, chunks, created_at, data TEXT = Base64, PRIMARY KEY(id, n))` + Index
  `(sheet_code, n, task, pos)`: **eine Zeile je Teil** (`fileChunk` 512 KB roh ≈ 683 KB Base64, Body ≤ 1 MB, D1-Zeile
  ≤ 1 MB), Teil 0 trägt die Metadaten und muss mit `%PDF-` beginnen (`validateFileUpload`: Größe, `chunks ===
  ceil(bytes/fileChunk)`, Teil-Länge exakt, `strictB64`). `POST /api/teacher/sheets/:code/files` JSON `{id (16 Hex,
  vom Browser), task, name, bytes, chunks, n, data}`: n = 0 → bedingter `INSERT … SELECT … RETURNING pos` (Blatt,
  Aufgabe, Anzahl je Aufgabe, Summe je Blatt und gemeinsame Speichergrenze atomar; Wiederholung derselben Datei (gleiche
  Aufgabe/Größe/Stückelung) → `existing:true`, sonst und bei einer Kennung eines anderen Blattes 400 „Diese
  Datei-Kennung ist schon vergeben.“; Fehler `too_many_files`, 413 `too_large`/`storage_full`), n > 0 → `INSERT OR
  IGNORE … SELECT … FROM sheet_files WHERE id AND n=0 AND sheet_code AND task AND bytes AND chunks>n` (ohne Teil 0 →
  400; passt der Teil nicht zu Teil 0 → 400 „Dieser Teil passt nicht …“, nie `existing`); Antwort `file:{…, complete}`.
  Zählabfragen je Datei mit `WHERE id=?1 AND +sheet_code=?2` (das `+` zwingt SQLite auf den Primärschlüssel statt den
  Blatt-Index – sonst zählt jeder Teilabruf alle Teile des Blattes). Listen (`filesStmt`, nur `n=0`, Spalten vor
  `data`, `have` = COUNT je id) liefern nur **vollständige** Dateien (`filesForTask`: `have >= chunks`) als
  `files: [{id, name, bytes}]` in `GET /api/sheet/:code` und `GET /api/teacher/sheets/:code`. Öffentlich `GET
  /api/sheet/:code/files/:id?part=n` → `{name, mime:"application/pdf", bytes, chunks, n, data}` – **ein Teil je
  Aufruf** (eine 6-MB-Datei in einem Stück zu lesen/serialisieren sprengt die 10 ms CPU), Body per String-Verkettung,
  `Cache-Control: public, max-age=31536000, immutable`, unvollständige Dateien → 404, fehlendes Blatt zählt
  `lookup_miss`. Browser: `loadFile(code, id)` holt die Teile nacheinander (`api` cache "default", `b64ToBytes` →
  `Blob`, Cache ≤ 6 Einträge), `fileButton` (`.filebtn`, Spinner/„erneut versuchen“, Klick → `downloadBlob(blob,
  name)` – nie im Tab öffnen) unter der Aufgabe als `.task-files` mit Sublabel „Material zum Herunterladen“;
  Lehrkraft: `teacherFiles` (`.tfiles`) in Blattdetails und Abgaben-Details. Editor: je Zeile `tr._files`
  (`{blob, name, size}`), `input.bfile-input` (Bild-Input heißt `input.bimg-input`), `.bfile-add`, `.bfile-stat`,
  `addPdfFiles` liest die Datei **sofort** in den Arbeitsspeicher (`arrayBuffer` → neuer `Blob`; eine danach auf dem Gerät
  geänderte Datei ließe sich sonst nicht mehr lesen), prüft Größe, Summe je Blatt und Kennung `%PDF-`, `renderFiles`
  (`.bfile`); der Entfernen-Knopf der Zeile ist `.acts .x` (nicht `.x` – Bilder und Dateien haben eigene); `b-gen` sammelt
  `uploads` mit `kind:"image"|"file"` und `T.uploadKinds`, `runUploads` lädt Dateien in Teilen (`u.part` = nächster
  Teil bei Wiederholung, Status „(Teil n von N)“; meldet der letzte Teil nicht `complete:true`, beginnt die Wiederholung
  bei Teil 0; Fehler ohne `ApiError` = im Browser nicht lesbar → endgültig), Erfolgstexte: nur Bilder „Alle N Bilder sind gespeichert.“, nur
  PDFs „Alle N PDF-Dateien sind gespeichert.“, gemischt „2 Bilder und 1 PDF-Datei sind gespeichert.“;
  `PERMANENT_CODES` + `too_many_files`/`bad_file`; „Als Vorlage verwenden“ lädt die Dateien per `loadFile` und
  wieder hoch. Dateien sind unverschlüsselt (Lehrkraft-Inhalte) und gehen nie an die KI; `DELETE` des Blattes
  löscht sie mit. E2E-Hilfe: `PDF_BUF` (600 KB → 2 Teile), `S.pdf`; `helpers.mjs` zeichnet `query` je API-Aufruf auf.
- **Feibeitsblatt als PDF-Datei sichern und wieder laden (nur im Browser, kein Worker-Code):** `#t-export` „Als
  PDF-Datei herunterladen“ im ausgewählten Blatt → `sheetPdfData(code, T.selSheet)` (Bilder per `loadImage`, PDF-Dateien
  per `loadFile`; fehlt eines → Abbruch, nie eine unvollständige Sicherung) → `makeSheetPdf(rec, blobs, shows)`:
  mehrseitig A4 wie `makeSolutionsPdf` (Titel, blauer Hinweiskasten mit roter Warnung „enthält die Aufträge an die KI“, je
  Aufgabe Text, `materialPlain`, Bilder als DCTDecode-JPEG aus `pdfJpeg` (Canvas, weiß, ≤ 1400 px; thumb ≤ 220×190 pt,
  inline ≤ Breite×330 pt), Dateinamen; Fußzeile „Seite n von N“). Hintergrund: Objekt 6 = Datensatz
  `feibeitsblatt.json` (`/FbSheet 1`, FlateDecode über `CompressionStream`, sonst roh) **vor** allen Anhängen; je Bild und
  PDF-Datei ein `/Type /EmbeddedFile`-Stream mit den Original-Bytes und `/FbBlob (<exportId>-<k>)`, alle im
  `/EmbeddedFiles`-Namensbaum (Schlüssel ASCII sortiert) und in `/AF`. Datensatz `{kind:"feibeitsblatt-sheet", v:1,
  exportId, exportedAt, code, title, createdAt, tasks:[{text, textFmt? (nur wenn formatiert), solution, material, images:[{ref, mime, w, h, mode, alt,
  bytes, sha256}], files:[{ref, name, bytes, sha256}]}]}` – **nie Abgaben**. Dateiname `sheetPdfName` =
  `Feibeitsblatt-<Code>-<Titel>.pdf`, Titel per `pdfAscii` nur ASCII (Chromium verwirft Download-Namen mit Umlauten/„–“
  auf manchen Systemen und nimmt „download“ – so in der E2E-Sandbox). `#t-import` „Feibeitsblatt aus PDF-Datei laden“ (Übersicht) → `#t-import-file` →
  `importSheetPdf` (≤ `SHEET_PDF_MAX_BYTES` 80 MB) → `readSheetPdf`: `pdfDoc` (`pdfLatin1`) + `pdfStreamAt(doc, i)` /
  `pdfStreamData(u, x, max)` (gemeinsam mit `readStartPdf`: Länge direkt oder als Verweis – Verweise einmal je Datei
  über `pdfIndirectInts` (alle Werte je Nummer, Regex mit `(?<!\d)` gegen quadratischen Rücklauf); eine Länge gilt nur,
  wenn direkt dahinter `endstream` steht (`fits`), sonst bis zum nächsten `endstream`; FlateDecode per `DecompressionStream`, **abgebrochen über `max`**:
  Datensatz 8 MB, Bild/Datei die erwartete Größe, Zwischenstand 4 MB). Kennzeichen werden tolerant und in **einem**
  Durchlauf gesucht (`/FbSheet\s+1`, `/FbBlob\s*(…)` mit `pdfStringValue` für \-/Oktal-Escapes und `<hex>`, da PDF-Programme
  beim Neuspeichern kompakt schreiben); fehlt das Kennzeichen eines Anhangs, wird er unter allen `/Type /EmbeddedFile`-Streams
  über Größe + SHA-256 gefunden. `cleanSheetRecord`
  kappt wie die Eingabefelder (≤ 30 Aufgaben, Text 4000/Lösung 8000, `cleanMaterial`, `textFmt` per `capFmt` auf 4000
  Zeichen samt Zeilenumbrüchen, ≤ 5 Bilder mit erlaubtem MIME,
  ≤ 3 Dateien, `safeFileName`, Refs `SHEET_REF_RE`); liegt ein Datensatz innerhalb eines Anhangs eines anderen
  (Sicherung als Material angehängt), gilt der äußere. Bilder/Dateien nur mit passender Größe und SHA-256
  (`sheetBlobOk`), Bilder zusätzlich per `decodeImage` lesbar und ≤ 4096 px, Dateien mit `%PDF-`; Fehlendes →
  Hinweis in `#b-err` (Satzanfang groß). Angehängte Dateien, die selbst eine Sicherung oder ein Zwischenstand sind
  oder eine Überblick-PDF eines Escape-Rooms (`await feibeitsblattPdfKind(u8)` → `"sheet"`/`"draft"`/`"escape"`: Kennzeichen
  `/FbSheet 1`/`/FbDraft 1`/`/FbEscape 1` oder – ohne Kennzeichen – `kind` einer eingebetteten JSON-Datei), lehnt `addPdfFiles` ab; Import und „Als Vorlage verwenden“ lassen sie mit Hinweis weg.
  Abbruch über Zähler: `T.importRun` steigt beim Verlassen der Übersicht (`teacherView`) und beim Abmelden,
  `T.exportRun` beim Abmelden (`importStillWanted`/`exportStillWanted`) – ein Import/Export aus einer früheren Sitzung
  kommt nie in der nächsten an, nach dem Abmelden wird nichts gespeichert. `makeSheetPdf` entfernt eine leere
  letzte Seite und kürzt den Titel in der Fußzeile nach Breite; `pdfWidth` kennt die Breiten der WinAnsi-Sonderzeichen
  (`PDF_W_EXTRA`, im Zweifel breiter) und misst Zeichen außerhalb von WinAnsi wie das gedruckte „?“. Dann `openBuilder(title, rows)` wie „Als Vorlage verwenden“ + Hinweis `#b-import` (bisheriger
  Code, „bekommt einen neuen Code“); „Code generieren“ legt ein neues Blatt an. Meldungen in `#t-import-status`: fremde
  PDF „In dieser PDF-Datei steckt kein Feibeitsblatt.“, Zwischenstand (`/FbDraft 1`) und Überblick-PDF eines Escape-Rooms
  (`/FbEscape 1` ohne Blatt-Datensatz) je eine eigene Meldung. `pdfWrap` trennt
  überlange Wörter hart. E2E-Test 4b prüft Export (Datensatz, Anhänge byte-genau, keine Abgaben), Import einer „neu
  gespeicherten“ Variante (`resavePdf`), neues Blatt byte-genau und löscht es wieder.
- **Antwortarten je Aufgabe** (`answer` im `tasks`-JSON; fehlt = Textfeld): `{type:"table", columns:[1–8 × ≤ 60], rows:1–30}` bzw.
  `{type:"map", map:"world", items:[1–40 × {id [a-z0-9-]{1,40} je Aufgabe eindeutig, label ≤ 120, hint? ≤ 400, image? (16 Hex,
  Kartenbild), countries:[1–10 × {id: ISO 3166-1 numerisch "\d{3}" wie world-atlas, name ≤ 80}]}]}` – eine richtige Zuordnung
  genügt. Grenzen in `LIMITS` (`tableColumns`, `columnName`, `tableRows`, `mapItems`, `itemId`, `itemLabel`, `itemHint`,
  `itemCountries`, `countryName`, `mapChecks` 400 Länder je Blatt, `cardsPerTask` 40) = `ANS_LIMITS` im Browser; beide Seiten
  prüfen (`validateAnswerSpec` in `validateSheetInput`, unbekannte Felder entfallen, „|“ in Spalten → „/“, Bezeichnungen je
  Aufgabe eindeutig – sonst wäre die Textform mehrdeutig –, Fehler 400 „Aufgabe n: …“). Weltkarte: `solution` wird `""` (nie KI; `wantsFeedback` in ai.js für `buildFeedbackMessages` und
  `feedbackResults`). Tabelle: im Prompt steht vor `<<<` der Antwort „Antwort als Tabelle mit den Spalten: …“ (Reihenfolge sonst
  unverändert). **Prüfwerte:** `routeSheetCreate` speichert je Karte `checks` = SHA-256 hex von `Code|Karten-id|Länder-id`
  (`withMapChecks`, Code ohne Bindestrich; 400 Hashes nur beim Anlegen, ≈ 3 ms CPU – `toHex` per Tabelle, ein `TextEncoder`;
  nur ein Selbsttest, kein Geheimnis: wer `WORLD_MAP` durchprobiert, findet die Länder), `GET /api/sheet/:code` liefert per `publicAnswer`
  **nie Länder**, nur `checks` (fehlen sie, werden sie berechnet) und `image` nur, wenn ein Kartenbild dieser Aufgabe gespeichert
  ist; `GET /api/teacher/sheets/:code` liefert `teacherAnswer` (ganz, ohne `checks`), alle Aufgaben `answer:{type:"text"}`
  mindestens. `/api/feedback` und `/api/submit` unverändert (Antworten bleiben Strings). **Kartenbilder:** Upload mit
  `mode:"card"` nur bei Weltkarten-Aufgaben (`json_extract(tasks,'$[n-1].answer.type')='map'` im bedingten INSERT, sonst 400
  „Kartenbilder gibt es nur bei Aufgaben mit Weltkarten-Zuordnung.“); der INSERT zählt `(mode='card')=(?4='card')` getrennt
  (thumb+inline ≤ 5, card ≤ 40, Meldung „Höchstens 40 Kartenbilder je Aufgabe.“); Blatt- und Speichergrenzen gelten weiter. Der Browser verkleinert Kartenbilder auf
  `CARD_MAX_SIDE` 400 px; `cleanImages(list)` liefert nie Kartenbilder, `cleanImages(list, true)` nur sie.
  **Textform** (Zwischenstand, Erstversuch, Abgabe, Lösungs-PDF): Tabelle = erste Zeile Überschriften, dann je ausgefüllter Zeile
  `Zelle | Zelle` (`tableText`, Zellen einzeilig, „|“ → „/“, Zeilenende ohne Leerzeichen; leere Zeilen entfallen; `tableRows`
  liest zurück); Weltkarte = je Zuordnung `Bezeichnung → Land` (`MAP_ARROW`, Reihenfolge der Zuordnung), letzte Zeile
  `Zugeordnet: x von n`; leer = `""`. **Schüler:innen:** `buildTasks` baut je Art; `S.tas[i]` hat immer dieselbe Schnittstelle
  (`value` = Textform, `_idx`, `_kind`, `_pe`, `focus()`, `readOnly`), Textfelder bleiben `textarea.answer`. `tableWidget`:
  `textarea.tcell` (einzeilig mitwachsend, `_w` = Baustein, Einfügesperre über `answerOf`, `answerChanged(el)` nimmt Zelle
  oder Baustein), Enter → Zelle darunter (neue Zeile ≤ 30), „+ Zeile“, über `MAX_ANSWER` wird die Eingabe zurückgenommen;
  kein LanguageTool und kein Zähler. `mapWidget`: Karten als `button.mcard` (`aria-pressed`, `.sel`, `.done` mit `--mc`,
  `.wrong` 3 s = `MAP_WRONG_MS`), Klick aufs Land → `sha256hex(Code|id|Land)` gegen `checks`; falsch: Karte + Land `.wrong`,
  Wahl bleibt; richtig: Farbe `MAP_COLORS[Zahl der Zuordnungen]` (12, kein Rot), ein Land behält die Farbe der ersten Karte,
  Pfeil (`svg.mapw-arrows`, `g.arrow[data-item]`, Farbe der Karte, nur wenn der Anker im sichtbaren Ausschnitt liegt,
  rAF + ResizeObserver) von der Kartenkante zum Anker, „✓ Land“ unter der Karte, Fortschritt `#mp-n` „x von n Karten
  zugeordnet“, Live-Region. Zoom 1–12 (`wheel` erst nach einem Klick in die Karte oder mit Strg – sonst scrollt die Seite und
  `.mapw-tip` sagt es; am Rand des Zooms scrollt die Seite; zwei Finger per Pointer Events, `touch-action:none`,
  Safari `gesture*` gesperrt; „+“/„−“ ×1,6; „Ansicht zurücksetzen“), Ziehen verschiebt (ab `TAP_SLOP` 6 px kein Tippen),
  Hover/Tippen zeigt den Namen (`.mapw-tip`); Zoom-Knöpfe in `.mapw-head` über der Karte, gesperrt per `aria-disabled`
  (Fokus bleibt). Ohne Maus: Karte per Tastatur wählen → Fokus in `#mi-n` „Land eingeben“
  (gemeinsame `datalist#world-dl` mit Namen und `aliases`), Enter prüft, ein falscher Name wird markiert. Esc hebt die Wahl
  auf; „Alle Zuordnungen löschen“ mit Bestätigung. Wiederherstellen ist asynchron (jede Zeile erneut gegen `checks`), bis dahin
  liefert `value` den gespeicherten Text und Klicks bleiben wirkungslos. Weltkarte ohne KI-Feedback-Box, auch nicht auf dem
  Abschlussbildschirm und in der Lösungs-PDF (`S.lastSubmission.kinds`); „→“ druckt die PDF als „->“ (`pdfPlain`; ebenso „−“ → „-“, „≈“ → „~“, „‑“/„‐“ → „-“, schmale Leerzeichen → Leerzeichen –
  sonst stünde „?23,8 %“ da; Buchstaben außerhalb von WinAnsi per `pdfLatin` als Grundbuchstabe mit den Akzenten, die WinAnsi kennt –
  „Yılmaz“ → „Yilmaz“, „ễ“ → „ê“, „Ł“ → „L“ –, andere Schriften bleiben „?“; Block `PDFPLAIN`, Unit-Test in `escape.test.mjs`). **Lehrkraft:** `answerEditor` je Zeile (`tr._ans`,
  Auswahl `#bt-n`, Spalten `#bc-n` je Zeile oder „;“, Zeilen `#br-n`, Vorschau; Karten-Editor mit Bezeichnung, Hinweis, einem
  Bild, Länder-Chips über die deutschen Namen, ↑/↓/✕; Auftrag an die KI ausgeblendet), Karten-id beim Anlegen aus der Bezeichnung
  (`itemIds`/`slugId`), `b-gen` verlangt je Karte ein anklickbares Land und verschiedene Bezeichnungen, wartet auf das
  Verkleinern (`T.preparing`) und erzeugt die Bild-ids vorab (Upload `kind:"image"`, `mode:"card"`). Vorlage, Sicherung
  (`sheetPdfData`: Kartenbilder als `images` mit `mode:"card"`, die Karte zeigt per `image` auf die Ref; sichtbar nur als Liste
  „Antwortart: …“) und Import (`cleanSheetRecord` mit `cleanAnswer(…, true, SHEET_REF_RE)`, ≤ 5 Bilder + ≤ 40 Kartenbilder,
  `builderAnswer` setzt Ref → Bild-Eintrag) tragen `answer` mit. Blattdetails `answerSpecDom`, Abgaben `answerDom` (Tabelle als
  `<table>`, Weltkarte als Liste; nur `textContent`). **Weltkarte:** `node scripts/worldmap.mjs` erzeugt aus world-atlas@2
  (`countries-110m.json`, Natural Earth 1:110m, gemeinfrei; ISC) mit d3-geo (Equal Earth, `viewBox 0 0 1000 520`, eine
  Nachkommastelle) die Konstante `WORLD_MAP = {w, h, aliases, countries:[[id, Name, Pfad, Anker x, y]]}` zwischen
  `/* WORLDMAP:BEGIN … */` und `/* WORLDMAP:END */` am Ende des Skripts in `index.html` (`--check` prüft; Unit-Test
  `worldmap.test.mjs`). 177 Gebiete, deutsche Namen in `NAMES_DE`; Kosovo, Nordzypern, Somaliland ohne Kennung (nicht
  anklickbar); Anker = Punkt mit größtem Randabstand im größten Teilgebiet (Löcher beachtet); **die Krim gehört zur Ukraine**
  (Natural Earth zeichnet sie de facto bei Russland). world-atlas, d3-geo, topojson-client nur als devDependencies (exakt
  gepinnt). Testdatei `test/fixtures/02_Feibeitsblatt_Ein-Auto-eine-Welt.pdf` (erzeugt von `make-fixture.mjs`, frei
  erfunden): E2E 7d liest ihren Datensatz selbst und vergleicht – eine andere Sicherung derselben Form lässt sich einsetzen.
  E2E 7c: Weltkarte + Tabelle anlegen, zuordnen (falsch 3 s rot, richtig gleiche Farbe/Pfeil), Zoom, Tastatur, Tabelle,
  Neuladen, Feedback-Prompt, Abgabe, Lehrkraft-Ansicht, Sicherung/Import.
- **Tippzeit-Messung (nur im Browser; Server, KI und Lösungs-PDF unverändert):** je `textarea.answer`/`textarea.tcell` (nie
  Weltkarte) `el._tt = {text, recs:[{t, g?}], undo, lastDel, ver}` (`ttNew`); Zeitpunkt `performance.now()` im Capture-Listener
  `input` (`_evTs`/`_evType`, vor jedem frühen `return`; nie `Date.now` – E2E 3e hält ihn fest), Abgleich `ttSync` (über
  `ttSyncSafe` als erste Zeile von `answerChanged`, Netz im `compositionend`) → `ttApply`: Präfix/Suffix wie `inserted` (`ttDiff`,
  nie ein Ersatzzeichen-Paar teilen; `selectionEnd` wählt bei gleichen Nachbarn – „aa“ → „aaa“ – die getippte Stelle),
  `deleteCompositionText` übersprungen; alle Einheiten eines Ereignisses gleicher Zeitpunkt → erstes gemessen, weitere 0 ms =
  rot (wie im Feiditor; so beschlossen); `historyUndo`/`Redo` holen die Zeiten gelöschter Abschnitte zurück (Puffer
  `TT_UNDO_MAX` 20, `TT_UNDO_CHARS` 2 × 8100, der neueste bleibt immer). In `input` nichts Schweres: kodiert wird beim
  Speichern/Senden (`ttB64Of`, gemerkt je Stand; Tabellen `_ttTable`/`_ttKey`/`_ttRestore` je Zelle). **Format v1:** je
  UTF-16-Einheit der Textform ein Byte – 0–70 = ms (`Math.ceil`), 71 `TT_SLOW` = mehr/erstes Zeichen/unbekannter
  Vorgänger/negativer Abstand, 255 `TT_NONE` = ohne Messung (Leerraum, Tabellenkopf/„ | “/Zeilenumbruch, wiederhergestellter Text
  ohne Daten); jeder andere Wert oder eine andere Länge → ganze Antwort ohne Messung (`ttDecode`); Base64 (`ttEncode`,
  ≤ `TT_B64_MAX` 10 800). Längere Pausen nur als 71, nie Uhrzeiten (Datensparsamkeit). Klassen `ttClass` ≤ 15 rot (`TT_RED_MS`),
  ≤ 70 gelb, sonst grün; Rot-Anteil `ttShare` je Graphem (`ttGraphemes`: `Intl.Segmenter` erst bei Bedarf und mit
  `typeof`-Prüfung, sonst Rückfall) mit dem Wert der ersten Einheit, ohne Leerraum/255, `Math.round`, ab `TT_HIGH_PCT` 50 %
  (`>=`, `ttHigh`) „– hoch“. **Zwischenstand** (nur mit `TT_KEEP_IN_DRAFT`, eingecheckt aus; localStorage, `heldDrafts`, Zwischenstand-PDF unkomprimiert): `typing:{v:1,
  answers:[B|null], first:[B|null]|null}` im selben Datensatz wie der Text (`draftRecord` über `answersNow` + `ttDraftOut`; Speicher
  voll → einmal ohne `typing`, erst dann `heldDrafts`), gelesen per `cleanDraft`/`openEditor` → `ttCleanDraft` (nur Base64, die
  genau zum gekappten Text passt) → `ttRestore` (eingefrorenes `g`, sonst 255 – nie rot; erst nach allen Texten und `S.first`,
  je Aufgabe in try; kein zusätzliches Speichern), `S.firstTyping` aus demselben `snapshot()` wie `S.first`.
  `TT_KEEP_IN_DRAFT` (eingecheckt `false` – Entscheidung des Betreibers vom 27.10.2026, Annahme: Speichern der Tippzeiten im
  Zwischenstand bräuchte eine Einwilligung nach § 25 TDDDG; die Seite fragt keine ab): `false` = nur im
  Arbeitsspeicher (nach Neuladen oder Import einer Zwischenstand-PDF gilt der Text als „ohne Messung“), `ttDraftStrip` entfernt sie
  beim Laden (`cleanupDrafts`); `true` = auch im Zwischenstand und in der Zwischenstand-PDF; die Datenschutztexte im Browser und
  `#t-tt-none` folgen dem Schalter (siehe Datenschutz-Angaben), **beim Umlegen README (Tabelle, Rechtsgrundlagen, Abschnitt
  Tippzeiten, Elternbrief, Entwicklung) und diese Datei von Hand anpassen**. **Nutzlast** (Erstversuch/Abgabe, nur verschlüsselt, `payload.v` bleibt 1): `typing:{v:1,
  answers:[{first: B|"="|null, final: B|null}]}` (`"="` = gleicher Text und gleiche Werte wie final, ohne KI-Feedback immer;
  Erstversuch `final:null`), nach Widerspruch `ttOptOutPayload()` = `{v:1, optOut:true}`, zu groß `{v:1, omitted:"too_large"}`
  (`sealPayload`: `ttEnvelopeFits` = `validateEnvelope`; `sendSealed`: 413 bzw. 409 → einmal genau dieselbe Nutzlast ohne Werte,
  nichts neu lesen), Rechenfehler `{v:1, omitted:"error"}` – **eine Abgabe scheitert nie an den Tippzeiten**; **nie** in
  `/api/feedback`, `S.lastSubmission`, Lösungs-PDF, keine Anzeige für Schüler:innen. Nach der Abgabe nur noch in der angenommenen
  Nutzlast `S.fb2Base` für das Nachreichen der zweiten Rückmeldung (siehe dort; dieselben Rückfälle, freigegeben, sobald nichts mehr
  nachgereicht wird, spätestens nach 15 Minuten), `S.firstTyping` wird nach der Abgabe `null`. **Lehrkraft:** `loadSubs` → `ttCleanPayload`
  (eigenes try/catch; → `null` | `{optOut}` | `{omitted}` | `{list}`, nur Base64-Form, `"="` nur bei gleichem Text), dekodiert
  erst beim Aufklappen: `buildDetail` → `ttDetail(p, types, n, isFirst, noFb)` (`{sum, per:[{first, fin, line}]}`, Zeilen als
  Stücke aus `ttSummary`/`ttPctText`/`ttShareParts` – bei Tabellen nur die Zellen), `ttDom`/`answerDom(…, codes, info)` (Spans
  `tt-r|tt-y|tt-g` ohne title/aria; `textContent` der Zelle = Antworttext – Tests lesen ihn; `ttSegmentsCut`: mehr als `TT_SEG_MAX`
  2000 Abschnitte → Gelb+Grün zusammen, dann nur Rot, dann keine Färbung, `ttCutNote` sagt es), `p.dtt` je Aufgabe
  („Tippzeiten – Rot-Anteil: erste Eingabe 41 % (von 29 Zeichen) · nach dem KI-Feedback 36 % (von 33 Zeichen)“; ohne KI-Feedback
  ohne Bezeichnung, Erstversuch nur die erste; teilweise „(von 150 Zeichen; 320 ohne Messung)“; hoch als `span.tt-high`; bei
  ≥ 90 % 0-ms-Rot `TT_ZERO_NOTE` „… (z. B. Wortvorschlag, Wischen, Autokorrektur, Diktat oder ein übernommener Korrekturvorschlag des
  Browsers).“ – ein per Rechtsklick übernommener Vorschlag der eingebauten Rechtschreibkorrektur (`spellcheck="true"`) kommt als ein
  `insertReplacementText`, also rot; so nennen ihn auch Legende, `#t-tt-hint`, `TT_PURPOSE` und README), `p.dtt-sum` je Eintrag nach `.dmeta`/`.dgroup` („Tippzeiten – Rot-Anteil über alle Aufgaben:
  erste Fassung … · abgegebene Fassung …“, „Tippzeiten: ohne Messung (älterer Stand).“, `TT_OPTOUT_NOTE` „Tippzeiten: ohne Messung
  (widersprochen).“, „Tippzeiten: nicht übermittelt – die Abgabe wäre sonst zu groß gewesen.“, „Tippzeiten: nicht übermittelt
  (technischer Fehler beim Senden).“; Blatt nur mit Weltkarten: keine Zeile); der Rot-Anteil steht **nie in der Liste** (keine
  Verdachtsrangliste, 5 `th` bleiben). `#t-tt` nach `#t-subs-legend` (sichtbar mit lesbaren Einträgen und einer gemessenen
  Aufgabe): `#t-tt-legend` („… ohne Färbung = Text ohne Messung (z. B. ältere Stände oder nach einem Widerspruch) …“; ohne
  `TT_KEEP_IN_DRAFT` setzt das Skript `#t-tt-none` auf „… oder vor einem Neuladen der Seite geschrieben – der Zwischenstand speichert
  keine Tippzeiten“),
  `#t-tt-hint` („Die Färbung zeigt nur, wie schnell Zeichen eingegeben wurden – nicht, wer sie verfasst hat. … Nutzen Sie die
  Färbung `TT_USE`. Schüler:innen können der Messung widersprechen: Die Kurzfassung des Datenschutzhinweises nennt die Messung in
  einem Satz, im ausführlichen Hinweis („Alle Informationen zum Datenschutz“) steht im Abschnitt „Widerspruch gegen die
  Tippzeit-Messung“ der Schalter „…“. Nach einem Widerspruch steht in den Details „ohne Messung (widersprochen)“ – das ist ihr Recht
  und kein Anlass für einen Verdacht.“; Ursachen auch „durch einen per Rechtsklick
  übernommenen Korrekturvorschlag des Browsers“), `#t-tt-off` „Färbung aus“ (`aria-pressed` =
  aus, `T.ttOff` je Sitzung, `applyTtOff` → Klasse `tt-off` an `#t-subs`, gilt auch für neu gebaute Details; `logout` setzt
  zurück). Farben `--tt-r/-y/-g` hinter schwarzer Schrift, Rot zusätzlich unterstrichen. **Zweck überall derselbe Wortlaut**
  (`TT_USE` im Block, Hinweis, README): „nur als Anlass für ein Gespräch über die Arbeitsweise – nicht für Noten und nicht bei einem
  Täuschungsverdacht“ – kein Text darf einem anderen widersprechen; LanguageTool schreibt nie ins Feld – nie als Ursache für Rot
  nennen. **Widerspruch (Art. 21 DSGVO):** Schalter = Checkbox mit Label `TT_SWITCH_DU` „Tippzeiten für dieses Feibeitsblatt nicht
  messen“ (Wortlaut vom Betreiber vorgegeben; Angaben-Bildschirm einer Gruppe: `TT_SWITCH_IHR` „Tippzeiten für euer Feibeitsblatt
  nicht messen“, Einleitung „… es genügt, wenn eine oder einer von euch das möchte:“), per `aria-describedby` zwei Absätze:
  Wirkung `TT_SWITCH_EFFECT(g, withAi, keep)` (verwerfen „– auch in deinem Zwischenstand“ nur mit `TT_KEEP_IN_DRAFT`; Erstversuch
  ersetzt, „die alte Fassung bleibt verschlüsselt noch `BACKUP_DAYS` in der Datensicherung der Datenbank“; „ohne Messung
  (widersprochen)“ – „das ist dein Recht und für deine Lehrkraft kein Anlass für einen Verdacht“; zurücknehmen = ab dann) und
  Geltungsbereich `TT_SWITCH_SCOPE(g, withAi, keep)` („Der Haken gilt für deine Bearbeitung auf diesem Gerät und für
  Zwischenstand-PDF-Dateien, die du danach sicherst.“, anderes Gerät bzw. nach „Abbrechen und Zwischenstand löschen“ erneut
  setzen, ältere PDF behält die Werte (nur mit keep), ein Erstversuch von einem anderen Gerät → Lehrkraft, „Nach der Abgabe lassen
  sich die Tippzeiten nur zusammen mit deiner ganzen Abgabe löschen – wende dich für einen Widerspruch dann an deine Lehrkraft
  oder an den Betreiber.“) – der Server kennt die Person nicht, der Widerspruch steht nur im Zwischenstand. Rückmeldung
  `p.ttopt-st` `role="status"` direkt unter dem Schalter (`TT_OPT_ON` „Widerspruch eingetragen: Auf diesem Gerät misst diese Seite
  bei diesem Feibeitsblatt keine Tippzeiten mehr.“/`TT_OPT_ON_G`/`TT_OPT_OFF`/`TT_OPT_TAB`), ganze Zeile `label.ttopt` klickbar
  (≥ 44 px) – `ttSwitchDom` im eigenen Abschnitt `TT_OBJ_HEAD` von `privacyNoticeDom` mit `ttSwitch:"live"` (`#p-privfull`,
  `#privfull-ed`; ids `<id>-ttoff`, `-ttoff-d`, `-ttoff-s`) bzw. `"preview"` (gesperrt, `#pv-preview`); sonst nennt die Oberfläche der
  Schüler:innen die Messung nur im Satz `TT_SHORT` der Kurzfassungen. Ein `change`-Listener am `document` → `S.ttOptOut`: **an** = `ttResetAll(false)` (alle `_tt` und `S.firstTyping`
  verworfen, `S.ttGen++`; `ttSync` misst nicht, `answersNow` liefert `null`), im Schreibbereich sofort `saveDraft` (ohne `typing`,
  mit `ttOptOut:true`); ist ein Erstversuch gesendet → `S.ttResend` → `sendFirstAttempt` ersetzt ihn mit derselben `attempt`
  (UPDATE derselben Zeile) durch einen ohne Tippzeiten (Lauf-Kennung `S.firstSending`, nie zwei gleichzeitig; war einer mit Werten
  unterwegs, gleich danach noch einmal; `S.attempt` gewechselt → nichts anfassen; Fehler nur `console.warn` ohne Inhalte,
  `ttResend` im Zwischenstand → beim nächsten Öffnen wie ein nicht gesendeter Erstversuch); **aus** = `ttResetAll(true)` (nur ab
  jetzt gemessen, vorhandener Text 255; ein fälliges Ersetzen bleibt fällig). **Laufende KI-Anfrage:** `snapshot()` merkt
  `ttGen`; hat sich `S.ttGen` bis zur Antwort geändert (an und wieder aus), wird `S.firstTyping` `null` – vorher gelesene Werte
  kommen nie zurück. Während `S.submitting` abgelehnt: Haken springt zurück, `.ttopt-st.late` (Farbe `--orange-ink`, keine
  Erfolgsfarbe) mit `TT_OPT_LATE` („… Scheitert das Senden, kannst du den Haken danach setzen. Nach der Abgabe …“) bzw. beim
  Entfernen `TT_OPT_LATE_OFF`; scheitert das Senden, leert `ttClearLate` im `finally` von `submitAll` die Meldung. Auf dem
  Angaben-Bildschirm gesetzt, gilt er beim Öffnen (`openEditor(true)` aus `personGo`/`groupGo`: `ttChanged = askedOut &&
  !fl.optOut` → **immer sofort speichern**, auch ohne bisherigen Stand – sonst ginge er bei einem Neuladen vor der ersten Eingabe
  verloren; Tippzeiten des Stands verwerfen, gesendeten Erstversuch ersetzen); „Weiterschreiben“ und Zwischenstand-PDF nehmen den
  gemerkten (`ttDraftFlags`: `ttOptOut`, `ttResend` nur mit `firstSent`). **Zwischenstand-PDF hochgeladen:** `importDraftPdf` →
  `ttKeepOptOut(d, local)` (Block TYPING) – ein auf diesem Gerät gespeicherter Widerspruch bleibt (Werte aus der Datei weg; ein
  gesendeter Erstversuch aus der Datei wird ersetzt, ein lokal fälliges Ersetzen derselben `attempt` gilt weiter); ein Import
  nimmt ihn nie zurück. **Zweiter Tab** (gleicher Speicher, gleicher `S.draftKey`): `ttFollowStored(raw)` übernimmt einen
  gespeicherten Widerspruch (`ttStoredFlags` – parst nur, wenn `"ttOptOut":true` im Text steht) beim `storage`-Ereignis und – für
  eingefrorene Tabs – zu Beginn von `saveDraft`, `sendFirstAttempt` und vor dem Bau der Abgabe in `submitAll` (Status `TT_OPT_TAB`,
  bei gesendetem Erstversuch `S.ttResend`); was der Tab selbst zuletzt geschrieben bzw. beim Öffnen gelesen hat (`S.ttLastRaw`,
  gesetzt in `saveDraft`/`openEditor`), zählt nicht – sonst ließe er sich nie zurücknehmen. **Der Widerspruch gewinnt:**
  Zurücknehmen gilt nur in dem Tab, in dem es geschieht (speichert ein anderer Tab danach mit Widerspruch, gilt er wieder).
  **Nach der Abgabe** (Bestätigungsseite, `S.fb2Base` gehalten; `ttFollowStored` endet bei `S.submitted`): Ein zweiter Tab weiß nichts
  von der Abgabe und trägt den Widerspruch unter demselben Schlüssel ein (`S.fb2Base.key`; der abgebende Tab hat ihn bei der Abgabe
  gelöscht, `S.ttLastRaw` zählt nicht) bzw. er kam schon während des Sendens (`S.ttOptOut`) → `fb2FollowOptOut` (beim `storage`-Ereignis
  und vor jedem Versuch in `sendFeedback2`) ersetzt `typing` der gehaltenen Nutzlast durch `{optOut}` – nachgereicht wird ohne Werte, die
  Lehrkraft sieht „ohne Messung (widersprochen)“; war das Nachreichen mit Werten schon unterwegs, gleich danach noch einmal ohne sie. So
  stimmt „(nach einem Widerspruch nicht mehr)“ in `TT_ACCESS`; kommt keine zweite Rückmeldung (`same`, gescheitert), bleibt die Abgabe beim
  Server, wie sie ist (`TT_SWITCH_SCOPE`).
  `startGo` und `resetStudent` setzen zurück, `syncTtBoxes` gleicht alle Schalter an. Reine Helfer zwischen `/* TYPING:BEGIN` und
  `/* TYPING:END */` (dort auch `cellText`/`tableText`/`tableRows` und ihre Spiegel `ttCellText`/`ttTableText`/`ttTableCells`/
  `ttTableLines`; nur `btoa`/`atob`/`Intl`, kein `$`/`S`/`h`/`document`), `test/unit/typing.test.mjs`, E2E 7l und 7m.
- **Material zu Aufgaben:** formatierter Lehrkraft-Text je Aufgabe, gespeichert im `tasks`-JSON als `material` =
  Absätze aus Läufen `{t, f?, h?}` (`f` ⊆ `"biu"` in dieser Reihenfolge, `h` = http(s)-Link). **Nie HTML**
  speichern oder rendern: `validateMaterial` (lib.js) normalisiert und prüft (`LIMITS.material` 8000 Zeichen,
  `materialParagraphs` 200, `materialRuns` 600, `materialLinks` 60, `cleanHref` nur http/https, sonst 400), das
  Frontend baut DOM per `materialDom` (Schüler:innen und Lehrkraft-Ansicht mit `links:true` → `target="_blank"`,
  `rel="noopener noreferrer"`) und serialisiert den contenteditable-Editor mit `serializeMaterial` (nur b/strong,
  i/em, u, Inline-Styles fett/kursiv/unterstrichen – ein ausdrückliches `font-weight`/`font-style` hebt vererbtes
  Fett/Kursiv auf (Google Docs), `a[href]`; Blöcke und `<br>` trennen Absätze, `<pre>` behält Zeilen, Tabellenzellen
  bekommen Abstand; Script/Bilder entfallen). Editor je Zeile (`.bmat-edit`, `execCommand` bold/italic/underline mit
  `aria-pressed` per `syncFmt`, Werkzeugleiste mit einem Tab-Stopp, Link-Dialog `#linkdlg` mit Tab-Falle und
  `applyLink`/`createLink`, ohne Schema wird `https://` ergänzt; Einfügen über `insertMaterialHtml` = DOMParser →
  Modell → DOM, Drop nur als Text an der Mauszeigerstelle). Beide Seiten prüfen vor dem Senden dieselben Grenzen
  (`MAT_LIMITS` = `LIMITS`), `cleanHref` misst die Länge nach der URL-Normalisierung. Links der Schüler:innen tragen
  einen `sr-only`-Hinweis „(öffnet in neuem Tab)“, der ↗-Marker ist nur CSS. Die KI bekommt nur `materialText` (reiner Text ohne Links,
  ≤ 4000 Zeichen je Aufgabe, `MATERIAL_CAP` in ai.js). Antworten liefern `material: []`, wenn keines da ist.
- **Formatierte Aufgabenstellung (`textFmt`):** dieselben Möglichkeiten wie beim Material (fett, kursiv, unterstrichen,
  Links). `tasks[i].text` bleibt reiner Text (≤ 4000; KI, PDF-Dateien, Listen, ältere Seiten), optional `tasks[i].textFmt` =
  Läufe wie `material`. Server: `validateMaterial(raw, n, kind)` mit `FMT_MATERIAL` bzw. `FMT_TASK_TEXT` (Zeichengrenze
  `LIMITS.taskText`, Absätze/Läufe/Links wie Material, Meldungen „Die Aufgabenstellung …“/„… in der Aufgabenstellung“),
  `validateTextFmt`; kommt ein nicht leeres `textFmt`, wird `text` daraus abgeleitet (`materialText`: Absätze mit „\n“,
  ohne Link-Adressen), danach gelten die Regeln für `text`; gespeichert wird `textFmt` nur, wenn ein Lauf `f` oder `h` hat
  (`isFormatted`). Unsichere Links → 400 „Aufgabe n: Ein Link in der Aufgabenstellung ist ungültig …“. Die KI bekommt nur
  `text` (der Prompt bleibt unverändert). Browser: `fmtEditor({cls, barCls, placeholder, barLabel, model|text, onInput})`
  ist der gemeinsame Editor (Material: `.bmat-edit`/`.bmat-bar`; Aufgabenstellung: `#bq-n.bq-edit`, Name per
  `aria-labelledby` → `#bql-n`, Werkzeugleiste `.bq-bar` „Formatierung der Aufgabenstellung n“ (Material „Formatierung des
  Materials n“, beides in `renumber`); gemeinsame Klassen `.fmt-edit`/`.fmt-bar`, Fehlermarkierung `.fmt-edit.invalid`,
  `ed._clear()`). `b-gen` schickt `text` = `fmtPlain(serializeMaterial(q, {keepIndent:true}))` – Einrückungen, Tabs (als vier
  Leerzeichen) und Leerzeilen bleiben wie früher in der Textarea (Programmcode!); beim Material und beim Einfügen von HTML wird
  Leerraum weiter zusammengefasst – und `textFmt` nur bei `isFormatted`; Grenzen per `fmtLimitError` (auch fürs Material) und `TASK_TEXT_MAX`. Anzeige per
  `taskTextDom(tag, props, text, fmt)` (Schüler:innen `#q-n.task-text`, Blattdetails, Abgaben-Details `.dtask-text`):
  formatiert als `div.qtext` mit `materialDom(…, {links:true})`, Absätze ohne Abstand wie Zeilen; enthält sie Fettes,
  `.qtext.has-b` = normale Grundschrift (die Aufgabenstellung steht sonst fett, Fett fiele nicht auf). „Als Vorlage
  verwenden“, Sicherung (Datensatz `textFmt` je Aufgabe, nur wenn vorhanden; sichtbarer PDF-Teil reiner Text) und Import
  (`cleanSheetRecord`: `capFmt(cleanMaterial(…), TASK_TEXT_MAX)`) tragen `textFmt` mit. E2E 7e: Fett per Strg+B, Link per
  Dialog, Einfügen aus HTML, Schüler:innen-Ansicht, Mock-Prompt ohne Link-Adresse, Lehrkraft-Ansichten, Vorlage,
  Sicherung → Import → neues Blatt.
- **Geburtstag ohne Jahr (Datensparsamkeit):** Die Angaben-Seite fragt nur Tag und Monat ab (`fieldset.bday`, Legende
  „Geburtstag (Tag und Monat)“, zwei Textfelder `#p-gtag`/`#p-gmonat` mit `inputmode="numeric"`, `maxlength` 2,
  `autocomplete="bday-day"`/`"bday-month"` (WCAG 2.2, 1.3.5; die übrigen Angaben `off`), kein automatischer Feldwechsel;
  `parseBdayInput`: Ziffern anderer Schriften (`\p{Nd}`) per `asciiDigits` → 0–9, Tag 1–31, Monat 1–12, der 29.02. ist
  erlaubt, „Den 31. April gibt es nicht …“). Gespeichert als `"--MM-TT"` (verkürzte Form aus ISO 8601:2000, seit 2004 nicht
  mehr in der Norm; XML Schema gMonthDay) im **historischen Feld `geburtsdatum`** (`person` in `feibeitsblatt:last`, im
  Datensatz der Zwischenstand-PDF, im Erstversuch und in der Abgabe; der Zwischenstand selbst enthält keine Person); Anzeige
  überall `fmtBday` → „TT.MM.“. Ältere Daten tragen `"JJJJ-MM-TT"`: `bdayOf` liest beides **dauerhaft** und verwirft das
  Jahr (Zwischenstand-PDF-Import über `cleanDraft`, `lastSession` schreibt sofort gekürzt zurück, Lehrkraft-Ansicht zeigt auch
  alte Abgaben ohne Jahr, `who()` für ausgeblendete Erstversuche vergleicht `bdayOf`). Übergang auf dem Gerät:
  `adoptLegacyDraft` (über `draftRaw` in `showResume`/`importDraftPdf` und in `openEditor`) sucht einen Zwischenstand unter
  alten Schlüsseln (`legacyBirthDates`: 1950 bis heute, höchstens 77 SHA-256), der jüngste zieht um, alle gefundenen alten
  Schlüssel werden sofort gelöscht – **vor** dem Speichern unter dem neuen Schlüssel (bei vollem Speicher passt derselbe Stand
  dann); scheitert es trotzdem, bleibt er in `heldDrafts` (siehe Frontend-Regeln), nie verloren. Bis `BDAY_LEGACY_UNTIL`
  ("2026-11-15", Ortszeit), danach sofort `[]`/`null` – **vor dem Ausrollen prüfen: `BDAY_LEGACY_UNTIL` ≥ Ausrolltag +
  `DRAFT_DAYS` (7) + einige Tage Puffer, sonst das Datum verschieben** (die Tests lesen es selbst). **Danach dürfen
  `adoptLegacyDraft`, `legacyBirthDates`, `BDAY_LEGACY_UNTIL` und in E2E 3e die Teile 1, 1b, 1c, 2, 4 und der Import mit
  neuerem Stand auf dem Gerät entfallen, `bdayOf` bleibt.** Alte Stände verschwinden spätestens nach `DRAFT_DAYS` beim
  nächsten Öffnen der Seite auf diesem Gerät. Die reinen Helfer stehen zwischen `/* BDAY:BEGIN` und `/* BDAY:END */`
  (`test/unit/bday.test.mjs`). E2E 3e (feste Uhrzeit per `page.clock`; mehrere alte Stände, voller Speicher, Speichern
  scheitert, Zwischenstand-PDF mit vollem bzw. unmöglichem Geburtstag, neuerer alter Stand auf dem Gerät beim PDF-Import,
  Ablauf), 7g (Lehrkraft-Ansicht mit alten Abgaben/Erstversuchen). Der Server sieht den Geburtstag nie (nur im
  verschlüsselten Umschlag). Partner- und Gruppenarbeit fragt **keinen** Geburtstag ab (siehe unten); `adoptLegacyDraft`
  sucht nur für Einzelarbeit.
- **Einzelarbeit / Partner- und Gruppenarbeit:** Nach gültigem Code (`startGo` → `openMode`, nicht bei „Weiterschreiben“ und
  Zwischenstand-PDF) `#screen-mode` „Wie arbeitest du?“ mit `button.modebtn#mode-single` „Einzelarbeit“ / `#mode-group`
  „Partner- / Gruppenarbeit“ (Name per `aria-labelledby` auf `.mt`, Erklärzeile `.md` per `aria-describedby`; Fokus auf
  `#mode-single`), `#m-back` „← anderen Code eingeben“ (`resetStudent`). Beide führen zu `#screen-person` (`openPerson(group)`,
  `S.groupMode`; `#p-back` „← zurück zur Auswahl“ fokussiert die gewählte Form): Einzelarbeit unverändert (`#p-single`),
  Gruppe „Eure Angaben“ (`#p-sub`, `#p-group` mit Hinweis `#p-members-hint`): `#p-members` mit `div.pm-row` (Label „Person n“,
  `input#p-m-n`, `maxlength` 8, Einzelarbeit-Attribute; ab Person 2 `.iconbtn.x` `aria-label` „Person n entfernen“ – Fokus danach
  auf die nachgerückte, sonst die vorige Person; eine Meldung zu einem Kürzelfeld vor der entfernten Zeile bleibt samt `.invalid`
  (ihre Nummern stimmen weiter), sonst verschwindet sie; eine zur Klasse bleibt immer (`pErrAt`); `renumberMembers` nummeriert neu), `#p-add` „Person hinzufügen“ (fokussiert das neue Feld; ab `GROUP_MAX`
  10 `aria-disabled` statt `disabled` – bleibt per Tab erreichbar –, `aria-describedby` → `#p-add-hint` `role="status"`, Text
  „Höchstens 10 Personen.“ nur bei voller Liste, sonst leer), Enter → nächstes Feld bzw. `#p-klasse`; die
  Klasse einmal (Hinweis `KLASSE_HINT_AI_G`/`_NO_AI_G` in „ihr“-Form), kein Geburtstag. `groupGo` → `checkGroup`: je Feld
  `parseKuerzel` (NFC, Leerzeichen/Bindestrich als Trenner, sonst `LETTERS`; Vorname 2–3, Nachname 1–2, ohne Trenner 3–5;
  geteilt am Trenner bzw. Groß-/Kleinwechsel „LiMu“, sonst bei 5 Buchstaben 3 + 2, sonst ein Teil; je Teil `nameCase` →
  „MaxMu“; erneut geprüft unverändert), erstes leeres Feld gemeldet, doppelte Kürzel ohne Groß-/Kleinschreibung, weniger als
  `GROUP_MIN` 2 → „… Arbeitest du allein, wähle „Einzelarbeit“.“ (Fokus `#p-add`); Meldungen in `#p-err` („ihr“-Form), Feld
  `.invalid` + Fokus. Reine Helfer (`LETTERS`, `nameCase`, `KLASSE_RE`, `normKlasse`, `parseKuerzel`, `checkGroup`, `isGroup`,
  `groupSorted`, `cleanGroup`) zwischen `/* GROUP:BEGIN` und `/* GROUP:END */` (`test/unit/group.test.mjs`). Datenmodell
  `person = {gruppe: ["MaxMu", …], klasse}` (Einzelarbeit unverändert `{vorname, nachname, geburtsdatum, klasse}`), überall über
  `isGroup`/`personLabel` („MaxMu, LiMu · Klasse 8b“)/`personOut` (Zwischenstand-PDF, Erstversuch, Abgabe): `draftKeyFor` =
  Code|gruppe|sortierte Kürzel|Klasse (dieselbe Gruppe in anderer Reihenfolge findet ihren Zwischenstand), `lastSession`/`cleanDraft`
  per `cleanGroup` (2–10, Kürzelform, Klasse), „Weiterschreiben?“ „… der Gruppe … Seid ihr das?“, Topbar `#who-lbl` „Gruppe“,
  Zwischenstand-PDF „Gruppe:“, Lösungs-PDF „Gruppe: …“ im Kopf und „Gruppe …“ in der Fußzeile (nach Breite: erst Titel kürzen,
  notfalls „Gruppe (n)“), Dateinamen ohne Kürzel. „ihr“ nur, wo es um alle geht: Angaben-Bildschirm der Gruppe,
  `privacyShortText(p, list, withAi, group, typing)` (samt `TT_SHORT(true)` „… widersprechen könnt ihr …“), `privacyNoticeDom(…, {group: true})` nur in `#p-privfull` der Gruppe (Bausteine
  `PRIV_IHR` statt `PRIV_DU`, derselbe Inhalt; „Eure Rechte“: „Jede und jeder von euch kann …“), `ltConsent` (OK „Trifft auf alle in
  eurer Gruppe zu – prüfen“, Abbrechen „Trifft nicht auf alle zu“, sonst gleiches Verhalten), „Weiterschreiben?“; im Schreibbereich
  bleibt es beim „du“ (auch `#privfull-ed`), nur ohne Geburtstag: `renderPrivacy` „zusammen mit den Namenskürzeln der Gruppe und
  der Klasse“, `noPersonData()` „ohne die Namenskürzel der Gruppe und die Klasse“ in `renderPrivacy` und `recipientSentence`
  (Feedback- und Abgabe-Dialog), im ausführlichen Hinweis `#privfull-ed` per `privacyNoticeDom(…, {noBday: true})` beim KI-Dienst. `privacyNoticeDom` „Welche Daten?“ nennt beide Formen (wer einträgt, trägt die Kürzel der anderen
  mit ein); `#pv-preview-note` nennt die „ihr“-Form. Lehrkraft: `loadSubs` kappt
  auf `GROUP_MAX` Kürzel × 20 Zeichen; Sortierung je Klasse erst Einzelarbeiten, dann Gruppen; Zeile `td.grpcell` (`colspan` 2,
  `.grpnames` + `.grpbadge` „Gruppe (n)“, Geburtstag „–“; Einzelzeilen unverändert), Details `p.dgroup` „Gruppenarbeit: …“,
  Hinweise „derselben Gruppe“/„Diese Gruppe hat …“. Server und KI unverändert (Personendaten nur im verschlüsselten payload).
  E2E 2b (eigenes Blatt, wird gelöscht; `GRUPPE_SHOTS_OUT=<Ordner>` speichert Bildschirmfotos); E2E-Helfer `chooseSingle`
  (`fillPerson` wählt „Einzelarbeit“ selbst).
- **Analoges Arbeitsblatt + Checkliste (QR-Code):** Lehrkraft: `#t-analog` „Analoges Arbeitsblatt als PDF herunterladen“ im
  ausgewählten Blatt → `openAnalog` → `#tv-analog` (Abbruchzähler `T.analogRun` wie `T.importRun`/`T.exportRun`: steigt in
  `teacherView` beim Verlassen und bei `logout`, `analogStillWanted`; `ckLeaveQuestion()` nur für `#ck-back` – abmelden lässt sich
  nur aus der Übersicht: während des PUT (`CK.saving` "put") „… Das Speichern läuft weiter … – das PDF wird dann aber nicht
  heruntergeladen.“, während das PDF entsteht ("pdf") ebenso (kind "busy"), sonst bei `ckDirty` „Ohne Speichern zurück?“ ("dirty");
  nach der Antwort wird neu bewertet – hat sich die Art geändert (Speichern inzwischen gescheitert), wird noch einmal gefragt;
  solange die Frage offen ist (`CK.leaving`), wartet `ckSave` mit dem Download; `ckUnsaved` → beforeunload). D1 `sheet_checklists` = JSON
  `{v:1, ai, tasks:[{n, points}]}` in `draft` (Vorschlag der KI, nie öffentlich) und `final`, gelöscht mit dem Blatt. Routen: `GET
  …/sheets/:code/checklist` → `{checklist:{draft, final, updatedAt}|null, aiFeedback, aiReady}`; `POST {force?}`: schon Entwurf oder
  final und kein force → keine KI (`generated:false`), keine Aufgabe mit Auftrag → leerer Entwurf `ai:false` + `noAi`, sonst `askAI`
  (erster Anbieter, dann Reserve – dieselbe Schleife wie das Feedback) → Entwurf; Fehler 429 `ai_busy`, 503
  `ai_quota`/`ai_not_configured`, 502 `ai_error` mit der ausführlichen Lehrkraft-Meldung; `PUT {ai, tasks}` → `validateChecklist`
  (cleanLine, leere und – ohne Groß-/Kleinschreibung – doppelte Punkte entfallen, `LIMITS.checkPoints` 8 × `checkPoint` 160 Zeichen,
  sonst 400 „Aufgabe n: …“) → final, draft NULL; öffentlich nur final mit Titel und reinem Aufgabentext (ohne final 404
  `no_checklist`, zählt nicht als `lookup_miss`; `no-store`). ai.js: `CHECKLIST_SYSTEM` (Du-Form, 1–6 prüfbare Punkte – nur so viele,
  wie Aufgabe und Auftrag hergeben, nie einen erfinden –, höchstens 8, Inhalte aus dem Auftrag erlaubt, außer der Auftrag verlangt,
  die Lösung nicht zu verraten: dann allgemein, „Du nennst drei Ursachen.“ – die Schutzregel für Daten zwischen `<<<`/`>>>` nimmt genau
  diese Angabe des Auftrags ausdrücklich aus), `buildChecklistMessages` (nur Aufgaben mit Auftrag:
  Aufgabenstellung, `materialText`, Tabellenspalten, Auftrag – nie Antworten), `normalizeChecklist`, `checklistAcceptor`; Mock:
  System-Prompt mit „Checkliste“ → je Zeile des Auftrags „Du beachtest: …“ (`expectedChecklist`). Browser: ohne Entwurf und final
  sofort `POST` („Die KI schlägt eine Checkliste vor …“, ohne Auftrag „Die Checkliste wird angelegt …“; bei `aiFeedback && !aiReady`
  kein `POST`, leerer Editor), Entwurf → `#ck-state` „Vorschlag der KI – noch nicht gespeichert“; je Aufgabe `#ck-n` (Label „Punkte
  der Checkliste zu Aufgabe n – …“, eine Zeile = ein Punkt, `ckParse` mit den Regeln des Servers, `aria-invalid`), `#ck-save` (PUT –
  währenddessen Felder readOnly (`ckFields`), danach baut sich der Editor aus dem Gespeicherten neu, gesperrt bis das PDF fertig ist
  (frei im `finally` desselben `CK.run`) –, dann PDF; ohne Punkte Rückfrage
  „Ohne QR-Code herunterladen?“; das `finally` des Klicks setzt die Knöpfe nur bei unverändertem `CK.run` zurück, `openAnalog` setzt
  `#ck-save` selbst zurück), `#ck-regen` (Rückfrage, `force`; ein Fehlschlag lässt den Editor stehen; `ckSuggest` gibt den Fokus
  danach an `#ck-regen`/`#ck-save` zurück, wenn er durchs Sperren auf `body` fiel; verborgen ohne Auftrag oder ohne nutzbaren
  KI-Dienst), `#ck-open` (nur mit final; `href` = `checkUrlOf(code)`, genau das Ziel des QR-Codes), `#ck-status`, `#ck-aiwarn`
  (Aufträge, aber kein KI-Dienst nutzbar bzw. – `CK_NO_AI_SHEET` – gar kein Auftrag → der KI-Satz fehlt im PDF; `#ck-state` sagt beim
  leeren Entwurf dann nur „Noch nicht gespeichert.“); KI-Fehler per `ckAiFailText` (`ai_quota` mit der Meldung des Servers, ohne
  doppelten Grund), keine automatische Wiederholung. PDF `makeAnalogPdf` (`analogImages` lädt Bilder und Kartenbilder per `loadImage`
  → `pdfJpeg`, fehlt eines → Abbruch; PDF-Dateien nur als Namen): A4, Ränder 50/56/60, `/F1`–`/F4` = Helvetica, -Bold, -Oblique,
  -BoldOblique, Inhalte FlateDecode (`deflateBytes`); `analogRuns`/`analogLines` setzen Läufe mit Formatierung, Links **nur als
  Adresse** (nie der Linktext) mit URI-Annotation (gedruckt per `analogHrefText`: prozentkodierte Umlaute lesbar wie in der
  Adresszeile, nur WinAnsi-druckbare Zeichen ohne Leer-/Steuer-/Formatzeichen, sonst kodiert; die Annotation bleibt kodiert; Punycode
  bleibt), zwischen zwei aneinanderstoßenden Adressen bzw. Wort und Adresse ein Leerzeichen, nach einer Adresse vor jedem direkt
  folgenden Text außer Satzzeichen (`ANALOG_AFTER_URL`: „[Wikipedia]-Artikel“ → „https://… -Artikel“), Einzug aus führendem Leerraum,
  überlange Wörter hart getrennt; Kopf: Titel, Hinweiskasten (Code, `PUBLIC_URL` als Link, KI-Satz nur bei `aiFeedback && aiReady`),
  Name/Klasse/Datum; je Aufgabe bleiben Überschrift, Text und der erste unteilbare Block zusammen (sonst neue Seite), Bilder wie
  `makeSheetPdf`, Material mit grauer Linie, „Material zum Herunterladen (nur digital): …“; Antwort: `ANALOG_LINES` 8 ×
  `ANALOG_LINE_PT` 24 (`q 0.6 G 0.5 w … S Q`, mindestens 3 auf der Seite), Tabelle (`ANALOG_ROW_PT` 48 mit Hilfslinie `q 0.8 G 0.4 w`,
  Kopf auf jeder Seite; `tableHead`: fett 10 pt, kleiner in 0,5-pt-Schritten bis 7 pt, bis jedes Wort – auch nach „-“/„/“ trennbar –
  in die Spalte passt, erst dann hart mit „-“), Weltkarte als Form-XObject `/Wm` (`worldPdfPath`, einmal je PDF) mit zweispaltiger
  Liste und „Land:“-Linien (der Satz „Schreibe zu jeder Karte …“ bleibt mit dem ersten Kartenpaar auf einer Seite); am Ende (nur mit
  Punkten) QR-Code `ANALOG_QR_PT` 90 (Module als Rechtecke in Modul-Einheiten per `cm`, Ruhezone 4 Module, links im Seitenrand) zu
  `checkUrlOf(code)` = `PUBLIC_URL#checkliste=CODE` (`window.FEIBEITSBLATT_PUBLIC`, GitHub Pages – ohne Pages dort die eigene Adresse
  eintragen, README „Optional: GitHub Pages“; der Textbaustein für Eltern nennt GitHub für die Checklisten-Seite); Fußzeile Code ·
  Titel und „Seite n von N“; Datei `Feibeitsblatt-Arbeitsblatt-<Code>-<Titel>.pdf`; nie Aufträge an die KI, Länder, Abgaben oder
  Checklistenpunkte. QR-Block zwischen `/* QR:BEGIN` und `/* QR:END */` (`qrMatrix(text, forceMask?)` → `{size, version, mask, dark}`,
  Byte-Modus, Stufe M, Version 1–10, nur zur Laufzeit aufrufen; `test/unit/qr.test.mjs` mit jsQR 1.4.0). Schüler:innen:
  `#checkliste=<CODE>` (beim Laden; `hashchange` nur von Start, Arbeitsform, Angaben und Checkliste aus) → `#screen-check`
  (`openChecklist`/`renderChecklist`: Aufgaben mit Punkten als `fieldset.chkset`, lange Texte in `details`, Checkboxen `#chk-n-k` in
  `label` ≥ 44 px, Zähler `#chk-c-n`, eine verzögerte Live-Region `#ck-live`; ohne Punkte „Deine Lehrkraft hat … keine Checkliste
  hinterlegt.“; `ai:true` → KI-Hinweis), Häkchen nur in `localStorage` `feibeitsblatt:check:<CODE>` = `{t, sig (FNV-1a über die
  Punkte), ticks}` (`cleanupChecks` nach `DRAFT_DAYS`), „Alle Häkchen entfernen“ (löscht nur, wenn nach dem Dialog noch dieselbe
  Checkliste offen ist: `CHK.run`/`CHK.code`), `#chk-privacy` (Satz zur IP wie `#start-privacy` und Verweis „Alle Informationen …
  findest du unter „Impressum & Datenschutz“ ganz unten auf der Seite; passend zu deinem Feibeitsblatt auch, wenn du es mit seinem
  Code digital öffnest (auf der Startseite „Weiter“).“ – passt in jedem Zustand,
  auch ohne `#chk-open`; die Seite selbst zeigt keinen vollständigen Hinweis, dafür beschreibt `privacyNoticeDom` die
  Checklisten-Seite: `CHECK_PURPOSE` unter „Wozu …“, `CHECK_STAY` unter „Wie lange …“; am Worker (`!PAGES_HOST`, `PUBLIC_HOST` ≠
  `location.host` → `CHECK_HOST`) heißt sie dort „die Checklisten-Seite (Host)“ statt „diese Seite“, und die Empfänger nennen
  `CHECK_GITHUB_ITEM` (GitHub nur für die Checklisten-Seite; auf GitHub Pages gilt `GITHUB_ITEM` für alles)), „Feibeitsblatt digital öffnen“
  (`leaveChecklist`: Hash weg, Startseite mit Code, Fokus auf „Weiter“), Fehler `no_checklist`, unbekannter Code, Netz („Erneut
  versuchen“). Sicherung und „Als Vorlage“ tragen die Checkliste nicht mit. Tests: Unit lib/ai/worker/qr, Smoke-Schritt „Checkliste“,
  E2E 7k (Vorschlag des Mocks, Ändern/Ergänzen, PDF per zlib: Hinweis, Link als Adresse, Wikipedia-Adresse mit Umlaut lesbar, zwei
  aneinanderstoßende Links und „[Quellen]-Text“ getrennt, 16 Schreiblinien, 4 Tabellenzeilen, Kartenpfade, QR → jsQR; erneutes Öffnen
  ohne KI; `ai_quota` per `page.route` ohne doppelten Grund, Fokus bleibt auf `#ck-regen`; Checklisten-Seite mit KI-Kennzeichnung;
  ohne Punkte kein QR; zurück während eines angehaltenen PUT (Rückfrage, gespeichert, kein PDF); per `page.route` ein Blatt ohne
  Auftrag (`#ck-aiwarn`) mit 8 langen Tabellenspalten (Kopf 7 pt, Trennung mit „-“)); `ANALOG_PDF_OUT=<Ordner> npm run test:e2e`
  speichert das PDF lokal zum Ansehen (`pdftoppm -r 60 -png`).
- **Escape-Room-Anbindung (Schnittstelle v1):** Ein Blatt kann das Finale eines Escape-Rooms sein: `escape: {id, name}` (id
  `[a-z0-9-]{3,60}`, name einzeilig 1–80; `validateEscapeSpec`/`escapeOut` in lib.js, nur beim Anlegen – Blätter bleiben
  unveränderlich; D1 `sheets.escape_id`/`escape_name` per `ensureColumns`, NULL = normales Blatt; die vorhandenen `SELECT`s lesen nur
  zwei Spalten mehr – keine zusätzliche D1-Abfrage, Unit-Test zählt). **Lehrkraft:** Builder `#b-esc` „Feibeitsblatt für einen
  Escape-Room (Finale)“ (`aria-controls`; kein Fokussprung beim Haken – WCAG 3.2.2, die Felder folgen per Tab) mit `#b-esc-name`/`#b-esc-id` und `#b-esc-hint`; `b-gen`
  prüft wie der Server (Fehler „Escape-Room: …“ in `#b-err`, Feld `.invalid` + Fokus), Ergebnis `#b-res-esc` statt `#b-res-normal`
  nur, wenn die Antwort `escape` trägt. „Als Vorlage“, Sicherung (Datensatz `escape` nur, wenn gesetzt; sichtbare Zeile „Escape-Room:
  „…“ (Kennung …) – …“) und Import (`cleanSheetRecord` → `cleanEscapeSpec`; `#b-import` nennt den Raum) tragen es mit – den Satz zum Raum
  (`builderNote`/`syncBuilderNote`, `span#b-import-esc`) zeigt `#b-import` nur, solange Haken, Name und Kennung zum bisherigen Blatt passen. Liste:
  `td.code.esc` mit `span.escbadge` „Escape-Room“ + Name statt des Codes; Blattdetails per `selEscapeUi` (schon aus dem Listeneintrag):
  `#t-sel-code-lbl` „Code für den Quelltext des Escape-Rooms“, `#t-sel-meta` mit Raum und Kennung, Hinweis `#t-sel-esc`,
  `#t-analog`/`#t-analog-hint` verborgen (`openAnalog` kehrt zurück; Worker: Checkliste POST/PUT → 400 `escape_sheet`,
  `MSG.ckEscape`); der Lösch-Dialog warnt, dass der Arena-Tunnel dann ins Leere führt. **Der Code steht im öffentlichen Quelltext
  des Raums** (`FEIBEITSBLATT_CODE`): Die Sperre der Startseite ist nur Oberfläche – jede:r kann mit dem Code `GET /api/sheet/:code`,
  `POST /api/feedback` und `POST /api/submit` aufrufen und die Grenzen je Blatt (400 Abgaben/40 MB, `sheet_feedback` 600/Tag)
  ausschöpfen; Gegenmittel: Einträge löschen bzw. neues Blatt und neuen Code im Raum eintragen (README, `#b-esc-hint`).
  **Hülle** (vom Raum, im Link und in der Überblick-PDF gleich): `{kind:"feibeitsblatt-escape", v:1, d, s}`, `d` = JSON-Text der Daten
  (`code` (6 Zeichen oder "" = noch nicht freigeschaltet), `room {id, name, url}`, `person {vorname, nachname, geburtsdatum, klasse}`,
  `confirm`, `word`, `completedAt`, `stations [{label, attempts, errors [{item, wrong?, right?, note?}]}]`, `notes [{label, text}]`,
  `resumes [{place, savedAt, loadedAt}]`), `s = fbEscapeHash("FbEscape|v1|" + d)` (cyrb53-Variante über UTF-16-Einheiten, 16 Hex;
  Testvektoren `"FbEscape|v1|{}"` → `0bdda452e8d9ff95`, `'FbEscape|v1|{"a":"Größe – „x“"}'` → `6721119dc06e029b`) – öffentlich
  nachrechenbar, **nur ein Indiz** gegen versehentliche oder plumpe Änderungen. Link: `#escape=<base64url(UTF-8), ohne „=“>` – schon
  ein **kleines ES5-Skript im Kopf** (vor dem Aufbau der Seite, unabhängig vom großen Skript – auch wenn dieses scheitert) legt ihn in
  `window.FEIBEITSBLATT_ESCAPE_LINK` ab und entfernt ihn per `history.replaceState(null, "", pathname + search)`; die erste Anweisung des
  großen Skripts übernimmt ihn (`escLinkRaw`, Rückfall: Hash selbst lesen) und löscht die Variable; verarbeitet wird er nach
  `cleanupDrafts` statt `showResume` (`escArriveLink`). Im **Verlauf des Browsers** bleibt der Link trotzdem (mit Verlaufs-Synchronisierung
  auch beim Anbieter des Browsers) – `ESC_PRIV.stay`, `ESC_BACK("link")` und README sagen das, nie „nicht gespeichert“ ohne diesen Zusatz; `hashchange` mit `#escape=` entfernt ihn immer sofort
  und übernimmt ihn nur auf freien Bildschirmen (`CHECK_SCREENS` und Impressum), sonst verworfen (Schreibbereich bleibt). Überblick-PDF:
  unkomprimierter `/Type /EmbeddedFile`-Stream mit `/FbEscape 1` (`/EmbeddedFiles` `feibeitsblatt-escape.json`, `/AF`) →
  „Zwischenstand-PDF hochladen“ → `readStartPdf` (ersetzt `readDraftPdf`; Kennzeichen und eingebettete Dateien in einem Durchlauf,
  ≤ 60 Objekte; ein Zwischenstand gewinnt immer, auch weiter hinten, sonst die erste Hülle; tolerant wie `/FbDraft 1`: FlateDecode,
  `/Length n 0 R`, ohne Kennzeichen, kompakt geschrieben; `/FbEscape 1` ohne brauchbare Hülle → `escape-bad`).
  **Block `ESCAPE:BEGIN`…`ESCAPE:END`** (reine Funktionen nach dem Block GROUP; `test/unit/escape.test.mjs`): `escB64urlBytes` (feste
  Reihenfolge: Länge zuerst, `%`-Kodierung, Form per beidseitig verankertem `^[A-Za-z0-9_-]+={0,2}$` und erst dann höchstens zwei „=“
  abschneiden – nie `/=+$/`, das läuft bei vielen „=“ in manchen Browsern quadratisch zurück –, `atob` in try), `escHull` (Objekt, Text oder Bytes; UTF-8 `fatal`;
  Größe immer als kompakte Hülle ≤ `ESC_MAX_BYTES` 96 KB gemessen – auch aus dem Zwischenstand; neues Objekt mit genau vier Feldern),
  `escCheck` (`"ok"`/`"mismatch"`), `cleanEscape` (fremde Daten: Objekte aus einzeln gelesenen, typgeprüften Feldern neu gebaut – nie
  Spread/`Object.assign` fremder Objekte, `__proto__` aus `JSON.parse`; Arrays erst kappen, dann verarbeiten; `code` muss "" oder ein
  gültiger Code sein, `room.id` passen, sonst `null`; `room.url` entfällt; Strings einzeilig ≤ 2000 (`escLine`), `notes[].text` ≤ 4000
  mit Zeilenumbrüchen (`escText`), ≤ 20 Stationen, Notizen und `resumes`, ≤ 30 Fehler je Station, Fehler ohne `item` entfallen; Namen
  ≤ 60; Klasse wie `KLASSE_RE`, sonst leer – dann fragt die Seite sie ab; Geburtsdatum nur als echtes Datum TT.MM.JJJJ, sonst leer).
  `confirm`: nur Ziffern (≤ 20) – wird nur angezeigt, nie geprüft. Weiter `escKuerzel`/`escPerson` (Vorbelegung: erste 3 bzw. 2
  Buchstaben per `nameCase`, Geburtstag ohne Jahr über `parseBdayInput`, `complete`, `okV/okN/okBday/okK`), `escPayload` (an die
  Lehrkraft genau `{room:{id, name}, word, completedAt, stations, resumes, check}`), `escTrim` (Notfall: `errors: []`,
  `omitted:"too_large"`), `escHasDetails`, `escCleanPayload`/`escSummary` (Lehrkraft; fehlerfrei = genau ein Versuch ohne Fehler, wie
  die Überblick-PDF des Raums; bei `omitted` Fehlerzahl `null`), `cleanEscapeSpec` (Blatt-Feld, `null` statt Fehler).
  **Ankunft** `escArrive(hull, src)` (`ESC.run` gegen späte Antworten; `escDrop()` in `startGo`, `importDraftPdf`, „Weiterschreiben“
  (`#resume-btn`), `openChecklist` und `openLegal` verwirft eine liegen gebliebene Ankunft samt Vorbelegung). `ESC.run` ist die
  Lauf-Kennung der Startseite: `startGo`, `importDraftPdf`, „Weiterschreiben“ und `escLoad` laden per `fetchSheet` (ändert `S` nicht) und
  übernehmen erst per `useSheet`, wenn ihr Lauf noch gilt – eine späte Antwort ändert nie das gerade geöffnete Blatt (sonst ging z. B.
  eine Abgabe an das Escape-Blatt, während der Schreibbereich ein normales zeigte). Hülle ungültig → `ESC_LINK_BAD`/`ESC_PDF_BAD`,
  `code: ""` → `ESC_NOT_OPEN`, Blatt fehlt → `ESC_NO_SHEET`, Netz/5xx → Meldung + `#start-esc-retry` „Erneut versuchen“ (die Daten bleiben
  im Arbeitsspeicher; hatte der Knopf den Fokus, bekommt er ihn nach einem erneuten Fehlschlag zurück, nach einem endgültigen Abbruch
  das Code-Feld), anderer Raum → `ESC_WRONG`; nach jedem endgültigen Abbruch (nicht bei Netzfehlern mit „Erneut versuchen“)
  `showResume()`. Dann nur Einzelarbeit (kein `#screen-mode`): liegt
  auf dem Gerät ein Zwischenstand derselben Person mit Text → direkt `openEditor()`, sonst `openPerson(false, pre)` mit `#p-escape`
  (`p.note`, `role="status"`; Lücken „Bitte trage noch … ein.“, Fokus aufs erste leere Feld, sonst `#p-btn` – dieses Element bekommt
  `aria-describedby="p-escape"` per `describedBy`, denn die vor dem Einblenden gefüllte Statusmeldung würde nicht angesagt), `sheetLine`
  „Escape-Room „…“ · n Aufgaben“, `#p-back` „← zur Startseite“ (verwirft, `#start-status` `ESC_BACK(src)` – „Diese Seite hat … nicht
  gespeichert.“, per Link zusätzlich der Satz zum Verlauf des Browsers; `S.escPending.src`). Bis zum Schreibbereich bleiben die Daten nur
  im Arbeitsspeicher (`S.escPending`; `escPendingFor`: Code und Raum müssen zum Blatt passen). `openEditor` klärt die Hülle vor allem
  anderen (`escFromHull`; eine neue Ankunft gewinnt gegen die Hülle im Zwischenstand – ersetzt sie eine andere, meldet das
  `p#esc-updated` (`role="status"`, per `liveFill` erst eingeblendet, dann gefüllt, mit dem Abschlusszeitpunkt), dieselbe Hülle bleibt still; die Prüfsumme wird immer neu gerechnet, nie
  gespeichert übernommen; Escape-Blatt ohne passende Hülle oder als Gruppe → `ESC_NEED`) und speichert sofort (`arrived`); `S.escape =
  {hull, rec, check}`. Alle Texte und Dateinamen nennen den Raum mit `S.sheet.escape.name` (vom Server), nie mit Daten aus dem Link.
  Startseite: der Code eines Escape-Blattes → `ESC_START`, kein Weiter; der Hinweis unter „Zwischenstand-PDF hochladen“ nennt die
  Überblick-PDF. **Zwischenstand** und Zwischenstand-PDF tragen die Hülle unverändert (`draftRecord` → `escape`, `cleanDraft` per
  `escHull`; Zwischenstand-PDF mit Zeile „Escape-Room: …“ und Punkt unter „Bitte beachte“, ohne `/FbEscape 1`, als
  `application/octet-stream` wie die übrigen Escape-PDFs – nur speichern, nie als Vorschau im Tab); `#sheet-meta` nennt das
  Finale, der Dialog „Abbrechen und Zwischenstand löschen“ auch die Daten aus dem Raum. Erstversuch und Abgabe: `payload.escape =
  escPayload(rec, escCheck(hull))` – nur verschlüsselt, ohne vollen Namen, ohne volles Datum, ohne Bestätigungscode, ohne `notes`; nie in
  `/api/feedback`; passt der Umschlag nicht, erst ohne Tippzeiten, dann `escTrim` (`sealPayload`, `sendSealed` bei 413/409) – eine
  Abgabe scheitert nie an den Daten aus dem Raum. Die nachgereichte zweite Rückmeldung (`sendFeedback2`, stage „feedback2“) trägt
  `escape` genau so, wie es mit der Abgabe angekommen ist (`S.fb2Base`); die Lösungs-PDF der Lehrkraft („Lösungs-PDF herunterladen“)
  enthält bei Escape-Blättern nur die Lösungsseiten (ohne `escPdfPages`). Ablauf-Kasten: letzter Punkt „Lösungen, letztes Feedback und Escape-Room-Überblick
  herunterladen“ (ohne KI „Lösungen und Escape-Room-Überblick herunterladen“) + `STEP_LATE`. `#screen-done`: Gesamt-PDF =
  `makeSolutionsPdf` (Lösungsseiten) + `escPdfPages(pg, esc, {mode:"student"})` (Name, Geburtsdatum, Klasse, Bestätigungscode, Codewort,
  je Station Versuche und Fehler im ersten Versuch, neue Seite „Lösungserläuterungen“ mit „Genaue Daten: …“ 9 pt grau, „Verwendung von
  Zwischenstand-Dateien des Escape-Rooms“) über `pdfPager`/`pdfAssemble` (gemeinsam mit der Lösungs-PDF, Objektnummern unverändert),
  `application/octet-stream` (nur speichern, nie im Tab), `Escape-Room-<Raum>-Abschluss-<JJJJ-MM-TT>.pdf` (`escFileRoom`), nie
  Tippzeiten. Technisch gescheiterte Abgabe (`escFailKind`/`escMailNow`: sofort bei
  jedem Fehler außer `ESC_NOT_TECHNICAL` – Prüffehler des Servers –, 413 und den „weichen“: 429 `rate_limited` erst, wenn ein neuer Versuch
  nach `retryAfter` wieder scheitert, 409 `too_many_submissions` erst beim nächsten Fehlschlag (`S.escSoft`; jeder andere Fehler beginnt
  neu) – der Code steht öffentlich im Raum, ein gefülltes Blatt soll nicht gleich alle auf den unverschlüsselten E-Mail-Weg schicken; bei
  429 ohne „versuche es gleich noch einmal“): `#submit-esc` (erst eingeblendet, dann `#submit-esc-text` gefüllt – sonst nicht angesagt) mit
  `mailLink()` und `#submit-esc-pdf` „Abschluss-PDF für die E-Mail herunterladen“ (bewusst ein Knopf statt eines automatischen Downloads;
  `#submit-esc-note` nennt vollen Namen, Geburtsdatum, Bestätigungscode und Antworten; Vermerk `ESC_FAILED_PDF_NOTE` rot ganz oben,
  „Stand: … – noch nicht abgegeben“, `…-nicht-abgegeben.pdf`, ohne Tippzeiten; verborgen bei jedem neuen Versuch und nach Erfolg). **Lehrkraft-Ansicht:** `loadSubs` →
  `escCleanPayload` (eigenes try/catch); `escDetailDom` nur bei Escape-Blättern (sonst wird `escape` ignoriert): `.desc-h` mit dem
  Namen des Blattes, `.desc-sum` „Abgeschlossen am … · im ersten Versuch fehlerfrei: x von n Stationen · Fehler im ersten Versuch
  insgesamt: f · Zwischenstand-Dateien des Escape-Rooms: k|keine“ (bei `omitted` „nicht übermittelt …“; ohne Daten „Ohne Daten aus dem
  Escape-Room.“), fremde Kennung `.desc-warn`, `.desc-check` (`ESC_CHECK_TEXT`: „stimmt – ein Indiz, kein Beweis.“ bzw. `.bad` „stimmt
  nicht – der Datensatz wurde verändert oder ist beschädigt.“), `details.desc-more` „Überblick ansehen“ (erst beim Aufklappen,
  `escOverviewDom`), `button.desc-pdf` „Überblick als PDF herunterladen“ (`escPdfPages` mode `teacher`: Kürzel, Geburtstag ohne Jahr,
  Klasse, Prüfsummen-Satz, ohne Bestätigungscode und ohne Lösungserläuterungen; `Escape-Room-<Raum>-Ueberblick-<Code>-Eintrag-<id>.pdf`).
  Nur `textContent`/DOM-APIs. **Datenschutz:** `privacyShortText` bleibt unverändert (typing.test prüft ihn wörtlich); die Sätze zum
  Escape-Room sind eigene Knoten ohne Tippzeit-Wörter: `p.privacy#p-privacy-esc` (`escPrivacyShort`) unter `#p-privacy-short`,
  `p#privacy-esc` (`escPrivacyEditor`) unter `#privacy`, `privacyNoticeDom(…, {escape: name})` (Option hinter `ttSwitch`) mit Absätzen
  bzw. Listenpunkten aus `ESC_PRIV` (Wozu; Welche Daten – nach dem `TT_ACCESS`-Absatz, mit der Rechtsgrundlage Buchst. b bzw. § 25
  Abs. 2 Nr. 2 TDDDG, die Liste „Rechtsgrundlage“ bleibt gleich; Lehrkraft samt „verschlüsselt bei Cloudflare gespeichert“ – der
  Cloudflare-Punkt selbst bleibt unverändert; E-Mail-Weg `escMailItem` – sonst stimmte „nicht deinen vollen Namen …“ nicht; Wie lange
  samt Browser-Verlauf des Links und Verlaufs-Synchronisierung und Aufbewahrung der E-Mail „bis deine Lehrkraft sie übernommen hat“ –
  Entscheidung des Betreibers offen). „Impressum & Datenschutz“: `#legal-escape` in allgemeiner Form, `#legal-privfull`
  unverändert; Vorschau der Lehrkraft: `PV_ESC_NOTE` in `#pv-preview-note`. **Tests:** `escape.test.mjs` (Testvektoren, 200 Zufallstexte
  gegen die Kopie in `test/escape-fixture.mjs`; dort auch `escHull`, `b64url` und `overviewPdf(hull, {flate, marker, compact, lenRef})`
  im Objektaufbau der Überblick-PDF des Raums), lib-/worker-Tests, Smoke-Schritt „Escape-Room-Blatt“ (auch: KI-Prompt ohne mitgeschickte
  Raum-Daten, D1 ohne Klartext), E2E 7n/7o (eigene Fixtures: unkomprimiert, FlateDecode ohne Kennzeichen, manipulierte Prüfsumme;
  Wettlauf langsames Escape-Blatt gegen hochgeladenen Zwischenstand eines normalen Blattes – Abgabe an dessen Code; Hash weg auch bei
  einem Syntaxfehler im großen Skript; Fokus nach erneut gescheitertem „Erneut versuchen“; `#esc-updated`; E-Mail-Weg bei 404 sofort,
  bei 409/429 erst später; zweimal 413 → ohne Tippzeiten, dann ohne Fehler-Einzelheiten samt Lehrkraft-Kurzfassung; die nachgereichte
  zweite Rückmeldung in D1 entschlüsselt samt `escape` und `typing`, Lösungs-PDF der Lehrkraft nur mit den Lösungsseiten; `#b-import` folgt
  dem Haken; `ESCAPE_PDF_OUT=<Ordner>` speichert die PDF-Dateien und Bildschirmfotos). Testdaten frei erfunden, `confirm` in Tests eine beliebige
  Ziffernfolge; keine Datei aus einem echten Escape-Room als Fixture.
- **Frontend-Regeln:** Nutzerdaten nur per `textContent`/DOM-APIs, **nie `innerHTML` mit fremden Daten**.
  Einfügesperre in Schichten (`paste`, `drop`/`dragover`, `beforeinput` `insertFrom…`, `typedTooBig`: ein
  `insertText` über 40 Zeichen / mehrere Wörter ab 20 Zeichen / mit Zeilenumbruch gilt als Zwischenablage (Gboard-
  Clips), `insertReplacementText` ≤ 60, Komposition/Diktat ≤ 2000; Sprung-Fallback im `input`). Antwortfelder
  wachsen per `scrollHeight` (ResizeObserver auf `#sheet`); eine Leerzeile Abstand zur nächsten Aufgabe; im
  Schreibmodus scrollt nur `.paperwrap`, nichts liegt über der Schreibfläche (Abgeben ohne KI-Feedback: eigener Punkt
  unten). Zwischenstand in `localStorage` unter `feibeitsblatt:draft:<SHA-256>` (`draftKeyFor`: Code|Kürzel|Geburtstag|
  Klasse, Gruppe Code|gruppe|sortierte Kürzel|Klasse; Schlüssel ohne Klartext-Angaben; 7 Tage), `feibeitsblatt:last` für „Weiterschreiben?“ auf der Startseite,
  „Abbrechen und Zwischenstand löschen“ in der Topbar (der Dialog nennt einen schon gesendeten Erstversuch – „sie kann den Eintrag löschen“ – und bei laufender Anfrage „Was schon gesendet wurde, hat der KI-Dienst bereits erhalten.“); alle Zugriffe in try/catch, nach Abgabe löschen. Was sich nicht
  speichern lässt (Speicher voll/gesperrt), hält `heldDrafts` im Arbeitsspeicher (neuer als der gespeicherte Stand; `draftStored`
  liest, `delDraft` löscht beides, `saveDraft` liefert `ok`; `openEditor` speichert so einen Stand sofort erneut und zeigt sonst
  `SAVE_FAILED`). Lehrkraft: Abmeldung nach 20 min ohne Eingabe; Abgaben-Listen seitenweise laden; fremde Payloads vor
  dem Rendern kappen (≤ 30 Antworten). **Ablauf-Kasten** `#ed-steps` (orange, Tokens `--orange`/`--orange-bg`/`--orange-cur`/
  `--orange-ink`; `h2#ed-steps-h` „So gehst du vor“, `ol#ed-steps-list` mit nativer Nummerierung zwischen `header.sheet-head` und
  `#tasks` – außerhalb von `#tasks`, `h1#sheet-title` bleibt die erste Überschrift –, scrollt mit `.paperwrap`, weder sticky noch
  Live-Region): `renderSteps` aus `renderFeedbackState`, bei `busyFeedback`, `unlock`, `submitting` und `stopFeedbackRun` (baut die
  Liste nur bei geänderten Einträgen neu, `ol._key`; sonst nur `li.cur` + `aria-current="step"`). Mit KI: „Aufgaben bearbeiten“,
  „KI-Feedback anfordern (freiwillig, empfohlen)“ (ohne Empfänger oder mit gemeldetem Grund `fbBlockedNow`: „(freiwillig, empfohlen
  – gerade nicht möglich)“), „Lösungen mithilfe des KI-Feedbacks überarbeiten“, „Abgeben“, „Lösungen und letztes Feedback
  herunterladen“ + `STEP_LATE` („– nur direkt nach der Abgabe auf der Bestätigungsseite (nicht nach Neuladen oder „Neues
  Feibeitsblatt öffnen“)“); ohne KI „Aufgaben bearbeiten“, „Abgeben“, „Lösungen herunterladen“ + `STEP_LATE`. Aktuell: 1, bei
  laufender Anfrage 2, nach dem Feedback 3, beim Senden 4 (ohne KI 1/2); der letzte Schritt nie (`clearEditor` leert den Kasten,
  nicht auf `#screen-done`). Beim Öffnen kein Wegscrollen (`scrollTop = 0`, Fokus mit `preventScroll`).
- **Das KI-Feedback ist freiwillig** (Handreichung KI des HKM, Juli 2023: S. 10 allgemein „derzeit nur auf
  freiwilliger Basis“; S. 17 kein Nachteil ohne KI – dort für volljährige Schüler:innen, sinngemäß übertragen).
  „Abgeben“ ist nie wegen fehlenden Feedbacks gesperrt (nur ein ganz leeres Blatt: Meldung wie beim Feedback; leere
  Aufgaben nennt der Dialog); vorgesehen bleibt Feedback → überarbeiten → abgeben, ohne Druck: `FB_VOLUNTARY` („… ohne
  dass dir daraus ein Nachteil entsteht“) in `#fin-text` und beiden Feedback-Dialogen. Ohne Feedback fragt
  `submitDialog` „Ohne KI-Feedback abgeben?“; eingestuft wird **nach** dem Dialog (`noAiState(wasBusy)`) →
  verschlüsselt `noAi`: `"declined"` nur, wenn nie eine Anfrage lief (`S.fbFails === 0`, keine laufende Anfrage, kein
  `S.fbUnavailable`, `aiRecipients` nicht leer; vor dem Senden speichert `requestFeedback` `S.fbPending` im
  Zwischenstand, jeder Ausgang des Laufs – `unlock`, Erfolg, Abgabe – setzt es zurück; findet `openEditor` den Vermerk
  (Tab geschlossen, Absturz), zählt das einmal als Fehlversuch und wird sofort gespeichert); sonst `"unavailable"` +
  `feedbackError` (`S.fbUnavailable`, ohne Empfänger „KI nicht eingerichtet“, bei `ai_quota` `FB_QUOTA`, sonst `FB_NOT_DONE` „Anfrage nicht
  abgeschlossen“; Dialog „Das KI-Feedback hat bisher nicht geklappt (Grund) …“, bei laufender Anfrage „… wird sie
  abgebrochen. Was schon gesendet wurde, hat der KI-Dienst bereits erhalten.“); `"none"` bei Blättern ohne Auftrag an
  die KI (`aiFeedback:false`: kein `#fb-btn`, schlichtes „Jetzt abgeben?“, Hinweis ohne KI-Dienst). Ohne Empfänger
  (`aiRecipients` leer) lädt `requestFeedback` zuerst per `reloadRecipients()` neu (nur GET); bleibt die Liste leer: kein
  Dialog, kein POST, `S.fbUnavailable = FB_NO_AI` („KI nicht eingerichtet“, mit `fbUnavailableDay`), gespeichert, Status
  „Deine Lehrkraft hat das KI-Feedback noch nicht eingerichtet – du kannst ohne KI-Feedback abgeben.“; sonst der normale
  Dialog mit den echten Empfängern. Während des GET ist nur `#fb-btn` gesperrt (danach Fokus zurück, falls er auf `body`
  fiel); ist inzwischen ein anderer Dialog offen (Abgabe, Abbrechen, Rechtschreibprüfung), fragt `requestFeedback` nicht
  hinein, sondern endet still. `askConfirm` selbst beantwortet einen zweiten Aufruf bei offenem Dialog sofort mit `null`
  (keine Antwort) und lässt den offenen unverändert. Die Einstufung nach dem Dialog bleibt „nicht möglich (Grund)“, wenn der
  Dialog das gesagt hat (`said` in `submitAll`), auch wenn währenddessen Empfänger auftauchten. Liegt ein erstes Feedback vor,
  aber die Seite kennt keinen Empfänger (z. B. weitergeschrieben, nachdem die KI entfernt wurde): Abgabe-Dialog,
  `#submit-hint` und `#done-fb-status` sagen `FB2_NO_AI` („Eine KI-Rückmeldung zu deiner abgegebenen Fassung gibt es diesmal
  nicht – …“), `requestFinalFeedback` sendet nichts (auch nicht an den Server) und ruft `finalFeedbackGone`. `fbBlockedNow()` (für `#fb-fallback` und den Hinweis unter „Abgeben“): `FB_NO_AI` gilt
  nicht mehr, sobald `aiRecipients` gefüllt ist (auch nach `ai_changed` → `renderFeedbackState`); `noAiState` behält den
  Grund für die Abgabe. Als Fehlversuch
  zählt auch ein Lauf, den die Abgabe abbricht oder der nach `ai_busy` mit „zu lang“ bzw. `ai_changed` endet (Meldung
  dann „dieser Versuch wurde nicht gesendet; frühere automatische Versuche hat der bisherige KI-Dienst möglicherweise
  schon erhalten“ statt „es wurde nichts gesendet“). Ohne Feedback: kein Erstversuch, keine zweite Rückmeldung,
  `feedback:null`, `first = final`; bis zur Abgabe umkehrbar. Kommt ein Feedback, während der Dialog offen ist, wird
  nicht abgegeben (Fokus bleibt im Dialog; nach dem Schließen bei beiden Antworten auf `#revise-hint`, beim Bestätigen
  zusätzlich `#submit-status`); scheitert eine Abgabe, die eine Anfrage abgebrochen hat, gibt der `catch` Felder,
  `#fb-btn` und `#fb-status` frei. `S.submitting` (nach dem Bestätigen bis zum `finally`, dort bei einem Fehlschlag
  `renderFeedbackState`): `#fb-btn` gesperrt, `requestFeedback` und `#ed-cancel` brechen vor **und** nach ihrem Dialog ab
  (`submitBusy`, Status „Deine Abgabe wird gerade gesendet – …“ in `#fb-status` bzw. `#submit-status`); im Erfolgszweig
  schließt `closeDlg(null)` (keine Antwort – beim LanguageTool-Dialog nicht „Trifft nicht zu“) einen offenen Dialog vor
  `show("screen-done")` (E2E 7j: `/api/submit` angehalten; dort auch: Nachsehen der Empfänger hinter offenem Abgabe-Dialog,
  erstes Feedback ohne Empfänger nach Weiterschreiben).
  Lehrkraft (`noAiNote`, neutral): „Ohne KI-Feedback abgegeben.“ bzw. „… – das KI-Feedback war nicht möglich (Grund).“
  (alte Abgaben ohne `noAi` = nicht möglich), eine Spalte „Abgegebene Fassung (ohne KI-Feedback)“ (`table.cmp.one`); Liste, Legende, Zähler unverändert. Lösungs-PDF: derselbe Satz im Kopf (nicht
  bei `none`); Zwischenstand-PDF „Stand: … KI-Feedback schon erhalten / angefordert, beim Sichern noch nicht erhalten
  (`fbPending`) / bisher nicht geklappt (Grund) / nicht angefordert“, ohne KI-Hinweise bei Blättern ohne KI. E2E 3b, 4
  und 7f (G–P, u. a. Tab zu während der Anfrage, Scheitern hinter dem Dialog, abgebrochene wartende Anfrage, alte
  Abgabe ohne `noAi`; Blatt ohne Auftrag) prüfen Dialoge und Hinweise wörtlich.
- **Rate-Limits** (`rate_limits`, festes Fenster, `rlHit` atomar per Upsert … RETURNING): `door`, `auth`
  10/15 min und `auth_all` 200/h (nur Fehlversuche – richtige Codes/Passwörter gehen **immer** durch, laufende
  Sitzungen ebenso; über dem Limit bremst `requireTeacher` Fehlversuche um 2 s), `lookup_miss` 30/10 min (gültige
  Codes immer), `feedback` 240/h + `feedback_chars` 800 000/h je IP + `sheet_feedback` 600/Tag je Blatt (je Schüler:in bis zu zwei
  KI-Anfragen) (gezählt
  erst, wenn die Anfrage gültig ist und zur KI geht; bei BUSY/RATE_LIMIT/TIMEOUT/SERVER/NETWORK/DAILY_LIMIT
  Rückerstattung), `submit` 360/h + `submit_bytes` 60 MB/h (nur gültige Abgaben/Erstversuche zu existierenden
  Blättern; je Schüler:in bis zu drei Aufrufe, ein `feedback2` ohne passende Abgabe zählt nicht), `checklist` 30/h je IP (KI-Vorschlag der Checkliste, Erstattung wie beim Feedback).
  Je Blatt höchstens 400 Abgaben / 40 MB. Bucket = Art + gekürzter SHA-256 von IP|Art (mit `SETTINGS_SECRET`
  als Pfeffer), IPv6 vorher auf /64 gekürzt (`ipKey`) – nie Klartext-IPs speichern. Schulnetz = eine IP für viele.
- **Tests:** `npm test` (Unit, `node --test test/unit/*.test.mjs`); `node test/smoke.mjs` (API gegen echten
  `wrangler dev --local` + `test/mock-ai.mjs`, Ports 8811/8812, am Ende auch der Zeitplan); `npm run test:e2e` (Playwright 1.56.1, Ports
  8787/8790, frischer Zustand je Lauf – nicht parallel zu `npm run dev`). Workers AI ist lokal nie erreichbar: Unit-Tests
  nutzen ein gefälschtes `env.AI` (`fakeAI` in ai.test.mjs, `mockAIBinding(mock)` aus `test/mock-ai.mjs` mit `mode`
  ok/cf3036/cf3040/cf400/local in worker.test.mjs), der Smoke-Test prüft den lokalen CONFIG-Pfad, E2E 1 die Oberfläche
  (Speichern als erster Anbieter und als Reserve; per `page.route` vorgegeben: erfolgreicher Test mit Token-Zahlen,
  Tageskontingent-Sperre, fehlendes Binding, „Trotzdem speichern“ bei Gemini – PUT nie zum Server) und 7h `ai_quota` per
  `page.route` (Empfänger Workers AI + Groq im Hinweis, Zwischenstand von gestern ohne „morgen“). Datenschutz: E2E 1b
  (Betreiber im Hinweis, „Impressum & Datenschutz“ über die Fußzeile in neuem Tab, über `#impressum` und mit gescheitertem
  `/api/privacy`, GitHub Pages per `addInitScript` → `FEIBEITSBLATT_API`, Betreiberkasten, Löschfrist, Vorschau, alte
  Schulangaben per `d1Query` → beim Laden der Übersicht entfernt; `PRIVAT_SHOTS_OUT=<Ordner>` speichert Bildschirmfotos), 2/3/3b/4/5
  (Hinweis mit Betreiber und Löschfrist, keine Schulangaben in D1/API, `#privfull-ed` nach Weiterschreiben, KI-Kennzeichnung, `#done-del`, Lösungs-PDF mit/ohne XMP
  samt Aufbauprüfung `pdfStructure`), 7i (Kürzen mit Nachfrage, Verlängern, Cron lokal); Tippzeiten: Unit `typing.test.mjs`
  (Block TYPING per `new Function`, `TT_ENV_MAX` = `LIMITS.envelopeBytes`, Eigenschaftstests gegen `tableText`/`tableRows`,
  Rückfall ohne `Intl.Segmenter`, Schalter `TT_KEEP_IN_DRAFT` beider Stellungen, Widerspruch `ttOptOutPayload`/`ttDraftFlags`/
  `ttCleanPayload`/`ttDetail`, `ttStoredFlags`/`ttKeepOptOut`, `TT_SWITCH_EFFECT`/`TT_SWITCH_SCOPE` in beiden Stellungen von
  `TT_KEEP_IN_DRAFT`, `TT_USE` im Hinweis, Kurzfassungen mit genau dem Satz `TT_SHORT`, `TT_ACCESS` ohne behauptete Ausnahme oder
  Einwilligung und mit/ohne `TT_HELD`, eigener Abschnitt vor „Deine Rechte“; `S.fb2Base` getrennt von `S.lastSubmission`, freigegeben,
  `FB2_HOLD_MS` = `REPLACE_WINDOW_MS`), E2E 7l (eigenes Blatt; mit `delay:120` getippt, `insertText` als Wortvorschlag,
  eingecheckt (`TT_KEEP_IN_DRAFT` aus): kein `typing` im Zwischenstand, ein alter Stand mit Tippzeiten wird beim Laden bereinigt
  (`ttDraftStrip`), Text von vor dem Neuladen geht als 255 („ohne Messung“) in die Abgabe; nur mit umgelegtem Schalter Werte je
  Zeichen im Zwischenstand vor und nach dem Feedback samt Neuladen; nie an die KI, Erstversuch/Abgabe aus D1
  entschlüsselt – `openPrivateKey`/`openEnvelope` aus smoke.mjs –, Ablauf-Kasten, 413 → einmal ohne, Lehrkraft-Färbung, „Färbung
  aus“, lange Antworten, nur Weltkarten – auch bei den Schüler:innen ohne `TT_SHORT` und ohne Abschnitt; die nachgereichte zweite
  Rückmeldung = angenommene Abgabe + `feedback2` samt Tippzeiten in D1; Schüler:in 4: mit `feedback2` 413 → einmal
  ohne Tippzeit-Werte, angekommen, kein Hinweis; Schüler:in 5: Nachreichen scheitert dreimal → D1 unverändert, danach kein weiterer
  Versuch, Hinweis `#done-fb-teacher` wörtlich; dass `S.fb2Base` freigegeben wird, prüft nur `typing.test.mjs` über den Quelltext) und 7m (Widerspruch: Schalter per Tastatur, Zwischenstand und -PDF, Ersetzen des
  Erstversuchs scheitert erst und wird beim nächsten Öffnen nachgeholt, PDF auf einem anderen Gerät, Zurücknehmen, Ablehnung
  während des Sendens (angehaltenes bzw. scheiterndes `/api/submit`, Farbe), Abgabe `optOut`; Haken auf „Deine Angaben“ bei
  getipptem Stand mit Erstversuch → sofort gespeichert und ersetzt; anderes Gerät ohne Widerspruch; zweiter Tab übernimmt ihn
  sofort; an und aus während einer angehaltenen KI-Anfrage → erste Fassung ohne Werte; ältere Zwischenstand-PDF auf demselben
  Gerät → Widerspruch bleibt; Gruppe in der „ihr“-Form, Neuladen ohne Eingabe, `_tt` aller Felder; Lehrkraft „ohne Messung
  (widersprochen)“ bei Abgaben, Erstversuch und ausgeblendetem älterem Erstversuch; nach dem Nachreichen der zweiten Rückmeldung
  bleibt `{optOut:true}` in D1; zweiter Tab widerspricht, nachdem der erste abgegeben hat und die zweite Rückmeldung noch aussteht – der
  erste eingefroren (storage-Ereignis per `stopImmediatePropagation` verpasst, KI-Anfrage angehalten) bzw. mit angehaltenem Nachreichen
  unterwegs → in D1 `{optOut:true}`, nachgereicht einmal ohne bzw. erst mit, dann ohne Werte); die wörtlichen Hinweise prüfen 1b
  (`TT_PURPOSE`, `TT_EFFECT`/`TT_SCOPE`, `TT_STAY`, `TT_ACCESS`, Kurzfassung und Vorschau mit genau `TT_SHORT`, Abschnitt
  `TT_OBJ_HEAD` vor „Deine Rechte“, auf „Impressum & Datenschutz“ nur als Absatz, Vorschau gesperrt), 2 (`renderPrivacy` mit
  `TT_SHORT`, `#privfull-ed` mit Abschnitt), 2b (Kurzfassung der Gruppe mit `TT_SHORT_G`, `TT_ACCESS_G`) und `privBases` – die Erwartungen folgen `TT_KEEP` (aus index.html gelesen); beim Umlegen von
  `TT_KEEP_IN_DRAFT` 1, 1b, 2, 2b, 7l, 7m einmal in der anderen Stellung laufen lassen. Beide Tests laufen vor Test 8
  (Passwortwechsel), ebenso E2E 7n/7o (Escape-Room-Finale, eigenes Blatt, 7o löscht es; nur mit Test 1 davor lauffähig, einzeln
  `npx playwright test -g "spec\.mjs (1|7n|7o) "`; siehe Escape-Room-Anbindung). Unit: `scheduled` auf der
  gemeinsamen D1 (und einmal frisch importiert `?scheduled`), `d1.failIf` für ein scheiterndes PURGE, `Math.random`
  gestubbt beim Zählen der D1-Abfragen und in Tests mit zurückdatierten Einträgen (`noRandomCleanup`: sonst löscht das
  2-%-Aufräumen sie gelegentlich vor der Prüfung).
  Lokal: `npx wrangler dev --local --ip 127.0.0.1 --port <p> --persist-to <dir> --show-interactive-dev-session=false`.
  KI im Test: Anbieter `custom`, baseUrl `http://127.0.0.1:<port>/v1` (Mock); LanguageTool per
  `page.route("https://api.languagetool.org/**")`. In der Sandbox: echte KI-Anbieter und LanguageTool nicht
  erreichbar, Browser unter `/opt/pw-browsers` – **nie `playwright install`**. Gestartete Server immer beenden.
- **Deployment:** `.github/workflows/deploy.yml` (push auf `main` + `workflow_dispatch`): ohne Secret
  `CLOUDFLARE_API_TOKEN` nur Hinweis (CI bleibt grün). Sonst `npm ci` → `npm test` → `npm run build` →
  workers.dev-Subdomain sicherstellen → D1 `--jurisdiction eu` anlegen, falls nicht vorhanden (Ort nur beim
  Anlegen wählbar – deshalb **nie `wrangler deploy` von Hand vor dem ersten Workflow-Lauf**) → `npx wrangler
  deploy` (Schritt `id: deploy`; scheitert nur das Setzen der Zeitpläne – wrangler „Cron schedules“, Konto hat schon 5 Cron
  Trigger –, ist der Code schon hochgeladen, der Schritt meldet es als `::error`) → `SETTINGS_SECRET` einmalig erzeugen
  (`if: !cancelled() && (steps.deploy.outcome == 'success' || steps.deploy.outputs.uploaded == 'true')` – `uploaded` setzt der
  Deploy-Schritt nur beim Scheitern am Zeitplan; ebenso „Adresse ausgeben“; **nie
  überschreiben**: sonst ist der gespeicherte KI-Schlüssel unlesbar; ist die Secret-Liste nicht abrufbar, schlägt der
  Schritt fehl). Das Cloudflare-Token nur als Step-`env`
  der Schritte, die es brauchen (nie bei `npm ci`/`npm test`); Actions per Commit-SHA gepinnt. wrangler `4.145.0`
  exakt gepinnt (package.json/package-lock.json). Token: Vorlage „Edit Cloudflare Workers“ + „Konto → D1 →
  Bearbeiten“ (scheitert `wrangler deploy` am AI-Binding mit einem Rechtefehler: „Konto → Workers AI → Lesen“ – vermutet,
  nicht dokumentiert). `SETTINGS_SECRET` bleibt auch mit Workers AI nötig (Pfeffer der Rate-Limit-Buckets). Der Workflow läuft nur für `main` – existiert der Branch nicht, muss die Lehrkraft ihn anlegen
  (README Schritt 5).
- **Öffentlich:** README, diese Datei und der ganze Code sind öffentlich – keine Schlüssel, Tokens, Passwörter
  oder echten Schülerdaten (auch nicht in Tests). Der Türcode 1104 ist absichtlich öffentlich; geschützt wird
  alles durch das Passwort. Nie API-Schlüssel oder Schülertexte loggen.
