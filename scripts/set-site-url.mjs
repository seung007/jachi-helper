import { readFileSync, writeFileSync } from "node:fs";

const siteUrl = process.argv[2]?.replace(/\/$/, "");

if (!siteUrl || !/^https:\/\/[a-z0-9.-]+/.test(siteUrl)) {
  console.error("usage: npm run set-site-url -- https://your-site.vercel.app");
  process.exit(1);
}

const files = ["index.html", "checklist.html", "budget.html", "robots.txt", "sitemap.xml"];

for (const file of files) {
  const next = readFileSync(file, "utf8").replaceAll("https://jachi-helper.vercel.app", siteUrl);
  writeFileSync(file, next);
}

console.log(`Updated SEO URLs to ${siteUrl}`);
