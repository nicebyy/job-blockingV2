import { describe, it, expect } from 'vitest';
import {
  WantedAdapter,
  SaraminAdapter,
  JobKoreaAdapter,
  RememberAdapter,
  JumpitAdapter,
} from '../../src/adapters';

/**
 * 상세페이지 판정 회귀 테스트
 *
 * 배경: README 는 5개 플랫폼 모두에서 "상세페이지 스마트 이탈 가드"를 지원한다고
 * 광고했지만, 실제로는 wanted/saramin 어댑터에 isDetailPage 오버라이드가 없어
 * base 의 `return false` 를 상속 → 상세페이지에서 차단해도 목록 복귀/탭 종료가
 * 전혀 동작하지 않았다.
 */
describe('상세페이지 판정 — wanted', () => {
  const adapter = new WantedAdapter();

  it('공고 상세 URL(/wd/숫자)을 상세페이지로 판정해야 한다', () => {
    expect(adapter.isDetailPage('https://www.wanted.co.kr/wd/12345')).toBe(true);
    expect(adapter.isDetailPage('https://www.wanted.co.kr/wd/1')).toBe(true);
  });

  it('목록/검색 페이지는 상세페이지가 아니어야 한다', () => {
    expect(adapter.isDetailPage('https://www.wanted.co.kr/wdlist/518/872')).toBe(false);
    expect(adapter.isDetailPage('https://www.wanted.co.kr/search?query=개발')).toBe(false);
    expect(adapter.isDetailPage('https://www.wanted.co.kr/')).toBe(false);
  });
});

describe('상세페이지 판정 — saramin', () => {
  const adapter = new SaraminAdapter();

  it('공고 상세 URL(/zf_user/jobs/view?rec_idx=)을 상세페이지로 판정해야 한다', () => {
    expect(
      adapter.isDetailPage('https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=55351925')
    ).toBe(true);
  });

  it('릴레이 뷰도 상세페이지로 판정해야 한다', () => {
    expect(
      adapter.isDetailPage('https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=55351925')
    ).toBe(true);
  });

  it('검색/목록 페이지는 상세페이지가 아니어야 한다 (rec_idx 가 붙어도)', () => {
    expect(
      adapter.isDetailPage('https://www.saramin.co.kr/zf_user/search/recruit?searchword=개발')
    ).toBe(false);
    expect(
      adapter.isDetailPage('https://www.saramin.co.kr/zf_user/jobs/list/domestic?page=1')
    ).toBe(false);
    expect(
      adapter.isDetailPage('https://www.saramin.co.kr/zf_user/jobs/list/job-category?cat_mcls=2')
    ).toBe(false);
  });
});

describe('상세페이지 판정 — 기존 3개 플랫폼 회귀 방지', () => {
  it('jobkorea 는 /recruit/gi_read/ 를 상세로 판정해야 한다', () => {
    const adapter = new JobKoreaAdapter();
    expect(adapter.isDetailPage('https://www.jobkorea.co.kr/Recruit/GI_Read/43000000')).toBe(true);
    expect(adapter.isDetailPage('https://www.jobkorea.co.kr/recruit/joblist')).toBe(false);
  });

  it('remember 는 /job/posting/숫자 를 상세로 판정해야 한다', () => {
    const adapter = new RememberAdapter();
    expect(adapter.isDetailPage('https://career.rememberapp.co.kr/job/posting/12345')).toBe(true);
    expect(adapter.isDetailPage('https://career.rememberapp.co.kr/job/postings/12345')).toBe(true);
    expect(adapter.isDetailPage('https://career.rememberapp.co.kr/job/list')).toBe(false);
  });

  it('jumpit 은 /position/숫자 를 상세로 판정해야 한다', () => {
    const adapter = new JumpitAdapter();
    expect(adapter.isDetailPage('https://jumpit.saramin.co.kr/position/55185963')).toBe(true);
    expect(adapter.isDetailPage('https://jumpit.saramin.co.kr/positions?sort=popular')).toBe(false);
  });
});
