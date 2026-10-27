/**
 * 애플리케이션 브랜딩 및 기본 정보 상수
 */
export const APP_INFO = {
  NAME: 'Job Blocking V2',
  FULL_NAME: 'Job Blocking V2 - 채용 사이트 공고 필터링',
  DESCRIPTION: '원티드, 사람인, 잡코리아, 리멤버, 점핏 등 채용 사이트의 원치 않는 회사 및 광고 공고를 숨기거나 블러 처리합니다.',
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
  REMEMBER: 'rememberapp.co.kr',
  JUMPIT: 'jumpit.saramin.co.kr',
  JUMPIT_LEGACY: 'jumpit.co.kr',
  JOBPLANET: 'jobplanet.co.kr',
  BLIND: 'teamblind.com',
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
  JOB_CARDS:
    '[data-cy="job-card"], div[class*="JobCard_JobCard"], div[class*="JobCard_container"], a[href*="/wd/"], [class*="MiniJobCard"]',
  CARD_CONTAINER:
    'div[data-cy="job-card"], div[class*="JobCard_JobCard"], div[class*="JobCard_container"], div[class*="Card_"], [class*="MiniJobCard"]',
  GRID_ITEM:
    'li[class*="Card_"], ul[class*="List_"] > li, ul[class*="CarouselContainer"] > li, ul[class*="slider"] > li, ul[class*="Slider"] > li',
  COMPANY_NAME:
    'span[class*="CompanyNameWithLocationPeriod__company"], span[class*="__company__"], [data-attribute-id="company__name"], [data-company-name], span[class*="companyName"], span[class*="Company_name"], .company-name, [class*="MiniJobCard"] header > *:nth-child(2)',
  POSITION_TITLE:
    'span[class*="JobCard__body__position"], span[class*="body__position"], [data-attribute-id="position__name"], [data-position-name], [class*="MiniJobCard__positionTitle"], strong[class*="position"], h4, [class*="JobCard_title"]',
  BOOKMARK_BUTTON:
    'button.bookmarkBtn, button[data-position-name], button[data-company-name], [data-company-name]',
  AD_BADGE: '[data-attribute-id="badge__ad"], [class*="ad_badge"], [class*="badge_ad"]',
  JOB_LINK: 'a[href*="/wd/"]',
  CLOSING_DATE:
    'span[class*="CompanyNameWithLocationPeriod__location"], .due-date, [class*="dueDate"], [class*="due_date"]',

  // 상세 페이지(/wd/\d+) 셀렉터
  DETAIL_HEADER:
    'section[class*="JobHeader_JobHeader"], div[class*="JobHeader_className"], [class*="JobHeader_JobHeader"], .job-header',
  DETAIL_TITLE_INNER: 'div[class*="JobHeader_JobHeader__Tools"], div[class*="JobHeader__Tools"], .job-header',
  DETAIL_POSITION_TITLE: 'h1.montage-g4lz5p, h1, [class*="JobHeader"] h1',
  DETAIL_COMPANY_NAME:
    'a[class*="JobHeader_JobHeader__Tools__Company__Link"], a[class*="JobHeader__Tools__Company__Link"], a[data-attribute-id="company__click"], a[data-company-name]',

  // 프로모션 및 광고 배너(적극 채용 중인 회사 슬라이더, 프로모션 섹션 등)
  PROMOTION_BANNERS:
    'section[class*="AdTargetList_"], div[class*="AdTargetList_"], [class*="AdTargetList_AdTargetList"], [class*="AdTargetList"]',
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
  COMPANY_NAME:
    '.area_corp .corp_name a, .area_corp .corp_name, strong.corp_name a, strong.corp_name, .corp_name a, .corp_name, a.company:not(.company_popup)',

  POSITION_TITLE: '.area_job .job_tit a, .job_tit a, .job_tit, .area_job .job_tit',
  AD_BADGE: '.badge_plus, .badge_recommend, .tag_ad, .ad_tag',
  AD_CLASS: 'plus_ad',
  CLOSING_DATE: '.area_job .date, .item_recruit .date, .date, .info_period .date, .jv_summary .date, .info_period .txt',
  // 상세 페이지 및 하단 무한 스크롤(릴레이 뷰/추천 공고) 셀렉터 (.wrap_jview는 부모 래퍼이므로 제외하고 개별 공고 단위로 지정)
  DETAIL_RELAY_CONTAINERS: '.wrap_jview > .jview, .wrap_jview > section[class*="jview"], .wrap_jview > div[class*="jview"], .wrap_jv_cont, div[id^="jview_"], .jview_box, section.jview',
  DETAIL_RECOMMEND_CARDS: '.item_recommend, .recommend_sec .list_item, .box_recommend li, .relate_job li, [class*="recommend_job"] li, .jview_wing .offer.list li',
  DETAIL_COMPANY_NAME:
    '.jv_header .title_inner .company, .title_inner .company, .jv_header .title_inner a:not(.btn_interest):not(.company_popup), .title_inner a:not(.btn_interest):not(.company_popup), .jv_header a.company, .jv_header .company_name, .wrap_jv_header .corp_name, .company_info .name',
  DETAIL_POSITION_TITLE: '.jv_header .tit_job, .jv_header h1, h1.tit_job, .wrap_jv_header .tit_job, .job_tit, .tit',
  DETAIL_HEADER: '.jv_header, .wrap_jv_header, .header_jv, .view_header',
  DETAIL_TITLE_INNER: '.title_inner, .wrap_corp_info, .area_corp',


  // 프로모션 및 광고 배너(AI 검색 배너, 개인 맞춤 추천 공고, 스토어 프로모션 배너)
  PROMOTION_BANNERS: '.area_ai_search, section.type_searchup, section.keyword_up_logo_area, .wrap_searchup, section.wrap_store, .wrap_store, #store_product, #section_contents, section[aria-label="추천공고"], .list_curation_wrap',
} as const;

