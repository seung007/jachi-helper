const allRooms = ["full", "semi", "empty"];
const allLifestyles = ["cook", "delivery", "remote"];

function trackAnalyticsEvent(eventName, parameters = {}) {
  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, parameters);
    }
  } catch {
    // Analytics must never interrupt the purchase-planning flow.
  }
}

const items = [
  { name: "침구와 수건", group: "must", category: "sleep", rooms: allRooms, lifestyles: allLifestyles },
  { name: "욕실 소모품", group: "must", category: "bath", rooms: allRooms, lifestyles: allLifestyles },
  { name: "청소·세탁 소모품", group: "must", category: "clean", rooms: allRooms, lifestyles: allLifestyles },
  { name: "멀티탭", group: "must", category: "utility", rooms: allRooms, lifestyles: allLifestyles },
  { name: "건조대", group: "must", category: "clean", rooms: ["semi", "empty"], lifestyles: allLifestyles },
  { name: "기본 조리·식기", group: "must", category: "kitchen", rooms: ["semi", "empty"], lifestyles: ["cook"] },
  { name: "작업 조명", group: "must", category: "utility", rooms: allRooms, lifestyles: ["remote"] },
  { name: "수납 공간 점검", group: "later", category: "utility", rooms: allRooms, lifestyles: allLifestyles },
  { name: "창문 가림과 빛 조절", group: "later", category: "sleep", rooms: allRooms, lifestyles: allLifestyles },
  { name: "바닥 생활 물품", group: "later", category: "utility", rooms: allRooms, lifestyles: ["remote"] },
  { name: "간편 조리 도구", group: "later", category: "kitchen", rooms: ["semi", "empty"], lifestyles: ["cook"] },
  { name: "큰 식기 세트", group: "skip", category: "kitchen", rooms: allRooms, lifestyles: ["delivery"] },
  { name: "대형 가구", group: "skip", category: "utility", rooms: ["full", "semi"], lifestyles: allLifestyles },
  { name: "인테리어 소품", group: "skip", category: "utility", rooms: allRooms, lifestyles: allLifestyles }
];

const stageConfig = {
  search: {
    label: "방을 찾는 중",
    title: "계약 전 확인부터 정리해요",
    resultTitle: "방 비교 체크",
    guide: "이 단계에서는 물건을 고르기보다 집 조건을 비교하세요. 주차, 1층 음식점, 수납과 설치 공간을 후보별로 확인하는 화면입니다.",
    showPurchase: false,
    tasks: ["방 옵션과 관리 규정을 계약 전 확인", "수납 공간과 설치 공간을 직접 실측", "필요한 물품은 계약 확정 뒤에 다시 정리"]
  },
  contract: {
    label: "계약을 마침",
    title: "입주 준비 순서를 정리해요",
    resultTitle: "계약·입주 일정 점검",
    guide: "계약 직후에는 구매 목록보다 입주 가능일, 이사·배송 가능일, 방 상태를 먼저 맞춰 보세요.",
    showPurchase: false,
    tasks: ["계약서의 입주 가능일을 다시 확인", "이사·배송·설치 일정은 업체별 가능일을 확인", "입주 전 방 옵션과 하자 상태를 기록"]
  },
  move: {
    label: "입주를 준비 중",
    title: "내 방에 맞춰 준비표 만들기",
    resultTitle: "내 조건에 맞는 준비 항목",
    guide: "이 단계에서만 방 옵션과 생활 방식을 반영해 준비물·예산 입력으로 이어집니다.",
    showPurchase: true,
    tasks: ["방 옵션과 이미 가진 물건을 먼저 확인", "입주 전 필요한 일정은 업체별 가능일을 확인", "입주 당일 하자와 계량기 상태를 사진으로 기록", "전입신고: 실제 전입일 기준 14일 이내 신고"]
  },
  settle: {
    label: "입주한 뒤",
    title: "살면서 필요한 것만 남겨요",
    resultTitle: "생활 조정 메모",
    guide: "며칠 살아 본 뒤에 불편한 지점만 남기세요. 구매 목록을 처음부터 다시 만들지 않고 실제 동선과 수납을 기준으로 정리합니다.",
    showPurchase: false,
    tasks: ["며칠 생활한 뒤 불편한 지점을 메모", "수납과 동선은 실제 사용 뒤에 다시 조정", "부족한 물품은 예산을 보고 하나씩 추가"]
  }
};

const preferenceMatches = {
  practical: ["소모품 수량과 보관 위치", "이사·배송·설치 일정", "입주 첫 달 예산 입력"],
  space: ["수납 공간과 자주 쓰는 동선", "창문·문 열림 범위", "접이식 또는 다용도 여부"],
  mood: ["낮과 밤의 빛", "창문 가림과 사생활", "생활 공간에서 오래 보는 요소"]
};

const propertyLabels = {
  parking: { unknown: "주차: 아직 확인 안 함", available: "주차: 가능", none: "주차: 불가" },
  restaurant: { unknown: "1층 음식점: 아직 확인 안 함", yes: "1층 음식점: 있음", no: "1층 음식점: 없음" },
  interior: { later: "인테리어: 입주 뒤 참고", interested: "인테리어: 참고할 예정" }
};

const purchaseCategories = [
  { title: "침구·수면", prefixes: ["bedding-"], query: "자취 침구 준비물", image: "bedding" },
  { title: "욕실", prefixes: ["bath-"], query: "자취 욕실 준비물", image: "bath" },
  { title: "주방", prefixes: ["kitchen-"], query: "자취 주방용품", image: "kitchen" },
  { title: "청소·세탁", prefixes: ["clean-", "laundry-"], query: "자취 청소 세탁용품", image: "clean" }
];

