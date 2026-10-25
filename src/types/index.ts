/**
 * 필터 처리 방식: 블러 처리 또는 완전 숨김
 */
export type FilterMode = 'blur' | 'hide';

/**
 * 차단 대상 유형: 회사, 키워드, 단일 공고
 */
export type BlockType = 'company' | 'keyword' | 'job';

/**
 * 차단 항목 인터페이스
 */
export interface BlockItem {
  id: string;
  pattern: string; // 회사명, 키워드 또는 jobId
  type: BlockType;
  createdAt: number;
  memo?: string;
  title?: string; // 공고 단위 차단 시 제목
  companyName?: string; // 공고 단위 차단 시 회사명
}

/**
 * 사용자 환경 설정 인터페이스
 */
export interface FilterSettings {
  mode: FilterMode;
  blurIntensity: number; // px 단위 (기본: 6)
  hideAds: boolean; // 상시/추천/헤드헌팅 광고 공고 숨김 여부
  showInlineButton: boolean; // 공고 카드에 [차단] 인라인 버튼 노출 여부
  enableInfiniteScroll: boolean; // 페이지네이션을 무한 스크롤로 자동 변환 여부
}

/**
 * 기본 설정값
 */
export const DEFAULT_SETTINGS: FilterSettings = {
  mode: 'blur',
  blurIntensity: 6,
  hideAds: true,
  showInlineButton: true,
  enableInfiniteScroll: true,
};

/**
 * 사이트 어댑터가 추출한 단일 채용 공고 정보
 */
export interface JobCardInfo {
  cardElement: HTMLElement;
  companyName: string;
  title: string;
  isAd: boolean;
  jobId?: string;
}

/**
 * 필터링 판정 결과
 */
export interface FilterResult {
  shouldFilter: boolean;
  matchedItem?: BlockItem;
  isAdFilter: boolean;
  reason?: string;
}

/**
 * 페이지별 필터링 카운트 통계
 */
export interface FilterStats {
  totalBlocked: number;
  blockedCompanies: number;
  blockedAds: number;
}

/**
 * Background-Content-Popup 간 메시지 프로토콜
 */
export type ExtensionMessage =
  | { type: 'UPDATE_BADGE'; count: number }
  | { type: 'GET_PAGE_STATS' }
  | { type: 'PAGE_STATS_RESPONSE'; stats: FilterStats }
  | { type: 'SETTINGS_CHANGED'; settings: FilterSettings }
  | { type: 'BLOCKLIST_CHANGED'; items: BlockItem[] }
  | { type: 'ADD_BLOCK_COMPANY'; companyName: string };
