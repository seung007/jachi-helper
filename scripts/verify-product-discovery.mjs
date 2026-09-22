import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4174";
const browser = await chromium.launch({ headless: true });

async function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function hasHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await desktop.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
await assert(await desktop.locator("[data-product-detail]").count() >= 6, "home product detail links are missing");
await desktop.screenshot({ path: "data/exports/home-product-discovery-desktop.png", fullPage: true });

await desktop.goto(`${baseUrl}/item?id=laundry-detergent`, { waitUntil: "networkidle" });
await assert(await desktop.locator(".detergent-card").count() === 8, "detergent comparison must render eight products");
await assert(await desktop.locator(".detergent-photo").count() === 8, "detergent product images are missing");
await desktop.locator('[data-laundry-mode="workout"]').click();
await assert((await desktop.locator("#detergentExplanation").textContent()).includes("피지 오염"), "workout explanation did not render");
await desktop.locator("[data-save-detergent]").first().click();
await assert((await desktop.locator("#detergentSavedCount").textContent()).includes("1개"), "comparison save did not persist");
await desktop.screenshot({ path: "data/exports/detergent-comparison-desktop.png", fullPage: true });

const tablet = await browser.newPage({ viewport: { width: 768, height: 1024 } });
await tablet.goto(`${baseUrl}/item?id=laundry-detergent`, { waitUntil: "networkidle" });
await assert(!(await hasHorizontalOverflow(tablet)), "tablet detergent page has horizontal overflow");

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(`${baseUrl}/item?id=laundry-detergent`, { waitUntil: "networkidle" });
await assert(!(await hasHorizontalOverflow(mobile)), "mobile detergent page has horizontal overflow");
await mobile.locator("#detergentCompare").scrollIntoViewIfNeeded();
await mobile.screenshot({ path: "data/exports/detergent-comparison-mobile.png", fullPage: false });

await mobile.goto(`${baseUrl}/services`, { waitUntil: "networkidle" });
await assert(await mobile.locator("[data-service-link]").count() === 4, "service discovery must render four outbound actions");
await assert(!(await hasHorizontalOverflow(mobile)), "mobile services page has horizontal overflow");
await mobile.screenshot({ path: "data/exports/services-mobile.png", fullPage: true });

await browser.close();
console.log(JSON.stringify({
  baseUrl,
  checks: [
    "home cards link to item detail",
    "eight KCA detergent products render with images",
    "condition filter and comparison save work",
    "tablet and mobile product pages have no horizontal overflow",
    "four service actions render without mobile overflow"
  ]
}, null, 2));
