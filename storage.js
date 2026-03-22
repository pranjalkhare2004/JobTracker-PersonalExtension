/* ═══════════════════════════════════════
   storage.js — CRUD + Settings Helpers (V2)
   ═══════════════════════════════════════ */

const STORAGE_KEY_APPS = 'jt_apps';
const STORAGE_KEY_SETTINGS = 'jt_settings';
const QUOTA_WARNING_BYTES = 90000;

const DEFAULT_SETTINGS = {
  emailA: '',
  emailB: '',
  defaultEmail: 'A',
  defaultStatus: 'Applied',
  labelA: 'Primary',
  labelB: 'Referral',
  weeklyGoal: 5
};

/* ─── Chrome Storage Promise Wrappers ─── */
function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(keys, r => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(r));
  });
}

function storageSet(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(data, () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve());
  });
}

function storageBytesInUse(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.getBytesInUse(keys, b => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(b));
  });
}

/* ─── UUID v4 ─── */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/* ─── Sanitization ─── */
function sanitize(str, maxLen = 500) {
  return typeof str === 'string' ? str.trim().substring(0, maxLen) : '';
}

/* ─── Settings ─── */
async function getSettings() {
  const result = await storageGet(STORAGE_KEY_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY_SETTINGS] || {}) };
}

async function saveSettings(patch) {
  const current = await getSettings();
  const updated = { ...current, ...patch };
  await storageSet({ [STORAGE_KEY_SETTINGS]: updated });
  return updated;
}

/* ─── Application CRUD ─── */
async function getAllApplications() {
  const result = await storageGet(STORAGE_KEY_APPS);
  return result[STORAGE_KEY_APPS] || [];
}

async function saveApplication(data) {
  const apps = await getAllApplications();
  const settings = await getSettings();
  const now = new Date().toISOString();

  const entry = {
    id: generateUUID(),
    jobId: data.jobId || null,
    rawJobId: data.rawJobId || '',
    platform: data.platform || 'Other',
    siteType: data.siteType || 'employer',
    company: sanitize(data.company, 200),
    role: sanitize(data.role, 200),
    location: sanitize(data.location || '', 200),
    source: sanitize(data.source || 'Direct', 100),
    jobUrl: data.jobUrl || '',
    email: data.email || settings.defaultEmail || 'A',
    emailA: settings.emailA || '',
    emailB: settings.emailB || '',
    status: data.status || settings.defaultStatus || 'Applied',
    referral: !!data.referral,
    referralPerson: sanitize(data.referralPerson || '', 200),
    notes: sanitize(data.notes || '', 500),
    dateApplied: now,
    dateUpdated: now,
    loggedFrom: data.loggedFrom || 'popup',
    linkedJobId: data.linkedJobId || '',
    keywords: data.keywords || { mustHave: [], niceToHave: [], byCategory: {}, experienceLevel: '', yearsRequired: [] }
  };

  apps.unshift(entry);
  await storageSet({ [STORAGE_KEY_APPS]: apps });

  // Check storage quota
  let quotaWarning = false;
  try {
    const bytes = await storageBytesInUse(STORAGE_KEY_APPS);
    quotaWarning = bytes > QUOTA_WARNING_BYTES;
  } catch { /* ignore */ }

  return { saved: true, entry, quotaWarning };
}

async function updateApplication(id, patch) {
  const apps = await getAllApplications();
  const idx = apps.findIndex(a => a.id === id);
  if (idx === -1) throw new Error('Application not found');
  apps[idx] = { ...apps[idx], ...patch, dateUpdated: new Date().toISOString() };
  await storageSet({ [STORAGE_KEY_APPS]: apps });
  return apps[idx];
}

async function deleteApplication(id) {
  let apps = await getAllApplications();
  apps = apps.filter(a => a.id !== id);
  await storageSet({ [STORAGE_KEY_APPS]: apps });
}

/* ─── Stats ─── */
async function getStats() {
  const apps = await getAllApplications();
  const settings = await getSettings();
  const now = new Date();
  const day = now.getDay();
  const mondayOff = day === 0 ? 6 : day - 1;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - mondayOff);
  weekStart.setHours(0, 0, 0, 0);

  const thisWeek = apps.filter(a => new Date(a.dateApplied) >= weekStart);
  const byStatus = {}, byEmail = { A: 0, B: 0 }, byPlatform = {}, bySource = {};
  let referralCount = 0;

  apps.forEach(a => {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    byEmail[a.email] = (byEmail[a.email] || 0) + 1;
    byPlatform[a.platform] = (byPlatform[a.platform] || 0) + 1;
    if (a.source) bySource[a.source] = (bySource[a.source] || 0) + 1;
    if (a.referral) referralCount++;
  });

  // Skill frequency across all jobs
  const skillFreq = {};
  apps.forEach(a => {
    if (a.keywords && a.keywords.mustHave) {
      a.keywords.mustHave.forEach(s => { skillFreq[s] = (skillFreq[s] || 0) + 1; });
    }
    if (a.keywords && a.keywords.niceToHave) {
      a.keywords.niceToHave.forEach(s => { skillFreq[s] = (skillFreq[s] || 0) + 1; });
    }
  });
  const topSkills = Object.entries(skillFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([skill, count]) => ({ skill, count }));

  return {
    total: apps.length,
    thisWeek: thisWeek.length,
    weeklyGoal: settings.weeklyGoal,
    activePipeline: (byStatus['Applied'] || 0) + (byStatus['Interviewing'] || 0),
    referralCount,
    byStatus, byEmail, byPlatform, bySource,
    topSkills
  };
}

/* ─── CSV Export ─── */
function exportAsCSV(apps, settings) {
  const headers = [
    'Date Applied', 'Company', 'Role', 'Location', 'Platform', 'Source',
    'Job ID', 'Email Used', 'Status', 'Referral', 'Referred By', 'Notes',
    'Job URL', 'Date Updated', 'Linked Job ID'
  ];

  const esc = val => {
    const s = String(val || '');
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = apps.map(a => [
    a.dateApplied ? new Date(a.dateApplied).toLocaleDateString() : '',
    a.company, a.role, a.location || '', a.platform, a.source || '',
    a.rawJobId || '',
    a.email === 'A' ? `${settings.labelA || 'A'} (${settings.emailA})` : `${settings.labelB || 'B'} (${settings.emailB})`,
    a.status, a.referral ? 'Yes' : 'No', a.referralPerson || '',
    a.notes || '', a.jobUrl || '',
    a.dateUpdated ? new Date(a.dateUpdated).toLocaleDateString() : '',
    a.linkedJobId || ''
  ].map(esc).join(','));

  return [headers.join(','), ...rows].join('\n');
}

/* ─── Date Helpers ─── */
function relativeDate(isoStr) {
  if (!isoStr) return '';
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diffMs / 60000);
  const h = Math.floor(diffMs / 3600000);
  const d = Math.floor(diffMs / 86400000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/* ─── Clear All ─── */
async function clearAllData() {
  await new Promise((resolve, reject) => {
    chrome.storage.sync.clear(() => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve());
  });
}
