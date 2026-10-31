import { ExtensionMessage } from '../types';
import { BADGE_CONFIG, WELCOME_CONFIG } from '../constants';
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

export function handleInstalled(details: chrome.runtime.InstalledDetails): void {
  if (details?.reason === WELCOME_CONFIG.INSTALL_REASON) {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create && chrome.runtime?.getURL) {
      chrome.tabs.create({
        url: chrome.runtime.getURL(WELCOME_CONFIG.PAGE_PATH),
      });
    }
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(handleInstalled);
}

export function handleBackgroundMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
): boolean | void {
  if (message.type === 'UPDATE_BADGE') {
    const tabId = sender.tab?.id;
    if (tabId !== undefined) {
      updateBadge(tabId, message.count);
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'CLOSE_CURRENT_TAB') {
    const tabId = sender.tab?.id;
    if (tabId !== undefined && typeof chrome !== 'undefined' && chrome.tabs?.remove) {
      chrome.tabs.remove(tabId).catch(() => {});
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
}

// 메시지 수신 (뱃지 업데이트, 탭 닫기 및 잡플래닛/블라인드 평점 조회)
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener(handleBackgroundMessage);
}


