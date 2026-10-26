import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContentController } from '../../src/content';

describe('ContentController 상세 페이지 차단 네비게이션 정책 단위 테스트', () => {
  const mockSendMessage = vi.fn().mockResolvedValue({ success: true });
  const mockHistoryBack = vi.fn();
  const mockWindowClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (globalThis as any).chrome = {
      runtime: {
        sendMessage: mockSendMessage,
        onMessage: {
          addListener: vi.fn(),
        },
      },
    };

    (globalThis as any).window.close = mockWindowClose;
    (globalThis as any).window.history.back = mockHistoryBack;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('히스토리가 존재하는 경우(history.length > 1) 뒤로가기(history.back)를 호출해야 한다', () => {
    Object.defineProperty(window.history, 'length', {
      value: 3,
      configurable: true,
      writable: true,
    });

    const controller = new ContentController();
    controller.navigateBackOrCloseTab();

    expect(mockHistoryBack).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockWindowClose).not.toHaveBeenCalled();
  });

  it('새 페이지/새 탭인 경우(history.length <= 1) CLOSE_CURRENT_TAB 메시지를 전송하여 탭을 닫아야 한다', () => {
    Object.defineProperty(window.history, 'length', {
      value: 1,
      configurable: true,
      writable: true,
    });

    const controller = new ContentController();
    controller.navigateBackOrCloseTab();

    expect(mockHistoryBack).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith({ type: 'CLOSE_CURRENT_TAB' });
  });

  it('새 페이지/새 탭이고 chrome.runtime.sendMessage가 없는 환경인 경우 window.close() 폴백을 호출해야 한다', () => {
    delete (globalThis as any).chrome;
    Object.defineProperty(window.history, 'length', {
      value: 1,
      configurable: true,
      writable: true,
    });

    const controller = new ContentController();
    controller.navigateBackOrCloseTab();

    expect(mockHistoryBack).not.toHaveBeenCalled();
    expect(mockWindowClose).toHaveBeenCalledTimes(1);
  });
});
