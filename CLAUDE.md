# Feibeitsblatt – Hinweise für die Entwicklung

Schreibeditor mit Aufgabencodes (Design wie der Feiditor, aber **ohne** Tippzeit-Messung): Lehrkraft legt Aufgaben +
Aufträge an die KI an (worauf sie beim Feedback achten soll; intern `solution`; Aufgabenstellung und Material formatierbar; Antwort als Textfeld, Tabelle oder Weltkarten-Zuordnung) → Code → Einzel- oder Partner-/Gruppenarbeit → Schüler:innen schreiben (Einfügen gesperrt), LanguageTool-Prüfung, einmal KI-Feedback (freiwillig),
überarbeiten, verschlüsselt abgeben (danach zweite KI-Rückmeldung zur abgegebenen Fassung) → Lehrkräfte-Übersicht (Türcode 1104 + Passwort); Blätter lassen sich als PDF-Datei
sichern und mit neuem Code wieder laden (z. B. für Parallelklassen) oder als analoges Arbeitsblatt mit QR-Code zu einer
Checkliste drucken. Privates, nicht kommerzielles Angebot: verantwortlich ist der Betreiber (fest in `index.html`), keine
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
  `POST /api/feedback` antwortet zusätzlich `aiGenerated` (`true` + `digitalSourceType` IPTC `trainedAlgorithmicMedia`,
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
  nur additiv und idempotent im `SCHEMA`-Array; nachträgliche Spalten wie `stage`/`attempt` per
  `ensureSubmissionColumns` (`PRAGMA table_info` → `ALTER TABLE … ADD COLUMN`, Fehler bei Wettlauf zweier Isolates
  werden durch erneutes Nachsehen abgefangen).
- **Erstversuch ↔ Abgabe:** `POST /api/submit` nimmt `{code, envelope, stage?: "first"|"final", attempt?: 16 Hex}`
  (`validateSubmitMeta`; `first` braucht `attempt`). Der Browser erzeugt je Bearbeitung eine Kennung (`S.attempt`,
  `hexOf(8 Zufallsbytes)`, im Zwischenstand gespeichert) und schickt nach erhaltenem KI-Feedback die erste Fassung +
  Feedback als Erstversuch (`sendFirstAttempt`, payload `stage:"first"`, `answers[].final = null`, `submittedAt:null`;
  scheitert das Senden, wird es beim nächsten Öffnen nachgeholt – `S.firstSent`). Gleiche `attempt` → `UPDATE`
  derselben Zeile (`replaced`), ein Erstversuch überschreibt nie eine Abgabe (`kept:true`); ohne `attempt` wird
  eingefügt. `/sheets` liefert `submissionCount` (nur `final`) und `firstCount`; die Abgabenliste liefert `stage`.
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
  (zusätzlich im `/EmbeddedFiles`-Namensbaum, Info-Titel als UTF-16 `pdfUtf16`). `readDraftPdf` sucht die Kennzeichen
  im Latin-1-String, liest `/Length` (direkt oder Verweis, sonst bis `endstream`) und entpackt `FlateDecode` per
  `DecompressionStream` – neu gespeicherte PDFs bleiben lesbar; `cleanDraft` prüft wie die Eingabefelder (Code,
  Kürzel, Geburtstag per `bdayOf` – ein altes volles Datum wird auf Tag und Monat gekürzt –, Klasse bzw. eine Gruppe per `cleanGroup`, ≤ 30 Antworten, `first`+`feedback` nur gemeinsam, `attempt`). Startseite: `#start-pdf` →
  `#start-pdf-file` → `importDraftPdf` (≤ `PDF_MAX_BYTES` 5 MB, Blatt laden, Aufgabenzahl prüfen, bei neuerem
  lokalen Stand nachfragen) → `S.importDraft` → `openEditor` (importiert, speichert sofort lokal). Dateiname nur
  Code + Zeitstempel, nie Personendaten. Die Datei enthält Antworten lesbar – Hinweistexte dazu nicht entfernen.
  **Bestätigung nach der Abgabe** (`#screen-done`, nur nach HTTP 200 von `/api/submit`): großer grüner Haken
  (`.done-check`, SVG mit `var(--green)`), „Abgabe erfolgreich“, Zeitpunkt, `#done-del` (nur mit Frist: Löschdatum =
  `receivedAt` + `retentionDays` aus der Antwort von `/api/submit`, „oder kurz danach“), dann **ganz oben über der zweiten KI-Rückmeldung**
  Button `#done-pdf` „Lade dir deine Lösungen herunter und speichere sie in deinen Unterlagen zu unserem Unterricht“ und
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
- **Zweite KI-Rückmeldung zur abgegebenen Fassung (nur im Browser, kein eigener Server-Endpunkt):** `submitAll`
  gibt **zuerst** ab (die Abgabe hängt nie von der KI ab), merkt sich in `S.lastSubmission` die Empfänger-ids
  (`recipients`) und ruft danach `requestFinalFeedback()` – nur mit erstem Feedback (`S.feedback`; ohne KI keine
  zweite Rückmeldung, `#done-fb` bleibt verborgen). „Geändert“ entscheidet `fb2Changes(firsts, finals, feedback)`
  genau wie der Server sieht: nur Aufgaben mit Stichpunkten im ersten Feedback und `fbText` (Zeilenumbrüche,
  Steuerzeichen, trim wie `cleanText`) verschieden – derselbe Helfer im Abgabe-Dialog. Nichts geändert → keine Anfrage,
  `feedback2 = {results: erstes Feedback, same: true}`; sonst werden nur geänderte Aufgaben übernommen, für die anderen
  bleibt die erste Rückmeldung (`kept[i]`, Anzeige „Unverändert abgegeben – wie beim ersten Feedback.“, im PDF „gilt auch
  für die abgegebene Fassung“) – nie zwei widersprüchliche Urteile für denselben Text. Zu lang (`fb2TooLong`, wie
  `validateAnswers`) → keine Anfrage, Hinweis. Sonst `POST /api/feedback` mit `{code, answers: final,
  recipients}` (wie das erste: ohne Personendaten, 409 `ai_changed` → nichts gesendet, Hinweis), Lauf-Kennung
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
  7b (eigenes Blatt, wird gelöscht): Aufgabe 1 nur Leerzeichen, Aufgabe 2 überarbeitet → nur Aufgabe 2 neu. `feedback2` bleibt nur im Arbeitsspeicher (nicht beim Server, nicht bei der Lehrkraft). Abgabe-Dialog
  nennt die Empfänger (`recipientSentence`) bzw. „nichts geändert – nichts wird noch einmal gesendet“; Datenschutzhinweis
  und Feedback-Dialog nennen das zweite Senden. Je Schüler:in also bis zu zwei KI-Anfragen → Rate-Limits verdoppelt.
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
  Auftrag an die KI, eine Anfrage je Blatt. **Reihenfolge im Prompt nicht ändern:** erst der je Blatt gleiche Teil
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
  `visibilitychange`, Sekundenzähler in `#fb-wait` (aria-hidden) außerhalb der Live-Region `#fb-status`, Felder nur
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
  andere E-Mail-Adresse**); im Skript nur die gekappte, eingefrorene Kopie `OPERATOR` lesen (E-Mail einfache Form, URL nur
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
  `{retentionDays}`), `privacyShortText` (Kurzfassung: „Verantwortlich ist <Betreiber> – Feibeitsblatt ist ein privates,
  kostenloses Angebot.“, nennt den KI-Dienst), `privacyNoticeDom(p, list, {h, withAi, pages, open, id, group, noBday, site,
  general, flat, summary})` = `details.privfull` „Alle Informationen zum Datenschutz“ mit 9 Abschnitten (`.privh`: Wer ist
  verantwortlich? – Betreiber mit Anschrift und E-Mail, „privates, nicht kommerzielles und kostenloses Angebot – kein Angebot
  einer Schule“, die Lehrkraft liest; Wozu; Rechtsgrundlage als Liste: Bearbeiten/Abgeben/Zwischenstand/Erstversuch/Gruppe
  **und das KI-Feedback** Art. 6 Abs. 1 Buchst. b DSGVO (bewusst keine Einwilligung, keine Altersabfrage), LanguageTool
  Einwilligung Buchst. a (Klick + Bestätigung im Altersdialog, Widerruf), Aufruf/Auslieferung/Missbrauchsschutz Buchst. f
  (Widerspruch), Speichern im Browser § 25 Abs. 2 Nr. 2 TDDDG – Schreibweise „Buchst.“, nie „lit.“; Welche Daten; Wer bekommt;
  Wie lange; Musst du; Entscheidet die KI (nur mit KI); Deine Rechte in drei Absätzen: Rechte samt Art. 21 und Widerruf,
  Kontakt Betreiber per E-Mail (die Lehrkraft liest/löscht die verschlüsselten Abgaben), Beschwerde bei der Aufsichtsbehörde
  mit Anschrift und Link; Angaben `h2`
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
  zu Blättern ohne KI und Gruppen. Fußzeile `#pagefoot`: „Copyright …“ · `a#foot-legal` `href="#impressum"`, `target="_blank"`,
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
  `pdfStreamData(u, x, max)` (gemeinsam mit `readDraftPdf`: Länge direkt oder als Verweis – Verweise einmal je Datei
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
  (`await feibeitsblattPdfKind(u8)`: Kennzeichen `/FbSheet 1`/`/FbDraft 1` oder – ohne Kennzeichen – `kind` einer
  eingebetteten JSON-Datei), lehnt `addPdfFiles` ab; Import und „Als Vorlage verwenden“ lassen sie mit Hinweis weg.
  Abbruch über Zähler: `T.importRun` steigt beim Verlassen der Übersicht (`teacherView`) und beim Abmelden,
  `T.exportRun` beim Abmelden (`importStillWanted`/`exportStillWanted`) – ein Import/Export aus einer früheren Sitzung
  kommt nie in der nächsten an, nach dem Abmelden wird nichts gespeichert. `makeSheetPdf` entfernt eine leere
  letzte Seite und kürzt den Titel in der Fußzeile nach Breite; `pdfWidth` kennt die Breiten der WinAnsi-Sonderzeichen
  (`PDF_W_EXTRA`, im Zweifel breiter) und misst Zeichen außerhalb von WinAnsi wie das gedruckte „?“. Dann `openBuilder(title, rows)` wie „Als Vorlage verwenden“ + Hinweis `#b-import` (bisheriger
  Code, „bekommt einen neuen Code“); „Code generieren“ legt ein neues Blatt an. Meldungen in `#t-import-status`: fremde
  PDF „In dieser PDF-Datei steckt kein Feibeitsblatt.“, Zwischenstand (`/FbDraft 1`) eigene Meldung. `pdfWrap` trennt
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
  Abschlussbildschirm und in der Lösungs-PDF (`S.lastSubmission.kinds`); „→“ druckt die PDF als „->“ (`pdfPlain`). **Lehrkraft:** `answerEditor` je Zeile (`tr._ans`,
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
  `privacyShortText(p, list, withAi, group)`, `privacyNoticeDom(…, {group: true})` nur in `#p-privfull` der Gruppe (Bausteine
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
  dem Rendern kappen (≤ 30 Antworten).
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
  Rückerstattung), `submit` 240/h + `submit_bytes` 60 MB/h (nur gültige Abgaben/Erstversuche zu existierenden
  Blättern; je Schüler:in bis zu zwei Aufrufe), `checklist` 30/h je IP (KI-Vorschlag der Checkliste, Erstattung wie beim Feedback).
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
  (Hinweis mit Schulangaben, `#privfull-ed` nach Weiterschreiben, KI-Kennzeichnung, `#done-del`, Lösungs-PDF mit/ohne XMP
  samt Aufbauprüfung `pdfStructure`), 7i (Kürzen mit Nachfrage, Verlängern, Cron lokal); Unit: `scheduled` auf der
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
