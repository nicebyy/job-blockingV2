import { BlockItem, BlockType, DEFAULT_SETTINGS, FilterSettings, JobPlatform } from '../types';
import { STORAGE_KEYS, SUPPORT_CONFIG, SYNC_STORAGE_CONFIG } from '../constants';
import { isJobExpired } from '../utils/date';
import { normalizeCompanyName } from '../utils/text';

/**
 * 저장된 원본 데이터가 올바른 BlockItem 형태인지 검증하는 타입 가드.
 *
 * JSON Import, 구버전 데이터, 외부에서 주입된 손상 데이터가 그대로 저장되면
 * `item.type` / `item.pattern` 접근 시 TypeError가 발생하여
 * 팝업·옵션·content script가 모두 정지한다. 이를 원천 차단한다.
 */
export function isBlockItem(value: unknown): value is BlockItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const item = value as Partial<BlockItem>;
  return (
    typeof item.pattern === 'string' &&
    item.pattern.trim().length > 0 &&
    (item.type === 'company' || item.type === 'job' || item.type === 'keyword')
  );
}

/**
 * 임의 배열을 유효한 BlockItem 배열로 정규화한다.
 * - 배열이 아니면 빈 배열
 * - 유효하지 않은 원소는 제외
 * - 누락된 id/createdAt 은 보정
 */
