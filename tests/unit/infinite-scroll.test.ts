import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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
    // [회귀 방지] 표시 여부는 인라인 style 이 아니라 상태 클래스로 제어한다
    // (CSS `display:flex !important` 가 인라인 none 을 덮어써 스피너가 항상 보이던 버그)
    expect(indicator?.classList.contains(INFINITE_SCROLL_CONFIG.LOADING_ACTIVE_CLASS)).toBe(false);
    expect(indicator?.getAttribute('aria-hidden')).toBe('true');
  });

  it('연속 fetch 실패가 한도를 넘으면 스피너를 멈추고 무한 재시도를 종료해야 한다', async () => {
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

    const mockFetch = vi.fn().mockRejectedValue(new Error('WAF blocked / network reset'));

    const manager = new InfiniteScrollManager({
      adapter: new SaraminAdapter(),
      onCardsAppended: vi.fn(),
      fetchFn: mockFetch as any,
    });

    manager.init();

    // 한도(MAX_CONSECUTIVE_FAILURES) 미만에서는 계속 재시도 가능해야 한다
    for (let i = 0; i < INFINITE_SCROLL_CONFIG.MAX_CONSECUTIVE_FAILURES; i++) {
      const ok = await manager.loadNextPage();
      expect(ok).toBe(false);
      // 어떤 경우에도 스피너가 켜진 채 남아있으면 안 된다
      const ind = document.getElementById(INFINITE_SCROLL_CONFIG.LOADING_INDICATOR_ID);
      if (ind) {
        expect(ind.classList.contains(INFINITE_SCROLL_CONFIG.LOADING_ACTIVE_CLASS)).toBe(false);
      }
    }

    // 한도 도달 후에는 무한 스크롤이 완전히 종료되어야 한다 (스피너 무한 루프 차단)
    expect(manager.isDestroyed()).toBe(true);
    expect(await manager.loadNextPage()).toBe(false);
    const callsAfterDestroy = mockFetch.mock.calls.length;
    expect(callsAfterDestroy).toBe(INFINITE_SCROLL_CONFIG.MAX_CONSECUTIVE_FAILURES);

    // 사용자 안내 문구가 남아야 한다
    expect(document.querySelector(`.${INFINITE_SCROLL_CONFIG.FAILURE_NOTICE_CLASS}`)).not.toBeNull();
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

  it('IntersectionObserver에 ROOT_MARGIN (1200px) 옵션이 올바르게 전달되어야 한다', () => {
    let capturedOptions: any = null;
    const OriginalObserver = (window as any).IntersectionObserver;
    (window as any).IntersectionObserver = vi.fn().mockImplementation((_cb, options) => {
      capturedOptions = options;
      return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      };
    });

    try {
      document.body.innerHTML = `
        <div id="recruit_info_list">
          <div class="content_wrap">
            <div class="item_recruit">공고 1</div>
          </div>
        </div>
        <div class="pagination">1 2</div>
      `;

      const manager = new InfiniteScrollManager({
        adapter: new SaraminAdapter(),
        onCardsAppended: vi.fn(),
      });

      manager.init();
      expect(capturedOptions).not.toBeNull();
      expect(capturedOptions.rootMargin).toBe(INFINITE_SCROLL_CONFIG.ROOT_MARGIN);
      expect(capturedOptions.rootMargin).toBe('1200px');
    } finally {
      (window as any).IntersectionObserver = OriginalObserver;
    }
  });

  it('복수 공고가 반환될 때 DocumentFragment를 통해 한 번에 일괄 추가되어야 한다', async () => {
    document.body.innerHTML = `
      <div id="recruit_info_list">
        <div class="content_wrap">
          <div class="item_recruit">기존 공고</div>
        </div>
      </div>
      <div class="pagination">
        <a href="https://www.saramin.co.kr/zf_user/search?page=2" page="2">2</a>
      </div>
    `;

    const mockMultipleCardsHtml = `
      <html>
        <body>
          <div id="recruit_info_list">
            <div class="content_wrap">
              <div class="item_recruit">
                <div class="area_corp"><span class="corp_name"><a href="#">기업 A</a></span></div>
                <div class="area_job"><h2 class="job_tit"><a href="#">직무 A</a></h2></div>
              </div>
              <div class="item_recruit">
                <div class="area_corp"><span class="corp_name"><a href="#">기업 B</a></span></div>
                <div class="area_job"><h2 class="job_tit"><a href="#">직무 B</a></h2></div>
              </div>
              <div class="item_recruit">
                <div class="area_corp"><span class="corp_name"><a href="#">기업 C</a></span></div>
                <div class="area_job"><h2 class="job_tit"><a href="#">직무 C</a></h2></div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(mockMultipleCardsHtml),
    });

    const onAppended = vi.fn();
    const manager = new InfiniteScrollManager({
      adapter: new SaraminAdapter(),
      onCardsAppended: onAppended,
      fetchFn: mockFetch as any,
    });

    manager.init();

    const success = await manager.loadNextPage();
    expect(success).toBe(true);
    expect(onAppended).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.any(HTMLElement),
        expect.any(HTMLElement),
        expect.any(HTMLElement),
      ])
    );

    const allCards = document.querySelectorAll('.item_recruit');
    expect(allCards.length).toBe(4); // 기존 1개 + 신규 3개
  });

  it('유휴 상태에서는 로딩 인디케이터가 is-active 클래스를 갖지 않아야 한다 (스피너 상시 표시 회귀 방지)', () => {
    document.body.innerHTML = `
      <div id="recruit_info_list">
        <div class="content_wrap">
          <div class="item_recruit">공고 1</div>
        </div>
      </div>
      <div class="pagination">1 2</div>
    `;

    const manager = new InfiniteScrollManager({
      adapter: new SaraminAdapter(),
      onCardsAppended: vi.fn(),
    });

    manager.init();

    const indicator = document.getElementById(INFINITE_SCROLL_CONFIG.LOADING_INDICATOR_ID);
    expect(indicator).not.toBeNull();
    // 초기 생성 직후(로딩 전)에는 반드시 숨김 상태여야 한다
    expect(indicator?.classList.contains(INFINITE_SCROLL_CONFIG.LOADING_ACTIVE_CLASS)).toBe(false);
    expect(indicator?.getAttribute('aria-hidden')).toBe('true');

    // CSS 가 로딩 인디케이터의 기본 표시를 none !important 로 강제하는지 검증
    // (인라인 style.display 로는 !important 를 이길 수 없기 때문에 클래스 기반 제어가 필수)
    const css = fs.readFileSync(path.resolve('src/content/style.css'), 'utf-8');
    const baseRule = css.match(/\.job-filter-infinite-loading\s*\{([^}]*)\}/);
    expect(baseRule).not.toBeNull();
    expect(baseRule![1]).toMatch(/display:\s*none\s*!important/);
    // 활성 상태에서만 표시 규칙이 존재해야 한다
    expect(css).toMatch(
      /\.job-filter-infinite-loading\.is-active\s*\{[^}]*display:\s*flex\s*!important/
    );
  });

  /**
   * [회귀] 사람인 직업별 목록(/zf_user/jobs/list/job-category) 무한 스크롤이
   * 11페이지에서 더 이상 늘어나지 않던 버그.
   *
   * 원인: 사람인 PageBox 의 "다음" 버튼은 10페이지 단위 블록의 첫 페이지를 가리킨다.
   *   - 1페이지 DOM 의 "다음" → page=11
   *   - 11페이지 DOM 의 "다음" → page=21
   * 무한 스크롤은 원본(1페이지) DOM 을 계속 참조하므로 11페이지 이후에도 page=11 만
   * 반복 요청했고, 중복 카드만 돌아와 "신규 카드 0개 → 종료"로 조용히 멈췄다.
   */
  describe('사람인 목록 11페이지 이후 무한 스크롤 회귀 방지', () => {
    const originalLocation = window.location;

    beforeEach(() => {
      delete (window as any).location;
      (window as any).location = new URL(
        'https://www.saramin.co.kr/zf_user/jobs/list/job-category?cat_mcls=2&page_count=50&sort=RL&type=job-category'
      );
    });

    afterEach(() => {
      (window as any).location = originalLocation;
    });

    /** 사람인 목록 1페이지 DOM (PageBox 의 "다음" 은 항상 page=11) */
    const buildFirstPageDom = () => {
      document.body.innerHTML = `
        <div id="default_list_wrap">
          <section class="list_recruiting">
            <div class="list_body">
              <div id="rec-1" class="list_item">
                <div class="area_corp"><strong class="corp_name"><a href="#">기업1</a></strong></div>
                <div class="area_job"><h2 class="job_tit"><a href="#">공고1</a></h2></div>
              </div>
            </div>
          </section>
        </div>
        <div class="PageBox">
          <span class="BtnType SizeS active">1</span>
          <button class="BtnType SizeS" page="2" onclick="location.href='/zf_user/jobs/list/job-category?page=2&amp;cat_mcls=2&amp;page_count=50&amp;sort=RL&amp;type=job-category'">2</button>
          <button class="BtnType SizeS BtnNext" onclick="location.href='/zf_user/jobs/list/job-category?page=11&amp;cat_mcls=2&amp;page_count=50&amp;sort=RL&amp;type=job-category'">다음</button>
        </div>
      `;
    };

    /** 요청 URL 의 page 파라미터에 맞춰 서로 다른 공고를 반환하는 가짜 응답 */
    const createPageAwareFetch = () => {
      const requestedPages: number[] = [];
      const fetchFn = vi.fn().mockImplementation((url: string) => {
        const page = Number(new URL(url).searchParams.get('page') || '1');
        requestedPages.push(page);
        const body = Array.from({ length: 50 })
          .map(
            (_, i) =>
              `<div id="rec-${page}-${i}" class="list_item">
                 <div class="area_corp"><strong class="corp_name"><a href="#">기업 ${page}-${i}</a></strong></div>
                 <div class="area_job"><h2 class="job_tit"><a href="#">공고 ${page}-${i}</a></h2></div>
               </div>`
          )
          .join('');
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              `<html><body><div id="default_list_wrap"><section class="list_recruiting"><div class="list_body">${body}</div></section></div>
               <div class="PageBox"><button class="BtnType SizeS BtnNext" onclick="location.href='/zf_user/jobs/list/job-category?page=11&amp;cat_mcls=2'">다음</button></div>
               </body></html>`
            ),
        });
      });
      return { fetchFn, requestedPages };
    };

    it('11페이지를 받은 뒤에도 12페이지를 요청해야 한다 (page=11 재요청으로 멈추지 않아야 함)', async () => {
      buildFirstPageDom();
      const { fetchFn, requestedPages } = createPageAwareFetch();

      const manager = new InfiniteScrollManager({
        adapter: new SaraminAdapter(),
        onCardsAppended: vi.fn(),
        fetchFn: fetchFn as any,
      });
      manager.init();

      // 11페이지까지 연속 로딩 (1 → 2 → … → 11)
      for (let i = 0; i < 10; i++) {
        expect(await manager.loadNextPage()).toBe(true);
      }
      expect(manager.getCurrentPage()).toBe(11);
      expect(requestedPages).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

      // 12페이지 요청도 정상적으로 이어져야 한다
      expect(await manager.loadNextPage()).toBe(true);
      expect(manager.getCurrentPage()).toBe(12);
      expect(requestedPages[requestedPages.length - 1]).toBe(12);
      // 동일 페이지 반복 요청이 없어야 한다
      expect(new Set(requestedPages).size).toBe(requestedPages.length);
      expect(manager.isDestroyed()).toBe(false);
    });

    it('페이지네이션 링크가 stale 하여 같은 페이지를 재요청하려 하면 무한 반복 대신 안전하게 종료해야 한다', async () => {
      buildFirstPageDom();
      // 항상 존재하지 않는 고정 URL 만 반환하는(=링크가 갱신되지 않는) 비정상 어댑터 시뮬레이션
      const fixedUrlAdapter = new SaraminAdapter();
      vi.spyOn(fixedUrlAdapter, 'getNextPageUrl').mockReturnValue(
        'https://www.saramin.co.kr/zf_user/jobs/list/job-category?page=11&cat_mcls=2'
      );
      // 매니저가 스스로 페이지를 올리므로 currentPage 는 증가하지만, 어댑터가 같은 URL 만 주는 상황
      const fetchFn = vi.fn().mockImplementation((url: string) => {
        const page = Number(new URL(url).searchParams.get('page') || '11');
        const body = `<div id="rec-fixed-${page}" class="list_item">
            <div class="area_corp"><strong class="corp_name"><a href="#">기업 ${page}</a></strong></div>
            <div class="area_job"><h2 class="job_tit"><a href="#">공고 ${page}</a></h2></div>
          </div>`;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(`<html><body>${body}</body></html>`),
        });
      });

      const manager = new InfiniteScrollManager({
        adapter: fixedUrlAdapter,
        onCardsAppended: vi.fn(),
        fetchFn: fetchFn as any,
      });
      manager.init();

      // 첫 요청은 성공
      expect(await manager.loadNextPage()).toBe(true);
      // 같은 URL 재요청이 감지되면 fetch 없이 즉시 종료되어야 한다 (무한 루프 방지)
      expect(await manager.loadNextPage()).toBe(false);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(manager.isDestroyed()).toBe(true);
    });

    it('?page=11 로 진입한 경우 1페이지부터 재요청하지 않고 12페이지부터 이어가야 한다', async () => {
      delete (window as any).location;
      (window as any).location = new URL(
        'https://www.saramin.co.kr/zf_user/jobs/list/job-category?cat_mcls=2&page_count=50&page=11'
      );

      document.body.innerHTML = `
        <div id="default_list_wrap">
          <section class="list_recruiting">
            <div class="list_body">
              <div id="rec-11-1" class="list_item">
                <div class="area_corp"><strong class="corp_name"><a href="#">기업11</a></strong></div>
                <div class="area_job"><h2 class="job_tit"><a href="#">공고11</a></h2></div>
              </div>
            </div>
          </section>
        </div>
        <div class="PageBox">
          <span class="BtnType SizeS active">11</span>
          <button class="BtnType SizeS" page="12" onclick="location.href='/zf_user/jobs/list/job-category?page=12&amp;cat_mcls=2'">12</button>
          <button class="BtnType SizeS BtnNext" onclick="location.href='/zf_user/jobs/list/job-category?page=21&amp;cat_mcls=2'">다음</button>
        </div>
      `;

      const { fetchFn, requestedPages } = createPageAwareFetch();
      const manager = new InfiniteScrollManager({
        adapter: new SaraminAdapter(),
        onCardsAppended: vi.fn(),
        fetchFn: fetchFn as any,
      });
      manager.init();

      // DOM 의 활성 페이지(11)에서 이어서 시작해야 한다
      expect(manager.getCurrentPage()).toBe(11);

      expect(await manager.loadNextPage()).toBe(true);
      expect(requestedPages).toEqual([12]);
      expect(manager.getCurrentPage()).toBe(12);
    });

    /**
     * IntersectionObserver 는 교차 상태가 "바뀔 때만" 이벤트를 준다.
     * 사용자가 바닥에 머무른 채 로딩이 끝나면(센티넬이 계속 화면 안)
     * 다음 이벤트가 오지 않아 목록이 멈춘 것처럼 보였다.
     */
    it('바닥에 머문 채 로딩이 끝나면 IntersectionObserver 이벤트가 없어도 다음 페이지를 이어서 불러와야 한다', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      try {
        buildFirstPageDom();
        const { fetchFn, requestedPages } = createPageAwareFetch();

        // IntersectionObserver 를 수동 제어 가능한 스텁으로 교체
        let observerCallback: ((entries: any[]) => void) | null = null;
        const OriginalObserver = (window as any).IntersectionObserver;
        (window as any).IntersectionObserver = vi.fn().mockImplementation((cb: any) => {
          observerCallback = cb;
          return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
        });

        try {
          const manager = new InfiniteScrollManager({
            adapter: new SaraminAdapter(),
            onCardsAppended: vi.fn(),
            fetchFn: fetchFn as any,
          });
          manager.init();

          // 센티넬이 화면 안에 들어옴 → 로딩 시작
          observerCallback!([{ isIntersecting: true }]);
          await vi.advanceTimersByTimeAsync(0);
          expect(requestedPages).toEqual([2]);

          // 로딩이 끝났지만 교차 상태는 그대로 true → 새 이벤트가 오지 않는 상황
          // 스스로 재확인해서 3페이지를 이어서 요청해야 한다
          await vi.advanceTimersByTimeAsync(
            INFINITE_SCROLL_CONFIG.INTERSECTION_REFILL_DELAY_MS + 50
          );
          expect(requestedPages).toEqual([2, 3]);
          expect(manager.isDestroyed()).toBe(false);
        } finally {
          (window as any).IntersectionObserver = OriginalObserver;
        }
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
