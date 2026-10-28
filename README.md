# Feibeitsblatt

Feibeitsblatt ist ein Schreibeditor für Arbeitsblätter im Stil des Feiditors. Sie als Lehrkraft legen Aufgaben
an – je Aufgabe mit einem Auftrag an die KI, worauf sie beim Feedback achten soll – und erhalten dafür einen kurzen Code. Mit diesem Code öffnen die Schüler:innen das
Arbeitsblatt, tippen ihre Antworten selbst (Einfügen ist gesperrt), lassen Rechtschreibung und Grammatik prüfen,
holen sich (freiwillig) einmal ein KI-Feedback zum Inhalt, überarbeiten ihre Antworten und geben ab; bei der Abgabe bekommen
sie eine zweite KI-Rückmeldung zu ihrer abgegebenen Fassung. In der
Lehrkräfte-Übersicht sehen Sie alle Abgaben – die erste Fassung und die überarbeitete Fassung nebeneinander (bei
einer Abgabe ohne KI-Feedback nur die abgegebene Fassung). Jedes Feibeitsblatt lässt sich auch als analoges
Arbeitsblatt zum Ausdrucken herunterladen – mit Schreiblinien und einem QR-Code zu einer Checkliste, auf der die
Schüler:innen selbst abhaken, ob ihre Antworten die Erwartungen erfüllen. Unter dem Material einer Aufgabe lassen sich
YouTube-Videos einbetten: Die Schüler:innen laden ein Video erst mit einem eigenen Klick (vorher lädt die Seite nichts von YouTube),
auf dem analogen Arbeitsblatt führt ein QR-Code zum Video. Ein Feibeitsblatt kann auch das Finale eines
Escape-Rooms der Reihe sein: Dann kommen die Schüler:innen über den Link am Ende des Escape-Rooms (oder dessen
Überblick-PDF) mit ihren Angaben und Ergebnissen aus dem Raum an (siehe [Lehrkraft, Schritt 8](#so-arbeiten-sie-als-lehrkraft)).
Wie im Feiditor misst Feibeitsblatt beim Schreiben die **Tippzeiten** (je Zeichen den Abstand zum vorangehenden Zeichen).
In der Lehrkräfte-Übersicht sehen Sie die Antworten farbig markiert. Nutzen Sie die Färbung nur als Anlass für ein
Gespräch über die Arbeitsweise – nicht für Noten und nicht bei einem Täuschungsverdacht. Die Schüler:innen sehen die
Messung beim Schreiben nicht; die Kurzfassung des Datenschutzhinweises nennt sie in einem Satz, der ausführliche
Datenschutzhinweis („Alle Informationen zum Datenschutz“) erklärt sie, und dort können sie ihr in einem eigenen Abschnitt
mit einem Schalter widersprechen (siehe [Tippzeiten](#tippzeiten)).

Technisch besteht Feibeitsblatt aus einer Webseite (`index.html`) und einem kleinen Server (Cloudflare Worker mit
einer D1-Datenbank in der EU), beides im kostenlosen Tarif von Cloudflare. Die Abgaben werden schon im Browser der
Schüler:innen verschlüsselt; lesen können Sie sie nur mit Ihrem Passwort.

Feibeitsblatt ist ein privates, nicht kommerzielles und kostenloses Angebot – kein Angebot einer Schule. Verantwortlich
für den Datenschutz ist der Betreiber der jeweiligen Installation; seine Angaben stehen fest ganz oben in `index.html`
und auf der Seite „Impressum & Datenschutz“ (Link unten auf jeder Seite, siehe [Schritt 9](#schritt-9-betreiber-prüfen-und-löschfrist-festlegen)).

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
   die leicht verwechselbaren Zeichen I, L, O, 0 und 1. Ein Satz unter dem Formular sagt, dass schon beim Laden der
   Seite die IP-Adresse verarbeitet wird und wo alle Informationen zum Datenschutz stehen: unter „Impressum &
   Datenschutz“ (Link in der Fußzeile jeder Seite; er öffnet die Seite in einem neuen Tab, damit nichts verloren geht)
   und nach dem Code passend zum Feibeitsblatt.
2. **Arbeitsform wählen.** Nach dem Code fragt die Seite „Wie arbeitest du?“: **„Einzelarbeit“** oder **„Partner- /
   Gruppenarbeit“** (zu zweit oder in einer Gruppe von bis zu 10 Personen an einem Gerät, gemeinsame Abgabe).
   „← anderen Code eingeben“ führt zurück zur Startseite. Wer über „Weiterschreiben“ oder eine Zwischenstand-PDF
   kommt, sieht diese Frage nicht – die Arbeitsform steht dann schon fest.
3. **Angaben machen.** Bei **Einzelarbeit**: die ersten drei Buchstaben des Vornamens (bei einem kürzeren Vornamen den
   ganzen Vornamen), die ersten zwei Buchstaben des Nachnamens, den Geburtstag – nur Tag und Monat, ohne Jahr (er hilft,
   gleiche Kürzel auseinanderzuhalten) – und die Klasse (z. B. „8b“). Bei **Partner- oder Gruppenarbeit** („Eure
   Angaben“, in der „ihr“-Form): je Person ein Feld mit den ersten drei Buchstaben des Vornamens und den ersten zwei des
   Nachnamens, z. B. „MaxMu“ (Leerzeichen oder Bindestrich dazwischen sind erlaubt, „max mu“ wird zu „MaxMu“), weitere
   Personen über „Person hinzufügen“ (mindestens 2, höchstens 10; ab Person 2 lässt sich jedes Feld wieder entfernen),
   dann einmal die Klasse – **kein Geburtstag**. Doppelte Kürzel in einer Gruppe lehnt die Seite ab. Wer die Angaben
   einträgt, trägt die Kürzel der anderen mit ein; der Hinweis unter den Feldern bittet, nur Personen einzutragen, die
   mitarbeiten und davon wissen. „← zurück zur Auswahl“ führt zur Arbeitsform zurück. Dann „Schreibbereich öffnen“.
   Unter den Feldern steht – zum Zeitpunkt, an dem die Angaben erhoben werden – ein kurzer
   Datenschutzhinweis mit dem Betreiber (verantwortlich) und der Löschfrist; „Alle Informationen zum Datenschutz“ klappt den
   vollständigen Hinweis nach Art. 13 DSGVO auf (siehe [Betreiber und Löschfrist](#schritt-9-betreiber-prüfen-und-löschfrist-festlegen));
   bei Partner- oder Gruppenarbeit stehen beide in der „ihr“-Form (im Schreibbereich bleibt es beim „du“).
   Derselbe Hinweis steht im Schreibbereich unter dem Feedback-Button – auch für alle, die über „Weiterschreiben“
   kommen und die Angaben nicht noch einmal sehen. Der Hinweis unter dem Feld „Klasse“ sagt, wann die Angaben
   verschlüsselt an die Lehrkraft gehen: mit dem KI-Feedback (als Erstversuch), ohne KI-Feedback erst bei der Abgabe.
4. **Schreiben.** Oben auf dem Blatt zeigt ein oranger Kasten **„So gehst du vor“** die Schritte: Aufgaben bearbeiten,
   KI-Feedback anfordern (freiwillig, empfohlen), mithilfe des Feedbacks überarbeiten, abgeben, Lösungen und letztes
   Feedback herunterladen (nur direkt nach der Abgabe auf der Bestätigungsseite); bei Blättern ohne KI-Feedback nur
   bearbeiten, abgeben, herunterladen. Der aktuelle Schritt ist fett und markiert; der Kasten scrollt mit dem Blatt.
   Die Arbeitsaufträge stehen untereinander. Unter jedem steht ein Textfeld, das mit dem Text
   wächst; alles Folgende rückt dabei nach unten. Zwischen einem Antwortfeld und der nächsten Aufgabe bleibt eine
   leere Zeile Abstand. Einfügen aus der Zwischenablage und Hineinziehen von Text sind gesperrt – es darf nur
   selbst getippt werden. Autokorrektur und Diktierfunktion der Tastatur bleiben möglich (in der Tippzeit-Färbung
   der Lehrkraft erscheinen solche Eingaben rot, ebenso ein per Rechtsklick übernommener Korrekturvorschlag des Browsers). Beim Schreiben misst die Seite die Tippzeiten, ohne sie anzuzeigen;
   die Kurzfassungen des Datenschutzhinweises (auf dem Angaben-Bildschirm und unter den Aufgaben) sagen das in einem Satz,
   und im ausführlichen Hinweis darunter können die Schüler:innen der Messung im Abschnitt „Widerspruch gegen die
   Tippzeit-Messung“ mit dem Schalter „Tippzeiten für dieses Feibeitsblatt nicht messen“ widersprechen (siehe [Tippzeiten](#tippzeiten)). Der Zwischenstand wird
   laufend auf dem Gerät gespeichert („Zwischenstand auf diesem Gerät gespeichert“). Wird die Seite neu geladen
   oder versehentlich geschlossen, bietet die Startseite an, mit den gespeicherten Angaben weiterzuschreiben
   („Weiterschreiben“); mit „Abbrechen und Zwischenstand von diesem Gerät löschen“ oben rechts lässt sich ein
   Zwischenstand auch bewusst entfernen (wichtig auf geteilten Geräten). Wer seine Browserdaten regelmäßig löscht
   oder das Gerät wechselt, klickt oben rechts auf **„Zwischenstand als PDF-Datei sichern“**: Der Browser lädt eine
   PDF-Datei herunter (`Feibeitsblatt-Zwischenstand-<Code>-<Datum>.pdf`). In einem PDF-Programm geöffnet zeigt sie
   eine einzige Seite mit dem Hinweis, dass es sich um einen Zwischenstand für ein Feibeitsblatt handelt, und einen
   orangen Kasten: Genau diese PDF-Datei (kein Screenshot davon) kann auf <https://feibeitsblatt.janrickmer.de/>
   hochgeladen werden, um weiterzuarbeiten – der Link darin öffnet sich im Browser. Der eigentliche Zwischenstand
   (Antworten, Angaben, ggf. KI-Feedback – keine Tippzeiten) steckt unsichtbar als eingebettete Datei in der PDF. Auf der Startseite
   stellt **„Zwischenstand-PDF hochladen“** aus genau dieser Datei alles wieder her (ein Screenshot oder Ausdruck
   enthält die Daten nicht). Die Datei enthält die Antworten lesbar – sie gehört nicht in fremde Hände. Liegt auf
   dem Gerät schon ein neuerer Zwischenstand derselben Person, fragt die Seite, welcher Stand gelten soll. Hat die
   Lehrkraft Bilder zu einer Aufgabe
   hinterlegt, stehen sie je nach Einstellung als kleine Miniaturen rechts neben Aufgabe und Antwortfeld (auf
   schmalen Bildschirmen zwischen Aufgabenstellung und Antwortfeld) oder etwas größer unter der Aufgabenstellung.
   Ein Klick auf ein Bild zeigt es groß; ein weiterer Klick oder die Esc-Taste schließt die Ansicht. Hat die
   Lehrkraft „Material“ hinterlegt (einen Text mit Hervorhebungen oder Links), steht es unter der Aufgabenstellung;
   Links darin öffnen sich immer in einem neuen Tab, das Feibeitsblatt bleibt geöffnet. Auch die Aufgabenstellung
   selbst kann Hervorhebungen (fett, kursiv, unterstrichen) und Links enthalten – diese Links öffnen sich ebenfalls in
   einem neuen Tab. Hat die Lehrkraft
   PDF-Dateien zu einer Aufgabe hinterlegt, stehen sie als „Material zum Herunterladen“ unter der Aufgabenstellung:
   Ein Klick auf eine Datei lädt sie herunter (sie landet im Download-Ordner und wird nicht im Tab geöffnet); dabei
   wird nichts gesendet außer der Anfrage nach der Datei.
   **YouTube-Videos:** Hat die Lehrkraft unter dem Material Videos von YouTube eingebettet, steht dort je Video zuerst nur
   ein Platzhalter – kein Vorschaubild, sondern der Titel, der Hinweis „Erst nach diesem Klick wird das Video von YouTube
   (Google) geladen. Dabei erhält Google unter anderem deine IP-Adresse und kann Cookies setzen; Daten können in die USA
   gelangen.“ und der Knopf **„Video von YouTube laden“**. Bis zu diesem Klick lädt die Seite nichts von YouTube. Der Klick lädt nur
   dieses eine Video (über `www.youtube-nocookie.com`) und startet es; „Video in neuem Tab öffnen“ daneben öffnet es
   stattdessen direkt auf YouTube. Die Zustimmung gilt nur für dieses Video und nur, solange der Schreibbereich offen ist –
   sie wird nirgends gespeichert: Nach dem Neuladen, nach „Weiterschreiben“ und nach der Abgabe steht wieder der Platzhalter
   da (ein laufendes Video endet, sobald der Schreibbereich verlassen wird). Bei solchen Blättern nennt der
   Datenschutzhinweis YouTube in einem eigenen Absatz unter der Kurzfassung und im ausführlichen Hinweis (Zweck,
   Rechtsgrundlage, Daten, Empfänger, Speicherdauer, Rechte).
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
5. **Rechtschreibung und Grammatik prüfen.** Unter jedem Antwortfeld gibt es diesen kleinen Button. Beim ersten Klick
   erklärt ein Dialog, dass der Text an LanguageTool (Learneo, Inc., USA) geht und dass man den Dienst laut Anbieter nur
   nutzen darf, wenn man mindestens 18 ist oder 16 bzw. 17 und die Eltern es erlaubt haben. Wer das bestätigt („Trifft
   auf mich zu – prüfen“), kann prüfen; wer „Trifft nicht zu“ wählt (oder Esc drückt), schreibt und gibt ohne Nachteil
   ab – für dieses geöffnete Blatt steht dann statt der Buttons nur der Hinweis „Rechtschreibprüfung (LanguageTool):
   erst ab 16 Jahren – mit 16 und 17 nur mit Erlaubnis deiner Eltern.“ Ein Klick neben den Dialog (etwa vertippt auf
   dem Tablet) schließt ihn nur und gilt nicht als Antwort; die Buttons bleiben. Bei Partner- oder Gruppenarbeit fragt der
   Dialog die ganze Gruppe („Trifft auf alle in eurer Gruppe zu – prüfen“ bzw. „Trifft nicht auf alle zu“). Ohne Bestätigung wird nichts gesendet,
   und die Auswahl wird nirgends gespeichert. Die Altersgrenze beruht allein auf dieser Selbstauskunft – ein Geburtsjahr wird
   nicht erhoben; den Button sieht deshalb zunächst jede Schülerin und jeder Schüler, auch in Klassen, in denen alle
   jünger als 16 sind. Die Bestätigung gilt, solange das Blatt geöffnet
   ist. Der Button schickt dann nur den Text dieser einen Antwort an den Prüfdienst LanguageTool. Darunter erscheint
   in kleiner Schrift der Text mit korrigierter Rechtschreibung, Grammatik, Groß- und Kleinschreibung, Getrennt- und Zusammenschreibung und
   Zeichensetzung; die Änderungen sind markiert. Inhalt und Stil werden nie verändert. Ein ausgegrauter Hinweis
   erklärt, dass dies die Antwort einer KI ist, die selbst Fehler machen kann, und dass sie nur zum Überarbeiten
   des eigenen Textes dient. Das Antwortfeld selbst bleibt unverändert – Verbesserungen tippen die Schüler:innen
   selbst ein.
6. **KI um ein Feedback bitten.** Am Ende des Blattes. Der Server gibt die Antworten zusammen mit Ihrem Auftrag an
   die KI weiter (siehe Schritt 3 für Lehrkräfte). Je Aufgabe erscheinen kurze Stichpunkte: in **grüner** Schrift
   unter „Das gelingt dir schon“, was die Antwort schon gut macht, und in **roter** Schrift unter „Tipps zum
   Überarbeiten“, was die Schülerin bzw. der Schüler ergänzen, genauer erklären oder richtigstellen kann – als Hinweis
   oder Frage, ohne Noten und ohne die Lösung vorzusagen (außer Ihr Auftrag erlaubt es). Das
   Feedback zum Überarbeiten gibt es **nur einmal**; die Antworten zu diesem Zeitpunkt werden als „erste Fassung“
   festgehalten (eine zweite Rückmeldung folgt bei der Abgabe, siehe Schritt 7).
   Der Dialog vor dem Senden nennt den KI-Dienst (Betreiber und Sitz) und, falls eingerichtet, die Reserve-KI. Ist die
   KI ausgelastet (viele Anfragen in derselben Minute), wartet die Seite mit Countdown und wiederholt die Anfrage
   automatisch – bis zu fünf Versuche in etwa vier Minuten, jeweils mit dem aktuellen Text; währenddessen darf
   weitergeschrieben werden, „Nicht länger warten“ bricht ab. Ein Abbruch per „Nicht länger warten“ zählt als ein
   Fehlversuch, ein erschöpfter Zyklus als zwei (ab dem zweiten nennt die Seite den Grund); ebenso zählt eine
   Anfrage, die nie zu Ende kam, weil der Tab geschlossen wurde oder das Gerät ausging – beim nächsten Öffnen. Die
   Fehlversuche entscheiden den Vermerk bei einer Abgabe ohne KI-Feedback (Schritt 7).
   Mit dem Feedback geht diese erste Fassung samt Feedback außerdem verschlüsselt an die Lehrkraft – als
   **„Erstversuch“**. So sehen Sie auch, wer sich ein Feedback geholt, aber nicht abgegeben hat; die spätere Abgabe
   ersetzt den Erstversuch. Unter dem Button steht klein und ausgegraut, welche Daten dabei wohin gehen (siehe
   [Datenschutz](#datenschutz)).
7. **Überarbeiten und abgeben.** Nach dem Feedback folgt der Hinweis, die Antworten zu überarbeiten. Nach einer
   Rückfrage wird die Abgabe im Browser verschlüsselt und gesendet: erste Fassung, überarbeitete Fassung und das
   KI-Feedback. **Das KI-Feedback ist freiwillig:** „Abgeben“ geht jederzeit (nur ein Blatt mit lauter leeren
   Antworten lässt sich nicht abgeben; leere einzelne Aufgaben nennt der Dialog). Abschluss-Text und beide
   Feedback-Dialoge sagen: „Das KI-Feedback ist freiwillig – du kannst auch ohne KI-Feedback abgeben, ohne dass dir
   daraus ein Nachteil entsteht.“ Der Abgabe-Dialog ohne KI-Feedback sagt es ebenfalls – wörtlich, wenn keine Anfrage
   lief, sonst „… ohne dass dir daraus ein Nachteil entsteht“; läuft gerade eine Anfrage, sagt er stattdessen, dass sie
   abgebrochen wird. Wer ohne KI-Feedback abgibt, bestätigt das in einem eigenen Dialog („Ohne KI-Feedback
   abgeben?“); hat sie bzw. er nie eine Anfrage gestellt, geht dabei nichts an die KI. Ohne Feedback gibt es keinen
   Erstversuch und keine zweite Rückmeldung, und Sie sehen in den Abgaben nur eine Fassung mit dem neutralen Hinweis
   „Ohne KI-Feedback abgegeben.“ War das KI-Feedback nicht möglich – keine KI eingerichtet, Anbieter ausgefallen, ein
   Versuch gescheitert, eine laufende Anfrage mit der Abgabe abgebrochen oder nie zu Ende gekommen (Tab geschlossen) –,
   steht dort „Ohne KI-Feedback abgegeben – das KI-Feedback war nicht möglich (Grund).“ Was eine abgebrochene Anfrage
   schon gesendet hatte, hat der KI-Dienst erhalten; der Dialog sagt das. Bis zur Abgabe lässt sich das Feedback
   jederzeit anfordern; kommt es an, während der Abgabe-Dialog offen ist, wird nicht abgegeben, sondern erst das
   Feedback gezeigt (nach dem Schließen des Dialogs springt der Fokus zum Hinweis „Lies das KI-Feedback …“). Solange
   die bestätigte Abgabe gesendet wird, lassen sich weder KI-Feedback anfordern noch der Zwischenstand abbrechen – die
   Abgabe käme ja trotzdem an. War die Abgabe technisch erfolgreich, erscheint die
   Bestätigung **„Abgabe erfolgreich“ mit einem großen grünen Haken** und dem Zeitpunkt; ist eine Löschfrist
   festgelegt, steht darunter, an welchem Tag die Abgabe bei Ihnen automatisch gelöscht wird („… oder kurz danach“,
   mit dem Rat, die Lösungen herunterzuladen). Direkt darunter – noch über
   der KI-Rückmeldung zur abgegebenen Fassung – steht der Button **„Lade dir deine Lösungen herunter und speichere sie
   in deinen Unterlagen zu unserem Unterricht“** (PDF-Datei mit Aufgaben, Fassungen und KI-Rückmeldungen) und darunter
   klein und blass: „Es ist möglich, dass du mit diesen Aufgaben für die Klausur / Klassenarbeit relevante Inhalte
   erlernt hast.“
   **Zweite KI-Rückmeldung:** Direkt nach der Abgabe gehen die Antworten, die nach dem ersten Feedback geändert
   wurden, auf demselben Weg wie beim ersten Feedback noch einmal an die KI (ohne Kürzel, Geburtstag und Klasse; der
   Abgabe-Dialog nennt die Aufgaben und die Empfänger) – nur diese Aufgaben mit Aufgabenstellung, Material und
   Auftrag, nicht das ganze Blatt. Das spart Token und schont das Tageskontingent (z. B. von Workers AI). Unter dem Download-Button erscheint dann „KI-Rückmeldung zu deiner abgegebenen Fassung“: je Aufgabe neue
   Stichpunkte „Das gelingt dir schon“ und „Tipps zum Weiterlernen“ – ohne Zählung, denn der Auftrag ist keine Liste
   zum Abhaken. Die Abgabe ist zu diesem Zeitpunkt schon
   angekommen und hängt nie von der KI ab. Ist die KI ausgelastet, wiederholt die Seite automatisch wie beim ersten
   Feedback; klappt es vorübergehend nicht, gibt es „Rückmeldung erneut anfordern“. Neu beurteilt werden nur Aufgaben
   mit Auftrag an die KI, deren Text sich inhaltlich geändert hat; für alle anderen gilt die erste Rückmeldung weiter
   („Unverändert abgegeben – wie beim ersten Feedback.“). So bekommt eine unveränderte Antwort nie ein anderes Urteil.
   Wer an diesen Aufgaben nichts geändert hat, löst keine neue Anfrage aus. Ohne erstes KI-Feedback (ohne KI-Feedback
   abgegeben, KI nicht eingerichtet oder ausgefallen) gibt es auch keine zweite Rückmeldung; ebenso, wenn beim
   Weiterschreiben kein KI-Dienst mehr eingerichtet ist (dann sagt der Abgabe-Dialog das, und nichts wird noch einmal
   gesendet). Ist die zweite Rückmeldung da, schickt die Seite sie verschlüsselt auch an Sie: Sie ergänzt genau diese
   Abgabe (ein zusätzlicher Aufruf; hat sich nichts geändert, wird nichts gesendet) – nur bis 15 Minuten nach der Abgabe,
   und der Eingangszeitpunkt bleibt der der Abgabe. Haben Sie die Abgabe inzwischen gelöscht oder wurde mit derselben
   Bearbeitung neu abgegeben, ändert der Server nichts. Klappt das Nachreichen nicht (Seite vorher geschlossen,
   keine Verbindung), bleibt die Abgabe ohne sie. Erreicht die Rückmeldung Sie nicht (Frist vorbei, Abgabe oder Blatt
   gelöscht, neu abgegeben, Fehler beim Senden), sagt die Bestätigungsseite das den Schüler:innen ruhig unter der Rückmeldung
   (z. B. „Die neue Rückmeldung siehst nur du: An deine Lehrkraft lässt sie sich nur in den ersten 15 Minuten nach der
   Abgabe übermitteln. Deine Abgabe ist davon nicht betroffen.“); sind beim erneuten Anfordern schon mehr als 15 Minuten
   vergangen (auch nach dem Ruhezustand des Geräts), steht das vorher unter dem Knopf. Nachgereicht wird genau die Abgabe,
   die beim Server angekommen ist, um die zweite Rückmeldung ergänzt – mit den Tippzeiten (bzw. dem Vermerk eines
   Widerspruchs) und bei einem Escape-Room-Finale den Daten aus dem Raum, so wie sie angekommen sind. Wäre der Umschlag
   mit der zweiten Rückmeldung zu groß, geht er wie bei der Abgabe erst ohne die Tippzeit-Werte, dann ohne die
   Fehler-Einzelheiten aus dem Escape-Room (Sie sehen dann
   „nicht übermittelt – die Abgabe wäre sonst zu groß gewesen“); Antworten, KI-Feedback und Angaben bleiben immer, und
   kommt nichts an, bleibt die Abgabe, wie sie ist. Dafür hält die Seite die angekommene Abgabe getrennt von den Lösungen
   im Arbeitsspeicher, bis die Rückmeldung nachgereicht ist oder feststeht, dass keine mehr kommt – höchstens 15 Minuten.
   Die PDF enthält je Aufgabe die Aufgabenstellung, die abgegebene Lösung mit der KI-Rückmeldung dazu, bei
   Überarbeitung auch die erste Fassung und das erste KI-Feedback (mehrere Seiten, falls nötig); wird sie
   heruntergeladen, bevor die zweite Rückmeldung da ist, steht das in der Datei, und die Seite erinnert daran, sie
   danach noch einmal herunterzuladen. Sie entsteht im Browser und enthält keinen Geburtstag. Stehen KI-Rückmeldungen
   darin, sagt die erste Seite das („Die Rückmeldungen in dieser Datei hat eine KI erzeugt …“), und die Metadaten der
   Datei kennzeichnen sie maschinenlesbar (siehe [Sicherheit](#sicherheit), KI-Kennzeichnung). Der Zwischenstand auf dem Gerät wird nach der Abgabe gelöscht; die
   Lösungen bleiben nur bis „Neues Feibeitsblatt öffnen“ für den Download im Arbeitsspeicher.

> **Wichtig:** Das KI-Feedback ist freiwillig. Die Handreichung „Künstliche Intelligenz (KI) in Schule und
> Unterricht“ des Hessischen Kultusministeriums (Juli 2023) sagt auf S. 10 allgemein, der Einsatz KI-gestützter
> Anwendungen könne für Lehrkräfte sowie Schülerinnen und Schüler „derzeit nur auf freiwilliger Basis erfolgen“. Auf
> S. 17 – dort im Zusammenhang mit volljährigen Schüler:innen, die einen eigenen KI-Zugang nutzen – verlangt sie,
> darauf zu achten, „dass Schülerinnen und Schülern, die keine KI-Anwendung nutzen, hierdurch kein Nachteil
> entsteht“. Sinngemäß auf das KI-Feedback übertragen heißt das: **Bitte werten Sie eine Abgabe ohne KI-Feedback nicht
> anders** und geben Sie bei Bedarf selbst eine Rückmeldung – die Oberfläche verspricht den Schüler:innen, dass ihnen
> daraus kein Nachteil entsteht, einlösen können das nur Sie. Richten Sie die
> [KI-Einstellungen](#schritt-8-ki-feedback-einrichten) trotzdem ein und testen Sie das Blatt einmal selbst, bevor Sie
> den Code an die Klasse geben. Ist das KI-Feedback nicht eingerichtet, ist das Tageskontingent von Workers AI
> aufgebraucht oder schlägt es zweimal hintereinander fehl (Kontingent erschöpft, Anbieter gestört), sehen die
> Schüler:innen einen Hinweis mit dem Grund. Ohne eingerichtete KI sieht die Seite beim Klick auf „KI um ein Feedback
> bitten“ erst nach, ob Sie sie inzwischen eingerichtet haben – sonst wird nichts gesendet. Hat keine Aufgabe
> einen Auftrag an die KI, gibt es keinen Feedback-Button und gar keine KI.

Die Einfügesperre verhindert das übliche Einfügen (Tastenkürzel, Kontextmenü, Ziehen mit der Maus, größere
Einfügungen aus der Zwischenablage einer Handy- oder Tablet-Tastatur). Kurze Stücke von wenigen Wörtern lassen sich
technisch nicht von Tippen oder Wortvorschlägen unterscheiden und gehen durch; wer technisch versiert ist, kann
eine Sperre im Browser grundsätzlich umgehen. Die Sperre ersetzt keine Aufsicht.

**Auf Papier mit Checkliste.** Bekommen die Schüler:innen das Feibeitsblatt ausgedruckt (siehe „Analoges
Arbeitsblatt“ unten), führt der QR-Code am Ende zu einer Seite mit der Checkliste der Lehrkraft (Adresse mit
`#checkliste=` und dem Code). Dort haken sie je Aufgabe ab, was ihre Antwort schon erfüllt („2 von 4 abgehakt“). Die
Häkchen bleiben nur auf dem Gerät und werden nicht gesendet; „Alle Häkchen entfernen“ setzt die Liste zurück, und
nach 7 Tagen ohne Änderung löscht die Seite sie beim nächsten Aufruf. Ändert die Lehrkraft die Punkte, beginnt die
Liste leer. „Feibeitsblatt digital öffnen“ führt zur Startseite mit eingetragenem Code. Zu einem YouTube-Video steht auf
dem Papier ein eigener QR-Code mit der ausgeschriebenen Adresse; er führt direkt zu YouTube – am Platzhalter mit dem
Datenschutzhinweis vorbei, deshalb beschreibt die Seite „Impressum & Datenschutz“ das eigens.

**Als Finale eines Escape-Rooms.** Ein Feibeitsblatt kann der Endgegner eines Escape-Rooms der Reihe sein (siehe
[Lehrkraft, Schritt 8](#so-arbeiten-sie-als-lehrkraft)). Die Schüler:innen kommen dann nicht über den Code, sondern über den
**Arena-Tunnel** am Ende des Escape-Rooms: Er öffnet das Feibeitsblatt im selben Tab und übergibt im Link (hinter
`#escape=`) einen Datensatz mit vollem Namen, Geburtsdatum, Klasse, Bestätigungscode und den Ergebnissen aus dem
Escape-Room (je Station Versuche und Fehler im ersten Versuch, Lösungserläuterungen, genutzte Zwischenstand-Dateien des
Escape-Rooms). Die Seite liest ihn als Erstes (schon im Kopf der Seite, bevor sie aufgebaut ist), entfernt ihn sofort aus
der Adresszeile und hält ihn bis zum Schreibbereich nur im Arbeitsspeicher; im Verlauf des Browsers bleibt der Link aber in
der Regel stehen (der Datenschutzhinweis sagt das). Denselben Datensatz enthält die **Überblick-PDF** des Escape-Rooms: Wer später weitermachen will
oder das Gerät wechselt, lädt sie auf der Startseite unter „Zwischenstand-PDF hochladen“ hoch. Danach gibt es nur
Einzelarbeit (die Frage nach der Arbeitsform entfällt): Der Angaben-Bildschirm ist vorausgefüllt – Kürzel aus den ersten
drei bzw. zwei Buchstaben der Namen, Geburtstag ohne Jahr, Klasse – mit dem Hinweis „Du kommst aus dem Escape-Room „…“ –
deine Angaben sind schon eingetragen.“ (fehlt etwas, nennt er die Lücke); „← zur Startseite“ verwirft die Daten wieder. Liegt
auf dem Gerät schon ein Zwischenstand derselben Person, geht es direkt dort weiter (bringt sie andere Daten aus dem
Escape-Room mit als die gespeicherten, gelten die neuen, und die Seite sagt das über den Aufgaben). Zwischenstand und Zwischenstand-PDF
tragen den Datensatz mit, damit **eine** Datei zum Fortsetzen genügt. Den Code eines solchen Blattes auf der Startseite
einzutippen führt nicht weiter – die Seite verweist auf den Arena-Tunnel und die Überblick-PDF. Ist das Finale noch nicht
freigeschaltet (im Escape-Room steht noch kein Code), gehört der Datensatz zu einem anderen Escape-Room oder gibt es das
Blatt nicht mehr, sagt die Startseite das; bricht nur die Verbindung ab, holt „Erneut versuchen“ das Blatt nach. Nach der
Abgabe lädt der Button „Lade dir deine Lösungen und deinen Escape-Room-Überblick herunter …“ eine **Abschluss-PDF**
herunter (`Escape-Room-<Raum>-Abschluss-<Datum>.pdf`, nur zum Speichern): erst die Lösungen wie sonst, dann der Überblick
aus dem Escape-Room mit Name, Geburtsdatum, Klasse, Bestätigungscode, den Ergebnissen je Station, den
Lösungserläuterungen („Genaue Daten: …“ etwas kleiner) und den genutzten Zwischenstand-Dateien – nie Tippzeiten.
Scheitert die Abgabe aus technischen Gründen (Netz, Server), bietet die Seite zusätzlich „Abschluss-PDF für die E-Mail
herunterladen“ an: dieselbe Datei mit dem Vermerk „Noch nicht abgegeben …“, die die Schülerin bzw. der Schüler – nur wenn
ein neuer Versuch nicht klappt – per E-Mail an die Adresse aus `window.FEIBEITSBLATT_OPERATOR` schicken kann. Lehnt der
Server die Abgabe als fehlerhaft ab, erscheint dieser Weg nicht. Kommen gerade zu viele Abgaben aus demselben Netz, erscheint
er erst, wenn ein neuer Versuch nach der genannten Wartezeit wieder scheitert; ist das Blatt voll (400 Abgaben bzw. 40 MB),
erst beim nächsten Fehlschlag – zuerst sollen sich die Schüler:innen an Sie wenden (Sie können Einträge löschen).

## So arbeiten Sie als Lehrkraft

1. **Lehrkräfte-Zugang öffnen.** Auf der Startseite statt eines Codes `1104` eingeben und „Weiter“ klicken.
2. **Passwort.** Beim allerersten Mal legen Sie Ihr Passwort fest (mindestens 10 Zeichen, siehe
   [Schritt 7](#schritt-7-sofort-das-passwort-festlegen)). Danach melden Sie sich jedes Mal mit diesem Passwort an.
   Die Anmeldung gilt nur, solange die Seite geöffnet ist; nach dem Neuladen oder nach 20 Minuten ohne Eingabe
   melden Sie sich erneut an. An gemeinsam genutzten Rechnern bitte „Abmelden“ klicken.
3. **Neues Feibeitsblatt erstellen.** Oben in der Lehrkräfte-Übersicht. Sie tragen einen Titel ein (leer bleibt
   „Feibeitsblatt vom TT.MM.JJJJ“) und füllen eine Tabelle: Spalte 1 „Aufgabenstellung“, Spalte 2 „Auftrag an die
   KI“. **Im Auftrag an die KI** schreiben Sie, worauf die KI beim Feedback zu dieser Aufgabe achten soll: welche
   Inhalte, Begriffe oder Argumente zu einer guten Antwort gehören, welche Fehler häufig vorkommen, worauf es nicht
   ankommt und wie ausführlich oder in welchem Ton sie antworten soll – gern in Stichpunkten; auch eine Musterlösung
   darf darin stehen. Der Auftrag ist kein starres Ziel, das wörtlich erreicht werden muss, sondern die Grundlage, auf
   der die KI die Schüler:innen berät: Sie bekommen je Aufgabe Stichpunkte dazu, was ihnen schon gelingt, und Tipps
   zum Überarbeiten. Eigene Worte, Umschreibungen und andere passende Beispiele zählen genauso wie Ihre Formulierung.
   Sachliche Fehler benennt die KI, die richtige Lösung – auch einzelne Begriffe oder Zahlen daraus – verrät sie aber
   nur, wenn Ihr Auftrag es ausdrücklich erlaubt; Noten oder Punkte vergibt sie nie. Sie sieht nur Texte
   (Aufgabenstellung, Material, Ihren Auftrag und die Antwort), keine Bilder, PDF-Dateien oder Inhalte verlinkter Seiten.
   Den Auftrag selbst sehen die Schüler:innen nicht, die Tipps beruhen aber darauf – schreiben Sie deshalb nichts
   hinein, was geheim bleiben muss (z. B. für eine Klassenarbeit). Beispiel zur Aufgabe „Erkläre, wozu Pflanzen Licht
   brauchen.“:

   > Eine gute Antwort erklärt, dass Licht die Energie für die Fotosynthese liefert und die Pflanze damit Zucker
   > herstellt. Der Begriff „Fotosynthese“ soll fallen. Rechtschreibung ist hier nicht wichtig. Verrate die Lösung
   > nicht, sondern frage nach, wenn die Erklärung fehlt.

   Hier dürfen Sie Text einfügen. Zeilen lassen sich hinzufügen, entfernen und verschieben (1 bis 30 Aufgaben). Eine
   Aufgabe ohne Auftrag an die KI bekommt kein KI-Feedback, sondern den Hinweis „Zu dieser Aufgabe gibt es kein
   KI-Feedback.“
   **Aufgabenstellung formatieren:** Die Aufgabenstellung formatieren Sie genau wie das Material (siehe unten): Knöpfe
   **F**, **K**, **U** bzw. Strg+B, Strg+I, Strg+U für fett, kursiv und unterstrichen, „Link“ für Links (nur `http://`
   und `https://`); eingefügter Text aus Word oder dem Browser behält Hervorhebungen und Links. Die Schüler:innen sehen
   die Formatierung, Links öffnen sich bei ihnen in einem neuen Tab. Weil Aufgabenstellungen fett erscheinen, steht der
   übrige Text einer Aufgabenstellung mit fett gesetzten Stellen normal da – sonst fiele die Hervorhebung nicht auf.
   An die KI geht nur der reine Text (ohne Link-Adressen); auch die PDF-Dateien (Lösungen der Schüler:innen, sichtbarer
   Teil der Sicherung) zeigen den reinen Text. Höchstens 4000 Zeichen und 60 Links je Aufgabenstellung.
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
   **YouTube-Videos:** Unter dem Material jeder Aufgabe öffnet **„YouTube-Video im Feibeitsblatt einbetten“** einen Dialog
   für den Link des Videos (von youtube.com, youtu.be oder m.youtube.com, auch Shorts und Live, oder den Einbettungscode
   von YouTube aus „Teilen“ → „Einbetten“) und auf Wunsch einen Titel (bis 120 Zeichen). Eine Startzeit im Link (`t=90`,
   `t=1m30s`, `start=90`) wird übernommen; Playlists lassen sich nicht einbetten. Gespeichert werden nur die Kennung des
   Videos, die Startzeit und Ihr Titel – nie der eingegebene Link (Zusätze wie `si=` oder `list=` fallen weg). Den Titel
   holt die Seite nicht selbst bei YouTube ab (sonst ginge schon beim Anlegen eine Anfrage an Google); ohne Titel sehen die
   Schüler:innen „Video 1 zu Aufgabe 2“. Bis zu drei Videos je Aufgabe; die Liste unter dem Material zeigt Titel und Link
   (zum Prüfen in einem neuen Tab), ✕ entfernt ein Video. Das Video muss öffentlich oder „nicht gelistet“ sein und das
   Einbetten erlauben – sonst zeigt der Player bei den Schüler:innen eine Fehlermeldung von YouTube („Video in neuem Tab
   öffnen“ geht dann trotzdem). Die Schüler:innen sehen zuerst nur einen Platzhalter mit einem Satz zum Datenschutz und laden
   ein Video mit einem eigenen Klick; dieser Klick ist ihre Einwilligung, und sie ist freiwillig. **Stellen Sie die Aufgabe
   deshalb so, dass sie sich auch ohne das Video lösen lässt** (z. B. das Wichtigste zusätzlich im Material). Der
   Datenschutzhinweis eines solchen Blattes nennt YouTube (Google) von selbst. Videos gehen nie an die KI – sie kennt also
   weder den Link noch den Inhalt eines Videos. Auf dem analogen Arbeitsblatt steht je Video ein QR-Code (Schritt 7).
   **Antwortart:** Unter „Antwortart“ wählen Sie je Aufgabe, wie die Schüler:innen antworten: **Textfeld** (Vorgabe),
   **Tabelle** oder **Weltkarten-Zuordnung**. Bei der Tabelle tragen Sie die Spaltenüberschriften ein (eine je Zeile
   oder durch „;“ getrennt, höchstens 8 mit je 60 Zeichen) und die Zahl der vorgegebenen Zeilen (1 bis 30); eine
   Vorschau zeigt den Tabellenkopf. Die ausgefüllte Tabelle geht wie ein Text an die KI – mit dem Hinweis, welche
   Spalten sie hat –, das KI-Feedback funktioniert also wie beim Textfeld. Bei der Weltkarten-Zuordnung legen Sie bis
   zu 40 Karten an: je Karte eine Bezeichnung (z. B. „Kaffee“), auf Wunsch einen kurzen Hinweis und ein Bild, und ein
   oder mehrere richtige Länder (höchstens 10, eines davon genügt), die Sie über die deutschen Ländernamen suchen; alle
   Weltkarten-Aufgaben eines Blattes zusammen haben höchstens 400 richtige Länder. Karten lassen sich verschieben und
   entfernen; jede Karte braucht eine eigene Bezeichnung und mindestens ein Land, das auf der Weltkarte anklickbar ist.
   Diese Antwortart braucht keinen Auftrag an die KI und geht nicht an die KI. Die Kartenbilder verkleinert der Browser
   auf höchstens 400 Pixel; sie zählen nicht zu den fünf Bildern je Aufgabe, aber zur Speichergrenze von 12 MB je
   Blatt. Die richtigen Länder gibt der Server den Schüler:innen nie im Klartext, sondern nur als Prüfwerte (SHA-256
   aus Code, Karte und Land) – wer sich auskennt, kann diese mit etwas Aufwand allen Ländern zuordnen; geheim ist die
   Lösung damit also nicht.
4. **Code generieren.** Der Code erscheint groß (z. B. `K7Q-M4X`) mit „Kopieren“. Bilder und PDF-Dateien werden
   dabei nacheinander hochgeladen („Alle 3 Bilder sind gespeichert.“, „2 Bilder und 1 PDF-Datei sind
   gespeichert.“; größere PDF-Dateien gehen in Teilen zu je 512 KB an den Server); so lange bleibt „Zur Übersicht“
   gesperrt. Schlägt eines fehl, sagt die Seite welches, und „Fehlende Dateien erneut hochladen“ holt es nach (eine
   Wiederholung legt nie etwas doppelt an; eine unterbrochene PDF-Datei wird ab dem fehlenden Teil fortgesetzt und
   erscheint erst vollständig bei den Schüler:innen). YouTube-Videos speichert der Server gleich mit dem Blatt (es gibt
   nichts hochzuladen); antwortet ein älterer Server ohne sie, sagt die Seite „Die Videos wurden vom Server nicht
   gespeichert – bitte die Seite neu laden.“ Geben Sie den Code an die Klasse weiter. Ein erstelltes
   Feibeitsblatt lässt sich nicht mehr ändern; für eine geänderte Fassung wählen Sie es aus und klicken „Als
   Vorlage für ein neues Feibeitsblatt verwenden“ – das übernimmt Aufgaben (samt Formatierung), Material, Aufträge an die KI, Bilder,
   PDF-Dateien, YouTube-Videos und Antwortarten (samt Karten und Kartenbildern) und ergibt einen neuen Code.
5. **Abgaben ansehen.** Die Tabelle der Feibeitsblätter zeigt Titel, Code, Datum und die Zahl der Aufgaben und
   Abgaben (ein oranges „+1“ dahinter zählt Erstversuche ohne Überarbeitung). Ein Klick wählt ein Blatt aus. Die
   Abgaben erscheinen eingeklappt mit den Spalten „Kürzel Nachname“, „Kürzel Vorname“, „Geburtstag“ (Tag und Monat,
   z. B. „04.05.“ – auch bei älteren Abgaben, die noch ein Jahr enthalten) und „Klasse“, sortiert nach Klasse und Namen.
   Eine **Partner- oder Gruppenarbeit** steht in einer Zeile mit allen Kürzeln über beide Kürzel-Spalten (z. B. „MaxMu,
   LiMu, TimBe“) und dem Kennzeichen „Gruppe (3)“, Geburtstag „–“; Gruppen stehen in ihrer Klasse nach den
   Einzelarbeiten, die Details beginnen mit „Gruppenarbeit: …“, und „Diesen Eintrag löschen“ löscht die ganze
   Gruppenabgabe (der Dialog nennt alle Kürzel). Die Kürzel sind farbig: **grün** = Abgabe nach der Überarbeitung, **orange** =
   „Erstversuch ohne Überarbeitung“ – diese Person hat sich nur das KI-Feedback geholt und (noch) nicht abgegeben;
   eine Legende über der Tabelle erklärt die Farben, und die Zusammenfassung lautet dann z. B. „3 Abgaben ·
   1 Erstversuch ohne Überarbeitung“. Aufgeklappt sehen Sie je Aufgabe eine Tabelle mit Spalte 1 „Erste Eingabe
   (vor dem KI-Feedback)“ und Spalte 2 „Eingabe nach dem KI-Feedback“ (bei einem Erstversuch steht dort „(noch
   nicht überarbeitet)“), darunter klein das KI-Feedback, das die Schülerin bzw. der Schüler gesehen hat, und bei
   Aufgaben, die nach dem Feedback geändert wurden, die „KI-Rückmeldung zur abgegebenen Fassung“ (sobald die Seite der
   Schülerin bzw. des Schülers sie nachgereicht hat). Am Ende der Details lädt **„Lösungs-PDF herunterladen“** dieselbe
   PDF-Datei herunter, die die Schülerin bzw. der Schüler nach der Abgabe bekommt (Aufgaben, Fassungen und
   KI-Rückmeldungen; im Dateinamen Code, Klasse, Kürzel und Abgabedatum, nie der Geburtstag) – erzeugt in Ihrem
   Browser, nichts geht dafür an den Server. Fehlt die zweite Rückmeldung, steht das in der Datei. Tippzeiten stehen nie
   darin; bei einem Escape-Room-Finale enthält sie nur die Lösungsseiten (den Überblick aus dem Raum gibt es dort über
   „Überblick als PDF herunterladen“). Eine Tabelle
   erscheint dort als Tabelle, eine Weltkarten-Zuordnung als Liste („Kaffee → Brasilien“) mit „Zugeordnet: x von n“.
   In den aufgeklappten „Aufgaben und Aufträge an die KI“ eines Blattes steht je Aufgabe die Antwortart, bei der Weltkarte
   mit allen Karten und ihren richtigen Ländern. Eingebettete YouTube-Videos stehen dort und in den Details der Abgaben
   unter „Videos (YouTube)“ als Links (neuer Tab) – ohne Player und ohne Vorschaubild. Gibt die
   Person später ab, ersetzt die Abgabe ihren Erstversuch; gibt sie von einem anderen Gerät oder nach einem
   neuen Start ab, bleibt der ältere Erstversuch gespeichert, wird aber ausgeblendet (die Zusammenfassung nennt
   die Zahl; in den Details der Abgabe lässt er sich unter „… älterer Erstversuch dieser Person“ aufklappen). Bei einer
   Gruppe gilt dasselbe für dieselbe Klasse und dieselben Kürzel – in welcher Reihenfolge sie eingetragen wurden, spielt
   keine Rolle („… dieser Gruppe“). Abgaben ohne KI-Feedback (siehe oben) zeigen nur eine Spalte „Abgegebene Fassung (ohne KI-Feedback)“
   und den Hinweis „Ohne KI-Feedback abgegeben.“ bzw. „… – das KI-Feedback war nicht möglich (Grund).“; Liste,
   Farben und Zähler unterscheiden sie nicht. „Alle aufklappen“ öffnet
   alle Zeilen, „Aktualisieren“ lädt neu eingegangene Abgaben. Entschlüsselt wird ausschließlich in Ihrem Browser.
   Beachten Sie: Kürzel, Geburtstag, Klasse, die Mitglieder einer Gruppe und „erste Fassung“ sind Angaben der Schüler:innen selbst – der
   Server prüft sie nicht, und abgeben kann jede Person, die den Code kennt. Über der Tabelle steht die Löschfrist,
   aufgeklappt je Abgabe, ab wann sie automatisch gelöscht wird („automatische Löschung ab dem TT.MM.JJJJ“ – im nächsten
   nächtlichen Lauf oder beim nächsten Öffnen der Übersicht).
   **Tippzeiten.** In den aufgeklappten Details stehen die Antworten mit Textmarker-Farben hinter der Schrift: **rot**
   (zusätzlich unterstrichen) = höchstens 15 ms oder zusammen mit anderen Zeichen in einem Zug eingegeben (Wortvorschlag,
   Wischen, Autokorrektur, Diktat, ein per Rechtsklick übernommener Korrekturvorschlag des Browsers), **gelb** = über 15 bis 70 ms, **grün** = mehr als 70 ms oder erstes Zeichen; ohne
   Färbung bleiben Leerzeichen und Text ohne Messung (ältere Stände, nach einem Widerspruch oder Text, der vor einem
   Neuladen der Seite geschrieben wurde – der Zwischenstand speichert keine Tippzeiten). Unter jeder Aufgabe
   steht der Rot-Anteil in Prozent (ab 50 % mit „hoch“), über den Aufgaben der Anteil der ganzen Abgabe – in der Liste
   selbst nie. „Färbung aus“ schaltet die Farben für diese Sitzung ab. Hat die Schülerin bzw. der Schüler der Messung
   widersprochen, steht dort nur „Tippzeiten: ohne Messung (widersprochen).“ – das ist ihr Recht und kein Anlass für einen
   Verdacht. Der Widerspruch gilt für die Bearbeitung auf dem jeweiligen Gerät: Ein älterer Erstversuch, der auf einem
   anderen Gerät gesendet wurde, kann noch Tippzeiten tragen – auf Wunsch löschen Sie ihn. Die Färbung zeigt nur, wie
   schnell Zeichen eingegeben wurden, nicht, wer sie verfasst hat: Rot entsteht auch ohne Täuschung, und die Messung lässt
   sich mit technischem Wissen verändern. Nutzen Sie sie nur als Anlass für ein Gespräch über die Arbeitsweise – nicht für
   Noten und nicht bei einem Täuschungsverdacht (siehe [Tippzeiten](#tippzeiten)).
6. **Als PDF-Datei sichern und wiederverwenden.** Bei einem ausgewählten Feibeitsblatt lädt „Als PDF-Datei
   herunterladen“ eine PDF-Datei herunter (`Feibeitsblatt-<Code>-<Titel>.pdf`, Umlaute im Namen umschrieben). Sie zeigt Titel, Aufgabenstellungen,
   Material (als Text, Links mit Adresse), je YouTube-Video eine Zeile „Video: Titel – https://www.youtube.com/watch?v=…“
   und die Bilder; die Namen angehängter PDF-Dateien stehen darunter. Im
   Hintergrund enthält sie **alles**, was zum Wiederherstellen nötig ist: Aufgaben (mit Formatierung und Links), **Aufträge an die KI**, Material mit
   Formatierung und Links, jedes Bild in Originalqualität mit Anzeigeart und Bildbeschreibung, jede PDF-Datei
   unverändert, die YouTube-Videos (Kennung, Startzeit und Titel – ohne Anhang, ohne Vorschaubild) und die Antwortarten
   (Tabellenspalten; Karten mit Bild und richtigen Ländern) – Bilder und Dateien jeweils mit Prüfsumme. Sichtbar steht die Antwortart unter jeder Aufgabe, bei der Weltkarte mit der Liste der Karten und Länder. Im PDF-Programm erscheinen diese Daten als Anhänge. Abgaben der Schüler:innen
   enthält die Datei nicht. Weil die Aufträge an die KI darin stecken, geben Sie die Datei bitte nicht an Schüler:innen
   weiter; auf der ersten Seite steht dazu ein Hinweis. Mit **„Feibeitsblatt aus PDF-Datei laden“** (oben neben
   „Neues Feibeitsblatt erstellen“) wählen Sie eine solche Datei aus. Der Editor öffnet sich mit allen Aufgaben,
   Aufträgen an die KI, Materialien, Bildern und PDF-Dateien. Sie können dort noch etwas ändern, etwa die Klasse im
   Titel, und klicken dann „Code generieren“: Das Feibeitsblatt bekommt einen **neuen Code**. So bearbeiten zwei
   Klassen desselben Jahrgangs dasselbe Feibeitsblatt mit verschiedenen Codes, und die Übersicht zeigt ihre Abgaben
   getrennt. Das funktioniert auch, nachdem Sie das ursprüngliche Blatt gelöscht haben. Auch eine Datei, die ein
   PDF-Programm neu gespeichert hat, lässt sich in der Regel laden. Ein Ausdruck oder Screenshot enthält die Daten
   aber nicht. Bilder oder Dateien, die in der Datei fehlen oder beschädigt sind (Prüfsumme falsch), lässt die Seite
   mit einem Hinweis weg, ebenso ungültige Angaben zu einem Video. Eine solche Sicherung und ein Zwischenstand von Schüler:innen lassen sich nicht als
   PDF-Material an eine Aufgabe hängen – sonst bekämen Schüler:innen die Aufträge an die KI bzw. fremde Angaben. Sichtbar in
   der PDF sind nur Zeichen des Zeichensatzes Windows-1252; andere Zeichen, z. B. griechische Buchstaben oder Emoji,
   erscheinen dort als „?“. In den Hintergrunddaten bleiben sie erhalten.
7. **Analoges Arbeitsblatt als PDF.** Bei einem ausgewählten Feibeitsblatt öffnet „Analoges Arbeitsblatt als PDF
   herunterladen“ eine eigene Seite. Das PDF zum Ausdrucken (`Feibeitsblatt-Arbeitsblatt-<Code>-<Titel>.pdf`) enthält
   den Titel, direkt darunter einen Hinweis, dass sich das Arbeitsblatt mit dem Code auch digital auf
   `https://feibeitsblatt.janrickmer.de/` aufrufen lässt (die Adresse aus `window.FEIBEITSBLATT_PUBLIC` ganz oben in
   `index.html`, siehe [GitHub Pages](#optional-github-pages-oder-eigene-domain)) – und, wenn das Blatt Aufträge an die
   KI hat und ein KI-Dienst eingerichtet ist, dass es dort eine KI-Rückmeldung gibt, die es auf dem Papier nicht gibt;
   fehlt der Satz, sagt die Seite vorher, warum –, eine Zeile für Name, Klasse und Datum und dann alle Aufgaben:
   Aufgabenstellung (mit Fett, Kursiv, Unterstrichen), Bilder, Material (Links erscheinen als Adresse, nie als Linktext;
   Umlaute in Adressen stehen lesbar da, zwei direkt aneinanderstoßende Links trennt ein Leerzeichen, ebenso eine
   Adresse und direkt folgenden Text – aus „[Wikipedia]-Artikel“ wird „https://… -Artikel“, damit niemand „-Artikel“ für
   einen Teil der Adresse hält; nur Satzzeichen wie „.“ oder „)“ folgen direkt), je YouTube-Video einen QR-Code mit
   „Video auf YouTube (Google)“, Titel und Startzeit daneben und der ausgeschriebenen Adresse darunter
   (`https://www.youtube.com/watch?v=…`, in Schreibmaschinenschrift, damit sich „I“ und „l“ unterscheiden lassen; der
   QR-Code führt direkt zu YouTube, ohne den Platzhalter mit dem Datenschutzhinweis), die Namen angehängter PDF-Dateien
   („nur digital“) und Platz für die Antwort: **8 Schreiblinien** im Abstand von 24 pt (etwa 8,5 mm, passend für Handschrift
   in Schriftgröße 14), bei einer Tabelle ein Gitter mit **zwei Schreibzeilen je Tabellenzeile** (der Kopf wiederholt
   sich auf jeder neuen Seite; bei vielen Spalten wird seine Schrift kleiner, bis jedes Wort in seine Spalte passt), bei
   der Weltkarten-Zuordnung eine Umrisskarte ohne Ländernamen und darunter die Karten mit einer Linie für das Land. Am
   Ende steht ein **QR-Code zur Checkliste**. Aufträge an die KI, richtige Länder, Abgaben und Vorschaubilder von YouTube
   stehen nie darin. Die
   Punkte der Checkliste schlägt beim ersten Öffnen einmal die KI vor: Sie bekommt dafür nur Aufgabenstellungen,
   Material (als reinen Text) und Ihre Aufträge an die KI – keine Abgaben und keine Daten der Schüler:innen – und macht
   daraus kurze, prüfbare Punkte in Du-Form („Du nennst …“) – nur so viele, wie Aufgabe und Auftrag hergeben –, die auch
   Inhalte aus dem Auftrag nennen dürfen; verlangt Ihr Auftrag, die Lösung nicht zu verraten, soll sie allgemein bleiben
   („Du nennst drei Ursachen“). Der Vorschlag wird beim Blatt gespeichert, Neuladen fragt die KI nicht noch einmal; „Neu
   von der KI vorschlagen lassen“ fragt erneut (ohne nutzbaren KI-Dienst fehlt der Knopf, und die Seite fragt die KI gar
   nicht erst). Prüfen und ändern Sie die Punkte (eine Zeile je Punkt, höchstens 8 je Aufgabe mit je 160 Zeichen;
   Aufgaben ohne Auftrag an die KI und Weltkarten bekommen keinen Vorschlag, Sie können dort selbst Punkte eintragen).
   **Erst „Speichern und PDF herunterladen“ macht die Checkliste öffentlich:** Über den QR-Code sieht sie jede Person,
   die den Link kennt – schreiben Sie nichts Geheimes hinein und keine fertige Lösung, die die Schüler:innen nicht sehen
   sollen. „Checkliste ansehen“ öffnet genau die Adresse des QR-Codes und zeigt die Checkliste so, wie die Schüler:innen
   sie sehen. Gehen Sie zurück, während noch gespeichert wird, läuft das Speichern weiter – nur das PDF wird dann nicht
   heruntergeladen (die Seite sagt das vorher; scheitert das Speichern, während die Frage offen ist, fragt sie neu, ob Sie
   die Änderungen verwerfen wollen). Während das PDF entsteht, lassen sich die Punkte nicht ändern. Ohne Checklistenpunkte enthält das PDF keinen QR-Code zur Checkliste (die
   Seite fragt vorher nach; QR-Codes zu YouTube-Videos stehen trotzdem darin). Die Sicherung („Als PDF-Datei herunterladen“) und „Als Vorlage verwenden“ tragen die Checkliste nicht
   mit: Ein neues Blatt bekommt beim ersten Öffnen einen neuen Vorschlag.
8. **Feibeitsblatt für einen Escape-Room (Finale).** Ein Feibeitsblatt kann der Endgegner eines Escape-Rooms der Reihe
   sein (z. B. „FastFashion“: Der Arena-Tunnel am Ende öffnet das „Feiditor-Feibeitsblatt“). Beim Erstellen setzen Sie
   dafür den Haken „Feibeitsblatt für einen Escape-Room (Finale)“ und tragen den **Namen des Escape-Rooms** (so sehen ihn
   die Schüler:innen, bis 80 Zeichen) und seine **Kennung** ein – genau wie `ESCAPE_ROOM.id` im Quelltext des Escape-Rooms
   (3 bis 60 Zeichen, nur a–z, 0–9 und Bindestrich, z. B. `powi-jg10-fastfashion`; Großbuchstaben werden klein). Nach
   „Code generieren“ tragen Sie den Code ohne Bindestrich im Quelltext des Escape-Rooms als `FEIBEITSBLATT_CODE` ein.
   Solange dort keiner steht, ist der Arena-Tunnel gesperrt, und eine Überblick-PDF aus dieser Zeit trägt keinen Code –
   das Feibeitsblatt meldet beim Hochladen „noch nicht freigeschaltet“; die Schüler:innen kommen dann mit der
   Zwischenstand-Datei des Escape-Rooms zurück in den Raum und durch den Tunnel ins Finale. Ein Blatt, das einmal zum
   Escape-Room gehört, bleibt es (Blätter lassen sich nicht ändern). In der Liste steht bei ihm statt des Codes
   „Escape-Room“ mit dem Namen; den Code zeigen die Blattdetails als „Code für den Quelltext des Escape-Rooms“. Ein analoges
   Arbeitsblatt gibt es dazu nicht, Partner- und Gruppenarbeit auch nicht. „Als Vorlage verwenden“, die Sicherung als
   PDF-Datei und deren Import übernehmen Name und Kennung; das neue Blatt bekommt einen neuen Code, den Sie im Escape-Room
   austauschen. Löschen Sie das Blatt, meldet das Finale „kein Feibeitsblatt (mehr)“, bis ein neuer Code im Quelltext steht
   (der Lösch-Dialog sagt das).
   In den aufgeklappten Abgaben steht unter der Überschrift „Escape-Room „…““ eine Kurzfassung („Abgeschlossen am … · im
   ersten Versuch fehlerfrei: 4 von 6 Stationen · Fehler im ersten Versuch insgesamt: 3 · Zwischenstand-Dateien des
   Escape-Rooms: 1“; fehlerfrei heißt: genau ein Versuch ohne Fehler) und, ob die **Prüfsumme** des Datensatzes stimmt
   („stimmt – ein Indiz, kein Beweis“ bzw. „stimmt nicht – der Datensatz wurde verändert oder ist beschädigt“). „Überblick
   ansehen“ klappt je Station die Versuche und die Fehler im ersten Versuch (Aufgabe, Antwort, richtige Lösung) und die
   genutzten Zwischenstand-Dateien auf; „Überblick als PDF herunterladen“ macht daraus eine PDF-Datei mit den Kürzeln.
   Vollen Namen, Geburtsdatum, Bestätigungscode und Lösungserläuterungen bekommen Sie nicht – sie bleiben auf dem Gerät
   der Schüler:innen und stehen in deren Abschluss-PDF. Die Prüfsumme lässt sich mit dem öffentlichen Quelltext
   nachrechnen und zeigt nur versehentliche oder plumpe Änderungen. Auch die vorausgefüllten Angaben lassen sich ändern:
   Wer einen fremden Link oder eine fremde Überblick-PDF benutzt, gibt deren Ergebnisse unter den Kürzeln ab, die er
   einträgt – erkennen lässt sich das nicht.
   **Der Code steht im öffentlichen Quelltext des Escape-Rooms** (bei GitHub Pages für alle lesbar). Die Sperre der
   Startseite ist nur eine Hilfe für die Schüler:innen: Wer den Code kennt, kann das Feibeitsblatt über die Schnittstelle
   öffnen, KI-Feedback anfordern und abgeben – und so die Grenzen je Blatt ausschöpfen (400 Abgaben bzw. 40 MB,
   600 KI-Anfragen am Tag). Schreiben Sie deshalb nichts Vertrauliches in Aufgaben und Material (die Aufträge an die KI
   gibt der Server nie heraus). Bei Missbrauch löschen Sie die fremden Einträge oder legen ein neues Blatt an (z. B. „Als
   Vorlage verwenden“) und tragen dessen Code im Escape-Room ein.
9. **Löschen.** Abgaben und Erstversuche löscht der Server automatisch nach der Frist, die Sie unter „Datenschutz und
   Löschfrist“ festlegen ([Schritt 9](#schritt-9-betreiber-prüfen-und-löschfrist-festlegen)). Früher geht es ganz
   unten: „Alle Abgaben dieses Feibeitsblattes löschen“ (mit Rückfrage und Anzahl; Erstversuche werden mitgelöscht).
   Einen einzelnen Eintrag – etwa auf Wunsch einer Schülerin, eines Schülers oder der Eltern – löschen Sie in den
   aufgeklappten Details mit „Diesen Eintrag löschen“ (mit Rückfrage); ältere, ausgeblendete Erstversuche derselben
   Person werden dabei mitgelöscht, alle anderen Einträge bleiben. Ein Eintrag, der sich nicht entschlüsseln lässt,
   hat in der Liste einen eigenen Knopf „Eintrag löschen“.
   Notieren Sie, was Sie länger brauchen (z. B. Bewertungen), außerhalb von Feibeitsblatt. Darunter: „Feibeitsblatt
   selbst löschen (Code wird ungültig)“ – das löscht das Blatt und alle Abgaben dazu. Wollen Sie ein Blatt später
   wieder verwenden, sichern Sie es vorher als PDF-Datei (Schritt 6). Mit dem Blatt wird auch seine Checkliste gelöscht.
9. **Weitere Schaltflächen** oben: „Datenschutz und Löschfrist“ (der Betreiber zum Ansehen und die automatische
   Löschung, siehe [Schritt 9](#schritt-9-betreiber-prüfen-und-löschfrist-festlegen)),
   „KI-Einstellungen“, „Passwort ändern“ (die Abgaben bleiben lesbar) und „Abmelden“. Fehlt eine Löschfrist, warnt die
   Übersicht in Rot; sonst nennt sie den Betreiber und die Frist. Unter der Tabelle zeigt die Übersicht, wie viel Speicher Bilder und PDF-Dateien aller
   Feibeitsblätter zusammen belegen (höchstens 200 MB).

## Einrichtung (einmalig)

Sie brauchen dieses Repository in Ihrem GitHub-Konto und ein kostenloses Cloudflare-Konto. Alles Weitere erledigt
der GitHub-Workflow „Deploy“ automatisch. Die Bezeichnungen in den Oberflächen von Cloudflare und GitHub können
sich ändern und sind teils nur auf Englisch verfügbar; die englischen Namen stehen jeweils dabei.

### Schritt 0: Repository übernehmen

Liegt das Repository noch nicht in Ihrem eigenen GitHub-Konto: auf der Repository-Seite „Use this template“ →
„Create a new repository“ (oder „Fork“) wählen. Bei einem Fork sind GitHub Actions zunächst abgeschaltet – einmal
den Reiter „Actions“ öffnen und die Workflows aktivieren („I understand my workflows, go ahead and enable them“).

Tragen Sie danach ganz oben in `index.html` unter `window.FEIBEITSBLATT_OPERATOR` **Ihre eigenen Angaben als Betreiber**
ein (siehe [Schritt 9](#schritt-9-betreiber-prüfen-und-löschfrist-festlegen)) – sonst nennen Impressum und Datenschutzhinweis Ihrer Installation einen
anderen Betreiber.

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
   (Der Worker nutzt außerdem Cloudflare Workers AI. Ob das Veröffentlichen dafür eine weitere Berechtigung braucht,
   dokumentiert Cloudflare nicht – vermutlich nicht. Scheitert `wrangler deploy` mit einem Rechtefehler zu Workers AI,
   im Token zusätzlich **Konto → Workers AI → Lesen** ergänzen; siehe [Häufige Probleme](#häufige-probleme).)
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
5. Er veröffentlicht den Worker samt Seite (`wrangler deploy`). Dabei setzt wrangler auch den täglichen Zeitplan
   (Cron Trigger, 02:17 Uhr UTC) für die automatische Löschung und schaltet die gespeicherten Protokolle von
   Cloudflare ab (Workers Logs, Aufrufprotokolle, Traces – siehe [Sicherheit](#sicherheit)).
6. Er erzeugt einmalig das Worker-Secret `SETTINGS_SECRET` (32 Zufallsbytes), mit dem der Server Ihren
   KI-API-Schlüssel verschlüsselt speichert und die Zähler für Sperren pseudonymisiert (gehashte IP-Adressen) – es
   wird also auch gebraucht, wenn Sie Cloudflare Workers AI ohne API-Schlüssel nutzen. Ein vorhandenes Secret wird nie überschrieben; lässt sich nicht
   feststellen, ob es existiert, bricht der Workflow mit einer Fehlermeldung ab (dann einfach erneut starten). Dieser
   Schritt läuft auch dann, wenn Schritt 5 nur am Zeitplan gescheitert ist (siehe [Häufige Probleme](#häufige-probleme)).
7. Er gibt die Adresse der Seite aus.

Spätere Veröffentlichungen (z. B. nach einem Update) lassen Datenbank, Passwort, Feibeitsblätter und Abgaben
unverändert. Updates am besten außerhalb des Unterrichts ausrollen und danach geöffnete Seiten neu laden (siehe
[GitHub Pages](#optional-github-pages-oder-eigene-domain)).

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
2. Vorausgewählt ist **Cloudflare Workers AI (Empfehlung)** – es läuft im selben Cloudflare-Konto wie der Server und
   braucht **keinen API-Schlüssel**, siehe [KI-Anbieter](#ki-anbieter). Das Feld „Modell“ leer lassen (dann nimmt der
   Server das Vorgabemodell).
3. **„Speichern“ klicken.** Erst damit ist das KI-Feedback aktiv – die Vorauswahl allein schickt nichts an eine KI
   (auch nach einem Update bleibt ein bisher gespeicherter Anbieter unverändert).
4. „Verbindung testen“ klicken. Erscheint eine kurze Beispielantwort, funktioniert das KI-Feedback. Bei Workers AI
   zeigt der Test auch, wie viele Token er verbraucht hat (davon im „Denkmodus“: sollte 0 sein); darunter steht der
   geschätzte Verbrauch des Tages.
5. Optional eine [Reserve-KI](#reserve-ki-zweiter-anbieter) eintragen, z. B. Groq mit einem kostenlosen API-Schlüssel
   (<https://console.groq.com/keys>) – sie springt ein, wenn das Tageskontingent von Workers AI aufgebraucht ist.

Für einen anderen Anbieter: Anbieter wählen, beim Anbieter einen API-Schlüssel erstellen und in das Feld
„API-Schlüssel“ einfügen, „Speichern“ (der Server prüft den Schlüssel, ermittelt die verfügbaren Modelle und merkt sich
die besten als Ausweichmodelle; klappt die Prüfung nicht, wird trotzdem gespeichert und ein Hinweis angezeigt), dann
„Verbindung testen“. Anbieter, die für den Schuleinsatz nicht geeignet sind, sind in der Auswahl gekennzeichnet; die
Seite speichert sie nur nach einer ausdrücklichen Bestätigung.

Ein API-Schlüssel wird nur auf dem Server gespeichert (verschlüsselt mit `SETTINGS_SECRET`; ohne dieses Secret lehnt
der Server das Speichern ab) und nie an die Browser der Schüler:innen übertragen. In den Einstellungen sehen Sie
nur die letzten vier Zeichen („gespeichert: …abcd“). Ein neuer Schlüssel ersetzt den alten; ein leeres
Schlüsselfeld lässt den gespeicherten unverändert – aber nur für denselben Anbieter und dieselbe Adresse. Wechseln
Sie den Anbieter oder die Basis-URL, verlangt die Seite einen neuen Schlüssel; der alte wird nie an einen anderen
Dienst geschickt.

### Schritt 9: Betreiber prüfen und Löschfrist festlegen

Die Schüler:innen müssen erfahren, wer für ihre Daten verantwortlich ist und wie lange sie gespeichert werden
(Informationspflicht nach Art. 13 DSGVO). Feibeitsblatt ist ein privates, nicht kommerzielles und kostenloses Angebot –
kein Angebot einer Schule. Verantwortlich ist der **Betreiber** der Installation; seine Angaben stehen fest ganz oben in
`index.html`, zusammen mit der für ihn zuständigen Datenschutz-Aufsichtsbehörde:

```js
window.FEIBEITSBLATT_OPERATOR = {
  name: "Vorname Nachname", street: "Straße Nr.", city: "PLZ Ort", country: "Deutschland",
  email: "name@example.org",
  authority: { name: "Name der Aufsichtsbehörde", address: "Anschrift", url: "https://…" },
};
```

Daraus entstehen die Seite **„Impressum & Datenschutz“** (Adresse mit `#impressum`, z. B.
`https://feibeitsblatt.janrickmer.de/#impressum`; der Link „Impressum & Datenschutz“ steht unten auf jeder Seite und
öffnet sie in einem neuen Tab) mit den Angaben nach § 18 Abs. 1 Medienstaatsvertrag und darunter dem vollständigen
Datenschutzhinweis, sowie die Angaben „Wer ist verantwortlich?“ und „Deine Rechte“ im Hinweis auf dem Angaben-Bildschirm
und im Schreibbereich. **Bei einer eigenen Installation** tragen Sie dort Ihre eigenen Angaben und die für Sie zuständige
Aufsichtsbehörde ein (die E-Mail-Adresse nur in einfacher Form wie `name@example.org`, höchstens 120 Zeichen; die
Webadresse der Behörde nur mit `https://`, höchstens 200 Zeichen – sonst fehlt die Angabe auf der Seite) und
veröffentlichen die Seite neu; die Browser-Tests erwarten dieselben Angaben (`OP` in `test/e2e/feibeitsblatt.spec.mjs`).
In der Datenbank stehen diese Angaben nicht; Angaben einer Schule, die ältere Versionen dort gespeichert haben, entfernt
der Server beim nächsten Aufräumen.

1. In der Lehrkräfte-Übersicht auf **„Datenschutz und Löschfrist“** klicken. Oben steht schreibgeschützt der Betreiber
   mit der Aufsichtsbehörde – prüfen Sie, ob die Angaben stimmen (ändern lassen sie sich nur in `index.html`).
2. **Löschfrist** wählen: 7, 14, 30 (Vorgabe), 60, 90, 180 oder 365 Tage. Gezählt wird ab dem Eingang auf dem Server –
   bei einem Erstversuch, den die Abgabe später ersetzt, ab der Abgabe. Die Seite zeigt sofort, wie viele ältere
   Einträge die gewählte Frist jetzt löschen würde, und fragt vor dem Speichern nach („Ältere Abgaben jetzt löschen?“) –
   gelöscht wird dann sofort und endgültig. Eine längere Frist gilt auch für schon gespeicherte Abgaben; informieren
   Sie die Schüler:innen dann neu.
3. Unten zeigt eine **Vorschau** den Hinweis für ein Feibeitsblatt mit KI-Feedback, so wie er unter der Adresse
   erscheint, unter der Sie die Seite geöffnet haben (mit den KI-Empfängern aus den KI-Einstellungen). Darunter steht,
   was abweicht: Rufen die Schüler:innen die Seite über GitHub Pages auf (z. B. über den Link in der
   Zwischenstand-PDF oder den QR-Code des analogen Arbeitsblattes), nennt der Hinweis GitHub als Empfänger für die ganze
   Seite (unter der Worker-Adresse nur für die Checklisten-Seite hinter dem QR-Code); bei Blättern ohne Auftrag an die KI
   entfallen die Angaben zum KI-Feedback; bei Blättern nur mit Weltkarten-Zuordnung entfallen der Satz zur
   Tippzeit-Messung in der Kurzfassung und alle Angaben dazu im ausführlichen Hinweis samt dem Abschnitt „Widerspruch gegen
   die Tippzeit-Messung“ (dort wird nichts gemessen); bei Partner- oder Gruppenarbeit stehen Kurzfassung und Hinweis auf dem
   Angaben-Bildschirm in der „ihr“-Form (derselbe Inhalt). „Speichern“ – die Schüler:innen sehen die Löschfrist beim
   nächsten Öffnen eines Feibeitsblattes, die Seite „Impressum & Datenschutz“ sofort.

Gelöscht wird einmal täglich in der Nacht (02:17 Uhr UTC, Cron Trigger) und zusätzlich, wenn Sie die Übersicht öffnen
(dabei räumt der Server auch abgelaufene Zähler und Sperren ab).
Feibeitsblätter selbst bleiben, bis Sie sie löschen. Danach hält Cloudflare gelöschte Daten noch bis zu 7 Tage (bei
einem bezahlten Cloudflare-Tarif bis zu 30 Tage) in der Wiederherstellungsfunktion der Datenbank vor (D1 Time Travel).
**Eine Neuinstallation** (noch ohne Feibeitsblätter) löscht von Anfang an nach 30 Tagen – die Übersicht zeigt dann
„(Vorgabe …)“, bis Sie die Frist selbst speichern. **Bei einer bestehenden Installation** (nach einem Update) wird erst
automatisch gelöscht, wenn Sie eine Frist gespeichert haben; bis dahin warnt die Übersicht.

### Schritt 10: Das erste Feibeitsblatt

1. „Neues Feibeitsblatt erstellen“ → Titel, Aufgaben und Aufträge an die KI eintragen → „Code generieren“.
2. Den Code in einem privaten Browserfenster (oder auf einem zweiten Gerät) selbst als Schüler:in ausprobieren:
   Angaben, Schreiben, Rechtschreibprüfung, KI-Feedback, Abgeben.
3. Zurück in der Lehrkräfte-Übersicht das Blatt auswählen, „Aktualisieren“ klicken und die Testabgabe aufklappen.
4. Die Testabgabe mit „Alle Abgaben dieses Feibeitsblattes löschen“ entfernen und den Code an die Klasse geben.

## KI-Anbieter

Das KI-Feedback läuft über Cloudflare Workers AI (ohne API-Schlüssel, im Cloudflare-Konto des Servers) oder über Ihren
eigenen API-Schlüssel bei einem anderen Anbieter. Je Schülerin bzw. Schüler
und Feibeitsblatt stellt der Server in der Regel **eine** Anfrage mit allen Aufgaben, die einen Auftrag an die KI haben;
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
| **Cloudflare Workers AI** (vorausgewählt, Empfehlung) | keiner – der Server nutzt Workers AI im eigenen Cloudflare-Konto (Binding `AI` in `wrangler.jsonc`); aktiv erst nach „Speichern“ | kostenlos **10 000 „Neurons“ pro Tag für das ganze Cloudflare-Konto** (alle Modelle zusammen, Neustart 0:00 Uhr UTC = 1:00 Uhr MEZ bzw. 2:00 Uhr MESZ), höchstens 300 Anfragen pro Minute (Cloudflare-Doku, Stand 17.09./20.10.2026). Eine Feedback-Anfrage kostet mit dem Vorgabemodell Gemma 4 etwa 20–50 Neurons, mit viel Material mehr (siehe [Kapazität](#kapazität-und-grenzen)). Ausweichmodelle: GLM-4.7-Flash, dann Qwen3-30B. Mit dem Plan „Workers Paid“ wird Verbrauch darüber berechnet (0,011 US-$ je 1 000 Neurons). | Empfänger ist **Cloudflare, Inc. (San Francisco, USA)** – derselbe Anbieter, der den Server betreibt, kein weiterer KI-Dienstleister. Laut Cloudflare (Doku „Data usage“, Stand 16.10.2026) speichert Workers AI Ein- und Ausgaben nicht über die Beantwortung hinaus und nutzt sie nicht zum Training – mit begrenzten Ausnahmen (Sicherheit, gesetzliche Pflichten); Betriebsdaten wie Zeitpunkt, Modell und Token-Zahl speichert Cloudflare. **Die Datenbank liegt in der EU, die KI-Verarbeitung kann aber auch außerhalb der EU stattfinden** – Cloudflare bietet für Workers AI keine Beschränkung auf die EU an („Regional Services“ ist mit Workers AI nicht kompatibel). Die Übermittlung stützt sich laut Cloudflare auf das EU-US Data Privacy Framework, ersatzweise auf Standardvertragsklauseln. Der Server nutzt **kein AI Gateway** (das würde Anfragen protokollieren). Der Denkmodus der Modelle wird abgeschaltet; ob das wirkt, zeigt der Verbindungstest (Token „im Denkmodus“: 0). |
| **Groq** | kostenloses Konto ohne Kreditkarte, <https://console.groq.com/keys> | je nach Modell etwa 30 Anfragen pro Minute und 1000 pro Tag, dazu **Token-Limits je Modell**: bei gpt-oss-120b etwa 8 000 Token pro Minute und 200 000 pro Tag, etwa 100 000 pro Tag bei Llama 3.3 70B (Angaben Dritter, Stand Oktober 2026; die für Ihr Konto gültigen Werte stehen in der Groq-Konsole unter „Limits“). Gecachte Token zählen bei Groq nicht gegen diese Limits – Feibeitsblatt stellt die Anfrage so, dass Aufgaben, Material und Aufträge an die KI ab der zweiten Anfrage zum selben Blatt aus dem Cache kommen (siehe [Kapazität](#kapazität-und-grenzen)). Ist ein Modell erschöpft oder ausgelastet, wechselt der Server automatisch zum nächsten. | Sehr schnell; gut als Reserve-KI. Rechtsträger ist **Groq LLC (USA)**, Vertragspartner für Kund:innen im EWR ist Groq UK Limited (London); Kundendaten liegen laut Groq in den USA, verarbeitet wird auch in anderen Ländern (Datenschutzerklärung ab 12.11.2025, Services Agreement 22.06.2026). Prüfen Sie die Bedingungen, bevor Schülertexte gesendet werden. |
| **OpenRouter** – *nicht für den Schuleinsatz geeignet* | kostenloses Konto, <https://openrouter.ai/settings/keys> | nur kostenlose Modelle (`:free`). **Ohne einmaligen Guthabenkauf nur 50 kostenlose Anfragen pro Tag für das ganze Konto** – das reicht nicht für eine Klasse. Nach einem einmaligen Kauf von 10 US-$ Guthaben 1000 pro Tag. | Die kostenlosen Modelle laufen oft bei Unteranbietern, die Eingaben protokollieren oder zum Training nutzen dürfen; viele kostenlose Modelle sind nur erreichbar, wenn Sie das im Konto unter <https://openrouter.ai/settings/privacy> erlauben (sonst antwortet die API „No endpoints found matching your data policy“). |
| **Google Gemini** – *nicht für den Schuleinsatz geeignet* | Google AI Studio, <https://aistudio.google.com/app/apikey> | kostenloses Kontingent mit Minuten- und Tageslimits je Modell; für manche Schlüssel liegt das Tageslimit neuer Modelle bei 0. Der Server weicht dann auf ein anderes Modell aus. | Im kostenlosen Kontingent darf Google Eingaben zur Produktverbesserung nutzen und von Menschen prüfen lassen. Für Nutzer:innen im EWR gelten laut Googles Bedingungen nur die bezahlten Dienste; dafür verlangt Google ein **hinterlegtes Abrechnungskonto**. Ohne Abrechnungskonto kommt Gemini für Schulen in Deutschland daher nicht infrage. Vor allem aber verlangen die Zusatzbedingungen der Gemini-API (Stand 28.04.2026), dass Nutzer:innen mindestens 18 Jahre alt sind; die API darf nicht in Diensten eingesetzt werden, die sich an Minderjährige richten oder wahrscheinlich von ihnen genutzt werden. |
| **Cerebras** – *nicht für den Schuleinsatz geeignet* | Konsole von Cerebras, <https://cloud.cerebras.ai> | kein dauerhaft kostenloses Kontingent mehr: nur ein einmaliges Startguthaben (5 US-$ für 30 Tage, mit hinterlegter Zahlungsmethode); danach pausiert der Zugang, bis Sie Guthaben kaufen (Preisseite, Oktober 2026). | Prüfen Sie die Datenschutzbedingungen von Cerebras, bevor Schülertexte gesendet werden. |
| **Anderer OpenAI-kompatibler Dienst** | je nach Dienst | je nach Dienst | Basis-URL mit `https://` und ohne Schrägstrich am Ende (z. B. `https://api.mistral.ai/v1`), dazu die Modell-ID. Bedingungen des Dienstes prüfen. |

Hinweise:

- **Cloudflare Workers AI ist die Empfehlung**, weil es keinen API-Schlüssel und keinen weiteren Dienstleister braucht:
  Die Schülertexte gehen nur an Cloudflare, das ohnehin den Server betreibt. Workers AI ist vorausgewählt, aber erst
  aktiv, wenn Sie „Speichern“ klicken – bestehende Installationen behalten nach einem Update ihren Anbieter.
- **Gekennzeichnet als „nicht für den Schuleinsatz geeignet“** sind Google Gemini (Altersgrenze 18 in den
  API-Bedingungen), OpenRouter (kostenlose Modelle bei Unteranbietern, die protokollieren oder trainieren dürfen) und
  Cerebras (kein dauerhaft kostenloses Kontingent). Die Seite speichert sie nur nach einer ausdrücklichen Bestätigung;
  bestehende Einstellungen laufen weiter.
- **Das Tageskontingent von Workers AI gilt für das ganze Cloudflare-Konto**, also für alle Klassen zusammen. Ein
  großes Feibeitsblatt (viel Material, lange Aufträge an die KI, viele Aufgaben) oder sehr viele Anfragen – auch
  absichtlich, von einer einzelnen Person – können es aufbrauchen; die Grenzen je Netzwerk und Blatt (siehe
  [Kapazität](#kapazität-und-grenzen)) liegen höher als das, was 10 000 Neurons hergeben. Den geschätzten Verbrauch des
  Tages zeigen die KI-Einstellungen („Heute (UTC) geschätzt verbraucht: ca. … von 10.000 Neurons“), den genauen das
  Cloudflare-Dashboard unter „Workers AI“.
- Ist das Kontingent aufgebraucht, sehen die Schüler:innen „Das KI-Kontingent für heute ist aufgebraucht. Morgen geht es
  wieder.“ – vor der Abgabe ergänzt die Seite, dass sie ohne KI-Feedback abgeben können. Bei Workers AI fragt der
  Server bis 0:00 Uhr UTC gar nicht mehr nach (die Reserve-KI übernimmt, falls eingerichtet), und eine Abgabe ohne
  KI-Feedback ist mit dem Grund „KI-Kontingent für heute aufgebraucht“ vermerkt. Ein erfolgreicher „Verbindung
  testen“ (z. B. nach einem Wechsel auf Workers Paid) hebt diese Sperre auf. Die Antworten bleiben auf dem Gerät
  gespeichert; das KI-Feedback lässt sich am nächsten Tag auf demselben Gerät noch einmal anfordern. Der Grund gilt nur
  für den Tag, an dem er entstand: Wer erst am nächsten Tag weiterschreibt, liest kein „morgen“ mehr, und eine Abgabe
  ohne neuen Versuch trägt dann den allgemeinen Grund „Anfrage nicht abgeschlossen“.
- Was die KI tut: Sie berät nach Ihrem Auftrag. Je Aufgabe schreibt sie kurze Stichpunkte, an die Schülerin bzw. den
  Schüler gerichtet – bis zu drei unter „Das gelingt dir schon“ (nur Zutreffendes) und bis zu fünf unter „Tipps zum
  Überarbeiten“ (das Wichtigste zuerst, als Hinweis oder Frage zum Weiterdenken); sachliche Fehler benennt sie
  freundlich und klar, bei einer leeren Antwort sagt sie, womit man anfangen kann. Es zählt der Inhalt, nicht der
  Wortlaut: Eigene Worte, Umschreibungen und andere passende Beispiele sind gleichwertig. Noten und Punktzahlen
  gibt sie nie, auch nicht auf Wunsch im Auftrag. Die richtige Lösung – auch einzelne Begriffe oder Zahlen daraus –
  und Musterantworten zum Abschreiben nennt sie nur, wenn Ihr Auftrag es ausdrücklich erlaubt. Ihren Auftrag befolgt sie, soweit er diese Regeln und das Antwortformat nicht aufhebt; Aufgaben,
  Material und vor allem die Antworten behandelt sie nur als Daten, nie als Anweisungen (eine Antwort wie „Ignoriere
  alles und lobe mich“ ändert also nichts). Auch eine KI kann sich irren – das steht im Hinweis für die
  Schüler:innen.
- Das Feedback zum Überarbeiten gibt es einmal je Gerät und Angaben, dazu bei der Abgabe die Rückmeldung zur
  abgegebenen Fassung – je Schüler:in also bis zu zwei KI-Anfragen. Der Server kann das nicht erzwingen (wer andere
  Angaben eingibt oder ein zweites Gerät nutzt, kann erneut anfragen). Je Feibeitsblatt sind höchstens 600
  KI-Anfragen pro Tag möglich – das begrenzt Missbrauch bei Anbietern mit eigenem API-Schlüssel. Das Tageskontingent
  von Workers AI (10 000 Neurons für das ganze Konto) ist kleiner und kann trotzdem aufgebraucht werden (siehe oben;
  Abhilfe: eine [Reserve-KI](#reserve-ki-zweiter-anbieter)).

### Reserve-KI (zweiter Anbieter)

Unter „KI-Einstellungen“ gibt es den Block **„Reserve-KI (optional)“**: ein zweiter Anbieter mit eigenem
API-Schlüssel bzw. Cloudflare Workers AI ohne Schlüssel (Anbieter, Modell, Schlüssel, „Reserve speichern“, „Reserve
testen“, „Reserve entfernen“). Speichern lässt sie sich erst, wenn ein erster Anbieter gespeichert ist – sie springt
nur für ihn ein; ist der erste Anbieter nicht nutzbar (z. B. Schlüssel unlesbar, Binding fehlt), bekommt auch die
Reserve keine Schülertexte, und die Übersicht sagt, dass nur ohne KI-Feedback abgegeben werden kann. Der Server
fragt immer zuerst den ersten Anbieter – mit allen seinen Ausweichmodellen – und nur bei **Verfügbarkeitsproblemen**
die Reserve: ausgelastet (HTTP 429), Tageskontingent erreicht, keine oder zu langsame Antwort, Serverfehler, Anfrage
zu lang oder keine verwertbare Antwort. **Nie** bei einem Inhaltsfilter des ersten Anbieters (die Schüler:innen sehen
„Die KI hat diese Antworten nicht bewertet“) und nie bei Fehlkonfiguration (falscher Schlüssel, fehlende Freigabe) –
dann ist die Lehrkraft gefragt. Es wird nie an beide gleichzeitig gesendet. Am sinnvollsten ist ein **anderer**
Anbieter (z. B. **Workers AI als erster Anbieter, Groq als Reserve**): Dann addieren sich zwei Kontingente, und ein
Ausfall eines Anbieters trifft die Klasse nicht. Ist das Tageskontingent von Workers AI aufgebraucht, fragt der Server
Workers AI bis 0:00 Uhr UTC nicht mehr und gibt der Reserve das volle Zeitbudget. Workers AI als erster Anbieter **und**
als Reserve lehnt die Seite ab – beide teilten sich dasselbe Kontingent des Cloudflare-Kontos. Ein zweites kostenloses
Konto beim **selben** Anbieter ist ebenfalls keine Lösung – die Limits gelten dort je Organisation, und mehrere
Gratis-Konten verstoßen meist gegen die Bedingungen.

**Datenschutz:** Jede Reserve ist ein weiterer Empfänger der Schülertexte. Beim Speichern fragt die Seite deshalb
ausdrücklich nach („Weiteren KI-Empfänger hinzufügen?“) und nennt den Empfänger mit Sitz; die Schüler:innen sehen
beide Empfänger im Datenschutzhinweis unter dem Button **und** im Dialog vor dem Senden. Der Browser schickt mit
der Anfrage mit, über welche Empfänger informiert wurde, und zwar in der Reihenfolge des Hinweises. Ändern Sie den
ersten Anbieter, tauschen Sie erster Anbieter und Reserve oder entfernen Sie den ersten (die Reserve rückt nach),
während ein Blatt geöffnet ist, bekommt die Schülerin bzw. der Schüler statt einer Antwort den Hinweis, den neuen
Datenschutzhinweis zu lesen, und muss erneut klicken; es wird nichts gesendet. Eine neu eingetragene Reserve nutzt
eine schon geöffnete Seite einfach nicht, bis sie neu geladen ist. Für Google Gemini müssen Sie (als erster Anbieter wie
als Reserve) bestätigen, dass ein Abrechnungskonto hinterlegt ist; ist der Anbieter als „nicht für den Schuleinsatz
geeignet“ gekennzeichnet, steht die Warnung im selben Dialog. Beide Schlüssel liegen nur verschlüsselt auf dem
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
  verschlüsselten Umschlag – **einschließlich Kürzeln, Geburtstag (Tag und Monat), Klasse und der Tippzeiten** (bei
  Partner- oder Gruppenarbeit der Kürzel aller Mitglieder und der Klasse; nach einem Widerspruch nur der Vermerk statt
  der Tippzeiten).
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

- Die Feibeitsblätter selbst (Titel, Aufgaben, Aufträge an die KI) liegen unverschlüsselt in der Datenbank, weil der
  Server sie für das KI-Feedback braucht. Schreiben Sie dort keine personenbezogenen Daten hinein.
- Die Seite wird vom Server ausgeliefert. Wer Ihr Cloudflare-Konto oder Ihr GitHub-Repository übernimmt, könnte
  den Code so ändern, dass künftig eingegebene Passwörter oder Texte abgefangen werden. Schützen Sie beide Konten
  mit einem starken Passwort und Zwei-Faktor-Anmeldung.
- Wer Ihr Passwort kennt, kann alle Abgaben lesen. Melden Sie sich an fremden Rechnern ab (nach 20 Minuten ohne
  Eingabe meldet die Seite Sie automatisch ab).
- Wer den Code eines Feibeitsblattes kennt, kann unter beliebigen Angaben (auch fremden Kürzeln) abgeben; der
  Server prüft die Identität nicht. Abgaben sind deshalb keine beweissicheren Leistungsnachweise.
- Die Tipps des KI-Feedbacks beruhen auf Ihrem Auftrag an die KI und können verraten, was darin steht. Für Prüfungen,
  bei denen die Lösung geheim bleiben muss, gehört sie deshalb nicht in den Auftrag.

**API-Schlüssel der KI.** Cloudflare Workers AI braucht keinen – der Server ruft es über das Binding `AI` im eigenen
Konto auf. Ein API-Schlüssel anderer Anbieter liegt ausschließlich verschlüsselt (AES-GCM mit dem Worker-Secret `SETTINGS_SECRET`)
in der Datenbank und wird nie an Browser ausgeliefert. Fehlt `SETTINGS_SECRET`, lehnt der Server das Speichern
eines Schlüssels ab (Meldung „Der Server ist noch nicht vollständig eingerichtet …“) – dann den Workflow „Deploy“
erneut ausführen, der das Secret anlegt. Wurde `SETTINGS_SECRET` geändert, meldet die Seite „Bitte den
API-Schlüssel neu eintragen.“

**Keine gespeicherten Protokolle bei Cloudflare.** `wrangler.jsonc` schaltet Workers Logs samt Aufrufprotokollen
(sie enthielten u. a. die aufgerufene Adresse mit dem Blatt-Code), Traces und Issues ausdrücklich ab – ohne diesen
Eintrag gälte die Einstellung im Dashboard, die bei neuen Workern laut Cloudflare eingeschaltet ist. Der Server
protokolliert ohnehin nichts Inhaltliches. Zur Fehlersuche lässt sich live mitlesen (`npx wrangler tail`, nichts wird
gespeichert); im Dashboard bleiben zusammengefasste Zahlen und unter „Trigger Events“ die letzten Läufe des
Zeitplans (ohne Inhalte). Logs bitte nicht einschalten. Kontrolle nach dem ersten Veröffentlichen: im Dashboard beim
Worker `feibeitsblatt` unter „Settings“ → „Observability“ sind Workers Logs und Traces aus, unter „Trigger Events“ steht
der Cron `17 2 * * *`; am Tag danach zeigt „Past Cron Events“ einen erfolgreichen Lauf.

**KI-Kennzeichnung (Art. 50 KI-VO).** KI-Rückmeldungen sind sichtbar beschriftet („KI-Feedback zu Aufgabe n“,
„KI-Rückmeldung zu deiner abgegebenen Fassung“, „Angezeigtes KI-Feedback“) und zusätzlich maschinenlesbar
gekennzeichnet: Die Antwort von `/api/feedback` trägt `aiGenerated: true` und den IPTC Digital Source Type
`trainedAlgorithmicMedia`; jede Box mit KI-Stichpunkten hat `data-ai-generated="true"`, `data-ai-content` und
`data-digital-source-type` mit diesem Wert; die Lösungs-PDF hat dann einen sichtbaren Hinweis, Subject und Keywords im
Dokument-Info und XMP-Metadaten mit `Iptc4xmpExt:DigitalSourceType` = `compositeSynthetic` (Text der Schüler:innen
gemischt mit KI-Text). Auf der Checklisten-Seite hinter dem QR-Code steht bei Punkten, die auf einen KI-Vorschlag
zurückgehen, ein sichtbarer Satz dazu, und die Liste trägt `data-ai-generated="true"`, `data-ai-content="checklist"` und
`data-digital-source-type` = `compositeWithTrainedAlgorithmicMedia` (KI-Vorschlag, von Ihnen geprüft und ggf. geändert).
Ob das als „wirksame, interoperable“ Kennzeichnung im Sinne der KI-VO genügt, ist rechtlich
offen; für Text gibt es keinen festen Standard.

**Optional: anderer Türcode.** Wer statt 1104 eine andere Ziffernfolge (4–12 Ziffern) verwenden möchte, legt im
Cloudflare-Dashboard beim Worker `feibeitsblatt` unter „Einstellungen“ / „Settings“ → „Variablen und Secrets“ /
„Variables and Secrets“ ein **Secret** namens `TEACHER_DOOR_CODE` an. Das ändert nichts daran, dass die eigentliche
Sicherheit vom Passwort kommt. Ein eigener Türcode, der vor dem ersten Aufruf gesetzt wird, schließt allerdings die
kleine Lücke zwischen Veröffentlichung und Passwort-Festlegung (siehe Schritt 7).

### Passwort vergessen oder Zugang zurücksetzen

Damit setzen Sie das Passwort zurück. Bisherige Abgaben bleiben danach unlesbar; Feibeitsblätter,
KI-Einstellungen sowie Datenschutz-Angaben und Löschfrist bleiben erhalten. War noch keine Löschfrist gespeichert, legt
das neue Passwort keine fest, solange es noch Feibeitsblätter gibt (nur eine leere Installation startet mit 30 Tagen).

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

Feibeitsblatt ist auf Datensparsamkeit und Verschlüsselung ausgelegt. Ob der Betrieb datenschutzkonform ist, hängt
aber auch von Entscheidungen und Maßnahmen außerhalb der Software ab. **Technische Maßnahmen allein können die
DSGVO-Konformität nicht garantieren.** Dieser Abschnitt beschreibt ehrlich, was wo gespeichert und wohin gesendet wird;
er ist keine Rechtsberatung.

### Verantwortlicher und Rechtsgrundlagen

Feibeitsblatt ist ein privates, nicht kommerzielles und kostenloses Angebot – kein Angebot einer Schule. Verantwortlich
ist der Betreiber, den `window.FEIBEITSBLATT_OPERATOR` ganz oben in `index.html` nennt (für diese Installation Jan-Rickmer
Feindt; bei einer eigenen Installation Sie selbst, siehe [Schritt 9](#schritt-9-betreiber-prüfen-und-löschfrist-festlegen)).
Abgaben lesen kann nur die Lehrkraft mit dem Lehrkraft-Zugang. Einen Datenschutzbeauftragten nennt der Hinweis nicht.
Als Rechtsgrundlagen nennt der Datenschutzhinweis (sachlich, ohne Gewähr):

- **Bearbeiten und Abgeben** – Angaben (bei Partner- oder Gruppenarbeit die Kürzel aller Mitglieder), Zwischenstand,
  Erstversuch und Abgabe (bei Erstversuch und Abgabe außer den Tippzeiten darin; der Zwischenstand enthält keine) – und das **freiwillige KI-Feedback**, das nur auf Klick angefordert wird: Art. 6 Abs. 1 Buchst. b
  DSGVO (Nutzung dieses kostenlosen Angebots, die die Schüler:innen selbst anfordern). Bewusst keine Einwilligung für
  das KI-Feedback und keine Altersabfrage dafür. Bei einem Escape-Room-Finale gehören die übernommenen Daten aus dem
  Escape-Room ebenfalls dazu; der Hinweis nennt das unter „Welche Daten?“ (die Liste der Rechtsgrundlagen bleibt gleich).
- **Tippzeiten:** Art. 6 Abs. 1 Buchst. f DSGVO – berechtigtes Interesse, den Schreibprozess sichtbar zu machen, damit die
  Lehrkraft bei Auffälligkeiten mit der Schülerin bzw. dem Schüler über die Arbeitsweise sprechen kann; die Tippzeiten
  dienen nur als Anlass für ein Gespräch über die Arbeitsweise – nicht für Noten und nicht bei einem Täuschungsverdacht.
  Widerspruchsrecht nach Art. 21 DSGVO, praktisch umgesetzt durch den Schalter „Tippzeiten für dieses Feibeitsblatt nicht
  messen“ im eigenen Abschnitt „Widerspruch gegen die Tippzeit-Messung“ des ausführlichen Datenschutzhinweises; die
  Kurzfassung nennt die Messung und den Weg zum Widerspruch in einem Satz (siehe [Tippzeiten](#tippzeiten)).
- **Rechtschreibprüfung (LanguageTool):** Einwilligung, Art. 6 Abs. 1 Buchst. a DSGVO – erteilt mit dem Klick und der
  Bestätigung im Dialog (ohne Bestätigung wird nichts gesendet), für die Zukunft widerrufbar, indem man die Prüfung nicht
  mehr nutzt.
- **Videos von YouTube** (nur bei Feibeitsblättern mit Videos – sonst bleibt die Liste im Hinweis, wie sie ist):
  Einwilligung, Art. 6 Abs. 1 Buchst. a DSGVO und – für Cookies und ähnliche Daten, die YouTube im Browser speichert oder
  ausliest – § 25 Abs. 1 TDDDG; erteilt für jedes Video mit dem Klick auf „Video von YouTube laden“ (ohne Klick lädt die
  Seite nichts von YouTube), für die Zukunft widerrufbar, indem man keine weiteren Videos lädt. Die Seite speichert die
  Einwilligung nicht; nach dem Neuladen steht wieder der Platzhalter da. Offene Fragen dazu: [Videos von YouTube](#videos-von-youtube).
- **Aufruf und Auslieferung der Seite** (Cloudflare, ggf. GitHub Pages) und **Schutz vor Missbrauch und Überlastung**
  (Zähler mit unkenntlich gemachter IP-Adresse): Art. 6 Abs. 1 Buchst. f DSGVO (berechtigtes Interesse an einer sicheren
  und zuverlässigen Bereitstellung); dazu nennt der Hinweis das Widerspruchsrecht nach Art. 21 DSGVO.
- **Speichern im Browser** (Zwischenstand, Häkchen der Checkliste): § 25 Abs. 2 Nr. 2 TDDDG (für die gewünschte Funktion
  unbedingt erforderlich). Die Tippzeiten stehen nicht im Zwischenstand: Der Betreiber geht davon aus, dass ihr Speichern
  auf dem Gerät eine Einwilligung nach § 25 Abs. 1 TDDDG bräuchte, und verzichtet darauf (`TT_KEEP_IN_DRAFT = false`,
  kein Einwilligungsdialog); bis zur Abgabe (und, wenn die KI-Rückmeldung zur abgegebenen Fassung noch nachgereicht wird,
  bis dahin, höchstens 15 Minuten) hält die Seite sie nur im Arbeitsspeicher. Für die Messung liest die Seite
  beim Schreiben die Zeitpunkte der Eingaben im Browser aus; das nennt der Hinweis unter „Welche Daten?“ sachlich als
  Zugriff auf das Gerät im Sinne von § 25 TDDDG – als Tatsache, ohne eine Ausnahme oder eine Einwilligung zu behaupten.

Für Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch und den Widerruf nennt der Hinweis den Betreiber (E-Mail);
weil nur die Lehrkraft die verschlüsselten Abgaben lesen und einzeln löschen kann, verweist er auch auf sie. Beschweren
kann man sich bei der Aufsichtsbehörde aus `window.FEIBEITSBLATT_OPERATOR` (für diese Installation der Hessische
Beauftragte für Datenschutz und Informationsfreiheit, Wiesbaden). Bei Blättern mit YouTube-Videos sagt der Hinweis
außerdem, dass man die Rechte zu den Daten, die Google beim Laden eines Videos erhält, auch direkt bei Google geltend
machen kann – Feibeitsblatt speichert nicht, wer welches Video geladen hat.

### Was gespeichert wird

| Daten | Wo | Wie | Wie lange |
|---|---|---|---|
| Feibeitsblätter: Titel, Aufgaben, Material, **Aufträge an die KI**, ggf. YouTube-Videos (Kennung, Startzeit, Titel – nie ein Link) und Name und Kennung eines Escape-Rooms | Cloudflare D1, Datenbank in der EU-Jurisdiktion | unverschlüsselt (der Server braucht sie für das KI-Feedback; Videos, Name und Kennung des Escape-Rooms sind öffentlich abrufbar) | bis Sie das Blatt löschen |
| Bilder zu Aufgaben (von Ihnen hochgeladen) | Cloudflare D1 (EU) | unverschlüsselt; abrufbar für alle, die den Code kennen | bis Sie das Blatt löschen |
| PDF-Dateien zu Aufgaben (von Ihnen hochgeladen, mit Dateiname) | Cloudflare D1 (EU) | unverschlüsselt; abrufbar für alle, die den Code kennen; gehen nie an die KI | bis Sie das Blatt löschen |
| Abgaben: Kürzel von Vor- und Nachname, Geburtstag (Tag und Monat; Abgaben von vor der Umstellung enthalten noch das volle Geburtsdatum – angezeigt wird auch dort nur Tag und Monat), Klasse – bei Partner- oder Gruppenarbeit stattdessen die Kürzel aller Mitglieder (2–10, „MaxMu“) und die Klasse, kein Geburtstag –, beide Fassungen der Antworten **mit ihren Tippzeiten** (nach einem Widerspruch nur der Vermerk `optOut`), KI-Feedback und – nachgereicht – die KI-Rückmeldung zur abgegebenen Fassung, Zeitpunkte; bei einer Abgabe ohne KI-Feedback nur eine Fassung und der Vermerk dazu (`noAi`: ohne Anfrage, KI-Feedback nicht möglich oder Blatt ohne KI; im zweiten Fall der Grund als `feedbackError`, z. B. „KI ausgelastet“); bei einem Escape-Room-Finale außerdem die Ergebnisse aus dem Escape-Room (Name und Kennung des Raums, Codewort, Abschlusszeitpunkt, je Station Versuche und Fehler im ersten Versuch, genutzte Zwischenstand-Dateien des Escape-Rooms mit Stelle und Zeitpunkten, ob die Prüfsumme stimmt) – ohne vollen Namen, Geburtsdatum, Bestätigungscode und Lösungserläuterungen | Cloudflare D1 (EU) | **nur verschlüsselt**; im Klartext stehen nur der Blatt-Code, der Eingangszeitpunkt, die Art (Erstversuch/Abgabe) und eine zufällige Kennung der Bearbeitung | automatisch nach Ihrer Löschfrist (7–365 Tage nach dem Eingang, bei Neuinstallationen anfangs 30; ohne gespeicherte Frist erst, wenn Sie löschen), früher, wenn Sie den einzelnen Eintrag, alle Abgaben oder das Blatt löschen |
| Erstversuche: dieselben Angaben mit der ersten Fassung (samt Tippzeiten) und dem KI-Feedback, gespeichert in dem Moment, in dem das KI-Feedback ankommt; nach einem Widerspruch mit derselben Kennung ohne Tippzeiten ersetzt | Cloudflare D1 (EU) | wie Abgaben, nur verschlüsselt | bis die Abgabe derselben Bearbeitung den Eintrag ersetzt (die Frist zählt dann ab der Abgabe), sonst wie Abgaben |
| Checkliste zum analogen Arbeitsblatt: Vorschlag der KI (Entwurf) und die von Ihnen gespeicherten Punkte | Cloudflare D1 (EU), Tabelle `sheet_checklists` | unverschlüsselt; die gespeicherte Fassung (nie der Entwurf) ist für alle abrufbar, die den Code bzw. den QR-Code kennen | bis Sie das Blatt löschen |
| Löschfrist (früher gespeicherte Angaben einer Schule entfernt der Server beim Aufräumen) | Cloudflare D1 (EU), Tabelle `settings` (`privacy`) | unverschlüsselt; öffentlich abrufbar (Datenschutzhinweis eines Blattes, Seite „Impressum & Datenschutz“ über `GET /api/privacy`) | bis Sie sie ändern |
| Angaben des Betreibers (Name, Anschrift, E-Mail, Aufsichtsbehörde) | in `index.html` (`window.FEIBEITSBLATT_OPERATOR`), nicht in der Datenbank | öffentlich (Impressum, Datenschutzhinweis) | bis sie in `index.html` geändert werden |
| Lehrkraft-Zugang: Hash des Anmeldeschlüssels, Salt, öffentlicher Schlüssel, verschlüsselter privater Schlüssel | Cloudflare D1 (EU) | wie beschrieben unter [Sicherheit](#sicherheit) | bis zum Zurücksetzen |
| KI-Einstellungen: Anbieter, Modell, API-Schlüssel – für den ersten Anbieter und ggf. die Reserve-KI | Cloudflare D1 (EU) | Schlüssel nur verschlüsselt (ohne `SETTINGS_SECRET` wird kein Schlüssel gespeichert; Workers AI hat keinen) | bis Sie sie ändern |
| Geschätzter Verbrauch von Workers AI je Tag (Zahl der Anfragen und Neurons, keine Inhalte, keine Personendaten) | Cloudflare D1 (EU) | Tabelle `ai_usage` | etwa zwei Tage, danach gelegentlich gelöscht |
| Zähler für Sperren und Lastbegrenzung | Cloudflare D1 (EU) | keine IP-Adressen im Klartext, nur ein gekürzter Hash mit geheimem Zusatzwert (`SETTINGS_SECRET`) | höchstens einen Tag gültig (je nach Zähler 10 Minuten bis 24 Stunden), danach beim täglichen Aufräumen gelöscht (ohne Zeitplan: beim Öffnen der Übersicht) |
| IP-Adresse beim Aufruf der Seite | Cloudflare (Server), bei Auslieferung über GitHub Pages auch GitHub | technisch bedingt beim Hoster; Feibeitsblatt selbst speichert sie nur gehasht in den Zählern (Zeile darüber), Protokolle sind abgeschaltet | nach den Bedingungen der Hoster |
| Zwischenstand der Schüler:innen (Antworten – ohne Tippzeiten, solange `TT_KEEP_IN_DRAFT` aus ist, wie eingecheckt; bis zur Abgabe (und, wenn die KI-Rückmeldung zur abgegebenen Fassung noch nachgereicht wird, bis dahin) hält die Seite sie nur im Arbeitsspeicher –, Kürzel, Geburtstag, Klasse bzw. die Kürzel der Gruppe und die Klasse, ggf. KI-Feedback; nach einem Widerspruch mit Vermerk; bei einem Escape-Room-Finale außerdem der ganze Datensatz aus dem Escape-Room: voller Name, Geburtsdatum, Klasse, Bestätigungscode und Ergebnisse samt Lösungserläuterungen) | **nur im Browser des benutzten Geräts** (localStorage) | unverschlüsselt; der Speicherschlüssel ist ein Hash, die Angaben stehen aber lesbar im Inhalt | bis zur erfolgreichen Abgabe oder zum Löschen über „Abbrechen und Zwischenstand löschen“; Reste werden nach 7 Tagen beim nächsten Öffnen der Seite gelöscht |
| Zwischenstand als PDF-Datei (dieselben Angaben, ohne Tippzeiten; nach einem Widerspruch mit Vermerk; bei einem Escape-Room-Finale samt Datensatz aus dem Escape-Room), nur auf Klick „Zwischenstand als PDF-Datei sichern“ | dort, wo die Schülerin bzw. der Schüler die Datei speichert (Download-Ordner, Stick, Cloud …); der Server sieht sie nie | unverschlüsselt und lesbar (eingebettete Datei im PDF) | bis die Datei gelöscht wird – die Seite weist darauf hin, sie nicht weiterzugeben |
| Häkchen auf der Checkliste (welche Punkte abgehakt sind, keine Angaben zur Person) | **nur im Browser des benutzten Geräts** (localStorage `feibeitsblatt:check:<Code>`) | unverschlüsselt | bis „Alle Häkchen entfernen“; nach 7 Tagen ohne Änderung beim nächsten Öffnen der Seite gelöscht |
| Cookies und ähnliche Daten von YouTube – nur nach einem Klick auf „Video von YouTube laden“ | im Browser des benutzten Geräts, gesetzt und gelesen von Google (YouTube), nicht von Feibeitsblatt | nach den Bedingungen von Google; Feibeitsblatt speichert weder die Einwilligung noch, welche Videos geladen wurden | bis sie ablaufen oder im Browser gelöscht werden |
| „Meine Lösungen“ als PDF nach der Abgabe (Kürzel bzw. die Kürzel der Gruppe, Klasse, Abgabezeitpunkt, Aufgaben, Lösungen, KI-Feedback – kein Geburtstag), nur auf Klick | dort, wo die Schülerin bzw. der Schüler die Datei speichert; im Browser erzeugt, der Server sieht sie nie | unverschlüsselt, lesbar (zum Lernen gedacht) | bis die Datei gelöscht wird |
| Lösungs-PDF einer Abgabe aus Ihrer Übersicht („Lösungs-PDF herunterladen“; dieselben Inhalte wie „Meine Lösungen“: Kürzel bzw. die Kürzel der Gruppe, Klasse, Abgabezeitpunkt, Aufgaben, beide Fassungen, KI-Rückmeldungen – kein Geburtstag, keine Tippzeiten; bei einem Escape-Room-Finale nur die Lösungsseiten, ohne den Überblick aus dem Raum), nur auf Klick | auf Ihrem Gerät, dort, wo Sie die Datei speichern (im Dateinamen Code, Klasse, Kürzel und Abgabedatum); im Browser erzeugt, der Server sieht sie nie | unverschlüsselt und lesbar | bis Sie die Datei löschen – die Löschfrist gilt dafür nicht |
| Abschluss-PDF eines Escape-Room-Finales (statt „Meine Lösungen“; dazu der Überblick aus dem Escape-Room mit vollem Namen, Geburtsdatum, Klasse, Bestätigungscode, Ergebnissen und Lösungserläuterungen – keine Tippzeiten), nur auf Klick nach der Abgabe oder nach einer technisch gescheiterten Abgabe (dann mit dem Vermerk „Noch nicht abgegeben …“) | dort, wo die Schülerin bzw. der Schüler die Datei speichert; nur wenn sie bzw. er sie nach einer gescheiterten Abgabe per E-Mail schickt, auch im Postfach des Betreibers (`window.FEIBEITSBLATT_OPERATOR`) | unverschlüsselt, lesbar; per E-Mail unverschlüsselt über die beteiligten E-Mail-Anbieter | bis die Datei gelöscht wird; eine E-Mail laut Datenschutzhinweis, bis die Lehrkraft sie übernommen hat (siehe [Was wohin gesendet wird](#was-wohin-gesendet-wird)) |

Der Server speichert weder die Anfragen an die KI noch deren Antworten zum Feedback – nur den Vorschlag der KI für die
Checkliste (aus Ihren Aufgaben, ohne Daten der Schüler:innen) als Entwurf beim Blatt –, und er protokolliert keine
Schülertexte und keine Schlüssel; die gespeicherten Protokolle von Cloudflare (Workers Logs, Aufrufprotokolle, Traces)
sind in `wrangler.jsonc` abgeschaltet. Gespeichert werden Angaben und Antworten nur verschlüsselt; für das KI-Feedback
verarbeitet der Server die Antworten (ohne Angaben zur Person) kurz unverschlüsselt, um sie an den KI-Dienst
weiterzugeben. Nach dem Löschen hält Cloudflare die Daten noch bis zu 7 Tage (bei einem bezahlten Cloudflare-Tarif bis
zu 30 Tage) in der Wiederherstellungsfunktion der Datenbank vor (D1 Time Travel). Cloudflare verarbeitet als Hoster
technisch bedingt Verbindungsdaten wie IP-Adressen; die Einzelheiten regeln Cloudflares eigene Bedingungen (nicht im
Einzelnen geprüft). Cloudflare ist ein Unternehmen mit Sitz in den USA; die Speicherung in der EU-Jurisdiktion ändert
daran nichts. Für Übermittlungen in die USA stützt sich Cloudflare laut seiner Datenschutzerklärung (gültig ab
04.11.2025) auf das EU-US Data Privacy Framework, ersatzweise auf Standardvertragsklauseln. Wird die Seite über GitHub
Pages ausgeliefert, verarbeitet zusätzlich GitHub, Inc. (USA) beim Laden der Seite die IP-Adresse (Übermittlung laut
GitHub ebenfalls über das Data Privacy Framework bzw. Standardvertragsklauseln); der Datenschutzhinweis nennt GitHub
dann automatisch. Auf gemeinsam genutzten Geräten kann, wer denselben Browser benutzt, einen nicht abgegebenen Zwischenstand
sehen und weiterschreiben – Schüler:innen sollten deshalb vor dem Verlassen abgeben oder den Zwischenstand löschen.

### Was wohin gesendet wird

- **Aufruf der Seite:** Beim Laden der Seite und beim Abruf eines Blattes verarbeitet Cloudflare (bei GitHub Pages auch
  GitHub) technisch die IP-Adresse des Geräts. Die Startseite sagt das in einem Satz; den vollständigen
  Datenschutzhinweis nach Art. 13 DSGVO (Betreiber aus `index.html`, Löschfrist aus [Schritt 9](#schritt-9-betreiber-prüfen-und-löschfrist-festlegen))
  sehen die Schüler:innen auf dem Angaben-Bildschirm, unter dem Feedback-Button und auf der Seite „Impressum &
  Datenschutz“ (Link unten auf jeder Seite; dort mit der Löschfrist und den KI-Empfängern von `GET /api/privacy`, ohne
  Code). Die Checklisten-Seite hinter dem QR-Code sagt es ebenfalls in einem Satz (dazu: die Häkchen bleiben auf dem
  Gerät) und verweist für alles Weitere (auch, wer verantwortlich ist) auf „Impressum & Datenschutz“ und den Hinweis, der
  erscheint, wenn man das Blatt mit seinem Code digital öffnet (z. B. über „Feibeitsblatt digital öffnen“ und „Weiter“);
  der Hinweis beschreibt auch die Checklisten-Seite und wie lange die Häkchen auf dem Gerät bleiben. Der vollständige Hinweis nennt alle
  Empfänger mit der Grundlage der Übermittlung in die USA: Cloudflare und GitHub (EU-US Data Privacy Framework, ersatzweise
  Standardvertragsklauseln), den KI-Dienst (Workers AI wie Cloudflare, Groq: Standardvertragsklauseln laut Groq, andere:
  „vom Betreiber dieser Seite beim Anbieter zu prüfen“) und LanguageTool (Learneo ist nach dem Data Privacy Framework zertifiziert,
  ersatzweise Standardvertragsklauseln) – und nur bei Blättern mit Videos Google Ireland Limited (YouTube; Übermittlung in
  die USA laut Google über das EU-US Data Privacy Framework, ersatzweise Standardvertragsklauseln).
- **KI-Feedback (freiwillig):** Nur wenn die Schülerin bzw. der Schüler auf „KI um ein Feedback bitten“ klickt und
  den Dialog bestätigt, schickt der Browser den Blatt-Code, die Antworten und die Liste der Empfänger, über die
  informiert wurde, an den Server dieser Seite (Cloudflare). Wer ohne vorherige Anfrage ohne KI-Feedback abgibt, dessen
  Antworten gehen an keine KI (auch nicht bei der Abgabe). Der Server leitet **Aufgabenstellungen und den Text des
  Materials (jeweils als reinen Text ohne Link-Adressen), Ihre Aufträge an die KI und die Antworten** an den ersten KI-Anbieter weiter – nur für Aufgaben mit
  Auftrag an die KI. Nur wenn dieser ausgelastet ist, sein Tageskontingent aufgebraucht hat, nicht antwortet, einen
  Serverfehler meldet, die Anfrage als zu lang ablehnt oder keine verwertbare Antwort liefert, geht dieselbe Anfrage danach an die eingetragene
  [Reserve-KI](#reserve-ki-zweiter-anbieter) – nie an beide gleichzeitig, nie nach einem Inhaltsfilter. Ein Dienst,
  der erst nach dem Senden ausfällt (z. B. Zeitüberschreitung), hat die Texte trotzdem erhalten. **Bei der Abgabe**
  geschieht dasselbe noch einmal für die zweite Rückmeldung, aber nur mit den Antworten, die seit dem ersten Feedback
  geändert wurden (samt ihren Aufgaben) – nur nach einem ersten Feedback, gar nicht, wenn nichts geändert wurde, und nur
  an die Empfänger, über die informiert wurde. Ist die KI
  ausgelastet, wiederholt der Browser die Anfrage bis zu viermal automatisch (jeweils mit dem aktuellen Text); im
  ungünstigsten Fall erhalten also beide Dienste dieselben Antworten mehrfach. **Nie** gesendet werden Kürzel,
  Geburtstag, Klasse und die Tippzeiten; der Server bekommt sie dabei gar nicht. Mit **Cloudflare Workers AI** ist Cloudflare
  (Cloudflare, Inc., San Francisco, USA) zugleich Hoster und KI-Dienst: Die Datenbank liegt in der EU, die
  KI-Verarbeitung kann aber auch außerhalb der EU stattfinden (Cloudflare bietet dafür keine EU-Beschränkung an);
  laut Cloudflare stützt sich die Übermittlung auf das EU-US Data Privacy Framework, ersatzweise auf
  Standardvertragsklauseln. Groq (Groq LLC; Vertragspartner im EWR: Groq UK Limited), Cerebras (Cerebras Systems
  Inc.) und OpenRouter (OpenRouter, Inc.) haben ihren Sitz in den USA, Google verarbeitet Gemini-Anfragen auch in
  den USA; damit liegt eine **Übermittlung in ein Drittland** vor, deren Grundlage (z. B. eine Zertifizierung nach dem
  EU-US Data Privacy Framework oder Standardvertragsklauseln) der Betreiber beim Anbieter prüfen muss. OpenRouter
  leitet Anfragen zudem an wechselnde Rechenzentren anderer Anbieter weiter. Der KI-Anbieter verarbeitet die Daten
  nach seinen eigenen Bedingungen; bei kostenlosen Kontingenten oft auch zur Verbesserung seiner Dienste (siehe
  [KI-Anbieter](#ki-anbieter)). Der Datenschutzhinweis unter dem Button und der Dialog vor dem Senden nennen jeden
  möglichen Empfänger mit Rechtsträger und Sitz.
- **Rechtschreibprüfung:** Sie ist freiwillig und arbeitet erst nach einer ausdrücklichen Bestätigung im Browser
  (Hinweis, wohin der Text geht, und Selbstauskunft „mindestens 18 – oder 16 bzw. 17 mit Erlaubnis der Eltern“; einmal
  je geöffnetem Blatt; wer „Trifft nicht zu“ wählt, sieht für dieses Blatt keine Prüf-Buttons mehr). Nur auf Klick schickt der Browser dann **nur den Text dieser einen
  Antwort** direkt an LanguageTool (`api.languagetool.org`) – ohne Namen oder Angaben zur Person, aber naturgemäß mit der IP-Adresse
  des Geräts. Laut LanguageTool ist seit Dezember 2024 die **Learneo, Inc. (USA)** verantwortlich; Daten können
  Deutschland verlassen. Laut Datenschutzerklärung von Learneo (<https://languagetool.org/legal/privacy>, abgerufen im
  Oktober 2026) ist der Dienst in Europa nicht für Personen unter 16 Jahren gedacht, und wer jünger als 18 ist, soll die
  Erlaubnis der Eltern einholen. Als Rechtsgrundlage nennt der Datenschutzhinweis die Einwilligung (Art. 6 Abs. 1
  Buchst. a DSGVO), die mit dem Klick und der Bestätigung im Dialog erteilt und für die Zukunft widerrufen wird, indem man
  die Prüfung nicht mehr nutzt. Die Altersgrenze stützt sich allein auf die eigene Bestätigung (ein Geburtsjahr
  wird nicht erhoben) – ein Ausweis wird nicht geprüft. Die Texte stehen in `ltConsent` und `LT_OFF_TEXT` in
  `index.html`; eine Einstellung zum vollständigen Abschalten der Prüfung gibt es bisher nicht. Laut derselben
  Erklärung ist Learneo nach dem EU-US Data Privacy Framework (samt Swiss-US und UK Extension) zertifiziert; ersatzweise
  gelten Standardvertragsklauseln.
- **YouTube-Videos (freiwillig, nur nach Klick):** Bei Blättern mit Videos steht unter dem Material je Video nur ein
  Platzhalter ohne Vorschaubild; die Seite selbst fragt vorher nichts bei YouTube ab (kein Vorschaubild, keine Titel per
  oEmbed, keine `preconnect`-Hinweise, keine IFrame-API). Erst der Klick auf „Video von YouTube laden“ setzt den Player von
  `https://www.youtube-nocookie.com/embed/<Kennung>` ein – nur dieses eine Video. Dabei erhält Google Ireland Limited
  (Anbieter von YouTube im EWR; Verarbeitung auch durch Google LLC in den USA) die IP-Adresse, technische Daten zu Browser
  und Gerät, die Adresse der Seite (nur die Herkunft, z. B. `https://feibeitsblatt.janrickmer.de` – ohne Pfad und ohne den
  Code; das iframe sendet sie mit `referrerpolicy="strict-origin-when-cross-origin"`, weil YouTube eingebettete Player ohne
  Referer ablehnt), welches Video geladen und wie es abgespielt wird; YouTube kann Cookies und ähnliche Daten im Browser
  speichern und auslesen – auch über `youtube-nocookie.com`. Angaben, Antworten und Tippzeiten bekommt Google nie.
  „Video in neuem Tab öffnen“ und der QR-Code auf dem analogen Arbeitsblatt rufen YouTube direkt auf (ohne Referer bzw.
  wie jede andere Adresse); dort gelten die Bedingungen von YouTube. Die Content-Security-Policy erlaubt Frames nur von
  `https://www.youtube-nocookie.com` und Bilder nur von der eigenen Seite – so kann vor dem Klick auch versehentlich nichts
  von YouTube geladen werden. Manche Browser bauen beim Überfahren eines Links von sich aus schon eine Verbindung zu dessen
  Server auf („Seiten vorab laden“); das gilt für jeden Link, auch im Material, und liegt außerhalb der Seite.
- **Checkliste zum analogen Arbeitsblatt (Lehrkraft):** Beim ersten Öffnen von „Analoges Arbeitsblatt als PDF
  herunterladen“ (und bei „Neu von der KI vorschlagen lassen“) schickt der Server **Aufgabenstellungen, den Text des
  Materials (ohne Link-Adressen), die Spalten von Tabellen und Ihre Aufträge an die KI** an den KI-Dienst (erster
  Anbieter, bei Ausfall die Reserve – wie beim Feedback), nur für Aufgaben mit Auftrag an die KI. Antworten und Daten
  von Schüler:innen gehen dabei nie mit. Die Checklisten-Seite der Schüler:innen lädt nur die gespeicherte Checkliste
  vom Server (die IP-Adresse wird dabei wie beim Laden der Seite verarbeitet); die Häkchen verlassen das Gerät nicht.
- **Escape-Room-Finale:** Der Arena-Tunnel des Escape-Rooms übergibt den Datensatz (voller Name, Geburtsdatum, Klasse,
  Bestätigungscode, Ergebnisse) im Teil der Adresse hinter `#`. Diesen Teil schickt der Browser beim Laden an keinen
  Server – weder an GitHub noch an Cloudflare; die Seite liest ihn im Browser und entfernt ihn sofort aus der Adresszeile.
  Im **Verlauf des Browsers** bleibt die ursprüngliche Adresse aber in der Regel stehen (`history.replaceState` entfernt sie
  nur aus der Adresszeile und dem Verlauf des Tabs), und ist die **Synchronisierung des Verlaufs** eingeschaltet (z. B. ein
  Google-Konto auf Chromebooks oder Firefox Sync), gelangt sie auch zum Anbieter des Browsers. Der Datenschutzhinweis sagt
  das und rät, den Link auf einem geteilten Gerät im Verlauf zu löschen; „← zur Startseite“ erinnert nach einer Ankunft per
  Link daran. Abhilfe ginge nur mit einer neuen Version der Schnittstelle (ein Link ohne vollen Namen, Geburtsdatum und
  Bestätigungscode – diese Angaben dann nur über die Überblick-PDF oder per Eingabe). Auch eine hochgeladene
  Überblick-PDF liest nur der Browser. Der Server sieht beim Öffnen nur den Blatt-Code wie sonst. Mit Erstversuch und Abgabe
  (und mit der Abgabe, die die nachgereichte KI-Rückmeldung ergänzt) gehen nur die Ergebnisse aus dem Escape-Room an Sie –
  verschlüsselt, ohne vollen Namen, Geburtsdatum, Bestätigungscode und Lösungserläuterungen; an einen KI-Dienst gehen die
  Daten aus dem Escape-Room nie. **E-Mail nach einer technisch
  gescheiterten Abgabe:** Nur wenn die Schülerin bzw. der Schüler es selbst tut, geht die Abschluss-PDF (mit vollem Namen,
  Geburtsdatum, Bestätigungscode, Antworten, ggf. KI-Feedback und Ergebnissen, ohne Tippzeiten) unverschlüsselt über die
  E-Mail-Anbieter an die Adresse aus `window.FEIBEITSBLATT_OPERATOR`; der Datenschutzhinweis nennt diesen Empfänger
  eigens. Wie lange der Betreiber solche E-Mails aufbewahrt, ist noch festzulegen (der Hinweis sagt bisher: „bis deine
  Lehrkraft sie übernommen hat“).
- Die Seite lädt keine externen Schriften, Bibliotheken oder Tracker; nur ein YouTube-Video, das Schüler:innen mit einem
  Klick laden, kommt samt Player (und gegebenenfalls Cookies) von YouTube (Google).

### Tippzeiten

Wie im Feiditor misst die Seite beim Schreiben je Zeichen, wie viel Zeit seit dem vorangehenden Zeichen vergangen ist –
in Textfeldern und Tabellenzellen, nie bei der Weltkarten-Zuordnung. Festgehalten wird je Zeichen nur ein Wert: 0 bis 70
Millisekunden (aufgerundet), „mehr als 70 Millisekunden oder erstes Zeichen“ oder „ohne Messung“ (Leerraum, ältere
Stände); längere Pausen und Uhrzeiten werden nicht gespeichert. Entstehen mehrere Zeichen in einem Zug (Wortvorschlag,
Wischen, Autokorrektur, Diktat, ein per Rechtsklick übernommener Korrekturvorschlag des Browsers), haben alle nach dem
ersten 0 ms und erscheinen rot. Die Rechtschreibprüfung (LanguageTool) ändert die Antworten nie selbst – Korrekturen
tippen die Schüler:innen, sie werden normal gemessen.

- **Zweck:** den Schreibprozess sichtbar machen, damit Sie bei Auffälligkeiten mit der Schülerin bzw. dem Schüler über
  die Arbeitsweise sprechen können. Die Färbung dient nur als Anlass für ein Gespräch über die Arbeitsweise – nicht für
  Noten und nicht bei einem Täuschungsverdacht. Sie zeigt nur, wie schnell Zeichen eingegeben wurden, nicht, wer sie
  verfasst hat; rot entsteht auch durch sehr schnelles Tippen oder gedrückt gehaltene Tasten, und wer sich technisch
  auskennt, kann die Messung verändern (z. B. mit den Entwicklerwerkzeugen des Browsers). Es gibt keine automatische
  Entscheidung.
  Die Schüler:innen erfahren im Hinweis auch, dass Sie je Aufgabe und für die ganze Abgabe den Anteil roter Zeichen sehen.
- **Wo die Tippzeiten liegen:** bis zur Abgabe nur im Arbeitsspeicher der geöffneten Seite – nicht im Zwischenstand auf
  dem Gerät und nicht in der Zwischenstand-PDF –, dann im Erstversuch und in der Abgabe (nur verschlüsselt, lesbar nur für
  Sie). Mit KI-Feedback hält die Seite die angekommene Abgabe samt Tippzeiten danach noch im Arbeitsspeicher, bis die
  KI-Rückmeldung zur abgegebenen Fassung nachgereicht ist oder keine mehr kommt (höchstens 15 Minuten); das Nachreichen
  ersetzt die Abgabe mit denselben Tippzeiten (widerspricht die Schülerin oder der Schüler in dieser Zeit in einem anderen
  Tab mit demselben Stand, verwirft die Seite sie und reicht die Abgabe nur mit dem Vermerk des Widerspruchs nach). Wird die Seite neu geladen oder mit einer Zwischenstand-PDF weitergeschrieben, gilt der bis dahin geschriebene
  Text deshalb als „ohne Messung“ (ohne Färbung); gemessen wird ab dann neu. Sie gehen nie an einen KI-Dienst oder an
  LanguageTool, stehen nie in der Lösungs-PDF der Schüler:innen, und beim Schreiben zeigt die Seite sie nicht an.
  Gelöscht werden sie mit dem Eintrag (Löschfrist). Das gilt mit der eingecheckten Einstellung
  `TT_KEEP_IN_DRAFT = false`; mit `true` stünden sie zusätzlich unverschlüsselt im Zwischenstand und in der
  Zwischenstand-PDF (siehe [Entwicklung](#entwicklung)).
- **Widerspruch (Art. 21 DSGVO):** Im ausführlichen Datenschutzhinweis – auf dem Angaben-Bildschirm und im
  Schreibbereich unter den Aufgaben – hat der Widerspruch einen eigenen Abschnitt **„Widerspruch gegen die
  Tippzeit-Messung“** (getrennt von „Deine Rechte“, dort steht ein Verweis) mit dem Schalter **„Tippzeiten für dieses
  Feibeitsblatt nicht messen“** (auf dem Angaben-Bildschirm einer Partner- oder Gruppenarbeit „… für euer Feibeitsblatt
  …“; es genügt, wenn eine Person der Gruppe widerspricht); die Seite „Impressum & Datenschutz“ sagt, wo er steht. Die
  Kurzfassungen auf dem Angaben-Bildschirm und im Schreibbereich nennen die Messung in genau einem neutralen Satz:
  „Beim Schreiben misst diese Seite außerdem die Tippzeiten; widersprechen kannst du unter „Alle Informationen zum
  Datenschutz“.“ (bei einer Gruppe „… könnt ihr …“; Entscheidung des Betreibers vom 27.10.2026 nach Rechtsprüfung).
  Mit dem Haken misst die Seite nicht mehr und verwirft die schon gemessenen Werte (der
  Zwischenstand merkt sich den Widerspruch, auch in einer danach gesicherten Zwischenstand-PDF); ein schon
  gesendeter Erstversuch wird mit derselben Kennung ohne Tippzeiten ersetzt – scheitert das, beim nächsten Öffnen. Die
  alte Fassung bleibt dabei (verschlüsselt) noch bis zu 7 Tage, bei einem bezahlten Cloudflare-Tarif bis zu 30 Tage, in
  der Datensicherung der Datenbank. Erstversuch und Abgabe tragen dann nur den Vermerk, und Sie sehen „Tippzeiten: ohne
  Messung (widersprochen).“ – das ist ein Recht der Schüler:innen und kein Anlass für einen Verdacht. Wird der Haken
  wieder entfernt, misst die Seite erst ab dann wieder.
  **Geltungsbereich:** Der Server kennt die Person nicht – der Widerspruch steht im Zwischenstand des Geräts. Er gilt für
  die Bearbeitung auf diesem Gerät, in jedem weiteren Tab mit demselben Stand (dort sofort; zurücknehmen lässt er sich
  nur in dem Tab, in dem man es tut) und in Zwischenstand-PDF-Dateien, die danach gesichert werden; eine ältere
  Zwischenstand-PDF nimmt ihn beim Hochladen auf diesem Gerät nicht zurück. Auf einem anderen Gerät oder nach
  „Abbrechen und Zwischenstand löschen“ muss der Haken erneut gesetzt werden; ein Erstversuch, der auf einem anderen
  Gerät gesendet wurde, lässt sich vom Browser nicht ersetzen (Sie können ihn löschen). Während die Abgabe gesendet wird,
  wirkt der Schalter nicht (die Seite sagt das; scheitert das Senden, gilt er wieder). Nach der Abgabe lassen sich die
  Tippzeiten nur zusammen mit der ganzen Abgabe löschen: den Eintrag löschen und – wenn gewünscht – mit gesetztem Haken
  neu abgeben lassen. All das sagen die Hinweistexte den Schüler:innen.
- **Größe:** Die Tippzeiten machen eine Abgabe ungefähr doppelt so groß. Wäre der verschlüsselte
  Umschlag größer als 400 KB oder lehnt der Server die Abgabe als zu groß ab, geht sie einmal ohne Tippzeiten
  („nicht übermittelt – die Abgabe wäre sonst zu groß gewesen“) – eine Abgabe scheitert nie an den Tippzeiten. Dasselbe
  gilt, wenn erst die nachgereichte KI-Rückmeldung zur abgegebenen Fassung den Umschlag zu groß macht: Dann ersetzt die
  Abgabe mit der Rückmeldung, aber ohne Tippzeit-Werte, die bisherige (Entscheidung: die Rückmeldung scheitert wie die Abgabe
  nie an den Tippzeiten; kommt sie gar nicht an, bleibt die Abgabe samt Tippzeiten unverändert). (Mit
  `TT_KEEP_IN_DRAFT = true` gilt das Doppelte auch für den Zwischenstand; passt er dann nicht mehr in den Speicher des
  Browsers, wird er ohne Tippzeiten gespeichert.)
- **Entscheidungen des Betreibers (27.10.2026, nach Rechtsprüfung):** Die erste Ebene – die Kurzfassungen auf dem
  Angaben-Bildschirm und im Schreibbereich – nennt die Messung in einem neutralen Satz, ohne Hervorhebung und ohne
  Aufforderung, und sagt, wo man widerspricht; der Widerspruch hat im ausführlichen Hinweis einen eigenen Abschnitt,
  getrennt von den übrigen Informationen (Art. 21 Abs. 4 DSGVO). Unter „Welche Daten?“ steht sachlich, dass die Seite
  beim Schreiben die Zeitpunkte der Eingaben im Browser ausliest und bis zur Abgabe (und, wenn die KI-Rückmeldung zur
  abgegebenen Fassung noch nachgereicht wird, bis dahin) im Arbeitsspeicher hält – ein Zugriff
  auf das Gerät im Sinne von § 25 TDDDG; der Hinweis nennt das als Tatsache und behauptet weder eine Ausnahme nach § 25
  Abs. 2 TDDDG noch eine Einwilligung. Das Speichern der Tippzeiten im Zwischenstand auf dem Gerät bräuchte nach Annahme
  des Betreibers eine Einwilligung nach § 25 Abs. 1 TDDDG – deshalb speichert die Seite sie dort nicht und fragt keine
  Einwilligung ab. **Weiter vom Betreiber zu prüfen:** die Abwägung des berechtigten Interesses bei minderjährigen
  Schüler:innen, ob eine Datenschutz-Folgenabschätzung (Art. 35 DSGVO) nötig ist und ob schon das Erfassen der
  Eingabezeitpunkte im Arbeitsspeicher samt Senden mit Erstversuch und Abgabe eine Einwilligung nach § 25 Abs. 1 TDDDG
  braucht – nach den Leitlinien 2/2023 des Europäischen Datenschutzausschusses zum technischen Anwendungsbereich von
  Art. 5 Abs. 3 der ePrivacy-Richtlinie (Rn. 38 und 53) wahrscheinlich. Der Hinweis nennt den Zugriff nur als Tatsache
  und ersetzt keine Einwilligung.

### Videos von YouTube

Bei einem Feibeitsblatt mit eingebetteten Videos (siehe [Lehrkraft, Schritt 3](#so-arbeiten-sie-als-lehrkraft)) sehen die
Schüler:innen unter dem Material zuerst nur einen Platzhalter mit dem festen Satz „Erst nach diesem Klick wird das Video von
YouTube (Google) geladen. Dabei erhält Google unter anderem deine IP-Adresse und kann Cookies setzen; Daten können in die USA
gelangen.“ Erst der Klick auf „Video von YouTube laden“ lädt dieses eine Video – das ist die Einwilligung (Art. 6 Abs. 1
Buchst. a DSGVO, für Cookies zusammen mit § 25 Abs. 1 TDDDG). Sie gilt je Video und je Aufruf und wird nirgends gespeichert
(nicht im Zwischenstand, nicht im Browser, nicht in PDF-Dateien); deshalb kann der Hinweis sagen, dass diese Seite nicht
speichert, welche Videos jemand geladen hat. Die Kurzfassungen des Datenschutzhinweises (Angaben-Bildschirm, unter den
Aufgaben) bekommen bei solchen Blättern einen eigenen Absatz zu YouTube; der ausführliche Hinweis nennt Zweck,
Rechtsgrundlage, Daten, Google Ireland Limited als Empfänger (Übermittlung in die USA laut Google über das EU-US Data
Privacy Framework, ersatzweise Standardvertragsklauseln), Speicherdauer, Freiwilligkeit und den Widerruf. Bei Blättern
ohne Videos ändert sich am Hinweis nichts. Die Seite „Impressum & Datenschutz“ beschreibt Videos in einem eigenen
Abschnitt in allgemeiner Form (welches Blatt Videos hat, weiß sie ohne Code nicht) – samt dem QR-Code auf dem analogen
Arbeitsblatt, der direkt zu YouTube führt. Nach dem Ausrollen bitte einmal mit einem echten Video prüfen (unter der
Worker-Adresse und über GitHub Pages), ob es abspielt: Die Tests ersetzen YouTube durch eine Attrappe.

**Weiter vom Betreiber zu prüfen** (der Hinweis behauptet dazu nichts):

- **Gemeinsame Verantwortlichkeit:** Ob der Betreiber für das Einbetten zusammen mit Google verantwortlich ist (Art. 26
  DSGVO; EuGH, Urteil vom 29.07.2019, C-40/17 „Fashion ID“, zum Einbinden fremder Inhalte, die Daten an den Anbieter
  schicken) und ob es dafür eine Vereinbarung bräuchte bzw. welche Angaben dann im Hinweis fehlen.
- **Einwilligung Minderjähriger:** Art. 8 DSGVO (in Deutschland 16 Jahre) gilt für Dienste der Informationsgesellschaft,
  die einem Kind direkt angeboten werden; ob das auf das Laden eines eingebetteten Videos zutrifft und ob jüngere
  Schüler:innen dann wirksam einwilligen können, ist offen. Ebenso die Altersanforderungen in den Nutzungsbedingungen von
  YouTube (aus der Entwicklungsumgebung nicht abrufbar, deshalb nicht geprüft). Eine Altersabfrage wie bei der
  Rechtschreibprüfung gibt es bewusst nicht – nur den einen Klick.
- **Freiwilligkeit:** Eine Einwilligung muss freiwillig sein (Art. 7 Abs. 4 DSGVO). Setzt eine Aufgabe das Video voraus,
  ist das fraglich; der Hinweis verspricht deshalb kein „ohne Nachteil“. Lehrkräften wird empfohlen, Aufgaben auch ohne das
  Video lösbar zu stellen.
- **Gruppenarbeit:** Bei Partner- oder Gruppenarbeit klickt eine Person für das gemeinsame Gerät; die Hinweise stehen auf
  dem Angaben-Bildschirm in der „ihr“-Form.
- **Stand der Übermittlungsgrundlage:** ob die Google LLC weiterhin nach dem EU-US Data Privacy Framework zertifiziert ist
  und was Google zu `youtube-nocookie.com` (Cookies und ähnliche Daten trotz des Namens) und zur Speicherdauer sagt.

### Empfehlungen

1. Prüfen Sie als Betreiber **vor** der Nutzung Cloudflare (Hosting und Datenbank), den gewählten KI-Anbieter,
   LanguageTool und – wenn Lehrkräfte Videos einbetten – YouTube (Google; siehe [Videos von YouTube](#videos-von-youtube)). Setzen Sie Feibeitsblatt im Unterricht ein, klären Sie außerdem, ob Ihre Schule oder Ihr Land Vorgaben
   für digitale Werkzeuge macht.
2. Ein **Auftragsverarbeitungsvertrag (AVV/DPA)** mit den Anbietern ist, soweit erforderlich, vom Betreiber als
   Verantwortlichem abzuschließen. Ob ein Anbieter für kostenlose Konten einen AVV anbietet, ist beim Anbieter zu
   prüfen.
3. **Informieren Sie Schüler:innen und gegebenenfalls die Eltern**, welche Daten wohin gehen. Der eingebaute
   Datenschutzhinweis nach Art. 13 DSGVO (Angaben-Bildschirm, unter dem Feedback-Button und auf der Seite „Impressum &
   Datenschutz“) nennt den Betreiber als Verantwortlichen, Zweck, Rechtsgrundlagen, Daten, alle Empfänger mit Sitz und
   Übermittlungsgrundlage, Speicherdauer, Freiwilligkeit, Rechte und Beschwerderecht – mit den Angaben aus
   `window.FEIBEITSBLATT_OPERATOR` ([Schritt 9](#schritt-9-betreiber-prüfen-und-löschfrist-festlegen)). Bei
   Feibeitsblättern mit YouTube-Videos nennt er YouTube (Google) von selbst.
   Für Eltern eignet sich zusätzlich der [Textbaustein unten](#textbaustein-für-schülerinnen-und-eltern). Wechseln Sie den
   KI-Anbieter, tragen Sie eine Reserve ein oder verlängern Sie die Löschfrist, muss die Information erneuert werden (der
   Hinweis in der Seite passt sich selbst an). Die Konten bei Cloudflare und beim KI-Anbieter sollten dem Betreiber
   gehören, der im Hinweis als Verantwortlicher steht.
4. Weisen Sie die Schüler:innen an, **keine personenbezogenen Daten in die Antworten** zu schreiben (keine Namen,
   Adressen, Gesundheits- oder Familienangaben). Auch Aufgaben und Aufträge an die KI sollten keine enthalten.
5. **Legen Sie eine Löschfrist fest** (Schritt 9) – Abgaben und Erstversuche werden danach automatisch gelöscht.
   Notieren Sie Bewertungen außerhalb von Feibeitsblatt. Heruntergeladene Lösungs-PDFs fallen nicht unter die Löschfrist –
   löschen Sie sie selbst, sobald Sie sie nicht mehr brauchen (bei einem Löschwunsch auch diese Dateien). Nach der Korrektur können Sie auch früher löschen („Alle
   Abgaben dieses Feibeitsblattes löschen“); nicht mehr benötigte Feibeitsblätter löschen Sie selbst.
6. **Rechte der Schüler:innen umsetzen.** Der Datenschutzhinweis nennt den Betreiber (E-Mail) als Ansprechpartner für
   Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch und den Widerruf der Einwilligung zur
   Rechtschreibprüfung (die Einwilligung zum Laden von YouTube-Videos widerruft man, indem man keine weiteren Videos lädt;
   was Google dabei erhalten hat, kann nur Google löschen – Feibeitsblatt speichert dazu nichts) – und, weil nur Sie die verschlüsselten Abgaben lesen und einzeln löschen können, auch Sie. Auskunft: die Einträge dieser Person in der Übersicht
   aufklappen – bei Partner- oder Gruppenarbeit die Zeile ihrer Gruppe (sie enthält die Antworten aller Mitglieder). Hat sie
   abgegeben, blendet die Liste ältere Erstversuche derselben Person (gleiche Klasse, Kürzel und
   Geburtstag, z. B. auf einem anderen Gerät begonnen) bzw. derselben Gruppe (gleiche Klasse und Kürzel) aus – der Zähler über der Liste nennt ihre Anzahl, und in den
   Details der Abgabe zeigt „… ältere Erstversuche dieser Person“ sie beim Aufklappen mit erster Fassung und KI-Feedback;
   für eine vollständige Auskunft gehören sie dazu. Löschung: in den aufgeklappten Details „Diesen Eintrag löschen“ – das
   löscht den Eintrag samt dieser ausgeblendeten Erstversuche (auch sehr viele, in mehreren Schritten), alle anderen
   Einträge bleiben. Einträge, die sich nicht entschlüsseln lassen, haben in der Liste einen eigenen Knopf „Eintrag
   löschen“. Falsche Angaben (z. B. ein vertipptes Kürzel): den Eintrag löschen und neu abgeben
   lassen. Eine Gruppenabgabe lässt sich nur als Ganzes löschen – möchte ein Mitglied die Löschung, betrifft das die
   gemeinsame Abgabe (gegebenenfalls gibt der Rest der Gruppe neu ab). Der Messung der Tippzeiten widersprechen die
   Schüler:innen bis zur Abgabe selbst mit dem Schalter im Abschnitt „Widerspruch gegen die Tippzeit-Messung“ des
   ausführlichen Datenschutzhinweises ([Tippzeiten](#tippzeiten)); nach der
   Abgabe lassen sich die Tippzeiten nur zusammen mit der ganzen Abgabe löschen: den Eintrag löschen und – wenn gewünscht –
   mit gesetztem Haken neu abgeben lassen. Ein auf einem anderen Gerät gesendeter Erstversuch mit Tippzeiten (in den
   Details der Abgabe unter „ältere Erstversuche“) lässt sich nur so entfernen. Über eine Einschränkung oder einen anderen
   Widerspruch entscheidet der Betreiber als Verantwortlicher (sind Sie es nicht selbst, stimmen Sie sich mit ihm ab). Nach dem Löschen hält Cloudflare die Daten noch bis zu 7 Tage (bei einem bezahlten Tarif bis
   zu 30 Tage) in der Datensicherung der Datenbank.
7. Wählen Sie den KI-Anbieter mit Blick auf seine Datenbedingungen. Empfohlen ist Cloudflare Workers AI (kein
   weiterer Empfänger); als „nicht für den Schuleinsatz geeignet“ gekennzeichnet sind Gemini (Altersgrenze 18),
   OpenRouter (kostenlose Modelle dürfen Eingaben protokollieren) und Cerebras (kein dauerhaftes Gratiskontingent).

### Textbaustein für Schüler:innen und Eltern

Platzhalter in eckigen Klammern bitte ersetzen; die Empfängerliste muss zu Ihren KI-Einstellungen passen (sie steht
auch im Datenschutzhinweis unter dem Feedback-Button und auf der Seite „Impressum & Datenschutz“). Der Baustein
beschreibt auch die Tippzeit-Messung und den Widerspruch dagegen – so vollständig wie der ausführliche
Datenschutzhinweis (die Kurzfassungen in der Seite nennen die Messung nur in einem Satz). Er richtet sich auch an die
Schüler:innen.

> Liebe Schülerinnen und Schüler, liebe Eltern,
>
> im Fach [Fach] nutzen wir die Schreibplattform „Feibeitsblatt“. Feibeitsblatt ist ein privates, nicht kommerzielles
> und kostenloses Angebot von [Betreiber, Anschrift, E-Mail] – kein Angebot der Schule; verantwortlich für die Daten ist
> der Betreiber. Alle Informationen stehen auf der Seite „Impressum & Datenschutz“ (Link unten auf jeder Seite von
> Feibeitsblatt). Zweck ist das Üben des Schreibens mit einer automatischen Rückmeldung, die die Antworten nach Vorgaben
> der Lehrkraft bespricht, und – über die Tippzeiten (siehe unten) – das Sichtbarmachen des Schreibprozesses, damit die
> Lehrkraft bei Auffälligkeiten mit der Schülerin bzw. dem Schüler über die Arbeitsweise sprechen kann.
> Rechtsgrundlagen sind die Nutzung des kostenlosen Angebots (Art. 6 Abs. 1 Buchst. b DSGVO)
> für Bearbeiten, Abgeben und das freiwillige KI-Feedback, die Einwilligung (Art. 6 Abs. 1 Buchst. a DSGVO) für die
> Rechtschreibprüfung [und das Laden von YouTube-Videos] und das berechtigte Interesse (Art. 6 Abs. 1 Buchst. f DSGVO) für die Tippzeiten sowie für den
> Aufruf der Seite und den Schutz vor Missbrauch (sichere Bereitstellung). Gespeichert werden Namenskürzel, Geburtstag (Tag und Monat, ohne Jahr), Klasse und die Texte samt ihren Tippzeiten – bei Partner- oder
> Gruppenarbeit die Namenskürzel aller Mitglieder und die Klasse, ohne Geburtstag; wer sie einträgt, trägt die Kürzel der
> anderen mit ein –, verschlüsselt, nur für die Lehrkraft lesbar, auf Servern von Cloudflare, Inc. (USA; Datenbank in der EU) und [Frist] Tage nach dem Eingang automatisch
> gelöscht (danach noch bis zu 7 Tage – bei einem bezahlten Cloudflare-Tarif bis zu 30 Tage – in der Datensicherung). Cloudflare stützt Übermittlungen in die USA auf das EU-US
> Data Privacy Framework, ersatzweise auf Standardvertragsklauseln. [Falls die Seite über GitHub Pages aufgerufen wird:
> Beim Laden der Seite verarbeitet auch GitHub, Inc. (USA) die IP-Adresse.] [Falls Sie ausgedruckte Arbeitsblätter mit
> QR-Code ausgeben: Der QR-Code führt zu einer Checkliste der Lehrkraft auf feibeitsblatt.janrickmer.de; beim Aufruf
> verarbeiten GitHub, Inc. (USA; liefert diese Seite über GitHub Pages aus) und Cloudflare technisch die IP-Adresse. Die
> Häkchen bleiben nur auf dem Gerät und werden nicht gesendet.] [Falls ein Feibeitsblatt das Finale eines Escape-Rooms
> ist: Über den Link am Ende des Escape-Rooms oder die Überblick-PDF übernimmt Feibeitsblatt den vollen Namen, das
> Geburtsdatum, die Klasse, den Bestätigungscode und die Ergebnisse aus dem Escape-Room. Voller Name, Geburtsdatum und
> Bestätigungscode bleiben auf dem Gerät (Zwischenstand und heruntergeladene PDF-Dateien); an die Lehrkraft gehen nur
> die Ergebnisse, verschlüsselt, an einen KI-Dienst nie. Scheitert die Abgabe aus technischen Gründen, kann die
> Abschluss-PDF (mit diesen Daten und den Antworten) auf eigenen Wunsch per E-Mail an [Betreiber, E-Mail] geschickt
> werden – unverschlüsselt.] [Falls Feibeitsblätter YouTube-Videos enthalten: Ein Video lädt die Seite erst nach einem
> Klick der Schülerin bzw. des Schülers auf „Video von YouTube laden“ (Einwilligung, Art. 6 Abs. 1 Buchst. a DSGVO und
> § 25 Abs. 1 TDDDG); vorher sieht man nur einen Platzhalter. Dabei erhält Google Ireland Limited (Anbieter von YouTube im
> EWR) unter anderem die IP-Adresse und kann Cookies setzen; Daten können in die USA gelangen (Google stützt sich auf das
> EU-US Data Privacy Framework, ersatzweise auf Standardvertragsklauseln). Feibeitsblatt speichert nicht, wer welches
> Video geladen hat. Ausgedruckte Arbeitsblätter verlinken ein Video per QR-Code direkt auf YouTube.]
> Die Rückmeldung der KI ist freiwillig: Wer sie nicht möchte, gibt ohne KI-Feedback ab; dann gehen die Antworten an
> keinen KI-Dienst, und daraus entsteht kein Nachteil. Für die Rückmeldungen (eine zum Überarbeiten, eine bei der Abgabe zu den danach geänderten Antworten) werden nur die Antworttexte (ohne
> Namen und Angaben zur Person) zusammen mit den Aufgaben und den Vorgaben der Lehrkraft an den KI-Dienst [z. B.
> Cloudflare Workers AI – Cloudflare, Inc., USA, derselbe Anbieter, der den Server betreibt] gesendet; nur wenn
> dieser nicht antwortet, ausgelastet ist, sein Tageskontingent aufgebraucht hat oder kein brauchbares Feedback liefert, an
> [Reserve-Dienst mit Sitz, z. B. Groq LLC, USA]. Diese Dienste haben ihren Sitz in den USA; [bei Cloudflare Workers AI:
> die Datenbank liegt in der EU, die KI-Verarbeitung kann auch außerhalb der EU stattfinden;] die Übermittlung stützt
> sich auf [EU-US Data Privacy Framework / Standardvertragsklauseln]. Die KI gibt nur Hinweise, keine Noten; über die
> Arbeit entscheidet die Lehrkraft. Beim Schreiben misst Feibeitsblatt die Tippzeiten: für jedes eingegebene Zeichen,
> wie viele Millisekunden seit dem vorangehenden Zeichen vergangen sind (längere Pausen nur als „mehr als 70
> Millisekunden“, keine Uhrzeiten). Die Lehrkraft sieht die Antworten dadurch farbig markiert und je Aufgabe und für die
> ganze Abgabe den Anteil roter Zeichen in Prozent – rot, wenn Zeichen sehr schnell oder in einem Zug entstanden sind
> (z. B. durch Wortvorschläge, Autokorrektur, Diktat oder einen übernommenen Korrekturvorschlag des Browsers). Das ist kein
> Beweis: Die Färbung dient nur als Anlass für ein Gespräch über die Arbeitsweise – nicht für Noten und nicht bei einem
> Täuschungsverdacht. Für die Messung liest die Seite beim Schreiben im Browser die Zeitpunkte der Eingaben aus (ein
> Zugriff auf das Gerät im Sinne von § 25 TDDDG); bis zur Abgabe (und, wenn die KI-Rückmeldung zur abgegebenen Fassung noch
> nachgereicht wird, bis dahin) hält sie die Tippzeiten nur im Arbeitsspeicher (nicht im Zwischenstand auf
> dem Gerät und nicht in einer Zwischenstand-PDF-Datei); sie gehen nur verschlüsselt mit Erstversuch und Abgabe an die
> Lehrkraft, nie an einen KI-Dienst; beim Schreiben zeigt die Seite sie nicht an. Der Messung kann man jederzeit bis zur
> Abgabe selbst widersprechen – mit dem Schalter „Tippzeiten für dieses Feibeitsblatt nicht messen“ im ausführlichen
> Datenschutzhinweis („Alle Informationen zum Datenschutz“, Abschnitt „Widerspruch gegen die Tippzeit-Messung“; dann werden auch die schon
> gemessenen Werte verworfen). Der Haken gilt für die Bearbeitung auf dem jeweiligen Gerät;
> wer auf einem anderen Gerät weiterschreibt, setzt ihn dort erneut. Ein Widerspruch ist für die Lehrkraft als „ohne
> Messung (widersprochen)“ sichtbar – das ist ein Recht der Schülerinnen und Schüler und kein Anlass für einen Verdacht.
> Nach der Abgabe lassen sich die Tippzeiten nur zusammen mit der ganzen Abgabe löschen – über [Betreiber, E-Mail] oder
> die Lehrkraft.
> Schülerinnen und Schüler ab 18 Jahren – mit 16 und 17 Jahren nur
> mit Erlaubnis der Eltern – können auf Wunsch eine Rechtschreibprüfung nutzen, die den Text der jeweiligen Antwort an
> LanguageTool (Learneo, Inc., USA; nach dem EU-US Data Privacy Framework zertifiziert) sendet; vor der ersten Prüfung
> fragt die Seite danach, ohne Bestätigung wird nichts gesendet; die Einwilligung lässt sich für die Zukunft widerrufen,
> indem man die Prüfung nicht mehr nutzt. Es besteht ein Recht auf Auskunft, Berichtigung, Löschung, Einschränkung und
> Widerspruch sowie ein Beschwerderecht bei der Aufsichtsbehörde [z. B. Der Hessische Beauftragte für Datenschutz und
> Informationsfreiheit, Wiesbaden]. Es werden keine Namen, Adressen oder andere personenbezogenen Angaben in die
> Antworten geschrieben. Bei Fragen wenden Sie sich an [Betreiber, E-Mail] oder an [Lehrkraft, Kontakt].

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
zwischen Anfragen ein (Workers AI 0,2 s, Groq 2,5 s, OpenRouter 3,5 s, Gemini 4 s, Cerebras 2 s, andere 1 s) und lässt höchstens etwa
eine Minute Wartezeit zu. Fordern viele Schüler:innen gleichzeitig ein Feedback an, erhalten einige „Gerade fragen
sehr viele gleichzeitig. Bitte versuche es in einer Minute noch einmal.“ In Stoßzeiten kann eine einzelne Anfrage
bis zu etwa 100 Sekunden dauern.

**Cloudflare Workers AI** rechnet in „Neurons“ (kostenlos 10 000 pro Tag für das ganze Konto, Neustart 0:00 Uhr UTC).
Laut Preisliste (Stand 20.10.2026) kostet das Vorgabemodell Gemma 4 je Million Token 9 091 Neurons Eingabe und
27 273 Neurons Ausgabe; einen Rabatt für wiederkehrende (gecachte) Eingaben gibt es dafür nicht – jede Anfrage zahlt
Anweisungen, Aufgaben, Material und Aufträge an die KI voll. Rechenbeispiel (Schätzung; die echten Token-Zahlen hängen
vom Blatt ab):

- Eine Feedback-Anfrage mit 1 800–4 000 Token Eingabe und 200–500 Token Ausgabe kostet etwa **22–50 Neurons**
  (GLM-4.7-Flash 17–40, Qwen3-30B 14–34). Viel Material oder viele Aufgaben machen sie teurer – bei sehr großen
  Blättern über 100 Neurons je Anfrage.
- 180 Anfragen am Tag (etwa drei Klassen mit je 30 Schüler:innen und je zwei Anfragen) brauchen also etwa
  **3 900–9 000 Neurons**, 40–90 % des Tageskontingents. Für mehr reicht es nicht sicher; dafür ist die Reserve-KI da
  (oder die Abgabe ohne KI-Feedback).
- Die zweite Anfrage bei der Abgabe enthält nur die Aufgaben, deren Antwort seit dem ersten Feedback geändert wurde
  (Aufgabenstellung, Material, Auftrag und Antwort); nur die Anweisungen zahlt sie wieder voll. Wer eine von drei
  Aufgaben überarbeitet, braucht dafür grob die Hälfte der ersten Anfrage (Schätzung) – die 180 Anfragen oben kosten
  dann meist weniger als angegeben.
- Der Denkmodus der Modelle ist abgeschaltet (er würde die Ausgabe vervielfachen); der Verbindungstest zeigt, ob das
  wirkt. Die Ausgabegrenze ist großzügig (800 + 300 Token je Aufgabe) – berechnet werden nur erzeugte Token.
- Ist das Kontingent aufgebraucht (Cloudflare-Fehler 3036), merkt sich der Server das bis 0:00 Uhr UTC und fragt
  Workers AI bis dahin nicht mehr: Die Reserve-KI übernimmt mit vollem Zeitbudget, sonst bekommen die Schüler:innen
  sofort die Meldung „Das KI-Kontingent für heute ist aufgebraucht …“ und können ohne KI-Feedback abgeben (diese
  Anfragen zählen nicht gegen die Grenzen je Netzwerk und Blatt). Ist ein Modell nur kurz ausgelastet (Fehler 3040),
  weicht der Server auf das nächste aus. Lehnt ein Modell eine Anfrage aus unbekanntem Grund ab, versucht der Server
  sie noch einmal ohne JSON-Modus (der Denkmodus bleibt aus), dann ohne die Einstellung für den Denkmodus und erst dann
  das nächste Modell; gesperrt wird das Modell dafür nur fünf Minuten, nicht den ganzen Tag.
- Den geschätzten Verbrauch (aus den Token-Zahlen der Antworten) zeigen die KI-Einstellungen; Verbindungstests und
  andere Nutzung von Workers AI im selben Konto zählen mit. Genau steht er im Cloudflare-Dashboard unter „Workers AI“.

Rechenbeispiel für **60 Schüler:innen am Tag mit je etwa 600 Wörtern** bei Groq (gpt-oss-120b; die
Limits sind Angaben Dritter, Stand Oktober 2026 – bitte in der Groq-Konsole prüfen):

- Eine Feedback-Anfrage besteht aus den Anweisungen (≈ 800 Token), Aufgaben und Aufträgen an die KI (≈ 300–800),
  ggf. Material (bis ≈ 1 200 je Aufgabe), den Antworten (600 deutsche Wörter ≈ 1 200–1 600 Token) und der Ausgabe
  (≈ 200–500). Ohne Material also grob **2 500–4 000 Token je Anfrage**, mit viel Material mehr.
- Jede Schülerin und jeder Schüler stellt bis zu **zwei** solche Anfragen: das Feedback zum Überarbeiten und bei der
  Abgabe die Rückmeldung zur abgegebenen Fassung (sie enthält nur die danach geänderten Aufgaben und entfällt, wenn
  nichts geändert wurde). 60 Schüler:innen
  sind also bis zu 120 Anfragen, ohne Cache 300 000–500 000 Token – deutlich über dem Tageslimit von etwa 200 000
  Token von gpt-oss-120b. Deshalb macht Feibeitsblatt mehrere Dinge:
  1. **Anfrage in Cache-freundlicher Reihenfolge.** Der für alle Schüler:innen eines Blattes gleiche Teil (Anweisungen,
     Aufgaben, Material, Aufträge an die KI) steht vorn, die Antworten stehen hinten. Groq cacht solche Präfixe
     automatisch (für die gpt-oss-Modelle, laut Groq „best effort“, Cache einige Stunden gültig), und **gecachte
     Token zählen nicht gegen die Minuten- und Tageslimits**. Ab der zweiten Anfrage zum selben Blatt kosten dann im
     Wesentlichen nur noch Antworten und Ausgabe, grob 1 500–2 000 Token: 120 Anfragen ≈ 180 000–240 000 Token, also
     etwa das Tageslimit von gpt-oss-120b; was darüber hinausgeht, übernehmen die weiteren Modelle (Punkt 2), die
     jeweils ein eigenes Tageslimit haben. Je Minute gehen so etwa 4–5 statt 2 Anfragen durch ein Modell. Die zweite
     Anfrage bei der Abgabe enthält nur die geänderten Aufgaben: Sie ist kleiner, aus dem Cache kommt bei ihr aber nur
     der Teil, der bei gleicher Auswahl gleich ist (meist nur die Anweisungen).
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
  einige Dutzend Kilobyte (Schätzung; mit den Tippzeiten etwa doppelt so viel wie ohne – je Zeichen und Fassung kommen
  verschlüsselt rund 1,8 Byte hinzu); Bilder zu Aufgaben belegen bis zu etwa 700 KB je Bild (Base64) und werden
  beim Öffnen eines Blattes je einmal gelesen – auch das zählt zu den gelesenen Zeilen. PDF-Dateien liegen in Teilen
  zu je 512 KB (als Base64 etwa 700 KB) in der Datenbank; eine 6-MB-Datei belegt also 12 Zeilen. Jeder der 12 Abrufe
  beim Herunterladen zählt dabei die Teile der Datei mit, eine 6-MB-Datei kostet also rund 170 gelesene Zeilen je
  Download (30 Schüler:innen: rund 5 000 von 5 Millionen am Tag) – der Browser cacht die Teile, ein zweiter Klick
  lädt nichts neu. Bilder und PDF-Dateien aller Feibeitsblätter zusammen dürfen höchstens 200 MB belegen (als
  Base64 rund 270 MB); so bleibt in der 500-MB-Datenbank genug Platz für Abgaben. Die Lehrkräfte-Übersicht zeigt
  den belegten Speicher an.
- Cron Trigger: höchstens 5 je Konto; Feibeitsblatt braucht einen (tägliche Löschung). Das automatische Löschen nutzt
  einen Index auf dem Eingangszeitpunkt; je gelöschter Abgabe zählt D1 etwa vier geschriebene Zeilen (mit den
  Indizes) – weit unter dem Tageslimit. Scheitert das Löschen beim Öffnen der Übersicht (z. B. weil das Tageslimit
  der geschriebenen Zeilen erreicht ist), lädt die Übersicht trotzdem.

**Grenzen in Feibeitsblatt:**

| Was | Grenze |
|---|---|
| Aufgaben je Feibeitsblatt | 1 bis 30 |
| Aufgabenstellung / Auftrag an die KI / Titel | 4000 / 8000 / 200 Zeichen; die Aufgabenstellung wie das Material formatierbar (höchstens 60 Links) |
| Material je Aufgabe | 8000 Zeichen, 60 Links; nur fett, kursiv, unterstrichen und Links (http/https) |
| Bilder je Aufgabe | 5; je Bild höchstens 500 KB nach dem Verkleinern (längste Seite 1600 Pixel); alle Bilder eines Blattes zusammen 12 MB |
| PDF-Dateien je Aufgabe | 3; je Datei höchstens 6 MB; alle PDF-Dateien eines Blattes zusammen 20 MB; Dateiname bis 120 Zeichen |
| YouTube-Videos je Aufgabe | 3; Titel bis 120 Zeichen; Startzeit unter 24 Stunden; belegen keinen Speicher für Dateien (nur Kennung, Startzeit und Titel) |
| Tabelle (Antwortart) | 1–8 Spalten mit je 60 Zeichen Überschrift, 1–30 Zeilen; die ganze Tabelle als Text höchstens 8000 Zeichen |
| Weltkarten-Zuordnung (Antwortart) | 1–40 Karten je Aufgabe (Bezeichnung 120, Hinweis 400 Zeichen, ein Bild – zählt nicht zu den 5 Bildern), je Karte 1–10 richtige Länder, je Blatt höchstens 400 richtige Länder zusammen |
| Antwort je Aufgabe / alle Antworten zusammen | 8000 / 40 000 Zeichen (die Seite zeigt ab 7000 Zeichen einen Zähler) |
| Abgaben je Feibeitsblatt | 400 Abgaben bzw. 40 MB (eine Klasse braucht weit weniger) |
| KI-Anfragen je Netzwerk (IP-Adresse) | 240 pro Stunde bzw. 800 000 Zeichen pro Stunde (je Schüler:in bis zu zwei Anfragen: Feedback zum Überarbeiten und Rückmeldung zur abgegebenen Fassung); nur Anfragen, die wirklich zur KI gehen, zählen – ein gestörter KI-Anbieter zählt nicht |
| KI-Anfragen je Feibeitsblatt | 600 pro Tag (bei Workers AI reicht das Tageskontingent des Kontos meist für weniger) |
| Abgaben und Erstversuche je Netzwerk (IP-Adresse) | 360 pro Stunde bzw. 60 MB pro Stunde (je Schüler:in bis zu drei Übermittlungen: Erstversuch beim KI-Feedback, Abgabe und die nachgereichte KI-Rückmeldung zur abgegebenen Fassung) |
| Checkliste zum analogen Arbeitsblatt | höchstens 8 Punkte je Aufgabe, je 160 Zeichen; KI-Vorschläge 30 pro Stunde je Netzwerk (IP-Adresse) |
| Hochgeladene Zwischenstand-PDF | 5 MB (die von Feibeitsblatt erzeugten Dateien sind viel kleiner); dasselbe gilt für die Überblick-PDF eines Escape-Rooms |
| Datensatz aus einem Escape-Room (Link oder Überblick-PDF) | höchstens 96 KB (ein größerer wird abgelehnt); darin Texte je 2000 Zeichen, Lösungserläuterungen je 4000, höchstens 20 Stationen mit je 30 Fehlern, 20 Lösungserläuterungen und 20 Zwischenstand-Dateien – mehr wird gekappt. Passt eine Abgabe sonst nicht in den Umschlag, geht sie erst ohne Tippzeiten, dann ohne die Einzelheiten der Fehler („nicht übermittelt“) – sie scheitert nie an diesen Daten |
| Hochgeladene Feibeitsblatt-PDF (Lehrkraft) | 80 MB (ein volles Blatt mit 12 MB Bildern und 20 MB PDF-Dateien ergibt höchstens etwa 45 MB) |
| Bilder und PDF-Dateien aller Feibeitsblätter zusammen | 200 MB (die Übersicht zeigt den belegten Speicher) |
| Löschfrist | 7 bis 365 Tage (Auswahl 7, 14, 30, 60, 90, 180, 365; Vorgabe einer Neuinstallation 30) |

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
| Workflow meldet „Zeitplan für die automatische Löschung nicht gesetzt“ bzw. wrangler „Trigger configuration … was only partially updated … Cron schedules“ | Das Cloudflare-Konto hat schon 5 Cron Trigger (Grenze im Free-Plan). Der Worker selbst ist trotzdem veröffentlicht, `SETTINGS_SECRET` wird trotzdem angelegt; gelöscht werden Abgaben und Zähler dann nur beim Öffnen der Lehrkräfte-Übersicht und gelegentlich bei anderen Aufrufen. Abhilfe: im Dashboard bei einem anderen Worker einen Cron Trigger entfernen und den Workflow erneut starten. Geht das nicht, können Sie die rote Markierung des Workflows hinnehmen – der Worker ist veröffentlicht; öffnen Sie die Übersicht dann bitte regelmäßig, damit gelöscht wird. Die Zeile `"triggers"` in `wrangler.jsonc` bitte nicht entfernen: Dann scheitern schon die Unit-Tests, und es wird gar nichts mehr veröffentlicht. |
| Fehlersuche: Im Dashboard stehen keine Protokolle | Absicht – die gespeicherten Protokolle sind abgeschaltet (siehe [Sicherheit](#sicherheit)). Live mitlesen: `npx wrangler tail` (mit dem API-Token), nichts wird gespeichert. |
| „Dieses Feibeitsblatt ist fehlerhaft eingerichtet. Bitte sag deiner Lehrkraft Bescheid.“ | Es ist kein Lehrkraft-Passwort festgelegt (z. B. nach dem Zurücksetzen). `1104` eingeben und ein Passwort festlegen (Schritt 7). |
| „Deine Lehrkraft hat das KI-Feedback noch nicht eingerichtet – du kannst ohne KI-Feedback abgeben.“ (bzw. „Die Lehrkraft hat das KI-Feedback noch nicht eingerichtet.“) | KI-Einstellungen speichern (Schritt 8). Abgeben (ohne KI-Feedback) geht trotzdem; nach dem Speichern klappt ein neuer Klick auf „KI um ein Feedback bitten“ auch auf schon geöffneten Seiten. |
| Rote Warnung „Abgaben und Erstversuche werden noch nicht automatisch gelöscht …“ in der Übersicht | Unter „Datenschutz und Löschfrist“ eine Löschfrist speichern ([Schritt 9](#schritt-9-betreiber-prüfen-und-löschfrist-festlegen)). |
| Impressum und Datenschutzhinweis nennen einen anderen Betreiber | Die Angaben stehen fest ganz oben in `index.html` (`window.FEIBEITSBLATT_OPERATOR`) – bei einer eigenen Installation dort Ihre Angaben eintragen und neu veröffentlichen ([Schritt 9](#schritt-9-betreiber-prüfen-und-löschfrist-festlegen)). |
| Auf „Impressum & Datenschutz“ steht „… konnten gerade nicht geladen werden – deshalb stehen hier allgemeine Angaben.“ | Der Server war nicht erreichbar (`GET /api/privacy`). Die Seite neu laden; Impressum und Betreiber stehen trotzdem dort. |
| Abgaben sind verschwunden | Vermutlich ist die Löschfrist abgelaufen (die Übersicht nennt sie; aufgeklappt steht je Abgabe, ab wann sie gelöscht wird). Gelöschtes lässt sich nur über D1 Time Travel (bis zu 7 Tage, bei einem bezahlten Cloudflare-Tarif bis zu 30 Tage) für die ganze Datenbank zurückholen – das setzt auch alles andere zurück. |
| „Der Server ist noch nicht vollständig eingerichtet (SETTINGS_SECRET fehlt).“ | Den Workflow „Deploy“ erneut ausführen; er legt das Secret an. Danach den API-Schlüssel eintragen. |
| „Bitte den API-Schlüssel neu eintragen.“ | `SETTINGS_SECRET` wurde geändert. Schlüssel in den KI-Einstellungen neu eintragen. |
| „Das KI-Kontingent für heute ist aufgebraucht.“ | Tageslimit des Anbieters erreicht. Morgen erneut versuchen oder eine Reserve-KI bzw. einen anderen Anbieter eintragen. Schüler:innen können jederzeit ohne KI-Feedback abgeben; wer es versucht hat, ist in den Abgaben als „das KI-Feedback war nicht möglich“ vermerkt – bei Workers AI mit dem Grund „KI-Kontingent für heute aufgebraucht“, bei anderen Anbietern mit einem allgemeinen Grund wie „Anfrage nicht abgeschlossen“ oder (nach zwei Fehlversuchen) „KI nicht erreichbar“. Bei Workers AI zeigen die KI-Einstellungen „Tageskontingent aufgebraucht bis …“; ein erfolgreicher „Verbindung testen“ (z. B. nach einem Wechsel auf Workers Paid) hebt die Sperre vorzeitig auf. |
| „Workers AI ist für diesen Worker nicht eingerichtet (Binding „AI“ fehlt).“ | Der veröffentlichte Worker ist älter als die aktuelle `wrangler.jsonc`. Den Workflow „Deploy“ erneut ausführen. |
| „Workers AI antwortet nur im Cloudflare-Betrieb – in der lokalen Entwicklung …“ | Kein Fehler: Unter `wrangler dev --local` (`npm run dev`, Tests) gibt es keine Verbindung zu Workers AI. Lokal „Anderer OpenAI-kompatibler Dienst“ mit der Test-KI wählen (siehe [Entwicklung](#entwicklung)). |
| Workflow scheitert bei `wrangler deploy` mit einem Rechtefehler zu Workers AI („AI“, „ai“) | Vermutlich fehlt dem Token eine Berechtigung (nicht dokumentiert). Im Token zusätzlich „Konto → Workers AI → Lesen“ ergänzen und den Workflow erneut starten; bis dahin bleibt die bisherige Version online. |
| „Die KI ist gerade ausgelastet.“ / „Gerade fragen sehr viele gleichzeitig.“ | Minutenlimit des Anbieters oder Warteschlange voll; nach einer Minute erneut versuchen. |
| „Dieses Feibeitsblatt ist für die eingestellte KI zu umfangreich.“ | Die Anfrage überschreitet das Limit aller verfügbaren Modelle. Aufträge an die KI und Aufgaben kürzen oder in den KI-Einstellungen ein Modell mit größerem Kontingent wählen. |
| „LanguageTool ist gerade nicht erreichbar (Netz, Schulfilter oder Dienst gestört).“ | Ein Schulfilter sperrt eventuell `api.languagetool.org` (die Schul-IT kann die Adresse freigeben) – oder, wenn es nur zeitweise auftritt, das Minutenlimit von LanguageTool für das Schulnetz: eine Minute warten, nicht alle gleichzeitig prüfen. |
| „Das Bild kann der Browser nicht lesen (z. B. HEIC). Bitte als JPG oder PNG speichern.“ | Das Format kann der Browser nicht öffnen – meist HEIC-Fotos vom iPhone. Das Foto als JPG sichern (iOS: Einstellungen → Kamera → Formate → „Maximale Kompatibilität“, oder aus der Fotos-App als JPG teilen) oder ein anderes Bild wählen. |
| „1 Bild konnte nicht gespeichert werden … Das Feibeitsblatt selbst ist angelegt.“ (ebenso für PDF-Dateien) | Das Hochladen ist unterbrochen worden (Netz) oder der Server hat die Datei abgelehnt (Meldung in Klammern). Bei Netzfehlern „Fehlende Dateien erneut hochladen“ klicken; bei einer Ablehnung (zu groß, zu viele, keine PDF) das Blatt löschen und mit weniger oder kleineren Dateien neu anlegen. |
| Statt des YouTube-Videos zeigt der Player eine Fehlermeldung (z. B. „Video nicht verfügbar“ oder „Fehler 153“) | Das Video ist privat, gelöscht oder lässt sich nicht einbetten (Einstellung der Person, die es hochgeladen hat) – ein anderes Video wählen; „Video in neuem Tab öffnen“ geht meist trotzdem. „Fehler 153“ (Konfigurationsfehler des Players) heißt meist, dass YouTube keinen Referer bekam: Prüfen Sie, ob das iframe noch `referrerpolicy="strict-origin-when-cross-origin"` trägt und kein Browser-Zusatz den Referer entfernt. |
| Der Platzhalter zeigt nach dem Klick nur eine leere Fläche | Die Content-Security-Policy lässt den Player nicht zu (fehlt `frame-src https://www.youtube-nocookie.com` in `_headers` oder in der `<meta>`-Zeile?) oder ein Schulfilter sperrt `www.youtube-nocookie.com` – die Schul-IT kann die Adresse freigeben. |
| „konnte nicht geladen werden – erneut versuchen“ an einer PDF-Datei | Die Verbindung ist beim Herunterladen abgerissen. Noch einmal auf die Datei klicken. |
| „Bild konnte nicht geladen werden – erneut versuchen“ (statt einer Miniatur) | Die Verbindung ist abgerissen, während das Blatt geöffnet wurde. Auf den Hinweis klicken, dann lädt das Bild erneut. |
| „Gerade bitten sehr viele gleichzeitig um Feedback – die KI ist ausgelastet. Nächster Versuch automatisch in …“ | Kein Fehler: Die Minutenlimits aller Modelle sind gerade ausgeschöpft; die Seite wiederholt von selbst (bis zu fünf Versuche in etwa vier Minuten). Weiterschreiben ist möglich; „Nicht länger warten“ bricht ab. Kommt das ständig vor, Feedback gestaffelt anfordern lassen oder eine Reserve-KI eintragen. |
| „Die Lehrkraft hat die KI-Einstellungen geändert – es wurde nichts gesendet. Lies bitte den Datenschutzhinweis …“ (nach automatischen Wiederholungen: „… – dieser Versuch wurde nicht gesendet; frühere automatische Versuche hat der bisherige KI-Dienst möglicherweise schon erhalten. …“) | Sie haben den ersten Anbieter geändert, erster Anbieter und Reserve getauscht oder den ersten Anbieter entfernt, während das Blatt geöffnet war (eine neu eingetragene Reserve allein löst das nicht aus – sie wird auf dieser Seite nur nicht genutzt). Die Seite hat den Hinweis neu geladen; die Schülerin bzw. der Schüler liest ihn und klickt erneut. Die Antworten bleiben erhalten. In der zweiten Form zählt der Lauf als Fehlversuch, weil frühere Versuche schon beim bisherigen Dienst angekommen sein können. |
| „Die KI hat diese Antworten nicht bewertet. Bitte frag deine Lehrkraft.“ | Der KI-Anbieter hat die Anfrage mit seinem Inhaltsfilter abgelehnt. Absichtlich geht sie dann **nicht** an die Reserve. Sehen Sie sich die Antworten an; abgeben (ohne KI-Feedback) geht trotzdem. |
| „In dieser Datei steckt kein Feibeitsblatt-Zwischenstand.“ beim Hochladen einer PDF | Es wurde nicht die Original-PDF aus „Zwischenstand als PDF-Datei sichern“ hochgeladen, sondern z. B. ein Screenshot, ein Ausdruck oder eine „Drucken als PDF“-Kopie – die enthalten die eingebetteten Daten nicht. Nur die heruntergeladene Datei selbst (unverändert) funktioniert; ein Neuspeichern in einem PDF-Programm, das die eingebettete Datei behält, ist unproblematisch. |
| „Rechtschreibprüfung (LanguageTool): erst ab 16 Jahren – mit 16 und 17 nur mit Erlaubnis deiner Eltern.“ (statt der Buttons, darunter ggf. „Ohne Bestätigung wird nichts an LanguageTool gesendet.“) | Kein Fehler: Im Dialog vor der ersten Rechtschreibprüfung wurde „Trifft nicht zu“ gewählt oder Esc gedrückt. Für dieses geöffnete Blatt gibt es dann keine Prüf-Buttons mehr; Schreiben und Abgeben gehen ganz normal weiter. (Ein Klick neben den Dialog schließt ihn nur: Die Buttons bleiben, darunter steht dann nur „Ohne Bestätigung wird nichts an LanguageTool gesendet.“) Wer sich vertan hat, lädt die Seite neu und öffnet das Blatt wieder (z. B. über „Weiterschreiben“) – dann fragt der Dialog wieder. |
| „Zwischenstand konnte auf diesem Gerät nicht gespeichert werden“ (oben im Schreibbereich) | Der Browser lässt nichts mehr speichern – meist ist der Speicher für Website-Daten voll oder gesperrt (z. B. privates Fenster). Die Antworten bleiben erhalten, solange die Seite offen ist; zur Sicherheit „Zwischenstand als PDF-Datei sichern“ oder gleich abgeben. Nach einem Neuladen wäre ein nicht gespeicherter Stand weg. |
| „Den 31. April gibt es nicht. Bitte prüfe deinen Geburtstag.“ | Tag und Monat passen nicht zusammen (der 29. Februar ist erlaubt). Gefragt sind nur Tag und Monat des Geburtstags, kein Jahr. |
| „Für Partner- oder Gruppenarbeit tragt bitte mindestens zwei Personen ein. Arbeitest du allein, wähle „Einzelarbeit“.“ | Bei „Partner- / Gruppenarbeit“ ist nur eine Person eingetragen. Mit „Person hinzufügen“ ein weiteres Feld öffnen – oder mit „← zurück zur Auswahl“ „Einzelarbeit“ wählen. |
| „Person 1 und Person 2 haben dasselbe Kürzel („MaxMu“) …“ | Zwei Felder ergeben dasselbe Kürzel (Groß- und Kleinschreibung zählen nicht). Meist ist eine Person doppelt eingetragen; heißen zwei wirklich so, lässt eine einen Buchstaben weg (z. B. „MaMu“). |
| „Dieses Feibeitsblatt gehört zum Escape-Room „…“. Öffne es über den Arena-Tunnel …“ nach dem Eintippen eines Codes | Kein Fehler: Ein Feibeitsblatt für einen Escape-Room öffnet sich nur über den Arena-Tunnel oder die Überblick-PDF (siehe [Lehrkraft, Schritt 8](#so-arbeiten-sie-als-lehrkraft)). |
| „Dieses Escape-Room-Finale ist noch nicht freigeschaltet …“ | Als die Überblick-PDF bzw. der Link entstand, stand im Quelltext des Escape-Rooms noch kein `FEIBEITSBLATT_CODE`. Code eintragen und veröffentlichen; die Schüler:innen gehen mit der Zwischenstand-Datei des Escape-Rooms zurück in den Raum und durch den Arena-Tunnel (eine Überblick-PDF aus dieser Zeit bleibt ohne Code). |
| „Zu diesem Escape-Room-Finale gibt es kein Feibeitsblatt (mehr).“ | Das Blatt wurde gelöscht oder im Quelltext des Escape-Rooms steht ein falscher Code. Ein neues Blatt anlegen (z. B. „Als Vorlage verwenden“ oder aus der Sicherung laden) und seinen Code eintragen; mit einer Überblick-PDF mit dem alten Code geht es danach nicht mehr – die Schüler:innen kommen (ggf. mit der Zwischenstand-Datei des Escape-Rooms) erneut durch den Arena-Tunnel. |
| „Die Daten aus dem Escape-Room passen nicht zu diesem Feibeitsblatt.“ | Die Kennung des Blattes stimmt nicht mit `ESCAPE_ROOM.id` im Quelltext des Escape-Rooms überein, oder der eingetragene Code gehört zu einem gewöhnlichen Blatt. Ein Blatt mit der richtigen Kennung anlegen (Blätter lassen sich nicht ändern) und seinen Code eintragen. |
| „Zu viele falsche Passwörter …“ / „Zu viele Fehlversuche …“ / „Zu viele unbekannte Codes …“ | Fehlversuche aus demselben Netz (siehe [Sicherheit](#sicherheit)). Mit der richtigen Eingabe geht es trotzdem weiter; die Wartezeit gilt nur für weitere Fehlversuche. |
| „Gerade kommen zu viele Anfragen aus diesem Netz …“ / „Zu viele Versuche …“, den ganzen restlichen Tag | Das Tageslimit von 100 000 Anfragen des kostenlosen Tarifs ist erreicht (Cloudflare antwortet mit HTTP 429); ab Mitternacht UTC (2 Uhr deutscher Sommerzeit) geht es wieder. |

## Optional: GitHub Pages oder eigene Domain

Normalerweise liefert der Worker die Seite selbst aus (`https://feibeitsblatt.<subdomain>.workers.dev`); für die
digitale Arbeit ist mehr nicht nötig. Dieses Repository ist zusätzlich so eingerichtet, dass GitHub Pages dieselbe Seite
unter der eigenen Adresse **`feibeitsblatt.janrickmer.de`** ausliefert, so wie ParentsDay. Die Seite erkennt dann selbst,
dass sie nicht vom Worker kommt, und ruft den Worker unter der Adresse auf, die ganz oben in `index.html` steht
(`window.FEIBEITSBLATT_WORKER`, derzeit `https://feibeitsblatt.feindt.workers.dev`). Beide Adressen nutzen dieselbe
Datenbank; Schüler:innen und Lehrkraft können jede davon verwenden.

**Die Adresse auf Papier und in PDF-Dateien** steht ebenfalls ganz oben in `index.html`: `window.FEIBEITSBLATT_PUBLIC`
(derzeit `https://feibeitsblatt.janrickmer.de/`). Der Hinweis und der **QR-Code zur Checkliste** auf dem analogen Arbeitsblatt
(Schritt 7) führen immer dorthin, ebenso der Link in der Zwischenstand-PDF der Schüler:innen – Schüler:innen, die die Checkliste über
den QR-Code öffnen, laden die Seite also über GitHub Pages (GitHub verarbeitet dabei die IP-Adresse; der Hinweis auf der
Checklisten-Seite nennt das, und der vollständige Datenschutzhinweis nennt GitHub auch unter der Worker-Adresse – dort nur
für die Checklisten-Seite). Nutzen Sie GitHub Pages nicht (oder unter einer anderen Adresse), tragen Sie dort Ihre
Adresse ein, z. B. die Worker-Adresse – sonst führen QR-Code und Hinweis ins Leere bzw. zu einer fremden Installation.
„Checkliste ansehen“ öffnet genau diese Adresse; so sehen Sie vor dem Ausdrucken, ob der QR-Code funktioniert.

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

**Updates nicht während des Unterrichts ausrollen.** GitHub Pages erlaubt Browsern, die Seite bis zu 10 Minuten
zwischenzuspeichern (`Cache-Control: max-age=600`, geprüft im Oktober 2026); unter der `workers.dev`-Adresse fragt der
Browser jedes Mal neu. In diesen Minuten laufen alte und neue Seite nebeneinander – bei der Umstellung des Geburtstags
auf Tag und Monat lehnt eine alte Seite z. B. eine neue Zwischenstand-PDF als „kein Zwischenstand“ ab. Nach dem
Ausrollen deshalb alle geöffneten Seiten (Schüler:innen und Ihre Lehrkraft-Ansicht) einmal neu laden.

Zu beachten:

- Auf GitHub Pages gelten die Sicherheits-Header aus `_headers` nicht (GitHub Pages kann keine eigenen Header setzen).
  Die Content-Security-Policy ist deshalb zusätzlich als `<meta>`-Zeile in `index.html` hinterlegt; nur der Schutz
  gegen das Einbetten in fremde Seiten (`frame-ancestors`) fehlt dort.
- Die Seite selbst kommt dann von GitHub (USA): Beim Laden verarbeitet GitHub die IP-Adresse. Die Seite erkennt das
  (`window.FEIBEITSBLATT_API` ≠ "") und nennt GitHub dann im Datenschutzhinweis und auf der Startseite als weiteren
  Empfänger. Alle übrigen Daten fließen weiterhin nur zum Worker (Cloudflare, Datenbank in der EU), zum KI-Anbieter,
  bei der Rechtschreibprüfung zu LanguageTool und – nur bei Blättern mit YouTube-Videos, nach dem Klick der
  Schüler:innen – an YouTube (Google; siehe [Videos von YouTube](#videos-von-youtube)).
- Die Bilder und PDF-Dateien zu Aufgaben kommen weiterhin vom Worker; die Seite bettet Bilder als `data:`-Adressen
  ein und baut PDF-Dateien im Browser zusammen (`blob:`), ein eigener Eintrag in der CSP ist dafür nicht nötig.
- Eingebettete YouTube-Videos brauchen `frame-src https://www.youtube-nocookie.com` – in `_headers` **und** in der
  `<meta>`-Zeile (sonst blockiert der Browser den Player). `Referrer-Policy: no-referrer` setzt nur der Worker; der Player
  sendet in beiden Fällen nur die Herkunft der Seite (`referrerpolicy` am iframe).
- Eine eigene Domain lässt sich alternativ direkt beim Worker einrichten („Workers & Pages“ → `feibeitsblatt` →
  „Settings“ → „Domains & Routes“ → „Add“ → „Custom domain“). Das setzt voraus, dass die Domain bei Cloudflare
  verwaltet wird, also ihre Nameserver auf Cloudflare zeigen (vorher alle vorhandenen DNS-Einträge wie E-Mail bei
  Cloudflare nachtragen). Ein bloßer CNAME-Eintrag beim bisherigen Anbieter auf die `workers.dev`-Adresse genügt
  **nicht** – Cloudflare beantwortet fremde Hostnamen dort nicht (nicht im Einzelnen geprüft). Die Seite erkennt die
  Worker-Kopie auch unter der eigenen Domain (`npm run build` setzt in `dist/index.html` das Kennzeichen
  `<meta name="feibeitsblatt-host" content="worker">`): Sie ruft den Server dann über dieselbe Adresse auf und nennt
  GitHub nicht als Empfänger.

## Entwicklung

Voraussetzungen: Node.js ab Version 22. Abhängigkeiten: `npm ci` (nur Entwicklungswerkzeuge: wrangler 4.145.0,
@playwright/test 1.56.1 sowie world-atlas 2.0.2, d3-geo 3.1.1 und topojson-client 3.1.0 für die Weltkarte).

| Befehl | Zweck |
|---|---|
| `npm run build` | kopiert `index.html` und `_headers` nach `dist/` (aus diesem Ordner liefert der Worker die Seite aus) |
| `npm run dev` | baut und startet den Worker lokal (`wrangler dev --local`, Standard: <http://localhost:8787>) mit lokaler D1-Datenbank unter `.wrangler/` und einem festen Entwicklungs-`SETTINGS_SECRET` |
| `npm test` | Unit-Tests (`node --test`, Dateien `test/unit/*.test.mjs`) |
| `npm run test:e2e` | Browser-Tests mit Playwright (KI und LanguageTool werden dabei simuliert); braucht einmalig `npx playwright install chromium` und die freien Ports 8787/8790 – vorher `npm run dev` beenden |
| `node test/smoke.mjs` | API-Durchlauf gegen einen echten `wrangler dev --local` mit Test-KI (Ports 8811/8812), auch der tägliche Zeitplan |
| `node scripts/worldmap.mjs` | erzeugt die Weltkarte neu und schreibt sie in `index.html` (`--check` prüft nur) |
| `node test/fixtures/make-fixture.mjs` | erzeugt die Testdatei `test/fixtures/02_Feibeitsblatt_Ein-Auto-eine-Welt.pdf` neu |

**Weltkarte:** Die Länderumrisse stammen aus [Natural Earth](https://www.naturalearthdata.com/) im Maßstab
1:110 Millionen (gemeinfrei), verteilt als npm-Paket [world-atlas](https://github.com/topojson/world-atlas)
(ISC-Lizenz). `scripts/worldmap.mjs` projiziert sie mit [d3-geo](https://github.com/d3/d3-geo) (ISC) in die
flächentreue Equal-Earth-Projektion, ergänzt deutsche Ländernamen und einen Ankerpunkt je Land (dorthin zeigen die
Pfeile) und bettet das Ergebnis (≈ 120 KB) in `index.html` ein – die Seite lädt zur Laufzeit nichts nach. Kosovo,
Nordzypern und Somaliland haben in den Daten keine ISO-Kennung und sind nicht anklickbar. Natural Earth zeichnet
tatsächliche Grenzverläufe („de facto“); abweichend davon gehört die Krim hier zur Ukraine.

**Workers AI lokal:** `wrangler.jsonc` enthält das Binding `"ai": { "binding": "AI", "remote": true }`. Unter
`wrangler dev --local` (so starten `npm run dev`, Smoke- und Browser-Tests) braucht es kein Cloudflare-Konto; `env.AI`
ist dann zwar vorhanden, jeder Aufruf scheitert aber („Binding AI needs to be run remotely“) – „Verbindung testen“
meldet das. Die Unit-Tests ersetzen das Binding durch eine Attrappe (`mockAIBinding` in `test/mock-ai.mjs`); echte
Antworten von Workers AI gibt es erst nach dem Veröffentlichen.

**Lokale Test-KI:** `node test/mock-ai.mjs --port 8812` startet einen OpenAI-kompatiblen Test-Server. In den
KI-Einstellungen dann „Anderer OpenAI-kompatibler Dienst“ wählen, Basis-URL `http://127.0.0.1:8812/v1`, ein
beliebiger API-Schlüssel (der Schlüssel `bad` simuliert einen abgelehnten Schlüssel) und z. B. das Modell
`openai/gpt-oss-120b`. `http://` ist nur für `127.0.0.1` und `localhost` erlaubt. Die Rechtschreibprüfung ruft
auch lokal den echten LanguageTool-Dienst auf; in den Tests wird er simuliert.

**Zeitplan lokal auslösen:** Unter `wrangler dev` startet
`curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=17+2+*+*+*&format=json"` den täglichen Lauf (Löschfrist,
Aufräumen); mit `&time=<Millisekunden>` gilt ein anderer geplanter Zeitpunkt (ein späterer löscht auch alle
abgelaufenen Sperr-Zähler).

**Lokale Secrets** (optional, z. B. `SETTINGS_SECRET`, `TEACHER_DOOR_CODE`) gehören in die Datei `.dev.vars`;
sie ist von Git ausgeschlossen. Ohne `SETTINGS_SECRET` lässt sich auch lokal kein KI-Schlüssel speichern.

**Nie `wrangler deploy` von Hand vor dem ersten Lauf des Workflows „Deploy“** – sonst entsteht die Datenbank
außerhalb der EU (siehe Schritt 5).

**Tippzeiten im Zwischenstand:** `TT_KEEP_IN_DRAFT` in `index.html` (eingecheckt `false` – Annahme des Betreibers: das
Speichern im Zwischenstand bräuchte eine Einwilligung nach § 25 Abs. 1 TDDDG) legt fest, ob die Tippzeiten im
Zwischenstand auf dem Gerät und in der Zwischenstand-PDF mitgespeichert werden. Mit `false` bleiben sie nur im
Arbeitsspeicher (nach dem Neuladen gilt der Text als „ohne Messung“), und beim Laden der Seite werden sie aus vorhandenen
Zwischenständen entfernt; mit `true` stehen sie zusätzlich im Zwischenstand (vorher die Einwilligungsfrage klären).
Erstversuch und Abgabe tragen sie in beiden Fällen. Die Sätze im Datenschutzhinweis, die den
Zwischenstand und die Zwischenstand-PDF betreffen (Rechtsgrundlage, Speicherdauer, Wirkung des Schalters), folgen dem
Schalter von selbst; **beim Umlegen von Hand anpassen:** diese README (Tabelle „Was gespeichert wird“, Abschnitt
[Tippzeiten](#tippzeiten), Textbaustein für Eltern) und CLAUDE.md. Unit-Tests prüfen Speichern/Laden und die Texte des
Schalters in beiden Stellungen; die E2E-Tests leiten ihre Erwartungen aus der eingecheckten Stellung ab – für die andere
die betroffenen Tests (1, 1b, 2, 2b, 7l, 7m) einmal mit umgelegtem Schalter laufen lassen.

**Übergang Geburtstag ohne Jahr – vor dem Ausrollen prüfen:** Zwischenstände, die Schüler:innen vor der Umstellung auf
dem Gerät gespeichert haben, liegen unter einem Speicherschlüssel mit vollem Geburtsdatum. Die Seite sucht sie nur bis
zum Datum `BDAY_LEGACY_UNTIL` in `index.html` (derzeit 15.11.2026). Dieses Datum darf nicht früher liegen als
Ausrolltag + 7 Tage (so lange bleiben Zwischenstände liegen) + einige Tage Puffer; sonst vor dem Ausrollen verschieben –
andernfalls findet die Seite diese Zwischenstände stillschweigend nicht mehr.

**Escape-Room-Schnittstelle (v1):** Der Escape-Room übergibt eine Hülle `{kind: "feibeitsblatt-escape", v: 1, d, s}` – `d`
ist der Datensatz als JSON-Text, `s` eine Prüfsumme über `d` (16 Hex-Zeichen, nur ein Indiz gegen versehentliche
Änderungen) – per Link (`#escape=` + Base64url) oder als eingebettete Datei `feibeitsblatt-escape.json` mit dem
Kennzeichen `/FbEscape 1` in der Überblick-PDF. Einzelheiten, Grenzen und Testvektoren stehen in `CLAUDE.md`
(„Escape-Room-Anbindung“); Änderungen an der Schnittstelle nur gemeinsam mit den Escape-Rooms und mit einer neuen Version
`v`. `test/escape-fixture.mjs` baut Hülle, Link und Überblick-PDF so wie ein Escape-Room (mit frei erfundenen Daten);
`ESCAPE_PDF_OUT=<Ordner> npm run test:e2e` speichert die PDF-Dateien und Bildschirmfotos der Tests 7n/7o zum Ansehen.

**YouTube-Videos:** Gespeichert wird je Aufgabe nur `videos: [{id, start?, title?}]` (nie eine URL); alle Adressen baut der
Browser aus der geprüften Kennung (`youtubeUrl`, `youtubeEmbedUrl` im Block `VIDEO:BEGIN … VIDEO:END` von `index.html`,
Unit-Test `test/unit/video.test.mjs`). Der Player kommt nur aus `https://www.youtube-nocookie.com` – diese Adresse steht als
`frame-src` in `_headers` **und** in der `<meta>`-Zeile der Content-Security-Policy (`test/unit/config.test.mjs` prüft
beide); `img-src` bleibt ohne YouTube, damit nie ein Vorschaubild geladen wird. Die Datenschutztexte zu YouTube stehen in
`YT_PRIV_DU`/`YT_PRIV_IHR` und `ytShort`; sie erscheinen nur bei Blättern mit Videos (Einzelheiten in `CLAUDE.md`,
„YouTube-Videos unter dem Material“). In den Tests ersetzt eine Attrappe YouTube; echtes Abspielen bitte nach dem
Ausrollen einmal von Hand prüfen.

**Aufbau:**

| Datei | Inhalt |
|---|---|
| `index.html` | die ganze Oberfläche für Schüler:innen und Lehrkraft in einer Datei, ohne externe Bibliotheken und Schriften; Verschlüsselung im Browser |
| `_headers` | Sicherheits-Header der Seite (Content-Security-Policy u. a.) |
| `worker/index.js` | Cloudflare Worker: API unter `/api/…`, Datenbank, Sperren, Lehrkraft-Anmeldung |
| `worker/lib.js` | Hilfsfunktionen: Prüfung der Eingaben, Codes, Lastbegrenzung, Verschlüsselung des API-Schlüssels |
| `worker/ai.js` | KI-Anbieter, Prompt für das Feedback, Auswertung der Antworten, Ausweichmodelle |
| `wrangler.jsonc` | Worker-Konfiguration (Datenbank `feibeitsblatt-db`, Workers AI ohne AI Gateway, statische Seite aus `dist/`, täglicher Zeitplan für die Löschfrist, Protokolle aus) |
| `scripts/build.mjs` | Build-Skript für `dist/` |
| `scripts/worldmap.mjs` | erzeugt die eingebettete Weltkarte (Natural Earth über world-atlas, Equal Earth, deutsche Namen) |
| `test/` | Unit-Tests, API-Durchlauf, Test-KI, Browser-Tests |
| `.github/workflows/deploy.yml` | Workflow „Deploy“ |
| `CLAUDE.md` | technische Hinweise für die Weiterentwicklung |

Diese Anleitung, `CLAUDE.md` und der gesamte Code sind öffentlich: Hier gehören keine Schlüssel, Passwörter oder
echten Schülerdaten hinein.
