# Feibeitsblatt

Feibeitsblatt ist ein Schreibeditor für Arbeitsblätter im Stil des Feiditors. Sie als Lehrkraft legen Aufgaben
mit Musterlösungen an und erhalten dafür einen kurzen Code. Mit diesem Code öffnen die Schüler:innen das
Arbeitsblatt, tippen ihre Antworten selbst (Einfügen ist gesperrt), lassen Rechtschreibung und Grammatik prüfen,
holen sich einmal ein KI-Feedback zum Inhalt, überarbeiten ihre Antworten und geben ab; bei der Abgabe bekommen
sie eine zweite KI-Rückmeldung zu ihrer abgegebenen Fassung. In der
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
   Zwischenstand auch bewusst entfernen (wichtig auf geteilten Geräten). Wer seine Browserdaten regelmäßig löscht
   oder das Gerät wechselt, klickt oben rechts auf **„Zwischenstand als PDF-Datei sichern“**: Der Browser lädt eine
   PDF-Datei herunter (`Feibeitsblatt-Zwischenstand-<Code>-<Datum>.pdf`). In einem PDF-Programm geöffnet zeigt sie
   eine einzige Seite mit dem Hinweis, dass es sich um einen Zwischenstand für ein Feibeitsblatt handelt, und einen
   orangen Kasten: Genau diese PDF-Datei (kein Screenshot davon) kann auf <https://feibeitsblatt.janrickmer.de/>
   hochgeladen werden, um weiterzuarbeiten – der Link darin öffnet sich im Browser. Der eigentliche Zwischenstand
   (Antworten, Angaben, ggf. KI-Feedback) steckt unsichtbar als eingebettete Datei in der PDF. Auf der Startseite
   stellt **„Zwischenstand-PDF hochladen“** aus genau dieser Datei alles wieder her (ein Screenshot oder Ausdruck
   enthält die Daten nicht). Die Datei enthält die Antworten lesbar – sie gehört nicht in fremde Hände. Liegt auf
   dem Gerät schon ein neuerer Zwischenstand derselben Person, fragt die Seite, welcher Stand gelten soll. Hat die
   Lehrkraft Bilder zu einer Aufgabe
   hinterlegt, stehen sie je nach Einstellung als kleine Miniaturen rechts neben Aufgabe und Antwortfeld (auf
   schmalen Bildschirmen zwischen Aufgabenstellung und Antwortfeld) oder etwas größer unter der Aufgabenstellung.
   Ein Klick auf ein Bild zeigt es groß; ein weiterer Klick oder die Esc-Taste schließt die Ansicht. Hat die
   Lehrkraft „Material“ hinterlegt (einen Text mit Hervorhebungen oder Links), steht es unter der Aufgabenstellung;
   Links darin öffnen sich immer in einem neuen Tab, das Feibeitsblatt bleibt geöffnet. Hat die Lehrkraft
   PDF-Dateien zu einer Aufgabe hinterlegt, stehen sie als „Material zum Herunterladen“ unter der Aufgabenstellung:
   Ein Klick auf eine Datei lädt sie herunter (sie landet im Download-Ordner und wird nicht im Tab geöffnet); dabei
   wird nichts gesendet außer der Anfrage nach der Datei.
   **Tabelle:** Hat die Lehrkraft als Antwort eine Tabelle vorgesehen, stehen unter der Aufgabe die Spaltenüberschriften
   und leere Zellen. Mit der Tab-Taste geht es zur nächsten Zelle (Umschalt+Tab zurück), Enter springt in die Zelle
   darunter und legt am Ende eine neue Zeile an; „+ Zeile“ ergänzt ebenfalls eine (höchstens 30). Auf schmalen
   Bildschirmen lässt sich die Tabelle seitlich schieben. Auch in den Zellen ist Einfügen gesperrt.
   **Weltkarten-Zuordnung:** Oben stehen Karten (mit Bild, Bezeichnung und ggf. einem Hinweis), darunter eine
   Weltkarte. Zuerst eine Karte anklicken (ein zweiter Klick oder Esc hebt die Wahl auf), dann das passende Land.
   Stimmt es nicht, werden Karte und Land drei Sekunden lang rot, und die Karte bleibt gewählt. Stimmt es, bekommen
   Karte und Land dieselbe Farbe, ein Pfeil in dieser Farbe zeigt von der Karte auf das Land, der Ländername steht unter
   der Karte („✓ Brasilien“), und die Karte ist erledigt; „x von n Karten zugeordnet“ zeigt den Stand.
   Mit den Knöpfen „+“ und „−“ über der Karte, zwei Fingern oder dem Mausrad (nach einem Klick in die Karte oder mit
   gedrückter Strg-Taste – sonst scrollt das Mausrad wie gewohnt die Seite) wird die Karte größer, Ziehen verschiebt sie,
   „Ansicht zurücksetzen“ zeigt wieder die ganze Welt; der Mauszeiger (bzw. Tippen) zeigt den deutschen Namen eines Landes.
   Ohne Maus: eine Karte mit der Tastatur wählen und im Feld „Land eingeben“ den Namen eintippen (mit
   Vorschlagsliste), Enter prüft. „Alle Zuordnungen löschen“ fängt nach einer Rückfrage neu an. Ob eine Zuordnung
   stimmt, prüft der Browser selbst; die richtigen Länder bekommt er nicht zu sehen, nur Prüfwerte. Zu dieser
   Antwortart gibt es kein KI-Feedback.
4. **Rechtschreibung und Grammatik prüfen.** Unter jedem Antwortfeld gibt es diesen kleinen Button – aber nur, wenn
   die Schülerin oder der Schüler laut Geburtsdatum mindestens 16 Jahre alt ist (darunter steht an seiner Stelle der
   Hinweis „Die Rechtschreibprüfung (LanguageTool) gibt es erst ab 16 Jahren.“). Beim ersten Klick erklärt ein
   Dialog, dass der Text an LanguageTool (Learneo, Inc., USA) geht, und verlangt die Bestätigung „Ich bin mindestens
   16 Jahre alt – prüfen“; ohne Bestätigung wird nichts gesendet. Die Bestätigung gilt, solange das Blatt geöffnet
   ist. Der Button schickt dann nur den Text dieser einen Antwort an den Prüfdienst LanguageTool. Darunter erscheint
   in kleiner Schrift der Text mit korrigierter Rechtschreibung, Grammatik, Groß- und Kleinschreibung, Getrennt- und Zusammenschreibung und
   Zeichensetzung; die Änderungen sind markiert. Inhalt und Stil werden nie verändert. Ein ausgegrauter Hinweis
   erklärt, dass dies die Antwort einer KI ist, die selbst Fehler machen kann, und dass sie nur zum Überarbeiten
   des eigenen Textes dient. Das Antwortfeld selbst bleibt unverändert – Verbesserungen tippen die Schüler:innen
   selbst ein.
