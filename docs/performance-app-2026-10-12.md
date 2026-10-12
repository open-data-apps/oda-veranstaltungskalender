# App-only Ladeoptimierung – 1.5.0

## Umfang

Nur Veranstaltungskalender-App, Tests, Metadaten und Dokumentation geändert. Kein Store-/Relay-/Template-Umbau, keine neue Runtime-Konfiguration. Kein Upload und kein Commit/Push in diesem Auftrag. Der Betreiber übernimmt den Upload.

## Umsetzung

1. **Geo-IDs getrennt ermitteln:** `SELECT DISTINCT ?loc` kapselt die native Geo-Treffermenge vor dem Event-Join. Kreisaufteilung, acht Typen, Datums-/Absagefilter und globale Grenzen 600/400 bleiben gleich. Vollständige Beschreibungen und Bildnachweise bleiben im Ergebnis. Ein zusätzlicher Detailabruf wurde verworfen: Eine reine ID-Probe brauchte bereits 28,5 s, und der Geo-Subselect brachte auch mit vollständigen Daten eine messbare Verbesserung (20,9 s gegenüber 31,3/33,6 s für dieselbe Teilfläche direkt an DZT).
2. **Archiv bei Bedarf:** Beim Start nur Zukunft. Archiv bei erstem Aufruf oder für nicht im Zukunftsbestand gefundene geteilte Termine. Zentrum und geprüfter Geo-Plan werden wiederverwendet. Mehrfachklicks teilen sich eine laufende Anfrage; ein Fehler betrifft nicht das Programm und bietet Wiederholen an. Die Prüfung geteilter Links wartet auf den nötigen Archivabruf.
3. **Browser-Cache:** Ein localStorage-Eintrag je Instanzpfad; Konfigurations-/Tageskennung im Inhalt. Unter 15 Minuten ohne Geocoding/DZT-Abruf wiederverwenden. Ältere Daten desselben Tages sofort gekennzeichnet anzeigen und im Hintergrund erneuern; Nutzung höchstens 24 Stunden. Kein Wiederverwenden bei neuem Tag/geänderter Konfiguration. Ladezeitpunkt bleibt sichtbar. Gesperrter oder ungültiger Speicher blockiert die App nicht; fehlgeschlagene Aktualisierung entfernt vorhandene Daten nicht. Alte Einträge werden nicht per Timer gelöscht, sondern überschrieben oder durch Löschen der Website-Daten entfernt; Datenschutzhinweis unterscheidet Speicher- und Nutzungsfrist.

## Messungen mit echten DZT-Daten

Lokal ausgeführter App-Datenlader gegen den **unveränderten öffentlichen Dev-Relay**. Kein API-Key im Client, keine injizierten Events. Hamburg · 25 km, Stichtag 12.10.2026. Danach Vorgänger-Code aus Git HEAD (1.4.9) am selben Relay erneut gemessen, um nicht nur eine alte Zeit zu vergleichen.

| Messung | Dauer | Relay-Requests | Ergebnis |
|---|---:|---:|---|
| Neue App, kalter Start (Zukunft) | 38,437 s | 5 | 600 kommende, davon 416 im Sieben-Tage-Fenster |
| Vorgänger 1.4.9, Start inkl. Archiv | 69,346 s | 7 | 600 kommende, 0 Archiv |
| Neue App, Archiv auf Abruf | 34,906 s | 2 | 0 Archiv; keine erneute Geo-Zählung oder Ortsauflösung |

**44,6 % kürzere Startwartezeit in diesem Vergleich.** Alle Requests HTTP 200; längste finale Relay-URL 7.742 Zeichen. Dies ist keine Garantie und kein statistischer Benchmark: DZT-Laufzeiten schwanken. Das Archiv ist nicht schneller sichtbar, sondern seine Wartezeit fällt erst bei Nutzung an. Die Gesamtarbeit beim Öffnen beider Zeitbereiche wird dadurch nicht zwingend kürzer.

**Parität:** Alle 600 Event-IDs, Beginn/Ende/Startzeit, Ortsnamen/Koordinaten, Bild-URLs und Bildnachweise stimmen mit der erneut geladenen Referenz überein. Maschinenlesbarer Vergleich: [`performance-app-2026-10-12.json`](performance-app-2026-10-12.json). Kaltstart bleibt trotz Verbesserung ein langer Abruf; Cache-Treffer vermeiden ihn bei Wiederholungsaufrufen.

## Verifikation

- **31 Node-Testdateien** bestanden; neue Tests für Lazy-Archiv, Geo-Plan-Wiederverwendung, coalesced Requests, veraltete Antworten, persistente Cache-Treffer/-Fristen/-Isolation, fehlende optionale Felder, kaputten/gesperrten Speicher.
- **24 neue lokale Performance-Browserchecks**, **22 Ladefortschrittschecks**, **39 Reviewregressionen** bestanden: 375/1440 bzw. bestehende 375/1366 CSS-Pixel, synthetische Fixtures über Live Server (Port 5503). Reale Seitenneuladung verwendet localStorage ohne neue Datenrequests; veraltete Daten sofort sichtbar; fehlgeschlagene Aktualisierung erhält sie; erfolgreiche Aktualisierung ersetzt sie. Kalter geteilter Archivlink lädt den konkreten Termin.
- **195 weitere lokale Browserchecks** bestanden: sweep 75, zustaende 10, interaktion 3, sekundaer 24, verlauf 8, ruhig 10, teilen 24, modal 14, bildnachweise 16, a11y 6, fehler 5. Gesamt **280** lokale Browserprüfungen. Die gemischte `flows`-Suite wurde nicht als aktuelle Dev-Abnahme ausgeführt, da der neue Build nicht hochgeladen wurde.
- Syntax, JSON, Konfigurations-Linter und `git diff --check` bestanden. Eine versehentliche doppelte Datenstand-CSS-Regel wurde vom bestehenden Kontrasttest erkannt und entfernt; verwendet wird der bereits geprüfte Stil.
- Ein unabhängiges Review identifizierte den zu frühen Nicht-gefunden-Abschluss eines geteilten Links bei veraltetem, bereits geladenem Archiv. Regression zunächst rot, Korrektur grün: Abschluss erst nach Hintergrundaktualisierung/Archivprüfung. Auch die Fehleranzeige beim zweiten Archiv-Retry ist abgesichert.
- Bestehende screenshotbezogene Rechte-/Publikationsgrenzen bleiben unverändert. Die 1.4.7-Screenshots wurden nicht überschrieben und zeigen nicht den neuen Ladezeitpunkt-/Cachehinweis.

## Grenzen

Kein neuer Dev-/Produktiv-Build hochgeladen; echte Datenprüfung hier ist ein Loader-/Relay-Integrationstest, keine komplette Browserabnahme auf Dev. Browser-Lifecycle mit Fixtures und Chrome-Mobile-Emulation geprüft, keine Echtgeräte-/Safari-/Firefox-Abnahme. Persistierter Speicher kann vom Browser begrenzt oder gelöscht werden; dann normaler Netzabruf. DZT-Daten können sich innerhalb der 15-Minuten-Frist ändern. Kein Live-Polling in einem unverändert offen bleibenden Tab; die Hintergrundaktualisierung erfolgt beim erneuten Laden der App, Tageswechsel weiterhin automatisch.
