import { JOBPLANET_CONFIG } from '../constants';
import { JobplanetRatingInfo } from '../types';

/**
 * 잡플래닛에서 반환하는 검색 결과 기업 항목 인터페이스
 */
export interface JobplanetCompanyItem {
  company_id: number;
  name: string;
  rate_total_avg: number;
  city_name?: string;
  industry_name?: string;
}

/**
 * 검색용 회사명 정규화 (법적 표기 및 불필요한 부가정보 제거)
 */
export function normalizeCompanyNameForSearch(rawName: string): string {
  if (!rawName) return '';

  let cleaned = rawName
    // (주), 주식회사, (유), 유한회사, (합), 합자회사, (사), (재) 등 법적 표기 제거
    .replace(/\((주|유|합|사|재)\)/gi, '')
    .replace(/(주식회사|유한회사|합자회사|합명회사|사단법인|재단법인)/gi, '')
    // 영문 기업 형태 표기 제거
    .replace(/\b(inc|incorporated|ltd|limited|co|corp|corporation|llc)\b\.?/gi, '')
    // 대괄호/괄호 안의 부가 정보 제거 (예: [본사], (판교), [채용대행])
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    // 특수문자 및 연속 공백 정리
    .replace(/[/\\_,\-\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || rawName.trim();
}

/**
 * 동명 회사 판별 및 매칭 비교를 위한 엄격 정규화
 * (모든 공백, 특수문자 제거 및 소문자 통일)
 */
export function normalizeCompanyNameForCompare(name: string): string {
  if (!name) return '';

  return normalizeCompanyNameForSearch(name)
    .replace(/[^a-zA-Z0-9가-힣]/g, '')
    .toLowerCase();
}

/**
 * 잡플래닛 Next.js RSC (React Server Component) 스트림 텍스트 파싱
 * 
 * 1. search companyList 결과 items 추출
 * 2. 대상 기업명과 정규화 비교
 * 3. 0개 일치: status = 'not_found'
 * 4. 2개 이상 일치: status = 'ambiguous' (동명 회사 배제 규칙)
 * 5. 1개 일치: status = 'found' 및 평점 반환
 */
export function parseJobplanetRsc(
  rscText: string,
  targetCompanyName: string
): JobplanetRatingInfo {
  const normalizedTarget = normalizeCompanyNameForCompare(targetCompanyName);
  const now = Date.now();

  if (!normalizedTarget || !rscText) {
    return {
      platform: 'jobplanet',
      status: 'not_found',
      companyName: targetCompanyName,
      cachedAt: now,
    };
  }

  const items = extractCompanyItemsFromRsc(rscText);

  // 대상 기업명과 일치하는 기업 필터링
  const matchingCompanies = items.filter((item) => {
    const itemNorm = normalizeCompanyNameForCompare(item.name);
    return itemNorm === normalizedTarget;
  });

  // 1. 일치하는 회사가 없을 경우 -> 배치하지 않음
  if (matchingCompanies.length === 0) {
    return {
      platform: 'jobplanet',
      status: 'not_found',
      companyName: targetCompanyName,
      cachedAt: now,
    };
  }

  // 2. 동명의 회사가 여러 개일 경우 -> 배치하지 않음 (사용자 요구사항)
  if (matchingCompanies.length > 1) {
    return {
      platform: 'jobplanet',
      status: 'ambiguous',
      companyName: targetCompanyName,
      cachedAt: now,
    };
  }

  // 3. 정확히 1개의 회사만 존재하는 경우 -> 평점 검증 후 배치
  const matched = matchingCompanies[0];
  const ratingNum =
    typeof matched.rate_total_avg === 'number'
      ? matched.rate_total_avg
      : parseFloat(String(matched.rate_total_avg));

  if (isNaN(ratingNum) || ratingNum <= 0) {
    return {
      platform: 'jobplanet',
      status: 'not_found',
      companyName: targetCompanyName,
      cachedAt: now,
    };
  }

  const roundedRating = Math.round(ratingNum * 10) / 10;
  return {
    platform: 'jobplanet',
    status: 'found',
    companyName: targetCompanyName,
    rating: roundedRating,
    companyId: matched.company_id,
    companyUrl: `${JOBPLANET_CONFIG.COMPANY_BASE_URL}/${matched.company_id}`,
    cachedAt: now,
  };
}

/**
 * RSC 텍스트에서 검색 결과 companyList 아이템 목록 추출
 */
export function extractCompanyItemsFromRsc(rscText: string): JobplanetCompanyItem[] {
  // 1. React Query dehydrate 구조 기반 검색 결과 우선 탐색
  const targetKey = '["search","companyList"';
  const qkIdx = rscText.indexOf(targetKey);

  if (qkIdx !== -1) {
    const before = rscText.slice(0, qkIdx);
    const pagesIdx = before.lastIndexOf('"pages":[');
    if (pagesIdx !== -1) {
      const jsonStart = before.slice(pagesIdx + 8);
      let depth = 0;
      let end = 0;
      for (let i = 0; i < jsonStart.length; i++) {
        if (jsonStart[i] === '[') depth++;
        else if (jsonStart[i] === ']') {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }

      if (end > 0) {
        try {
          const pages = JSON.parse(jsonStart.slice(0, end));
          const searchItems = pages[0]?.items;
          if (Array.isArray(searchItems)) {
            return searchItems.map((item: any) => ({
              company_id: Number(item.company_id),
              name: String(item.name || ''),
              rate_total_avg: Number(item.rate_total_avg || 0),
              city_name: item.city_name,
              industry_name: item.industry_name,
            }));
          }
        } catch {
          // JSON 파싱 실패 시 정규식 기반 폴백
        }
      }
    }
  }

  // 2. 폴백: JSON 정규식 파싱
  const regex = /\{"company_id":(\d+),"name":"([^"]+)"[^}]*?"rate_total_avg":([0-9.]+)/g;
  const items: JobplanetCompanyItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rscText)) !== null) {
    items.push({
      company_id: Number(match[1]),
      name: match[2],
      rate_total_avg: Number(match[3]),
    });
  }

  return items;
}

