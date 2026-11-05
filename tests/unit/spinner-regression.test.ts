import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InfiniteScrollManager } from '../../src/core/infinite-scroll';
import { SaraminAdapter } from '../../src/adapters/saramin';
import { INFINITE_SCROLL_CONFIG } from '../../src/constants';

/**
 * 로딩 스피너가 "꺼지지 않고 계속 도는" 회귀 방지 테스트
 *
 * 배경: 사람인 목록에서 무한 스크롤 스피너가 사라지지 않는 제보가 있었다.
 * 원인이 되는 두 가지 경로를 고정한다.
 *  1) 목록 컨테이너가 사라진 뒤에도 재요청을 무한 반복하던 경로
 *  2) 매니저가 중복 생성될 때 인디케이터/센티넬이 DOM 에 누적되던 경로
 */
describe('무한 스크롤 스피너 무한 회전 회귀 방지', () => {
  const baseDom = `
    <div id="default_list_wrap"><div class="list_body">
      <div id="rec-1" class="list_item">
        <div class="col company_nm"><a class="str_tit">회사A</a></div>
        <div class="job_tit"><a class="str_tit" href="#">공고1</a></div>
      </div>
    </div></div>
    <div class="PageBox"><a href="?page=2" page="2">2</a></div>
  `;

  const nextPageHtml = (id: number) => `
    <html><body><div id="default_list_wrap"><div class="list_body">
      <div id="rec-${id}" class="list_item">
        <div class="col company_nm"><a class="str_tit">회사${id}</a></div>
        <div class="job_tit"><a class="str_tit" href="#">공고${id}</a></div>
      </div>
    </div></div></body></html>
  `;

  beforeEach(() => {
    document.body.innerHTML = '';
    // 이전 테스트의 전역 타이머/옵저버 영향 차단
    vi.restoreAllMocks();
  });

  it('정상 로드가 끝나면 로딩 인디케이터가 is-active 상태로 남지 않아야 한다', async () => {
    document.body.innerHTML = baseDom;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(nextPageHtml(2)),
    });

    const manager = new InfiniteScrollManager({
      adapter: new SaraminAdapter(),
      onCardsAppended: vi.fn(),
      fetchFn: mockFetch as any,
    });
    manager.init();
    await manager.loadNextPage();
    await new Promise((r) => setTimeout(r, 30));

    const indicator = document.getElementById(INFINITE_SCROLL_CONFIG.LOADING_INDICATOR_ID);
    expect(indicator).not.toBeNull();
    expect(indicator!.classList.contains(INFINITE_SCROLL_CONFIG.LOADING_ACTIVE_CLASS)).toBe(false);
    expect(indicator!.getAttribute('aria-hidden')).toBe('true');
    expect(manager.getIsLoading()).toBe(false);

    manager.destroy();
  });

  it('목록 컨테이너가 사라진 경우 무한 재요청하지 않고 종료해야 한다', async () => {
    document.body.innerHTML = baseDom;
    let fetchCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      fetchCount++;
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(nextPageHtml(9)),
      });
    });

    const manager = new InfiniteScrollManager({
      adapter: new SaraminAdapter(),
      onCardsAppended: vi.fn(),
      fetchFn: mockFetch as any,
    });
    manager.init();

    // 첫 페이지 로드는 정상 성공
    await manager.loadNextPage();
    const afterFirst = fetchCount;

    // 이후 목록 컨테이너가 사라진 상태 (사이트 DOM 개편/SPA 전환 등)
    document.getElementById('default_list_wrap')!.remove();

    // 센티넬 재확인 루프가 몇 번 돌더라도, 컨테이너 소실은 실패로 누적되어
    // MAX_CONSECUTIVE_FAILURES 도달 시 반드시 종료되어야 한다.
    // (수정 전에는 이 경로가 실패 카운터를 증가시키지 않아 영구 반복했다)
    for (let i = 0; i < 5 && !manager.isDestroyed(); i++) {
      await manager.loadNextPage();
    }

    expect(manager.isDestroyed()).toBe(true);
    // 무한 루프가 돌았다면 수십 회 이상 호출되었을 것이다
    expect(fetchCount).toBeLessThan(afterFirst + 10);
  }, 15000);

  it('매니저가 중복 초기화되어도 인디케이터/센티넬은 DOM 에 하나만 존재해야 한다', () => {
    document.body.innerHTML = baseDom;

    const make = () =>
      new InfiniteScrollManager({
        adapter: new SaraminAdapter(),
        onCardsAppended: vi.fn(),
      });

    // 확장 리로드/SPA 전환으로 이전 인스턴스가 남은 채 새 인스턴스가 초기화되는 상황
    const first = make();
    first.init();
    const second = make();
    second.init();

    expect(document.querySelectorAll(`#${INFINITE_SCROLL_CONFIG.LOADING_INDICATOR_ID}`).length).toBe(1);
    expect(document.querySelectorAll(`#${INFINITE_SCROLL_CONFIG.SENTINEL_ID}`).length).toBe(1);

    // 남아 있는 인디케이터는 새로 만든 인스턴스 것이어야 하고, 유휴 상태여야 한다
    const indicator = document.getElementById(INFINITE_SCROLL_CONFIG.LOADING_INDICATOR_ID)!;
    expect(indicator.classList.contains(INFINITE_SCROLL_CONFIG.LOADING_ACTIVE_CLASS)).toBe(false);

    first.destroy();
    second.destroy();
  });
});
