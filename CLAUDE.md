# Feibeitsblatt – Hinweise für die Entwicklung

Schreibeditor mit Aufgabencodes (Design und Tippzeit-Messung wie im Feiditor – die Färbung sieht nur die Lehrkraft; die Kurzfassung
des Datenschutzhinweises nennt die Messung in einem Satz, Widerspruch per Schalter im eigenen Abschnitt des ausführlichen Hinweises): Lehrkraft legt Aufgaben +
Aufträge an die KI an (worauf sie beim Feedback achten soll; intern `solution`; Aufgabenstellung und Material formatierbar; bis zu 3 YouTube-Videos je Aufgabe unter dem Material, geladen erst nach Klick; Antwort als Textfeld, Tabelle, Weltkarten-Zuordnung oder Foto) → Code → Einzel- oder Partner-/Gruppenarbeit → Schüler:innen schreiben (Einfügen gesperrt), LanguageTool-Prüfung, einmal KI-Feedback (freiwillig),
überarbeiten, verschlüsselt abgeben (danach finale KI-Rückmeldung zur abgegebenen Fassung – abwählbar, der Server legt sie verschlüsselt
für die Lehrkraft zur Abgabe, Download höchstens 30/60/90 s gesperrt (Einstellung der Lehrkraft), sonst steht die Checkliste in der
Lösungs-PDF) → Lehrkräfte-Übersicht (Türcode 1104 + Passwort); nach „Code generieren“
schlägt die KI eine Checkliste vor, die die Lehrkraft bestätigt; Blätter lassen sich als PDF-Datei
sichern und mit neuem Code wieder laden (z. B. für Parallelklassen) oder als analoges Arbeitsblatt mit QR-Code zu dieser
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
    `callAI`, `testKey`, Feedback-Prompts (vor der Abgabe und final), Checklisten-Prompt, `reserveSlot` – portiert aus janrickmer/check-des-feind-t-es.
  - Frontend ruft `API + "/api/…"` mit `API = window.FEIBEITSBLATT_API` (kleines Skript ganz oben): `""` = gleiche
    Herkunft auf `*.workers.dev`/localhost und überall, wo die Worker-Kopie läuft (`scripts/build.mjs` setzt in `dist/index.html`
    hinter `<meta charset>` das Kennzeichen `<meta name="feibeitsblatt-host" content="worker">` – auch für eine eigene Domain am
    Worker; davon hängt auch `PAGES_HOST` ab, GitHub als Empfänger), sonst `window.FEIBEITSBLATT_WORKER` (`https://feibeitsblatt.feindt.
    workers.dev`). Die Seite liegt zusätzlich auf GitHub Pages unter `feibeitsblatt.janrickmer.de` (`CNAME`,
    `.nojekyll`, Quelle Branch `main` Ordner `/`): dort gelten keine `_headers`, deshalb steht die CSP auch als
    `<meta http-equiv>` in `index.html` – Worker-Adresse dort (`connect-src`) und im Skript immer zusammen ändern;
    `frame-src https://www.youtube-nocookie.com` (eingebettete Videos) in `_headers` und `<meta>` gleich, `img-src` ohne YouTube
    (kein Vorschaubild; `test/unit/config.test.mjs` vergleicht beide Policies).
