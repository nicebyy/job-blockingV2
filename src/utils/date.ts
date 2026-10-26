import { EXPIRATION_CONFIG } from '../constants';
import { BlockItem } from '../types';

/**
 * 다양한 채용 플랫폼의 공고 마감일 텍스트를 파싱하여 타임스탬프(ms, 해당일 23:59:59.999)로 변환
 *
 * 지원 포맷:
 * - YYYY-MM-DD / YYYY.MM.DD (예: "2026-11-20", "2026.12.31")
 * - ~ MM/DD(요일) / ~ MM.DD (예: "~ 11/07(토)", "~ 11/15", "11/20(금)")
 * - D-Day (예: "D-3", "D-14")
 * - 오늘마감 / 내일마감
 * - 초/밀리초 타임스탬프 문자열
 * - 상시채용 / 채용시 마감 -> null 반환
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

  // 1. 상시채용 / 채용시 마감 등 고정 기한 없는 경우
  if (/상시|채용시|수시/i.test(trimmed)) {
    return null;
  }

  // 2. 순수 타임스탬프인 경우 (10자리 초 또는 13자리 밀리초)
  if (/^\d{10}$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  if (/^\d{13}$/.test(trimmed)) {
    return Number(trimmed);
  }

  // 3. 오늘마감 / 내일마감
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

  // 4. D-Day 포맷 (예: "D-3", "D-14")
  const ddayMatch = trimmed.match(/D[-_](\d+)/i);
  if (ddayMatch) {
    const days = parseInt(ddayMatch[1], 10);
    const target = new Date(baseDate);
    target.setDate(target.getDate() + days);
    target.setHours(23, 59, 59, 999);
    return target.getTime();
  }

  // 5. YYYY-MM-DD 또는 YYYY.MM.DD 또는 YYYY/MM/DD
  const ymdMatch = trimmed.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const target = new Date(year, month, day, 23, 59, 59, 999);
    return target.getTime();
  }

  // 6. ~ MM/DD 또는 ~ MM.DD (예: "~ 11/07(토)", "~ 11/15", "11/20(금)")
  const mdMatch = trimmed.match(/(\d{1,2})[-./](\d{1,2})/);
  if (mdMatch) {
    const month = parseInt(mdMatch[1], 10) - 1;
    const day = parseInt(mdMatch[2], 10);
    let year = baseDate.getFullYear();

    // 만약 현재 월보다 파싱된 월이 현저히 앞선 경우(예: 현재 12월인데 마감월이 1월), 다음 연도로 처리
    if (baseDate.getMonth() >= 10 && month <= 1) {
      year += 1;
    }

    const target = new Date(year, month, day, 23, 59, 59, 999);
    return target.getTime();
  }

  return null;
}

/**
 * 공고 마감시각을 파싱하여 [마감시각 + 30일] (또는 상시/미정인 경우 등록시점 + 30일) 만료 타임스탬프 계산
 */
export function calculateJobExpiration(
  closingStr?: string | null,
  baseTime: number = Date.now()
): number {
  const closingTimestamp = parseClosingDateToTimestamp(closingStr, new Date(baseTime));

  if (closingTimestamp !== null) {
    // 1. 마감시각이 특정된 경우: [공고 마감시각 + 30일]
    return (
      closingTimestamp +
      EXPIRATION_CONFIG.ADDITIONAL_DAYS_AFTER_CLOSING * EXPIRATION_CONFIG.MS_PER_DAY
    );
  }

  // 2. 상시채용 / 채용시 마감 / 마감일 미표기인 경우: [등록 시점 + 30일]
  return (
    baseTime +
    EXPIRATION_CONFIG.DEFAULT_EXPIRATION_DAYS * EXPIRATION_CONFIG.MS_PER_DAY
  );
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
