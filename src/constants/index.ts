/**
 * 애플리케이션 브랜딩 및 기본 정보 상수
 */
export const APP_INFO = {
  NAME: 'Job Blocking V2',
  FULL_NAME: 'Job Blocking V2 - 채용 사이트 공고 필터링',
  DESCRIPTION: '원티드, 사람인, 잡코리아 등 채용 사이트의 원치 않는 회사 및 광고 공고를 숨기거나 블러 처리합니다.',
  VERSION: '0.1.0',
} as const;

/**
 * 스토리지 키 상수
 */
export const STORAGE_KEYS = {
  SETTINGS: 'job_filter_settings',
  BLOCK_LIST: 'job_filter_block_list',
} as const;

/**
 * 브라우저 툴바 뱃지 설정 상수
 */
export const BADGE_CONFIG = {
  ENABLED: false, // 툴바 아이콘 뱃지 카운트 표시 여부 (사용자 요청: 미표시)
  COLOR: '#ef4444',
  MAX_DISPLAY_COUNT: 99,
  OVERFLOW_TEXT: '99+',
} as const;


/**
 * 필터 엔진 및 옵저버 동작 상수
 */
export const FILTER_CONFIG = {
  DEFAULT_BLUR_INTENSITY: 6,
  DEBOUNCE_DELAY_MS: 150,
  STATUS_MESSAGE_TIMEOUT_MS: 2000,
  ATTR_JOB_FILTERED: 'data-job-filtered',
  ATTR_FILTER_MODE: 'data-filter-mode',
} as const;

/**
 * 지원 사이트 식별 도메인
 */
export const SITE_DOMAINS = {
  WANTED: 'wanted.co.kr',
  SARAMIN: 'saramin.co.kr',
  JOBKOREA: 'jobkorea.co.kr',
} as const;

/**
 * 공고 마감시각 기준 만료(TTL) 설정 상수
 */
export const EXPIRATION_CONFIG = {
  ADDITIONAL_DAYS_AFTER_CLOSING: 30, // 마감시각 이후 보관 유지 일수 (+30일)
  DEFAULT_EXPIRATION_DAYS: 30, // 마감일 특정 불가 시 기본 보관 일수 (+30일)
  MS_PER_DAY: 86_400_000, // 24 * 60 * 60 * 1000
} as const;

/**
 * 원티드(Wanted) DOM 셀렉터 상수
 */
export const WANTED_SELECTORS = {
  JOB_CARDS: '[data-cy="job-card"], div[class*="JobCard_container__"], a[href*="/wd/"]',
  CARD_CONTAINER: 'li, div[class*="Card_"]',
  COMPANY_NAME: '[data-attribute-id="company__name"], span[class*="companyName"], span[class*="Company_name"], .company-name, span[class*="company"]',
  POSITION_TITLE: '[data-attribute-id="position__name"], strong[class*="position"], h4, [class*="JobCard_title"], a[href*="/wd/"]',
  AD_BADGE: '[data-attribute-id="badge__ad"], [class*="ad_badge"], [class*="badge_ad"]',
  JOB_LINK: 'a[href*="/wd/"]',
  CLOSING_DATE: '.due-date, [class*="dueDate"], [class*="due_date"]',
} as const;

/**
 * 무한 스크롤 관련 상수
 */
export const INFINITE_SCROLL_CONFIG = {
  MIN_VISIBLE_CARDS: 5,
  MAX_CONSECUTIVE_FETCHES: 5,
  FETCH_DELAY_MS: 300,
  FETCH_TIMEOUT_MS: 10000,
  SENTINEL_ID: 'job-filter-scroll-sentinel',
  LOADING_INDICATOR_ID: 'job-filter-loading-indicator',
} as const;

/**
 * 사람인(Saramin) DOM 셀렉터 상수
 */
