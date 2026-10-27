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
  /** 연속 fetch 실패 횟수 (무한 재시도 루프 방지용) */
  private consecutiveFailures = 0;

  private sentinelElement: HTMLElement | null = null;
  private loadingIndicator: HTMLElement | null = null;
  private observer: IntersectionObserver | null = null;

  /** destroy() 이후 늦게 도착한 비동기 작업이 DOM 을 건드리지 않도록 하는 플래그 */
  private destroyed = false;
  /** 진행 중인 fetch 를 취소하기 위한 컨트롤러 */
  private currentController: AbortController | null = null;
  /** 삭제 시 정리해야 하는 대기 타이머 (딜레이 / 타임아웃) */
  private pendingTimers: Set<ReturnType<typeof setTimeout>> = new Set();

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
    if (!pagination) {
      // 페이지네이션 요소가 없는 페이지(정적/단일 페이지)에서는 무한 스크롤 비활성화
      return false;
    }
    pagination.style.display = 'none';

    // 센티넬 및 로딩 인디케이터 생성
    this.setupSentinel(container);
    return true;
  }

  private setupSentinel(container: HTMLElement): void {
    if (typeof document === 'undefined') return;

    // 로딩 인디케이터 (표시 여부는 CSS 의 .is-active 상태 클래스로만 제어한다)
    const indicator = document.createElement('div');
    indicator.id = INFINITE_SCROLL_CONFIG.LOADING_INDICATOR_ID;
    indicator.className = 'job-filter-infinite-loading';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    indicator.setAttribute('aria-hidden', 'true');
    indicator.innerHTML = `
      <div class="job-filter-spinner"></div>
      <span>${INFINITE_SCROLL_CONFIG.LABELS.LOADING}</span>
    `;
    this.loadingIndicator = indicator;

    // 바닥 감지용 센서
    const sentinel = document.createElement('div');
    sentinel.id = INFINITE_SCROLL_CONFIG.SENTINEL_ID;
    sentinel.style.height = '10px';
    sentinel.style.margin = '20px 0';
    this.sentinelElement = sentinel;

    let targetParent: HTMLElement = container;
    if (container.tagName.toUpperCase() === 'TBODY' || container.tagName.toUpperCase() === 'TABLE') {
      const tableWrapper = container.closest<HTMLElement>('.tplList, .lists-wrap, .lists-cnt');
      targetParent =
        tableWrapper || container.closest('table')?.parentElement || container.parentElement || container;
    } else {
      targetParent = container.parentElement || container;
    }
    targetParent.appendChild(indicator);
    targetParent.appendChild(sentinel);

    if (typeof IntersectionObserver !== 'undefined') {
      this.observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry?.isIntersecting && !this.isLoading && this.hasMorePages) {
            this.consecutiveAutoRefills = 0; // 유저 스크롤 시 카운트 리셋
            this.loadNextPage(false);
          }
        },
        { rootMargin: INFINITE_SCROLL_CONFIG.ROOT_MARGIN }
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
      return await this.loadNextPage(true);
    }

    return false;
  }

  /**
   * 다음 페이지의 공고를 백그라운드에서 fetch하여 현재 목록에 추가
   * @param isAutoRefill 화면 내 유효 공고 부족으로 인한 연속 자동 리필 여부 (서버 보호용 딜레이 적용)
   */
  public async loadNextPage(isAutoRefill = false): Promise<boolean> {
    if (this.isLoading || !this.hasMorePages || this.destroyed) {
      return false;
    }

    const nextRequest = this.adapter.getNextPageRequest
      ? this.adapter.getNextPageRequest(document, this.currentPage)
      : null;
    const nextUrl = nextRequest?.url || this.adapter.getNextPageUrl?.(document, this.currentPage);

    if (!nextUrl) {
      this.hasMorePages = false;
      this.destroy();
      return false;
    }

    this.isLoading = true;
    this.setLoadingVisible(true);

    try {
      // 딜레이 적용 (연속 자동 채우기 시 서버 부하 방지, 일반 사용자 스크롤 시에는 0ms로 즉각 프리페치)
      const delayMs = isAutoRefill
        ? INFINITE_SCROLL_CONFIG.AUTO_REFILL_DELAY_MS
        : INFINITE_SCROLL_CONFIG.FETCH_DELAY_MS;

      if (delayMs > 0) {
        await new Promise((resolve) => {
          const timer = setTimeout(() => {
            this.pendingTimers.delete(timer);
            resolve(undefined);
          }, delayMs);
          this.pendingTimers.add(timer);
        });
      }

      // 딜레이 대기 중 destroy() 되었다면 즉시 중단 (파괴된 매니저가 DOM 을 건드리는 것을 방지)
      if (this.destroyed) {
        return false;
      }

      // 타임아웃 적용 (서버 묵묵부답/WAF 방어벽 무한 행잉 방지)
      // 주의: 타임아웃 타이머는 response.text() 까지 유지해야 body 지연 응답에도 적용된다
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      this.currentController = controller;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), INFINITE_SCROLL_CONFIG.FETCH_TIMEOUT_MS)
        : null;
      if (timeoutId) this.pendingTimers.add(timeoutId);

      let htmlText: string;
      try {
        const response = await this.fetchFn(nextUrl, {
          ...nextRequest?.options,
          signal: controller?.signal,
        });

        if (!response.ok) {
          throw new Error(`Fetch failed with status ${response.status}`);
        }

        // fetch 완료 후에도 파괴되었으면 중단
        if (this.destroyed) {
          return false;
        }

        // response.text() 는 타임아웃 타이머가 살아있는 상태에서 읽는다
        htmlText = await response.text();
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
          this.pendingTimers.delete(timeoutId);
        }
        this.currentController = null;
      }

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

      // 기존 공고 중 중복 검사 (이미 DOM에 존재하는 공고는 중복 추가하지 않음)
      const existingCards = this.adapter.getJobCardElements(document);
      const existingKeys = new Set(
        existingCards
          .map((c) => {
            const parsed = this.adapter.parseCard(c);
            return parsed?.jobId || (parsed ? `${parsed.companyName}:::${parsed.title}` : null);
          })
          .filter(Boolean)
      );

      // 카드 요소들을 현재 문서에 복제/추가 (DocumentFragment 일괄 삽입으로 Reflow 최소화)
      const fragment = document.createDocumentFragment();
      const importedCards: HTMLElement[] = [];
      for (const card of nextCards) {
        const parsed = this.adapter.parseCard(card);
        const key = parsed?.jobId || (parsed ? `${parsed.companyName}:::${parsed.title}` : null);
        if (key && existingKeys.has(key)) {
          continue;
        }
        if (key) {
          existingKeys.add(key);
        }

        const imported = document.importNode(card, true);
        fragment.appendChild(imported);
        importedCards.push(imported);
      }

      // DOM 반영 직전 마지막 확인 — 파괴되었으면 추가하지 않고 종료
      if (this.destroyed) {
        return false;
      }

      // 신규 추가된 카드가 0개라면 (동일 페이지 재반환 혹은 마지막 페이지 도달)
      if (importedCards.length === 0) {
        this.hasMorePages = false;
        this.destroy();
        return false;
      }

      currentContainer.appendChild(fragment);

      this.currentPage++;
      // 성공적으로 페이지를 받아왔으므로 연속 실패 카운터를 초기화한다
      this.consecutiveFailures = 0;
      this.onCardsAppended(importedCards);
      return true;
    } catch (error) {
      // [중요] 실패를 그대로 두면 센티넬이 화면에 남아 IntersectionObserver 가
      // 즉시 재요청 → 실패 → 재요청을 무한 반복한다. 스피너가 영구히 도는
      // "무한 대기" 현상의 직접 원인이다. 연속 실패 횟수를 세어 한도를 넘으면
      // 무한 스크롤을 종료(destroy)하고 사용자에게 실패를 알린다.
      this.consecutiveFailures++;
      if (!this.destroyed) {
        console.warn(
          `[JobFilter] 다음 페이지 로딩 실패 (${this.consecutiveFailures}/${INFINITE_SCROLL_CONFIG.MAX_CONSECUTIVE_FAILURES}):`,
          error
        );
      }

      if (this.consecutiveFailures >= INFINITE_SCROLL_CONFIG.MAX_CONSECUTIVE_FAILURES) {
        if (!this.destroyed) {
          this.hasMorePages = false;
          this.showLoadFailure();
          this.destroy();
        }
      }
      return false;
    } finally {
      this.isLoading = false;
      this.setLoadingVisible(false);
    }
  }

  /**
   * 연속 실패로 무한 스크롤을 포기할 때, 사용자가 "왜 더 안 불러오지?" 하고
   * 헤매지 않도록 명시적 안내 문구를 남긴다.
   */
  private showLoadFailure(): void {
    if (!this.loadingIndicator || typeof document === 'undefined') return;

    const host = this.loadingIndicator.parentElement;
    if (!host) return;

    const notice = document.createElement('div');
    notice.className = INFINITE_SCROLL_CONFIG.FAILURE_NOTICE_CLASS;
    notice.textContent = INFINITE_SCROLL_CONFIG.LABELS.LOAD_FAILURE;
    host.insertBefore(notice, this.loadingIndicator);
  }

  private setLoadingVisible(visible: boolean): void {
    if (!this.loadingIndicator) return;
    // [중요] 인라인 style.display 대신 상태 클래스로 제어한다.
    // CSS 에 `display: flex !important` 가 걸려 있으면 인라인 일반 선언은 무시되므로
    // (캐스케이드: !important > 인라인 일반) 스피너가 유휴 상태에서도 항상 보이는 버그가 있었다.
    this.loadingIndicator.classList.toggle(INFINITE_SCROLL_CONFIG.LOADING_ACTIVE_CLASS, visible);
    this.loadingIndicator.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  public destroy(): void {
    // 이후 도착하는 비동기 결과가 DOM 을 건드리지 않도록 먼저 플래그를 세운다
    this.destroyed = true;

    // 진행 중인 fetch 취소
    if (this.currentController) {
      try {
        this.currentController.abort();
      } catch {
        // abort 미지원/이미 종료된 경우 무시
      }
      this.currentController = null;
    }

    // 대기 중인 타이머 정리 (딜레이/타임아웃)
    for (const timer of this.pendingTimers) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();

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

  public isDestroyed(): boolean {
    return this.destroyed;
  }

  public getCurrentPage(): number {
    return this.currentPage;
  }

  public getIsLoading(): boolean {
    return this.isLoading;
  }
}
