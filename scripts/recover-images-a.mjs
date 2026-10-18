import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dir = resolve(root, 'data/exports/catalog-planning-2026-10-07');
const output = resolve(dir, 'image-recovery-a.json');
const catalog = JSON.parse((await readFile(resolve(root, 'product-catalog.js'), 'utf8')).replace(/^window.ProductCatalog = /, '').replace(/;\s*$/, ''));
const cache = JSON.parse(await readFile(resolve(dir, 'public-catalog-media-cache.json'), 'utf8'));
let results = {};
try { results = JSON.parse(await readFile(output, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const products = catalog.items.filter(item => Number(item.id.slice(1)) <= 110).flatMap(item => item.products).filter(product => !product.imageUrl);
const decode = value => String(value || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/gi, "'").replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number))).replace(/&nbsp;/g, ' ');
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(match => [match[1].toLowerCase(), decode(match[3])]));
const plain = html => decode(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
const absolute = (value, base) => { try { return new URL(value, base).href; } catch { return ''; } };

async function inspect(url) {
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(25000), redirect: 'follow' });
    const status = response.status;
    if (status !== 200) { await response.body?.cancel(); return { checkedAt, url: response.url, status, reason: `Public page HTTP ${status}; no access-control bypass attempted.` }; }
    const html = await response.text();
    if (/<title[^>]*>[^<]*(?:Access Denied|Just a moment|Attention Required)/i.test(html) || /cf-chl-|g-recaptcha|verify you are human/i.test(html.slice(0, 20000))) return { checkedAt, url: response.url, status, reason: 'Access challenge; stopped without bypass.' };
    const metas = Object.fromEntries((html.match(/<meta\b[^>]*>/gi) || []).map(tag => { const a = attrs(tag); return [a.property || a.name, a.content]; }));
    const jsonLd = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(match => { try { return [JSON.parse(match[1])]; } catch { return []; } });
    const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(match => ({ ...attrs(match[0]), context: plain(html.slice(Math.max(0, match.index - 180), match.index + match[0].length + 180)) })).filter(image => !/logo|icon|banner|btn_|arrow|sns|favicon|loading|spinner/i.test(image.src || '')).slice(0, 65);
    return { checkedAt, url: response.url, status, title: metas['og:title'] || plain(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''), ogImage: absolute(metas['og:image'] || '', response.url), metas, jsonLd, images,
      headings: [...html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map(match => plain(match[1])).filter(Boolean).slice(0, 25),
      bodyText: plain(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')).slice(0, 18000) };
  } catch (error) { return { checkedAt, url, reason: `${error.name}: ${error.message}` }; }
}

if (process.argv.includes('--collect')) {
  for (const product of products) {
    if (results[product.id]?.inspection) continue;
    const inspection = await inspect(product.url);
    results[product.id] = { imageUrl: null, sourceUrl: product.url, productName: product.name, matchEvidence: '', checkedAt: inspection.checkedAt, status: 'unresolved', reason: inspection.reason || 'Pending exact product/image review.', previousCache: cache[product.url], inspection };
    await writeFile(output, `${JSON.stringify(results, null, 2)}\n`);
    console.log(product.id, inspection.status || inspection.reason, inspection.title || '', inspection.ogImage || '');
  }
}

if (process.argv.includes('--page')) {
  const id = process.argv[process.argv.indexOf('--page') + 1];
  const url = process.argv[process.argv.indexOf('--page') + 2];
  results[id].additionalInspections ||= [];
  const inspection = await inspect(url);
  results[id].additionalInspections.push(inspection);
  await writeFile(output, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(inspection, null, 2));
}

if (process.argv.includes('--verify')) {
  for (const [id, entry] of Object.entries(results)) {
    if (!entry.imageUrl) continue;
    try {
      if (!entry.imageUrl.startsWith('https://')) throw new Error('HTTPS required');
      const response = await fetch(entry.imageUrl, { signal: AbortSignal.timeout(25000) });
      const contentType = response.headers.get('content-type') || '';
      const bytes = response.status === 200 && contentType.startsWith('image/') ? (await response.arrayBuffer()).byteLength : 0;
      if (!bytes) await response.body?.cancel();
      entry.imageVerification = { status: response.status, contentType, bytes, finalUrl: response.url, checkedAt: new Date().toISOString() };
      entry.status = response.status === 200 && bytes > 0 && contentType.startsWith('image/') ? 'resolved' : 'unresolved';
      if (entry.status === 'unresolved') { entry.candidateImageUrl = entry.imageUrl; entry.imageUrl = null; entry.reason = 'Exact source image found but image endpoint could not be verified.'; }
      else delete entry.reason;
    } catch (error) { entry.status = 'unresolved'; entry.reason = `Image verification failed: ${error.message}`; entry.candidateImageUrl = entry.imageUrl; entry.imageUrl = null; }
    entry.checkedAt = new Date().toISOString();
    await writeFile(output, `${JSON.stringify(results, null, 2)}\n`);
    console.log(id, entry.status, entry.imageVerification?.status, entry.imageVerification?.contentType);
  }
}

console.log(JSON.stringify({ assignedProducts: products.length, entries: Object.keys(results).length, resolved: Object.values(results).filter(entry => entry.status === 'resolved').length }));
