/*
 * v1.2.5 D-5: Netz-Zeitlimit – haengende Requests enden in einer Klartext-
 * Meldung statt einem endlosen Spinner; Seitenwechsel-Abbruch bleibt AbortError.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appJsPath = path.join(__dirname, "../app/app.js");
const appJsCode = fs.readFileSync(appJsPath, "utf-8");

let testsComplete = false;
process.once("beforeExit", () => {
  if (!testsComplete) {
    console.error("FAIL: Testlauf vor Abschluss von [0] bis [4] beendet");
    process.exitCode = 1;
  }
});

let exp = {};
try {
  const sandbox = {
    console, process, require,
    __dirname: path.join(__dirname, "../app"),
    sessionStorage: { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = String(v); } },
    window: { location: { pathname: "/app/" } },
    document: { readyState: "complete", addEventListener: () => {} },
    fetch: async () => { throw new Error("fetch nicht gesetzt"); },
    URL, URLSearchParams, AbortController, DOMException,
    setTimeout: setTimeout, clearTimeout: clearTimeout
  };
  vm.createContext(sandbox);
  vm.runInContext(
    appJsCode +
      "\n;globalThis.__e = { vkZeitlimitFetch, setzeFetch: (f) => { globalThis.fetch = (url, init) => { globalThis.__e.letztesSignal = init && init.signal; return f(url, init); }; } };",
    sandbox
  );
  exp = sandbox.__e || {};
} catch (e) { /* RED */ }

async function runTests() {
  console.log("--- TEST: v1.2.5 D-5 (Netz-Zeitlimit) ---");
  const z = exp.vkZeitlimitFetch;
  assert.strictEqual(typeof z, "function", "vkZeitlimitFetch fehlt");
  console.log("  [0] vkZeitlimitFetch vorhanden");

  /* (1) Normalfall: Antwort samt gelesenem Body kommt durch */
  const response = { ok: true, status: 200, text: async () => "{}" };
  exp.setzeFetch(async () => response);
  const ergebnis = await z("https://x.de/a", {}, null, 500);
  assert.ok(ergebnis && ergebnis.ok === true, "Antwort kommt durch");
  assert.strictEqual(ergebnis.text, "{}", "Body ist innerhalb des Zeitlimits gelesen");
  console.log("  [1] Normalfall: Antwort samt Body wird durchgereicht");

  /* (2) Haengender Request -> Zeitlimit-Fehler mit Klartext nach ms */
  exp.setzeFetch((_url, init) => new Promise((_, reject) => {
    const signal = init.signal;
    const rejectAbort = () => reject(signal.reason || new DOMException("Aborted", "AbortError"));
    if (signal.aborted) rejectAbort();
    else signal.addEventListener("abort", rejectAbort, { once: true });
  }));
  let haengtFehler = null;
  try {
    await z("https://x.de/b", {}, null, 60);
  } catch (e) { haengtFehler = e; }
  assert.ok(haengtFehler, "haengender Request wirft");
  assert.ok(String(haengtFehler.message).includes("Zeitlimit"), "Meldung nennt Zeitlimit: " + haengtFehler.message);
  console.log("  [2] Haengender Request -> Klartext 'Zeitlimit' nach Ablauf");

  /* (2b) Header kommen sofort, der Body haengt -> Zeitlimit muss auch hier greifen.
   * Vorher endete das Zeitlimit mit den Headern; der Spinner lief unbegrenzt weiter. */
  exp.setzeFetch(async () => ({
    ok: true,
    status: 200,
    text: () => new Promise((_, reject) => {
      const signal = exp.letztesSignal;
      const rejectAbort = () => reject(signal.reason || new DOMException("Aborted", "AbortError"));
      if (!signal) return;
      if (signal.aborted) rejectAbort();
      else signal.addEventListener("abort", rejectAbort, { once: true });
    })
  }));
  let bodyFehler = null;
  try {
    await z("https://x.de/b2", {}, null, 60);
  } catch (e) { bodyFehler = e; }
  assert.ok(bodyFehler, "haengender Body wirft");
  assert.ok(String(bodyFehler.message).includes("Zeitlimit"), "Meldung nennt Zeitlimit: " + (bodyFehler && bodyFehler.message));
  console.log("  [2b] Haengender Body nach Headern -> Klartext 'Zeitlimit'");

  /* (2c) Seitenwechsel waehrend haengendem Body -> AbortError, nicht Zeitlimit */
  const controllerBody = new AbortController();
  exp.setzeFetch(async () => ({
    ok: true,
    status: 200,
    text: () => new Promise((_, reject) => {
      const signal = exp.letztesSignal;
      const rejectAbort = () => reject(signal.reason || new DOMException("Aborted", "AbortError"));
      if (signal.aborted) rejectAbort();
      else signal.addEventListener("abort", rejectAbort, { once: true });
    })
  }));
  const bodyAbbruchProm = z("https://x.de/b3", {}, controllerBody.signal, 5000);
  await new Promise(r => setTimeout(r, 30));
  controllerBody.abort();
  let bodyAbbruchFehler = null;
  try { await bodyAbbruchProm; } catch (e) { bodyAbbruchFehler = e; }
  assert.ok(bodyAbbruchFehler, "Abbruch waehrend Body wirft");
  assert.strictEqual(bodyAbbruchFehler.name, "AbortError", "Body-Abbruch = AbortError");
  assert.ok(!String(bodyAbbruchFehler.message).includes("Zeitlimit"), "kein Timeout-Text beim Nutzerabbruch");
  console.log("  [2c] Seitenwechsel im haengenden Body -> AbortError");

  /* (3) Seitenwechsel-Abbruch bleibt AbortError (kein Timeout-Text) */
  const controller = new AbortController();
  const abbruchProm = z("https://x.de/c", {}, controller.signal, 5000);
  await new Promise(r => setTimeout(r, 30));
  controller.abort();
  let abbruchFehler = null;
  try { await abbruchProm; } catch (e) { abbruchFehler = e; }
  assert.ok(abbruchFehler, "Abbruch wirft");
  assert.strictEqual(abbruchFehler.name, "AbortError", "Seitenwechsel-Abbruch = AbortError");
  assert.ok(!String(abbruchFehler.message).includes("Zeitlimit"), "kein Timeout-Text beim Nutzerabbruch");
  console.log("  [3] Externer Abbruch: AbortError bleibt AbortError");

  /* (4) Einsatzstellen: fetchKgJson + geocodeOrt nutzen das Zeitlimit */
  const fetchBlock = appJsCode.split("async function fetchKgJson")[1].slice(0, 900);
  assert.ok(fetchBlock.includes("vkZeitlimitFetch"), "fetchKgJson nutzt das Zeitlimit");
  const geoBlock = appJsCode.split("async function geocodeOrt")[1].slice(0, 900);
  assert.ok(geoBlock.includes("vkZeitlimitFetch"), "geocodeOrt nutzt das Zeitlimit");
  console.log("  [4] Relay + Geocoding laufen mit Zeitlimit");

  testsComplete = true;
  console.log("--- ALLE v1.2.5-D5-TESTS GRÜN ---");
}

runTests().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
