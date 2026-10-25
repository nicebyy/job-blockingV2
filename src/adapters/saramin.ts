import { JobCardInfo } from '../types';
import { BaseSiteAdapter } from './base';
import { SITE_DOMAINS, SARAMIN_SELECTORS, INLINE_BUTTON_CONFIG } from '../constants';


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
    );
    const recommendCards = Array.from(
      container.querySelectorAll<HTMLElement>(SARAMIN_SELECTORS.DETAIL_RECOMMEND_CARDS)
    );

    const all = new Set([...listCards, ...detailRelayViews, ...recommendCards]);
    return Array.from(all);
  }

  public override getCardListContainer(doc: Document = document): HTMLElement | null {
    const container = doc.querySelector<HTMLElement>(SARAMIN_SELECTORS.LIST_CONTAINER);
    if (container) return container;
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

    if (pageLink?.href && !pageLink.href.includes('javascript:')) {
      return pageLink.href;
    }

    // 2. 현재 URL 기준 query parameter 증가 fallback
    try {
      const currentUrl = new URL(typeof window !== 'undefined' ? window.location.href : 'https://www.saramin.co.kr');
      currentUrl.searchParams.set('page', String(nextPage));
      return currentUrl.toString();
    } catch {
      return null;
    }
  }

  public parseCard(element: HTMLElement): JobCardInfo | null {
    // 1. 회사명 추출 (상세 헤더 또는 일반 카드)
    const companyEl =
      element.querySelector<HTMLElement>(SARAMIN_SELECTORS.DETAIL_COMPANY_NAME) ||
      element.querySelector<HTMLElement>(SARAMIN_SELECTORS.COMPANY_NAME);

    // 2. 공고 제목 추출
    const titleEl =
      element.querySelector<HTMLElement>(SARAMIN_SELECTORS.DETAIL_POSITION_TITLE) ||
      element.querySelector<HTMLElement>(SARAMIN_SELECTORS.POSITION_TITLE);

    const companyName = companyEl?.textContent?.trim() || '';
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

    // 4. Job ID 추출 (data-rec-idx, data-rec_idx, id regex, a[href*="rec_idx="], URL fallback)
    let recruitId =
      element.getAttribute('data-rec-idx') ||
      element.getAttribute('data-rec_idx') ||
      element.getAttribute('value');

    if (!recruitId && element.id) {
      const match = element.id.match(/\d+/);
      if (match) recruitId = match[0];
    }

    if (!recruitId) {
      const link = element.querySelector<HTMLAnchorElement>('a[href*="rec_idx="]');
      const match = link?.href?.match(/rec_idx=(\d+)/);
      if (match) recruitId = match[1];
    }

    if (!recruitId && typeof window !== 'undefined' && window.location.href.includes('rec_idx=')) {
      const match = window.location.href.match(/rec_idx=(\d+)/);
      if (match) recruitId = match[1];
    }

    return {
      cardElement: element,
      companyName,
      title,
      isAd,
      jobId: recruitId || undefined,
    };
  }

  public override injectInlineButton(
    cardInfo: JobCardInfo,
    actions: import('./base').BlockActions | ((companyName: string) => void)
  ): void {
    const header = cardInfo.cardElement.querySelector<HTMLElement>(SARAMIN_SELECTORS.DETAIL_HEADER);
    if (header && !cardInfo.cardElement.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.CONTAINER}`)) {
      header.style.position = 'relative';
      super.injectInlineButton({ ...cardInfo, cardElement: header }, actions);
      return;
    }
    super.injectInlineButton(cardInfo, actions);
  }
}

