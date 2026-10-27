import { JobCardInfo } from '../types';
import { BaseSiteAdapter, BlockActions } from './base';
import { SITE_DOMAINS, REMEMBER_SELECTORS } from '../constants';

export class RememberAdapter extends BaseSiteAdapter {
  readonly name = 'Remember';

  public matches(url: string): boolean {
    return url.includes(SITE_DOMAINS.REMEMBER);
  }

  public override isDetailPage(
    url: string = typeof window !== 'undefined' ? window.location.href : ''
  ): boolean {
    return /\/job\/postings?\/\d+/.test(url);
  }

  public getJobCardElements(container: Document | HTMLElement = document): HTMLElement[] {
    const rawElements = Array.from(
      container.querySelectorAll<HTMLElement>(REMEMBER_SELECTORS.JOB_CARDS)
    );

    const cardSet = new Set<HTMLElement>();
    for (const el of rawElements) {
      // 1. 공고 링크나 카드 내부 요소 기준 최상위 컨테이너 탐색
      const baseCard =
        el.closest<HTMLElement>(REMEMBER_SELECTORS.CARD_CONTAINER) ||
        (el.matches('a[href*="/job/posting/"], a[href*="/job/postings/"], a[href*="postingId="]')
          ? el
          : el.closest<HTMLElement>(
              'a[href*="/job/posting/"], a[href*="/job/postings/"], a[href*="postingId="]'
            )) ||
        el;

      // 2. 그리드/리스트 아이템(li)이 상위에 존재하면 li를 최상위 카드로 채택 (숨김 시 그리드 자연스러운 재배치/Reflow)
      const gridItem = baseCard.closest<HTMLElement>(REMEMBER_SELECTORS.GRID_ITEM);
      const jobCard = gridItem || baseCard;
      cardSet.add(jobCard);
    }

    // 3. 상세 페이지(/job/posting/\d+) 단독 열람 시 상단 헤더 컨테이너 지원
    const detailHeader = container.querySelector<HTMLElement>(REMEMBER_SELECTORS.DETAIL_HEADER);
    if (detailHeader) {
      cardSet.add(detailHeader);
    }

    return Array.from(cardSet);
  }

  /**
   * "프리미엄 대표기업" 섹션 및 상단 광고 캐러셀 배너 숨김 처리
   */
  public override hidePromotionBanners(container: Document | HTMLElement = document): number {
    const rawBanners = Array.from(
      container.querySelectorAll<HTMLElement>(REMEMBER_SELECTORS.PROMOTION_BANNERS)
    );
    // 중첩된 하위 요소는 제외하고 최상위 배너 요소만 선별
    const topLevelBanners = rawBanners.filter(
      (el) => !rawBanners.some((parent) => parent !== el && parent.contains(el))
    );

    let count = 0;
    topLevelBanners.forEach((el) => {
      el.style.display = 'none';
      el.setAttribute('data-job-filtered', 'true');
      el.setAttribute('data-filter-mode', 'hide');
      el.setAttribute('data-blocked-type', 'ad');
      count++;
    });
    return count;
  }

