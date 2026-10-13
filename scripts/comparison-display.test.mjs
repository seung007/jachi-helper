import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import C from "../comparison-core.js";
import D from "../comparison-display.js";
import { taxonomyFor } from "./comparison-taxonomy.mjs";

const field = (key, type = "text", unit = "") => ({ key, label: key, type, unit });
const value = (value, status = "verified", unit) => ({ value, status, ...(unit === undefined ? {} : { unit }) });
const product = (id, attributes) => ({ id, attributes });
const show = (key, text, scope) => D.present(product("A", { [key]: value(text) }), field(key), scope);

const cookingProduct = (attributes = {}, name = '냄비', url = 'https://example.com/exact-pot') => ({id:'COOK',name,url,modelKey:'pot-model',eligibilityStatus:'verified',attributes});
const sourced = text => ({value:text,status:'verified',sourceUrl:'https://example.com/spec',checkedAt:'2026-10-12T00:00:00Z'});

test('Coupang uses exact verified source product URLs or honestly labeled name searches', () => {
  const exact='https://www.coupang.com/vp/products/123?itemId=45&vendorItemId=67';
  assert.deepEqual(D.coupangLink({name:'제품',url:exact}),{url:exact,label:'쿠팡에서 보기',kind:'product'});
  const result=D.coupangLink({name:'냄비 3L & 20cm',url:'https://ikea.com/example'});
  assert.equal(result.kind,'search');assert.equal(result.label,'쿠팡에서 찾기');
  assert.equal(new URL(result.url).searchParams.get('q'),'냄비 3L & 20cm');
  assert.equal(D.coupangLink({name:'제품',url:'https://www.coupang.com.evil.test/vp/products/123'}).kind,'search');
  assert.equal(D.coupangLink({name:''}),null);
});
test('Cookware heat sources are independent explicit statements, not absent=false', () => {
  const p=cookingProduct({compatibility:sourced('가스레인지에 사용하기 적합합니다.; 인덕션레인지에 사용하기 적합합니다.; 오븐 사용 가능.'),care:sourced('식기세척기 사용 가능.')});
  const d=D.cookingDetails(p);
  for(const key of ['gas','induction','oven','dishwasher'])assert.equal(d[key].state,'yes');
  assert.equal(d.induction.sourceUrl,'https://example.com/spec');
  const gasOnly=D.cookingDetails(cookingProduct({compatibility:sourced('가스레인지에 사용하기 적합합니다.')}));
  assert.equal(gasOnly.gas.state,'yes');assert.equal(gasOnly.induction.state,'unknown');
});
test('Negative, conflicting, conditional and unsafe-source heat claims are never promoted', () => {
  assert.equal(D.cookingDetails(cookingProduct({compatibility:sourced('인덕션 사용 불가')})).induction.state,'no');
  assert.equal(D.cookingDetails(cookingProduct({compatibility:sourced('인덕션 사용 가능'),care:sourced('인덕션 사용 불가')})).induction.state,'unknown');
  assert.equal(D.cookingDetails(cookingProduct({compatibility:sourced('인덕션 사용 가능하지만 별도 받침이 필요합니다')})).induction.state,'unknown');
  assert.equal(D.cookingDetails(cookingProduct({compatibility:{...sourced('인덕션 사용 가능'),sourceUrl:'javascript:alert(1)'}})).induction.state,'unknown');
  assert.equal(D.cookingDetails(cookingProduct({care:sourced('손으로 씻어주세요')})).dishwasher.state,'unknown');
});
test('Serving claims require an explicit field or exact product-name label; liters and reviews do not infer portions', () => {
  assert.equal(D.cookingDetails(cookingProduct({capacity:{...sourced(3),unit:'L'},claims:sourced('후기: 4인 가족에게 좋습니다')})).servings.state,'unknown');
  const named=D.cookingDetails(cookingProduct({},'밥솥(6인용)')).servings;
  assert.equal(named.text,'6인용');assert.equal(named.sourceUrl,'https://example.com/exact-pot');
  assert.equal(D.cookingDetails(cookingProduct({servings:{...sourced(2),unit:'인분'}})).servings.text,'2 인분');
  assert.equal(D.cookingDetails(cookingProduct({},'1인 가구 추천 냄비')).servings.state,'unknown');
  assert.equal(D.cookingDetails(cookingProduct({},'소형 밥솥 3.5인용')).servings.text,'3.5인용');
});

test("CommonJS and browser expose the same small API", () => {
  assert.deepEqual(Object.keys(D), ["definitions", "present", "differences", "coupangLink", "cookingDetails", "details", "describe", "filterOptions", "matches"]);
  const window = { ComparisonCore: C };
  vm.runInNewContext(readFileSync(new URL("../comparison-display.js", import.meta.url), "utf8"), window);
  assert.deepEqual(Object.keys(window.ComparisonDisplay), Object.keys(D));
  assert.equal(window.ComparisonDisplay.present(product("A", {}), field("care")).text, "미확인");
});

