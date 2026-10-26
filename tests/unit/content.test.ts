import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ContentController } from '../../src/content';
import { StorageManager } from '../../src/core/storage';

describe('ContentController 원티드 필터링 및 카운팅 단위 테스트', () => {
  let originalLocation: Location;

  beforeEach(async () => {
    await StorageManager.saveBlockList([]);
    await StorageManager.saveSettings({
      mode: 'hide',
      hideAds: true,
      enableInfiniteScroll: false,
      showJobplanetRating: false,
      showBlindRating: false,
    });

    originalLocation = window.location;
    delete (window as any).location;
    (window as any).location = new URL('https://www.wanted.co.kr/wdlist/518/872');

    (global as any).chrome = {
      storage: undefined,
      runtime: {
        lastError: null,
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        sendMessage: vi.fn((_msg, callback) => callback?.()),
      },
    };

    const fixturePath = path.resolve(__dirname, '../fixtures/wanted_wdlist.html');
    const rawHtml = fs.readFileSync(fixturePath, 'utf-8');
    const cleanHtml = rawHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
    document.body.innerHTML = cleanHtml;
  });

  afterEach(() => {
    (window as any).location = originalLocation;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('원티드 페이지 초기화 시 광고 배너(적극 채용 중인 회사)가 숨김 처리되고 통계에 반영되어야 한다', async () => {
    const controller = new ContentController();
    await controller.init();

    // 1. 프로모션 섹션 숨김 여부 확인
    const adSection = document.querySelector('section[class*="AdTargetList_"]') as HTMLElement;
    expect(adSection).not.toBeNull();
    expect(adSection.style.display).toBe('none');
    expect(adSection.getAttribute('data-job-filtered')).toBe('true');
    expect(adSection.getAttribute('data-filter-mode')).toBe('hide');
    expect(adSection.getAttribute('data-blocked-type')).toBe('ad');

    // 2. 메시지 리스너를 통해 GET_PAGE_STATS 요청 시뮬레이션
    let pageStats: any = null;
    const addListenerMock = (global as any).chrome.runtime.onMessage.addListener;
    expect(addListenerMock).toHaveBeenCalled();
    const messageHandler = addListenerMock.mock.calls[0][0];

    messageHandler({ type: 'GET_PAGE_STATS' }, {}, (response: any) => {
      pageStats = response?.stats;
    });

    expect(pageStats).toBeDefined();
    expect(pageStats.blockedAds).toBeGreaterThanOrEqual(1);
    expect(pageStats.totalBlocked).toBeGreaterThanOrEqual(1);
  });

  it('원티드에서 회사를 차단하면 blockedCompanies와 totalBlocked가 증가하고 GET_PAGE_STATS에 반영되어야 한다', async () => {
    // fixture에 존재하는 회사 '미리디' 차단 등록
    await StorageManager.addBlockItem('미리디', 'company', { platform: 'wanted' });

    const controller = new ContentController();
    await controller.init();

    let pageStats: any = null;
    const addListenerMock = (global as any).chrome.runtime.onMessage.addListener;
    const messageHandler = addListenerMock.mock.calls[0][0];

    messageHandler({ type: 'GET_PAGE_STATS' }, {}, (response: any) => {
      pageStats = response?.stats;
    });

    expect(pageStats).toBeDefined();
    expect(pageStats.blockedCompanies).toBe(1);
    // 프로모션 광고 1개 + 회사 차단 공고들이 합산되어 totalBlocked에 반영됨
    expect(pageStats.totalBlocked).toBeGreaterThan(1);
  });
});