- **API:** JSON, `{ok:true, …}` bzw. `{ok:false, error:"deutsche Meldung", code}`; CORS `*`, keine Cookies, Auth nur
  per `Authorization: Bearer <authKey>`. Öffentlich: `GET /api/sheet/:code` (**nie `solution`**, d. h. die Aufträge an die KI),
  `POST /api/feedback`, `POST /api/submit`. Lehrkraft: `/api/teacher/door`, `/setup`, `/login`, `/password`,
  `/sheets`, `/sheets/:code`, `/sheets/:code/submissions`, `/sheets/:code/checklist`, `/ai`, `/ai/test`, `/final-wait`, `/privacy` (Pfade
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
  und `files` (PDF-Dateien, siehe unten) und immer `videos: [{id, start?, title?}]` (`videosOut`, `[]` ohne Videos; nie eine URL – siehe
  YouTube-Videos; `POST /api/teacher/sheets` nimmt je Aufgabe optional `videos` und antwortet zusätzlich mit `videoCount`). `GET /api/sheet/:code` liefert außerdem `aiFeedback` (Ja/Nein: mindestens eine
  Aufgabe mit Auftrag an die KI, `wantsFeedback` aus ai.js; nie der Auftrag; fehlt bei älteren Workern = `true`) und
  `privacy: {retentionDays} | null` (siehe Datenschutz-Angaben; im bestehenden `IN`-Batch, keine Abfrage mehr) und `finalWaitSec`
  (in `sheet`; Wartezeit auf die finale KI-Rückmeldung 30 | 60 | 90, `finalWaitOut`; ebenfalls aus dem `IN`-Batch – `key IN
  ('teacher','ai','privacy','final')`, weiter 4 Abfragen, siehe Finale KI-Rückmeldung, „Wartezeit“).
  `GET /api/sheet/:code`, `GET /api/teacher/sheets` (je Blatt) und `GET /api/teacher/sheets/:code` liefern `escape: {id, name} |
  null` (Finale eines Escape-Rooms; öffentlich nie mehr als Kennung und Name), `POST /api/teacher/sheets` nimmt optional `escape`
  (siehe Escape-Room-Anbindung).
  `POST /api/feedback` nimmt `{code, answers, recipients?, only?, final?, attempt?, receivedAt?}`. **Final-Modus** (finale
  KI-Rückmeldung nach der Abgabe): `final: true` + `attempt` (16 Hex) + `receivedAt` (aus der Antwort von `/api/submit`)
  (`validateFinalMeta` in lib.js: `final` fehlt/`null`/`false` = Feedback vor der Abgabe; ein anderer Wert, `only` dazu oder
  fehlende bzw. ungültige Kennung/Eingang → 400 `bad_request`); im ersten Batch zwei Abfragen mehr (`finalStmt`: neueste Zeile mit
  dieser `attempt`; `settingStmt(db, "teacher")`: der öffentliche Schlüssel der Lehrkraft), `checkFinal` nach `validateAnswers`, aber
  **vor** dem Zählen und vor jeder KI: keine Zeile, kein `stage`
  final oder anderer `received_at` → 409 `final_gone`, `receivedAt` ≤ jetzt − `REPLACE_WINDOW_MS` (15 min) → 409 `final_expired`,
  `final_at` schon gesetzt → 409 `final_done` (`MSG.finalGone`/`finalExpired`/`finalDone`); dann alle Aufgaben mit Auftrag
  (eigener System-Prompt, siehe KI), Antwort zusätzlich `final: true` und `stored: true|false`. **Der Server legt die Rückmeldung selbst
  ab** (Entscheidung des Betreibers vom 08.11.2026, siehe Finale KI-Rückmeldung): nach einer brauchbaren Antwort baut `storeFinal`
  den Datensatz `{kind:"feibeitsblatt-final", v:1, at: ISO-Zeitpunkt (derselbe Millisekundenwert wie final_at), ah, results}` (`results` =
  genau das Array der Antwort, `feedbackResults` → `{covered, missing, note?}` je Aufgabe; `ah` = `sha256Hex(JSON.stringify(answers))` der
  beurteilten, von `validateAnswers` bereinigten Antworten), verschlüsselt ihn per `sealForTeacher` (lib.js, siehe Krypto) und schreibt
  **eine abgewartete Anweisung** `finalStoreStmt` (nicht im `waitUntil`-Batch) auf genau die Zeile, die `checkFinal` geprüft hat (`finalStmt`
  liest `id`): `UPDATE submissions SET final_at=?, final_env=CASE WHEN received_at=? THEN ? END WHERE id=? AND stage='final' AND final_at IS
  NULL RETURNING final_env IS NOT NULL AS has_env` → `stored` = Umschlag da und `has_env`. **Abgeschlossen wird die Zeile in jedem Fall**, auch
  wenn sie während der KI-Anfrage durch eine neue Abgabe derselben Bearbeitung (zweiter Tab) ersetzt wurde – sonst ließe sie sich mit dem
  Wissen aus dieser Rückmeldung verbessert neu abgeben (Prüfbefund vom 08.11.2026); die Rückmeldung selbst liegt nur bei der Abgabe, zu der
  sie gehört (derselbe Eingang), sonst `final_env` NULL. Zwei gleichzeitige Anfragen derselben Abgabe: die erste gewinnt, die zweite bekommt
  ihre Antwort mit `stored:false`.
  Ist der Schlüssel der Lehrkraft unbrauchbar, wird die Abgabe trotzdem abgeschlossen (`final_at` gesetzt, `final_env` NULL,
  `stored:false` – sonst ließe sie sich nach dem „Das hat gefehlt“ verbessert neu abgeben); scheitert die Anweisung in D1, bleibt beides
  NULL (`stored:false`). Ein Fehler beim Verschlüsseln oder Speichern lässt die Antwort nie scheitern. Geht die Antwort danach verloren,
  bleibt es bei `final_done`. `finalDoneStmt` und der `done`-Haken von `askAI` sind entfallen. Ohne Aufgabe mit Auftrag: `results` ohne KI,
  `stored:false`, `final_at` bleibt NULL.
  `only: [n…]` (1-basierte Aufgabennummern, `validateOnly`: Ganzzahlen 1…Aufgabenzahl,
  ohne Doppelte, nicht leer, sonst 400 `bad_answers` – nie stillschweigend „alle“; fehlt/`null` = alle) bleibt nur für ältere,
  gecachte Seiten (zweite Rückmeldung zu geänderten Aufgaben): dann gehen nur diese Aufgaben (mit Auftrag) an die KI, `results`
  hat für die übrigen `null`; die jetzige Seite schickt es nie. Es antwortet
  zusätzlich `aiGenerated` (`true` + `digitalSourceType` IPTC `trainedAlgorithmicMedia`,
  wenn die KI gefragt wurde, sonst `false`); `POST /api/submit` liefert `retentionDays` (Frist jetzt, `null` = keine).
  Türcode `env.TEACHER_DOOR_CODE || "1104"`; das Frontend schickt rein numerische Eingaben (4–12 Ziffern) an
  `/door`, Blatt-Codes enthalten immer Buchstaben. `GET …/submissions?after=<id>` liefert seitenweise (≤ 50 bzw.
  ≤ 8 MB je Seite – gezählt Umschlag + `finalEnv` –, `next` = letzte id oder `null`) je Eintrag `{id, receivedAt, stage, envelope,
  finalEnv}` (`finalEnv` = die vom Server abgelegte finale KI-Rückmeldung als JSON-Text des Umschlags, sonst `null`); das Frontend
  schleift über `next`. Seit den Fotos (Umschläge bis ~1 MB) holt die Abfrage aus D1 nur die Zeilen, die die Seite braucht: von den
  nächsten 51 Zeilen (Unterabfrage mit `length(envelope)+COALESCE(length(final_env),0)`, Fensterfunktionen `ROW_NUMBER()` und `SUM(…) OVER
  (ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)` = `before`) die ersten beiden und jede mit `before ≤ pageBytes` – sonst kämen
  bis zu 51 große Zeilen in den Worker (128 MB, 10 ms CPU). Die Schleife danach zählt wie bisher genau (finalEnv als JSON-Text, nie weniger als
  D1) und findet so immer die Zeile, an der sie abbricht (Unit-Test zählt die gelieferten Zeilen). `GET /api/health` ohne
  Datenbank. KI-Fehler, bei denen Warten hilft (BUSY, RATE_LIMIT, TIMEOUT) → 429 `ai_busy` mit `retryAfter`,
  Tageskontingent von Workers AI (kontoweit) → 503 `ai_quota` ohne `retryAfter`, sonst 502 `ai_error`; ohne
  `SETTINGS_SECRET` → 503 `server_not_configured` (nur beim Speichern eines API-Schlüssels). `GET`/`PUT /api/teacher/ai`
  liefern je Eintrag `hasKey` (= nutzbar), `ready`, `saved`, `keyless`, `keyError?` und dazu `quotaUntil` (Sperre "*"
  oder `null`), `usage: {day, requests, neurons, limit}` (Workers AI heute, UTC – Form für gecachte Seiten) und `consumption:
  {main, reserve, cloudflare}` (je Eintrag `entryUsage`, `null` ohne Eintrag: `{provider, day, requests, tokens, resetAt (nächstes
  0:00 UTC), limits: "neurons"|"requests"|null}`, Workers AI dazu `neurons`/`neuronLimit`, Groq `rate: [{model, limit, left, resetAt,
  at}]` – siehe Verbrauch je KI) und `finalWaitSec` (30 | 60 | 90; GET liest `ai` und `final` in einer Abfrage `aiFinalStmt`, PUT eine
  Anweisung mehr im Batch – GET bleibt bei 4 Abfragen); `/ai/test` bei Workers AI `usage` (prompt/completion/reasoning_tokens, nie Inhalt).
  `PUT /api/teacher/final-wait` `{waitSec}` (nur angemeldet; `validateFinalWait`: nur die Zahl 30, 60 oder 90, sonst 400 `bad_request`
  „Bitte wählen Sie eine Wartezeit von 30, 60 oder 90 Sekunden.“) → speichert settings `final` = `{v:1, waitSec}` → `{ok, finalWaitSec}`.
- **Codes:** 6 Zeichen aus `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (≥ 1 Buchstabe, ≥ 1 Ziffer), Anzeige `K7Q-M4X`,
  Eingabe normalisieren (Großbuchstaben, nur `A–Z0–9`), Erzeugung mit `crypto.getRandomValues` ohne Modulo-Bias.
- **D1-Schema:** `settings(key, value)` (`teacher` = `{authHash, kdf, publicKey, encPrivateKey}`, `ai`, `privacy`, `final` = `{v:1,
  waitSec}`), `sheets`,
  `submissions(id, sheet_code, received_at, envelope, stage TEXT DEFAULT 'final', attempt TEXT, final_at INTEGER, final_env TEXT)` + Indizes
  (`sheet_code, id`, `sheet_code, attempt` und `received_at` für die Löschfrist), `sheet_images(id, sheet_code, task, pos, mode, mime,
  w, h, bytes, data TEXT = Base64, created_at)` + Index (`sheet_code, task, pos`), `rate_limits`, `ai_gate`,
  `ai_skip`, `ai_usage(day 'YYYY-MM-DD' UTC, provider = Schlüssel des Eintrags (`e.key`: erster Anbieter bzw. `provider#r`,
  Workers AI immer `cloudflare`), requests, neurons, tokens, req_limits TEXT (JSON je Modell, nur Groq), PK(day, provider))`,
  `sheet_checklists(sheet_code PK, draft, final, updated_at)`. Angelegt per
  `CREATE TABLE IF NOT EXISTS` beim ersten Request je Isolate (ein `batch`), keine Migrationen → Schemaänderungen
  nur additiv und idempotent im `SCHEMA`-Array; nachträgliche Spalten wie `stage`/`attempt`, `submissions.final_at` (Zeitpunkt der
  finalen KI-Rückmeldung zu dieser Abgabe, NULL = noch keine – danach ist die Abgabe abgeschlossen, siehe Erstversuch ↔ Abgabe),
  `submissions.final_env` (die finale KI-Rückmeldung selbst, vom Server für die Lehrkraft verschlüsselt – Umschlag `{v:1, ek, iv, ct}` als
  JSON-Text wie `envelope`; NULL = keine) und
  `sheets.escape_id`/`escape_name`
  (Escape-Room-Blatt, NULL = normales Blatt) und `ai_usage.tokens`/`req_limits` per `ensureColumns` (`LATER_COLUMNS`, 8 Spalten; die drei
  `PRAGMA table_info` (submissions, sheets, ai_usage) in einem Batch →
  fehlende `ALTER TABLE … ADD COLUMN` in einem Batch, Fehler bei Wettlauf zweier Isolates werden durch erneutes Nachsehen abgefangen).
- **Erstversuch ↔ Abgabe:** `POST /api/submit` nimmt `{code, envelope, stage?: "first"|"final"|"feedback2", attempt?: 16 Hex, receivedAt?}`
  (`validateSubmitMeta`; `first` braucht `attempt`). Der Browser erzeugt je Bearbeitung eine Kennung (`S.attempt`,
  `hexOf(8 Zufallsbytes)`, im Zwischenstand gespeichert) und schickt nach erhaltenem KI-Feedback die erste Fassung +
  Feedback als Erstversuch (`sendFirstAttempt`, payload `stage:"first"`, `answers[].final = null`, `submittedAt:null`;
  scheitert das Senden, wird es beim nächsten Öffnen nachgeholt – `S.firstSent`). Gleiche `attempt` → `UPDATE`
  derselben Zeile (`replaced`), ein Erstversuch überschreibt nie eine Abgabe (`kept:true`); ohne `attempt` wird
  eingefügt. Widerspricht jemand nach dem Senden der Tippzeit-Messung, ersetzt der Browser den Erstversuch mit derselben
  `attempt` ohne Tippzeiten (`S.ttResend`, siehe Tippzeit-Messung). `stage: "feedback2"` (mit `attempt` und `receivedAt` der Abgabe-Antwort,
  `validateSubmitMeta` → `replace`; schicken nur noch ältere, gecachte Seiten – früher reichten sie damit die finale KI-Rückmeldung nach)
  **ersetzt nie etwas, legt nie etwas an und zählt nie** (der Rumpf wird weiter geprüft, ein unbekanntes Blatt → 404): `{ok:true, kept:true}`,
  wenn zu genau dieser Abgabe (dieselbe Kennung, `stage` final, `received_at` = `receivedAt`) schon `final_env` liegt – eine ältere Seite
  wertet das als „angekommen“ –, sonst `{ok:true, gone:true}` (siehe Finale KI-Rückmeldung). Hat die Abgabe schon eine finale
  KI-Rückmeldung bekommen (`final_at` gesetzt), ist sie abgeschlossen: eine neue Abgabe
  (`stage` final) mit derselben `attempt` → 409 `final_locked` (`MSG.finalLocked`, vor dem Zählen) – sonst ließe sich nach dem „Das hat
  gefehlt“ verbessert neu abgeben und erneut fragen; ein verspäteter Erstversuch bleibt wirkungslos (`kept`). Das Ersetzen einer Zeile
  derselben Bearbeitung (`UPDATE … WHERE id=? AND final_at IS NULL`) ist atomar: kam die finale Rückmeldung dazwischen, ändert sich nichts,
  Antwort 409 `final_locked` – so liegt `final_env` nie neben einem anderen Umschlag. Die Grenze je Blatt (40 MB) zählt `envelope` + `final_env`.
  **Umschläge mit Fotos** (Antwortart Foto, siehe Antwortarten): `validateEnvelope(body.envelope, LIMITS.photoEnvelopeBytes)` (1000 KB; ein zu
  langes `ct` scheitert vor dem Base64-Muster); ist der Umschlag größer als `LIMITS.envelopeBytes` (400 KB, `big`), sieht die erste Anweisung des
  Batches nach, ob das Blatt eine Foto-Aufgabe hat (`CASE WHEN ?2 AND json_valid(tasks) THEN EXISTS(SELECT 1 FROM json_each(sheets.tasks) WHERE
  json_extract(value,'$.answer.type')='photo') ELSE 0 END` – ohne `big` parst D1 kein JSON), sonst 413 `too_large` „Die Abgabe ist zu groß.“
  (vor dem Zählen, nichts gespeichert). Dieselben vier Anweisungen wie bisher. Entscheidung (Erweiterung, nichts Bestehendes wird strenger):
  nur Blätter mit Foto-Aufgabe bekommen die größere Grenze; `bodyBytes` (1 MB), `sheetBytes` (40 MB), `submissionsPerSheet`, `submit_bytes`
  (60 MB/h) und `pageBytes` bleiben. Größter Umschlag + `final_env` (≤ 400 KB) < 2 MB je D1-Zeile; ein Request-Body mit dem größten Umschlag
  < `bodyBytes` (Unit-Tests in lib.test und photo.test).
  `/sheets` liefert `submissionCount` (nur `final`) und `firstCount`; die Abgabenliste liefert `stage`.
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
  Tippzeiten `typing` per `ttCleanDraft` nur passend, Widerspruch `ttOptOut`/`ttResend` per `ttDraftFlags` – dann `typing: null`, Fotos `photos` nur
  als geprüfte JPEG-data:-URLs per `cleanPhoto`, an `answers` ausgerichtet). Startseite: `#start-pdf` →
  `#start-pdf-file` → `importDraftPdf` (≤ `PDF_MAX_BYTES` 5 MB, Blatt laden, Aufgabenzahl prüfen, bei neuerem
  lokalen Stand nachfragen; ein Widerspruch gegen die Tippzeit-Messung im lokalen Stand bleibt – `ttKeepOptOut`) → `S.importDraft` → `openEditor` (importiert, speichert sofort lokal). Dateiname nur
  Code + Zeitstempel, nie Personendaten. Die Datei enthält Antworten lesbar – Hinweistexte dazu nicht entfernen.
  **Bestätigung nach der Abgabe** (`#screen-done`, nur nach HTTP 200 von `/api/submit`): großer grüner Haken
  (`.done-check`, SVG mit `var(--green)`), „Abgabe erfolgreich“, Zeitpunkt, `#done-del` (nur mit Frist: Löschdatum =
  `receivedAt` + `retentionDays` aus der Antwort von `/api/submit`, „oder kurz danach“), bei Partner- und Gruppenarbeit
  (`isGroup(S.lastSubmission.person)`, Wunsch der Lehrkraft) `p#done-group.donegroup` rot (`--red`) und fett „Schicke die Lösungen nach dem
  Herunterladen auch an die anderen Mitglieder deiner Gruppe!“ (du-Form, ohne Kürzel; sonst verborgen; `#done-pdf` steht direkt dahinter und hat dann
  `aria-describedby="done-group done-pdf-note"`; E2E 2b/3), dann **ganz oben über der finalen KI-Rückmeldung**
  Button `#done-pdf` (`.btn.block.dl` – Wunsch der Lehrkraft vom 08.11.2026: deutlich als Knopf erkennbar: Download-Symbol `svg.dl-ico`
  (aria-hidden), Schatten wie eine Taste, beim Drücken „eingedrückt“, mit `aria-disabled="true"` blass; Text in `span#done-pdf-label`)
  „Lade dir deine Lösungen herunter und speichere sie in deinen Unterlagen zu unserem Unterricht“ (`DONE_PDF`; bei
  Escape-Blättern `DONE_PDF_ESC` „Lade dir deine Lösungen und deinen Escape-Room-Überblick herunter …“), darunter `p#done-wait.donewait` (nur
  während des Wartens auf die finale KI-Rückmeldung, siehe dort) und klein und blass `#done-pdf-note` (`.donenote`, `aria-describedby`) „Es ist
  möglich, dass du mit diesen Aufgaben für die Klausur / Klassenarbeit relevante Inhalte erlernt hast.“, danach `#done-status` (Meldungen zum
  Download). `S.lastSubmission` (Code, Titel, Aufgabentexte, person, answers first/final, feedback, receivedAt, `finalWanted`, `checklist` …) bleibt
  nur im Arbeitsspeicher bis „Neues Feibeitsblatt öffnen“ (`resetStudent`);
  `makeSolutionsPdf` baut mehrseitig mit denselben Bausteinen (`pdfWrap`/`pdfStr`/`latin1`/`pdfUtf16`): je Aufgabe
  Aufgabenstellung, abgegebene Fassung + fett „Finale KI-Rückmeldung:“ (`sub.feedback2.results` mit `final: true`, ohne Zählung) mit fett „Das
  gelingt dir schon:“ und „Das hat gefehlt:“ (`FB2_MISS_LABEL`) und eingerückten Punkten „• …“ – **alles schwarz** (Wunsch der Lehrkraft vom
  08.11.2026; die Bestätigungsseite bleibt grün/rot); ältere Rückmeldungen ohne `final` (Lehrkraft-Ansicht) als „KI-Rückmeldung zur abgegebenen
  Fassung:“ mit „• Gelingt schon: …“/„• Tipp: …“, ebenfalls schwarz; nur ein Hinweis ohne Stichpunkte, z. B. `NO_SOLUTION_NOTE`, grau ohne
  Überschrift – **nie die erste Fassung oder das Feedback zu ihr** (Entscheidung der Lehrkraft vom 04.11.2026). Unter jeder Antwort ohne KI-Stichpunkte (fehlt
  `feedback2` – abgewählt, nicht rechtzeitig, gescheitert, nicht an die Lehrkraft übermittelt – oder Aufgabe ohne Auftrag an die KI), zu der es
  Punkte gibt, steht die **Checkliste der Lehrkraft** statt eines Hinweises wie `NO_SOLUTION_NOTE`
  (`sub.checklist = {ai, points: [[…]…]}`, siehe Analoges Arbeitsblatt + Checkliste): fett „Checkliste – prüfe selbst, ob deine Antwort das
  enthält:“ und je Punkt ein gezeichnetes leeres Kästchen (`checkLines`, `re S` – WinAnsi kennt kein ☐); unter dem Kopf grau der Grund
  (`fbNote`: „Die finale KI-Rückmeldung wurde beim Abgeben abgewählt.“ / „Eine finale KI-Rückmeldung wurde nicht an die Lehrkraft übermittelt.“
  (`fb2Missing`, nur aus der Lehrkraft-Ansicht) / „Die finale KI-Rückmeldung lag beim Herunterladen nicht vor.“) und, mit Punkten, „Statt einer
  KI-Rückmeldung steht unter deinen Antworten die Checkliste deiner Lehrkraft – prüfe damit selbst, ob deine Antwort alles Wichtige enthält.“
  (mit `feedback2` „Bei Aufgaben ohne KI-Rückmeldung steht unter deiner Antwort die Checkliste deiner Lehrkraft – …“, Blatt ohne KI
  (`noAi: "none"`) „Unter deinen Antworten steht die Checkliste deiner Lehrkraft – …“; nach einem Download ohne `feedback2` merkt
  `sub.pdfNoFinal`, dass `requestFinalFeedback` bei Erfolg in `#done-status` zum erneuten Herunterladen auffordert) (bei
  `ai: true` dazu „Die Checkliste hat deine Lehrkraft aus einem Vorschlag einer KI erstellt und geprüft.“); ohne Checkliste nur der Grund. Abgabe
  ohne erstes Feedback (Blatt mit KI): grau „Ohne KI-Feedback zum Überarbeiten abgegeben.“ bzw. „… – das KI-Feedback war nicht möglich (Grund).“
  Ausnahme: die Abschluss-PDF einer gescheiterten Escape-Abgabe (`sub.failed`, noch nichts abgegeben) zeigt wie bisher erste Fassung + grau
  „KI-Feedback zur ersten Fassung:“, ohne Checkliste und ohne Satz zur finalen Rückmeldung;
  Fußzeile „Seite n von N“; nur mit KI-Stichpunkten (`hasAi`, vorab aus `items` berechnet) die KI-Kennzeichnung: sichtbar
  `AI_PDF_NOTE` unter dem Kopf, `/Subject` + `/Keywords` im Info-Dict, XMP-Stream (`xmpPacket`, UTF-8, `/Length` in Bytes,
  letztes Objekt `6 + 2·Seiten + Fotos`, `/Metadata` im Katalog) mit `Iptc4xmpExt:DigitalSourceType` `compositeSynthetic` – eine PDF nur mit Checkliste hat
  davon nichts, nur den sichtbaren Satz zum KI-Vorschlag (siehe KI-Kennzeichnung); Dateiname `Feibeitsblatt-Loesungen-<Code>-<Datum>.pdf`, ohne
  Geburtstag. Die Quelltexte von `makeSolutionsPdf` und `escPdfPages` enthalten nie `typing` oder `.payload` (Unit-Test).
  **Foto-Aufgaben** (`sub.kinds[i] === "photo"`, `sub.answers[i].photo`): unter „Meine Lösung (abgegebene Fassung):“ das Foto selbst, eingebettet
  ohne neues Kodieren (`photoBytes` → `jpegInfo`; nur wenn `pdfPhotoOk`: SOF0/1/2, 1 oder 3 Farbkanäle, ≤ 4096 px) über `pg.addImage`/`pg.image`
  (höchstens Satzspiegel × 330 pt, 96 dpi, dünner Rahmen; je Seite die Namen in `ops.ims`) und `pdfAssemble(…, {images})`: je Foto ein Objekt
  `/Type /XObject /Subtype /Image … /ColorSpace /DeviceRGB|/DeviceGray /BitsPerComponent 8 /Filter /DCTDecode` mit der Nummer `6 + 2·Seiten + k`
  (vor dem XMP, das letztes Objekt bleibt), Seiten mit `/XObject << /Im1 n 0 R >>`; ein unlesbarer Kopf → grau „[Foto – kann in dieser Datei nicht angezeigt
  werden]“, ohne Foto „(kein Foto)“ (bzw. der Text einer älteren Seite, die ein Textfeld zeigte). Kein KI-Hinweis zur Foto-Aufgabe (wie bei der
  Weltkarte), die Checkliste der Lehrkraft aber schon (anders als bei der Weltkarte – sinnvoll z. B. für ein Plakat).
- **Finale KI-Rückmeldung zur abgegebenen Fassung (Wunsch der Lehrkraft vom 08.11.2026; ersetzt die frühere „zweite Rückmeldung“ nur zu
  geänderten Aufgaben):** `submitAll` gibt **zuerst** ab (die Abgabe hängt nie von der KI ab). **Angebot im Abgabe-Dialog** – auch **ohne erstes
  KI-Feedback**: `fb2Offer(finals, na)` (eingefroren beim Öffnen wie der Text des Dialogs) nur bei `S.sheet.aiFeedback`, mit Empfänger
  (`recipientParts().any`), nicht bei `FB_QUOTA`/`FB_NO_AI` und nicht, wenn alle Antworten zusammen zu lang sind (`fb2TooLong(finals)`, wie
  `validateAnswers`). Dann zeigt `submitDialog(withFb, finals, na, offer)` über `askConfirm({…, check: {label, checked}})` unter dem Text das
  **vorausgewählte, abwählbare** Kästchen `#dlg-check` (`label#dlg-check-row.checkrow.dlg-check`, `#dlg-check-label` = `FB2_CHECK_LABEL` „Nach der
  Abgabe eine finale KI-Rückmeldung erhalten“; erstes Element der Tab-Falle; ohne `check` verborgen, Zustand bis zum nächsten Aufruf in
  `$("dlg-check").checked`) und im Text `fb2DialogLine()` „Danach bekommst du eine finale KI-Rückmeldung: Sie nennt zu jeder Aufgabe, die die KI
  beurteilt, was dir gelungen ist und was gefehlt hat; der Server speichert sie verschlüsselt zu deiner Abgabe, dort kann sie nur deine
  Lehrkraft lesen. <`recipientSentence()`> Möchtest du das nicht, wähle die finale KI-Rückmeldung unten ab.“ (ohne Angebot mit erstem Feedback `FB2_NO_AI` „…; an die KI wird nichts gesendet.“ bzw.
  „Deine Antworten sind zusammen zu lang für eine finale KI-Rückmeldung – deshalb wird nichts noch einmal an die KI gesendet.“; ohne erstes Feedback
  und ohne Angebot die bisherigen Sätze „An die KI wird nichts gesendet.“ u. ä.). `wantFinal = offer && ok === true && $("dlg-check").checked`;
  angeboten → `payload.finalWanted = wantFinal` (verschlüsselt; die Lehrkraft sieht „abgewählt“); **jede** neue Abgabe trägt `payload.finalMode = true`
  (`fb2Of` wendet die alte Regel „unverändert → erstes Feedback gilt“ nur auf ältere Abgaben an). 409 `final_locked` (dieselbe Bearbeitung aus
  einem anderen Tab bzw. einer Zwischenstand-PDF schon abgegeben und abgeschlossen) → `FINAL_LOCKED_TEXT` ohne „versuche es gleich noch
  einmal“, nie der E-Mail-Weg (`ESC_NOT_TECHNICAL`). Kästchen und Satz nennen nie Tippzeiten
  (`expectOnlyTtShort`: Abgabe-Dialog 1, Bestätigung 0).
  **Nach der Abgabe:** `S.lastSubmission` bekommt `fb2Want`, `finalWanted`, `attempt` (`S.attempt`), `serverAt` (`receivedAt` der Antwort von
  `/api/submit`), `gateOpen`, `checklist`, `waitSec` (`finalWaitOf(S.sheet.finalWaitSec)`, siehe „Wartezeit“) und die Frist für „Rückmeldung
  erneut anfordern“ als reine Zeitpunkte: `fb2Until` = `sentAt` + `FB2_WINDOW_MS` (Wanduhr) und `fb2Mono` = `sentMono` + `FB2_WINDOW_MS`
  (`performance.now`; beide in `submitAll` direkt vor `sendSealed` genommen – auf dem Gerät nie länger als beim Server, dort ab dem Eingang).
  Die angenommene Nutzlast merkt sich die Seite nicht, `S.firstTyping` wird `null` – nach der Abgabe hält sie keine Tippzeiten mehr.
  `fb2LoadChecklist(sub)` holt **bei jeder Abgabe** sofort `GET /api/sheet/:code/checklist` (öffentlich,
  ohne Angaben, Timeout 20 s; `sub.checklist`: `undefined` = lädt, `false` = keine oder Fehler, sonst `{ai, points}` gekappt auf 30 Aufgaben ×
  `CHECK_POINTS` × `CHECK_POINT_MAX`; Versprechen in `sub.checklistP`). Nur mit `wantFinal`: `doneGate(sub)` und
  `requestFinalFeedback()`; abgewählt oder nicht angeboten → keine Anfrage, `#done-fb` bleibt verborgen, Download sofort frei. Live-Regionen werden
  erst eingeblendet, dann gefüllt (`doneWaitShow` per `liveFill` mit `#done-wait._txt`, `doneFbReveal(sub, fill)` für `#done-fb-status` mit
  `_seq` – auch `fb2StatusWithChecklist` erhöht ihn). „Rückmeldung erneut anfordern“ per Tastatur: `sub.retryFocus`, der Fokus geht beim
  Ausblenden auf `#done-pdf` und nach einem erneuten Fehlschlag zurück auf den Knopf. Ohne eingerichteten KI-Dienst (`!recipientParts().any`)
  kündigen `renderPrivacy` und `#submit-hint` keine finale Rückmeldung an.
  **Sperre mit Countdown:** `doneGate` setzt `sub.gateOpen = false` und `sub.gateUntil = Date.now() + finalWaitOf(sub.waitSec) * 1000` (30, 60
  oder 90 s – die Wartezeit der Lehrkraft, siehe unten; absoluter Zeitpunkt – auch nach dem Ruhezustand richtig; `FB2_GATE_MS` ist entfallen), `#done-pdf` `aria-disabled="true"` (bleibt fokussierbar; der Klick-Handler prüft `gateOpen` selbst und sagt in
  `#done-status` „Einen Moment noch – deine finale KI-Rückmeldung wird gerade erstellt. Danach kannst du deine Lösungen herunterladen.“),
  `aria-describedby` = `[done-group] done-wait-text done-pdf-note`; `p#done-wait` = `.spinner` + `#done-wait-count` (aria-hidden, „N s“, Zeitgeber
  `doneWaitTimer` alle 250 ms) + `#done-wait-text` (`role="status"`) `DONE_WAIT_TEXT` „Deine finale KI-Rückmeldung wird gerade erstellt – bitte
  gedulde dich kurz.“ `doneGateOpen(sub, why)`: `"done"` (Rückmeldung da) bzw. `"failed"` (`finalFeedbackGone` oder ein Fehler mit möglichem neuem
  Versuch – der Download wartet nie auf einen neuen Versuch) → frei, `#done-wait` weg; `"timeout"` bei noch laufender Anfrage → frei, ohne
  Countdown, der Spinner bleibt mit `doneWaitLate(sub)` „Das dauert länger als gedacht. Du kannst deine Lösungen jetzt herunterladen – dann steht
  in der PDF-Datei statt der KI-Rückmeldung die Checkliste deiner Lehrkraft (bei `checklist === false` „… steht in der PDF-Datei keine KI-Rückmeldung“). Wenn du noch
  wartest, kommt die Rückmeldung vielleicht noch.“ – **im Hintergrund wird weiter gewartet, bis heruntergeladen wird**: Kommt sie vorher, steht sie
  auf der Seite und in der PDF. Klick auf den Download, während sie noch lädt → `fb2Drop(sub)` (`S.fbRun++`, `S.fbAbort.abort()`, `fb2State`
  `"dropped"`, `#done-wait` und „Rückmeldung erneut anfordern“ weg, `fb2Check` – danach nichts mehr; mit dem Abbruch endet in der Regel auch
  die Anfrage beim Server, sodass bei der Lehrkraft keine Rückmeldung liegt – hatte der Server sie da schon abgelegt, bleibt sie dort), höchstens 4 s
  Warten auf `sub.checklistP`, PDF mit Checkliste; `#done-status` „Die PDF-Datei wird heruntergeladen – speichere sie in deinen Unterlagen.“
  (+ „ Statt einer finalen KI-Rückmeldung steht darin die Checkliste deiner Lehrkraft.“). Der Abbruch darf keine unbehandelte Ablehnung
  hinterlassen (`closePage` prüft `pageerror`). `resetFinalFeedback` (aus `submitAll` und `resetStudent`) räumt `#done-fb`, `#done-wait`
  (`doneWaitHide`, Zeitgeber), den Zeitgeber `fb2Check.timer` und `aria-disabled` ab. Kein `beforeunload` auf `#screen-done`.
  **Anfrage** (`requestFinalFeedback`, nur bei `sub.fb2Want`): ohne Empfänger `FB2_NO_AI` + `fb2PdfInstead`, `finalFeedbackGone`, nichts gesendet
  (auch nicht an den Server); sonst `POST /api/feedback` mit `{code, answers: alle abgegebenen Antworten, recipients, final: true, attempt:
  sub.attempt, receivedAt: sub.serverAt}` (Final-Modus, siehe API und KI; nie `only`; ohne Personendaten; Timeout 150 s, `signal`; 409
  `ai_changed` → nichts gesendet, Hinweis), Lauf-Kennung `S.fbRun`/`S.fbAbort` (`resetStudent` → `stopFeedbackRun` bricht ab), bei `ai_busy`
  automatische Wiederholung wie beim ersten Feedback (`FB_TRIES`, `FB_MAX_MS`, Zufallsanteil, `waitFinalFeedback` still – den Stand zeigt
  `#done-wait`); eine Antwort ohne `final: true` (älterer Server) oder mit anderer Zahl Ergebnisse → `bad_result`. Erfolg → `sub.feedback2 =
  {results, final: true, at}`, `fb2State` `"done"`, `doneGateOpen(sub, "done")`, `fb2TeacherShow(sub, r.stored)` (siehe unten), `#done-fb` mit `h2` „Deine finale KI-Rückmeldung“,
  `#done-fb-status` „So sieht die KI deine abgegebene Fassung:“ und `renderFinalFeedback` in `#done-fb-list`: je Aufgabe (nie Weltkarte)
  `.fbbox#done-fb-n` **ohne Zählung** (der Auftrag ist keine Liste zum Abhaken) mit denselben Listen wie im Editor (`appendFbLists(box, f,
  FB2_MISS_LABEL)`: „Das gelingt dir schon“ `.fb-sub.fb-ok` grün / „Das hat gefehlt“ `.fb-sub.fb-miss` rot – im Editor „Tipps zum Überarbeiten“),
  `markAi` `feedback-final`. Fehler → `finalFeedbackFailed`: `#done-fb` sichtbar, in `#done-fb-status` die Meldung (`ai_changed`; `ai_quota` „… –
  eine finale KI-Rückmeldung gibt es diesmal nicht.“; `not_found`; `final_expired` „Seit deiner Abgabe sind mehr als 15 Minuten vergangen – eine
  finale KI-Rückmeldung ist jetzt nicht mehr möglich.“; `final_gone`/`final_done` „Zu deiner Abgabe ist keine finale KI-Rückmeldung (mehr)
  möglich.“; `ai_busy`; `bad_result`; `too_long`/`bad_answers`/`bad_request`/`bad_json` „Deine abgegebenen Antworten konnte die KI diesmal nicht
  beurteilen.“ – nie die Schreibbereich-Texte aus `MSG` wie „kürze sie“, „lade neu“ oder „ohne KI-Feedback abgeben“; sonst `errMsg`) + „ Deine
  Abgabe ist davon nicht betroffen …“ + `fb2PdfInstead` („ In deiner PDF-Datei steht dafür die Checkliste deiner Lehrkraft.“, ohne Checkliste
  nichts); `#done-fb-retry` „Rückmeldung erneut anfordern“ (höchstens `FB2_MANUAL` 3, nur bei vorübergehenden Fehlern `FB2_TRANSIENT`/429/5xx, nie
  bei `ai_quota` oder `final_*`, nie nach 15 min (`fb2Expired`); Klick wirkungslos bei `"loading"`/`"dropped"`; ein neuer Versuch bei schon freiem
  Download leert `#done-fb-status`, blendet `#done-fb` aus und zeigt gleich `doneWaitLate`), sonst `finalFeedbackGone` (`fb2Final`,
  `doneGateOpen(sub, "failed")`). `fb2Changes` bleibt nur für ältere Abgaben (Lehrkraft, `fb2Of`); `fb2Sent`/`fb2Nums`/`fb2Which`
  und der Zähler `#done-fb-wait` gibt es nicht mehr.
  **Für die Lehrkraft legt der Server sie selbst ab** (Entscheidung des Betreibers vom 08.11.2026): verschlüsselt mit ihrem öffentlichen
  Schlüssel als `submissions.final_env` zu genau dieser Abgabe – in derselben Anfrage, nur in den ersten 15 Minuten nach dem Eingang und nur
  einmal (siehe API, Final-Modus). **Der Browser ersetzt nie mehr eine Abgabe nachträglich.** Vorher reichte er die Rückmeldung per
  `POST /api/submit` mit `stage: "feedback2"` nach und ersetzte dabei den ganzen Umschlag; der Server sieht nicht hinein – ein manipulierter
  Browser hätte so Antworten unterschieben können, die erst die finale Rückmeldung verraten hat, oder die Rückmeldung selbst fälschen.
  Entfallen sind deshalb `sendFeedback2`, `S.fb2Base` (die gehaltene, angenommene Nutzlast samt Tippzeiten), `fb2Hold`/`fb2Release`,
  `fb2FollowOptOut`/`fb2OptedOut`, `fb2Reach`, `fb2TeacherText`, `FB2_HOLD_MS` (jetzt `FB2_WINDOW_MS`), `TT_HELD` und die Rückfälle bei 413/409
  fürs Nachreichen (ohne Tippzeit-Werte, `escTrim`); `sealPayload`/`sendSealed` gelten nur noch für Erstversuch und Abgabe. Ältere, gecachte
  Seiten schicken `feedback2` weiter – der Server antwortet nur `kept`/`gone` und ändert nichts (siehe Erstversuch ↔ Abgabe).
  **Frist für „Rückmeldung erneut anfordern“:** `FB2_WINDOW_MS` = `REPLACE_WINDOW_MS` (15 min, Unit-Test vergleicht; `FB2_MIN`), auf dem Gerät
  gezählt ab dem Absenden der Abgabe (`sub.fb2Until`/`sub.fb2Mono`, siehe „Nach der Abgabe“) – nie länger als beim Server – und nachgerechnet:
  `fb2Expired` = Wanduhr ≥ `fb2Until` oder `performance.now()` ≥ `fb2Mono` (falls die Wanduhr zurückgestellt wird). Ein einzelner Zeitgeber
  käme im Hintergrund oder nach dem Ruhezustand des Geräts zu spät (er zählt die Schlafzeit nicht). Deshalb prüft `fb2Check`, **solange
  „Rückmeldung erneut anfordern“ dasteht**, alle `FB2_TICK_MS` (15 s, Zeitgeber `fb2Check.timer`, höchstens bis zur Frist; ohne sichtbaren
  Knopf läuft keiner), beim Zurückkehren (`visibilitychange` sichtbar, `pageshow`, `focus` des Fensters), wenn der Knopf Fokus oder
  Mauszeiger bekommt und wenn er erscheint oder verschwindet (`finalFeedbackFailed`, `requestFinalFeedback`, `fb2Drop`); abgelaufen →
  `fb2RetryNote`. Der Countdown der Sperre steckt bewusst nicht in `fb2Check` (eigener Zeitgeber, Unit-Tests werten `fb2Check` mit fester
  Umgebung aus).
  **Entscheidung des Betreibers:** Erreicht die Rückmeldung die Lehrkraft nicht, sagt die Bestätigungsseite das ruhig und sachlich (der
  Abgabe-Dialog hatte angekündigt, dass der Server sie für die Lehrkraft speichert): `fb2TeacherShow(sub, r.stored)` nur bei `stored !== true`
  (auch bei einem älteren Worker ohne das Feld) und derselben `S.lastSubmission` in `p#done-fb-teacher` (`role="status"`, unter
  `#done-fb-list`, per `liveFill` erst eingeblendet, dann gefüllt; `.donefb-note` in `--muted` wie `.donenote`, keine Erfolgs- oder Alarmfarbe)
  `FB2_TEACHER_FAILED` „Die finale KI-Rückmeldung ließ sich nicht an deine Lehrkraft übermitteln. Deine Abgabe ist davon nicht betroffen.“ –
  wie die Ankündigung im Abgabe-Dialog, und nie eine Aussage darüber, was die Lehrkraft jetzt hat (Abgabe bzw. Blatt womöglich gelöscht
  oder neu abgegeben). Die früheren Hinweise „… siehst nur du: An deine Lehrkraft lässt sie sich nur in den ersten 15 Minuten …“, „… ließ sich
  nicht mehr …“ und „Eine neue finale KI-Rückmeldung siehst nur du …“ gibt es nicht mehr. Vorher, ohne Dialog: Ist die Frist vorbei, während
  „Rückmeldung erneut anfordern“ dasteht, verschwindet der Knopf (`sub.fb2RetryLate`, der Server nähme nichts mehr an), und
  `p#done-fb-retry-note` (`role="status"`, per `aria-describedby` am Knopf; `fb2RetryNote` aus `fb2Check`) sagt `fb2RetryText(true)`: „Seit
  deiner Abgabe sind mehr als 15 Minuten vergangen – eine finale KI-Rückmeldung ist jetzt nicht mehr möglich.“ (sonst nichts). Die Hinweise
  nennen nie Tippzeiten; eine schon geladene PDF enthält die Rückmeldung trotzdem; die Lehrkraft-Seite sagt per `fb2Missing` „… wurde nicht
  an die Lehrkraft übermittelt.“
  **Wartezeit (Einstellung der Lehrkraft, Entscheidung des Betreibers vom 08.11.2026):** Wie lange `doneGate` den Download höchstens sperrt,
  wählt die Lehrkraft in „KI-Einstellungen“: 30 (Vorgabe), 60 oder 90 Sekunden, für alle Blätter. Server: settings `final` = `{v:1, waitSec}`,
  lib.js `FINAL_WAIT_OPTIONS` [30, 60, 90], `FINAL_WAIT_DEFAULT` 30, `validateFinalWait`, `finalWaitOut` (Objekt oder JSON-Text; fehlt oder
  ungültig → 30), Routen siehe API (`PUT /api/teacher/final-wait`, `finalWaitSec` in `GET`/`PUT /api/teacher/ai` und in `GET /api/sheet/:code`
  ohne zusätzliche D1-Abfrage). Browser: `FINAL_WAIT_OPTIONS`/`FINAL_WAIT_DEFAULT`/`finalWaitOf` vor `fetchSheet` (= lib.js; alles außer den
  Zahlen 30, 60, 90 → 30, auch Text oder ein älterer Worker ohne Feld), `fetchSheet` → `S.sheet.finalWaitSec` (aus `sheet`, Rückfall oberste
  Ebene), `submitAll` → `sub.waitSec` – eine schon geöffnete Seite behält den Wert, den sie beim Öffnen geladen hat. `#tv-ai`: `div.pbox` mit
  `fieldset.fwset` (`aria-describedby="fw-hint"`), `legend` „Wartezeit auf die finale KI-Rückmeldung“, `p#fw-hint` (Sie-Form: so lange warten
  die Schüler:innen nach der Abgabe höchstens; danach Lösungs-PDF mit der bestätigten Checkliste, im Hintergrund wird weiter gewartet; länger
  = öfter die echte Rückmeldung, besonders wenn viele gleichzeitig abgeben), `label.checkrow.fwopt` (≥ 44 px) mit Radios `name="fw"` `#fw-30`
  „30 Sekunden (Vorgabe)“/`#fw-60`/`#fw-90`, `#fw-save` „Wartezeit speichern“ (`busy`; gesperrt, während `openAi` lädt), `#fw-status`
  (`role="status"`): „Gespeichert: Nach der Abgabe warten die Schüler:innen höchstens N Sekunden auf die finale KI-Rückmeldung. Das gilt ab
  dem nächsten Öffnen eines Feibeitsblattes.“, ohne Auswahl „Bitte wählen Sie eine Wartezeit aus.“; `openAi` → `fwFill(r.finalWaitSec)`. Der
  Hinweis unter den KI-Einstellungen sagt dazu: „Der Server speichert davon nichts; nur die finale KI-Rückmeldung legt er – mit Ihrem
  Schlüssel verschlüsselt, also nur für Sie lesbar – zur jeweiligen Abgabe.“ Der Server hat kein eigenes Zeitbudget für die Wartezeit (siehe
  KI). Tests: E2E 1 (Fieldset, Vorgabe 30 s im Formular und in `GET /api/teacher/ai`), 7r (f) (60 s gespeichert → das Blatt liefert 60, der
  Countdown beginnt bei 60 s, nach 31 s noch gesperrt, nach 61 s frei; danach wieder 30 s), Unit, worker, Smoke.
  **Lehrkraft:** `loadSubs` kappt `feedback2` samt `final` aus dem Umschlag (von älteren Seiten nachgereicht; eigenes try/catch, wie
  `ttCleanPayload` und `escCleanPayload`) und entschlüsselt danach `finalEnv` der Zeile (JSON-Text, so liefert ihn der Server; auch ein Objekt)
  mit demselben `Crypto.open(T.priv, …)` in eigenem try/catch – nur `kind: "feibeitsblatt-final"`, `v: 1` und `results` als Array, gekappt wie
  `feedback2` (≤ 30, `normFb`, `at` ≤ 40) → `p.feedback2 = {at, final: true, results}`, **nur wenn `ah` gleich `finalAnswersDigest` der
  abgegebenen Antworten ist** (SHA-256 über JSON der `answers[].final`, bereinigt wie `cleanText` – `FINAL_CTRL_RE`), sonst `p.finalMismatch`
  und in den Details `.dfinal` `FINAL_MISMATCH_NOTE` „Eine gespeicherte finale KI-Rückmeldung bezieht sich nicht auf die abgegebenen
  Antworten und wird deshalb nicht angezeigt.“ (ein manipulierter Browser könnte sonst zu anderen Antworten eine Rückmeldung ablegen lassen;
  die Lösungs-PDF aus der Übersicht sagt dann „Eine gespeicherte finale KI-Rückmeldung bezieht sich nicht auf die abgegebenen Antworten.“
  statt „nicht übermittelt“). Ein `feedback2` **im Umschlag** gilt nur noch bei Abgaben, die vor `FINAL_SERVER_SINCE` (09.11.2026 0:00 UTC,
  Ausrollen der serverseitigen Ablage; `received_at` setzt der Server) angekommen sind – später kann es nur ein manipulierter Browser
  hineingelegt haben; ebenso gilt für spätere Abgaben immer `finalMode` (nie die alte Regel „unverändert → erstes Feedback gilt“); die vom Server abgelegte gilt vor einer im Umschlag, ein
  Fehler kostet nur sie, nie den Eintrag. Es liest `finalWanted` nur als Boolean (sonst `undefined` = ältere Abgabe bzw. nicht angeboten)
  und `finalMode` (gesetzt oder `finalWanted` vorhanden), `fb2Of(p)`: mit `feedback2.final` diese Ergebnisse (alle Aufgaben, auch ohne
  erstes Feedback); neue Abgaben (`finalMode`) ohne sie → `null`; ältere Abgaben wie damals im Browser
  (`fb2Changes`: keine Änderung → `same`, die erste Rückmeldung gilt; sonst nur mit nachgereichtem `feedback2`), sonst `null`. `buildDetail` zeigt bei
  Abgaben (nicht Erstversuchen, nicht ausgeblendeten älteren) `p.moodle-hint.dfinal` „Die finale KI-Rückmeldung wurde beim Abgeben abgewählt.“
  bzw. – gewählt, aber keine gespeichert – „Die finale KI-Rückmeldung wurde nicht an die Lehrkraft übermittelt.“, je Aufgabe `.dfb.dfb2` „Finale
  KI-Rückmeldung“ mit „Gelingt schon:“ / „Hat gefehlt:“ (ältere: „KI-Rückmeldung zur abgegebenen Fassung“, nur geänderte Aufgaben, „Tipps zum
  Weiterlernen:“; `markAi` `feedback-final`) und für Abgaben `.dpdf` „Lösungs-PDF herunterladen“ → immer erst `teacherChecklistLoad()`
  (gespeicherte Checkliste des Blattes per Lehrkraft-Route, wie bei den Schüler:innen; abgemeldet bzw. anderes Blatt gewählt → nichts) →
  `makeSolutionsPdf(teacherSolutionsSub(s, checklist))` (dieselbe Datei wie bei den Schüler:innen über `pdfPager`/`pdfAssemble`, samt XMP-/KI-Kennzeichnung;
  `fb2Missing` = keine Rückmeldung und `finalWanted === true` bzw. bei älteren Abgaben (ohne `finalMode`) mit erstem Feedback; ältere Abgaben ohne
  `noAi` und ohne Feedback → `noAi: "unavailable"` wie `noAiNote`; abgewählt sagt die PDF
  selbst; bei Escape-Blättern nur die
  Lösungsseiten – `teacherSolutionsSub` setzt kein `escape`, den Überblick gibt es über „Überblick als PDF herunterladen“ –, nie
  Tippzeiten, nie ein voller Name), daneben in den Details weiter `p.dtt`/`p.dtt-sum` und `escDetailDom`, Dateiname `teacherSolutionsName`
  `Feibeitsblatt-Loesungen-<Code>-<Klasse>-<Kürzel bzw. Gruppe-…>-<Abgabedatum>.pdf` (ASCII, nie Geburtstag). `.dmeta` sagt „ohne
  KI-Feedback zum Überarbeiten“ (Blatt ohne Auftrag an die KI: „ohne KI-Feedback“). Datenschutzhinweis und beide Feedback-Dialoge nennen die
  finale Rückmeldung (auch ohne vorheriges KI-Feedback, beim Abgeben abwählbar) und dass der Server sie verschlüsselt zur Abgabe speichert, nur
  für die Lehrkraft lesbar (`FB2_SEND`/`PRIV_IHR.fb2Send`, Cloudflare-Punkt, `renderPrivacy`, `fb2DialogLine`); `#submit-hint` kündigt sie nur
  an (beim Abgeben abwählbar). Je Schüler:in also bis zu zwei KI-Anfragen (KI-Feedback +
  finale; ohne erstes Feedback eine) → Rate-Limits verdoppelt (der Vorschlag der Checkliste, einer je neuem Blatt, zählt unter `checklist`); bis zu zwei Aufrufe von
  `/api/submit` (Erstversuch, Abgabe; ohne erstes Feedback einer – ein `feedback2` älterer Seiten zählt nicht) → `submit` 360/h.
  **Tests:** E2E 7r (eigenes Blatt, wird gelöscht; `FINAL_SHOTS_OUT=<Ordner>` speichert Bildschirmfotos): Checkliste beim Anlegen (Vorschlag
  nach „Code generieren“, prüfen, bestätigen), Abgabe ohne erstes Feedback mit vorausgewähltem Kästchen → Anfrage mit `final: true`,
  Countdown neben dem Spinner, Download gesperrt bis zur Rückmeldung, Boxen grün/rot, PDF schwarz mit „Das hat gefehlt:“; abgewählt → keine
  Anfrage, PDF mit Checkliste und „abgewählt“; KI länger als die Wartezeit (Vorgabe 30 s) angehalten → Download frei, PDF mit Checkliste,
  Anfrage abgebrochen; kommt die Rückmeldung nach 30 s, aber vor dem Download → sie steht in der PDF; Lehrkraft-Ansicht („Finale
  KI-Rückmeldung“ aus `finalEnv`, „abgewählt“, „nicht übermittelt“, Lösungs-PDF mit Checkliste). E2E 7b (eigenes Blatt, wird gelöscht): nach dem
  ersten Feedback nur eine Aufgabe überarbeitet → die finale Anfrage trägt `final: true`, `attempt` und `receivedAt`, nie `only`, und alle
  Aufgaben mit Auftrag; Antwort `stored: true`, `final_env` in D1 entschlüsselt, kein `feedback2` von der Seite; ein gefälschtes `feedback2`
  per Request → `kept`, D1 unverändert. E2E 7p (eigenes Blatt, wird gelöscht; Hinweis wörtlich, neutrale Farbe): P1 `stored:true` → kein
  Hinweis, `final_env` neben der unveränderten Abgabe; P1b `stored:false` per `page.route` → Hinweis `FB2_TEACHER_FAILED`, PDF mit der
  Rückmeldung; P1c zwei gleichzeitige echte finale Anfragen derselben Abgabe → nur die erste abgelegt, die zweite `stored:false` mit Hinweis;
  P2 Uhr der Seite per `page.clock` während der angehaltenen KI-Anfrage +16 min → Download frei, die Rückmeldung kommt und wird gespeichert
  (es zählt die Uhr des Servers), kein Hinweis; P3/P4 erste Anfrage 502 → Knopf ohne Hinweis, dann Ruhezustand (`pauseAt` +
  `setSystemTime` +16 min, kein Zeitgeber läuft ab): `visibilitychange` bzw. die regelmäßige Prüfung (`runFor(16 s)`) → Knopf weg, Hinweis,
  `final_env` bleibt NULL. Unit (`typing.test.mjs`): nach der Abgabe nichts
  gehalten und nichts nachgereicht (weder `fb2Base` noch `sendFeedback2`, `TT_HELD` oder `stage: "feedback2"` im Quelltext, `S.lastSubmission`
  ohne Nutzlast und Tippzeiten, nach dem Senden wird `payload` nur gelesen, kein `fb2` im `storage`-Listener), `FB2_TEACHER_FAILED` und
  `fb2RetryText` wörtlich und ohne Tippzeit-Wörter, `fb2TeacherShow` nur bei `stored !== true` und derselben Abgabe, `fb2Check` mit getrennt
  gesteuerter Wand- und `performance.now`-Uhr nur bei sichtbarem Knopf, `finalWaitOf`/`doneGate`/`#fw-*`, `finalEnv` in `loadSubs`;
  worker/lib/Smoke: Final-Modus (`final_*`, `final_locked`, `final_env` entschlüsselt = `results` der Antwort samt `kind`/`v`/`at`, Umschlag
  der Abgabe unverändert, nur verschlüsselt, `stored:false` bei unbrauchbarem Schlüssel und scheiterndem D1, zwei gleichzeitige Anfragen →
  nur eine legt ab), `feedback2` → `kept`/`gone` ohne Ersetzen und Zählung (auch mit unterschobenen Antworten und bei Escape-Blättern),
  `final-wait` samt `finalWaitSec`, D1-Abfragen (siehe KI); ai unverändert.
- **Krypto (im Browser – Ausnahme unten; Server sieht nie Passwort oder Klartext-Abgaben):** PBKDF2-HMAC-SHA256, 600 000
  Iterationen, Salt 16 Byte → `master`; HKDF-SHA256 mit `info` `feibeitsblatt/enc/v1` (AES-GCM-256-Schlüssel) und
  `feibeitsblatt/auth/v1` (`authKey`; Server speichert nur SHA-256 hex, Vergleich in konstanter Zeit).
  Schlüsselpaar RSA-OAEP 3072/SHA-256; privater Schlüssel (PKCS8) AES-GCM-verschlüsselt unter `encKey`.
  Abgabe-Umschlag `{v:1, ek, iv, ct}` (AES-GCM-256 mit Zufallsschlüssel, `ek` = RSA-OAEP); die Personendaten stehen
  nur im verschlüsselten payload – ebenso die Fotos (Antwortart Foto, `answers[i].photo`; derselbe Umschlag, kein eigenes Format). KDF-Parameter und `info`-Strings nie ändern ohne Versionswechsel – sonst sind
  Zugang und alle Abgaben verloren. `authKey`/privater Schlüssel nur im Arbeitsspeicher. **Ausnahme – der Server verschlüsselt die finale
  KI-Rückmeldung selbst** (seit dem 08.11.2026, siehe Finale KI-Rückmeldung): `sealForTeacher(publicKeyB64, payload)` in lib.js genau wie
  `Crypto.seal` – zufälliger AES-GCM-256-Schlüssel, 12 Byte IV, AES-GCM über das UTF-8-JSON, der Schlüssel per RSA-OAEP/SHA-256 unter
  `teacher.publicKey` (SPKI, Standard-Base64, `importPublicKey`) eingepackt, Umschlag `{v:1, ek, iv, ct}` per `validateEnvelope` (nur bekannte
  Felder, ≤ `LIMITS.envelopeBytes`); nur mit dem öffentlichen Schlüssel, nie Entschlüsseln – danach kann auch der Server sie nicht mehr lesen;
  der Browser der Lehrkraft öffnet sie mit `Crypto.open` wie eine Abgabe. Nach „Passwort vergessen“ (neues Schlüsselpaar) sind auch diese
  Umschläge unlesbar. **Bewusst:** Für KI-Feedback und finale
  KI-Rückmeldung sieht der Server die Antworten kurz im Klartext (nie gespeichert, nie geloggt) und die Rückmeldung der KI, bevor er sie
  verschlüsselt; im Final-Modus kommen `attempt` und
  `receivedAt` mit, die genau eine gespeicherte (verschlüsselte) Abgabe bezeichnen – der Server kann diese Klartext-Antworten also der Zeile
  zuordnen, nicht aber einer Person (die Personendaten stehen nur im Umschlag). Die Kennung nie loggen; die Antworten nie speichern (in
  `final_env` stehen nur die Ergebnisse der KI, verschlüsselt).
- **Free-Plan:** 10 ms CPU je Request → **kein PBKDF2 und keine RSA-Erzeugung im Worker**, dort nur SHA-256, AES-GCM und – für die
  finale KI-Rückmeldung – RSA-OAEP-Verschlüsseln mit dem öffentlichen Schlüssel der Lehrkraft (günstig; Warten auf fetch/D1 zählt nicht;
  workerd begrenzt PBKDF2 ohnehin). ≤ 50 D1-Abfragen und ≤ 50
  Subrequests je Aufruf → `db.batch()`. D1: 5 Mio. gelesene / 100 000 geschriebene Zeilen pro Tag (seit 1.9.2026
  hart) → Indizes, `COUNT` über Index. Lange KI-Anfragen sind ok (keine Wall-Time-Grenze bei verbundenem Client). Abgaben mit Fotos
  (Umschlag bis 1000 KB) belasten Speicher und Datenbank stärker: die Lehrkraft-Liste holt deshalb nur die Zeilen einer Seite aus D1 (siehe
  API), und die 500 MB je Datenbank (Free) teilen sich Abgaben mit den 200 MB für Bilder und Dateien – die Löschfrist hält das im Rahmen.
- **KI:** Nie Personendaten an die KI – `/api/feedback` bekommt nur `{code, answers}`, dazu `recipients` (ids der Empfänger) und im
  Final-Modus `final`, `attempt`, `receivedAt` (siehe API, Krypto); nichts davon geht an die KI. Der Worker baut die Nachrichten
  **selbst** aus D1 (Aufgaben, reiner Text des Materials, Aufträge an die KI – nie Videos, Bilder oder Dateien) und den Antworten (`buildFeedbackMessages`; nie `messages` vom
  Browser annehmen, sonst offenes KI-Relay); Daten zwischen `<<<`/`>>>` über `safeData`. Nur Aufgaben mit
  Auftrag an die KI (bei `only` – nur ältere Seiten – nur diese: gleiches Format, nur weniger Aufgaben; im Final-Modus immer alle), eine
  Anfrage je Blatt. **Finale KI-Rückmeldung** (`buildFeedbackMessages(tasks, answers, only, {final: true})`): nur ein anderer System-Prompt
  `FEEDBACK_FINAL_SYSTEM` (enthält wörtlich `FEEDBACK_FINAL_MARK` „finale Rückmeldung nach der Abgabe“ – daran erkennt der Mock sie –, **nie das
  Wort „Checkliste“**, daran erkennt er den Checklisten-Prompt), die Nutzer-Nachricht ist byte-gleich mit der des Feedbacks vor der Abgabe (die
  Reihenfolge-Regel gilt weiter; das gecachte Präfix unterscheidet sich zwischen beiden Arten, die erste finale Anfrage eines Blattes ist ein
  Cache-Fehlschlag). **Reihenfolge im Prompt nicht ändern:** erst der je Blatt gleiche Teil
  („Aufgaben, Material und Aufträge der Lehrkraft (Nummern: …):“, je `### Aufgabe n` mit Aufgabenstellung, Material,
  „Auftrag der Lehrkraft für das Feedback:“), dann alle Antworten (`### Antwort zu Aufgabe n`) –
  so greift das Präfix-Caching (Groq: gecachte Token zählen nicht gegen die Limits); `parseFeedbackPrompt` im Mock
  liest genau dieses Format. **Reserve-KI:** `settings.ai.reserve` = zweiter Eintrag gleicher Form (eigener
  `apiKeyEnc`, `fallbacks`); `PUT /api/teacher/ai` mit `reserve:{…}` bzw. `reserve:null` (ohne `provider` bleibt der
  erste Anbieter unberührt), `POST …/ai/test?which=reserve`; `routeFeedback` versucht erst den ersten Anbieter (mit
  Reserve: `deadlineMs` 45 s), dann die Reserve (eigenes `ai_gate`/`ai_skip` je Anbieter), Gesamtbudget 100 s – im Final-Modus genauso (kein
  eigenes Budget für die Wartezeit der Bestätigungsseite, 30/60/90 s: der Browser wartet im Hintergrund weiter);
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
  eines Batches einzeln, Schema schon angelegt): Erfolg im ersten Versuch ≤ 18 (final ≤ 21; gemessen über Workers AI ohne Aufräumen 8 bzw. 11 –
  final drei mehr: die eigene Abgabe, der Schlüssel der Lehrkraft und `finalStoreStmt`); je Versuch ≤ 3, dazu Aufräumen (5 Anweisungen),
  Blatt/Einstellungen 2 (final 4: dazu die eigene Abgabe und der Schlüssel der Lehrkraft), Sperren 1 je Eintrag, Zählung 3, Verbrauch (ein
  Upsert je Eintrag), Erstattung 3 (nach einer brauchbaren finalen Antwort stattdessen die eine Anweisung `finalStoreStmt`) → höchstens 34 ohne,
  45 mit Reserve (final 36 bzw. 47); gemessen im ungünstigsten Fall mit Reserve 33 bzw. final 35 (Unit-Tests: Erfolg über Workers AI ≤ 18 bzw.
  final ≤ 21, volle Warteschlangen mit Reserve ≤ 42, final genau zwei mehr; jeder Aufruf ≤ 50, der höchste in den Unit-Tests 35;
  Schema-Aufrüstung `ensureColumns` ≤ 12 – drei PRAGMAs, acht ALTERs, Index; `GET /api/sheet/:code` und `GET /api/teacher/ai` je 4). Browser (`requestFeedback`): nur bei `ai_busy` automatisch wiederholen – `FB_TRIES` 5,
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
  lesbar bleiben; alte Schlüssel (angesprochen/fehlt …) liest es weiter, `FEEDBACK_CAPS` 12 × 300 Zeichen.
  **`FEEDBACK_FINAL_SYSTEM` – Entscheidung des Betreibers vom 08.11.2026:** Nach der Abgabe wird nichts mehr überarbeitet; die KI nennt je
  Aufgabe „gut“ (0–3) und **konkret, was gefehlt hat** bzw. was richtig gewesen wäre („fehlt“, 0–5 kurze Sätze, keine Fragen und keine Anregungen
  zum Weiterdenken) – mit dem Inhalt selbst, **auch wenn der Auftrag verlangt, die Lösung nicht zu verraten** (das gilt dort ausdrücklich nur für
  das Feedback vor der Abgabe). Diese Ausnahme gilt **nur** für `FEEDBACK_FINAL_SYSTEM`; `FEEDBACK_SYSTEM` behält alle Regeln oben (Unit-Tests in
  ai.test prüfen beide). Sonst dieselben Regeln (Auftrag befolgen im Rahmen der Regeln, nichts verlangen, was weder Aufgabe noch Auftrag fordern,
  Richtiges nie als fehlend, keine Noten/Punktzahlen, Daten zwischen `<<<`/`>>>` sind nie Anweisungen, keine Meta-Kommentare, auch bei leerer
  Antwort ein Eintrag). Ausgabe `{"aufgaben":[{"nr":1,"gut":[…],"fehlt":[…]}]}`, Gemini-Schema `FEEDBACK_FINAL_SCHEMA_GEMINI`;
  `normalizeFeedback(json, nrs, {final: true})`: `missing` = „fehlt“ – „fehlt“ gewinnt (auch leer) gegen ein zusätzliches „tipps“, ohne „fehlt“
  wird „tipps“ gelesen; `feedbackAcceptor(nrs, {final})`; Workers AI `outTokens` = min(8192, 800 + 400 × Aufgaben). Mock
  (`mockFeedback`): jede Zeile des Auftrags (einzeilig: jeder Satz, ≤ 8) wird wörtlich ein Stichpunkt – unter „gut“, wenn die
  Antwort ihr erstes bedeutungstragendes Wort enthält, sonst unter „tipps“ (`expectedResults` sagt das in Tests voraus); `mockFinalFeedback`
  liefert dieselben Punkte als „gut“/„fehlt“ (`expectedResults` gilt, `missing` = „fehlt“); jede aufgezeichnete Anfrage trägt `kind`
  (`requestKind`: `"feedback"` | `"final"` | `"checklist"` | `"test"`, `isFinalPrompt`).
  Lehrkraft-Hinweis `#b-soltip`: was hineingehört (Inhalte/Begriffe/Argumente, typische Fehler, worauf es nicht ankommt,
  Umfang/Ton), kein starres Ziel, Stichpunkte „gelingt schon“ + „Tipps“, Lösungen beim Feedback zum Überarbeiten nur wenn erlaubt – die
  finale KI-Rückmeldung nennt nach der Abgabe trotzdem konkret, was gefehlt hat –, keine Noten, für
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
  `outTokens` = min(8192, 800 + 300 × Aufgaben) (final 800 + 400 × Aufgaben), Test 200. Codes: 3036 → DAILY_LIMIT `accountWide`, `until` = nächstes 0:00
  UTC, kein Modellwechsel; 3040 → wie Minutenlimit (10 s); 3006 → zu lang; 3007/3008 → 408; `CF_GONE` (5007, 3042, 5035,
  5016, 5018, 3041) → Modell 24 h; 3023/401 → FORBIDDEN; **jede andere 4xx**: dasselbe Modell erst ohne JSON-Modus (der
  Denkmodus bleibt aus – mit ihm kostet die Antwort ein Vielfaches), dann ohne kwargs (nennt die Meldung
  `chat_template_kwargs`/`enable_thinking`/`thinking`, zuerst die kwargs), dann nächstes Modell, gesperrt nur `TTL.soft`
  (5 min – eine einzelne seltsame Anfrage ändert die Modellfolge nicht für einen Tag) – `minRetryMs` bleibt, also am Ende
  eher `ai_busy` als `ai_error`. `parseWorkersAI` (choices, `{response}` als Text/Objekt, packt `{result}` aus),
  `cfUsage`/`cfNeurons`: `callAI` liefert `cost {requests, neurons, tokens, limits}` (auch an Fehlern; siehe Verbrauch je KI) → ein
  Upsert je Eintrag in `ai_usage` im `waitUntil`-Batch (keine zusätzliche Abfrage je Versuch), Aufräumen > 2 Tage. Kontoweite Sperre = `ai_skip` mit model `"*"`
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
  `#ai-usage`/`#ai2-usage` (`renderUsage`, siehe Verbrauch je KI; bei Workers AI „Tageskontingent aufgebraucht bis …“, `.over` rot),
  Test zeigt `testUsageText`;
  Zahlen per `groupInt` bzw. `thousands` (ai.js) als „10.000“ wie `toLocaleString("de-DE")`; Konflikt-Hinweise („Reserve ist
  schon Workers AI“ u. ä.) räumt `clearStaleClash` nach Speichern/Entfernen weg. `#t-aiwarn`: gespeicherter, aber nicht
  nutzbarer Anbieter → nur `keyError` + `AI_WARN_UNTIL` („Bis dahin … nur ohne KI-Feedback“), die Aufforderung „wählen Sie …
  Speichern“ nur bei `saved:false`. Browser: `ai_quota` → sofort `S.fbUnavailable = FB_QUOTA` („KI-Kontingent für heute
  aufgebraucht“, `laterFor` → „morgen“) mit `S.fbUnavailableDay` (UTC-Tag, im Zwischenstand/PDF als `fbUnavailableDay`);
  `quotaExpired()` (openEditor – dann sofort gespeichert –, `renderFeedbackState`, `noAiState`) löscht den Grund an einem
  späteren UTC-Tag, `fbFails` bleibt; keine automatische Wiederholung.