const recommendationGroups = [
  {
    prefix: "bedding",
    category: "침구·수면",
    stores: ["ohouse", "coupang", "naver"],
    items: [
      ["cover", "매트리스 커버", 8, true, false], ["duvet", "이불", 10, true, false], ["pillow", "베개", 10, true, false],
      ["pad", "방수패드", 6, false, false], ["hanger", "옷걸이", 8, false, true], ["curtain", "커튼 또는 블라인드", 5, false, true]
    ]
  },
  {
    prefix: "bath",
    category: "욕실",
    stores: ["daiso", "coupang", "naver"],
    items: [
      ["towel", "수건", 10, true, false], ["toiletries", "샴푸·바디워시", 10, true, false], ["toothbrush", "칫솔·치약", 10, true, false],
      ["mat", "발매트", 5, false, false], ["toilet-paper", "화장지", 9, true, false], ["basket", "빨래 바구니", 7, false, true]
    ]
  },
  {
    prefix: "kitchen",
    category: "주방",
    stores: ["daiso", "coupang", "naver"],
    items: [
      ["pot", "냄비", 8, false, false], ["pan", "프라이팬", 8, false, false], ["cutlery", "수저·젓가락", 8, true, false],
      ["dishes", "접시·컵", 7, true, false], ["container", "밀폐용기", 5, false, true], ["bag", "음식물·종량제 봉투", 9, true, false]
    ]
  },
  {
    prefix: "clean",
    category: "청소",
    stores: ["daiso", "coupang", "naver"],
    items: [
      ["wipes", "청소포·물티슈", 8, true, false], ["detergent", "주방·욕실 세제", 9, true, false], ["broom", "빗자루 또는 밀대", 7, false, true],
      ["gloves", "고무장갑", 7, false, false], ["trash", "쓰레기통", 8, true, true], ["recycle", "분리수거 봉투", 8, true, false]
    ]
  },
  {
    prefix: "laundry",
    category: "세탁",
    stores: ["daiso", "coupang", "naver"],
    items: [
      ["detergent", "세탁세제", 9, true, false], ["dryer", "건조대", 8, false, true], ["clips", "빨래집게", 5, false, false],
      ["net", "세탁망", 5, false, false], ["softener", "섬유유연제", 4, false, false], ["bag", "세탁물 보관 봉투", 4, false, true]
    ]
  },
  {
    prefix: "life",
    category: "생활·수납",
    stores: ["daiso", "coupang", "naver"],
    items: [
      ["powerstrip", "멀티탭", 10, true, false], ["storage", "수납 박스", 7, false, true], ["scissors", "가위·커터칼", 7, true, false],
      ["tape", "테이프", 6, false, false], ["light", "스탠드 또는 조명", 5, false, true], ["umbrella", "우산", 5, false, false]
    ]
  },
  {
    prefix: "safe",
    category: "안전·건강",
    stores: ["coupang", "naver", "daiso"],
    items: [["door", "도어스토퍼", 7, true, false], ["medicine", "상비약", 8, true, false], ["flashlight", "손전등", 6, false, false]]
  }
];

const recommendationCatalog = Object.fromEntries(
  recommendationGroups.flatMap((group) =>
    group.items.map(([key, title, weight, firstDay, compact]) => [
      `${group.prefix}-${key}`,
      { title, category: group.category, weight, firstDay, compact, stores: group.stores }
    ])
  )
);

const planDefaults = {
  cooking: "",
  drying: "",
  workout: "",
  fragrance: "",
  storage: "",
  purchaseBudget: 0
};

const planConditionLabels = {
  cooking: { often: "요리를 자주 해요", rarely: "조리는 가끔 해요" },
  drying: { indoor: "실내 건조가 많아요", dryer: "건조기를 써요" },
  workout: { yes: "운동복 세탁이 있어요", no: "일반 세탁 위주예요" },
  fragrance: { sensitive: "향에 민감해요", normal: "향은 상관없어요" },
  storage: { limited: "수납이 넉넉하지 않아요", normal: "수납 여유가 있어요" }
};

const categoryCriteria = {
  "침구·수면": "침대·창문 규격과 세탁 가능 여부를 확인하세요.",
  "욕실": "욕실 수납과 기본 제공 품목을 먼저 확인하세요.",
  "주방": "가스·인덕션 종류와 실제 조리 빈도를 확인하세요.",
  "청소": "바닥 재질과 관리사무소 분리수거 기준을 확인하세요.",
  "세탁": "세탁기 유무와 건조 공간을 먼저 확인하세요.",
  "생활·수납": "콘센트 위치와 수납할 공간을 재보세요.",
  "안전·건강": "집에 이미 비치된 안전 설비와 보관 위치를 확인하세요."
};

const itemSignals = {
  "kitchen-pot": { condition: "cooking", match: "often", reason: "직접 조리할 때 기본으로 쓰는 조리 도구", criteria: "가스·인덕션 호환과 필요한 크기를 확인하세요." },
  "kitchen-pan": { condition: "cooking", match: "often", reason: "직접 조리할 때 기본으로 쓰는 조리 도구", criteria: "가스·인덕션 호환과 필요한 크기를 확인하세요." },
  "kitchen-container": { condition: "cooking", match: "often", reason: "조리한 음식 보관에 필요한 항목", criteria: "냉장고 공간과 전자레인지 사용 여부를 확인하세요." },
  "laundry-dryer": { condition: "drying", match: "indoor", reason: "실내에서 빨래를 말릴 때 먼저 필요한 항목", criteria: "창문 위치와 펼칠 수 있는 폭을 재보세요." },
  "laundry-detergent": { condition: "fragrance", match: "sensitive", reason: "향 민감도를 반영해 세탁 기준을 먼저 정할 항목", criteria: "무향·저자극 표기와 의류 세탁 표시를 확인하세요.", search: "무향 저자극" },
  "laundry-softener": { condition: "fragrance", match: "sensitive", reason: "향 민감도가 있으면 성분과 향을 먼저 확인할 항목", criteria: "향료 유무와 사용량을 확인한 뒤 결정하세요.", search: "무향" },
  "laundry-net": { condition: "workout", match: "yes", reason: "운동복을 자주 세탁할 때 마찰을 줄이기 위한 항목", criteria: "운동복 소재와 세탁망 크기를 확인하세요." },
  "life-storage": { condition: "storage", match: "limited", reason: "수납 여유가 적을 때 동선을 먼저 정리할 항목", criteria: "빈 공간의 가로·세로·높이를 재고 고르세요." },
  "bedding-hanger": { condition: "storage", match: "limited", reason: "옷장 수납이 부족할 때 먼저 필요한 항목", criteria: "옷장 봉 길이와 옷걸이 두께를 확인하세요." },
  "bath-basket": { condition: "storage", match: "limited", reason: "세탁물 동선을 정리할 때 필요한 항목", criteria: "욕실·세탁기 주변에 둘 공간을 확인하세요." }
};

const immediateItemIds = new Set([
  "bedding-duvet",
  "bedding-pillow",
  "bath-towel",
  "bath-toiletries",
  "bath-toothbrush",
  "bath-toilet-paper",
  "kitchen-bag",
  "clean-wipes",
  "clean-detergent",
  "clean-trash",
  "life-powerstrip"
]);

