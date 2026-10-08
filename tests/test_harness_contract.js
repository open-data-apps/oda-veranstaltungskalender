const assert = require("assert");
const { spawnSync } = require("child_process");
const path = require("path");

const audit = path.join(__dirname, "mobile_audit.js");
const run = spawnSync(process.execPath, [audit, "__not-a-suite__"], {
  encoding: "utf8",
  env: { ...process.env, VK_CHROME: "/definitely/not/a/chrome-binary" }
});

assert.strictEqual(run.status, 1, "unknown suite must fail before starting Chrome");
assert.match(run.stderr + run.stdout, /Unbekannte.*Suite/i, "unknown suite should explain the rejected name");
console.log("[PASS] unknown suite exits nonzero before Chrome");
const { pruefErgebnis } = require("./mobile_audit");
assert.throws(() => pruefErgebnis([]), /ohne Pruefungen/);
assert.deepStrictEqual(pruefErgebnis([{pass: true}, {pass: false}]), {pruefungen: 2, fails: 1});
console.log("[PASS] zero assertions fail; failed checks remain failed");

(async () => {
  const vm = require('vm'), fs = require('fs');
  const actual = [];
  const c = { URL, Response, window: { location: { href: 'http://fixture/app/' }, fetch: async url => { actual.push(url); return new Response('ok'); } } };
  vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(__dirname, 'browser-fixtures.js'), 'utf8'), c);
  c.window.installVkFixtureTransport('success');
  await assert.rejects(() => c.window.fetch('/not-allowed'), /Unerwarteter Fixture-Abruf/);
  assert.strictEqual(actual.length, 0, 'unexpected URL never reaches original fetch');
  c.window.installVkFixtureTransport('error');
  assert.strictEqual(c.window.vkFixtureResult.unexpected.length, 1, 'fixture reset retains unexpected-request evidence');
  await c.window.fetch('../odas-config/config.json');
  await c.window.fetch('https://tile.openstreetmap.org/0/0/0.png');
  assert.strictEqual(actual.length, 2, 'local config and OSM tiles intentionally pass through');
  console.log('[PASS] fixture transport fails closed and preserves isolation evidence');
})().catch(e => { console.error(e); process.exitCode = 1; });
