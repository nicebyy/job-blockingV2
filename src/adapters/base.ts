import { JobCardInfo, CompanyRatingInfo } from '../types';
import {
  INLINE_BUTTON_CONFIG,
  JOBPLANET_CONFIG,
  BLIND_CONFIG,
  RATING_BADGE_CONFIG,
} from '../constants';

export interface SiteAdapter {
  readonly name: string;
  readonly supportsInfiniteScroll?: boolean;
  matches(url: string): boolean;
  getJobCardElements(container?: Document | HTMLElement): HTMLElement[];
  parseCard(element: HTMLElement): JobCardInfo | null;
  getCompanyElement(cardElement: HTMLElement): HTMLElement | null;
  injectInlineButton(
    cardInfo: JobCardInfo,
    actions: BlockActions | ((companyName: string) => void)
  ): void;
  injectRatingBadge(cardInfo: JobCardInfo, ratingInfo: CompanyRatingInfo): void;
  isDetailPage?(url?: string): boolean;
  getNextPageUrl?(currentDoc: Document, currentPage: number): string | null;
  getNextPageRequest?(
    currentDoc: Document,
    currentPage: number
  ): { url: string; options?: RequestInit } | null;
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
  abstract getCompanyElement(cardElement: HTMLElement): HTMLElement | null;

  public hidePromotionBanners?(_container?: Document | HTMLElement): void {
    // 기본 구현은 no-op (하위 어댑터에서 필요 시 재정의)
  }

  public getNextPageUrl?(_currentDoc: Document, _currentPage: number): string | null {
    return null;
  }

  public getNextPageRequest?(
    _currentDoc: Document,
    _currentPage: number
  ): { url: string; options?: RequestInit } | null {
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
   * @param targetContainer - 상세 페이지 등 카드의 특정 하위 영역(예: title_inner)에 툴바를 배치할 경우 지정 (생략 시 cardElement에 삽입)
   */
  public injectInlineButton(
    cardInfo: JobCardInfo,
    actions: BlockActions | ((companyName: string) => void),
    targetContainer?: HTMLElement
  ): void {
    if (!cardInfo.cardElement || !cardInfo.companyName) return;

    const host = targetContainer || cardInfo.cardElement;

    // 이미 주입되어 있는지 확인 (전체 카드 또는 타깃 컨테이너)
    if (
      cardInfo.cardElement.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.CONTAINER}`) ||
      host.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.CONTAINER}`)
    ) {
      return;
    }

    // 카드 호스트 클래스 지정
    cardInfo.cardElement.classList.add(INLINE_BUTTON_CONFIG.CLASSES.CARD_HOST);
    if (!host.style.position || host.style.position === 'static') {
      host.style.position = 'relative';
    }


    const onBlockCompany = typeof actions === 'function' ? actions : actions.onBlockCompany;
    const onBlockJob = typeof actions === 'object' ? actions.onBlockJob : undefined;

    const isDetail = Boolean(targetContainer && targetContainer !== cardInfo.cardElement);
    const group = document.createElement('div');
    group.className = isDetail
      ? `${INLINE_BUTTON_CONFIG.CLASSES.CONTAINER} ${INLINE_BUTTON_CONFIG.CLASSES.CONTAINER_DETAIL}`
      : INLINE_BUTTON_CONFIG.CLASSES.CONTAINER;

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

        // 즉시 DOM 완전 숨김 처리 (전체 카드 단위 숨김, 0ms 즉각 반응 보장)
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

      // 즉시 DOM 완전 숨김 처리 (전체 카드 단위 숨김, 0ms 즉각 반응 보장)
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

    host.appendChild(group);
  }

  /**
   * 현재 페이지가 단일 공고 상세 페이지인지 여부 반환 (기본값: false)
   */
  public isDetailPage(_url: string = typeof window !== 'undefined' ? window.location.href : ''): boolean {
    return false;
  }

  /**
   * 평점 뱃지 래퍼가 삽입될 기준 앵커 요소 반환 (기본값: companyElement)
   * 플랫폼별로 회사명 바로 뒤에 하트/찜하기 버튼이 있을 경우 해당 버튼 뒤에 앵커링하도록 오버라이드
   */
  public getRatingBadgeAnchorElement(cardElement: HTMLElement): HTMLElement | null {
    return this.getCompanyElement(cardElement);
  }

  /**
   * 기업 평점 뱃지 주입 (잡플래닛: 초록색, 블라인드: 빨간색)
   * - 평점이 유효하게 존재하는 단일 기업일 때만 기업명 옆에 배치
   * - 미존재, 에러, 동명 기업(ambiguous)일 경우 배치하지 않음 (배치x)
   */
  public injectRatingBadge(cardInfo: JobCardInfo, ratingInfo: CompanyRatingInfo): void {
    if (
      ratingInfo.status !== 'found' ||
      typeof ratingInfo.rating !== 'number' ||
      ratingInfo.rating <= 0
    ) {
      return;
    }

    if (!cardInfo.cardElement) return;

    const companyEl = this.getCompanyElement(cardInfo.cardElement);
    if (!companyEl) return;

    // 래퍼 컨테이너 확인 또는 생성
    let wrap = cardInfo.cardElement.querySelector<HTMLElement>(
      `.${RATING_BADGE_CONFIG.CLASSES.WRAP}`
    );
    if (!wrap) {
      wrap = document.createElement('span');
      wrap.className = RATING_BADGE_CONFIG.CLASSES.WRAP;
      const anchorEl = this.getRatingBadgeAnchorElement(cardInfo.cardElement) || companyEl;
      anchorEl.insertAdjacentElement('afterend', wrap);
    }

    const isBlind = ratingInfo.platform === 'blind';
    const platformClass = isBlind
      ? RATING_BADGE_CONFIG.CLASSES.BLIND
      : RATING_BADGE_CONFIG.CLASSES.JOBPLANET;

    // 해당 플랫폼 뱃지가 이미 주입되어 있다면 중복 주입 방지
    if (wrap.querySelector(`.${platformClass}`)) {
      return;
    }

    const badge = document.createElement('a');
    badge.className = `${RATING_BADGE_CONFIG.CLASSES.BADGE} ${platformClass}`;
    badge.href =
      ratingInfo.companyUrl ||
      (isBlind
        ? `${BLIND_CONFIG.COMPANY_BASE_URL}/${encodeURIComponent(cardInfo.companyName)}`
        : `${JOBPLANET_CONFIG.COMPANY_BASE_URL}/${ratingInfo.companyId}`);
    badge.target = '_blank';
    badge.rel = 'noopener noreferrer';

    const labelText = isBlind
      ? RATING_BADGE_CONFIG.LABELS.BLIND
      : RATING_BADGE_CONFIG.LABELS.JOBPLANET;
    const tooltipText = isBlind
      ? RATING_BADGE_CONFIG.TOOLTIPS.BLIND(ratingInfo.rating, cardInfo.companyName)
      : RATING_BADGE_CONFIG.TOOLTIPS.JOBPLANET(ratingInfo.rating, cardInfo.companyName);

    badge.title = tooltipText;

    badge.innerHTML = `
      <span class="${RATING_BADGE_CONFIG.CLASSES.LABEL}">${labelText}</span>
      <span class="${RATING_BADGE_CONFIG.CLASSES.STAR}">★</span>
      <span class="${RATING_BADGE_CONFIG.CLASSES.SCORE}">${ratingInfo.rating.toFixed(1)}</span>
    `;

    // 뱃지 클릭 시 공고 카드 이동 방지
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    wrap.appendChild(badge);
  }
}


