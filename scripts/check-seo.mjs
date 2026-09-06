import { readFileSync, existsSync, statSync } from "node:fs";

const requiredFiles = ["index.html", "checklist.html", "budget.html", "recommend.html", "data-policy.html", "assets/jachi-studio-hero-v2.webp", "assets/checklist-categories-hero.webp", "assets/checklist-categories-card.webp", "robots.txt", "sitemap.xml", "vercel.json"];
const pages = ["index.html", "checklist.html", "budget.html", "recommend.html", "data-policy.html"];
let failed = false;

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    console.error(`missing ${file}`);
    failed = true;
  }
}

for (const page of pages) {
  const html = readFileSync(page, "utf8");
  const checks = [
    ["title", /<title>[^<]+<\/title>/],
    ["description", /<meta\s+name="description"\s+content="[^"]+"/],
    ["canonical", /<link\s+rel="canonical"\s+href="https:\/\/[^"]+"/],
    ["naver verification", /<meta\s+name="naver-site-verification"\s+content="[^"]+"/],
    ["google verification", /<meta\s+name="google-site-verification"\s+content="[^"]+"/],
    ["og title", /<meta\s+property="og:title"\s+content="[^"]+"/],
    ["og image", /<meta\s+property="og:image"\s+content="https:\/\/[^"]+"/],
    ["Vercel Analytics", /<script\s+defer\s+src="\/_vercel\/insights\/script\.js"><\/script>/],
    ["Google Analytics", /googletagmanager\.com\/gtag\/js\?id=G-2N6W41XSD2/]
  ];

  for (const [label, pattern] of checks) {
    if (!pattern.test(html)) {
      console.error(`${page}: missing ${label}`);
      failed = true;
    }
  }
}

const robots = readFileSync("robots.txt", "utf8");
const sitemap = readFileSync("sitemap.xml", "utf8");
const app = readFileSync("app.js", "utf8");
const home = readFileSync("index.html", "utf8");
const styles = readFileSync("styles.css", "utf8");
if (!/Sitemap:\s*https:\/\//.test(robots)) {
  console.error("robots.txt: sitemap must be absolute https URL");
  failed = true;
}
if (!/<loc>https:\/\/[^<]+<\/loc>/.test(sitemap)) {
  console.error("sitemap.xml: loc must be absolute https URL");
  failed = true;
}

for (const asset of ["assets/jachi-studio-hero-v2.webp", "assets/checklist-categories-hero.webp", "assets/checklist-categories-card.webp"]) {
  if (existsSync(asset) && statSync(asset).size > 200_000) {
    console.error(`${asset}: optimized image must stay below 200 KB`);
    failed = true;
  }
}
if (!styles.includes("jachi-studio-hero-v2.webp") || !styles.includes("checklist-categories-hero.webp") || !styles.includes("checklist-categories-card.webp")) {
  console.error("styles.css: home must use the optimized WebP assets");
  failed = true;
}

for (const eventName of ["home_cta_click", "plan_step_complete", "recommend_result_view", "recommendation_decision", "recommend_feedback"]) {
  if (!app.includes(`trackAnalyticsEvent(\"${eventName}\"`) && !app.includes(`queueAnalyticsEvent(\"${eventName}\"`)) {
    console.error(`app.js: missing funnel event ${eventName}`);
    failed = true;
  }
}

const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
if (!vercel.redirects?.some(({ source, destination }) => source === "/planner" && destination === "/checklist")) {
  console.error("vercel.json: /planner must redirect to /checklist");
  failed = true;
}

for (const rejectedCopy of ["골라봐", "이 결과로"]) {
  if (home.includes(rejectedCopy)) {
    console.error(`index.html: unclear or impolite home copy ${rejectedCopy}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("SEO checks passed");
