import fs from 'node:fs';
import vm from 'node:vm';
import D from '../comparison-display.js';

const context = { window: {} };
vm.runInNewContext(fs.readFileSync('product-catalog.js', 'utf8'), context);
const catalog = context.window.ProductCatalog;
const focus = new Set(['P051', 'P080', 'P102']);
const products = [], groups = [];
for (const item of catalog.items.filter(i => i.kind === 'product')) {
  const chunk = JSON.parse(fs.readFileSync('assets/comparison/' + item.id + '.json'));
  const group = chunk.groups[0];
  const seen = new Set();
  const candidates = focus.has(item.id) ? group.products.filter(p => p.eligibilityStatus === 'verified') : group.products.filter(p => p.eligibilityStatus === 'verified').slice(0, 1);
  for (const p of candidates) {
    const key = p.modelKey?.trim() || p.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const original = item.products.find(x => x.id === p.id);
    const facts = D.details(item, group, p, { limit: 12 });
    products.push({ id: p.id, item: item.id, itemTitle: item.title, category: item.category,
      name: original?.name || p.name, image: p.imageUrl || original?.imageUrl || '', source: p.sourceLabel,
      sourceUrl: p.url, purchase: D.coupangLink(p, item), facts });
  }
  groups.push({ id: item.id, title: item.title, category: item.category, focused: focus.has(item.id) });
}
products.sort((a, b) => {
  const priority = ['P051', 'P080', 'P102'];
  const score = x => priority.includes(x.item) ? priority.indexOf(x.item) : 10;
  return score(a) - score(b);
});
const services = JSON.parse(fs.readFileSync('data/life-services.json'));
const regions = JSON.parse(fs.readFileSync('data/life-regions.json'));
const apps = services.services.filter(s => !s.reviewRequired).map(s => ({ id: s.id, name: s.name, description: s.description,
  categories: s.categoryIds, web: s.web?.url || null, webLabel: s.id === 'bbegi' ? '강북구 배출 안내' : s.type === 'official' ? '공식 안내' : '서비스 소개',
  ios: s.iosUrl, android: s.androidUrl, condition: s.conditions?.[0] || null }));
const data = { prototype: true, generatedFrom: 'Existing public project files; not new price/review collection',
  products, groups, categories: catalog.categories,
  apps, appCategories: services.categories.map(c => ({ id: c.id, label: c.label })),
  districts: regions.districts.map(d => ({ name: d.name, code: d.code, dongs: d.legal })),
  industries: regions.categories.filter(c => c.id !== 'review'),
  limits: ['Focused model sets for P051/P080/P102; other items have a representative only', 'Neighborhood entries are explicit schematic placeholders, never real business facts', 'No prices, ratings or reviews invented', 'Source URLs retain their existing verification limits'] };
fs.mkdirSync('docs/wireframe-v1', { recursive: true });
fs.writeFileSync('docs/wireframe-v1/data.js', 'window.WireframeData = ' + JSON.stringify(data).replaceAll('<', '\\u003c') + ';\n');
console.log(JSON.stringify({ products: products.length, items: groups.length, apps: apps.length, districts: data.districts.length, file: 'docs/wireframe-v1/data.js' }));
