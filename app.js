const allRooms = ["full", "semi", "empty"];
const allLifestyles = ["cook", "delivery", "remote"];

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

function readStoredState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return saved && typeof saved === "object" ? saved : {};
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

function setupCurrencyInputs() {
  document.querySelectorAll("[data-currency]").forEach((input) => {
    input.addEventListener("input", () => formatCurrencyInput(input));
    input.addEventListener("blur", () => formatCurrencyInput(input));
  });
}

function formatAllCurrencyInputs() {
  document.querySelectorAll("[data-currency]").forEach(formatCurrencyInput);
}

function setupNaverShoppingLinks() {
  const links = document.querySelectorAll("[data-naver-shopping-query]");
  if (!links.length) return;

  let notice = document.querySelector("#naverShoppingNotice");
  if (!notice) {
    notice = document.createElement("p");
    notice.id = "naverShoppingNotice";
    notice.className = "shopping-notice";
    notice.setAttribute("aria-live", "polite");
    document.body.appendChild(notice);
  }

  links.forEach((link) => {
    if (link.dataset.naverShoppingBound === "true") return;
    link.dataset.naverShoppingBound = "true";
    link.addEventListener("click", () => {
      const query = link.dataset.naverShoppingQuery;
      if (!query || !navigator.clipboard?.writeText) return;

      navigator.clipboard.writeText(query).then(
        () => {
          notice.textContent = `네이버쇼핑 검색어 '${query}'를 복사했습니다.`;
          notice.classList.add("is-visible");
        },
        () => {
          notice.textContent = "네이버쇼핑이 새 창에서 열렸습니다.";
          notice.classList.add("is-visible");
        }
      );
    });
  });
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
  const purchaseSummary = document.querySelector("#purchaseSummary");
  const purchaseCandidates = document.querySelector("#purchaseCandidates");
  if (!checklist || !progress || !storageNote) return;

  const checkboxes = [...checklist.querySelectorAll("[data-check-id]")];
  const state = readStoredState();
  const savedChecks = state.checklist && typeof state.checklist === "object" ? state.checklist : {};

  checkboxes.forEach((checkbox) => {
    checkbox.checked = Boolean(savedChecks[checkbox.dataset.checkId]);
  });

  function updateProgress() {
    const completed = checkboxes.filter((checkbox) => checkbox.checked).length;
    progress.textContent = `${completed} / ${checkboxes.length} 완료`;
    renderPurchaseCandidates();
  }

  function renderPurchaseCandidates() {
    if (!purchaseSummary || !purchaseCandidates) return;

    const categories = purchaseCategories
      .map((category) => ({
        ...category,
        remaining: checkboxes.filter(
          (checkbox) => !checkbox.checked && category.prefixes.some((prefix) => checkbox.dataset.checkId.startsWith(prefix))
        ).length
      }))
      .filter((category) => category.remaining > 0);

    purchaseSummary.textContent = categories.length ? `${categories.length}개 카테고리 확인 필요` : "핵심 구매 카테고리 확인 완료";
    purchaseCandidates.innerHTML = "";

    if (!categories.length) {
      purchaseCandidates.innerHTML = '<p class="purchase-empty">체크한 카테고리는 구매 후보에서 제외됐습니다.</p>';
      return;
    }

    categories.forEach((category) => {
      const card = document.createElement("article");
      card.className = "recommendation-card";
      const naverUrl = "https://shopping.naver.com/home";
      const coupangUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(category.query)}`;
      card.innerHTML = `
        <div class="recommendation-image ${category.image}" role="img" aria-label="${category.title} 준비물 예시"></div>
        <div class="recommendation-copy"><p>${category.remaining}개 미완료</p><h3>${category.title}</h3></div>
        <div class="recommendation-actions"><a href="${naverUrl}" data-naver-shopping-query="${category.query}" target="_blank" rel="noreferrer">네이버쇼핑 열기</a><a href="${coupangUrl}" target="_blank" rel="noreferrer">쿠팡</a></div>
      `;
      purchaseCandidates.appendChild(card);
    });
  }

  function saveChecklist() {
    const checks = Object.fromEntries(checkboxes.map((checkbox) => [checkbox.dataset.checkId, checkbox.checked]));
    const nextState = { ...readStoredState(), checklist: checks };
    storageNote.textContent = writeStoredState(nextState) ? "이 기기에 자동 저장됐습니다." : "이 브라우저에서는 저장할 수 없습니다.";
  }

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      updateProgress();
      saveChecklist();
    });
  });

  resetButton?.addEventListener("click", () => {
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
    updateProgress();
    saveChecklist();
  });

  updateProgress();
}

function setupRecommendation() {
  const form = document.querySelector("#recommendationForm");
  const summary = document.querySelector("#recommendationSummary");
  const results = document.querySelector("#recommendationResults");
  const note = document.querySelector("#recommendationNote");
  if (!form || !summary || !results || !note) return;

  const savedPreferences = readStoredState().recommendation;
  if (savedPreferences && typeof savedPreferences === "object") {
    ["purchaseBudget", "timing", "room", "focus", "showCount"].forEach((name) => {
      const input = form.elements[name];
      if (!input || savedPreferences[name] === undefined) return;
      if (input instanceof RadioNodeList) input.value = savedPreferences[name];
      else input.value = savedPreferences[name];
    });
  }

  const passedBudget = parseCurrency(new URLSearchParams(window.location.search).get("purchaseBudget"));
  if (passedBudget) form.elements.purchaseBudget.value = String(passedBudget);

  function getPreferences() {
    const data = new FormData(form);
    const budget = parseCurrency(data.get("purchaseBudget"));
    return {
      purchaseBudget: budget,
      timing: data.get("timing") || "movein",
      room: data.get("room") || "small",
      focus: data.get("focus") || "value",
      showCount: data.get("showCount") || "12"
    };
  }

  function rankItem([id, item], preferences) {
    let score = item.weight * 10;
    if (preferences.timing === "movein" && item.firstDay) score += 32;
    if (preferences.room === "small" && item.compact) score += 14;
    if (preferences.focus === "value" && item.weight >= 8) score += 8;
    if (preferences.focus === "comfort" && ["침구·수면", "욕실"].includes(item.category)) score += 12;
    if (preferences.focus === "balanced" && item.firstDay) score += 8;

    let reason = "체크리스트에서 아직 완료되지 않은 항목";
    if (preferences.timing === "movein" && item.firstDay) reason = "입주 첫날 바로 쓰는 항목";
    else if (preferences.room === "small" && item.compact) reason = "작은 방의 수납과 동선을 고려한 항목";
    else if (preferences.focus === "value" && item.weight >= 8) reason = "예산을 먼저 배정해 확인할 항목";
    else if (preferences.focus === "comfort" && ["침구·수면", "욕실"].includes(item.category)) reason = "생활 만족도를 먼저 높이는 항목";

    const searchTerms = ["자취", item.title];
    if (preferences.room === "small" && item.compact) searchTerms.push("소형");
    if (preferences.focus === "value") searchTerms.push("가성비");
    if (preferences.timing === "movein" && item.firstDay) searchTerms.push("당일배송");

    return { id, ...item, score, reason, searchQuery: searchTerms.join(" ") };
  }

  function storeLinks(item) {
    return item.stores.map((store) => {
      if (store === "coupang") {
        return `<a href="https://www.coupang.com/np/search?q=${encodeURIComponent(item.searchQuery)}" target="_blank" rel="noreferrer">쿠팡 검색</a>`;
      }
      if (store === "naver") {
        return `<a href="https://shopping.naver.com/home" data-naver-shopping-query="${item.searchQuery}" target="_blank" rel="noreferrer">네이버쇼핑</a>`;
      }
      if (store === "daiso") {
        return '<a href="https://www.daisomall.co.kr/" target="_blank" rel="noreferrer">다이소몰</a>';
      }
      return '<a href="https://ohou.se/store" target="_blank" rel="noreferrer">오늘의집</a>';
    }).join("");
  }

  const decisionOptions = [
    ["review", "검토 중"],
    ["candidate", "구매 후보"],
    ["later", "입주 후 결정"],
    ["skip", "지금은 필요 없음"],
    ["prepared", "이미 준비함"]
  ];

  const recommendationPhases = {
    now: { title: "지금 구매할 것", description: "입주 전 또는 첫날에 먼저 챙길 항목" },
    week: { title: "입주 첫 주에 확인", description: "생활하면서 필요를 확인할 항목" },
    later: { title: "입주 후 결정", description: "공간과 생활 패턴을 본 뒤 정할 항목" },
    skip: { title: "현재는 보류", description: "지금 예산에서는 제외한 항목" }
  };

  function getPhase(item, preferences) {
    if (item.decision === "later") return "later";
    if (item.decision === "skip") return "skip";
    if (item.decision === "candidate" || (preferences.timing === "movein" && item.firstDay)) return "now";
    return "week";
  }

  function decisionSelect(item) {
    const options = decisionOptions.map(([value, label]) => {
      const selected = item.decision === value ? " selected" : "";
      return `<option value="${value}"${selected}>${label}</option>`;
    }).join("");
    return `<label class="match-decision">결정 <select data-recommendation-decision data-item-id="${item.id}" aria-label="${item.title} 구매 결정">${options}</select></label>`;
  }

  function createMatchCard(item, index, allocation) {
    const card = document.createElement("article");
    card.className = "match-card";
    const allocationText = item.phase === "later" ? "입주 후" : item.phase === "skip" ? "제외" : allocation ? formatWon(allocation) : "미입력";
    card.innerHTML = `
      <div class="match-rank"><span>${String(index + 1).padStart(2, "0")}</span><strong>${item.category}</strong></div>
      <div class="match-copy"><h3>${item.title}</h3><p>${item.reason}</p><small>검색어: ${item.searchQuery}</small></div>
      <div class="match-side">
        <div class="match-budget"><span>예산 배정</span><strong>${allocationText}</strong></div>
        ${decisionSelect(item)}
      </div>
      <div class="match-actions">${storeLinks(item)}</div>
    `;
    return card;
  }

  function renderRecommendations() {
    const preferences = getPreferences();
    const storedState = readStoredState();
    const savedChecks = storedState.checklist || {};
    const decisions = storedState.recommendationDecisions || {};
    const ranked = Object.entries(recommendationCatalog)
      .filter(([id]) => !savedChecks[id])
      .map((entry) => ({ ...rankItem(entry, preferences), decision: decisions[entry[0]] || "review" }))
      .map((item) => ({ ...item, phase: getPhase(item, preferences) }))
      .sort((a, b) => {
        const phaseOrder = { now: 0, week: 1, later: 2, skip: 3 };
        const decisionOrder = { candidate: 0, review: 1, later: 2, skip: 3 };
        return phaseOrder[a.phase] - phaseOrder[b.phase]
          || decisionOrder[a.decision] - decisionOrder[b.decision]
          || b.score - a.score
          || a.title.localeCompare(b.title, "ko");
      });
    const active = ranked.filter((item) => item.phase === "now" || item.phase === "week");
    const deferred = ranked.filter((item) => item.phase === "later" || item.phase === "skip");
    const limit = preferences.showCount === "all" ? active.length : Number(preferences.showCount);
    const visible = [...active.slice(0, limit), ...deferred];
    const totalScore = active.reduce((sum, item) => sum + item.score, 0);

    summary.textContent = ranked.length
      ? `전체 ${ranked.length}개 · 지금 ${active.length}개 · 입주 후 ${ranked.filter((item) => item.phase === "later").length}개`
      : "추천할 구매 항목이 없습니다";
    results.innerHTML = "";

    if (!ranked.length) {
      results.innerHTML = '<p class="purchase-empty">체크리스트의 구매 항목을 모두 완료했습니다. 새로 필요해진 물건이 있다면 체크리스트에서 완료를 해제하세요.</p>';
      note.textContent = "";
      return;
    }

    Object.keys(recommendationPhases).forEach((phase) => {
      const groupItems = visible.filter((item) => item.phase === phase);
      if (!groupItems.length) return;

      const group = document.createElement("section");
      group.className = "recommendation-group";
      const phaseInfo = recommendationPhases[phase];
      group.innerHTML = `<div class="recommendation-group-head"><h3>${phaseInfo.title}</h3><p>${phaseInfo.description}</p></div>`;
      const list = document.createElement("div");
      list.className = "match-list";
      groupItems.forEach((item, index) => {
        const allocation = preferences.purchaseBudget && totalScore && (item.phase === "now" || item.phase === "week")
          ? Math.round((preferences.purchaseBudget * item.score) / totalScore)
          : 0;
        list.appendChild(createMatchCard(item, index, allocation));
      });
      group.appendChild(list);
      results.appendChild(group);
    });

    note.textContent = preferences.purchaseBudget
      ? `입력한 ${formatWon(preferences.purchaseBudget)}은 지금 구매할 항목의 우선순위 점수 비율로만 나눴습니다. 입주 후 결정·보류 항목은 배정에서 제외됩니다.`
      : "예산을 입력하면 지금 구매할 항목에만 우선순위 점수 비율로 예산을 나눕니다.";
    setupNaverShoppingLinks();
  }

  function saveAndRender() {
    const preferences = getPreferences();
    writeStoredState({ ...readStoredState(), recommendation: preferences });
    renderRecommendations();
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveAndRender();
  });
  form.addEventListener("input", saveAndRender);
  form.addEventListener("change", saveAndRender);
  results.addEventListener("change", (event) => {
    const select = event.target.closest("[data-recommendation-decision]");
    if (!select) return;

    const itemId = select.dataset.itemId;
    const nextDecision = select.value;
    const state = readStoredState();
    const nextChecks = { ...(state.checklist || {}) };
    const nextDecisions = { ...(state.recommendationDecisions || {}) };

    if (nextDecision === "prepared") {
      nextChecks[itemId] = true;
      delete nextDecisions[itemId];
    } else if (nextDecision === "review") {
      delete nextDecisions[itemId];
    } else {
      nextDecisions[itemId] = nextDecision;
    }

    writeStoredState({ ...state, checklist: nextChecks, recommendationDecisions: nextDecisions });
    renderRecommendations();
  });
  renderRecommendations();
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
    remaining.textContent = balance >= 0 ? formatWon(balance) : `${formatWon(Math.abs(balance))} 부족`;
    remaining.style.color = balance < 0 ? "#c83d2d" : "#1d6f51";
    firstMonth.textContent = formatWon(initialCosts + monthlyExpenses);

    if (!initialCosts && !income && !monthlyExpenses) {
      verdict.textContent = "보증금, 계약·이사, 준비물 비용을 적으면 계약 전에 필요한 현금을 한 번에 볼 수 있습니다.";
    } else if (income || monthlyExpenses) {
      const monthlyMessage = balance >= 0
        ? `월 수입에서 ${formatWon(balance)}이 남는 것으로 계산됩니다.`
        : `월 수입보다 ${formatWon(Math.abs(balance))}이 더 필요한 것으로 계산됩니다.`;
      verdict.textContent = `입주 첫 달에는 ${formatWon(initialCosts + monthlyExpenses)}을 준비해야 합니다. ${monthlyMessage}`;
    } else {
      verdict.textContent = `계약 전에 ${formatWon(initialCosts)}을 확보해야 합니다. 월 수입과 지출을 더하면 첫 달 부담도 함께 확인할 수 있습니다.`;
    }

    if (getBudgetValue("setup")) {
      const setupBudget = getBudgetValue("setup");
      nextStep.textContent = `준비물 비용 ${formatWon(setupBudget)}을 구매 후보별 예산 배정으로 이어 보세요.`;
      recommendLink.href = `/recommend?purchaseBudget=${setupBudget}`;
      recommendLink.textContent = "준비물 예산으로 추천받기";
    } else {
      nextStep.textContent = "준비물 비용을 아직 모른다면 체크리스트에서 필요한 물품부터 고르세요.";
      recommendLink.href = "/checklist";
      recommendLink.textContent = "준비물 먼저 정하기";
    }
  }

  function saveBudget() {
    const budget = Object.fromEntries(budgetFieldNames.map((name) => {
      const input = budgetForm.elements[name];
      return [name, input?.value ? String(parseCurrency(input.value)) : ""];
    }));
    const nextState = { ...readStoredState(), budget };
    storageNote.textContent = writeStoredState(nextState) ? "이 기기에 자동 저장됐습니다." : "이 브라우저에서는 저장할 수 없습니다.";
  }

  budgetForm.addEventListener("input", () => {
    renderBudget();
    saveBudget();
  });

  resetButton?.addEventListener("click", () => {
    budgetForm.reset();
    const nextState = readStoredState();
    delete nextState.budget;
    storageNote.textContent = writeStoredState(nextState) ? "입력한 예산을 초기화했습니다." : "이 브라우저에서는 저장할 수 없습니다.";
    renderBudget();
  });

  printButton?.addEventListener("click", () => {
    storageNote.textContent = "인쇄 창에서 'PDF로 저장'을 선택하면 계산표를 파일로 남길 수 있습니다.";
    window.print();
  });

  renderBudget();
}

function setupQuickCost() {
  const quickForm = document.querySelector("#quickCostForm");
  const quickTotal = document.querySelector("#quickMoveInTotal");
  if (!quickForm || !quickTotal) return;

  const renderQuickTotal = () => {
    const total = ["deposit", "contract", "setup"].reduce((sum, name) => {
      return sum + parseCurrency(quickForm.elements[name]?.value);
    }, 0);
    quickTotal.textContent = formatWon(total);
  };

  quickForm.addEventListener("input", renderQuickTotal);
  renderQuickTotal();
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

plannerForm?.addEventListener("input", renderPlanner);
document.querySelector("#copyPlan")?.addEventListener("click", copyPlan);
setupPlannerStage();
renderPlanner();
setupChecklist();
setupCurrencyInputs();
setupRecommendation();
setupBudget();
setupQuickCost();
formatAllCurrencyInputs();
setupResultTabs();
setupNaverShoppingLinks();
