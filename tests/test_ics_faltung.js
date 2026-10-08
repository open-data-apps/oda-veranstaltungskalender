/*
 * v1.2.5 D-7: ICS-Zeilenfaltung nach RFC 5545 – Zeilen max. 75 Oktette
 * (UTF-8), Folgezeilen beginnen mit einem Leerzeichen; Entfaltung ergibt
 * das Original. Orakel unabhaengig: Byte-Zaehlung im Test selbst.
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
    document: { readyState: "complete", addEventListener: () => {} },
    Intl, Date, URL, URLSearchParams, AbortController,
    TextEncoder: TextEncoder
  };
  vm.createContext(sandbox);
  vm.runInContext(appJsCode + "\n;globalThis.__e = { vkFaldeIcsZeile, buildIcs };", sandbox);
  exp = sandbox.__e || {};
} catch (e) { /* RED */ }

const oktetten = (s) => new TextEncoder().encode(s).length; /* unabhaengiges Orakel */

async function runTests() {
  console.log("--- TEST: v1.2.5 D-7 (ICS-Zeilenfaltung) ---");
  const falde = exp.vkFaldeIcsZeile;
  assert.strictEqual(typeof falde, "function", "vkFaldeIcsZeile fehlt");
  console.log("  [0] vkFaldeIcsZeile vorhanden");

  assert.strictEqual(falde("SUMMARY:Kurzer Titel"), "SUMMARY:Kurzer Titel", "kurze Zeile unveraendert");
  assert.strictEqual(falde("END:VEVENT"), "END:VEVENT", "Strukturzeilen unberuehrt");
  console.log("  [1] Kurze Zeilen bleiben unangetastet");

  const umlautZeile = "SUMMARY:" + "Äöü Konzert der Städte mit Größenordnung ".repeat(3);
  const gefaltet = falde(umlautZeile);
  const teile = gefaltet.split("\r\n");
  assert.ok(teile.length > 1, "lange Zeile wird gefaltet (" + teile.length + " Teile)");
  teile.forEach((t, i) => {
    assert.ok(oktetten(t) <= 75, `Teil ${i} <= 75 Oktette (hat ${oktetten(t)})`);
    if (i > 0) assert.ok(t.startsWith(" "), `Folgezeile ${i} beginnt mit Leerzeichen`);
  });
  const entfaltet = gefaltet.split("\r\n").join("").replace(/^ /gm, "");
  /* RFC-Entfaltung: CRLF+Space entfernen */
  const entfaltet2 = gefaltet.replace(/\r\n /g, "");
  assert.strictEqual(entfaltet2, umlautZeile, "Entfaltung ergibt das Original");
  console.log("  [2] Umlaut-Zeile: alle Teile <= 75 Oktette, Entfaltung verlustfrei");

  const ics = exp.buildIcs({
    id: "ev-1", name: "Sehr langer Veranstaltungstitel mit vielen deutschen Umlauten wie Äöü und einer ausführlichen Beschreibung im Betreff " + "sowie weiterem Text ".repeat(6),
    startDatum: "2026-10-01", startZeit: "19:30",
    ortName: "Festhalle mit ausführlichem Adressezusatz Römergasse 12, 71032 Böblingen",
    beschreibung: "Beschreibung ".repeat(30)
  }, "https://example.org/event");
  ics.split("\r\n").forEach((z, i) => {
    assert.ok(oktetten(z) <= 75, `ICS-Zeile ${i} <= 75 Oktette (hat ${oktetten(z)}): ${z.slice(0, 40)}…`);
  });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR"), "ICS-Struktur bleibt");
  console.log("  [3] buildIcs: gesamte Datei RFC-5545-gefalteen (jede Zeile <= 75 Oktette)");

  console.log("--- ALLE v1.2.5-D7-TESTS GRÜN ---");
}

runTests().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
