import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { Welcome } from '../../src/welcome/Welcome';
import { WELCOME_CONFIG, INLINE_BUTTON_CONFIG } from '../../src/constants';

describe('Welcome (온보딩 및 사용 가이드) 컴포넌트 테스트', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    (globalThis as any).chrome = {
      runtime: {
        openOptionsPage: vi.fn(),
        getURL: vi.fn((p: string) => `chrome-extension://id/${p}`),
      },
    };
  });

  it('환영 타이틀, 4단계 핵심 가이드, 5대 채용 플랫폼 바로가기 링크가 정상 렌더링되어야 한다', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<Welcome />);
    });

    expect(container.textContent).toContain(WELCOME_CONFIG.LABELS.HERO_TITLE);
    expect(container.textContent).toContain(WELCOME_CONFIG.LABELS.PIN_TIP_TITLE);

    for (const step of WELCOME_CONFIG.STEPS) {
      expect(container.textContent).toContain(step.title);
    }

    const platformLinks = container.querySelectorAll('.platform-card');
    expect(platformLinks.length).toBe(WELCOME_CONFIG.PLATFORMS.length);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('인터랙티브 데모 카드의 [공고숨김] 및 [회사차단] 클릭 시 블러 체험 상태와 초기화 버튼이 동작해야 한다', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<Welcome />);
    });

    const demoCard = container.querySelector('.demo-job-card') as HTMLElement;
    expect(demoCard.classList.contains('is-blocked')).toBe(false);

    const hideBtn = container.querySelector('.demo-btn-hide') as HTMLButtonElement;
    expect(hideBtn.textContent).toBe(INLINE_BUTTON_CONFIG.LABELS.HIDE_JOB);

    await act(async () => {
      hideBtn.click();
    });

    expect(demoCard.classList.contains('is-blocked')).toBe(true);
    expect(container.textContent).toContain(WELCOME_CONFIG.LABELS.DEMO_BLOCKED_MSG);

    const resetBtn = container.querySelector('.demo-reset-inline-btn') as HTMLButtonElement;
    await act(async () => {
      resetBtn.click();
    });

    expect(demoCard.classList.contains('is-blocked')).toBe(false);

    const openOptionsBtn = container.querySelector('.btn-open-options') as HTMLButtonElement;
    await act(async () => {
      openOptionsBtn.click();
    });
    expect((globalThis as any).chrome.runtime.openOptionsPage).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