const homePreviewItems = [
  { id: "bath-towel", context: "입주 첫날", imagePosition: "100% 0%" },
  { id: "kitchen-pot", context: "요리를 자주 한다면", imagePosition: "0% 100%" },
  { id: "laundry-dryer", context: "실내 건조라면", imagePosition: "100% 100%" }
];

const plannerForm = document.querySelector("#plannerForm");
const storageKey = "jachi-helper:v1";
const budgetFieldNames = [
  "income",
  "deposit",
  "contract",
  "setup",
  "housing",
  "living"
];

const legacyBudgetGroups = {
  housing: ["rent", "maintenance"],
  living: ["communication", "insuranceDebt", "utilities", "food", "transport", "daily", "savings"],
  setup: ["moving", "supplies", "oneTimeOther"]
};

const purchasePlanCacheTtlMs = 20 * 60 * 1000;
const budgetCacheTtlMs = 20 * 60 * 1000;
let purchasePlanExpiryTimer;
let budgetExpiryTimer;

function hasPurchasePlanData(state) {
  return Boolean(
    Object.keys(state.checklist || {}).length
    || Object.keys(state.planPreferences || {}).length
    || Object.keys(state.recommendationDecisions || {}).length
  );
}

function clearExpiredPurchasePlan(state) {
  const expiresAt = Number(state.purchasePlanExpiresAt);
  if (expiresAt > Date.now()) return state;
  if (!expiresAt && !hasPurchasePlanData(state)) return state;

  const nextState = { ...state };
  delete nextState.checklist;
  delete nextState.planPreferences;
  delete nextState.recommendationDecisions;
  delete nextState.purchasePlanExpiresAt;

  try {
    localStorage.setItem(storageKey, JSON.stringify(nextState));
  } catch {
    // Keep the current page usable even when browser storage is unavailable.
  }
  return nextState;
}

function clearExpiredBudget(state) {
  const expiresAt = Number(state.budgetExpiresAt);
  if (expiresAt > Date.now()) return state;
  if (!expiresAt && !state.budget) return state;

  const nextState = { ...state };
  delete nextState.budget;
  delete nextState.budgetExpiresAt;

  try {
    localStorage.setItem(storageKey, JSON.stringify(nextState));
  } catch {
    // Keep the current page usable even when browser storage is unavailable.
  }
  return nextState;
}

function readStoredState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    if (!saved || typeof saved !== "object") return {};
    return clearExpiredBudget(clearExpiredPurchasePlan(saved));
  } catch {
    return {};
  }
}

function writeStoredState(state) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function writePurchasePlanState(state) {
  return writeStoredState({ ...state, purchasePlanExpiresAt: Date.now() + purchasePlanCacheTtlMs });
}

function writeBudgetState(state) {
  return writeStoredState({ ...state, budgetExpiresAt: Date.now() + budgetCacheTtlMs });
}

function schedulePurchasePlanExpiry(onExpire) {
  window.clearTimeout(purchasePlanExpiryTimer);
  const expiresAt = Number(readStoredState().purchasePlanExpiresAt);
  if (!expiresAt) return;

  purchasePlanExpiryTimer = window.setTimeout(() => {
    clearExpiredPurchasePlan(readStoredState());
    onExpire();
  }, Math.max(0, expiresAt - Date.now()) + 50);
}

function scheduleBudgetExpiry(onExpire) {
  window.clearTimeout(budgetExpiryTimer);
  const expiresAt = Number(readStoredState().budgetExpiresAt);
  if (!expiresAt) return;

  budgetExpiryTimer = window.setTimeout(() => {
    clearExpiredBudget(readStoredState());
    onExpire();
  }, Math.max(0, expiresAt - Date.now()) + 50);
}

function formatWon(value) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function parseCurrency(value) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  const amount = Number(digits);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function formatCurrencyInput(input) {
  const digits = input.value.replace(/[^\d]/g, "");
  input.value = digits ? Number(digits).toLocaleString("ko-KR") : "";
}

function createStoreSearchLink(store, searchQuery, itemId, placement) {
  const query = encodeURIComponent(searchQuery);
  const tracking = `data-store-link data-store="${store}" data-item-id="${itemId}" data-placement="${placement}"`;
  if (store === "coupang") {
    return `<a href="https://www.coupang.com/np/search?q=${query}" target="_blank" rel="noreferrer" ${tracking} aria-label="쿠팡에서 ${searchQuery} 검색">쿠팡</a>`;
  }
  if (store === "naver") {
    return `<a href="https://search.naver.com/search.naver?where=shopping&query=${query}" target="_blank" rel="noreferrer" ${tracking} aria-label="네이버 쇼핑 결과에서 ${searchQuery} 검색">네이버쇼핑</a>`;
  }
  if (store === "daiso") {
    return `<a href="https://www.daisomall.co.kr/" target="_blank" rel="noreferrer" ${tracking}>다이소몰</a>`;
  }
  return `<a href="https://ohou.se/store" target="_blank" rel="noreferrer" ${tracking}>오늘의집</a>`;
}

function setupHomePreview() {
  const previewList = document.querySelector("#homePreviewList");
  if (!previewList) return;

  homePreviewItems.forEach(({ id, context, imagePosition }) => {
    const item = recommendationCatalog[id];
    if (!item) return;
    const signal = itemSignals[id];
    const reason = signal?.reason || (item.firstDay ? "입주 직후 바로 쓸 가능성이 높은 항목" : "생활 조건을 확인한 뒤 결정할 항목");
    const criteria = signal?.criteria || categoryCriteria[item.category];
    const searchQuery = `자취 ${item.title}`;
    const stores = item.stores
      .filter((store) => store === "naver" || store === "coupang")
      .map((store) => createStoreSearchLink(store, searchQuery, id, "home_preview"))
      .join("");
    const card = document.createElement("article");
    card.className = "home-preview-item";
    card.innerHTML = `
      <div class="home-preview-image" role="img" aria-label="${item.category} 준비물 예시" style="background-position: ${imagePosition}"></div>
      <div class="home-preview-copy">
        <span>${context}</span>
        <h3>${item.title}</h3>
        <p>${reason}</p>
        <small>${criteria}</small>
        <div class="home-preview-stores"><em>최신 가격 확인</em>${stores}</div>
      </div>
    `;
    previewList.append(card);
  });
}

