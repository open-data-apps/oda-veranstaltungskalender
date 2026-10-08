# Changelog

## 1.4.5 - 2026-10-08

- **Bildnachweise erst im Detail:** Programm, Katalog und Archiv zeigen keine Bildtitel-, Rechte-, Quellen- oder Lizenzzeile mehr unter den Veranstaltungskarten. Die vollständigen gelieferten Angaben bleiben in der Detailansicht und deren Bildvergrößerung erreichbar.
- **Darstellungszusatz entfernt:** „Darstellung: skaliert und beschnitten“ und „Darstellung: skaliert“ werden nicht mehr ergänzt. Die Bilddarstellung selbst sowie die geladenen Rechte- und Lizenzmetadaten bleiben unverändert.
- **Gezielte Regressionen:** Node- und Browserprüfungen verlangen nachweisfreie Übersichten mit weiterhin vorhandenen Bildern und Detailzugängen sowie vollständige bildgenaue Nachweise im Detail. Keine Änderung an Templates, Datenabfragen, Original-Screenshots oder der Bildnachweisdatei.

## 1.4.4 - 2026-10-08

- **Konkreter Termin statt falschem Datum:** Karten, Details, Teilen-Links und ICS unterscheiden Archiv-/Zukunftstermine derselben DZT-Kennung. Neue Links tragen eine Terminkennung; fehlt dieser Termin im geladenen Bestand, erscheint ein Hinweis statt eines Ersatzdatums. Alte Links nur mit Event-ID bleiben nutzbar, ohne diese zusätzliche Unterscheidung.
- **Tagesstand und Datumsgrenzen:** Offene Tabs laden beim Tageswechsel neu, auch nach Rückkehr aus dem Hintergrund. Abgebrochene/späte Vortagsantworten können weder den neuen Bestand noch dessen Cache überschreiben. Die Wochenendkennzahl berücksichtigt überlappende mehrtägige Veranstaltungen; die Abfrage umfasst auch Uhrzeiten am letzten Tag des Zukunftsfensters.
- **Gezielte Barrierefreiheit:** Art-Optionen sind benannte Toggle-Buttons; Escape gibt den Fokus zum Art-Button zurück. Detaildialoge haben einen zugänglichen Titel, Informationsseiten erhalten gezielt Fokus. Der Bootstrap-freie Dialog ist für assistive Technik sichtbar und begrenzt Tab/Shift+Tab. Metadaten, Typ- und Live-Badges verwenden kontrastreichere Farben.
- **Aussagekräftigere Prüfwerkzeuge:** Unbekannte oder leere Suites und ungefangene JavaScript-Fehler sind Fehler. Fixture-Transport startet vor der App; Leerhinweise, Kontrastmesspunkte, vollständig entfaltete ICS-Beschreibungen und die tatsächliche Cache-Bereitschaft werden geprüft. Der Screenshot-Helfer verwendet einen eigenen Browserprozess und zustandsbasiertes Warten.
- **Saubere Lieferung:** Das Makefile baut ein frisches temporäres ZIP und ersetzt das bisherige Paket erst bei Erfolg. Fehlende externe ODAS-Prüfwerkzeuge werden benannt. Das Schema enthält auch die Beschreibung; das ungenutzte Chart.js wurde samt zugehörigem Lizenzabschnitt entfernt. README und Versionsangaben sind aktualisiert.
- **Unveränderte Grenzen:** Template-Runtime, Infrastruktur, Konfigurationsfelder, sechs Original-Screenshots und Bild-/Kartennachweise bleiben erhalten. Serien-/Ortsverdichtung, ICS-00:00-Konvention und offene Rechtefragen werden nicht stillschweigend neu definiert.

## 1.4.3 - 2026-10-07