export function normalizeBlockList(value: unknown): BlockItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: BlockItem[] = [];
  for (const raw of value) {
    if (!isBlockItem(raw)) continue;
    const item = raw as BlockItem;
    if (!item.id || typeof item.id !== 'string') {
      item.id = `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    if (typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt)) {
      item.createdAt = Date.now();
    }
    result.push(item);
  }
  return result;
}

export class StorageManager {
  private static memoryFallback: Record<string, any> = {
    [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS,
    [STORAGE_KEYS.BLOCK_LIST]: [],
  };

  /**
   * 같은 컨텍스트(탭/팝업/옵션) 안에서의 read-modify-write 를 직렬화하는 체인.
   *
   * 모든 쓰기 경로가 "전체 목록 읽기 → 메모리 수정 → 전체 덮어쓰기" 이므로,
   * 동시에 두 작업이 겹치면 나중에 쓴 쪽이 먼저 쓴 항목을 덮어써 유실된다.
   * 이 체인으로 같은 컨텍스트 내부의 쓰기를 순차 실행한다.
   */
  private static writeChain: Promise<unknown> = Promise.resolve();

  private static withLock<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.writeChain.then(fn, fn);
    // 체인이 rejection 으로 끊기지 않도록 항상 resolve 상태로 이어준다
    this.writeChain = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

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
   * 차단 목록 조회
   *
   * 주의: 읽기 경로에서 저장(자동 정리)을 수행하면 동시 쓰기와 충돌하여
   * 방금 추가한 항목까지 유실될 수 있다. 따라서 기본값은 autoClean = false 이며,
   * 자동 정리는 옵션/팝업의 명시적 호출(purgeExpiredJobs)에서만 수행한다.
   *
   * @param autoClean true 인 경우 만료 항목을 제거하고 저장한다 (기존 호환용)
   */
  public static async getBlockList(autoClean: boolean = false): Promise<BlockItem[]> {
    let rawList: unknown = [];

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
        // local 이 비어 있고 sync 에 데이터가 있으면 폴백 복원 (분할 저장분 포함)
        const localEmpty = normalizeBlockList(rawList).length === 0;
        if (localEmpty && chrome.storage.sync) {
          const syncList = await this.readSyncChunks();
          if (syncList.length > 0) {
            rawList = syncList;
            if (chrome.storage.local) {
              await chrome.storage.local.set({
                [STORAGE_KEYS.BLOCK_LIST]: normalizeBlockList(syncList),
              });
            }
          }
        }
      } catch {
        rawList = this.memoryFallback[STORAGE_KEYS.BLOCK_LIST] || [];
      }
    }

    // 손상/구버전 데이터를 항상 정규화하여 이후 item.type 접근에서 TypeError가 나지 않게 한다
    const normalizedList = normalizeBlockList(rawList);

    if (!autoClean) {
      return normalizedList;
    }

    // 만료된 공고 자동 정리
    const { cleanedList, purgedCount } = this.filterExpiredItems(normalizedList);
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
   *
   * 읽기-수정-쓰기를 하나의 잠금 안에서 수행해, 정리 도중 추가된 항목이
   * 유실되지 않도록 한다.
   */
  public static async purgeExpiredJobs(): Promise<number> {
    return this.withLock(async () => {
      const rawList = await this.getBlockList(false);
      const { cleanedList, purgedCount } = this.filterExpiredItems(rawList);
      if (purgedCount > 0) {
        await this.saveBlockListUnlocked(cleanedList);
      }
      return purgedCount;
    });
  }

  /**
   * 차단 목록 저장
   *
   * 동시 쓰기 유실을 막기 위해 withLock 으로 직렬화하고,
   * sync 는 per-item 8KB 한도를 넘지 않도록 청크로 분할 저장한다.
   *
   * 주의: 이미 잠금을 보유한 내부 경로(addBlockItem 등)에서는
   * saveBlockListUnlocked 를 사용해야 교착(deadlock)이 발생하지 않는다.
   */
  public static async saveBlockList(list: BlockItem[]): Promise<void> {
    return this.withLock(() => this.saveBlockListUnlocked(list));
  }

  /**
   * 잠금 없이 차단 목록을 저장한다. 호출자가 이미 withLock 을 보유한 경우에만 사용한다.
   */
  private static async saveBlockListUnlocked(list: BlockItem[]): Promise<void> {
    // undefined 속성을 안전하게 정제하여 chrome.storage 직렬화 에러 원천 차단
    const sanitized: BlockItem[] = normalizeBlockList(JSON.parse(JSON.stringify(list)));

    if (!this.isChromeStorageAvailable()) {
      this.memoryFallback[STORAGE_KEYS.BLOCK_LIST] = sanitized;
      return;
    }

    try {
      if (chrome.storage.local) {
        await chrome.storage.local.set({ [STORAGE_KEYS.BLOCK_LIST]: sanitized });
      }
      if (chrome.storage.sync) {
        await this.writeSyncChunks(sanitized);
      }
    } catch {
      this.memoryFallback[STORAGE_KEYS.BLOCK_LIST] = sanitized;
    }
  }

  /**
   * 차단 목록을 sync 용량 한도(per-item 8KB)에 맞춰 청크로 분할 저장한다.
   * 실패는 조용히 삼키지 않고 경고를 남긴다.
   */
  private static async writeSyncChunks(list: BlockItem[]): Promise<void> {
    if (!chrome.storage?.sync) return;

    const budget = Math.floor(
      SYNC_STORAGE_CONFIG.QUOTA_BYTES_PER_ITEM * SYNC_STORAGE_CONFIG.SAFETY_MARGIN_RATIO
    );

    const chunks: BlockItem[][] = [];
    let current: BlockItem[] = [];
    let currentBytes = 0;

    for (const item of list) {
      const itemBytes = new TextEncoder().encode(JSON.stringify(item)).length;
      // 현재 청크에 넣으면 한도를 넘고, 청크가 비어있지 않다면 새 청크로 분리
      if (current.length > 0 && currentBytes + itemBytes > budget) {
        chunks.push(current);
        current = [];
        currentBytes = 0;
      }
      current.push(item);
      currentBytes += itemBytes;
    }
    if (current.length > 0) {
      chunks.push(current);
    }

    // 이전 청크 잔여분 정리 후 새로 기록
    await this.clearSyncChunks();

    const payload: Record<string, unknown> = {
      [SYNC_STORAGE_CONFIG.CHUNK_COUNT_KEY]: chunks.length,
    };
    chunks.forEach((chunk, index) => {
      payload[`${SYNC_STORAGE_CONFIG.CHUNK_KEY_PREFIX}${index}`] = chunk;
    });

    // 목록이 비면 count=0 만 남기고 종료 (삭제 상태가 sync 에 반영됨)
    try {
      await chrome.storage.sync.set(payload);
    } catch (err) {
      console.warn('[JobFilter] sync 저장 실패 — 로컬에만 저장됩니다:', err);
    }
  }

  /**
   * sync 에 분할 저장된 청크를 읽어 하나의 목록으로 복원한다.
   * 구버전 단일 키 저장 방식도 함께 지원한다.
   */
  private static async readSyncChunks(): Promise<BlockItem[]> {
    if (!chrome.storage?.sync) return [];

    try {
      // 1. 구버전 단일 키 우선 확인
      const single = await chrome.storage.sync.get(STORAGE_KEYS.BLOCK_LIST);
      const legacy = single[STORAGE_KEYS.BLOCK_LIST];
      if (legacy && normalizeBlockList(legacy).length > 0) {
        return normalizeBlockList(legacy);
      }

      // 2. 청크 방식 확인
      const countResult = await chrome.storage.sync.get(SYNC_STORAGE_CONFIG.CHUNK_COUNT_KEY);
      const count = Number(countResult[SYNC_STORAGE_CONFIG.CHUNK_COUNT_KEY] || 0);
      if (!Number.isFinite(count) || count <= 0) {
        return [];
      }

      const keys = Array.from(
        { length: Math.min(count, SYNC_STORAGE_CONFIG.MAX_ITEMS) },
        (_, i) => `${SYNC_STORAGE_CONFIG.CHUNK_KEY_PREFIX}${i}`
      );
      const chunkResult = await chrome.storage.sync.get(keys);

      const merged: unknown[] = [];
      for (const key of keys) {
        const chunk = chunkResult[key];
        if (Array.isArray(chunk)) {
          merged.push(...chunk);
        }
      }
      return normalizeBlockList(merged);
    } catch {
      return [];
    }
  }

  /**
   * sync 에 기록된 기존 청크 키를 제거한다.
   * (목록이 줄어들 때 이전 청크가 남아 부활하는 것을 방지)
   */
  private static async clearSyncChunks(): Promise<void> {
    if (!chrome.storage?.sync) return;
    try {
      const countResult = await chrome.storage.sync.get(SYNC_STORAGE_CONFIG.CHUNK_COUNT_KEY);
      const count = Number(countResult[SYNC_STORAGE_CONFIG.CHUNK_COUNT_KEY] || 0);
      const keys: string[] = [STORAGE_KEYS.BLOCK_LIST];
      if (Number.isFinite(count) && count > 0) {
        for (let i = 0; i < Math.min(count, SYNC_STORAGE_CONFIG.MAX_ITEMS); i++) {
          keys.push(`${SYNC_STORAGE_CONFIG.CHUNK_KEY_PREFIX}${i}`);
        }
      }
      await chrome.storage.sync.remove(keys);
    } catch {
      // 정리 실패는 치명적이지 않음
    }
  }

  /**
   * 단일 차단 항목 추가 (회사, 키워드, 또는 특정 공고)
   *
   * 읽기-수정-쓰기 전체를 withLock 으로 감싸 동시 추가 시 유실을 방지한다.
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
    return this.withLock(() => this.addBlockItemUnlocked(pattern, type, metadata));
  }

  private static async addBlockItemUnlocked(
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

    // 중복 검사 (패턴 일치, 회사명 정규화 일치, 또는 공고의 경우 회사명+공고제목 일치 여부 다층 검증)
    const existingIndex = list.findIndex((item) => {
      if (item.type !== type) return false;
      // 1. 단순 pattern 동일 여부 (jobId 또는 회사명/키워드, 대소문자 무시)
      if (item.pattern.toLowerCase() === cleanPattern.toLowerCase()) return true;

      // 2. 회사(company) 타입의 경우: 회사명 정규화(주식회사, (주), 공백 제거) 일치 여부 검증
      if (type === 'company') {
        const normClean = normalizeCompanyName(cleanPattern);
        const normExisting = normalizeCompanyName(item.pattern);
        if (normClean.length > 0 && normClean === normExisting) {
          return true;
        }
      }

      // 3. 공고(job) 타입의 경우: pattern 형태가 다르더라도(예: 하나는 jobId, 하나는 company:::title)
      // 회사명(정규화)과 공고 제목이 동일하면 동일한 공고로 판별하여 중복 방지
      if (
        type === 'job' &&
        metadata?.companyName &&
        metadata?.title &&
        item.companyName &&
        item.title &&
        normalizeCompanyName(item.companyName) === normalizeCompanyName(metadata.companyName) &&
        item.title.trim().toLowerCase() === metadata.title.trim().toLowerCase()
      ) {
        return true;
      }
      return false;
    });

    if (existingIndex !== -1) {
      const existing = list[existingIndex];
      let needsSave = false;

      // 회사(company) 타입인 경우: 기존 패턴에 (주)/주식회사 등이 있고 새 패턴이 더 간결한 경우 간결한 패턴으로 개선
      if (type === 'company') {
        const normClean = normalizeCompanyName(cleanPattern);
        const normExisting = normalizeCompanyName(existing.pattern);
        if (normClean === normExisting) {
          const existingHasAffix = /[㈜(주)주식회사]/.test(existing.pattern);
          const cleanHasAffix = /[㈜(주)주식회사]/.test(cleanPattern);
          if (existingHasAffix && !cleanHasAffix) {
            existing.pattern = cleanPattern;
            needsSave = true;
          }
        }
      }

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
      if (metadata?.platform && (!existing.platform || existing.platform === 'custom')) {
        if (existing.platform !== metadata.platform) {
          existing.platform = metadata.platform;
          needsSave = true;
        }
      }
      if (needsSave) {
        await this.saveBlockListUnlocked(list);
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
    await this.saveBlockListUnlocked(list);
    return newItem;
  }


  /**
   * 단일 차단 항목 삭제
   */
  public static async removeBlockItem(id: string): Promise<void> {
    return this.withLock(async () => {
      const list = await this.getBlockList(false);
      const filtered = list.filter((item) => item.id !== id);
      await this.saveBlockListUnlocked(filtered);
    });
  }

  /**
   * 리뷰 유도 배너 숨김 여부 확인
   */
  public static async isRatingBannerDismissed(): Promise<boolean> {
    if (!this.isChromeStorageAvailable()) {
      return Boolean(this.memoryFallback[SUPPORT_CONFIG.STORAGE_KEYS.DISMISS_RATING_BANNER]);
    }
    try {
      if (chrome.storage.local) {
        const res = await chrome.storage.local.get(SUPPORT_CONFIG.STORAGE_KEYS.DISMISS_RATING_BANNER);
        return Boolean(res[SUPPORT_CONFIG.STORAGE_KEYS.DISMISS_RATING_BANNER]);
      }
    } catch {
      // fallback
    }
    return Boolean(this.memoryFallback[SUPPORT_CONFIG.STORAGE_KEYS.DISMISS_RATING_BANNER]);
  }

  /**
   * 리뷰 유도 배너 숨김 처리 (더 이상 표시하지 않음)
   */
  public static async dismissRatingBanner(): Promise<void> {
    if (!this.isChromeStorageAvailable()) {
      this.memoryFallback[SUPPORT_CONFIG.STORAGE_KEYS.DISMISS_RATING_BANNER] = true;
      return;
    }
    try {
      if (chrome.storage.local) {
        await chrome.storage.local.set({ [SUPPORT_CONFIG.STORAGE_KEYS.DISMISS_RATING_BANNER]: true });
      }
    } catch {
      this.memoryFallback[SUPPORT_CONFIG.STORAGE_KEYS.DISMISS_RATING_BANNER] = true;
    }
  }
}

