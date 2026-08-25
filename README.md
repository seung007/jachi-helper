# 자취도우미

첫 자취 준비물 체크리스트와 예산 장바구니를 빠르게 검색 등록하기 위한 Vercel 정적 사이트입니다.

제품의 최종 목표, 현재 범위, AI·제휴·법률 확장 원칙은 [제품 비전 문서](docs/product-vision.md)에 기록합니다.

## 배포

```bash
npm run check
npx vercel
```

배포 URL이 `https://your-site.vercel.app`처럼 정해지면 아래 명령으로 canonical, OG URL, robots, sitemap 주소를 맞춥니다.

```bash
npm run set-site-url -- https://your-site.vercel.app
npm run check
npx vercel --prod
```

## 네이버 서치어드바이저

1. 네이버 서치어드바이저에서 사이트를 호스트 단위로 등록합니다.
2. 소유확인용 메타태그 값을 복사합니다.
3. 아래 명령으로 소유확인 코드를 반영합니다.

```bash
npm run set-naver-code -- your-verification-code
```

4. 다시 배포한 뒤 소유확인을 누릅니다.
5. `robots.txt`와 `sitemap.xml` 제출 또는 수집 요청을 진행합니다.

## 데이터랩 추이 수집

추천 순위를 추측으로 고정하지 않기 위해, 네이버 데이터랩의 통합검색어 추이를 원본 JSON으로 저장할 수 있습니다. 이 데이터는 검색어 그룹 내부의 상대 추이이며 상품 판매량, 실제 가격, 재고, 최저가가 아닙니다.

1. NAVER Cloud Platform 콘솔의 `NAVER API HUB`에서 `검색어트렌드(Data Lab Search Trend API)`를 선택해 애플리케이션을 등록하고 Client ID와 Client Secret을 발급받습니다.
2. 프로젝트 루트의 `.env.example`을 참고해 `.env` 파일에 키를 저장합니다. `.env`는 Git에서 제외되며, Client Secret을 Git이나 배포용 브라우저 코드에 넣지 않습니다.

```dotenv
NAVER_CLIENT_ID="NAVER_API_HUB_Client_ID"
NAVER_CLIENT_SECRET="NAVER_API_HUB_Client_Secret"
```

3. 수집 명령은 `.env`를 자동으로 읽습니다.

```powershell
npm run fetch:naver-trends -- --start=2025-08-01 --end=2026-08-21
```

4. 성별별 검색 추이를 비교하려면 같은 기간에 각각 실행합니다. 이는 검색 성향을 보는 용도이며, 개인의 필요나 상품 적합성을 뜻하지 않습니다.

```powershell
npm run fetch:naver-trends -- --start=2025-08-01 --end=2026-08-21 --gender=m
npm run fetch:naver-trends -- --start=2025-08-01 --end=2026-08-21 --gender=f
```

5. 결과는 Git에서 제외되는 `data/exports/`에 날짜별 JSON으로 저장됩니다. 비교할 검색어는 `data/search-groups.json`에서 바꿉니다. 이 결과는 상대 추이이므로 인기순·상품 판매량·가격 비교의 근거로 바로 쓰지 않습니다.

## 향후: AI 맞춤 상품 추천

현재 추천은 체크리스트와 사용자가 직접 고른 예산·입주 시점·방 조건을 사용하는 규칙 기반 기능입니다. 실제 상품 가격, 재고, 배송 가능 여부를 확인하지 않으므로 AI 상품 추천이나 가격 비교라고 부르지 않습니다.

유입과 제휴 수익이 검증된 뒤에는 아래 순서로 확장합니다.

1. 제휴사에서 제공하는 상품명, 가격, 재고, 배송, 카테고리, 수수료, 갱신 시각 데이터를 먼저 확보합니다. 화면에는 제휴 링크와 광고·수수료 여부를 명확히 표시합니다.
2. 체크리스트, 예산, 입주일, 방 크기, 보유품, 취향을 입력받되 추천에 필요한 값만 사용합니다. 개인식별정보나 상세 주소는 받지 않습니다.
3. LangGraph 흐름으로 `입력 검증 -> 제휴 상품 후보 조회 -> 예산·조건 필터링 -> 추천 이유 생성 -> 판매처 확인 안내`를 실행합니다. 상품의 가격·재고·배송 조건은 LLM이 추측하지 않고 제휴 데이터만 사용합니다.
4. 추천을 계산하는 동안에는 실제 진행 단계가 보이는 로딩 화면을 표시하고, 완료 후에는 상품별 조건 일치 이유·데이터 갱신 시각·판매처 링크를 제공합니다.

시작 조건은 제휴 상품 데이터가 실제로 연결되고, 5명 이상의 초기 사용자 테스트에서 현재 추천 흐름이 구매 결정에 도움이 된다는 신호를 얻은 뒤입니다. 그 전에는 규칙 기반 추천과 판매처 검색 링크를 유지합니다.
