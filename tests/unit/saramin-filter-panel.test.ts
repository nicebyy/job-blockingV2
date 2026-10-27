import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SaraminAdapter } from '../../src/adapters/saramin';
import { SARAMIN_SELECTORS } from '../../src/constants';

/**
 * [회귀] 사람인 목록 페이지의 검색 필터 패널을 숨기지 않아야 한다.
 *
 * 배경:
 *   PROMOTION_BANNERS 에 `.wrap_section_contents` 를 포함시켰던 시점에,
 *   이 요소가 실제로는 목록 페이지의 **지역·직업·검색어·상세조건 필터 패널 전체**를
 *   감싸는 컨테이너였다. 그 결과 광고 숨김 로직이 필터 UI 를 통째로 display:none
 *   처리하여 사용자가 검색 조건을 전혀 조작할 수 없게 되는 회귀가 발생했다.
 *   (input 223개 규모)
 *
 * 이 테스트는 실브라우저에서 수집한 실제 DOM 픽스처로 그 회귀를 영구 방지한다.
 */
describe('[회귀] 사람인 검색 필터 패널 보호', () => {
  const FIXTURE = path.resolve(__dirname, '../fixtures/saramin_filter_panel.html');
  const adapter = new SaraminAdapter();

  const load = () => {
    const html = fs.readFileSync(FIXTURE, 'utf-8');
    document.body.innerHTML = html;
  };

  beforeEach(() => {
    load();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('픽스처에 필터 패널과 폼 컨트롤이 존재해야 한다', () => {
    const panel = document.querySelector('.main_option');
    expect(panel).not.toBeNull();

    // 지역/직업/검색어/상세조건 4개 탭이 모두 있어야 한다
    expect(document.querySelectorAll('.area_section').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.job_category_section').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.keyword_section').length).toBeGreaterThan(0);
    expect(document.querySelector('.detail_section')).not.toBeNull();

    // 폼 컨트롤이 대량으로 존재 (필터 UI 의 실체)
    const controls = document.querySelectorAll('input, select, textarea');
    expect(controls.length).toBeGreaterThan(50);
  });

  it('PROMOTION_BANNERS 셀렉터가 필터 패널을 매칭하지 않아야 한다', () => {
    const matched = Array.from(
      document.querySelectorAll<HTMLElement>(SARAMIN_SELECTORS.PROMOTION_BANNERS)
    );

    for (const el of matched) {
      // 어떤 매칭 요소도 필터 패널 자체이거나 필터 패널을 포함하면 안 된다
      expect(
        el.classList.contains('wrap_section_contents'),
        `PROMOTION_BANNERS 가 필터 컨테이너를 매칭함: ${el.className}`
      ).toBe(false);
      expect(
        el.querySelector('.area_section, .job_category_section, .keyword_section'),
        `PROMOTION_BANNERS 매칭 요소가 필터 탭을 포함함: ${el.className}`
      ).toBeNull();
    }
  });

  it('hidePromotionBanners() 후에도 필터 패널이 보여야 한다', () => {
    adapter.hidePromotionBanners(document);

    const panel = document.querySelector<HTMLElement>('.main_option');
    expect(panel).not.toBeNull();
    expect(panel!.style.display).not.toBe('none');

    // 필터 컨트롤이 실제로 노출되는지 (숨겨진 조상이 없는지) 검증
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>('input, select, textarea')
    );
    expect(controls.length).toBeGreaterThan(50);

    let hiddenByAncestor = 0;
    for (const el of controls) {
      let cur: HTMLElement | null = el;
      while (cur) {
        if (cur.style?.display === 'none') {
          hiddenByAncestor++;
          break;
        }
        cur = cur.parentElement;
      }
    }
    expect(hiddenByAncestor).toBe(0);
  });

  it('방어 가드: 필터 영역이 셀렉터에 실수로 포함되어도 숨기지 않아야 한다', () => {
    // 과거 버그를 인위적으로 재현: 필터 패널에 광고와 동일한 클래스를 부여
    const panel = document.querySelector<HTMLElement>('.main_option')!;
    panel.classList.add('list_product'); // PROMOTION_BANNERS 에 포함된 클래스

    adapter.hidePromotionBanners(document);

    // 가드가 동작하여 숨겨지지 않아야 한다
    const after = document.querySelector<HTMLElement>('.main_option')!;
    expect(after.style.display).not.toBe('none');
    expect(after.getAttribute('data-blocked-type')).not.toBe('ad');
  });

  it('실제 광고 배너는 여전히 숨겨져야 한다 (기능 회귀 방지)', () => {
    // 광고 요소를 하나 심어 정상 동작 확인
    const ad = document.createElement('div');
    ad.className = 'wrap_recommend';
    ad.innerHTML = '<a href="#recommend">추천 공고 더보기</a>';
    document.body.appendChild(ad);

    adapter.hidePromotionBanners(document);

    expect(ad.style.display).toBe('none');
    expect(ad.getAttribute('data-blocked-type')).toBe('ad');
  });
});
