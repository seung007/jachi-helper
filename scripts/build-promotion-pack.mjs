import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const sourcePath = resolve("promotion/campaigns.json");
const outputDir = resolve("data/exports");
const config = JSON.parse(readFileSync(sourcePath, "utf8"));
const generatedAt = new Date();
const date = generatedAt.toISOString().slice(0, 10);

function trackedUrl(channel) {
  const url = new URL(config.siteUrl);
  url.searchParams.set("utm_source", channel.utmSource);
  url.searchParams.set("utm_medium", channel.utmMedium);
  url.searchParams.set("utm_campaign", config.campaign);
  return url.toString();
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

const channels = config.channels.map((channel) => ({ ...channel, url: trackedUrl(channel) }));
const markdown = [
  `# 자취도우미 홍보 초안 (${date})`,
  "",
  `생성 시각: ${generatedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
  "",
  "> 게시 전 현재 화면과 문구를 확인하세요. 이 파일은 초안이며 자동 게시하지 않습니다.",
  "",
  ...channels.flatMap((channel) => [
    `## ${channel.label}`,
    "",
    `제목: ${channel.title}`,
    "",
    channel.body,
    "",
    `${channel.cta}: ${channel.url}`,
    ""
  ])
].join("\n");

const csv = [
  ["channel", "title", "body", "cta", "url"],
  ...channels.map((channel) => [channel.label, channel.title, channel.body, channel.cta, channel.url])
].map((row) => row.map(csvCell).join(",")).join("\n");

mkdirSync(outputDir, { recursive: true });
const markdownPath = resolve(outputDir, `promotion-pack-${date}.md`);
const csvPath = resolve(outputDir, `promotion-pack-${date}.csv`);
writeFileSync(markdownPath, `${markdown}\n`, "utf8");
writeFileSync(csvPath, `${csv}\n`, "utf8");
console.log(JSON.stringify({ markdownPath, csvPath, channels: channels.length }, null, 2));
