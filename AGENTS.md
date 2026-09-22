# 자취도우미 AI 작업 규칙

- 이 폴더는 자취도우미 전용 프로젝트다.
- 제품 맥락은 `README.md`, `docs/product-vision.md`, 작업과 직접 관련된 문서 순서로 읽는다.
- RelayOps의 코드·문서·데이터를 가져오거나 수정하지 않는다.
- 검증 명령은 이 폴더에서 `npm run check`로 실행한다.
- 환경변수와 수집 데이터는 각각 `.env`, `data/exports/`에만 저장한다.

## Git 작업 승인

- 사용자는 이전 상시 커밋 승인을 철회했다. 로컬 수정과 검증 후 변경 범위 및 결과를 보고하고, 해당 변경에 대한 명시적 허락을 받은 뒤에만 커밋한다. 푸시·배포도 승인 범위를 확인한다.
- 커밋 전 변경 내역과 스테이징 내용을 확인하고 `npm run check` 및 변경 범위에 맞는 검증을 수행한다. 기존의 미완료 작업을 임의로 함께 올리지 않는다.
- 명시한 파일만 스테이징한다. `.env`, 인증 정보, `data/exports/`는 커밋하지 않는다.
- 명령은 `git -C "C:/Users/user/Documents/ChatGPT/프로젝트/jachi-helper" add -- <files>`, `git -C "C:/Users/user/Documents/ChatGPT/프로젝트/jachi-helper" commit -m <message>` 형식을 사용한다.
- main의 일반 푸시는 `git -C "C:/Users/user/Documents/ChatGPT/프로젝트/jachi-helper" push -- https://github.com/seung007/jachi-helper.git HEAD:refs/heads/main`을 사용한다. 실행 전 현재 브랜치가 main인지 확인한다.
- 강제 푸시, 원격 브랜치 삭제, 커밋 기록 재작성은 일반 커밋 승인에 포함하지 않는다. 외부 홍보글 게시 승인과도 별개다.