test("food essentials use category order and at most six verified fields", () => {
  const keys = ["claims", "preparation", "storage", "allergens", "nutrition", "ingredients", "count", "amount", "type"];
  const group = { attributeDefinitions: keys.map(key => field(key)) };
  const a = product("A", Object.fromEntries(keys.map(key => [key, value(key)])));
  assert.deepEqual(D.definitions({ category: "먹거리" }, group, [a]).map(d => d.key),
    ["amount", "storage", "preparation", "allergens", "ingredients", "nutrition"]);
  a.attributes.nutrition.status = "unknown";
  assert.deepEqual(D.definitions({ category: "먹거리" }, group, [a]).map(d => d.key),
    ["amount", "storage", "preparation", "allergens", "ingredients", "count"]);
});

test("P051 essentials prioritize actual kitchen dimensions without inventing them", () => {
  const keys = ["care", "claims", "material", "height", "diameter", "capacity", "compatibility", "dimensions"];
  const group = { attributeDefinitions: keys.map(key => field(key)) };
  const a = product("A", Object.fromEntries(keys.map(key => [key, value(key)])));
  const before = JSON.stringify({ group, a });
  assert.deepEqual(D.definitions({ id: "P051", category: "주방용품" }, group, [a]).map(d => d.key),
    ["capacity", "diameter", "material", "height", "compatibility", "care"]);
  assert.equal(JSON.stringify({ group, a }), before);
  assert.deepEqual(D.definitions({ id: "P051" }, { attributeDefinitions: [field("material")] }, [a]).map(d => d.key), ["material"]);
});

test("all scope preserves definitions, including unknown, N/A and claims", () => {
  const group = { attributeDefinitions: [field("unknown"), field("na"), field("claims")] };
  const a = product("A", { na: value(null, "not_applicable"), claims: value("판매처 설명") });
  assert.equal(D.definitions({}, group, [a], "all"), group.attributeDefinitions);
  assert.deepEqual(D.definitions({}, group, [a]), []);
});

test("general categories have domain-specific ordering", () => {
  const expected = {
    "주방용품": ["dimensions", "material", "capacity"],
    "욕실·위생": ["amount", "use", "material"],
    "세탁·의류관리": ["compatibility", "dosage", "amount"],
    "청소·폐기": ["use", "amount", "compatibility"],
    "침구·가구": ["dimensions", "material", "size"],
    "가전": ["capacity", "dimensions", "compatibility"],
    "수납·생활도구": ["dimensions", "material", "capacity"],
    "환경·안전": ["use", "compatibility", "dimensions"],
  };
  const keys = ["dosage", "compatibility", "amount", "material", "use", "size", "dimensions", "capacity", "claims"];
  const group = { attributeDefinitions: keys.map(key => field(key)) };
  const a = product("A", Object.fromEntries(keys.map(key => [key, value(key)])));
  for (const [category, first] of Object.entries(expected)) {
    assert.deepEqual(D.definitions({ category }, group, [a]).slice(0, 3).map(d => d.key), first);
  }
});

test("essentials rely on core validation and any selected product's verified value", () => {
  const capacity = field("capacity", "number", "mL");
  const group = { attributeDefinitions: [capacity, field("material"), field("care")] };
  const a = product("A", { capacity: value("100"), material: value(null, "not_applicable"), care: value("", "verified") });
  assert.deepEqual(D.definitions({ category: "unlisted" }, group, [a]), []);
  const b = product("B", { capacity: value(0) });
  assert.deepEqual(D.definitions({}, group, [a, b]), [capacity]);
});

test("numbers render actual value plus unit, retaining zero and negatives", () => {
  const definition = field("capacity", "number", "mL");
  for (const number of [0, -5, 12.5, 1000]) {
    const raw = `${number} mL`;
    assert.deepEqual(D.present(product("A", { capacity: value(number) }), definition), { text: raw, raw, hasDetail: false });
  }
  assert.equal(D.present(product("A", { capacity: value(2, "verified", "L") }), definition).text, "2 L");
  assert.equal(show("amount", "210").text, "210");
  assert.equal(D.present(product("A", { amount: value("210", "verified", "g") }), field("amount")).text, "210 g");
});

test("unknown, N/A and invalid values are never inferred as absence or false", () => {
  const definition = field("capacity", "number");
  for (const invalid of [undefined, null, "0", Infinity, NaN]) {
    assert.equal(D.present(product("A", { capacity: value(invalid) }), definition).text, "미확인");
  }
  assert.deepEqual(D.present(product("A", { capacity: value(0, "unknown") }), definition), { text: "미확인", raw: "미확인", hasDetail: false });
  assert.deepEqual(D.present(product("A", { capacity: value(null, "not_applicable") }), definition), { text: "해당없음", raw: "해당없음", hasDetail: false });
  assert.equal(show("care", "", "all").text, "미확인");
  assert.equal(show("compatibility", "인덕션 정보 없음").text, "인덕션 정보 없음");
});

