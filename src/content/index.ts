import { AdapterRegistry } from '../adapters';
import { FilterEngine } from '../core/filter-engine';
import { InfiniteScrollManager } from '../core/infinite-scroll';
import { StorageManager } from '../core/storage';
import {
  BlindRatingInfo,
  BlockItem,
  DEFAULT_SETTINGS,
  ExtensionMessage,
  FilterSettings,
  FilterStats,
  JobCardInfo,
  JobplanetRatingInfo,
  JobPlatform,
} from '../types';
import { FILTER_CONFIG, RATING_BADGE_CONFIG } from '../constants';
import { calculateJobExpiration } from '../utils/date';
import { normalizeCompanyName } from '../utils/text';


export class ContentController {
  private adapter = AdapterRegistry.getAdapterForUrl(window.location.href);
  private filterEngine: FilterEngine | null = null;
  private infiniteScroll: InfiniteScrollManager | null = null;
  private settings: FilterSettings | null = null;
  private observer: MutationObserver | null = null;
  private debounceTimer: number | null = null;
  private currentStats: FilterStats = {
    totalBlocked: 0,
    blockedCompanies: 0,
    blockedJobs: 0,
    blockedAds: 0,
  };

  public async init(): Promise<void> {
    if (!this.adapter) {
      return;
    }

    // 팝업 및 외부 메시지 리스너 최우선 등록 (초기화 지연 시에도 메시지 유실 방지)
    this.setupMessageListener();

    // [중요] 저장소 조회가 실패하더라도 필터링 이외의 기능(옵저버/메시지 응답)은
    // 계속 동작해야 한다. 기존에는 아래 await 가 reject 되면 이후 초기화가 전부
    // 중단되어 확장이 완전히 무력화되었다(손상된 차단 목록 1건으로 전체 정지).
    try {
      this.settings = await StorageManager.getSettings();
    } catch (err) {
      console.error('[JobFilter] 설정 로드 실패, 기본 설정으로 진행:', err);
      this.settings = { ...DEFAULT_SETTINGS };
    }

    let blockList: BlockItem[] = [];
    try {
      blockList = await StorageManager.getBlockList();
    } catch (err) {
      console.error('[JobFilter] 차단 목록 로드 실패, 빈 목록으로 진행:', err);
    }
    this.filterEngine = new FilterEngine(this.settings, blockList);

    // 무한 스크롤 초기화 (단, 상세 페이지에서는 비활성화)
    if (
      this.settings.enableInfiniteScroll &&
      this.adapter.supportsInfiniteScroll &&
      !this.adapter.isDetailPage?.()
    ) {
      this.setupInfiniteScroll();
    }

    // 1차 스캔
    this.scanAndFilter();

    // DOM 변화 감시 (SPA 페이지 전환 및 무한 스크롤 대응)
    this.setupObserver();

    // URL 변경 감지 (정렬 필터, 카테고리 탭 변경 등 대응)
    this.setupUrlChangeListener();
  }

