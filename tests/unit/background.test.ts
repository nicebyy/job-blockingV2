import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateBadge } from '../../src/background';
import { BADGE_CONFIG } from '../../src/constants';

describe('Background Service Worker 단위 테스트', () => {
  const mockSetBadgeText = vi.fn();
  const mockSetBadgeBackgroundColor = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).chrome = {
      action: {
        setBadgeText: mockSetBadgeText,
        setBadgeBackgroundColor: mockSetBadgeBackgroundColor,
      },
    };
  });

  it('BADGE_CONFIG.ENABLED가 false일 때 어떤 차단 카운트가 와도 뱃지 텍스트는 빈 문자열로 설정되어야 한다', () => {
    expect(BADGE_CONFIG.ENABLED).toBe(false);

    // 1. 카운트 133 (99+ 이상)
    const resultLarge = updateBadge(1, 133);
    expect(resultLarge).toBe('');
    expect(mockSetBadgeText).toHaveBeenCalledWith({ tabId: 1, text: '' });
    expect(mockSetBadgeBackgroundColor).not.toHaveBeenCalled();

    // 2. 카운트 50 (일반 숫자)
    const resultNormal = updateBadge(2, 50);
    expect(resultNormal).toBe('');
    expect(mockSetBadgeText).toHaveBeenCalledWith({ tabId: 2, text: '' });

    // 3. 카운트 0
    const resultZero = updateBadge(3, 0);
    expect(resultZero).toBe('');
    expect(mockSetBadgeText).toHaveBeenCalledWith({ tabId: 3, text: '' });
  });
});
