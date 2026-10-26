import { BLIND_CONFIG } from '../constants';
import { BlindRatingInfo } from '../types';
import {
  normalizeCompanyNameForSearch,
  normalizeCompanyNameForCompare,
} from './jobplanet';

/**
 * 블라인드 검색 결과 및 회사 상세 페이지에서 추출한 기업 정보
 */
export interface BlindCompanyItem {
  name: string;
  slug: string;
  rating: number;
  reviewCount?: number;
}

/**
 * 블라인드 회사 상세 페이지의 SSR JSON-LD 파싱
 * 예: {"@context":"http://schema.org","@type":"EmployerAggregateRating","ratingValue":"3.5","ratingCount":3119,"itemReviewed":{"@type":"Organization","name":"카카오"}}
 */
export function parseBlindCompanyPage(
  html: string,
  targetCompanyName: string
): BlindRatingInfo {
  const normalizedTarget = normalizeCompanyNameForCompare(targetCompanyName);
  const now = Date.now();

  if (!html || !normalizedTarget) {
    return {
      platform: 'blind',
      status: 'not_found',
      companyName: targetCompanyName,
      cachedAt: now,
    };
  }

  const jsonLdRegex =
    /"@type"\s*:\s*"EmployerAggregateRating"[\s\S]*?"ratingValue"\s*:\s*"?([\d.]+)"?[\s\S]*?(?:"ratingCount"\s*:\s*(\d+)[\s\S]*?)?"itemReviewed"\s*:\s*\{[\s\S]*?"name"\s*:\s*"([^"]+)"/i;
  const match = jsonLdRegex.exec(html);

  if (!match) {
    return {
      platform: 'blind',
      status: 'not_found',
      companyName: targetCompanyName,
      cachedAt: now,
    };
  }

  const ratingVal = parseFloat(match[1]);
  const reviewCount = match[2] ? parseInt(match[2], 10) : undefined;
  const matchedName = match[3];

  if (isNaN(ratingVal) || ratingVal <= 0) {
    return {
      platform: 'blind',
      status: 'not_found',
      companyName: targetCompanyName,
      cachedAt: now,
    };
  }

  // 매칭된 이름 검증
  const normalizedMatched = normalizeCompanyNameForCompare(matchedName);
  if (normalizedMatched !== normalizedTarget) {
    return {
      platform: 'blind',
      status: 'not_found',
      companyName: targetCompanyName,
      cachedAt: now,
    };
  }

  return {
    platform: 'blind',
    status: 'found',
    companyName: targetCompanyName,
    rating: Math.round(ratingVal * 10) / 10,
    reviewCount,
    companyUrl: `${BLIND_CONFIG.COMPANY_BASE_URL}/${encodeURIComponent(matchedName)}`,
    cachedAt: now,
  };
}

/**
 * 블라인드 통합 검색 결과 페이지 파싱
 * 예: /kr/search/{keyword} HTML에서 회사 카드 영역 추출
 */
export function parseBlindSearchResult(
  html: string,
  targetCompanyName: string
): BlindRatingInfo {
  const normalizedTarget = normalizeCompanyNameForCompare(targetCompanyName);
  const now = Date.now();

  if (!html || !normalizedTarget) {
    return {
      platform: 'blind',
      status: 'not_found',
      companyName: targetCompanyName,
      cachedAt: now,
    };
  }

  // 검색 결과 내 회사 카드 블록 탐색
  // <a href="/kr/company/{slug}/" class="name">...</a> 및 <span class="star"><i class="blind">Rating Score</i>3.8</span>
  const companyCardRegex =
    /<div[^>]*class="[^"]*w_company[^"]*"[\s\S]*?<a[^>]*href="\/kr\/company\/([^"\/]+)\/?"[^>]*class="name"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<span[^>]*class="star"[^>]*>[\s\S]*?([1-5](?:\.\d)?)<\/span>/gi;

  const foundItems: BlindCompanyItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = companyCardRegex.exec(html)) !== null) {
    const rawSlug = match[1];
    const rawName = match[2].replace(/<[^>]*>/g, '').trim();
    const rawScore = parseFloat(match[3]);

    if (rawName && !isNaN(rawScore)) {
      foundItems.push({
        slug: decodeURIComponent(rawSlug),
        name: rawName,
        rating: rawScore,
      });
    }
  }

  // 대상 기업명과 일치하는 항목 필터링
  const matchingCompanies = foundItems.filter((item) => {
    const normName = normalizeCompanyNameForCompare(item.name);
    const normSlug = normalizeCompanyNameForCompare(item.slug);
    return normName === normalizedTarget || normSlug === normalizedTarget;
  });

  // 1. 일치하는 회사가 없을 경우 -> 배치하지 않음
  if (matchingCompanies.length === 0) {
    return {
      platform: 'blind',
      status: 'not_found',
      companyName: targetCompanyName,
      cachedAt: now,
    };
  }

  // 2. 동명의 회사가 여러 개일 경우 -> 배치하지 않음 (사용자 요구사항)
  if (matchingCompanies.length > 1) {
    return {
      platform: 'blind',
      status: 'ambiguous',
      companyName: targetCompanyName,
      cachedAt: now,
    };
  }

  // 3. 단일 기업 존재 시
  const best = matchingCompanies[0];
  if (best.rating <= 0) {
    return {
      platform: 'blind',
      status: 'not_found',
      companyName: targetCompanyName,
      cachedAt: now,
    };
  }

  return {
    platform: 'blind',
    status: 'found',
    companyName: targetCompanyName,
    rating: Math.round(best.rating * 10) / 10,
    companyUrl: `${BLIND_CONFIG.COMPANY_BASE_URL}/${encodeURIComponent(best.slug)}`,
    cachedAt: now,
  };
}

