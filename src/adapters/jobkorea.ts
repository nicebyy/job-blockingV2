import { JobCardInfo } from '../types';
import { BaseSiteAdapter } from './base';
import { SITE_DOMAINS, JOBKOREA_SELECTORS } from '../constants';

export class JobKoreaAdapter extends BaseSiteAdapter {
  readonly name = 'JobKorea';
  override readonly supportsInfiniteScroll = true;

  public matches(url: string): boolean {
    return url.includes(SITE_DOMAINS.JOBKOREA);
  }

  public getJobCardElements(container: Document | HTMLElement = document): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(JOBKOREA_SELECTORS.JOB_CARDS)
    );
  }

  public override getCardListContainer(doc: Document = document): HTMLElement | null {
    const container = doc.querySelector<HTMLElement>(JOBKOREA_SELECTORS.LIST_CONTAINER);
    if (container) return container;
    const firstCard = doc.querySelector<HTMLElement>(JOBKOREA_SELECTORS.JOB_CARDS);
    return firstCard?.parentElement || null;
  }

  public override getPaginationElement(doc: Document = document): HTMLElement | null {
    return doc.querySelector<HTMLElement>(JOBKOREA_SELECTORS.PAGINATION);
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

    // 3. 광고 판별 (스페셜 공고, 파견/대행, 헤드헌팅 등)
    const isAd = Boolean(
      element.classList.contains(JOBKOREA_SELECTORS.AD_CLASS) ||
      element.querySelector(JOBKOREA_SELECTORS.AD_BADGE) ||
      element.getAttribute('data-is-ad') === 'true'
    );

    const gno = element.getAttribute('data-gno') || element.getAttribute('data-info');

    return {
      cardElement: element,
      companyName,
      title,
      isAd,
      jobId: gno || undefined,
    };
  }
}
