# Feibeitsblatt – Hinweise für die Entwicklung

Schreibeditor mit Aufgabencodes (Design wie der Feiditor, aber **ohne** Tippzeit-Messung): Lehrkraft legt Aufgaben +
Musterlösungen an → Code → Schüler:innen schreiben (Einfügen gesperrt), LanguageTool-Prüfung, einmal KI-Feedback,
überarbeiten, verschlüsselt abgeben → Lehrkräfte-Übersicht (Türcode 1104 + Passwort). Oberfläche und Doku deutsch;
Schüler:innen werden geduzt, die Lehrkraft gesiezt; echte Umlaute und typografische Anführungszeichen („…“).

- **Architektur:** `index.html` = ganze Oberfläche in EINER Datei (keine externen Bibliotheken/Fonts).
  `npm run build` (`scripts/build.mjs`) kopiert `index.html` + `_headers` nach `dist/`; der Worker liefert `dist/`
  als Workers Static Assets aus. `wrangler.jsonc`: `run_worker_first: ["/api/*"]`, sonst `env.ASSETS.fetch(request)`;
  D1-Binding `DB` → `feibeitsblatt-db` per Name (kein `database_id`); kein `nodejs_compat`. Worker-Code und
  Konfiguration nie in `dist/`.
  - `worker/index.js`: Routing, D1, Rate-Limits, Lehrkraft-Auth. `worker/lib.js`: Validierung, Codes, Buckets,
    `sealSecret`/`openSecret`. `worker/ai.js`: Anbieter (groq = Vorgabe, openrouter, gemini, cerebras, custom),
    `callAI`, `testKey`, Feedback-Prompt, `reserveSlot` – portiert aus janrickmer/check-des-feind-t-es.
  - Frontend ruft `API + "/api/…"` mit `API = window.FEIBEITSBLATT_API` (kleines Skript ganz oben): `""` = gleiche
    Herkunft auf `*.workers.dev`/localhost, sonst `window.FEIBEITSBLATT_WORKER` (`https://feibeitsblatt.feindt.
    workers.dev`). Die Seite liegt zusätzlich auf GitHub Pages unter `feibeitsblatt.janrickmer.de` (`CNAME`,
    `.nojekyll`, Quelle Branch `main` Ordner `/`): dort gelten keine `_headers`, deshalb steht die CSP auch als
    `<meta http-equiv>` in `index.html` – Worker-Adresse dort (`connect-src`) und im Skript immer zusammen ändern.
- **API:** JSON, `{ok:true, …}` bzw. `{ok:false, error:"deutsche Meldung", code}`; CORS `*`, keine Cookies, Auth nur
  per `Authorization: Bearer <authKey>`. Öffentlich: `GET /api/sheet/:code` (**nie Musterlösungen**),
  `POST /api/feedback`, `POST /api/submit`. Lehrkraft: `/api/teacher/door`, `/setup`, `/login`, `/password`,
  `/sheets`, `/sheets/:code`, `/sheets/:code/submissions`, `/ai`, `/ai/test` (Pfade unter `/api/teacher`).
  Bilder: `POST /api/teacher/sheets/:code/images` (JSON `{task (1-basiert), mode: thumb|inline, data: Base64}` →
  `{image:{id, task, pos, mode, mime, w, h, bytes}}`), öffentlich `GET /api/sheet/:code/images/:id` →
  `{mime, w, h, data: Base64}` mit `Cache-Control: public, max-age=31536000, immutable`; `GET /api/sheet/:code` und
  `GET /api/teacher/sheets/:code` liefern je Aufgabe `images: [{id, mode, w, h, alt}]` (nie Bilddaten) und
  `material` (Absätze aus Läufen, siehe unten) und `files` (PDF-Dateien, siehe unten).
  Türcode `env.TEACHER_DOOR_CODE || "1104"`; das Frontend schickt rein numerische Eingaben (4–12 Ziffern) an
  `/door`, Blatt-Codes enthalten immer Buchstaben. `GET …/submissions?after=<id>` liefert seitenweise (≤ 50 bzw.
  ≤ 8 MB je Seite, `next` = letzte id oder `null`); das Frontend schleift über `next`. `GET /api/health` ohne
  Datenbank. KI-Fehler, bei denen Warten hilft (BUSY, RATE_LIMIT, TIMEOUT) → 429 `ai_busy` mit `retryAfter`,
  sonst 502 `ai_error`; ohne `SETTINGS_SECRET` → 503 `server_not_configured`.