/**
 * 팀블라인드 평점 서비스 싱글톤
 * - 백그라운드 서비스 워커에서 동작
 * - 메모리 캐시 및 chrome.storage.local 영구 캐시
 * - 순차 스로틀링 큐(300ms) 및 In-flight 중복 요청 제거
 */
export class BlindService {
  private static instance: BlindService | null = null;
  private memoryCache = new Map<string, BlindRatingInfo>();
  private inFlightRequests = new Map<string, Promise<BlindRatingInfo>>();
  private queue: (() => Promise<void>)[] = [];
  private isProcessingQueue = false;

  public static getInstance(): BlindService {
    if (!BlindService.instance) {
      BlindService.instance = new BlindService();
    }
    return BlindService.instance;
  }

  public async getRating(companyName: string): Promise<BlindRatingInfo> {
    const trimmed = companyName.trim();
    if (!trimmed) {
      return {
        platform: 'blind',
        status: 'not_found',
        companyName,
        cachedAt: Date.now(),
      };
    }

    const normKey = normalizeCompanyNameForCompare(trimmed);
    const storageKey = `${BLIND_CONFIG.CACHE_KEY_PREFIX}${normKey}`;

    // 1. 메모리 캐시
    const memoryHit = this.memoryCache.get(normKey);
    if (memoryHit && !this.isCacheExpired(memoryHit)) {
      return memoryHit;
    }

    // 2. 영구 스토리지 캐시
    const storageHit = await this.getFromStorage(storageKey);
    if (storageHit && !this.isCacheExpired(storageHit)) {
      this.memoryCache.set(normKey, storageHit);
      return storageHit;
    }

    // 3. In-flight 중복 제거
    if (this.inFlightRequests.has(normKey)) {
      return this.inFlightRequests.get(normKey)!;
    }

    // 4. 큐 등록
    const fetchPromise = this.enqueueFetch(trimmed, normKey, storageKey);
    this.inFlightRequests.set(normKey, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      this.inFlightRequests.delete(normKey);
    }
  }

  private isCacheExpired(info: BlindRatingInfo): boolean {
    const ttl =
      info.status === 'found'
        ? BLIND_CONFIG.CACHE_TTL_MS
        : BLIND_CONFIG.NEGATIVE_CACHE_TTL_MS;
    return Date.now() - info.cachedAt > ttl;
  }

  private async getFromStorage(key: string): Promise<BlindRatingInfo | null> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return null;
    }
    try {
      const data = await chrome.storage.local.get(key);
      return (data[key] as BlindRatingInfo) || null;
    } catch {
      return null;
    }
  }

  private async saveToStorage(key: string, info: BlindRatingInfo): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return;
    }
    try {
      await chrome.storage.local.set({ [key]: info });
    } catch {
      // 스토리지 에러 무시
    }
  }

  private enqueueFetch(
    companyName: string,
    normKey: string,
    storageKey: string
  ): Promise<BlindRatingInfo> {
    return new Promise((resolve) => {
      this.queue.push(async () => {
        try {
          const result = await this.executeFetch(companyName);
          this.memoryCache.set(normKey, result);
          await this.saveToStorage(storageKey, result);
          resolve(result);
        } catch {
          const fallback: BlindRatingInfo = {
            platform: 'blind',
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
        await new Promise((res) => setTimeout(res, BLIND_CONFIG.REQUEST_DELAY_MS));
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * 블라인드 실제 네트워크 조회
   * 1. 회사 직접 상세 페이지(/kr/company/{name}) 조회 시도
   * 2. 404 또는 미존재 시 검색 페이지(/kr/search/{name}) 조회
   */
  public async executeFetch(companyName: string): Promise<BlindRatingInfo> {
    const searchQuery = normalizeCompanyNameForSearch(companyName);

    // 1단계: /kr/company/{searchQuery} 직접 조회 시도
    const directUrl = `${BLIND_CONFIG.COMPANY_BASE_URL}/${encodeURIComponent(searchQuery)}`;
    try {
      const directRes = await fetch(directUrl, {
        method: 'GET',
        headers: BLIND_CONFIG.HEADERS,
        signal: AbortSignal.timeout(BLIND_CONFIG.REQUEST_TIMEOUT_MS),
      });

      if (directRes.ok) {
        const html = await directRes.text();
        const parsed = parseBlindCompanyPage(html, companyName);
        if (parsed.status === 'found') {
          return parsed;
        }
      }
    } catch {
      // 직접 조회 실패 시 검색 페이지 폴백으로 진행
    }

    // 2단계: /kr/search/{searchQuery} 검색 조회
    const searchUrl = `${BLIND_CONFIG.SEARCH_URL}/${encodeURIComponent(searchQuery)}`;
    try {
      const searchRes = await fetch(searchUrl, {
        method: 'GET',
        headers: BLIND_CONFIG.HEADERS,
        signal: AbortSignal.timeout(BLIND_CONFIG.REQUEST_TIMEOUT_MS),
      });

      if (!searchRes.ok) {
        return {
          platform: 'blind',
          status: searchRes.status === 404 ? 'not_found' : 'error',
          companyName,
          cachedAt: Date.now(),
        };
      }

      const searchHtml = await searchRes.text();
      return parseBlindSearchResult(searchHtml, companyName);
    } catch {
      return {
        platform: 'blind',
        status: 'error',
        companyName,
        cachedAt: Date.now(),
      };
    }
  }

  public clearCache(): void {
    this.memoryCache.clear();
    this.inFlightRequests.clear();
    this.queue = [];
  }
}
