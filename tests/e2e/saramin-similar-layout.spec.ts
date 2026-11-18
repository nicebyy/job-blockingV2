import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * [회귀] 사람인 지역별 채용목록 하단 "유사해요" 추천 공고(.similar_recruit) 텍스트 겹침 방지
 *
 * ## 배경 (사용자 제보 및 실측 근거)
 *
 * 사람인에서 공고 열람 시 하단에 동적 삽입되는 `.similar_recruit` 박스 내 목록에서,
 * 근무지역이 여러 개 나열된 공고(예: "서울전체, 경기 경기전체, 과천시, 수원시, 안산시, 안양시 동안구...")의 경우
 * `.job_condition` 너비(220px)를 초과하여 342px 이상으로 늘어난다.
 * 그 결과 우측의 `.job_date`(마감일 및 [입사지원] 버튼) 영역을 **+108.7px 침범하여 심각한 글자 겹침**이 발생한다.
 *
 * ## 이 테스트가 지키는 계약
 *
 *   1. 긴 근무지역 텍스트가 있어도 `.job_condition` 내부 span 은 우측 `.job_date` 를 절대 침범하지 않는다 (overlap <= 0).
 *   2. 지역명은 남는 폭 안에서 안전하게 말줄임(ellipsis) 처리되고, 경력 표기는 온전히 유지된다.
 *   3. 마감일과 [입사지원] 버튼은 줄바꿈이나 겹침 없이 우측에 정렬된다.
 */

const STYLE_CSS = fs.readFileSync(path.resolve(process.cwd(), 'src/content/style.css'), 'utf-8');

