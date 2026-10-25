import { BlockItem, DEFAULT_SETTINGS, FilterSettings } from '../types';

const STORAGE_KEYS = {
  SETTINGS: 'job_filter_settings',
  BLOCK_LIST: 'job_filter_block_list',
} as const;

export class StorageManager {
  private static memoryFallback: Record<string, any> = {
    [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS,
    [STORAGE_KEYS.BLOCK_LIST]: [],
  };

  private static isChromeStorageAvailable(): boolean {
    return (
      typeof chrome !== 'undefined' &&
      typeof chrome.storage !== 'undefined' &&
      typeof chrome.storage.sync !== 'undefined'
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
      const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
      return {
        ...DEFAULT_SETTINGS,
        ...(result[STORAGE_KEYS.SETTINGS] || {}),
      };
    } catch {
      const localResult = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
      return {
        ...DEFAULT_SETTINGS,
        ...(localResult[STORAGE_KEYS.SETTINGS] || {}),
      };
    }
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
      await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: updated });
    } catch {
      await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
    }

    return updated;
  }

  /**
   * 차단 목록 조회
   */
  public static async getBlockList(): Promise<BlockItem[]> {
    if (!this.isChromeStorageAvailable()) {
      return this.memoryFallback[STORAGE_KEYS.BLOCK_LIST] || [];
    }

    try {
      const result = await chrome.storage.sync.get(STORAGE_KEYS.BLOCK_LIST);
      return result[STORAGE_KEYS.BLOCK_LIST] || [];
    } catch {
      const localResult = await chrome.storage.local.get(STORAGE_KEYS.BLOCK_LIST);
      return localResult[STORAGE_KEYS.BLOCK_LIST] || [];
    }
  }

  /**
   * 차단 목록 저장
   */
  public static async saveBlockList(list: BlockItem[]): Promise<void> {
    if (!this.isChromeStorageAvailable()) {
      this.memoryFallback[STORAGE_KEYS.BLOCK_LIST] = list;
      return;
    }

    try {
      await chrome.storage.sync.set({ [STORAGE_KEYS.BLOCK_LIST]: list });
    } catch {
      await chrome.storage.local.set({ [STORAGE_KEYS.BLOCK_LIST]: list });
    }
  }

  /**
   * 단일 차단 항목 추가
   */
  public static async addBlockItem(
    pattern: string,
    type: 'company' | 'keyword',
    memo?: string
  ): Promise<BlockItem> {
    const list = await this.getBlockList();
    const cleanPattern = pattern.trim();

    // 중복 검사
    const existing = list.find(
      (item) => item.type === type && item.pattern.toLowerCase() === cleanPattern.toLowerCase()
    );
    if (existing) {
      return existing;
    }

    const newItem: BlockItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      pattern: cleanPattern,
      type,
      createdAt: Date.now(),
      memo,
    };

    list.push(newItem);
    await this.saveBlockList(list);
    return newItem;
  }

  /**
   * 단일 차단 항목 삭제
   */
  public static async removeBlockItem(id: string): Promise<void> {
    const list = await this.getBlockList();
    const filtered = list.filter((item) => item.id !== id);
    await this.saveBlockList(filtered);
  }
}
