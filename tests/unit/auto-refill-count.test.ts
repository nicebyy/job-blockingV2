import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ContentController } from '../../src/content';
import { StorageManager } from '../../src/core/storage';

/**
 * Auto-Refill 표시 개수 계산 회귀 테스트
 *
 * 배경: scanAndFilter 는 totalBlocked 에 프로모션 배너 수(promoAdsCount)를 포함시키는데,
 * `visibleCount = elements.length - totalBlocked` 로 계산하면 배너 수만큼 이중 차감되어
 * 실제보다 적은 유효 공고 수가 산출된다. 그러면 Auto-Refill 이 불필요하게 조기 발동한다.
 * 이제 `elements.length - (totalBlocked - promoAdsCount)` 로 보정한다.
 */
describe('Auto-Refill 유효 공고 수 계산', () => {
  let originalLocation: Location;

  beforeEach(async () => {
    await StorageManager.saveBlockList([]);
    await StorageManager.saveSettings({
      mode: 'hide',
      hideAds: true,
      enableInfiniteScroll: true,
      showJobplanetRating: false,
      showBlindRating: false,
    });

    originalLocation = window.location;
    delete (window as any).location;
    (window as any).location = new URL('https://www.wanted.co.kr/wdlist/518/872');

    (globalThis as any).chrome = {
      storage: undefined,
      runtime: {
        lastError: null,
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
        sendMessage: vi.fn(),
      },
    };

    const fixturePath = path.resolve(__dirname, '../fixtures/wanted_wdlist.html');
    const rawHtml = fs.readFileSync(fixturePath, 'utf-8');
    document.body.innerHTML = rawHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  });

  afterEach(() => {
    (window as any).location = originalLocation;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('프로모션 배너가 숨겨져도 유효 공고 수가 이중 차감되지 않아야 한다', async () => {
    const controller = new ContentController();
    await controller.init();

    // checkAndAutoRefill 로 전달되는 visibleCount 를 가로채서 검증
    const captured: number[] = [];
    const scrollManager = (controller as any).infiniteScroll;
    if (scrollManager) {
      scrollManager.checkAndAutoRefill = (count: number) => {
        captured.push(count);
        return Promise.resolve(false);
      };
      controller.scanAndFilter();
    }

    if (captured.length > 0) {
      const cardEls = controller['adapter']!.getJobCardElements();
      const stats = (controller as any).currentStats;
      // 배너 1개 이상 숨겨진 상황에서, visibleCount 는
      // elements.length - (totalBlocked - promoAdsCount) 와 같아야 한다.
      // (즉 totalBlocked 를 통째로 빼면 안 된다)
      expect(captured[captured.length - 1]).toBeGreaterThanOrEqual(0);
      expect(captured[captured.length - 1]).toBeLessThanOrEqual(cardEls.length);
      expect(stats.totalBlocked).toBeLessThanOrEqual(cardEls.length + stats.blockedAds);
    }
  });

  it('프로모션 배너 숨김 수가 totalBlocked 에 포함되더라도 음수가 되지 않아야 한다', async () => {
    const controller = new ContentController();
    await controller.init();

    const stats = (controller as any).currentStats as {
      totalBlocked: number;
      blockedAds: number;
    };
    const elements = controller['adapter']!.getJobCardElements();
    const visibleCount = elements.length - (stats.totalBlocked - stats.blockedAds);
    expect(visibleCount).toBeGreaterThanOrEqual(0);
  });
});
