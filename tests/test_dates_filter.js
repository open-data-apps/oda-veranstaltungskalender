/*
 * Task-3-Tests: splitZukunftArchiv, filterEvents (inkl. Kostenlos-Toggle 1A), tagGruppen.
 * Muster: vm-Sandbox-Extraktion (Epilog-Export wegen lexikalischer const-Bindungen).
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appJsPath = path.join(__dirname, "../app/app.js");
const appJsCode = fs.readFileSync(appJsPath, "utf-8");

let exp = {};
try {
  const sandbox = {
    console, process, require,
    __dirname: path.join(__dirname, "../app"),
    sessionStorage: { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = String(v); } },
    window: {},
    document: { readyState: "complete", addEventListener: () => {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(
    appJsCode +
      "\n;globalThis.__vkExports = { splitZukunftArchiv, filterEvents, tagGruppen, monatsGruppen };",
    sandbox
  );
  exp = sandbox.__vkExports || {};
} catch (e) { /* noch nicht implementiert -> RED */ }

const splitZukunftArchiv = exp.splitZukunftArchiv;
const filterEvents = exp.filterEvents;
const tagGruppen = exp.tagGruppen;
const monatsGruppen = exp.monatsGruppen;

const HEUTE = "2026-09-30"; // Mittwoch

function ev(id, startDatum, endDatum, extra = {}) {
  return Object.assign(
    { id, name: "Veranstaltung " + id, beschreibung: null, bilder: [], url: null, typ: "musik",
      startDatum, startZeit: null, endDatum, endZeit: null, ortName: "Ort " + id, adresse: null,
      lat: null, lon: null, distanzKm: null, kostenlos: null }, extra
  );
}

