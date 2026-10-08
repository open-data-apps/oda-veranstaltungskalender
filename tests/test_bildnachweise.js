/*
 * v1.4.5: Bildnachweise bleiben bildgenau, erscheinen aber erst im Detail.
 * Faengt vertauschte Credits, erfundene Lizenzen, verlorene Sonderzeichen,
 * unsichere Links und unerwuenschte Nachweiszeilen in Uebersichten ab.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const code = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
const angehaengt = [];
const sandbox = {
  console, URL, URLSearchParams, Intl, Date, AbortController,
  window: { location: { href: "http://127.0.0.1:8765/app/", pathname: "/app/" } },
  document: {
    readyState: "complete", addEventListener() {}, removeEventListener() {},
    body: { appendChild(element) { angehaengt.push(element); } },
    createElement() {
      return { setAttribute() {}, addEventListener() {}, querySelector() { return { focus() {} }; }, remove() {} };
    }
  }
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const state = { appUid: "credits", heuteKey: "2026-10-02", configdata: {}, dom: {} };
const event = {
  id: "urn:credit-event", name: "Ausstellung", bilder: ["https://example.org/b1.jpg", "https://example.org/b2.jpg"],
  bildnachweise: [
    { url: "https://example.org/b2.jpg", titel: "Zweites Bild", lizenz: "https://creativecommons.org/publicdomain/zero/1.0/", copyright: "", urheber: "" },
    { url: "https://example.org/b1.jpg", titel: "Motiv | a;b", lizenz: "https://creativecommons.org/licenses/by-sa/4.0/", copyright: "Museum & Stadt", urheber: "Alice" }
  ],
  typ: "ausstellung", startDatum: "2026-10-02", endDatum: "2026-10-02", ortName: "Museum"
};
const nachweisWire = "https%3A%2F%2Fexample.org%2Fb2.jpg;Zweites%20Bild;https%3A%2F%2Fcreativecommons.org%2Fpublicdomain%2Fzero%2F1.0%2F;;|https%3A%2F%2Fexample.org%2Fb1.jpg;Motiv%20%7C%20a%3Bb;https%3A%2F%2Fcreativecommons.org%2Flicenses%2Fby-sa%2F4.0%2F;Museum%20%26%20Stadt;Alice";
let fehler = 0;
let anzahl = 0;
function test(name, pruefen) {
  anzahl++;
  try { pruefen(); console.log("  OK " + name); }
  catch (error) { fehler++; console.error("  FAIL " + name + ": " + error.message); }
}
function ohneLinksImButton(html) {
  for (const button of html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)) {
    assert.ok(!/<a\b/.test(button[0]), "Nachweis-Links duerfen nicht im Detail-Button verschachtelt sein");
  }
}
function nachweisAmErstenBild(html) {
  assert.ok(html.includes("Alice"), "Rechteangabe fuer das angezeigte erste Bild fehlt");
  assert.ok(html.includes("Museum &amp; Stadt"), "Copyright-Hinweis bleibt erhalten und escaped");
  assert.ok(html.includes("Motiv | a;b"), "gelieferter Bildtitel bleibt sichtbar");
  assert.ok(html.includes('href="https://example.org/b1.jpg"'), "Bildquelle ist verlinkt");
  assert.ok(html.includes('href="https://creativecommons.org/licenses/by-sa/4.0/"'), "exakte Bildlizenz ist verlinkt");
  assert.ok(html.includes("CC BY-SA 4.0"), "verstaendliche Lizenzbezeichnung");
  assert.ok(!html.includes("CC0"), "Lizenz des zweiten Bildes darf nicht auf das erste Bild uebertragen werden");
  assert.ok(!html.includes("Zweites Bild"), "Titel des zweiten Bildes darf nicht auf das erste Bild uebertragen werden");
  assert.ok(!html.includes("Darstellung:"), "kein zusaetzlicher Darstellungs-Hinweis");
  ohneLinksImButton(html);
}
function uebersichtOhneNachweis(html) {
  assert.ok(html.includes('src="https://example.org/b1.jpg"'), "Bild bleibt sichtbar eingebunden");
  assert.ok(html.includes('data-vk-event="urn:credit-event"'), "Detail-Zugang bleibt vorhanden");
  for (const text of ["vk-bildnachweis", "Alice", "Museum &amp; Stadt", "Motiv | a;b", "Bildquelle (DZT)", "CC BY-SA 4.0", "Darstellung:"]) {
    assert.ok(!html.includes(text), "Uebersicht ohne Bildnachweis: " + text);
  }
  ohneLinksImButton(html);
}

console.log("--- TEST: Bildnachweise ---");

test("Query laedt Lizenz und Rechte am selben Bildobjekt", () => {
  for (const modus of ["zukunft", "archiv"]) {
    const query = sandbox.buildSparqlQuery({ modus, lat: 48.6813, lon: 9.0086, radiusKm: 25, heuteKey: "2026-10-02" });
    assert.ok(/AS \?bildnachweise\)/.test(query), "Bildnachweis-Aggregat fehlt in der ausgegebenen Abfrage");
    assert.ok(/\?imgObj schema:license\b/.test(query), "Bildlizenz muss am imgObj gelesen werden");
    assert.ok(/\?imgObj schema:copyrightNotice\b/.test(query), "Copyright-Hinweis muss am imgObj gelesen werden");
    assert.ok(/\?imgObj schema:copyrightHolder\/schema:name\b/.test(query), "Rechteinhaber-Name muss am imgObj gelesen werden");
    assert.ok(/ENCODE_FOR_URI\(STR\(\?imgUrl\)\)/.test(query), "Bild-URL muss Bestandteil jedes separator-sicheren Nachweis-Datensatzes sein");
    assert.ok(!query.includes("schema:sdLicense"), "Event-Lizenz darf nicht als Bildlizenz eingesetzt werden");
  }
});

test("Parser behaelt Credits pro URL trotz anderer Bildreihenfolge", () => {
  const result = sandbox.parseEvents([{
    s: { value: "urn:parsed" }, name: { value: "Geparst" }, img: { value: "https://example.org/b1.jpg|https://example.org/b2.jpg" },
    bildnachweise: { value: nachweisWire }, startDatum: { value: "2026-10-02" }
  }], 48.6813, 9.0086)[0];
  assert.ok(Array.isArray(result.bildnachweise), "Parser liefert kein Array mit bildgenauen Nachweisen");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.bildnachweise)), [
    { url: "https://example.org/b2.jpg", titel: "Zweites Bild", lizenz: "https://creativecommons.org/publicdomain/zero/1.0/", copyright: "", urheber: "" },
    { url: "https://example.org/b1.jpg", titel: "Motiv | a;b", lizenz: "https://creativecommons.org/licenses/by-sa/4.0/", copyright: "Museum & Stadt", urheber: "Alice" }
  ]);
  nachweisAmErstenBild(sandbox.vkDetailHtml(state, result));
});

test("Ungueltiger Nachweis zerstoert nicht die anderen Datensaetze", () => {
  const result = sandbox.parseEvents([{
    s: { value: "urn:mixed" }, name: { value: "Gemischt" },
    bildnachweise: { value: "%ZZ;Titel;Lizenz;;|" + nachweisWire + "|" + nachweisWire.split("|")[0] + "|unvollstaendig;nur-zwei" }
  }], 0, 0)[0];
  assert.strictEqual(result.bildnachweise?.length, 2, "fehlerhafte Datensaetze ignorieren, identische Nachweise deduplizieren");
  assert.strictEqual(result.bildnachweise[1].urheber, "Alice");
});

test("Fehlende Metadaten bleiben fehlend statt eine Event-Lizenz zu erben", () => {
  const result = sandbox.parseEvents([{ s: { value: "urn:no-credits" }, name: { value: "Ohne Credits" } }], 0, 0)[0];
  assert.deepStrictEqual(Array.from(result.bildnachweise || []), []);
  const html = sandbox.vkDetailHtml(state, { ...event, bildnachweise: [], sdLicense: "https://creativecommons.org/publicdomain/zero/1.0/" });
  assert.ok(/Lizenzangabe fehlt/.test(html), "fehlende Bildlizenz sichtbar kennzeichnen");
  assert.ok(html.includes('href="https://example.org/b1.jpg"'), "vorhandene Quelle bleibt erreichbar");
  assert.ok(!html.includes("CC0"), "keine erfundene Bildlizenz");
});

test("Programmeintrag zeigt Bild und Detail-Zugang, aber keinen Nachweis", () => {
  uebersichtOhneNachweis(sandbox.eventKarteHtml(state, event));
});

test("Archiv zeigt Bild und Detail-Zugang, aber keinen Nachweis", () => {
  uebersichtOhneNachweis(sandbox.renderArchiv({ ...state, gefiltert: [{ ...event, startDatum: "2026-09-20" }] }));
});

test("Katalog zeigt Bild und Detail-Zugang, aber keinen Nachweis", () => {
  uebersichtOhneNachweis(sandbox.renderKatalog({ ...state, gefiltert: [event] }));
});

test("Detail zeigt Nachweis ausserhalb des Vergroessern-Buttons", () => {
  nachweisAmErstenBild(sandbox.vkDetailHtml(state, event));
});

test("Lightbox zeigt Quelle und Lizenz ohne Darstellungszusatz", () => {
  sandbox.zeigeLightbox(state, event);
  const html = angehaengt[angehaengt.length - 1].innerHTML;
  nachweisAmErstenBild(html);
});

test("CC0 benoetigt keine erfundene oder fehlende Urheber-Warnung", () => {
  const html = sandbox.vkDetailHtml(state, { ...event, bilder: ["https://example.org/b2.jpg"] });
  assert.ok(html.includes("CC0 1.0"), "CC0-Ausweisung fehlt");
  assert.ok(html.includes('href="https://creativecommons.org/publicdomain/zero/1.0/"'));
  assert.ok(!/Rechteangabe fehlt|Urheberangabe fehlt/.test(html), "CC0 ohne Rechtehinweis ist kein Attribution-Fehler");
  assert.ok(!html.includes("Alice"), "keine fremde Rechteangabe");
});

test("Rechte-Metadaten und Lizenzlinks erlauben keine HTML-Injektion", () => {
  const html = sandbox.vkDetailHtml(state, {
    ...event, bildnachweise: [{ url: "https://example.org/b1.jpg", titel: "<script>boese</script>", copyright: '<img src=x onerror="boese()">', urheber: "<b>Alice</b>", lizenz: "javascript:alert(1)" }]
  });
  assert.ok(html.includes("&lt;script&gt;"), "Bildtitel escaped");
  assert.ok(html.includes("&lt;b&gt;Alice&lt;/b&gt;"), "Rechteangabe escaped");
  assert.ok(!html.includes("<script>boese"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes('href="javascript:'), "aktive Lizenz-URL gesperrt");
  assert.ok(/Lizenzangabe fehlt/.test(html), "ungueltige Lizenz nicht als geprueft darstellen");
});

test("Nicht zugeordnete Credits werden nicht am ersten Bild angezeigt", () => {
  const html = sandbox.vkDetailHtml(state, { ...event, bildnachweise: [event.bildnachweise[0]] });
  assert.ok(!html.includes("CC0"));
  assert.ok(/Lizenzangabe fehlt/.test(html));
});

test("Platzhalter ohne Bild erzeugt keinen Bildnachweis", () => {
  const html = sandbox.eventKarteHtml(state, { ...event, bilder: [] });
  assert.ok(!html.includes("vk-bildnachweis"));
  assert.ok(!html.includes("Alice"));
});

console.log(`--- Bildnachweise: ${anzahl - fehler}/${anzahl} bestanden ---`);
if (fehler) process.exitCode = 1;
