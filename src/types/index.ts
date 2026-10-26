/**
 * 필터 처리 방식: 블러 처리 또는 완전 숨김
 */
export type FilterMode = 'blur' | 'hide';

/**
 * 차단 대상 유형: 회사, 키워드, 단일 공고
 */
export type BlockType = 'company' | 'keyword' | 'job';

/**
 * 차단이 발생한 채용 플랫폼 식별자
 */
export type JobPlatform = 'wanted' | 'saramin' | 'jobkorea' | 'custom';

/**
 * 차단 항목 인터페이스
 */
export interface BlockItem {
  id: string;
  pattern: string; // 회사명, 키워드 또는 jobId
  type: BlockType;
  createdAt: number;
  platform?: JobPlatform; // 차단이 수행된 채용 플랫폼 ('wanted' | 'saramin' | 'jobkorea' | 'custom')
  expiresAt?: number; // 공고 마감시각 + 30일 만료 타임스탬프 (자동 삭제 기준)
  closingDate?: string; // 원본 마감 정보 문자열 (예: '~ 11/07(토)', '상시채용' 등)
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
  showJobplanetRating: boolean; // 잡플래닛 평점 뱃지 표시 여부 (초록색)
  showBlindRating: boolean; // 블라인드 평점 뱃지 표시 여부 (빨간색)
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
  showJobplanetRating: true,
  showBlindRating: true,
};

/**
 * 기업 평점 연동 플랫폼 (잡플래닛 / 블라인드)
 */
export type RatingPlatform = 'jobplanet' | 'blind';

/**
 * 평점 조회 결과 상태
 */
export type RatingStatus = 'found' | 'not_found' | 'ambiguous' | 'error';

/**
 * 기업 평점 정보 공통 인터페이스
 */
export interface CompanyRatingInfo {
  platform: RatingPlatform;
  status: RatingStatus;
  companyName: string;
  rating?: number;
  reviewCount?: number;
  companyId?: number | string;
  companyUrl?: string;
  cachedAt: number;
}

// 하위 호환 별칭
export type JobplanetRatingStatus = RatingStatus;
export type JobplanetRatingInfo = CompanyRatingInfo;
export type BlindRatingStatus = RatingStatus;
export type BlindRatingInfo = CompanyRatingInfo;

/**
 * 사이트 어댑터가 추출한 단일 채용 공고 정보
 */
export interface JobCardInfo {
  cardElement: HTMLElement;
  companyName: string;
  title: string;
  isAd: boolean;
  jobId?: string;
  closingDate?: string; // 원본 마감일시 텍스트
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
  blockedJobs: number;
  blockedAds: number;
}

/**
 * 전체 누적 차단 목록 통계
 */
export interface TotalBlockStats {
  total: number;
  companies: number;
  jobs: number;
  keywords: number;
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
  | { type: 'ADD_BLOCK_COMPANY'; companyName: string }
  | { type: 'FETCH_JOBPLANET_RATING'; companyName: string }
  | { type: 'FETCH_BLIND_RATING'; companyName: string };

