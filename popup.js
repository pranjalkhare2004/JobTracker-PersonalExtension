/* ═══════════════════════════════════════
   popup.js — Popup Logic V2
   Auto-fill, dedup, JD insights, smart referral, MY_SKILLS
   ═══════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── MY SKILLS — Update this list as you learn new things ─── */
  const MY_SKILLS = [
    'python', 'java', 'javascript', 'typescript', 'react', 'node.js', 'express',
    'sql', 'git', 'github', 'linux', 'c++', 'html', 'css', 'mongodb',
    'rest', 'restful', 'data structures', 'algorithms',
  ];

  /* ─── State ─── */
  let settings = {};
  let scrapedData = null;
  let dupResult = null;
  let selectedEmail = 'A';
  let selectedStatus = 'Applied';
  let referralOn = false;
  let keywordsData = null;

  /* ─── DOM Refs ─── */
  const $ = id => document.getElementById(id);

  const inputRole = $('input-role');
  const inputCompany = $('input-company');
  const inputLocation = $('input-location');
  const inputSource = $('input-source');
  const inputJobId = $('input-jobid');
  const inputUrl = $('input-url');
  const inputNotes = $('input-notes');
  const inputReferralPerson = $('input-referral-person');

  const platformBadge = $('platform-badge');
  const scrapeIndicator = $('scrape-indicator');

  const autofillBanner = $('autofill-failed');
  const aggregatorHint = $('aggregator-hint');
  const aggregatorText = $('aggregator-text');
  const aggregatorLink = $('aggregator-link');

  const dupBanner = $('dup-banner');
  const dupTitle = $('dup-title');
  const dupDetail = $('dup-detail');
  const dupEmoji = $('dup-emoji');
  const btnDupUpdate = $('btn-dup-update');
  const btnDupNew = $('btn-dup-new');

  const softWarning = $('soft-warning');
  const softWarningText = $('soft-warning-text');
  const btnSoftDismiss = $('btn-soft-dismiss');

  const quickUpdateBar = $('quick-update-bar');
  const quickStatusPills = $('quick-status-pills');

  const btnLog = $('btn-log');
  const btnLogText = $('btn-log-text');
  const btnLogSpinner = $('btn-log-spinner');
  const successState = $('success-state');
  const successDetail = $('success-detail');
  const mainView = $('main-view');

  const settingsPanel = $('settings-panel');
  const btnSettings = $('btn-settings');
  const btnBack = $('btn-back');
  const btnDashboard = $('btn-dashboard');

  const jdToggle = $('jd-toggle');
  const jdSummary = $('jd-summary');
  const jdChevron = $('jd-chevron');
  const jdPanel = $('jd-panel');
  const jdSection = $('jd-section');
  const jdMustPills = $('jd-must-pills');
  const jdNicePills = $('jd-nice-pills');
  const jdMatch = $('jd-match');
  const jdLevel = $('jd-level');

  const toggleReferral = $('toggle-referral');
  const referralFields = $('referral-fields');

  /* ═══════════════════════════════
     Init
     ═══════════════════════════════ */

  async function init() {
    settings = await getSettings();
    applySettings();
    wireEvents();
    await fetchJobData();
  }

  function applySettings() {
    selectedEmail = settings.defaultEmail || 'A';
    selectedStatus = settings.defaultStatus || 'Applied';

    $('pill-label-a').textContent = settings.labelA || 'Primary';
    $('pill-label-b').textContent = settings.labelB || 'Referral';
    $('pill-addr-a').textContent = settings.emailA || '';
    $('pill-addr-b').textContent = settings.emailB || '';

    updateEmailPills();
    updateStatusPills();

    // Settings form
    $('set-label-a').value = settings.labelA || '';
    $('set-email-a').value = settings.emailA || '';
    $('set-label-b').value = settings.labelB || '';
    $('set-email-b').value = settings.emailB || '';
    $('set-default-email').value = settings.defaultEmail || 'A';
    $('set-default-status').value = settings.defaultStatus || 'Applied';
    $('set-weekly-goal').value = settings.weeklyGoal || 5;
  }

  /* ═══════════════════════════════
     Fetch Job Data from Content Script
     ═══════════════════════════════ */

  async function fetchJobData() {
    // Always pre-fill URL
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) inputUrl.value = tab.url;
    } catch { /* ignore */ }

    // Try content script with 400ms timeout
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { showAutoFillFailed(); return; }

      const response = await Promise.race([
        new Promise(resolve => {
          chrome.tabs.sendMessage(tab.id, { type: 'GET_JOB_DATA' }, resolve);
        }),
        new Promise(resolve => setTimeout(() => resolve(null), 400))
      ]);

      if (response?.success && response.data) {
        scrapedData = response.data;
        populateFromScrape(scrapedData);
      } else {
        showAutoFillFailed();
      }
    } catch {
      showAutoFillFailed();
    }
  }

  function showAutoFillFailed() {
    autofillBanner.classList.remove('hidden');
    scrapeIndicator.dataset.quality = 'failed';
  }

  function populateFromScrape(data) {
    inputRole.value = data.role || '';
    inputCompany.value = data.company || '';
    inputLocation.value = data.location || '';
    inputSource.value = data.source || 'Direct';
    inputJobId.value = data.rawJobId || '';
    if (data.canonicalUrl) inputUrl.value = data.canonicalUrl;

    platformBadge.textContent = data.platform || 'Other';
    platformBadge.dataset.platform = data.platform || 'Other';
    scrapeIndicator.dataset.quality = data.scrapeQuality || 'failed';
    scrapeIndicator.title = `Scrape: ${data.scrapeQuality || 'failed'}`;

    // Show aggregator hint
    if (data.siteType === 'aggregator') {
      aggregatorHint.classList.remove('hidden');
      aggregatorText.textContent = `ℹ️ Job ID not available on ${data.platform}. Visit the company careers page for the real Job ID.`;
    }

    // Keyword data
    if (data.keywords && (data.keywords.mustHave?.length > 0 || data.keywords.niceToHave?.length > 0)) {
      keywordsData = data.keywords;
      renderJDInsights();
    } else {
      jdSection.classList.add('hidden');
    }

    // Check for duplicates
    checkForDuplicates();
  }

  /* ═══════════════════════════════
     JD Insights
     ═══════════════════════════════ */

  function renderJDInsights() {
    if (!keywordsData) { jdSection.classList.add('hidden'); return; }
    jdSection.classList.remove('hidden');

    const must = keywordsData.mustHave || [];
    const nice = keywordsData.niceToHave || [];
    const total = must.length + nice.length;

    // Match score
    const myMatches = must.filter(k => MY_SKILLS.some(s => s.toLowerCase() === k.toLowerCase()));
    const matchCount = myMatches.length;
    const matchTotal = must.length;
    const matchPct = matchTotal > 0 ? Math.round((matchCount / matchTotal) * 100) : 0;

    jdSummary.textContent = `${total} keywords  •  Match: ${matchCount}/${matchTotal}`;

    // Must have pills
    jdMustPills.innerHTML = must.map(s => {
      const isMatch = MY_SKILLS.some(ms => ms.toLowerCase() === s.toLowerCase());
      return `<span class="skill-pill ${isMatch ? 'skill-pill-match' : 'skill-pill-miss'}">${esc(s)}</span>`;
    }).join('');

    // Nice to have pills
    jdNicePills.innerHTML = nice.map(s => `<span class="skill-pill skill-pill-nice">${esc(s)}</span>`).join('');
    if (nice.length === 0) $('jd-nice-have').classList.add('hidden');

    // Match bar
    jdMatch.innerHTML = `${matchCount}/${matchTotal} required skills
      <span class="jd-match-bar jd-match-bar-bg">
        <span class="jd-match-bar-fill" style="width:${matchPct}%"></span>
      </span> ${matchPct}%`;

    // Level
    const lvl = keywordsData.experienceLevel || '';
    const yrs = keywordsData.yearsRequired?.join(', ') || '';
    jdLevel.textContent = [lvl, yrs].filter(Boolean).join('  •  ');
  }

  /* ═══════════════════════════════
     Duplicate Detection
     ═══════════════════════════════ */

  async function checkForDuplicates() {
    try {
      const apps = await getAllApplications();
      if (apps.length === 0) return;

      const entry = {
        jobId: scrapedData?.jobId || (inputJobId.value ? 'xx_' + inputJobId.value : null),
        jobUrl: inputUrl.value,
        company: inputCompany.value,
        role: inputRole.value
      };

      // Inline check (reusing dedup logic)
      const normUrl = _normUrl(entry.jobUrl);
      let result = null;

      // Tier 1: Job ID
      if (entry.jobId) {
        const m = apps.find(a => a.jobId && a.jobId === entry.jobId);
        if (m) { result = { type: 'exact', match: m }; }
      }

      // Tier 2: URL
      if (!result && normUrl) {
        const m = apps.find(a => _normUrl(a.jobUrl) === normUrl);
        if (m) { result = { type: 'url', match: m }; }
      }

      // Tier 3/4: Company+Role
      if (!result && entry.company && entry.role) {
        const nc = _normCo(entry.company), nr = _normRole(entry.role);
        if (nc && nr) {
          const matches = apps.filter(a => _normCo(a.company) === nc && _normRole(a.role) === nr);
          if (matches.length > 0) {
            matches.sort((a, b) => new Date(b.dateApplied) - new Date(a.dateApplied));
            const mr = matches[0];
            const days = Math.floor((Date.now() - new Date(mr.dateApplied).getTime()) / 86400000);
            if (days > 60 || mr.status === 'Rejected' || mr.status === 'Withdrawn') {
              result = { type: 'repost', match: mr, days };
            } else {
              result = { type: 'fuzzy', match: mr, days };
            }
          }
        }
      }

      if (!result) return;
      dupResult = result;
      showDupWarning(result);

      // Also show quick-update for Tier 1/2
      if (result.type === 'exact' || result.type === 'url') {
        showQuickUpdate(result.match);
      }
    } catch { /* silently skip */ }
  }

  function showDupWarning(result) {
    const m = result.match;

    if (result.type === 'exact' || result.type === 'url') {
      const emailLbl = m.email === 'A' ? (settings.labelA || 'A') : (settings.labelB || 'B');
      dupBanner.classList.remove('hidden');
      dupBanner.dataset.type = result.type;
      dupEmoji.textContent = '🚫';
      dupTitle.textContent = result.type === 'exact' ? 'Exact Duplicate' : 'URL Match';
      dupDetail.textContent = `Applied on ${_fmtDate(m.dateApplied)} via ${emailLbl}. Status: ${m.status}.`;
      btnDupUpdate.classList.remove('hidden');
      btnDupNew.textContent = 'Log anyway (re-apply)';
      btnLog.disabled = true;
      btnLog.style.opacity = '0.5';
    } else if (result.type === 'repost') {
      const oldId = m.rawJobId || m.jobId || 'N/A';
      dupBanner.classList.remove('hidden');
      dupBanner.dataset.type = 'repost';
      dupEmoji.textContent = '🔄';
      dupTitle.textContent = 'Re-posted Job Detected';
      dupDetail.textContent = `${m.company} reposted ${m.role}. Applied ${result.days || '?'} days ago (ID: ${oldId}, Status: ${m.status}).`;
      btnDupUpdate.classList.add('hidden');
      btnDupNew.textContent = 'Log as new application';
    } else if (result.type === 'fuzzy') {
      const emailLbl = m.email === 'A' ? (settings.labelA || 'A') : (settings.labelB || 'B');
      softWarning.classList.remove('hidden');
      softWarningText.textContent = `Similar role at ${m.company} applied ${result.days || '?'} days ago as ${emailLbl}. Continue?`;
    }
  }

  function showQuickUpdate(app) {
    quickUpdateBar.classList.remove('hidden');
    const statuses = ['Applied', 'Interviewing', 'Rejected', 'Offer', 'Withdrawn'];
    quickStatusPills.innerHTML = statuses.map(s =>
      `<button class="pill pill-status ${s === app.status ? 'active' : ''}" data-status="${s}" data-app-id="${app.id}">${s}</button>`
    ).join('');
  }

  /* ═══════════════════════════════
     Referral Message Generator
     ═══════════════════════════════ */

  function generateReferralMessage() {
    const name = inputReferralPerson.value.trim() || '[Name]';
    const role = inputRole.value.trim() || '[Role]';
    const company = inputCompany.value.trim() || '[Company]';
    const rawJobId = inputJobId.value.trim();
    const jobUrl = inputUrl.value.trim();

    // JOB_ID_LINE
    let jobIdLine;
    if (rawJobId) {
      jobIdLine = `Job ID: ${rawJobId}`;
    } else if (jobUrl) {
      jobIdLine = `Role link: ${jobUrl}`;
    } else {
      jobIdLine = '';
    }

    // SKILLS_LINE
    let skillsLine = '';
    if (keywordsData && keywordsData.mustHave) {
      const matched = keywordsData.mustHave.filter(k => MY_SKILLS.some(s => s.toLowerCase() === k.toLowerCase()));
      if (matched.length >= 2) {
        const top = matched.slice(0, 4).join(', ');
        skillsLine = `I have hands-on experience with ${top}, which aligns well with this role.`;
      }
    }
    if (!skillsLine) {
      // Fallback: role-based keyword mapping
      const r = role.toLowerCase();
      if (/frontend|react|angular|vue|ui/i.test(r)) skillsLine = 'I have hands-on experience with React.js, frontend development, and responsive UI design.';
      else if (/backend|node|django|api/i.test(r)) skillsLine = 'I have hands-on experience with backend development, REST APIs, and Node.js.';
      else if (/fullstack|full.?stack/i.test(r)) skillsLine = 'I have hands-on experience with full stack development with React and Node.js.';
      else if (/data|ml|ai|machine.?learning/i.test(r)) skillsLine = 'I have a strong foundation in data structures, algorithms, and ML fundamentals.';
      else if (/devops|cloud|aws|gcp/i.test(r)) skillsLine = 'I have hands-on experience with cloud platforms, CI/CD, and infrastructure tooling.';
      else if (/mobile|android|ios|flutter/i.test(r)) skillsLine = 'I have hands-on experience with mobile development and cross-platform frameworks.';
      else if (/sde|software.?engineer/i.test(r)) skillsLine = 'I have a strong foundation in data structures, algorithms, and software engineering.';
    }

    const msg =
      `Hi ${name},\n\n` +
      `I came across the ${role} at ${company} and wanted to ask if you could refer me for this position.` +
      (jobIdLine ? ` ${jobIdLine}` : '') +
      `\n\n` +
      `I am a final year B.Tech CSE student (2026) at VIT with a 9.32 CGPA, with a strong foundation in computer science fundamentals.` +
      (skillsLine ? `\n${skillsLine}` : '') +
      `\n\n` +
      `Please find my resume here:\nhttps://drive.google.com/file/d/12lNkX8Z8fN1ecycdakI-KM1NjENnNO2z/view?usp=drive_link\n\n` +
      `Kindly let me know if you need any additional details.\n\n` +
      `Thanks & Regards,\nPranjal Khare`;

    return msg;
  }

  /* ═══════════════════════════════
     Save / Update
     ═══════════════════════════════ */

  async function handleSave() {
    btnLog.disabled = true;
    btnLogText.classList.add('hidden');
    btnLogSpinner.classList.remove('hidden');

    const data = {
      jobId: scrapedData?.jobId || (inputJobId.value.trim() ? 'xx_' + inputJobId.value.trim() : null),
      rawJobId: inputJobId.value.trim() || scrapedData?.rawJobId || '',
      platform: scrapedData?.platform || 'Other',
      siteType: scrapedData?.siteType || 'employer',
      company: inputCompany.value.trim(),
      role: inputRole.value.trim(),
      location: inputLocation.value.trim(),
      source: inputSource.value.trim() || 'Direct',
      jobUrl: inputUrl.value.trim(),
      email: selectedEmail,
      status: selectedStatus,
      referral: referralOn,
      referralPerson: referralOn ? inputReferralPerson.value.trim() : '',
      notes: inputNotes.value.trim(),
      loggedFrom: 'popup',
      keywords: keywordsData || { mustHave: [], niceToHave: [], byCategory: {}, experienceLevel: '', yearsRequired: [] }
    };

    try {
      const result = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'SAVE_APPLICATION', data }, resolve);
      });

      if (result?.saved) {
        showSuccess(data.company, data.role);
      } else if (result?.duplicate) {
        btnLog.disabled = false;
        btnLogText.classList.remove('hidden');
        btnLogSpinner.classList.add('hidden');
        dupResult = { type: result.type, match: result.existing };
        showDupWarning(dupResult);
      } else {
        throw new Error(result?.error || 'Unknown error');
      }
    } catch (e) {
      console.error('Save failed:', e);
      btnLog.disabled = false;
      btnLogText.classList.remove('hidden');
      btnLogSpinner.classList.add('hidden');
      btnLogText.textContent = 'Error — try again';
      setTimeout(() => { btnLogText.textContent = 'Log Application'; }, 2000);
    }
  }

  async function handleForceSave(linkedJobId) {
    const data = {
      jobId: scrapedData?.jobId || (inputJobId.value.trim() ? 'xx_' + inputJobId.value.trim() : null),
      rawJobId: inputJobId.value.trim() || scrapedData?.rawJobId || '',
      platform: scrapedData?.platform || 'Other',
      siteType: scrapedData?.siteType || 'employer',
      company: inputCompany.value.trim(),
      role: inputRole.value.trim(),
      location: inputLocation.value.trim(),
      source: inputSource.value.trim() || 'Direct',
      jobUrl: inputUrl.value.trim(),
      email: selectedEmail,
      status: selectedStatus,
      referral: referralOn,
      referralPerson: referralOn ? inputReferralPerson.value.trim() : '',
      notes: inputNotes.value.trim(),
      loggedFrom: 'popup',
      linkedJobId: linkedJobId || '',
      keywords: keywordsData || { mustHave: [], niceToHave: [], byCategory: {}, experienceLevel: '', yearsRequired: [] }
    };

    try {
      const result = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'FORCE_SAVE_APPLICATION', data }, resolve);
      });
      if (result?.saved) showSuccess(data.company, data.role);
    } catch (e) {
      console.error('Force save failed:', e);
    }
  }

  function showSuccess(company, role) {
    mainView.querySelectorAll('.form-section, .btn-log, .dup-banner, .soft-warning, .quick-update-bar, .info-banner').forEach(el => el.classList.add('hidden'));
    successDetail.textContent = `${company} — ${role}`;
    successState.classList.remove('hidden');
    $('success-dashboard').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });
    setTimeout(() => window.close(), 1500);
  }

  /* ═══════════════════════════════
     Event Wiring
     ═══════════════════════════════ */

  function wireEvents() {
    // Email pills
    document.querySelectorAll('.pill-email').forEach(pill => {
      pill.addEventListener('click', () => {
        selectedEmail = pill.dataset.value;
        updateEmailPills();
      });
    });

    // Status pills
    document.querySelectorAll('.pill-status').forEach(pill => {
      pill.addEventListener('click', () => {
        selectedStatus = pill.dataset.value;
        updateStatusPills();
      });
    });

    // Referral toggle
    toggleReferral.addEventListener('click', () => {
      referralOn = !referralOn;
      toggleReferral.setAttribute('aria-checked', referralOn);
      referralFields.classList.toggle('hidden', !referralOn);
      if (referralOn) {
        selectedStatus = 'Referral Pending';
        updateStatusPills();
      }
    });

    // Copy referral
    $('btn-copy-referral').addEventListener('click', async () => {
      const msg = generateReferralMessage();
      try {
        await navigator.clipboard.writeText(msg);
        $('btn-copy-referral').textContent = '✓ Copied!';
        setTimeout(() => { $('btn-copy-referral').textContent = '📋 Copy referral message'; }, 1500);
      } catch { /* fallback */ }
    });

    // JD toggle
    jdToggle.addEventListener('click', () => {
      const isOpen = !jdPanel.classList.contains('hidden');
      jdPanel.classList.toggle('hidden', isOpen);
      jdChevron.classList.toggle('open', !isOpen);
    });

    // Copy keywords
    $('btn-copy-keywords').addEventListener('click', async () => {
      if (!keywordsData) return;
      const all = [...(keywordsData.mustHave || []), ...(keywordsData.niceToHave || [])];
      const text = 'Key skills: ' + all.join(', ');
      try {
        await navigator.clipboard.writeText(text);
        $('btn-copy-keywords').textContent = '✓ Copied!';
        setTimeout(() => { $('btn-copy-keywords').textContent = '📋 Copy for resume'; }, 1500);
      } catch { /* fallback */ }
    });

    // Log button
    btnLog.addEventListener('click', handleSave);

    // Dup actions
    btnDupNew.addEventListener('click', () => {
      dupBanner.classList.add('hidden');
      btnLog.disabled = false;
      btnLog.style.opacity = '1';
      if (dupResult?.type === 'repost') {
        handleForceSave(dupResult.match.id);
      } else {
        handleForceSave(dupResult?.match?.id || '');
      }
    });

    btnDupUpdate.addEventListener('click', () => {
      if (dupResult?.match) showQuickUpdate(dupResult.match);
      dupBanner.classList.add('hidden');
      btnLog.disabled = false;
      btnLog.style.opacity = '1';
    });

    btnSoftDismiss.addEventListener('click', () => softWarning.classList.add('hidden'));

    // Quick status update
    quickStatusPills.addEventListener('click', async (e) => {
      const pill = e.target.closest('.pill-status');
      if (!pill) return;
      const appId = pill.dataset.appId;
      const status = pill.dataset.status;
      try {
        await new Promise(resolve => {
          chrome.runtime.sendMessage({ type: 'UPDATE_APPLICATION', id: appId, patch: { status } }, resolve);
        });
        pill.parentElement.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      } catch { /* ignore */ }
    });

    // Settings
    btnSettings.addEventListener('click', () => settingsPanel.classList.remove('hidden'));
    btnBack.addEventListener('click', () => settingsPanel.classList.add('hidden'));
    btnDashboard.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') }));

    $('btn-save-settings').addEventListener('click', async () => {
      settings = await saveSettings({
        labelA: $('set-label-a').value.trim(), emailA: $('set-email-a').value.trim(),
        labelB: $('set-label-b').value.trim(), emailB: $('set-email-b').value.trim(),
        defaultEmail: $('set-default-email').value, defaultStatus: $('set-default-status').value,
        weeklyGoal: parseInt($('set-weekly-goal').value) || 5
      });
      applySettings();
      settingsPanel.classList.add('hidden');
    });

    $('btn-export-csv').addEventListener('click', async () => {
      const apps = await getAllApplications();
      const csv = exportAsCSV(apps, settings);
      downloadCSV(csv);
    });

    $('btn-clear-data').addEventListener('click', async () => {
      if (confirm('Delete ALL application data? This cannot be undone.')) {
        await clearAllData();
        $('btn-clear-data').textContent = '✓ Cleared';
        setTimeout(() => { $('btn-clear-data').textContent = '🗑️ Clear all data'; }, 1500);
      }
    });

    // Notes expand
    inputNotes.addEventListener('focus', () => { inputNotes.rows = 3; });
    inputNotes.addEventListener('blur', () => { if (!inputNotes.value) inputNotes.rows = 1; });
  }

  function updateEmailPills() {
    document.querySelectorAll('.pill-email').forEach(p => p.classList.toggle('active', p.dataset.value === selectedEmail));
  }

  function updateStatusPills() {
    document.querySelectorAll('#status-pills .pill-status').forEach(p => p.classList.toggle('active', p.dataset.value === selectedStatus));
  }

  /* ─── Helpers ─── */
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  const _STRIP = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','refId','trk','trkInfo','lipi','trackingId','fbclid','gclid','msclkid','mc_cid','_hsenc','_hsmi'];
  const _CO_STRIP = ['inc','ltd','llc','pvt','limited','technologies','tech','software','solutions','systems','group','corp','co'];
  const _ROLE_STRIP = ['senior','sr','junior','jr','lead','staff','principal','associate','assoc','eng','engineer','developer','dev','software','swe','sde'];

  function _normUrl(url) { try { const u = new URL(url); _STRIP.forEach(p => u.searchParams.delete(p)); u.hash = ''; return u.origin + u.pathname.replace(/\/+$/,''); } catch { return url; } }
  function _normCo(n) { if (!n) return ''; let s = n.toLowerCase(); _CO_STRIP.forEach(w => { s = s.replace(new RegExp(`\\b${w}\\b`,'g'),''); }); return s.replace(/[^\w\s]/g,'').replace(/\s+/g,' ').trim(); }
  function _normRole(t) { if (!t) return ''; let s = t.toLowerCase(); _ROLE_STRIP.forEach(w => { s = s.replace(new RegExp(`\\b${w}\\b`,'g'),''); }); return s.replace(/[^\w\s]/g,'').replace(/\s+/g,' ').trim(); }
  function _fmtDate(d) { try { return new Date(d).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}); } catch { return d; } }

  function downloadCSV(csv) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `jobtrackr_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ─── Init ─── */
  init();
})();
