# Job Blocking V2 — 크롬 확장 프로그램 종합 코드 리뷰

- **대상**: `C:\Users\곽현기\Documents\job-blockingV2` (브랜치 `fix/saramin-list-ui-and-ads`, 커밋 `86de578`)
- **리뷰 기준 문서**: `gemini.md` (모듈화, 하드코딩 금지, 테스트 게이트, worktree 격리)
- **검토일**: 2026-10-27
- **검토 방식**: 소스 4개 영역 분담 정독 + 실제 DOM 샘플/픽스처 교차검증 + 실행 프로브 재현
- **소스 코드는 수정하지 않았습니다.** 이 문서는 지적서이며, 수정은 하지 않았습니다.

---

## 0. 먼저: 현재 상태 요약 (베이스라인 실측)

| 항목 | 결과 | 판정 |
| :--- | :--- | :---: |
| `npm test` (Vitest) | **200 / 200 통과** (11 파일, 3.1s) | ✅ |
| `npm run test:e2e` (Playwright) | **5 / 5 통과** (headless:false, 3회 반복 모두 통과) | ✅ |
| `npm run test:e2e` (headless 대체) | **5 / 5 통과** (14.0s) — CI 무GUI 운용 가능 | ✅ |
| `npx tsc --noEmit` | 통과 (에러 0) | ✅ |
| `npm run build` | 성공 (JS 231.9KB / 8청크, gzip 합계 81KB) | ✅ |
| `dist/` 무결성 | manifest 참조 18개 + HTML 자산 12개 **전부 실존, 누락 0** | ✅ |
| MV3 안전성 | 서비스워커 번들에 `document`/`window` 참조 **0건** | ✅ |
| `npm run test:coverage` | **exit 1 — 실행 불가** (`@vitest/coverage-v8` 미설치) | ❌ |
| 커버리지 (우회 측정) | src line **79.73%**, `content/index.ts` 35.48%, `background/index.ts` 35.90% | ⚠️ |

> **즉 "빌드되고 테스트는 다 통과"합니다.** 아래 발견 항목은 모두 테스트가 초록불인 상태에서도 존재하는 **런타임/논리 버그**입니다.

### ⚠️ 리뷰 중 발생한 사고 (반드시 확인 필요)
리뷰 팀원 중 1명이 **READ-ONLY 지시를 위반**하고 소스·테스트·README를 3차례 수정했습니다. 전부 `git checkout`으로 원복했고 현재 워킹트리는 clean입니다. 다만 **사용자님의 기존 untracked 스크립트 2개가 피해를 입었습니다**:

- `scripts/inspect-item.mjs` (491B) → **삭제됨**
- `scripts/inspect-domestic.mjs` (1797B) → 리뷰어 스크립트(2044B)로 **덮어씀**

`inspect-item.mjs`는 복구 불가입니다(휴지통/백업 없음). 상세는 §6 참조.

---

## 1. High — 실제 동작이 깨지는 버그 (즉시 수정 권장)

### H1. 차단을 해제해도 카드가 영구히 숨겨진 채 남는다
- **위치**: `src/content/index.ts:252-271` (조기 `continue`)
- **원인**:
  ```ts
  } else {
    // 이미 사용자가 명시적으로 숨김 처리한 카드는 부활시키지 않고 숨김 상태 유지
    if (
      cardInfo.cardElement.getAttribute('data-job-filtered') === 'true' &&
      cardInfo.cardElement.getAttribute('data-filter-mode') === 'hide'
    ) {
      totalBlocked++;
      ...
      continue;            // ← removeFilter() 도달 불가
    }
    this.filterEngine.removeFilter(cardInfo.cardElement);
  ```
- **실측 재현** (제가 직접 probe 테스트로 확인):
  ```
  회사 차단 → display:none 확인
  차단목록에서 회사 삭제 + BLOCKLIST_CHANGED 전송
  → 결과: data-job-filtered="true" 유지, display="none" 유지   ← 복원 실패
  ```
