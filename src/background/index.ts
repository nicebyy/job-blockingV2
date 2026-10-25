import { ExtensionMessage } from '../types';
import { BADGE_CONFIG } from '../constants';

/**
 * Background Service Worker
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('Job Filter V2 확장 프로그램이 설치/업데이트되었습니다.');
});

// 메시지 수신 및 뱃지 업데이트
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type === 'UPDATE_BADGE') {
    const tabId = sender.tab?.id;
    if (tabId !== undefined) {
      const count = message.count;
      const text =
        count > 0
          ? count > BADGE_CONFIG.MAX_DISPLAY_COUNT
            ? BADGE_CONFIG.OVERFLOW_TEXT
            : String(count)
          : '';

      chrome.action.setBadgeText({ tabId, text });
      chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_CONFIG.COLOR });
    }
    sendResponse({ success: true });
    return true;
  }
});
