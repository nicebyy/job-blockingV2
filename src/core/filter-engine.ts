import { BlockItem, FilterMode, FilterResult, FilterSettings, JobCardInfo, JobPlatform } from '../types';
import { normalizeCompanyName } from '../utils/text';
import { isJobExpired } from '../utils/date';
import { FILTER_CONFIG } from '../constants';

/**
 * 인덱스에 담긴 차단 항목과 그 원본 순서.
 *
 * `idx` 는 blockList 내 위치다. 여러 인덱스에서 동시에 매칭될 수 있으므로
 * (예: 같은 공고가 jobId 로도, 회사명+제목으로도 매칭됨) 최종적으로는
 * **blockList 순서상 가장 앞선 항목**을 채택해 기존 동작을 그대로 유지한다.
 */
interface IndexedItem {
  item: BlockItem;
  idx: number;
}

/**
 * 회사명 부분 일치(contains) 모드용 항목.
 * 정규화 결과를 미리 보관해 카드 판정마다 정규식을 재실행하지 않는다.
 */
interface ContainsEntry extends IndexedItem {
  norm: string;
}

/**
 * 키워드 항목. 공백 정규화 결과를 미리 보관한다.
 */
interface KeywordEntry extends IndexedItem {
  norm: string;
}

/**
 * 차단 목록 조회용 인덱스.
 *
 * 기존 구현은 카드 1건마다 차단 목록 전체를 순회하며 매 항목의 회사명을
 * `normalizeCompanyName()`(정규식 4개)으로 다시 계산했다. 5,000건 목록에서
 * 60카드 스캔 시 약 30만 회 정규화가 발생해 스크롤이 끊겼다.
 *
 * 이제 목록이 바뀔 때 한 번만 인덱스를 만들고, 판정은 Map/Set 조회(O(1))로 끝낸다.
 */
interface FilterIndex {
  /** 정규화된 회사명 -> 항목 (exact 모드). 같은 키는 가장 앞선 항목만 보관 */
  companyExact: Map<string, IndexedItem>;
  /** 정규화된 회사명 목록 (contains 모드). 부분 일치 검사가 필요하므로 배열 순회 */
  companyContains: ContainsEntry[];
  /** jobId 또는 복합키(company:::title) -> 항목들. 플랫폼별로 공존할 수 있어 배열 */
  jobByPattern: Map<string, IndexedItem[]>;
  /** 정규화회사명 + 구분자 + 소문자제목 -> 항목 (회사명+제목 동시 일치) */
  jobByTitleAndCompany: Map<string, IndexedItem>;
  /** 소문자제목 -> 항목 (회사명 없이 제목만 등록된 경우) */
  jobByTitleOnly: Map<string, IndexedItem>;
  /** 키워드 목록 (공백 정규화됨) */
  keywords: KeywordEntry[];
}

/** 회사명+제목 복합 키의 구분자 (일반 문자열과 충돌하지 않는 제어문자) */
const TITLE_COMPANY_SEPARATOR = '\u0000';

/** 복합키(company:::title) 판별용 구분자 */
const COMPOUND_PATTERN_SEPARATOR = ':::';

/**
 * 키워드 비교용 텍스트 정규화.
 *
 * 기존에는 키워드를 소문자화한 뒤 그대로 `includes` 비교해서,
 * 복사-붙여넣기로 공백이 중복된 키워드("백엔드  개발자")는
 * 정상 제목("백엔드 개발자")과 매칭되지 않는 미탐이 있었다.
 * 연속 공백(일반 공백·NBSP·전각 공백 포함)을 1칸으로 접는다.
 */
export function normalizeKeywordText(text: string): string {
  if (!text) return '';
  return text.replace(/[\s\u00A0\u3000]+/g, ' ').trim().toLowerCase();
}

/**
 * 공고 제목 비교용 정규화 (기존 동작 유지: 앞뒤 공백 제거 + 소문자화)
 */
function normalizeTitle(title: string): string {
  return (title || '').trim().toLowerCase();
}

export class FilterEngine {
  private blockList: BlockItem[] = [];
  private settings: FilterSettings;
  private index: FilterIndex;
  /**
   * 현재 페이지가 어느 채용 플랫폼인지.
   * jobId 는 사이트별로 번호 체계가 달라 플랫폼 간 값이 충돌할 수 있으므로
   * 매칭 시 플랫폼 일치 여부를 확인한다.
   */
  private currentPlatform: JobPlatform | null = null;

