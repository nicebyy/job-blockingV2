import { BlockItem, FilterMode, FilterResult, FilterSettings, JobCardInfo } from '../types';
import { normalizeCompanyName } from '../utils/text';

export class FilterEngine {
  private blockList: BlockItem[] = [];
  private settings: FilterSettings;

  constructor(settings: FilterSettings, blockList: BlockItem[] = []) {
    this.settings = settings;
    this.blockList = blockList;
  }

  public updateSettings(settings: FilterSettings): void {
    this.settings = settings;
  }

  public updateBlockList(blockList: BlockItem[]): void {
    this.blockList = blockList;
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
      if (item.type === 'job' && item.pattern && !item.pattern.includes(':::') && existing.pattern.includes(':::')) {
        existing.pattern = item.pattern;
      }
      return;
    }

    this.blockList.push(item);
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
    const normalizedTitle = cardInfo.title.toLowerCase();

    // 2. 차단 목록 매칭 체크
    for (const item of this.blockList) {
      if (item.type === 'job') {
        const isJobIdMatch = Boolean(cardInfo.jobId && item.pattern === cardInfo.jobId);
        const isCompoundMatch = Boolean(item.pattern === `${cardInfo.companyName}:::${cardInfo.title}`);
        const isTitleAndCompanyMatch = Boolean(
          item.title &&
          item.companyName &&
          item.title.trim().toLowerCase() === cardInfo.title.trim().toLowerCase() &&
          this.normalizeCompanyName(item.companyName) === normalizedCompany
        );
        const isTitleOnlyMatch = Boolean(
          !item.companyName &&
          item.title &&
          item.title.trim().toLowerCase() === cardInfo.title.trim().toLowerCase()
        );

        if (isJobIdMatch || isCompoundMatch || isTitleAndCompanyMatch || isTitleOnlyMatch) {
          return {
            shouldFilter: true,
            matchedItem: item,
            isAdFilter: false,
            reason: `숨긴 공고: ${item.title || cardInfo.title}`,
          };
        }
      } else if (item.type === 'company') {
        const normalizedPattern = this.normalizeCompanyName(item.pattern);
        if (
          normalizedCompany.length > 0 &&
          normalizedPattern.length > 0 &&
          (normalizedCompany === normalizedPattern || normalizedCompany.includes(normalizedPattern))
        ) {
          return {
            shouldFilter: true,
            matchedItem: item,
            isAdFilter: false,
            reason: `차단된 회사: ${item.pattern}`,
          };
        }
      } else if (item.type === 'keyword') {
        const keyword = item.pattern.toLowerCase().trim();
        if (keyword.length > 0 && normalizedTitle.includes(keyword)) {
          return {
            shouldFilter: true,
            matchedItem: item,
            isAdFilter: false,
            reason: `차단 키워드 포함: ${item.pattern}`,
          };
        }
      }
    }

    return {
      shouldFilter: false,
      isAdFilter: false,
    };
  }

  /**
   * DOM 카드 요소에 필터 스타일 적용 (blur 또는 hide)
   */
  public applyFilter(
    cardElement: HTMLElement,
    mode: FilterMode = this.settings.mode,
    intensity: number = this.settings.blurIntensity
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
