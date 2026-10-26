import { JobCardInfo } from '../types';
import { BaseSiteAdapter, BlockActions } from './base';
import { SITE_DOMAINS, WANTED_SELECTORS } from '../constants';

export class WantedAdapter extends BaseSiteAdapter {
  readonly name = 'Wanted';

  public matches(url: string): boolean {
    return url.includes(SITE_DOMAINS.WANTED);
  }

  public getJobCardElements(container: Document | HTMLElement = document): HTMLElement[] {
    const rawElements = Array.from(
      container.querySelectorAll<HTMLElement>(WANTED_SELECTORS.JOB_CARDS)
    );

    const cardSet = new Set<HTMLElement>();
    for (const el of rawElements) {
      // 1. data-cy="job-card" 또는 CARD_CONTAINER 요소를 기준으로 카드 베이스 요소 수집
      const baseCard =
        (el.matches('[data-cy="job-card"]') ? el : el.closest<HTMLElement>('[data-cy="job-card"]')) ||
        el.closest<HTMLElement>(WANTED_SELECTORS.CARD_CONTAINER) ||
        el;

      // 2. 만약 baseCard의 상위에 li 그리드/리스트 아이템(Card_Card 또는 ul > li)이 존재하면,
      //    숨김 시 그리드 셀 전체가 사라져 빈 공간 없이 뒤의 카드가 자연스럽게 당겨오도록(Reflow) li를 최상위 카드로 채택
      const gridItem = baseCard.closest<HTMLElement>(WANTED_SELECTORS.GRID_ITEM);
      const jobCard = gridItem || baseCard;
      cardSet.add(jobCard);
    }

    // 2. 상세 페이지(/wd/\d+) 단독 열람 시 상단 헤더 영역 지원
    const detailHeader = container.querySelector<HTMLElement>(WANTED_SELECTORS.DETAIL_HEADER);
    if (detailHeader) {
      cardSet.add(detailHeader);
    }

    return Array.from(cardSet);
  }

  /**
   * "🔥 적극 채용 중인 회사" 섹션 및 광고/프로모션 배너 숨김 처리
   */
  public override hidePromotionBanners(container: Document | HTMLElement = document): void {
    const banners = container.querySelectorAll<HTMLElement>(WANTED_SELECTORS.PROMOTION_BANNERS);
    banners.forEach((el) => {
      el.style.display = 'none';
      el.setAttribute('data-job-filtered', 'true');
      el.setAttribute('data-filter-mode', 'hide');
    });
  }

  public parseCard(element: HTMLElement): JobCardInfo | null {
    // 1. 북마크 버튼 내 data-* 속성 우선 확인 (원티드 리스트 카드 최신 스펙)
    const bookmarkBtn = element.querySelector<HTMLElement>(WANTED_SELECTORS.BOOKMARK_BUTTON);
    const btnCompany = bookmarkBtn?.getAttribute('data-company-name');
    const btnTitle = bookmarkBtn?.getAttribute('data-position-name');
    const btnJobId = bookmarkBtn?.getAttribute('data-position-id');

    // 2. 회사명 추출
    const companyEl =
      element.querySelector<HTMLElement>(WANTED_SELECTORS.COMPANY_NAME) ||
      element.querySelector<HTMLElement>(WANTED_SELECTORS.DETAIL_COMPANY_NAME);
    const companyName = btnCompany || companyEl?.textContent?.trim() || '';

    // 3. 공고 제목 추출
    const titleEl =
      element.querySelector<HTMLElement>(WANTED_SELECTORS.POSITION_TITLE) ||
      element.querySelector<HTMLElement>(WANTED_SELECTORS.DETAIL_POSITION_TITLE);
    const title = btnTitle || titleEl?.textContent?.trim() || '';

    if (!companyName && !title) {
      return null;
    }

    // 4. 광고 여부 (원티드 광고/스폰서 태그 또는 적극 채용 배너 내부)
    const isAd = Boolean(
      element.closest(WANTED_SELECTORS.PROMOTION_BANNERS) ||
      element.querySelector(WANTED_SELECTORS.AD_BADGE) ||
      element.getAttribute('data-is-ad') === 'true'
    );

    // 5. Job ID 추출 (북마크 버튼 속성, 링크의 /wd/ID, 또는 현재 URL fallback)
    let jobId = btnJobId;
    if (!jobId) {
      const link =
        element.querySelector<HTMLAnchorElement>(WANTED_SELECTORS.JOB_LINK) ||
        (element instanceof HTMLAnchorElement ? element : null);
      const match = link?.href?.match(/\/wd\/(\d+)/);
      if (match) jobId = match[1];
    }
    if (!jobId && typeof window !== 'undefined' && window.location.pathname.includes('/wd/')) {
      const match = window.location.pathname.match(/\/wd\/(\d+)/);
      if (match) jobId = match[1];
    }

    // 6. 마감일 또는 지역/경력 정보 추출
    const dateEl = element.querySelector<HTMLElement>(WANTED_SELECTORS.CLOSING_DATE);
    const closingDate = dateEl?.textContent?.trim() || undefined;

    return {
      cardElement: element,
      companyName,
      title,
      isAd,
      jobId: jobId || undefined,
      closingDate,

    };
  }

  public getCompanyElement(cardElement: HTMLElement): HTMLElement | null {
    return (
      cardElement.querySelector<HTMLElement>(WANTED_SELECTORS.COMPANY_NAME) ||
      cardElement.querySelector<HTMLElement>(WANTED_SELECTORS.DETAIL_COMPANY_NAME)
    );
  }

  public override injectInlineButton(
    cardInfo: JobCardInfo,
    actions: BlockActions | ((companyName: string) => void)
  ): void {
    const detailHeader =
      (cardInfo.cardElement.matches?.(WANTED_SELECTORS.DETAIL_HEADER)
        ? cardInfo.cardElement
        : cardInfo.cardElement.querySelector<HTMLElement>(WANTED_SELECTORS.DETAIL_HEADER)) || null;

    if (detailHeader) {
      const titleInner =
        detailHeader.querySelector<HTMLElement>(WANTED_SELECTORS.DETAIL_TITLE_INNER) || detailHeader;
      super.injectInlineButton(cardInfo, actions, titleInner);
      return;
    }

    // 원티드 리스트 카드: 상위 li(그리드 셀)가 존재할 경우 숨김 시 빈칸이 남지 않고 뒤의 카드가 당겨오도록 li 전체를 함께 즉시 숨김
    const hostLi =
      cardInfo.cardElement.tagName.toUpperCase() === 'LI'
        ? cardInfo.cardElement
        : cardInfo.cardElement.closest<HTMLElement>('li');

    if (hostLi && hostLi !== cardInfo.cardElement) {
      const onBlockCompany = typeof actions === 'function' ? actions : actions.onBlockCompany;
      const onBlockJob = typeof actions === 'object' ? actions.onBlockJob : undefined;

      super.injectInlineButton(cardInfo, {
        onBlockCompany: (compName) => {
          hostLi.style.setProperty('display', 'none', 'important');
          hostLi.setAttribute('data-job-filtered', 'true');
          hostLi.setAttribute('data-filter-mode', 'hide');
          onBlockCompany?.(compName);
        },
        onBlockJob: (info) => {
          hostLi.style.setProperty('display', 'none', 'important');
          hostLi.setAttribute('data-job-filtered', 'true');
          hostLi.setAttribute('data-filter-mode', 'hide');
          onBlockJob?.({ ...info, cardElement: hostLi });
        },
      });
      return;
    }

    super.injectInlineButton(cardInfo, actions);
  }
}

