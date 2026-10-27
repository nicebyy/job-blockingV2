import { JobCardInfo } from '../types';
import { BaseSiteAdapter } from './base';
import { SITE_DOMAINS, SARAMIN_SELECTORS } from '../constants';


export class SaraminAdapter extends BaseSiteAdapter {
  readonly name = 'Saramin';
  override readonly supportsInfiniteScroll = true;

  public matches(url: string): boolean {
    return url.includes(SITE_DOMAINS.SARAMIN) && !url.includes('jumpit.');
  }

  /**
   * 단일 공고 상세페이지 여부.
   *
   * 사람인 상세페이지는 canonical URL 기준 `/zf_user/jobs/view?rec_idx=NNNN` 형태이며,
   * 릴레이 뷰(`/jobs/relay/view`)도 단일 공고 화면이다.
   * 목록/검색 페이지(`/zf_user/search/recruit`, `/zf_user/jobs/list/*`)는 제외한다.
   */
  public override isDetailPage(
    url: string = typeof window !== 'undefined' ? window.location.href : ''
  ): boolean {
    if (!url) return false;

    // 목록/검색 페이지는 상세가 아님 (rec_idx 파라미터가 붙어 있어도 목록일 수 있으므로 우선 배제)
    if (/\/(search|list)\//.test(url) || /\/zf_user\/jobs\/list/.test(url)) {
      return false;
    }

    return SARAMIN_SELECTORS.DETAIL_URL_PATTERNS.some((pattern) => url.includes(pattern));
  }

  public getJobCardElements(container: Document | HTMLElement = document): HTMLElement[] {
    const listCards = Array.from(
      container.querySelectorAll<HTMLElement>(SARAMIN_SELECTORS.JOB_CARDS)
    );
    const detailRelayViews = Array.from(
      container.querySelectorAll<HTMLElement>(SARAMIN_SELECTORS.DETAIL_RELAY_CONTAINERS)
    ).filter((el) => {
      if (el.classList.contains('wrap_jview')) return false;
      // 상위 부모 중에 이미 다른 detailRelayViews 후보(.jview 등)가 있다면 자식 컨테이너(.wrap_jv_cont 등)는 제외
      const parentRelay = el.parentElement?.closest<HTMLElement>(
        SARAMIN_SELECTORS.DETAIL_RELAY_CONTAINERS
      );
      if (parentRelay && !parentRelay.classList.contains('wrap_jview')) {
        return false;
      }
      return true;
    });
    const recommendCards = Array.from(
      container.querySelectorAll<HTMLElement>(SARAMIN_SELECTORS.DETAIL_RECOMMEND_CARDS)
    );

    const all = new Set([...listCards, ...detailRelayViews, ...recommendCards]);
    return Array.from(all);
  }


  /**
   * AI 검색 배너, 개인 맞춤 추천 공고 섹션, 메인 홈 유료 광고 상품(플래티넘/프라임/스페셜 등) 및 프로모션 배너 숨김
   */
  public override hidePromotionBanners(container: Document | HTMLElement = document): number {
    const rawBanners = Array.from(
      container.querySelectorAll<HTMLElement>(SARAMIN_SELECTORS.PROMOTION_BANNERS)
    );

    // 공정위 상품안내 고지 기반 배너 버튼([aria-label*="상품안내"], .btn_product) 상위 컨테이너 추가 탐색 (미래 개편 대응)
    const productGuideBtns = Array.from(
      container.querySelectorAll<HTMLElement>(
        '.btn_product, [aria-label*="상품안내"], [aria-label*="상품 안내"]'
      )
    );
    for (const btn of productGuideBtns) {
      const adSection =
        btn.closest<HTMLElement>(
          '#section_banner, .main_product, .cont_product, .wrap_list_banner, .top_poduct, section'
        ) || btn.parentElement;
      if (adSection && !rawBanners.includes(adSection)) {
        rawBanners.push(adSection);
      }
    }

    const topLevelBanners = rawBanners.filter(
      (el) => !rawBanners.some((parent) => parent !== el && parent.contains(el))
    );

    // [안전장치] 검색 필터/폼 영역은 절대 숨기지 않는다.
    //
    // 과거 PROMOTION_BANNERS 에 .wrap_section_contents 를 넣었다가
    // 지역·직업·검색어·상세조건 필터 패널 전체(input 216개)가 display:none 되어
    // 사용자가 검색 조건을 조작할 수 없게 되는 회귀가 있었다.
    // 셀렉터가 다시 잘못 추가되더라도 이 가드가 2차 방어선이 된다.
    const isProtectedFilterArea = (el: HTMLElement): boolean => {
      // 자기 자신이 보호 대상이거나, 보호 대상 내부에 있으면 건너뛴다
      if (el.closest(SARAMIN_SELECTORS.PROTECTED_FILTER_AREAS)) return true;
      // 검색 폼 컨트롤을 다수 포함하는 컨테이너도 필터 영역으로 간주한다
      const formControls = el.querySelectorAll('input, select, textarea').length;
      return formControls >= 3;
    };

    let count = 0;
    topLevelBanners.forEach((el) => {
      if (isProtectedFilterArea(el)) {
        console.warn(
          '[JobFilter] 필터/검색 영역으로 판단되어 광고 숨김에서 제외합니다:',
          el.className
        );
        return;
      }
      el.style.display = 'none';
      el.setAttribute('data-job-filtered', 'true');
      el.setAttribute('data-filter-mode', 'hide');
      el.setAttribute('data-blocked-type', 'ad');
      count++;
    });
    return count;
  }

