/*
 * Task-2-Tests: Typ-Registry, SPARQL-Builder, Datum-Helfer, Event-Parsing.
 * Muster: vm-Sandbox-Extraktion aus app/app.js (Vorlage sehenswuerdigkeiten/tests/test_geocoding.js).
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appJsPath = path.join(__dirname, "../app/app.js");
const appJsCode = fs.readFileSync(appJsPath, "utf-8");

let sandbox;
try {
  sandbox = {
    console,
    process,
    require,
    __dirname: path.join(__dirname, "../app"),
    sessionStorage: { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = String(v); } },
    window: {},
    document: { readyState: "complete", addEventListener: () => {} }
  };
  vm.createContext(sandbox);
  // const-Deklarationen sind im vm lexikalisch gebunden und erscheinen nicht als
  // Kontext-Properties – ein Epilog im selben Run exportiert sie explizit.
  vm.runInContext(
    appJsCode +
      "\n;globalThis.__vkExports = { EVENT_TYPES, buildSparqlQuery, parseEvents, haversineKm, normalisiereDatum, zeitAnteil, plusTage };",
    sandbox
  );
} catch (e) {
  sandbox = { __vkExports: {} };
}

const exp = sandbox.__vkExports || {};
const EVENT_TYPES = exp.EVENT_TYPES;
const buildSparqlQuery = exp.buildSparqlQuery;
const parseEvents = exp.parseEvents;
const haversineKm = exp.haversineKm;
const normalisiereDatum = exp.normalisiereDatum;
const zeitAnteil = exp.zeitAnteil;
const plusTage = exp.plusTage;

function test(typRegistry) {
  console.log("--- TEST: Task 2 (Query/Parsing) ---");

  // (0) Existenz
  assert.strictEqual(typeof EVENT_TYPES, "object", "EVENT_TYPES muss existieren");
  assert.strictEqual(typeof buildSparqlQuery, "function", "buildSparqlQuery muss eine Funktion sein");
  assert.strictEqual(typeof parseEvents, "function", "parseEvents muss eine Funktion sein");
  assert.strictEqual(typeof haversineKm, "function", "haversineKm muss eine Funktion sein");
  assert.strictEqual(typeof normalisiereDatum, "function", "normalisiereDatum muss eine Funktion sein");
  assert.strictEqual(typeof zeitAnteil, "function", "zeitAnteil muss eine Funktion sein");
  console.log("  [0] Alle Funktionen vorhanden");

  // (1) EVENT_TYPES: 8 Typen mit Label, Farbe, URI — harte, unabhaengige Orakel
  const erwarteteKeys = ["musik", "theater", "ausstellung", "fest", "sport", "kinder", "essen", "sozial"];
  const erwarteteUris = { /* Audit T-1: alle 8 URIs hart statt Registry-Selbstabgleich */
    musik: "https://schema.org/MusicEvent",
    theater: "https://schema.org/TheaterEvent",
    ausstellung: "https://schema.org/ExhibitionEvent",
    fest: "https://schema.org/Festival",
    sport: "https://schema.org/SportsEvent",
    kinder: "https://schema.org/ChildrensEvent",
    essen: "https://schema.org/FoodEvent",
    sozial: "https://schema.org/SocialEvent"
  };
  assert.deepStrictEqual(Object.keys(EVENT_TYPES).sort(), erwarteteKeys.sort(), "EVENT_TYPES hat genau die 8 Typen");
  for (const key of erwarteteKeys) {
    const t = EVENT_TYPES[key];
    assert.ok(t.label && t.label.length > 0, `label für ${key}`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(t.farbe), `farbe für ${key} als Hex`);
    assert.strictEqual(t.uri, erwarteteUris[key], `uri für ${key} (hartes Orakel)`);
  }
  console.log("  [1] EVENT_TYPES: 8 Typen mit Label/Farbe/URI (harte URIs)");

  // (2) Datum-Helfer
  assert.strictEqual(normalisiereDatum("2026-10-01"), "2026-10-01", "Datum-only");
  assert.strictEqual(normalisiereDatum("2026-10-01T19:30:00+02:00"), "2026-10-01", "DateTime mit Offset");
  assert.strictEqual(normalisiereDatum("2026-10-01T19:30Z"), "2026-10-01", "DateTime UTC");
  assert.strictEqual(normalisiereDatum(""), null, "leer -> null");
  assert.strictEqual(normalisiereDatum(null), null, "null -> null");
  assert.strictEqual(zeitAnteil("2026-10-01T19:30:00+02:00"), "19:30", "Zeitanteil mit Offset");
  assert.strictEqual(zeitAnteil("2026-10-01"), null, "keine Zeit -> null");
  assert.strictEqual(zeitAnteil("13:00:00"), "13:00", "Schedule-StartTime HH:MM:SS");
  assert.strictEqual(plusTage("2026-09-30", 365), "2027-09-30", "+365 Tage");
  assert.strictEqual(plusTage("2026-12-31", 1), "2027-01-01", "Jahreswechsel +1");
  assert.strictEqual(plusTage("2026-09-30", -365), "2025-09-30", "-365 Tage");
  console.log("  [2] normalisiereDatum/zeitAnteil/plusTage");

  // (3) haversineKm: Böblingen -> Stuttgart ≈ 17,5 km
  const d = haversineKm(48.6813, 9.0086, 48.7758, 9.1829);
  assert.ok(d > 15 && d < 21, `haversineKm Böblingen-Stuttgart ≈ 17-18 km, war ${d}`);
  assert.ok(Math.abs(haversineKm(48.6813, 9.0086, 48.6813, 9.0086)) < 0.001, "distanz zu sich selbst = 0");
  console.log(`  [3] haversineKm: Böblingen-Stuttgart = ${d.toFixed(1)} km`);

  // (4) buildSparqlQuery — Zukunft
  const q = buildSparqlQuery({ modus: "zukunft", lat: 48.6813, lon: 9.0086, radiusKm: 25, heuteKey: "2026-09-30" });
  assert.ok(q.includes("inst:dzt-geo-shapes"), "geo-shape-Connector");
  assert.ok(q.includes('\\"radius\\":\\"25km\\"'), "Radius 25km im (doppelt encodierten) geo_shape-Literal");
  assert.ok(q.includes('\\"coordinates\\":[9.0086,48.6813]'), "Koordinaten [lon,lat] im geo_shape");
  assert.ok(q.includes("PREFIX schema: <https://schema.org/>"), "exakter schema.org-Namensraum");
  for (const key of erwarteteKeys) assert.ok(q.includes(erwarteteUris[key].replace("https://schema.org/", "schema:")), `VALUES mit ${erwarteteUris[key]}`);
  assert.ok(q.includes("?s schema:location ?loc"), "Location-Join");
  assert.ok(q.includes("schema:eventSchedule"), "Schedule-Pfad (v1.1)");
  assert.ok(q.includes("COALESCE(?d, ?vkSd)"), "vkStart = COALESCE(direkt, Schedule)");
  assert.ok(q.includes("FILTER(BOUND(?vkStart))"), "Pflicht: mind. ein Startdatum");
  assert.ok(q.includes('COALESCE(STR(?vkEnde), STR(?vkStart)) >= "2026-09-30"'), "Zukunft-Fenster ab heute (auf vkStart/vkEnde)");
  assert.ok(q.includes('STR(?vkStart) < "2027-10-01"'), "Exklusive Obergrenze nach +365 Tagen (letzter Tag 2027-09-30 vollstaendig)");
  assert.ok(q.includes("ORDER BY ?vkStart"), "Sortierung aufsteigend");
  assert.ok(q.includes("schema:startTime ?vkZeit"), "startZeitRaw aus schedule:startTime");
  assert.ok(q.includes("LIMIT 600"), "LIMIT 600");
  assert.ok(q.includes("GROUP BY ?s"), "GROUP BY ?s außen");
  assert.ok(q.includes('lang(?nameDe) = "de" || lang(?nameDe) = ""'), "de-Sprachfilter");
  assert.ok(q.includes("schema:isAccessibleForFree"), "Kostenlos-Feld (1A)");
  assert.ok(q.includes("EventCancelled"), "Abgesagte ausgeschlossen (1A)");
  assert.ok(q.includes("FILTER NOT EXISTS"), "NOT EXISTS fuer Abgesagte");
  console.log("  [4] buildSparqlQuery zukunft: Subselect+Fenster+LIMIT 600");

  // (5) buildSparqlQuery — Archiv
  const qa = buildSparqlQuery({ modus: "archiv", lat: 48.6813, lon: 9.0086, radiusKm: 10, heuteKey: "2026-09-30" });
  assert.ok(qa.includes('\\"radius\\":\\"10km\\"'), "Radius 10km");
  assert.ok(qa.includes('COALESCE(STR(?vkEnde), STR(?vkStart)) < "2026-09-30"'), "Archiv: vorbei vor heute");
  assert.ok(qa.includes('STR(?vkStart) >= "2025-09-30"'), "Archiv-Fenster -365 Tage (hartes Orakel 2025-09-30)");
  assert.ok(qa.includes("ORDER BY DESC(?vkStartWahl) ?s"), "nach ausgewaehltem Archivtermin absteigend, mit stabiler ID-Reihenfolge");
  assert.ok(qa.includes("LIMIT 400"), "LIMIT 400");
  console.log("  [5] buildSparqlQuery archiv: DESC+LIMIT 400");

  // (6) parseEvents — Standardfall (GROUP-BY-Zeile: eine pro Event)
  const rows = [
    {
      s: { value: "https://example.org/e1" },
      name: { value: "Serenade im Schlossgarten" },
      desc: { value: "Klassik am Abend" },
      startDatum: { value: "2026-10-01T19:30:00+02:00" },
      endDatum: { value: "2026-10-01T21:00:00+02:00" },
      ortName: { value: "Schlosshof" },
      street: { value: "Schlossstraße 1" },
      postal: { value: "71034" },
      city: { value: "Böblingen" },
      lat: { value: "48.6813" },
      lng: { value: "9.0086" },
      img: { value: "https://example.org/b1.jpg|https://example.org/b2.jpg" },
      typ: { value: "https://schema.org/MusicEvent,https://schema.org/Event" },
      url: { value: "https://example.org/e1-info" },
      kostenlos: { value: "true" }
    }
  ];
  const ev = parseEvents(rows, 48.6813, 9.0086);
  assert.strictEqual(ev.length, 1, "ein Event");
  const e = ev[0];
  assert.strictEqual(e.id, "https://example.org/e1");
  assert.strictEqual(e.name, "Serenade im Schlossgarten");
  assert.strictEqual(e.beschreibung, "Klassik am Abend");
  assert.strictEqual(e.typ, "musik", "typ = EVENT_TYPES-Key musik");
  assert.strictEqual(e.startDatum, "2026-10-01");
  assert.strictEqual(e.startZeit, "19:30");
  assert.strictEqual(e.endDatum, "2026-10-01");
  assert.strictEqual(e.ortName, "Schlosshof");
  assert.strictEqual(e.adresse, "Schlossstraße 1, 71034 Böblingen", "Adresse zusammengesetzt");
  assert.strictEqual(e.lat, 48.6813);
  assert.strictEqual(e.lon, 9.0086);
  assert.ok(e.distanzKm < 0.2, "distanzKm ~0 am Zentrum");
  assert.deepStrictEqual(Array.from(e.bilder), ["https://example.org/b1.jpg", "https://example.org/b2.jpg"], "img |-getrennt -> Array");
  assert.strictEqual(e.url, "https://example.org/e1-info");
  assert.strictEqual(e.kostenlos, true, "isAccessibleForFree true -> kostenlos true");
  console.log("  [6] parseEvents Standardfall mit allen Feldern");

  // (7) parseEvents — Minimalfall: ohne geo, ohne endDatum, ohne bild, DateTime-Offset
  const ev2 = parseEvents([
    {
      s: { value: "https://example.org/e2" },
      name: { value: "Stadtlauf" },
      startDatum: { value: "2026-10-03T09:00Z" },
      ortName: { value: "Innenstadt" },
      typ: { value: "https://schema.org/SportsEvent" }
    }
  ], 48.6813, 9.0086);
  assert.strictEqual(ev2.length, 1);
  const e2 = ev2[0];
  assert.strictEqual(e2.typ, "sport");
  assert.strictEqual(e2.startZeit, "09:00", "UTC-Zeit als Zeitanteil");
  assert.strictEqual(e2.endDatum, null, "kein endDatum -> null");
  assert.strictEqual(e2.lat, null, "ohne geo -> lat null");
  assert.strictEqual(e2.lon, null);
  assert.strictEqual(e2.distanzKm, null, "ohne geo -> distanzKm null");
  assert.strictEqual(e2.ortName, "Innenstadt", "Klartext-Ort bleibt");
  assert.deepStrictEqual(Array.from(e2.bilder), [], "kein bild -> leeres Array");
  assert.strictEqual(e2.adresse, null, "keine adresse -> null");
  assert.strictEqual(e2.kostenlos, null, "ohne isAccessibleForFree -> null (unbekannt)");
  const ev2b = parseEvents([
    { s: { value: "https://example.org/e2b" }, name: { value: "Bezahltes Konzert" }, startDatum: { value: "2026-10-04T20:00:00+02:00" }, ortName: { value: "Halle" }, typ: { value: "https://schema.org/MusicEvent" }, kostenlos: { value: "false" } }
  ], 48.6813, 9.0086);
  assert.strictEqual(ev2b[0].kostenlos, false, "isAccessibleForFree false -> kostenlos false");
  console.log("  [7] parseEvents Minimalfall: geo-los, kostenlos dreiwertig, robust");

  // (8) parseEvents — Edge: fehlender name -> Skip; unbekannter Typ -> typ null; Doppelzeile -> dedup
  const ev3 = parseEvents([
    { s: { value: "https://example.org/ohneName" }, startDatum: { value: "2026-10-05" }, typ: { value: "https://schema.org/Festival" } },
    { s: { value: "https://example.org/e3" }, name: { value: "Duplikat A" }, startDatum: { value: "2026-10-06" }, typ: { value: "https://schema.org/Festival" } },
    { s: { value: "https://example.org/e3" }, name: { value: "Duplikat B" }, startDatum: { value: "2026-10-06" }, typ: { value: "https://schema.org/Festival" } }
  ], 48.6813, 9.0086);
  assert.strictEqual(ev3.length, 1, "name-los geskippt, Duplikat dedupliziert");
  assert.strictEqual(ev3[0].name, "Duplikat A", "erste Zeile gewinnt");
  const ev4 = parseEvents([
    { s: { value: "https://example.org/e4" }, name: { value: "Ohne Typ" }, startDatum: { value: "2026-10-07" } }
  ], 48.6813, 9.0086);
  assert.strictEqual(ev4[0].typ, null, "unbekannter/fehlender Typ -> null");
  assert.strictEqual(ev4[0].startZeit, null, "Datum-only -> keine Zeit");
  // (8b) v1.1: startZeitRaw (Schedule-Uhrzeit) hat Vorrang vor Literal-Zeit
  const schedEvents = parseEvents([
    { s: { value: "urn:sk1" }, name: { value: "Serien-Event" }, startDatum: { value: "2026-10-02" }, startZeitRaw: { value: "14:00:00" }, ortName: { value: "Halle" }, typ: { value: "https://schema.org/Festival" } },
    { s: { value: "urn:sk2" }, name: { value: "Ohne-Schedule" }, startDatum: { value: "2026-10-03T19:30:00+02:00" }, ortName: { value: "Halle" }, typ: { value: "https://schema.org/MusicEvent" } }
  ], 48.6813, 9.0086);
  assert.strictEqual(schedEvents[0].startZeit, "14:00", "Schedule-Uhrzeit uebernimmt");
  assert.strictEqual(schedEvents[1].startZeit, "19:30", "ohne startZeitRaw wie bisher aus Literal");
  console.log("  [8b] startZeitRaw: Schedule-Uhrzeit hat Vorrang");

  console.log("  [8] parseEvents Edge: Skip/Dedup/Typ-Fallback");

  // (9) Sortierung: parseEvents liefert aufsteigend nach startDatum
  const ev5 = parseEvents([
    { s: { value: "https://example.org/spaet" }, name: { value: "Spät" }, startDatum: { value: "2026-12-24" }, typ: { value: "https://schema.org/MusicEvent" } },
    { s: { value: "https://example.org/frueh" }, name: { value: "Früh" }, startDatum: { value: "2026-10-02" }, typ: { value: "https://schema.org/MusicEvent" } }
  ], 48.6813, 9.0086);
  assert.strictEqual(ev5[0].name, "Früh");
  assert.strictEqual(ev5[1].name, "Spät");
  console.log("  [9] parseEvents sortiert aufsteigend");

  console.log("--- ALLE TASK-2-TESTS GRÜN ---");
}

test();
