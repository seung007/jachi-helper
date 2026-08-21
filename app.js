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

function setupBudget() {
  const budgetForm = document.querySelector("#budgetForm");
  const monthlyTotal = document.querySelector("#budgetMonthlyTotal");
  const remaining = document.querySelector("#budgetRemaining");
  const firstMonth = document.querySelector("#budgetFirstMonth");
  const moveInCash = document.querySelector("#budgetMoveInCash");
  const storageNote = document.querySelector("#budgetStorageNote");
  const resetButton = document.querySelector("#resetBudget");
  if (!budgetForm || !monthlyTotal || !remaining || !firstMonth || !moveInCash || !storageNote) return;

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
      const value = Number(savedBudget[name]);
      return Number.isFinite(value) && value > 0 ? value : 0;
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
    const value = Number(budgetForm.elements[name]?.value);
    return Number.isFinite(value) && value > 0 ? value : 0;
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
  }

  function saveBudget() {
    const budget = Object.fromEntries(budgetFieldNames.map((name) => [name, budgetForm.elements[name]?.value || ""]));
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

  renderBudget();
}

function setupQuickCost() {
  const quickForm = document.querySelector("#quickCostForm");
  const quickTotal = document.querySelector("#quickMoveInTotal");
  if (!quickForm || !quickTotal) return;

  const renderQuickTotal = () => {
    const total = ["deposit", "contract", "setup"].reduce((sum, name) => {
      const value = Number(quickForm.elements[name]?.value);
      return sum + (Number.isFinite(value) && value > 0 ? value : 0);
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
setupBudget();
setupQuickCost();
setupResultTabs();
setupNaverShoppingLinks();