function setupCurrencyInputs() {
  document.querySelectorAll("[data-currency]").forEach((input) => {
    input.addEventListener("input", () => formatCurrencyInput(input));
    input.addEventListener("blur", () => formatCurrencyInput(input));
  });
}

function formatAllCurrencyInputs() {
  document.querySelectorAll("[data-currency]").forEach(formatCurrencyInput);
}

function renderList(target, list) {
  if (!target) return;
  target.innerHTML = "";
  list.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item.stage ? `${item.stage} | ${item.task}` : item.name;
    target.appendChild(li);
  });
}

function calculatePlanner(form) {
  const data = new FormData(form);
  const stage = stageConfig[data.get("stage")] ? data.get("stage") : "move";
  const room = data.get("room") || "semi";
  const lifestyle = data.get("lifestyle") || "cook";
  const preference = data.get("preference") || "practical";
  const owned = new Set(data.getAll("owned"));
  const propertyNotes = [
    propertyLabels.parking[data.get("parking") || "unknown"],
    propertyLabels.restaurant[data.get("restaurant") || "unknown"],
    propertyLabels.interior[data.get("interior") || "later"]
  ];
  const matched = items.filter(
    (item) => item.rooms.includes(room) && item.lifestyles.includes(lifestyle) && !owned.has(item.category)
  );
  const must = matched.filter((item) => item.group === "must");
  const later = matched.filter((item) => item.group === "later");
  const skip = matched.filter((item) => item.group === "skip");

  return {
    must,
    later,
    skip,
    stage: stageConfig[stage],
    stages: stageConfig[stage].tasks.map((task) => ({ stage: stageConfig[stage].label, task })),
    taste: preferenceMatches[preference],
    propertyNotes
  };
}

function setupPlannerStage() {
  const stageInput = document.querySelector("#selectedStageInput");
  if (!stageInput) return;

  const requestedStage = new URLSearchParams(window.location.search).get("stage");
  stageInput.value = stageConfig[requestedStage] ? requestedStage : "move";
}

function renderPlanner() {
  if (!plannerForm) return;

  const result = calculatePlanner(plannerForm);
  const mustCount = document.querySelector("#mustCount");
  const laterCount = document.querySelector("#laterCount");
  const timelineTitle = document.querySelector("#timelineTitle");
  const stageBadge = document.querySelector("#stageBadge");
  const stageLabel = document.querySelector("#plannerStageLabel");
  const pageTitle = document.querySelector("#plannerPageTitle");
  const resultTitle = document.querySelector("#plannerResultTitle");
  const stageGuide = document.querySelector("#stageGuide");
  const purchaseControls = document.querySelector("#purchaseControls");
  const purchaseResult = document.querySelector("#purchaseResult");
  const plannerNext = document.querySelector("#plannerNext");
  const lawNote = document.querySelector("#lawNote");

  if (mustCount) mustCount.textContent = `${result.must.length}개`;
  if (laterCount) laterCount.textContent = `${result.later.length}개`;
  if (timelineTitle) timelineTitle.textContent = `${result.stage.label} 일정 확인`;
  if (stageBadge) stageBadge.textContent = result.stage.label;
  if (stageLabel) stageLabel.textContent = result.stage.label;
  if (pageTitle) pageTitle.textContent = result.stage.title;
  if (resultTitle) resultTitle.textContent = result.stage.resultTitle;
  if (stageGuide) stageGuide.textContent = result.stage.guide;
  if (purchaseControls) purchaseControls.hidden = !result.stage.showPurchase;
  if (purchaseResult) purchaseResult.hidden = !result.stage.showPurchase;
  if (plannerNext) plannerNext.hidden = !result.stage.showPurchase;
  if (lawNote) lawNote.hidden = !result.stage.showPurchase;

  renderList(document.querySelector("#mustList"), result.must);
  renderList(document.querySelector("#laterList"), result.later);
  renderList(document.querySelector("#skipList"), result.skip.length ? result.skip : [{ name: "현재 조건에서는 없음" }]);
  renderList(document.querySelector("#timelineList"), result.stages);
  renderList(document.querySelector("#tasteList"), result.taste.map((name) => ({ name })));
  renderList(document.querySelector("#propertyList"), result.propertyNotes.map((name) => ({ name })));
}

async function copyPlan() {
  const copyStatus = document.querySelector("#copyStatus");
  if (!plannerForm || !copyStatus) return;

  if (!navigator.clipboard) {
    copyStatus.textContent = "이 브라우저에서는 복사를 지원하지 않습니다.";
    return;
  }

  const result = calculatePlanner(plannerForm);
  const formatList = (title, list) => `${title}\n${list.map((item) => `- ${item.name}`).join("\n")}`;
  const sections = ["[자취도우미 준비표]", `준비 단계: ${result.stage.label}`, result.stage.guide];
  if (result.stage.showPurchase) {
    sections.push(
      "",
      formatList("현재 조건에서 확인", result.must),
      "",
      formatList("구매 전 판단", result.later),
      "",
      formatList("추가로 확인해 볼 것", result.taste.map((name) => ({ name }))),
      "",
      "참고: 물품 목록은 선택값에 따른 임시 확인 항목입니다. 구매 권고나 필수 판단으로 사용하지 않습니다."
    );
  }
  sections.push("", formatList("방 상태 메모", result.propertyNotes.map((name) => ({ name }))), "", "일정 확인", ...result.stages.map((item) => `- ${item.stage} | ${item.task}`));
  if (result.stage.showPurchase) sections.push("", "전입신고는 실제 전입일 기준 14일 이내 신고해야 합니다.");
  const text = sections.join("\n");

  try {
    await navigator.clipboard.writeText(text);
    copyStatus.textContent = "준비표를 복사했습니다.";
  } catch {
    copyStatus.textContent = "복사에 실패했습니다. 다시 시도해 주세요.";
  }
}

