/* Observed sale options, deliberately separate from the 2025 comparison samples. */
const ShoppingOffers = (() => {
  const ttlMs = 24 * 60 * 60 * 1000;
  const offers = [
    {
      id: "acts-3200", itemId: "laundry-detergent", brand: "액츠", name: "퍼펙트 실내건조 프레시 플로럴향",
      machine: "드럼용", pack: "본품", volumeMl: 3200, count: 1, price: 10100,
      checkedAt: "2026-10-06T03:35:00+09:00",
      url: "https://www.coupang.com/vp/products/9744236856?itemId=29058637349&vendorItemId=84182349361",
      image: "/assets/offers/acts-3200.jpg",
      note: "리뉴얼 전·후 제품이 섞여 배송될 수 있음"
    },
    {
      id: "liq-2100-4", itemId: "laundry-detergent", brand: "리큐", name: "진한겔 하이브리드 실내건조",
      machine: "드럼용", pack: "리필", volumeMl: 2100, count: 4, price: 21900,
      checkedAt: "2026-10-06T03:35:00+09:00",
      url: "https://www.coupang.com/vp/products/7367891924?itemId=19518548907&vendorItemId=76626054053",
      image: "/assets/offers/liq-2100-4.png", note: "4개 묶음 · 총 8.4L 보관 공간 필요"
    },
    {
      id: "snuggle-2700", itemId: "laundry-detergent", brand: "스너글", name: "블루스파클 플러스 실내건조",
      machine: "일반·드럼 겸용", pack: "본품", volumeMl: 2700, count: 1, price: 16250,
      checkedAt: "2026-10-06T03:35:00+09:00",
      url: "https://www.coupang.com/vp/products/8457659514?itemId=24464072128&vendorItemId=91477705423",
      image: "/assets/offers/snuggle-2700.jpg", note: "세탁량에 맞는 용기 표기 사용량 확인"
    },
    { id: "rice-6", itemId: "food-rice", brand: "햇반", name: "백미밥", pack: "210g × 6개", amount: 210, count: 6, unit: "g", unitSize: 100, price: 7730, checkedAt: "2026-10-06T19:35:00+09:00", image: "/assets/offers/rice.jpg", url: "https://www.coupang.com/vp/products/9509930958?itemId=11399176&vendorItemId=3012446974", note: "한 공기 양과 소비기한 · 전자레인지 조리 표시 확인" },
    { id: "rice-12", itemId: "food-rice", brand: "햇반", name: "백미밥", pack: "210g × 12개", amount: 210, count: 12, unit: "g", unitSize: 100, price: 13970, checkedAt: "2026-10-06T19:40:00+09:00", image: "/assets/offers/rice12.jpg", url: "https://www.coupang.com/vp/products/9509930958?itemId=3475105914&vendorItemId=3000522128", note: "6개 묶음과 개당 가격·보관할 수량 비교" },
    { id: "tuna-4", itemId: "food-tuna", brand: "동원", name: "라이트 스탠다드 참치", pack: "85g × 4캔", amount: 85, count: 4, unit: "g", unitSize: 100, price: 9000, checkedAt: "2026-10-06T19:35:00+09:00", image: "/assets/offers/tuna.png", url: "https://www.coupang.com/vp/products/2042132?itemId=20047758127&vendorItemId=82562196467", note: "소용량 캔 · 원재료·알레르기 및 개봉 후 보관 표시 확인" },
    { id: "seaweed-16", itemId: "food-seaweed", brand: "대천김", name: "재래 도시락김", pack: "5g × 16봉", amount: 5, count: 16, unit: "g", unitSize: 100, price: 6940, checkedAt: "2026-10-06T19:35:00+09:00", image: "/assets/offers/seaweed.jpg", url: "https://www.coupang.com/vp/products/8333834448?itemId=23804100849&vendorItemId=90827990628", note: "소포장 수량 · 원재료·보관 표시 확인" },
    { id: "water-6", itemId: "food-water", brand: "제주삼다수", name: "그린 무라벨", pack: "2L × 6병", amount: 2000, count: 6, unit: "ml", unitSize: 100, price: 6340, checkedAt: "2026-10-06T19:35:00+09:00", image: "/assets/offers/water.jpg", url: "https://www.coupang.com/vp/products/9725928327?itemId=29105043162&vendorItemId=86430112499", note: "총 12L · 수령·운반과 보관 공간 확인" },
    { id: "ramen-5", itemId: "food-noodles", brand: "농심", name: "신라면", pack: "120g × 5봉", amount: 120, count: 5, unit: "g", unitSize: 100, price: 4150, checkedAt: "2026-10-06T19:35:00+09:00", image: "/assets/offers/ramen.jpg", url: "https://www.coupang.com/vp/products/7958974?itemId=93553&vendorItemId=3000207618", note: "봉지면 · 조리 도구와 원재료·영양 표시 확인" },
    { id: "dumpling-2", itemId: "food-frozen", brand: "Chefood", name: "고기왕교자", pack: "385g × 2봉 (1세트)", amount: 385, count: 2, unit: "g", unitSize: 100, price: 8100, checkedAt: "2026-10-06T19:35:00+09:00", image: "/assets/offers/dumpling.jpg", url: "https://www.coupang.com/vp/products/5877660930?itemId=12550219759&vendorItemId=3838945780", note: "냉동실 공간 · 배송·보관 온도와 조리 표시 확인" },
    { id: "paper-8", itemId: "kitchen-paper-towel", brand: "깨끗한나라", name: "데일리 천연펄프 키친타월", pack: "150매 × 8롤 · 2겹", amount: 150, count: 8, unit: "매", unitSize: 100, price: 7300, checkedAt: "2026-10-06T19:35:00+09:00", image: "/assets/offers/paper.jpg", url: "https://www.coupang.com/vp/products/7660554607?itemId=24566083969&vendorItemId=3000140916", note: "총 1,200매 · 매당 크기와 겹수도 함께 비교" },
    { id: "zipbag-60", itemId: "kitchen-zipbag", brand: "크린랩", name: "이중 지퍼백 중형", pack: "22 × 25cm · 20매 × 3팩", amount: 20, count: 3, unit: "매", unitSize: 1, price: 9360, checkedAt: "2026-10-06T19:35:00+09:00", image: "/assets/offers/zipbag.jpg", url: "https://www.coupang.com/vp/products/8520346540?itemId=19583259292&vendorItemId=86690766055", note: "총 60매 · 냉장/냉동 겸용 표시 · 쿠폰 전 가격" },
    { id: "dishsoap-500", itemId: "kitchen-dish-soap", brand: "참그린", name: "레몬 녹차 뽀드득 어드밴스", pack: "500g × 1개 · 본품", amount: 500, count: 1, unit: "g", unitSize: 100, price: 2400, checkedAt: "2026-10-06T19:35:00+09:00", image: "/assets/offers/dishsoap.jpg", url: "https://www.coupang.com/vp/products/7657560510?itemId=17397521921&vendorItemId=84566980068", note: "주방세제 · 사용 대상과 희석량은 제품 표시 확인" }
  ];

  function fresh(offer, now = Date.now()) {
    const age = now - Date.parse(offer.checkedAt);
    return Number.isFinite(age) && age >= 0 && age < ttlMs;
  }

  function cost(offer, price, doseMl) {
    if (![price, doseMl, offer.volumeMl, offer.count].every((v) => typeof v === "number" && Number.isFinite(v) && v > 0)) return null;
    if (!Number.isSafeInteger(price) || price > 10000000 || doseMl > offer.volumeMl || !Number.isSafeInteger(offer.count)) return null;
    return price * doseMl / (offer.volumeMl * offer.count);
  }

  function sort(offerList, order, now = Date.now()) {
    // Unit prices only rank comparable items, never food against detergent.
    if (order === "unit" && new Set(offerList.map((o) => o.itemId)).size > 1) return [...offerList];
    return [...offerList].sort((a, b) => {
      if (order === "name") return a.brand.localeCompare(b.brand, "ko");
      if (order === "price" || order === "unit") {
        if (fresh(a, now) !== fresh(b, now)) return Number(fresh(b, now)) - Number(fresh(a, now));
        if (!fresh(a, now)) return 0;
        return order === "price" ? a.price - b.price : unitPrice(a) - unitPrice(b);
      }
      return 0;
    });
  }
  function unitPrice(offer) {
    const amount = offer.amount ?? offer.volumeMl;
    return offer.price / (amount * offer.count) * (offer.unitSize || 100);
  }
  function unitLabel(offer) { return `${offer.unitSize || 100}${offer.unit || "ml"}당`; }
  return { offers, ttlMs, fresh, cost, sort, unitPrice, unitLabel };
})();
if (typeof module !== "undefined") module.exports = ShoppingOffers;
