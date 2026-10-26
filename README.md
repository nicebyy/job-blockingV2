# Job Blocking V2 (채용 사이트 공고 필터링)

채용 플랫폼(원티드, 사람인, 잡코리아 등)에서 원하지 않는 기업 및 불필요한 추천/스폰서 광고 공고를 숨기거나 흐리게(블러) 처리해 주는 크롬 확장 프로그램(Manifest V3)입니다.

---

## ✨ 핵심 기능 (Features)

- **선택적 차단 (Selective Blocking)**:
  - **[공고숨김]**: 특정 공고만 숨김 처리하여, 동일 회사의 다른 포지션 공고는 정상적으로 탐색 가능
  - **[회사차단]**: 해당 기업의 모든 채용 공고를 영구 차단
  - **모던 글래스모피즘 캡슐 툴바 (Floating Pill Toolbar)**:
    - 채용 사이트 본래의 UI를 침범하지 않도록 평상시에는 숨겨지며, 마우스 호버(`:hover`) 시에만 우측 상단에 정제된 플로팅 알약(Pill) 형태로 부드럽게 노출 (Hover Reveal)
    - 미니멀 아이콘, 세그먼트 디바이더, 액션별 은은한 하이라이트(Amber/Red) 마이크로 인터랙션 적용
    - 모든 UI 텍스트, 툴팁, SVG 규격 및 클래스명을 중앙 상수(`INLINE_BUTTON_CONFIG`)로 분리하여 하드코딩 완전 배제
- **상세페이지 무한 스크롤 릴레이 뷰 필터링 & 빈 페이지 방지 (Detail Page Relay & Safe Isolation)**:
  - 사람인 등 상세 공고 열람 후 하단으로 이어지는 무한 스크롤 릴레이 공고 및 추천 공고 카드 자동 감지
  - **부모 래퍼 격리 (Anti-Empty Page)**: 최상위 부모 컨테이너(`.wrap_jview`)가 오은닉되어 화면 좌측 전체가 하얗게 증발하는 문제를 원천 차단하고, 개별 자식 공고(`.wrap_jview > .jview`) 단위로 격리 은닉
  - 첫 번째 메인 공고나 임의의 공고를 차단하더라도 상세페이지 전체가 날아가지 않고, 차단된 공고만 숨겨진 뒤 다음 릴레이 공고가 자연스럽게 이어져 노출
  - 개별 공고 헤더에 [공고숨김] / [회사차단] 버튼 제공 및 우측 '이어보는 Ai매치 채용정보' 목록까지 동시 필터링
  - 상세페이지 스크롤 중 차단한 공고/기업은 다른 상세페이지를 보며 스크롤을 내릴 때도 영구 숨김 처리
- **동적 필터 및 정렬 변경 감지 (Filter & Sort Sync)**:
  - 등록일순, 관련도순, 직무 탭 등 사이트 내 필터/정렬 변경 시(SPA History 및 AJAX) 실시간 자동 재스캔
- **페이지네이션 ➔ 무한 스크롤 개조 & 안정성 강화 (Auto-Refill & Loop Guard)**:
  - 사람인/잡코리아 등의 페이지 번호 목록을 무한 스크롤로 자동 변환
  - **사람인 실서비스 해시 페이지네이션(`href="#recruit_info"`) 대응**: 단순 해시 반환으로 인한 1페이지 무한 반복 페치를 방지하고, 검색 페이지 표준 쿼리 파라미터(`recruitPage`)를 정확히 산출하여 다음 페이지 로드
  - **공고 중복 검사 및 무한 루프 차단**: 이미 페이지에 존재하는 공고 식별 키(`jobId` / `company:::title`)를 대조하여 중복 공고 추가를 배제하며, 신규 공고가 없을 시 탐색을 즉시 종료
  - **네트워크 타임아웃 및 스피너 자동 정리**: 10초 타임아웃(`AbortController`)과 `finally` 가드를 적용하여 네트워크 지연이나 WAF 응답 지연 시에도 로딩 스피너가 무한히 도는 현상 방지
  - **자동 채우기(Auto-Refill)**: 1페이지의 공고가 대량 차단되어 텅 비는 경우, 백그라운드에서 다음 페이지 공고를 즉시 긁어와 채워줌 (최대 5페이지 연속 탐색)
- **불필요한 AI 검색 배너 및 추천/스토어 프로모션 자동 숨김 (Ad & Banner Clean)**:
  - 사람인 검색 페이지 상단 AI 커리어 매칭 에이전트 배너 (`.area_ai_search`: "AI로 원하는 채용 정보를 찾아보세요") 자동 숨김
  - 개인 맞춤 추천 공고 캐러셀 섹션 (`section.type_searchup`: "OOO님을 위한 공고") 자동 숨김
  - 사람인 스토어 광고/프로모션 위젯 (`.wrap_store`: "막막한 취업·이직 준비는 스토어에서!") 자동 숨김
  - CSS 기반 즉시 차단(깜빡임 FOUC 방지) 및 Content Script 어댑터 이중 필터링 적용