  constructor(
    settings: FilterSettings,
    blockList: BlockItem[] = [],
    currentPlatform: JobPlatform | null = null
  ) {
    this.settings = settings;
    this.blockList = blockList;
    this.currentPlatform = currentPlatform;
    this.index = this.buildIndex(blockList);
  }

  public updateSettings(settings: FilterSettings): void {
    this.settings = settings;
  }

  /**
   * 현재 페이지의 플랫폼을 갱신한다.
   * SPA 페이지 전환(목록 → 상세 등)이나 정렬 변경 시 호출해
   * jobId 플랫폼 격리가 올바르게 동작하도록 한다.
   */
  public updatePlatform(platform: JobPlatform | null): void {
    this.currentPlatform = platform;
  }

  public updateBlockList(blockList: BlockItem[]): void {
    this.blockList = blockList;
    this.index = this.buildIndex(blockList);
  }

  /**
   * 차단 목록으로부터 조회 인덱스를 생성한다.
   *
   * 만료된 공고(type: 'job' 이고 expiresAt 이 지난 항목)는 인덱스에서 제외한다.
   * 기존에는 만료 항목도 계속 매칭에 참여해, 정리(purge) 전까지 매번 순회 비용을
   * 차지하고 동일 공고를 불필요하게 계속 막았다.
   */
  private buildIndex(list: BlockItem[]): FilterIndex {
    const companyExact = new Map<string, IndexedItem>();
    const companyContains: ContainsEntry[] = [];
    const jobByPattern = new Map<string, IndexedItem[]>();
    const jobByTitleAndCompany = new Map<string, IndexedItem>();
    const jobByTitleOnly = new Map<string, IndexedItem>();
    const keywords: KeywordEntry[] = [];

    const now = Date.now();

    list.forEach((item, idx) => {
      // [개선] 만료된 공고 차단 항목은 인덱스에서 제외
      if (isJobExpired(item, now)) {
        return;
      }

      const indexed: IndexedItem = { item, idx };
      const rawPattern = (item.pattern || '').trim();
      if (!rawPattern) return;

      if (item.type === 'company') {
        const norm = this.normalizeCompanyName(item.pattern);
        if (!norm) return;

        // 같은 정규화 키는 가장 앞선 항목을 유지 (blockList 순서 보존)
        if (!companyExact.has(norm)) {
          companyExact.set(norm, indexed);
        }
        companyContains.push({ ...indexed, norm });
        return;
      }

      if (item.type === 'job') {
        const existing = jobByPattern.get(item.pattern);
        if (existing) {
          existing.push(indexed);
        } else {
          jobByPattern.set(item.pattern, [indexed]);
        }

        if (item.title) {
          const titleLower = normalizeTitle(item.title);
          if (item.companyName) {
            const key =
              this.normalizeCompanyName(item.companyName) + TITLE_COMPANY_SEPARATOR + titleLower;
            if (!jobByTitleAndCompany.has(key)) {
              jobByTitleAndCompany.set(key, indexed);
            }
          } else if (!jobByTitleOnly.has(titleLower)) {
            jobByTitleOnly.set(titleLower, indexed);
          }
        }
        return;
      }

      if (item.type === 'keyword') {
        const norm = normalizeKeywordText(item.pattern);
        if (!norm) return;
        keywords.push({ ...indexed, norm });
      }
    });

    return {
      companyExact,
      companyContains,
      jobByPattern,
      jobByTitleAndCompany,
      jobByTitleOnly,
      keywords,
    };
  }

  /**
   * jobId 차단 항목이 현재 페이지 플랫폼에 적용 가능한지 판단한다.
   *
   * - 차단 항목에 platform 이 없거나 'custom'(직접 등록)이면 모든 사이트에 적용
   * - 현재 페이지 플랫폼을 모르면(테스트/미지원 사이트) 적용
   * - 그 외에는 플랫폼이 일치할 때만 적용
   */
  private isJobPlatformCompatible(item: BlockItem): boolean {
    const itemPlatform = item.platform;
    if (!itemPlatform || itemPlatform === 'custom') return true;

    const pagePlatform = this.currentPlatform;
    if (!pagePlatform || pagePlatform === 'custom') return true;

    return itemPlatform === pagePlatform;
  }

