import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { getLifeRegions, searchLifePlaces } from './life-place-index.mjs';
import { consumerCategories } from './seoul-life-taxonomy.mjs';

const regions = getLifeRegions();
const district = regions.districts[0];
const otherDistrict = regions.districts[1];
const legal = district.legal[0];
const admin = district.administrative[0];
const category = regions.categories[0].id;
const temp = mkdtempSync(join(tmpdir(), 'jachi-life-index-'));
after(() => rmSync(temp, { recursive: true, force: true }));
const scripts = join(temp, 'scripts');
const data = join(temp, 'data');
const classification = join(data, 'exports', 'seoul-life-2026-10-14', 'classification');
mkdirSync(scripts, { recursive: true });
mkdirSync(classification, { recursive: true });
copyFileSync(new URL('./life-place-index.mjs', import.meta.url), join(scripts, 'life-place-index.mjs'));
writeFileSync(join(data, 'life-regions.json'), JSON.stringify(regions));
writeFileSync(join(classification, 'classification-report.json'), JSON.stringify({ database: 'index-fixture.sqlite' }));
const database = join(classification, 'index-fixture.sqlite');
const fixtureDb = new DatabaseSync(database);
fixtureDb.exec(`CREATE TABLE places (
  id TEXT PRIMARY KEY, name TEXT, district TEXT, district_code TEXT,
  legal_name TEXT, legal_code TEXT, admin_name TEXT, admin_code TEXT,
  category_id TEXT, road_address TEXT, lot_address TEXT, latitude REAL, longitude REAL,
  raw_payload TEXT, brand_payload TEXT
);`);
const insert = fixtureDb.prepare('INSERT INTO places VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
const names = ['alpha', 'alpha', 'beta', 'literal%mark', 'literal_mark', 'literal\\mark', "quote' OR 1=1 --"];
for (const [index, name] of names.entries()) {
  insert.run(String(index), name, district.name, district.code, legal.name, legal.code,
    admin.name, admin.code, category, index === 0 ? '' : `road ${index}`, `lot ${index}`,
    37.5, 127, '{"private":"must-not-leak"}', '{"unverified":true}');
}
fixtureDb.close();
const fixture = await import(pathToFileURL(join(scripts, 'life-place-index.mjs')).href);
const badRequest = error => error.status === 400 && !/sqlite|exports|[A-Z]:\\/i.test(error.message);
const unavailable = error => error.status === 503 && error.message === 'Local place data is unavailable' && !error.cause;

test('compact selector has 25 districts and separate observed legal/admin code sets', () => {
  assert.equal(regions.districts.length, 25);
  assert.equal(new Set(regions.districts.map(d => d.code)).size, 25);
  assert.equal(regions.districts.reduce((n, d) => n + d.legal.length, 0), 466);
  assert.equal(regions.districts.reduce((n, d) => n + d.administrative.length, 0), 427);
  for (const d of regions.districts) {
    assert.match(d.code, /^11\d{3}$/);
    for (const [type, width] of [['legal', 10], ['administrative', 8]]) {
      assert.ok(d[type].length > 0);
      assert.equal(new Set(d[type].map(item => item.code)).size, d[type].length);
      for (const item of d[type]) {
        assert.equal(item.code.length, width);
        assert.ok(item.code.startsWith(d.code));
        assert.deepEqual(Object.keys(item).sort(), ['code', 'name']);
      }
    }
  }
  assert.deepEqual(regions.categories, consumerCategories.map(({ id, label }) => ({ id, label })));
  assert.equal(regions.source.regionBasis, 'observed_official_source_codes_not_current_master');
  assert.equal(regions.source.regionMaster.verified, false);
  assert.equal(regions.source.regionMaster.publishedCounts.legal, 467);
  assert.equal(regions.source.dataAsOf, '2026-06-30');
  assert.equal(regions.source.rows, 554092);
  assert.ok(regions.source.dongTypes.legal);
  assert.ok(regions.source.dongTypes.administrative);
  assert.match(regions.source.coverageNote, /not no facilities/);
  const copy = getLifeRegions();
  copy.districts[0].name = 'modified';
  copy.source.rows = 0;
  assert.deepEqual(getLifeRegions(), regions);
});

test('district/dong codes are validated as a pair for both dong types', () => {
  assert.equal(fixture.searchLifePlaces({ district: district.code, dong: legal.code }).total, names.length);
  assert.equal(fixture.searchLifePlaces({ district: district.code, dong: admin.code, dongType: 'administrative' }).total, names.length);
  for (const options of [
    { district: district.name }, { district: '99999' }, { dong: legal.code },
    { district: otherDistrict.code, dong: legal.code },
    { district: district.code, dong: admin.code },
    { district: district.code, dong: legal.code, dongType: 'administrative' },
    { dongType: 'invalid' }, { category: 'invalid' },
    { district: [district.code] }, { q: {} }, null, [],
  ]) assert.throws(() => fixture.searchLifePlaces(options), badRequest);
});

test('valid regions without observed matching rows return unknown coverage, not invalid region', () => {
  const empty = fixture.searchLifePlaces({ district: otherDistrict.code, dong: otherDistrict.legal[0].code });
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.results, []);
  assert.match(empty.source.coverageNote, /not no facilities/);
});

