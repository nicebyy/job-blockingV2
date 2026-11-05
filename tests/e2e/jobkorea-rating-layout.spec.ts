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

/**
 * 잡코리아 TOP100(/top100/)은 메인 CardJobBasic 과 **완전히 다른 레거시 레이아웃**이다.
 *
 *   <ol class="rankList listItem">
 *     <li class="dmpItem">
 *       <div class="rank">…</div>
 *       <div class="co">
 *         <div class="coTit">                       ← width: 150px, display: flex, flex-wrap: wrap
 *           <a class="coLink"><b>회사명</b></a>
 *           <button class="tplBtnTy tplBtnFavOff devFavor">…</button>
 *           <span class="job-filter-ratings-wrap">…</span>   ← 확장이 주입
 *         </div>
 *         <div class="coDesc">…</div>
 *       </div>
 *       <div class="info">…</div>                   ← 옆 열(공고 제목)
 *       <div class="side">…</div>
 *     </li>
 *   </ol>
 *
 * 회사명 열(`.coTit`)이 150px 로 **고정 폭**이라, 뱃지 두 개(내용폭 약 163.5px)가
 * 한 줄에 들어가지 않으면 `.coTit` 의 `flex-wrap: wrap` 때문에 뱃지 사이에서 줄이 바뀌고,
 * 그 상태에서 다시 뱃지 내부가 압축되면 라벨이 한 글자씩 세로로 쪼개진다.
 *
 * 실측(라이브 TOP100, 신입/경력 두 탭 동일):
 *   - 수정 전: 뱃지 높이 29px, 라벨 높이 24px (2줄), white-space: normal, flex-shrink: 1
 *   - 수정 후: 뱃지 높이 18.19px, 라벨 높이 12px (1줄), white-space: nowrap, flex-shrink: 0
 */
const TOP100_LAYOUT_HTML = `
  <ol class="rankList listItem" style="list-style:none;margin:0;padding:0;">
    ${[
      { company: '㈜농심', jobplanetScore: '3.0', blindScore: '3.2', desc: '1000대기업' },
      { company: '한미그룹', jobplanetScore: '3.0', blindScore: '3.2', desc: '우수기업' },
      { company: '캐논쎄미콘덕터엔지니어링코리아㈜', jobplanetScore: '3.0', blindScore: '3.2', desc: '외국계' },
    ]
      .map(
        (spec, i) => `
      <li class="dmpItem" style="display:flex;width:918px;padding:12px 0;border-bottom:1px solid #eee;">
        <div class="rank" style="width:45.9px;"><span class="num">${i + 1}</span></div>
        <div class="co" style="width:192.8px;">
          <div class="coTit" style="width:150px;display:flex;flex-wrap:wrap;align-items:center;gap:4px;">
            <a class="coLink" href="#"><b>${spec.company}</b></a>
            <button type="button" class="tplBtnTy tplBtnFavOff devFavor"><span>관심기업</span></button>
            <span class="job-filter-ratings-wrap">
              ${badgeHtml('jobplanet', spec.jobplanetScore)}
              ${badgeHtml('blind', spec.blindScore)}
            </span>
          </div>
          <div class="coDesc"><span>${spec.desc}</span></div>
        </div>
        <div class="info" style="width:578.3px;padding-left:0;">채용 공고 제목 영역</div>
        <div class="side" style="width:101px;">즉시지원</div>
      </li>`
      )
      .join('')}
  </ol>`;