  /**
   * 후보 중 blockList 순서상 가장 앞선 항목을 고른다.
   */
  private pickEarliest(candidates: (IndexedItem | undefined | null)[]): IndexedItem | null {
    let best: IndexedItem | null = null;
    for (const cand of candidates) {
      if (!cand) continue;
      if (!best || cand.idx < best.idx) {
        best = cand;
      }
    }
    return best;
  }

  public addBlockItem(item: BlockItem): void {
    const existingIndex = this.blockList.findIndex((b) => {
      if (b.type !== item.type) return false;
      if (b.pattern.toLowerCase() === item.pattern.toLowerCase()) return true;

      // 1. 회사(company) 타입: 정규화된 상호명이 일치하는 경우 중복 방지
      if (item.type === 'company') {
        const normItem = this.normalizeCompanyName(item.pattern);
        const normB = this.normalizeCompanyName(b.pattern);
        if (normItem.length > 0 && normItem === normB) return true;
      }

      // 2. 공고(job) 타입: 회사명과 공고 제목이 동일한 경우 중복 방지
      if (
        item.type === 'job' &&
        b.companyName &&
        b.title &&
        item.companyName &&
        item.title &&
        this.normalizeCompanyName(b.companyName) === this.normalizeCompanyName(item.companyName) &&
        b.title.trim().toLowerCase() === item.title.trim().toLowerCase()
      ) {
        return true;
      }

      return false;
    });

    if (existingIndex !== -1) {
      const existing = this.blockList[existingIndex];
      // 기존 패턴에 (주)/주식회사 등이 있고 새 패턴이 더 간결한 경우 간결한 패턴으로 개선
      if (item.type === 'company') {
        const existingHasAffix = /[㈜(주)주식회사]/.test(existing.pattern);
        const newHasAffix = /[㈜(주)주식회사]/.test(item.pattern);
        if (existingHasAffix && !newHasAffix) {
          existing.pattern = item.pattern;
        }
      }
      // 기존 패턴이 복합키이고 새 패턴이 고유 jobId인 경우 업그레이드
      if (
        item.type === 'job' &&
        item.pattern &&
        !item.pattern.includes(COMPOUND_PATTERN_SEPARATOR) &&
        existing.pattern.includes(COMPOUND_PATTERN_SEPARATOR)
      ) {
        existing.pattern = item.pattern;
      }
      // 항목이 갱신되었을 수 있으므로 인덱스를 다시 만든다
      this.index = this.buildIndex(this.blockList);
      return;
    }

    this.blockList.push(item);
    this.index = this.buildIndex(this.blockList);
  }

  /**
   * 회사명 문자열 정규화 (괄호, 주식회사, 공백 제거 등)
   */
  public normalizeCompanyName(name: string): string {
    return normalizeCompanyName(name);
  }

