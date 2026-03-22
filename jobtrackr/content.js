/* ═══════════════════════════════════════
   content.js — Message Bridge
   ═══════════════════════════════════════ */

(function () {
  'use strict';

  // Listen for messages from popup or background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_JOB_DATA') {
      try {
        if (window.__jobTrackrScraper) {
          const data = window.__jobTrackrScraper.scrapeJobDetails();
          sendResponse({ success: true, data });
        } else {
          sendResponse({ success: false, error: 'Scraper not loaded' });
        }
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true; // keep channel open for async
    }

    if (message.type === 'PING') {
      sendResponse({ success: true });
      return true;
    }
  });

  // Notify background that content script is ready
  try {
    chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', url: window.location.href });
  } catch { /* ignore if background isn't ready */ }
})();
