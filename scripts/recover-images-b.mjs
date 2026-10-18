import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'data/exports/catalog-planning-2026-10-07/image-recovery-b.json');
const catalog = JSON.parse((await readFile(resolve(root, 'product-catalog.js'), 'utf8')).replace(/^window.ProductCatalog = /, '').replace(/;\s*$/, ''));
const items = catalog.items.filter(item => Number(item.id.slice(1)) >= 111 && Number(item.id.slice(1)) <= 213);
const products = items.flatMap(item => item.products);
const cache = JSON.parse(await readFile(resolve(root, 'data/exports/catalog-planning-2026-10-07/public-catalog-media-cache.json'), 'utf8'));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function inspect(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
    const info = { requestedUrl: url, finalUrl: response.url, status: response.status, contentType: response.headers.get('content-type') };
    if (!response.ok || !info.contentType?.includes('text/html')) return info;
    const html = await response.text();
    return { ...info, ...await page.evaluate(html => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const meta = key => doc.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.content || '';
      const jsonld = [...doc.querySelectorAll('script[type="application/ld+json"]')].flatMap(node => {
        try { return [JSON.parse(node.textContent)]; } catch { return []; }
      });
      const body = doc.body?.textContent.replace(/\s+/g, ' ') || '';
      return {
        title: doc.title, ogTitle: meta('og:title'), ogImage: meta('og:image'),
        canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href'),
        jsonld: jsonld.map(value => JSON.stringify(value, (key, value) => ['review', 'aggregateRating', 'shippingDetails', 'hasMerchantReturnPolicy'].includes(key) ? undefined : value)).map(value => JSON.parse(value)),
        images: [...doc.querySelectorAll('img')].map(img => ({ src: img.getAttribute('src'), dataSrc: img.getAttribute('data-src'), alt: img.alt })).filter(img => !/logo|icon|banner|sns|loading|btn_|blank|tracking/i.test(img.src || '')).slice(0, 35),
        headings: [...doc.querySelectorAll('h1,h2,h3')].map(node => node.textContent.trim()).slice(0, 15),
        challenge: /<title>[^<]*(?:captcha|access denied|just a moment)/i.test(html) || /verify you are human|로봇이 아닙니다/i.test(body.slice(0, 4000)),
      };
    }, html) };
  } catch (error) { return { requestedUrl: url, error: `${error.name}: ${error.message}`, cause: error.cause?.message }; }
}

try {
  if (process.argv[2] === '--inspect') {
    const target = products.find(product => product.id === process.argv[3]);
    console.log(JSON.stringify(await inspect(target?.url || process.argv[3]), null, 2));
  } else {
    const missing = products.filter(product => !product.imageUrl);
    const result = { _meta: { range: 'P111-P213', checkedAt: new Date().toISOString(), rowCount: items.length, productCount: products.length, missingAtStart: missing.length, existingImageProductIds: products.filter(product => product.imageUrl).map(product => product.id), guidanceRowIds: items.filter(item => item.kind === 'guidance').map(item => item.id), notes: 'Private recovery only. Public catalog, builder and media cache are read-only.' } };
    for (const product of missing) {
      const inspection = await inspect(product.url);
      result[product.id] = { imageUrl: null, sourceUrl: product.url, productName: product.name, matchEvidence: { originalCacheStatus: cache[product.url]?.status, inspection }, checkedAt: new Date().toISOString(), status: 'unresolved', reason: 'Inspection captured; exact identity and image verification pending.' };
      await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
      console.log(JSON.stringify({ id: product.id, title: inspection.title, status: inspection.status, image: inspection.ogImage, jsonld: inspection.jsonld?.length, error: inspection.error }));
    }
  }
} finally { await browser.close(); }
