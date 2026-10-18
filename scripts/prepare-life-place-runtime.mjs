import { DatabaseSync } from 'node:sqlite';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(root, 'data/exports/seoul-life-2026-10-14/classification');
const output = path.join(root, 'data/exports/life-place-runtime');
const report = JSON.parse(readFileSync(path.join(sourceRoot, 'classification-report.json'), 'utf8'));
if (!/^index-[\w.-]+\.sqlite$/.test(report.database || '')) throw Error('Invalid source database');
const sourcePath = path.join(sourceRoot, report.database);
const hash = createHash('sha256');
for await (const chunk of createReadStream(sourcePath)) hash.update(chunk);
const sourceSha256 = hash.digest('hex');
const version = '2';
const name = `places-v${version}-${sourceSha256.slice(0, 16)}.sqlite`;
mkdirSync(output, { recursive: true });
const target = path.join(output, name), temporary = target + '.building-' + process.pid;
const manifestPath = path.join(output, 'manifest.json');
if (existsSync(target) && existsSync(manifestPath)) {
  const cached = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (cached.sourceSha256 === sourceSha256 && cached.database === name && cached.bytes === statSync(target).size) {
    console.log(JSON.stringify({ ...cached, reused: true })); process.exit(0);
  }
  throw Error('Existing runtime requires inspection; refusing to overwrite');
}
const source = new DatabaseSync(sourcePath, { readOnly: true });
const dest = new DatabaseSync(temporary);
const columns = ['id', 'name', 'district', 'legal_name', 'admin_name', 'category_id', 'road_address', 'lot_address', 'latitude', 'longitude'];
try {
  dest.exec(`PRAGMA journal_mode=DELETE; CREATE TABLE places (
    id TEXT PRIMARY KEY, name TEXT, district TEXT, legal_name TEXT, admin_name TEXT,
    category_id TEXT, road_address TEXT, lot_address TEXT, latitude REAL, longitude REAL
  ); BEGIN;`);
  const insert = dest.prepare('INSERT INTO places VALUES (?,?,?,?,?,?,?,?,?,?)');
  const select = `SELECT id,name,district,legal_name,admin_name,category_id,
    COALESCE(NULLIF(road_address,''),lot_address) AS road_address,NULL AS lot_address,latitude,longitude FROM places ORDER BY id`;
  let rows = 0;
  const sourceValues = createHash('sha256');
  for (const row of source.prepare(select).iterate()) {
    const values = columns.map(key => row[key]);
    insert.run(...values); sourceValues.update(JSON.stringify(values) + '\n'); rows++;
  }
  dest.exec(`COMMIT;
    CREATE INDEX place_district ON places(district);
    CREATE INDEX place_legal ON places(district,legal_name);
    CREATE INDEX place_admin ON places(district,admin_name);
    CREATE INDEX place_category ON places(category_id);
    CREATE INDEX place_name ON places(name,id);
    ANALYZE;`);
  const copiedValues = createHash('sha256');
  for (const row of dest.prepare('SELECT * FROM places ORDER BY id').iterate()) copiedValues.update(JSON.stringify(columns.map(key => row[key])) + '\n');
  const fieldDigest = sourceValues.digest('hex');
  if (fieldDigest !== copiedValues.digest('hex')) throw Error('Copied public fields differ from source');
  if (dest.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Invalid runtime database');
  const count = dest.prepare('SELECT COUNT(*) AS total FROM places').get().total;
  if (count !== rows || rows !== source.prepare('SELECT COUNT(*) AS total FROM places').get().total) throw Error('Row count mismatch');
  const districts = dest.prepare('SELECT district,COUNT(*) AS rows FROM places GROUP BY district ORDER BY district').all().map(row => ({ ...row }));
  const manifest = { schemaVersion: 1, database: name, sourceSha256, sourceBytes: statSync(sourcePath).size,
    rows, columns, districts, fieldDigest, createdAt: new Date().toISOString(),
    scope: 'Local deployment preparation only; not uploaded, licensed for republication, deduplicated or current-operation verified' };
  dest.close(); source.close();
  renameSync(temporary, target);
  manifest.bytes = statSync(target).size;
  manifest.reductionPercent = Number((100 * (1 - manifest.bytes / manifest.sourceBytes)).toFixed(1));
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ ...manifest, districts: districts.length }));
} catch (error) {
  try { dest.close(); } catch { /* Already closed after verification. */ }
  try { source.close(); } catch { /* Already closed after verification. */ }
  if (existsSync(temporary)) unlinkSync(temporary);
  throw error;
}
