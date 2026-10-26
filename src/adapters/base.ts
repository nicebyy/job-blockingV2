import { JobCardInfo } from '../types';
import { INLINE_BUTTON_CONFIG } from '../constants';

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
  hidePromotionBanners?(container?: Document | HTMLElement): void;
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

  public hidePromotionBanners?(_container?: Document | HTMLElement): void {
    // 기본 구현은 no-op (하위 어댑터에서 필요 시 재정의)
  }

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

    // 호버 시 노출 및 정확한 카드 내 배치를 위한 호스트 클래스 및 relative 포지셔닝 보장
    cardInfo.cardElement.classList.add(INLINE_BUTTON_CONFIG.CLASSES.CARD_HOST);
    cardInfo.cardElement.style.position = 'relative';

    if (cardInfo.cardElement.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.CONTAINER}`)) {
      return;
    }

    const onBlockCompany = typeof actions === 'function' ? actions : actions.onBlockCompany;
    const onBlockJob = typeof actions === 'object' ? actions.onBlockJob : undefined;

    const group = document.createElement('div');
    group.className = INLINE_BUTTON_CONFIG.CLASSES.CONTAINER;

    // 1. [이 공고만 숨기기] 버튼 (jobId 또는 공고 제목 단위)
    if (onBlockJob) {
      const hideJobBtn = document.createElement('button');
      hideJobBtn.className = `${INLINE_BUTTON_CONFIG.CLASSES.BUTTON} ${INLINE_BUTTON_CONFIG.CLASSES.JOB_BUTTON}`;
      hideJobBtn.type = 'button';
      hideJobBtn.title = INLINE_BUTTON_CONFIG.TOOLTIPS.HIDE_JOB;
      hideJobBtn.innerHTML = `
        <svg class="${INLINE_BUTTON_CONFIG.CLASSES.ICON}" width="${INLINE_BUTTON_CONFIG.ICONS.SIZE}" height="${INLINE_BUTTON_CONFIG.ICONS.SIZE}" viewBox="${INLINE_BUTTON_CONFIG.ICONS.VIEW_BOX}" fill="none" stroke="currentColor" stroke-width="${INLINE_BUTTON_CONFIG.ICONS.STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
        <span class="${INLINE_BUTTON_CONFIG.CLASSES.TEXT}">${INLINE_BUTTON_CONFIG.LABELS.HIDE_JOB}</span>
      `;
      hideJobBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // 즉시 DOM 완전 숨김 처리 (0ms 즉각 반응 보장)
        cardInfo.cardElement.style.setProperty('display', 'none', 'important');
        cardInfo.cardElement.setAttribute('data-job-filtered', 'true');
        cardInfo.cardElement.setAttribute('data-filter-mode', 'hide');

        try {
          await onBlockJob(cardInfo);
        } catch (err) {
          console.error('[JobFilter] Failed to block job:', err);
        }
      });
      group.appendChild(hideJobBtn);

      // 버튼 사이 구분 디바이더
      const divider = document.createElement('span');
      divider.className = INLINE_BUTTON_CONFIG.CLASSES.DIVIDER;
      group.appendChild(divider);
    }

    // 2. [회사 전체 차단] 버튼
    const blockCompanyBtn = document.createElement('button');
    blockCompanyBtn.className = `${INLINE_BUTTON_CONFIG.CLASSES.BUTTON} ${INLINE_BUTTON_CONFIG.CLASSES.COMPANY_BUTTON}`;
    blockCompanyBtn.type = 'button';
    blockCompanyBtn.title = INLINE_BUTTON_CONFIG.TOOLTIPS.BLOCK_COMPANY(cardInfo.companyName);
    blockCompanyBtn.innerHTML = `
      <svg class="${INLINE_BUTTON_CONFIG.CLASSES.ICON}" width="${INLINE_BUTTON_CONFIG.ICONS.SIZE}" height="${INLINE_BUTTON_CONFIG.ICONS.SIZE}" viewBox="${INLINE_BUTTON_CONFIG.ICONS.VIEW_BOX}" fill="none" stroke="currentColor" stroke-width="${INLINE_BUTTON_CONFIG.ICONS.STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
      <span class="${INLINE_BUTTON_CONFIG.CLASSES.TEXT}">${INLINE_BUTTON_CONFIG.LABELS.BLOCK_COMPANY}</span>
    `;
    blockCompanyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // 즉시 DOM 완전 숨김 처리 (0ms 즉각 반응 보장)
      cardInfo.cardElement.style.setProperty('display', 'none', 'important');
      cardInfo.cardElement.setAttribute('data-job-filtered', 'true');
      cardInfo.cardElement.setAttribute('data-filter-mode', 'hide');

      try {
        await onBlockCompany(cardInfo.companyName);
      } catch (err) {
        console.error('[JobFilter] Failed to block company:', err);
      }
    });
    group.appendChild(blockCompanyBtn);

    if (!cardInfo.cardElement.style.position || cardInfo.cardElement.style.position === 'static') {
      cardInfo.cardElement.style.position = 'relative';
    }
    cardInfo.cardElement.appendChild(group);
  }
}

