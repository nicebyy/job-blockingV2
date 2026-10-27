# Job Blocking V2 (채용 사이트 공고 필터링)

<p align="left">
  <img src="https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Vite-6.0-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Vitest-100%25_Passed-6E9F18?style=flat-square&logo=vitest&logoColor=white" alt="Vitest" />
  <img src="https://img.shields.io/badge/Playwright-E2E_Passed-2EAD33?style=flat-square&logo=playwright&logoColor=white" alt="Playwright" />
  <img src="https://img.shields.io/badge/Privacy-Zero_Data_Collection-success?style=flat-square" alt="Privacy" />
</p>

채용 플랫폼(원티드, 사람인, 잡코리아, 리멤버, 점핏 등)에서 원하지 않는 기업 및 불필요한 추천/스폰서 광고 공고를 숨기거나 흐리게(블러) 처리해 주는 고성능 크롬 확장 프로그램(Manifest V3)입니다.

---

## 🌐 지원 채용 플랫폼 요약 (Supported Platforms)

| 채용 플랫폼 | 지원 페이지 범위 | 공고 숨김 / 회사 차단 | 기업 평점 뱃지 (잡플래닛·블라인드) | 광고/프로모션 자동 숨김 | 무한 스크롤 / 자동 리필 | 상세페이지 스마트 이탈 가드 |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **원티드 (Wanted)** | 채용목록(`/wdlist/*`), 상세페이지(`/wd/*`), 큐레이션 캐러셀 | ✅ | ✅ (듀얼 뱃지) | ✅ (적극 채용 슬라이더) | ✅ (SPA 최적화) | ✅ |
| **사람인 (Saramin)** | 검색목록, 지역·직무별 목록(`/jobs/list/*`), 상세페이지 릴레이 뷰(`.jview`) | ✅ | ✅ (듀얼 뱃지) | ✅ (스폰서광고·Nest배너·AI검색) | ✅ (Auto-Refill 지원) | ✅ |
| **잡코리아 (JobKorea)** | 메인 홈, 채용목록, 인기 TOP 100, AI추천, 상세페이지 | ✅ | ✅ (듀얼 뱃지) | ✅ (메인 4대 광고·TOP 헤드라인) | ✅ (POST 무한 스크롤) | ✅ (뒤로가기 / 탭 종료) |
| **리멤버 (Remember)** | 채용목록, 인기/큐레이션 공고, 상세페이지 | ✅ | ✅ (듀얼 뱃지) | ✅ (프리미엄기업·광고배너) | ✅ (SPA 최적화) | ✅ (뒤로가기 / 탭 종료) |
| **점핏 (Jumpit)** | 채용목록(`/positions`), 상세페이지(`/position/*`) | ✅ | ✅ (듀얼 뱃지) | ✅ (사이드 윙·프로모션) | ✅ (SPA 최적화) | ✅ (뒤로가기 / 탭 종료) |

---

## ✨ 핵심 기능 (Features)

### 1. 🎯 직관적인 공고 숨김 & 회사 일괄 차단
- **[공고숨김] (단일 포지션 은닉)**: 특정 공고만 즉시 완전 은닉합니다. 블러/숨김 모드 설정과 무관하게 사용자의 명시적 숨김 의도를 최우선으로 반영하며, 동일 기업의 다른 포지션은 정상적으로 탐색할 수 있습니다.
- **[회사차단] (기업 단위 일괄 차단)**: 해당 기업의 모든 채용 공고를 원클릭으로 일괄 차단합니다.
- **지능형 기업명 정규화 (Smart Deduplication)**: `(주)`, `주식회사`, 공백, 특수문자 등의 표기 변형이 달라도 동일 기업으로 완벽히 인식하여 중복 등록을 원천 차단하고 공식 명칭으로 자동 최적화합니다.
- **모던 플로팅 툴바 (Hover Reveal)**: 평상시에는 사이트 본래의 UI를 전혀 해치지 않으며, 공고 카드에 마우스를 올릴 때만 우측 상단에 정제된 알약(Pill) 형태로 부드럽게 노출됩니다.
- **공백 없는 자연스러운 재정렬 (CSS Grid Reflow)**: 공고가 숨겨질 때 어색한 빈 여백이 남지 않도록 그리드 셀 자체를 완전 은닉하여, 뒤의 공고 카드가 자연스럽게 앞으로 당겨져 정렬됩니다.

