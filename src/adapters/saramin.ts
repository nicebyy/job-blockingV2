import { JobCardInfo } from '../types';
import { BaseSiteAdapter } from './base';
import { SITE_DOMAINS, SARAMIN_SELECTORS } from '../constants';


export class SaraminAdapter extends BaseSiteAdapter {
  readonly name = 'Saramin';
  override readonly supportsInfiniteScroll = true;

  public matches(url: string): boolean {
    return url.includes(SITE_DOMAINS.SARAMIN);
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
   * AI 검색 배너, 개인 맞춤 추천 공고 섹션, 스토어 프로모션 배너 등 불필요한 마케팅/추천 요소 숨김
   */
  public override hidePromotionBanners(container: Document | HTMLElement = document): number {
    const rawBanners = Array.from(
      container.querySelectorAll<HTMLElement>(SARAMIN_SELECTORS.PROMOTION_BANNERS)
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

  public override getCardListContainer(doc: Document = document): HTMLElement | null {
    const container = doc.querySelector<HTMLElement>(SARAMIN_SELECTORS.LIST_CONTAINER);
    if (container) {
      const innerContent = container.querySelector<HTMLElement>('.content');
      if (innerContent) return innerContent;
      return container;
    }
    const firstCard = doc.querySelector<HTMLElement>(SARAMIN_SELECTORS.JOB_CARDS);
    return firstCard?.parentElement || null;
  }

  public override getPaginationElement(doc: Document = document): HTMLElement | null {
    return doc.querySelector<HTMLElement>(SARAMIN_SELECTORS.PAGINATION);
  }

  public override getNextPageUrl(doc: Document = document, currentPage: number): string | null {
    const nextPage = currentPage + 1;

    // 1. DOM 내부의 페이지네이션 a 태그 우선 탐색
    const pageLink =
      doc.querySelector<HTMLAnchorElement>(
        `a[page="${nextPage}"], a[href*="page=${nextPage}"], a[href*="recruitPage=${nextPage}"]`
      ) ||
      doc.querySelector<HTMLAnchorElement>('.pagination .next, .page_box .btn_next');

    // a 태그가 실제 이동 URL(page/recruitPage 쿼리가 포함되고 # 해시 전용이 아닌 URL)을 갖고 있는 경우 반환
    const rawHref = pageLink?.getAttribute('href');
    if (
      rawHref &&
      !rawHref.startsWith('#') &&
      !rawHref.includes('javascript:') &&
      (rawHref.includes('page=') || rawHref.includes('recruitPage='))
    ) {
      return pageLink!.href;
    }

    // 2. 현재 URL 기준 query parameter 갱신 (사람인 검색은 recruitPage, 일반 목록은 page 사용)
    try {
      const currentUrl = new URL(
        typeof window !== 'undefined' ? window.location.href : 'https://www.saramin.co.kr/zf_user/search/recruit'
      );
      // 해시(#recruit_info 등) 제거
      currentUrl.hash = '';

      const isSearchPage =
        currentUrl.pathname.includes('/search') ||
        currentUrl.searchParams.has('recruitPage') ||
        currentUrl.searchParams.has('searchword') ||
        Boolean(doc.querySelector('#recruit_info, #recruit_info_list, a[href*="#recruit_info"]'));

      if (isSearchPage) {
        currentUrl.searchParams.set('recruitPage', String(nextPage));
      } else {
        currentUrl.searchParams.set('page', String(nextPage));
      }
      return currentUrl.toString();
    } catch {
      return null;
    }
  }

  public parseCard(element: HTMLElement): JobCardInfo | null {
    const isListCard =
      element.classList.contains('item_recruit') ||
      Boolean(element.querySelector('.area_corp, .corp_name'));

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
          '.area_corp .corp_name a, .corp_name a, .area_corp .corp_name, .corp_name'
        ) || companyEl;
    }

    // 2. 공고 제목 추출
    const titleEl =
      element.querySelector<HTMLElement>(SARAMIN_SELECTORS.DETAIL_POSITION_TITLE) ||
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
      Boolean(cardElement.querySelector('.area_corp, .corp_name'));

    let el = isListCard
      ? cardElement.querySelector<HTMLElement>(SARAMIN_SELECTORS.COMPANY_NAME) ||
        cardElement.querySelector<HTMLElement>(SARAMIN_SELECTORS.DETAIL_COMPANY_NAME)
      : cardElement.querySelector<HTMLElement>(SARAMIN_SELECTORS.DETAIL_COMPANY_NAME) ||
        cardElement.querySelector<HTMLElement>(SARAMIN_SELECTORS.COMPANY_NAME);

    if (el?.textContent?.trim() === '기업정보' || el?.classList.contains('company_popup')) {
      el =
        cardElement.querySelector<HTMLElement>(
          '.area_corp .corp_name a, .area_corp .corp_name, strong.corp_name a, strong.corp_name, .corp_name a, .corp_name'
        ) || el;
    }

    return el;
  }

}


