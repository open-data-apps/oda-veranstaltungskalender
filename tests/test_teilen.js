/*
 * v1.3.0-Tests: Teilen-Bausteine (reine Funktionen).
 * vkTeilenLink, vkTeilenText, vkTeilenNachricht, vkTeilenZiele, vkGeteilteEventId, vkTeilenHtml.
 * Das Verdrahten im Browser (Kopieren, Gerätemenü) ist Browser-Verifikation.
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
  vm.runInContext(
    appJsCode +
      "\n;globalThis.__vkExports = { vkTeilenLink, vkTeilenText, vkTeilenNachricht, vkTeilenZiele, vkGeteilteEventId, vkTeilenHtml };",
    sandbox
  );
  exp = sandbox.__vkExports || {};
} catch (e) { /* RED */ }

const { vkTeilenLink, vkTeilenText, vkTeilenNachricht, vkTeilenZiele, vkGeteilteEventId, vkTeilenHtml } = exp;

/*
 * Rueckfall des Kopierens: Auch wenn Auswahl oder Kopierbefehl werfen, darf
 * kein Hilfselement im DOM zurueckbleiben (Review-Befund 2026-10-01).
 */
function baueKopierSandbox(verhalten) {
  const kinder = [];
  let bodyAufrufe = 0;
  const sandbox = {
    console, process, require,
    __dirname: path.join(__dirname, "../app"),
    sessionStorage: { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = String(v); } },
    window: { location: { pathname: "/app/" } },
    document: {
      readyState: "complete", addEventListener: () => {}, getElementById: () => null, querySelectorAll: () => [],
      createElement: () => ({
        value: "", style: {}, setAttribute() {},
        select() { if (verhalten.selectWirft) throw new Error("select"); }
      }),
      execCommand: () => { if (verhalten.kopierenWirft) throw new Error("execCommand"); return verhalten.ergebnis; },
      body: {
        appendChild: (el) => { bodyAufrufe++; kinder.push(el); },
        removeChild: (el) => { const i = kinder.indexOf(el); if (i >= 0) kinder.splice(i, 1); }
      }
    },
    navigator: {},
    Intl, Date, AbortController, URL, URLSearchParams
  };
  vm.createContext(sandbox);
  vm.runInContext(appJsCode + "\n;globalThis.__vkExports = { vkKopiereLink };", sandbox);
  return { kopiere: sandbox.__vkExports.vkKopiereLink, kinder, bodyAufrufe: () => bodyAufrufe };
}

function baueBehaelter() {
  const kinder = [];
  return {
    kinder,
    appendChild(el) { kinder.push(el); },
    removeChild(el) { const i = kinder.indexOf(el); if (i >= 0) kinder.splice(i, 1); }
  };
}

async function testKopierRueckfall() {
  console.log("  [8] Kopier-Rueckfall raeumt auch im Fehlerfall auf");
  const erfolg = baueKopierSandbox({ ergebnis: true, selectWirft: false, kopierenWirft: false });
  assert.strictEqual(await erfolg.kopiere("https://h/?event=e1"), true, "Kopieren meldet Erfolg");
  assert.strictEqual(erfolg.kinder.length, 0, "Erfolgsfall laesst kein Element zurueck");

  const kopierenWirft = baueKopierSandbox({ ergebnis: false, selectWirft: false, kopierenWirft: true });
  assert.strictEqual(await kopierenWirft.kopiere("https://h/?event=e1"), false, "werfender Kopierbefehl meldet Misserfolg");
  assert.strictEqual(kopierenWirft.kinder.length, 0, "werfender Kopierbefehl laesst kein Element zurueck");

  const auswahlWirft = baueKopierSandbox({ ergebnis: false, selectWirft: true, kopierenWirft: false });
  assert.strictEqual(await auswahlWirft.kopiere("https://h/?event=e1"), false, "werfende Auswahl meldet Misserfolg");
  assert.strictEqual(auswahlWirft.kinder.length, 0, "werfende Auswahl laesst kein Element zurueck");

  const leer = baueKopierSandbox({ ergebnis: true, selectWirft: false, kopierenWirft: false });
  assert.strictEqual(await leer.kopiere(""), false, "leerer Text meldet Misserfolg");
  assert.strictEqual(leer.kinder.length, 0, "leerer Text laesst kein Element zurueck");

  /* Ohne Behaelter wird document.body benutzt (Vorgabe). */
  const ohneBehaelter = baueKopierSandbox({ ergebnis: true, selectWirft: false, kopierenWirft: false });
  assert.strictEqual(await ohneBehaelter.kopiere("https://h/?event=e1"), true, "ohne Behaelter: Erfolg");
  assert.strictEqual(ohneBehaelter.bodyAufrufe(), 1, "ohne Behaelter wird document.body benutzt");

  /* Bug 2026-10-01: Im Bootstrap-Modal reisst die Fokusfalle den Fokus aus einem
   * Hilfselement an document.body. Der Kopierbefehl meldet dann Erfolg, kopiert
   * aber nichts. Deshalb muss das Element in den uebergebenen Behaelter. */
  const mitBehaelter = baueKopierSandbox({ ergebnis: true, selectWirft: false, kopierenWirft: false });
  const behaelter = baueBehaelter();
  assert.strictEqual(await mitBehaelter.kopiere("https://h/?event=e1", behaelter), true, "mit Behaelter: Erfolg");
  assert.strictEqual(mitBehaelter.bodyAufrufe(), 0, "document.body wird bei uebergebenem Behaelter nicht benutzt");
  assert.strictEqual(behaelter.kinder.length, 0, "Behaelter ist danach wieder leer");

  const behaelterWirft = baueKopierSandbox({ ergebnis: false, selectWirft: true, kopierenWirft: false });
  const behaelter2 = baueBehaelter();
  assert.strictEqual(await behaelterWirft.kopiere("https://h/?event=e1", behaelter2), false, "werfende Auswahl im Behaelter");
  assert.strictEqual(behaelter2.kinder.length, 0, "auch im Fehlerfall bleibt der Behaelter leer");
  assert.strictEqual(behaelterWirft.bodyAufrufe(), 0, "body bleibt auch im Fehlerfall unberuehrt");
}

