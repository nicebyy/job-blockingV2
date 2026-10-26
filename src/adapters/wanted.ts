import { JobCardInfo } from '../types';
import { BaseSiteAdapter } from './base';
import { SITE_DOMAINS, WANTED_SELECTORS } from '../constants';

export class WantedAdapter extends BaseSiteAdapter {
  readonly name = 'Wanted';

  public matches(url: string): boolean {
    return url.includes(SITE_DOMAINS.WANTED);
  }

  public getJobCardElements(container: Document | HTMLElement = document): HTMLElement[] {
    const cards = Array.from(
      container.querySelectorAll<HTMLElement>(WANTED_SELECTORS.JOB_CARDS)
    );

    // a태그인 경우 가장 가까운 카드 컨테이너가 있으면 그것을 기준으로 하거나 자기 자신
    return cards.map((el) => {
      const container = el.closest<HTMLElement>(WANTED_SELECTORS.CARD_CONTAINER) || el;
      return container;
    });
  }

  public parseCard(element: HTMLElement): JobCardInfo | null {
    // 1. 회사명 추출
    const companyEl = element.querySelector<HTMLElement>(WANTED_SELECTORS.COMPANY_NAME);

    // 2. 공고 제목 추출
    const titleEl = element.querySelector<HTMLElement>(WANTED_SELECTORS.POSITION_TITLE);

    const companyName = companyEl?.textContent?.trim() || '';
    const title = titleEl?.textContent?.trim() || '';

    if (!companyName && !title) {
      return null;
    }

    // 3. 광고 여부 (원티드 광고/스폰서 태그)
    const isAd = Boolean(
      element.querySelector(WANTED_SELECTORS.AD_BADGE) ||
      element.textContent?.includes('AD') ||
      element.getAttribute('data-is-ad') === 'true'
    );

    // 4. Job ID 추출 (a태그의 href 등에서)
    const link =
      element.querySelector<HTMLAnchorElement>(WANTED_SELECTORS.JOB_LINK) ||
      (element instanceof HTMLAnchorElement ? element : null);
    const match = link?.href?.match(/\/wd\/(\d+)/);
    const jobId = match ? match[1] : undefined;

    const dateEl = element.querySelector<HTMLElement>(WANTED_SELECTORS.CLOSING_DATE);
    const closingDate = dateEl?.textContent?.trim() || undefined;

    return {
      cardElement: element,
      companyName,
      title,
      isAd,
      jobId,
      closingDate,
    };
  }
}