/**
 * 잡코리아(JobKorea) DOM 셀렉터 상수
 */
export const JOBKOREA_SELECTORS = {
  JOB_CARDS:
    'li.listItem, li[class*="listItem"], .tplList table tbody tr[data-gno], .tplList.tplJobList table tbody tr, ol.rankList > li, li.dmpItem, .rankList > li, .job-recommendation-item, .list-post, .dev_gwork, .recruit-info, li[class*="list-item"]',
  LIST_CONTAINER:
    'ul:has(> li.listItem), ol.rankList, .rankListArea, .tplList.tplJobList table tbody, #dev-gi-list .tplJobList table tbody, .tplList table tbody, .lists-cnt, .lists-wrap, .list-default',
  PAGINATION: '#dvGIPaging .tplPagination, .tplPagination, .page-box, .pagination',
  COMPANY_NAME:
    '.recruit-company .headers .name a, .recruit-company .headers .name, .recruit-company .name a, .recruit-company .name, .coTit a.coLink, .coTit a, .coLink, td.tplCo a, .tplCo a, .company-name a, .company-name, .post-list-corp a, .corp-name a, .name, a[class*="corp"], .post-list-corp',
  POSITION_TITLE:
    '.recruit-content .headers .title, .recruit-content .title, a.title.giread, a.giread, .info .tit a.link, .info .tit a, .tit a.dev-recruit-link, td.tplTit strong a, td.tplTit a.link, .tplTit .titBx strong a, .title a, .job-recommendation-details .title a, .post-list-info a.title, a.tit, .post-title',
  BUTTON_HOST_CELL: '.titBx, td.tplTit .titBx, td.tplTit',
  AD_BADGE: '.badge-ad, .badge-special, .tag-ad',
  AD_CLASS: 'special-post, job-recommendation-item',
  CLOSING_DATE: '.side .day, td.odd .date, .odd .date, .deadline, .date, .option .date, .post-list-info .date',
  FAVORITE_BUTTON: '.dev-btn-favor, .devFavor, .tplBtnFavOff, .tplBtnFavOn, .dev-favor, .favorite-button',
  PROMOTION_BANNERS:
    '#dev-TopHeadlineAGI, #TopHeadlineAGI, #dev-HeadlineAGI, #HeadlineAGI, .listTopHeadline, .listHeadline, .listBannerWrap, .job-recommendation, div.job-recommendation, .area-recommend-job, .dev-banner, #dev-BNewsAGI',

  // 상세 페이지(/Recruit/GI_Read/*) 셀렉터
  DETAIL_CONTAINER:
    'main[class*="grid"], main, [data-sentry-component="Title"], div[data-jobview-section="atf"], .artReadJob, .readJobWrap, #dev-gi-read',
  DETAIL_HEADER:
    '[data-sentry-component="Title"], div[data-jobview-section="atf"], .artReadJob .sumWrap, .artReadJob, .tbRow',
  DETAIL_TITLE_INNER:
    '[data-sentry-component="Title"] > div, div[data-jobview-section="atf"], .artReadJob .sumWrap, .artReadJob',
  DETAIL_MENU_BUTTONS: '#menu-buttons, [data-sentry-component="MenuButtons"]',
  DETAIL_COMPANY_NAME:
    '[data-sentry-component="CompanyName"] a, [data-sentry-component="CompanyName"] h2, [data-sentry-component="CompanyName"], a[href*="/Recruit/Co_Read/"] h2, a[href*="/Recruit/Co_Read/"], .coInfo .coName, .corp-name, .coName',
  DETAIL_POSITION_TITLE:
    '[data-sentry-component="TitleContent"] h1, [data-sentry-component="Title"] h1, div[data-jobview-section="atf"] h1, h1.font-bold, .artReadJob .sumWrap h3, .artReadJob h3, .sumWrap .tit',
  DETAIL_RECOMMEND_CARDS:
    '#recommended-section [data-sentry-element="Grid"] > div, #recommended-section div[class*="Card"], .box-recommend li',
} as const;