- **Tastaturfokus in der Bildvergrößerung:** Die Lightbox liegt jetzt innerhalb des Detailfensters, sodass dessen Fokusbegrenzung die Bildquellen- und Lizenzlinks nicht mehr blockiert. Tab/Shift+Tab bleiben in der Bildansicht; Escape schließt nur diese und gibt den Fokus an den Bild-Button zurück.
- **Detailfenster sicher schließen:** Bootstrap wird erst nach dem Ende der Ausblendung freigegeben. Frühes Schließen während des Öffnens wird nachgeholt; ein angefordertes Folgedetail wartet auf das geschlossene Fenster und entfällt bei Seitenwechsel. Nachlaufende Zugriffe auf bereits entfernte Elemente werden so vermieden. Die bestehenden Animationen bleiben erhalten.
- **Regressionstests mit echten Übergängen:** Neue Browser-Suite `modal` prüft Fokus, reguläres/frühes Schließen, Detailwechsel, Seitenwechsel und den Bootstrap-freien Fallback mit aktiven Animationen und Browserfokus. Keine Änderungen an Datenabfrage, Bild-/Kartennachweisen oder den sechs Original-Screenshots.

## 1.4.2 - 2026-10-07

- **Bildgenaue Nachweise:** Die DZT-Abfragen laden Titel, Bildlizenz, Copyright-Hinweis und Rechteinhaber am jeweiligen Bildobjekt. Separatorsichere Datensätze binden diese Angaben an die konkrete Bild-URL; Bildreihenfolge und Veranstaltungslizenz können den Nachweis nicht vertauschen.
- **Anzeige in allen Bildansichten:** Programm, Archiv, Katalog, Detail und Lightbox zeigen gelieferte Rechteangaben sowie verlinkte Bildquelle und Lizenz. Ausschnitte/Skalierung werden benannt; fehlende Angaben werden nicht erfunden. Die Nachweis-Links stehen ausserhalb der Karten-/Bild-Buttons.
- **Nachweise im Lieferpaket:** `assets/BILDNACHWEISE.md` dokumentiert die geprüften Screenshot-Motive, konkrete Quellen/Lizenzen, zusätzliche gelieferte Bilder und OSM-Kartenhinweise. README und Datenschema sind ergänzt; die MIT-Lizenz des App-Codes bleibt unverändert.
- **Screenshots unverändert (1B):** Alle sechs PNGs bleiben byte-identisch. Der nicht zugeordnete dünne Bildstreifen am unteren Rand des mobilen Archiv-Screenshots und unvollständige Rechteangaben bleiben ausdrücklich offene Nachweislücken; keine vollständige Veröffentlichungsfreigabe wird behauptet.

## 1.4.1 - 2026-10-02

- **Dienstkennung im Paket:** Der benötigte ODAS-Dienst ist jetzt als `tourismus-odg` deklariert. App-Logik und die sechs Dev-Screenshots bleiben unverändert.

## 1.4.0 - 2026-10-01

- **App umbenannt:** App und Projektordner heißen technisch jetzt `oda-veranstaltungskalender`. Der URL-Name (`name-in-url`) im Paket ist entsprechend aktualisiert. Der Anzeigename im Store bleibt „Veranstaltungskalender". Ordner, Paketmetadaten, Beispielkonfiguration und Repository-Verweise sind durchgängig angepasst; das Makefile leitet den Namen des Liefer-ZIP aus dem Ordnernamen ab und folgt automatisch.
- **Neue Store-Screenshots:** Sechs Aufnahmen – Programm-Board, Karte und Archiv, jeweils als Desktop- (1440 × 900 Pixel) und Mobilansicht (375 × 812 CSS-Pixel, aufgenommen mit 750 × 1624 Pixel) – erstellt auf einer laufenden Instanz mit echten Daten. Sie ersetzen die beiden bisherigen Aufnahmen mit synthetischen Beispieldaten.

## 1.3.3 - 2026-10-01

- **Pfeiltasten in der Ansichtsleiste:** Die Leiste war bereits als Reiter-Leiste ausgezeichnet, aber ohne die zugehörige Tastaturbedienung – mit der Tastatur kam man nicht von einer Ansicht zur nächsten. Pfeil links/rechts wechselt jetzt die Ansicht, `Pos1`/`Ende` springt an den Rand. Die Auszeichnung ist vervollständigt: `role="tab"`, `aria-selected` statt `aria-pressed`, und nur die aktive Ansicht ist mit der Tabulatortaste erreichbar. Ein Klick auf die bereits gewählte Ansicht erzeugt keinen zusätzlichen Verlaufseintrag mehr.
- **Lizenz im Lieferpaket:** Das Paket enthält jetzt die Datei `LICENSE`. Sie fehlte, weil das Makefile sie nicht mitgepackt hat – wer die App weitergibt, findet die Lizenz nun im Paket.