test.describe('[회귀] 잡코리아 TOP100(레거시 ol.rankList) 뱃지도 한 줄로 표시되어야 한다', () => {
  test.beforeEach(async ({ page }) => {
    await loadPage(page, TOP100_LAYOUT_HTML);
  });

  test('두 뱃지가 한 줄(< 20px)이고 라벨이 쪼개지지 않으며 좌→우 순서가 잡플래닛 → 블라인드 여야 한다', async ({
    page,
  }) => {
    const cards = page.locator('ol.rankList li.dmpItem');
    await expect(cards).toHaveCount(3);

    for (let i = 0; i < 3; i += 1) {
      const badges = cards.nth(i).locator('.job-filter-rating-badge');
      await expect(badges).toHaveCount(2);

      const jobplanet = await badges.nth(0).boundingBox();
      const blind = await badges.nth(1).boundingBox();
      expect(jobplanet).not.toBeNull();
      expect(blind).not.toBeNull();

      // TOP100 실측 수정 전: 29px(라벨 24px = 2줄) → 수정 후 18.19px
      expect(
        jobplanet!.height,
        `TOP100 카드 ${i}: 잡플래닛 뱃지가 여러 줄로 쪼개짐 (height=${jobplanet!.height})`
      ).toBeLessThan(20);
      expect(
        blind!.height,
        `TOP100 카드 ${i}: 블라인드 뱃지가 여러 줄로 쪼개짐 (height=${blind!.height})`
      ).toBeLessThan(20);

      // 두 뱃지가 같은 줄 (한 줄에 나란히)
      expect(
        Math.abs(jobplanet!.y - blind!.y),
        `TOP100 카드 ${i}: 뱃지 사이에서 줄이 바뀜 (y=${jobplanet!.y} vs ${blind!.y})`
      ).toBeLessThanOrEqual(0.5);

      // 좌→우 순서
      expect(
        jobplanet!.x,
        `TOP100 카드 ${i}: 좌우 순서가 뒤바뀜 (잡플래닛 x=${jobplanet!.x}, 블라인드 x=${blind!.x})`
      ).toBeLessThan(blind!.x);

      await expect(badges.nth(0)).toContainText('잡플래닛');
      await expect(badges.nth(1)).toContainText('블라인드');
    }

    // 라벨 높이 검증 (한 줄 = 12px)
    const labels = page.locator('ol.rankList .job-filter-rating-label');
    await expect(labels).toHaveCount(6);
    for (let i = 0; i < 6; i += 1) {
      const box = await labels.nth(i).boundingBox();
      expect(box, `TOP100 라벨 ${i}: boundingBox 없음`).not.toBeNull();
      expect(box!.height, `TOP100 라벨 ${i}: 한 줄이 아님`).toBeLessThan(16);
    }
  });

  test('TOP100 뱃지도 nowrap + flex-shrink:0 이어야 한다 (셀렉터 비의존 방어)', async ({ page }) => {
    const styles = await page.evaluate(() => {
      const read = (selector: string) =>
        Array.from(document.querySelectorAll(selector)).map((el) => {
          const cs = getComputedStyle(el);
          return { whiteSpace: cs.whiteSpace, flexShrink: cs.flexShrink };
        });
      return {
        badges: read('ol.rankList .job-filter-rating-badge'),
        labels: read('ol.rankList .job-filter-rating-label'),
        wraps: read('ol.rankList .job-filter-ratings-wrap'),
      };
    });

    for (const group of [styles.badges, styles.labels, styles.wraps]) {
      expect(group.length).toBeGreaterThan(0);
      for (const item of group) {
        expect(item.whiteSpace).toBe('nowrap');
        expect(item.flexShrink).toBe('0');
      }
    }
  });
});

/**
 * [회귀] 잡코리아 TOP100(/top100/) 회사명 열(.coTit) 대비 뱃지 wrap 의 overhang
 *
 * ## 배경 (라이브 실측 — 신입 탭 10행 전수)
 *
 * 사이트 CSS 가 TOP100 레거시 레이아웃의 회사명 열 `.coTit` 을 `width: 150px` 로 고정한다.
 * 확장이 주입하는 뱃지 wrap 의 내용폭은 163.5px(잡플래닛 + 블라인드 + gap 4px)이라
 * `.coTit` 오른쪽 경계를 **+15.5px 넘친다**. 다음 열 `.info` 시작 x 까지는 18.3px 여유가
 * 있어 실제 겹침은 아직 없지만, 폰트/브라우저 배율 변화로 뱃지 폭이 조금만 커져도
 * 곧바로 공고 제목 열을 침범한다.
 *
 * 해결 (src/content/style.css):
 *   ol.rankList > li.dmpItem .coTit:has(> .job-filter-ratings-wrap) { min-width: 170px }
 *
 * 실측 (수정 전 → 수정 후, 라이브 10행 평균):
 *   - .coTit 폭                              : 150px  → 170px
 *   - 뱃지 wrap 오른쪽 끝 − .coTit 오른쪽 끝 : +15.5px → **-4.5px** (overhang 해소)
 *   - 뱃지 wrap 오른쪽 끝 − .info 열 시작 x  : 18.3px → 27.3px (겹침 0)
 *   - 행 높이                                : 137/145.2px → 137/141.2px
 *   - 뱃지 미주입 상태의 사이트 레이아웃은 100% 동일 (`:has()` 스코프, 부작용 0)
 *
 * 아래 픽스처는 라이브 TOP100 행의 실제 열 폭(rank 45.9 / co 192.8 / info 578.3 / side 101,
 * li 918)을 그대로 재현한다. 뱃지가 없는 행 1개를 함께 넣어 `:has()` 스코프를 검증한다.
 *
 * ## 뱃지 폭 고정 이유
 *
 * 라이브 TOP100 에서 측정한 뱃지 1개(테두리 포함)의 폭은 79.75px 이고,
 * wrap 내용폭 163.5px = 2 × 79.75px + gap 4px 이다.
 * 폰트 메트릭은 OS/브라우저마다 달라서(이 환경의 Malgun Gothic 에서는 뱃지가 83.66px 로
 * 4.7px 더 넓게 렌더링된다) 뱃지 폭을 그대로 두면 overhang 판정이 실행 환경에 따라
 * 비결정적이 된다. 레이아웃 기하만 검증하는 테스트이므로 뱃지 **박스 폭만** 라이브 실측값으로
 * 고정한다 (내부 DOM/클래스/글꼴 설정은 `badgeHtml` 과 완전히 동일).
 */