test("normalization matches complete explicitly supported source statements only", () => {
  const samples = [
    ["care", "식기세척기 사용이 가능합니다.", "식기세척기 사용 가능"],
    ["care", "손으로 씻어 주세요.", "손으로 씻어주세요"],
    ["compatibility", "가스레인지 사용에 적합합니다.", "가스레인지 사용 적합"],
    ["compatibility", "인덕션레인지에 적합합니다.", "인덕션레인지 적합"],
    ["compatibility", "오븐 사용이 가능합니다.", "오븐 사용 가능"],
  ];
  for (const [key, raw, text] of samples) assert.deepEqual(show(key, raw), { text, raw, hasDetail: true });
});

test("negations, restrictions, ambiguity and conflicting statements preserve original wording", () => {
  const samples = [
    ["care", "식기세척기 사용 가능하지 않습니다."],
    ["care", "식기세척기 사용 가능 여부는 미확인"],
    ["care", "식기세척기 사용 가능 (뚜껑 제외)"],
    ["care", "식기세척기 사용 가능. 식기세척기 사용 금지."],
    ["care", "손으로 씻어주세요. 단, 부품마다 세척법이 다릅니다."],
    ["care", "식기세척기 사용 가능!하지 않습니다"],
    ["care", "식기세척기 사용 가능..."],
    ["compatibility", "오븐 사용 가능하지 않습니다"],
    ["compatibility", "오븐 사용 가능 / 손잡이 제외"],
    ["compatibility", "인덕션레인지 적합\n인덕션레인지 사용 불가"],
    ["compatibility", "오븐 사용 가능 (최대 150도)"],
    ["compatibility", "오븐 사용 가능?"],
  ];
  for (const [key, raw] of samples) assert.deepEqual(show(key, raw), { text: raw, raw, hasDetail: false });
});

test("duplicate rendered lines are removed while original raw remains available", () => {
  const raw = "식기세척기 사용이 가능합니다.\n식기세척기 사용 가능\n손으로 씻어 주세요.";
  assert.deepEqual(show("care", raw), { text: "식기세척기 사용 가능\n손으로 씻어주세요", raw, hasDetail: true });
  const ingredients = "대두\r\n대두\r\n밀";
  assert.deepEqual(show("ingredients", ingredients), { text: "대두\n밀", raw: ingredients, hasDetail: true });
  assert.deepEqual(show("ingredients", ingredients, "all"), { text: ingredients, raw: ingredients, hasDetail: false });
});

const p051Heat = [
  "가스레인지에 사용하기 적합합니다.",
  "인덕션레인지에 사용하기 적합합니다.",
  "하이라이트 레인지에 사용하기 적합합니다.",
  "주물 화구에 사용하기 적합합니다.",
  "오븐 사용 가능.",
];
const p051Care = ["식기세척기 사용 가능.", "손으로 씻어주세요."];
const legacyCare = "식기세척기·가스·인덕션·오븐 사용 표시";
const preview = raw => Array.from(raw).length > 120 ? Array.from(raw).slice(0, 100).join("") + "…" : raw;

test("real P051 heat statements have exact compact compatibility labels", () => {
  const expected = ["가스레인지 사용 적합", "인덕션레인지 적합", "하이라이트 레인지 사용 적합", "주물 화구 사용 적합", "오븐 사용 가능"];
  for (let index = 0; index < p051Heat.length; index++) {
    assert.deepEqual(show("compatibility", p051Heat[index]), { text: expected[index], raw: p051Heat[index], hasDetail: true });
  }
  const raw = p051Heat.join("\n");
  assert.deepEqual(show("compatibility", raw), { text: expected.join("\n"), raw, hasDetail: true });
  assert.deepEqual(show("compatibility", raw, "all"), { text: raw, raw, hasDetail: false });
});

test("real P051 care omits only recognized heat sentences and keeps compact explicit care", () => {
  for (const separator of ["\n", "\r\n", " "]) {
    const raw = [...p051Heat, ...p051Care, p051Care[0]].join(separator);
    const a = product("P051-real", { care: value(raw) });
    const before = JSON.stringify(a);
    assert.deepEqual(D.present(a, field("care")), { text: "식기세척기 사용 가능\n손으로 씻어주세요", raw, hasDetail: true });
    assert.deepEqual(D.present(a, field("care"), "all"), { text: raw, raw, hasDetail: false });
    assert.equal(C.attribute(a, field("care")).value, raw);
    assert.equal(JSON.stringify(a), before);
  }
  assert.equal(show("care", [...p051Heat, p051Care[1]].join("\n")).text, "손으로 씻어주세요");
  const heatOnly = p051Heat.join("\n");
  assert.deepEqual(show("care", heatOnly), { text: preview(heatOnly), raw: heatOnly, hasDetail: preview(heatOnly) !== heatOnly });
});

