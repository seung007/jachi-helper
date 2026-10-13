import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const index = JSON.parse(await readFile(resolve(root, 'data/exports/catalog-planning-2026-10-07/collection-index.json'), 'utf8'));
const source = await readFile(resolve(root, 'product-catalog.js'), 'utf8');
const context = { window: {} };
runInNewContext(source, context);
const catalog = JSON.parse(JSON.stringify(context.window.ProductCatalog));

test('public catalog retains all 213 rows and only usable candidates', () => {
  assert.equal(catalog.version, '20261010-1');
  assert.equal(catalog.items.length, 213);
  assert.equal(new Set(catalog.items.map(item => item.id)).size, 213);
  assert.deepEqual(catalog.items.map(item => item.id), index.rows.map(row => row.rowId));
  assert.equal(catalog.items.flatMap(item => item.products).length, index.records.filter(record => record.usableCandidate).length);
  assert.equal(catalog.items.flatMap(item => item.guidance).length, 3);
  for (const item of catalog.items) {
    assert.ok(['product', 'guidance'].includes(item.kind));
    for (const product of item.products) {
      assert.ok(/^https?:\/\//.test(product.url));
      assert.ok(product.imageUrl && (/^https:\/\//.test(product.imageUrl) || /^\/assets\/offers\/[\w.-]+$/.test(product.imageUrl)));
      assert.ok(product.facts.length <= 6);
      assert.ok(product.facts.every(fact => fact.label && fact.value && !/미확인|확인 필요|가격|재고|할인|효능/i.test(fact.value)));
    }
  }
});

test('public export excludes internal provenance and review fields', () => {
  for (const key of ['sourceHash', 'inputFile', 'unknowns', 'publishReady', 'reviewDecision', 'evidenceGrade', 'verificationScope', 'fieldSources']) {
    assert.ok(!source.includes(`"${key}"`), key);
  }
  assert.ok(!source.includes('collection-index.json'));
  assert.ok(!source.includes('collected-food-'));
});
