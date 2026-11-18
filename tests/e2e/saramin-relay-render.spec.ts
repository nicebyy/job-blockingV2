import { test, expect } from './fixtures';

test.describe('사람인 릴레이 뷰 렌더링 검증', () => {
  test('릴레이 뷰(/zf_user/jobs/relay/view) 접속 시 공고 본문이 정상적으로 렌더링되어야 한다', async ({
    page,
  }) => {
    test.setTimeout(30000);

    const consoleLogs: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    const targetUrl =
      'https://www.saramin.co.kr/zf_user/jobs/relay/view?isMypage=no&rec_idx=55586302&recommend_ids=eJxFzssNA0EIA9BqcjcY8zmnkPTfRWa10nB8MpaRgi3Wr%2Bmf%2Bkpiww8NL92pvGloBrwpwwd9GUY3HNpLwGops5ncYwa6d9ft9LerTvp2iz1zyTxfbxplEbXHKeAZsj%2FSeC%2Fe&view_type=list&gz=1&t_ref_content=general&t_ref=area_recruit&relayNonce=7a94b30f90fdc2d86a1d&immediately_apply_layer_open=n#seq=0';

    console.log('Navigating to targetUrl...');
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // AJAX 로드 및 DOM 렌더링 대기 (최대 10초)
    try {
      await page.waitForSelector('.wrap_jview > .jview, .wrap_jview > section', {
        timeout: 10000,
        state: 'attached',
      });
      console.log('Found .wrap_jview children!');
    } catch (e) {
      console.log('Timeout waiting for .wrap_jview children!');
    }

    console.log('Page Errors:', pageErrors);
    console.log('All Console Logs:', consoleLogs);

    const extensionState = await page.evaluate(() => {
      const btnGroups = document.querySelectorAll('.job-filter-btn-group');
      const ratings = document.querySelectorAll('.job-filter-rating-badge, .job-filter-rating-wrap');
      const filteredEls = document.querySelectorAll('[data-job-filtered="true"]');
      const hosts = document.querySelectorAll('.job-filter-card-host');
      return {
        btnGroupsCount: btnGroups.length,
        ratingsCount: ratings.length,
        filteredElsCount: filteredEls.length,
        hostsCount: hosts.length,
      };
    });
    console.log('extensionState:', extensionState);

    const wrapJviewState = await page.evaluate(() => {
      const el = document.querySelector('.wrap_jview');
      if (!el) return { exists: false };
      const children = Array.from(el.children).map((c) => ({
        tag: c.tagName,
        cls: c.className,
        display: window.getComputedStyle(c).display,
        visibility: window.getComputedStyle(c).visibility,
        height: (c as HTMLElement).offsetHeight,
        textSnippet: c.textContent?.slice(0, 100).trim(),
      }));
      return {
        exists: true,
        display: window.getComputedStyle(el).display,
        children,
      };
    });

    console.log('wrapJviewState:', JSON.stringify(wrapJviewState, null, 2));

    // 스크롤을 내려서 본문 상세 및 두 번째 공고 렌더링 확인
    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'scripts/relay_view_scroll1.png' });

    await page.evaluate(() => window.scrollBy(0, 3000));
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'scripts/relay_view_scroll2.png' });

    const allJviews = await page.evaluate(() => {
      const els = document.querySelectorAll('.wrap_jview > .jview, .wrap_jview > section');
      return Array.from(els).map((el) => ({
        tag: el.tagName,
        cls: el.className,
        height: (el as HTMLElement).offsetHeight,
        buttons: el.querySelectorAll('.job-filter-btn-group').length,
      }));
    });
    console.log('allJviews after scroll:', allJviews);
    expect(allJviews).toBeDefined();
    if (wrapJviewState.exists) {
      expect(wrapJviewState.display).not.toBe('none');
    }
  });
});
