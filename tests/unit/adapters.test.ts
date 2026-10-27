import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  AdapterRegistry,
  WantedAdapter,
  JumpitAdapter,
  SaraminAdapter,
  JobKoreaAdapter,
  RememberAdapter,
} from '../../src/adapters';
import { FilterEngine } from '../../src/core/filter-engine';
import { RATING_BADGE_CONFIG, INLINE_BUTTON_CONFIG } from '../../src/constants';

describe('Site Adapters 단위 테스트', () => {
  describe('AdapterRegistry', () => {
    it('URL에 따라 올바른 어댑터를 반환해야 한다', () => {
      const jumpit = AdapterRegistry.getAdapterForUrl('https://jumpit.saramin.co.kr/positions?sort=popular');
      expect(jumpit?.name).toBe('Jumpit');

      const jumpitLegacy = AdapterRegistry.getAdapterForUrl('https://jumpit.co.kr/positions');
      expect(jumpitLegacy?.name).toBe('Jumpit');

      const wanted = AdapterRegistry.getAdapterForUrl('https://www.wanted.co.kr/wdlist/518');
      expect(wanted?.name).toBe('Wanted');

      const saramin = AdapterRegistry.getAdapterForUrl('https://www.saramin.co.kr/zf_user/jobs/list/job-category');
      expect(saramin?.name).toBe('Saramin');

      const jobkorea = AdapterRegistry.getAdapterForUrl('https://www.jobkorea.co.kr/recruit/joblist');
      expect(jobkorea?.name).toBe('JobKorea');

      const remember = AdapterRegistry.getAdapterForUrl('https://career.rememberapp.co.kr/job/postings');
      expect(remember?.name).toBe('Remember');

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

    it('원티드 테마/큐레이션 포지션 캐러셀 카드(PositionGroupJobCard)를 파싱하고 회사명 옆에 평점 뱃지를 주입해야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <ul class="CarouselContainer_CarouselContainer__slider__E10go" style="gap: 15px">
          <li class="css-item-li">
            <a href="/wd/290004?groupId=devops-sre" class="css-link-card" data-attribute-id="position__click" data-company-id="25482" data-company-name="토스뱅크" data-position-id="290004" data-position-name="Site Reliability Engineer">
              <div class="css-thumb">
                <img src="https://static.wanted.co.kr/images/test4.jpg" alt="Site Reliability Engineer" />
              </div>
              <div class="css-content">
                <span class="montage-g4lz5p css-title">Site Reliability Engineer</span>
                <div class="css-company-wrap">
                  <span class="montage-1jwduw8">토스뱅크</span>
                  <span class="montage-1jwduw8">서울 강남구 · 경력 3년 이상</span>
                </div>
              </div>
            </a>
          </li>
        </ul>
      `;

      const cards = adapter.getJobCardElements(container);
      expect(cards.length).toBe(1);
      expect(cards[0].tagName).toBe('LI');

      const cardInfo = adapter.parseCard(cards[0]);
      expect(cardInfo).not.toBeNull();
      expect(cardInfo?.companyName).toBe('토스뱅크');
      expect(cardInfo?.title).toBe('Site Reliability Engineer');
      expect(cardInfo?.jobId).toBe('290004');

      const companyEl = adapter.getCompanyElement(cards[0]);
      expect(companyEl).not.toBeNull();
      expect(companyEl?.textContent?.trim()).toBe('토스뱅크');

      // 잡플래닛 평점 주입
      adapter.injectRatingBadge(cardInfo!, {
        platform: 'jobplanet',
        companyName: '토스뱅크',
        rating: 3.8,
        status: 'found',
        companyId: '388392',
        cachedAt: Date.now(),
      });

      // 블라인드 평점 주입
      adapter.injectRatingBadge(cardInfo!, {
        platform: 'blind',
        companyName: '토스뱅크',
        rating: 4.1,
        status: 'found',
        companyUrl: 'https://www.teamblind.com/kr/company/토스뱅크',
        cachedAt: Date.now(),
      });

      const ratingWrap = cards[0].querySelector(`.${RATING_BADGE_CONFIG.CLASSES.WRAP}`);
      expect(ratingWrap).not.toBeNull();
      expect(companyEl?.nextElementSibling).toBe(ratingWrap);

      const jpBadge = ratingWrap?.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.JOBPLANET}`);
      expect(jpBadge).not.toBeNull();
      expect(jpBadge?.textContent).toContain('3.8');

      const blindBadge = ratingWrap?.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.BLIND}`);
      expect(blindBadge).not.toBeNull();
      expect(blindBadge?.textContent).toContain('4.1');

      // 캐러셀 공고 숨기기 동작 검증: 인라인 버튼 주입 후 숨김 시 상위 li가 숨겨져야 함
      const onBlockCompany = vi.fn();
      const onBlockJob = vi.fn();
      adapter.injectInlineButton(cardInfo!, { onBlockCompany, onBlockJob });

      const hideJobBtn = cards[0].querySelector<HTMLButtonElement>('.job-filter-btn-job')!;
      expect(hideJobBtn).not.toBeNull();
      hideJobBtn.click();

      expect(cards[0].style.display).toBe('none');
      expect(cards[0].getAttribute('data-job-filtered')).toBe('true');
      expect(onBlockJob).toHaveBeenCalled();
    });

    it('원티드 홈/잡스피드 미니 공고 카드(MiniJobCard)를 파싱하고 회사명 옆에 평점 뱃지를 주입해야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <ul class="CarouselContainer_CarouselContainer__slider__E10go">
          <li class="css-mini-item">
            <a href="/wd/394698" class="MiniJobCard_MiniJobCard__aVx71" data-company-name="당근마켓" data-position-name="프론트엔드 엔지니어" data-position-id="394698">
              <div class="MiniJobCard_MiniJobCard__image__iOtFn">
                <img src="https://static.wanted.co.kr/images/test.jpg" alt="프론트엔드 엔지니어" />
              </div>
              <header>
                <span class="MiniJobCard_MiniJobCard__positionTitle__NLhOu montage-g4lz5p">프론트엔드 엔지니어</span>
                <span class="montage-1jwduw8">당근마켓</span>
                <span class="montage-1jwduw8">서울 서초구 · 경력 5년 이상</span>
              </header>
            </a>
          </li>
        </ul>
      `;

      const cards = adapter.getJobCardElements(container);
      expect(cards.length).toBe(1);
      expect(cards[0].tagName).toBe('LI');

      const cardInfo = adapter.parseCard(cards[0]);
      expect(cardInfo).not.toBeNull();
      expect(cardInfo?.companyName).toBe('당근마켓');
      expect(cardInfo?.title).toBe('프론트엔드 엔지니어');
      expect(cardInfo?.jobId).toBe('394698');

      const companyEl = adapter.getCompanyElement(cards[0]);
      expect(companyEl).not.toBeNull();
      expect(companyEl?.textContent?.trim()).toBe('당근마켓');

      adapter.injectRatingBadge(cardInfo!, {
        platform: 'jobplanet',
        companyName: '당근마켓',
        rating: 4.3,
        status: 'found',
        companyId: '12345',
        cachedAt: Date.now(),
      });

      const ratingWrap = cards[0].querySelector(`.${RATING_BADGE_CONFIG.CLASSES.WRAP}`);
      expect(ratingWrap).not.toBeNull();
      expect(companyEl?.nextElementSibling).toBe(ratingWrap);
      expect(ratingWrap?.textContent).toContain('4.3');
    });

    it('원티드 채용 목록 실 브라우저 픽스처(wanted_wdlist.html)의 카드에서 getRatingBadgeAnchorElement가 회사명을 정확히 반환하고 평점 뱃지가 옆에 주입되어야 한다', () => {
      const fixturePath = path.resolve(__dirname, '../fixtures/wanted_wdlist.html');
      const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');
      const container = document.createElement('div');
      container.innerHTML = fixtureHtml;

      const cards = adapter.getJobCardElements(container);
      expect(cards.length).toBeGreaterThan(0);

      const firstCard = cards[0];
      const cardInfo = adapter.parseCard(firstCard)!;
      expect(cardInfo).not.toBeNull();
      expect(cardInfo.companyName).toBe('매드업');

      const anchorEl = adapter.getRatingBadgeAnchorElement(firstCard);
      expect(anchorEl).not.toBeNull();
      expect(anchorEl?.textContent?.trim()).toBe('매드업');

      // 평점 뱃지 주입
      adapter.injectRatingBadge(cardInfo, {
        platform: 'jobplanet',
        companyName: '매드업',
        rating: 3.2,
        status: 'found',
        companyId: '198924',
        cachedAt: Date.now(),
      });

      adapter.injectRatingBadge(cardInfo, {
        platform: 'blind',
        companyName: '매드업',
        rating: 3.3,
        status: 'found',
        companyUrl: 'https://www.teamblind.com/kr/company/%EB%A7%A4%EB%93%9C%EC%97%85',
        cachedAt: Date.now(),
      });

      const wrap = firstCard.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.WRAP}`);
      expect(wrap).not.toBeNull();
      expect(anchorEl?.nextElementSibling).toBe(wrap);

      const jpBadge = wrap?.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.JOBPLANET}`);
      const blindBadge = wrap?.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.BLIND}`);
      expect(jpBadge).not.toBeNull();
      expect(blindBadge).not.toBeNull();
      expect(jpBadge?.textContent).toContain('3.2');
      expect(blindBadge?.textContent).toContain('3.3');

      // 뱃지 주입 후에도 getCompanyElement가 순수 회사명을 유지해야 함
      const recheckedCompanyEl = adapter.getCompanyElement(firstCard);
      expect(recheckedCompanyEl?.textContent?.trim()).toBe('매드업');
    });

    it('원티드 MiniJobCard에 평점 뱃지 주입 후에도 getCompanyElement와 getRatingBadgeAnchorElement가 실제 회사명 요소를 일관되게 반환해야 한다', () => {
      const miniCard = document.createElement('a');
      miniCard.className = 'MiniJobCard_MiniJobCard__E1SH1';
      miniCard.href = '/wd/366201';
      miniCard.innerHTML = `
        <div class="MiniJobCard_MiniJobCard__image__q80aY">
          <img src="test.png" alt="가상자산거래소 PM" />
        </div>
        <header>
          <span class="MiniJobCard_MiniJobCard__positionTitle__jay_D montage-isl78f">가상자산거래소 PM (Product Manager)</span>
          <span class="montage-29ldoy">디지털엑스</span>
          <span class="montage-29ldoy">서울 강남구 · 경력 5-11년</span>
        </header>
      `;

      const cardInfo = adapter.parseCard(miniCard)!;
      expect(cardInfo).not.toBeNull();
      expect(cardInfo.companyName).toBe('디지털엑스');

      const anchorEl = adapter.getRatingBadgeAnchorElement(miniCard);
      expect(anchorEl).not.toBeNull();
      expect(anchorEl?.textContent?.trim()).toBe('디지털엑스');

      // 뱃지 주입
      adapter.injectRatingBadge(cardInfo, {
        platform: 'jobplanet',
        companyName: '디지털엑스',
        rating: 4.2,
        status: 'found',
        companyId: '21',
        cachedAt: Date.now(),
      });

      const wrap = miniCard.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.WRAP}`);
      expect(wrap).not.toBeNull();
      expect(anchorEl?.nextElementSibling).toBe(wrap);

      // 재조회 시에도 anchor 및 companyEl이 wrap이 아닌 회사명 요소를 반환하는지 확인
      expect(adapter.getCompanyElement(miniCard)?.textContent?.trim()).toBe('디지털엑스');
      expect(adapter.getRatingBadgeAnchorElement(miniCard)?.textContent?.trim()).toBe('디지털엑스');
    });

    it('원티드 상세 페이지 URL 판별(isDetailPage)이 올바르게 동작해야 한다', () => {
      expect(adapter.isDetailPage('https://www.wanted.co.kr/wd/326613')).toBe(true);
      expect(adapter.isDetailPage('https://www.wanted.co.kr/wd/12345?query=frontend')).toBe(true);
      expect(adapter.isDetailPage('https://www.wanted.co.kr/wdlist/518/872')).toBe(false);
      expect(adapter.isDetailPage('https://www.wanted.co.kr/')).toBe(false);
    });

    it('원티드 실제 상세 페이지 픽스처(wanted_detail_326613.html)에서 헤더 파싱 및 회사명 옆 평점 뱃지 앵커링이 정확해야 한다', () => {
      const fixturePath = path.resolve(__dirname, '../fixtures/wanted_detail_326613.html');
      const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');
      const container = document.createElement('div');
      container.innerHTML = fixtureHtml;

      // 1. 상세 페이지 헤더를 카드로 수집해야 함
      const cards = adapter.getJobCardElements(container);
      const detailHeader = cards.find((c) => c.tagName.toUpperCase() === 'HEADER');
      expect(detailHeader).toBeDefined();

      // 2. 카드 파싱 정보 검증
      const info = adapter.parseCard(detailHeader!);
      expect(info).not.toBeNull();
      expect(info?.companyName).toBe('와탭랩스(WhaTapLabs)');
      expect(info?.title).toBe('Kubernetes 에이전트 개발자 (GPU/AI Observability)');
      expect(info?.jobId).toBe('326613');

      // 3. 회사명 앵커 요소 추출 검증 (점 기호 `∙` 대신 실제 <a> 회사 링크 태그여야 함)
      const companyEl = adapter.getCompanyElement(detailHeader!);
      expect(companyEl).not.toBeNull();
      expect(companyEl?.tagName.toUpperCase()).toBe('A');
      expect(companyEl?.textContent?.trim()).toBe('와탭랩스(WhaTapLabs)');

      // 4. 평점 뱃지 주입 검증 (회사명 <a> 바로 다음, 가운데 점 `∙` 앞)
      adapter.injectRatingBadge(info!, {
        platform: 'jobplanet',
        companyName: '와탭랩스',
        rating: 3.8,
        status: 'found',
        companyId: '311253',
        cachedAt: Date.now(),
      });

      adapter.injectRatingBadge(info!, {
        platform: 'blind',
        companyName: '와탭랩스',
        rating: 3.5,
        status: 'found',
        companyUrl: 'https://www.teamblind.com/kr/company/%EC%99%80%ED%83%AD%EB%9E%A9%EC%8A%A4',
        cachedAt: Date.now(),
      });

      const ratingWrap = detailHeader!.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.WRAP}`);
      expect(ratingWrap).not.toBeNull();
      expect(companyEl?.nextElementSibling).toBe(ratingWrap);

      const jpBadge = ratingWrap?.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.JOBPLANET}`);
      expect(jpBadge).not.toBeNull();
      expect(jpBadge?.textContent).toContain('3.8');

      const blindBadge = ratingWrap?.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.BLIND}`);
      expect(blindBadge).not.toBeNull();
      expect(blindBadge?.textContent).toContain('3.5');

      // 5. 인라인 [공고숨김 / 회사차단] 버튼 주입 검증 (상세 전용 클래스 확인)
      const onBlockCompany = vi.fn();
      const onBlockJob = vi.fn();
      adapter.injectInlineButton(info!, { onBlockCompany, onBlockJob });

      const btnGroup = detailHeader!.querySelector('.job-filter-btn-group');
      expect(btnGroup).not.toBeNull();
      expect(btnGroup?.classList.contains('job-filter-btn-group-detail')).toBe(true);
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

    it('사람인 hidePromotionBanners는 스폰서 상품 배너(.wrap_list_banner, .list_product), Nest 배너(.wrap_nest), 네이버 파워링크(#powerLink)를 일괄 숨김 처리해야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="wrap_list_banner">
          <ul class="list_product list_grand">
            <li class="item">그랜드 공고</li>
          </ul>
        </div>
        <div class="wrap_nest">Nest Ad Banner</div>
        <div id="powerLink">Naver PowerLink</div>
        <div class="recruit_line_banner">Line Banner</div>
        <div id="default_list_wrap">
          <div class="list_body">
            <div class="list_item">일반 공고 1</div>
          </div>
        </div>
      `;

      const hiddenCount = adapter.hidePromotionBanners(container);
      expect(hiddenCount).toBe(4);

      const listBanner = container.querySelector<HTMLElement>('.wrap_list_banner');
      const nestBanner = container.querySelector<HTMLElement>('.wrap_nest');
      const powerLink = container.querySelector<HTMLElement>('#powerLink');
      const lineBanner = container.querySelector<HTMLElement>('.recruit_line_banner');
      const normalItem = container.querySelector<HTMLElement>('.list_item');

      expect(listBanner?.style.display).toBe('none');
      expect(nestBanner?.style.display).toBe('none');
      expect(powerLink?.style.display).toBe('none');
      expect(lineBanner?.style.display).toBe('none');
      expect(normalItem?.style.display).not.toBe('none');
    });

    it('사람인 지역별/직무별 목록(/zf_user/jobs/list/domestic)의 그랜드/프리미엄 채용공고(.list_product .item)를 파싱하고 차단 툴바 및 평점 뱃지를 주입해야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="banner_list">
          <ul class="list_product list_grand">
            <li class="item">
              <a href="/zf_user/jobs/relay/view?view_type=list&rec_idx=55345321">
                <strong class="tit">기구설계 채용 채용/6500이상</strong>
                <span class="corp">(주)씨에이치티</span>
                <span class="date">~11.19(목)</span>
              </a>
              <button type="button" rec_idx="55345321" class="btn_scrap" title="스크랩"></button>
            </li>
          </ul>
        </div>
      `;

      const cards = adapter.getJobCardElements(container);
      expect(cards.length).toBe(1);

      const card = cards[0];
      const cardInfo = adapter.parseCard(card);
      expect(cardInfo).not.toBeNull();
      expect(cardInfo?.companyName).toBe('(주)씨에이치티');
      expect(cardInfo?.title).toBe('기구설계 채용 채용/6500이상');
      expect(cardInfo?.jobId).toBe('55345321');
      expect(cardInfo?.closingDate).toBe('~11.19(목)');

      // 회사 엘리먼트 추출 검증
      const companyEl = adapter.getCompanyElement(card);
      expect(companyEl).not.toBeNull();
      expect(companyEl?.textContent?.trim()).toBe('(주)씨에이치티');

      // 툴바 주입 검증
      const onBlockCompany = vi.fn();
      const onBlockJob = vi.fn();
      adapter.injectInlineButton(cardInfo!, { onBlockCompany, onBlockJob });

      const blockCompanyBtn = card.querySelector<HTMLButtonElement>('.job-filter-btn-company');
      expect(blockCompanyBtn).not.toBeNull();
      expect(blockCompanyBtn?.title).toContain('씨에이치티');
      blockCompanyBtn?.click();
      expect(onBlockCompany).toHaveBeenCalledWith('(주)씨에이치티');

      // 평점 뱃지 주입 검증
      adapter.injectRatingBadge(cardInfo!, {
        platform: 'jobplanet',
        companyName: '(주)씨에이치티',
        rating: 3.8,
        status: 'found',
        companyId: '77440',
        cachedAt: Date.now(),
      });
      const badge = card.querySelector('.job-filter-rating-jobplanet');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain('3.8');
    });

    it('사람인 지역별/직무별 목록(/zf_user/jobs/list/domestic)의 일반 공고 행(.list_item)에서 회사명, 공고제목(스크랩 제외), 평점 뱃지 연동이 정확히 작동해야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div id="default_list_wrap">
          <section class="list_recruiting">
            <div class="list_body">
              <div id="rec-55323519" class="list_item effect">
                <div class="box_item">
                  <div class="col company_nm">
                    <a href="/zf_user/company-info/view-inner-recruit?csn=123" class="str_tit" target="_blank">
                      (주)이씨엘글로벌코리아
                    </a>
                    <button type="button" class="interested_corp"><span>관심기업 등록</span></button>
                  </div>
                  <div class="col notification_info">
                    <div class="job_tit">
                      <a class="str_tit" id="rec_link_55323519" href="/zf_user/jobs/relay/view?rec_idx=55323519">
                        <span>포워딩 영업직(신입/경력) 채용공고</span>
                      </a>
                      <button type="button" class="spr_scrap"><span class="blind">스크랩</span></button>
                    </div>
                  </div>
                  <div class="col support_info">
                    <button class="sri_btn_md"><span class="sri_btn_immediately">입사지원</span></button>
                    <p class="support_detail">
                      <span class="date">~11.18(수)</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      `;

      const cards = adapter.getJobCardElements(container);
      expect(cards.length).toBe(1);

      const card = cards[0];
      const cardInfo = adapter.parseCard(card);
      expect(cardInfo).not.toBeNull();
      // 관심기업 등록 텍스트가 섞이지 않고 순수 회사명만 추출되어야 함
      expect(cardInfo?.companyName).toBe('(주)이씨엘글로벌코리아');
      // 제목에 스크랩 텍스트가 섞이지 않아야 함
      expect(cardInfo?.title).toBe('포워딩 영업직(신입/경력) 채용공고');
      expect(cardInfo?.jobId).toBe('55323519');
      expect(cardInfo?.closingDate).toBe('~11.18(수)');

      const companyEl = adapter.getCompanyElement(card);
      expect(companyEl).not.toBeNull();
      expect(companyEl?.textContent?.trim()).toBe('(주)이씨엘글로벌코리아');

      // 평점 뱃지 주입 시 회사명 링크 바로 뒤에 위치해야 함
      adapter.injectRatingBadge(cardInfo!, {
        platform: 'blind',
        companyName: '(주)이씨엘글로벌코리아',
        rating: 4.1,
        status: 'found',
        cachedAt: Date.now(),
      });
      const badge = card.querySelector('.job-filter-rating-blind');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain('4.1');

      // 리스트 컨테이너 탐색 검증
      const listContainer = adapter.getCardListContainer(container);
      expect(listContainer).not.toBeNull();
      expect(listContainer?.classList.contains('list_body')).toBe(true);
    });

    it('사람인 getCardListContainer는 상위 래퍼(#default_list_wrap)가 매칭되더라도 내부의 .list_body를 우선 반환해야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div id="default_list_wrap">
          <div class="common_recruilt_list">
            <div class="list_body">
              <div class="list_item">공고 1</div>
            </div>
          </div>
        </div>
      `;

      const listContainer = adapter.getCardListContainer(container);
      expect(listContainer).not.toBeNull();
      expect(listContainer?.classList.contains('list_body')).toBe(true);
    });

    it('사람인 getCardListContainer는 컨테이너 셀렉터 미매칭 시에도 firstCard.closest(.list_body)를 우선 반환해야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="custom_unknown_wrap">
          <div class="list_body">
            <div class="list_item">공고 1</div>
          </div>
        </div>
      `;

      const listContainer = adapter.getCardListContainer(container);
      expect(listContainer).not.toBeNull();
      expect(listContainer?.classList.contains('list_body')).toBe(true);
    });

    it('사람인 지역별/직무별 목록 페이지의 PageBox 버튼 페이징 및 onclick URL을 getNextPageUrl에서 올바르게 추출해야 한다', () => {
      const doc = document.createElement('div');
      doc.innerHTML = `
        <div class="PageBox">
          <span class="BtnType SizeS active">1</span>
          <button class="BtnType SizeS" page="2" onclick="location.href='/zf_user/jobs/list/domestic?page=2&loc_mcd=101000'">2</button>
          <button class="BtnType SizeS" page="3" onclick="location.href='/zf_user/jobs/list/domestic?page=3&loc_mcd=101000'">3</button>
        </div>
      `;

      const nextUrl = adapter.getNextPageUrl(doc, 1);
      expect(nextUrl).toContain('/zf_user/jobs/list/domestic?page=2&loc_mcd=101000');
    });

    it('사람인 직업별(job-category) 목록에서 onclick 내 &amp; 엔티티 및 #searchTitle 해시가 포함되어 있어도 깔끔하게 정규화된 다음 URL을 반환해야 한다', () => {
      const doc = document.createElement('div');
      doc.innerHTML = `
        <div class="PageBox">
          <span class="BtnType SizeS active">1</span>
          <button class="BtnType SizeS" page="2" onclick="location.href='/zf_user/jobs/list/job-category?page=2&amp;cat_mcls=2&amp;isAjaxRequest=0&amp;page_count=50&amp;sort=RL&amp;type=job-category&amp;is_param=1#searchTitle'">2</button>
        </div>
      `;

      const nextUrl = adapter.getNextPageUrl(doc, 1);
      expect(nextUrl).not.toBeNull();
      expect(nextUrl).toContain('/zf_user/jobs/list/job-category?page=2&cat_mcls=2');
      expect(nextUrl).not.toContain('&amp;');
      expect(nextUrl).not.toContain('#searchTitle');
    });

    it('사람인 페이징 10페이지 초과 시 .BtnNext(다음) 버튼의 onclick URL을 정상 추출해야 한다', () => {
      const doc = document.createElement('div');
      doc.innerHTML = `
        <div class="PageBox">
          <button class="BtnType SizeS" page="10">10</button>
          <button class="BtnType SizeS BtnNext" onclick="location.href='/zf_user/jobs/list/job-category?page=11&cat_mcls=2#searchTitle'">다음</button>
        </div>
      `;

      const nextUrl = adapter.getNextPageUrl(doc, 10);
      expect(nextUrl).not.toBeNull();
      expect(nextUrl).toContain('/zf_user/jobs/list/job-category?page=11&cat_mcls=2');
      expect(nextUrl).not.toContain('#searchTitle');
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

    it('잡코리아 상세 페이지(/Recruit/GI_Read/50238665) 판별 시 isDetailPage는 true여야 한다', () => {
      const detailUrl = 'https://www.jobkorea.co.kr/Recruit/GI_Read/50238665?rPageCode=AM&logpath=21&sn=6&sc=611';
      expect(adapter.isDetailPage(detailUrl)).toBe(true);

      const listUrl = 'https://www.jobkorea.co.kr/recruit/joblist?menucode=local&localorder=1';
      expect(adapter.isDetailPage(listUrl)).toBe(false);

      const origLocation = window.location;
      delete (window as any).location;
      (window as any).location = new URL(detailUrl);

      try {
        expect(adapter.isDetailPage()).toBe(true);
      } finally {
        (window as any).location = origLocation;
      }
    });

    it('잡코리아 상세 페이지 헤더 및 타이틀 영역에서 공고 정보(회사명, 직무명, jobId)를 정확히 파싱해야 한다', () => {
      const origLocation = window.location;
      delete (window as any).location;
      (window as any).location = new URL('https://www.jobkorea.co.kr/Recruit/GI_Read/50238665');

      try {
        const container = document.createElement('div');
        container.innerHTML = `
          <main class="grid [grid-template-areas:'title_title']">
            <div data-sentry-component="Title">
              <div class="flex justify-between w-[1280px]">
                <div data-jobview-section="atf">
                  <div data-sentry-component="CompanyName">
                    <a href="https://www.jobkorea.co.kr/Recruit/Co_Read/C/48448463">
                      <h2>(주)에이에이치푸드</h2>
                    </a>
                  </div>
                  <div data-sentry-component="TitleContent">
                    <h1 class="font-bold">[라피자일피노 이태리레스토랑] 주방요리사/홀서빙 채용</h1>
                  </div>
                </div>
                <div class="flex" id="menu-buttons" data-sentry-component="MenuButtons">
                  <div class="recruit-icon recruit-icon--system_heart"></div>
                </div>
              </div>
            </div>
          </main>
        `;

        const cards = adapter.getJobCardElements(container);
        expect(cards.length).toBe(1);

        const card = cards[0];
        expect(card.tagName.toUpperCase()).toBe('MAIN');

        const info = adapter.parseCard(card);
        expect(info).not.toBeNull();
        expect(info?.companyName).toBe('(주)에이에이치푸드');
        expect(info?.title).toBe('[라피자일피노 이태리레스토랑] 주방요리사/홀서빙 채용');
        expect(info?.jobId).toBe('50238665');
        expect(info?.isAd).toBe(false);
      } finally {
        (window as any).location = origLocation;
      }
    });

    it('잡코리아 상세 페이지의 #menu-buttons에 [이 공고만 숨기기] 및 [회사 전체 차단] 툴바가 찜하기 버튼 앞에 주입되어야 한다', () => {
      const origLocation = window.location;
      delete (window as any).location;
      (window as any).location = new URL('https://www.jobkorea.co.kr/Recruit/GI_Read/12345');

      try {
        const container = document.createElement('div');
        container.innerHTML = `
          <main class="grid">
            <div data-sentry-component="Title">
              <div class="flex justify-between w-[1280px]">
                <div data-jobview-section="atf">
                  <div data-sentry-component="CompanyName">
                    <a href="/Recruit/Co_Read/C/123"><h2>테스트기업</h2></a>
                  </div>
                  <div data-sentry-component="TitleContent">
                    <h1 class="font-bold">웹 프론트엔드 개발자 채용</h1>
                  </div>
                </div>
                <div class="flex" id="menu-buttons" data-sentry-component="MenuButtons">
                  <div class="fav-wrapper"><i class="recruit-icon--system_heart"></i></div>
                </div>
              </div>
            </div>
          </main>
        `;

        const cards = adapter.getJobCardElements(container);
        expect(cards.length).toBe(1);

        const info = adapter.parseCard(cards[0])!;
        expect(info).not.toBeNull();

        const onBlockCompany = vi.fn();
        const onBlockJob = vi.fn();
        adapter.injectInlineButton(info, { onBlockCompany, onBlockJob });

        const menuButtons = container.querySelector('#menu-buttons');
        expect(menuButtons).not.toBeNull();

        const actionGroup = menuButtons?.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.CONTAINER}`);
        expect(actionGroup).not.toBeNull();

        // menuButtons의 첫 번째 자식이 액션 툴바여야 함 (하트 찜하기 버튼 왼쪽)
        expect(menuButtons?.firstChild).toBe(actionGroup);

        const hideJobBtn = actionGroup?.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.JOB_BUTTON}`);
        const blockCompanyBtn = actionGroup?.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.COMPANY_BUTTON}`);
        expect(hideJobBtn).not.toBeNull();
        expect(blockCompanyBtn).not.toBeNull();
      } finally {
        (window as any).location = origLocation;
      }
    });

    it('잡코리아 상세 페이지의 회사명 링크 바로 뒤에 평점 뱃지 래퍼가 <a> 태그 중첩 없이 주입되어야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <main class="grid">
          <div data-sentry-component="Title">
            <div data-jobview-section="atf">
              <div data-sentry-component="CompanyName">
                <a class="company-link" href="https://www.jobkorea.co.kr/Recruit/Co_Read/C/48448463">
                  <h2 class="company-heading">㈜에이에이치푸드</h2>
                </a>
              </div>
              <div data-sentry-component="TitleContent">
                <h1 class="font-bold">주방요리사 채용</h1>
              </div>
            </div>
          </div>
        </main>
      `;

      const cards = adapter.getJobCardElements(container);
      const info = adapter.parseCard(cards[0])!;

      adapter.injectRatingBadge(info, {
        platform: 'jobplanet',
        status: 'found',
        companyName: '㈜에이에이치푸드',
        rating: 3.5,
        companyId: '12345',
        cachedAt: Date.now(),
      });

      const companyLink = container.querySelector('a.company-link') as HTMLElement;
      expect(companyLink).not.toBeNull();

      const ratingWrap = container.querySelector('.job-filter-ratings-wrap');
      expect(ratingWrap).not.toBeNull();

      // <a> 태그 내부에 <a>가 중첩되지 않고, 회사 링크 바로 뒤(nextSibling)에 평점 래퍼가 위치해야 함
      expect(companyLink.contains(ratingWrap!)).toBe(false);
      expect(companyLink.nextElementSibling).toBe(ratingWrap);

      const badge = ratingWrap?.querySelector('.job-filter-rating-jobplanet');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain('3.5');
    });

    it('잡코리아 헤드라인 채용관 광고 배너(#dev-TopHeadlineAGI, #TopHeadlineAGI, #HeadlineAGI 등)가 hidePromotionBanners 호출 시 display: none 처리되어야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <!-- TOP 헤드라인 채용관 -->
        <div id="dev-TopHeadlineAGI" class="listBannerWrap">
          <div class="bn_hd_2"><h3>TOP 헤드라인 채용관</h3></div>
          <ul class="listBanner listBanner_3xn listTopHeadline">
            <li><div class="co"><a href="#">광고기업A</a></div></li>
          </ul>
        </div>
        <!-- 헤드라인 채용관 -->
        <div id="HeadlineAGI" class="listBannerWrap">
          <div class="bn_hd_2"><h3>헤드라인 채용관</h3></div>
          <ul class="listBanner listBanner_3xn listHeadline">
            <li><div class="co"><a href="#">광고기업B</a></div></li>
          </ul>
        </div>
        <!-- 일반 채용 공고 (숨겨지지 않아야 함) -->
        <div class="tplList tplJobList">
          <table><tbody><tr data-gno="12345"><td>일반채용</td></tr></tbody></table>
        </div>
      `;

      adapter.hidePromotionBanners(container);

      const topHeadline = container.querySelector<HTMLElement>('#dev-TopHeadlineAGI');
      const headline = container.querySelector<HTMLElement>('#HeadlineAGI');
      const normalList = container.querySelector<HTMLElement>('.tplList');

      expect(topHeadline?.style.display).toBe('none');
      expect(topHeadline?.getAttribute('data-job-filtered')).toBe('true');
      expect(headline?.style.display).toBe('none');
      expect(headline?.getAttribute('data-job-filtered')).toBe('true');
      expect(normalList?.style.display).not.toBe('none');
    });

    it('잡코리아 메인 페이지의 4대 광고 섹션(나에게 꼭 맞는 공고, 주목할 만한 JOB, 놓치면 아쉬운 JOB, 지원자가 몰리는 JOB)을 hidePromotionBanners로 완전 숨김 처리하고 restorePromotionBanners로 복원할 수 있어야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <!-- 1. 나에게 꼭 맞는 공고 (CPC_SMARTFIT_HOME_PC) -->
        <div data-animation-section="true" data-render-type="GRID_CARD_DEFAULT" data-section-alias="CPC_SMARTFIT_HOME_PC">
          <div class="flex w-full justify-center pb-[48px]">
            <div data-sentry-component="TitlePC">
              <h2>나에게 꼭 맞는 공고 <span class="badge">AD</span></h2>
            </div>
            <div class="cards">공고 카드 목록</div>
          </div>
        </div>

        <!-- 2. 주목할 만한 JOB (CPT_FIRSTVVIP_PC) -->
        <div data-animation-section="true" data-render-type="GRID_CARD_SEPERATED" data-section-alias="CPT_FIRSTVVIP_PC">
          <div class="flex w-full justify-center pb-[48px]">
            <div data-sentry-component="TitlePC">
              <h2>주목할 만한 JOB <span class="badge">AD</span></h2>
              <a href="/service/company/option">상품안내 &gt;</a>
            </div>
          </div>
        </div>

        <!-- 3. 놓치면 아쉬운 JOB (CPT_VIP_PC) -->
        <div data-animation-section="true" data-render-type="GRID_CARD_THUMBNAIL" data-section-alias="CPT_VIP_PC">
          <div class="flex w-full justify-center pb-[48px]">
            <div data-sentry-component="TitlePC">
              <h2>놓치면 아쉬운 JOB <span class="badge">AD</span></h2>
              <a href="/service/company/option">상품안내 &gt;</a>
            </div>
          </div>
        </div>

        <!-- 4. 지원자가 몰리는 JOB (CPT_EXCELLENT_PC) -->
        <div data-animation-section="true" data-render-type="GRID_CARD_LOGO" data-section-alias="CPT_EXCELLENT_PC">
          <div class="flex w-full justify-center pb-[48px]">
            <div data-sentry-component="TitlePC">
              <h2>지원자가 몰리는 JOB <span class="badge">AD</span></h2>
              <a href="/service/company/option">상품안내 &gt;</a>
            </div>
          </div>
        </div>

        <!-- 5. 일반 섹션 (AI 추천 인사이트 등 - 숨겨지지 않아야 함) -->
        <div data-animation-section="true" data-section-alias="AI_INSIGHT_PC">
          <div class="flex w-full justify-center pb-[48px]">
            <h2>AI 매칭 인사이트</h2>
          </div>
        </div>
      `;

      const hiddenCount = adapter.hidePromotionBanners(container);
      expect(hiddenCount).toBe(4);

      const sec1 = container.querySelector<HTMLElement>('[data-section-alias="CPC_SMARTFIT_HOME_PC"]');
      const sec2 = container.querySelector<HTMLElement>('[data-section-alias="CPT_FIRSTVVIP_PC"]');
      const sec3 = container.querySelector<HTMLElement>('[data-section-alias="CPT_VIP_PC"]');
      const sec4 = container.querySelector<HTMLElement>('[data-section-alias="CPT_EXCELLENT_PC"]');
      const normalSec = container.querySelector<HTMLElement>('[data-section-alias="AI_INSIGHT_PC"]');

      expect(sec1?.style.display).toBe('none');
      expect(sec1?.getAttribute('data-job-filtered')).toBe('true');
      expect(sec1?.getAttribute('data-blocked-type')).toBe('ad');

      expect(sec2?.style.display).toBe('none');
      expect(sec2?.getAttribute('data-job-filtered')).toBe('true');

      expect(sec3?.style.display).toBe('none');
      expect(sec3?.getAttribute('data-job-filtered')).toBe('true');

      expect(sec4?.style.display).toBe('none');
      expect(sec4?.getAttribute('data-job-filtered')).toBe('true');

      // 일반 섹션은 숨김 대상이 아님
      expect(normalSec?.style.display).not.toBe('none');
      expect(normalSec?.getAttribute('data-job-filtered')).toBeNull();

      // restorePromotionBanners 호출 시 복원 검증
      adapter.restorePromotionBanners(container);
      expect(sec1?.style.display).toBe('');
      expect(sec1?.getAttribute('data-job-filtered')).toBeNull();
      expect(sec2?.style.display).toBe('');
      expect(sec3?.style.display).toBe('');
      expect(sec4?.style.display).toBe('');
    });

    it('잡코리아 메인 페이지 광고 섹션이 data-section-alias가 없는 동적 DOM 환경이어도 제목 텍스트로 폴백 탐색하여 숨김 처리해야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="main-custom-section">
          <div class="flex w-full justify-center pb-[48px]">
            <div data-sentry-component="TitlePC">
              <h2>주목할만한 JOB</h2>
            </div>
            <div class="card-list">광고 카드들</div>
          </div>
        </div>
        <div class="main-custom-section-2">
          <section>
            <h2>지원자가 몰리는 JOB</h2>
            <div class="card-list">광고 카드들</div>
          </section>
        </div>
      `;

      const hiddenCount = adapter.hidePromotionBanners(container);
      expect(hiddenCount).toBe(2);

      const sec1 = container.querySelector<HTMLElement>('.main-custom-section');
      const sec2 = container.querySelector<HTMLElement>('.main-custom-section-2');

      expect(sec1?.style.display).toBe('none');
      expect(sec1?.getAttribute('data-job-filtered')).toBe('true');
      expect(sec2?.style.display).toBe('none');
      expect(sec2?.getAttribute('data-job-filtered')).toBe('true');
    });

    it('잡코리아 메인 페이지의 큐레이션 및 추천 공고 카드(CardJobBasic)를 정확히 수집·파싱하고 인라인 툴바와 기업 평점 뱃지가 주입되어야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="grid grid-col-4 gap-[20px]">
          <!-- 큐레이션 JOB 카드 1 -->
          <div>
            <div data-component-type="CARD_JOB_BASIC" class="relative h-full w-full min-w-[305px]" data-sentry-component="CardJobBasic">
              <a href="/Recruit/GI_Read/50117195?sc=729&amp;traceId=abc&amp;sn=103" rel="noopener noreferrer" target="_blank" data-sentry-element="BaseAnchor">
                <div class="h-full rounded-[10px] border-[#e6e8ea] border-[1px] bg-[#ffffff] p-[16px]">
                  <div class="flex h-full flex-col justify-between gap-0">
                    <div class="flex flex-col gap-[2px]">
                      <div class="flex justify-between">
                        <span class="w-full min-w-0 font-semibold text-[#1a1a1e] text-[17px] leading-[25px]">
                          [NHN Cloud] 프레임워크 개발
                        </span>
                        <div style="width:32px;height:32px"></div>
                      </div>
                      <div class="flex items-center gap-[8px] overflow-hidden">
                        <span style="flex-shrink:1" class="truncate font-normal text-[#1a1a1e] text-[15px] leading-[22px]">
                          엔에이치엔클라우드(주)
                        </span>
                        <span style="flex-shrink:0" class="font-semibold text-[#f37676] text-[11px] leading-[15px]">
                          D-4
                        </span>
                      </div>
                    </div>
                    <div class="flex gap-[4px]">
                      <div class="tag"><span class="text-[11px] font-semibold">경력 5년↑</span></div>
                    </div>
                  </div>
                </div>
              </a>
              <div style="position:absolute;top:16px;right:16px">
                <button type="button" class="button-scrap flex items-center">
                  <i class="icon icon--system-scrap"></i>
                  <span class="sr-only">스크랩</span>
                </button>
              </div>
            </div>
          </div>

          <!-- 지원자가 많아요 카드 2 -->
          <div>
            <div data-component-type="CARD_JOB_BASIC" class="relative h-full w-full min-w-[305px]" data-sentry-component="CardJobBasic">
              <a href="/Recruit/GI_Read/50185207?sc=729" target="_blank">
                <div class="h-full">
                  <div class="flex flex-col">
                    <div class="flex justify-between">
                      <span class="font-semibold text-[17px]">
                        수도권 / SI,SM 프로젝트 인력 구함
                      </span>
                    </div>
                    <div class="flex items-center overflow-hidden">
                      <span class="truncate font-normal">
                        (주)아이티크리스탈
                      </span>
                      <span>D-23</span>
                    </div>
                  </div>
                </div>
              </a>
              <div style="position:absolute;top:16px;right:16px">
                <button type="button" class="button-scrap"><span class="sr-only">스크랩</span></button>
              </div>
            </div>
          </div>
        </div>
      `;

      // 1. 공고 카드 수집 검증
      const cards = adapter.getJobCardElements(container);
      expect(cards.length).toBe(2);

      // 2. 첫 번째 카드 파싱 검증
      const firstCard = cards[0];
      const firstInfo = adapter.parseCard(firstCard);
      expect(firstInfo).not.toBeNull();
      expect(firstInfo?.companyName).toBe('엔에이치엔클라우드(주)');
      expect(firstInfo?.title).toBe('[NHN Cloud] 프레임워크 개발');
      expect(firstInfo?.jobId).toBe('50117195');
      expect(firstInfo?.closingDate).toBe('D-4');
      expect(firstInfo?.isAd).toBe(false);

      // 3. 두 번째 카드 파싱 검증
      const secondCard = cards[1];
      const secondInfo = adapter.parseCard(secondCard);
      expect(secondInfo).not.toBeNull();
      expect(secondInfo?.companyName).toBe('(주)아이티크리스탈');
      expect(secondInfo?.title).toBe('수도권 / SI,SM 프로젝트 인력 구함');
      expect(secondInfo?.jobId).toBe('50185207');
      expect(secondInfo?.closingDate).toBe('D-23');

      // 4. 회사명 및 뱃지 앵커 요소 검증
      const companyEl = adapter.getCompanyElement(firstCard);
      expect(companyEl).not.toBeNull();
      expect(companyEl?.textContent?.trim()).toBe('엔에이치엔클라우드(주)');

      const anchorEl = adapter.getRatingBadgeAnchorElement(firstCard);
      expect(anchorEl).not.toBeNull();
      expect(anchorEl).toBe(companyEl);

      // 5. 잡플래닛 및 블라인드 평점 뱃지 주입 검증
      adapter.injectRatingBadge(firstInfo!, {
        platform: 'jobplanet',
        companyName: '엔에이치엔클라우드(주)',
        rating: 3.7,
        companyId: '12345',
        reviewCount: 88,
        status: 'found',
        cachedAt: Date.now(),
      });

      adapter.injectRatingBadge(firstInfo!, {
        platform: 'blind',
        companyName: '엔에이치엔클라우드(주)',
        rating: 4.0,
        reviewCount: 42,
        status: 'found',
        cachedAt: Date.now(),
      });

      const wrap = firstCard.querySelector('.job-filter-ratings-wrap');
      expect(wrap).not.toBeNull();
      expect(wrap?.querySelector('.job-filter-rating-jobplanet')).not.toBeNull();
      expect(wrap?.querySelector('.job-filter-rating-blind')).not.toBeNull();
      expect(wrap?.textContent).toContain('3.7');
      expect(wrap?.textContent).toContain('4.0');

      // 6. 인라인 툴바([공고숨김] / [회사차단]) 주입 검증
      const onBlockCompany = vi.fn();
      const onBlockJob = vi.fn();

      adapter.injectInlineButton(firstInfo!, { onBlockCompany, onBlockJob });

      const btnGroup = firstCard.querySelector('.job-filter-btn-group');
      expect(btnGroup).not.toBeNull();

      const hideJobBtn = firstCard.querySelector<HTMLButtonElement>('.job-filter-btn-job');
      const blockCompanyBtn = firstCard.querySelector<HTMLButtonElement>('.job-filter-btn-company');

      expect(hideJobBtn).not.toBeNull();
      expect(blockCompanyBtn).not.toBeNull();
      expect(blockCompanyBtn?.title).toContain('엔에이치엔클라우드(주)');

      hideJobBtn?.click();
      expect(onBlockJob).toHaveBeenCalledWith(firstInfo);

      blockCompanyBtn?.click();
      expect(onBlockCompany).toHaveBeenCalledWith('엔에이치엔클라우드(주)');
    });

    it('잡코리아 인기 TOP 100(ol.rankList > li.dmpItem) 공고 카드를 정확히 수집 및 파싱하고 평점 뱃지와 인라인 툴바가 올바르게 주입되어야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="rankListArea devSarterTab">
          <ol class="rankList">
            <li class="dmpItem" data-source='{"memberId":"","gno":50177710,"giNo":51782990,"companyMemberType":"C"}'>
              <div class="rank">
                <span class="num">1</span>
              </div>
              <div class="co">
                <div class="coTit">
                  <a class="coLink" href="/Recruit/Co_Read/C/24558026?Oem_Code=C1" target="_blank" title="기업정보 이동"><b>테슬라코리아</b></a>
                  <button type="button" title="관심기업" class="tplBtnTy tplBtnFavOff devFavor" data-mem-sys="24558026"><span class="blind">관심기업</span></button>
                </div>
              </div>
              <div class="info">
                <div class="tit">
                  <button type="button" class="topBtn topBtnScr devScrap" data-gno="50177710"><span class="blind">스크랩</span></button>
                  <a href="/Recruit/GI_Read/50177710?TpGb=TP" class="link dev-recruit-link" target="_blank" data-gno="50177710">
                    <span>Tesla Korea 2026 대규모 공개 채용</span>
                  </a>
                </div>
              </div>
              <div class="side">
                <span class="day">~10/31(토)</span>
              </div>
            </li>
          </ol>
        </div>
      `;

      const cards = adapter.getJobCardElements(container);
      expect(cards.length).toBe(1);

      const card = cards[0];
      const info = adapter.parseCard(card);
      expect(info).not.toBeNull();
      expect(info?.companyName).toBe('테슬라코리아');
      expect(info?.title).toBe('Tesla Korea 2026 대규모 공개 채용');
      expect(info?.jobId).toBe('50177710');
      expect(info?.closingDate).toBe('~10/31(토)');
      expect(info?.isAd).toBe(false);

      // 평점 뱃지 주입 검증: 관심기업 버튼(.devFavor) 뒤에 평점 래퍼가 주입되어 하트와 겹치지 않아야 함
      adapter.injectRatingBadge(info!, {
        platform: 'jobplanet',
        status: 'found',
        companyName: '테슬라코리아',
        rating: 4.0,
        companyId: 24558026,
        cachedAt: Date.now(),
      });

      const coTit = card.querySelector<HTMLElement>('.coTit')!;
      const coLink = coTit.querySelector('.coLink')!;
      const favBtn = coTit.querySelector('.devFavor')!;
      const ratingWrap = coTit.querySelector('.job-filter-ratings-wrap')!;

      expect(favBtn).not.toBeNull();
      expect(ratingWrap).not.toBeNull();
      expect(coLink.nextElementSibling).toBe(favBtn);
      expect(favBtn.nextElementSibling).toBe(ratingWrap);

      // 인라인 [공고숨김 / 회사차단] 툴바 주입 검증
      const onBlockCompany = vi.fn();
      const onBlockJob = vi.fn();
      adapter.injectInlineButton(info!, { onBlockCompany, onBlockJob });

      const btnGroup = card.querySelector('.job-filter-btn-group');
      expect(btnGroup).not.toBeNull();
      expect(card.classList.contains('job-filter-card-host')).toBe(true);
    });

    it('잡코리아 AI 추천 페이지(/User/AI) 공고 카드(li.listItem)를 정확히 수집 및 파싱하고 평점 뱃지와 인라인 툴바가 올바르게 주입되어야 한다', () => {
      const container = document.createElement('ul');
      container.innerHTML = `
        <li data-sc="11" class="listItem">
          <div class="recruit-company">
            <div class="headers">
              <div class="name">
                <a href="/Recruit/Co_Read/C/30883047?Oem_Code=C1" target="_blank">
                  <div class="name">넥스트증권㈜</div>
                </a>
              </div>
              <button type="button" class="tplBtnTy dev-btn-favor tplBtnFavOff" data-gno="50064431" data-value="30883047">관심기업</button>
            </div>
            <div class="attribute"></div>
          </div>
          <div class="recruit-content dmp-imp-start dmp-imp-end" dmp-collection='{"spaceType":"MY","sourceCode":11,"recruitNo":50064431}'>
            <div class="headers">
              <a href="/Recruit/GI_Read/50064431?Oem_Code=C1&amp;sc=11" target="_blank" class="title giread" data-gno="50064431">Backend Engineer (국내 주식 주문/체결)</a>
              <button type="button" class="tplBtnTy dev-btn-scrap gireadNoMove tplBtnScrOff" data-gno="50064431">스크랩</button>
            </div>
            <a href="/Recruit/GI_Read/50064431?Oem_Code=C1&amp;sc=11" target="_blank">
              <div class="recruitment">
                <div class="item">경력</div>
                <div class="item">서울 &gt; 영등포구</div>
              </div>
              <div class="job">백엔드개발자,시스템엔지니어</div>
            </a>
          </div>
          <div class="recruit-apply">
            <div class="recruit-apply-wrap">
              <button type="button" class="button tplBtn tplBtn_1 tplBtnBlue gireadNoMove homepage" data-gno="50064431"><span>홈페이지 지원</span></button>
              <div class="deadline">~11.27 <span>(금)</span></div>
            </div>
          </div>
        </li>
      `;

      const cards = adapter.getJobCardElements(container);
      expect(cards.length).toBe(1);

      const card = cards[0];
      const info = adapter.parseCard(card);
      expect(info).not.toBeNull();
      expect(info?.companyName).toBe('넥스트증권㈜');
      expect(info?.title).toBe('Backend Engineer (국내 주식 주문/체결)');
      expect(info?.jobId).toBe('50064431');
      expect(info?.closingDate).toContain('~11.27');
      expect(info?.isAd).toBe(false);

      // 평점 뱃지 주입 검증: 관심기업 버튼(.dev-btn-favor) 뒤에 평점 래퍼가 주입되어 하트와 겹치지 않아야 함
      adapter.injectRatingBadge(info!, {
        platform: 'jobplanet',
        status: 'found',
        companyName: '넥스트증권㈜',
        rating: 3.9,
        companyId: 30883047,
        cachedAt: Date.now(),
      });

      const headers = card.querySelector<HTMLElement>('.recruit-company .headers')!;
      const companyLink = headers.querySelector('a')!;
      const favBtn = headers.querySelector('.dev-btn-favor')!;
      const ratingWrap = headers.querySelector('.job-filter-ratings-wrap')!;

      expect(favBtn).not.toBeNull();
      expect(ratingWrap).not.toBeNull();
      expect(companyLink.contains(ratingWrap)).toBe(false);
      expect(favBtn.nextElementSibling).toBe(ratingWrap);

      // 인라인 [공고숨김 / 회사차단] 툴바 주입 검증
      const onBlockCompany = vi.fn();
      const onBlockJob = vi.fn();
      adapter.injectInlineButton(info!, { onBlockCompany, onBlockJob });

      const btnGroup = card.querySelector('.job-filter-btn-group');
      expect(btnGroup).not.toBeNull();
      expect(card.classList.contains('job-filter-card-host')).toBe(true);

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
        [{ id: '1', pattern: '넥스트증권㈜', type: 'company', createdAt: Date.now() }]
      );
      const evalResult = engine.evaluateJobCard(info!);
      expect(evalResult.shouldFilter).toBe(true);
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

    it('사람인 getCardListContainer는 스폰서 상품 그리드(.list_product)를 절대 컨테이너로 반환하지 않아야 한다', () => {
      const saramin = new SaraminAdapter();
      const doc = document.implementation.createHTMLDocument();
      doc.body.innerHTML = `
        <div class="wrap_list_banner">
          <ul class="list_product list_grand">
            <li class="item">스폰서 카드</li>
          </ul>
        </div>
      `;

      const container = saramin.getCardListContainer(doc);
      expect(container).toBeNull();
    });

    it('사람인 getNextPageUrl은 페이지네이션 요소가 없는 정적/단일 페이지에서 null을 반환해야 한다', () => {
      const saramin = new SaraminAdapter();
      const doc = document.implementation.createHTMLDocument();
      doc.body.innerHTML = `
        <div class="wrap_list_banner">
          <ul class="list_product list_grand">
            <li class="item">스폰서 카드</li>
          </ul>
        </div>
      `;

      const nextUrl = saramin.getNextPageUrl(doc, 1);
      expect(nextUrl).toBeNull();
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

  describe('RememberAdapter DOM 파싱', () => {
    const adapter = new RememberAdapter();

    it('리멤버 URL 매칭 및 상세 페이지 판별이 정상 작동해야 한다', () => {
      expect(adapter.matches('https://career.rememberapp.co.kr/job/postings')).toBe(true);
      expect(adapter.matches('https://career.rememberapp.co.kr/job/posting/349577')).toBe(true);
      expect(adapter.matches('https://www.wanted.co.kr/wdlist')).toBe(false);

      expect(adapter.isDetailPage('https://career.rememberapp.co.kr/job/postings')).toBe(false);
      expect(adapter.isDetailPage('https://career.rememberapp.co.kr/job/posting/349577')).toBe(true);
    });

    it('리멤버 일반 공고 카드에서 회사명, 제목, Job ID, 마감일을 정확히 추출해야 한다', () => {
      const li = document.createElement('li');
      li.className = 'sc-364cfa5d-0 jwXYZ';
      li.innerHTML = `
        <div class="sc-364cfa5d-2">
          <a href="/job/posting/349577" class="sc-364cfa5d-1">
            <div class="sc-18344c98-0">
              <div class="sc-18344c98-4">
                <div class="header-col">
                  <div class="sub-col">
                    <p class="sc-18344c98-6">(주)엘리스</p>
                  </div>
                  <h4 class="sc-18344c98-9">백엔드 엔지니어</h4>
                </div>
              </div>
              <div class="sc-18344c98-10">
                <div class="chips"><span>서울 강남구</span><span>채용 시 마감</span></div>
                <div class="sc-18344c98-8"><button type="button">북마크</button></div>
              </div>
            </div>
          </a>
        </div>
      `;

      const cardInfo = adapter.parseCard(li);
      expect(cardInfo).not.toBeNull();
      expect(cardInfo?.companyName).toBe('(주)엘리스');
      expect(cardInfo?.title).toBe('백엔드 엔지니어');
      expect(cardInfo?.jobId).toBe('349577');
      expect(cardInfo?.closingDate).toBe('서울 강남구채용 시 마감');
      expect(cardInfo?.isAd).toBe(false);
    });

    it('광고 뱃지가 있거나 프로모션 배너 내부에 포함된 카드는 isAd: true로 판정해야 한다', () => {
      const card = document.createElement('div');
      card.innerHTML = `
        <div class="ad_badge">AD</div>
        <p class="sc-18344c98-6">광고회사</p>
        <h4 class="sc-18344c98-9">스폰서 공고</h4>
      `;

      const cardInfo = adapter.parseCard(card);
      expect(cardInfo?.isAd).toBe(true);
    });

    it('상세 페이지 헤더에서 회사명과 직무 제목을 정확히 파싱해야 한다', () => {
      const container = document.createElement('div');
      container.className = 'sc-884c2c6c-2 jwCPBj';
      container.innerHTML = `
        <a class="sc-567718ed-0" href="/job/company/1103795?channel=web_job_posting_header">
          <div class="sc-a34accef-0 yCGAb">
            <div class="sc-db17a579-0">(주)엘리스</div>
          </div>
        </a>
        <div class="sc-a34accef-0 gJvnIW">
          <h1 id="posting-detail-title" class="sc-db17a579-0">백엔드 엔지니어</h1>
        </div>
      `;

      const cardInfo = adapter.parseCard(container);
      expect(cardInfo).not.toBeNull();
      expect(cardInfo?.companyName).toBe('(주)엘리스');
      expect(cardInfo?.title).toBe('백엔드 엔지니어');
      expect(cardInfo?.isAd).toBe(false);
    });

    it('getJobCardElements는 카드 상위의 li(그리드 아이템)를 최우선으로 수집해야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <ul>
          <li class="sc-364cfa5d-0">
            <a href="/job/posting/1001">
              <div class="sc-18344c98-0">
                <p class="sc-18344c98-6">네이버</p>
                <h4 class="sc-18344c98-9">프론트엔드</h4>
              </div>
            </a>
          </li>
          <li class="sc-364cfa5d-0">
            <a href="/job/posting/1002">
              <div class="sc-18344c98-0">
                <p class="sc-18344c98-6">카카오</p>
                <h4 class="sc-18344c98-9">서버 개발자</h4>
              </div>
            </a>
          </li>
        </ul>
      `;

      const elements = adapter.getJobCardElements(container);
      expect(elements.length).toBe(2);
      expect(elements[0].tagName.toUpperCase()).toBe('LI');
      expect(elements[1].tagName.toUpperCase()).toBe('LI');
    });

    it('hidePromotionBanners는 프리미엄 대표기업 섹션과 맨 위 광고 캐러셀을 모두 숨겨야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <!-- 맨 위 상단 캐러셀 광고 배너 -->
        <section class="sc-79e4e802-0 hQUFRr">
          <div class="sc-9f83fe7b-0 fNFuOb">
            <section class="sc-9f83fe7b-1 sc-57d814ca-5 eqYERG ejYvIr">
              <ul class="sc-57d814ca-2 foHEQX">
                <li class="sc-802949b9-0 eya-djQ">
                  <a href="/job/company/1466832">
                    <img src="https://ad-cdn.rememberapp.co.kr/uploads/material/banner/1.png" alt="광고 배너 1" />
                  </a>
                </li>
              </ul>
            </section>
          </div>
        </section>

        <!-- 검색창 섹션 (광고 아님 - 유지되어야 함) -->
        <section id="topSearchBar">
          <div>검색 영역</div>
        </section>

        <!-- 프리미엄 대표기업 섹션 -->
        <div id="companyJobBoard" class="sc-2ff5cc3c-0 liPkqX">
          <div class="sc-9f83fe7b-0 junnQE">
            <section class="sc-9f83fe7b-3 ctBZcs">
              <h2>프리미엄 대표기업</h2>
              <a href="/job/board/premium-top-companies">전체보기</a>
            </section>
            <section class="sc-9f83fe7b-1 eqYERG">
              <ul>
                <li>기업 카드 1</li>
                <li>기업 카드 2</li>
              </ul>
            </section>
          </div>
        </div>

        <!-- 일반 공고 목록 (유지되어야 함) -->
        <section class="normal-list">
          <ul>
            <li class="sc-364cfa5d-0">일반 공고 1</li>
          </ul>
        </section>
      `;

      const hiddenCount = adapter.hidePromotionBanners(container);
      expect(hiddenCount).toBe(2);

      const topBanner = container.querySelector('section.sc-79e4e802-0') as HTMLElement;
      expect(topBanner.style.display).toBe('none');
      expect(topBanner.getAttribute('data-job-filtered')).toBe('true');
      expect(topBanner.getAttribute('data-blocked-type')).toBe('ad');

      const premiumSection = container.querySelector('#companyJobBoard') as HTMLElement;
      expect(premiumSection.style.display).toBe('none');
      expect(premiumSection.getAttribute('data-job-filtered')).toBe('true');
      expect(premiumSection.getAttribute('data-blocked-type')).toBe('ad');

      // 일반 검색창과 공고 목록은 숨겨지지 않아야 함
      const searchBar = container.querySelector('#topSearchBar') as HTMLElement;
      expect(searchBar.style.display).not.toBe('none');
    });

    it('리멤버 실제 HTML 픽스처(remember_postings.html)에서 프리미엄 대표기업과 상단 광고 배너를 정확히 탐지하고 숨겨야 한다', () => {
      const fixturePath = path.resolve(__dirname, '../fixtures/remember_postings.html');
      if (!fs.existsSync(fixturePath)) return;

      const html = fs.readFileSync(fixturePath, 'utf-8');
      const container = document.createElement('div');
      container.innerHTML = html;

      const count = adapter.hidePromotionBanners(container);
      expect(count).toBe(2);

      const premium = container.querySelector('#companyJobBoard') as HTMLElement;
      expect(premium).not.toBeNull();
      expect(premium.style.display).toBe('none');
      expect(premium.getAttribute('data-blocked-type')).toBe('ad');

      const topBanner = container.querySelector('section.sc-79e4e802-0') as HTMLElement;
      expect(topBanner).not.toBeNull();
      expect(topBanner.style.display).toBe('none');
      expect(topBanner.getAttribute('data-blocked-type')).toBe('ad');
    });

    it('리멤버 실제 상세 페이지 픽스처(remember_detail.html)에서 공고 헤더 정보를 정확히 파싱해야 한다', () => {
      const fixturePath = path.resolve(__dirname, '../fixtures/remember_detail.html');
      if (!fs.existsSync(fixturePath)) return;

      const html = fs.readFileSync(fixturePath, 'utf-8');
      const container = document.createElement('div');
      container.innerHTML = html;

      const cards = adapter.getJobCardElements(container);
      expect(cards.length).toBeGreaterThan(0);

      const detailCard = cards[0];
      const cardInfo = adapter.parseCard(detailCard);
      expect(cardInfo).not.toBeNull();
      expect(cardInfo?.companyName).toContain('(주)엘리스');
      expect(cardInfo?.title).toContain('백엔드 엔지니어');
    });

    it('공고 카드에 [공고숨김] 및 [회사차단] 인라인 듀얼 버튼을 주입하고 클릭 시 상위 li를 즉시 숨겨야 한다', () => {
      const li = document.createElement('li');
      li.className = 'sc-364cfa5d-0';
      li.innerHTML = `
        <a href="/job/posting/349577">
          <div class="sc-18344c98-0">
            <p class="sc-18344c98-6">토스</p>
            <h4 class="sc-18344c98-9">프론트엔드 개발자</h4>
          </div>
        </a>
      `;

      const cardInfo = adapter.parseCard(li)!;
      const onBlockCompany = vi.fn();
      const onBlockJob = vi.fn();

      adapter.injectInlineButton(cardInfo, { onBlockCompany, onBlockJob });

      const btnGroup = li.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.CONTAINER}`);
      expect(btnGroup).not.toBeNull();

      const jobBtn = li.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.JOB_BUTTON}`) as HTMLButtonElement;
      expect(jobBtn).not.toBeNull();

      jobBtn.click();
      expect(onBlockJob).toHaveBeenCalledTimes(1);
      expect(li.style.display).toBe('none');
      expect(li.getAttribute('data-job-filtered')).toBe('true');
      expect(li.getAttribute('data-blocked-type')).toBe('job');

      // 회사 차단 클릭 시에도 li 숨김 확인
      li.style.display = 'block';
      const compBtn = li.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.COMPANY_BUTTON}`) as HTMLButtonElement;
      expect(compBtn).not.toBeNull();

      compBtn.click();
      expect(onBlockCompany).toHaveBeenCalledTimes(1);
      expect(onBlockCompany).toHaveBeenCalledWith('토스');
      expect(li.style.display).toBe('none');
      expect(li.getAttribute('data-blocked-type')).toBe('company');
    });

    it('상세 페이지 헤더 영역에 [공고숨김] 및 [회사차단] 인라인 버튼이 주입되어야 한다', () => {
      const detailContainer = document.createElement('div');
      detailContainer.className = 'sc-884c2c6c-2';
      detailContainer.innerHTML = `
        <a href="/job/company/123">
          <div><div class="sc-db17a579-0">당근</div></div>
        </a>
        <div class="sc-a34accef-0">
          <h1 id="posting-detail-title">서버 엔지니어</h1>
        </div>
      `;

      const cardInfo = adapter.parseCard(detailContainer)!;
      adapter.injectInlineButton(cardInfo, {
        onBlockCompany: vi.fn(),
        onBlockJob: vi.fn(),
      });

      const btnGroup = detailContainer.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.CONTAINER}`);
      expect(btnGroup).not.toBeNull();
    });

    it('리멤버 공고 카드에 잡플래닛 및 블라인드 평점 뱃지가 올바르게 주입되어야 한다', () => {
      const card = document.createElement('div');
      card.innerHTML = `
        <p class="sc-18344c98-6">라인플러스</p>
        <h4 class="sc-18344c98-9">iOS 개발자</h4>
      `;

      const cardInfo = adapter.parseCard(card)!;

      adapter.injectRatingBadge(cardInfo, {
        platform: 'jobplanet',
        status: 'found',
        companyName: '라인플러스',
        rating: 4.2,
        cachedAt: Date.now(),
      });

      adapter.injectRatingBadge(cardInfo, {
        platform: 'blind',
        status: 'found',
        companyName: '라인플러스',
        rating: 4.1,
        cachedAt: Date.now(),
      });

      const badges = card.querySelectorAll(`.${RATING_BADGE_CONFIG.CLASSES.BADGE}`);
      expect(badges.length).toBe(2);
      expect(card.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.JOBPLANET}`)).not.toBeNull();
      expect(card.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.BLIND}`)).not.toBeNull();
    });

    it('FilterEngine과 연동하여 리멤버 공고 카드 필터링(회사차단, 키워드, 단일공고)이 완벽히 작동해야 한다', () => {
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
        [
          { id: '1', pattern: '악덕기업', type: 'company', createdAt: Date.now() },
          { id: '2', pattern: '인턴', type: 'keyword', createdAt: Date.now() },
          { id: '3', pattern: '99999', type: 'job', createdAt: Date.now() },
        ]
      );

      // 1. 차단 회사
      const card1 = document.createElement('div');
      card1.innerHTML = `<p class="sc-18344c98-6">악덕기업</p><h4>백엔드</h4>`;
      const res1 = engine.evaluateJobCard(adapter.parseCard(card1)!);
      expect(res1.shouldFilter).toBe(true);

      // 2. 키워드 차단
      const card2 = document.createElement('div');
      card2.innerHTML = `<p class="sc-18344c98-6">좋은기업</p><h4>체험형 인턴 채용</h4>`;
      const res2 = engine.evaluateJobCard(adapter.parseCard(card2)!);
      expect(res2.shouldFilter).toBe(true);

      // 3. 단일 공고 차단
      const card3 = document.createElement('div');
      card3.innerHTML = `<a href="/job/posting/99999"><p class="sc-18344c98-6">좋은기업</p><h4>시니어 개발자</h4></a>`;
      const res3 = engine.evaluateJobCard(adapter.parseCard(card3)!);
      expect(res3.shouldFilter).toBe(true);

      // 4. 통과 공고
      const card4 = document.createElement('div');
      card4.innerHTML = `<a href="/job/posting/12345"><p class="sc-18344c98-6">네이버</p><h4>풀스택 개발자</h4></a>`;
      const res4 = engine.evaluateJobCard(adapter.parseCard(card4)!);
      expect(res4.shouldFilter).toBe(false);
    });

    it('적극 채용 중인 공고 / 주목 받을 수 있는 기회 / 커리어 맞춤 큐레이션 카드(sc-3c9cd5df-0)를 올바르게 수집 및 파싱해야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <ul class="curation-list">
          <li class="sc-3c9cd5df-0">
            <a href="/job/posting/63386?curationLocation=job_posting_tab">
              <header class="sc-3c9cd5df-4">
                <div class="sc-3c9cd5df-6">자율주행 소프트웨어 엔지니어</div>
                <div class="sc-3c9cd5df-7">(주)포티투닷</div>
              </header>
            </a>
          </li>
          <li class="sc-3c9cd5df-0">
            <a href="/job/postings/98765">
              <header class="sc-3c9cd5df-4">
                <div class="sc-3c9cd5df-6">데이터 사이언티스트</div>
                <div class="sc-3c9cd5df-7">쿠팡(주)</div>
              </header>
            </a>
          </li>
        </ul>
      `;

      const cards = adapter.getJobCardElements(container);
      expect(cards.length).toBe(2);
      expect(cards[0].tagName).toBe('LI');
      expect(cards[1].tagName).toBe('LI');

      const info1 = adapter.parseCard(cards[0])!;
      expect(info1).not.toBeNull();
      expect(info1.companyName).toBe('(주)포티투닷');
      expect(info1.title).toBe('자율주행 소프트웨어 엔지니어');
      expect(info1.jobId).toBe('63386');
      expect(info1.isAd).toBe(false);

      const info2 = adapter.parseCard(cards[1])!;
      expect(info2).not.toBeNull();
      expect(info2.companyName).toBe('쿠팡(주)');
      expect(info2.title).toBe('데이터 사이언티스트');
      expect(info2.jobId).toBe('98765');
    });

    it('큐레이션 카드(sc-3c9cd5df-0)에 [공고숨김] 및 [회사차단] 듀얼 버튼이 주입되고, 클릭 시 캐러셀 아이템(li)이 즉시 숨겨져야 한다', () => {
      const li = document.createElement('li');
      li.className = 'sc-3c9cd5df-0';
      li.innerHTML = `
        <a href="/job/posting/63386">
          <header class="sc-3c9cd5df-4">
            <div class="sc-3c9cd5df-6">플랫폼 백엔드 개발자</div>
            <div class="sc-3c9cd5df-7">(주)포티투닷</div>
          </header>
        </a>
      `;

      const cardInfo = adapter.parseCard(li)!;
      const onBlockCompany = vi.fn();
      const onBlockJob = vi.fn();

      adapter.injectInlineButton(cardInfo, { onBlockCompany, onBlockJob });

      const btnGroup = li.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.CONTAINER}`);
      expect(btnGroup).not.toBeNull();

      // [공고숨김] 버튼 클릭
      const jobBtn = li.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.JOB_BUTTON}`) as HTMLButtonElement;
      expect(jobBtn).not.toBeNull();

      jobBtn.click();
      expect(onBlockJob).toHaveBeenCalledTimes(1);
      expect(li.style.display).toBe('none');
      expect(li.getAttribute('data-job-filtered')).toBe('true');
      expect(li.getAttribute('data-filter-mode')).toBe('hide');
      expect(li.getAttribute('data-blocked-type')).toBe('job');

      // [회사차단] 버튼 클릭
      li.style.display = 'block';
      const compBtn = li.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.COMPANY_BUTTON}`) as HTMLButtonElement;
      expect(compBtn).not.toBeNull();

      compBtn.click();
      expect(onBlockCompany).toHaveBeenCalledTimes(1);
      expect(onBlockCompany).toHaveBeenCalledWith('(주)포티투닷');
      expect(li.style.display).toBe('none');
      expect(li.getAttribute('data-job-filtered')).toBe('true');
      expect(li.getAttribute('data-filter-mode')).toBe('hide');
      expect(li.getAttribute('data-blocked-type')).toBe('company');
    });

    it('큐레이션 카드(sc-3c9cd5df-0)에 잡플래닛 및 블라인드 평점 뱃지가 회사명(sc-3c9cd5df-7) 바로 옆에 정상 주입되어야 한다', () => {
      const li = document.createElement('li');
      li.className = 'sc-3c9cd5df-0';
      li.innerHTML = `
        <a href="/job/posting/63386">
          <header class="sc-3c9cd5df-4">
            <div class="sc-3c9cd5df-6">프론트엔드 리드</div>
            <div class="sc-3c9cd5df-7">(주)포티투닷</div>
          </header>
        </a>
      `;

      const cardInfo = adapter.parseCard(li)!;
      const companyEl = adapter.getCompanyElement(li);
      expect(companyEl).not.toBeNull();
      expect(companyEl?.textContent).toBe('(주)포티투닷');

      adapter.injectRatingBadge(cardInfo, {
        platform: 'jobplanet',
        status: 'found',
        companyName: '(주)포티투닷',
        rating: 4.5,
        cachedAt: Date.now(),
      });

      adapter.injectRatingBadge(cardInfo, {
        platform: 'blind',
        status: 'found',
        companyName: '(주)포티투닷',
        rating: 4.3,
        cachedAt: Date.now(),
      });

      const badges = li.querySelectorAll(`.${RATING_BADGE_CONFIG.CLASSES.BADGE}`);
      expect(badges.length).toBe(2);
      expect(li.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.JOBPLANET}`)).not.toBeNull();
      expect(li.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.BLIND}`)).not.toBeNull();

      // 평점 래퍼 컨테이너가 회사명 요소 바로 다음 형제로 주입되었는지 확인
      const wrap = li.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.WRAP}`);
      expect(companyEl?.nextElementSibling).toBe(wrap);
    });

    it('FilterEngine과 연동하여 큐레이션 공고 카드가 회사명, 키워드, 공고ID로 필터링되어야 한다', () => {
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
        [
          { id: '1', pattern: '포티투닷', type: 'company', createdAt: Date.now() },
          { id: '2', pattern: '자율주행', type: 'keyword', createdAt: Date.now() },
          { id: '3', pattern: '55555', type: 'job', createdAt: Date.now() },
        ]
      );

      // 1. 차단 회사 매칭 (주식회사 표기 정규화 검증)
      const li1 = document.createElement('li');
      li1.className = 'sc-3c9cd5df-0';
      li1.innerHTML = `
        <a href="/job/posting/11111">
          <header class="sc-3c9cd5df-4">
            <div class="sc-3c9cd5df-6">백엔드 개발자</div>
            <div class="sc-3c9cd5df-7">(주)포티투닷</div>
          </header>
        </a>
      `;
      const res1 = engine.evaluateJobCard(adapter.parseCard(li1)!);
      expect(res1.shouldFilter).toBe(true);

      // 2. 키워드 매칭
      const li2 = document.createElement('li');
      li2.className = 'sc-3c9cd5df-0';
      li2.innerHTML = `
        <a href="/job/posting/22222">
          <header class="sc-3c9cd5df-4">
            <div class="sc-3c9cd5df-6">자율주행 인지 알고리즘 연구원</div>
            <div class="sc-3c9cd5df-7">현대모비스</div>
          </header>
        </a>
      `;
      const res2 = engine.evaluateJobCard(adapter.parseCard(li2)!);
      expect(res2.shouldFilter).toBe(true);

      // 3. 단일 공고 ID 매칭
      const li3 = document.createElement('li');
      li3.className = 'sc-3c9cd5df-0';
      li3.innerHTML = `
        <a href="/job/posting/55555">
          <header class="sc-3c9cd5df-4">
            <div class="sc-3c9cd5df-6">인프라 엔지니어</div>
            <div class="sc-3c9cd5df-7">토스</div>
          </header>
        </a>
      `;
      const res3 = engine.evaluateJobCard(adapter.parseCard(li3)!);
      expect(res3.shouldFilter).toBe(true);

      // 4. 통과 공고
      const li4 = document.createElement('li');
      li4.className = 'sc-3c9cd5df-0';
      li4.innerHTML = `
        <a href="/job/posting/99999">
          <header class="sc-3c9cd5df-4">
            <div class="sc-3c9cd5df-6">프로덕트 디자이너</div>
            <div class="sc-3c9cd5df-7">당근</div>
          </header>
        </a>
      `;
      const res4 = engine.evaluateJobCard(adapter.parseCard(li4)!);
      expect(res4.shouldFilter).toBe(false);
    });

    it('내 직무 인기 공고 카드(sc-289d3ccd-0)를 올바르게 수집 및 파싱해야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <section id="PopularPostings">
          <ul class="sc-9f83fe7b-2">
            <div class="sc-289d3ccd-0" data-banner="https://cdn.rememberapp.co.kr/banner1.jpg">
              <a href="/job/posting/112233?curationLocation=job_posting_tab&source=popular_job_posting">
                <div class="sc-289d3ccd-7">
                  <button class="bookmark-btn">북마크</button>
                </div>
                <div class="sc-289d3ccd-6">
                  <div class="info-row">
                    <div class="sc-289d3ccd-1 logo"></div>
                    <p class="sc-289d3ccd-4">(주)쏘카</p>
                  </div>
                  <div>
                    <h3 class="sc-289d3ccd-3">Product Engineer</h3>
                  </div>
                </div>
              </a>
            </div>
            <div class="sc-289d3ccd-0">
              <a href="/job/postings/445566">
                <div class="sc-289d3ccd-7"></div>
                <div class="sc-289d3ccd-6">
                  <div class="info-row">
                    <div class="sc-289d3ccd-1 logo"></div>
                    <p class="sc-289d3ccd-4">(주)두산 디지털이노베이션</p>
                  </div>
                  <div>
                    <h3 class="sc-289d3ccd-3">AI Application 개발/운영 (서울)</h3>
                  </div>
                </div>
              </a>
            </div>
          </ul>
        </section>
      `;

      const cards = adapter.getJobCardElements(container);
      expect(cards.length).toBe(2);
      expect(cards[0].classList.contains('sc-289d3ccd-0')).toBe(true);
      expect(cards[1].classList.contains('sc-289d3ccd-0')).toBe(true);

      const info1 = adapter.parseCard(cards[0])!;
      expect(info1).not.toBeNull();
      expect(info1.companyName).toBe('(주)쏘카');
      expect(info1.title).toBe('Product Engineer');
      expect(info1.jobId).toBe('112233');
      expect(info1.isAd).toBe(false);

      const info2 = adapter.parseCard(cards[1])!;
      expect(info2).not.toBeNull();
      expect(info2.companyName).toBe('(주)두산 디지털이노베이션');
      expect(info2.title).toBe('AI Application 개발/운영 (서울)');
      expect(info2.jobId).toBe('445566');
    });

    it('내 직무 인기 공고 카드(sc-289d3ccd-0)에 [공고숨김] 및 [회사차단] 듀얼 버튼이 주입되고, 클릭 시 카드(div)가 즉시 숨겨져야 한다', () => {
      const card = document.createElement('div');
      card.className = 'sc-289d3ccd-0';
      card.innerHTML = `
        <a href="/job/posting/112233">
          <div class="sc-289d3ccd-7">
            <button class="bookmark-btn">북마크</button>
          </div>
          <div class="sc-289d3ccd-6">
            <p class="sc-289d3ccd-4">(주)쏘카</p>
            <h3 class="sc-289d3ccd-3">Product Engineer</h3>
          </div>
        </a>
      `;

      const cardInfo = adapter.parseCard(card)!;
      const onBlockCompany = vi.fn();
      const onBlockJob = vi.fn();

      adapter.injectInlineButton(cardInfo, { onBlockCompany, onBlockJob });

      const btnGroup = card.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.CONTAINER}`);
      expect(btnGroup).not.toBeNull();

      // [공고숨김] 버튼 클릭 시 div.sc-289d3ccd-0 즉시 숨김
      const jobBtn = card.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.JOB_BUTTON}`) as HTMLButtonElement;
      expect(jobBtn).not.toBeNull();

      jobBtn.click();
      expect(onBlockJob).toHaveBeenCalledTimes(1);
      expect(card.style.display).toBe('none');
      expect(card.getAttribute('data-job-filtered')).toBe('true');
      expect(card.getAttribute('data-filter-mode')).toBe('hide');
      expect(card.getAttribute('data-blocked-type')).toBe('job');

      // [회사차단] 버튼 클릭 시 div.sc-289d3ccd-0 즉시 숨김
      card.style.display = 'block';
      const compBtn = card.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.COMPANY_BUTTON}`) as HTMLButtonElement;
      expect(compBtn).not.toBeNull();

      compBtn.click();
      expect(onBlockCompany).toHaveBeenCalledTimes(1);
      expect(onBlockCompany).toHaveBeenCalledWith('(주)쏘카');
      expect(card.style.display).toBe('none');
      expect(card.getAttribute('data-blocked-type')).toBe('company');
    });

    it('내 직무 인기 공고 카드(sc-289d3ccd-0)에 잡플래닛 및 블라인드 평점 뱃지가 회사명(p.sc-289d3ccd-4) 바로 옆에 정상 주입되어야 한다', () => {
      const card = document.createElement('div');
      card.className = 'sc-289d3ccd-0';
      card.innerHTML = `
        <a href="/job/posting/112233">
          <div class="sc-289d3ccd-6">
            <div class="company-row">
              <p class="sc-289d3ccd-4">(주)쏘카</p>
            </div>
            <h3 class="sc-289d3ccd-3">Product Engineer</h3>
          </div>
        </a>
      `;

      const cardInfo = adapter.parseCard(card)!;
      const companyEl = adapter.getCompanyElement(card);
      expect(companyEl).not.toBeNull();
      expect(companyEl?.textContent).toBe('(주)쏘카');

      adapter.injectRatingBadge(cardInfo, {
        platform: 'jobplanet',
        status: 'found',
        companyName: '(주)쏘카',
        rating: 3.9,
        cachedAt: Date.now(),
      });

      adapter.injectRatingBadge(cardInfo, {
        platform: 'blind',
        status: 'found',
        companyName: '(주)쏘카',
        rating: 3.8,
        cachedAt: Date.now(),
      });

      const badges = card.querySelectorAll(`.${RATING_BADGE_CONFIG.CLASSES.BADGE}`);
      expect(badges.length).toBe(2);
      expect(card.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.JOBPLANET}`)).not.toBeNull();
      expect(card.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.BLIND}`)).not.toBeNull();

      // 평점 래퍼 컨테이너가 회사명 요소 바로 다음 형제로 주입되었는지 확인
      const wrap = card.querySelector(`.${RATING_BADGE_CONFIG.CLASSES.WRAP}`);
      expect(companyEl?.nextElementSibling).toBe(wrap);
    });

    it('FilterEngine과 연동하여 내 직무 인기 공고 카드가 회사명, 키워드, 공고ID로 필터링되어야 한다', () => {
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
        [
          { id: '1', pattern: '쏘카', type: 'company', createdAt: Date.now() },
          { id: '2', pattern: 'Backend', type: 'keyword', createdAt: Date.now() },
          { id: '3', pattern: '333333', type: 'job', createdAt: Date.now() },
        ]
      );

      // 1. 회사 차단
      const card1 = document.createElement('div');
      card1.className = 'sc-289d3ccd-0';
      card1.innerHTML = `
        <a href="/job/posting/11111">
          <div class="sc-289d3ccd-6">
            <p class="sc-289d3ccd-4">(주)쏘카</p>
            <h3 class="sc-289d3ccd-3">Frontend Developer</h3>
          </div>
        </a>
      `;
      const res1 = engine.evaluateJobCard(adapter.parseCard(card1)!);
      expect(res1.shouldFilter).toBe(true);

      // 2. 키워드 차단
      const card2 = document.createElement('div');
      card2.className = 'sc-289d3ccd-0';
      card2.innerHTML = `
        <a href="/job/posting/22222">
          <div class="sc-289d3ccd-6">
            <p class="sc-289d3ccd-4">(주)무신사</p>
            <h3 class="sc-289d3ccd-3">Backend Engineer (무신사)</h3>
          </div>
        </a>
      `;
      const res2 = engine.evaluateJobCard(adapter.parseCard(card2)!);
      expect(res2.shouldFilter).toBe(true);

      // 3. 단일 공고 ID 차단
      const card3 = document.createElement('div');
      card3.className = 'sc-289d3ccd-0';
      card3.innerHTML = `
        <a href="/job/posting/333333">
          <div class="sc-289d3ccd-6">
            <p class="sc-289d3ccd-4">(주)고위드</p>
            <h3 class="sc-289d3ccd-3">Fullstack Engineer</h3>
          </div>
        </a>
      `;
      const res3 = engine.evaluateJobCard(adapter.parseCard(card3)!);
      expect(res3.shouldFilter).toBe(true);

      // 4. 통과 공고
      const card4 = document.createElement('div');
      card4.className = 'sc-289d3ccd-0';
      card4.innerHTML = `
        <a href="/job/posting/444444">
          <div class="sc-289d3ccd-6">
            <p class="sc-289d3ccd-4">(주)당근마켓</p>
            <h3 class="sc-289d3ccd-3">iOS Engineer</h3>
          </div>
        </a>
      `;
      const res4 = engine.evaluateJobCard(adapter.parseCard(card4)!);
      expect(res4.shouldFilter).toBe(false);
    });
  });

  describe('JumpitAdapter DOM 파싱', () => {
    const adapter = new JumpitAdapter();

    it('점핏 공고 카드에서 회사명, 제목, Job ID, 마감일을 정확히 추출해야 한다', () => {
      const card = document.createElement('div');
      card.className = 'sc-d609d44f-0 hIThjB';
      card.innerHTML = `
        <a target="_self" title="프론트엔드 개발자 채용" href="/position/55185963">
          <div class="img_box">
            <img alt="위볼린" class="img" src="https://cdn.jumpit.co.kr/logo.png" />
            <div class="sc-d609d44f-3 hHUwVZ">
              <span class="sc-a0b0873a-0 czeWCl">D-4</span>
            </div>
          </div>
          <div class="sc-15ba67b8-0 npplS">
            <div class="sc-15ba67b8-2 jkmBOM">
              <span>위볼린</span>
            </div>
            <h2 class="position_card_info_title">프론트엔드 개발자 채용</h2>
          </div>
        </a>
      `;

      const info = adapter.parseCard(card);
      expect(info).not.toBeNull();
      expect(info?.companyName).toBe('위볼린');
      expect(info?.title).toBe('프론트엔드 개발자 채용');
      expect(info?.jobId).toBe('55185963');
      expect(info?.closingDate).toBe('D-4');
      expect(info?.isAd).toBe(false);
    });

    it('회사명 요소가 없고 img alt에 회사명이 존재하는 경우 정상 폴백 추출해야 한다', () => {
      const card = document.createElement('div');
      card.innerHTML = `
        <a href="/position/12345" title="백엔드 엔지니어">
          <img alt="토스뱅크" src="https://cdn.jumpit.co.kr/logo.png" />
          <h2 class="position_card_info_title">백엔드 엔지니어</h2>
        </a>
      `;

      const info = adapter.parseCard(card);
      expect(info?.companyName).toBe('토스뱅크');
      expect(info?.title).toBe('백엔드 엔지니어');
      expect(info?.jobId).toBe('12345');
    });

    it('광고 뱃지 또는 data-is-ad가 있는 공고는 isAd: true로 판정해야 한다', () => {
      const card = document.createElement('div');
      card.innerHTML = `
        <a href="/position/99999">
          <div class="ad_badge">AD</div>
          <div class="sc-15ba67b8-2"><span>광고회사</span></div>
          <h2>추천 채용</h2>
        </a>
      `;

      const info = adapter.parseCard(card);
      expect(info?.isAd).toBe(true);
    });

    it('점핏 상세 페이지 헤더에서 제목, 회사명, Job ID, 마감일을 정확히 추출해야 한다', () => {
      const header = document.createElement('div');
      header.className = 'sc-80824a9d-0 gYKwrs';
      header.innerHTML = `
        <h1>AI 연구원 [경력]</h1>
        <a class="name" target="_blank" href="/company/12345?company_nm=네이버">
          <span>네이버</span>
        </a>
        <dl class="sc-b12ae455-1 ghXBxF">
          <dt>마감일</dt>
          <dd>2026-12-31</dd>
        </dl>
      `;

      // window.location mocking
      const originalLocation = window.location;
      delete (window as any).location;
      window.location = {
        ...originalLocation,
        pathname: '/position/887766',
        href: 'https://jumpit.saramin.co.kr/position/887766',
      } as any;

      try {
        const info = adapter.parseCard(header);
        expect(info).not.toBeNull();
        expect(info?.companyName).toBe('네이버');
        expect(info?.title).toBe('AI 연구원 [경력]');
        expect(info?.jobId).toBe('887766');
        expect(info?.closingDate).toBe('2026-12-31');
      } finally {
        (window as any).location = originalLocation;
      }
    });

    it('사이드 윙 배너 및 프로모션 섹션을 정확히 숨김 처리해야 한다', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <aside class="sc-3ef60426-1 jBjuxU">사이드 윙 배너</aside>
        <div class="POSITIONS_BANNER">상단 이벤트 배너</div>
        <div class="sc-d609d44f-0"><a href="/position/1">일반 공고</a></div>
      `;

      const hiddenCount = adapter.hidePromotionBanners(container);
      expect(hiddenCount).toBe(2);

      const banners = container.querySelectorAll<HTMLElement>('[data-blocked-type="ad"]');
      expect(banners.length).toBe(2);
      banners.forEach((b) => {
        expect(b.style.display).toBe('none');
        expect(b.getAttribute('data-job-filtered')).toBe('true');
      });
    });

    it('공고 카드에 [공고숨김] 및 [회사차단] 듀얼 버튼을 주입하고 클릭 시 상위 컨테이너까지 숨겨야 한다', () => {
      const outerContainer = document.createElement('div');
      outerContainer.className = 'sc-d609d44f-0 hIThjB';

      const card = document.createElement('a');
      card.setAttribute('href', '/position/112233');
      card.innerHTML = `
        <div class="sc-15ba67b8-2"><span>카카오</span></div>
        <h2>서버 개발자</h2>
      `;
      outerContainer.appendChild(card);

      const cardInfo = {
        cardElement: card,
        companyName: '카카오',
        title: '서버 개발자',
        isAd: false,
        jobId: '112233',
      };

      const onBlockCompany = vi.fn();
      const onBlockJob = vi.fn();

      adapter.injectInlineButton(cardInfo, { onBlockCompany, onBlockJob });

      // 1. 호스트 클래스 확인
      expect(card.classList.contains(INLINE_BUTTON_CONFIG.CLASSES.CARD_HOST)).toBe(true);

      // 2. 버튼 그룹 확인
      const btnGroup = card.querySelector('.job-filter-btn-group');
      expect(btnGroup).not.toBeNull();

      const jobBtn = card.querySelector<HTMLButtonElement>('.job-filter-btn-job');
      const companyBtn = card.querySelector<HTMLButtonElement>('.job-filter-btn-company');
      expect(jobBtn).not.toBeNull();
      expect(companyBtn).not.toBeNull();

      // 3. 회사 차단 클릭 시 상위 컨테이너 숨김 처리 및 콜백 호출
      companyBtn?.click();
      expect(onBlockCompany).toHaveBeenCalledWith('카카오');
      expect(outerContainer.style.display).toBe('none');
      expect(outerContainer.getAttribute('data-job-filtered')).toBe('true');
      expect(outerContainer.getAttribute('data-blocked-type')).toBe('company');
    });

    it('실제 점핏 HTML 픽스처(jumpit_positions.html)를 파싱하여 공고 카드 목록 및 필터링 동작을 완벽히 수행해야 한다', () => {
      const fixturePath = path.resolve(__dirname, '../fixtures/jumpit_positions.html');
      const html = fs.readFileSync(fixturePath, 'utf-8');

      const container = document.createElement('div');
      container.innerHTML = html;

      // 1. 공고 카드 수집
      const cardElements = adapter.getJobCardElements(container);
      expect(cardElements.length).toBe(16);

      // 2. 모든 카드가 올바른 공고 정보로 파싱되어야 함
      const parsedCards = cardElements
        .map((el) => adapter.parseCard(el))
        .filter((info): info is NonNullable<typeof info> => info !== null);
      expect(parsedCards.length).toBe(16);

      // 첫 번째 카드 검증
      const firstCard = parsedCards[0];
      expect(firstCard.companyName).toBe('위볼린');
      expect(firstCard.title).toBe('개발자 채용[신입]');
      expect(firstCard.jobId).toBe('55185963');
      expect(firstCard.closingDate).toBe('D-4');

      // 3. FilterEngine을 통한 실전 필터링 검증
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
        [
          { id: '1', pattern: '위볼린', type: 'company', createdAt: Date.now() },
          { id: '2', pattern: '신입', type: 'keyword', createdAt: Date.now() },
          { id: '3', pattern: '999999', type: 'job', createdAt: Date.now() },
        ]
      );

      // 위볼린 차단 평가
      const result1 = engine.evaluateJobCard(firstCard);
      expect(result1.shouldFilter).toBe(true);
      expect(result1.matchedItem?.pattern).toBe('위볼린');

      // FilterEngine 필터링 실행
      let blockedCount = 0;
      let blockedCompanyCount = 0;
      for (const card of parsedCards) {
        const res = engine.evaluateJobCard(card);
        if (res.shouldFilter) {
          blockedCount++;
          if (res.matchedItem?.type === 'company') {
            blockedCompanyCount++;
          }
          engine.applyFilter(card.cardElement);
        }
      }
      expect(blockedCount).toBeGreaterThan(0);
      expect(blockedCompanyCount).toBeGreaterThan(0);
    });

    it('실제 점핏 상세 페이지 HTML 픽스처(jumpit_detail.html)를 파싱하여 상세 헤더 및 필터링을 검증해야 한다', () => {
      const fixturePath = path.resolve(__dirname, '../fixtures/jumpit_detail.html');
      const html = fs.readFileSync(fixturePath, 'utf-8');

      const container = document.createElement('div');
      container.innerHTML = html;

      const originalLocation = window.location;
      delete (window as any).location;
      window.location = {
        ...originalLocation,
        pathname: '/position/55185963',
        href: 'https://jumpit.saramin.co.kr/position/55185963',
      } as any;

      try {
        const cardElements = adapter.getJobCardElements(container);
        expect(cardElements.length).toBeGreaterThan(0);

        const headerCard = cardElements[0];
        const info = adapter.parseCard(headerCard);
        expect(info).not.toBeNull();
        expect(info?.companyName).toBe('위볼린');
        expect(info?.title).toBe('개발자 채용[신입]');
        expect(info?.jobId).toBe('55185963');
        expect(info?.closingDate).toBe('2026-10-31');
      } finally {
        (window as any).location = originalLocation;
      }
    });

    it('점핏 공고 카드에 잡플래닛 및 블라인드 평점 뱃지를 정확히 주입해야 한다', () => {
      const card = document.createElement('div');
      card.innerHTML = `
        <a href="/position/100">
          <div class="sc-15ba67b8-2 jkmBOM">
            <span>라인플러스</span>
          </div>
          <h2>라인 플랫폼 엔지니어</h2>
        </a>
      `;

      const cardInfo = {
        cardElement: card,
        companyName: '라인플러스',
        title: '라인 플랫폼 엔지니어',
        isAd: false,
      };

      // 1. 잡플래닛 평점 주입 (초록색)
      adapter.injectRatingBadge(cardInfo, {
        platform: 'jobplanet',
        status: 'found',
        companyName: '라인플러스',
        rating: 4.2,
        reviewCount: 350,
        companyId: 8888,
        cachedAt: Date.now(),
      });

      const jpBadge = card.querySelector('.job-filter-rating-jobplanet');
      expect(jpBadge).not.toBeNull();
      expect(jpBadge?.textContent).toContain('4.2');

      // 2. 블라인드 평점 주입 (빨간색)
      adapter.injectRatingBadge(cardInfo, {
        platform: 'blind',
        status: 'found',
        companyName: '라인플러스',
        rating: 4.1,
        reviewCount: 200,
        cachedAt: Date.now(),
      });

      const blindBadge = card.querySelector('.job-filter-rating-blind');
      expect(blindBadge).not.toBeNull();
      expect(blindBadge?.textContent).toContain('4.1');
    });

    it('점핏 상세 페이지 헤더에서 회사명 뒤에 <a> 중첩 없이 평점 뱃지 래퍼를 주입해야 한다', () => {
      const header = document.createElement('div');
      header.className = 'sc-80824a9d-0 gYKwrs';
      header.innerHTML = `
        <h1>백엔드 개발자</h1>
        <a class="name" href="/company/123"><span>카카오</span></a>
      `;

      const cardInfo = {
        cardElement: header,
        companyName: '카카오',
        title: '백엔드 개발자',
        isAd: false,
      };

      const originalLocation = window.location;
      delete (window as any).location;
      window.location = {
        ...originalLocation,
        pathname: '/position/123456',
        href: 'https://jumpit.saramin.co.kr/position/123456',
      } as any;

      try {
        adapter.injectRatingBadge(cardInfo, {
          platform: 'jobplanet',
          status: 'found',
          companyName: '카카오',
          rating: 3.8,
          cachedAt: Date.now(),
        });

        const wrap = header.querySelector('.job-filter-ratings-wrap');
        expect(wrap).not.toBeNull();
        // a.name 내부에 중첩되지 않고 그 뒤의 형제(sibling)로 주입되었는지 확인
        expect(wrap?.parentElement).toBe(header);
        expect(header.querySelector('a.name .job-filter-ratings-wrap')).toBeNull();
      } finally {
        (window as any).location = originalLocation;
      }
    });
  });
});

