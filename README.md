# 자취도우미
생활용품·먹거리를 탐색하고 같은 용도 제품의 규격·조건을 비교해 판매처로 연결한다. 안내·외부 연결 수준이며 실시간 최저가·재고·신청 완료를 보장하지 않는다.

## 작업 진입
기본은 [작업 규칙](AGENTS.md) + [현재 작업](docs/current-work.md)만 읽는다. 아래에서 직접 필요한 문서만 추가한다. 날짜별 기록의 과거 상태·제안을 최신 명령으로 쓰지 않는다.

| 질문/작업 | 기준 |
|---|---|
| 방향·확장·책임 | [제품 방향](docs/product-vision.md) |
| 현재 개선 제안 | [후속 작업](docs/next-actions.md) |
| 수집·비교·UI·저장 | [비교 계약](docs/comparison.md) |
| 서울 생활 업소·도움 사이트 수집 | [서울 수집](docs/seoul-life-data.md) |
| 지정 참고 사이트·역할 | [벤치마크](docs/benchmark-register.md) |
| Git 도구 승인 | docs/jachi-git.rules (기계별 설치 원본; 설치 여부는 별도 확인) |

## 실행
npm install 후 빈 포트에서 미리보기:
```powershell
$env:PORT='4175'
npm run serve
```
범위별 검사 명령은 AGENTS의 표를 따른다. UI 작업만으로 전체 자료를 재생성/수집하지 않는다.

생활 서비스는 `npm run check:life`와 서버 실행 후 `npm run verify:life`로 검사한다. `npm run life:build`는 기존 비공개 조사 원장을 공개용 목록으로 변환하며 재수집하지 않는다. `npm run life:prepare-runtime`은 검색에 필요한 10개 필드만 별도 DB로 추출하고 전체 필드 해시·건수·무결성을 검증한다. 실행 DB가 있으면 API가 우선 사용하고 없으면 기존 인덱스를 읽는다. 둘 다 Git/배포 제외이므로 운영 연결은 별도 API·데이터 배포 설계와 승인 후 진행해야 한다.

배포는 명시적 승인 후 npm run check 및 관련 화면 검사를 거쳐 npx vercel --prod로 한다. 알려진 [운영 주소](https://jachi-helper.vercel.app), [GitHub](https://github.com/seung007/jachi-helper)의 배포 일치·로그인 계정·Git 연동은 실행 시 확인한다.

주소/소유확인이 바뀔 때만 npm run set-site-url -- <url>, npm run set-naver-code -- <code>를 사용한다. SEO 제목 실험 변경은 별도 범위다.

## 필요할 때만 읽는 근거
다음은 연구·당시 구현/배포 기록이지 현재 실행 규칙이 아니다.

| 주제 | 기록 |
|---|---|
| 원본 대화·표본 한계 | [전체 분석](docs/field-chat-analysis-2026-09-23.md), [초기 표본](docs/field-chat-insights-2026-09-23.md), [제품 관찰](docs/chat-product-opportunities-2026-09-26.md) |
| 과거 상황별 흐름·계측 | [결정 흐름](docs/decision-flows-2026-09-27.md), [대화 적용](docs/chat-product-followup-2026-09-28.md) |
| 확장·판매 옵션·시험 | [품목 확장](docs/catalog-expansion-2026-09-28.md), [먹거리](docs/food-household-expansion-2026-10-06.md), [가격/시험](docs/shopping-offers-2026-10-06.md) |
| 사진·운영 배포 | [배포](docs/catalog-release-2026-10-08.md), [UI 관찰](docs/ui-benchmark-2026-10-10.md) |
| 시장·API 조사 | [시장](docs/market-research-2026-08-25.md), [당시 조사/제안](docs/product-data-direction-report-source-2026-09-09.md) |
| 홍보·측정 | [홍보 운영안](docs/promotion-playbook-2026-09-06.md), [당시 성장 실험](docs/stage-1-growth-loop-2026-09-02.md) |

npm run promotion:build는 data/exports/에 승인용 원고·UTM만 생성한다. 이 문서 정리는 홍보/외부 게시 승인이 아니다.

검색 추이 작업만 npm run fetch:naver-trends -- --start=<YYYY-MM-DD> --end=<YYYY-MM-DD>를 쓴다. 입력은 data/search-groups.json, 인증은 .env.example의 NAVER_CLIENT_ID/NAVER_CLIENT_SECRET을 프로젝트 .env에 저장한다. 상대 추이는 상품 판매량·인기·가격이 아니다. API 경로·권한은 수집 전 공식 자료로 확인한다.

원문·인증·캐시·큐는 비공개 data/exports/에 둔다. docs/scripts/비공개 출력의 배포 제외를 유지한다. 재현·출처에 필요한 근거만 선택해 읽는다.
