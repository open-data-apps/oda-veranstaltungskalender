/*
 * v1.2.2 Task 1: Toolbar zweizeilig, ohne Clipping-Workaround.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appJsPath = path.join(__dirname, "../app/app.js");
const appJsCode = fs.readFileSync(appJsPath, "utf-8");

let shellHtml = null;
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
  vm.runInContext(appJsCode + "\n;globalThis.__s = shellHtml;", sandbox);
  shellHtml = sandbox.__s;
} catch (e) { /* RED */ }

function test() {
  console.log("--- TEST: v1.2.2 Task 1 (Toolbar zweizeilig) ---");
  assert.strictEqual(typeof shellHtml, "function", "shellHtml fehlt");
  const html = shellHtml({ appUid: "i1", configdata: {}, modus: "programm", zeitraum: "7", typen: new Set(), heuteKey: "2026-09-30" });

  assert.ok(html.includes('class="vk-filter-reihe"'), "Filter-Reihe (Zeile 1, Pills/Art/Kostenlos)");
  assert.ok(html.includes('class="vk-filter-suche"'), "Suche-Zeile (Zeile 2, volle Breite)");
  const idxReihe = html.indexOf('class="vk-filter-reihe"');
  const idxSuche = html.indexOf('class="vk-filter-suche"');
  assert.ok(idxReihe > -1 && idxSuche > idxReihe, "Suche NACH der Pill-Reihe");
  const reiheBlock = html.slice(idxReihe, idxSuche);
  assert.ok(reiheBlock.includes('data-vk-zeitraum="heute"'), "Zeitraum-Pills in Reihe 1");
  assert.ok(reiheBlock.includes("data-vk-art-toggle"), "Art-Button in Reihe 1");
  assert.ok(reiheBlock.includes("data-vk-kostenlos"), "Kostenlos in Reihe 1");
  assert.ok(!reiheBlock.includes("vk-suche"), "Suche NICHT in Reihe 1");
  console.log("  [1] Zwei Zeilen: Pills-Reihe + eigene Suchzeile");

  /* Clipping-Workaround ist weg: kein Klassen-Toggling an der Leiste mehr */
  assert.ok(!appJsCode.includes("vk-art-offen"), "vk-art-offen-Workaround entfernt");
  console.log("  [2] Overflow-Workaround entfernt (kein Puls mehr möglich)");

  assert.ok(html.includes("vk-suche"), "Suchfeld bleibt im Markup");
  assert.ok(html.includes("aria-placeholder") || html.includes('placeholder='), "Suchfeld mit Vorschautext");
  console.log("  [3] Suchfeld vorhanden");

  console.log("--- ALLE v1.2.2-TASK-1-TESTS GRÜN ---");
}

test();
