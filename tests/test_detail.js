/*
 * Task-10-Tests: vkDetailHtml (reine Modal-Inhalts-Erzeugung).
 * Das Bootstrap-Mounting/Lightbox/ICS-Blob-Handling ist Browser-Verifikation.
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
    Intl, Date, AbortController, URL, URLSearchParams
  };
  vm.createContext(sandbox);
  vm.runInContext(appJsCode + "\n;globalThis.__vkExports = { vkDetailHtml };", sandbox);
  exp = sandbox.__vkExports || {};
} catch (e) { /* RED */ }

const vkDetailHtml = exp.vkDetailHtml;

const HEUTE = "2026-09-30";

function ev(extra) {
  return Object.assign({
    id: "urn:e1", name: "Serenade im Schlossgarten", beschreibung: "Klassik am Abend",
    bilder: ["https://example.org/b1.jpg"], url: "https://example.org/info", typ: "musik",
    startDatum: HEUTE, startZeit: "19:30", endDatum: HEUTE, endZeit: "21:00",
    ortName: "Schlosshof", adresse: "Schlossstraße 1, 71034 Böblingen",
    lat: 48.6813, lon: 9.0086, distanzKm: 1.2, kostenlos: true
  }, extra);
}

function test() {
  console.log("--- TEST: Task 10 (Detail-HTML) ---");
  assert.strictEqual(typeof vkDetailHtml, "function", "vkDetailHtml fehlt");
  console.log("  [0] vkDetailHtml vorhanden");

  const state = { appUid: "i1", heuteKey: HEUTE, configdata: {} };

  // (1) Vollausstattung: alle Felder
  const html = vkDetailHtml(state, ev());
  assert.ok(html.includes("Serenade im Schlossgarten"), "Titel");
  assert.ok(html.includes("Musik"), "Typ-Label");
  assert.ok(html.includes("30.09.2026"), "Datum de-DE formatiert");
  assert.ok(html.includes("19:30"), "Startzeit");
  assert.ok(html.includes("21:00"), "Endzeit");
  assert.ok(html.includes("Heute laufend"), "Heute-laufend-Hinweis");
  assert.ok(html.includes("Schlosshof"), "Ortsname");
  assert.ok(html.includes("Schlossstraße 1, 71034 Böblingen"), "Adresse");
  assert.ok(html.includes("1,2 km"), "Distanz");
  assert.ok(html.includes("https://www.openstreetmap.org/?mlat=48.6813"), "Route-Link lat");
  assert.ok(html.includes("mlon=9.0086"), "Route-Link lon");
  assert.ok(html.includes('rel="noopener"'), "externer Link rel=noopener");
  assert.ok(html.includes("Klassik am Abend"), "Beschreibung");
  assert.ok(html.includes("https://example.org/info"), "Veranstalter-Link");
  assert.ok(html.includes("data-vk-ics"), "ICS-Button");
  assert.ok(html.includes("In meinen Kalender"), "ICS-Button-Text");
  assert.ok(html.includes('data-vk-lightbox="1"'), "Bild ist Lightbox-auslöser");
  assert.ok(html.includes("https://example.org/b1.jpg"), "Bild-URL");
  assert.ok(html.includes("Kostenlos"), "Kostenlos-Hinweis (true)");
  console.log("  [1] Vollausstattung");

  // (2) Minimalfall: keine Beschreibung/URL/Geo/Ende/Kostenlos unbekannt
  const minHtml = vkDetailHtml(state, ev({
    beschreibung: null, url: null, bilder: [], lat: null, lon: null, distanzKm: null,
    adresse: null, endDatum: null, endZeit: null, kostenlos: null
  }));
  assert.ok(!minHtml.includes("Route planen"), "kein Route-Link ohne Geo");
  assert.ok(!minHtml.includes("vk-detail-beschreibung"), "kein Beschreibungsblock ohne Beschreibung");
  assert.ok(!minHtml.includes("https://example.org/info"), "kein Veranstalter-Link ohne url");
  assert.ok(!minHtml.includes("data-vk-lightbox"), "kein Lightbox ohne Bild");
  assert.ok(!minHtml.includes("21:00"), "keine Endzeit ohne endDatum");
  assert.ok(!minHtml.includes("Kostenlos"), "kein Kostenlos-Hinweis bei unbekannt");
  assert.ok(!minHtml.includes("undefined"), "kein undefined im Markup");
  console.log("  [2] Minimalfall: Fallbacks sauber");

  // (3) Escaping: Name und Ort mit HTML + javascript:-URL-Guard (Review-Fix 2)
  const xss = vkDetailHtml(state, ev({ name: '<img src=x onerror="1">', ortName: "<b>Klick</b>" }));
  assert.ok(!xss.includes("<img src=x"), "XSS im Titel escaped");
  assert.ok(xss.includes("&lt;img"), "escaped sichtbar");
  assert.ok(!xss.includes("<b>Klick</b>"), "Ort escaped");
  console.log("  [3] XSS escaped");

  // (3b) Review-Fix 2: daten-gelieferte url nur mit http(s)-Scheme
  const boeseUrl = vkDetailHtml(state, ev({ url: "javascript:alert(1)" }));
  assert.ok(!boeseUrl.includes('href="javascript:'), "javascript:-URL wird NICHT verlinkt");
  assert.ok(!boeseUrl.includes("Weitere Informationen"), "Link-Text weg bei boeser URL");
  const guteUrl = vkDetailHtml(state, ev({ url: "https://veranstalter.example/konzert" }));
  assert.ok(guteUrl.includes('href="https://veranstalter.example/konzert"'), "https-URL verlinkt");
  console.log("  [3b] safeHttpUrl-Guard fuer daten-gelieferte URLs");

  // (4) Läuft-Status: gestern gestartet, morgen beendet
  const laufend = vkDetailHtml(state, ev({ startDatum: "2026-09-28", endDatum: "2026-10-02", startZeit: "10:00", endZeit: null }));
  assert.ok(laufend.includes("Läuft noch bis"), "Laufend-Hinweis mit Enddatum");
  console.log("  [4] Laufend-Status");

  console.log("--- ALLE TASK-10-TESTS GRÜN ---");
}

test();
