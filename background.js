/* ═══════════════════════════════════════
   background.js — Service Worker (V2)
   Badge, alarms, context menu, message handlers
   ═══════════════════════════════════════ */

const BG_KEY_APPS = 'jt_apps';
const BG_KEY_SETTINGS = 'jt_settings';
const BG_DEFAULTS = {
  emailA: '', emailB: '', defaultEmail: 'A', defaultStatus: 'Applied',
  labelA: 'Primary', labelB: 'Referral', weeklyGoal: 5
};

/* ─── Storage Helpers ─── */
function bgGet(keys) {
  return new Promise((res, rej) => chrome.storage.sync.get(keys, r => chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res(r)));
}
function bgSet(data) {
  return new Promise((res, rej) => chrome.storage.sync.set(data, () => chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res()));
}
async function bgGetApps() { return (await bgGet(BG_KEY_APPS))[BG_KEY_APPS] || []; }
async function bgGetSettings() { return { ...BG_DEFAULTS, ...((await bgGet(BG_KEY_SETTINGS))[BG_KEY_SETTINGS] || {}) }; }

function bgUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function bgSanitize(s, max = 500) { return typeof s === 'string' ? s.trim().substring(0, max) : ''; }

/* ─── Badge ─── */
async function updateBadge() {
  try {
    const apps = await bgGetApps();
    const now = new Date();
    const d = now.getDay();
    const off = d === 0 ? 6 : d - 1;
    const ws = new Date(now);
    ws.setDate(now.getDate() - off);
    ws.setHours(0, 0, 0, 0);
    const count = apps.filter(a => new Date(a.dateApplied) >= ws).length;
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#4F46E5' });
    await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
  } catch (e) { console.error('Badge update failed:', e); }
}

/* ─── Dedup (inline minimal version for background) ─── */
const BG_STRIP = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','refId','trk','trkInfo','lipi','trackingId','fbclid','gclid','msclkid','mc_cid','_hsenc','_hsmi'];
const BG_CO_STRIP = ['inc','ltd','llc','pvt','limited','technologies','tech','software','solutions','systems','group','corp','co'];
const BG_ROLE_STRIP = ['senior','sr','junior','jr','lead','staff','principal','associate','assoc','eng','engineer','developer','dev','software','swe','sde'];

function bgNormUrl(url) {
  try { const u = new URL(url); BG_STRIP.forEach(p => u.searchParams.delete(p)); u.hash = ''; u.searchParams.sort(); return u.origin + u.pathname.replace(/\/+$/, '') + (u.search || ''); } catch { return url; }
}
function bgNormCo(n) { if (!n) return ''; let s = n.toLowerCase(); BG_CO_STRIP.forEach(w => { s = s.replace(new RegExp(`\\b${w}\\b`, 'g'), ''); }); return s.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim(); }
function bgNormRole(t) { if (!t) return ''; let s = t.toLowerCase(); BG_ROLE_STRIP.forEach(w => { s = s.replace(new RegExp(`\\b${w}\\b`, 'g'), ''); }); return s.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim(); }

function bgCheckDup(entry, apps) {
  // Tier 1: exact ID
  if (entry.jobId) { const m = apps.find(a => a.jobId && a.jobId === entry.jobId); if (m) return { type: 'exact', match: m }; }
  // Tier 2: URL
  const nu = bgNormUrl(entry.jobUrl);
  if (nu) { const m = apps.find(a => bgNormUrl(a.jobUrl) === nu); if (m) return { type: 'url', match: m }; }
  // Tier 3/4: company+role
  const nc = bgNormCo(entry.company), nr = bgNormRole(entry.role);
  if (nc && nr) {
    const matches = apps.filter(a => bgNormCo(a.company) === nc && bgNormRole(a.role) === nr);
    if (matches.length > 0) {
      matches.sort((a, b) => new Date(b.dateApplied) - new Date(a.dateApplied));
      const mr = matches[0];
      const days = Math.floor((Date.now() - new Date(mr.dateApplied).getTime()) / 86400000);
      if (days > 60 || mr.status === 'Rejected' || mr.status === 'Withdrawn') {
        return { type: 'repost', match: mr };
      }
      return { type: 'fuzzy', match: mr };
    }
  }
  return { type: null, match: null };
}

/* ═══════════════════════════════
   Event Listeners
   ═══════════════════════════════ */

chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.contextMenus.create({ id: 'jobtrackr-log', title: 'Log this job with JobTrackr', contexts: ['page', 'link'] });
  chrome.alarms.create('daily-check', { when: getNext9am(), periodInMinutes: 1440 });
  if (details.reason === 'install') {
    const existing = await bgGet(BG_KEY_SETTINGS);
    if (!existing[BG_KEY_SETTINGS]) await bgSet({ [BG_KEY_SETTINGS]: BG_DEFAULTS });
  }
  await updateBadge();
});

chrome.runtime.onStartup.addListener(updateBadge);

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'daily-check') return;
  const apps = await bgGetApps();
  const now = new Date();
  const yday = new Date(now); yday.setDate(now.getDate() - 1); yday.setHours(0, 0, 0, 0);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const yCount = apps.filter(a => { const d = new Date(a.dateApplied); return d >= yday && d < today; }).length;
  if (yCount === 0) {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#DC2626' });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'jobtrackr-log') return;
  try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['scraper.js', 'content.js'] }); } catch { /* already injected */ }
  try { await chrome.action.openPopup(); } catch { /* not supported in all versions */ }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[BG_KEY_APPS]) updateBadge();
});

