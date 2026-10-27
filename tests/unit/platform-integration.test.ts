import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AdapterRegistry } from '../../src/adapters';
import { FilterEngine } from '../../src/core/filter-engine';
import { StorageManager } from '../../src/core/storage';
import { DEFAULT_SETTINGS, FilterSettings } from '../../src/types';
import {
  PLATFORM_FIXTURES,
  PlatformFixture,
  fixtureExists,
  loadPlatformDocument,
  buildBlockList,
} from './helpers/platform-fixtures';

/**
 * 플랫폼별 통합 테스트 (Integration Test)
 *
 * 단위 테스트(adapters.test.ts)가 "개별 파싱 함수"를 검증하는 반면,
 * 이 스위트는 실제 사이트 HTML 픽스처를 그대로 DOM 에 올린 뒤
 * **어댑터 -> 필터 엔진 -> DOM 반영**의 전 과정이 플랫폼별로 동작하는지 검증한다.
 *
 * 검증 항목 (모든 플랫폼 공통):
 *   1. URL -> 어댑터 라우팅 (AdapterRegistry)
 *   2. 실제 HTML 에서 공고 카드 추출 및 핵심 필드(회사명/제목/ID) 파싱
 *   3. 회사 차단 시 해당 카드가 실제 DOM 에서 숨김/블러 처리되는지
 *   4. 공고 단위 숨김 시 해당 카드만 숨겨지고 같은 회사의 다른 공고는 유지되는지
 *   5. 차단하지 않은 공고는 건드리지 않는지 (오탐 방지)
 *   6. 광고 숨김 토글 양방향 동작
 *   7. ContentController 전체 초기화 흐름
 *
 * 주의: 리멤버(Remember)는 실제 사이트의 styled-components 해시 변경으로
 *       목록 셀렉터가 깨져 있는 미해결 결함이 있다(platform-integration-bugs.test.ts 참조).
 *       해당 플랫폼은 "카드 추출" 최소 조건만 검증하고, 파싱 심층 검증은 bugs 파일에서
 *       it.fails 로 문서화한다.
 */

/** 픽스처 파일이 없으면 skip 사유 문자열을, 있으면 false 를 반환한다 */
const skipIfMissing = (fixture: PlatformFixture) =>
  fixtureExists(fixture) ? false : `픽스처 없음: ${fixture.file}`;

/**
 * 실제 DOM 셀렉터가 깨져 파싱이 불가능한 플랫폼.
 * (platform-integration-bugs.test.ts 에서 원인과 영향도를 문서화)
 */
const KNOWN_BROKEN_SELECTOR_PLATFORMS = new Set<string>(['remember']);

/** 테스트용 기본 설정 (평점/무한스크롤은 통합 테스트 범위 밖이므로 끔) */
const testSettings = (overrides: Partial<FilterSettings> = {}): FilterSettings => ({
  ...DEFAULT_SETTINGS,
  showJobplanetRating: false,
  showBlindRating: false,
  enableInfiniteScroll: false,
  // 광고 필터를 끄지 않으면 isAd 카드가 함께 차단되어 "회사 차단" 검증이 오염된다
  hideAds: false,
  ...overrides,
});

