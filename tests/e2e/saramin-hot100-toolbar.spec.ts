import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

/**
 * [회귀] 사람인 HOT 100(/zf_user/jobs/hot100) 카드의 [공고숨김 / 회사차단] 툴바 잘림
 *
 * ## 배경 (사용자 제보 + 라이브 실측)
 *
 * HOT 100 목록은 카드에 **좌우 48px 인셋**을 주는 레이아웃이다.
 *
 *   <div class="list_recruiting list_hot_type">          ← width: 1260px
 *     <div class="list_body">                            ← overflow: hidden (모서리 라운딩 클립)
 *       <div class="list_item">                          ← margin: 0 48px
 *         <div class="box_item">                         ← padding: 24px 48px; margin: 0 -48px
 *           …회사명 / 공고제목 / 지원자격 / 입사지원…
 *           <div class="job-filter-btn-group">           ← 확장 주입, position:absolute; right:12px
 *
 * 확장 style.css 의 폴백 블록이 `.list_item { width: 100% !important }` 로 폭을 강제하고 있었다.
 * `width:100%` 는 마진을 뺀 폭을 계산하지 않고 **컨테이닝 블록 폭 그대로**를 잡으므로
 * 좌우 48px 마진이 무력화되어 카드가 list_body 폭(1258px)을 그대로 차지했다.
 *
 * 그 결과 카드 오른쪽 끝이 list_body 의 클립 경계를 넘었고(실측 +47px),
 * 카드 우측에 absolute 로 붙은 툴바(right:12px)가 클립 경계 밖으로 밀려나
 * "회사차단" 텍스트가 잘려 보였다.
 *
 * 실측 (라이브 DOM + 사이트 CSS 재현, HOT 100 `#rec-55566807` 행):
 *   - 수정 전: 카드 폭 1258px / 카드 오른쪽 1397px / 툴바 오른쪽 1383.4px
 *              → 클립 경계 1350px 대비 **+33.4px 잘림**
 *   - 수정 후: 카드 폭 1162px / 카드 오른쪽 1301px / 툴바 오른쪽 1287.4px
 *              → 클립 경계 대비 **-62.6px (여유)**
 *
 * ## 이 테스트가 지키는 계약
 *
 *   1. 툴바의 오른쪽 끝은 클립 조상(list_body)의 오른쪽 끝을 넘지 않는다 (잘림 0).
 *   2. 툴바는 행 상단의 빈 밴드(padding 24px) 안에 놓여 [입사지원] 버튼과 겹치지 않는다.
 *   3. 카드(.list_item)는 사이트가 준 좌우 인셋(margin 48px)을 유지한다
 *      → 즉 확장이 카드 폭을 `100%` 로 강제하지 않는다.
 *   4. 뱃지/툴바가 없는 상태의 사이트 레이아웃은 확장 CSS 유무와 무관하게 동일하다.
 *
 * ## 구성 원칙
 *
 * - 네트워크 의존 금지: 라이브 DOM 구조와 사이트 CSS 중 **측정에 영향을 주는 규칙만**
 *   아래 BASE_CSS 에 그대로 옮겨 적고, 확장 CSS 는 `src/content/style.css` 를 그대로 주입한다.
 * - before 상태는 `git show HEAD:src/content/style.css` 에 의존하지 않는다(테스트가 커밋 상태에
 *   의존하면 안 됨). 대신 [검증력] 테스트에서 문제였던 선언만 되돌려 재현한다.
 */

const STYLE_CSS = fs.readFileSync(path.resolve(process.cwd(), 'src/content/style.css'), 'utf-8');

