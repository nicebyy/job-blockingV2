import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Options } from '../../src/options/Options';
import { StorageManager } from '../../src/core/storage';
import { UI_MESSAGES } from '../../src/constants';
import { BlockItem } from '../../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * [UX 회귀] 옵션 페이지 액션 툴바 위치 및 만료 공고 정리 버튼
 *
 * 배경:
 *   [만료 공고 정리] 버튼이 차단 목록 "아래"에 있었다. 공고를 수백~수천 개
 *   차단한 사용자는 버튼을 누르려면 목록 끝까지 스크롤해야 했고,
 *   버튼을 누르기 전에는 정리 대상이 몇 개인지 알 수 없었다.
 *
 *   → 툴바를 목록 "위"로 옮기고, 만료 개수를 버튼에 표시한다.
 *
 * 이 테스트는 DOM 순서(레이아웃)를 실제로 검증하므로, 누군가 툴바를 다시
 * 목록 아래로 되돌리면 즉시 실패한다.
 */
describe('[UX 회귀] 옵션 페이지 액션 툴바는 차단 목록 위에 있어야 한다', () => {
  let container: HTMLDivElement;
  let root: Root;

  /** 만료된 공고 1건 + 유효한 공고 1건 + 회사 1건 */
  const seedMixedList = async () => {
    const now = Date.now();
    const list: BlockItem[] = [
      {
        id: 'expired-1',
        pattern: 'job_expired_1',
        type: 'job',
        createdAt: now - 40 * 24 * 60 * 60 * 1000,
        platform: 'jobkorea',
        title: '이미 마감된 공고',
        companyName: '만료회사',
        // 마감 후 30일이 지나 만료된 상태
        expiresAt: now - 5 * 24 * 60 * 60 * 1000,
      },
      {
        id: 'active-1',
        pattern: 'job_active_1',
        type: 'job',
        createdAt: now,
        platform: 'jobkorea',
        title: '아직 유효한 공고',
        companyName: '유효회사',
        expiresAt: now + 20 * 24 * 60 * 60 * 1000,
      },
      {
        id: 'company-1',
        pattern: '테스트차단회사',
        type: 'company',
        createdAt: now,
        platform: 'saramin',
      },
    ];
    await StorageManager.saveBlockList(list);
    return list;
  };

  beforeEach(async () => {
    await StorageManager.saveBlockList([]);
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

  it('액션 툴바(.action-bar)가 차단 목록(.block-list)보다 앞(위)에 위치해야 한다', async () => {
    await seedMixedList();

    await act(async () => {
      root.render(<Options />);
    });

    const actionBar = container.querySelector('.action-bar');
    const blockList = container.querySelector('.block-list');

    expect(actionBar, '.action-bar 가 렌더링되지 않음').not.toBeNull();
    expect(blockList, '.block-list 가 렌더링되지 않음').not.toBeNull();

    // DOM 순서 비교: action-bar 가 block-list 보다 앞서야 한다
    // (Node.DOCUMENT_POSITION_FOLLOWING = 4 → blockList 가 actionBar 뒤에 있음)
    const relation = actionBar!.compareDocumentPosition(blockList!);
    expect(
      Boolean(relation & Node.DOCUMENT_POSITION_FOLLOWING),
      '액션 툴바가 차단 목록보다 아래에 있음 (스크롤 끝까지 내려야 버튼에 도달)'
    ).toBe(true);

    // 목록 아래에는 더 이상 툴바가 없어야 한다 (중복 배치 방지)
    expect(container.querySelectorAll('.action-bar').length).toBe(1);
  });

  it('만료된 공고가 있으면 정리 버튼에 만료 개수가 표시되어야 한다', async () => {
    await seedMixedList();

    await act(async () => {
      root.render(<Options />);
    });

    const purgeBtn = container.querySelector<HTMLButtonElement>('.btn-purge');
    expect(purgeBtn).not.toBeNull();

    // 만료 1건이므로 개수가 노출되어야 한다
    expect(purgeBtn!.textContent).toContain('만료 공고');
    expect(purgeBtn!.textContent).toContain('1');
    expect(purgeBtn!.textContent).toBe(UI_MESSAGES.PURGE_EXPIRED_BUTTON_WITH_COUNT(1));

    // 만료 항목이 있으므로 강조 클래스가 적용되어야 한다
    expect(purgeBtn!.classList.contains('has-expired')).toBe(true);
  });

  it('만료된 공고가 없으면 개수 없이 기본 라벨과 안내 툴팁을 보여야 한다', async () => {
    await StorageManager.saveBlockList([
      {
        id: 'company-only',
        pattern: '만료없는회사',
        type: 'company',
        createdAt: Date.now(),
      },
    ]);

    await act(async () => {
      root.render(<Options />);
    });

    const purgeBtn = container.querySelector<HTMLButtonElement>('.btn-purge');
    expect(purgeBtn).not.toBeNull();
    expect(purgeBtn!.textContent).toBe(UI_MESSAGES.PURGE_EXPIRED_BUTTON);
    expect(purgeBtn!.classList.contains('has-expired')).toBe(false);
    expect(purgeBtn!.title).toBe(UI_MESSAGES.PURGE_EXPIRED_TOOLTIP(0));
  });

  it('정리 버튼을 누르면 만료 공고만 삭제되고 버튼 라벨이 즉시 갱신되어야 한다', async () => {
    await seedMixedList();
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);

    await act(async () => {
      root.render(<Options />);
    });

    const purgeBtn = container.querySelector<HTMLButtonElement>('.btn-purge')!;
    expect(purgeBtn.textContent).toContain('1');

    await act(async () => {
      purgeBtn.click();
    });
    // 비동기 정리 완료 대기
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(alertMock).toHaveBeenCalledWith(UI_MESSAGES.PURGE_EXPIRED_SUCCESS(1));

    // 저장소에서 만료 항목만 제거되고 나머지는 유지
    const remaining = await StorageManager.getBlockList();
    expect(remaining.length).toBe(2);
    expect(remaining.map((i) => i.id)).not.toContain('expired-1');
    expect(remaining.map((i) => i.id)).toContain('active-1');
    expect(remaining.map((i) => i.id)).toContain('company-1');

    // 버튼 라벨이 갱신되어 만료 0건 상태로 돌아가야 한다
    const updatedBtn = container.querySelector<HTMLButtonElement>('.btn-purge')!;
    expect(updatedBtn.textContent).toBe(UI_MESSAGES.PURGE_EXPIRED_BUTTON);
    expect(updatedBtn.classList.contains('has-expired')).toBe(false);
  });

  it('목록이 비어 있어도 액션 툴바는 항상 렌더링되어야 한다', async () => {
    await act(async () => {
      root.render(<Options />);
    });

    expect(container.querySelector('.empty-state')).not.toBeNull();
    expect(container.querySelector('.action-bar')).not.toBeNull();
    expect(container.querySelector('.btn-purge')).not.toBeNull();
  });

  it('내보내기/가져오기 버튼이 툴바에 함께 유지되어야 한다 (기능 회귀 방지)', async () => {
    await seedMixedList();

    await act(async () => {
      root.render(<Options />);
    });

    const actionBar = container.querySelector('.action-bar')!;
    const buttons = Array.from(actionBar.querySelectorAll('button, label'));
    const texts = buttons.map((b) => b.textContent || '');

    expect(texts.some((t) => t.includes('만료 공고'))).toBe(true);
    expect(texts.some((t) => t.includes('내보내기'))).toBe(true);
    expect(texts.some((t) => t.includes('가져오기'))).toBe(true);

    // 파일 input 이 라벨 안에 살아 있어야 한다
    expect(actionBar.querySelector('input[type="file"]')).not.toBeNull();
  });
});
