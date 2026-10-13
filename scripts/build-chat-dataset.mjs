import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(import.meta.dirname, "..");
const exportRoot = resolve(projectRoot, "data/exports");

const questionPattern = /[?？]|혹시|어떻게|추천|뭐가|뭘 |어떤 |할까요|되나요|해야|있나요|괜찮나|좋을까요|어디서/;
const topicPatterns = {
  contract: /보증금|전세|월세|계약|중개|집주인|임대인|확정일자|전입신고|등기부|신탁|특약|청년주택|집 구|방 구|매물/,
  bills_support: /관리비|전기세|가스비|수도세|공과금|월세지원|청년월세|주거급여|난방비|전기요금|대출/,
  moving_services: /이사|입주|퇴실|용달|청소업체|입주청소|폐기물|인터넷 설치|인터넷 가입/,
  repairs: /누수|곰팡이|바퀴|벌레|방역|고장|수리|A\/S|세탁기|에어컨|보일러|배수구|싱크대|변기|환풍기/,
  chores: /청소|빨래|세제|건조|쓰레기|종량제|분리수거|음식물|환기|습도/,
  furnishing: /침대|매트리스|이불|베개|책상|의자|서랍|수납|커튼|행거|가구|조명|제습기|청소기|냉장고|전자레인지|인덕션|에어프라이어/
};
const intentPatterns = {
  next_action: /어떻게|방법|해야|뭐부터|어디서|누구한테|연락/,
  choose: /뭐가|어떤|어느|둘 중|비교|고르|선택|나을까요|좋을까요/,
  product_request: /추천|브랜드|제품|상품|구매|사야|살까/,
  cost_check: /얼마|비용|가격|예산|관리비|월세|전기세|대출/,
  service_request: /업체|용달|기사|신청|예약|서비스/
};

function isoDate(year, month, day) {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function twentyFourHour(period, hour, minute) {
  const hourNumber = Number(hour) % 12 + (period === "오후" ? 12 : 0);
  return `${String(hourNumber).padStart(2, "0")}:${minute}`;
}

export function parseKakaoExport(source) {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  const speakers = new Map();
  const messages = [];
  let date = null;
  let current = null;

  for (const [index, line] of lines.entries()) {
    const sourceLine = index + 1;
    const dateMatch = line.match(/^-+ (\d{4})년 (\d{1,2})월 (\d{1,2})일/);
    if (dateMatch) {
      date = isoDate(dateMatch[1], dateMatch[2], dateMatch[3]);
      current = null;
      continue;
    }

    const messageMatch = line.match(/^\[([^\]]+)\] \[(오전|오후) (\d{1,2}):(\d{2})\] (.*)$/);
    if (messageMatch) {
      if (!date) throw new Error(`Message before date header at line ${sourceLine}`);
      const [, nickname, period, hour, minute, body] = messageMatch;
      if (!speakers.has(nickname)) speakers.set(nickname, `u${String(speakers.size + 1).padStart(4, "0")}`);
      current = {
        messageId: `m${String(messages.length + 1).padStart(6, "0")}`,
        sourceStartLine: sourceLine,
        sourceEndLine: sourceLine,
        date,
        time: twentyFourHour(period, hour, minute),
        speakerId: speakers.get(nickname),
        isBot: /오픈채팅봇|운영봇/.test(nickname),
        text: body
      };
      messages.push(current);
      continue;
    }

    if (/님이 (들어왔습니다|나갔습니다)|^메시지가 삭제되었습니다\.$/.test(line)) {
      current = null;
      continue;
    }
    if (current) {
      current.text += `\n${line}`;
      current.sourceEndLine = sourceLine;
    }
  }

  for (const message of messages) message.text = message.text.trimEnd();
  return { messages, lineCount: lines.length, speakerLabelCount: speakers.size };
}

export function classifyMessage(message) {
  if (message.isBot || message.text.length < 15 || !questionPattern.test(message.text)) return null;
  const topics = Object.entries(topicPatterns).filter(([, pattern]) => pattern.test(message.text)).map(([name]) => name);
  const intents = Object.entries(intentPatterns).filter(([, pattern]) => pattern.test(message.text)).map(([name]) => name);
  return {
    messageId: message.messageId,
    sourceStartLine: message.sourceStartLine,
    date: message.date,
    speakerId: message.speakerId,
    topics,
    intents,
    reviewStatus: "auto_unreviewed"
  };
}

function jsonLines(rows) {
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

export function buildDataset(sourcePath) {
  const source = readFileSync(sourcePath, "utf8");
  const sourceSha256 = createHash("sha256").update(source).digest("hex");
  const outputDir = resolve(exportRoot, `chat-research-${sourceSha256.slice(0, 12)}`);
  if (existsSync(outputDir)) {
    const manifestPath = resolve(outputDir, "manifest.json");
    if (existsSync(manifestPath)) {
      const existing = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (existing.sourceSha256 === sourceSha256) return { outputDir, manifest: existing, reused: true };
    }
    throw new Error(`Incomplete or different export exists: ${outputDir}`);
  }

  const { messages, lineCount, speakerLabelCount } = parseKakaoExport(source);
  const candidates = messages.map(classifyMessage).filter(Boolean);
  const topicCandidateCounts = Object.fromEntries(Object.keys(topicPatterns).map((name) => [
    name, candidates.filter((candidate) => candidate.topics.includes(name)).length
  ]));
  const dates = [...new Set(messages.map((message) => message.date))].sort();
  const manifest = {
    schemaVersion: 1,
    sourceFileName: basename(sourcePath),
    sourceSha256,
    generatedAt: new Date().toISOString(),
    sourceLineCount: lineCount,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
    dateCount: dates.length,
    messageCount: messages.length,
    speakerLabelCount,
    questionCandidateCount: candidates.length,
    inScopeCandidateCount: candidates.filter((candidate) => candidate.topics.length > 0).length,
    topicCandidateCounts,
    privacy: "Private local research export. Message text may contain personal data; do not commit or publish.",
    methodology: "Topics and intents are overlapping automatic search labels, not validated needs or unique people."
  };

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, "messages.private.jsonl"), jsonLines(messages), { flag: "wx" });
  writeFileSync(resolve(outputDir, "question-candidates.jsonl"), jsonLines(candidates), { flag: "wx" });
  writeFileSync(resolve(outputDir, "README.txt"), [
    "PRIVATE: Do not commit or publish these files.",
    "messages.private.jsonl contains message text and may contain personal data.",
    "speakerId is a per-export alias; no nickname mapping is saved.",
    "question-candidates.jsonl is an unreviewed search index. Join by messageId.",
    "sourceStartLine/sourceEndLine refer to the original chat export.",
    "A candidate label is not a confirmed user need, independent person, or resolved case."
  ].join("\n") + "\n", { flag: "wx" });
  writeFileSync(resolve(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return { outputDir, manifest, reused: false };
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  const sourcePath = process.argv[2];
  if (!sourcePath) {
    console.error("Usage: npm run research:chat -- <kakao-export.txt>");
    process.exitCode = 1;
  } else {
    try {
      const result = buildDataset(resolve(sourcePath));
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