/**
 * 잡코리아(JobKorea) 요청 및 동작 설정 상수
 */
export const JOBKOREA_CONFIG = {
  PAGING_ENDPOINT: '/Recruit/Home/_GI_List/',
  JOBLIST_PATH: '/recruit/joblist',
  AI_PATH: '/User/AI',
  AI_PATH_LOWER: '/user/ai',
  DETAIL_PATH: '/Recruit/GI_Read/',
  DETAIL_PATH_LOWER: '/recruit/gi_read/',
  DEFAULT_PAGE_SIZE: '40',
  DEFAULT_ORDER: '20',
  DEFAULT_TAB_INDEX: '0',
  BODY_PARAMS: {
    PAGE: 'page',
    PAGE_SIZE: 'pagesize',
    ORDER: 'order',
    TAB_INDEX: 'tabindex',
  },
} as const;

/**
 * 리멤버(Remember) DOM 셀렉터 상수
 */
export const REMEMBER_SELECTORS = {
  JOB_CARDS:
    'li[class*="sc-364cfa5d-0"], div[class*="sc-18344c98-0"], li[class*="sc-d2fb7cfc-0"], li[class*="sc-3c9cd5df-0"], div[class*="sc-289d3ccd-0"], a[href*="/job/posting/"], a[href*="/job/postings/"]',
  CARD_CONTAINER:
    'li[class*="sc-364cfa5d-0"], li[class*="sc-d2fb7cfc-0"], li[class*="sc-3c9cd5df-0"], div[class*="sc-289d3ccd-0"], li:has(a[href*="/job/posting/"]), li:has(a[href*="/job/postings/"])',
  GRID_ITEM:
    'li[class*="sc-364cfa5d-0"], li[class*="sc-d2fb7cfc-0"], li[class*="sc-3c9cd5df-0"], div[class*="sc-289d3ccd-0"], ul > li',
  COMPANY_NAME:
    'p[class*="sc-18344c98-6"], div[class*="sc-d2fb7cfc-7"], div[class*="sc-3c9cd5df-7"], p[class*="sc-289d3ccd-4"], [class*="sc-289d3ccd-4"], a[href*="/job/company/"] div, a[href*="/company/"]',
  POSITION_TITLE:
    'h4[class*="sc-18344c98-9"], div[class*="sc-d2fb7cfc-6"], div[class*="sc-3c9cd5df-6"], h3[class*="sc-289d3ccd-3"], [class*="sc-289d3ccd-3"], h4',
  BOOKMARK_BUTTON:
    'div[class*="sc-18344c98-8"] button, div[class*="sc-3c9cd5df-5"], div[class*="sc-289d3ccd-7"] button, [class*="sc-289d3ccd-7"], button[class*="bookmark"]',
  AD_BADGE: '[class*="ad_badge"], [class*="badge_ad"]',
  JOB_LINK: 'a[href*="/job/posting/"], a[href*="/job/postings/"], a[href*="postingId="]',
  CLOSING_DATE: '[class*="chip"], span',

  // 상세 페이지(/job/posting/\d+) 셀렉터
  DETAIL_CONTAINER:
    'div[class*="sc-884c2c6c-2"], div:has(> #posting-detail-title), div:has(> a[href*="/job/company/"])',
  DETAIL_HEADER: 'div[class*="sc-884c2c6c-2"], div:has(> #posting-detail-title)',
  DETAIL_TITLE_INNER:
    'div[class*="sc-a34accef-0"]:has(#posting-detail-title), div:has(#posting-detail-title)',
  DETAIL_COMPANY_NAME:
    'a[href*="/job/company/"] div[class*="sc-db17a579-0"], a[href*="/job/company/"]',
  DETAIL_POSITION_TITLE: '#posting-detail-title, h1[class*="sc-db17a579-0"], h1',

  // 프로모션 및 광고 배너
  // 1. 프리미엄 대표기업 (#companyJobBoard 또는 a[href*="/job/board/premium-top-companies"])
  // 2. 상단 캐러셀 배너 광고 (sc-79e4e802-0, img[alt*="광고 배너"], a[href*="job_board_top_banner"])
  PROMOTION_BANNERS:
    '#companyJobBoard, section[class*="sc-79e4e802-0"], section:has(img[src*="ad-cdn.rememberapp.co.kr"]), section:has(img[alt*="광고 배너"]), section:has(a[href*="/job/board/premium-top-companies"]), section:has(a[href*="job_board_top_banner"])',
} as const;

