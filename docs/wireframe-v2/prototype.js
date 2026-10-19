(() => {
  'use strict';
  const D = window.WireframeData, main = document.querySelector('#main'), panel = document.querySelector('#panel');
  const pageSize = 12, scrollPositions = new Map();
  const curated = ['P080', 'P051', 'P102', 'P004', 'P001', 'P066', 'P088', 'P073', 'P188', 'P137', 'P052', 'P019'];
  const categoryLabels = ['먹거리', '주방', '욕실·위생', '세탁', '청소', '침구·가구', '가전', '수납·도구', '환경·안전'];
  const categoryIcons = ['ShoppingBasket', 'CookingPot', 'Bath', 'WashingMachine', 'BrushCleaning', 'BedDouble', 'Plug', 'Package', 'ShieldCheck'];
  const labels = {
    manufacturerNoticeNumber: '제품 신고번호', labelScope: '표시 사항', weave: '직조 방식', fabricDensity: '원단 밀도', producer: '제조사',
    expiryLabel: '소비기한 표시', unit: '판매 단위', checkoutCondition: '구매 조건', weightG: '중량 g', microwave: '전자레인지',
    alternatePreparation: '조리 방법', shelfLife: '보관 기한', seller: '판매처', format: '형태', packSize: '포장 구성', mealSize: '식사 분량',
    soy: '콩 원료', cut: '부위', variant: '옵션', shippingCondition: '배송 조건', openedStorage: '개봉 후 보관', foodContact: '식품 접촉',
    packageCount: '포장 수량', measures: '규격', useNote: '사용 안내', componentType: '구성품 종류', capacityCl: '용량 cl',
    countryOfManufacture: '제조국', volumeOptions: '용량 옵션', intendedUse: '용도', sheetCountPerRoll: '롤당 매수', rollCountPerPack: '포장당 롤 수',
    labelledHairType: '표기된 모발 유형', listedVolume: '표기 용량', listedIngredients: '표기 성분', bristleMaterial: '모 소재', importer: '수입사',
    bladeCount: '날 수', features: '제품 특징', listedOption: '판매 옵션', countPerPack: '포장당 수량', productMaterialName: '소재',
    sprayModes: '분사 방식', hose: '호스', showerheadIncluded: '샤워기 헤드 포함', drainage: '배수', sizes: '크기 옵션', refill: '리필',
    labelledPurpose: '표기 용도', listedVolumeKg: '표기 중량 kg', zipper: '지퍼', foldable: '접이식', unitWeightG: '개당 중량 g',
    volumeLitres: '용량 L', shellMaterial: '겉감 소재', firmnessLabel: '경도 표기', pieceWidth: '개당 폭', totalWeight: '총중량',
    seats: '좌석 수', coverCare: '커버 관리', usableCapacityL: '사용 용량 L', ratedVoltage: '정격 전압', capacityPersons: '인용 표기',
    energyEfficiencyGrade: '에너지 효율 등급', capacityL: '용량 L', thicknessMm: '두께 mm', maxLoad: '최대 하중', assembly: '조립',
    doors: '문 수', shelfMaterial: '선반 소재', coverMaterial: '커버 소재', listedCompatibility: '표기 호환', bulb: '전구',
    capacityMah: '배터리 용량 mAh', pieceCount: '구성 수량', packageWeightKg: '포장 중량 kg', lengthM: '길이 m', packageQuantity: '포장 수량',
    sizeLabel: '크기 표기', purpose: '용도', battery: '배터리', displayType: '표시 방식', country: '국가 표기', listedType: '표기 유형',
    colour: '색상', saleUnit: '판매 단위', consumable: '소모품', widthMm: '폭 mm', lengthMm: '길이 mm'
  };
  const excluded = new Set(['care', 'compatibility', 'claims', 'packagingDimensions', 'packagingWeight', 'manufacturerNoticeNumber', 'labelScope', '브랜드']);
  let state, overlayOrigin = null, restoreFocus = '', categoryTab = '';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safe = v => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password ? u.href : '#'; } catch { return '#'; } };
  function imageUrl(value) {
    if (typeof value === 'string' && value.startsWith('/assets/')) {
      const asset = new URL('../../' + value.slice(1), location.href), base = new URL('../../assets/', location.href);
      if (asset.href.startsWith(base.href) && /\.(jpe?g|png|webp)$/i.test(asset.pathname)) return asset.href;
    }
    return safe(value);
  }
  const clean = v => String(v).normalize('NFKC').toLowerCase().replace(/\s+/g, '').trim();
  const match = (text, q) => q.trim().split(/\s+/).every(word => clean(text).includes(clean(word)));
  const group = id => D.groups.find(g => g.id === id);
  const products = id => D.products.filter(p => p.item === id);
  const product = id => D.products.find(p => p.id === id);
  const factLabel = f => labels[f.key] || f.label;
  const displayFacts = p => p.facts.filter(f => /[가-힣]/.test(factLabel(f)));
  const available = f => ['verified', 'yes', 'no'].includes(f.state);
  const factText = f => f.text.replace(/;\s*/g, '\n');
  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (window.PrototypeIcons[name] || []).map(([tag, attrs]) => '<' + tag + ' ' + Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => k + '="' + esc(v) + '"').join(' ') + '></' + tag + '>').join('') + '</svg>';
  }
  function route(next) {
    const { screen = 'browse', ...values } = next, query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) if (value && !(key === 'page' && value === '1') && !(key === 'sort' && value === 'default')) query.set(key, value);
    return '#' + screen + (query.size ? '?' + query : '');
  }
  function read() {
    const [screen, query] = location.hash.slice(1).split('?');
    const value = { screen: screen === 'item' ? 'item' : 'browse', q: '', category: '', item: '', page: '1', sort: 'default', ...Object.fromEntries(new URLSearchParams(query || '')) };
    if (!group(value.item)) { value.screen = 'browse'; value.item = ''; }
    if (!D.categories.includes(value.category)) value.category = '';
    return value;
  }
  function go(next, { replace = false, keepScroll = false } = {}) {
    scrollPositions.set(location.hash, window.scrollY);
    const hash = route(next);
    if (keepScroll) scrollPositions.set(hash, window.scrollY);
    else if (!replace) scrollPositions.delete(hash);
    history[replace ? 'replaceState' : 'pushState'](null, '', hash);
    render();
  }
  function itemRoute(id, patch = {}) { return { screen: 'item', item: id, category: group(id)?.category || '', q: '', page: '1', sort: 'default', ...patch }; }
  function photo(p, className = 'product-photo', detail = false) {
    return `<${detail ? 'button' : 'div'} class="${className}"${detail ? ` data-detail="${esc(p.id)}" aria-label="${esc(p.name)} 상품 정보"` : ''}><img src="${esc(imageUrl(p.image))}" alt="${esc(p.name)}" loading="lazy" width="180" height="180"></${detail ? 'button' : 'div'}>`;
  }
  function purchase(p) {
    const direct = ['direct', 'product'].includes(p.purchase?.kind);
    return `<a class="buy" href="${esc(safe(direct ? p.purchase.url : p.sourceUrl))}" target="_blank" rel="noopener noreferrer" data-purchase="${esc(p.id)}">${direct ? '쿠팡 상품 보기' : '판매처 보기'}${icon('ExternalLink')}</a>`;
  }
  function summary(p) {
    const keys = p.item === 'P051' ? ['capacity', 'induction', 'gas'] : p.item === 'P080' ? ['width', 'length', 'material'] : ['amount', 'contents', 'capacity', 'count', 'material', 'size', 'storage', 'type', 'brand'];
    const facts = keys.flatMap(key => p.facts.filter(f => f.key === key && available(f)));
    if (p.item === 'P102') {
      const raw = p.facts.find(f => f.key === 'functions' && available(f));
      if (raw) return { claim: true, rows: raw.text.split('\n').filter(t => /^(액체형|캡슐형|분말형|일반,드럼겸용|일반용|드럼용|실내건조|본품|리필)$/.test(t.trim())).slice(0, 3) };
    }
    const rows = facts.map(f => {
      const parts = f.text.split(';').map(t => t.trim()).filter(Boolean);
      const text = parts[0]?.endsWith(':') ? parts.slice(0, 2).join(' ') : parts[0] || '';
      return { label: factLabel(f), text };
    }).filter(f => f.text && f.text.length <= 60 && !f.text.endsWith(':')).slice(0, 3);
    return { claim: false, rows: rows.map(f => f.label === '소재' || f.label === '제품 유형' ? f.text : f.label + ' ' + f.text) };
  }
  function pagination(total, page) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (pages === 1) return '';
    const keys = [...new Set([1, page - 1, page, page + 1, pages].filter(n => n >= 1 && n <= pages))].sort((a, b) => a - b);
    const link = (n, label, text, extra = '') => `<a href="${esc(route({ ...state, page: String(n) }))}" data-route aria-label="${label}" ${extra}>${text}</a>`;
    let prior = 0;
    return `<nav class="pagination" aria-label="페이지">${page === 1 ? `<span class="prev disabled">${icon('ArrowRight')}</span>` : link(page - 1, '이전 페이지', icon('ArrowRight'), 'class="prev"')}${keys.map(n => { const ellipsis = n > prior + 1 ? '<span aria-hidden="true">…</span>' : ''; prior = n; return ellipsis + link(n, n + '페이지', n, n === page ? 'aria-current="page"' : ''); }).join('')}${page === pages ? `<span class="disabled">${icon('ArrowRight')}</span>` : link(page + 1, '다음 페이지', icon('ArrowRight'))}</nav>`;
  }
  const empty = text => `<section class="empty"><h1>${esc(text)}</h1><p>다른 검색어 또는 조건을 선택해 주세요.</p><a class="buy secondary" href="#browse" data-route>전체 품목</a></section>`;
  function browse() {
    let groups = D.groups.filter(g => (!state.category || g.category === state.category) && (match(g.title + ' ' + g.category, state.q) || products(g.id).some(p => match(p.name + ' ' + p.facts.map(f => f.text).join(' '), state.q))));
    groups.sort((a, b) => (curated.includes(a.id) ? curated.indexOf(a.id) : 1000) - (curated.includes(b.id) ? curated.indexOf(b.id) : 1000));
    const page = Math.min(Math.max(1, Number(state.page) || 1), Math.max(1, Math.ceil(groups.length / pageSize)));
    const categories = [{ id: '', title: '전체', glyph: 'LayoutGrid' }, ...D.categories.map((c, i) => ({ id: c, title: categoryLabels[i], glyph: categoryIcons[i] }))];
    main.innerHTML = `<nav class="category-nav" aria-label="상품 카테고리">${categories.map(c => `<a href="${esc(route({ screen: 'browse', category: c.id, q: '', page: '1' }))}" data-route${state.category === c.id ? ' aria-current="page"' : ''}><span class="glyph">${icon(c.glyph)}</span>${esc(c.title)}</a>`).join('')}</nav><div class="section-heading"><h1>${esc(state.q ? '검색 결과' : state.category || '먹거리·생활용품')}</h1><button class="text-link" data-panel="categories">전체 분류${icon('ArrowRight')}</button></div>` +
      (groups.length ? `<section class="item-grid" aria-label="품목 목록">${groups.slice((page - 1) * pageSize, page * pageSize).map(g => { const p = products(g.id)[0]; return `<a class="item-tile" data-route data-item="${esc(g.id)}" href="${esc(route(itemRoute(g.id)))}">${photo(p, 'item-photo')}<h2>${esc(g.title)}</h2><span class="item-category">${esc(g.category)}</span></a>`; }).join('')}</section>${pagination(groups.length, page)}` : empty('찾는 품목이 없습니다'));
  }
  function filterFields(item) {
    const candidates = products(item), seen = new Set();
    const priority = item === 'P051' ? ['capacity', 'induction', 'gas', 'material', 'diameter', 'servings'] : item === 'P080' ? ['width', 'length', 'material'] : ['type', 'capacity', 'brand'];
    return priority.flatMap(key => {
      const facts = candidates.flatMap(p => p.facts.filter(f => f.key === key && available(f) && f.text.length < 55 && !/[\n;]/.test(f.text)));
      const values = [...new Set(facts.map(f => f.text))];
      if (!values.length || seen.has(key)) return [];
      seen.add(key); return [{ key, label: factLabel(facts[0]), values }];
    });
  }
  function itemScreen() {
    const g = group(state.item), all = products(g.id), fields = filterFields(g.id);
    let list = all.filter(p => match(p.name + ' ' + p.itemTitle + ' ' + p.facts.map(f => f.text).join(' '), state.q));
    const active = fields.filter(f => state['f_' + f.key]);
    for (const f of active) list = list.filter(p => p.facts.some(x => x.key === f.key && available(x) && x.text === state['f_' + f.key]));
    if (state.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const page = Math.min(Math.max(1, Number(state.page) || 1), Math.max(1, Math.ceil(list.length / pageSize)));
    main.innerHTML = `<div class="breadcrumb"><a href="#browse" data-route>상품</a>${icon('ArrowRight')}<a href="${esc(route({ screen: 'browse', category: g.category }))}" data-route>${esc(g.category)}</a></div><div class="result-heading"><button class="back-button" data-back title="이전 목록" aria-label="이전 목록">${icon('ArrowRight')}</button><h1>${esc(g.title)}</h1></div><div class="result-toolbar">${fields.length ? `<button class="filter-button${active.length ? ' active' : ''}" data-panel="filters">${icon('SlidersHorizontal')}${active.length ? '조건 적용됨' : '조건'}</button>` : '<span></span>'}<select class="sort" id="sort" aria-label="상품 정렬"><option value="default">기본순</option><option value="name"${state.sort === 'name' ? ' selected' : ''}>이름순</option></select></div>` +
      (active.length ? `<div class="active-filters">${active.map(f => `<button data-remove-filter="${esc(f.key)}" aria-label="${esc(f.label)} 조건 해제">${esc(f.label + ' ' + state['f_' + f.key])}${icon('X')}</button>`).join('')}</div>` : '') +
      (list.length ? `<section class="offers" aria-label="상품 후보">${list.slice((page - 1) * pageSize, page * pageSize).map(p => { const facts = summary(p); return `<article class="offer" data-product="${esc(p.id)}">${photo(p, 'product-photo', true)}<div class="offer-main"><p class="source-label">${esc(p.source || '판매처')}</p><button class="product-name" data-detail="${esc(p.id)}"><h2>${esc(p.name)}</h2></button>${facts.claim ? '<p class="claim-label">판매처 표기</p>' : ''}<div class="key-facts">${facts.rows.map(text => `<span>${esc(text)}</span>`).join('')}</div></div><div class="offer-actions">${purchase(p)}${all.length > 1 ? `<button class="compare-button" data-compare="${esc(p.id)}">${icon('ArrowLeftRight')}차이 보기</button>` : ''}</div></article>`; }).join('')}</section>${pagination(list.length, page)}` : empty('조건에 맞는 상품이 없습니다'));
  }
  function sheetHeader(title) { return `<div class="sheet-head"><h2 id="panelTitle">${esc(title)}</h2><button class="icon-button" data-close title="닫기" aria-label="닫기">${icon('X')}</button></div>`; }
  function categoriesPanel() {
    if (!D.categories.includes(categoryTab)) categoryTab = state.category || D.categories[0];
    panel.innerHTML = sheetHeader('전체 분류') + `<div class="category-layout"><div class="category-tabs" role="tablist" aria-label="대분류" aria-orientation="vertical">${D.categories.map((c, i) => `<button role="tab" id="category-tab-${i}" aria-controls="category-items" data-category="${esc(c)}" aria-selected="${categoryTab === c}" tabindex="${categoryTab === c ? '0' : '-1'}">${esc(categoryLabels[i])}</button>`).join('')}</div><section class="category-items" id="category-items" role="tabpanel" aria-labelledby="category-tab-${D.categories.indexOf(categoryTab)}"><h3>${esc(categoryTab)}</h3>${D.groups.filter(g => g.category === categoryTab).map(g => `<a data-route href="${esc(route(itemRoute(g.id)))}">${esc(g.title)}${icon('ArrowRight')}</a>`).join('')}</section></div>`;
  }
  function filtersPanel() {
    panel.innerHTML = sheetHeader('상품 조건') + `<form id="filterForm"><div class="sheet-body filter-grid">${filterFields(state.item).map(f => `<label class="filter-field">${esc(f.label)}<select name="f_${esc(f.key)}"><option value="">전체</option>${f.values.map(v => `<option value="${esc(v)}"${v === state['f_' + f.key] ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`).join('')}</div><div class="sheet-footer"><button type="button" class="buy secondary" data-reset-filters>초기화</button><button class="buy" type="submit">적용</button></div></form>`;
  }
  function comparisonPanel() {
    const left = product(state.compare), candidates = left && products(left.item);
    if (!left || left.item !== state.item || candidates.length < 2) return false;
    const comparisonKey = left.item === 'P080' ? 'length' : 'capacity';
    const primaryValue = p => p.facts.find(f => f.key === comparisonKey && available(f))?.text;
    const right = candidates.find(p => p.id === state.other && p.id !== left.id) || candidates.find(p => p.id !== left.id && primaryValue(left) && primaryValue(p) && primaryValue(p) !== primaryValue(left)) || candidates.find(p => p.id !== left.id);
    const keys = [...new Set([...displayFacts(left), ...displayFacts(right)].map(f => f.key))].filter(k => !excluded.has(k));
    const readFact = (p, key) => p.facts.find(f => f.key === key) || { key, label: key, text: '미확인', state: 'unknown' };
    panel.innerHTML = sheetHeader(left.itemTitle + ' 차이 보기') + `<div class="sheet-body"><section class="compare-heads" aria-label="비교 상품"><div class="compare-head"><span class="compare-selector-label">기준 상품</span><span class="baseline-name">선택한 상품</span>${photo(left)}<h3>${esc(left.name)}</h3></div><div class="compare-head"><label class="compare-selector-label" for="compareOther">비교할 상품</label><select class="compare-select" id="compareOther">${candidates.filter(p => p.id !== left.id).map(p => `<option value="${esc(p.id)}"${p.id === right.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>${photo(right)}<h3>${esc(right.name)}</h3></div></section><label class="diff-toggle"><input id="differenceOnly" type="checkbox"${state.diff === '1' ? ' checked' : ''}>차이만 보기</label><dl class="compare-table">${keys.map(key => { const a = readFact(left, key), b = readFact(right, key); if (state.diff === '1' && a.text === b.text && a.state !== 'unknown' && b.state !== 'unknown') return ''; const label = factLabel(left.facts.find(f => f.key === key) || right.facts.find(f => f.key === key)); return `<div class="compare-row${a.text !== b.text ? ' different' : ''}"><dt>${esc(label)}</dt><dd>${esc(factText(a))}</dd><dd>${esc(factText(b))}</dd></div>`; }).join('')}</dl><p class="compare-source">${esc(left.source)} · ${esc(right.source)}</p></div><div class="sheet-footer compare-footer">${purchase(left)}${purchase(right)}</div>`;
    return true;
  }
  function detailPanel() {
    const p = product(state.detail); if (!p) return false;
    panel.innerHTML = sheetHeader('상품 정보') + `<div class="sheet-body">${photo(p, 'detail-photo')}<div class="detail-heading"><p class="source-label">${esc(p.source)}</p><h3>${esc(p.name)}</h3></div><dl class="detail-specs">${displayFacts(p).map(f => `<dt>${esc(factLabel(f))}</dt><dd>${esc(factText(f))}</dd>`).join('')}</dl></div><div class="sheet-footer">${products(p.item).length > 1 ? `<button class="buy secondary" data-compare="${esc(p.id)}">${icon('ArrowLeftRight')}차이 보기</button>` : ''}${purchase(p)}</div>`;
    return true;
  }
  function renderPanel() {
    if (panel.open) panel.close();
    panel.innerHTML = '';
    let show = true;
    if (state.panel === 'categories') categoriesPanel();
    else if (state.panel === 'filters' && state.screen === 'item') filtersPanel();
    else if (state.compare) show = comparisonPanel();
    else if (state.detail) show = detailPanel();
    else show = false;
    if (show) { panel.showModal(); document.body.style.overflow = 'hidden'; }
    else document.body.style.overflow = '';
  }
  function closeOverlay() {
    if (overlayOrigin) { restoreFocus = overlayOrigin.focus; overlayOrigin = null; history.back(); }
    else { const next = { ...state, panel: '', compare: '', other: '', diff: '', detail: '' }; go(next, { replace: true, keepScroll: true }); }
  }
  function openOverlay(patch, focus) {
    const already = panel.open;
    if (!already) overlayOrigin = { hash: location.hash, focus };
    go({ ...state, panel: '', compare: '', other: '', diff: '', detail: '', ...patch }, { replace: already, keepScroll: true });
  }
  function render() {
    state = read();
    document.querySelector('#query').value = state.q;
    document.title = (state.screen === 'item' ? group(state.item).title : '상품') + ' · 자취도우미 시안';
    if (state.screen === 'item') itemScreen(); else browse();
    renderPanel();
    document.querySelectorAll('[data-icon]').forEach(n => n.innerHTML = icon(n.dataset.icon));
    document.querySelectorAll('img').forEach(img => {
      const fail = () => { const n = img.parentElement; n.classList.add('missing'); n.dataset.failedImage = img.src; n.innerHTML = icon('Image'); n.setAttribute('aria-label', '사진 미확인'); };
      img.addEventListener('error', fail, { once: true }); if (img.complete && !img.naturalWidth) fail();
    });
    main.dataset.route = location.hash;
    requestAnimationFrame(() => { window.scrollTo(0, scrollPositions.get(location.hash) || 0); if (restoreFocus) { document.querySelector(restoreFocus)?.focus({ preventScroll: true }); restoreFocus = ''; } });
  }
  document.addEventListener('submit', e => {
    if (e.target.id === 'searchForm') {
      e.preventDefault(); const q = document.querySelector('#query').value.trim(), exact = D.groups.find(g => clean(g.title) === clean(q));
      const matching = D.groups.filter(g => match(g.title, q) || products(g.id).some(p => match(p.name + ' ' + p.facts.map(f => f.text).join(' '), q)));
      overlayOrigin = null;
      if (q && (exact || matching.length === 1)) go(itemRoute((exact || matching[0]).id, { q }));
      else go({ screen: 'browse', q });
    }
    if (e.target.id === 'filterForm') {
      e.preventDefault(); const next = { ...state, panel: '', page: '1' };
      for (const key of Object.keys(next)) if (key.startsWith('f_')) delete next[key];
      Object.assign(next, Object.fromEntries(new FormData(e.target))); overlayOrigin = null;
      go(next, { replace: true });
    }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'sort') { restoreFocus = '#sort'; go({ ...state, sort: e.target.value, page: '1' }); }
    if (e.target.id === 'compareOther') { restoreFocus = '#compareOther'; go({ ...state, other: e.target.value }, { replace: true, keepScroll: true }); }
    if (e.target.id === 'differenceOnly') { restoreFocus = '#differenceOnly'; go({ ...state, diff: e.target.checked ? '1' : '' }, { replace: true, keepScroll: true }); }
  });
  document.addEventListener('click', e => {
    const n = e.target.closest('a,button'); if (!n) return;
    if (n.matches('a[data-route],a.brand')) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault(); overlayOrigin = null;
      const hash = new URL(n.href).hash, [screen, query] = hash.slice(1).split('?');
      go({ screen: screen || 'browse', ...Object.fromEntries(new URLSearchParams(query || '')) });
    }
    if (n.id === 'categoriesButton' || n.dataset.panel === 'categories') { categoryTab = state.category || D.categories[0]; openOverlay({ panel: 'categories' }, '#categoriesButton'); }
    if (n.dataset.panel === 'filters') openOverlay({ panel: 'filters' }, '[data-panel="filters"]');
    if (n.dataset.category) { categoryTab = n.dataset.category; categoriesPanel(); panel.querySelector('[aria-selected="true"]').focus(); }
    if (n.dataset.compare) openOverlay({ compare: n.dataset.compare, diff: '1' }, `[data-compare="${CSS.escape(n.dataset.compare)}"]`);
    if (n.dataset.detail) openOverlay({ detail: n.dataset.detail }, `[data-detail="${CSS.escape(n.dataset.detail)}"]`);
    if (n.hasAttribute('data-close')) closeOverlay();
    if (n.hasAttribute('data-reset-filters')) panel.querySelectorAll('select').forEach(s => s.value = '');
    if (n.dataset.removeFilter) { const next = { ...state, page: '1' }; delete next['f_' + n.dataset.removeFilter]; restoreFocus = '[data-panel="filters"]'; go(next); }
    if (n.hasAttribute('data-back')) { if (scrollPositions.size && history.length > 1) history.back(); else go({ screen: 'browse', category: state.category }); }
  });
  panel.addEventListener('cancel', e => { e.preventDefault(); closeOverlay(); });
  panel.addEventListener('click', e => { if (e.target !== panel) return; const r = panel.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeOverlay(); });
  document.addEventListener('keydown', e => {
    const tabs = [...panel.querySelectorAll('[role="tab"]')], current = tabs.indexOf(document.activeElement);
    if (current < 0 || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (current + (e.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length;
    categoryTab = tabs[next].dataset.category; categoriesPanel(); panel.querySelector('[aria-selected="true"]').focus();
  });
  window.addEventListener('hashchange', render);
  render();
})();