  public override getCardListContainer(doc: Document | HTMLElement = document): HTMLElement | null {
    const container = doc.querySelector<HTMLElement>(SARAMIN_SELECTORS.LIST_CONTAINER);
    if (container) {
      if (
        container.classList.contains('list_product') ||
        container.classList.contains('wrap_list_banner') ||
        container.classList.contains('banner_list') ||
        // 광고/추천 영역은 절대 공고 목록 컨테이너가 될 수 없다
        Boolean(container.closest(SARAMIN_SELECTORS.NON_LIST_REGIONS))
      ) {
        return null;
      }
      const innerContent = container.querySelector<HTMLElement>('.content');
      if (innerContent) return innerContent;
      const innerBody = container.querySelector<HTMLElement>('.list_body');
      if (innerBody) return innerBody;
      return container;
    }
    const firstCard = doc.querySelector<HTMLElement>(
      '.item_recruit, .list_item, .recruit_list .row'
    );
    if (
      firstCard &&
      !firstCard.closest('.list_product, .wrap_list_banner, .banner_list')
    ) {
      // [중요] 사람인 직업별/지역별 목록의 초기 HTML 에는 실제 공고 목록이 아직 없고
      // 네이버 파워링크 광고 블록(#powerLink) 안의 <li class="list_item"> 만 존재한다.
      // 이때 firstCard.parentElement 를 그대로 반환하면 광고 <ul> 이 공고 목록 컨테이너로
      // 오인되어, 무한 스크롤이 광고 영역에 공고를 append 하는 심각한 오염이 발생한다.
      const adRegion = firstCard.closest<HTMLElement>(SARAMIN_SELECTORS.NON_LIST_REGIONS);
      if (adRegion) {
        return null;
      }
      const listBody = firstCard.closest<HTMLElement>('.list_body');
      if (listBody) return listBody;
      return firstCard.parentElement;
    }
    return null;
  }

  public override getPaginationElement(doc: Document | HTMLElement = document): HTMLElement | null {
    return doc.querySelector<HTMLElement>(SARAMIN_SELECTORS.PAGINATION);
  }

  /**
   * 현재 화면이 실제로 몇 페이지인지 DOM/URL 에서 읽는다.
   *
   * 사용자가 `?page=11` / `?recruitPage=11` 처럼 페이지가 지정된 URL 로 바로 진입한 경우,
   * 무한 스크롤이 1페이지부터 다시 받아오면 중복 공고만 쌓이고 목록이 이어지지 않는다.
   */
  public override getCurrentPageNumber(
    doc: Document | HTMLElement = document
  ): number | null {
    const fromDom = this.readActivePageNumber(doc);
    if (fromDom !== null) return fromDom;
    return this.readPageNumberFromUrl(this.getLocationHref());
  }

  /** 활성(현재) 페이지 마커의 텍스트/속성에서 페이지 번호를 읽는다 */
  private readActivePageNumber(doc: Document | HTMLElement): number | null {
    const activeEl = doc.querySelector<HTMLElement>(SARAMIN_SELECTORS.ACTIVE_PAGE);
    if (!activeEl) return null;

    const candidates = [
      activeEl.getAttribute('page'),
      activeEl.getAttribute('data-page'),
      activeEl.textContent,
    ];
    for (const candidate of candidates) {
      const matched = candidate?.match(/\d+/);
      if (!matched) continue;
      const page = Number(matched[0]);
      if (Number.isFinite(page) && page > 0) return page;
    }
    return null;
  }

