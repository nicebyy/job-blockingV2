import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InfiniteScrollManager } from '../../src/core/infinite-scroll';
import { SaraminAdapter } from '../../src/adapters/saramin';
import { WantedAdapter } from '../../src/adapters/wanted';
import { JobKoreaAdapter } from '../../src/adapters/jobkorea';
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

  it('페이지네이션 요소가 없는 정적/단일 페이지에서는 초기화되지 않아야 한다', () => {
    document.body.innerHTML = `
      <div id="recruit_info_list">
        <div class="content_wrap">
          <div class="item_recruit">단일 페이지 공고</div>
        </div>
      </div>
    `;

    const manager = new InfiniteScrollManager({
      adapter: new SaraminAdapter(),
      onCardsAppended: vi.fn(),
    });

    const initialized = manager.init();
    expect(initialized).toBe(false);
    expect(document.getElementById(INFINITE_SCROLL_CONFIG.SENTINEL_ID)).toBeNull();
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

  it('동일한 공고가 중복 fetch될 경우 추가하지 않고 무한 루프를 방지하기 위해 탐색을 종료해야 한다', async () => {
    document.body.innerHTML = `
      <div id="recruit_info_list">
        <div class="content">
          <div class="item_recruit" value="rec_100">
            <div class="area_corp"><span class="corp_name"><a href="#">기존기업</a></span></div>
            <div class="area_job"><span class="job_tit"><a href="#">기존공고</a></span></div>
          </div>
        </div>
      </div>
      <div class="pagination">
        <a href="https://www.saramin.co.kr/zf_user/search?page=2" page="2">2</a>
      </div>
    `;

    // 2페이지 응답이 1페이지와 동일한 중복 공고를 반환하는 경우
    const mockDuplicateHtml = `
      <html>
        <body>
          <div class="item_recruit" value="rec_100">
            <div class="area_corp"><span class="corp_name"><a href="#">기존기업</a></span></div>
            <div class="area_job"><span class="job_tit"><a href="#">기존공고</a></span></div>
          </div>
        </body>
      </html>
    `;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(mockDuplicateHtml),
    });

    const onAppended = vi.fn();
    const manager = new InfiniteScrollManager({
      adapter: new SaraminAdapter(),
      onCardsAppended: onAppended,
      fetchFn: mockFetch as any,
    });

    manager.init();

    const success = await manager.loadNextPage();
    // 중복 카드만 있으므로 추가되지 않고 false 반환 및 종료
    expect(success).toBe(false);
    expect(onAppended).not.toHaveBeenCalled();

    // DOM 내 카드는 여전히 1개만 유지되어야 함
    const cards = document.querySelectorAll('.item_recruit');
    expect(cards.length).toBe(1);

    // 로딩 인디케이터가 꺼져 있어야 함
    const indicator = document.getElementById(INFINITE_SCROLL_CONFIG.LOADING_INDICATOR_ID);
    expect(indicator).toBeNull(); // destroy 호출로 제거됨
  });

  it('fetch 실패 또는 에러 발생 시에도 로딩 스피너가 무한히 돌지 않고 꺼져야 한다', async () => {
    document.body.innerHTML = `
      <div id="recruit_info_list">
        <div class="content">
          <div class="item_recruit">공고 1</div>
        </div>
      </div>
      <div class="pagination">
        <a href="https://www.saramin.co.kr/zf_user/search?page=2" page="2">2</a>
      </div>
    `;

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error or WAF hang'));

    const manager = new InfiniteScrollManager({
      adapter: new SaraminAdapter(),
      onCardsAppended: vi.fn(),
      fetchFn: mockFetch as any,
    });

    manager.init();

    const success = await manager.loadNextPage();
    expect(success).toBe(false);
    expect(manager.getIsLoading()).toBe(false);

    const indicator = document.getElementById(INFINITE_SCROLL_CONFIG.LOADING_INDICATOR_ID);
    expect(indicator?.style.display).toBe('none');
  });

  it('잡코리아 어댑터는 getNextPageRequest를 통해 POST 요청 옵션으로 다음 페이지를 로드해야 한다', async () => {
    const origLocation = window.location;
    delete (window as any).location;
    (window as any).location = new URL('https://www.jobkorea.co.kr/recruit/joblist?menucode=local&localorder=1');

    try {
      document.body.innerHTML = `
        <div id="dev-gi-list">
          <div class="tplList tplJobList">
            <table>
              <tbody>
                <tr class="devloopArea" data-gno="1001">
                  <td class="tplCo"><a href="#">기존회사</a></td>
                  <td class="tplTit"><a href="#">기존공고</a></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div id="dvGIPaging">
          <div class="tplPagination">1 2</div>
        </div>
      `;

      const mockResponseHtml = `
        <div class="tplList tplJobList">
          <table>
            <tbody>
              <tr class="devloopArea" data-gno="1002">
                <td class="tplCo"><a href="#">신규회사</a></td>
                <td class="tplTit"><a href="#">신규공고</a></td>
              </tr>
            </tbody>
          </table>
        </div>
      `;

      let capturedUrl = '';
      let capturedInit: RequestInit | undefined;
      const mockFetch = vi.fn().mockImplementation((url, init) => {
        capturedUrl = url;
        capturedInit = init;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(mockResponseHtml),
        });
      });

      const onAppended = vi.fn();
      const manager = new InfiniteScrollManager({
        adapter: new JobKoreaAdapter(),
        onCardsAppended: onAppended,
        fetchFn: mockFetch as any,
      });

      manager.init();

      const success = await manager.loadNextPage();
      expect(success).toBe(true);
      expect(capturedUrl).toBe('/Recruit/Home/_GI_List/');
      expect(capturedInit?.method).toBe('POST');
      expect(capturedInit?.body).toContain('page=2');
      expect(capturedInit?.body).toContain('pagesize=40');

      // 기존 tbody에 새 행이 append되었는지 검증
      const rows = document.querySelectorAll('.tplList.tplJobList table tbody tr');
      expect(rows.length).toBe(2);
      expect(onAppended).toHaveBeenCalled();
    } finally {
      (window as any).location = origLocation;
    }
  });
});
