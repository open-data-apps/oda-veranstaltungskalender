'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const expectedRoots = ['CHANGELOG.md', 'LICENSE', 'app', 'app-package.json', 'assets'];

function makeFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'odas-package-test-'));
  const projectDir = path.join(tempRoot, 'veranstaltungskalender-fixture');
  fs.mkdirSync(projectDir);
  fs.copyFileSync(path.join(projectRoot, 'Makefile'), path.join(projectDir, 'Makefile'));

  for (const dir of ['app', 'assets']) fs.mkdirSync(path.join(projectDir, dir));
  fs.writeFileSync(path.join(projectDir, 'app', 'index.html'), '<main>Fixture</main>\n');
  fs.writeFileSync(path.join(projectDir, 'assets', 'schema.json'), '{}\n');
  fs.writeFileSync(path.join(projectDir, 'app-package.json'), '{}\n');
  fs.writeFileSync(path.join(projectDir, 'CHANGELOG.md'), '# Fixture\n');
  fs.writeFileSync(path.join(projectDir, 'LICENSE'), 'Fixture license\n');

  return { tempRoot, projectDir };
}

function runMake(projectDir, target, env = {}) {
  return spawnSync('make', ['-f', 'Makefile', target], {
    cwd: projectDir,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

function assertMakeSucceeded(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function archiveEntries(archivePath) {
  const result = spawnSync('unzip', ['-Z1', archivePath], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim().split(/\r?\n/).filter(Boolean);
}

function archiveRoots(entries) {
  return [...new Set(entries.map((entry) => entry.split('/')[0]))].sort();
}

test('fresh and repeated zip builds contain only current delivery files', (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.tempRoot, { recursive: true, force: true }));

  const archivePath = path.join(fixture.projectDir, `${path.basename(fixture.projectDir)}.zip`);
  assertMakeSucceeded(runMake(fixture.projectDir, 'zip'));
  assert.deepEqual(archiveRoots(archiveEntries(archivePath)), expectedRoots);

  const removedFile = path.join(fixture.projectDir, 'app', 'removed-after-first-build.txt');
  fs.writeFileSync(removedFile, 'must not survive the next archive build\n');
  assertMakeSucceeded(runMake(fixture.projectDir, 'zip'));
  fs.unlinkSync(removedFile);
  assertMakeSucceeded(runMake(fixture.projectDir, 'zip'));

  const entries = archiveEntries(archivePath);
  assert.deepEqual(archiveRoots(entries), expectedRoots);
  assert.equal(entries.includes('app/removed-after-first-build.txt'), false,
    'a repeated build must not retain a file deleted from the source tree');
});

test('a failed zip leaves the previous delivery archive byte-identical', (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.tempRoot, { recursive: true, force: true }));

  const archiveName = `${path.basename(fixture.projectDir)}.zip`;
  const archivePath = path.join(fixture.projectDir, archiveName);
  assertMakeSucceeded(runMake(fixture.projectDir, 'zip'));
  const previousArchive = fs.readFileSync(archivePath);

  const failingBin = path.join(fixture.tempRoot, 'failing-bin');
  fs.mkdirSync(failingBin);
  const failingZip = path.join(failingBin, 'zip');
  fs.writeFileSync(failingZip, '#!/bin/sh\nprintf \'partial broken archive\\n\' > "$2"\nexit 23\n');
  fs.chmodSync(failingZip, 0o755);

  const failedBuild = runMake(fixture.projectDir, 'zip', {
    PATH: `${failingBin}${path.delimiter}${process.env.PATH || ''}`
  });
  assert.notEqual(failedBuild.status, 0, 'the injected zip failure must reach make');
  assert.deepEqual(fs.readFileSync(archivePath), previousArchive,
    'the existing good archive must not be replaced on zip failure');
  assert.equal(fs.readdirSync(fixture.projectDir).some((name) => name.startsWith(`.${archiveName}.tmp.`)), false,
    'temporary archive directories must be removed after failure');
});

test('check-app clearly fails when the external odas-tools checker is absent', (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.tempRoot, { recursive: true, force: true }));

  const result = runMake(fixture.projectDir, 'check-app');
  assert.notEqual(result.status, 0, 'check-app must not claim success without its external checker');
  assert.match(`${result.stdout}\n${result.stderr}`, /external.*odas-tools.*app-check\.sh|odas-tools.*external/i);
});

test('the table schema declares its standard and parser-produced description field', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets', 'schema.json'), 'utf8'));
  assert.equal(schema.$schema, 'https://frictionlessdata.io/schemas/table-schema.json');

  const beschreibung = schema.fields.find((field) => field.name === 'beschreibung');
  assert.ok(beschreibung, 'the parsed event description must be described in the table schema');
  assert.equal(beschreibung.type, 'string');
  assert.equal(beschreibung.title, 'Beschreibung');
  assert.match(beschreibung.description, /schema:description/i);
});

test('the unused Chart.js artifact and notice are removed without dropping retained licenses', () => {
  const chartDir = path.join(projectRoot, 'app', 'vendor', 'chartjs');
  const chartFile = path.join(chartDir, 'chart.umd.min.js');
  const notices = fs.readFileSync(path.join(projectRoot, 'app', 'vendor', 'THIRD-PARTY-NOTICES.md'), 'utf8');

  assert.equal(fs.existsSync(chartFile), false, 'unused Chart.js runtime artifact must be deleted');
  assert.equal(fs.existsSync(chartDir), false, 'the now-empty Chart.js directory must be deleted');
  assert.doesNotMatch(notices, /Chart\.js/);
  assert.match(notices, /Bootstrap 5\.3\.8 — MIT/);
  assert.match(notices, /Copyright \(c\) 2011-2025 The Bootstrap Authors/);
  assert.match(notices, /Leaflet 1\.9\.4 — BSD-2-Clause/);
  assert.match(notices, /BSD 2-Clause License/);
  assert.match(notices, /Leaflet\.markercluster 1\.5\.3 — MIT/);
  assert.match(notices, /Copyright 2012 David Leaver/);
});