function setupChecklist() {
  const checklist = document.querySelector("#moveInChecklist");
  const progress = document.querySelector("#checklistProgress");
  const storageNote = document.querySelector("#checklistStorageNote");
  const resetButton = document.querySelector("#resetChecklist");
  const selected = document.querySelector("#ownedSelected");
  const selectedCount = document.querySelector("#ownedCount");
  const form = document.querySelector("#planSetupForm");
  const searchInput = document.querySelector("#ownedSearch");
  const categoryTabs = document.querySelector("#ownedCategoryTabs");
  if (!checklist || !progress || !storageNote) return;

  const state = readStoredState();
  const checks = state.checklist && typeof state.checklist === "object" ? { ...state.checklist } : {};
  const savedPlan = state.planPreferences && typeof state.planPreferences === "object"
    ? state.planPreferences
    : {};
  const requestedPurchaseBudget = parseCurrency(new URLSearchParams(window.location.search).get("purchaseBudget"));
  const groups = recommendationGroups.map((group) => ({
    title: group.category,
    items: group.items.map(([key, title]) => ({ id: `${group.prefix}-${key}`, title }))
  }));
  const labelsById = Object.fromEntries(groups.flatMap((group) => group.items.map((item) => [item.id, item.title])));
  let activeCategory = groups[0]?.title || "";
  let searchTerm = "";
  let showAllSelected = false;
  let hasTrackedPlanStart = false;
  let hasTrackedPlanComplete = false;

  function trackPlanStart() {
    if (hasTrackedPlanStart) return;
    hasTrackedPlanStart = true;
    trackAnalyticsEvent("plan_start", { flow: "purchase_plan" });
  }

  if (form) {
    Object.entries(planDefaults).forEach(([name, fallback]) => {
      const input = form.elements[name];
      const value = name === "purchaseBudget" && requestedPurchaseBudget
        ? requestedPurchaseBudget
        : savedPlan[name] ?? fallback ?? "";
      if (input instanceof RadioNodeList) input.value = String(value);
      else if (input) input.value = value ? String(value) : "";
    });
  }

  function updateProgress() {
    const checkedIds = Object.keys(checks).filter((id) => checks[id]);
    const completed = checkedIds.length;
    progress.textContent = completed ? `보유품 ${completed}개 제외됨` : "보유품을 먼저 빼세요";
    if (!selected || !selectedCount) return;

    selectedCount.textContent = `${completed}개 선택`;
    const visibleIds = showAllSelected ? checkedIds : checkedIds.slice(0, 4);
    selected.innerHTML = completed
      ? `${visibleIds.map((id) => {
        const label = labelsById[id] || id;
        return `<button type="button" class="selected-chip" data-remove-owned="${id}">${label}<span aria-hidden="true">×</span><span class="sr-only"> 보유품에서 제거</span></button>`;
      }).join("")}${completed > 4 ? `<button type="button" class="selected-expand" data-toggle-selected aria-expanded="${showAllSelected}">${showAllSelected ? "접기" : `+${completed - 4}개 더 보기`}</button>` : ""}`
      : '<p class="selected-empty">이미 가진 물건이 있다면 위 목록에서 골라 주세요.</p>';
  }

  function getPlanPreferences() {
    if (!form) return planDefaults;
    const data = new FormData(form);
    return {
      cooking: data.get("cooking") || planDefaults.cooking,
      drying: data.get("drying") || planDefaults.drying,
      workout: data.get("workout") || planDefaults.workout,
      fragrance: data.get("fragrance") || planDefaults.fragrance,
      storage: data.get("storage") || planDefaults.storage,
      purchaseBudget: parseCurrency(data.get("purchaseBudget"))
    };
  }

  function saveChecklist() {
    const nextState = { ...readStoredState(), checklist: checks, planPreferences: getPlanPreferences() };
    storageNote.textContent = writePurchasePlanState(nextState) ? "선택은 20분 동안 이 기기에 저장됩니다." : "이 브라우저에서는 저장할 수 없습니다.";
  }

  function renderOwnedPicker() {
    const matchingGroups = groups.filter((group) => {
      if (!searchTerm) return group.title === activeCategory;
      return group.items.some((item) => item.title.toLowerCase().includes(searchTerm));
    });
    if (categoryTabs) {
      categoryTabs.innerHTML = groups.map((group) => `<button type="button" role="tab" aria-selected="${group.title === activeCategory}" class="${group.title === activeCategory ? "is-active" : ""}" data-owned-category="${group.title}">${group.title}</button>`).join("");
    }
    checklist.innerHTML = matchingGroups.length
      ? matchingGroups.map((group) => `
        <fieldset class="owned-group">
          <legend>${group.title}</legend>
          <div class="owned-options">
            ${group.items.filter((item) => !searchTerm || item.title.toLowerCase().includes(searchTerm)).map((item) => `<label><input type="checkbox" data-check-id="${item.id}" ${checks[item.id] ? "checked" : ""} /><span>${item.title}</span></label>`).join("")}
          </div>
        </fieldset>
      `).join("")
      : '<p class="owned-no-results">찾는 보유품이 없어요. 다른 이름으로 검색해 보세요.</p>';

    checklist.querySelectorAll("[data-check-id]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        checks[checkbox.dataset.checkId] = checkbox.checked;
        updateProgress();
        saveChecklist();
      });
    });
    updateProgress();
  }

  categoryTabs?.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-owned-category]");
    if (!tab) return;
    activeCategory = tab.dataset.ownedCategory;
    searchTerm = "";
    if (searchInput) searchInput.value = "";
    renderOwnedPicker();
  });

  searchInput?.addEventListener("input", () => {
    searchTerm = searchInput.value.trim().toLowerCase();
    renderOwnedPicker();
  });

  selected?.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-toggle-selected]");
    if (toggle) {
      showAllSelected = !showAllSelected;
      updateProgress();
      return;
    }
    const button = event.target.closest("[data-remove-owned]");
    if (!button) return;
    checks[button.dataset.removeOwned] = false;
    renderOwnedPicker();
    saveChecklist();
  });

  form?.addEventListener("input", () => {
    trackPlanStart();
    saveChecklist();
  });
  form?.addEventListener("change", () => {
    trackPlanStart();
    saveChecklist();
  });
  form?.addEventListener("submit", () => {
    saveChecklist();
    if (hasTrackedPlanComplete) return;
    hasTrackedPlanComplete = true;
    const preferences = getPlanPreferences();
    trackAnalyticsEvent("plan_complete", {
      owned_count: Object.values(checks).filter(Boolean).length,
      answered_conditions: [preferences.cooking, preferences.drying, preferences.storage].filter(Boolean).length,
      has_purchase_budget: preferences.purchaseBudget ? 1 : 0,
      transport_type: "beacon"
    });
  });

  resetButton?.addEventListener("click", () => {
    Object.keys(checks).forEach((id) => { checks[id] = false; });
    form?.reset();
    renderOwnedPicker();
    const nextState = { ...readStoredState(), checklist: checks, planPreferences: getPlanPreferences() };
    delete nextState.recommendationDecisions;
    delete nextState.purchasePlanExpiresAt;
    storageNote.textContent = writeStoredState(nextState) ? "선택과 구매 결정을 초기화했습니다." : "이 브라우저에서는 저장할 수 없습니다.";
  });

  renderOwnedPicker();
  schedulePurchasePlanExpiry(() => window.location.reload());
}

