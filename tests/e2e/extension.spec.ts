import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './fixtures';
import { UI_MESSAGES, POPUP_STATS_CONFIG, SUPPORT_CONFIG } from '../../src/constants';

test.describe('크롬 확장 프로그램 E2E 테스트', () => {
  test('팝업 창(Popup UI)이 정상적으로 렌더링되어야 한다', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);

    // 헤더 타이틀 확인
    await expect(page.locator('h1')).toContainText(UI_MESSAGES.POPUP_TITLE);

    // 기본 모드 (전체 등록 누적 통계) 확인
    await expect(page.locator('.stats-card')).toBeVisible();
    await expect(page.locator('.stat-label').first()).toContainText(POPUP_STATS_CONFIG.TOTAL_LABELS.TOTAL);

    // 현재 페이지 탭 클릭 시 페이지 통계 모드로 전환 확인
    await page.locator('.stats-tab-btn').nth(1).click();
    await expect(page.locator('.stat-label').first()).toContainText(POPUP_STATS_CONFIG.PAGE_LABELS.TOTAL);

    // 빠른 추가 인풋 및 버튼 확인
    await expect(page.locator('.add-input')).toBeVisible();
    await expect(page.locator('.add-btn')).toBeVisible();

    // 무한 스크롤 및 잡플래닛/블라인드 평점 표시 토글 옵션 확인
    await expect(page.locator('.section').first()).toContainText('무한 스크롤 & 자동 채우기');
    await expect(page.locator('.section').first()).toContainText('잡플래닛 평점 표시');
    await expect(page.locator('.section').first()).toContainText('블라인드 평점 표시');

    // 리뷰 유도 배너 및 문의/개인정보처리방침 푸터 링크 확인
    await expect(page.locator('.rating-banner')).toBeVisible();
    await expect(page.locator('.rating-banner-title')).toContainText(SUPPORT_CONFIG.LABELS.RATING_BANNER_TITLE);
    await expect(page.locator('.footer-links')).toContainText(SUPPORT_CONFIG.LABELS.FEEDBACK);
    await expect(page.locator('.footer-links')).toContainText(SUPPORT_CONFIG.LABELS.PRIVACY);
  });

  test('옵션 페이지(Options UI)에서 회사를 차단 목록에 등록하고 삭제할 수 있어야 한다', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/src/options/index.html`);

    // 타이틀 확인
    await expect(page.locator('h1')).toContainText(UI_MESSAGES.OPTIONS_TITLE);

    // 회사 등록
    const testCompany = '테스트블랙기업';
    await page.getByPlaceholder('차단할 회사명 입력').fill(testCompany);
    await page.locator('.btn-primary').click();

    // 플랫폼 필터 탭에 '점핏' 탭이 노출되는지 확인
    const jumpitTab = page.locator('.platform-tab-btn', { hasText: '점핏' });
    await expect(jumpitTab).toBeVisible();

    // 목록에 추가되었는지 확인
    await expect(page.locator('.block-list')).toContainText(testCompany);

    // 삭제 버튼 클릭
    await page.locator('.btn-delete').click();

    // 삭제 후 빈 상태가 표시되는지 확인
    await expect(page.locator('.empty-state')).toContainText('등록된 차단 항목이 없습니다');

    // 하단 리뷰 유도 카드 및 피드백/개인정보처리방침 링크 확인
    await expect(page.locator('.options-review-card')).toBeVisible();
    await expect(page.locator('.options-review-card')).toContainText(SUPPORT_CONFIG.LABELS.RATING_BANNER_TITLE);
    await expect(page.locator('.options-footer-links')).toContainText(SUPPORT_CONFIG.LABELS.FEEDBACK);
    await expect(page.locator('.options-footer-links')).toContainText(SUPPORT_CONFIG.LABELS.PRIVACY);
  });

  test('점핏(Jumpit) 페이지에서 잡플래닛 및 블라인드 평점 뱃지가 공고 카드 회사명 옆에 정상 주입되어야 한다', async ({
    page,
  }) => {
    const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/jumpit_positions.html');
    const fixtureHtml = fs.readFileSync(fixturePath, 'utf8');

    await page.route('https://jumpit.saramin.co.kr/positions?sort=popular', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: fixtureHtml,
      });
    });

    await page.goto('https://jumpit.saramin.co.kr/positions?sort=popular', {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForTimeout(3000);

    const badges = await page.locator('.job-filter-rating-badge').all();
    expect(badges.length).toBeGreaterThan(0);

    // 와탭랩스 카드 평점 뱃지 가시성 및 회사명 옆 인라인 정렬 확인
    const wtableCard = page.locator('.sc-d609d44f-0:has-text("와탭랩스")').first();
    const wrap = wtableCard.locator('.job-filter-ratings-wrap');
    await expect(wrap).toBeVisible();

    // 썸네일 이미지 박스(.img_box) 내부가 아닌 본문(.sc-15ba67b8-0) 영역에 위치하는지 검증
    const insideImgBox = await wtableCard.locator('.img_box .job-filter-ratings-wrap').count();
    expect(insideImgBox).toBe(0);
  });

  test('원티드(Wanted) 채용 목록 페이지에서 잡플래닛 및 블라인드 평점 뱃지가 공고 카드 회사명 옆에 동일 행(가로 인라인)으로 정상 주입되어야 한다', async ({
    page,
  }) => {
    const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/wanted_wdlist.html');
    const fixtureHtml = fs.readFileSync(fixturePath, 'utf8');

    await page.route('https://www.wanted.co.kr/wdlist/518/872', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: fixtureHtml,
      });
    });

    await page.goto('https://www.wanted.co.kr/wdlist/518/872', {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForTimeout(3000);

    const badges = await page.locator('.job-filter-rating-badge').all();
    expect(badges.length).toBeGreaterThan(0);

    // 첫 번째 카드(디알비동일)의 회사명 및 평점 뱃지 가시성 및 가로 인라인 정렬 확인
    const targetCard = page.locator('li:has-text("디알비동일")').first();
    const wrap = targetCard.locator('.job-filter-ratings-wrap');
    await expect(wrap).toBeVisible();

    // 회사명 요소와 평점 뱃지가 동일 행(같은 Y좌표 라인)에 배치되었는지 검증
    const compBox = await targetCard.locator('span[class*="CompanyNameWithLocationPeriod__company"]').boundingBox();
    const wrapBox = await wrap.boundingBox();
    expect(compBox).not.toBeNull();
    expect(wrapBox).not.toBeNull();
    expect(Math.abs(compBox!.y - wrapBox!.y)).toBeLessThan(6);
  });

  test('팝업 창에서 환경 설정(블러/숨김 모드, 광고 숨김, 무한 스크롤, 평점 토글)을 정상적으로 변경하고 저장할 수 있어야 한다', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);

    // 1. 블러/숨김 모드 토글 (기본: blur)
    const modeSlider = page.locator('.switch .slider').nth(0);
    await expect(page.locator('.toggle-label').first()).toContainText(UI_MESSAGES.TOGGLE_LABELS.MODE_BLUR);
    await modeSlider.click();
    await expect(page.locator('.toggle-label').first()).toContainText(UI_MESSAGES.TOGGLE_LABELS.MODE_HIDE);

    // 2. 광고 숨기기 토글 (기본: true -> checked)
    const adsSlider = page.locator('.switch .slider').nth(1);
    await expect(page.locator('.switch input[type="checkbox"]').nth(1)).toBeChecked();
    await adsSlider.click();
    await expect(page.locator('.switch input[type="checkbox"]').nth(1)).not.toBeChecked();

    // 3. 무한 스크롤 토글 (기본: true -> checked)
    const scrollSlider = page.locator('.switch .slider').nth(2);
    await expect(page.locator('.switch input[type="checkbox"]').nth(2)).toBeChecked();
    await scrollSlider.click();
    await expect(page.locator('.switch input[type="checkbox"]').nth(2)).not.toBeChecked();

    // 4. 잡플래닛 평점 토글 (기본: true -> checked)
    const jpSlider = page.locator('.switch .slider').nth(3);
    await expect(page.locator('.switch input[type="checkbox"]').nth(3)).toBeChecked();
    await jpSlider.click();
    await expect(page.locator('.switch input[type="checkbox"]').nth(3)).not.toBeChecked();

    // 5. 블라인드 평점 토글 (기본: true -> checked)
    const blindSlider = page.locator('.switch .slider').nth(4);
    await expect(page.locator('.switch input[type="checkbox"]').nth(4)).toBeChecked();
    await blindSlider.click();
    await expect(page.locator('.switch input[type="checkbox"]').nth(4)).not.toBeChecked();

    // 새로고침 후에도 변경된 환경 설정이 유지되는지 검증
    await page.reload();
    await expect(page.locator('.toggle-label').first()).toContainText(UI_MESSAGES.TOGGLE_LABELS.MODE_HIDE);
    await expect(page.locator('.switch input[type="checkbox"]').nth(0)).toBeChecked();
    await expect(page.locator('.switch input[type="checkbox"]').nth(1)).not.toBeChecked();
    await expect(page.locator('.switch input[type="checkbox"]').nth(2)).not.toBeChecked();
    await expect(page.locator('.switch input[type="checkbox"]').nth(3)).not.toBeChecked();
    await expect(page.locator('.switch input[type="checkbox"]').nth(4)).not.toBeChecked();
  });

  test('점핏(Jumpit) 페이지에서 [공고숨김] 및 [회사차단] 클릭 시 카드가 숨김/블러 처리되고 차단 집계가 정확히 반영되어야 한다', async ({
    page,
    extensionId,
  }) => {
    const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/jumpit_positions.html');
    const fixtureHtml = fs.readFileSync(fixturePath, 'utf8');

    await page.route('https://jumpit.saramin.co.kr/positions?sort=popular', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: fixtureHtml,
      });
    });

    await page.goto('https://jumpit.saramin.co.kr/positions?sort=popular', {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForTimeout(3000);

    // 1. 위볼린 공고 카드 확인
    const weibolinCard = page.locator('.sc-d609d44f-0:has-text("위볼린")').first();
    await expect(weibolinCard).toBeVisible();

    // [공고숨김] 버튼 클릭 (사용자 명시적 의도로 블러 모드와 관계없이 항상 완전 숨김)
    const hideJobBtn = weibolinCard.locator('.job-filter-btn-job');
    await hideJobBtn.click({ force: true });

    // 위볼린 공고 카드가 완전 숨김(hidden) 처리되었는지 확인
    await expect(weibolinCard).toBeHidden();

    // 2. 와탭랩스 공고 카드 (2개 존재) 확인
    const wtableCards = page.locator('.sc-d609d44f-0:has-text("와탭랩스")');
    await expect(wtableCards).toHaveCount(2);

    // 첫 번째 와탭랩스 카드의 [회사차단] 버튼 클릭 (기본 설정인 블러 모드에 따라 흐리게 처리)
    const blockCompanyBtn = wtableCards.first().locator('.job-filter-btn-company');
    await blockCompanyBtn.click({ force: true });

    // 와탭랩스의 모든 카드에 블러 필터 속성이 일괄 적용되었는지 확인
    await expect(wtableCards.first()).toHaveAttribute('data-job-filtered', 'true');
    await expect(wtableCards.first()).toHaveAttribute('data-filter-mode', 'blur');
    await expect(wtableCards.nth(1)).toHaveAttribute('data-job-filtered', 'true');
    await expect(wtableCards.nth(1)).toHaveAttribute('data-filter-mode', 'blur');

    // 3. 팝업 창을 열어서 통계 집계가 정확히 연동되었는지 확인
    const popupPage = await page.context().newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/src/popup/index.html`);

    // 전체 등록 누적 모드 확인: 공고 1건 + 회사 1건 -> 총 2건
    const statValues = popupPage.locator('.stat-value');
    await expect(statValues.nth(0)).toHaveText('2'); // 전체
    await expect(statValues.nth(1)).toHaveText('1'); // 회사 (와탭랩스)
    await expect(statValues.nth(2)).toHaveText('1'); // 공고 (위볼린)

    await popupPage.close();
  });
});

