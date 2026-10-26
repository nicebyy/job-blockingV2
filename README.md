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
- **페이지네이션 ➔ 무한 스크롤 개조 & 빈 페이지 방지 (Auto-Refill)**:
  - 사람인/잡코리아 등의 페이지 번호 목록을 무한 스크롤로 자동 변환
  - 1페이지의 공고가 대량 차단되어 텅 비는 경우, 백그라운드에서 다음 페이지 공고를 즉시 긁어와 채워줌 (최대 5페이지 연속 탐색)
- **불필요한 AI 검색 배너 및 추천/스토어 프로모션 자동 숨김 (Ad & Banner Clean)**:
  - 사람인 검색 페이지 상단 AI 커리어 매칭 에이전트 배너 (`.area_ai_search`: "AI로 원하는 채용 정보를 찾아보세요") 자동 숨김
  - 개인 맞춤 추천 공고 캐러셀 섹션 (`section.type_searchup`: "OOO님을 위한 공고") 자동 숨김
  - 사람인 스토어 광고/프로모션 위젯 (`.wrap_store`: "막막한 취업·이직 준비는 스토어에서!") 자동 숨김
  - CSS 기반 즉시 차단(깜빡임 FOUC 방지) 및 Content Script 어댑터 이중 필터링 적용
- **차단 목록 및 유형별 실시간 통계 관리**:
  - 팝업 창에서 현재 탭의 필터링 현황(차단된 공고, 차단 회사(고유), 숨긴 공고, 광고 공고)을 유형별로 정확히 분리 집계
  - 전용 옵션 페이지에서 회사/공고/키워드별 차단 목록 검색, 개별 삭제, JSON 백업/복원 지원
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
│   └── index.ts               # 브라우저 툴바 뱃지(차단 카운트) 관리
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
