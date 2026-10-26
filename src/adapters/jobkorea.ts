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

  public override isDetailPage(
    url: string = typeof window !== 'undefined' ? window.location.href : ''
  ): boolean {
    return url.toLowerCase().includes(JOBKOREA_CONFIG.DETAIL_PATH_LOWER);
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

    // 상세 페이지 컨테이너 탐색
    const detailContainers = Array.from(
      container.querySelectorAll<HTMLElement>(JOBKOREA_SELECTORS.DETAIL_CONTAINER)
    ).filter((el) => {
      const parentDetail = el.parentElement?.closest<HTMLElement>(
        JOBKOREA_SELECTORS.DETAIL_CONTAINER
      );
      if (parentDetail) return false;

      if (el.tagName.toUpperCase() === 'MAIN') {
        return Boolean(
          el.querySelector(JOBKOREA_SELECTORS.DETAIL_COMPANY_NAME) ||
          el.querySelector(JOBKOREA_SELECTORS.DETAIL_POSITION_TITLE) ||
          el.querySelector(JOBKOREA_SELECTORS.DETAIL_HEADER)
        );
      }
      return true;
    });

    // 하단 추천 공고 카드 탐색
    const recommendCards = Array.from(
      container.querySelectorAll<HTMLElement>(JOBKOREA_SELECTORS.DETAIL_RECOMMEND_CARDS)
    );

    return Array.from(new Set([...validElements, ...detailContainers, ...recommendCards]));
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
    const isDetail = this.isDetailPage();

    // 1. 회사명 추출
    let companyEl = isDetail
      ? element.querySelector<HTMLElement>(JOBKOREA_SELECTORS.DETAIL_COMPANY_NAME) ||
        element.querySelector<HTMLElement>(JOBKOREA_SELECTORS.COMPANY_NAME)
      : element.querySelector<HTMLElement>(JOBKOREA_SELECTORS.COMPANY_NAME) ||
        element.querySelector<HTMLElement>(JOBKOREA_SELECTORS.DETAIL_COMPANY_NAME);

    if (
      companyEl?.textContent?.trim() === '기업정보 더보기' ||
      companyEl?.textContent?.trim() === '기업정보'
    ) {
      const alt = element.querySelector<HTMLElement>(
        '[data-sentry-component="CompanyName"] h2, [data-sentry-component="CompanyName"] a, a[href*="/Recruit/Co_Read/"] h2'
      );
      if (alt) companyEl = alt;
    }

    // 2. 공고 제목 추출
    const titleEl = isDetail
      ? element.querySelector<HTMLElement>(JOBKOREA_SELECTORS.DETAIL_POSITION_TITLE) ||
        element.querySelector<HTMLElement>(JOBKOREA_SELECTORS.POSITION_TITLE)
      : element.querySelector<HTMLElement>(JOBKOREA_SELECTORS.POSITION_TITLE) ||
        element.querySelector<HTMLElement>(JOBKOREA_SELECTORS.DETAIL_POSITION_TITLE);

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
      const match = link?.href?.match(/\/GI_Read\/(\d+)/i);
      if (match) gno = match[1];
    }

    if (!gno && typeof window !== 'undefined' && window.location.href.toLowerCase().includes(JOBKOREA_CONFIG.DETAIL_PATH_LOWER)) {
      const match = window.location.href.match(/\/GI_Read\/(\d+)/i);
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
    const isDetail = this.isDetailPage();
    let el = isDetail
      ? cardElement.querySelector<HTMLElement>(JOBKOREA_SELECTORS.DETAIL_COMPANY_NAME) ||
        cardElement.querySelector<HTMLElement>(JOBKOREA_SELECTORS.COMPANY_NAME)
      : cardElement.querySelector<HTMLElement>(JOBKOREA_SELECTORS.COMPANY_NAME) ||
        cardElement.querySelector<HTMLElement>(JOBKOREA_SELECTORS.DETAIL_COMPANY_NAME);

    if (
      el?.textContent?.trim() === '기업정보 더보기' ||
      el?.textContent?.trim() === '기업정보'
    ) {
      const alt = cardElement.querySelector<HTMLElement>(
        '[data-sentry-component="CompanyName"] h2, [data-sentry-component="CompanyName"] a, a[href*="/Recruit/Co_Read/"] h2'
      );
      if (alt) el = alt;
    }

    return el;
  }

  /**
   * 평점 뱃지 래퍼가 주입될 앵커 요소 반환:
   * 회사명 바로 옆에 찜하기(하트) 버튼이 존재하면 하트 버튼 뒤에 래퍼를 주입하여 하트와 회사명의 겹침을 방지하고,
   * 상세 페이지에서 회사명이 a 태그 내부(h2)일 경우 a 태그 뒤에 주입하여 a 태그 중첩을 방지
   */
  public override getRatingBadgeAnchorElement(cardElement: HTMLElement): HTMLElement | null {
    const companyEl = this.getCompanyElement(cardElement);
    if (!companyEl) return null;

    // 상세 페이지에서 회사명이 a > h2 구조인 경우 a 태그 뒤에 평점 래퍼를 주입하여 <a> 중첩 방지
    const companyLink =
      companyEl.tagName.toUpperCase() === 'A'
        ? companyEl
        : companyEl.closest<HTMLAnchorElement>(
            'a[href*="/Recruit/Co_Read/"], a[href*="/Company/"], [data-sentry-component="CompanyName"] a'
          );

    const targetEl = companyLink || companyEl;

    const favBtn = cardElement.querySelector<HTMLElement>(JOBKOREA_SELECTORS.FAVORITE_BUTTON);
    if (favBtn && targetEl.parentElement?.contains(favBtn)) {
      return favBtn;
    }

    return targetEl;
  }

  /**
   * 테이블 행(tr)의 경우 제목 열(.titBx)을 버튼 호스트로 지정하고,
   * 상세 페이지의 경우 타이틀 헤더 및 액션 버튼 영역(#menu-buttons)에 툴바를 주입
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

    // 상세 페이지인 경우: 타이틀 헤더 및 메뉴 버튼(#menu-buttons)에 툴바 배치
    const header =
      (rawCard.matches?.(JOBKOREA_SELECTORS.DETAIL_HEADER)
        ? rawCard
        : rawCard.querySelector<HTMLElement>(JOBKOREA_SELECTORS.DETAIL_HEADER)) || null;

    if (header) {
      const menuButtons = header.querySelector<HTMLElement>(
        JOBKOREA_SELECTORS.DETAIL_MENU_BUTTONS
      );
      const targetContainer =
        menuButtons ||
        header.querySelector<HTMLElement>(JOBKOREA_SELECTORS.DETAIL_TITLE_INNER) ||
        header;

      super.injectInlineButton(cardInfo, actions, targetContainer);

      if (menuButtons) {
        const actionGroup = menuButtons.querySelector<HTMLElement>(
          `.${INLINE_BUTTON_CONFIG.CLASSES.CONTAINER}`
        );
        if (actionGroup && menuButtons.firstChild !== actionGroup) {
          menuButtons.insertBefore(actionGroup, menuButtons.firstChild);
        }
      }
      return;
    }

    super.injectInlineButton(cardInfo, actions);
  }
}
