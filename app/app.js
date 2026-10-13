/*
 * ODAS App: Veranstaltungskalender (DZT Knowledge Graph)
 * -----------------------------------------------------------------------
 * Zeit-first-Programm-Board: Was läuft heute, morgen, am Wochenende – im
 * konfigurierten Ort mit Umkreis? Vier Modi (Programm, Karte, Katalog,
 * Archiv), 8 Veranstaltungstypen im farbcodierten Art-Filter, Zeitraum-Pills
 * (heute/7/30/90/alle), Live-Suche, Detail-Modal mit ICS-Kalender-Export
 * und Foto-Lightbox. Schale-4-Komponenten (Methodik-Kasten, Datenstand,
 * KPI-Kontexte, weiterführende Links) rendern nur, wenn konfiguriert.
 *
 * Datenzugriff (siehe README): Alle DZT-Anfragen laufen ueber den
 * ODAS-DZT-Relay (GET <appPath>/dzt?path=<pfad>). Der Relay haengt Host,
 * "/api/"-Praefix und den x-api-key an; die App selbst kennt und
 * ueberprueft keinen API-Key mehr. Ausserhalb einer ODAS-Instanz
 * (Live Server, Standalone) gibt es diesen Relay nicht – die App zeigt
 * dann eine Fehlermeldung statt Daten. Der Ortsname wird per Nominatim
 * (OpenStreetMap) geokodiert; fuer die Karte werden OSM-Kacheln geladen.
 *
 * Instanz-Konfiguration: ort, radiusKm (plus apiurls/name
 * "veranstaltungen", urlDaten und Schale-4-Felder) – fest in der
 * Instanz-Konfiguration hinterlegt, keine Suchmaske im UI. Beim
 * Erstaufruf laedt die App den konfigurierten Ausschnitt automatisch.
 *
 * @param {Object} configdata - Alle Konfigurationsdaten der App
 * @param {HTMLElement} enclosingHtmlDivElement - HTML-Knoten des umschließenden Tags
 * @returns {string | NULL} - darzustellendes HTML oder NULL, wenn HTML-Knoten direkt manipuliert wurde
 */

let vkInstanzZaehler = 0;
const vkInstances = new Map();

const VK_ZEITRAEUME = [
  { key: "heute", label: "Heute" },
  { key: "7", label: "7 Tage" },
  { key: "30", label: "30 Tage" },
  { key: "90", label: "90 Tage" },
  { key: "alle", label: "Alle" }
];
const VK_DEFAULT_ZEITRAUM = "7";

const VK_MODI = [
  { key: "programm", label: "Programm" },
  { key: "karte", label: "Karte" },
  { key: "katalog", label: "Katalog" },
  { key: "archiv", label: "Archiv" }
];

function app(configdata = {}, enclosingHtmlDivElement) {
  if (!enclosingHtmlDivElement) {
    throw new Error("Der Inhaltsbereich der App wurde nicht gefunden.");
  }

  const appUid = "i" + ++vkInstanzZaehler;
  /* Ansicht aus dem Verlaufseintrag uebernehmen: nach "Zurueck" oder
   * "Vorwaerts" rendert die Base die Startseite neu und landet hier. */
  const startModus = vkModusAusState(window.history ? window.history.state : null) || "programm";
  const state = {
    appUid,
    configdata,
    modus: startModus,
    zeitraum: VK_DEFAULT_ZEITRAUM,
    typen: new Set(),
    kostenlosNur: false,
    suche: "",
    events: null,
    gefiltert: [],
    status: "lade",
    fehlermeldung: "",
    controller: new AbortController(),
    heuteKey: heutigerTagKey(),
    dom: {}
  };
  vkInstances.set(appUid, state);
  vkVerlaufVerdrahten();

  document.body.classList.add("vk-app-aktiv");

  enclosingHtmlDivElement.innerHTML = shellHtml(state);
  verdrahteShell(state);
  vkPlaneSeitenFokus(state, `vk-${appUid}-modus-${state.modus}`);
  vkTageswechselVerdrahten(state);
  ladeDaten(state);
}

/* Kopf und Drawer sind auf allen Seiten identisch. */
function vkNavigationHtml(state) {
  const seite = state.seite || "startseite";
  const ort = String(state.configdata.ort || "").trim();
  const radiusKm = String(state.configdata.radiusKm || "");
  const subtitel = [ort && `${escapeHtml(ort)}${radiusKm ? " · " + escapeHtml(radiusKm) + " km" : ""}`, "DZT Knowledge Graph"].filter(Boolean).join(" · ");

  /* Reiter-Konvention (WAI-ARIA): role="tab" an den Schaltflaechen,
   * aria-selected statt aria-pressed, und nur der aktive Reiter ist mit der
   * Tabulatortaste erreichbar – die uebrigen erreicht man mit den Pfeiltasten. */
  const inhaltId = `vk-${state.appUid}-inhalt`;
  const modiButtons = VK_MODI.map((m) => {
    const aktiv = m.key === state.modus;
    return `<button type="button" class="vk-modus-btn${aktiv ? " aktiv" : ""}" role="tab" data-vk-modus="${m.key}" aria-selected="${aktiv}" aria-controls="${inhaltId}" tabindex="${aktiv ? "0" : "-1"}" id="vk-${state.appUid}-modus-${m.key}">${m.label}</button>`;
  }).join("");

  const eintraege = { startseite: "Programm", ...VK_SEITEN };
  const links = Object.entries(eintraege).map(([key, label]) =>
    `<a class="vk-drawer-eintrag${key === seite ? " vk-drawer-eintrag-aktiv" : ""}" href="#${key}" data-vk-drawer-nav="1"${key === "startseite" ? ' data-vk-drawer-zu="1"' : ""}${key === seite ? ' aria-current="page"' : ""}>${label}</a>`
  ).join("");
  const navigation = seite === "startseite"
    ? `<nav class="vk-modi" role="tablist" aria-label="Ansichten">${modiButtons}</nav>`
    : '<a class="vk-zurueck" href="#startseite">Zum Programm</a>';
  return `
    <header class="vk-kopf">
      <div>
        <h1 class="vk-kopf-titel">${escapeHtml(String(state.configdata.titel || "Veranstaltungskalender"))}</h1>
        <div class="vk-kopf-subtitel">${subtitel}</div>
      </div>
      ${navigation}
      <button type="button" class="vk-menue-btn" data-vk-menue="1" aria-label="Menü öffnen" aria-expanded="false" aria-controls="vk-${state.appUid}-drawer" id="vk-${state.appUid}-menue">☰</button>
    </header>
    <div class="vk-scrim" data-vk-scrim="1" aria-hidden="true"></div>
    <aside class="vk-drawer" id="vk-${state.appUid}-drawer" aria-hidden="true" aria-label="Menü" inert>
      <div class="vk-drawer-kopf">
        <h3 class="vk-drawer-titel">Menü</h3>
        <button type="button" class="vk-drawer-schliessen" data-vk-drawer-zu="1" aria-label="Menü schließen">✕</button>
      </div>
      <nav class="vk-drawer-nav">
        ${links}
      </nav>
    </aside>`;
}

function shellHtml(state) {
  const zeitPills = VK_ZEITRAEUME.map(
    (z) => `<button type="button" class="vk-pill${z.key === state.zeitraum ? " aktiv" : ""}" data-vk-zeitraum="${z.key}" aria-pressed="${z.key === state.zeitraum}" id="vk-${state.appUid}-zeit-${z.key}">${z.label}</button>`
  ).join("");

  /* v1.2: 8 Typen als Dropdown (Checkbox-Liste) statt Pills in der Leiste */
  const artOptionen = Object.keys(VK_EVENT_TYPES)
    .map(
      (key) => `<button type="button" class="vk-art-zeile" data-vk-typ-option="${key}" data-vk-art-option="${key}" aria-pressed="false">` +
        `<span class="vk-art-box" aria-hidden="true"></span>` +
        `<span class="vk-typ-punkt" style="background:${VK_EVENT_TYPES[key].farbe}"></span>` +
        `<span class="vk-art-label">${escapeHtml(VK_EVENT_TYPES[key].label)}</span>` +
        `<span class="vk-art-zahl" data-vk-badge="${key}">0</span></button>`
    )
    .join("");

  const artPanel = `
    <div class="vk-art-wrap">
      <button type="button" class="vk-pill vk-art-btn" data-vk-art-toggle="1" aria-expanded="false" aria-controls="vk-${state.appUid}-art-panel" id="vk-${state.appUid}-art">` +
      `<span>Art</span><span class="vk-pill-badge" data-vk-art-badge="1">0</span><span class="vk-art-chev" aria-hidden="true">&#9662;</span></button>` +
      `<div class="vk-art-panel" id="vk-${state.appUid}-art-panel" role="group" aria-label="Veranstaltungsarten" hidden>` +
      `<button type="button" class="vk-art-reset" data-vk-art-reset="1">Alle Arten</button>` +
      artOptionen +
      `</div>
    </div>`;

  return `
  <div class="vk-shell" id="vk-${state.appUid}-shell">
    ${vkNavigationHtml(state)}
    <div class="vk-filter" role="toolbar" aria-label="Filter">
      <div class="vk-filter-reihe">
        <span class="vk-filter-gruppe" data-vk-gruppe="zeitraum">${zeitPills}</span>
        ${artPanel}
        <button type="button" class="vk-pill" data-vk-kostenlos="1" aria-pressed="false" id="vk-${state.appUid}-kostenlos">Kostenlos <span class="vk-pill-badge" data-vk-badge="kostenlos">0</span></button>
      </div>
      <div class="vk-filter-suche">
        <input type="search" class="vk-suche" id="vk-${state.appUid}-suche" placeholder="Suchen: Konzert, Markt, Ort …" aria-label="Veranstaltungen durchsuchen" />
      </div>
    </div>
    <main class="vk-inhalt" id="vk-${state.appUid}-inhalt" role="tabpanel" aria-labelledby="vk-${state.appUid}-modus-${state.modus}"></main>
  </div>`;
}

/*
 * Ansicht im Verlauf: Damit "Zurueck" und "Vorwaerts" zwischen Programm,
 * Karte, Katalog und Archiv wechseln, wird die Ansicht in history.state
 * abgelegt. Die Adresse bleibt dabei unveraendert – die Adresssteuerung der
 * Base kennt nur die fuenf Seitennamen und schreibt jeden anderen Hash auf
 * #startseite zurueck (gemessen 2026-10-01); ein Hash-Eintrag je Ansicht
 * erzeugte deshalb nur zusaetzliche Eintraege und liess "Vorwaerts" ins Leere
 * laufen.
 */
const VK_VERLAUF_SCHLUESSEL = "vkModus";
let vkVerlaufListener = null;

/* Liest die Ansicht aus einem Verlaufseintrag. Unbekanntes liefert null. */
function vkModusAusState(zustand) {
  const wert = zustand ? zustand[VK_VERLAUF_SCHLUESSEL] : null;
  return VK_MODI.some((m) => m.key === wert) ? wert : null;
}

/* Legt einen Verlaufseintrag fuer die Ansicht an, ohne die Adresse zu aendern. */
function vkMerkeModus(key) {
  if (!VK_MODI.some((m) => m.key === key)) return;
  try {
    history.pushState({ [VK_VERLAUF_SCHLUESSEL]: key }, "");
  } catch (_error) { /* Verlauf nicht verfuegbar: Ansicht wechselt trotzdem */ }
}

/* Setzt die Ansicht auf einer gerenderten Startseite, ohne den Verlauf zu beruehren. */
function vkSetzeModus(state, key) {
  if (!state || !key || state.modus === key) return;
  state.modus = key;
  const shell = document.getElementById(`vk-${state.appUid}-shell`);
  const btn = shell ? shell.querySelector(`[data-vk-modus="${key}"]`) : null;
  if (shell && btn) markiereModus(shell, btn);
  wendeFilterAn(state);
}

/* Ein Listener je Seite (Lazy-Singleton); er wirkt auf die aktuell
 * gerenderten Startseiten-Instanzen der Registry (nur diese haben modus). */
function vkVerlaufVerdrahten() {
  if (vkVerlaufListener) return;
  vkVerlaufListener = (ereignis) => {
    const hash = String((window.location && window.location.hash) || "").replace("#", "").trim();
    /* Seitenwechsel: dafuer ist die Adresssteuerung der Base zustaendig. */
    if (hash && hash !== "startseite") return;
    /* Eintraege ohne Ansicht sind der Ausgangszustand: Programm. */
    const modus = vkModusAusState(ereignis.state) || "programm";
    vkInstances.forEach((state) => {
      if (state.modus) vkSetzeModus(state, modus);
    });
  };
  window.addEventListener("popstate", vkVerlaufListener);
}

function verdrahteShell(state) {
  const shell = document.getElementById(`vk-${state.appUid}-shell`);
  if (!shell) return;

  vkVerdrahteNavigation(state, shell);
  verdrahteModusTasten(state, shell);
  shell.addEventListener("click", (ereignis) => {
    const ziel = ereignis.target;
    const infoToggle = ziel.closest("[data-vk-info-toggle]");
    if (infoToggle) {
      const inhaltId = infoToggle.getAttribute("data-vk-info-toggle") + "-inhalt";
      const inhalt = document.getElementById(inhaltId);
      if (inhalt) {
        const offen = !inhalt.hidden;
        inhalt.hidden = offen;
        infoToggle.setAttribute("aria-expanded", String(!offen));
      }
      return;
    }
    const modusBtn = ziel.closest("[data-vk-modus]");
    if (modusBtn) {
      const neuerModus = modusBtn.getAttribute("data-vk-modus");
      /* Schon aktiv: nichts tun. Sonst entstuende bei jedem Klick auf den
       * bereits gewaehlten Reiter ein weiterer Verlaufseintrag. */
      if (neuerModus === state.modus) return;
      state.modus = neuerModus;
      markiereModus(shell, modusBtn);
      vkMerkeModus(neuerModus);
      wendeFilterAn(state);
      return;
    }
    if (ziel.closest("[data-vk-archiv-neu]")) {
      vkLadeArchiv(state);
      return;
    }
    const zeitBtn = ziel.closest("[data-vk-zeitraum]");
    if (zeitBtn) {
      state.zeitraum = zeitBtn.getAttribute("data-vk-zeitraum");
      markiereAktiv(shell, "[data-vk-zeitraum]", zeitBtn);
      wendeFilterAn(state);
      return;
    }
    const archivCta = ziel.closest("[data-vk-archiv-cta]");
    if (archivCta) {
      state.modus = "archiv";
      const archivBtn = shell.querySelector('[data-vk-modus="archiv"]');
      if (archivBtn) markiereModus(shell, archivBtn);
      vkMerkeModus("archiv");
      wendeFilterAn(state);
      return;
    }
    const detailZiel = ziel.closest("[data-vk-event]");
    if (detailZiel) {
      const event = vkFindeEvent(state, detailZiel.getAttribute("data-vk-event"), detailZiel.getAttribute("data-vk-termin"));
      if (event) zeigeEventDetail(state, event);
    }
    const artToggle = ziel.closest("[data-vk-art-toggle]");
    if (artToggle) {
      const panel = shell.querySelector(`#vk-${state.appUid}-art-panel`);
      const offen = panel && !panel.hidden;
      if (panel) {
        panel.hidden = offen;
        artToggle.setAttribute("aria-expanded", String(!offen));
        if (!offen) vkArtOffenVerdrahten(state);
        else vkArtHandlerFreigeben(state);
      }
      return;
    }
    const artReset = ziel.closest("[data-vk-art-reset]");
    if (artReset) {
      state.typen.clear();
      shell.querySelectorAll("[data-vk-typ-option]").forEach((b) => {
        b.setAttribute("aria-pressed", "false");
        b.classList.remove("vk-art-zeile-aktiv");
      });
      wendeFilterAn(state);
      return;
    }
    const typBtn = ziel.closest("[data-vk-typ-option]");
    if (typBtn) {
      const key = typBtn.getAttribute("data-vk-typ-option");
      if (state.typen.has(key)) state.typen.delete(key);
      else state.typen.add(key);
      typBtn.setAttribute("aria-pressed", String(state.typen.has(key)));
      typBtn.classList.toggle("vk-art-zeile-aktiv", state.typen.has(key));
      wendeFilterAn(state);
      return;
    }
    const kostenlosBtn = ziel.closest("[data-vk-kostenlos]");
    if (kostenlosBtn) {
      state.kostenlosNur = !state.kostenlosNur;
      kostenlosBtn.classList.toggle("aktiv", state.kostenlosNur);
      kostenlosBtn.setAttribute("aria-pressed", String(state.kostenlosNur));
      wendeFilterAn(state);
    }
  });

  const suche = document.getElementById(`vk-${state.appUid}-suche`);
  if (suche) {
    suche.addEventListener("input", () => {
      clearTimeout(state.dom.sucheTimer);
      state.dom.sucheTimer = setTimeout(() => {
        state.suche = suche.value.trim();
        wendeFilterAn(state);
      }, 150);
    });
  }
}

/* v1.2: Dropdown schliesst bei Aussenklick und ESC (Handler nur solange offen) */
function vkArtSchliessen(state, fokusZurueck = false) {
  const shell = document.getElementById(`vk-${state.appUid}-shell`);
  const panel = shell ? shell.querySelector(`#vk-${state.appUid}-art-panel`) : null;
  if (panel) panel.hidden = true;
  const toggle = shell ? shell.querySelector("[data-vk-art-toggle]") : null;
  if (toggle) {
    toggle.setAttribute("aria-expanded", "false");
    if (fokusZurueck) toggle.focus();
  }
  vkArtHandlerFreigeben(state);
}

function vkArtOffenVerdrahten(state) {
  if (!state.dom.artTaste) {
    const taste = (e) => {
      if (e.key === "Escape" || e.key === "Esc") {
        e.stopPropagation();
        e.preventDefault();
        vkArtSchliessen(state, true);
      }
    };
    const aussen = (e) => {
      if (e.target && e.target.closest && !e.target.closest(".vk-art-wrap")) vkArtSchliessen(state);
    };
    document.addEventListener("keydown", taste, true);
    document.addEventListener("click", aussen, true);
    state.dom.artTaste = taste;
    state.dom.artAussen = aussen;
  }
}

function vkArtHandlerFreigeben(state) {
  if (state.dom.artTaste) {
    document.removeEventListener("keydown", state.dom.artTaste, true);
    state.dom.artTaste = null;
  }
  if (state.dom.artAussen) {
    document.removeEventListener("click", state.dom.artAussen, true);
    state.dom.artAussen = null;
  }
}