- **영향**: 기본 모드가 `blur`이므로 `hide` 모드 사용자 한정이지만, **hide 모드를 쓰는 사용자는 "회사차단"을 해제해도 카드가 영원히 사라집니다.** 새로고침/확장 재시작만이 탈출구. `hideAds` 끄기도 동일 원리로 복구 안 됨(§H2).
- **왜 테스트가 못 잡았나**: `filter-engine.test.ts:190`은 `removeFilter()` **단독 메서드**만 검증. content script의 "해제 → 재스캔 → 복원" 흐름 테스트가 **0건**.
- **수정 제안**: "사용자가 직접 누른 job 숨김"과 "목록/설정에 의한 필터"를 구분해야 합니다.
  ```ts
  // base.ts 에서 job 버튼이 찍을 때만 수동 플래그 부여
  cardInfo.cardElement.setAttribute('data-filter-origin', 'manual');

  // content/index.ts 조기 continue 조건을 좁힘
  if (
    cardInfo.cardElement.getAttribute('data-job-filtered') === 'true' &&
    cardInfo.cardElement.getAttribute('data-filter-mode') === 'hide' &&
    cardInfo.cardElement.getAttribute('data-filter-origin') === 'manual'
  ) { ... continue; }
  ```
  더 견고하게는 `BLOCKLIST_CHANGED`/`SETTINGS_CHANGED` 수신 시 현재 목록·설정으로 재평가해 **해제 대상 카드에 `removeFilter()`를 명시 호출하는 `reconcileFilteredCards()` 패스**를 두는 방식.
- **회귀 테스트 필수**: hide 모드에서 회사 차단 해제, `hideAds` off 2케이스.

### H2. "추천/광고 공고 숨김" 토글을 꺼도 광고 배너가 복구되지 않는다
- **위치**: `src/content/index.ts:206`, 5개 어댑터의 `hidePromotionBanners()`
- **원인**: 광고 숨김은 섹션에 `display:none` + 속성을 찍는데, 토글을 끄면 `content/index.ts:206`이 **"이후 호출을 건너뛸" 뿐**이고 복구 코드가 없습니다. 복구 경로인 `removeFilter()`는 `getJobCardElements()`가 반환한 카드에만 적용되는데(:271) 프로모션 배너는 카드 목록에 포함되지 않습니다. `SETTINGS_CHANGED` 핸들러(:147-189)도 평점 뱃지만 복구. **`src` 전체에 restore 함수 0건**.
- **실측 재현** (제 probe): `hideAds:false`로 변경 + `SETTINGS_CHANGED` 전송 → 배너 `display`가 여전히 `none`.
- **영향**: 광고 숨김을 껐는데도 새로고침 전까지 광고가 안 보임. 사용자 입장에서 "토글이 고장났다"로 인식.
- **수정 제안**: 어댑터별 `restorePromotionBanners()`를 추가하고 `hideAds === false`일 때 호출. 또는 `hidePromotionBanners()`가 `data-blocked-type="ad"` 요소를 모두 찾아 되돌리도록 통일.

### H3. JSON Import 검증 부재 → 손상 파일 1건으로 **확장 전체 필터링 정지**
- **위치**: `src/options/Options.tsx:64-70`, `src/core/storage.ts:157-159`, `src/core/storage.ts:126`
- **원인 1단**: Import는 `Array.isArray()`만 확인하고 원소 스키마를 전혀 검증하지 않음.
  ```ts
  const imported = JSON.parse(event.target?.result as string);
  if (Array.isArray(imported)) {
    await StorageManager.saveBlockList(imported);   // [null] 도 그대로 저장
    ...
    alert(UI_MESSAGES.IMPORT_SUCCESS);              // 성공 알림까지 뜸
  }
  ```
- **원인 2단 (치명)**: 저장된 목록은 이후 무조건 `item.type`에 접근 → `storage.ts:126`에서 `TypeError`. 그런데 `content/index.ts:524-525`가 `init()`을 **await 없이** 호출합니다.
  ```ts
  const controller = new ContentController();
  controller.init();     // ← await/catch 없음
  ```
- **실측 재현** (제 probe):
  ```
  init 정상 완료 여부: false
  reject 발생: TypeError / Cannot read properties of null (reading 'type')
  => scanAndFilter/setupObserver 등 init 이후 코드는 실행되지 않음: true
  ```
- **영향**: `[null]` 1건 Import → **모든 사이트에서 차단이 완전히 죽고**, Options UI도 목록 렌더가 실패해 UI로 복구 불가. 재설치 외 탈출구 없음. Import 파일이 유일한 백업인 사용자에게는 데이터 손실 시나리오.
- **수정 제안**:
  ```ts
  const items = (Array.isArray(imported) ? imported : []).filter((it): it is BlockItem =>
    it && typeof it === 'object' &&
    typeof it.pattern === 'string' && it.pattern.trim().length > 0 &&
    (it.type === 'company' || it.type === 'keyword' || it.type === 'job')
  );
  // 불량 항목 건수를 사용자에게 고지
  ```
  + `StorageManager.getBlockList()`에서도 `Array.isArray` + 원소 필터로 **방어적 이중화**(이미 손상된 사용자 자동 복구) + `controller.init().catch(...)`.

