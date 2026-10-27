import { SiteAdapter } from './base';
import { WantedAdapter } from './wanted';
import { JumpitAdapter } from './jumpit';
import { SaraminAdapter } from './saramin';
import { JobKoreaAdapter } from './jobkorea';
import { RememberAdapter } from './remember';

export class AdapterRegistry {
  private static adapters: SiteAdapter[] = [
    new JumpitAdapter(),
    new WantedAdapter(),
    new SaraminAdapter(),
    new JobKoreaAdapter(),
    new RememberAdapter(),
  ];

  /**
   * 신규 사이트 어댑터 등록
   */
  public static register(adapter: SiteAdapter): void {
    this.adapters.push(adapter);
  }

  /**
   * 현재 URL에 매칭되는 어댑터 탐색
   */
  public static getAdapterForUrl(url: string): SiteAdapter | null {
    return this.adapters.find((adapter) => adapter.matches(url)) || null;
  }

  /**
   * 등록된 모든 어댑터 목록 반환
   */
  public static getAllAdapters(): SiteAdapter[] {
    return [...this.adapters];
  }
}

export * from './base';
export * from './wanted';
export * from './jumpit';
export * from './saramin';
export * from './jobkorea';
export * from './remember';