test("legacy whole-line care summary is removable only with all its separate explicit statements", () => {
  const raw = [legacyCare, ...p051Heat, ...p051Care].join("\n");
  assert.deepEqual(show("care", raw), { text: "식기세척기 사용 가능\n손으로 씻어주세요", raw, hasDetail: true });
  assert.deepEqual(show("care", raw, "all"), { text: raw, raw, hasDetail: false });
  for (const incomplete of [
    legacyCare,
    [legacyCare, ...p051Care].join("\n"),
    [legacyCare, ...p051Heat].join("\n"),
    [legacyCare, ...p051Heat.filter(line => !line.startsWith("오븐")), ...p051Care].join("\n"),
    [legacyCare, ...p051Heat.filter(line => !line.startsWith("인덕션")), ...p051Care].join("\n"),
    [legacyCare, ...p051Heat.filter(line => !line.startsWith("가스")), ...p051Care].join("\n"),
    [legacyCare, ...p051Heat, p051Care[1]].join("\n"),
    [legacyCare + "/" + p051Heat[0], ...p051Heat.slice(1), ...p051Care].join("\n"),
    [legacyCare, legacyCare + "/" + p051Heat[0], ...p051Heat, ...p051Care].join("\n"),
    [legacyCare, legacyCare + ".", ...p051Heat, ...p051Care].join("\n"),
  ]) {
    assert.deepEqual(show("care", incomplete), { text: preview(incomplete), raw: incomplete, hasDetail: preview(incomplete) !== incomplete });
  }
});

test("P051 warnings, negations and unknown clauses block all care filtering without losing raw", () => {
  for (const clause of [
    "주의: 뚜껑은 오븐에 넣지 마세요.",
    "손잡이는 분리한 뒤 세척하세요.",
    "식기세척기 사용 불가.",
    "오븐 사용 가능 (150도 이하).",
    "인덕션레인지 사용 불가.",
    "하이라이트 레인지에 사용하기 적합하지 않습니다.",
    "주물 화구 사용 여부는 미확인.",
    "식기세척기 사용 가능 여부를 확인하세요.",
  ]) {
    for (const raw of [
      [clause, ...p051Heat, ...p051Care].join("\n"),
      [legacyCare, ...p051Heat, ...p051Care, clause].join("\n"),
      [p051Care[0], clause].join(" "),
    ]) {
      assert.deepEqual(show("care", raw), { text: preview(raw), raw, hasDetail: preview(raw) !== raw });
      assert.deepEqual(show("care", raw, "all"), { text: raw, raw, hasDetail: false });
    }
    const compatibility = [...p051Heat, clause].join("\n");
    assert.equal(show("compatibility", compatibility).raw, compatibility);
    assert.equal(show("compatibility", compatibility).text, preview(compatibility));
  }
});

test("long text is clearly partial with exactly first 100 characters and complete raw", () => {
  const raw = "재료".repeat(80) + "끝부분 조건 보존";
  const a = product("A", { material: value(raw) });
  const before = JSON.stringify(a);
  assert.deepEqual(D.present(a, field("material")), { text: raw.slice(0, 100) + "…", raw, hasDetail: true });
  assert.deepEqual(D.present(a, field("material"), "all"), { text: raw, raw, hasDetail: false });
  assert.equal(JSON.stringify(a), before);
  assert.equal(show("material", "a".repeat(120)).hasDetail, false);
  assert.equal(show("material", "a".repeat(121)).text, "a".repeat(100) + "…");
  const unicode = "\u{1F9EA}".repeat(121);
  assert.equal(show("material", unicode).text, "\u{1F9EA}".repeat(100) + "…");
});

test("mixed-component material and XSS values remain strings without guesses", () => {
  const raw = "본체: 알루미늄\n뚜껑: 유리\n손잡이: 플라스틱";
  assert.deepEqual(show("material", raw), { text: raw, raw, hasDetail: false });
  const xss = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  assert.deepEqual(show("compatibility", xss), { text: xss, raw: xss, hasDetail: false });
});

test("arbitrary category and field keys cannot read presentation lookup prototypes", () => {
  const definition = field("toString");
  const a = product("A", { toString: value("원문") });
  assert.deepEqual(D.present(a, definition), { text: "원문", raw: "원문", hasDetail: false });
  const group = { attributeDefinitions: [field("material")] };
  const b = product("B", { material: value("유리") });
  assert.deepEqual(D.definitions({ category: "constructor" }, group, [b]), group.attributeDefinitions);
});

test("differences compare base against each alternative using identical units and cap at three", () => {
  const definition = field("capacity", "number", "mL");
  const products = [0, 100, -10, 500, 900].map((n, index) => product(String(index), { capacity: value(n) }));
  const before = JSON.stringify(products);
  assert.deepEqual(D.differences(products, [definition]), [
    { key: "capacity", label: "capacity", baseId: "0", productId: "1", text: "capacity: 0 mL → 100 mL" },
    { key: "capacity", label: "capacity", baseId: "0", productId: "2", text: "capacity: 0 mL → -10 mL" },
    { key: "capacity", label: "capacity", baseId: "0", productId: "3", text: "capacity: 0 mL → 500 mL" },
  ]);
  assert.equal(JSON.stringify(products), before);
});

