import { describe, it, expect } from 'vitest';
import { FilterEngine, normalizeKeywordText } from '../../src/core/filter-engine';
import { DEFAULT_SETTINGS, BlockItem, FilterSettings, JobCardInfo, JobPlatform } from '../../src/types';

/**
 * 필터 엔진 개선 5건 회귀 테스트
 *
 * 1) 성능: 카드 판정이 O(n) 선형 스캔 → 인덱스 조회(O(1))
 * 2) 키워드가 제목뿐 아니라 회사명에도 적용
 * 3) jobId 플랫폼 격리 (다른 사이트 동일 번호 오차단 방지)
 * 4) 키워드 공백 정규화 (연속 공백 미탐 수정)
 * 5) 만료된 job 차단 항목은 판정에서 제외
 */

const card = (over: Partial<JobCardInfo> = {}): JobCardInfo => ({
  cardElement: document.createElement('div'),
  companyName: '일반회사',
  title: '백엔드 개발자 채용',
  isAd: false,
  ...over,
});

const company = (pattern: string, extra: Partial<BlockItem> = {}): BlockItem => ({
  id: `c_${pattern}`,
  pattern,
  type: 'company',
  createdAt: 0,
  ...extra,
});

const keyword = (pattern: string): BlockItem => ({
  id: `k_${pattern}`,
  pattern,
  type: 'keyword',
  createdAt: 0,
});

const job = (pattern: string, extra: Partial<BlockItem> = {}): BlockItem => ({
  id: `j_${pattern}`,
  pattern,
  type: 'job',
  createdAt: 0,
  ...extra,
});

const engineWith = (
  items: BlockItem[],
  settings: Partial<FilterSettings> = {},
  platform: JobPlatform | null = null
) =>
  new FilterEngine(
    { ...DEFAULT_SETTINGS, hideAds: false, ...settings } as FilterSettings,
    items,
    platform
  );

