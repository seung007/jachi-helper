const decisionModel = (() => {
  const version = 1;
  const ttl = 30 * 24 * 60 * 60 * 1000;
  const scenarios = {
    cleaning: {
      service: { url: "https://www.miso.kr/deepcleaning-training", label: "미소에서 범위·견적 확인", tracking: "move_in_cleaning" },
      basis: "방 상태와 직접 할 여건에 따른 준비 순서입니다. 작업 가능 여부와 비용은 현장 상태 및 업체 범위에 따라 달라집니다.",
      reference: { url: "https://www.miso.kr/deepcleaning-training", label: "미소의 청소 범위 안내" },
      title: "입주청소, 직접 할까요? 맡길까요?",
      shortTitle: "입주청소 정하기",
      subtitle: "방 상태와 직접 할 여건을 기준으로 다음 일을 정해 보세요.",
      questions: [
        { id: "scope", title: "어떤 상태의 방인가요?", options: [
          ["basic", "먼지·일반 오염 위주예요"], ["deep", "찌든 때·가전 내부도 신경 쓰여요"],
          ["inspect", "누수 흔적·반복되는 오염이 있어요"], ["unknown", "아직 방을 자세히 못 봤어요"]
        ] },
        { id: "space", title: "청소할 공간은 어느 정도인가요?", options: [
          ["small", "원룸·작은 공간"], ["large", "분리된 방이 있거나 범위가 넓어요"], ["unknown", "아직 잘 모르겠어요"]
        ] },
        { id: "effort", title: "직접 청소할 시간과 여건이 있나요?", options: [
          ["self", "직접 해볼 여유가 있어요"], ["service", "시간이 부족하거나 맡기고 싶어요"], ["unknown", "아직 정하지 못했어요"]
        ] }
      ]
    },
    duvet: {
      itemId: "bedding-duvet",
      basis: "선택한 보유 여부, 크기, 관리 방식으로 탐색 범위를 정했습니다. 특정 제품의 성능·가격 순위가 아니며 실제 치수와 세탁 표시는 상품별로 확인해야 합니다.",
      reference: { url: "https://www.ikea.com/kr/ko/p/piltandvinge-duvet-cover-and-pillowcase-grey-70579101/", label: "제조사의 규격·관리 표시 예시" },
      title: "내 방에서 관리할 수 있는 이불 찾기",
      shortTitle: "이불 선택 기준",
      subtitle: "이미 가진 침구와 세탁 방식을 먼저 확인해 보세요.",
      questions: [
        { id: "owned", title: "지금 사용할 이불이 있나요?", options: [
          ["have", "있어요, 계속 쓸 거예요"], ["need", "없거나 새로 바꿔야 해요"], ["unknown", "가진 이불부터 확인할게요"]
        ] },
        { id: "size", title: "어떤 침구 크기를 찾나요?", options: [
          ["single", "싱글·슈퍼싱글"], ["double", "더블·퀸·킹"], ["unknown", "아직 크기를 확인하지 못했어요"]
        ] },
        { id: "care", title: "어떤 관리 방식이 편한가요?", options: [
          ["whole", "커버 교체 없이 통째로 세탁"], ["cover", "커버를 분리해서 자주 세탁"],
          ["laundromat", "필요하면 빨래방도 이용"], ["unknown", "세탁·건조 환경부터 확인할게요"]
        ] }
      ]
    },
    storage: {
      itemId: "life-storage",
      title: "수납용품, 사기 전에 공간부터 확인하세요.",
      shortTitle: "수납 선택 기준",
      subtitle: "가진 수납용품과 정리할 물건, 놓을 공간을 함께 살펴보세요.",
      basis: "보유품 재사용, 놓을 공간 확인, 제품군 탐색 순으로 정리한 서비스의 안내 기준입니다. 실제 치수를 입력받거나 상품과 대조한 결과가 아니므로 들어맞는 크기나 필요한 수량을 보장하지 않습니다.",
      questions: [
        { id: "owned", title: "지금 쓸 수납용품이 있나요?", options: [
          ["have", "가진 박스·선반을 먼저 써볼래요"], ["need", "새로 필요해요"], ["unknown", "가진 것부터 확인해야 해요"]
        ] },
        { id: "space", title: "놓을 공간을 확인했나요?", options: [
          ["measured", "놓을 곳과 가로·세로·높이를 확인했어요"], ["none", "놓을 공간이 아직 없어요"], ["unknown", "놓을 곳은 있지만 아직 안 재봤어요"]
        ] },
        { id: "purpose", title: "무엇을 정리하려고 하나요?", options: [
          ["clothes", "옷·침구"], ["supplies", "생활 소모품"], ["small", "작은 잡동사니"], ["unknown", "물건부터 분류해야 해요"]
        ] }
      ]
    },
    moving: {
      title: "이사 견적, 같은 조건으로 물어보세요.",
      shortTitle: "이사 문의 준비",
      subtitle: "짐과 이동 범위, 필요한 도움을 먼저 정리해 보세요.",
      service: { url: "https://www.zimssa.com/", label: "짐싸에서 이사·운송 확인", tracking: "moving" },
      basis: "짐, 이동 범위, 필요한 도움을 기준으로 문의할 내용을 정리했습니다. 차량 크기와 인원, 작업 가능 여부와 금액은 실제 짐 목록·경로·현장 조건을 확인한 업체가 안내해야 합니다.",
      reference: { url: "https://www.zimssa.com/", label: "짐싸의 이사·운송 안내" },
      questions: [
        { id: "cargo", title: "어떤 짐을 옮기나요?", options: [
          ["boxes", "상자·가방 위주예요"], ["furniture", "가구나 큰 가전도 있어요"], ["unknown", "짐 목록부터 정리해야 해요"]
        ] },
        { id: "distance", title: "어느 정도 이동하나요?", options: [
          ["near", "같은 동네·가까운 지역"], ["far", "다른 시·군 등 먼 지역"], ["unknown", "도착지나 경로가 아직 미정이에요"]
        ] },
        { id: "help", title: "어떤 도움이 필요한가요?", options: [
          ["transport", "포장·상하차는 준비됐고 운송만 필요해요"],
          ["carrying", "짐을 싣고 내리는 도움도 필요해요"],
          ["packing", "포장과 운반을 함께 맡기고 싶어요"],
          ["unknown", "어디까지 맡길지 아직 모르겠어요"]
        ] }
      ]
    }
  };

  function answersFor(id, answers = {}) {
    const clean = {};
    if (!Object.hasOwn(scenarios, id)) return clean;
    for (const question of scenarios[id]?.questions || []) {
      if (question.options.some(([value]) => value === answers?.[question.id])) clean[question.id] = answers[question.id];
    }
    return clean;
  }

  function activeQuestions(id, answers) {
    if (!Object.hasOwn(scenarios, id)) return [];
    const questions = scenarios[id]?.questions || [];
    return ["duvet", "storage"].includes(id) && ["have", "unknown"].includes(answers.owned) ? questions.slice(0, 1) : questions;
  }

  function parseBudget(input) {
    const text = String(input ?? "").trim();
    if (!text) return null;
    if (!/^[0-9, ]+$/.test(text) || !/[0-9]/.test(text)) return undefined;
    const amount = Number(text.replace(/[, ]/g, ""));
    return Number.isSafeInteger(amount) && amount >= 0 && amount <= 999999999 ? amount : undefined;
  }

  function resultFor(id, rawAnswers = {}) {
    const answers = answersFor(id, rawAnswers);
    if (!Object.hasOwn(scenarios, id) || activeQuestions(id, answers).some((q) => !answers[q.id])) return null;
    if (id === "storage") {
      if (answers.owned === "have") return {
        code: "storage_reuse", title: "가진 수납용품부터 배치해 보세요.",
        description: "이미 가진 것을 먼저 쓰겠다는 선택을 반영했어요. 새 구매 링크 대신 정리할 일을 남깁니다.", suggested: "reuse",
        actions: [{ id: "reuse", label: "보유품 정리할 일 저장", tasks: ["정리할 물건을 종류와 사용 빈도로 나누기", "가진 박스·선반에 담아 보고 부족한 공간만 남기기", "문·서랍을 열고 물건을 꺼내는 동선 확인하기"] }]
      };
      if (answers.owned === "unknown" || answers.space !== "measured" || answers.purpose === "unknown") return {
        code: "storage_review", title: answers.space === "none" ? "놓을 곳부터 정한 뒤 구매하세요." : "구매 전에 확인할 조건이 남아 있어요.",
        description: answers.space === "none" ? "놓을 공간이 없다고 선택했어요. 수납용품을 더 사기 전에 물건과 배치를 먼저 정리하세요." : "보유품, 공간 치수 또는 정리할 물건이 아직 확실하지 않아 구매 후보를 만들지 않았어요.", suggested: "review",
        actions: [{ id: "review", label: "확인할 항목 저장", tasks: ["이미 가진 수납용품과 정리할 물건 확인하기", "놓을 곳의 가로·세로·높이와 뚜껑·서랍 여는 공간 재기", "물건을 분류한 뒤 부족한 공간만 다시 확인하기"] }]
      };
      const types = { clothes: "옷 침구 수납함", supplies: "생활용품 수납 바구니", small: "소품 정리함 칸막이" };
      return {
        code: `storage_${answers.purpose}`, title: "정리할 물건에 맞는 형태부터 비교하세요.",
        description: "새 수납용품이 필요하고 공간을 확인했다고 선택했어요. 검색어에 용도를 반영하되 실제 치수는 상품별로 대조해야 합니다.", suggested: "compare", query: types[answers.purpose],
        actions: [{ id: "compare", label: "이 선택 기준 저장", tasks: ["상품 외부 치수와 실측 공간, 문·서랍 여는 여유 비교하기", "내부 치수와 담을 물건의 크기 비교하기", "한 개로 먼저 배치해 본 뒤 추가 수량 정하기"] }]
      };
    }
    if (id === "moving") {
      const uncertain = Object.values(answers).includes("unknown");
      const transport = answers.help === "transport";
      const tasks = [
        "상자 수량과 큰 가구·가전의 치수·사진을 준비하기",
        "출발·도착지 층수, 엘리베이터, 주차·진입 조건을 각각 확인하기",
        "희망 날짜와 포장·상하차·설치 중 맡길 범위를 구분하기",
        "포함 작업, 추가요금, 취소 조건과 파손 발생 시 연락 절차를 같은 조건으로 문의하기"
      ];
      return {
        code: uncertain ? "moving_review" : transport ? "moving_transport" : "moving_assisted",
        title: uncertain ? "아직 모르는 이사 조건부터 확인하세요." : transport ? "운송만 필요한 조건으로 문의해 보세요." : "도움받을 작업 범위를 나눠 문의하세요.",
        description: uncertain ? "확인하지 않은 짐이나 경로로 차량 크기·인원·금액을 추정하지 않았어요. 정해진 조건부터 남길 수 있습니다."
          : transport ? "포장과 상하차를 준비했다고 선택했어요. 운송만 포함되는지와 별도 작업 비용을 업체에 확인하세요."
          : "운반 또는 포장 도움이 필요하다는 선택을 반영했어요. 업체마다 포함하는 작업이 다를 수 있어 같은 요청서를 기준으로 확인하세요.",
        suggested: uncertain ? "review" : "quote",
        actions: [
          { id: "quote", label: "이 조건으로 문의할게요", detail: "입력한 조건과 미확인 항목 정리", tasks },
          { id: "review", label: "조건부터 확인할게요", detail: "짐·경로·도움받을 범위 확인", tasks: tasks.slice(0, 3) }
        ]
      };
    }
    if (id === "cleaning") {
      const unresolved = answers.scope === "unknown" || answers.space === "unknown";
      const inspect = answers.scope === "inspect";
      const request = answers.effort === "service" || answers.scope === "deep" || answers.space === "large";
      const route = inspect || unresolved || answers.effort === "unknown" ? "review" : request ? "quote" : "self";
      const content = {
        review: [inspect ? "청소 전에 방 상태부터 확인하세요." : "아직 모르는 조건부터 확인해 보세요.",
          inspect ? "반복되는 오염이나 누수 흔적을 선택했어요. 원인 확인과 청소 작업은 구분해 문의하는 편이 좋습니다." : "확인하지 않은 조건은 직접 청소나 업체 이용 쪽으로 임의 판단하지 않았어요."],
        quote: ["같은 작업 범위로 견적을 받아보세요.", "맡기고 싶은 여건이나 넓은 작업 범위를 반영했어요. 필요한 곳과 제외할 작업을 먼저 정하면 문의 내용을 맞출 수 있습니다."],
        self: ["직접 할 작업부터 나눠볼 수 있어요.", "작은 공간, 일반 오염, 직접 할 여유를 선택했어요. 손이 닿는 곳부터 범위를 정하고 어려운 작업은 따로 확인하세요."]
      };
      return {
        code: `cleaning_${route}`, title: content[route][0], description: content[route][1], suggested: route,
        actions: [
          { id: "self", label: "직접 청소할게요", detail: "할 일 목록으로 정리", tasks: ["바닥·선반·욕실 등 직접 할 구역을 정하기", "각 표면과 도구의 사용 표시 확인하기", "손이 닿지 않거나 분해가 필요한 작업은 별도 문의하기"] },
          { id: "quote", label: "견적을 문의할게요", detail: "작업 범위와 질문 준비", tasks: ["실제 면적, 짐 유무, 희망 날짜 확인하기", "가전 내부·창틀 등 포함할 작업 구분하기", "추가요금, 취소 조건, 작업 후 확인 방법 문의하기"] },
          { id: "review", label: "방 상태부터 확인할게요", detail: "모르는 조건 먼저 확인", tasks: ["방 상태와 신경 쓰이는 부분을 사진으로 남기기", "면적·짐 유무·필요한 작업 범위 확인하기", "오염이 반복된다면 원인 확인이 필요한지 문의하기"] }
        ]
      };
    }
    if (answers.owned === "have") return {
      code: "duvet_prepared", title: "가진 이불을 먼저 사용하세요.", description: "계속 사용할 이불이 있다고 선택했어요. 새 구매 후보를 추가하지 않고 보유품으로 남길 수 있습니다.", suggested: "prepared",
      actions: [{ id: "prepared", label: "보유품으로 준비표에 반영", tasks: ["입주 첫날 사용할 침구 따로 챙기기", "사용 전 제품의 관리 표시 확인하기"] }]
    };
    if (answers.owned === "unknown" || answers.size === "unknown" || answers.care === "unknown") return {
      code: "duvet_review", title: "구매 전에 확인할 조건이 남아 있어요.", description: "보유품, 침구 크기 또는 세탁 환경이 아직 확실하지 않아요. 확인한 뒤 선택지를 좁힐 수 있습니다.", suggested: "review",
      actions: [{ id: "review", label: "확인할 항목 저장", tasks: ["가진 이불과 실제 사용할 침구 크기 확인하기", "이불·커버의 가로와 세로 치수 확인하기", "세탁기 설명서와 이불의 세탁·건조 표시 확인하기"] }]
    };
    const cover = answers.care === "cover";
    const type = cover ? "이불커버 이불솜" : answers.care === "whole" ? "차렵이불" : "이불";
    const size = answers.size === "single" ? "싱글 슈퍼싱글" : "더블 퀸 킹";
    return {
      code: cover ? "duvet_cover" : answers.care === "whole" ? "duvet_whole" : "duvet_laundromat",
      title: cover ? "커버 분리형부터 비교해 보세요." : answers.care === "whole" ? "통째로 관리할 이불부터 비교해 보세요." : "빨래방 관리도 고려해 후보를 골라보세요.",
      description: cover ? "커버를 분리해 세탁하고 싶다는 선택을 반영했어요. 커버와 이불솜의 규격·관리 표시를 각각 확인하세요." : "선택한 크기와 관리 방식으로 탐색 범위를 정했어요. 세탁기 용량만으로 특정 이불의 세탁 가능 여부를 판단하지는 않습니다.",
      suggested: "compare", query: `${size} ${type}`,
      actions: [{ id: "compare", label: "이 선택 기준 저장", tasks: ["상품의 실제 가로·세로와 구성품 확인하기", cover ? "이불솜과 커버의 규격 및 별도 구매 비용 확인하기" : "제품 표시의 세탁·건조 방법 확인하기", "배송비를 포함한 금액과 계절에 맞는 두께 확인하기"] }]
    };
  }

  function normalizeRecord(id, value, now = Date.now()) {
    if (!Object.hasOwn(scenarios, id) || !value || value.version !== version || !Number.isFinite(value.expiresAt)
      || value.expiresAt <= now || value.expiresAt > now + ttl + 60000) return null;
    const answers = answersFor(id, value.answers);
    const result = resultFor(id, answers);
    const action = result?.actions.some((a) => a.id === value.action) ? value.action : "";
    const outcome = action && outcomesFor(id, action).some(([key]) => key === value.outcome) ? value.outcome : "planned";
    return { version, answers, budget: parseBudget(value.budget) ?? null, action,
      attemptId: /^[a-z0-9-]{1,64}$/i.test(value.attemptId || "") ? value.attemptId : "",
      outcome, feedback: ["helpful", "not_yet"].includes(value.feedback) ? value.feedback : "",
      feedbackReason: value.feedback === "not_yet" && ["missing_condition", "unclear_next", "need_details"].includes(value.feedbackReason) ? value.feedbackReason : "",
      resultShown: Boolean(value.resultShown && result), updatedAt: Number(value.updatedAt) || now,
      expiresAt: value.expiresAt, completedAt: action ? Number(value.completedAt) || null : null };
  }

  function find(query) {
    const text = String(query).toLowerCase().replace(/[\s?!.,]/g, "").slice(0, 150);
    if (!text) return [];
    const hits = [];
    if (text === "청소" || /입주청소|이사청소|청소맡|청소업체|직접청소|청소직접/.test(text)) hits.push("cleaning");
    if (/이불|침구|차렵|커버분리/.test(text)) hits.push("duvet");
    if (text === "이사" || /용달|이사견적|이사비용|원룸이사|이삿짐|짐운반/.test(text)) hits.push("moving");
    if (/수납|정리함|정리박스|방이좁|공간이부족/.test(text)) hits.push("storage");
    return hits;
  }

  function summary(id, answers) {
    return activeQuestions(id, answers).flatMap((q) => {
      const option = q.options.find(([value]) => value === answers[q.id]);
      return option ? [{ question: q.title, answer: option[1] }] : [];
    });
  }

  function inquiry(answers, id = "cleaning") {
    if (id === "moving") {
      const labels = Object.fromEntries(summary(id, answers).map((entry) => [entry.question, entry.answer]));
      return `안녕하세요. 이사·운송 작업 범위와 견적을 문의드립니다.\n\n${Object.entries(labels).map(([question, answer]) => `${question} ${answer}`).join("\n")}\n\n아직 전달하지 않은 정보:\n- 희망 날짜와 출발·도착 지역\n- 상자 수량, 큰 가구·가전의 치수와 사진\n- 양쪽 층수·엘리베이터·주차 및 차량 진입 조건\n\n포장·상하차·운송·설치 중 포함되는 작업, 추가요금 조건, 취소 조건과 파손 발생 시 연락 절차를 알려주세요.\n세부 주소와 연락처는 업체의 접수 경로에서 필요한 범위만 전달하겠습니다.`;
    }
    const labels = Object.fromEntries(scenarios.cleaning.questions.map((q) => [q.id, q.options.find(([v]) => v === answers[q.id])?.[1] || "아직 확인 전"]));
    return `안녕하세요. 입주청소 작업 범위와 견적을 문의드립니다.\n\n방 상태: ${labels.scope}\n공간: ${labels.space}\n진행 여건: ${labels.effort}\n\n실제 면적 / 짐 유무 / 희망 날짜: 확인 후 전달하겠습니다.\n가전 내부와 창틀 등 포함·제외되는 작업, 추가요금, 취소 조건, 작업 후 확인 방법을 알려주세요.\n${answers.scope === "inspect" ? "반복되는 오염이나 누수 흔적은 청소와 별도의 원인 확인이 필요한지도 문의드립니다.\n" : ""}\n사진과 세부 주소는 업체의 접수 경로에서 필요한 범위만 전달하겠습니다.`;
  }

  function outcomesFor(id, action) {
    const service = Object.hasOwn(scenarios, id) && scenarios[id].service;
    const values = [["planned", "진행 전"]];
    if (service && action === "quote") values.push(["contacted", "문의했어요 · 답변 확인 중"]);
    if (service) values.push(["followup", "다시 확인이 필요해요"]);
    values.push(["done", action === "review" ? "확인했어요" : action === "reuse" ? "정리했어요" : service ? "처리했어요" : "준비했어요"]);
    return values;
  }

  function followupTasks(id, action) {
    if (id === "moving") return action === "quote"
      ? ["처음 전달한 짐·경로·작업 범위와 받은 답변을 다시 대조하세요.", "답변이 없거나 빠진 조건은 업체에 재문의하고, 필요한 경우 같은 조건으로 다른 업체에도 문의하세요."]
      : ["짐 목록·이동 경로·필요한 도움 중 아직 모르는 조건을 구분하세요.", "확인한 조건은 조건 수정에 반영하고, 업체의 확인이 필요한 부분만 따로 문의하세요."];
    if (id === "cleaning") return action === "quote"
      ? ["처음 요청한 범위와 아직 남은 상태를 구분해 기록하세요.", "업체에 확인한 작업 범위와 후속 확인 방법을 재문의하세요. 반복되는 문제의 원인을 청소만으로 단정하지 마세요."]
      : ["아직 확인하지 못한 곳과 작업 후에도 남은 상태를 기록하세요.", "직접 처리 범위를 다시 정하고, 원인 확인이나 업체 문의가 필요한지 살펴보세요."];
    return [];
  }

  return { version, ttl, scenarios, answersFor, activeQuestions, parseBudget, resultFor, normalizeRecord, find, summary, inquiry, outcomesFor, followupTasks };
})();