export const SARAMIN_SELECTORS = {
  JOB_CARDS: '.item_recruit, .list_item, div[class*="BoxAd_wrap"], .recruit_list .row',
  LIST_CONTAINER: '#recruit_info_list .content, #recruit_info_list .content_wrap, #recruit_info_list, .recruit_list',
  PAGINATION: '.pagination, .page_box',
  COMPANY_NAME: '.area_corp .corp_name a, .corp_name, a[class*="company"], .company_name',
  POSITION_TITLE: '.area_job .job_tit a, .job_tit a, .job_tit, .area_job .job_tit',
  AD_BADGE: '.badge_plus, .badge_recommend, .tag_ad, .ad_tag',
  AD_CLASS: 'plus_ad',
  CLOSING_DATE: '.area_job .date, .item_recruit .date, .date, .info_period .date, .jv_summary .date, .info_period .txt',
  // 상세 페이지 및 하단 무한 스크롤(릴레이 뷰/추천 공고) 셀렉터 (.wrap_jview는 부모 래퍼이므로 제외하고 개별 공고 단위로 지정)
  DETAIL_RELAY_CONTAINERS: '.wrap_jview > .jview, .wrap_jview > section[class*="jview"], .wrap_jview > div[class*="jview"], .wrap_jv_cont, div[id^="jview_"], .jview_box, section.jview',
  DETAIL_RECOMMEND_CARDS: '.item_recommend, .recommend_sec .list_item, .box_recommend li, .relate_job li, [class*="recommend_job"] li, .jview_wing .offer.list li',
  DETAIL_COMPANY_NAME: '.jv_header .company_name, .jv_header a.company, .wrap_jv_header .corp_name, .company_info .name, .company_name, .corp_name',
  DETAIL_POSITION_TITLE: '.jv_header .tit_job, .jv_header h1, h1.tit_job, .wrap_jv_header .tit_job, .job_tit, .tit',
  DETAIL_HEADER: '.jv_header, .wrap_jv_header, .header_jv, .view_header',
  // 프로모션 및 광고 배너(AI 검색 배너, 개인 맞춤 추천 공고, 스토어 프로모션 배너)
  PROMOTION_BANNERS: '.area_ai_search, section.type_searchup, section.keyword_up_logo_area, .wrap_searchup, section.wrap_store, .wrap_store, #store_product, #section_contents, section[aria-label="추천공고"], .list_curation_wrap',
} as const;

/**
 * 잡코리아(JobKorea) DOM 셀렉터 상수
 */
export const JOBKOREA_SELECTORS = {
  JOB_CARDS: '.list-post, .dev_gwork, .recruit-info, li[class*="list-item"]',
  LIST_CONTAINER: '.lists-cnt, .lists-wrap, .list-default',
  PAGINATION: '.tplPagination, .page-box, .pagination',
  COMPANY_NAME: '.post-list-corp a, .corp-name a, .name, a[class*="corp"], .post-list-corp',
  POSITION_TITLE: '.post-list-info a.title, .title a, a.tit, .post-title',
  AD_BADGE: '.badge-ad, .badge-special, .tag-ad',
  AD_CLASS: 'special-post',
  CLOSING_DATE: '.date, .option .date, .post-list-info .date',
} as const;

/**
 * UI 안내 문구 상수
 */
export const UI_MESSAGES = {
  POPUP_TITLE: 'Job Blocking V2',
  OPTIONS_TITLE: 'Job Blocking V2 - 환경 설정',
  BLOCK_SUCCESS: (pattern: string) => `'${pattern}' 차단 등록 완료!`,
  IMPORT_SUCCESS: '차단 목록을 성공적으로 불러왔습니다!',
  IMPORT_INVALID_JSON: '올바르지 않은 JSON 파일입니다.',
  EMPTY_SEARCH_RESULT: '검색 결과가 없습니다.',
  EMPTY_BLOCK_LIST: '등록된 차단 항목이 없습니다.',
  PURGE_EXPIRED_SUCCESS: (count: number) => `만료된 공고 ${count}개가 자동 정리되었습니다.`,
  EMPTY_EXPIRED_LIST: '만료된 공고가 없습니다.',
} as const;

/**
 * 공고 카드 내 인라인 액션 버튼(공고숨김 / 회사차단) UI 및 스타일 설정 상수
 */
export const INLINE_BUTTON_CONFIG = {
  CLASSES: {
    CARD_HOST: 'job-filter-card-host',
    CONTAINER: 'job-filter-btn-group',
    BUTTON: 'job-filter-hide-btn',
    JOB_BUTTON: 'job-filter-btn-job',
    COMPANY_BUTTON: 'job-filter-btn-company',
    DIVIDER: 'job-filter-btn-divider',
    ICON: 'job-filter-btn-icon',
    TEXT: 'job-filter-btn-text',
  },
  LABELS: {
    HIDE_JOB: '공고숨김',
    BLOCK_COMPANY: '회사차단',
  },
  TOOLTIPS: {
    HIDE_JOB: '이 공고만 숨기기 (동일 회사의 다른 공고는 유지)',
    BLOCK_COMPANY: (companyName: string) => `'${companyName}' 기업의 모든 공고 영구 차단`,
  },
  ICONS: {
    SIZE: 11,
    STROKE_WIDTH: 2,
    VIEW_BOX: '0 0 24 24',
  },
} as const;

