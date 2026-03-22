/* ═══════════════════════════════════════
   background.js — Service Worker
   ═══════════════════════════════════════ */

/* ─── Inline Storage Helpers (service worker can't import ES modules) ─── */
const BG_STORAGE_KEY_APPS = 'jt_apps';
const BG_STORAGE_KEY_SETTINGS = 'jt_settings';

const BG_DEFAULT_SETTINGS = {
  emailA: '', emailB: '', defaultEmail: 'A', defaultStatus: 'Applied',
  labelA: 'Primary', labelB: 'Referral', weeklyGoal: 5
};

const BG_TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'refId', 'trackingId', 'from', 'src', 'lipi', 'trk', 'trkInfo',
  'ref', 'referrer', 'source', 'campaign', 'medium', 'fbclid', 'gclid'
];

const BG_COMPANY_SUFFIXES = [
  'inc', 'ltd', 'llc', 'technologies', 'tech', 'software', 'solutions',
  'pvt', 'private', 'limited', 'corporation', 'corp', 'co', 'company',
  'group', 'services', 'consulting', 'labs', 'studio', 'studios'
];

function bgStorageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(keys, r => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(r));
  });
}

function bgStorageSet(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(data, () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve());
  });
}

async function bgGetApps() {
  const r = await bgStorageGet(BG_STORAGE_KEY_APPS);
  return r[BG_STORAGE_KEY_APPS] || [];
}

async function bgGetSettings() {
  const r = await bgStorageGet(BG_STORAGE_KEY_SETTINGS);
  return { ...BG_DEFAULT_SETTINGS, ...(r[BG_STORAGE_KEY_SETTINGS] || {}) };
}

function bgGenerateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function bgSanitize(str, maxLen = 500) {
  return typeof str === 'string' ? str.trim().substring(0, maxLen) : '';
}

function bgNormalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    BG_TRACKING_PARAMS.forEach(p => u.searchParams.delete(p));
    u.hash = '';
    u.searchParams.sort();
    return u.origin + u.pathname.replace(/\/+$/, '') + (u.search || '');
  } catch { return url.trim().toLowerCase(); }
}

function bgNormalizeCompany(name) {
  if (!name) return '';
  let n = name.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
  BG_COMPANY_SUFFIXES.forEach(s => { n = n.replace(new RegExp(`\\b${s}\\b`, 'gi'), ''); });
  return n.trim();
}

function bgNormalizeRole(title) {
  if (!title) return '';
  return title.toLowerCase().trim()
    .replace(/[^\w\s]/g, '').replace(/\s+/g, ' ')
    .replace(/\b(senior|sr|junior|jr|lead|principal|staff|intern|co-op)\b/gi, '').trim();
}

function bgCheckDuplicate(entry, apps) {
  // Tier 1
  if (entry.jobId) {
    const m = apps.find(a => a.jobId && a.jobId === entry.jobId);
    if (m) return { tier: 1, match: m };
  }
  // Tier 2
  const normUrl = bgNormalizeUrl(entry.jobUrl);
  if (normUrl) {
    const m = apps.find(a => bgNormalizeUrl(a.jobUrl) === normUrl);
    if (m) return { tier: 2, match: m };
  }
  // Tier 3
  const nc = bgNormalizeCompany(entry.company);
  const nr = bgNormalizeRole(entry.role);
  if (nc && nr) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 180);
    const m = apps.find(a => {
      if (new Date(a.dateApplied) < cutoff) return false;
      return bgNormalizeCompany(a.company) === nc && bgNormalizeRole(a.role) === nr;
    });
    if (m) return { tier: 3, match: m };
  }
  return { tier: null, match: null };
}

/* ─── Badge Management ─── */
async function updateBadge() {
  try {
    const apps = await bgGetApps();
    const now = new Date();
    const day = now.getDay();
    const mondayOff = day === 0 ? 6 : day - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - mondayOff);
    weekStart.setHours(0, 0, 0, 0);

    const count = apps.filter(a => new Date(a.dateApplied) >= weekStart).length;

    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#4F46E5' });
    await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
  } catch (e) {
    console.error('Badge update failed:', e);
  }
}

/* ─── Weekly Monday Badge ─── */
async function showMondaySummary() {
  const now = new Date();
  if (now.getDay() !== 1) return; // Only Monday

  const apps = await bgGetApps();
  const lastWeekStart = new Date(now);
  lastWeekStart.setDate(now.getDate() - 7);
  lastWeekStart.setHours(0, 0, 0, 0);

  const thisWeekStart = new Date(now);
  thisWeekStart.setHours(0, 0, 0, 0);

  const lastWeekCount = apps.filter(a => {
    const d = new Date(a.dateApplied);
    return d >= lastWeekStart && d < thisWeekStart;
  }).length;

  if (lastWeekCount > 0) {
    await chrome.action.setBadgeText({ text: `${lastWeekCount}✓` });
    await chrome.action.setBadgeBackgroundColor({ color: '#059669' });
  }
}

/* ─── Stats Computation ─── */
async function bgGetStats() {
  const apps = await bgGetApps();
  const settings = await bgGetSettings();
  const now = new Date();
  const day = now.getDay();
  const mondayOff = day === 0 ? 6 : day - 1;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - mondayOff);
  weekStart.setHours(0, 0, 0, 0);

  const thisWeek = apps.filter(a => new Date(a.dateApplied) >= weekStart);
  const byStatus = {}, byEmail = { A: 0, B: 0 }, byPlatform = {};
  let referralCount = 0;

  apps.forEach(a => {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    byEmail[a.email] = (byEmail[a.email] || 0) + 1;
    byPlatform[a.platform] = (byPlatform[a.platform] || 0) + 1;
    if (a.referral) referralCount++;
  });

  return {
    total: apps.length,
    thisWeek: thisWeek.length,
    weeklyGoal: settings.weeklyGoal,
    activePipeline: (byStatus['Applied'] || 0) + (byStatus['Interviewing'] || 0),
    referralCount, byStatus, byEmail, byPlatform
  };
}

