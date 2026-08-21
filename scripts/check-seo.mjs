import { readFileSync, existsSync } from "node:fs";

const requiredFiles = ["index.html", "planner.html", "checklist.html", "budget.html", "robots.txt", "sitemap.xml", "vercel.json"];
const pages = ["index.html", "planner.html", "checklist.html", "budget.html"];
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
    ["og image", /<meta\s+property="og:image"\s+content="https:\/\/[^"]+"/]
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
if (!/Sitemap:\s*https:\/\//.test(robots)) {
  console.error("robots.txt: sitemap must be absolute https URL");
  failed = true;
}
if (!/<loc>https:\/\/[^<]+<\/loc>/.test(sitemap)) {
  console.error("sitemap.xml: loc must be absolute https URL");
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log("SEO checks passed");
