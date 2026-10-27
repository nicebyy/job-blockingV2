import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { JobKoreaAdapter } from '../../src/adapters/jobkorea';
import { INLINE_BUTTON_CONFIG } from '../../src/constants';

/**
 * [회귀] 잡코리아 채용목록(/recruit/joblist)의 [공고숨김 / 회사차단] 툴바는
 * "해당 행에 마우스를 올렸을 때만" 보여야 하며, 목록의 모든 행에 상시 노출되면 안 된다.
 *
 * ## 배경 (실제 발생한 버그)
 *
 * 툴바는 기본적으로 `.job-filter-btn-group` 규칙에 의해
 *   position: absolute / opacity: 0 / pointer-events: none
 * 으로 숨겨져 있고, 카드 hover 시에만 opacity: 1 로 노출되는 "호버 리빌" 방식이다.
 *
 * 그런데 상세페이지 전용 스타일 블록에 아래와 같은 **구조 기반 셀렉터**가 함께 들어 있었다.
 *
 *     div:has(> h1):has(a[href*="/company/"]) .job-filter-btn-group { position: static; opacity: 1; }
 *
 * 잡코리아 채용목록은 목록 전체를 `<div id="content"><h1 class="skip">…</h1>…` 로 감싼다.
 * 따라서 로그인 세션·기업 배너 등으로 `#content` 내부에 `a[href*="/company/"]` 링크가
 * 하나라도 존재하는 순간, 위 규칙이 **목록의 모든 행 툴바**에 매칭되었다. 결과적으로
 *
 *   1) 호버해야만 보이던 [공고숨김/회사차단] 캡슐이 60개 행 전체에 상시 노출되고,
 *   2) `position: static` 강제로 캡슐이 제목 셀 흐름에 끼어들어
 *      행 하단으로 흘러내리고 행 높이까지 늘어났다 (위치가 부자연스러운 원인).
 *
 * ## 이 테스트가 지키는 계약
 *
 *   - 목록용 툴바는 절대 `position: static` / `opacity: 1` 로 강제되지 않는다.
 *   - 상세페이지 전용으로 쓰이는 구조 셀렉터(`div:has(> h1):has(a[href*="/company/"])`)가
 *     다시 CSS 에 등장하지 않는다.
 *   - `#content` 안에 기업 링크가 있어도 상세페이지 전용 클래스가 부여되지 않는다.
 */