- **Verbrauch je KI (Lehrkraft, Wunsch vom 06.11.2026):** Je KI-Eintrag (erste KI, Reserve getrennt) zählt der Worker heute (UTC)
  über Feibeitsblatt beantwortete Anfragen (`r.ok`, auch Checkliste und Verbindungstest) und Token (`tokensOf`: OpenAI-kompatibel
  `usage.total_tokens` bzw. prompt + completion, Workers AI ebenso, Gemini `usageMetadata.totalTokenCount`; 0 = nicht gemeldet) in
  `cost` → `usageStmt(db, e.key, cost, now)` (bei jedem Anbieter, sobald `spent`: Anfrage oder gemeldete Grenze). **Grenzen nur, wo
  der Anbieter sie meldet:** Workers AI = geschätzte Neurons gegen `CF_DAILY_NEURONS` (Konto, zurückgesetzt 0:00 UTC – Cloudflare-
  Preisseite); **Groq** (`rateHeaders: "groq"`) = `dailyRequestInfo` aus `x-ratelimit-limit-requests`/`-remaining-requests`/
  `-reset-requests` (laut console.groq.com/docs/rate-limits immer Anfragen pro Tag; Reset als Dauer „2m59.56s“ → `parseDurationMs` →
  Zeitpunkt), auch aus 429-Antworten, je Modell in `cost.limits` → `req_limits` per `json_patch` (der zuletzt geschriebene Stand je
  Modell gewinnt – mit seinem `at`), `rateView` liefert höchstens sechs, die zuletzt gemeldeten zuerst; `routeAiPut` setzt
  `req_limits` der gespeicherten Einträge (`clear`) auf NULL (neuer Schlüssel = womöglich anderes Konto), die Zählung bleibt. Die
  `*-tokens`-Header gelten pro Minute (nicht genutzt), eine Token-Tagesgrenze meldet Groq nicht. Nach Groqs Doku-Beispiel (14 400 RPD,
  30 verbraucht, Reset „2m59.56s“) füllt sich das Kontingent laufend wieder auf → Text „spätestens am … wieder vollständig verfügbar“,
  nie „zurückgesetzt“. Alle anderen (OpenRouter, Gemini, Cerebras – Rate-Limit-Header am 06.11.2026 nicht belegt –, custom):
  `limits: null`, Text „Grenze hier nicht abfragbar: Feibeitsblatt liest von … weder …“. Abgelehnte Anfragen (nicht `r.ok`) zählen
  nicht. `routeAiTest` schreibt den Verbrauch in einem eigenen Batch mit `.catch` (ein Fehler beim Zählen macht den Test nicht
  zunichte). Browser:
  `usageFor(p, which)` (nur der gespeicherte Anbieter dieser Rolle; Workers AI auch ungespeichert über `consumption.cloudflare`, ein
  älterer Worker über `usage`), `usageParts` → `span.use-own` „Heute über Feibeitsblatt verbraucht: 23.456 Token in 8 Anfragen.“ (bzw.
  „noch keine Anfrage“, „(ohne Token-Angabe)“) und `span.use-lim`: Workers AI „Das sind geschätzt … von 10.000 Neurons des
  kostenlosen Tageskontingents. Es gilt für das ganze Cloudflare-Konto (…) und wird am TT.MM. um HH:MM Uhr (0:00 Uhr UTC)
  zurückgesetzt; dann beginnt auch diese Zählung neu.“; sonst „Diese Zählung beginnt am … (0:00 Uhr UTC) neu.“ + Groq „Grenze für
  Anfragen pro Tag laut Groq (gilt für Ihr ganzes Groq-Konto; je Modell, Stand der jeweils letzten Antwort): „Modell“ noch x von y
  (Stand HH:MM Uhr), spätestens am … wieder vollständig verfügbar“ (vorbei: „seit dem … wieder vollständig verfügbar (y; seither keine
  Antwort über Feibeitsblatt)“; ohne Angabe „… – heute kam noch keine solche Angabe.“) + „Eine Grenze für Token pro Tag meldet Groq in
  seinen Antworten nicht – …“ bzw. **„Grenze hier nicht abfragbar: Feibeitsblatt liest von … weder das Kontingent noch, wann es
  zurückgesetzt wird – beides steht in Ihrem Konto beim Anbieter[ des Dienstes].“** Zeiten per `fmtUntil`/`fmtClock` in Ortszeit;
  nach einem Test `refreshAiState`.
  Nie Inhalte speichern, nur Zahlen. Tests: ai (`tokensOf`, `parseDurationMs`, `dailyRequestInfo`, `callAI` mit Groq-Headern auch bei
  429), worker (je Eintrag getrennt, echte Groq-Antwort per fetch-Attrappe mit Headern, `json_patch`, höchstens sechs, Speichern leert
  die Grenze nur der gespeicherten Rolle, anderer Tag), Smoke (echte D1: Upsert samt `json_patch` übersetzt, Zweig nur mit custom),
  E2E 1 (Workers AI frisch/aufgebraucht, Groq per `page.route`, eigener Dienst nach dem Test).
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
  kostenloses Angebot.“, nennt den KI-Dienst – „… wenn du das KI-Feedback anforderst, und nach der Abgabe für die finale KI-Rückmeldung – außer
  du wählst sie beim Abgeben ab.“; mit `typing` (`ttMeasured`) am Ende **genau der eine Satz `TT_SHORT`**, siehe unten; die finale
  KI-Rückmeldung nennen außerdem `FB2_SEND`/`PRIV_IHR.fb2Send` beim ersten KI-Dienst, `renderPrivacy`, „Wozu“, „Welche Daten“ (ob abgewählt),
  „Musst du“ (abwählbar) und „Entscheidet die KI“ – nie mit Tippzeit-Wörtern; `FB2_SEND`, `renderPrivacy` und der Cloudflare-Punkt sagen, dass
  der Server sie verschlüsselt zur Abgabe speichert und nur die Lehrkraft sie lesen kann – nie „er speichert davon nichts“ für die finale
  KI-Rückmeldung), `privacyNoticeDom(p, list, {h, withAi, pages, open, id, group, noBday, site,
  general, flat, summary, typing, ttSwitch, escape, videos})` = `details.privfull` „Alle Informationen zum Datenschutz“ mit bis zu 10 Abschnitten (`.privh`: Wer ist
  verantwortlich? – Betreiber mit Anschrift und E-Mail, „privates, nicht kommerzielles und kostenloses Angebot – kein Angebot
  einer Schule“, die Lehrkraft liest; Wozu (mit `TT_PURPOSE`: Tippzeiten machen den Schreibprozess sichtbar, die Lehrkraft sieht
  die Färbung **und den Anteil roter Zeichen in Prozent (je Aufgabe und für die ganze Abgabe)**, Ursachen für Rot samt
  „übernommener Korrekturvorschlag des Browsers“, Zweck `TT_USE`, kein Beweis, keine automatische Entscheidung, beim Schreiben
  nicht angezeigt); Rechtsgrundlage als Liste: Bearbeiten/Abgeben/Zwischenstand/Erstversuch/Gruppe
  **und das KI-Feedback, wenn du es anforderst, sowie die finale KI-Rückmeldung nach der Abgabe** Art. 6 Abs. 1 Buchst. b DSGVO („… forderst
  das KI-Feedback selbst an; die finale KI-Rückmeldung kannst du beim Abgeben abwählen.“; `ttOut`: „(bei Erstversuch und Abgabe außer den Tippzeiten darin, siehe
  nächster Punkt)“, ohne KI „(bei der Abgabe …)“, mit `TT_KEEP_IN_DRAFT` „(außer den Tippzeiten darin, …)“; bewusst keine
  Einwilligung, keine Altersabfrage – eine vorausgewählte finale Rückmeldung trüge keine Einwilligung; ob Buchst. b für sie trägt, prüft der
  Betreiber noch, README „Weiter vom Betreiber zu prüfen“), **Tippzeiten** Buchst. f („sie stehen …“ per `ttWhere`; berechtigtes Interesse, den
  Schreibprozess sichtbar zu machen, damit die Lehrkraft bei Auffälligkeiten über die Arbeitsweise sprechen kann; `TT_USE`;
  Widerspruch mit dem Schalter – vom Betreiber so entschieden), LanguageTool
  Einwilligung Buchst. a (Klick + Bestätigung im Altersdialog, Widerruf), nur bei Blättern mit Videos (`videos`) direkt danach
  `B.ytBasis` – YouTube: Einwilligung Buchst. a, für Cookies zusammen mit § 25 Abs. 1 TDDDG (bedingter Listenpunkt, sonst bleibt
  die Liste gleich – `privBases` der E2E-Tests), Aufruf/Auslieferung/Missbrauchsschutz Buchst. f
  (Widerspruch), Speichern im Browser § 25 Abs. 2 Nr. 2 TDDDG für „dein Zwischenstand, die Häkchen einer Checkliste“ (mit
  `TT_KEEP_IN_DRAFT` „– außer den Tippzeiten darin –“; **nie stillschweigend auf die Tippzeiten ausdehnen** – nach Annahme des
  Betreibers bräuchte ihr Speichern im Zwischenstand eine Einwilligung nach § 25 Abs. 1 TDDDG) – Schreibweise „Buchst.“,
  nie „lit.“; Welche Daten („Außerdem deine Antworten mit ihren Tippzeiten (je eingegebenem Zeichen … keine Uhrzeiten; nach einem
  Widerspruch keine)“, darunter als eigener Absatz im Fließtext `TT_ACCESS(g, keep, ai)`: „Für die Tippzeiten liest diese Seite beim
  Schreiben in deinem Browser die Zeitpunkte deiner Eingaben aus und hält sie bis zur Abgabe im Arbeitsspeicher (nach einem Widerspruch
  nicht mehr) – das ist ein Zugriff auf dein Gerät im Sinne von § 25 TDDDG.“ – mit und ohne KI-Feedback gleich (die frühere Klammer
  `TT_HELD` „(und, wenn die KI-Rückmeldung zu deiner abgegebenen Fassung noch nachgereicht wird, bis dahin)“ ist entfallen: nach der Abgabe
  hält die Seite keine Tippzeiten mehr); `ai` (Aufruf mit `withAi`) wirkt nur mit `TT_KEEP_IN_DRAFT` „…, hält sie … und speichert die
  Tippzeiten bis zur Abgabe (ohne KI-Feedback: bis dahin) auch in deinem Zwischenstand …“; **nur die Tatsache – nie eine Ausnahme („unbedingt erforderlich“) oder eine
  Einwilligung behaupten** (Entscheidung des Betreibers nach Rechtsprüfung; offen – README „Weiter vom Betreiber zu prüfen“ –, ob schon
  das Erfassen samt Senden eine Einwilligung nach § 25 Abs. 1 TDDDG braucht); damit der Satz stimmt, merkt der Capture-Listener `input`
  nach einem Widerspruch keinen Zeitpunkt (`performance.now()` nur ohne `S.ttOptOut`)); Wer bekommt (Lehrkraft „Sie sieht auch die Tippzeiten – als Färbung …; an einen KI-Dienst oder an die
  Rechtschreibprüfung gehen die Tippzeiten nie.“, Cloudflare „(samt Tippzeiten)“);
  Wie lange („Die Tippzeiten gehören zu Erstversuch und Abgabe und werden mit ihnen gelöscht; bis zur Abgabe hält diese Seite sie nur im
  Arbeitsspeicher – …“, ohne
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
  in `privacyNoticeDom`, Parameter `keep` von `TT_SWITCH_EFFECT`/`TT_SWITCH_SCOPE`; ohne – eingecheckt –: „bis zur Abgabe hält diese Seite
  sie nur im Arbeitsspeicher – in deinem Zwischenstand und in einer Zwischenstand-PDF-Datei stehen sie nicht.“, kein „außer den
  Tippzeiten darin“ beim § 25) – nie fest verdrahten. Alle Tippzeit-Sätze entfallen bei Blättern nur mit Weltkarten und Fotos (`typing:
  ttMeasured(sh)` – dort wird nichts gemessen; dann auch kein `TT_SHORT` und kein Abschnitt zum Widerspruch). **Fotos** (nur bei Blättern
  mit Foto-Aufgabe, `sheetPhotoCount(sh)`; Muster wie die Videos: eigene Absätze, nie in andere Sätze gemischt): `photoShort(g)` als
  `p.privacy#p-privacy-photo` (Angaben-Bildschirm, nach `#p-privacy-yt`) bzw. `#privacy-photo` (Schreibbereich, nach `#privacy-yt`) und
  `privacyNoticeDom(…, {photos: true})` → `B.photoData` (`PHOTO_PRIV_DU`/`PHOTO_PRIV_IHR`) als Absatz unter „Welche Daten?“ **nach** den Absätzen
  zu Tippzeiten, Escape-Room und Videos (so bleibt `„Welche Daten?“ + p + p` = `TT_ACCESS`): Foto gehört zu den Antworten, nur eigene Arbeit,
  verkleinert ohne EXIF, bis zur Abgabe im Zwischenstand (und in Zwischenstand-PDFs), an die Lehrkraft nur verschlüsselt mit der Abgabe, nie an
  eine KI (für KI-Anfragen nur der Vermerk `PHOTO_TEXT`, die Aufgabe nicht im Prompt); „Impressum & Datenschutz“: eigener Abschnitt
  `section#legal-photo` „Feibeitsblätter mit Foto-Aufgaben“ (`renderLegalPhoto`, allgemeine Form). Rechtsgrundlage wie die übrigen Antworten
  (das Foto ist Teil der Bearbeitung; im Zwischenstand wie die Texte unter § 25 Abs. 2 Nr. 2 TDDDG – kein eigener Listenpunkt). **Kurzfassungen:
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
  `GITHUB_ITEM` wie im Hinweis) statt nur für die Checklisten-Seite, bei Blättern ohne
  Auftrag an die KI entfallen die Angaben zum KI-Feedback, dazu `PV_ESC_NOTE` und `PV_VIDEO_NOTE` (Sätze zu YouTube; die Vorschau selbst
  bleibt ohne Videos)). **Seite „Impressum & Datenschutz“** `#screen-legal` (Hash
  `#impressum` beim Laden; `hashchange` nur von Start, Arbeitsform, Angaben, Checkliste und ihr selbst; `openLegal` mit
  Lauf-Kennung `LEGAL.run`, `leaveLegal` → `leaveChecklist("")`, Backlinks `#legal-home`/`#legal-home2`, Fokus `#legal-h`):
  Impressum nach § 18 Abs. 1 MStV aus `OPERATOR` (`#legal-addr`, `#legal-mail` mailto, „nicht kommerzielles Angebot … unentgeltlich
  bereitgestellt“), darunter `privacyNoticeDom(…, {h:"h3", site:true, flat:true})` = `section.privflat#legal-privfull` mit h2
  „Datenschutzerklärung“ (kein details) und Frist/Empfängern von `GET /api/privacy`; scheitert der Abruf, `general:true`
  (allgemeine Sätze: KI-Dienst wird vor dem Senden genannt, Frist nach dem Code) und Hinweis in `#legal-status`; `#legal-other`
  zu Blättern ohne KI und Gruppen, danach `section#legal-escape` „Feibeitsblatt als Finale eines Escape-Rooms“ (allgemeine Form,
  siehe Escape-Room-Anbindung; `#legal-privfull` bleibt dafür unverändert) und `section#legal-video` „Feibeitsblätter mit Videos von
  YouTube“ (allgemeine Form, siehe YouTube-Videos) und `section#legal-photo` „Feibeitsblätter mit Foto-Aufgaben“. Fußzeile `#pagefoot`: „Copyright …“ · `a#foot-legal` `href="#impressum"`, `target="_blank"`,
  `rel="noopener"`, sr-only „(öffnet in neuem Tab)“ (`.copyright a` klickbar trotz `pointer-events:none`; auf der Seite selbst
  ausgeblendet per `body.on-legal`). Empfänger: Lehrkraft; Cloudflare (Sitz USA; betreibt
  Server und Datenbank, nur die Datenbank liegt in der EU – **nie „Server in der EU“** schreiben, der Worker läuft im
  nächstgelegenen Cloudflare-Rechenzentrum; gespeichert nur verschlüsselt, für das KI-Feedback **kurz unverschlüsselt im
  Server, nicht gespeichert** – nie behaupten, Cloudflare sehe die Antworten nur verschlüsselt; die finale KI-Rückmeldung verschlüsselt der
  Server für die Lehrkraft und speichert sie nur verschlüsselt zur Abgabe; mit Workers AI im selben
  Eintrag als KI-Dienst, Verarbeitung auch außerhalb der EU); GitHub, Inc. nur bei `PAGES_HOST` (`API !== ""`, GitHub
  Pages); weitere KI-Dienste mit `transfer`; ohne Empfänger (keine KI eingerichtet) `NO_AI_SET` „Ein KI-Dienst ist … gerade
  nicht eingerichtet – deine Antworten gehen an keine KI.“ – auch in `recipientSentence`/`renderPrivacy`, nie ein
  Rückfall „KI-Dienst deiner Lehrkraft“; LanguageTool (Learneo, DPF); nur bei Blättern mit Videos Google Ireland Limited (YouTube,
  `B.ytItem`, `DPF_SCC`). Alle mit DPF/SCC; unbekannte Grundlage `TRANSFER_UNKNOWN`
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
  Leeren), `#done-fb-n` (`renderFinalFeedback`, finale KI-Rückmeldung, `feedback-final`), Lehrkraft `.dfb` (`buildDetail`; `.dfb2` „Finale
  KI-Rückmeldung“ ebenfalls `feedback-final`); Checklisten-Seite `#chk-tasks` bei `ai:true` mit
  Punkten (`renderChecklist`, `AI_SOURCE_COMPOSITE` = `…/compositeWithTrainedAlgorithmicMedia`: KI-Vorschlag, von der Lehrkraft
  geprüft und ggf. geändert). Dazu `aiGenerated` in `/api/feedback` (auch im Final-Modus), `feedbackAi` im Zwischenstand (`draftRecord`; `cleanDraft` liest
  es nicht) und die XMP-Metadaten der Lösungs-PDF (nur mit KI-Stichpunkten, `compositeSynthetic`). Eine Lösungs-PDF mit der Checkliste statt
  einer Rückmeldung bekommt bei `ai: true` nur den sichtbaren Satz „Die Checkliste hat deine Lehrkraft aus einem Vorschlag einer KI erstellt und
  geprüft.“ – kein `/Subject`/`/Keywords`/XMP (anders als die Checklisten-Seite mit `AI_SOURCE_COMPOSITE`).
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
  inline ≤ Breite×330 pt), je YouTube-Video eine Zeile „Video: <Titel – >https://www.youtube.com/watch?v=…“ (`youtubeUrl`), Dateinamen;
  Fußzeile „Seite n von N“). Hintergrund: Objekt 6 = Datensatz
  `feibeitsblatt.json` (`/FbSheet 1`, FlateDecode über `CompressionStream`, sonst roh) **vor** allen Anhängen; je Bild und
  PDF-Datei ein `/Type /EmbeddedFile`-Stream mit den Original-Bytes und `/FbBlob (<exportId>-<k>)`, alle im
  `/EmbeddedFiles`-Namensbaum (Schlüssel ASCII sortiert) und in `/AF`. Datensatz `{kind:"feibeitsblatt-sheet", v:1,
  exportId, exportedAt, code, title, createdAt, tasks:[{text, textFmt? (nur wenn formatiert), solution, material, videos? (nur wenn vorhanden: `[{id, start?, title?}]`,
  kein Anhang, kein `/FbBlob`), images:[{ref, mime, w, h, mode, alt, bytes, sha256}], files:[{ref, name, bytes, sha256}]}]}` – **nie Abgaben**; `v` bleibt 1,
  ältere Sicherungen ohne `videos` laden unverändert. Import: `cleanSheetRecord` → `cleanVideos`, was wegfällt (ungültig, über 3)
  zählt `videosLost` → Hinweis in `#b-err` („Ein YouTube-Video aus der PDF-Datei ließ sich nicht übernehmen …“). Dateiname `sheetPdfName` =
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
  **Foto** (Wunsch der Lehrkraft vom 10.11.2026, z. B. ein Foto vom eigenen Plakat): `{type:"photo"}` ohne weitere Felder (`validateAnswerSpec`
  verwirft unbekannte – was zu sehen sein soll, steht in der Aufgabenstellung), höchstens `LIMITS.photoTasks` 3 je Blatt (`validateSheetInput`:
  400 „Höchstens 3 Aufgaben mit der Antwortart Foto je Feibeitsblatt.“; `ANS_LIMITS.photoTasks` = `PHOTO_TASKS` im Browser, `b-gen` prüft
  dasselbe). `solution` wird `""` wie bei der Weltkarte – `NO_AI_ANSWER_TYPES` (lib.js, `{map, photo}`) = `NO_AI_KINDS` im Browser: `wantsFeedback`
  (Feedback vor und nach der Abgabe, `feedbackResults` → `NO_SOLUTION_NOTE`), `buildChecklistMessages`, `ckWants`; `teacherAnswer`/`publicAnswer`
  liefern genau `{type:"photo"}`. **Darstellung (Vertrag, auch für Fremdsysteme, die Blätter per API anlegen und Abgaben entschlüsseln):**
  Textform = `PHOTO_TEXT` „[Foto]“ mit Foto, sonst `""` – sie steht in `answers` des Zwischenstands und in `answers[i].first/final` von
  Erstversuch und Abgabe, geht in `/api/feedback` (vor und nach der Abgabe, also auch in den Prüfwert `ah` – `finalAnswersDigest` bleibt
  unverändert); die Foto-Aufgabe selbst steht nie im Prompt. Das Foto ist ein JPEG als data:-URL `data:image/jpeg;base64,<Standard-Base64>`
  (`PHOTO_PREFIX`; `cleanPhoto`: beginnt mit `/9j/`, Länge Vielfaches von 4, ≤ `PHOTO_DATA_MAX` Zeichen – sonst „kein Foto“): im Zwischenstand
  `photos` (an `answers` ausgerichtet, `null` ohne Foto; fehlt, wenn es keines gibt), in der Abgabe (stage final) `answers[i].photo` (nur mit
  Foto), **nie im Erstversuch** (dort `{first, final: null}` wie bei jeder Aufgabe). Ältere Lehrkraft-Seiten kappen `answers[i]` auf
  `{first, final}` und zeigen „[Foto]“ als Text (nichts bricht, `ah` passt); ältere, gecachte Schüler-Seiten kennen die Art nicht und zeigen
  ein Textfeld – die Lehrkraft-Ansicht zeigt dann diesen Text statt „(kein Foto)“. **Block PHOTO** (`/* PHOTO:BEGIN … PHOTO:END */`, reine
  Funktionen, `photo.test.mjs`): `PHOTO_MAX_SIDE` 1280, `PHOTO_MAX_BYTES` 200 KB, `PHOTO_TOTAL_BYTES` 400 KB, `photoBudget(n)` = min(200 KB,
  ⌊400 KB / n⌋) je Foto bei n Foto-Aufgaben (`sheetPhotoCount`), `PHOTO_STEPS` (1280 px/0,72 → 1280/0,6 → 1024/0,62 → 1024/0,5 → 800/0,55 →
  640/0,5 → 480/0,45 – die erste Stufe im Budget gewinnt), `PHOTO_ENV_MAX` = `LIMITS.photoEnvelopeBytes`, `photoBytes`, `photoInfo` (Größe und
  Bytes ohne ganzes Dekodieren), `jpegInfo` (SOF-Kopf), `pdfPhotoOk`. **Schreibbereich (`photoWidget`, `S.tas[i]._kind` "photo"):**
  `div.photow#a-n` (role group) mit Vorschau `button.photo-view` (Klick → `openLightbox`), Größe `.photo-meta` („1280 × 960 Pixel · 180 KB“),
  „Noch kein Foto.“, `button.photo-cam` „Foto aufnehmen“ (`input[type=file][accept=image/*][capture=environment]`) und `button.photo-pick` „Bild
  auswählen“ (ohne capture: Galerie bzw. Datei), mit Foto „Neues Foto aufnehmen“/„Anderes Bild auswählen“/„Foto entfernen“ (`askConfirm` „Foto
  entfernen?“, danger), Ablegen per Ziehen, Hinweis `PHOTO_HINT` (nur eigene Arbeit, ohne Personen; verkleinert ohne Aufnahmeort; nur
  verschlüsselt mit der Abgabe, nie an eine KI), Statuszeile `.photo-stat` („Das Foto wird verkleinert …“, „Foto übernommen.“, Fehler in du-Form,
  z. B. HEIC). `preparePhoto(file, budget)`: ≤ 40 MB, `decodeImage` (EXIF-Drehung), canvas weiß hinterlegt, `imageSmoothingQuality` high,
  `toBlob("image/jpeg", q)` – das Neuzeichnen entfernt EXIF. `value` = Textform (Setter: nur `""` leert), `photo` = data:-URL, `readOnly` sperrt
  die Knöpfe (KI-Anfrage). Keine Einfügesperre (keine `textarea`), keine Tippzeiten (`NO_TYPING_KINDS` in `ttCodesOf`/`ttB64Of`/`ttResetAll`/
  `ttRestore`, `ttMeasured`; im Block TYPING `TT_UNTYPED` für `ttDetail`), keine Rechtschreibprüfung, keine KI-Feedback-Box (auch nicht auf dem
  Abschlussbildschirm). `#sheet-meta` ergänzt „Bei einer Foto-Aufgabe nimmst du ein Foto auf oder wählst ein Bild aus.“. **Zwischenstand:**
  `draftRecord` legt `photos` dazu (je Foto bis ~270 000 Zeichen im localStorage, bei jedem Speichern neu geschrieben); ist der Speicher voll,
  speichert `saveDraft` nach dem Versuch ohne Tippzeiten einen Stand ohne `typing` und `photos` (`SAVE_NO_PHOTOS` „Zwischenstand ohne Foto
  gespeichert – …“, als Fehler gefärbt) und hält den vollen Stand in `heldDrafts` (Weiterschreiben ohne Neuladen behält das Foto; nach dem
  Neuladen meldet das Feld `PHOTO_LOST`, wenn die Textform „[Foto]“ ohne Foto zurückkommt). Bekannte Grenze: localStorage (≈ 5 MB je Herkunft)
  fasst nur wenige Zwischenstände mit Fotos. `openEditor` setzt `photo` aus `d.photos` (immer über `cleanPhoto`), `cleanDraft` (PDF) ebenso;
  die Zwischenstand-PDF enthält die Fotos (Stand „x von n Aufgaben bearbeitet (k mit Foto)“, Hinweis „… lesbar – auch deine Fotos.“).
  **Abgabe:** `submitAll` und die Abschluss-PDF einer gescheiterten Escape-Abgabe hängen `photo` an; `sealPayload` prüft bei Blättern mit
  Foto-Aufgabe gegen `PHOTO_ENV_MAX` (sonst `TT_ENV_MAX`, `ttEnvelopeFits(env, max)`), lässt erst Tippzeiten, dann Escape-Einzelheiten weg und
  schickt eine Abgabe mit Fotos, die dann noch zu groß wäre (sehr lange Texte), gar nicht erst (`ApiError` too_large → „Bitte kürze deine
  Antworten.“). `S.lastSubmission.answers[i].photo` für die Lösungs-PDF (eingebettet, siehe Zwischenstand als PDF). **Lehrkraft:** Blatt-Editor
  Option „Foto“ (`#bt-n` value "photo", `.bans-photo` mit Hinweis und Grenzen, Auftrag an die KI ausgeblendet, `NO_SOL_TEXT.photo` in `.nosol`),
  `builderAnswer`, Vorlage, Sicherung (`task.answer = {type:"photo"}`, sichtbar „Antwortart: Foto – …“) und Import tragen die Art mit;
  Blattdetails `answerSpecDom` „Antwortart: Foto“ (`PHOTO_SPEC_TEXT`), kein „Auftrag an die KI“. `loadSubs` übernimmt `answers[i].photo` nur
  über `cleanPhoto` (sonst entfällt es). Details: eine Spalte „Abgegebenes Foto“ (`photoDetailDom`: Vorschau `.dphoto-view` → Vergrößerung,
  Größe, „Foto herunterladen“ als `Feibeitsblatt-Foto-<Code>-<Klasse>-<Kürzel>-Aufgabe-n.jpg` per `dataUrlToBlob`/`downloadBlob`), kein
  „Angezeigtes KI-Feedback“; die Lösungs-PDF aus der Übersicht bettet es ein (`teacherSolutionsSub`). Analoges Arbeitsblatt: ein Rahmen über
  die volle Breite (`ANALOG_PHOTO_PT` 220 pt, `analogPhoto`) mit „Hier kannst du zeichnen oder ein Foto einkleben.“ (auch im Text von
  `#ck-intro1`). Datenschutz: siehe Datenschutz-Angaben („Fotos“). E2E 7s (eigenes Blatt, wird gelöscht; `PHOTO_SHOTS_OUT=<Ordner>` speichert
  Bildschirmfotos): Anlegen (Auftrag ausgeblendet), Foto über die Kamera-Auswahl (PNG 1600 × 1200 → JPEG 1280 × 960), Vergrößerung, `photos` im
  Zwischenstand, Neuladen, Ersetzen (400 × 300), Entfernen abgebrochen, kein Bild → Meldung, KI-Feedback nur mit „[Foto]“ (Prompt ohne die
  Aufgabe), Erstversuch ohne Foto, Abgabe in D1 entschlüsselt mit `photo`, `final_env` passt (`ah`), Lösungs-PDF mit `/DCTDecode`,
  Lehrkraft-Details, Vergrößern, Herunterladen (Name und Bytes), Lösungs-PDF der Übersicht, analoges Arbeitsblatt, Sicherung und Import.