const LIVE_TOP100_BADGE_WIDTH = 79.75;

const top100BadgeHtml = (platform: 'jobplanet' | 'blind', score: string): string =>
  badgeHtml(platform, score).replace(
    'class="job-filter-rating-badge',
    `style="box-sizing: border-box; width: ${LIVE_TOP100_BADGE_WIDTH}px;" class="job-filter-rating-badge`
  );

const TOP100_OVERHANG_HTML = `
  <ol class="rankList listItem" style="list-style:none;margin:0;padding:0;font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;font-size:14px;line-height:1.4;color:#111;">
    ${[
      { company: '㈜농심', jobplanetScore: '3.0', blindScore: '3.2', desc: '1000대기업' },
      { company: '한미그룹', jobplanetScore: '4.1', blindScore: '3.0', desc: '우수기업' },
      { company: '뱃지없는회사', jobplanetScore: '', blindScore: '', desc: '스코프 확인용' },
    ]
      .map(
        (spec, i) => `
      <li class="dmpItem" style="display:flex;width:918px;padding:12px 0;border-bottom:1px solid #eee;">
        <div class="rank" style="width:45.9px;"><span class="num">${i + 1}</span></div>
        <div class="co" style="width:192.8px;">
          <div class="coTit" style="width:150px;">
            <a class="coLink" href="#"><b>${spec.company}</b></a>
            <button type="button" class="tplBtnTy tplBtnFavOff devFavor"><span>관심기업</span></button>${
              spec.jobplanetScore
                ? `
            <span class="job-filter-ratings-wrap">
              ${top100BadgeHtml('jobplanet', spec.jobplanetScore)}
              ${top100BadgeHtml('blind', spec.blindScore)}
            </span>`
                : ''
            }
          </div>
          <div class="coDesc"><span>${spec.desc}</span></div>
        </div>
        <div class="info" style="width:578.3px;padding-left:0;">채용 공고 제목 영역</div>
        <div class="side" style="width:101px;">즉시지원</div>
      </li>`
      )
      .join('')}
  </ol>`;

/** TOP100_OVERHANG_HTML 에서 뱃지가 주입된 행 수 (마지막 1행은 뱃지 미주입 = 스코프 확인용) */
const TOP100_BADGE_ROW_COUNT = 2;

