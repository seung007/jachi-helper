const allRooms = ["full", "semi", "empty"];
const allLifestyles = ["cook", "delivery", "remote"];
const recommendationRuleVersion = "v2-item-guidance";

function trackAnalyticsEvent(eventName, parameters = {}) {
  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, parameters);
    }
  } catch {
    // Analytics must never interrupt the purchase-planning flow.
  }
}

const pendingAnalyticsKey = "jachi-helper:pending-analytics-events";

function queueAnalyticsEvent(eventName, parameters = {}) {
  try {
    const pending = JSON.parse(sessionStorage.getItem(pendingAnalyticsKey) || "[]");
    pending.push({ eventName, parameters, queuedAt: Date.now() });
    sessionStorage.setItem(pendingAnalyticsKey, JSON.stringify(pending.slice(-10)));
  } catch {
    trackAnalyticsEvent(eventName, parameters);
  }
}

function flushPendingAnalyticsEvents() {
  try {
    const pending = JSON.parse(sessionStorage.getItem(pendingAnalyticsKey) || "[]");
    sessionStorage.removeItem(pendingAnalyticsKey);
    pending.forEach(({ eventName, parameters, queuedAt }) => {
      trackAnalyticsEvent(eventName, { ...parameters, queued_delay_ms: Math.max(0, Date.now() - Number(queuedAt || Date.now())) });
    });
  } catch {
    sessionStorage.removeItem(pendingAnalyticsKey);
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
      ["pad", "방수패드", 6, false, false], ["hanger", "옷걸이", 8, false, true], ["curtain", "커튼 또는 블라인드", 5, false, true],
      ["pillowcase", "베개 커버", 6, false, false], ["sleep-mask", "수면 안대", 3, false, false]
    ]
  },
  {
    prefix: "bath",
    category: "욕실",
    stores: ["daiso", "coupang", "naver"],
    items: [
      ["towel", "수건", 10, true, false], ["toiletries", "샴푸·바디워시", 10, true, false], ["toothbrush", "칫솔·치약", 10, true, false],
      ["mat", "발매트", 5, false, false], ["toilet-paper", "화장지", 9, true, false], ["basket", "빨래 바구니", 7, false, true],
      ["slippers", "욕실화", 6, false, false], ["drain-strainer", "배수구 거름망", 5, false, false],
      ["toilet-brush", "변기솔", 6, false, false], ["hair-dryer", "헤어드라이어", 6, false, false]
    ]
  },
  {
    prefix: "kitchen",
    category: "주방",
    stores: ["daiso", "coupang", "naver"],
    items: [
      ["pot", "냄비", 8, false, false], ["pan", "프라이팬", 8, false, false], ["cutlery", "수저·젓가락", 8, true, false],
      ["dishes", "접시·컵", 7, true, false], ["container", "밀폐용기", 5, false, true], ["bag", "음식물·종량제 봉투", 9, true, false],
      ["knife", "식도·주방칼", 7, false, false], ["cutting-board", "도마", 7, false, false], ["sponge", "수세미", 8, true, false],
      ["dish-rack", "식기 건조대", 5, false, true], ["peeler", "채소 필러", 4, false, false], ["ladle", "국자", 5, false, false],
      ["paper-towel", "키친타월", 5, false, false], ["zipbag", "식품용 지퍼백", 5, false, false], ["dish-soap", "주방세제", 7, false, false]
    ]
  },
  {
    prefix: "clean",
    category: "청소",
    stores: ["daiso", "coupang", "naver"],
    items: [
      ["wipes", "청소포·물티슈", 8, true, false], ["detergent", "주방·욕실 세제", 9, true, false], ["broom", "빗자루 또는 밀대", 7, false, true],
      ["gloves", "고무장갑", 7, false, false], ["trash", "쓰레기통", 8, true, true], ["recycle", "분리수거 봉투", 8, true, false],
      ["cloth", "청소용 걸레", 7, true, false], ["plunger", "압축 뚫어뻥", 4, false, false]
    ]
  },
  {
    prefix: "laundry",
    category: "세탁",
    stores: ["daiso", "coupang", "naver"],
    items: [
      ["detergent", "세탁세제", 9, true, false], ["dryer", "건조대", 8, false, true], ["clips", "빨래집게", 5, false, false],
      ["net", "세탁망", 5, false, false], ["softener", "섬유유연제", 4, false, false], ["bag", "세탁물 보관 봉투", 4, false, true],
      ["lint-roller", "돌돌이·테이프 클리너", 4, false, false]
    ]
  },
  {
    prefix: "life",
    category: "생활·수납",
    stores: ["daiso", "coupang", "naver"],
    items: [
      ["powerstrip", "멀티탭", 10, true, false], ["storage", "수납 박스", 7, false, true], ["scissors", "가위·커터칼", 7, true, false],
      ["tape", "테이프", 6, false, false], ["light", "스탠드 또는 조명", 5, false, true], ["umbrella", "우산", 5, false, false],
      ["measuring-tape", "줄자", 8, true, false], ["screwdriver", "드라이버", 5, false, false], ["slippers", "실내 슬리퍼", 4, false, false]
    ]
  },
  {
    prefix: "food", category: "먹거리", stores: ["coupang", "naver"],
    items: [["rice", "즉석밥", 5, false, false], ["tuna", "참치캔", 4, false, false], ["seaweed", "도시락김", 4, false, false], ["water", "생수", 5, false, false], ["noodles", "봉지라면", 4, false, false], ["frozen", "냉동만두", 4, false, false]]
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

const catalogSubgroups = {
  "침구·수면": [
    { label: "이불·커버·패드", ids: ["bedding-duvet", "bedding-cover", "bedding-pad"], criteria: "침대 실측 크기 · 계절과 소재 · 통세탁/커버 분리 · 세탁기 용량" },
    { label: "베개·커버", ids: ["bedding-pillow", "bedding-pillowcase"], criteria: "베개 높이와 크기 · 충전재 · 커버 분리 · 세탁 표시" },
    { label: "빛 차단·옷걸이", ids: ["bedding-curtain", "bedding-sleep-mask", "bedding-hanger"], criteria: "창문 크기와 설치 방식 · 안대 착용감 · 옷장 폭" }
  ],
  "욕실": [
    { label: "세면·위생", ids: ["bath-towel", "bath-toiletries", "bath-toothbrush", "bath-toilet-paper"], criteria: "수건 크기·두께 · 세면용품 성분·향 · 소모품 수량과 보관 공간" },
    { label: "바닥·배수·청소", ids: ["bath-mat", "bath-slippers", "bath-drain-strainer", "bath-toilet-brush"], criteria: "배수구 규격 · 바닥 재질 · 물빠짐 · 세척과 건조 방식" },
    { label: "보관·건조", ids: ["bath-basket", "bath-hair-dryer"], criteria: "바구니 실측 크기·통풍 · 드라이어 무게·소비전력·보관 위치" }
  ],
  "주방": [
    { label: "주방 소모품", ids: ["kitchen-paper-towel", "kitchen-zipbag", "kitchen-dish-soap"], criteria: "총 수량과 보관 공간 · 매당 크기·겹수 · 식품용/냉동 표시 · 세제 사용 대상" },
    { label: "조리 도구", ids: ["kitchen-pot", "kitchen-pan", "kitchen-knife", "kitchen-cutting-board", "kitchen-peeler", "kitchen-ladle"], criteria: "가열기구 호환 · 조리 인원 · 재질 · 손잡이와 보관 크기" },
    { label: "식기·보관", ids: ["kitchen-cutlery", "kitchen-dishes", "kitchen-container"], criteria: "1인 사용 수량 · 냉장고 선반 크기 · 전자레인지/냉동 사용 표시" },
    { label: "설거지·폐기", ids: ["kitchen-bag", "kitchen-sponge", "kitchen-dish-rack"], criteria: "지역 봉투 규격 · 싱크대 공간 · 물받이와 배수 · 교체 단위" }
  ],
  "청소": [
    { label: "세정·닦기", ids: ["clean-detergent", "clean-wipes", "clean-cloth", "clean-gloves"], criteria: "사용 대상과 표면 재질 · 제품 용도 표시 · 희석 여부 · 장갑 크기" },
    { label: "바닥·배수 도구", ids: ["clean-broom", "clean-plunger"], criteria: "바닥 재질 · 도구 폭과 보관 길이 · 배수구 형태" },
    { label: "쓰레기·분리수거", ids: ["clean-trash", "clean-recycle"], criteria: "봉투 규격 · 통 용량 · 뚜껑 여닫는 공간 · 세척 구조" }
  ],
  "세탁": [
    { label: "세제·유연제", ids: ["laundry-detergent", "laundry-softener"], criteria: "세탁기 호환 · 오염별 세척 성능 · 의류 세탁 표시 · 향·성분 · 1회당 비용" },
    { label: "건조·집게", ids: ["laundry-dryer", "laundry-clips"], criteria: "펼친 크기와 접은 크기 · 빨래 양 · 설치 공간 · 제품 표시 하중" },
    { label: "의류 관리·보관", ids: ["laundry-net", "laundry-bag", "laundry-lint-roller"], criteria: "세탁망 크기·망 간격 · 보관 통풍 · 리필 규격" }
  ],
  "생활·수납": [
    { label: "수납·실측", ids: ["life-storage", "life-measuring-tape"], criteria: "내부/외부 치수 · 여닫는 공간 · 넣을 물건 · 쌓기와 하중 표시" },
    { label: "전원·조명", ids: ["life-powerstrip", "life-light"], criteria: "정격 용량 · 연결 기기 소비전력 · 코드 길이 · 조명 밝기와 설치 위치" },
    { label: "도구·생활 소품", ids: ["life-scissors", "life-tape", "life-umbrella", "life-screwdriver", "life-slippers"], criteria: "사용 목적 · 규격과 크기 · 교체 부품 · 보관 위치" }
  ],
  "먹거리": [
    { label: "밥·간편 조리", ids: ["food-rice", "food-noodles"], criteria: "한 봉지 양 · 조리 도구 · 총 수량 · 원재료·영양·소비기한 표시" },
    { label: "반찬·통조림", ids: ["food-tuna", "food-seaweed"], criteria: "소포장 크기 · 묶음 수량 · 알레르기·원재료 · 개봉 후 보관 표시" },
    { label: "생수", ids: ["food-water"], criteria: "병 크기 · 총 용량 · 배송비 · 운반과 보관 공간" },
    { label: "냉동식품", ids: ["food-frozen"], criteria: "냉동실 여유 · 개별 포장 · 수령 가능 시간 · 조리·보관 표시" }
  ],
  "안전·건강": [
    { label: "문·비상 조명", ids: ["safe-door", "safe-flashlight"], criteria: "문과 바닥 간격 · 전원 방식 · 사용 시간 · 비상시 보관 위치" },
    { label: "상비약", ids: ["safe-medicine"], criteria: "약사에게 용도·복용 중인 약 확인 · 사용기한 · 보관 조건" }
  ]
};

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

const recommendationFeedbackReasons = {
  missing: [
    ["bath_laundry", "욕실·세탁"],
    ["kitchen", "주방"],
    ["bedding_storage", "침구·수납"],
    ["safety_living", "안전·생활"],
    ["other", "기타"]
  ],
  unnecessary: [
    ["provided", "집에 기본 제공"],
    ["not_used", "평소 사용하지 않음"],
    ["space", "놓을 공간이 부족함"],
    ["budget", "예산상 우선순위가 낮음"]
  ]
};

const itemGuidance = {
  "food-rice": { phase: "confirm", reason: "밥을 직접 짓는 빈도와 간편식으로 먹을 양을 비교합니다.", criteria: "한 공기 중량, 전자레인지 등 조리 도구, 소비기한과 묶음 수량을 확인하세요." },
  "food-tuna": { phase: "confirm", reason: "한 번에 사용할 양에 맞는 작은 캔부터 비교합니다.", criteria: "캔당 중량, 원재료·알레르기 표시와 개봉 후 보관 안내를 확인하세요." },
  "food-seaweed": { phase: "confirm", reason: "곁들일 반찬이 필요할 때 소포장 수량을 정합니다.", criteria: "봉지당 중량, 원재료, 소비기한과 개봉 후 보관 표시를 확인하세요." },
  "food-water": { phase: "confirm", reason: "현재 마시는 물과 수령·운반 부담을 먼저 비교합니다.", criteria: "병 크기, 총 용량, 배송비와 집 안에 보관할 공간을 확인하세요." },
  "food-noodles": { phase: "confirm", reason: "간편 조리용으로 필요한 수량만 비교합니다.", criteria: "컵면과 봉지면을 구분하고 조리 도구, 매운맛, 원재료·영양 표시를 확인하세요." },
  "food-frozen": { phase: "confirm", reason: "냉동실에 보관할 공간이 있을 때 구매를 검토합니다.", criteria: "개별 포장량, 냉동 배송·수령 조건과 제품의 보관·조리 표시를 확인하세요." },
  "kitchen-paper-towel": { phase: "confirm", reason: "주방에서 닦는 용도와 보관 가능한 묶음 크기를 비교합니다.", criteria: "롤당 매수·크기·겹수와 총 수량을 함께 확인하세요. 롤 수만으로 가격을 비교하지 마세요." },
  "kitchen-zipbag": { phase: "confirm", reason: "기존 밀폐용기로 부족한 소분·보관 용도를 확인합니다.", criteria: "식품용 표시, 가로·세로 규격, 냉장·냉동 사용 범위와 총 매수를 확인하세요." },
  "kitchen-dish-soap": { phase: "confirm", reason: "이미 가진 주방세제와 리필 가능 여부부터 확인합니다.", criteria: "g와 ml를 구분해 단가를 보고 사용 대상, 희석량과 리필·본품 여부를 확인하세요." },
  "bedding-pillowcase": { phase: "confirm", reason: "베개에 커버가 포함되는지 먼저 확인합니다.", criteria: "베개 가로·세로, 여밈 방식과 교체 세탁할 수량을 확인하세요." },
  "bedding-sleep-mask": { phase: "later", reason: "실제 수면 시간과 방의 밝기를 본 뒤 필요하면 추가합니다.", criteria: "얼굴에 닿는 소재, 끈 조절과 세탁 방법을 확인하세요." },
  "bath-slippers": { phase: "confirm", reason: "욕실 바닥과 기존 욕실화 유무를 먼저 확인합니다.", criteria: "발 크기, 물빠짐 구조와 바닥에 맞는 밑창을 확인하세요." },
  "bath-drain-strainer": { phase: "confirm", reason: "배수구에 이미 설치된 거름망과 규격을 확인합니다.", criteria: "욕실·세면대·싱크대 중 사용할 곳과 배수구 지름·깊이를 재보세요." },
  "bath-toilet-brush": { phase: "confirm", reason: "기존 청소 도구와 변기 주변 보관 공간을 확인합니다.", criteria: "변기 형태에 맞는 솔, 받침 구조와 솔 교체 가능 여부를 확인하세요." },
  "bath-hair-dryer": { phase: "confirm", reason: "가져갈 드라이어와 머리를 말릴 위치를 먼저 확인합니다.", criteria: "제품 무게, 코드 길이, 전원 규격과 보관 공간을 확인하고 사용 주의사항을 따르세요." },
  "kitchen-knife": { phase: "confirm", reason: "직접 손질할 식재료가 있을 때 준비합니다.", criteria: "주로 자를 재료, 날 길이, 손잡이와 날을 덮어 보관할 방법을 확인하세요." },
  "kitchen-cutting-board": { phase: "confirm", reason: "직접 식재료를 손질할지와 조리대 공간을 확인합니다.", criteria: "싱크대에서 씻을 수 있는 크기, 건조할 위치와 소재별 관리 방법을 확인하세요." },
  "kitchen-sponge": { phase: "now", reason: "첫날 쓸 식기를 씻을 수세미가 없다면 챙깁니다.", criteria: "식기·코팅팬에 쓸 수 있는 재질인지, 사용 후 말릴 곳이 있는지 확인하세요." },
  "kitchen-dish-rack": { phase: "confirm", reason: "기본 제공 건조 공간을 확인한 뒤 부족할 때 추가합니다.", criteria: "싱크대 폭, 물받이 배수 방향과 수납할 식기 크기를 확인하세요." },
  "kitchen-peeler": { phase: "later", reason: "껍질을 벗길 채소를 자주 손질하는지 본 뒤 추가합니다.", criteria: "주로 손질할 재료, 손잡이 형태와 날을 보관할 방법을 확인하세요." },
  "kitchen-ladle": { phase: "confirm", reason: "국이나 찌개를 직접 끓일 때 사용할 도구를 확인합니다.", criteria: "냄비 깊이에 맞는 길이, 조리기구 표면과의 호환 및 보관 위치를 확인하세요." },
  "clean-cloth": { phase: "now", reason: "입주 전후 물기를 닦을 천이 없다면 챙깁니다.", criteria: "닦을 표면, 천의 세탁 방법과 사용 후 건조할 위치를 확인하세요." },
  "clean-plunger": { phase: "confirm", reason: "사용할 배수구 형태와 건물의 관리 방식을 먼저 확인합니다.", criteria: "변기용·싱크대용 구분과 제품 사용 설명을 확인하고 반복되는 막힘은 관리 담당자에게 문의하세요." },
  "laundry-lint-roller": { phase: "later", reason: "옷이나 침구의 먼지 제거가 불편할 때 추가합니다.", criteria: "사용 가능한 옷감, 리필 폭과 보관할 위치를 확인하세요." },
  "life-measuring-tape": { phase: "now", reason: "가구와 수납용품을 사기 전 공간을 잴 줄자를 챙깁니다.", criteria: "이미 가진 줄자, 필요한 측정 길이와 눈금 가독성을 확인하세요." },
  "life-screwdriver": { phase: "confirm", reason: "조립할 가구에 공구가 포함되는지 먼저 확인합니다.", criteria: "나사 머리와 맞는 팁 규격, 조립 설명서와 손잡이 크기를 확인하세요." },
  "life-slippers": { phase: "later", reason: "바닥에서 생활해 본 뒤 필요하면 실내화를 추가합니다.", criteria: "발 크기, 바닥에 맞는 밑창과 세탁 방법을 확인하세요." },
  "bedding-cover": { phase: "confirm", reason: "사용할 매트리스 크기를 확인한 뒤 고릅니다.", criteria: "매트리스의 가로·세로·높이와 커버 세탁 방법을 확인하세요." },
  "bedding-duvet": { phase: "now", reason: "첫날 잠잘 때 사용할 이불부터 준비합니다.", criteria: "이미 가진 이불, 사용할 침구 크기와 계절에 맞는 두께를 확인하세요." },
  "bedding-pillow": { phase: "now", reason: "첫날 사용할 베개가 없다면 먼저 준비합니다.", criteria: "평소 편한 높이, 베개 크기와 커버 분리 세탁 여부를 확인하세요." },
  "bedding-pad": { phase: "later", reason: "방수 기능이 필요한지 정한 뒤 추가로 고릅니다.", criteria: "매트리스 크기, 방수 소재와 세탁·건조 방법을 확인하세요." },
  "bedding-hanger": { phase: "confirm", reason: "옷장에 걸 공간과 옷 수량을 먼저 확인합니다.", criteria: "옷장 봉 길이, 옷걸이 폭·두께와 필요한 수량을 확인하세요." },
  "bedding-curtain": { phase: "confirm", reason: "창문 크기와 설치 가능 방식을 먼저 확인합니다.", criteria: "창문 가로·세로, 커튼봉 유무와 타공 가능 여부를 확인하세요." },
  "bath-towel": { phase: "now", reason: "첫날 씻은 뒤 사용할 수건부터 준비합니다.", criteria: "가져갈 수건 수량과 세탁·건조 주기에 맞춰 필요한 수량을 정하세요." },
  "bath-toiletries": { phase: "now", reason: "첫날 사용할 샴푸와 바디워시부터 챙깁니다.", criteria: "평소 쓰던 제품의 남은 양과 욕실에 둘 용기 크기를 확인하세요." },
  "bath-toothbrush": { phase: "now", reason: "첫날 사용할 개인 칫솔과 치약부터 챙깁니다.", criteria: "가져갈 칫솔·치약이 있는지 확인하고 필요한 것만 준비하세요." },
  "bath-mat": { phase: "later", reason: "욕실 앞 물기와 동선을 본 뒤 필요하면 추가합니다.", criteria: "문이 열리는 높이, 바닥에서 미끄러지는지와 세탁 방법을 확인하세요." },
  "bath-toilet-paper": { phase: "now", reason: "입주 당일 사용할 화장지부터 챙깁니다.", criteria: "남은 화장지와 보관 공간을 확인하고 처음부터 대량 구매하지 마세요." },
  "bath-basket": { phase: "confirm", reason: "세탁물을 모아 둘 위치와 공간을 먼저 확인합니다.", criteria: "바구니를 놓을 폭·높이, 통풍 구조와 옮기기 편한 손잡이를 확인하세요." },
  "kitchen-pot": { phase: "confirm", reason: "사용할 가열 기구와 만들 음식을 먼저 확인합니다.", criteria: "가스·인덕션 호환, 한 번에 조리할 양과 보관할 폭을 확인하세요." },
  "kitchen-pan": { phase: "confirm", reason: "가열 기구와 자주 할 요리에 맞춰 고릅니다.", criteria: "가스·인덕션 호환, 팬 지름과 손잡이까지 들어갈 수납 공간을 확인하세요." },
  "kitchen-cutlery": { phase: "now", reason: "집에서 첫 끼를 먹을 수저와 젓가락부터 챙깁니다.", criteria: "이미 가진 수저 세트와 필요한 인원수, 세척 방법을 확인하세요." },
  "kitchen-dishes": { phase: "confirm", reason: "집에서 먹는 방식에 맞춰 최소 수량부터 정합니다.", criteria: "접시·컵을 따로 확인하고 전자레인지 사용 표시와 수납 크기를 살펴보세요." },
  "kitchen-container": { phase: "later", reason: "남는 음식의 양을 본 뒤 필요한 용기를 추가합니다.", criteria: "냉장고 선반 크기, 용기 용량과 전자레인지·냉동 사용 표시를 확인하세요." },
  "kitchen-bag": { phase: "confirm", reason: "거주지에서 쓰는 쓰레기 배출 방식을 먼저 확인합니다.", criteria: "거주지 지자체의 종량제 봉투 종류·판매처와 음식물 배출 방식을 확인하세요.", search: "종량제 봉투 판매처 음식물 배출 방법", stores: ["naver"] },
  "clean-wipes": { phase: "now", reason: "입주 전후 표면을 닦을 청소용품부터 챙깁니다.", criteria: "닦을 표면에 사용 가능한지와 일회용·세탁용 여부를 확인하세요." },
  "clean-detergent": { phase: "confirm", reason: "청소할 곳과 표면에 맞는 세제를 고릅니다.", criteria: "주방·욕실 중 사용할 곳, 적용 가능한 재질과 제품 사용 주의사항을 확인하세요." },
  "clean-broom": { phase: "confirm", reason: "바닥과 청소 도구를 둘 공간을 먼저 확인합니다.", criteria: "바닥 재질, 밀대 폭과 교체 청소포 규격을 확인하세요." },
  "clean-gloves": { phase: "confirm", reason: "설거지·청소에 사용할 장갑을 구분해 고릅니다.", criteria: "손 크기, 장갑 길이와 제품에 표시된 사용 용도를 확인하세요." },
  "clean-trash": { phase: "confirm", reason: "봉투 규격과 쓰레기통을 둘 위치를 먼저 확인합니다.", criteria: "사용할 봉투 용량, 뚜껑이 열리는 공간과 세척 편의성을 확인하세요." },
  "clean-recycle": { phase: "confirm", reason: "건물의 재활용품 수거 방식을 먼저 확인합니다.", criteria: "배출 요일·장소, 품목별 분리 방법과 별도 봉투 필요 여부를 확인하세요.", search: "재활용품 분리배출 방법", stores: ["naver"] },
  "laundry-detergent": { phase: "confirm", reason: "세탁기와 세탁할 옷에 맞는 세제부터 확인합니다.", criteria: "일반·드럼 세탁기 호환, 의류 세탁 표시와 권장 사용량을 확인하세요." },
  "laundry-dryer": { phase: "confirm", reason: "빨래를 말릴 방식과 펼칠 공간을 먼저 확인합니다.", criteria: "건조대를 펼친 폭·높이, 접었을 때 크기와 통로를 확인하세요." },
  "laundry-clips": { phase: "later", reason: "건조대 구성과 빨래 고정 필요를 본 뒤 추가합니다.", criteria: "건조대에 집게가 포함되는지, 집게가 물릴 두께를 확인하세요." },
  "laundry-net": { phase: "confirm", reason: "세탁할 의류의 표시를 확인한 뒤 망을 고릅니다.", criteria: "의류 세탁 표시, 망 크기와 지퍼 덮개 유무를 확인하세요." },
  "laundry-softener": { phase: "later", reason: "옷감에 사용 가능한지 보고 필요하면 추가합니다.", criteria: "의류의 섬유유연제 사용 가능 여부, 향과 권장 사용량을 확인하세요." },
  "laundry-bag": { phase: "later", reason: "세탁물 보관·운반에 별도 봉투가 필요한지 확인합니다.", criteria: "젖은 세탁물 보관 여부, 통풍 구조와 운반할 용량을 확인하세요." },
  "life-powerstrip": { phase: "confirm", reason: "콘센트와 사용할 전기기기를 먼저 확인합니다.", criteria: "제품 정격 용량, 연결할 기기의 소비전력과 필요한 코드 길이를 확인하세요." },
  "life-storage": { phase: "confirm", reason: "정리할 물건과 빈 공간을 확인한 뒤 고릅니다.", criteria: "물건과 수납 공간의 가로·세로·높이, 뚜껑을 여는 공간을 재보세요." },
  "life-scissors": { phase: "now", reason: "이삿짐 포장을 열 도구가 없다면 먼저 챙깁니다.", criteria: "기존 가위·커터칼 보유 여부와 날을 덮어 보관할 수 있는지 확인하세요." },
  "life-tape": { phase: "later", reason: "포장·고정할 일이 생기면 용도에 맞춰 고릅니다.", criteria: "붙일 표면, 필요한 접착력과 제거 시 흔적 여부를 확인하세요." },
  "life-light": { phase: "later", reason: "기존 조명으로 생활해 본 뒤 부족한 곳에 추가합니다.", criteria: "설치 위치, 전원 방식과 필요한 밝기를 확인하세요." },
  "life-umbrella": { phase: "confirm", reason: "가져갈 우산이 있는지 먼저 확인합니다.", criteria: "휴대할 크기·무게와 젖은 우산을 둘 위치를 확인하세요." },
  "safe-door": { phase: "confirm", reason: "문의 종류와 사용 가능한 고정 방식을 확인합니다.", criteria: "문 아래 틈과 바닥 재질을 확인하고 건물의 문 관리 안내를 따르세요." },
  "safe-medicine": { phase: "confirm", reason: "보유한 약을 확인하고 필요한 품목은 약국에 문의합니다.", criteria: "보유 약의 사용기한·보관 표시를 확인하고 필요한 약은 약사와 상의하세요.", search: "근처 약국", stores: ["naver"] },
  "safe-flashlight": { phase: "confirm", reason: "정전 때 사용할 조명과 보관 위치를 확인합니다.", criteria: "이미 가진 손전등, 배터리 규격과 충전 상태를 확인하세요." }
};

const itemSignals = {
  "kitchen-knife": { condition: "cooking", match: "often", reason: "직접 요리할 식재료 손질에 쓸 도구", criteria: "가져갈 칼과 날을 덮어 보관할 곳을 확인하세요." },
  "kitchen-cutting-board": { condition: "cooking", match: "often", reason: "식재료를 직접 손질할 때 확인할 항목", criteria: "조리대와 세척·건조 공간에 맞는 크기를 고르세요." },
  "kitchen-ladle": { condition: "cooking", match: "often", reason: "국물 요리를 만들 때 확인할 항목", criteria: "국자를 포함한 조리도구가 이미 있는지 확인하세요." },
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

function getItemGuidance(id, preferences = {}, decision = "review") {
  const item = recommendationCatalog[id];
  const guidance = itemGuidance[id];
  const signal = itemSignals[id];
  const matchedCondition = Boolean(signal && preferences[signal.condition] === signal.match);
  let phase = guidance.phase;
  let reason = guidance.reason;
  let criteria = guidance.criteria;
  if (matchedCondition) {
    reason = `${signal.reason}. ${guidance.reason}`;
    criteria = `${criteria} ${signal.criteria}`;
  }
  if (decision === "later" || decision === "skip") {
    phase = "later";
    reason = `직접 나중에 결정하기로 남긴 항목입니다. ${guidance.reason}`;
  } else if (decision === "candidate") {
    phase = "now";
    reason = `직접 필요하다고 선택한 항목입니다. ${guidance.reason}`;
  }
  const searchTerms = [guidance.search || item.title.replace(/[·]/g, " ").replace(/ 또는 /g, " ")];
  if (matchedCondition && signal.search) searchTerms.push(signal.search);
  return { phase, reason, criteria, conditionMatched: matchedCondition, searchQuery: searchTerms.join(" "), stores: guidance.stores || item.stores };
}

const homePreviewPresets = {
  default: {
    summary: `기본 준비 ${Object.keys(recommendationCatalog).length}개 중 구매 시점이 다른 대표 6개예요.`,
    items: [
      { id: "bath-towel" }, { id: "bath-toiletries" }, { id: "life-powerstrip" },
      { id: "bedding-curtain" }, { id: "life-storage" }, { id: "kitchen-dishes" }
    ]
  },
  cooking: {
    summary: "직접 요리할 때 먼저 살 것과 확인할 것을 6개로 나눴어요.",
    items: [
      { id: "kitchen-cutlery" }, { id: "kitchen-bag" }, { id: "kitchen-pot" },
      { id: "kitchen-pan" }, { id: "kitchen-container" }, { id: "kitchen-dishes" }
    ]
  },
  drying: {
    summary: "실내 건조에서 공간과 세탁 습관을 확인할 대표 6개예요.",
    items: [
      { id: "laundry-detergent" }, { id: "bath-basket" }, { id: "laundry-dryer" },
      { id: "laundry-net" }, { id: "laundry-softener" }, { id: "laundry-clips" }
    ]
  },
  workout: {
    summary: "운동복 세탁에 관련된 6개 품목입니다. 항균·탈취 효과를 임의로 보장하지 않습니다.",
    items: [{ id: "laundry-detergent" }, { id: "laundry-net" }, { id: "bath-basket" }, { id: "laundry-dryer" }, { id: "laundry-lint-roller" }, { id: "bath-towel" }],
    notes: {
      "laundry-detergent": "운동복이라고 별도 전용 세제가 필요한지는 의류 표시부터 확인하세요. 시험 제품의 피지 오염 성능과 비용을 비교할 수 있습니다.",
      "laundry-net": "운동복의 세탁 표시를 먼저 확인하고, 세탁망이 필요한 옷의 크기와 잠금 방식을 비교하세요."
    }
  },
  bedding: {
    summary: "침구는 가격뿐 아니라 규격·세탁 방식·교체할 구성을 함께 비교하세요.",
    items: [{ id: "bedding-duvet" }, { id: "bedding-cover" }, { id: "bedding-pad" }, { id: "bedding-pillow" }, { id: "bedding-pillowcase" }, { id: "laundry-bag" }],
    notes: { "bedding-duvet": "통째로 세탁할지, 커버를 분리할지에 따라 비교할 구성이 달라집니다. 가진 침구와 실제 크기를 먼저 확인하세요." }
  },
  storage: {
    summary: "수납이 부족할 때 바로 사지 않고 판단할 대표 6개예요.",
    items: [
      { id: "life-measuring-tape" }, { id: "life-storage" }, { id: "bedding-hanger" },
      { id: "bath-basket" }, { id: "clean-trash" }, { id: "kitchen-container" }
    ],
    notes: { "life-storage": "짐을 담을 내부 치수와 방에 놓을 외부 치수를 따로 비교하세요. 뚜껑·서랍을 여는 공간도 남겨야 합니다." }
  }
};

const homeProductImages = {
  "food-rice": ["/assets/offers/rice.jpg", "center", "contain", "direct"],
  "food-tuna": ["/assets/offers/tuna.png", "center", "contain", "direct"],
  "food-seaweed": ["/assets/offers/seaweed.jpg", "center", "contain", "direct"],
  "food-water": ["/assets/offers/water.jpg", "center", "contain", "direct"],
  "food-noodles": ["/assets/offers/ramen.jpg", "center", "contain", "direct"],
  "food-frozen": ["/assets/offers/dumpling.jpg", "center", "contain", "direct"],
  "kitchen-paper-towel": ["/assets/offers/paper.jpg", "center", "contain", "direct"],
  "kitchen-zipbag": ["/assets/offers/zipbag.jpg", "center", "contain", "direct"],
  "kitchen-dish-soap": ["/assets/offers/dishsoap.jpg", "center", "contain", "direct"],
  "bedding-pillowcase": ["expanded", "0% 0%", "300% 600%"],
  "bedding-sleep-mask": ["expanded", "50% 0%", "300% 600%"],
  "bath-slippers": ["expanded", "100% 0%", "300% 600%"],
  "bath-drain-strainer": ["expanded", "0% 20%", "300% 600%"],
  "bath-toilet-brush": ["expanded", "50% 20%", "300% 600%"],
  "bath-hair-dryer": ["expanded", "100% 20%", "300% 600%"],
  "kitchen-knife": ["expanded", "0% 40%", "300% 600%"],
  "kitchen-cutting-board": ["expanded", "50% 40%", "300% 600%"],
  "kitchen-sponge": ["expanded", "100% 40%", "300% 600%"],
  "kitchen-dish-rack": ["expanded", "0% 60%", "300% 600%"],
  "kitchen-peeler": ["expanded", "50% 60%", "300% 600%"],
  "kitchen-ladle": ["expanded", "100% 60%", "300% 600%"],
  "clean-cloth": ["expanded", "0% 80%", "300% 600%"],
  "clean-plunger": ["expanded", "50% 80%", "300% 600%"],
  "laundry-lint-roller": ["expanded", "100% 80%", "300% 600%"],
  "life-measuring-tape": ["expanded", "0% 100%", "300% 600%"],
  "life-screwdriver": ["expanded", "50% 100%", "300% 600%"],
  "life-slippers": ["expanded", "100% 100%", "300% 600%"],
  "bedding-cover": ["bed-bath", "0% 0%"],
  "bedding-duvet": ["bed-bath", "50% 0%"],
  "bedding-pillow": ["bed-bath", "100% 0%"],
  "bedding-pad": ["bed-bath", "0% 100%"],
  "bath-towel": ["default", "0% 0%"],
  "bath-toiletries": ["default", "50% 0%"],
  "bath-toothbrush": ["bed-bath", "50% 100%"],
  "bath-mat": ["bed-bath", "100% 100%"],
  "bath-toilet-paper": ["cleaning", "0% 0%"],
  "life-powerstrip": ["default", "100% 0%"],
  "bedding-curtain": ["default", "0% 100%"],
  "life-storage": ["default", "50% 100%"],
  "kitchen-dishes": ["cooking", "100% 100%"],
  "kitchen-cutlery": ["cooking", "0% 0%"],
  "kitchen-bag": ["cooking", "50% 0%"],
  "kitchen-pot": ["cooking", "100% 0%"],
  "kitchen-pan": ["cooking", "0% 100%"],
  "kitchen-container": ["cooking", "50% 100%"],
  "laundry-detergent": ["drying", "0% 0%"],
  "bath-basket": ["drying", "50% 0%"],
  "laundry-dryer": ["drying", "100% 0%"],
  "laundry-net": ["drying", "0% 100%"],
  "laundry-softener": ["drying", "50% 100%"],
  "laundry-clips": ["drying", "100% 100%"],
  "laundry-bag": ["laundry-bag", "center", "cover"],
  "bedding-hanger": ["storage", "0% 0%"],
  "clean-wipes": ["cleaning", "50% 0%"],
  "clean-detergent": ["cleaning", "100% 0%"],
  "clean-broom": ["cleaning", "0% 100%"],
  "clean-gloves": ["cleaning", "50% 100%"],
  "clean-recycle": ["cleaning", "100% 100%"],
  "clean-trash": ["storage", "50% 100%"],
  "life-scissors": ["misc", "0% 0%"],
  "life-tape": ["misc", "50% 0%"],
  "life-umbrella": ["misc", "100% 0%"],
  "life-light": ["storage", "100% 100%"],
  "safe-door": ["misc", "0% 100%"],
  "safe-medicine": ["misc", "50% 100%"],
  "safe-flashlight": ["misc", "100% 100%"]
};

const detergentProducts = [
  { id: "downy", brand: "다우니", name: "다우니 세탁세제 탈취실내건조", company: "한국피앤지판매유한회사", machine: "일반·드럼 겸용", volume: 3.0, price: 23800, cost: 169, oil: 2, sebum: 2, blood: 2, allergens: 5, recycle: "우수", ph: "약알칼리성", indoor: true, position: "4% 22%", mobilePosition: "0% 22%" },
  { id: "liq", brand: "리큐", name: "리큐 진한겔 하이브리드 실내건조", company: "애경산업", machine: "드럼용", volume: 3.5, price: 13500, cost: 77, oil: 2, sebum: 2, blood: 2, allergens: 4, recycle: "우수", ph: "약알칼리성", indoor: true, position: "29% 22%", mobilePosition: "19% 22%" },
  { id: "beat", brand: "비트", name: "비트 실내건조 시트러스 블라썸", company: "라이온코리아", machine: "일반·드럼 겸용", volume: 2.8, price: 9900, cost: 78, oil: 1, sebum: 2, blood: 1, allergens: 2, recycle: "우수", ph: "약알칼리성", indoor: true, position: "54% 22%", mobilePosition: "56% 22%" },
  { id: "snuggle", brand: "스너글", name: "스너글 액체 세탁세제 블루스파클 플러스+실내건조", company: "유니레버코리아", machine: "일반·드럼 겸용", volume: 2.7, price: 23700, cost: 176, oil: 2, sebum: 2, blood: 2, allergens: 3, recycle: "보통", ph: "약알칼리성", indoor: true, position: "80% 22%", mobilePosition: "93% 22%" },
  { id: "acts", brand: "액츠", name: "액츠 퍼펙트 실내건조_비", company: "피죤", machine: "드럼용", volume: 3.0, price: 8350, cost: 56, oil: 2, sebum: 2, blood: 2, allergens: 1, recycle: "우수", ph: "약알칼리성", indoor: true, position: "4% 75%", mobilePosition: "0% 75%" },
  { id: "tech", brand: "테크", name: "테크 실내건조 베이직 뉴", company: "LG생활건강", machine: "드럼용", volume: 2.7, price: 11900, cost: 88, oil: 1, sebum: 2, blood: 2, allergens: 1, recycle: "우수", ph: "약알칼리성", indoor: true, position: "29% 75%", mobilePosition: "19% 75%" },
  { id: "persil", brand: "퍼실", name: "퍼실 퓨어프레쉬 플러스", company: "헨켈홈케어코리아", machine: "드럼용", volume: 2.7, price: 16600, cost: 123, oil: 2, sebum: 2, blood: 3, allergens: 5, recycle: "우수", ph: "중성", indoor: false, leakNote: "시험 대상 제조번호에서 뚜껑 누액이 확인돼 업체가 개선 계획을 회신했습니다.", position: "54% 75%", mobilePosition: "56% 75%" },
  { id: "fi-ji", brand: "피지", name: "피지 바이럭스 탈취 실내건조 오리지널", company: "LG생활건강", machine: "일반·드럼 겸용", volume: 2.7, price: 15900, cost: 118, oil: 2, sebum: 2, blood: 1, allergens: 5, recycle: "우수", ph: "약알칼리성", indoor: true, position: "80% 75%", mobilePosition: "93% 75%" }
];

const homePresetPreferences = {
  cooking: { cooking: "often" },
  drying: { drying: "indoor" },
  workout: { workout: "yes" },
  bedding: {},
  storage: { storage: "limited" }
};

function sortDetergentProducts(products, mode = "balanced", order = "match") {
  return [...products].sort((a, b) => {
    if (order === "cost") return a.cost - b.cost;
    if (order === "stain") return b.blood - a.blood || b.oil - a.oil || a.cost - b.cost;
    if (order === "oil") return b.oil - a.oil || a.cost - b.cost;
    if (order === "sebum") return b.sebum - a.sebum || a.cost - b.cost;
    if (order === "name") return a.brand.localeCompare(b.brand, "ko");
    if (mode === "indoor") return Number(b.indoor) - Number(a.indoor) || a.cost - b.cost;
    if (mode === "workout") return b.sebum - a.sebum || a.cost - b.cost;
    if (mode === "sensitive") return a.allergens - b.allergens || a.cost - b.cost;
    if (mode === "stains") return b.blood - a.blood || b.oil - a.oil || a.cost - b.cost;
    return detergentProducts.indexOf(a) - detergentProducts.indexOf(b);
  });
}

const detergentPerformanceLabel = (value) => ({ 3: "우수", 2: "양호", 1: "보통" }[value] || "미확인");
const detergentSortDescriptions = {
  cost: "세탁 1회당 세제 비용이 낮은 순입니다. 2025년 시험 가격 기준이며 현재 최저가가 아닙니다.",
  stain: "혈액·잉크, 기름·단백질 성능 순입니다. 성능이 같으면 1회당 비용이 낮은 순입니다.",
  oil: "기름·단백질 세척 성능 순입니다. 성능이 같으면 1회당 비용이 낮은 순입니다.",
  sebum: "피지 오염 성능은 8종 모두 양호입니다. 동률이므로 1회당 비용이 낮은 순입니다.",
  name: "브랜드 이름순으로 비교합니다."
};

function detergentPerformanceFacts(product) {
  return [["피지 오염", product.sebum], ["기름·단백질", product.oil], ["혈액·잉크", product.blood]]
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${detergentPerformanceLabel(value)}</dd></div>`).join("");
}

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

const purchasePlanCacheTtlMs = 30 * 24 * 60 * 60 * 1000;
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

function hasCompletedPurchasePlan(state) {
  return Boolean(
    state.purchasePlanCompletedAt
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
  delete nextState.recommendationFeedback;
  delete nextState.purchasePlanCompletedAt;
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

function getItemDecision(state, itemId) {
  if (state.checklist?.[itemId]) return "prepared";
  return state.recommendationDecisions?.[itemId] || "";
}

function getPurchasePlanCounts(state) {
  return Object.keys(recommendationCatalog).reduce((counts, itemId) => {
    const decision = getItemDecision(state, itemId);
    if (decision === "candidate") counts.needed += 1;
    else if (decision === "prepared") counts.prepared += 1;
    else if (decision === "later") counts.later += 1;
    else counts.undecided += 1;
    return counts;
  }, { needed: 0, prepared: 0, later: 0, undecided: 0 });
}

function saveItemDecision(itemId, nextDecision, preferencePatch = {}) {
  const state = readStoredState();
  const previousDecision = getItemDecision(state, itemId) || "review";
  const checklist = { ...(state.checklist || {}) };
  const recommendationDecisions = { ...(state.recommendationDecisions || {}) };

  if (nextDecision === "prepared") {
    checklist[itemId] = true;
    delete recommendationDecisions[itemId];
  } else {
    delete checklist[itemId];
    recommendationDecisions[itemId] = nextDecision;
  }

  const planPreferences = {
    ...planDefaults,
    ...(state.planPreferences && typeof state.planPreferences === "object" ? state.planPreferences : {}),
    ...preferencePatch
  };
  const nextState = {
    ...state,
    checklist,
    recommendationDecisions,
    planPreferences,
    purchasePlanCompletedAt: state.purchasePlanCompletedAt || Date.now()
  };
  writePurchasePlanState(nextState);
  return { previousDecision, state: nextState };
}

function writeBudgetState(state) {
  return writeStoredState({ ...state, budgetExpiresAt: Date.now() + budgetCacheTtlMs });
}

function schedulePurchasePlanExpiry(onExpire) {
  window.clearTimeout(purchasePlanExpiryTimer);
  const expiresAt = Number(readStoredState().purchasePlanExpiresAt);
  if (!expiresAt) return;

  const checkExpiry = () => {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      clearExpiredPurchasePlan(readStoredState());
      onExpire();
      return;
    }
    purchasePlanExpiryTimer = window.setTimeout(checkExpiry, Math.min(remaining + 50, 2_000_000_000));
  };

  checkExpiry();
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
    return `<a class="store-search-link store-coupang" href="https://www.coupang.com/np/search?q=${query}" target="_blank" rel="noreferrer" ${tracking} aria-label="쿠팡에서 ${searchQuery} 검색"><span>쿠팡</span><strong>상품 검색</strong></a>`;
  }
  if (store === "naver") {
    return `<a class="store-search-link store-naver" href="https://search.naver.com/search.naver?query=${query}" target="_blank" rel="noreferrer" ${tracking} aria-label="네이버에서 ${searchQuery} 통합검색"><span>네이버</span><strong>통합검색</strong></a>`;
  }
  if (store === "daiso") {
    return `<a class="store-search-link store-daiso" href="https://www.daisomall.co.kr/" target="_blank" rel="noreferrer" ${tracking}><span>다이소몰</span><strong>홈 열기</strong></a>`;
  }
  return `<a class="store-search-link store-ohouse" href="https://ohou.se/store" target="_blank" rel="noreferrer" ${tracking}><span>오늘의집</span><strong>스토어 열기</strong></a>`;
}

function setupHomePreview() {
  if (document.querySelector("#catalog")) return;
  const previewList = document.querySelector("#homePreviewList");
  const previewOptions = document.querySelector("#homePreviewOptions");
  const previewSummary = document.querySelector("#homePreviewSummary");
  const previewCta = document.querySelector("#homePreviewCta");
  const searchForm = document.querySelector("#homeCatalogSearch");
  const searchInput = document.querySelector("#homeCatalogQuery");
  const categoryTabs = document.querySelector("#homeCategoryTabs");
  const subgroupControls = document.querySelector("#homeSubgroups");
  const sortSelect = document.querySelector("#homeCatalogSort");
  const moreButton = document.querySelector("#homeCatalogMore");
  if (!previewList) return;
  let activePreset = "default";
  let activeCategory = "all";
  let activeSubgroup = "all";
  let searchTerm = "";
  let activeSort = "priority";
  let showAllItems = false;

  function defaultPreviewMeta(id) {
    const guidance = getItemGuidance(id, homePresetPreferences[activePreset] || {});
    const note = homePreviewPresets[activePreset].notes?.[id];
    if (note) guidance.reason = note;
    const labels = { now: ["now", "지금 필요", "기본 준비"], confirm: ["check", "조건 확인", "구매 전 확인"], later: ["later", "나중에", "필요할 때 추가"] };
    const [status, statusLabel, context] = labels[guidance.phase];
    return { ...guidance, status, statusLabel, context };
  }

  const offerInputs = new Map();
  let offerFreshness = "";
  let activeOfferGroup = new URLSearchParams(window.location.search).get("product") || "all";
  let showAllOffers = false;
  function renderProductComparison() {
    const section = document.querySelector("#homeProductComparison");
    if (!section) return;
    const query = searchTerm.trim().toLocaleLowerCase("ko");
    const subgroup = (catalogSubgroups[activeCategory] || []).find((group) => group.label === activeSubgroup);
    const available = ShoppingOffers.offers.filter((offer) => {
      const item = recommendationCatalog[offer.itemId];
      if (activeCategory !== "all" && item.category !== activeCategory) return false;
      if (subgroup && !subgroup.ids.includes(offer.itemId)) return false;
      if (query) return `${item.title} ${item.category} ${offer.brand} ${offer.name}`.toLocaleLowerCase("ko").includes(query);
      if (activeCategory !== "all") return true;
      if (["drying", "workout"].includes(activePreset)) return offer.itemId === "laundry-detergent";
      if (activePreset === "cooking") return ["먹거리", "주방"].includes(item.category);
      return activePreset === "default";
    });
    section.hidden = !available.length;
    if (!available.length) return;
    const groupIds = [...new Set(available.map((offer) => offer.itemId))];
    if (!groupIds.includes(activeOfferGroup)) activeOfferGroup = "all";
    const groupSelect = document.querySelector("#homeOfferGroup");
    groupSelect.innerHTML = '<option value="all">전체 품목</option>' + groupIds.map((id) => `<option value="${id}">${recommendationCatalog[id].title}</option>`).join("");
    groupSelect.value = activeOfferGroup;
    const filtered = available.filter((offer) => activeOfferGroup === "all" || offer.itemId === activeOfferGroup);
    const comparable = new Set(filtered.map((offer) => offer.itemId)).size === 1;
    const sortControl = document.querySelector("#homeProductSort");
    sortControl.querySelector('[value="unit"]').disabled = !comparable;
    sortControl.querySelector('[value="unit"]').textContent = comparable ? `${ShoppingOffers.unitLabel(filtered[0])} 가격 낮은 순` : "품목 선택 후 단가순";
    if (!comparable && sortControl.value === "unit") sortControl.value = "match";
    const mode = activePreset === "workout" ? "workout" : activePreset === "drying" ? "indoor" : "balanced";
    const order = sortControl.value;
    const now = Date.now();
    offerFreshness = ShoppingOffers.offers.map((offer) => ShoppingOffers.fresh(offer, now)).join();
    let ordered = ShoppingOffers.sort(filtered, order, now);
    if (order === "match" && !comparable) {
      const first = new Set();
      const leaders = ordered.filter((o) => !first.has(o.itemId) && first.add(o.itemId));
      ordered = [...leaders, ...ordered.filter((o) => !leaders.includes(o))];
    }
    const visibleOffers = showAllOffers ? ordered : ordered.slice(0, 6);
    const staleCount = filtered.filter((offer) => !ShoppingOffers.fresh(offer, now)).length;
    document.querySelector("#homeProductTitle").textContent = comparable ? `${recommendationCatalog[filtered[0].itemId].title} 가격·구성 비교` : "먹거리·생활용품 가격 비교";
    document.querySelector("#homeProductBasis").textContent = `판매 옵션 ${filtered.length}개 중 ${visibleOffers.length}개${staleCount ? ` · 가격 재확인 ${staleCount}개` : ""} · 최저가·인기 순위가 아닙니다.`;
    const more = document.querySelector("#homeOffersMore");
    more.hidden = visibleOffers.length === filtered.length;
    more.textContent = `나머지 ${filtered.length - visibleOffers.length}개 더 보기`;
    document.querySelector("#homeProductPicks").innerHTML = visibleOffers.map((offer) => {
      const fresh = ShoppingOffers.fresh(offer, now);
      const isDetergent = offer.itemId === "laundry-detergent";
      const pack = isDetergent ? `${offer.volumeMl / 1000}L × ${offer.count}개 · ${offer.pack}` : offer.pack;
      const tracking = `data-store-link data-store="coupang" data-item-id="${offer.id}" data-placement="home_product"`;
      const checked = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).format(new Date(offer.checkedAt));
      return `<article class="home-product-pick" data-product-pick="${offer.id}">
        <a class="home-pick-image" href="${offer.url}" target="_blank" rel="noopener noreferrer" ${tracking}><img src="${offer.image}" alt="${offer.brand} ${offer.name} ${pack}" width="180" height="180" /></a>
        <div class="home-pick-copy"><p class="home-pick-brand">${offer.brand} · ${offer.machine || recommendationCatalog[offer.itemId].title}</p><h3>${offer.name}</h3>
          <p class="home-pick-option">${pack}</p>
          <p class="home-pick-cost">${fresh ? `<strong>${offer.price.toLocaleString("ko-KR")}<small>원</small></strong>` : `<strong class="offer-stale">판매처 가격 확인</strong>`}</p>
          ${fresh ? `<p class="home-pick-unit">${ShoppingOffers.unitLabel(offer)} <b>${Math.round(ShoppingOffers.unitPrice(offer)).toLocaleString("ko-KR")}원</b></p>${offer.itemId.startsWith("food-") ? `<p class="home-pick-unit">개당 약 ${Math.round(offer.price / offer.count).toLocaleString("ko-KR")}원</p>` : ""}` : ""}
          <p class="home-pick-price-basis">${checked} 판매가 확인${fresh ? "" : " · 재확인 필요"}</p>
          <p class="home-pick-note">${offer.note}</p>
        </div>
        <div class="home-pick-links"><a href="${offer.url}" target="_blank" rel="noopener noreferrer" ${tracking}>쿠팡에서 상품 보기 <span aria-hidden="true">↗</span></a></div>
        ${isDetergent ? `<details class="offer-calculator"><summary>1회당 세제비 계산</summary>
          <label for="price-${offer.id}">구매 금액 (원)</label><input id="price-${offer.id}" data-offer-price type="number" inputmode="numeric" min="1" max="10000000" step="1" />
          <label for="dose-${offer.id}">1회 사용량 (ml)</label><input id="dose-${offer.id}" data-offer-dose type="number" inputmode="decimal" min="0.1" max="${offer.volumeMl}" step="0.1" placeholder="용기 표기 사용량" />
          <output aria-live="polite">사용량을 입력해 주세요.</output>
          <small>입력 금액 ÷ 총 용량 × 사용량 · 전기·수도 제외</small>
        </details>` : `<a class="home-pick-detail" href="/item?id=${offer.itemId}">규격·구매 기준 보기 →</a>`}
      </article>`;
    }).join("");
    document.querySelectorAll("#homeProductPicks article").forEach((card) => {
      const offer = ShoppingOffers.offers.find((item) => item.id === card.dataset.productPick);
      if (!card.querySelector("[data-offer-price]")) return;
      const saved = offerInputs.get(offer.id);
      card.querySelector("[data-offer-price]").value = saved?.price ?? (ShoppingOffers.fresh(offer, now) ? offer.price : "");
      card.querySelector("[data-offer-dose]").value = saved?.dose ?? "";
      card.querySelector("details").open = saved?.open || false;
      updateOfferCalculation(card, false);
    });
    document.querySelector("#homeProductAll").href = `/item?id=laundry-detergent&mode=${mode}#detergentCompare`;
    const hasDetergent = filtered.some((offer) => offer.itemId === "laundry-detergent");
    document.querySelector("#homeProductAll").hidden = !hasDetergent;
    document.querySelector("#homePerformanceNote").hidden = !hasDetergent;
  }

  function updateOfferCalculation(card, save = true) {
    const offer = ShoppingOffers.offers.find((item) => item.id === card.dataset.productPick);
    const price = card.querySelector("[data-offer-price]");
    const dose = card.querySelector("[data-offer-dose]");
    const result = ShoppingOffers.cost(offer, Number(price.value), Number(dose.value));
    card.querySelector("output").textContent = result === null || !price.validity.valid || !dose.validity.valid
      ? "구매 금액과 용기 표기 사용량을 확인해 주세요."
      : `세탁 1회당 약 ${result.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}원`;
    if (save) offerInputs.set(offer.id, { price: price.value, dose: dose.value, open: card.querySelector("details").open });
  }
  document.querySelector("#homeProductPicks")?.addEventListener("input", (event) => {
    const card = event.target.closest("[data-product-pick]");
    if (card) updateOfferCalculation(card);
  });
  document.querySelector("#homeOfferGroup")?.addEventListener("change", (event) => {
    activeOfferGroup = event.target.value;
    showAllOffers = false;
    renderProductComparison();
  });
  document.querySelector("#homeOffersMore")?.addEventListener("click", () => {
    showAllOffers = true;
    renderProductComparison();
  });
  // Refresh only on expiry so typing and sorting do not silently renew observed prices.
  window.setInterval(() => {
    if (offerFreshness !== ShoppingOffers.offers.map((offer) => ShoppingOffers.fresh(offer)).join()) renderProductComparison();
  }, 60000);

  function catalogItems() {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase("ko");
    const isBrowsingCatalog = Boolean(normalizedSearch || activeCategory !== "all");
    const source = Object.entries(recommendationCatalog).map(([id, item]) => ({ id, ...item, ...defaultPreviewMeta(id) }));
    const presetOrder = new Map(homePreviewPresets[activePreset].items.map(({ id }, index) => [id, index]));

    const filtered = source.filter((item) => {
      const categoryMatches = activeCategory === "all" || item.category === activeCategory;
      const subgroup = (catalogSubgroups[activeCategory] || []).find((group) => group.label === activeSubgroup);
      const subgroupMatches = !subgroup || subgroup.ids.includes(item.id);
      const offerNames = ShoppingOffers.offers.filter((offer) => offer.itemId === item.id).map((offer) => `${offer.brand} ${offer.name}`).join(" ");
      const searchMatches = !normalizedSearch || `${item.title} ${item.category} ${offerNames}`.toLocaleLowerCase("ko").includes(normalizedSearch);
      return categoryMatches && subgroupMatches && searchMatches;
    });

    return filtered.sort((a, b) => {
      if (activeSort === "name") return a.title.localeCompare(b.title, "ko");
      if (activeSort === "first-day") return Number(b.phase === "now") - Number(a.phase === "now") || b.weight - a.weight || a.title.localeCompare(b.title, "ko");
      if (!isBrowsingCatalog) {
        const aPreset = presetOrder.has(a.id) ? presetOrder.get(a.id) : Number.MAX_SAFE_INTEGER;
        const bPreset = presetOrder.has(b.id) ? presetOrder.get(b.id) : Number.MAX_SAFE_INTEGER;
        if (aPreset !== bPreset) return aPreset - bPreset;
      }
      return b.weight - a.weight || Number(b.firstDay) - Number(a.firstDay) || a.title.localeCompare(b.title, "ko");
    });
  }

  function syncCategoryTabs() {
    categoryTabs?.querySelectorAll("[data-home-category]").forEach((button) => {
      const selected = button.dataset.homeCategory === activeCategory;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    const groups = catalogSubgroups[activeCategory] || [];
    if (!subgroupControls) return;
    subgroupControls.hidden = !groups.length;
    subgroupControls.innerHTML = groups.length ? `<label>세부 품목<select id="homeSubgroupSelect"><option value="all">${activeCategory} 전체</option>${groups.map((group) => `<option value="${group.label}"${activeSubgroup === group.label ? " selected" : ""}>${group.label} (${group.ids.length})</option>`).join("")}</select></label><p id="homeSubgroupCriteria"></p>` : "";
    if (groups.length) document.querySelector("#homeSubgroupCriteria").textContent = groups.find((group) => group.label === activeSubgroup)?.criteria || "";
  }

  function renderPreview() {
    const preset = homePreviewPresets[activePreset] || homePreviewPresets.default;
    const items = catalogItems();
    const isBrowsingCatalog = Boolean(searchTerm.trim() || activeCategory !== "all");
    const displayedItems = isBrowsingCatalog || showAllItems ? items : items.slice(0, 6);
    renderProductComparison();
    previewList.innerHTML = "";
    if (previewSummary) {
      if (searchTerm.trim()) previewSummary.textContent = `“${searchTerm.trim()}” 검색 결과 ${items.length}개를 모두 보여 드립니다.`;
      else if (activeCategory !== "all") previewSummary.textContent = `${activeSubgroup === "all" ? activeCategory : activeSubgroup} 준비물 ${items.length}개를 모두 보여 드립니다.`;
      else if (showAllItems) previewSummary.textContent = `생활 방식에 맞춘 준비물 ${items.length}개를 모두 보여 드립니다.`;
      else previewSummary.textContent = preset.summary;
    }
    if (moreButton) {
      moreButton.hidden = isBrowsingCatalog || items.length <= 6;
      moreButton.textContent = showAllItems ? "대표 6개만 보기" : `${items.length}개 전체 보기`;
      moreButton.setAttribute("aria-expanded", String(showAllItems));
    }
    const storedState = readStoredState();
    const planCounts = getPurchasePlanCounts(storedState);
    const decidedCount = planCounts.needed + planCounts.prepared + planCounts.later;
    if (previewCta) {
      previewCta.href = decidedCount
        ? "/recommend"
        : activePreset === "default" ? "/checklist" : `/checklist?homePreset=${activePreset}`;
      previewCta.textContent = decidedCount ? `${decidedCount}개 내 준비표 보기` : "내 준비표 만들기";
      previewCta.dataset.preset = activePreset;
    }

    if (!items.length) {
      previewList.innerHTML = '<p class="home-catalog-empty">일치하는 준비물이 없습니다. 다른 이름이나 카테고리로 찾아보세요.</p>';
      return;
    }

    displayedItems.forEach((item) => {
      const { id, status, statusLabel, context } = item;
      const { reason, criteria, searchQuery } = item;
      const imageGroup = id.split("-")[0];
      const productImage = homeProductImages[id];
      const imageInfo = homeImageStyleForItem(id);
      const imageStyle = imageInfo
        ? ` style="--product-image: url('${imageInfo.url}'); --product-image-position: ${imageInfo.position}; --product-image-size: ${imageInfo.size}"`
        : "";
      const storeActions = item.stores.map((store) => createStoreSearchLink(store, searchQuery, id, "home_catalog")).join("");
      const card = document.createElement("article");
      card.className = "home-preview-item";
      card.innerHTML = `
        <a class="home-product-detail-link" href="/item?id=${encodeURIComponent(id)}" data-product-detail="${id}" aria-label="${item.title} 구매 기준 보기">
          <div class="home-product-image home-product-image-${imageGroup}${productImage ? " has-item-image" : " is-item-placeholder"}"${imageStyle} role="img" aria-label="${item.title} 품목 예시 이미지">
            ${productImage ? "" : `<span>${item.title}</span>`}
          </div>
        </a>
        <div class="home-preview-copy">
          <div class="home-preview-meta"><span>${item.category}</span><b class="home-preview-status-${status}">${statusLabel} · ${context}</b></div>
          <h3><a href="/item?id=${encodeURIComponent(id)}" data-product-detail="${id}">${item.title}</a></h3>
          <p>${reason}</p>
          <small>${criteria}</small>
          <a class="item-detail-cta" href="/item?id=${encodeURIComponent(id)}" data-product-detail="${id}">${id === "laundry-detergent" ? "8개 제품 비교" : "구매 기준 보기"}<span aria-hidden="true">→</span></a>
          <div class="home-preview-stores"><em>${itemGuidance[id].search ? "관련 정보 확인" : "판매처에서 최신 가격 확인"}</em><div class="home-preview-store-actions">${storeActions}</div></div>
        </div>
      `;
      previewList.append(card);
    });
  }

  previewOptions?.addEventListener("change", (event) => {
    const input = event.target.closest("input[name='homePreset']");
    if (!input) return;
    activePreset = Object.hasOwn(homePreviewPresets, input.value) ? input.value : "default";
    activeOfferGroup = "all";
    showAllOffers = false;
    activeCategory = "all";
    activeSubgroup = "all";
    searchTerm = "";
    showAllItems = false;
    if (searchInput) searchInput.value = "";
    syncCategoryTabs();
    renderPreview();
    trackAnalyticsEvent("home_demo_select", { preset: input.value });
  });

  document.querySelector("#homeProductSort")?.addEventListener("change", (event) => {
    renderProductComparison();
    trackAnalyticsEvent("product_sort", { item_id: activeOfferGroup, sort: event.target.value, placement: "home_product", filter: activePreset });
  });

  searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    searchTerm = searchInput?.value || "";
    renderPreview();
    trackAnalyticsEvent("home_catalog_search", { query_length: searchTerm.trim().length, result_count: catalogItems().length });
  });

  searchInput?.addEventListener("input", () => {
    searchTerm = searchInput.value;
    renderPreview();
  });

  categoryTabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-home-category]");
    if (!button) return;
    activeCategory = button.dataset.homeCategory || "all";
    activeOfferGroup = "all";
    showAllOffers = false;
    activeSubgroup = "all";
    syncCategoryTabs();
    renderPreview();
    trackAnalyticsEvent("home_catalog_category", { category: activeCategory });
  });

  subgroupControls?.addEventListener("change", (event) => {
    if (event.target.id !== "homeSubgroupSelect") return;
    activeSubgroup = event.target.value;
    const group = (catalogSubgroups[activeCategory] || []).find((entry) => entry.label === activeSubgroup);
    document.querySelector("#homeSubgroupCriteria").textContent = group?.criteria || "";
    renderPreview();
    trackAnalyticsEvent("home_catalog_subgroup", { category: activeCategory, subgroup: activeSubgroup });
  });

  sortSelect?.addEventListener("change", () => {
    activeSort = sortSelect.value;
    renderPreview();
    trackAnalyticsEvent("home_catalog_sort", { sort: activeSort });
  });

  moreButton?.addEventListener("click", () => {
    showAllItems = !showAllItems;
    renderPreview();
    if (!showAllItems) previewList.scrollIntoView({ behavior: "smooth", block: "start" });
    trackAnalyticsEvent("home_catalog_expand", { expanded: showAllItems });
  });

  syncCategoryTabs();
  renderPreview();
  schedulePurchasePlanExpiry(() => window.location.reload());
}