function markiereAktiv(shell, selektor, aktiverBtn) {
  shell.querySelectorAll(selektor).forEach((btn) => {
    const istAktiv = btn === aktiverBtn;
    btn.classList.toggle("aktiv", istAktiv);
    btn.setAttribute("aria-pressed", String(istAktiv));
  });
}

/*
 * Reiter-Leiste aktualisieren: Auswahl, Tabulator-Reihenfolge (nur der aktive
 * Reiter ist erreichbar) und die Beschriftung der Reiterflaeche.
 * Getrennt von markiereAktiv, weil Reiter aria-selected tragen, keine
 * aria-pressed-Schaltflaechen sind.
 */
function markiereModus(shell, aktiverBtn) {
  if (!shell) return;
  shell.querySelectorAll("[data-vk-modus]").forEach((btn) => {
    const istAktiv = btn === aktiverBtn;
    btn.classList.toggle("aktiv", istAktiv);
    btn.setAttribute("aria-selected", String(istAktiv));
    btn.setAttribute("tabindex", istAktiv ? "0" : "-1");
  });
  const inhalt = shell.querySelector(".vk-inhalt");
  if (inhalt && aktiverBtn && aktiverBtn.id) inhalt.setAttribute("aria-labelledby", aktiverBtn.id);
}

/*
 * vkModusTastenZiel(taste, index, anzahl) -> neuer Index oder -1
 * Pfeiltasten und Home/End in einer Reiter-Leiste. -1 heisst: nicht zustaendig
 * (alle anderen Tasten bleiben dem Browser ueberlassen).
 */
function vkModusTastenZiel(taste, index, anzahl) {
  if (!anzahl || anzahl < 1) return -1;
  const start = index >= 0 && index < anzahl ? index : 0;
  if (taste === "ArrowRight") return (start + 1) % anzahl;
  if (taste === "ArrowLeft") return (start - 1 + anzahl) % anzahl;
  if (taste === "Home") return 0;
  if (taste === "End") return anzahl - 1;
  return -1;
}

/*
 * Pfeiltasten in der Ansichtsleiste. Ohne sie waere die Auszeichnung als
 * Reiter-Leiste unvollstaendig: mit der Tastatur kaeme man nicht von einer
 * Ansicht zur naechsten. Der Wechsel aktiviert sofort (automatische
 * Aktivierung), wie es fuer Reiter-Leisten ueblich ist.
 */
function verdrahteModusTasten(state, shell) {
  const leiste = shell ? shell.querySelector(".vk-modi") : null;
  if (!leiste) return;
  leiste.addEventListener("keydown", (ereignis) => {
    const knoepfe = Array.from(leiste.querySelectorAll("[data-vk-modus]"));
    if (!knoepfe.length) return;
    let index = knoepfe.indexOf(document.activeElement);
    /* Ohne Fundstelle am ausgewaehlten Reiter ansetzen, nicht am Anfang. */
    if (index < 0) index = knoepfe.findIndex((k) => k.getAttribute("aria-selected") === "true");
    const ziel = vkModusTastenZiel(ereignis.key, index, knoepfe.length);
    if (ziel < 0) return;
    ereignis.preventDefault();
    const knopf = knoepfe[ziel];
    knopf.focus();
    if (knopf.getAttribute("data-vk-modus") !== state.modus) knopf.click();
  });
}

function basisEvents(state) {
  if (!state.events) return [];
  return state.modus === "archiv" ? state.events.archiv : state.events.zukunft;
}

function wendeFilterAn(state) {
  if (state.status === "bereit" && !state.aktualisiert && state.modus === "archiv" && state.events && state.events.archivGeladen === false && !state.archivPromise && state.archivStatus !== "fehler") vkLadeArchiv(state);
  const zeitraum = state.modus === "archiv" ? "alle" : state.zeitraum;
  state.gefiltert = filterEvents(basisEvents(state), {
    suche: state.suche,
    typen: state.typen,
    zeitraum,
    heuteKey: state.heuteKey,
    kostenlosNur: state.kostenlosNur
  });
  aktualisiereZaehler(state, zeitraum);
  renderModus(state);
}

function aktualisiereZaehler(state, zeitraum) {
  const ohneTypen = filterEvents(basisEvents(state), {
    suche: state.suche,
    typen: new Set(),
    zeitraum,
    heuteKey: state.heuteKey,
    kostenlosNur: state.kostenlosNur
  });
  const zaehler = {};
  let kostenlosZaehler = 0;
  for (const e of ohneTypen) {
    if (e.typ) zaehler[e.typ] = (zaehler[e.typ] || 0) + 1;
    if (e.kostenlos === true) kostenlosZaehler++;
  }
  const shell = document.getElementById(`vk-${state.appUid}-shell`);
  if (!shell) return;
  shell.querySelectorAll("[data-vk-badge]").forEach((badge) => {
    const key = badge.getAttribute("data-vk-badge");
    badge.textContent = String(key === "kostenlos" ? kostenlosZaehler : zaehler[key] || 0);
  });
  const artBadge = shell.querySelector("[data-vk-art-badge]");
  if (artBadge) artBadge.textContent = String(state.typen ? state.typen.size : 0);
}

/* ---------------------------------------------------------------------------
 * v1.2.3: Sitzungslokaler Daten-Cache. onPageLeave gibt die Instanz (Handler,
 * Timer, Abbruch) frei – der einmal geladene Datenbestand (Events + Geocoding)
 * bleibt aber erhalten: Rueckkehr aus den Sekundaerseiten rendert sofort aus
 * dem Cache, ohne erneuten DZT- oder OpenStreetMap-Abruf. Ein Cache-Eintrag
 * gilt pro Instanz-Konfiguration (Ort, Radius, Relay-Adresse).
 * v1.5: zusaetzlich localStorage pro Instanzpfad; 15 Minuten frisch,
 * aeltere Tagesdaten werden angezeigt und im Hintergrund erneuert.
 * --------------------------------------------------------------------------- */

const vkDatenCache = new Map();

function vkCacheKey(configdata) {
  /* v1.2.5 (D-4): Das Tagesdatum gehoert in den Schluessel – die SPARQL-
   * Zeitfenster haengen am heuteKey; ein ueber Mitternacht offener Tab
   * muss am Folgetag neu laden statt mit altem Fenster zu rechnen. */
  return JSON.stringify([
    getOdasAppBasePath(),
    String((configdata && configdata.ort) || "").trim(),
    String((configdata && configdata.radiusKm) || "").trim(),
    getOdasApiUrl(configdata, "veranstaltungen") || "",
    heutigerTagKey()
  ]);
}

function vkCacheSpeicherKey() {
  return "vk-daten-v1:" + getOdasAppBasePath();
}

function vkCacheFrisch(ergebnis) {
  const alter = Date.now() - ergebnis.geladenAm;
  return alter >= 0 && alter < 15 * 60 * 1000;
}

function vkCachePruefe(configdata) {
  const key = vkCacheKey(configdata);
  let data = vkDatenCache.get(key);
  if (!data) {
    try {
      const gespeichert = JSON.parse(localStorage.getItem(vkCacheSpeicherKey()));
      if (!gespeichert || gespeichert.key !== key) return null;
      data = gespeichert.data;
      const eventGueltig = (e) => e && ["id", "name", "startDatum"].every(k => typeof e[k] === "string") &&
        ["endDatum", "startZeit", "endZeit", "beschreibung", "ortName", "adresse", "url", "typ"].every(k => e[k] === null || typeof e[k] === "string") &&
        Array.isArray(e.bilder) && e.bilder.every(u => typeof u === "string") && Array.isArray(e.bildnachweise) &&
        e.bildnachweise.every(b => b && ["url", "titel", "lizenz", "copyright", "urheber"].every(k => typeof b[k] === "string"));
      if (!data || !Array.isArray(data.zukunft) || data.zukunft.length > VK_LIMIT_ZUKUNFT || !data.zukunft.every(eventGueltig) ||
          !Array.isArray(data.archiv) || data.archiv.length > VK_LIMIT_ARCHIV || !data.archiv.every(eventGueltig) ||
          typeof data.archivGeladen !== "boolean" || !data.geo || !Number.isFinite(data.geo.lat) || !Number.isFinite(data.geo.lon) ||
          !Array.isArray(data.geoQueries) || !data.geoQueries.every(q => typeof q === "string")) return null;
    } catch (_error) { return null; /* Speicher gesperrt oder beschaedigt: normal laden. */ }
  }
  const alter = Date.now() - data.geladenAm;
  if (!Number.isFinite(alter) || alter < 0 || alter > 24 * 60 * 60 * 1000 || data.heuteKey !== heutigerTagKey()) return null;
  vkDatenCache.set(key, data);
  return data;
}

function vkCacheLege(configdata, ergebnis) {
  if (!ergebnis) return; /* Fehler/ohne Quelle werden nie gecacht */
  if (!ergebnis.geladenAm) ergebnis.geladenAm = Date.now();
  const key = vkCacheKey(configdata);
  vkDatenCache.set(key, ergebnis);
  try {
    localStorage.setItem(vkCacheSpeicherKey(), JSON.stringify({ key, data: ergebnis }));
  } catch (_error) { /* Quota/Privatmodus: Memory-Cache bleibt nutzbar. */ }
}

/* Ein offener Tab muss seinen Tagesstand selbst erneuern, nicht erst bei
 * der naechsten Route. Auch ein spaet beendeter Abruf darf nicht den alten
 * Tag unter dem neuen Cache-Schluessel speichern. */
async function vkTageswechselPruefen(state) {
  if (state.controller.signal.aborted || document.visibilityState === "hidden") return false;
  const heute = heutigerTagKey();
  if (heute === state.heuteKey) return false;
  state.controller.abort();
  state.controller = new AbortController();
  state.heuteKey = heute;
  schliesseEventDetail(state);
  await ladeDaten(state);
  return true;
}

function vkTageswechselVerdrahten(state) {
  const planen = () => {
    clearTimeout(state.dom.tagesTimer);
    const jetzt = new Date(), morgen = new Date(jetzt);
    morgen.setHours(24, 0, 0, 0);
    state.dom.tagesTimer = setTimeout(pruefen, morgen.getTime() - jetzt.getTime() + 50);
  };
  const pruefen = () => {
    if (state.controller.signal.aborted) return;
    vkTageswechselPruefen(state);
    planen();
  };
  state.dom.tageswechsel = pruefen;
  window.addEventListener("focus", pruefen);
  document.addEventListener("visibilitychange", pruefen);
  planen();
}

async function ladeDaten(state) {
  const controller = state.controller;
  const gecached = vkCachePruefe(state.configdata);
  if (gecached) {
    state.events = gecached;
    state.heuteKey = heutigerTagKey(); /* lokale Tagesformung aktuell halten */
    state.status = "bereit";
    state.fehlermeldung = "";
    state.ausCache = true;
    state.aktualisiert = !vkCacheFrisch(gecached);
    vkPruefeGeteiltenLink(state);
    renderModus(state);
    wendeFilterAn(state);
    if (!state.aktualisiert) return;
  }
  if (!gecached) state.status = "lade";
  state.fehlermeldung = "";
  state.ladefortschritt = { phase: "ort" };
  renderModus(state);
  try {
    const ergebnis = await ladeEvents(state.configdata, controller.signal, {
      modus: "zukunft",
      onFortschritt: (fortschritt) => {
        if (controller.signal.aborted || controller !== state.controller || (state.status !== "lade" && !state.aktualisiert)) return;
        state.ladefortschritt = fortschritt;
        vkAktualisiereLadeanzeige(state);
      }
    });
    if (controller.signal.aborted || controller !== state.controller) return;
    if (ergebnis && ergebnis.heuteKey !== heutigerTagKey()) {
      await vkTageswechselPruefen(state);
      return;
    }
    if (!ergebnis) {
      state.status = "ohneQuelle";
    } else {
      vkCacheLege(state.configdata, ergebnis);
      state.events = ergebnis;
      state.archivStatus = "offen";
      state.archivQuelle = null;
      state.archivPromise = null;
      state.ausCache = false;
      state.heuteKey = ergebnis.heuteKey;
      state.status = "bereit";
    }
  } catch (fehler) {
    if (controller.signal.aborted || controller !== state.controller || (fehler && fehler.name === "AbortError")) return;
    state.status = gecached ? "bereit" : "fehler";
    state.fehlermeldung = (fehler && fehler.message) || "Unbekannter Fehler beim Laden der Veranstaltungen.";
    state.fehlerKonfig = Boolean(fehler && fehler.konfig);
  }
  state.aktualisiert = false;
  vkPruefeGeteiltenLink(state);
  wendeFilterAn(state);
}

/* Archiv erst bei Bedarf; derselbe Geo-Plan gilt fuer beide Zeitbereiche. */
function vkLadeArchiv(state) {
  if (!state.events || state.events.archivGeladen !== false || state.status !== "bereit") return Promise.resolve();
  if (state.archivPromise) return state.archivPromise;
  const vorlage = state.events, controller = state.controller;
  state.archivStatus = "lade";
  if (state.geteiltFehler) { state.geteiltLaden = true; state.geteiltFehler = false; }
  state.archivQuelle = vorlage;
  state.archivFortschritt = { phase: "events", erledigt: 0, gesamt: (vorlage.geoQueries || []).length };
  state.archivPromise = (async () => {
    try {
      const ergebnis = await ladeEvents(state.configdata, controller.signal, {
        modus: "archiv", vorlage,
        onFortschritt: (p) => {
          if (controller.signal.aborted || controller !== state.controller || state.events !== vorlage) return;
          state.archivFortschritt = p;
          if (state.modus === "archiv") vkAktualisiereLadeanzeige(state);
        }
      });
      if (controller.signal.aborted || controller !== state.controller || state.events !== vorlage) return;
      if (ergebnis.heuteKey !== heutigerTagKey()) { await vkTageswechselPruefen(state); return; }
      state.events = { ...vorlage, archiv: ergebnis.archiv, archivGeladen: true };
      state.archivStatus = "bereit";
      state.geteiltLaden = false;
      state.geteiltFehler = false;
      vkCacheLege(state.configdata, state.events);
      vkPruefeGeteiltenLink(state);
    } catch (fehler) {
      if (controller.signal.aborted || controller !== state.controller || state.events !== vorlage) return;
      state.archivStatus = "fehler";
      state.archivFehler = fehler.message || "Archiv konnte nicht geladen werden.";
      state.geteiltFehler = !!state.geteiltLaden;
      state.geteiltLaden = false;
    } finally {
      if (state.archivQuelle === vorlage) state.archivPromise = null;
      if (!controller.signal.aborted && controller === state.controller) wendeFilterAn(state);
    }
  })();
  renderModus(state);
  return state.archivPromise;
}

/* ---------------------------------------------------------------------------
 * Task 7: Programm-Feed – KPIs, Tagesgruppen, Event-Karten, Schale 4
 * --------------------------------------------------------------------------- */

/*
 * kpiWerte(events, heuteKey) -> { zeitraum, heute, wochenende }
 * heute: start <= heute <= (end||start). Wochenende: Freitag–Sonntag der
 * Kalenderwoche von heuteKey (Wochenstart Montag).
 */
function kpiWerte(events, heuteKey) {
  const liste = Array.isArray(events) ? events : [];
  const heute = liste.filter((e) => String(e.startDatum || "") <= heuteKey && String(e.endDatum || e.startDatum || "") >= heuteKey).length;

  const t = new Date(`${heuteKey}T00:00:00`);
  const montag = new Date(t);
  montag.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  const freitag = new Date(montag);
  freitag.setDate(montag.getDate() + 4);
  const sonntag = new Date(montag);
  sonntag.setDate(montag.getDate() + 6);
  const pad = (n) => String(n).padStart(2, "0");
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const von = key(freitag);
  const bis = key(sonntag);
  const wochenende = liste.filter((e) => e.startDatum && String(e.startDatum) <= bis && String(e.endDatum || e.startDatum) >= von).length;

  return { zeitraum: liste.length, heute, wochenende };
}

/*
 * kpiContext(kontext, slotId, appUid) – Schale-4-Referenz-Pattern:
 * Collapse-Toggle direkt in der KPI-Card, nur wenn gefüllt (reiner Text -> escapeHtml).
 */
function kpiContext(kontext, slotId, appUid) {
  const text = String(kontext || "").trim();
  if (!text) return "";
  const targetId = `vk-${appUid}-kpi-kontext-${slotId}`;
  return (
    '<button class="vk-kpi-info-toggle collapsed" type="button" ' +
    'data-bs-toggle="collapse" data-bs-target="#' + targetId + '" ' +
    'aria-expanded="false" aria-controls="' + targetId + '" ' +
    'aria-label="Erklärung zu diesem Wert">ⓘ</button>' +
    '<div id="' + targetId + '" class="collapse vk-kpi-collapse"><div class="vk-kpi-kontext">' + escapeHtml(text) + "</div></div>"
  );
}

/*
 * schale4Html(state) (v1.2) – Einklappbarer Datenquelle-&-Methodik-Block am
 * Feed-Ende: schmale Kopfzeile (Toggle) + versteckter Inhalt (Runtime-HTML fuer
 * hinweis/links, datenStand/fusszeile als escaped Text). Die Template-Fusszeile
 * integriert als letzte Zeile — die App wird randlos, nichts geht verloren.
 * Leer (kein Feld gefuellt) -> kein Block.
 */
function schale4Html(state) {
  const config = state.configdata || {};
  const hinweis = Array.isArray(config.datenquelleHinweis)
    ? config.datenquelleHinweis.filter((s) => String(s || "").trim()).join("")
    : String(config.datenquelleHinweis || "").trim();
  const stand = String(config.datenStand || "").trim();
  const links = Array.isArray(config.weiterfuehrendeLinks)
    ? config.weiterfuehrendeLinks.filter((s) => String(s || "").trim()).join("")
    : String(config.weiterfuehrendeLinks || "").trim();
  const fusszeile = String(config.fusszeile || "").trim();

  if (!hinweis && !stand && !links && !fusszeile) return "";

  const infoId = `vk-${state.appUid}-info`;
  let html =
    `<section class="vk-info" id="${infoId}">` +
    `<button type="button" class="vk-info-kopf" data-vk-info-toggle="${infoId}" aria-expanded="false" aria-controls="${infoId}-inhalt">` +
    `<span class="vk-info-icon" aria-hidden="true">&#9432;</span>` +
    `<span class="vk-info-titel">Datenquelle &amp; Methodik</span>` +
    (stand ? `<span class="vk-info-stand">${escapeHtml(stand)}</span>` : "") +
    `<span class="vk-info-chevron" aria-hidden="true">&#9662;</span>` +
    `</button>` +
    `<div class="vk-info-inhalt" id="${infoId}-inhalt" hidden>`;

  if (hinweis) html += `<div class="vk-info-hinweis">${hinweis}</div>`;
  if (stand) html += `<div class="vk-info-datenstand">${escapeHtml(stand)}</div>`;
  if (links) html += `<div class="vk-info-links">${links}</div>`;
  if (fusszeile) html += `<div class="vk-info-copyright">${escapeHtml(fusszeile)}</div>`;

  html += "</div></section>";
  return html;
}

