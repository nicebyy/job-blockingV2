import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  StorageManager,
  isBlockItem,
  normalizeBlockList,
} from '../../src/core/storage';
import { SYNC_STORAGE_CONFIG } from '../../src/constants';

/**
 * StorageManager 회귀 테스트
 *
 * 배경 1: 모든 변경이 "전체 읽기 → 수정 → 전체 덮어쓰기" 인데 잠금이 없어
 *         동시에 두 항목을 추가하면 하나가 유실되었다.
 * 배경 2: chrome.storage.sync 는 per-item 8KB 제한이 있는데 목록 전체를 단일 키로
 *         저장하고 .catch(() => {}) 로 실패를 삼켜, 공고 30건 내외에서 조용히 실패했다.
 * 배경 3: JSON Import 등으로 손상된 항목([null] 등)이 저장되면
 *         getBlockList() 가 TypeError 를 던져 확장 전체가 정지했다.
 */
describe('StorageManager — 손상 데이터 방어', () => {
  it('isBlockItem 은 유효한 항목만 통과시켜야 한다', () => {
    expect(isBlockItem({ pattern: '카카오', type: 'company' })).toBe(true);
    expect(isBlockItem({ pattern: 'x', type: 'job' })).toBe(true);
    expect(isBlockItem({ pattern: 'x', type: 'keyword' })).toBe(true);

    expect(isBlockItem(null)).toBe(false);
    expect(isBlockItem(undefined)).toBe(false);
    expect(isBlockItem([])).toBe(false);
    expect(isBlockItem('string')).toBe(false);
    expect(isBlockItem({ id: 'x' })).toBe(false); // pattern 없음
    expect(isBlockItem({ pattern: '', type: 'company' })).toBe(false); // 빈 패턴
    expect(isBlockItem({ pattern: 'x', type: 'unknown' })).toBe(false); // 잘못된 type
  });

  it('normalizeBlockList 는 유효 항목만 남기고 누락 필드를 보정해야 한다', () => {
    const result = normalizeBlockList([
      null,
      { id: 'only-id' },
      'not-an-object',
      { pattern: '정상회사', type: 'company' },
      { pattern: '정상공고', type: 'job', createdAt: 123 },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].pattern).toBe('정상회사');
    expect(typeof result[0].id).toBe('string'); // id 보정됨
    expect(typeof result[0].createdAt).toBe('number'); // createdAt 보정됨
    expect(result[1].pattern).toBe('정상공고');
    expect(result[1].createdAt).toBe(123); // 기존 값 유지
  });

  it('normalizeBlockList 는 배열이 아니면 빈 배열을 반환해야 한다', () => {
    expect(normalizeBlockList(null)).toEqual([]);
    expect(normalizeBlockList({})).toEqual([]);
    expect(normalizeBlockList('x')).toEqual([]);
  });
});

describe('StorageManager — 동시 쓰기 직렬화', () => {
  // chrome.storage 비동기 지연을 모사하여 race 를 재현 가능하게 한다
  function installChromeMock(delayMs = 3) {
    const localData: Record<string, any> = {};
    const syncData: Record<string, any> = {};
    const wait = () => new Promise((r) => setTimeout(r, delayMs));

    const makeArea = (data: Record<string, any>) => ({
      get: async (keys: string | string[]) => {
        await wait();
        const out: Record<string, any> = {};
        for (const key of ([] as string[]).concat(keys)) {
          if (key in data) out[key] = data[key];
        }
        return out;
      },
      set: async (obj: Record<string, any>) => {
        await wait();
        Object.assign(data, obj);
      },
      remove: async (keys: string | string[]) => {
        await wait();
        for (const key of ([] as string[]).concat(keys)) delete data[key];
      },
    });

    (globalThis as any).chrome = {
      storage: { local: makeArea(localData), sync: makeArea(syncData) },
    };
    return { localData, syncData };
  }

  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  it('동시에 두 항목을 추가해도 둘 다 저장되어야 한다 (기존에는 1건 유실)', async () => {
    installChromeMock();

    await Promise.all([
      StorageManager.addBlockItem('동시회사A', 'company'),
      StorageManager.addBlockItem('동시회사B', 'company'),
    ]);

    const list = await StorageManager.getBlockList(false);
    const patterns = list.map((i) => i.pattern).sort();
    expect(patterns).toEqual(['동시회사A', '동시회사B']);
  });

  it('동시에 추가와 삭제가 섞여도 목록이 손상되지 않아야 한다', async () => {
    installChromeMock();
    const first = await StorageManager.addBlockItem('기존회사', 'company');

    await Promise.all([
      StorageManager.addBlockItem('신규회사', 'company'),
      StorageManager.removeBlockItem(first.id),
    ]);

    const list = await StorageManager.getBlockList(false);
    const patterns = list.map((i) => i.pattern);
    expect(patterns).toContain('신규회사');
  });
});

