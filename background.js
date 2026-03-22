/* ═══════════════════════════════════════
   background.js — Service Worker (V4)
   Badge, alarms, context menu, message handlers,
   first-run init for all storage keys
   ═══════════════════════════════════════ */

const BG_KEY_APPS      = 'jt_apps';
const BG_KEY_SETTINGS  = 'jt_settings';
const BG_KEY_TEMPLATES = 'jt_templates';
const BG_KEY_SNIPPETS  = 'jt_snippets';
const BG_KEY_PLATFORMS = 'jt_platforms';
const BG_KEY_SKILLDICT = 'jt_skill_dict';

const BG_DEFAULTS = {
  emailA: '', emailB: '', defaultEmail: 'A', defaultStatus: 'Applied',
  labelA: 'Primary', labelB: 'Referral', weeklyGoal: 5, saveJD: false,
  followUpDefaultDays: 7, lastWeeklyDismiss: '',
  profile: { name: '', college: '', degree: '', cgpa: '', resumeUrl: '', linkedinUrl: '' },
  mySkills: [],
};

/* ─── Storage Helpers ─── */
function bgGet(keys) {
  return new Promise((res, rej) => chrome.storage.sync.get(keys, r => chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res(r)));
}
function bgSet(data) {
  return new Promise((res, rej) => chrome.storage.sync.set(data, () => chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res()));
}
async function bgGetApps() { return (await bgGet(BG_KEY_APPS))[BG_KEY_APPS] || []; }
async function bgGetSettings() {
  const stored = (await bgGet(BG_KEY_SETTINGS))[BG_KEY_SETTINGS] || {};
  return {
    ...BG_DEFAULTS,
    ...stored,
    profile: { ...BG_DEFAULTS.profile, ...(stored.profile || {}) },
    mySkills: stored.mySkills || BG_DEFAULTS.mySkills,
  };
}

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
    const today = now.toISOString().split('T')[0];

    // Check for overdue follow-ups
    const overdue = apps.filter(a => a.followUpDate && !a.followUpDone && a.followUpDate <= today).length;
    if (overdue > 0) {
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#DC2626' });
      await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
      return;
    }

    // Weekly count
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
  if (entry.jobId) { const m = apps.find(a => a.jobId && a.jobId === entry.jobId); if (m) return { type: 'exact', match: m }; }
  const nu = bgNormUrl(entry.jobUrl);
  if (nu) { const m = apps.find(a => bgNormUrl(a.jobUrl) === nu); if (m) return { type: 'url', match: m }; }
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

/* ═══════════════════════════════════════
   First-Run Initialisation
   ═══════════════════════════════════════ */

