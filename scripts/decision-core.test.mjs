import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const model = vm.runInNewContext(readFileSync(new URL("../decision-core.js", import.meta.url), "utf8") + "\ndecisionModel");
const plain = (value) => JSON.parse(JSON.stringify(value));

test("all 36 cleaning combinations resolve; uncertainty overrides a service preference", () => {
  let count = 0;
  for (const [scope] of model.scenarios.cleaning.questions[0].options)
    for (const [space] of model.scenarios.cleaning.questions[1].options)
      for (const [effort] of model.scenarios.cleaning.questions[2].options) {
        const result = model.resultFor("cleaning", { scope, space, effort });
        const expected = ["unknown", "inspect"].includes(scope) || space === "unknown" || effort === "unknown" ? "review"
          : scope === "deep" || space === "large" || effort === "service" ? "quote" : "self";
        assert.equal(result.suggested, expected);
        assert.equal(result.actions.length, 3);
        count++;
      }
  assert.equal(count, 36);
});

test("duvet owned and unknown short-circuit; all size and care combinations resolve", () => {
  assert.equal(model.resultFor("duvet", { owned: "have" }).code, "duvet_prepared");
  assert.equal(model.resultFor("duvet", { owned: "unknown" }).code, "duvet_review");
  assert.equal(model.activeQuestions("duvet", { owned: "have" }).length, 1);
  for (const [size] of model.scenarios.duvet.questions[1].options)
    for (const [care] of model.scenarios.duvet.questions[2].options) {
      const result = model.resultFor("duvet", { owned: "need", size, care });
      assert.ok(result);
      if (size === "unknown" || care === "unknown") assert.equal(result.query, undefined);
      else assert.ok(result.query && result.suggested === "compare");
    }
});

test("invalid scenarios, partial answers and untrusted enum values cannot generate decisions", () => {
  for (const id of ["constructor", "__proto__", "toString", "missing", null]) {
    assert.equal(model.resultFor(id, {}), null);
    assert.equal(model.normalizeRecord(id, { version: 1, expiresAt: Date.now() + 1000 }), null);
  }
  assert.equal(model.resultFor("cleaning", { scope: "basic" }), null);
  assert.equal(model.resultFor("duvet", { owned: "<script>" }), null);
  assert.deepEqual(plain(model.answersFor("duvet", { owned: "need", size: "single", arbitrary: "private" })), { owned: "need", size: "single" });
});

test("budget validates integer range without silent truncation", () => {
  for (const value of ["-1", "1e6", "1.5", "999999999999999999", "abc", ",,"]) assert.equal(model.parseBudget(value), undefined);
  assert.equal(model.parseBudget("123,000"), 123000);
  assert.equal(model.parseBudget(""), null);
  assert.equal(model.parseBudget("0"), 0);
});

test("records expire at the boundary and normalize forged outcomes", () => {
  const now = 100000;
  const value = { version: 1, answers: { owned: "have" }, action: "prepared", outcome: "contacted", expiresAt: now + model.ttl, attemptId: "safe-id", resultShown: true };
  assert.equal(model.normalizeRecord("duvet", value, now).outcome, "planned");
  assert.equal(model.normalizeRecord("duvet", value, value.expiresAt), null);
  assert.equal(model.normalizeRecord("duvet", { ...value, version: 0 }, now), null);
  assert.equal(model.normalizeRecord("duvet", { ...value, expiresAt: now + model.ttl * 2 }, now), null);
  assert.equal(model.normalizeRecord("duvet", { ...value, action: "quote" }, now).action, "");
});

test("situation matches are distinct from generic product queries", () => {
  assert.deepEqual(plain(model.find("입주 청소 맡길까?")), ["cleaning"]);
  assert.deepEqual(plain(model.find("이불 커버 분리")), ["duvet"]);
  assert.deepEqual(plain(model.find("청소기")), []);
  assert.deepEqual(plain(model.find("")), []);
});

test("inquiry reflects chosen scope without inventing an address or cost", () => {
  const text = model.inquiry({ scope: "inspect", space: "small", effort: "service" });
  assert.match(text, /누수/);
  assert.match(text, /원룸/);
  assert.match(text, /별도의 원인 확인/);
  assert.match(text, /확인 후 전달/);
});

