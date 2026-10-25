import React, { useEffect, useState } from 'react';
import { FilterSettings, DEFAULT_SETTINGS, FilterStats } from '../types';
import { StorageManager } from '../core/storage';
import { FILTER_CONFIG, UI_MESSAGES } from '../constants';

export const Popup: React.FC = () => {
  const [settings, setSettings] = useState<FilterSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<FilterStats>({
    totalBlocked: 0,
    blockedCompanies: 0,
    blockedAds: 0,
  });
  const [newCompany, setNewCompany] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    // 1. 설정 로드
    StorageManager.getSettings().then(setSettings);

    // 2. 현재 활성 탭의 통계 요청
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTabId = tabs[0]?.id;
        if (activeTabId) {
          chrome.tabs.sendMessage(activeTabId, { type: 'GET_PAGE_STATS' }, (response) => {
            if (response?.stats) {
              setStats(response.stats);
            }
          });
        }
      });
    }
  }, []);

  const handleToggleMode = async () => {
    const nextMode = settings.mode === 'blur' ? 'hide' : 'blur';
    const updated = await StorageManager.saveSettings({ mode: nextMode });
    setSettings(updated);
    notifyContentScript({ type: 'SETTINGS_CHANGED', settings: updated });
  };

  const handleToggleAds = async () => {
    const updated = await StorageManager.saveSettings({ hideAds: !settings.hideAds });
    setSettings(updated);
    notifyContentScript({ type: 'SETTINGS_CHANGED', settings: updated });
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCompany.trim();
    if (!trimmed) return;

    await StorageManager.addBlockItem(trimmed, 'company');
    const updatedList = await StorageManager.getBlockList();
    notifyContentScript({ type: 'BLOCKLIST_CHANGED', items: updatedList });

    setNewCompany('');
    setStatusMsg(UI_MESSAGES.BLOCK_SUCCESS(trimmed));
    setTimeout(() => setStatusMsg(''), FILTER_CONFIG.STATUS_MESSAGE_TIMEOUT_MS);
  };

  const notifyContentScript = (message: any) => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTabId = tabs[0]?.id;
        if (activeTabId) {
          chrome.tabs.sendMessage(activeTabId, message);
        }
      });
    }
  };

  const openOptionsPage = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  };

  return (
    <div className="popup-container">
      <div className="header">
        <h1>🔍 잡필터 V2</h1>
        <button className="options-btn" onClick={openOptionsPage} title="상세 설정">
          ⚙️
        </button>
      </div>

      <div className="stats-card">
        <div className="stat-item">
          <div className="stat-value">{stats.totalBlocked}</div>
          <div className="stat-label">차단된 공고</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{stats.blockedCompanies}</div>
          <div className="stat-label">차단 회사</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{stats.blockedAds}</div>
          <div className="stat-label">광고 공고</div>
        </div>
      </div>

      <div className="section">
        <div className="toggle-row">
          <span className="toggle-label">
            {settings.mode === 'blur' ? '블러(흐리게) 처리' : '완전 숨김 처리'}
          </span>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.mode === 'hide'}
              onChange={handleToggleMode}
            />
            <span className="slider"></span>
          </label>
        </div>

        <div className="toggle-row" style={{ marginTop: '10px' }}>
          <span className="toggle-label">추천/광고 공고 숨김</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.hideAds}
              onChange={handleToggleAds}
            />
            <span className="slider"></span>
          </label>
        </div>
      </div>

      <div className="section">
        <span className="toggle-label">빠른 회사 차단</span>
        <form className="add-form" onSubmit={handleAddCompany}>
          <input
            type="text"
            className="add-input"
            placeholder="회사명 입력 (예: 카카오)"
            value={newCompany}
            onChange={(e) => setNewCompany(e.target.value)}
          />
          <button type="submit" className="add-btn">
            차단
          </button>
        </form>
        {statusMsg && (
          <div style={{ color: '#16a34a', fontSize: '11px', marginTop: '6px' }}>
            {statusMsg}
          </div>
        )}
      </div>

      <div className="footer">
        <span className="manage-link" onClick={openOptionsPage}>
          차단 목록 전체 관리 (Options)
        </span>
      </div>
    </div>
  );
};
