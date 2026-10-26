import { describe, it, expect, beforeEach } from 'vitest';
import { FilterEngine } from '../../src/core/filter-engine';
import { DEFAULT_SETTINGS, BlockItem, JobCardInfo } from '../../src/types';

describe('FilterEngine 단위 테스트', () => {
  let engine: FilterEngine;

  beforeEach(() => {
    engine = new FilterEngine(DEFAULT_SETTINGS, []);
  });

  describe('회사명 정규화 (normalizeCompanyName)', () => {
    it('주식회사, (주) 및 특수문자/공백을 정규화해야 한다', () => {
      expect(engine.normalizeCompanyName('(주)우아한형제들')).toBe('우아한형제들');
      expect(engine.normalizeCompanyName('㈜씨디네트웍스')).toBe('씨디네트웍스');
      expect(engine.normalizeCompanyName('중앙하이텔㈜')).toBe('중앙하이텔');
      expect(engine.normalizeCompanyName('주식회사 당근마켓')).toBe('당근마켓');
      expect(engine.normalizeCompanyName(' 토스 (비바리퍼블리카) ')).toBe('토스비바리퍼블리카');
      expect(engine.normalizeCompanyName('NAVER Cloud Corp.')).toBe('navercloudcorp');
    });
  });

  describe('공고 필터 판정 (evaluateJobCard)', () => {
    it('광고 공고인 경우 hideAds가 true일 때 필터링되어야 한다', () => {
      engine.updateSettings({ ...DEFAULT_SETTINGS, hideAds: true });
      const dummyCard: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: '일반회사',
        title: '프론트엔드 개발자',
        isAd: true,
      };

      const result = engine.evaluateJobCard(dummyCard);
      expect(result.shouldFilter).toBe(true);
      expect(result.isAdFilter).toBe(true);
    });

    it('hideAds가 false일 때는 광고라도 차단 목록에 없으면 통과해야 한다', () => {
      engine.updateSettings({ ...DEFAULT_SETTINGS, hideAds: false });
      const dummyCard: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: '일반회사',
        title: '프론트엔드 개발자',
        isAd: true,
      };

      const result = engine.evaluateJobCard(dummyCard);
      expect(result.shouldFilter).toBe(false);
    });

    it('차단 목록에 등록된 회사명이 매칭되면 필터링되어야 한다', () => {
      const blockList: BlockItem[] = [
        { id: '1', pattern: '악덕기업', type: 'company', createdAt: Date.now() },
      ];
      engine.updateBlockList(blockList);

      const dummyCard: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: '(주) 악덕기업',
        title: '백엔드 개발자 채용',
        isAd: false,
      };

      const result = engine.evaluateJobCard(dummyCard);
      expect(result.shouldFilter).toBe(true);
      expect(result.matchedItem?.pattern).toBe('악덕기업');
      expect(result.isAdFilter).toBe(false);
    });

    it('차단한 회사명이 다른 일반 회사의 부분 문자열이라고 해서 역방향 오차단이 발생하지 않아야 한다', () => {
      const blockList: BlockItem[] = [
        { id: '1', pattern: '삼성전자', type: 'company', createdAt: Date.now() },
      ];
      engine.updateBlockList(blockList);

      // '삼성'이나 '전자' 등 차단 패턴의 일부분을 이름으로 갖는 별개 회사는 차단되면 안 됨
      const otherCompany1: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: '삼성',
        title: '신입 채용',
        isAd: false,
      };
      const otherCompany2: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: '전자',
        title: '신입 채용',
        isAd: false,
      };

      expect(engine.evaluateJobCard(otherCompany1).shouldFilter).toBe(false);
      expect(engine.evaluateJobCard(otherCompany2).shouldFilter).toBe(false);

      // 반대로 '삼성전자서비스'나 '(주)삼성전자' 등 실제 차단 대상 기업은 차단되어야 함
      const targetCompany: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: '(주) 삼성전자',
        title: '소프트웨어 개발자',
        isAd: false,
      };
      expect(engine.evaluateJobCard(targetCompany).shouldFilter).toBe(true);
    });

    it('차단 키워드가 제목에 포함되어 있으면 필터링되어야 한다', () => {
      const blockList: BlockItem[] = [
        { id: '2', pattern: '파견직', type: 'keyword', createdAt: Date.now() },
      ];
      engine.updateBlockList(blockList);

      const dummyCard: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: '좋은회사',
        title: '[파견직] 대기업 프로젝트 개발자 모집',
        isAd: false,
      };

      const result = engine.evaluateJobCard(dummyCard);
      expect(result.shouldFilter).toBe(true);
      expect(result.matchedItem?.pattern).toBe('파견직');
    });

    it('차단 대상이 아닌 일반 공고는 shouldFilter가 false여야 한다', () => {
      const dummyCard: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: '구글코리아',
        title: '소프트웨어 엔지니어',
        isAd: false,
      };

      const result = engine.evaluateJobCard(dummyCard);
      expect(result.shouldFilter).toBe(false);
    });

    it('특정 공고(jobId)만 차단했을 때 동일 회사의 다른 공고는 숨겨지지 않아야 한다', () => {
      const blockList: BlockItem[] = [
        {
          id: 'job_1',
          pattern: 'rec_101',
          type: 'job',
          createdAt: Date.now(),
          title: '카카오 프론트엔드 개발자',
          companyName: '카카오',
        },
      ];
      engine.updateBlockList(blockList);

      // 1. 차단 대상 공고
      const blockedJob: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: '카카오',
        title: '카카오 프론트엔드 개발자',
        jobId: 'rec_101',
        isAd: false,
      };
      const resultBlocked = engine.evaluateJobCard(blockedJob);
      expect(resultBlocked.shouldFilter).toBe(true);
      expect(resultBlocked.matchedItem?.type).toBe('job');

      // 2. 같은 회사의 다른 공고는 정상적으로 노출되어야 함!
      const otherJobSameCompany: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: '카카오',
        title: '카카오 백엔드 개발자',
        jobId: 'rec_102',
        isAd: false,
      };
      const resultOther = engine.evaluateJobCard(otherJobSameCompany);
      expect(resultOther.shouldFilter).toBe(false);
    });
  });

  describe('DOM 필터 스타일 적용 및 제거', () => {
    it('hide 모드일 때 display: none이 적용되어야 한다', () => {
      const el = document.createElement('div');
      engine.applyFilter(el, 'hide');

      expect(el.style.display).toBe('none');
      expect(el.getAttribute('data-job-filtered')).toBe('true');
      expect(el.getAttribute('data-filter-mode')).toBe('hide');
    });

    it('blur 모드일 때 filter: blur(Npx)가 적용되어야 한다', () => {
      const el = document.createElement('div');
      engine.applyFilter(el, 'blur', 8);

      expect(el.style.filter).toBe('blur(8px)');
      expect(el.getAttribute('data-job-filtered')).toBe('true');
      expect(el.getAttribute('data-filter-mode')).toBe('blur');
    });

    it('removeFilter 호출 시 필터 속성과 스타일이 초기화되어야 한다', () => {
      const el = document.createElement('div');
      engine.applyFilter(el, 'blur', 6);
      engine.removeFilter(el);

      expect(el.style.filter).toBe('');
      expect(el.hasAttribute('data-job-filtered')).toBe(false);
    });
  });

  describe('사람인 상세페이지 릴레이 뷰 무한스크롤 필터링 시나리오', () => {
    it('A 상세페이지에서 스크롤 중 B 릴레이 공고(jobId)를 차단한 후, 다른 C 상세페이지에서 B 공고가 로드되면 자동 필터링되어야 한다', () => {
      // 1. 초기 상태: 사용자가 A 공고 상세페이지 열람
      const jobA: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: 'A회사',
        title: 'A회사 시니어 프론트엔드',
        jobId: 'rec_aaa_111',
        isAd: false,
      };
      expect(engine.evaluateJobCard(jobA).shouldFilter).toBe(false);

      // 2. A 상세페이지 아래로 스크롤하여 B 공고(릴레이 뷰) 노출됨
      const jobBInPageA: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: 'B회사',
        title: 'B회사 백엔드 개발자',
        jobId: 'rec_bbb_222',
        isAd: false,
      };
      expect(engine.evaluateJobCard(jobBInPageA).shouldFilter).toBe(false);

      // 3. 사용자가 B 공고에 대해 [공고숨김] 클릭 -> 차단 목록에 등록
      const blockItemB: BlockItem = {
        id: 'block_b_222',
        pattern: 'rec_bbb_222',
        type: 'job',
        title: 'B회사 백엔드 개발자',
        companyName: 'B회사',
        createdAt: Date.now(),
      };
      engine.updateBlockList([blockItemB]);

      // 4. 이제 B 공고는 숨김 판정됨
      const evalB = engine.evaluateJobCard(jobBInPageA);
      expect(evalB.shouldFilter).toBe(true);
      expect(evalB.matchedItem?.type).toBe('job');
      expect(evalB.matchedItem?.pattern).toBe('rec_bbb_222');

      // 5. 사용자가 다른 C 회사 상세페이지로 이동
      const jobC: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: 'C회사',
        title: 'C회사 풀스택 개발자',
        jobId: 'rec_ccc_333',
        isAd: false,
      };
      expect(engine.evaluateJobCard(jobC).shouldFilter).toBe(false);

      // 6. C 상세페이지에서 무한스크롤 도중 과거 차단했던 B 공고가 릴레이 뷰나 추천 공고로 다시 로드됨
      const jobBInPageC: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: 'B회사',
        title: 'B회사 백엔드 개발자',
        jobId: 'rec_bbb_222',
        isAd: false,
      };
      const evalBInPageC = engine.evaluateJobCard(jobBInPageC);
      // 이전에 차단했던 B 공고이므로 다른 상세페이지에서도 즉시 자동 필터링(숨김)되어야 함!
      expect(evalBInPageC.shouldFilter).toBe(true);
      expect(evalBInPageC.matchedItem?.pattern).toBe('rec_bbb_222');

      // 7. B회사의 또 다른 신규 공고 D는 회사 차단이 아니므로 정상 노출되어야 함
      const jobDInPageC: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: 'B회사',
        title: 'B회사 인공지능 엔지니어',
        jobId: 'rec_bbb_999',
        isAd: false,
      };
      expect(engine.evaluateJobCard(jobDInPageC).shouldFilter).toBe(false);
    });

    it('A 상세페이지에서 B 회사를 [회사차단]한 경우, C 상세페이지에서 B 회사의 모든 릴레이 공고가 자동 필터링되어야 한다', () => {
      // B 회사 전체 차단 등록
      const blockCompanyB: BlockItem = {
        id: 'block_corp_b',
        pattern: 'B회사',
        type: 'company',
        createdAt: Date.now(),
      };
      engine.updateBlockList([blockCompanyB]);

      // C 상세페이지에서 B 회사의 공고들이 릴레이 뷰로 로드될 때
      const jobB1: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: '(주)B회사',
        title: 'B회사 데이터 분석가',
        jobId: 'rec_b_1',
        isAd: false,
      };
      const jobB2: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: 'B회사',
        title: 'B회사 DevOps 엔지니어',
        jobId: 'rec_b_2',
        isAd: false,
      };

      expect(engine.evaluateJobCard(jobB1).shouldFilter).toBe(true);
      expect(engine.evaluateJobCard(jobB2).shouldFilter).toBe(true);
    });
  });

  describe('차단 유형별 통계 산출 검증 (공고숨김 vs 회사차단)', () => {
    it('특정 공고(job)만 차단했을 때는 차단 회사에 포함되지 않고 개별 숨김 공고로만 집계되어야 한다', () => {
      // 1. 공고만 2개 차단 (A회사 공고1, B회사 공고1)
      const blockItems: BlockItem[] = [
        { id: '1', pattern: 'rec_job_1', type: 'job', title: '개발자 채용', companyName: 'A회사', createdAt: Date.now() },
        { id: '2', pattern: 'rec_job_2', type: 'job', title: '디자이너 채용', companyName: 'B회사', createdAt: Date.now() },
      ];
      engine.updateBlockList(blockItems);

      const card1: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: 'A회사',
        title: '개발자 채용',
        jobId: 'rec_job_1',
        isAd: false,
      };
      const card2: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: 'B회사',
        title: '디자이너 채용',
        jobId: 'rec_job_2',
        isAd: false,
      };
      const card3Normal: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: 'A회사',
        title: '마케터 채용',
        jobId: 'rec_job_3',
        isAd: false,
      };

      const eval1 = engine.evaluateJobCard(card1);
      const eval2 = engine.evaluateJobCard(card2);
      const eval3 = engine.evaluateJobCard(card3Normal);

      // card1, card2는 필터링되어야 하지만 matchedItem의 type은 'job'이어야 함
      expect(eval1.shouldFilter).toBe(true);
      expect(eval1.matchedItem?.type).toBe('job');

      expect(eval2.shouldFilter).toBe(true);
      expect(eval2.matchedItem?.type).toBe('job');

      // card3는 같은 A회사라도 개별 공고 차단이 아니므로 노출
      expect(eval3.shouldFilter).toBe(false);

      // 통계 집계 시뮬레이션
      const cards = [card1, card2, card3Normal];
      let totalBlocked = 0;
      let blockedJobs = 0;
      let blockedAds = 0;
      const blockedCompanySet = new Set<string>();

      for (const card of cards) {
        const res = engine.evaluateJobCard(card);
        if (res.shouldFilter) {
          totalBlocked++;
          if (res.isAdFilter) {
            blockedAds++;
          } else if (res.matchedItem?.type === 'job') {
            blockedJobs++;
          } else if (res.matchedItem?.type === 'company' || res.matchedItem?.type === 'keyword') {
            blockedCompanySet.add(card.companyName || res.matchedItem.pattern);
          }
        }
      }

      // 공고 2개만 차단되었으므로 totalBlocked=2, blockedJobs=2, blockedCompanies=0이어야 함!
      expect(totalBlocked).toBe(2);
      expect(blockedJobs).toBe(2);
      expect(blockedCompanySet.size).toBe(0);
      expect(blockedAds).toBe(0);
    });

    it('동일 회사의 공고가 여러 개 있어도 회사 차단인 경우 차단 회사 수는 1이어야 한다', () => {
      engine.updateBlockList([
        { id: 'c1', pattern: '카카오', type: 'company', createdAt: Date.now() },
      ]);

      const kakaoJob1: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: '카카오',
        title: 'FE 개발자',
        jobId: '101',
        isAd: false,
      };
      const kakaoJob2: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: '(주)카카오',
        title: 'BE 개발자',
        jobId: '102',
        isAd: false,
      };

      const cards = [kakaoJob1, kakaoJob2];
      let totalBlocked = 0;
      let blockedJobs = 0;
      let blockedAds = 0;
      const blockedCompanySet = new Set<string>();

      for (const card of cards) {
        const res = engine.evaluateJobCard(card);
        if (res.shouldFilter) {
          totalBlocked++;
          if (res.isAdFilter) {
            blockedAds++;
          } else if (res.matchedItem?.type === 'job') {
            blockedJobs++;
          } else if (res.matchedItem?.type === 'company' || res.matchedItem?.type === 'keyword') {
            blockedCompanySet.add(res.matchedItem.pattern);
          }
        }
      }

      // 공고는 2개 차단되었으나 회사는 1개(카카오)여야 함
      expect(totalBlocked).toBe(2);
      expect(blockedCompanySet.size).toBe(1);
      expect(blockedJobs).toBe(0);
    });
  });

  describe('회사별 차단 vs 공고별 차단 동작 및 독립성 종합 검증', () => {
    it('회사 차단 시 해당 회사의 모든 다양한 직군 공고가 일괄 차단되고 타사 공고는 보호되어야 한다', () => {
      engine.updateBlockList([
        { id: 'c1', pattern: '우아한형제들', type: 'company', createdAt: Date.now() },
      ]);

      const jobs: JobCardInfo[] = [
        { cardElement: document.createElement('div'), companyName: '(주)우아한형제들', title: '프론트엔드 개발자', jobId: 'woowahan_1', isAd: false },
        { cardElement: document.createElement('div'), companyName: '우아한형제들', title: '백엔드 서버 개발자', jobId: 'woowahan_2', isAd: false },
        { cardElement: document.createElement('div'), companyName: '주식회사 우아한형제들', title: '프로덕트 디자이너', jobId: 'woowahan_3', isAd: false },
        { cardElement: document.createElement('div'), companyName: '당근마켓', title: '프론트엔드 개발자', jobId: 'daangn_1', isAd: false },
      ];

      const res1 = engine.evaluateJobCard(jobs[0]);
      const res2 = engine.evaluateJobCard(jobs[1]);
      const res3 = engine.evaluateJobCard(jobs[2]);
      const res4 = engine.evaluateJobCard(jobs[3]);

      expect(res1.shouldFilter).toBe(true);
      expect(res1.matchedItem?.pattern).toBe('우아한형제들');
      expect(res2.shouldFilter).toBe(true);
      expect(res2.matchedItem?.pattern).toBe('우아한형제들');
      expect(res3.shouldFilter).toBe(true);
      expect(res3.matchedItem?.pattern).toBe('우아한형제들');

      // 타사(당근마켓) 공고는 차단되지 않아야 함
      expect(res4.shouldFilter).toBe(false);
    });

    it('특정 공고 차단 시 동일 회사의 다른 공고는 영향받지 않고 오직 대상 공고만 차단되어야 한다', () => {
      engine.updateBlockList([
        {
          id: 'j1',
          pattern: 'daangn_fe',
          type: 'job',
          createdAt: Date.now(),
          title: '웹 프론트엔드 개발자',
          companyName: '당근마켓',
        },
      ]);

      const targetJob: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: '당근마켓',
        title: '웹 프론트엔드 개발자',
        jobId: 'daangn_fe',
        isAd: false,
      };

      const otherJobSameCompany: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: '당근마켓',
        title: '서버 백엔드 개발자',
        jobId: 'daangn_be',
        isAd: false,
      };

      const targetResult = engine.evaluateJobCard(targetJob);
      const otherResult = engine.evaluateJobCard(otherJobSameCompany);

      expect(targetResult.shouldFilter).toBe(true);
      expect(targetResult.matchedItem?.type).toBe('job');
      expect(targetResult.matchedItem?.pattern).toBe('daangn_fe');

      // 동일 회사의 다른 공고는 차단되지 않음 (공고별 차단 독립성)
      expect(otherResult.shouldFilter).toBe(false);
    });

    it('동일 공고 제목을 가진 서로 다른 회사의 공고가 있을 때, 특정 회사 공고만 정확히 차단되어야 한다', () => {
      // 복합키(company:::title) 또는 companyName+title로 차단된 경우
      engine.updateBlockList([
        {
          id: 'j2',
          pattern: '카카오:::시니어 프론트엔드 개발자',
          type: 'job',
          createdAt: Date.now(),
          title: '시니어 프론트엔드 개발자',
          companyName: '카카오',
        },
      ]);

      const kakaoCard: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: '카카오',
        title: '시니어 프론트엔드 개발자',
        isAd: false,
      };

      const naverCard: JobCardInfo = {
        cardElement: document.createElement('div'),
        companyName: '네이버',
        title: '시니어 프론트엔드 개발자',
        isAd: false,
      };

      expect(engine.evaluateJobCard(kakaoCard).shouldFilter).toBe(true);
      // 제목이 같더라도 회사가 다른 네이버 공고는 필터링되지 않아야 함
      expect(engine.evaluateJobCard(naverCard).shouldFilter).toBe(false);
    });
  });
});


