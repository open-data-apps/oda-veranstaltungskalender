/*
 * v1.3.2: Ruhige Ansicht – keine gestrichelten Linien, kein Hoehen-Ruckeln.
 *
 * Befunde 2026-10-01:
 * - Gestrichelte Trennlinien (KPI-Kontext, Copyright) sollten durch eine
 *   ruhige durchgezogene Linie ersetzt werden.
 * - Der KPI-Aufklapper animierte seine Hoehe. Bootstrap macht das ueber
 *   `.collapsing { transition: height .35s }`; eine Hoehenanimation erzwingt
 *   pro Bild ein Layout. Gemessen auf der Dev-Instanz mit echten Daten:
 *   Spitze 50 ms statt 17 ms pro Bild, p95 16,7 ms statt 8,8 ms.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appJsPath = path.join(__dirname, "../app/app.js");
const appJsCode = fs.readFileSync(appJsPath, "utf-8");
const appCssPath = path.join(__dirname, "../app/app.css");
const appCssCode = fs.readFileSync(appCssPath, "utf-8");

let kpiContext = null;
try {
  const sandbox = {
    console, process, require,
    __dirname: path.join(__dirname, "../app"),
    sessionStorage: { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = String(v); } },
    window: { location: { pathname: "/app/" } },
    document: { readyState: "complete", addEventListener: () => {}, getElementById: () => null, querySelectorAll: () => [] },
    Intl, Date, AbortController, URL, URLSearchParams
  };
  vm.createContext(sandbox);
  vm.runInContext(appJsCode + "\n;globalThis.__e = { kpiContext };", sandbox);
  kpiContext = sandbox.__e.kpiContext;
} catch (e) { /* RED */ }

function test() {
  console.log("--- TEST: v1.3.2 (Ruhige Ansicht) ---");

  console.log("  [1] Keine gestrichelten Linien mehr");
  const gestrichelt = appCssCode.split("\n")
    .map((zeile, i) => ({ zeile: zeile.trim(), nr: i + 1 }))
    .filter((x) => /\bdashed\b|\bdotted\b/.test(x.zeile));
  assert.deepStrictEqual(gestrichelt, [], "gestrichelte Linien uebrig: " + JSON.stringify(gestrichelt));

  console.log("  [2] Die beiden Trennlinien sind jetzt durchgezogen");
  assert.ok(/\.vk-kpi-kontext\s*\{[^}]*border-top:\s*1px solid var\(--vk-line\)/.test(appCssCode), "KPI-Kontext: durchgezogene Trennlinie");
  assert.ok(/\.vk-info-copyright\s*\{[^}]*border-top:\s*1px solid var\(--vk-line\)/.test(appCssCode), "Copyright: durchgezogene Trennlinie");

  console.log("  [3] KPI-Aufklapper haengt an einer eigenen Klasse");
  assert.strictEqual(typeof kpiContext, "function", "kpiContext fehlt");
  const html = kpiContext("Ein Kontext.", "1", "i1");
  assert.ok(html.includes("vk-kpi-collapse"), "Aufklapper traegt vk-kpi-collapse: " + html.slice(0, 120));

  console.log("  [4] Die Hoehenanimation ist abgeschaltet");
  const regel = appCssCode.match(/\.vk-kpi-collapse\.collapsing\s*\{([^}]*)\}/);
  assert.ok(regel, "Regel fuer .vk-kpi-collapse.collapsing fehlt");
  const rumpf = regel[1];
  assert.ok(/transition:\s*none/.test(rumpf), "kein Uebergang mehr: " + rumpf.trim());
  assert.ok(/height:\s*auto\s*!important/.test(rumpf), "Hoehe steht sofort: " + rumpf.trim());

  console.log("  [5] Andere Aufklapper bleiben unberuehrt");
  const allgemein = appCssCode.split("\n").filter((z) => /^\s*\.collapsing\s*[,{]/.test(z));
  assert.deepStrictEqual(allgemein, [], "allgemeine .collapsing-Regel ueberschrieben: " + JSON.stringify(allgemein));

  console.log("  [6] Kein Text mehr im Aufklapper, der Hoehe erzwingt");
  assert.ok(html.includes('class="collapse vk-kpi-collapse"'), "Klassen am Aufklapper: " + html.slice(0, 120));

  console.log("--- ALLE RUHIGE-ANSICHT-TESTS GRÜN ---");
}

test();
