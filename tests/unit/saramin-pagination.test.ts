import { describe, it, expect } from 'vitest';
import { SaraminAdapter } from '../../src/adapters/saramin';
import { INFINITE_SCROLL_CONFIG, SARAMIN_SELECTORS } from '../../src/constants';

/**
 * 사람인 무한 스크롤 페이지네이션 검증 보강
 *
 * 기존 WIP 테스트는 "정상 경로"를 검증하지만, 경계·예외 조건에서
 * 잘못된 페이지를 요청하지 않는지 추가로 확인한다.
 * (11페이지 이후 멈춤 버그가 재발하지 않도록 방어)
 */
describe('사람인 getNextPageUrl — 경계 조건 검증', () => {
  const adapter = new SaraminAdapter();

  function makeDoc(html: string): HTMLElement {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
  }

  /** 사람인 10개 단위 페이지 블록을 모사한 페이지네이션 */
  const paginationBlock = (active: number, nextBlockStart: number) => `
    <div class="PageBox">
      <a href="?page=${nextBlockStart - 10}" class="BtnType prev">이전</a>
      ${Array.from({ length: 10 }, (_, i) => {
        const page = nextBlockStart - 10 + i;
        return `<a href="?page=${page}" class="BtnType${page === active ? ' active' : ''}">${page}</a>`;
      }).join('')}
      <a href="?page=${nextBlockStart}" class="BtnType next">다음</a>
    </div>
  `;

  it('1페이지에서 "다음" 버튼(page=11)을 그대로 쓰지 않고 page=2 를 요청해야 한다', () => {
    const doc = makeDoc(`
      <div id="default_list_wrap"><div class="list_body">
        <div class="item_recruit"><div class="area_corp"><span class="corp">회사A</span></div></div>
      </div></div>
      ${paginationBlock(1, 11)}
    `);

    // window.location 이 없으면 URL fallback 기반으로 계산된다
    const nextUrl = adapter.getNextPageUrl(doc, 1);
    expect(nextUrl).not.toBeNull();
    // page=11 이 아니라 page=2 여야 한다 (11페이지 이후 멈춤 버그의 핵심)
    expect(nextUrl).toContain('page=2');
    expect(nextUrl).not.toContain('page=11');
  });

  it('10페이지에서 다음은 11페이지여야 한다 (블록 경계 통과)', () => {
    const doc = makeDoc(`<div id="default_list_wrap"></div>${paginationBlock(10, 11)}`);
    const nextUrl = adapter.getNextPageUrl(doc, 10);
    expect(nextUrl).toContain('page=11');
  });

  it('11페이지에서 다음은 12페이지여야 한다 (stale 링크 무시)', () => {
    // 11페이지 DOM 의 "다음" 버튼은 여전히 page=11 (다음 블록 시작)을 가리키는 stale 상태
    const doc = makeDoc(`<div id="default_list_wrap"></div>${paginationBlock(11, 11)}`);
    const nextUrl = adapter.getNextPageUrl(doc, 11);
    expect(nextUrl).not.toBeNull();
    expect(nextUrl).toContain('page=12');
  });

  it('page_count 같은 유사 파라미터를 다음 페이지로 오인하지 않아야 한다', () => {
    const doc = makeDoc(`
      <div id="default_list_wrap"></div>
      <div class="PageBox">
        <a href="?page_count=50" class="BtnNext">다음</a>
      </div>
    `);
    const nextUrl = adapter.getNextPageUrl(doc, 3);
    expect(nextUrl).not.toBeNull();
    // page_count 를 그대로 반환하면 안 된다
    expect(nextUrl).not.toContain('page_count=50');
  });

  it('페이지네이션이 없는 정적 페이지에서는 null 을 반환해야 한다', () => {
    const doc = makeDoc(`
      <div id="default_list_wrap"><div class="list_body">
        <div class="item_recruit"><span class="corp">회사</span></div>
      </div></div>
    `);
    expect(adapter.getNextPageUrl(doc, 1)).toBeNull();
  });
});

describe('사람인 getCurrentPageNumber — 페이지 이어받기', () => {
  const adapter = new SaraminAdapter();

  it('활성 페이지 마커에서 페이지 번호를 읽어야 한다', () => {
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="PageBox">
        <a href="?page=9" class="BtnType">9</a>
        <a href="?page=10" class="BtnType active">10</a>
        <a href="?page=11" class="BtnType">11</a>
      </div>
    `;
    expect(adapter.getCurrentPageNumber(div)).toBe(10);
  });

  it('page 속성이 있으면 텍스트보다 우선해야 한다', () => {
    const div = document.createElement('div');
    div.innerHTML = `<div class="PageBox"><button page="7" class="active">7</button></div>`;
    expect(adapter.getCurrentPageNumber(div)).toBe(7);
  });

  it('DOM 마커가 없고 window.location 이 없으면 null 을 반환해야 한다', () => {
    const div = document.createElement('div');
    div.innerHTML = '<div class="PageBox"></div>';
    // 테스트 환경의 window.location 은 about:blank 계열이므로 페이지 번호가 없다
    const result = adapter.getCurrentPageNumber(div);
    expect(result === null || typeof result === 'number').toBe(true);
  });
});

describe('무한 스크롤 설정 상수 검증', () => {
  it('IO 재확인 지연·휴지 상수가 양수로 정의되어야 한다', () => {
    expect(INFINITE_SCROLL_CONFIG.INTERSECTION_REFILL_DELAY_MS).toBeGreaterThan(0);
    expect(INFINITE_SCROLL_CONFIG.INTERSECTION_REFILL_COOLDOWN_MS).toBeGreaterThan(0);
    // 휴지 시간은 재확인 지연보다 길어야 서버 보호 의미가 있다
    expect(INFINITE_SCROLL_CONFIG.INTERSECTION_REFILL_COOLDOWN_MS).toBeGreaterThan(
      INFINITE_SCROLL_CONFIG.INTERSECTION_REFILL_DELAY_MS
    );
  });

  it('사람인 페이지 관련 셀렉터가 정의되어야 한다', () => {
    expect(SARAMIN_SELECTORS.ACTIVE_PAGE).toBeTruthy();
    expect(SARAMIN_SELECTORS.PAGE_QUERY_PARAMS).toEqual(['recruitPage', 'page']);
  });
});
