import test from "node:test";
import assert from "node:assert/strict";
import C from "../comparison-core.js";

const now = Date.parse("2026-10-11T03:00:00Z");
const product = (id, key, status = "verified", attributes = {}) => ({ id, name: id, modelKey: key, eligibilityStatus: status, attributes });
const number = { key: "capacity", label: "용량", type: "number", unit: "mL" };
const value = (value, status = "verified", unit) => ({ value, status, ...(unit === undefined ? {} : { unit }) });

test("models dedupe options/sellers by normalized model key, not name", () => {
  const products = [product("A-red", "Model A", "pending"), product("A-blue", " model a "), product("B", "Model B"), product("unidentified", "", "verified")];
  const grouped = C.groupProducts(products);
  assert.equal(grouped.models.length, 2);
  assert.equal(grouped.verified.length, 2);
  assert.equal(grouped.models[0].representative.id, "A-blue");
  assert.equal(grouped.models[0].products.length, 2);
  assert.equal(grouped.unresolved.length, 1);
  assert.equal(C.eligible(products[3]), false);
});

test("selection keeps exact option IDs, excludes pending and duplicate models", () => {
  const products = [product("A", "a"), product("A-pack", "a"), product("B", "b"), product("C", "c", "pending"), product("D", "d"), product("E", "e"), product("F", "f")];
  const chosen = C.selectProducts(products, "A-pack", ["A", "C", "B", "B", "D", "E", "F"]);
  assert.equal(chosen.base.id, "A-pack");
  assert.deepEqual(chosen.alternatives.map(product => product.id), ["B", "D", "E"]);
  assert.equal(C.selectProducts([products[3]], "C").base, null);
});

test("grouping does not count duplicate IDs or unnamed model identity", () => {
  assert.equal(C.groupProducts([product("A", "a"), product("A", "b")]).verified.length, 1);
  assert.equal(C.groupProducts([product("A", "a", "pending")]).verified.length, 0);
});

test("identical exact product links reconcile differing model keys, transitively", () => {
  const a = { ...product("A", "legacy-name"), url: "https://example.com/products/model-a" };
  const b = { ...product("B", "canonical-a"), url: a.url };
  const c = { ...product("C", "canonical-a"), url: "https://seller.example/model-a?pack=2" };
  const d = { ...product("D", "other-model"), url: "https://example.com/products/model-d" };
  const products = [a, d, b, c];
  assert.equal(C.groupProducts(products).verified.length, 2);
  assert.equal(C.sameModel(a, c, products), true);
  assert.deepEqual(C.selectProducts(products, "A", ["B", "C", "D"]).alternatives.map(product => product.id), ["D"]);
});

test("unknown, actual zero, and not applicable remain distinct", () => {
  const zero = product("A", "a", "verified", { capacity: value(0) });
  const unknown = product("B", "b", "verified", { capacity: value(0, "unknown") });
  const na = product("C", "c", "verified", { capacity: value(null, "not_applicable") });
  assert.equal(C.attribute(zero, number).value, 0);
  assert.equal(C.attribute(unknown, number).status, "unknown");
  assert.equal(C.attribute(na, number).status, "not_applicable");
  assert.equal(C.compareAttributes(zero, unknown, number).kind, "incomplete");
  assert.equal(C.rowState([zero, unknown, na], number), "incomplete");
});

test("numeric comparison requires verified finite numbers and identical units", () => {
  const a = product("A", "a", "verified", { capacity: value(600) });
  const b = product("B", "b", "verified", { capacity: value(1000) });
  assert.equal(C.compareAttributes(a, b, number).delta, 400);
  assert.equal(C.compareAttributes(b, a, number).delta, -400);
  const liters = product("C", "c", "verified", { capacity: value(1, "verified", "L") });
  assert.equal(C.compareAttributes(a, liters, number).kind, "incomparable");
  assert.equal(C.rowState([a, liters], number), "incomparable");
  for (const invalid of ["600", null, Infinity, NaN]) assert.equal(C.attribute(product("X", "x", "verified", { capacity: value(invalid) }), number).status, "unknown");
});

test("text differences use provided facts only, missing values not invented", () => {
  const definition = { key: "material", label: "재질", type: "text" };
  const a = product("A", "a", "verified", { material: value("유리") });
  const b = product("B", "b", "verified", { material: value("유리") });
  const c = product("C", "c", "verified", { material: value("스테인리스") });
  assert.equal(C.rowState([a, b], definition), "same");
  assert.equal(C.rowState([a, b, c], definition), "different");
  assert.equal(C.compareAttributes(a, c, definition).delta, null);
  assert.equal(C.attribute(product("D", "d"), definition).status, "unknown");
});

test("difference-only classification excludes unknown/N/A and unit mismatch", () => {
  const a = product("A", "a", "verified", { capacity: value(10) });
  const b = product("B", "b", "verified", { capacity: value(20) });
  const c = product("C", "c", "verified", { capacity: value(null, "unknown") });
  assert.equal(C.rowState([a, b, c], number), "different");
  assert.equal(C.rowState([a], number), "incomplete");
});

test("essential specifications prioritize provided verified values, max eight, no key assumptions", () => {
  const definitions = Array.from({ length: 12 }, (_, index) => ({ key: `임의 항목(${index})`, label: `항목 ${index}`, type: "text" }));
  const attributes = Object.fromEntries(definitions.map((definition, index) => [definition.key, value(index < 3 ? null : `값 ${index}`, index < 3 ? "unknown" : "verified")]));
  const p = product("A", "a", "verified", attributes);
  assert.equal(C.essentialDefinitions([p], definitions).length, 8);
  assert.equal(C.essentialDefinitions([p], definitions)[0].key, "임의 항목(3)");
  assert.equal(definitions.length, 12);
  assert.equal(C.essentialDefinitions([product("B", "b")], definitions).length, 0);
});

