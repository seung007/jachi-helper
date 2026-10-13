(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ComparisonCore = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const DAY = 86400000;
  const STORAGE_KEY = "jachi:comparison-products:v1";
  const STORAGE_TTL = 30 * DAY;
  const PRICE_TTL = DAY;
  const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
  const attributeKey = value => typeof value === "string" && value.trim().length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value);
  const modelKey = product => typeof product?.modelKey === "string" ? product.modelKey.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() : "";
  const namedModelCode = name => String(name || "").match(/\b(?=[A-Z0-9/_-]*\d)[A-Z][A-Z0-9]+(?:[-_/][A-Z0-9]+)+\b/i)?.[0] ||
    String(name || "").match(/\b(?=[A-Z0-9]{6,}\b)(?=[A-Z0-9]*\d)[A-Z][A-Z0-9]+\b/)?.[0] || "";
  const eligible = product => product?.eligibilityStatus === "verified" && id(product.id) && Boolean(modelKey(product));

  function safeUrl(value, { allowLocal = false } = {}) {
    if (typeof value !== "string" || !value || /[\u0000-\u0020\u007f\\]/.test(value)) return "";
    try {
      if (allowLocal && value.startsWith("/") && !value.startsWith("//")) {
        const url = new URL(value, "https://local.invalid");
        const path = decodeURIComponent(url.pathname);
        if (url.origin !== "https://local.invalid" || /[\u0000-\u001f\\]/.test(path) || /^\/data\/exports\//i.test(path)) return "";
        return url.pathname + url.search;
      }
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
    } catch { return ""; }
  }

  function groupProducts(products = []) {
    const models = [];
    const unresolved = [];
    const seen = new Set();
    for (const product of products) {
      if (!product || !id(product.id) || seen.has(product.id)) continue;
      seen.add(product.id);
      const key = modelKey(product);
      if (!key) { unresolved.push(product); continue; }
      const url = safeUrl(product.url);
      // An exact shared product URL also identifies duplicate records with inconsistent keys.
      const matches = models.filter(group => group.products.some(candidate => modelKey(candidate) === key || (url && safeUrl(candidate.url) === url)));
      const merged = matches.flatMap(group => group.products).concat(product);
      for (const group of matches) models.splice(models.indexOf(group), 1);
      models.push({ modelKey: modelKey(merged[0]), products: merged, representative: merged.find(eligible) || merged[0] });
    }
    models.sort((left, right) => products.indexOf(left.products[0]) - products.indexOf(right.products[0]));
    return { models, verified: models.filter(group => eligible(group.representative)), unresolved };
  }

  function sameModel(left, right, products = [left, right]) {
    if (!left || !right) return false;
    return groupProducts(products).models.some(group => group.products.some(product => product.id === left.id) && group.products.some(product => product.id === right.id));
  }

  function selectProducts(products, baseId, withIds = [], maxAlternatives = 3) {
    const grouped = groupProducts(products);
    const verified = products.filter(eligible);
    const base = verified.find(product => product.id === baseId) || grouped.verified[0]?.representative || null;
    if (!base) return { base: null, alternatives: [] };
    const selected = [base];
    const alternatives = [];
    for (const candidateId of withIds) {
      const product = verified.find(candidate => candidate.id === candidateId);
      if (!product || selected.some(candidate => sameModel(candidate, product, products))) continue;
      selected.push(product);
      alternatives.push(product);
      if (alternatives.length === maxAlternatives) break;
    }
    return { base, alternatives };
  }

  function expirePrice(observation, now = Date.now()) {
    if (!observation || observation.status !== "verified") return { ...observation, status: "unknown" };
    const checked = Date.parse(observation.checkedAt);
    const explicitExpiry = observation.expiresAt === undefined ? Infinity : Date.parse(observation.expiresAt);
    const fresh = Number.isFinite(checked) && checked <= now && now < Math.min(checked + PRICE_TTL, explicitExpiry);
    return fresh ? { ...observation } : { ...observation, value: null, status: "unknown", expired: true };
  }

  function attribute(product, definition, now = Date.now()) {
    let value = product?.attributes && Object.hasOwn(product.attributes, definition.key) ? product.attributes[definition.key] : undefined;
    if (/price|cost|가격|비용|판매가/i.test(definition.key)) value = expirePrice(value, now);
    if (!value || !["verified", "unknown", "not_applicable"].includes(value.status)) return { value: null, status: "unknown", unit: definition.unit || "" };
    const result = { ...value, unit: value.unit ?? definition.unit ?? "" };
    if (result.status === "verified" && (definition.type === "number" ? typeof result.value !== "number" || !Number.isFinite(result.value) : typeof result.value !== "string" || !result.value.trim())) {
      result.status = "unknown";
      result.value = null;
    }
    return result;
  }

  function compareAttributes(base, alternative, definition, now = Date.now()) {
    const left = attribute(base, definition, now);
    const right = attribute(alternative, definition, now);
    if (left.status !== "verified" || right.status !== "verified") return { kind: "incomplete", left, right };
    if (left.unit !== right.unit) return { kind: "incomparable", left, right };
    if (left.value === right.value) return { kind: "same", left, right };
    return { kind: "different", left, right, delta: definition.type === "number" ? right.value - left.value : null };
  }

  function rowState(products, definition, now = Date.now()) {
    if (products.length < 2) return "incomplete";
    const comparisons = products.slice(1).map(product => compareAttributes(products[0], product, definition, now));
    if (comparisons.some(value => value.kind === "different")) return "different";
    if (comparisons.some(value => value.kind === "incomparable")) return "incomparable";
    return comparisons.every(value => value.kind === "same") ? "same" : "incomplete";
  }

  function essentialDefinitions(products, definitions, now = Date.now()) {
    return definitions.filter(definition => products.some(product => attribute(product, definition, now).status === "verified")).slice(0, 8);
  }

  function parseQuery(search) {
    const query = new URLSearchParams(search);
    return { itemId: query.get("item") || "", groupId: query.get("group") || "", baseId: query.get("base") || "", withIds: query.getAll("with").flatMap(value => value.split(",")).filter(id).slice(0, 3) };
  }

  function selectionUrl({ itemId, groupId, baseId, withIds = [] }) {
    const query = new URLSearchParams();
    for (const [key, value] of [["item", itemId], ["group", groupId], ["base", baseId]]) if (id(value)) query.set(key, value);
    const alternatives = [...new Set(withIds)].filter(id).slice(0, 3);
    for (const value of alternatives) query.append("with", value);
    if (id(baseId) && !alternatives.length) query.append("with", "");
    return `/compare${query.size ? `?${query}` : ""}`;
  }

  function createSavedSelection(selection, now = Date.now()) {
    const record = { version: 1, itemId: selection.itemId, groupId: selection.groupId, baseId: selection.baseId, withIds: [...selection.withIds], savedAt: now, expiresAt: now + STORAGE_TTL };
    if (!readSavedSelection(JSON.stringify(record), now).record) throw new Error("Invalid product selection");
    return record;
  }

  function readSavedSelection(raw, now = Date.now()) {
    if (raw === null || raw === undefined) return { record: null, error: null, expired: false };
    try {
      const value = JSON.parse(raw);
      if (!value || value.version !== 1 || ![value.itemId, value.groupId, value.baseId].every(id) || !Array.isArray(value.withIds) || value.withIds.length > 3 || !value.withIds.every(id) || new Set([value.baseId, ...value.withIds]).size !== value.withIds.length + 1 || !Number.isFinite(value.savedAt) || !Number.isFinite(value.expiresAt) || value.savedAt > now || value.expiresAt !== value.savedAt + STORAGE_TTL) throw new Error("Invalid saved comparison");
      if (value.expiresAt <= now) return { record: null, error: null, expired: true };
      return { record: { version: 1, itemId: value.itemId, groupId: value.groupId, baseId: value.baseId, withIds: [...value.withIds], savedAt: value.savedAt, expiresAt: value.expiresAt }, error: null, expired: false };
    } catch { return { record: null, error: "저장된 제품 선택을 읽을 수 없습니다. 다시 선택해 저장해 주세요.", expired: false }; }
  }

  function validateCatalog(catalog) {
    if (!catalog || !Array.isArray(catalog.items)) throw new Error("비교 자료를 불러오지 못했습니다.");
    const itemIds = new Set();
    for (const item of catalog.items) {
      if (!item || !id(item.id) || itemIds.has(item.id) || typeof item.title !== "string" || !Array.isArray(item.groups)) throw new Error("품목 비교 자료 형식을 확인할 수 없습니다.");
      itemIds.add(item.id);
      const groupIds = new Set();
      for (const group of item.groups) {
        if (!group || !id(group.id) || groupIds.has(group.id) || !Array.isArray(group.products) || !Array.isArray(group.attributeDefinitions)) throw new Error("비교 그룹 자료 형식을 확인할 수 없습니다.");
        groupIds.add(group.id);
        const keys = new Set();
        for (const definition of group.attributeDefinitions) {
          if (!definition || !attributeKey(definition.key) || keys.has(definition.key) || !["text", "number"].includes(definition.type) || typeof definition.label !== "string") throw new Error("비교 항목 자료 형식을 확인할 수 없습니다.");
          keys.add(definition.key);
        }
        const productIds = new Set();
        for (const product of group.products) {
          if (!product || !id(product.id) || productIds.has(product.id) || typeof product.name !== "string") throw new Error("제품 비교 자료 형식을 확인할 수 없습니다.");
          productIds.add(product.id);
        }
      }
    }
    return catalog;
  }

  return { STORAGE_KEY, STORAGE_TTL, PRICE_TTL, safeUrl, modelKey, namedModelCode, eligible, groupProducts, sameModel, selectProducts, expirePrice, attribute, compareAttributes, rowState, essentialDefinitions, parseQuery, selectionUrl, createSavedSelection, readSavedSelection, validateCatalog };
});
