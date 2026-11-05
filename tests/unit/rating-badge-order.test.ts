import { describe, it, expect } from 'vitest';
import { JobKoreaAdapter } from '../../src/adapters/jobkorea';
import { RATING_BADGE_CONFIG } from '../../src/constants';
import type { CompanyRatingInfo } from '../../src/types';

/**
 * [회귀] 잡코리아 메인 CardJobBasic 카드에서 잡플래닛 / 블라인드 평점 뱃지의
 * 좌 → 우 표시 순서는 "응답 도착 순서"와 무관하게 항상 잡플래닛 → 블라인드 로 고정되어야 한다.
 *
 * ## 배경 (실제 발생한 버그)
 *
 * content script 는 attachJobplanetRating / attachBlindRating 을 각각 별도로 비동기 호출하고,
 * 응답이 도착하는 즉시 injectRatingBadge() 로 뱃지를 append 했다.
 * 그 결과 같은 목록 안에서도 카드마다 좌우 순서가 뒤바뀌었다.
 *
 *   실측(라이브 카드 8개): 카드 0,2,4,6 = 잡플래닛 → 블라인드
 *                          카드 1,3,5,7 = 블라인드 → 잡플래닛  (교차)
 *
 * ## 이 테스트가 지키는 계약
 *
 *   - 삽입 순서(누가 먼저 도착했는지)와 무관하게 wrap 자식 순서는 항상 잡플래닛 → 블라인드.
 *   - 우선순위는 RATING_BADGE_CONFIG.ORDER 상수에서 가져온다 (하드코딩 금지).
 *   - 동일 플랫폼 중복 주입 방지 로직은 그대로 유지된다.
 */

/** 잡코리아 메인 카드(div[data-component-type="CARD_JOB_BASIC"])의 회사명 행 재현 */
function createJobKoreaCard(companyName = '테스트컴퍼니'): HTMLElement {
  const card = document.createElement('div');
  card.setAttribute('data-component-type', 'CARD_JOB_BASIC');
  card.innerHTML = `
    <div class="flex items-center gap-[8px] overflow-hidden">
      <span class="truncate" style="flex-shrink:1">${companyName}</span>
      <span style="flex-shrink:0">D-16</span>
    </div>
    <div class="flex justify-between">
      <span>백엔드 개발자</span>
    </div>
  `;
  return card;
}

/** 주입된 뱃지의 플랫폼 식별자 목록을 wrap 자식 순서대로 반환 */
function getBadgeOrder(wrap: HTMLElement): string[] {
  return Array.from(wrap.children).map((child) => {
    if (child.classList.contains(RATING_BADGE_CONFIG.CLASSES.JOBPLANET)) return 'jobplanet';
    if (child.classList.contains(RATING_BADGE_CONFIG.CLASSES.BLIND)) return 'blind';
    return 'unknown';
  });
}

function jobplanetRating(companyName: string, rating = 4.1): CompanyRatingInfo {
  return {
    platform: 'jobplanet',
    status: 'found',
    companyName,
    rating,
    companyId: 12345,
    cachedAt: Date.now(),
  };
}

function blindRating(companyName: string, rating = 3.7): CompanyRatingInfo {
  return {
    platform: 'blind',
    status: 'found',
    companyName,
    rating,
    companyUrl: 'https://www.teamblind.com/kr/company/test',
    cachedAt: Date.now(),
  };
}