/** 픽스처의 카드들을 파싱하고, 가장 많이 등장하는 회사를 반환한다 */
function dominantCompany(adapter: ReturnType<typeof AdapterRegistry.getAdapterForUrl>) {
  const cards = adapter!.getJobCardElements(document);
  const parsed = cards
    .map((c) => adapter!.parseCard(c))
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const counts = new Map<string, number>();
  for (const p of parsed) {
    const name = p.companyName?.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return { cards, parsed, counts, ranked };
}

describe('플랫폼별 통합 테스트 — 어댑터 라우팅', () => {
  const routingCases: Array<{ url: string; expected: string }> = [
    { url: 'https://www.wanted.co.kr/wdlist/518/872', expected: 'Wanted' },
    { url: 'https://www.wanted.co.kr/wd/12345', expected: 'Wanted' },
    { url: 'https://www.saramin.co.kr/zf_user/search/recruit?searchword=개발', expected: 'Saramin' },
    { url: 'https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=55351925', expected: 'Saramin' },
    { url: 'https://www.jobkorea.co.kr/recruit/joblist', expected: 'JobKorea' },
    { url: 'https://www.jobkorea.co.kr/Recruit/GI_Read/43000000', expected: 'JobKorea' },
    { url: 'https://career.rememberapp.co.kr/job/list', expected: 'Remember' },
    { url: 'https://career.rememberapp.co.kr/job/posting/12345', expected: 'Remember' },
    { url: 'https://jumpit.saramin.co.kr/positions?sort=popular', expected: 'Jumpit' },
    { url: 'https://jumpit.saramin.co.kr/position/55185963', expected: 'Jumpit' },
  ];

  it.each(routingCases)('$url -> $expected 어댑터로 라우팅되어야 한다', ({ url, expected }) => {
    const adapter = AdapterRegistry.getAdapterForUrl(url);
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe(expected);
  });

  it('점핏 URL(jumpit.saramin.co.kr)이 사람인 어댑터로 잘못 라우팅되면 안 된다', () => {
    const adapter = AdapterRegistry.getAdapterForUrl('https://jumpit.saramin.co.kr/positions');
    expect(adapter!.name).toBe('Jumpit');
    expect(adapter!.name).not.toBe('Saramin');
  });

  it('지원하지 않는 사이트는 null 을 반환해야 한다', () => {
    expect(AdapterRegistry.getAdapterForUrl('https://www.google.com')).toBeNull();
    expect(AdapterRegistry.getAdapterForUrl('https://github.com/foo')).toBeNull();
  });

  it('5개 플랫폼 어댑터가 모두 등록되어 있어야 한다', () => {
    const names = AdapterRegistry.getAllAdapters()
      .map((a) => a.name)
      .sort();
    expect(names).toEqual(['JobKorea', 'Jumpit', 'Remember', 'Saramin', 'Wanted']);
  });
});

describe('플랫폼별 통합 테스트 — 카드 추출 및 파싱', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  for (const fixture of PLATFORM_FIXTURES) {
    describe(fixture.platform, () => {
      const broken = KNOWN_BROKEN_SELECTOR_PLATFORMS.has(fixture.platformKey);

      it.skipIf(skipIfMissing(fixture))(
        '실제 HTML 에서 공고 카드를 추출해야 한다',
        () => {
          const adapter = AdapterRegistry.getAdapterForUrl(fixture.url)!;
          loadPlatformDocument(fixture);

          const cards = adapter.getJobCardElements(document);
          expect(cards.length).toBeGreaterThan(0);
        }
      );

      it.skipIf(skipIfMissing(fixture) || broken)(
        '추출한 카드에서 회사명/제목을 파싱해야 한다',
        () => {
          const adapter = AdapterRegistry.getAdapterForUrl(fixture.url)!;
          loadPlatformDocument(fixture);

          const { cards, parsed } = dominantCompany(adapter);
          expect(parsed.length).toBeGreaterThan(0);
          expect(parsed.length / cards.length).toBeGreaterThanOrEqual(0.5);

          const withCompany = parsed.filter((p) => p.companyName && p.companyName.trim().length > 0);
          const withTitle = parsed.filter((p) => p.title && p.title.trim().length > 0);
          expect(withCompany.length).toBeGreaterThan(0);
          expect(withTitle.length).toBeGreaterThan(0);

          for (const p of withCompany) {
            expect(p.companyName.trim()).not.toBe('기업정보');
            expect(p.companyName.trim()).not.toBe('기업정보 더보기');
          }
        }
      );

      it.skipIf(skipIfMissing(fixture) || broken)(
        '공고 카드에서 jobId(고유 식별자)를 추출할 수 있어야 한다',
        () => {
          const adapter = AdapterRegistry.getAdapterForUrl(fixture.url)!;
          loadPlatformDocument(fixture);

          const { parsed } = dominantCompany(adapter);
          const withJobId = parsed.filter((p) => p.jobId && String(p.jobId).trim().length > 0);
          expect(withJobId.length).toBeGreaterThan(0);
        }
      );

      it.skipIf(skipIfMissing(fixture) || broken)(
        '동일한 카드에서 두 번 파싱해도 같은 결과가 나와야 한다 (부수효과 없음)',
        () => {
          const adapter = AdapterRegistry.getAdapterForUrl(fixture.url)!;
          loadPlatformDocument(fixture);

          const cards = adapter.getJobCardElements(document);
          const first = adapter.parseCard(cards[0]);
          const second = adapter.parseCard(cards[0]);

          expect(first?.companyName).toBe(second?.companyName);
          expect(first?.title).toBe(second?.title);
          expect(first?.jobId).toBe(second?.jobId);
        }
      );
    });
  }
});