async function initStorageDefaults() {
  // Import defaults from templates.js (not available in service worker scope directly,
  // so we inline the fetch via importScripts or define inline)
  const existing = await bgGet([BG_KEY_SETTINGS, BG_KEY_TEMPLATES, BG_KEY_SNIPPETS, BG_KEY_PLATFORMS, BG_KEY_SKILLDICT]);

  // Settings
  if (!existing[BG_KEY_SETTINGS]) {
    await bgSet({ [BG_KEY_SETTINGS]: BG_DEFAULTS });
  }

  // Templates — use inline defaults (same as DEFAULT_TEMPLATES in templates.js)
  if (!existing[BG_KEY_TEMPLATES]) {
    await bgSet({ [BG_KEY_TEMPLATES]: {
      referralMessage: `Hi {{referralPerson}},\n\nI came across the {{role}} at {{company}} and wanted to ask if you could refer me for this position. Job ID: {{jobId}}\n\nI am a final year {{degree}} student at {{college}} with a {{cgpa}} CGPA, with a strong foundation in computer science fundamentals.\n{{#if matchedSkills}}I have hands-on experience with {{matchedSkills}}, which aligns well with this role.{{/if}}\n\nPlease find my resume here: {{resumeUrl}}\n\nKindly let me know if you need any additional details.\n\nThanks & Regards,\n{{name}}`,
      followUpEmail: `Subject: Follow-up: {{role}} Application — {{name}}\n\nHi Hiring Team,\n\nI wanted to follow up on my application for the {{role}} position at {{company}}{{#if jobId}} (Job ID: {{jobId}}){{/if}}, submitted on {{dateApplied}}.\n\nI remain very interested in this opportunity and would love to discuss how my background aligns with your team's needs.\n\nPlease let me know if you need any additional information.\n\nThanks & Regards,\n{{name}}\n{{college}} | {{degree}} | {{cgpa}} CGPA\nResume: {{resumeUrl}}`,
      coverLetterBase: '[Paste your own cover letter template here.\nUse {{role}}, {{company}}, {{matchedSkills}} as placeholders —\nthey will be filled in automatically when you generate the prompt.]',
      coverLetterPrompt: `You are helping me write a professional cover letter.\n\nJOB DETAILS:\n- Role: {{role}}\n- Company: {{company}}\n- Job ID: {{jobId}}\n- Type: {{jobType}} | Location: {{location}}\n\nKEY JD REQUIREMENTS:\nMust-have: {{mustHaveSkills}}\nNice to have: {{niceToHaveSkills}}\n\nMY PROFILE:\n- {{degree}} student at {{college}}, {{cgpa}} CGPA\n- Skills I match: {{matchedSkills}}\n- Skills I may be missing: {{missingSkills}}\n- Resume: {{resumeUrl}}\n\nMY COVER LETTER TEMPLATE TO FOLLOW:\n{{coverLetterBase}}\n\nWrite a tailored cover letter using my template above.\nHighlight matched skills naturally. Max 250 words.\nDo not invent experience I don't have.`,
      resumeTailoringPrompt: `I am applying for {{role}} at {{company}}.\n\nJD REQUIREMENTS:\nMust-have: {{mustHaveSkills}}\nPreferred: {{niceToHaveSkills}}\nLevel: {{experienceLevel}}\n\nMY SITUATION:\n- {{degree}} at {{college}}, {{cgpa}} CGPA\n- Skills I have from JD: {{matchedSkills}}\n- Skills I may be missing: {{missingSkills}}\n- Resume: {{resumeUrl}}\n\nGive me:\n1. Top 3 things to highlight in my resume for this role\n2. Which projects or experience to lead with\n3. Keywords to add to my resume summary\n4. Honest fit assessment — strengths and gaps`,
      interviewPrepPrompt: `I have an interview at {{company}} for {{role}}.\n\nJD SKILLS: {{mustHaveSkills}}\nEXPERIENCE LEVEL: {{experienceLevel}}\n\nMY BACKGROUND:\n- {{degree}} at {{college}}, {{cgpa}} CGPA\n- Relevant skills: {{matchedSkills}}\n\nGenerate:\n1. 5 likely technical questions for this role\n2. 3 HR / behavioural questions they will likely ask\n3. Brief answer outline for each technical question\n4. One smart question I should ask the interviewer`,
      statusNotePrompts: { Interviewing: 'Interview date / round?', Rejected: 'Reason if known?', Offer: 'Offer details (CTC, joining date)?', Withdrawn: 'Why withdrawn?' },
    }});
  }

  // Snippets
  if (!existing[BG_KEY_SNIPPETS]) {
    await bgSet({ [BG_KEY_SNIPPETS]: [
      'Applied via Easy Apply', 'Needs cover letter', 'Referral in progress',
      'Good culture fit', 'Stretch role — worth trying', 'Backup option',
      'Applied via referral email', 'Recruiter reached out', 'Company on watchlist',
    ]});
  }

  // Platforms
  if (!existing[BG_KEY_PLATFORMS]) {
    await bgSet({ [BG_KEY_PLATFORMS]: [
      { id:'p-linkedin',    name:'LinkedIn',       matches:['linkedin.com'],                    category:'Aggregator', siteType:'aggregator', enabled:true, builtIn:true },
      { id:'p-glassdoor',   name:'Glassdoor',      matches:['glassdoor.co.in','glassdoor.com'], category:'Aggregator', siteType:'aggregator', enabled:true, builtIn:true },
      { id:'p-indeed',      name:'Indeed',          matches:['indeed.com','in.indeed.com'],      category:'Aggregator', siteType:'aggregator', enabled:true, builtIn:true },
      { id:'p-naukri',      name:'Naukri',          matches:['naukri.com'],                      category:'Aggregator', siteType:'aggregator', enabled:true, builtIn:true },
      { id:'p-foundit',     name:'Foundit',         matches:['foundit.in'],                      category:'Aggregator', siteType:'aggregator', enabled:true, builtIn:true },
      { id:'p-simplyhired', name:'SimplyHired',     matches:['simplyhired.co.in'],               category:'Aggregator', siteType:'aggregator', enabled:true, builtIn:true },
      { id:'p-wellfound',   name:'Wellfound',       matches:['wellfound.com','angel.co'],        category:'Startup',    siteType:'employer',   enabled:true, builtIn:true },
      { id:'p-cutshort',    name:'Cutshort',        matches:['cutshort.io'],                     category:'Startup',    siteType:'employer',   enabled:true, builtIn:true },
      { id:'p-was',         name:'WorkAtStartup',   matches:['workatastartup.com'],              category:'Startup',    siteType:'aggregator', enabled:true, builtIn:true },
      { id:'p-instahyre',   name:'Instahyre',       matches:['instahyre.com'],                   category:'Startup',    siteType:'aggregator', enabled:true, builtIn:true },
      { id:'p-hirist',      name:'Hirist',          matches:['hirist.tech'],                     category:'Startup',    siteType:'aggregator', enabled:true, builtIn:true },
      { id:'p-internshala', name:'Internshala',     matches:['internshala.com'],                 category:'Fresher',    siteType:'aggregator', enabled:true, builtIn:true },
      { id:'p-unstop',      name:'Unstop',          matches:['unstop.com'],                      category:'Fresher',    siteType:'aggregator', enabled:true, builtIn:true },
      { id:'p-uplers',      name:'Uplers',          matches:['uplers.com'],                      category:'Other',      siteType:'aggregator', enabled:true, builtIn:true },
      { id:'p-workday',     name:'Workday',         matches:['myworkdayjobs.com','myworkday.com'], category:'Career',  siteType:'employer',   enabled:true, builtIn:true },
      { id:'p-greenhouse',  name:'Greenhouse',      matches:['greenhouse.io'],                   category:'Career',     siteType:'employer',   enabled:true, builtIn:true },
      { id:'p-lever',       name:'Lever',           matches:['lever.co'],                        category:'Career',     siteType:'employer',   enabled:true, builtIn:true },
      { id:'p-smartrecruit',name:'SmartRecruiters',  matches:['smartrecruiters.com'],             category:'Career',     siteType:'employer',   enabled:true, builtIn:true },
      { id:'p-ashby',       name:'Ashby',           matches:['ashbyhq.com'],                     category:'Career',     siteType:'employer',   enabled:true, builtIn:true },
      { id:'p-rippling',    name:'Rippling',        matches:['rippling.com'],                    category:'Career',     siteType:'employer',   enabled:true, builtIn:true },
      { id:'p-icims',       name:'iCIMS',           matches:['icims.com'],                       category:'Career',     siteType:'employer',   enabled:true, builtIn:true },
      { id:'p-bamboohr',    name:'BambooHR',        matches:['bamboohr.com'],                    category:'Career',     siteType:'employer',   enabled:true, builtIn:true },
      { id:'p-jobvite',     name:'Jobvite',         matches:['jobvite.com'],                     category:'Career',     siteType:'employer',   enabled:true, builtIn:true },
      { id:'p-taleo',       name:'Taleo',           matches:['taleo.net'],                       category:'Career',     siteType:'employer',   enabled:true, builtIn:true },
      { id:'p-breezy',      name:'Breezy',          matches:['breezy.hr'],                       category:'Career',     siteType:'employer',   enabled:true, builtIn:true },
      { id:'p-workable',    name:'Workable',        matches:['workable.com'],                    category:'Career',     siteType:'employer',   enabled:true, builtIn:true },
    ]});
  }

  // Skill Dictionary
  if (!existing[BG_KEY_SKILLDICT]) {
    await bgSet({ [BG_KEY_SKILLDICT]: [
      { category:'Languages',   skills:['python','java','javascript','typescript','c++','c#','golang','rust','kotlin','swift','ruby','php','scala','r','bash','sql','html','css','dart','matlab'] },
      { category:'Frameworks',  skills:['react','angular','vue','node.js','express','django','flask','fastapi','spring boot','spring','laravel','next.js','nuxt','svelte','redux','graphql','rest','restful','tailwind'] },
      { category:'Cloud/DevOps',skills:['aws','azure','gcp','google cloud','docker','kubernetes','k8s','terraform','ci/cd','github actions','jenkins','ansible','linux','nginx','microservices','kafka','rabbitmq','redis','elasticsearch'] },
      { category:'Data/ML',     skills:['machine learning','deep learning','tensorflow','pytorch','pandas','numpy','scikit-learn','spark','hadoop','tableau','power bi','etl','nlp','computer vision','llm','langchain','hugging face','transformers'] },
      { category:'Databases',   skills:['mysql','postgresql','postgres','mongodb','redis','firebase','dynamodb','cassandra','oracle','sqlite','snowflake','bigquery'] },
      { category:'Tools',       skills:['git','github','gitlab','jira','confluence','postman','figma','vs code','agile','scrum','kanban'] },
      { category:'Soft Skills', skills:['communication','teamwork','problem solving','leadership','analytical thinking','time management'] },
    ]});
  }
}

