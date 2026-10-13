(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./comparison-core.js"));
  else root.ComparisonLoader = factory(root.ComparisonCore);
})(typeof globalThis === "object" ? globalThis : this, function (core) {
  "use strict";
  const validId = value => typeof value === "string" && /^P\d{3}$/.test(value);

  function create(index, { fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
    if (!index || typeof index.version !== "string" || !index.version.trim() || !Array.isArray(index.items)) {
      throw new Error("비교 목록 형식을 확인할 수 없습니다.");
    }
    const allowedIds = new Set();
    for (const item of index.items) {
      if (!item || !validId(item.id) || allowedIds.has(item.id)) throw new Error("비교 목록의 품목 정보를 확인할 수 없습니다.");
      allowedIds.add(item.id);
    }
    if (typeof fetchImpl !== "function") throw new Error("비교 자료를 불러오는 기능을 사용할 수 없습니다.");
    if (typeof core?.validateCatalog !== "function") throw new Error("비교 자료를 확인하는 기능을 사용할 수 없습니다.");
    const version = encodeURIComponent(index.version);
    const cache = new Map();
    const pending = new Map();

    function loadItem(id) {
      if (!validId(id) || !allowedIds.has(id)) return Promise.reject(new Error("선택한 품목을 비교 목록에서 찾을 수 없습니다."));
      if (cache.has(id)) return Promise.resolve(cache.get(id));
      if (pending.has(id)) return pending.get(id);
      const request = Promise.resolve().then(async () => {
        let response;
        try {
          response = await fetchImpl(`/assets/comparison/${id}.json?v=${version}`);
        } catch (error) {
          throw new Error("비교 자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", { cause: error });
        }
        if (!response?.ok) throw new Error("비교 자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        let item;
        try {
          item = await response.json();
        } catch (error) {
          throw new Error("비교 자료 형식을 확인할 수 없습니다. 다시 시도해 주세요.", { cause: error });
        }
        if (!item || item.id !== id) throw new Error("요청한 품목과 다른 비교 자료입니다. 다시 시도해 주세요.");
        core.validateCatalog({ items: [item] });
        cache.set(id, item);
        return item;
      }).finally(() => pending.delete(id));
      pending.set(id, request);
      return request;
    }

    return { loadItem };
  }

  return { create };
});