  /**
   * 단일 공고가 필터링 대상인지 판정
   */
  public evaluateJobCard(cardInfo: JobCardInfo): FilterResult {
    // 1. 광고 공고 필터링 체크
    if (this.settings.hideAds && cardInfo.isAd) {
      return {
        shouldFilter: true,
        isAdFilter: true,
        reason: '추천/스폰서 광고 공고 숨김',
      };
    }

    const normalizedCompany = this.normalizeCompanyName(cardInfo.companyName);
    const titleLower = normalizeTitle(cardInfo.title);
    const index = this.index;

    // 2. 공고(job) 매칭 — jobId / 복합키 / 회사명+제목 / 제목 단독
    const jobCandidates: (IndexedItem | undefined)[] = [];

    if (cardInfo.jobId) {
      const byId = index.jobByPattern.get(cardInfo.jobId);
      if (byId) {
        // [개선] 플랫폼이 다른 사이트의 동일 jobId 로 인한 오차단 방지
        for (const entry of byId) {
          if (this.isJobPlatformCompatible(entry.item)) {
            jobCandidates.push(entry);
            break;
          }
        }
      }

      // 복합키(company:::title)도 같은 Map 을 사용한다
      const compoundKey = `${cardInfo.companyName}${COMPOUND_PATTERN_SEPARATOR}${cardInfo.title}`;
      const byCompound = index.jobByPattern.get(compoundKey);
      if (byCompound) {
        jobCandidates.push(byCompound[0]);
      }
    }

    if (index.jobByTitleAndCompany.size > 0 && normalizedCompany && titleLower) {
      const key = normalizedCompany + TITLE_COMPANY_SEPARATOR + titleLower;
      const hit = index.jobByTitleAndCompany.get(key);
      if (hit) jobCandidates.push(hit);
    }

    if (index.jobByTitleOnly.size > 0 && titleLower) {
      const hit = index.jobByTitleOnly.get(titleLower);
      if (hit) jobCandidates.push(hit);
    }

    const jobMatch = this.pickEarliest(jobCandidates);
    if (jobMatch) {
      return {
        shouldFilter: true,
        matchedItem: jobMatch.item,
        isAdFilter: false,
        reason: `숨긴 공고: ${jobMatch.item.title || cardInfo.title}`,
      };
    }

    // 3. 회사(company) 매칭
    let companyMatch: IndexedItem | null = null;
    if (normalizedCompany) {
      const exact = index.companyExact.get(normalizedCompany);
      if (exact) {
        companyMatch = exact;
      } else if (this.settings.companyMatchMode === 'contains' && index.companyContains.length > 0) {
        // contains 모드는 부분 문자열 검사가 필요하므로 정규화 결과를 재사용해 순회
        const candidates: IndexedItem[] = [];
        for (const entry of index.companyContains) {
          if (entry.norm && normalizedCompany.includes(entry.norm)) {
            candidates.push(entry);
          }
        }
        companyMatch = this.pickEarliest(candidates);
      }
    }

    // 4. 키워드(keyword) 매칭 — [개선] 제목뿐 아니라 회사명에도 적용
    const keywordCandidates: IndexedItem[] = [];
    if (index.keywords.length > 0) {
      const normCompany = normalizeKeywordText(cardInfo.companyName);
      const normTitle = normalizeKeywordText(cardInfo.title);
      for (const entry of index.keywords) {
        if (
          (normCompany && normCompany.includes(entry.norm)) ||
          (normTitle && normTitle.includes(entry.norm))
        ) {
          keywordCandidates.push(entry);
        }
      }
    }
    const keywordMatch = this.pickEarliest(keywordCandidates);

    // 5. 여러 유형이 동시에 매칭되면 blockList 순서가 앞선 쪽을 채택 (기존 동작 보존)
    const bestNonJob = this.pickEarliest([companyMatch, keywordMatch]);
    if (bestNonJob) {
      const item = bestNonJob.item;
      return {
        shouldFilter: true,
        matchedItem: item,
        isAdFilter: false,
        reason:
          item.type === 'keyword'
            ? `차단 키워드 포함: ${item.pattern}`
            : `차단된 회사: ${item.pattern}`,
      };
    }

    return {
      shouldFilter: false,
      isAdFilter: false,
    };
  }

  /**
   * DOM 카드 요소에 필터 스타일 적용 (blur 또는 hide)
   *
   * 블러 강도는 설정값이 아니라 FILTER_CONFIG.DEFAULT_BLUR_INTENSITY 상수를 사용한다.
   * (blurIntensity 는 UI 에 노출된 적이 없어 죽은 설정이었고 타입에서 제거되었다)
   */
  public applyFilter(
    cardElement: HTMLElement,
    mode: FilterMode = this.settings.mode,
    intensity: number = FILTER_CONFIG.DEFAULT_BLUR_INTENSITY
  ): void {
    cardElement.setAttribute('data-job-filtered', 'true');
    cardElement.setAttribute('data-filter-mode', mode);

    if (mode === 'hide') {
      cardElement.style.display = 'none';
      cardElement.style.filter = '';
    } else {
      cardElement.style.display = '';
      cardElement.style.filter = `blur(${intensity}px)`;
      cardElement.style.transition = 'filter 0.2s ease, opacity 0.2s ease';
      cardElement.style.opacity = '0.5';
    }
  }

  /**
   * DOM 카드 요소의 필터 스타일 해제
   */
  public removeFilter(cardElement: HTMLElement): void {
    cardElement.removeAttribute('data-job-filtered');
    cardElement.removeAttribute('data-filter-mode');
    cardElement.style.display = '';
    cardElement.style.filter = '';
    cardElement.style.opacity = '';
  }
}
