import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { Options } from '../../src/options/Options';
import { StorageManager } from '../../src/core/storage';
import { UI_MESSAGES, OPTIONS_FILTER_CONFIG } from '../../src/constants';
import { BlockItem, DEFAULT_SETTINGS } from '../../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * 옵션 페이지 목록 UX 개선 3건 회귀 테스트
 *
 * 1) 죽은 설정 제거 (blurIntensity / showInlineButton)
 * 2) 제목이 2줄 이상일 때 삭제 버튼이 세로로 깨지지 않도록 레이아웃 분리
 * 3) 차단 목록이 무한정 길어지지 않도록 페이지네이션(점진적 렌더링)
 */

const seedJobs = async (count: number) => {
  const now = Date.now();
  const list: BlockItem[] = Array.from({ length: count }, (_, i) => ({
    id: `job_${i}`,
    pattern: `job_${i}`,
    type: 'job' as const,
    createdAt: now,
    platform: 'jobkorea' as const,
    title:
      i % 3 === 0
        ? `[${i}] 아주 긴 공고 제목으로 두 줄 이상 넘어가는 케이스 대규모 공개채용 백엔드 프론트엔드`
        : `[${i}] 짧은 공고`,
    companyName: `테스트회사${i}`,
    expiresAt: now + 86400000 * 20,
  }));
  await StorageManager.saveBlockList(list);
  return list;
};

