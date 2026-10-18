(() => {
  'use strict';
  const D = window.WireframeData, main = document.querySelector('#main');
  const selected = new Set(), saved = new Set(), memory = {}, positions = new Map();
  const pageSize = 6;
  let state, statusTimer;
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safe = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : '#'; } catch { return '#'; } };
  function icon(name) {
    const nodes = window.JachiIcons?.[name] || window.JachiIcons?.ArrowRight || [];
    return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + nodes.map(([tag, attrs]) => '<' + tag + ' ' + Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => k + '="' + escape(v) + '"').join(' ') + '></' + tag + '>').join('') + '</svg>';
  }
  const buttonIcon = (name, label, action) => `<button class="icon-button" data-action="${action}" title="${label}" aria-label="${label}">${icon(name)}</button>`;
  const product = id => D.products.find(p => p.id === id);
  const labelOf = (list, id, fallback = '') => list.find(x => x.id === id)?.label || fallback;
  const option = (value, label, current) => `<option value="${escape(value)}"${String(value) === String(current) ? ' selected' : ''}>${escape(label)}</option>`;
  function select(id, label, values, current) { return `<label class="field">${label}<select id="${id}" aria-label="${label}">${values.map(v => option(v.id ?? v.value, v.label ?? v.name, current)).join('')}</select></label>`; }
  const normalize = v => String(v).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const queryMatch = (text, q) => normalize(q).split(' ').filter(Boolean).every(word => normalize(text).includes(word));
  function announce(text) { clearTimeout(statusTimer); document.querySelector('#status').textContent = text; statusTimer = setTimeout(() => document.querySelector('#status').textContent = '', 3000); }
  function defaults(screen) { return { screen, q: '', category: '', item: '', page: '1', sort: 'default', gu: '', dong: '', industry: 'laundry-clean', sub: '', left: '', right: '', diff: '', condition: '', value: '' }; }
  function read() {
    const [screen, query] = location.hash.slice(1).split('?');
    const name = ['products', 'compare', 'neighborhood', 'apps', 'saved'].includes(screen) ? screen : 'products';
    return { ...defaults(name), ...Object.fromEntries(new URLSearchParams(query || '')), screen: name };
  }
  function go(screen, patch = {}) {
    positions.set(location.hash, window.scrollY);
    if (state) memory[state.screen] = { ...state };
    const next = { ...(screen === state?.screen ? state : memory[screen] || defaults(screen)), ...patch, screen };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (key !== 'screen' && value && String(value) !== String(defaults(screen)[key])) params.set(key, value);
    const hash = '#' + screen + (params.size ? '?' + params : '');
    if (location.hash === hash) render(); else location.hash = hash;
  }
  function search(placeholder) { return `<form class="search" id="searchForm"><input id="query" type="search" aria-label="${escape(placeholder)}" placeholder="${escape(placeholder)}" value="${escape(state.q)}" autocomplete="off"><button type="submit" aria-label="검색" title="검색">${icon('Search')}</button></form>`; }
  function heading(text, back = false) { return `<div class="page-title">${back ? `<button class="back" data-action="back" aria-label="이전 화면" title="이전 화면">${icon('ArrowRight')}</button>` : ''}<h1>${escape(text)}</h1></div>`; }
  function pagination(total, current) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (pages === 1) return '';
    const keys = [...new Set([1, current - 1, current, current + 1, pages].filter(n => n >= 1 && n <= pages))].sort((a, b) => a - b);
    let previous = 0;
    return `<nav class="pagination" aria-label="페이지"><button data-page="${Math.max(1, current - 1)}" aria-label="이전 페이지"${current === 1 ? ' disabled' : ''}>‹</button>${keys.map(n => { const gap = n > previous + 1 ? '<span class="ellipsis">…</span>' : ''; previous = n; return gap + `<button data-page="${n}"${n === current ? ' aria-current="page"' : ''}>${n}</button>`; }).join('')}<button data-page="${Math.min(pages, current + 1)}" aria-label="다음 페이지"${current === pages ? ' disabled' : ''}>›</button></nav>`;
  }
  const empty = text => `<section class="empty"><h2>${text}</h2><p>검색어 또는 선택한 조건을 바꿔 주세요.</p><button class="primary secondary" data-action="reset">조건 초기화</button></section>`;
  function photo(p) { return `<div class="photo"><img src="${escape(safe(p.image))}" alt="${escape(p.name)}" loading="lazy" width="160" height="160"></div>`; }
  function purchase(p) {
    const direct = p.purchase?.kind === 'direct';
    return `<a class="primary" href="${escape(safe(direct ? p.purchase.url : p.sourceUrl))}" target="_blank" rel="noopener noreferrer">${escape(direct ? '쿠팡 상품 보기' : '판매처 보기')}${icon('ExternalLink')}</a>`;
  }
  function topFacts(p) {
    const keys = p.item === 'P051' ? ['capacity', 'induction', 'material'] : null;
    return p.facts.filter(f => (!keys || keys.includes(f.key)) && ['verified', 'yes', 'no'].includes(f.state))
      .map(f => { const parts = f.text.split(';').map(x => x.trim()).filter(Boolean); return { label: f.label, text: parts[0]?.endsWith(':') ? parts.slice(0, 2).join(' ') : parts[0] || '' }; })
      .filter(f => f.text && f.text.length <= 70 && !f.text.endsWith(':'))
      .slice(0, 3).map(f => `${f.label} ${f.text}`).join(' · ');
  }
  function productCard(p) {
    return `<article class="product" data-product="${escape(p.id)}"><div class="media-column">${photo(p)}<button class="save-button" data-save="${escape(p.id)}" aria-pressed="${saved.has(p.id)}" aria-label="${escape(p.name)} 저장">${icon('Bookmark')}저장</button></div><div class="product-copy"><div class="source">${escape(p.itemTitle)} · ${escape(p.source || '')}</div><h3>${escape(p.name)}</h3><p class="facts-line">${escape(topFacts(p))}</p><div class="product-actions">${purchase(p)}<label class="compare-check"><input type="checkbox" data-compare="${escape(p.id)}"${selected.has(p.id) ? ' checked' : ''}>비교</label></div></div><details class="product-details"><summary>제품 정보</summary><dl class="spec-list">${p.facts.map(f => `<dt>${escape(f.label)}</dt><dd>${escape(f.text)}</dd>`).join('')}</dl><a href="${escape(safe(p.sourceUrl))}" target="_blank" rel="noopener noreferrer">원래 상품 보기 ${icon('ExternalLink')}</a></details></article>`;
  }
  function productsScreen(isSaved = false) {
    let list = D.products.filter(p => (!isSaved || saved.has(p.id)) && (!state.category || p.category === state.category) && (!state.item || p.item === state.item) && queryMatch(p.name + ' ' + p.itemTitle + ' ' + topFacts(p), state.q));
    if (state.condition && state.value) list = list.filter(p => p.facts.some(f => f.key === state.condition && f.text === state.value && !['unknown', 'not_applicable'].includes(f.state)));
    if (state.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const pages = Math.max(1, Math.ceil(list.length / pageSize)), page = Math.min(Math.max(1, Number(state.page) || 1), pages);
    const groups = D.groups.filter(g => !state.category || g.category === state.category);
    const currentGroup = D.groups.find(g => g.id === state.item);
    const title = isSaved ? '저장한 상품' : currentGroup?.title || state.category || '상품';
    main.innerHTML = (isSaved ? heading(title, true) : '') + search('수건, 세제, 인덕션 냄비') + `<div class="filters">${select('category', '카테고리', [{ id: '', label: '전체 카테고리' }, ...D.categories.map(c => ({ id: c, label: c }))], state.category)}${select('item', '품목', [{ id: '', label: '전체 품목' }, ...groups.map(g => ({ id: g.id, label: g.title }))], state.item)}</div>` +
      (currentGroup?.focused ? refineFilters(currentGroup.id) : '') +
      `<div class="list-heading"><h2>${escape(title)}</h2><select id="sort" class="sort" aria-label="정렬"><option value="default">기본순</option><option value="name"${state.sort === 'name' ? ' selected' : ''}>이름순</option><option disabled>가격순 · 자료 연결 전</option><option disabled>평점순 · 자료 연결 전</option></select></div>` +
      (state.q ? `<p class="context">${escape(state.q)}</p>` : '') +
      (list.length ? `<section class="product-list" aria-label="상품 목록">${list.slice((page - 1) * pageSize, page * pageSize).map(productCard).join('')}</section>${pagination(list.length, page)}` : empty(isSaved ? '저장한 상품이 없습니다' : '조건에 맞는 상품이 없습니다'));
  }
  function refineFilters(item) {
    const candidates = D.products.filter(p => p.item === item);
    const allowed = item === 'P051' ? ['capacity', 'induction', 'gas', 'material', 'diameter', 'servings'] : [...new Set(candidates.flatMap(p => p.facts.map(f => f.key)))];
    const fields = allowed.flatMap(key => {
      const facts = candidates.flatMap(p => p.facts.filter(f => f.key === key && !['unknown', 'not_applicable'].includes(f.state) && f.text.length < 45));
      if (!facts.length) return [];
      const values = [...new Set(facts.map(f => f.text))];
      return [{ key, label: facts[0].label, values }];
    });
    return `<details class="refine"${state.condition ? ' open' : ''}><summary>조건</summary><div class="filters">${select('condition', '기준', [{ id: '', label: '전체 기준' }, ...fields.map(f => ({ id: f.key, label: f.label }))], state.condition)}${select('conditionValue', '선택값', [{ id: '', label: '전체' }, ...(fields.find(f => f.key === state.condition)?.values || []).map(v => ({ id: v, label: v }))], state.value)}</div></details>`;
  }
  function compareScreen() {
    const item = state.item || 'P051', candidates = D.products.filter(p => p.item === item);
    const left = candidates.find(p => p.id === state.left) || candidates[0];
    const capacity = p => p?.facts.find(f => f.key === 'capacity' && f.state === 'verified')?.text;
    const right = candidates.find(p => p.id === state.right && p.id !== left?.id) || candidates.find(p => p.id !== left?.id && capacity(p) && capacity(p) !== capacity(left)) || candidates.find(p => p.id !== left?.id);
    if (!left || !right) { main.innerHTML = heading('상품 비교', true) + empty('이 시안의 비교 후보가 부족합니다'); return; }
    const keys = [...new Set([...left.facts, ...right.facts].map(f => f.key))].filter(k => !['care', 'compatibility', 'claims', 'packagingDimensions', 'packagingWeight'].includes(k));
    const row = (p, key) => p.facts.find(f => f.key === key) || { key, text: '미확인', state: 'unknown' };
    main.innerHTML = heading(left.itemTitle, true) + `<section class="comparison-heads" aria-label="비교 상품">${[left, right].map((p, index) => `<div class="compare-product">${select(index ? 'rightProduct' : 'leftProduct', index ? '오른쪽 상품' : '왼쪽 상품', candidates.filter(x => index ? x.id !== left.id : x.id !== right.id).map(x => ({ id: x.id, label: x.name })), p.id)}${photo(p)}<h3>${escape(p.name)}</h3>${purchase(p)}</div>`).join('')}</section><div class="comparison-options"><label><input id="onlyDifference" type="checkbox"${state.diff === '1' ? ' checked' : ''}>차이만 보기</label></div><dl class="difference-table">${keys.map(key => { const a = row(left, key), b = row(right, key), different = a.text !== b.text; if (state.diff && !different && a.state !== 'unknown' && b.state !== 'unknown') return ''; return `<div class="difference-row${different ? ' is-different' : ''}"><dt>${escape(left.facts.find(f => f.key === key)?.label || right.facts.find(f => f.key === key)?.label || key)}</dt><dd>${escape(a.text)}</dd><dd>${escape(b.text)}</dd></div>`; }).join('')}</dl><div class="comparison-source">${[left, right].map(p => `<a href="${escape(safe(p.sourceUrl))}" target="_blank" rel="noopener noreferrer">${escape(p.source)} 원래 상품 ${icon('ExternalLink')}</a>`).join('')}</div>`;
  }
  function neighborhoodScreen() {
    const district = D.districts.find(d => d.code === state.gu);
    const dong = district?.dongs.find(d => d.code === state.dong);
    const region = [district?.name, dong?.name].filter(Boolean).join(' ') || '서울 전체';
    const industry = labelOf(D.industries, state.industry, '업종');
    const subtypes = state.industry === 'laundry-clean' ? ['세탁소', '셀프빨래방', '청소업체', '방역업체'] : ['업체'];
    let list = Array.from({ length: 12 }, (_, n) => ({ id: n, type: subtypes[n % subtypes.length], name: `${subtypes[n % subtypes.length]} 상호명 ${String(n + 1).padStart(2, '0')}` }));
    list = list.filter(p => (!state.sub || p.type === state.sub) && queryMatch(p.name + ' ' + industry, state.q));
    const page = Math.min(Math.max(1, Number(state.page) || 1), Math.max(1, Math.ceil(list.length / pageSize)));
    main.innerHTML = heading('우리동네') + '<p class="sample-note">목록은 위치·정보 배치를 보는 자리 표시자입니다. 실제 업소·영업·평가 정보가 아닙니다.</p>' +
      `<div class="filters">${select('gu', '구', [{ id: '', label: '서울 전체' }, ...D.districts.map(d => ({ id: d.code, label: d.name }))], state.gu)}${select('dong', '동', [{ id: '', label: '전체 동' }, ...(district?.dongs || []).map(d => ({ id: d.code, label: d.name }))], state.dong)}${select('industry', '업종', D.industries, state.industry)}${select('placeSub', '세부 업종', [{ id: '', label: '전체' }, ...subtypes.map(x => ({ id: x, label: x }))], state.sub)}</div>` + search('상호명 또는 장소 검색') + `<div class="list-heading"><h2>${escape(region)}</h2></div>` +
      (list.length ? `<section class="place-list" aria-label="장소 구조 예시">${list.slice((page - 1) * pageSize, page * pageSize).map(p => `<article class="place"><div class="category-label">${escape(industry)}</div><h3>${escape(p.name)}</h3><p>이 장소에서 할 수 있는 일 한 줄 설명</p><p class="address">${escape(region)} · 도로명 주소 영역</p><div class="place-actions"><button class="primary secondary" data-place="${escape(p.name)}">${icon('MapPin')}위치 보기</button></div></article>`).join('')}</section>${pagination(list.length, page)}` : empty('조건에 맞는 예시가 없습니다'));
  }
  function appsScreen() {
    const list = D.apps.filter(a => (!state.category || a.categories.includes(state.category)) && queryMatch(a.name + ' ' + a.description, state.q));
    const page = Math.min(Math.max(1, Number(state.page) || 1), Math.max(1, Math.ceil(list.length / pageSize)));
    main.innerHTML = heading('생활 앱') + search('수거 세탁, 청소, 폐기물 배출') + `<div class="filters">${select('appCategory', '필요한 일', [{ id: '', label: '전체 목적' }, ...D.appCategories], state.category)}</div><div class="list-heading"><h2>${escape(labelOf(D.appCategories, state.category, '생활 서비스'))}</h2></div>` +
      (list.length ? `<section class="app-list">${list.slice((page - 1) * pageSize, page * pageSize).map(a => `<article class="app"><div class="app-letter" aria-hidden="true">${escape(Array.from(a.name)[0])}</div><div><div class="category-label">${escape(a.categories.map(c => labelOf(D.appCategories, c)).filter(Boolean).join(' · '))}</div><h3>${escape(a.name)}</h3><p>${escape(a.description)}</p><div class="app-actions">${a.web ? `<a class="primary secondary" href="${escape(safe(a.web))}" target="_blank" rel="noopener noreferrer">${escape(a.webLabel)}${icon('ExternalLink')}</a>` : ''}${a.ios ? `<a href="${escape(safe(a.ios))}" target="_blank" rel="noopener noreferrer">App Store ${icon('ExternalLink')}</a>` : ''}${a.android ? `<a href="${escape(safe(a.android))}" target="_blank" rel="noopener noreferrer">Google Play ${icon('ExternalLink')}</a>` : ''}</div>${a.condition ? `<details class="product-details"><summary>이용 조건</summary><p class="condition">${escape(a.condition)}</p></details>` : ''}</div></article>`).join('')}</section>${pagination(list.length, page)}` : empty('일치하는 서비스가 없습니다'));
  }
  function renderTray() {
    const tray = document.querySelector('#compareTray');
    tray.hidden = !selected.size || !['products', 'saved'].includes(state.screen);
    tray.innerHTML = `<span>비교 목록 ${selected.size}</span><div class="text-row">${buttonIcon('X', '비교 목록 비우기', 'clear-compare')}<button class="primary" data-action="compare"${selected.size < 2 ? ' disabled' : ''}>차이 비교 ${icon('ArrowRight')}</button></div>`;
  }
  function render() {
    state = read();
    document.querySelector('#navigation').innerHTML = [['products', '상품', 'ShoppingBasket'], ['neighborhood', '우리동네', 'MapPin'], ['apps', '생활 앱', 'Link']].map(([screen, label, glyph]) => `<a href="#${screen}" data-nav="${screen}"${state.screen === screen || (screen === 'products' && ['compare', 'saved'].includes(state.screen)) ? ' aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></a>`).join('');
    if (state.screen === 'compare') compareScreen(); else if (state.screen === 'neighborhood') neighborhoodScreen(); else if (state.screen === 'apps') appsScreen(); else productsScreen(state.screen === 'saved');
    renderTray();
    document.querySelectorAll('[data-icon]').forEach(n => n.innerHTML = icon(n.dataset.icon));
    document.querySelectorAll('img').forEach(img => img.addEventListener('error', () => { const box = img.parentElement; box.classList.add('missing'); box.innerHTML = icon('Image'); box.setAttribute('aria-label', '사진 미확인'); }, { once: true }));
    main.dataset.route = location.hash;
    requestAnimationFrame(() => window.scrollTo(0, positions.get(location.hash) || 0));
  }
  document.addEventListener('submit', e => {
    if (e.target.id !== 'searchForm') return;
    e.preventDefault(); const q = document.querySelector('#query').value.trim();
    go(state.screen, { q, page: '1', ...(state.screen === 'products' ? { category: '', item: '', condition: '', value: '' } : {}) });
  });
  document.addEventListener('change', e => {
    const n = e.target;
    if (n.dataset.compare) {
      const p = product(n.dataset.compare), prior = product([...selected][0]);
      if (n.checked && prior && p.item !== prior.item) { n.checked = false; announce('같은 품목끼리 비교할 수 있습니다.'); return; }
      n.checked ? selected.add(p.id) : selected.delete(p.id); renderTray(); return;
    }
    const changes = { category: { category: n.value, item: '', condition: '', value: '' }, item: { item: n.value, condition: '', value: '' }, sort: { sort: n.value }, condition: { condition: n.value, value: '' }, conditionValue: { value: n.value }, gu: { gu: n.value, dong: '' }, dong: { dong: n.value }, industry: { industry: n.value, sub: '' }, placeSub: { sub: n.value }, appCategory: { category: n.value }, leftProduct: { left: n.value }, rightProduct: { right: n.value }, onlyDifference: { diff: n.checked ? '1' : '' } };
    if (changes[n.id]) go(state.screen, { ...changes[n.id], page: '1' });
  });
  document.addEventListener('click', e => {
    const n = e.target.closest('button,a'); if (!n) return;
    if (n.dataset.nav) { e.preventDefault(); go(n.dataset.nav); }
    if (n.id === 'savedButton') go('saved');
    if (n.dataset.page) go(state.screen, { page: n.dataset.page });
    if (n.dataset.save) { saved.has(n.dataset.save) ? saved.delete(n.dataset.save) : saved.add(n.dataset.save); const y = window.scrollY; render(); document.querySelector(`[data-save="${CSS.escape(n.dataset.save)}"]`)?.focus({ preventScroll: true }); requestAnimationFrame(() => window.scrollTo(0, y)); announce(saved.has(n.dataset.save) ? '저장했습니다.' : '저장을 해제했습니다.'); }
    if (n.dataset.action === 'back') { if (positions.size && history.length > 1) history.back(); else go('products'); }
    if (n.dataset.action === 'reset') go(state.screen, { q: '', category: '', item: '', page: '1', condition: '', value: '', sub: '' });
    if (n.dataset.action === 'clear-compare') { selected.clear(); render(); }
    if (n.dataset.action === 'compare') { const ids = [...selected]; go('compare', { item: product(ids[0]).item, left: ids[0], right: ids[1], diff: '' }); }
    if (n.dataset.place) { document.querySelector('#placeDialogAddress').textContent = n.dataset.place + ' · 주소 영역'; document.querySelector('#placeDialog').showModal(); }
    if (n.hasAttribute('data-close')) document.querySelector('#placeDialog').close();
  });
  window.addEventListener('hashchange', render);
  render();
})();
