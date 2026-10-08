/*
 * Task-4-Tests: buildIcs (RFC 5545: CRLF, Escaping, UID, DTEND-Fallback, Ganztägig, GEO, DESCRIPTION-Kürzung).
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appJsPath = path.join(__dirname, "../app/app.js");
const appJsCode = fs.readFileSync(appJsPath, "utf-8");

let buildIcs;
try {
  const sandbox = {
    console, process, require,
    __dirname: path.join(__dirname, "../app"),
    sessionStorage: { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = String(v); } },
    window: {}, document: { readyState: "complete", addEventListener: () => {} },
    URL, URLSearchParams,
    TextEncoder: TextEncoder /* v1.2.5: ICS-Zeilenfaltung (D-7) */
  };
  vm.createContext(sandbox);
  vm.runInContext(appJsCode + "\n;globalThis.__vkExports = { buildIcs };", sandbox);
  buildIcs = (sandbox.__vkExports || {}).buildIcs;
} catch (e) { /* RED */ }

function test() {
  console.log("--- TEST: Task 4 (ICS) ---");
  assert.strictEqual(typeof buildIcs, "function", "buildIcs fehlt");
  console.log("  [0] buildIcs vorhanden");

  const baseEvent = {
    id: "https://example.org/e1",
    name: "Serenade im Schlossgarten",
    beschreibung: "Klassik am Abend",
    bilder: [],
    url: "https://example.org/e1-info",
    typ: "musik",
    startDatum: "2026-10-01",
    startZeit: "19:30",
    endDatum: "2026-10-01",
    endZeit: "21:00",
    ortName: "Schlosshof",
    adresse: "Schlossstraße 1, 71034 Böblingen",
    lat: 48.6813, lon: 9.0086, distanzKm: 0.1,
    kostenlos: true
  };

  // (1) Struktur + CRLF
  const ics = buildIcs(baseEvent, "https://example.org/e1-info");
  assert.ok(ics.startsWith("BEGIN:VCALENDAR"), "beginnt mit BEGIN:VCALENDAR");
  assert.ok(ics.includes("VERSION:2.0"), "VERSION 2.0");
  assert.ok(ics.includes("PRODID:-//ODAS//Veranstaltungskalender//DE"), "PRODID");
  assert.ok(ics.includes("BEGIN:VEVENT"), "BEGIN:VEVENT");
  assert.ok(ics.trimEnd().endsWith("END:VCALENDAR"), "endet mit END:VCALENDAR");
  assert.ok(ics.includes("\r\n"), "CRLF-Zeilenenden");
  const ohneCrlf = ics.replace(/\r\n/g, "");
  assert.ok(!ohneCrlf.includes("\n"), "keine nackten LF");
  console.log("  [1] Struktur + CRLF");

  // (2) UID stabil
  const logisch = ics.replace(/\r\n[ \t]/g, "");
  assert.ok(logisch.includes("UID:https://example.org/e1|2026-10-01|19:30|2026-10-01|21:00@odas-veranstaltungskalender"), "UID bindet Event-ID und konkreten Termin");
  assert.ok(logisch.includes("@odas-veranstaltungskalender"), "UID-Suffix vorhanden");
  console.log("  [2] UID eindeutig und stabil");

  // (3) DTSTART/DTEND mit Zeit (floating local)
  assert.ok(ics.includes("DTSTART:20261001T193000"), "DTSTART aus Datum+Zeit");
  assert.ok(ics.includes("DTEND:20261001T210000"), "DTEND aus endDate+endZeit");
  console.log("  [3] DTSTART/DTEND mit Zeit");

  // (4) LOCATION + GEO + Escaping von Komma/Semikolon
  assert.ok(ics.includes("LOCATION:Schlosshof\\, Schlossstraße 1\\, 71034 Böblingen"), "LOCATION mit Ort+Adresse, Kommas escaped");
  assert.ok(ics.includes("GEO:48.6813;9.0086"), "GEO-Koordinaten (Semikolon hier RFC-trennend)");
  const sonderfall = buildIcs(Object.assign({}, baseEvent, {
    name: "Konzert, Teil 2; gratis",
    adresse: null
  }), null);
  assert.ok(sonderfall.includes("SUMMARY:Konzert\\, Teil 2\\; gratis"), "SUMMARY mit Komma+Semikolon escaped");
  console.log("  [4] LOCATION/GEO/Escaping");

  // (5) DTEND-Fallback +2h ohne endDatum; Rollover über Mitternacht
  const ohneEnde = buildIcs(Object.assign({}, baseEvent, { endDatum: null, endZeit: null }), null);
  assert.ok(ohneEnde.includes("DTEND:20261001T213000"), "DTEND = DTSTART + 2h (19:30 -> 21:30)");
  const spaet = buildIcs(Object.assign({}, baseEvent, { startZeit: "23:30", endDatum: null, endZeit: null }), null);
  assert.ok(spaet.includes("DTSTART:20261001T233000"), "DTSTART 23:30");
  assert.ok(spaet.includes("DTEND:20261002T013000"), "DTEND rollover auf Folgetag 01:30");
  console.log("  [5] DTEND-Fallback +2h inkl. Mitternacht-Rollover");

  // (6) Ganztägig ohne Zeitangabe. RFC 5545: DTEND ist EXKLUSIV, endDatum ist in der App
  // inklusiv (splitZukunftArchiv/Zeitraumfilter) -> DTEND = letzter Tag + 1.
  const ganztaegig = buildIcs(Object.assign({}, baseEvent, { startZeit: null, endZeit: null, endDatum: null }), null);
  assert.ok(ganztaegig.includes("DTSTART;VALUE=DATE:20261001"), "ganztägig DTSTART VALUE=DATE");
  assert.ok(ganztaegig.includes("DTEND;VALUE=DATE:20261002"), "ganztägig DTEND = Folgetag");
  const eintaegig = buildIcs(Object.assign({}, baseEvent, { startZeit: null, endZeit: null, endDatum: "2026-10-01" }), null);
  assert.ok(eintaegig.includes("DTEND;VALUE=DATE:20261002"), "eintägig (endDatum = startDatum) DTEND = Folgetag, Dauer 1 Tag");
  const mehrtägig = buildIcs(Object.assign({}, baseEvent, { startZeit: null, endZeit: null, endDatum: "2026-10-03" }), null);
  assert.ok(mehrtägig.includes("DTEND;VALUE=DATE:20261004"), "mehrtägig DTEND = endDatum + 1 (exklusiv), letzter Tag bleibt enthalten");
  console.log("  [6] Ganztägig/Mehrtägig VALUE=DATE mit exklusivem DTEND");

  // (7) DESCRIPTION-Kürzung auf 500 + Escaping von Zeilenumbrüchen
  const lang = "Erste Zeile\n" + "x".repeat(600);
  const mitLang = buildIcs(Object.assign({}, baseEvent, { beschreibung: lang }), null);
  const descZeile = mitLang.replace(/\r\n[ \t]/g, "").split("\r\n").find((z) => z.startsWith("DESCRIPTION:")) || "";
  assert.strictEqual(descZeile.replace(/^DESCRIPTION:/, "").length, 500, "Ungefaltete DESCRIPTION auf 500 Zeichen begrenzt");
  assert.ok(descZeile.includes("\\n"), "Zeilenumbruch als \\n escaped (echte Assertion, Review-Fix 9)");
  console.log("  [7] DESCRIPTION gekürzt + Newline escaped");

  // (8) URL + DTSTAMP + SUMMARY immer vorhanden
  assert.ok(ics.includes("URL:https://example.org/e1-info"), "URL aus icsUrl-Parameter");
  assert.ok(ics.includes("DTSTAMP:"), "DTSTAMP vorhanden");
  assert.ok(ics.includes("SUMMARY:Serenade im Schlossgarten"), "SUMMARY = Name");
  const ohneUrl = buildIcs(Object.assign({}, baseEvent, { url: null }), null);
  assert.ok(!ohneUrl.includes("\r\nURL:"), "ohne icsUrl keine URL-Zeile");
  console.log("  [8] URL/DTSTAMP/SUMMARY");

  // (9) Review-Fix 3a: DTSTAMP ist UTC mit Z-Suffix
  const dtstamps = ics.split("\r\n").filter((z) => z.startsWith("DTSTAMP:"));
  assert.ok(dtstamps.length === 1, "genau eine DTSTAMP-Zeile");
  assert.ok(/DTSTAMP:\d{8}T\d{6}Z$/.test(dtstamps[0]), "DTSTAMP UTC mit Z: " + dtstamps[0]);
  console.log("  [9] DTSTAMP als UTC (Z-Suffix, RFC 5545 MUST)");

  // (10) Review-Fix 3c: 00:00-Uhrzeit gilt als ganztägig
  const nullUhr = buildIcs(Object.assign({}, baseEvent, { startZeit: "00:00", endZeit: null, endDatum: null }), null);
  assert.ok(nullUhr.includes("DTSTART;VALUE=DATE:"), "00:00-Start -> ganztägig");
  console.log("  [10] 00:00-Uhrzeit -> ganztägig");

  // (11) Review-Fix 2: ICS-URL-Zeile haertet Scheme + Zeilenumbrueche
  const boeseIcs = buildIcs(baseEvent, "javascript:alert(1)");
  assert.ok(!boeseIcs.includes("\r\nURL:"), "javascript:-URL nicht als URL-Zeile");
  const crlfIcs = buildIcs(baseEvent, "https://ok.example/a\r\nX-INJECTED:yes");
  assert.ok(!crlfIcs.includes("X-INJECTED:yes"), "CRLF-Injektion in URL verhindert");
  assert.ok(crlfIcs.includes("URL:https://ok.example/a"), "sauberer URL-Anteil bleibt");
  console.log("  [11] ICS-URL: Scheme-Guard + CRLF-Strip");

  console.log("--- ALLE TASK-4-TESTS GRÜN ---");
}

test();
