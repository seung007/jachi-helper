import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4174";
const shouldVerifyGa4 = new URL(baseUrl).protocol === "https:";
const browserPath = process.env.BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const outputDir = resolve("artifacts/growth-flow");
mkdirSync(outputDir, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertNoHorizontalOverflow(page, label) {
  const sizes = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  assert(sizes.scrollWidth <= sizes.innerWidth + 1, `${label}: horizontal overflow ${sizes.scrollWidth}px > ${sizes.innerWidth}px`);
}

async function waitForRoute(page, pathname, search = "") {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const current = new URL(page.url());
    if (current.pathname === pathname && (!search || current.search === search)) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`route timeout: expected ${pathname}${search}, received ${page.url()}`);
}

const browser = await chromium.launch({ headless: true, executablePath: browserPath });
const report = { baseUrl, checks: [] };

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ga4Requests = [];
  let ga4SuccessCount = 0;
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname.endsWith("google-analytics.com") && url.pathname === "/g/collect") {
      const measurementId = url.searchParams.get("tid");
      const eventName = url.searchParams.get("en");
      if (eventName) ga4Requests.push({ measurementId, eventName });
      for (const line of (request.postData() || "").split("\n")) {
        const body = new URLSearchParams(line);
        const batchedEventName = body.get("en");
        if (batchedEventName) ga4Requests.push({ measurementId: body.get("tid") || measurementId, eventName: batchedEventName });
      }
    }
  });
  context.on("response", (response) => {
    const url = new URL(response.url());
    if (url.hostname.endsWith("google-analytics.com") && url.pathname === "/g/collect" && response.status() === 204) {
      ga4SuccessCount += 1;
    }
  });
  async function waitForGa4Event(eventName) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (ga4Requests.some((entry) => entry.eventName === eventName)) return;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
    throw new Error(`GA4 event timeout: ${eventName}`);
  }
  await context.addInitScript(() => {
    const dataLayer = [];
    const nativePush = dataLayer.push.bind(dataLayer);
    dataLayer.push = (...entries) => {
      const stored = JSON.parse(sessionStorage.getItem("growth-flow-events") || "[]");
      for (const entry of entries) {
        if (entry?.[0] === "event" && entry?.[1]) stored.push(entry[1]);
      }
      sessionStorage.setItem("growth-flow-events", JSON.stringify(stored));
      return nativePush(...entries);
    };
    window.dataLayer = dataLayer;
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  if (shouldVerifyGa4) {
    await page.waitForFunction(() => Boolean(window.google_tag_manager), null, { timeout: 10_000 });
  }

  const homeText = await page.locator("main").innerText();
  assert(!/골라봐|이 결과로/.test(homeText), "home copy must be polite and describe the next action clearly");

  assert(await page.locator("#homeCatalogQuery").isVisible(), "home must expose preparation-item search in the first flow");
  assert(await page.locator("#homeCategoryTabs button").count() === 8, "home must expose all preparation-item categories");
  assert(await page.locator("#homePreviewList .home-preview-item").count() === 6, "home must render six preview items");
  assert(await page.locator("#homePreviewList [data-store-link]").count() > 0, "home preview items must link to current store searches");
  assert(!(await page.locator("#homeCatalogSort").innerText()).includes("최저가"), "home must not claim lowest-price sorting without official product data");
  assert(!(await page.locator("[data-plan-results-link]").isVisible()), "empty home must hide the result navigation link");
  assert(await page.getByRole("link", { name: "데이터 이용 안내" }).isVisible(), "home must link to the data-use guide");
  report.checks.push("home renders a searchable six-item catalog with store searches and no fabricated price ranking");

  await page.getByLabel("요리를 자주 해요").check();
  if (shouldVerifyGa4) await waitForGa4Event("home_demo_select");
  const cookingTitles = await page.locator("#homePreviewList h3").allTextContents();
  assert(cookingTitles.join("|") === "음식물·종량제 봉투|수저·젓가락|냄비|프라이팬|접시·컵|밀폐용기", "cooking preset did not change all six preview items");
  const cookingStatuses = await page.locator("#homePreviewList .home-preview-meta b").allTextContents();
  assert(cookingStatuses.every((label) => /지금 필요|조건 확인|나중에/.test(label)), "home preview must explain purchase timing");
  const demoHref = await page.locator("#homePreviewCta").getAttribute("href");
  assert(demoHref === "/checklist?homePreset=cooking", "home preset was not attached to the checklist CTA");
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(outputDir, "desktop-home.png"), fullPage: true });
  report.checks.push("home cooking preset changes the preview and carries its value into the CTA");

  await page.locator("#homePreviewCta").click({ noWaitAfter: true });
  await waitForRoute(page, "/checklist", "?homePreset=cooking");
  if (shouldVerifyGa4) {
    await page.waitForFunction(() => Boolean(window.google_tag_manager), null, { timeout: 10_000 });
    await waitForGa4Event("home_cta_click");
  }
  assert(await page.getByLabel("자주 해요", { exact: true }).first().isChecked(), "home cooking preset was not applied on the checklist");
  assert((await page.locator("#checklistStorageNote").innerText()).includes("30일"), "purchase-plan storage note must say thirty days");
  assert(await page.locator("[data-plan-results-link]").isVisible(), "saved preset must make the result navigation available");

  const expiryDistance = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("jachi-helper:v1") || "{}");
    return Number(state.purchasePlanExpiresAt) - Date.now();
  });
  assert(expiryDistance > 29.9 * 24 * 60 * 60 * 1000, "purchase-plan cache must last approximately thirty days");
  report.checks.push("home preset is stored locally for thirty days and unlocks the result route");

  await page.getByLabel("실내 건조").check();
  await page.getByLabel("넉넉하지 않아요").check();
  await page.locator(".owned-picker summary").click();
  await page.locator("#ownedSearch").fill("수건");
  await page.getByLabel("수건", { exact: true }).check();
  if (shouldVerifyGa4) await waitForGa4Event("plan_step_complete");

  await page.getByRole("button", { name: "내 구매 계획 보기" }).click({ noWaitAfter: true });
  await waitForRoute(page, "/recommend");
  if (shouldVerifyGa4) {
    await page.waitForFunction(() => Boolean(window.google_tag_manager), null, { timeout: 10_000 });
    await waitForGa4Event("plan_complete");
    await waitForGa4Event("recommend_result_view");
  }
  assert(await page.locator("#recommendationResultSection").isVisible(), "completed plan must show recommendation results");
  assert(await page.locator(".match-card").count() > 0, "recommendation results must contain decision cards");
  await page.getByRole("button", { name: "필요함" }).first().click();
  if (shouldVerifyGa4) await waitForGa4Event("recommendation_decision");
  const decisionCount = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("jachi-helper:v1") || "{}");
    return Object.keys(state.recommendationDecisions || {}).length;
  });
  assert(decisionCount === 1, "a recommendation decision must be saved");
  await page.getByRole("button", { name: "빠진 준비물이 있어요" }).click();
  await page.getByRole("button", { name: "주방", exact: true }).click();
  const recommendationFeedback = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("jachi-helper:v1") || "{}");
    return state.recommendationFeedback;
  });
  assert(recommendationFeedback?.type === "missing" && recommendationFeedback?.reason === "kitchen", "recommendation feedback must be stored with a reason");
  if (shouldVerifyGa4) await waitForGa4Event("recommend_feedback");
  const eventNames = await page.evaluate(() => JSON.parse(sessionStorage.getItem("growth-flow-events") || "[]"));
  const requiredEvents = ["home_demo_select", "home_cta_click", "plan_start", "plan_step_complete", "plan_complete", "recommend_result_view", "recommendation_decision", "recommend_feedback"];
  for (const name of requiredEvents) {
    assert(eventNames.includes(name), `missing analytics event in the tested funnel: ${name}`);
  }
  if (shouldVerifyGa4) {
    const ga4EventNames = [...new Set(ga4Requests.map(({ eventName }) => eventName).filter(Boolean))];
    const ga4MeasurementIds = [...new Set(ga4Requests.map(({ measurementId }) => measurementId).filter(Boolean))];
    assert(ga4MeasurementIds.length === 1 && ga4MeasurementIds[0] === "G-2N6W41XSD2", `unexpected GA4 measurement ID: ${ga4MeasurementIds.join(", ")}`);
    for (const name of requiredEvents) {
      assert(ga4EventNames.includes(name), `missing outbound GA4 event: ${name}; observed ${ga4EventNames.join(", ")}`);
    }
    report.ga4 = { measurementIds: ga4MeasurementIds, events: ga4EventNames, successfulRequests: ga4SuccessCount };
  }
  await page.screenshot({ path: resolve(outputDir, "desktop-result.png"), fullPage: true });
  report.checks.push("completed plan renders results, stores one decision and feedback, and emits the full funnel events");
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  assert((await page.locator("#heroPrimaryCta").innerText()) === "지난 구매 계획 이어보기", "completed users must receive a clear return path on home");
  assert((await page.locator("#heroPrimaryCta").getAttribute("href")) === "/recommend", "completed users must resume at their saved result");
  assert((await page.locator("#homeResumeNote").innerText()).includes("필요함 1개"), "completed users must see saved-plan progress on home");
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(outputDir, "desktop-return-home.png"), fullPage: true });
  report.checks.push("completed users see a saved-plan resume action when they return home");
  await context.close();

  const emptyContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const emptyPage = await emptyContext.newPage();
  await emptyPage.goto(`${baseUrl}/recommend`, { waitUntil: "domcontentloaded" });
  assert(await emptyPage.locator("#recommendationStart").isVisible(), "direct result visit without state must show the start state");
  assert(!(await emptyPage.locator("#recommendationResultSection").isVisible()), "direct result visit without state must not show fabricated results");
  report.checks.push("empty result visits never fabricate a purchase plan");
  await emptyContext.close();

  for (const viewport of [
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    const responsiveContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const responsivePage = await responsiveContext.newPage();
    await responsivePage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await responsivePage.waitForTimeout(800);
    await assertNoHorizontalOverflow(responsivePage, viewport.name);
    assert(await responsivePage.locator("#homePreviewList .home-preview-item").count() === 6, `${viewport.name}: preview cards are missing`);
    await responsivePage.screenshot({ path: resolve(outputDir, `${viewport.name}-home.png`), fullPage: true });
    report.checks.push(`${viewport.name} home has no horizontal overflow`);
    await responsiveContext.close();
  }
} finally {
  await browser.close();
}

writeFileSync(resolve(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
