/*
 * v1.2.3: Sitzungslokaler Daten-Cache – Hin-und-Her-Navigation zwischen App
 * und Sekundaerseiten ohne erneuten DZT-/Geocoding-Abruf.
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
    window: { location: { pathname: "/app/" } },
    document: { readyState: "complete", addEventListener: () => {}, getElementById: () => null, querySelectorAll: () => [] },
    Intl, Date, AbortController
  };
  vm.createContext(sandbox);
  vm.runInContext(appJsCode + "\n;globalThis.__e = { vkCacheKey, vkCachePruefe, vkCacheLege, heutigerTagKey };", sandbox);
  exp = sandbox.__e || {};
} catch (e) { /* RED */ }

function test() {
  console.log("--- TEST: v1.2.3 (Daten-Cache) ---");
  assert.strictEqual(typeof exp.vkCacheKey, "function", "vkCacheKey fehlt");
  assert.strictEqual(typeof exp.vkCachePruefe, "function", "vkCachePruefe fehlt");
  assert.strictEqual(typeof exp.vkCacheLege, "function", "vkCacheLege fehlt");
  console.log("  [0] Cache-Funktionen vorhanden");

  const confA = { ort: "Böblingen", radiusKm: "25", apiurls: [{ name: "veranstaltungen", url: "https://store/dzt" }] };
  const confB = { ort: "Ansbach", radiusKm: "25", apiurls: [{ name: "veranstaltungen", url: "https://store/dzt" }] };

  const keyA = exp.vkCacheKey(confA);
  assert.strictEqual(keyA, exp.vkCacheKey({ ort: " Böblingen ", radiusKm: "25", apiurls: [{ name: "veranstaltungen", url: "https://store/dzt" }] }), "Key deterministisch (Ort-Whitespace egal)");
  assert.notStrictEqual(keyA, exp.vkCacheKey(confB), "Keys unterscheiden Instanzen");
  console.log("  [1] Key-Bildung: deterministisch, instanzspezifisch");

  assert.strictEqual(exp.vkCachePruefe(confA), null, "vor dem ersten Laden: kein Treffer");
  const ergebnis = { zukunft: [1, 2], archiv: [], geo: { lat: 1, lon: 2 }, heuteKey: exp.heutigerTagKey() };
  exp.vkCacheLege(confA, ergebnis);
  const geholt = exp.vkCachePruefe(confA);
  assert.ok(geholt === ergebnis, "nach dem Laden: Ergebnis sofort aus dem Cache");
  assert.strictEqual(exp.vkCachePruefe(confB), null, "andere Instanz bleibt unberührt");
  console.log("  [2] Lege/Pruefe: Hit nur fuer dieselbe Instanz");

  exp.vkCacheLege(confB, null);
  assert.strictEqual(exp.vkCachePruefe(confB), null, "null-Ergebnis wird nicht gecacht (Fehlerfall)");
  console.log("  [3] Fehlerfall wird nie gecacht");

  /* v1.2.5 D-4: Tageswechsel invalidiert den Cache – der Schluessel enthaelt
   * das heutige Datum (unabhaengig im Test nachgerechnet). */
  const pad = (n) => String(n).padStart(2, "0");
  const heute = new Date();
  const heuteIso = `${heute.getFullYear()}-${pad(heute.getMonth() + 1)}-${pad(heute.getDate())}`;
  assert.ok(keyA.includes(heuteIso), "Cache-Schluessel enthaelt das heutige Datum (" + heuteIso + ")");
  console.log("  [5] Tageswechsel-Invalidierung: Datum im Schluessel");

  /* Integrations-Guard: ladeDaten fragt den Cache VOR dem Netz-Abruf */
  assert.ok(/vkCachePruefe\(state\.configdata\)/.test(appJsCode), "ladeDaten nutzt vkCachePruefe");
  assert.ok(/vkCacheLege\(state\.configdata/.test(appJsCode), "ladeDaten befuellt den Cache");
  const ladeDatenKoerper = appJsCode.split("async function ladeDaten")[1].split("function kpiWerte")[0];
  assert.ok(/vkCacheLege/.test(ladeDatenKoerper), "Cache-Befuellung innerhalb ladeDaten");
  /* Audit T-2: Reihenfolge-Guard – Cache-Pruefung muss VOR dem Netzwerkabruf stehen */
  assert.ok(ladeDatenKoerper.indexOf("vkCachePruefe") < ladeDatenKoerper.indexOf("await ladeEvents"), "vkCachePruefe steht vor await ladeEvents (kein toter Cache)");
  console.log("  [4] ladeDaten: Cache vor dem Abruf (Reihenfolge bewiesen), Befuellung im Erfolgspfad");

  console.log("--- ALLE v1.2.3-TESTS GRÜN ---");
}

test();
