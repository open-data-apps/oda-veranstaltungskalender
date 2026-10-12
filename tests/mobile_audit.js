/*
 * tests/mobile_audit.js – Mobile-Audit-Harness (v1.2.3, 30.09.2026).
 * Headless Chrome via CDP (Muster: tests/screenshot.js). KEIN Bestandteil des
 * ODAS-Store-Pakets (tests/ ist nicht im ZIP).
 *
 * Nutzung: node tests/mobile_audit.js <suite>
 *   Suites: sweep (13 Viewports Geometrie) | zustaende (375+390 Interaktions-
 *           zustaende) | flows (375 Nutzerablaeufe, Fixture + Live) |
 *           fehler (375 Fixturedaten error|empty|xss|html-200) | a11y (375) |
 *           bildnachweise (375+1366, Quellen/Lizenzen in allen Bildansichten) |
 *           modal (375+1366, echte Bootstrap-Uebergaenge/Fokus/Cleanup)
 * Ausgabe: JSON-Zeilen je Pruefung: { suite, id, viewport, pass, details }
 * Evidenz: Geometrie-Messungen (keine visuelle Bildpruefung durch den Agent);
 *          Screenshots werden als Artefakte separat erzeugt.
 * Hosts, Browser und CDP-Port: VK_FIXTURE_HOST (127.0.0.1:8765), VK_LIVE_HOST
 * (nur für flows erforderlich), VK_CHROME (google-chrome) und optional VK_CDP_PORT.
 * Ohne Portvorgabe vergibt das Betriebssystem je Browser einen freien Port.
 */
