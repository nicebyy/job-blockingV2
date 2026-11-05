import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

/**
 * [회귀] 잡코리아 메인 CardJobBasic 카드(폭 305px)의 평점 뱃지 레이아웃
 *
 * ## 배경 (라이브 실측)
 *
 * 잡코리아 메인 페이지의 CardJobBasic 카드는 폭 305px 이고, 평점 뱃지가 삽입되는
 * 회사명 행은 아래 구조를 갖는다 (Tailwind 기반 SDUI 렌더링 결과).
 *
 *   <div class="flex items-center gap-[8px] overflow-hidden">
 *     <span style="flex-shrink:1" class="truncate ...">회사명</span>
 *     <span style="flex-shrink:0" class="...">D-16</span>
 *   </div>
 *
 * `.job-filter-ratings-wrap` 은 회사명 span 뒤에 삽입되어 이 행의 flex item 이 된다.
 * 그런데 wrap 에 flex-shrink 가 없고 `.job-filter-rating-badge` 의 white-space 가 normal 이라
 * 가용 폭이 부족한 카드에서 라벨("잡플래닛" 4글자)이 **한 글자씩 세로로 쪼개졌다**.
 *
 * 실측 (수정 전, 같은 페이지 카드 8개):
 *   - 회사명 '㈜더 핸즈'                 : wrap 18.2px, 라벨 12px (1줄)
 *   - 회사명 '라바웨이브'                : wrap 29px,   라벨 24px (2줄)
 *   - 회사명 '주식회사 가온감정평가법인'  : wrap 53px,   라벨 48px (4줄 = 한 글자씩)
 *
 * ## 이 테스트가 지키는 계약
 *
 *   1. 같은 카드의 두 뱃지는 **높이가 동일**하고 한 줄(< 20px)로 표시된다.
 *   2. 뱃지 라벨은 한 줄(< 16px)이며 nowrap 이다.
 *   3. 좌→우 순서는 항상 잡플래닛 → 블라인드 이고, 두 뱃지는 같은 Y 좌표(가로 정렬)에 놓인다.
 *   4. 회사명 행은 한 줄(flex-wrap: nowrap)을 유지하고, 폭 부족분은 truncate 된 회사명 span 이 흡수한다.
 *   5. 기존 목록 레이아웃(td.tplCo)의 "뱃지 **사이** 줄바꿈 허용(flex-wrap: wrap)" 의도는
 *      훼손되지 않는다 — 뱃지 내부만 쪼개지지 않으면 된다.
 *
 * ## 구성 원칙
 *
 * - 확장 빌드 산출물(dist) 없이 실행 가능해야 하므로 `tests/e2e/fixtures` 확장 픽스처를 쓰지 않고
 *   `@playwright/test` 의 test/expect 를 직접 import 한다.
 * - 네트워크 의존 금지: `page.setContent()` 로 라이브와 동일한 DOM 을 만들고,
 *   `src/content/style.css` 를 그대로 주입한다.
 */

const STYLE_CSS_PATH = path.resolve(process.cwd(), 'src/content/style.css');
const STYLE_CSS = fs.readFileSync(STYLE_CSS_PATH, 'utf-8');

/** 라이브 실측 카드 폭 (https://www.jobkorea.co.kr/ 메인 CardJobBasic boundingBox.width) */
const LIVE_CARD_WIDTH = 305;

/**
 * 잡코리아 메인은 Tailwind 기반 SDUI 이므로 라이브 DOM 의 유틸리티 클래스가 아래 계산값을 갖는다.
 * 외부 CSS/네트워크 없이 동일 조건을 재현하기 위해, 측정에 영향을 주는 유틸리티만 같은 선언으로 옮겨 적는다.
 * (확장 CSS 는 !important 로 이 위에 덮이므로 수정 전/후 차이가 그대로 드러난다)
 */
const LIVE_BASE_STYLES = `
  .flex { display: flex; }
  .items-center { align-items: center; }
  .gap-\\[8px\\] { gap: 8px; }
  .overflow-hidden { overflow: hidden; }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .job-card {
    width: ${LIVE_CARD_WIDTH}px;
    box-sizing: border-box;
    padding: 16px;
    margin-bottom: 8px;
    background: #ffffff;
    font-family: -apple-system, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    font-size: 14px;
    line-height: 1.4;
    color: #111111;
  }
`;

interface CardSpec {
  company: string;
  jobplanetScore: string;
  blindScore: string;
  day: string;
}

