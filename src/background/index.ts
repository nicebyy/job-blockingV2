import { ExtensionMessage } from '../types';
import { BADGE_CONFIG } from '../constants';

/**
 * Background Service Worker
 */

export function updateBadge(tabId: number, count: number): string {
  const text =
    BADGE_CONFIG.ENABLED && count > 0
      ? count > BADGE_CONFIG.MAX_DISPLAY_COUNT
        ? BADGE_CONFIG.OVERFLOW_TEXT
        : String(count)
      : '';

  if (typeof chrome !== 'undefined' && chrome.action?.setBadgeText) {
    chrome.action.setBadgeText({ tabId, text });
    if (BADGE_CONFIG.ENABLED && text !== '') {
      chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_CONFIG.COLOR });
    }
  }

  return text;
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    console.log('Job Filter V2 확장 프로그램이 설치/업데이트되었습니다.');
  });
}

// 메시지 수신 및 뱃지 업데이트
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    if (message.type === 'UPDATE_BADGE') {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        updateBadge(tabId, message.count);
      }
      sendResponse({ success: true });
      return true;
    }
  });
}