describe('#1 성능 — 인덱스 기반 판정', () => {
  it('목록이 커져도 카드 판정 비용이 선형으로 폭증하지 않아야 한다', () => {
    const make = (n: number) =>
      Array.from({ length: n }, (_, i) => company(`테스트회사${i}`, { id: `c${i}` }));

    const measure = (n: number): number => {
      const engine = engineWith(make(n));
      const samples = Array.from({ length: 60 }, (_, i) => card({ companyName: `조회회사${i}` }));

      // 워밍업
      for (const s of samples) engine.evaluateJobCard(s);

      const t0 = performance.now();
      const ROUNDS = 20;
      for (let r = 0; r < ROUNDS; r++) {
        for (const s of samples) engine.evaluateJobCard(s);
      }
      return (performance.now() - t0) / ROUNDS;
    };

    const small = measure(100);
    const large = measure(5000);

    // 선형 스캔이었다면 5000/100 = 50배 느려진다.
    // 인덱스 조회는 목록 크기와 무관하므로 여유 있게 5배 미만을 요구한다.
    console.log(`[PERF] 100건=${small.toFixed(2)}ms/60카드, 5000건=${large.toFixed(2)}ms/60카드`);
    expect(large).toBeLessThan(Math.max(small * 5, 5));
  });

  it('5,000건 목록 60카드 스캔이 20ms 이내여야 한다', () => {
    const engine = engineWith(
      Array.from({ length: 5000 }, (_, i) => company(`회사${i}`, { id: `c${i}` }))
    );
    const cards = Array.from({ length: 60 }, (_, i) => card({ companyName: `없는회사${i}` }));

    const t0 = performance.now();
    for (const c of cards) engine.evaluateJobCard(c);
    const elapsed = performance.now() - t0;

    console.log(`[PERF] 5000건 × 60카드 = ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(20);
  });
});

describe('#2 키워드가 회사명에도 적용되어야 한다', () => {
  it('키워드가 회사명에 포함되어도 차단해야 한다', () => {
    const engine = engineWith([keyword('카카오')]);

    // 제목에는 없고 회사명에만 있는 경우
    const result = engine.evaluateJobCard(
      card({ companyName: '카카오', title: '백엔드 개발자' })
    );
    expect(result.shouldFilter).toBe(true);
    expect(result.matchedItem?.type).toBe('keyword');
  });

  it('키워드가 제목에 있는 기존 동작은 그대로 유지되어야 한다', () => {
    const engine = engineWith([keyword('파견직')]);
    const result = engine.evaluateJobCard(
      card({ companyName: '좋은회사', title: '[파견직] 개발자 모집' })
    );
    expect(result.shouldFilter).toBe(true);
  });

  it('키워드가 회사명/제목 어디에도 없으면 차단하지 않아야 한다', () => {
    const engine = engineWith([keyword('헤드헌팅')]);
    const result = engine.evaluateJobCard(
      card({ companyName: '정상회사', title: '백엔드 개발자' })
    );
    expect(result.shouldFilter).toBe(false);
  });
});

describe('#3 jobId 플랫폼 격리', () => {
  it('다른 플랫폼에서 차단한 jobId 는 현재 사이트에 적용되지 않아야 한다', () => {
    // 잡코리아에서 차단한 50246930
    const engine = engineWith([job('50246930', { platform: 'jobkorea' })], {}, 'saramin');

    // 사람인 페이지에서 우연히 같은 번호를 가진 공고
    const result = engine.evaluateJobCard(
      card({ companyName: '다른회사', title: '다른공고', jobId: '50246930' })
    );
    expect(result.shouldFilter).toBe(false);
  });

  it('같은 플랫폼의 jobId 는 정상 차단되어야 한다', () => {
    const engine = engineWith([job('50246930', { platform: 'jobkorea' })], {}, 'jobkorea');
    const result = engine.evaluateJobCard(
      card({ companyName: '회사', title: '공고', jobId: '50246930' })
    );
    expect(result.shouldFilter).toBe(true);
  });

  it('platform 이 custom(직접 등록)이거나 없으면 모든 사이트에 적용되어야 한다', () => {
    for (const platform of [undefined, 'custom'] as const) {
      const engine = engineWith(
        [job('11111', platform ? { platform } : {})],
        {},
        'wanted'
      );
      expect(engine.evaluateJobCard(card({ jobId: '11111' })).shouldFilter).toBe(true);
    }
  });

  it('현재 플랫폼을 모르는 경우(테스트/미지원)에는 기존처럼 동작해야 한다', () => {
    const engine = engineWith([job('99999', { platform: 'jobkorea' })], {}, null);
    expect(engine.evaluateJobCard(card({ jobId: '99999' })).shouldFilter).toBe(true);
  });

  it('updatePlatform 으로 SPA 전환 시 격리 기준이 갱신되어야 한다', () => {
    const engine = engineWith([job('50246930', { platform: 'jobkorea' })], {}, 'jobkorea');
    expect(engine.evaluateJobCard(card({ jobId: '50246930' })).shouldFilter).toBe(true);

    // 다른 사이트로 이동
    engine.updatePlatform('jumpit');
    expect(engine.evaluateJobCard(card({ jobId: '50246930' })).shouldFilter).toBe(false);
  });

  it('회사 차단은 플랫폼과 무관하게 적용되어야 한다 (의도된 동작)', () => {
    const engine = engineWith([company('카카오', { platform: 'jobkorea' })], {}, 'saramin');
    expect(engine.evaluateJobCard(card({ companyName: '카카오' })).shouldFilter).toBe(true);
  });
});

describe('#4 키워드 공백 정규화', () => {
  it('연속 공백이 있는 키워드도 정상 매칭되어야 한다', () => {
    const engine = engineWith([keyword('백엔드  개발자')]); // 공백 2개
    const result = engine.evaluateJobCard(
      card({ title: '백엔드 개발자 채용' }) // 공백 1개
    );
    expect(result.shouldFilter).toBe(true);
  });

  it('전각 공백/탭/NBSP 도 동일하게 정규화되어야 한다', () => {
    const engine = engineWith([keyword('데이터\u00A0엔지니어')]);
    expect(
      engine.evaluateJobCard(card({ title: '데이터 엔지니어 채용' })).shouldFilter
    ).toBe(true);
  });

  it('normalizeKeywordText 단위 동작', () => {
    expect(normalizeKeywordText('  백엔드   개발자  ')).toBe('백엔드 개발자');
    expect(normalizeKeywordText('A\t\tB')).toBe('a b');
    expect(normalizeKeywordText('A\u3000B')).toBe('a b');
    expect(normalizeKeywordText('')).toBe('');
  });

  it('공백만 있는 키워드는 어떤 공고도 차단하지 않아야 한다', () => {
    const engine = engineWith([keyword('   ')]);
    expect(engine.evaluateJobCard(card({ title: '아무 공고' })).shouldFilter).toBe(false);
  });
});

describe('#5 만료된 job 항목은 판정에서 제외', () => {
  it('만료된 공고 차단 항목은 매칭되지 않아야 한다', () => {
    const expired = job('50246930', {
      title: '만료공고',
      companyName: '회사',
      expiresAt: Date.now() - 86400000, // 1일 전 만료
    });
    const engine = engineWith([expired]);

    expect(engine.evaluateJobCard(card({ jobId: '50246930' })).shouldFilter).toBe(false);
  });

  it('아직 만료되지 않은 공고 차단 항목은 정상 매칭되어야 한다', () => {
    const active = job('50246930', {
      title: '유효공고',
      companyName: '회사',
      expiresAt: Date.now() + 86400000,
    });
    const engine = engineWith([active]);

    expect(engine.evaluateJobCard(card({ jobId: '50246930' })).shouldFilter).toBe(true);
  });

  it('만료 항목과 유효 항목이 섞여 있어도 유효한 것만 적용되어야 한다', () => {
    const engine = engineWith([
      job('11111', { expiresAt: Date.now() - 1000 }), // 만료
      job('22222', { expiresAt: Date.now() + 100000 }), // 유효
      company('활성회사'), // 회사는 만료 없음
    ]);

    expect(engine.evaluateJobCard(card({ jobId: '11111' })).shouldFilter).toBe(false);
    expect(engine.evaluateJobCard(card({ jobId: '22222' })).shouldFilter).toBe(true);
    expect(engine.evaluateJobCard(card({ companyName: '활성회사' })).shouldFilter).toBe(true);
  });

  it('만료된 항목은 회사/키워드 차단에는 영향을 주지 않아야 한다', () => {
    // expiresAt 은 job 에만 의미가 있다
    const engine = engineWith([
      company('만료된회사', { expiresAt: Date.now() - 1000 }),
    ]);
    expect(engine.evaluateJobCard(card({ companyName: '만료된회사' })).shouldFilter).toBe(true);
  });
});

describe('기존 동작 보존 — 여러 유형 동시 매칭 시 blockList 순서', () => {
  it('여러 항목이 매칭되면 blockList 에서 가장 앞선 항목이 matchedItem 이 되어야 한다', () => {
    const engine = engineWith([
      company('카카오'), // idx 0
      keyword('개발자'), // idx 1
    ]);

    const result = engine.evaluateJobCard(
      card({ companyName: '카카오', title: '개발자 채용' })
    );
    expect(result.shouldFilter).toBe(true);
    expect(result.matchedItem?.type).toBe('company');
    expect(result.matchedItem?.pattern).toBe('카카오');
  });

  it('키워드가 앞서면 키워드가 채택되어야 한다', () => {
    const engine = engineWith([
      keyword('개발자'), // idx 0
      company('카카오'), // idx 1
    ]);

    const result = engine.evaluateJobCard(
      card({ companyName: '카카오', title: '개발자 채용' })
    );
    expect(result.matchedItem?.type).toBe('keyword');
  });

  it('job 매칭이 회사/키워드보다 우선한다 (기존 동작)', () => {
    const engine = engineWith([
      company('카카오'), // idx 0
      job('12345', { title: '개발자', companyName: '카카오' }), // idx 1
    ]);

    const result = engine.evaluateJobCard(
      card({ companyName: '카카오', title: '개발자', jobId: '12345' })
    );
    expect(result.matchedItem?.type).toBe('job');
  });
});

describe('성능 회귀 — 인덱스가 목록 변경 시에만 재생성되어야 한다', () => {
  it('addBlockItem 후에도 정상적으로 매칭되어야 한다', () => {
    const engine = engineWith([]);
    expect(engine.evaluateJobCard(card({ companyName: '신규회사' })).shouldFilter).toBe(false);

    engine.addBlockItem(company('신규회사'));
    expect(engine.evaluateJobCard(card({ companyName: '신규회사' })).shouldFilter).toBe(true);
  });

  it('updateBlockList 후 인덱스가 갱신되어야 한다', () => {
    const engine = engineWith([company('이전회사')]);
    expect(engine.evaluateJobCard(card({ companyName: '이전회사' })).shouldFilter).toBe(true);

    engine.updateBlockList([company('새회사')]);
    expect(engine.evaluateJobCard(card({ companyName: '이전회사' })).shouldFilter).toBe(false);
    expect(engine.evaluateJobCard(card({ companyName: '새회사' })).shouldFilter).toBe(true);
  });

  it('중복 addBlockItem 은 항목 수를 늘리지 않아야 한다', () => {
    const engine = engineWith([]);
    engine.addBlockItem(company('카카오'));
    engine.addBlockItem(company('(주)카카오'));
    engine.addBlockItem(company('주식회사 카카오'));
    // @ts-expect-error private 접근 (테스트 검증용)
    expect(engine.blockList.length).toBe(1);
  });
});