  public parseCard(element: HTMLElement): JobCardInfo | null {
    // 1. 상세 페이지 헤더 판별
    const isDetail =
      Boolean(element.querySelector(REMEMBER_SELECTORS.DETAIL_POSITION_TITLE)) ||
      element.matches(REMEMBER_SELECTORS.DETAIL_HEADER);

    let companyName = '';
    let title = '';
    let jobId: string | undefined;
    let closingDate: string | undefined;

    if (isDetail) {
      const companyEl = element.querySelector<HTMLElement>(REMEMBER_SELECTORS.DETAIL_COMPANY_NAME);
      companyName = companyEl?.textContent?.trim() || '';

      const titleEl = element.querySelector<HTMLElement>(REMEMBER_SELECTORS.DETAIL_POSITION_TITLE);
      title = titleEl?.textContent?.trim() || '';

      if (typeof window !== 'undefined' && window.location) {
        const match =
          window.location.pathname.match(/\/job\/postings?\/(\d+)/) ||
          window.location.search.match(/postingId=(\d+)/);
        if (match) jobId = match[1];
      }
    } else {
      // 2. 일반 공고 카드
      const companyEl = element.querySelector<HTMLElement>(REMEMBER_SELECTORS.COMPANY_NAME);
      companyName = companyEl?.textContent?.trim() || '';

      const titleEl = element.querySelector<HTMLElement>(REMEMBER_SELECTORS.POSITION_TITLE);
      title = titleEl?.textContent?.trim() || '';

      const link =
        element.querySelector<HTMLAnchorElement>(REMEMBER_SELECTORS.JOB_LINK) ||
        (element instanceof HTMLAnchorElement ? element : null);
      const href = link?.getAttribute('href') || link?.href || '';
      const match = href.match(/\/job\/postings?\/(\d+)/) || href.match(/postingId=(\d+)/);
      if (match) {
        jobId = match[1];
      }

      const dateEl = element.querySelector<HTMLElement>(REMEMBER_SELECTORS.CLOSING_DATE);
      closingDate = dateEl?.textContent?.trim() || undefined;
    }

    if (!companyName && !title) {
      return null;
    }

    // 광고 여부 판정 (프로모션 배너 내부 또는 광고 뱃지 포함)
    const isAd = Boolean(
      element.closest(REMEMBER_SELECTORS.PROMOTION_BANNERS) ||
      element.querySelector(REMEMBER_SELECTORS.AD_BADGE)
    );

    return {
      cardElement: element,
      companyName,
      title,
      isAd,
      jobId,
      closingDate,
    };
  }

  public getCompanyElement(cardElement: HTMLElement): HTMLElement | null {
    return (
      cardElement.querySelector<HTMLElement>(REMEMBER_SELECTORS.COMPANY_NAME) ||
      cardElement.querySelector<HTMLElement>(REMEMBER_SELECTORS.DETAIL_COMPANY_NAME)
    );
  }

  public override injectInlineButton(
    cardInfo: JobCardInfo,
    actions: BlockActions | ((companyName: string) => void)
  ): void {
    const detailHeader =
      (cardInfo.cardElement.matches?.(REMEMBER_SELECTORS.DETAIL_HEADER)
        ? cardInfo.cardElement
        : cardInfo.cardElement.querySelector<HTMLElement>(REMEMBER_SELECTORS.DETAIL_HEADER)) || null;

    if (detailHeader) {
      const titleInner =
        detailHeader.querySelector<HTMLElement>(REMEMBER_SELECTORS.DETAIL_TITLE_INNER) || detailHeader;
      super.injectInlineButton(cardInfo, actions, titleInner);
      return;
    }

    // 리멤버 리스트/큐레이션/인기공고 카드: 상위 li(그리드 또는 캐러셀 셀) 또는 카드 컨테이너(sc-289d3ccd-0)가 존재할 경우 숨김 시 빈칸이 남지 않고 뒤의 카드가 당겨오도록 카드 전체를 함께 즉시 숨김
    const targetCard =
      cardInfo.cardElement.tagName.toUpperCase() === 'LI'
        ? cardInfo.cardElement
        : (cardInfo.cardElement.closest<HTMLElement>(
            'li, div[class*="sc-289d3ccd-0"], div[class*="sc-18344c98-0"]'
          ) || cardInfo.cardElement);

    if (targetCard) {
      const onBlockCompany = typeof actions === 'function' ? actions : actions.onBlockCompany;
      const onBlockJob = typeof actions === 'object' ? actions.onBlockJob : undefined;

      super.injectInlineButton(cardInfo, {
        onBlockCompany: (compName) => {
          targetCard.style.setProperty('display', 'none', 'important');
          targetCard.setAttribute('data-job-filtered', 'true');
          targetCard.setAttribute('data-filter-mode', 'hide');
          targetCard.setAttribute('data-blocked-type', 'company');
          onBlockCompany?.(compName);
        },
        onBlockJob: (info) => {
          targetCard.style.setProperty('display', 'none', 'important');
          targetCard.setAttribute('data-job-filtered', 'true');
          targetCard.setAttribute('data-filter-mode', 'hide');
          targetCard.setAttribute('data-blocked-type', 'job');
          onBlockJob?.({ ...info, cardElement: targetCard });
        },
      });
      return;
    }

    super.injectInlineButton(cardInfo, actions);
  }
}
