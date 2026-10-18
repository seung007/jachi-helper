(() => {
  "use strict";
  const root = document.querySelector("#catalog");
  const catalog = window.ProductCatalog;
  const C = window.ComparisonCore;
  const D = window.ComparisonDisplay;
  const $ = selector => document.querySelector(selector);
  if (!catalog?.items?.length) {
    if (root) $("#catalogCount").textContent = "목록을 불러오지 못했습니다. 새로고침해 주세요.";
    return;
  }
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const icon = name => `<svg class="catalog-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(window.JachiIcons?.[name] || []).map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([key, value]) => `${key}="${esc(value)}"`).join(" ")}></${tag}>`).join("")}</svg>`;
  document.querySelectorAll("[data-catalog-icon]").forEach(node => { node.outerHTML = icon(node.dataset.catalogIcon); });
  const safeUrl = (value, allowLocal = false) => C?.safeUrl(value, { allowLocal }) || "";
  const missingPhoto = label => `<div class="catalog-photo-unavailable" role="img" aria-label="${esc(label)} 사진 없음">${icon("Image")}<span>상품 사진 미확인</span></div>`;
  const items = catalog.items;
  const byId = new Map(items.map(item => [item.id, item]));
  document.addEventListener("error", event => {
    const img = event.target;
    if (img instanceof HTMLImageElement && img.closest(".catalog, .catalog-dialog, .catalog-related, .catalog-photo-dialog")) {
      const card = img.closest(".catalog-card");
      if (card) { const item = byId.get(card.dataset.item); img.parentElement.innerHTML = missingPhoto(item.title); }
      else if (img.closest(".catalog-photo-stage")) {
        img.parentElement.innerHTML = '<p role="status">사진을 불러오지 못했습니다. 닫고 다시 열어 주세요.</p>';
      } else if (img.closest("[data-open-photo]")) {
        const button = img.closest("[data-open-photo]");
        button.disabled = true;
        button.removeAttribute("data-open-photo");
        button.removeAttribute("title");
        button.innerHTML = missingPhoto(img.alt);
      } else img.outerHTML = missingPhoto(img.alt || "상품");
    }
  }, true);
  const compareUrl = itemId => `/compare?item=${encodeURIComponent(itemId)}`;
  const comparisonItems = new Map();
  const detailLoader = window.ComparisonLoader?.create({version:String(window.ComparisonSummary?.version || '20261012-1'),items:items.map(item => ({id:item.id}))});
  let detailRequest = 0, activeDetail = null;
  let lifeLinks;
  async function appendLifeLinks(container, item) {
    if (!container || !item) return;
    const request = detailRequest;
    try {
      lifeLinks ||= fetch('/data/life-task-links.json?v=20261018-1', { signal: AbortSignal.timeout(8000) })
        .then(r => { if (!r.ok) throw Error('Unavailable'); return r.json(); }).catch(error => { lifeLinks = null; throw error; });
      const data = await lifeLinks;
      if (request !== detailRequest || !container.isConnected || container.querySelector('[data-life-links]')) return;
      const problems = data.problems.filter(p => p.productIds.includes(item.id));
      if (!problems.length) return;
      const section = document.createElement('section'); section.className = 'catalog-life-links'; section.dataset.lifeLinks = '';
      section.innerHTML = `<h3>구매 말고 다른 방법도 살펴보세요</h3>${problems.map(p => `<a href="/services?problem=${encodeURIComponent(p.id)}">${esc(p.label)} 앱·공식 안내${icon('ArrowRight')}</a>`).join('')}`;
      container.append(section);
    } catch { /* Optional related services must not block product browsing. */ }
  }
  function comparisonLinks(item) {
    const groups = window.ComparisonSummary?.items?.find(candidate => candidate.id === item.id)?.groups || [];
    return groups.length ? groups.map(group => `<a href="${esc(compareUrl(item.id))}&amp;group=${encodeURIComponent(group.id)}"><span>${esc(group.label)} 제품 비교</span>${icon("ArrowRight")}</a>`).join("") : `<a href="${esc(compareUrl(item.id))}"><span>제품 비교</span>${icon("ArrowRight")}</a>`;
  }
  const params = new URLSearchParams(location.search);
  const state = { category: params.get("category") || "all", subgroup: params.get("subgroup") || "all", query: params.get("q") || "", sort: params.get("sort") === "name" ? "name" : "default", savedOnly: params.get("saved") === "1", limit: 24 };
  if (!catalog.categories.includes(state.category)) state.category = "all";
  const storageKey = "jachi:catalog-saved:v1";
  const expiry = 30 * 24 * 60 * 60 * 1000;
  const loadSaved = () => {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey) || "{}");
      return new Map(Object.entries(data).filter(([id, time]) => byId.has(id) && Number.isFinite(time) && time > Date.now() - expiry && time <= Date.now()));
    } catch { return new Map(); }
  };
  let saved = loadSaved();
  if (!root) {
    const related = document.querySelector("[data-catalog-related]");
    if (related) {
      const id = params.get("id");
      const item = items.find(item => item.kind === "product" && item.existingIds.includes(id));
      const products = item?.products.filter(product => safeUrl(product.url) && product.name &&
        D?.details?.(item, null, product, { limit: 4 }).some(row => ["verified", "yes", "no"].includes(row.state))) || [];
      if (products.length) {
        related.innerHTML = `<h2>${esc(item.title)} 상품</h2><div class="catalog-related-products">${products.slice(0, 6).map(product => productMarkup(item, product, "related_item")).join("")}</div><div class="catalog-comparisons">${comparisonLinks(item)}</div>${products.length > 6 ? `<a class="catalog-source-link" href="/?q=${encodeURIComponent(item.title)}#catalog">${esc(item.title)} 전체 보기${icon("ArrowRight")}</a>` : ""}`;
        related.hidden = false;
      }
      if (item) { related.hidden = false; void appendLifeLinks(related, item); }
      return;
    }
    const shelf = document.querySelector("[data-catalog-saved]");
    if (!shelf) return;
    const renderShelf = () => {
      saved = loadSaved();
      shelf.innerHTML = `<h2>저장한 품목 <small>${saved.size}개</small></h2>${saved.size ? `<ul>${items.filter(item => saved.has(item.id)).map(item => `<li><a href="/?item=${encodeURIComponent(item.id)}#catalog">${esc(item.title)}</a><button type="button" data-remove="${item.id}" aria-label="${esc(item.title)} 저장 해제">삭제</button></li>`).join("")}</ul>` : '<p>아직 저장한 품목이 없습니다.</p>'}<a href="/?saved=1#catalog">저장한 품목 모아 보기</a><a href="/#catalog">전체 품목 찾기</a><p class="catalog-detail-note">이 기기에 저장한 품목입니다. 생활 조건으로 만드는 기본 준비표와 별도로 보관됩니다.</p><p role="status" data-save-error></p>`;
    };
    shelf.addEventListener("click", event => {
      const button = event.target.closest("[data-remove]");
      if (!button) return;
      saved.delete(button.dataset.remove);
      try { localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(saved))); renderShelf(); }
      catch { shelf.querySelector("[data-save-error]").textContent = "저장을 변경하지 못했습니다. 브라우저 저장 설정을 확인해 주세요."; }
    });
    window.addEventListener("storage", renderShelf);
    renderShelf();
    return;
  }
  let openedFromCard = false;
  const photoDialog = document.createElement("dialog");
  photoDialog.className = "catalog-photo-dialog";
  photoDialog.setAttribute("aria-labelledby", "catalogPhotoTitle");
  photoDialog.innerHTML = `<header><h2 id="catalogPhotoTitle"></h2><button type="button" aria-label="상품 사진 닫기" title="닫기">${icon("X")}</button></header><div class="catalog-photo-stage"></div>`;
  document.body.append(photoDialog);
  let photoTrigger;
  function closePhoto() {
    photoDialog.close();
    photoDialog.querySelector(".catalog-photo-stage").replaceChildren();
    if (photoTrigger?.isConnected) photoTrigger.focus({ preventScroll: true });
  }
  photoDialog.querySelector("button").addEventListener("click", closePhoto);
  photoDialog.addEventListener("cancel", event => { event.preventDefault(); closePhoto(); });
  photoDialog.addEventListener("click", event => {
    if (event.target !== photoDialog) return;
    const rect = photoDialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePhoto();
  });
  let focusBeforeDialog;
  let focusItemId;
  let scrollBeforeDialog = 0;
  const track = (event, fields) => { if (typeof trackAnalyticsEvent === "function") trackAnalyticsEvent(event, fields); };
  const itemUrl = id => { const url = new URL(location.href); url.searchParams.set("item", id); url.hash = "catalog"; return `${url.pathname}${url.search}${url.hash}`; };
  const labels = { "먹거리": "먹거리", "주방용품": "주방", "욕실·위생": "욕실·위생", "세탁·의류관리": "세탁", "청소·폐기": "청소", "침구·가구": "침구·가구", "가전": "가전", "수납·생활도구": "수납·도구", "환경·안전": "환경·안전" };
  const searchText = item => [item.title, item.category, item.subgroup, ...item.variants, ...item.criteria, ...item.products.map(p => p.name)].join(" ").toLocaleLowerCase("ko");
  const searchIndex = new Map(items.map(item => [item.id, searchText(item)]));
  function filtered() {
    const terms = state.query.trim().toLocaleLowerCase("ko").split(/\s+/).filter(Boolean);
    const result = items.filter(item => (state.category === "all" || item.category === state.category)
      && (state.subgroup === "all" || item.subgroup === state.subgroup)
      && (!state.savedOnly || saved.has(item.id)) && terms.every(term => searchIndex.get(item.id).includes(term)));
    if (state.sort === "name") result.sort((a, b) => a.title.localeCompare(b.title, "ko"));
    return result;
  }
  function syncUrl() {
    const url = new URL(location.href);
    for (const [key, value] of [["category", state.category], ["subgroup", state.subgroup], ["q", state.query.trim()], ["saved", state.savedOnly ? "1" : ""], ["sort", state.sort]]) {
      if (value && value !== "all" && value !== "default") url.searchParams.set(key, value); else url.searchParams.delete(key);
    }
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
  function renderFilters() {
    $("#catalogCategories").innerHTML = ["all", ...catalog.categories].map(category => {
      return `<button type="button" data-category="${esc(category)}" aria-pressed="${state.category === category}">${esc(category === "all" ? "전체" : labels[category] || category)}</button>`;
    }).join("");
    const groups = [...new Set(items.filter(item => state.category === "all" || item.category === state.category).map(item => item.subgroup))];
    if (!groups.includes(state.subgroup)) state.subgroup = "all";
    $("#catalogSubgroup").innerHTML = '<option value="all">전체 세부 분류</option>' + groups.map(group => `<option value="${esc(group)}"${state.subgroup === group ? " selected" : ""}>${esc(group)}</option>`).join("");
    $("#catalogSaved").setAttribute("aria-pressed", String(state.savedOnly));
    $("#catalogSaved span").textContent = saved.size;
    $("#catalogSort").value = state.sort;
    const selected = [["category", state.category !== "all" ? labels[state.category] : ""], ["subgroup", state.subgroup !== "all" ? state.subgroup : ""], ["query", state.query.trim()], ["savedOnly", state.savedOnly ? "저장한 품목" : ""]].filter(([,label]) => label);
    $("#catalogAppliedFilters").hidden = !selected.length;
    $("#catalogAppliedFilters").innerHTML = selected.map(([key, label]) => `<button type="button" data-remove-filter="${key}" aria-label="${esc(label)} 조건 해제">${esc(label)}${icon("X")}</button>`).join("") + (selected.length > 1 ? '<button type="button" data-clear-filters>전체 해제</button>' : "");
  }
  const cardProduct = item => item.products.find(p => safeUrl(p.imageUrl, true)) || item.products[0];
  function visual(item, index = 0) {
    const product = cardProduct(item);
    if (safeUrl(product?.imageUrl, true)) return `<img src="${esc(safeUrl(product.imageUrl, true))}" alt="${esc(product.name)}" loading="${index < 2 ? "eager" : "lazy"}" fetchpriority="${index < 2 ? "high" : "auto"}" decoding="async" referrerpolicy="no-referrer" />${product.imageScope === "options" ? '<em class="catalog-image-caption">옵션 대표 이미지</em>' : ''}`;
    return item.kind === "guidance" ? `<div class="catalog-visual-label"><small>공식 안내</small><strong>${esc(item.title)}</strong></div>` : missingPhoto(item.title);
  }
  function saveButton(item, compact = false) {
    const label = `${item.title} ${saved.has(item.id) ? "저장 해제" : "저장"}`;
    return `<button class="${compact ? "catalog-save-icon" : "catalog-save-button"}" type="button" data-save="${item.id}" aria-label="${esc(label)}" title="${esc(label)}" aria-pressed="${saved.has(item.id)}">${icon("Bookmark")}${compact ? "" : `<span>${saved.has(item.id) ? "저장됨" : "저장"}</span>`}</button>`;
  }
  function productDetails(item, product, group) {
    const rows = D?.details?.(item, group, product, { limit: 4 }) || [];
    return rows.length ? `<dl class="catalog-product-details">${rows.map(row => {
      const source = safeUrl(row.sourceUrl);
      const chars = Array.from(row.text);
      const value = chars.length > 80 ? `<span>${esc(chars.slice(0,80).join(''))}...</span><details class="catalog-meta-full"><summary>원문 전체</summary><p>${esc(row.text)}</p></details>` : `<span>${esc(row.text)}</span>`;
      return `<div data-detail-key="${esc(row.key)}" data-detail-state="${esc(row.state)}"><dt>${esc(row.label)}</dt><dd>${value}${source ? `<small class="catalog-fact-source"><a href="${esc(source)}" target="_blank" rel="noopener noreferrer" data-fact-source aria-label="${esc(row.label)} 근거">근거${icon("ExternalLink")}</a>${row.checkedAt ? `<time>${esc(row.checkedAt)}</time>` : ""}</small>` : ""}</dd></div>`;
    }).join("")}</dl>` : '<p class="catalog-detail-note catalog-details-unknown">상품별 규격 미확인</p>';
  }
  function coupangMarkup(product, item, placement, compact = false, group) {
    const link = D?.coupangLink(product,item,group);
    const url = safeUrl(link?.url);
    if (!url) return "";
    return `<a class="${compact ? "catalog-card-store" : "catalog-buy-link"}" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(product.name)} ${esc(link.label)}" data-store-link data-store="coupang" data-item-id="${esc(product.id)}" data-product-id="${esc(product.id)}" data-placement="${placement}" data-link-role="coupang" data-coupang-kind="${esc(link.kind)}">${esc(link.label)}${icon("ExternalLink")}</a>`;
  }
  function sourceMarkup(product, placement, prominent = false) {
    const url = safeUrl(product.url);
    if (!url) return "";
    const source = product.sourceLabel === "상품 원문" ? "상품 자료" : product.sourceLabel;
    return `<a class="catalog-source-link${prominent ? ' catalog-original-buy' : ''}" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(product.name)} ${esc(source)} 원문" data-source-link data-store-link data-store="${esc(placement === "catalog_card" ? product.sourceLabel : source)}" data-item-id="${esc(product.id)}" data-product-id="${esc(product.id)}" data-placement="${placement}" data-link-role="source">${prominent ? '원래 상품 보기' : `${esc(source)} 원문`}${icon("ExternalLink")}</a>`;
  }
  function card(item, index) {
    const product = item.kind === "guidance" ? null : cardProduct(item);
    const preview = product ? product.name : "지역·개인 조건에 맞는 공식 안내";
    const groups = window.ComparisonSummary?.items?.find(candidate => candidate.id === item.id)?.groups || [];
    const detailLabel = item.kind === 'guidance' ? '이용 안내' : groups.length === 1 && groups[0].count > 1 ? `제품 ${groups[0].count}개 보기` : '용도별 제품 보기';
    const detailAction = `<a href="${esc(itemUrl(item.id))}" data-open="${item.id}">${esc(detailLabel)}</a>`;
    const guide = item.guidance.find(guide => safeUrl(guide.url));
    return `<article class="catalog-card" data-item="${item.id}">
      <div class="catalog-card-media"><a class="catalog-card-visual" href="${esc(itemUrl(item.id))}" data-open="${item.id}" aria-label="${esc(item.title)} 상세 보기">${visual(item, index)}</a>${saveButton(item, true)}</div>
      <div class="catalog-card-content"><p class="catalog-card-kicker">${esc(item.category)} · ${esc(item.subgroup)}</p>
      <h3><a href="${esc(itemUrl(item.id))}" data-open="${item.id}">${esc(item.title)}</a></h3>
      <p class="catalog-card-product" title="${esc(preview)}">${esc(preview)}</p>
      <div class="catalog-card-purchase">${product ? coupangMarkup(product, item, "catalog_card", true) : ""}</div>
      ${product ? productDetails(item, product) : `<p class="catalog-card-guidance">${esc(guide?.description || "공식 안내에서 지역·개인 조건을 확인하세요.")}</p>`}
      <div class="catalog-card-actions">${detailAction}${product ? `<a href="${esc(compareUrl(item.id))}">제품 비교${icon("ArrowRight")}</a>` : ""}</div>
      ${product ? sourceMarkup(product, "catalog_card") : guide ? `<a class="catalog-source-link" href="${esc(safeUrl(guide.url))}" target="_blank" rel="noopener noreferrer" data-guidance-link>${esc(guide.title)}${icon("ExternalLink")}</a>` : ""}</div></article>`;
  }
  function render() {
    renderFilters();
    const result = filtered();
    $("#catalogHeading").textContent = state.query.trim() ? `‘${state.query.trim()}’ 검색 결과` : state.savedOnly ? "저장한 품목" : state.category === "all" ? "전체 품목" : state.category;
    $("#catalogCount").textContent = `${result.length}개 품목`;
    $("#catalogGrid").innerHTML = result.slice(0, state.limit).map(card).join("");
    $("#catalogEmpty").hidden = result.length > 0;
    $("#catalogEmpty p").textContent = state.savedOnly ? "관심 있는 품목을 저장하면 여기서 모아 볼 수 있습니다." : "검색어나 분류를 바꿔 보세요.";
    const hasMore = result.length > state.limit;
    $("#catalogMore").hidden = !hasMore;
    $("#catalogAll").hidden = !hasMore;
    $("#catalogMore").textContent = `더 보기 (${Math.min(24, result.length - state.limit)}개)`;
    $("#catalogShown").textContent = result.length ? `${Math.min(result.length, state.limit)} / ${result.length}개 표시` : "";
    document.querySelectorAll("[data-full-catalog-count]").forEach(element => { element.textContent = `${items.length}개 탐색`; });
    syncUrl();
  }
  function productMarkup(item, product, placement = "expanded_catalog", group) {
    const image = safeUrl(product.imageUrl, true);
    const source = product.sourceLabel === "상품 원문" ? "상품 자료" : product.sourceLabel;
    const exactCoupang = D.coupangLink(product,item,group)?.kind === 'product';
    const links = exactCoupang ? coupangMarkup(product,item,placement,false,group)+sourceMarkup(product,placement) : sourceMarkup(product,placement,true)+coupangMarkup(product,item,placement,false,group);
    const photo = image ? `<img class="catalog-offer-photo" src="${esc(image)}" alt="${esc(product.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />` : missingPhoto(product.name);
    const media = root && image ? `<button type="button" class="catalog-photo-open" data-open-photo aria-label="${esc(product.name)} 사진 크게 보기" title="상품 사진 크게 보기">${photo}<span class="catalog-photo-zoom" aria-hidden="true">${icon("ZoomIn")}</span></button>` : photo;
    return `<article class="catalog-offer" id="catalog-offer-${esc(product.id)}" data-product-id="${esc(product.id)}"><div class="catalog-offer-top"><figure>${media}${product.imageScope === "options" ? '<figcaption>옵션 대표 이미지</figcaption>' : ''}</figure><div><p class="catalog-offer-source">${esc(source)}</p><h4>${esc(product.name)}</h4>${productDetails(item, product,group)}</div></div>${links}</article>`;
  }
  function renderDetailCandidates() {
    if (!activeDetail) return;
    const {item,groupId,limit} = activeDetail;
    const group = item.groups.find(group => group.id === groupId);
    const models = C.groupProducts(group?.products || []).verified;
    const root = $("#catalogDetailCandidates");
    const stores = [...new Set(models.map(model => {
      const url = C.safeUrl(model.representative.url);
      if (!url) return '출처 미확인';
      const host = new URL(url).hostname;
      return host === 'ikea.com' || host.endsWith('.ikea.com') ? 'ikea.com' : host.replace(/^www\./,'');
    }))];
    $("#catalogDetailSummary").textContent = `${group?.label || item.title} · ${models.length}개 모델`;
    $("#catalogDetailSourceScope").textContent = models.length && stores.length === 1 ? `${stores[0]} 상품 자료 중심입니다. 전체 시장이나 인기순 목록은 아닙니다.` : '확인한 상품 자료입니다. 전체 시장이나 인기순 목록은 아닙니다.';
    root.innerHTML = models.slice(0,limit).map(model => productMarkup(item,model.representative,'expanded_catalog',group)).join('') || '<p class="catalog-detail-note">이 용도의 확인된 후보가 아직 없습니다. 다른 용도를 선택하거나 유사상품을 검색해 주세요.</p>';
    root.dataset.catalogDetailState = 'ready';
    $("#catalogDetailPreview").innerHTML = models.slice(0,6).map(model => {
      const product = model.representative, image = safeUrl(product.imageUrl,true);
      return `<button type="button" data-jump-product="${esc(product.id)}" title="${esc(product.name)}" aria-label="${esc(product.name)} 상품 정보 보기">${image ? `<img src="${esc(image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />` : missingPhoto(product.name)}<span>${esc(product.name)}</span></button>`;
    }).join('');
    const more = $("#catalogDetailMore");
    more.hidden = models.length <= limit;
    more.textContent = `나머지 ${Math.max(0,models.length-limit)}개 제품 보기`;
    $("#catalogDetailCompare").href = `${compareUrl(item.id)}&group=${encodeURIComponent(group?.id || '')}`;
  }
  async function loadDetailCandidates(item, token) {
    if (!detailLoader) return;
    try {
      const detailed = comparisonItems.get(item.id) || await detailLoader.loadItem(item.id);
      comparisonItems.set(item.id,detailed);
      if (token !== detailRequest || !$("#catalogDetail").open || focusItemId !== item.id) return;
      const first = detailed.groups.find(group => C.groupProducts(group.products).verified.length >= 2) || detailed.groups[0];
      activeDetail = {item:detailed,groupId:first?.id,limit:6};
      const selector = $("#catalogDetailGroup");
      selector.innerHTML = detailed.groups.map(group => `<option value="${esc(group.id)}"${group === first ? ' selected' : ''}>${esc(group.label)}</option>`).join('');
      $("#catalogDetailGroupLabel").hidden = detailed.groups.length < 2;
      renderDetailCandidates();
    } catch {
      if (token !== detailRequest || !$("#catalogDetail").open || focusItemId !== item.id) return;
      $("#catalogDetailSummary").textContent = '추가 제품을 불러오지 못했습니다.';
      $("#catalogDetailCandidates").dataset.catalogDetailState = 'error';
      $("#catalogDetailRetry").hidden = false;
    }
  }
  function showDetail(id, push = true) {
    const item = byId.get(id);
    if (!item) return;
    const dialog = $("#catalogDetail");
    if (!dialog.open) { focusBeforeDialog = document.activeElement; scrollBeforeDialog = window.scrollY; }
    focusItemId = id;
    activeDetail = null;
    const token = ++detailRequest;
    $("#catalogDetailCategory").textContent = `${item.category} / ${item.subgroup}`;
    const legacy = item.existingIds.find(key => typeof recommendationCatalog !== "undefined" && recommendationCatalog[key]);
    const guidance = item.guidance.map(guide => `<div class="catalog-guidance"><p>${esc(guide.description)}</p><a class="catalog-buy-link" href="${esc(safeUrl(guide.url))}" target="_blank" rel="noopener noreferrer">${esc(guide.title)} <span aria-hidden="true">↗</span></a></div>`).join("");
    $("#catalogDetailBody").innerHTML = `<h2 id="catalogDetailTitle">${esc(item.title)}</h2><p class="catalog-variants">${esc(item.variants.join(" · "))}</p>${item.kind === "guidance" ? guidance : `<section class="catalog-comparisons" aria-label="같은 사용 목적 제품 비교">${comparisonLinks(item)}</section><div class="catalog-detail-heading"><p id="catalogDetailSummary" role="status">다른 제품을 불러오는 중입니다.</p><label id="catalogDetailGroupLabel" hidden>사용 목적<select id="catalogDetailGroup" data-catalog-group></select></label></div><p id="catalogDetailSourceScope" class="catalog-detail-note"></p><div id="catalogDetailPreview" class="catalog-detail-preview" aria-label="상품 사진 목록"></div><button id="catalogDetailRetry" type="button" hidden>제품 다시 불러오기</button><div id="catalogDetailCandidates" class="catalog-detail-products" data-catalog-detail-state="loading">${item.products.map(product => productMarkup(item, product)).join("")}</div><button id="catalogDetailMore" type="button" data-catalog-more-products hidden></button><a id="catalogDetailCompare" class="catalog-more-compare" href="${esc(compareUrl(id))}">전체 제품 비교${icon("ArrowRight")}</a><p class="catalog-detail-note">원래 상품과 쿠팡 유사상품 검색은 다릅니다. 최신 가격·배송비·재고와 옵션은 판매처에서 확인하세요.</p><details class="catalog-detail-criteria"><summary>구매 전에 비교할 기준${icon("ChevronDown")}</summary><ul>${item.criteria.map(value => `<li>${esc(value)}</li>`).join("")}</ul>${legacy ? `<a href="/item?id=${encodeURIComponent(legacy)}">품목별 구매 기준 더 보기</a>` : ""}</details>`}<div class="catalog-detail-tools">${saveButton(item)}<button type="button" id="catalogCopy">${icon("Link")}링크 복사</button></div><p id="catalogCopyStatus" class="catalog-detail-note" role="status"></p>`;
    void appendLifeLinks($("#catalogDetailBody"), item);
    if (push) { history.pushState({ catalogDetail: true }, "", itemUrl(id)); openedFromCard = true; track("product_detail_click", { item_id: id, placement: "expanded_catalog" }); }
    if (!dialog.open) dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    dialog.scrollTop = 0;
    $("#catalogClose").focus();
    if (item.kind !== 'guidance') void loadDetailCandidates(item,token);
  }
  function closeDetail() {
    if (openedFromCard && history.state?.catalogDetail) history.back();
    else { const url = new URL(location.href); url.searchParams.delete("item"); history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`); finishClose(); }
  }
  function finishClose() {
    if (photoDialog.open) closePhoto();
    ++detailRequest;
    activeDetail = null;
    $("#catalogDetail").close();
    document.documentElement.style.overflow = "";
    openedFromCard = false;
    window.scrollTo({ top: scrollBeforeDialog });
    if (focusBeforeDialog?.isConnected) focusBeforeDialog.focus({ preventScroll: true });
    else document.querySelector(`.catalog-card[data-item="${focusItemId}"] [data-open]`)?.focus({ preventScroll: true });
  }
  let toastTimer;
  function toast(message) {
    const node = $("#catalogToast");
    if ($("#catalogDetail").open) $("#catalogCopyStatus").textContent = message;
    node.textContent = message; node.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { node.hidden = true; }, 2600);
  }
  function toggleSaved(id) {
    if (!byId.has(id)) return;
    saved = loadSaved();
    const previous = new Map(saved);
    if (saved.has(id)) saved.delete(id); else saved.set(id, Date.now());
    try { localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(saved))); }
    catch { saved = previous; toast("저장을 변경하지 못했습니다. 브라우저 저장 설정을 확인해 주세요."); return; }
    const scroll = window.scrollY;
    if (state.savedOnly) render(); else $("#catalogSaved span").textContent = saved.size;
    document.querySelectorAll(`[data-save="${id}"]`).forEach(button => {
      button.setAttribute("aria-pressed", String(saved.has(id)));
      button.setAttribute("aria-label", `${byId.get(id).title} ${saved.has(id) ? "저장 해제" : "저장"}`);
      button.setAttribute("title", button.getAttribute("aria-label"));
      if (button.querySelector("span")) button.querySelector("span").textContent = saved.has(id) ? "저장됨" : "저장";
    });
    window.scrollTo({ top: scroll });
    track("catalog_save", { item_id: id, saved: saved.has(id) });
    toast(saved.has(id) ? `${byId.get(id).title} 저장했습니다.` : `${byId.get(id).title} 저장을 해제했습니다.`);
  }
  root.addEventListener("click", event => {
    const open = event.target.closest("[data-open]");
    if (open && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) { event.preventDefault(); showDetail(open.dataset.open); }
    const save = event.target.closest("[data-save]");
    if (save) toggleSaved(save.dataset.save);
    const category = event.target.closest("[data-category]");
    if (category) { state.category = category.dataset.category; state.subgroup = "all"; state.limit = 24; render(); $("#catalogCategories").querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true }); track("home_catalog_category", { category: state.category }); }
    const remove = event.target.closest("[data-remove-filter]");
    if (remove) { const key = remove.dataset.removeFilter; state[key] = key === "savedOnly" ? false : key === "query" ? "" : "all"; if (key === "category") state.subgroup = "all"; state.limit = 24; $("#catalogQuery").value = state.query; render(); }
    if (event.target.closest("[data-clear-filters]")) resetFilters();
  });
  $("#catalogDetailBody").addEventListener("click", async event => {
    const photo = event.target.closest('[data-open-photo]');
    if (photo) {
      const img = photo.querySelector("img");
      const url = safeUrl(img?.getAttribute("src"), true);
      if (url) {
        photoTrigger = photo;
        photoDialog.querySelector("h2").textContent = img.alt;
        photoDialog.querySelector(".catalog-photo-stage").innerHTML = `<img src="${esc(url)}" alt="${esc(img.alt)}" referrerpolicy="no-referrer" />`;
        photoDialog.showModal();
      }
    }
    const jump = event.target.closest('[data-jump-product]');
    if (jump) document.getElementById(`catalog-offer-${jump.dataset.jumpProduct}`)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'start'});
    if (event.target.closest('[data-catalog-more-products]') && activeDetail) { activeDetail.limit = Infinity; renderDetailCandidates(); }
    if (event.target.closest('#catalogDetailRetry')) { $("#catalogDetailRetry").hidden = true; void loadDetailCandidates(byId.get(focusItemId),++detailRequest); }
    const save = event.target.closest("[data-save]");
    if (save) toggleSaved(save.dataset.save);
    if (event.target.closest("#catalogCopy")) {
      try { await navigator.clipboard.writeText(location.href); $("#catalogCopyStatus").textContent = "링크를 복사했습니다."; }
      catch { $("#catalogCopyStatus").textContent = "주소창의 링크를 공유할 수 있습니다."; }
    }
  });
  $("#catalogDetailBody").addEventListener('change',event => {
    if (!event.target.matches('[data-catalog-group]') || !activeDetail) return;
    if (!activeDetail.item.groups.some(group => group.id === event.target.value)) return;
    activeDetail.groupId = event.target.value;
    activeDetail.limit = 6;
    renderDetailCandidates();
  });
  $("#catalogSearch").addEventListener("submit", event => { event.preventDefault(); Object.assign(state, { query: $("#catalogQuery").value, category: "all", subgroup: "all", savedOnly: false, limit: 24 }); render(); track("home_catalog_search", { query_length: state.query.length, result_count: filtered().length }); });
  $("#catalogQuery").addEventListener("input", event => { state.query = event.target.value; state.limit = 24; render(); });
  $("#catalogSubgroup").addEventListener("change", event => { state.subgroup = event.target.value; state.limit = 24; render(); });
  $("#catalogSort").addEventListener("change", event => { state.sort = event.target.value; render(); });
  $("#catalogSaved").addEventListener("click", () => { saved = loadSaved(); state.savedOnly = !state.savedOnly; state.limit = 24; render(); });
  $("#catalogMore").addEventListener("click", () => { state.limit += 24; render(); });
  $("#catalogAll").addEventListener("click", () => { state.limit = items.length; render(); });
  function resetFilters() { Object.assign(state, { category: "all", subgroup: "all", query: "", savedOnly: false, limit: 24 }); $("#catalogQuery").value = ""; render(); }
  $("#catalogReset").addEventListener("click", resetFilters);
  $("#catalogBackTop").addEventListener("click", () => root.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? "instant" : "smooth" }));
  window.addEventListener("scroll", () => { $("#catalogBackTop").hidden = window.scrollY < 900; }, { passive: true });
  $("#catalogClose").addEventListener("click", closeDetail);
  $("#catalogDetail").addEventListener("cancel", event => { event.preventDefault(); closeDetail(); });
  $("#catalogDetail").addEventListener("click", event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDetail(); } });
  window.addEventListener("popstate", () => {
    const next = new URLSearchParams(location.search);
    Object.assign(state, { category: catalog.categories.includes(next.get("category")) ? next.get("category") : "all", subgroup: next.get("subgroup") || "all", query: next.get("q") || "", savedOnly: next.get("saved") === "1", sort: next.get("sort") === "name" ? "name" : "default" });
    $("#catalogQuery").value = state.query;
    render();
    if (byId.has(next.get("item"))) showDetail(next.get("item"), false); else finishClose();
  });
  $("#catalogQuery").value = state.query;
  render();
  const initialItem = params.get("item") || items.find(item => item.existingIds.includes(params.get("product")))?.id;
  if (byId.has(initialItem)) showDetail(initialItem, false);
})();
