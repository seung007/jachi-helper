import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:4175";
const out = "output/playwright/catalog";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
const errors = [];
const checks = [];
const requests = [];
async function checkLayout(page, label) {
  const failures = await page.evaluate(() => {
    const failures = [];
    const visible = el => el.getBoundingClientRect().height > 0;
    const sequential = (parent, selector) => {
      const nodes = [...parent.querySelectorAll(selector)].filter(visible);
      for (let index = 1; index < nodes.length; index++) {
        if (nodes[index - 1].getBoundingClientRect().bottom > nodes[index].getBoundingClientRect().top + 1) {
          failures.push(`${parent.dataset.item || parent.dataset.productId}: overlapping ${nodes[index].className}`);
        }
      }
    };
    for (const card of document.querySelectorAll('.catalog-card')) {
      sequential(card, '.catalog-card-kicker, h3, .catalog-card-product, .catalog-product-details, .catalog-card-guidance, .catalog-card-purchase, .catalog-card-actions, .catalog-source-link');
    }
    for (const offer of document.querySelectorAll('.catalog-offer')) sequential(offer, '.catalog-offer-top, .catalog-buy-link, .catalog-source-link');
    for (const el of document.querySelectorAll('.catalog-card-content, .catalog-card h3, .catalog-product-details dt, .catalog-product-details dd, .catalog-card-purchase a, .catalog-card-actions a, .catalog-source-link, .catalog-buy-link, .catalog-offer h4')) {
      if (visible(el) && el.scrollWidth > el.clientWidth + 1) failures.push(`text overflow: ${el.className || el.tagName}`);
    }
    const cards = [...document.querySelectorAll('.catalog-card')].map(el => el.getBoundingClientRect());
    for (let index = 0; index < cards.length; index++) for (const other of cards.slice(index + 1)) {
      const card = cards[index];
      if (Math.min(card.right, other.right) - Math.max(card.left, other.left) > 1 && Math.min(card.bottom, other.bottom) - Math.max(card.top, other.top) > 1) failures.push('overlapping cards');
    }
    return failures.slice(0, 12);
  });
  assert.deepEqual(failures, [], `${label}: ${failures.join('; ')}`);
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("request", request => requests.push(new URL(request.url()).pathname));
  await page.route(/google-analytics\.com|googletagmanager\.com|\/insights\//, route => route.abort());
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator(".catalog-card").first().waitFor();
  assert.equal(await page.locator(".catalog-card").count(), 24);
  assert.equal(await page.locator("#catalogCategories button").count(), 10);
  assert.match(await page.locator("#catalogCount").innerText(), /213/);
  await page.locator("#catalogAll").click();
  assert.equal(await page.locator(".catalog-card").count(), 213);
  assert.equal(await page.locator("#catalogAll").isVisible(), false);
  checks.push("all 213 rows accessible");
  const catalogAudit = await page.evaluate(() => {
    const failures = [];
    let productItems = 0, guidanceItems = 0, offers = 0, direct = 0, search = 0;
    const check = (condition, message) => { if (!condition) failures.push(message); };
    function inspectLink(parent, product, placement) {
      const links = parent.querySelectorAll('[data-link-role="coupang"]');
      check(links.length === 1, `${product.id}: one primary Coupang link`);
      const link = links[0];
      if (!link) return;
      const source = new URL(product.url);
      const exact = ['coupang.com', 'www.coupang.com', 'm.coupang.com'].includes(source.hostname) && /^\/vp\/products\/\d+(?:\/|$)/.test(source.pathname);
      const url = new URL(link.href);
      check(link.dataset.store === 'coupang' && link.dataset.itemId === product.id && link.dataset.productId === product.id && link.dataset.placement === placement, `${product.id}: primary tracking identifiers`);
      check(link.target === '_blank' && link.rel.includes('noopener'), `${product.id}: safe external link`);
      check(link.dataset.coupangKind === (exact ? 'product' : 'search'), `${product.id}: link kind`);
      if (exact) {
        direct++;
        check(link.href === source.href && link.textContent.includes('쿠팡에서 보기'), `${product.id}: preserve direct SKU and option URL`);
      } else {
        search++;
        check(url.hostname === 'www.coupang.com' && url.pathname === '/np/search' && url.searchParams.get('q') === product.name.trim() && link.textContent.includes('쿠팡에서 찾기'), `${product.id}: labeled exact-name search`);
      }
      const origin = parent.querySelector('[data-source-link]');
      check(origin?.href === source.href && origin.dataset.itemId === product.id && origin.dataset.linkRole === 'source' && origin.dataset.placement === placement && origin.dataset.store !== 'unknown', `${product.id}: separately tracked original source`);
    }
    function inspectDetails(parent, item, product) {
      const expected = window.ComparisonDisplay.details(item, null, product, { limit: 4 });
      const actual = [...parent.querySelectorAll('[data-detail-key]')].map(row => ({ key: row.dataset.detailKey, state: row.dataset.detailState, text: row.querySelector('dd > span').textContent }));
      check(expected.length <= 4 && JSON.stringify(actual) === JSON.stringify(expected.map(({ key, state, text }) => ({ key, state, text }))), `${product.id}: source-aware product-specific details`);
      for (const row of expected) {
        const rendered = [...parent.querySelectorAll('[data-detail-key]')].find(el => el.dataset.detailKey === row.key);
        check(!row.sourceUrl || rendered?.querySelector('[data-fact-source]')?.href === window.ComparisonCore.safeUrl(row.sourceUrl), `${product.id}: detail evidence link`);
        check(row.state !== 'unknown' || row.text === '미확인', `${product.id}: unknown is not no`);
      }
    }
    for (const item of window.ProductCatalog.items) {
      const card = document.querySelector(`.catalog-card[data-item="${item.id}"]`);
      check(card?.querySelector('h3').textContent === item.title, `${item.id}: retained item metadata`);
      if (item.kind === 'guidance') {
        guidanceItems++;
        check(!card.querySelector('[data-store-link], [data-detail-key], a[href*="/compare?"]'), `${item.id}: no shopping guidance card`);
        check(Boolean(card.querySelector('[data-guidance-link]')), `${item.id}: direct official guidance`);
      } else {
        productItems++;
        const product = item.products.find(p => window.ComparisonCore.safeUrl(p.imageUrl, { allowLocal: true })) || item.products[0];
        check(card.querySelector('.catalog-card-product').textContent === product.name, `${item.id}: retained product name`);
        inspectLink(card, product, 'catalog_card');
        inspectDetails(card, item, product);
      }
      card.querySelector('[data-open]').click();
      const dialog = document.querySelector('#catalogDetail');
      check(dialog.open && dialog.querySelector('h2').textContent === item.title, `${item.id}: correct detail without stale content`);
      const renderedOffers = [...dialog.querySelectorAll('.catalog-offer')];
      check(renderedOffers.length === (item.kind === 'guidance' ? 0 : item.products.length), `${item.id}: all matching offers only`);
      if (item.kind === 'guidance') check(!dialog.querySelector('[data-store-link], [data-detail-key], .catalog-detail-criteria'), `${item.id}: guidance exempt from shopping details`);
      else for (const product of item.products) {
        offers++;
        const offer = renderedOffers.find(el => el.dataset.productId === product.id);
        check(Boolean(offer), `${product.id}: retained product ID`);
        if (offer) { inspectLink(offer, product, 'expanded_catalog'); inspectDetails(offer, item, product); }
      }
      history.replaceState(null, '', '/#catalog');
      document.querySelector('#catalogClose').click();
      check(!dialog.open, `${item.id}: synchronous close after direct navigation`);
    }
    return { productItems, guidanceItems, offers, direct, search, failures };
  });
  assert.deepEqual(catalogAudit.failures, []);
  assert.equal(catalogAudit.productItems, 210);
  assert.equal(catalogAudit.guidanceItems, 3);
  assert.ok(catalogAudit.direct > 0 && catalogAudit.search > 0);
  checks.push(`all 210 product cards and ${catalogAudit.offers} detail offers: primary Coupang direct SKU/name search, secondary source, max-four details; all 3 guidance exceptions`);
  for (const [width, height] of [[320,720], [360,800], [390,844], [768,1024], [1024,768], [1440,1000]]) {
    await page.setViewportSize({ width, height });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator(".catalog-card").first().waitFor();
    await page.locator(".catalog-card img").first().waitFor({ timeout: 10000 });
    await page.waitForFunction(() => { const img = document.querySelector('.catalog-card img'); return img?.complete && img.naturalWidth > 0; }, null, { timeout: 20000 });
    const sizes = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(sizes.scroll <= sizes.viewport + 1, `${width}: overflow ${JSON.stringify(sizes)}`);
    const first = page.locator(".catalog-card").first();
    assert.ok(await first.locator('[data-link-role="coupang"]').isVisible());
    if (width === 390) assert.ok((await first.boundingBox()).y < 500, "Products should appear before 500px on mobile");
    await page.locator('#catalogAll').click();
    await checkLayout(page, `${width}px all 213 cards`);
    await first.locator("[data-open]").first().click();
    await page.locator("#catalogDetail[open]").waitFor();
    const detail = await page.locator("#catalogDetail").evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    assert.ok(detail.scroll <= detail.width + 1, `${width}: dialog overflow`);
    assert.ok(await page.locator(".catalog-buy-link").count() > 0);
    await checkLayout(page, `${width}px detail`);
    await page.locator('.catalog-detail-criteria summary').click();
    await page.locator('#catalogDetailBody [data-save]').click();
    await page.locator('#catalogDetail').evaluate(el => { el.scrollTop = 0; });
    assert.ok(await page.locator('.catalog-detail-criteria').evaluate(el => el.open), 'Saving must preserve expanded criteria');
    assert.ok(await page.locator('#catalogDetailBody [data-save]').evaluate(el => el === document.activeElement), 'Saving must preserve focused action');
    await page.locator('#catalogDetailBody [data-save]').click();
    await page.screenshot({ path: `${out}/detail-${width}.png` });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#catalogDetail").open);
    await page.locator('#catalogToast').waitFor({ state: 'hidden' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${out}/home-${width}.png`, fullPage: false });
    checks.push(`${width}px all cards/detail no overflow or content overlap; save retains detail state/focus`);
  }
  await page.locator("#catalogQuery").fill("운동복");
  assert.ok(await page.locator(".catalog-card").count() > 0);
  assert.ok(await page.locator(".catalog-card").count() < 213);
  await page.locator(".catalog-card [data-save]").first().click();
  const savedId = await page.locator(".catalog-card [data-save][aria-pressed=true]").first().getAttribute("data-save");
  assert.match(await page.locator("#catalogToast").innerText(), /저장했습니다/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#catalogSaved").click();
  assert.equal(await page.locator(".catalog-card").count(), 1);
  assert.equal(await page.locator(".catalog-card").getAttribute("data-item"), savedId);
  checks.push("search and saved item persist across reload");
  await page.goto(`${base}/checklist`, { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator("[data-catalog-saved] li").count(), 1);
  await page.locator('[data-catalog-saved] a[href="/?saved=1#catalog"]').click();
  await page.locator(".catalog-card").first().waitFor();
  assert.equal(await page.locator(".catalog-card").count(), 1);
  checks.push("saved items appear in preparation page and link back to saved catalog");
  await page.goto(`${base}/?item=P213#catalog`, { waitUntil: "domcontentloaded" });
  await page.locator("#catalogDetail[open]").waitFor();
  assert.match(await page.locator("#catalogDetailBody").innerText(), /약사/);
  assert.equal(await page.locator("#catalogDetailBody [data-store-link]").count(), 0);
  checks.push("direct item URL opens regional/medicine guidance");
  await page.goto(`${base}/?category=${encodeURIComponent("가전")}`, { waitUntil: "domcontentloaded" });
  assert.match(await page.locator("#catalogCount").innerText(), /25/);
  await page.locator("#catalogAll").click();
  assert.equal(await page.locator(".catalog-card").count(), 25);
  await page.locator("#catalogFilterPanel summary").click();
  await page.locator("#catalogSubgroup").selectOption({ index: 1 });
  const subgroup = await page.locator("#catalogSubgroup").inputValue();
  assert.ok((await page.locator(".catalog-card-kicker").allTextContents()).every(text => text.includes(subgroup)));
  checks.push("category and subgroup show all matching products");
  await page.locator('[data-remove-filter="subgroup"]').click();
  assert.equal(await page.locator("#catalogSubgroup").inputValue(), "all");
  await page.locator("#catalogSort").selectOption("name");
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(await page.locator("#catalogSort").inputValue(), "name");
  checks.push("filter removal and sort persist across reload");
  const relatedId = await page.evaluate(() => window.ProductCatalog.items.find(item => item.id === 'P102').existingIds[0]);
  assert.ok(relatedId, 'Detergent must have a legacy item ID');
  await page.goto(`${base}/item?id=${encodeURIComponent(relatedId)}`, { waitUntil: 'domcontentloaded' });
  const related = page.locator('[data-catalog-related]');
  await related.waitFor({ state: 'visible' });
  assert.ok(await related.locator('.catalog-offer').count() > 0);
  assert.equal(await related.locator('[data-link-role="coupang"]').count(), await related.locator('.catalog-offer').count());
  const relatedAudit = await related.evaluate(el => {
    const item = window.ProductCatalog.items.find(item => item.id === 'P102');
    return [...el.querySelectorAll('.catalog-offer')].every(offer => {
      const product = item.products.find(product => product.id === offer.dataset.productId);
      const link = offer.querySelector('[data-link-role="coupang"]');
      return product && link?.href === window.ComparisonDisplay.coupangLink(product).url &&
        link.dataset.itemId === product.id && offer.querySelector('[data-source-link]')?.href === window.ComparisonCore.safeUrl(product.url) && offer.querySelectorAll('[data-detail-key]').length <= 4;
    });
  });
  assert.ok(relatedAudit, 'Related item offers must match the original product and source-aware links');
  for (const width of [320, 360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await checkLayout(page, `${width}px related item`);
    assert.ok(await related.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${width}px related item overflow`);
  }
  const guidanceIds = await page.evaluate(() => window.ProductCatalog.items.filter(item => item.kind === 'guidance').flatMap(item => item.existingIds));
  for (const id of [...guidanceIds, 'no-catalog-item']) {
    await page.goto(`${base}/item?id=${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded' });
    assert.ok(await page.locator('[data-catalog-related]').evaluate(el => el.hidden && el.children.length === 0), `${id}: no generic/shopping related content`);
  }
  checks.push('legacy detergent item: matching related product, Coupang/source links, max-four details, responsive widths; guidance/nonmatching related content stays hidden');
  assert.deepEqual(requests.filter(path => /\/(?:comparison-data|comparison-index)\.js$|\/assets\/comparison\//.test(path)), [], 'Catalog/document pages must not load aggregate or comparison index data');
  const fixture = await context.newPage();
  fixture.on('pageerror', error => errors.push(error.message));
  await fixture.addInitScript(() => {
    let catalog;
    Object.defineProperty(window, 'ProductCatalog', { configurable: true, get: () => catalog, set(value) {
      catalog = value;
      const item = catalog.items[0];
      item.criteria = ['구매 기준을 상품 사실로 표시하면 안 됨'];
      item.products[0].facts = [{ label: '내용량', value: '0g' }, { label: '보관 방법', value: '미확인' }];
      const detergent = catalog.items.find(item => item.id === 'P102');
      detergent.products = Array.from({ length: 7 }, (_, index) => ({ ...detergent.products[0], id: `P102-fixture-${index}` }));
    } });
  });
  await fixture.goto(base, { waitUntil: 'domcontentloaded' });
  await fixture.locator('.catalog-card').first().waitFor();
  const fixtureCard = fixture.locator('.catalog-card').first();
  assert.equal(await fixtureCard.locator('[data-detail-key="amount"] dd > span').innerText(), '0g');
  assert.equal(await fixtureCard.locator('[data-detail-key="storage"]').getAttribute('data-detail-state'), 'unknown');
  assert.equal(await fixtureCard.locator('[data-detail-key="storage"] dd > span').innerText(), '미확인');
  assert.ok(!(await fixtureCard.innerText()).includes('구매 기준을 상품 사실'));
  await fixtureCard.locator('[data-open]').first().click();
  assert.equal(await fixture.locator('#catalogDetailBody [data-detail-key="amount"] dd > span').innerText(), '0g');
  const profiles = await fixture.evaluate(() => {
    const D = window.ComparisonDisplay;
    const zero = D.details({ id: 'test-appliance', category: '가전' }, { attributeDefinitions: [{ key: 'power', label: '소비전력', type: 'number', unit: 'W' }] }, { attributes: { power: { status: 'verified', value: 0, sourceUrl: 'https://example.com/spec' } } }, { limit: 4 });
    return { zero: zero.find(row => row.key === 'power'), categories: window.ProductCatalog.categories.map(category => {
      const rows = D.details({ id: 'test-profile', category }, null, { name: '표시 없는 상품', url: 'https://example.com/product', facts: [] }, { limit: 4 });
      return { category, valid: rows.length > 0 && rows.length <= 4 && rows.every(row => row.state === 'unknown' && row.text === '미확인') };
    }) };
  });
  assert.equal(profiles.zero.state, 'verified');
  assert.equal(profiles.zero.text, '0 W');
  assert.ok(profiles.categories.every(profile => profile.valid), JSON.stringify(profiles.categories));
  await fixture.goto(`${base}/item?id=${encodeURIComponent(relatedId)}`, { waitUntil: 'domcontentloaded' });
  await fixture.locator('[data-catalog-related]').waitFor({ state: 'visible' });
  assert.equal(await fixture.locator('[data-catalog-related] .catalog-offer').count(), 6);
  const allRelated = fixture.locator('[data-catalog-related] > a.catalog-source-link');
  assert.equal(await allRelated.count(), 1);
  const allRelatedUrl = new URL(await allRelated.getAttribute('href'), base);
  assert.equal(allRelatedUrl.searchParams.get('q'), await fixture.evaluate(() => window.ProductCatalog.items.find(item => item.id === 'P102').title));
  assert.equal(allRelatedUrl.hash, '#catalog');
  checks.push('related item offers capped at six with exact-title all-products link');
  checks.push('all nine category profiles: empty is unknown; sourced numeric/text zero remains verified; purchasing criteria excluded from product facts');
  await fixture.close();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator(".catalog-card").first().waitFor();
  await page.locator(".catalog-card img").first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.catalog-card img')).some(img => img.complete && img.naturalWidth > 0), null, { timeout: 20000 });
  const imageStatus = await page.locator(".catalog-card img").evaluateAll(images => ({ shown: images.length, loaded: images.filter(img => img.complete && img.naturalWidth > 0).length }));
  assert.ok(imageStatus.loaded > 0, "Product images must render");
  assert.equal(errors.length, 0, errors.join("\n"));
  writeFileSync(`${out}/report.json`, JSON.stringify({ base, checks, catalogAudit, profiles, imageStatus, errors }, null, 2));
  console.log(JSON.stringify({ base, checks, catalogAudit, imageStatus, errors }));
} finally { await browser.close(); }