/* Läuft das Event heute (start <= heute <= end||start)? */
function vkLaeuftHeute(event, heuteKey) {
  return String(event.startDatum || "") <= heuteKey && String(event.endDatum || event.startDatum || "") >= heuteKey;
}

function vkDistanzText(distanzKm) {
  if (distanzKm == null || !Number.isFinite(Number(distanzKm))) return "";
  return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(distanzKm))} km`;
}

/* Bildrechte gehoeren zur konkreten contentUrl, nicht zur Veranstaltung.
 * Nachweise erscheinen im Detail und in der Bildvergroesserung ausserhalb
 * des Bild-Buttons; Fremddaten werden escaped. */
function vkBildLizenzText(url) {
  const normalisiert = String(url || "").replace(/^http:/, "https:").replace(/\/$/, "");
  const namen = {
    "https://creativecommons.org/licenses/by-sa/4.0": "CC BY-SA 4.0",
    "https://creativecommons.org/licenses/by/4.0": "CC BY 4.0",
    "https://creativecommons.org/publicdomain/zero/1.0": "CC0 1.0"
  };
  return namen[normalisiert] || "Lizenz";
}

function vkBildnachweisHtml(event, bildUrl) {
  if (!bildUrl) return "";
  const nachweise = (event.bildnachweise || []).filter((n) => n.url === bildUrl);
  const eindeutig = (werte) => Array.from(new Set(werte.filter(Boolean)));
  const titel = eindeutig(nachweise.map((n) => n.titel));
  const rechte = eindeutig(nachweise.flatMap((n) => [n.urheber, n.copyright]));
  const lizenzen = eindeutig(nachweise.map((n) => safeHttpUrl(n.lizenz)));
  const quelle = safeHttpUrl(bildUrl);
  const teile = [];
  if (titel.length) teile.push(escapeHtml(titel.join("; ")));
  if (rechte.length) teile.push(escapeHtml(rechte.join(" · ")));
  else if (!lizenzen.length || lizenzen.some((url) => vkBildLizenzText(url) !== "CC0 1.0")) teile.push("Rechteangabe fehlt");
  if (quelle) teile.push(`<a href="${escapeHtml(quelle)}" target="_blank" rel="noopener noreferrer">Bildquelle (DZT)</a>`);
  if (lizenzen.length) {
    teile.push(lizenzen.map((url) => `<a href="${escapeHtml(safeHttpUrl(url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(vkBildLizenzText(url))}</a>`).join(" · "));
  } else {
    teile.push("Lizenzangabe fehlt");
  }
  return `<div class="vk-bildnachweis">${teile.join(" · ")}</div>`;
}

function eventKarteHtml(state, event) {
  const typDef = event.typ ? VK_EVENT_TYPES[event.typ] : null;
  const typLabel = typDef ? typDef.label : "Veranstaltung";
  const typFarbe = typDef ? typDef.farbe : "#64748b";
  const zeit = event.startZeit || "ganztägig";
  const bild = event.bilder && event.bilder[0]
    ? `<img src="${escapeHtml(event.bilder[0])}" alt="${escapeHtml(event.name)}" loading="lazy" />`
    : `background:linear-gradient(135deg, ${typFarbe} 0%, ${typFarbe}cc 55%, #0f172a22 100%)`;

  const metaTeile = [event.ortName ? escapeHtml(event.ortName) : "", vkDistanzText(event.distanzKm)];
  const live = vkLaeuftHeute(event, state.heuteKey) && event.startDatum !== state.heuteKey
    ? '<span class="vk-event-live">LÄUFT</span>' : "";

  return (
    '<div class="vk-event-eintrag">' +
    `<button type="button" class="vk-event-karte" data-vk-event="${escapeHtml(event.id)}" data-vk-termin="${escapeHtml(vkTerminSchluessel(event))}" aria-label="Details: ${escapeHtml(event.name)}">` +
    `<div class="vk-event-bild" ${event.bilder && event.bilder[0] ? "" : `style="${bild}"`}>${event.bilder && event.bilder[0] ? bild : ""}` +
    `<span class="vk-event-zeit">${escapeHtml(zeit)}</span>${live}</div>` +
    `<div class="vk-event-koerper">` +
    `<span class="vk-event-typ-badge" style="background:${typFarbe}1f;color:${typFarbe}">${escapeHtml(typLabel)}</span>` +
    `<div class="vk-event-titel">${escapeHtml(event.name)}</div>` +
    `<div class="vk-event-meta">${metaTeile.filter(Boolean).map((t) => `<span>${t}</span>`).join("")}</div>` +
    `</div></button></div>`
  );
}

function renderProgramm(state) {
  /* KPI "heute laufend" und "dieses Wochenende" sind zeitraeumunabhaengige
   * Buergerfragen (Review-Fix 1): sie zaehlen aus dem nur nach Art/Suche/
   * Kostenlos gefilterten Pool, nicht aus dem Zeitraum-Fenster. */
  const pool = filterEvents(basisEvents(state), {
    suche: state.suche,
    typen: state.typen,
    zeitraum: "alle",
    heuteKey: state.heuteKey,
    kostenlosNur: state.kostenlosNur
  });
  const poolWerte = kpiWerte(pool, state.heuteKey);
  const werte = { zeitraum: (state.gefiltert || []).length, heute: poolWerte.heute, wochenende: poolWerte.wochenende };
  const kontexte = state.configdata || {};

  let html =
    '<div class="vk-kpi-reihe">' +
    '<div class="vk-kpi"><div class="vk-kpi-wert">' + werte.zeitraum + '</div><div class="vk-kpi-text">Veranstaltungen im Zeitraum</div>' +
    kpiContext(kontexte.kpiKontext1, "1", state.appUid) + "</div>" +
    '<div class="vk-kpi"><div class="vk-kpi-wert">' + werte.heute + '</div><div class="vk-kpi-text">heute laufend</div>' +
    kpiContext(kontexte.kpiKontext2, "2", state.appUid) + "</div>" +
    '<div class="vk-kpi"><div class="vk-kpi-wert">' + werte.wochenende + '</div><div class="vk-kpi-text">dieses Wochenende</div>' +
    kpiContext(kontexte.kpiKontext3, "3", state.appUid) + "</div>" +
    "</div>";

  const laeuftJetzt = (state.gefiltert || []).filter(
    (e) => String(e.startDatum || "") < state.heuteKey && String(e.endDatum || e.startDatum || "") >= state.heuteKey
  );

  if (!state.gefiltert || state.gefiltert.length === 0) {
    html +=
      '<div class="vk-status"><div class="vk-status-titel">Keine Veranstaltungen für diese Auswahl</div>' +
      '<p class="vk-status-text">Zeitraum, Art oder Suche anpassen – oder später noch einmal vorbeischauen.</p></div>';
  } else {
    if (laeuftJetzt.length) {
      html +=
        '<section class="vk-tag vk-tag-laeuft"><div class="vk-tag-kopf">' +
        `<span class="vk-tag-chip vk-tag-chip-live">Läuft jetzt</span>` +
        `<span class="vk-tag-anzahl">${laeuftJetzt.length} Veranstaltung${laeuftJetzt.length === 1 ? "" : "en"}</span>` +
        "</div><div class=\"vk-karten\">";
      for (const event of laeuftJetzt) html += eventKarteHtml(state, event);
      html += "</div></section>";
    }
    const kommend = (state.gefiltert || []).filter((e) => String(e.startDatum || "") >= state.heuteKey);
    const fmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short" });
    for (const gruppe of tagGruppen(kommend, state.heuteKey)) {
      const d = new Date(`${gruppe.key}T00:00:00`);
      const chip = Number.isNaN(d.getTime()) ? gruppe.key : fmt.format(d);
      html +=
        '<section class="vk-tag"><div class="vk-tag-kopf">' +
        `<span class="vk-tag-chip">${escapeHtml(chip)}</span>` +
        `<span class="vk-tag-name">${escapeHtml(gruppe.label)}</span>` +
        `<span class="vk-tag-anzahl">${gruppe.events.length} Veranstaltung${gruppe.events.length === 1 ? "" : "en"}</span>` +
        '</div><div class="vk-karten">';
      for (const event of gruppe.events) html += eventKarteHtml(state, event);
      html += "</div></section>";
    }
  }

  const archivAnzahl = state.events && state.events.archiv ? state.events.archiv.length : 0;
  if (archivAnzahl > 0) {
    html +=
      `<button type="button" class="vk-archiv-cta" data-vk-archiv-cta="1">Rückblick: <b>${archivAnzahl} vergangene Veranstaltung${archivAnzahl === 1 ? "" : "en"}</b> · Archiv öffnen</button>`;
  }

  html += schale4Html(state);
  return html;
}

const VK_MODUS_RENDERER = {
  programm: renderProgramm,
  karte: renderKarte,
  katalog: renderKatalog,
  archiv: renderArchiv
};

function vkModusPlatzhalter(state) {
  return `<div class="vk-status"><div class="vk-status-titel">Ansicht „${escapeHtml(VK_MODI.find((m) => m.key === state.modus).label)}“</div><p class="vk-status-text">${state.gefiltert.length} Veranstaltung(en) für die aktuelle Auswahl – die Fachansicht entsteht im nächsten Schritt.</p></div>`;
}

/* ---------------------------------------------------------------------------
 * Task 8: Karten-Modus – Leaflet + markercluster (vendored, dynamische Loader)
 * --------------------------------------------------------------------------- */

function istGeladen(el) { return !!(el && el.dataset && el.dataset.geladen === "ja"); }
function markiereGeladen(el) { if (el && el.dataset) el.dataset.geladen = "ja"; }

