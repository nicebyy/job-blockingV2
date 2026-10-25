import { describe, it, expect, vi } from 'vitest';
import {
  AdapterRegistry,
  WantedAdapter,
  SaraminAdapter,
  JobKoreaAdapter,
} from '../../src/adapters';

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
        </div>
      `;

      const info = adapter.parseCard(card);
      expect(info).not.toBeNull();
      expect(info?.companyName).toBe('당근마켓');
      expect(info?.title).toBe('백엔드 엔지니어 채용');
      expect(info?.jobId).toBe('rec_9999');
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

    it('사람인 상세 페이지의 무한스크롤 릴레이 뷰 컨테이너를 올바르게 파싱해야 한다', () => {
      const relayContainer = document.createElement('div');
      relayContainer.className = 'wrap_jview';
      relayContainer.setAttribute('data-rec-idx', 'rec_77777');
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
      expect(info?.jobId).toBe('rec_77777');
      expect(info?.isAd).toBe(false);
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
  });
});