- **Codes:** 6 Zeichen aus `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (≥ 1 Buchstabe, ≥ 1 Ziffer), Anzeige `K7Q-M4X`,
  Eingabe normalisieren (Großbuchstaben, nur `A–Z0–9`), Erzeugung mit `crypto.getRandomValues` ohne Modulo-Bias.
- **D1-Schema:** `settings(key, value)` (`teacher` = `{authHash, kdf, publicKey, encPrivateKey}`, `ai`), `sheets`,
  `submissions(id, sheet_code, received_at, envelope, stage TEXT DEFAULT 'final', attempt TEXT)` + Indizes
  (`sheet_code, id` und `sheet_code, attempt`), `sheet_images(id, sheet_code, task, pos, mode, mime,
  w, h, bytes, data TEXT = Base64, created_at)` + Index (`sheet_code, task, pos`), `rate_limits`, `ai_gate`,
  `ai_skip`. Angelegt per
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
  Lehrkraft-Ansicht: Kürzel `.st-final` (grün) / `.st-first` (orange, `#b85c00`), Legende `#t-subs-legend`,
  Zusammenfassung `subsSummary`; Erstversuche einer Person, die (anders) schon abgegeben hat, werden ausgeblendet
  (`T.subsHidden`, in Lösch-Dialogen mitgezählt); Details: „Erstversuch ohne Überarbeitung – noch nicht abgegeben“,
  Spalte 2 „(noch nicht überarbeitet)“. Screenreader-Text in der Pfeilspalte, nie im Kürzel (Tests lesen die Zellen).
