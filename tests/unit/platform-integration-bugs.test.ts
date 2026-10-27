/**
 * 통합 테스트에서 발견된 결함 (재현 테스트)
 *
 * 정책:
 *  - 미해결 결함은 `it.fails` 로 표시한다. 수정되는 순간 테스트가 실패하며
 *    "이제 고쳐졌으니 이 항목을 갱신하라"는 신호를 준다.
 *  - 절대 통과를 위해 기대값을 낮추지 않는다. 실제 사용자 영향도를 기준으로 단언한다.
 *
 * [정정 이력]
 *  2026-10-27: 초기 작성 시 "리멤버 목록 셀렉터 불일치(BUG-1)" 를 High 로 보고했으나,
 *              원인은 코드가 아니라 **테스트 픽스처**였다. 기존
 *              tests/fixtures/remember_postings.html 은 Next.js 하이드레이션 직후의
 *              스켈레톤 로딩 상태를 캡처한 것이라 실제 공고 카드가 없었다.
 *              실제 브라우저로 렌더링 완료 후 덤프한 DOM 에서는
 *              91개 카드 중 90개가 정상 파싱되며, 코드가 기대하는 styled-components
 *              해시(sc-3c9cd5df, sc-364cfa5d, sc-289d3ccd)도 정상 존재한다.
 *              => BUG-1 은 오진이었으므로 철회한다.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { RememberAdapter } from '../../src/adapters/remember';
import { WantedAdapter } from '../../src/adapters/wanted';
import { WANTED_SELECTORS, EXPIRATION_CONFIG } from '../../src/constants';
import { calculateJobExpiration } from '../../src/utils/date';

describe('[회귀] 리멤버 렌더링 DOM 이 정상 파싱되어야 한다 (과거 오진 정정)', () => {
  const fixture = path.resolve(__dirname, '../fixtures/remember_postings_rendered.html');

  const load = () => {
    const html = fs
      .readFileSync(fixture, 'utf-8')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    document.body.innerHTML = html;
  };

  it('실제 렌더링 DOM 에서 공고 카드가 다수 추출되어야 한다', () => {
    load();
    const adapter = new RememberAdapter();
    const cards = adapter.getJobCardElements(document);
    expect(cards.length).toBeGreaterThan(10);
  });

  it('파싱 성공률이 높아야 한다 (회사명/제목/jobId)', () => {
    load();
    const adapter = new RememberAdapter();
    const cards = adapter.getJobCardElements(document);
    const parsed = cards
      .map((c) => adapter.parseCard(c))
      .filter((p): p is NonNullable<typeof p> => p !== null);

    expect(parsed.length).toBeGreaterThan(10);

    const withCompany = parsed.filter((p) => p.companyName && p.companyName.trim().length > 0);
    const withTitle = parsed.filter((p) => p.title && p.title.trim().length > 0);
    const withJobId = parsed.filter((p) => p.jobId && String(p.jobId).trim().length > 0);

    expect(withCompany.length).toBeGreaterThan(10);
    expect(withTitle.length).toBeGreaterThan(10);
    expect(withJobId.length).toBeGreaterThan(10);
  });

  it('코드가 기대하는 styled-components 해시 클래스가 실제로 존재해야 한다', () => {
    load();
    // 과거 "해시가 바뀌어 셀렉터가 죽었다"는 오진을 반증하는 검증
    const expectedHashes = ['sc-3c9cd5df', 'sc-364cfa5d', 'sc-289d3ccd'];
    const present = expectedHashes.filter(
      (cls) => document.querySelector(`[class*="${cls}"]`) !== null
    );
    expect(present.length).toBeGreaterThanOrEqual(2);
  });

  it('스켈레톤 상태 픽스처와 렌더링 완료 픽스처를 구분할 수 있어야 한다', () => {
    // 기존 픽스처(스켈레톤)에는 실제 카드가 없다는 사실을 문서화
    const skeleton = fs.readFileSync(
      path.resolve(__dirname, '../fixtures/remember_postings.html'),
      'utf-8'
    );
    document.body.innerHTML = skeleton.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      ''
    );

    const skeletonAdapter = new RememberAdapter();
    const skeletonCards = skeletonAdapter.getJobCardElements(document);
    const skeletonParsed = skeletonCards
      .map((c) => skeletonAdapter.parseCard(c))
      .filter(Boolean);

    // 스켈레톤은 카드가 거의 없고 파싱도 실패한다 (이것이 과거 오진의 원인)
    expect(skeletonParsed.length).toBeLessThanOrEqual(1);
  });
});

describe('[BUG-2] 원티드 마감일 추출이 지역·경력 텍스트를 반환 (미해결)', () => {
  /**
   * 발견 경위:
   *  WANTED_SELECTORS.CLOSING_DATE 의 첫 번째 셀렉터가
   *  `span[class*="CompanyNameWithLocationPeriod__location"]` 인데,
   *  실제 렌더링된 원티드 DOM 에서 이 클래스는 "서울 서초구 · 경력 4-8년" 같은
   *  **지역/경력 정보**를 담는다. 마감일이 아니다.
   *
   *  실측(렌더링 완료 DOM): 카드 60개 전부 closingDate 가 지역/경력 텍스트.
   *  원티드는 목록 카드에 마감일을 표시하지 않고 상세페이지에서만 노출한다.
   *  즉 이 셀렉터는 애초에 마감일 소스가 될 수 없다.
   *
   * 영향:
   *  calculateJobExpiration() 이 이 문자열을 파싱하지 못해 null -> "등록 시점 + 30일"
   *  기본 만료가 적용된다. 원티드에서 마감일 기반 TTL 자동 정리가 동작하지 않는다.
   *  다만 이는 "숨긴 공고가 마감 후 30일 뒤 자동 정리되는" 부가 기능이며,
   *  핵심 필터링(숨김/차단) 동작에는 영향이 없다.
   */
  const fixture = path.resolve(__dirname, '../fixtures/wanted_wdlist_rendered.html');

  const load = () => {
    const html = fs
      .readFileSync(fixture, 'utf-8')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    document.body.innerHTML = html;
  };

  it('CLOSING_DATE 셀렉터가 비어 있어야 한다 (지역/경력 텍스트를 마감일로 오인하지 않음)', () => {
    // 원티드는 목록/상세 모두 마감일을 노출하지 않으므로 마감일 셀렉터가 없어야 한다.
    expect(WANTED_SELECTORS.CLOSING_DATE).toBe('');
  });

  it('parseCard 의 closingDate 가 지역·경력 텍스트를 담지 않아야 한다 (수정 완료)', () => {
    load();
    const adapter = new WantedAdapter();
    const cards = adapter.getJobCardElements(document);
    const parsed = cards
      .map((c) => adapter.parseCard(c))
      .filter((p): p is NonNullable<typeof p> => p !== null);

    // 마감일이 없는 사이트이므로 closingDate 는 비어 있어야 한다
    const withDate = parsed.filter((p) => p.closingDate && p.closingDate.trim().length > 0);
    expect(withDate).toHaveLength(0);

    // 어떤 경우에도 지역/경력 텍스트가 마감일로 들어가면 안 된다
    for (const p of parsed) {
      if (!p.closingDate) continue;
      expect(p.closingDate).not.toMatch(
        /경력|신입|서울|경기|부산|대구|인천|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주/
      );
    }
  });

  it('마감일이 없으므로 TTL 은 기본 30일로 계산되어야 한다', () => {
    load();
    const adapter = new WantedAdapter();
    const cards = adapter.getJobCardElements(document);
    const first = adapter.parseCard(cards[0])!;

    const baseTime = Date.now();
    const expiresAt = calculateJobExpiration(first.closingDate, baseTime);
    const expected = baseTime + EXPIRATION_CONFIG.DEFAULT_EXPIRATION_DAYS * EXPIRATION_CONFIG.MS_PER_DAY;

    // 기본 30일 TTL 이 적용되어야 한다 (지역/경력 텍스트로 인한 조기/부정확 만료 방지)
    expect(expiresAt).toBe(expected);
  });
});
