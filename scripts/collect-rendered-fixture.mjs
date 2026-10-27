/**
 * 실제 브라우저(Playwright)로 리멤버/원티드 목록 페이지의 "렌더링 완료된 DOM"을 수집한다.
 *
 * 배경:
 *  기존 tests/fixtures/remember_postings.html 은 Next.js 하이드레이션 직후의
 *  스켈레톤 상태를 캡처한 것이라 실제 공고 카드가 없다.
 *  정적 HTML 파싱만으로는 SPA 사이트를 검증할 수 없으므로,
 *  JS 실행 후 DOM 을 덤프해야 한다.
 *
 * 사용법:
 *  node scripts/collect-rendered-fixture.mjs <remember|wanted> [출력경로]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKTREE_ROOT = path.resolve(__dirname, '..');

const TARGETS = {
  remember: {
    url: 'https://career.rememberapp.co.kr/job/postings',
    out: 'tests/fixtures/remember_postings_rendered.html',
    // 공고 카드가 실제로 나타날 때까지 기다릴 셀렉터 후보
    waitFor: [
      'a[href*="/job/posting/"]',
      'li:has(a[href*="/job/posting/"])',
    ],
    // 스켈레톤/광고를 제외한 실제 공고 링크만 세는 함수
    countJobLinks: `(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/job/posting/"]'));
      return links.filter(a => {
        const rel = (a.getAttribute('rel') || '').toLowerCase();
        const href = a.getAttribute('href') || '';
        // 광고 배너 제외: rel=sponsored, 내부에 광고 이미지만 있는 경우
        if (rel.includes('sponsored')) return false;
        if (a.querySelector('img[src*="ad-cdn"]')) return false;
        return /\\/job\\/posting\\/\\d+/.test(href);
      }).length;
    })()`,
  },
  wanted: {
    url: 'https://www.wanted.co.kr/wdlist/518/872',
    out: 'tests/fixtures/wanted_wdlist_rendered.html',
    waitFor: ['[data-cy="job-card"]', 'a[href*="/wd/"]'],
    countJobLinks: `(() => {
      return document.querySelectorAll('[data-cy="job-card"], a[href*="/wd/"]').length;
    })()`,
  },
};

const target = TARGETS[process.argv[2]];
if (!target) {
  console.error('사용법: node scripts/collect-rendered-fixture.mjs <remember|wanted> [출력경로]');
  process.exit(1);
}

const outPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(WORKTREE_ROOT, target.out);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  locale: 'ko-KR',
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

console.log(`[collect] 이동: ${target.url}`);
await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

// 셀렉터 후보 중 하나라도 나타날 때까지 대기
let appeared = false;
for (const sel of target.waitFor) {
  try {
    await page.waitForSelector(sel, { timeout: 25000 });
    console.log(`[collect] 셀렉터 출현: ${sel}`);
    appeared = true;
    break;
  } catch {
    console.log(`[collect] 셀렉터 미출현: ${sel}`);
  }
}

// 스크롤을 내려 lazy-load 카드까지 로드
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => window.scrollBy(0, window.innerHeight));
  await page.waitForTimeout(1500);
}
// 맨 위로 복귀 후 추가 렌더 안정화 대기
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(2500);

const jobLinkCount = await page.evaluate(target.countJobLinks);
console.log(`[collect] 실제 공고 링크 수: ${jobLinkCount}`);

const html = await page.content();
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, 'utf-8');

const size = fs.statSync(outPath).size;
console.log(`[collect] 저장: ${outPath}`);
console.log(`[collect] 크기: ${Math.round(size / 1024)} KB`);
console.log(`[collect] appeared=${appeared}`);

// 진단용: 주요 클래스 해시 분포 출력
const hashes = await page.evaluate(() => {
  const set = new Set();
  document.querySelectorAll('[class*="sc-"]').forEach((el) => {
    const m = /sc-[0-9a-f]{8}/.exec(el.className || '');
    if (m) set.add(m[0]);
  });
  return Array.from(set).slice(0, 20);
});
console.log(`[collect] sc- 해시 샘플: ${hashes.join(', ')}`);

await browser.close();
process.exit(jobLinkCount > 0 ? 0 : 2);
