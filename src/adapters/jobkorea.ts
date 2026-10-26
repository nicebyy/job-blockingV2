import { JobCardInfo } from '../types';
import { BaseSiteAdapter, BlockActions } from './base';
import {
  SITE_DOMAINS,
  JOBKOREA_SELECTORS,
  JOBKOREA_CONFIG,
  INLINE_BUTTON_CONFIG,
} from '../constants';

export class JobKoreaAdapter extends BaseSiteAdapter {
  readonly name = 'JobKorea';
  override readonly supportsInfiniteScroll = true;

  public matches(url: string): boolean {
    return url.includes(SITE_DOMAINS.JOBKOREA);
  }

  public getJobCardElements(container: Document | HTMLElement = document): HTMLElement[] {
    const rawElements = Array.from(
      container.querySelectorAll<HTMLElement>(JOBKOREA_SELECTORS.JOB_CARDS)
    );

    // 테이블 헤더 row 및 유효하지 않은 row 필터링
    const validElements = rawElements.filter((el) => {
      if (el.tagName.toUpperCase() === 'TR') {
        const hasCompany = Boolean(el.querySelector(JOBKOREA_SELECTORS.COMPANY_NAME));
        const hasTitle = Boolean(el.querySelector(JOBKOREA_SELECTORS.POSITION_TITLE));
        const hasGno = el.hasAttribute('data-gno') || el.hasAttribute('data-info');
        return (hasCompany || hasTitle) && (hasGno || hasCompany);
      }
      return true;
    });

    return Array.from(new Set(validElements));
  }

  /**
   * 상단 퍼포먼스 추천공고 및 광고 배너 숨김 처리
   */
  public override hidePromotionBanners(container: Document | HTMLElement = document): void {
    const banners = container.querySelectorAll<HTMLElement>(JOBKOREA_SELECTORS.PROMOTION_BANNERS);
    banners.forEach((el) => {
      el.style.display = 'none';
      el.setAttribute('data-job-filtered', 'true');
      el.setAttribute('data-filter-mode', 'hide');
    });
  }

  public override getCardListContainer(doc: Document = document): HTMLElement | null {
    // 1. 테이블 형태 목록(tbody) 우선 탐색
    const tbodyContainer = doc.querySelector<HTMLElement>(
      '.tplList.tplJobList table tbody, #dev-gi-list .tplJobList table tbody, .tplList table tbody'
    );
    if (tbodyContainer) return tbodyContainer;

    // 2. 일반 리스트 컨테이너 탐색
    const container = doc.querySelector<HTMLElement>(JOBKOREA_SELECTORS.LIST_CONTAINER);
    if (container) return container;

    // 3. 첫 번째 카드 부모 컨테이너 폴백
    const firstCard = doc.querySelector<HTMLElement>(JOBKOREA_SELECTORS.JOB_CARDS);
    return firstCard?.parentElement || null;
  }

  public override getPaginationElement(doc: Document = document): HTMLElement | null {
    return doc.querySelector<HTMLElement>(JOBKOREA_SELECTORS.PAGINATION);
  }

