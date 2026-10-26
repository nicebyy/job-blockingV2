import React, { useEffect, useState } from 'react';
import { FilterSettings, DEFAULT_SETTINGS, FilterStats, TotalBlockStats, JobPlatform } from '../types';
import { StorageManager } from '../core/storage';
import { FILTER_CONFIG, UI_MESSAGES, POPUP_STATS_CONFIG, PopupStatsMode, SITE_DOMAINS } from '../constants';

export const Popup: React.FC = () => {
  const [settings, setSettings] = useState<FilterSettings>(DEFAULT_SETTINGS);
  const [statsMode, setStatsMode] = useState<PopupStatsMode>(POPUP_STATS_CONFIG.MODES.TOTAL);
  const [totalStats, setTotalStats] = useState<TotalBlockStats>({
    total: 0,
    companies: 0,
    jobs: 0,
    keywords: 0,
  });
  const [pageStats, setPageStats] = useState<FilterStats>({
    totalBlocked: 0,
    blockedCompanies: 0,
    blockedJobs: 0,
    blockedAds: 0,
  });
  const [isJobSite, setIsJobSite] = useState<boolean>(false);
  const [currentPlatform, setCurrentPlatform] = useState<JobPlatform>('custom');
  const [newCompany, setNewCompany] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // 1. 전체 등록 누적 차단 통계 로드
  const loadTotalStats = async () => {
    const list = await StorageManager.getBlockList(false);
    let companies = 0;
    let jobs = 0;
    let keywords = 0;

    for (const item of list) {
      if (item.type === 'company') companies++;
      else if (item.type === 'job') jobs++;
      else if (item.type === 'keyword') keywords++;
    }

    setTotalStats({
      total: list.length,
      companies,
      jobs,
      keywords,
    });
  };

  const detectPlatform = (url?: string): JobPlatform => {
    if (!url) return 'custom';
    if (url.includes(SITE_DOMAINS.WANTED)) return 'wanted';
    if (url.includes('jumpit.') || url.includes(SITE_DOMAINS.JUMPIT)) return 'jumpit';
    if (url.includes(SITE_DOMAINS.SARAMIN)) return 'saramin';
    if (url.includes(SITE_DOMAINS.JOBKOREA)) return 'jobkorea';
    if (url.includes(SITE_DOMAINS.REMEMBER)) return 'remember';
    return 'custom';
  };

  // 2. 현재 활성 탭 페이지 필터링 통계 로드
  const loadPageStats = () => {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return;

    const queryActiveTab = (options: chrome.tabs.QueryInfo, callback: (tab?: chrome.tabs.Tab) => void) => {
      try {
        chrome.tabs.query(options, (tabs) => {
          if (chrome.runtime?.lastError) {
            callback(undefined);
            return;
          }
          callback(tabs?.[0]);
        });
      } catch {
        callback(undefined);
      }
    };

    queryActiveTab({ active: true, currentWindow: true }, (tab) => {
      if (!tab?.id) {
        queryActiveTab({ active: true, lastFocusedWindow: true }, (fallbackTab) => {
          if (fallbackTab?.id) {
            setCurrentPlatform(detectPlatform(fallbackTab.url));
            fetchStatsFromTab(fallbackTab.id);
          }
        });
      } else {
        setCurrentPlatform(detectPlatform(tab.url));
        fetchStatsFromTab(tab.id);
      }
    });
  };

  const fetchStatsFromTab = (tabId: number) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_STATS' }, (response) => {
        if (chrome.runtime?.lastError || !response?.stats) {
          setIsJobSite(false);
          return;
        }
        setIsJobSite(true);
        setPageStats(response.stats);
      });
    } catch {
      setIsJobSite(false);
    }
  };

  useEffect(() => {
    // 1. 설정 로드
    StorageManager.getSettings().then(setSettings);

    // 2. 전체 누적 통계 로드 (사용자가 등록한 전체 목록 기본 표시)
    loadTotalStats();

    // 3. 현재 활성 탭 통계 요청 (채용 사이트 방문 시 실시간 통계 보조 제공)
    loadPageStats();
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

  const handleToggleInfiniteScroll = async () => {
    const updated = await StorageManager.saveSettings({
      enableInfiniteScroll: !settings.enableInfiniteScroll,
    });
    setSettings(updated);
    notifyContentScript({ type: 'SETTINGS_CHANGED', settings: updated });
  };

  const handleToggleJobplanetRating = async () => {
    const updated = await StorageManager.saveSettings({
      showJobplanetRating: !settings.showJobplanetRating,
    });
    setSettings(updated);
    notifyContentScript({ type: 'SETTINGS_CHANGED', settings: updated });
  };

  const handleToggleBlindRating = async () => {
    const updated = await StorageManager.saveSettings({
      showBlindRating: !settings.showBlindRating,
    });
    setSettings(updated);
    notifyContentScript({ type: 'SETTINGS_CHANGED', settings: updated });
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCompany.trim();
    if (!trimmed) return;

    await StorageManager.addBlockItem(trimmed, 'company', { platform: currentPlatform });
    const updatedList = await StorageManager.getBlockList();
    notifyContentScript({ type: 'BLOCKLIST_CHANGED', items: updatedList });

    // 추가 즉시 전체 통계 및 탭 통계 실시간 재집계
    await loadTotalStats();
    loadPageStats();

    setNewCompany('');
    setStatusMsg(UI_MESSAGES.BLOCK_SUCCESS(trimmed));
    setTimeout(() => setStatusMsg(''), FILTER_CONFIG.STATUS_MESSAGE_TIMEOUT_MS);
  };

  const notifyContentScript = (message: any) => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      const sendToTab = (tabId?: number) => {
        if (tabId) {
          try {
            chrome.tabs.sendMessage(tabId, message, () => {
              if (chrome.runtime?.lastError) {
                // Ignore tab without listener
              }
            });
          } catch {
            // ignore
          }
        }
      };

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime?.lastError || !tabs?.[0]?.id) {
          chrome.tabs.query({ active: true, lastFocusedWindow: true }, (fallbackTabs) => {
            sendToTab(fallbackTabs?.[0]?.id);
          });
        } else {
          sendToTab(tabs[0].id);
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
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <img src="/icons/icon-32.png" alt="Logo" style={{ width: '22px', height: '22px' }} />
          {UI_MESSAGES.POPUP_TITLE}
        </h1>
        <button className="options-btn" onClick={openOptionsPage} title="상세 설정">
          ⚙️
        </button>
      </div>

      {/* 통계 모드 세그먼트 탭 & 카드 (기본: 전체 등록 누적 통계) */}
      <div className="stats-container">
        <div className="stats-tab-group">
          <button
            type="button"
            className={`stats-tab-btn ${statsMode === POPUP_STATS_CONFIG.MODES.TOTAL ? 'active' : ''}`}
            onClick={() => setStatsMode(POPUP_STATS_CONFIG.MODES.TOTAL)}
          >
            {POPUP_STATS_CONFIG.MODE_LABELS.TOTAL}
          </button>
          <button
            type="button"
            className={`stats-tab-btn ${statsMode === POPUP_STATS_CONFIG.MODES.PAGE ? 'active' : ''}`}
            onClick={() => setStatsMode(POPUP_STATS_CONFIG.MODES.PAGE)}
            title={!isJobSite ? POPUP_STATS_CONFIG.NOT_JOB_SITE_TOOLTIP : undefined}
          >
            {POPUP_STATS_CONFIG.MODE_LABELS.PAGE}
            {isJobSite && <span className="site-indicator" />}
          </button>
        </div>

        <div className="stats-card">
          {statsMode === POPUP_STATS_CONFIG.MODES.TOTAL ? (
            <>
              <div className="stat-item">
                <div className="stat-value">{totalStats.total}</div>
                <div className="stat-label">{POPUP_STATS_CONFIG.TOTAL_LABELS.TOTAL}</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{totalStats.companies}</div>
                <div className="stat-label">{POPUP_STATS_CONFIG.TOTAL_LABELS.COMPANIES}</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{totalStats.jobs}</div>
                <div className="stat-label">{POPUP_STATS_CONFIG.TOTAL_LABELS.JOBS}</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{totalStats.keywords}</div>
                <div className="stat-label">{POPUP_STATS_CONFIG.TOTAL_LABELS.KEYWORDS}</div>
              </div>
            </>
          ) : (
            <>
              <div className="stat-item">
                <div className="stat-value">{pageStats.totalBlocked}</div>
                <div className="stat-label">{POPUP_STATS_CONFIG.PAGE_LABELS.TOTAL}</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{pageStats.blockedCompanies}</div>
                <div className="stat-label">{POPUP_STATS_CONFIG.PAGE_LABELS.COMPANIES}</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{pageStats.blockedJobs}</div>
                <div className="stat-label">{POPUP_STATS_CONFIG.PAGE_LABELS.JOBS}</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{pageStats.blockedAds}</div>
                <div className="stat-label">{POPUP_STATS_CONFIG.PAGE_LABELS.ADS}</div>
              </div>
            </>
          )}
        </div>
        {statsMode === POPUP_STATS_CONFIG.MODES.PAGE && !isJobSite && (
          <div className="not-job-site-banner">
            {POPUP_STATS_CONFIG.NOT_JOB_SITE_TOOLTIP}
          </div>
        )}
      </div>

      <div className="section">
        <div className="toggle-row">
          <span className="toggle-label">
            {settings.mode === 'blur'
              ? UI_MESSAGES.TOGGLE_LABELS.MODE_BLUR
              : UI_MESSAGES.TOGGLE_LABELS.MODE_HIDE}
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
          <span className="toggle-label">{UI_MESSAGES.TOGGLE_LABELS.HIDE_ADS}</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.hideAds}
              onChange={handleToggleAds}
            />
            <span className="slider"></span>
          </label>
        </div>

        <div className="toggle-row" style={{ marginTop: '10px' }}>
          <span className="toggle-label">{UI_MESSAGES.TOGGLE_LABELS.INFINITE_SCROLL}</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.enableInfiniteScroll}
              onChange={handleToggleInfiniteScroll}
            />
            <span className="slider"></span>
          </label>
        </div>

        <div className="toggle-row" style={{ marginTop: '10px' }}>
          <span className="toggle-label">{UI_MESSAGES.TOGGLE_LABELS.JOBPLANET_RATING}</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.showJobplanetRating}
              onChange={handleToggleJobplanetRating}
            />
            <span className="slider"></span>
          </label>
        </div>

        <div className="toggle-row" style={{ marginTop: '10px' }}>
          <span className="toggle-label">{UI_MESSAGES.TOGGLE_LABELS.BLIND_RATING}</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.showBlindRating}
              onChange={handleToggleBlindRating}
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