- **Zwischenstand als PDF (ohne Bibliothek):** `makeDraftPdf(d)` baut eine A4-Seite (Helvetica/-Bold, WinAnsi,
  `pdfStr` oktal-maskiert, Breiten aus `PDF_W_REG/BOLD` für den Umbruch) mit orangem Kasten, URI-Link-Annotation
  auf `PUBLIC_URL` (`window.FEIBEITSBLATT_PUBLIC`) und dem Datensatz (`draftRecord()` + `kind:"feibeitsblatt-draft"`,
  `code`, `sheetTitle`, `person`) als UTF-8-JSON in einem `/Type /EmbeddedFile`-Stream mit Kennzeichen `/FbDraft 1`
  (zusätzlich im `/EmbeddedFiles`-Namensbaum, Info-Titel als UTF-16 `pdfUtf16`). `readDraftPdf` sucht die Kennzeichen
  im Latin-1-String, liest `/Length` (direkt oder Verweis, sonst bis `endstream`) und entpackt `FlateDecode` per
  `DecompressionStream` – neu gespeicherte PDFs bleiben lesbar; `cleanDraft` prüft wie die Eingabefelder (Code,
  Kürzel, Datum, Klasse, ≤ 30 Antworten, `first`+`feedback` nur gemeinsam, `attempt`). Startseite: `#start-pdf` →
  `#start-pdf-file` → `importDraftPdf` (≤ `PDF_MAX_BYTES` 5 MB, Blatt laden, Aufgabenzahl prüfen, bei neuerem
  lokalen Stand nachfragen) → `S.importDraft` → `openEditor` (importiert, speichert sofort lokal). Dateiname nur
  Code + Zeitstempel, nie Personendaten. Die Datei enthält Antworten lesbar – Hinweistexte dazu nicht entfernen.
  **Bestätigung nach der Abgabe** (`#screen-done`, nur nach HTTP 200 von `/api/submit`): großer grüner Haken
  (`.done-check`, SVG mit `var(--green)`), „Abgabe erfolgreich“, Button `#done-pdf` „Meine Lösungen als PDF
  herunterladen“ und darunter der Hinweis mit den zwei Gründen (Vorzeigen bei technischen Problemen, Lernen für
  Klausur/Klassenarbeit/Leistungsnachweis). `S.lastSubmission` (Code, Titel, Aufgabentexte, person, answers
  first/final, feedback, receivedAt) bleibt nur im Arbeitsspeicher bis „Neues Feibeitsblatt öffnen“ (`resetStudent`);
  `makeSolutionsPdf` baut mehrseitig mit denselben Bausteinen (`pdfWrap`/`pdfStr`/`latin1`/`pdfUtf16`): je Aufgabe
  Aufgabenstellung, abgegebene Fassung, bei Überarbeitung erste Fassung + KI-Feedback, Fußzeile „Seite n von N“;
  Dateiname `Feibeitsblatt-Loesungen-<Code>-<Datum>.pdf`, ohne Geburtsdatum.
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
  **selbst** aus D1 (Aufgaben, reiner Text des Materials, Musterlösungen) und den Antworten (`buildFeedbackMessages`; nie `messages` vom
  Browser annehmen, sonst offenes KI-Relay); Daten zwischen `<<<`/`>>>` über `safeData`. Nur Aufgaben mit
  Musterlösung, eine Anfrage je Blatt. **Reihenfolge im Prompt nicht ändern:** erst der je Blatt gleiche Teil
  (`### Aufgabe n` mit Aufgabenstellung, Material, Musterlösung), dann alle Antworten (`### Antwort zu Aufgabe n`) –
  so greift das Präfix-Caching (Groq: gecachte Token zählen nicht gegen die Limits); `parseFeedbackPrompt` im Mock
  liest genau dieses Format. **Reserve-KI:** `settings.ai.reserve` = zweiter Eintrag gleicher Form (eigener
  `apiKeyEnc`, `fallbacks`); `PUT /api/teacher/ai` mit `reserve:{…}` bzw. `reserve:null` (ohne `provider` bleibt der
  erste Anbieter unberührt), `POST …/ai/test?which=reserve`; `routeFeedback` versucht erst den ersten Anbieter (mit
  Reserve: `deadlineMs` 60 s), dann die Reserve (eigenes `ai_gate`/`ai_skip` je Anbieter), Gesamtbudget 100 s;
  `GET /api/sheet/:code` liefert `aiRecipients: [{id, label}]` (nur Einträge mit entschlüsselbarem Schlüssel; id =
  Anbieter bzw. `custom:<host>`, label = `recipientLabel` mit Rechtsträger und Sitz) – Datenschutzhinweis **und**
  Bestätigungsdialog der Schüler:innen nennen alle; der Browser schickt `recipients` (ids) mit `POST /api/feedback`,
  der Server nutzt nur diese Einträge und antwortet 409 `ai_changed`, wenn der erste Anbieter nicht darunter ist
  (Browser: `reloadRecipients`, Hinweis, nichts gesendet). Reserve nur bei Codes aus `RESERVE_ON` (Verfügbarkeit, zu
  lang, unbrauchbare Antwort) – nie bei FILTERED/AUTH/CONFIG/PRIVACY_POLICY/REGION/PAYMENT, nie parallel. Gemini
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
  45 s (mit Reserve) und 6 Versuche, Reserve ≤ 40 s/3 Versuche nur bei ≥ 35 s Rest; höchstens 18 D1-Abfragen je
  Aufruf (Unit-Test zählt). Browser (`requestFeedback`): nur bei `ai_busy` automatisch wiederholen – `FB_TRIES` 5,
  `FB_MAX_MS` 4 min, Wartezeit = retryAfter × (1 + 0–30 %) + 0–3 s, ein `setTimeout` auf einen absoluten Zeitpunkt +
  `visibilitychange`, Sekundenzähler in `#fb-wait` (aria-hidden) außerhalb der Live-Region `#fb-status`, Felder nur
  während einer laufenden Anfrage readOnly, vor jedem Versuch `answers` neu lesen (`S.first` = gesendete Fassung),
  `#fb-wait-stop` = Abbruch (1 Fehlversuch), erschöpfter Zyklus = 2 Fehlversuche, `S.fbFails` im Zwischenstand;
  Lauf-Kennung `S.fbRun` + `stopFeedbackRun()` (resetStudent/openEditor) gegen späte Antworten, `api()` nimmt
  `signal`. Mock: `setMode("tpm", null, n)` = n Anfragen je Modell und 5-Minuten-Fenster, `"403flag"` = Moderation.
  `ai_skip` (erschöpfte Modelle), `fallbacks` aus `testKey` beim Speichern/Testen; `reasoning_effort: "low"` für
  gpt-oss; HTTP 413 / „context length“ → anderes Modell (`TOO_LARGE`). Der Prompt verlangt „angesprochen“ nur bei
  zutreffender Wiedergabe; `feedbackAcceptor` verlangt für jede Aufgabe mindestens einen Kernpunkt (sonst nächstes
  Modell). API-Schlüssel at rest **nur** AES-GCM mit `env.SETTINGS_SECRET` – fehlt es, lehnt der Server das
  Speichern ab (503, nie Klartext; `npm run dev` setzt ein festes Entwicklungs-Secret); der Schlüssel verlässt den
  Server nie (nur `keyHint`) und bleibt bei leerem Feld nur für denselben Anbieter + baseUrl erhalten. Schüler:innen
  sehen nur `PUBLIC_MSG`, Details nur `/api/teacher/ai/test`. `custom`-baseUrl `http://` nur für
  `127.0.0.1`/`localhost`.
