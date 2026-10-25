import { JobCardInfo } from '../types';

export interface SiteAdapter {
  readonly name: string;
  matches(url: string): boolean;
  getJobCardElements(): HTMLElement[];
  parseCard(element: HTMLElement): JobCardInfo | null;
  injectInlineButton(cardInfo: JobCardInfo, onBlock: (companyName: string) => void): void;
}

export abstract class BaseSiteAdapter implements SiteAdapter {
  abstract readonly name: string;

  abstract matches(url: string): boolean;
  abstract getJobCardElements(): HTMLElement[];
  abstract parseCard(element: HTMLElement): JobCardInfo | null;

  /**
   * 공고 카드에 [숨기기] 인라인 버튼 삽입
   */
  public injectInlineButton(cardInfo: JobCardInfo, onBlock: (companyName: string) => void): void {
    if (!cardInfo.cardElement || !cardInfo.companyName) return;

    // 이미 버튼이 삽입되어 있는지 확인
    if (cardInfo.cardElement.querySelector('.job-filter-hide-btn')) {
      return;
    }

    const button = document.createElement('button');
    button.className = 'job-filter-hide-btn';
    button.type = 'button';
    button.title = `${cardInfo.companyName} 공고 숨기기`;
    button.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
      <span>차단</span>
    `;

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onBlock(cardInfo.companyName);
    });

    // 버튼을 카드의 적절한 위치(우측 상단 등)에 삽입
    cardInfo.cardElement.style.position =
      cardInfo.cardElement.style.position === 'absolute' ? 'absolute' : 'relative';
    cardInfo.cardElement.appendChild(button);
  }
}