describe('[회귀] 잡코리아 채용목록 툴바는 호버 시에만 노출되어야 한다', () => {
  const adapter = new JobKoreaAdapter();

  beforeAll(() => {
    // [공고숨김/회사차단] 툴바를 주입할 목록 DOM 을 구성한다.
    // 실제 채용목록과 동일하게 목록 전체를 <div id="content"><h1 class="skip">… 로 감싼다.
    document.body.innerHTML = `
      <div id="content" class="clear">
        <h1 class="skip">메뉴별 채용공고</h1>
        <div class="tplList tplJobList">
          <table>
            <thead>
              <tr><th>행 선택</th><th>회사명</th><th>채용제목</th><th>미리보기</th><th>등록일·마감일</th></tr>
            </thead>
            <tbody>
              ${Array.from({ length: 5 })
                .map(
                  (_, i) => `
                <tr class="devloopArea" data-gno="5024693${i}" data-info=" 5024693${i}|5184361${i}|wm${i}|C|AM||3683879${i}">
                  <th scope="row"><input type="checkbox" /></th>
                  <td class="tplCo">
                    <a href="/Recruit/Co_Read/C/3683879${i}" class="link normalLog">테스트회사${i}</a>
                    <button type="button" class="tplBtnTy tplBtnFavOff dev-favor"><span class="blind">관심기업</span></button>
                    <div class="typ"></div>
                  </td>
                  <td class="tplTit">
                    <div class="titBx">
                      <strong><a href="/Recruit/GI_Read/5024693${i}" class="link normalLog">테스트 공고 제목 ${i}</a></strong>
                      <button type="button" class="tplBtnTy dev-scrap tplBtnScrOff"><span class="blind">스크랩</span></button>
                      <p class="etc"><span class="cell">경력무관</span><span class="cell">서울</span></p>
                      <p class="dsc">직무 설명 텍스트 ${i}</p>
                    </div>
                  </td>
                  <td class="tplPrv"><button type="button" class="lstBtn lstBtnPreview">미리보기</button></td>
                  <td class="odd">
                    <button type="button" class="tplBtn tplBtn_1 tplBtnOrg dev-btn-apply">즉시지원</button>
                    <span class="time dotum">12시간 전 등록</span>
                    <span class="date dotum">~11/08(일)</span>
                  </td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // 어댑터로 실제와 동일하게 각 행에 툴바를 주입한다.
    adapter.getJobCardElements(document).forEach((card) => {
      const info = adapter.parseCard(card);
      if (!info) return;
      adapter.injectInlineButton(info, { onBlockCompany: () => {}, onBlockJob: () => {} });
    });
  });

  afterEach(() => {
    // 각 테스트가 툴바 상태를 오염시키지 않도록 상세 전용 클래스만 정리한다.
    document
      .querySelectorAll(`.${INLINE_BUTTON_CONFIG.CLASSES.CONTAINER_DETAIL}`)
      .forEach((el) => el.classList.remove(INLINE_BUTTON_CONFIG.CLASSES.CONTAINER_DETAIL));
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  const cssPath = path.resolve(__dirname, '../../src/content/style.css');
  const css = fs.readFileSync(cssPath, 'utf-8');

  /** 주석을 제거한 실제 규칙 본문만 남긴다 (주석에 적힌 셀렉터 문자열에 속지 않도록) */
  const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');

  it('목록 각 행에 툴바가 정확히 1개씩 주입되어야 한다', () => {
    const rows = Array.from(document.querySelectorAll('tr.devloopArea'));
    expect(rows.length).toBe(5);

    for (const row of rows) {
      const groups = row.querySelectorAll(`.${INLINE_BUTTON_CONFIG.CLASSES.CONTAINER}`);
      expect(groups.length).toBe(1);
    }
  });

  it('목록 툴바에는 상세페이지 전용 클래스(job-filter-btn-group-detail)가 부여되지 않아야 한다', () => {
    const groups = Array.from(
      document.querySelectorAll<HTMLElement>(`.${INLINE_BUTTON_CONFIG.CLASSES.CONTAINER}`)
    );
    expect(groups.length).toBe(5);

    for (const group of groups) {
      expect(
        group.classList.contains(INLINE_BUTTON_CONFIG.CLASSES.CONTAINER_DETAIL),
        '목록 행의 툴바에 상세페이지 전용 클래스가 잘못 부여됨'
      ).toBe(false);
    }
  });

  it('CSS 에 페이지 레이아웃 추정 구조 셀렉터(div:has(> h1):has(a[href*="/company/"]))가 다시 등장하면 안 된다', () => {
    // 이 셀렉터가 목록 전체 래퍼(#content)까지 매칭되어 전 행 상시 노출 회귀를 일으켰다.
    expect(stripComments(css)).not.toContain('div:has(> h1):has(a[href*="/company/"])');
  });

  it('상세페이지 전용 스타일 블록이 목록 툴바를 정적 배치(position: static)로 강제하지 않아야 한다', () => {
    // 문제가 되었던 "상시 노출(opacity: 1) + 정적 배치(position: static)" 블록을 추출한다.
    // 해당 블록은 .job-filter-btn-group-detail 을 포함하는 규칙 집합이다.
    const rules = stripComments(css).split('}');
    const detailRule = rules.find(
      (rule) =>
        rule.includes('.job-filter-btn-group-detail') &&
        rule.includes('position: static') &&
        rule.includes('opacity: 1')
    );
    expect(detailRule, '상세페이지 전용 상시노출 규칙을 찾지 못함').toBeDefined();

    const selectorPart = detailRule!.split('{')[0];
    const selectors = selectorPart
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    // 목록 페이지에서도 매칭될 수 있는 구조 셀렉터가 하나도 없어야 한다.
    // (허용: JS 가 명시 부여하는 클래스, 상세페이지 전용 헤더 클래스/ID)
    const FORBIDDEN_PATTERNS = [
      /^div:has\(/i, // 조상 구조 추정
      /^#content\b/i, // 페이지 전체 래퍼
      /\.tplJobList/i, // 목록 전용 래퍼
      /tr\.devloopArea/i, // 목록 전용 행
      /td\.tplTit/i, // 목록 전용 셀
    ];

    for (const sel of selectors) {
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(
          pattern.test(sel),
          `상세페이지 전용 규칙에 목록에 매칭되는 셀렉터가 포함됨: ${sel}`
        ).toBe(false);
      }
    }
  });

  it('#content 안에 기업 링크가 존재해도 목록 툴바가 상세 전용 스타일로 전환되지 않아야 한다', () => {
    // 로그인 세션·기업 배너로 흔히 생기는 상황을 인위적으로 재현한다.
    const content = document.querySelector('#content')!;
    const banner = document.createElement('div');
    banner.className = 'list-banner';
    banner.innerHTML = '<a href="https://www.jobkorea.co.kr/company/12345">기업정보</a>';
    content.insertBefore(banner, content.firstChild);

    try {
      // 툴바가 여전히 목록용 상태여야 한다 (상세 전용 클래스 미부여 / 인라인 정적 배치 없음)
      const groups = Array.from(
        document.querySelectorAll<HTMLElement>(`.${INLINE_BUTTON_CONFIG.CLASSES.CONTAINER}`)
      );
      expect(groups.length).toBe(5);

      for (const group of groups) {
        expect(group.classList.contains(INLINE_BUTTON_CONFIG.CLASSES.CONTAINER_DETAIL)).toBe(false);
        expect(group.style.position).not.toBe('static');
      }
    } finally {
      banner.remove();
    }
  });

  it('잡코리아 채용목록 테이블 행 툴바는 비어 있는 상단 밴드에 놓이도록 위치 보정 규칙을 가져야 한다', () => {
    // 라이브 페이지 실측: td.tplTit 안의 .titBx 가 margin-top:26px 를 가져
    // 제목 첫 줄은 행 상단 +26px 에서 시작한다. 캡슐 높이 23px 이므로
    // top 이 0~2px 일 때만 제목 텍스트를 침범하지 않는다.
    // (기존 기본값 top:10px → 10~33px 로 제목 줄을 침범, 라이브 19개 행에서 글자와 겹침)
    const rules = stripComments(css);
    const jobListRule = rules
      .split('}')
      .find((rule) =>
        rule.includes('.tplJobList tr.devloopArea td.tplTit > .job-filter-btn-group')
      );

    expect(jobListRule, '잡코리아 채용목록 행 툴바 위치 보정 규칙을 찾지 못함').toBeDefined();
    expect(jobListRule).toMatch(/top:\s*[0-2]px\s*!important/);
  });
});