describe('플랫폼별 통합 테스트 — 회사 차단 적용', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  for (const fixture of PLATFORM_FIXTURES) {
    describe(fixture.platform, () => {
      const broken = KNOWN_BROKEN_SELECTOR_PLATFORMS.has(fixture.platformKey);

      it.skipIf(skipIfMissing(fixture) || broken)(
        '특정 회사를 차단하면 해당 회사의 모든 공고가 실제 DOM 에서 숨겨져야 한다',
        () => {
          const adapter = AdapterRegistry.getAdapterForUrl(fixture.url)!;
          loadPlatformDocument(fixture);

          const { cards, ranked } = dominantCompany(adapter);
          const targetCompany = ranked[0]?.[0];
          expect(targetCompany).toBeDefined();

          const engine = new FilterEngine(testSettings({ mode: 'hide' }), buildBlockList([targetCompany!]));

          let blocked = 0;
          for (const card of cards) {
            const info = adapter.parseCard(card);
            if (!info) continue;
            if (engine.evaluateJobCard(info).shouldFilter) {
              engine.applyFilter(info.cardElement, 'hide');
              blocked++;
            }
          }

          expect(blocked).toBeGreaterThan(0);
          const hidden = document.querySelectorAll(
            '[data-job-filtered="true"][data-filter-mode="hide"]'
          );
          expect(hidden.length).toBe(blocked);
        }
      );

      it.skipIf(skipIfMissing(fixture) || broken)(
        '차단하지 않은 다른 회사의 공고는 건드리지 않아야 한다 (오탐 방지)',
        () => {
          const adapter = AdapterRegistry.getAdapterForUrl(fixture.url)!;
          loadPlatformDocument(fixture);

          const { cards, parsed, ranked } = dominantCompany(adapter);
          expect(ranked.length).toBeGreaterThanOrEqual(2);

          const blockedCompany = ranked[0]![0];
          const normalizedTarget = new FilterEngine(testSettings(), []).normalizeCompanyName(
            blockedCompany
          );

          const engine = new FilterEngine(testSettings({ mode: 'hide' }), buildBlockList([blockedCompany]));

          for (const card of cards) {
            const info = adapter.parseCard(card);
            if (!info) continue;
            if (engine.evaluateJobCard(info).shouldFilter) {
              engine.applyFilter(info.cardElement, 'hide');
            }
          }

          // 차단 대상이 아닌 회사의 카드는 속성이 없어야 한다
          for (const card of cards) {
            const info = adapter.parseCard(card);
            if (!info) continue;
            const isTarget = engine.normalizeCompanyName(info.companyName) === normalizedTarget;
            if (!isTarget) {
              expect(
                card.getAttribute('data-job-filtered'),
                `오탐: ${JSON.stringify(info.companyName)} 가 차단됨`
              ).toBeNull();
            }
          }
          expect(parsed.length).toBeGreaterThan(0);
        }
      );

      it.skipIf(skipIfMissing(fixture) || broken)(
        'blur 모드로 차단하면 카드가 제거되지 않고 블러 처리되어야 한다',
        () => {
          const adapter = AdapterRegistry.getAdapterForUrl(fixture.url)!;
          loadPlatformDocument(fixture);

          const { cards, ranked } = dominantCompany(adapter);
          const company = ranked[0]![0];

          const engine = new FilterEngine(testSettings({ mode: 'blur' }), buildBlockList([company]));

          for (const card of cards) {
            const info = adapter.parseCard(card);
            if (!info) continue;
            if (engine.evaluateJobCard(info).shouldFilter) {
              engine.applyFilter(info.cardElement, 'blur');
            }
          }

          const blurred = document.querySelectorAll('[data-filter-mode="blur"]');
          expect(blurred.length).toBeGreaterThan(0);
          for (const el of Array.from(blurred)) {
            expect((el as HTMLElement).style.display).not.toBe('none');
          }
        }
      );
    });
  }
});