test("differences skip unit mismatch, unknown, N/A, identical and textual values", () => {
  const definition = field("capacity", "number", "mL");
  const a = product("A", { capacity: value(1000), material: value("알루미늄") });
  const alternatives = [
    product("liters", { capacity: value(1, "verified", "L") }),
    product("unknown", { capacity: value(0, "unknown") }),
    product("na", { capacity: value(null, "not_applicable") }),
    product("same", { capacity: value(1000), material: value("철") }),
    product("invalid", { capacity: value("2000") }),
  ];
  assert.deepEqual(D.differences([a, ...alternatives], [definition, field("material")]), []);
  assert.deepEqual(D.differences([alternatives[1], a], [definition]), []);
  assert.deepEqual(D.differences([], [definition]), []);
  assert.deepEqual(D.differences([a], [definition]), []);
});

test("numeric differences never parse text, summarize claims or invent price/effects", () => {
  const a = product("A", { amount: value("100 g"), claims: value("더 좋습니다"), price: value(1) });
  const b = product("B", { amount: value("200 g"), claims: value("최고"), price: value(2) });
  assert.deepEqual(D.differences([a, b], [field("amount"), field("claims"), field("price", "number", "원")]), []);
});

const legacyContext = { window: {} };
vm.runInNewContext(readFileSync(new URL('../product-catalog.js', import.meta.url), 'utf8'), legacyContext);
const legacyCatalog = JSON.parse(JSON.stringify(legacyContext.window.ProductCatalog));
const schema = legacyCatalog.items.map(taxonomyFor);
const itemFor = id => schema.find(i => i.id === id);
const groupFor = (id, purpose = 'default') => itemFor(id).groups.find(g => g.id === `${id}-${purpose}`);
const legacyProduct = facts => ({ id: 'LEGACY', name: '상품', url: 'https://example.com/original', facts });
const rowFor = (id, p, key, purpose = 'default') => D.details(itemFor(id), groupFor(id, purpose), p, { limit: 100 }).find(r => r.key === key);

test('all 213 schema rows cover 210 purchase items in nine categories; guidance never buys, describes or filters', () => {
  assert.equal(schema.length, 213);
  assert.equal(schema.filter(i => i.kind === 'product').length, 210);
  assert.equal(new Set(schema.map(i => i.category)).size, 9);
  const states = new Set(['verified', 'unknown', 'not_applicable', 'yes', 'no']);
  for (const item of schema) {
    const legacy = legacyCatalog.items.find(i => i.id === item.id);
    const before = JSON.stringify({ item, legacy });
    if (item.kind === 'guidance') {
      assert.deepEqual(D.describe(item, {}), []);
      assert.deepEqual(D.details(item, {}, legacyProduct([])), []);
      assert.deepEqual(D.filterOptions(item, {}, [legacyProduct([])]), []);
      assert.equal(D.matches(item, {}, legacyProduct([]), {}), false);
      assert.equal(D.coupangLink(item), null);
      continue;
    }
    for (const group of item.groups) {
      assert.ok(D.describe(item, group).length >= 2, group.id);
      const absent = D.details(item, group, {});
      assert.equal(absent.length, item.id === 'P051' ? 4 : 2, group.id);
      assert.ok(absent.every(r => r.state === 'unknown'), group.id);
      assert.deepEqual(D.filterOptions(item, group, [{}]), []);
      const allProvided = { attributes: Object.fromEntries(D.describe(item, group).map(d =>
        [d.key, sourced('원문 규격')])) };
      const selectors = D.filterOptions(item, group, [allProvided]);
      assert.ok(selectors.length <= 2);
      for (const selector of selectors) {
        assert.equal(D.matches(item, group, {}, { [selector.key]: selector.options[0].value }), false, group.id);
      }
      for (const p of legacy.products) {
        const rows = D.details(item, group, p);
        assert.ok(rows.length <= 6, group.id);
        assert.ok(rows.filter(r => r.state === 'unknown').length <= (item.id === 'P051' ? 4 : 2), group.id);
        assert.equal(new Set(rows.map(r => r.key)).size, rows.length, group.id);
        for (const row of rows) {
          assert.ok(row.key && row.label && typeof row.text === 'string' && states.has(row.state), group.id);
          if (row.state === 'verified' || row.state === 'yes' || row.state === 'no') assert.ok(C.safeUrl(row.sourceUrl), group.id);
          assert.equal(Object.hasOwn(row, 'checkedAt'), false, group.id);
        }
      }
    }
    assert.equal(JSON.stringify({ item, legacy }), before);
  }
});