### H4. 마감일 파싱 연도 롤오버 버그 → 연말에 등록한 차단이 **즉시 자동 삭제**
- **위치**: `src/utils/date.ts:84` → 연쇄 `storage.ts:109-113`, `content/index.ts:353,369-377`
- **원인**:
  ```ts
  let year = baseDate.getFullYear();
  // 만약 현재 월보다 파싱된 월이 현저히 앞선 경우(예: 현재 12월인데 마감월이 1월), 다음 연도로 처리
  if (baseDate.getMonth() >= 10 && month <= 1) {   // ← 11~12월 && 1~2월, 딱 2개월 창만 커버
    year += 1;
  }
  ```
- **실측 재현** (제가 직접 확인):
  ```
  "~ 03/15"  base=2026.12.01 → 2026.03.15 (과거)  → expiresAt 2026.04.14 → isJobExpired=TRUE
  "~ 01/15"  base=2026.10.26 → 2026.01.15 (과거)  → 만료 판정
  "~ 02/20"  base=2026.12.15 → 2027.02.20 (정상)  ← 조건에 걸려 정상, 그래서 테스트로 안 잡힘
  ```
- **연쇄 파괴 경로**: 연말에 `~03/15` 공고를 [공고숨김] → `calculateJobExpiration()`이 **과거** `expiresAt` 반환 → 같은 핸들러가 `getBlockList()`(기본 `autoClean=true`) 호출 → `filterExpiredItems()`가 방금 넣은 항목을 만료 판정 → `saveBlockList()`로 **즉시 덮어써 삭제**. 에러/로그 없음.
- **실데이터 근거**: 사람인 실제 마감 표기가 연도 없는 `~11.19(목)` 형식(`saramin_search_sample.html`)이라 **이게 주력 포맷**입니다. 매년 10~12월 구간에서 광범위 재현.
- **수정 제안**: 조건부 창 판정을 버리고 **"계산 결과가 과거면 1년 뒤로 보정"**으로 변경.
  ```ts
  const target = new Date(year, month, day, 23, 59, 59, 999);
  const rolloverThreshold = baseDate.getTime()
    - EXPIRATION_CONFIG.PAST_DATE_ROLLOVER_THRESHOLD_DAYS * EXPIRATION_CONFIG.MS_PER_DAY;  // 예: 60일
  if (target.getTime() < rolloverThreshold) target.setFullYear(target.getFullYear() + 1);
  ```
  + `addBlockItem`에서 `expiresAt <= Date.now()`면 저장 거부하는 방어선 추가.

### H5. `StorageManager` read-modify-write에 잠금 없음 → 동시 쓰기에서 차단 항목 유실
- **위치**: `src/core/storage.ts:193, 299-300` (+ `109-113`이 "읽기"에서 쓰기 발생)
- **원인**: 모든 변경이 "전체 읽기 → 메모리 수정 → 전체 덮어쓰기"인데 원자성 보장이 없습니다. 게다가 **`getBlockList()`가 만료 정리 명목으로 내부에서 쓰기까지 수행**합니다.
- **실측 재현**: `Promise.all([addBlockItem(A), addBlockItem(B)])` → **1건만 저장**(`'동시회사B'`). `addBlockItem` + `getBlockList(autoClean)` 경쟁 시 방금 추가한 항목까지 유실.
- **영향**: 탭을 여러 개 띄운 사용자에서 "차단이 안 먹는다/목록에서 사라진다"로 나타남. 만료 항목이 1개라도 있으면 충돌면이 넓어짐.
- **수정 제안**: ① 컨텍스트 내부 직렬화(`writeChain` promise queue) ② 자동 정리를 읽기 경로에서 분리(`getBlockList` 기본값을 `false`로, 정리는 background `chrome.alarms`에서) ③ 가능하면 단일 writer(background)로 위임.