test("all 36 moving combinations keep unknown conditions explicit", () => {
  let count = 0;
  for (const [cargo] of model.scenarios.moving.questions[0].options)
    for (const [distance] of model.scenarios.moving.questions[1].options)
      for (const [help] of model.scenarios.moving.questions[2].options) {
        const result = model.resultFor("moving", { cargo, distance, help });
        assert.equal(result.suggested, [cargo, distance, help].includes("unknown") ? "review" : "quote");
        assert.equal(result.actions.length, 2);
        assert.equal(result.query, undefined);
        assert.doesNotMatch(JSON.stringify(result), /\d[\d,]*원|\d톤/);
        count++;
      }
  assert.equal(count, 36);
  assert.equal(model.resultFor("moving", { cargo: "boxes" }), null);
  const inquiry = model.inquiry({ cargo: "furniture", distance: "unknown", help: "packing" }, "moving");
  assert.match(inquiry, /가구나 큰 가전/);
  assert.match(inquiry, /경로가 아직 미정/);
  assert.match(inquiry, /포장과 운반/);
  assert.match(inquiry, /아직 전달하지 않은 정보/);
  assert.doesNotMatch(inquiry, /\d[\d,]*원|\d톤/);
  assert.deepEqual(plain(model.find("원룸 이사 견적")), ["moving"]);
  assert.deepEqual(plain(model.find("용달")), ["moving"]);
  assert.deepEqual(plain(model.find("이사")), ["moving"]);
  assert.deepEqual(plain(model.find("이사 청소")), ["cleaning"]);
});

test("service follow-up persists without marking completion or changing existing records", () => {
  const now = 100000;
  for (const [id, answers] of [["moving", { cargo: "boxes", distance: "near", help: "transport" }], ["cleaning", { scope: "deep", space: "small", effort: "service" }]]) {
    const record = { version: 1, answers, action: "quote", expiresAt: now + model.ttl, resultShown: true, attemptId: "same-attempt", completedAt: now - 1 };
    for (const outcome of ["planned", "contacted", "followup", "done"]) {
      const clean = model.normalizeRecord(id, { ...record, outcome }, now);
      assert.equal(clean.outcome, outcome);
      assert.equal(clean.action, "quote");
      assert.deepEqual(plain(clean.answers), answers);
      assert.equal(clean.completedAt, record.completedAt);
    }
    assert.equal(model.normalizeRecord(id, { ...record, action: "review", outcome: "contacted" }, now).outcome, "planned");
    assert.equal(model.followupTasks(id, "quote").length, 2);
  }
  assert.equal(model.normalizeRecord("duvet", { version: 1, answers: { owned: "have" }, action: "prepared", outcome: "followup", expiresAt: now + model.ttl }, now).outcome, "planned");
  assert.match(model.followupTasks("moving", "review").join(" "), /아직 모르는 조건/);
  assert.doesNotMatch(model.followupTasks("moving", "review").join(" "), /받은 답변/);
});

test("storage reuses existing items and never shops before space and purpose are known", () => {
  assert.equal(model.resultFor("storage", { owned: "have" }).suggested, "reuse");
  assert.equal(model.resultFor("storage", { owned: "have" }).query, undefined);
  assert.equal(model.activeQuestions("storage", { owned: "have" }).length, 1);
  assert.equal(model.resultFor("storage", { owned: "unknown" }).suggested, "review");
  assert.equal(model.resultFor("storage", { owned: "need", space: "measured" }), null);
  for (const [space] of model.scenarios.storage.questions[1].options)
    for (const [purpose] of model.scenarios.storage.questions[2].options) {
      const result = model.resultFor("storage", { owned: "need", space, purpose });
      const canCompare = space === "measured" && purpose !== "unknown";
      assert.equal(result.suggested, canCompare ? "compare" : "review");
      assert.equal(Boolean(result.query), canCompare);
      assert.doesNotMatch(JSON.stringify(result), /최저가|인기순|\d+cm|\d[\d,]*원/);
    }
  const queries = ["clothes", "supplies", "small"].map((purpose) => model.resultFor("storage", { owned: "need", space: "measured", purpose }).query);
  assert.equal(new Set(queries).size, 3);
  assert.deepEqual(plain(model.find("방이 좁아서 수납이 부족")), ["storage"]);
});

test("feedback accepts only known codes and remains compatible with existing records", () => {
  const now = 100000;
  const base = { version: 1, answers: { owned: "have" }, expiresAt: now + model.ttl, action: "reuse", resultShown: true };
  assert.equal(model.normalizeRecord("storage", base, now).feedback, "");
  const negative = model.normalizeRecord("storage", { ...base, feedback: "not_yet", feedbackReason: "missing_condition" }, now);
  assert.equal(negative.feedbackReason, "missing_condition");
  const positive = model.normalizeRecord("storage", { ...base, feedback: "helpful", feedbackReason: "missing_condition" }, now);
  assert.equal(positive.feedbackReason, "");
  const forged = model.normalizeRecord("storage", { ...base, feedback: "<script>", feedbackReason: "private text" }, now);
  assert.equal(forged.feedback, "");
  assert.equal(forged.feedbackReason, "");
});
