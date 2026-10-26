import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Popup } from '../../src/popup/Popup';
import { StorageManager } from '../../src/core/storage';
import { POPUP_STATS_CONFIG } from '../../src/constants';

describe('Popup 팝업 페이지 단위 테스트', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    // 1. 스토리지 초기화
    await StorageManager.saveBlockList([]);

    // 2. chrome API 목(Mock) 설정
    (global as any).chrome = {
      storage: undefined, // StorageManager 메모리 폴백 사용
      runtime: {
        lastError: null,
        openOptionsPage: vi.fn(),
      },
      tabs: {
        query: vi.fn((_queryInfo, callback) => {
          callback([{ id: 101 }]);
        }),
        sendMessage: vi.fn((_tabId, message, callback) => {
          if (message.type === 'GET_PAGE_STATS') {
            callback?.({
              stats: {
                totalBlocked: 5,
                blockedCompanies: 2,
                blockedJobs: 1,
                blockedAds: 2,
              },
            });
          } else {
            callback?.({ success: true });
          }
        }),
      },
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('기본 모드로 전체 등록된 차단 목록 누적 건수가 올바르게 표시되어야 한다', async () => {
    // 회사 2개, 공고 1개, 키워드 1개 등록 (총 4개)
    await StorageManager.addBlockItem('카카오', 'company');
    await StorageManager.addBlockItem('네이버', 'company');
    await StorageManager.addBlockItem('rec_001', 'job', {
      companyName: '당근마켓',
      title: '백엔드 개발자',
    });
    await StorageManager.addBlockItem('파견', 'keyword');

    await act(async () => {
      root.render(<Popup />);
    });

    // 기본 탭이 '전체 등록'인지 확인
    const activeTab = container.querySelector('.stats-tab-btn.active');
    expect(activeTab?.textContent?.trim()).toBe(POPUP_STATS_CONFIG.MODE_LABELS.TOTAL);

    // 통계 항목 확인 (전체 4, 회사 2, 공고 1, 키워드 1)
    const statValues = container.querySelectorAll('.stat-value');
    const statLabels = container.querySelectorAll('.stat-label');

    expect(statLabels[0]?.textContent?.trim()).toBe(POPUP_STATS_CONFIG.TOTAL_LABELS.TOTAL);
    expect(statValues[0]?.textContent?.trim()).toBe('4');

    expect(statLabels[1]?.textContent?.trim()).toBe(POPUP_STATS_CONFIG.TOTAL_LABELS.COMPANIES);
    expect(statValues[1]?.textContent?.trim()).toBe('2');

    expect(statLabels[2]?.textContent?.trim()).toBe(POPUP_STATS_CONFIG.TOTAL_LABELS.JOBS);
    expect(statValues[2]?.textContent?.trim()).toBe('1');

    expect(statLabels[3]?.textContent?.trim()).toBe(POPUP_STATS_CONFIG.TOTAL_LABELS.KEYWORDS);
    expect(statValues[3]?.textContent?.trim()).toBe('1');
  });

  it('빠른 회사 차단 시 전체 차단 건수와 차단 회사 건수가 즉시 실시간 증가해야 한다', async () => {
    await StorageManager.addBlockItem('기존회사', 'company');

    await act(async () => {
      root.render(<Popup />);
    });

    let statValues = container.querySelectorAll('.stat-value');
    expect(statValues[0]?.textContent?.trim()).toBe('1'); // 전체
    expect(statValues[1]?.textContent?.trim()).toBe('1'); // 회사

    // 빠른 추가 인풋 및 폼 제출
    const input = container.querySelector<HTMLInputElement>('.add-input');
    const form = container.querySelector<HTMLFormElement>('.add-form');
    expect(input).not.toBeNull();
    expect(form).not.toBeNull();

    await act(async () => {
      if (input) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        nativeInputValueSetter?.call(input, '신규블랙회사');
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    // 즉시 재집계되어 전체 2, 회사 2로 증가했는지 검증
    statValues = container.querySelectorAll('.stat-value');
    expect(statValues[0]?.textContent?.trim()).toBe('2');
    expect(statValues[1]?.textContent?.trim()).toBe('2');
  });

  it('현재 페이지 탭을 클릭하면 현재 활성 탭의 페이지 통계가 표시되어야 한다', async () => {
    await act(async () => {
      root.render(<Popup />);
    });

    const pageTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.stats-tab-btn')
    ).find((btn) => btn.textContent?.includes(POPUP_STATS_CONFIG.MODE_LABELS.PAGE));

    expect(pageTab).toBeDefined();

    await act(async () => {
      pageTab?.click();
    });

    // 페이지 통계 라벨 및 목 응답 수치 검증
    const statValues = container.querySelectorAll('.stat-value');
    const statLabels = container.querySelectorAll('.stat-label');

    expect(statLabels[0]?.textContent?.trim()).toBe(POPUP_STATS_CONFIG.PAGE_LABELS.TOTAL);
    expect(statValues[0]?.textContent?.trim()).toBe('5');

    expect(statLabels[1]?.textContent?.trim()).toBe(POPUP_STATS_CONFIG.PAGE_LABELS.COMPANIES);
    expect(statValues[1]?.textContent?.trim()).toBe('2');

    expect(statLabels[2]?.textContent?.trim()).toBe(POPUP_STATS_CONFIG.PAGE_LABELS.JOBS);
    expect(statValues[2]?.textContent?.trim()).toBe('1');

    expect(statLabels[3]?.textContent?.trim()).toBe(POPUP_STATS_CONFIG.PAGE_LABELS.ADS);
    expect(statValues[3]?.textContent?.trim()).toBe('2');
  });

  it('현재 페이지가 채용 사이트가 아닐 경우 안내 문구가 노출되어야 한다', async () => {
    // 응답이 없거나 채용 사이트가 아닌 경우
    (global as any).chrome.tabs.sendMessage = vi.fn((_tabId, _msg, callback) => {
      callback?.(null);
    });

    await act(async () => {
      root.render(<Popup />);
    });

    const pageTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.stats-tab-btn')
    ).find((btn) => btn.textContent?.includes(POPUP_STATS_CONFIG.MODE_LABELS.PAGE));

    await act(async () => {
      pageTab?.click();
    });

    const banner = container.querySelector('.not-job-site-banner');
    expect(banner?.textContent?.trim()).toBe(POPUP_STATS_CONFIG.NOT_JOB_SITE_TOOLTIP);
  });

  it('원티드 페이지(wanted.co.kr)에서 팝업으로 빠른 회사 차단 시 platform이 wanted로 저장되어야 한다', async () => {
    (global as any).chrome.tabs.query = vi.fn((_queryInfo, callback) => {
      callback([{ id: 202, url: 'https://www.wanted.co.kr/wdlist/518/872' }]);
    });

    await act(async () => {
      root.render(<Popup />);
    });

    const input = container.querySelector<HTMLInputElement>('.add-input');
    const form = container.querySelector<HTMLFormElement>('.add-form');
    expect(input).not.toBeNull();
    expect(form).not.toBeNull();

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeInputValueSetter?.call(input, '원티드등록기업');
      input?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const list = await StorageManager.getBlockList(false);
    const addedItem = list.find((item) => item.pattern === '원티드등록기업');
    expect(addedItem).toBeDefined();
    expect(addedItem?.platform).toBe('wanted');
  });

  it('리멤버 페이지(rememberapp.co.kr)에서 팝업으로 빠른 회사 차단 시 platform이 remember로 저장되어야 한다', async () => {
    (global as any).chrome.tabs.query = vi.fn((_queryInfo, callback) => {
      callback([{ id: 203, url: 'https://career.rememberapp.co.kr/job/postings' }]);
    });

    await act(async () => {
      root.render(<Popup />);
    });

    const input = container.querySelector<HTMLInputElement>('.add-input');
    const form = container.querySelector<HTMLFormElement>('.add-form');
    expect(input).not.toBeNull();
    expect(form).not.toBeNull();

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeInputValueSetter?.call(input, '리멤버등록기업');
      input?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const list = await StorageManager.getBlockList(false);
    const addedItem = list.find((item) => item.pattern === '리멤버등록기업');
    expect(addedItem).toBeDefined();
    expect(addedItem?.platform).toBe('remember');
  });

  it('점핏 페이지(jumpit.saramin.co.kr)에서 팝업으로 빠른 회사 차단 시 platform이 jumpit으로 저장되어야 한다', async () => {
    (global as any).chrome.tabs.query = vi.fn((_queryInfo, callback) => {
      callback([{ id: 204, url: 'https://jumpit.saramin.co.kr/positions?sort=popular' }]);
    });

    await act(async () => {
      root.render(<Popup />);
    });

    const input = container.querySelector<HTMLInputElement>('.add-input');
    const form = container.querySelector<HTMLFormElement>('.add-form');
    expect(input).not.toBeNull();
    expect(form).not.toBeNull();

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeInputValueSetter?.call(input, '점핏등록기업');
      input?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const list = await StorageManager.getBlockList(false);
    const addedItem = list.find((item) => item.pattern === '점핏등록기업');
    expect(addedItem).toBeDefined();
    expect(addedItem?.platform).toBe('jumpit');
  });

  it('notifyContentScript는 currentWindow 쿼리 실패 시 lastFocusedWindow로 폴백하여 메시지를 전송해야 한다', async () => {
    (global as any).chrome.tabs.query = vi.fn((queryInfo, callback) => {
      if (queryInfo.currentWindow) {
        callback([]); // currentWindow에 탭 없음
      } else if (queryInfo.lastFocusedWindow) {
        callback([{ id: 303, url: 'https://www.wanted.co.kr/wdlist' }]);
      }
    });

    const sendMessageMock = vi.fn();
    (global as any).chrome.tabs.sendMessage = sendMessageMock;

    await act(async () => {
      root.render(<Popup />);
    });

    const input = container.querySelector<HTMLInputElement>('.add-input');
    const form = container.querySelector<HTMLFormElement>('.add-form');
    expect(input).not.toBeNull();
    expect(form).not.toBeNull();

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeInputValueSetter?.call(input, '폴백테스트기업');
      input?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(sendMessageMock).toHaveBeenCalledWith(
      303,
      expect.objectContaining({ type: 'BLOCKLIST_CHANGED' }),
      expect.any(Function)
    );
  });
});
