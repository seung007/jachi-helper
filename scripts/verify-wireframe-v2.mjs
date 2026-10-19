import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = new URL('../docs/wireframe-v2/', import.meta.url), out = new URL('../output/playwright/wireframe-v2/', import.meta.url);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage(), checks = [], errors = [], layouts = [];
page.setDefaultTimeout(6000); page.on('pageerror', e => errors.push(e.message));
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); };
const url = hash => new URL('index.html#' + hash, root).href;
async function open(hash) { await page.goto(url(hash), { waitUntil: 'domcontentloaded' }); await page.locator('#main > *').first().waitFor({ state: 'attached' }); }
async function routeReady() { await page.waitForFunction(() => document.querySelector('#main').dataset.route === location.hash); }
async function inspect(name, width) {
  const geometry = await page.evaluate(() => {
    const elements = [...document.querySelectorAll('#main h1,#main h2,#main .key-facts,#main .buy,#panel[open] h2,#panel[open] h3,#panel[open] dd,#panel[open] .buy')].filter(n => n.getClientRects().length);
    const clipped = elements.filter(n => { const r = n.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1 || n.scrollWidth > n.clientWidth + 2; }).map(n => ({ tag: n.tagName, text: n.textContent.slice(0, 40) }));
    return { overflow: document.documentElement.scrollWidth > innerWidth + 1, clipped };
  });
  layouts.push({ name, width, ...geometry }); check(`${name}/${width}: layout in viewport`, !geometry.overflow && !geometry.clipped.length);
}
try {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [name, hash] of [['home', 'browse'], ['pots', 'item?item=P051'], ['towels', 'item?item=P080'], ['compare', 'item?item=P051&compare=P051-01'], ['categories', 'browse?panel=categories'], ['conditions', 'item?item=P051&panel=filters']]) {
      await open(hash); await inspect(name, width);
      if (['pots', 'towels'].includes(name)) { const r = await page.locator('#main [data-purchase]').first().boundingBox(); check(`${name}/${width}: first purchase visible`, r && r.y + r.height < 844); }
      if (name === 'compare') { const boxes = await page.locator('#panel .sheet-footer .buy').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; })); check(`compare/${width}: both purchase actions visible`, boxes.length === 2 && boxes.every(r => r.top >= 0 && r.bottom <= 844)); }
      await page.screenshot({ path: fileURLToPath(new URL(`${name}-${width}.png`, out)) });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await open('browse');
  check('home is item discovery, not six pot models', new Set(await page.locator('.item-category').allTextContents()).size >= 5);
  check('no forced upfront select fields or compare cart', await page.locator('#main select,#main input[type=checkbox],#compareTray').count() === 0);
  const first = await page.locator('.item-tile').first().getAttribute('data-item');
  await page.getByRole('link', { name: '2페이지', exact: true }).click(); await routeReady();
  check('direct numbered paging changes items', first !== await page.locator('.item-tile').first().getAttribute('data-item'));
  await page.locator('#query').fill('수건'); await page.locator('#searchForm button').click(); await routeReady();
  const searchedIds = await page.locator('[data-product]').evaluateAll(nodes => nodes.map(n => n.dataset.product));
  check('one search reaches towel candidates', locationHash(await page.url()).includes('item=P080') && searchedIds.length >= 5);
  await page.locator('#categoriesButton').click(); await page.locator('#panel[open]').waitFor();
  await page.getByRole('tab', { name: '욕실·위생', exact: true }).click();
  await page.locator('#category-items').getByRole('link', { name: '수건', exact: true }).click(); await routeReady();
  check('category and search converge on same product candidates', JSON.stringify(searchedIds) === JSON.stringify(await page.locator('[data-product]').evaluateAll(nodes => nodes.map(n => n.dataset.product))));

  await page.locator('#categoriesButton').click();
  const itemTitles = [];
  for (const tab of await page.locator('[role=tab]').all()) {
    await tab.click(); itemTitles.push(...await page.locator('#category-items a').allTextContents());
  }
  check('all 210 existing items remain reachable', itemTitles.length === 210 && new Set(itemTitles).size === 210);
  await page.keyboard.press('Escape'); await page.locator('#panel[open]').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement.id === 'categoriesButton');
  check('category Escape restores focus', await page.locator('#categoriesButton').evaluate(n => n === document.activeElement));
  await page.locator('#categoriesButton').click();
  await page.locator('[role=tab][aria-selected=true]').focus();
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown');
  check('category tabs support keyboard navigation', await page.locator('[role=tab][aria-selected=true]').innerText() === '주방');
  await page.keyboard.press('Escape'); await page.locator('#panel[open]').waitFor({ state: 'hidden' });

  await open('item?item=P051');
  const allIds = await page.locator('[data-product]').evaluateAll(nodes => nodes.map(n => n.dataset.product));
  await page.locator('[data-panel=filters]').click();
  await page.locator('select[name=f_capacity]').selectOption('3 L'); await page.locator('#filterForm button[type=submit]').click(); await routeReady();
  check('condition applies without dropping item context', (await page.locator('[data-product]').count()) < allIds.length && (await page.locator('.key-facts').allTextContents()).every(t => t.includes('3 L')));
  await page.locator('[data-remove-filter=capacity]').click(); await routeReady();
  check('condition chip removal restores candidates', await page.locator('[data-product]').count() === allIds.length);
  const before = await page.url(), firstModel = allIds[0];
  await page.locator('[data-compare]').first().click();
  check('one click opens comparison without a compare cart', await page.locator('#panel').isVisible() && (await page.url()).includes('compare='));
  check('clicked model is the comparison baseline', await page.locator('#panel .compare-head').first().locator('h3').innerText() === await page.locator('[data-product]').first().locator('h2').innerText());
  check('all other models remain selectable', await page.locator('#compareOther option').count() === allIds.length - 1);
  const other = await page.locator('#compareOther option').last().getAttribute('value');
  await page.locator('#compareOther').selectOption(other); await routeReady();
  check('comparison candidate can be swapped', await page.locator('#compareOther').inputValue() === other);
  await page.waitForFunction(() => document.activeElement.id === 'compareOther');
  check('candidate replacement keeps keyboard focus', true);
  await page.locator('#differenceOnly').check(); await routeReady();
  check('unknown servings are not disguised as equality', (await page.locator('.compare-table').innerText()).includes('미확인'));
  await page.keyboard.press('Escape'); await page.locator('#panel[open]').waitFor({ state: 'hidden' });
  check('closing comparison returns to original result route', await page.url() === before);
  await page.waitForFunction(id => document.activeElement.dataset.compare === id, firstModel);
  check('comparison returns focus to exact trigger', true);

  for (const a of await page.locator('#main [data-purchase]').all()) {
    const href = await a.getAttribute('href'), id = await a.getAttribute('data-purchase');
    const expected = await page.evaluate(id => { const p = window.WireframeData.products.find(p => p.id === id); return ['direct','product'].includes(p.purchase?.kind) ? p.purchase.url : p.sourceUrl; }, id);
    check('primary CTA retains exact product source URL', href === expected && !href.includes('/np/search'));
  }
  await page.locator('.product-name').first().click();
  check('full information opens from product title', await page.locator('.detail-specs').isVisible());
  await page.locator('#panel [data-compare]').click();
  await page.keyboard.press('Escape'); await page.locator('#panel[open]').waitFor({ state: 'hidden' });
  check('detail to compare still closes to result, not an overlay loop', await page.url() === before);
  await page.locator('[data-panel=filters]').click();
  const panelTop = await page.locator('#panel').evaluate(n => n.getBoundingClientRect().top);
  await page.mouse.click(8, Math.max(1, panelTop - 8));
  await page.locator('#panel[open]').waitFor({ state: 'hidden' });
  check('backdrop click dismisses panel without a new route loop', await page.url() === before);
  await page.locator('#query').fill('wireframe-missing-000'); await page.locator('#searchForm button').click();
  check('empty search has recovery link', await page.locator('.empty').isVisible());
  await page.locator('.empty a').click(); await routeReady();
  await page.getByRole('link', { name: '먹거리', exact: true }).click(); await routeReady();
  check('category selection filters only the selected category', (await page.locator('.item-category').allTextContents()).every(t => t === '먹거리'));

  const longest = await page.evaluate(() => [...window.WireframeData.products].sort((a,b) => b.name.length-a.name.length)[0]);
  await page.setViewportSize({ width: 320, height: 844 });
  await open('item?item=' + longest.item); await inspect('longest-name', 320);
  await page.screenshot({ path: fileURLToPath(new URL('longest-name-320.png', out)) });
  await open('item?item=P004'); await page.locator('.product-name').first().click();
  check('metadata keys do not leak as English field names', (await page.locator('.detail-specs dt').allTextContents()).every(t => /[가-힣]/.test(t)));
  await open('item?item=P001');
  check('verified Coupang direct link is labelled accurately', (await page.locator('#main [data-purchase]').first().innerText()).includes('쿠팡 상품 보기'));
  await page.waitForFunction(() => document.querySelector('.offer img')?.naturalWidth > 0);
  check('local original product photo resolves from standalone file', await page.locator('.offer img').first().evaluate(n => n.src.includes('/assets/offers/rice12.jpg') && n.naturalWidth > 0));
  await open('item?item=invalid&compare=invalid');
  check('invalid item URL recovers to browse', await page.locator('.item-grid').isVisible() && !await page.locator('#panel').isVisible());
  const failedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await failedContext.route('https://**/*', r => r.abort());
    const failed = await failedContext.newPage(); await failed.goto(url('browse'), { waitUntil: 'domcontentloaded' });
    await failed.locator('.item-photo.missing').first().waitFor();
    check('failed photo keeps a square, related placeholder', await failed.locator('.item-photo.missing').first().evaluate(n => Math.abs(n.clientWidth - n.clientHeight) < 2));
  } finally { await failedContext.close(); }
  check('no JavaScript exceptions', errors.length === 0);

  await page.setViewportSize({ width: 1440, height: 1150 });
  await page.goto(new URL('board.html', root).href, { waitUntil: 'domcontentloaded' });
  const imageObservations = [], photoFailures = [];
  for (const frame of page.frames().filter(f => f.parentFrame())) {
    await frame.locator('#main > *').first().waitFor({ state: 'attached' });
    imageObservations.push(...await frame.evaluate(async () => {
      const images = [...document.images].filter(i => { const r=i.getBoundingClientRect(); return r.top < innerHeight && r.bottom>0; });
      await Promise.race([Promise.all(images.map(img => img.complete ? null : new Promise(r => { img.addEventListener('load',r,{once:true}); img.addEventListener('error',r,{once:true}); }))),new Promise(r=>setTimeout(r,4500))]);
      await Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,2000))]);
      return images.map(i=>({url:i.src,loaded:i.complete&&i.naturalWidth>0}));
    }));
    photoFailures.push(...await frame.locator('.missing').evaluateAll(nodes => nodes.filter(n => { const r=n.getBoundingClientRect(); return r.top<innerHeight && r.bottom>0; }).map(n => n.dataset.failedImage)));
  }
  check('no broken photo placeholders in review overview', photoFailures.length === 0);
  const shot = new URL('overview.png', out);
  await page.screenshot({ path: fileURLToPath(shot), fullPage: true }); copyFileSync(shot, new URL('overview.png',root));
  writeFileSync(new URL('report.json',out),JSON.stringify({checks,layouts,errors,imageObservations,photoFailures,limits:'Standalone product-flow prototype. No real user preference, conversion, new price/review data or production deployment verified.'},null,2));
  console.log(JSON.stringify({checks:checks.length,layouts:layouts.length,imagesLoaded:imageObservations.filter(i=>i.loaded).length,imagesObserved:imageObservations.length,visiblePhotoFailures:photoFailures.length,report:'output/playwright/wireframe-v2/report.json'}));
} catch (error) {
  await page.screenshot({path:fileURLToPath(new URL('failure.png',out))}).catch(()=>{});
  writeFileSync(new URL('failure.json',out),JSON.stringify({error:error.message,checks,errors,layouts,url:page.url()},null,2));
  throw error;
} finally { await context.close(); await browser.close(); }
function locationHash(value){return new URL(value).hash;}