test.describe('[회귀] 잡코리아 TOP100 뱃지 wrap 은 회사명 열(.coTit) 폭을 넘지 않아야 한다', () => {
  test.beforeEach(async ({ page }) => {
    await loadPage(page, TOP100_OVERHANG_HTML);
  });

  test('overhang: 뱃지 wrap 오른쪽 끝이 .coTit/.co 열 오른쪽 끝과 .info 열 시작 x 를 넘지 않는다', async ({
    page,
  }) => {
    const rows = page.locator('ol.rankList li.dmpItem');
    await expect(rows).toHaveCount(TOP100_BADGE_ROW_COUNT + 1);

    for (let i = 0; i < TOP100_BADGE_ROW_COUNT; i += 1) {
      const row = rows.nth(i);
      const wrap = row.locator('.job-filter-ratings-wrap');
      await expect(wrap).toHaveCount(1);

      const wrapBox = await wrap.boundingBox();
      const coTitBox = await row.locator('.coTit').boundingBox();
      const coBox = await row.locator('.co').boundingBox();
      const infoBox = await row.locator('.info').boundingBox();
      expect(wrapBox, `TOP100 행 ${i}: 뱃지 wrap boundingBox 없음`).not.toBeNull();
      expect(coTitBox, `TOP100 행 ${i}: .coTit boundingBox 없음`).not.toBeNull();
      expect(coBox, `TOP100 행 ${i}: .co 열 boundingBox 없음`).not.toBeNull();
      expect(infoBox, `TOP100 행 ${i}: .info 열 boundingBox 없음`).not.toBeNull();

      const wrapRight = wrapBox!.x + wrapBox!.width;
      const coTitRight = coTitBox!.x + coTitBox!.width;
      const coRight = coBox!.x + coBox!.width;

      // (a) 회사명 열(.coTit) 오른쪽 끝을 넘지 않는다. 수정 전 라이브 실측은 +15.5px.
      //     (서브픽셀 반올림 허용 오차 0.5px)
      expect(
        wrapRight,
        `TOP100 행 ${i}: 뱃지 wrap 이 .coTit 오른쪽으로 ${(wrapRight - coTitRight).toFixed(1)}px 넘침 (overhang)`
      ).toBeLessThanOrEqual(coTitRight + 0.5);

      // 수정 후 라이브 실측은 -4.5px (뱃지 wrap 이 .coTit 안쪽에 4.5px 여유). 픽스처도 같은 값이어야 한다.
      expect(
        wrapRight - coTitRight,
        `TOP100 행 ${i}: overhang 여유가 라이브 실측(-4.5px)과 다름`
      ).toBeCloseTo(-4.5, 0);

      // (a-2) 부모 .co 열 오른쪽 끝도 넘지 않는다 (라이브 overCo 실측 -18.3px)
      expect(
        wrapRight,
        `TOP100 행 ${i}: 뱃지 wrap 이 .co 열 오른쪽으로 넘침`
      ).toBeLessThanOrEqual(coRight + 0.5);

      // (b) 다음 열 .info 시작 x 를 넘지 않는다 = 공고 제목과 겹침 0 (라이브 gap 18.3px)
      expect(
        wrapRight,
        `TOP100 행 ${i}: 뱃지 wrap 이 .info 열을 침범함 (겹침 ${(wrapRight - infoBox!.x).toFixed(1)}px)`
      ).toBeLessThanOrEqual(infoBox!.x + 0.5);

      // 수정 후 라이브 실측 gapToInfo 는 27.3px (= 18.3px gap + 9px 완충).
      expect(
        infoBox!.x - wrapRight,
        `TOP100 행 ${i}: .info 열까지의 여유가 라이브 실측(27.3px)과 다름`
      ).toBeCloseTo(27.3, 0);

      // 뱃지가 실제로 회사명 열 안쪽에 들어왔는지(=여유가 0 이상인지)도 확인한다.
      expect(wrapBox!.width, `TOP100 행 ${i}: 뱃지 wrap 폭이 0`).toBeGreaterThan(0);
    }
  });

  test('min-width 스코프: 뱃지가 있는 행의 .coTit 만 170px 이고 뱃지 없는 행은 150px 그대로다', async ({
    page,
  }) => {
    const coTits = page.locator('ol.rankList li.dmpItem .coTit');
    await expect(coTits).toHaveCount(TOP100_BADGE_ROW_COUNT + 1);

    for (let i = 0; i < TOP100_BADGE_ROW_COUNT; i += 1) {
      const coTit = coTits.nth(i);
      // (c) 확장 CSS 의 `:has(> .job-filter-ratings-wrap)` 스코프가 걸린 행만 170px
      await expect(coTit, `TOP100 행 ${i}: 뱃지가 있는데 min-width 가 170px 이 아님`).toHaveCSS(
        'min-width',
        '170px'
      );
      const box = await coTit.boundingBox();
      expect(box, `TOP100 행 ${i}: .coTit boundingBox 없음`).not.toBeNull();
      expect(box!.width, `TOP100 행 ${i}: .coTit 실제 폭이 170px 이 아님`).toBeCloseTo(170, 0);
    }

    // (d) 뱃지가 없는 행은 :has() 스코프 밖 → min-width 규칙 미적용, 사이트의 150px 고정 유지
    const noBadgeRow = page.locator('ol.rankList li.dmpItem').nth(TOP100_BADGE_ROW_COUNT);
    await expect(noBadgeRow.locator('.job-filter-ratings-wrap')).toHaveCount(0);
    const noBadgeCoTit = noBadgeRow.locator('.coTit');
    const noBadgeMinWidth = await noBadgeCoTit.evaluate((el) => getComputedStyle(el).minWidth);
    expect(
      noBadgeMinWidth,
      `뱃지 없는 행에도 min-width: 170px 이 적용됨 (스코프 누수, min-width=${noBadgeMinWidth})`
    ).not.toBe('170px');
    await expect(noBadgeCoTit).toHaveCSS('display', 'flex');
    const noBadgeBox = await noBadgeCoTit.boundingBox();
    expect(noBadgeBox, '뱃지 없는 행: .coTit boundingBox 없음').not.toBeNull();
    expect(
      noBadgeBox!.width,
      `뱃지 없는 행의 .coTit 폭이 사이트 고정값 150px 에서 변함 (width=${noBadgeBox!.width})`
    ).toBeCloseTo(150, 0);
  });

  /**
   * [검증력(sensitivity) 보증] 위 overhang 단언이 "수정 전 상태"를 실제로 잡아낼 수 있는지 확인한다.
   *
   * 확장 style.css 에서 overhang 규칙(`min-width: 170px`)만 제거하고 동일 픽스처를 측정하면
   * `.coTit` 은 사이트 고정값 150px 로 돌아가고 뱃지 wrap 은 이를 넘어야 한다.
   * → 라이브 수정 전 실측(+15.5px)과 같은 값이 재현되어야 하며, 이 값이 나와야 위 단언이
   *   공허하게 항상 참인 것이 아님을 보장한다.
   */
  test('[검증력] overhang 규칙을 제거하면 뱃지 wrap 이 .coTit 을 다시 넘어야 한다', async ({ page }) => {
    // 새로 추가한 규칙 블록만 정확히 걷어낸다 (다른 규칙은 그대로).
    const OVERHANG_RULE = /ol\.rankList > li\.dmpItem \.coTit:has\(> \.job-filter-ratings-wrap\)[\s\S]*?\}/;
    expect(STYLE_CSS, 'overhang 규칙을 style.css 에서 찾지 못함').toMatch(OVERHANG_RULE);
    const cssBeforeFix = STYLE_CSS.replace(OVERHANG_RULE, '');
    expect(cssBeforeFix, 'overhang 규칙 제거 후에도 170px min-width 가 남아 있음').not.toMatch(
      /\.coTit:has\(> \.job-filter-ratings-wrap\)/
    );

    await page.setContent(
      `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>top100-overhang-before</title></head><body>${TOP100_OVERHANG_HTML}</body></html>`
    );
    await page.addStyleTag({ content: LIVE_BASE_STYLES });
    await page.addStyleTag({ content: cssBeforeFix });
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

    const row = page.locator('ol.rankList li.dmpItem').nth(0);
    const coTit = await row.locator('.coTit').boundingBox();
    const wrap = await row.locator('.job-filter-ratings-wrap').boundingBox();
    expect(coTit).not.toBeNull();
    expect(wrap).not.toBeNull();

    // 수정 전에는 .coTit 이 사이트 고정값 150px 이다.
    expect(coTit!.width, `수정 전 조건에서 .coTit 폭이 150px 이 아님 (${coTit!.width})`).toBeCloseTo(
      150,
      0
    );

    // 그리고 뱃지 wrap 이 .coTit 오른쪽을 넘는다 = 라이브 수정 전 실측 +15.5px
    const overhang = wrap!.x + wrap!.width - (coTit!.x + coTit!.width);
    expect(
      overhang,
      `overhang 규칙 없이도 넘침이 재현되지 않음 → overhang 단언이 공허함 (overhang=${overhang.toFixed(1)}px)`
    ).toBeGreaterThan(1);
    // 라이브 실측 +15.5px 과 같은 값이어야 픽스처가 라이브를 제대로 재현한 것이다 (허용 오차 0.5px).
    expect(
      overhang,
      `라이브 실측(+15.5px)과 픽스처 값이 다름 (overhang=${overhang.toFixed(1)}px)`
    ).toBeCloseTo(15.5, 0);
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