test('pagination is stable, bounded, and accepts URL numeric strings', () => {
  const first = fixture.searchLifePlaces({ pageSize: '2' });
  const second = fixture.searchLifePlaces({ page: '2', pageSize: '2' });
  assert.equal(first.total, names.length);
  assert.equal(first.page, 1);
  assert.equal(first.pageSize, 2);
  assert.equal(first.results.length, 2);
  assert.equal(second.page, 2);
  assert.equal(new Set([...first.results, ...second.results].map(row => row.id)).size, 4);
  assert.deepEqual(first, fixture.searchLifePlaces({ page: 1, pageSize: 2 }));
  assert.equal(fixture.searchLifePlaces().pageSize, 12);
  assert.equal(fixture.searchLifePlaces({ pageSize: 100 }).pageSize, 24);
  assert.equal(fixture.searchLifePlaces({ page: 100 }).page, 1);
  assert.equal(fixture.searchLifePlaces({ page: 100 }).results.length, names.length);
  for (const value of [0, -1, 1.5, NaN, Infinity, '', '1.2', '2x', ' 2', true, null, [], Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => fixture.searchLifePlaces({ page: value }), badRequest);
    assert.throws(() => fixture.searchLifePlaces({ pageSize: value }), badRequest);
  }
  assert.throws(() => fixture.searchLifePlaces({ page: Number.MAX_SAFE_INTEGER }), badRequest);
});

test('LIKE wildcards and SQL-looking queries are literal and bounded to 80 characters', () => {
  for (const q of ['%', '_', '\\', "quote' OR 1=1 --"]) {
    const result = fixture.searchLifePlaces({ q });
    assert.equal(result.total, 1, q);
    assert.ok(result.results[0].name.includes(q));
  }
  assert.equal(fixture.searchLifePlaces({ q: 'lot 0' }).results[0].address, 'lot 0');
  assert.equal(fixture.searchLifePlaces({ q: 'road 1' }).total, 1);
  assert.equal(fixture.searchLifePlaces({ q: 'z'.repeat(80) }).total, 0);
  assert.throws(() => fixture.searchLifePlaces({ q: 'z'.repeat(81) }), badRequest);
});

test('database connection is read-only and results expose only the public contract', () => {
  const original = DatabaseSync.prototype.prepare;
  const before = statSync(database);
  let checked = false;
  DatabaseSync.prototype.prepare = function (...args) {
    if (!checked) {
      checked = true;
      assert.throws(() => this.exec('CREATE TABLE forbidden_write (id TEXT)'), /readonly|read-only/i);
    }
    return original.apply(this, args);
  };
  let result;
  try { result = fixture.searchLifePlaces({ category }); }
  finally { DatabaseSync.prototype.prepare = original; }
  assert.ok(checked);
  assert.deepEqual(Object.keys(result).sort(), ['page', 'pageSize', 'results', 'source', 'total']);
  for (const row of result.results) {
    assert.deepEqual(Object.keys(row).sort(), ['address', 'categoryId', 'id', 'latitude', 'longitude', 'name']);
    assert.equal(row.categoryId, category);
  }
  assert.equal(statSync(database).mtimeMs, before.mtimeMs);
  assert.equal(statSync(database).size, before.size);
  assert.ok(!JSON.stringify(result).includes('must-not-leak'));
});