/**
 * 점핏(Jumpit) DOM 셀렉터 상수
 */
export const JUMPIT_SELECTORS = {
  JOB_CARDS:
    'div:has(> a[href*="/position/"]), div[class*="sc-d609d44f-0"], a[href*="/position/"]',
  CARD_CONTAINER:
    'div:has(> a[href*="/position/"]), div[class*="sc-d609d44f-0"]',
  GRID_ITEM:
    'div:has(> a[href*="/position/"]), div[class*="sc-d609d44f-0"], a[href*="/position/"]',
  COMPANY_NAME:
    'div[class*="sc-15ba67b8-2"] span, div[class*="sc-15ba67b8-2"], div:has(> h2.position_card_info_title) > div:first-child span, div:has(> h2.position_card_info_title) > div:first-child, div[class*="jkmBOM"] span, div[class*="bhnakf"] span, .company_name',
  POSITION_TITLE:
    'h2.position_card_info_title, [class*="position_card_info_title"], h2',
  JOB_LINK: 'a[href*="/position/"]',
  CLOSING_DATE:
    'span[class*="sc-a0b0873a-0"], div[class*="sc-d609d44f-3"] span, .due-date, dl.sc-b12ae455-1 dd',
  BOOKMARK_BUTTON: 'div.counts button, button[class*="kMayiw"]',
  AD_BADGE: '[class*="ad_badge"], [class*="badge_ad"], [data-is-ad="true"]',

  // 상세 페이지(/position/\d+) 셀렉터
  DETAIL_HEADER:
    'div[class*="sc-80824a9d-0"], div:has(> h1):has(a[href*="/company/"]), div[class*="sc-3ef60426-4"]',
  DETAIL_TITLE_INNER:
    'div[class*="sc-80824a9d-0"], div:has(> h1):has(a[href*="/company/"])',
  DETAIL_POSITION_TITLE: 'h1',
  DETAIL_COMPANY_NAME:
    'a.name[href*="/company/"] span, a[href*="/company/"] span, a.name, a[href*="/company/"]',
  DETAIL_CLOSING_DATE:
    '.due-date, .deadline, dl.sc-b12ae455-1 dd',

  // 프로모션 및 광고 배너
  PROMOTION_BANNERS:
    'aside[class*="sc-3ef60426-1"], [class*="POSITIONS_BANNER"], section:has(a[href*="/event/"]), [class*="MAIN_BANNER"], [class*="MAIN_WING_BANNER"], [class*="POSITION_VIEW_WING_BANNER"]',
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
  TOGGLE_LABELS: {
    MODE_BLUR: '블러(흐리게) 처리',
    MODE_HIDE: '완전 숨김 처리',
    HIDE_ADS: '추천/광고 공고 숨김',
    INFINITE_SCROLL: '무한 스크롤 & 자동 채우기',
    JOBPLANET_RATING: '잡플래닛 평점 표시',
    BLIND_RATING: '블라인드 평점 표시',
  },
} as const;

