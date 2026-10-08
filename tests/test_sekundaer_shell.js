/* Regression: Sekundaerseiten brauchen den App-Kopf und echten Drawer,
 * nicht bloss eine Inhaltskarte unter dem Template-Menue. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const classes = new Set();
const listener = new Set();
const root = { addEventListener(_name, f) { listener.add(f); }, removeEventListener(_name, f) { listener.delete(f); } };
const configData = {
  titel: 'Kalender <Test>', ort: 'Böblingen', radiusKm: '25',
  beschreibung: '## Methodik\n**Text**', kontakt: '<p>Kontakttext</p>',
  impressum: '', datenschutz: 'Datenschutztext',
  fusszeile: '<p>© Betreiber <a href="https://example.org/">Hinweis</a></p>'
};
const sandbox = { console, configData, AbortController,
  document: {
    body: { classList: { add: c => classes.add(c), remove: c => classes.delete(c) } },
    getElementById: id => id === 'main-content' ? root : null,
    addEventListener() {}, removeEventListener() {}
  }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../app/app.js', 'utf8') + '\n globalThis.exp = { shellHtml, renderPageOverride, onPageLeave };', sandbox);
const { shellHtml, renderPageOverride, onPageLeave } = sandbox.exp;
const start = shellHtml({ appUid: 'start-test', configdata: configData, modus: 'programm', zeitraum: '7' });
assert.ok(start.includes('class="vk-kopf"') && start.includes('class="vk-menue-btn"'));
assert.strictEqual(renderPageOverride('startseite'), undefined);
for (const [page, title] of Object.entries({ beschreibung: 'Über diese App', kontakt: 'Kontakt', impressum: 'Impressum', datenschutz: 'Datenschutz' })) {
  onPageLeave(page);
  const html = renderPageOverride(page);
  assert.ok(html.includes('class="vk-kopf"'), page + ': gemeinsamer App-Kopf fehlt');
  assert.ok(html.includes('class="vk-menue-btn"'), page + ': Startseiten-Burger fehlt');
  assert.ok(html.includes('class="vk-drawer"'), page + ': App-Drawer fehlt');
  assert.ok(html.includes('Kalender &lt;Test&gt;'), 'Titel sicher maskiert');
  assert.ok(html.includes('Böblingen · 25 km'), 'gleiche Ortszeile');
  assert.ok(/<a[^>]*href="#startseite"[^>]*>Zum Programm<\/a>/.test(html), 'Rueckweg sichtbar');
  assert.ok(!html.includes('data-vk-modus'), 'keine Ansichts-Tabs auf Textseiten');
  assert.ok(new RegExp('<h2 id="vk-i\\d+-seitentitel" tabindex="-1">' + title + '</h2>').test(html), 'Seitentitel erhalten und als Fokusziel benannt');
  assert.ok(html.includes('class="vk-seiten-fuss"'), 'integrierter Footer');
  assert.ok(html.includes(configData.fusszeile), 'konfigurierte Footer-Inhalte unveraendert');
  assert.ok(new RegExp('<a[^>]*href="#' + page + '"[^>]*aria-current="page"').test(html), 'aktuelle Seite markiert');
  assert.ok(classes.has('vk-app-aktiv'), 'Template-Chrome ausgeblendet');
  assert.ok(classes.has('vk-sekundaer'));
  assert.strictEqual(listener.size, 1, 'genau ein Navigationshandler pro Seite');
  console.log('PASS: ' + page + ' mit App-Kopf, Drawer, Rueckweg und Footer');
}
onPageLeave('startseite');
assert.ok(!classes.has('vk-sekundaer'), 'Sekundaerzustand beim Verlassen entfernt');
assert.strictEqual(listener.size, 0, 'Navigationshandler nach Verlassen freigegeben');
console.log('GREEN: gemeinsame Navigation auf allen Sekundaerseiten');