- **Tippzeit-Messung (nur im Browser; Server, KI und Lösungs-PDF unverändert):** je `textarea.answer`/`textarea.tcell` (nie
  Weltkarte oder Foto – `NO_TYPING_KINDS`) `el._tt = {text, recs:[{t, g?}], undo, lastDel, ver}` (`ttNew`); Zeitpunkt `performance.now()` im Capture-Listener
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
  `/api/feedback`, `S.lastSubmission`, Lösungs-PDF, `final_env`, keine Anzeige für Schüler:innen. Nach der Abgabe hält die Seite keine
  Tippzeiten mehr: Die angenommene Nutzlast wird nicht gemerkt (die finale KI-Rückmeldung legt der Server selbst ab, nichts wird nachgereicht),
  `S.firstTyping` wird `null`. **Lehrkraft:** `loadSubs` → `ttCleanPayload`
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
  **Nach der Abgabe** (`ttFollowStored` endet bei `S.submitted`; der `storage`-Listener kennt nur noch `S.draftKey` im Schreibbereich):
  **Entscheidung des Betreibers vom 08.11.2026** – Folge davon, dass der Browser nie mehr eine Abgabe ersetzt: Trägt ein zweiter Tab, der
  nichts von der Abgabe weiß, danach den Widerspruch ein – oder schon, während dieser Tab die Abgabe sendet (die Werte sind dann schon
  versiegelt; `ttFollowStored` übernimmt ihn hier für einen etwaigen neuen Versuch und zeigt dann `.ttopt-st.late` `TT_OPT_TAB_LATE` „… Für die
  Abgabe, die gerade gesendet wird, gilt er nicht mehr. …“ statt `TT_OPT_TAB`) –, bleiben die Tippzeiten in der angekommenen Abgabe
  (früher reichte `fb2FollowOptOut` die finale Rückmeldung dann ohne Werte nach). Nach der Abgabe lassen sich die Tippzeiten nur zusammen mit
  der ganzen Abgabe löschen – so sagt es `TT_SWITCH_SCOPE` schon; „(nach einem Widerspruch nicht mehr)“ in `TT_ACCESS` stimmt weiter, denn
  diese Seite hält nach der Abgabe ohnehin keine Tippzeiten mehr.
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
- **YouTube-Videos unter dem Material** (Entscheidungen der Lehrkraft: höchstens 3 je Aufgabe, Zustimmung je Video mit einem Klick,
  nichts gespeichert, optionaler Titel, Einbettung über `youtube-nocookie.com`; nie Vorschaubilder, nie oEmbed, nie preconnect, keine
  IFrame-API): `tasks[i].videos = [{id, start?, title?}]` – `id` 11 Zeichen `VIDEO_ID_RE` = `YT_ID_RE` `/^[A-Za-z0-9_-]{11}$/`
  (**Groß-/Kleinschreibung bleibt, nie toLowerCase**), `start` Ganzzahl 1…`LIMITS.videoStart` − 1 (86 399; 0/fehlt = kein Feld),
  `title` per `cleanLine` ≤ `LIMITS.videoTitle` 120; **nie eine URL speichern oder ausliefern** – alle Adressen baut der Browser aus der
  geprüften Kennung auf festen Hosts. Worker (lib.js): `validateVideos(raw, n)` in `validateSheetInput` (null → `[]`; kein Array →
  400 „Aufgabe n: Die Videos haben ein ungültiges Format.“, über `LIMITS.videosPerTask` 3 → „Aufgabe n: Höchstens 3 YouTube-Videos je
  Aufgabe.“, je Eintrag „Aufgabe n: Video k: Das ist kein gültiger YouTube-Link.“ / „… Die Startzeit ist ungültig.“ / „… Der Titel muss
  ein Text sein.“ / „… Der Titel ist zu lang (höchstens 120 Zeichen).“ – rohe Länge vorher grob begrenzt (CPU); dasselbe `id|start`
  still nur einmal, unbekannte Felder entfallen) → `task.videos` **nur wenn nicht leer** (wie `material`; lib-Tests vergleichen
  gespeicherte Aufgaben per deepEqual); `videosOut(raw)` (wirft nie, prüft erneut, ≤ 3, ungültige Startzeit = von vorn) in
  `routePublicSheet` und `routeSheetGet` – je Aufgabe **immer** `videos` (kein Feld auf Blattebene, keine Spalte, keine zusätzliche
  D1-Abfrage); `routeSheetCreate` antwortet mit `videoCount` (fehlt er bzw. ist er kleiner als gesendet → `#b-res-vid` per `liveFill` „Die Videos
  wurden vom Server nicht gespeichert – bitte die Seite neu laden.“). ai.js unverändert: Videos gehen nie an die KI (Prompt und
  Checklisten-Prompt byte-gleich mit und ohne Videos – ai-/worker-/Smoke-Tests). **Browser-Block `/* VIDEO:BEGIN` … `/* VIDEO:END */`**
  (reine Funktionen ohne Abhängigkeiten, nach `cleanFiles`, vor WORLDMAP; `test/unit/video.test.mjs`): `VIDEO_LIMITS {perTask 3, title
  120, start 86400}` (= `LIMITS`), `YT_CONSENT` (**wörtlich und fest**, Vorgabe des Betreibers: „Erst nach diesem Klick wird das Video
  von YouTube (Google) geladen. Dabei erhält Google unter anderem deine IP-Adresse und kann Cookies setzen; Daten können in die USA
  gelangen.“ – im Schreibbereich auch bei Gruppen „du“), `YT_HOSTS` (genau youtube.com, www./m.youtube.com, youtu.be,
  [www.]youtube-nocookie.com, exakt verglichen – nie `endsWith`), `parseYouTube(input)` → `{id, start}` | `{error}` (Links mit/ohne
  Schema, `//…`, Einbettungscode nur per Regex auf `src` – nie DOM –, `&amp;` dekodiert; Pfade `/watch?v`, youtu.be/ID, `/shorts`,
  `/embed`, `/live`, `/v`; Startzeit aus `t`, `start` oder `#t` (90, 90s, 1m30s, 1h2m3s, `videoStartOf`); `si=`/`pp=`/`list=`/`feature=`
  fallen weg; Playlist → `YT_ERR_PLAYLIST`, sonst `YT_ERR_OTHER`/`YT_ERR_EMPTY`; Nutzer, Passwort, Port, Steuerzeichen, > 2000
  Zeichen → abgelehnt), `cleanVideos` (fremde Daten wie `videosOut`), `videoTitle`, `youtubeUrl(v)` =
  `https://www.youtube.com/watch?v=<id>[&t=<s>s]` (**eine** Funktion für Builder-Liste, Lehrkraft-Ansichten, „Video in neuem Tab
  öffnen“, Sicherung, QR-Inhalt, gedruckten Link und URI), `youtubeEmbedUrl(v)` = `https://www.youtube-nocookie.com/embed/<id>?autoplay=1
  [&start=<s>]`, `fmtVideoStart` (90 → „1:30“). **Builder:** unter dem Material-Editor `button.btn.ghost.small.bvid-add` „YouTube-Video im
  Feibeitsblatt einbetten“ (aria-label „… – zu Aufgabe n“ in `renumber`; **nicht** in `.bmat-bar`, **keine** Klasse `fmtbtn` – E2E sucht
  `.bmat .fmtbtn` mit hasText „U“/„F“) → `askVideo(others)` = Dialog `#ytdlg` nach dem Muster von `#linkdlg` (`#yd-url`, `#yd-title`
  maxlength 120, `#yd-found` „Erkannt: …“, `#yd-err` role=alert, `#yd-ok` „Einbetten“, `#yd-cancel`; nur ein Modal gleichzeitig –
  `dlgResolve || ldState || ydResolve` → `null`; Tab-Falle, Esc, Enter, Fokus zurück, Hintergrundklick nur, wenn er dort auch begann (`pointerdown` –
  sonst schlösse das Ende einer Markierung im Feld den Dialog), und erst nach 400 ms; dasselbe Video
  mit derselben Startzeit → „Dieses Video ist bei dieser Aufgabe schon eingebettet.“; `logout` schließt `#ytdlg` und `#linkdlg`);
  `tr._videos` (`addRow(…, textFmt, videos)` als 8. Parameter, `openBuilder` reicht `r.videos` durch), `renderVideos(tr)` →
  `ul.bvids` > `li.bvid` (Titel, kanonischer Link per `newTabLink`, „ab m:ss“, `.iconbtn.x` „Video k zu Aufgabe n entfernen“ – nie in
  `.acts`, `renumber` nutzt `.acts .x`), bei 3 `aria-disabled` + `.bvid-stat` „Höchstens 3 Videos je Aufgabe.“; `T.builderDirty` nur
  beim Hinzufügen/Entfernen, nie beim Vorbefüllen (Vorlage, Import – `#b-back` ohne Rückfrage); die Zeilen-Löschfrage und die
  Leerzeilen-Prüfung in `b-gen` zählen Videos mit; `b-gen` sendet `videos` (nur wenn vorhanden). **Schüler:innen:** `fetchSheet` →
  `S.sheet.videos` (`cleanVideos` je Aufgabe); `buildTasks` setzt `div.task-videos` direkt nach `.task-material` (vor `.task-files`),
  je Video `videoBlock(v, k, n)` = `figure.task-video#v-n-k` mit Platzhalter `div.yt-ph` (kein festes Seitenverhältnis – der Text wird nie
  abgeschnitten): `p.yt-title` (Titel bzw. „Video k zu Aufgabe n“, ggf. „(ab m:ss)“), `p.yt-note#vn-n-k` = `YT_CONSENT`,
  `button.btn.yt-load` `YT_LOAD_TEXT` „Video von YouTube laden“ (aria-describedby → Hinweis) und `a.yt-open` „Video in neuem Tab
  öffnen“ (`youtubeUrl`, `_blank`, `rel="noopener noreferrer"`, sr-only „(öffnet in neuem Tab)“, aria-label „Video in neuem Tab öffnen –
  <Titel bzw. Video k zu Aufgabe n>“ – sonst gleichlautende Links; bleibt nach dem Laden darunter stehen).
  Klick → `div.yt-frame` (16:9) mit `iframe` (src erst jetzt, `youtubeEmbedUrl`; title „YouTube-Video: …“,
  **`referrerpolicy="strict-origin-when-cross-origin"`** – die Seite sendet sonst keinen Referer (`Referrer-Policy: no-referrer`) und
  YouTube verweigert eingebettete Player (Fehler 153); nur die Herkunft, nie Pfad, Hash oder Code; `allow="autoplay; encrypted-media;
  picture-in-picture; fullscreen"`, `allowfullscreen`, `sandbox="allow-scripts allow-same-origin allow-presentation allow-popups
  allow-popups-to-escape-sandbox"`), Fokus aufs iframe; alles per `h()`, nie innerHTML. **Die Zustimmung wird nirgends gespeichert**
  (nicht im Zwischenstand, nicht in localStorage, nicht in PDF-Dateien): `show()` auf einen anderen Bildschirm → `stopVideos()` (iframe
  weg, wieder Platzhalter, `fig._reset`); nach Neuladen/Weiterschreiben wieder Platzhalter. Daran hängen die Datenschutzsätze „diese
  Seite speichert nicht, welche Videos du geladen hast“ und „verschwindet, wenn du die Seite neu lädst …“ – wer etwas speichert, muss
  `YT_PRIV_*` (und ggf. den § 25-Abs.-2-Punkt) anpassen. **Lehrkraft-Ansichten:** `teacherVideos(metas)` → `div.tvideos` mit Sublabel
  „Videos (YouTube)“ und je Video „Titel bzw. Video k (ab m:ss): <Link>“ (neuer Tab, noopener noreferrer) in den Blattdetails (nach dem
  Material) und in den Abgaben-Details (nach der Aufgabenstellung) – keine iframes, keine Vorschaubilder, eigene Klassen (Tests zählen
  `.task-label`/`.material`). „Als Vorlage verwenden“ übernimmt `videos`. **Sicherung:** siehe dort (Datensatz `videos` nur wenn
  vorhanden, sichtbare Zeile „Video: …“, Hinweistext „Videos (als Links zu YouTube)“ nur mit Videos, kein Anhang). **Analoges
  Arbeitsblatt:** je Video nach dem Material (nicht neben seiner grauen Linie) ein unteilbarer Block (`analogVideo`/`drawVideo`, `fits`,
  sonst neue Seite; `firstBlock` kennt ihn): QR-Code `ANALOG_QR_PT` 90 per gemeinsamem `qrDraw(q, url, x, top, side)` (dasselbe
  Op-Format wie der Checklisten-QR, Ruhezone 4 Module im linken Rand) mit Inhalt `youtubeUrl(v)` (nie die Eingabe der Lehrkraft;
  Version ≤ 4), rechts fett „Video auf YouTube (Google)“, Titel, „ab m:ss“ und „Scanne den QR-Code oder gib die Adresse unter dem Code
  ein.“, unter dem QR-Code die Adresse in **Courier** `/F5` (`ANALOG_URL_PT` 10, `pg.mono`) mit URI-Annotation auf genau diese Adresse
  (`urlBase`: reicht die rechte Spalte tiefer, z. B. bei einem sehr breiten Titel, rückt sie darunter – nie über den Text rechts);
  nie `youtube-nocookie`, keine neuen Linien. **Datenschutz** (nur bei Blättern mit Videos, `sheetHasVideos(sh)`; Muster Escape: eigene
  Knoten und Absätze, `privacyShortText` **nicht** ändern – typing.test prüft Signatur, Zahl der Vorkommen und Wortlaut): Bausteine
  zwischen `FB2_SEND` und `PRIV_IHR` (außerhalb der per `new Function` ausgewerteten Ausschnitte von typing.test – dort keine neuen
  Konstanten): `YT_GOOGLE` („Google Ireland Limited (Dublin, Irland), Anbieter von YouTube im EWR“), `ytShort(g)` (Kurzsatz: „Zu diesem
  Feibeitsblatt gehören Videos von YouTube: Ein Video lädt diese Seite erst nach deinem Klick auf „Video von YouTube laden“ – dabei erhält
  Google unter anderem deine IP-Adresse und kann Cookies setzen; Daten können in die USA gelangen.“; „ihr“-Form „Zu eurem Feibeitsblatt …
  nach eurem Klick … eure IP-Adresse …“), `YT_PRIV_DU`/`YT_PRIV_IHR` (in `PRIV_DU`/`PRIV_IHR` gespreizt): `ytPurpose`, `ytData`
  (IP-Adresse, technische Daten zu Browser und Gerät, die Adresse dieser Seite ohne den Code, welches Video und wie abgespielt;
  Cookies und ähnliche Daten; Angaben und Antworten nie; diese Seite speichert nicht, welche Videos geladen wurden), `ytBasis`
  („Videos von YouTube: deine Einwilligung, Art. 6 Abs. 1 Buchst. a DSGVO – für Cookies … zusammen mit § 25 Abs. 1 TDDDG …“, je Video mit
  dem Klick, Widerruf = keine weiteren Videos laden), `ytItem` (Google Ireland Limited, auch Google LLC in den USA, `DPF_SCC`; „Video in
  neuem Tab öffnen“ ruft YouTube direkt auf), `ytStay`, `ytChoice` (freiwillig – **kein „ohne Nachteil“**: eine Aufgabe kann das Video
  voraussetzen, Art. 7 Abs. 4 offen), `ytRights` (Widerruf; Rechte auch direkt bei Google). `privacyNoticeDom` mit `videos` (`const yt`,
  Einzelarbeit und Gruppe; **keine eigene Überschrift**): Wozu `para(B.ytPurpose)` nach dem Escape-Absatz, Rechtsgrundlage
  `yt ? B.ytBasis : null` direkt nach LanguageTool (§ 25 Abs. 2 Nr. 2 nie auf YouTube ausdehnen), Welche Daten `para(B.ytData)` **nach**
  `ESC_PRIV.data` (E2E-Selektoren `Welche Daten? + p + p` = `TT_ACCESS`, `+ p + p + p` = Escape), Empfänger `B.ytItem` nach LanguageTool
  und vor `escMailItem` (kein „Escape-Room“ im Punkt – 7n filtert danach), Wie lange `para(B.ytStay)` nach `ESC_PRIV.stay`, Musst du
  `+ B.ytChoice`, Deine Rechte `para(B.ytRights)` nach „Wende dich dafür an den Betreiber …“ (die beiden Absätze davor unverändert).
  `renderPersonPrivacy`: `p.privacy#p-privacy-yt` (`ytShort(g)`) nach `#p-privacy-esc`, `videos: yt` **hinter** `escape: esc`
  (typing.test sucht `typing: ttMeasured(…), ttSwitch: "live"` genau zweimal); `renderPrivacy`: `p.privacy.hidden#privacy-yt` (HTML nach
  `#privacy-esc`, immer „du“) und `videos: yt` – beides **nach** `const full = $("privfull-ed")` (davor prüft typing.test auf
  Tippzeit-Wörter), der Text von `#privacy` bleibt gleich. „Impressum & Datenschutz“: `section.legal-esc#legal-video` (`renderLegalVideo`,
  h2 „Feibeitsblätter mit Videos von YouTube“, Einleitung, `PRIV_DU.ytPurpose`, `ytData`, `ytBasis`, `ytItem`, `ytStay`, `ytChoice`,
  `ytRights` und der Satz zum QR-Code des analogen Arbeitsblattes, der direkt zu YouTube führt); `privacyNoticeDom` bekommt dort **kein**
  `videos` (`GET /api/privacy` kennt kein Blatt), `#legal-privfull`/`#legal-other`/`#legal-escape` unverändert. Vorschau der Lehrkraft:
  `PV_VIDEO_NOTE` in `#pv-preview-note` nach `PV_ESC_NOTE` (E2E 1b prüft den Text wörtlich). Keine Tippzeit-Wörter (`NO_TT`, ohne
  Groß-/Kleinschreibung: auch nicht „Schalter“, „Haken“, „misst“) in Kurzsatz, Platzhalter, Knopf, iframe-title und Video-Titeln von
  Testdaten; nie „Deine Schule“, „Datenschutzbeauftragte“, „frag deine Lehrkraft“. **Weiter vom Betreiber zu prüfen** (README,
  „Videos von YouTube“; im Hinweis nichts behaupten): gemeinsame Verantwortlichkeit (Art. 26 DSGVO, EuGH C-40/17 „Fashion ID“),
  Einwilligung unter 16 Jahren (Art. 8 DSGVO) und die Altersangaben in den YouTube-Nutzungsbedingungen (keine Altersabfrage ohne
  Rückfrage beim Betreiber), Freiwilligkeit bei Aufgaben, die das Video brauchen, DPF-Stand der Google LLC. **Tests:** Unit
  `video.test.mjs` (Block VIDEO, Hosts, Startzeit, Einbettungscode, `cleanVideos`, CSP, iframe-Attribute), `config.test.mjs` (CSP beider
  Stellen), lib/worker (`validateVideos`/`videosOut`, Ausgabe öffentlich/Lehrkraft, gleiche Zahl D1-Abfragen), ai (Prompt ohne Videos),
  Smoke (Schlüsselliste je Aufgabe mit `videos`, Blatt mit Video, ungültige → 400, Prompt ohne Video-Daten); E2E 7q (nach 7k, eigenes
  Blatt, löscht alles; Attrappe für alle Google-/YouTube-Hosts per `context.route`: vor dem Klick keine Anfrage, danach genau eine an
  `youtube-nocookie.com/embed/…` mit Referer = nur Herkunft, keine CSP-Verletzung, Zustimmung nicht gespeichert, Lehrkraft-Ansichten,
  Vorlage, Sicherung/Import, analoges PDF mit QR → jsQR und Courier-Link, Datenschutzhinweis mit YouTube nur dort; `VIDEO_SHOTS_OUT=<Ordner>` speichert
  Bildschirmfotos (Blatt-Editor, Platzhalter, geladenes Video, Lehrkraft-Ansicht), mit `ANALOG_PDF_OUT` zusätzlich `7q-analog-videos.pdf`).
  `helpers.mjs`: `openPage` zeichnet alle Anfragen an fremde Hosts auf (auch aus iframes und Pop-ups), YouTube-/Google-Hosts gehen an
  eine Attrappe (`installYouTube`) bzw. werden blockiert, und `closePage` lässt **jeden** Test scheitern, der eine solche Anfrage
  stellt – nur 7q darf (`p.allowYouTube`) nach dem Klick die Player- und die watch-Adresse aufrufen. Echtes Abspielen
  testet keine Attrappe – nach dem Ausrollen einmal von Hand (Worker-Adresse und GitHub Pages).
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
- **Checkliste (beim Anlegen bestätigt) + Analoges Arbeitsblatt (QR-Code)** (Wunsch der Lehrkraft vom 08.11.2026): Die Checkliste
  entsteht **beim Anlegen**: nach „Code generieren“ zeigt das Ergebnis `#b-ck` „Checkliste für die Schüler:innen“ (`#b-ck-intro`: wofür,
  was die KI bekommt, nach dem Bestätigen öffentlich) und `ckEditorOpen(code, {title, tasks: die eben gesendeten Texte}, "create")` schlägt
  parallel zu den Uploads einmal vor; die Lehrkraft prüft, ändert und bestätigt (`#ck-save` „Checkliste bestätigen“, PUT ohne PDF, „Checkliste
  bestätigt.“ bzw. „Gespeichert – ohne Checklistenpunkte.“; Fokus bleibt beim Code). Bestätigt dient sie **zwei Zwecken**: der Lösungs-PDF der
  Schüler:innen unter jeder Antwort ohne KI-Rückmeldung (siehe Finale KI-Rückmeldung; geholt über die öffentliche Route; Texte `B_CK_WHERE`,
  `B_CK_INTRO`/`B_CK_INTRO_ESC`), und dem QR-Code des
  analogen Arbeitsblattes – **öffentlich ab dem Bestätigen** (`#checkliste=CODE`), also womöglich schon während die Schüler:innen schreiben
  (README, „Weiter vom Betreiber zu prüfen“). „Zur Übersicht“ (`#b-res-back`) und der obere Rücklink `#b-back`
  fragen über `ckCreateLeaveOk()` nur bei geänderten, nicht bestätigten Punkten („Checkliste nicht bestätigt“, `safeFirst`; nicht während das
  Bestätigen läuft); unbestätigt bleibt nur der Entwurf – dann steht in den Lösungs-PDFs keine Checkliste, und `ckCreateNote` sagt es nach
  `#b-res-back` in `#t-export-status` (`leaveBuilderResult`, auch für `#b-back`, solange `#b-result` zu sehen ist; nur, wenn die Übersicht seitdem nicht verlassen wurde). Escape-Blätter (`CK.esc`, aus `sheet.escape`): `#b-ck-intro` = `B_CK_INTRO_ESC`, Zustandstexte und
  die Rückfrage zu „Neu von der KI vorschlagen lassen“ ohne QR-Code, `#ck-open` verborgen; `h2#ck-h2` „Checkliste zum QR-Code“ nur im Modus
  `"analog"`, sonst „Punkte der Checkliste“. Schlägt die KI noch vor (`T.ckPending`, eine Map je Code, aus `ckSuggest`), wartet ein neu geöffneter Editor desselben
  Blattes darauf statt erneut zu fragen; ein Ladefehler beim Anlegen verweist auf „Checkliste bearbeiten“. Ein Editor `#ck-box` für
  drei Lagen (`CK.mode`, `ckMount` verschiebt ihn zwischen `#b-ck-slot` und `#ck-home` in `#tv-analog`; `CK_SAVE_LABEL`): `"create"` (s. o.),
  `"edit"` – `#t-ck-edit` „Checkliste bearbeiten“ in den Blattdetails (auch bei Escape-Blättern) → `#tv-analog` mit `h1#ck-h1` „Checkliste“,
  „Checkliste speichern“, ohne PDF – und `"analog"` (ältere Blätter ohne bestätigte Checkliste: „Analoges Arbeitsblatt“, `#ck-intro1`,
  „Speichern und PDF herunterladen“ wie bisher). `#t-analog` „Analoges Arbeitsblatt als PDF herunterladen“ im ausgewählten Blatt →
  `openAnalog`: mit bestätigter Checkliste **direkt** das PDF, ohne noch einmal zu fragen (Abbruchzähler `T.analogDirect` und `T.overviewLeft` –
  steigt in `teacherView` bei jedem Verlassen der Übersicht; Verlassen, anderes Blatt oder Abmelden → nichts, die Meldung „wird erstellt …“
  wird geleert; Knopf „PDF wird erstellt …“, Meldungen in `#t-export-status`: „… – mit der Checkliste, die
  Sie bestätigt haben.“, ohne Punkte „Ohne Checklistenpunkte enthält es keinen QR-Code zur Checkliste.“), sonst `ckEditorOpen(…, "analog")` →
  `#tv-analog` (Abbruchzähler `T.analogRun` wie `T.importRun`/`T.exportRun`: steigt in
  `teacherView` beim Verlassen und bei `logout`, `analogStillWanted`; `ckLeaveQuestion()` nur für `#ck-back` – abmelden lässt sich
  nur aus der Übersicht: während des PUT (`CK.saving` "put") „… Das Speichern läuft weiter … – das PDF wird dann aber nicht
  heruntergeladen.“, während das PDF entsteht ("pdf") ebenso (kind "busy"), sonst bei `ckDirty` „Ohne Speichern zurück?“ ("dirty");
  nach der Antwort wird neu bewertet – hat sich die Art geändert (Speichern inzwischen gescheitert), wird noch einmal gefragt;
  solange die Frage offen ist (`CK.leaving`), wartet `ckSave` mit dem Download; `ckUnsaved` → beforeunload, bei sichtbarem `CK.view` (beim Anlegen nur mit sichtbarem `#b-result`);
  `analogStillWanted` prüft `CK.view` und im Modus `"create"` das sichtbare `#b-result`). D1 `sheet_checklists` = JSON
  `{v:1, ai, tasks:[{n, points}]}` in `draft` (Vorschlag der KI, nie öffentlich) und `final`, gelöscht mit dem Blatt. Routen: `GET
  …/sheets/:code/checklist` → `{checklist:{draft, final, updatedAt}|null, aiFeedback, aiReady}`; `POST {force?}`: schon Entwurf oder
  final und kein force → keine KI (`generated:false`), keine Aufgabe mit Auftrag → leerer Entwurf `ai:false` + `noAi`, sonst `askAI`
  (erster Anbieter, dann Reserve – dieselbe Schleife wie das Feedback) → Entwurf; Fehler 429 `ai_busy`, 503
  `ai_quota`/`ai_not_configured`, 502 `ai_error` mit der ausführlichen Lehrkraft-Meldung; `PUT {ai, tasks}` → `validateChecklist`
  (cleanLine, leere und – ohne Groß-/Kleinschreibung – doppelte Punkte entfallen, `LIMITS.checkPoints` 8 × `checkPoint` 160 Zeichen,
  sonst 400 „Aufgabe n: …“) → final, draft NULL; öffentlich nur final mit Titel und reinem Aufgabentext (ohne final 404
  `no_checklist`, zählt nicht als `lookup_miss`; `no-store`). POST und PUT gehen auch für Escape-Blätter (dort gibt es weiter kein analoges
  Arbeitsblatt, die Checkliste dient nur der Lösungs-PDF; `escape_sheet`/`MSG.ckEscape` gibt es nicht mehr); `RATE.checklist` 60/h je IP (jedes
  neue Blatt fragt einmal). ai.js: `CHECKLIST_SYSTEM` (Du-Form, 1–6 prüfbare Punkte – nur so viele,
  wie Aufgabe und Auftrag hergeben, nie einen erfinden –, höchstens 8, Inhalte aus dem Auftrag erlaubt, außer der Auftrag verlangt,
  die Lösung nicht zu verraten: dann allgemein, „Du nennst drei Ursachen.“ – die Schutzregel für Daten zwischen `<<<`/`>>>` nimmt genau
  diese Angabe des Auftrags ausdrücklich aus), `buildChecklistMessages` (nur Aufgaben mit Auftrag:
  Aufgabenstellung, `materialText`, Tabellenspalten, Auftrag – nie Antworten), `normalizeChecklist`, `checklistAcceptor`; Mock:
  System-Prompt mit „Checkliste“ → je Zeile des Auftrags „Du beachtest: …“ (`expectedChecklist`). Browser (`ckEditorOpen`): ohne Entwurf und final
  sofort `POST` („Die KI schlägt eine Checkliste vor …“, ohne Auftrag „Die Checkliste wird angelegt …“; bei `aiFeedback && !aiReady`
  kein `POST`, leerer Editor), Entwurf → `#ck-state` „Vorschlag der KI – noch nicht gespeichert. … erst mit „<`CK_SAVE_LABEL`>“ gilt die
  Checkliste (Lösungs-PDF der Schüler:innen, QR-Code).“, gespeichert „Gespeicherte Checkliste vom … – sie steht in der Lösungs-PDF der
  Schüler:innen unter jeder Antwort ohne KI-Rückmeldung, und ist über den QR-Code sichtbar.“ (Escape-Room-Finale: ohne QR-Satz); `#ck-aiwarn`
  außerhalb des Modus `"analog"` ohne die PDF-Sätze (`CK_NO_AI_SHEET_CK`); nach dem Bestätigen trägt `ckSave` `final` auch in das gemerkte
  `CK`-Objekt ein und leert den Hinweis `T.ckNote` in der Übersicht; je Aufgabe `#ck-n` (Label „Punkte
  der Checkliste zu Aufgabe n – …“, eine Zeile = ein Punkt, `ckParse` mit den Regeln des Servers, `aria-invalid`), `#ck-save` (PUT –
  währenddessen Felder readOnly (`ckFields`), danach baut sich der Editor aus dem Gespeicherten neu, gesperrt bis das PDF fertig ist
  (frei im `finally` desselben `CK.run`) –, nur im Modus `"analog"` dann PDF; dort ohne Punkte Rückfrage
  „Ohne Checkliste herunterladen?“; das `finally` des Klicks setzt die Knöpfe nur bei unverändertem `CK.run` zurück, `openAnalog` setzt
  `#ck-save` selbst zurück), `#ck-regen` (Rückfrage, `force`; ein Fehlschlag lässt den Editor stehen; `ckSuggest` gibt den Fokus
  danach an `#ck-regen`/`#ck-save` zurück, wenn er durchs Sperren auf `body` fiel; verborgen ohne Auftrag oder ohne nutzbaren
  KI-Dienst), `#ck-open` (nur mit final; `href` = `checkUrlOf(code)`, genau das Ziel des QR-Codes), `#ck-status`, `#ck-aiwarn`
  (Aufträge, aber kein KI-Dienst nutzbar bzw. – `CK_NO_AI_SHEET` – gar kein Auftrag → der KI-Satz fehlt im PDF; `#ck-state` sagt beim
  leeren Entwurf dann nur „Noch nicht gespeichert.“); KI-Fehler per `ckAiFailText` (`ai_quota` mit der Meldung des Servers, ohne
  doppelten Grund), keine automatische Wiederholung. PDF `makeAnalogPdf` (`analogImages` lädt Bilder und Kartenbilder per `loadImage`
  → `pdfJpeg`, fehlt eines → Abbruch; PDF-Dateien nur als Namen): A4, Ränder 50/56/60, `/F1`–`/F4` = Helvetica, -Bold, -Oblique,
  -BoldOblique, `/F5` = Courier nur für die Adressen von YouTube-Videos (Objekt `monoObj` = 8 **nach** Info 7, nur wenn eine Seite sie
  nutzt – `pdfStructure(buf, 7)` bleibt; siehe YouTube-Videos), Inhalte FlateDecode (`deflateBytes`); `analogRuns`/`analogLines` setzen Läufe mit Formatierung, Links **nur als
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
  Checklisten-Seite: `CHECK_PURPOSE` unter „Wozu …“ (samt Satz, dass die Bestätigungsseite dieselbe Checkliste nach der Abgabe ohne Angaben
  für die Lösungs-PDF lädt), `CHECK_STAY` unter „Wie lange …“; am Worker (`!PAGES_HOST`, `PUBLIC_HOST` ≠
  `location.host` → `CHECK_HOST`) heißt sie dort „die Checklisten-Seite (Host)“ statt „diese Seite“, und die Empfänger nennen
  `CHECK_GITHUB_ITEM` (GitHub nur für die Checklisten-Seite; auf GitHub Pages gilt `GITHUB_ITEM` für alles)), „Feibeitsblatt digital öffnen“
  (`leaveChecklist`: Hash weg, Startseite mit Code, Fokus auf „Weiter“), Fehler `no_checklist`, unbekannter Code, Netz („Erneut
  versuchen“). Sicherung und „Als Vorlage“ tragen die Checkliste nicht mit – das neue Blatt bekommt nach „Code generieren“ einen neuen
  Vorschlag. Tests: Unit lib/ai/worker/qr, Smoke-Schritt „Checkliste“, E2E 7r (Checkliste beim Anlegen, siehe Finale KI-Rückmeldung),
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
  `#t-analog`/`#t-analog-hint` verborgen (`openAnalog` kehrt zurück) – eine Checkliste gibt es trotzdem (beim Anlegen bestätigt, „Checkliste
  bearbeiten“; nur für die Lösungs-PDF); der Lösch-Dialog warnt, dass der Arena-Tunnel dann ins Leere führt. **Der Code steht im öffentlichen Quelltext
  des Raums** (`FEIBEITSBLATT_CODE`): Die Sperre der Startseite ist nur Oberfläche – jede:r kann mit dem Code `GET /api/sheet/:code`,
  `GET /api/sheet/:code/checklist`, `POST /api/feedback` und `POST /api/submit` aufrufen und die Grenzen je Blatt (400 Abgaben/40 MB,
  `sheet_feedback` 600/Tag) ausschöpfen – und mit einer erfundenen Abgabe die **finale KI-Rückmeldung** bekommen, die konkret nennt, was gefehlt
  hat (also Inhalte der Aufträge an die KI, auch wenn sie das Verraten der Lösung verbieten); ebenso ist die bestätigte Checkliste lesbar;
  Gegenmittel: Einträge löschen bzw. neues Blatt und neuen Code im Raum eintragen (README, `#b-esc-hint`).
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
  Abgabe scheitert nie an den Daten aus dem Raum. Die finale KI-Rückmeldung legt der Server getrennt ab (`final_env`, ohne Daten aus dem
  Raum); der Umschlag der Abgabe samt `escape` bleibt, wie er angekommen ist (ein `feedback2` älterer Seiten ersetzt ihn nicht); die Lösungs-PDF der Lehrkraft („Lösungs-PDF herunterladen“)
  enthält bei Escape-Blättern nur die Lösungsseiten (ohne `escPdfPages`). Ablauf-Kasten: letzter Punkt „Lösungen, finale KI-Rückmeldung und Escape-Room-Überblick
  herunterladen“ (ohne KI „Lösungen und Escape-Room-Überblick herunterladen“) + `STEP_LATE`. `#screen-done`: Gesamt-PDF (Download wie sonst höchstens
  die Wartezeit der Lehrkraft gesperrt, ohne Rückmeldung mit der Checkliste) =
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
  bei 409/429 erst später; zweimal 413 → ohne Tippzeiten, dann ohne Fehler-Einzelheiten samt Lehrkraft-Kurzfassung; die finale
  KI-Rückmeldung in D1 als `final_env` entschlüsselt, der Umschlag der Abgabe samt `escape` und `typing` unverändert, Lösungs-PDF der Lehrkraft
  (Rückmeldung aus `finalEnv`) nur mit den Lösungsseiten; `#b-import` folgt
  dem Haken; `ESCAPE_PDF_OUT=<Ordner>` speichert die PDF-Dateien und Bildschirmfotos). Testdaten frei erfunden, `confirm` in Tests eine beliebige
  Ziffernfolge; keine Datei aus einem echten Escape-Room als Fixture.
