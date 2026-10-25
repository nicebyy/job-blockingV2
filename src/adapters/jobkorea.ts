import { JobCardInfo } from '../types';
import { BaseSiteAdapter } from './base';

export class JobKoreaAdapter extends BaseSiteAdapter {
  readonly name = 'JobKorea';

  public matches(url: string): boolean {
    return url.includes('jobkorea.co.kr');
  }

  public getJobCardElements(): HTMLElement[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        '.list-post, .dev_gwork, .recruit-info, li[class*="list-item"]'
      )
    );
  }

  public parseCard(element: HTMLElement): JobCardInfo | null {
    // 1. 회사명 추출
    const companyEl =
      element.querySelector<HTMLElement>('.post-list-corp a, .corp-name a, .name, a[class*="corp"]') ||
      element.querySelector<HTMLElement>('.post-list-corp');

    // 2. 공고 제목 추출
    const titleEl =
      element.querySelector<HTMLElement>('.post-list-info a.title, .title a, a.tit, .post-title');

    const companyName = companyEl?.textContent?.trim() || '';
    const title = titleEl?.textContent?.trim() || '';

    if (!companyName && !title) {
      return null;
    }

    // 3. 광고 판별 (스페셜 공고, 파견/대행, 헤드헌팅 등)
    const isAd = Boolean(
      element.classList.contains('special-post') ||
      element.querySelector('.badge-ad, .badge-special, .tag-ad') ||
      element.getAttribute('data-is-ad') === 'true'
    );

    const gno = element.getAttribute('data-gno') || element.getAttribute('data-info');

    return {
      cardElement: element,
      companyName,
      title,
      isAd,
      jobId: gno || undefined,
    };
  }
}
