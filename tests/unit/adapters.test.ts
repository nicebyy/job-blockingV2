import { describe, it, expect, vi } from 'vitest';
import {
  AdapterRegistry,
  WantedAdapter,
  SaraminAdapter,
  JobKoreaAdapter,
} from '../../src/adapters';
import { FilterEngine } from '../../src/core/filter-engine';

describe('Site Adapters 단위 테스트', () => {
  describe('AdapterRegistry', () => {
    it('URL에 따라 올바른 어댑터를 반환해야 한다', () => {
      const wanted = AdapterRegistry.getAdapterForUrl('https://www.wanted.co.kr/wdlist/518');
      expect(wanted?.name).toBe('Wanted');

      const saramin = AdapterRegistry.getAdapterForUrl('https://www.saramin.co.kr/zf_user/jobs/list/job-category');
      expect(saramin?.name).toBe('Saramin');

      const jobkorea = AdapterRegistry.getAdapterForUrl('https://www.jobkorea.co.kr/recruit/joblist');
      expect(jobkorea?.name).toBe('JobKorea');

      const unknown = AdapterRegistry.getAdapterForUrl('https://www.google.com');
      expect(unknown).toBeNull();
    });
  });

  describe('WantedAdapter DOM 파싱', () => {
    const adapter = new WantedAdapter();

    it('원티드 공고 카드에서 회사명, 제목, Job ID를 정확히 추출해야 한다', () => {
      const card = document.createElement('div');
      card.setAttribute('data-cy', 'job-card');
      card.innerHTML = `
        <a href="/wd/12345">
          <strong class="JobCard_title">시니어 프론트엔드 개발자</strong>
          <span class="companyName">토스</span>
        </a>
      `;

      const info = adapter.parseCard(card);
      expect(info).not.toBeNull();
      expect(info?.companyName).toBe('토스');
      expect(info?.title).toBe('시니어 프론트엔드 개발자');
      expect(info?.jobId).toBe('12345');
      expect(info?.isAd).toBe(false);
    });

    it('광고 뱃지가 있는 공고는 isAd: true로 판정해야 한다', () => {
      const card = document.createElement('div');
      card.innerHTML = `
        <div class="ad_badge">AD</div>
        <span class="companyName">광고기업</span>
        <h4>추천 채용 공고</h4>
      `;

      const info = adapter.parseCard(card);
      expect(info?.isAd).toBe(true);
    });

    it('공고 카드에 [공고숨김] 및 [회사차단] 듀얼 버튼 및 디바이더, 호스트 클래스를 주입해야 한다', () => {
      const card = document.createElement('div');
      const cardInfo = {
        cardElement: card,
        companyName: '원티드랩',
        title: '프로덕트 디자이너',
        isAd: false,
      };

      const onBlockCompany = vi.fn();
      const onBlockJob = vi.fn();

      adapter.injectInlineButton(cardInfo, { onBlockCompany, onBlockJob });

      // 1. 호버 리빌을 위한 호스트 클래스 확인
      expect(card.classList.contains('job-filter-card-host')).toBe(true);

      // 2. 버튼 캡슐 그룹 및 디바이더 확인
      const btnGroup = card.querySelector('.job-filter-btn-group');
      expect(btnGroup).not.toBeNull();

      const divider = card.querySelector('.job-filter-btn-divider');
      expect(divider).not.toBeNull();

      // 3. 버튼 요소 및 툴팁 확인
      const jobBtn = card.querySelector<HTMLButtonElement>('.job-filter-btn-job');
      const companyBtn = card.querySelector<HTMLButtonElement>('.job-filter-btn-company');
      expect(jobBtn).not.toBeNull();
      expect(companyBtn).not.toBeNull();
      expect(jobBtn?.title).toContain('공고만 숨기기');
      expect(companyBtn?.title).toContain('원티드랩');

      // 4. 클릭 이벤트 동작 검증
      jobBtn?.click();
      expect(onBlockJob).toHaveBeenCalledWith(cardInfo);

      companyBtn?.click();
      expect(onBlockCompany).toHaveBeenCalledWith('원티드랩');
    });
  });

  describe('SaraminAdapter DOM 파싱', () => {
    const adapter = new SaraminAdapter();

    it('사람인 공고 카드에서 정보를 올바르게 파싱해야 한다', () => {
      const card = document.createElement('div');
      card.className = 'item_recruit';
      card.setAttribute('value', 'rec_9999');
      card.innerHTML = `
        <div class="area_corp">
          <strong class="corp_name"><a href="#">당근마켓</a></strong>
        </div>
        <div class="area_job">
          <h2 class="job_tit"><a href="#">백엔드 엔지니어 채용</a></h2>
          <span class="date">~ 11/20(금)</span>
        </div>
      `;

      const info = adapter.parseCard(card);
      expect(info).not.toBeNull();
      expect(info?.companyName).toBe('당근마켓');
      expect(info?.title).toBe('백엔드 엔지니어 채용');
      expect(info?.jobId).toBe('rec_9999');
      expect(info?.closingDate).toBe('~ 11/20(금)');
      expect(info?.isAd).toBe(false);
    });

    it('플러스 광고 클래스가 있으면 isAd: true여야 한다', () => {
      const card = document.createElement('div');
      card.className = 'item_recruit plus_ad';
      card.innerHTML = `
        <div class="corp_name"><a href="#">광고회사</a></div>
        <div class="job_tit"><a href="#">상시채용 공고</a></div>
      `;

      const info = adapter.parseCard(card);
      expect(info?.isAd).toBe(true);
    });

    it('사람인 검색 목록 카드에서 [공고숨김] 클릭 시 즉각적인 낙관적 페이드아웃 및 콜백이 정상 작동해야 한다', async () => {
      const card = document.createElement('div');
      card.className = 'item_recruit';
      card.setAttribute('value', '55378966');
      card.innerHTML = `
        <div class="area_job">
          <h2 class="job_tit">
            <a href="#">[Global 1위 반도체 유통사] WT Technology Korea 대구 FAE 채용</a>
          </h2>
          <span class="date">~ 12/22(화)</span>
        </div>
        <div class="area_corp">
          <strong class="corp_name"><a href="#">(주)더블유티테크놀로지코리아</a></strong>
        </div>
      `;

      const cardInfo = adapter.parseCard(card)!;
      expect(cardInfo).not.toBeNull();
      expect(cardInfo.jobId).toBe('55378966');
      expect(cardInfo.closingDate).toBe('~ 12/22(화)');

      const onBlockJob = vi.fn().mockResolvedValue(undefined);
      const onBlockCompany = vi.fn();

      adapter.injectInlineButton(cardInfo, { onBlockCompany, onBlockJob });

      // 개별 카드 내에 버튼이 정확히 앵커되도록 relative 포지셔닝이 설정되어야 함
      expect(card.style.position).toBe('relative');
      expect(card.classList.contains('job-filter-card-host')).toBe(true);

      const hideBtn = card.querySelector<HTMLButtonElement>('.job-filter-btn-job')!;
      expect(hideBtn).not.toBeNull();

      hideBtn.click();

      // 즉각적인 시각적 피드백 (0ms 즉각 DOM 완전 숨김) 확인
      expect(card.style.display).toBe('none');
      expect(card.getAttribute('data-job-filtered')).toBe('true');
      expect(card.getAttribute('data-filter-mode')).toBe('hide');
      expect(onBlockJob).toHaveBeenCalledWith(cardInfo);
    });

    it('사람인 상세 페이지의 무한스크롤 릴레이 뷰 개별 공고 카드를 올바르게 파싱해야 한다', () => {
      const relayContainer = document.createElement('section');
      relayContainer.className = 'jview jview-0-77777';
      relayContainer.innerHTML = `
        <div class="jv_header">
          <a class="company" href="#">B 채용기업</a>
          <h1 class="tit_job">B 포지션 채용공고</h1>
        </div>
        <div class="jv_cont">상세 본문 내용...</div>
      `;

      const info = adapter.parseCard(relayContainer);
      expect(info).not.toBeNull();
      expect(info?.companyName).toBe('B 채용기업');
      expect(info?.title).toBe('B 포지션 채용공고');
      expect(info?.jobId).toBe('77777');
      expect(info?.isAd).toBe(false);
    });

    it('사람인 상세 페이지에서 부모 컨테이너(.wrap_jview)는 카드로 수집되지 않고 내부 개별 .jview 공고들만 정확히 수집되어야 한다', () => {
      const pageWrapper = document.createElement('div');
      pageWrapper.innerHTML = `
        <div class="wrap_jview">
          <section class="jview jview-0-11111">
            <div class="jv_header">
              <span class="company_name">첫번째기업</span>
              <h1 class="tit_job">첫번째 공고</h1>
            </div>
          </section>
          <section class="jview jview-1-22222">
            <div class="jv_header">
              <span class="company_name">두번째기업</span>
              <h1 class="tit_job">두번째 공고</h1>
            </div>
          </section>
        </div>
      `;

      const cards = adapter.getJobCardElements(pageWrapper);
      // 부모인 .wrap_jview는 카드로 잡히지 않고 자식 2개만 반환되어야 함
      expect(cards.length).toBe(2);
      expect(cards.some((el) => el.classList.contains('wrap_jview'))).toBe(false);

      const info1 = adapter.parseCard(cards[0]);
      const info2 = adapter.parseCard(cards[1]);

      expect(info1?.jobId).toBe('11111');
      expect(info1?.companyName).toBe('첫번째기업');

      expect(info2?.jobId).toBe('22222');
      expect(info2?.companyName).toBe('두번째기업');
    });

    it('사람인 상세 페이지 하단 추천 공고 카드를 올바르게 파싱해야 한다', () => {
      const card = document.createElement('li');
      card.className = 'item_recommend';
      card.innerHTML = `
        <a href="/zf_user/jobs/relay/view?rec_idx=88888">
          <span class="corp_name">추천기업B</span>
          <strong class="job_tit">추천 직무 공고</strong>
        </a>
      `;

      const info = adapter.parseCard(card);
      expect(info).not.toBeNull();
      expect(info?.companyName).toBe('추천기업B');
      expect(info?.title).toBe('추천 직무 공고');
      expect(info?.jobId).toBe('88888');
    });

    it('1번 공고를 차단(applyFilter)해도 부모 .wrap_jview는 유지되고 2번 공고는 정상 노출되어야 한다 (빈 페이지 방지)', () => {
      const pageWrapper = document.createElement('div');
      pageWrapper.innerHTML = `
        <div class="wrap_jview">
          <section class="jview jview-0-11111">
            <div class="jv_header">
              <span class="company_name">차단기업</span>
              <h1 class="tit_job">차단할 첫번째 공고</h1>
            </div>
          </section>
          <section class="jview jview-1-22222">
            <div class="jv_header">
              <span class="company_name">통과기업</span>
              <h1 class="tit_job">보존될 두번째 공고</h1>
            </div>
          </section>
        </div>
      `;

      const engine = new FilterEngine(
        {
          mode: 'hide',
          blurIntensity: 5,
          hideAds: false,
          showInlineButton: true,
          enableInfiniteScroll: true,
          showJobplanetRating: true,
        },
        [{ id: '1', pattern: '차단기업', type: 'company', createdAt: Date.now() }]
      );

      const cards = adapter.getJobCardElements(pageWrapper);
      expect(cards.length).toBe(2);

      for (const card of cards) {
        const info = adapter.parseCard(card);
        if (!info) continue;
        const result = engine.evaluateJobCard(info);
        if (result.shouldFilter) {
          engine.applyFilter(card);
        }
      }

      const wrapJview = pageWrapper.querySelector('.wrap_jview') as HTMLElement;
      const card1 = pageWrapper.querySelector('.jview-0-11111') as HTMLElement;
      const card2 = pageWrapper.querySelector('.jview-1-22222') as HTMLElement;

      // 핵심 검증: 부모 컨테이너 자체는 필터링되지 않고 멀쩡히 살아있어야 함
      expect(wrapJview.hasAttribute('data-job-filtered')).toBe(false);
      expect(wrapJview.style.display).not.toBe('none');

      // 1번 공고만 차단
      expect(card1.getAttribute('data-job-filtered')).toBe('true');
      expect(card1.getAttribute('data-filter-mode')).toBe('hide');

      // 2번 공고는 정상 노출 유지
      expect(card2.hasAttribute('data-job-filtered')).toBe(false);
      expect(card2.style.display).not.toBe('none');
    });

    it('hidePromotionBanners 호출 시 AI 검색 배너, 개인 맞춤 추천 공고, 스토어 배너 3종이 모두 display: none 처리되어야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <!-- 1. AI 검색 유도 배너 -->
        <div class="area_ai_search">
          <div class="tit_section">AI로 원하는 채용 정보를 찾아보세요</div>
          <div class="txt_desc">딱 맞는 채용정보를 빠르고 쉽게!</div>
        </div>

        <!-- 2. 개인 맞춤 추천 공고 섹션 -->
        <section class="section_search type_searchup keyword_up_logo_area">
          <h2 class="tit_section">곽현기님을 위한 공고</h2>
          <div class="wrap_searchup">추천 슬라이더...</div>
        </section>

        <!-- 3. 스토어 프로모션 배너 -->
        <section class="wrap_store">
          <div id="store_product">막막한 취업·이직 준비는 스토어에서!</div>
          <a class="txt_link" href="#">스토어 바로가기</a>
        </section>

        <!-- 일반 정상 채용 공고 (숨겨지지 않아야 함) -->
        <div class="item_recruit">
          <div class="corp_name"><a href="#">일반회사</a></div>
        </div>
      `;

      adapter.hidePromotionBanners(container);

      const aiBanner = container.querySelector<HTMLElement>('.area_ai_search');
      const recommendSection = container.querySelector<HTMLElement>('section.keyword_up_logo_area');
      const storeBanner = container.querySelector<HTMLElement>('section.wrap_store');
      const normalJob = container.querySelector<HTMLElement>('.item_recruit');

      expect(aiBanner?.style.display).toBe('none');
      expect(aiBanner?.getAttribute('data-job-filtered')).toBe('true');

      expect(recommendSection?.style.display).toBe('none');
      expect(recommendSection?.getAttribute('data-job-filtered')).toBe('true');

      expect(storeBanner?.style.display).toBe('none');
      expect(storeBanner?.getAttribute('data-job-filtered')).toBe('true');

      // 일반 공고는 영향받지 않아야 함
      expect(normalJob?.style.display).not.toBe('none');
    });
  });

  describe('JobKoreaAdapter DOM 파싱', () => {
    const adapter = new JobKoreaAdapter();

    it('잡코리아 공고 카드에서 정보를 올바르게 파싱해야 한다', () => {
      const card = document.createElement('li');
      card.className = 'list-post';
      card.setAttribute('data-gno', 'gno_8888');
      card.innerHTML = `
        <div class="post-list-corp"><a href="#">우아한형제들</a></div>
        <div class="post-list-info"><a class="title" href="#">데이터 엔지니어 채용</a></div>
      `;

      const info = adapter.parseCard(card);
      expect(info).not.toBeNull();
      expect(info?.companyName).toBe('우아한형제들');
      expect(info?.title).toBe('데이터 엔지니어 채용');
      expect(info?.jobId).toBe('gno_8888');
      expect(info?.isAd).toBe(false);
    });

    it('사람인 및 잡코리아는 supportsInfiniteScroll이 true여야 한다', () => {
      const saramin = new SaraminAdapter();
      expect(saramin.supportsInfiniteScroll).toBe(true);
      expect(adapter.supportsInfiniteScroll).toBe(true);

      const wanted = new WantedAdapter();
      expect(wanted.supportsInfiniteScroll).toBe(false);
    });

    it('사람인 어댑터는 페이지네이션 링크에서 다음 페이지 URL을 추출할 수 있어야 한다', () => {
      const saramin = new SaraminAdapter();
      const doc = document.implementation.createHTMLDocument();
      doc.body.innerHTML = `
        <div class="pagination">
          <a href="https://www.saramin.co.kr/zf_user/search?page=3" page="3">3</a>
        </div>
      `;

      const nextUrl = saramin.getNextPageUrl(doc, 2);
      expect(nextUrl).toContain('page=3');
    });

    it('사람인 실서비스 형태인 href="#recruit_info" 및 page="2" 링크에서 recruitPage=2 URL을 생성해야 한다', () => {
      const saramin = new SaraminAdapter();
      const doc = document.implementation.createHTMLDocument();
      doc.body.innerHTML = `
        <div class="pagination">
          <a href="#recruit_info" page="2" class="page page_move"><span>2</span></a>
        </div>
      `;

      const nextUrl = saramin.getNextPageUrl(doc, 1);
      expect(nextUrl).not.toBeNull();
      expect(nextUrl).toContain('recruitPage=2');
      expect(nextUrl).not.toContain('#recruit_info');
    });

    it('사람인 getCardListContainer는 #recruit_info_list 내부의 .content 요소를 우선 반환해야 한다', () => {
      const saramin = new SaraminAdapter();
      const doc = document.implementation.createHTMLDocument();
      doc.body.innerHTML = `
        <div id="recruit_info_list">
          <div class="content">
            <div class="item_recruit">카드 1</div>
          </div>
          <div class="content_bottom">
            <div class="pagination">1 2</div>
          </div>
        </div>
      `;

      const container = saramin.getCardListContainer(doc);
      expect(container).not.toBeNull();
      expect(container?.className).toBe('content');
      expect(container?.parentElement?.id).toBe('recruit_info_list');
    });
  });

  describe('잡플래닛 평점 뱃지 주입 (injectRatingBadge)', () => {
    const adapter = new WantedAdapter();

    it('평점이 존재하고 단일 기업일 때 기업명 옆에 평점 뱃지를 배치해야 한다', () => {
      const card = document.createElement('div');
      card.innerHTML = `
        <span class="companyName">우아한형제들</span>
        <strong class="JobCard_title">백엔드 개발자</strong>
      `;
      const cardInfo = adapter.parseCard(card)!;

      adapter.injectRatingBadge(cardInfo, {
        status: 'found',
        companyName: '우아한형제들',
        rating: 3.8,
        companyId: 61420,
        cachedAt: Date.now(),
      });

      const badge = card.querySelector('.job-filter-rating-badge');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain('3.8');
      expect(badge?.classList.contains('job-filter-rating-high')).toBe(true);
      expect(badge?.getAttribute('href')).toBe('https://www.jobplanet.co.kr/companies/61420');

      // 기업명 바로 다음에 배치되었는지 확인
      const companyEl = card.querySelector('.companyName');
      expect(companyEl?.nextElementSibling).toBe(badge);
    });

    it('동명의 회사가 여러 개인 경우(status: ambiguous) 뱃지를 배치하지 않아야 한다 (배치x)', () => {
      const card = document.createElement('div');
      card.innerHTML = `
        <span class="companyName">동명시스템</span>
      `;
      const cardInfo = adapter.parseCard(card)!;

      adapter.injectRatingBadge(cardInfo, {
        status: 'ambiguous',
        companyName: '동명시스템',
        cachedAt: Date.now(),
      });

      const badge = card.querySelector('.job-filter-rating-badge');
      expect(badge).toBeNull();
    });

    it('회사가 존재하지 않는 경우(status: not_found) 뱃지를 배치하지 않아야 한다 (배치x)', () => {
      const card = document.createElement('div');
      card.innerHTML = `
        <span class="companyName">미존재기업</span>
      `;
      const cardInfo = adapter.parseCard(card)!;

      adapter.injectRatingBadge(cardInfo, {
        status: 'not_found',
        companyName: '미존재기업',
        cachedAt: Date.now(),
      });

      const badge = card.querySelector('.job-filter-rating-badge');
      expect(badge).toBeNull();
    });

    it('이미 주입된 경우 중복하여 주입하지 않아야 한다', () => {
      const card = document.createElement('div');
      card.innerHTML = `
        <span class="companyName">카카오</span>
      `;
      const cardInfo = adapter.parseCard(card)!;

      const ratingInfo = {
        status: 'found' as const,
        companyName: '카카오',
        rating: 3.8,
        companyId: 93880,
        cachedAt: Date.now(),
      };

      adapter.injectRatingBadge(cardInfo, ratingInfo);
      adapter.injectRatingBadge(cardInfo, ratingInfo);

      const badges = card.querySelectorAll('.job-filter-rating-badge');
      expect(badges.length).toBe(1);
    });

    it('뱃지 클릭 시 공고 카드로의 이벤트 전파(stopPropagation)를 차단해야 한다', () => {
      const card = document.createElement('div');
      card.innerHTML = `
        <span class="companyName">토스</span>
      `;
      const cardInfo = adapter.parseCard(card)!;

      adapter.injectRatingBadge(cardInfo, {
        status: 'found',
        companyName: '토스',
        rating: 4.1,
        companyId: 1234,
        cachedAt: Date.now(),
      });

      const badge = card.querySelector('.job-filter-rating-badge') as HTMLElement;
      expect(badge).not.toBeNull();

      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      const stopSpy = vi.spyOn(event, 'stopPropagation');
      badge.dispatchEvent(event);
      expect(stopSpy).toHaveBeenCalled();
    });
  });
});

