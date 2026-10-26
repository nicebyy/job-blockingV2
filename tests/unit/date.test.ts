import { describe, it, expect } from 'vitest';
import {
  parseClosingDateToTimestamp,
  calculateJobExpiration,
  isJobExpired,
  formatDate,
} from '../../src/utils/date';
import { EXPIRATION_CONFIG } from '../../src/constants';
import { BlockItem } from '../../src/types';

describe('Date & Expiration 유틸리티 단위 테스트', () => {
  const baseDate = new Date(2026, 9, 26, 12, 0, 0); // 2026년 10월 26일 (월)

  describe('parseClosingDateToTimestamp', () => {
    it('YYYY-MM-DD 형식의 마감일을 23:59:59.999 타임스탬프로 정확히 변환해야 한다', () => {
      const ts = parseClosingDateToTimestamp('2026-11-20', baseDate);
      expect(ts).not.toBeNull();
      const resultDate = new Date(ts!);
      expect(resultDate.getFullYear()).toBe(2026);
      expect(resultDate.getMonth()).toBe(10); // 11월 (0-indexed 10)
      expect(resultDate.getDate()).toBe(20);
      expect(resultDate.getHours()).toBe(23);
      expect(resultDate.getMinutes()).toBe(59);
    });

    it('~ MM/DD(요일) 형식의 마감일을 파싱해야 한다', () => {
      const ts = parseClosingDateToTimestamp('~ 11/07(토)', baseDate);
      expect(ts).not.toBeNull();
      const resultDate = new Date(ts!);
      expect(resultDate.getFullYear()).toBe(2026);
      expect(resultDate.getMonth()).toBe(10); // 11월
      expect(resultDate.getDate()).toBe(7);
      expect(resultDate.getHours()).toBe(23);
    });

    it('현재 연말(12월)에 1월 마감 공고인 경우 다음 연도로 연도 롤오버를 처리해야 한다', () => {
      const endOfYear = new Date(2026, 11, 20); // 2026-12-20
      const ts = parseClosingDateToTimestamp('~ 01/15(금)', endOfYear);
      expect(ts).not.toBeNull();
      const resultDate = new Date(ts!);
      expect(resultDate.getFullYear()).toBe(2027);
      expect(resultDate.getMonth()).toBe(0); // 1월
      expect(resultDate.getDate()).toBe(15);
    });

    it('D-3 형식의 D-day를 현재 기준 +3일 23:59:59로 변환해야 한다', () => {
      const ts = parseClosingDateToTimestamp('D-3', baseDate);
      expect(ts).not.toBeNull();
      const resultDate = new Date(ts!);
      expect(resultDate.getDate()).toBe(29); // 26 + 3일
    });

    it('오늘마감 및 내일마감을 정확히 계산해야 한다', () => {
      const todayTs = parseClosingDateToTimestamp('오늘마감', baseDate);
      expect(new Date(todayTs!).getDate()).toBe(26);

      const tomorrowTs = parseClosingDateToTimestamp('내일마감', baseDate);
      expect(new Date(tomorrowTs!).getDate()).toBe(27);
    });

    it('상시채용, 채용시 마감 등 기한이 없는 공고는 null을 반환해야 한다', () => {
      expect(parseClosingDateToTimestamp('상시채용', baseDate)).toBeNull();
      expect(parseClosingDateToTimestamp('채용시 마감', baseDate)).toBeNull();
      expect(parseClosingDateToTimestamp('수시채용', baseDate)).toBeNull();
      expect(parseClosingDateToTimestamp('', baseDate)).toBeNull();
      expect(parseClosingDateToTimestamp(undefined, baseDate)).toBeNull();
    });
  });

  describe('calculateJobExpiration', () => {
    it('마감일이 주어진 경우 [공고 마감시각 + 30일]로 만료 시각을 계산해야 한다', () => {
      const closingStr = '2026-11-10';
      const baseTime = baseDate.getTime();
      const expiresAt = calculateJobExpiration(closingStr, baseTime);

      const closingTs = parseClosingDateToTimestamp(closingStr, baseDate)!;
      const expected = closingTs + (30 * 24 * 60 * 60 * 1000);
      expect(expiresAt).toBe(expected);
    });

    it('상시채용인 경우 [등록 시점 + 30일]로 만료 시각을 계산해야 한다', () => {
      const baseTime = baseDate.getTime();
      const expiresAt = calculateJobExpiration('상시채용', baseTime);

      const expected = baseTime + (EXPIRATION_CONFIG.DEFAULT_EXPIRATION_DAYS * EXPIRATION_CONFIG.MS_PER_DAY);
      expect(expiresAt).toBe(expected);
    });
  });

  describe('isJobExpired', () => {
    it('회사 차단 항목(type: company)은 만료 시각이 지났더라도 항상 false(영구 보존)여야 한다', () => {
      const item: BlockItem = {
        id: 'c1',
        pattern: '블랙기업',
        type: 'company',
        createdAt: 1000,
        expiresAt: 2000,
      };
      expect(isJobExpired(item, 3000)).toBe(false);
    });

    it('공고 차단 항목(type: job)은 현재 시각이 expiresAt을 초과하면 true를 반환해야 한다', () => {
      const item: BlockItem = {
        id: 'j1',
        pattern: '12345',
        type: 'job',
        createdAt: 1000,
        expiresAt: 5000,
      };
      expect(isJobExpired(item, 4999)).toBe(false);
      expect(isJobExpired(item, 5000)).toBe(true);
      expect(isJobExpired(item, 6000)).toBe(true);
    });
  });

  describe('formatDate', () => {
    it('타임스탬프를 YYYY.MM.DD 형식으로 포맷팅해야 한다', () => {
      const ts = new Date(2026, 11, 7).getTime(); // 2026-12-07
      expect(formatDate(ts)).toBe('2026.12.07');
    });
  });
});
