import { AdapterRegistry } from '../adapters';
import { FilterEngine } from '../core/filter-engine';
import { InfiniteScrollManager } from '../core/infinite-scroll';
import { StorageManager } from '../core/storage';
import { ExtensionMessage, FilterSettings, FilterStats, JobCardInfo } from '../types';
import { FILTER_CONFIG } from '../constants';

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
    blockedAds: 0,
  };

  public async init(): Promise<void> {
    if (!this.adapter) {
      return;
    }

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

    // 메시지 리스너 등록
    this.setupMessageListener();
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
    let blockedCompanies = 0;
    let blockedAds = 0;

    for (const el of elements) {
      const cardInfo = this.adapter.parseCard(el);
      if (!cardInfo) continue;

      const evalResult = this.filterEngine.evaluateJobCard(cardInfo);

      if (evalResult.shouldFilter) {
        this.filterEngine.applyFilter(cardInfo.cardElement);
        if (evalResult.isAdFilter) {
          blockedAds++;
        } else {
          blockedCompanies++;
        }
      } else {
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
      }
    }

    this.currentStats = {
      totalBlocked: blockedCompanies + blockedAds,
      blockedCompanies,
      blockedAds,
    };

    this.notifyBadgeUpdate(this.currentStats.totalBlocked);

    // 유효 공고 개수 확인 후 필요 시 다음 페이지 자동 채우기 (Auto-Refill)
    const visibleCount = elements.length - this.currentStats.totalBlocked;
    if (this.settings?.enableInfiniteScroll) {
      this.infiniteScroll?.checkAndAutoRefill(visibleCount);
    }
  }

  private async handleBlockCompany(companyName: string): Promise<void> {
    await StorageManager.addBlockItem(companyName, 'company');
    const updatedList = await StorageManager.getBlockList();
    this.filterEngine?.updateBlockList(updatedList);
    this.scanAndFilter();
  }

  private async handleBlockJob(cardInfo: JobCardInfo): Promise<void> {
    const pattern = cardInfo.jobId || `${cardInfo.companyName}:::${cardInfo.title}`;
    await StorageManager.addBlockItem(pattern, 'job', {
      title: cardInfo.title,
      companyName: cardInfo.companyName,
    });
    const updatedList = await StorageManager.getBlockList();
    this.filterEngine?.updateBlockList(updatedList);
    this.scanAndFilter();
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
