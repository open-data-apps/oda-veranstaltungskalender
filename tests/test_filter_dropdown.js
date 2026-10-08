/*
 * v1.2 Task 2: Filterleiste mit Art-Dropdown statt 8 Typ-Pills.
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
  vm.runInContext(appJsCode + "\n;globalThis.__e = { shellHtml, VK_EVENT_TYPES };", sandbox);
  exp = sandbox.__e || {};
} catch (e) { /* RED */ }

const shellHtml = exp.shellHtml;
const VK_EVENT_TYPES = exp.VK_EVENT_TYPES;

function test() {
  console.log("--- TEST: v1.2 Task 2 (Art-Dropdown) ---");
  assert.strictEqual(typeof shellHtml, "function", "shellHtml fehlt");
  const html = shellHtml({ appUid: "i1", configdata: {}, modus: "programm", zeitraum: "7", typen: new Set(), heuteKey: "2026-09-30" });

  assert.ok(html.includes("data-vk-art-toggle"), "Art-Button (data-vk-art-toggle)");
  assert.ok(html.includes("data-vk-art-badge"), "Badge am Art-Button");
  assert.ok(html.includes("data-vk-art-reset"), "Alle-Arten-Reset");
  for (const key of Object.keys(VK_EVENT_TYPES || {})) {
    assert.ok(html.includes(`data-vk-typ-option="${key}"`), `Dropdown-Option ${key}`);
    assert.ok(html.includes(`data-vk-art-option="${key}"`), `Panel-Zeile ${key} (aria)`);
  }
  console.log("  [1] Art-Button + 8 Dropdown-Optionen + Reset");

  assert.ok(!html.includes('id="vk-i1-typ-musik"'), "keine Typ-PILLS mehr in der Leiste");
  assert.ok(html.includes('data-vk-zeitraum="heute"'), "Zeitraum-Pills bleiben");
  assert.ok(html.includes("data-vk-kostenlos"), "Kostenlos-Chip bleibt");
  assert.ok(html.includes("vk-suche"), "Suche bleibt");
  assert.ok(html.includes('aria-expanded="false"'), "Dropdown-Btn startet aria-expanded=false");
  console.log("  [2] Pills ersetzt, Zeitraum/Kostenlos/Suche unveraendert");

  console.log("--- ALLE v1.2-TASK-2-TESTS GRÜN ---");
}

test();