function setupRecommendation() {
  const summary = document.querySelector("#recommendationSummary");
  const results = document.querySelector("#recommendationResults");
  const note = document.querySelector("#recommendationNote");
  const conditionSummary = document.querySelector("#recommendationConditions");
  const purchasePlanSummary = document.querySelector("#purchasePlanSummary");
  const purchasePlanStatus = document.querySelector("#purchasePlanStatus");
  const filterPurchasePlan = document.querySelector("#filterPurchasePlan");
  const resultIntro = document.querySelector("#recommendationResultIntro");
  const resultSection = document.querySelector("#recommendationResultSection");
  const startSection = document.querySelector("#recommendationStart");
  const methodSection = document.querySelector("#recommendationMethod");
  if (!summary || !results || !note) return;
  let showSelectedOnly = false;
  const openRecommendationPhases = new Set();

  function getPreferences() {
    const savedPlan = readStoredState().planPreferences;
    const plan = savedPlan && typeof savedPlan === "object" ? savedPlan : planDefaults;
    return {
      ...planDefaults,
      ...plan,
      purchaseBudget: parseCurrency(plan.purchaseBudget)
    };
  }

  function rankItem([id, item], preferences) {
    let score = item.weight * 10;
    const signal = itemSignals[id];
    const matchedCondition = signal && preferences[signal.condition] === signal.match;
    const compactMatch = preferences.storage === "limited" && item.compact;
    if (item.firstDay) score += 32;
    if (matchedCondition) score += 24;
    if (compactMatch) score += 14;

    let reason = item.firstDay ? "입주 직후 바로 쓸 가능성이 높은 항목" : "현재 보유하지 않은 준비 항목";
    if (matchedCondition) reason = signal.reason;
    else if (compactMatch) reason = "수납 여유가 적다는 조건을 반영한 항목";

    const searchTerms = ["자취", item.title];
    if (compactMatch) searchTerms.push("소형");
    if (signal?.search) searchTerms.push(signal.search);
    return {
      id,
      ...item,
      score,
      reason,
      criteria: signal?.criteria || categoryCriteria[item.category],
      conditionMatched: Boolean(matchedCondition),
      searchQuery: searchTerms.join(" ")
    };
  }

  function storeLinks(item) {
    return item.stores.map((store) => createStoreSearchLink(store, item.searchQuery, item.id, "recommendation")).join("");
  }

  const recommendationPhases = {
    now: { title: "지금 필요", description: "입주 전 또는 입주 직후에 먼저 준비할 항목" },
    confirm: { title: "조건 확인", description: "집 옵션이나 실제 생활을 확인한 뒤 결정할 항목" },
    later: { title: "나중에 결정", description: "입주 후 사용 패턴이 생긴 다음 선택할 항목" }
  };

  function getPhase(item, preferences) {
    if (item.decision === "later" || item.decision === "skip") return "later";
    if (item.decision === "candidate") return "now";
    if (immediateItemIds.has(item.id)) return "now";
    return "confirm";
  }

  function decisionButtons(item) {
    const current = item.decision === "prepared" ? "prepared" : item.decision === "later" ? "later" : item.decision === "candidate" ? "candidate" : "";
    return `<div class="match-decision" role="group" aria-label="${item.title} 상태 선택">
      <button type="button" data-recommendation-decision="candidate" data-item-id="${item.id}" class="${current === "candidate" ? "is-selected" : ""}">필요함</button>
      <button type="button" data-recommendation-decision="prepared" data-item-id="${item.id}" class="${current === "prepared" ? "is-selected" : ""}">이미 있음</button>
      <button type="button" data-recommendation-decision="later" data-item-id="${item.id}" class="${current === "later" ? "is-selected" : ""}">나중에</button>
    </div>`;
  }

  function createMatchCard(item, index) {
    const card = document.createElement("article");
    card.className = "match-card";
    card.innerHTML = `
      <div class="match-rank"><span>${String(index + 1).padStart(2, "0")}</span><strong>${item.category}</strong></div>
      <div class="match-copy"><h3>${item.title}</h3><p>${item.reason}</p><small>고를 때: ${item.criteria}</small></div>
      <div class="match-side">
        ${decisionButtons(item)}
      </div>
      <div class="match-actions"><span>판매처에서 제품 구성, 배송비와 최신 가격을 직접 확인하세요.</span>${storeLinks(item)}</div>
    `;
    return card;
  }

  function updatePurchasePlan(ranked, savedChecks, preferences) {
    if (!purchasePlanSummary || !purchasePlanStatus || !filterPurchasePlan) return;
    const needed = ranked.filter((item) => item.decision === "candidate");
    const later = ranked.filter((item) => item.decision === "later");
    const ownedCount = Object.values(savedChecks).filter(Boolean).length;
    const budgetPrefix = preferences.purchaseBudget
      ? `준비물 예산 ${formatWon(preferences.purchaseBudget)} · `
      : "";

    if (!needed.length) {
      purchasePlanSummary.textContent = "필요한 물건을 고르면 목록을 만들 수 있어요.";
      purchasePlanStatus.textContent = `${budgetPrefix}이미 있는 물건 ${ownedCount}개${later.length ? `, 나중에 볼 물건 ${later.length}개` : ""}로 정리됐어요.`;
      showSelectedOnly = false;
      filterPurchasePlan.disabled = true;
      filterPurchasePlan.textContent = "선택한 것만 보기";
      return;
    }

    purchasePlanSummary.textContent = `지금 살 물건 ${needed.length}개를 골랐어요.`;
    purchasePlanStatus.textContent = showSelectedOnly
      ? `${budgetPrefix}선택한 물건만 보고 있어요. 판매처에서 최신 가격을 확인하세요.`
      : `${budgetPrefix}이미 있는 물건 ${ownedCount}개${later.length ? `, 나중에 볼 물건 ${later.length}개` : ""}는 목록에서 뺐어요.`;
    filterPurchasePlan.disabled = false;
    filterPurchasePlan.textContent = showSelectedOnly ? "전체 항목 보기" : "선택한 것만 보기";
  }

  function renderRecommendations() {
    const storedState = readStoredState();
    const hasSavedPlan = Boolean(
      storedState.purchasePlanExpiresAt
      && storedState.planPreferences
      && typeof storedState.planPreferences === "object"
    );

    if (!hasSavedPlan) {
      resultIntro?.setAttribute("hidden", "");
      resultSection?.setAttribute("hidden", "");
      methodSection?.setAttribute("hidden", "");
      startSection?.removeAttribute("hidden");
      return;
    }

    resultIntro?.removeAttribute("hidden");
    resultSection?.removeAttribute("hidden");
    methodSection?.removeAttribute("hidden");
    startSection?.setAttribute("hidden", "");
    results.querySelectorAll(".recommendation-fold[open]").forEach((details) => openRecommendationPhases.add(details.dataset.phase));
    const preferences = getPreferences();
    const savedChecks = storedState.checklist || {};
    const decisions = storedState.recommendationDecisions || {};
    const allRanked = Object.entries(recommendationCatalog)
      .filter(([id]) => !savedChecks[id])
      .map((entry) => ({ ...rankItem(entry, preferences), decision: decisions[entry[0]] || "review" }))
      .map((item) => ({ ...item, phase: getPhase(item, preferences) }))
      .sort((a, b) => {
        const phaseOrder = { now: 0, confirm: 1, later: 2 };
        const decisionOrder = { candidate: 0, review: 1, later: 2 };
        const phaseDifference = phaseOrder[a.phase] - phaseOrder[b.phase];
        if (phaseDifference) return phaseDifference;
        return decisionOrder[a.decision] - decisionOrder[b.decision] || b.score - a.score || a.title.localeCompare(b.title, "ko");
      });
    updatePurchasePlan(allRanked, savedChecks, preferences);
    const ranked = showSelectedOnly ? allRanked.filter((item) => item.decision === "candidate") : allRanked;
    const nowItems = ranked.filter((item) => item.phase === "now");

    summary.textContent = showSelectedOnly
      ? `선택한 ${ranked.length}개만 보고 있어요.`
      : ranked.length
      ? `보유품을 제외한 ${ranked.length}개 중 지금 ${nowItems.length}개를 먼저 봐요.`
      : "추천할 구매 항목이 없습니다";
    if (conditionSummary) {
      const labels = Object.entries(planConditionLabels).map(([name, labels]) => labels[preferences[name]]).filter(Boolean);
      if (preferences.purchaseBudget) labels.push(`준비물 예산 ${formatWon(preferences.purchaseBudget)}`);
      conditionSummary.innerHTML = labels.map((label) => `<span>${label}</span>`).join("") || "조건을 아직 고르지 않았어요.";
    }
    results.innerHTML = "";

    if (!ranked.length) {
      results.innerHTML = '<p class="purchase-empty">보유품으로 선택한 항목을 모두 제외했습니다. 새로 필요한 물건이 있다면 보유품 선택을 수정하세요.</p>';
      note.textContent = "";
      return;
    }

    Object.keys(recommendationPhases).forEach((phase) => {
      const groupItems = ranked.filter((item) => item.phase === phase);
      if (!groupItems.length) return;

      const group = document.createElement("section");
      group.className = "recommendation-group";
      const phaseInfo = recommendationPhases[phase];
      const list = document.createElement("div");
      list.className = "match-list";
      groupItems.forEach((item, index) => list.appendChild(createMatchCard(item, index)));
      if (phase === "now") {
        group.innerHTML = `<div class="recommendation-group-head"><h3>${phaseInfo.title}</h3><p>${phaseInfo.description}</p></div>`;
        group.appendChild(list);
      } else {
        const details = document.createElement("details");
        details.className = "recommendation-fold";
        details.dataset.phase = phase;
        details.open = openRecommendationPhases.has(phase);
        details.innerHTML = `<summary><span><strong>${phaseInfo.title}</strong><small>${phaseInfo.description}</small></span><b>${groupItems.length}개 보기</b></summary>`;
        details.addEventListener("toggle", () => {
          if (details.open) openRecommendationPhases.add(phase);
          else openRecommendationPhases.delete(phase);
        });
        details.appendChild(list);
        group.appendChild(details);
      }
      results.appendChild(group);
    });

    note.textContent = "가격은 판매처마다 수시로 달라 이 화면에 추정값을 표시하지 않습니다. 제품 구성과 최신 가격은 판매처에서 확인하고, 전체 초기 비용은 별도 계산에서 정리하세요.";
  }

  results.addEventListener("click", (event) => {
    const button = event.target.closest("[data-recommendation-decision]");
    if (!button) return;
    const itemId = button.dataset.itemId;
    const nextDecision = button.dataset.recommendationDecision;
    const state = readStoredState();
    const nextChecks = { ...(state.checklist || {}) };
    const nextDecisions = { ...(state.recommendationDecisions || {}) };

    if (nextDecision === "prepared") {
      nextChecks[itemId] = true;
      delete nextDecisions[itemId];
    } else {
      nextDecisions[itemId] = nextDecision;
    }

    writePurchasePlanState({ ...state, checklist: nextChecks, recommendationDecisions: nextDecisions });
    schedulePurchasePlanExpiry(() => window.location.reload());
    renderRecommendations();
  });
  filterPurchasePlan?.addEventListener("click", () => {
    showSelectedOnly = !showSelectedOnly;
    renderRecommendations();
  });
  renderRecommendations();
  schedulePurchasePlanExpiry(() => window.location.reload());
}