## 1.3.2 - 2026-10-01

- **Kein Ruckeln mehr beim KPI-Aufklapper:** Der Aufklapper animierte seine Höhe. Eine Höhenanimation erzwingt pro Bild ein Layout; mit echten Daten gemessen (Dev-Instanz, 18 Karten) lag die Spitze bei 50 ms statt 17 ms pro Bild, p95 bei 16,7 statt 8,8 ms. Der Aufklapper springt jetzt, statt zu wachsen – die Bildzeiten liegen wieder auf dem Ruhewert (Spitze 8,8 ms). Auf- und Zuklappen wirkt dadurch sofort (1–12 ms statt 350 ms Animation).
- **Zurück/Vorwärts zwischen den Ansichten:** Ein Klick auf Programm, Karte, Katalog oder Archiv erzeugte keinen Verlaufseintrag. „Zurück“ verließ deshalb die App oder lud sie neu, „Vorwärts“ stellte die Ansicht nie wieder her. Der Ansichtswechsel liegt jetzt im Verlauf; die Adresse bleibt unverändert.
- **Keine gestrichelten Linien mehr:** Die Trennlinie über dem KPI-Erklärtext und über der Copyright-Zeile ist jetzt durchgezogen, der Kasten „Archiv öffnen“ hat einen durchgezogenen Rand.

## 1.3.1 - 2026-10-01

- **„Link kopieren“ kopiert jetzt wirklich:** Auf Adressen ohne Zwischenablage-Schnittstelle (etwa der Testinstanz über http) meldete die App „Link kopiert“, während die Zwischenablage leer blieb. Ursache: Das Hilfselement des Ersatzwegs lag außerhalb des Detailfensters, und die Fokusfalle des Fensters zog den Fokus sofort wieder heraus – der Kopierbefehl lief deshalb ins Leere, meldete aber Erfolg. Das Hilfselement liegt jetzt innerhalb des Fensters. Mit echtem Browser und Blick in die System-Zwischenablage nachgemessen.
- **Teilen über X:** Die Teilen-Reihe hat eine Schaltfläche für X.
- **Feste Wege immer sichtbar:** WhatsApp, X, E-Mail und „Link kopieren“ erscheinen jetzt unabhängig vom Gerät. Bisher wurden sie auf Geräten mit eigenem Teilen-Menü ausgeblendet – dort fehlte X, weil das Systemmenü auf dem Rechner kein X kennt. Das Gerätemenü kommt als zusätzliche Schaltfläche „Teilen“ dazu.

## 1.3.0 - 2026-10-01

- **Veranstaltungen teilen:** Die Detailansicht hat eine Teilen-Reihe. Bietet das Gerät ein eigenes Teilen-Menü an, stehen dort „Teilen“ und „Link kopieren“; sonst die festen Wege WhatsApp, E-Mail und „Link kopieren“.
- **Geteilter Link öffnet genau die Veranstaltung:** Der Link trägt die Kennung der Veranstaltung als Adressparameter (`?event=…`). Beim Öffnen sucht die App im gesamten geladenen Bestand – auch im Archiv –, damit die Filter des Empfängers einen geteilten Link nicht ins Leere laufen lassen. Kennt die Instanz die Veranstaltung nicht, bleibt der Kalender stehen und ein Hinweis erklärt die Lage.
- **Kopieren funktioniert auch ohne Zwischenablage-Schnittstelle:** Diese Schnittstelle gibt es nur in gesicherten Kontexten – über https oder auf der eigenen Rechneradresse (localhost, 127.0.0.1). Für die übrigen Fälle greift ein Ersatzweg, damit „Link kopieren“ auch dort arbeitet.
- **Kein Rückstand im DOM:** Bricht der Kopiervorgang ab, wird das dafür angelegte Hilfselement in jedem Fall wieder entfernt.
- **Datenschutzangabe ergänzt:** Der Text nennt jetzt das Teilen. Eine Verbindung zum gewählten Dienst entsteht erst beim Anklicken; die App lädt keine Inhalte sozialer Netzwerke und bindet keine fremden Skripte ein.

## 1.2.7 - 2026-10-01

