import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { publicDocumentHandler, publicPermissionChecker } from './research-navigation-policy.mjs';

const root = process.cwd();
const out = path.join(root, 'data/exports/ui-review-2026-10-19/followup-validation');
fs.mkdirSync(out, { recursive: true });
const checkedAt = new Date().toISOString();
const task = process.argv[2] || 'all';
if (!['all', 'local', 'product'].includes(task)) throw Error('Use all, local or product as the task');
const { check: permission, cache: permissions } = publicPermissionChecker({ root });
const navigation = [];
const redirectHints = new Map();
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
context.setDefaultTimeout(10000);
context.setDefaultNavigationTimeout(20000);
await context.route('**/*', publicDocumentHandler({ permission, navigation, redirectHints }));
async function open(page, url) {
  let response;
  const seen = new Set();
  for (let hop = 0; hop <= 5; hop++) {
    if (seen.has(url)) throw Error('redirect-loop');
    seen.add(url); redirectHints.delete(url);
    try { response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }); break; }
    catch (error) {
      const target = redirectHints.get(url);
      if (!target || hop === 5) throw error;
      url = target;
    }
  }
  if (response && response.status() >= 400) throw Error('HTTP ' + response.status());
  await page.waitForTimeout(800);
  const title = await page.title();
  if (/access denied|just a moment|verify you are human|checking your browser/i.test(title)) throw Error('access-challenge-no-bypass');
  return { url: page.url(), status: response?.status(), title };
}
async function save(page, name) {
  console.log(JSON.stringify({ checkpoint: name, url: page.url() }));
  await page.screenshot({ path: path.join(out, name + '.png'), timeout: 10000 });
  fs.writeFileSync(path.join(out, name + '.html'), await page.content());
}
const report = { checkedAt, task, policyVersion: 'document-fetch-no-implicit-redirect-v3', scope: 'Public GET navigation observations, not human usability or commercial success', geometryVersion: 'viewport-intersection-v2', cases: [], navigation };
try {
  if (task !== 'product') {
  const place = { task: 'local-search-detail-map-return', steps: [] };
  const page = await context.newPage();
  try {
    place.steps.push(await open(page, 'https://localkorea.net/'));
    const form = page.locator('form').filter({ has: page.locator('select[name="in"]') });
    if (await form.count() !== 1 || ((await form.getAttribute('method')) || 'GET').toUpperCase() !== 'GET') throw Error('expected-public-GET-search-not-found');
    await form.locator('input[name="q"]').fill('laundry');
    await form.locator('select[name="in"]').selectOption('seoul');
    await form.locator('button').last().click();
    await page.waitForURL(url => url.pathname === '/search' && url.searchParams.get('q') === 'laundry', { timeout: 35000 });
    await save(page, 'local-results-390');
    place.steps.push({ step: 'query-and-location', url: page.url(), regionEchoed: new URL(page.url()).searchParams.get('in') === 'seoul' });
    place.resultLinks = await page.locator('a[href]').evaluateAll(nodes => nodes.map(n => ({ text: n.textContent.trim().replace(/\s+/g, ' ').slice(0, 100), href: n.href })).filter(x => /details.*map|지도|상세/i.test(x.text)));
    const detail = place.resultLinks[0];
    if (!detail) throw Error('no-observed-detail-link-do-not-infer-no-results');
    place.steps.push({ step: 'follow-observed-detail-href', ...await open(page, detail.href) });
    await save(page, 'local-detail-390');
    place.heading = await page.locator('h1').first().innerText();
    place.mapLinks = await page.locator('a[href]').evaluateAll(nodes => nodes.map(n => ({ text: n.textContent.trim().slice(0, 100), href: n.href })).filter(x => /(?:maps\.google|google\.[^/]+\/maps|maps\.app\.goo|map\.kakao|map\.naver)/i.test(x.href) || /open in google maps|지도에서|길찾기/i.test(x.text)));
    const reviewHref = await page.locator('a[href*="search.google.com/local/reviews"]').first().getAttribute('href').catch(() => null);
    place.sourcePlaceId = reviewHref ? new URL(reviewHref).searchParams.get('placeid') : null;
    if (place.mapLinks.length) {
      const target = place.mapLinks[0].href;
      place.mapIdentity = { href: target, embedsHeading: decodeURIComponent(target).toLowerCase().includes(place.heading.toLowerCase()), claim: 'URL text only; not independent current business verification' };
      // Reuse a failed policy probe instead of repeatedly opening a deferred destination.
      const probeFile = path.join(out, 'live-redirect-policy.json');
      const probe = fs.existsSync(probeFile) ? JSON.parse(fs.readFileSync(probeFile)) : null;
      place.mapDestination = probe?.source === target ? {
        state: probe.state, reason: probe.reason, trace: probe.trace,
        probeCapturedAt: fs.statSync(probeFile).mtime.toISOString(),
        currentBusinessIdentity: 'unverified', browserVisit: 'not_repeated_after_policy_stop',
      } : { state: 'unverified', reason: 'No matching redirect policy probe; destination not requested' };
    }
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 35000 });
    place.returnState = { url: page.url(), queryPreserved: new URL(page.url()).searchParams.get('q') === 'laundry', regionPreserved: new URL(page.url()).searchParams.get('in') === 'seoul' };
    place.state = place.mapDestination?.url ? 'navigation-observed-place-identity-still-unverified' : 'detail-observed-map-unverified';
  } catch (error) { place.state = 'incomplete'; place.reason = error.message; }
  report.cases.push(place);
  await page.close();
  }

  if (task !== 'local') {
  const product = { task: 'product-direct-purchase-link' };
  const page2 = await context.newPage();
  try {
    product.source = await open(page2, 'https://details.io/4k-webcams/products/emeet-c960-4k-webcam');
    product.ctas = await page2.locator('a[href*="amazon.com/dp/"]').evaluateAll(nodes => nodes.map(n => {
      const rect = n.getBoundingClientRect();
      return { text: n.textContent.trim(), href: n.href, inFirstViewport: rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0 && rect.left < innerWidth && rect.right > 0 };
    }));
    if (!product.ctas.length) throw Error('no-observed-purchase-link');
    await save(page2, 'product-purchase-390');
    const shop = await context.newPage();
    try { product.destination = await open(shop, product.ctas[0].href); }
    catch (error) { product.destination = { state: 'unverified', reason: error.message }; }
    await shop.close();
    product.state = 'source-link-observed-exact-seller-option-not-certified';
  } catch (error) { product.state = 'incomplete'; product.reason = error.message; }
  report.cases.push(product);
  await page2.close();
  }
} finally {
  await browser.close();
  report.permissions = [...permissions].map(([url, result]) => ({ url, ...result }));
  const file = path.join(out, task === 'all' ? 'navigation-report.json' : 'navigation-' + task + '.json');
  if (fs.existsSync(file)) {
    const previous = JSON.parse(fs.readFileSync(file));
    if (!previous.policyVersion) fs.writeFileSync(file.replace('.json', '.legacy-unchecked-browser-redirect.json'), JSON.stringify({ ...previous, limitation: 'Redirect targets were not independently intercepted; not policy-complete evidence' }, null, 2));
  }
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ cases: report.cases.map(c => ({ task: c.task, state: c.state, reason: c.reason, mapDestination: c.mapDestination, destination: c.destination })), navigationRequests: navigation.length }, null, 2));
if (report.cases.some(c => c.state === 'incomplete')) process.exitCode = 2;
