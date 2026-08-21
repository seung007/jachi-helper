const items = [
  { name: "침구 세트", price: 85000, group: "must", rooms: ["full", "semi", "empty"], lifestyles: ["cook", "delivery", "remote"] },
  { name: "수건 5장", price: 25000, group: "must", rooms: ["full", "semi", "empty"], lifestyles: ["cook", "delivery", "remote"] },
  { name: "욕실 소모품", price: 36000, group: "must", rooms: ["full", "semi", "empty"], lifestyles: ["cook", "delivery", "remote"] },
  { name: "세탁세제·청소포", price: 32000, group: "must", rooms: ["full", "semi", "empty"], lifestyles: ["cook", "delivery", "remote"] },
  { name: "멀티탭 2구·6구", price: 24000, group: "must", rooms: ["full", "semi", "empty"], lifestyles: ["cook", "delivery", "remote"] },
  { name: "건조대", price: 39000, group: "must", rooms: ["semi", "empty"], lifestyles: ["cook", "delivery", "remote"] },
  { name: "냄비·프라이팬", price: 59000, group: "must", rooms: ["semi", "empty"], lifestyles: ["cook"] },
  { name: "기본 식기 세트", price: 42000, group: "must", rooms: ["semi", "empty"], lifestyles: ["cook", "delivery", "remote"] },
  { name: "책상 조명", price: 31000, group: "must", rooms: ["full", "semi", "empty"], lifestyles: ["remote"] },
  { name: "수납 박스", price: 48000, group: "later", rooms: ["full", "semi", "empty"], lifestyles: ["cook", "delivery", "remote"] },
  { name: "암막 커튼", price: 64000, group: "later", rooms: ["full", "semi", "empty"], lifestyles: ["cook", "delivery", "remote"] },
  { name: "러그", price: 52000, group: "later", rooms: ["full", "semi", "empty"], lifestyles: ["remote"] },
  { name: "에어프라이어", price: 89000, group: "later", rooms: ["semi", "empty"], lifestyles: ["cook"] },
  { name: "큰 식기 세트", price: 70000, group: "skip", rooms: ["full", "semi", "empty"], lifestyles: ["delivery"] },
  { name: "대형 가구", price: 180000, group: "skip", rooms: ["full", "semi"], lifestyles: ["cook", "delivery", "remote"] },
  { name: "인테리어 소품 묶음", price: 65000, group: "skip", rooms: ["full", "semi", "empty"], lifestyles: ["cook", "delivery", "remote"] }
];

const timelineRules = [
  { maxDays: 0, title: "입주 당일", tasks: ["침구와 수건 먼저 풀기", "욕실 소모품 배치", "멀티탭 위치 확인"] },
  { maxDays: 3, title: "D-3 급한 준비", tasks: ["배송 오래 걸리는 물건 제외", "청소용품과 세탁세제 먼저 구매", "관리비 납부 방식 확인"] },
  { maxDays: 7, title: "D-7 준비", tasks: ["침구·욕실·청소 필수템 구매", "건조대와 멀티탭 수량 확인", "입주 당일 동선 정리"] },
  { maxDays: 14, title: "D-14 여유 준비", tasks: ["방 옵션과 없는 물건 대조", "큰 가구는 실측 후 보류", "필수템 위주로 장바구니 구성"] },
  { maxDays: 60, title: "D-30 장기 준비", tasks: ["예산 상한 먼저 정하기", "방 계약 전 고정비 계산", "취향템은 입주 후로 미루기"] }
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
    li.textContent = item.price ? `${item.name} · ${formatWon(item.price)}` : item.name;
    target.appendChild(li);
  });
}

function getTimeline(days) {
  return timelineRules.find((rule) => days <= rule.maxDays) || timelineRules[timelineRules.length - 1];
}

function calculatePlanner(form) {
  const data = new FormData(form);
  const budget = Number(data.get("budget"));
  const room = data.get("room");
  const lifestyle = data.get("lifestyle");
  const requestedDays = Number(data.get("days"));
  const days = Number.isFinite(requestedDays) ? Math.min(Math.max(requestedDays, 0), 60) : 0;
  const matched = items.filter((item) => item.rooms.includes(room) && item.lifestyles.includes(lifestyle));
  const must = matched.filter((item) => item.group === "must");
  const later = matched.filter((item) => item.group === "later" && days > 3);
  const skip = matched.filter((item) => item.group === "skip");
  const total = [...must, ...later].reduce((sum, item) => sum + item.price, 0);

  return { budget, days, must, later, skip, total, diff: budget - total, timeline: getTimeline(days) };
}

function renderPlanner() {
  if (!plannerForm) return;

  const result = calculatePlanner(plannerForm);
  const totalPrice = document.querySelector("#totalPrice");
  const heroTotal = document.querySelector("#heroTotal");
  const heroSummary = document.querySelector("#heroSummary");
  const budgetState = document.querySelector("#budgetState");
  const timelineTitle = document.querySelector("#timelineTitle");

  if (totalPrice) totalPrice.textContent = formatWon(result.total);
  if (heroTotal) heroTotal.textContent = formatWon(result.total);
  if (heroSummary) {
    heroSummary.textContent = `먼저 확인 ${result.must.length}개 · 나중에 ${result.later.length}개 · 후순위 ${result.skip.length || 0}개`;
  }
  if (budgetState) {
    budgetState.textContent = result.diff >= 0 ? `${formatWon(result.diff)} 여유` : `${formatWon(Math.abs(result.diff))} 초과`;
    budgetState.style.color = result.diff >= 0 ? "#1d6f51" : "#c83d2d";
  }
  if (timelineTitle) timelineTitle.textContent = result.timeline.title;

  renderList(document.querySelector("#mustList"), result.must);
  renderList(document.querySelector("#laterList"), result.later);
  renderList(document.querySelector("#skipList"), result.skip.length ? result.skip : [{ name: "현재 조건에서는 없음", price: 0 }]);
  renderList(document.querySelector("#timelineList"), result.timeline.tasks.map((name) => ({ name, price: 0 })));
}

async function copyPlan() {
  const copyStatus = document.querySelector("#copyStatus");
  if (!plannerForm || !copyStatus) return;

  if (!navigator.clipboard) {
    copyStatus.textContent = "이 브라우저에서는 복사를 지원하지 않습니다.";
    return;
  }

  const result = calculatePlanner(plannerForm);
  const formatList = (title, list) => `${title}\n${list.map((item) => `- ${item.name}${item.price ? ` (${formatWon(item.price)})` : ""}`).join("\n")}`;
  const text = [
    "[자취도우미 입주 준비표]",
    `예상 장바구니: ${formatWon(result.total)}`,
    `예산과의 차이: ${result.diff >= 0 ? `${formatWon(result.diff)} 여유` : `${formatWon(Math.abs(result.diff))} 초과`}`,
    "",
    formatList("먼저 확인", result.must),
    "",
    formatList("나중에 준비", result.later),
    "",
    `입주 타임라인 - ${result.timeline.title}`,
    ...result.timeline.tasks.map((task) => `- ${task}`),
    "",
    "참고: 예시 가격 기반의 기본 구성입니다. 실제 판매가와 보유 물품은 별도로 확인하세요."
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

plannerForm?.addEventListener("input", renderPlanner);
document.querySelector("#copyPlan")?.addEventListener("click", copyPlan);
renderPlanner();
setupChecklist();
setupBudget();