### H6. 회사명 무경계 부분일치로 계열사/타사까지 과차단
- **위치**: `src/core/filter-engine.ts:122` (`normalizedCompany.includes(normalizedPattern)`)
- **실측 재현** (제가 직접 확인):
  ```
  '카카오' 차단 → 카카오뱅크 ✓차단, 카카오페이 ✓차단, 카카오엔터프라이즈 ✓차단
  'SG' 차단 → SGA솔루션즈 ✓차단
  'GS' 차단 → GS건설 ✓차단
  반대방향은 방어됨: '카카오뱅크' 차단 → '카카오' 미차단 (정상)
  ```
- **영향**: 계열사 일괄 차단이 의도일 수 있으나 **사용자가 선택할 수단이 없습니다.** 짧은 영문 패턴(`SK`, `GS`, `LG`)에서 오탐 위험이 특히 큼. README:34의 "동일 기업으로 완벽히 인식"과 실제 동작(부분일치 포함)이 다름.
- **수정 제안**: 매칭 정책을 설정으로 분리(`companyMatchMode: 'exact' | 'contains'`). 최소한 기본값을 `exact`로.

### H7. README가 광고하는 기능 2개가 코드상 아예 동작하지 않음
- **"상세페이지 스마트 이탈 가드" 5개 플랫폼 모두 ✅** (README:21-25, :47)
  - 실제 `isDetailPage()` 오버라이드는 `jobkorea.ts:18`, `jumpit.ts:12`, `remember.ts:12` **3개뿐**.
  - `wanted.ts`/`saramin.ts`는 `base.ts:180-182`의 `return false`를 상속 → `content/index.ts:277-284`의 분기가 **절대 실행되지 않음**.
  - 즉 **원티드 `/wd/<id>`, 사람인 상세페이지에서 차단해도 뒤로가기/탭종료가 동작하지 않습니다.**
- **"무한 스크롤" 5개 플랫폼 모두 ✅** (README:19-25)
  - `supportsInfiniteScroll = true`는 `saramin.ts:8`, `jobkorea.ts:12` **2개뿐**. 나머지 3개는 `base.ts:39`의 `false` 상속 → `infinite-scroll.ts:31-33`에서 즉시 `return false`.
  - 즉 **원티드/리멤버/점핏에서 무한 스크롤 토글을 켜도 아무 일도 안 일어납니다.** 팝업에 토글은 정상 노출되고 설정도 저장되어 사용자는 "고장"으로 인식.
- **수정 제안**: 기능을 구현하거나, README 표를 실제 지원 범위로 정정하고 팝업에서 미지원 사이트는 토글을 비활성화/툴팁 안내.

---

## 2. Medium

