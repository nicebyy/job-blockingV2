import { JobCardInfo } from '../types';

export interface SiteAdapter {
  readonly name: string;
  readonly supportsInfiniteScroll?: boolean;
  matches(url: string): boolean;
  getJobCardElements(container?: Document | HTMLElement): HTMLElement[];
  parseCard(element: HTMLElement): JobCardInfo | null;
  injectInlineButton(
    cardInfo: JobCardInfo,
    actions: BlockActions | ((companyName: string) => void)
  ): void;
  getNextPageUrl?(currentDoc: Document, currentPage: number): string | null;
  getCardListContainer?(currentDoc: Document): HTMLElement | null;
  getPaginationElement?(currentDoc: Document): HTMLElement | null;
}

export interface BlockActions {
  onBlockCompany: (companyName: string) => void;
  onBlockJob: (cardInfo: JobCardInfo) => void;
}

export abstract class BaseSiteAdapter implements SiteAdapter {
  abstract readonly name: string;
  readonly supportsInfiniteScroll: boolean = false;

  abstract matches(url: string): boolean;
  abstract getJobCardElements(container?: Document | HTMLElement): HTMLElement[];
  abstract parseCard(element: HTMLElement): JobCardInfo | null;

  public getNextPageUrl?(_currentDoc: Document, _currentPage: number): string | null {
    return null;
  }

  public getCardListContainer?(_currentDoc: Document): HTMLElement | null {
    return null;
  }

  public getPaginationElement?(_currentDoc: Document): HTMLElement | null {
    return null;
  }

  /**
   * 공고 카드에 [이 공고 숨기기] 및 [회사 차단] 듀얼 버튼 삽입
   */
  public injectInlineButton(
    cardInfo: JobCardInfo,
    actions: BlockActions | ((companyName: string) => void)
  ): void {
    if (!cardInfo.cardElement || !cardInfo.companyName) return;

    if (cardInfo.cardElement.querySelector('.job-filter-btn-group')) {
      return;
    }

    const onBlockCompany = typeof actions === 'function' ? actions : actions.onBlockCompany;
    const onBlockJob = typeof actions === 'object' ? actions.onBlockJob : undefined;

    const group = document.createElement('div');
    group.className = 'job-filter-btn-group';

    // 1. [이 공고만 숨기기] 버튼 (jobId 또는 공고 제목 단위)
    if (onBlockJob) {
      const hideJobBtn = document.createElement('button');
      hideJobBtn.className = 'job-filter-hide-btn job-filter-btn-job';
      hideJobBtn.type = 'button';
      hideJobBtn.title = '이 특정 공고만 숨기기 (같은 회사의 다른 공고는 유지)';
      hideJobBtn.innerHTML = `
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
        <span>공고숨김</span>
      `;
      hideJobBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onBlockJob(cardInfo);
      });
      group.appendChild(hideJobBtn);
    }

    // 2. [회사 전체 차단] 버튼
    const blockCompanyBtn = document.createElement('button');
    blockCompanyBtn.className = 'job-filter-hide-btn job-filter-btn-company';
    blockCompanyBtn.type = 'button';
    blockCompanyBtn.title = `'${cardInfo.companyName}' 기업의 모든 공고 영구 차단`;
    blockCompanyBtn.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
      <span>회사차단</span>
    `;
    blockCompanyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onBlockCompany(cardInfo.companyName);
    });
    group.appendChild(blockCompanyBtn);

    cardInfo.cardElement.style.position =
      cardInfo.cardElement.style.position === 'absolute' ? 'absolute' : 'relative';
    cardInfo.cardElement.appendChild(group);
  }
}
