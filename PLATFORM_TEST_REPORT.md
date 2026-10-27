# 플랫폼별 통합 테스트 결과 보고

- **작성일**: 2026-10-27
- **브랜치**: `test/platform-integration` (base: `origin/develop` @ `1db9c61`)
- **테스트 파일**:
  - `tests/unit/platform-integration.test.ts` — 73개 (5개 플랫폼 × 공통 시나리오)
  - `tests/unit/platform-integration-bugs.test.ts` — 5개 (발견 결함 문서화)
  - `tests/unit/helpers/platform-fixtures.ts`, `mock-chrome.ts` — 공용 헬퍼

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

| 플랫폼 | 파일 | 크기 | 카드 수 |
| :--- | :--- | ---: | ---: |
| 원티드 | `wanted_wdlist.html` (기존) | 312KB | 20 |
| 사람인 | `saramin_search.html` (**신규 생성**) | 46KB | 8 |
| 잡코리아 | `jobkorea_joblist.html` (기존) | 1,094KB | 63 |
| 리멤버 | `remember_postings.html` (기존) | 135KB | 1 (파싱 0) |
| 점핏 | `jumpit_positions.html` (기존) | 64KB | 16 |

> 사람인 픽스처는 2.4MB 원본 샘플에서 실제 DOM 구조를 그대로 보존하며 8개 카드만
> 잘라내 생성했다 (`scripts/make-saramin-fixture.mjs`). 셀렉터/구조를 임의로 바꾸지 않았다.

---

## 2. 플랫폼별 동작 현황 (실측)

| 플랫폼 | 카드 추출 | 파싱 | 회사 차단 | 공고 숨김 | 광고 숨김 | 상태 |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **원티드** | 20 | 20/20 | ✅ | ✅ | ✅ | 정상 (단, 마감일 버그 ↓) |
| **사람인** | 8 | 8/8 | ✅ | ✅ | ✅ | 정상 |
| **잡코리아** | 63 | 63/63 | ✅ | ✅ | ✅ (3건) | 정상 |
| **리멤버** | 1 | **0/1** | ❌ | ❌ | ✅ | **셀렉터 불일치 (BUG-1)** |
| **점핏** | 16 | 16/16 | ✅ | ✅ | ✅ | 정상 |

**결과: 5개 중 4개 플랫폼 정상, 리멤버 1개 목록 기능 전면 불능**

---

## 3. 발견 결함

### [BUG-1 / High] 리멤버(Remember) 목록 셀렉터가 실제 DOM과 불일치

- **위치**: `src/constants/index.ts` `REMEMBER_SELECTORS.JOB_CARDS` / `CARD_CONTAINER` / `GRID_ITEM`
- **원인**: 리멤버가 styled-components 해시를 변경했다. 코드는 `sc-364cfa5d-0`, `sc-18344c98-0`,
  `sc-d2fb7cfc-0`, `sc-3c9cd5df-0`, `sc-289d3ccd-0` 를 기대하지만, 실제 픽스처에는
  이 중 **하나도 존재하지 않는다**. 실제로는 `sc-802949b9-0`, `sc-3510865a`, `sc-ae9ca0f6`,
  `sc-a34accef` 등이 쓰인다.
- **실측 영향**:
  - `getJobCardElements()` → 카드 1개만 반환 (href 폴백 `a[href*="/job/posting/"]` 에 걸린 요소)
  - `parseCard()` → **null 반환** (회사명/제목 모두 추출 실패)
  - 결과: 목록에서 **회사 차단·공고 숨김·평점 뱃지 전부 동작하지 않음**
- **완화 요인**: 상세페이지(`/job/posting/\d+`)는 `isDetailPage` 가 별도 URL 패턴으로 동작하므로
  상세페이지 차단은 정상. 그러나 그 진입 경로인 목록 화면이 무력하다.
- **권장 수정**: 해시 클래스 의존을 줄이고 **의미 있는 속성/구조 기반 셀렉터**로 전환할 것.
  예) `li:has(a[href*="/job/posting/"])`, `[data-testid]`, 또는 `a[href*="/job/posting/"]` 의
  가장 가까운 `li` 조상. 해시는 배포마다 바뀌므로 회귀가 반복된다.