- **LanguageTool:** direkt aus dem Browser, nur auf Klick (Nutzungsbedingungen: keine automatisierten Anfragen).
  Altersgrenze (DSGVO/Anbieter): Button nur, wenn `ageOf(geburtsdatum) >= LT_MIN_AGE` (16, `S.ltAllowed`), sonst
  statt des Buttons der Hinweis `.lt-off`; vor der ersten Prüfung je geöffnetem Blatt ein Bestätigungsdialog
  (`ltConsent`, `S.ltConsent`, `safeFirst`) – ohne Bestätigung wird nichts gesendet; beides in `resetStudent`
  zurücksetzen.
  `POST https://api.languagetool.org/v2/check`, Body `URLSearchParams`, **keine eigenen Header** (simple request,
  kein Preflight), `credentials:"omit"`, `referrerPolicy:"no-referrer"`; `language=de-DE`, `disabledCategories`
  (Stil u. a.), `enabledRules=GERMAN_WORD_REPEAT_RULE`; kein `preferredVariants`/`enabledOnly`/`level`. Offsets =
  UTF-16 = JS-Indizes; Ergebnis verwerfen, wenn sich der Text geändert hat. Nur Rechtschreibung, Grammatik,
  Groß-/Klein, Getrennt-/Zusammen, Zeichensetzung anwenden – nie Stil/Typografie/`Hint`. ≤ 20 000 UTF-8-Bytes.
  Sichtbarer Link auf https://languagetool.org ohne `rel="nofollow"` (Pflicht). Nicht über den Worker leiten
  (gemeinsame Cloudflare-IPs → ein Limit für alle). CSP `connect-src` muss `https://api.languagetool.org` erlauben.
