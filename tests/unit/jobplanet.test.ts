import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  normalizeCompanyNameForSearch,
  normalizeCompanyNameForCompare,
  parseJobplanetRsc,
  JobplanetService,
} from '../../src/core/jobplanet';
import { JOBPLANET_CONFIG } from '../../src/constants';

describe('Jobplanet 연동 기능 단위 테스트', () => {
  describe('normalizeCompanyNameForSearch (검색용 정규화)', () => {
    it('(주), 주식회사 등 법적 형태 표기를 제거해야 한다', () => {
      expect(normalizeCompanyNameForSearch('(주) 카카오')).toBe('카카오');
      expect(normalizeCompanyNameForSearch('카카오(주)')).toBe('카카오');
      expect(normalizeCompanyNameForSearch('㈜씨디네트웍스')).toBe('씨디네트웍스');
      expect(normalizeCompanyNameForSearch('중앙하이텔㈜')).toBe('중앙하이텔');
      expect(normalizeCompanyNameForSearch('주식회사 우아한형제들')).toBe('우아한형제들');
      expect(normalizeCompanyNameForSearch('우아한형제들 주식회사')).toBe('우아한형제들');
      expect(normalizeCompanyNameForSearch('(유) 디캐이')).toBe('디캐이');
      expect(normalizeCompanyNameForSearch('사단법인 한국소프트웨어산업협회')).toBe('한국소프트웨어산업협회');
    });

    it('대괄호 및 괄호 부가 정보(본사, 지사, 채용대행 등)를 제거해야 한다', () => {
      expect(normalizeCompanyNameForSearch('(주)원티드랩 [본사]')).toBe('원티드랩');
      expect(normalizeCompanyNameForSearch('네이버웹툰(주) (판교)')).toBe('네이버웹툰');
    });

    it('영문 법인 형태(Inc., Corp., Ltd., Co.)를 제거해야 한다', () => {
      expect(normalizeCompanyNameForSearch('Google Korea LLC')).toBe('Google Korea');
      expect(normalizeCompanyNameForSearch('Line Plus Corp.')).toBe('Line Plus');
      expect(normalizeCompanyNameForSearch('Samsung Electronics Co., Ltd.')).toBe('Samsung Electronics');
    });
  });

  describe('normalizeCompanyNameForCompare (동명 판별 및 비교용 엄격 정규화)', () => {
    it('공백과 특수문자를 모두 제거하고 소문자로 통일해야 한다', () => {
      expect(normalizeCompanyNameForCompare('(주) 우아한 형제들')).toBe('우아한형제들');
      expect(normalizeCompanyNameForCompare('우아한형제들(주)')).toBe('우아한형제들');
      expect(normalizeCompanyNameForCompare('Woowa Brothers, Inc.')).toBe('woowabrothers');
    });

    it('동일한 상호의 회사는 법적 표기 유무와 무관하게 동일한 문자열로 정규화되어야 한다', () => {
      const a = normalizeCompanyNameForCompare('(주)당근마켓');
      const b = normalizeCompanyNameForCompare('당근마켓');
      expect(a).toBe(b);
      expect(a).toBe('당근마켓');
    });
  });

  describe('parseJobplanetRsc (Next.js RSC 스트림 파싱 및 동명 회사 필터링)', () => {
    it('1. 회사 이름을 검색해서 정확히 1개 존재한다면 status: found 및 평점을 반환해야 한다', () => {
      // 1개 회사만 일치하는 실제 Next.js RSC 샘플 모의 데이터
      const mockRsc = `
        1:{"queryKey":["search","companyList",{"query":"우아한형제들"}],"items":[{"company_id":61420,"name":"(주)우아한형제들","rate_total_avg":3.8,"city_name":"서울"}]}
      `;

      const result = parseJobplanetRsc(mockRsc, '우아한형제들');
      expect(result.status).toBe('found');
      expect(result.rating).toBe(3.8);
      expect(result.companyId).toBe(61420);
      expect(result.companyUrl).toBe(`${JOBPLANET_CONFIG.COMPANY_BASE_URL}/61420`);
    });

    it('2. 회사가 존재하지 않거나 검색 결과가 없는 경우 status: not_found를 반환해야 한다 (배치x)', () => {
      const mockRsc = `
        1:{"queryKey":["search","companyList",{"query":"존재하지않는회사"}],"items":[]}
      `;

      const result = parseJobplanetRsc(mockRsc, '존재하지않는회사');
      expect(result.status).toBe('not_found');
      expect(result.rating).toBeUndefined();
    });

    it('3. 검색 결과가 다른 회사들만 포함된 경우 status: not_found를 반환해야 한다 (배치x)', () => {
      const mockRsc = `
        1:{"queryKey":["search","companyList",{"query":"토스"}],"items":[{"company_id":111,"name":"(주)토스랩","rate_total_avg":3.2},{"company_id":222,"name":"토스페이먼츠","rate_total_avg":3.5}]}
      `;

      // '비바리퍼블리카'를 검색했으나 결과에 없는 경우
      const result = parseJobplanetRsc(mockRsc, '비바리퍼블리카');
      expect(result.status).toBe('not_found');
      expect(result.rating).toBeUndefined();
    });

    it('4. 동명의 회사가 여러 개일 경우 status: ambiguous를 반환해야 한다 (사용자 규칙: 동명의 회사가 여러개일 경우 배치x)', () => {
      // (주)동명시스템과 동명시스템 두 회사가 모두 존재하는 경우
      const mockRsc = `
        1:{"queryKey":["search","companyList",{"query":"동명시스템"}],"items":[{"company_id":1001,"name":"(주)동명시스템","rate_total_avg":3.9,"city_name":"서울"},{"company_id":2002,"name":"동명시스템","rate_total_avg":2.4,"city_name":"부산"}]}
      `;

      const result = parseJobplanetRsc(mockRsc, '동명시스템');
      expect(result.status).toBe('ambiguous');
      expect(result.rating).toBeUndefined();
    });

    it('5. 평점이 0점(리뷰 없음)인 경우 status: not_found로 판정하여 배치를 방지해야 한다', () => {
      const mockRsc = `
        1:{"queryKey":["search","companyList",{"query":"신생기업"}],"items":[{"company_id":9999,"name":"(주)신생기업","rate_total_avg":0,"city_name":"서울"}]}
      `;

      const result = parseJobplanetRsc(mockRsc, '신생기업');
      expect(result.status).toBe('not_found');
      expect(result.rating).toBeUndefined();
    });

    it('6. React Query dehydrate 구조 외에 폴백 정규식으로도 아이템을 안전하게 추출할 수 있어야 한다', () => {
      const fallbackRsc = `
        {"company_id":7777,"name":"(주)테스트기업","rate_total_avg":4.2}
      `;

      const result = parseJobplanetRsc(fallbackRsc, '테스트기업');
      expect(result.status).toBe('found');
      expect(result.rating).toBe(4.2);
      expect(result.companyId).toBe(7777);
    });
  });

  describe('JobplanetService (캐싱 및 봇 차단 방지 요청 큐)', () => {
    let service: JobplanetService;

    beforeEach(() => {
      service = JobplanetService.getInstance();
      service.clearCache();
      vi.restoreAllMocks();
    });

    it('동일한 회사에 대해 두 번째 호출 시 네트워크 fetch 없이 메모리 캐시를 반환해야 한다', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '{"queryKey":["search","companyList"],"items":[{"company_id":123,"name":"(주)카카오엔터","rate_total_avg":3.4}]}'
          ),
      });
      global.fetch = mockFetch;

      const res1 = await service.getRating('카카오엔터');
      expect(res1.status).toBe('found');
      expect(res1.rating).toBe(3.4);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 두 번째 호출 (캐시 히트)
      const res2 = await service.getRating('카카오엔터');
      expect(res2.status).toBe('found');
      expect(res2.rating).toBe(3.4);
      expect(mockFetch).toHaveBeenCalledTimes(1); // 네트워크 요청이 추가로 발생하지 않아야 함
    });

    it('동일 회사에 대한 동시 비동기 요청(In-flight)은 단 하나의 네트워크 요청만 수행해야 한다', async () => {
      let resolvePromise: (value: any) => void;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      const mockFetch = vi.fn().mockReturnValue(
        delayedPromise.then(() => ({
          ok: true,
          text: () =>
            Promise.resolve(
              '{"queryKey":["search","companyList"],"items":[{"company_id":456,"name":"(주)토스","rate_total_avg":4.0}]}'
            ),
        }))
      );
      global.fetch = mockFetch;

      // 동시 호출 3회
      const p1 = service.getRating('토스');
      const p2 = service.getRating('토스');
      const p3 = service.getRating('토스');

      resolvePromise!({});

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      expect(r1.status).toBe('found');
      expect(r2.status).toBe('found');
      expect(r3.status).toBe('found');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('네트워크 요청 실패 시 status: error를 안전하게 반환하고 예외를 전파하지 않아야 한다', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error or WAF block'));

      const result = await service.getRating('네트워크오류기업');
      expect(result.status).toBe('error');
    });

    it('HTTP 403 / 429 등의 WAF 차단 응답 시 status: error를 반환해야 한다', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });

      const result = await service.getRating('차단기업');
      expect(result.status).toBe('error');
    });

    it('Next.js RSC 요청 헤더가 올바르게 주입되어야 한다', async () => {
      let capturedHeaders: any;
      global.fetch = vi.fn().mockImplementation((_url, options) => {
        capturedHeaders = options.headers;
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve('{"queryKey":["search","companyList"],"items":[]}'),
        });
      });

      await service.executeFetch('헤더검증기업');
      expect(capturedHeaders.RSC).toBe(JOBPLANET_CONFIG.HEADERS.RSC);
      expect(capturedHeaders.Accept).toBe(JOBPLANET_CONFIG.HEADERS.ACCEPT);
      expect(capturedHeaders['Accept-Language']).toBe(
        JOBPLANET_CONFIG.HEADERS.ACCEPT_LANGUAGE
      );
    });
  });
});