  /** URL 의 page / recruitPage 쿼리에서 페이지 번호를 읽는다 */
  private readPageNumberFromUrl(url: string): number | null {
    if (!url) return null;
    try {
      const parsed = new URL(url, 'https://www.saramin.co.kr');
      for (const key of SARAMIN_SELECTORS.PAGE_QUERY_PARAMS) {
        const raw = parsed.searchParams.get(key);
        if (raw === null) continue;
        const page = Number(raw);
        if (Number.isFinite(page) && page > 0) return page;
      }
    } catch {
      return null;
    }
    return null;
  }

  /** 현재 브라우저 위치(테스트 환경에서는 폴백) */
  private getLocationHref(): string {
    return typeof window !== 'undefined' && window.location?.href
      ? window.location.href
      : 'https://www.saramin.co.kr/zf_user/jobs/list';
  }

  /**
   * 페이지네이션 링크(onclick / href)에서 실제 이동 URL 을 해석한다.
   * onclick 의 `location.href = '...'` 를 우선 사용하고, 이동 URL 이 없는 `#hash` 전용 href 는 무시한다.
   */
  private resolvePaginationLinkUrl(
    pageLink: HTMLAnchorElement | HTMLButtonElement | null,
    baseUrl: string
  ): string | null {
    if (!pageLink) return null;

    const rawOnClick = pageLink.getAttribute('onclick');
    if (rawOnClick) {
      const match = rawOnClick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
      if (match) {
        let cleanUrl = match[1].replace(/&amp;/g, '&');
        const hashIdx = cleanUrl.indexOf('#');
        if (hashIdx !== -1) cleanUrl = cleanUrl.slice(0, hashIdx);
        try {
          return new URL(cleanUrl, baseUrl).toString();
        } catch {
          return cleanUrl;
        }
      }
    }

    const rawHref = pageLink.getAttribute('href');
    if (
      rawHref &&
      !rawHref.startsWith('#') &&
      !rawHref.includes('javascript:') &&
      // a[href*="page=N"] 은 "page_count=N" 도 매칭하므로 쿼리 파라미터 형태를 명시적으로 확인한다
      /[?&](page|recruitPage)=\d+/.test(rawHref)
    ) {
      const cleanHref = rawHref.replace(/&amp;/g, '&').split('#')[0];
      try {
        return new URL(cleanHref, baseUrl).toString();
      } catch {
        return (pageLink as HTMLAnchorElement).href || cleanHref;
      }
    }

    return null;
  }

  /**
   * 현재 URL 의 쿼리를 유지한 채 다음 페이지 URL 을 만든다.
   * 사람인 검색 목록은 recruitPage, 그 외 목록(직업별/지역별/산업별)은 page 를 사용한다.
   */
  private buildNextPageUrl(nextPage: number, doc: Document | HTMLElement): string | null {
    try {
      const currentUrl = new URL(this.getLocationHref());
      // 해시(#recruit_info, #searchTitle 등) 제거
      currentUrl.hash = '';

      const isSearchPage =
        currentUrl.pathname.includes('/search') ||
        currentUrl.searchParams.has('recruitPage') ||
        currentUrl.searchParams.has('searchword') ||
        Boolean(
          doc.querySelector('#recruit_info, #recruit_info_list, a[href*="#recruit_info"]')
        );

      if (isSearchPage) {
        // 반대편 파라미터가 남아 있으면 서버가 무시/혼동할 수 있으므로 제거한다
        currentUrl.searchParams.delete('page');
        currentUrl.searchParams.set('recruitPage', String(nextPage));
      } else {
        currentUrl.searchParams.delete('recruitPage');
        currentUrl.searchParams.set('page', String(nextPage));
      }
      return currentUrl.toString();
    } catch {
      return null;
    }
  }