test('prepared runtime is preferred, read-only, and invalid manifest never falls back silently', () => {
  const runtime = join(data, 'exports', 'life-place-runtime');
  mkdirSync(runtime, { recursive: true });
  const filename = 'places-v2-1234567890abcdef.sqlite';
  copyFileSync(database, join(runtime, filename));
  const manifest = join(runtime, 'manifest.json');
  try {
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, database: filename }));
    assert.equal(fixture.searchLifePlaces({ pageSize: 2 }).results.length, 2);
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, database: '../../secret.sqlite' }));
    assert.throws(() => fixture.searchLifePlaces(), unavailable);
    writeFileSync(manifest, '{bad json');
    assert.throws(() => fixture.searchLifePlaces(), unavailable);
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 2, database: filename }));
    assert.throws(() => fixture.searchLifePlaces(), unavailable);
  } finally { rmSync(runtime, { recursive: true, force: true }); }
});

test('absent database/report and broken index return sanitized 503; selector still works', () => {
  const report = join(classification, 'classification-report.json');
  const original = readFileSync(report);
  try {
    writeFileSync(report, JSON.stringify({ database: 'index-missing.sqlite' }));
    assert.throws(() => fixture.searchLifePlaces(), unavailable);
    assert.ok(!existsSync(join(classification, 'index-missing.sqlite')));
    rmSync(report);
    assert.throws(() => fixture.searchLifePlaces(), unavailable);
    assert.deepEqual(fixture.getLifeRegions(), regions);
    writeFileSync(report, JSON.stringify({ database: '../../private.sqlite' }));
    assert.throws(() => fixture.searchLifePlaces(), unavailable);
    writeFileSync(report, '{broken JSON');
    assert.throws(() => fixture.searchLifePlaces(), unavailable);
    const empty = new DatabaseSync(join(classification, 'index-empty.sqlite'));
    empty.close();
    writeFileSync(report, JSON.stringify({ database: 'index-empty.sqlite' }));
    assert.throws(() => fixture.searchLifePlaces(), unavailable);
  } finally { writeFileSync(report, original); }
});

const localRoot = new URL('../data/exports/seoul-life-2026-10-14/classification/', import.meta.url);
let localDatabase;
try {
  const report = JSON.parse(readFileSync(new URL('classification-report.json', localRoot), 'utf8'));
  localDatabase = new URL(report.database, localRoot);
  statSync(localDatabase);
} catch { /* Public-only checkout has no private SQLite export. */ }

test('integration: existing full index, district sum, legal/admin filtering and minimal results', { skip: !localDatabase }, () => {
  const before = statSync(localDatabase);
  assert.equal(searchLifePlaces({ pageSize: 1 }).total, 554092);
  const db = new DatabaseSync(fileURLToPath(localDatabase), { readOnly: true });
  let counts;
  try {
    counts = db.prepare('SELECT district, COUNT(*) AS count FROM places GROUP BY district ORDER BY district').all();
    const expected = db.prepare(`SELECT id,name,COALESCE(NULLIF(road_address,''),lot_address) AS address,
      category_id AS categoryId,latitude,longitude FROM places WHERE district=? ORDER BY name,id LIMIT 2`);
    for (const area of regions.districts) {
      const actual = searchLifePlaces({ district: area.code, pageSize: 2 });
      assert.equal(actual.total, counts.find(row => row.district === area.name).count, area.name);
      assert.deepEqual(actual.results, expected.all(area.name).map(row => ({ ...row })), area.name + ': original row order and values');
    }
  }
  finally { db.close(); }
  assert.deepEqual(counts.map(row => row.district), regions.districts.map(d => d.name));
  assert.equal(counts.reduce((sum, row) => sum + row.count, 0), 554092);
  const districtResult = searchLifePlaces({ district: district.code, pageSize: 1 });
  assert.equal(districtResult.total, counts[0].count);
  assert.equal(Object.keys(districtResult.results[0]).length, 6);
  for (const dongType of ['legal', 'administrative']) {
    const result = searchLifePlaces({ district: district.code, dong: district[dongType][0].code, dongType, pageSize: 2 });
    assert.ok(result.total > 0);
    const next = searchLifePlaces({ district: district.code, dong: district[dongType][0].code, dongType, pageSize: 2, page: 2 });
    assert.equal(next.total, result.total);
    assert.equal(new Set([...result.results, ...next.results].map(row => row.id)).size, result.results.length + next.results.length);
  }
  assert.equal(statSync(localDatabase).mtimeMs, before.mtimeMs);
  assert.equal(statSync(localDatabase).size, before.size);
});