/* ═══════════════════════════════════
   Event Listeners
   ═══════════════════════════════════ */

chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.contextMenus.create({ id: 'jobtrackr-log', title: 'Log this job with JobTrackr', contexts: ['page', 'link'] });
  chrome.alarms.create('daily-check', { when: getNext9am(), periodInMinutes: 1440 });

  // Init ALL storage keys on install (never overwrite existing)
  await initStorageDefaults();
  await updateBadge();
});

chrome.runtime.onStartup.addListener(updateBadge);

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'daily-check') return;
  await updateBadge();
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

  // Follow-up date
  let followUpDate = data.followUpDate || '';
  if (!followUpDate && (data.status === 'Applied' || data.status === 'Referral Pending')) {
    const d = new Date();
    d.setDate(d.getDate() + (settings.followUpDefaultDays || 7));
    followUpDate = d.toISOString().split('T')[0];
  }

  const entry = {
    id: bgUUID(), jobId: data.jobId || null, rawJobId: data.rawJobId || '',
    platform: data.platform || 'Other', siteType: data.siteType || 'employer',
    platformCategory: data.platformCategory || 'Other',
    company: bgSanitize(data.company, 200), role: bgSanitize(data.role, 200),
    location: bgSanitize(data.location || '', 200), source: bgSanitize(data.source || 'Direct', 100),
    jobUrl: data.jobUrl || '', email: data.email || settings.defaultEmail || 'A',
    emailA: settings.emailA || '', emailB: settings.emailB || '',
    status: data.status || settings.defaultStatus || 'Applied',
    referral: !!data.referral, referralPerson: bgSanitize(data.referralPerson || '', 200),
    notes: bgSanitize(data.notes || '', 500), dateApplied: now, dateUpdated: now,
    loggedFrom: data.loggedFrom || 'popup', linkedJobId: data.linkedJobId || '',
    keywords: data.keywords || { mustHave: [], niceToHave: [], byCategory: {}, experienceLevel: '', yearsRequired: [] },
    jobType: data.jobType || 'Unknown', workMode: data.workMode || 'Unknown',
    jobDescription: data.jobDescription ? bgSanitize(data.jobDescription, 8000) : '',
    stipend: bgSanitize(data.stipend || '', 100), duration: bgSanitize(data.duration || '', 100),
    followUpDate, followUpDone: false, followUpNote: '',
  };
  apps.unshift(entry);
  await bgSet({ [BG_KEY_APPS]: apps });
  await updateBadge();

  const softDup = (dup.type === 'repost' || dup.type === 'fuzzy') ? dup : null;
  return { saved: true, entry, softWarning: softDup };
}