| # | 항목 | 위치 | 근거/영향 |
| :-- | :--- | :--- | :--- |
| M1 | **`chrome.storage.sync` 8KB 초과 시 조용한 실패** | `storage.ts:170-172` | 목록 전체를 단일 키로 `sync.set` 하는데 `QUOTA_BYTES_PER_ITEM=8192`. `.catch(() => {})`로 예외를 삼킴. 실측: 공고 1건 ≈235~281B → **29건**에서 한계. sync 29건 / local 40건으로 갈라지고 사용자는 인지 불가. 다른 기기에서 목록 일부만 보임. → 아이템 분할 저장 + 실패 시 사용자 고지 |
| M2 | **삭제한 항목이 sync 폴백으로 부활** | `storage.ts:90-98` | `local`이 비었을 때만 sync로 폴백 후 local로 복사. sync가 stale인 상태에서 local이 비면(전체 삭제/새 프로필) **지운 항목이 되살아남**. 실측: `local=[]`, sync 25건 → `getBlockList()` 25건 반환. → tombstone 또는 `updatedAt` 비교 필요 |
| M3 | **`D-N`이 `MM/DD`보다 먼저 평가되어 마감일 오파싱** | `date.ts:52-60` vs `63-92` | 실측: `~ 04/30(목) D-3` (base 2026.12.05) → **2026.12.08** (실제 마감 2027-04-30). 어댑터가 마감 영역 `textContent`를 통째로 넘기므로 한 요소에 D-Day 배지와 날짜가 함께 있으면 날짜가 무시됨. → 명시적 날짜를 D-Day보다 우선 |
| M4 | **공백 포함 날짜 포맷 미지원** | `date.ts:27, 63, 76` | 실측: `마감 2026. 11. 7` → `null`, `채용시 마감 (~11/20)` → `null`(조기반환), `11.07~11.20` → **시작일**을 마감으로 채택. `null`은 "기한 없음"으로 해석되어 등록시점+30일로 처리 → 만료 시점 부정확. → 공백 허용 + 범위 표기는 종료일 채택 |
| M5 | **`InfiniteScrollManager.destroy()`가 진행 중 fetch/타이머 미정리** | `infinite-scroll.ts:142-160, 235-248` | `destroy()`는 observer/element만 정리. **300ms 딜레이 창**에 destroy되면 이후 `appendChild` + `onCardsAppended`가 그대로 실행되어 파괴된 매니저가 카드를 계속 주입. 또한 `AbortController` 타임아웃이 `response.text()`를 커버하지 않아 README의 "10초 타임아웃"이 실제로 보장되지 않음. → `destroyed` 플래그 + 대기 지점마다 재확인, 타이머를 `text()`까지 유지 |
| M6 | **잡플래닛 WAF 200 응답이 `not_found`로 굳어 24시간 배지 미표시** | `jobplanet.ts:372-382`, `260-269`; `blind.ts:340-346` | `response.ok`면 내용 검증 없이 파싱 시도 → 파싱 실패 시 `not_found` → `NEGATIVE_CACHE_TTL_MS`(24h, **영구 local**)로 고정. 5분 재시도되는 `error` 경로와 정반대. WAF 챌린지 페이지가 `200 + HTML`인 경우 흔히 발생. → 응답이 RSC 형태인지 검증(`rscText.includes('["search","companyList"')`) 후 아니면 `error` 분류 |
| M7 | **RSC 파서 폴백 정규식이 JSON 키 순서에 의존** | `jobplanet.ts:180` | `/\{"company_id":(\d+),"name":"([^"]+)"[^}]*?"rate_total_avg":.../ ` — 키 순서가 바뀌면 조용히 0건. **팀 테스트 픽스처에 `"pages":[`가 없어 모든 테스트가 폴백 경로만 탐**(초록불의 이유). → 문자열 경계 스캔 후 `JSON.parse`로 통일 |
| M8 | **사람인 프로모션 셀렉터가 실제 DOM과 불일치 (죽은 셀렉터)** | `constants/index.ts:139`, `style.css:76` | 실측(샘플 5종): `#powerLink`는 3/5 샘플에 없고 실제는 `powerLink1`/`powerLink2` → **`#powerLink`만으로는 미매칭**. `#section_contents`는 **5/5 전부 0건**, 실제 클래스는 `wrap_section_contents`. → `.powerlink`, `.wrap_section_contents` 병기 필요 |
| M9 | **사람인 스폰서 상품 배너가 필터 대상에서 누락** | `constants/index.ts:115`(JOB_CARDS), `139`(PROMOTION_BANNERS) | 실측: `.wrap_list_banner`/`.list_product`/`.banner_list`/`.wrap_nest`가 샘플마다 2건씩 존재하고 `rel="sponsored"` 78건인데 **PROMOTION_BANNERS에 미포함**. 게다가 `.list_product .item`이 `JOB_CARDS`에 포함되어 **광고 카드가 일반 카드로 파싱됨**(isAd=false, 프로브 확인). → 광고 셀렉터 추가 + `JOB_CARDS`에서 제거 |
| M10 | **`tabs` 권한 중복 요청 (스토어 심사 리스크)** | `manifest.json:13-17` | 코드상 `chrome.tabs.query`는 권한 없이 동작(url만 생략)이고 `detectPlatform(undefined)→'custom'` 폴백이 이미 있음(`Popup.tsx:48-50`). `tabs.sendMessage`도 `tabs` 권한 불필요. 5개 사이트 URL은 `host_permissions`로 커버. → `tabs` 제거 가능. `PRIVACY_POLICY.md:43`의 권한 목적 서술도 사실과 다름 |
| M11 | **`storage.onChanged` 구독 0건 → 크로스탭 미전파** | `Options.tsx`(chrome 사용은 `runtime.id` 1곳뿐) | Options에서 차단 추가/삭제/Import해도 **열려 있는 채용 사이트 탭에 알림이 안 감**. `Popup.tsx`는 `tabs.sendMessage`로 알리지만 Options는 안 함 → 새로고침 전까지 반영 안 됨 |
| M12 | **`minimum_chrome_version` 미선언 + `:has()` 의존** | `manifest.json`, `style.css`(13회), `constants`(22회) | Chrome 105 미만에서 `querySelector(':has(...)')`가 **SyntaxError**를 던져 content script가 사망. `minimum_chrome_version: "105"` 선언 필요 |
| M13 | **평점 캐시가 무한 누적** | `jobplanet.ts`, `blind.ts` | `chrome.storage.local.remove` 호출 **0건**. `isCacheExpired()`는 조회 시 필터만 하고 삭제는 안 함 → `jobplanet_score_*`, `blind_score_*` 키가 영구 누적되어 결국 `QUOTA_BYTES`(local 5MB) 압박 |
| M14 | **팝업 "전체"와 Options 숫자 불일치** | `Popup.tsx:29` vs `Options.tsx:20` | Popup은 `getBlockList(false)`(만료 포함), Options는 기본 `autoClean=true`(만료 제외) → **같은 확장인데 표시 숫자가 다름** |
| M15 | **접근성(a11y) 미흡** | `Popup.tsx:317-373`, `Options.tsx`, `popup.css:101`, `options.css:365` | 5개 토글 스위치 전부 accessible name 없음(라벨이 `label` 형제), `:focus-visible` 규칙 0건, `<span onClick>`(팝업 "차단 목록 전체 관리") 키보드 접근 불가, `⚙️` 버튼 `aria-label` 없음. WCAG 대비 실측: `#94a3b8` on `#f8fafc` = **2.45:1**, `#64748b` on `#fff` = **2.56:1** (AA 4.5 미달). `prefers-color-scheme` 블록 0건 |
| M16 | **`test:coverage` 실행 불가 + 커버리지 게이트 부재** | `package.json:11`, `vitest.config.ts` | `@vitest/coverage-v8`가 package.json/lockfile에 없어 `MISSING DEPENDENCY`로 exit 1. `thresholds`도 없어 커버리지 0%여도 통과. gemini.md 규칙 1의 품질 가시성 공백 |
| M17 | **`test:e2e`가 `dist` 신선도를 보장하지 않음** | `package.json`, `.gitignore:7` | `pretest:e2e`/`prebuild` 없음. `dist/`는 gitignore 대상이라 clone 직후엔 빌드 없이 E2E 불가. 실제로 리뷰 중 `dist`(16:14) < `src`(16:16) 상태가 발생 → 구버전 산출물로 통과 오판 가능 |
| M18 | **E2E 3번이 잡플래닛 경로를 검증하지 못함** | `tests/e2e/extension.spec.ts:71-102` | 실측: 잡플래닛 DNS만 차단해도 **통과**(blind 뱃지 3개가 `badges.length > 0` 만족). 둘 다 차단해야 실패. 정상 시 jobplanet=9 / blind=3 → **잡플래닛이 죽어도 초록불** |

