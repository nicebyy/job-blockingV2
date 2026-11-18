import { describe, it, expect, beforeEach } from 'vitest';
import { SaraminAdapter } from '../../src/adapters/saramin';
import { RATING_BADGE_CONFIG, INLINE_BUTTON_CONFIG } from '../../src/constants';
import { FilterEngine } from '../../src/core/filter-engine';
import { BlockItem, DEFAULT_SETTINGS, CompanyRatingInfo } from '../../src/types';

describe('사람인 최근 본 공고 하단 "유사해요" 추천 공고 파싱 및 필터링 검증', () => {
  let adapter: SaraminAdapter;

  beforeEach(() => {
    adapter = new SaraminAdapter();
  });

  const sampleSimilarHtml = `
    <div class="list_item has_similar_list">
      <div class="box_item">
        <div class="col company_nm"><a href="#">(주)소프트아이텍</a></div>
        <div class="col notification_info"><a class="str_tit" href="#">SW 개발자 모집</a></div>
      </div>
      <div class="similar_recruit" style="display: block;">
        <strong class="tit">방금 본 공고와 <b class="color_blue">유사</b>해요!</strong>
        <ul class="list_ongoing ScrollBar">
          <li id="similar_job_0">
            <span class="corp_name">
              <a href="/zf_user/jobs/relay/view?rec_idx=55470143" idx="55470143">
                <span>(주)텍드원</span>
              </a>
            </span>
            <h2 class="job_tit">
              <a href="/zf_user/jobs/relay/view?rec_idx=55470143">
                <span>JAVA JSP Springframe egov WEB/APP 경력[경기/안양]</span>
              </a>
            </h2>
            <div class="job_condition">
              <span><a href="#">서울전체</a>, <a href="#">경기 경기전체</a></span>
              <span>경력3년↑</span>
            </div>
            <div class="job_date">
              <span class="date">~11.27(금)</span>
              <button class="sri_btn_sm"><span class="sri_btn_immediately">입사지원</span></button>
            </div>
          </li>
          <li id="similar_job_1">
            <span class="corp_name">
              <a href="/zf_user/jobs/relay/view?rec_idx=55136476" idx="55136476">
                <span>(주)누리어시스템</span>
              </a>
            </span>
            <h2 class="job_tit">
              <a href="/zf_user/jobs/relay/view?rec_idx=55136476">
                <span>[금융SI] Java, jsp 정규직 웹개발자 채용</span>
              </a>
            </h2>
            <div class="job_condition">
              <span><a href="#">서울전체</a>, <a href="#">강남구</a></span>
              <span>경력3~20년</span>
            </div>
            <div class="job_date">
              <span class="date">~11.26(목)</span>
              <button class="sri_btn_sm"><span class="sri_btn_immediately">입사지원</span></button>
            </div>
          </li>
        </ul>
      </div>
    </div>
  `;

  it('getJobCardElements()가 유사 공고 카드(.similar_recruit .list_ongoing > li)를 정상 추출해야 한다', () => {
    const container = document.createElement('div');
    container.innerHTML = sampleSimilarHtml;

    const cards = adapter.getJobCardElements(container);
    // 메인 카드 1개 + 유사 공고 카드 2개 = 총 3개 카드 검출
    expect(cards.length).toBeGreaterThanOrEqual(3);

    const similarCards = cards.filter((el) => el.closest('.similar_recruit'));
    expect(similarCards.length).toBe(2);
  });

  it('parseCard()가 유사 공고 카드의 회사명, 제목, jobId, 마감일을 정확히 파싱해야 한다', () => {
    const container = document.createElement('div');
    container.innerHTML = sampleSimilarHtml;

    const li0 = container.querySelector<HTMLElement>('#similar_job_0')!;
    const cardInfo0 = adapter.parseCard(li0);

    expect(cardInfo0).not.toBeNull();
    expect(cardInfo0?.companyName).toBe('(주)텍드원');
    expect(cardInfo0?.title).toBe('JAVA JSP Springframe egov WEB/APP 경력[경기/안양]');
    expect(cardInfo0?.jobId).toBe('55470143');
    expect(cardInfo0?.closingDate).toBe('~11.27(금)');

    const li1 = container.querySelector<HTMLElement>('#similar_job_1')!;
    const cardInfo1 = adapter.parseCard(li1);

    expect(cardInfo1).not.toBeNull();
    expect(cardInfo1?.companyName).toBe('(주)누리어시스템');
    expect(cardInfo1?.title).toBe('[금융SI] Java, jsp 정규직 웹개발자 채용');
    expect(cardInfo1?.jobId).toBe('55136476');
    expect(cardInfo1?.closingDate).toBe('~11.26(목)');
  });

  it('차단 목록에 등록된 회사의 유사 공고 카드는 FilterEngine에 의해 숨김/블러 처리되어야 한다', () => {
    const container = document.createElement('div');
    container.innerHTML = sampleSimilarHtml;

    const blockList: BlockItem[] = [
      {
        id: 'block_1',
        pattern: '(주)텍드원',
        type: 'company',
        platform: 'saramin',
        createdAt: Date.now(),
      },
    ];

    const filterEngine = new FilterEngine({ ...DEFAULT_SETTINGS, mode: 'hide' }, blockList, 'saramin');
    const li0 = container.querySelector<HTMLElement>('#similar_job_0')!;
    const cardInfo0 = adapter.parseCard(li0)!;

    const result = filterEngine.evaluateJobCard(cardInfo0);
    expect(result.shouldFilter).toBe(true);
    expect(result.matchedItem?.pattern).toBe('(주)텍드원');

    filterEngine.applyFilter(li0, 'hide');
    expect(li0.style.display).toBe('none');
    expect(li0.getAttribute('data-job-filtered')).toBe('true');
  });

  it('유사 공고 카드에 평점 뱃지와 인라인 [공고숨김 / 회사차단] 버튼이 정상 주입되어야 한다', () => {
    const container = document.createElement('div');
    container.innerHTML = sampleSimilarHtml;

    const li0 = container.querySelector<HTMLElement>('#similar_job_0')!;
    const cardInfo0 = adapter.parseCard(li0)!;

    const ratingInfo: CompanyRatingInfo = {
      companyName: '(주)텍드원',
      rating: 3.2,
      platform: 'jobplanet',
      status: 'found',
      companyId: 99999,
      cachedAt: Date.now(),
    };

    adapter.injectRatingBadge(cardInfo0, ratingInfo);

    const badge = li0.querySelector<HTMLElement>(
      `.${RATING_BADGE_CONFIG.CLASSES.BADGE}.${RATING_BADGE_CONFIG.CLASSES.JOBPLANET}`
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('3.2');

    adapter.injectInlineButton(cardInfo0, {
      onBlockCompany: () => {},
      onBlockJob: () => {},
    });

    const btnGroup = li0.querySelector(`.${INLINE_BUTTON_CONFIG.CLASSES.CONTAINER}`);
    expect(btnGroup).not.toBeNull();
  });
});
