/* ═══════════════════════════════════════
   storage.js — Shared Read/Write/Dedup Helpers
   ═══════════════════════════════════════ */

const STORAGE_KEY_APPS = 'jt_apps';
const STORAGE_KEY_ARCHIVE = 'jt_apps_archive';
const STORAGE_KEY_SETTINGS = 'jt_settings';
const QUOTA_WARNING_BYTES = 90000; // 90KB warning threshold

const DEFAULT_SETTINGS = {
  emailA: '',
  emailB: '',
  defaultEmail: 'A',
  defaultStatus: 'Applied',
  labelA: 'Primary',
  labelB: 'Referral',
  weeklyGoal: 5
};

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'refId', 'trackingId', 'from', 'src', 'lipi', 'trk', 'trkInfo',
  'ref', 'referrer', 'source', 'campaign', 'medium', 'fbclid', 'gclid'
];

const COMPANY_SUFFIXES = [
  'inc', 'ltd', 'llc', 'technologies', 'tech', 'software', 'solutions',
  'pvt', 'private', 'limited', 'corporation', 'corp', 'co', 'company',
  'group', 'services', 'consulting', 'labs', 'studio', 'studios'
];

/* ─── Utility: UUID v4 ─── */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/* ─── Chrome Storage Promise Wrappers ─── */
function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(keys, result => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(result);
    });
  });
}

function storageSet(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(data, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

function storageBytesInUse(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.getBytesInUse(keys, bytes => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(bytes);
    });
  });
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

async function getArchivedApplications() {
  const result = await storageGet(STORAGE_KEY_ARCHIVE);
  return result[STORAGE_KEY_ARCHIVE] || [];
}

async function saveApplication(data) {
  const apps = await getAllApplications();

  // Run dedup check
  const dupResult = await checkDuplicate(data, apps);
  if (dupResult.tier === 1 || dupResult.tier === 2) {
    return { saved: false, duplicate: true, tier: dupResult.tier, existing: dupResult.match };
  }

  const now = new Date().toISOString();
  const entry = {
    id: generateUUID(),
    jobId: data.jobId || null,
    platform: data.platform || 'Other',
    company: sanitize(data.company, 200),
    role: sanitize(data.role, 200),
    jobUrl: data.jobUrl || '',
    email: data.email || 'A',
    emailA: data.emailA || '',
    emailB: data.emailB || '',
    status: data.status || 'Applied',
    referral: !!data.referral,
    referralPerson: sanitize(data.referralPerson || '', 200),
    notes: sanitize(data.notes || '', 500),
    dateApplied: now,
    dateUpdated: now,
    source: data.source || 'popup'
  };

  apps.unshift(entry);
  await storageSet({ [STORAGE_KEY_APPS]: apps });

  // Check storage quota
  const bytes = await storageBytesInUse(STORAGE_KEY_APPS);
  const quotaWarning = bytes > QUOTA_WARNING_BYTES;

  // Return with soft warning info if Tier 3 match found
  return {
    saved: true,
    duplicate: false,
    entry,
    quotaWarning,
    bytesUsed: bytes,
    softWarning: dupResult.tier === 3 ? dupResult : null
  };
}

async function forceSaveApplication(data) {
  // Bypass dedup — used for "Apply Again" after user acknowledges duplicate
  const apps = await getAllApplications();
  const now = new Date().toISOString();
  const entry = {
    id: generateUUID(),
    jobId: data.jobId || null,
    platform: data.platform || 'Other',
    company: sanitize(data.company, 200),
    role: sanitize(data.role, 200),
    jobUrl: data.jobUrl || '',
    email: data.email || 'A',
    emailA: data.emailA || '',
    emailB: data.emailB || '',
    status: data.status || 'Re-applied (Referral)',
    referral: !!data.referral,
    referralPerson: sanitize(data.referralPerson || '', 200),
    notes: sanitize(data.notes || '', 500),
    dateApplied: now,
    dateUpdated: now,
    source: data.source || 'popup'
  };

  apps.unshift(entry);
  await storageSet({ [STORAGE_KEY_APPS]: apps });
  return { saved: true, entry };
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

async function archiveOldEntries() {
  const apps = await getAllApplications();
  const archive = await getArchivedApplications();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const toArchive = apps.filter(a => new Date(a.dateApplied) < sixMonthsAgo);
  const remaining = apps.filter(a => new Date(a.dateApplied) >= sixMonthsAgo);

  if (toArchive.length > 0) {
    await storageSet({
      [STORAGE_KEY_APPS]: remaining,
      [STORAGE_KEY_ARCHIVE]: [...archive, ...toArchive]
    });
  }
  return { archived: toArchive.length, remaining: remaining.length };
}

/* ─── Duplicate Detection ─── */
function extractJobId(url, platform) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const path = u.pathname;
    const params = u.searchParams;

    switch (platform) {
      case 'LinkedIn': {
        const m = path.match(/\/jobs\/view\/(\d+)/);
        return m ? `li_${m[1]}` : null;
      }
      case 'Wellfound': {
        const m = path.match(/\/jobs\/(\d+)/) || path.match(/\/l\/(\d+)/);
        return m ? `wf_${m[1]}` : null;
      }
      case 'Indeed': {
        const jk = params.get('jk');
        return jk ? `in_${jk}` : null;
      }
      case 'Naukri': {
        const m = path.match(/-(\d+)\.html$/);
        return m ? `nk_${m[1]}` : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    TRACKING_PARAMS.forEach(p => u.searchParams.delete(p));
    // Also remove hash
    u.hash = '';
    // Sort remaining params for consistent comparison
    u.searchParams.sort();
    return u.origin + u.pathname.replace(/\/+$/, '') + (u.search || '');
  } catch {
    return url.trim().toLowerCase();
  }
}

function normalizeCompany(name) {
  if (!name) return '';
  let n = name.toLowerCase().trim();
  n = n.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
  COMPANY_SUFFIXES.forEach(s => {
    n = n.replace(new RegExp(`\\b${s}\\b`, 'gi'), '');
  });
  return n.trim();
}

function normalizeRole(title) {
  if (!title) return '';
  return title.toLowerCase().trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(senior|sr|junior|jr|lead|principal|staff|intern|co-op)\b/gi, '')
    .trim();
}