/**
 * 환경 설정(Options) 차단 목록 카테고리 필터 탭 설정 상수
 */
export const OPTIONS_FILTER_CONFIG = {
  ALL: 'all',
  COMPANY: 'company',
  JOB: 'job',
  KEYWORD: 'keyword',
  LABELS: {
    ALL: '전체',
    COMPANY: '회사',
    JOB: '공고',
    KEYWORD: '키워드',
  },
  EMPTY_MESSAGES: {
    ALL: '등록된 차단 항목이 없습니다.',
    COMPANY: '차단된 회사가 없습니다.',
    JOB: '숨긴 공고가 없습니다.',
    KEYWORD: '차단된 키워드가 없습니다.',
  },
} as const;

export type OptionsFilterType =
  (typeof OPTIONS_FILTER_CONFIG)[keyof Pick<
    typeof OPTIONS_FILTER_CONFIG,
    'ALL' | 'COMPANY' | 'JOB' | 'KEYWORD'
  >];

/**
 * 채용 플랫폼 식별자 및 UI 레이블/뱃지 스타일 상수
 */
export const PLATFORM_CONFIG = {
  ALL: 'all',
  WANTED: 'wanted',
  SARAMIN: 'saramin',
  JOBKOREA: 'jobkorea',
  REMEMBER: 'remember',
  JUMPIT: 'jumpit',
  CUSTOM: 'custom',
  LABELS: {
    all: '전체 플랫폼',
    wanted: '원티드',
    saramin: '사람인',
    jobkorea: '잡코리아',
    remember: '리멤버',
    jumpit: '점핏',
    custom: '직접등록',
  },
  BADGE_CLASSES: {
    wanted: 'platform-badge-wanted',
    saramin: 'platform-badge-saramin',
    jobkorea: 'platform-badge-jobkorea',
    remember: 'platform-badge-remember',
    jumpit: 'platform-badge-jumpit',
    custom: 'platform-badge-custom',
  },
} as const;

export type PlatformFilterType =
  (typeof PLATFORM_CONFIG)[keyof Pick<
    typeof PLATFORM_CONFIG,
    'ALL' | 'WANTED' | 'SARAMIN' | 'JOBKOREA' | 'REMEMBER' | 'JUMPIT' | 'CUSTOM'
  >];

/**
 * 팝업(Popup) 통계 탭 및 항목 설정 상수
 */
export const POPUP_STATS_CONFIG = {
  MODES: {
    TOTAL: 'total',
    PAGE: 'page',
  },
  MODE_LABELS: {
    TOTAL: '전체 등록',
    PAGE: '현재 페이지',
  },
  TOTAL_LABELS: {
    TOTAL: '전체 차단',
    COMPANIES: '차단 회사',
    JOBS: '숨긴 공고',
    KEYWORDS: '차단 키워드',
  },
  PAGE_LABELS: {
    TOTAL: '차단된 공고',
    COMPANIES: '차단 회사',
    JOBS: '숨긴 공고',
    ADS: '광고 공고',
  },
  NOT_JOB_SITE_TOOLTIP: '현재 탭은 지원하는 채용 사이트가 아닙니다.',
} as const;

export type PopupStatsMode =
  (typeof POPUP_STATS_CONFIG.MODES)[keyof typeof POPUP_STATS_CONFIG.MODES];




/**
 * 공고 카드 내 인라인 액션 버튼(공고숨김 / 회사차단) UI 및 스타일 설정 상수
 */