function setupBudget() {
  const budgetForm = document.querySelector("#budgetForm");
  const monthlyTotal = document.querySelector("#budgetMonthlyTotal");
  const remaining = document.querySelector("#budgetRemaining");
  const firstMonth = document.querySelector("#budgetFirstMonth");
  const moveInCash = document.querySelector("#budgetMoveInCash");
  const storageNote = document.querySelector("#budgetStorageNote");
  const resetButton = document.querySelector("#resetBudget");
  const verdict = document.querySelector("#budgetVerdict");
  const nextStep = document.querySelector("#budgetNextStep");
  const recommendLink = document.querySelector("#budgetRecommendLink");
  const printButton = document.querySelector("#printBudget");
  if (!budgetForm || !monthlyTotal || !remaining || !firstMonth || !moveInCash || !storageNote || !verdict || !nextStep || !recommendLink) return;

  const savedBudget = readStoredState().budget;
  const query = new URLSearchParams(window.location.search);
  const queryValues = Object.fromEntries(budgetFieldNames.map((name) => [name, query.get(name)]));
  const hasQueryValues = Object.values(queryValues).some((value) => value !== null && value !== "");

  if (hasQueryValues) {
    budgetFieldNames.forEach((name) => {
      if (queryValues[name] !== null && budgetForm.elements[name]) budgetForm.elements[name].value = queryValues[name];
    });
  } else if (savedBudget && typeof savedBudget === "object") {
    const hasNewBudget = ["deposit", "contract", "setup"].some((name) => savedBudget[name] !== undefined);
    const savedNumber = (name) => {
      return parseCurrency(savedBudget[name]);
    };

    budgetForm.elements.income.value = savedBudget.income || "";
    ["deposit", "contract", "setup", "housing", "living"].forEach((name) => {
      let value = savedBudget[name];
      if (value === undefined && name === "setup") value = savedBudget.initial;
      if (value === undefined && legacyBudgetGroups[name]) value = legacyBudgetGroups[name].reduce((sum, field) => sum + savedNumber(field), 0);
      if (hasNewBudget && ["housing", "living"].includes(name)) value = savedBudget[name];
      budgetForm.elements[name].value = value || "";
    });
  }

  function getBudgetValue(name) {
    return parseCurrency(budgetForm.elements[name]?.value);
  }

  function renderBudget() {
    const income = getBudgetValue("income");
    const monthlyExpenses = getBudgetValue("housing") + getBudgetValue("living");
    const initialCosts = getBudgetValue("deposit") + getBudgetValue("contract") + getBudgetValue("setup");
    const balance = income - monthlyExpenses;

    moveInCash.textContent = formatWon(initialCosts);
    monthlyTotal.textContent = formatWon(monthlyExpenses);
    remaining.textContent = balance >= 0 ? formatWon(balance) : `-${formatWon(Math.abs(balance))}`;
    remaining.style.color = balance < 0 ? "#c83d2d" : "#1d6f51";
    firstMonth.textContent = formatWon(initialCosts + monthlyExpenses);

    if (!initialCosts && !income && !monthlyExpenses) {
      verdict.textContent = "입력한 입주 전 비용과 월 수입·지출을 각각 합산해 보여 줍니다.";
    } else if (income || monthlyExpenses) {
      const monthlyMessage = balance >= 0
        ? `월 수입 - 월 지출은 ${formatWon(balance)}입니다.`
        : `월 수입 - 월 지출은 -${formatWon(Math.abs(balance))}입니다.`;
      verdict.textContent = `입주 전·첫 달 입력 합계는 ${formatWon(initialCosts + monthlyExpenses)}입니다. ${monthlyMessage}`;
    } else {
      verdict.textContent = `입주 전 입력 합계는 ${formatWon(initialCosts)}입니다. 월 수입과 지출을 입력하면 그 차이도 함께 볼 수 있습니다.`;
    }

    nextStep.textContent = "비상자금, 대출 상환, 변동지출, 수입 변동을 입력하지 않았으므로 이 결과만으로 여유 여부나 목표 저축액을 판단하지 않습니다.";
    const setupBudget = getBudgetValue("setup");
    recommendLink.href = setupBudget ? `/checklist?purchaseBudget=${setupBudget}` : "/checklist";
    recommendLink.textContent = setupBudget
      ? `${formatWon(setupBudget)}으로 구매 계획 만들기`
      : "준비물 구매 계획 만들기";
  }

  function saveBudget() {
    const budget = Object.fromEntries(budgetFieldNames.map((name) => {
      const input = budgetForm.elements[name];
      return [name, input?.value ? String(parseCurrency(input.value)) : ""];
    }));
    const nextState = { ...readStoredState(), budget };
    storageNote.textContent = writeBudgetState(nextState) ? "입력은 20분 동안 이 기기에 저장됩니다." : "이 브라우저에서는 저장할 수 없습니다.";
    scheduleBudgetExpiry(() => window.location.reload());
  }

  budgetForm.addEventListener("input", () => {
    renderBudget();
    saveBudget();
  });

  const focusOrder = ["deposit", "contract", "setup", "income", "housing", "living"];
  budgetForm.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    const currentIndex = focusOrder.indexOf(event.target.name);
    if (currentIndex === -1) return;
    event.preventDefault();
    const nextInput = budgetForm.elements[focusOrder[currentIndex + 1]];
    if (nextInput) {
      nextInput.focus();
      nextInput.select();
    }
  });

  resetButton?.addEventListener("click", () => {
    budgetForm.reset();
    const nextState = readStoredState();
    delete nextState.budget;
    delete nextState.budgetExpiresAt;
    storageNote.textContent = writeStoredState(nextState) ? "입력한 예산을 초기화했습니다." : "이 브라우저에서는 저장할 수 없습니다.";
    renderBudget();
  });

  printButton?.addEventListener("click", () => {
    storageNote.textContent = "인쇄 창에서 'PDF로 저장'을 선택하면 계산표를 파일로 남길 수 있습니다.";
    window.print();
  });

  renderBudget();
  scheduleBudgetExpiry(() => window.location.reload());
}