async function handleForceSave(data) {
  const apps = await bgGetApps();
  const settings = await bgGetSettings();
  const now = new Date().toISOString();

  let followUpDate = data.followUpDate || '';
  if (!followUpDate) {
    const d = new Date();
    d.setDate(d.getDate() + (settings.followUpDefaultDays || 7));
    followUpDate = d.toISOString().split('T')[0];
  }

  const entry = {
    id: bgUUID(), jobId: data.jobId || null, rawJobId: data.rawJobId || '',
    platform: data.platform || 'Other', siteType: data.siteType || 'employer',
    platformCategory: data.platformCategory || 'Other',
    company: bgSanitize(data.company, 200), role: bgSanitize(data.role, 200),
    location: bgSanitize(data.location || '', 200), source: bgSanitize(data.source || 'Direct', 100),
    jobUrl: data.jobUrl || '', email: data.email || settings.defaultEmail || 'A',
    emailA: settings.emailA || '', emailB: settings.emailB || '',
    status: data.status || 'Re-applied (Referral)',
    referral: !!data.referral, referralPerson: bgSanitize(data.referralPerson || '', 200),
    notes: bgSanitize(data.notes || '', 500), dateApplied: now, dateUpdated: now,
    loggedFrom: data.loggedFrom || 'popup', linkedJobId: data.linkedJobId || '',
    keywords: data.keywords || { mustHave: [], niceToHave: [], byCategory: {}, experienceLevel: '', yearsRequired: [] },
    jobType: data.jobType || 'Unknown', workMode: data.workMode || 'Unknown',
    jobDescription: data.jobDescription ? bgSanitize(data.jobDescription, 8000) : '',
    stipend: bgSanitize(data.stipend || '', 100), duration: bgSanitize(data.duration || '', 100),
    followUpDate, followUpDone: false, followUpNote: '',
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
  const today = now.toISOString().split('T')[0];
  const byStatus = {}, byEmail = { A: 0, B: 0 }, byPlatform = {}, bySource = {};
  let referralCount = 0, overdueFollowUps = 0;
  apps.forEach(a => {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    byEmail[a.email] = (byEmail[a.email] || 0) + 1;
    byPlatform[a.platform] = (byPlatform[a.platform] || 0) + 1;
    if (a.source) bySource[a.source] = (bySource[a.source] || 0) + 1;
    if (a.referral) referralCount++;
    if (a.followUpDate && !a.followUpDone && a.followUpDate <= today) overdueFollowUps++;
  });
  return {
    total: apps.length, thisWeek: thisWeek.length, weeklyGoal: settings.weeklyGoal,
    activePipeline: (byStatus['Applied'] || 0) + (byStatus['Interviewing'] || 0),
    referralCount, overdueFollowUps, byStatus, byEmail, byPlatform, bySource
  };
}

function getNext9am() {
  const n = new Date(), x = new Date(n);
  x.setHours(9, 0, 0, 0);
  if (x <= n) x.setDate(x.getDate() + 1);
  return x.getTime();
}
