import { describe, it, expect } from 'vitest';
import {
  parseClosingDateToTimestamp,
  calculateJobExpiration,
  isJobExpired,
} from '../../src/utils/date';
import { BlockItem } from '../../src/types';

/**
 * 마감일 파싱 회귀 테스트
 *
 * 배경: 기존 구현은 연도 미표기(MM/DD) 마감일의 롤오버 조건이
 * 11~12월 → 1~2월(2개월 창)만 커버해서, 10월에 "~01/15" 나 12월에 "~03/15" 를
 * 과거로 계산했다. 그 결과 차단 등록 직후 expiresAt 이 과거가 되어
 * 자동 만료 정리로 즉시 삭제되는 버그가 있었다.
 */
describe('마감일 파싱 — 연도 롤오버 회귀 테스트', () => {
  it('연말(12월)에 등록한 3월 마감 공고는 다음 해로 계산되어야 한다 (과거로 계산 금지)', () => {
    const base = new Date(2026, 11, 1); // 2026-12-01
    const ts = parseClosingDateToTimestamp('~ 03/15(일)', base);
    expect(ts).not.toBeNull();
    const d = new Date(ts!);
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(2); // 3월
    expect(d.getDate()).toBe(15);
  });

  it('10월에 등록한 1월 마감 공고도 다음 해로 계산되어야 한다', () => {
    const base = new Date(2026, 9, 26); // 2026-10-26
    const ts = parseClosingDateToTimestamp('~ 01/15(목)', base);
    const d = new Date(ts!);
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(0);
  });

  it('연말에 등록한 공고의 expiresAt 이 과거가 되어 즉시 만료 판정되면 안 된다', () => {
    const base = new Date(2026, 11, 1);
    const expiresAt = calculateJobExpiration('~ 03/15(일)', base.getTime());
    const item: BlockItem = {
      id: 'j1',
      pattern: '12345',
      type: 'job',
      createdAt: base.getTime(),
      expiresAt,
    };
    // 등록 시점에 만료로 판정되면 안 된다 (기존 버그는 true 였음)
    expect(isJobExpired(item, base.getTime())).toBe(false);
    expect(expiresAt).toBeGreaterThan(base.getTime());
  });

  it('올해 안의 정상적인 미래 마감일은 그대로 유지되어야 한다', () => {
    const base = new Date(2026, 9, 26);
    const d = new Date(parseClosingDateToTimestamp('~ 11/07(토)', base)!);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(10);
  });

  it('12월 31일 마감은 1월 등록 시에도 같은 해로 계산되어야 한다', () => {
    const base = new Date(2026, 0, 5); // 2026-01-05
    const d = new Date(parseClosingDateToTimestamp('~ 12/31', base)!);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11);
  });
});

describe('마감일 파싱 — 표기 형식 회귀 테스트', () => {
  it('D-Day 가 명시적 날짜보다 우선 해석되면 안 된다', () => {
    const base = new Date(2026, 11, 5);
    const ts = parseClosingDateToTimestamp('~ 04/30(목) D-3', base);
    const d = new Date(ts!);
    // 실제 마감일(2027-04-30)이 채택되어야 하며, base+3일이 되면 안 된다
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(30);
  });

  it('공백이 포함된 날짜 표기를 파싱해야 한다', () => {
    const base = new Date(2026, 9, 26);
    const ts = parseClosingDateToTimestamp('마감 2026. 11. 7', base);
    expect(ts).not.toBeNull();
    const d = new Date(ts!);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(10);
    expect(d.getDate()).toBe(7);
  });

  it('"채용시" 문구가 있어도 날짜가 함께 있으면 날짜를 우선해야 한다', () => {
    const base = new Date(2026, 9, 26);
    const ts = parseClosingDateToTimestamp('채용시 마감 (~11/20)', base);
    expect(ts).not.toBeNull();
    expect(new Date(ts!).getMonth()).toBe(10);
    expect(new Date(ts!).getDate()).toBe(20);
  });

  it('기간 표기(11.07~11.20)는 종료일을 마감일로 채택해야 한다', () => {
    const base = new Date(2026, 9, 26);
    const ts = parseClosingDateToTimestamp('11.07~11.20', base);
    const d = new Date(ts!);
    expect(d.getMonth()).toBe(10);
    expect(d.getDate()).toBe(20);
  });

  it('날짜가 전혀 없는 기존 포맷은 그대로 동작해야 한다', () => {
    const base = new Date(2026, 9, 26);
    expect(parseClosingDateToTimestamp('상시채용', base)).toBeNull();
    expect(parseClosingDateToTimestamp('수시채용', base)).toBeNull();
    expect(new Date(parseClosingDateToTimestamp('D-3', base)!).getDate()).toBe(29);
    expect(new Date(parseClosingDateToTimestamp('2026-11-20', base)!).getMonth()).toBe(10);
  });
});