function setupResultTabs() {
  const tabs = [...document.querySelectorAll("[data-result-tab]")];
  const panels = [...document.querySelectorAll("[data-result-panel]")];
  const mobileQuery = window.matchMedia("(max-width: 900px)");
  let activePanel = "must";

  if (!tabs.length || !panels.length) return;

  const renderTabs = () => {
    const useTabs = mobileQuery.matches;
    tabs.forEach((tab) => {
      const active = tab.dataset.resultTab === activePanel;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel) => {
      panel.hidden = useTabs && panel.dataset.resultPanel !== activePanel;
    });
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activePanel = tab.dataset.resultTab;
      renderTabs();
    });
  });

  mobileQuery.addEventListener("change", renderTabs);
  renderTabs();
}

function setupStoreClickTracking() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-store-link]");
    if (!link) return;
    trackAnalyticsEvent("store_click", {
      store: link.dataset.store || "unknown",
      item_id: link.dataset.itemId || "unknown",
      placement: link.dataset.placement || "unknown",
      transport_type: "beacon"
    });
  });
}

plannerForm?.addEventListener("input", renderPlanner);
document.querySelector("#copyPlan")?.addEventListener("click", copyPlan);
setupHomePreview();
setupStoreClickTracking();
setupPlannerStage();
renderPlanner();
setupChecklist();
setupCurrencyInputs();
setupRecommendation();
setupBudget();
formatAllCurrencyInputs();
setupResultTabs();