async function checkDuplicate(entry, existingApps) {
  const apps = existingApps || await getAllApplications();

  // Tier 1 — Platform Job ID
  if (entry.jobId) {
    const match = apps.find(a => a.jobId && a.jobId === entry.jobId);
    if (match) return { tier: 1, match };
  }

  // Tier 2 — Normalized URL
  const normUrl = normalizeUrl(entry.jobUrl);
  if (normUrl) {
    const match = apps.find(a => normalizeUrl(a.jobUrl) === normUrl);
    if (match) return { tier: 2, match };
  }

  // Tier 3 — Fuzzy company + role (within 180 days)
  const normCompany = normalizeCompany(entry.company);
  const normRole = normalizeRole(entry.role);
  if (normCompany && normRole) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 180);
    const match = apps.find(a => {
      if (new Date(a.dateApplied) < cutoff) return false;
      return normalizeCompany(a.company) === normCompany &&
             normalizeRole(a.role) === normRole;
    });
    if (match) return { tier: 3, match };
  }

  return { tier: null, match: null };
}

/* ─── Stats ─── */
async function getStats() {
  const apps = await getAllApplications();
  const settings = await getSettings();
  const now = new Date();

  // Week boundaries (Mon-Sun)
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - mondayOffset);
  weekStart.setHours(0, 0, 0, 0);

  const thisWeek = apps.filter(a => new Date(a.dateApplied) >= weekStart);

  const byStatus = {};
  const byEmail = { A: 0, B: 0 };
  const byPlatform = {};
  let referralCount = 0;

  apps.forEach(a => {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    byEmail[a.email] = (byEmail[a.email] || 0) + 1;
    byPlatform[a.platform] = (byPlatform[a.platform] || 0) + 1;
    if (a.referral) referralCount++;
  });

  const activePipeline = (byStatus['Applied'] || 0) + (byStatus['Interviewing'] || 0);

  return {
    total: apps.length,
    thisWeek: thisWeek.length,
    weeklyGoal: settings.weeklyGoal,
    activePipeline,
    referralCount,
    byStatus,
    byEmail,
    byPlatform
  };
}

/* ─── CSV Export ─── */
function exportAsCSV(apps, settings) {
  const headers = [
    'Date Applied', 'Company', 'Role', 'Platform', 'Email Used',
    'Status', 'Referral', 'Referred By', 'Notes', 'Job URL', 'Date Updated'
  ];

  const escapeCSV = val => {
    const str = String(val || '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = apps.map(a => [
    a.dateApplied ? new Date(a.dateApplied).toLocaleDateString() : '',
    a.company,
    a.role,
    a.platform,
    a.email === 'A' ? (settings.labelA || 'A') + ' (' + (a.emailA || settings.emailA) + ')'
                    : (settings.labelB || 'B') + ' (' + (a.emailB || settings.emailB) + ')',
    a.status,
    a.referral ? 'Yes' : 'No',
    a.referralPerson || '',
    a.notes || '',
    a.jobUrl || '',
    a.dateUpdated ? new Date(a.dateUpdated).toLocaleDateString() : ''
  ].map(escapeCSV).join(','));

  return [headers.join(','), ...rows].join('\n');
}

/* ─── Sanitization ─── */
function sanitize(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return str.trim().substring(0, maxLen);
}

/* ─── Date Helpers ─── */
function relativeDate(isoStr) {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

/* ─── Weekly Count (for badge) ─── */
async function getThisWeekCount() {
  const apps = await getAllApplications();
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  return apps.filter(a => new Date(a.dateApplied) >= weekStart).length;
}

async function getYesterdayCount() {
  const apps = await getAllApplications();
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  return apps.filter(a => {
    const d = new Date(a.dateApplied);
    return d >= yesterday && d < todayStart;
  }).length;
}

async function getLastWeekCount() {
  const apps = await getAllApplications();
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - mondayOffset);
  thisWeekStart.setHours(0, 0, 0, 0);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  return apps.filter(a => {
    const d = new Date(a.dateApplied);
    return d >= lastWeekStart && d < thisWeekStart;
  }).length;
}

async function clearAllData() {
  await new Promise((resolve, reject) => {
    chrome.storage.sync.clear(() => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}