- **Kalender-Export korrigiert:** Ganztägige Termine endeten im Kalender einen Tag zu früh, ein eintägiger ganztägiger Termin hatte sogar die Dauer null. Das Kalenderformat behandelt das Ende ausschließlich (exklusiv), die App führt das Enddatum dagegen einschließlich. Die exportierte Datei setzt das Ende jetzt auf den Folgetag des letzten Veranstaltungstags.
- **Zeitlimit gilt für die gesamte Antwort:** Das in v1.2.5 eingeführte Zeitlimit endete, sobald die Antwort begann. Hing der Inhalt danach, lud die App unbegrenzt weiter – und ein Seitenwechsel konnte den Abruf nicht mehr abbrechen. Zeitlimit und Abbruch gelten jetzt bis der Inhalt vollständig gelesen ist.
- **Datenschutzangabe präzisiert:** Der Text nennt jetzt die direkten Bildabrufe bei den Servern der Datenlieferanten samt der dabei übertragenen Verbindungsdaten. Die pauschale Aussage, es würden keine personenbezogenen Daten verarbeitet, ist entfallen, weil sie den tatsächlichen Netzwerkzugriffen nicht standhielt.
- **Dokumentation und Schema abgeglichen:** Die Feldnamen des Datenschemas entsprechen jetzt dem tatsächlich erzeugten Datenmodell; README und Paketmetadaten nennen alle gebündelten Bibliotheken, die Bildherkunft und die vollständige Antwortspaltenliste.
- **Paket-Screenshots erneuert:** Desktop- und Mobile-Bild zeigen die Startseite mit den mitgelieferten synthetischen Beispieldaten statt mit Fotos Dritter.
- **Lizenz und Drittanbieter-Hinweise:** Das Projekt steht unter der MIT-Lizenz (`LICENSE`). Die vier mitgelieferten Bibliotheken Bootstrap 5.3.8, Chart.js 4.4.9, Leaflet 1.9.4 und Leaflet.markercluster 1.5.3 lagen ohne vollständige Lizenztexte im Paket; diese stehen jetzt in `app/vendor/THIRD-PARTY-NOTICES.md` und werden mit dem Lieferpaket ausgeliefert.

## 1.2.6 - 2026-10-01

- **Aktuelle Paket-Screenshots:** Desktop- und Mobile-Bild zeigen die Startseite von v1.2.6 mit echten Veranstaltungsdaten aus der Dev-Instanz; Mobile wurde mit 375×812 CSS-Pixeln und DPR 2 aufgenommen.
- **Einheitliches Menü auf allen Seiten:** Startseite, Beschreibung, Kontakt, Impressum und Datenschutz verwenden denselben App-Kopf, Burger-Button und rechten Menü-Drawer. Die aktive Seite wird markiert; normale Hash-Links und direkte Seitenaufrufe bleiben erhalten.
- **Durchgängiges App-Design:** Sekundärseiten bieten „Zum Programm“ statt Ansichts-Tabs, eine zentrierte Lesekarte und die konfigurierte Fußzeile als dezenten App-Abschluss. Der Kopf bleibt beim Scrollen langer Texte sichtbar; das Template bleibt unverändert.
- **Tastaturbedienung:** Geschlossener Drawer nicht fokussierbar, Fokus beim Öffnen im Menü, Tab-Zyklus im offenen Menü, Escape schließt mit Fokus-Rückgabe.

## 1.2.5 - 2026-10-01

- **Robustheit: Zeitlimit für Netzverbindungen (Mobile-Audit D-5):** Hängende Verbindungen zum Daten-Relay (20 Sekunden) und zum OpenStreetMap-Geokodierungsdienst (8 Sekunden) enden mit einer verständlichen Meldung statt eines endlosen Ladekreises. Das Verlassen der Seite bricht weiterhin sofort ab.
- **Kalenderdatei nach RFC 5545 gefaltet (Mobile-Audit D-7):** Der ICS-Export falten lange Zeilen normgerecht auf höchstens 75 Oktetten – Kalenderprogramme empfangen damit auch lange Titel, Orte und Beschreibungen sauber, unabhängig von Umlauten.
- **Datencache veraltet nicht über Mitternacht (Mobile-Audit D-4):** Der Zwischenspeicher ist jetzt tagesgebunden – ein über Nacht offener Browser-Tab lädt am Folgetag das korrekte Zeitfenster neu statt mit altem Bestand zu rechnen.