/** 라이브 https://www.saramin.co.kr/zf_user/jobs/hot100 에서 측정에 영향을 주는 규칙만 옮긴 것 */
const BASE_CSS = `
  * { box-sizing: content-box; }
  body { margin: 0; background: #f8f9fc; font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; }

  /* HOT 100 목록 컨테이너 */
  .list_recruiting.list_hot_type { margin: 0 auto; width: 1260px; }
  /* ★ 카드 오른쪽을 잘라내는 클립 조상 */
  .list_recruiting.list_hot_type .list_body {
    border-radius: 16px; background: #fff; overflow: hidden; border: 1px solid #dfe1e7;
  }
  /* ★ 좌우 48px 인셋 */
  .list_recruiting.list_hot_type .list_body .list_item { margin: 0 48px; }
  /* ★ 인셋을 되돌리는 음수 마진 + 좌우 48px 패딩 (라이브 그대로) */
  .list_recruiting.list_hot_type .list_body .list_item .box_item {
    padding: 24px 48px; margin: 0 -48px; display: flex; box-sizing: border-box;
  }
  .list_recruiting.list_hot_type .list_body .list_item .ranking_info { padding: 0; width: 56px; flex: 0 0 56px; }
  .list_recruiting.list_hot_type .list_body .list_item .company_nm { width: 164px; flex: 0 0 164px; }
  .list_recruiting.list_hot_type .list_body .list_item .notification_info { width: 476px; margin-left: 56px; flex: 0 0 476px; }
  .list_recruiting.list_hot_type .list_body .list_item .recruit_info { width: 216px; margin-left: 50px; flex: 0 0 216px; }
  .list_recruiting.list_hot_type .list_body .list_item .support_info {
    padding: 0; margin-left: 24px; text-align: right; flex: auto; font-size: 12px;
  }
  .list_recruiting .list_body .list_item + .list_item { border-top: 1px solid #dfe1e7; }

  /* 지원 버튼 (높이 33px — 툴바가 겹치면 안 되는 대상) */
  .support_info .sri_btn_md {
    display: inline-block; width: 106px; height: 33px; line-height: 33px;
    border: 1px solid #2d65f2; border-radius: 4px; color: #2d65f2; font-size: 13px;
    text-align: center; background: #fff;
  }
  .support_info .support_detail { margin-top: 8px; color: #888; }
`;

/** 사용자 제보 스크린샷과 동일한 행 구조 (HOT 100 #rec-55566807) */
const HOT100_ROWS = [
  {
    id: 'rec-55566807',
    rank: '1',
    company: '한국무브넥스(주)',
    title: '2026년 한국무브넥스 생산직 신입사원 채용 공고',
    meta: '기계조작원 | 생산관리 | 설비OP',
    place: '울산 동구 외',
    career: '신입 · 정규직',
    edu: '고졸↑',
    day: 'D-5',
  },
  {
    id: 'rec-51438642',
    rank: '2',
    company: '㈜윈스테크넷',
    title: '클라우드 시큐리티 스쿨 교육생 모집 (부산)',
    meta: '보안컨설팅 | 정보보안 | IT컨설팅',
    place: '부산전체 외',
    career: '경력무관 · 교육생',
    edu: '대학(2,3년)↑',
    day: 'D-12',
  },
];

const rowHtml = (row: (typeof HOT100_ROWS)[number]): string => `
  <div id="${row.id}" class="list_item">
    <div class="box_item">
      <div class="col ranking_info"><strong class="tit">${row.rank}</strong></div>
      <div class="col company_nm">
        <a href="#" class="str_tit">${row.company}</a>
        <span class="info_stock">코스피</span>
      </div>
      <div class="col notification_info">
        <div class="job_tit"><a href="#" class="str_tit"><span>${row.title}</span></a></div>
        <div class="job_meta"><span class="job_sector">${row.meta}</span></div>
      </div>
      <div class="col recruit_info">
        <ul>
          <li><p class="work_place">${row.place}</p></li>
          <li><p class="career">${row.career}</p></li>
          <li><p class="education">${row.edu}</p></li>
        </ul>
      </div>
      <div class="col support_info">
        <a class="sri_btn_md" href="#"><span>입사지원</span></a>
        <p class="support_detail"><span class="date">${row.day}</span></p>
      </div>
    </div>
  </div>`;