- **차단 목록 및 유형별 실시간 통계 관리**:
  - 팝업 창에서 현재 탭의 필터링 현황(차단된 공고, 차단 회사(고유), 숨긴 공고, 광고 공고)을 유형별로 정확히 분리 집계
  - 전용 옵션 페이지에서 회사/공고/키워드별 차단 목록 검색, 개별 삭제, JSON 백업/복원 지원
- **잡플래닛(초록색) 및 블라인드(빨간색) 듀얼 기업 평점 연동 (Dual Company Rating Badges: Jobplanet & Blind)**:
  - **기업명 옆 실시간 듀얼 평점 뱃지 배치**: 원티드, 사람인, 잡코리아 등 모든 지원 사이트의 채용 공고 기업명 바로 옆 래퍼(`.job-filter-ratings-wrap`)에 잡플래닛과 블라인드 평점을 나란히 표시
  - **브랜드별 시각적 컬러 테마**:
    - **잡플래닛**: 초록색 평점 뱃지 (텍스트 `#047857`, 배경 `#ecfdf5`, 테두리 `#a7f3d0`)
    - **블라인드**: 빨간색 평점 뱃지 (텍스트 `#dc2626`, 배경 `#fef2f2`, 테두리 `#fecaca`)
  - **상세 안내 호버(Hover) 툴팁**: 마우스 호버 시 평점 정보와 함께 제외 사유 명시
    - 예: `'{회사명}' 블라인드 평점 3.5 / 5.0 (클릭 시 이동 · 검색 결과 미존재, 동명 기업, 평점 미등록 시 표시 제외)`
  - **단일 기업 매칭 검증 및 동명 기업 배제 원칙 (Anti-Ambiguity)**:
    - 회사명을 검색하여 단일 기업이 유효한 평점을 보유할 때만 배치
    - 검색 결과 미존재, 평점 미등록, 또는 동일 상호(동명)의 기업이 2개 이상 검색되어 특정할 수 없는 경우 오정보 노출 방지를 위해 배치 제외 (`배치x`)
  - **봇 탐지 우회 및 안전한 네트워크 요청 아키텍처**:
    - **잡플래닛**: Next.js RSC (`RSC: 1`) 스트림 파서로 Cloudflare 403 차단 우회
    - **블라인드**: 상세 페이지 SSR JSON-LD (`EmployerAggregateRating`) 및 통합 검색 카드 이중 파싱
    - **순차 스로틀링(Throttling)**: 플랫폼별 300ms 요청 큐잉을 적용하여 대량 공고 로드 시 WAF/Rate-limit에 걸리지 않도록 트래픽 분산
    - **동시성 중복 제거(In-flight Deduplication)**: 동일한 회사에 대한 비동기 요청을 단일 네트워크 호출로 병합
    - **2계층 스마트 캐시(Memory + Local Storage)**: 정상 평점 7일, 미존재/동명기업 1일 TTL 캐싱으로 반복 네트워크 호출 원천 차단
  - **독립적 제어 UX**: 뱃지 클릭 시 공고 카드 이동 없이 해당 플랫폼 기업 리뷰 페이지로 이동하며, 팝업 창에서 잡플래닛/블라인드 평점을 각각 개별 원클릭 ON/OFF 지원
- **공고 마감시각 기준 스마트 만료(TTL) 및 자동 청소 (Smart Expiration & Auto-Purge)**:
  - **마감시각 + 30일 만료 계산**: 공고 숨김 시 해당 카드의 마감일시(`~ MM/DD`, `YYYY-MM-DD`, `D-Day`, `오늘/내일마감` 등)를 자동 파싱하여 **[공고 마감시각 + 30일]**로 보관 만료 타임스탬프(`expiresAt`) 계산 (상시/수시 채용인 경우 등록일 + 30일)
  - **스토리지 쿼터 방어 및 자동 청소(Lazy Auto-Purge)**: 이미 마감되어 다시 볼 일 없는 공고가 크롬 동기화 스토리지(100KB 쿼터)를 불필요하게 차지하지 않도록, 스토리지 조회 시 만료된 공고를 백그라운드에서 자동 필터링 및 영구 제거
  - **옵션 관리 지원**: 차단 목록에서 각 공고의 마감일 및 만료 예정일 배지 노출, `[🧹 만료 공고 정리]` 원클릭 수동 청소 지원

---