- **Bilder zu Aufgaben:** höchstens `LIMITS.imagesPerTask` (5) je Aufgabe, `imageBytes` 500 KB je Bild,
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
- **PDF-Dateien zu Aufgaben (Material zum Herunterladen):** je Aufgabe ≤ `LIMITS.filesPerTask` (3) PDF-Dateien, `fileBytes`
  6 MB je Datei, `sheetFileBytes` 20 MB je Blatt, Name ≤ `fileName` 120 Zeichen (`cleanFileName`: `cleanText`, NFC,
  Nullbreite-Zeichen weg, `\/:*?"<>|` → `-`, endet auf `.pdf`, leer → „Datei.pdf“). Tabelle `sheet_files(id, n,
  sheet_code, task, pos, name, mime, bytes, chunks, created_at, data TEXT = Base64, PRIMARY KEY(id, n))` + Index
  `(sheet_code, n, task, pos)`: **eine Zeile je Teil** (`fileChunk` 512 KB roh ≈ 683 KB Base64, Body ≤ 1 MB, D1-Zeile
  ≤ 1 MB), Teil 0 trägt die Metadaten und muss mit `%PDF-` beginnen (`validateFileUpload`: Größe, `chunks ===
  ceil(bytes/fileChunk)`, Teil-Länge exakt, `strictB64`). `POST /api/teacher/sheets/:code/files` JSON `{id (16 Hex,
  vom Browser), task, name, bytes, chunks, n, data}`: n = 0 → bedingter `INSERT … SELECT … RETURNING pos` (Blatt,
  Aufgabe, Anzahl je Aufgabe, Summe je Blatt atomar; Wiederholung → `existing:true`; Fehler `too_many_files`, 413
  `too_large`), n > 0 → `INSERT OR IGNORE … SELECT … FROM sheet_files WHERE id AND n=0 AND sheet_code AND task AND
  bytes AND chunks>n` (ohne Teil 0 → 400); Antwort `file:{…, complete}`. Listen (`filesStmt`, nur `n=0`, Spalten vor
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
  `addPdfFiles` prüft Größe und Kennung `%PDF-` (`f.slice(0,5).text()`), `renderFiles` (`.bfile`); `b-gen` sammelt
  `uploads` mit `kind:"image"|"file"` und `T.uploadKinds`, `runUploads` lädt Dateien in Teilen (`u.part` = nächster
  Teil bei Wiederholung, Status „(Teil n von N)“), Erfolgstexte: nur Bilder „Alle N Bilder sind gespeichert.“, nur
  PDFs „Alle N PDF-Dateien sind gespeichert.“, gemischt „2 Bilder und 1 PDF-Datei sind gespeichert.“;
  `PERMANENT_CODES` + `too_many_files`/`bad_file`; „Als Vorlage verwenden“ lädt die Dateien per `loadFile` und
  wieder hoch. Dateien sind unverschlüsselt (Lehrkraft-Inhalte) und gehen nie an die KI; `DELETE` des Blattes
  löscht sie mit. E2E-Hilfe: `PDF_BUF` (600 KB → 2 Teile), `S.pdf`; `helpers.mjs` zeichnet `query` je API-Aufruf auf.
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
- **Frontend-Regeln:** Nutzerdaten nur per `textContent`/DOM-APIs, **nie `innerHTML` mit fremden Daten**.
  Einfügesperre in Schichten (`paste`, `drop`/`dragover`, `beforeinput` `insertFrom…`, `typedTooBig`: ein
  `insertText` über 40 Zeichen / mehrere Wörter ab 20 Zeichen / mit Zeilenumbruch gilt als Zwischenablage (Gboard-
  Clips), `insertReplacementText` ≤ 60, Komposition/Diktat ≤ 2000; Sprung-Fallback im `input`). Antwortfelder
  wachsen per `scrollHeight` (ResizeObserver auf `#sheet`); eine Leerzeile Abstand zur nächsten Aufgabe; im
  Schreibmodus scrollt nur `.paperwrap`, nichts liegt über der Schreibfläche. Abgeben erst nach dem (einmaligen)
  KI-Feedback – **außer** die KI ist nicht eingerichtet oder zweimal hintereinander ausgefallen: dann
  `S.fbUnavailable`, Abgabe mit `feedback:null`, `feedbackError`, `first = final`; die Lehrkraft-Ansicht zeigt
  „Ohne KI-Feedback abgegeben“. Zwischenstand in `localStorage` unter `feibeitsblatt:draft:<SHA-256>` (Schlüssel
  ohne Klartext-Angaben; 7 Tage), `feibeitsblatt:last` für „Weiterschreiben?“ auf der Startseite, „Abbrechen und
  Zwischenstand löschen“ in der Topbar; alle Zugriffe in try/catch, nach Abgabe löschen. Lehrkraft: Abmeldung nach
  20 min ohne Eingabe; Abgaben-Listen seitenweise laden; fremde Payloads vor dem Rendern kappen (≤ 30 Antworten).
- **Rate-Limits** (`rate_limits`, festes Fenster, `rlHit` atomar per Upsert … RETURNING): `door`, `auth`
  10/15 min und `auth_all` 200/h (nur Fehlversuche – richtige Codes/Passwörter gehen **immer** durch, laufende
  Sitzungen ebenso; über dem Limit bremst `requireTeacher` Fehlversuche um 2 s), `lookup_miss` 30/10 min (gültige
  Codes immer), `feedback` 120/h + `feedback_chars` 400 000/h je IP + `sheet_feedback` 300/Tag je Blatt (gezählt
  erst, wenn die Anfrage gültig ist und zur KI geht; bei BUSY/RATE_LIMIT/TIMEOUT/SERVER/NETWORK/DAILY_LIMIT
  Rückerstattung), `submit` 240/h + `submit_bytes` 60 MB/h (nur gültige Abgaben/Erstversuche zu existierenden
  Blättern; je Schüler:in bis zu zwei Aufrufe).
  Je Blatt höchstens 400 Abgaben / 40 MB. Bucket = Art + gekürzter SHA-256 von IP|Art (mit `SETTINGS_SECRET`
  als Pfeffer), IPv6 vorher auf /64 gekürzt (`ipKey`) – nie Klartext-IPs speichern. Schulnetz = eine IP für viele.
- **Tests:** `npm test` (Unit, `node --test test/unit/*.test.mjs`); `node test/smoke.mjs` (API gegen echten
  `wrangler dev --local` + `test/mock-ai.mjs`, Ports 8811/8812); `npm run test:e2e` (Playwright 1.56.1, Ports
  8787/8790, frischer Zustand je Lauf – nicht parallel zu `npm run dev`).
  Lokal: `npx wrangler dev --local --ip 127.0.0.1 --port <p> --persist-to <dir> --show-interactive-dev-session=false`.
  KI im Test: Anbieter `custom`, baseUrl `http://127.0.0.1:<port>/v1` (Mock); LanguageTool per
  `page.route("https://api.languagetool.org/**")`. In der Sandbox: echte KI-Anbieter und LanguageTool nicht
  erreichbar, Browser unter `/opt/pw-browsers` – **nie `playwright install`**. Gestartete Server immer beenden.
- **Deployment:** `.github/workflows/deploy.yml` (push auf `main` + `workflow_dispatch`): ohne Secret
  `CLOUDFLARE_API_TOKEN` nur Hinweis (CI bleibt grün). Sonst `npm ci` → `npm test` → `npm run build` →
  workers.dev-Subdomain sicherstellen → D1 `--jurisdiction eu` anlegen, falls nicht vorhanden (Ort nur beim
  Anlegen wählbar – deshalb **nie `wrangler deploy` von Hand vor dem ersten Workflow-Lauf**) → `npx wrangler
  deploy` → `SETTINGS_SECRET` einmalig erzeugen (**nie überschreiben**: sonst ist der gespeicherte KI-Schlüssel
  unlesbar; ist die Secret-Liste nicht abrufbar, schlägt der Schritt fehl). Das Cloudflare-Token nur als Step-`env`
  der Schritte, die es brauchen (nie bei `npm ci`/`npm test`); Actions per Commit-SHA gepinnt. wrangler `4.145.0`
  exakt gepinnt (package.json/package-lock.json). Token: Vorlage „Edit Cloudflare Workers“ + „Konto → D1 →
  Bearbeiten“. Der Workflow läuft nur für `main` – existiert der Branch nicht, muss die Lehrkraft ihn anlegen
  (README Schritt 5).
- **Öffentlich:** README, diese Datei und der ganze Code sind öffentlich – keine Schlüssel, Tokens, Passwörter
  oder echten Schülerdaten (auch nicht in Tests). Der Türcode 1104 ist absichtlich öffentlich; geschützt wird
  alles durch das Passwort. Nie API-Schlüssel oder Schülertexte loggen.
