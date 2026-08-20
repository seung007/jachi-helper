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

const form = document.querySelector("#plannerForm");
const totalPrice = document.querySelector("#totalPrice");
const heroTotal = document.querySelector("#heroTotal");
const budgetState = document.querySelector("#budgetState");
const mustList = document.querySelector("#mustList");
const laterList = document.querySelector("#laterList");
const skipList = document.querySelector("#skipList");

function formatWon(value) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function renderList(target, list) {
  target.innerHTML = "";
  list.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.name} · ${formatWon(item.price)}`;
    target.appendChild(li);
  });
}

function calculate() {
  const data = new FormData(form);
  const budget = Number(data.get("budget"));
  const room = data.get("room");
  const lifestyle = data.get("lifestyle");
  const days = Number(data.get("days"));

  const matched = items.filter((item) => item.rooms.includes(room) && item.lifestyles.includes(lifestyle));
  const must = matched.filter((item) => item.group === "must");
  const later = matched.filter((item) => item.group === "later" && days > 3);
  const skip = matched.filter((item) => item.group === "skip");
  const total = must.reduce((sum, item) => sum + item.price, 0) + later.reduce((sum, item) => sum + item.price, 0);
  const diff = budget - total;

  totalPrice.textContent = formatWon(total);
  heroTotal.textContent = formatWon(total);
  budgetState.textContent = diff >= 0 ? `${formatWon(diff)} 여유` : `${formatWon(Math.abs(diff))} 초과`;
  budgetState.style.color = diff >= 0 ? "#1d6f51" : "#c83d2d";

  renderList(mustList, must);
  renderList(laterList, later);
  renderList(skipList, skip.length ? skip : [{ name: "현재 조건에서는 없음", price: 0 }]);
}

form.addEventListener("input", calculate);
calculate();