/* ─── Message Handler ─── */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SAVE_APPLICATION') {
    handleSave(msg.data).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === 'FORCE_SAVE_APPLICATION') {
    handleForceSave(msg.data).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === 'UPDATE_APPLICATION') {
    handleUpdate(msg.id, msg.patch).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === 'GET_STATS') {
    handleStats().then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === 'CONTENT_SCRIPT_READY' || msg.type === 'SCRAPED_DATA') return false;
});

async function handleSave(data) {
  const apps = await bgGetApps();
  const settings = await bgGetSettings();
  const dup = bgCheckDup(data, apps);
  if (dup.type === 'exact' || dup.type === 'url') return { saved: false, duplicate: true, type: dup.type, existing: dup.match };

  const now = new Date().toISOString();
  const entry = {
    id: bgUUID(), jobId: data.jobId || null, rawJobId: data.rawJobId || '',
    platform: data.platform || 'Other', siteType: data.siteType || 'employer',
    company: bgSanitize(data.company, 200), role: bgSanitize(data.role, 200),
    location: bgSanitize(data.location || '', 200), source: bgSanitize(data.source || 'Direct', 100),
    jobUrl: data.jobUrl || '', email: data.email || settings.defaultEmail || 'A',
    emailA: settings.emailA || '', emailB: settings.emailB || '',
    status: data.status || settings.defaultStatus || 'Applied',
    referral: !!data.referral, referralPerson: bgSanitize(data.referralPerson || '', 200),
    notes: bgSanitize(data.notes || '', 500), dateApplied: now, dateUpdated: now,
    loggedFrom: data.loggedFrom || 'popup', linkedJobId: data.linkedJobId || '',
    keywords: data.keywords || { mustHave: [], niceToHave: [], byCategory: {}, experienceLevel: '', yearsRequired: [] }
  };
  apps.unshift(entry);
  await bgSet({ [BG_KEY_APPS]: apps });
  await updateBadge();

  // Return soft warnings (repost/fuzzy) alongside save
  const softDup = (dup.type === 'repost' || dup.type === 'fuzzy') ? dup : null;
  return { saved: true, entry, softWarning: softDup };
}

async function handleForceSave(data) {
  const apps = await bgGetApps();
  const settings = await bgGetSettings();
  const now = new Date().toISOString();
  const entry = {
    id: bgUUID(), jobId: data.jobId || null, rawJobId: data.rawJobId || '',
    platform: data.platform || 'Other', siteType: data.siteType || 'employer',
    company: bgSanitize(data.company, 200), role: bgSanitize(data.role, 200),
    location: bgSanitize(data.location || '', 200), source: bgSanitize(data.source || 'Direct', 100),
    jobUrl: data.jobUrl || '', email: data.email || settings.defaultEmail || 'A',
    emailA: settings.emailA || '', emailB: settings.emailB || '',
    status: data.status || 'Re-applied (Referral)',
    referral: !!data.referral, referralPerson: bgSanitize(data.referralPerson || '', 200),
    notes: bgSanitize(data.notes || '', 500), dateApplied: now, dateUpdated: now,
    loggedFrom: data.loggedFrom || 'popup', linkedJobId: data.linkedJobId || '',
    keywords: data.keywords || { mustHave: [], niceToHave: [], byCategory: {}, experienceLevel: '', yearsRequired: [] }
  };
  apps.unshift(entry);
  await bgSet({ [BG_KEY_APPS]: apps });
  await updateBadge();
  return { saved: true, entry };
}

async function handleUpdate(id, patch) {
  const apps = await bgGetApps();
  const idx = apps.findIndex(a => a.id === id);
  if (idx === -1) throw new Error('Not found');
  apps[idx] = { ...apps[idx], ...patch, dateUpdated: new Date().toISOString() };
  await bgSet({ [BG_KEY_APPS]: apps });
  await updateBadge();
  return { updated: true, entry: apps[idx] };
}

async function handleStats() {
  const apps = await bgGetApps();
  const settings = await bgGetSettings();
  const now = new Date();
  const d = now.getDay(), off = d === 0 ? 6 : d - 1;
  const ws = new Date(now); ws.setDate(now.getDate() - off); ws.setHours(0, 0, 0, 0);
  const thisWeek = apps.filter(a => new Date(a.dateApplied) >= ws);
  const byStatus = {}, byEmail = { A: 0, B: 0 }, byPlatform = {}, bySource = {};
  let referralCount = 0;
  apps.forEach(a => {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    byEmail[a.email] = (byEmail[a.email] || 0) + 1;
    byPlatform[a.platform] = (byPlatform[a.platform] || 0) + 1;
    if (a.source) bySource[a.source] = (bySource[a.source] || 0) + 1;
    if (a.referral) referralCount++;
  });
  return {
    total: apps.length, thisWeek: thisWeek.length, weeklyGoal: settings.weeklyGoal,
    activePipeline: (byStatus['Applied'] || 0) + (byStatus['Interviewing'] || 0),
    referralCount, byStatus, byEmail, byPlatform, bySource
  };
}

function getNext9am() {
  const n = new Date(), x = new Date(n);
  x.setHours(9, 0, 0, 0);
  if (x <= n) x.setDate(x.getDate() + 1);
  return x.getTime();
}
