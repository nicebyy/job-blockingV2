import { describe, it, expect } from 'vitest';
import { FilterEngine } from '../../src/core/filter-engine';
import { DEFAULT_SETTINGS, FilterSettings, JobCardInfo } from '../../src/types';

/**
 * 회사명 매칭 정책 회귀 테스트
 *
 * 배경: 기존 구현은 정규화 후 무조건 부분일치(includes)로 비교해서
 * '카카오' 를 차단하면 '카카오뱅크', '카카오페이', '카카오엔터프라이즈' 까지
 * 전부 차단되는 과차단 문제가 있었다.
 * 이제 기본값은 정확 일치(exact)이며, 계열사 일괄 차단이 필요한 사용자는
 * companyMatchMode: 'contains' 로 명시적으로 선택할 수 있다.
 */
function evaluate(
  settings: Partial<FilterSettings>,
  blockPattern: string,
  cardCompany: string
): boolean {
  const engine = new FilterEngine(
    { ...DEFAULT_SETTINGS, hideAds: false, ...settings },
    [{ id: 'b1', pattern: blockPattern, type: 'company', createdAt: 0 }]
  );
  const card: JobCardInfo = {
    cardElement: {} as HTMLElement,
    companyName: cardCompany,
    title: '백엔드 개발자',
    isAd: false,
  };
  return engine.evaluateJobCard(card).shouldFilter;
}

describe('회사명 매칭 — exact 모드 (기본값)', () => {
  it('정확히 일치하는 회사만 차단해야 한다', () => {
    expect(evaluate({ companyMatchMode: 'exact' }, '카카오', '카카오')).toBe(true);
    expect(evaluate({ companyMatchMode: 'exact' }, '삼성전자', '삼성전자')).toBe(true);
    expect(evaluate({ companyMatchMode: 'exact' }, '카카오뱅크', '카카오뱅크')).toBe(true);
  });

  it('계열사/다른 회사는 차단하지 않아야 한다 (과차단 방지)', () => {
    expect(evaluate({ companyMatchMode: 'exact' }, '카카오', '카카오뱅크')).toBe(false);
    expect(evaluate({ companyMatchMode: 'exact' }, '카카오', '카카오페이')).toBe(false);
    expect(evaluate({ companyMatchMode: 'exact' }, '카카오', '카카오엔터프라이즈')).toBe(false);
    expect(evaluate({ companyMatchMode: 'exact' }, '카카오', '카카오모빌리티')).toBe(false);
    expect(evaluate({ companyMatchMode: 'exact' }, 'SG', 'SGA솔루션즈')).toBe(false);
    expect(evaluate({ companyMatchMode: 'exact' }, 'GS', 'GS건설')).toBe(false);
  });

  it('법인 표기 차이((주), 주식회사, 공백)는 여전히 동일 회사로 인식해야 한다', () => {
    expect(evaluate({ companyMatchMode: 'exact' }, '(주)카카오', '카카오')).toBe(true);
    expect(evaluate({ companyMatchMode: 'exact' }, '주식회사 카카오', '카카오')).toBe(true);
    expect(evaluate({ companyMatchMode: 'exact' }, '카카오', '(주)카카오')).toBe(true);
    expect(evaluate({ companyMatchMode: 'exact' }, '카카오', '카카오 ')).toBe(true);
  });

  it('companyMatchMode 를 지정하지 않으면 exact 로 동작해야 한다 (구버전 설정 호환)', () => {
    expect(evaluate({}, '카카오', '카카오')).toBe(true);
    expect(evaluate({}, '카카오', '카카오뱅크')).toBe(false);
  });
});

describe('회사명 매칭 — contains 모드 (계열사 일괄 차단)', () => {
  it('패턴이 회사명에 포함되면 차단해야 한다', () => {
    expect(evaluate({ companyMatchMode: 'contains' }, '카카오', '카카오')).toBe(true);
    expect(evaluate({ companyMatchMode: 'contains' }, '카카오', '카카오뱅크')).toBe(true);
    expect(evaluate({ companyMatchMode: 'contains' }, '카카오', '카카오페이')).toBe(true);
  });

  it('반대 방향(카드가 패턴의 부분집합)은 차단하지 않아야 한다', () => {
    // '카카오' 카드가 '카카오뱅크' 패턴에 포함되지 않으므로 미차단
    expect(evaluate({ companyMatchMode: 'contains' }, '카카오뱅크', '카카오')).toBe(false);
  });
});
