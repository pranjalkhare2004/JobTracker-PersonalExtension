/* ═══════════════════════════════════════
   storage.js — CRUD + Settings Helpers (V4)
   Covers: apps, settings, templates, snippets, platforms, skill dict
   ═══════════════════════════════════════ */

const STORAGE_KEY_APPS      = 'jt_apps';
const STORAGE_KEY_SETTINGS  = 'jt_settings';
const STORAGE_KEY_TEMPLATES = 'jt_templates';
const STORAGE_KEY_SNIPPETS  = 'jt_snippets';
const STORAGE_KEY_PLATFORMS = 'jt_platforms';
const STORAGE_KEY_SKILLDICT = 'jt_skill_dict';
const QUOTA_WARNING_BYTES   = 90000;

const DEFAULT_SETTINGS = {
  emailA: '',
  emailB: '',
  defaultEmail: 'A',
  defaultStatus: 'Applied',
  labelA: 'Primary',
  labelB: 'Referral',
  weeklyGoal: 5,
  saveJD: false,
  followUpDefaultDays: 7,
  lastWeeklyDismiss: '',
  profile: {
    name: '', college: '', degree: '', cgpa: '',
    resumeUrl: '', linkedinUrl: '',
  },
  mySkills: [],
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

function storageRemove(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.remove(keys, () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve());
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

/* ═══════════════════════════════════════
   SETTINGS
   ═══════════════════════════════════════ */

async function getSettings() {
  const result = await storageGet(STORAGE_KEY_SETTINGS);
  const stored = result[STORAGE_KEY_SETTINGS] || {};
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    profile: { ...DEFAULT_SETTINGS.profile, ...(stored.profile || {}) },
    mySkills: stored.mySkills || DEFAULT_SETTINGS.mySkills,
  };
}

async function saveSettings(patch) {
  const current = await getSettings();
  // Deep-merge profile
  if (patch.profile) {
    patch.profile = { ...current.profile, ...patch.profile };
  }
  const updated = { ...current, ...patch };
  await storageSet({ [STORAGE_KEY_SETTINGS]: updated });
  return updated;
}

/* ═══════════════════════════════════════
   TEMPLATES
   ═══════════════════════════════════════ */

async function getTemplates() {
  const result = await storageGet(STORAGE_KEY_TEMPLATES);
  const stored = result[STORAGE_KEY_TEMPLATES] || {};
  // Merge with defaults so every key is present
  const def = typeof DEFAULT_TEMPLATES !== 'undefined' ? DEFAULT_TEMPLATES : {};
  return {
    referralMessage:        stored.referralMessage        ?? def.referralMessage        ?? '',
    followUpEmail:          stored.followUpEmail          ?? def.followUpEmail          ?? '',
    coverLetterBase:        stored.coverLetterBase        ?? def.coverLetterBase        ?? '',
    coverLetterPrompt:      stored.coverLetterPrompt      ?? def.coverLetterPrompt      ?? '',
    resumeTailoringPrompt:  stored.resumeTailoringPrompt  ?? def.resumeTailoringPrompt  ?? '',
    interviewPrepPrompt:    stored.interviewPrepPrompt    ?? def.interviewPrepPrompt    ?? '',
    statusNotePrompts:      stored.statusNotePrompts      ?? def.statusNotePrompts      ?? {},
  };
}

async function saveTemplates(patch) {
  const current = await getTemplates();
  const updated = { ...current, ...patch };
  await storageSet({ [STORAGE_KEY_TEMPLATES]: updated });
  return updated;
}

async function resetTemplate(key) {
  const def = typeof DEFAULT_TEMPLATES !== 'undefined' ? DEFAULT_TEMPLATES : {};
  if (!(key in def)) throw new Error(`Unknown template key: ${key}`);
  const current = await getTemplates();
  current[key] = def[key];
  await storageSet({ [STORAGE_KEY_TEMPLATES]: current });
  return current;
}

/* ═══════════════════════════════════════
   SNIPPETS
   ═══════════════════════════════════════ */

async function getSnippets() {
  const result = await storageGet(STORAGE_KEY_SNIPPETS);
  const stored = result[STORAGE_KEY_SNIPPETS];
  if (stored && Array.isArray(stored)) return stored;
  const def = typeof DEFAULT_SNIPPETS !== 'undefined' ? DEFAULT_SNIPPETS : [];
  return [...def];
}

async function saveSnippets(arr) {
  await storageSet({ [STORAGE_KEY_SNIPPETS]: arr });
  return arr;
}

/* ═══════════════════════════════════════
   PLATFORMS
   ═══════════════════════════════════════ */

async function getPlatforms() {
  const result = await storageGet(STORAGE_KEY_PLATFORMS);
  const stored = result[STORAGE_KEY_PLATFORMS];
  if (stored && Array.isArray(stored) && stored.length > 0) return stored;
  const def = typeof DEFAULT_PLATFORMS !== 'undefined' ? DEFAULT_PLATFORMS : [];
  return [...def];
}

async function savePlatforms(arr) {
  await storageSet({ [STORAGE_KEY_PLATFORMS]: arr });
  return arr;
}

async function addPlatform(data) {
  const platforms = await getPlatforms();
  const p = {
    id: generateUUID(),
    name: data.name || '',
    matches: data.matches || [],
    category: data.category || 'Other',
    siteType: data.siteType || 'employer',
    enabled: true,
    builtIn: false,
  };
  platforms.push(p);
  await savePlatforms(platforms);
  return p;
}

async function updatePlatform(id, patch) {
  const platforms = await getPlatforms();
  const idx = platforms.findIndex(p => p.id === id);
  if (idx === -1) throw new Error('Platform not found');
  platforms[idx] = { ...platforms[idx], ...patch };
  await savePlatforms(platforms);
  return platforms[idx];
}

async function deletePlatform(id) {
  const platforms = await getPlatforms();
  const p = platforms.find(p => p.id === id);
  if (!p) throw new Error('Platform not found');
  if (p.builtIn) throw new Error('Cannot delete built-in platform');
  const updated = platforms.filter(p => p.id !== id);
  await savePlatforms(updated);
  return updated;
}

/* ═══════════════════════════════════════
   SKILL DICTIONARY
   ═══════════════════════════════════════ */

async function getSkillDict() {
  const result = await storageGet(STORAGE_KEY_SKILLDICT);
  const stored = result[STORAGE_KEY_SKILLDICT];
  if (stored && Array.isArray(stored) && stored.length > 0) return stored;
  const def = typeof DEFAULT_SKILL_DICT !== 'undefined' ? DEFAULT_SKILL_DICT : [];
  return def.map(c => ({ ...c, skills: [...c.skills] }));
}

async function saveSkillDict(arr) {
  await storageSet({ [STORAGE_KEY_SKILLDICT]: arr });
  return arr;
}

/* ═══════════════════════════════════════
   APPLICATION CRUD
   ═══════════════════════════════════════ */

async function getAllApplications() {
  const result = await storageGet(STORAGE_KEY_APPS);
  const apps = result[STORAGE_KEY_APPS] || [];
  // Backfill v3+v4 fields for old entries
  return apps.map(a => ({
    jobType: 'Unknown', workMode: 'Unknown', jobDescription: '',
    platformCategory: 'Other', stipend: '', duration: '',
    followUpDate: '', followUpDone: false, followUpNote: '',
    ...a
  }));
}

async function saveApplication(data) {
  const apps = await getAllApplications();
  const settings = await getSettings();
  const now = new Date().toISOString();

  // Follow-up date: default to today + followUpDefaultDays
  let followUpDate = data.followUpDate || '';
  if (!followUpDate && (data.status === 'Applied' || data.status === 'Referral Pending')) {
    const d = new Date();
    d.setDate(d.getDate() + (settings.followUpDefaultDays || 7));
    followUpDate = d.toISOString().split('T')[0];
  }

  const entry = {
    id: generateUUID(),
    jobId: data.jobId || null,
    rawJobId: data.rawJobId || '',
    platform: data.platform || 'Other',
    siteType: data.siteType || 'employer',
    platformCategory: data.platformCategory || 'Other',
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
    keywords: data.keywords || { mustHave: [], niceToHave: [], byCategory: {}, experienceLevel: '', yearsRequired: [] },
    jobType: data.jobType || 'Unknown',
    workMode: data.workMode || 'Unknown',
    jobDescription: data.jobDescription ? sanitize(data.jobDescription, 8000) : '',
    stipend: sanitize(data.stipend || '', 100),
    duration: sanitize(data.duration || '', 100),
    followUpDate,
    followUpDone: false,
    followUpNote: '',
  };

  apps.unshift(entry);
  await storageSet({ [STORAGE_KEY_APPS]: apps });

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

/* ═══════════════════════════════════════
   STATS
   ═══════════════════════════════════════ */

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
  const byJobType = {}, byWorkMode = {};
  let referralCount = 0;
  let overdueFollowUps = 0;
  const today = new Date().toISOString().split('T')[0];

  apps.forEach(a => {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    byEmail[a.email] = (byEmail[a.email] || 0) + 1;
    byPlatform[a.platform] = (byPlatform[a.platform] || 0) + 1;
    if (a.source) bySource[a.source] = (bySource[a.source] || 0) + 1;
    if (a.referral) referralCount++;
    const jt = a.jobType || 'Unknown';
    byJobType[jt] = (byJobType[jt] || 0) + 1;
    const wm = a.workMode || 'Unknown';
    byWorkMode[wm] = (byWorkMode[wm] || 0) + 1;
    if (a.followUpDate && !a.followUpDone && a.followUpDate <= today) overdueFollowUps++;
  });

  const topSource = Object.entries(bySource).sort((a, b) => b[1] - a[1])[0];

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
    referralCount, overdueFollowUps,
    byStatus, byEmail, byPlatform, bySource,
    byJobType, byWorkMode,
    topSource: topSource ? { source: topSource[0], count: topSource[1] } : null,
    topSkills
  };
}

