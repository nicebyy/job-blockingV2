import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseBlindCompanyPage,
  parseBlindSearchResult,
  BlindService,
} from '../../src/core/blind';
import { BLIND_CONFIG } from '../../src/constants';

describe('Blind 연동 기능 단위 테스트', () => {
  describe('parseBlindCompanyPage (상세 페이지 SSR JSON-LD 파싱)', () => {
    it('유효한 JSON-LD가 포함된 경우 status: found 및 평점을 반환해야 한다', () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "http://schema.org",
            "@type": "EmployerAggregateRating",
            "ratingValue": "3.5",
            "ratingCount": 3119,
            "itemReviewed": {
              "@type": "Organization",
              "name": "카카오"
            }
          }
          </script>
        </head>
        <body></body>
        </html>
      `;

      const result = parseBlindCompanyPage(mockHtml, '카카오');
      expect(result.status).toBe('found');
      expect(result.rating).toBe(3.5);
      expect(result.reviewCount).toBe(3119);
      expect(result.companyUrl).toBe(`${BLIND_CONFIG.COMPANY_BASE_URL}/%EC%B9%B4%EC%B9%B4%EC%98%A4`);
    });

    it('법인 표기((주))가 포함되어 있어도 정규화되어 정확히 매칭되어야 한다', () => {
      const mockHtml = `
        <script type="application/ld+json">
        {
          "@context": "http://schema.org",
          "@type": "EmployerAggregateRating",
          "ratingValue": "4.1",
          "ratingCount": 150,
          "itemReviewed": {
            "@type": "Organization",
            "name": "(주)당근마켓"
          }
        }
        </script>
      `;

      const result = parseBlindCompanyPage(mockHtml, '당근마켓');
      expect(result.status).toBe('found');
      expect(result.rating).toBe(4.1);
    });

    it('JSON-LD의 회사명이 대상 회사와 다른 경우 status: not_found를 반환해야 한다', () => {
      const mockHtml = `
        <script type="application/ld+json">
        {
          "@type": "EmployerAggregateRating",
          "ratingValue": "3.8",
          "itemReviewed": {
            "name": "네이버"
          }
        }
        </script>
      `;

      const result = parseBlindCompanyPage(mockHtml, '라인플러스');
      expect(result.status).toBe('not_found');
      expect(result.rating).toBeUndefined();
    });

    it('JSON-LD가 없거나 평점 정보가 없는 경우 status: not_found를 반환해야 한다', () => {
      const mockHtml = `<html><body><div>회사 소개</div></body></html>`;
      const result = parseBlindCompanyPage(mockHtml, '토스');
      expect(result.status).toBe('not_found');
    });

    it('평점이 0점 이하이거나 비정상일 경우 status: not_found를 반환해야 한다', () => {
      const mockHtml = `
        <script type="application/ld+json">
        {
          "@type": "EmployerAggregateRating",
          "ratingValue": "0",
          "itemReviewed": { "name": "신생기업" }
        }
        </script>
      `;

      const result = parseBlindCompanyPage(mockHtml, '신생기업');
      expect(result.status).toBe('not_found');
    });
  });

  describe('parseBlindSearchResult (검색 결과 페이지 파싱 및 동명 기업 판별)', () => {
    it('1. 단일 기업이 검색되고 일치할 경우 status: found와 평점을 반환해야 한다', () => {
      const mockSearchHtml = `
        <div class="comp_list">
          <div class="w_company">
            <div class="inner">
              <a href="/kr/company/%EC%9A%B0%EC%95%84%ED%95%9C%ED%98%95%EC%A0%9C%EB%93%A4" class="name">우아한형제들</a>
              <span class="star"><i class="blind">Rating Score</i>3.7</span>
            </div>
          </div>
        </div>
      `;

      const result = parseBlindSearchResult(mockSearchHtml, '우아한형제들');
      expect(result.status).toBe('found');
      expect(result.rating).toBe(3.7);
      expect(result.companyUrl).toBe(`${BLIND_CONFIG.COMPANY_BASE_URL}/%EC%9A%B0%EC%95%84%ED%95%9C%ED%98%95%EC%A0%9C%EB%93%A4`);
    });

    it('2. 동명의 회사가 2개 이상 검색될 경우 status: ambiguous를 반환해야 한다 (사용자 규칙: 동명의 회사가 여러개일 경우 배치x)', () => {
      const mockSearchHtml = `
        <div class="comp_list">
          <div class="w_company">
            <a href="/kr/company/%EB%8F%99%EB%AA%85%EC%8B%9C%EC%8A%A4%ED%85%9C-1" class="name">(주)동명시스템</a>
            <span class="star"><i class="blind">Rating Score</i>3.9</span>
          </div>
          <div class="w_company">
            <a href="/kr/company/%EB%8F%99%EB%AA%85%EC%8B%9C%EC%8A%A4%ED%85%9C-2" class="name">동명시스템</a>
            <span class="star"><i class="blind">Rating Score</i>2.5</span>
          </div>
        </div>
      `;

      const result = parseBlindSearchResult(mockSearchHtml, '동명시스템');
      expect(result.status).toBe('ambiguous');
      expect(result.rating).toBeUndefined();
    });

    it('3. 검색 결과가 전혀 없거나 대상 회사와 일치하지 않는 경우 status: not_found를 반환해야 한다 (배치x)', () => {
      const mockSearchHtml = `
        <div class="comp_list">
          <div class="w_company">
            <a href="/kr/company/%ED%86%A0%EC%8A%A4%EB%9E%A9" class="name">토스랩</a>
            <span class="star"><i class="blind">Rating Score</i>3.2</span>
          </div>
        </div>
      `;

      const result = parseBlindSearchResult(mockSearchHtml, '비바리퍼블리카');
      expect(result.status).toBe('not_found');
      expect(result.rating).toBeUndefined();
    });

    it('4. 평점이 0점(리뷰 없음)인 경우 status: not_found를 반환해야 한다', () => {
      const mockSearchHtml = `
        <div class="comp_list">
          <div class="w_company">
            <a href="/kr/company/%EB%AF%B8%ED%8F%89%EA%B0%80%EA%B8%B0%EC%97%85" class="name">미평가기업</a>
            <span class="star"><i class="blind">Rating Score</i>0</span>
          </div>
        </div>
      `;

      const result = parseBlindSearchResult(mockSearchHtml, '미평가기업');
      expect(result.status).toBe('not_found');
    });
  });

  describe('BlindService (메모리/스토리지 캐싱 및 요청 최적화)', () => {
    let mockStorage: Record<string, any> = {};
    let service: BlindService;

    beforeEach(() => {
      mockStorage = {};
      service = BlindService.getInstance();
      service.clearCache();

      // global chrome.storage.local 모킹 (MV3 Promise 기반)
      (globalThis as any).chrome = {
        storage: {
          local: {
            get: vi.fn(async (key: string | string[]) => {
              const res: Record<string, any> = {};
              const keys = Array.isArray(key) ? key : [key];
              for (const k of keys) {
                if (k in mockStorage) {
                  res[k] = mockStorage[k];
                }
              }
              return res;
            }),
            set: vi.fn(async (items: Record<string, any>) => {
              Object.assign(mockStorage, items);
            }),
          },
        },
      };

      vi.restoreAllMocks();
    });

    it('메모리 캐시에 저장된 결과가 있으면 fetch를 호출하지 않고 반환해야 한다', async () => {
      const cachedInfo = {
        platform: 'blind' as const,
        status: 'found' as const,
        companyName: '카카오',
        rating: 3.5,
        reviewCount: 3000,
        companyUrl: 'https://www.teamblind.com/kr/company/%EC%B9%B4%EC%B9%B4%EC%98%A4',
        cachedAt: Date.now(),
      };

      // 미리 메모리 캐시에 주입
      (service as any).memoryCache.set('카카오', cachedInfo);

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const result = await service.getRating('카카오');

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.status).toBe('found');
      expect(result.rating).toBe(3.5);
    });

    it('chrome.storage.local에 유효한 캐시가 있으면 fetch를 호출하지 않고 복원해야 한다', async () => {
      const storageKey = `${BLIND_CONFIG.CACHE_KEY_PREFIX}네이버`;
      mockStorage[storageKey] = {
        platform: 'blind',
        status: 'found',
        companyName: '네이버',
        rating: 3.9,
        cachedAt: Date.now(),
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const result = await service.getRating('네이버');

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.status).toBe('found');
      expect(result.rating).toBe(3.9);
    });

    it('동일 기업에 대한 동시 비동기 호출 시 In-flight 중복 요청이 1회만 실행되어야 한다', async () => {
      let fetchCount = 0;
      let resolveFetch: (val: any) => void;
      const delayedFetch = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        fetchCount++;
        await delayedFetch;
        return {
          ok: true,
          status: 200,
          text: async () => `
            <script type="application/ld+json">
            {
              "@type": "EmployerAggregateRating",
              "ratingValue": "4.2",
              "itemReviewed": { "name": "당근" }
            }
            </script>
          `,
        } as any;
      });

      // 3개의 동시 요청 실행
      const p1 = service.getRating('당근');
      const p2 = service.getRating('당근');
      const p3 = service.getRating('당근');

      resolveFetch!(true);

      const [res1, res2, res3] = await Promise.all([p1, p2, p3]);

      expect(fetchCount).toBe(1);
      expect(res1.status).toBe('found');
      expect(res2.status).toBe('found');
      expect(res3.status).toBe('found');
      expect(res1.rating).toBe(4.2);
    });
  });
});
