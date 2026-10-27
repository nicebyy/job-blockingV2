import React, { useEffect, useState, useMemo } from 'react';
import { BlockItem, BlockType, DEFAULT_SETTINGS, FilterSettings } from '../types';
import { StorageManager, normalizeBlockList } from '../core/storage';
import { UI_MESSAGES, OPTIONS_FILTER_CONFIG, OptionsFilterType, PLATFORM_CONFIG, PlatformFilterType, SUPPORT_CONFIG } from '../constants';
import { formatDate } from '../utils/date';

export const Options: React.FC = () => {
  const [blockList, setBlockList] = useState<BlockItem[]>([]);
  const [pattern, setPattern] = useState('');
  const [type, setType] = useState<BlockType>('company');
  const [search, setSearch] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<OptionsFilterType>(OPTIONS_FILTER_CONFIG.ALL);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformFilterType>(PLATFORM_CONFIG.ALL);
  const [settings, setSettings] = useState<FilterSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    loadBlockList();
    StorageManager.getSettings().then(setSettings);
  }, []);

  const loadBlockList = async () => {
    const list = await StorageManager.getBlockList();
    setBlockList(list);
  };

  /**
   * 회사명 매칭 정책 변경.
   * exact(정확 일치) / contains(부분 일치, 계열사 일괄 차단)
   */
  const handleToggleMatchMode = async () => {
    const nextMode = settings.companyMatchMode === 'contains' ? 'exact' : 'contains';
    const updated = await StorageManager.saveSettings({ companyMatchMode: nextMode });
    setSettings(updated);
    // 열려 있는 채용 사이트 탭에 즉시 반영
    notifyContentScript({ type: 'SETTINGS_CHANGED', settings: updated });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim()) return;

    await StorageManager.addBlockItem(pattern.trim(), type, { platform: 'custom' });
    setPattern('');
    await loadBlockList();
    // 차단 목록 변경을 열려 있는 탭에 즉시 전파 (기존에는 새로고침 전까지 반영되지 않았다)
    notifyContentScript({ type: 'BLOCKLIST_CHANGED', items: await StorageManager.getBlockList() });
  };

  const handleDelete = async (id: string) => {
    await StorageManager.removeBlockItem(id);
    await loadBlockList();
    notifyContentScript({ type: 'BLOCKLIST_CHANGED', items: await StorageManager.getBlockList() });
  };

  /**
   * 열려 있는 채용 사이트 탭의 content script 에 메시지를 전달한다.
   * (Options 는 지금까지 storage 만 쓰고 알림을 보내지 않아 변경이 즉시 반영되지 않았다)
   */
  const notifyContentScript = (message: unknown) => {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return;
    try {
      chrome.tabs.query({}, (tabs) => {
        if (chrome.runtime?.lastError) return;
        for (const tab of tabs || []) {
          if (!tab.id) continue;
          try {
            chrome.tabs.sendMessage(tab.id, message, () => {
              // content script 가 없는 탭(설정 페이지 등)은 무시
              void chrome.runtime?.lastError;
            });
          } catch {
            // 개별 탭 전송 실패는 무시
          }
        }
      });
    } catch {
      // chrome API 사용 불가 환경 무시
    }
  };

  const handlePurgeExpired = async () => {
    const purgedCount = await StorageManager.purgeExpiredJobs();
    if (purgedCount > 0) {
      alert(UI_MESSAGES.PURGE_EXPIRED_SUCCESS(purgedCount));
    } else {
      alert(UI_MESSAGES.EMPTY_EXPIRED_LIST);
    }
    loadBlockList();
  };

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(blockList, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `job_filter_blocklist_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (!Array.isArray(imported)) {
          alert(UI_MESSAGES.IMPORT_INVALID_JSON);
          return;
        }

        // [중요] 원소 단위 스키마 검증.
        // 기존에는 배열인지만 확인하고 그대로 저장해서, [null] 같은 손상 항목이 들어가면
        // getBlockList() 가 TypeError 를 던져 팝업·옵션·content script 가 모두 정지했다.
        const validItems = normalizeBlockList(imported);
        const skipped = imported.length - validItems.length;

        await StorageManager.saveBlockList(validItems);
        await loadBlockList();
        notifyContentScript({ type: 'BLOCKLIST_CHANGED', items: validItems });

        if (skipped > 0) {
          alert(UI_MESSAGES.IMPORT_SUCCESS_WITH_SKIPPED(validItems.length, skipped));
        } else {
          alert(UI_MESSAGES.IMPORT_SUCCESS);
        }
      } catch (err) {
        alert(UI_MESSAGES.IMPORT_INVALID_JSON);
      } finally {
        // 같은 파일을 다시 선택해도 onChange 가 발생하도록 초기화
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // 카테고리(유형)별 차단 개수 계산
  const typeCounts = useMemo(() => {
    return {
      [OPTIONS_FILTER_CONFIG.ALL]: blockList.length,
      [OPTIONS_FILTER_CONFIG.COMPANY]: blockList.filter((item) => item.type === 'company').length,
      [OPTIONS_FILTER_CONFIG.JOB]: blockList.filter((item) => item.type === 'job').length,
      [OPTIONS_FILTER_CONFIG.KEYWORD]: blockList.filter((item) => item.type === 'keyword').length,
    };
  }, [blockList]);

  // 플랫폼별 차단 개수 계산 (현재 선택된 유형 조건과 연동)
  const platformCounts = useMemo(() => {
    const baseList =
      selectedFilter === OPTIONS_FILTER_CONFIG.ALL
        ? blockList
        : blockList.filter((item) => item.type === selectedFilter);

    return {
      [PLATFORM_CONFIG.ALL]: baseList.length,
      [PLATFORM_CONFIG.SARAMIN]: baseList.filter((item) => item.platform === PLATFORM_CONFIG.SARAMIN).length,
      [PLATFORM_CONFIG.JOBKOREA]: baseList.filter((item) => item.platform === PLATFORM_CONFIG.JOBKOREA).length,
      [PLATFORM_CONFIG.WANTED]: baseList.filter((item) => item.platform === PLATFORM_CONFIG.WANTED).length,
      [PLATFORM_CONFIG.REMEMBER]: baseList.filter((item) => item.platform === PLATFORM_CONFIG.REMEMBER).length,
      [PLATFORM_CONFIG.JUMPIT]: baseList.filter((item) => item.platform === PLATFORM_CONFIG.JUMPIT).length,
      [PLATFORM_CONFIG.CUSTOM]: baseList.filter(
        (item) => !item.platform || item.platform === PLATFORM_CONFIG.CUSTOM
      ).length,
    };
  }, [blockList, selectedFilter]);

  // 카테고리 탭 + 플랫폼 탭 + 검색어 복합 필터링
  const filteredList = useMemo(() => {
    return blockList.filter((item) => {
      // 1. 카테고리(유형) 필터 검사
      if (selectedFilter !== OPTIONS_FILTER_CONFIG.ALL && item.type !== selectedFilter) {
        return false;
      }
      // 2. 플랫폼 필터 검사
      if (selectedPlatform !== PLATFORM_CONFIG.ALL) {
        const itemPlatform = item.platform || PLATFORM_CONFIG.CUSTOM;
        if (itemPlatform !== selectedPlatform) {
          return false;
        }
      }
      // 3. 검색어 검사 (패턴, 회사명, 공고제목, 플랫폼명 통합 검색)
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchPattern = item.pattern.toLowerCase().includes(q);
        const matchCompany = item.companyName?.toLowerCase().includes(q) ?? false;
        const matchTitle = item.title?.toLowerCase().includes(q) ?? false;
        const itemPlatform = item.platform || PLATFORM_CONFIG.CUSTOM;
        const matchPlatform = PLATFORM_CONFIG.LABELS[itemPlatform]?.toLowerCase().includes(q) ?? false;
        return matchPattern || matchCompany || matchTitle || matchPlatform;
      }
      return true;
    });
  }, [blockList, selectedFilter, selectedPlatform, search]);

  const getEmptyMessage = () => {
    if (search.trim()) {
      return UI_MESSAGES.EMPTY_SEARCH_RESULT;
    }
    if (selectedPlatform !== PLATFORM_CONFIG.ALL) {
      const platformLabel = PLATFORM_CONFIG.LABELS[selectedPlatform];
      return `${platformLabel}에서 등록된 차단 항목이 없습니다.`;
    }
    switch (selectedFilter) {
      case OPTIONS_FILTER_CONFIG.COMPANY:
        return OPTIONS_FILTER_CONFIG.EMPTY_MESSAGES.COMPANY;
      case OPTIONS_FILTER_CONFIG.JOB:
        return OPTIONS_FILTER_CONFIG.EMPTY_MESSAGES.JOB;
      case OPTIONS_FILTER_CONFIG.KEYWORD:
        return OPTIONS_FILTER_CONFIG.EMPTY_MESSAGES.KEYWORD;
      default:
        return OPTIONS_FILTER_CONFIG.EMPTY_MESSAGES.ALL;
    }
  };

  return (
    <div className="options-container">
      <div className="options-card">
        <div className="options-header">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/icons/icon-48.png" alt="Logo" style={{ width: '28px', height: '28px' }} />
            {UI_MESSAGES.OPTIONS_TITLE}
          </h1>
          <span style={{ color: '#64748b' }}>총 {blockList.length}개 차단 중</span>
        </div>

        <form onSubmit={handleAdd} className="input-row">
          <select
            className="select-type"
            value={type}
            onChange={(e) => setType(e.target.value as BlockType)}
          >
            <option value="company">회사명</option>
            <option value="keyword">제목 키워드</option>
            <option value="job">공고 ID</option>
          </select>
          <input
            type="text"
            className="input-text"
            placeholder={type === 'company' ? '차단할 회사명 입력' : '차단할 키워드 입력'}
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
          />
          <button type="submit" className="btn-primary">
            등록
          </button>
        </form>

        <div style={{ marginBottom: '12px' }}>
          <input
            type="text"
            className="input-text"
            style={{ width: '100%' }}
            placeholder="등록된 목록 검색 (회사명, 공고명, 패턴, 플랫폼)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* 회사명 매칭 정책 설정 */}
        <div className="match-mode-row">
          <span className="match-mode-label">
            {settings.companyMatchMode === 'contains'
              ? UI_MESSAGES.TOGGLE_LABELS.COMPANY_MATCH_CONTAINS
              : UI_MESSAGES.TOGGLE_LABELS.COMPANY_MATCH_EXACT}
          </span>
          <button
            type="button"
            className={`match-mode-toggle ${
              settings.companyMatchMode === 'contains' ? 'active' : ''
            }`}
            onClick={handleToggleMatchMode}
            aria-pressed={settings.companyMatchMode === 'contains'}
            title={
              settings.companyMatchMode === 'contains'
                ? UI_MESSAGES.COMPANY_MATCH_TOOLTIPS.CONTAINS
                : UI_MESSAGES.COMPANY_MATCH_TOOLTIPS.EXACT
            }
          >
            {settings.companyMatchMode === 'contains' ? '부분 일치' : '정확 일치'}
          </button>
        </div>

        {/* 2단 다층 필터링 컨테이너 */}
        <div className="filter-container">
          {/* 1단: 차단 유형 카테고리 필터 탭 */}
          <div className="filter-row">
            <span className="filter-label">유형</span>
            <div className="filter-tabs" role="tablist" aria-label="차단 유형 필터">
              {(
                [
                  OPTIONS_FILTER_CONFIG.ALL,
                  OPTIONS_FILTER_CONFIG.COMPANY,
                  OPTIONS_FILTER_CONFIG.JOB,
                  OPTIONS_FILTER_CONFIG.KEYWORD,
                ] as const
              ).map((tabKey) => {
                const label =
                  tabKey === OPTIONS_FILTER_CONFIG.ALL
                    ? OPTIONS_FILTER_CONFIG.LABELS.ALL
                    : tabKey === OPTIONS_FILTER_CONFIG.COMPANY
                    ? OPTIONS_FILTER_CONFIG.LABELS.COMPANY
                    : tabKey === OPTIONS_FILTER_CONFIG.JOB
                    ? OPTIONS_FILTER_CONFIG.LABELS.JOB
                    : OPTIONS_FILTER_CONFIG.LABELS.KEYWORD;
                const count = typeCounts[tabKey];
                const isActive = selectedFilter === tabKey;

                return (
                  <button
                    key={tabKey}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`filter-tab-btn ${isActive ? 'active' : ''}`}
                    onClick={() => setSelectedFilter(tabKey)}
                  >
                    <span>{label}</span>
                    <span className="filter-tab-count">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2단: 채용 플랫폼 필터 탭 */}
          <div className="filter-row">
            <span className="filter-label">플랫폼</span>
            <div className="platform-filter-tabs" role="tablist" aria-label="채용 플랫폼 필터">
              {(
                [
                  PLATFORM_CONFIG.ALL,
                  PLATFORM_CONFIG.SARAMIN,
                  PLATFORM_CONFIG.JOBKOREA,
                  PLATFORM_CONFIG.WANTED,
                  PLATFORM_CONFIG.REMEMBER,
                  PLATFORM_CONFIG.JUMPIT,
                  PLATFORM_CONFIG.CUSTOM,
                ] as const
              ).map((platKey) => {
                const label = PLATFORM_CONFIG.LABELS[platKey];
                const count = platformCounts[platKey];
                const isActive = selectedPlatform === platKey;

                return (
                  <button
                    key={platKey}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`platform-tab-btn ${isActive ? 'active' : ''}`}
                    onClick={() => setSelectedPlatform(platKey)}
                  >
                    <span>{label}</span>
                    <span className="platform-tab-count">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {filteredList.length === 0 ? (
          <div className="empty-state">
            {getEmptyMessage()}
          </div>
        ) : (
          <ul className="block-list">
            {filteredList.map((item) => {
              const itemPlatform = item.platform || PLATFORM_CONFIG.CUSTOM;
              const platformLabel = PLATFORM_CONFIG.LABELS[itemPlatform];
              const platformClass = PLATFORM_CONFIG.BADGE_CLASSES[itemPlatform];

              return (
                <li key={item.id} className="block-item">
                  <div className="block-item-content">
                    {/* 차단 유형 뱃지 */}
                    <span
                      className={`block-badge ${
                        item.type === 'company'
                          ? 'badge-company'
                          : item.type === 'job'
                          ? 'badge-job'
                          : 'badge-keyword'
                      }`}
                    >
                      {item.type === 'company' ? '회사' : item.type === 'job' ? '공고' : '키워드'}
                    </span>

                    {/* 차단 플랫폼 뱃지 */}
                    <span className={`platform-badge ${platformClass}`}>
                      {platformLabel}
                    </span>

                    <strong>
                      {item.type === 'job'
                        ? `${item.companyName ? `[${item.companyName}] ` : ''}${item.title || item.pattern}`
                        : item.pattern}
                    </strong>
                    {item.type === 'job' && item.expiresAt && (
                      <span
                        className="expire-tag"
                        title={`공고 마감 정보: ${item.closingDate || '상시채용/미정'} (마감 후 30일 보관)`}
                      >
                        만료: {formatDate(item.expiresAt)}
                      </span>
                    )}
                  </div>
                  <button
                    className="btn-delete"
                    onClick={() => handleDelete(item.id)}
                    title="삭제"
                  >
                    삭제
                  </button>
                </li>
              );
            })}
          </ul>
        )}


        <div className="action-bar">
          <button className="btn-secondary" onClick={handlePurgeExpired} title="보관 기한이 지난 마감 공고 일괄 정리">
            🧹 만료 공고 정리
          </button>
          <button className="btn-secondary" onClick={handleExport}>
            📥 목록 내보내기 (Export JSON)
          </button>
          <label className="btn-secondary" style={{ display: 'inline-block', cursor: 'pointer' }}>
            📤 목록 가져오기 (Import JSON)
            <input
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImport}
            />
          </label>
        </div>

        {/* 크롬 웹스토어 평점 리뷰 유도 & 피드백 및 개인정보처리방침 푸터 카드 */}
        <div className="options-footer-section">
          <div className="options-review-card">
            <div className="options-review-text">
              <strong>{SUPPORT_CONFIG.LABELS.RATING_BANNER_TITLE}</strong>
              <p>{SUPPORT_CONFIG.LABELS.RATING_BANNER_DESC}</p>
            </div>
            <button
              type="button"
              className="btn-review"
              onClick={() => {
                const extId = typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.id : '';
                window.open(SUPPORT_CONFIG.CHROME_STORE_REVIEW_URL(extId), '_blank');
              }}
            >
              {SUPPORT_CONFIG.LABELS.RATING_BANNER_ACTION}
            </button>
          </div>

          <div className="options-footer-links">
            <a
              href={SUPPORT_CONFIG.FEEDBACK_URL}
              target="_blank"
              rel="noreferrer"
              className="options-footer-link"
            >
              💬 {SUPPORT_CONFIG.LABELS.FEEDBACK} (Google Forms)
            </a>
            <span className="options-footer-dot">·</span>
            <a
              href={SUPPORT_CONFIG.PRIVACY_POLICY_URL}
              target="_blank"
              rel="noreferrer"
              className="options-footer-link"
            >
              🔒 {SUPPORT_CONFIG.LABELS.PRIVACY} (Privacy Policy)
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
