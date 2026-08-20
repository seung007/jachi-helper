# 자취도우미

첫 자취 준비물 체크리스트와 예산 장바구니를 빠르게 검색 등록하기 위한 Vercel 정적 사이트입니다.

## 배포

```bash
cd jachi-helper
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