/** 라이브 실측에서 뱃지가 세로로 쪼개졌던 회사명들을 그대로 재현한다. */
const CARD_SPECS: CardSpec[] = [
  { company: '㈜더 핸즈', jobplanetScore: '3.2', blindScore: '2.2', day: 'D-16' },
  { company: '라바웨이브', jobplanetScore: '4.1', blindScore: '3.0', day: 'D-3' },
  { company: '주식회사 가온감정평가법인', jobplanetScore: '2.7', blindScore: '3.4', day: 'D-16' },
  { company: '㈜바이앤셀파트너스', jobplanetScore: '2.4', blindScore: '2.0', day: '상시채용' },
];

/**
 * `src/adapters/base.ts` 의 injectRatingBadge 와 동일한 뱃지 DOM 구조.
 * (label → star → score 순서, 클래스 이름도 동일)
 */
const badgeHtml = (platform: 'jobplanet' | 'blind', score: string): string => {
  const label = platform === 'jobplanet' ? '잡플래닛' : '블라인드';
  return `<a class="job-filter-rating-badge job-filter-rating-${platform}" href="#" title="${label} 평점 ${score} / 5.0">
      <span class="job-filter-rating-label">${label}</span>
      <span class="job-filter-rating-star">★</span>
      <span class="job-filter-rating-score">${score}</span>
    </a>`;
};

/**
 * 라이브 CardJobBasic 회사명 행 구조.
 * 뱃지 wrap 은 `getRatingBadgeAnchorElement`(= 회사명 span) 뒤에 삽입되므로
 * DOM 순서는 [회사명 span] [뱃지 wrap] [D-day span] 이다.
 */
const cardHtml = (spec: CardSpec): string => `
  <div data-component-type="CARD_JOB_BASIC" data-sentry-component="CardJobBasic" class="job-card">
    <div class="flex items-center gap-[8px] overflow-hidden company-row">
      <span style="flex-shrink:1" class="truncate">${spec.company}</span>
      <span class="job-filter-ratings-wrap">
        ${badgeHtml('jobplanet', spec.jobplanetScore)}
        ${badgeHtml('blind', spec.blindScore)}
      </span>
      <span style="flex-shrink:0" class="day">${spec.day}</span>
    </div>
  </div>`;

/** 잡코리아 채용목록 테이블(td.tplCo) — 뱃지 "사이" 줄바꿈이 허용되어야 하는 기존 레이아웃 */
const TD_LAYOUT_HTML = `
  <table style="table-layout: fixed; width: 420px;">
    <tbody>
      <tr class="devloopArea" data-gno="50246930">
        <td class="tplCo" style="width: 120px;">
          <a href="#" class="link normalLog">테스트회사</a>
          <span class="job-filter-ratings-wrap">
            ${badgeHtml('jobplanet', '3.2')}
            ${badgeHtml('blind', '2.2')}
          </span>
        </td>
        <td style="width: 300px;">채용제목 열</td>
      </tr>
    </tbody>
  </table>`;

/**
 * setContent + 라이브 유틸리티 재현 CSS + 확장 style.css 주입 후, CSS 전환(transition)을 종료 상태로 고정한다.
 * 네트워크 요청은 일절 발생하지 않는다.
 *
 * [측정 안정화 이유]
 * `.job-filter-rating-badge` 는 `transition: all 0.15s ease-in-out !important` 를 갖는다.
 * 스타일 주입 직후에 측정하면 font-size/padding/border 가 "전환 중간값"으로 잡혀
 * 뱃지 높이가 17.86 / 19.69px 처럼 비결정적으로 흔들린다 (레이아웃 자체는 정상인데도 실패).
 * 따라서 강제 리플로우로 전환을 개시시킨 뒤 `Animation.finish()` 로 최종값에 고정한다.
 */