- **Frontend-Regeln:** Nutzerdaten nur per `textContent`/DOM-APIs, **nie `innerHTML` mit fremden Daten**.
  Einfügesperre in Schichten (`paste`, `drop`/`dragover`, `beforeinput` `insertFrom…`, `typedTooBig`: ein
  `insertText` über 40 Zeichen / mehrere Wörter ab 20 Zeichen / mit Zeilenumbruch gilt als Zwischenablage (Gboard-
  Clips), `insertReplacementText` ≤ 60, Komposition/Diktat ≤ 2000; Sprung-Fallback im `input`). Antwortfelder
  wachsen per `scrollHeight` (ResizeObserver auf `#sheet`); jede Aufgabe `#tasks .task` auf einer zart getönten Fläche `--task-bg`
  ohne Linie (Wunsch der Lehrkraft vom 04.11.2026: Schüler:innen erkannten nicht, welches Antwortfeld zu welcher Aufgabe gehört; Fläche
  um Aufgabenstellung, Material, Videos, Dateien, Antwortfeld, Rechtschreibprüfung und KI-Feedback, abgerundet, `padding` 18/20 px, mobil
  14/12 px; Antwortfeld, Material, Tabelle und LanguageTool-Ergebnis darauf in `--paper2`; vom Ende des Antwortblocks bis zur nächsten Fläche weiter genau eine Zeilenhöhe – Innenabstand
  unten + `margin-top:calc(1.78em - …)`, E2E 2 `gapAfterTask`; mobil
  stehen Größe und „herunterladen“ der Dateiknöpfe in eigener Zeile); im
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
  – gerade nicht möglich)“), „Lösungen mithilfe des KI-Feedbacks überarbeiten“, „Abgeben“, „Lösungen mit finaler KI-Rückmeldung
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
  aber die Seite kennt keinen Empfänger (z. B. weitergeschrieben, nachdem die KI entfernt wurde): Abgabe-Dialog und
  `#submit-hint` sagen `FB2_NO_AI` („Eine finale KI-Rückmeldung gibt es diesmal nicht – ein KI-Dienst ist für dieses Feibeitsblatt gerade
  nicht eingerichtet“), das Kästchen fehlt (`fb2Offer` false), nichts geht an den Server, `#done-fb` bleibt verborgen, die Lösungs-PDF trägt die
  Checkliste (falls bestätigt). `fbBlockedNow()` (für `#fb-fallback` und den Hinweis unter „Abgeben“): `FB_NO_AI` gilt
  nicht mehr, sobald `aiRecipients` gefüllt ist (auch nach `ai_changed` → `renderFeedbackState`); `noAiState` behält den
  Grund für die Abgabe. Als Fehlversuch
  zählt auch ein Lauf, den die Abgabe abbricht oder der nach `ai_busy` mit „zu lang“ bzw. `ai_changed` endet (Meldung
  dann „dieser Versuch wurde nicht gesendet; frühere automatische Versuche hat der bisherige KI-Dienst möglicherweise
  schon erhalten“ statt „es wurde nichts gesendet“). Ohne Feedback: kein Erstversuch, `feedback:null`, `first = final`; bis zur Abgabe
  umkehrbar. **Die finale KI-Rückmeldung gibt es auch ohne erstes Feedback** (Entscheidung der Lehrkraft vom 08.11.2026): der Abgabe-Dialog
  bietet sie per vorausgewähltem Kästchen an, wenn `fb2Offer` es zulässt (nicht bei `FB_QUOTA`/`FB_NO_AI`, nicht ohne Empfänger, nicht zu lang) –
  sonst bleibt es bei „An die KI wird nichts gesendet.“; wer sie abwählt, bekommt die Checkliste in die Lösungs-PDF. Ob ein
  vorausgewähltes, abwählbares Kästchen zu „nur auf freiwilliger Basis“ der Handreichung passt, ist offen (README, „Weiter vom Betreiber zu
  prüfen“). Kommt ein Feedback, während der Dialog offen ist, wird
  nicht abgegeben (Fokus bleibt im Dialog; nach dem Schließen bei beiden Antworten auf `#revise-hint`, beim Bestätigen
  zusätzlich `#submit-status`); scheitert eine Abgabe, die eine Anfrage abgebrochen hat, gibt der `catch` Felder,
  `#fb-btn` und `#fb-status` frei. `S.submitting` (nach dem Bestätigen bis zum `finally`, dort bei einem Fehlschlag
  `renderFeedbackState`): `#fb-btn` gesperrt, `requestFeedback` und `#ed-cancel` brechen vor **und** nach ihrem Dialog ab
  (`submitBusy`, Status „Deine Abgabe wird gerade gesendet – …“ in `#fb-status` bzw. `#submit-status`); im Erfolgszweig
  schließt `closeDlg(null)` (keine Antwort – beim LanguageTool-Dialog nicht „Trifft nicht zu“) einen offenen Dialog vor
  `show("screen-done")` (E2E 7j: `/api/submit` angehalten; dort auch: Nachsehen der Empfänger hinter offenem Abgabe-Dialog,
  erstes Feedback ohne Empfänger nach Weiterschreiben).
  Lehrkraft (`noAiNote`, neutral): „Ohne KI-Feedback zum Überarbeiten abgegeben.“ bzw. „… – das KI-Feedback war nicht möglich (Grund).“
  (alte Abgaben ohne `noAi` = nicht möglich), eine Spalte „Abgegebene Fassung (ohne KI-Feedback zum Überarbeiten)“ (Blatt ohne Auftrag an die KI: „(ohne KI-Feedback)“; `.dmeta` „ohne KI-Feedback zum Überarbeiten“) (`table.cmp.one`); Liste, Legende, Zähler unverändert. Lösungs-PDF: derselbe Satz im Kopf (nicht
  bei `none`); Zwischenstand-PDF „Stand: … KI-Feedback schon erhalten / angefordert, beim Sichern noch nicht erhalten
  (`fbPending`) / bisher nicht geklappt (Grund) / nicht angefordert“, ohne KI-Hinweise bei Blättern ohne KI. E2E 3b, 4
  und 7f (G–P, u. a. Tab zu während der Anfrage, Scheitern hinter dem Dialog, abgebrochene wartende Anfrage, alte
  Abgabe ohne `noAi`; Blatt ohne Auftrag) prüfen Dialoge und Hinweise wörtlich.
