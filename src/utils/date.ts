import { EXPIRATION_CONFIG } from '../constants';
import { BlockItem } from '../types';

/**
 * 다양한 채용 플랫폼의 공고 마감일 텍스트를 파싱하여 타임스탬프(ms, 해당일 23:59:59.999)로 변환
 *
 * 지원 포맷:
 * - YYYY-MM-DD / YYYY.MM.DD / YYYY. MM. DD (예: "2026-11-20", "2026.12.31", "2026. 11. 7")
 * - ~ MM/DD(요일) / ~ MM.DD (예: "~ 11/07(토)", "~ 11/15", "11/20(금)")
 * - 기간 표기 MM.DD~MM.DD (종료일을 마감일로 채택)
 * - D-Day (예: "D-3", "D-14") — 명시적 날짜가 없을 때만 사용
 * - 오늘마감 / 내일마감
 * - 초/밀리초 타임스탬프 문자열
 * - 상시채용 / 채용시 마감 -> null 반환 (단, 날짜가 함께 있으면 날짜 우선)
 *
 * [중요] 평가 순서: 절대 날짜(YMD) > 기간/MM-DD > 오늘/내일 > D-Day
 * D-Day를 먼저 평가하면 "~ 04/30(목) D-3" 같은 표기에서 실제 마감일이 무시된다.
 */
export function parseClosingDateToTimestamp(
  closingStr?: string | null,
  baseDate: Date = new Date()
): number | null {
  if (!closingStr || typeof closingStr !== 'string') {
    return null;
  }

  const trimmed = closingStr.trim();
  if (!trimmed) return null;

  // 1. 순수 타임스탬프인 경우 (10자리 초 또는 13자리 밀리초)
  if (/^\d{10}$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  if (/^\d{13}$/.test(trimmed)) {
    return Number(trimmed);
  }

  // 2. 절대 날짜(YYYY-MM-DD 계열) 최우선. 공백 허용: "2026. 11. 7"
  const ymdMatch = trimmed.match(/(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const target = new Date(year, month, day, 23, 59, 59, 999);
      const time = target.getTime();
      if (!Number.isNaN(time)) return time;
    }
  }

  // 3. 기간 표기(MM.DD~MM.DD): 종료일(마감일)을 채택. 날짜가 있으므로 상시/채용시보다 우선.
  const rangeMatch = trimmed.match(
    /(\d{1,2})\s*[-./]\s*(\d{1,2})\s*[~\-]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/
  );
  if (rangeMatch) {
    const month = parseInt(rangeMatch[3], 10) - 1;
    const day = parseInt(rangeMatch[4], 10);
    const time = buildMonthDayTimestamp(month, day, baseDate);
    if (time !== null) return time;
  }

  // 4. 오늘마감 / 내일마감
  if (/오늘마감/i.test(trimmed)) {
    const endOfToday = new Date(baseDate);
    endOfToday.setHours(23, 59, 59, 999);
    return endOfToday.getTime();
  }
  if (/내일마감/i.test(trimmed)) {
    const endOfTomorrow = new Date(baseDate);
    endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
    endOfTomorrow.setHours(23, 59, 59, 999);
    return endOfTomorrow.getTime();
  }

  // 5. 연도 없는 MM/DD (예: "~ 11/07(토)", "~11.19(목)")
  const mdMatch = trimmed.match(/(\d{1,2})\s*[-./]\s*(\d{1,2})/);
  if (mdMatch) {
    const month = parseInt(mdMatch[1], 10) - 1;
    const day = parseInt(mdMatch[2], 10);
    const time = buildMonthDayTimestamp(month, day, baseDate);
    if (time !== null) return time;
  }

  // 6. D-Day 포맷 (예: "D-3", "D-14") — 명시적 날짜가 전혀 없을 때만 사용
  const ddayMatch = trimmed.match(/D[-_\s](\d+)/i);
  if (ddayMatch) {
    const days = parseInt(ddayMatch[1], 10);
    const target = new Date(baseDate);
    target.setDate(target.getDate() + days);
    target.setHours(23, 59, 59, 999);
    return target.getTime();
  }

  // 7. 상시채용 / 채용시 마감 등 고정 기한 없는 경우 (날짜가 없음을 확인한 뒤 판정)
  if (/상시|채용시|수시/i.test(trimmed)) {
    return null;
  }

  return null;
}

/**
 * 연도 미표기 (월, 일)을 타임스탬프로 변환한다.
 *
 * 과거로 계산되면 "다음 해 마감"으로 1년 롤오버한다.
 * 기존 구현은 `baseDate.getMonth() >= 10 && month <= 1` 처럼 2개월 창만 커버해서,
 * 10월에 "~01/15", 12월에 "~03/15" 같은 표기가 과거로 계산되어
 * 차단 등록 즉시 만료 삭제되는 버그가 있었다.
 *
 * @param month 0-based 월 (0 = 1월)
 * @param day 1-based 일
 */
function buildMonthDayTimestamp(month: number, day: number, baseDate: Date): number | null {
  if (!(month >= 0 && month <= 11 && day >= 1 && day <= 31)) {
    return null;
  }

  const target = new Date(baseDate.getFullYear(), month, day, 23, 59, 59, 999);
  if (Number.isNaN(target.getTime())) return null;

  // 이미 충분히 과거라면 다음 해 마감으로 보정 (연말 등록 공고의 즉시 만료 방지)
  const rolloverThreshold =
    baseDate.getTime() - EXPIRATION_CONFIG.PAST_DATE_ROLLOVER_THRESHOLD_DAYS * EXPIRATION_CONFIG.MS_PER_DAY;

  if (target.getTime() < rolloverThreshold) {
    target.setFullYear(target.getFullYear() + 1);
  }

  return target.getTime();
}

/**
 * 공고 마감시각을 파싱하여 [마감시각 + 30일] (또는 상시/미정인 경우 등록시점 + 30일) 만료 타임스탬프 계산
 */
export function calculateJobExpiration(
  closingStr?: string | null,
  baseTime: number = Date.now()
): number {
  const fallback =
    baseTime + EXPIRATION_CONFIG.DEFAULT_EXPIRATION_DAYS * EXPIRATION_CONFIG.MS_PER_DAY;

  const closingTimestamp = parseClosingDateToTimestamp(closingStr, new Date(baseTime));

  if (closingTimestamp !== null && !Number.isNaN(closingTimestamp)) {
    const expiresAt =
      closingTimestamp +
      EXPIRATION_CONFIG.ADDITIONAL_DAYS_AFTER_CLOSING * EXPIRATION_CONFIG.MS_PER_DAY;
    if (!Number.isNaN(expiresAt) && Number.isFinite(expiresAt)) {
      return expiresAt;
    }
  }

  return fallback;
}

/**
 * 해당 차단 항목이 만료되었는지 판정
 */
export function isJobExpired(item: BlockItem, now: number = Date.now()): boolean {
  if (item.type !== 'job') {
    return false; // 회사 및 키워드는 영구 보존
  }
  return typeof item.expiresAt === 'number' && item.expiresAt <= now;
}

/**
 * 타임스탬프를 YYYY.MM.DD 형식의 날짜 문자열로 변환
 */
export function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}