test('existing split comparison files are structurally handled without changing source statuses', () => {
  let purchases = 0, guidance = 0, groups = 0;
  for (const original of schema) {
    const item = JSON.parse(readFileSync(new URL(`../assets/comparison/${original.id}.json`, import.meta.url), 'utf8'));
    const before = JSON.stringify(item);
    if (item.kind === 'guidance') { guidance++; assert.deepEqual(D.describe(item, {}), []); continue; }
    purchases++;
    for (const group of item.groups) {
      groups++;
      const selectors = D.filterOptions(item, group, group.products);
      assert.ok(selectors.length <= 2, group.id);
      for (const selector of selectors) {
        for (const option of selector.options) {
          assert.ok(option.value.length <= 50);
          assert.ok(group.products.some(p => D.matches(item, group, p, { [selector.key]: option.value })), group.id);
        }
        for (const status of ['unknown', 'not_applicable']) {
          const missing = { attributes: { [selector.key]: { ...sourced(selector.options[0].value), status } } };
          assert.equal(D.matches(item, group, missing, { [selector.key]: selector.options[0].value }), false, group.id);
        }
      }
      for (const p of group.products) {
        const rows = D.details(item, group, p);
        assert.ok(rows.length <= 6 && rows.filter(r => r.state === 'unknown').length <= (item.id === 'P051' ? 4 : 2), group.id);
        for (const r of rows) {
          if (['verified', 'yes', 'no'].includes(r.state)) assert.ok(C.safeUrl(r.sourceUrl), group.id);
          if (r.state === 'unknown') assert.equal(r.text, '미확인');
        }
        if (!['P051', 'P052'].includes(item.id)) assert.ok(!rows.some(r => ['induction', 'gas', 'oven', 'dishwasher'].includes(r.key)), item.id);
      }
    }
    assert.equal(JSON.stringify(item), before, item.id);
  }
  assert.equal(purchases, 210); assert.equal(guidance, 3); assert.equal(groups, 302);
});

test('purpose profiles distinguish cookware, knives, cleaning, bedding, furniture and electrical safety', () => {
  const keys = (id, purpose = 'default') => D.describe(itemFor(id), groupFor(id, purpose)).map(d => d.key);
  assert.deepEqual(keys('P051').slice(0, 3), ['capacity', 'induction', 'gas']);
  assert.deepEqual(keys('P053', 'chef').slice(0, 2), ['length', 'dimensions']);
  assert.deepEqual(keys('P102').slice(0, 2), ['compatibility', 'dosage']);
  assert.deepEqual(keys('P118').slice(0, 2), ['use', 'cautions']);
  assert.deepEqual(keys('P137').slice(0, 3), ['size', 'material', 'care']);
  assert.deepEqual(keys('P149', 'desk').slice(0, 2), ['dimensions', 'load']);
  assert.deepEqual(keys('P154').slice(0, 2), ['capacity', 'servings']);
  assert.deepEqual(keys('P188').slice(0, 2), ['rating', 'cautions']);
  assert.deepEqual(keys('P206').slice(0, 3), ['use', 'cautions', 'certification']);
  assert.notDeepEqual(keys('P187', 'hook'), keys('P187', 'rod'));
  assert.notDeepEqual(keys('P163', 'installed'), keys('P163', 'jug'));
  assert.notDeepEqual(keys('P158', 'toaster'), keys('P158', 'oven'));
  assert.equal(D.describe(itemFor('P188'), groupFor('P188')).find(d => d.key === 'rating').label, '정격 전류·전압');
});

test('important unknowns use at most two rows, then actual fields, preserving zero and N/A', () => {
  const p = { attributes: { material: sourced('스테인리스'), count: sourced('2개'),
    capacity: { ...sourced(0), unit: 'L' }, dimensions: { status: 'not_applicable', value: null } } };
  const g = { attributeDefinitions: [field('capacity', 'number', 'L'), field('dimensions')] };
  const i = { category: '욕실·위생', kind: 'product' };
  const rows = D.details(i, g, p);
  assert.deepEqual(rows.slice(0, 2).map(r => r.state), ['unknown', 'unknown']);
  assert.equal(rows.find(r => r.key === 'capacity').text, '0 L');
  assert.equal(rows.find(r => r.key === 'dimensions').state, 'not_applicable');
  assert.equal(rows.find(r => r.key === 'count').text, '2개');
  assert.ok(rows.some(r => r.text === '스테인리스'));
  assert.equal(D.details(i, g, p, { limit: 1 }).length, 1);
  assert.equal(D.details(i, g, p, { limit: 0 }).length, 0);
  assert.equal(D.details(i, g, p, { limit: -1 }).length, 0);
});