const HOT100_HTML = `
  <div class="list_recruiting list_hot_type">
    <div class="list_body">
      ${HOT100_ROWS.map(rowHtml).join('')}
    </div>
  </div>`;

/**
 * `src/adapters/base.ts` 의 injectInlineButton 과 동일한 DOM 구조로 툴바를 주입한다.
 * (label/클래스/버튼 순서 모두 동일)
 */
const TOOLBAR_INJECT = () => {
  for (const card of Array.from(document.querySelectorAll<HTMLElement>('.list_item'))) {
    if (card.querySelector('.job-filter-btn-group')) continue;
    card.classList.add('job-filter-card-host');
    const group = document.createElement('div');
    group.className = 'job-filter-btn-group';
    group.innerHTML = `
      <button type="button" class="job-filter-hide-btn job-filter-btn-job">
        <svg class="job-filter-btn-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        <span class="job-filter-btn-text">공고숨김</span>
      </button>
      <span class="job-filter-btn-divider"></span>
      <button type="button" class="job-filter-hide-btn job-filter-btn-company">
        <svg class="job-filter-btn-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
        <span class="job-filter-btn-text">회사차단</span>
      </button>`;
    card.appendChild(group);
  }
};

/**
 * setContent → 사이트 기준 CSS → 확장 CSS 순으로 주입하고, 호버 리빌(opacity/pointer-events)을
 * 강제로 켠 뒤 CSS 전환을 종료 상태로 고정한다. 네트워크 요청은 발생하지 않는다.
 */