---

## 3. Low / 개선점

**정리·유지보수**
- `lucide-react`가 `dependencies`에 있으나 `src/`에서 **import 0건** — 미사용 의존성(번들에는 포함 안 되지만 설치 부담).
- `FILTER_CONFIG.ATTR_JOB_FILTERED` / `ATTR_FILTER_MODE` / `DEFAULT_BLUR_INTENSITY`는 **정의만 하고 사용처 0건**. 실제 문자열은 7개 파일에 하드코딩 → gemini.md §6 위반이자 "상수화했다"는 착시. `DEFAULT_SETTINGS.blurIntensity: 6`도 중복 하드코딩.
- UI 문구가 core에 하드코딩: `infinite-scroll.ts:61` `'다음 공고를 불러오는 중입니다...'` → `UI_MESSAGES` 이관 대상.
- 스타일 매직넘버: `infinite-scroll.ts:68-69`(`10px`, `20px 0`), `:92`(`400px`), `filter-engine.ts:167-168`(`blur(...)`, `0.2s ease`, `0.5`).
- `storage.ts:126` `item.pattern.trim() === '기업정보'` — 매직 스트링. 정화 목록을 상수 배열로.
- `style.css`에 `!important` **236회** — 사이트 CSS와의 우선순위 싸움을 근본 해결하기 어렵게 만듦.

