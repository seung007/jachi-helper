(() => {
  "use strict";
  const root = document.getElementById("servicesDirectory");
  const C = window.LifeServicesCore;
  if (!root || !C) return;
  const $ = id => document.getElementById(id);
  const grid = $("serviceGrid"), detail = $("serviceDetail"), regionDialog = $("serviceRegionDialog");
  const pageSize = 12;
  let data, regions = { districts: [], categories: [], source: {} }, state;
  let saved = [], placeResults = new Map(), requestId = 0, placeController, detailTrigger, detailFocusKey, renderedDetail;
  const icons = { shopping: "ShoppingBasket", meals: "ShoppingBasket", laundry: "WashingMachine", cleaning: "Sparkles", waste: "Recycle", official: "BookOpen" };
  const el = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  };
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", class: "service-icon" })) svg.setAttribute(key, value);
    for (const [tag, attrs] of window.JachiIcons?.[name] || []) {
      const shape = document.createElementNS(svg.namespaceURI, tag);
      for (const [key, value] of Object.entries(attrs)) shape.setAttribute(key, value);
      svg.append(shape);
    }
    return svg;
  }
  root.querySelectorAll("[data-service-icon]").forEach(node => {
    const svg = icon(node.dataset.serviceIcon);
    if (node.className) svg.classList.add(node.className);
    node.replaceWith(svg);
  });
  function button(label, className, action, iconName) {
    const node = el("button", className, label);
    node.type = "button";
    if (iconName) node.prepend(icon(iconName));
    node.addEventListener("click", action);
    return node;
  }
  function track(name, values) {
    try {
      const canonical = document.querySelector('link[rel="canonical"]');
      if (canonical && new URL(canonical.href).origin === location.origin) window.gtag?.("event", name, values);
    } catch { /* Analytics must not interrupt navigation. */ }
  }
  function loadSaved() {
    try { saved = C.readSaved(localStorage.getItem(C.STORAGE_KEY)); }
    catch { saved = []; }
    $("lifeSavedCount").textContent = saved.length;
    for (const entry of saved) if (entry.kind === "place") placeResults.set(entry.id, entry.place);
  }
  const isSaved = (kind, id) => saved.some(s => s.kind === kind && s.id === id);
  function save(kind, entry) {
    loadSaved();
    const exists = isSaved(kind, entry.id);
    const next = exists ? saved.filter(s => s.kind !== kind || s.id !== entry.id) :
      [...saved, { kind, id: entry.id, savedAt: Date.now(), ...(kind === "place" ? { place: { id: entry.id, name: entry.name, address: entry.address, categoryId: entry.categoryId, latitude: entry.latitude, longitude: entry.longitude, sourceDate: entry.sourceDate || "2026-06-30" } } : {}) }];
    if (next.length > 500) { $("serviceStorageStatus").textContent = "저장 목록이 가득 찼습니다. 이전 항목을 해제해 주세요."; return; }
    try {
      localStorage.setItem(C.STORAGE_KEY, JSON.stringify({ version: 1, entries: next }));
      loadSaved();
      $("serviceStorageStatus").textContent = exists ? "저장을 해제했습니다." : "이 기기에 저장했습니다.";
      track("service_save", { resource_id: entry.id, resource_type: kind, saved: !exists });
      void render();
      if (detail.open) updateDetailSave(kind, entry);
    } catch { $("serviceStorageStatus").textContent = "저장하지 못했습니다. 브라우저 저장 설정을 확인해 주세요."; }
  }
  function saveButton(kind, entry) {
    const selected = isSaved(kind, entry.id);
    const node = button("", "service-icon-button service-save" + (selected ? " is-saved" : ""), () => save(kind, entry), "Bookmark");
    node.setAttribute("aria-label", entry.name + (selected ? " 저장 해제" : " 저장"));
    node.title = selected ? "저장 해제" : "저장";
    node.setAttribute("aria-pressed", String(selected));
    node.dataset.saveResource = kind + ":" + entry.id;
    return node;
  }
  function outbound(url, label, id, platform) {
    const link = el("a", "service-outbound", label);
    link.href = C.safeUrl(url);
    link.target = "_blank"; link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", label + " · 새 탭");
    link.dataset.serviceLink = id; link.dataset.platform = platform;
    link.append(icon("ExternalLink"));
    link.addEventListener("click", () => track("service_link_click", { resource_id: id, platform, purpose_id: state.category || "all", placement: detail.open ? "detail" : "list" }));
    return link;
  }
  function writeState(mode = "replaceState") {
    const url = new URL(location.href);
    const values = { view: state.view === "services" ? "" : state.view, q: state.q, category: state.category,
      subtopic: state.subtopic, problem: state.problem, district: state.district || "all", dong: state.dong,
      dongType: state.dongType === "legal" ? "" : state.dongType, page: state.page > 1 ? state.page : "",
      review: state.review ? "1" : "", detail: state.detail };
    for (const [key, value] of Object.entries(values)) {
      if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
    }
    history[mode]({ ...(mode === "replaceState" ? history.state : {}), lifeScroll: window.scrollY, lifeDetail: !!state.detail }, "", url);
  }
  function change(patch, focus = false) {
    if (!data || !state) return;
    history.replaceState({ ...history.state, lifeScroll: window.scrollY }, "");
    state = { ...state, ...patch, detail: "" };
    closeDialog(false);
    writeState("pushState");
    void render().then(() => {
      if (focus) { $("serviceListTitle").focus({ preventScroll: true }); $("serviceListTitle").scrollIntoView({ block: "start" }); }
    });
  }
  function regionLabel() {
    const district = regions.districts.find(d => d.code === state.district);
    if (!district) return "서울 전체";
    const dong = district[state.dongType]?.find(d => d.code === state.dong);
    return district.name + (dong ? " " + dong.name : " 전체");
  }
  function options(node, rows, first, value) {
    node.replaceChildren(el("option", "", first));
    node.firstChild.value = "";
    for (const row of rows) { const option = el("option", "", row.label || row.name); option.value = row.id || row.code; node.append(option); }
    node.value = value;
  }
  function renderControls() {
    $("serviceQuery").value = state.q;
    $("serviceQueryLabel").textContent = state.view === "places" ? "장소·주소 검색" : "앱·생활 문제 검색";
    $("serviceQuery").placeholder = state.view === "places" ? "빨래방, 편의점, 가게 이름..." : "이불 세탁, 음식물, 편의점...";
    const categoryRows = state.view === "places" ? regions.categories : data.categories;
    options($("serviceCategory"), categoryRows, state.view === "places" ? "전체 업종" : "전체 목적", state.category);
    $("serviceCategoryLabel").textContent = state.view === "places" ? "장소 종류" : "생활 목적";
    $("serviceSubtopicField").hidden = state.view === "places";
    const select = $("serviceSubtopic");
    select.replaceChildren(el("option", "", "전체 세부 목적")); select.firstChild.value = "";
    for (const c of data.categories.filter(c => !state.category || c.id === state.category)) {
      const group = el("optgroup"); group.label = c.label;
      for (const t of c.subtopics) { const option = el("option", "", t.label); option.value = t.id; group.append(option); }
      select.append(group);
    }
    select.value = state.subtopic;
    $("serviceReviewLabel").hidden = state.view === "places";
    $("serviceReview").checked = state.review;
    $("serviceRegionLabel").textContent = regionLabel();
    $("serviceRegionOpen").disabled = !regions.districts.length;
    root.querySelectorAll("[data-service-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.serviceView === state.view)));
    $("serviceAppliedFilters").textContent = [categoryRows.find(c => c.id === state.category)?.label,
      data.categories.flatMap(c => c.subtopics).find(t => t.id === state.subtopic)?.label,
      data.problems.find(p => p.id === state.problem)?.label].filter(Boolean).join(" · ");
    $("serviceProblems").replaceChildren(...data.problems.map(p => {
      const node = button(p.label, "", () => change({ problem: state.problem === p.id ? "" : p.id, category: state.view === "places" ? p.placeCategory || "" : "", subtopic: "", q: "", page: 1 }), p.icon);
      node.setAttribute("aria-pressed", String(state.problem === p.id)); return node;
    }));
    renderContext();
  }
  function renderContext() {
    const box = $("serviceProblemContext"), problem = data.problems.find(p => p.id === state.problem);
    box.replaceChildren(); box.hidden = !problem;
    if (!problem) return;
    box.append(el("h2", "", problem.label), el("p", "", problem.note));
    const actions = el("div", "service-context-actions");
    for (const action of problem.actions) { const link = el("a", "", action.label); link.href = action.href; link.append(icon("ArrowRight")); actions.append(link); }
    if (problem.placeCategory && state.view !== "places") actions.append(button("근처 장소", "", () => change({ view: "places", category: problem.placeCategory, subtopic: "", q: "", page: 1 }), "MapPin"));
    if (state.view === "places") actions.append(button("관련 앱·사이트", "", () => change({ view: "services", category: "", subtopic: "", q: "", page: 1 }), "ArrowRight"));
    box.append(actions);
  }
  function serviceCard(service) {
    const article = el("article", "service-entry"); article.dataset.serviceId = service.id;
    const badge = el("div", "service-entry-icon"); badge.append(icon(service.type === "official" ? "BookOpen" : icons[service.categoryIds[0]] || "ListFilter"));
    const body = el("div", "service-entry-body");
    body.append(el("p", "service-entry-purpose", (service.type === "official" ? "공식 안내 · " : "") + service.categoryIds.map(id => data.categories.find(c => c.id === id)?.label).filter(Boolean).join(" · ")));
    const heading = el("h3");
    const open = button(service.name, "service-title-button", event => openDetail("service", service, true, event.currentTarget));
    open.dataset.detailFocus = "service:" + service.id;
    heading.append(open);
    body.append(heading, el("p", "service-entry-description", service.description));
    if (service.reviewRequired) body.append(el("p", "service-review-note", service.reviewReason));
    const actions = el("div", "service-entry-actions");
    actions.append(button("이용 조건", "service-detail-link", event => openDetail("service", service, true, event.currentTarget), "ChevronDown"));
    const primary = service.web || (service.androidUrl ? { url: service.androidUrl, label: "Android 앱" } : { url: service.iosUrl, label: "iPhone 앱" });
    if (primary.url) actions.append(outbound(primary.url, primary.label, service.id, service.web ? "web" : service.androidUrl ? "android" : "ios"));
    body.append(actions);
    article.append(badge, body, saveButton("service", service));
    return article;
  }
  function placeCard(place) {
    const article = el("article", "service-entry"); article.dataset.placeId = place.id;
    const badge = el("div", "service-entry-icon"); badge.append(icon("MapPin"));
    const body = el("div", "service-entry-body");
    body.append(el("p", "service-entry-purpose", regions.categories.find(c => c.id === place.categoryId)?.label || "서울 생활 장소"));
    const heading = el("h3"), open = button(C.displayName(place.name), "service-title-button", event => openDetail("place", place, true, event.currentTarget));
    open.dataset.detailFocus = "place:" + place.id; heading.append(open);
    body.append(heading, el("p", "service-entry-description", place.address));
    const actions = el("div", "service-entry-actions");
    actions.append(button("장소 정보", "service-detail-link", event => openDetail("place", place, true, event.currentTarget), "ChevronDown"));
    const map = C.placeLink(place);
    actions.append(outbound(map.url, map.label, place.id, "map"));
    body.append(actions); article.append(badge, body, saveButton("place", place));
    return article;
  }
  function feedback(message, label, action) {
    const box = el("div", "service-feedback-message");
    box.append(el("p", "", message));
    if (label) box.append(button(label, "service-primary-button", action));
    $("serviceFeedback").replaceChildren(box);
  }
  function pagination(total) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    $("servicePagination").hidden = total <= pageSize;
    $("servicePrevious").disabled = state.page <= 1;
    $("serviceNext").disabled = state.page >= pages;
    $("servicePageLabel").replaceChildren(...C.pageNumbers(state.page, pages, matchMedia('(max-width: 600px)').matches).map(n => {
      if (n === null) return el('span', 'service-page-gap', '…');
      const node = button(String(n), 'service-page-number', () => change({ page: n }, true));
      node.setAttribute('aria-label', n + ' 페이지');
      if (n === state.page) node.setAttribute('aria-current', 'page');
      return node;
    }));
    $("serviceResultCount").textContent = total ? state.page + ' / ' + pages + ' 페이지' : '검색 결과 없음';
  }
  async function render() {
    const token = ++requestId;
    placeController?.abort();
    renderControls();
    root.dataset.state = "loading"; grid.setAttribute("aria-busy", "true");
    $("serviceFeedback").replaceChildren(); grid.replaceChildren();
    const category = (state.view === "places" ? regions.categories : data.categories).find(c => c.id === state.category);
    $("serviceListTitle").textContent = state.view === "saved" ? "저장한 서비스·장소" : state.q ? "‘" + state.q + "’ 검색 결과" : category?.label || (state.view === "places" ? "우리동네 장소" : "앱·공식 사이트");
    $("serviceScope").textContent = state.view === "places" ? regionLabel() + " · 수집 기준 2026.06.30. 현재 영업·재고·예약 여부는 방문 전에 확인해 주세요." : state.view === "saved" ? "이 기기에 30일 동안 저장됩니다. 상품 저장 목록은 그대로 유지됩니다." : regionLabel() + " · 방문·배송·공공지원의 주소별 이용 조건은 공식 서비스에서 확인해 주세요.";
    try {
      let rows, total;
      if (state.view === "places") {
        $("serviceResultCount").textContent = "장소를 찾는 중입니다."; $("servicePagination").hidden = true;
        const params = new URLSearchParams({ page: state.page, pageSize, dongType: state.dongType });
        for (const key of ["district", "dong", "category", "q"]) if (state[key]) params.set(key, state[key]);
        placeController = new AbortController();
        const controller = placeController, timeout = setTimeout(() => controller.abort(), 15000);
        let result;
        try { const response = await fetch("/api/life/places?" + params, { signal: controller.signal }); if (!response.ok) throw Error("Places unavailable"); result = await response.json(); }
        finally { clearTimeout(timeout); }
        if (token !== requestId) return;
        if (!Array.isArray(result.results) || !Number.isSafeInteger(result.total)) throw Error("Invalid places");
        state.page = result.page;
        rows = result.results.map(p => ({ ...p, sourceDate: result.source?.dataAsOf || "2026-06-30" }));
        rows.forEach(p => placeResults.set(p.id, p)); total = result.total;
        grid.replaceChildren(...rows.map(placeCard));
        $("serviceDataNote").textContent = "서울 상가 원자료의 업종별 장소 목록입니다. 동일 업종이라고 특정 품목 판매·세탁 접수·현재 영업을 보장하지 않습니다. 법정동·행정동은 구분합니다.";
      } else {
        const savedIds = state.view === "saved" ? new Set(saved.filter(s => s.kind === "service").map(s => s.id)) : null;
        rows = C.filterServices(data, { ...state, savedIds });
        const places = state.view === "saved" && !state.category && !state.subtopic && !state.problem ? saved.filter(s => s.kind === "place" && (!state.q || C.normalize(s.place.name + " " + s.place.address).includes(C.normalize(state.q)))).map(s => s.place) : [];
        const combined = [...rows.map(value => ({ kind: "service", value })), ...places.map(value => ({ kind: "place", value }))];
        total = combined.length; state.page = Math.min(state.page, Math.max(1, Math.ceil(total / pageSize)));
        grid.replaceChildren(...combined.slice((state.page - 1) * pageSize, state.page * pageSize).map(r => r.kind === "service" ? serviceCard(r.value) : placeCard(r.value)));
        $("serviceDataNote").textContent = "이름 가나다순입니다. 공식 소개·연결 주소 확인은 실제 설치·예약이나 개별 주소 제공 검증과 다릅니다. 자취도우미는 예약·계약의 당사자가 아닙니다.";
      }
      if (token !== requestId) return;
      pagination(total); root.dataset.state = "ready"; grid.setAttribute("aria-busy", "false");
      if (!total) feedback(state.view === "saved" ? "이 조건에 저장한 항목이 없습니다." : state.q ? "일치하는 정보가 없습니다. 검색어나 목적을 바꿔 보세요." : "이 조건에 확인된 연결 정보가 아직 없습니다.", "조건 초기화", resetFilters);
      writeState();
      restoreDetail();
    } catch (error) {
      if (token !== requestId) return;
      root.dataset.state = "error"; grid.setAttribute("aria-busy", "false"); $("servicePagination").hidden = true;
      $("serviceResultCount").textContent = "불러오기 실패";
      feedback(state.view === "places" ? "동네 장소를 불러오지 못했습니다. 앱·공식 안내는 계속 볼 수 있습니다." : "목록을 불러오지 못했습니다.", "다시 시도", () => void render());
    }
  }
  function updateDetailSave(kind, entry) {
    const slot = $("serviceDetailBody").querySelector("[data-detail-save]");
    if (slot) {
      const focused = slot.contains(document.activeElement);
      slot.replaceChildren(saveButton(kind, entry), el("span", "", isSaved(kind, entry.id) ? "저장됨" : "이 기기에 저장"));
      if (focused) slot.firstChild.focus({ preventScroll: true });
    }
  }
  function condition(body, label, value) {
    const section = el("section", "service-detail-section");
    section.append(el("h3", "", label), el("p", "", value)); body.append(section);
  }
  function openDetail(kind, entry, push = true, trigger) {
    if (!detail.open) detailTrigger = trigger || document.activeElement;
    detailFocusKey = kind + ":" + entry.id;
    state.detail = kind + ":" + entry.id;
    renderedDetail = state.detail;
    if (push) { writeState("pushState"); history.replaceState({ ...history.state, lifeDetailPushed: true }, ""); }
    $("serviceDetailKind").textContent = kind === "place" ? "우리동네 · 수집 자료" : entry.type === "official" ? "공식 생활 안내" : "생활 서비스";
    const body = $("serviceDetailBody"); body.replaceChildren();
    body.append(el("h2", "", kind === 'place' ? C.displayName(entry.name) : entry.name)); body.firstChild.id = "serviceDetailTitle";
    if (kind === "service") {
      body.append(el("p", "service-detail-lead", entry.description));
      if (entry.reviewRequired) body.append(el("p", "service-review-note", entry.reviewReason));
      condition(body, "이럴 때 살펴보세요", entry.whenToUse);
      condition(body, "지역·이용 조건", entry.regionCheck);
      condition(body, "비용 확인", entry.costCheck);
      if (entry.conditions?.length) {
        const section = el("section", "service-detail-section"); section.append(el("h3", "", "이용 전 확인"));
        const list = el("ul"); entry.conditions.forEach(value => list.append(el("li", "", value))); section.append(list); body.append(section);
      }
      const links = el("div", "service-detail-links");
      if (entry.web) links.append(outbound(entry.web.url, entry.web.label, entry.id, "web"));
      if (entry.iosUrl) links.append(outbound(entry.iosUrl, "iPhone 앱", entry.id, "ios"));
      if (entry.androidUrl) links.append(outbound(entry.androidUrl, "Android 앱", entry.id, "android"));
      body.append(links, el("p", "service-field-note", entry.linkNotes));
      const source = el("details", "service-detail-sources"); source.append(el("summary", "", "확인 근거 · " + (entry.checkedOn || "확인일 미상")));
      source.append(el("p", "", entry.verification), el("p", "", "운영자 · " + (entry.operator || "공식 페이지에서 확인 필요")));
      entry.sources.forEach((url, i) => source.append(outbound(url, "공식 근거 " + (i + 1), entry.id, "source")));
      body.append(source);
    } else {
      condition(body, "주소", entry.address);
      condition(body, "방문 전 확인", "현재 영업·휴무·취급 품목·이용 조건은 지도나 해당 장소에서 확인하세요.");
      condition(body, "자료 기준", (entry.sourceDate || "2026-06-30") + " 서울 상가 원자료. 실제 영업 확인이나 중복 점포 제거를 완료한 목록은 아닙니다.");
      const map = C.placeLink(entry);
      body.append(outbound(map.url, map.label, entry.id, "map"));
    }
    const saveSlot = el("div", "service-detail-save"); saveSlot.dataset.detailSave = ""; body.append(saveSlot); updateDetailSave(kind, entry);
    if (!detail.open) detail.showModal();
    document.documentElement.style.overflow = "hidden"; detail.scrollTop = 0; $("serviceDetailClose").focus();
    if (push) track(state.view === "saved" ? "service_reopen" : "service_detail_open", { resource_id: entry.id, resource_type: kind, purpose_id: state.category || "all" });
  }
  function restoreDetail() {
    if (!state.detail) { closeDialog(false); return; }
    if (detail.open && renderedDetail === state.detail) return;
    const separator = state.detail.indexOf(":"), kind = state.detail.slice(0, separator), id = state.detail.slice(separator + 1);
    const entry = kind === "service" ? data.services.find(s => s.id === id) : kind === "place" ? placeResults.get(id) : null;
    if (entry) openDetail(kind, entry, false);
    else { state.detail = ""; closeDialog(false); writeState(); }
  }
  function closeDialog(update = true) {
    if (detail.open) detail.close();
    if (!regionDialog.open) document.documentElement.style.overflow = "";
    if (update && state?.detail) {
      state.detail = "";
      if (history.state?.lifeDetailPushed) history.back(); else writeState();
    }
    const trigger = detailTrigger?.isConnected ? detailTrigger : Array.from(grid.querySelectorAll("[data-detail-focus]")).find(n => n.dataset.detailFocus === detailFocusKey);
    trigger?.focus({ preventScroll: true });
  }
  function resetFilters() { change({ q: "", category: "", subtopic: "", problem: "", review: false, page: 1 }); }
  function renderDongOptions(keep = "") {
    const district = regions.districts.find(d => d.code === $("serviceRegionDistrict").value);
    const type = $("serviceDongType").value;
    const q = C.normalize($("serviceDongSearch").value);
    const rows = (district?.[type] || []).filter(d => C.normalize(d.name).includes(q));
    options($("serviceRegionDong"), rows, district ? "구 전체" : "구를 먼저 선택하세요", keep);
    $("serviceRegionDong").disabled = !district;
    $("serviceDongSearch").disabled = !district;
  }
  function openRegion() {
    if (!state || !regions.districts.length) return;
    options($("serviceRegionDistrict"), regions.districts, "서울 전체", state.district);
    $("serviceDongType").value = state.dongType; $("serviceDongSearch").value = "";
    renderDongOptions(state.dong);
    try { $("serviceRememberRegion").checked = !!C.readRegion(localStorage.getItem(C.REGION_KEY), regions); } catch { $("serviceRememberRegion").checked = false; }
    $("serviceRegionSource").textContent = "2026년 6월 상가 자료에 관측된 25개 구·법정동 466개·행정동 427개입니다. 서울시 안내의 법정동 467개와 차이가 있어 최신 지역 전체를 보장하지 않습니다. 검색 결과가 없다고 실제 장소가 없는 것은 아닙니다.";
    regionDialog.showModal(); document.documentElement.style.overflow = "hidden"; $("serviceRegionDistrict").focus();
  }
  function closeRegion() { regionDialog.close(); if (!detail.open) document.documentElement.style.overflow = ""; $("serviceRegionOpen").focus(); }
  $("serviceRegionForm").addEventListener("submit", event => {
    event.preventDefault();
    const region = { district: $("serviceRegionDistrict").value, dong: $("serviceRegionDong").value, dongType: $("serviceDongType").value };
    try { if ($("serviceRememberRegion").checked) localStorage.setItem(C.REGION_KEY, JSON.stringify({ ...region, savedAt: Date.now() })); else localStorage.removeItem(C.REGION_KEY); }
    catch { $("serviceStorageStatus").textContent = "지역을 기기에 저장하지 못했습니다. 이번 탐색에는 적용됩니다."; }
    closeRegion(); change({ ...region, page: 1 });
  });
  $("serviceRegionDistrict").addEventListener("change", () => { $("serviceDongSearch").value = ""; renderDongOptions(); });
  $("serviceDongType").addEventListener("change", () => { $("serviceDongSearch").value = ""; renderDongOptions(); });
  $("serviceDongSearch").addEventListener("input", () => renderDongOptions());
  $("serviceRegionOpen").addEventListener("click", openRegion);
  $("serviceRegionClose").addEventListener("click", closeRegion);
  regionDialog.addEventListener("cancel", event => { event.preventDefault(); closeRegion(); });
  $("serviceDetailClose").addEventListener("click", () => closeDialog());
  detail.addEventListener("cancel", event => { event.preventDefault(); closeDialog(); });
  $("serviceSearch").addEventListener("submit", event => {
    event.preventDefault(); if (!data) return;
    change({ q: $("serviceQuery").value.trim().slice(0, 80), page: 1 });
    track("service_search", { purpose_id: state.category || "all", view: state.view, has_query: !!state.q });
  });
  $("serviceCategory").addEventListener("change", () => { if (data) change({ category: $("serviceCategory").value, subtopic: "", problem: "", page: 1 }); });
  $("serviceSubtopic").addEventListener("change", () => {
    if (!data || !state) return;
    const subtopic = $("serviceSubtopic").value;
    const category = data.categories.find(c => c.subtopics.some(t => t.id === subtopic))?.id || state.category;
    change({ subtopic, category, problem: "", page: 1 });
  });
  $("serviceReview").addEventListener("change", () => change({ review: $("serviceReview").checked, page: 1 }));
  $("serviceReset").addEventListener("click", resetFilters);
  root.querySelectorAll("[data-service-view]").forEach(node => node.addEventListener("click", () => {
    if (!data) return;
    change({ view: node.dataset.serviceView, q: "", category: "", subtopic: "", problem: "", page: 1 });
  }));
  $("servicePrevious").addEventListener("click", () => change({ page: Math.max(1, state.page - 1) }, true));
  $("serviceNext").addEventListener("click", () => change({ page: state.page + 1 }, true));
  window.addEventListener("popstate", event => {
    if (!data) return;
    const scroll = event.state?.lifeScroll || 0;
    state = C.readState(new URLSearchParams(location.search), data, regions);
    void render().then(() => requestAnimationFrame(() => window.scrollTo(0, scroll)));
  });
  window.addEventListener("storage", event => { if (event.key === C.STORAGE_KEY && data) { loadSaved(); void render(); } });
  async function load() {
    $("serviceRegionOpen").disabled = true;
    root.dataset.state = "loading"; grid.setAttribute("aria-busy", "true");
    feedback("생활 정보를 불러오는 중입니다.");
    try {
      const read = async path => { const response = await fetch(path, { signal: AbortSignal.timeout(15000) }); if (!response.ok) throw Error("Unavailable"); return response.json(); };
      const results = await Promise.allSettled([read("/data/life-services.json?v=20261018-1"), read("/data/life-regions.json?v=20261018-1")]);
      if (results[0].status !== "fulfilled") throw Error("Unavailable");
      data = C.validate(results[0].value);
      if (results[1].status === "fulfilled" && Array.isArray(results[1].value.districts)) regions = results[1].value;
      const params = new URLSearchParams(location.search);
      if (!params.has("district")) {
        try { const region = C.readRegion(localStorage.getItem(C.REGION_KEY), regions); if (region) Object.entries(region).forEach(([k, v]) => params.set(k, v)); } catch { /* Optional preference. */ }
      }
      state = C.readState(params, data, regions); loadSaved(); await render();
    } catch {
      root.dataset.state = "error"; grid.setAttribute("aria-busy", "false");
      $("serviceResultCount").textContent = "불러오기 실패";
      feedback("생활 정보를 불러오지 못했습니다.", "다시 시도", load);
    }
  }
  void load();
})();
