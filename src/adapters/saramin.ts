import { JobCardInfo } from '../types';
import { BaseSiteAdapter } from './base';
import { SITE_DOMAINS, SARAMIN_SELECTORS } from '../constants';

export class SaraminAdapter extends BaseSiteAdapter {
  readonly name = 'Saramin';

  public matches(url: string): boolean {
    return url.includes(SITE_DOMAINS.SARAMIN);
  }

  public getJobCardElements(): HTMLElement[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>(SARAMIN_SELECTORS.JOB_CARDS)
    );
  }

  public parseCard(element: HTMLElement): JobCardInfo | null {
    // 1. 회사명 추출
    const companyEl = element.querySelector<HTMLElement>(SARAMIN_SELECTORS.COMPANY_NAME);

    // 2. 공고 제목 추출
    const titleEl = element.querySelector<HTMLElement>(SARAMIN_SELECTORS.POSITION_TITLE);

    const companyName = companyEl?.textContent?.trim() || '';
    const title = titleEl?.textContent?.trim() || '';

    if (!companyName && !title) {
      return null;
    }

    // 3. 광고 판별 (상시, 추천, 플러스 광고 등)
    const isAd = Boolean(
      element.classList.contains(SARAMIN_SELECTORS.AD_CLASS) ||
      element.querySelector(SARAMIN_SELECTORS.AD_BADGE) ||
      element.getAttribute('data-is-ad') === 'true'
    );

    // 4. Job ID 추출
    const recruitId = element.getAttribute('value') || element.getAttribute('data-rec-idx');

    return {
      cardElement: element,
      companyName,
      title,
      isAd,
      jobId: recruitId || undefined,
    };
  }
}
