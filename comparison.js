(() => {
  "use strict";
  const C = window.ComparisonCore, D = window.ComparisonDisplay;
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const icon = n => `<svg class="comparison-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(window.JachiIcons?.[n] || []).map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k,v]) => `${k}="${esc(v)}"`).join(" ")}></${tag}>`).join("")}</svg>`;
  const date = (v, full = false) => Number.isFinite(Date.parse(v)) ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", ...(full ? {timeStyle:"short"} : {}), timeZone:"Asia/Seoul" }).format(Date.parse(v)) : "확인 시각 미제공";
  const status = v => { $("#comparisonStatus").textContent = v; };
  const error = v => { $("#comparisonError").textContent = v; $("#comparisonError").hidden = !v; };
  let catalog, loader, currentItem, currentGroup, saved, pendingNavigation, request = 0, replaceId = "", renderedColumns;
  let options = new Map();
  let featureFilters = new Map(), availableFilters = [];
  const state = { itemId:"", groupId:"", baseId:"", withIds:[], activeId:"", view:"browse", columns:2, scope:"essential", differences:false, heat:"all" };
  const cookware = () => ['P051','P052'].includes(currentItem?.id);
  const selection = () => ({ itemId:state.itemId, groupId:state.groupId, baseId:state.baseId, withIds:state.withIds });
  const ids = () => [state.baseId,...state.withIds].filter(Boolean);
  const selected = () => ids().map(id => currentGroup?.products.find(p => p.id === id)).filter(Boolean);
  const columns = () => innerWidth < 700 ? 2 : innerWidth < 1100 ? Math.min(state.columns,3) : state.columns;
  const visible = () => {
    const all = selected(), alternatives = all.slice(1);
    const active = alternatives.find(p => p.id === state.activeId) || alternatives[0];
    return [all[0],active,...alternatives.filter(p => p !== active)].filter(Boolean).slice(0,columns());
  };
  document.querySelectorAll("[data-icon]").forEach(el => { el.innerHTML = icon(el.dataset.icon); });
  document.addEventListener("error", e => {
    if (!(e.target instanceof HTMLImageElement) || !e.target.closest(".comparison-photo")) return;
    const text = document.createElement("span"); text.textContent = "사진을 불러오지 못했습니다"; e.target.replaceWith(text);
  },true);
  function readStorage() {
    try {
      const r = C.readSavedSelection(localStorage.getItem(C.STORAGE_KEY));
      if (r.error) error(r.error);
      if (r.expired) status("저장한 제품 선택의 30일 보관 기간이 끝났습니다.");
      return saved = r.record;
    } catch { error("브라우저 저장소에 접근할 수 없습니다. 제품 선택은 이 화면에서만 유지됩니다."); return null; }
  }
  function syncUrl() {
    try { history.replaceState(null,"",state.baseId ? C.selectionUrl(selection()) : `/compare?${new URLSearchParams({item:state.itemId,group:state.groupId})}`); }
    catch { error("비교 링크를 갱신하지 못했습니다."); }
  }
  function changeProducts(next) {
    const products = currentGroup?.products || [], first = products.find(p => p.id === next[0] && C.eligible(p));
    const r = first ? C.selectProducts(products,first.id,next.slice(1)) : {base:null,alternatives:[]};
    state.baseId = r.base?.id || ""; state.withIds = r.alternatives.map(p => p.id);
    if (!state.baseId) state.view = "browse";
    if (!state.withIds.includes(state.activeId)) state.activeId = state.withIds[0] || "";
    syncUrl(); render();
  }
  async function resolve(next,view = "browse") {
    const token = ++request;
    pendingNavigation = {next,view};
    document.body.dataset.comparisonReady = "loading";
    $("#comparisonMain").setAttribute("aria-busy","true");
    $("#retryLoad").hidden = true;
    const meta = catalog.items.find(i => i.id === next.itemId) || catalog.items.find(i => i.groups.length);
    if (!meta) { currentItem = currentGroup = null; $("#comparisonMain").removeAttribute("aria-busy"); render(); return; }
    if (next.itemId && next.itemId !== meta.id) error("요청한 품목을 찾을 수 없습니다. 사용 가능한 품목을 표시합니다.");
    $("#comparisonItem").disabled = true; $("#comparisonGroup").disabled = true;
    try {
      const item = loader ? await loader.loadItem(meta.id) : meta;
      if (token !== request) return;
      currentItem = item; options = new Map(); featureFilters = new Map();
      currentGroup = item.groups.find(g => g.id === next.groupId) || item.groups[0];
      if (next.groupId && next.groupId !== currentGroup?.id) error("요청한 사용 목적을 찾을 수 없습니다. 사용 가능한 목적을 표시합니다.");
      state.itemId = item.id; state.groupId = currentGroup?.id || ""; state.view = view;
      const wanted = [next.baseId,...(next.withIds || [])].filter(Boolean);
      changeProducts(wanted);
      if (wanted.some(id => !ids().includes(id))) status("중복 모델 또는 확인되지 않은 제품 선택은 제외했습니다.");
    } catch (e) {
      if (token !== request) return;
      error(e.message || "상품 자료를 불러오지 못했습니다. 다시 선택해 주세요.");
      $("#retryLoad").hidden = false;
      $("#comparisonItem").disabled = false; $("#comparisonGroup").disabled = false;
      document.body.dataset.comparisonReady = "error";
    } finally {
      if (token === request) $("#comparisonMain").removeAttribute("aria-busy");
    }
  }
  function photo(p) {
    const url = C.safeUrl(p.imageUrl,{allowLocal:true});
    return `<div class="comparison-photo">${url ? `<img src="${esc(url)}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer" />` : "<span>사진 미제공</span>"}</div>`;
  }
  function buy(p) {
    const coupang = D.coupangLink(p,currentItem,currentGroup);
    const primary = coupang ? `<a class="comparison-buy comparison-coupang" data-coupang="${esc(p.id)}" data-link-kind="${coupang.kind}" href="${esc(coupang.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(p.name)} ${coupang.label}">${coupang.label} ${icon("ExternalLink")}</a>` : '';
    return primary;
  }
  function originalLink(p) {
    const url = C.safeUrl(p.url);
    const original = url ? `<a class="comparison-original" data-purchase="${esc(p.id)}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">상품 원문 ${icon("ExternalLink")}</a>` : '<span class="comparison-muted">판매처 링크 미확인</span>';
    return original;
  }
  function detailText(text) {
    const chars = Array.from(String(text));
    return chars.length > 80 ? `<span>${esc(chars.slice(0,80).join(''))}...</span><details class="comparison-meta-full"><summary>원문 전체</summary><p>${esc(text)}</p></details>` : `<span>${esc(text)}</span>`;
  }
  function cookingInfo(p, limit = 6) {
    if (D.details) {
      const fields = D.details(currentItem,currentGroup,p,{limit});
      return fields.length ? `<dl class="comparison-cooking-details" data-profile-details>${fields.map(f => `<div data-profile-key="${esc(f.key)}" data-cooking="${esc(f.label)}" data-state="${esc(f.state)}"><dt>${esc(f.label)}</dt><dd>${detailText(f.text)}</dd></div>`).join('')}</dl>` : '';
    }
    if (!cookware() && currentItem?.id !== 'P154') return '';
    const facts = D.cookingDetails(p);
    const keys = cookware() ? ['induction','gas'] : [];
    const fields = keys.map(key => facts[key]);
    const capacity = currentGroup.attributeDefinitions.find(d => d.key === 'capacity');
    fields.push({label:'용량',state:capacity ? C.attribute(p,capacity).status : 'unknown',text:capacity ? D.present(p,capacity).text : '미확인'},facts.servings);
    if (cookware()) fields.push(facts.oven,facts.dishwasher);
    return `<dl class="comparison-cooking-details">${fields.map(f => `<div data-cooking="${esc(f.label)}" data-state="${esc(f.state || 'verified')}"><dt>${esc(f.label)}</dt><dd>${esc(f.text)}</dd></div>`).join('')}</dl>`;
  }
  function source(a) {
    if (a.status !== "verified") return "";
    const url = C.safeUrl(a.sourceUrl);
    const type = ["independent_test","test"].includes(a.evidenceType) ? "독립 시험 자료" : /^manufacturer(?:_|$)/.test(a.evidenceType) ? "제조사 표기" : ["review","user_review"].includes(a.evidenceType) ? "사용자 후기 · 시험 자료 아님" : ["retailer","retailer_listing","retailer_spec","seller_listing","aggregator"].includes(a.evidenceType) ? "판매처·상품 자료 표기 · 독립 시험 아님" : "원문 자료 · 근거 유형 미분류";
    return `<details class="comparison-field-source"><summary>항목 출처</summary><p>${type}</p>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">원문 확인 ${icon("ExternalLink")}</a>` : "출처 미확인"}<p>${esc(date(a.checkedAt,true))}${a.expired ? " · 가격 유효기간 만료" : ""}</p></details>`;
  }
  function facts(p) {
    return D.definitions(currentItem,currentGroup,[p],"essential").slice(0,3).map(def => `<div><dt>${esc(def.label)}</dt><dd>${esc(D.present(p,def,"essential").text)}</dd></div>`).join("");
  }
  function renderCandidates() {
    const models = C.groupProducts(currentGroup?.products || []).verified;
    const choice = model => model.products.find(p => p.id === options.get(model.modelKey)) || model.products.find(p => ids().includes(p.id)) || model.representative;
    const filtered = models.filter(model => {
      const p = choice(model);
      return (!cookware() || state.heat === 'all' || D.cookingDetails(p)[state.heat].state === 'yes')
        && (!D.matches || D.matches(currentItem,currentGroup,p,Object.fromEntries(featureFilters)));
    });
    $("#candidateCount").textContent = `${filtered.length}개 모델${filtered.length !== models.length ? ` / 전체 ${models.length}개` : ''}`;
    $("#comparisonCandidates").innerHTML = filtered.map(model => {
      const choices = model.products.filter(C.eligible);
      const p = choices.find(p => p.id === options.get(model.modelKey)) || choices.find(p => ids().includes(p.id)) || model.representative;
      const chosen = selected().some(other => C.sameModel(other,p,currentGroup.products));
      return `<article class="comparison-candidate" data-candidate="${esc(p.id)}">${photo(p)}<h3>${esc(p.name)}</h3>${buy(p)}${cookingInfo(p) || `<dl class="comparison-card-facts">${facts(p)}</dl>`}${choices.length > 1 ? `<label class="comparison-option">판매 옵션<select data-model-option="${esc(model.modelKey)}" aria-label="${esc(p.name)} 판매 옵션">${choices.map(option => `<option value="${esc(option.id)}"${option.id === p.id ? " selected" : ""}>${esc(option.name)}</option>`).join("")}</select></label>` : ""}<div class="comparison-candidate-actions">${replaceId ? `<button type="button" data-replacement="${esc(p.id)}" class="comparison-primary">이 제품으로 교체</button>` : `<button type="button" data-toggle-product="${esc(p.id)}" aria-pressed="${chosen}" class="comparison-select-button">${chosen ? icon("Check") : '<span class="comparison-checkbox" aria-hidden="true"></span>'}${chosen ? "선택됨" : "비교 선택"}</button>`}${originalLink(p)}</div></article>`;
    }).join("") || `<p class="comparison-muted">${models.length ? '선택한 조건에 맞는 확인된 제품이 없습니다.' : '이 용도에 확인된 상품 자료가 없습니다.'}</p>`;
  }
  function renderFeatureFilters() {
    const root = $("#comparisonFeatureFilters");
    availableFilters = D.filterOptions ? D.filterOptions(currentItem,currentGroup,(currentGroup?.products || []).filter(C.eligible)).filter(f => !cookware() || !['induction','gas','oven','dishwasher'].includes(f.key)).slice(0,2) : [];
    for (const [key,value] of featureFilters) if (!availableFilters.some(f => f.key === key && f.options.some(o => o.value === value))) featureFilters.delete(key);
    root.hidden = state.view !== 'browse' || !availableFilters.length;
    root.innerHTML = availableFilters.map(f => `<label>${esc(f.label)}<select data-feature-filter="${esc(f.key)}" aria-label="${esc(f.label)} 조건"><option value="">전체</option>${f.options.map(o => `<option value="${esc(o.value)}"${featureFilters.get(f.key) === o.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`).join('');
  }
  function renderRoster() {
    const all = selected(), shown = visible();
    $("#comparisonSelectors").hidden = all.length <= 2;
    $("#comparisonVisible").hidden = all.length <= shown.length;
    $("#comparisonSelectors").innerHTML = all.map((p,i) => `<button class="comparison-roster-item" type="button" data-show-product="${esc(p.id)}" aria-pressed="${shown.includes(p)}"${i === 0 ? " disabled" : ""}>${photo(p)}<span>${i === 0 ? "기준 제품" : `대안 ${i}`}<strong>${esc(p.name)}</strong></span></button>`).join("");
    $("#comparisonVisible").textContent = all.length > shown.length ? `선택 ${all.length}개 · 현재 ${shown.length}개 비교${shown.length === 2 ? ` · 대안 ${state.withIds.indexOf(state.activeId)+1}/${state.withIds.length}` : ""}` : `선택 ${all.length}개`;
    $("#selectionTrayProducts").innerHTML = all.length ? all.map(p => `<div class="comparison-tray-item">${photo(p)}<button class="comparison-remove" data-remove-product="${esc(p.id)}" type="button" title="${esc(p.name)} 선택 해제" aria-label="${esc(p.name)} 선택 해제">${icon("X")}</button></div>`).join("") : '<span class="comparison-muted">선택 0개</span>';
    $("#startCompare").disabled = all.length < 2;
    $("#startCompare").textContent = all.length ? `${all.length}개 제품 비교` : "선택 제품 비교";
    $("#comparisonTray").hidden = state.view !== "browse" || !currentGroup || !all.length;
  }
  function renderTable() {
    renderedColumns = columns();
    const products = visible(), area = $("#comparisonTableArea");
    if (!products.length) { area.innerHTML = ""; $("#comparisonProductHeaders").innerHTML = ""; $("#comparisonDiffSummary").innerHTML = ""; return; }
    const rows = D.definitions(currentItem,currentGroup,products,state.scope).filter(def => !state.differences || C.rowState(products,def) === "different");
    $("#comparisonProductHeaders").style.setProperty("--comparison-columns",products.length);
    $("#comparisonProductHeaders").innerHTML = '<div class="comparison-header-spacer" aria-hidden="true"></div>' + products.map((p,i) => `<div class="comparison-product-header" data-product-column="${esc(p.id)}"${i === 0 ? " data-reference" : ""}>${photo(p)}<h3 class="comparison-product-name">${esc(p.name)}</h3>${buy(p)}${cookingInfo(p,4)}<button class="comparison-text-button" data-replace-product="${esc(p.id)}" type="button">제품 교체</button>${originalLink(p)}</div>`).join("");
    const heads = products.map((p,i) => `<th scope="col">${i === 0 ? "기준 제품" : `대안 ${i}`}</th>`).join("");
    const cells = rows.map(def => `<tr data-attribute="${esc(def.key)}" data-row-state="${C.rowState(products,def)}"><th scope="row">${esc(def.label)}</th>${products.map((p,i) => {
      const a = C.attribute(p,def), display = D.present(p,def,state.scope);
      const relation = i > 0 ? C.compareAttributes(products[0],p,def) : null;
      const delta = relation?.kind === "different" && def.type === "number" ? `기준 대비 ${relation.delta > 0 ? "+" : ""}${new Intl.NumberFormat("ko-KR",{maximumFractionDigits:8}).format(relation.delta)}${a.unit ? ` ${a.unit}` : ""} · 계산` : relation?.kind === "incomparable" ? "단위가 달라 수치 비교 제외" : "";
      return `<td><p class="comparison-value" data-status="${esc(a.status)}">${esc(display.text)}</p>${delta ? `<p class="comparison-delta">${esc(delta)}</p>` : ""}${display.hasDetail ? `<details class="comparison-value-detail"><summary>원문 전체</summary><p>${esc(display.raw)}</p></details>` : ""}${source(a)}</td>`;
    }).join("")}</tr>`).join("");
    area.innerHTML = `<table class="comparison-table"><caption class="comparison-sr">${esc(currentItem.title)} 규격 비교</caption><colgroup><col class="comparison-label-col" />${products.map(() => "<col />").join("")}</colgroup><thead><tr><th scope="col">비교 항목</th>${heads}</tr></thead><tbody>${cells}</tbody></table>${!rows.length ? '<p class="comparison-table-message">확인된 차이가 없습니다. 미확인 값이나 다른 단위는 차이로 계산하지 않습니다.</p>' : ""}${products.length === 1 ? '<p class="comparison-table-message">기준 제품만 선택했습니다. 다른 제품을 선택하면 비교할 수 있습니다.</p>' : ""}`;
    const differences = D.differences(products,D.definitions(currentItem,currentGroup,products,"essential"));
    $("#comparisonDiffSummary").innerHTML = differences.length ? `<h3>주요 차이</h3><ul>${differences.map(d => `<li><strong>${esc(d.label)}${products.length > 2 ? ` · 대안 ${products.findIndex(p => p.id === d.productId)}` : ""}</strong><span>${esc(d.text)}</span></li>`).join("")}</ul>` : "";
  }
  function renderSaved() {
    const same = saved && saved.expiresAt > Date.now() && saved.itemId === state.itemId && saved.groupId === state.groupId && saved.baseId === state.baseId && JSON.stringify(saved.withIds) === JSON.stringify(state.withIds);
    $("#saveSelection").disabled = !state.baseId; $("#saveSelection").setAttribute("aria-pressed",String(Boolean(same)));
    $("#restoreSelection").disabled = !saved || saved.expiresAt <= Date.now(); $("#copySelection").disabled = !state.baseId;
  }
  function render() {
    $("#comparisonTitle").textContent = currentItem?.title || "제품 고르기";
    $("#comparisonPurpose").textContent = `${currentGroup?.label || currentItem?.title || "제품"} 비교`;
    $("#comparisonItem").innerHTML = catalog.items.map(i => `<option value="${esc(i.id)}"${i.id === state.itemId ? " selected" : ""}>${esc(i.title)}</option>`).join("");
    $("#comparisonGroup").innerHTML = (currentItem?.groups || []).map(g => `<option value="${esc(g.id)}"${g.id === state.groupId ? " selected" : ""}>${esc(g.label || g.purpose)}</option>`).join("");
    $("#comparisonItem").disabled = !catalog.items.length; $("#comparisonGroup").disabled = !currentItem?.groups.length;
    $("#comparisonGroupLabel").hidden = (currentItem?.groups.length || 0) < 2;
    $("#catalogBack").href = state.itemId ? `/?item=${encodeURIComponent(state.itemId)}#catalog` : "/#catalog";
    const count = C.groupProducts(currentGroup?.products || []).verified.length;
    $("#comparisonCoverage").textContent = `${count}개 제품 · ${currentGroup?.label || currentItem?.title || "자료 준비 중"}`;
    $("#comparisonCoverage").hidden = state.view === "compare";
    $("#comparisonUpdated").textContent = `자료 갱신: ${date(currentItem?.updatedAt || catalog.updatedAt)}`;
    $("#candidateSection").hidden = state.view !== "browse";
    $("#cookingFilter").hidden = !cookware() || state.view !== 'browse';
    $("#comparisonWorkspace").hidden = state.view !== "compare" || !state.baseId;
    $("#comparisonEmpty").hidden = count > 0;
    document.body.classList.toggle("is-browsing",state.view === "browse");
    renderFeatureFilters(); renderCandidates(); renderRoster(); renderTable(); renderSaved(); document.body.dataset.comparisonReady = "true";
  }
  function closePicker() { $("#productPicker").close(); replaceId = ""; $("#candidateSection").appendChild($("#comparisonCandidates")); renderCandidates(); }
  document.addEventListener("click",e => {
    const b = e.target.closest("button"); if (!b) return;
    if (document.body.dataset.comparisonReady === "loading") return;
    if (b.dataset.toggleProduct) {
      const p = currentGroup.products.find(p => p.id === b.dataset.toggleProduct), all = selected();
      const same = all.find(other => C.sameModel(other,p,currentGroup.products));
      if (!same && all.length === 4) { status("한 번에 최대 4개를 선택할 수 있습니다."); return; }
      changeProducts(same ? ids().filter(id => id !== same.id) : [...ids(),p.id]);
      document.querySelector(`[data-toggle-product="${CSS.escape(p.id)}"]`)?.focus({preventScroll:true});
    }
    if (b.dataset.removeProduct) changeProducts(ids().filter(id => id !== b.dataset.removeProduct));
    if (b.dataset.showProduct) { state.activeId = b.dataset.showProduct; renderRoster(); renderTable(); }
    if (b.dataset.replaceProduct) { replaceId = b.dataset.replaceProduct; $("#pickerContents").appendChild($("#comparisonCandidates")); renderCandidates(); $("#productPicker").showModal(); }
    if (b.dataset.replacement) {
      const all = ids(), at = all.indexOf(replaceId), p = currentGroup.products.find(p => p.id === b.dataset.replacement);
      const other = selected().findIndex(other => C.sameModel(other,p,currentGroup.products));
      if (other >= 0 && other !== at) all[other] = all[at];
      if (at < 0) { closePicker(); return; }
      all[at] = p.id; closePicker(); changeProducts(all);
      document.querySelector(`[data-replace-product="${CSS.escape(p.id)}"]`)?.focus({preventScroll:true});
    }
  });
  $("#comparisonCandidates").addEventListener("change",e => {
    const key = e.target.dataset.modelOption; if (!key) return;
    options.set(key,e.target.value);
    if (replaceId) { renderCandidates(); return; }
    const p = currentGroup.products.find(p => p.id === e.target.value), at = selected().findIndex(other => C.sameModel(other,p,currentGroup.products));
    if (at >= 0) { const all = ids(); all[at] = p.id; changeProducts(all); } else renderCandidates();
  });
  $("#closePicker").addEventListener("click",closePicker);
  $("#productPicker").addEventListener("cancel",e => { e.preventDefault(); closePicker(); });
  $("#startCompare").addEventListener("click",() => { state.view = "compare"; render(); $("#comparisonWorkspace").scrollIntoView({block:"start"}); });
  $("#browseProducts").addEventListener("click",() => { state.view = "browse"; render(); $("#candidateSection").scrollIntoView({block:"start"}); });
  $("#comparisonItem").addEventListener("change",e => resolve({itemId:e.target.value}));
  $("#comparisonGroup").addEventListener("change",e => resolve({itemId:state.itemId,groupId:e.target.value}));
  $("#retryLoad").addEventListener("click",() => { error(""); if (pendingNavigation) resolve(pendingNavigation.next,pendingNavigation.view); else location.reload(); });
  $("#differencesOnly").addEventListener("change",e => { state.differences = e.target.checked; renderTable(); });
  $("#showEvidence").addEventListener("change",e => $("#comparisonTableArea").classList.toggle("show-evidence",e.target.checked));
  document.querySelectorAll('[name="scope"]').forEach(input => input.addEventListener("change",e => { state.scope = e.target.value; renderTable(); }));
  document.querySelectorAll('[name="columns"]').forEach(input => input.addEventListener("change",e => { state.columns = Number(e.target.value); renderRoster(); renderTable(); }));
  document.querySelectorAll('[name="heat"]').forEach(input => input.addEventListener('change',e => { state.heat = e.target.value; renderCandidates(); }));
  $("#comparisonFeatureFilters").addEventListener('change',e => {
    const key = e.target.dataset.featureFilter, value = e.target.value;
    if (!availableFilters.some(f => f.key === key && (!value || f.options.some(o => o.value === value)))) return;
    if (value) featureFilters.set(key,value); else featureFilters.delete(key);
    renderCandidates();
  });
  $("#saveSelection").addEventListener("click",() => {
    try { const r = C.createSavedSelection(selection()); localStorage.setItem(C.STORAGE_KEY,JSON.stringify(r)); saved = r; status("선택 제품을 저장했습니다."); error(""); renderSaved(); }
    catch { error("제품 선택을 저장하지 못했습니다. 브라우저 저장 공간·접근 권한을 확인해 주세요."); }
  });
  $("#restoreSelection").addEventListener("click",() => { const r = readStorage(); if (r) { status("저장한 제품 선택을 복원했습니다."); resolve(r,"compare"); } });
  $("#copySelection").addEventListener("click",async () => {
    try { await navigator.clipboard.writeText(new URL(C.selectionUrl(selection()),location.origin).href); status("비교 링크를 복사했습니다."); }
    catch { error("링크를 복사하지 못했습니다. 주소창의 비교 주소를 사용해 주세요."); }
  });
  let timer;
  window.addEventListener("resize",() => { clearTimeout(timer); timer = setTimeout(() => { if (currentGroup && columns() !== renderedColumns) { renderRoster(); renderTable(); } },100); });
  window.addEventListener("popstate",() => { if (catalog) { const q = C.parseQuery(location.search); resolve(q,q.baseId ? "compare" : "browse"); } });
  try {
    if (!C || !D) throw new Error("비교 도구를 불러오지 못했습니다.");
    if (window.ComparisonCatalog) catalog = C.validateCatalog(window.ComparisonCatalog);
    else { catalog = window.ComparisonIndex; loader = window.ComparisonLoader.create(catalog); }
    if (!catalog?.items) throw new Error("비교 자료를 불러오지 못했습니다.");
    const record = readStorage(), query = C.parseQuery(location.search), explicit = new URLSearchParams(location.search);
    const compatible = record && (!query.itemId || query.itemId === record.itemId) && (!query.groupId || query.groupId === record.groupId);
    if (!explicit.has("base") && !explicit.has("with") && compatible) { status("저장한 제품 선택을 복원했습니다."); resolve(record,"compare"); }
    else resolve(query,query.baseId ? "compare" : "browse");
  } catch (e) { error(e.message || "비교 자료를 불러오지 못했습니다."); $("#retryLoad").hidden = false; $("#comparisonEmpty").hidden = false; document.body.dataset.comparisonReady = "error"; }
})();