const { spawn } = require("child_process");
const fixturePreload = require("./fixture-preload");
const CHROME = process.env.VK_CHROME || "google-chrome";
const FIXTURE_HOST = process.env.VK_FIXTURE_HOST || "127.0.0.1:8765";
const LIVE_HOST = (process.env.VK_LIVE_HOST || "").trim();
const FIXTURE_URL = `http://${FIXTURE_HOST}/app/`;
const LIVE_URL = LIVE_HOST ? `http://${LIVE_HOST}/view/audit-test/oda-veranstaltungskalender/cmuo0ajoh0001t12n0bqdkd2a/` : "";
let naechsterPort = Number(process.env.VK_CDP_PORT || 0);
const SUITES = ["sweep", "zustaende", "flows", "fehler", "interaktion", "sekundaer", "verlauf", "ruhig", "teilen", "modal", "bildnachweise", "a11y"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- Browsern */
async function mitChrome(breite, hoehe, url, injizieren, messen, warten, optionen) {
  const opt = optionen || {};
  let port = opt.port === 0 || !naechsterPort ? 0 : naechsterPort++;
  const profil = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'vk-audit-chrome-')); /* eigenes Profil: ohne dies dockt Chrome an die laufende Nutzer-Instanz an und exited sofort (Singleton) */
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars",
    `--user-data-dir=${profil}`,
    `--window-size=${breite},${hoehe}`,
    `--remote-debugging-port=${port}`,
    "--no-first-run", "--no-default-browser-check", "about:blank"
  ], { stdio: "ignore" });
  let startFehler, ws;
  chrome.on('error', e => { startFehler = e; });
  try {
    let tab;
    for (let versuch = 0; versuch < 40 && !tab; versuch++) {
      if (startFehler) throw startFehler;
      if (chrome.exitCode !== null) throw new Error("Test-Chrome beendet: " + chrome.exitCode);
      try {
        if (!port) port = Number(require('fs').readFileSync(require('path').join(profil, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
        const tabs = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json());
        tab = tabs.find((t) => t.type === "page");
      } catch (_e) { /* CDP startet noch; hoechstens 8 Sekunden warten. */ }
      if (!tab) await sleep(200);
    }
    if (!tab) throw new Error("kein CDP-Tab auf Port " + port);
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("WS")); });
    let id = 0;
    const sende = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      const h = (ev) => { const m = JSON.parse(ev.data); if (m.id === mid) { ws.removeEventListener("message", h); m.error ? rej(new Error(method)) : res(m.result); } };
      ws.addEventListener("message", h);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const browserFehler = [];
    const runtimeAusnahmen = [];
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Network.loadingFailed') browserFehler.push(m.params.errorText);
      if (m.method === 'Runtime.exceptionThrown') runtimeAusnahmen.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    });
    await sende('Network.enable');
    await sende('Runtime.enable');
    await sende("Page.enable");
    await sende("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
      window.__vkHarnessRuntimeErrors = [];
      window.addEventListener('error', (event) => {
        if (event.error) window.__vkHarnessRuntimeErrors.push({ type: 'error', message: String(event.error.stack || event.error.message || event.message) });
      }, true);
      window.addEventListener('unhandledrejection', (event) => {
        window.__vkHarnessRuntimeErrors.push({ type: 'unhandledrejection', message: String(event.reason && (event.reason.stack || event.reason.message) || event.reason) });
      });
    })();` });
    if (new URL(url).origin === new URL(FIXTURE_URL).origin) {
      await sende("Page.addScriptToEvaluateOnNewDocument", { source: fixturePreload(opt.fixtureMode || "success") });
    }
    if (opt.fokusEmulieren) await sende("Emulation.setFocusEmulationEnabled", { enabled: true });
    /* v1.3.0: Nur auf Anforderung – die Zwischenablage ist ohne Freigabe und
     * ohne echte Nutzereingabe gesperrt (NotAllowedError: Document is not focused),
     * ein synthetischer click() loest keine Nutzeraktivierung aus. */
    if (opt.clipboardErlauben) {
      await sende("Emulation.setFocusEmulationEnabled", { enabled: true });
      try {
        await sende("Browser.grantPermissions", {
          origin: new URL(url).origin,
          permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"]
        });
      } catch (_e) { /* aeltere Chrome-Version: Zwischenablage bleibt gesperrt */ }
    }
    /* --window-size ist nicht die CSS-Viewportgroesse (Desktop: Fensterrahmen;
     * Mobile: Mindestbreite). Beide explizit setzen, Mobile mit DPR 2. */
    await sende("Emulation.setDeviceMetricsOverride", {
      width: breite, height: hoehe, deviceScaleFactor: breite < 500 ? 2 : 1, mobile: breite < 500
    });
    await sende("Page.navigate", { url });
    let runtimeBereit = false;
    for (let versuch = 0; versuch < 40 && !runtimeBereit; versuch++) {
      const bereit = await sende('Runtime.evaluate', { expression: "document.readyState === 'complete' && typeof app === 'function' && typeof loadPage === 'function'", returnByValue: true });
      runtimeBereit = bereit.result?.value === true;
      if (!runtimeBereit) await sleep(250);
    }
    if (!runtimeBereit) {
      const diagnose = await sende('Runtime.evaluate', { expression: "JSON.stringify({ready:document.readyState,scripts:Array.from(document.scripts).map(s=>s.src),resources:performance.getEntriesByType('resource').map(r=>({name:r.name,bytes:r.transferSize}))})", returnByValue: true });
      throw new Error('Seite/Runtime nicht bereit: ' + JSON.stringify({ fehler: browserFehler, diagnose: diagnose.result?.value }));
    }
    if (injizieren) {
      const inj = await sende("Runtime.evaluate", { awaitPromise: true, expression: injizieren, returnByValue: true });
      if (inj && inj.exceptionDetails) {
        throw new Error("Injektions-Exception: " + JSON.stringify(inj.exceptionDetails.exception ? inj.exceptionDetails.exception.description : inj.exceptionDetails).slice(0, 200));
      }
      if (inj && inj.result && inj.result.value && String(inj.result.value).includes('"shell":false')) {
        throw new Error("Fixture-Injektion ohne Shell: " + inj.result.value);
      }
      await sleep(400);
    }
    const erg = typeof messen === 'function' ? null : await sende("Runtime.evaluate", { awaitPromise: true, expression: messen, returnByValue: true });
    if (erg && erg.exceptionDetails) throw new Error("evaluate-Exception: " + JSON.stringify(erg.exceptionDetails.exception ? erg.exceptionDetails.exception.description : erg.exceptionDetails).slice(0, 200));
    const erst = typeof messen === 'function' ? await messen(sende) : (erg && erg.result && erg.result.value) || null;

    /* v1.3.0: Echte Mauseingabe ueber CDP. Nur sie erzeugt eine
     * Nutzeraktivierung – Voraussetzung fuer Zwischenablage und Ersatzweg. */
    let nachher = null;
    if (opt.nachMessen) {
      if (erst && typeof erst.klickX === "number" && typeof erst.klickY === "number") {
        await sende("Input.dispatchMouseEvent", { type: "mousePressed", x: erst.klickX, y: erst.klickY, button: "left", clickCount: 1 });
        await sende("Input.dispatchMouseEvent", { type: "mouseReleased", x: erst.klickX, y: erst.klickY, button: "left", clickCount: 1 });
        await sleep(opt.nachKlickWarten || 600);
      }
      const zweite = await sende("Runtime.evaluate", { awaitPromise: true, expression: opt.nachMessen, returnByValue: true });
      if (zweite && zweite.exceptionDetails) throw new Error("nachMessen-Exception: " + JSON.stringify(zweite.exceptionDetails).slice(0, 200));
      nachher = (zweite && zweite.result && zweite.result.value) || null;
    }
    await sleep(0);
    const seitenFehler = await sende("Runtime.evaluate", {
      expression: "window.__vkHarnessRuntimeErrors || []",
      returnByValue: true
    });
    if (new URL(url).origin === new URL(FIXTURE_URL).origin) {
      const fixture = await sende('Runtime.evaluate', {expression: '({preloaded: window.__vkFixturePreloaded, unexpected: window.__vkFixtureUnexpected || []})', returnByValue: true});
      if (!fixture.result?.value?.preloaded || fixture.result.value.unexpected.length) throw new Error('Fixture-Isolation verletzt: ' + JSON.stringify(fixture.result?.value));
    }
    const javascriptFehler = runtimeAusnahmen.concat(seitenFehler.result?.value || []);
    if (javascriptFehler.length) {
      throw new Error("Unerwartete JavaScript-Ausnahme/unhandledrejection: " + JSON.stringify(javascriptFehler).slice(0, 500));
    }
    ws.close();
    return opt.nachMessen ? { erst, nachher } : erst;
  } finally {
    if (ws) ws.close();
    chrome.kill();
    await sleep(250);
    try { chrome.kill("SIGKILL"); } catch (_e) { /* bereits weg */ }
    await sleep(350);
    try { require("fs").rmSync(profil, { recursive: true, force: true }); } catch (_e) { /* Temp-Profil */ }
  }
}

/* Fixture transport is preloaded by Page.addScriptToEvaluateOnNewDocument;
 * these expressions only wait for rendered state and preserve the manual API. */
const FIXTURE_INJEKTION = `(async () => {
  const warteAuf = async (bedingung) => {
    for (let i = 0; i < 160; i++) {
      if (bedingung()) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  };
  const bereit = () => document.querySelectorAll('.vk-event-karte').length > 0 && !document.querySelector('.vk-ladebalken');
  const startBereit = await warteAuf(bereit);
  if (!startBereit) throw new Error('Initialer Fixture-Bestand fehlt');
  const st = document.createElement('style');
  st.textContent = '* { transition: none !important; animation: none !important; }';
  document.head.appendChild(st);
  if (startBereit) installVkFixture('success');
  const fixtureBereit = await warteAuf(bereit);
  if (!fixtureBereit) throw new Error('Fixture-Neustart ohne Daten');
  const result = window.vkFixtureResult || {};
  return JSON.stringify({ startBereit, fixtureBereit, fehler: result.errors || [], shell: !!document.querySelector('.vk-shell'),
    preloaded: result.transportInstalledBeforeApp === true, unerwartet: result.unexpected || [] });
})()`;

const KEIN_FIXTURE_INJEKTION = `(async () => {
  const st = document.createElement('style');
  st.textContent = '* { transition: none !important; animation: none !important; }';
  document.head.appendChild(st);
  for (let i = 0; i < 100 && !document.querySelector('.vk-shell, #secondarySites, .alert[role="alert"]'); i++) await new Promise(r => setTimeout(r, 100));
  return 'ok';
})()`;

/* ------------------------------------------------------------- MESSUNGEN */

/* Geometrie-Grundpruefung fuer einen Viewport (Feed-Zustand) */
const SWEEP_MESSUNG = `(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const erg = { viewport: vw + 'x' + vh };
  erg.keinHOverflow = document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
  erg.shellVoll = Math.round((document.querySelector('.vk-shell')||{getBoundingClientRect:()=>({height:0})}).getBoundingClientRect().height) === vh;
  const menue = document.querySelector('[data-vk-menue]');
  erg.menueRechtsSichtbar = menue ? (menue.getBoundingClientRect().right <= vw && menue.getBoundingClientRect().width >= 24) : false;
  erg.menueObenRechtsMobile = vw <= 575 ? (menue ? menue.getBoundingClientRect().left > vw - 60 : false) : true;
  const toolbar = document.querySelector('.vk-filter');
  const tr = toolbar.getBoundingClientRect();
  erg.toolbarHoehe = Math.round(tr.height);
  const kinder = Array.from(toolbar.querySelectorAll('.vk-pill, .vk-suche, .vk-art-btn'));
  erg.toolbarKinderUngeclippt = kinder.every(k => { const r = k.getBoundingClientRect(); return r.top >= tr.top - 1 && r.bottom <= tr.bottom + 1 && r.height >= 22; });
  const suche = document.querySelector('.vk-suche');
  erg.sucheVolleBreite = Math.round(suche.getBoundingClientRect().width) >= vw - 40;
  erg.suchePlatz = (suche.getBoundingClientRect().height - 16) >= 20;
  erg.suchePlaceholderSichtbar = (suche.getBoundingClientRect().width - 34) >= 150 || vw <= 400;
  const inhalt = document.querySelector('.vk-inhalt');
  inhalt.scrollTop = inhalt.scrollHeight;
  const letzte = document.querySelector('.vk-event-karte:last-of-type');
  erg.letzterEintragErreichbar = letzte ? letzte.getBoundingClientRect().bottom <= vh + 1 : true;
  erg.karten = document.querySelectorAll('.vk-event-karte').length;
  erg.modiSichtbar = Array.from(document.querySelectorAll('.vk-modus-btn')).every(b => b.getBoundingClientRect().width >= 20 && b.getBoundingClientRect().height >= 20);
  return erg;
})()`;

/* Interaktionszustaende (je Viewport) */
const ZUSTAENDE_MESSUNG = `(async () => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const erg = { viewport: vw + 'x' + vh };
  const sichtbarIn = (r) => r.right <= vw + 1 && r.bottom <= vh + 1 && r.left >= -1 && r.top >= -1;

  document.querySelector('[data-vk-art-toggle]').click();
  await new Promise(r => setTimeout(r, 250));
  const panel = document.querySelector('.vk-art-panel');
  const pr = panel.getBoundingClientRect();
  erg.panelImViewport = !panel.hidden && sichtbarIn(pr);
  erg.panelBedienbar = panel.contains(document.elementFromPoint(pr.x + pr.width / 2, pr.y + 40));
  document.body.click();
  await new Promise(r => setTimeout(r, 200));

  document.querySelector('[data-vk-menue]').click();
  await new Promise(r => setTimeout(r, 300));
  const drawer = document.querySelector('.vk-drawer');
  const dr = drawer.getBoundingClientRect();
  erg.drawerRechts = Math.abs(dr.right - vw) < 2 && dr.width <= vw * 0.9;
  erg.drawerLinksKlickbar = Array.from(drawer.querySelectorAll('a[data-vk-drawer-nav]')).every(a => { const r = a.getBoundingClientRect(); return r.width > 40 && r.height >= 24; });
  document.querySelector('.vk-scrim').click();
  await new Promise(r => setTimeout(r, 250));

  const karte = document.querySelector('.vk-event-karte');
  if (karte) {
    karte.click();
    await new Promise(r => setTimeout(r, 350));
    const modal = document.querySelector('.vk-modal, [data-vk-modal], .vk-detail');
    erg.modalOffen = !!modal && modal.getBoundingClientRect().height > 100;
    const schliess = modal ? modal.querySelector('[data-vk-detail-zu], .vk-modal-schliessen, [aria-label*="chlie"]') : null;
    erg.modalSchliessErreichbar = schliess ? sichtbarIn(schliess.getBoundingClientRect()) : false;
    karte.click();
    await new Promise(r => setTimeout(r, 200));
    erg.keinDoppelModal = document.querySelectorAll('.vk-modal, .vk-detail').length <= 1;
    const licht = document.querySelector('.vk-lightbox, [data-vk-lightbox]');
    if (licht) { erg.lightboxDa = true; }
    const zu = schliess || modal;
    if (zu) { zu.click(); await new Promise(r => setTimeout(r, 250)); }
    erg.modalGeschlossen = !document.querySelector('.vk-modal, .vk-detail');
  } else { erg.modalOffen = 'keine Karte'; }

  const info = document.querySelector('[data-vk-info-toggle]');
  if (info) { info.click(); await new Promise(r => setTimeout(r, 200)); const i = document.querySelector('.vk-info-inhalt'); erg.infoToggle = i ? !i.hidden : 'kein Inhalt'; info.click(); }
  return erg;
})()`;

/* Nutzerablaeufe (Fixture) */
const FLOWS_MESSUNG = `(async () => {
  const erg = {};
  const karten = () => document.querySelectorAll('.vk-event-karte').length;

  const erste = document.querySelector('.vk-event-karte');
  const titel = (erste.querySelector('.vk-karte-titel, h3') || {}).textContent || '';
  const suchbegriff = titel.trim().slice(0, 5);
  const suche = document.querySelector('.vk-suche');
  suche.value = suchbegriff;
  suche.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 350));
  erg.sucheTreffer = karten();

  suche.value = 'zz-nichtda-123';
  suche.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 350));
  erg.sucheNullTreffer = karten() === 0;
  const leerTitel = document.querySelector('.vk-status .vk-status-titel');
  const leerStil = leerTitel ? getComputedStyle(leerTitel) : null;
  const leerRechteck = leerTitel ? leerTitel.getBoundingClientRect() : null;
  erg.leerHinweisText = leerTitel && leerStil.display !== 'none' && leerStil.visibility !== 'hidden' && leerRechteck.width > 0 && leerRechteck.height > 0
    ? (leerTitel.innerText || '').trim() : '';
  erg.leerHinweis = /Keine Veranstaltungen/i.test(erg.leerHinweisText);

  suche.value = '';
  suche.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));

  document.querySelector('[data-vk-art-toggle]').click();
  await new Promise(r => setTimeout(r, 200));
  document.querySelector('.vk-art-panel [data-vk-typ-option]').click();
  await new Promise(r => setTimeout(r, 300));
  erg.filterWirkt = karten() > 0 && document.querySelectorAll('[data-vk-art-badge]')[0].textContent === '1';
  document.querySelector('[data-vk-art-reset]').click();
  await new Promise(r => setTimeout(r, 200));
  document.body.click();

  if (window.__vkFehlermeldungen === undefined) window.__vkFehlermeldungen = [];
  const konsolenVorher = window.__vkFehlermeldungen.length;
  const ersteKarte = document.querySelector('.vk-event-karte');
  ersteKarte.click();
  await new Promise(r => setTimeout(r, 300));
  erg.detailOeffnet = !!document.querySelector('.vk-modal, .vk-detail');
  const schliess = document.querySelector('.modal .btn-close, .modal [data-bs-dismiss="modal"]');
  if (schliess) schliess.click();
  await new Promise(r => setTimeout(r, 250));
  erg.detailSchliesst = !document.querySelector('.modal.show, .vk-modal');
  erg.keineKonsolenFehler = window.__vkFehlermeldungen.length === konsolenVorher;
  return erg;
})()`;

/* Jeder Fehlermodus wird vor dem App-Start in einem frischen Chrome-Profil
 * als Transport installiert; Erfolgscache kann den Fehlerpfad nicht vorwegnehmen. */
const FEHLER_INJEKTION = (modus) => `(async () => {
  const st = document.createElement('style');
  st.textContent = '* { transition: none !important; animation: none !important; }';
  document.head.appendChild(st);
  for (let i = 0; i < 160; i++) {
    const state = Array.from(vkInstances.values())[0];
    if (state && state.status !== 'lade') break;
    await new Promise(r => setTimeout(r, 100));
  }
  const result = window.vkFixtureResult || {};
  if (result.mode !== '${modus}') throw new Error('Falscher Fixture-Transportmodus: ' + result.mode);
  return JSON.stringify({ modus: '${modus}', fehler: result.errors || [], preloaded: result.transportInstalledBeforeApp === true,
    transportMode: result.mode, status: document.querySelector('.vk-status')?.innerText || '' });
})()`;

/* Fehlerzustaende (Fixture-Modi) – je Modus scharfe Orakel (Audit T-3a) */
const FEHLER_MESSUNG = (modus) => `(async () => {
  await new Promise(r => setTimeout(r, 600));
  const erg = { modus: '${modus}' };
  const statusEl = document.querySelector('.vk-status');
  const statusText = statusEl ? statusEl.innerText : '';
  erg.karten = document.querySelectorAll('.vk-event-karte').length;
  erg.statusText = statusText.slice(0, 90);
  erg.appBedienbar = !!document.querySelector('.vk-kopf') && !!document.querySelector('[data-vk-menue]');
  const leerTitel = document.querySelector('.vk-status .vk-status-titel');
  const leerStil = leerTitel ? getComputedStyle(leerTitel) : null;
  const leerRechteck = leerTitel ? leerTitel.getBoundingClientRect() : null;
  erg.leerHinweisText = leerTitel && leerStil.display !== 'none' && leerStil.visibility !== 'hidden' && leerRechteck.width > 0 && leerRechteck.height > 0
    ? (leerTitel.innerText || '').trim() : '';
  erg.leerHinweisSichtbar = /Keine Veranstaltungen/i.test(erg.leerHinweisText);
  if ('${modus}' === 'empty') {
    erg.orakel = erg.karten === 0 && erg.leerHinweisSichtbar && !/Fehler|fehlgeschlagen|kein JSON|Antwortformat/i.test(statusText);
  } else if ('${modus}' === 'xss') {
    erg.xssAusbruch = window.__vkXss !== undefined || window.__vkXssBeschreibung !== undefined;
    erg.orakel = !erg.xssAusbruch && erg.karten > 0 && !!document.querySelector('.vk-kopf');
  } else {
    /* error | html-200 | offline: endlicher FEHLERZustand mit Klartext-Meldung */
    erg.orakel = erg.karten === 0 && /Fehler|fehlgeschlagen|kein JSON|nicht gefunden|nicht geladen|Antwortformat/i.test(statusText);
  }
  return erg;
})()`;

/* Barrierefreiheit (375): Trefferflaechen, Labels, Kontrast, Reiter-Bedienung */
const A11Y_MESSUNG = `(async () => {
  const pause = (ms) => new Promise(r => setTimeout(r, ms));
  const erg = {};
  const klein = [];
  document.querySelectorAll('.vk-kopf button, .vk-filter button, .vk-filter input, .vk-modus-btn, [data-vk-art-option]').forEach(el => {
    if (!el.offsetParent && el.tagName !== 'INPUT') return; /* geschlossene Panels (display:none) haben keine Trefferflaeche */
    const r = el.getBoundingClientRect();
    if (Math.min(r.width, r.height) < 24) klein.push({ was: (el.className || el.tagName).toString().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) });
  });
  erg.trefferflaechenUnter24 = klein;

  const labels = [];
  const iconBtns = document.querySelectorAll('[data-vk-menue], [data-vk-drawer-zu], [data-vk-art-toggle], [data-vk-info-toggle]');
  iconBtns.forEach(b => { if (!b.getAttribute('aria-label') && !(b.textContent || '').trim()) labels.push('ohne Label: ' + (b.className || '').slice(0, 25)); });
  const suche = document.querySelector('.vk-suche');
  erg.sucheLabel = suche ? (suche.getAttribute('aria-label') ? 'da' : 'FEHLT') : 'n/a';
  erg.iconLabels = labels;

  const farbwerte = (farbe) => { const werte = farbe.match(/[\\d.]+/g).map(Number); return [werte[0], werte[1], werte[2], farbe.startsWith('rgba') ? werte[3] : 1]; };
  const mische = (farbe, hintergrund) => { const [r, g, b, a] = farbwerte(farbe); return [r * a + hintergrund[0] * (1 - a), g * a + hintergrund[1] * (1 - a), b * a + hintergrund[2] * (1 - a)]; };
  const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const kontrast = (farbe, bg) => { const a = lum(farbe), b = lum(bg); return ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)); };
  const probe = [];
  const pflicht = [
    ['.vk-kopf-subtitel', 1], ['.vk-pill-badge', 2], ['.vk-art-zahl', 1],
    ['.vk-event-typ-badge', 1], ['.vk-event-live', 1], ['.vk-event-meta', 1],
    ['.vk-kpi-text', 3], ['.vk-info-stand', 1]
  ];
  const basis = [255, 255, 255];
  const fehlend = [];
  pflicht.forEach(([sel, mindestens]) => {
    const elemente = Array.from(document.querySelectorAll(sel));
    if (elemente.length < mindestens) fehlend.push({ sel, erwartet: mindestens, gefunden: elemente.length });
    elemente.forEach((e, index) => {
      const stil = getComputedStyle(e);
      const bg = mische(stil.backgroundColor, basis);
      const fg = mische(stil.color, bg);
      probe.push({ sel, index, wert: Math.round(kontrast(fg, bg) * 100) / 100 });
    });
  });
  erg.kontrastStichproben = probe;
  erg.kontrastMesspunkteFehlen = fehlend;

  erg.drawerAria = (document.querySelector('.vk-drawer') || { getAttribute: () => null }).getAttribute('aria-hidden');

  /* Reiter-Leiste: vollstaendige Auszeichnung und bedienbar mit den Pfeiltasten. */
  const reiter = Array.from(document.querySelectorAll('.vk-modus-btn'));
  const leiste = document.querySelector('.vk-modi');
  erg.modiAria = reiter.length === 4
    && !!leiste && leiste.getAttribute('role') === 'tablist'
    && reiter.every(b => b.getAttribute('role') === 'tab' && b.getAttribute('aria-selected') !== null && b.getAttribute('aria-controls'))
    && !!document.querySelector('.vk-inhalt[role="tabpanel"]');
  erg.einTabindex0 = reiter.filter(b => b.getAttribute('tabindex') === '0').length === 1;
  erg.tabindexAmAktiven = (reiter.find(b => b.getAttribute('aria-selected') === 'true') || {}).tabIndex === 0;

  const aktiv = reiter.find(b => b.getAttribute('aria-selected') === 'true');
  erg.pfeilVorher = aktiv ? aktiv.getAttribute('data-vk-modus') : '';
  if (aktiv) {
    aktiv.focus();
    erg.fokusAufAktivem = document.activeElement === aktiv;
    aktiv.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await pause(500);
    const jetzt = reiter.find(b => b.getAttribute('aria-selected') === 'true');
    erg.pfeilNachher = jetzt ? jetzt.getAttribute('data-vk-modus') : '';
    erg.pfeilFokusMitgewandert = document.activeElement === jetzt;
    /* Zurueck: Pfeil links muss wieder beim Ausgangsreiter landen. */
    if (jetzt) {
      jetzt.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
      await pause(500);
      const zurueck = reiter.find(b => b.getAttribute('aria-selected') === 'true');
      erg.pfeilZurueck = zurueck ? zurueck.getAttribute('data-vk-modus') : '';
    }
    /* Eine unbeteiligte Taste darf nichts umschalten. */
    const vorEnter = erg.pfeilZurueck;
    const amRand = reiter.find(b => b.getAttribute('data-vk-modus') === vorEnter);
    if (amRand) {
      amRand.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await pause(300);
      const nachEnter = reiter.find(b => b.getAttribute('aria-selected') === 'true');
      erg.enterUnveraendert = (nachEnter ? nachEnter.getAttribute('data-vk-modus') : '') === vorEnter;
    }
  }

  erg.keinFokussierbaresVerstecktes = !document.querySelector('.vk-scrim[aria-hidden="true"][data-vk-scrim]') || getComputedStyle(document.querySelector('.vk-scrim')).pointerEvents === 'none';
  return erg;
})()`;

/* Interaktionen (T-5) – zweistufig (kurze Ausdruecke, robuste Uebertragung):
 * Teil 1: Leaflet-Wiederverwendung/Cleanup; Teil 2: Lightbox + ICS-Download. */
const INTERAKT_KARTE_MESSUNG = `(async () => {
  const erg = {};
  document.querySelector('[data-vk-modus="karte"]').click();
  await new Promise(r => setTimeout(r, 1200));
  erg.leafletErst = document.querySelectorAll('.leaflet-container').length;
  erg.homeBtn = !!document.querySelector('.vk-home-btn');
  document.querySelector('[data-vk-modus="programm"]').click();
  await new Promise(r => setTimeout(r, 300));
  document.querySelector('[data-vk-modus="karte"]').click();
  await new Promise(r => setTimeout(r, 900));
  erg.leafletZweit = document.querySelectorAll('.leaflet-container').length;
  document.querySelector('[data-vk-modus="programm"]').click();
  await new Promise(r => setTimeout(r, 300));
  return erg;
})()`;

const INTERAKT_DETAIL_MESSUNG = `(async () => {
  const origCreate = URL.createObjectURL.bind(URL);
  window.__vkIcsBlob = null; window.__vkDownloadName = null;
  URL.createObjectURL = function(b) { window.__vkIcsBlob = b; return origCreate(b); };
  const fangDownload = function(e) { const a = e.target.closest && e.target.closest('a[download]'); if (a) window.__vkDownloadName = a.download; };
  document.addEventListener('click', fangDownload, true);

  let lichtDa = false, icsOk = false, icsZeilenKlein = true, icsInhalt = '', icsName = '';
  const karten = Array.from(document.querySelectorAll('.vk-event-karte'));
  for (const k of karten) {
    k.click();
    await new Promise(r => setTimeout(r, 350));
    const ics = document.querySelector('[data-vk-ics]');
    if (ics && !icsOk) {
      ics.click();
      await new Promise(r => setTimeout(r, 300));
      if (window.__vkIcsBlob) {
        icsInhalt = await window.__vkIcsBlob.text();
        icsOk = icsInhalt.startsWith('BEGIN:VCALENDAR') && icsInhalt.trimEnd().endsWith('END:VCALENDAR');
        icsName = window.__vkDownloadName || '';
        const enc = new TextEncoder();
        const zeilen = icsInhalt.split('\\r\\n');
        icsZeilenKlein = zeilen.every(z => enc.encode(z).length <= 75);
      }
    }
    const lb = document.querySelector('[data-vk-lightbox]');
    if (lb && !lichtDa) {
      lb.click();
      await new Promise(r => setTimeout(r, 350));
      const box = document.querySelector('.vk-lightbox');
      const auf = !!box && box.getBoundingClientRect().width > 100 && getComputedStyle(box).display !== 'none';
      if (box) { box.querySelector('.vk-lightbox-schliessen').click(); await new Promise(r => setTimeout(r, 300)); }
      lichtDa = auf && !document.querySelector('.vk-lightbox');
    }
    const zu = document.querySelector('.modal .btn-close');
    if (zu) { zu.click(); await new Promise(r => setTimeout(r, 300)); }
    if (lichtDa && icsOk) break;
  }
  URL.createObjectURL = origCreate;
  document.removeEventListener('click', fangDownload, true);
  return { lightbox: lichtDa, icsDownload: icsOk, icsName: icsName, icsZeilenKlein: icsZeilenKlein, icsZeilen: icsInhalt ? icsInhalt.split('\\r\\n').length : 0 };
})()`;

/* Bildnachweise: reale DOM-/Fokuspruefung mit gekennzeichneten Fixtures.
 * Uebersichten ohne Nachweise, Detail/Lightbox mit vollstaendigen Nachweisen.
 * Falsche Bildquelle, Darstellungszusatz oder unerreichbare Links werden rot. */
async function vkBildnachweisMessung() {
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const erfasse = (wurzel, selector) => Array.from(wurzel.querySelectorAll(selector)).filter(el => el.querySelector('img')).map(el => {
    const img = el.querySelector('img');
    const credit = el.querySelector('.vk-bildnachweis');
    const links = credit ? Array.from(credit.querySelectorAll('a')) : [];
    const rect = credit ? credit.getBoundingClientRect() : null;
    return {
      bildVorhanden: !!img.getAttribute('src') && img.getBoundingClientRect().height > 0,
      ohneNachweis: !credit && !['Fixture-Fotografin', 'Fixture-Museum', 'Fixture-Bild | Titel; mit Trennern', 'Bildquelle (DZT)', 'CC BY-SA 4.0'].some(text => el.textContent.includes(text)),
      ohneDarstellung: !el.textContent.includes('Darstellung:'),
      quelle: links.some(a => a.href === img.src),
      lizenz: links.some(a => a.href === 'https://creativecommons.org/licenses/by-sa/4.0/'),
      rechte: !!credit && credit.textContent.includes('Fixture-Fotografin') && credit.textContent.includes('Fixture-Museum'),
      titel: !!credit && credit.textContent.includes('Fixture-Bild | Titel; mit Trennern'),
      nichtVerschachtelt: !!credit && !credit.closest('button') && !el.querySelector('button a'),
      passt: !!rect && rect.left >= -1 && rect.right <= innerWidth + 1
    };
  });
  const erg = {};
  const anfragenVorher = vkFixtureResult.requests.filter(url => url.includes('/dzt?')).length;
  erg.programm = erfasse(document, '.vk-event-eintrag');
  document.querySelector('[data-vk-modus="katalog"]').click();
  await pause(100);
  erg.katalog = erfasse(document, '.vk-katalog-eintrag');
  document.querySelector('[data-vk-modus="archiv"]').click();
  await pause(100);
  erg.archiv = erfasse(document, '.vk-event-eintrag');
  document.querySelector('[data-vk-modus="programm"]').click();
  await pause(100);
  const eintrag = Array.from(document.querySelectorAll('.vk-event-eintrag')).find(el => el.querySelector('img'));
  if (eintrag) eintrag.querySelector('button').click();
  await pause(400);
  const modal = document.querySelector('.modal');
  erg.detail = modal ? erfasse(modal, '.vk-detail-bild') : [];
  const vergroessern = modal && modal.querySelector('[data-vk-lightbox]');
  if (vergroessern) vergroessern.click();
  await pause(100);
  const lightbox = document.querySelector('.vk-lightbox');
  erg.lightbox = lightbox ? erfasse(lightbox, '.vk-lightbox-inhalt') : [];
  if (lightbox) {
    const bild = lightbox.querySelector('img');
    const credit = lightbox.querySelector('.vk-bildnachweis');
    const bildRect = bild.getBoundingClientRect();
    const creditRect = credit && credit.getBoundingClientRect();
    erg.lightboxGeometrie = bild.naturalWidth > 0 && bildRect.left >= -1 && bildRect.right <= innerWidth + 1 && bildRect.top >= -1 && bildRect.bottom <= innerHeight + 1 && !!creditRect && creditRect.top >= -1 && creditRect.bottom <= innerHeight + 1;
    erg.lightboxOhneDarstellung = !!credit && !credit.textContent.includes('Darstellung:');
    const lizenzLink = credit && credit.querySelector('a[href="https://creativecommons.org/licenses/by-sa/4.0/"]');
    if (lizenzLink) lizenzLink.focus();
    await pause(25);
    erg.lightboxLinkFokus = !!lizenzLink && document.activeElement === lizenzLink;
    erg.fokusDiagnose = { tag: document.activeElement.tagName, klasse: document.activeElement.className, inModal: !!modal && modal.contains(document.activeElement), lightboxInModal: !!modal && modal.contains(lightbox) };
    lightbox.querySelector('.vk-lightbox-schliessen').click();
  }
  const schliessen = modal && modal.querySelector('.btn-close');
  if (schliessen) schliessen.click();
  await pause(100);
  const inhalt = document.querySelector('.vk-inhalt');
  erg.keinOverflow = document.documentElement.scrollWidth <= innerWidth + 1 && inhalt.scrollWidth <= inhalt.clientWidth + 1;
  /* Geo + Zukunft beim Start; nur ein weiterer Request beim ersten Archivklick. */
  erg.nurArchivNachgeladen = anfragenVorher === 2 && vkFixtureResult.requests.filter(url => url.includes('/dzt?')).length === anfragenVorher + 1;
  return erg;
}
const BILDNACHWEIS_MESSUNG = `(${vkBildnachweisMessung.toString()})()`;

/* Anders als die aelteren Fixture-Suites: KEINE deaktivierten Uebergaenge.
 * Die 1.4.2-Dev-Fehler entstehen erst durch Fokusfalle und nachlaufende
 * Bootstrap-Callbacks. Ein reiner HTML-/Mock-Test kann sie nicht nachweisen. */
const MODAL_INJEKTION = `(async () => {
  installVkFixture('success');
  for (let i = 0; i < 40 && !document.querySelector('.vk-event-karte'); i++) await new Promise(r => setTimeout(r, 100));
  return { karten: document.querySelectorAll('.vk-event-karte').length };
})()`;

async function vkModalMessung() {
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const warte = async test => { for (let i = 0; i < 80; i++) { if (test()) return true; await pause(50); } return false; };
  const errors = [];
  const fehlerHandler = e => errors.push(String(e.error?.message || e.message));
  window.addEventListener('error', fehlerHandler);
  const shown = new WeakSet();
  const shownHandler = e => shown.add(e.target);
  document.addEventListener('shown.bs.modal', shownHandler);
  const sauber = () => !document.querySelector('.modal, .modal-backdrop, .vk-lightbox') && !document.body.classList.contains('modal-open') && !document.body.style.overflow;
  const state = () => Array.from(vkInstances.values())[0];
  const eintrag = () => Array.from(document.querySelectorAll('.vk-event-karte')).find(el => el.querySelector('img'));
  const erg = {};
  try {
    const karte = eintrag();
    karte.focus(); karte.click();
    let modal = document.querySelector('.modal');
    erg.oeffnet = !!modal && await warte(() => shown.has(modal));
    erg.echteAnimation = !!modal && parseFloat(getComputedStyle(modal.querySelector('.modal-dialog')).transitionDuration) > 0;
    const vergroessern = modal.querySelector('[data-vk-lightbox]');
    vergroessern.focus(); vergroessern.click();
    const box = document.querySelector('.vk-lightbox');
    const lizenz = box.querySelector('a[href*="creativecommons.org"]');
    lizenz.focus();
    erg.linkFokus = document.activeElement === lizenz;
    const letzte = box.querySelector('.vk-lightbox-schliessen');
    letzte.focus();
    letzte.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    erg.tabKreis = document.activeElement === box.querySelector('a[href]');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    erg.shiftTabKreis = document.activeElement === letzte;
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await pause(500);
    erg.escapeNurBild = !document.querySelector('.vk-lightbox') && document.querySelector('.modal') === modal && document.activeElement === vergroessern;
    /* Auch bei fehlerhaftem Escape-Pfad den normalen Schliess-Button wirklich pruefen. */
    if (!document.querySelector('.modal')) {
      karte.focus(); karte.click();
      modal = document.querySelector('.modal');
      await warte(() => shown.has(modal));
    }
    document.querySelector('.modal .btn-close').click();
    erg.normalSauber = await warte(sauber);
    erg.fokusZurueck = document.activeElement === karte;
    await pause(500);
    erg.normalFehler = errors.splice(0);

    /* Schliessen, noch bevor shown.bs.modal eingetreten ist. */
    eintrag().click();
    modal = document.querySelector('.modal');
    erg.fruehGetestet = !!modal && !shown.has(modal);
    modal.querySelector('.btn-close').click();
    erg.fruehSauber = await warte(sauber);
    await pause(500);
    erg.fruehFehler = errors.splice(0);

    /* Naechstes Detail waehrend der laufenden Ausblendung. */
    eintrag().click();
    modal = document.querySelector('.modal');
    await warte(() => shown.has(modal));
    const s = state(), naechstes = s.events.zukunft.find(e => e.id !== eintrag().dataset.vkEvent);
    modal.querySelector('.btn-close').click();
    zeigeEventDetail(s, naechstes);
    erg.wechsel = await warte(() => {
      const m = document.querySelector('.modal');
      return m && shown.has(m) && m.querySelector('.vk-detail-titel')?.textContent === naechstes.name;
    });
    erg.nurEinModal = document.querySelectorAll('.modal').length === 1 && document.querySelectorAll('.modal-backdrop').length === 1 && document.body.classList.contains('modal-open');
    document.querySelector('.modal .btn-close').click();
    await warte(sauber); await pause(500);
    erg.wechselFehler = errors.splice(0);

    /* Seitenwechsel cancelt auch eine wartende neue Detailanforderung. */
    eintrag().click();
    zeigeEventDetail(state(), naechstes);
    location.hash = '#kontakt';
    erg.seitenwechsel = await warte(() => !!document.querySelector('.vk-zurueck') && sauber());
    await pause(500);
    erg.keinSpaetesModal = sauber();
    erg.seitenwechselFehler = errors.splice(0);
    document.querySelector('.vk-zurueck').click();
    erg.rueckkehr = await warte(() => !!eintrag());

    /* Bootstrap-freier vorhandener Fallback bleibt schliessbar. */
    const bootstrapVorher = window.bootstrap;
    try {
      window.bootstrap = undefined;
      eintrag().click();
      erg.fallbackOffen = !!document.querySelector('.vk-modal-fallback');
      document.querySelector('.modal .btn-close').click();
      erg.fallbackSauber = sauber();
    } finally { window.bootstrap = bootstrapVorher; }
    erg.restFehler = errors.splice(0);
    return erg;
  } finally {
    window.removeEventListener('error', fehlerHandler);
    document.removeEventListener('shown.bs.modal', shownHandler);
  }
}
const MODAL_MESSUNG = `(${vkModalMessung.toString()})()`;

/* Sekundaerseiten: echte Hash-Routen der Base, kein Austausch des Routers.
 * Funktion als Quelltext serialisieren vermeidet verschachtelte Template-Escapes. */
async function vkSekundaerMessung() {
  const warte = ms => new Promise(r => setTimeout(r, ms));
  const stil = el => { const s = getComputedStyle(el); return [s.backgroundColor, s.borderRadius, s.fontFamily, s.fontSize, s.width, s.height].join('|'); };
  const ref = stil(document.querySelector('[data-vk-menue]'));
  configData = Object.assign({}, configData, {
    titel: 'Veranstaltungskalender', ort: 'Böblingen', radiusKm: '25',
    apiurls: [{ name: 'veranstaltungen', label: 'SPARQL-Endpunkt', url: 'https://proxy.opendatagermany.io/api/ts/v1/kg/sparql' }],
    fusszeile: '<p>© Testbetreiber <a href="https://example.org/">Footer-Hinweis</a></p>',
    beschreibung: '<p>Beschreibungstest</p>' + '<p>Langer lesbarer Testabsatz.</p>'.repeat(90),
    kontakt: '## Kontaktinfo\n**Kontakttext**', impressum: '<p>Impressumtest</p>', datenschutz: '<p>Datenschutztest</p>'
  });
  const vorher = vkFixtureResult.requests.length;
  const seiten = [];
  for (const [page, title] of Object.entries({ beschreibung: 'Über diese App', kontakt: 'Kontakt', impressum: 'Impressum', datenschutz: 'Datenschutz' })) {
    document.querySelector('[data-vk-menue]').click();
    document.querySelector('.vk-drawer a[href="#' + page + '"]').click();
    await warte(400);
    const menue = document.querySelector('[data-vk-menue]');
    const shell = document.querySelector('.vk-shell');
    const karte = document.getElementById('secondarySites');
    const kopf = document.querySelector('.vk-kopf').getBoundingClientRect();
    const scroller = document.querySelector('.vk-seiten-inhalt');
    const mr = menue.getBoundingClientRect();
    const erg = { page, titel: karte.querySelector('h2').textContent === title,
      gleicherBurger: stil(menue) === ref, rechts: Math.abs(mr.right - (innerWidth - (innerWidth <= 575 ? 12 : 16))) < 2,
      templateAus: Array.from(document.querySelectorAll('body > header, body > footer')).every(el => getComputedStyle(el).display === 'none'),
      ohneTabs: !document.querySelector('[data-vk-modus]'), rueckweg: document.querySelector('.vk-zurueck').getAttribute('href') === '#startseite',
      kartePasst: karte.getBoundingClientRect().width <= 821 && karte.getBoundingClientRect().top >= kopf.bottom,
      keinOverflow: document.documentElement.scrollWidth <= innerWidth + 1 && scroller.scrollWidth <= scroller.clientWidth + 1,
      footer: document.querySelector('.vk-seiten-fuss').textContent.includes('© Testbetreiber') && !!document.querySelector('.vk-seiten-fuss a[href="https://example.org/"]') };
    scroller.scrollTop = scroller.scrollHeight;
    erg.footerErreichbar = document.querySelector('.vk-seiten-fuss').getBoundingClientRect().bottom <= innerHeight + 1;
    erg.kopfBleibt = document.querySelector('.vk-kopf').getBoundingClientRect().top === kopf.top;
    menue.click();
    const drawer = document.querySelector('.vk-drawer');
    erg.drawerOffen = !drawer.inert && drawer.getAttribute('aria-hidden') === 'false' && Math.abs(drawer.getBoundingClientRect().right - innerWidth) < 2;
    erg.aktiv = drawer.querySelector('[aria-current="page"]').getAttribute('href') === '#' + page;
    const erster = drawer.querySelector('button'), links = drawer.querySelectorAll('a');
    erg.fokusOeffnet = document.activeElement === erster;
    erster.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    erg.fokusKreis = document.activeElement === links[links.length - 1];
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    erg.escape = !shell.classList.contains('vk-drawer-offen') && drawer.inert && document.activeElement === menue;
    menue.click(); document.querySelector('.vk-scrim').click();
    erg.aussen = !shell.classList.contains('vk-drawer-offen');
    menue.click(); drawer.querySelector('[aria-current="page"]').click();
    await warte(300);
    erg.samePage = vkInstances.size === 1 && document.querySelectorAll('.vk-shell').length === 1 && document.querySelector('#secondarySites h2').textContent === title;
    seiten.push(erg);
  }
  document.querySelector('.vk-zurueck').click();
  await warte(500);
  return { seiten, rueckkehr: document.querySelectorAll('.vk-event-karte').length > 0 && !document.body.classList.contains('vk-sekundaer'),
    cache: vkFixtureResult.requests.length === vorher, states: vkInstances.size, unerwartet: vkFixtureResult.unexpected };
}
const SEKUNDAER_MESSUNG = '(' + vkSekundaerMessung.toString() + ')()';

/* v1.3.0: Teilen-Reihe im Detailfenster.
 *
 * Wichtig fuer den Pruefstand: Die Zwischenablage-Schnittstelle und das
 * Geraetemenue sind an einen sicheren Kontext gebunden – 127.0.0.1 gilt als
 * sicher, die Testinstanz (http://<host>:3000) nicht. Und beide verlangen eine
 * ECHTE Nutzereingabe: ein synthetischer click() loest keine Aktivierung aus
 * (gemessen: NotAllowedError "Document is not focused", execCommand -> false).
 * Deshalb laeuft der Kopier-Klick ueber Input.dispatchMouseEvent.
 *
 * Drei Laeufe: Struktur (unveraendert), Dev-Zustand (ohne Geraetemenue, ohne
 * Zwischenablage – so sieht es auf der Testinstanz aus) und Produktivpfad. */
const TEILEN_STRUKTUR_MESSUNG = `(async () => {
  const pause = (ms) => new Promise(r => setTimeout(r, ms));
  const erg = {};
  for (let i = 0; i < 60 && !document.querySelector('.vk-event-karte'); i++) await pause(150);
  const karte = document.querySelector('.vk-event-karte');
  erg.karteDa = !!karte;
  if (karte) karte.click();
  await pause(400);
  const reihe = document.querySelector('.vk-detail-teilen');
  erg.reiheDa = !!reihe;
  if (!reihe) return erg;
  const knoepfe = Array.from(reihe.querySelectorAll('.vk-teilen-btn'));
  erg.schaltflaechen = knoepfe.map(b => b.textContent.trim());
  erg.hoehen = knoepfe.map(b => Math.round(b.getBoundingClientRect().height));
  erg.trefferflaechenOk = erg.hoehen.length > 0 && erg.hoehen.every(h => h >= 44);
  erg.nativeVorhanden = typeof navigator.share === 'function';
  const hatNative = !!reihe.querySelector('[data-vk-teilen-native]');
  const wa = reihe.querySelector('a[href^="https://wa.me/"]');
  const mail = reihe.querySelector('a[href^="mailto:"]');
  const x = reihe.querySelector('a[href^="https://x.com/intent/post"]');
  erg.hatWhatsApp = !!wa;
  erg.hatEmail = !!mail;
  erg.hatX = !!x;
  /* Die festen Wege sind immer da; die Geraetemenue-Schaltflaeche genau dann,
   * wenn das Geraet sie anbietet. */
  erg.satzPasst = hatNative === erg.nativeVorhanden && !!wa && !!mail && !!x;
  erg.hatKopieren = !!reihe.querySelector('[data-vk-teilen-kopieren]');
  return erg;
})()`;

/* Rueckmeldung nach echtem Klick: Status UND Inhalt der Zwischenablage. */
const TEILEN_CLIPBOARD_ZURUECK = `(async () => {
  const s = document.querySelector('.vk-teilen-status');
  const ics = document.querySelector('[data-vk-ics]');
  const id = ics ? ics.getAttribute('data-vk-ics') : '';
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch (e) { text = 'FEHLER ' + e.name; }
  return {
    status: s ? s.textContent.trim() : '',
    eventId: id,
    text,
    enthaeltKennung: !!id && text.includes(encodeURIComponent(id)),
    /* „Link kopieren" kopiert den Link, nicht die ganze Nachricht. */
    istLink: text.startsWith('http') && text.indexOf('?event=') > 0
  };
})()`;

/* Rueckmeldung nach echtem Klick: Status UND was der Kopierbefehl gesehen hat.
 * Die Mitschrift ist die Wache gegen den Modal-Fokusfehler: liegt das
 * Hilfselement ausserhalb des Modals, reisst die Fokusfalle den Fokus weg, die
 * Auswahl ist leer, und der Befehl meldet trotzdem Erfolg. */
const TEILEN_KLICK_ZURUECK = `(() => {
  const s = document.querySelector('.vk-teilen-status');
  return { status: s ? s.textContent.trim() : '', kopier: window.__vkKopier || null };
})()`;

/* Geteilter Link beim Laden: drei Zustaende (Spec Anhang v1.3.0 B). */
const TEILEN_LINK_MESSUNG = `(async () => {
  const pause = (ms) => new Promise(r => setTimeout(r, ms));
  const erg = {};
  for (let i = 0; i < 60 && !document.querySelector('.vk-event-karte'); i++) await pause(150);
  await pause(500);
  const modal = document.querySelector('.modal.show, .vk-modal');
  erg.modalOffen = !!modal;
  const titel = modal ? modal.querySelector('.vk-detail-titel') : null;
  erg.modalTitel = titel ? titel.textContent.trim() : '';
  const status = document.querySelector('.vk-status');
  const statusTitel = status ? status.querySelector('.vk-status-titel') : null;
  erg.statusTitel = statusTitel ? statusTitel.textContent.trim() : '';
  erg.hinweisDa = /Geteilte Veranstaltung/i.test(erg.statusTitel);
  erg.karten = document.querySelectorAll('.vk-event-karte').length;
  return erg;
})()`;

/* Dev-Zustand: kein Geraetemenue, keine Zwischenablage – wie auf der Testinstanz. */
const TEILEN_DEV_MESSUNG = `(async () => {
  const pause = (ms) => new Promise(r => setTimeout(r, ms));
  const erg = {};
  try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (e) { erg.shareWeg = false; }
  try { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); } catch (e) { erg.clipboardWeg = false; }
  erg.shareAus = typeof navigator.share;
  erg.clipboardAus = typeof navigator.clipboard;
  /* Mitschrift beim Kopieren: aktives Element und Auswahl. */
  window.__vkKopier = null;
  document.addEventListener('copy', () => {
    const a = document.activeElement;
    window.__vkKopier = {
      aktivTag: a ? a.tagName : '',
      aktivImModal: !!(a && a.closest && a.closest('.modal')),
      auswahlLaenge: String(window.getSelection ? window.getSelection() : '').length,
      auswahl: String(window.getSelection ? window.getSelection() : '').slice(0, 120)
    };
  }, true);
  for (let i = 0; i < 60 && !document.querySelector('.vk-event-karte'); i++) await pause(150);
  document.querySelector('.vk-event-karte').click();
  await pause(400);
  const reihe = document.querySelector('.vk-detail-teilen');
  if (!reihe) return erg;
  const wa = reihe.querySelector('a[href^="https://wa.me/"]');
  const mail = reihe.querySelector('a[href^="mailto:"]');
  const x = reihe.querySelector('a[href^="https://x.com/intent/post"]');
  erg.hatWhatsApp = !!wa;
  erg.hatEmail = !!mail;
  erg.hatX = !!x;
  erg.hatNative = !!reihe.querySelector('[data-vk-teilen-native]');
  const kanal = wa || mail;
  erg.kanalAdresse = kanal ? kanal.getAttribute('href') : '';
  erg.kanalEnthaeltLink = /%3Fevent%3D/.test(erg.kanalAdresse);
  /* Review-Befund 2026-10-01: nicht nur die Zeichenfolge, sondern die konkrete
   * Kennung pruefen. Die Adresse ist einmal kodiert, der Link darin nochmals. */
  const ics = document.querySelector('[data-vk-ics]');
  erg.eventId = ics ? ics.getAttribute('data-vk-ics') : '';
  let dekodiert = '';
  try { dekodiert = decodeURIComponent(erg.kanalAdresse); } catch (e) { dekodiert = erg.kanalAdresse; }
  erg.kanalEnthaeltKennung = !!erg.eventId && dekodiert.includes(encodeURIComponent(erg.eventId));
  const xKanal = reihe.querySelector('a[href^="https://x.com/intent/post"]');
  erg.xAdresse = xKanal ? xKanal.getAttribute('href') : '';
  let xDekodiert = '';
  try { xDekodiert = decodeURIComponent(erg.xAdresse); } catch (e) { xDekodiert = erg.xAdresse; }
  erg.xEnthaeltKennung = !!erg.eventId && xDekodiert.includes(encodeURIComponent(erg.eventId));
  erg.kanalEnthaeltEventName = /%3Fevent%3D/.test(erg.kanalAdresse) && !/%3Fevent%3D%22/.test(erg.kanalAdresse);
  const kopier = reihe.querySelector('[data-vk-teilen-kopieren]');
  if (kopier) { kopier.scrollIntoView({ block: 'center' }); await pause(150); const r = kopier.getBoundingClientRect(); erg.klickX = Math.round(r.left + r.width / 2); erg.klickY = Math.round(r.top + r.height / 2); erg.sichtbar = r.top >= 0 && r.bottom <= window.innerHeight; }
  return erg;
})()`;

/* Produktivpfad: Zwischenablage vorhanden und freigegeben. */
const TEILEN_CLIPBOARD_MESSUNG = `(async () => {
  const pause = (ms) => new Promise(r => setTimeout(r, ms));
  const erg = {};
  for (let i = 0; i < 60 && !document.querySelector('.vk-event-karte'); i++) await pause(150);
  document.querySelector('.vk-event-karte').click();
  await pause(400);
  const reihe = document.querySelector('.vk-detail-teilen');
  if (!reihe) return erg;
  erg.clipboardVorhanden = !!(navigator.clipboard && navigator.clipboard.writeText);
  const ics = document.querySelector('[data-vk-ics]');
  erg.eventId = ics ? ics.getAttribute('data-vk-ics') : '';
  const kopier = reihe.querySelector('[data-vk-teilen-kopieren]');
  if (kopier) { kopier.scrollIntoView({ block: 'center' }); await pause(150); const r = kopier.getBoundingClientRect(); erg.klickX = Math.round(r.left + r.width / 2); erg.klickY = Math.round(r.top + r.height / 2); erg.sichtbar = r.top >= 0 && r.bottom <= window.innerHeight; }
  return erg;
})()`;

/* --------------------------------------------------------------- SUITEN */

const SWEEP_VIELEN = [
  [320, 568], [360, 800], [375, 667], [375, 812], [390, 844], [430, 932],
  [574, 900], [575, 900], [767, 1024], [768, 1024], [991, 900], [1024, 768],
  [1366, 768], [1920, 1080], [844, 390]
];

/* v1.3.2: Zurueck/Vorwaerts zwischen den Ansichten der Startseite.
 * Befund 2026-10-01: Ein Tab-Klick erzeugte keinen Verlaufseintrag; "Zurueck"
 * verliess die App, "Vorwaerts" stellte die Ansicht nie wieder her. */
const VERLAUF_MESSUNG = `(async () => {
  const pause = (ms) => new Promise(r => setTimeout(r, ms));
  const erg = {};
  for (let i = 0; i < 60 && !document.querySelector('.vk-event-karte'); i++) await pause(150);
  const aktiv = () => { const a = document.querySelector('.vk-modus-btn.aktiv'); return a ? a.textContent.trim() : ''; };
  erg.vorher = aktiv();
  erg.lenVor = history.length;
  document.querySelector('[data-vk-modus="karte"]').click();
  await pause(900);
  erg.nachher = aktiv();
  erg.lenNach = history.length;
  history.back();
  await pause(1300);
  erg.zurueck = aktiv();
  history.forward();
  await pause(1300);
  erg.vorwaerts = aktiv();
  /* Zweiter Durchlauf: zwei Ansichten hintereinander, dann zweimal zurueck. */
  document.querySelector('[data-vk-modus="katalog"]').click();
  await pause(700);
  document.querySelector('[data-vk-modus="archiv"]').click();
  await pause(700);
  erg.zweiSchritte = aktiv();
  history.back();
  await pause(1100);
  erg.schritt1 = aktiv();
  history.back();
  await pause(1100);
  erg.schritt2 = aktiv();
  return erg;
})()`;

/* v1.3.2: Ruhige Ansicht – kein Hoehen-Ruckeln, keine gestrichelten Linien. */
const RUHIG_MESSUNG = `(async () => {
  const pause = (ms) => new Promise(r => setTimeout(r, ms));
  const erg = {};
  for (let i = 0; i < 60 && !document.querySelector('.vk-kpi-info-toggle'); i++) await pause(150);

  /* Der Aufklapper darf keinen Hoehen-Uebergang mehr haben. Geprueft an einem
   * Probe-Element mit denselben Klassen – unabhaengig vom Klickzeitpunkt. */
  const probe = document.createElement('div');
  probe.className = 'collapse collapsing vk-kpi-collapse';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  erg.uebergang = cs.transitionProperty + ' / ' + cs.transitionDuration;
  erg.keinHoehenuebergang = cs.transitionProperty === 'none' || /^0s(, 0s)*$/.test(cs.transitionDuration.trim());
  probe.remove();

  /* Auf- und Zuklappen muss sofort wirken, nicht erst nach der alten Laufzeit. */
  const knopf = document.querySelector('.vk-kpi-info-toggle');
  const ziel = document.querySelector(knopf.getAttribute('data-bs-target'));
  const sichtbar = () => { const s = getComputedStyle(ziel); return s.display !== 'none' && ziel.getBoundingClientRect().height > 4; };
  if (sichtbar()) { knopf.click(); await pause(400); }
  let t0 = performance.now();
  knopf.click();
  for (let i = 0; i < 60 && !sichtbar(); i++) await pause(10);
  erg.aufMs = Math.round(performance.now() - t0);
  erg.aufOffen = sichtbar();
  /* Bootstrap setzt beim Aufklappen kurz _isTransitioning und ignoriert
   * Klicks in dieser Zeit. Ein Mensch klickt nicht nach 1 ms erneut – hier
   * deshalb mit normalem Abstand messen, sonst misst man die Sperre. */
  await pause(400);
  t0 = performance.now();
  knopf.click();
  for (let i = 0; i < 60 && sichtbar(); i++) await pause(10);
  erg.zuMs = Math.round(performance.now() - t0);
  erg.zuZu = !sichtbar();
  /* Nach dem Schliessen muss der Aufklapper wieder bedienbar sein. */
  await pause(400);
  knopf.click();
  for (let i = 0; i < 60 && !sichtbar(); i++) await pause(10);
  erg.wiederOffen = sichtbar();
  knopf.click();
  await pause(300);

  /* Keine gestrichelten Linien mehr im gerenderten Bild. */
  const gestrichelt = [];
  document.querySelectorAll('.vk-shell *').forEach((el) => {
    const s = getComputedStyle(el);
    ['borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle'].forEach((k) => {
      if (s[k] === 'dashed' || s[k] === 'dotted') gestrichelt.push((el.className || el.tagName) + '.' + k);
    });
  });
  erg.gestrichelt = gestrichelt;
  return erg;
})()`;

function pruefErgebnis(zeilen) {
  if (!zeilen.length) throw new Error('Suite ohne Pruefungen ist kein erfolgreicher Lauf');
  return { pruefungen: zeilen.length, fails: zeilen.filter(z => !z.pass).length };
}

async function suite(name) {
  if (!SUITES.includes(name)) throw new Error('Unbekannte Suite: ' + name + '. Erlaubt: ' + SUITES.join(', '));
  if (name === "flows" && !LIVE_HOST) {
    throw new Error("Die Suite flows benötigt für den Live-Anteil einen autorisierten Testhost. Bitte VK_LIVE_HOST (Host:Port) setzen.");
  }
  const zeilen = [];
  const log = (id, viewport, pass, details) => {
    zeilen.push({ suite: name, id, viewport, pass: !!pass, details });
    console.log(JSON.stringify({ suite: name, id, viewport, pass: !!pass, details }));
  };
  if (name === "sweep") {
    for (const [b, h] of SWEEP_VIELEN) {
      try {
        const erg = await mitChrome(b, h, FIXTURE_URL, FIXTURE_INJEKTION, SWEEP_MESSUNG, 0);
        const viewport = erg.viewport;
        log("M-overflow", viewport, erg.keinHOverflow, erg);
        log("M-vollbild", viewport, erg.shellVoll, {});
        log("M-kopf", viewport, erg.menueRechtsSichtbar && erg.menueObenRechtsMobile && erg.modiSichtbar, {});
        log("M-toolbar", viewport, erg.toolbarKinderUngeclippt && erg.sucheVolleBreite && erg.suchePlatz && erg.suchePlaceholderSichtbar, { toolbarHoehe: erg.toolbarHoehe });
        log("M-feed", viewport, erg.letzterEintragErreichbar && erg.karten > 0, { karten: erg.karten });
      } catch (e) { log("M-suite", b + "x" + h, false, { fehler: e.message }); }
    }
  }
  if (name === "zustaende") {
    for (const [b, h] of [[375, 812], [390, 844]]) {
      try {
        const erg = await mitChrome(b, h, FIXTURE_URL, FIXTURE_INJEKTION, ZUSTAENDE_MESSUNG, 0);
        const v = erg.viewport;
        log("Z-panel", v, erg.panelImViewport && erg.panelBedienbar, {});
        log("Z-drawer", v, erg.drawerRechts && erg.drawerLinksKlickbar, {});
        log("Z-modal", v, erg.modalOffen === true && erg.modalSchliessErreichbar && erg.modalGeschlossen, {});
        log("Z-doppelklick", v, erg.keinDoppelModal, {});
        log("Z-info", v, erg.infoToggle === true, {});
      } catch (e) { log("Z-suite", b + "x" + h, false, { fehler: e.message }); }
    }
  }
  if (name === "flows") {
    try {
      const erg = await mitChrome(375, 812, FIXTURE_URL, FIXTURE_INJEKTION, FLOWS_MESSUNG, 0);
      log("F-suche-treffer", "375x812", erg.sucheTreffer > 0, { treffer: erg.sucheTreffer });
      log("F-suche-null", "375x812", erg.sucheNullTreffer && erg.leerHinweis, {});
      log("F-filter", "375x812", erg.filterWirkt, {});
      log("F-detail", "375x812", erg.detailOeffnet && erg.detailSchliesst, {});
    } catch (e) { log("F-suite", "375x812", false, { fehler: e.message }); }
    /* Live-Instanz: Cache-Rueckkehr + Sekundaerseiten-Navigation (sparsam, 1 Lauf) */
    try {
      const erg = await mitChrome(375, 812, LIVE_URL, KEIN_FIXTURE_INJEKTION, `(async () => {
        const erg = {};
        const warteAuf = async (test, limit) => {
          const ende = performance.now() + limit;
          while (performance.now() < ende) { if (test()) return true; await new Promise(r => setTimeout(r, 50)); }
          return false;
        };
        const bereit = () => Array.from(vkInstances.values())[0]?.status === 'bereit' && document.querySelectorAll('.vk-event-karte').length > 0;
        if (!await warteAuf(bereit, 90000)) throw new Error('Live-Cache-Vorbedingung fehlt: initialer Bestand nicht erfolgreich geladen');
        const dztAnzahl = () => performance.getEntriesByType('resource').filter(r => new URL(r.name).pathname.endsWith('/dzt')).length;
        const vorher = dztAnzahl();
        if (vorher < 2) throw new Error('Keine abgeschlossenen initialen DZT-Abfragen beobachtet');
        location.hash = '#beschreibung';
        if (!await warteAuf(() => document.getElementById('secondarySites'), 4000)) throw new Error('Informationsseite nicht bereit');
        erg.sekundaerseite = !!document.getElementById('secondarySites');
        erg.appDesign = document.body.classList.contains('vk-sekundaer');
        const t0 = performance.now();
        location.hash = '#startseite';
        erg.bereit = await warteAuf(bereit, 6000);
        erg.rueckkehrMs = Math.round(performance.now() - t0);
        erg.karten = document.querySelectorAll('.vk-event-karte').length;
        erg.dztVorher = vorher;
        erg.dztNachher = dztAnzahl();
        return erg;
      })()`, 0);
      log("F-live-sekundaer", "375x812", erg.sekundaerseite && erg.appDesign, {});
      log("F-live-cache", "375x812", erg.bereit && erg.rueckkehrMs < 4000 && erg.karten > 0 && erg.dztNachher === erg.dztVorher, erg);
    } catch (e) { log("F-live", "375x812", false, { fehler: e.message }); }
  }
  if (name === "fehler") {
    for (const modus of ["error", "empty", "html-200", "xss", "offline"]) {
      try {
        const erg = await mitChrome(375, 812, FIXTURE_URL, FEHLER_INJEKTION(modus), FEHLER_MESSUNG(modus), 0, { fixtureMode: modus });
        log("X-" + modus, "375x812", erg.orakel && erg.appBedienbar, erg);
      } catch (e) { log("X-" + modus, "375x812", false, { fehler: e.message }); }
    }
  }
  if (name === "interaktion") {
    try {
      const karte = await mitChrome(375, 812, FIXTURE_URL, FIXTURE_INJEKTION, INTERAKT_KARTE_MESSUNG, 0);
      log("I-leaflet", "375x812", karte.leafletErst === 1 && karte.leafletZweit === 1 && karte.homeBtn, { erst: karte.leafletErst, zweit: karte.leafletZweit });
    } catch (e) { log("I-leaflet", "375x812", false, { fehler: e.message }); }
    try {
      const d = await mitChrome(375, 812, FIXTURE_URL, FIXTURE_INJEKTION, INTERAKT_DETAIL_MESSUNG, 0);
      log("I-lightbox", "375x812", d.lightbox, {});
      log("I-ics", "375x812", d.icsDownload && d.icsZeilenKlein && /\.ics$/.test(d.icsName || ""), { name: d.icsName, zeilen: d.icsZeilen, alleKleinerGleich75: d.icsZeilenKlein });
    } catch (e) { log("I-detail", "375x812", false, { fehler: e.message }); }
  }
  if (name === "sekundaer") {
    for (const [b, h] of [[320, 568], [375, 812], [768, 1024], [1366, 768]]) {
      try {
        const erg = await mitChrome(b, h, FIXTURE_URL, FIXTURE_INJEKTION, SEKUNDAER_MESSUNG, 0);
        for (const seite of erg.seiten) log('S-' + seite.page, b + 'x' + h, Object.entries(seite).every(([k, v]) => k === 'page' || v === true), seite);
        log('S-rueckkehr', b + 'x' + h, erg.rueckkehr && erg.cache && erg.states === 1 && erg.unerwartet.length === 0, erg);
      } catch (e) { log('S-suite', b + 'x' + h, false, { fehler: e.message }); }
    }
    for (const page of ['beschreibung', 'kontakt', 'impressum', 'datenschutz']) {
      try {
        const erg = await mitChrome(375, 812, FIXTURE_URL + '#' + page, KEIN_FIXTURE_INJEKTION, `(() => ({ seite: location.hash, menue: !!document.querySelector('[data-vk-menue]'), karte: !!document.getElementById('secondarySites'), aktiv: document.querySelector('.vk-drawer [aria-current="page"]')?.getAttribute('href'), states: vkInstances.size }))()`, 0);
        log('S-deeplink-' + page, '375x812', erg.menue && erg.karte && erg.aktiv === '#' + page && erg.states === 1, erg);
      } catch (e) { log('S-deeplink-' + page, '375x812', false, { fehler: e.message }); }
    }
  }
  if (name === "verlauf") {
    for (const [b, h] of [[375, 812], [1366, 768]]) {
      const v = b + "x" + h;
      try {
        const erg = await mitChrome(b, h, FIXTURE_URL, FIXTURE_INJEKTION, VERLAUF_MESSUNG, 0);
        log("V-eintrag", v, erg.lenNach > erg.lenVor && erg.nachher === "Karte", { vorher: erg.vorher, nachher: erg.nachher, len: [erg.lenVor, erg.lenNach] });
        log("V-zurueck", v, erg.zurueck === "Programm", { zurueck: erg.zurueck });
        log("V-vorwaerts", v, erg.vorwaerts === "Karte", { vorwaerts: erg.vorwaerts });
        log("V-zwei-schritte", v, erg.zweiSchritte === "Archiv" && erg.schritt1 === "Katalog" && erg.schritt2 === "Karte",
          { archiv: erg.zweiSchritte, schritt1: erg.schritt1, schritt2: erg.schritt2 });
      } catch (e) { log("V-suite", v, false, { fehler: e.message }); }
    }
  }
  if (name === "ruhig") {
    for (const [b, h] of [[375, 812], [1366, 768]]) {
      const v = b + "x" + h;
      try {
        const erg = await mitChrome(b, h, FIXTURE_URL, FIXTURE_INJEKTION, RUHIG_MESSUNG, 0);
        log("R-uebergang", v, erg.keinHoehenuebergang, { uebergang: erg.uebergang });
        log("R-aufklappen", v, erg.aufOffen && erg.aufMs < 300, { ms: erg.aufMs });
        log("R-zuklappen", v, erg.zuZu && erg.zuMs < 300, { ms: erg.zuMs });
        log("R-wieder-offen", v, erg.wiederOffen, {});
        log("R-linien", v, erg.gestrichelt.length === 0, { gefunden: erg.gestrichelt });
      } catch (e) { log("R-suite", v, false, { fehler: e.message }); }
    }
  }
  if (name === "teilen") {
    for (const [b, h] of [[375, 812], [1366, 768]]) {
      const v = b + "x" + h;
      try {
        const erg = await mitChrome(b, h, FIXTURE_URL, FIXTURE_INJEKTION, TEILEN_STRUKTUR_MESSUNG, 0);
        log("T-reihe", v, erg.reiheDa && erg.hatKopieren, { schaltflaechen: erg.schaltflaechen });
        log("T-satz", v, erg.satzPasst, { native: erg.nativeVorhanden, whatsapp: erg.hatWhatsApp, x: erg.hatX, email: erg.hatEmail });
        log("T-trefferflaechen", v, erg.trefferflaechenOk, { hoehen: erg.hoehen });
      } catch (e) { log("T-suite", v, false, { fehler: e.message }); }
    }
    /* Dev-Zustand (Testinstanz): feste Wege sichtbar, Kopieren ueber den Ersatzweg. */
    for (const [b, h] of [[375, 812], [1366, 768]]) {
      const v = b + "x" + h;
      try {
        const { erst, nachher } = await mitChrome(b, h, FIXTURE_URL, FIXTURE_INJEKTION, TEILEN_DEV_MESSUNG, 0, { nachMessen: TEILEN_KLICK_ZURUECK });
        log("T-dev-satz", v, erst.shareAus === "undefined" && erst.clipboardAus === "undefined" && erst.hatWhatsApp && erst.hatX && erst.hatEmail && !erst.hatNative,
          { share: erst.shareAus, clipboard: erst.clipboardAus, x: erst.hatX });
        log("T-dev-link", v, erst.kanalEnthaeltLink, { adresse: (erst.kanalAdresse || "").slice(0, 140) });
        log("T-dev-kennung", v, erst.kanalEnthaeltKennung, { id: erst.eventId });
        log("T-dev-x", v, erst.xEnthaeltKennung, { adresse: (erst.xAdresse || "").slice(0, 120) });
        /* Wache gegen den Modal-Fokusfehler (Bug 2026-10-01). */
        log("T-dev-kopieren", v, /kopiert/i.test((nachher && nachher.status) || ""), { status: nachher && nachher.status, sichtbar: erst.sichtbar, klick: [erst.klickX, erst.klickY] });
        log("T-dev-kopierauswahl", v, !!(nachher && nachher.kopier && nachher.kopier.aktivImModal && nachher.kopier.auswahlLaenge > 0 && nachher.kopier.auswahl.indexOf('?event=') > 0),
          { kopier: nachher && nachher.kopier });
      } catch (e) { log("T-dev-suite", v, false, { fehler: e.message }); }
    }
    /* Produktivpfad: Zwischenablage vorhanden und freigegeben. */
    try {
      const { erst, nachher } = await mitChrome(375, 812, FIXTURE_URL, FIXTURE_INJEKTION, TEILEN_CLIPBOARD_MESSUNG, 0, { clipboardErlauben: true, nachMessen: TEILEN_CLIPBOARD_ZURUECK });
      log("T-clipboard-vorhanden", "375x812", erst.clipboardVorhanden === true, {});
      log("T-clipboard-kopieren", "375x812", /kopiert/i.test((nachher && nachher.status) || ""), { status: nachher && nachher.status });
      log("T-clipboard-inhalt", "375x812", !!(nachher && nachher.enthaeltKennung && nachher.istLink), { inhalt: (nachher && nachher.text || "").slice(0, 120) });
    } catch (e) { log("T-clipboard-suite", "375x812", false, { fehler: e.message }); }
    /* Geteilter Link beim Laden: Treffer ausserhalb der gefilterten Liste,
     * unbekannte Kennung, kein Parameter. */
    const faelle = [
      { id: "T-link-archiv", url: FIXTURE_URL + "?event=urn%3Avk-fixture%3Aserien-archiv",
        pass: (e) => e.modalOffen && /Winterzauber/.test(e.modalTitel) },
      { id: "T-link-unbekannt", url: FIXTURE_URL + "?event=gibt-es-nicht",
        pass: (e) => !e.modalOffen && e.hinweisDa && e.karten > 0 },
      { id: "T-link-ohne", url: FIXTURE_URL,
        pass: (e) => !e.modalOffen && !e.hinweisDa && e.karten > 0 }
    ];
    for (const fall of faelle) {
      try {
        const erg = await mitChrome(375, 812, fall.url, FIXTURE_INJEKTION, TEILEN_LINK_MESSUNG, 0);
        log(fall.id, "375x812", fall.pass(erg), { titel: erg.modalTitel, hinweis: erg.statusTitel, karten: erg.karten });
      } catch (e) { log(fall.id, "375x812", false, { fehler: e.message }); }
    }
  }
  if (name === "modal") {
    for (const [b, h] of [[375, 812], [1366, 900]]) {
      const v = b + 'x' + h;
      try {
        const e = await mitChrome(b, h, FIXTURE_URL, MODAL_INJEKTION, MODAL_MESSUNG, 0, { fokusEmulieren: true });
        log('M-echte-animation', v, e.oeffnet && e.echteAnimation, { offen: e.oeffnet, animation: e.echteAnimation });
        log('M-lightbox-fokus', v, e.linkFokus && e.tabKreis && e.shiftTabKreis && e.escapeNurBild, { link: e.linkFokus, tab: e.tabKreis, shiftTab: e.shiftTabKreis, escape: e.escapeNurBild });
        log('M-normal-schliessen', v, e.normalSauber && e.fokusZurueck && e.normalFehler.length === 0, { sauber: e.normalSauber, fokus: e.fokusZurueck, fehler: e.normalFehler });
        log('M-frueh-schliessen', v, e.fruehGetestet && e.fruehSauber && e.fruehFehler.length === 0, { vorShown: e.fruehGetestet, sauber: e.fruehSauber, fehler: e.fruehFehler });
        log('M-detail-wechsel', v, e.wechsel && e.nurEinModal && e.wechselFehler.length === 0, { gewechselt: e.wechsel, nurEinModal: e.nurEinModal, fehler: e.wechselFehler });
        log('M-seitenwechsel', v, e.seitenwechsel && e.keinSpaetesModal && e.rueckkehr && e.seitenwechselFehler.length === 0, { seite: e.seitenwechsel, keinModal: e.keinSpaetesModal, rueckkehr: e.rueckkehr, fehler: e.seitenwechselFehler });
        log('M-fallback', v, e.fallbackOffen && e.fallbackSauber && e.restFehler.length === 0, { offen: e.fallbackOffen, sauber: e.fallbackSauber, fehler: e.restFehler });
      } catch (e) { log('M-suite', v, false, { fehler: e.message }); }
    }
  }
  if (name === "bildnachweise") {
    const passend = liste => Array.isArray(liste) && liste.length > 0 && liste.every(e => e.quelle && e.lizenz && e.rechte && e.titel && e.nichtVerschachtelt && e.passt && e.ohneDarstellung);
    const ohneNachweise = liste => Array.isArray(liste) && liste.length > 0 && liste.every(e => e.bildVorhanden && e.ohneNachweis && e.ohneDarstellung);
    for (const [b, h] of [[375, 812], [1366, 768]]) {
      const v = b + "x" + h;
      try {
        const erg = await mitChrome(b, h, FIXTURE_URL, FIXTURE_INJEKTION, BILDNACHWEIS_MESSUNG, 0);
        for (const ansicht of ['programm', 'katalog', 'archiv']) log('B-' + ansicht, v, ohneNachweise(erg[ansicht]), erg[ansicht]);
        for (const ansicht of ['detail', 'lightbox']) log('B-' + ansicht, v, passend(erg[ansicht]), erg[ansicht]);
        log('B-lightbox-geometrie', v, erg.lightboxGeometrie && erg.lightboxOhneDarstellung, { geometrie: erg.lightboxGeometrie, ohneDarstellung: erg.lightboxOhneDarstellung });
        log('B-lightbox-link-fokus', v, erg.lightboxLinkFokus, erg.fokusDiagnose);
        log('B-kein-overflow-nur-archiv-nachgeladen', v, erg.keinOverflow && erg.nurArchivNachgeladen, { overflow: !erg.keinOverflow, nurArchivNachgeladen: erg.nurArchivNachgeladen });
      } catch (e) { log('B-suite', v, false, { fehler: e.message }); }
    }
  }
  if (name === "a11y") {
    try {
      const erg = await mitChrome(375, 812, FIXTURE_URL, FIXTURE_INJEKTION, A11Y_MESSUNG, 0);
      log("A-trefferflaechen", "375x812", erg.trefferflaechenUnter24.length === 0, { unter: erg.trefferflaechenUnter24 });
      log("A-labels", "375x812", erg.iconLabels.length === 0 && erg.sucheLabel === 'da', { labels: erg.iconLabels, suche: erg.sucheLabel });
      log("A-kontrast", "375x812", erg.kontrastMesspunkteFehlen.length === 0 && erg.kontrastStichproben.length > 0 && erg.kontrastStichproben.every(p => p.wert >= 4.5),
        { fehlendeMesspunkte: erg.kontrastMesspunkteFehlen, stichproben: erg.kontrastStichproben });
      log("A-aria", "375x812", erg.modiAria && erg.keinFokussierbaresVerstecktes, { drawerAria: erg.drawerAria });
      log("A-reiter-tabindex", "375x812", erg.einTabindex0 && erg.tabindexAmAktiven, { einer: erg.einTabindex0, amAktiven: erg.tabindexAmAktiven });
      log("A-reiter-pfeiltasten", "375x812",
        erg.pfeilVorher === 'programm' && erg.pfeilNachher === 'karte' && erg.pfeilFokusMitgewandert && erg.pfeilZurueck === 'programm' && erg.enterUnveraendert === true,
        { vorher: erg.pfeilVorher, nachher: erg.pfeilNachher, zurueck: erg.pfeilZurueck, fokus: erg.pfeilFokusMitgewandert, enter: erg.enterUnveraendert });
    } catch (e) { log("A-suite", "375x812", false, { fehler: e.message }); }
  }
  const zusammenfassung = pruefErgebnis(zeilen);
  console.log(JSON.stringify({ suite: name, zusammenfassung }));
  process.exitCode = zusammenfassung.fails > 0 ? 1 : 0;
}

module.exports = { mitChrome, FIXTURE_URL, FIXTURE_INJEKTION, sleep, pruefErgebnis };
if (require.main === module) suite(process.argv[2] || "sweep").catch((e) => { console.error("FEHLER:", e.message); process.exitCode = 1; });
