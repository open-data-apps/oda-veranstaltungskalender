/*
 * Task-5-Tests: Relay-Fetch, Geocoding, ladeEvents-Guard, drei Datenzustände.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appJsPath = path.join(__dirname, "../app/app.js");
const appJsCode = fs.readFileSync(appJsPath, "utf-8");

function appSandbox(mit) {
  const sandbox = {
    console, process, require,
    __dirname: path.join(__dirname, "../app"),
    sessionStorage: { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = String(v); } },
    window: { location: { pathname: mit.pathname || "/app/" } },
    document: { readyState: "complete", addEventListener: () => {} },
    fetch: mit.fetch,
    URL: URL,
    URLSearchParams: URLSearchParams,
    AbortController: AbortController,
    setTimeout: setTimeout, clearTimeout: clearTimeout /* v1.2.5: vkZeitlimitFetch (D-5) */
  };
  vm.createContext(sandbox);
  vm.runInContext(
    appJsCode +
      "\n;globalThis.__vkExports = { getOdasAppBasePath, dztApiPath, getOdasApiUrl, fetchKgJson, geocodeOrt, ladeEvents };",
    sandbox
  );
  return sandbox.__vkExports || {};
}

async function runTests() {
  console.log("--- TEST: Task 5 (Relay/Geocoding/Guards) ---");

  // (1) Pfad-Helfer
  const h = appSandbox({});
  assert.strictEqual(typeof h.getOdasAppBasePath, "function", "getOdasAppBasePath fehlt");
  assert.strictEqual(h.getOdasAppBasePath("/app/"), "/app", "/app/ -> /app");
  assert.strictEqual(h.getOdasAppBasePath("/app"), "/app", "/app -> /app");
  assert.strictEqual(h.getOdasAppBasePath("/app/index.html"), "/app", "index.html wird entfernt");
  assert.strictEqual(h.getOdasAppBasePath("/p/xyz/app/"), "/p/xyz/app", "geschachtelte Pfade bleiben");
  assert.strictEqual(h.dztApiPath("https://proxy.opendatagermany.io/api/ts/v1/kg/sparql"), "ts/v1/kg/sparql", "dztApiPath strippt /api/");
  assert.strictEqual(h.dztApiPath(""), "", "dztApiPath leer");
  assert.strictEqual(h.getOdasApiUrl({ apiurls: [{ name: "veranstaltungen", url: "https://x.de/api" }] }, "veranstaltungen"), "https://x.de/api", "apiurls-Aufloesung");
  assert.strictEqual(h.getOdasApiUrl({ apiurls: [] }, "veranstaltungen"), "", "fehlender Eintrag -> leer");
  assert.strictEqual(h.getOdasApiUrl({}, "veranstaltungen"), "", "ohne apiurls -> leer");
  console.log("  [1] Pfad-/apiurls-Helfer (wanderwege-Muster)");

  // (2) fetchKgJson: HTML-Antwort -> klare Fehlermeldung; JSON -> Objekt
  const fetchHtml = async () => ({ ok: true, status: 200, text: async () => "<html><body>Login</body></html>" });
  const h2 = appSandbox({ fetch: fetchHtml });
  let htmlFehler = null;
  try { await h2.fetchKgJson("ts/v1/kg/sparql?query=SELECT"); } catch (e) { htmlFehler = e; }
  assert.ok(htmlFehler, "HTML-Antwort wirft");
  assert.ok(String(htmlFehler.message).includes("kein JSON"), "Fehlermeldung nennt 'kein JSON': " + htmlFehler.message);
  assert.ok(String(htmlFehler.message).includes("Instanz-Konfiguration"), "Fehlermeldung verweist auf Konfiguration");
  console.log("  [2] fetchKgJson: HTML -> Fehlermeldung mit Hinweis (kein JSON.parse-Crash)");

  const jsonPayload = { results: { bindings: [{ s: { value: "urn:e1" }, name: { value: "Testkonzert" } }] } };
  let gefetchteUrl = null;
  const fetchJson = async (url) => { gefetchteUrl = url; return { ok: true, status: 200, text: async () => JSON.stringify(jsonPayload) }; };
  const h3 = appSandbox({ fetch: fetchJson });
  const obj = await h3.fetchKgJson("ts/v1/kg/sparql?query=SELECT%201");
  assert.deepStrictEqual(obj && obj.results.bindings.length, 1, "JSON-Antwort geparst");
  assert.ok(gefetchteUrl.includes("/dzt?path="), "Relay-Pfad /dzt?path= benutzt");
  assert.ok(gefetchteUrl.startsWith("/app/dzt?path="), "Basispfad aus window.location");
  assert.ok(gefetchteUrl.includes(encodeURIComponent("ts/v1/kg/sparql?query=SELECT%201")), "path ist URL-encodiert");
  console.log("  [3] fetchKgJson: JSON ok, Relay-URL-Aufbau korrekt");

  // (3) geocodeOrt: Nominatim ok / leer / Fehler
  const fetchNominatim = async (url) => {
    if (String(url).includes("nominatim")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([{ lat: "48.6813", lon: "9.0086" }]) };
    }
    throw new Error("unerwarteter Fetch: " + url);
  };
  const h4 = appSandbox({ fetch: fetchNominatim });
  const geo = await h4.geocodeOrt("Böblingen");
  assert.ok(geo && Math.abs(geo.lat - 48.6813) < 1e-9, "geocodeOrt lat");
  assert.ok(geo && Math.abs(geo.lon - 9.0086) < 1e-9, "geocodeOrt lon");
  const fetchNominatimLeer = async (url) => ({ ok: true, status: 200, text: async () => "[]" });
  const h5 = appSandbox({ fetch: fetchNominatimLeer });
  assert.strictEqual(await h5.geocodeOrt("Gibt es nicht"), null, "kein Treffer -> null");
  console.log("  [4] geocodeOrt: Nominatim-Treffer/Leer");

  // (4) ladeEvents: Guard (keine Quelle) -> null, kein fetch
  let fetchAufrufe = 0;
  const fetchZaehler = async () => { fetchAufrufe++; return { ok: true, text: async () => "{}" }; };
  const h6 = appSandbox({ fetch: fetchZaehler });
  const ohnetSrc = await h6.ladeEvents({ ort: "Böblingen" });
  assert.strictEqual(ohnetSrc, null, "ladeEvents ohne apiurls -> null");
  assert.strictEqual(fetchAufrufe, 0, "kein fetch ohne Quelle (Guard gegen fetch(\"\"))");
  console.log("  [5] ladeEvents-Guard: keine Quelle -> null, kein fetch");

  // (5) ladeEvents: Geocoding, Geo-Vollstaendigkeit, dann 2 parallele Event-Abfragen
  const sparqlAntworten = { zukunft: { results: { bindings: [
    { s: { value: "urn:z1" }, name: { value: "Zukunfts-Konzert" }, startDatum: { value: "2026-10-01T19:30:00+02:00" }, typ: { value: "https://schema.org/MusicEvent" }, ortName: { value: "Halle" } }
  ]}}, archiv: { results: { bindings: [
    { s: { value: "urn:a1" }, name: { value: "Konzert im Mai" }, startDatum: { value: "2026-05-01T20:00:00+02:00" }, typ: { value: "https://schema.org/MusicEvent" }, ortName: { value: "Halle" } },
    { s: { value: "urn:a2" }, name: { value: "Konzert im Juni" }, startDatum: { value: "2026-06-15T20:00:00+02:00" }, typ: { value: "https://schema.org/MusicEvent" }, ortName: { value: "Halle" } }
  ]}} };
  const gefetchteUrls = [];
  const fetchVoll = async (url) => {
    const u = String(url);
    gefetchteUrls.push(u);
    if (u.includes("nominatim")) return { ok: true, status: 200, text: async () => JSON.stringify([{ lat: "48.6813", lon: "9.0086" }]) };
    const relayPath = new URL(u, "http://localhost").searchParams.get("path");
    const query = new URL(relayPath, "https://dzt.invalid/").searchParams.get("query");
    const payload = query.includes("con:totalHits")
      ? { head: { vars: ["vkGeoTotal"] }, results: { bindings: [{ vkGeoTotal: { type: "literal", datatype: "http://www.w3.org/2001/XMLSchema#long", value: "2" } }] } }
      : query.includes("LIMIT 400") ? sparqlAntworten.archiv : sparqlAntworten.zukunft;
    const text = async () => JSON.stringify(payload);
    return { ok: true, status: 200, text };
  };
  const h7 = appSandbox({ fetch: fetchVoll });
  const ergebnis = await h7.ladeEvents({
    ort: "Böblingen", radiusKm: "25",
    apiurls: [{ name: "veranstaltungen", url: "https://proxy.opendatagermany.io/api/ts/v1/kg/sparql" }]
  }, undefined, { heuteKey: "2026-09-30" });
  assert.ok(ergebnis && Array.isArray(ergebnis.zukunft) && Array.isArray(ergebnis.archiv), "Ergebnisform {zukunft, archiv}");
  assert.strictEqual(ergebnis.zukunft.length, 1, "1 zukunft");
  assert.strictEqual(ergebnis.zukunft[0].name, "Zukunfts-Konzert");
  assert.strictEqual(ergebnis.archiv.length, 2, "2 archiv");
  assert.strictEqual(ergebnis.archiv[0].name, "Konzert im Juni", "archiv absteigend (neuestes zuerst)");
  assert.strictEqual(ergebnis.archiv[1].name, "Konzert im Mai", "archiv aeltestes hinten");
  assert.ok(Math.abs(ergebnis.geo.lat - 48.6813) < 1e-9, "geo im Ergebnis");
  const relayAnfragen = gefetchteUrls.filter((u) => u.includes("/dzt?path="));
  assert.strictEqual(relayAnfragen.length, 3, "Geo-Trefferzahl und zwei Event-Abfragen");
  assert.ok(gefetchteUrls.some((u) => u.includes("nominatim")), "ein Nominatim-Request");
  console.log("  [6] ladeEvents: Geocoding + Geo-Pruefung + 2 parallele Event-Abfragen + Parse/Split");

  // (6) ladeEvents: Geocoding-Fehler -> Klartext-Fehler
  const h8 = appSandbox({ fetch: fetchNominatimLeer });
  let geoFehler = null;
  try { await h8.ladeEvents({ ort: "Nirgendwo", apiurls: [{ name: "veranstaltungen", url: "https://x/api" }] }); } catch (e) { geoFehler = e; }
  assert.ok(geoFehler && String(geoFehler.message).includes("Nirgendwo"), "Fehlermeldung nennt den Ort");
  console.log("  [7] ladeEvents: Geocoding-Fehler -> Klartext");

  // (8) Review-Fix 9: AbortController bricht laufende Requests ab (AbortError propagiert)
  const fetchAbortBewusst = async (url, init) => {
    if (init && init.signal && init.signal.aborted) {
      const fehler = new Error("The operation was aborted");
      fehler.name = "AbortError";
      throw fehler;
    }
    return { ok: true, status: 200, text: async () => "{}" };
  };
  const h9 = appSandbox({ fetch: fetchAbortBewusst });
  const controller = new AbortController();
  controller.abort();
  let abbruchFehler = null;
  try { await h9.ladeEvents({ ort: "Böblingen", apiurls: [{ name: "veranstaltungen", url: "https://x/api" }] }, controller.signal); } catch (e) { abbruchFehler = e; }
  assert.ok(abbruchFehler && abbruchFehler.name === "AbortError", "vorzeitig abgebrochen -> AbortError (kein partieller State)");
  console.log("  [8] Abort-Signal bricht ladeEvents sauber ab");

  console.log("--- ALLE TASK-5-TESTS GRÜN ---");
}

runTests().catch((e) => { console.error(e.message); process.exit(1); });