/* ═══════════════════════════════════════
   Event Listeners
   ═══════════════════════════════════════ */

/* ─── Install / Startup ─── */
chrome.runtime.onInstalled.addListener(async (details) => {
  // Create context menu
  chrome.contextMenus.create({
    id: 'jobtrackr-log',
    title: 'Log this job with JobTrackr',
    contexts: ['page', 'link']
  });

  // Set up daily alarm
  chrome.alarms.create('daily-check', {
    when: getNext9am(),
    periodInMinutes: 24 * 60
  });

  // Initialize settings if first install
  if (details.reason === 'install') {
    const existing = await bgStorageGet(BG_STORAGE_KEY_SETTINGS);
    if (!existing[BG_STORAGE_KEY_SETTINGS]) {
      await bgStorageSet({ [BG_STORAGE_KEY_SETTINGS]: BG_DEFAULT_SETTINGS });
    }
  }

  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await updateBadge();
  await showMondaySummary();
});

/* ─── Alarm Handler ─── */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'daily-check') {
    // Check if user logged 0 apps yesterday
    const apps = await bgGetApps();
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const yesterdayCount = apps.filter(a => {
      const d = new Date(a.dateApplied);
      return d >= yesterday && d < todayStart;
    }).length;

    if (yesterdayCount === 0) {
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#DC2626' });
    }

    // Monday summary
    await showMondaySummary();
  }
});

/* ─── Context Menu Handler ─── */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'jobtrackr-log') {
    // Open the popup by focusing the extension icon (can't open popup programmatically)
    // Instead, inject content script if needed and open popup via action
    try {
      // Ensure content scripts are injected
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['scraper.js', 'content.js']
      });
    } catch { /* may already be injected */ }

    // Open side panel or popup — using chrome.action.openPopup if available
    try {
      await chrome.action.openPopup();
    } catch {
      // Fallback: can't open popup programmatically in all Chrome versions
      // Set a flag so popup knows it was triggered from context menu
      await bgStorageSet({ _jt_context_menu_trigger: true });
    }
  }
});

/* ─── Storage Change Listener (for badge updates) ─── */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[BG_STORAGE_KEY_APPS]) {
    updateBadge();
  }
});

/* ─── Message Handler ─── */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_APPLICATION') {
    handleSave(message.data).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  }

  if (message.type === 'FORCE_SAVE_APPLICATION') {
    handleForceSave(message.data).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  }

  if (message.type === 'UPDATE_APPLICATION') {
    handleUpdate(message.id, message.patch).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  }

  if (message.type === 'GET_STATS') {
    bgGetStats().then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  }

  if (message.type === 'CONTENT_SCRIPT_READY') {
    // Content script is loaded, no action needed
    return false;
  }
});

/* ─── Save Handlers ─── */
async function handleSave(data) {
  const apps = await bgGetApps();
  const dup = bgCheckDuplicate(data, apps);

  if (dup.tier === 1 || dup.tier === 2) {
    return { saved: false, duplicate: true, tier: dup.tier, existing: dup.match };
  }

  const now = new Date().toISOString();
  const entry = {
    id: bgGenerateUUID(),
    jobId: data.jobId || null,
    platform: data.platform || 'Other',
    company: bgSanitize(data.company, 200),
    role: bgSanitize(data.role, 200),
    jobUrl: data.jobUrl || '',
    email: data.email || 'A',
    emailA: data.emailA || '',
    emailB: data.emailB || '',
    status: data.status || 'Applied',
    referral: !!data.referral,
    referralPerson: bgSanitize(data.referralPerson || '', 200),
    notes: bgSanitize(data.notes || '', 500),
    dateApplied: now,
    dateUpdated: now,
    source: data.source || 'popup'
  };

  apps.unshift(entry);
  await bgStorageSet({ [BG_STORAGE_KEY_APPS]: apps });
  await updateBadge();

  return {
    saved: true,
    duplicate: false,
    entry,
    softWarning: dup.tier === 3 ? dup : null
  };
}

async function handleForceSave(data) {
  const apps = await bgGetApps();
  const now = new Date().toISOString();
  const entry = {
    id: bgGenerateUUID(),
    jobId: data.jobId || null,
    platform: data.platform || 'Other',
    company: bgSanitize(data.company, 200),
    role: bgSanitize(data.role, 200),
    jobUrl: data.jobUrl || '',
    email: data.email || 'A',
    emailA: data.emailA || '',
    emailB: data.emailB || '',
    status: data.status || 'Re-applied (Referral)',
    referral: !!data.referral,
    referralPerson: bgSanitize(data.referralPerson || '', 200),
    notes: bgSanitize(data.notes || '', 500),
    dateApplied: now,
    dateUpdated: now,
    source: data.source || 'popup'
  };
  apps.unshift(entry);
  await bgStorageSet({ [BG_STORAGE_KEY_APPS]: apps });
  await updateBadge();
  return { saved: true, entry };
}

async function handleUpdate(id, patch) {
  const apps = await bgGetApps();
  const idx = apps.findIndex(a => a.id === id);
  if (idx === -1) throw new Error('Application not found');
  apps[idx] = { ...apps[idx], ...patch, dateUpdated: new Date().toISOString() };
  await bgStorageSet({ [BG_STORAGE_KEY_APPS]: apps });
  await updateBadge();
  return { updated: true, entry: apps[idx] };
}

/* ─── Helpers ─── */
function getNext9am() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(9, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime();
}
