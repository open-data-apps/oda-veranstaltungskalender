'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../app/app.js'), 'utf8');
const lat = 53.5501721, lon = 10.0013165;

function row(id, date) {
  return { s: { type: 'uri', value: id }, name: { type: 'literal', value: id },
    startDatum: { type: 'literal', value: date }, endDatum: { type: 'literal', value: date },
    ortName: { type: 'literal', value: 'Fixture venue' }, typ: { type: 'literal', value: 'https://schema.org/MusicEvent' } };
}

test('dense circles use short calendar requests, merge duplicate IDs, and cap the global nearest set', async () => {
  const requests = [];
  const sandbox = {
    console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    window: { location: { pathname: '/view/audit-test/oda-veranstaltungskalender/cmuo0ajoh0001t12n0bqdkd2a/' } },
    document: { readyState: 'complete', addEventListener() {} },
    fetch: async (url) => {
      if (String(url).includes('nominatim')) return { ok: true, status: 200, text: async () => JSON.stringify([{ lat: String(lat), lon: String(lon) }]) };
      const relay = new URL(String(url), 'http://localhost');
      const target = new URL(relay.searchParams.get('path'), 'https://proxy.opendatagermany.io/api/');
      const query = target.searchParams.get('query');
      requests.push(query);
      if (relay.href.length >= 8000 || target.href.length >= 8000) return { ok: false, status: 414, text: async () => 'URI too long' };
      const literals = [...query.matchAll(/con:query\s+("(?:\\.|[^"\\])*")/g)];
      assert.equal(literals.length, 1, 'each request carries a single verified geo area');
      const shape = JSON.parse(JSON.parse(literals[0][1]));
      const box = shape.query.bool && shape.query.bool.filter[1].geo_shape.geometry.shape.coordinates;
      let payload;
      if (query.includes('con:totalHits')) {
        const count = !box ? 24000 : box[0][1] - box[1][1] > 0.3 ? 12000 : 6000;
        payload = { head: { vars: ['vkGeoTotal'] }, results: { bindings: [{ vkGeoTotal: { type: 'literal', datatype: 'http://www.w3.org/2001/XMLSchema#long', value: String(count) } }] } };
      } else if (query.includes('LIMIT 400')) {
        payload = { head: { vars: ['s', 'name', 'startDatum', 'endDatum', 'ortName', 'typ'] }, results: { bindings: [] } };
      } else {
        const southWest = box[0][0] < lon && Math.abs(box[0][1] - lat) < 1e-9;
        const rows = southWest
          ? Array.from({ length: 600 }, (_, i) => row('urn:w' + String(i).padStart(4, '0'), '2026-10-13T12:00:00+02:00'))
          : [row('urn:w0000', '2026-10-13T12:00:00+02:00'), row('urn:earlier', '2026-10-12T12:00:00+02:00')];
        payload = { head: { vars: ['s', 'name', 'startDatum', 'endDatum', 'ortName', 'typ'] }, results: { bindings: rows } };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source + '\n;globalThis.__load = ladeEvents;', sandbox);
  const result = await sandbox.__load({ ort: 'Hamburg', radiusKm: '25', apiurls: [{ name: 'veranstaltungen', url: 'https://proxy.opendatagermany.io/api/ts/v1/kg/sparql' }] }, undefined, { heuteKey: '2026-10-12' });
  assert.equal(result.zukunft.length, 600, '600 is a global event limit, not a per-area display limit');
  assert.equal(result.zukunft[0].id, 'urn:earlier', 'the earliest event from another area is retained');
  assert.equal(result.zukunft.filter(e => e.id === 'urn:w0000').length, 1, 'border duplicate appears once');
  assert.equal(result.zukunft.some(e => e.id === 'urn:w0599'), false, 'the global 601st event is excluded');
  assert.equal(result.archiv.length, 0);
  assert.equal(requests.filter(q => q.includes('LIMIT 600')).length, 4);
  assert.equal(requests.filter(q => q.includes('LIMIT 400')).length, 4);
});
