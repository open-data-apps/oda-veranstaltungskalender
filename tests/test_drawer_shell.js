/*
 * v1.2.1 Task 1: Burger rechts + Drawer als reines Navigationsmenü
 * (normale Hash-Links auf die Template-Sekundärseiten; kein Inhalts-Panel).
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
  console.log("--- TEST: v1.2.1 Task 1 (Burger rechts + Drawer-Navigation) ---");
  assert.strictEqual(typeof shellHtml, "function", "shellHtml fehlt");
  const html = shellHtml({ appUid: "i1", configdata: {}, modus: "programm", zeitraum: "7", typen: new Set(), heuteKey: "2026-09-30" });

  assert.ok(html.includes("data-vk-menue"), "Menue-Button");
  const idxMenue = html.indexOf("data-vk-menue");
  const idxModi = html.indexOf('class="vk-modi"');
  assert.ok(idxMenue > idxModi, "Menue-Button NACH den Ansichts-Tabs (rechts)");
  console.log("  [1] Burger rechts (hinter Programm/Karte/Katalog/Archiv)");

  assert.ok(html.includes("vk-drawer-titel"), "Drawer-Kopf");
  for (const seite of ["beschreibung", "kontakt", "impressum", "datenschutz"]) {
    const rx = new RegExp(`<a[^>]*href="#${seite}"[^>]*data-vk-drawer-nav`);
    assert.ok(rx.test(html), `echter Hash-Link #${seite} im Drawer`);
  }
  console.log("  [2] Drawer: 4 normale Hash-Links auf Sekundärseiten");

  assert.ok(!html.includes("drawer-inhalt"), "kein Inhalts-Panel im Drawer");
  assert.ok(!html.includes("data-vk-seite"), "keine In-Drawer-Seitenschalter");
  assert.ok(html.includes('data-vk-drawer-zu="1"'), "Programm-Eintrag bleibt in der App");
  console.log("  [3] Inhalts-Panel entfernt, Programm-Eintrag bleibt");

  console.log("--- ALLE v1.2.1-TASK-1-TESTS GRÜN ---");
}

test();
