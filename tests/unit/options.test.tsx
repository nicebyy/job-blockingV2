import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Options } from '../../src/options/Options';
import { StorageManager } from '../../src/core/storage';
import { OPTIONS_FILTER_CONFIG } from '../../src/constants';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

  it('각 차단 항목에 어디 플랫폼에서 차단한 건지 뱃지가 올바르게 표시되어야 한다', async () => {
    await StorageManager.addBlockItem('아와소프트', 'company', { platform: 'saramin' });
    await StorageManager.addBlockItem('rec_saramin_1', 'job', {
      companyName: '당근마켓',
      title: '백엔드 개발자',
      platform: 'saramin',
    });
    await StorageManager.addBlockItem('잡코리아회사', 'company', { platform: 'jobkorea' });
    await StorageManager.addBlockItem('원티드회사', 'company', { platform: 'wanted' });
    await StorageManager.addBlockItem('리멤버회사', 'company', { platform: 'remember' });
    await StorageManager.addBlockItem('직접추가회사', 'company'); // platform 미지정 -> custom

    await act(async () => {
      root.render(<Options />);
    });

    const items = container.querySelectorAll('.block-item');
    expect(items.length).toBe(6);

    // 사람인 뱃지 검증
    const saraminBadge = items[0].querySelector('.platform-badge');
    expect(saraminBadge?.textContent?.trim()).toBe('사람인');
    expect(saraminBadge?.classList.contains('platform-badge-saramin')).toBe(true);

    // 잡코리아 뱃지 검증
    const jobkoreaBadge = items[2].querySelector('.platform-badge');
    expect(jobkoreaBadge?.textContent?.trim()).toBe('잡코리아');
    expect(jobkoreaBadge?.classList.contains('platform-badge-jobkorea')).toBe(true);

    // 원티드 뱃지 검증
    const wantedBadge = items[3].querySelector('.platform-badge');
    expect(wantedBadge?.textContent?.trim()).toBe('원티드');
    expect(wantedBadge?.classList.contains('platform-badge-wanted')).toBe(true);

    // 리멤버 뱃지 검증
    const rememberBadge = items[4].querySelector('.platform-badge');
    expect(rememberBadge?.textContent?.trim()).toBe('리멤버');
    expect(rememberBadge?.classList.contains('platform-badge-remember')).toBe(true);

    // 직접등록(미지정) 뱃지 검증
    const customBadge = items[5].querySelector('.platform-badge');
    expect(customBadge?.textContent?.trim()).toBe('직접등록');
    expect(customBadge?.classList.contains('platform-badge-custom')).toBe(true);
  });

  it('플랫폼 필터 탭을 클릭하면 해당 플랫폼에서 차단한 항목만 필터링되어야 한다', async () => {
    await StorageManager.addBlockItem('사람인기업', 'company', { platform: 'saramin' });
    await StorageManager.addBlockItem('잡코리아기업', 'company', { platform: 'jobkorea' });
    await StorageManager.addBlockItem('원티드기업', 'company', { platform: 'wanted' });
    await StorageManager.addBlockItem('리멤버기업', 'company', { platform: 'remember' });
    await StorageManager.addBlockItem('점핏기업', 'company', { platform: 'jumpit' });

    await act(async () => {
      root.render(<Options />);
    });

    const platformTabs = container.querySelectorAll<HTMLButtonElement>('.platform-tab-btn');
    expect(platformTabs.length).toBe(7); // 전체, 사람인, 잡코리아, 원티드, 리멤버, 점핏, 직접등록

    // 1. '리멤버' 탭 찾기 및 필터링 검증
    const rememberTab = Array.from(platformTabs).find((btn) => btn.textContent?.includes('리멤버'));
    expect(rememberTab).toBeDefined();

    await act(async () => {
      rememberTab?.click();
    });

    expect(rememberTab?.classList.contains('active')).toBe(true);

    let items = container.querySelectorAll('.block-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('리멤버기업');
    expect(items[0].textContent).not.toContain('사람인기업');
    expect(items[0].textContent).not.toContain('원티드기업');

    // 2. '점핏' 탭 찾기 및 필터링 검증
    const jumpitTab = Array.from(platformTabs).find((btn) => btn.textContent?.includes('점핏'));
    expect(jumpitTab).toBeDefined();

    await act(async () => {
      jumpitTab?.click();
    });

    expect(jumpitTab?.classList.contains('active')).toBe(true);

    items = container.querySelectorAll('.block-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('점핏기업');
    expect(items[0].textContent).not.toContain('리멤버기업');
  });

  it('유형 필터와 플랫폼 필터를 함께 선택했을 때 복합 필터링이 올바르게 동작해야 한다', async () => {
    // 1. 사람인 회사 차단
    await StorageManager.addBlockItem('사람인회사A', 'company', { platform: 'saramin' });
    // 2. 사람인 공고 숨김
    await StorageManager.addBlockItem('rec_saramin_99', 'job', {
      companyName: '사람인회사B',
      title: '시니어 개발자',
      platform: 'saramin',
    });
    // 3. 잡코리아 공고 숨김
    await StorageManager.addBlockItem('rec_jobkorea_88', 'job', {
      companyName: '잡코리아회사C',
      title: '주니어 개발자',
      platform: 'jobkorea',
    });

    await act(async () => {
      root.render(<Options />);
    });

    // 1. '공고' 유형 탭 선택
    const jobTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.filter-tab-btn')
    ).find((btn) => btn.textContent?.includes('공고'));

    await act(async () => {
      jobTab?.click();
    });

    expect(container.querySelectorAll('.block-item').length).toBe(2);

    // 2. '사람인' 플랫폼 탭 선택
    const saraminPlatTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.platform-tab-btn')
    ).find((btn) => btn.textContent?.includes('사람인'));

    await act(async () => {
      saraminPlatTab?.click();
    });

    // 결과: 사람인에서 숨긴 공고 1개만 조회되어야 함!
    const filteredItems = container.querySelectorAll('.block-item');
    expect(filteredItems.length).toBe(1);
    expect(filteredItems[0].textContent).toContain('사람인회사B');
    expect(filteredItems[0].textContent).toContain('시니어 개발자');
    expect(filteredItems[0].textContent).not.toContain('잡코리아회사C');
    expect(filteredItems[0].textContent).not.toContain('사람인회사A');
  });
});

