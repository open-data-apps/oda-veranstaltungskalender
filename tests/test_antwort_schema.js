/*
 * v1.2.4 D-6: Relay-Antwort ohne gueltiges results.bindings ist ein FEHLER,
 * kein "leeres Programm" (Audit-Befund D-6). Orakel unabhaengig formuliert.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appJsPath = path.join(__dirname, "../app/app.js");
const appJsCode = fs.readFileSync(appJsPath, "utf-8");

function sandboxMit(fetch) {
  const sandbox = {
    console, process, require,
    __dirname: path.join(__dirname, "../app"),
    sessionStorage: { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = String(v); } },
    window: { location: { pathname: "/app/" } },
    document: { readyState: "complete", addEventListener: () => {} },
    fetch,
    URL, URLSearchParams, AbortController,
    setTimeout: setTimeout, clearTimeout: clearTimeout
  };
  vm.createContext(sandbox);
  vm.runInContext(appJsCode + "\n;globalThis.__vk = { ladeEvents };", sandbox);
  return sandbox.__vk || {};
}

const CONFIG = {
  ort: "Böblingen", radiusKm: "25",
  apiurls: [{ name: "veranstaltungen", url: "https://proxy.opendatagermany.io/api/ts/v1/kg/sparql" }]
};

/* Nominatim ok; SPARQL-Antwort konfigurierbar */
function fetchMit(sparqlPayload) {
  return async (url) => {
    const u = String(url);
    if (u.includes("nominatim")) return { ok: true, status: 200, text: async () => JSON.stringify([{ lat: "48.6813", lon: "9.0086" }]) };
    return { ok: true, status: 200, text: async () => JSON.stringify(sparqlPayload) };
  };
}

async function runTests() {
  console.log("--- TEST: v1.2.4 D-6 (Antwortschema-Guard) ---");

  const valideAntwort = { results: { bindings: [
    { s: { value: "urn:z1" }, name: { value: "Konzert" }, startDatum: { value: "2026-10-01T19:30:00+02:00" }, typ: { value: "https://schema.org/MusicEvent" }, ortName: { value: "Halle" } }
  ] } };

  const hOk = sandboxMit(fetchMit(valideAntwort));
  const ok = await hOk.ladeEvents(CONFIG, undefined, { heuteKey: "2026-09-30" });
  assert.ok(ok && ok.zukunft.length === 1, "valide Antwort -> 1 zukunft-Event");
  console.log("  [1] Valide Struktur: normales Ergebnis");

  const faelle = [
    ["leeres Objekt", {}],
    ["results ohne bindings", { results: {} }],
    ["bindings kein Array", { results: { bindings: "kaputt" } }],
    ["bindings null", { results: { bindings: null } }]
  ];
  for (const [name, payload] of faelle) {
    const h = sandboxMit(fetchMit(payload));
    let fehler = null;
    try { await h.ladeEvents(CONFIG, undefined, { heuteKey: "2026-09-30" }); }
    catch (e) { fehler = e; }
    assert.ok(fehler, `Antwort mit ${name} wirft Fehler`);
    assert.ok(String(fehler.message).includes("Antwortformat"), `Fehlermeldung nennt Antwortformat (${name}): ${fehler.message}`);
  }
  console.log("  [2] Ungueltige Antwortstrukturen -> Fehler statt 'leeres Programm' (" + faelle.length + " Faelle)");

  console.log("--- ALLE v1.2.4-D6-TESTS GRÜN ---");
}

runTests().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