/**
 * 잡플래닛 평점 서비스 싱글톤
 * - 백그라운드 서비스 워커에서 동작
 * - 메모리 캐시 및 chrome.storage.local 영구 캐시
 * - 동시성 제어 및 요청 순차 큐(Rate-limiting / Throttling)로 봇 탐지 우회
 */
export class JobplanetService {
  private static instance: JobplanetService | null = null;
  private memoryCache = new Map<string, JobplanetRatingInfo>();
  private inFlightRequests = new Map<string, Promise<JobplanetRatingInfo>>();
  private queue: (() => Promise<void>)[] = [];
  private isProcessingQueue = false;

  public static getInstance(): JobplanetService {
    if (!JobplanetService.instance) {
      JobplanetService.instance = new JobplanetService();
    }
    return JobplanetService.instance;
  }

  /**
   * 회사명에 대한 잡플래닛 평점 조회
   */
  public async getRating(companyName: string): Promise<JobplanetRatingInfo> {
    const trimmed = companyName.trim();
    if (!trimmed) {
      return {
        platform: 'jobplanet',
        status: 'not_found',
        companyName,
        cachedAt: Date.now(),
      };
    }

    const normKey = normalizeCompanyNameForCompare(trimmed);
    const storageKey = `${JOBPLANET_CONFIG.CACHE_KEY_PREFIX}${normKey}`;

    // 1. 메모리 캐시 확인
    const memoryHit = this.memoryCache.get(normKey);
    if (memoryHit && !this.isCacheExpired(memoryHit)) {
      return memoryHit;
    }

    // 2. chrome.storage.local 영구 캐시 확인
    const storageHit = await this.getFromStorage(storageKey);
    if (storageHit && !this.isCacheExpired(storageHit)) {
      this.memoryCache.set(normKey, storageHit);
      return storageHit;
    }

    // 3. 동일 회사명 동시 요청 중복 제거(In-flight deduplication)
    if (this.inFlightRequests.has(normKey)) {
      return this.inFlightRequests.get(normKey)!;
    }

    // 4. 네트워크 요청 큐 등록
    const fetchPromise = this.enqueueFetch(trimmed, normKey, storageKey);
    this.inFlightRequests.set(normKey, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      this.inFlightRequests.delete(normKey);
    }
  }

  private isCacheExpired(info: JobplanetRatingInfo): boolean {
    const ttl =
      info.status === 'found'
        ? JOBPLANET_CONFIG.CACHE_TTL_MS
        : JOBPLANET_CONFIG.NEGATIVE_CACHE_TTL_MS;
    return Date.now() - info.cachedAt > ttl;
  }

  private async getFromStorage(key: string): Promise<JobplanetRatingInfo | null> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return null;
    }
    try {
      const data = await chrome.storage.local.get(key);
      return (data[key] as JobplanetRatingInfo) || null;
    } catch {
      return null;
    }
  }

  private async saveToStorage(key: string, info: JobplanetRatingInfo): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return;
    }
    try {
      await chrome.storage.local.set({ [key]: info });
    } catch {
      // 스토리지 저장 에러 무시
    }
  }

  /**
   * 봇 차단 방지 순차 호출 큐(Throttling)
   */
  private enqueueFetch(
    companyName: string,
    normKey: string,
    storageKey: string
  ): Promise<JobplanetRatingInfo> {
    return new Promise((resolve) => {
      this.queue.push(async () => {
        try {
          const result = await this.executeFetch(companyName);
          this.memoryCache.set(normKey, result);
          await this.saveToStorage(storageKey, result);
          resolve(result);
        } catch (err) {
          const fallback: JobplanetRatingInfo = {
            platform: 'jobplanet',
            status: 'error',
            companyName,
            cachedAt: Date.now(),
          };
          this.memoryCache.set(normKey, fallback);
          resolve(fallback);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        await task();
        // 봇 탐지 우회를 위한 지연 시간 보장
        await new Promise((res) => setTimeout(res, JOBPLANET_CONFIG.REQUEST_DELAY_MS));
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * 잡플래닛 RSC 스트림 실제 네트워크 요청
   */
  public async executeFetch(companyName: string): Promise<JobplanetRatingInfo> {
    const searchQuery = normalizeCompanyNameForSearch(companyName);
    const url = `${JOBPLANET_CONFIG.SEARCH_API_ENDPOINT}?query=${encodeURIComponent(searchQuery)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), JOBPLANET_CONFIG.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          RSC: JOBPLANET_CONFIG.HEADERS.RSC,
          Accept: JOBPLANET_CONFIG.HEADERS.ACCEPT,
          'Accept-Language': JOBPLANET_CONFIG.HEADERS.ACCEPT_LANGUAGE,
        },
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          platform: 'jobplanet',
          status: 'error',
          companyName,
          cachedAt: Date.now(),
        };
      }

      const rscText = await response.text();
      return parseJobplanetRsc(rscText, companyName);
    } catch (err) {
      clearTimeout(timeoutId);
      return {
        platform: 'jobplanet',
        status: 'error',
        companyName,
        cachedAt: Date.now(),
      };
    }
  }

  /**
   * 테스트를 위한 캐시 초기화 메서드
   */
  public clearCache(): void {
    this.memoryCache.clear();
    this.inFlightRequests.clear();
    this.queue = [];
  }
}
