import { AdapterRegistry } from '../adapters';
import { FilterEngine } from '../core/filter-engine';
import { InfiniteScrollManager } from '../core/infinite-scroll';
import { StorageManager } from '../core/storage';
import { BlindRatingInfo, ExtensionMessage, FilterSettings, FilterStats, JobCardInfo, JobplanetRatingInfo, JobPlatform } from '../types';
import { FILTER_CONFIG, RATING_BADGE_CONFIG } from '../constants';
import { calculateJobExpiration } from '../utils/date';


class ContentController {
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

    this.settings = await StorageManager.getSettings();
    const blockList = await StorageManager.getBlockList();
    this.filterEngine = new FilterEngine(this.settings, blockList);

    // 무한 스크롤 초기화
    if (this.settings.enableInfiniteScroll && this.adapter.supportsInfiniteScroll) {
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

    if (this.settings?.enableInfiniteScroll && this.adapter?.supportsInfiniteScroll) {
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
        if (message.settings.enableInfiniteScroll && !this.infiniteScroll && this.adapter?.supportsInfiniteScroll) {
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
    this.adapter.hidePromotionBanners?.();

    const elements = this.adapter.getJobCardElements();
    let totalBlocked = 0;
    let blockedJobs = 0;
    let blockedAds = 0;
    const blockedCompanySet = new Set<string>();

    for (const el of elements) {
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
          blockedAds++;
        } else if (evalResult.matchedItem?.type === 'job') {
          blockedJobs++;
        } else if (evalResult.matchedItem?.type === 'company' || evalResult.matchedItem?.type === 'keyword') {
          blockedCompanySet.add(cardInfo.companyName || evalResult.matchedItem.pattern);
        } else {
          blockedCompanySet.add(cardInfo.companyName);
        }
      } else {
        // 이미 사용자가 명시적으로 숨김 처리한 카드는 부활시키지 않고 숨김 상태 유지
        if (
          cardInfo.cardElement.getAttribute('data-job-filtered') === 'true' &&
          cardInfo.cardElement.getAttribute('data-filter-mode') === 'hide'
        ) {
          totalBlocked++;
          blockedJobs++;
          continue;
        }

        this.filterEngine.removeFilter(cardInfo.cardElement);

        // 필터링되지 않은 정상 카드에 [공고숨김 / 회사차단] 듀얼 인라인 버튼 주입
        this.adapter.injectInlineButton(cardInfo, {
          onBlockCompany: async (companyName) => {
            await this.handleBlockCompany(companyName);
          },
          onBlockJob: async (info) => {
            await this.handleBlockJob(info);
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
    if (name.includes('saramin')) return 'saramin';
    if (name.includes('jobkorea')) return 'jobkorea';
    if (name.includes('wanted')) return 'wanted';
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

    chrome.runtime.sendMessage({
      type: 'UPDATE_BADGE',
      count,
    } as ExtensionMessage).catch(() => {
      // 팝업이나 백그라운드가 비활성화되어 있을 때 에러 무시
    });
  }
}

// 스크립트 실행
const controller = new ContentController();
controller.init();
