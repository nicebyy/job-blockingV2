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
});