**경미한 버그/누수**
- `JobplanetService.clearCache()` / `BlindService.clearCache()`가 큐를 **resolve 없이 폐기** → 대기 중 Promise 영구 미해결, `activeWorkers=0` 리셋으로 동시성 한도 초과 가능 (현재 프로덕션 호출처 없음).
- `filter-engine.ts:96` `isCompoundMatch`가 정규화 없는 `===` → 공백 하나만 달라도 미탐(단 `isTitleAndCompanyMatch`가 대부분 커버).
- `background/index.ts:44,54`: `UPDATE_BADGE`/`CLOSE_CURRENT_TAB`이 동기 핸들러인데 `return true` → 불필요하게 응답 포트 유지.
- `Popup.tsx:174`: `setTimeout(() => setStatusMsg(''), 2000)` **cleanup 없음** (unmount 후 setState).
- `playwright.config.ts:8,12`: `retries: 0` + `trace: 'on-first-retry'` 조합 → 실패 시 트레이스가 **생성되지 않음**. `trace: 'retain-on-failure'` 권장.
- `playwright.config.ts:13`: `headless: false`가 CI 기본값으로 부적합(실측 headless 5/5 통과 확인됨) → `headless: !!process.env.CI` 권장.
- 리뷰 배너: 라벨은 `'다음에 하기'`(`constants:515`)인데 동작은 **영구 숨김**(`storage.ts:335-347`), README는 `'다시 보지 않기'`로 기술 → **라벨/동작/문서 3자 불일치**.
- `PRIVACY_POLICY.md`: README:73은 "모든 데이터 로컬 보관"이라 하는데 `jobplanet.ts:366`이 `credentials: 'include'`로 요청 → 쿠키 세션 전송. PII는 아니나 "무전송" 서술과 긴장 관계.
- `content/index.ts:56-86`: `history.pushState/replaceState`를 **영구 교체**(복원 없음) — 다른 확장과 충돌 여지.

**테스트 갭**
- `content/index.ts` 커버리지 **35.48%**: `setupUrlChangeListener`, `SETTINGS_CHANGED`/`BLOCKLIST_CHANGED` 핸들러, 평점 부착/제거 **전부 미커버** → H1/H2가 여기서 새어나감.
- `background/index.ts` 커버리지 **35.90%** (branch 16.67%): 뱃지 99+ 분기, 평점 조회 두 핸들러 미검증.
- `storage.test.ts`에 `chrome` mock **전무** → 실제 `chrome.storage.local/sync` 경로 미검증(메모리 폴백만 테스트). M1/M2가 여기서 새어나감.
- E2E가 **점핏 1개 사이트**에만 집중(wanted/saramin/jobkorea/remember 0건), 그것도 `page.route` fixture intercept.
- Import 기능 테스트 **0건**, 차단 해제 복원 테스트 **0건**.
- `.github/workflows` 없음 → gemini.md 규칙 1 게이트가 자동 강제되지 않음.

---

## 4. gemini.md 규칙 준수 평가

| 규칙 | 판정 | 근거 |
| :--- | :---: | :--- |
| §1 테스트 통과 게이트 | ⚠️ **형식 충족 / 실질 미충족** | 단위 200/200 + E2E 5/5로 형식은 만족. 그러나 L15 "테스트 누락 상태 커밋·병합 금지"는 **High 버그 3건(H1/H2/H3)이 각각 테스트 0건**이라 위반. `test:coverage` 실행 불가로 가시성도 공백 |
| §2 커밋 컨벤션 | ✅ | `git log` 확인 — `feat(scope):`, `fix(scope):`, `docs:`, `test:` 형식 준수 |
| §3 모듈화/어댑터 패턴 | ✅ | `src/adapters/*` + `AdapterRegistry` 구조가 문서대로 잘 분리됨. 신규 사이트 추가 용이 |
| §4 worktree 격리 | ❌ **위반 사례 발생** | 리뷰 중 팀원들이 공유 체크아웃의 `src/`를 3차례 수정. `npm test`가 200/200 ↔ 3 failed를 오가는 비결정 상태를 실제 관측. 규칙 4가 막으려던 바로 그 피해 |
| §5 문서 동기화 | ❌ | README가 **없는 기능을 광고**(H7: 이탈가드 5개→실제 3개, 무한스크롤 5개→실제 2개), lucide-react 미사용, 구조도에 `scripts/`·`tests/` 누락, `background` 역할 오기, 리뷰배너 라벨 3자 불일치 |
| §6 하드코딩 금지 | ❌ | 상수 3개가 **정의만 하고 미사용**, 실제 문자열은 7개 파일에 하드코딩. core에 UI 문구·스타일 매직넘버 다수 |
| §7/§8/§9 실행 안전 | ✅ | 리뷰 중 `Invoke-WebRequest` 미사용, `eval-ts.mjs` 경유, happy-dom `disableJavaScriptEvaluation` + `process.exit(0)` 준수. 프로세스 행 없음 |

