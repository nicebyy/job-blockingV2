import { JobCardInfo } from '../types';
import { BaseSiteAdapter, BlockActions } from './base';
import { SITE_DOMAINS, JUMPIT_SELECTORS } from '../constants';

export class JumpitAdapter extends BaseSiteAdapter {
  readonly name = 'Jumpit';

  public matches(url: string): boolean {
    return url.includes(SITE_DOMAINS.JUMPIT) || url.includes(SITE_DOMAINS.JUMPIT_LEGACY);
  }

  public override isDetailPage(
    url: string = typeof window !== 'undefined' ? window.location.href : ''
  ): boolean {
    return /\/position\/\d+/.test(url);
  }

  public getJobCardElements(container: Document | HTMLElement = document): HTMLElement[] {
    const rawElements = Array.from(
      container.querySelectorAll<HTMLElement>(JUMPIT_SELECTORS.JOB_CARDS)
    );

    const cardSet = new Set<HTMLElement>();
    for (const el of rawElements) {
      // 1. 공고 링크나 카드 내부 요소 기준 최상위 카드 컨테이너 탐색
      const baseCard =
        el.closest<HTMLElement>(JUMPIT_SELECTORS.CARD_CONTAINER) ||
        (el.matches('a[href*="/position/"]') ? el : el.closest<HTMLElement>('a[href*="/position/"]')) ||
        el;

      // 2. 카드 상위의 그리드/플렉스 셀 아이템 확인 (숨김 시 그리드 빈칸 없이 자연스럽게 당겨오도록 보장)
      const gridItem = baseCard.closest<HTMLElement>(JUMPIT_SELECTORS.GRID_ITEM);
      const jobCard = gridItem || baseCard;
      cardSet.add(jobCard);
    }

    // 3. 상세 페이지(/position/\d+) 단독 열람 시 상단 헤더 영역 지원
    const detailHeader = container.querySelector<HTMLElement>(JUMPIT_SELECTORS.DETAIL_HEADER);
    if (detailHeader) {
      cardSet.add(detailHeader);
    }

    return Array.from(cardSet);
  }

  /**
   * 사이드 윙 배너, 이벤트 배너, 포지션 상단 배너 등 광고/프로모션 숨김 처리
   */
  public override hidePromotionBanners(container: Document | HTMLElement = document): number {
    const rawBanners = Array.from(
      container.querySelectorAll<HTMLElement>(JUMPIT_SELECTORS.PROMOTION_BANNERS)
    );
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
      Boolean(element.querySelector(JUMPIT_SELECTORS.DETAIL_POSITION_TITLE)) ||
      element.matches(JUMPIT_SELECTORS.DETAIL_HEADER);

    let companyName = '';
    let title = '';
    let jobId: string | undefined;
    let closingDate: string | undefined;

    if (isDetail) {
      const companyEl = element.querySelector<HTMLElement>(JUMPIT_SELECTORS.DETAIL_COMPANY_NAME);
      companyName = companyEl?.textContent?.trim() || '';

      const titleEl = element.querySelector<HTMLElement>(JUMPIT_SELECTORS.DETAIL_POSITION_TITLE);
      title = titleEl?.textContent?.trim() || '';

      if (typeof window !== 'undefined' && window.location.pathname) {
        const match = window.location.pathname.match(/\/position\/(\d+)/);
        if (match) jobId = match[1];
      }

      // 상세 페이지 마감일 추출 (예: <dl><dt>마감일</dt><dd>2026-10-31</dd></dl>)
      let root: HTMLElement | Document | null = element;
      while (root && 'parentElement' in root && root.parentElement) {
        root = root.parentElement;
      }
      if (!root) {
        root = element.ownerDocument || (typeof document !== 'undefined' ? document : null);
      }

      const searchContainer = root || element;
      const dts = Array.from(searchContainer.querySelectorAll<HTMLElement>('dt'));
      const deadlineDt = dts.find((dt) => dt.textContent?.includes('마감일'));
      const dateEl =
        (deadlineDt?.nextElementSibling as HTMLElement | null) ||
        element.querySelector<HTMLElement>(JUMPIT_SELECTORS.DETAIL_CLOSING_DATE);
      closingDate = dateEl?.textContent?.trim() || undefined;
    } else {
      // 2. 일반 목록 공고 카드
      const companyEl = element.querySelector<HTMLElement>(JUMPIT_SELECTORS.COMPANY_NAME);
      const imgEl = element.querySelector<HTMLImageElement>('img[alt]');
      companyName = companyEl?.textContent?.trim() || imgEl?.alt?.trim() || '';

      const titleEl = element.querySelector<HTMLElement>(JUMPIT_SELECTORS.POSITION_TITLE);
      const linkEl =
        element.querySelector<HTMLAnchorElement>(JUMPIT_SELECTORS.JOB_LINK) ||
        (element instanceof HTMLAnchorElement ? element : null);
      title = titleEl?.textContent?.trim() || linkEl?.getAttribute('title')?.trim() || '';

      const href = linkEl?.getAttribute('href') || linkEl?.href || '';
      const match = href.match(/\/position\/(\d+)/);
      if (match) {
        jobId = match[1];
      }

      const dateEl = element.querySelector<HTMLElement>(JUMPIT_SELECTORS.CLOSING_DATE);
      closingDate = dateEl?.textContent?.trim() || undefined;
    }

    if (!companyName && !title) {
      return null;
    }

    // 광고 여부 판별 (배너 섹션 내부 또는 광고 뱃지 포함)
    const isAd = Boolean(
      element.closest(JUMPIT_SELECTORS.PROMOTION_BANNERS) ||
      element.querySelector(JUMPIT_SELECTORS.AD_BADGE) ||
      element.getAttribute('data-is-ad') === 'true'
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
      cardElement.querySelector<HTMLElement>(JUMPIT_SELECTORS.COMPANY_NAME) ||
      cardElement.querySelector<HTMLElement>(JUMPIT_SELECTORS.DETAIL_COMPANY_NAME)
    );
  }

