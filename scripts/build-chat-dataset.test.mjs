import assert from "node:assert/strict";
import test from "node:test";
import { classifyMessage, parseKakaoExport } from "./build-chat-dataset.mjs";

test("parses Korean dates, clock times, multiline bodies and source lines", () => {
  const source = [
    "자취생으로 살아남기 님과 카카오톡 대화",
    "--------------- 2026년 9월 3일 목요일 ---------------",
    "[첫 사람] [오전 12:05] 원룸에서 이불을 어떻게 고르나요?",
    "세탁기가 작아요.",
    "첫 사람님이 나갔습니다.",
    "[둘째] [오후 12:30] 저는 이미 있어요.",
    "--------------- 2026년 9월 4일 금요일 ---------------",
    "[첫 사람] [오후 1:07] 원룸 이사 업체 추천해주세요?"
  ].join("\n");
  const { messages, speakerLabelCount } = parseKakaoExport(source);

  assert.equal(messages.length, 3);
  assert.equal(speakerLabelCount, 2);
  assert.deepEqual(messages[0], {
    messageId: "m000001", sourceStartLine: 3, sourceEndLine: 4,
    date: "2026-09-03", time: "00:05", speakerId: "u0001", isBot: false,
    text: "원룸에서 이불을 어떻게 고르나요?\n세탁기가 작아요."
  });
  assert.equal(messages[1].time, "12:30");
  assert.equal(messages[2].speakerId, "u0001");
  assert.equal(messages[2].date, "2026-09-04");
});

test("keeps automatic candidate labels separate from reviewed evidence", () => {
  const message = {
    messageId: "m000001", sourceStartLine: 3, date: "2026-09-03", speakerId: "u0001",
    isBot: false, text: "원룸에서 이불을 어떻게 고르나요? 세탁기가 작아요."
  };
  const candidate = classifyMessage(message);
  assert.equal(candidate.reviewStatus, "auto_unreviewed");
  assert.ok(candidate.topics.includes("furnishing"));
  assert.ok(candidate.topics.includes("repairs"));
  assert.ok(candidate.intents.includes("next_action"));
  assert.equal(classifyMessage({ ...message, isBot: true }), null);
});