## 1.2.4 - 2026-10-01

- **Menü-Button rechts auch auf Handys (Mobile-Audit M-1):** Auf schmalen Bildschirmen (bis 575 px) klebte der Burger-Button hinter dem Titel statt am rechten Rand. Er sitzt jetzt auf allen Größen außen rechts.
- **Besserer Kontrast der Trefferzahlen (Mobile-Audit A-1):** Die Anzahl hinter jeder Veranstaltungsart im Dropdown war zu schwach kontrastiert (2,6:1) – jetzt WCAG-konform lesbar (4,75:1).
- **Klare Fehlermeldung bei defektem Relay (Mobile-Audit D-6):** Liefert der Daten-Relay ein ungültiges Antwortformat, zeigt die App jetzt eine Fehlermeldung mit Prüfhinweis statt eines irreführend leeren Programms.

## 1.2.3 - 2026-10-01

- **Datencache für nahtlose Navigation:** Die Veranstaltungsdaten (einschließlich Ortsauflösung) werden beim ersten Aufruf geladen und sitzungsweit gespeichert. Wechsel zwischen App und den Sekundärseiten (Über diese App, Kontakt, Impressum, Datenschutz) zeigt das Programm daraufhin sofort – ohne erneuten Datenabruf und ohne Wartezeit. Ein frisch geöffneter Tab lädt wie gehabt aktuell.

## 1.2.2 - 2026-10-01

- **Toolbar stabil und luftig:** Die Filterleiste wird vom Veranstaltungs-Feed nicht mehr zusammengedrückt (die Suchleiste war abgeschnitten, die Höhe pulsierte beim Öffnen des Art-Dropdowns). Neues zweizeiliges Layout: Zeitraum-Pills, Art und Kostenlos in Zeile 1 (umbrechend statt seitlich scrollend), die Suche darunter über die volle Breite mit richtigem Innenabstand – der Vorschautext ist vollständig sichtbar. Das Art-Dropdown wird dadurch nie mehr beschnitten; der vorherige Workaround entfällt.
- **Menü öffnet von rechts:** Der Drawer gleitet passend zum Burger-Button (☰, oben rechts) von der rechten Bildschirmkante ein.
- **Bugfix Barrierefreiheit (Bewegung reduzieren):** Bei aktivierter Systemoption „Bewegung reduzieren“ fror Chromium die Mikro-Übergänge ein – das Menü öffnete sich nicht mehr. Übergänge springen nun sofort und zuverlässig.
- **Sekundärseiten im App-Design:** „Über diese App", Kontakt, Impressum und Datenschutz zeigen sich nun im Look der App – App-Hintergrund, zentrierte Inhaltskarte mit App-Rundungen und -Typografie. Portalkopf und -fußzeile bleiben erhalten.

## 1.2.1 - 2026-10-01

- **Menü rechts & normale Navigation:** Das Burger-Menü (☰) sitzt jetzt außen rechts in der Kopfzeile. Der Drawer ist ein schlankes Navigationsmenü: Beschreibung, Kontakt, Impressum und Datenschutz sind normale Links – die gewohnten Portalseiten öffnen sich ganz regulär (mit Portalkopf, Menü und Fußzeile), „Programm" bleibt in der App.
- **Markdown wird gerendert:** Die Texte der Sekundärseiten (Beschreibung, Kontakt, Impressum, Datenschutz) sind im Store-Editor Markdown. Die App rendert sie jetzt dynamisch über den offiziellen Plattform-Hook: Überschriften, Fettdruck, Kursivdruck, Listen und Links werden korrekt formatiert angezeigt – Änderungen im Editor wirken sofort, ohne App-Neubau.
- **Bugfix Art-Filter:** Das aufgeklappte Art-Dropdown war unsichtbar, weil die Filterleiste es abschnitt (horizontales Scrollen). Solange das Dropdown offen ist, wird die Leiste nicht mehr beschnitten – das Panel liegt zuverlässig über dem Veranstaltungs-Feed.

## 1.2.0 - 2026-10-01

