import { test, expect } from './fixtures';
import { UI_MESSAGES, POPUP_STATS_CONFIG } from '../../src/constants';

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
  });
});
