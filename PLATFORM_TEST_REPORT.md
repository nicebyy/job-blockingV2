# 플랫폼별 통합 테스트 결과 보고

- **작성일**: 2026-10-27 (정정 반영)
- **테스트 파일**:
  - `tests/unit/platform-integration.test.ts` — 74개 (5개 플랫폼 × 공통 시나리오)
  - `tests/unit/platform-integration-bugs.test.ts` — 5개 (회귀 + 미해결 결함)
  - `tests/unit/helpers/platform-fixtures.ts`, `mock-chrome.ts` — 공용 헬퍼

---

## 0. 정정 이력 (중요)

초기 보고서에서 **리멤버(Remember) 목록 셀렉터 불일치**를 `[High] BUG-1` 로 기재했으나,
**이것은 오진이었습니다.** 철회합니다.

### 오진의 원인

기존 `tests/fixtures/remember_postings.html` 은 리멤버 목록 페이지의 **정상 렌더링 상태가 아니라
Next.js 하이드레이션 직후의 스켈레톤 로딩 상태**를 캡처한 것이었습니다.

| 확인 항목 | 스켈레톤 픽스처(기존) | 렌더링 완료 픽스처(신규) |
| :--- | :---: | :---: |
| `h3`/`h4` 실제 공고 제목 | **0개** | 다수 |
| `sc-3c9cd5df` (코드 기대 클래스) | **0개** | **50개** |
| `sc-364cfa5d` (코드 기대 클래스) | **0개** | **30개** |
| `sc-289d3ccd` (코드 기대 클래스) | **0개** | **10개** |
| `skeleton`/`loading` 키워드 | 16회 | - |
| `__NEXT_DATA__` 내 공고 배열 | 없음 (`postingId` 0개) | - |
| `getJobCardElements()` | 1 | **91** |
| `parseCard()` 성공 | **0** | **90** |

스켈레톤 상태의 `<li>` 는 아래처럼 **빈 placeholder div 만** 담고 있었습니다.

```
<li class="sc-a34accef-0 iVrFvG">
  <div class="sc-3510865a-0 coSflS">
    <div class="sc-3510865a-1 sc-ae9ca0f6-0 jqmzNB fIhlUp"></div>   <!-- 빈 div -->
  </div>
  ...
</li>
```

`/job/posting/` 링크 2개도 실제 공고가 아니라 **광고 배너**(`ad-cdn`, `alt="광고"`, `rel="sponsored"`)였습니다.

### 결론

**리멤버는 정상 동작합니다.** 실제 브라우저에서 렌더링이 끝난 DOM 에서는
91개 카드 중 90개가 회사명·제목·jobId 까지 완벽히 파싱됩니다.
코드가 기대하는 styled-components 해시도 실제로 존재합니다.

### 재발 방지

React/Next.js 같은 SPA 사이트는 정적 HTML 만으로 검증할 수 없습니다. 이번에
`scripts/collect-rendered-fixture.mjs` (Playwright 로 JS 실행 후 DOM 덤프)를 추가하여
**렌더링 완료 DOM 을 픽스처로 사용**하도록 변경했습니다.

---

## 1. 테스트 구성

기존 `adapters.test.ts`(170KB)가 **개별 파싱 함수**를 검증하는 것과 달리, 이 스위트는
**실제 사이트 HTML → 어댑터 → 필터 엔진 → DOM 반영**의 전 과정을 플랫폼별로 검증한다.

| 검증 축 | 내용 |
| :--- | :--- |
| 어댑터 라우팅 | 10개 URL → 올바른 어댑터 매핑, 점핏/사람인 오라우팅 방지, 미지원 사이트 null |
| 카드 추출 | 실제 HTML에서 카드 요소 수집 |
| 필드 파싱 | 회사명/제목/jobId 추출, 더미 텍스트('기업정보') 배제, 멱등성 |
| 회사 차단 | 차단 시 실제 DOM `display:none`, 비차단 카드 오탐 없음, blur 모드 동작 |
| 공고 단위 숨김 | 특정 공고만 숨기고 같은 회사 다른 공고 유지 |
| 광고 숨김 | `hidePromotionBanners` 개수 반환, 복원 양방향 멱등성 |
| 전체 흐름 | `ContentController.init()` → 실제 차단 적용 + 통계 집계 |
| 상세페이지 판정 | 5개 플랫폼의 목록/상세 URL 구분 |

### 픽스처

| 플랫폼 | 파일 | 크기 | 카드 수 | 수집 방식 |
| :--- | :--- | ---: | ---: | :--- |
| 원티드 | `wanted_wdlist_rendered.html` | 291KB | 60 | **실브라우저 렌더링** |
| 사람인 | `saramin_search.html` | 46KB | 8 | 원본 샘플에서 구조 보존 추출 |
| 잡코리아 | `jobkorea_joblist.html` | 1,094KB | 63 | 정적 HTML (SSR) |
| 리멤버 | `remember_postings_rendered.html` | 243KB | 91 | **실브라우저 렌더링** |
| 점핏 | `jumpit_positions.html` | 64KB | 16 | 정적 HTML (SSR) |

