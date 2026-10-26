import { ExtensionMessage } from '../types';
import { BADGE_CONFIG } from '../constants';
import { JobplanetService } from '../core/jobplanet';
import { BlindService } from '../core/blind';

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

// 메시지 수신 (뱃지 업데이트 및 잡플래닛/블라인드 평점 조회)
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

    if (message.type === 'FETCH_JOBPLANET_RATING') {
      JobplanetService.getInstance()
        .getRating(message.companyName)
        .then((info) => {
          sendResponse(info);
        })
        .catch(() => {
          sendResponse({
            platform: 'jobplanet',
            status: 'error',
            companyName: message.companyName,
            cachedAt: Date.now(),
          });
        });
      return true; // 비동기 응답 유지
    }

    if (message.type === 'FETCH_BLIND_RATING') {
      BlindService.getInstance()
        .getRating(message.companyName)
        .then((info) => {
          sendResponse(info);
        })
        .catch(() => {
          sendResponse({
            platform: 'blind',
            status: 'error',
            companyName: message.companyName,
            cachedAt: Date.now(),
          });
        });
      return true; // 비동기 응답 유지
    }
  });
}