function homeImageStyleForItem(id) {
  const image = homeProductImages[id];
  if (!image) return null;
  return {
    url: image[3] === "direct" ? image[0] : `/assets/${image[2] ? "home-item" : "home-items"}-${image[0]}.webp`,
    position: image[1],
    size: image[2] || "300% 200%"
  };
}

function setupItemDetail() {
  const title = document.querySelector("#itemTitle");
  if (!title) return;

  const params = new URLSearchParams(window.location.search);
  const itemId = params.get("id") || "laundry-detergent";
  const item = recommendationCatalog[itemId];
  const category = document.querySelector("#itemCategory");
  const reason = document.querySelector("#itemReason");
  const criteria = document.querySelector("#itemCriteria");
  const heroImage = document.querySelector("#itemHeroImage");
  const storeActions = document.querySelector("#itemStoreActions");
  const detergentCompare = document.querySelector("#detergentCompare");

  if (!item) {
    title.textContent = "준비물을 찾을 수 없습니다.";
    reason.textContent = "전체 준비물에서 다시 선택해 주세요.";
    document.title = "준비물을 찾을 수 없습니다 | 자취도우미";
    return;
  }

  const guidance = getItemGuidance(itemId);
  const image = homeImageStyleForItem(itemId);
  category.textContent = item.category;
  title.textContent = item.title;
  reason.textContent = guidance.reason;
  criteria.textContent = guidance.criteria;
  document.title = `${item.title} 구매 기준 | 자취도우미`;
  heroImage.setAttribute("aria-label", `${item.title} 품목 예시 이미지`);
  if (image) {
    heroImage.style.backgroundImage = `url('${image.url}')`;
    heroImage.style.backgroundPosition = image.position;
    heroImage.style.backgroundSize = image.size;
  } else {
    heroImage.textContent = item.title;
  }
  storeActions.innerHTML = guidance.stores.map((store) => createStoreSearchLink(store, guidance.searchQuery, itemId, "item_detail")).join("");
  if (homeProductImages[itemId]?.[3] === "direct") {
    storeActions.insertAdjacentHTML("afterbegin", `<a class="button" href="/?product=${itemId}#catalog">상품·구성 보기</a>`);
  }
  detergentCompare.hidden = itemId !== "laundry-detergent";
  trackAnalyticsEvent("product_detail_view", { item_id: itemId, category: item.category });

  if (itemId === "laundry-detergent") setupDetergentComparison();
}