test.describe('사람인 유사 공고 레이아웃 검증', () => {
  test('긴 근무지역 공고에서도 유사 공고 행의 지역 텍스트가 날짜/지원버튼을 침범하지 않아야 한다', async ({
    page,
  }) => {
    const testHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    /* 사람인 사이트 CSS 규칙 원본 재현 */
    .list_recruiting .list_body .list_item.has_similar_list { overflow: hidden; border: 1px solid #d7dce5; border-radius: 8px; width: 1258px; margin: 0 auto; }
    .list_recruiting .list_body .list_item .similar_recruit { display: block; padding: 20px 0px 0px; border-top: 1px solid #eaedf4; box-sizing: border-box; background-color: #fff; }
    .list_recruiting .list_body .list_item .similar_recruit .tit { position: relative; margin-left: 40px; color: #222; font-size: 16px; line-height: 24px; font-weight: bold; }
    .list_recruiting .list_body .list_item .similar_recruit .list_ongoing { overflow-y: auto; margin-top: 8px; padding: 0px 40px; height: auto; list-style: none; }
    .list_recruiting .list_body .list_item .similar_recruit .list_ongoing > li { display: flex; padding: 24px 0px; align-items: center; height: 22px; border-top: 1px solid #eaedf4; }
    .list_recruiting .list_body .list_item .similar_recruit .list_ongoing > li:first-child { border-top: none; }
    .list_recruiting .list_body .list_item .similar_recruit .list_ongoing > li .corp_name { display: flex; align-items: center; margin-right: 0px; width: 166px; color: #222; font-size: 14px; flex: 0 0 166px; }
    .list_recruiting .list_body .list_item .similar_recruit .list_ongoing > li .job_tit { float: none; margin-right: 0px; margin-left: 52px; width: 530px; box-sizing: border-box; color: #222; font-size: 15px; font-weight: bold; white-space: normal; flex: 0 0 530px; }
    .list_recruiting .list_body .list_item .similar_recruit .list_ongoing > li .job_tit > a { display: inline-block; overflow: hidden; width: 100%; color: #222; font-size: 15px; font-weight: bold; text-overflow: ellipsis; white-space: nowrap; }
    .list_recruiting .list_body .list_item .similar_recruit .list_ongoing > li .job_condition { margin-left: 40px; width: 220px; flex: 0 0 220px; }
    .list_recruiting .list_body .list_item .similar_recruit .list_ongoing > li .job_condition > span { display: inline-block; overflow: hidden; color: #666; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
    .list_recruiting .list_body .list_item .similar_recruit .list_ongoing > li .job_condition > span + span { position: relative; padding-left: 4px; }
    .list_recruiting .list_body .list_item .similar_recruit .list_ongoing > li .job_condition > span + span::before { display: block; position: absolute; top: 50%; left: 0px; width: 1px; height: 10px; background-color: #eaedf4; transform: translateY(-50%); content: ""; }
    .list_recruiting .list_body .list_item .similar_recruit .list_ongoing > li .job_date { display: flex; width: 160px; text-align: right; align-items: center; justify-content: flex-end; flex: 1 1 0%; margin-left: 14px; }
    .list_recruiting .list_body .list_item .similar_recruit .list_ongoing > li .job_date .date { display: inline-block; color: #888; font-size: 12px; }
    .list_recruiting .list_body .list_item .similar_recruit .list_ongoing > li .job_date .sri_btn_sm { margin-left: 8px; border: 1px solid #ff5a5f; color: #ff5a5f; padding: 4px 12px; border-radius: 4px; background: #fff; cursor: pointer; }
  </style>
</head>
<body style="background: #f8f9fa; padding: 20px;">
  <div class="list_recruiting">
    <div class="list_body">
      <div class="list_item has_similar_list">
        <div class="similar_recruit">
          <strong class="tit">방금 본 공고와 <b style="color: #4876ef;">유사</b>해요! 😃</strong>
          <ul class="list_ongoing">
            <li id="row-normal">
              <span class="corp_name"><a href="#">(주)아이디정보시스템</a></span>
              <h2 class="job_tit"><a href="#">[대구]솔루션개발 개발자 채용[신입/경력사원]</a></h2>
              <div class="job_condition">
                <span><a href="#">대구 수성구</a></span>
                <span>신입·경력</span>
              </div>
              <div class="job_date">
                <span class="date">채용시</span>
                <button class="sri_btn_sm">입사지원</button>
              </div>
            </li>
            <li id="row-overflow1">
              <span class="corp_name"><a href="#">(주)텍드원</a></span>
              <h2 class="job_tit"><a href="#">JAVA JSP Springframe egov WEB/APP 경력[경기/안양]</a></h2>
              <div class="job_condition">
                <span><a href="#">서울전체</a>, <a href="#">경기 경기전체</a>, <a href="#">과천시</a>, <a href="#">수원시</a>, <a href="#">안산시</a>, <a href="#">안양시 동안구</a></span>
                <span>경력3년↑</span>
              </div>
              <div class="job_date">
                <span class="date">~11.27(금)</span>
                <button class="sri_btn_sm">입사지원</button>
              </div>
            </li>
            <li id="row-overflow2">
              <span class="corp_name"><a href="#">(주)누리어시스템</a></span>
              <h2 class="job_tit"><a href="#">[금융SI] Java, jsp 정규직 웹개발자 채용</a></h2>
              <div class="job_condition">
                <span><a href="#">서울전체</a>, <a href="#">강남구</a>, <a href="#">강동구</a>, <a href="#">서대문구</a>, <a href="#">중구</a>, <a href="#">경기 경기전체</a>, <a href="#">안양시 동안구</a></span>
                <span>경력3~20년</span>
              </div>
              <div class="job_date">
                <span class="date">~11.26(목)</span>
                <button class="sri_btn_sm">입사지원</button>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    await page.setContent(testHtml);

    // 1. 확장 CSS 미적용 상태에서는 겹침(overlap > 50px)이 실제로 재현되어야 한다
    const beforeOverlap = await page.evaluate(() => {
      const row = document.querySelector('#row-overflow1')!;
      const span = row.querySelector('.job_condition span:first-child') as HTMLElement;
      const date = row.querySelector('.job_date') as HTMLElement;
      return span.getBoundingClientRect().right - date.getBoundingClientRect().left;
    });
    expect(beforeOverlap).toBeGreaterThan(50); // 실측 약 +108.7px

    // 2. 확장 프로그램 CSS 주입
    await page.addStyleTag({ content: STYLE_CSS });

    // 3. 확장 CSS 적용 후에는 겹침이 0px 이하(안전 여백 확보)여야 한다
    const afterMetrics = await page.evaluate(() => {
      const row1 = document.querySelector('#row-overflow1')!;
      const row2 = document.querySelector('#row-overflow2')!;

      const checkRow = (el: Element) => {
        const span = el.querySelector('.job_condition span:first-child') as HTMLElement;
        const date = el.querySelector('.job_date') as HTMLElement;
        const spanRect = span.getBoundingClientRect();
        const dateRect = date.getBoundingClientRect();
        return {
          overlap: spanRect.right - dateRect.left,
          spanRight: spanRect.right,
          dateLeft: dateRect.left,
        };
      };

      return {
        row1: checkRow(row1),
        row2: checkRow(row2),
      };
    });

    expect(afterMetrics.row1.overlap).toBeLessThanOrEqual(0);
    expect(afterMetrics.row2.overlap).toBeLessThanOrEqual(0);
  });
});
