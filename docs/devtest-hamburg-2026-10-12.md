# Dev-Test Hamburg – 12.10.2026

## Ziel und Verfahren

Geprüft wurde die bestehende öffentliche Dev-Instanz unter `http://100.66.238.123:3000/view/audit-test/oda-veranstaltungskalender/cmuo0ajoh0001t12n0bqdkd2a/`. Es gab keine Server-Mutationen. Der Browser verwendete echte Daten über den ODAS-DZT-Relay, keine Fixtures oder injizierten Veranstaltungen. Die Prüfung lief in Chrome bei 1440 × 900 CSS-Pixeln sowie bei 375 × 812 CSS-Pixeln mit DPR 2 (Mobile-Emulation, kein physisches Mobilgerät).

## Funktionstest und Lieferstand vor dem abschließenden Upload

**Vor dem abschließenden Upload: 53 Prüfungen bestanden, 9 Lieferstand-Prüfungen fehlgeschlagen.** Der folgende Abschnitt dokumentiert diesen ursprünglichen Lauf; die Nachprüfung nach Upload steht weiter unten.

- Alle **50 Browserprüfungen** bestanden: Hamburg/25-km-Konfiguration, erfolgreicher Relay, Viewports ohne horizontalen Überlauf, Startfilter, 90-Tage-Filter, Suche mit Treffer/Leerzustand/Zurücksetzen, Art- und Kostenlos-Filter, Details mit Dialognamen und Schließen, tatsächlicher ICS-Download mit geprüftem Veranstaltungstermin, Karte mit OSM-Attribution, Katalog-Bildfilter, Archiv-Leerzustand, Menü, Informationsseite und Rückkehr ohne zusätzliche DZT-Abfrage.
- Zusätzlich bestanden Dev-Version `1.4.6`, Paketdefault Hamburg/25 km und Bytevergleich des ausgelieferten `app.js` mit dem lokalen Quelltext.
- Die zwei Browserläufe luden jeweils 11 kommende Veranstaltungen: zwei im initialen Sieben-Tage-Fenster und sechs im 90-Tage-Fenster. Das Archiv war leer. Das sind geladene Ausschnitte, keine Gesamtzählung des DZT-Bestands.

## Fehlgeschlagene Lieferstand-Prüfungen

1. Der neue Absatz „Als Demo sind Hamburg …“ fehlt in der auf Dev ausgelieferten Store-Beschreibung.
2. Die Dev-Paketmetadaten verweisen noch auf die sechs historischen `Desktop_Screenshot_*`-/`Mobile_Screenshot_*`-Dateien statt auf die neuen Hamburg-Dateien.
3. Die sechs neuen Hamburg-PNGs und `assets/SCREENSHOTS_HAMBURG_1.4.6.json` antworten auf Dev jeweils mit **HTTP 404** (sieben Einzelprüfungen).

Zum Zeitpunkt dieses ursprünglichen Laufs war das finale lokale ZIP mit den aktualisierten Beschreibungen und neuen Assets noch nicht auf Dev hochgeladen. Der damalige Test bestätigte den unvollständigen Lieferstand. Dieser Upload und die Nachprüfung wurden anschließend durchgeführt.

## Nachprüfung nach Upload – 12.10.2026, 09:38 CEST

Das vollständige ZIP wurde über die angemeldete Dev-Build-Oberfläche hochgeladen. **Alle 17 Nachprüfungen bestanden; die neun zuvor offenen Lieferstand-Punkte sind damit behoben.**

- Version 1.4.6 und Paketdefault Hamburg/25 km stimmen.
- Die Store-Beschreibung enthält den neuen Hamburg-Demo-Absatz; beide Paketbeschreibungen entsprechen den lokalen Werten.
- Die Dev-Screenshot-Verweise entsprechen dem neuen Satz. Alle sechs PNGs, Aufnahmebeleg und Bildnachweise antworten mit HTTP 200 und sind byte-identisch zu den Quelldateien.
- Ausgeliefertes `app.js` und `app-base.js` sind byte-identisch zu den lokalen Dateien. Die bereits geprüfte Laufzeit wurde durch diesen abschließenden Upload nicht geändert; die 50 bestandenen Browserprüfungen bleiben als separater Funktionstest dokumentiert und wurden nicht als neue Prüfungen gezählt.
- Die gespeicherte Instanz-Konfiguration blieb beim Upload unverändert, einschließlich Hamburg/25 km, Titel, Seitentitel und individueller Texte.

Die Einzelwerte der Nachprüfung stehen in [devtest-hamburg-postupload-2026-10-12.json](devtest-hamburg-postupload-2026-10-12.json). Dies schließt die geprüfte Hamburg-Umstellung ab, erweitert aber nicht die unten genannten Prüfgrenzen.

## Grenzen

Der Bildfilter des Katalogs wurde geprüft. Die bedingte Bildvergrößerungsprüfung wurde in diesen Läufen nicht ausgeführt, da das zuerst geprüfte Termindetail kein Foto hatte. Teilen/OS-Zwischenablage, echte Mobilgeräte und umfassende Barrierefreiheit wurden nicht abgenommen. Der Archiv-Leerzustand belegt nicht, dass im DZT keine vergangenen Veranstaltungen existieren. Die bekannte unvollständige Geo-Abfrage bleibt offen.

Die Einzelprüfungen mit Status und Messwerten stehen in [devtest-hamburg-2026-10-12.json](devtest-hamburg-2026-10-12.json).