function setupDetergentComparison() {
  const grid = document.querySelector("#detergentGrid");
  const modes = document.querySelector("#detergentModes");
  const sort = document.querySelector("#detergentSort");
  const explanation = document.querySelector("#detergentExplanation");
  const savedCount = document.querySelector("#detergentSavedCount");
  if (!grid || !modes || !sort || !explanation || !savedCount) return;

  const savedKey = "jachi-helper:detergent-comparison:v1";
  const requested = new URLSearchParams(location.search);
  let activeMode = ["balanced", "indoor", "workout", "sensitive", "stains"].includes(requested.get("mode")) ? requested.get("mode") : "balanced";
  if (["match", "cost", "stain", "oil", "sebum", "name"].includes(requested.get("sort"))) sort.value = requested.get("sort");
  modes.querySelectorAll("[data-laundry-mode]").forEach((button) => {
    const selected = button.dataset.laundryMode === activeMode;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(savedKey) || "[]"); } catch { saved = []; }

  const performanceLabel = detergentPerformanceLabel;
  const modeCopy = {
    balanced: "제품별 차이를 먼저 살펴보세요. 특정 종합 1위를 만들지 않고 시험 항목을 나란히 보여 드립니다.",
    indoor: "시험 대상 중 제품명에 실내건조가 표시된 제품을 먼저 봅니다. 이 시험은 건조 냄새 제거 효과를 별도로 순위화하지 않았습니다.",
    workout: "운동복과 관련된 피지 오염 성능은 8종 모두 ‘양호’였습니다. 세탁기 호환과 1회당 비용을 함께 비교하세요.",
    sensitive: "제품에 표시된 알레르기 반응가능물질 종류가 적은 순서로 봅니다. 종류 수가 적다고 저자극을 보장하지는 않습니다.",
    stains: "혈액·잉크와 기름·단백질 오염 시험 결과가 높은 제품을 먼저 봅니다."
  };

  function sortProducts(products) {
    return sortDetergentProducts(products, activeMode, sort.value);
  }

  function reasonFor(product) {
    if (activeMode === "indoor") return product.indoor ? "제품명에 실내건조가 표시된 시험 제품" : "실내건조 표기 없음 · 다른 시험 항목으로 비교";
    if (activeMode === "workout") return `피지 오염 ${performanceLabel(product.sebum)} · ${product.machine}`;
    if (activeMode === "sensitive") return `표시된 알레르기 반응가능물질 ${product.allergens}종`;
    if (activeMode === "stains") return `혈액·잉크 ${performanceLabel(product.blood)} · 기름·단백질 ${performanceLabel(product.oil)}`;
    return `피지 오염 ${performanceLabel(product.sebum)} · ${product.machine}`;
  }

  function render() {
    explanation.innerHTML = `<strong>${sort.value === "match" ? modes.querySelector(".is-selected")?.textContent || "조건 비교" : sort.selectedOptions[0].textContent}</strong><p>${detergentSortDescriptions[sort.value] || modeCopy[activeMode]}</p>`;
    savedCount.textContent = `비교함 ${saved.length}개`;
    grid.innerHTML = sortProducts(detergentProducts).map((product) => {
      const isSaved = saved.includes(product.id);
      const storeLinks = ["coupang", "naver"].map((store) => createStoreSearchLink(store, product.name, `detergent-${product.id}`, "product_compare")).join("");
      return `
        <article class="detergent-card" id="detergent-${product.id}">
          <div class="detergent-photo"><img src="/assets/detergents/${product.id}.webp" alt="${product.name} 한국소비자원 시험 대상 제품" /></div>
          <div class="detergent-card-body">
            <div class="detergent-brand-row"><span>${product.brand}</span><button type="button" class="save-product${isSaved ? " is-saved" : ""}" data-save-detergent="${product.id}" aria-pressed="${isSaved}">${isSaved ? "비교함 저장됨" : "비교함 담기"}</button></div>
            <h3>${product.name}</h3>
            <p class="detergent-match">${reasonFor(product)}</p>
            <dl class="detergent-facts">
              <div><dt>용량</dt><dd>${product.volume.toFixed(1)}L</dd></div>
              <div><dt>세탁기</dt><dd>${product.machine}</dd></div>
              ${detergentPerformanceFacts(product)}
              <div><dt>표시 알레르기 반응가능물질</dt><dd>${product.allergens}종</dd></div>
              <div><dt>액성</dt><dd>${product.ph}</dd></div>
              <div><dt>용기 재활용 용이성</dt><dd>${product.recycle}</dd></div>
            </dl>
            <details class="detergent-data-note"><summary>2025년 비교자료의 비용 기준</summary><p>세탁 1회당 ${product.cost.toLocaleString("ko-KR")}원 · 자료 기준 제품 가격 ${product.price.toLocaleString("ko-KR")}원. 드럼세탁기·세탁물 3kg 기준이며 현재 판매가가 아닙니다.</p></details>
            <p class="detergent-data-note">탈취·항균·운동복 소재 적합성은 이 자료로 판단하지 않습니다. 표시 성분 수가 적어도 저자극을 보장하지 않습니다.</p>
            ${product.leakNote ? `<p class="detergent-caution">${product.leakNote}</p>` : ""}
            <div class="detergent-store-actions">${storeLinks}</div>
          </div>
        </article>`;
    }).join("");
  }

  modes.addEventListener("click", (event) => {
    const button = event.target.closest("[data-laundry-mode]");
    if (!button) return;
    activeMode = button.dataset.laundryMode;
    modes.querySelectorAll("[data-laundry-mode]").forEach((modeButton) => {
      const selected = modeButton === button;
      modeButton.classList.toggle("is-selected", selected);
      modeButton.setAttribute("aria-pressed", String(selected));
    });
    render();
    trackAnalyticsEvent("product_filter_select", { item_id: "laundry-detergent", filter: activeMode });
  });

  sort.addEventListener("change", () => {
    render();
    trackAnalyticsEvent("product_sort", { item_id: "laundry-detergent", sort: sort.value, filter: activeMode });
  });

  grid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-save-detergent]");
    if (!button) return;
    const id = button.dataset.saveDetergent;
    saved = saved.includes(id) ? saved.filter((savedId) => savedId !== id) : [...saved, id];
    localStorage.setItem(savedKey, JSON.stringify(saved));
    render();
    trackAnalyticsEvent("product_save", { item_id: `detergent-${id}`, saved: saved.includes(id) });
  });

  render();
}