async function test() {
  console.log("--- TEILEN-BAUSTEINE ---");

  console.log("  [1] Funktionen vorhanden");
  ["vkTeilenLink", "vkTeilenText", "vkTeilenNachricht", "vkTeilenZiele", "vkGeteilteEventId", "vkTeilenHtml"].forEach((n) => {
    assert.strictEqual(typeof exp[n], "function", `${n} fehlt`);
  });

  console.log("  [2] Link bauen: Parameter setzen, andere behalten, Hash entfernen");
  assert.strictEqual(
    vkTeilenLink("https://h/app/?x=1#startseite", "urn:e1"),
    "https://h/app/?x=1&event=urn%3Ae1",
    "Parameter gesetzt, anderer Parameter behalten, Hash entfernt"
  );
  assert.strictEqual(
    vkTeilenLink("https://h/app/?event=alt", "neu"),
    "https://h/app/?event=neu",
    "vorhandener event-Parameter wird ersetzt, nicht doppelt angehaengt"
  );
  assert.strictEqual(vkTeilenLink("", "urn:e1"), "", "leere Basis -> leerer Link");
  assert.strictEqual(vkTeilenLink("kein-url", "urn:e1"), "", "ungueltige Basis -> leerer Link");
  assert.strictEqual(vkTeilenLink("https://h/app/", ""), "", "fehlende Kennung -> leerer Link");

  console.log("  [3] Nachrichtentext: eintaegig / mehrtraegig / ohne Ort");
  assert.strictEqual(
    vkTeilenText({ name: "Sommerfest", startDatum: "2026-08-15", endDatum: "2026-08-15", ortName: "Boeblingen" }),
    "Sommerfest\n15.08.2026 · Boeblingen",
    "eintaegig mit Ort"
  );
  assert.strictEqual(
    vkTeilenText({ name: "Messe", startDatum: "2026-04-01", endDatum: "2026-10-31", ortName: "" }),
    "Messe\n01.04.2026 – 31.10.2026",
    "mehrtraegig ohne Ort"
  );
  assert.strictEqual(
    vkTeilenText({ name: "Vortrag", startDatum: "2026-08-15", ortName: "   " }),
    "Vortrag\n15.08.2026",
    "fehlendes endDatum und leerer Ort"
  );
  assert.strictEqual(
    vkTeilenNachricht({ name: "Vortrag", startDatum: "2026-08-15", ortName: "Stuttgart" }, "https://h/app/?event=e1"),
    "Vortrag\n15.08.2026 · Stuttgart\nhttps://h/app/?event=e1",
    "Nachricht = Text + Link"
  );

  console.log("  [4] Kanaele: Kodierung und E-Mail-Betreff");
  const ziele = vkTeilenZiele(
    { name: "Café & Co", startDatum: "2026-08-15", ortName: "Böblingen" },
    "https://h/app/?event=urn%3Ae1"
  );
  const wa = ziele.find((z) => z.key === "whatsapp");
  const mail = ziele.find((z) => z.key === "email");
  const x = ziele.find((z) => z.key === "x");
  assert.ok(wa && mail && x, "WhatsApp-, X- und E-Mail-Ziel vorhanden");
  assert.ok(wa.href.startsWith("https://wa.me/?text="), "WhatsApp-Adresse");
  assert.ok(wa.href.includes("Caf%C3%A9%20%26%20Co"), "Umlaut und kaufmaennisches Und kodiert");
  assert.ok(wa.href.includes("B%C3%B6blingen"), "Ortsumlaut kodiert");
  assert.ok(wa.href.includes("https%3A%2F%2Fh%2Fapp%2F%3Fevent%3Durn%253Ae1"), "Link im Text kodiert");
  assert.ok(x.href.startsWith("https://x.com/intent/post?text="), "X-Adresse");
  assert.ok(x.href.includes("Caf%C3%A9%20%26%20Co"), "X: Name kodiert");
  assert.ok(x.href.includes("https%3A%2F%2Fh%2Fapp%2F%3Fevent%3Durn%253Ae1"), "X: Link im Text kodiert");
  assert.ok(mail.href.startsWith("mailto:?subject=Caf%C3%A9%20%26%20Co&body="), "E-Mail-Betreff ist der Veranstaltungsname");
  assert.ok(ziele.every((z) => z.label && z.aria), "jedes Ziel hat Label und sprechenden Namen");

  console.log("  [5] Parameter auslesen");
  assert.strictEqual(vkGeteilteEventId("?event=urn%3Ae1"), "urn:e1", "kodierte Kennung");
  assert.strictEqual(vkGeteilteEventId("?a=1&event=e1"), "e1", "Kennung zwischen anderen Parametern");
  assert.strictEqual(vkGeteilteEventId(""), "", "kein Parameter -> leer");
  assert.strictEqual(vkGeteilteEventId("?event="), "", "leerer Wert -> leer");
  assert.strictEqual(vkGeteilteEventId("?event=   "), "", "nur Leerzeichen -> leer");
  assert.strictEqual(vkGeteilteEventId(null), "", "null -> leer (nicht der Text \"null\")");

  console.log("  [6] Attribut-Sicherheit: fremder Name bricht das Markup nicht auf");
  const boeseName = 'x" onmouseover="alert(1)<b>&';
  const boese = vkTeilenZiele({ name: boeseName, startDatum: "2026-08-15", ortName: "" }, "https://h/app/?event=e1");
  assert.ok(!boese.some((z) => /["<>]/.test(z.href)), "Adresse enthaelt keine Attribut-Brecher");
  const html = vkTeilenHtml({ name: boeseName, startDatum: "2026-08-15", ortName: "" }, "https://h/app/?event=e1", false);
  /* Der Name darf ausschliesslich prozentkodiert in die Adressen gelangen. */
  assert.ok(html.includes(encodeURIComponent(boeseName)), "Name liegt prozentkodiert in der Adresse");
  assert.ok(!html.includes(boeseName), "Name erscheint nicht roh im Markup");
  assert.ok(!html.includes('" onmouseover="'), "keine rohe Attribut-Injektion");
  assert.ok(!html.includes("<b>"), "keine rohen spitzen Klammern im Markup");
  assert.ok(html.includes("%22"), "Anfuehrungszeichen in der Adresse kodiert");

  console.log("  [7] Reihe ohne Link entfaellt; Schaltflaechensatz je Geraetefaehigkeit");
  assert.strictEqual(vkTeilenHtml({ name: "A", startDatum: "2026-08-15" }, "", false), "", "ohne Link kein Markup");
  assert.strictEqual(vkTeilenHtml({ name: "A", startDatum: "2026-08-15" }, "", true), "", "ohne Link kein Markup (nativ)");
  const mitGeraet = vkTeilenHtml({ name: "A", startDatum: "2026-08-15" }, "https://h/?event=e1", true);
  assert.ok(mitGeraet.includes("data-vk-teilen-native"), "Geraetemenue-Schaltflaeche vorhanden");
  assert.ok(mitGeraet.includes("wa.me"), "feste Wege bleiben auch mit Geraetemenue sichtbar");
  assert.ok(mitGeraet.includes("x.com/intent/post"), "X bleibt auch mit Geraetemenue sichtbar");
  assert.ok(mitGeraet.includes("mailto:"), "E-Mail bleibt auch mit Geraetemenue sichtbar");
  assert.ok(mitGeraet.includes("data-vk-teilen-kopieren"), "Kopier-Schaltflaeche vorhanden");
  const ohneGeraet = vkTeilenHtml({ name: "A", startDatum: "2026-08-15" }, "https://h/?event=e1", false);
  assert.ok(ohneGeraet.includes("wa.me"), "WhatsApp als fester Weg");
  assert.ok(ohneGeraet.includes("x.com/intent/post"), "X als fester Weg");
  assert.ok(ohneGeraet.includes("mailto:"), "E-Mail als fester Weg");
  assert.ok(ohneGeraet.includes("data-vk-teilen-kopieren"), "Kopier-Schaltflaeche vorhanden");
  assert.ok(!ohneGeraet.includes("data-vk-teilen-native"), "keine Geraetemenue-Schaltflaeche");
  assert.ok(ohneGeraet.includes('role="status"'), "Statuszeile fuer Screenreader");
  assert.ok(ohneGeraet.includes('aria-live="polite"'), "Statuszeile wird angesagt");
  assert.ok(ohneGeraet.includes("Teilen"), "Beschriftung der Reihe");

  await testKopierRueckfall();

  console.log("--- ALLE TEILEN-BAUSTEINE GRÜN ---");
}

test().catch((e) => { console.error(e); process.exit(1); });
