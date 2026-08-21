# 자취도우미

첫 자취 준비물 체크리스트와 예산 장바구니를 빠르게 검색 등록하기 위한 Vercel 정적 사이트입니다.

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

1. 네이버 개발자센터에서 데이터랩 API를 사용할 애플리케이션을 등록하고 클라이언트 ID와 시크릿을 발급받습니다.
2. PowerShell에서 현재 터미널에만 키를 설정합니다.

```powershell
$env:NAVER_CLIENT_ID="발급받은_클라이언트_ID"
$env:NAVER_CLIENT_SECRET="발급받은_클라이언트_시크릿"
npm run fetch:naver-trends -- --start=2025-08-01 --end=2026-08-21
```

3. 결과는 Git에서 제외되는 `data/exports/`에 날짜별 JSON으로 저장됩니다. 비교할 검색어는 `data/search-groups.json`에서 바꿉니다.
