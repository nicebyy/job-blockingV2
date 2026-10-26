import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  AdapterRegistry,
  WantedAdapter,
  SaraminAdapter,
  JobKoreaAdapter,
} from '../../src/adapters';
import { FilterEngine } from '../../src/core/filter-engine';
import { RATING_BADGE_CONFIG } from '../../src/constants';

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

    it('원티드 실 브라우저 렌더링 픽스처(wanted_wdlist.html)에서 20개 공고 카드를 중복 없이 파싱해야 한다', () => {
      const fixturePath = path.resolve(__dirname, '../fixtures/wanted_wdlist.html');
      const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');
      const container = document.createElement('div');
      container.innerHTML = fixtureHtml;

      const cards = adapter.getJobCardElements(container);
      expect(cards.length).toBe(20);

      // 첫 번째 카드 정보 검증 (매드업)
      const firstCard = cards[0];
      const firstInfo = adapter.parseCard(firstCard);
      expect(firstInfo).not.toBeNull();
      expect(firstInfo?.companyName).toBe('매드업');
      expect(firstInfo?.title).toBe('[AI 마케팅 개발실] Forward Deployed Engineer (FDE)');
      expect(firstInfo?.jobId).toBe('394698');
      expect(firstInfo?.closingDate).toContain('서울 서초구');
      expect(firstInfo?.isAd).toBe(false);

      // 두 번째 카드 정보 검증 (미소)
      const secondCard = cards[1];
      const secondInfo = adapter.parseCard(secondCard);
      expect(secondInfo).not.toBeNull();
      expect(secondInfo?.companyName).toBe('미소(miso)');
      expect(secondInfo?.title).toBe('Back-end Engineer (견적형 서비스)');
      expect(secondInfo?.jobId).toBe('391250');

      // 세 번째 카드 정보 검증 (리스타)
      const thirdCard = cards[2];
      const thirdInfo = adapter.parseCard(thirdCard);
      expect(thirdInfo).not.toBeNull();
      expect(thirdInfo?.companyName).toBe('리스타');
      expect(thirdInfo?.title).toBe('광고 플랫폼 풀스택 개발자');
      expect(thirdInfo?.jobId).toBe('386949');
    });

    it('원티드 "🔥 적극 채용 중인 회사" 섹션(AdTargetList)을 hidePromotionBanners로 완전 숨김 처리해야 한다', () => {
      const fixturePath = path.resolve(__dirname, '../fixtures/wanted_wdlist.html');
      const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');
      const container = document.createElement('div');
      container.innerHTML = fixtureHtml;

      const adSectionBefore = container.querySelector('section[class*="AdTargetList_"]');
      expect(adSectionBefore).not.toBeNull();
      expect((adSectionBefore as HTMLElement).style.display).not.toBe('none');

      const hiddenCount = adapter.hidePromotionBanners(container);
      expect(hiddenCount).toBe(1);

      const adSectionAfter = container.querySelector('section[class*="AdTargetList_"]') as HTMLElement;
      expect(adSectionAfter.style.display).toBe('none');
      expect(adSectionAfter.getAttribute('data-job-filtered')).toBe('true');
      expect(adSectionAfter.getAttribute('data-filter-mode')).toBe('hide');
      expect(adSectionAfter.getAttribute('data-blocked-type')).toBe('ad');
    });

    it('원티드 상세 페이지(/wd/394698) 상단 헤더 영역에서 공고 정보를 파싱하고 인라인 버튼을 배치해야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <section class="JobHeader_JobHeader__test123">
          <div class="JobHeader_JobHeader__Tools__test456">
            <h1 class="montage-g4lz5p">클라우드 아키텍트 채용</h1>
            <a class="JobHeader_JobHeader__Tools__Company__Link__abc" data-attribute-id="company__click" data-company-name="당근" href="/company/123">당근</a>
          </div>
        </section>
      `;

      const cards = adapter.getJobCardElements(container);
      expect(cards.length).toBe(1);

      const card = cards[0];
      const info = adapter.parseCard(card);
      expect(info).not.toBeNull();
      expect(info?.companyName).toBe('당근');
      expect(info?.title).toBe('클라우드 아키텍트 채용');

      const onBlockCompany = vi.fn();
      const onBlockJob = vi.fn();
      adapter.injectInlineButton(info!, { onBlockCompany, onBlockJob });

      const toolsContainer = card.querySelector('.JobHeader_JobHeader__Tools__test456');
      const btnGroup = toolsContainer?.querySelector('.job-filter-btn-group');
      expect(btnGroup).not.toBeNull();
      expect(btnGroup?.classList.contains('job-filter-btn-group-detail')).toBe(true);
    });

    it('원티드 공고 카드에 잡플래닛 및 블라인드 평점 뱃지가 회사명 바로 옆에 주입되어야 한다', () => {
      const card = document.createElement('div');
      card.setAttribute('data-cy', 'job-card');
      card.className = 'JobCard_JobCard__test';
      card.innerHTML = `
        <a href="/wd/394698">
          <div class="JobCard_JobCard__body__test">
            <span class="JobCard_JobCard__body__position__test">백엔드 시니어 개발자</span>
            <span class="CompanyNameWithLocationPeriod_CompanyNameWithLocationPeriod__company__test">네이버</span>
            <span class="CompanyNameWithLocationPeriod_CompanyNameWithLocationPeriod__location__test">경기 성남시</span>
          </div>
        </a>
      `;

      const cardInfo = adapter.parseCard(card)!;
      expect(cardInfo).not.toBeNull();

      // 잡플래닛 평점 주입
      adapter.injectRatingBadge(cardInfo, {
        platform: 'jobplanet',
        companyName: '네이버',
        rating: 4.2,
        status: 'found',
        companyId: '1234',
        cachedAt: Date.now(),
      });

      // 블라인드 평점 주입
      adapter.injectRatingBadge(cardInfo, {
        platform: 'blind',
        companyName: '네이버',
        rating: 4.0,
        status: 'found',
        companyUrl: 'https://www.teamblind.com/kr/company/%EB%84%A4%EC%9D%B4%EB%B2%84',
        cachedAt: Date.now(),
      });

      const companyEl = adapter.getCompanyElement(card);
      expect(companyEl).not.toBeNull();

      const ratingWrap = card.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.WRAP}`);
      expect(ratingWrap).not.toBeNull();
      expect(companyEl?.nextElementSibling).toBe(ratingWrap);

      const jpBadge = ratingWrap?.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.JOBPLANET}`);
      expect(jpBadge).not.toBeNull();
      expect(jpBadge?.textContent).toContain('잡플래닛');
      expect(jpBadge?.textContent).toContain('4.2');

      const blindBadge = ratingWrap?.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.BLIND}`);
      expect(blindBadge).not.toBeNull();
      expect(blindBadge?.textContent).toContain('블라인드');
      expect(blindBadge?.textContent).toContain('4.0');
    });

    it('원티드 리스트 카드 수집 시 상위 li 그리드 아이템(LI)을 카드로 수집하여 공고 숨김 시 CSS 그리드 빈칸 없이 카드가 당겨와야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <ul class="List_List__test">
          <li class="Card_Card__item1">
            <div data-cy="job-card" class="JobCard_JobCard__test">
              <a href="/wd/111">
                <span class="companyName">회사1</span>
                <strong class="JobCard_title">프론트1</strong>
              </a>
            </div>
          </li>
          <li class="Card_Card__item2">
            <div data-cy="job-card" class="JobCard_JobCard__test">
              <a href="/wd/222">
                <span class="companyName">회사2</span>
                <strong class="JobCard_title">백엔드2</strong>
              </a>
            </div>
          </li>
        </ul>
      `;

      const cards = adapter.getJobCardElements(container);
      expect(cards.length).toBe(2);
      expect(cards[0].tagName).toBe('LI');
      expect(cards[1].tagName).toBe('LI');
      expect(cards[0].classList.contains('Card_Card__item1')).toBe(true);
      expect(cards[1].classList.contains('Card_Card__item2')).toBe(true);

      const info1 = adapter.parseCard(cards[0]);
      expect(info1?.companyName).toBe('회사1');
      expect(info1?.jobId).toBe('111');

      // FilterEngine hide 적용 시 li 요소 자체가 display: none이 되는지 확인
      const engine = new FilterEngine({
        mode: 'hide',
        blurIntensity: 5,
        hideAds: false,
        showInlineButton: true,
        enableInfiniteScroll: true,
        showJobplanetRating: true,
        showBlindRating: true,
      });

      engine.applyFilter(cards[0], 'hide');
      expect(cards[0].style.display).toBe('none');
      expect(cards[0].getAttribute('data-job-filtered')).toBe('true');
      expect(cards[0].getAttribute('data-filter-mode')).toBe('hide');
    });

    it('원티드 리스트 카드에서 [공고숨김] 클릭 시 상위 li 그리드 아이템이 즉시 display: none으로 은닉되어야 한다', async () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <ul class="List_List__test">
          <li class="Card_Card__item1">
            <div data-cy="job-card" class="JobCard_JobCard__test">
              <a href="/wd/333">
                <span class="companyName">당겨오기회사</span>
                <strong class="JobCard_title">테스트엔지니어</strong>
              </a>
            </div>
          </li>
        </ul>
      `;

      const cards = adapter.getJobCardElements(container);
      expect(cards[0].tagName).toBe('LI');
      const cardInfo = adapter.parseCard(cards[0])!;

      const onBlockJob = vi.fn().mockResolvedValue(undefined);
      const onBlockCompany = vi.fn().mockResolvedValue(undefined);

      adapter.injectInlineButton(cardInfo, { onBlockCompany, onBlockJob });

      const hideJobBtn = cards[0].querySelector<HTMLButtonElement>('.job-filter-btn-job')!;
      expect(hideJobBtn).not.toBeNull();

      hideJobBtn.click();

      // 상위 li가 완전히 display: none 처리되어 CSS Grid가 셀을 수축(Reflow)시키고 다음 카드를 당겨옴
      expect(cards[0].style.display).toBe('none');
      expect(cards[0].getAttribute('data-job-filtered')).toBe('true');
      expect(cards[0].getAttribute('data-filter-mode')).toBe('hide');
      expect(onBlockJob).toHaveBeenCalled();
    });

    it('cardElement가 자식 div로 전달된 경우에도 injectInlineButton이 상위 li를 찾아 즉시 display: none 처리해야 한다', () => {
      const li = document.createElement('li');
      li.className = 'Card_Card__wrapper';
      const childCard = document.createElement('div');
      childCard.setAttribute('data-cy', 'job-card');
      childCard.innerHTML = `
        <a href="/wd/444">
          <span class="companyName">서브카드회사</span>
          <strong class="JobCard_title">데브옵스</strong>
        </a>
      `;
      li.appendChild(childCard);

      const cardInfo = {
        cardElement: childCard,
        companyName: '서브카드회사',
        title: '데브옵스',
        jobId: '444',
        isAd: false,
      };

      const onBlockCompany = vi.fn();
      const onBlockJob = vi.fn();

      adapter.injectInlineButton(cardInfo, { onBlockCompany, onBlockJob });

      const hideJobBtn = childCard.querySelector<HTMLButtonElement>('.job-filter-btn-job')!;
      expect(hideJobBtn).not.toBeNull();

      hideJobBtn.click();

      // childCard뿐만 아니라 상위 li도 즉시 display: none 처리됨
      expect(li.style.display).toBe('none');
      expect(li.getAttribute('data-job-filtered')).toBe('true');
      expect(li.getAttribute('data-filter-mode')).toBe('hide');
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

    it('사람인 검색 카드에 기업정보 팝업 링크가 포함되어 있어도 실제 회사명((주)데이타뱅크)을 정확히 파싱해야 한다', () => {
      const card = document.createElement('div');
      card.className = 'item_recruit';
      card.setAttribute('value', '55383565');
      card.innerHTML = `
        <div class="area_job">
          <h2 class="job_tit">
            <a href="#">[대구]미들웨어(M/W) 엔지니어를 모집합니다</a>
          </h2>
          <span class="date">~ 11/09(월)</span>
        </div>
        <div class="area_corp">
          <strong class="corp_name">
            <a href="/zf_user/company-info/view" class="track_event data_layer">
              (주)데이타뱅크
            </a>
          </strong>
          <div class="area_btn">
            <div class="area_corp_info">
              <a href="#" class="btn_info track_event data_layer company_popup">
                기업정보
              </a>
            </div>
          </div>
        </div>
      `;

      const cardInfo = adapter.parseCard(card);
      expect(cardInfo).not.toBeNull();
      // '기업정보' 팝업 버튼 링크가 아닌 실제 회사명 '(주)데이타뱅크'가 파싱되어야 함
      expect(cardInfo?.companyName).toBe('(주)데이타뱅크');
      expect(cardInfo?.title).toBe('[대구]미들웨어(M/W) 엔지니어를 모집합니다');

      const companyEl = adapter.getCompanyElement(card);
      expect(companyEl).not.toBeNull();
      expect(companyEl?.textContent?.trim()).toBe('(주)데이타뱅크');

      // 회사차단 버튼 클릭 시 데이타뱅크가 전달되는지 확인
      const onBlockCompany = vi.fn();
      adapter.injectInlineButton(cardInfo!, { onBlockCompany, onBlockJob: vi.fn() });

      const blockCompanyBtn = card.querySelector<HTMLButtonElement>('.job-filter-btn-company');
      expect(blockCompanyBtn?.title).toContain('데이타뱅크');
      blockCompanyBtn?.click();
      expect(onBlockCompany).toHaveBeenCalledWith('(주)데이타뱅크');
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

    it('사람인 상세 페이지 실구조(title_inner, a.company, wrap_jv_cont)에서 중복 없이 단일 공고 카드로 수집되어야 한다', () => {
      const pageWrapper = document.createElement('div');
      pageWrapper.innerHTML = `
        <div class="wrap_jview">
          <section class="jview jview-0-55311548">
            <div class="wrap_jv_cont">
              <div class="wrap_jv_header">
                <div class="jv_header" data-rec_idx="55311548" data-rec_seq="0">
                  <div class="title_inner">
                    <a href="/zf_user/company-info/view" class="company">대림바스(주)</a>
                    <button class="btn_interest">관심기업</button>
                  </div>
                  <h1 class="tit_job">[국내1위 대림바스] IT / 디자인팀 담당자 채용</h1>
                </div>
              </div>
            </div>
          </section>
        </div>
      `;

      const cards = adapter.getJobCardElements(pageWrapper);
      // 부모 .wrap_jview 및 자식 .wrap_jv_cont는 제외되고 오직 단일 section.jview만 수집되어야 함
      expect(cards.length).toBe(1);
      expect(cards[0].tagName).toBe('SECTION');
      expect(cards[0].classList.contains('jview')).toBe(true);

      const parsed = adapter.parseCard(cards[0]);
      expect(parsed?.companyName).toBe('대림바스(주)');
      expect(parsed?.title).toBe('[국내1위 대림바스] IT / 디자인팀 담당자 채용');
      expect(parsed?.jobId).toBe('55311548');
    });

    it('사람인 상세 페이지에서 인라인 버튼이 .title_inner에 상시 노출(detail 클래스)로 주입되고, 클릭 시 루트 카드가 완전히 숨겨져야 한다', async () => {
      const pageWrapper = document.createElement('div');
      pageWrapper.innerHTML = `
        <div class="wrap_jview">
          <section class="jview jview-0-55311548">
            <div class="wrap_jv_cont">
              <div class="wrap_jv_header">
                <div class="jv_header" data-rec_idx="55311548" data-rec_seq="0">
                  <div class="title_inner">
                    <a href="#" class="company">대림바스(주)</a>
                    <button class="btn_interest">관심기업</button>
                  </div>
                  <h1 class="tit_job">[국내1위 대림바스] IT / 디자인팀 담당자 채용</h1>
                  <div class="btn_apply"><button class="sri_btn_lg">입사지원</button></div>
                </div>
              </div>
            </div>
          </section>
        </div>
      `;

      const section = pageWrapper.querySelector<HTMLElement>('section.jview')!;
      const cardInfo = adapter.parseCard(section)!;
      expect(cardInfo).not.toBeNull();

      const onBlockCompany = vi.fn().mockResolvedValue(undefined);
      const onBlockJob = vi.fn().mockResolvedValue(undefined);

      adapter.injectInlineButton(cardInfo, { onBlockCompany, onBlockJob });

      const titleInner = section.querySelector('.title_inner')!;
      const btnGroup = titleInner.querySelector<HTMLElement>('.job-filter-btn-group');

      // 1. 상세 페이지 헤더 내 .title_inner에 툴바가 주입되었는지 검증
      expect(btnGroup).not.toBeNull();
      expect(btnGroup?.classList.contains('job-filter-btn-group-detail')).toBe(true);

      // 2. [공고숨김] 버튼 클릭 시 header만 짤리지 않고 루트 카드(section) 전체가 즉시 숨김 처리되는지 검증
      const hideJobBtn = btnGroup?.querySelector<HTMLButtonElement>('.job-filter-btn-job')!;
      expect(hideJobBtn).not.toBeNull();
      hideJobBtn.click();

      expect(section.style.display).toBe('none');
      expect(section.getAttribute('data-job-filtered')).toBe('true');
      expect(section.getAttribute('data-filter-mode')).toBe('hide');
      expect(onBlockJob).toHaveBeenCalledWith(cardInfo);
    });

    it('사람인 상세 페이지에서 회사 평점 뱃지가 .title_inner 내 회사명 바로 옆에 정상 주입되어야 한다', () => {
      const pageWrapper = document.createElement('div');
      pageWrapper.innerHTML = `
        <div class="wrap_jview">
          <section class="jview jview-0-55311548">
            <div class="wrap_jv_cont">
              <div class="wrap_jv_header">
                <div class="jv_header" data-rec_idx="55311548" data-rec_seq="0">
                  <div class="title_inner">
                    <a href="#" class="company">대림바스(주)</a>
                    <button class="btn_interest">관심기업</button>
                  </div>
                  <h1 class="tit_job">[국내1위 대림바스] IT / 디자인팀 담당자 채용</h1>
                </div>
              </div>
            </div>
          </section>
        </div>
      `;

      const section = pageWrapper.querySelector<HTMLElement>('section.jview')!;
      const cardInfo = adapter.parseCard(section)!;

      const companyEl = adapter.getCompanyElement(section);
      expect(companyEl).not.toBeNull();
      expect(companyEl?.textContent?.trim()).toBe('대림바스(주)');

      // 잡플래닛 평점 주입
      adapter.injectRatingBadge(cardInfo, {
        platform: 'jobplanet',
        companyName: '대림바스(주)',
        rating: 3.4,
        status: 'found',
        companyId: '12345',
        cachedAt: Date.now(),
      });

      // 블라인드 평점 주입
      adapter.injectRatingBadge(cardInfo, {
        platform: 'blind',
        companyName: '대림바스(주)',
        rating: 3.7,
        status: 'found',
        cachedAt: Date.now(),
      });

      const titleInner = section.querySelector('.title_inner')!;
      const ratingsWrap = titleInner.querySelector('.job-filter-ratings-wrap')!;
      expect(ratingsWrap).not.toBeNull();

      // 회사명 바로 다음 형제 요소로 뱃지 래퍼가 위치해야 함
      expect(companyEl?.nextElementSibling).toBe(ratingsWrap);

      const jpBadge = ratingsWrap.querySelector('.job-filter-rating-jobplanet');
      const blindBadge = ratingsWrap.querySelector('.job-filter-rating-blind');
      expect(jpBadge).not.toBeNull();
      expect(blindBadge).not.toBeNull();
      expect(jpBadge?.textContent).toContain('3.4');
      expect(blindBadge?.textContent).toContain('3.7');
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
          showBlindRating: true,
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

    it('잡코리아 채용목록 테이블 행(tr.devloopArea)에서 회사명, 공고제목, data-gno, 마감일을 정확히 파싱해야 한다', () => {
      const row = document.createElement('tr');
      row.className = 'devloopArea';
      row.setAttribute('data-gno', '50226383');
      row.setAttribute('data-info', ' 50226383|51825874|judarobe|C|AM||29205629');
      row.innerHTML = `
        <th scope="row"><span class="tplChkRect"></span></th>
        <td class="tplCo">
          <a href="/Recruit/Co_Read/C/29205629" class="link normalLog">㈜다로베</a>
        </td>
        <td class="tplTit">
          <div class="titBx">
            <strong><a href="/Recruit/GI_Read/50226383" class="link normalLog">[서울숲 다로베] 홀직원 채용공고</a></strong>
          </div>
        </td>
        <td class="tplPrv"><button type="button">미리보기</button></td>
        <td class="odd">
          <button type="button" class="tplBtn">즉시지원</button>
          <span class="time dotum">3일 전 등록</span>
          <span class="date dotum"><span class="tahoma">~11/22</span>(일)</span>
        </td>
      `;

      const info = adapter.parseCard(row);
      expect(info).not.toBeNull();
      expect(info?.companyName).toBe('㈜다로베');
      expect(info?.title).toBe('[서울숲 다로베] 홀직원 채용공고');
      expect(info?.jobId).toBe('50226383');
      expect(info?.closingDate).toBe('~11/22(일)');
      expect(info?.isAd).toBe(false);
    });

    it('잡코리아 상단 퍼포먼스 추천공고(.job-recommendation-item)는 isAd: true로 판정되어야 한다', () => {
      const recoItem = document.createElement('li');
      recoItem.className = 'job-recommendation-item devloopArea';
      recoItem.setAttribute('data-info', ' 50239993|51837473|hkconsulting89|C|AM||49997886');
      recoItem.innerHTML = `
        <div class="job-recommendation-details">
          <span class="company-name"><a href="#">케이에이치컨설팅㈜</a></span>
          <p class="title"><a href="#">기계설비 기술인 채용</a></p>
          <div class="info"><div class="deadline">D-30</div></div>
        </div>
      `;

      const info = adapter.parseCard(recoItem);
      expect(info).not.toBeNull();
      expect(info?.companyName).toBe('케이에이치컨설팅㈜');
      expect(info?.title).toBe('기계설비 기술인 채용');
      expect(info?.jobId).toBe('50239993');
      expect(info?.closingDate).toBe('D-30');
      expect(info?.isAd).toBe(true);
    });

    it('잡코리아 hidePromotionBanners 호출 시 추천 공고 섹션 및 배너들이 숨김 처리되어야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="job-recommendation">
          <h2>추천 채용정보</h2>
        </div>
        <div id="dev-BNewsAGI">배너 광고</div>
        <div class="tplList tplJobList">
          <table><tbody><tr><td>일반 공고</td></tr></tbody></table>
        </div>
      `;

      adapter.hidePromotionBanners(container);

      const recoSection = container.querySelector<HTMLElement>('.job-recommendation');
      const banner = container.querySelector<HTMLElement>('#dev-BNewsAGI');
      const normalList = container.querySelector<HTMLElement>('.tplList');

      expect(recoSection?.style.display).toBe('none');
      expect(recoSection?.getAttribute('data-job-filtered')).toBe('true');
      expect(banner?.style.display).toBe('none');
      expect(banner?.getAttribute('data-job-filtered')).toBe('true');
      expect(normalList?.style.display).not.toBe('none');
    });

    it('잡코리아 테이블 행(tr)에 injectInlineButton 호출 시 제목 셀(.titBx 및 td.tplTit)에 툴바가 앵커되어야 한다', () => {
      const row = document.createElement('tr');
      row.className = 'devloopArea';
      row.setAttribute('data-gno', '50226383');
      row.innerHTML = `
        <td class="tplCo"><a href="#">㈜다로베</a></td>
        <td class="tplTit"><div class="titBx"><a href="#">홀직원 채용</a></div></td>
      `;

      const info = adapter.parseCard(row)!;
      const onBlockCompany = vi.fn();
      const onBlockJob = vi.fn();

      adapter.injectInlineButton(info, { onBlockCompany, onBlockJob });

      const titBx = row.querySelector<HTMLElement>('.titBx');
      expect(titBx?.style.position).toBe('relative');
      const titCell = row.querySelector<HTMLElement>('td.tplTit');
      expect(titCell?.style.position).toBe('relative');
      const btnGroup = titCell?.querySelector('.job-filter-btn-group');
      expect(btnGroup).not.toBeNull();

      // tr 자체의 자식으로 직접 삽입되지 않고 td.tplTit 내부에 삽입되었는지 검증
      expect(row.children.length).toBe(2);
    });

    it('잡코리아 테이블 행(tr)에 injectRatingBadge 호출 시 회사명 바로 옆에 뱃지가 삽입되어야 한다', () => {
      const row = document.createElement('tr');
      row.className = 'devloopArea';
      row.innerHTML = `
        <td class="tplCo"><a href="#" class="company-link">㈜다로베</a></td>
        <td class="tplTit"><a href="#">홀직원 채용</a></td>
      `;

      const info = adapter.parseCard(row)!;
      adapter.injectRatingBadge(info, {
        companyName: '㈜다로베',
        status: 'found',
        rating: 4.2,
        platform: 'jobplanet',
        companyId: 12345,
        cachedAt: Date.now(),
      });

      adapter.injectRatingBadge(info, {
        companyName: '㈜다로베',
        status: 'found',
        rating: 3.8,
        platform: 'blind',
        cachedAt: Date.now(),
      });

      const wrap = row.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.WRAP}`);
      expect(wrap).not.toBeNull();
      expect(wrap?.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.JOBPLANET}`)).not.toBeNull();
      expect(wrap?.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.BLIND}`)).not.toBeNull();
    });

    it('잡코리아 테이블 행에 찜하기(하트) 버튼(.tplBtnFavOff)이 있을 때 injectRatingBadge 호출 시 하트 버튼 뒤에 평점 래퍼가 주입되어 겹치지 않아야 한다', () => {
      const row = document.createElement('tr');
      row.className = 'devloopArea';
      row.innerHTML = `
        <td class="tplCo">
          <a href="#" class="company-link">㈜에이에이치푸드</a>
          <button type="button" class="tplBtnTy tplBtnFavOff dev-favor"><span class="blind">관심기업</span></button>
        </td>
        <td class="tplTit"><a href="#">주방요리사 채용</a></td>
      `;

      const info = adapter.parseCard(row)!;
      adapter.injectRatingBadge(info, {
        companyName: '㈜에이에이치푸드',
        status: 'found',
        rating: 1.0,
        platform: 'jobplanet',
        cachedAt: Date.now(),
      });

      const tplCo = row.querySelector<HTMLElement>('td.tplCo')!;
      const companyLink = tplCo.querySelector('.company-link')!;
      const favBtn = tplCo.querySelector('.tplBtnFavOff')!;
      const wrap = tplCo.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.WRAP}`)!;

      expect(favBtn).not.toBeNull();
      expect(wrap).not.toBeNull();
      // 하트 버튼(favBtn)이 회사명 뒤에 그대로 유지되고, wrap은 하트 버튼 뒤에 배치되어야 함
      expect(companyLink.nextElementSibling).toBe(favBtn);
      expect(favBtn.nextElementSibling).toBe(wrap);
    });

    it('잡코리아 /recruit/joblist 페이지에서 getNextPageRequest 호출 시 POST /Recruit/Home/_GI_List/ 요청을 생성해야 한다', () => {
      const origLocation = window.location;
      delete (window as any).location;
      (window as any).location = new URL('https://www.jobkorea.co.kr/recruit/joblist?menucode=local&localorder=1');

      try {
        const req = adapter.getNextPageRequest(document, 1);
        expect(req).not.toBeNull();
        expect(req?.url).toBe('/Recruit/Home/_GI_List/');
        expect(req?.options?.method).toBe('POST');
        expect(req?.options?.body).toContain('page=2');
        expect(req?.options?.body).toContain('pagesize=40');
      } finally {
        (window as any).location = origLocation;
      }
    });

    it('실제 잡코리아 HTML 픽스처(jobkorea_joblist.html)를 파싱하여 공고 카드 목록 및 필터링 동작을 완벽히 수행해야 한다', () => {
      const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/jobkorea_joblist.html');
      if (!fs.existsSync(fixturePath)) {
        return; // 파일 없을 시 건너뜀
      }

      const rawHtml = fs.readFileSync(fixturePath, 'utf-8');
      const cleanHtml = rawHtml
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<link[\s\S]*?>/gi, '')
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
      const doc = document.implementation.createHTMLDocument();
      doc.documentElement.innerHTML = cleanHtml;

      const cards = adapter.getJobCardElements(doc);
      expect(cards.length).toBeGreaterThan(30);

      // 1번째 공고 카드 파싱 검증
      const firstCard = cards[0];
      const parsed = adapter.parseCard(firstCard);
      expect(parsed).not.toBeNull();
      expect(parsed?.companyName.length).toBeGreaterThan(0);
      expect(parsed?.title.length).toBeGreaterThan(0);

      // 필터 엔진과 연동 검증
      const engine = new FilterEngine(
        {
          mode: 'hide',
          blurIntensity: 6,
          hideAds: true,
          showInlineButton: true,
          enableInfiniteScroll: true,
          showJobplanetRating: true,
          showBlindRating: true,
        },
        [{ id: '1', pattern: parsed!.companyName, type: 'company', createdAt: Date.now() }]
      );

      const evalResult = engine.evaluateJobCard(parsed!);
      expect(evalResult.shouldFilter).toBe(true);

      // 카드 목록 컨테이너 확인
      const container = adapter.getCardListContainer(doc);
      expect(container).not.toBeNull();
      expect(container?.tagName.toUpperCase()).toBe('TBODY');

      // 페이지네이션 요소 확인
      const pagination = adapter.getPaginationElement(doc);
      expect(pagination).not.toBeNull();
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

  describe('기업 평점 뱃지 주입 (injectRatingBadge - 잡플래닛 & 블라인드)', () => {
    const adapter = new WantedAdapter();

    it('잡플래닛 평점이 존재하고 단일 기업일 때 초록색 뱃지를 기업명 옆 래퍼에 배치해야 한다', () => {
      const card = document.createElement('div');
      card.innerHTML = `
        <span class="companyName">우아한형제들</span>
        <strong class="JobCard_title">백엔드 개발자</strong>
      `;
      const cardInfo = adapter.parseCard(card)!;

      adapter.injectRatingBadge(cardInfo, {
        platform: 'jobplanet',
        status: 'found',
        companyName: '우아한형제들',
        rating: 3.8,
        companyId: 61420,
        cachedAt: Date.now(),
      });

      const wrap = card.querySelector('.job-filter-ratings-wrap');
      expect(wrap).not.toBeNull();

      const badge = wrap?.querySelector('.job-filter-rating-badge.job-filter-rating-jobplanet');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain('잡플래닛');
      expect(badge?.textContent).toContain('3.8');
      expect(badge?.getAttribute('href')).toBe('https://www.jobplanet.co.kr/companies/61420');
      expect(badge?.getAttribute('title')).toContain('검색 결과 미존재, 동명 기업, 평점 미등록 시 표시 제외');

      // 기업명 바로 다음에 wrap이 배치되었는지 확인
      const companyEl = card.querySelector('.companyName');
      expect(companyEl?.nextElementSibling).toBe(wrap);
    });

    it('블라인드 평점이 존재하고 단일 기업일 때 빨간색 뱃지를 배치해야 한다', () => {
      const card = document.createElement('div');
      card.innerHTML = `
        <span class="companyName">카카오</span>
      `;
      const cardInfo = adapter.parseCard(card)!;

      adapter.injectRatingBadge(cardInfo, {
        platform: 'blind',
        status: 'found',
        companyName: '카카오',
        rating: 3.5,
        companyUrl: 'https://www.teamblind.com/kr/company/%EC%B9%B4%EC%B9%B4%EC%98%A4',
        cachedAt: Date.now(),
      });

      const wrap = card.querySelector('.job-filter-ratings-wrap');
      expect(wrap).not.toBeNull();

      const badge = wrap?.querySelector('.job-filter-rating-badge.job-filter-rating-blind');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain('블라인드');
      expect(badge?.textContent).toContain('3.5');
      expect(badge?.getAttribute('href')).toBe('https://www.teamblind.com/kr/company/%EC%B9%B4%EC%B9%B4%EC%98%A4');
      expect(badge?.getAttribute('title')).toContain('검색 결과 미존재, 동명 기업, 평점 미등록 시 표시 제외');
    });

    it('잡플래닛과 블라인드 평점이 모두 존재할 경우 동일 래퍼 내에 나란히 배치되어야 한다', () => {
      const card = document.createElement('div');
      card.innerHTML = `
        <span class="companyName">네이버</span>
      `;
      const cardInfo = adapter.parseCard(card)!;

      adapter.injectRatingBadge(cardInfo, {
        platform: 'jobplanet',
        status: 'found',
        companyName: '네이버',
        rating: 4.0,
        companyId: 300,
        cachedAt: Date.now(),
      });

      adapter.injectRatingBadge(cardInfo, {
        platform: 'blind',
        status: 'found',
        companyName: '네이버',
        rating: 3.9,
        companyUrl: 'https://www.teamblind.com/kr/company/%EB%84%A4%EC%9D%B4%EB%B2%84',
        cachedAt: Date.now(),
      });

      const wrap = card.querySelector('.job-filter-ratings-wrap');
      expect(wrap).not.toBeNull();
      expect(wrap?.children.length).toBe(2);

      const jpBadge = wrap?.querySelector('.job-filter-rating-jobplanet');
      const blindBadge = wrap?.querySelector('.job-filter-rating-blind');
      expect(jpBadge).not.toBeNull();
      expect(blindBadge).not.toBeNull();
      expect(jpBadge?.textContent).toContain('4.0');
      expect(blindBadge?.textContent).toContain('3.9');
    });

    it('동명의 회사가 여러 개인 경우(status: ambiguous) 뱃지를 배치하지 않아야 한다 (배치x)', () => {
      const card = document.createElement('div');
      card.innerHTML = `
        <span class="companyName">동명시스템</span>
      `;
      const cardInfo = adapter.parseCard(card)!;

      adapter.injectRatingBadge(cardInfo, {
        platform: 'blind',
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
        platform: 'jobplanet',
        status: 'not_found',
        companyName: '미존재기업',
        cachedAt: Date.now(),
      });

      const badge = card.querySelector('.job-filter-rating-badge');
      expect(badge).toBeNull();
    });

    it('동일 플랫폼 뱃지가 이미 주입된 경우 중복하여 주입하지 않아야 한다', () => {
      const card = document.createElement('div');
      card.innerHTML = `
        <span class="companyName">카카오</span>
      `;
      const cardInfo = adapter.parseCard(card)!;

      const ratingInfo = {
        platform: 'jobplanet' as const,
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
        platform: 'jobplanet',
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