  /**
   * 다음 페이지 URL 계산.
   *
   * [중요] 사람인 목록의 페이지 번호 블록은 10개 단위로 끊겨 있고, "다음" 버튼은
   * "다음 블록의 첫 페이지"를 가리킨다. 예를 들어 1페이지 DOM 의 "다음" 버튼은
   * 언제나 `page=11` 이므로, 그 URL 을 그대로 사용하면 11페이지 이후로는 계속
   * 11페이지를 받아오게 되고(중복 판정) 무한 스크롤이 조용히 멈춘다.
   * 따라서 링크가 가리키는 페이지 번호가 실제로 찾는 페이지(nextPage)와 일치할 때만
   * 링크를 신뢰하고, 그렇지 않으면 현재 URL 의 쿼리를 유지한 채 페이지 번호를 직접 갱신한다.
   */
  public override getNextPageUrl(
    doc: Document | HTMLElement = document,
    currentPage: number
  ): string | null {
    const nextPage = currentPage + 1;

    // 1. DOM 내부의 페이지네이션 a 또는 button 태그 우선 탐색 (page 속성, onclick, href, .BtnNext 등)
    const pageLink =
      doc.querySelector<HTMLAnchorElement | HTMLButtonElement>(
        `a[page="${nextPage}"], a[href*="page=${nextPage}"], a[href*="recruitPage=${nextPage}"], button[page="${nextPage}"], button[onclick*="page=${nextPage}"], a[onclick*="page=${nextPage}"]`
      ) ||
      doc.querySelector<HTMLAnchorElement | HTMLButtonElement>(
        '.pagination .next, .page_box .btn_next, .PageBox .BtnType.next, .PageBox button.next, .PageBox .BtnNext, .PageBox button.BtnNext, .BtnNext'
      );

    const baseUrl = this.getLocationHref();
    const linkedUrl = this.resolvePaginationLinkUrl(pageLink, baseUrl);

    // 링크가 실제로 "다음 페이지"를 가리키는 경우에만 그대로 사용한다
    if (linkedUrl) {
      const linkedPage = this.readPageNumberFromUrl(linkedUrl);
      if (linkedPage === nextPage) {
        return linkedUrl;
      }
    }

    // 페이지네이션 요소가 없는 페이지에서는 URL fallback을 수행하지 않음 (정적/단일 페이지 보호)
    if (!this.getPaginationElement(doc)) {
      return null;
    }

    // 2. 현재 URL 기준 query parameter 갱신 (링크가 stale 한 경우 및 링크가 없는 마지막 페이지)
    return this.buildNextPageUrl(nextPage, doc);
  }

