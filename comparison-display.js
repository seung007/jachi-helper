(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./comparison-core.js"));
  else root.ComparisonDisplay = factory(root.ComparisonCore);
})(typeof globalThis === "object" ? globalThis : this, function (C) {
  "use strict";

  const general = "type size dimensions capacity amount count material compatibility care contents use cautions";
  const statements = {
    care: [
      ["식기세척기 사용 가능", ["식기세척기 사용 가능", "식기세척기 사용가능", "식기세척기 사용이 가능합니다", "식기세척기 사용 가능합니다"]],
      ["손으로 씻어주세요", ["손으로 씻어주세요", "손으로 씻어 주세요"]],
    ],
    compatibility: [
      ["가스레인지 사용 적합", ["가스레인지 사용 적합", "가스레인지 사용에 적합합니다", "가스레인지에 사용하기 적합합니다"]],
      ["인덕션레인지 적합", ["인덕션레인지 적합", "인덕션레인지에 적합합니다", "인덕션레인지에 사용하기 적합합니다"]],
      ["하이라이트 레인지 사용 적합", ["하이라이트 레인지에 사용하기 적합합니다"]],
      ["주물 화구 사용 적합", ["주물 화구에 사용하기 적합합니다"]],
      ["오븐 사용 가능", ["오븐 사용 가능", "오븐 사용가능", "오븐 사용이 가능합니다", "오븐 사용 가능합니다"]],
    ],
  };

  function definitions(item, group, products = [], scope = "essential") {
    const available = group?.attributeDefinitions || [];
    if (scope === "all") return available;
    const order = describe(item, group).map(d => d.key);
    return order.flatMap(key => {
      const definition = available.find(candidate => candidate.key === key);
      return definition && products.some(product => C.attribute(product, definition).status === "verified") ? [definition] : [];
    }).slice(0, 6);
  }

  const uniqueLines = text => [...new Set(text.split(/\r?\n/).map(line => line.trim()).filter(Boolean))].join("\n");
  const formatted = observation => String(observation.value) + (observation.unit ? " " + observation.unit : "");
  const legacyCare = "식기세척기·가스·인덕션·오븐 사용 표시";
  const statement = (key, part) => statements[key].find(([, sources]) => sources.includes(part))?.[0];

  function normalize(text, key) {
    if (!Object.hasOwn(statements, key)) return text;
    const parts = text.split(/\r?\n/).flatMap(line => line.split(/;|\/|(?<=[.。])[ \t]+/).map(part => ({
      text: part.trim().replace(/[.。]$/, ""), legacy: line.trim() === legacyCare,
    }))).filter(part => part.text);
    if (!parts.length) return text;
    const mapped = parts.map(part => statement(key, part.text));
    if (key === "compatibility") return mapped.every(Boolean) ? [...new Set(mapped)].join("\n") : text;
    const heat = parts.map(part => statement("compatibility", part.text));
    const explicit = new Set([...mapped, ...heat].filter(Boolean));
    const redundantLegacy = parts.some(part => part.legacy) &&
      ["식기세척기 사용 가능", "가스레인지 사용 적합", "인덕션레인지 적합", "오븐 사용 가능"].every(part => explicit.has(part));
    // Omit heat statements only when explicit care remains and no condition or unknown clause would be lost.
    if (!mapped.some(Boolean) || parts.some((part, index) => !mapped[index] && !heat[index] && !(part.legacy && redundantLegacy))) return text;
    return [...new Set(mapped.filter(Boolean))].join("\n");
  }

  function present(product, definition, scope = "essential") {
    const observation = C.attribute(product, definition);
    if (observation.status !== "verified") {
      const text = observation.status === "not_applicable" ? "해당없음" : "미확인";
      return { text, raw: text, hasDetail: false };
    }
    const raw = formatted(observation);
    if (scope === "all") return { text: raw, raw, hasDetail: false };
    let text = definition.type === "text" ? uniqueLines(normalize(raw, definition.key)) : raw;
    const characters = Array.from(text);
    if (characters.length > 120) text = characters.slice(0, 100).join("") + "…";
    return { text, raw, hasDetail: text !== raw };
  }

  function differences(products = [], definitions = []) {
    const result = [];
    const base = products[0];
    if (!base) return result;
    for (const definition of definitions) {
      if (definition.type !== "number") continue;
      const left = C.attribute(base, definition);
      if (left.status !== "verified") continue;
      for (const product of products.slice(1)) {
        const right = C.attribute(product, definition);
        if (right.status !== "verified" || left.unit !== right.unit || left.value === right.value) continue;
        result.push({ key: definition.key, label: definition.label, baseId: base.id, productId: product.id,
          text: `${definition.label}: ${formatted(left)} → ${formatted(right)}` });
        if (result.length === 3) return result;
      }
    }
    return result;
  }

  function coupangLink(product) {
    if (product?.kind === 'guidance') return null;
    const source = C.safeUrl(product?.url);
    if (source) {
      const url = new URL(source);
      if (['coupang.com', 'www.coupang.com', 'm.coupang.com'].includes(url.hostname) && /^\/vp\/products\/\d+(?:\/|$)/.test(url.pathname)) {
        return { url: source, label: '쿠팡에서 보기', kind: 'product' };
      }
    }
    const name = typeof product?.name === 'string' ? product.name.trim() : '';
    return name ? { url: 'https://www.coupang.com/np/search?q=' + encodeURIComponent(name), label: '쿠팡에서 찾기', kind: 'search' } : null;
  }

  const heatStatements = {
    induction: { label: '인덕션', yes: ['인덕션레인지에 사용하기 적합합니다', '인덕션레인지에 적합합니다', '인덕션 사용 가능', '인덕션 사용가능'], no: ['인덕션 사용 불가', '인덕션 사용불가', '인덕션 사용 불가능'], term: /인덕션/ },
    gas: { label: '가스레인지', yes: ['가스레인지에 사용하기 적합합니다', '가스레인지 사용에 적합합니다', '가스레인지 사용 가능', '가스레인지 사용가능'], no: ['가스레인지 사용 불가', '가스레인지 사용불가', '가스레인지 사용 불가능'], term: /가스/ },
    oven: { label: '오븐', yes: ['오븐 사용 가능', '오븐 사용가능', '오븐 사용 가능합니다'], no: ['오븐 사용 불가', '오븐 사용불가', '오븐 사용 불가능'], term: /오븐/ },
    dishwasher: { label: '식기세척기', yes: ['식기세척기 사용 가능', '식기세척기 사용가능', '식기세척기 사용 가능합니다'], no: ['식기세척기 사용 불가', '식기세척기 사용불가', '식기세척기 사용 불가능'], term: /식기세척기/ },
  };
  function cookingDetails(product) {
    const entries = ['compatibility', 'care'].map(key => observation(product, { key, type: 'text' }))
      .filter(a => a.status === 'verified' && C.safeUrl(a.sourceUrl));
    const result = {};
    for (const [key, rule] of Object.entries(heatStatements)) {
      const matches = [];
      for (const a of entries) {
        const clauses = a.value.split(/[;\n]|(?<=[.。])[ \t]+/).map(raw => raw.trim().replace(/[.。]$/, ''));
        const unscopedRestriction = clauses.some(clause => clause !== legacyCare &&
          !Object.values(heatStatements).some(heat => heat.term.test(clause)) &&
          /(?:단[, ]|다만|제외|별도|조건|미확인|불가|불가능|금지|않|필요|최대|이하|이상|초과)/.test(clause));
        for (const clause of clauses) {
          if (!rule.term.test(clause)) continue;
          // This legacy summary repeats the exact claims; it is not independent evidence.
          if (clause === legacyCare) continue;
          const state = rule.yes.includes(clause) ? 'yes' : rule.no.includes(clause) ? 'no' : 'unknown';
          matches.push({ ...a, state: unscopedRestriction ? 'unknown' : state });
        }
      }
      const states = new Set(matches.map(a => a.state));
      const state = states.size === 1 && !states.has('unknown') ? matches[0].state : 'unknown';
      const observation = matches.find(a => a.state === state);
      result[key] = { label: rule.label, state, text: state === 'yes' ? '가능' : state === 'no' ? '불가' : '미확인', ...(observation ? { sourceUrl: C.safeUrl(observation.sourceUrl), ...(observation.checkedAt ? { checkedAt: observation.checkedAt } : {}) } : {}) };
    }
    const provided = C.attribute(product, { key: 'servings', type: 'text' });
    const providedNumber = C.attribute(product, { key: 'servings', type: 'number' });
    const explicit = provided.status === 'verified' ? provided : providedNumber.status === 'verified' ? providedNumber : null;
    const name = typeof product?.name === 'string' ? product.name : '';
    const portion = name.match(/\d+(?:\.\d+)?(?:\s*[~～-]\s*\d+(?:\.\d+)?)?\s*인(?:분|용)/)?.[0];
    result.servings = explicit && C.safeUrl(explicit.sourceUrl) ? { label: '인분·인용 표기', state: 'verified', text: formatted(explicit), sourceUrl: explicit.sourceUrl, ...(explicit.checkedAt ? { checkedAt: explicit.checkedAt } : {}) } :
      portion && C.safeUrl(product.url) ? { label: C.eligible(product) ? '인분·인용 표기' : '제품명 표기', state: 'verified', text: portion, sourceUrl: C.safeUrl(product.url), ...(C.eligible(product) && product.checkedAt ? { checkedAt: product.checkedAt } : {}) } : { label: '인분 표기', state: 'unknown', text: '미확인' };
    return result;
  }

  // Display profiles route known purposes only; they are not product specifications.
  const detailProfiles = {
    '먹거리': 'amount storage preparation allergens ingredients nutrition count expiry type',
    '주방용품': 'dimensions material care capacity compatibility contents type',
    '욕실·위생': 'amount use cautions ingredients material care compatibility type',
    '세탁·의류관리': 'compatibility dosage amount use cautions ingredients fragrance care type',
    '청소·폐기': 'use cautions amount compatibility material care contents type',
    '침구·가구': 'dimensions load material installation care size weight type',
    '가전': 'capacity installation power dimensions compatibility consumables care functions warranty type',
    '수납·생활도구': 'dimensions load material capacity mounting compatibility contents type',
    '환경·안전': 'use cautions certification installation compatibility expiry dimensions type',
  };
  const itemProfiles = {};
  const setProfile = (ids, keys) => ids.split(' ').forEach(id => { itemProfiles[id] = keys; });
  setProfile('P051', 'capacity induction gas servings diameter material height compatibility care oven dishwasher');
  setProfile('P052', 'diameter induction gas material care oven dishwasher capacity servings');
  setProfile('P053 P055 P059', 'length dimensions material care contents type');
  setProfile('P054 P056 P057 P058 P062', 'dimensions material care compatibility contents type');
  setProfile('P060 P063 P064 P065 P066 P067 P068 P069', 'capacity dimensions material care compatibility contents type');
  setProfile('P061', 'capacity size dimensions use material care type');
  setProfile('P070 P071 P072', 'size dimensions material use cautions count type');
  setProfile('P073', 'use amount cautions ingredients dosage fragrance type');
  setProfile('P074 P075 P076 P077 P079', 'size material use care count type');
  setProfile('P078 P100', 'dimensions load material mounting care type');
  setProfile('P080 P097 P098', 'size dimensions material care use type');
  setProfile('P087 P089 P095 P096', 'compatibility size use care cautions contents type');
  setProfile('P091 P092 P093 P094', 'size amount use cautions material count type');
  setProfile('P099', 'size dimensions compatibility material use care type');
  setProfile('P101', 'capacity dimensions material use care type');
  setProfile('P107 P109', 'use dosage cautions amount compatibility ingredients type');
  setProfile('P111 P113', 'size dimensions material use care type');
  setProfile('P112 P114 P115', 'dimensions load material mounting care type');
  setProfile('P116 P117', 'compatibility size use care power contents type');
  setProfile('P125 P126 P127 P128 P129 P130 P131 P132', 'use compatibility dimensions material care contents type');
  setProfile('P133 P134 P135 P136', 'capacity size dimensions use material care type');
  setProfile('P137 P138 P139 P140 P141 P142 P143 P144 P145', 'size material care dimensions filling weight warranty type');
  setProfile('P147 P148', 'dimensions material mounting care installation type');
  setProfile('P154', 'capacity servings installation power dimensions care functions type');
  setProfile('P164 P166', 'compatibility consumables care size contents type');
  setProfile('P171', 'capacity consumables installation power dimensions care type');
  setProfile('P175', 'size power cautions material care certification type');
  setProfile('P177', 'compatibility installation power functions dimensions type');
  setProfile('P178 P182 P185 P192', 'size dimensions compatibility material contents type');
  setProfile('P188', 'rating cautions power voltage certification declaredSafetyNumber outlets cableM compatibility dimensions contents type');
  setProfile('P189 P190 P191 P209', 'compatibility power voltage size cautions certification type');
  setProfile('P193 P194 P195', 'size dimensions use material contents type');
  setProfile('P196', 'use cautions size material compatibility type');
  setProfile('P197 P198', 'size dimensions material care type');
  setProfile('P199', 'dimensions mounting material type');
  setProfile('P201 P212', 'use performance care power warranty type');
  const purposeProfiles = {
    'P061-scale': 'size power capacity use care type',
    'P072-clip': 'dimensions material use count type',
    'P078-mat': 'dimensions material care type',
    'P082-leave-in': 'use amount cautions ingredients care type',
    'P087-head': 'compatibility size use care contents type',
    'P090-razor': 'compatibility use cautions contents type',
    'P109-spray': 'use cautions amount ingredients fragrance type',
    'P117-brush': 'use dimensions material care type',
    'P119-installed': 'use compatibility cautions amount dosage type',
    'P149-table': 'dimensions load material care installation type',
    'P152-beanbag': 'dimensions material filling care type',
    'P158-toaster': 'capacity power dimensions installation care type',
    'P163-jug': 'capacity consumables dimensions care material type',
    'P165-robot': 'installation capacity consumables power dimensions care type',
    'P187-hook': 'load mounting dimensions material cautions type',
    'P187-rod': 'dimensions load mounting material cautions type',
    'P189-cable': 'compatibility power dimensions cautions type',
    'P203-repair': 'use size material cautions type',
    'P210-alarm': 'use certification power installation cautions expiry type',
  };
  const labels = {
    type: '제품 유형', amount: '내용량', amountPerUnit: '개당 내용량', totalAmount: '총내용량',
    count: '수량', ingredients: '원재료·성분', nutrition: '영양 표시', allergens: '알레르기 표시',
    storage: '보관 방법', preparation: '조리 방법', expiry: '사용·소비기한', material: '소재',
    size: '규격', dimensions: '치수', capacity: '용량', compatibility: '호환 조건', care: '관리 방법',
    contents: '구성품', weight: '무게', dosage: '표시 사용량', fragrance: '향', cautions: '주의사항',
    power: '정격 소비전력', voltage: '정격 전압', installation: '설치 조건', functions: '기능',
    consumables: '교체 소모품', warranty: '보증·서비스', performance: '공식 시험·측정',
    load: '하중', mounting: '고정 방식', certification: '인증 표시', use: '사용 대상',
    diameter: '지름', height: '높이', width: '너비', length: '길이', depth: '깊이',
    bladeLength: '날 길이', filling: '충전재', origin: '원산지·제조국', packaging: '포장',
    brand: '브랜드', manufacturer: '제조사', model: '모델명', productCode: '상품 코드',
    color: '색상', salesUnit: '판매 단위', energyRating: '에너지 효율 등급',
    handleMaterial: '손잡이 소재', brushMaterial: '솔 소재', optionCount: '옵션 수', option: '표시 옵션',
    rating: '정격 전류·전압', declaredSafetyNumber: '표시 안전인증 번호', outlets: '콘센트 수', cableM: '케이블 길이(m)',
    induction: '인덕션', gas: '가스레인지', oven: '오븐', dishwasher: '식기세척기', servings: '인분·인용 표기',
  };
  // Only exact original ProductCatalog labels are adapted; never parse preference criteria.
  const aliases = {};
  const alias = (key, names) => names.split('|').forEach(name => { aliases[name] = key; });
  alias('amount', '내용량|내용량 옵션|표시 내용량|순중량|내용량(g)|내용량(kg)');
  alias('amountPerUnit', '개당 내용량'); alias('totalAmount', '총내용량');
  alias('count', '묶음 수량|수량|포장 수량 옵션'); alias('type', '제품 유형|제형');
  alias('storage', '보관 방법'); alias('preparation', '조리 방법'); alias('ingredients', '원재료|성분|원재료·성분');
  alias('allergens', '알레르기 표시'); alias('nutrition', '영양 표시'); alias('expiry', '사용·소비기한|소비기한|사용기한');
  alias('capacity', '용량|용량(L)|용량(mL)'); alias('diameter', '지름(cm)'); alias('height', '높이|높이(cm)');
  alias('width', '너비|너비(cm)'); alias('length', '길이(cm)|길이(m)'); alias('depth', '깊이');
  alias('length', '날 길이(cm)'); alias('dimensions', '치수|크기(mm)|크기(cm)');
  alias('size', '크기|규격|이불 크기|베개커버 크기'); alias('material', '소재|원단'); alias('filling', '충전재');
  alias('care', '관리 방법'); alias('contents', '구성|구성품'); alias('use', '표시 사용 대상|사용 대상');
  alias('fragrance', '향'); alias('weight', '총중량|표시 무게(g)|무게(kg)');
  alias('power', '정격 소비전력(W)|정격 소비전력'); alias('voltage', '정격 전압');
  alias('compatibility', '호환 조건|세탁기 호환'); alias('dosage', '표시 사용량'); alias('cautions', '주의사항');
  alias('installation', '설치 조건'); alias('load', '하중'); alias('certification', '인증 표시');
  alias('mounting', '고정 방식'); alias('consumables', '교체 소모품');
  alias('origin', '원산지|제조국'); alias('packaging', '포장'); alias('brand', '브랜드'); alias('manufacturer', '제조사');
  alias('model', '모델명'); alias('productCode', '상품 코드|상품 번호'); alias('color', '색상');
  alias('salesUnit', '단위|판매 단위'); alias('energyRating', '에너지 효율 등급');
  alias('handleMaterial', '손잡이 소재'); alias('brushMaterial', '솔 소재');
  alias('optionCount', '옵션 수'); alias('option', '표시 옵션');

  const lookup = (map, key) => Object.hasOwn(map, key) ? map[key] : undefined;
  const isCooking = item => ['P051', 'P052'].includes(item?.id);
  const suppliedDefinitions = group => Array.isArray(group?.attributeDefinitions) ? group.attributeDefinitions : [];
  const displayable = (item, key) => typeof key === 'string' &&
    !/price|cost|가격|비용|판매가|claims?|marketing|reviews?|후기|평점/i.test(key) &&
    (!/rating/i.test(key) || (item?.id === 'P188' && key === 'rating') || key === 'energyRating') &&
    (isCooking(item) || !Object.hasOwn(heatStatements, key));
  function describe(item, group) {
    if (item?.kind === 'guidance') return [];
    const profile = lookup(purposeProfiles, group?.id) || lookup(itemProfiles, item?.id) || lookup(detailProfiles, item?.category) || general;
    return [...new Set([...profile.split(' '), ...suppliedDefinitions(group).map(d => d.key)])]
      .filter(key => displayable(item, key))
      .map(key => ({ key, label: item?.id === 'P188' && Object.hasOwn(labels, key) ? labels[key] :
        suppliedDefinitions(group).find(d => d.key === key)?.label || (item?.id === 'P053' && key === 'length' ? '날 길이' : lookup(labels, key) || key) }));
  }
  function observation(product, definition) {
    const unknown = { status: 'unknown', value: null };
    if (product?.attributes && Object.hasOwn(product.attributes, definition.key)) {
      const a = C.attribute(product, definition);
      if (a.status === 'not_applicable') return a;
      return a.status === 'verified' && C.safeUrl(a.sourceUrl) ? a : unknown;
    }
    const facts = (Array.isArray(product?.facts) ? product.facts : [])
      .filter(f => lookup(aliases, f?.label) === definition.key && typeof f.value === 'string' && f.value.trim());
    if (!facts.length || facts.some(f => /^(?:미확인|확인 필요|정보 없음)$/.test(f.value.trim()) ||
      (f.status !== undefined && !['verified', 'not_applicable'].includes(f.status)) || !C.safeUrl(f.sourceUrl ?? product.url))) return unknown;
    if (new Set(facts.map(f => f.value)).size !== 1) return unknown;
    const f = facts[0];
    return { status: f.status === 'not_applicable' || f.value === '해당없음' ? 'not_applicable' : 'verified',
      value: f.value, sourceLabel: f.label, sourceUrl: C.safeUrl(f.sourceUrl ?? product.url), unit: '' };
  }
  function definitionFor(group, key) {
    return suppliedDefinitions(group).find(d => d.key === key) || { key, label: lookup(labels, key), type: 'text' };
  }
  function detailRow(item, group, product, key) {
    const label = describe(item, group).find(d => d.key === key)?.label || lookup(labels, key);
    if ((isCooking(item) && Object.hasOwn(heatStatements, key)) || key === 'servings') {
      const a = cookingDetails(product)[key];
      return { key, ...a };
    }
    const a = observation(product, definitionFor(group, key));
    const state = a.status;
    return { key, label: a.sourceLabel || label, state, text: state === 'verified' ? formatted(a) : state === 'not_applicable' ? '해당없음' : '미확인',
      ...(C.safeUrl(a.sourceUrl) ? { sourceUrl: C.safeUrl(a.sourceUrl) } : {}), ...(a.checkedAt ? { checkedAt: a.checkedAt } : {}) };
  }
  function details(item, group, product, { limit = 6 } = {}) {
    if (item?.kind === 'guidance') return [];
    const fields = describe(item, group);
    const actual = (Array.isArray(product?.facts) ? product.facts : []).map(f => lookup(aliases, f?.label));
    const keys = [...new Set([...fields.map(d => d.key), ...Object.keys(product?.attributes || {}), ...actual])]
      .filter(key => displayable(item, key) && (Object.hasOwn(labels, key) || suppliedDefinitions(group).some(d => d.key === key)));
    // P051's approved purchase checks remain visible even when all four are unknown.
    const important = new Set(item?.id === 'P051' ? ['capacity', 'induction', 'gas', 'servings'] : fields.slice(0, 2).map(d => d.key));
    const cap = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 6;
    return keys.map(key => detailRow(item, group, product, key))
      .filter(row => row.state !== 'unknown' || important.has(row.key)).slice(0, cap);
  }
  const selectorProfiles = {
    '먹거리': 'type storage', '주방용품': 'material size type capacity', '욕실·위생': 'type use compatibility size',
    '세탁·의류관리': 'compatibility type material size', '청소·폐기': 'use type compatibility material',
    '침구·가구': 'size material type', '가전': 'type compatibility capacity',
    '수납·생활도구': 'size material type compatibility', '환경·안전': 'type use compatibility size',
  };
  function selectorKeys(item, group) {
    if (item?.kind === 'guidance') return [];
    const keys = isCooking(item) ? 'induction gas material diameter capacity' :
      item?.id === 'P188' ? 'power compatibility' : lookup(selectorProfiles, item?.category) || 'type size material';
    const fields = new Set(describe(item, group).map(d => d.key));
    return keys.split(' ').filter(key => fields.has(key));
  }
  function filterValue(item, group, product, key) {
    if (isCooking(item) && Object.hasOwn(heatStatements, key)) {
      const a = cookingDetails(product)[key];
      return ['yes', 'no'].includes(a.state) ? { value: a.state, label: a.text, unit: '', numeric: false } : null;
    }
    const d = definitionFor(group, key);
    const a = observation(product, d);
    if (a.status !== 'verified') return null;
    const text = formatted(a);
    if (Array.from(text).length > 50 || /[\r\n;|]|<[^>]*>/.test(text)) return null;
    // Numeric selectors need standardized attributes, not numbers parsed from legacy text.
    const numeric = typeof a.value === 'number';
    if (d.type === 'number' && !numeric) return null;
    if (numeric && (d.type !== 'number' || !Object.hasOwn(product?.attributes || {}, key))) return null;
    return { value: text, label: text, unit: a.unit || '', numeric };
  }
  function filterOptions(item, group, products = []) {
    return selectorKeys(item, group).flatMap(key => {
      const values = products.map(p => filterValue(item, group, p, key)).filter(Boolean);
      if (!values.length || (values.some(v => v.numeric) && (values.some(v => !v.numeric) || new Set(values.map(v => v.unit)).size !== 1))) return [];
      return [{ key, label: describe(item, group).find(d => d.key === key).label,
        options: [...new Map(values.map(v => [v.value, { value: v.value, label: v.label }])).values()] }];
    }).slice(0, 2);
  }
  function matches(item, group, product, filters = {}) {
    if (item?.kind === 'guidance') return false;
    const allowed = new Set(selectorKeys(item, group));
    return Object.entries(filters || {}).every(([key, expected]) => {
      if (expected === '' || expected === 'all' || expected === null || expected === undefined) return true;
      if (!allowed.has(key)) return false;
      return filterValue(item, group, product, key)?.value === expected;
    });
  }

  return { definitions, present, differences, coupangLink, cookingDetails, details, describe, filterOptions, matches };
});
