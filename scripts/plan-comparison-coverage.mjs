import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const context = { window: {} };
runInNewContext(await readFile(resolve(root, 'product-catalog.js'), 'utf8'), context);
const catalog = JSON.parse(JSON.stringify(context.window.ProductCatalog));
const target = 6;
assert.equal(new Set(catalog.items.map(item => item.id)).size, catalog.items.length);

const rows = catalog.items.map(item => ({
  itemId: item.id,
  title: item.title,
  category: item.category,
  subgroup: item.subgroup,
  kind: item.kind,
  currentProductIds: item.products.map(product => product.id),
  currentCandidateCount: item.products.length,
  targetCandidateCount: item.kind === 'product' ? target : null,
  provisionalMissingSlots: item.kind === 'product' ? Math.max(0, target - item.products.length) : null,
  comparableCandidateCount: null,
  comparisonStatus: item.kind === 'product' ? 'needs_group_and_eligibility_review' : 'official_guidance_only',
  existingCriteria: item.criteria,
  existingVariants: item.variants,
}));
const products = rows.filter(row => row.kind === 'product');
const summary = {
  totalItems: rows.length,
  productItems: products.length,
  guidanceItems: rows.length - products.length,
  currentCandidates: products.reduce((sum, row) => sum + row.currentCandidateCount, 0),
  targetSlotsBeforeGroupReview: products.length * target,
  provisionalMissingSlots: products.reduce((sum, row) => sum + row.provisionalMissingSlots, 0),
  verifiedComparableGroups: null,
};
const output = resolve(root, 'data/exports/comparison-planning-2026-10-11');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'coverage-plan.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourceVersion: catalog.version,
  targetInterpretation: 'one_reference_plus_five_alternatives_per_comparison_group',
  summary,
  rows,
}, null, 2) + '\n', 'utf8');
const headers = ['itemId', 'title', 'category', 'subgroup', 'kind', 'currentCandidateCount', 'targetCandidateCount', 'provisionalMissingSlots', 'comparisonStatus'];
const cell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
await writeFile(resolve(output, 'coverage-plan.csv'), '\uFEFF' + [headers.map(cell).join(','), ...rows.map(row => headers.map(key => cell(row[key])).join(','))].join('\r\n') + '\r\n', 'utf8');
console.log(JSON.stringify(summary));