function loadStylesheetOnce(id, href) {
  const vorhanden = document.getElementById(id);
  if (vorhanden) {
    if (istGeladen(vorhanden)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      vorhanden.addEventListener("load", () => { markiereGeladen(vorhanden); resolve(); }, { once: true });
      vorhanden.addEventListener("error", () => reject(new Error(`Stylesheet konnte nicht geladen werden: ${href}`)), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => { markiereGeladen(link); resolve(); };
    link.onerror = () => { link.remove(); reject(new Error(`Stylesheet konnte nicht geladen werden: ${href}`)); };
    document.head.appendChild(link);
  });
}

function loadScriptOnce(id, src, readyCheck) {
  if (readyCheck && readyCheck()) return Promise.resolve();
  const vorhanden = document.getElementById(id);
  if (vorhanden) {
    if (istGeladen(vorhanden)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      vorhanden.addEventListener("load", () => { markiereGeladen(vorhanden); resolve(); }, { once: true });
      vorhanden.addEventListener("error", () => {
        if (vorhanden.dataset) vorhanden.dataset.fehlgeschlagen = "ja";
        reject(new Error(`Skript konnte nicht geladen werden: ${src}`));
      }, { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.onload = () => { markiereGeladen(script); resolve(); };
    script.onerror = () => { script.remove(); reject(new Error(`Skript konnte nicht geladen werden: ${src}`)); };
    document.head.appendChild(script);
  });
}

const VK_RADIUS_ZOOM = { "5": 13, "10": 12, "25": 11, "50": 9 };

function ensureKarteBereit() {
  return Promise.all([
    loadStylesheetOnce("vk-leaflet-css", "vendor/leaflet/leaflet.css"),
    loadScriptOnce("vk-leaflet-js", "vendor/leaflet/leaflet.js", () => typeof window.L !== "undefined")
  ]).then(() =>
    Promise.all([
      loadStylesheetOnce("vk-markercluster-css", "vendor/markercluster/MarkerCluster.css"),
      loadStylesheetOnce("vk-markercluster-default-css", "vendor/markercluster/MarkerCluster.Default.css"),
      loadScriptOnce("vk-markercluster-js", "vendor/markercluster/leaflet.markercluster.js", () => typeof window.L !== "undefined" && typeof window.L.markerClusterGroup === "function")
    ])
  );
}

function karteAufraeumen(state) {
  if (state.karte) {
    try { state.karte.map.remove(); } catch (_error) { /* bereits entfernt */ }
    state.karte = null;
  }
}

/*
 * v1.2.1 (2A): Die Sekundaerseiten-Inhalte der Instanz sind im Editor Markdown
 * (## /** /* [x](y), "- "-Listen); der Store kann sie der Runtime aber auch
 * bereits als HTML ausliefern. Ueber den sanktionierten Hook renderPageOverride
 * bettet die Inhalte in den gemeinsamen App-Rahmen ein (#secondarySites/h2) –
 * dynamisch: fertiges HTML bleibt unberuehrt, echtes Markdown wird gerendert.
 * startseite/unbekannt -> undefined (Base-Standard inkl. app()).
 */

const VK_SEITEN = {
  beschreibung: "Über diese App",
  kontakt: "Kontakt",
  impressum: "Impressum",
  datenschutz: "Datenschutz"
};

/* Inline-Konstrukte; Reihenfolge: Fett vor Kursiv. Vorhandenes HTML bleibt. */
function vkMarkdownInline(zeile) {
  return zeile
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}

function vkMarkdownNachHtml(md) {
  const out = [];
  let liste = null;
  const listeZu = () => { if (liste) { out.push("</ul>"); liste = null; } };
  for (const rohZeile of String(md || "").split(/\r?\n/)) {
    const zeile = rohZeile.trim();
    if (!zeile) { listeZu(); continue; }
    const ue = zeile.match(/^(#{1,3})\s+(.*)$/);
    if (ue) {
      listeZu();
      const level = ue[1].length <= 2 ? 3 : 4; /* #/## -> h3, ### -> h4 */
      out.push(`<h${level}>${vkMarkdownInline(ue[2])}</h${level}>`);
      continue;
    }
    if (/^[-*]\s+/.test(zeile)) {
      if (!liste) { out.push("<ul>"); liste = true; }
      out.push(`<li>${vkMarkdownInline(zeile.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    listeZu();
    out.push(`<p>${vkMarkdownInline(zeile)}</p>`);
  }
  listeZu();
  return out.join("");
}

/* Der Store kann die Redaktionstexte der Runtime bereits als HTML liefern
 * (API zeigt Markdown, Runtime-Config HTML) – fertiges HTML nie in <p> wickeln. */
function vkIstVorraendertesHtml(text) {
  return /<(h[1-6]|p|ul|ol|li|table|div|br)\b/i.test(text);
}

/* Die Base setzt Seiten-HTML nach dem Hook ein. Fokus erst im naechsten
 * Frame setzen und beim Verlassen der Instanz wieder abbestellen. */
function vkPlaneSeitenFokus(state, zielId) {
  if (typeof requestAnimationFrame !== "function") return;
  state.dom.seitenFokusFrame = requestAnimationFrame(() => {
    state.dom.seitenFokusFrame = null;
    if (!vkInstances.has(state.appUid) || state.dom.modalEl) return;
    const ziel = document.getElementById(zielId);
    if (ziel) ziel.focus();
  });
}

function renderPageOverride(page) {
  const titel = VK_SEITEN[page];
  if (!titel) return undefined;
  const config = typeof configData !== "undefined" ? configData : {};
  const state = { appUid: "i" + ++vkInstanzZaehler, configdata: config, seite: page, dom: {} };
  vkInstances.set(state.appUid, state);
  if (typeof document !== "undefined" && document.body && document.body.classList) {
    document.body.classList.add("vk-sekundaer");
    document.body.classList.add("vk-app-aktiv");
  }
  const feld = config[page];
  const roh = Array.isArray(feld) ? feld.filter((s) => String(s || "").trim()).join("\n") : String(feld || "").trim();
  const inhalt = roh ? (vkIstVorraendertesHtml(roh) ? roh : vkMarkdownNachHtml(roh)) : "";
  const fuss = Array.isArray(config.fusszeile) ? config.fusszeile.filter(s => s !== "_multiline_").join("\n").trim() : String(config.fusszeile || "").trim();
  const fussHtml = fuss ? (vkIstVorraendertesHtml(fuss) ? fuss : vkMarkdownNachHtml(fuss)) : "";
  /* Die Base setzt das Markup erst nach dem Hook ein: Klicks am bleibenden
   * main-content delegieren statt an noch nicht vorhandenem HTML. */
  const root = typeof document !== "undefined" ? document.getElementById("main-content") : null;
  if (root) vkVerdrahteNavigation(state, root);
  vkPlaneSeitenFokus(state, `vk-${state.appUid}-seitentitel`);
  return `<div class="vk-shell" id="vk-${state.appUid}-shell">
    ${vkNavigationHtml(state)}
    <div class="vk-inhalt vk-seiten-inhalt">
      <article id="secondarySites"><h2 id="vk-${state.appUid}-seitentitel" tabindex="-1">${titel}</h2><div>${inhalt || "Informationen nicht verfügbar."}</div></article>
      ${fussHtml ? `<footer class="vk-seiten-fuss">${fussHtml}</footer>` : ""}
    </div>
  </div>`;
}

function vkVerdrahteNavigation(state, root) {
  const klick = (e) => {
    if (e.target.closest("[data-vk-menue]")) vkOeffneDrawer(state);
    else if (e.target.closest("[data-vk-drawer-zu], [data-vk-scrim], [data-vk-drawer-nav]")) vkSchliesseDrawer(state);
    /* Hash-Links und Same-Page-Klicks bleiben beim Routing der Base. */
  };
  root.addEventListener("click", klick);
  state.dom.navigationRoot = root;
  state.dom.navigationKlick = klick;
}

function vkOeffneDrawer(state) {
  const shell = document.getElementById(`vk-${state.appUid}-shell`);
  if (!shell) return;
  shell.classList.add("vk-drawer-offen");
  const menue = document.getElementById(`vk-${state.appUid}-menue`);
  if (menue) menue.setAttribute("aria-expanded", "true");
  const drawer = document.getElementById(`vk-${state.appUid}-drawer`);
  if (drawer) {
    drawer.setAttribute("aria-hidden", "false");
    drawer.removeAttribute("inert");
    drawer.querySelector(".vk-drawer-schliessen").focus();
  }
  if (!state.dom.drawerTaste) {
    const taste = (e) => {
      if (e.key === "Tab" && drawer) {
        const fokus = Array.from(drawer.querySelectorAll("button, a[href]"));
        const erster = fokus[0], letzter = fokus[fokus.length - 1];
        if (e.shiftKey && document.activeElement === erster) { e.preventDefault(); letzter.focus(); }
        else if (!e.shiftKey && document.activeElement === letzter) { e.preventDefault(); erster.focus(); }
      }
      if (e.key === "Escape" || e.key === "Esc") {
        e.stopPropagation();
        e.preventDefault();
        vkSchliesseDrawer(state);
      }
    };
    document.addEventListener("keydown", taste, true);
    state.dom.drawerTaste = taste;
  }
}

function vkSchliesseDrawer(state) {
  const shell = document.getElementById(`vk-${state.appUid}-shell`);
  if (shell) shell.classList.remove("vk-drawer-offen");
  const menue = document.getElementById(`vk-${state.appUid}-menue`);
  if (menue) menue.setAttribute("aria-expanded", "false");
  const drawer = document.getElementById(`vk-${state.appUid}-drawer`);
  if (drawer) {
    if (drawer.contains(document.activeElement) && menue) menue.focus();
    drawer.setAttribute("aria-hidden", "true");
    drawer.setAttribute("inert", "");
  }
  if (state.dom.drawerTaste) {
    document.removeEventListener("keydown", state.dom.drawerTaste, true);
    state.dom.drawerTaste = null;
  }
}



function vkHomeControlKlasse() {
  return L.Control.extend({
    options: { position: "topleft" },
    onAdd(map) {
      const container = L.DomUtil.create("div", "leaflet-bar leaflet-control leaflet-control-custom");
      const button = L.DomUtil.create("button", "vk-home-btn", container);
      button.type = "button";
      button.title = "Kartenansicht zurücksetzen";
      button.setAttribute("aria-label", "Kartenansicht zurücksetzen");
      button.textContent = "⌂";
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(button, "click", () => {
        if (map.vkZuruecksetzen) map.vkZuruecksetzen();
      });
      return container;
    },
    onRemove() { /* nichts zu tun */ }
  });
}

function vkPinIcon(typ) {
  const farbe = (VK_EVENT_TYPES[typ] && VK_EVENT_TYPES[typ].farbe) || "#64748b";
  return L.divIcon({
    className: "vk-pin",
    html: `<span class="vk-pin-punkt" style="background:${farbe}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -9]
  });
}

function renderKarte(state) {
  karteAufraeumen(state);
  /* Generation-Token (Review-Fix 6): Modus-/Filterwechsel waehrend des
   * Vendor-Ladens machen laengende nachbau-Aufrufe wirkungslos. */
  const generation = (state.karteGeneration = (state.karteGeneration || 0) + 1);

  const geoEvents = (state.gefiltert || []).filter((e) => e.lat != null && e.lon != null);
  if (!geoEvents.length) {
    return '<div class="vk-status"><div class="vk-status-titel">Keine Veranstaltungen mit Kartenposition</div><p class="vk-status-text">Für die aktuelle Auswahl liegen keine Koordinaten vor – im Programm und Katalog bleiben alle Veranstaltungen sichtbar.</p></div>';
  }

  const html = `<div class="vk-karte-wrap"><div id="vk-${state.appUid}-karte" class="vk-karte-canvas" role="application" aria-label="Veranstaltungskarte"></div></div>`;

  return {
    html,
    istKarte: true,
    async nachbau() {
      try {
        await ensureKarteBereit();
      } catch (fehler) {
        const inhalt = document.getElementById(`vk-${state.appUid}-inhalt`);
        if (inhalt) inhalt.innerHTML = `<div class="vk-status"><div class="vk-status-titel">Karte konnte nicht geladen werden</div><p class="vk-status-text">${escapeHtml(String((fehler && fehler.message) || "Unbekannter Fehler"))}</p></div>`;
        return;
      }
      const container = document.getElementById(`vk-${state.appUid}-karte`);
      if (!container || generation !== state.karteGeneration) return;

      const geo = (state.events && state.events.geo) || { lat: 48.6813, lon: 9.0086 };
      const map = L.map(container, { zoomControl: true, scrollWheelZoom: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
      }).addTo(map);

      const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48 });
      for (const event of geoEvents) {
        const marker = L.marker([event.lat, event.lon], { icon: vkPinIcon(event.typ) });
        const typDef = event.typ ? VK_EVENT_TYPES[event.typ] : null;
        marker.bindPopup(
          `<div class="vk-popup"><span class="vk-event-typ-badge" style="background:${(typDef && typDef.farbe) || "#64748b"}1f;color:${(typDef && typDef.farbe) || "#64748b"}">${escapeHtml((typDef && typDef.label) || "Veranstaltung")}</span>` +
          `<div class="vk-event-titel">${escapeHtml(event.name)}</div>` +
          `<div class="vk-event-meta"><span>${escapeHtml(event.startDatum || "")}${event.startZeit ? " · " + escapeHtml(event.startZeit) : ""}</span></div>` +
          `<button type="button" class="vk-popup-detail" data-vk-event="${escapeHtml(event.id)}" data-vk-termin="${escapeHtml(vkTerminSchluessel(event))}">Details</button></div>`
        );
        cluster.addLayer(marker);
      }
      map.addLayer(cluster);

      const zoom = VK_RADIUS_ZOOM[String((state.configdata && state.configdata.radiusKm) || "25")] || 11;
      map.setView([geo.lat, geo.lon], zoom);
      map.vkZuruecksetzen = () => map.setView([geo.lat, geo.lon], zoom);
      const HomeControl = vkHomeControlKlasse();
      map.addControl(new HomeControl());

      state.karte = { map, cluster };
      const inhaltEl = document.getElementById(`vk-${state.appUid}-inhalt`);
      if (inhaltEl) inhaltEl.classList.add("vk-karte-aktiv");

      setTimeout(() => { try { map.invalidateSize({ animate: false }); } catch (_error) { /* unbedeutend */ } }, 60);
    }
  };
}

/* Fortschritt zaehlt abgeschlossene Abfragen, nicht verstrichene Zeit.
 * Die Live-Region bleibt bei Updates erhalten, damit Screenreader sie melden. */
function vkAktualisiereLadeanzeige(state) {
  const inhalt = document.getElementById(`vk-${state.appUid}-inhalt`);
  const balken = inhalt && inhalt.querySelector(".vk-ladebalken");
  const text = inhalt && inhalt.querySelector(".vk-ladephase");
  if (!balken || !text) return;
  const p = (state.modus === "archiv" && state.archivStatus === "lade" ? state.archivFortschritt : state.ladefortschritt) || { phase: "ort" };
  let meldung = p.phase === "geo" ? "Suchgebiet wird geprüft …" : "Ort wird bestimmt …";
  if (p.phase === "events") {
    balken.max = p.gesamt;
    balken.value = p.erledigt;
    meldung = `${p.erledigt} von ${p.gesamt} Datenabfragen abgeschlossen`;
  } else {
    balken.removeAttribute("value");
  }
  balken.setAttribute("aria-valuetext", meldung);
  text.textContent = meldung;
}

function renderModus(state) {
  const inhalt = document.getElementById(`vk-${state.appUid}-inhalt`);
  if (!inhalt) return;

  if (state.modus !== "karte") karteAufraeumen(state);
  inhalt.classList.remove("vk-karte-aktiv");

  /* Zeitraum-Pills sind im Archiv ohne Wirkung (Review-Fix 5): Gruppe ausblenden. */
  const shell = document.getElementById(`vk-${state.appUid}-shell`);
  const zeitGruppe = shell ? shell.querySelector('[data-vk-gruppe="zeitraum"]') : null;
  if (zeitGruppe) zeitGruppe.style.display = state.modus === "archiv" ? "none" : "";

  if (state.status === "lade" || (state.modus === "archiv" && (state.archivStatus === "lade" || (state.aktualisiert && state.events.archivGeladen === false)))) {
    inhalt.innerHTML = `<div class="vk-status"><div class="vk-status-titel">Veranstaltungen werden geladen …</div><progress class="vk-ladebalken" aria-label="Fortschritt der Datenabfragen"></progress><p class="vk-status-text vk-ladephase" role="status" aria-live="polite" aria-atomic="true"></p><p class="vk-status-text mt-2">Einzelne Abfragen können länger dauern. Der Balken zählt abgeschlossene Abfragen, nicht die verbleibende Wartezeit.</p></div>`;
    vkAktualisiereLadeanzeige(state);
    return;
  }
  if (state.status === "ohneQuelle") {
    inhalt.innerHTML = `<div class="vk-status"><div class="vk-status-titel">Es ist keine Datenquelle konfiguriert.</div><p class="vk-status-text">Bitte in der ODAS-Instanz einen SPARQL-Endpunkt (apiurls) hinterlegen.</p></div>`;
    return;
  }
  if (state.status === "fehler" && state.fehlerKonfig) {
    inhalt.innerHTML = `<div class="vk-status"><div class="vk-status-titel">Veranstaltungen konnten nicht geladen werden</div><p class="vk-status-text">${escapeHtml(state.fehlermeldung)}</p></div>`;
    return;
  }
  if (state.status === "fehler") {
    /* Eigener Titel bleibt; Datenquellenfehler darunter in der Portfolio-
     * Standardanzeige (Variante A). Ort-/Umkreisfehler (oben) bleiben ein Konfigurationshinweis. */
    inhalt.innerHTML = `<div class="vk-status"><div class="vk-status-titel">Veranstaltungen konnten nicht geladen werden</div><div class="vk-status-text"></div></div>`;
    renderOdasFehler(inhalt.querySelector(".vk-status-text"), new Error(state.fehlermeldung), {
      url: getOdasApiUrl(state.configdata, "veranstaltungen"),
      label: "SPARQL-Endpunkt",
      typLabel: "Wissensdatenbank (SPARQL)",
      erwarteterTyp: "sparql",
    });
    return;
  }

  if (state.modus === "archiv" && state.archivStatus === "fehler") {
    inhalt.innerHTML = `<div class="vk-status"><div class="vk-status-titel">Archiv konnte nicht geladen werden</div><p class="vk-status-text">${escapeHtml(state.archivFehler)}</p><button class="btn btn-outline-secondary mt-2" type="button" data-vk-archiv-neu>Erneut versuchen</button></div>`;
    return;
  }
  const renderer = VK_MODUS_RENDERER[state.modus] || vkModusPlatzhalter;
  const ergebnis = renderer(state);
  /* v1.3.0: Hinweis auf eine nicht gefundene geteilte Veranstaltung. */
  const datenHinweis = state.events && state.events.geladenAm
    ? `<p class="vk-datenstand" role="status">Daten geladen: ${escapeHtml(new Date(state.events.geladenAm).toLocaleString("de-DE"))}${state.aktualisiert ? " · Gespeicherte Daten werden aktualisiert …" : state.ausCache && state.fehlermeldung ? " · Aktualisierung fehlgeschlagen; gespeicherte Daten bleiben sichtbar." : state.ausCache ? " · Aus dem Browser-Cache" : ""}</p>`
    : "";
  const geteiltHinweis = state.geteiltLaden
    ? '<p class="vk-status-text" role="status">Geteilte Veranstaltung wird im Archiv gesucht …</p>'
    : state.geteiltFehler
      ? '<div class="vk-status" role="status">Die geteilte Veranstaltung konnte im Archiv noch nicht geprüft werden. <button class="btn btn-outline-secondary" type="button" data-vk-archiv-neu>Erneut versuchen</button></div>'
      : state.geteiltHinweis ? vkGeteiltHinweisHtml() : "";
  if (ergebnis && typeof ergebnis === "object" && ergebnis.html !== undefined) {
    inhalt.innerHTML = datenHinweis + geteiltHinweis + ergebnis.html;
    if (typeof ergebnis.nachbau === "function") ergebnis.nachbau();
  } else {
    inhalt.innerHTML = datenHinweis + geteiltHinweis + ergebnis;
  }
}

/* ---------------------------------------------------------------------------
 * Task 9: Katalog (Foto-Galerie) + Archiv (Monats-Rückblick)
 * --------------------------------------------------------------------------- */

/*
 * monatsGruppen(events) -> [{ key: "YYYY-MM", label: "September 2026", events }]
 * Monate absteigend (Rückblick), innerhalb eines Monats aufsteigend nach Datum.
 */
function monatsGruppen(events) {
  const gruppen = new Map();
  for (const e of Array.isArray(events) ? events : []) {
    if (!e.startDatum) continue;
    const key = String(e.startDatum).slice(0, 7);
    if (!gruppen.has(key)) gruppen.set(key, []);
    gruppen.get(key).push(e);
  }
  const fmt = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });
  return Array.from(gruppen.keys()).sort((a, b) => (a < b ? 1 : -1)).map((key) => {
    const jahr = Number(key.slice(0, 4));
    const monat = Number(key.slice(5, 7)) - 1;
    return { key, label: fmt.format(new Date(jahr, monat, 1)), events: gruppen.get(key).sort((a, b) => String(a.startDatum).localeCompare(String(b.startDatum))) };
  });
}

/*
 * renderKatalog(state) – Vollbild-Fotogalerie: nur Events mit Bild
 * (dokumentiert: Events ohne Bild bleiben im Programm/Archiv sichtbar).
 */
function renderKatalog(state) {
  const mitBild = (state.gefiltert || []).filter((e) => e.bilder && e.bilder.length > 0);

  if (!mitBild.length) {
    return '<div class="vk-status"><div class="vk-status-titel">Keine Veranstaltungsbilder für diese Auswahl</div><p class="vk-status-text">Im Programm und Archiv bleiben alle Veranstaltungen sichtbar – der Katalog zeigt nur Einträge mit Bild.</p></div>';
  }

  let html = '<div class="vk-katalog">';
  for (const event of mitBild) {
    const typDef = event.typ ? VK_EVENT_TYPES[event.typ] : null;
    const typLabel = typDef ? typDef.label : "Veranstaltung";
    const typFarbe = typDef ? typDef.farbe : "#64748b";
    html +=
      '<div class="vk-katalog-eintrag">' +
      `<button type="button" class="vk-katalog-karte" data-vk-event="${escapeHtml(event.id)}" data-vk-termin="${escapeHtml(vkTerminSchluessel(event))}" aria-label="Details: ${escapeHtml(event.name)}">` +
      `<div class="vk-katalog-bild"><img src="${escapeHtml(event.bilder[0])}" alt="${escapeHtml(event.name)}" loading="lazy" /></div>` +
      `<div class="vk-katalog-koerper">` +
      `<span class="vk-event-typ-badge" style="background:${typFarbe}1f;color:${typFarbe}">${escapeHtml(typLabel)}</span>` +
      `<div class="vk-event-titel">${escapeHtml(event.name)}</div>` +
      `<div class="vk-event-meta"><span>${escapeHtml(event.startDatum || "")}</span></div>` +
      `</div></button></div>`;
  }
  html += "</div>";
  return html;
}

/*
 * renderArchiv(state) – Rückblick: Monatsgruppen absteigend, eigene KPI-Zeile,
 * gleiche Event-Karten wie das Programm, Schale 4 inklusive.
 */
function renderArchiv(state) {
  const anzahl = (state.gefiltert || []).length;

  let html =
    '<div class="vk-kpi-reihe"><div class="vk-kpi"><div class="vk-kpi-wert">' + anzahl + '</div><div class="vk-kpi-text">Veranstaltungen im Rückblick</div>' +
    kpiContext((state.configdata || {}).kpiKontext1, "1", state.appUid) + "</div></div>";

  html += '<h2 class="vk-rueckblick-titel">Rückblick</h2>';

  if (!state.gefiltert || state.gefiltert.length === 0) {
    html += '<div class="vk-status"><div class="vk-status-titel">Keine vergangenen Veranstaltungen für diese Auswahl</div><p class="vk-status-text">Art oder Suche anpassen.</p></div>';
  } else {
    for (const gruppe of monatsGruppen(state.gefiltert)) {
      html +=
        '<section class="vk-tag"><div class="vk-tag-kopf">' +
        `<span class="vk-tag-name">${escapeHtml(gruppe.label)}</span>` +
        `<span class="vk-tag-anzahl">${gruppe.events.length} Veranstaltung${gruppe.events.length === 1 ? "" : "en"}</span>` +
        "</div><div class=\"vk-karten\">";
      for (const event of gruppe.events) html += eventKarteHtml(state, event);
      html += "</section>";
    }
  }

  html += schale4Html(state);
  return html;
}

/* ---------------------------------------------------------------------------
 * Task 10: Detail-Modal, Lightbox, ICS-Kalender-Download
 * --------------------------------------------------------------------------- */

function vkDatumText(datumKey) {
  if (!datumKey) return "";
  const d = new Date(`${datumKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return datumKey;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

/*
 * vkDetailHtml(state, event) – reine Modal-Inhalts-Erzeugung (node-testbar).
 */
function vkDetailHtml(state, event) {
  const typDef = event.typ ? VK_EVENT_TYPES[event.typ] : null;
  const typLabel = typDef ? typDef.label : "Veranstaltung";
  const typFarbe = typDef ? typDef.farbe : "#64748b";

  let html =
    `<div class="vk-detail-kopf"><span class="vk-event-typ-badge" style="background:${typFarbe}1f;color:${typFarbe}">${escapeHtml(typLabel)}</span>` +
    `<h2 id="vk-${state.appUid}-detail-titel" class="vk-detail-titel">${escapeHtml(event.name)}</h2>`;
  if (event.kostenlos === true) html += '<span class="vk-detail-kostenlos-badge">Kostenlos</span>';
  html += "</div>";

  if (event.bilder && event.bilder.length) {
    html +=
      `<div class="vk-detail-bild"><button type="button" class="vk-detail-bild-btn" data-vk-lightbox="1" aria-label="Bild vergrößern">` +
      `<img src="${escapeHtml(event.bilder[0])}" alt="${escapeHtml(event.name)}" /></button>` +
      vkBildnachweisHtml(event, event.bilder[0]) + '</div>';
  }

  const datumZeile = `${vkDatumText(event.startDatum)}${event.startZeit ? " · " + escapeHtml(event.startZeit) : ""}`;
  let statusZeile = "";
  if (event.startDatum === state.heuteKey && (!event.endDatum || event.endDatum === state.heuteKey)) {
    statusZeile = '<div class="vk-detail-status vk-detail-status-heute">Heute laufend</div>';
  } else if (String(event.startDatum || "") < state.heuteKey && event.endDatum && String(event.endDatum) >= state.heuteKey) {
    statusZeile = String(event.endDatum) > state.heuteKey
      ? `<div class="vk-detail-status">Läuft noch bis ${escapeHtml(vkDatumText(event.endDatum))}</div>`
      : '<div class="vk-detail-status">Endet heute</div>';
  }
  html +=
    `<div class="vk-detail-block"><div class="vk-detail-label">Wann</div>` +
    `<div class="vk-detail-wert">${datumZeile}` +
    (event.endDatum && event.endDatum !== event.startDatum ? ` – ${vkDatumText(event.endDatum)}${event.endZeit ? " · " + escapeHtml(event.endZeit) : ""}` : (event.endZeit && event.endDatum === event.startDatum ? ` – ${escapeHtml(event.endZeit)}` : "")) +
    `</div>${statusZeile}</div>`;

  if (event.ortName || event.adresse) {
    html +=
      `<div class="vk-detail-block"><div class="vk-detail-label">Wo</div>` +
      `<div class="vk-detail-wert">${event.ortName ? escapeHtml(event.ortName) : ""}${event.adresse ? (event.ortName ? "<br>" : "") + escapeHtml(event.adresse) : ""}`;
    if (event.lat != null && event.lon != null) {
      html += `<div class="vk-detail-meta">${vkDistanzText(event.distanzKm) ? `<span>${escapeHtml(vkDistanzText(event.distanzKm))} entfernt</span>` : ""}<a href="https://www.openstreetmap.org/?mlat=${event.lat}&mlon=${event.lon}#map=17/${event.lat}/${event.lon}" target="_blank" rel="noopener">Route planen</a></div>`;
    }
    html += "</div>";
  }

  if (event.beschreibung) {
    html += `<div class="vk-detail-block"><div class="vk-detail-label">Beschreibung</div><div class="vk-detail-wert vk-detail-beschreibung">${escapeHtml(event.beschreibung)}</div></div>`;
  }

  html += '<div class="vk-detail-aktionen">';
  html += `<button type="button" class="vk-ics-btn" data-vk-ics="${escapeHtml(event.id)}">📅 In meinen Kalender</button>`;
  const sichereUrl = safeHttpUrl(event.url);
  if (sichereUrl) {
    html += `<a class="vk-detail-link" href="${escapeHtml(sichereUrl)}" target="_blank" rel="noopener">Weitere Informationen</a>`;
  }
  html += "</div>";

  const teilLink = vkTeilenLink(vkAktuelleBasisHref(), event.id, vkTerminSchluessel(event));
  html += vkTeilenHtml(event, teilLink, typeof navigator !== "undefined" && typeof navigator.share === "function");

  html += '<div class="vk-detail-quelle">Quelle: DZT Knowledge Graph · Live-Abruf</div>';
  return html;
}

function vkTerminSchluessel(event) {
  return [event.startDatum, event.startZeit, event.endDatum, event.endZeit].map((teil) => String(teil || "")).join("|");
}

function vkFindeEvent(state, id, termin) {
  const pool = [];
  if (state.events) pool.push(...state.events.zukunft, ...state.events.archiv);
  return pool.find((e) => e.id === id && (!termin || vkTerminSchluessel(e) === termin)) || null;
}

function zeigeLightbox(state, event) {
  vkSchliesseLightbox(state);
  if (!event.bilder || !event.bilder.length) return;
  const overlay = document.createElement("div");
  overlay.id = `vk-${state.appUid}-lightbox`;
  overlay.className = "vk-lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Bildansicht");
  overlay.innerHTML = `<div class="vk-lightbox-inhalt"><img src="${escapeHtml(event.bilder[0])}" alt="${escapeHtml(event.name)}" />` +
    vkBildnachweisHtml(event, event.bilder[0]) +
    '</div><button type="button" class="vk-lightbox-schliessen" aria-label="Bildansicht schließen">✕</button>';
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.classList.contains("vk-lightbox-schliessen")) vkSchliesseLightbox(state);
  });
  const tasteHandler = (e) => {
    if (e.key === "Escape" || e.key === "Esc") {
      e.stopImmediatePropagation();
      e.preventDefault();
      vkSchliesseLightbox(state);
    } else if (e.key === "Tab") {
      const ziele = Array.from(overlay.querySelectorAll('a[href], button'));
      const erstes = ziele[0], letztes = ziele[ziele.length - 1];
      if (e.shiftKey && document.activeElement === erstes) {
        e.preventDefault(); letztes.focus();
      } else if (!e.shiftKey && document.activeElement === letztes) {
        e.preventDefault(); erstes.focus();
      }
    }
  };
  document.addEventListener("keydown", tasteHandler, true);
  state.dom.lightboxFokus = document.activeElement;
  /* Innerhalb des Modals: dessen Bootstrap-Fokusfalle akzeptiert so auch
   * die Nachweislinks. Nicht in den transformierten .modal-dialog haengen. */
  (state.dom.modalEl || document.body).appendChild(overlay);
  state.dom.lightbox = overlay;
  state.dom.lightboxTaste = tasteHandler;
  const schliessenBtn = overlay.querySelector(".vk-lightbox-schliessen");
  if (schliessenBtn) schliessenBtn.focus();
}

function vkSchliesseLightbox(state) {
  if (state.dom.lightbox) {
    document.removeEventListener("keydown", state.dom.lightboxTaste, true);
    state.dom.lightbox.remove();
    state.dom.lightbox = null;
    const fokus = state.dom.lightboxFokus;
    state.dom.lightboxFokus = null;
    if (fokus && document.contains(fokus)) fokus.focus();
  }
}

function vkLadeIcsHerunter(event) {
  const ics = buildIcs(event, event.url);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `veranstaltung-${String(event.id || "event").replace(/[^a-z0-9-]+/gi, "-").slice(-60)}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function schliesseEventDetail(state) {
  /* Ein Seitenwechsel oder erneutes Schliessen cancelt wartende Details. */
  state.dom.detailAnfrage = null;
  vkSchliesseLightbox(state);
  return state.dom.modalSchliessen ? state.dom.modalSchliessen() : Promise.resolve();
}

function zeigeEventDetail(state, event) {
  if (!event || (state.controller && state.controller.signal.aborted)) return;
  if (state.dom.modalEl) {
    const geschlossen = schliesseEventDetail(state);
    const anfrage = {};
    state.dom.detailAnfrage = anfrage;
    /* Erst nach hidden neu oeffnen: der alte Backdrop/Scroll-Lock darf
     * nicht nachtraeglich das naechste Fenster beeintraechtigen. */
    geschlossen.then(() => {
      if (state.dom.detailAnfrage !== anfrage) return;
      state.dom.detailAnfrage = null;
      zeigeEventDetail(state, event);
    });
    return;
  }

  const modalEl = document.createElement("div");
  modalEl.id = `vk-${state.appUid}-modal`;
  modalEl.className = "modal fade";
  modalEl.tabIndex = -1;
  modalEl.setAttribute("aria-hidden", "true");
  modalEl.setAttribute("role", "dialog");
  modalEl.setAttribute("aria-modal", "true");
  modalEl.setAttribute("aria-labelledby", `vk-${state.appUid}-detail-titel`);
  modalEl.innerHTML =
    '<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">' +
    '<div class="modal-content vk-modal"><div class="modal-header vk-modal-header">' +
    '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Schließen"></button></div>' +
    `<div class="modal-body vk-modal-body">${vkDetailHtml(state, event)}</div></div></div>`;

  modalEl.addEventListener("click", (e) => {
    const closeBtn = e.target.closest("[data-bs-dismiss=\"modal\"], .btn-close");
    if (closeBtn) {
      e.preventDefault();
      e.stopPropagation();
      schliesseEventDetail(state);
      return;
    }
    const lightboxBtn = e.target.closest("[data-vk-lightbox]");
    if (lightboxBtn) {
      zeigeLightbox(state, event);
      return;
    }
    const icsBtn = e.target.closest("[data-vk-ics]");
    if (icsBtn) {
      vkLadeIcsHerunter(event);
      return;
    }
    const teilenNativ = e.target.closest("[data-vk-teilen-native]");
    if (teilenNativ) {
      vkTeileNativ(event);
      return;
    }
    const teilenKopieren = e.target.closest("[data-vk-teilen-kopieren]");
    if (teilenKopieren) {
      const reihe = teilenKopieren.closest(".vk-detail-teilen");
      const status = reihe ? reihe.querySelector(".vk-teilen-status") : null;
      /* Behaelter innerhalb des Modals: sonst zieht die Fokusfalle den Fokus
       * aus dem Hilfselement und der Kopierbefehl laeuft ins Leere. */
      const behaelter = teilenKopieren.closest(".modal") || reihe || null;
      vkKopiereLink(vkTeilenLink(vkAktuelleBasisHref(), event.id, vkTerminSchluessel(event)), behaelter).then((ok) => {
        if (status) status.textContent = ok ? "Link kopiert" : "Kopieren nicht möglich";
      });
      return;
    }
  });

  /* Escape wird nur einmal behandelt, auch wenn die Lightbox innerhalb
   * des Modals liegt: nicht danach noch Bootstrap dasselbe Event geben. */
  const modalTaste = (e) => {
    if (e.key === "Tab" && !modal && !state.dom.lightbox) {
      const ziele = Array.from(modalEl.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]'));
      const erstes = ziele[0], letztes = ziele[ziele.length - 1];
      if (e.shiftKey && document.activeElement === erstes) { e.preventDefault(); letztes.focus(); }
      else if (!e.shiftKey && document.activeElement === letztes) { e.preventDefault(); erstes.focus(); }
    }
    if (e.key !== "Escape" && e.key !== "Esc") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (state.dom.lightbox) {
      vkSchliesseLightbox(state);
      return;
    }
    if (state.dom.modalEl) schliesseEventDetail(state);
  };
  const backdropKlick = (e) => {
    if (state.dom.modalEl && e.target && e.target.classList && e.target.classList.contains("modal-backdrop")) {
      schliesseEventDetail(state);
    }
  };
  document.addEventListener("keydown", modalTaste, true);
  document.addEventListener("click", backdropKlick, true);
  state.dom.modalTaste = modalTaste;
  state.dom.backdropKlick = backdropKlick;

  document.body.appendChild(modalEl);
  state.dom.modalEl = modalEl;
  const fokusZurueck = document.activeElement;
  let modal = null;
  let gezeigt = false;
  let schliessenAngefordert = false;
  let fertig;
  const geschlossen = new Promise((resolve) => { fertig = resolve; });
  const aufraeumen = () => {
    document.removeEventListener("keydown", modalTaste, true);
    document.removeEventListener("click", backdropKlick, true);
    vkSchliesseLightbox(state);
    /* Bootstrap hat hidden erst nach allen eigenen Uebergaengen gemeldet. */
    if (modal) modal.dispose();
    modalEl.remove();
    state.dom.modalEl = null;
    state.dom.modalSchliessen = null;
    state.dom.modalTaste = null;
    state.dom.backdropKlick = null;
    if (!state.dom.detailAnfrage && fokusZurueck && document.contains(fokusZurueck)) fokusZurueck.focus();
    fertig();
  };
  state.dom.modalSchliessen = () => {
    if (!schliessenAngefordert) {
      schliessenAngefordert = true;
      if (!modal) aufraeumen();
      else if (gezeigt) modal.hide();
      /* hide waehrend show wird von Bootstrap ignoriert: shown holt es nach. */
    }
    return geschlossen;
  };

  try {
    modal = new window.bootstrap.Modal(modalEl);
    modalEl.addEventListener("hide.bs.modal", () => {
      schliessenAngefordert = true;
      vkSchliesseLightbox(state);
    });
    modalEl.addEventListener("hidden.bs.modal", aufraeumen, { once: true });
    modalEl.addEventListener("shown.bs.modal", () => {
      gezeigt = true;
      if (schliessenAngefordert) { modal.hide(); return; }
      const schliessen = modalEl.querySelector("[aria-label=\"Schließen\"]");
      if (schliessen) schliessen.focus();
    });
    modal.show();
  } catch (_error) {
    /* Bootstrap nicht verfuegbar: fallback-Overlay ohne Animation */
    modalEl.removeAttribute("aria-hidden");
    modalEl.classList.add("vk-modal-fallback", "show", "d-block");
    modalEl.querySelector('.btn-close').focus();
    modalEl.addEventListener("click", (e) => { if (e.target === modalEl) schliesseEventDetail(state); });
  }
}

/*
 * onPageLeave(page) – der einzige sanktionierte Aufräum-Hook der Base.
 * Bricht laufende Fetches ab und räumt Timer; Kartenressourcen werden hier
 * ergänzt, sobald die Kartenansicht existiert (Task 8).
 */
function onPageLeave(page) {
  if (page === "startseite" && typeof document !== "undefined" && document.body && document.body.classList) {
    document.body.classList.remove("vk-sekundaer");
  }
  vkInstances.forEach((state) => {
    if (state.controller) {
      try { state.controller.abort(); } catch (_error) { /* bereits abgebrochen */ }
    }
    if (state.dom && state.dom.seitenFokusFrame != null) {
      cancelAnimationFrame(state.dom.seitenFokusFrame);
      state.dom.seitenFokusFrame = null;
    }
    if (state.dom && state.dom.tageswechsel) {
      window.removeEventListener("focus", state.dom.tageswechsel);
      document.removeEventListener("visibilitychange", state.dom.tageswechsel);
      clearTimeout(state.dom.tagesTimer);
      state.dom.tageswechsel = null;
      state.dom.tagesTimer = null;
    }
    if (state.dom && state.dom.sucheTimer) {
      clearTimeout(state.dom.sucheTimer);
      state.dom.sucheTimer = null;
    }
    if (state.dom && state.dom.navigationRoot) {
      state.dom.navigationRoot.removeEventListener("click", state.dom.navigationKlick);
      state.dom.navigationRoot = null;
      state.dom.navigationKlick = null;
    }
    vkArtHandlerFreigeben(state);
    vkSchliesseDrawer(state);
    schliesseEventDetail(state);
    karteAufraeumen(state);
    /* Zustand der Instanz freigeben (Review-Fix 4): die App laedt bei
     * Rueckkehr ohnehin neu – tote States mit Event-Arrays leaken nicht. */
    vkInstances.delete(state.appUid);
  });
  document.body.classList.remove("vk-app-aktiv");
}

/*
 * Escape-Helfer (Portfolio-Konvention): sichere Ausgabe dynamischer Texte.
 */
function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isKeineDatenquelleKonfiguriert(targetUrl) {
  const quelle = String(targetUrl || "").trim();
  return !quelle || /^\{\{.*\}\}$/.test(quelle) || /^<.*>$/.test(quelle);
}

const TYP_BEZEICHNUNG = {
  "ckan-dkan-ds": "Tabellen-API mit Daten-ID",
  "ckan-ps": "Datensatz-API",
  "ckan-dl": "Datei-Download",
  "ods21": "Open-Data-Suche (API v2.1)",
  "wfs": "Kartendienst (WFS)",
  "sparql": "Wissensdatenbank (SPARQL)",
  "csv-zip": "Statische Datei"
}

function validateUrlTypErwartung(url, erwarteterTyp) {
  const u = String(url || "");
  if (!erwarteterTyp || isKeineDatenquelleKonfiguriert(u)) return null;
  const checks = {
    "ckan-dkan-ds": /\/api\/3\/action\/datastore_search\?resource_id=/i,
    "ckan-ps": /\/api\/3\/action\/package_show\?id=/i,
    "ckan-dl": /\/dataset\/.*\/resource\/.*\/download\//i,
    "ods21": /\/api\/explore\/v2\.1\//i,
    "wfs": /service=WFS/i,
    "sparql": /\/api\/ts\/v1\/kg\/sparql/i,
    "csv-zip": /\.(csv|json|zip)(\?|$)/i
  };
  const re = checks[erwarteterTyp];
  if (!re) return null;
  if (!re.test(u)) {
    const soll = TYP_BEZEICHNUNG[erwarteterTyp] || erwarteterTyp;
    return `Typ passt nicht: erwartet „${soll}", erhalten „${u.slice(0, 60)}…". Prüfen Sie den Hilfe-Tooltip bei „URLs zu Datenressourcen".`;
  }
  return null;
}

function classifyOdasFehler(error, kontext = {}) {
  const msg = String((error && error.message) || error || "");
  const url = String(kontext.url || "");
  const label = String(kontext.label || "Datenressource");
  const typLabel = String(kontext.typLabel || TYP_BEZEICHNUNG[kontext.erwarteterTyp] || "Datenquelle");
  if (/Keine Datenquelle konfiguriert/i.test(msg) || isKeineDatenquelleKonfiguriert(url)) {
    return {
      kind: "KEINE_QUELLE",
      titel: "Es ist keine Datenquelle konfiguriert.",
      hinweis: `Prüfen Sie unter „URLs zu Datenressourcen → ${label}", ob eine gültige ${typLabel}-URL eingetragen ist (Hilfe-Tooltip beachten).`,
      detail: msg,
      alertClass: "alert-info"
    };
  }
  if (/Typ passt nicht: erwartet/i.test(msg)) {
    return {
      kind: "TYP_MISMATCH",
      titel: msg,
      hinweis: `Diese App erwartet ${typLabel}. Korrigieren Sie die URL gemäß Hilfe-Tooltip (Beispiel dort).`,
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/URL origin not allowed/i.test(msg)) {
    return {
      kind: "PROXY_ORIGIN",
      titel: "ODAS-Proxy blockiert: Ziel-Origin nicht freigegeben.",
      hinweis: "Tragen Sie die Ziel-Origin als eigenen Eintrag unter „URLs zu Datenressourcen“ ein oder prüfen Sie proxyAktiv.",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/ODAS-Proxy-Fehler/i.test(msg) || /kein content-String/i.test(msg)) {
    return {
      kind: "PROXY_HTTP",
      titel: msg,
      hinweis: "Prüfen Sie proxyAktiv und Erreichbarkeit im ODAS-Live-System (lokal 404 ist normal).",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  // Nur der Proxy-Helfer (Apps mit proxyAktiv) meldet "Direkter Datenabruf fehlgeschlagen".
  if (/Direkter Datenabruf fehlgeschlagen/i.test(msg)) {
    const corsHint = /Failed to fetch/i.test(msg) ? " – vermutlich CORS blockiert → im ODAS-Live proxyAktiv=ja." : "";
    return {
      kind: "DIREKT_CORS_HTTP",
      titel: msg,
      hinweis: `Prüfen Sie URL und CORS der Quelle${corsHint}`,
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/Failed to fetch/i.test(msg)) {
    return {
      kind: "NETZWERK",
      titel: msg,
      hinweis: "Die Quelle war nicht erreichbar. Prüfen Sie Internetverbindung und Erreichbarkeit der Quelle.",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/liefert kein JSON/i.test(msg) || /HTML-Seite|CSV-|leere Antwort|unlesbaren/i.test(msg)) {
    return {
      kind: "PAYLOAD_TYP",
      titel: msg,
      hinweis: "Tragen Sie den passenden Endpunkt ein – nicht die Datensatzseite (/dataset/…) – Hilfe-Tooltip beachten.",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/CKAN.*Fehler|success:false/i.test(msg)) {
    return {
      kind: "CKAN_API",
      titel: msg,
      hinweis: "Prüfen Sie Daten-ID / Datensatz-ID (existiert die Tabelle/Datei noch auf dem Portal?).",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/\b404\b/.test(msg)) {
    return {
      kind: "HTTP_404",
      titel: msg,
      hinweis: "Die angefragte Adresse wurde nicht gefunden (404). Prüfen Sie, ob URL und Datensatz noch existieren. Lokal ohne ODAS gibt es weder Proxy noch Relay – Abrufe darüber enden dort mit 404.",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  return {
    kind: "UNBEKANNT",
    titel: msg || "Unbekannter Fehler beim Laden.",
    hinweis: "Prüfen Sie Konfiguration und Erreichbarkeit der Quelle.",
    detail: msg,
    alertClass: "alert-danger"
  };
}

function renderOdasFehler(container, error, kontext = {}) {
  if (!container) return;
  const typWarn = validateUrlTypErwartung(kontext.url, kontext.erwarteterTyp);
  if (typWarn && !/Typ passt nicht/i.test(String(error && error.message))) {
    error = new Error(typWarn);
  }
  const info = classifyOdasFehler(error, kontext);
  const url = String(kontext.url || "");
  const urlZeile = url ? `<p class="mb-1 small text-muted">Konfigurierte URL: <code>${escapeHtml(url.length > 80 ? url.slice(0, 80) + "…" : url)}</code></p>` : "";
  const titel = kontext.leer ? "Keine Datensätze gefunden." : info.titel;
  const alertClass = kontext.leer ? "alert-info" : info.alertClass;
  container.innerHTML = `<div class="alert ${alertClass}" role="alert"><strong>${escapeHtml(titel)}</strong><p class="mb-1">${escapeHtml(info.hinweis)}</p>${urlZeile}<details class="small"><summary>Details</summary><code>${escapeHtml(info.detail || String(error))}</code></details></div>`;
}

/* ---------------------------------------------------------------------------
 * Datenlayer – Task 2: Typ-Registry, SPARQL-Builder, Datum-Helfer, Parsing
 *
 * Portfolio-Grundsatz: Jede Filterkategorie beruht auf exakten schema.org-
 * Typ-URIs bzw. Schema-Attributen (startDate/endDate, geo, isAccessibleForFree,
 * eventStatus) – niemals auf Stichwortsuche oder Textableitung.
 * Geo-Suche: Ontotext-geo_shape-Connector (bewaehrt in sehenswuerdigkeiten/
 * wanderwege/gastrofinder), doppelt JSON-encodiertes con:query-Literal.
 * --------------------------------------------------------------------------- */

const VK_EVENT_TYPES = {
  musik: { label: "Musik", farbe: "#9d174d", uri: "https://schema.org/MusicEvent" },
  theater: { label: "Theater", farbe: "#9a3412", uri: "https://schema.org/TheaterEvent" },
  ausstellung: { label: "Ausstellung", farbe: "#065f46", uri: "https://schema.org/ExhibitionEvent" },
  fest: { label: "Fest", farbe: "#6d28d9", uri: "https://schema.org/Festival" },
  sport: { label: "Sport", farbe: "#1d4ed8", uri: "https://schema.org/SportsEvent" },
  kinder: { label: "Kinder", farbe: "#0f766e", uri: "https://schema.org/ChildrensEvent" },
  essen: { label: "Essen & Trinken", farbe: "#3f6212", uri: "https://schema.org/FoodEvent" },
  sozial: { label: "Soziales", farbe: "#475569", uri: "https://schema.org/SocialEvent" }
};
const EVENT_TYPES = VK_EVENT_TYPES;

const VK_LIMIT_ZUKUNFT = 600;
const VK_LIMIT_ARCHIV = 400;
const VK_FENSTER_TAGE = 365;

/*
 * normalisiereDatum("2026-10-01" | "2026-10-01T19:30:00+02:00" | "2026-10-01T19:30Z")
 *   -> "YYYY-MM-DD" | null
 * Zeitkomponenten mit Offset werden als Kalenderdatum der Angabe uebernommen
 * (der DZT-KG liefert Veranstaltungszeiten in der Zeitzone des Veranstaltungsortes).
 */
function normalisiereDatum(wert) {
  const roh = String(wert == null ? "" : wert).trim();
  if (!roh) return null;
  const treffer = roh.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!treffer) return null;
  return `${treffer[1]}-${treffer[2]}-${treffer[3]}`;
}

/* zeitAnteil("2026-10-01T19:30:00+02:00" | "13:00:00") -> "19:30"/"13:00" | null */
function zeitAnteil(wert) {
  const roh = String(wert == null ? "" : wert).trim();
  if (!roh) return null;
  const treffer = roh.match(/(?:^|T)(\d{2}):(\d{2})/);
  if (!treffer) return null;
  return `${treffer[1]}:${treffer[2]}`;
}

/* plusTage("2026-09-30", 365) -> "2027-09-30" (robust ueber Date-Objekt) */
function plusTage(heuteKey, tage) {
  const d = new Date(`${String(heuteKey)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(heuteKey);
  d.setUTCDate(d.getUTCDate() + Number(tage) || 0);
  return d.toISOString().slice(0, 10);
}

/* haversineKm(lat1, lon1, lat2, lon2) -> Distanz in km */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const rad = (x) => (Number(x) * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* Derselbe Kreis bleibt in allen Teilabfragen erhalten; das Rechteck teilt nur
 * das native Geo-Ergebnisfenster auf, nicht den konfigurierten Suchradius. */
function vkGeoQuery(lat, lon, radiusKm, box) {
  const radius = `${Math.max(1, Math.round(Number(radiusKm) || 25))}km`;
  const circle = { geo_shape: { geometry: {
    shape: { type: "circle", radius, coordinates: [Number(lon), Number(lat)] },
    relation: "intersects"
  } } };
  const query = box ? { bool: { filter: [circle, { geo_shape: { geometry: {
    shape: { type: "envelope", coordinates: [[box.west, box.north], [box.east, box.south]] },
    relation: "intersects"
  } } }] } } : circle;
  return JSON.stringify({ query });
}

/* Der DZT-Connector liefert hoechstens 10.000 Geo-Orte, noch VOR dem
 * Veranstaltungs-Join. Ueberlaufende Kreise werden deshalb raeumlich geteilt.
 * totalHits wird vorab geprueft; keine stille Kappung und kein OFFSET > 10.000. */
async function vkPlaneGeoAbfragen(base, lat, lon, radiusKm, signal) {
  const radius = Math.max(1, Math.round(Number(radiusKm) || 25));
  const winkel = radius / 6371;
  const latDelta = winkel * 180 / Math.PI * 1.01;
  const lonDelta = Math.asin(Math.min(1, Math.sin(winkel) / Math.cos(Number(lat) * Math.PI / 180))) * 180 / Math.PI * 1.01;
  const umkreisBox = { west: Number(lon) - lonDelta, east: Number(lon) + lonDelta,
    south: Number(lat) - latDelta, north: Number(lat) + latDelta };

  const teile = async (box, tiefe) => {
    const geoQuery = vkGeoQuery(lat, lon, radius, box);
    const query = `PREFIX inst: <http://www.ontotext.com/connectors/elasticsearch/instance#>
PREFIX con: <http://www.ontotext.com/connectors/elasticsearch#>
SELECT ?vkGeoTotal WHERE {
  ?search a inst:dzt-geo-shapes ; con:query ${JSON.stringify(geoQuery)} ;
    con:limit 1 ; con:totalHits ?vkGeoTotal .
}`;
    const path = `${base}?${new URLSearchParams({ query }).toString()}`;
    const json = await fetchKgJson(path, { accept: "application/sparql-results+json" }, signal);
    const wert = json && json.results && Array.isArray(json.results.bindings) && json.results.bindings[0] && json.results.bindings[0].vkGeoTotal;
    const total = wert && String(wert.value).trim() !== "" ? Number(wert.value) : NaN;
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new Error("Unerwartetes Antwortformat des DZT-Relays (Geo-Trefferzahl). Bitte später erneut laden.");
    }
    if (total === 0) return [];
    if (total < 10000) return [geoQuery];
    if (tiefe >= 8) {
      throw Object.assign(new Error("Die Geo-Abfrage kann diesen Umkreis nicht vollständig erfassen. Bitte einen kleineren Umkreis konfigurieren."), { konfig: true });
    }
    const bounds = box || umkreisBox;
    let a, b;
    if (tiefe % 2 === 0) {
      const mitte = (bounds.west + bounds.east) / 2;
      a = { ...bounds, east: mitte }; b = { ...bounds, west: mitte };
    } else {
      const mitte = (bounds.south + bounds.north) / 2;
      a = { ...bounds, north: mitte }; b = { ...bounds, south: mitte };
    }
    const west = await teile(a, tiefe + 1);
    const ost = await teile(b, tiefe + 1);
    return west.concat(ost);
  };
  return teile(null, 0);
}

/*
 * Geo-Orte sind vollstaendig vorgeplant. Zuerst werden eindeutige Event-IDs
 * mit dem fruehesten Zukunfts-/juengsten Archivtermin begrenzt, erst danach
 * angereichert. Zeit und Ende stammen vom ausgewaehlten Termin; Ort und
 * Koordinaten vom Geo-Treffer, nicht von einem beliebigen weiteren Ort.
 */
function buildSparqlQuery({ modus, lat, lon, radiusKm, heuteKey, geoQuery }) {
  const zukunft = modus !== "archiv";
  const bisKey = plusTage(heuteKey, VK_FENSTER_TAGE + 1);
  const vonKey = plusTage(heuteKey, -VK_FENSTER_TAGE);
  const geoPattern = `?search a inst:dzt-geo-shapes ;
        con:query ${JSON.stringify(geoQuery || vkGeoQuery(lat, lon, radiusKm))} ;
        con:limit 10000 ; con:entities ?loc .`;
  const typListe = Object.values(VK_EVENT_TYPES).map((t) => t.uri.replace("https://schema.org/", "schema:")).join(" ");
  const fenster = zukunft
    ? `FILTER(COALESCE(STR(?vkEnde), STR(?vkStart)) >= "${heuteKey}" && STR(?vkStart) < "${bisKey}")`
    : `FILTER(COALESCE(STR(?vkEnde), STR(?vkStart)) < "${heuteKey}" && STR(?vkStart) >= "${vonKey}")`;
  const terminPattern = `OPTIONAL { ?s schema:startDate ?d }
      OPTIONAL { ?s schema:endDate ?e }
      OPTIONAL {
        ?s schema:eventSchedule ?vkS .
        OPTIONAL { ?vkS schema:startDate ?vkSd }
        OPTIONAL { ?vkS schema:endDate ?vkSe }
        OPTIONAL { ?vkS schema:startTime ?vkZeit }
      }
      BIND(COALESCE(?d, ?vkSd) AS ?vkStart)
      BIND(COALESCE(?e, ?vkSe, ?vkStart) AS ?vkEnde)
      FILTER(BOUND(?vkStart))
      ${fenster}`;
  const ordnung = zukunft ? "ORDER BY ?vkStartWahl ?s" : "ORDER BY DESC(?vkStartWahl) ?s";
  const limit = zukunft ? VK_LIMIT_ZUKUNFT : VK_LIMIT_ARCHIV;

  return `PREFIX inst: <http://www.ontotext.com/connectors/elasticsearch/instance#>
PREFIX con: <http://www.ontotext.com/connectors/elasticsearch#>
PREFIX schema: <https://schema.org/>

SELECT ?s
  (SAMPLE(?nameDe) AS ?name)
  (SAMPLE(?descDe) AS ?desc)
  (SAMPLE(?vkStart) AS ?startDatum)
  (SAMPLE(?vkEnde) AS ?endDatum)
  (SAMPLE(?vkZeit) AS ?startZeitRaw)
  (SAMPLE(?ortNameDe) AS ?ortName)
  (SAMPLE(?streetVal) AS ?street)
  (SAMPLE(?postalVal) AS ?postal)
  (SAMPLE(?cityVal) AS ?city)
  (SAMPLE(?latVal) AS ?lat)
  (SAMPLE(?lngVal) AS ?lng)
  (SAMPLE(?urlVal) AS ?url)
  (SAMPLE(?freeVal) AS ?kostenlos)
  (GROUP_CONCAT(DISTINCT ?imgUrl; separator="|") AS ?img)
  (GROUP_CONCAT(DISTINCT ?imgNachweis; separator="|") AS ?bildnachweise)
  (GROUP_CONCAT(DISTINCT ?typIri; separator=",") AS ?typ)
WHERE {
  {
    SELECT ?s (${zukunft ? "MIN" : "MAX"}(STR(?vkStart)) AS ?vkStartWahl)
      (MIN(STR(?loc)) AS ?vkOrtIri) WHERE {
      { SELECT DISTINCT ?loc WHERE { ${geoPattern} } }
      ?s schema:location ?loc .
      VALUES ?t { ${typListe} }
      ?s a ?t .
      FILTER NOT EXISTS { ?s schema:eventStatus schema:EventCancelled }
      ${terminPattern}
      FILTER EXISTS { ?s schema:name ?vkName . FILTER(lang(?vkName) = "de" || lang(?vkName) = "") }
      FILTER EXISTS { ?loc schema:name ?vkOrtName . FILTER(lang(?vkOrtName) = "de" || lang(?vkOrtName) = "") }
    }
    GROUP BY ?s
    ${ordnung}
    LIMIT ${limit}
  }
  BIND(IRI(?vkOrtIri) AS ?vkOrt)
  ${terminPattern}
  FILTER(STR(?vkStart) = ?vkStartWahl)
  ?s schema:name ?nameDe .
  FILTER(lang(?nameDe) = "de" || lang(?nameDe) = "")
  OPTIONAL { ?s schema:description ?descDe . FILTER(lang(?descDe) = "de" || lang(?descDe) = "") }
  OPTIONAL { ?s schema:url ?urlVal }
  OPTIONAL { ?s schema:isAccessibleForFree ?freeVal }
  OPTIONAL { ?s a ?typIri }
  OPTIONAL {
    ?s schema:image ?imgObj . ?imgObj schema:contentUrl ?imgUrl .
    OPTIONAL { ?imgObj schema:name ?imgTitel . FILTER(lang(?imgTitel) = "de" || lang(?imgTitel) = "") }
    OPTIONAL { ?imgObj schema:license ?imgLizenz }
    OPTIONAL { ?imgObj schema:copyrightNotice ?imgCopyright . FILTER(lang(?imgCopyright) = "de" || lang(?imgCopyright) = "") }
    OPTIONAL { ?imgObj schema:copyrightHolder/schema:name ?imgUrheber . FILTER(lang(?imgUrheber) = "de" || lang(?imgUrheber) = "") }
    BIND(CONCAT(
      ENCODE_FOR_URI(STR(?imgUrl)), ";",
      ENCODE_FOR_URI(COALESCE(STR(?imgTitel), "")), ";",
      ENCODE_FOR_URI(COALESCE(STR(?imgLizenz), "")), ";",
      ENCODE_FOR_URI(COALESCE(STR(?imgCopyright), "")), ";",
      ENCODE_FOR_URI(COALESCE(STR(?imgUrheber), ""))
    ) AS ?imgNachweis)
  }
  ?vkOrt schema:name ?ortNameDe .
  FILTER(lang(?ortNameDe) = "de" || lang(?ortNameDe) = "")
  OPTIONAL {
    ?vkOrt schema:geo ?geo .
    ?geo schema:latitude ?latVal .
    ?geo schema:longitude ?lngVal .
  }
  OPTIONAL {
    ?vkOrt schema:address ?addr .
    OPTIONAL { ?addr schema:streetAddress ?streetVal }
    OPTIONAL { ?addr schema:postalCode ?postalVal }
    OPTIONAL { ?addr schema:addressLocality ?cityVal }
  }
}
GROUP BY ?s`;
}

/* GROUP_CONCAT-Datensaetze: URL;Titel;Lizenz;Copyright;Rechteinhaber.
 * Jedes Feld ist URI-encodiert, damit Pipes/Semikola im Originaltext erhalten
 * bleiben. Ein defekter Nachweis laesst die anderen und das Event intakt;
 * fehlt ein passender Nachweis, zeigt die Bildansicht die Luecke sichtbar. */
function vkParseBildnachweise(wert) {
  const nachweise = [];
  const gesehen = new Set();
  for (const datensatz of String(wert || "").split("|")) {
    const felder = datensatz.split(";");
    if (felder.length !== 5) continue;
    try {
      const [url, titel, lizenz, copyright, urheber] = felder.map((feld) => decodeURIComponent(feld).trim());
      if (!url) continue;
      const nachweis = { url, titel, lizenz, copyright, urheber };
      const key = JSON.stringify(nachweis);
      if (!gesehen.has(key)) { gesehen.add(key); nachweise.push(nachweis); }
    } catch (_error) { /* beschaedigte Prozentcodierung: Nachweis fehlt sichtbar */ }
  }
  return nachweise;
}

/*
 * parseEvents(bindings, zentrumLat, zentrumLon) -> Event[]
 *
 * Erwartet GROUP-BY-Zeilen (eine je Event). Dedupliziert per ?s (erste Zeile
 * gewinnt), ordnet aufsteigend nach startDatum und ist robust gegen fehlende
 * Geo-/Bild-/Preis-/Adress-Angaben. Events ohne Name werden verworfen.
 *
 * Event-Shape: { id, name, beschreibung, bilder[], bildnachweise[], url, typ (Key|null),
 *   startDatum, startZeit, endDatum, endZeit, ortName, adresse,
 *   lat, lon, distanzKm, kostenlos (true|false|null) }
 */
function parseEvents(bindings, zentrumLat, zentrumLon) {
  const rows = Array.isArray(bindings) ? bindings : [];
  const byId = new Map();
  const uriNachTyp = new Map(Object.values(VK_EVENT_TYPES).map((t) => [t.uri, null]));
  for (const key of Object.keys(VK_EVENT_TYPES)) uriNachTyp.set(VK_EVENT_TYPES[key].uri, key);

  for (const row of rows) {
    const id = row.s && row.s.value;
    if (!id || byId.has(id)) continue;
    const name = row.name && row.name.value ? String(row.name.value).trim() : "";
    if (!name) continue;

    const typStr = row.typ && row.typ.value ? String(row.typ.value) : "";
    let typ = null;
    for (const iri of typStr.split(",")) {
      const key = uriNachTyp.get(iri.trim());
      if (key) { typ = key; break; }
    }

    const lat = row.lat && row.lat.value != null && Number.isFinite(Number(row.lat.value)) ? Number(row.lat.value) : null;
    const lon = row.lng && row.lng.value != null && Number.isFinite(Number(row.lng.value)) ? Number(row.lng.value) : null;

    const teile = [row.street && row.street.value, row.postal && row.postal.value, row.city && row.city.value];
    const adresse = teile.filter(Boolean).length ? [teile[0], [teile[1], teile[2]].filter(Boolean).join(" ")].filter(Boolean).join(", ") : null;

    let kostenlos = null;
    if (row.kostenlos && row.kostenlos.value != null) {
      kostenlos = String(row.kostenlos.value).trim() === "true";
    }

    byId.set(id, {
      id,
      name,
      beschreibung: row.desc && row.desc.value ? String(row.desc.value).trim() : null,
      bilder: row.img && row.img.value ? String(row.img.value).split("|").map((s) => s.trim()).filter(Boolean) : [],
      bildnachweise: vkParseBildnachweise(row.bildnachweise && row.bildnachweise.value),
      url: row.url && row.url.value ? String(row.url.value) : null,
      typ,
      startDatum: normalisiereDatum(row.startDatum && row.startDatum.value),
      startZeit: zeitAnteil(row.startZeitRaw && row.startZeitRaw.value) || zeitAnteil(row.startDatum && row.startDatum.value),
      endDatum: normalisiereDatum(row.endDatum && row.endDatum.value),
      endZeit: zeitAnteil(row.endDatum && row.endDatum.value),
      ortName: row.ortName && row.ortName.value ? String(row.ortName.value).trim() : null,
      adresse,
      lat,
      lon,
      distanzKm: lat != null && lon != null ? Math.round(haversineKm(zentrumLat, zentrumLon, lat, lon) * 10) / 10 : null,
      kostenlos
    });
  }

  return Array.from(byId.values()).sort((a, b) => String(a.startDatum || "").localeCompare(String(b.startDatum || "")));
}

/* ---------------------------------------------------------------------------
 * Datenlayer – Task 3: Zukunft/Archiv-Split, Filter, Tagesgruppen
 * --------------------------------------------------------------------------- */

/*
 * splitZukunftArchiv(events, heuteKey) -> { zukunft, archiv }
 *
 * Archiv: Events, deren (endDatum || startDatum) vor heute liegt.
 * Zukunft: alle übrigen – auch heute laufende (start <= heute <= end).
 * Events ohne jedes Datum werden verworfen (Query setzt startDate voraus,
 * dies ist nur eine robuste Rückfallebene).
 */
function splitZukunftArchiv(events, heuteKey) {
  const zukunft = [];
  const archiv = [];
  for (const e of Array.isArray(events) ? events : []) {
    const maßstab = e.endDatum || e.startDatum;
    if (!maßstab || !e.startDatum) continue;
    if (String(maßstab) < String(heuteKey)) archiv.push(e);
    else zukunft.push(e);
  }
  return { zukunft, archiv };
}

/*
 * filterEvents(events, { suche, typen, zeitraum, heuteKey, kostenlosNur }) -> Event[]
 *
 * Rein Schema-basiert: typen = EVENT_TYPES-Keys, zeitraum = Fenster auf
 * startDatum, kostenlosNur = schema:isAccessibleForFree === true.
 * suche = Freitext-Suche (case-insensitiv) über Name/Beschreibung/Ort – keine
 * Kategorie-Ableitung aus Texten.
 */
function filterEvents(events, optionen) {
  const quelle = Array.isArray(events) ? events : [];
  const suche = String((optionen && optionen.suche) || "").trim().toLowerCase();
  // Duck-Typing statt instanceof Set: Sets aus anderen Realms (Tests, iframe) bleiben nutzbar.
  const hatTypen = !!(optionen && optionen.typen && typeof optionen.typen.has === "function");
  const typen = hatTypen ? optionen.typen : null;
  const zeitraum = String((optionen && optionen.zeitraum) || "alle");
  const heuteKey = String((optionen && optionen.heuteKey) || "");
  const kostenlosNur = !!(optionen && optionen.kostenlosNur);

  let fensterEnde = null;
  if (zeitraum === "heute" || zeitraum === "1") fensterEnde = heuteKey;
  else if (zeitraum === "7" || zeitraum === "30" || zeitraum === "90") fensterEnde = plusTage(heuteKey, Number(zeitraum) - 1);

  return quelle.filter((e) => {
    if (typen && typen.size > 0 && !typen.has(e.typ)) return false;
    if (kostenlosNur && e.kostenlos !== true) return false;
    if (fensterEnde) {
      /* Ueberlappungs-Fenster: sichtbar, wenn das Event im Zeitraum laeuft
       * (Review-Fix 1) – auch gestern gestartete, heute laufende Events. */
      const laeuftBis = String(e.endDatum || e.startDatum || "");
      if (!e.startDatum || laeuftBis < heuteKey || String(e.startDatum) > fensterEnde) return false;
    }
    if (suche) {
      const heusenhaufen = `${e.name} ${e.beschreibung || ""} ${e.ortName || ""}`.toLowerCase();
      if (!heusenhaufen.includes(suche)) return false;
    }
    return true;
  });
}

/*
 * tagGruppen(events, heuteKey) -> [{ key, label, events }]
 *
 * Tagesgruppen aufsteigend; Label „Heute“, „Morgen“, danach
 * „<Wochentag kurz>, <Tag>. <Monat kurz>“ (de-DE, z. B. „Fr., 2. Okt.“).
 */
function tagGruppen(events, heuteKey) {
  const gruppen = new Map();
  for (const e of Array.isArray(events) ? events : []) {
    if (!e.startDatum) continue;
    const key = String(e.startDatum);
    if (!gruppen.has(key)) gruppen.set(key, []);
    gruppen.get(key).push(e);
  }
  const fmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short" });
  return Array.from(gruppen.keys()).sort().map((key) => {
    let label;
    if (key === heuteKey) label = "Heute";
    else if (key === plusTage(heuteKey, 1)) label = "Morgen";
    else {
      const d = new Date(`${key}T00:00:00`);
      label = Number.isNaN(d.getTime()) ? key : fmt.format(d);
    }
    return { key, label, events: gruppen.get(key) };
  });
}

/* ---------------------------------------------------------------------------
 * Datenlayer – Task 4: ICS-Kalender-Export (RFC 5545)
 * --------------------------------------------------------------------------- */

/*
 * icsEscape(text) – Backslash zuerst, dann Semikolon/Komma, Newlines als \n.
 */
function icsEscape(text) {
  return String(text == null ? "" : text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/*
 * icsTimestamp(datumKey, zeit) -> "YYYYMMDDTHHMMSS" (floating local time).
 * plusStunden erlaubt die +2h-DTEND-Fallback-Regel inkl. Mitternacht-Rollover
 * (Rechnung in UTC-Koordinaten ohne Offset = reine lokale Kalenderarithmetik).
 */
function icsTimestamp(datumKey, zeit, plusStunden = 0) {
  const t = String(zeit || "00:00").match(/^(\d{2}):(\d{2})/);
  const [y, m, d] = String(datumKey).split("-");
  const basis = Date.UTC(Number(y), Number(m) - 1, Number(d), t ? Number(t[1]) : 0, t ? Number(t[2]) : 0);
  const ts = new Date(basis + plusStunden * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${String(ts.getUTCFullYear()).padStart(4, "0")}${pad(ts.getUTCMonth() + 1)}${pad(ts.getUTCDate())}T${pad(ts.getUTCHours())}${pad(ts.getUTCMinutes())}00`;
}

/*
 * safeHttpUrl(url) -> string – daten-gelieferte URLs duerfen nur mit
 * http/https-Scheme verlinkt werden (Review-Fix 2): blockt javascript:/data:
 * u.ae. aus Fremddaten. Gueltige URLs kommen unveraendert zurueck, sonst "".
 */
function safeHttpUrl(url) {
  const text = String(url == null ? "" : url).trim();
  if (!text || /[\u0000-\u0020]/.test(text) || text.startsWith("//")) return "";
  try {
    const parsed = new URL(text);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return "";
    return text;
  } catch (_error) {
    return "";
  }
}

/*
 * buildIcs(event, icsUrl) -> string
 *
 * VEVENT mit terminspezifischer UID aus Event-ID und Datum/Zeit, floating local
 * DTSTART/DTEND (ohne endDatum: +2h; ohne Zeitangabe ganztägig per
 * VALUE=DATE, mehrtägig bis endDatum), SUMMARY/LOCATION/GEO/DESCRIPTION
 * (max 500 Zeichen) escaped, URL nur wenn geliefert, DTSTAMP als UTC-Now.
 * Zeilenenden CRLF.
 */
function buildIcs(event, icsUrl) {
  const e = event || {};
  const startDatum = e.startDatum || "";
  /* 00:00-Uhrzeit gilt als ganztägig (Review-Fix 3c, Spec §7) */
  const ganztaegig = !e.startZeit || e.startZeit === "00:00";

  const jetzt = new Date();
  const padUtc = (n) => String(n).padStart(2, "0");
  const dtstamp =
    `${String(jetzt.getUTCFullYear()).padStart(4, "0")}${padUtc(jetzt.getUTCMonth() + 1)}${padUtc(jetzt.getUTCDate())}` +
    `T${padUtc(jetzt.getUTCHours())}${padUtc(jetzt.getUTCMinutes())}${padUtc(jetzt.getUTCSeconds())}Z`;

  const zeilen = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ODAS//Veranstaltungskalender//DE",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${icsEscape(String(e.id || "") + "|" + vkTerminSchluessel(e))}@odas-veranstaltungskalender`,
    `DTSTAMP:${dtstamp}`
  ];

  if (ganztaegig) {
    zeilen.push(`DTSTART;VALUE=DATE:${startDatum.replace(/-/g, "")}`);
    /* RFC 5545: DTEND ist EXKLUSIV. endDatum ist in der App inklusiv
     * (splitZukunftArchiv/Zeitraumfilter) -> DTEND = letzter Tag + 1. Sonst
     * endete ein mehrtägiger Termin einen Tag zu früh und ein eintägiger
     * (endDatum = startDatum) hatte die Dauer null. */
    const letzterTag = e.endDatum && String(e.endDatum) > String(startDatum) ? String(e.endDatum) : String(startDatum);
    zeilen.push(`DTEND;VALUE=DATE:${plusTage(letzterTag, 1).replace(/-/g, "")}`);
  } else {
    zeilen.push(`DTSTART:${icsTimestamp(startDatum, e.startZeit)}`);
    if (e.endDatum && e.endZeit) {
      zeilen.push(`DTEND:${icsTimestamp(e.endDatum, e.endZeit)}`);
    } else if (e.endDatum) {
      zeilen.push(`DTEND:${icsTimestamp(e.endDatum, e.startZeit)}`);
    } else {
      zeilen.push(`DTEND:${icsTimestamp(startDatum, e.startZeit, 2)}`);
    }
  }

  zeilen.push(`SUMMARY:${icsEscape(e.name)}`);

  const locationTeile = [e.ortName, e.adresse].filter(Boolean);
  if (locationTeile.length) zeilen.push(`LOCATION:${icsEscape(locationTeile.join(", "))}`);

  if (e.lat != null && e.lon != null) zeilen.push(`GEO:${e.lat};${e.lon}`);

  if (e.beschreibung) {
    const desc = icsEscape(e.beschreibung).slice(0, 500).replace(/\\$/, "");
    zeilen.push(`DESCRIPTION:${desc}`);
  }

  /* ICS-URL-Zeile: Scheme-Guard + CRLF-Strip (Review-Fix 2) */
  const urlRoh = String(icsUrl || e.url || "").split(/[\r\n]/)[0].trim();
  const urlSicher = safeHttpUrl(urlRoh);
  if (urlSicher) zeilen.push(`URL:${urlSicher}`);

  zeilen.push("END:VEVENT", "END:VCALENDAR");
  return zeilen.map(vkFaldeIcsZeile).join("\r\n") + "\r\n";
}

/* v1.2.5 (D-7): RFC-5545-Zeilenfaltung – Zeilen max. 75 Oktette (UTF-8),
 * Folgezeilen beginnen mit einem Leerzeichen. Entfaltung (CRLF+Space
 * entfernen) ergibt wieder die Originalzeile. */
function vkFaldeIcsZeile(zeile) {
  const oktett = (c) => {
    const cp = c.codePointAt(0);
    return cp > 0x7F ? new TextEncoder().encode(c).length : 1;
  };
  const zeichen = Array.from(String(zeile));
  if (new TextEncoder().encode(String(zeile)).length <= 75) return String(zeile);
  const teile = [];
  let rest = [];
  let breite = 0;
  let grenze = 75; /* Folgezeilen: grenze 74, da das Fuehrzeichen mitzaehlt */
  for (const c of zeichen) {
    const b = oktett(c);
    if (breite + b > grenze) {
      teile.push(rest.join(""));
      rest = [];
      breite = 0;
      grenze = 74;
    }
    rest.push(c);
    breite += b;
  }
  if (rest.length) teile.push(rest.join(""));
  return teile.join("\r\n "); /* Folgezeilen: CRLF + Leerzeichen (RFC 5545 §3.1) */
}

/* ---------------------------------------------------------------------------
 * v1.3.0: Teilen – Link, Nachrichtentext, Kanaele, Markup
 * Reine Funktionen (node-testbar); das Verdrahten im Browser uebernimmt
 * zeigeEventDetail.
 * --------------------------------------------------------------------------- */

/*
 * vkTeilenLink(basisHref, eventId, termin) -> string
 * Setzt die Event-ID und optional den konkreten Termin. Alte event-only-Links
 * bleiben lesbar; veraltete Terminparameter werden immer entfernt.
 * Entfernt den Hash. Andere Parameter bleiben erhalten. Leerer String, wenn
 * die Adresse unbrauchbar ist oder die Kennung fehlt – der Aufrufer laesst
 * die Teilen-Reihe dann weg.
 */
function vkTeilenLink(basisHref, eventId, termin) {
  if (!eventId) return "";
  try {
    const adresse = new URL(String(basisHref || ""));
    adresse.searchParams.set("event", String(eventId));
    adresse.searchParams.delete("termin");
    if (termin) adresse.searchParams.set("termin", String(termin));
    adresse.hash = "";
    return adresse.href;
  } catch (_error) {
    return "";
  }
}

/*
 * vkTeilenText(event) -> string
 * Erste Zeile der Nachricht: Name. Zweite Zeile: Datum (bei mehrtraegigen
 * Veranstaltungen als Zeitraum) und Ort, durch " · " getrennt. Bewusst ohne
 * Beschreibung, damit die Nachricht in Messengern vollstaendig lesbar bleibt.
 */
function vkTeilenText(event) {
  const e = event || {};
  const start = vkDatumText(e.startDatum);
  const ende = e.endDatum && String(e.endDatum) !== String(e.startDatum) ? vkDatumText(e.endDatum) : "";
  const datum = ende ? `${start} – ${ende}` : start;
  const ort = String(e.ortName || "").trim();
  return [String(e.name || "").trim(), [datum, ort].filter(Boolean).join(" · ")].filter(Boolean).join("\n");
}

/*
 * vkTeilenNachricht(event, link) -> string
 * Der vollstaendige Nachrichtentext: Angaben zur Veranstaltung, dann der Link.
 */
function vkTeilenNachricht(event, link) {
  return [vkTeilenText(event), String(link || "")].filter(Boolean).join("\n");
}

/*
 * vkTeilenZiele(event, link) -> Array<{key,label,aria,href}>
 * Die festen Teilen-Wege. Die Adressen werden vollstaendig prozentkodiert,
 * damit fremde Veranstaltungsnamen die Attributgrenzen nicht aufbrechen
 * koennen.
 */
function vkTeilenZiele(event, link) {
  const e = event || {};
  const nachricht = vkTeilenNachricht(e, link);
  const name = String(e.name || "").trim();
  return [
    {
      key: "whatsapp",
      label: "💬 WhatsApp",
      aria: "Per WhatsApp teilen",
      href: `https://wa.me/?text=${encodeURIComponent(nachricht)}`
    },
    {
      key: "x",
      label: "X",
      aria: "Auf X teilen",
      href: `https://x.com/intent/post?text=${encodeURIComponent(nachricht)}`
    },
    {
      key: "email",
      label: "✉️ E-Mail",
      aria: "Per E-Mail teilen",
      href: `mailto:?subject=${encodeURIComponent(name)}&body=${encodeURIComponent(nachricht)}`
    }
  ];
}

/*
 * vkGeteilteEventId(search) -> string
 * Liest die Kennung aus dem Adressteil (z. B. "?event=urn%3Ae1").
 * URLSearchParams.get liefert null, wenn der Parameter fehlt – daraus darf
 * nicht der Text "null" werden.
 */
function vkGeteilteEventId(search) {
  const wert = new URLSearchParams(String(search || "")).get("event");
  return wert ? String(wert).trim() : "";
}

/*
 * vkTeilenHtml(event, link, native) -> string
 * Die Teilen-Reihe fuer das Detailfenster. Ohne Link kein Markup (Teilen waere
 * sinnlos).
 *
 * Die festen Wege sind IMMER sichtbar, nicht nur ohne Geraetemenue: das
 * Geraetemenue des Betriebssystems kennt auf dem Rechner kein X, und eine
 * Schaltflaeche, die je nach Geraet verschwindet, ist nicht verlaesslich.
 * Bietet das Geraet ein Menue an, kommt es als erste Schaltflaeche dazu.
 */
function vkTeilenHtml(event, link, native) {
  const sichererLink = String(link || "").trim();
  if (!sichererLink) return "";

  const schaltflaechen = [];
  if (native) {
    schaltflaechen.push(
      `<button type="button" class="vk-teilen-btn vk-teilen-btn-primaer" data-vk-teilen-native="1" aria-label="Veranstaltung teilen">📤 Teilen</button>`
    );
  }
  vkTeilenZiele(event, sichererLink).forEach((ziel) => {
    schaltflaechen.push(
      `<a class="vk-teilen-btn" href="${escapeHtml(ziel.href)}" target="_blank" rel="noopener" aria-label="${escapeHtml(ziel.aria)}">${escapeHtml(ziel.label)}</a>`
    );
  });
  schaltflaechen.push(
    `<button type="button" class="vk-teilen-btn" data-vk-teilen-kopieren="1" aria-label="Link zur Veranstaltung kopieren">🔗 Link kopieren</button>`
  );

  return (
    `<div class="vk-detail-teilen"><div class="vk-detail-label">Teilen</div>` +
    `<div class="vk-teilen-reihe">${schaltflaechen.join("")}</div>` +
    `<p class="vk-teilen-status" role="status" aria-live="polite"></p></div>`
  );
}

/*
 * vkAktuelleBasisHref() -> string
 * Die aktuell angezeigte Adresse als Grundlage fuer den geteilten Link.
 * Ohne Fensterkontext (Node-Tests) leer – dann entfaellt die Teilen-Reihe.
 */
function vkAktuelleBasisHref() {
  try {
    return typeof window !== "undefined" && window.location && window.location.href ? window.location.href : "";
  } catch (_error) {
    return "";
  }
}

/*
 * vkKopiereLink(text, behaelter) -> Promise<boolean>
 * Bevorzugt die Zwischenablage-Schnittstelle, faellt sonst auf den alten
 * Auswahl-Befehl zurueck. Der ist noetig, weil die Schnittstelle nur in
 * gesicherten Kontexten existiert: ueber https oder auf der eigenen
 * Rechneradresse (localhost, 127.0.0.1). Die Testinstanz laeuft ueber http
 * auf einer anderen Adresse und hat sie deshalb nicht.
 *
 * behaelter ist der Ort fuer das Hilfselement des Rueckfalls. Er MUSS innerhalb
 * des offenen Fensters liegen (im Detailfenster also das Modal selbst): die
 * Fokusfalle von Bootstrap zieht den Fokus sonst zurueck ins Modal, die Auswahl
 * geht verloren und der Kopierbefehl meldet Erfolg, ohne etwas zu kopieren
 * (gemessen 2026-10-01: Hilfselement an document.body -> Fokus nicht darauf,
 * Zwischenablage unveraendert).
 */
async function vkKopiereLink(text, behaelter) {
  const wert = String(text || "");
  if (!wert) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(wert);
      return true;
    }
  } catch (_error) { /* weiter zum Rueckfall */ }
  const ziel = behaelter && typeof behaelter.appendChild === "function" ? behaelter : document.body;
  let feld = null;
  try {
    feld = document.createElement("textarea");
    feld.value = wert;
    feld.setAttribute("readonly", "");
    feld.style.position = "fixed";
    feld.style.top = "-1000px";
    feld.style.opacity = "0";
    ziel.appendChild(feld);
    feld.select();
    return !!document.execCommand("copy");
  } catch (_error) {
    return false;
  } finally {
    /* Auch wenn Auswahl oder Kopierbefehl werfen: kein Hilfselement
     * im DOM zuruecklassen (Review-Befund 2026-10-01). */
    if (feld) {
      try { ziel.removeChild(feld); } catch (_error) { /* nie angehaengt */ }
    }
  }
}

/*
 * vkTeileNativ(event) – oeffnet das Teilen-Menue des Geraets.
 * Der Text enthaelt den Link bereits; ein zusaetzliches url-Feld wuerde ihn
 * bei manchen Zielen doppelt anzeigen. Ein Nutzerabbruch im Menue ist kein
 * Fehler und wird deshalb nicht gemeldet.
 */
function vkTeileNativ(event) {
  try {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") return;
    const link = vkTeilenLink(vkAktuelleBasisHref(), event.id, vkTerminSchluessel(event));
    if (!link) return;
    const ergebnis = navigator.share({ title: String(event.name || ""), text: vkTeilenNachricht(event, link) });
    if (ergebnis && typeof ergebnis.catch === "function") ergebnis.catch(() => {});
  } catch (_error) { /* Menue nicht verfuegbar */ }
}

/*
 * vkGeteiltHinweisHtml() -> string
 * Hinweis, wenn ein geteilter Link ins Leere zeigt. Nutzt das vorhandene
 * .vk-status-Muster, damit der Zustand aussieht wie die uebrigen Meldungen.
 */
function vkGeteiltHinweisHtml() {
  return (
    '<div class="vk-status"><div class="vk-status-titel">Geteilte Veranstaltung nicht gefunden</div>' +
    '<p class="vk-status-text">Die geteilte Veranstaltung liegt außerhalb des aktuell geladenen Zeitraums oder Umkreises.</p></div>'
  );
}

/*
 * vkPruefeGeteiltenLink(state)
 * Wertet den Parameter "event" aus der Adresse genau einmal aus, sobald die
 * Veranstaltungen geladen sind. Gesucht wird im GESAMTEN Bestand (inklusive
 * Archiv), nicht in der gefilterten Liste – wer einen Link teilt, meint diese
 * Veranstaltung, unabhaengig von den Filtern des Empfaengers. Ohne Treffer
 * bleibt der Kalender stehen und ein Hinweis erklaert die Lage; der Text der
 * geteilten Nachricht traegt Name, Datum und Ort ohnehin mit sich.
 */
function vkPruefeGeteiltenLink(state) {
  if (!state || state.geteiltGeprueft || state.status !== "bereit") return;
  const id = vkGeteilteEventId(typeof window !== "undefined" && window.location ? window.location.search : "");
  if (!id) { state.geteiltGeprueft = true; return; }
  const termin = new URLSearchParams(typeof window !== "undefined" && window.location ? window.location.search : "").get("termin");
  const event = vkFindeEvent(state, id, termin);
  if (event) {
    state.geteiltGeprueft = true;
    zeigeEventDetail(state, event);
    return;
  }
  if (state.aktualisiert || (state.events && state.events.archivGeladen === false)) {
    state.geteiltLaden = true;
    if (!state.aktualisiert) vkLadeArchiv(state);
    return;
  }
  state.geteiltGeprueft = true;
  state.geteiltHinweis = true;
}

/* ---------------------------------------------------------------------------
 * Datenlayer – Task 5: Relay-Fetch, Geocoding, ladeEvents
 * --------------------------------------------------------------------------- */

/* Liefert den App-Basispfad fuer /app/, /app und /app/index.html.
 * Uebernommen aus odas-app-builder/references/odas_proxy_reference.js
 * (Muster odas-app-wanderwege). */
function getOdasAppBasePath(pathname = window.location.pathname) {
  let appPath = String(pathname || "/");
  if (!appPath.endsWith("/")) {
    const lastSlashIndex = appPath.lastIndexOf("/");
    const lastSegment = appPath.substring(lastSlashIndex + 1);
    if (lastSegment.includes(".")) appPath = appPath.substring(0, lastSlashIndex + 1);
  }
  return appPath.replace(/\/+$/, "");
}

/* Der Relay haengt an https://proxy.opendatagermany.io/api/ an – der
 * konfigurierte SPARQL-Endpunkt verliert dafuer sein "/api/"-Praefix. */
function dztApiPath(apiurl) {
  try {
    return new URL(String(apiurl || "")).pathname.replace(/^\/+api\/?/, "");
  } catch (_error) {
    return "";
  }
}

/* Loest eine benannte Datenressource aus configdata.apiurls auf.
 * @returns {string} getrimmte URL oder "" fuer "keine Quelle konfiguriert" */
function getOdasApiUrl(configdata, name) {
  const liste = Array.isArray(configdata && configdata.apiurls) ? configdata.apiurls : [];
  const treffer = liste.find((eintrag) => eintrag && eintrag.name === name);
  return String((treffer && treffer.url) || "").trim();
}

/*
 * fetchKgJson(path, extraHeaders, signal) – GET ueber den ODAS-DZT-Relay
 * (GET <appPath>/dzt?path=<pfad>). Kein API-Key im App-Code. Die Antwort wird
 * als Text gelesen und erst dann geparst: HTML-Fehlerseiten oder leere Bodies
 * werfen eine Klartext-Fehlermeldung statt eines nackten JSON.parse-Crashs (F-66).
 */
/* v1.2.5 (D-5), v1.2.7: Haengende Netz-Requests enden nach Zeitlimit in einer
 * Klartext-Meldung statt eines endlosen Ladezustands. Ein Abbruch durch
 * Seitenwechsel (signal) bleibt AbortError und wird wie bisher behandelt.
 * Das Zeitlimit umfasst seit v1.2.7 auch das LESEN des Antwortkoerpers: der
 * frueher mit den Headern geloeschte Timer liess einen haengenden Body
 * unbegrenzt weiterlaufen, und der Seitenwechsel-Abbruch erreichte ihn nicht mehr. */
async function vkZeitlimitFetch(url, init, signal, ms) {
  let zeitAbgelaufen = false;
  const controller = new AbortController();
  const timer = setTimeout(() => { zeitAbgelaufen = true; controller.abort(); }, ms || 20000);
  const reaktiv = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      const abbruch = new Error("Abgebrochen");
      abbruch.name = "AbortError";
      throw abbruch;
    }
    signal.addEventListener("abort", reaktiv);
  }
  try {
    const response = await fetch(url, { ...(init || {}), signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (fehler) {
    if (zeitAbgelaufen) {
      throw new Error(`Die Verbindung wurde nach ${Math.round((ms || 20000) / 1000)} Sekunden abgebrochen (Zeitlimit). Bitte später erneut laden.`);
    }
    throw fehler;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", reaktiv);
  }
}

async function fetchKgJson(path, extraHeaders = {}, signal) {
  const headers = { accept: "application/json", ...extraHeaders };
  const url = `${getOdasAppBasePath()}/dzt?path=${encodeURIComponent(path)}`;

  let response;
  try {
    response = await vkZeitlimitFetch(url, { headers }, signal, 75000);
  } catch (error) {
    if (error && error.name === "AbortError") throw error;
    throw new Error("Die Verbindung zum DZT-Relay ist fehlgeschlagen. Steht die App innerhalb einer ODAS-Instanz bereit?");
  }
  if (!response.ok) {
    throw new Error(`Der DZT-Relay antwortete mit HTTP ${response.status}. Steht die App innerhalb einer ODAS-Instanz bereit?`);
  }
  try {
    return JSON.parse(response.text);
  } catch (_error) {
    throw new Error("Die Antwort war kein JSON (häufig eine HTML-Fehlerseite). Bitte die Instanz-Konfiguration prüfen.");
  }
}

/*
 * geocodeOrt(ort, signal) -> { lat, lon } | null
 * Nominatim (OpenStreetMap), keyless, einmalig je Instanz-Aufruf.
 */
async function geocodeOrt(ort, signal) {
  const q = String(ort || "").trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  try {
    const response = await vkZeitlimitFetch(url, { headers: { accept: "application/json" } }, signal, 8000);
    if (!response.ok) return null;
    const treffer = JSON.parse(response.text);
    const erste = Array.isArray(treffer) ? treffer[0] : null;
    if (!erste) return null;
    const lat = Number(erste.lat);
    const lon = Number(erste.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch (error) {
    if (error && error.name === "AbortError") throw error;
    return null;
  }
}

/* Lokales heutiges Datum als YYYY-MM-DD. */
function heutigerTagKey() {
  const jetzt = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${jetzt.getFullYear()}-${pad(jetzt.getMonth() + 1)}-${pad(jetzt.getDate())}`;
}

/*
 * ladeEvents(configdata, signal, optionen) -> { zukunft, archiv, geo, heuteKey } | null
 *
 * null = keine Datenquelle konfiguriert (Guard gegen fetch("")).
 * Wirft Klartext-Fehler bei ungueltigem Ort oder nicht ableitbarem Endpunkt.
 * Geo-Trefferpruefung, dann Teilabfragen je Zeitfenster.
 * Globale Grenzen: 600 kommende / 400 vergangene IDs, Archiv absteigend.
 * optionen.modus: zukunft beim Start, archiv bei Bedarf; ohne Angabe beide.
 * optionen.vorlage: intern wiederverwendeter Geo-Plan derselben Konfiguration.
 * optionen.heuteKey ist Test-Hook (Standard: lokales Heute).
 */
async function ladeEvents(configdata, signal, optionen) {
  const apiurl = getOdasApiUrl(configdata, "veranstaltungen");
  if (!apiurl) return null;

  const ort = String((configdata && configdata.ort) || "").trim();
  if (!ort) {
    throw Object.assign(new Error("Es ist kein Ort konfiguriert. Bitte in der Instanz-Konfiguration einen Ort eintragen."), { konfig: true });
  }

  let fortschrittAktiv = true;
  const meldeFortschritt = (fortschritt) => {
    if (fortschrittAktiv && !(signal && signal.aborted) && optionen && typeof optionen.onFortschritt === "function") {
      optionen.onFortschritt(fortschritt);
    }
  };
  const heuteKey = (optionen && optionen.heuteKey) || heutigerTagKey();
  const modus = optionen && optionen.modus;
  const vorlage = optionen && optionen.vorlage && optionen.vorlage.heuteKey === heuteKey ? optionen.vorlage : null;
  if (!vorlage) meldeFortschritt({ phase: "ort" });
  const geo = vorlage ? vorlage.geo : await geocodeOrt(ort, signal);
  if (!geo) {
    throw Object.assign(new Error(`Der Ort „${ort}“ konnte über OpenStreetMap nicht gefunden werden. Bitte die Instanz-Konfiguration prüfen.`), { konfig: true });
  }

  const base = dztApiPath(apiurl);
  if (!base) {
    throw new Error("Der SPARQL-Endpunkt konnte nicht aus der Instanz-Konfiguration abgeleitet werden.");
  }

  const radiusKm = String((configdata && configdata.radiusKm) || "25");
  if (!vorlage) meldeFortschritt({ phase: "geo" });
  const geoQueries = vorlage ? vorlage.geoQueries : await vkPlaneGeoAbfragen(base, geo.lat, geo.lon, radiusKm, signal);
  const archivGeladen = modus !== "zukunft" || !geoQueries.length;
  if (!geoQueries.length) return { zukunft: [], archiv: [], archivGeladen, geo, geoQueries, heuteKey };
  let erledigt = 0;
  const gesamt = geoQueries.length * (modus ? 1 : 2);
  meldeFortschritt({ phase: "events", erledigt, gesamt });

  const sparqlRequest = (modus, geoQuery) => {
    // Relay-GET kodiert doppelt: Layout kuerzen, Literale/IRIs unveraendert lassen.
    const query = buildSparqlQuery({ modus, lat: geo.lat, lon: geo.lon, radiusKm, heuteKey, geoQuery })
      .split("\n").map((line) => line.trim()).join(" ")
      .replace(/"(?:\\.|[^"\\])*"|<[^<>\s]*>|\s*([{}();,=])\s*/g, (text, zeichen) => zeichen || text);
    const path = `${base}?${new URLSearchParams({ query }).toString()}`;
    return fetchKgJson(path, { accept: "application/sparql-results+json" }, signal);
  };

  /* Ein Relay ohne gueltiges results.bindings ist ein Fehlerzustand,
   * kein "leeres Programm" – auch bei einer einzelnen Teilabfrage. */
  const leseBindings = (json, bereich) => {
    if (!json || !json.results || !Array.isArray(json.results.bindings)) {
      throw new Error(`Unerwartetes Antwortformat des DZT-Relays (${bereich}). Bitte die Instanz-Konfiguration und den Datenstand prüfen.`);
    }
    return json.results.bindings;
  };
  /* Ein Geo-Literal je GET verhindert HTTP 414. Je Zeitfenster laufen die
   * Teile nacheinander, beide Zeitfenster parallel (max. zwei Anfragen).
   * Die ersten N IDs jeder Teilmenge enthalten auch die global ersten N. */
  const ladeBereich = async (modus) => {
    const rows = [];
    const bereich = modus === "zukunft" ? "kommende Veranstaltungen" : "Archiv";
    for (const geoQuery of geoQueries) {
      if (!fortschrittAktiv) break;
      try {
        rows.push(...leseBindings(await sparqlRequest(modus, geoQuery), bereich));
      } catch (fehler) {
        fortschrittAktiv = false;
        throw fehler;
      }
      meldeFortschritt({ phase: "events", erledigt: ++erledigt, gesamt });
    }
    rows.sort((a, b) => {
      const datum = String(a.startDatum && a.startDatum.value || "").localeCompare(String(b.startDatum && b.startDatum.value || ""));
      return (modus === "zukunft" ? datum : -datum) || String(a.s && a.s.value || "").localeCompare(String(b.s && b.s.value || ""));
    });
    const unique = new Map();
    const limit = modus === "zukunft" ? VK_LIMIT_ZUKUNFT : VK_LIMIT_ARCHIV;
    for (const row of rows) {
      const id = row.s && row.s.value;
      if (id && !unique.has(id)) unique.set(id, row);
      if (unique.size === limit) break;
    }
    return Array.from(unique.values());
  };
  let zukunftRows, archivRows;
  try {
    [zukunftRows, archivRows] = await Promise.all([
      modus === "archiv" ? [] : ladeBereich("zukunft"),
      modus === "zukunft" ? [] : ladeBereich("archiv")
    ]);
  } finally {
    fortschrittAktiv = false;
  }
  const zukunft = parseEvents(zukunftRows, geo.lat, geo.lon);
  const archiv = parseEvents(archivRows, geo.lat, geo.lon).reverse();

  return { zukunft, archiv, archivGeladen, geo, geoQueries, heuteKey };
}

/*
 * Diese Funktion kann Bibliotheken und benötigte Skripte laden.
 * Leaflet und markercluster werden ueber eigene dynamische Loader geladen,
 * nicht ueber diesen leeren Kompatibilitaets-Hook.
 */
function addToHead() {}
