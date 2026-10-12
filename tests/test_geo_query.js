'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../app/app.js'), 'utf8');
const lat = 53.5501721;
const lon = 10.0013165;
const circle = { geo_shape: { geometry: { shape: { type: 'circle', radius: '25km', coordinates: [lon, lat] }, relation: 'intersects' } } };

function api(countForShape) {
  const requests = [];
  const sandbox = {
    console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    window: { location: { pathname: '/app/' } },
    document: { readyState: 'complete', addEventListener() {} },
    fetch: async (url) => {
      const relay = new URL(String(url), 'http://127.0.0.1');
      const target = new URL(relay.searchParams.get('path'), 'https://dzt.invalid/');
      const query = target.searchParams.get('query');
      const literal = query.match(/con:query\s+("(?:\\.|[^"\\])*")/);
      assert.ok(literal, 'the connector requires a constant string literal');
      const shape = JSON.parse(JSON.parse(literal[1]));
      requests.push(shape);
      const count = countForShape(shape);
      const payload = count === null ? { results: { bindings: [{}] } } : {
        head: { vars: ['vkGeoTotal'] },
        results: { bindings: [{ vkGeoTotal: { type: 'literal', datatype: 'http://www.w3.org/2001/XMLSchema#long', value: String(count) } }] }
      };
      return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source + '\n;globalThis.__geo = { buildSparqlQuery, planner: typeof vkPlaneGeoAbfragen === "function" ? vkPlaneGeoAbfragen : null };', sandbox);
  return { ...sandbox.__geo, requests };
}

function plannerFor(counts) {
  const subject = api(counts);
  assert.equal(typeof subject.planner, 'function', 'overflowing geo searches must be planned before calendar retrieval');
  return subject;
}

test('a geo search below the native result window keeps the exact original circle', async () => {
  const subject = plannerFor(() => 9999);
  const queries = await subject.planner('ts/v1/kg/sparql', lat, lon, '25');
  assert.equal(subject.requests.length, 1);
  assert.equal(queries.length, 1);
  assert.deepEqual(JSON.parse(queries[0]), { query: circle });
});

test('10852 matching Hamburg places are split without changing the circle', async () => {
  const subject = plannerFor((shape) => {
    if (!shape.query.bool) return 10852;
    const [original, box] = shape.query.bool.filter;
    assert.deepEqual(original, circle);
    const coordinates = box.geo_shape.geometry.shape.coordinates;
    assert.equal(box.geo_shape.geometry.shape.type, 'envelope');
    assert.equal(box.geo_shape.geometry.relation, 'intersects');
    return coordinates[1][0] === lon ? 5739 : 5154;
  });
  const queries = await subject.planner('ts/v1/kg/sparql', lat, lon, '25');
  assert.equal(subject.requests.length, 3);
  assert.equal(queries.length, 2);
  const boxes = queries.map((q) => JSON.parse(q).query.bool.filter[1].geo_shape.geometry.shape.coordinates);
  assert.equal(boxes[0][1][0], lon, 'western half ends at the center');
  assert.equal(boxes[1][0][0], lon, 'eastern half starts at the center');
  assert.ok(boxes[0][0][0] < 9.624 && boxes[1][1][0] > 10.378, 'boxes cover the entire 25 km circle');
  assert.ok(boxes[0][0][1] > 53.775 && boxes[0][1][1] < 53.326, 'north/south bounds cover the circle');
});

test('a count at the native window boundary is not silently accepted', async () => {
  const subject = plannerFor((shape) => shape.query.bool ? 5000 : 10000);
  const queries = await subject.planner('ts/v1/kg/sparql', lat, lon, '25');
  assert.equal(queries.length, 2);
});

test('a genuinely empty geo search yields no calendar search areas', async () => {
  const subject = plannerFor(() => 0);
  const queries = await subject.planner('ts/v1/kg/sparql', lat, lon, '25');
  assert.equal(queries.length, 0);
  assert.equal(subject.requests.length, 1);
});

test('missing total-hit metadata is an error rather than an empty calendar', async () => {
  const subject = plannerFor(() => null);
  await assert.rejects(subject.planner('ts/v1/kg/sparql', lat, lon, '25'), /Antwortformat/);
});

test('an unsplittable result window fails visibly instead of dropping places', async () => {
  const subject = plannerFor(() => 10001);
  await assert.rejects(subject.planner('ts/v1/kg/sparql', lat, lon, '25'), /Geo.*vollständig|vollständig.*Geo/);
  assert.ok(subject.requests.length <= 10, 'depth-first failure must stop without unbounded requests');
});

test('calendar requests use a constant complete geo area and limit event IDs before enrichment', () => {
  const subject = api(() => 0);
  const west = { query: { bool: { filter: [circle, { geo_shape: { geometry: { shape: { type: 'envelope', coordinates: [[9,54],[lon,53]] }, relation: 'intersects' } } }] } } };
  const q = subject.buildSparqlQuery({ modus: 'zukunft', lat, lon, radiusKm: 25, heuteKey: '2026-10-12', geoQuery: JSON.stringify(west) });
  const shapes = [...q.matchAll(/con:query\s+("(?:\\.|[^"\\])*")/g)].map((m) => JSON.parse(JSON.parse(m[1])));
  assert.deepEqual(shapes, [west]);
  assert.match(q, /SELECT DISTINCT \?loc WHERE/, 'materialize geo places before event joins');
  assert.match(q, /MIN\(STR\(\?vkStart\)\) AS \?vkStartWahl/);
  assert.match(q, /GROUP BY \?s\s+ORDER BY \?vkStartWahl \?s\s+LIMIT 600/);
  assert.match(q, /FILTER\(STR\(\?vkStart\) = \?vkStartWahl\)/, 'metadata belongs to the selected date');
  assert.match(q, /\?vkOrt schema:name/, 'the displayed venue must be geo-matched');
});

test('archive requests choose the latest eligible date and then cap event IDs', () => {
  const subject = api(() => 0);
  const q = subject.buildSparqlQuery({ modus: 'archiv', lat, lon, radiusKm: 25, heuteKey: '2026-10-12' });
  assert.match(q, /MAX\(STR\(\?vkStart\)\) AS \?vkStartWahl/);
  assert.match(q, /GROUP BY \?s\s+ORDER BY DESC\(\?vkStartWahl\) \?s\s+LIMIT 400/);
});