### 2. 🏢 5대 채용 플랫폼 맞춤 지원
| 플랫폼 | 지원 페이지 범위 | 주요 특화 기능 |
| :--- | :--- | :--- |
| **원티드 (Wanted)** | 채용목록(`/wdlist/*`), 상세페이지(`/wd/*`), 큐레이션 캐러셀 | 상단 **"🔥 적극 채용 중인 회사"** 광고 슬라이더 자동 숨김, 상세페이지(`/wd/*`) 헤더 기업 평점 뱃지 연동 및 테마 캐러셀 카드 정밀 은닉 |
| **사람인 (Saramin)** | 검색목록, 지역·직무·산업별 목록(`/jobs/list/*`), 상세페이지 릴레이 뷰(`.jview`) | 상단 그랜드/프리미엄 상품 배너 및 일반 공고 행 지원, 지역·직무별 공고 행(.list_item) 4열 가로 Flex 레이아웃 보장, 직업별/지역별 동적 패널 검색(RequireJS) 무한 스크롤 지연 활성화 및 PageBox(.BtnNext) 연동, 스폰서 상품 그리드 배너(그랜드·프리미엄 배너, Nest 광고, 네이버 파워링크) 및 AI 배너/스토어 프로모션 자동 일괄 은닉, 비정형 그리드·네이버 파워링크 광고 목록 컨테이너 하이재킹 방지, 로딩 스피너 상시 회전 및 연속 실패 무한 재시도 방지 |
| **잡코리아 (JobKorea)** | 메인 홈, 채용목록, 인기 TOP 100, AI추천, 상세페이지 | 메인 페이지 큐레이션·추천 공고 카드(`CardJobBasic`: "큐레이션 JOB", "지원자가 많아요", "방금 막 올라왔어요", "핵심 인재들이 주목해요" 등) 전면 차단/평점 지원, 4대 메인 광고 섹션("나에게 꼭 맞는 공고", "주목할 만한 JOB", "놓치면 아쉬운 JOB", "지원자가 몰리는 JOB") 및 "TOP 헤드라인 채용관" 프로모션 배너 자동 차단, 비동기 POST 무한 스크롤 자동 변환 |
| **리멤버 (Remember)** | 채용목록, 인기/큐레이션 공고, 상세페이지 | 상단 **"프리미엄 대표기업"** 및 대형 광고 캐러셀 배너 자동 숨김, 인기 공고 가로 캐러셀 필터링 |
| **점핏 (Jumpit)** | 채용목록(`/positions`), 상세페이지(`/position/*`) | Next.js 모던 SPA 그리드 최적화, 사이드 윙 배너 및 상단 프로모션 배너 자동 차단 |

> **💡 스마트 상세페이지 이탈 가드**: 단일 공고 상세페이지에서 [공고숨김] 또는 [회사차단] 시, 브라우저 히스토리가 있으면 **이전 목록으로 즉시 뒤로가기**, 새 탭으로 열렸으면 **현재 탭을 자동 종료**하여 탐색 흐름을 매끄럽게 유지합니다.

### 3. ⭐ 잡플래닛 & 블라인드 듀얼 기업 평점 연동
- **기업명 옆 실시간 듀얼 뱃지**: 원티드, 사람인, 잡코리아, 리멤버, 점핏 등 모든 지원 사이트의 회사명 바로 옆에 **초록색 잡플래닛**과 **빨간색 블라인드** 평점 뱃지를 나란히 렌더링합니다.
- **상세 안내 툴팁 & 원클릭 이동**: 뱃지에 마우스를 올리면 평점 상세 안내가 노출되며, 클릭 시 해당 기업의 리뷰 페이지로 즉시 이동합니다.
- **동명 기업 오표기 원천 차단 (Anti-Ambiguity)**: 동일 상호(동명) 기업이 복수로 검색되거나 평점이 특정되지 않는 경우, 잘못된 정보 노출을 방지하기 위해 뱃지를 자동으로 제외합니다.
- **2계층 스마트 캐시 & WAF 보호**: 인메모리 및 로컬 스토리지 2계층 캐시와 동시성 스로틀링(풀링)을 적용하여 플랫폼 차단 없이 수초 내에 평점을 안전하게 로드합니다.
- **독립적 ON/OFF 제어**: 팝업 설정에서 잡플래닛과 블라인드 평점 표시 여부를 각각 개별적으로 켜고 끌 수 있습니다.

