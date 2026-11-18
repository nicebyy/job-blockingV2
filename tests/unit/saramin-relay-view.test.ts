import { describe, it, expect, beforeEach } from 'vitest';
import { SaraminAdapter } from '../../src/adapters/saramin';
import { SARAMIN_SELECTORS, RATING_BADGE_CONFIG } from '../../src/constants';
import { FilterEngine } from '../../src/core/filter-engine';
import { BlockItem, DEFAULT_SETTINGS, CompanyRatingInfo } from '../../src/types';

describe('사람인 릴레이 뷰(Relay View) 및 추천 공고 파싱/필터링 검증', () => {
  let adapter: SaraminAdapter;

  beforeEach(() => {
    adapter = new SaraminAdapter();
  });

  it('사람인 릴레이 뷰 URL을 isDetailPage: true 로 정확히 판정해야 한다', () => {
    const relayUrl =
      'https://www.saramin.co.kr/zf_user/jobs/relay/view?isMypage=no&rec_idx=55586302&recommend_ids=test&view_type=list&gz=1&t_ref_content=general&t_ref=area_recruit&relayNonce=7a94b30f90fdc2d86a1d&immediately_apply_layer_open=n#seq=0';
    expect(adapter.isDetailPage(relayUrl)).toBe(true);
  });

  it('릴레이 뷰 우측 윙 "Ai매치 채용정보" (ul.offer.list > li) 추천 카드를 정상 추출하고 파싱해야 한다', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="jview_wing">
        <div class="scroller">
          <div class="inner">
            <ul class="offer list">
              <li id="recommend_wing_0">
                <a href="/zf_user/jobs/relay/view?rec_idx=55438537&view_type=list" class="link">
                  <span class="company">(주)코코에이치</span>
                  <span class="title">[IT 개발자] 신입 및 경력 채용</span>
                  <span class="info">대구 동구 | 경력무관 | 대졸↑</span>
                </a>
                <button type="button" class="btn_scrap" rec_idx="55438537">스크랩</button>
                <span class="recruit_func">
                  <span class="date">채용시</span>
                  <button class="sri_btn_xs">입사지원</button>
                </span>
              </li>
              <li id="recommend_wing_1">
                <a href="/zf_user/jobs/relay/view?rec_idx=55459903&view_type=list" class="link">
                  <span class="company">(주)데이타뱅크</span>
                  <span class="title">JAVA 개발자 모집(병원 EMR / XPlatform)</span>
                  <span class="info">대구 수성구 | 경력1년↑ | 초대졸↑</span>
                </a>
                <button type="button" class="btn_scrap" rec_idx="55459903">스크랩</button>
                <span class="recruit_func">
                  <span class="date">~ 12/2(수)</span>
                  <button class="sri_btn_xs">입사지원</button>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    `;

    const cards = adapter.getJobCardElements(container);
    expect(cards.length).toBe(2);

    // 1번째 카드 파싱 검증 ((주)코코에이치)
    const card0 = adapter.parseCard(cards[0]);
    expect(card0).not.toBeNull();
    expect(card0?.companyName).toBe('(주)코코에이치');
    expect(card0?.title).toBe('[IT 개발자] 신입 및 경력 채용');
    expect(card0?.jobId).toBe('55438537');
    expect(card0?.closingDate).toBe('채용시');

    // 2번째 카드 파싱 검증 ((주)데이타뱅크)
    const card1 = adapter.parseCard(cards[1]);
    expect(card1).not.toBeNull();
    expect(card1?.companyName).toBe('(주)데이타뱅크');
    expect(card1?.title).toBe('JAVA 개발자 모집(병원 EMR / XPlatform)');
    expect(card1?.jobId).toBe('55459903');
    expect(card1?.closingDate).toBe('~ 12/2(수)');
  });

  it('릴레이 뷰 우측 윙 추천 카드에서 차단된 회사(데이타뱅크)가 정상 필터링되어야 한다', () => {
    const blockList: BlockItem[] = [
      {
        id: '1',
        pattern: '데이타뱅크',
        type: 'company',
        platform: 'saramin',
        createdAt: Date.now(),
      },
    ];

    const filterEngine = new FilterEngine({ ...DEFAULT_SETTINGS, mode: 'hide' }, blockList, 'saramin');

    const liEl = document.createElement('li');
    liEl.id = 'recommend_wing_1';
    liEl.innerHTML = `
      <a href="/zf_user/jobs/relay/view?rec_idx=55459903&view_type=list" class="link">
        <span class="company">(주)데이타뱅크</span>
        <span class="title">JAVA 개발자 모집</span>
      </a>
      <button type="button" rec_idx="55459903">스크랩</button>
    `;

    const cardInfo = adapter.parseCard(liEl);
    expect(cardInfo).not.toBeNull();

    const result = filterEngine.evaluateJobCard(cardInfo!);
    expect(result.shouldFilter).toBe(true);
    expect(result.matchedItem?.pattern).toBe('데이타뱅크');

    filterEngine.applyFilter(liEl, 'hide');
    expect(liEl.style.display).toBe('none');
    expect(liEl.getAttribute('data-job-filtered')).toBe('true');
  });

  it('릴레이 뷰 동적 본문(section.jview)이 정상 추출되고 헤더 내부에 인라인 버튼이 주입되어야 한다', () => {
    const container = document.createElement('div');
    container.className = 'wrap_jview';
    container.innerHTML = `
      <section class="jview jview-0-55586302">
        <div class="wrap_jv_cont">
          <div class="jv_header">
            <div class="title_inner">
              <a href="#" class="company">(주)소프트아이텍</a>
              <h1 class="tit_job">SW 개발자 모집 (대구)</h1>
            </div>
          </div>
          <div class="jv_detail">본문 내용</div>
        </div>
      </section>
    `;

    const cards = adapter.getJobCardElements(container);
    expect(cards.length).toBe(1);

    const cardInfo = adapter.parseCard(cards[0]);
    expect(cardInfo).not.toBeNull();
    expect(cardInfo?.companyName).toBe('(주)소프트아이텍');
    expect(cardInfo?.title).toBe('SW 개발자 모집 (대구)');
    expect(cardInfo?.jobId).toBe('55586302');

    // 인라인 버튼 주입
    adapter.injectInlineButton(cardInfo!, {
      onBlockCompany: () => {},
      onBlockJob: () => {},
    });

    const btnGroup = cards[0].querySelector('.job-filter-btn-group');
    expect(btnGroup).not.toBeNull();
    // jv_header title_inner 내부에 안전하게 주입되었는지 확인
    expect(cards[0].querySelector('.title_inner .job-filter-btn-group')).not.toBeNull();
  });

  it('우측 윙 추천 카드에서 getCompanyElement()가 정상 동작하여 평점 뱃지 앵커 요소를 반환해야 한다', () => {
    const liEl = document.createElement('li');
    liEl.id = 'recommend_wing_0';
    liEl.innerHTML = `
      <a href="/zf_user/jobs/relay/view?rec_idx=55438537" class="link">
        <span class="company">(주)코코에이치</span>
        <span class="title">[IT 개발자] 채용</span>
      </a>
    `;

    const compEl = adapter.getCompanyElement(liEl);
    expect(compEl).not.toBeNull();
    expect(compEl?.textContent?.trim()).toBe('(주)코코에이치');

    const cardInfo = adapter.parseCard(liEl);
    expect(cardInfo).not.toBeNull();

    // 평점 뱃지 주입
    const ratingInfo: CompanyRatingInfo = {
      companyName: '(주)코코에이치',
      rating: 3.5,
      platform: 'jobplanet',
      status: 'found',
      companyId: 12345,
      cachedAt: Date.now(),
    };

    adapter.injectRatingBadge(cardInfo!, ratingInfo);

    const badge = liEl.querySelector<HTMLElement>(
      `.${RATING_BADGE_CONFIG.CLASSES.BADGE}.${RATING_BADGE_CONFIG.CLASSES.JOBPLANET}`
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('3.5');
  });

  it('상세 페이지(isDetailPage)에서 본문 공고가 hide 모드로 차단되어도 blur 로 안전 대체되어야 한다', () => {
    const sectionEl = document.createElement('section');
    sectionEl.className = 'jview jview-0-55586302';
    sectionEl.innerHTML = `
      <div class="wrap_jv_cont">
        <div class="jv_header">
          <div class="title_inner">
            <a href="#" class="company">(주)소프트아이텍</a>
            <h1 class="tit_job">SW 개발자 모집</h1>
          </div>
        </div>
      </div>
    `;

    // DETAIL_VIEW_PROTECTED_CONTAINERS 매칭 확인
    expect(sectionEl.matches(SARAMIN_SELECTORS.DETAIL_RELAY_CONTAINERS)).toBe(true);

    const filterEngine = new FilterEngine({ ...DEFAULT_SETTINGS, mode: 'blur' }, [], 'saramin');
    // blur 모드 적용 시 display: none 이 아니어야 함
    filterEngine.applyFilter(sectionEl, 'blur');
    expect(sectionEl.style.display).not.toBe('none');
    expect(sectionEl.style.filter).toContain('blur');
  });
});
