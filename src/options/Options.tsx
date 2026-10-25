import React, { useEffect, useState } from 'react';
import { BlockItem, BlockType } from '../types';
import { StorageManager } from '../core/storage';
import { UI_MESSAGES } from '../constants';

export const Options: React.FC = () => {
  const [blockList, setBlockList] = useState<BlockItem[]>([]);
  const [pattern, setPattern] = useState('');
  const [type, setType] = useState<BlockType>('company');
  const [search, setSearch] = useState('');

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

  const filteredList = blockList.filter((item) =>
    item.pattern.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="options-container">
      <div className="options-card">
        <div className="options-header">
          <h1>🛡️ 잡필터 V2 - 차단 목록 관리</h1>
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

        <div style={{ marginBottom: '14px' }}>
          <input
            type="text"
            className="input-text"
            style={{ width: '100%' }}
            placeholder="등록된 목록 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {filteredList.length === 0 ? (
          <div className="empty-state">
            {search ? UI_MESSAGES.EMPTY_SEARCH_RESULT : UI_MESSAGES.EMPTY_BLOCK_LIST}
          </div>
        ) : (
          <ul className="block-list">
            {filteredList.map((item) => (
              <li key={item.id} className="block-item">
                <div>
                  <span
                    className={`block-badge ${
                      item.type === 'company' ? 'badge-company' : 'badge-keyword'
                    }`}
                  >
                    {item.type === 'company' ? '회사' : '키워드'}
                  </span>
                  <strong>{item.pattern}</strong>
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