/* ═══════════════════════════════════════
   CSV EXPORT
   ═══════════════════════════════════════ */

function exportAsCSV(apps, settings) {
  const headers = [
    'Date Applied', 'Company', 'Role', 'Location', 'Platform', 'Platform Category',
    'Source', 'Job ID', 'Job Type', 'Work Mode', 'Stipend', 'Duration',
    'Email Used', 'Status', 'Referral', 'Referred By', 'Notes',
    'Follow-up Date', 'Follow-up Done',
    'Job URL', 'Date Updated', 'Linked Job ID', 'Has JD'
  ];

  const esc = val => {
    const s = String(val || '');
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = apps.map(a => [
    a.dateApplied ? new Date(a.dateApplied).toLocaleDateString() : '',
    a.company, a.role, a.location || '', a.platform, a.platformCategory || 'Other',
    a.source || '', a.rawJobId || '',
    a.jobType || 'Unknown', a.workMode || 'Unknown',
    a.stipend || '', a.duration || '',
    a.email === 'A' ? `${settings.labelA || 'A'} (${settings.emailA})` : `${settings.labelB || 'B'} (${settings.emailB})`,
    a.status, a.referral ? 'Yes' : 'No', a.referralPerson || '',
    a.notes || '',
    a.followUpDate || '', a.followUpDone ? 'Yes' : 'No',
    a.jobUrl || '',
    a.dateUpdated ? new Date(a.dateUpdated).toLocaleDateString() : '',
    a.linkedJobId || '',
    a.jobDescription ? 'Yes' : 'No'
  ].map(esc).join(','));

  return [headers.join(','), ...rows].join('\n');
}

/* ─── TSV for Google Sheets ─── */
function exportAsTSV(apps, settings) {
  const headers = ['Date', 'Company', 'Role', 'Location', 'Platform', 'Source', 'Job ID',
    'Job Type', 'Work Mode', 'Email', 'Status', 'Referral', 'Notes', 'Follow-up'];
  const rows = apps.map(a => [
    a.dateApplied ? new Date(a.dateApplied).toLocaleDateString() : '',
    a.company || '', a.role || '', a.location || '', a.platform || '', a.source || '',
    a.rawJobId || '', a.jobType || '', a.workMode || '',
    a.email === 'A' ? (settings.labelA || 'A') : (settings.labelB || 'B'),
    a.status || '', a.referral ? 'Yes' : 'No', a.notes || '', a.followUpDate || ''
  ].join('\t'));
  return [headers.join('\t'), ...rows].join('\n');
}

/* ═══════════════════════════════════════
   STORAGE USAGE
   ═══════════════════════════════════════ */

async function getStorageUsage() {
  const keys = [STORAGE_KEY_APPS, STORAGE_KEY_SETTINGS, STORAGE_KEY_TEMPLATES,
                STORAGE_KEY_SNIPPETS, STORAGE_KEY_PLATFORMS, STORAGE_KEY_SKILLDICT];
  const breakdown = {};
  let total = 0;
  for (const k of keys) {
    try {
      const b = await storageBytesInUse(k);
      breakdown[k] = b;
      total += b;
    } catch { breakdown[k] = 0; }
  }
  return { total, breakdown, limit: 102400 };
}

/* ═══════════════════════════════════════
   BACKUP / RESTORE
   ═══════════════════════════════════════ */

async function exportFullBackup() {
  const keys = [STORAGE_KEY_APPS, STORAGE_KEY_SETTINGS, STORAGE_KEY_TEMPLATES,
                STORAGE_KEY_SNIPPETS, STORAGE_KEY_PLATFORMS, STORAGE_KEY_SKILLDICT];
  const data = await storageGet(keys);
  return {
    version: '4.0.0',
    exportDate: new Date().toISOString(),
    ...data,
  };
}

async function restoreFromBackup(json) {
  if (!json || typeof json !== 'object') throw new Error('Invalid backup format');
  const validKeys = [STORAGE_KEY_APPS, STORAGE_KEY_SETTINGS, STORAGE_KEY_TEMPLATES,
                     STORAGE_KEY_SNIPPETS, STORAGE_KEY_PLATFORMS, STORAGE_KEY_SKILLDICT];
  const toRestore = {};
  validKeys.forEach(k => {
    if (json[k] !== undefined) toRestore[k] = json[k];
  });
  if (Object.keys(toRestore).length === 0) throw new Error('No valid data keys in backup');
  await storageSet(toRestore);
  return { restored: true, keys: Object.keys(toRestore) };
}

/* ═══════════════════════════════════════
   CSV IMPORT
   ═══════════════════════════════════════ */

async function importFromCSV(csvText) {
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV must have at least a header row and one data row');

  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  const apps = await getAllApplications();
  const existingIds = new Set(apps.map(a => a.rawJobId).filter(Boolean));
  let imported = 0, skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.replace(/^"|"$/g, '').trim());
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });

    const jobId = row['Job ID'] || '';
    if (jobId && existingIds.has(jobId)) { skipped++; continue; }

    const entry = {
      id: generateUUID(),
      rawJobId: jobId,
      jobId: null,
      company: row['Company'] || '',
      role: row['Role'] || '',
      location: row['Location'] || '',
      platform: row['Platform'] || 'Other',
      platformCategory: row['Platform Category'] || 'Other',
      source: row['Source'] || 'Direct',
      jobType: row['Job Type'] || 'Unknown',
      workMode: row['Work Mode'] || 'Unknown',
      status: row['Status'] || 'Applied',
      email: 'A',
      referral: (row['Referral'] || '').toLowerCase() === 'yes',
      referralPerson: row['Referred By'] || '',
      notes: row['Notes'] || '',
      jobUrl: row['Job URL'] || '',
      siteType: 'employer',
      stipend: row['Stipend'] || '',
      duration: row['Duration'] || '',
      dateApplied: row['Date Applied'] ? new Date(row['Date Applied']).toISOString() : new Date().toISOString(),
      dateUpdated: new Date().toISOString(),
      loggedFrom: 'csv-import',
      linkedJobId: '',
      keywords: { mustHave: [], niceToHave: [], byCategory: {}, experienceLevel: '', yearsRequired: [] },
      jobDescription: '',
      followUpDate: '', followUpDone: false, followUpNote: '',
    };
    apps.unshift(entry);
    existingIds.add(jobId);
    imported++;
  }

  await storageSet({ [STORAGE_KEY_APPS]: apps });
  return { imported, skipped };
}