async function loadPage(page: Page, extensionCss: string | null): Promise<void> {
  await page.setContent(
    `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>saramin-hot100-toolbar</title></head><body>${HOT100_HTML}</body></html>`
  );
  await page.addStyleTag({ content: BASE_CSS });
  if (extensionCss) await page.addStyleTag({ content: extensionCss });
  await page.evaluate(TOOLBAR_INJECT);
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>('.job-filter-btn-group').forEach((el) => {
      el.style.setProperty('opacity', '1', 'important');
      el.style.setProperty('pointer-events', 'auto', 'important');
      el.style.setProperty('transform', 'none', 'important');
    });
  });
  await page.evaluate(async () => {
    void document.body.offsetHeight; // 강제 리플로우 → 전환 시작
    for (const animation of document.getAnimations()) {
      try {
        animation.finish(); // 전환을 최종 상태로 고정
      } catch {
        /* 무한 반복 애니메이션(spinner 등)은 finish 불가 — 이 테스트와 무관 */
      }
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

interface Geometry {
  cardWidth: number;
  cardRight: number;
  clipRight: number;
  toolbarRight: number;
  toolbarBottom: number;
  toolbarTop: number;
  applyTop: number;
  applyRight: number;
  applyBottom: number;
}

/** 첫 카드의 클립 경계 / 툴바 / 지원 버튼 기하를 읽는다 */
async function readGeometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('.list_item')!;
    const group = card.querySelector<HTMLElement>('.job-filter-btn-group')!;
    const applyBtn = card.querySelector<HTMLElement>('.support_info .sri_btn_md')!;

    // 툴바를 실제로 잘라내는(overflow != visible) 가장 가까운 조상
    let clip: HTMLElement | null = group.parentElement;
    while (clip) {
      const cs = getComputedStyle(clip);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') break;
      clip = clip.parentElement;
    }
    if (!clip) throw new Error('클립 조상(list_body)을 찾지 못했습니다');

    const c = card.getBoundingClientRect();
    const g = group.getBoundingClientRect();
    const a = applyBtn.getBoundingClientRect();
    const k = clip.getBoundingClientRect();

    return {
      cardWidth: c.width,
      cardRight: c.right,
      clipRight: k.right,
      toolbarRight: g.right,
      toolbarTop: g.top,
      toolbarBottom: g.bottom,
      applyTop: a.top,
      applyRight: a.right,
      applyBottom: a.bottom,
    };
  });
}

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('[회귀] 사람인 HOT 100 카드 툴바가 목록 경계에서 잘리지 않아야 한다', () => {
  test.beforeEach(async ({ page }) => {
    await loadPage(page, STYLE_CSS);
  });

  test('툴바 오른쪽 끝이 클립 조상(list_body)의 오른쪽 끝을 넘지 않는다 (잘림 0)', async ({ page }) => {
    const geo = await readGeometry(page);
    expect(
      geo.toolbarRight,
      `툴바가 목록 경계에서 ${(geo.toolbarRight - geo.clipRight).toFixed(1)}px 잘림`
    ).toBeLessThanOrEqual(geo.clipRight + 0.5);

    // 카드 자체도 클립 경계를 넘지 않는다 (넘으면 그 안의 툴바도 함께 잘린다)
    expect(
      geo.cardRight,
      `카드 오른쪽이 목록 경계를 ${(geo.cardRight - geo.clipRight).toFixed(1)}px 넘음`
    ).toBeLessThanOrEqual(geo.clipRight + 0.5);
  });

  test('카드는 사이트가 준 좌우 48px 인셋을 유지한다 (폭을 100% 로 강제하지 않는다)', async ({ page }) => {
    const widths = await page.evaluate(() => {
      const body = document.querySelector<HTMLElement>('.list_body')!.getBoundingClientRect();
      const bodyStyle = getComputedStyle(document.querySelector<HTMLElement>('.list_body')!);
      // list_body 의 content 폭 = border-box 폭 − 좌우 border
      const contentWidth =
        body.width - parseFloat(bodyStyle.borderLeftWidth) - parseFloat(bodyStyle.borderRightWidth);
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.list_item')).map(
        (el) => el.getBoundingClientRect().width
      );
      return { contentWidth, cards };
    });

    expect(widths.cards.length).toBe(HOT100_ROWS.length);
    for (const [i, cardWidth] of widths.cards.entries()) {
      // 좌우 48px 인셋이 살아 있으면 카드 폭 = 목록 content 폭 − 96px
      // (수정 전에는 width:100% 로 인셋이 무시되어 목록 content 폭과 같았다)
      expect(
        cardWidth,
        `카드 ${i}: 좌우 인셋이 무시됨 (카드 ${cardWidth.toFixed(1)}px / 목록 content ${widths.contentWidth.toFixed(1)}px)`
      ).toBeCloseTo(widths.contentWidth - 96, 0);
    }
  });

  test('툴바는 행 상단 빈 밴드(padding 24px) 안에 놓여 [입사지원] 버튼과 겹치지 않는다', async ({
    page,
  }) => {
    const geo = await readGeometry(page);

    const left = Math.max(geo.toolbarTop, geo.applyTop);
    const right = Math.min(geo.toolbarBottom, geo.applyBottom);

    // 지원 버튼(높이 33px)의 상단을 툴바가 덮으면 사용자가 지원 버튼을 누를 수 없다.
    // 툴바는 행 상단 0~23px, 버튼은 행 상단 24~57px 에 있어 세로로 분리되어야 한다.
    expect(
      geo.toolbarBottom,
      `툴바가 입사지원 버튼을 세로로 침범함 (툴바 bottom=${geo.toolbarBottom.toFixed(1)}, 버튼 top=${geo.applyTop.toFixed(1)})`
    ).toBeLessThanOrEqual(geo.applyTop + 0.5);
    expect(right - left).toBeLessThanOrEqual(0);
  });

  test('확장 CSS 의 사람인 목록 폴백은 표준 목록 컨테이너(.list_recruiting) 안에서는 개입하지 않는다', async ({
    page,
  }) => {
    // 폴백이 개입하면 min-width(232px 등)가 사이트 값(216px)을 덮어써 열 폭이 밀린다.
    const widths = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.list_item .recruit_info')).map(
        (el) => el.getBoundingClientRect().width
      )
    );
    expect(widths.length).toBe(HOT100_ROWS.length);
    for (const [i, width] of widths.entries()) {
      expect(
        width,
        `카드 ${i}: 사람인 HOT100 의 recruit_info 열 폭이 사이트 값(216px)에서 변함 (${width.toFixed(1)}px)`
      ).toBeCloseTo(216, 0);
    }
  });
});

