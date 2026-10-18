import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const regions = JSON.parse(readFileSync(new URL('../data/life-regions.json', import.meta.url), 'utf8'));
const classificationRoot = new URL('../data/exports/seoul-life-2026-10-14/classification/', import.meta.url);
const runtimeRoot = new URL('../data/exports/life-place-runtime/', import.meta.url);

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

export function getLifeRegions() {
  return structuredClone(regions);
}

function optionalString(value, label) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw fail(400, `${label} must be a string`);
  return value;
}

function positiveInteger(value, label) {
  if ((typeof value !== 'number' && typeof value !== 'string') ||
      (typeof value === 'string' && !/^\d+$/.test(value))) {
    throw fail(400, `${label} must be a positive integer`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw fail(400, `${label} must be a positive integer`);
  return number;
}

function openDatabase() {
  try {
    const runtimeManifest = new URL('manifest.json', runtimeRoot);
    if (existsSync(runtimeManifest)) {
      const manifest = JSON.parse(readFileSync(runtimeManifest, 'utf8'));
      if (manifest.schemaVersion !== 1 || !/^places-v[1-9]\d*-[a-f0-9]{16}\.sqlite$/.test(manifest.database || '')) throw Error('Invalid runtime manifest');
      return new DatabaseSync(fileURLToPath(new URL(manifest.database, runtimeRoot)), { readOnly: true });
    }
    const report = JSON.parse(readFileSync(new URL('classification-report.json', classificationRoot), 'utf8'));
    if (typeof report.database !== 'string' || !/^index-[\w.-]+\.sqlite$/.test(report.database)) {
      throw new Error('Invalid database reference');
    }
    return new DatabaseSync(fileURLToPath(new URL(report.database, classificationRoot)), { readOnly: true });
  } catch {
    throw fail(503, 'Local place data is unavailable');
  }
}

export function searchLifePlaces(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw fail(400, 'Invalid search options');
  const district = optionalString(options.district, 'district');
  const dong = optionalString(options.dong, 'dong');
  const dongType = options.dongType === undefined ? 'legal' : options.dongType;
  const category = optionalString(options.category, 'category');
  const q = optionalString(options.q, 'q');
  if (!['legal', 'administrative'].includes(dongType)) throw fail(400, 'Unknown dong type');
  if (Array.from(q).length > 80) throw fail(400, 'Query must be at most 80 characters');
  if (dong && !district) throw fail(400, 'Choose a district before dong');
  const area = district ? regions.districts.find(value => value.code === district) : null;
  if (district && !area) throw fail(400, 'Unknown district code');
  const neighborhood = dong && area ? area[dongType].find(value => value.code === dong) : null;
  if (dong && !neighborhood) throw fail(400, 'Dong does not belong to this district and dong type');
  if (category && !regions.categories.some(value => value.id === category)) throw fail(400, 'Unknown category');
  let page = positiveInteger(options.page === undefined ? 1 : options.page, 'page');
  const pageSize = Math.min(24, positiveInteger(options.pageSize === undefined ? 12 : options.pageSize, 'pageSize'));
  let offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) throw fail(400, 'Page is too large');

  const where = [], bindings = [];
  if (area) {
    // Codes were validated above; resolved source names reuse the existing SQLite indexes.
    where.push('district = ?');
    bindings.push(area.name);
  }
  if (neighborhood) {
    const prefix = dongType === 'legal' ? 'legal' : 'admin';
    where.push(`${prefix}_name = ?`);
    bindings.push(neighborhood.name);
  }
  if (category) {
    where.push('category_id = ?');
    bindings.push(category);
  }
  if (q) {
    const literal = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    where.push("(name LIKE ? ESCAPE '\\' OR COALESCE(NULLIF(road_address, ''), lot_address) LIKE ? ESCAPE '\\')");
    bindings.push(literal, literal);
  }
  const filter = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const db = openDatabase();
  try {
    const total = db.prepare(`SELECT COUNT(*) AS count FROM places${filter}`).get(...bindings).count;
    page = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
    offset = (page - 1) * pageSize;
    const results = db.prepare(`SELECT id, name,
      COALESCE(NULLIF(road_address, ''), lot_address) AS address,
      category_id AS categoryId, latitude, longitude
      FROM places${filter} ORDER BY name, id LIMIT ? OFFSET ?`).all(...bindings, pageSize, offset)
      .map(row => ({ ...row }));
    return { total, page, pageSize, results, source: structuredClone(regions.source) };
  } catch {
    throw fail(503, 'Local place data is unavailable');
  } finally {
    db.close();
  }
}