describe('플랫폼별 통합 테스트 — 공고 단위 숨김', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  for (const fixture of PLATFORM_FIXTURES) {
    describe(fixture.platform, () => {
      const broken = KNOWN_BROKEN_SELECTOR_PLATFORMS.has(fixture.platformKey);

      it.skipIf(skipIfMissing(fixture) || broken)(
        '특정 공고만 숨기면 같은 회사의 다른 공고는 유지되어야 한다',
        () => {
          const adapter = AdapterRegistry.getAdapterForUrl(fixture.url)!;
          loadPlatformDocument(fixture);

          const { cards, counts, ranked } = dominantCompany(adapter);

          // 반드시 동일 회사 공고가 2건 이상이어야 이 검증이 의미가 있다
          const multi = ranked.find(([, n]) => n >= 2);
          if (!multi) {
            // 해당 픽스처에 동일 회사 공고가 1건뿐이면 공고 단위 구분을 검증할 수 없다
            expect(cards.length).toBeGreaterThan(0);
            return;
          }

          const [company] = multi;
          const cards2 = cards
            .map((c) => adapter.parseCard(c))
            .filter((p): p is NonNullable<typeof p> => p !== null);
          const target = cards2.find((p) => p.companyName?.trim() === company)!;

          const engine = new FilterEngine(testSettings({ mode: 'blur' }), [
            {
              id: 'job-1',
              pattern: String(target.jobId ?? `${target.companyName}:::${target.title}`),
              type: 'job',
              createdAt: Date.now(),
              title: target.title,
              companyName: target.companyName,
            },
          ]);

          let blockedCount = 0;
          for (const card of cards) {
            const info = adapter.parseCard(card);
            if (!info) continue;
            if (engine.evaluateJobCard(info).shouldFilter) {
              engine.applyFilter(info.cardElement, 'blur');
              blockedCount++;
            }
          }

          expect(blockedCount).toBeGreaterThanOrEqual(1);
          expect(blockedCount).toBeLessThan(counts.get(company)!);
        }
      );
    });
  }
});

describe('플랫폼별 통합 테스트 — 광고 숨김', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  for (const fixture of PLATFORM_FIXTURES) {
    describe(fixture.platform, () => {
      it.skipIf(skipIfMissing(fixture))(
        'hideAds 가 켜져 있으면 프로모션 배너를 숨기고 개수를 반환해야 한다',
        () => {
          const adapter = AdapterRegistry.getAdapterForUrl(fixture.url)!;
          loadPlatformDocument(fixture);

          if (typeof adapter.hidePromotionBanners !== 'function') return;

          const count = adapter.hidePromotionBanners(document);
          expect(count).toBeGreaterThanOrEqual(0);

          const adMarked = document.querySelectorAll('[data-blocked-type="ad"]');
          expect(adMarked.length).toBe(count);
        }
      );

      it.skipIf(skipIfMissing(fixture))(
        '광고 숨김 후 복원하면 원래 상태로 돌아와야 한다 (토글 양방향)',
        () => {
          const adapter = AdapterRegistry.getAdapterForUrl(fixture.url)!;
          loadPlatformDocument(fixture);

          if (
            typeof adapter.hidePromotionBanners !== 'function' ||
            typeof adapter.restorePromotionBanners !== 'function'
          ) {
            return;
          }

          const firstCount = adapter.hidePromotionBanners(document);
          adapter.restorePromotionBanners(document);
          expect(document.querySelectorAll('[data-blocked-type="ad"]').length).toBe(0);

          // 복원 후 다시 숨길 수 있어야 한다 (멱등성)
          const secondCount = adapter.hidePromotionBanners(document);
          expect(secondCount).toBe(firstCount);
        }
      );
    });
  }
});

