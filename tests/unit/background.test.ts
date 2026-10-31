import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateBadge, handleBackgroundMessage, handleInstalled } from '../../src/background';
import { BADGE_CONFIG, WELCOME_CONFIG } from '../../src/constants';

describe('Background Service Worker 단위 테스트', () => {
  const mockSetBadgeText = vi.fn();
  const mockSetBadgeBackgroundColor = vi.fn();
  const mockTabsRemove = vi.fn().mockResolvedValue(undefined);
  const mockTabsCreate = vi.fn().mockResolvedValue({});
  const mockGetURL = vi.fn((path: string) => `chrome-extension://test-ext-id/${path}`);

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).chrome = {
      action: {
        setBadgeText: mockSetBadgeText,
        setBadgeBackgroundColor: mockSetBadgeBackgroundColor,
      },
      tabs: {
        remove: mockTabsRemove,
        create: mockTabsCreate,
      },
      runtime: {
        getURL: mockGetURL,
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

  it('CLOSE_CURRENT_TAB 메시지 수신 시 sender.tab.id를 통해 chrome.tabs.remove를 호출하여 탭을 닫아야 한다', () => {
    const sendResponse = vi.fn();
    const sender = { tab: { id: 777 } } as any;

    const result = handleBackgroundMessage({ type: 'CLOSE_CURRENT_TAB' }, sender, sendResponse);

    expect(result).toBe(true);
    expect(mockTabsRemove).toHaveBeenCalledWith(777);
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it('확장 프로그램 최초 설치(reason: install) 시 웰컴/사용 가이드 탭을 자동으로 열어야 한다', () => {
    handleInstalled({ reason: 'install' } as chrome.runtime.InstalledDetails);

    expect(mockGetURL).toHaveBeenCalledWith(WELCOME_CONFIG.PAGE_PATH);
    expect(mockTabsCreate).toHaveBeenCalledWith({
      url: `chrome-extension://test-ext-id/${WELCOME_CONFIG.PAGE_PATH}`,
    });
  });

  it('확장 프로그램 업데이트(reason: update) 시에는 웰컴 탭을 중복으로 열지 않아야 한다', () => {
    handleInstalled({ reason: 'update', previousVersion: '0.2.3' } as chrome.runtime.InstalledDetails);

    expect(mockTabsCreate).not.toHaveBeenCalled();
  });
});

