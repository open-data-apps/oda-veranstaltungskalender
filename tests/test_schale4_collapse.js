/*
 * v1.2 Task 3: schale4Html als einklappbarer Info-Block inkl. (c)-Fusszeile.
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
  vm.runInContext(appJsCode + "\n;globalThis.__e = { schale4Html };", sandbox);
  exp = sandbox.__e || {};
} catch (e) { /* RED */ }

const schale4Html = exp.schale4Html;

function test() {
  console.log("--- TEST: v1.2 Task 3 (Schale-4 einklappbar) ---");
  assert.strictEqual(typeof schale4Html, "function", "schale4Html fehlt");
  console.log("  [0] schale4Html vorhanden");

  const state = {
    appUid: "i1",
    configdata: {
      datenquelleHinweis: "<p>Methodik-Kasten <b>fett</b></p>",
      datenStand: "Stand: Live-Abruf <x>",
      weiterfuehrendeLinks: '<ul><li><a href="https://x.de">Link</a></li></ul>',
      fusszeile: "© 2026 | App und Daten: Betreiber <>& Entwicklung"
    }
  };

  const html = schale4Html(state);
  assert.ok(html.includes("data-vk-info-toggle"), "Einklapp-Kopf (data-vk-info-toggle)");
  assert.ok(html.includes('aria-expanded="false"'), "startet zu (aria-expanded=false)");
  assert.ok(html.includes("hidden"), "Inhalt startet hidden");
  assert.ok(html.includes("Datenquelle &amp; Methodik"), "Titelzeile (escaped)");
  assert.ok(html.includes("Stand: Live-Abruf &lt;x&gt;"), "datenStand als Text escaped");
  assert.ok(html.includes("Methodik-Kasten"), "Hinweis-HTML unverändert");
  assert.ok(html.includes("<b>fett</b>"), "Runtime-HTML bleibt HTML");
  assert.ok(html.includes("https://x.de"), "Links");
  assert.ok(html.includes("© 2026 | App und Daten: Betreiber &lt;&gt;&amp; Entwicklung"), "fusszeile als letzte Zeile, escaped");
  assert.ok(html.indexOf("Methodik-Kasten") > html.indexOf("data-vk-info-toggle"), "Inhalt NACH dem Kopf");
  console.log("  [1] Kopf + versteckter Inhalt + (c)-Zeile escaped");

  const leer = schale4Html({ appUid: "i1", configdata: {} });
  assert.strictEqual(leer.trim(), "", "ohne alle Felder: kein Block");
  const nurFuss = schale4Html({ appUid: "i1", configdata: { fusszeile: "© X" } });
  assert.ok(nurFuss.includes("data-vk-info-toggle"), "nur fusszeile -> Block trotzdem (c sichtbar machen)");
  console.log("  [2] Bedingtes Rendering inkl. nur-fusszeile");

  console.log("--- ALLE v1.2-TASK-3-TESTS GRÜN ---");
}

test();
