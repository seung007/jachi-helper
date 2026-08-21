const items = [
  { name: "침구와 수건", group: "must", rooms: ["full", "semi", "empty"], lifestyles: ["cook", "delivery", "remote"] },
  { name: "욕실 소모품", group: "must", rooms: ["full", "semi", "empty"], lifestyles: ["cook", "delivery", "remote"] },
  { name: "청소·세탁 소모품", group: "must", rooms: ["full", "semi", "empty"], lifestyles: ["cook", "delivery", "remote"] },
  { name: "멀티탭", group: "must", rooms: ["full", "semi", "empty"], lifestyles: ["cook", "delivery", "remote"] },
  { name: "건조대", group: "must", rooms: ["semi", "empty"], lifestyles: ["cook", "delivery", "remote"] },
  { name: "기본 조리·식기", group: "must", rooms: ["semi", "empty"], lifestyles: ["cook"] },
  { name: "작업 조명", group: "must", rooms: ["full", "semi", "empty"], lifestyles: ["remote"] },
  { name: "수납 박스", group: "later", rooms: ["full", "semi", "empty"], lifestyles: ["cook", "delivery", "remote"] },
  { name: "커튼", group: "later", rooms: ["full", "semi", "empty"], lifestyles: ["cook", "delivery", "remote"] },
  { name: "러그", group: "later", rooms: ["full", "semi", "empty"], lifestyles: ["remote"] },
  { name: "에어프라이어", group: "later", rooms: ["semi", "empty"], lifestyles: ["cook"] },
  { name: "큰 식기 세트", group: "skip", rooms: ["full", "semi", "empty"], lifestyles: ["delivery"] },
  { name: "대형 가구", group: "skip", rooms: ["full", "semi"], lifestyles: ["cook", "delivery", "remote"] },
  { name: "인테리어 소품", group: "skip", rooms: ["full", "semi", "empty"], lifestyles: ["cook", "delivery", "remote"] }
];

const moveInStages = [
  { stage: "입주 전", task: "계약서의 입주 가능일과 관리 규정을 확인" },
  { stage: "입주 전", task: "방 옵션, 수납 공간, 창문 크기와 가전 설치 공간을 실측" },
  { stage: "입주 전", task: "이사·배송·인터넷 설치는 각 업체의 가능일을 확인해 예약" },
  { stage: "입주 당일", task: "하자, 계량기, 수압·배수, 도어락 상태를 사진과 함께 확인" },
  { stage: "입주 후", task: "전입신고: 실제 전입일 기준 14일 이내 신고" }
];

const plannerForm = document.querySelector("#plannerForm");
const storageKey = "jachi-helper:v1";
const budgetFieldNames = [
  "income",
  "rent",
  "maintenance",
  "communication",
  "insuranceDebt",
  "utilities",
  "food",
  "transport",
  "daily",
  "savings",
  "moving",
  "supplies",
  "oneTimeOther"
];

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
  const room = data.get("room");
  const lifestyle = data.get("lifestyle");
  const matched = items.filter((item) => item.rooms.includes(room) && item.lifestyles.includes(lifestyle));
  const must = matched.filter((item) => item.group === "must");
  const later = matched.filter((item) => item.group === "later");
  const skip = matched.filter((item) => item.group === "skip");

  return { must, later, skip, stages: moveInStages };
}

function renderPlanner() {
  if (!plannerForm) return;

  const result = calculatePlanner(plannerForm);
  const mustCount = document.querySelector("#mustCount");
  const laterCount = document.querySelector("#laterCount");
  const timelineTitle = document.querySelector("#timelineTitle");

  if (mustCount) mustCount.textContent = `${result.must.length}개`;
  if (laterCount) laterCount.textContent = `${result.later.length}개`;
  if (timelineTitle) timelineTitle.textContent = "입주 전후 확인";

  renderList(document.querySelector("#mustList"), result.must);
  renderList(document.querySelector("#laterList"), result.later);
  renderList(document.querySelector("#skipList"), result.skip.length ? result.skip : [{ name: "현재 조건에서는 없음" }]);
  renderList(document.querySelector("#timelineList"), result.stages);
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
  const text = [
    "[자취도우미 입주 준비표]",
    formatList("현재 조건에서 확인", result.must),
    "",
    formatList("구매 전 판단", result.later),
    "",
    "입주 전후 확인",
    ...result.stages.map((item) => `- ${item.stage} | ${item.task}`),
    "",
    "참고: 물품 목록은 방 옵션과 생활 방식에 따른 임시 확인 항목입니다. 사용자 조사 전에는 구매 권고나 필수 판단으로 사용하지 않습니다.",
    "전입신고는 실제 전입일 기준 14일 이내 신고해야 합니다."
  ].join("\n");

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
  const storageNote = document.querySelector("#budgetStorageNote");
  const resetButton = document.querySelector("#resetBudget");
  if (!budgetForm || !monthlyTotal || !remaining || !firstMonth || !storageNote) return;

  const savedBudget = readStoredState().budget;
  if (savedBudget && typeof savedBudget === "object") {
    budgetFieldNames.forEach((name) => {
      if (typeof savedBudget[name] === "string" && budgetForm.elements[name]) {
        budgetForm.elements[name].value = savedBudget[name];
      }
    });
  }

  function getBudgetValue(name) {
    const value = Number(budgetForm.elements[name]?.value);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function renderBudget() {
    const income = getBudgetValue("income");
    const monthlyExpenses = ["rent", "maintenance", "communication", "insuranceDebt", "utilities", "food", "transport", "daily", "savings"].reduce(
      (sum, name) => sum + getBudgetValue(name),
      0
    );
    const oneTimeCosts = ["moving", "supplies", "oneTimeOther"].reduce((sum, name) => sum + getBudgetValue(name), 0);
    const balance = income - monthlyExpenses;

    monthlyTotal.textContent = formatWon(monthlyExpenses);
    remaining.textContent = balance >= 0 ? formatWon(balance) : `${formatWon(Math.abs(balance))} 부족`;
    remaining.style.color = balance < 0 ? "#c83d2d" : "#1d6f51";
    firstMonth.textContent = formatWon(monthlyExpenses + oneTimeCosts);
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
renderPlanner();
setupChecklist();
setupBudget();
setupResultTabs();