> 원티드/리멤버는 SPA 이므로 `scripts/collect-rendered-fixture.mjs` 로
> Playwright(Chromium)에서 JS 실행 + 스크롤 + 렌더 안정화 후 DOM 을 덤프했다.
> `scripts/clean-rendered-fixture.mjs` 로 script/iframe/preload 만 제거하고
> **DOM 구조와 클래스는 원본 그대로 유지**했다.

---

## 2. 플랫폼별 동작 현황 (실측)

| 플랫폼 | 카드 추출 | 파싱 | 회사 차단 | 공고 숨김 | 광고 숨김 | 상태 |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **원티드** | 60 | 60/60 | ✅ | ✅ | ✅ | 정상 (BUG-2 참고) |
| **사람인** | 8 | 8/8 | ✅ | ✅ | ✅ | 정상 |
| **잡코리아** | 63 | 63/63 | ✅ | ✅ | ✅ | 정상 |
| **리멤버** | 91 | **90/91** | ✅ | ✅ | ✅ | **정상** |
| **점핏** | 16 | 16/16 | ✅ | ✅ | ✅ | 정상 |

**결과: 5개 플랫폼 전부 정상 동작 확인**

---

## 3. 발견 결함

### [BUG-2 / Medium] 원티드(Wanted) 마감일 추출이 지역·경력 텍스트를 반환

- **위치**: `src/constants/index.ts` `WANTED_SELECTORS.CLOSING_DATE` 1번째 셀렉터
  `span[class*="CompanyNameWithLocationPeriod__location"]`
- **원인**: 이 클래스는 실제로 **"서울 서초구 · 경력 4-8년"** 같은 지역/경력 정보를 담는다.
  마감일이 아니다. 코드 주석상 마감일로 의도한 것으로 보이나 실제 DOM과 의미가 다르다.
- **실측(렌더링 완료 DOM)**: 원티드 카드 60개 **전부**에서
  `closingDate = "서울 서초구 · 경력 4-8년"` 형태로 추출됨.
  같은 셀렉터의 다른 후보(`.due-date`, `[class*="dueDate"]`, `[class*="due_date"]`)는
  **매칭 0개** — 즉 원티드 목록 카드에는 마감일 자체가 없다(상세페이지에서만 노출).
- **영향**: `calculateJobExpiration()` 이 이 문자열을 파싱하지 못해 `null` → **"등록 시점 + 30일"**
  기본 만료로 처리된다. 즉 **마감일 기반 TTL 자동 정리가 원티드에서 동작하지 않는다.**
  다만 이는 "숨긴 공고가 마감 후 30일 뒤 자동 정리되는" **부가 기능**이며,
  **핵심 필터링(숨김/차단) 동작에는 영향이 없다.**
- **권장 수정**: 원티드 목록에는 마감일이 없으므로 `CLOSING_DATE` 에서 지역/경력 클래스 셀렉터를
  제거하고, 마감일이 없는 사이트로 취급(기본 30일 TTL)하는 것이 정확하다.
  또는 상세페이지에서 마감일을 읽어오는 별도 경로를 둔다.
- **테스트**: `platform-integration-bugs.test.ts` 의 `[BUG-2]` (현재 `it.fails` — 수정되면 갱신 신호)

### [Info] 잡코리아 회사명 표기 변형

`케이에이치컨설팅㈜`, `(유)타라스페이스(TARA SPACE)` 등 표기 변형이 많으나
`normalizeCompanyName` 이 `㈜`/`(유)` 제거 후 비교하므로 **중복 차단 방지 및 매칭은 정상**이다.

---

## 4. 테스트 실행 결과

```
tsc --noEmit        : exit 0
단위 테스트          : 340 passed (19 files) — skip 0
  ├ platform-integration.test.ts      : 74
  └ platform-integration-bugs.test.ts : 5
E2E 테스트           : 6 passed
빌드                 : 성공
```

- **skip 0**: 과거 리멤버 오진으로 제외했던 테스트를 모두 활성화했다.
- **`it.fails`**: BUG-2 는 현재 실패하는 것이 정상이며, 수정되는 순간
  테스트가 깨져 "이 항목을 갱신하라"는 신호를 준다.

---

## 5. 권고

1. **BUG-2 (원티드 마감일)** — TTL 부가 기능이 무력화되어 있다. 잘못된 셀렉터를 제거할 것.
   핵심 필터링에는 영향 없으므로 우선순위는 Medium.
2. **SPA 픽스처 수집 자동화** — `scripts/collect-rendered-fixture.mjs` 를 유지보수 도구로
   편입하여, 사이트 구조 변경 시 렌더링 픽스처를 재수집할 수 있게 할 것.
3. **정적 HTML 픽스처의 한계 인지** — React/Vue/Svelte SPA 는 반드시 렌더링 후 DOM 으로 검증.
   이번 오진의 교훈이다.
