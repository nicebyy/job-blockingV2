import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Options } from '../../src/options/Options';
import { StorageManager } from '../../src/core/storage';
import { OPTIONS_FILTER_CONFIG } from '../../src/constants';

describe('Options 환경설정 페이지 단위 테스트', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    // 스토리지 초기화 및 모의 데이터 세팅
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
  });

  it('차단 목록의 카테고리별 개수와 탭 버튼이 올바르게 렌더링되어야 한다', async () => {
    // 회사 2개, 공고 2개, 키워드 1개 등록
    await StorageManager.addBlockItem('카카오', 'company');
    await StorageManager.addBlockItem('네이버', 'company');
    await StorageManager.addBlockItem('rec_1001', 'job', {
      companyName: '당근마켓',
      title: '프론트엔드 개발자',
    });
    await StorageManager.addBlockItem('rec_1002', 'job', {
      companyName: '토스',
      title: '서버 개발자',
    });
    await StorageManager.addBlockItem('파견', 'keyword');

    await act(async () => {
      root.render(<Options />);
    });

    const tabs = container.querySelectorAll<HTMLButtonElement>('.filter-tab-btn');
    expect(tabs.length).toBe(4);

    // 전체 5개, 회사 2개, 공고 2개, 키워드 1개
    expect(tabs[0].textContent).toContain(OPTIONS_FILTER_CONFIG.LABELS.ALL);
    expect(tabs[0].querySelector('.filter-tab-count')?.textContent).toBe('5');

    expect(tabs[1].textContent).toContain(OPTIONS_FILTER_CONFIG.LABELS.COMPANY);
    expect(tabs[1].querySelector('.filter-tab-count')?.textContent).toBe('2');

    expect(tabs[2].textContent).toContain(OPTIONS_FILTER_CONFIG.LABELS.JOB);
    expect(tabs[2].querySelector('.filter-tab-count')?.textContent).toBe('2');

    expect(tabs[3].textContent).toContain(OPTIONS_FILTER_CONFIG.LABELS.KEYWORD);
    expect(tabs[3].querySelector('.filter-tab-count')?.textContent).toBe('1');

    // 기본 '전체' 탭에서는 5개 항목이 모두 렌더링되어야 함
    const items = container.querySelectorAll('.block-item');
    expect(items.length).toBe(5);
  });

  it('회사 탭을 클릭하면 차단한 회사 항목만 필터링되어야 한다', async () => {
    await StorageManager.addBlockItem('카카오', 'company');
    await StorageManager.addBlockItem('rec_1001', 'job', {
      companyName: '당근마켓',
      title: '프론트엔드 개발자',
    });

    await act(async () => {
      root.render(<Options />);
    });

    const companyTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.filter-tab-btn')
    ).find((btn) => btn.textContent?.includes(OPTIONS_FILTER_CONFIG.LABELS.COMPANY));

    expect(companyTab).toBeDefined();

    await act(async () => {
      companyTab?.click();
    });

    expect(companyTab?.classList.contains('active')).toBe(true);

    const items = container.querySelectorAll('.block-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('카카오');
    expect(items[0].textContent).not.toContain('당근마켓');
  });

  it('공고 탭을 클릭하면 차단한 공고 항목만 필터링되어야 한다', async () => {
    await StorageManager.addBlockItem('라인', 'company');
    await StorageManager.addBlockItem('rec_2001', 'job', {
      companyName: '우아한형제들',
      title: '백엔드 엔지니어',
    });

    await act(async () => {
      root.render(<Options />);
    });

    const jobTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.filter-tab-btn')
    ).find((btn) => btn.textContent?.includes(OPTIONS_FILTER_CONFIG.LABELS.JOB));

    expect(jobTab).toBeDefined();

    await act(async () => {
      jobTab?.click();
    });

    expect(jobTab?.classList.contains('active')).toBe(true);

    const items = container.querySelectorAll('.block-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('우아한형제들');
    expect(items[0].textContent).toContain('백엔드 엔지니어');
    expect(items[0].textContent).not.toContain('라인');
  });

  it('키워드 탭을 클릭하면 키워드 항목만 필터링되어야 한다', async () => {
    await StorageManager.addBlockItem('구글', 'company');
    await StorageManager.addBlockItem('SI/SM', 'keyword');

    await act(async () => {
      root.render(<Options />);
    });

    const keywordTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.filter-tab-btn')
    ).find((btn) => btn.textContent?.includes(OPTIONS_FILTER_CONFIG.LABELS.KEYWORD));

    expect(keywordTab).toBeDefined();

    await act(async () => {
      keywordTab?.click();
    });

    expect(keywordTab?.classList.contains('active')).toBe(true);

    const items = container.querySelectorAll('.block-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('SI/SM');
    expect(items[0].textContent).not.toContain('구글');
  });

  it('탭 필터링 상태에서 검색어 입력 시 복합 필터링이 정상 작동해야 한다', async () => {
    await StorageManager.addBlockItem('카카오뱅크', 'company');
    await StorageManager.addBlockItem('카카오페이', 'company');
    await StorageManager.addBlockItem('rec_3001', 'job', {
      companyName: '카카오엔터프라이즈',
      title: 'AI 연구원',
    });

    await act(async () => {
      root.render(<Options />);
    });

    // 1. 회사 탭 선택
    const companyTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.filter-tab-btn')
    ).find((btn) => btn.textContent?.includes(OPTIONS_FILTER_CONFIG.LABELS.COMPANY));

    await act(async () => {
      companyTab?.click();
    });

    expect(container.querySelectorAll('.block-item').length).toBe(2);

    // 2. 검색어 '뱅크' 입력
    const searchInput = container.querySelector<HTMLInputElement>('input[placeholder*="검색"]');
    expect(searchInput).not.toBeNull();

    await act(async () => {
      if (searchInput) {
        // React onChange 트리거
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        nativeInputValueSetter?.call(searchInput, '뱅크');
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    const items = container.querySelectorAll('.block-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('카카오뱅크');
  });

  it('해당 탭에 항목이 없을 때 적절한 빈 상태 메시지를 출력해야 한다', async () => {
    // 회사 항목만 등록
    await StorageManager.addBlockItem('삼성전자', 'company');

    await act(async () => {
      root.render(<Options />);
    });

    // 공고 탭 클릭
    const jobTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.filter-tab-btn')
    ).find((btn) => btn.textContent?.includes(OPTIONS_FILTER_CONFIG.LABELS.JOB));

    await act(async () => {
      jobTab?.click();
    });

    const emptyState = container.querySelector('.empty-state');
    expect(emptyState?.textContent?.trim()).toBe(OPTIONS_FILTER_CONFIG.EMPTY_MESSAGES.JOB);
  });
});
