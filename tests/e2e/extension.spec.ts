import { test, expect } from './fixtures';

test.describe('크롬 확장 프로그램 E2E 테스트', () => {
  test('팝업 창(Popup UI)이 정상적으로 렌더링되어야 한다', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);

    // 헤더 타이틀 확인
    await expect(page.locator('h1')).toContainText('잡필터 V2');

    // 통계 카드 확인
    await expect(page.locator('.stats-card')).toBeVisible();
    await expect(page.locator('.stat-label').first()).toContainText('차단된 공고');

    // 빠른 추가 인풋 및 버튼 확인
    await expect(page.locator('.add-input')).toBeVisible();
    await expect(page.locator('.add-btn')).toBeVisible();

    // 무한 스크롤 토글 옵션 확인
    await expect(page.locator('.section').first()).toContainText('무한 스크롤 & 자동 채우기');
  });

  test('옵션 페이지(Options UI)에서 회사를 차단 목록에 등록하고 삭제할 수 있어야 한다', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/src/options/index.html`);

    // 타이틀 확인
    await expect(page.locator('h1')).toContainText('차단 목록 관리');

    // 회사 등록
    const testCompany = '테스트블랙기업';
    await page.getByPlaceholder('차단할 회사명 입력').fill(testCompany);
    await page.locator('.btn-primary').click();

    // 목록에 추가되었는지 확인
    await expect(page.locator('.block-list')).toContainText(testCompany);

    // 삭제 버튼 클릭
    await page.locator('.btn-delete').click();

    // 삭제 후 빈 상태가 표시되는지 확인
    await expect(page.locator('.empty-state')).toContainText('등록된 차단 항목이 없습니다');
  });
});
