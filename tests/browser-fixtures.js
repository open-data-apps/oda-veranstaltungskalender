/*
 * tests/browser-fixtures.js – Installiert synthetische Relay-/Nominatim-Antworten
 * für den Veranstaltungskalender (Muster: oda-gastrofinder/tests/browser-fixtures.js).
 *
 * Nutzung nur auf einem dedizierten Fixture-Host (lokaler Live Server erlaubt):
 *   await installVkFixture("success")   // Modi: success | empty | error | html-200 | xss | offline
 *   window.vkFixtureResult              // { mode, requests, unexpected, errors }
 *   uninstallVkFixture()
 *
 * Erlaubte abgefängte Ziele: Nominatim (Geocoding) und der ODAS-DZT-Relay (/dzt?path=).
 * OSM-Kacheln (tile.openstreetmap.org) laufen durch. Alles andere landet in
 * `unexpected` und wird blockiert – insbesondere direkte DZT-Host-Kontakte und /odp-data.
 */
(function installVkFixtureTool() {
  "use strict";

  let vkOriginalFetch = null;
  let vkFixtureTransportInstalledBeforeApp = false;

  function vkResponse(body, status, contentType) {
    return new Response(body, {
      status: status || 200,
      headers: { "Content-Type": contentType || "application/json" }
    });
  }

  function installVkFixtureTransport(mode) {
    const aktiverModus = mode || "success";
    if (!vkOriginalFetch) vkOriginalFetch = window.fetch.bind(window);
    if (window.__vkFixtureTransportInstalledBeforeApp === undefined) {
      window.__vkFixtureTransportInstalledBeforeApp = typeof window.app !== "function";
    }
    vkFixtureTransportInstalledBeforeApp = vkFixtureTransportInstalledBeforeApp || window.__vkFixtureTransportInstalledBeforeApp;
    const result = {
      mode: aktiverModus,
      requests: [],
      unexpected: window.__vkFixtureUnexpected || (window.__vkFixtureUnexpected = []),
      errors: [],
      transportInstalledBeforeApp: vkFixtureTransportInstalledBeforeApp
    };

    window.fetch = async function vkFixtureFetch(input, init) {
      const url = String((input && input.url) || input);
      const pathname = new URL(url, window.location.href).pathname;
      /* Local ODAS config is intentionally fetched from the fixture host. */
      if (/(?:^|\/)odas-config\/config\.json$/.test(pathname)) return vkOriginalFetch(input, init);
      result.requests.push(url);

      if (url.indexOf("tile.openstreetmap.org") !== -1) {
        return vkOriginalFetch(input, init); /* OSM tiles are intentionally real */
      }
      if (aktiverModus === "offline") {
        throw new TypeError("Failed to fetch"); /* App should handle the expected network failure */
      }

      if (url.indexOf("nominatim") !== -1) {
        return vkResponse(JSON.stringify([{ lat: "48.6813", lon: "9.0086", display_name: "Böblingen (Fixture)" }]));
      }

      if (url.indexOf("/dzt?path=") !== -1) {
        if (aktiverModus === "error") return vkResponse("{}", 500, "application/json");
        if (aktiverModus === "html-200") return vkResponse("<html><body>Login-Fehlerseite</body></html>", 200, "text/html");
        const relayPath = new URL(url, window.location.href).searchParams.get("path");
        const query = new URL(relayPath, "https://dzt.invalid/").searchParams.get("query") || "";
        if (query.includes("con:totalHits")) {
          return vkResponse(JSON.stringify({ head: { vars: ["vkGeoTotal"] }, results: { bindings: [{
            vkGeoTotal: { type: "literal", datatype: "http://www.w3.org/2001/XMLSchema#long", value: aktiverModus === "empty" ? "0" : "42" }
          }] } }), 200, "application/sparql-results+json");
        }
        const welche = query.includes("LIMIT 400") ? "archiv" : "zukunft";
        return vkResponse(JSON.stringify(vkSparqlAntwort(welche, aktiverModus)), 200, "application/sparql-results+json");
      }

      result.unexpected.push(url);
      throw new Error('Unerwarteter Fixture-Abruf: ' + url);
    };

    window.vkFixtureResult = result;
    return result;
  }

  function installVkFixture(mode) {
    const result = installVkFixtureTransport(mode);
    const root = document.getElementById("main-content");

    if (typeof onPageLeave === "function") onPageLeave("startseite");
    if (typeof vkDatenCache !== "undefined") vkDatenCache.clear();

    const fixtureConfig = Object.assign({}, window.configData, {
      titel: "Veranstaltungskalender",
      seitentitel: "Veranstaltungskalender · Fixture",
      ort: "Böblingen",
      radiusKm: "25",
      apiurls: [{ name: "veranstaltungen", label: "SPARQL-Endpunkt", url: "https://proxy.opendatagermany.io/api/ts/v1/kg/sparql" }],
      datenquelleHinweis: "<p>Fixture-Methodik: Diese Instanz zeigt <strong>synthetische Testdaten</strong>, keine Live-Daten.</p>",
      datenStand: "Stand: Fixture-Daten · kein Live-Abruf",
      fusszeile: "© 2026 | App und Daten: Fixture-Betreiber | Entwicklung: Fixture-Entwicklung | ODAS: Open Data App Store",
      weiterfuehrendeLinks: '<ul><li><a href="https://open-data-germany.org/knowledge-graphen/" target="_blank" rel="noopener">DZT Knowledge Graph</a></li></ul>',
      kpiKontext1: "Fixture: Veranstaltungen im gewählten Zeitraum.",
      kpiKontext2: "",
      kpiKontext3: "Fixture: Veranstaltungen am Wochenende."
    });

    try {
      app(fixtureConfig, root);
    } catch (e) {
      result.errors.push(String((e && e.message) || e));
    }

    window.vkFixtureResult = result;
    return result;
  }

  function uninstallVkFixture() {
    if (vkOriginalFetch) {
      window.fetch = vkOriginalFetch;
      vkOriginalFetch = null;
    }
    vkFixtureTransportInstalledBeforeApp = false;
    delete window.__vkFixtureTransportInstalledBeforeApp;
    window.vkFixtureResult = null;
    if (typeof onPageLeave === "function") onPageLeave("startseite");
  }

  window.installVkFixtureTransport = installVkFixtureTransport;
  window.installVkFixture = installVkFixture;
  window.uninstallVkFixture = uninstallVkFixture;
})();
