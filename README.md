# 잡필터 V2 (Job Blocking V2)

채용 플랫폼(원티드, 사람인, 잡코리아 등)에서 원하지 않는 기업 및 불필요한 추천/스폰서 광고 공고를 숨기거나 흐리게(블러) 처리해 주는 크롬 확장 프로그램(Manifest V3)입니다.

---

## 🛠️ 기술 스택 (Tech Stack)

- **언어 & 프레임워크**: TypeScript, React 18, Vite 6
- **확장 프로그램 번들러**: `@crxjs/vite-plugin` (Manifest V3 단일 파이프라인 번들링 & HMR 지원)
- **단위 테스트 (Unit Test)**: Vitest + happy-dom
- **E2E 테스트 (End-to-End Test)**: Playwright (Chromium Extension 로드 기반 테스트)

---

## 📂 프로젝트 구조 (Modular Architecture)

```
src/
├── manifest.json              # Chrome Manifest V3 설정
├── constants/                 # 설정값, DOM 셀렉터, 뱃지, UI 메시지 중앙 집중 상수
│   └── index.ts
├── types/                     # 공통 데이터 모델 및 메시지 프로토콜
│   └── index.ts
├── core/                      # 순수 비즈니스 로직
│   ├── filter-engine.ts       # 정규화, 기업명/키워드 매칭, DOM 블러/숨김 판정
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