async function loadPage(page: Page, bodyHtml: string): Promise<void> {
  await page.setContent(
    `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>jobkorea-rating-layout</title></head><body>${bodyHtml}</body></html>`
  );
  await page.addStyleTag({ content: LIVE_BASE_STYLES });
  await page.addStyleTag({ content: STYLE_CSS });

  await page.evaluate(async () => {
    void document.body.offsetHeight; // 강제 리플로우 → 전환 시작
    for (const animation of document.getAnimations()) {
      try {
        animation.finish(); // 전환을 최종 상태로 고정
      } catch {
        // 무한 반복 애니메이션(spinner 등)은 finish 불가 — 이 테스트와 무관하므로 무시
      }
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('[회귀] 잡코리아 메인 CardJobBasic 평점 뱃지는 한 줄로 가로 정렬되어야 한다', () => {
  test.beforeEach(async ({ page }) => {
    await loadPage(page, CARD_SPECS.map(cardHtml).join(''));
  });

  test('두 뱃지 높이가 동일하고 20px 미만(한 줄)이며 같은 Y 좌표에 놓여야 한다', async ({ page }) => {
    const cards = page.locator('[data-component-type="CARD_JOB_BASIC"]');
    await expect(cards).toHaveCount(CARD_SPECS.length);

    for (let i = 0; i < CARD_SPECS.length; i += 1) {
      const badges = cards.nth(i).locator('.job-filter-rating-badge');
      await expect(badges).toHaveCount(2);

      const jobplanet = await badges.nth(0).boundingBox();
      const blind = await badges.nth(1).boundingBox();
      expect(jobplanet, `카드 ${i}(${CARD_SPECS[i].company}): 잡플래닛 뱃지 boundingBox 없음`).not.toBeNull();
      expect(blind, `카드 ${i}(${CARD_SPECS[i].company}): 블라인드 뱃지 boundingBox 없음`).not.toBeNull();

      // (b) 라벨 세로 쪼개짐이 없으면 뱃지는 한 줄 = 20px 미만
      //     (1줄 실측 18.2px = 라벨 12px + 상하 padding 3px + border 2px + score line box 13.2px)
      expect(
        jobplanet!.height,
        `카드 ${i}: 잡플래닛 뱃지가 여러 줄로 쪼개짐 (height=${jobplanet!.height})`
      ).toBeLessThan(20);
      expect(
        blind!.height,
        `카드 ${i}: 블라인드 뱃지가 여러 줄로 쪼개짐 (height=${blind!.height})`
      ).toBeLessThan(20);

      // (a) 두 뱃지 높이 동일 (수정 전: 카드마다 18.2 / 29 / 53px 로 제각각)
      expect(
        Math.abs(jobplanet!.height - blind!.height),
        `카드 ${i}: 두 뱃지 높이가 다름 (${jobplanet!.height} vs ${blind!.height})`
      ).toBeLessThanOrEqual(0.5);

      // (d) 같은 Y 좌표 = 한 줄 가로 정렬
      expect(
        Math.abs(jobplanet!.y - blind!.y),
        `카드 ${i}: 두 뱃지가 같은 줄에 있지 않음 (y=${jobplanet!.y} vs ${blind!.y})`
      ).toBeLessThanOrEqual(0.5);

      // (c) 좌→우 순서: 잡플래닛 → 블라인드
      expect(
        jobplanet!.x,
        `카드 ${i}: 뱃지 좌우 순서가 뒤바뀜 (잡플래닛 x=${jobplanet!.x}, 블라인드 x=${blind!.x})`
      ).toBeLessThan(blind!.x);
      await expect(badges.nth(0)).toContainText('잡플래닛');
      await expect(badges.nth(1)).toContainText('블라인드');
    }
  });

  test('뱃지 라벨은 한 줄(높이 16px 미만)이고 뱃지·라벨·wrap 은 nowrap + flex-shrink:0 이어야 한다', async ({
    page,
  }) => {
    const labels = page.locator('.job-filter-rating-label');
    await expect(labels).toHaveCount(CARD_SPECS.length * 2);

    for (let i = 0; i < CARD_SPECS.length * 2; i += 1) {
      const box = await labels.nth(i).boundingBox();
      expect(box, `라벨 ${i}: boundingBox 없음`).not.toBeNull();
      // 라벨 한 줄 = 10px * line-height 1.2 = 12px. 세로 쪼개지면 24/48px 가 된다.
      expect(box!.height, `라벨 ${i}: 한 줄이 아님 (height=${box!.height})`).toBeLessThan(16);
      expect(box!.height).toBeGreaterThan(0);
    }

    // CSS 계약: 뱃지 내부 요소는 절대 줄바꿈/축소되지 않는다.
    const styles = await page.evaluate(() => {
      const read = (selector: string) =>
        Array.from(document.querySelectorAll(selector)).map((el) => {
          const computed = getComputedStyle(el);
          return { whiteSpace: computed.whiteSpace, flexShrink: computed.flexShrink };
        });
      return {
        badges: read('.job-filter-rating-badge'),
        labels: read('.job-filter-rating-label'),
        stars: read('.job-filter-rating-star'),
        scores: read('.job-filter-rating-score'),
        wraps: read('.job-filter-ratings-wrap'),
      };
    });

    for (const group of [styles.badges, styles.labels, styles.stars, styles.scores, styles.wraps]) {
      expect(group.length).toBeGreaterThan(0);
      for (const item of group) {
        expect(item.whiteSpace).toBe('nowrap');
        expect(item.flexShrink).toBe('0');
      }
    }
  });

  test('회사명 행은 한 줄(flex-wrap: nowrap)을 유지하고 폭 부족분은 truncate 된 회사명이 흡수해야 한다', async ({
    page,
  }) => {
    const cards = page.locator('[data-component-type="CARD_JOB_BASIC"]');
    const firstCard = await cards.nth(0).boundingBox();
    expect(firstCard, '카드 boundingBox 없음').not.toBeNull();
    // 라이브 실측 카드 폭 305px 재현 확인
    expect(firstCard!.width).toBeCloseTo(LIVE_CARD_WIDTH, 0);

    const rows = page.locator('[data-component-type="CARD_JOB_BASIC"] .company-row');
    await expect(rows).toHaveCount(CARD_SPECS.length);

    for (let i = 0; i < CARD_SPECS.length; i += 1) {
      const row = rows.nth(i);
      const flexWrap = await row.evaluate((el) => getComputedStyle(el).flexWrap);
      expect(flexWrap, `카드 ${i}: 회사명 행이 여러 줄로 감싸짐`).toBe('nowrap');

      // 뱃지는 행 오른쪽 밖으로 넘치지 않아야 한다 (행의 overflow:hidden 에 잘리면 안 됨)
      const rowBox = await row.boundingBox();
      const secondBadge = await row.locator('.job-filter-rating-badge').nth(1).boundingBox();
      expect(rowBox, `카드 ${i}: 행 boundingBox 없음`).not.toBeNull();
      expect(secondBadge, `카드 ${i}: 블라인드 뱃지 boundingBox 없음`).not.toBeNull();
      expect(
        secondBadge!.x + secondBadge!.width,
        `카드 ${i}: 뱃지가 회사명 행 오른쪽 경계를 넘어 잘림`
      ).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 0.5);
    }

    // 가장 긴 회사명 카드는 말줄임(축소)으로 폭 부족분을 흡수해야 한다 → min-width:0 위임 확인
    const longNameIndex = CARD_SPECS.findIndex((spec) => spec.company === '주식회사 가온감정평가법인');
    expect(longNameIndex).toBeGreaterThanOrEqual(0);
    const companySpan = cards.nth(longNameIndex).locator('span.truncate');
    const truncation = await companySpan.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(
      truncation.scrollWidth,
      '긴 회사명이 줄어들지 않아 뱃지 폭을 침범함 (min-width:0 위임 실패)'
    ).toBeGreaterThan(truncation.clientWidth);
  });
});

test.describe('[회귀] 기존 목록 레이아웃(td.tplCo)의 뱃지 사이 줄바꿈 허용 의도는 유지되어야 한다', () => {
  test('좁은 열에서는 두 뱃지가 서로 다른 줄로 감싸되(wrap), 뱃지 내부 라벨은 쪼개지지 않는다', async ({
    page,
  }) => {
    await loadPage(page, TD_LAYOUT_HTML);

    const wrap = page.locator('td.tplCo .job-filter-ratings-wrap');
    await expect(wrap).toHaveCount(1);

    // 기존 규칙의 flex-wrap: wrap 의도 보존 확인
    const flexWrap = await wrap.evaluate((el) => getComputedStyle(el).flexWrap);
    expect(flexWrap, 'td.tplCo 뱃지 "사이" 줄바꿈 허용(flex-wrap: wrap)이 훼손됨').toBe('wrap');

    const badges = wrap.locator('.job-filter-rating-badge');
    await expect(badges).toHaveCount(2);
    const first = await badges.nth(0).boundingBox();
    const second = await badges.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    // "뱃지 사이"의 줄바꿈은 허용된다 → 두 뱃지가 다른 줄에 놓인다
    expect(
      Math.abs(first!.y - second!.y),
      `td.tplCo 에서 뱃지 사이 줄바꿈이 사라짐 (y=${first!.y} vs ${second!.y})`
    ).toBeGreaterThan(1);

    // 그래도 뱃지 "내부"는 절대 쪼개지지 않는다 (목표는 내부 고정뿐)
    expect(first!.height, 'td.tplCo 뱃지 내부가 세로로 쪼개짐').toBeLessThan(20);
    expect(second!.height, 'td.tplCo 뱃지 내부가 세로로 쪼개짐').toBeLessThan(20);

    const labels = wrap.locator('.job-filter-rating-label');
    for (let i = 0; i < 2; i += 1) {
      const labelBox = await labels.nth(i).boundingBox();
      expect(labelBox, `td.tplCo 라벨 ${i}: boundingBox 없음`).not.toBeNull();
      expect(labelBox!.height, `td.tplCo 라벨 ${i}: 한 줄이 아님`).toBeLessThan(16);
    }
  });
});

/**
 * [검증력(sensitivity) 보증] 이 스펙의 단언들이 "수정 전 상태"를 실제로 잡아낼 수 있는지 확인한다.
 *
 * 확장 style.css 를 주입하지 않고, 수정 전 문제를 일으켰던 두 조건
 *   (1) `.job-filter-rating-badge { white-space: normal }`
 *   (2) `.job-filter-ratings-wrap { flex-shrink: 1 }`
 * 만 라이브 유틸리티 위에 되돌린 뒤, 같은 측정을 수행해 뱃지가 세로로 쪼개짐을 재현한다.
 * → 본 스펙의 "뱃지 높이 < 20px" 류 단언이 공허하게 항상 참인 것이 아님을 보장한다.
 *
 * 실제 재현 결과 (동일 뷰포트/카드 폭 305px):
 *   - 수정 전: 뱃지 높이 [27, 27, 27, 27, 51, 51, 51, 51] — 2줄/4줄로 쪼개짐
 *   - 수정 후: 뱃지 높이 전부 18.19px (한 줄)
 */
test.describe('[검증력] 수정 전 CSS 조건에서는 세로 쪼개짐이 재현되어야 한다', () => {
  test('white-space: normal + flex-shrink: 1 로 되돌리면 뱃지 높이가 20px 를 넘고 카드마다 달라진다', async ({
    page,
  }) => {
    await page.setContent(
      `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>jobkorea-rating-layout-before</title></head><body>${CARD_SPECS.map(cardHtml).join('')}</body></html>`
    );
    await page.addStyleTag({ content: LIVE_BASE_STYLES });
    // 확장 style.css 는 주입하지 않는다. 대신 수정 전 뱃지 기본 규칙만 재현한다.
    await page.addStyleTag({
      content: `
        .job-filter-ratings-wrap { display: inline-flex; align-items: center; gap: 4px; margin-left: 6px; }
        .job-filter-rating-badge {
          display: inline-flex; align-items: center; gap: 2.5px;
          padding: 1.5px 6px; font-size: 11px; font-weight: 700; line-height: 1.2;
          letter-spacing: -0.2px; border-radius: 4px; text-decoration: none;
          white-space: normal; flex-shrink: 1;
        }
        .job-filter-rating-label { font-size: 10px; font-weight: 600; letter-spacing: -0.3px; }
        .job-filter-rating-star { font-size: 10px; line-height: 1; }
        .job-filter-rating-score { font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }
      `,
    });
    await page.evaluate(async () => {
      void document.body.offsetHeight;
      for (const animation of document.getAnimations()) {
        try {
          animation.finish();
        } catch {
          /* 무한 애니메이션 무시 */
        }
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });

    const heights = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.job-filter-rating-badge')).map(
        (el) => el.getBoundingClientRect().height
      )
    );

    // 최소 한 개 이상의 뱃지가 두 줄 이상(> 20px)으로 쪼개져야 한다.
    expect(
      heights.filter((height) => height >= 20).length,
      `수정 전 조건에서도 쪼개짐이 재현되지 않음 → 이 스펙의 단언이 공허함 (heights=${JSON.stringify(heights)})`
    ).toBeGreaterThan(0);

    // 뱃지 높이가 카드마다 제각각이어야 한다 (수정 전 실측: 18.2 / 29 / 53px).
    expect(
      new Set(heights.map((height) => Math.round(height))).size,
      `수정 전 조건에서 뱃지 높이가 균일함 → 회귀 재현 실패 (heights=${JSON.stringify(heights)})`
    ).toBeGreaterThan(1);
  });
});
