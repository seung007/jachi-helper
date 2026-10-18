import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import C from '../comparison-core.js';
import D from '../comparison-display.js';

const base = process.env.BASE_URL || 'http://127.0.0.1:4175';
const out = resolve('output/playwright/product-profiles');
const ids = ['P001','P051','P080','P102','P118','P137','P154','P178','P200'];
await mkdir(out,{recursive:true});
const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const checks = [], errors = [];
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror',e => errors.push(e.message));
  await page.route(/google-analytics\.com|googletagmanager\.com|\/insights\//,r => r.abort());
  for (const id of ids) {
    const raw = JSON.parse(await readFile(`assets/comparison/${id}.json`,'utf8'));
    const item = raw.item || raw;
    const group = item.groups.find(g => C.groupProducts(g.products).verified.length >= 2);
    assert.ok(group,`${id} needs a representative comparable group`);
    for (const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:width < 700 ? 844:1000});
      await page.goto(`${base}/compare?item=${id}&group=${group.id}`,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(() => document.body.dataset.comparisonReady === 'true');
      const cards = page.locator('[data-candidate]');
      assert.ok(await cards.count() >= 2,`${id}: candidates available`);
      assert.equal(await cards.locator('[data-coupang]').count(),await cards.count());
      assert.equal(await cards.locator('[data-profile-details]').count(),await cards.count());
      const firstId = await cards.first().getAttribute('data-candidate');
      const product = group.products.find(p => p.id === firstId);
      const fields = D.details(item,group,product,{limit:6});
      for (const field of fields) {
        const row = cards.first().locator(`[data-profile-key="${field.key}"]`);
        const full = row.locator('.comparison-meta-full p');
        assert.equal(await (await full.count() ? full : row.locator('dd > span')).textContent(),field.text);
        if (await full.count()) {
          assert.ok(await full.isHidden(),'Long field is collapsed, not deleted');
          await row.locator('summary').click();
          assert.ok(await full.isVisible());
          await row.locator('summary').click();
        }
        assert.equal(await row.getAttribute('data-state'),field.state);
      }
      const link = D.coupangLink(product,item,group);
      assert.equal(await cards.first().locator('[data-coupang]').getAttribute('href'),link.url);
      assert.equal(await cards.first().locator('[data-coupang]').getAttribute('data-link-kind'),link.kind);
      const source = new URL(product.url);
      const exact = ['coupang.com','www.coupang.com','m.coupang.com'].includes(source.hostname) && /^\/vp\/products\/\d+(?:\/|$)/.test(source.pathname);
      const renderedLink = cards.first().locator('[data-coupang]');
      assert.equal(await renderedLink.getAttribute('data-link-kind'),exact ? 'product' : 'search');
      if (exact) assert.equal(await renderedLink.getAttribute('href'),product.url,'Original SKU/options are preserved');
      else {
        const search = new URL(await renderedLink.getAttribute('href'));
        assert.equal(search.hostname,'www.coupang.com');
        assert.equal(search.pathname,'/np/search');
        assert.equal(search.searchParams.get('q'),group.label || item.title,'Search uses the real purpose, independently of D');
        assert.notEqual(search.searchParams.get('q'),product.name);
        assert.match(await renderedLink.innerText(),/쿠팡 유사상품 검색/);
      }
      await cards.first().locator('[data-toggle-product]').click();
      const filter = page.locator('[data-feature-filter]').first();
      if (await filter.count()) {
        const key = await filter.getAttribute('data-feature-filter');
        const value = await filter.locator('option').nth(1).getAttribute('value');
        await filter.selectOption(value);
        const filteredIds = await cards.evaluateAll(nodes => nodes.map(n => n.dataset.candidate));
        assert.ok(filteredIds.every(pid => D.matches(item,group,group.products.find(p => p.id === pid),{[key]:value})),`${id}: exact source-backed filter`);
        assert.equal(await page.locator('#selectionTrayProducts .comparison-tray-item').count(),1);
        await filter.selectOption('');
      }
      await page.locator('[data-toggle-product]').nth(1).click();
      await page.locator('#startCompare').click();
      assert.equal(await page.locator('[data-product-column]').count(),2);
      assert.equal(await page.locator('[data-product-column] [data-coupang]').count(),2);
      assert.equal(await page.locator('[data-product-column] [data-profile-details]').count(),2);
      assert.ok(await page.locator('[data-product-column]').first().locator('[data-profile-key]').count() <= 4,'Header keeps four key facts; complete fields remain in the table');
      const header = page.locator('[data-product-column]').first();
      assert.ok((await header.locator('[data-coupang]').boundingBox()).y < (await header.locator('[data-profile-details]').boundingBox()).y,'Purchase action must precede long specs');
      const overflow = await page.evaluate(() => ({
        page:document.documentElement.scrollWidth > innerWidth+1,
        text:[...document.querySelectorAll('.comparison-candidate,.comparison-product-header,.comparison-cooking-details dd,.comparison-feature-filters label,td,th')].filter(el => el.scrollWidth > el.clientWidth+1).map(el => el.className),
      }));
      assert.equal(overflow.page,false,`${id}/${width} page overflow`);
      assert.deepEqual(overflow.text,[],`${id}/${width} component overflow`);
      if (width === 390 || (width === 1440 && ['P051','P154'].includes(id))) {
        await page.waitForFunction(() => [...document.querySelectorAll('.comparison-product-headers img')].every(img => img.complete && img.naturalWidth > 0),null,{timeout:20000});
        await page.screenshot({path:resolve(out,`${id}-${width}.png`)});
      }
      checks.push({id,category:item.category,width,fields:fields.map(f => f.key),filter:await filter.count() ? 'verified' : 'no supplied choices'});
    }
  }
  assert.deepEqual(errors,[]);
  const report = {ok:true,checks,errors};
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({ok:true,categories:ids.length,viewports:checks.length,errors,screenshots:out}));
} finally { await browser.close(); }