describe('플랫폼별 통합 테스트 — ContentController 전체 흐름', () => {
  let originalLocation: Location;

  beforeEach(() => {
    document.body.innerHTML = '';
    originalLocation = window.location;
  });

  afterEach(() => {
    (window as any).location = originalLocation;
    document.body.innerHTML = '';
    delete (globalThis as any).chrome;
    vi.restoreAllMocks();
  });

  for (const fixture of PLATFORM_FIXTURES) {
    describe(fixture.platform, () => {
      const broken = KNOWN_BROKEN_SELECTOR_PLATFORMS.has(fixture.platformKey);

      it.skipIf(skipIfMissing(fixture) || broken)(
        'ContentController 초기화 시 회사 차단이 실제 카드에 적용되고 통계에 반영되어야 한다',
        async () => {
          delete (window as any).location;
          (window as any).location = new URL(fixture.url);

          const { createMockChrome } = await import('./helpers/mock-chrome');
          const { chrome } = createMockChrome();
          (globalThis as any).chrome = chrome;

          const adapter = AdapterRegistry.getAdapterForUrl(fixture.url)!;
          loadPlatformDocument(fixture);

          const { ranked } = dominantCompany(adapter);
          const targetCompany = ranked[0]![0];

          await StorageManager.saveBlockList([]);
          await StorageManager.saveSettings({
            mode: 'hide',
            hideAds: false,
            enableInfiniteScroll: false,
            showJobplanetRating: false,
            showBlindRating: false,
          });
          await StorageManager.addBlockItem(targetCompany, 'company', {
            platform: fixture.platformKey,
          });

          const { ContentController } = await import('../../src/content');
          const controller = new ContentController();
          await controller.init();

          const hidden = document.querySelectorAll(
            '[data-job-filtered="true"][data-filter-mode="hide"]'
          );
          expect(hidden.length).toBeGreaterThan(0);

          const stats = (controller as any).currentStats;
          expect(stats.blockedCompanies).toBeGreaterThanOrEqual(1);
          expect(stats.totalBlocked).toBeGreaterThanOrEqual(1);
        }
      );
    });
  }
});

describe('플랫폼별 통합 테스트 — 상세페이지 판정', () => {
  const detailCases: Array<{ platform: string; listUrl: string; detailUrl: string; adapter: string }> = [
    {
      platform: 'Wanted',
      adapter: 'Wanted',
      listUrl: 'https://www.wanted.co.kr/wdlist/518/872',
      detailUrl: 'https://www.wanted.co.kr/wd/326613',
    },
    {
      platform: 'Saramin',
      adapter: 'Saramin',
      listUrl: 'https://www.saramin.co.kr/zf_user/search/recruit?searchword=개발',
      detailUrl: 'https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=55351925',
    },
    {
      platform: 'JobKorea',
      adapter: 'JobKorea',
      listUrl: 'https://www.jobkorea.co.kr/recruit/joblist',
      detailUrl: 'https://www.jobkorea.co.kr/Recruit/GI_Read/43000000',
    },
    {
      platform: 'Remember',
      adapter: 'Remember',
      listUrl: 'https://career.rememberapp.co.kr/job/list',
      detailUrl: 'https://career.rememberapp.co.kr/job/posting/12345',
    },
    {
      platform: 'Jumpit',
      adapter: 'Jumpit',
      listUrl: 'https://jumpit.saramin.co.kr/positions?sort=popular',
      detailUrl: 'https://jumpit.saramin.co.kr/position/55185963',
    },
  ];

  it.each(detailCases)(
    '$platform: 목록 URL 은 상세가 아니고, 상세 URL 은 상세로 판정되어야 한다',
    ({ listUrl, detailUrl, adapter: adapterName }) => {
      const listAdapter = AdapterRegistry.getAdapterForUrl(listUrl)!;
      expect(listAdapter.name).toBe(adapterName);
      expect(listAdapter.isDetailPage?.(listUrl)).toBe(false);

      const detailAdapter = AdapterRegistry.getAdapterForUrl(detailUrl)!;
      expect(detailAdapter.name).toBe(adapterName);
      expect(detailAdapter.isDetailPage?.(detailUrl)).toBe(true);
    }
  );
});
