/* ═══════════════════════════════════════
   content.js — Message Bridge (V2)
   Handles GET_JOB_DATA from popup, relays scraper data.
   ═══════════════════════════════════════ */

(function () {
  'use strict';

  // Listen for messages from popup or background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_JOB_DATA') {
      try {
        // Try cached data first (from scraper's auto-extract)
        if (window.__jobTrackrData) {
          sendResponse({ success: true, data: window.__jobTrackrData });
          return true;
        }
        // Try live scrape
        if (window.__jobTrackrScraper) {
          const data = window.__jobTrackrScraper.scrapeAll();
          sendResponse({ success: true, data });
          return true;
        }
        sendResponse({ success: false, error: 'Scraper not loaded' });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true;
    }

    if (message.type === 'PING') {
      sendResponse({ success: true });
      return true;
    }
  });

  // Notify background that content script is ready
  try {
    chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', url: window.location.href });
  } catch { /* background not ready */ }
})();
