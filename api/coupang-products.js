const crypto = require("node:crypto");

const API_PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/products/search";

function signedDate(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function sendJson(response, status, body) {
  response.status(status).setHeader("Cache-Control", "no-store").json(body);
}

module.exports = async (request, response) => {
  const query = typeof request.query.query === "string" ? request.query.query.trim().slice(0, 80) : "";
  const accessKey = process.env.COUPANG_PARTNERS_ACCESS_KEY;
  const secretKey = process.env.COUPANG_PARTNERS_SECRET_KEY;

  if (!query) {
    sendJson(response, 400, { products: [], message: "비교할 상품명을 찾지 못했습니다." });
    return;
  }
  if (!accessKey || !secretKey) {
    sendJson(response, 503, {
      products: [],
      message: "실제 판매 데이터 연결을 준비 중입니다. 확인된 가격 데이터가 없어서 가격을 표시하지 않습니다."
    });
    return;
  }

  const params = new URLSearchParams({ keyword: query, limit: "3" });
  const queryString = params.toString();
  const date = signedDate();
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(`${date}GET${API_PATH}?${queryString}`)
    .digest("hex");
  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${date}, signature=${signature}`;

  try {
    const upstream = await fetch(`https://api-gateway.coupang.com${API_PATH}?${queryString}`, {
      headers: { Authorization: authorization }
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error("Coupang Partners API error", upstream.status, payload?.message || payload?.rMessage || "unknown");
      sendJson(response, 502, { products: [], message: "판매처 상품 데이터를 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요." });
      return;
    }

    const sourceProducts = payload?.data?.productData || payload?.data || [];
    const products = (Array.isArray(sourceProducts) ? sourceProducts : []).slice(0, 3).map((product) => ({
      name: product.productName,
      price: Number(product.productPrice),
      image: product.productImage,
      url: product.productUrl,
      badge: product.isRocket ? "로켓배송" : "쿠팡"
    })).filter((product) => product.name && product.url);

    sendJson(response, 200, {
      products,
      updatedAt: new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Asia/Seoul"
      }).format(new Date())
    });
  } catch (error) {
    console.error("Coupang Partners API request failed", error);
    sendJson(response, 502, { products: [], message: "판매처 상품 데이터를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요." });
  }
};
