# Feibeitsblatt

Feibeitsblatt ist ein Schreibeditor für Arbeitsblätter im Stil des Feiditors. Sie als Lehrkraft legen Aufgaben
mit Musterlösungen an und erhalten dafür einen kurzen Code. Mit diesem Code öffnen die Schüler:innen das
Arbeitsblatt, tippen ihre Antworten selbst (Einfügen ist gesperrt), lassen Rechtschreibung und Grammatik prüfen,
holen sich einmal ein KI-Feedback zum Inhalt, überarbeiten ihre Antworten und geben ab. In der
Lehrkräfte-Übersicht sehen Sie alle Abgaben – die erste Fassung und die überarbeitete Fassung nebeneinander.
Anders als im Feiditor werden keine Tippzeiten gemessen.

Technisch besteht Feibeitsblatt aus einer Webseite (`index.html`) und einem kleinen Server (Cloudflare Worker mit
einer D1-Datenbank in der EU), beides im kostenlosen Tarif von Cloudflare. Die Abgaben werden schon im Browser der
Schüler:innen verschlüsselt; lesen können Sie sie nur mit Ihrem Passwort.

**Inhalt**

- [So arbeiten Schüler:innen](#so-arbeiten-schülerinnen)
- [So arbeiten Sie als Lehrkraft](#so-arbeiten-sie-als-lehrkraft)
- [Einrichtung (einmalig)](#einrichtung-einmalig)
- [KI-Anbieter](#ki-anbieter)
- [Sicherheit](#sicherheit)
- [Datenschutz](#datenschutz)
- [Kapazität und Grenzen](#kapazität-und-grenzen)
- [Häufige Probleme](#häufige-probleme)
- [Optional: GitHub Pages oder eigene Domain](#optional-github-pages-oder-eigene-domain)
- [Entwicklung](#entwicklung)

## So arbeiten Schüler:innen

1. **Code eingeben.** Die Seite öffnen und den Code der Lehrkraft eintragen, z. B. `K7Q-M4X`. Groß- und
   Kleinschreibung, Leerzeichen und Bindestrich spielen keine Rolle. Codes haben sechs Zeichen und enthalten nie
   die leicht verwechselbaren Zeichen I, L, O, 0 und 1.
2. **Angaben machen.** Die ersten drei Buchstaben des Vornamens (bei einem kürzeren Vornamen den ganzen
   Vornamen), die ersten zwei Buchstaben des Nachnamens, das Geburtsdatum und die Klasse (z. B. „8b“). Dann
   „Schreibbereich öffnen“.
3. **Schreiben.** Die Arbeitsaufträge stehen untereinander. Unter jedem steht ein Textfeld, das mit dem Text
   wächst; alles Folgende rückt dabei nach unten. Zwischen einem Antwortfeld und der nächsten Aufgabe bleibt eine
   leere Zeile Abstand. Einfügen aus der Zwischenablage und Hineinziehen von Text sind gesperrt – es darf nur
   selbst getippt werden. Autokorrektur und Diktierfunktion der Tastatur bleiben möglich. Der Zwischenstand wird
   laufend auf dem Gerät gespeichert („Zwischenstand auf diesem Gerät gespeichert“). Wird die Seite neu geladen
   oder versehentlich geschlossen, bietet die Startseite an, mit den gespeicherten Angaben weiterzuschreiben
   („Weiterschreiben“); mit „Abbrechen und Zwischenstand von diesem Gerät löschen“ oben rechts lässt sich ein
   Zwischenstand auch bewusst entfernen (wichtig auf geteilten Geräten).
4. **Rechtschreibung und Grammatik prüfen.** Unter jedem Antwortfeld gibt es diesen kleinen Button. Er schickt nur
   den Text dieser einen Antwort an den Prüfdienst LanguageTool. Darunter erscheint in kleiner Schrift der Text mit
   korrigierter Rechtschreibung, Grammatik, Groß- und Kleinschreibung, Getrennt- und Zusammenschreibung und
   Zeichensetzung; die Änderungen sind markiert. Inhalt und Stil werden nie verändert. Ein ausgegrauter Hinweis
   erklärt, dass dies die Antwort einer KI ist, die selbst Fehler machen kann, und dass sie nur zum Überarbeiten
   des eigenen Textes dient. Das Antwortfeld selbst bleibt unverändert – Verbesserungen tippen die Schüler:innen
   selbst ein.
5. **KI um ein Feedback bitten.** Am Ende des Blattes. Der Server vergleicht die Antworten mit Ihrer Musterlösung.
   Je Aufgabe erscheint in Stichpunkten in **grüner** Schrift, welche Punkte der Musterlösung richtig angesprochen
   wurden, und in **roter** Schrift, welche noch fehlen (dazu zählen auch falsch wiedergegebene Punkte). Das
   Feedback gibt es **nur einmal**; die Antworten zu diesem Zeitpunkt werden als „erste Fassung“ festgehalten.
   Unter dem Button steht klein und ausgegraut, welche Daten dabei wohin gehen (siehe
   [Datenschutz](#datenschutz)).
6. **Überarbeiten und abgeben.** Nach dem Feedback folgt der Hinweis, die Antworten zu überarbeiten. Der Button
   „Abgeben“ ist bis dahin ausgegraut. Nach einer Rückfrage wird die Abgabe im Browser verschlüsselt und gesendet:
   erste Fassung, überarbeitete Fassung und das KI-Feedback. Zum Schluss erscheint „Deine Lösung ist bei deiner
   Lehrkraft angekommen.“ mit dem Zeitpunkt. Der Zwischenstand auf dem Gerät wird dann gelöscht.

> **Wichtig:** Abgeben ist normalerweise erst nach dem KI-Feedback möglich. Richten Sie deshalb die
> [KI-Einstellungen](#schritt-8-ki-feedback-einrichten) ein und testen Sie das Blatt einmal selbst, bevor Sie den
> Code an die Klasse geben. **Niemand sitzt fest:** Ist das KI-Feedback nicht eingerichtet oder schlägt es zweimal
> hintereinander fehl (Kontingent erschöpft, Anbieter gestört), wird „Abgeben“ trotzdem freigeschaltet. Die
> Abgabe enthält dann nur die aktuelle Fassung, und Sie sehen in der Übersicht den Hinweis „Ohne KI-Feedback
> abgegeben“. Hat kein Arbeitsauftrag eine Musterlösung, ist gar keine KI nötig.

Die Einfügesperre verhindert das übliche Einfügen (Tastenkürzel, Kontextmenü, Ziehen mit der Maus, größere
Einfügungen aus der Zwischenablage einer Handy- oder Tablet-Tastatur). Kurze Stücke von wenigen Wörtern lassen sich
technisch nicht von Tippen oder Wortvorschlägen unterscheiden und gehen durch; wer technisch versiert ist, kann
eine Sperre im Browser grundsätzlich umgehen. Die Sperre ersetzt keine Aufsicht.

## So arbeiten Sie als Lehrkraft

1. **Lehrkräfte-Zugang öffnen.** Auf der Startseite statt eines Codes `1104` eingeben und „Weiter“ klicken.
2. **Passwort.** Beim allerersten Mal legen Sie Ihr Passwort fest (mindestens 10 Zeichen, siehe
   [Schritt 7](#schritt-7-sofort-das-passwort-festlegen)). Danach melden Sie sich jedes Mal mit diesem Passwort an.
   Die Anmeldung gilt nur, solange die Seite geöffnet ist; nach dem Neuladen oder nach 20 Minuten ohne Eingabe
   melden Sie sich erneut an. An gemeinsam genutzten Rechnern bitte „Abmelden“ klicken.
3. **Neues Feibeitsblatt erstellen.** Oben in der Lehrkräfte-Übersicht. Sie tragen einen Titel ein (leer bleibt
   „Feibeitsblatt vom TT.MM.JJJJ“) und füllen eine Tabelle: Spalte 1 „Aufgabenstellung“, Spalte 2 „Musterlösung“.
   Den Wortlaut der Musterlösung sehen die Schüler:innen nicht; ihre Kernpunkte erscheinen aber als Stichpunkte im
   KI-Feedback (grün: angesprochen, rot: fehlt). Verwenden Sie deshalb keine Musterlösung, die geheim bleiben
   muss (z. B. für eine Klassenarbeit). Schreiben Sie sie am besten in Stichpunkten, ein Kernpunkt je Zeile
   (höchstens etwa 12 Punkte je Aufgabe). Hier dürfen Sie Text einfügen. Zeilen lassen sich hinzufügen, entfernen
   und verschieben (1 bis 30 Aufgaben). Eine Aufgabe ohne Musterlösung bekommt kein KI-Feedback, sondern den
   Hinweis „Zu dieser Aufgabe gibt es keine Musterlösung.“
4. **Code generieren.** Der Code erscheint groß (z. B. `K7Q-M4X`) mit „Kopieren“. Geben Sie ihn an die Klasse
   weiter. Ein erstelltes Feibeitsblatt lässt sich nicht mehr ändern; für eine geänderte Fassung wählen Sie es aus
   und klicken „Als Vorlage für ein neues Feibeitsblatt verwenden“ – das ergibt einen neuen Code.
5. **Abgaben ansehen.** Die Tabelle der Feibeitsblätter zeigt Titel, Code, Datum und die Zahl der Aufgaben und
   Abgaben. Ein Klick wählt ein Blatt aus. Die Abgaben erscheinen eingeklappt mit den Spalten „Kürzel Nachname“,
   „Kürzel Vorname“, „Geburtstag“ und „Klasse“, sortiert nach Klasse und Namen. Aufgeklappt sehen Sie je Aufgabe
   eine Tabelle mit Spalte 1 „Erste Eingabe (vor dem KI-Feedback)“ und Spalte 2 „Eingabe nach dem KI-Feedback“,
   darunter klein das KI-Feedback, das die Schülerin bzw. der Schüler gesehen hat. Abgaben ohne KI-Feedback
   (siehe oben) sind entsprechend gekennzeichnet. „Alle aufklappen“ öffnet alle Zeilen, „Aktualisieren“ lädt neu
   eingegangene Abgaben. Entschlüsselt wird ausschließlich in Ihrem Browser. Beachten Sie: Kürzel, Geburtsdatum,
   Klasse und „erste Fassung“ sind Angaben der Schüler:innen selbst – der Server prüft sie nicht, und abgeben
   kann jede Person, die den Code kennt.
6. **Löschen.** Ganz unten: „Alle Abgaben dieses Feibeitsblattes löschen“ (mit Rückfrage und Anzahl). Ohne diesen
   Klick bleiben die Abgaben verschlüsselt gespeichert. Darunter: „Feibeitsblatt selbst löschen (Code wird
   ungültig)“ – das löscht das Blatt und alle Abgaben dazu.
7. **Weitere Schaltflächen** oben: „KI-Einstellungen“, „Passwort ändern“ (die Abgaben bleiben lesbar) und
   „Abmelden“.

## Einrichtung (einmalig)

Sie brauchen dieses Repository in Ihrem GitHub-Konto und ein kostenloses Cloudflare-Konto. Alles Weitere erledigt
der GitHub-Workflow „Deploy“ automatisch. Die Bezeichnungen in den Oberflächen von Cloudflare und GitHub können
sich ändern und sind teils nur auf Englisch verfügbar; die englischen Namen stehen jeweils dabei.

### Schritt 0: Repository übernehmen

Liegt das Repository noch nicht in Ihrem eigenen GitHub-Konto: auf der Repository-Seite „Use this template“ →
„Create a new repository“ (oder „Fork“) wählen. Bei einem Fork sind GitHub Actions zunächst abgeschaltet – einmal
den Reiter „Actions“ öffnen und die Workflows aktivieren („I understand my workflows, go ahead and enable them“).

### Schritt 1: Cloudflare-Konto anlegen

1. <https://dash.cloudflare.com/sign-up> öffnen und ein Konto anlegen; der kostenlose Tarif („Free“) genügt.
2. E-Mail-Adresse bestätigen.
3. Empfohlen: Zwei-Faktor-Anmeldung einschalten (Profil → Authentifizierung / „Authentication“). Wer das
   Cloudflare-Konto übernimmt, kontrolliert auch die Seite.

### Schritt 2: API-Token erstellen

Der Workflow braucht einen Schlüssel („API-Token“), mit dem er in Ihrem Namen veröffentlichen darf.

1. Im Cloudflare-Dashboard oben rechts auf das Profilsymbol → „Profil“ / „My Profile“ → „API-Token“ /
   „API Tokens“ → „Token erstellen“ / „Create Token“.
2. Bei der Vorlage **„Edit Cloudflare Workers“** auf „Vorlage verwenden“ / „Use template“ klicken.
3. Unter „Berechtigungen“ / „Permissions“ eine Zeile hinzufügen: **Konto → D1 → Bearbeiten**
   („Account → D1 → Edit“). Die Vorlage allein enthält D1 nicht; ohne diese Zeile kann der Workflow die Datenbank
   nicht anlegen.
4. Unter „Kontoressourcen“ / „Account Resources“ Ihr Konto auswählen. Unter „Zonenressourcen“ / „Zone
   Resources“ „Alle Zonen“ / „All zones“ (bzw. „All zones from an account“) wählen – das geht auch ohne eigene
   Domain.
5. „Weiter zur Zusammenfassung“ / „Continue to summary“ → „Token erstellen“ / „Create Token“.
6. Den angezeigten Token sofort kopieren – er wird nur einmal angezeigt. Er ist ein Geheimnis: nirgends
   veröffentlichen, nicht per E-Mail verschicken.

### Schritt 3: Konto-ID notieren

Die Konto-ID („Account ID“) ist eine 32-stellige Zeichenfolge aus Ziffern und Buchstaben a–f. Sie steht nach
der Anmeldung in der Adresszeile des Browsers direkt nach `https://dash.cloudflare.com/`; je nach Version des
Dashboards zusätzlich unter „Workers & Pages“ in der rechten Spalte („Account ID“).

### Schritt 4: Secrets in GitHub hinterlegen

1. Im GitHub-Repository: „Settings“ → „Secrets and variables“ → „Actions“ → „New repository secret“.
2. Name `CLOUDFLARE_API_TOKEN`, Wert: der Token aus Schritt 2 → „Add secret“.
3. Name `CLOUDFLARE_ACCOUNT_ID`, Wert: die Konto-ID aus Schritt 3 → „Add secret“.
   (Fehlt dieses Secret, nimmt der Workflow das erste Konto, auf das der Token zugreifen darf.)

### Schritt 5: Veröffentlichen

Der Workflow „Deploy“ startet automatisch bei jeder Änderung im Branch `main`. Gibt es in Ihrem Repository noch
keinen Branch `main` (der Code liegt z. B. nur in einem Branch `claude/…`): auf GitHub „Branches“ → „New branch“,
Name `main`, Quelle der vorhandene Branch – das startet den Workflow bereits. Danach unter „Settings“ → „General“
→ „Default branch“ `main` als Standard-Branch festlegen. Von Hand starten: „Actions“ → „Deploy“ → „Run
workflow“ (der Button erscheint, sobald die Workflow-Datei im Standard-Branch liegt).

Was der Workflow dabei tut:

1. Ist `CLOUDFLARE_API_TOKEN` nicht gesetzt, überspringt er das Veröffentlichen mit einem Hinweis (kein Fehler).
2. Er installiert die festgelegten Werkzeuge (wrangler 4.145.0), führt die Unit-Tests aus und baut die Seite. Das
   Cloudflare-Token bekommen nur die Schritte, die es brauchen.
3. Er stellt sicher, dass Ihr Konto eine **workers.dev-Subdomain** hat. Neue Konten haben noch keine; dann legt
   er `feibeitsblatt-<Ihr GitHub-Name>` an. Eine vorhandene Subdomain wird nie umbenannt.
4. Er legt die Datenbank `feibeitsblatt-db` an, **in der EU** (`--jurisdiction eu`), falls es sie noch nicht
   gibt. Der Speicherort lässt sich nur beim Anlegen festlegen, später nicht mehr ändern. Die Tabellen legt der
   Server beim ersten Aufruf selbst an.
5. Er veröffentlicht den Worker samt Seite (`wrangler deploy`).
6. Er erzeugt einmalig das Worker-Secret `SETTINGS_SECRET` (32 Zufallsbytes), mit dem der Server Ihren
   KI-API-Schlüssel verschlüsselt speichert. Ein vorhandenes Secret wird nie überschrieben; lässt sich nicht
   feststellen, ob es existiert, bricht der Workflow mit einer Fehlermeldung ab (dann einfach erneut starten).
7. Er gibt die Adresse der Seite aus.

Spätere Veröffentlichungen (z. B. nach einem Update) lassen Datenbank, Passwort, Feibeitsblätter und Abgaben
unverändert.

**Nie vor dem ersten Workflow-Lauf von Hand `wrangler deploy` ausführen:** wrangler würde die Datenbank dann
selbst anlegen – ohne EU-Festlegung, und das lässt sich später nicht ändern. Kontrolle: Im Cloudflare-Dashboard
unter „Storage & Databases“ → „D1“ → `feibeitsblatt-db` muss als Ort/Jurisdiktion „EU“ stehen.

### Schritt 6: Adresse finden

Die Adresse lautet `https://feibeitsblatt.<subdomain>.workers.dev`. Sie finden sie

- im abgeschlossenen Workflow-Lauf („Actions“ → letzter Lauf von „Deploy“) als Hinweis „Feibeitsblatt ist
  online“, oder
- im Cloudflare-Dashboard unter „Workers & Pages“ → `feibeitsblatt`.

Beispiel: Heißt Ihr GitHub-Konto `janrickmer` und hatte Ihr Cloudflare-Konto noch keine Subdomain, lautet die
Adresse `https://feibeitsblatt.feibeitsblatt-janrickmer.workers.dev`. Lädt die Seite nicht sofort, einige Minuten
warten und neu laden.

### Schritt 7: Sofort das Passwort festlegen

1. Die Adresse sofort öffnen.
2. `1104` eingeben → „Weiter“.
3. Unter „Passwort festlegen“ zweimal dasselbe Passwort eintragen (mindestens 10 Zeichen; am besten ein langer
   Satz, den Sie nirgends sonst verwenden) und bestätigen. Die Seite erzeugt dabei Ihre Schlüssel; das dauert
   einige Sekunden.
4. Das Passwort sicher aufbewahren (z. B. im Passwortmanager). **Ein vergessenes Passwort kann niemand
   wiederherstellen** – ohne das Passwort sind alle Abgaben unlesbar.

**Warum sofort?** Der Code 1104 steht öffentlich in dieser Anleitung und im Quelltext. Solange noch kein Passwort
festgelegt ist, kann jede Person, die die Adresse kennt, mit 1104 das Passwort festlegen und damit die
Lehrkräfte-Übersicht übernehmen. Ist das passiert, setzen Sie den Zugang wie unter
[Passwort vergessen oder Zugang zurücksetzen](#passwort-vergessen-oder-zugang-zurücksetzen) beschrieben zurück.

### Schritt 8: KI-Feedback einrichten

1. In der Lehrkräfte-Übersicht auf „KI-Einstellungen“ klicken.
2. Anbieter wählen. **Für Klassen empfohlen: Groq** (Vorgabe) – siehe [KI-Anbieter](#ki-anbieter).
3. Beim Anbieter einen kostenlosen API-Schlüssel erstellen (Groq: <https://console.groq.com/keys>) und in das Feld
   „API-Schlüssel“ einfügen. Das Feld „Modell“ leer lassen (dann wählt der Server das Vorgabemodell).
4. „Speichern“ klicken. Der Server prüft den Schlüssel, ermittelt die verfügbaren Modelle und merkt sich die
   besten als Ausweichmodelle. Klappt die Prüfung nicht, wird trotzdem gespeichert und ein Hinweis angezeigt.
5. „Verbindung testen“ klicken. Erscheint eine kurze Beispielantwort, funktioniert das KI-Feedback.

Der Schlüssel wird nur auf dem Server gespeichert (verschlüsselt mit `SETTINGS_SECRET`; ohne dieses Secret lehnt
der Server das Speichern ab) und nie an die Browser der Schüler:innen übertragen. In den Einstellungen sehen Sie
nur die letzten vier Zeichen („gespeichert: …abcd“). Ein neuer Schlüssel ersetzt den alten; ein leeres
Schlüsselfeld lässt den gespeicherten unverändert – aber nur für denselben Anbieter und dieselbe Adresse. Wechseln
Sie den Anbieter oder die Basis-URL, verlangt die Seite einen neuen Schlüssel; der alte wird nie an einen anderen
Dienst geschickt.

### Schritt 9: Das erste Feibeitsblatt

1. „Neues Feibeitsblatt erstellen“ → Titel, Aufgaben und Musterlösungen eintragen → „Code generieren“.
2. Den Code in einem privaten Browserfenster (oder auf einem zweiten Gerät) selbst als Schüler:in ausprobieren:
   Angaben, Schreiben, Rechtschreibprüfung, KI-Feedback, Abgeben.
3. Zurück in der Lehrkräfte-Übersicht das Blatt auswählen, „Aktualisieren“ klicken und die Testabgabe aufklappen.
4. Die Testabgabe mit „Alle Abgaben dieses Feibeitsblattes löschen“ entfernen und den Code an die Klasse geben.

## KI-Anbieter

Das KI-Feedback läuft über Ihren eigenen API-Schlüssel bei einem Anbieter Ihrer Wahl. Je Schülerin bzw. Schüler
und Feibeitsblatt stellt der Server in der Regel **eine** Anfrage mit allen Aufgaben, die eine Musterlösung haben;
bei Überlastung oder unbrauchbaren Antworten können daraus bis zu acht Versuche werden, und Schüler:innen können
nach einem Fehlschlag erneut klicken. Der Server hält je Anbieter einen Mindestabstand zwischen den Anfragen ein,
wiederholt bei kurzzeitiger Überlastung und weicht automatisch auf ein anderes Modell aus, wenn das Tageskontingent
eines Modells erschöpft ist oder ein Modell die Anfrage als zu lang ablehnt.

**Kein kostenloses Kontingent ist unbegrenzt.** Die folgenden Angaben sind **Stand Oktober 2026 und nicht bei
den Anbietern bestätigt** – sie stammen aus dem Schwesterprojekt „Check des Feind(t)es“ und aus Suchergebnissen zu
den Anbieter-Dokumentationen. Bitte beim Anbieter prüfen; die Anbieter ändern Limits und Bedingungen ohne
Vorankündigung.

| Anbieter | Schlüssel | Limits (Stand Oktober 2026, nicht bestätigt – bitte beim Anbieter prüfen) | Datenschutz und Hinweise |
|---|---|---|---|
| **Groq** (Vorgabe, für Klassen empfohlen) | kostenloses Konto ohne Kreditkarte, <https://console.groq.com/keys> | je nach Modell etwa 30 Anfragen pro Minute und 1000 pro Tag, dazu **Token-Tageslimits je Modell**: etwa 200 000 Token pro Tag bei gpt-oss-120b (grob geschätzt 40–60 Feedback-Anfragen, je nach Länge der Texte), etwa 100 000 bei Llama 3.3 70B. Außerdem ein Minutenlimit je Modell; sehr lange Blätter können daran scheitern – der Server wechselt dann das Modell. Ist ein Modell erschöpft, wechselt der Server automatisch zum nächsten. | Sehr schnell. Prüfen Sie die Datenschutzbedingungen von Groq, bevor Schülertexte gesendet werden. |
| **OpenRouter** | kostenloses Konto, <https://openrouter.ai/settings/keys> | nur kostenlose Modelle (`:free`). **Ohne einmaligen Guthabenkauf nur 50 kostenlose Anfragen pro Tag für das ganze Konto** – das reicht nicht für eine Klasse. Nach einem einmaligen Kauf von 10 US-$ Guthaben 1000 pro Tag. | Die kostenlosen Modelle laufen bei Drittanbietern, die Eingaben protokollieren oder zum Training verwenden dürfen. Das muss im Konto unter <https://openrouter.ai/settings/privacy> erlaubt sein, sonst antwortet die API „No endpoints found matching your data policy“. |
| **Google Gemini** | Google AI Studio, <https://aistudio.google.com/app/apikey> | kostenloses Kontingent mit Minuten- und Tageslimits je Modell; für manche Schlüssel liegt das Tageslimit neuer Modelle bei 0. Der Server weicht dann auf ein anderes Modell aus. | Im kostenlosen Kontingent darf Google Eingaben zur Produktverbesserung nutzen und von Menschen prüfen lassen. Für Nutzer:innen im EWR gelten laut Googles Bedingungen nur die bezahlten Dienste; dafür verlangt Google ein **hinterlegtes Abrechnungskonto**. Ohne Abrechnungskonto kommt Gemini für Schulen in Deutschland daher nicht infrage. |
| **Cerebras** | Konsole von Cerebras, <https://cloud.cerebras.ai> | **nicht bestätigt** – die Angaben Dritter widersprechen sich; bitte in der Konsole prüfen. | Prüfen Sie die Datenschutzbedingungen von Cerebras, bevor Schülertexte gesendet werden. |
| **Anderer OpenAI-kompatibler Dienst** | je nach Dienst | je nach Dienst | Basis-URL mit `https://` und ohne Schrägstrich am Ende (z. B. `https://api.mistral.ai/v1`), dazu die Modell-ID. Bedingungen des Dienstes prüfen. |

Hinweise:

- **Groq ist die Vorgabe**, weil es hohe Tageslimits je Modell hat und der Server über mehrere Modelle ausweichen
  kann (die beim Speichern ermittelte Rangliste); damit reicht es für ganze Klassen am ehesten. Bei vielen Klassen
  am selben Tag kann das Kontingent trotzdem erschöpft sein.
- Ist das Kontingent aufgebraucht, sehen die Schüler:innen „Das KI-Kontingent für heute ist aufgebraucht. Bitte
  frag deine Lehrkraft.“ Ihre Antworten bleiben auf dem Gerät gespeichert; nach dem zweiten Fehlschlag können sie
  ohne KI-Feedback abgeben oder es später auf demselben Gerät noch einmal versuchen.
- Die KI bekommt die Anweisung, nur zu vergleichen: die Kernpunkte Ihrer Musterlösung (bei mehr als 12 fasst sie
  zusammen), angesprochen nur, wenn der Punkt richtig wiedergegeben ist, keine Noten, keine eigenen Punkte, keine
  ausformulierten Lösungen. Auch eine KI kann sich dabei irren – das steht im Hinweis für die Schüler:innen.
- Das Feedback gibt es einmal je Gerät und Angaben; der Server kann das nicht erzwingen (wer andere Angaben
  eingibt oder ein zweites Gerät nutzt, kann es erneut anfordern). Je Feibeitsblatt sind höchstens 300
  KI-Anfragen pro Tag möglich – das schützt Ihr Kontingent vor Missbrauch.

## Sicherheit

**1104 ist nur die Tür.** Der Code steht öffentlich im Quelltext und in dieser Anleitung. Er öffnet lediglich das
Passwortfeld. Der Server prüft ihn; falsche Codes zählen als Fehlversuche.

**Das Passwort schützt und entschlüsselt (Ende-zu-Ende-Verschlüsselung).**

- Ihr Passwort verlässt nie Ihren Browser. Daraus werden dort zwei Schlüssel abgeleitet: einer zum Anmelden beim
  Server (der Server speichert davon nur einen Hash) und einer zum Ver- und Entschlüsseln.
- Beim Festlegen des Passworts erzeugt Ihr Browser ein Schlüsselpaar. Den öffentlichen Schlüssel bekommen die
  Browser der Schüler:innen; den privaten Schlüssel speichert der Server nur verschlüsselt mit Ihrem Passwort.
- Jede Abgabe wird im Browser der Schülerin bzw. des Schülers mit einem neuen Zufallsschlüssel verschlüsselt,
  der wiederum mit Ihrem öffentlichen Schlüssel verschlüsselt wird. Der Server speichert nur diesen
  verschlüsselten Umschlag – **einschließlich Kürzeln, Geburtsdatum und Klasse**.
- Technisch: PBKDF2-SHA-256 mit 600 000 Durchläufen und zufälligem Salt, daraus per HKDF-SHA-256 der
  Anmeldeschlüssel und ein AES-GCM-256-Schlüssel; Schlüsselpaar RSA-OAEP mit 3072 Bit (SHA-256); Abgaben mit
  AES-GCM-256 verschlüsselt, der Abgabeschlüssel mit RSA-OAEP. Alle Verfahren stammen aus der eingebauten Web
  Crypto API des Browsers.
- Nach der Anmeldung liegen die Schlüssel nur im Arbeitsspeicher der geöffneten Seite. Nach dem Neuladen oder
  „Abmelden“ ist eine neue Anmeldung nötig.
- „Passwort ändern“ verschlüsselt nur den privaten Schlüssel neu; alle bisherigen Abgaben bleiben lesbar.

**Ein vergessenes Passwort bedeutet: Alle gespeicherten Abgaben sind unlesbar.** Das kann niemand rückgängig
machen – weder Cloudflare noch die Entwickler:innen dieser Seite.

**Sperren nach Fehlversuchen.** Der Server zählt **nur Fehlversuche** je Netzwerkadresse (IP-Adresse; bei IPv6
je Anschluss) und weist weitere Fehlversuche vorübergehend ab. Das richtige Passwort, der richtige Türcode und
gültige Feibeitsblatt-Codes gehen immer durch – im Schulnetz teilen sich alle Geräte eine Adresse, und niemand
soll Sie oder die Klasse aussperren können, indem er Unsinn eintippt.

| Was | Weitere Versuche abgewiesen ab |
|---|---|
| falsches Passwort | 10 Fehlversuchen in 15 Minuten je Adresse, zusätzlich 200 pro Stunde insgesamt |
| falscher Türcode | 10 Fehlversuchen in 15 Minuten je Adresse |
| unbekannte Feibeitsblatt-Codes | 30 Fehlversuchen in 10 Minuten je Adresse |

Tippen Schüler:innen im Schulnetz falsche Passwörter oder Zahlen ein, sehen andere dort kurzzeitig „Zu viele
falsche Passwörter …“ bzw. „Zu viele Fehlversuche …“ – mit den richtigen Eingaben geht es trotzdem weiter.
Muss eine Sperre ausnahmsweise sofort aufgehoben werden, löscht in der D1-Konsole (siehe
[Zurücksetzen](#passwort-vergessen-oder-zugang-zurücksetzen)) der Befehl `DELETE FROM rate_limits;` alle Zähler.

**Was die Verschlüsselung nicht schützt:**

- Die Feibeitsblätter selbst (Titel, Aufgaben, Musterlösungen) liegen unverschlüsselt in der Datenbank, weil der
  Server sie für das KI-Feedback braucht. Schreiben Sie dort keine personenbezogenen Daten hinein.
- Die Seite wird vom Server ausgeliefert. Wer Ihr Cloudflare-Konto oder Ihr GitHub-Repository übernimmt, könnte
  den Code so ändern, dass künftig eingegebene Passwörter oder Texte abgefangen werden. Schützen Sie beide Konten
  mit einem starken Passwort und Zwei-Faktor-Anmeldung.
- Wer Ihr Passwort kennt, kann alle Abgaben lesen. Melden Sie sich an fremden Rechnern ab (nach 20 Minuten ohne
  Eingabe meldet die Seite Sie automatisch ab).
- Wer den Code eines Feibeitsblattes kennt, kann unter beliebigen Angaben (auch fremden Kürzeln) abgeben; der
  Server prüft die Identität nicht. Abgaben sind deshalb keine beweissicheren Leistungsnachweise.
- Die roten Stichpunkte des KI-Feedbacks verraten die Kernpunkte der Musterlösung. Musterlösungen eignen sich
  daher nicht für Prüfungen, bei denen die Lösung geheim bleiben muss.

**API-Schlüssel der KI.** Er liegt ausschließlich verschlüsselt (AES-GCM mit dem Worker-Secret `SETTINGS_SECRET`)
in der Datenbank und wird nie an Browser ausgeliefert. Fehlt `SETTINGS_SECRET`, lehnt der Server das Speichern
eines Schlüssels ab (Meldung „Der Server ist noch nicht vollständig eingerichtet …“) – dann den Workflow „Deploy“
erneut ausführen, der das Secret anlegt. Wurde `SETTINGS_SECRET` geändert, meldet die Seite „Bitte den
API-Schlüssel neu eintragen.“

**Optional: anderer Türcode.** Wer statt 1104 eine andere Ziffernfolge (4–12 Ziffern) verwenden möchte, legt im
Cloudflare-Dashboard beim Worker `feibeitsblatt` unter „Einstellungen“ / „Settings“ → „Variablen und Secrets“ /
„Variables and Secrets“ ein **Secret** namens `TEACHER_DOOR_CODE` an. Das ändert nichts daran, dass die eigentliche
Sicherheit vom Passwort kommt. Ein eigener Türcode, der vor dem ersten Aufruf gesetzt wird, schließt allerdings die
kleine Lücke zwischen Veröffentlichung und Passwort-Festlegung (siehe Schritt 7).

### Passwort vergessen oder Zugang zurücksetzen

Damit setzen Sie das Passwort zurück. Bisherige Abgaben bleiben danach unlesbar; Feibeitsblätter und
KI-Einstellungen bleiben erhalten.

1. Am besten zu einer Zeit, in der niemand an einem Feibeitsblatt schreibt. (Wer ein Blatt vor dem Zurücksetzen
   geöffnet hat und danach abgibt, verschlüsselt noch mit dem alten Schlüssel; diese Abgabe ist dann unlesbar.)
2. Im Cloudflare-Dashboard „Storage & Databases“ → „D1“ (bzw. „D1 SQL Database“) → `feibeitsblatt-db` →
   „Console“ öffnen (die Bezeichnungen können abweichen).
3. Diesen Befehl ausführen:

   ```sql
   DELETE FROM settings WHERE key='teacher';
   ```

4. Optional, aber sinnvoll – die alten Abgaben sind ohnehin nicht mehr lesbar:

   ```sql
   DELETE FROM submissions;
   ```

5. Die Seite öffnen, `1104` eingeben und **sofort** ein neues Passwort festlegen.

Für Entwickler:innen geht das auch per Kommandozeile, z. B.
`npx wrangler d1 execute feibeitsblatt-db --remote --command "DELETE FROM settings WHERE key='teacher'"`.

## Datenschutz

Feibeitsblatt ist auf Datensparsamkeit und Verschlüsselung ausgelegt. Ob der Einsatz an Ihrer Schule
datenschutzkonform ist, hängt aber auch von Entscheidungen und Maßnahmen außerhalb der Software ab.
**Technische Maßnahmen allein können die DSGVO-Konformität nicht garantieren.** Dieser Abschnitt beschreibt
ehrlich, was wo gespeichert und wohin gesendet wird; er ist keine Rechtsberatung.

### Was gespeichert wird

| Daten | Wo | Wie | Wie lange |
|---|---|---|---|
| Feibeitsblätter: Titel, Aufgaben, **Musterlösungen** | Cloudflare D1, Datenbank in der EU-Jurisdiktion | unverschlüsselt (der Server braucht sie für das KI-Feedback) | bis Sie das Blatt löschen |
| Abgaben: Kürzel von Vor- und Nachname, Geburtsdatum, Klasse, beide Fassungen der Antworten, KI-Feedback, Zeitpunkte | Cloudflare D1 (EU) | **nur verschlüsselt**; im Klartext stehen nur der Blatt-Code und der Eingangszeitpunkt | bis Sie die Abgaben oder das Blatt löschen |
| Lehrkraft-Zugang: Hash des Anmeldeschlüssels, Salt, öffentlicher Schlüssel, verschlüsselter privater Schlüssel | Cloudflare D1 (EU) | wie beschrieben unter [Sicherheit](#sicherheit) | bis zum Zurücksetzen |
| KI-Einstellungen: Anbieter, Modell, API-Schlüssel | Cloudflare D1 (EU) | Schlüssel nur verschlüsselt (ohne `SETTINGS_SECRET` wird kein Schlüssel gespeichert) | bis Sie sie ändern |
| Zähler für Sperren und Lastbegrenzung | Cloudflare D1 (EU) | keine IP-Adressen im Klartext, nur ein gekürzter Hash mit geheimem Zusatzwert (`SETTINGS_SECRET`) | höchstens einen Tag gültig (je nach Zähler 10 Minuten bis 24 Stunden), danach gelegentlich gelöscht |
| Zwischenstand der Schüler:innen (Antworten, Kürzel, Geburtsdatum, Klasse, ggf. KI-Feedback) | **nur im Browser des benutzten Geräts** (localStorage) | unverschlüsselt; der Speicherschlüssel ist ein Hash, die Angaben stehen aber lesbar im Inhalt | bis zur erfolgreichen Abgabe oder zum Löschen über „Abbrechen und Zwischenstand löschen“; Reste werden nach 7 Tagen beim nächsten Öffnen der Seite gelöscht |

Der Server speichert weder die Anfragen an die KI noch deren Antworten, und er protokolliert keine Schülertexte
und keine Schlüssel. Nach dem Löschen hält Cloudflare die Daten noch bis zu 7 Tage in der
Wiederherstellungsfunktion der Datenbank vor (D1 Time Travel). Cloudflare verarbeitet als Hoster technisch bedingt
Verbindungsdaten wie IP-Adressen; die Einzelheiten regeln Cloudflares eigene Bedingungen (nicht im Einzelnen
geprüft). Cloudflare ist ein Unternehmen mit Sitz in den USA; die Speicherung in der EU-Jurisdiktion ändert daran
nichts. Auf gemeinsam genutzten Geräten kann, wer denselben Browser benutzt, einen nicht abgegebenen Zwischenstand
sehen und weiterschreiben – Schüler:innen sollten deshalb vor dem Verlassen abgeben oder den Zwischenstand löschen.

### Was wohin gesendet wird

- **KI-Feedback:** Der Browser schickt den Blatt-Code und die Antworten an den Server dieser Seite (Cloudflare).
  Der Server leitet **Aufgabenstellungen, Ihre Musterlösungen und die Antworten** an den von Ihnen gewählten
  KI-Anbieter weiter – nur für Aufgaben mit Musterlösung. **Nie** gesendet werden Kürzel, Geburtsdatum und Klasse;
  der Server bekommt sie dabei gar nicht. Der KI-Anbieter verarbeitet die Daten nach seinen eigenen Bedingungen;
  bei kostenlosen Kontingenten oft auch zur Verbesserung seiner Dienste (siehe [KI-Anbieter](#ki-anbieter)).
- **Rechtschreibprüfung:** Nur auf Klick schickt der Browser **nur den Text dieser einen Antwort** direkt an
  LanguageTool (`api.languagetool.org`) – ohne Namen oder Angaben zur Person, aber naturgemäß mit der IP-Adresse
  des Geräts. Laut LanguageTool ist seit Dezember 2024 die **Learneo, Inc. (USA)** verantwortlich; Daten können
  Deutschland verlassen. Nach Hinweisen des Anbieters ist der Dienst nicht für Nutzer:innen unter 16 Jahren
  gedacht. (Diese Angaben stammen aus Zusammenfassungen; die Seiten von LanguageTool konnten bei der Entwicklung
  nicht direkt gelesen werden.) **Ob Schüler:innen – besonders unter 16 Jahren – die Rechtschreibprüfung nutzen
  dürfen, muss die Schule entscheiden** (die Schulleitung als Verantwortliche, beraten durch die bzw. den
  Datenschutzbeauftragte:n). Eine Einstellung zum Abschalten der Prüfung gibt es bisher nicht; bis dahin bleibt nur
  die Anweisung, den Button nicht zu benutzen – technisch erzwungen wird das nicht.
- Die Seite lädt keine externen Schriften, Bibliotheken oder Tracker.

### Empfehlungen

1. Klären Sie den Einsatz **vor** der Nutzung mit Schulleitung und **Datenschutzbeauftragten Ihrer Schule** – für
   Cloudflare (Hosting und Datenbank), den gewählten KI-Anbieter und LanguageTool.
2. Ein **Auftragsverarbeitungsvertrag (AVV/DPA)** mit den Anbietern ist, soweit erforderlich, von der Schule bzw.
   dem Schulträger abzuschließen, nicht von der einzelnen Lehrkraft. Ob ein Anbieter für kostenlose Konten einen
   AVV anbietet, ist beim Anbieter zu prüfen.
3. **Informieren Sie Schüler:innen und gegebenenfalls die Eltern**, welche Daten wohin gehen – z. B. in einem
   Elternbrief. Der Hinweis unter dem Feedback-Button nennt den Weg der Daten (Server, KI-Anbieter, LanguageTool,
   Speicherung bis zum Löschen); die Bedingungen der Anbieter und die Rechtsgrundlage müssen Sie zusätzlich
   mitteilen.
4. Weisen Sie die Schüler:innen an, **keine personenbezogenen Daten in die Antworten** zu schreiben (keine Namen,
   Adressen, Gesundheits- oder Familienangaben). Auch Aufgaben und Musterlösungen sollten keine enthalten.
5. **Löschen Sie die Abgaben nach der Korrektur** („Alle Abgaben dieses Feibeitsblattes löschen“) und nicht mehr
   benötigte Feibeitsblätter.
6. Wählen Sie den KI-Anbieter mit Blick auf seine Datenbedingungen (Gemini im EWR nur mit Abrechnungskonto;
   kostenlose OpenRouter-Modelle dürfen Eingaben protokollieren).

## Kapazität und Grenzen

**LanguageTool (Rechtschreibprüfung):** etwa **20 Prüfungen pro Minute je IP-Adresse** als Spitzenwert, dazu
höchstens 75 KB Text pro Minute. Im Schulnetz gilt das meist für die ganze Schule zusammen, also eher weniger.
Eine einzelne Prüfung ist auf 20 000 Zeichen begrenzt, und LanguageTool macht nur für bis zu 30 falsch
geschriebene Wörter je Prüfung Vorschläge. Ist das Limit erreicht, sehen die Schüler:innen „Gerade prüfen sehr
viele gleichzeitig. Bitte warte eine Minute und versuche es dann noch einmal.“ – oder, falls LanguageTool die
Ablehnung ohne die nötigen Browser-Freigaben sendet (nicht geprüft), „LanguageTool ist gerade nicht erreichbar …“.
Tipp: Nicht alle gleichzeitig prüfen lassen.

**KI-Anbieter:** siehe [Tabelle oben](#ki-anbieter). Zusätzlich hält der Server je Anbieter einen Mindestabstand
zwischen Anfragen ein (Groq 2,5 s, OpenRouter 3,5 s, Gemini 4 s, Cerebras 2 s, andere 1 s) und lässt höchstens etwa
eine Minute Wartezeit zu. Bei Groq passen so etwa 24 Feedback-Anfragen in eine Minute; fordern mehr Schüler:innen
gleichzeitig ein Feedback an, erhalten einige „Gerade fragen sehr viele gleichzeitig. Bitte versuche es in einer
Minute noch einmal.“ In Stoßzeiten kann eine einzelne Anfrage bis zu etwa 100 Sekunden dauern.

**Cloudflare, kostenloser Tarif (Workers Free):**

- 100 000 Anfragen pro Tag an den Server (`/api/…`); das Laden der Seite selbst zählt nicht. Neuer Tag ab
  Mitternacht UTC.
- D1-Datenbank: 5 GB Speicher insgesamt, höchstens 500 MB je Datenbank; 5 Millionen gelesene und 100 000
  geschriebene Zeilen pro Tag. Seit dem 1. September 2026 schlagen Datenbankabfragen nach Überschreiten bis
  Mitternacht UTC fehl; gespeicherte Daten bleiben erhalten.
- Für Schulklassen reicht das in aller Regel bei Weitem. Eine Abgabe belegt je nach Textlänge grob einige bis
  einige Dutzend Kilobyte (Schätzung).

**Grenzen in Feibeitsblatt:**

| Was | Grenze |
|---|---|
| Aufgaben je Feibeitsblatt | 1 bis 30 |
| Aufgabenstellung / Musterlösung / Titel | 4000 / 8000 / 200 Zeichen |
| Antwort je Aufgabe / alle Antworten zusammen | 8000 / 40 000 Zeichen (die Seite zeigt ab 7000 Zeichen einen Zähler) |
| Abgaben je Feibeitsblatt | 400 Abgaben bzw. 40 MB (eine Klasse braucht weit weniger) |
| KI-Feedback-Anfragen je Netzwerk (IP-Adresse) | 120 pro Stunde bzw. 400 000 Zeichen pro Stunde; nur Anfragen, die wirklich zur KI gehen, zählen – ein gestörter KI-Anbieter zählt nicht |
| KI-Feedback-Anfragen je Feibeitsblatt | 300 pro Tag |
| Abgaben je Netzwerk (IP-Adresse) | 120 pro Stunde bzw. 30 MB pro Stunde |

Diese Zähler gelten je Netzwerkadresse, im Schulnetz also meist für die ganze Schule zusammen; mehrere Klassen
parallel können die Stundenlimits erreichen. Die Meldungen lauten dann „Gerade wurden von diesem Netzwerk sehr
viele KI-Rückmeldungen angefordert …“ bzw. „… sehr viele Abgaben gesendet …“; die Antworten bleiben auf dem Gerät
gespeichert.

## Häufige Probleme

| Meldung oder Beobachtung | Ursache und Lösung |
|---|---|
| Unter „Actions“ läuft nichts | Bei einem Fork sind Workflows zunächst abgeschaltet (Schritt 0), oder es gibt noch keinen Branch `main` (Schritt 5). |
| Workflow „Deploy“ meldet „Deployment übersprungen“ | `CLOUDFLARE_API_TOKEN` fehlt (Schritt 4). |
| Workflow scheitert beim Anlegen der Datenbank | Dem Token fehlt „Konto → D1 → Bearbeiten“ (Schritt 2). Token anpassen oder neu erstellen und das Secret ersetzen. |
| Workflow scheitert bei der workers.dev-Subdomain | Im Cloudflare-Dashboard einmal „Workers & Pages“ öffnen und dort eine Subdomain wählen, dann den Workflow erneut starten. |
| Workflow scheitert bei „SETTINGS_SECRET sicherstellen“ | Die Secret-Liste war nicht abrufbar; den Workflow einfach erneut starten. |
| „Dieses Feibeitsblatt ist fehlerhaft eingerichtet. Bitte sag deiner Lehrkraft Bescheid.“ | Es ist kein Lehrkraft-Passwort festgelegt (z. B. nach dem Zurücksetzen). `1104` eingeben und ein Passwort festlegen (Schritt 7). |
| „Die Lehrkraft hat das KI-Feedback noch nicht eingerichtet.“ | KI-Einstellungen speichern (Schritt 8). Bis dahin können Schüler:innen nur ohne KI-Feedback abgeben. |
| „Der Server ist noch nicht vollständig eingerichtet (SETTINGS_SECRET fehlt).“ | Den Workflow „Deploy“ erneut ausführen; er legt das Secret an. Danach den API-Schlüssel eintragen. |
| „Bitte den API-Schlüssel neu eintragen.“ | `SETTINGS_SECRET` wurde geändert. Schlüssel in den KI-Einstellungen neu eintragen. |
| „Das KI-Kontingent für heute ist aufgebraucht.“ | Tageslimit des Anbieters erreicht. Morgen erneut versuchen oder in den KI-Einstellungen einen anderen Anbieter bzw. Schlüssel eintragen. Schüler:innen können nach dem zweiten Fehlschlag ohne KI-Feedback abgeben. |
| „Die KI ist gerade ausgelastet.“ / „Gerade fragen sehr viele gleichzeitig.“ | Minutenlimit des Anbieters oder Warteschlange voll; nach einer Minute erneut versuchen. |
| „Dieses Feibeitsblatt ist für die eingestellte KI zu umfangreich.“ | Die Anfrage überschreitet das Limit aller verfügbaren Modelle. Musterlösungen und Aufgaben kürzen oder in den KI-Einstellungen ein Modell mit größerem Kontingent wählen. |
| „LanguageTool ist gerade nicht erreichbar (Netz, Schulfilter oder Dienst gestört).“ | Ein Schulfilter sperrt eventuell `api.languagetool.org` (die Schul-IT kann die Adresse freigeben) – oder, wenn es nur zeitweise auftritt, das Minutenlimit von LanguageTool für das Schulnetz: eine Minute warten, nicht alle gleichzeitig prüfen. |
| „Zu viele falsche Passwörter …“ / „Zu viele Fehlversuche …“ / „Zu viele unbekannte Codes …“ | Fehlversuche aus demselben Netz (siehe [Sicherheit](#sicherheit)). Mit der richtigen Eingabe geht es trotzdem weiter; die Wartezeit gilt nur für weitere Fehlversuche. |
| „Gerade kommen zu viele Anfragen aus diesem Netz …“ / „Zu viele Versuche …“, den ganzen restlichen Tag | Das Tageslimit von 100 000 Anfragen des kostenlosen Tarifs ist erreicht (Cloudflare antwortet mit HTTP 429); ab Mitternacht UTC (2 Uhr deutscher Sommerzeit) geht es wieder. |

## Optional: GitHub Pages oder eigene Domain

Normalerweise liefert der Worker die Seite selbst aus; mehr ist nicht nötig. Wer die Seite zusätzlich unter
einer anderen Adresse anbieten möchte (z. B. GitHub Pages mit eigener Domain), trägt in `index.html` ganz oben die
Adresse des Workers ein (ohne Schrägstrich am Ende):

```html
<script>
  window.FEIBEITSBLATT_API = window.FEIBEITSBLATT_API || "https://feibeitsblatt.<subdomain>.workers.dev";
</script>
```

Zu beachten:

- Die Sicherheits-Header aus `_headers` (u. a. die Content-Security-Policy) gelten nur für die Auslieferung durch
  Cloudflare. GitHub Pages kann keine eigenen Header setzen; dort fehlt dieser zusätzliche Schutz.
- Die Datei `index.html` wird auch vom Worker ausgeliefert; dort stört die eingetragene Adresse nicht.
- Eine eigene Domain lässt sich auch direkt beim Worker im Cloudflare-Dashboard einrichten, wenn die Domain bei
  Cloudflare verwaltet wird (nicht im Einzelnen geprüft).

## Entwicklung

Voraussetzungen: Node.js ab Version 22. Abhängigkeiten: `npm ci` (nur Entwicklungswerkzeuge: wrangler 4.145.0
und @playwright/test 1.56.1).

| Befehl | Zweck |
|---|---|
| `npm run build` | kopiert `index.html` und `_headers` nach `dist/` (aus diesem Ordner liefert der Worker die Seite aus) |
| `npm run dev` | baut und startet den Worker lokal (`wrangler dev --local`, Standard: <http://localhost:8787>) mit lokaler D1-Datenbank unter `.wrangler/` und einem festen Entwicklungs-`SETTINGS_SECRET` |
| `npm test` | Unit-Tests (`node --test`, Dateien `test/unit/*.test.mjs`) |
| `npm run test:e2e` | Browser-Tests mit Playwright (KI und LanguageTool werden dabei simuliert); braucht einmalig `npx playwright install chromium` und die freien Ports 8787/8790 – vorher `npm run dev` beenden |
| `node test/smoke.mjs` | API-Durchlauf gegen einen echten `wrangler dev --local` mit Test-KI (Ports 8811/8812) |

**Lokale Test-KI:** `node test/mock-ai.mjs --port 8812` startet einen OpenAI-kompatiblen Test-Server. In den
KI-Einstellungen dann „Anderer OpenAI-kompatibler Dienst“ wählen, Basis-URL `http://127.0.0.1:8812/v1`, ein
beliebiger API-Schlüssel (der Schlüssel `bad` simuliert einen abgelehnten Schlüssel) und z. B. das Modell
`openai/gpt-oss-120b`. `http://` ist nur für `127.0.0.1` und `localhost` erlaubt. Die Rechtschreibprüfung ruft
auch lokal den echten LanguageTool-Dienst auf; in den Tests wird er simuliert.

**Lokale Secrets** (optional, z. B. `SETTINGS_SECRET`, `TEACHER_DOOR_CODE`) gehören in die Datei `.dev.vars`;
sie ist von Git ausgeschlossen. Ohne `SETTINGS_SECRET` lässt sich auch lokal kein KI-Schlüssel speichern.

**Nie `wrangler deploy` von Hand vor dem ersten Lauf des Workflows „Deploy“** – sonst entsteht die Datenbank
außerhalb der EU (siehe Schritt 5).

**Aufbau:**

| Datei | Inhalt |
|---|---|
| `index.html` | die ganze Oberfläche für Schüler:innen und Lehrkraft in einer Datei, ohne externe Bibliotheken und Schriften; Verschlüsselung im Browser |
| `_headers` | Sicherheits-Header der Seite (Content-Security-Policy u. a.) |
| `worker/index.js` | Cloudflare Worker: API unter `/api/…`, Datenbank, Sperren, Lehrkraft-Anmeldung |
| `worker/lib.js` | Hilfsfunktionen: Prüfung der Eingaben, Codes, Lastbegrenzung, Verschlüsselung des API-Schlüssels |
| `worker/ai.js` | KI-Anbieter, Prompt für das Feedback, Auswertung der Antworten, Ausweichmodelle |
| `wrangler.jsonc` | Worker-Konfiguration (Datenbank `feibeitsblatt-db`, statische Seite aus `dist/`) |
| `scripts/build.mjs` | Build-Skript für `dist/` |
| `test/` | Unit-Tests, API-Durchlauf, Test-KI, Browser-Tests |
| `.github/workflows/deploy.yml` | Workflow „Deploy“ |
| `CLAUDE.md` | technische Hinweise für die Weiterentwicklung |

Diese Anleitung, `CLAUDE.md` und der gesamte Code sind öffentlich: Hier gehören keine Schlüssel, Passwörter oder
echten Schülerdaten hinein.