  private setupUrlChangeListener(): void {
    if (typeof window === 'undefined') return;

    let lastUrl = window.location.href;

    const onUrlChange = () => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        this.handleUrlOrFilterChange();
      }
    };

    window.addEventListener('popstate', onUrlChange);
    window.addEventListener('hashchange', onUrlChange);

    // pushState / replaceState 감지 (SPA 및 AJAX 정렬 변경 감지)
    const originalPushState = history.pushState.bind(history);
    history.pushState = (...args: Parameters<typeof history.pushState>) => {
      originalPushState(...args);
      window.dispatchEvent(new Event('job-filter-url-change'));
    };

    const originalReplaceState = history.replaceState.bind(history);
    history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
      originalReplaceState(...args);
      window.dispatchEvent(new Event('job-filter-url-change'));
    };

    window.addEventListener('job-filter-url-change', onUrlChange);
  }

  private handleUrlOrFilterChange(): void {
    // 사이트 정렬 및 검색 필터 변경 시 어댑터 재확인 및 무한 스크롤 초기화
    this.adapter = AdapterRegistry.getAdapterForUrl(window.location.href);

    if (this.infiniteScroll) {
      this.infiniteScroll.destroy();
      this.infiniteScroll = null;
    }

    if (
      this.settings?.enableInfiniteScroll &&
      this.adapter?.supportsInfiniteScroll &&
      !this.adapter.isDetailPage?.()
    ) {
      this.setupInfiniteScroll();
    }

    this.scanAndFilter();
  }

  private setupInfiniteScroll(): void {
    if (!this.adapter) return;

    this.infiniteScroll = new InfiniteScrollManager({
      adapter: this.adapter,
      onCardsAppended: () => {
        this.scanAndFilter();
      },
    });
    this.infiniteScroll.init();
  }

  private setupObserver(): void {
    this.observer = new MutationObserver(() => {
      if (this.debounceTimer) {
        window.clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = window.setTimeout(() => {
        this.scanAndFilter();
      }, FILTER_CONFIG.DEBOUNCE_DELAY_MS);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private setupMessageListener(): void {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;

    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === 'GET_PAGE_STATS') {
        // 팝업 요청 시 최신 DOM 상태를 즉시 재스캔하여 정확한 통계 반환
        this.scanAndFilter();
        sendResponse({ stats: this.currentStats });
        return true;
      }

      if (message.type === 'SETTINGS_CHANGED') {
        this.settings = message.settings;
        this.filterEngine?.updateSettings(message.settings);
        if (
          message.settings.enableInfiniteScroll &&
          !this.infiniteScroll &&
          this.adapter?.supportsInfiniteScroll &&
          !this.adapter.isDetailPage?.()
        ) {
          this.setupInfiniteScroll();
        } else if (!message.settings.enableInfiniteScroll && this.infiniteScroll) {
          this.infiniteScroll.destroy();
          this.infiniteScroll = null;
        }

        if (!message.settings.showJobplanetRating) {
          document
            .querySelectorAll(`.${RATING_BADGE_CONFIG.CLASSES.JOBPLANET}`)
            .forEach((el) => el.remove());
          document
            .querySelectorAll('[data-jp-rating-requested]')
            .forEach((el) => el.removeAttribute('data-jp-rating-requested'));
        }

        if (!message.settings.showBlindRating) {
          document
            .querySelectorAll(`.${RATING_BADGE_CONFIG.CLASSES.BLIND}`)
            .forEach((el) => el.remove());
          document
            .querySelectorAll('[data-blind-rating-requested]')
            .forEach((el) => el.removeAttribute('data-blind-rating-requested'));
        }

        // 비어있는 평점 래퍼 정리
        document
          .querySelectorAll(`.${RATING_BADGE_CONFIG.CLASSES.WRAP}`)
          .forEach((wrap) => {
            if (wrap.children.length === 0) wrap.remove();
          });

        this.scanAndFilter();
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'BLOCKLIST_CHANGED') {
        this.filterEngine?.updateBlockList(message.items);
        this.scanAndFilter();
        sendResponse({ success: true });
        return true;
      }
    });
  }

  public scanAndFilter(): void {
    if (!this.adapter || !this.filterEngine) return;

    // AI 검색 배너, 개인 맞춤 추천 공고, 스토어 배너 등 프로모션 섹션 숨김 처리
    let promoAdsCount = 0;
    if (this.settings?.hideAds !== false) {
      promoAdsCount = this.adapter.hidePromotionBanners?.() || 0;
    } else {
      // [버그 수정] 광고 숨김 토글을 끄면 이전에 숨긴 배너를 복원해야 한다.
      // (기존에는 hidePromotionBanners 호출만 건너뛰고 복구를 하지 않아 새로고침 전까지 배너가 사라진 채로 남았다)
      this.adapter.restorePromotionBanners?.();
    }

    const elements = this.adapter.getJobCardElements();
    let totalBlocked = promoAdsCount;
    let blockedJobs = 0;
    let blockedAds = promoAdsCount;
    const blockedCompanySet = new Set<string>();

    for (const el of elements) {
      // 숨겨진 프로모션 배너 내부에 중첩된 요소인 경우 중복 처리 방지
      const parentFiltered = el.closest('[data-job-filtered="true"]');
      if (parentFiltered && parentFiltered !== el) {
        continue;
      }

      const cardInfo = this.adapter.parseCard(el);
      if (!cardInfo) continue;

      const evalResult = this.filterEngine.evaluateJobCard(cardInfo);

      if (evalResult.shouldFilter) {
        // [중요] 사용자가 직접 [공고숨김]을 누른 단일 공고(type === 'job')는
        // 사용자의 명시적 의도에 따라 blur 모드와 무관하게 항상 완전 숨김('hide') 적용
        const effectiveMode =
          evalResult.matchedItem?.type === 'job' ? 'hide' : (this.settings?.mode || 'blur');
        this.filterEngine.applyFilter(cardInfo.cardElement, effectiveMode);
        totalBlocked++;

        if (evalResult.isAdFilter) {
          cardInfo.cardElement.setAttribute('data-blocked-type', 'ad');
          blockedAds++;
        } else if (evalResult.matchedItem?.type === 'job') {
          cardInfo.cardElement.setAttribute('data-blocked-type', 'job');
          blockedJobs++;
        } else if (evalResult.matchedItem?.type === 'company' || evalResult.matchedItem?.type === 'keyword') {
          cardInfo.cardElement.setAttribute('data-blocked-type', 'company');
          const rawName = cardInfo.companyName || evalResult.matchedItem.pattern;
          const compKey = normalizeCompanyName(rawName) || rawName;
          if (compKey) blockedCompanySet.add(compKey);
        } else {
          cardInfo.cardElement.setAttribute('data-blocked-type', 'company');
          const compKey = normalizeCompanyName(cardInfo.companyName) || cardInfo.companyName;
          if (compKey) blockedCompanySet.add(compKey);
        }
      } else {
        // [중요] 사용자가 카드에서 직접 [공고숨김]을 누른 경우에만 부활시키지 않는다.
        //
        // 기존 구현은 `data-filter-mode === 'hide'` 이기만 하면 무조건 continue 해서,
        // 회사 차단을 해제하거나 "광고 숨김"을 꺼도 카드가 복원되지 않았다(영구 숨김).
        // 이제는 수동 숨김(data-filter-origin="manual")만 유지하고,
        // 목록/설정 기반 필터는 해제 시 정상적으로 복원한다.
        const origin = cardInfo.cardElement.getAttribute(FILTER_CONFIG.ATTR_FILTER_ORIGIN);
        const isManualHide =
          origin === FILTER_CONFIG.FILTER_ORIGIN_MANUAL &&
          cardInfo.cardElement.getAttribute('data-filter-mode') === 'hide';

        if (isManualHide) {
          totalBlocked++;
          const blockedType = cardInfo.cardElement.getAttribute('data-blocked-type');
          if (blockedType === 'company') {
            const compKey = normalizeCompanyName(cardInfo.companyName) || cardInfo.companyName;
            if (compKey) blockedCompanySet.add(compKey);
          } else if (blockedType === 'ad') {
            blockedAds++;
          } else {
            blockedJobs++;
          }
          continue;
        }

        this.filterEngine.removeFilter(cardInfo.cardElement);
        cardInfo.cardElement.removeAttribute('data-blocked-type');
        cardInfo.cardElement.removeAttribute(FILTER_CONFIG.ATTR_FILTER_ORIGIN);

        // 필터링되지 않은 정상 카드에 [공고숨김 / 회사차단] 듀얼 인라인 버튼 주입
        this.adapter.injectInlineButton(cardInfo, {
          onBlockCompany: async (companyName) => {
            await this.handleBlockCompany(companyName);
            if (this.adapter?.isDetailPage?.()) {
              this.navigateBackOrCloseTab();
            }
          },
          onBlockJob: async (info) => {
            await this.handleBlockJob(info);
            if (this.adapter?.isDetailPage?.()) {
              this.navigateBackOrCloseTab();
            }
          },
        });

        // 잡플래닛 평점 뱃지 연동 (설정이 켜져 있고 회사명이 존재하는 경우)
        if (this.settings?.showJobplanetRating && cardInfo.companyName) {
          this.attachJobplanetRating(cardInfo);
        }

        // 블라인드 평점 뱃지 연동 (설정이 켜져 있고 회사명이 존재하는 경우)
        if (this.settings?.showBlindRating && cardInfo.companyName) {
          this.attachBlindRating(cardInfo);
        }
      }
    }

    this.currentStats = {
      totalBlocked,
      blockedCompanies: blockedCompanySet.size,
      blockedJobs,
      blockedAds,
    };

    this.notifyBadgeUpdate(this.currentStats.totalBlocked);

    // 유효 공고 개수 확인 후 필요 시 다음 페이지 자동 채우기 (Auto-Refill)
    const visibleCount = elements.length - this.currentStats.totalBlocked;
    if (this.settings?.enableInfiniteScroll) {
      this.infiniteScroll?.checkAndAutoRefill(visibleCount);
    }
  }

  private getPlatformKey(): JobPlatform {
    if (!this.adapter) return 'custom';
    const name = this.adapter.name.toLowerCase();
    if (name.includes('jumpit')) return 'jumpit';
    if (name.includes('saramin')) return 'saramin';
    if (name.includes('jobkorea')) return 'jobkorea';
    if (name.includes('wanted')) return 'wanted';
    if (name.includes('remember')) return 'remember';
    return 'custom';
  }

  private async handleBlockCompany(companyName: string): Promise<void> {
    try {
      const platform = this.getPlatformKey();

      // 1. 필터 엔진에 즉시 반영 (0ms 지연 방지)
      this.filterEngine?.addBlockItem({
        id: `temp_${Date.now()}`,
        pattern: companyName,
        type: 'company',
        createdAt: Date.now(),
        platform,
      });

      await StorageManager.addBlockItem(companyName, 'company', { platform });
      const updatedList = await StorageManager.getBlockList();
      this.filterEngine?.updateBlockList(updatedList);
      this.scanAndFilter();
    } catch (err) {
      console.error('[JobFilter] handleBlockCompany error:', err);
    }
  }

  private async handleBlockJob(cardInfo: JobCardInfo): Promise<void> {
    try {
      const pattern = cardInfo.jobId || `${cardInfo.companyName}:::${cardInfo.title}`;
      const expiresAt = calculateJobExpiration(cardInfo.closingDate);
      const platform = this.getPlatformKey();

      // 1. 필터 엔진에 즉시 반영 (0ms 지연 방지)
      this.filterEngine?.addBlockItem({
        id: `temp_${Date.now()}`,
        pattern,
        type: 'job',
        createdAt: Date.now(),
        title: cardInfo.title,
        companyName: cardInfo.companyName,
        closingDate: cardInfo.closingDate,
        expiresAt,
        platform,
      });

      await StorageManager.addBlockItem(pattern, 'job', {
        title: cardInfo.title,
        companyName: cardInfo.companyName,
        closingDate: cardInfo.closingDate,
        expiresAt,
        platform,
      });
      const updatedList = await StorageManager.getBlockList();
      this.filterEngine?.updateBlockList(updatedList);
      this.scanAndFilter();
    } catch (err) {
      console.error('[JobFilter] handleBlockJob error:', err);
    }
  }

  /**
   * 단일 공고 상세 페이지에서 차단 시 뒤로가기 또는 새 페이지면 탭 닫기 정책 수행
   */
  public navigateBackOrCloseTab(): void {
    if (typeof window === 'undefined') return;

    if (window.history.length > 1) {
      window.history.back();
    } else {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        try {
          const res = chrome.runtime.sendMessage({ type: 'CLOSE_CURRENT_TAB' } as ExtensionMessage);
          if (res && typeof res.catch === 'function') {
            res.catch(() => {
              window.close();
            });
          }
        } catch {
          window.close();
        }
      } else {
        window.close();
      }
    }
  }


  private async attachJobplanetRating(cardInfo: JobCardInfo): Promise<void> {
    if (!this.adapter || !cardInfo.cardElement || !cardInfo.companyName) return;

    // 이미 주입되었거나 이미 비동기 요청이 진행 중인 경우 중복 요청 방지
    if (
      cardInfo.cardElement.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.JOBPLANET}`) ||
      cardInfo.cardElement.getAttribute('data-jp-rating-requested') === 'true'
    ) {
      return;
    }

    cardInfo.cardElement.setAttribute('data-jp-rating-requested', 'true');

    try {
      const response = await this.requestJobplanetRating(cardInfo.companyName);
      if (response && response.status === 'found') {
        this.adapter.injectRatingBadge(cardInfo, response);
      } else if (!response || response.status === 'error') {
        cardInfo.cardElement.removeAttribute('data-jp-rating-requested');
      }
    } catch {
      cardInfo.cardElement.removeAttribute('data-jp-rating-requested');
    }
  }

  private requestJobplanetRating(companyName: string): Promise<JobplanetRatingInfo | null> {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'FETCH_JOBPLANET_RATING',
          companyName,
        } as ExtensionMessage,
        (response: JobplanetRatingInfo) => {
          if (chrome.runtime?.lastError) {
            resolve(null);
          } else {
            resolve(response || null);
          }
        }
      );
    });
  }

  private async attachBlindRating(cardInfo: JobCardInfo): Promise<void> {
    if (!this.adapter || !cardInfo.cardElement || !cardInfo.companyName) return;

    // 이미 주입되었거나 이미 비동기 요청이 진행 중인 경우 중복 요청 방지
    if (
      cardInfo.cardElement.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.BLIND}`) ||
      cardInfo.cardElement.getAttribute('data-blind-rating-requested') === 'true'
    ) {
      return;
    }

    cardInfo.cardElement.setAttribute('data-blind-rating-requested', 'true');

    try {
      const response = await this.requestBlindRating(cardInfo.companyName);
      if (response && response.status === 'found') {
        this.adapter.injectRatingBadge(cardInfo, response);
      } else if (!response || response.status === 'error') {
        cardInfo.cardElement.removeAttribute('data-blind-rating-requested');
      }
    } catch {
      cardInfo.cardElement.removeAttribute('data-blind-rating-requested');
    }
  }

  private requestBlindRating(companyName: string): Promise<BlindRatingInfo | null> {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'FETCH_BLIND_RATING',
          companyName,
        } as ExtensionMessage,
        (response: BlindRatingInfo) => {
          if (chrome.runtime?.lastError) {
            resolve(null);
          } else {
            resolve(response || null);
          }
        }
      );
    });
  }

  private notifyBadgeUpdate(count: number): void {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;

    try {
      const p = chrome.runtime.sendMessage({
        type: 'UPDATE_BADGE',
        count,
      } as ExtensionMessage);
      if (p && typeof (p as any).catch === 'function') {
        (p as any).catch(() => {});
      }
    } catch {
      // 팝업이나 백그라운드가 비활성화되어 있을 때 에러 무시
    }
  }
}

// 스크립트 실행 (단위 테스트 환경에서는 자동 실행 방지)
if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
  const controller = new ContentController();
  // 초기화 실패가 unhandled rejection 으로 남지 않도록 반드시 catch 한다
  controller.init().catch((err) => {
    console.error('[JobFilter] 초기화 실패:', err);
  });
}