### 4. 🔄 페이지네이션 ➔ 무한 스크롤 변환 & 초고속 프리페치
- **무한 스크롤 자동 변환**: 사람인, 잡코리아 등 번호를 일일이 클릭해야 하는 구형 페이지네이션을 스크롤만으로 다음 공고를 계속 불러오는 무한 스크롤로 자동 개조합니다.
- **초고속 백그라운드 프리페치 (Zero-Delay Prefetch)**: 화면 바닥에 닿기 약 1.5~2화면 전(`rootMargin: 1200px`)에 백그라운드에서 다음 공고를 선제적으로 수신하며, 사용자 스크롤 시 인위적 지연(0ms)을 제거하여 로딩 스피너 대기 없이 매끄러운 연속 탐색(체감 로딩 0초)을 제공합니다.
- **단일 Reflow 배치 렌더링 (DocumentFragment)**: 수십 개의 공고 카드를 브라우저 메모리 상에서 일괄 조립한 뒤 단 1회만 DOM에 삽입하여, 다중 리플로우로 인한 화면 깜빡임과 버벅임을 원천 제거합니다.
- **빈 화면 방지 자동 채우기 (Auto-Refill)**: 차단된 공고가 많아 화면이 텅 비는 경우, 백그라운드에서 다음 페이지 공고를 즉시 긁어와 유효한 공고로 화면을 자동으로 채워줍니다 (최대 5페이지 연속 탐색, 서버 보호용 150ms 스로틀 적용).
- **무한 루프 방지 & 네트워크 안정성**: 10초 타임아웃 가드와 중복 공고 감지 로직을 적용하여 네트워크 지연이나 마지막 페이지 도달 시 로딩 스피너가 멈추지 않는 현상을 원천 방지합니다.
- **스피너 표시 상태 머신 (`.is-active`)**: 로딩 인디케이터의 표시 여부를 인라인 스타일이 아닌 상태 클래스로만 제어합니다. 콘텐츠 스크립트 CSS의 `display: flex !important` 가 인라인 `display: none` 을 덮어써 **로딩 중이 아닐 때도 스피너가 화면 하단에서 무한 회전하던 버그**를 차단했고, 회전 애니메이션도 실제 로딩 중에만 구동되어 유휴 시 CPU/GPU 를 낭비하지 않습니다.
- **연속 실패 시 안전 종료 (Fail-Fast)**: 다음 페이지 요청이 연속 3회 실패하면(서버 오류·WAF 차단·네트워크 리셋 등) 센티넬을 제거하고 무한 스크롤을 종료한 뒤 "다음 공고를 불러오지 못했습니다" 안내를 표시합니다. 실패 시 센티넬이 화면에 남아 `요청→실패→재요청` 을 무한 반복하며 스피너가 영구히 도는 현상을 방지합니다.
- **광고 영역 컨테이너 하이재킹 차단**: 사람인 직업별 목록(`/jobs/list/job-category`)의 초기 HTML 은 실제 공고 목록이 RequireJS 로 나중에 채워지고, 그 전에는 네이버 파워링크 광고 블록(`#powerLink`) 안에만 `.list_item` 이 존재합니다. 광고 목록을 공고 컨테이너로 오인해 그 안에 다음 페이지 공고를 주입하던 오염 경로를 `NON_LIST_REGIONS` 셀렉터로 원천 차단했습니다.

