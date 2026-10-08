/*
 * Task-7-Tests: renderProgramm (Feed/Karten/KPIs/Schale 4), kpiWerte, schale4Html.
 * Renderer sind reine HTML-erzeugende Funktionen -> node-testbar via vm.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appJsPath = path.join(__dirname, "../app/app.js");
const appJsCode = fs.readFileSync(appJsPath, "utf-8");

function ladeApp(mitConfig) {
  const sandbox = {
    console, process, require,
    __dirname: path.join(__dirname, "../app"),
    sessionStorage: { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = String(v); } },
    window: { location: { pathname: "/app/" } },
    document: {
      readyState: "complete",
      addEventListener: () => {},
      getElementById: () => null,
      querySelectorAll: () => []
    },
    Intl, Date, AbortController
  };
  vm.createContext(sandbox);
  vm.runInContext(appJsCode + "\n;globalThis.__vkExports = { renderProgramm, kpiWerte, schale4Html, VK_EVENT_TYPES, tagGruppen, renderKatalog, renderArchiv };", sandbox);
  return sandbox.__vkExports || {};
}

function ev(id, startDatum, extra = {}) {
  return Object.assign({
    id: "urn:" + id, name: "Veranstaltung " + id, beschreibung: null, bilder: [], url: null,
    typ: "musik", startDatum, startZeit: null, endDatum: null, endZeit: null,
    ortName: "Ort " + id, adresse: null, lat: null, lon: null, distanzKm: null, kostenlos: null
  }, extra);
}

function test() {
  console.log("--- TEST: Task 7 (Programm-Feed/KPIs/Schale 4) ---");
  const X = ladeApp();
  assert.strictEqual(typeof X.renderProgramm, "function", "renderProgramm fehlt");
  assert.strictEqual(typeof X.kpiWerte, "function", "kpiWerte fehlt");
  assert.strictEqual(typeof X.schale4Html, "function", "schale4Html fehlt");
  console.log("  [0] Funktionen vorhanden");

  const HEUTE = "2026-09-30"; // Mittwoch -> Wochenende Fr 2.10. - So 5.10.2026

  // (1) kpiWerte: Zeitraum / heute / Wochenende
  const events = [
    ev("a", HEUTE),                      // heute
    ev("b", "2026-10-01"),               // morgen
    ev("c", "2026-10-02"),               // Freitag (Wochenende)
    ev("d", "2026-10-04"),               // Sonntag (Wochenende)
    ev("e", "2026-10-06")                // Dienstag (nach Wochenende)
  ];
  const kpi = X.kpiWerte(events, HEUTE);
  assert.strictEqual(kpi.zeitraum, 5, "KPI 1: alle im Zeitraum");
  assert.strictEqual(kpi.heute, 1, "KPI 2: heute laufend");
  assert.strictEqual(kpi.wochenende, 2, "KPI 3: Wochenende Fr-So");
  const kpiLeer = X.kpiWerte([], HEUTE);
  assert.strictEqual(kpiLeer.zeitraum, 0, "leer: 0/0/0");
  assert.strictEqual(kpiLeer.heute, 0);
  assert.strictEqual(kpiLeer.wochenende, 0);
  console.log("  [1] kpiWerte: Zeitraum/Heute/Wochenende korrekt");

  // (2) renderProgramm: Feed mit Tagesgruppen + Event-Karten + KPIs
  const state = {
    appUid: "i1",
    configdata: {},
    modus: "programm",
    zeitraum: "7",
    heuteKey: HEUTE,
    gefiltert: [
      ev("a", HEUTE, { name: "Serenade im Schlossgarten", typ: "musik", startZeit: "19:30", ortName: "Schlosshof", distanzKm: 1.2, kostenlos: true, bilder: ["https://example.org/b.jpg"] }),
      ev("b", "2026-10-01", { name: "Stadtlauf", typ: "sport", startZeit: "10:00", ortName: "Innenstadt" })
    ],
    events: { zukunft: [], archiv: [ev("x", "2026-08-01"), ev("y", "2026-07-01"), ev("z", "2026-06-01")] }
  };
  const html = X.renderProgramm(state);
  assert.ok(html.includes("Heute"), "Gruppe Heute");
  assert.ok(html.includes("Morgen"), "Gruppe Morgen");
  assert.ok(html.includes("Serenade im Schlossgarten"), "Event-Titel 1");
  assert.ok(html.includes("Stadtlauf"), "Event-Titel 2");
  assert.ok(html.includes("19:30"), "Zeit-Badge");
  assert.ok(html.includes("Schlosshof"), "Ort auf Karte");
  assert.ok(html.includes("1,2 km"), "Distanz gerundet de-DE");
  assert.ok(html.includes("Musik"), "Typ-Label");
  assert.ok(html.includes("data-vk-event"), "Event-Karten sind klickbar (data-vk-event)");
  assert.ok(!html.includes("undefined") && !html.includes("null</"), "kein null/undefined im Markup");
  assert.ok(html.includes("Rückblick") && html.includes("3"), "Archiv-CTA mit Anzahl");
  console.log("  [2] renderProgramm: Gruppen/Karten/Archiv-CTA");

  // (3) Live-Badge für laufende Events
  const laufend = X.renderProgramm(Object.assign({}, state, {
    gefiltert: [ev("lauf", "2026-09-28", { name: "Läuft noch", endDatum: "2026-10-02" })]
  }));
  assert.ok(laufend.includes("Läuft noch"), "laufendes Event gerendert");
  assert.ok(laufend.toLowerCase().includes("live"), "Live-Hinweis vorhanden");
  console.log("  [3] Live-Badge für laufende Events");

  // (4) XSS: Name mit <img onerror> muss escaped sein
  const xss = X.renderProgramm(Object.assign({}, state, {
    gefiltert: [ev("xss", HEUTE, { name: '<img src=x onerror="window.__vkXss=1">' })]
  }));
  assert.ok(!xss.includes("<img src=x"), "XSS-Name escaped");
  assert.ok(xss.includes("&lt;img"), "escaped als &lt;img");
  console.log("  [4] XSS escaped");

  // (5) Schale 4: Box nur wenn gefüllt; datenStand escaped als Text
  const ohne = X.schale4Html({ configdata: {} });
  assert.strictEqual(ohne.trim(), "", "ohne Config -> keine Box");
  const mit = X.schale4Html({
    configdata: {
      datenquelleHinweis: "<p>Methodik-Kasten <b>fett</b></p>",
      datenStand: "Stand: Live-Abruf <x>",
      weiterfuehrendeLinks: '<ul><li><a href="https://x.de">Link</a></li></ul>'
    }
  });
  assert.ok(mit.includes("Methodik-Kasten"), "Hinweis (HTML unverändert via innerHTML-Kontrakt)");
  assert.ok(mit.includes("<b>fett</b>"), "Markdown-HTML bleibt HTML");
  assert.ok(mit.includes("Stand: Live-Abruf &lt;x&gt;"), "datenStand als Text escaped");
  assert.ok(mit.includes("https://x.de"), "weiterführende Links");
  console.log("  [5] Schale 4: bedingtes Rendering + Escape-Regeln");

  // (6) KPI-Kontexte (Collapse nur wenn gefüllt)
  const mitKontext = X.renderProgramm(Object.assign({}, state, {
    configdata: { kpiKontext1: "Erklärtext KPI 1", kpiKontext2: "", kpiKontext3: "Erklärtext KPI 3" }
  }));
  assert.ok(mitKontext.includes("Erklärtext KPI 1"), "kpiKontext1 gerendert");
  assert.ok(!mitKontext.includes("Erklärtext KPI 2"), "leerer kpiKontext2 nicht gerendert");
  assert.ok(mitKontext.includes("Erklärtext KPI 3"), "kpiKontext3 gerendert");
  assert.ok(mitKontext.includes("collapse"), "Collapse-Pattern (Schale-4-Referenz)");
  assert.ok(mitKontext.includes("vk-i1-kpi-kontext"), "KPI-Kontext-IDs instanz-scoped");
  console.log("  [6] KPI-Kontexte: gefüllt/leer/Collapse/instanz-scoped");

  // (7) Leerzustand
  const leer = X.renderProgramm(Object.assign({}, state, { gefiltert: [] }));
  assert.ok(leer.includes("Keine Veranstaltungen"), "Leerzustand mit Klartext");
  console.log("  [7] Leerzustand");

  // (8) renderKatalog (Task 9): nur Events mit Bild, Galerien-Karten klickbar
  assert.strictEqual(typeof X.renderKatalog, "function", "renderKatalog fehlt");
  const katalogState = Object.assign({}, state, {
    gefiltert: [
      ev("k1", HEUTE, { name: "Mit Bild", bilder: ["https://example.org/b1.jpg"] }),
      ev("k2", HEUTE, { name: "Ohne Bild", bilder: [] }),
      ev("k3", "2026-10-02", { name: "Zweites mit Bild", bilder: ["https://example.org/b2.jpg"] })
    ]
  });
  const katalog = X.renderKatalog(katalogState);
  assert.ok(katalog.includes("Mit Bild"), "Event mit Bild im Katalog");
  assert.ok(katalog.includes("Zweites mit Bild"), "zweites Event mit Bild");
  assert.ok(!katalog.includes("Ohne Bild"), "Event ohne Bild NICHT im Katalog");
  assert.ok((katalog.match(/<img /g) || []).length === 2, "zwei img-Tags");
  assert.ok(katalog.includes("data-vk-event"), "Katalog-Karten klickbar");
  const katalogLeer = X.renderKatalog(Object.assign({}, state, { gefiltert: [ev("nx", HEUTE, { bilder: [] })] }));
  assert.ok(katalogLeer.includes("Keine Veranstaltungsbilder"), "Katalog-Leerzustand");
  console.log("  [8] renderKatalog: nur-mit-Bild + klickbar + Leerzustand");

  // (9) renderArchiv (Task 9): Monatsgruppen DESC + KPI-Zeile + Schale 4
  assert.strictEqual(typeof X.renderArchiv, "function", "renderArchiv fehlt");
  const archivState = Object.assign({}, state, {
    gefiltert: [ev("a1", "2026-07-15", { name: "Julis Event" }), ev("a2", "2026-06-02", { name: "Junis Event" })]
  });
  const archiv = X.renderArchiv(archivState);
  assert.ok(archiv.includes("Rückblick"), "Archiv-Ueberschrift");
  assert.ok(archiv.indexOf("Juli 2026") < archiv.indexOf("Juni 2026"), "Monate absteigend");
  assert.ok(archiv.includes("Julis Event") && archiv.includes("Junis Event"), "Archiv-Events");
  assert.ok(archiv.includes("vk-kpi-wert"), "Archiv-KPI-Zeile");
  console.log("  [9] renderArchiv: Monatsgruppen DESC + KPI-Zeile");

  // (10) Review-Fix 1: "Läuft jetzt"-Sektion + KPIs aus zeitraum-unabhängigem Pool
  const laufendState = Object.assign({}, state, {
    gefiltert: [
      ev("lauf", "2026-09-28", { name: "Läuft-Event", endDatum: "2026-10-02" }),
      ev("komm", "2026-10-01", { name: "Komm-Event" })
    ]
  });
  const laufHtml = X.renderProgramm(laufendState);
  assert.ok(laufHtml.indexOf("Läuft jetzt") !== -1, "Läuft-jetzt-Sektion vorhanden");
  assert.ok(laufHtml.indexOf("Läuft-Event") < laufHtml.indexOf("Komm-Event"), "laufendes Event oben");
  assert.ok(laufHtml.indexOf("Läuft jetzt") < laufHtml.indexOf("Morgen"), "vor der ersten Tagesgruppe");
  assert.strictEqual((laufHtml.match(/<section class="vk-tag/g) || []).length, 2, "genau 2 Sektionen: Läuft-jetzt + Morgen (keine Rueckdatums-Gruppe)");
  // KPI-2 (heute laufend) auch bei engem Zeitraum sichtbar
  const heutPool = X.kpiWerte([ev("x", "2026-09-28", { endDatum: "2026-10-02" }), ev("y", HEUTE)], HEUTE);
  assert.strictEqual(heutPool.heute, 2, "KPI heute: laufendes + heute startendes");
  console.log("  [10] Review-Fix 1: Läuft-jetzt-Sektion + KPI-Pool");

  console.log("--- ALLE TASK-7-TESTS GRÜN ---");
}

test();