/**
 * [검증력(sensitivity) 보증] 위 단언들이 "수정 전 상태"를 실제로 잡아낼 수 있는지 확인한다.
 *
 * 수정 전 폴백 블록의 두 선언만 그대로 되돌려 주입하면,
 *   - 카드가 좌우 인셋을 잃고 목록 폭을 그대로 차지하며
 *   - 툴바가 클립 경계 밖으로 밀려나고
 *   - 입사지원 버튼 위를 덮어야 한다.
 * 이 재현이 성립해야 위 계약 단언이 공허하게 항상 참인 것이 아니다.
 */
const LEGACY_FALLBACK_CSS = `
  .list_item {
    position: relative !important;
    width: 100% !important;
    box-sizing: border-box !important;
    border-bottom: 1px solid #ebebeb !important;
  }
  .list_item .box_item {
    display: flex !important;
    flex-direction: row !important;
    align-items: stretch !important;
    width: 100% !important;
    padding: 24px 28px !important;
    box-sizing: border-box !important;
  }
  .list_item .box_item .recruit_info {
    margin-left: 56px !important;
    width: 232px !important;
    min-width: 232px !important;
    max-width: 232px !important;
    flex: 0 0 232px !important;
  }
  /* 수정 전에는 사람인 목록 전용 top 보정이 없어 기본값(top:10px)이 적용됐다.
     같은 특이도로 뒤에 선언해 수정 전 상태를 정확히 재현한다. */
  .list_recruiting .list_body .list_item > .job-filter-btn-group {
    top: 10px !important;
  }
`;

test.describe('[검증력] 수정 전 폴백 CSS 에서는 툴바 잘림이 재현되어야 한다', () => {
  test('width:100% 강제 시 카드가 인셋을 잃고 툴바가 목록 경계 밖으로 밀려 잘린다', async ({ page }) => {
    // 확장 CSS 는 주입하되, 레거시 폴백을 나중에 덮어써 수정 전 상태를 만든다.
    await loadPage(page, `${STYLE_CSS}\n${LEGACY_FALLBACK_CSS}`);

    const geo = await readGeometry(page);

    // (1) 카드가 좌우 인셋을 잃는다 → 카드 오른쪽이 목록 경계를 넘는다
    expect(
      geo.cardRight - geo.clipRight,
      `수정 전 조건에서 카드가 목록 경계를 넘지 않음 → 잘림 단언이 공허함 (초과 ${(geo.cardRight - geo.clipRight).toFixed(1)}px)`
    ).toBeGreaterThan(1);

    // (2) 그 결과 툴바가 클립 경계 밖으로 나가 잘린다 (라이브 실측 +33.4px)
    expect(
      geo.toolbarRight - geo.clipRight,
      `수정 전 조건에서 툴바 잘림이 재현되지 않음 (초과 ${(geo.toolbarRight - geo.clipRight).toFixed(1)}px)`
    ).toBeGreaterThan(1);

    // (3) 툴바가 입사지원 버튼 상단을 덮는다
    const overlapHeight = Math.min(geo.toolbarBottom, geo.applyBottom) - Math.max(geo.toolbarTop, geo.applyTop);
    expect(
      overlapHeight,
      `수정 전 조건에서 툴바/지원버튼 겹침이 재현되지 않음 (겹침 ${overlapHeight.toFixed(1)}px)`
    ).toBeGreaterThan(1);
  });
});
