import { SiteAdapter } from '../adapters';
import { INFINITE_SCROLL_CONFIG } from '../constants';

export interface InfiniteScrollOptions {
  adapter: SiteAdapter;
  onCardsAppended: (newCards: HTMLElement[]) => void;
  fetchFn?: typeof fetch;
}

export class InfiniteScrollManager {
  private adapter: SiteAdapter;
  private onCardsAppended: (newCards: HTMLElement[]) => void;
  private fetchFn: typeof fetch;

  private currentPage = 1;
  private isLoading = false;
  private hasMorePages = true;
  private consecutiveAutoRefills = 0;

  private sentinelElement: HTMLElement | null = null;
  private loadingIndicator: HTMLElement | null = null;
  private observer: IntersectionObserver | null = null;

  constructor(options: InfiniteScrollOptions) {
    this.adapter = options.adapter;
    this.onCardsAppended = options.onCardsAppended;
    this.fetchFn = options.fetchFn || (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
  }

  public init(): boolean {
    if (!this.adapter.supportsInfiniteScroll) {
      return false;
    }

    const container = this.adapter.getCardListContainer?.(document);
    if (!container) {
      return false;
    }

    // 기존 페이지네이션 UI 숨기기
    const pagination = this.adapter.getPaginationElement?.(document);
    if (pagination) {
      pagination.style.display = 'none';
    }

    // 센티넬 및 로딩 인디케이터 생성
    this.setupSentinel(container);
    return true;
  }

  private setupSentinel(container: HTMLElement): void {
    if (typeof document === 'undefined') return;

    // 로딩 인디케이터
    const indicator = document.createElement('div');
    indicator.id = INFINITE_SCROLL_CONFIG.LOADING_INDICATOR_ID;
    indicator.className = 'job-filter-infinite-loading';
    indicator.style.display = 'none';
    indicator.innerHTML = `
      <div class="job-filter-spinner"></div>
      <span>다음 공고를 불러오는 중입니다...</span>
    `;
    this.loadingIndicator = indicator;

    // 바닥 감지용 센서
    const sentinel = document.createElement('div');
    sentinel.id = INFINITE_SCROLL_CONFIG.SENTINEL_ID;
    sentinel.style.height = '10px';
    sentinel.style.margin = '20px 0';
    this.sentinelElement = sentinel;

    const parent = container.parentElement || container;
    parent.appendChild(indicator);
    parent.appendChild(sentinel);

    if (typeof IntersectionObserver !== 'undefined') {
      this.observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry?.isIntersecting && !this.isLoading && this.hasMorePages) {
            this.consecutiveAutoRefills = 0; // 유저 스크롤 시 카운트 리셋
            this.loadNextPage();
          }
        },
        { rootMargin: '400px' }
      );
      this.observer.observe(sentinel);
    }
  }

  /**
   * 화면에 남은 유효 공고 개수에 따라 자동으로 빈자리 채우기 (Auto-Refill)
   */
  public async checkAndAutoRefill(visibleCount: number): Promise<boolean> {
    if (!this.hasMorePages || this.isLoading) {
      return false;
    }

    // 화면에 남은 유효 공고가 기준치 미만이고, 최대 연속 탐색 한도 내인 경우
    if (
      visibleCount < INFINITE_SCROLL_CONFIG.MIN_VISIBLE_CARDS &&
      this.consecutiveAutoRefills < INFINITE_SCROLL_CONFIG.MAX_CONSECUTIVE_FETCHES
    ) {
      this.consecutiveAutoRefills++;
      return await this.loadNextPage();
    }

    return false;
  }

  /**
   * 다음 페이지의 공고를 백그라운드에서 fetch하여 현재 목록에 추가
   */
  public async loadNextPage(): Promise<boolean> {
    if (this.isLoading || !this.hasMorePages) {
      return false;
    }

    const nextUrl = this.adapter.getNextPageUrl?.(document, this.currentPage);
    if (!nextUrl) {
      this.hasMorePages = false;
      this.destroy();
      return false;
    }

    this.isLoading = true;
    this.setLoadingVisible(true);

    try {
      // 딜레이 적용 (서버 부하 및 차단 방지)
      if (INFINITE_SCROLL_CONFIG.FETCH_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, INFINITE_SCROLL_CONFIG.FETCH_DELAY_MS));
      }

      const response = await this.fetchFn(nextUrl);
      if (!response.ok) {
        throw new Error(`Fetch failed with status ${response.status}`);
      }

      const htmlText = await response.text();
      const parser = new DOMParser();
      const parsedDoc = parser.parseFromString(htmlText, 'text/html');

      const nextCards = this.adapter.getJobCardElements(parsedDoc);
      if (!nextCards || nextCards.length === 0) {
        this.hasMorePages = false;
        this.destroy();
        return false;
      }

      const currentContainer = this.adapter.getCardListContainer?.(document);
      if (!currentContainer) {
        return false;
      }

      // 카드 요소들을 현재 문서에 복제/추가
      const importedCards: HTMLElement[] = [];
      for (const card of nextCards) {
        const imported = document.importNode(card, true);
        currentContainer.appendChild(imported);
        importedCards.push(imported);
      }

      this.currentPage++;
      this.onCardsAppended(importedCards);
      return true;
    } catch (error) {
      console.warn('[JobFilter] 다음 페이지 로딩 실패:', error);
      return false;
    } finally {
      this.isLoading = false;
      this.setLoadingVisible(false);
    }
  }

  private setLoadingVisible(visible: boolean): void {
    if (this.loadingIndicator) {
      this.loadingIndicator.style.display = visible ? 'flex' : 'none';
    }
  }

  public destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.sentinelElement) {
      this.sentinelElement.remove();
      this.sentinelElement = null;
    }
    if (this.loadingIndicator) {
      this.loadingIndicator.remove();
      this.loadingIndicator = null;
    }
  }

  public getCurrentPage(): number {
    return this.currentPage;
  }

  public getIsLoading(): boolean {
    return this.isLoading;
  }
}