describe('#1 죽은 설정 제거', () => {
  it('FilterSettings 타입에서 blurIntensity / showInlineButton 이 제거되어야 한다', () => {
    expect('blurIntensity' in DEFAULT_SETTINGS).toBe(false);
    expect('showInlineButton' in DEFAULT_SETTINGS).toBe(false);
  });

  it('src 전체에서 두 설정을 참조하는 코드가 없어야 한다', () => {
    const srcDir = path.resolve(__dirname, '../../src');
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        // 제거 사실을 설명하는 주석은 허용하되, 실제 참조(할당/조회)는 금지
        const codeOnly = text
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '');
        if (/\bblurIntensity\b|\bshowInlineButton\b/.test(codeOnly)) {
          offenders.push(path.relative(srcDir, full));
        }
      }
    };
    walk(srcDir);

    expect(offenders, `제거된 설정을 참조하는 파일: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('#2 삭제 버튼 레이아웃 (세로 깨짐 방지)', () => {
  let container: HTMLDivElement;
  let root: Root;

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
  });

  it('각 항목이 내용 영역(.block-item-content)과 삭제 버튼을 분리해 렌더링해야 한다', async () => {
    await seedJobs(3);
    await act(async () => {
      root.render(<Options />);
    });

    const items = Array.from(container.querySelectorAll('.block-item'));
    expect(items.length).toBe(3);

    for (const li of items) {
      // 내용 영역과 버튼이 형제로 분리되어 있어야 한다
      expect(li.querySelector('.block-item-content')).not.toBeNull();
      expect(li.querySelector('.btn-delete')).not.toBeNull();

      // 버튼이 내용 영역 안에 중첩되면 flex 압축 대상이 되어 세로로 깨질 수 있다
      const content = li.querySelector('.block-item-content')!;
      expect(content.contains(li.querySelector('.btn-delete'))).toBe(false);
    }
  });

  it('삭제 버튼에 white-space: nowrap / flex-shrink: 0 이 적용되어야 한다', () => {
    // jsdom 계열에서는 CSS 계산값을 신뢰할 수 없으므로 stylesheet 텍스트로 검증한다
    const css = fs.readFileSync(path.resolve(__dirname, '../../src/options/options.css'), 'utf8');
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');

    const btnRule = stripped
      .split('}')
      .find((rule) => /\.btn-delete\s*\{/.test(rule) && !/hover/.test(rule));

    expect(btnRule, '.btn-delete 규칙을 찾지 못함').toBeDefined();
    expect(btnRule).toMatch(/white-space:\s*nowrap/);
    expect(btnRule).toMatch(/flex:\s*0\s+0\s+auto/);
  });

  it('.block-item-content 에 min-width: 0 이 있어야 한다 (flex 압축 허용)', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../src/options/options.css'), 'utf8');
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');

    const rule = stripped
      .split('}')
      .find((r) => /\.block-item-content\s*\{/.test(r));

    expect(rule, '.block-item-content 규칙이 없음 (레이아웃 붕괴 원인)').toBeDefined();
    expect(rule).toMatch(/min-width:\s*0/);
  });

  it('긴 제목은 2줄로 제한(line-clamp)되어 행이 무한히 커지지 않아야 한다', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../src/options/options.css'), 'utf8');
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');

    const rule = stripped
      .split('}')
      .find((r) => /\.block-item-title\s*\{/.test(r));

    expect(rule, '.block-item-title 규칙이 없음').toBeDefined();
    expect(rule).toMatch(/-webkit-line-clamp:\s*2/);
    expect(rule).toMatch(/overflow:\s*hidden/);
  });

  it('제목에 전체 텍스트가 title 속성으로 노출되어야 한다 (말줄임 보완)', async () => {
    await seedJobs(1);
    await act(async () => {
      root.render(<Options />);
    });

    const titleEl = container.querySelector('.block-item-title');
    expect(titleEl).not.toBeNull();
    expect(titleEl!.getAttribute('title')).toBeTruthy();
    expect(titleEl!.getAttribute('title')!.length).toBeGreaterThan(10);
  });
});

describe('#3 목록 페이지네이션 (점진적 렌더링)', () => {
  let container: HTMLDivElement;
  let root: Root;

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
  });

  it('항목이 많아도 처음에는 PAGE_SIZE 만큼만 렌더링해야 한다', async () => {
    await seedJobs(300);
    await act(async () => {
      root.render(<Options />);
    });

    const rendered = container.querySelectorAll('.block-item').length;
    expect(rendered).toBe(OPTIONS_FILTER_CONFIG.PAGINATION.PAGE_SIZE);
  });

  it('페이지네이션 UI 에 현재/전체 개수가 표시되어야 한다', async () => {
    await seedJobs(300);
    await act(async () => {
      root.render(<Options />);
    });

    const pagination = container.querySelector('.list-pagination');
    expect(pagination).not.toBeNull();

    const summary = container.querySelector('.list-pagination-summary')?.textContent;
    expect(summary).toBe(
      UI_MESSAGES.LOAD_MORE_REMAINING(
        OPTIONS_FILTER_CONFIG.PAGINATION.PAGE_SIZE,
        300
      )
    );
    expect(summary).toContain('50');
    expect(summary).toContain('300');
  });

  it('[더 보기] 클릭 시 LOAD_MORE_STEP 만큼 추가 렌더링되어야 한다', async () => {
    await seedJobs(300);
    await act(async () => {
      root.render(<Options />);
    });

    const before = container.querySelectorAll('.block-item').length;
    expect(before).toBe(OPTIONS_FILTER_CONFIG.PAGINATION.PAGE_SIZE);

    const loadMore = container.querySelector<HTMLButtonElement>('.btn-load-more');
    expect(loadMore).not.toBeNull();

    await act(async () => {
      loadMore!.click();
    });

    const after = container.querySelectorAll('.block-item').length;
    expect(after).toBe(
      OPTIONS_FILTER_CONFIG.PAGINATION.PAGE_SIZE + OPTIONS_FILTER_CONFIG.PAGINATION.LOAD_MORE_STEP
    );
  });

  it('[전체 보기] 클릭 시 모든 항목이 렌더링되고 페이지네이션이 사라져야 한다', async () => {
    await seedJobs(120);
    await act(async () => {
      root.render(<Options />);
    });

    const showAll = container.querySelector<HTMLButtonElement>('.btn-show-all');
    expect(showAll).not.toBeNull();

    await act(async () => {
      showAll!.click();
    });

    expect(container.querySelectorAll('.block-item').length).toBe(120);
    expect(container.querySelector('.list-pagination')).toBeNull();
  });

  it('항목 수가 PAGE_SIZE 이하면 페이지네이션이 노출되지 않아야 한다', async () => {
    await seedJobs(10);
    await act(async () => {
      root.render(<Options />);
    });

    expect(container.querySelectorAll('.block-item').length).toBe(10);
    expect(container.querySelector('.list-pagination')).toBeNull();
  });

  it('검색어를 입력하면 표시 개수가 초기값으로 리셋되어야 한다', async () => {
    await seedJobs(300);
    await act(async () => {
      root.render(<Options />);
    });

    // 더 보기로 150개까지 확장
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-load-more')!.click();
    });
    expect(container.querySelectorAll('.block-item').length).toBe(150);

    // 검색어 입력 -> 리셋
    const searchInput = container.querySelector<HTMLInputElement>('input[placeholder*="검색"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      setter?.call(searchInput, '짧은');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // 검색 결과가 50개 이하이거나, 50개로 다시 제한되어야 한다
    const rendered = container.querySelectorAll('.block-item').length;
    expect(rendered).toBeLessThanOrEqual(OPTIONS_FILTER_CONFIG.PAGINATION.PAGE_SIZE);
  });

  it('페이지네이션 상태에서도 삭제 버튼이 정상 동작해야 한다', async () => {
    await seedJobs(120);
    await act(async () => {
      root.render(<Options />);
    });

    const firstDelete = container.querySelector<HTMLButtonElement>('.btn-delete')!;
    await act(async () => {
      firstDelete.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const remaining = await StorageManager.getBlockList();
    expect(remaining.length).toBe(119);
  });
});
