import { BlockItem, FilterMode, FilterResult, FilterSettings, JobCardInfo } from '../types';

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

  /**
   * 회사명 문자열 정규화 (괄호, 주식회사, 공백 제거 등)
   */
  public normalizeCompanyName(name: string): string {
    return name
      .replace(/\(주\)|주식회사|\(유\)|유한회사/g, '')
      .replace(/[\s\-_.,()[\]]/g, '')
      .toLowerCase()
      .trim();
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
          (normalizedCompany.includes(normalizedPattern) || normalizedPattern.includes(normalizedCompany))
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
