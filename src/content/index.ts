import { AdapterRegistry } from '../adapters';
import { FilterEngine } from '../core/filter-engine';
import { StorageManager } from '../core/storage';
import { ExtensionMessage, FilterStats } from '../types';

class ContentController {
  private adapter = AdapterRegistry.getAdapterForUrl(window.location.href);
  private filterEngine: FilterEngine | null = null;
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

    const settings = await StorageManager.getSettings();
    const blockList = await StorageManager.getBlockList();
    this.filterEngine = new FilterEngine(settings, blockList);

    // 1차 스캔
    this.scanAndFilter();

    // DOM 변화 감시 (SPA 페이지 전환 및 무한 스크롤 대응)
    this.setupObserver();

    // 메시지 리스너 등록
    this.setupMessageListener();
  }

  private setupObserver(): void {
    this.observer = new MutationObserver(() => {
      if (this.debounceTimer) {
        window.clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = window.setTimeout(() => {
        this.scanAndFilter();
      }, 150);
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
        this.filterEngine?.updateSettings(message.settings);
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

        // 필터링되지 않은 정상 카드에 [차단] 인라인 버튼 주입
        this.adapter.injectInlineButton(cardInfo, async (companyName) => {
          await this.handleBlockCompany(companyName);
        });
      }
    }

    this.currentStats = {
      totalBlocked: blockedCompanies + blockedAds,
      blockedCompanies,
      blockedAds,
    };

    this.notifyBadgeUpdate(this.currentStats.totalBlocked);
  }

  private async handleBlockCompany(companyName: string): Promise<void> {
    await StorageManager.addBlockItem(companyName, 'company');
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