- **Rate-Limits** (`rate_limits`, festes Fenster, `rlHit` atomar per Upsert … RETURNING): `door`, `auth`
  10/15 min und `auth_all` 200/h (nur Fehlversuche – richtige Codes/Passwörter gehen **immer** durch, laufende
  Sitzungen ebenso; über dem Limit bremst `requireTeacher` Fehlversuche um 2 s), `lookup_miss` 30/10 min (gültige
  Codes immer), `feedback` 480/h + `feedback_chars` 1 600 000/h je IP (verdoppelt am 08.11.2026, Entscheidung des Betreibers: die finale KI-Rückmeldung kommt nach fast jeder Abgabe, im Schulnetz teilen sich alle eine IP) + `sheet_feedback` 600/Tag je Blatt (je Schüler:in bis zu zwei
  KI-Anfragen: KI-Feedback und finale KI-Rückmeldung, die nach der Abgabe fast immer kommt) (gezählt
  erst, wenn die Anfrage gültig ist und zur KI geht – eine finale Anfrage, die `checkFinal` ablehnt (`final_*`), zählt nie; bei
  BUSY/RATE_LIMIT/TIMEOUT/SERVER/NETWORK/DAILY_LIMIT
  Rückerstattung), `submit` 360/h + `submit_bytes` 60 MB/h (mit Fotos etwa 0,2–0,8 MB je Abgabe – reicht für etwa 75–300 Abgaben je Stunde
  und Netzwerk; nur gültige Abgaben/Erstversuche zu existierenden
  Blättern; je Schüler:in bis zu zwei Aufrufe – Erstversuch und Abgabe –, ohne erstes Feedback einer; ein `feedback2` älterer Seiten und ein
  `final_locked` zählen nie), `checklist` 60/h je IP (KI-Vorschlag der Checkliste – jedes neue Blatt fragt nach „Code generieren“ einmal –, Erstattung wie beim Feedback).
  Je Blatt höchstens 400 Abgaben / 40 MB (Umschläge samt `final_env`). Bucket = Art + gekürzter SHA-256 von IP|Art (mit `SETTINGS_SECRET`
  als Pfeffer), IPv6 vorher auf /64 gekürzt (`ipKey`) – nie Klartext-IPs speichern. Schulnetz = eine IP für viele.
