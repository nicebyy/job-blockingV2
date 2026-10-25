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
});
