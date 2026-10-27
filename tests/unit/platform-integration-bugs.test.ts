/**
 * 통합 테스트에서 발견된 실제 버그 (재현 테스트)
 *
 * 이 파일은 "현재 코드가 틀렸음"을 고정하는 회귀 테스트가 아니라,
 * 리뷰/통합 테스트 과정에서 발견한 **미해결 결함을 문서화**하는 목적이다.
 *
 * 정책:
 *  - 이미 알려진 결함은 `it.fails` 로 표시하여, 수정되는 순간 테스트가 깨져
 *    "이제 고쳐졌으니 이 항목을 갱신하라"는 신호를 준다.
 *  - 절대 통과를 위해 기대값을 낮추지 않는다. 실제 사용자 영향도를 기준으로 단언한다.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AdapterRegistry } from '../../src/adapters';
import { RememberAdapter } from '../../src/adapters/remember';
import { WantedAdapter } from '../../src/adapters/wanted';
import { WANTED_SELECTORS } from '../../src/constants';

describe('[BUG-1] 리멤버(Remember) 목록 셀렉터가 실제 DOM 과 불일치', () => {
  /**
   * 발견 경위:
   *  tests/fixtures/remember_postings.html 에는 공고 목록 카드가 존재하지만,
   *  REMEMBER_SELECTORS.JOB_CARDS 가 기대하는 styled-components 클래스
   *  (sc-364cfa5d-0 등)가 실제 HTML 에 하나도 없다. 리멤버가 배포하면서
   *  styled-components 해시가 변경되었기 때문이다.
   *
   * 영향:
   *  - 목록에서 회사 차단/공고 숨김/평점 뱃지가 전혀 동작하지 않는다.
   *  - href 기반 폴백(`a[href*="/job/posting/"]`)이 일부 커버하지만,
   *    픽스처 기준 매칭되는 링크가 2개뿐이고 그마저 카드 컨테이너로 승격되지 않아
   *    parseCard() 가 null 을 반환한다.
   */
  const fixture = path.resolve(__dirname, '../fixtures/remember_postings.html');

  const loadRemember = () => {
    const html = fs
      .readFileSync(fixture, 'utf-8')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    document.body.innerHTML = html;
  };

  it('선택자 기대 클래스가 실제 HTML 에 존재하지 않음을 확인한다 (회귀 감지용)', () => {
    loadRemember();
    const expectedHashes = ['sc-364cfa5d-0', 'sc-18344c98-0', 'sc-d2fb7cfc-0', 'sc-3c9cd5df-0', 'sc-289d3ccd-0'];

    const present = expectedHashes.filter((cls) => document.querySelector(`[class*="${cls}"]`) !== null);
    // 현재는 0개 — 리멤버 DOM 구조가 바뀌었다는 증거
    expect(present.length).toBeLessThan(expectedHashes.length);

    // 어떤 해시가 실제로 쓰이는지 기록 (수정 시 참고)
    const actualHashes = new Set<string>();
    document.querySelectorAll('li[class*="sc-"]').forEach((el) => {
      const m = /sc-[0-9a-f]{8}/.exec(el.className);
      if (m) actualHashes.add(m[0]);
    });
    expect(actualHashes.size).toBeGreaterThan(0);
  });

  it.fails('리멤버 목록에서 공고 카드가 파싱되어야 한다 (현재 실패 = 미해결 결함)', () => {
    loadRemember();
    const adapter = new RememberAdapter();

    const cards = adapter.getJobCardElements(document);
    const parsed = cards
      .map((c) => adapter.parseCard(c))
      .filter((p): p is NonNullable<typeof p> => p !== null);

    // 기대: 목록 페이지이므로 복수 개의 카드가 파싱되어야 한다
    expect(parsed.length).toBeGreaterThan(1);

    // 기대: 회사명이 채워져야 한다
    const withCompany = parsed.filter((p) => p.companyName && p.companyName.trim().length > 0);
    expect(withCompany.length).toBeGreaterThan(0);
  });
});