function test() {
  console.log("--- TEST: Task 3 (Datum/Filter/Gruppen) ---");

  assert.strictEqual(typeof splitZukunftArchiv, "function", "splitZukunftArchiv fehlt");
  assert.strictEqual(typeof filterEvents, "function", "filterEvents fehlt");
  assert.strictEqual(typeof tagGruppen, "function", "tagGruppen fehlt");
  console.log("  [0] Alle Funktionen vorhanden");

  // (1) splitZukunftArchiv
  const events = [
    ev("a", "2026-09-29", null),                 // gestern, kein Ende -> Archiv
    ev("b", "2026-09-30", "2026-09-30"),          // heute -> Zukunft (laeuft heute)
    ev("c", "2026-09-28", "2026-10-02"),         // laeuft noch -> Zukunft
    ev("d", "2026-10-01", null),                 // morgen -> Zukunft
    ev("e", "2026-08-15", "2026-09-29"),         // vorbei -> Archiv
    ev("f", null, null)                           // ohne jedes Datum -> verworfen
  ];
  const split = splitZukunftArchiv(events, HEUTE);
  assert.deepStrictEqual(Array.from(split.zukunft.map((e) => e.id)), ["b", "c", "d"], "zukunft: laeuft-heute + kommende");
  assert.deepStrictEqual(Array.from(split.archiv.map((e) => e.id)), ["a", "e"], "archiv: vergangene");
  console.log("  [1] splitZukunftArchiv: Grenzfaelle (heute laufend = Zukunft, ohne Datum verworfen)");

  // (2) filterEvents — zeitraum-Fenster
  const zukunft = [
    ev("b", HEUTE, HEUTE),
    ev("d", "2026-10-01", null),
    ev("d2", "2026-10-05", null),
    ev("w", "2026-10-09", null),
    ev("m", "2026-11-20", null)
  ];
  const fHeute = filterEvents(zukunft, { suche: "", typen: new Set(), zeitraum: "heute", heuteKey: HEUTE, kostenlosNur: false });
  assert.deepStrictEqual(Array.from(fHeute.map((e) => e.id)), ["b"], "heute: nur heutige");
  const f7 = filterEvents(zukunft, { suche: "", typen: new Set(), zeitraum: "7", heuteKey: HEUTE, kostenlosNur: false });
  assert.deepStrictEqual(Array.from(f7.map((e) => e.id)), ["b", "d", "d2"], "7 Tage: [heute, +6]");
  const fAlle = filterEvents(zukunft, { suche: "", typen: new Set(), zeitraum: "alle", heuteKey: HEUTE, kostenlosNur: false });
  assert.strictEqual(fAlle.length, 5, "alle: keine Obergrenze");
  console.log("  [2] filterEvents zeitraum: heute/7/alle korrekt");

  // (3) filterEvents — typen (Mehrfachauswahl) + kostenlosNur (1A)
  const gemischt = [
    ev("m1", HEUTE, null, { typ: "musik", kostenlos: true }),
    ev("m2", HEUTE, null, { typ: "musik", kostenlos: null }),
    ev("t1", HEUTE, null, { typ: "theater", kostenlos: false }),
    ev("x1", HEUTE, null, { typ: null, kostenlos: true })
  ];
  const fMusik = filterEvents(gemischt, { suche: "", typen: new Set(["musik"]), zeitraum: "alle", heuteKey: HEUTE, kostenlosNur: false });
  assert.deepStrictEqual(Array.from(fMusik.map((e) => e.id)), ["m1", "m2"], "typen-Filter musik");
  const fBeide = filterEvents(gemischt, { suche: "", typen: new Set(["musik", "theater"]), zeitraum: "alle", heuteKey: HEUTE, kostenlosNur: false });
  assert.strictEqual(fBeide.length, 3, "typen Mehrfachauswahl");
  const fKostenlos = filterEvents(gemischt, { suche: "", typen: new Set(), zeitraum: "alle", heuteKey: HEUTE, kostenlosNur: true });
  assert.deepStrictEqual(Array.from(fKostenlos.map((e) => e.id)), ["m1", "x1"], "kostenlosNur: nur kostenlos===true (null/false raus)");
  const fKostenlosTyp = filterEvents(gemischt, { suche: "", typen: new Set(["musik"]), zeitraum: "alle", heuteKey: HEUTE, kostenlosNur: true });
  assert.deepStrictEqual(Array.from(fKostenlosTyp.map((e) => e.id)), ["m1"], "kombiniert typ+kostenlos");
  console.log("  [3] filterEvents typen/kostenlosNur (Schema-Attribute, 1A)");

  // (4) filterEvents — suche case-insensitiv ueber name/beschreibung/ortName
  const textEvents = [
    ev("s1", HEUTE, null, { name: "Serenade im Schlossgarten", ortName: "Schlosshof" }),
    ev("s2", HEUTE, null, { name: "Konzert", beschreibung: "Abendliche Serenade im Park" }),
    ev("s3", HEUTE, null, { name: "Stadtlauf", ortName: "Innenstadt" })
  ];
  const fSuche = filterEvents(textEvents, { suche: "serenade", typen: new Set(), zeitraum: "alle", heuteKey: HEUTE, kostenlosNur: false });
  assert.deepStrictEqual(Array.from(fSuche.map((e) => e.id)), ["s1", "s2"], "suche name+beschreibung");
  const fSucheOrt = filterEvents(textEvents, { suche: "schlosshof", typen: new Set(), zeitraum: "alle", heuteKey: HEUTE, kostenlosNur: false });
  assert.deepStrictEqual(Array.from(fSucheOrt.map((e) => e.id)), ["s1"], "suche ortName");
  const fSucheEmpty = filterEvents(textEvents, { suche: "  ", typen: new Set(), zeitraum: "alle", heuteKey: HEUTE, kostenlosNur: false });
  assert.strictEqual(fSucheEmpty.length, 3, "leersuche = kein Filter");
  console.log("  [4] filterEvents suche: name/beschreibung/ortName");

  // (5) tagGruppen — Heute/Morgen/Wochentag, aufsteigend
  const feed = [
    ev("d", "2026-10-01", null),   // morgen (Do)
    ev("b", HEUTE, null),          // heute (Mi)
    ev("f", "2026-10-02", null)    // Freitag
  ];
  const gruppen = tagGruppen(feed, HEUTE);
  assert.strictEqual(gruppen.length, 3, "3 Gruppen");
  assert.strictEqual(gruppen[0].key, HEUTE);
  assert.strictEqual(gruppen[0].label, "Heute");
  assert.strictEqual(gruppen[1].key, "2026-10-01");
  assert.strictEqual(gruppen[1].label, "Morgen");
  assert.strictEqual(gruppen[2].key, "2026-10-02");
  assert.ok(gruppen[2].label.startsWith("Fr."), `Wochentag-Label, war: ${gruppen[2].label}`);
  assert.strictEqual(gruppen[0].events.length, 1);
  console.log(`  [5] tagGruppen: Heute/Morgen/${gruppen[2].label}`);

  // (6) monatsGruppen (Task 9): DESC, Label "September 2026"
  assert.strictEqual(typeof monatsGruppen, "function", "monatsGruppen fehlt");
  const monate = monatsGruppen([
    ev("m1", "2026-07-15"),
    ev("m2", "2026-09-02"),
    ev("m3", "2026-09-20"),
    ev("m4", "2026-08-01"),
    ev("m5", "2026-09-02")
  ]);
  assert.deepStrictEqual(Array.from(monate.map((g) => g.key)), ["2026-09", "2026-08", "2026-07"], "Monate absteigend");
  assert.strictEqual(monate[0].label, "September 2026", "Monats-Label de-DE");
  assert.strictEqual(monate[0].events.length, 3, "Events je Monat gruppiert");
  assert.strictEqual(monate[0].events[0].id, "m2", "innerhalb Monat aufsteigend nach Datum");
  assert.deepStrictEqual(Array.from(monatsGruppen([]).map((g) => g.key)), [], "leer -> leer");
  console.log("  [6] monatsGruppen: DESC + Label + Monats-Buendelung");

  // (7) Review-Fix 1: Zeitraum-Fenster filtert auf ÜBERLAPPUNG – laufende Events bleiben sichtbar
  const laufende = [
    ev("l1", "2026-09-25", "2026-10-05"),   // läuft: start vor heute, end im 7-Tage-Fenster
    ev("l2", "2026-09-20", "2026-09-28"),   // vorbei vor heute -> auch in 'alle' Zukunft? (Split entscheidet) hier manuell: end < heute
    ev("k1", "2026-10-01", null),           // normal kommend
    ev("k2", "2026-10-20", null)            // ausserhalb 7 Tage
  ];
  const f7laufend = filterEvents(laufende.filter(e => e.endDatum !== "2026-09-28"), { suche: "", typen: new Set(), zeitraum: "7", heuteKey: HEUTE, kostenlosNur: false });
  assert.deepStrictEqual(Array.from(f7laufend.map(e => e.id)).sort(), ["k1", "l1"], "7 Tage: laufendes l1 UND kommendes k1 sichtbar, k2 draussen");
  const fAlleLaufend = filterEvents(laufende.filter(e => e.endDatum !== "2026-09-28"), { suche: "", typen: new Set(), zeitraum: "alle", heuteKey: HEUTE, kostenlosNur: false });
  assert.ok(fAlleLaufend.some(e => e.id === "l1"), "alle: laufendes Event drin");
  const fHeuteLaufend = filterEvents([ev("h1", "2026-09-25", "2026-10-02"), ev("h2", HEUTE, null)], { suche: "", typen: new Set(), zeitraum: "heute", heuteKey: HEUTE, kostenlosNur: false });
  assert.deepStrictEqual(Array.from(fHeuteLaufend.map(e => e.id)).sort(), ["h1", "h2"], "heute: gestern gestartetes laufendes + heute startendes");
  console.log("  [7] Review-Fix 1: Zeitraum-Filter auf Ueberlappung (laufende sichtbar)");

  console.log("--- ALLE TASK-3-TESTS GRÜN ---");
}

test();