  public override getRatingBadgeAnchorElement(cardElement: HTMLElement): HTMLElement | null {
    if (this.isDetailPage()) {
      return (
        cardElement.querySelector<HTMLElement>('a.name[href*="/company/"]') ||
        cardElement.querySelector<HTMLElement>(JUMPIT_SELECTORS.DETAIL_COMPANY_NAME) ||
        this.getCompanyElement(cardElement)
      );
    }
    return this.getCompanyElement(cardElement);
  }

  public override injectInlineButton(
    cardInfo: JobCardInfo,
    actions: BlockActions | ((companyName: string) => void)
  ): void {
    const detailHeader =
      (cardInfo.cardElement.matches?.(JUMPIT_SELECTORS.DETAIL_HEADER)
        ? cardInfo.cardElement
        : cardInfo.cardElement.querySelector<HTMLElement>(JUMPIT_SELECTORS.DETAIL_HEADER)) || null;

    if (detailHeader) {
      const titleInner =
        detailHeader.querySelector<HTMLElement>(JUMPIT_SELECTORS.DETAIL_TITLE_INNER) || detailHeader;
      super.injectInlineButton(cardInfo, actions, titleInner);
      return;
    }

    // 점핏 리스트 카드: 상위 카드 컨테이너가 존재할 경우 숨김 시 빈칸이 남지 않고 뒤의 카드가 당겨오도록 컨테이너 전체를 함께 숨김
    const hostContainer =
      cardInfo.cardElement.closest<HTMLElement>(JUMPIT_SELECTORS.CARD_CONTAINER) ||
      cardInfo.cardElement;

    if (hostContainer && hostContainer !== cardInfo.cardElement) {
      const onBlockCompany = typeof actions === 'function' ? actions : actions.onBlockCompany;
      const onBlockJob = typeof actions === 'object' ? actions.onBlockJob : undefined;

      super.injectInlineButton(cardInfo, {
        onBlockCompany: (compName) => {
          hostContainer.style.setProperty('display', 'none', 'important');
          hostContainer.setAttribute('data-job-filtered', 'true');
          hostContainer.setAttribute('data-filter-mode', 'hide');
          hostContainer.setAttribute('data-blocked-type', 'company');
          onBlockCompany?.(compName);
        },
        onBlockJob: (info) => {
          hostContainer.style.setProperty('display', 'none', 'important');
          hostContainer.setAttribute('data-job-filtered', 'true');
          hostContainer.setAttribute('data-filter-mode', 'hide');
          hostContainer.setAttribute('data-blocked-type', 'job');
          onBlockJob?.({ ...info, cardElement: hostContainer });
        },
      });
      return;
    }

    super.injectInlineButton(cardInfo, actions);
  }
}
