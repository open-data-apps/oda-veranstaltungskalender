# App-only Ladezeit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Parent implements dependent tasks inline; one bounded final review.

**Goal:** Kaltstart und Wiederholungsaufrufe beschleunigen, ohne Veranstaltungen zu verlieren oder den Store zu ändern.

**Architecture:** Geo-Orte in eigener DISTINCT-Unterabfrage materialisieren; volle Event-Daten beibehalten. App-Start lädt nur Zukunft, Archiv separat bei Bedarf (auch geteilte Archivlinks). Browser-Cache in localStorage plus bestehender Memory-Cache; gleiche Instanz/Konfiguration/Tag, 15 Minuten frisch, danach gespeicherte Daten anzeigen und im Hintergrund erneuern. Höchstens 24 Stunden, kein Cache über Tageswechsel.

**Tech Stack:** bestehendes Vanilla JS/CSS, native Browser-APIs, Node-VM-Tests, Chrome-CDP/Live Server.

**Spec:** Nutzerfreigabe im Chat: vorgeschlagene Optimierungen ausschließlich in der App; Store unverändert. Die vollständige Detailanreicherung bleibt erhalten, weil der gemessene Geo-Subselect bereits den Abruf beschleunigt.

## Global Constraints
- Nur app/app.js und app/app.css für Runtime; keine Template-, Store-, Relay-Änderungen.
- Acht Eventtypen, Datum-/Statusfilter, vollständiger Kreis, global 600/400 eindeutige IDs unverändert.
- Keine Dateninjektion bei DZT-Messungen, Key ausschließlich Shell-Keychain. Runtime nur /dzt.
- Ladebalken zählt tatsächliche abgeschlossene Abfragen; Lazy-Archiv darf nicht als leer erscheinen.
- Keine neuen Konfigurationsschlüssel. Historische Screenshots erhalten.
- Upload macht der Nutzer; kein Dev-/Produktiv-Upload, kein automatischer Commit/Push.

## Review Focus
- Geteilte Archiv-ID/Termin und wiederhergestellter Archivmodus laden Archiv genau einmal.
- Späte Archiv-/Refresh-Antwort darf neue Instanz, neuen Tag oder neuere Daten nicht überschreiben.
- Cachezugriff gesperrt, Quota erreicht, korruptes JSON oder alte Cacheversion: normales Laden.
- Fehlgeschlagener Hintergrundabruf lässt vorhandene Daten und sichtbaren Fehlerhinweis stehen.
- Echte Ergebnis-ID-Parität, doppelt kodierte URL unter 8.000 Zeichen, keine reduzierten Felder.

### Task 1: Abfrage optimieren
**Files:** app/app.js, tests/test_geo_query.js
**Interface:** buildSparqlQuery unverändert; native Geo-Treffermenge als SELECT DISTINCT ?loc-Unterabfrage.
- [x] Regression für isolierte Geo-IDs rot, minimaler Querywechsel, grün.
- [x] Vergleich mit aktuellem vollständigen Query: Zeit und identische IDs/gewählte Daten; Teilkreis West bereits gemessen (31–34s vs21s).

### Task 2: Archiv bei Bedarf
**Files:** app/app.js, tests/test_lazy_archiv.js, Browser-Fixtures/-Tests
**Interfaces:** ladeEvents(...,{modus,vorlage,onFortschritt}); ohne modus weiter beide Bereiche für vorhandene Datenlayer-Tests. Startup modus=zukunft. Vorlage enthält geo/geoQueries/heuteKey; nur instanzintern wiederverwenden. Ergebnis archivGeladen=false bis erfolgreichem Archivabruf.
- [x] Tests: Zukunft ohne Archivrequest; Archive nutzt Plan; Archivfehler unabhängig von Zukunft.
- [x] vkLadeArchiv(state) coalesced Promise mit separatem Lade-/Fehlerstatus; wendeFilterAn und Shared-Link-Miss triggern; Refresh/Seitenwechsel-Guards.
- [x] Browser: Start, Archivklick, Zurück, geteilte Termine, Cache, leeres und defektes Archiv.

### Task 3: Wiederholungsaufrufe
**Files:** app/app.js, app/app.css, tests/test_persistenter_cache.js, tests/browser-fixtures.js
**Interfaces:** vkCacheKey inkl. App-Pfad; vkCachePruefe/Lege zusätzlich localStorage-Envelope mit Revision/Key/geladenAm/Daten; ein Slot je Instanz. vkCacheFrisch(result) 15 Minuten.
- [x] Tests für Reload, TTL/Tag/Config/Pfad, beschädigte/gesperrte Speicherung.
- [x] Frische Daten sofort ohne Request; ältere Tagesdaten sofort mit Zeitpunkt und Aktualisierungshinweis, Background-Refresh; Fehler löscht Daten nicht.
- [x] Fixture-Installation entfernt nur eigenen Instanz-Cache.

### Task 4: Nachweis und Lieferung
**Files:** README.md, CHANGELOG.md, app-package.json, docs/performance-app-2026-10-12.md, ZIP (untracked)
- [x] Alle Node-Dateien, lokale Browserregressionen/Performance-Lifecycle, Linter/JSON/Syntax.
- [x] Finale Runtime über echten Dev-Relay messen (lokaler Loader, kein Build-Upload); 600 IDs gegen Referenz vergleichen.
- [x] Ein gezieltes unabhängiges Review; bestätigte Blocker beheben, betroffene Tests erneut.
- [x] Version 1.5.0 und neues ZIP; byte-identische Quellen, Store unverändert, kein Upload.
