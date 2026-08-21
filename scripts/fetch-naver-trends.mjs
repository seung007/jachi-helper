import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const endpoint = "https://openapi.naver.com/v1/datalab/search";
const configPath = resolve("data/search-groups.json");
const outputDir = resolve("data/exports");

function parseArgs(argv) {
  return Object.fromEntries(
    argv
      .filter((value) => value.startsWith("--"))
      .map((value) => {
        const [key, ...rest] = value.slice(2).split("=");
        return [key, rest.join("=") || true];
      })
  );
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function defaultStartDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 12);
  return isoDate(date);
}

function assertDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label}은 YYYY-MM-DD 형식이어야 합니다.`);
  }
}

function validateGroups(groups) {
  if (!Array.isArray(groups) || !groups.length) throw new Error("keywordGroups가 비어 있습니다.");

  groups.forEach((group) => {
    if (typeof group.groupName !== "string" || !group.groupName.trim()) throw new Error("각 그룹에는 groupName이 필요합니다.");
    if (!Array.isArray(group.keywords) || !group.keywords.length) throw new Error(`${group.groupName}: keywords가 필요합니다.`);
  });
}

function chunk(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function summarizeSeries(result) {
  const values = result.data.map((point) => Number(point.ratio)).filter(Number.isFinite);
  const windowSize = Math.min(8, Math.floor(values.length / 2));
  const recent = windowSize ? values.slice(-windowSize) : values;
  const previous = windowSize ? values.slice(-windowSize * 2, -windowSize) : [];
  const recentAverage = recent.length ? recent.reduce((sum, value) => sum + value, 0) / recent.length : null;
  const previousAverage = previous.length ? previous.reduce((sum, value) => sum + value, 0) / previous.length : null;
  const changePercent = previousAverage ? ((recentAverage - previousAverage) / previousAverage) * 100 : null;

  return {
    groupName: result.title,
    recentAverageRatio: recentAverage === null ? null : Number(recentAverage.toFixed(2)),
    previousAverageRatio: previousAverage === null ? null : Number(previousAverage.toFixed(2)),
    changePercent: changePercent === null ? null : Number(changePercent.toFixed(2)),
    direction: changePercent === null ? "insufficient_data" : changePercent >= 10 ? "rising" : changePercent <= -10 ? "falling" : "stable"
  };
}

async function fetchChunk(keywordGroups, request) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID,
      "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET
    },
    body: JSON.stringify({ ...request, keywordGroups })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`네이버 데이터랩 요청 실패 (${response.status}): ${message.slice(0, 300)}`);
  }

  return response.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("사용법: NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=... npm run fetch:naver-trends -- --start=2025-08-01 --end=2026-08-21");
    return;
  }
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    throw new Error("NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET 환경 변수가 필요합니다.");
  }

  const startDate = String(args.start || defaultStartDate());
  const endDate = String(args.end || isoDate(new Date()));
  const timeUnit = String(args.unit || "week");
  assertDate(startDate, "start");
  assertDate(endDate, "end");
  if (startDate > endDate) throw new Error("start는 end보다 빠르거나 같아야 합니다.");
  if (!["date", "week", "month"].includes(timeUnit)) throw new Error("unit은 date, week, month 중 하나여야 합니다.");

  const config = JSON.parse(await readFile(configPath, "utf8"));
  validateGroups(config.keywordGroups);
  const request = { startDate, endDate, timeUnit };
  const responses = await Promise.all(chunk(config.keywordGroups, 5).map((groups) => fetchChunk(groups, request)));
  const results = responses.flatMap((response) => response.results || []);
  const output = {
    source: "Naver DataLab Search Trend API",
    fetchedAt: new Date().toISOString(),
    request,
    note: "ratio는 각 검색어 그룹 안에서의 상대 추이입니다. 그룹 간 절대 검색량·상품 판매량·가격 비교에 사용하면 안 됩니다.",
    summaries: results.map(summarizeSeries),
    rawResults: results
  };

  await mkdir(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, `naver-search-trends-${endDate}.json`);
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`저장 완료: ${outputPath}`);
  console.table(output.summaries);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