- **테스트**: `platform-integration-bugs.test.ts` 의 `[BUG-1]` (현재 `it.fails` — 수정되면 실패하여 갱신 신호)

### [BUG-2 / Medium] 원티드(Wanted) 마감일 추출이 지역·경력 텍스트를 반환

- **위치**: `src/constants/index.ts` `WANTED_SELECTORS.CLOSING_DATE` 1번째 셀렉터
  `span[class*="CompanyNameWithLocationPeriod__location"]`
- **원인**: 이 클래스는 실제로 **"서울 서초구 · 경력 4-8년"** 같은 지역/경력 정보를 담는다.
  마감일이 아니다. 코드 주석상 마감일로 의도한 것으로 보이나 실제 DOM과 의미가 다르다.
- **실측**: 원티드 픽스처 20개 카드 전부에서
  `closingDate = "서울 서초구 · 경력 4-8년"` 형태로 추출됨.
- **영향**: `calculateJobExpiration()` 이 이 문자열을 파싱하지 못해 `null` → **"등록 시점 + 30일"**
  기본 만료로 처리된다. 즉 **마감일 기반 TTL 자동 정리가 원티드에서 사실상 동작하지 않는다.**
  기능이 조용히 성능 저하(graceful degradation)되는 유형이라 사용자가 인지하기 어렵다.
- **권장 수정**: 마감일 전용 셀렉터(`.due-date`, `[class*="dueDate"]` 등)만 남기고
  지역/경력 클래스는 제거. 또는 마감일 텍스트 패턴(`D-\d+`, `~ MM/DD`, `상시`)으로 검증 후 채택.
- **테스트**: `platform-integration-bugs.test.ts` 의 `[BUG-2]` (현재 `it.fails`)

### [BUG-3 / Info] 통합 테스트 과정에서 확인된 사항

- 잡코리아는 `isAd=true` 카드가 3건 존재하며, `hideAds` 기본값이 `true` 이므로
  "회사 차단만 검증"하는 테스트에서는 광고 필터를 명시적으로 꺼야 오탐이 나지 않는다.
  (테스트 헬퍼 `testSettings()` 에서 `hideAds: false` 기본 적용)
- 잡코리아 회사명은 `케이에이치컨설팅㈜`, `(유)타라스페이스(TARA SPACE)` 처럼 표기 변형이 많다.
  `normalizeCompanyName` 이 `㈜`/`(유)` 제거 후 비교하므로 **중복 차단 방지 및 매칭은 정상 동작**한다.

---

## 4. 테스트 실행 결과

```
tsc --noEmit        : exit 0
단위 테스트          : 331 passed | 8 skipped (19 files)
  ├ platform-integration.test.ts      : 73 (65 passed, 8 skipped)
  └ platform-integration-bugs.test.ts : 5 (4 passed, 1 skipped)
E2E 테스트           : 6 passed
빌드                 : 성공
```

- **8 skipped**: 리멤버 관련 테스트 (BUG-1 미해결로 인한 의도적 제외).
  셀렉터가 수정되면 `KNOWN_BROKEN_SELECTOR_PLATFORMS` 에서 `remember` 를 제거하면
  자동으로 활성화되어 회귀 검증이 가능하다.
- **`it.fails`**: BUG-1/BUG-2 는 현재 실패하는 것이 정상이며, 수정되는 순간
  테스트가 깨져 "이 항목을 갱신하라"는 신호를 준다.

---

## 5. 권고

1. **BUG-1 (리멤버) 즉시 수정 권장** — 목록 화면의 모든 기능이 죽어 있다.
   해시 클래스 대신 구조 기반 셀렉터로 전환해 재발을 방지할 것.
2. **BUG-2 (원티드 마감일)** — TTL 기능이 조용히 무력화되어 있다.
   잘못된 셀렉터를 제거하고 마감일 패턴 검증을 추가할 것.
3. 수정 후 `KNOWN_BROKEN_SELECTOR_PLATFORMS` 에서 `remember` 를 제거하고 전체 재검증.
