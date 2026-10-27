import { test as base, chromium, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'path';

/**
 * 확장 프로그램 E2E 픽스처.
 *
 * 주의: chromium.launchPersistentContext 를 직접 호출하므로
 *       playwright.config.ts 의 use.headless 가 자동 상속되지 않는다.
 *       따라서 여기서 headless 를 명시적으로 계산해 전달해야
 *       CI(무GUI) 환경에서도 실행된다.
 *
 * headless 결정 우선순위: PW_HEADLESS > CI > 기본 false(로컬 디버깅)
 */
const isHeadless =
  process.env.PW_HEADLESS === 'true' ||
  process.env.PW_HEADLESS === '1' ||
  !!process.env.CI;

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const pathToExtension = path.resolve(process.cwd(), 'dist');

    if (!fs.existsSync(pathToExtension)) {
      throw new Error(
        `확장 빌드 산출물이 없습니다: ${pathToExtension}\n` +
          `'npm run build' 를 먼저 실행하세요 (pretest:e2e 로 자동 실행됩니다).`
      );
    }

    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: isHeadless,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    // MV3 service worker 가 등록될 때까지 대기한다.
    // CI 에서는 초기 기동이 느릴 수 있으므로 타임아웃을 넉넉히 준다.
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 30_000 });
    }

    const extensionId = serviceWorker.url().split('/')[2];
    await use(extensionId);
  },
});

export const expect = test.expect;