describe('[BUG-2] 원티드(Wanted) 마감일 추출이 지역·경력 텍스트를 반환', () => {
  /**
   * 발견 경위:
   *  WANTED_SELECTORS.CLOSING_DATE 의 첫 번째 셀렉터가
   *  `span[class*="CompanyNameWithLocationPeriod__location"]` 인데,
   *  실제 원티드에서 이 클래스는 "서울 서초구 · 경력 4-8년" 같은
   *  **지역/경력 정보**를 담는다. 마감일이 아니다.
   *
   * 영향:
   *  parseCard() 의 closingDate 에 잘못된 값이 들어가고,
   *  calculateJobExpiration() 이 이를 파싱하지 못해(→ null)
   *  "등록 시점 + 30일" 기본 만료로 처리된다.
   *  즉 마감일 기반 TTL 자동 정리가 사실상 동작하지 않는다.
   *  (기능이 조용히 degrade 되는 유형이라 사용자가 인지하기 어렵다)
   */
  const fixture = path.resolve(__dirname, '../fixtures/wanted_wdlist.html');

  const loadWanted = () => {
    const html = fs
      .readFileSync(fixture, 'utf-8')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    document.body.innerHTML = html;
  };

  it('CLOSING_DATE 셀렉터가 지역/경력 텍스트를 매칭함을 확인한다 (회귀 감지용)', () => {
    loadWanted();
    const matched = Array.from(document.querySelectorAll(WANTED_SELECTORS.CLOSING_DATE));

    expect(matched.length).toBeGreaterThan(0);

    // 매칭된 텍스트가 실제 "마감일" 형태인지 검사
    // 정상적인 마감일: "~ 11/07(토)", "D-3", "2026-11-20", "상시채용" 등
    const looksLikeDeadline = (text: string) =>
      /(D-\d+|상시|채용시|~\s*\d{1,2}[./]\d{1,2}|\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[./]\d{1,2})/.test(text);

    const deadlineLike = matched.filter((el) => looksLikeDeadline(el.textContent?.trim() ?? ''));
    // 현재는 대부분 지역/경력 텍스트라 마감일 형태가 아니다
    expect(deadlineLike.length).toBeLessThan(matched.length);
  });

  it.fails(
    'parseCard 의 closingDate 는 지역·경력 텍스트가 아닌 실제 마감일이어야 한다 (현재 실패 = 미해결)',
    () => {
      loadWanted();
      const adapter = new WantedAdapter();
      const cards = adapter.getJobCardElements(document);
      const parsed = cards
        .map((c) => adapter.parseCard(c))
        .filter((p): p is NonNullable<typeof p> => p !== null);

      const withDate = parsed.filter((p) => p.closingDate && p.closingDate.trim().length > 0);
      expect(withDate.length).toBeGreaterThan(0);

      // 기대: closingDate 가 "서울 서초구 · 경력 4-8년" 같은 지역/경력 텍스트면 안 된다
      for (const p of withDate) {
        expect(p.closingDate).not.toMatch(/경력|서울|경기|부산|대구|인천|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주/);
      }
    }
  );
});

describe('[BUG-3] 통합 테스트에서 확인된 플랫폼별 실제 동작 요약', () => {
  it('플랫폼별 카드 추출/파싱 현황을 기록한다', () => {
    const fixtures = [
      { name: 'Wanted', file: 'wanted_wdlist.html', url: 'https://www.wanted.co.kr/wdlist/518/872' },
      { name: 'Saramin', file: 'saramin_search.html', url: 'https://www.saramin.co.kr/zf_user/search/recruit?searchword=x' },
      { name: 'JobKorea', file: 'jobkorea_joblist.html', url: 'https://www.jobkorea.co.kr/recruit/joblist' },
      { name: 'Remember', file: 'remember_postings.html', url: 'https://career.rememberapp.co.kr/job/list' },
      { name: 'Jumpit', file: 'jumpit_positions.html', url: 'https://jumpit.saramin.co.kr/positions' },
    ];

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const report: Record<string, { cards: number; parsed: number }> = {};

    for (const f of fixtures) {
      const p = path.resolve(__dirname, '../fixtures', f.file);
      if (!fs.existsSync(p)) continue;
      document.body.innerHTML = fs.readFileSync(p, 'utf-8').replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      const adapter = AdapterRegistry.getAdapterForUrl(f.url);
      if (!adapter) continue;
      const cards = adapter.getJobCardElements(document);
      const parsed = cards.map((c: HTMLElement) => adapter.parseCard(c)).filter(Boolean);
      report[f.name] = { cards: cards.length, parsed: parsed.length };
      document.body.innerHTML = '';
    }

    // 모든 플랫폼이 최소한 카드 추출은 성공해야 한다 (Remember 는 현재 1개)
    for (const [name, r] of Object.entries(report)) {
      expect(r.cards, `${name}: 카드 추출 실패`).toBeGreaterThan(0);
    }

    // Wanted/Saramin/JobKorea/Jumpit 은 파싱도 성공해야 한다
    for (const name of ['Wanted', 'Saramin', 'JobKorea', 'Jumpit']) {
      if (!report[name]) continue;
      expect(report[name].parsed, `${name}: 파싱 실패`).toBeGreaterThan(0);
    }
  });
});