test("URL allowlist rejects script/data/file, credentials, protocol-relative URLs and controls", () => {
  for (const url of ["javascript:alert(1)", "data:image/svg+xml,x", "file:///C:/secret", "//evil.test/a", "https://user:pass@example.com", "https://example.com\n/path", "https:\\evil.test", "not a URL"]) assert.equal(C.safeUrl(url, { allowLocal: true }), "", url);
  assert.equal(C.safeUrl("https://example.com/product?x=1&y=2"), "https://example.com/product?x=1&y=2");
  assert.equal(C.safeUrl("/assets/offers/water.jpg", { allowLocal: true }), "/assets/offers/water.jpg");
  assert.equal(C.safeUrl("/assets/offers/water.jpg"), "");
  assert.equal(C.safeUrl("/data/exports/private.json", { allowLocal: true }), "");
});

test("price expires at 24 hours; future/missing dates or explicit early expiry are hidden", () => {
  const fresh = { value: 10000, status: "verified", checkedAt: new Date(now - C.PRICE_TTL + 1).toISOString() };
  assert.equal(C.expirePrice(fresh, now).value, 10000);
  for (const invalid of [{ ...fresh, checkedAt: new Date(now - C.PRICE_TTL).toISOString() }, { ...fresh, checkedAt: new Date(now + 1).toISOString() }, { ...fresh, checkedAt: undefined }, { ...fresh, expiresAt: new Date(now).toISOString() }, { ...fresh, expiresAt: "invalid" }]) {
    const result = C.expirePrice(invalid, now);
    assert.equal(result.status, "unknown");
    assert.equal(result.value, null);
  }
  const definition = { key: "unitPrice", label: "단위 가격", type: "number", unit: "원" };
  assert.equal(C.attribute(product("A", "a", "verified", { unitPrice: { ...fresh, checkedAt: "2020-01-01" } }), definition, now).expired, true);
  assert.equal(fresh.status, "verified", "input is not mutated");
});

test("URL selection round trips stable IDs and repeated with; no arbitrary parameter injection", () => {
  const selection = { itemId: "P001", groupId: "P001-g1", baseId: "A-blue", withIds: ["B", "C", "D"] };
  const url = C.selectionUrl(selection);
  assert.equal(url, "/compare?item=P001&group=P001-g1&base=A-blue&with=B&with=C&with=D");
  assert.deepEqual(C.parseQuery(url.split("?")[1]), selection);
  assert.deepEqual(C.parseQuery("?with=A,B&with=C").withIds, ["A", "B", "C"]);
  assert.equal(C.selectionUrl({ itemId: '<img onerror="x">', withIds: ["B", "B"] }), "/compare?with=B");
  assert.equal(C.selectionUrl({ itemId: "P001", groupId: "g1", baseId: "A", withIds: [] }), "/compare?item=P001&group=g1&base=A&with=");
  assert.deepEqual(C.parseQuery("?item=P001&group=g1&base=A&with=").withIds, []);
});

test("product storage uses separate key and fixed 30-day expiry; reads never extend it", () => {
  const record = C.createSavedSelection({ itemId: "P001", groupId: "g1", baseId: "A", withIds: ["B"] }, now);
  const raw = JSON.stringify(record);
  const restored = C.readSavedSelection(raw, now + 10 * 86400000);
  assert.equal(restored.record.expiresAt, now + 30 * 86400000);
  assert.equal(JSON.stringify(restored.record), raw);
  assert.notEqual(C.STORAGE_KEY, "jachi:catalog-saved:v1");
  assert.equal(C.readSavedSelection(raw, record.expiresAt).expired, true);
  assert.equal(C.readSavedSelection(raw, record.expiresAt).record, null);
});

test("corrupt/future/oversized/duplicate storage rejected with visible error message", () => {
  const record = C.createSavedSelection({ itemId: "P001", groupId: "g1", baseId: "A", withIds: ["B"] }, now);
  for (const raw of ["{", "null", "[]", JSON.stringify({ ...record, expiresAt: record.expiresAt + 1 }), JSON.stringify({ ...record, savedAt: now + 1 }), JSON.stringify({ ...record, withIds: ["A"] }), JSON.stringify({ ...record, withIds: ["B", "C", "D", "E"] }), JSON.stringify({ ...record, baseId: "<script>" })]) assert.ok(C.readSavedSelection(raw, now).error);
  assert.equal(C.readSavedSelection(null, now).error, null);
});

test("catalog validation accepts generic definitions and informational constraints", () => {
  const catalog = { version: 1, items: [{ id: "P001", title: "제품", groups: [{ id: "g1", label: "사용 목적", targetCount: 6, constraints: ["동일 용도"], attributeDefinitions: [{ key: "지름(cm)", label: "임의 항목", type: "text", interpretation: "제공된 해석" }], products: [product("A", "a")] }] }] };
  assert.equal(C.validateCatalog(catalog), catalog);
  assert.throws(() => C.validateCatalog({ items: [{ ...catalog.items[0], groups: [{ ...catalog.items[0].groups[0], products: [product("A", "a"), product("A", "b")] }] }] }));
  assert.throws(() => C.validateCatalog({}));
});