5. **KI um ein Feedback bitten.** Am Ende des Blattes. Der Server vergleicht die Antworten mit Ihrer Musterlösung.
   Je Aufgabe erscheint in Stichpunkten in **grüner** Schrift, welche Punkte der Musterlösung richtig angesprochen
   wurden, und in **roter** Schrift, welche noch fehlen (dazu zählen auch falsch wiedergegebene Punkte). Das
   Feedback zum Überarbeiten gibt es **nur einmal**; die Antworten zu diesem Zeitpunkt werden als „erste Fassung“
   festgehalten (eine zweite Rückmeldung folgt bei der Abgabe, siehe Schritt 6).
   Der Dialog vor dem Senden nennt den KI-Dienst (Betreiber und Sitz) und, falls eingerichtet, die Reserve-KI. Ist die
   KI ausgelastet (viele Anfragen in derselben Minute), wartet die Seite mit Countdown und wiederholt die Anfrage
   automatisch – bis zu fünf Versuche in etwa vier Minuten, jeweils mit dem aktuellen Text; währenddessen darf
   weitergeschrieben werden, „Nicht länger warten“ bricht ab. Erst ein erschöpfter Zyklus zählt als Fehlversuch.
   Mit dem Feedback geht diese erste Fassung samt Feedback außerdem verschlüsselt an die Lehrkraft – als
   **„Erstversuch“**. So sehen Sie auch, wer sich ein Feedback geholt, aber nicht abgegeben hat; die spätere Abgabe
   ersetzt den Erstversuch. Unter dem Button steht klein und ausgegraut, welche Daten dabei wohin gehen (siehe
   [Datenschutz](#datenschutz)).
6. **Überarbeiten und abgeben.** Nach dem Feedback folgt der Hinweis, die Antworten zu überarbeiten. Der Button
   „Abgeben“ ist bis dahin ausgegraut. Nach einer Rückfrage wird die Abgabe im Browser verschlüsselt und gesendet:
   erste Fassung, überarbeitete Fassung und das KI-Feedback. War die Abgabe technisch erfolgreich, erscheint die
   Bestätigung **„Abgabe erfolgreich“ mit einem großen grünen Haken** und dem Zeitpunkt. Darunter steht der Button
   **„Meine Lösungen als PDF herunterladen“** mit dem Hinweis, die Datei zur Sicherheit in den eigenen Unterlagen zu
   speichern – erstens, um die Lösungen vorzeigen zu können, falls die Abgabe die Lehrkraft wegen technischer
   Probleme doch nicht erreicht, und zweitens, weil alle Lösungen zum Lernen für Klausur, Klassenarbeit bzw.
   schriftlichen Leistungsnachweis gebraucht werden.
   **Zweite KI-Rückmeldung:** Direkt nach der Abgabe gehen die abgegebenen Antworten auf demselben Weg wie beim
   ersten Feedback noch einmal an die KI (ohne Kürzel, Geburtsdatum und Klasse; der Abgabe-Dialog nennt die
   Empfänger). Über dem PDF-Button erscheint dann „KI-Rückmeldung zu deiner abgegebenen Fassung“: je Aufgabe, was jetzt
   angesprochen ist und was noch fehlt, mit der Zahl der Kernpunkte im Vergleich zum ersten Feedback (z. B.
   „Angesprochen: 3 von 3 Kernpunkten (beim ersten Feedback: 2 von 3)“). Die Abgabe ist zu diesem Zeitpunkt schon
   angekommen und hängt nie von der KI ab. Ist die KI ausgelastet, wiederholt die Seite automatisch wie beim ersten
   Feedback; klappt es vorübergehend nicht, gibt es „Rückmeldung erneut anfordern“. Neu beurteilt werden nur Aufgaben
   mit Musterlösung, deren Text sich inhaltlich geändert hat; für alle anderen gilt die erste Rückmeldung weiter
   („unverändert abgegeben – wie beim ersten Feedback“). So bekommt eine unveränderte Antwort nie ein anderes Urteil.
   Wer an diesen Aufgaben nichts geändert hat, löst keine neue Anfrage aus. Ohne erstes KI-Feedback (KI nicht
   eingerichtet oder ausgefallen) gibt es auch keine zweite Rückmeldung. Die zweite Rückmeldung bleibt nur im Browser: Sie wird
   nicht gespeichert und geht nicht an Sie als Lehrkraft.
   Die PDF enthält je Aufgabe die Aufgabenstellung, die abgegebene Lösung mit der KI-Rückmeldung dazu, bei
   Überarbeitung auch die erste Fassung und das erste KI-Feedback (mehrere Seiten, falls nötig); wird sie
   heruntergeladen, bevor die zweite Rückmeldung da ist, steht das in der Datei, und die Seite erinnert daran, sie
   danach noch einmal herunterzuladen. Sie entsteht im Browser und enthält kein Geburtsdatum. Der Zwischenstand auf dem Gerät wird nach der Abgabe gelöscht; die
   Lösungen bleiben nur bis „Neues Feibeitsblatt öffnen“ für den Download im Arbeitsspeicher.

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
   muss (z. B. für eine Klassenarbeit). **Schreiben Sie die Musterlösung am besten in Stichpunkten:** je Zeile ein
   Punkt, den die Schüler:innen inhaltlich erfassen sollen. Jede Zeile wird ein Kernpunkt; die KI prüft, ob die
   Antwort ihn inhaltlich trifft – eigene Worte, Umschreibungen und ein anderes passendes Beispiel genügen, auf den
   Wortlaut kommt es nicht an – und meldet ihn als angesprochen oder fehlend zurück. Nehmen Sie deshalb nur auf, was
   Sie wirklich von allen erwarten (meist 3 bis 8, höchstens 12 Punkte), und lassen Sie Zusatzwissen weg. Soll etwas
   erklärt oder begründet werden, schreiben Sie kurze Aussagen statt einzelner Schlagwörter (z. B. „Licht wird als
   Energiequelle benötigt“ statt „Licht“) – eine bloße Aufzählung von Begriffen gilt dann als fehlend; soll nur etwas
   genannt oder aufgezählt werden, genügen die Begriffe (z. B. „Licht“, „Wasser“, „Kohlendioxid“). Bei Beispielen
   („z. B. …“) und Wahlmöglichkeiten („… oder …“) genügt den Schüler:innen eines; muss ein Fachbegriff fallen,
   schreiben Sie „(Fachbegriff nötig)“ dazu. Eine ausführliche Musterlösung als Fließtext verdichtet die KI selbst auf
   ihre zentralen Aussagen und lässt Beispiele und Einzelheiten dabei weg – welche Punkte zählen, entscheidet dann die
   KI, nicht Sie, und es kann von Anfrage zu Anfrage etwas anders ausfallen. Hier dürfen Sie Text einfügen. Zeilen
   lassen sich hinzufügen, entfernen und verschieben (1 bis 30 Aufgaben). Eine Aufgabe ohne Musterlösung bekommt kein KI-Feedback, sondern den
   Hinweis „Zu dieser Aufgabe gibt es keine Musterlösung.“
   **Material:** Unter jeder Aufgabenstellung gibt es das Feld „Material“ für einen Text, den die Schüler:innen zur
   Aufgabe sehen – etwa einen Auszug, ein Zitat, Arbeitshinweise oder Links. Mit den Knöpfen **F**, **K**, **U**
   (oder Strg+B, Strg+I, Strg+U) formatieren Sie markierten Text fett, kursiv oder unterstrichen; „Link“ verlinkt
   den markierten Text (oder fügt einen neuen Link mit Linktext ein), nur Adressen mit `http://` oder `https://`
   (eine Adresse ohne Angabe wie `www.beispiel.de` wird mit `https://` ergänzt).
   Eingefügter Text aus Word oder dem Browser behält diese Hervorhebungen und Links, alles andere (Farben,
   Schriften, Bilder) wird entfernt. Das Material sehen Schüler:innen unter der Aufgabenstellung; Links öffnen
   sich bei ihnen immer in einem neuen Tab. Der reine Text des Materials (ohne Links) geht beim KI-Feedback als
   Kontext mit an die KI (höchstens 4000 Zeichen je Aufgabe). Höchstens 8000 Zeichen je Aufgabe.
   **Bilder:** Unter jeder Aufgabenstellung lassen sich mit „+ Bild hinzufügen“ bis zu fünf Bilder hochladen
   (JPG, PNG oder WebP, auch mehrere auf einmal; HEIC-Fotos vom iPhone vorher als JPG sichern). Der Browser
   verkleinert jedes Bild vor dem Hochladen auf höchstens 1600 Pixel Kantenlänge und höchstens 500 KB. Zu jedem
   Bild wählen Sie die Anzeige: „Miniatur rechts (Klick vergrößert)“ – die Miniatur steht rechts neben
   Aufgabenstellung und Antwortfeld – oder „Groß zwischen Aufgabe und Antwortfeld“. Dazu können Sie eine kurze
   Bildbeschreibung eintragen (bis 200 Zeichen); sie wird Schüler:innen vorgelesen, die das Bild nicht sehen können,
   und steht unter dem vergrößerten Bild. Alle Bilder eines Blattes dürfen zusammen höchstens 12 MB haben; die Seite
   prüft das vor dem Anlegen. Die Bilder sehen alle, die den Code kennen; sie sind nicht
   verschlüsselt und gehen nicht an die KI – laden Sie deshalb keine Bilder mit personenbezogenen Daten hoch.
   **PDF-Dateien:** Mit „+ PDF-Datei hinzufügen“ laden Sie zu jeder Aufgabe bis zu drei PDF-Dateien als Material
   hoch (je höchstens 6 MB, alle PDF-Dateien eines Blattes zusammen höchstens 20 MB; die Seite prüft beides vor dem
   Anlegen). Andere Dateiformate nimmt die Seite nicht an. Schüler:innen sehen die Dateien unter der
   Aufgabenstellung als „Material zum Herunterladen“ und laden eine Datei mit einem Klick herunter; der Dateiname
   bleibt erhalten (Zeichen wie `/`, `:` oder `?` werden durch `-` ersetzt). Wie Bilder sind die PDF-Dateien für
   alle abrufbar, die den Code kennen, nicht verschlüsselt und gehen nie an die KI – laden Sie keine Dateien mit
   personenbezogenen Daten hoch.
   **Antwortart:** Unter „Antwortart“ wählen Sie je Aufgabe, wie die Schüler:innen antworten: **Textfeld** (Vorgabe),
   **Tabelle** oder **Weltkarten-Zuordnung**. Bei der Tabelle tragen Sie die Spaltenüberschriften ein (eine je Zeile
   oder durch „;“ getrennt, höchstens 8 mit je 60 Zeichen) und die Zahl der vorgegebenen Zeilen (1 bis 30); eine
   Vorschau zeigt den Tabellenkopf. Die ausgefüllte Tabelle geht wie ein Text an die KI – mit dem Hinweis, welche
   Spalten sie hat –, das KI-Feedback funktioniert also wie beim Textfeld. Bei der Weltkarten-Zuordnung legen Sie bis
   zu 40 Karten an: je Karte eine Bezeichnung (z. B. „Kaffee“), auf Wunsch einen kurzen Hinweis und ein Bild, und ein
   oder mehrere richtige Länder (höchstens 10, eines davon genügt), die Sie über die deutschen Ländernamen suchen; alle
   Weltkarten-Aufgaben eines Blattes zusammen haben höchstens 400 richtige Länder. Karten lassen sich verschieben und
   entfernen; jede Karte braucht eine eigene Bezeichnung und mindestens ein Land, das auf der Weltkarte anklickbar ist.
   Diese Antwortart hat keine Musterlösung und geht nicht an die KI. Die Kartenbilder verkleinert der Browser
   auf höchstens 400 Pixel; sie zählen nicht zu den fünf Bildern je Aufgabe, aber zur Speichergrenze von 12 MB je
   Blatt. Die richtigen Länder gibt der Server den Schüler:innen nie im Klartext, sondern nur als Prüfwerte (SHA-256
   aus Code, Karte und Land) – wer sich auskennt, kann diese mit etwas Aufwand allen Ländern zuordnen; geheim ist die
   Lösung damit also nicht.
4. **Code generieren.** Der Code erscheint groß (z. B. `K7Q-M4X`) mit „Kopieren“. Bilder und PDF-Dateien werden
   dabei nacheinander hochgeladen („Alle 3 Bilder sind gespeichert.“, „2 Bilder und 1 PDF-Datei sind
   gespeichert.“; größere PDF-Dateien gehen in Teilen zu je 512 KB an den Server); so lange bleibt „Zur Übersicht“
   gesperrt. Schlägt eines fehl, sagt die Seite welches, und „Fehlende Dateien erneut hochladen“ holt es nach (eine
   Wiederholung legt nie etwas doppelt an; eine unterbrochene PDF-Datei wird ab dem fehlenden Teil fortgesetzt und
   erscheint erst vollständig bei den Schüler:innen). Geben Sie den Code an die Klasse weiter. Ein erstelltes
   Feibeitsblatt lässt sich nicht mehr ändern; für eine geänderte Fassung wählen Sie es aus und klicken „Als
   Vorlage für ein neues Feibeitsblatt verwenden“ – das übernimmt Aufgaben, Material, Musterlösungen, Bilder,
   PDF-Dateien und Antwortarten (samt Karten und Kartenbildern) und ergibt einen neuen Code.
5. **Abgaben ansehen.** Die Tabelle der Feibeitsblätter zeigt Titel, Code, Datum und die Zahl der Aufgaben und
   Abgaben (ein oranges „+1“ dahinter zählt Erstversuche ohne Überarbeitung). Ein Klick wählt ein Blatt aus. Die
   Abgaben erscheinen eingeklappt mit den Spalten „Kürzel Nachname“, „Kürzel Vorname“, „Geburtstag“ und „Klasse“,
   sortiert nach Klasse und Namen. Die Kürzel sind farbig: **grün** = Abgabe nach der Überarbeitung, **orange** =
   „Erstversuch ohne Überarbeitung“ – diese Person hat sich nur das KI-Feedback geholt und (noch) nicht abgegeben;
   eine Legende über der Tabelle erklärt die Farben, und die Zusammenfassung lautet dann z. B. „3 Abgaben ·
   1 Erstversuch ohne Überarbeitung“. Aufgeklappt sehen Sie je Aufgabe eine Tabelle mit Spalte 1 „Erste Eingabe
   (vor dem KI-Feedback)“ und Spalte 2 „Eingabe nach dem KI-Feedback“ (bei einem Erstversuch steht dort „(noch
   nicht überarbeitet)“), darunter klein das KI-Feedback, das die Schülerin bzw. der Schüler gesehen hat. Eine Tabelle
   erscheint dort als Tabelle, eine Weltkarten-Zuordnung als Liste („Kaffee → Brasilien“) mit „Zugeordnet: x von n“.
   In den aufgeklappten „Aufgaben und Musterlösungen“ eines Blattes steht je Aufgabe die Antwortart, bei der Weltkarte
   mit allen Karten und ihren richtigen Ländern. Gibt die
   Person später ab, ersetzt die Abgabe ihren Erstversuch; gibt sie von einem anderen Gerät oder nach einem
   neuen Start ab, bleibt der ältere Erstversuch gespeichert, wird aber ausgeblendet (die Zusammenfassung nennt
   die Zahl). Abgaben ohne KI-Feedback (siehe oben) sind entsprechend gekennzeichnet. „Alle aufklappen“ öffnet
   alle Zeilen, „Aktualisieren“ lädt neu eingegangene Abgaben. Entschlüsselt wird ausschließlich in Ihrem Browser.
   Beachten Sie: Kürzel, Geburtsdatum, Klasse und „erste Fassung“ sind Angaben der Schüler:innen selbst – der
   Server prüft sie nicht, und abgeben kann jede Person, die den Code kennt.
6. **Als PDF-Datei sichern und wiederverwenden.** Bei einem ausgewählten Feibeitsblatt lädt „Als PDF-Datei
   herunterladen“ eine PDF-Datei herunter (`Feibeitsblatt-<Code>-<Titel>.pdf`, Umlaute im Namen umschrieben). Sie zeigt Titel, Aufgabenstellungen,
   Material (als Text, Links mit Adresse) und die Bilder; die Namen angehängter PDF-Dateien stehen darunter. Im
   Hintergrund enthält sie **alles**, was zum Wiederherstellen nötig ist: Aufgaben, **Musterlösungen**, Material mit
   Formatierung und Links, jedes Bild in Originalqualität mit Anzeigeart und Bildbeschreibung, jede PDF-Datei
   unverändert und die Antwortarten (Tabellenspalten; Karten mit Bild und richtigen Ländern) – jeweils mit
   Prüfsumme. Sichtbar steht die Antwortart unter jeder Aufgabe, bei der Weltkarte mit der Liste der Karten und Länder. Im PDF-Programm erscheinen diese Daten als Anhänge. Abgaben der Schüler:innen
   enthält die Datei nicht. Weil die Musterlösungen darin stecken, geben Sie die Datei bitte nicht an Schüler:innen
   weiter; auf der ersten Seite steht dazu ein Hinweis. Mit **„Feibeitsblatt aus PDF-Datei laden“** (oben neben
   „Neues Feibeitsblatt erstellen“) wählen Sie eine solche Datei aus. Der Editor öffnet sich mit allen Aufgaben,
   Musterlösungen, Materialien, Bildern und PDF-Dateien. Sie können dort noch etwas ändern, etwa die Klasse im
   Titel, und klicken dann „Code generieren“: Das Feibeitsblatt bekommt einen **neuen Code**. So bearbeiten zwei
   Klassen desselben Jahrgangs dasselbe Feibeitsblatt mit verschiedenen Codes, und die Übersicht zeigt ihre Abgaben
   getrennt. Das funktioniert auch, nachdem Sie das ursprüngliche Blatt gelöscht haben. Auch eine Datei, die ein
   PDF-Programm neu gespeichert hat, lässt sich in der Regel laden. Ein Ausdruck oder Screenshot enthält die Daten
   aber nicht. Bilder oder Dateien, die in der Datei fehlen oder beschädigt sind (Prüfsumme falsch), lässt die Seite
   mit einem Hinweis weg. Eine solche Sicherung und ein Zwischenstand von Schüler:innen lassen sich nicht als
   PDF-Material an eine Aufgabe hängen – sonst bekämen Schüler:innen die Musterlösungen bzw. fremde Angaben. Sichtbar in
   der PDF sind nur Zeichen des Zeichensatzes Windows-1252; andere Zeichen, z. B. griechische Buchstaben oder Emoji,
   erscheinen dort als „?“. In den Hintergrunddaten bleiben sie erhalten.
7. **Löschen.** Ganz unten: „Alle Abgaben dieses Feibeitsblattes löschen“ (mit Rückfrage und Anzahl; Erstversuche
   werden mitgelöscht). Ohne diesen Klick bleiben die Abgaben verschlüsselt gespeichert. Darunter: „Feibeitsblatt
   selbst löschen (Code wird ungültig)“ – das löscht das Blatt und alle Abgaben dazu. Wollen Sie ein Blatt später
   wieder verwenden, sichern Sie es vorher als PDF-Datei (Schritt 6).
8. **Weitere Schaltflächen** oben: „KI-Einstellungen“, „Passwort ändern“ (die Abgaben bleiben lesbar) und
   „Abmelden“. Unter der Tabelle zeigt die Übersicht, wie viel Speicher Bilder und PDF-Dateien aller
   Feibeitsblätter zusammen belegen (höchstens 200 MB).

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
| **Groq** (Vorgabe, für Klassen empfohlen) | kostenloses Konto ohne Kreditkarte, <https://console.groq.com/keys> | je nach Modell etwa 30 Anfragen pro Minute und 1000 pro Tag, dazu **Token-Limits je Modell**: bei gpt-oss-120b etwa 8 000 Token pro Minute und 200 000 pro Tag, etwa 100 000 pro Tag bei Llama 3.3 70B (Angaben Dritter, Stand Oktober 2026; die für Ihr Konto gültigen Werte stehen in der Groq-Konsole unter „Limits“). Gecachte Token zählen bei Groq nicht gegen diese Limits – Feibeitsblatt stellt die Anfrage so, dass Aufgaben, Material und Musterlösungen ab der zweiten Anfrage zum selben Blatt aus dem Cache kommen (siehe [Kapazität](#kapazität-und-grenzen)). Ist ein Modell erschöpft oder ausgelastet, wechselt der Server automatisch zum nächsten. | Sehr schnell. Prüfen Sie die Datenschutzbedingungen von Groq, bevor Schülertexte gesendet werden. |
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
- Die KI bekommt die Anweisung, nur den Inhalt zu prüfen, nicht den Wortlaut: Jeder Stichpunkt Ihrer Musterlösung ist
  ein Kernpunkt (bei mehr als 12 fasst sie zusammen); aus Fließtext nimmt sie nur die zentralen Aussagen. Angesprochen
  ist ein Punkt, wenn die Antwort ihn inhaltlich zutreffend wiedergibt – auch in eigenen Worten, mit einem anderen
  passenden Beispiel oder ohne den Fachbegriff (außer er ist ausdrücklich verlangt). Falsch oder verdreht gilt er als
  fehlend, ebenso ein bloßes Schlagwort ohne Aussage, wenn die Aufgabe eine Erklärung, Begründung oder einen
  Zusammenhang verlangt; soll nur etwas genannt oder aufgezählt werden, genügt der zutreffende Begriff. Keine Noten,
  keine eigenen Punkte, keine ausformulierten Lösungen. Auch eine KI kann sich dabei irren – das steht im Hinweis für
  die Schüler:innen.
- Das Feedback zum Überarbeiten gibt es einmal je Gerät und Angaben, dazu bei der Abgabe die Rückmeldung zur
  abgegebenen Fassung – je Schüler:in also bis zu zwei KI-Anfragen. Der Server kann das nicht erzwingen (wer andere
  Angaben eingibt oder ein zweites Gerät nutzt, kann erneut anfragen). Je Feibeitsblatt sind höchstens 600
  KI-Anfragen pro Tag möglich – das schützt Ihr Kontingent vor Missbrauch.

### Reserve-KI (zweiter Anbieter)

Unter „KI-Einstellungen“ gibt es den Block **„Reserve-KI (optional)“**: ein zweiter Anbieter mit eigenem
API-Schlüssel (Anbieter, Modell, Schlüssel, „Reserve speichern“, „Reserve testen“, „Reserve entfernen“). Der Server
fragt immer zuerst den ersten Anbieter – mit allen seinen Ausweichmodellen – und nur bei **Verfügbarkeitsproblemen**
die Reserve: ausgelastet (HTTP 429), Tageskontingent erreicht, keine oder zu langsame Antwort, Serverfehler, Anfrage
zu lang oder keine verwertbare Antwort. **Nie** bei einem Inhaltsfilter des ersten Anbieters (die Schüler:innen sehen
„Die KI hat diese Antworten nicht bewertet“) und nie bei Fehlkonfiguration (falscher Schlüssel, fehlende Freigabe) –
dann ist die Lehrkraft gefragt. Es wird nie an beide gleichzeitig gesendet. Am sinnvollsten ist ein **anderer**
Anbieter (z. B. Groq als erster, dazu ein zweiter Dienst, für den Sie einen Schlüssel haben): Dann addieren sich zwei
Kontingente, und ein Ausfall eines Anbieters trifft die Klasse nicht. Ein zweites kostenloses Konto beim **selben**
Anbieter ist keine Lösung – die Limits gelten dort je Organisation, und mehrere Gratis-Konten verstoßen meist gegen
die Bedingungen.

**Datenschutz:** Jede Reserve ist ein weiterer Empfänger der Schülertexte. Beim Speichern fragt die Seite deshalb
ausdrücklich nach („Weiteren KI-Empfänger hinzufügen?“) und nennt den Empfänger mit Sitz; die Schüler:innen sehen
beide Empfänger im Datenschutzhinweis unter dem Button **und** im Dialog vor dem Senden. Der Browser schickt mit
der Anfrage mit, über welche Empfänger informiert wurde – ändern Sie die KI-Einstellungen, während ein Blatt
geöffnet ist, bekommt die Schülerin bzw. der Schüler statt einer Antwort den Hinweis, den neuen Datenschutzhinweis
zu lesen, und muss erneut klicken; es wird nichts gesendet. Für Google Gemini müssen Sie (als erster Anbieter wie
als Reserve) bestätigen, dass ein Abrechnungskonto hinterlegt ist. Beide Schlüssel liegen nur verschlüsselt auf dem
Server. Ohne Reserve ändert sich nichts.

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
| Feibeitsblätter: Titel, Aufgaben, Material, **Musterlösungen** | Cloudflare D1, Datenbank in der EU-Jurisdiktion | unverschlüsselt (der Server braucht sie für das KI-Feedback) | bis Sie das Blatt löschen |
| Bilder zu Aufgaben (von Ihnen hochgeladen) | Cloudflare D1 (EU) | unverschlüsselt; abrufbar für alle, die den Code kennen | bis Sie das Blatt löschen |
| PDF-Dateien zu Aufgaben (von Ihnen hochgeladen, mit Dateiname) | Cloudflare D1 (EU) | unverschlüsselt; abrufbar für alle, die den Code kennen; gehen nie an die KI | bis Sie das Blatt löschen |
| Abgaben: Kürzel von Vor- und Nachname, Geburtsdatum, Klasse, beide Fassungen der Antworten, KI-Feedback, Zeitpunkte | Cloudflare D1 (EU) | **nur verschlüsselt**; im Klartext stehen nur der Blatt-Code, der Eingangszeitpunkt, die Art (Erstversuch/Abgabe) und eine zufällige Kennung der Bearbeitung | bis Sie die Abgaben oder das Blatt löschen |
| Erstversuche: dieselben Angaben mit der ersten Fassung und dem KI-Feedback, gespeichert in dem Moment, in dem das KI-Feedback ankommt | Cloudflare D1 (EU) | wie Abgaben, nur verschlüsselt | bis die Abgabe derselben Bearbeitung den Eintrag ersetzt oder Sie löschen |
| Lehrkraft-Zugang: Hash des Anmeldeschlüssels, Salt, öffentlicher Schlüssel, verschlüsselter privater Schlüssel | Cloudflare D1 (EU) | wie beschrieben unter [Sicherheit](#sicherheit) | bis zum Zurücksetzen |
| KI-Einstellungen: Anbieter, Modell, API-Schlüssel – für den ersten Anbieter und ggf. die Reserve-KI | Cloudflare D1 (EU) | Schlüssel nur verschlüsselt (ohne `SETTINGS_SECRET` wird kein Schlüssel gespeichert) | bis Sie sie ändern |
| Zähler für Sperren und Lastbegrenzung | Cloudflare D1 (EU) | keine IP-Adressen im Klartext, nur ein gekürzter Hash mit geheimem Zusatzwert (`SETTINGS_SECRET`) | höchstens einen Tag gültig (je nach Zähler 10 Minuten bis 24 Stunden), danach gelegentlich gelöscht |
| Zwischenstand der Schüler:innen (Antworten, Kürzel, Geburtsdatum, Klasse, ggf. KI-Feedback) | **nur im Browser des benutzten Geräts** (localStorage) | unverschlüsselt; der Speicherschlüssel ist ein Hash, die Angaben stehen aber lesbar im Inhalt | bis zur erfolgreichen Abgabe oder zum Löschen über „Abbrechen und Zwischenstand löschen“; Reste werden nach 7 Tagen beim nächsten Öffnen der Seite gelöscht |
| Zwischenstand als PDF-Datei (dieselben Angaben), nur auf Klick „Zwischenstand als PDF-Datei sichern“ | dort, wo die Schülerin bzw. der Schüler die Datei speichert (Download-Ordner, Stick, Cloud …); der Server sieht sie nie | unverschlüsselt und lesbar (eingebettete Datei im PDF) | bis die Datei gelöscht wird – die Seite weist darauf hin, sie nicht weiterzugeben |
| „Meine Lösungen“ als PDF nach der Abgabe (Kürzel, Klasse, Abgabezeitpunkt, Aufgaben, Lösungen, KI-Feedback – kein Geburtsdatum), nur auf Klick | dort, wo die Schülerin bzw. der Schüler die Datei speichert; im Browser erzeugt, der Server sieht sie nie | unverschlüsselt, lesbar (zum Lernen gedacht) | bis die Datei gelöscht wird |

Der Server speichert weder die Anfragen an die KI noch deren Antworten, und er protokolliert keine Schülertexte
und keine Schlüssel. Nach dem Löschen hält Cloudflare die Daten noch bis zu 7 Tage in der
Wiederherstellungsfunktion der Datenbank vor (D1 Time Travel). Cloudflare verarbeitet als Hoster technisch bedingt
Verbindungsdaten wie IP-Adressen; die Einzelheiten regeln Cloudflares eigene Bedingungen (nicht im Einzelnen
geprüft). Cloudflare ist ein Unternehmen mit Sitz in den USA; die Speicherung in der EU-Jurisdiktion ändert daran
nichts. Auf gemeinsam genutzten Geräten kann, wer denselben Browser benutzt, einen nicht abgegebenen Zwischenstand
sehen und weiterschreiben – Schüler:innen sollten deshalb vor dem Verlassen abgeben oder den Zwischenstand löschen.

### Was wohin gesendet wird

- **KI-Feedback:** Der Browser schickt den Blatt-Code, die Antworten und die Liste der Empfänger, über die
  informiert wurde, an den Server dieser Seite (Cloudflare). Der Server leitet **Aufgabenstellungen, den Text des
  Materials, Ihre Musterlösungen und die Antworten** an den ersten KI-Anbieter weiter – nur für Aufgaben mit
  Musterlösung. Nur wenn dieser ausgelastet ist, nicht antwortet, einen Serverfehler meldet, die Anfrage als zu lang
  ablehnt oder keine verwertbare Antwort liefert, geht dieselbe Anfrage danach an die eingetragene
  [Reserve-KI](#reserve-ki-zweiter-anbieter) – nie an beide gleichzeitig, nie nach einem Inhaltsfilter. Ein Dienst,
  der erst nach dem Senden ausfällt (z. B. Zeitüberschreitung), hat die Texte trotzdem erhalten. **Bei der Abgabe**
  geschieht dasselbe noch einmal mit den abgegebenen (überarbeiteten) Antworten für die zweite Rückmeldung – nicht,
  wenn seit dem ersten Feedback nichts geändert wurde, und nur an die Empfänger, über die informiert wurde. Ist die KI
  ausgelastet, wiederholt der Browser die Anfrage bis zu viermal automatisch (jeweils mit dem aktuellen Text); im
  ungünstigsten Fall erhalten also beide Dienste dieselben Antworten mehrfach. **Nie** gesendet werden Kürzel,
  Geburtsdatum und Klasse; der Server bekommt sie dabei gar nicht. Groq (Groq, Inc.), Cerebras (Cerebras Systems
  Inc.) und OpenRouter (OpenRouter, Inc.) haben ihren Sitz in den USA, Google verarbeitet Gemini-Anfragen auch in
  den USA; damit liegt eine **Übermittlung in ein Drittland** vor, deren Grundlage (z. B. eine Zertifizierung nach dem
  EU-US Data Privacy Framework oder Standardvertragsklauseln) die Schule beim Anbieter prüfen muss. OpenRouter
  leitet Anfragen zudem an wechselnde Rechenzentren anderer Anbieter weiter. Der KI-Anbieter verarbeitet die Daten
  nach seinen eigenen Bedingungen; bei kostenlosen Kontingenten oft auch zur Verbesserung seiner Dienste (siehe
  [KI-Anbieter](#ki-anbieter)). Der Datenschutzhinweis unter dem Button und der Dialog vor dem Senden nennen jeden
  möglichen Empfänger mit Rechtsträger und Sitz.
- **Rechtschreibprüfung:** Sie wird nur Schüler:innen angeboten, die laut eingegebenem Geburtsdatum **mindestens
  16 Jahre** alt sind, und erst nach einer ausdrücklichen Bestätigung im Browser (Altersangabe und Hinweis, wohin der
  Text geht; einmal je geöffnetem Blatt). Nur auf Klick schickt der Browser dann **nur den Text dieser einen
  Antwort** direkt an LanguageTool (`api.languagetool.org`) – ohne Namen oder Angaben zur Person, aber naturgemäß mit der IP-Adresse
  des Geräts. Laut LanguageTool ist seit Dezember 2024 die **Learneo, Inc. (USA)** verantwortlich; Daten können
  Deutschland verlassen. Nach Hinweisen des Anbieters ist der Dienst nicht für Nutzer:innen unter 16 Jahren
  gedacht. (Diese Angaben stammen aus Zusammenfassungen; die Seiten von LanguageTool konnten bei der Entwicklung
  nicht direkt gelesen werden.) **Ob Schüler:innen die Rechtschreibprüfung überhaupt nutzen
  dürfen, muss die Schule entscheiden** (die Schulleitung als Verantwortliche, beraten durch die bzw. den
  Datenschutzbeauftragte:n). Die Altersgrenze stützt sich auf das selbst eingegebene Geburtsdatum und die eigene
  Bestätigung – ein Ausweis wird nicht geprüft. Die Grenze steht als `LT_MIN_AGE` in `index.html`; eine Einstellung
  zum vollständigen Abschalten der Prüfung gibt es bisher nicht.
- Die Seite lädt keine externen Schriften, Bibliotheken oder Tracker.

### Empfehlungen

1. Klären Sie den Einsatz **vor** der Nutzung mit Schulleitung und **Datenschutzbeauftragten Ihrer Schule** – für
   Cloudflare (Hosting und Datenbank), den gewählten KI-Anbieter und LanguageTool.
2. Ein **Auftragsverarbeitungsvertrag (AVV/DPA)** mit den Anbietern ist, soweit erforderlich, von der Schule bzw.
   dem Schulträger abzuschließen, nicht von der einzelnen Lehrkraft. Ob ein Anbieter für kostenlose Konten einen
   AVV anbietet, ist beim Anbieter zu prüfen.
3. **Informieren Sie Schüler:innen und gegebenenfalls die Eltern**, welche Daten wohin gehen – z. B. mit dem
   [Textbaustein unten](#textbaustein-für-schülerinnen-und-eltern). Der Hinweis unter dem Feedback-Button nennt den
   Weg der Daten (Server, KI-Anbieter mit Sitz, Reserve-KI, LanguageTool, Speicherung bis zum Löschen); die
   Bedingungen der Anbieter und die Rechtsgrundlage müssen Sie zusätzlich mitteilen. Wechseln Sie den Anbieter oder
   tragen Sie eine Reserve ein, muss die Information erneuert werden. Die API-Konten sollten der Schule gehören,
   nicht einer Privatperson.
4. Weisen Sie die Schüler:innen an, **keine personenbezogenen Daten in die Antworten** zu schreiben (keine Namen,
   Adressen, Gesundheits- oder Familienangaben). Auch Aufgaben und Musterlösungen sollten keine enthalten.
5. **Löschen Sie die Abgaben nach der Korrektur** („Alle Abgaben dieses Feibeitsblattes löschen“) und nicht mehr
   benötigte Feibeitsblätter.
6. Wählen Sie den KI-Anbieter mit Blick auf seine Datenbedingungen (Gemini im EWR nur mit Abrechnungskonto;
   kostenlose OpenRouter-Modelle dürfen Eingaben protokollieren).

### Textbaustein für Schüler:innen und Eltern

Platzhalter in eckigen Klammern bitte ersetzen; die Empfängerliste muss zu Ihren KI-Einstellungen passen (sie steht
auch im Datenschutzhinweis unter dem Feedback-Button).

> Liebe Schülerinnen und Schüler, liebe Eltern,
>
> im Fach [Fach] nutzen wir die Schreibplattform „Feibeitsblatt“. Verantwortlich ist die [Schule, Anschrift],
> Datenschutzbeauftragte:r: [Kontakt]. Zweck ist das Üben des Schreibens mit einer automatischen Rückmeldung, die die
> Antworten mit der Musterlösung der Lehrkraft vergleicht; Rechtsgrundlage ist [§ … Schulgesetz / Art. 6 Abs. 1 lit. e
> DSGVO]. Gespeichert werden Namenskürzel, Geburtsdatum, Klasse und die Texte – verschlüsselt, nur für die Lehrkraft
> lesbar – auf Servern von Cloudflare (Datenbank in der EU) bis zur Löschung nach der Durchsicht, spätestens [Frist].
> Für die Rückmeldungen (eine zum Überarbeiten, eine zur abgegebenen Fassung) werden nur die Antworttexte (ohne
> Namen und Angaben zur Person) zusammen mit den Aufgaben an den KI-Dienst [z. B. Groq, Inc., USA] gesendet; nur wenn
> dieser nicht antwortet oder ausgelastet ist, an
> [Reserve-Dienst mit Sitz]. Diese Dienste haben ihren Sitz in den USA; die Übermittlung stützt sich auf [EU-US
> Data Privacy Framework / Standardvertragsklauseln]. Schülerinnen und Schüler ab 16 Jahren können auf Wunsch eine
> Rechtschreibprüfung nutzen, die den Text der jeweiligen Antwort an LanguageTool (Learneo, Inc., USA) sendet. Es
> werden keine Namen, Adressen oder andere personenbezogenen Angaben in die Antworten geschrieben. Bei Fragen
> wenden Sie sich an [Lehrkraft, Kontakt].

## Kapazität und Grenzen

**LanguageTool (Rechtschreibprüfung):** etwa **20 Prüfungen pro Minute je IP-Adresse** als Spitzenwert, dazu
höchstens 75 KB Text pro Minute. Im Schulnetz gilt das meist für die ganze Schule zusammen, also eher weniger.
Eine einzelne Prüfung ist auf 20 000 Zeichen begrenzt, und LanguageTool macht nur für bis zu 30 falsch
geschriebene Wörter je Prüfung Vorschläge. Ist das Limit erreicht, sehen die Schüler:innen „Gerade prüfen sehr
viele gleichzeitig. Bitte warte eine Minute und versuche es dann noch einmal.“ – oder, falls LanguageTool die
Ablehnung ohne die nötigen Browser-Freigaben sendet (nicht geprüft), „LanguageTool ist gerade nicht erreichbar …“.
Tipp: Nicht alle gleichzeitig prüfen lassen.

Rechenbeispiel: 60 Schüler:innen am Tag mit je etwa 600 Wörtern (≈ 4 000 Zeichen = 4 KB je Prüfung) – selbst drei
Prüfungen je Person (180 am Tag) liegen weit unter jeder Grenze; ein Tageslimit nennt LanguageTool nicht. Eng wird
es nur, wenn mehr als 20 Personen **in derselben Minute** aus demselben Schulnetz prüfen – dann hilft Warten.

**KI-Anbieter:** siehe [Tabelle oben](#ki-anbieter). Zusätzlich hält der Server je Anbieter einen Mindestabstand
zwischen Anfragen ein (Groq 2,5 s, OpenRouter 3,5 s, Gemini 4 s, Cerebras 2 s, andere 1 s) und lässt höchstens etwa
eine Minute Wartezeit zu. Fordern viele Schüler:innen gleichzeitig ein Feedback an, erhalten einige „Gerade fragen
sehr viele gleichzeitig. Bitte versuche es in einer Minute noch einmal.“ In Stoßzeiten kann eine einzelne Anfrage
bis zu etwa 100 Sekunden dauern.

Rechenbeispiel für **60 Schüler:innen am Tag mit je etwa 600 Wörtern** bei Groq (Vorgabe gpt-oss-120b; die
Limits sind Angaben Dritter, Stand Oktober 2026 – bitte in der Groq-Konsole prüfen):

- Eine Feedback-Anfrage besteht aus den Anweisungen (≈ 500 Token), Aufgaben und Musterlösungen (≈ 300–800),
  ggf. Material (bis ≈ 1 200 je Aufgabe), den Antworten (600 deutsche Wörter ≈ 1 200–1 600 Token) und der Ausgabe
  (≈ 200–500). Ohne Material also grob **2 500–4 000 Token je Anfrage**, mit viel Material mehr.
- Jede Schülerin und jeder Schüler stellt bis zu **zwei** solche Anfragen: das Feedback zum Überarbeiten und bei der
  Abgabe die Rückmeldung zur abgegebenen Fassung (die zweite entfällt, wenn nichts geändert wurde). 60 Schüler:innen
  sind also bis zu 120 Anfragen, ohne Cache 300 000–500 000 Token – deutlich über dem Tageslimit von etwa 200 000
  Token des Vorgabe-Modells. Deshalb macht Feibeitsblatt mehrere Dinge:
  1. **Anfrage in Cache-freundlicher Reihenfolge.** Der für alle Schüler:innen eines Blattes gleiche Teil (Anweisungen,
     Aufgaben, Material, Musterlösungen) steht vorn, die Antworten stehen hinten. Groq cacht solche Präfixe
     automatisch (für die gpt-oss-Modelle, laut Groq „best effort“, Cache einige Stunden gültig), und **gecachte
     Token zählen nicht gegen die Minuten- und Tageslimits**. Ab der zweiten Anfrage zum selben Blatt kosten dann im
     Wesentlichen nur noch Antworten und Ausgabe, grob 1 500–2 000 Token: 120 Anfragen ≈ 180 000–240 000 Token, also
     etwa das Tageslimit des Vorgabe-Modells; was darüber hinausgeht, übernehmen die weiteren Modelle (Punkt 2), die
     jeweils ein eigenes Tageslimit haben. Je Minute gehen so etwa 4–5 statt 2 Anfragen durch ein Modell.
  2. **Alle Modelle gleichzeitig nutzen.** Bei Groq, Cerebras und Gemini gelten die Minutenlimits **je Modell**.
     Der Server verteilt gleichzeitige Anfragen deshalb von Anfang an auf alle Modelle des Anbieters (versetztes
     Startmodell, Mindestabstand je Modell statt je Anbieter), wechselt bei einem Minutenlimit (HTTP 429) sofort
     und ohne Wartezeit zum nächsten Modell und sperrt das erschöpfte Modell nur für die vom Anbieter gemeldete
     Zeit (5–90 s) – die Sperre wird sofort geschrieben, sodass auch schon laufende Anfragen sie sehen. Bei Groq
     stehen so gpt-oss-120b, gpt-oss-20b, Llama 3.3 70B, Llama 4 Scout, Kimi K2, Qwen 3 32B u. a. mit zusammen
     grob 60 000–100 000 Token pro Minute zur Verfügung (Angaben Dritter; die schwächeren Modelle stehen hinten).
  3. **Warten übernimmt der Browser, nicht der Server.** Sind alle Modelle ausgelastet, antwortet der Server sofort
     mit „ausgelastet“ und der Zeit, nach der es frühestens wieder geht. Die Seite der Schülerin bzw. des Schülers
     wartet dann mit Countdown und wiederholt automatisch (bis zu fünf Versuche in etwa vier Minuten, leicht
     zufällig versetzt, damit nicht alle Browser einer Klasse in derselben Sekunde wiederkommen); weiterschreiben
     ist währenddessen möglich. Erst danach – oder nach „Nicht länger warten“ – zählt ein Fehlversuch.
  4. **Reserve-KI.** Erst wenn der erste Anbieter mit allen Modellen ausgelastet ist oder ausfällt, geht die Anfrage
     an die [Reserve-KI](#reserve-ki-zweiter-anbieter), falls eingerichtet.
- **Fazit:** 60 Schüler:innen am Tag mit je 600 Wörtern (bis zu 120 Anfragen) sind mit einem kostenlosen
  Groq-Schlüssel machbar, weil der Server über mehrere Modelle ausweicht. Die Rückmeldungen zur abgegebenen Fassung
  verteilen sich meist über die Zeit, in der abgegeben wird. Auch
  **30 Anfragen in derselben Minute** gehen durch: Bei grob 2 500–3 500 Token je Anfrage und 60 000–100 000 Token
  pro Minute über alle Groq-Modelle sind etwa 20–30 Anfragen in der ersten Minute möglich, der Rest folgt
  automatisch in der zweiten – ohne dass jemand klicken muss. Eine Reserve-KI macht das Ganze unabhängig von einem
  einzelnen Anbieter. Diese Zahlen beruhen auf Angaben Dritter und sind nicht garantiert (prüfen Sie die Limits in
  der Groq-Konsole); fällt die Kapazität geringer aus, dauert es entsprechend länger, aber niemand muss selbst
  nachklicken.

**Cloudflare, kostenloser Tarif (Workers Free):**

- 100 000 Anfragen pro Tag an den Server (`/api/…`); das Laden der Seite selbst zählt nicht. Neuer Tag ab
  Mitternacht UTC.
- D1-Datenbank: 5 GB Speicher insgesamt, höchstens 500 MB je Datenbank; 5 Millionen gelesene und 100 000
  geschriebene Zeilen pro Tag. Seit dem 1. September 2026 schlagen Datenbankabfragen nach Überschreiten bis
  Mitternacht UTC fehl; gespeicherte Daten bleiben erhalten.
- Für Schulklassen reicht das in aller Regel bei Weitem. Eine Abgabe belegt je nach Textlänge grob einige bis
  einige Dutzend Kilobyte (Schätzung); Bilder zu Aufgaben belegen bis zu etwa 700 KB je Bild (Base64) und werden
  beim Öffnen eines Blattes je einmal gelesen – auch das zählt zu den gelesenen Zeilen. PDF-Dateien liegen in Teilen
  zu je 512 KB (als Base64 etwa 700 KB) in der Datenbank; eine 6-MB-Datei belegt also 12 Zeilen. Jeder der 12 Abrufe
  beim Herunterladen zählt dabei die Teile der Datei mit, eine 6-MB-Datei kostet also rund 170 gelesene Zeilen je
  Download (30 Schüler:innen: rund 5 000 von 5 Millionen am Tag) – der Browser cacht die Teile, ein zweiter Klick
  lädt nichts neu. Bilder und PDF-Dateien aller Feibeitsblätter zusammen dürfen höchstens 200 MB belegen (als
  Base64 rund 270 MB); so bleibt in der 500-MB-Datenbank genug Platz für Abgaben. Die Lehrkräfte-Übersicht zeigt
  den belegten Speicher an.

**Grenzen in Feibeitsblatt:**

| Was | Grenze |
|---|---|
| Aufgaben je Feibeitsblatt | 1 bis 30 |
| Aufgabenstellung / Musterlösung / Titel | 4000 / 8000 / 200 Zeichen |
| Material je Aufgabe | 8000 Zeichen, 60 Links; nur fett, kursiv, unterstrichen und Links (http/https) |
| Bilder je Aufgabe | 5; je Bild höchstens 500 KB nach dem Verkleinern (längste Seite 1600 Pixel); alle Bilder eines Blattes zusammen 12 MB |
| PDF-Dateien je Aufgabe | 3; je Datei höchstens 6 MB; alle PDF-Dateien eines Blattes zusammen 20 MB; Dateiname bis 120 Zeichen |
| Tabelle (Antwortart) | 1–8 Spalten mit je 60 Zeichen Überschrift, 1–30 Zeilen; die ganze Tabelle als Text höchstens 8000 Zeichen |
| Weltkarten-Zuordnung (Antwortart) | 1–40 Karten je Aufgabe (Bezeichnung 120, Hinweis 400 Zeichen, ein Bild – zählt nicht zu den 5 Bildern), je Karte 1–10 richtige Länder, je Blatt höchstens 400 richtige Länder zusammen |
| Antwort je Aufgabe / alle Antworten zusammen | 8000 / 40 000 Zeichen (die Seite zeigt ab 7000 Zeichen einen Zähler) |
| Abgaben je Feibeitsblatt | 400 Abgaben bzw. 40 MB (eine Klasse braucht weit weniger) |
| KI-Anfragen je Netzwerk (IP-Adresse) | 240 pro Stunde bzw. 800 000 Zeichen pro Stunde (je Schüler:in bis zu zwei Anfragen: Feedback zum Überarbeiten und Rückmeldung zur abgegebenen Fassung); nur Anfragen, die wirklich zur KI gehen, zählen – ein gestörter KI-Anbieter zählt nicht |
| KI-Anfragen je Feibeitsblatt | 600 pro Tag |
| Abgaben und Erstversuche je Netzwerk (IP-Adresse) | 240 pro Stunde bzw. 60 MB pro Stunde (je Schüler:in bis zu zwei Übermittlungen: Erstversuch beim KI-Feedback und Abgabe) |
| Hochgeladene Zwischenstand-PDF | 5 MB (die von Feibeitsblatt erzeugten Dateien sind viel kleiner) |
| Hochgeladene Feibeitsblatt-PDF (Lehrkraft) | 80 MB (ein volles Blatt mit 12 MB Bildern und 20 MB PDF-Dateien ergibt höchstens etwa 45 MB) |
| Bilder und PDF-Dateien aller Feibeitsblätter zusammen | 200 MB (die Übersicht zeigt den belegten Speicher) |

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
| „Das Bild kann der Browser nicht lesen (z. B. HEIC). Bitte als JPG oder PNG speichern.“ | Das Format kann der Browser nicht öffnen – meist HEIC-Fotos vom iPhone. Das Foto als JPG sichern (iOS: Einstellungen → Kamera → Formate → „Maximale Kompatibilität“, oder aus der Fotos-App als JPG teilen) oder ein anderes Bild wählen. |
| „1 Bild konnte nicht gespeichert werden … Das Feibeitsblatt selbst ist angelegt.“ (ebenso für PDF-Dateien) | Das Hochladen ist unterbrochen worden (Netz) oder der Server hat die Datei abgelehnt (Meldung in Klammern). Bei Netzfehlern „Fehlende Dateien erneut hochladen“ klicken; bei einer Ablehnung (zu groß, zu viele, keine PDF) das Blatt löschen und mit weniger oder kleineren Dateien neu anlegen. |
| „konnte nicht geladen werden – erneut versuchen“ an einer PDF-Datei | Die Verbindung ist beim Herunterladen abgerissen. Noch einmal auf die Datei klicken. |
| „Bild konnte nicht geladen werden – erneut versuchen“ (statt einer Miniatur) | Die Verbindung ist abgerissen, während das Blatt geöffnet wurde. Auf den Hinweis klicken, dann lädt das Bild erneut. |
| „Gerade bitten sehr viele gleichzeitig um Feedback – die KI ist ausgelastet. Nächster Versuch automatisch in …“ | Kein Fehler: Die Minutenlimits aller Modelle sind gerade ausgeschöpft; die Seite wiederholt von selbst (bis zu fünf Versuche in etwa vier Minuten). Weiterschreiben ist möglich; „Nicht länger warten“ bricht ab. Kommt das ständig vor, Feedback gestaffelt anfordern lassen oder eine Reserve-KI eintragen. |
| „Die Lehrkraft hat die KI-Einstellungen geändert – es wurde nichts gesendet. Lies bitte den Datenschutzhinweis …“ | Sie haben den ersten Anbieter geändert oder eine Reserve eingetragen, während das Blatt geöffnet war. Die Seite hat den Hinweis neu geladen; die Schülerin bzw. der Schüler liest ihn und klickt erneut. Nichts ging verloren. |
| „Die KI hat diese Antworten nicht bewertet. Bitte frag deine Lehrkraft.“ | Der KI-Anbieter hat die Anfrage mit seinem Inhaltsfilter abgelehnt. Absichtlich geht sie dann **nicht** an die Reserve. Sehen Sie sich die Antworten an; nach zwei Fehlversuchen kann ohne KI-Feedback abgegeben werden. |
| „In dieser Datei steckt kein Feibeitsblatt-Zwischenstand.“ beim Hochladen einer PDF | Es wurde nicht die Original-PDF aus „Zwischenstand als PDF-Datei sichern“ hochgeladen, sondern z. B. ein Screenshot, ein Ausdruck oder eine „Drucken als PDF“-Kopie – die enthalten die eingebetteten Daten nicht. Nur die heruntergeladene Datei selbst (unverändert) funktioniert; ein Neuspeichern in einem PDF-Programm, das die eingebettete Datei behält, ist unproblematisch. |
| „Die Rechtschreibprüfung (LanguageTool) gibt es erst ab 16 Jahren.“ (statt des Buttons) | Kein Fehler: Laut eingegebenem Geburtsdatum ist die Schülerin oder der Schüler jünger als 16; die Prüfung wird dann nicht angeboten (Altersgrenze `LT_MIN_AGE` in `index.html`). Bei einem Tippfehler im Geburtsdatum oben „Abbrechen und Zwischenstand löschen“ wählen und den Code neu eingeben. |
| „Zu viele falsche Passwörter …“ / „Zu viele Fehlversuche …“ / „Zu viele unbekannte Codes …“ | Fehlversuche aus demselben Netz (siehe [Sicherheit](#sicherheit)). Mit der richtigen Eingabe geht es trotzdem weiter; die Wartezeit gilt nur für weitere Fehlversuche. |
| „Gerade kommen zu viele Anfragen aus diesem Netz …“ / „Zu viele Versuche …“, den ganzen restlichen Tag | Das Tageslimit von 100 000 Anfragen des kostenlosen Tarifs ist erreicht (Cloudflare antwortet mit HTTP 429); ab Mitternacht UTC (2 Uhr deutscher Sommerzeit) geht es wieder. |

## Optional: GitHub Pages oder eigene Domain

Normalerweise liefert der Worker die Seite selbst aus (`https://feibeitsblatt.<subdomain>.workers.dev`); mehr ist
nicht nötig. Dieses Repository ist zusätzlich so eingerichtet, dass GitHub Pages dieselbe Seite unter der eigenen
Adresse **`feibeitsblatt.janrickmer.de`** ausliefert, so wie ParentsDay. Die Seite erkennt dann selbst, dass sie nicht
vom Worker kommt, und ruft den Worker unter der Adresse auf, die ganz oben in `index.html` steht
(`window.FEIBEITSBLATT_WORKER`, derzeit `https://feibeitsblatt.feindt.workers.dev`). Beide Adressen nutzen dieselbe
Datenbank; Schüler:innen und Lehrkraft können jede davon verwenden.

**Einrichten (einmalig):**

1. Die Dateien `CNAME` (Inhalt: `feibeitsblatt.janrickmer.de`) und `.nojekyll` liegen schon im Repository. Heißt Ihre
   Worker-Adresse anders als oben, tragen Sie sie in `index.html` an **zwei** Stellen ein: bei
   `window.FEIBEITSBLATT_WORKER` und in der Zeile `<meta http-equiv="Content-Security-Policy" …>` (dort hinter
   `connect-src`). Die Adresse steht am Ende des Workflow-Laufs „Deploy“ (Hinweis „Feibeitsblatt ist online“).
2. Auf GitHub: „Settings“ → „Pages“ → bei „Build and deployment“ → „Source“ **„Deploy from a branch“**, Branch
   **`main`**, Ordner **`/ (root)`** → „Save“. Darunter bei „Custom domain“ `feibeitsblatt.janrickmer.de` eintragen
   (falls nicht schon aus der Datei `CNAME` übernommen) → „Save“.
3. Beim DNS-Anbieter der Domain (Strato): einen **CNAME-Eintrag** `feibeitsblatt` anlegen, der auf
   **`janrickmer.github.io`** zeigt – genau wie der vorhandene Eintrag `parentsday`. Keine weiteren Einträge nötig.
4. Einige Minuten warten, bis GitHub die DNS-Prüfung bestanden hat und das Zertifikat ausgestellt ist; dann in den
   Pages-Einstellungen **„Enforce HTTPS“** anhaken.
5. Prüfen: <https://feibeitsblatt.janrickmer.de> öffnen, `1104` eingeben – die Anmeldung muss genauso funktionieren
   wie unter der Worker-Adresse. (Geht es nicht, meldet die Seite meist „Keine Verbindung zum Server“: dann stimmt
   die Worker-Adresse in `index.html` nicht.)

GitHub Pages veröffentlicht den Inhalt des Branches `main` – also auch nach jeder Änderung automatisch, so wie der
Workflow den Worker neu veröffentlicht.

Zu beachten:

- Auf GitHub Pages gelten die Sicherheits-Header aus `_headers` nicht (GitHub Pages kann keine eigenen Header setzen).
  Die Content-Security-Policy ist deshalb zusätzlich als `<meta>`-Zeile in `index.html` hinterlegt; nur der Schutz
  gegen das Einbetten in fremde Seiten (`frame-ancestors`) fehlt dort.
- Die Seite selbst kommt dann von GitHub (USA); Daten fließen weiterhin nur zum Worker (Cloudflare, Datenbank in der
  EU), zum KI-Anbieter und bei der Rechtschreibprüfung zu LanguageTool – daran ändert sich nichts.
- Die Bilder und PDF-Dateien zu Aufgaben kommen weiterhin vom Worker; die Seite bettet Bilder als `data:`-Adressen
  ein und baut PDF-Dateien im Browser zusammen (`blob:`), ein eigener Eintrag in der CSP ist dafür nicht nötig.
- Eine eigene Domain lässt sich alternativ direkt beim Worker einrichten („Workers & Pages“ → `feibeitsblatt` →
  „Settings“ → „Domains & Routes“ → „Add“ → „Custom domain“). Das setzt voraus, dass die Domain bei Cloudflare
  verwaltet wird, also ihre Nameserver auf Cloudflare zeigen (vorher alle vorhandenen DNS-Einträge wie E-Mail bei
  Cloudflare nachtragen). Ein bloßer CNAME-Eintrag beim bisherigen Anbieter auf die `workers.dev`-Adresse genügt
  **nicht** – Cloudflare beantwortet fremde Hostnamen dort nicht (nicht im Einzelnen geprüft).

## Entwicklung

Voraussetzungen: Node.js ab Version 22. Abhängigkeiten: `npm ci` (nur Entwicklungswerkzeuge: wrangler 4.145.0,
@playwright/test 1.56.1 sowie world-atlas 2.0.2, d3-geo 3.1.1 und topojson-client 3.1.0 für die Weltkarte).

| Befehl | Zweck |
|---|---|
| `npm run build` | kopiert `index.html` und `_headers` nach `dist/` (aus diesem Ordner liefert der Worker die Seite aus) |
| `npm run dev` | baut und startet den Worker lokal (`wrangler dev --local`, Standard: <http://localhost:8787>) mit lokaler D1-Datenbank unter `.wrangler/` und einem festen Entwicklungs-`SETTINGS_SECRET` |
| `npm test` | Unit-Tests (`node --test`, Dateien `test/unit/*.test.mjs`) |
| `npm run test:e2e` | Browser-Tests mit Playwright (KI und LanguageTool werden dabei simuliert); braucht einmalig `npx playwright install chromium` und die freien Ports 8787/8790 – vorher `npm run dev` beenden |
| `node test/smoke.mjs` | API-Durchlauf gegen einen echten `wrangler dev --local` mit Test-KI (Ports 8811/8812) |
| `node scripts/worldmap.mjs` | erzeugt die Weltkarte neu und schreibt sie in `index.html` (`--check` prüft nur) |
| `node test/fixtures/make-fixture.mjs` | erzeugt die Testdatei `test/fixtures/02_Feibeitsblatt_Ein-Auto-eine-Welt.pdf` neu |

**Weltkarte:** Die Länderumrisse stammen aus [Natural Earth](https://www.naturalearthdata.com/) im Maßstab
1:110 Millionen (gemeinfrei), verteilt als npm-Paket [world-atlas](https://github.com/topojson/world-atlas)
(ISC-Lizenz). `scripts/worldmap.mjs` projiziert sie mit [d3-geo](https://github.com/d3/d3-geo) (ISC) in die
flächentreue Equal-Earth-Projektion, ergänzt deutsche Ländernamen und einen Ankerpunkt je Land (dorthin zeigen die
Pfeile) und bettet das Ergebnis (≈ 120 KB) in `index.html` ein – die Seite lädt zur Laufzeit nichts nach. Kosovo,
Nordzypern und Somaliland haben in den Daten keine ISO-Kennung und sind nicht anklickbar. Natural Earth zeichnet
tatsächliche Grenzverläufe („de facto“); abweichend davon gehört die Krim hier zur Ukraine.

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
| `scripts/worldmap.mjs` | erzeugt die eingebettete Weltkarte (Natural Earth über world-atlas, Equal Earth, deutsche Namen) |
| `test/` | Unit-Tests, API-Durchlauf, Test-KI, Browser-Tests |
| `.github/workflows/deploy.yml` | Workflow „Deploy“ |
| `CLAUDE.md` | technische Hinweise für die Weiterentwicklung |

Diese Anleitung, `CLAUDE.md` und der gesamte Code sind öffentlich: Hier gehören keine Schlüssel, Passwörter oder
echten Schülerdaten hinein.
