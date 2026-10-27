import { defineConfig, devices } from '@playwright/test';

/**
 * headless 여부 결정 우선순위:
 *   1. PW_HEADLESS 환경변수 ('true'/'1' 이면 headless)
 *   2. CI 환경변수 (CI 에는 디스플레이가 없으므로 headless 강제)
 *   3. 기본값 false (로컬에서 실제 브라우저 창을 보며 디버깅)
 *
 * 배경: 확장 프로그램 테스트는 오랫동안 headless: false 가 관례였으나,
 *       Chromium 의 new headless 모드에서 확장 로드가 정상 동작함을 실측했다
 *       (5/5 통과). CI 게이트를 돌리려면 headless 강제가 필요하다.
 */
const isHeadless =
  process.env.PW_HEADLESS === 'true' ||
  process.env.PW_HEADLESS === '1' ||
  !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // CI 에서는 일시적 네트워크 흔들림을 감안해 1회 재시도한다
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    // retries 가 0 이면 on-first-retry 트레이스가 생성되지 않으므로
    // 실패 시점에 항상 남도록 retain-on-failure 를 사용한다
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: isHeadless,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