function setupProductDetailTracking() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-product-detail]");
    if (!link) return;
    queueAnalyticsEvent("product_detail_click", { item_id: link.dataset.productDetail, placement: "home_catalog" });
  });
}

function setupServiceTracking() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-service-link]");
    if (!link) return;
    trackAnalyticsEvent("service_outbound", { service: link.dataset.serviceLink, transport_type: "beacon" });
  });
}

function setupHomeShare() {
  const button = document.querySelector("#shareHome");
  if (!button) return;

  button.addEventListener("click", async () => {
    const shareUrl = `${window.location.origin}/?utm_source=share&utm_medium=referral&utm_campaign=first_home_plan`;
    const shareData = {
      title: "자취도우미",
      text: `첫 자취 준비물 ${Object.keys(recommendationCatalog).length}개에서 이미 가진 물건을 빼고 구매 계획을 정리해 보세요.`,
      url: shareUrl
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareData.text} ${shareUrl}`);
        button.textContent = "공유 링크 복사됨";
        window.setTimeout(() => { button.textContent = "친구에게 공유"; }, 1800);
      }
      trackAnalyticsEvent("home_share", { method: navigator.share ? "native" : "clipboard" });
    } catch {
      // Closing the native share sheet is not an error that should interrupt the page.
    }
  });
}

function setupHomeCtaTracking() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-home-cta]");
    if (!link) return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    queueAnalyticsEvent("home_cta_click", {
      placement: link.dataset.homeCta || "unknown",
      preset: link.dataset.preset || "none",
      destination: new URL(link.href, window.location.origin).pathname,
      source_path: window.location.pathname,
      transport_type: "beacon"
    });
  });
}

function setupHomeReturnState() {
  const heroCta = document.querySelector("#heroPrimaryCta");
  const resumeNote = document.querySelector("#homeResumeNote");
  if (!heroCta || !resumeNote) return;

  const state = readStoredState();
  const hasSavedPlan = Boolean(state.purchasePlanExpiresAt && hasPurchasePlanData(state));
  if (!hasSavedPlan) return;

  if (hasCompletedPurchasePlan(state)) {
    const counts = getPurchasePlanCounts(state);
    heroCta.href = "/recommend";
    heroCta.textContent = "내 준비표 이어보기";
    heroCta.dataset.homeCta = "resume_result";
    resumeNote.textContent = `필요함 ${counts.needed}개 · 이미 있음 ${counts.prepared}개 · 나중에 ${counts.later}개 · 미결정 ${counts.undecided}개`;
    return;
  }

  heroCta.href = "/checklist";
  heroCta.textContent = "작성 중인 목록 이어서 만들기";
  heroCta.dataset.homeCta = "resume_draft";
  const selectedCount = Object.values(state.checklist || {}).filter(Boolean).length;
  const preferences = state.planPreferences || {};
  const answeredCount = [preferences.cooking, preferences.drying, preferences.storage].filter(Boolean).length;
  resumeNote.textContent = `보유품 ${selectedCount}개 선택 · 생활 조건 ${answeredCount}/3 완료 · 이 기기에 30일 동안 저장`;
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
  const requestedParams = new URLSearchParams(window.location.search);
  const requestedPurchaseBudget = parseCurrency(requestedParams.get("purchaseBudget"));
  const requestedHomePreset = homePresetPreferences[requestedParams.get("homePreset")]
    ? requestedParams.get("homePreset")
    : "";
  const requestedPreferences = homePresetPreferences[requestedHomePreset] || {};
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
  const trackedPlanSteps = new Set();

  function trackPlanStart(source = "checklist") {
    if (hasTrackedPlanStart) return;
    hasTrackedPlanStart = true;
    trackAnalyticsEvent("plan_start", { flow: "purchase_plan", source });
  }

  function trackPlanStep(step, parameters = {}) {
    if (trackedPlanSteps.has(step)) return;
    trackedPlanSteps.add(step);
    trackAnalyticsEvent("plan_step_complete", { flow: "purchase_plan", step, ...parameters });
  }

  if (form) {
    Object.entries(planDefaults).forEach(([name, fallback]) => {
      const input = form.elements[name];
      const value = name === "purchaseBudget" && requestedPurchaseBudget
        ? requestedPurchaseBudget
        : requestedPreferences[name] ?? savedPlan[name] ?? fallback ?? "";
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
    const currentState = readStoredState();
    const recommendationDecisions = { ...(currentState.recommendationDecisions || {}) };
    Object.keys(checks).forEach((itemId) => {
      if (checks[itemId]) delete recommendationDecisions[itemId];
    });
    const nextState = { ...currentState, checklist: checks, recommendationDecisions, planPreferences: getPlanPreferences() };
    storageNote.textContent = writePurchasePlanState(nextState) ? "선택은 마지막 수정부터 30일 동안 이 기기에 저장됩니다." : "이 브라우저에서는 저장할 수 없습니다.";
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
        trackPlanStep("owned", {
          selected_count: Object.values(checks).filter(Boolean).length,
          completion_method: "item_selection"
        });
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
    const preferences = getPlanPreferences();
    const answeredConditions = [preferences.cooking, preferences.drying, preferences.storage].filter(Boolean).length;
    if (answeredConditions === 3) trackPlanStep("conditions", { answered_conditions: answeredConditions });
  });
  form?.addEventListener("submit", () => {
    saveChecklist();
    writePurchasePlanState({ ...readStoredState(), purchasePlanCompletedAt: Date.now() });
    trackPlanStep("owned", {
      selected_count: Object.values(checks).filter(Boolean).length,
      completion_method: "form_submit"
    });
    trackPlanStep("conditions", { answered_conditions: 3, completion_method: "form_submit" });
    if (hasTrackedPlanComplete) return;
    hasTrackedPlanComplete = true;
    const preferences = getPlanPreferences();
    queueAnalyticsEvent("plan_complete", {
      owned_count: Object.values(checks).filter(Boolean).length,
      answered_conditions: [preferences.cooking, preferences.drying, preferences.storage].filter(Boolean).length,
      has_purchase_budget: preferences.purchaseBudget ? 1 : 0,
      entry_preset: requestedHomePreset || "none",
      transport_type: "beacon"
    });
  });

  resetButton?.addEventListener("click", () => {
    Object.keys(checks).forEach((id) => { checks[id] = false; });
    form?.reset();
    renderOwnedPicker();
    const nextState = { ...readStoredState(), checklist: checks, planPreferences: getPlanPreferences() };
    delete nextState.recommendationDecisions;
    delete nextState.recommendationFeedback;
    delete nextState.purchasePlanCompletedAt;
    delete nextState.purchasePlanExpiresAt;
    storageNote.textContent = writeStoredState(nextState) ? "선택과 구매 결정을 초기화했습니다." : "이 브라우저에서는 저장할 수 없습니다.";
  });

  if (requestedHomePreset) {
    trackPlanStart("home_demo");
    saveChecklist();
  }
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
  let hasTrackedResultView = false;
  let hasTrackedEmptyResult = false;
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
    const guidance = getItemGuidance(id, preferences);
    const compactMatch = preferences.storage === "limited" && item.compact;
    if (item.firstDay) score += 32;
    if (guidance.conditionMatched) score += 24;
    if (compactMatch) score += 14;

    return {
      id,
      ...item,
      score,
      ...guidance
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
      <div class="match-actions"><span>${itemGuidance[item.id].search ? "관련 정보를 검색해 필요한 조건을 확인하세요." : "판매처에서 제품 구성, 배송비와 최신 가격을 직접 확인하세요."}</span>${storeLinks(item)}</div>
    `;
    return card;
  }

  function updatePurchasePlan(ranked, savedChecks, preferences) {
    if (!purchasePlanSummary || !purchasePlanStatus || !filterPurchasePlan) return;
    const needed = ranked.filter((item) => item.decision === "candidate");
    const later = ranked.filter((item) => item.decision === "later");
    const ownedCount = Object.values(savedChecks).filter(Boolean).length;
    const budgetPrefix = preferences.purchaseBudget
      ? `구매 예산 메모 ${formatWon(preferences.purchaseBudget)} · `
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
    const hasSavedPlan = Boolean(storedState.purchasePlanExpiresAt && hasPurchasePlanData(storedState));

    if (!hasSavedPlan) {
      resultIntro?.setAttribute("hidden", "");
      resultSection?.setAttribute("hidden", "");
      methodSection?.setAttribute("hidden", "");
      startSection?.removeAttribute("hidden");
      if (!hasTrackedEmptyResult) {
        hasTrackedEmptyResult = true;
        trackAnalyticsEvent("recommend_empty_view", { reason: "no_saved_plan" });
      }
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
      .map((item) => ({ ...item, ...getItemGuidance(item.id, preferences, item.decision) }))
      .sort((a, b) => {
        const phaseOrder = { now: 0, confirm: 1, later: 2 };
        const decisionOrder = { candidate: 0, review: 1, later: 2 };
        const phaseDifference = phaseOrder[a.phase] - phaseOrder[b.phase];
        if (phaseDifference) return phaseDifference;
        return decisionOrder[a.decision] - decisionOrder[b.decision] || b.score - a.score || a.title.localeCompare(b.title, "ko");
      });
    if (!hasTrackedResultView) {
      hasTrackedResultView = true;
      trackAnalyticsEvent("recommend_result_view", {
        result_count: allRanked.length,
        owned_count: Object.values(savedChecks).filter(Boolean).length,
        answered_conditions: [preferences.cooking, preferences.drying, preferences.storage].filter(Boolean).length,
        rule_version: recommendationRuleVersion
      });
    }
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
      if (preferences.purchaseBudget) labels.push(`구매 예산 메모 ${formatWon(preferences.purchaseBudget)}`);
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

    note.textContent = "가격은 판매처마다 수시로 달라 이 화면에 추정값을 표시하지 않습니다. 제품 구성과 최신 가격은 판매처에서 확인하고, 선택한 상태는 내 준비표에 저장됩니다.";
  }

  results.addEventListener("click", (event) => {
    const button = event.target.closest("[data-recommendation-decision]");
    if (!button) return;
    const itemId = button.dataset.itemId;
    const nextDecision = button.dataset.recommendationDecision;
    const { previousDecision } = saveItemDecision(itemId, nextDecision);

    trackAnalyticsEvent("recommendation_decision", {
      item_id: itemId,
      category: recommendationCatalog[itemId]?.category || "unknown",
      decision: nextDecision,
      previous_decision: previousDecision,
      rule_version: recommendationRuleVersion
    });
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

function setupPlanResultNavigation() {
  const state = readStoredState();
  const hasSavedPlan = Boolean(state.purchasePlanExpiresAt && hasPurchasePlanData(state));
  document.querySelectorAll("[data-plan-results-link], [data-plan-result-route]").forEach((link) => {
    link.hidden = false;
    link.href = hasSavedPlan ? "/recommend" : "/checklist";
  });
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
    const state = readStoredState();
    const hasSavedPlan = Boolean(state.purchasePlanExpiresAt && hasPurchasePlanData(state));
    recommendLink.href = setupBudget ? `/checklist?purchaseBudget=${setupBudget}` : hasSavedPlan ? "/recommend" : "/checklist";
    recommendLink.textContent = setupBudget
      ? `${formatWon(setupBudget)} 구매 예산 메모에 반영하기`
      : "내 준비표로 돌아가기";
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

function setupRecommendationFeedback() {
  const feedbackButtons = [...document.querySelectorAll("[data-recommend-feedback]")];
  const reasons = document.querySelector("#recommendFeedbackReasons");
  const status = document.querySelector("#recommendFeedbackStatus");
  if (!feedbackButtons.length || !reasons || !status) return;

  let feedback = readStoredState().recommendationFeedback || {};

  function saveFeedback(type, reason = "") {
    feedback = { type, reason, savedAt: Date.now(), ruleVersion: recommendationRuleVersion };
    writePurchasePlanState({ ...readStoredState(), recommendationFeedback: feedback });
    trackAnalyticsEvent("recommend_feedback", {
      feedback_type: type,
      feedback_reason: reason || "none",
      rule_version: recommendationRuleVersion
    });
  }

  function renderFeedback() {
    feedbackButtons.forEach((button) => {
      const selected = button.dataset.recommendFeedback === feedback.type;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    const options = recommendationFeedbackReasons[feedback.type] || [];
    reasons.hidden = options.length === 0;
    reasons.innerHTML = options.map(([value, label]) => (
      `<button type="button" data-recommend-feedback-reason="${value}" class="${feedback.reason === value ? "is-selected" : ""}" aria-pressed="${feedback.reason === value}">${label}</button>`
    )).join("");

    if (feedback.type === "helpful") status.textContent = "의견을 반영했습니다. 감사합니다.";
    else if (feedback.reason) status.textContent = "선택한 이유까지 반영했습니다. 감사합니다.";
    else if (feedback.type) status.textContent = "가장 가까운 이유 하나를 선택해 주세요.";
    else status.textContent = "";
  }

  feedbackButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const type = button.dataset.recommendFeedback;
      if (type === "helpful") saveFeedback(type);
      else feedback = { type, reason: "", savedAt: Date.now(), ruleVersion: recommendationRuleVersion };
      renderFeedback();
    });
  });

  reasons.addEventListener("click", (event) => {
    const button = event.target.closest("[data-recommend-feedback-reason]");
    if (!button || !feedback.type) return;
    saveFeedback(feedback.type, button.dataset.recommendFeedbackReason);
    renderFeedback();
  });

  renderFeedback();
}

function setupStoreClickTracking() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-store-link]");
    if (!link) return;

    if (link.dataset.copyQuery && navigator.clipboard) {
      navigator.clipboard.writeText(decodeURIComponent(link.dataset.copyQuery)).catch(() => {});
    }

    trackAnalyticsEvent("store_click", {
      store: link.dataset.store || "unknown",
      item_id: link.dataset.itemId || "unknown",
      placement: link.dataset.placement || "unknown",
      rule_version: recommendationRuleVersion,
      transport_type: "beacon"
    });
  });
}

plannerForm?.addEventListener("input", renderPlanner);
document.querySelectorAll("[data-catalog-count]").forEach((element) => {
  element.textContent = `${Object.keys(recommendationCatalog).length}${element.dataset.catalogCountSuffix || ""}`;
});
document.querySelector("#copyPlan")?.addEventListener("click", copyPlan);
flushPendingAnalyticsEvents();
setupHomeReturnState();
setupHomePreview();
setupItemDetail();
setupHomeShare();
setupHomeCtaTracking();
setupProductDetailTracking();
setupServiceTracking();
setupStoreClickTracking();
setupPlannerStage();
renderPlanner();
setupChecklist();
setupCurrencyInputs();
setupRecommendation();
setupRecommendationFeedback();
setupPlanResultNavigation();
setupBudget();
formatAllCurrencyInputs();
setupResultTabs();