- **100%-Vollbild mit eigenem Menü:** Die App füllt die gesamte Seite; der Template-Header (inkl. Burger-Menü) und die Template-Fußzeile werden nur im App-Zustand per CSS ausgeblendet. Ein eigener Menü-Drawer (☰ oben links) zeigt alle Sekundärseiten (Über diese App, Kontakt, Impressum, Datenschutz) direkt aus der Instanz-Konfiguration — ohne Seitenwechsel, ohne Zustandsverlust. Geteilte Deep-Links (#datenschutz) öffnen weiterhin die gewohnte Template-Seite als Fallback.
- **Art-Filter als Dropdown:** Die 8 Veranstaltungstypen sind keine Pills mehr in der Leiste, sondern ein „Art"-Dropdown mit Checkboxen, Farbpunkten und Trefferzahlen; der Button zeigt die aktive Anzahl, „Alle Arten" setzt zurück. Schließt per Außenklick oder ESC. Zeitraum (Pills), „Kostenlos" und Suche bleiben unverändert.
- **Einklappbarer Datenquelle-Block:** Methodik, Datenstand und weiterführende Links klappen am Feed-Ende auf und zu (eine schmale Kopfzeile, standardmäßig zu). Die Template-Fußzeile (©) integriert als letzte Zeile im aufgeklappten Bereich — die App wird randlos, ohne dass Footer-Informationen verloren gehen.

## 1.1.0 - 2026-10-01

- **Serien-Veranstaltungen (eventSchedule):** Veranstaltungen mit Wiederholungsmustern (Toubiz-Daten, u. a. Baden-Württemberg) werden jetzt angezeigt – ihr Serien-Zeitraum wird auf die Veranstaltung gemappt (Start/Ende aus dem Schedule-Objekt, Uhrzeit aus schedule:startTime). Keine Expansion zu Einzelterminen; Serien laufen wie Dauerveranstaltungen als „läuft im Zeitraum". Messwerte: Böblingen 25 km von 0 auf 54 kommende Veranstaltungen, Ansbach 25 km von 22 auf 87.
- **Vollbild-Shell für alle Ansichten:** Programm, Karte, Katalog und Archiv füllen den Bildschirm einheitlich – die App misst Template-Kopf- und Fußzeile dynamisch und füllt den Raum dazwischen. Kopfzeile mit Burger-Menü und Fußzeile bleiben dauerhaft sichtbar, alle Sekundärseiten (Kontakt, Impressum, Datenschutz, Über diese App) laufen unverändert über das Template-Routing.
- **Design-Einheit:** Die Sekundärseiten erscheinen im gleichen Slate/Glass-Design wie die App (Karten-Layout, Typografie, Link-Farben) – ohne Änderung der Template-Dateien.

## 1.0.0 - 2026-10-01

- Erste Version des DZT-Veranstaltungskalenders für den Open Data App Store.
- Zeit-first-Programm-Board mit vier Ansichten: Programm, Karte, Katalog, Archiv.
- Acht Veranstaltungstypen als farbcodierte Filter-Pills (Musik, Theater, Ausstellung, Fest, Sport, Kinder, Essen & Trinken, Soziales) – gefiltert wird ausschließlich über schema.org-Typen und -Attribute, nie über Stichwortsuche.
- Zeitraum-Filter (Heute, 7, 30, 90 Tage, alle) mit Live-Trefferzahlen; Filter „Kostenlos" über das Schema-Attribut isAccessibleForFree.
- Datenregel: Abgesagte Veranstaltungen (eventStatus EventCancelled) werden bereits in der Abfrage ausgeschlossen.
- Vollbild-Karte (Leaflet mit Marker-Clustering, vendored) inklusive Home-Button; Veranstaltungen ohne Geokoordinaten bleiben im Programm mit Klartext-Ort sichtbar.
- Foto-Katalog der Veranstaltungen mit Bild; Archiv-Rückblick der vergangenen 365 Tage in Monatsgruppen.
- Detailansicht als Modal mit Bild-Lightbox, Routenlink (OpenStreetMap) und ICS-Kalender-Export („In meinen Kalender", clientseitig generiert, kein Server, kein Key).
- Live-Suche über Name, Beschreibung und Ort.
- Schale-4-Komponenten: Methodik-Kasten, Datenstand, KPI-Kontexttexte und weiterführende Links (rendern nur, wenn konfiguriert).
- Datenabruf ausschließlich über den ODAS-DZT-Relay; API-Key bleibt serverseitig im Store. Ortsauflösung per OpenStreetMap-Geokodierung (Nominatim).
