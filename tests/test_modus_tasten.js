/*
 * v1.3.3: Pfeiltasten-Steuerung in der Ansichtsleiste.
 *
 * Befund 2026-10-01: Die Leiste war als Reiter-Leiste ausgezeichnet
 * (role="tablist"), aber ohne die zugehoerige Pfeiltasten-Steuerung und ohne
 * role="tab". Eine Reiter-Leiste ohne Pfeiltasten ist unvollstaendig: wer mit
 * der Tastatur arbeitet, kommt so nicht von einer Ansicht zur naechsten.
 *
 * Konvention (WAI-ARIA): role="tablist" am Behaelter, role="tab" an den
 * Schaltflaechen, aria-selected statt aria-pressed, nur der aktive Reiter ist
 * mit der Tabulatortaste erreichbar (tabindex 0), die uebrigen -1.
 * Pfeil links/rechts wechselt, Home/End springt an den Rand.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appJsPath = path.join(__dirname, "../app/app.js");
const appJsCode = fs.readFileSync(appJsPath, "utf-8");

function lade(exporte) {
  const sandbox = {
    console, process, require,
    __dirname: path.join(__dirname, "../app"),
    sessionStorage: { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = String(v); } },
    window: { location: { pathname: "/app/", hash: "#startseite" }, addEventListener: () => {} },
    history: { state: null, pushState: () => {} },
    document: { readyState: "complete", addEventListener: () => {}, getElementById: () => null, querySelectorAll: () => [] },
    Intl, Date, AbortController, URL, URLSearchParams
  };
  vm.createContext(sandbox);
  vm.runInContext(appJsCode + `\n;globalThis.__e = { ${exporte.join(", ")} };`, sandbox);
  return sandbox.__e;
}

let exp = {};
try { exp = lade(["vkNavigationHtml", "shellHtml", "vkModusTastenZiel", "verdrahteModusTasten"]); } catch (e) { /* RED */ }

function test() {
  console.log("--- TEST: v1.3.3 (Pfeiltasten in der Ansichtsleiste) ---");

  const vkNavigationHtml = exp.vkNavigationHtml;
  assert.strictEqual(typeof vkNavigationHtml, "function", "vkNavigationHtml fehlt");

  const zustand = { appUid: "i1", seite: "startseite", modus: "programm", configdata: { titel: "T", ort: "O" } };
  const html = vkNavigationHtml(zustand);

  console.log("  [1] Reiter-Auszeichnung ist vollstaendig");
  assert.ok(/<nav class="vk-modi" role="tablist"/.test(html), "Behaelter ist eine Reiter-Leiste");
  assert.strictEqual((html.match(/role="tab"/g) || []).length, 4, "vier Reiter mit role=tab");
  assert.strictEqual((html.match(/aria-selected=/g) || []).length, 4, "vier Reiter mit aria-selected");
  assert.ok(!html.includes("aria-pressed"), "kein aria-pressed mehr an Reitern (dafuer gibt es aria-selected)");
  assert.strictEqual((html.match(/aria-controls="vk-i1-inhalt"/g) || []).length, 4, "jeder Reiter zeigt auf den Inhaltsbereich");

  console.log("  [2] Nur der aktive Reiter ist mit der Tabulatortaste erreichbar");
  assert.ok(/data-vk-modus="programm"[^>]*aria-selected="true"/.test(html), "Programm ist ausgewaehlt");
  const tabindex = (html.match(/data-vk-modus="([a-z]+)"[^>]*tabindex="(-?\d)"/g) || []);
  assert.strictEqual(tabindex.length, 4, "vier Reiter mit tabindex: " + JSON.stringify(tabindex));
  const aktive = tabindex.filter((t) => /tabindex="0"/.test(t));
  assert.strictEqual(aktive.length, 1, "genau ein Reiter mit tabindex 0: " + JSON.stringify(aktive));
  assert.ok(aktive[0].includes('data-vk-modus="programm"'), "der ausgewaehlte Reiter ist der erreichbare");
  assert.strictEqual(tabindex.filter((t) => /tabindex="-1"/.test(t)).length, 3, "die uebrigen sind -1");

  console.log("  [3] Der Inhaltsbereich ist als Reiterflaeche ausgezeichnet");
  const shell = exp.shellHtml({ appUid: "i1", configdata: {}, modus: "karte", zeitraum: "7", typen: new Set(), heuteKey: "2026-10-01" });
  assert.ok(shell.includes('role="tabpanel"'), "Inhaltsbereich hat role=tabpanel");
  assert.ok(/id="vk-i1-inhalt" role="tabpanel" aria-labelledby="vk-i1-modus-karte"/.test(shell),
    "Reiterflaeche verweist auf den aktiven Reiter: " + (shell.match(/<main[^>]*>/) || [])[0]);

  console.log("  [4] Pfeiltasten rechnen richtig");
  const ziel = exp.vkModusTastenZiel;
  assert.strictEqual(typeof ziel, "function", "vkModusTastenZiel fehlt");
  assert.strictEqual(ziel("ArrowRight", 0, 4), 1, "rechts von 0");
  assert.strictEqual(ziel("ArrowRight", 3, 4), 0, "rechts vom letzten laeuft um");
  assert.strictEqual(ziel("ArrowLeft", 0, 4), 3, "links vom ersten laeuft um");
  assert.strictEqual(ziel("ArrowLeft", 2, 4), 1, "links von 2");
  assert.strictEqual(ziel("Home", 2, 4), 0, "Home an den Anfang");
  assert.strictEqual(ziel("End", 1, 4), 3, "End ans Ende");

  console.log("  [5] Unbekanntes veraendert nichts (kein Absturz)");
  assert.strictEqual(ziel("Enter", 1, 4), -1, "Enter ist keine Pfeiltaste");
  assert.strictEqual(ziel("Tab", 1, 4), -1, "Tab bleibt dem Browser");
  assert.strictEqual(ziel("ArrowRight", -1, 4), 1, "ohne Fundstelle von vorn");
  assert.strictEqual(ziel("ArrowRight", 9, 4), 1, "Index ausserhalb wird geklemmt");
  assert.strictEqual(ziel("ArrowRight", 0, 0), -1, "ohne Reiter kein Ziel");
  assert.strictEqual(ziel("ArrowRight", 0, 1), 0, "ein Reiter bleibt bei sich");
  assert.strictEqual(ziel(undefined, 0, 4), -1, "fehlende Taste");
  assert.strictEqual(ziel("Home", 0, 0), -1, "Home ohne Reiter");

  console.log("  [6] Die Leiste horcht auf Tastendruecke");
  assert.strictEqual(typeof exp.verdrahteModusTasten, "function", "verdrahteModusTasten fehlt");
  const gehoert = [];
  const leiste = { addEventListener: (typ) => gehoert.push(typ), querySelectorAll: () => [] };
  const leistenShell = { querySelector: (s) => (s === ".vk-modi" ? leiste : null) };
  exp.verdrahteModusTasten({ appUid: "i1", modus: "programm" }, leistenShell);
  assert.ok(gehoert.includes("keydown"), "keydown wird abgehoert: " + gehoert.join(", "));
  assert.doesNotThrow(() => exp.verdrahteModusTasten({ appUid: "i1", modus: "programm" }, { querySelector: () => null }), "ohne Leiste kein Fehler");

  console.log("--- ALLE PFEILTASTEN-TESTS GRÜN ---");
}

test();