describe('StorageManager — sync 청크 분할 저장', () => {
  function installChromeMock() {
    const localData: Record<string, any> = {};
    const syncData: Record<string, any> = {};
    const makeArea = (data: Record<string, any>) => ({
      get: async (keys: string | string[]) => {
        const out: Record<string, any> = {};
        for (const key of ([] as string[]).concat(keys)) {
          if (key in data) out[key] = data[key];
        }
        return out;
      },
      set: async (obj: Record<string, any>) => {
        Object.assign(data, obj);
      },
      remove: async (keys: string | string[]) => {
        for (const key of ([] as string[]).concat(keys)) delete data[key];
      },
    });
    (globalThis as any).chrome = {
      storage: { local: makeArea(localData), sync: makeArea(syncData) },
    };
    return { localData, syncData };
  }

  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  it('항목이 많아도 sync 청크가 per-item 8KB 한도를 넘지 않아야 한다', async () => {
    const { syncData } = installChromeMock();

    const items = Array.from({ length: 60 }, (_, i) => ({
      id: `item_${i}`,
      pattern: `job${i}`,
      type: 'job' as const,
      createdAt: Date.now(),
      title: `백엔드 개발자 포지션 ${i}`,
      companyName: `테스트회사${i}`,
      closingDate: '2026-12-31',
      expiresAt: Date.now() + 90 * 86_400_000,
    }));

    await StorageManager.saveBlockList(items);

    const chunkKeys = Object.keys(syncData).filter(
      (k) => k.startsWith(SYNC_STORAGE_CONFIG.CHUNK_KEY_PREFIX)
    );
    expect(chunkKeys.length).toBeGreaterThan(1); // 실제로 분할되었는지

    const encoder = new TextEncoder();
    for (const key of chunkKeys) {
      const bytes = encoder.encode(JSON.stringify(syncData[key])).length;
      expect(bytes).toBeLessThanOrEqual(SYNC_STORAGE_CONFIG.QUOTA_BYTES_PER_ITEM);
    }
  });

  it('local 이 비어 있어도 sync 청크에서 목록을 복원할 수 있어야 한다', async () => {
    const { localData, syncData } = installChromeMock();
    const items = Array.from({ length: 40 }, (_, i) => ({
      id: `item_${i}`,
      pattern: `회사${i}`,
      type: 'company' as const,
      createdAt: Date.now(),
    }));
    await StorageManager.saveBlockList(items);

    // local 만 초기화 (새 프로필 / 목록 초기화 상황 모사)
    for (const key of Object.keys(localData)) delete localData[key];

    const restored = await StorageManager.getBlockList(false);
    expect(restored).toHaveLength(40);
    // 복원 결과가 sync 에 남아있는지도 확인
    expect(Object.keys(syncData).length).toBeGreaterThan(0);
  });

  it('목록을 모두 삭제하면 sync 에서도 부활하지 않아야 한다', async () => {
    installChromeMock();
    await StorageManager.saveBlockList([
      { id: 'a', pattern: '삭제될회사', type: 'company', createdAt: Date.now() },
    ]);
    await StorageManager.saveBlockList([]);

    const list = await StorageManager.getBlockList(false);
    expect(list).toEqual([]);
  });
});
