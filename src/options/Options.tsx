import React, { useEffect, useState, useMemo } from 'react';
import { BlockItem, BlockType } from '../types';
import { StorageManager } from '../core/storage';
import { UI_MESSAGES, OPTIONS_FILTER_CONFIG, OptionsFilterType } from '../constants';
import { formatDate } from '../utils/date';

export const Options: React.FC = () => {
  const [blockList, setBlockList] = useState<BlockItem[]>([]);
  const [pattern, setPattern] = useState('');
  const [type, setType] = useState<BlockType>('company');
  const [search, setSearch] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<OptionsFilterType>(OPTIONS_FILTER_CONFIG.ALL);

  useEffect(() => {
    loadBlockList();
  }, []);

  const loadBlockList = async () => {
    const list = await StorageManager.getBlockList();
    setBlockList(list);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim()) return;

    await StorageManager.addBlockItem(pattern.trim(), type);
    setPattern('');
    loadBlockList();
  };

  const handleDelete = async (id: string) => {
    await StorageManager.removeBlockItem(id);
    loadBlockList();
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
        if (Array.isArray(imported)) {
          await StorageManager.saveBlockList(imported);
          loadBlockList();
          alert(UI_MESSAGES.IMPORT_SUCCESS);
        }
      } catch (err) {
        alert(UI_MESSAGES.IMPORT_INVALID_JSON);
      }
    };
    reader.readAsText(file);
  };

  // 카테고리별 차단 개수 계산
  const counts = useMemo(() => {
    return {
      [OPTIONS_FILTER_CONFIG.ALL]: blockList.length,
      [OPTIONS_FILTER_CONFIG.COMPANY]: blockList.filter((item) => item.type === 'company').length,
      [OPTIONS_FILTER_CONFIG.JOB]: blockList.filter((item) => item.type === 'job').length,
      [OPTIONS_FILTER_CONFIG.KEYWORD]: blockList.filter((item) => item.type === 'keyword').length,
    };
  }, [blockList]);

  // 카테고리 탭 및 검색어 복합 필터링
  const filteredList = useMemo(() => {
    return blockList.filter((item) => {
      // 1. 카테고리 필터 검사
      if (selectedFilter !== OPTIONS_FILTER_CONFIG.ALL && item.type !== selectedFilter) {
        return false;
      }
      // 2. 검색어 검사 (패턴, 회사명, 공고제목 통합 검색)
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchPattern = item.pattern.toLowerCase().includes(q);
        const matchCompany = item.companyName?.toLowerCase().includes(q) ?? false;
        const matchTitle = item.title?.toLowerCase().includes(q) ?? false;
        return matchPattern || matchCompany || matchTitle;
      }
      return true;
    });
  }, [blockList, selectedFilter, search]);

  const getEmptyMessage = () => {
    if (search.trim()) {
      return UI_MESSAGES.EMPTY_SEARCH_RESULT;
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
            placeholder="등록된 목록 검색 (회사명, 공고명, 패턴)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* 차단 유형 카테고리 필터 탭 */}
        <div className="filter-tabs" role="tablist" aria-label="차단 항목 필터">
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
            const count = counts[tabKey];
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

        {filteredList.length === 0 ? (
          <div className="empty-state">
            {getEmptyMessage()}
          </div>
        ) : (
          <ul className="block-list">

            {filteredList.map((item) => (
              <li key={item.id} className="block-item">
                <div>
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
            ))}
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
      </div>
    </div>
  );
};