test('legacy facts require exact label aliases, keep raw strings and original URLs, and do not invent timestamps', () => {
  const p = legacyProduct([{ label: '용량(L)', value: ' 3,0 리터 ' }, { label: '지름(cm)', value: '20' },
    { label: '높이(cm)', value: '12' }, { label: '소재', value: '본체: 철 / 손잡이: 나무' },
    { label: '관리 방법', value: '인덕션 사용 불가' }, { label: '비슷한 용량(L)', value: '99' },
    { key: 'gas', label: '가스 사용 희망', value: '가스레인지 사용 가능' }]);
  p.checkedAt = '2099-01-01';
  const before = JSON.stringify(p);
  const rows = D.details(itemFor('P051'), groupFor('P051'), p, { limit: 100 });
  const capacity = rows.find(r => r.key === 'capacity');
  assert.equal(capacity.text, ' 3,0 리터 '); assert.equal(capacity.sourceUrl, p.url);
  assert.equal(capacity.label, '용량(L)');
  assert.equal(Object.hasOwn(capacity, 'checkedAt'), false);
  assert.equal(rows.find(r => r.key === 'diameter').text, '20');
  assert.equal(rows.find(r => r.key === 'diameter').label, '지름(cm)');
  assert.equal(rows.find(r => r.key === 'induction').state, 'no');
  assert.ok(!rows.some(r => r.text === '99'));
  assert.equal(D.cookingDetails(p).gas.state, 'unknown');
  assert.equal(JSON.stringify(p), before);
  assert.equal(rowFor('P053', legacyProduct([{ label: '날 길이(cm)', value: '20' }]), 'length', 'chef').text, '20');
  assert.equal(rowFor('P137', legacyProduct([{ label: '원단', value: '면 100%' }]), 'material').text, '면 100%');
});

test('every original source label has a conservative display mapping without using criterion values', () => {
  const examples = new Map(legacyCatalog.items.flatMap(i => i.products.flatMap(p => p.facts.map(f => [f.label, f.value]))));
  const i = { kind: 'product', category: '먹거리', variants: ['인덕션 사용 가능'], criteria: ['면 100%', '6인용'] };
  for (const [label, text] of examples) {
    const rows = D.details(i, {}, legacyProduct([{ label, value: text }]), { limit: 100 });
    assert.ok(rows.some(r => r.state === 'verified' && r.text === text), label);
  }
  assert.deepEqual(D.filterOptions(i, {}, [{}]), []);
  assert.ok(D.details(i, {}, {}).every(r => r.state === 'unknown'));
});

test('servings never come from liters, claims or reviews; ineligible source-name servings stay name labels only', () => {
  const p = { ...legacyProduct([{ label: '용량(L)', value: '6L' }]), name: '밥솥 6인용', eligibilityStatus: 'pending', checkedAt: '2099' };
  const before = JSON.stringify(p);
  const servings = rowFor('P154', p, 'servings');
  assert.equal(servings.text, '6인용'); assert.equal(servings.label, '제품명 표기');
  assert.equal(servings.sourceUrl, p.url); assert.equal(Object.hasOwn(servings, 'checkedAt'), false);
  assert.equal(C.eligible(p), false); assert.equal(JSON.stringify(p), before);
  for (const name of ['밥솥 6L', '1인 가구 추천 밥솥', '온 가족 추천']) {
    const q = { ...p, name, attributes: { claims: sourced('6인용'), reviews: sourced('6인분'), capacity: sourced('6L') } };
    assert.equal(rowFor('P154', q, 'servings').state, 'unknown');
  }
});

test('selectors are literal, source-backed, short, exact AND filters and exclude missing or unknown values', () => {
  const i = itemFor('P001'), g = groupFor('P001');
  const a = { attributes: { type: sourced('백미'), storage: sourced('실온') } };
  const b = { attributes: { type: sourced('잡곡'), storage: sourced('냉장') } };
  const c = { attributes: { type: { ...sourced('백미'), status: 'unknown' }, storage: sourced('실온') } };
  const p = [a, b, c, { attributes: { type: sourced('긴 설명'.repeat(20)), storage: sourced('냉장\n개봉 후 주의') } }];
  const before = JSON.stringify(p);
  const selectors = D.filterOptions(i, g, p);
  assert.deepEqual(selectors.map(s => s.key), ['type', 'storage']);
  assert.deepEqual(selectors[0].options.map(o => o.value), ['백미', '잡곡']);
  assert.deepEqual(selectors[1].options.map(o => o.value), ['실온', '냉장']);
  assert.equal(D.matches(i, g, a, { type: '백미', storage: '실온' }), true);
  assert.equal(D.matches(i, g, a, { type: '백미', storage: '냉장' }), false);
  assert.equal(D.matches(i, g, a, { type: '백' }), false);
  assert.equal(D.matches(i, g, c, { type: '백미' }), false);
  assert.equal(D.matches(i, g, a, { type: '', storage: 'all' }), true);
  assert.equal(D.matches(i, g, a, { price: '1000' }), false);
  assert.equal(JSON.stringify(p), before);
});

test('legacy filter values never parse names, preferences, marketing, ratings or prices', () => {
  const i = { ...itemFor('P001'), variants: ['냉동'], criteria: ['백미'] }, g = groupFor('P001');
  const p = legacyProduct([{ label: '제품 유형', value: '백미' }, { label: '보관 방법', value: '상온' },
    { label: '가격', value: '1000원' }, { label: '판매 설명', value: '냉동 추천' }, { key: 'type', label: '취향', value: '잡곡' }]);
  p.name = '잡곡 냉동 1000원';
  assert.deepEqual(D.filterOptions(i, g, [p]).map(s => s.options.map(o => o.value)), [['백미'], ['상온']]);
  assert.equal(D.matches(i, g, p, { type: '잡곡' }), false);
  assert.equal(D.matches(i, g, p, { storage: '냉동' }), false);
  assert.equal(D.matches(i, g, p, { type: '백미', storage: '상온' }), true);
  p.attributes = { type: { ...sourced('백미'), status: 'unknown' } };
  assert.equal(D.matches(i, g, p, { type: '백미' }), false);
});