## 🛠️ 기술 스택 (Tech Stack)

- **언어 & 프레임워크**: TypeScript, React 18, Vite 6
- **확장 프로그램 번들러**: `@crxjs/vite-plugin` (Manifest V3 단일 파이프라인 번들링 & HMR 지원)
- **단위 테스트 (Unit Test)**: Vitest + happy-dom
- **E2E 테스트 (End-to-End Test)**: Playwright (Chromium Extension 로드 기반 테스트)

---

## 📂 프로젝트 구조 (Modular Architecture)

```
public/
└── icons/                     # 확장 프로그램 아이콘 (16, 32, 48, 128px)
src/
├── manifest.json              # Chrome Manifest V3 설정
├── constants/                 # 설정값, DOM 셀렉터, 뱃지, UI 메시지 중앙 집중 상수
│   └── index.ts
├── types/                     # 공통 데이터 모델 및 메시지 프로토콜
│   └── index.ts
├── core/                      # 순수 비즈니스 로직
│   ├── filter-engine.ts       # 정규화, 기업명/키워드 매칭, DOM 블러/숨김 판정
│   ├── infinite-scroll.ts     # 페이지네이션 무한 스크롤 변환 및 빈 페이지 방지 자동 채우기(Auto-Refill)
│   ├── jobplanet.ts           # 잡플래닛 RSC 스트림 파서, 봇 우회 요청 큐, 평점 캐시
│   ├── blind.ts               # 팀블라인드 JSON-LD/검색 파서, 요청 큐 및 평점 캐시
│   └── storage.ts             # chrome.storage.sync / local 추상화 및 폴백
├── adapters/                  # 플랫폼별 고유 DOM 셀렉터 및 파서 (어댑터 패턴)
│   ├── base.ts                # BaseSiteAdapter 추상 클래스 ([차단] 인라인 버튼 주입)
│   ├── wanted.ts              # 원티드(Wanted) 어댑터
│   ├── saramin.ts             # 사람인(Saramin) 어댑터
│   ├── jobkorea.ts            # 잡코리아(JobKorea) 어댑터
│   └── index.ts               # AdapterRegistry (신규 사이트 손쉬운 확장)
├── content/                   # 채용 사이트에 삽입되는 Content Script
│   ├── index.ts               # MutationObserver 무한 스크롤 감지 및 실시간 필터링
│   └── style.css              # 블러/숨김 효과 및 인라인 [차단] 버튼 UI 스타일
├── background/                # Background Service Worker
│   └── index.ts               # 백그라운드 서비스 워커 (설정 및 툴바 뱃지 제어)

├── popup/                     # 브라우저 툴바 팝업 UI
│   ├── index.html
│   ├── main.tsx
│   ├── Popup.tsx              # 현재 탭 차단 현황 통계, 빠른 차단, 모드 토글
│   └── popup.css
└── options/                   # 차단 목록 상세 관리 페이지
    ├── index.html
    ├── main.tsx
    ├── Options.tsx            # 차단 목록 검색/삭제, JSON 백업 및 복원
    └── options.css
```

---

## 🚀 개발 및 빌드 명령어

### 1. 의존성 설치
```bash
npm install
```

### 2. 개발 모드 (HMR 지원)
```bash
npm run dev
```

### 3. 프로덕션 빌드
```bash
npm run build
```
- 빌드 결과물은 `dist/` 폴더에 생성됩니다.
- Chrome 브라우저의 `chrome://extensions` 접속 ➔ **[개발자 모드]** 켬 ➔ **[압축해제된 확장 프로그램을 로드합니다]** 클릭 후 프로젝트의 `dist` 폴더를 선택하면 브라우저에 바로 로드됩니다.

### 4. 채용 사이트 HTML 샘플 안전 다운로드
```bash
npm run fetch:sample -- "<URL>" [저장파일명] [타임아웃(초)]
```
- PowerShell 5.1의 `mshtml` 엔진 무한 행잉(Hang) 및 봇 차단을 우회하여 10초 타임아웃 보장 하에 대상 사이트의 HTML을 안전하게 수집합니다.

### 5. TypeScript 코드 조각 안전 평가 (Safe Eval)
```bash
npm run eval:ts -- "<단일행_TS_코드>"
```
- REPL 대화형 프롬프트 대기 락을 방지하고 `stdin` 차단 및 10초 타임아웃 보장 하에 TypeScript 코드를 안전하게 실행합니다.

---

## 🧪 테스트 실행 가이드

`gemini.md` 규칙에 따라 모든 단위 테스트와 E2E 테스트가 100% 통과해야 합니다.

### 단위 테스트 (Unit Tests)
```bash
npm run test
```

### E2E 테스트 (Playwright)
```bash
npm run test:e2e
```
