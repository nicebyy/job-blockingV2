import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InfiniteScrollManager } from '../../src/core/infinite-scroll';
import { SaraminAdapter } from '../../src/adapters/saramin';
import { WantedAdapter } from '../../src/adapters/wanted';
import { INFINITE_SCROLL_CONFIG } from '../../src/constants';

describe('InfiniteScrollManager 단위 테스트', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('무한 스크롤을 지원하지 않는 어댑터(Wanted)는 초기화되지 않아야 한다', () => {
    const manager = new InfiniteScrollManager({
      adapter: new WantedAdapter(),
      onCardsAppended: vi.fn(),
    });

    const initialized = manager.init();
    expect(initialized).toBe(false);
  });

  it('사람인 어댑터는 무한 스크롤 초기화 시 페이지네이션을 숨기고 센티넬을 생성해야 한다', () => {
    // 가상 사람인 DOM 구축
    document.body.innerHTML = `
      <div id="recruit_info_list">
        <div class="content_wrap">
          <div class="item_recruit">공고 1</div>
        </div>
      </div>
      <div class="pagination">1 2 3</div>
    `;

    const manager = new InfiniteScrollManager({
      adapter: new SaraminAdapter(),
      onCardsAppended: vi.fn(),
    });

    const initialized = manager.init();
    expect(initialized).toBe(true);

    const pagination = document.querySelector<HTMLElement>('.pagination');
    expect(pagination?.style.display).toBe('none');

    const sentinel = document.getElementById(INFINITE_SCROLL_CONFIG.SENTINEL_ID);
    expect(sentinel).not.toBeNull();
  });

  it('다음 페이지 공고를 fetch하여 컨테이너에 추가하고 콜백을 호출해야 한다', async () => {
    document.body.innerHTML = `
      <div id="recruit_info_list">
        <div class="content_wrap">
          <div class="item_recruit">1페이지 공고</div>
        </div>
      </div>
      <div class="pagination">
        <a href="https://www.saramin.co.kr/zf_user/search?page=2" page="2">2</a>
      </div>
    `;

    const mockNextPageHtml = `
      <html>
        <body>
          <div id="recruit_info_list">
            <div class="content_wrap">
              <div class="item_recruit">
                <div class="area_corp"><strong class="corp_name"><a href="#">2페이지 기업</a></strong></div>
                <div class="area_job"><h2 class="job_tit"><a href="#">2페이지 직무</a></h2></div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(mockNextPageHtml),
    });

    const onAppended = vi.fn();
    const manager = new InfiniteScrollManager({
      adapter: new SaraminAdapter(),
      onCardsAppended: onAppended,
      fetchFn: mockFetch as any,
    });

    manager.init();
    expect(manager.getCurrentPage()).toBe(1);

    const success = await manager.loadNextPage();
    expect(success).toBe(true);
    expect(manager.getCurrentPage()).toBe(2);
    expect(onAppended).toHaveBeenCalled();

    // 2페이지 공고가 현재 DOM에 추가되었는지 확인
    const cards = document.querySelectorAll('.item_recruit');
    expect(cards.length).toBe(2);
  });

  it('화면에 남은 유효 공고가 MIN_VISIBLE_CARDS 미만이면 autoRefill이 작동해야 한다', async () => {
    document.body.innerHTML = `
      <div id="recruit_info_list">
        <div class="content_wrap">
          <div class="item_recruit">공고 1</div>
        </div>
      </div>
      <div class="pagination">
        <a href="https://www.saramin.co.kr/zf_user/search?page=2" page="2">2</a>
      </div>
    `;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(`
        <html>
          <body>
            <div class="item_recruit"><div class="area_corp"><span class="corp_name"><a href="#">신규</a></span></div><div class="area_job"><span class="job_tit"><a href="#">타이틀</a></span></div></div>
          </body>
        </html>
      `),
    });

    const manager = new InfiniteScrollManager({
      adapter: new SaraminAdapter(),
      onCardsAppended: vi.fn(),
      fetchFn: mockFetch as any,
    });

    manager.init();

    // 유효 공고가 2개(기준치 5개 미만)일 때 autoRefill 호출
    const triggered = await manager.checkAndAutoRefill(2);
    expect(triggered).toBe(true);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('화면에 남은 유효 공고가 충분할 때는 autoRefill이 작동하지 않아야 한다', async () => {
    const mockFetch = vi.fn();
    const manager = new InfiniteScrollManager({
      adapter: new SaraminAdapter(),
      onCardsAppended: vi.fn(),
      fetchFn: mockFetch as any,
    });

    // 유효 공고가 15개(기준치 5개 이상)일 때
    const triggered = await manager.checkAndAutoRefill(15);
    expect(triggered).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