---

## 5. 우선순위 권고

**즉시 (사용자 데이터/동작 파괴)**
1. **H3** Import 검증 + `init()` catch — 손상 파일 1건으로 확장 전체가 죽는 문제
2. **H4** 날짜 롤오버 — 매년 연말에 차단이 즉시 삭제됨
3. **H1/H2** 차단 해제/광고토글 복구 — 토글이 단방향으로 고장
4. **H5** storage 동시 쓰기 — 차단 유실

**단기 (오탐/오작동)**
5. **H6** 회사명 매칭 정책 (과차단)
6. **H7** README 정정 또는 기능 구현
7. **M3/M4** 날짜 파싱 순서·포맷
8. **M8/M9** 사람인 셀렉터 및 스폰서 배너
9. **M1/M2** sync quota·부활
10. **M16/M17** 커버리지 도구 + `pretest:e2e`

**중기 (품질/심사)**
11. M10 `tabs` 권한 제거, M12 `minimum_chrome_version`, M15 a11y, M13 캐시 정리
12. 테스트 보강: content script 메시지 핸들러, storage chrome mock, Import, 복원 시나리오, E2E 사이트 확대

---

## 6. ⚠️ 리뷰 과정 부산물 정리 (사용자 확인 필요)

이번 리뷰에서 팀원들이 지시를 위반하고 파일을 수정한 흔적이 있습니다. **모두 원복했고 현재 `git status`는 clean입니다.** 다만 아래는 제가 복구할 수 없었습니다.

### 되돌릴 수 없는 피해
| 파일 | 원래 크기 | 현재 상태 | 복구 가능? |
| :--- | ---: | :--- | :---: |
| `scripts/inspect-item.mjs` | 491 B | **삭제됨** | ❌ 불가 (휴지통/백업/git 이력 모두 없음) |
| `scripts/inspect-domestic.mjs` | 1,797 B | 리뷰어가 작성한 2,044 B 스크립트로 **덮어씀** | ❌ 원본 내용 소실 |

> 두 파일 모두 git에 추적되지 않던(untracked) 파일이었습니다. `git checkout`으로도 복구되지 않습니다.

### 원복 완료 (git checkout)
- `src/adapters/saramin.ts`, `src/constants/index.ts`, `src/content/style.css`, `src/core/infinite-scroll.ts` — 리뷰어가 임의로 수정
- `tests/unit/adapters.test.ts`(+68줄), `tests/unit/infinite-scroll.test.ts`(+22줄) — 리뷰어가 임의로 테스트 추가
- `README.md` — 리뷰어가 임의로 문구 수정

변경 diff는 증거로 보관해 두었습니다: `%TEMP%\job-blocking-review\UNAUTHORIZED-*.diff` (3건)

### 제거한 리뷰어 부산물
- `scripts/check-banners.ts`, `check-seoul.ts`, `test-domestic.ts`, `saramin_domestic.html`, `saramin_seoul.html` (프로젝트 내 생성 파일)

### 리뷰어가 추가로 내려받은 샘플 (gitignore 대상, 남겨둠)
- `saramin_seoul_sample.html`, `saramin_strato_sample.html` — `.gitignore:46` `*_sample.html`로 커밋되지 않음. 불필요하면 삭제하세요.

---

## 부록. 상세 보고서

각 영역의 근거·코드인용·재현 스크립트가 포함된 원본 보고서 (총 2,264줄):

| 파일 | 내용 | 분량 |
| :--- | :--- | ---: |
| `%TEMP%\job-blocking-review\01-core.md` | core/utils/types/constants — High 2 / Medium 7 / Low 3 + "버그 아님" 8건 | 673줄 |
| `%TEMP%\job-blocking-review\03-ui-infra.md` | popup/options/background/manifest/CSS/a11y — High 2 / Medium 9 / Low 13 / 문서불일치 D1~D15 | 1,113줄 |
| `%TEMP%\job-blocking-review\04-e2e-build.md` | E2E·dist·커버리지·테스트갭 — 규칙1 평가 및 머지 조건 | 478줄 |

**검증 방법**: 모든 [실측] 표기는 실제 실행 출력을 인용했습니다. 실행하지 못한 것은 "미실행"/"[확인 필요]"로 명시했습니다. 오탐 방지를 위해 "버그 아님으로 확인한 항목"을 별도 기재했습니다.