test('numeric selectors require provided standardized values with homogeneous units, not unit conversion', () => {
  const i = itemFor('P156');
  const g = { attributeDefinitions: [field('capacity', 'number', 'L')] };
  const numeric = (number, unit) => ({ attributes: { capacity: { ...sourced(number), unit } } });
  const a = numeric(0, 'L'), b = numeric(2, 'L'), c = numeric(2000, 'mL');
  assert.deepEqual(D.filterOptions(i, g, [a, b])[0].options.map(o => o.value), ['0 L', '2 L']);
  assert.deepEqual(D.filterOptions(i, g, [a, c]), []);
  assert.equal(D.matches(i, g, c, { capacity: '2 L' }), false);
  assert.deepEqual(D.filterOptions(i, g, [numeric('2', 'L')]), []);
  assert.deepEqual(D.filterOptions(i, g, [legacyProduct([{ label: '용량(L)', value: '2' }])]), []);
  assert.equal(D.matches(i, g, a, { capacity: '0 L' }), true);
});

test('cookware filters support existing heat IDs and do not promote negations, conflicts or conditions', () => {
  for (const id of ['P051', 'P052']) {
    const i = itemFor(id), g = groupFor(id);
    const a = cookingProduct({ compatibility: sourced('인덕션 사용 가능; 가스레인지 사용 불가') });
    assert.deepEqual(D.filterOptions(i, g, [a]), [
      { key: 'induction', label: '인덕션', options: [{ value: 'yes', label: '가능' }] },
      { key: 'gas', label: '가스레인지', options: [{ value: 'no', label: '불가' }] },
    ]);
    assert.equal(D.matches(i, g, a, { induction: 'yes', gas: 'no' }), true);
    assert.equal(D.matches(i, g, a, { induction: 'yes', gas: 'yes' }), false);
    for (const text of ['인덕션 사용 가능하지만 조건이 있습니다', '인덕션 사용 가능 / 손잡이 제외', '인덕션 사용 가능; 인덕션 사용 불가', '인덕션 사용 가능하지 않습니다', '인덕션 사용 가능. 단, 별도 받침 필요', '인덕션 사용 가능. 사용 불가']) {
      assert.equal(D.matches(i, g, cookingProduct({ compatibility: sourced(text) }), { induction: 'yes' }), false, text);
    }
    assert.equal(D.matches(i, g, cookingProduct({}), { induction: 'yes' }), false);
  }
});

test('unsafe source URLs never create verified details, selectors or matches', () => {
  const i = itemFor('P001'), g = groupFor('P001');
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'https://user:password@example.com/', 'https://example.com/a b', '//example.com/a', 'https://example.com/\\evil']) {
    const a = { attributes: { type: { ...sourced('백미'), sourceUrl: url } } };
    const b = { ...legacyProduct([{ label: '제품 유형', value: '백미' }]), url };
    for (const p of [a, b]) {
      assert.deepEqual(D.filterOptions(i, g, [p]), [], url);
      assert.equal(D.matches(i, g, p, { type: '백미' }), false, url);
      assert.ok(!D.details(i, g, p, { limit: 100 }).some(r => r.state === 'verified'), url);
    }
    assert.equal(D.cookingDetails({ ...b, name: '밥솥 6인용' }).servings.state, 'unknown');
    assert.equal(D.coupangLink({ url }), null);
  }
});

test('approved P051 purchase checks retain all four unknowns at limit six and essentials follow the same priority', () => {
  const i = itemFor('P051');
  const g = { attributeDefinitions: [field('material'), field('diameter', 'number', 'cm'), field('capacity', 'number', 'L'), field('care')] };
  const p = { attributes: { material: sourced('스테인리스'), diameter: sourced(20), care: sourced('손 세척') } };
  const rows = D.details(i, g, p);
  assert.deepEqual(rows.map(r => r.key), ['capacity', 'induction', 'gas', 'servings', 'diameter', 'material']);
  assert.ok(rows.slice(0, 4).every(r => r.state === 'unknown'));
  assert.equal(rows.find(r => r.key === 'servings').text, '미확인');
  assert.deepEqual(D.definitions(i, g, [p]).map(d => d.key), ['diameter', 'material', 'care']);
  const actual = JSON.parse(readFileSync(new URL('../assets/comparison/P051.json', import.meta.url), 'utf8'));
  for (const group of actual.groups) {
    const essentials = D.definitions(actual, group, group.products);
    const described = D.describe(actual, group).map(d => d.key);
    assert.deepEqual(essentials.map(d => d.key), described.filter(key => essentials.some(d => d.key === key)));
    for (const product of group.products) assert.ok(D.details(actual, group, product).some(r => r.key === 'servings'));
  }
});
