import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// Load the static catalog and link renderer without starting DOM event handlers.
const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const modelEnd = source.indexOf("const plannerForm =");
const linksStart = source.indexOf("function createStoreSearchLink(");
const linksEnd = source.indexOf("function setupHomePreview(", linksStart);
assert(modelEnd > 0 && linksStart > modelEnd && linksEnd > linksStart);
const { catalog, guidance, presets, preferences, describe, link } = runInNewContext(
  `${source.slice(0, modelEnd)}\n${source.slice(linksStart, linksEnd)}\n` +
  "({ catalog: recommendationCatalog, guidance: itemGuidance, presets: homePreviewPresets, preferences: homePresetPreferences, describe: getItemGuidance, link: createStoreSearchLink })"
);

assert.equal(Object.keys(catalog).length, 39);
assert.deepEqual(Object.keys(guidance).sort(), Object.keys(catalog).sort());
for (const [id] of Object.entries(catalog)) {
  const item = describe(id);
  assert(["now", "confirm", "later"].includes(item.phase), `${id}: invalid phase`);
  assert(item.reason && item.criteria && item.searchQuery, `${id}: missing guidance`);
  assert(!/침대·창문|가스·인덕션 종류와 실제 조리/.test(item.criteria), `${id}: category fallback remains`);
  for (const store of item.stores) {
    const html = link(store, item.searchQuery, id, "test");
    const url = new URL(html.match(/href="([^"]+)"/)[1]);
    assert.equal(url.protocol, "https:");
    if (store === "naver" || store === "coupang") {
      assert.equal(url.searchParams.get(store === "naver" ? "query" : "q"), item.searchQuery);
    }
  }
  assert.equal(describe(id, {}, "candidate").phase, "now");
  assert.match(describe(id, {}, "candidate").reason, /직접 필요하다고/);
  assert.equal(describe(id, {}, "later").phase, "later");
  assert.match(describe(id, {}, "later").reason, /직접 나중에/);
}

assert.match(describe("bedding-pillow").criteria, /높이/);
assert.doesNotMatch(describe("bedding-pillow").criteria, /창문/);
assert.match(describe("kitchen-bag").criteria, /거주지 지자체/);
assert.equal(describe("kitchen-bag").phase, "confirm");
assert.equal(describe("safe-medicine").stores.join(","), "naver");
assert.equal(describe("safe-medicine").searchQuery, "근처 약국");
assert.equal(describe("life-powerstrip").phase, "confirm");
assert.match(describe("life-powerstrip").criteria, /정격 용량/);
assert.equal(describe("laundry-softener").phase, "later");
assert.doesNotMatch(describe("laundry-detergent", { fragrance: "normal" }).searchQuery, /무향|저자극/);
assert.match(describe("laundry-detergent", { fragrance: "sensitive" }).searchQuery, /무향/);
assert.equal(describe("laundry-net", { workout: "no" }).conditionMatched, false);
assert.equal(describe("laundry-net", { workout: "yes" }).conditionMatched, true);
assert.match(describe("laundry-net", { workout: "yes" }).reason, /운동복/);

for (const [presetName, preset] of Object.entries(presets)) {
  for (const { id, status } of preset.items) {
    assert(catalog[id], `${presetName}: unknown item`);
    assert.equal(status, undefined, `${presetName}: duplicate hardcoded phase`);
    assert(describe(id, preferences[presetName]).reason);
  }
}
assert.match(link("daiso", "수건", "bath-towel", "test"), /홈 열기/);
assert.match(link("ohouse", "베개", "bedding-pillow", "test"), /스토어 열기/);
assert.match(link("naver", "수건", "bath-towel", "test"), /통합검색/);
console.log("39 item guidance checks passed: coverage, decisions, condition matching, presets and link destinations");