/* ═══════════════════════════════════════
   DATE HELPERS
   ═══════════════════════════════════════ */

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

/* ═══════════════════════════════════════
   CLEAR ALL
   ═══════════════════════════════════════ */

async function clearAllData() {
  await new Promise((resolve, reject) => {
    chrome.storage.sync.clear(() => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve());
  });
}

async function clearAllApplications() {
  await storageSet({ [STORAGE_KEY_APPS]: [] });
}

async function resetAllSettings() {
  const def = typeof DEFAULT_TEMPLATES !== 'undefined' ? DEFAULT_TEMPLATES : {};
  const defSnippets = typeof DEFAULT_SNIPPETS !== 'undefined' ? DEFAULT_SNIPPETS : [];
  const defPlatforms = typeof DEFAULT_PLATFORMS !== 'undefined' ? DEFAULT_PLATFORMS : [];
  const defSkills = typeof DEFAULT_SKILL_DICT !== 'undefined' ? DEFAULT_SKILL_DICT : [];
  await storageSet({
    [STORAGE_KEY_SETTINGS]: DEFAULT_SETTINGS,
    [STORAGE_KEY_TEMPLATES]: def,
    [STORAGE_KEY_SNIPPETS]: defSnippets,
    [STORAGE_KEY_PLATFORMS]: defPlatforms,
    [STORAGE_KEY_SKILLDICT]: defSkills,
  });
}
