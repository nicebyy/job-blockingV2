import { JobCardInfo } from '../types';
import { BaseSiteAdapter } from './base';

export class WantedAdapter extends BaseSiteAdapter {
  readonly name = 'Wanted';

  public matches(url: string): boolean {
    return url.includes('wanted.co.kr');
  }

  public getJobCardElements(): HTMLElement[] {
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-cy="job-card"], div[class*="JobCard_container__"], a[href*="/wd/"]'
      )
    );

    // a태그인 경우 가장 가까운 카드 컨테이너가 있으면 그것을 기준으로 하거나 자기 자신
    return cards.map((el) => {
      const container = el.closest<HTMLElement>('li, div[class*="Card_"]') || el;
      return container;
    });
  }

  public parseCard(element: HTMLElement): JobCardInfo | null {
    // 1. 회사명 추출
    const companyEl =
      element.querySelector<HTMLElement>(
        '[data-attribute-id="company__name"], span[class*="companyName"], span[class*="Company_name"], .company-name'
      ) ||
      element.querySelector<HTMLElement>('span[class*="company"]');

    // 2. 공고 제목 추출
    const titleEl =
      element.querySelector<HTMLElement>(
        '[data-attribute-id="position__name"], strong[class*="position"], h4, [class*="JobCard_title"]'
      ) ||
      element.querySelector<HTMLElement>('a[href*="/wd/"]');

    const companyName = companyEl?.textContent?.trim() || '';
    const title = titleEl?.textContent?.trim() || '';

    if (!companyName && !title) {
      return null;
    }

    // 3. 광고 여부 (원티드 광고/스폰서 태그)
    const isAd = Boolean(
      element.querySelector('[data-attribute-id="badge__ad"], [class*="ad_badge"], [class*="badge_ad"]') ||
      element.textContent?.includes('AD') ||
      element.getAttribute('data-is-ad') === 'true'
    );

    // 4. Job ID 추출 (a태그의 href 등에서)
    const link =
      element.querySelector<HTMLAnchorElement>('a[href*="/wd/"]') ||
      (element instanceof HTMLAnchorElement ? element : null);
    const match = link?.href?.match(/\/wd\/(\d+)/);
    const jobId = match ? match[1] : undefined;

    return {
      cardElement: element,
      companyName,
      title,
      isAd,
      jobId,
    };
  }
}