  /**
   * 잡코리아 채용목록(/recruit/joblist)의 경우 공식 POST 엔드포인트를 통한 다음 페이지 요청 생성
   */
  public override getNextPageRequest(
    _doc: Document = document,
    currentPage: number
  ): { url: string; options?: RequestInit } | null {
    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    const isJobList = currentUrl.includes(JOBKOREA_CONFIG.JOBLIST_PATH);

    if (!isJobList) {
      return null;
    }

    const nextPage = currentPage + 1;
    const params = new URLSearchParams();
    params.set(JOBKOREA_CONFIG.BODY_PARAMS.PAGE, String(nextPage));
    params.set(JOBKOREA_CONFIG.BODY_PARAMS.PAGE_SIZE, JOBKOREA_CONFIG.DEFAULT_PAGE_SIZE);
    params.set(JOBKOREA_CONFIG.BODY_PARAMS.ORDER, JOBKOREA_CONFIG.DEFAULT_ORDER);
    params.set(JOBKOREA_CONFIG.BODY_PARAMS.TAB_INDEX, JOBKOREA_CONFIG.DEFAULT_TAB_INDEX);

    return {
      url: JOBKOREA_CONFIG.PAGING_ENDPOINT,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: params.toString(),
      },
    };
  }

  public override getNextPageUrl(doc: Document = document, currentPage: number): string | null {
    const nextPage = currentPage + 1;
    const pageLink =
      doc.querySelector<HTMLAnchorElement>(
        `a[data-page="${nextPage}"], a[href*="Page=${nextPage}"], a[href*="page=${nextPage}"]`
      ) ||
      doc.querySelector<HTMLAnchorElement>('.tplPagination .btnPgnNext, .pagination .next');

    if (pageLink?.href && !pageLink.href.includes('javascript:')) {
      return pageLink.href;
    }

    try {
      const currentUrl = new URL(typeof window !== 'undefined' ? window.location.href : 'https://www.jobkorea.co.kr');
      currentUrl.searchParams.set('Page', String(nextPage));
      return currentUrl.toString();
    } catch {
      return null;
    }
  }

  public parseCard(element: HTMLElement): JobCardInfo | null {
    // 1. 회사명 추출
    const companyEl = element.querySelector<HTMLElement>(JOBKOREA_SELECTORS.COMPANY_NAME);

    // 2. 공고 제목 추출
    const titleEl = element.querySelector<HTMLElement>(JOBKOREA_SELECTORS.POSITION_TITLE);

    const companyName = companyEl?.textContent?.trim() || '';
    const title = titleEl?.textContent?.trim() || '';

    if (!companyName && !title) {
      return null;
    }

    // 3. 광고 판별 (스페셜 공고, 상단 추천 공고, 파견/대행, 헤드헌팅 등)
    const isAd = Boolean(
      element.classList.contains('job-recommendation-item') ||
      element.closest(JOBKOREA_SELECTORS.PROMOTION_BANNERS) ||
      JOBKOREA_SELECTORS.AD_CLASS.split(',').some((cls) => element.classList.contains(cls.trim())) ||
      element.querySelector(JOBKOREA_SELECTORS.AD_BADGE) ||
      element.getAttribute('data-is-ad') === 'true'
    );

    // 4. 공고 고유 식별자(Job ID) 추출
    let gno =
      element.getAttribute('data-gno') ||
      element.getAttribute('data-info')?.trim().split('|')[0] ||
      element.querySelector<HTMLElement>('[data-gno]')?.getAttribute('data-gno');

    if (!gno) {
      const link = element.querySelector<HTMLAnchorElement>('a[href*="/GI_Read/"]');
      const match = link?.href?.match(/\/GI_Read\/(\d+)/);
      if (match) gno = match[1];
    }

    // 5. 마감일자 텍스트 추출 (예: "~ 11/22(일)", "D-30", "상시채용" 등)
    const dateEl = element.querySelector<HTMLElement>(JOBKOREA_SELECTORS.CLOSING_DATE);
    const closingDate = dateEl?.textContent?.trim() || undefined;

    return {
      cardElement: element,
      companyName,
      title,
      isAd,
      jobId: gno || undefined,
      closingDate,
    };
  }

  public getCompanyElement(cardElement: HTMLElement): HTMLElement | null {
    return cardElement.querySelector<HTMLElement>(JOBKOREA_SELECTORS.COMPANY_NAME);
  }

  /**
   * 테이블 행(tr)의 경우 HTML 레이아웃을 보존하기 위해 제목 열(.titBx)을 버튼 호스트로 지정하고,
   * 차단/숨김 시 테이블 행(tr) 전체가 즉각 숨겨지도록 보장
   */
  public override injectInlineButton(
    cardInfo: JobCardInfo,
    actions: BlockActions | ((companyName: string) => void)
  ): void {
    const rawCard = cardInfo.cardElement;
    if (!rawCard) return;

    if (rawCard.tagName.toUpperCase() === 'TR') {
      const hostContainer = rawCard.querySelector<HTMLElement>(
        JOBKOREA_SELECTORS.BUTTON_HOST_CELL
      );
      if (hostContainer && !rawCard.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.CONTAINER}`)) {
        hostContainer.style.position = 'relative';
        const titCell = rawCard.querySelector<HTMLElement>('td.tplTit');
        if (titCell) {
          titCell.style.position = 'relative';
        }
        rawCard.classList.add(INLINE_BUTTON_CONFIG.CLASSES.CARD_HOST);

        const onBlockCompany = typeof actions === 'function' ? actions : actions.onBlockCompany;
        const onBlockJob = typeof actions === 'object' ? actions.onBlockJob : undefined;

        super.injectInlineButton(
          { ...cardInfo, cardElement: hostContainer },
          {
            onBlockCompany: (compName) => {
              rawCard.style.setProperty('display', 'none', 'important');
              rawCard.setAttribute('data-job-filtered', 'true');
              rawCard.setAttribute('data-filter-mode', 'hide');
              onBlockCompany?.(compName);
            },
            onBlockJob: (info) => {
              rawCard.style.setProperty('display', 'none', 'important');
              rawCard.setAttribute('data-job-filtered', 'true');
              rawCard.setAttribute('data-filter-mode', 'hide');
              onBlockJob?.({ ...info, cardElement: rawCard });
            },
          }
        );
        return;
      }


    }

    super.injectInlineButton(cardInfo, actions);
  }
}
