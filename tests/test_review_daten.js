/* v1.4.4: Regressionen aus dem Vollreview (echte Funktionen, Netzwerk/Uhr ersetzt). */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const code = fs.readFileSync(path.join(__dirname, '../app/app.js'), 'utf8');
function umgebung() {
  let jetzt = new Date('2026-10-08T12:00:00').getTime(), timerId = 0;
  const timer = new Map(), docListener = new Map(), winListener = new Map();
  class Uhr extends Date { constructor(...args) { super(...(args.length ? args : [jetzt])); } static now() { return jetzt; } }
  const c = {
    console, URL, URLSearchParams, Intl, Date: Uhr, AbortController, TextEncoder,
    setTimeout(fn, ms) { const id = ++timerId; timer.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timer.delete(id); },
    window: { location: { href: 'https://store/app/', search: '' }, addEventListener(k, fn) { winListener.set(k, fn); }, removeEventListener(k) { winListener.delete(k); } },
    document: { visibilityState: 'visible', addEventListener(k, fn) { docListener.set(k, fn); }, removeEventListener(k) { docListener.delete(k); }, getElementById() { return null; }, body: { classList: { remove() {} } } }
  };
  vm.createContext(c); vm.runInContext(code, c);
  c.renderModus = () => {}; c.wendeFilterAn = () => {};
  return { c, timer, docListener, winListener, tag(iso) { jetzt = new Date(iso + 'T12:00:00').getTime(); } };
}
const archive = { id: 'urn:gleich', name: 'Archivtermin', startDatum: '2026-10-05', startZeit: '11:00', endDatum: '2026-10-05', endZeit: '12:00', bilder: [] };
const future = { ...archive, name: 'Zukunftstermin', startDatum: '2026-11-02', endDatum: '2026-11-02' };
const archiveKey = '2026-10-05|11:00|2026-10-05|12:00';
const futureKey = '2026-11-02|11:00|2026-11-02|12:00';
function state() { return { appUid: 'review', modus: 'archiv', heuteKey: '2026-10-08', status: 'bereit', dom: {}, controller: new AbortController(), configdata: { ort: 'Boeblingen', radiusKm: '25', apiurls: [{ name: 'veranstaltungen', url: 'https://proxy.opendatagermany.io/api/ts/v1/kg/sparql' }] }, events: { zukunft: [future], archiv: [archive] } }; }
let n = 0, fail = 0;
async function test(name, fn) { n++; try { await fn(); console.log('OK ' + name); } catch (e) { fail++; console.error('FAIL ' + name + ': ' + e.message); } }
(async () => {
  await test('Terminschluessel trennt Termine derselben DZT-ID', () => {
    const { c } = umgebung(); assert.strictEqual(typeof c.vkTerminSchluessel, 'function');
    assert.strictEqual(c.vkTerminSchluessel(archive), archiveKey); assert.strictEqual(c.vkTerminSchluessel(future), futureKey);
  });
  await test('Exakter Archiv-Lookup nimmt nicht den Zukunftstermin', () => { const { c } = umgebung(); assert.strictEqual(c.vkFindeEvent(state(), archive.id, archiveKey), archive); });
  await test('Unbekannter Termin darf nicht auf anderes Datum zurueckfallen', () => { const { c } = umgebung(); assert.strictEqual(c.vkFindeEvent(state(), archive.id, 'fehlt'), null); });
  await test('Alte Links ohne Termin bleiben kompatibel', () => { const { c } = umgebung(); assert.strictEqual(c.vkFindeEvent(state(), future.id), future); });
  await test('Karten tragen konkrete Terminkennung', () => { const { c } = umgebung(); assert.ok(c.eventKarteHtml(state(), archive).includes('data-vk-termin="' + archiveKey + '"')); });
  await test('Teilen setzt Termin und loescht alte Terminparameter', () => {
    const { c } = umgebung(); const u = new URL(c.vkTeilenLink('https://store/app/?termin=alt&x=1#startseite', archive.id, archiveKey));
    assert.strictEqual(u.searchParams.get('termin'), archiveKey); assert.strictEqual(u.searchParams.get('x'), '1');
    assert.strictEqual(new URL(c.vkTeilenLink(u.href, future.id)).searchParams.has('termin'), false);
  });
  await test('Detail-Kanaele teilen den ausgewaehlten Termin', () => {
    const { c } = umgebung(); const html = c.vkDetailHtml(state(), archive);
    assert.ok(decodeURIComponent(decodeURIComponent(html)).includes('termin=' + archiveKey));
  });
  await test('Geteilter Archivtermin oeffnet genau das Archivdatum', () => {
    const { c } = umgebung(); c.window.location.search = '?event=urn%3Agleich&termin=' + encodeURIComponent(archiveKey); let chosen;
    c.zeigeEventDetail = (_s, e) => { chosen = e; }; const s = state(); c.vkPruefeGeteiltenLink(s); assert.strictEqual(chosen, archive);
  });
  await test('Geteilter ungueltiger Termin zeigt Hinweis', () => {
    const { c } = umgebung(); c.window.location.search = '?event=urn%3Agleich&termin=unbekannt'; let shown = false; c.zeigeEventDetail = () => { shown = true; }; const s = state(); c.vkPruefeGeteiltenLink(s); assert.strictEqual(shown, false); assert.strictEqual(s.geteiltHinweis, true);
  });
  await test('Kalender-UID unterscheidet Archiv und Zukunft desselben Events', () => {
    const { c } = umgebung(); const uid = e => c.buildIcs(e).replace(/\r\n[ \t]/g, '').split('\r\n').find(l => l.startsWith('UID:'));
    assert.notStrictEqual(uid(archive), uid(future)); assert.strictEqual(uid(archive), uid({ ...archive }));
  });
  await test('Wochenende zaehlt Ueberschneidung und keine getrennten Intervalle', () => {
    const { c } = umgebung(); const events = [
      { startDatum: '2026-10-08', endDatum: '2026-10-10' },
      { startDatum: '2026-10-01', endDatum: '2026-10-31' },
      { startDatum: '2026-10-08', endDatum: '2026-10-08' },
      { startDatum: '2026-10-12', endDatum: '2026-10-12' }
    ]; assert.strictEqual(c.kpiWerte(events, '2026-10-08').wochenende, 2);
  });
  await test('Zukunftsfenster beinhaltet volle DateTime am letzten Tag', () => {
    const { c } = umgebung(); const q = c.buildSparqlQuery({ modus: 'zukunft', lat: 48, lon: 9, radiusKm: 25, heuteKey: '2026-10-08' });
    assert.ok(q.includes('STR(?vkStart) < "2027-10-09"')); assert.ok(!q.includes('STR(?vkStart) <= "2027-10-08"'));
    assert.ok('2027-10-08T23:59:59+02:00' < '2027-10-09'); assert.ok(!('2027-10-09T00:00:00+02:00' < '2027-10-09'));
  });
  await test('Tageswechsel laedt neu, gleicher Tag und abgebrochene Instanz nicht', async () => {
    const u = umgebung(), c = u.c, s = state(); let calls = 0; c.ladeEvents = async () => { calls++; return { zukunft: [], archiv: [], heuteKey: c.heutigerTagKey() }; };
    assert.strictEqual(typeof c.vkTageswechselPruefen, 'function'); assert.strictEqual(await c.vkTageswechselPruefen(s), false);
    u.tag('2026-10-09'); const oldController = s.controller; await c.vkTageswechselPruefen(s);
    assert.strictEqual(oldController.signal.aborted, true); assert.strictEqual(s.heuteKey, '2026-10-09'); assert.strictEqual(s.status, 'bereit'); assert.strictEqual(calls, 1);
    await c.vkTageswechselPruefen(s); assert.strictEqual(calls, 1); s.controller.abort(); u.tag('2026-10-10'); await c.vkTageswechselPruefen(s); assert.strictEqual(calls, 1);
  });
  await test('Spaete Altantwort darf Folgetag weder ueberschreiben noch cachen', async () => {
    const u = umgebung(), c = u.c, s = state(), replies = []; c.ladeEvents = () => new Promise(resolve => replies.push(resolve));
    const old = c.ladeDaten(s); assert.strictEqual(replies.length, 1); assert.strictEqual(typeof c.vkTageswechselPruefen, 'function');
    u.tag('2026-10-09'); const fresh = c.vkTageswechselPruefen(s); assert.strictEqual(replies.length, 2);
    const day2 = { heuteKey: '2026-10-09', zukunft: [future], archiv: [] }; replies[1](day2); await fresh;
    replies[0]({ heuteKey: '2026-10-08', zukunft: [], archiv: [archive] }); await old;
    assert.strictEqual(s.events, day2); assert.strictEqual(c.vkCachePruefe(s.configdata), day2);
  });
  await test('Datum wechselt waehrend eines Abrufs ohne Fokusereignis', async () => {
    const u = umgebung(), c = u.c, s = state(); let count = 0, first;
    c.ladeEvents = () => { count++; return count === 1 ? new Promise(r => { first = r; }) : Promise.resolve({ heuteKey: '2026-10-09', zukunft: [], archiv: [] }); };
    const request = c.ladeDaten(s); u.tag('2026-10-09'); first({ heuteKey: '2026-10-08', zukunft: [], archiv: [] }); await request;
    assert.strictEqual(count, 2); assert.strictEqual(s.heuteKey, '2026-10-09'); assert.strictEqual(c.vkCachePruefe(s.configdata).heuteKey, '2026-10-09');
  });
  await test('Tagespruefung hat Fokus/Visibility/Timer und raeumt beim Leave auf', () => {
    const u = umgebung(), c = u.c, s = state(); assert.strictEqual(typeof c.vkTageswechselVerdrahten, 'function'); c.vkTageswechselVerdrahten(s);
    assert.ok(u.winListener.has('focus')); assert.ok(u.docListener.has('visibilitychange')); assert.strictEqual(u.timer.size, 1); assert.ok([...u.timer.values()][0].ms > 0);
    c.reviewState = s; vm.runInContext('vkInstances.set(reviewState.appUid, reviewState)', c); c.onPageLeave('kontakt');
    assert.ok(!u.winListener.has('focus')); assert.ok(!u.docListener.has('visibilitychange')); assert.strictEqual(u.timer.size, 0);
  });
  console.log(`Review-Daten: ${n - fail}/${n} bestanden`); if (fail) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
