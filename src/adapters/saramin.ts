import { JobCardInfo } from '../types';
import { BaseSiteAdapter } from './base';

export class SaraminAdapter extends BaseSiteAdapter {
  readonly name = 'Saramin';

  public matches(url: string): boolean {
    return url.includes('saramin.co.kr');
  }

  public getJobCardElements(): HTMLElement[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        '.item_recruit, .list_item, div[class*="BoxAd_wrap"], .recruit_list .row'
      )
    );
  }

  public parseCard(element: HTMLElement): JobCardInfo | null {
    // 1. 회사명 추출
    const companyEl =
      element.querySelector<HTMLElement>('.area_corp .corp_name a, .corp_name, a[class*="company"]') ||
      element.querySelector<HTMLElement>('.company_name');

    // 2. 공고 제목 추출
    const titleEl =
      element.querySelector<HTMLElement>('.area_job .job_tit a, .job_tit a, .job_tit, .area_job .job_tit');

    const companyName = companyEl?.textContent?.trim() || '';
    const title = titleEl?.textContent?.trim() || '';

    if (!companyName && !title) {
      return null;
    }

    // 3. 광고 판별 (상시, 추천, 플러스 광고 등)
    const isAd = Boolean(
      element.classList.contains('plus_ad') ||
      element.querySelector('.badge_plus, .badge_recommend, .tag_ad, .ad_tag') ||
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
