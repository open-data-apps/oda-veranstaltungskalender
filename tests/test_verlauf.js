/*
 * v1.3.2: Zurueck/Vorwaerts zwischen den Ansichten der Startseite.
 *
 * Befund 2026-10-01: Ein Klick auf Programm/Karte/Katalog/Archiv erzeugte
 * keinen Verlaufseintrag. "Zurueck" verliess deshalb die App bzw. lud sie neu,
 * "Vorwaerts" stellte die Ansicht nie wieder her.
 *
 * Die Ansicht wird in history.state abgelegt, nicht in der Adresse: die
 * Adresssteuerung der Base kennt nur die fuenf Seitennamen und schreibt jeden
 * anderen Hash auf #startseite zurueck (gemessen) – das erzeugte nur weitere
 * Eintraege.
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
    window: { location: { pathname: "/app/", hash: "" }, addEventListener: () => {} },
    history: { state: null, pushState: () => {} },
    document: { readyState: "complete", addEventListener: () => {}, getElementById: () => null, querySelectorAll: () => [] },
    Intl, Date, AbortController, URL, URLSearchParams
  };
  vm.createContext(sandbox);
  vm.runInContext(appJsCode + "\n;globalThis.__e = { vkModusAusState, vkVerlaufVerdrahten };", sandbox);
  exp = sandbox.__e || {};
} catch (e) { /* RED */ }

function test() {
  console.log("--- TEST: v1.3.2 (Zurueck/Vorwaerts zwischen den Ansichten) ---");

  const vkModusAusState = exp.vkModusAusState;
  assert.strictEqual(typeof vkModusAusState, "function", "vkModusAusState fehlt");

  console.log("  [1] Gueltige Ansicht wird aus dem Verlaufseintrag gelesen");
  assert.strictEqual(vkModusAusState({ vkModus: "karte" }), "karte", "karte erkannt");
  assert.strictEqual(vkModusAusState({ vkModus: "katalog" }), "katalog", "katalog erkannt");
  assert.strictEqual(vkModusAusState({ vkModus: "archiv" }), "archiv", "archiv erkannt");
  assert.strictEqual(vkModusAusState({ vkModus: "programm" }), "programm", "programm erkannt");

  console.log("  [2] Unbrauchbare Eintraege liefern nichts (kein Absturz)");
  assert.strictEqual(vkModusAusState(null), null, "null");
  assert.strictEqual(vkModusAusState(undefined), null, "undefined");
  assert.strictEqual(vkModusAusState({}), null, "leeres Objekt");
  assert.strictEqual(vkModusAusState({ vkModus: "" }), null, "leere Zeichenkette");
  assert.strictEqual(vkModusAusState({ vkModus: "quatsch" }), null, "unbekannte Ansicht");
  assert.strictEqual(vkModusAusState({ vkModus: 7 }), null, "Zahl statt Name");
  assert.strictEqual(vkModusAusState({ vkModus: "Karte" }), null, "Grossschreibung zaehlt nicht");
  assert.strictEqual(vkModusAusState("karte"), null, "Zeichenkette statt Objekt");

  console.log("  [3] Fremde Verlaufseintraege werden nicht angefasst");
  assert.strictEqual(vkModusAusState({ seite: "kontakt" }), null, "fremder Schluessel");
  assert.strictEqual(vkModusAusState({ vkModus: "karte", fremd: 1 }), "karte", "eigener Schluessel zaehlt");

  console.log("  [4] Zurueck/Vorwaerts ist verdrahtet");
  assert.strictEqual(typeof exp.vkVerlaufVerdrahten, "function", "vkVerlaufVerdrahten fehlt");
  const verdrahtet = [];
  const sandbox2 = {
    console, process, require,
    __dirname: path.join(__dirname, "../app"),
    sessionStorage: { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = String(v); } },
    window: { location: { pathname: "/app/", hash: "#startseite" }, addEventListener: (typ) => verdrahtet.push(typ) },
    history: { state: null, pushState: () => {} },
    document: { readyState: "complete", addEventListener: () => {}, getElementById: () => null, querySelectorAll: () => [] },
    Intl, Date, AbortController, URL, URLSearchParams
  };
  vm.createContext(sandbox2);
  vm.runInContext(appJsCode + "\n;globalThis.__e = { vkVerlaufVerdrahten };", sandbox2);
  sandbox2.__e.vkVerlaufVerdrahten();
  assert.ok(verdrahtet.includes("popstate"), "popstate wird abgehoert: " + verdrahtet.join(", "));
  sandbox2.__e.vkVerlaufVerdrahten();
  assert.strictEqual(verdrahtet.filter((t) => t === "popstate").length, 1, "nur einmal verdrahtet");

  console.log("  [5] Der Klick auf eine Ansicht schreibt in den Verlauf");
  const eintraege = [];
  const sandbox3 = {
    console, process, require,
    __dirname: path.join(__dirname, "../app"),
    sessionStorage: { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = String(v); } },
    window: { location: { pathname: "/app/", hash: "#startseite" }, addEventListener: () => {} },
    history: { state: null, pushState: (zustand) => eintraege.push(zustand) },
    document: { readyState: "complete", addEventListener: () => {}, getElementById: () => null, querySelectorAll: () => [] },
    Intl, Date, AbortController, URL, URLSearchParams
  };
  vm.createContext(sandbox3);
  vm.runInContext(appJsCode + "\n;globalThis.__e = { vkMerkeModus };", sandbox3);
  assert.strictEqual(typeof sandbox3.__e.vkMerkeModus, "function", "vkMerkeModus fehlt");
  sandbox3.__e.vkMerkeModus("karte");
  assert.strictEqual(eintraege.length, 1, "genau ein Eintrag");
  /* JSON-Vergleich: der Eintrag entsteht im vm-Bereich und hat dort ein eigenes Prototype. */
  assert.strictEqual(JSON.stringify(eintraege[0]), JSON.stringify({ vkModus: "karte" }), "Eintrag traegt die Ansicht");
  assert.strictEqual(vkModusAusState(eintraege[0]), "karte", "Eintrag ist wieder lesbar");

  console.log("  [6] Adresse bleibt unveraendert (nur der Verlaufseintrag kommt dazu)");
  const adressen = [];
  const sandbox4 = {
    console, process, require,
    __dirname: path.join(__dirname, "../app"),
    sessionStorage: { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = String(v); } },
    window: { location: { pathname: "/app/", hash: "#startseite" }, addEventListener: () => {} },
    history: { state: null, pushState: (zustand, titel, url) => adressen.push(url) },
    document: { readyState: "complete", addEventListener: () => {}, getElementById: () => null, querySelectorAll: () => [] },
    Intl, Date, AbortController, URL, URLSearchParams
  };
  vm.createContext(sandbox4);
  vm.runInContext(appJsCode + "\n;globalThis.__e = { vkMerkeModus };", sandbox4);
  sandbox4.__e.vkMerkeModus("archiv");
  assert.strictEqual(adressen.length, 1, "ein Aufruf");
  assert.ok(adressen[0] === undefined || adressen[0] === null, "keine Adressaenderung: " + JSON.stringify(adressen[0]));

  console.log("--- ALLE VERLAUFS-TESTS GRÜN ---");
}

test();
