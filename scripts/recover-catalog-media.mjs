import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const dir = resolve(root, 'data/exports/catalog-planning-2026-10-07');
const output = resolve(dir, 'image-recovery-complete.json');
const context = { window: {} };
runInNewContext(await readFile(resolve(root, 'product-catalog.js'), 'utf8'), context);
const products = context.window.ProductCatalog.items.flatMap(item => item.products).filter(product => !product.imageUrl || process.argv.includes('--reviewed'));
let results = {};
try { results = JSON.parse(await readFile(output, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const reviewed = JSON.parse(await readFile(resolve(dir, 'reviewed-image-sources.json'), 'utf8'));
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const page = await browser.newPage();
const normalized = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const metadata = html => page.evaluate(html => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const meta = name => doc.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.content || '';
  const jsonProducts = [];
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if ([value['@type']].flat().includes('Product')) jsonProducts.push(value);
    for (const child of Object.values(value)) if (typeof child === 'object') {
      if (Array.isArray(child)) child.forEach(visit); else visit(child);
    }
  }
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try { visit(JSON.parse(script.textContent)); } catch {}
  }
  return {
    title: meta('og:title') || doc.title,
    ogImage: meta('og:image'),
    products: jsonProducts.map(product => ({ name: product.name, image: product.image, sku: product.sku, mpn: product.mpn })),
    headings: [...doc.querySelectorAll('h1')].map(node => node.textContent.trim()),
    images: [...doc.querySelectorAll('img')].map(img => ({ src: img.getAttribute('data-src') || img.getAttribute('src'), alt: img.alt })).filter(img => img.src && !/^data:|logo|banner|icon|sprite|loading|favicon|blank|tracking|placeholder|spacer/i.test(img.src)).slice(0, 160),
    sources: [...doc.querySelectorAll('source')].map(node => ({ srcset: node.getAttribute('data-srcset') || node.getAttribute('srcset'), media: node.getAttribute('media') })).filter(node => node.srcset).slice(0, 60),
    bodyText: doc.body?.textContent.replace(/\s+/g, ' ').slice(0, 60000) || '',
    challenge: /<title[^>]*>[^<]*(?:access denied|just a moment|captcha)/i.test(html) || /cf-chl-|verify you are human|로봇이 아닙니다/.test(html.slice(0, 12000))
  };
}, html);
function matches(name, title) {
  const a = normalized(name), b = normalized(title);
  if (a.length >= 4 && (b.includes(a) || (b.length >= 4 && a.includes(b)))) return true;
  const tokens = String(name).split(/[\s\[\]()/+,·_-]+/).map(normalized).filter(token => token.length >= 3 && !/^\d+(ml|g|kg|l|cm|개|팩)?$/.test(token));
  const model = String(name).match(/\b[A-Z]{2,}[0-9][A-Z0-9/.-]*/i)?.[0];
  if (model && b.includes(normalized(model))) return true;
  return tokens.filter(token => b.includes(token)).length >= 2;
}
const imageValues = value => typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(imageValues) : value?.url || value?.contentUrl ? [value.url || value.contentUrl] : [];
async function inspect(product) {
  const result = { productName: product.name, sourceUrl: product.url, checkedAt: new Date().toISOString(), status: 'unresolved', imageUrl: null };
  try {
    const response = await fetch(product.url, { signal: AbortSignal.timeout(18000), redirect: 'follow' });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
      result.reason = `source_http_${response.status}`; await response.body?.cancel(); return result;
    }
    const info = await metadata(await response.text());
    result.inspection = info;
    if (info.challenge) { result.reason = 'access_challenge'; return result; }
    const candidates = [];
    const matchingProduct = info.products.find(item => matches(product.name, [item.name, item.sku, item.mpn].join(' ')) || [item.sku, item.mpn].filter(Boolean).some(code => normalized(product.url).includes(normalized(code))));
    if (matchingProduct) candidates.push(...imageValues(matchingProduct.image));
    const identity = [info.title, ...info.headings].find(title => matches(product.name, title)) || matchingProduct?.name || (normalized(info.bodyText).includes(normalized(product.name)) ? product.name : '');
    if (identity) {
      if (info.ogImage) candidates.push(info.ogImage);
      candidates.push(...info.images.filter(image => matches(product.name, image.alt) || /상품.?대표|product.?photo|\/upload\/item\/|\/image\/WC\//i.test(image.alt + image.src)).map(image => image.src));
    }
    candidates.push(...info.images.filter(image => matches(product.name, image.alt)).map(image => image.src));
    result.matchEvidence = identity || info.products.find(item => matches(product.name, item.name))?.name || '';
    for (const candidate of [...new Set(candidates)]) {
      let url;
      try { url = new URL(candidate, response.url); } catch { continue; }
      if (!['https:', 'http:'].includes(url.protocol) || /logo|banner|favicon|sprite|share-image/i.test(url.pathname)) continue;
      url.protocol = 'https:';
      const imageResponse = await fetch(url, { signal: AbortSignal.timeout(12000) });
      const type = imageResponse.headers.get('content-type') || '';
      const ok = imageResponse.ok && type.startsWith('image/');
      await imageResponse.body?.cancel();
      if (ok) { result.imageUrl = url.href; result.imageScope = /택1|옵션|\d+종/.test(product.name) ? 'options' : 'product'; result.status = 'resolved'; result.imageVerification = { status: imageResponse.status, contentType: type }; return result; }
    }
    result.reason = identity ? 'no_verified_product_image' : 'product_identity_not_matched';
  } catch (error) { result.reason = error.name; }
  return result;
}
async function resolveReviewed(product, entry) {
  let result;
  if (entry.imageUrl) {
    if (entry.imageUrl.startsWith('/assets/')) {
      await readFile(resolve(root, entry.imageUrl.slice(1)));
      result = { imageUrl: entry.imageUrl, status: 'resolved', imageVerification: { status: 200, contentType: 'image/jpeg', local: true } };
    } else {
      const response = await fetch(entry.imageUrl, { signal: AbortSignal.timeout(12000) });
      const contentType = response.headers.get('content-type') || '';
      const reader = response.body?.getReader();
      const sample = reader ? (await reader.read()).value : null;
      const signature = sample ? Buffer.from(sample).subarray(0, 12) : Buffer.alloc(0);
      const recognizedImage = signature[0] === 0xff && signature[1] === 0xd8 || signature.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || signature.toString('ascii').startsWith('GIF8') || signature.toString('ascii').startsWith('RIFF');
      const ok = response.ok && (contentType.startsWith('image/') || recognizedImage);
      await reader?.cancel();
      result = { imageUrl: ok ? entry.imageUrl : null, status: ok ? 'resolved' : 'unresolved', imageVerification: { status: response.status, contentType, signatureVerified: recognizedImage } };
    }
  } else {
    result = await inspect({ ...product, name: entry.matchName || product.name, url: entry.sourceUrl });
  }
  return { ...result, productName: product.name, ...entry, imageUrl: result.imageUrl, checkedAt: new Date().toISOString() };
}
let cursor = 0;
try {
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < products.length) {
      const product = products[cursor++];
      if (results[product.id]?.status === 'resolved' && (!reviewed[product.id] || Object.entries(reviewed[product.id]).every(([key, value]) => JSON.stringify(value) === JSON.stringify(results[product.id][key])))) continue;
      if (process.argv.includes('--reviewed') && !reviewed[product.id]) continue;
      results[product.id] = reviewed[product.id] ? await resolveReviewed(product, reviewed[product.id]) : await inspect(product);
      console.log(product.id, results[product.id].status, results[product.id].reason || '');
    }
  }));
} finally {
  await writeFile(output, `${JSON.stringify(results, null, 2)}\n`);
  await browser.close();
}
console.log(JSON.stringify({ total: products.length, resolved: Object.values(results).filter(item => item.status === 'resolved').length, unresolved: Object.entries(results).filter(([,item]) => item.status !== 'resolved').map(([id,item]) => ({ id, name: item.productName, url: item.sourceUrl, reason: item.reason })) }));