  public parseCard(element: HTMLElement): JobCardInfo | null {
    const isListCard =
      element.classList.contains('item_recruit') ||
      element.classList.contains('list_item') ||
      element.classList.contains('item') ||
      Boolean(element.querySelector('.area_corp, .corp_name, .company_nm, .corp'));

    // 1. 회사명 추출 (리스트 카드 우선 탐색 또는 상세 헤더 우선 탐색)
    let companyEl = isListCard
      ? element.querySelector<HTMLElement>(SARAMIN_SELECTORS.COMPANY_NAME) ||
        element.querySelector<HTMLElement>(SARAMIN_SELECTORS.DETAIL_COMPANY_NAME)
      : element.querySelector<HTMLElement>(SARAMIN_SELECTORS.DETAIL_COMPANY_NAME) ||
        element.querySelector<HTMLElement>(SARAMIN_SELECTORS.COMPANY_NAME);

    // '기업정보' 팝업 버튼 링크가 잡힌 경우 실제 상호명 링크로 보정
    if (
      companyEl?.textContent?.trim() === '기업정보' ||
      companyEl?.classList.contains('company_popup')
    ) {
      companyEl =
        element.querySelector<HTMLElement>(
          '.area_corp .corp_name a, .corp_name a, .area_corp .corp_name, .corp_name, .col.company_nm a, .company_nm a'
        ) || companyEl;
    }

    // 2. 공고 제목 추출
    const titleEl = isListCard
      ? element.querySelector<HTMLElement>(SARAMIN_SELECTORS.POSITION_TITLE) ||
        element.querySelector<HTMLElement>(SARAMIN_SELECTORS.DETAIL_POSITION_TITLE)
      : element.querySelector<HTMLElement>(SARAMIN_SELECTORS.DETAIL_POSITION_TITLE) ||
        element.querySelector<HTMLElement>(SARAMIN_SELECTORS.POSITION_TITLE);

    let companyName = companyEl?.textContent?.trim() || '';
    if (companyName === '기업정보') {
      companyName = '';
    }
    const title = titleEl?.textContent?.trim() || '';

    if (!companyName && !title) {
      return null;
    }


    // 3. 광고 판별 (상시, 추천, 플러스 광고 등)
    const isAd = Boolean(
      element.classList.contains(SARAMIN_SELECTORS.AD_CLASS) ||
      element.querySelector(SARAMIN_SELECTORS.AD_BADGE) ||
      element.getAttribute('data-is-ad') === 'true'
    );

    // 4. Job ID 추출 (data-rec-idx, data-rec_idx, className regex, id regex, 내부 버튼, 링크, URL fallback)
    let recruitId =
      element.getAttribute('data-rec-idx') ||
      element.getAttribute('data-rec_idx') ||
      element.getAttribute('value');

    // 릴레이 뷰 공고 컨테이너 클래스 매칭 (예: jview jview-0-55351925)
    if (!recruitId && element.className) {
      const classMatch = element.className.match(/jview-\d+-(\d+)/);
      if (classMatch) recruitId = classMatch[1];
    }

    // 내부 버튼 속성 확인 (스크랩/지원 버튼에 붙은 rec_idx)
    if (!recruitId) {
      const btn = element.querySelector<HTMLElement>('[rec_idx], [data-rec-idx]');
      recruitId = btn?.getAttribute('rec_idx') || btn?.getAttribute('data-rec-idx') || null;
    }

    if (!recruitId && element.id) {
      const match = element.id.match(/\d+/);
      if (match) recruitId = match[0];
    }

    if (!recruitId) {
      const link = element.querySelector<HTMLAnchorElement>('a[href*="rec_idx="]');
      const match = link?.href?.match(/rec_idx=(\d+)/);
      if (match) recruitId = match[1];
    }

    // URL fallback (릴레이 뷰의 개별 공고는 각자 고유 ID가 있으므로 URL fallback은 일반 상세 뷰일 때만 사용)
    if (!recruitId && typeof window !== 'undefined' && window.location.href.includes('rec_idx=')) {
      const match = window.location.href.match(/rec_idx=(\d+)/);
      if (match) recruitId = match[1];
    }

    // 5. 마감일자 텍스트 추출 (예: "~ 11/07(토)", "D-3", "상시채용" 등)
    const dateEl = element.querySelector<HTMLElement>(SARAMIN_SELECTORS.CLOSING_DATE);
    const closingDate = dateEl?.textContent?.trim() || undefined;

    return {
      cardElement: element,
      companyName,
      title,
      isAd,
      jobId: recruitId || undefined,
      closingDate,
    };
  }

  public override injectInlineButton(
    cardInfo: JobCardInfo,
    actions: import('./base').BlockActions | ((companyName: string) => void)
  ): void {
    const header =
      (cardInfo.cardElement.matches?.(SARAMIN_SELECTORS.DETAIL_HEADER)
        ? cardInfo.cardElement
        : cardInfo.cardElement.querySelector<HTMLElement>(SARAMIN_SELECTORS.DETAIL_HEADER)) || null;

    if (header) {
      const titleInner = header.querySelector<HTMLElement>(SARAMIN_SELECTORS.DETAIL_TITLE_INNER) || header;
      super.injectInlineButton(cardInfo, actions, titleInner);
      return;
    }
    super.injectInlineButton(cardInfo, actions);
  }


  public getCompanyElement(cardElement: HTMLElement): HTMLElement | null {
    const isListCard =
      cardElement.classList.contains('item_recruit') ||
      cardElement.classList.contains('list_item') ||
      cardElement.classList.contains('item') ||
      Boolean(cardElement.querySelector('.area_corp, .corp_name, .company_nm, .corp'));

    let el = isListCard
      ? cardElement.querySelector<HTMLElement>(SARAMIN_SELECTORS.COMPANY_NAME) ||
        cardElement.querySelector<HTMLElement>(SARAMIN_SELECTORS.DETAIL_COMPANY_NAME)
      : cardElement.querySelector<HTMLElement>(SARAMIN_SELECTORS.DETAIL_COMPANY_NAME) ||
        cardElement.querySelector<HTMLElement>(SARAMIN_SELECTORS.COMPANY_NAME);

    if (el?.textContent?.trim() === '기업정보' || el?.classList.contains('company_popup')) {
      el =
        cardElement.querySelector<HTMLElement>(
          '.area_corp .corp_name a, .area_corp .corp_name, strong.corp_name a, strong.corp_name, .corp_name a, .corp_name, .col.company_nm a, .company_nm a'
        ) || el;
    }

    return el;
  }

}


