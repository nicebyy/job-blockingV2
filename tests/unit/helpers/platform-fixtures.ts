import fs from 'node:fs';
import path from 'node:path';
import type { BlockItem, JobPlatform } from '../../../src/types';

/**
 * 플랫폼별 통합 테스트용 픽스처 정의
 *
 * 각 항목은 실제 사이트에서 수집한 HTML 스냅샷과 그에 해당하는 URL 을 함께 보관한다.
 * URL 은 AdapterRegistry 라우팅과 isDetailPage 판정에도 사용된다.
 */
export interface PlatformFixture {
  /** 사용자에게 노출되는 플랫폼 이름 */
  platform: string;
  /** 내부 플랫폼 키 (BlockItem.platform 등에 사용) */
  platformKey: JobPlatform;
  /** tests/fixtures 기준 파일명 */
  file: string;
  /** 이 픽스처가 대응하는 목록 페이지 URL */
  url: string;
}

/** 어댑터가 구현된 5개 플랫폼 목록 픽스처 */
export const PLATFORM_FIXTURES: PlatformFixture[] = [
  {
    platform: '원티드 (Wanted)',
    platformKey: 'wanted',
    // 실제 브라우저(Playwright)로 렌더링 완료 후 덤프한 DOM.
    // 정적 HTML 만으로는 SPA 카드가 존재하지 않으므로 렌더링본을 사용한다.
    file: 'wanted_wdlist_rendered.html',
    url: 'https://www.wanted.co.kr/wdlist/518/872',
  },
  {
    platform: '사람인 (Saramin)',
    platformKey: 'saramin',
    file: 'saramin_search.html',
    url: 'https://www.saramin.co.kr/zf_user/search/recruit?searchword=개발',
  },
  {
    platform: '잡코리아 (JobKorea)',
    platformKey: 'jobkorea',
    file: 'jobkorea_joblist.html',
    url: 'https://www.jobkorea.co.kr/recruit/joblist',
  },
  {
    platform: '리멤버 (Remember)',
    platformKey: 'remember',
    // 기존 remember_postings.html 은 Next.js 하이드레이션 직후의 "스켈레톤 로딩 상태"라
    // 실제 공고 카드가 없다(렌더링 전이라 빈 placeholder div 만 존재).
    // 실제 브라우저로 렌더링 완료 후 덤프한 DOM 을 사용한다.
    file: 'remember_postings_rendered.html',
    url: 'https://career.rememberapp.co.kr/job/postings',
  },
  {
    platform: '점핏 (Jumpit)',
    platformKey: 'jumpit',
    file: 'jumpit_positions.html',
    url: 'https://jumpit.saramin.co.kr/positions?sort=popular',
  },
];

/** 상세페이지 픽스처 (상세 판정/차단 UI 검증용) */
export const DETAIL_FIXTURES: PlatformFixture[] = [
  {
    platform: '원티드 (Wanted) 상세',
    platformKey: 'wanted',
    file: 'wanted_detail_326613.html',
    url: 'https://www.wanted.co.kr/wd/326613',
  },
  {
    platform: '잡코리아 (JobKorea) 상세',
    platformKey: 'jobkorea',
    file: 'jobkorea_joblist.html',
    url: 'https://www.jobkorea.co.kr/Recruit/GI_Read/43000000',
  },
  {
    platform: '리멤버 (Remember) 상세',
    platformKey: 'remember',
    file: 'remember_detail.html',
    url: 'https://career.rememberapp.co.kr/job/posting/12345',
  },
  {
    platform: '점핏 (Jumpit) 상세',
    platformKey: 'jumpit',
    file: 'jumpit_detail.html',
    url: 'https://jumpit.saramin.co.kr/position/55185963',
  },
];

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures');

/** 픽스처 파일이 실제로 존재하는지 확인한다 (없으면 테스트를 skip 하기 위함) */
export function fixtureExists(fixture: PlatformFixture): boolean {
  return fs.existsSync(path.join(FIXTURE_DIR, fixture.file));
}

/**
 * 픽스처 HTML 을 읽어 현재 document.body 에 주입한다.
 *
 * 외부 스크립트/iframe 은 제거한다 — happy-dom 환경에서 네트워크 요청이
 * 발생하면 테스트가 느려지거나 실패하기 때문이다.
 */
export function loadPlatformDocument(fixture: PlatformFixture): Document {
  const rawHtml = fs.readFileSync(path.join(FIXTURE_DIR, fixture.file), 'utf-8');
  const cleanHtml = stripExternalResources(rawHtml);
  document.body.innerHTML = cleanHtml;
  return document;
}

/** 스크립트/iframe/링크 프리로드 등 외부 리소스 유발 요소를 제거한다 */
export function stripExternalResources(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<link\b[^>]*rel=["']?(preload|prefetch|dns-prefetch)["']?[^>]*>/gi, '');
}

/** 회사명 배열로 company 차단 목록을 만든다 */
export function buildBlockList(companies: string[]): BlockItem[] {
  return companies.map((company, index) => ({
    id: `int-company-${index}`,
    pattern: company,
    type: 'company' as const,
    createdAt: Date.now(),
  }));
}
