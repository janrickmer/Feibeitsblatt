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
  - Frontend ruft `API + "/api/…"` mit `API = window.FEIBEITSBLATT_API` (kleines Skript ganz oben, Vorgabe `""` =
    gleiche Herkunft). Nur für GitHub Pages o. Ä. die Worker-URL eintragen.
- **API:** JSON, `{ok:true, …}` bzw. `{ok:false, error:"deutsche Meldung", code}`; CORS `*`, keine Cookies, Auth nur
  per `Authorization: Bearer <authKey>`. Öffentlich: `GET /api/sheet/:code` (**nie Musterlösungen**),
  `POST /api/feedback`, `POST /api/submit`. Lehrkraft: `/api/teacher/door`, `/setup`, `/login`, `/password`,
  `/sheets`, `/sheets/:code`, `/sheets/:code/submissions`, `/ai`, `/ai/test` (Pfade unter `/api/teacher`).
  Türcode `env.TEACHER_DOOR_CODE || "1104"`; das Frontend schickt rein numerische Eingaben (4–12 Ziffern) an
  `/door`, Blatt-Codes enthalten immer Buchstaben. `GET …/submissions?after=<id>` liefert seitenweise (≤ 50 bzw.
  ≤ 8 MB je Seite, `next` = letzte id oder `null`); das Frontend schleift über `next`. `GET /api/health` ohne
  Datenbank. KI-Fehler, bei denen Warten hilft (BUSY, RATE_LIMIT, TIMEOUT) → 429 `ai_busy` mit `retryAfter`,
  sonst 502 `ai_error`; ohne `SETTINGS_SECRET` → 503 `server_not_configured`.
- **Codes:** 6 Zeichen aus `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (≥ 1 Buchstabe, ≥ 1 Ziffer), Anzeige `K7Q-M4X`,
  Eingabe normalisieren (Großbuchstaben, nur `A–Z0–9`), Erzeugung mit `crypto.getRandomValues` ohne Modulo-Bias.
- **D1-Schema:** `settings(key, value)` (`teacher` = `{authHash, kdf, publicKey, encPrivateKey}`, `ai`), `sheets`,
  `submissions(id, sheet_code, received_at, envelope)` + Index, `rate_limits`, `ai_gate`, `ai_skip`. Angelegt per
  `CREATE TABLE IF NOT EXISTS` beim ersten Request je Isolate (ein `batch`), keine Migrationen → Schemaänderungen
  nur additiv und idempotent im `SCHEMA`-Array.
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
  **selbst** aus D1 (Aufgaben + Musterlösungen) und den Antworten (`buildFeedbackMessages`; nie `messages` vom
  Browser annehmen, sonst offenes KI-Relay); Daten zwischen `<<<`/`>>>` über `safeData`. Nur Aufgaben mit
  Musterlösung, eine Anfrage je Blatt. `reserveSlot` (`ai_gate`, globaler Mindestabstand je Anbieter),
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
  Rückerstattung), `submit` 120/h + `submit_bytes` 30 MB/h (nur gültige Abgaben zu existierenden Blättern).
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
