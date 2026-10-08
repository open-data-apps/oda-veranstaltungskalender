/*
 * tests/fixtures.js – Synthetische DZT-SPARQL-Bindings für den Veranstaltungskalender.
 * KEINE Live-Daten. Datumsangaben relativ zum aktuellen Tag (Browser-Datum),
 * damit „Heute"/„Morgen"-Gruppierung testbar bleibt.
 * Wird zusammen mit tests/browser-fixtures.js im Browser geladen (DevTools).
 */

function vkIsoDatum(offsetTage) {
  const d = new Date();
  d.setDate(d.getDate() + offsetTage);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let vkBildZaehler = 0;

/* Wire-treu (Audit T-4): SPARQL-Bindings tragen type (literal/uri) wie der
 * echte Endpunkt; ungebundene OPTIONAL-Felder bleiben null. */
function vkWert(wert, typ) {
  return { type: typ || "literal", value: wert };
}

function vkBinding(id, optionen) {
  const o = optionen || {};
  const bild = o.bild ? new URL("/tests/fixtures-img/bild-" + ((vkBildZaehler++ % 3) + 1) + ".svg", window.location.href).href : "";
  const bildnachweis = bild ? [bild, "Fixture-Bild | Titel; mit Trennern", "https://creativecommons.org/licenses/by-sa/4.0/", "Fixture-Museum", "Fixture-Fotografin"].map(encodeURIComponent).join(";") : "";
  return {
    s: vkWert("urn:vk-fixture:" + id, "uri"),
    name: vkWert(o.name || ("Veranstaltung " + id)),
    desc: vkWert(o.beschreibung || ""),
    startDatum: vkWert(o.zeit ? `${vkIsoDatum(o.tag || 0)}T${o.zeit}:00+02:00` : vkIsoDatum(o.tag || 0)),
    endDatum: o.endTag != null ? vkWert(o.endZeit ? `${vkIsoDatum(o.endTag)}T${o.endZeit}:00+02:00` : vkIsoDatum(o.endTag)) : null,
    ortName: vkWert(o.ort || "Fixture-Ort"),
    street: vkWert(o.strasse || ""),
    postal: vkWert(o.plz || ""),
    city: vkWert(o.stadt || ""),
    lat: o.geo === false ? null : vkWert(String(o.lat != null ? o.lat : 48.6813)),
    lng: o.geo === false ? null : vkWert(String(o.lon != null ? o.lon : 9.0086)),
    url: vkWert(o.url || "https://example.org/" + id, "uri"),
    kostenlos: o.kostenlos == null ? null : vkWert(String(o.kostenlos)),
    img: bild ? vkWert(bild, "uri") : null,
    bildnachweise: bildnachweis ? vkWert(bildnachweis) : null,
    typ: vkWert("https://schema.org/" + (o.typ || "MusicEvent"), "uri"),
    startZeitRaw: o.zeit ? vkWert(o.zeit + ":00") : null
  };
}

function vkZukunftBindings(mode) {
  if (mode === "xss") {
    return [
      vkBinding("xss-heute", {
        name: '<img src=x onerror="window.__vkXss=1"> Vorsicht',
        beschreibung: '<script>window.__vkXssBeschreibung=1</script>Kategorie-Ableitung aus Text ist verboten.',
        typ: "MusicEvent", zeit: "20:00", ort: "Halle"
      })
    ];
  }
  return [
    vkBinding("live-mehrtaegig", { name: "Festwochen im Bürgerpark", typ: "Festival", tag: -1, endTag: 0, zeit: "16:00", ort: "Bürgerpark", kostenlos: false }),
    vkBinding("heute-musik", { name: "Serenade im Schlossgarten", typ: "MusicEvent", zeit: "19:30", endZeit: "21:00", ort: "Schlosshof", strasse: "Schlossstraße 1", plz: "71034", stadt: "Böblingen", kostenlos: true, bild: true }),
    vkBinding("heute-ausstellung", { name: "Stadtgeschichte zum Anfassen", typ: "ExhibitionEvent", ort: "Stadtmuseum", kostenlos: false, bild: true }),
    vkBinding("morgen-theater", { name: "Offene Bühne: Kabarettabend", typ: "TheaterEvent", tag: 1, zeit: "18:00", ort: "Stadthalle", kostenlos: null }),
    vkBinding("sport-stadtlauf", { name: "Stadtlauf · Start am Rathaus", typ: "SportsEvent", tag: 2, zeit: "10:00", ort: "Innenstadt", kostenlos: true }),
    vkBinding("fest-herbst", { name: "Herbstfest mit Familienprogramm", typ: "Festival", tag: 3, zeit: "15:00", ort: "Festplatz", kostenlos: false }),
    vkBinding("kinder-lesen", { name: "Vorlesestunde in der Bücherei", typ: "ChildrensEvent", tag: 5, zeit: "16:30", ort: "Stadtbücherei", kostenlos: true, bild: true }),
    vkBinding("essen-weingut", { name: "Genussabend im Weingut", typ: "FoodEvent", tag: 6, zeit: "18:00", ort: "Weingut Sonnenhang", geo: false, kostenlos: null }),
    vkBinding("sozial-gemeinde", { name: "Gemeindeabend Nachbarschaft", typ: "SocialEvent", tag: 10, zeit: "17:00", ort: "Bürgerhaus", geo: false, kostenlos: true }),
    vkBinding("musik-spaeter", { name: "Großes Herbstkonzert", typ: "MusicEvent", tag: 200, zeit: "20:00", ort: "Stadthalle", kostenlos: false }),
    /* v1.1: Serien-Event (nur eventSchedule-Daten – kein Literal-Datum mit Zeit) */
    { s: { value: "urn:vk-fixture:serien-markt" }, name: { value: "Wochenmarkt am Schloss" }, desc: { value: "Saisonsaison: regionaler Markt mit Schedule" }, startDatum: { value: vkIsoDatum(2) }, startZeitRaw: { value: "14:00:00" }, endDatum: { value: vkIsoDatum(20) }, ortName: { value: "Schlossplatz" }, lat: { value: "48.6921" }, lng: { value: "9.0111" }, kostenlos: { value: "true" }, typ: { value: "https://schema.org/Festival" } }
  ];
}

function vkArchivBindings() {
  return [
    /* Gleiche Event-ID wie im Programm, aber anderer konkreter Termin. */
    vkBinding("heute-musik", { name: "Serenade im Schlossgarten – Archivtermin", typ: "MusicEvent", tag: -3, endTag: -3, zeit: "11:00", endZeit: "12:00", ort: "Schlosshof", bild: true }),
    vkBinding("archiv-juli", { name: "Sommerkino auf dem Schlosshof", typ: "TheaterEvent", tag: -70, zeit: "21:00", ort: "Schlosshof" }),
    vkBinding("archiv-juni", { name: "Juni-Konzert der Stadtkapelle", typ: "MusicEvent", tag: -100, zeit: "19:00", ort: "Stadthalle", bild: true }),
    vkBinding("archiv-mai", { name: "Maiausstellung Neue Meister", typ: "ExhibitionEvent", tag: -120, ort: "Stadtmuseum" }),
    /* v1.1: Serien-Event im Archiv (Schedule-Zeitraum vorbei) */
    { s: { value: "urn:vk-fixture:serien-archiv" }, name: { value: "Winterzauber Serie (vorbei)" }, desc: { value: "Archiv-Serie mit Schedule-Zeitraum" }, startDatum: { value: vkIsoDatum(-90) }, startZeitRaw: { value: "16:30:00" }, endDatum: { value: vkIsoDatum(-60) }, ortName: { value: "Marktplatz" }, lat: { value: "48.6813" }, lng: { value: "9.0086" }, typ: { value: "https://schema.org/SocialEvent" } }
  ];
}

/* (von der v1.1-Erweiterung oben ersetzt – nur einmal definiert) */

function vkSparqlAntwort(welche, mode) {
  const bindings = mode === "empty" ? [] : (welche === "archiv" ? vkArchivBindings() : vkZukunftBindings(mode));
  return { head: { vars: ["s", "name", "desc", "startDatum", "endDatum", "ortName", "street", "postal", "city", "lat", "lng", "url", "kostenlos", "img", "bildnachweise", "typ", "startZeitRaw"] }, results: { bindings } };
}
