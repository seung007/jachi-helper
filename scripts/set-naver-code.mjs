import { readFileSync, writeFileSync } from "node:fs";

const code = process.argv[2];

if (!code || code.length < 8) {
  console.error("usage: npm run set-naver-code -- your-verification-code");
  process.exit(1);
}

const files = ["index.html", "checklist.html", "budget.html"];

for (const file of files) {
  const html = readFileSync(file, "utf8").replaceAll("REPLACE_WITH_NAVER_VERIFICATION_CODE", code);
  writeFileSync(file, html);
}

console.log("Updated Naver site verification code");
