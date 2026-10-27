import { describe, it, expect, beforeEach } from 'vitest';
import { StorageManager } from '../../src/core/storage';
import { DEFAULT_SETTINGS } from '../../src/types';

describe('StorageManager 단위 테스트', () => {
  beforeEach(async () => {
    // 메모리 스토리지 초기화
    await StorageManager.saveBlockList([]);
    await StorageManager.saveSettings(DEFAULT_SETTINGS);
  });

  it('기본 설정을 올바르게 로드해야 한다', async () => {
    const settings = await StorageManager.getSettings();
    expect(settings.mode).toBe('blur');
    expect(settings.hideAds).toBe(true);
  });

  it('설정 변경 후 저장 및 조회가 정상 작동해야 한다', async () => {
    await StorageManager.saveSettings({ mode: 'hide', hideAds: false });
    const updated = await StorageManager.getSettings();

    expect(updated.mode).toBe('hide');
    expect(updated.hideAds).toBe(false);
  });

  it('차단 항목을 추가하고 조회할 수 있어야 한다', async () => {
    const item = await StorageManager.addBlockItem('네이버', 'company');
    expect(item.pattern).toBe('네이버');
    expect(item.type).toBe('company');

    const list = await StorageManager.getBlockList();
    expect(list.length).toBe(1);
    expect(list[0].pattern).toBe('네이버');
  });

  it('동일한 항목 추가 시 중복 생성되지 않아야 한다', async () => {
    await StorageManager.addBlockItem('카카오', 'company');
    await StorageManager.addBlockItem(' 카카오 ', 'company');

    const list = await StorageManager.getBlockList();
    expect(list.length).toBe(1);
  });

  it('ID를 통해 항목을 삭제할 수 있어야 한다', async () => {
    const item = await StorageManager.addBlockItem('라인', 'company');
    let list = await StorageManager.getBlockList();
    expect(list.length).toBe(1);

    await StorageManager.removeBlockItem(item.id);
    list = await StorageManager.getBlockList();
    expect(list.length).toBe(0);
  });

  it('특정 공고(job) 차단 항목을 메타데이터와 함께 저장할 수 있어야 한다', async () => {
    const item = await StorageManager.addBlockItem('rec_12345', 'job', {
      title: '프론트엔드 개발자',
      companyName: '토스',
    });

    expect(item.type).toBe('job');
    expect(item.pattern).toBe('rec_12345');
    expect(item.title).toBe('프론트엔드 개발자');
    expect(item.companyName).toBe('토스');

    const list = await StorageManager.getBlockList();
    expect(list.length).toBe(1);
    expect(list[0].title).toBe('프론트엔드 개발자');
  });

  it('만료된 공고(expiresAt이 지난 공고)는 getBlockList 조회 시 자동으로 청소되어야 한다', async () => {
    const pastTime = Date.now() - 10000;
    const futureTime = Date.now() + 100000;

    // 1. 이미 만료된 공고 저장
    await StorageManager.addBlockItem('expired_job', 'job', {
      title: '과거 공고',
      expiresAt: pastTime,
    });

    // 2. 아직 유효한 공고 저장
    await StorageManager.addBlockItem('active_job', 'job', {
      title: '현재 공고',
      expiresAt: futureTime,
    });

    // 3. 회사 차단 항목 저장 (영구 보존 대상)
    await StorageManager.addBlockItem('영구차단회사', 'company');

    // getBlockList(true) 호출 시 만료 공고는 자동 삭제되고 2개만 남아야 함
    const list = await StorageManager.getBlockList(true);
    expect(list.length).toBe(2);

    const patterns = list.map((item) => item.pattern);
    expect(patterns).not.toContain('expired_job');
    expect(patterns).toContain('active_job');
    expect(patterns).toContain('영구차단회사');
  });

  it('purgeExpiredJobs 호출 시 만료된 공고만 삭제되고 삭제된 개수가 반환되어야 한다', async () => {
    const pastTime = Date.now() - 5000;

    await StorageManager.addBlockItem('expired_1', 'job', { expiresAt: pastTime });
    await StorageManager.addBlockItem('expired_2', 'job', { expiresAt: pastTime });
    await StorageManager.addBlockItem('company_1', 'company');

    const purged = await StorageManager.purgeExpiredJobs();
    expect(purged).toBe(2);

    const remaining = await StorageManager.getBlockList(false);
    expect(remaining.length).toBe(1);
    expect(remaining[0].pattern).toBe('company_1');
  });

  it('리스트 페이지와 상세 페이지에서 동일 공고를 차단해도 중복 생성되지 않고 단일 항목으로 유지되어야 한다', async () => {
    // 1. 리스트 페이지에서 jobId(55176414)로 공고 차단
    await StorageManager.addBlockItem('55176414', 'job', {
      title: '[㈜에스티아이] 2026년 하반기 공채',
      companyName: '(주)에스티아이',
      closingDate: '~ 11/30(일)',
    });

    let list = await StorageManager.getBlockList(false);
    expect(list.length).toBe(1);

    // 2. 상세 페이지에서 동일한 jobId(55176414)로 다시 차단 시도
    await StorageManager.addBlockItem('55176414', 'job', {
      title: '[㈜에스티아이] 2026년 하반기 공채',
      companyName: '(주)에스티아이',
      closingDate: '~ 11/30(일)',
    });

    list = await StorageManager.getBlockList(false);
    expect(list.length).toBe(1); // 중복되지 않고 1개 유지
  });

  it('리스트에서 복합키(company:::title)로 차단 후 상세페이지에서 고유 jobId로 재차단 시 중복 없이 jobId로 업그레이드되어야 한다', async () => {
    // 1. jobId를 알 수 없어 복합키로 등록된 경우
    await StorageManager.addBlockItem('(주)에스티아이:::[㈜에스티아이] 2026년 하반기 공채', 'job', {
      title: '[㈜에스티아이] 2026년 하반기 공채',
      companyName: '(주)에스티아이',
    });

    let list = await StorageManager.getBlockList(false);
    expect(list.length).toBe(1);
    expect(list[0].pattern).toBe('(주)에스티아이:::[㈜에스티아이] 2026년 하반기 공채');

    // 2. 상세 페이지에서 정확한 고유 jobId(55176414)로 차단 시도
    await StorageManager.addBlockItem('55176414', 'job', {
      title: '[㈜에스티아이] 2026년 하반기 공채',
      companyName: '(주)에스티아이',
    });

    list = await StorageManager.getBlockList(false);
    expect(list.length).toBe(1); // 2개로 중복 생성되지 않고 1개 유지
    expect(list[0].pattern).toBe('55176414'); // 더 정밀한 고유 jobId로 패턴 업그레이드
  });

  it('기존 custom(직접등록) 플랫폼으로 등록된 회사를 원티드에서 다시 차단 시 wanted 플랫폼으로 업그레이드되어야 한다', async () => {
    // 1. 직접 등록 (platform: 'custom')
    await StorageManager.addBlockItem('원티드테스트기업', 'company', { platform: 'custom' });
    let list = await StorageManager.getBlockList(false);
    expect(list[0].platform).toBe('custom');

    // 2. 원티드 페이지에서 동일 회사 차단 시도
    await StorageManager.addBlockItem('원티드테스트기업', 'company', { platform: 'wanted' });
    list = await StorageManager.getBlockList(false);
    expect(list.length).toBe(1);
    expect(list[0].platform).toBe('wanted');
  });

  it('회사명에 (주), 주식회사 등 표기 변형이 있어도 중복 생성되지 않고 간결한 명칭으로 최적화되어야 한다', async () => {
    // 1. '(주)카카오'로 먼저 등록
    await StorageManager.addBlockItem('(주)카카오', 'company');
    let list = await StorageManager.getBlockList(false);
    expect(list.length).toBe(1);
    expect(list[0].pattern).toBe('(주)카카오');

    // 2. 다른 페이지에서 '카카오'로 다시 차단 시도 -> 중복 없이 1개 유지 & 간결한 '카카오'로 패턴 갱신
    await StorageManager.addBlockItem('카카오', 'company');
    list = await StorageManager.getBlockList(false);
    expect(list.length).toBe(1);
    expect(list[0].pattern).toBe('카카오');

    // 3. '주식회사 카카오'로 다시 차단 시도 -> 중복 없이 1개 유지
    await StorageManager.addBlockItem('주식회사 카카오', 'company');
    list = await StorageManager.getBlockList(false);
    expect(list.length).toBe(1);
    expect(list[0].pattern).toBe('카카오');
  });

  it('공고 등록 시 회사명 표기에 (주) 유무 차이가 있어도 동일 공고로 감지되어 중복 생성되지 않아야 한다', async () => {
    // 1. '(주)토스'의 프론트엔드 공고 차단
    await StorageManager.addBlockItem('job_toss_1', 'job', {
      title: 'Frontend Engineer',
      companyName: '(주)토스',
    });
    let list = await StorageManager.getBlockList(false);
    expect(list.length).toBe(1);

    // 2. 다른 페이지에서 '토스'의 'Frontend Engineer'로 차단 시도 (jobId가 다른 형식이더라도)
    await StorageManager.addBlockItem('toss:::Frontend Engineer', 'job', {
      title: 'Frontend Engineer',
      companyName: '토스',
    });
    list = await StorageManager.getBlockList(false);
    expect(list.length).toBe(1);
  });

  it('리뷰 유도 배너 숨김 여부 조회 및 숨김 처리가 정상 작동해야 한다', async () => {
    // 초기 상태: 숨김 처리되지 않음 (false)
    const initialDismissed = await StorageManager.isRatingBannerDismissed();
    expect(initialDismissed).toBe(false);

    // 숨김 처리 호출
    await StorageManager.dismissRatingBanner();

    // 숨김 상태로 전환 확인 (true)
    const afterDismissed = await StorageManager.isRatingBannerDismissed();
    expect(afterDismissed).toBe(true);
  });
});