- **Tests:** `npm test` (Unit, `node --test test/unit/*.test.mjs`; Antwortart Foto: `photo.test.mjs` liest den Block PHOTO – Grenzen gegen
  `LIMITS`, `cleanPhoto`, `jpegInfo`/`pdfPhotoOk`, `photoBudget` und ein echter Umschlag mit 1–3 größten Fotos samt 150 KB Text ≤
  `LIMITS.photoEnvelopeBytes` und Body ≤ `bodyBytes`; lib/ai/worker/typing.test für Validierung, Prompt, große Umschläge nur bei Foto-Blättern
  und die Liste nach Bytes – der Test zählt die Zeilen, die D1 liefert; Smoke-Schritt „Antwortart Foto“ gegen echtes D1); `node test/smoke.mjs` (API gegen echten
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
  Einwilligung und ohne die frühere Klammer `TT_HELD` (auch nicht in „Wie lange …?“), eigener Abschnitt vor „Deine Rechte“; nach der Abgabe
  keine gehaltene Nutzlast (siehe Finale KI-Rückmeldung, „Tests“), `FB2_WINDOW_MS` = `REPLACE_WINDOW_MS`), E2E 7l (eigenes Blatt; mit `delay:120` getippt, `insertText` als Wortvorschlag,
  eingecheckt (`TT_KEEP_IN_DRAFT` aus): kein `typing` im Zwischenstand, ein alter Stand mit Tippzeiten wird beim Laden bereinigt
  (`ttDraftStrip`), Text von vor dem Neuladen geht als 255 („ohne Messung“) in die Abgabe; nur mit umgelegtem Schalter Werte je
  Zeichen im Zwischenstand vor und nach dem Feedback samt Neuladen; nie an die KI, Erstversuch/Abgabe aus D1
  entschlüsselt – `openPrivateKey`/`openEnvelope` aus smoke.mjs –, Ablauf-Kasten, 413 → einmal ohne, Lehrkraft-Färbung, „Färbung
  aus“, lange Antworten, nur Weltkarten – auch bei den Schüler:innen ohne `TT_SHORT` und ohne Abschnitt; die finale KI-Rückmeldung in D1
  als `final_env` (entschlüsselt nur `kind`, `v`, `at`, `results` – keine Tippzeiten), der Umschlag der Abgabe samt Tippzeiten unverändert,
  kein `feedback2`-Aufruf von `/api/submit`; Schüler:in 4: Abgabe erst nach 413 ohne Tippzeit-Werte angekommen – `final_env` trotzdem
  gespeichert, die Abgabe bleibt, wie sie angekommen ist; dass nach der Abgabe nichts gehalten wird, prüft nur `typing.test.mjs` über den
  Quelltext) und 7m (Widerspruch: Schalter per Tastatur, Zwischenstand und -PDF, Ersetzen des
  Erstversuchs scheitert erst und wird beim nächsten Öffnen nachgeholt, PDF auf einem anderen Gerät, Zurücknehmen, Ablehnung
  während des Sendens (angehaltenes bzw. scheiterndes `/api/submit`, Farbe), Abgabe `optOut`; Haken auf „Deine Angaben“ bei
  getipptem Stand mit Erstversuch → sofort gespeichert und ersetzt; anderes Gerät ohne Widerspruch; zweiter Tab übernimmt ihn
  sofort; an und aus während einer angehaltenen KI-Anfrage → erste Fassung ohne Werte; ältere Zwischenstand-PDF auf demselben
  Gerät → Widerspruch bleibt; Gruppe in der „ihr“-Form, Neuladen ohne Eingabe, `_tt` aller Felder; Lehrkraft „ohne Messung
  (widersprochen)“ bei Abgaben, Erstversuch und ausgeblendetem älterem Erstversuch; nach der finalen KI-Rückmeldung bleibt `{optOut:true}`
  im Umschlag in D1 (die Rückmeldung liegt getrennt in `final_env`, ohne Tippzeiten); Schüler:in 5: zwei Tabs, der erste gibt ab, der zweite
  widerspricht danach, während die finale Rückmeldung noch aussteht → die Abgabe in D1 bleibt samt Tippzeit-Werten unverändert, `final_env`
  ohne Tippzeiten (Entscheidung des Betreibers vom 08.11.2026, siehe Tippzeit-Messung, „Nach der Abgabe“)); die wörtlichen Hinweise prüfen 1b
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
  `page.route("https://api.languagetool.org/**")`, YouTube/Google per Attrappe (siehe YouTube-Videos: nie echte Anfragen). In der
  Sandbox: echte KI-Anbieter, LanguageTool und YouTube nicht erreichbar, Browser unter `/opt/pw-browsers` – **nie `playwright
  install`**. Passt die Revision dort nicht zu Playwright 1.56.1 (erwartet 1194; am 10.11.2026 lag dort 1243), laufen die Tests nur mit einer
  lokalen Kopie der Konfiguration außerhalb des Repositorys, die `launchOptions.executablePath` auf das vorhandene Chromium setzt (testDir/cwd
  absolut); belegen andere Sitzungen 8787/8790, `E2E_PORT`/`E2E_MOCK_PORT` setzen (env.mjs). Gestartete Server immer beenden. **Finale KI-Rückmeldung in E2E-Tests:** Nach jeder Abgabe mit KI startet sie im Hintergrund
  (vorausgewählt) und sperrt den Download bis zur Wartezeit – in den Tests die Vorgabe 30 s, länger als `expect.timeout` (20 s); der Mock-Modus ist global, eine finale Anfrage kann
  in den Modus eines späteren Schritts oder Tests fallen. Tests, die das nicht prüfen, wählen sie im Abgabe-Dialog ab (`confirmDialog(page, title,
  true, {check: false})` in `helpers.mjs`), warten auf sie oder halten `/api/feedback` per `page.route` an; nach 30 s gedrückte Downloads
  brauchen ein eigenes Timeout bzw. `page.clock`. E2E 7r: siehe Finale KI-Rückmeldung.
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
