import { BlockItem, BlockType, DEFAULT_SETTINGS, FilterSettings, JobPlatform } from '../types';
import { STORAGE_KEYS } from '../constants';
import { isJobExpired } from '../utils/date';


export class StorageManager {
  private static memoryFallback: Record<string, any> = {
    [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS,
    [STORAGE_KEYS.BLOCK_LIST]: [],
  };

  private static isChromeStorageAvailable(): boolean {
    return (
      typeof chrome !== 'undefined' &&
      typeof chrome.storage !== 'undefined' &&
      (typeof chrome.storage.local !== 'undefined' || typeof chrome.storage.sync !== 'undefined')
    );
  }

  /**
   * 설정 조회
   */
  public static async getSettings(): Promise<FilterSettings> {
    if (!this.isChromeStorageAvailable()) {
      return this.memoryFallback[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS;
    }

    try {
      if (chrome.storage.local) {
        const localResult = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
        if (localResult[STORAGE_KEYS.SETTINGS]) {
          return { ...DEFAULT_SETTINGS, ...localResult[STORAGE_KEYS.SETTINGS] };
        }
      }
      if (chrome.storage.sync) {
        const syncResult = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
        if (syncResult[STORAGE_KEYS.SETTINGS]) {
          return { ...DEFAULT_SETTINGS, ...syncResult[STORAGE_KEYS.SETTINGS] };
        }
      }
    } catch {
      // fallback to memory
    }
    return this.memoryFallback[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS;
  }

  /**
   * 설정 저장
   */
  public static async saveSettings(settings: Partial<FilterSettings>): Promise<FilterSettings> {
    const current = await this.getSettings();
    const updated: FilterSettings = { ...current, ...settings };

    if (!this.isChromeStorageAvailable()) {
      this.memoryFallback[STORAGE_KEYS.SETTINGS] = updated;
      return updated;
    }

    try {
      if (chrome.storage.local) {
        await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
      }
      if (chrome.storage.sync) {
        chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: updated }).catch(() => {});
      }
    } catch {
      this.memoryFallback[STORAGE_KEYS.SETTINGS] = updated;
    }

    return updated;
  }

  /**
   * 차단 목록 조회 (기본적으로 만료된 공고는 자동 감지하여 백그라운드에서 청소)
   */
  public static async getBlockList(autoClean: boolean = true): Promise<BlockItem[]> {
    let rawList: BlockItem[] = [];

    if (!this.isChromeStorageAvailable()) {
      rawList = this.memoryFallback[STORAGE_KEYS.BLOCK_LIST] || [];
    } else {
      try {
        if (chrome.storage.local) {
          const localResult = await chrome.storage.local.get(STORAGE_KEYS.BLOCK_LIST);
          if (localResult[STORAGE_KEYS.BLOCK_LIST]) {
            rawList = localResult[STORAGE_KEYS.BLOCK_LIST];
          }
        }
        if (rawList.length === 0 && chrome.storage.sync) {
          const syncResult = await chrome.storage.sync.get(STORAGE_KEYS.BLOCK_LIST);
          if (syncResult[STORAGE_KEYS.BLOCK_LIST]) {
            rawList = syncResult[STORAGE_KEYS.BLOCK_LIST];
            if (chrome.storage.local) {
              await chrome.storage.local.set({ [STORAGE_KEYS.BLOCK_LIST]: rawList });
            }
          }
        }
      } catch {
        rawList = this.memoryFallback[STORAGE_KEYS.BLOCK_LIST] || [];
      }
    }

    if (!autoClean) {
      return rawList;
    }

    // 만료된 공고 자동 정리
    const { cleanedList, purgedCount } = this.filterExpiredItems(rawList);
    if (purgedCount > 0) {
      await this.saveBlockList(cleanedList);
    }
    return cleanedList;
  }

  /**
   * 만료된 공고 항목들을 목록에서 분리 및 필터링
   */
  private static filterExpiredItems(list: BlockItem[]): { cleanedList: BlockItem[]; purgedCount: number } {
    const now = Date.now();
    const cleanedList: BlockItem[] = [];
    let purgedCount = 0;

    for (const item of list) {
      // 잘못 파싱되어 등록되었던 더미 팝업 텍스트('기업정보') 항목 자동 정화
      if (item.type === 'company' && item.pattern.trim() === '기업정보') {
        purgedCount++;
        continue;
      }

      if (isJobExpired(item, now)) {
        purgedCount++;
      } else {
        cleanedList.push(item);
      }
    }


    return { cleanedList, purgedCount };
  }

  /**
   * 만료된 공고 수동 일괄 정리
   */
  public static async purgeExpiredJobs(): Promise<number> {
    const rawList = await this.getBlockList(false);
    const { cleanedList, purgedCount } = this.filterExpiredItems(rawList);
    if (purgedCount > 0) {
      await this.saveBlockList(cleanedList);
    }
    return purgedCount;
  }

  /**
   * 차단 목록 저장
   */
  public static async saveBlockList(list: BlockItem[]): Promise<void> {
    // undefined 속성을 안전하게 정제하여 chrome.storage 직렬화 에러 원천 차단
    const sanitized: BlockItem[] = JSON.parse(JSON.stringify(list));

    if (!this.isChromeStorageAvailable()) {
      this.memoryFallback[STORAGE_KEYS.BLOCK_LIST] = sanitized;
      return;
    }

    try {
      if (chrome.storage.local) {
        await chrome.storage.local.set({ [STORAGE_KEYS.BLOCK_LIST]: sanitized });
      }
      if (chrome.storage.sync) {
        chrome.storage.sync.set({ [STORAGE_KEYS.BLOCK_LIST]: sanitized }).catch(() => {});
      }
    } catch {
      this.memoryFallback[STORAGE_KEYS.BLOCK_LIST] = sanitized;
    }
  }

  /**
   * 단일 차단 항목 추가 (회사, 키워드, 또는 특정 공고)
   */
  public static async addBlockItem(
    pattern: string,
    type: BlockType,
    metadata?: {
      memo?: string;
      title?: string;
      companyName?: string;
      closingDate?: string;
      expiresAt?: number;
      platform?: JobPlatform;
    }
  ): Promise<BlockItem> {
    const list = await this.getBlockList(false);
    const cleanPattern = pattern.trim();

    // 중복 검사 (패턴 일치 또는 공고의 경우 회사명+공고제목 일치 여부 다층 검증)
    const existingIndex = list.findIndex((item) => {
      if (item.type !== type) return false;
      // 1. pattern 동일 여부 (jobId 또는 회사명/키워드)
      if (item.pattern.toLowerCase() === cleanPattern.toLowerCase()) return true;

      // 2. 공고(job) 타입의 경우: pattern 형태가 다르더라도(예: 하나는 jobId, 하나는 company:::title)
      // 회사명과 공고 제목이 동일하면 동일한 공고로 판별하여 중복 방지
      if (
        type === 'job' &&
        metadata?.companyName &&
        metadata?.title &&
        item.companyName &&
        item.title &&
        item.companyName.trim().toLowerCase() === metadata.companyName.trim().toLowerCase() &&
        item.title.trim().toLowerCase() === metadata.title.trim().toLowerCase()
      ) {
        return true;
      }
      return false;
    });

    if (existingIndex !== -1) {
      const existing = list[existingIndex];
      let needsSave = false;

      // 기존 항목이 복합 키(company:::title)였고 새 항목이 고유 jobId인 경우 더 정확한 jobId로 pattern 업그레이드
      if (cleanPattern && !cleanPattern.includes(':::') && existing.pattern.includes(':::')) {
        existing.pattern = cleanPattern;
        needsSave = true;
      }
      if (metadata?.expiresAt && metadata.expiresAt !== existing.expiresAt) {
        existing.expiresAt = metadata.expiresAt;
        existing.closingDate = metadata.closingDate || existing.closingDate;
        needsSave = true;
      }
      if (metadata?.title && !existing.title) {
        existing.title = metadata.title;
        needsSave = true;
      }
      if (metadata?.companyName && !existing.companyName) {
        existing.companyName = metadata.companyName;
        needsSave = true;
      }
      if (metadata?.platform && !existing.platform) {
        existing.platform = metadata.platform;
        needsSave = true;
      }
      if (needsSave) {
        await this.saveBlockList(list);
      }
      return existing;
    }

    const newItem: BlockItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      pattern: cleanPattern,
      type,
      createdAt: Date.now(),
      platform: metadata?.platform || 'custom',
    };

    if (metadata?.expiresAt !== undefined && !Number.isNaN(metadata.expiresAt)) {
      newItem.expiresAt = metadata.expiresAt;
    }
    if (metadata?.closingDate) {
      newItem.closingDate = metadata.closingDate;
    }
    if (metadata?.memo) {
      newItem.memo = metadata.memo;
    }
    if (metadata?.title) {
      newItem.title = metadata.title;
    }
    if (metadata?.companyName) {
      newItem.companyName = metadata.companyName;
    }

    list.push(newItem);
    await this.saveBlockList(list);
    return newItem;
  }


  /**
   * 단일 차단 항목 삭제
   */
  public static async removeBlockItem(id: string): Promise<void> {
    const list = await this.getBlockList(false);
    const filtered = list.filter((item) => item.id !== id);
    await this.saveBlockList(filtered);
  }
}
