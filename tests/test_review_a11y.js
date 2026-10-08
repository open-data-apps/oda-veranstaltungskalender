/* v1.4.4: Semantik/Fokusvertrag und unabhaengige Kontrastberechnung. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../app/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../app/app.css'), 'utf8');
function setup() {
  const appended = [], listeners = new Map(), frames = new Map(), elements = new Map(); let id = 0;
  const doc = {
    visibilityState: 'visible', activeElement: null,
    body: { appendChild(e) { appended.push(e); }, classList: { add() {}, remove() {} } },
    addEventListener(k, fn) { listeners.set(k, fn); }, removeEventListener(k) { listeners.delete(k); },
    getElementById(k) { return elements.get(k) || null; }, contains(e) { return !!e; },
    createElement() {
      const attrs = {}, close = { focus() { doc.activeElement = close; } };
      return { attrs, close, style: {}, classList: { add() {} },
        setAttribute(k, v) { attrs[k] = v; }, getAttribute(k) { return attrs[k] ?? null; }, removeAttribute(k) { delete attrs[k]; },
        addEventListener() {}, remove() {}, querySelector() { return close; }, querySelectorAll() { return [close]; }, contains(e) { return e === close; }
      };
    }
  };
  const c = { console, URL, URLSearchParams, Date, Intl, AbortController, TextEncoder,
    document: doc, window: { location: { href: 'https://example.org/app/', search: '' } },
    requestAnimationFrame(fn) { frames.set(++id, fn); return id; }, cancelAnimationFrame(i) { frames.delete(i); }
  };
  vm.createContext(c); vm.runInContext(source + '\n;globalThis.types = VK_EVENT_TYPES;', c);
  return { c, doc, appended, listeners, frames, elements };
}
function state() { return { appUid: 'test', modus: 'programm', configdata: {}, typen: new Set(), heuteKey: '2026-10-08', dom: {}, controller: new AbortController() }; }
const event = { id: 'urn:test', name: 'Konzerte < & >', startDatum: '2026-10-08', bilder: [] };
function rgb(hex) { return hex.replace('#', '').match(/../g).map(x => parseInt(x, 16)); }
function lum(v) { return v.map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((n, x, i) => n + x * [.2126, .7152, .0722][i], 0); }
function ratio(fg, bg) { const a = lum(fg), b = lum(bg); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); }
function rule(selector) { const i = css.indexOf(selector + ' {'); assert.ok(i >= 0, selector + ' vorhanden'); return css.slice(i + selector.length + 2, css.indexOf('}', i)); }
let n = 0, fail = 0;
function test(name, fn) { n++; try { fn(); console.log('OK ' + name); } catch (e) { fail++; console.error('FAIL ' + name + ': ' + e.message); } }

test('Art-Optionen nutzen unverfaelschte Toggle-Button-Semantik', () => {
  const { c } = setup(); const html = c.shellHtml(state()); const options = [...html.matchAll(/<button[^>]+data-vk-typ-option[^>]+>/g)]; assert.strictEqual(options.length, 8);
  for (const [s] of options) { assert.ok(s.includes('aria-pressed="false"')); assert.ok(!s.includes('role="menuitemcheckbox"')); }
  assert.ok(!/<button[^>]+data-vk-art-toggle[^>]+aria-haspopup/.test(html), 'kein falsches Menue versprechen');
});
test('Escape fokussiert Art-Toggle, allgemeines Schliessen nicht', () => {
  const { c, doc, elements, listeners } = setup(), s = state(), panel = { hidden: false }; let focuses = 0;
  const toggle = { setAttribute() {}, focus() { focuses++; doc.activeElement = toggle; } };
  elements.set('vk-test-shell', { querySelector(sel) { return sel.includes('art-panel') ? panel : toggle; } });
  c.vkArtOffenVerdrahten(s); listeners.get('keydown')({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.strictEqual(panel.hidden, true); assert.strictEqual(focuses, 1);
  c.vkArtSchliessen(s); assert.strictEqual(focuses, 1, 'kein Fokusdiebstahl bei Aussenklick');
});
test('Detailtitel ist als benennbare instanzbezogene Ueberschrift vorhanden', () => {
  const { c } = setup(); const html = c.vkDetailHtml(state(), event);
  assert.ok(/<h2[^>]+id="vk-test-detail-titel"/.test(html)); assert.ok(html.includes('Konzerte &lt; &amp; &gt;'));
});
test('Bootstrap-Fallback hat Namen/Rolle und ist fuer AT sichtbar', () => {
  const { c, doc, appended } = setup(); c.zeigeEventDetail(state(), event); const m = appended[0];
  assert.strictEqual(m.getAttribute('role'), 'dialog'); assert.strictEqual(m.getAttribute('aria-modal'), 'true');
  assert.strictEqual(m.getAttribute('aria-labelledby'), 'vk-test-detail-titel'); assert.notStrictEqual(m.getAttribute('aria-hidden'), 'true');
  assert.strictEqual(doc.activeElement, m.close, 'Fokus beim Fallback im Dialog');
});
test('Informationsseite plant Fokus erst nach dem Einsetzen und kann ihn canceln', () => {
  const { c, frames, elements } = setup(); const root = { addEventListener() {}, removeEventListener() {} }; elements.set('main-content', root);
  const html = c.renderPageOverride('kontakt'); const m = html.match(/<h2[^>]*id="([^"]+)"[^>]*tabindex="-1"/);
  assert.ok(m, 'Seitenueberschrift programmatisch fokussierbar'); assert.strictEqual(frames.size, 1);
  let focus = 0; elements.set(m[1], { focus() { focus++; } }); [...frames.values()][0](); assert.strictEqual(focus, 1);
  frames.clear(); c.renderPageOverride('datenschutz'); assert.strictEqual(frames.size, 1); c.onPageLeave('startseite'); assert.strictEqual(frames.size, 0, 'veraltete Frame-Callbacks entfernt');
});
test('Alle Typ-Badges erreichen 4,5:1 auf eigenem getoentem Weiss', () => {
  const { c } = setup(); for (const [key, value] of Object.entries(c.types)) {
    const fg = rgb(value.farbe), bg = fg.map(v => v * (31 / 255) + 255 * (224 / 255));
    assert.ok(ratio(fg, bg) >= 4.5, key + ': ' + ratio(fg, bg).toFixed(2));
  }
});
test('Metadaten und Suchhinweis erreichen 4,5:1 auf hellen App-Flaechen', () => {
  for (const selector of ['.vk-tag-anzahl', '.vk-datenstand', '.vk-info-stand', '.vk-info-datenstand', '.vk-detail-label', '.vk-detail-quelle', '.vk-suche::placeholder']) {
    const m = rule(selector).match(/(?:^|;)\s*color:\s*(#[0-9a-f]{6})/i); assert.ok(m, selector + ' hat konkrete Textfarbe');
    for (const bg of ['#ffffff', '#f8fafc']) assert.ok(ratio(rgb(m[1]), rgb(bg)) >= 4.5, selector + ' auf ' + bg + ': ' + ratio(rgb(m[1]), rgb(bg)).toFixed(2));
  }
});
test('Live-Badge erreicht mindestens 4,5:1', () => {
  const r = rule('.vk-event-live'), bg = r.match(/background:\s*(#[0-9a-f]{6})/i); assert.ok(bg); assert.ok(ratio([255,255,255], rgb(bg[1])) >= 4.5);
});
console.log(`Review-A11y: ${n - fail}/${n} bestanden`); if (fail) process.exitCode = 1;
