(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LifeServicesCore = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const TTL = 30 * 86400000;
  const STORAGE_KEY = "jachi:life-saved:v1";
  const REGION_KEY = "jachi:life-region:v1";
  const text = (value, limit = 80) => typeof value === "string" ? value.slice(0, limit).trim() : "";
  const normalize = value => String(value || "").normalize("NFKC").toLocaleLowerCase("ko").replace(/[··ㆍ,]/g, " ").replace(/\s+/g, " ").trim();
  function safeUrl(value) {
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.port ? url.href : ""; }
    catch { return ""; }
  }
  function validate(data) {
    if (data?.schemaVersion !== 2 || !Array.isArray(data.categories) || !data.categories.length || !Array.isArray(data.services) || !data.services.length || !Array.isArray(data.problems)) throw Error("Invalid life directory");
    const categories = new Set(), subtopics = new Set(), services = new Set();
    for (const c of data.categories) {
      if (!c.id || categories.has(c.id) || !c.label || !Array.isArray(c.subtopics)) throw Error("Invalid purpose");
      categories.add(c.id);
      for (const s of c.subtopics) { if (!s.id || subtopics.has(s.id) || !s.label) throw Error("Invalid subtopic"); subtopics.add(s.id); }
    }
    for (const s of data.services) {
      if (!s.id || services.has(s.id) || !s.name || !s.description || !s.whenToUse || !Array.isArray(s.keywords) || !s.categoryIds?.length || !s.categoryIds.every(id => categories.has(id)) || !Array.isArray(s.subtopicIds) || !s.subtopicIds.every(id => subtopics.has(id)) || !s.sources?.length) throw Error("Invalid service");
      services.add(s.id);
      const urls = [s.web?.url, s.androidUrl, s.iosUrl].filter(Boolean);
      if (!urls.length || ![...urls, ...s.sources].every(safeUrl)) throw Error("Invalid service URL");
      if (s.androidUrl && (new URL(s.androidUrl).hostname !== "play.google.com" || !new URL(s.androidUrl).searchParams.get("id"))) throw Error("Invalid Android link");
      if (s.iosUrl && (new URL(s.iosUrl).hostname !== "apps.apple.com" || !/\/id\d+/.test(new URL(s.iosUrl).pathname))) throw Error("Invalid iPhone link");
    }
    return data;
  }
  const synonyms = {
    "빨래": ["빨래", "세탁"], "쉰내": ["쉰내", "냄새"], "냄새": ["냄새", "쉰내"],
    "버리기": ["버리기", "폐기", "배출", "수거"], "음쓰": ["음식물"], "편의점택배": ["편의점 택배"],
    "헌옷": ["헌옷", "의류 수거"], "가스비": ["가스", "도시가스"], "전기세": ["전기요금", "전기"],
    "원룸": ["원룸", "매물"], "장볼": ["장보기", "식재료"], "배민": ["배민", "배달의민족"]
  };
  function filterServices(data, state) {
    const terms = normalize(state.q).split(" ").filter(Boolean);
    return data.services.filter(s => {
      if (!state.review && s.reviewRequired) return false;
      if (state.savedIds && !state.savedIds.has(s.id)) return false;
      if (state.category && !s.categoryIds.includes(state.category)) return false;
      if (state.subtopic && !s.subtopicIds.includes(state.subtopic)) return false;
      if (state.problem && !s.problemIds?.includes(state.problem)) return false;
      const problems = data.problems.filter(p => s.problemIds?.includes(p.id));
      const haystack = normalize([s.name, s.description, s.whenToUse, ...s.keywords,
        ...s.categoryIds.map(id => data.categories.find(c => c.id === id)?.label), ...problems.flatMap(p => p.keywords)].join(" "));
      return terms.every(term => (synonyms[term] || [term]).some(candidate => haystack.includes(candidate)));
    }).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }
  function readState(params, data, regions) {
    const view = ["services", "places", "saved"].includes(params.get("view")) ? params.get("view") : "services";
    const categories = view === "places" ? regions?.categories || [] : data.categories;
    const category = categories.some(c => c.id === params.get("category")) ? params.get("category") : "";
    const validSubtopics = data.categories.filter(c => !category || c.id === category).flatMap(c => c.subtopics);
    const district = regions?.districts.find(d => d.code === params.get("district"));
    const dongType = params.get("dongType") === "administrative" ? "administrative" : "legal";
    const dong = district?.[dongType]?.some(d => d.code === params.get("dong")) ? params.get("dong") : "";
    const page = Number(params.get("page"));
    return { view, q: text(params.get("q")), category,
      subtopic: view !== "places" && validSubtopics.some(s => s.id === params.get("subtopic")) ? params.get("subtopic") : "",
      problem: data.problems.some(p => p.id === params.get("problem")) ? params.get("problem") : "",
      district: district?.code || "", dong, dongType, page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1,
      review: params.get("review") === "1", detail: text(params.get("detail"), 180) };
  }
  function readSaved(raw, now = Date.now()) {
    try {
      const value = JSON.parse(raw || "{}");
      if (value.version !== 1 || !Array.isArray(value.entries)) return [];
      const seen = new Set();
      return value.entries.filter(entry => {
        const key = entry.kind + ":" + entry.id;
        if (!["service", "place"].includes(entry.kind) || !/^[\w.:-]{1,180}$/.test(entry.id || "") || !Number.isFinite(entry.savedAt) || entry.savedAt > now || entry.savedAt <= now - TTL || seen.has(key)) return false;
        if (entry.kind === "place" && (!entry.place || !text(entry.place.name, 240) || !text(entry.place.address, 400))) return false;
        seen.add(key); return true;
      }).slice(0, 500).map(entry => ({ kind: entry.kind, id: entry.id, savedAt: entry.savedAt,
        ...(entry.kind === "place" ? { place: { id: entry.id, name: text(entry.place.name, 240), address: text(entry.place.address, 400), categoryId: text(entry.place.categoryId), sourceDate: text(entry.place.sourceDate, 20),
          ...(Number.isFinite(entry.place.latitude) && Number.isFinite(entry.place.longitude) ? { latitude: entry.place.latitude, longitude: entry.place.longitude } : {}) } } : {}) }));
    } catch { return []; }
  }
  function readRegion(raw, regions, now = Date.now()) {
    try {
      const x = JSON.parse(raw || "{}");
      if (!Number.isFinite(x.savedAt) || x.savedAt <= now - TTL || x.savedAt > now) return null;
      if (!x.district) return { district: "", dong: "", dongType: "legal" };
      const district = regions.districts.find(d => d.code === x.district);
      const dongType = x.dongType === "administrative" ? "administrative" : "legal";
      if (!district) return null;
      return { district: district.code, dong: district[dongType].some(d => d.code === x.dong) ? x.dong : "", dongType };
    } catch { return null; }
  }
  function displayName(value) {
    let name = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[;；]+/g, ' ').replace(/\s+/g, ' ').trim();
    for (const [open, close] of [['(', ')'], ['[', ']']]) {
      if (name.startsWith(open) && !name.includes(close)) name = name.slice(1).trim();
    }
    return name;
  }
  function placeLink(place) {
    const name = displayName(place.name);
    const lat = place.latitude, lng = place.longitude;
    if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132) {
      return { url: 'https://map.kakao.com/link/map/' + encodeURIComponent(name) + ',' + lat + ',' + lng, label: '위치 보기', kind: 'coordinate' };
    }
    return { url: 'https://map.kakao.com/link/search/' + encodeURIComponent(name), label: '상호명 검색', kind: 'search' };
  }
  function pageNumbers(page, pages, compact = false) {
    const size = compact ? 3 : 5;
    const start = compact ? Math.max(1, Math.min(page - 1, pages - size + 1)) : Math.floor((page - 1) / size) * size + 1;
    const chosen = new Set(Array.from({ length: Math.min(size, pages - start + 1) }, (_, n) => start + n));
    if (!compact) { chosen.add(1); chosen.add(pages); }
    const result = [];
    for (const n of [...chosen].sort((a, b) => a - b)) {
      if (result.length && n > result.at(-1) + 1) result.push(null);
      result.push(n);
    }
    if (compact && result.at(-1) < pages) result.push(null);
    return result;
  }
  return { TTL, STORAGE_KEY, REGION_KEY, normalize, safeUrl, validate, filterServices, readState, readSaved, readRegion, displayName, placeLink, pageNumbers };
});
