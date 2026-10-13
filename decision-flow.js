(() => {
  const model = decisionModel;
  const params = new URLSearchParams(location.search);
  const scenarioId = params.get("scenario");
  const scenario = Object.hasOwn(model.scenarios, scenarioId) ? model.scenarios[scenarioId] : null;
  const root = document.querySelector("#decisionRoot");
  const source = ["home", "search", "services", "item", "plan", "resume"].includes(params.get("from")) ? params.get("from") : "direct";
  const volatile = new Map();
  let expiryTimer;
  let record;
  let view = "form";
  let lastSaved = true;
  const escape = (text) => String(text ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const urlFor = (id, from = "resume") => `/decision?scenario=${id}&from=${from}`;

  function records() {
    const stored = readStoredState().decisionJourneys;
    const result = {};
    for (const id of Object.keys(model.scenarios)) {
      const value = volatile.has(id) ? volatile.get(id) : stored?.[id];
      const clean = model.normalizeRecord(id, value);
      if (clean) result[id] = clean;
    }
    return result;
  }

  function persist(id, next) {
    const state = readStoredState();
    const journeys = { ...(state.decisionJourneys || {}) };
    if (next) journeys[id] = next;
    else delete journeys[id];
    const saved = writeStoredState({ ...state, decisionJourneys: journeys });
    if (saved) volatile.delete(id);
    else volatile.set(id, next);
    lastSaved = saved;
    return saved;
  }

  function statusLabel(id, value) {
    if (value.outcome === "done") return value.action === "review" ? "조건 확인 완료" : model.scenarios[id].service ? "처리 완료" : "준비 완료";
    if (value.outcome === "followup") return "다시 확인 필요";
    if (value.outcome === "contacted") return "문의 후 확인 중";
    if (!value.action) return value.resultShown ? "다음 행동 정하기" : "조건 작성 중";
    return ({ self: "직접 청소 예정", quote: "견적 문의 준비", review: "조건 확인 예정", compare: "선택 기준 저장됨", prepared: "보유품 반영됨", reuse: "보유품 정리 예정" })[value.action];
  }

  function renderSaved() {
    const saved = records();
    document.querySelectorAll("[data-decision-saved]").forEach((container) => {
      const entries = Object.entries(saved).filter(([id]) => container.dataset.decisionScope !== "products" || model.scenarios[id].itemId);
      container.hidden = !entries.length;
      container.innerHTML = `<h2>이어서 할 일</h2><div class="journey-saved-list">${entries.map(([id, value]) =>
        `<a href="${escape(urlFor(id))}"><span><strong>${model.scenarios[id].shortTitle}</strong><small>${statusLabel(id, value)}</small></span><span aria-hidden="true">→</span></a>`
      ).join("")}</div>`;
    });
  }

  function checkExpiry() {
    clearTimeout(expiryTimer);
    const state = readStoredState();
    const raw = state.decisionJourneys || {};
    for (const id of new Set([...Object.keys(raw), ...volatile.keys()])) {
      if (!model.normalizeRecord(id, volatile.has(id) ? volatile.get(id) : raw[id])) persist(id, null);
    }
    const current = records();
    if (root && scenario && record && !current[scenarioId]) {
      record = null;
      view = "form";
      renderPage();
      announce("보관 기간이 지나 이 상황의 조건과 진행 상태를 지웠습니다.");
    }
    renderSaved();
    const nextExpiry = Math.min(...Object.values(current).map((value) => value.expiresAt));
    if (Number.isFinite(nextExpiry)) expiryTimer = setTimeout(checkExpiry, Math.min(Math.max(1, nextExpiry - Date.now() + 50), 2_000_000_000));
  }

  function announce(message) {
    const target = document.querySelector("#decisionStatus");
    if (target) target.textContent = message;
  }

  function track(name, extra = {}) {
    trackAnalyticsEvent(name, { scenario: scenarioId, source, attempt_id: record?.attemptId || "none", rule_version: "decision-v1", ...extra });
  }

  function savePatch(patch) {
    const now = Date.now();
    record = { version: model.version, answers: {}, budget: null, action: "", outcome: "planned", completedAt: null, ...record, ...patch, updatedAt: now, expiresAt: now + model.ttl };
    persist(scenarioId, record);
    renderSaved();
    checkExpiry();
  }

  function beginAttempt() {
    if (record?.attemptId && !record.completedAt) return;
    savePatch({ attemptId: crypto.randomUUID(), completedAt: null, action: "", outcome: "planned" });
    track("decision_start");
  }

  function currentAnswers() {
    const form = root.querySelector("#decisionForm");
    return model.answersFor(scenarioId, Object.fromEntries(new FormData(form)));
  }

  function syncQuestions() {
    const answers = currentAnswers();
    const active = new Set(model.activeQuestions(scenarioId, answers).map((q) => q.id));
    root.querySelectorAll("[data-decision-question]").forEach((fieldset) => {
      fieldset.hidden = !active.has(fieldset.dataset.decisionQuestion);
      fieldset.disabled = fieldset.hidden;
    });
    const budgetGroup = root.querySelector("#decisionBudgetGroup");
    if (budgetGroup) {
      budgetGroup.hidden = answers.owned !== "need";
      budgetGroup.querySelector("input").disabled = budgetGroup.hidden;
    }
  }

  function formMarkup() {
    const inherited = scenarioId === "duvet" && !record && getItemDecision(readStoredState(), "bedding-duvet") === "prepared";
    const answers = record?.answers || (inherited ? { owned: "have" } : {});
    return `<form id="decisionForm" novalidate>
      ${inherited ? '<p class="decision-inherited">내 준비표에 이불이 보유품으로 저장되어 있어요.</p>' : ""}
      ${scenario.questions.map((q, index) => `<fieldset class="decision-question" data-decision-question="${q.id}">
        <legend><span>${String(index + 1).padStart(2, "0")}</span>${q.title}</legend>
        <div class="decision-options">${q.options.map(([value, label]) => `<label><input type="radio" name="${q.id}" value="${value}" ${answers[q.id] === value ? "checked" : ""} /><span>${label}</span></label>`).join("")}</div>
      </fieldset>`).join("")}
      ${scenarioId === "duvet" ? `<details class="decision-budget" id="decisionBudgetGroup" ${record?.budget != null ? "open" : ""}><summary>구매 예산 메모 <span>선택</span></summary><label for="decisionBudget">이불에 쓸 예산</label><div class="decision-budget-input"><input id="decisionBudget" name="budget" type="text" inputmode="numeric" maxlength="11" value="${record?.budget ?? ""}" aria-describedby="decisionBudgetNote" /><span>원</span></div><p id="decisionBudgetNote">상품 가격이 연결되지 않아 예산은 메모로만 남깁니다.</p></details>` : ""}
      <div class="decision-form-actions"><button class="button primary" type="submit">내 조건으로 확인</button><button class="button secondary" type="button" data-decision-skip>모르는 항목은 건너뛰기</button></div>
    </form>`;
  }

  function resultMarkup() {
    const result = model.resultFor(scenarioId, record?.answers);
    if (!result) { view = "form"; return formMarkup(); }
    const selected = record.action || result.suggested;
    return `<section class="decision-result" aria-labelledby="decisionResultTitle">
      <p class="decision-kicker">내 조건으로 정리한 다음 행동</p><h2 id="decisionResultTitle" tabindex="-1">${result.title}</h2><p class="decision-result-copy">${result.description}</p>
      <dl class="decision-facts">${model.summary(scenarioId, record.answers).map((fact) => `<div><dt>${fact.question}</dt><dd>${fact.answer}</dd></div>`).join("")}${record.budget != null && record.answers.owned === "need" ? `<div><dt>구매 예산 메모</dt><dd>${record.budget.toLocaleString("ko-KR")}원</dd></div>` : ""}</dl>
      <button type="button" class="decision-text-button" data-decision-edit>조건 수정</button>
      ${scenarioId === "duvet" && result.query ? `<div class="decision-compare"><h3>구매 방식 비교</h3><div class="decision-compare-columns"><div><strong>차렵 등 일체형</strong><p>커버를 끼우는 과정 없이 통째로 관리합니다. 제품의 세탁·건조 표시를 확인하세요.</p></div><div><strong>커버 분리형</strong><p>커버와 이불솜을 각각 관리합니다. 규격, 구성품, 교체 수고를 함께 확인하세요.</p></div></div></div>` : ""}
      <div class="decision-next"><h3>이제 무엇을 할까요?</h3>
        ${result.actions.length > 1 ? `<fieldset class="decision-route-options"><legend class="sr-only">다음 행동 선택</legend>${result.actions.map((action) => `<label><input type="radio" name="decisionAction" value="${action.id}" ${selected === action.id ? "checked" : ""} /><span><strong>${action.label}</strong><small>${action.detail}</small>${result.suggested === action.id ? '<em>선택한 조건 기준</em>' : ""}</span></label>`).join("")}</fieldset>` : ""}
        <div id="decisionNextContent"></div>
        <button type="button" class="button primary" id="decisionSave">${scenario.service ? "이 행동으로 정하기" : result.actions[0].label}</button>
        <div id="decisionProgress" class="decision-progress" ${record.action ? "" : "hidden"}></div>
      </div>
      <details class="decision-basis"><summary>판단 기준과 확인할 점</summary><p>${escape(scenario.basis)}</p>
      ${scenario.reference ? `<a href="${escape(scenario.reference.url)}" target="_blank" rel="noreferrer">${escape(scenario.reference.label)} <span aria-hidden="true">↗</span></a>` : ""}</details>
      <div id="decisionFeedback" class="decision-feedback"></div>
    </section>`;
  }

  function selectedAction() {
    return root.querySelector('[name="decisionAction"]:checked')?.value || model.resultFor(scenarioId, record?.answers)?.actions[0]?.id;
  }

  function renderNext() {
    const container = root.querySelector("#decisionNextContent");
    if (!container) return;
    const result = model.resultFor(scenarioId, record.answers);
    const action = result.actions.find((item) => item.id === selectedAction());
    container.innerHTML = `<ul class="decision-tasks">${action.tasks.map((task) => `<li>${task}</li>`).join("")}</ul>
      ${scenario.service && action.id === "quote" ? `<div class="decision-inquiry"><label for="decisionInquiry">문의할 내용</label><textarea id="decisionInquiry" rows="8" readonly>${escape(model.inquiry(record.answers, scenarioId))}</textarea><div class="decision-outbound"><a class="button secondary" href="${escape(scenario.service.url)}" target="_blank" rel="noreferrer" data-service-link="${escape(scenario.service.tracking)}">${escape(scenario.service.label)} <span aria-hidden="true">↗</span></a><button class="decision-text-button" type="button" data-copy-inquiry>문의문 복사</button></div><p>업체 사이트에서 접수합니다. 입력한 내용은 자동 전송되지 않습니다.</p></div>` : ""}
      ${scenario.itemId && result.query ? `<div class="decision-outbound">${["coupang", "naver"].map((store) => createStoreSearchLink(store, result.query, scenario.itemId, "decision")).join("")}</div><p class="decision-fineprint">판매처에서 실제 규격·구성·배송비를 확인하세요. 예산에 맞는 상품만 걸러진 결과는 아닙니다.</p>` : ""}`;
    renderProgress();
  }

  function renderProgress() {
    const progress = root.querySelector("#decisionProgress");
    if (!progress) return;
    progress.hidden = !record.action;
    if (!record.action) return;
    const values = model.outcomesFor(scenarioId, record.action);
    progress.innerHTML = `<p><strong>저장한 행동</strong> ${escape(statusLabel(scenarioId, record))}${record.action !== selectedAction() ? " · 새 선택은 위 버튼으로 다시 저장해 주세요." : ""}</p><label for="decisionOutcome">실제 진행 상태</label><select id="decisionOutcome">${values.map(([value, label]) => `<option value="${value}" ${record.outcome === value ? "selected" : ""}>${label}</option>`).join("")}</select>`;
    if (record.outcome === "followup") progress.innerHTML += `<section class="decision-followup" aria-labelledby="decisionFollowupTitle"><h3 id="decisionFollowupTitle">다음 확인</h3><ul class="decision-tasks">${model.followupTasks(scenarioId, record.action).map((task) => `<li>${escape(task)}</li>`).join("")}</ul></section>`;
    const button = root.querySelector("#decisionSave");
    button.textContent = record.action === selectedAction() ? "선택 저장됨" : "바꾼 선택 저장";
    button.disabled = record.action === selectedAction();
  }

  function renderPage() {
    if (!root || !scenario) return;
    document.title = `${scenario.shortTitle} | 자취도우미`;
    root.innerHTML = `<header class="decision-heading"><p class="decision-kicker">상황별 준비</p><h1>${scenario.title}</h1><p>${scenario.subtitle}</p></header>
      ${view === "result" ? resultMarkup() : formMarkup()}
      <div class="decision-storage"><p id="decisionStatus" role="status">${record ? lastSaved ? "마지막 수정부터 30일 동안 이 기기에 저장됩니다." : "저장할 수 없어 현재 화면에서만 유지됩니다." : "선택한 조건과 진행 상태는 이 기기에 30일 동안 저장됩니다."}</p><button type="button" class="decision-text-button" data-decision-reset ${record ? "" : "hidden"}>이 조건 초기화</button></div>`;
    if (view === "form") syncQuestions();
    else { renderNext(); renderFeedback(); }
  }

  function renderFeedback() {
    const container = root.querySelector("#decisionFeedback");
    if (!container) return;
    container.innerHTML = `<fieldset><legend>다음 행동을 정하는 데 도움이 되었나요?</legend><div class="decision-options">${[["helpful", "선택을 좁혔어요"], ["not_yet", "아직 정하기 어려워요"]].map(([value, label]) => `<label><input type="radio" name="decisionFeedback" value="${value}" ${record.feedback === value ? "checked" : ""} /><span>${label}</span></label>`).join("")}</div></fieldset>
      ${record.feedback === "not_yet" ? `<label class="decision-feedback-reason" for="decisionFeedbackReason">어떤 점이 부족했나요? <span>선택</span></label><select id="decisionFeedbackReason"><option value="">이유 선택</option>${[["missing_condition", "내 상황에 맞는 조건이 없어요"], ["unclear_next", "다음에 할 일이 명확하지 않아요"], ["need_details", "비교할 구체적인 정보가 부족해요"]].map(([value, label]) => `<option value="${value}" ${record.feedbackReason === value ? "selected" : ""}>${label}</option>`).join("")}</select>` : ""}`;
  }

  function submitForm(skip = false) {
    const form = root.querySelector("#decisionForm");
    let answers = currentAnswers();
    if (skip) {
      for (const q of model.activeQuestions(scenarioId, answers)) {
        if (!answers[q.id]) form.querySelector(`[name="${q.id}"][value="unknown"]`).checked = true;
      }
      syncQuestions();
      answers = currentAnswers();
    }
    const missing = model.activeQuestions(scenarioId, answers).find((q) => !answers[q.id]);
    if (missing) {
      announce("아직 선택하지 않은 조건이 있어요. 모르는 항목은 건너뛸 수 있습니다.");
      form.querySelector(`[name="${missing.id}"]`).focus();
      return;
    }
    const budgetInput = form.querySelector('[name="budget"]');
    const budget = budgetInput && !budgetInput.disabled ? model.parseBudget(budgetInput.value) : null;
    if (budget === undefined) {
      announce("예산은 0부터 999,999,999원까지 숫자로 입력해 주세요.");
      budgetInput.setAttribute("aria-invalid", "true");
      budgetInput.focus();
      return;
    }
    budgetInput?.removeAttribute("aria-invalid");
    if (record?.resultShown && JSON.stringify(answers) === JSON.stringify(record.answers) && budget === record.budget) {
      view = "result";
      renderPage();
      root.querySelector("#decisionResultTitle")?.focus();
      return;
    }
    beginAttempt();
    const wasShown = record?.resultShown;
    savePatch({ answers, budget, resultShown: true });
    if (!wasShown) track("decision_result_view", { result: model.resultFor(scenarioId, answers).code });
    view = "result";
    renderPage();
    root.querySelector("#decisionResultTitle")?.focus();
  }

  function setupPage() {
    if (!root) return;
    if (!scenario) {
      root.innerHTML = `<h1>어떤 준비가 필요한가요?</h1><div class="decision-chooser">${Object.entries(model.scenarios).map(([id, value]) => `<a href="${urlFor(id, source)}">${escape(value.shortTitle)}</a>`).join("")}</div>`;
      return;
    }
    record = records()[scenarioId] || null;
    view = record?.resultShown ? "result" : "form";
    renderPage();
    root.addEventListener("submit", (event) => { event.preventDefault(); submitForm(); });
    root.addEventListener("change", (event) => {
      if (event.target.closest("#decisionForm")) {
        const budgetInput = root.querySelector('[name="budget"]');
        const budget = model.parseBudget(budgetInput?.value);
        if (budget === undefined) { announce("예산은 0부터 999,999,999원까지 숫자로 입력해 주세요."); return; }
        beginAttempt();
        savePatch({ answers: currentAnswers(), budget, resultShown: false, action: "", outcome: "planned", completedAt: null, feedback: "", feedbackReason: "" });
        syncQuestions();
        track("decision_answer", { question: event.target.name });
        root.querySelector("[data-decision-reset]").hidden = false;
        announce(lastSaved ? "선택한 조건을 저장했습니다." : "저장할 수 없어 현재 화면에서만 유지됩니다.");
      } else if (event.target.name === "decisionFeedback") {
        const value = event.target.value;
        if (!["helpful", "not_yet"].includes(value) || record.feedback === value) return;
        savePatch({ feedback: value, feedbackReason: "" });
        track("decision_feedback", { feedback: value, result: model.resultFor(scenarioId, record.answers).code });
        renderFeedback();
        root.querySelector(`[name="decisionFeedback"][value="${value}"]`).focus();
        announce(lastSaved ? "의견을 저장했습니다." : "이 기기에 의견을 저장할 수 없습니다.");
      } else if (event.target.id === "decisionFeedbackReason") {
        const value = event.target.value;
        if (record.feedback !== "not_yet" || !["", "missing_condition", "unclear_next", "need_details"].includes(value) || record.feedbackReason === value) return;
        savePatch({ feedbackReason: value });
        track("decision_feedback_reason", { reason: value || "cleared", result: model.resultFor(scenarioId, record.answers).code });
        announce(lastSaved ? "부족했던 점을 저장했습니다." : "이 기기에 의견을 저장할 수 없습니다.");
      } else if (event.target.name === "decisionAction") renderNext();
      else if (event.target.id === "decisionOutcome") {
        if (!model.outcomesFor(scenarioId, record.action).some(([value]) => value === event.target.value)) return;
        savePatch({ outcome: event.target.value });
        if (scenarioId === "duvet" && record.outcome === "done" && record.action !== "review") saveItemDecision("bedding-duvet", "prepared");
        track("decision_outcome", { action: record.action, outcome: record.outcome });
        renderProgress();
        announce(lastSaved ? "직접 선택한 진행 상태를 저장했습니다." : "진행 상태를 저장할 수 없습니다.");
      }
    });
    root.addEventListener("click", async (event) => {
      if (event.target.closest("[data-decision-skip]")) submitForm(true);
      if (event.target.closest("[data-decision-edit]")) {
        view = "form";
        renderPage();
        root.querySelector('input[type="radio"]')?.focus();
      }
      if (event.target.closest("#decisionSave")) {
        const action = selectedAction();
        const firstComplete = !record.completedAt;
        savePatch({ action, completedAt: record.completedAt || Date.now(), outcome: "planned" });
        if (scenarioId === "duvet" && action === "prepared") saveItemDecision("bedding-duvet", "prepared");
        track(firstComplete ? "decision_complete" : "decision_action_change", { action });
        renderProgress();
        announce(lastSaved ? "다음 행동을 저장했습니다. 홈과 내 준비표에서 이어볼 수 있어요." : "저장할 수 없어 현재 화면에서만 유지됩니다.");
      }
      if (event.target.closest("[data-decision-reset]")) {
        track("decision_reset");
        persist(scenarioId, null);
        record = null;
        view = "form";
        renderPage();
        renderSaved();
        announce(lastSaved ? "이 상황의 조건과 진행 상태를 지웠습니다. 준비표의 보유품은 유지됩니다." : "이 화면은 초기화했지만 저장소 삭제는 실패했습니다.");
      }
      if (event.target.closest("[data-copy-inquiry]")) {
        const field = root.querySelector("#decisionInquiry");
        try { await navigator.clipboard.writeText(field.value); announce("문의문을 복사했습니다. 업체에 전송된 것은 아닙니다."); }
        catch { field.focus(); field.select(); announce("복사할 수 없어 문의문을 선택했습니다."); }
      }
    });
  }

  const search = document.querySelector("#homeCatalogQuery");
  function renderSearch() {
    const matches = document.querySelector("#homeSituationMatches");
    if (!matches) return;
    const ids = model.find(search.value).filter((id) => model.scenarios[id].itemId);
    matches.hidden = !ids.length;
    matches.innerHTML = `<p>이 고민부터 살펴보세요</p>${ids.map((id) => `<a href="${escape(urlFor(id, "search"))}" data-decision-entry="${id}">${model.scenarios[id].title}<span aria-hidden="true">→</span></a>`).join("")}`;
  }
  search?.addEventListener("input", renderSearch);
  document.querySelector("#homeCatalogSearch")?.addEventListener("submit", renderSearch);
  if (search) renderSearch();
  const itemEntry = document.querySelector("#itemDecisionEntry");
  if (itemEntry) {
    const entry = Object.entries(model.scenarios).find(([, value]) => value.itemId === params.get("id"));
    itemEntry.hidden = !entry;
    if (entry) {
      itemEntry.href = urlFor(entry[0], "item");
      itemEntry.dataset.decisionEntry = entry[0];
      itemEntry.textContent = entry[0] === "storage" ? "보유품·공간에 맞춰 수납 선택 기준 찾기 →" : "내 크기·세탁 방식으로 이불 선택 기준 찾기 →";
    }
  }
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-decision-entry]");
    if (link) trackAnalyticsEvent("decision_open", { scenario: link.dataset.decisionEntry, source_path: location.pathname, transport_type: "beacon" });
  });
  setupPage();
  checkExpiry();
  addEventListener("pageshow", checkExpiry);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkExpiry(); });
  addEventListener("storage", (event) => {
    if (event.key !== "jachi-helper:v1" && event.key !== null) return;
    const next = records()[scenarioId] || null;
    if (root && scenario && JSON.stringify(next) !== JSON.stringify(model.normalizeRecord(scenarioId, record))) {
      record = next;
      view = record?.resultShown ? "result" : "form";
      renderPage();
      announce("다른 탭에서 바뀐 저장 상태를 반영했습니다.");
    }
    checkExpiry();
  });
})();
