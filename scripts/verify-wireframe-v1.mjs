import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = new URL('../docs/wireframe-v1/', import.meta.url);
const out = new URL('../output/playwright/wireframe-v1/', import.meta.url);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const checks = [], errors = [], layouts = [];
page.on('pageerror', error => errors.push(error.message));
const check = (name, pass) => { assert.ok(pass, name); checks.push(name); };
async function open(hash) {
  await page.goto(new URL('index.html#' + hash, root).href, { waitUntil: 'domcontentloaded' });
  await page.locator('#main > *').first().waitFor();
}
async function hashReady(needle) { await page.waitForFunction(n => location.hash.includes(n) && document.querySelector('#main').dataset.route === location.hash, needle); }
async function settled() { await hashReady('page=2'); }
async function layout(name, width) {
  const result = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('#main h1,#main h2,#main h3,#main p,#main .primary,#navigation a')].filter(n => n.getClientRects().length);
    const outside = nodes.filter(n => { const r = n.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map(n => n.tagName);
    const clipped = nodes.filter(n => n.scrollWidth > n.clientWidth + 2).map(n => n.tagName);
    return { overflow: document.documentElement.scrollWidth > innerWidth + 1, outside, clipped };
  });
  check(`${name}/${width}: no horizontal overflow or clipped text`, !result.overflow && !result.outside.length && !result.clipped.length);
  layouts.push({ name, width, ...result });
}
try {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ['products?item=P051', 'compare?item=P051', 'neighborhood', 'apps?category=laundry']) {
      await open(route);
      const name = route.split('?')[0];
      await layout(name, width);
      const cta = await page.locator('#main .primary').first().boundingBox();
      check(`${name}/${width}: first action before mobile navigation`, cta && cta.y + cta.height <= (width <= 640 ? 780 : 844));
      await page.screenshot({ path: fileURLToPath(new URL(`${name}-${width}.png`, out)) });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await open('products');
  check('three primary destinations', await page.locator('#navigation a').count() === 3);
  check('all existing product items retained', await page.locator('#item option').count() === 211);
  check('pagination is in document flow', await page.locator('.pagination').evaluate(n => getComputedStyle(n).position === 'static'));
  const first = await page.locator('.product h3').first().innerText();
  await page.locator('[data-page="2"]').first().click(); await settled();
  check('numbered page changes products', await page.locator('.product h3').first().innerText() !== first);
  await page.locator('#query').fill('存在しない-wireframe-000');
  await page.locator('#searchForm button').click();
  await page.locator('.empty').waitFor(); check('empty state and reset', await page.locator('[data-action="reset"]').isVisible());
  await page.locator('[data-action="reset"]').click(); await page.locator('.product').first().waitFor();
  await page.locator('#query').fill('수건'); await page.locator('#searchForm button').click();
  await hashReady('q=');
  check('global search returns towels', await page.locator('.product').count() > 1 && await page.locator('.product h3').first().innerText() !== first);
  await page.locator('#navigation [data-nav="apps"]').click(); await page.locator('#appCategory').waitFor();
  await page.locator('#navigation [data-nav="products"]').click(); await page.locator('#item').waitFor();
  check('tab return retains query', await page.locator('#query').inputValue() === '수건');

  await open('products?item=P051');
  await page.locator('.refine summary').click();
  await page.locator('#condition').selectOption('capacity'); await hashReady('condition=capacity');
  check('choosing criterion without a value does not empty list', await page.locator('.product').count() > 1);
  await page.locator('#conditionValue').selectOption('3 L'); await hashReady('value=');
  check('capacity filter returns matching known facts', await page.locator('.product').count() > 0 && (await page.locator('.facts-line').allTextContents()).every(x => x.includes('3 L')));
  await open('products?item=P051');
  await page.locator('[data-save]').first().click();
  check('save retains keyboard focus', await page.evaluate(() => document.activeElement.hasAttribute('data-save')));
  await page.locator('#savedButton').click(); await page.locator('.page-title h1').waitFor();
  check('saved products are accessible without a plan', await page.locator('.product').count() === 1);
  await open('products?item=P051');
  await page.locator('[data-compare]').nth(0).check(); await page.locator('[data-compare]').nth(1).check();
  check('optional compare tray', await page.locator('#compareTray').isVisible());
  await page.locator('[data-action="compare"]').click(); await page.locator('#leftProduct').waitFor();
  check('all focused candidates available through replacement', await page.locator('#leftProduct option').count() >= 4);
  const left = await page.locator('#leftProduct').inputValue();
  const replacement = await page.locator('#leftProduct option').last().getAttribute('value');
  await page.locator('#leftProduct').selectOption(replacement);
  await hashReady('left=');
  check('candidate replacement changes product', left !== await page.locator('#leftProduct').inputValue());
  await page.locator('#onlyDifference').check(); await hashReady('diff=1');
  check('unknown servings remain when showing only differences', (await page.locator('.difference-table').innerText()).includes('미확인'));
  for (const a of await page.locator('.compare-product .primary').all()) {
    const href = await a.getAttribute('href'), label = await a.innerText();
    check('purchase CTA is exact source, not a search disguised as purchase', href.startsWith('https://') && !href.includes('/np/search') && !label.includes('찾기'));
  }

  await open('neighborhood');
  check('all 25 districts', await page.locator('#gu option').count() === 26);
  check('places explicitly schematic', (await page.locator('.sample-note').first().innerText()).includes('실제 업소'));
  const gu = await page.locator('#gu option').nth(1).getAttribute('value');
  await page.locator('#gu').selectOption(gu); await page.waitForFunction(() => document.querySelector('#dong').options.length > 1);
  const dong = await page.locator('#dong option').nth(1).getAttribute('value');
  await page.locator('#dong').selectOption(dong); await hashReady('dong=');
  const nextGu = await page.locator('#gu option').nth(2).getAttribute('value');
  await page.locator('#gu').selectOption(nextGu); await page.waitForFunction(() => !location.hash.includes('dong=') && document.querySelector('#main').dataset.route === location.hash);
  check('district change clears old dong', await page.locator('#dong').inputValue() === '');
  await page.locator('#placeSub').selectOption('셀프빨래방');
  await hashReady('sub=');
  check('sub-industry narrows placeholders', (await page.locator('.place h3').allTextContents()).every(x => x.includes('셀프빨래방')));
  await page.locator('[data-place]').first().click(); await page.locator('#placeDialog[open]').waitFor();
  await page.keyboard.press('Escape');
  check('dialog closes and focus returns', !await page.locator('#placeDialog').isVisible() && await page.evaluate(() => document.activeElement.hasAttribute('data-place')));

  await open('apps?category=laundry');
  check('apps have descriptions and HTTPS actions', await page.locator('.app p').count() > 0 && (await page.locator('.app-actions a').evaluateAll(a => a.every(n => n.href.startsWith('https://') && n.target === '_blank' && n.rel.includes('noopener')))));
  await open('apps?q=빼기');
  check('municipal guide is not labelled provider homepage', (await page.locator('.app-actions').innerText()).includes('강북구 배출 안내'));

  const failureContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await failureContext.route('https://**/*', route => route.abort());
    const failure = await failureContext.newPage();
    await failure.goto(new URL('index.html#products?item=P051', root).href, { waitUntil: 'domcontentloaded' });
    await failure.waitForFunction(() => document.querySelector('.photo.missing'));
    check('image failure has stable square placeholder', await failure.locator('.photo.missing').first().evaluate(n => Math.abs(n.clientWidth - n.clientHeight) <= 2));
    check('image failure does not overflow viewport', await failure.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  } finally { await failureContext.close(); }
  check('no JavaScript exceptions', errors.length === 0);

  await page.setViewportSize({ width: 1600, height: 1120 });
  await page.goto(new URL('board.html', root).href, { waitUntil: 'domcontentloaded' });
  const images = [];
  for (const frame of page.frames().filter(f => f.parentFrame())) {
    await frame.locator('#main > *').first().waitFor();
    images.push(...await frame.evaluate(async () => {
      const images = [...document.querySelectorAll('img')].filter(i => i.getBoundingClientRect().top < innerHeight);
      await Promise.race([Promise.all(images.map(img => img.complete ? null : new Promise(r => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }))), new Promise(r => setTimeout(r, 5000))]);
      return images.map(i => ({ url: i.src, loaded: i.complete && i.naturalWidth > 0 }));
    }));
  }
  const shot = new URL('overview.png', out);
  await page.screenshot({ path: fileURLToPath(shot), fullPage: true });
  copyFileSync(shot, new URL('overview.png', root));
  writeFileSync(new URL('report.json', out), JSON.stringify({ checks, layouts, errors, imageObservations: images, limits: 'Prototype geometry and behavior only; no real business, installation, price, user preference or production verification.' }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, layouts: layouts.length, imageLoaded: images.filter(i => i.loaded).length, imageObserved: images.length, output: 'output/playwright/wireframe-v1/report.json' }));
} finally { await context.close(); await browser.close(); }