describe('[회귀] 평점 뱃지 좌우 순서는 응답 도착 순서와 무관하게 잡플래닛 → 블라인드 로 고정된다', () => {
  const adapter = new JobKoreaAdapter();

  it('우선순위 상수(ORDER)는 잡플래닛이 블라인드보다 왼쪽(작은 값)이어야 한다', () => {
    // 하드코딩 금지 규칙: 삽입 순서 판단 근거는 반드시 이 상수를 사용한다.
    expect(RATING_BADGE_CONFIG.ORDER.jobplanet).toBe(0);
    expect(RATING_BADGE_CONFIG.ORDER.blind).toBe(1);
    expect(RATING_BADGE_CONFIG.ORDER.jobplanet).toBeLessThan(RATING_BADGE_CONFIG.ORDER.blind);
  });

  it('블라인드가 먼저 도착해도 잡플래닛 삽입 시 잡플래닛이 블라인드 앞에 위치해야 한다', () => {
    const card = createJobKoreaCard('블라인드선도착');
    const cardInfo = adapter.parseCard(card)!;
    expect(cardInfo).not.toBeNull();

    // 응답 도착 순서: 블라인드 → 잡플래닛 (기존 버그 재현 조건)
    adapter.injectRatingBadge(cardInfo, blindRating(cardInfo.companyName));
    adapter.injectRatingBadge(cardInfo, jobplanetRating(cardInfo.companyName));

    const wrap = card.querySelector<HTMLElement>(`.${RATING_BADGE_CONFIG.CLASSES.WRAP}`);
    expect(wrap).not.toBeNull();
    expect(wrap!.children.length).toBe(2);
    expect(getBadgeOrder(wrap!)).toEqual(['jobplanet', 'blind']);
  });

  it('잡플래닛이 먼저 도착한 경우에도 블라인드는 뒤에 append 되어 순서가 유지되어야 한다', () => {
    const card = createJobKoreaCard('잡플래닛선도착');
    const cardInfo = adapter.parseCard(card)!;

    // 응답 도착 순서: 잡플래닛 → 블라인드 (정상 순서)
    adapter.injectRatingBadge(cardInfo, jobplanetRating(cardInfo.companyName));
    adapter.injectRatingBadge(cardInfo, blindRating(cardInfo.companyName));

    const wrap = card.querySelector<HTMLElement>(`.${RATING_BADGE_CONFIG.CLASSES.WRAP}`);
    expect(wrap).not.toBeNull();
    expect(wrap!.children.length).toBe(2);
    // 역순 삽입(앞으로 끼워넣기) 없이 append 되어야 한다.
    expect(getBadgeOrder(wrap!)).toEqual(['jobplanet', 'blind']);
  });

  it('두 플랫폼의 주입 순서를 뒤집어 반복해도 DOM 순서는 항상 동일해야 한다', () => {
    const permutations: Array<'jobplanet' | 'blind'> = ['jobplanet', 'blind', 'blind', 'jobplanet'];

    // 2개씩 끊어 (첫 삽입, 두 번째 삽입) 순열 2가지를 모두 검증한다.
    for (let i = 0; i < permutations.length; i += 2) {
      const card = createJobKoreaCard(`순서검증${i}`);
      const cardInfo = adapter.parseCard(card)!;
      const first = permutations[i];
      const second = permutations[i + 1];

      const ratingOf = (platform: 'jobplanet' | 'blind') =>
        platform === 'jobplanet'
          ? jobplanetRating(cardInfo.companyName)
          : blindRating(cardInfo.companyName);

      adapter.injectRatingBadge(cardInfo, ratingOf(first));
      adapter.injectRatingBadge(cardInfo, ratingOf(second));

      const wrap = card.querySelector<HTMLElement>(`.${RATING_BADGE_CONFIG.CLASSES.WRAP}`)!;
      expect(getBadgeOrder(wrap)).toEqual(['jobplanet', 'blind']);

      // 각 뱃지가 실제로 다른 요소이며 중복 삽입되지 않았는지 확인
      const jpBadges = wrap.querySelectorAll(`.${RATING_BADGE_CONFIG.CLASSES.JOBPLANET}`);
      const blindBadges = wrap.querySelectorAll(`.${RATING_BADGE_CONFIG.CLASSES.BLIND}`);
      expect(jpBadges.length).toBe(1);
      expect(blindBadges.length).toBe(1);
    }
  });

  it('동일 플랫폼 뱃지를 중복 주입해도 뱃지는 1개만 유지되어야 한다', () => {
    const card = createJobKoreaCard('중복주입방지');
    const cardInfo = adapter.parseCard(card)!;

    // 블라인드 → 잡플래닛 → 블라인드(중복) → 잡플래닛(중복)
    adapter.injectRatingBadge(cardInfo, blindRating(cardInfo.companyName, 3.5));
    adapter.injectRatingBadge(cardInfo, jobplanetRating(cardInfo.companyName, 4.2));
    adapter.injectRatingBadge(cardInfo, blindRating(cardInfo.companyName, 3.5));
    adapter.injectRatingBadge(cardInfo, jobplanetRating(cardInfo.companyName, 4.2));

    const wrap = card.querySelector<HTMLElement>(`.${RATING_BADGE_CONFIG.CLASSES.WRAP}`)!;
    expect(wrap.children.length).toBe(2);
    expect(getBadgeOrder(wrap)).toEqual(['jobplanet', 'blind']);
  });

  it('wrap 안에 뱃지가 아닌 자식 요소가 섞여 있어도 순서 삽입이 안전하게 동작해야 한다', () => {
    const card = createJobKoreaCard('이물요소');
    const cardInfo = adapter.parseCard(card)!;

    // 외부 스크립트/스타일 등으로 wrap 안에 뱃지가 아닌 노드가 들어간 상황을 가정한다.
    const wrap = document.createElement('span');
    wrap.className = RATING_BADGE_CONFIG.CLASSES.WRAP;
    const foreignNode = document.createElement('span');
    foreignNode.className = 'unexpected-node';
    wrap.appendChild(foreignNode);
    card.appendChild(wrap);

    adapter.injectRatingBadge(cardInfo, blindRating(cardInfo.companyName));
    adapter.injectRatingBadge(cardInfo, jobplanetRating(cardInfo.companyName));

    // 뱃지가 아닌 요소는 우선순위 비교에서 제외되므로 삽입 위치 판단에 영향을 주지 않는다.
    expect(getBadgeOrder(wrap)).toEqual(['unknown', 'jobplanet', 'blind']);
    expect(wrap.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.JOBPLANET}`)).not.toBeNull();
    expect(wrap.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.BLIND}`)).not.toBeNull();
  });
});