export const INLINE_BUTTON_CONFIG = {
  CLASSES: {
    CARD_HOST: 'job-filter-card-host',
    CONTAINER: 'job-filter-btn-group',
    CONTAINER_DETAIL: 'job-filter-btn-group-detail',
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

/**
 * 잡플래닛 연동 및 봇 차단 우회 요청 설정 상수
 */
export const JOBPLANET_CONFIG = {
  BASE_URL: 'https://www.jobplanet.co.kr',
  SEARCH_API_ENDPOINT: 'https://www.jobplanet.co.kr/search/companies',
  COMPANY_BASE_URL: 'https://www.jobplanet.co.kr/companies',
  HEADERS: {
    RSC: '1',
    ACCEPT: '*/*',
    ACCEPT_LANGUAGE: 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  },
  CACHE_KEY_PREFIX: 'jobplanet_score_',
  CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000, // 정상 평점 캐시 7일
  NEGATIVE_CACHE_TTL_MS: 24 * 60 * 60 * 1000, // 미존재/동명기업 캐시 1일
  ERROR_CACHE_TTL_MS: 5 * 60 * 1000, // 일시적 에러는 5분 후 재시도
  REQUEST_DELAY_MS: 250, // 봇 차단 방지 지연(ms)
  MAX_CONCURRENT_REQUESTS: 3, // 동시 요청 최대 풀 크기
  REQUEST_TIMEOUT_MS: 8000, // 타임아웃 8초
} as const;

/**
 * 팀블라인드(TeamBlind) 연동 및 요청 설정 상수
 */
export const BLIND_CONFIG = {
  BASE_URL: 'https://www.teamblind.com',
  SEARCH_URL: 'https://www.teamblind.com/kr/search',
  COMPANY_BASE_URL: 'https://www.teamblind.com/kr/company',
  HEADERS: {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  },
  CACHE_KEY_PREFIX: 'blind_score_',
  CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000, // 정상 평점 캐시 7일
  NEGATIVE_CACHE_TTL_MS: 24 * 60 * 60 * 1000, // 미존재/동명기업 캐시 1일
  ERROR_CACHE_TTL_MS: 5 * 60 * 1000, // 일시적 에러는 5분 후 재시도
  REQUEST_DELAY_MS: 250, // 순차 호출 스로틀링(ms)
  MAX_CONCURRENT_REQUESTS: 3, // 동시 요청 최대 풀 크기
  REQUEST_TIMEOUT_MS: 8000, // 타임아웃 8초
} as const;

/**
 * 기업 평점(잡플래닛 / 블라인드) 뱃지 UI 설정 상수
 */
export const RATING_BADGE_CONFIG = {
  CLASSES: {
    WRAP: 'job-filter-ratings-wrap',
    BADGE: 'job-filter-rating-badge',
    CONTAINER: 'job-filter-rating-badge', // 하위 호환
    STAR: 'job-filter-rating-star',
    SCORE: 'job-filter-rating-score',
    LABEL: 'job-filter-rating-label',
    JOBPLANET: 'job-filter-rating-jobplanet',
    BLIND: 'job-filter-rating-blind',
    HIGH: 'job-filter-rating-high',
    MEDIUM: 'job-filter-rating-medium',
    LOW: 'job-filter-rating-low',
    DEFAULT: 'job-filter-rating-default',
  },
  LABELS: {
    JOBPLANET: '잡플래닛',
    BLIND: '블라인드',
  },
  TOOLTIPS: {
    JOBPLANET: (rating: number, companyName: string) =>
      `'${companyName}' 잡플래닛 평점 ${rating.toFixed(1)} / 5.0 (클릭 시 이동 · 검색 결과 미존재, 동명 기업, 평점 미등록 시 표시 제외)`,
    BLIND: (rating: number, companyName: string) =>
      `'${companyName}' 블라인드 평점 ${rating.toFixed(1)} / 5.0 (클릭 시 이동 · 검색 결과 미존재, 동명 기업, 평점 미등록 시 표시 제외)`,
  },
  TOOLTIP: (rating: number, companyName: string) =>
    `'${companyName}' 평점 ${rating.toFixed(1)} / 5.0 (클릭 시 이동 · 검색 결과 미존재, 동명 기업, 평점 미등록 시 표시 제외)`,
} as const;