### 5. 📊 대시보드 통계 & 세분화된 필터 관리 (Popup & Options)
- **팝업 통계 듀얼 모드**:
  - **[전체 등록]**: 등록된 전체 차단 회사, 숨긴 공고, 키워드 누적 건수를 직관적으로 표시
  - **[현재 페이지]**: 현재 열린 채용 사이트 화면에서 실시간으로 필터링된 공고/회사/광고 차단 수치를 즉시 집계
- **다차원 2단 필터 탭 (Options)**:
  - **유형별 탭**: [전체] / [회사] / [공고] / [키워드]
  - **플랫폼별 탭**: [전체 플랫폼] / [원티드] / [사람인] / [잡코리아] / [리멤버] / [점핏] / [직접등록]
- **스마트 수명 관리 (TTL) & 백업**:
  - 공고 마감일시를 자동 인식하여 마감 후 30일 경과 시 백그라운드 자동 청소(Lazy Auto-Purge)
  - 환경설정에서 `[🧹 만료 공고 정리]` 수동 원클릭 지원 및 JSON 백업/복원 기능 제공

### 6. 🔒 안심 개인정보 보호 & 사용자 소통
- **무수집 원칙 (Zero Data Collection)**: 사용자 계정, 이력서, 탐색 기록 등 어떠한 개인 식별 정보(PII)도 수집하거나 외부 서버로 전송하지 않으며, 모든 데이터는 브라우저 로컬 저장소에만 보관됩니다 ([개인정보처리방침](./PRIVACY_POLICY.md)).
- **Google Forms 원클릭 피드백**: 팝업 및 옵션 푸터의 `[💬 문의/피드백]` 링크를 통해 별도 로그인 없이 건의사항 및 버그를 간편하게 전달할 수 있습니다.
- **크롬 웹스토어 리뷰 유도 배너**: 팝업 상단에 친근한 리뷰 유도 배너를 제공하며, `[다시 보지 않기]` 클릭 시 영구 숨김 처리됩니다.

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
├── utils/                     # 공통 유틸리티
│   ├── text.ts                # 회사명 정규화(normalizeCompanyName)
│   └── date.ts                # 공고 마감일시 파싱 및 만료시간 계산
├── adapters/                  # 플랫폼별 고유 DOM 셀렉터 및 파서 (어댑터 패턴)
│   ├── base.ts                # BaseSiteAdapter 추상 클래스 ([차단] 인라인 버튼 주입)
│   ├── wanted.ts              # 원티드(Wanted) 어댑터
│   ├── jumpit.ts              # 점핏(Jumpit) 어댑터
│   ├── saramin.ts             # 사람인(Saramin) 어댑터
│   ├── jobkorea.ts            # 잡코리아(JobKorea) 어댑터
│   ├── remember.ts            # 리멤버(Remember) 어댑터
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

프로젝트 품질 관리 기준에 따라 모든 단위 테스트와 E2E 테스트가 100% 통과해야 합니다.

### 단위 테스트 (Unit Tests)
```bash
npm run test
```

### E2E 테스트 (Playwright)
```bash
npm run test:e2e
```

---

## 🔒 개인정보처리방침 (Privacy Policy)

본 확장 프로그램은 사용자의 어떠한 개인 식별 정보(PII)나 탐색 기록도 수집·저장·전송하지 않습니다. 모든 차단 데이터 및 설정값은 사용자 기기의 브라우저 로컬 저장소(`chrome.storage.sync` / `local`)에만 안전하게 보관됩니다.
상세한 내용은 [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) 문서를 참고하시기 바랍니다.

---

## 💬 문의 및 피드백 (Support & Feedback)

- **온라인 문의 및 버그 제보**: [Google Forms 온라인 접수](https://docs.google.com/forms/d/e/1FAIpQLSc8dy59w4vzCQZ5oWlTtMY8DEEeFbX5ktvS4I7ZOOlLwWZcKQ/viewform)
- **GitHub 저장소 및 이슈 제보**: [nicebyy/job-blockingV2](https://github.com/nicebyy/job-blockingV2)
- **크롬 웹스토어 리뷰**: 확장 프로그램 사용 후 유용하셨다면 웹스토어에 별점 5점과 따뜻한 리뷰를 남겨주세요! ⭐

