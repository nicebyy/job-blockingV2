import { vi } from 'vitest';

/**
 * 통합 테스트용 chrome API 목.
 *
 * ContentController 는 chrome.storage / chrome.runtime 을 사용하므로
 * 실제 확장 환경과 유사한 최소 목을 제공한다.
 * storage 는 실제로 값을 저장/조회할 수 있게 메모리 기반으로 구현한다.
 */
export interface MockChromeResult {
  chrome: any;
  /** 내부 저장소 상태 (검증용) */
  storageData: Record<string, any>;
  /** runtime.sendMessage 호출 기록 */
  sendMessageCalls: Array<{ type?: string; [key: string]: any }>;
}

export function createMockChrome(): MockChromeResult {
  const storageData: Record<string, any> = {};
  const sendMessageCalls: Array<{ type?: string; [key: string]: any }> = [];

  const makeArea = (data: Record<string, any>) => ({
    get: (keys: string | string[] | null, callback?: (items: any) => void) => {
      const result: Record<string, any> = {};
      const keyList =
        keys === null || keys === undefined
          ? Object.keys(data)
          : ([] as string[]).concat(keys as any);
      for (const key of keyList) {
        if (key in data) result[key] = data[key];
      }
      if (callback) {
        callback(result);
        return undefined;
      }
      return Promise.resolve(result);
    },
    set: (items: Record<string, any>, callback?: () => void) => {
      Object.assign(data, items);
      if (callback) {
        callback();
        return undefined;
      }
      return Promise.resolve();
    },
    remove: (keys: string | string[], callback?: () => void) => {
      for (const key of ([] as string[]).concat(keys as any)) delete data[key];
      if (callback) {
        callback();
        return undefined;
      }
      return Promise.resolve();
    },
    clear: (callback?: () => void) => {
      for (const key of Object.keys(data)) delete data[key];
      if (callback) {
        callback();
        return undefined;
      }
      return Promise.resolve();
    },
  });

  const listeners: Array<(...args: any[]) => void> = [];

  const chrome = {
    storage: {
      local: makeArea(storageData),
      sync: makeArea({}),
    },
    runtime: {
      id: 'mock-extension-id',
      lastError: null,
      onMessage: {
        addListener: vi.fn((fn: (...args: any[]) => void) => {
          listeners.push(fn);
        }),
        removeListener: vi.fn((fn: (...args: any[]) => void) => {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        }),
      },
      sendMessage: vi.fn((message: any, callback?: (response?: any) => void) => {
        sendMessageCalls.push(message);
        if (typeof callback === 'function') {
          callback(undefined);
          return undefined;
        }
        return Promise.resolve(undefined);
      }),
      openOptionsPage: vi.fn(),
    },
    tabs: {
      query: vi.fn((_info: any, callback: (tabs: any[]) => void) => callback([])),
      sendMessage: vi.fn((_tabId: any, _msg: any, callback?: (r?: any) => void) => {
        if (typeof callback === 'function') callback(undefined);
      }),
      remove: vi.fn(() => Promise.resolve()),
    },
    action: {
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
    },
  };

  return { chrome, storageData, sendMessageCalls };
}
