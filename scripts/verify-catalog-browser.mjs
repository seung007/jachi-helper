import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import D from '../comparison-display.js';

const base = process.env.BASE_URL || "http://127.0.0.1:4175";
const out = "output/playwright/catalog";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
const errors = [];
const checks = [];
const requests = [];
const chunkRequests = [];
const originalItems = Object.fromEntries(['P001', 'P080', 'P102', 'P167'].map(id => [id, JSON.parse(readFileSync(new URL(`../assets/comparison/${id}.json`, import.meta.url), 'utf8'))]));
const readyDetail = page => page.locator('#catalogDetailCandidates[data-catalog-detail-state="ready"]').waitFor();

function originalModels(group) {
  const seen = new Set();
  return group.products.filter(product => {
    if (product.eligibilityStatus !== 'verified' || !product.modelKey?.trim()) return false;
    const key = product.modelKey.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function inspectLoadedDetail(page, item, group, limit = 6) {
  const models = originalModels(group);
  const offers = page.locator('#catalogDetailCandidates .catalog-offer');
  const ids = await offers.evaluateAll(nodes => nodes.map(node => node.dataset.productId));
  assert.deepEqual(ids, models.slice(0, limit).map(product => product.id), `${item.id}: distinct eligible original models, not option duplicates`);
  assert.match(await page.locator('#catalogDetailSummary').innerText(), new RegExp(`${models.length}개 모델`));
  for (const product of models.slice(0, limit)) {
    const node = page.locator(`#catalogDetailCandidates .catalog-offer[data-product-id="${product.id}"]`);
    assert.equal(await node.locator('h4').textContent(), product.name);
    const source = new URL(product.url);
    const exact = ['coupang.com', 'www.coupang.com', 'm.coupang.com'].includes(source.hostname) && /^\/vp\/products\/\d+(?:\/|$)/.test(source.pathname);
    const link = node.locator('[data-link-role="coupang"]');
    assert.equal(await link.getAttribute('data-item-id'), product.id);
    assert.equal(await link.getAttribute('data-coupang-kind'), exact ? 'product' : 'search');
    if (exact) {
      assert.equal(await link.getAttribute('href'), product.url);
      assert.match(await link.innerText(), /쿠팡에서 보기/);
    } else {
      const search = new URL(await link.getAttribute('href'));
      assert.equal(search.hostname, 'www.coupang.com');
      assert.equal(search.pathname, '/np/search');
      assert.equal(search.searchParams.get('q'), group.label || item.title);
      assert.notEqual(search.searchParams.get('q'), product.name);
      assert.match(await link.innerText(), /쿠팡 유사상품 검색/);
      assert.equal(await node.locator('[data-source-link]').textContent(), '원래 상품 보기');
      assert.ok(await node.evaluate(el => Boolean(el.querySelector('[data-source-link]').compareDocumentPosition(el.querySelector('[data-link-role="coupang"]')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'Original product precedes alternative search');
    }
    assert.equal(await node.locator('[data-source-link]').getAttribute('href'), product.url);
    const rows = node.locator('[data-detail-key]');
    assert.ok(await rows.count() <= 4);
    for (const row of await rows.all()) {
      const key = await row.getAttribute('data-detail-key');
      const observation = product.attributes[key];
      const state = await row.getAttribute('data-detail-state');
      if (state === 'verified') {
        assert.equal(observation?.status, 'verified', `${product.id}/${key}: original observation`);
        const full = row.locator('.catalog-meta-full p');
        const text = await (await full.count() ? full : row.locator('dd > span')).textContent();
        const expected = String(observation.value) + (observation.unit ? ` ${observation.unit}` : '');
        assert.equal(text, expected, `${product.id}/${key}: original value/unit rather than D-only oracle`);
        assert.equal(await row.locator('[data-fact-source]').getAttribute('href'), observation.sourceUrl);
        const definition = group.attributeDefinitions.find(definition => definition.key === key);
        if (definition) assert.equal(await row.locator('dt').textContent(), D.describe(item, group).find(d => d.key === key)?.label || definition.label, `${product.id}/${key}: localized field label, original key/value retained`);
      } else if (state === 'unknown') assert.equal(await row.locator('dd > span').textContent(), '미확인');
    }
  }
  assert.equal(new URL(await page.locator('#catalogDetailCompare').getAttribute('href'), base).searchParams.get('group'), group.id);
}
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
    for (const offer of document.querySelectorAll('.catalog-offer')) sequential(offer, '.catalog-offer-top, [data-store-link]');
    for (const el of document.querySelectorAll('.catalog-card-content, .catalog-card h3, .catalog-product-details dt, .catalog-product-details dd, .catalog-card-purchase a, .catalog-card-actions a, .catalog-source-link, .catalog-buy-link, .catalog-offer h4, #catalogDetailPreview button, #catalogDetailPreview span')) {
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
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    requests.push(path);
    if (path.startsWith('/assets/comparison/')) chunkRequests.push({ path, selected: new URL(page.url()).searchParams.get('item') });
  });
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
    let productItems = 0, guidanceItems = 0, direct = 0, search = 0;
    const check = (condition, message) => { if (!condition) failures.push(message); };
    function inspectLink(parent, product, item, placement) {
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
        check(url.hostname === 'www.coupang.com' && url.pathname === '/np/search' && url.searchParams.get('q') === item.title.trim() && link.textContent.includes('쿠팡 유사상품 검색'), `${product.id}: labeled category search, not full product name`);
        check(url.searchParams.get('q') !== product.name.trim(), `${product.id}: search independent of product full name`);
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
        inspectLink(card, product, item, 'catalog_card');
        inspectDetails(card, item, product);
      }
      if (item.kind === 'guidance') {
        card.querySelector('[data-open]').click();
        const dialog = document.querySelector('#catalogDetail');
        check(dialog.open && dialog.querySelector('h2').textContent === item.title, `${item.id}: correct guidance detail`);
        check(!dialog.querySelector('[data-store-link], [data-detail-key], .catalog-detail-criteria, .catalog-offer'), `${item.id}: guidance exempt from shopping details`);
        history.replaceState(null, '', '/#catalog');
        document.querySelector('#catalogClose').click();
        check(!dialog.open, `${item.id}: synchronous close after direct navigation`);
      }
    }
    return { productItems, guidanceItems, direct, search, failures };
  });
  assert.deepEqual(catalogAudit.failures, []);
  assert.equal(catalogAudit.productItems, 210);
  assert.equal(catalogAudit.guidanceItems, 3);
  assert.ok(catalogAudit.direct > 0 && catalogAudit.search > 0);
  assert.deepEqual(chunkRequests, [], 'Home and all cards/guidance must not load any item JSON');
  checks.push('all 210 initial card links: exact Coupang SKU or category search, tracked original source, max-four details; all 3 guidance exceptions; no initial item JSON');
  for (const [id, count] of [['P080', 6], ['P001', 12], ['P102', 8], ['P167', 6]]) {
    const item = originalItems[id];
    const group = item.groups.find(group => originalModels(group).length >= 2) || item.groups[0];
    assert.equal(originalModels(group).length, count, `${id}: known original local model count`);
    await page.goto(`${base}/?item=${id}#catalog`, { waitUntil: 'domcontentloaded' });
    await readyDetail(page);
    await inspectLoadedDetail(page, item, group);
    assert.equal(await page.locator('#catalogDetailCandidates .catalog-offer').count(), 6);
    if (id === 'P080') {
      assert.match(await page.locator('#catalogDetailSourceScope').innerText(), /ikea\.com/);
      assert.equal(await page.locator('[data-catalog-more-products]').isVisible(), false);
      const previews = page.locator('#catalogDetailPreview [data-jump-product]');
      assert.equal(await previews.count(), 6, 'All six real towel models have a top photo button');
      const previewIds = await previews.evaluateAll(nodes => nodes.map(node => node.dataset.jumpProduct));
      assert.deepEqual(previewIds, originalModels(group).map(product => product.id));
      for (const product of originalModels(group)) {
        const photo = page.locator(`#catalogDetailPreview [data-jump-product="${product.id}"] img`);
        assert.equal(await photo.getAttribute('src'), product.imageUrl, `${product.id}: thumbnail matches original source model`);
        await photo.scrollIntoViewIfNeeded();
        await photo.evaluate(img => img.decode());
        assert.ok(await photo.evaluate(img => img.complete && img.naturalWidth > 0), `${product.id}: thumbnail renders actual pixels`);
      }
      assert.equal(await page.locator('#catalogDetailCandidates [data-detail-key="induction"], #catalogDetailCandidates [data-detail-key="gas"], #catalogDetailCandidates [data-detail-key="servings"]').count(), 0, 'Towel details never inherit cookware fields');
      const towel = page.locator('#catalogDetailCandidates [data-product-id="P080-01"]');
      assert.equal(await towel.locator('[data-detail-key="size"] dd > span').textContent(), '40x70 cm');
      assert.equal(new URL(await towel.locator('[data-link-role="coupang"]').getAttribute('href')).searchParams.get('q'), '수건');
      await previews.last().click();
      assert.ok(await page.locator('#catalogDetail').evaluate(el => el.open), 'Thumbnail jump never closes the detail');
      const lastId = previewIds.at(-1);
      const target = page.locator(`[id="catalog-offer-${lastId}"]`);
      await target.waitFor({ state: 'visible' });
      await page.waitForFunction(id => {
        const dialog = document.querySelector('#catalogDetail').getBoundingClientRect();
        const offer = document.getElementById(`catalog-offer-${id}`).getBoundingClientRect();
        return offer.top >= dialog.top && offer.top < dialog.bottom;
      }, lastId);
      await page.locator('#catalogDetail').evaluate(el => { el.scrollTop = 0; });
      await page.screenshot({ path: `${out}/towel-models.png` });
      checks.push('P080: six source-matched top photos render, thumbnail scroll keeps detail open, no cookware fields, IKEA-only scope disclosed');
    } else if (count > 6) {
      await page.locator('[data-catalog-more-products]').click();
      await inspectLoadedDetail(page, item, group, count);
      assert.equal(await page.locator('#catalogDetailCandidates .catalog-offer').count(), count);
      assert.equal(await page.locator('[data-catalog-more-products]').isVisible(), false);
    }
    const other = item.groups.find(candidate => candidate.id !== group.id);
    if (other) {
      await page.locator('[data-catalog-group]').selectOption(other.id);
      await inspectLoadedDetail(page, item, other);
      assert.equal(await page.locator('#catalogDetailCandidates .catalog-offer').count(), Math.min(6, originalModels(other).length));
      if (!originalModels(other).length) {
        assert.equal(await page.locator('#catalogDetailPreview [data-jump-product]').count(), 0, 'Empty purpose must not retain old model photos');
        assert.ok(await page.locator('#catalogDetailMore').isHidden());
        assert.match(await page.locator('#catalogDetailCandidates').innerText(), /확인된 후보가 아직 없습니다/);
        await page.locator('[data-catalog-group]').selectOption(group.id);
        await inspectLoadedDetail(page, item, group);
      }
      checks.push(`${id}: real purpose change resets candidates and search context`);
    } else checks.push(`${id}: original chunk has one purpose, no invented purpose-change fixture`);
    checks.push(`${id}: first six eligible models${count > 6 ? `, more reveals all ${count}` : ''}; original values, source labels, exact SKU/purpose links`);
  }
  for (const [width, height] of [[320,720], [360,800], [390,844], [768,1024], [1024,768], [1440,1000]]) {
    await page.setViewportSize({ width, height });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator(".catalog-card").first().waitFor();
    await page.locator(".catalog-card img").first().waitFor({ timeout: 10000 });
    await page.waitForFunction(() => { const img = document.querySelector('.catalog-card img'); return img?.complete && img.naturalWidth > 0; }, null, { timeout: 20000 });
    const sizes = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(sizes.scroll <= sizes.viewport + 1, `${width}: overflow ${JSON.stringify(sizes)}`);
    const first = page.locator(".catalog-card").first();
    const cardMedia = await first.locator('.catalog-card-visual').boundingBox();
    assert.ok(Math.abs(cardMedia.width - cardMedia.height) <= 1, `${width}: square card photo`);
    assert.ok(await first.locator('[data-link-role="coupang"]').isVisible());
    if (width === 390) assert.ok((await first.boundingBox()).y < 500, "Products should appear before 500px on mobile");
    await page.locator('#catalogAll').click();
    await checkLayout(page, `${width}px all 213 cards`);
    await first.locator("[data-open]").first().click();
    await page.locator("#catalogDetail[open]").waitFor();
    await readyDetail(page);
    const detail = await page.locator("#catalogDetail").evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    assert.ok(detail.scroll <= detail.width + 1, `${width}: dialog overflow`);
    assert.ok(await page.locator(".catalog-buy-link").count() > 0);
    await checkLayout(page, `${width}px detail`);
    const photoButton = page.locator('#catalogDetailCandidates [data-open-photo]').first();
    await photoButton.locator('img').evaluate(img => img.decode());
    const photoBox = await photoButton.boundingBox();
    assert.ok(Math.abs(photoBox.width - photoBox.height) <= 2, `${width}: full square product photo`);
    const originalPhoto = await photoButton.locator('img').getAttribute('src');
    await photoButton.click();
    const viewer = page.locator('.catalog-photo-dialog[open]');
    await viewer.waitFor();
    await viewer.locator('img').evaluate(img => img.decode());
    assert.equal(await viewer.locator('img').getAttribute('src'), originalPhoto, 'Zoom uses same original product photo');
    assert.equal(await viewer.locator('.catalog-icon path, .catalog-icon circle').count() > 0, true, 'Viewer close icon renders');
    const viewerBox = await viewer.boundingBox();
    assert.ok(viewerBox.x >= 0 && viewerBox.x + viewerBox.width <= width + 1 && viewerBox.y >= 0 && viewerBox.y + viewerBox.height <= height + 1, `${width}: photo viewer stays inside viewport`);
    assert.ok(await viewer.locator('img').evaluate(img => img.naturalWidth > 0 && getComputedStyle(img).objectFit === 'contain'), 'Photo viewer has nonblank uncropped image');
    if ([390,1440].includes(width)) await page.screenshot({path:`${out}/photo-${width}.png`});
    if (width === 390) {
      await viewer.locator('img').evaluate(img => { img.src = '/missing-product-photo-for-test.jpg'; });
      await viewer.locator('[role="status"]').waitFor();
      assert.match(await viewer.innerText(), /사진을 불러오지 못했습니다/);
    }
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('#catalogDetail').evaluate(el => el.open), 'Closing photo preserves product detail');
    assert.ok(await photoButton.evaluate(el => el === document.activeElement), 'Photo close restores original focus');
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
  await page.locator('[data-category="가전"]').click();
  await page.locator('#catalogQuery').fill('수건');
  await page.locator('#catalogQuery').press('Enter');
  assert.equal(await page.locator('#catalogSubgroup').inputValue(), 'all');
  assert.equal(await page.locator('[data-category="all"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.catalog-card[data-item="P080"]').count(), 1, 'Main search searches all retained items despite previous category');
  assert.match(await page.locator('#catalogHeading').innerText(), /수건.*검색 결과/);
  assert.equal(new URL(page.url()).searchParams.has('category'), false);
  checks.push('Main search resets old category/subgroup/saved filter and labels real catalog results, not Coupang ranking');
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
      const source = product && new URL(product.url);
      const exact = source && ['coupang.com', 'www.coupang.com', 'm.coupang.com'].includes(source.hostname) && /^\/vp\/products\/\d+(?:\/|$)/.test(source.pathname);
      const url = link && new URL(link.href);
      return product && (exact ? link?.href === source.href : url?.hostname === 'www.coupang.com' && url.pathname === '/np/search' && url.searchParams.get('q') === item.title && link.textContent.includes('쿠팡 유사상품 검색')) &&
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
  assert.deepEqual(requests.filter(path => /\/(?:comparison-data|comparison-index)\.js$|\/data\/exports\//.test(path)), [], 'Catalog/document pages must not load aggregate, comparison index or private exports');
  assert.ok(chunkRequests.length > 0, 'Selected detail uses real item JSON');
  for (const { path, selected } of chunkRequests) assert.equal(path, `/assets/comparison/${selected}.json`, 'Only the selected detail item JSON may load');
  const fixture = await context.newPage();
  fixture.on('pageerror', error => errors.push(error.message));
  let blockItem = true;
  let releaseBlockedItem;
  const blockedItem = new Promise(resolve => { releaseBlockedItem = resolve; });
  const fixtureRequests = [];
  fixture.on('request', request => fixtureRequests.push(new URL(request.url()).pathname));
  await fixture.route(/\/assets\/comparison\//, async route => {
    if (blockItem) { await blockedItem; await route.abort(); }
    else await route.continue();
  });
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
  await fixture.locator('#catalogDetailCandidates[data-catalog-detail-state="loading"]').waitFor();
  assert.equal(await fixture.locator('#catalogDetailCandidates [data-detail-key="amount"] dd > span').innerText(), '0g', 'Original offer remains visible while selected JSON is pending');
  releaseBlockedItem();
  await fixture.locator('#catalogDetailCandidates[data-catalog-detail-state="error"]').waitFor();
  assert.equal(await fixture.locator('#catalogDetailBody [data-detail-key="amount"] dd > span').innerText(), '0g');
  assert.ok(await fixture.locator('#catalogDetailRetry').isVisible(), 'Failed item JSON preserves the original offer and provides retry');
  assert.match(await fixture.locator('#catalogDetailSummary').innerText(), /불러오지 못했습니다/);
  blockItem = false;
  await fixture.locator('#catalogDetailRetry').click();
  await readyDetail(fixture);
  await inspectLoadedDetail(fixture, originalItems.P001, originalItems.P001.groups[0]);
  assert.equal(await fixture.locator('#catalogDetailCandidates [data-product-id="P001-01"] [data-detail-key="amount"] dd > span').textContent(), '210 g', 'Retry replaces fallback zero with original loaded product data');
  checks.push('Item JSON failure retains fallback facts and retry recovers six real models without recollection');
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
  assert.deepEqual(fixtureRequests.filter(path => /\/(?:comparison-data|comparison-index)\.js$|\/data\/exports\//.test(path)), []);
  assert.deepEqual([...new Set(fixtureRequests.filter(path => path.startsWith('/assets/comparison/')))], ['/assets/comparison/P001.json']);
  await fixture.close();
  const failedPhotos = await browser.newPage({viewport:{width:390,height:844}});
  failedPhotos.on('pageerror', error => errors.push(error.message));
  await failedPhotos.route(/google-analytics\.com|googletagmanager\.com|\/insights\//, route => route.abort());
  await failedPhotos.route('**/images/products/**', route => route.abort());
  await failedPhotos.goto(`${base}/?q=${encodeURIComponent('수건')}`, {waitUntil:'domcontentloaded'});
  await failedPhotos.locator('.catalog-card-visual .catalog-photo-unavailable').waitFor();
  const failedCard = await failedPhotos.locator('.catalog-card-visual').boundingBox();
  assert.ok(Math.abs(failedCard.width - failedCard.height) <= 1, 'Failed card image retains square dimensions');
  await failedPhotos.locator('.catalog-card [data-open]').first().click();
  await readyDetail(failedPhotos);
  await failedPhotos.locator('#catalogDetailCandidates .catalog-photo-open:disabled').first().waitFor();
  for (const button of await failedPhotos.locator('#catalogDetailCandidates .catalog-photo-open').all()) {
    await button.scrollIntoViewIfNeeded();
    await button.locator('.catalog-photo-unavailable').waitFor();
  }
  await failedPhotos.waitForFunction(() => document.querySelectorAll('#catalogDetailPreview img').length === 0);
  assert.equal(await failedPhotos.locator('#catalogDetailPreview [data-jump-product] .catalog-photo-unavailable').count(), 6, 'All six failed thumbnails retain placeholders, not unrelated pictures');
  assert.equal(await failedPhotos.locator('#catalogDetailCandidates [data-open-photo]').count(), 0, 'Failed photos do not offer broken zoom actions');
  assert.equal(await failedPhotos.locator('.catalog-item-example').count(), 0, 'No unrelated collage fallback');
  await checkLayout(failedPhotos, '390px missing product photos');
  await failedPhotos.screenshot({path:`${out}/photo-errors-390.png`});
  const towelLegacyId = await failedPhotos.evaluate(() => window.ProductCatalog.items.find(item => item.id === 'P080').existingIds[0]);
  if (towelLegacyId) {
    await failedPhotos.goto(`${base}/item?id=${encodeURIComponent(towelLegacyId)}`, {waitUntil:'domcontentloaded'});
    await failedPhotos.locator('[data-catalog-related] .catalog-photo-unavailable').first().waitFor();
    assert.equal(await failedPhotos.locator('[data-catalog-related] img').count(), 0, 'Related product photos use the same stable error treatment');
    await checkLayout(failedPhotos, '390px related item photo failure');
  }
  await failedPhotos.close();
  checks.push('Six-width square images and original-photo zoom; Escape returns focus/detail; image errors retain stable placeholders with no unrelated collage');
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator(".catalog-card").first().waitFor();
  await page.locator(".catalog-card img").first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.catalog-card img')).some(img => img.complete && img.naturalWidth > 0), null, { timeout: 20000 });
  const imageStatus = await page.locator(".catalog-card img").evaluateAll(images => ({ shown: images.length, loaded: images.filter(img => img.complete && img.naturalWidth > 0).length }));
  assert.ok(imageStatus.loaded > 0, "Product images must render");
  assert.equal(errors.length, 0, errors.join("\n"));
  writeFileSync(`${out}/report.json`, JSON.stringify({ base, checks, catalogAudit, chunkRequests, profiles, imageStatus, errors }, null, 2));
  console.log(JSON.stringify({ base, checks, catalogAudit, imageStatus, errors }));
} finally { await browser.close(); }
