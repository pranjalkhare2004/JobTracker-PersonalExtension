/* ═══════════════════════════════════════
   popup.js — Popup Logic V4
   Auto-fill, dedup, JD preview, AI prompts,
   snippets, follow-up, weekly banner, templates
   ═══════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── State ─── */
  let settings = {};
  let scrapedData = null;
  let dupResult = null;
  let selectedEmail = 'A';
  let selectedStatus = 'Applied';
  let referralOn = false;
  let keywordsData = null;
  let saveJDOn = false;
  let jdText = '';           // raw JD text from scraper
  let jdEditMode = false;
  let snippetsList = [];
  let mySkills = [];         // loaded from storage — NEVER hardcoded

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
  const inputJobType = $('input-job-type');
  const inputWorkMode = $('input-work-mode');
  const inputStipend = $('input-stipend');
  const inputDuration = $('input-duration');
  const conditionalFields = $('conditional-fields');
  const inputFollowupDate = $('input-followup-date');
  const followupSection = $('followup-section');

  const platformBadge = $('platform-badge');
  const platformCategoryBadge = $('platform-category-badge');
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

  const snippetPills = $('snippet-pills');

  /* ═══════════════════════════════
     Init
     ═══════════════════════════════ */

  async function init() {
    settings = await getSettings();
    mySkills = settings.mySkills || [];
    snippetsList = await getSnippets();
    applySettings();
    wireEvents();
    renderSnippetPills();
    checkWeeklyBanner();
    updateFollowupVisibility();
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

    // Default follow-up date
    const d = new Date();
    d.setDate(d.getDate() + (settings.followUpDefaultDays || 7));
    inputFollowupDate.value = d.toISOString().split('T')[0];
    const followupHint = $('followup-hint');
    if (followupHint) followupHint.textContent = `Default: ${settings.followUpDefaultDays || 7} days`;

    // Save JD toggle
    saveJDOn = settings.saveJD || false;
    $('toggle-save-jd').setAttribute('aria-checked', saveJDOn);

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
     Weekly Banner (Mondays only)
     ═══════════════════════════════ */

  async function checkWeeklyBanner() {
    const now = new Date();
    if (now.getDay() !== 1) return; // Monday only

    const lastDismiss = settings.lastWeeklyDismiss || '';
    const thisMonday = new Date(now);
    thisMonday.setHours(0, 0, 0, 0);
    if (lastDismiss && new Date(lastDismiss) >= thisMonday) return;

    try {
      const apps = await getAllApplications();
      const lastWeekStart = new Date(thisMonday);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      const lastWeekApps = apps.filter(a => {
        const d = new Date(a.dateApplied);
        return d >= lastWeekStart && d < thisMonday;
      });

      const applied = lastWeekApps.length;
      const interviewing = lastWeekApps.filter(a => a.status === 'Interviewing').length;
      const today = now.toISOString().split('T')[0];
      const followUpsDue = apps.filter(a => a.followUpDate && !a.followUpDone && a.followUpDate <= today).length;

      $('weekly-banner-text').textContent = `📊 Last week: ${applied} applied · ${interviewing} interviewing · ${followUpsDue} follow-ups due`;
      $('weekly-banner').classList.remove('hidden');
    } catch { /* silently skip */ }
  }

  /* ═══════════════════════════════
     Snippet Pills
     ═══════════════════════════════ */

  function renderSnippetPills() {
    if (!snippetPills || snippetsList.length === 0) return;
    snippetPills.innerHTML = snippetsList.map(s =>
      `<button class="pill btn-xs snippet-pill" title="Add to notes">${esc(s)}</button>`
    ).join('');
  }

  /* ═══════════════════════════════
     Follow-up Visibility
     ═══════════════════════════════ */

  function updateFollowupVisibility() {
    if (!followupSection) return;
    const show = selectedStatus === 'Applied' || selectedStatus === 'Referral Pending';
    followupSection.classList.toggle('hidden', !show);
  }

  /* ═══════════════════════════════
     Fetch Job Data from Content Script
     ═══════════════════════════════ */

  async function fetchJobData() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) inputUrl.value = tab.url;
    } catch { /* ignore */ }

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
    platformCategoryBadge.textContent = data.platformCategory || 'Other';
    platformCategoryBadge.dataset.category = data.platformCategory || 'Other';
    scrapeIndicator.dataset.quality = data.scrapeQuality || 'failed';
    scrapeIndicator.title = `Scrape: ${data.scrapeQuality || 'failed'}`;

    if (data.jobType && data.jobType !== 'Unknown') inputJobType.value = data.jobType;
    if (data.workMode && data.workMode !== 'Unknown') inputWorkMode.value = data.workMode;
    updateConditionalFields();

    if (data.stipend) inputStipend.value = data.stipend;
    if (data.duration) inputDuration.value = data.duration;

    if (data.siteType === 'aggregator') {
      aggregatorHint.classList.remove('hidden');
      aggregatorText.textContent = `ℹ️ Job ID not available on ${data.platform}. Visit the company careers page for the real Job ID.`;
    }

    // Keywords
    if (data.keywords && (data.keywords.mustHave?.length > 0 || data.keywords.niceToHave?.length > 0)) {
      keywordsData = data.keywords;
      renderJDInsights();
    } else {
      jdSection.classList.add('hidden');
    }

    // JD text for preview
    jdText = data.jobDescription || '';
    if (saveJDOn) showJDPreview();

    checkForDuplicates();
  }

  function updateConditionalFields() {
    const jt = inputJobType.value;
    conditionalFields.classList.toggle('hidden', jt !== 'Internship' && jt !== 'Contract');
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

    // Match score (uses mySkills from storage)
    const myMatches = must.filter(k => mySkills.some(s => s.toLowerCase() === k.toLowerCase()));
    const matchCount = myMatches.length;
    const matchTotal = must.length;
    const matchPct = matchTotal > 0 ? Math.round((matchCount / matchTotal) * 100) : 0;

    jdSummary.textContent = `${total} keywords  •  Match: ${matchCount}/${matchTotal}`;

    jdMustPills.innerHTML = must.map(s => {
      const isMatch = mySkills.some(ms => ms.toLowerCase() === s.toLowerCase());
      return `<span class="skill-pill ${isMatch ? 'skill-pill-match' : 'skill-pill-miss'}">${esc(s)}</span>`;
    }).join('');

    jdNicePills.innerHTML = nice.map(s => `<span class="skill-pill skill-pill-nice">${esc(s)}</span>`).join('');
    if (nice.length === 0) $('jd-nice-have').classList.add('hidden');

    jdMatch.innerHTML = `${matchCount}/${matchTotal} required skills
      <span class="jd-match-bar jd-match-bar-bg">
        <span class="jd-match-bar-fill" style="width:${matchPct}%"></span>
      </span> ${matchPct}%`;

    const lvl = keywordsData.experienceLevel || '';
    const yrs = keywordsData.yearsRequired?.join(', ') || '';
    jdLevel.textContent = [lvl, yrs].filter(Boolean).join('  •  ');
  }

  /* ═══════════════════════════════
     JD Preview Panel
     ═══════════════════════════════ */

  function showJDPreview() {
    const panel = $('jd-preview-panel');
    const textarea = $('jd-preview-text');
    const charCount = $('jd-char-count');
    const manualPaste = $('jd-manual-paste');

    panel.classList.remove('hidden');

    if (jdText && jdText.length > 0) {
      textarea.value = jdText;
      textarea.classList.remove('hidden');
      manualPaste.classList.add('hidden');
    } else {
      textarea.value = '';
      textarea.classList.add('hidden');
      manualPaste.classList.remove('hidden');
    }

    updateJDCharCount();
    updateJDQuality();
    updateJDStorageImpact();
  }

  function hideJDPreview() {
    const panel = $('jd-preview-panel');
    panel.classList.add('hidden');
  }

  function updateJDCharCount() {
    const text = getActiveJDText();
    $('jd-char-count').textContent = `${text.length.toLocaleString()} chars`;
  }

  function updateJDQuality() {
    const text = getActiveJDText();
    const dot = $('jd-quality-dot');
    const label = $('jd-quality-text');

    if (!text || text.length < 50) {
      dot.dataset.quality = 'failed';
      label.textContent = 'Poor scrape — mostly nav/boilerplate detected';
      return;
    }

    // Quick keyword count from the text
    const lower = text.toLowerCase();
    const techWords = ['python','java','javascript','react','node','sql','docker','aws','api','rest','git','database','agile','kubernetes'];
    const found = techWords.filter(w => lower.includes(w)).length;

    if (found >= 3) {
      dot.dataset.quality = 'full';
      label.textContent = 'Looks good — role and requirements detected';
    } else if (found >= 1) {
      dot.dataset.quality = 'partial';
      label.textContent = 'Partial — limited requirements found';
    } else {
      dot.dataset.quality = 'failed';
      label.textContent = 'Poor scrape — mostly nav/boilerplate detected';
    }
  }

  async function updateJDStorageImpact() {
    const el = $('jd-storage-impact');
    if (!el) return;
    const text = getActiveJDText();
    const kb = Math.ceil(text.length / 1024);
    try {
      const usage = await getStorageUsage();
      const pct = Math.round((usage.total / usage.limit) * 100);
      el.textContent = `Saving JD uses ~${kb} KB of your 100 KB storage budget (currently ${pct}% used)`;
    } catch {
      el.textContent = `Saving JD uses ~${kb} KB of your 100 KB storage budget`;
    }
  }

  function getActiveJDText() {
    const manualInput = $('jd-manual-input');
    const previewText = $('jd-preview-text');
    if (manualInput && !manualInput.closest('.hidden') && manualInput.value.trim()) {
      return manualInput.value.trim();
    }
    return previewText ? previewText.value.trim() : '';
  }

  /* ═══════════════════════════════
     AI Prompts
     ═══════════════════════════════ */

  function buildCurrentEntry() {
    return {
      role: inputRole.value.trim(),
      company: inputCompany.value.trim(),
      rawJobId: inputJobId.value.trim(),
      jobId: scrapedData?.jobId || null,
      location: inputLocation.value.trim(),
      jobType: inputJobType.value || 'Unknown',
      source: inputSource.value.trim() || 'Direct',
      jobUrl: inputUrl.value.trim(),
      dateApplied: new Date().toISOString(),
      keywords: keywordsData || { mustHave: [], niceToHave: [], byCategory: {}, experienceLevel: '', yearsRequired: [] },
      referralPerson: inputReferralPerson.value.trim(),
      stipend: inputStipend.value.trim(),
      workMode: inputWorkMode.value || 'Unknown',
    };
  }

  async function handleAIPrompt(templateKey) {
    const toast = $('ai-toast');
    try {
      const templates = await getTemplates();
      const template = templates[templateKey];
      if (!template) { showAIToast('Template not found', 'error'); return; }

      const entry = buildCurrentEntry();
      const data = await buildTemplateData(entry);
      const rendered = renderTemplate(template, data);

      await navigator.clipboard.writeText(rendered);

      // Check if cover letter base is still default
      if (templateKey === 'coverLetterPrompt' && templates.coverLetterBase &&
          templates.coverLetterBase.includes('[Paste your own cover letter')) {
        showAIToast('⚠️ Copied! Add your cover letter in Settings Hub → Templates first', 'warn');
      } else {
        showAIToast('✓ Copied! Paste into ChatGPT →', 'success');
      }
    } catch (e) {
      console.error('AI prompt failed:', e);
      showAIToast('Failed to generate prompt', 'error');
    }
  }

  function showAIToast(msg, type) {
    const toast = $('ai-toast');
    toast.textContent = msg;
    toast.className = 'ai-toast ' + (type || '');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
  }

  /* ═══════════════════════════════
     Status Note Prompts
     ═══════════════════════════════ */

  async function checkStatusNotePrompt(status) {
    const templates = await getTemplates();
    const prompts = templates.statusNotePrompts || {};
    const notePromptEl = $('status-note-prompt');
    const noteLabel = $('status-note-label');
    const noteInput = $('status-note-input');

    if (prompts[status]) {
      noteLabel.textContent = prompts[status];
      noteInput.value = '';
      notePromptEl.classList.remove('hidden');
      noteInput.focus();
    } else {
      notePromptEl.classList.add('hidden');
    }
  }

  function appendStatusNote(status) {
    const noteInput = $('status-note-input');
    const notePromptEl = $('status-note-prompt');
    if (!noteInput || !noteInput.value.trim()) {
      notePromptEl.classList.add('hidden');
      return;
    }

    const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const noteEntry = `[${dateStr}] → ${status}: ${noteInput.value.trim()}`;
    const current = inputNotes.value.trim();
    inputNotes.value = current ? `${current}\n${noteEntry}` : noteEntry;
    noteInput.value = '';
    notePromptEl.classList.add('hidden');
  }

  /* ═══════════════════════════════
     Duplicate Detection
     ═══════════════════════════════ */

  async function checkForDuplicates() {
    try {
      const apps = await getAllApplications();
      if (apps.length === 0) return;

      const entry = {
        jobId: scrapedData?.jobId || (inputJobId.value.trim() ? 'xx_' + inputJobId.value.trim() : null),
        jobUrl: inputUrl.value,
        company: inputCompany.value,
        role: inputRole.value
      };

      const normUrl = _normUrl(entry.jobUrl);
      let result = null;

      if (entry.jobId) {
        const m = apps.find(a => a.jobId && a.jobId === entry.jobId);
        if (m) { result = { type: 'exact', match: m }; }
      }

      if (!result && normUrl) {
        const m = apps.find(a => _normUrl(a.jobUrl) === normUrl);
        if (m) { result = { type: 'url', match: m }; }
      }

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
     Referral Message (Template-based)
     ═══════════════════════════════ */

  async function generateReferralMessage() {
    const entry = buildCurrentEntry();
    const templates = await getTemplates();
    const data = await buildTemplateData(entry);
    return renderTemplate(templates.referralMessage, data);
  }

  /* ═══════════════════════════════
     Save / Update
     ═══════════════════════════════ */

  async function handleSave() {
    btnLog.disabled = true;
    btnLogText.classList.add('hidden');
    btnLogSpinner.classList.remove('hidden');

    // Get active JD text
    let activeJD = '';
    if (saveJDOn) {
      activeJD = getActiveJDText();
      if (activeJD.length > 8000) activeJD = activeJD.substring(0, 8000) + ' [truncated]';
    }

    const data = {
      jobId: scrapedData?.jobId || (inputJobId.value.trim() ? 'xx_' + inputJobId.value.trim() : null),
      rawJobId: inputJobId.value.trim() || scrapedData?.rawJobId || '',
      platform: scrapedData?.platform || 'Other',
      siteType: scrapedData?.siteType || 'employer',
      platformCategory: scrapedData?.platformCategory || 'Other',
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
      keywords: keywordsData || { mustHave: [], niceToHave: [], byCategory: {}, experienceLevel: '', yearsRequired: [] },
      jobType: inputJobType.value || 'Unknown',
      workMode: inputWorkMode.value || 'Unknown',
      jobDescription: activeJD,
      stipend: inputStipend.value.trim(),
      duration: inputDuration.value.trim(),
      followUpDate: inputFollowupDate?.value || '',
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
    let activeJD = '';
    if (saveJDOn) {
      activeJD = getActiveJDText();
      if (activeJD.length > 8000) activeJD = activeJD.substring(0, 8000) + ' [truncated]';
    }

    const data = {
      jobId: scrapedData?.jobId || (inputJobId.value.trim() ? 'xx_' + inputJobId.value.trim() : null),
      rawJobId: inputJobId.value.trim() || scrapedData?.rawJobId || '',
      platform: scrapedData?.platform || 'Other',
      siteType: scrapedData?.siteType || 'employer',
      platformCategory: scrapedData?.platformCategory || 'Other',
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
      keywords: keywordsData || { mustHave: [], niceToHave: [], byCategory: {}, experienceLevel: '', yearsRequired: [] },
      jobType: inputJobType.value || 'Unknown',
      workMode: inputWorkMode.value || 'Unknown',
      jobDescription: activeJD,
      stipend: inputStipend.value.trim(),
      duration: inputDuration.value.trim(),
      followUpDate: inputFollowupDate?.value || '',
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
    document.querySelectorAll('#status-pills .pill-status').forEach(pill => {
      pill.addEventListener('click', () => {
        const prevStatus = selectedStatus;
        selectedStatus = pill.dataset.value;
        updateStatusPills();
        updateFollowupVisibility();

        // Status note prompt
        if (selectedStatus !== prevStatus) {
          appendStatusNote(prevStatus); // save previous if pending
          checkStatusNotePrompt(selectedStatus);
        }
      });
    });

    // Status note input — append on Enter
    $('status-note-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { appendStatusNote(selectedStatus); e.preventDefault(); }
      if (e.key === 'Escape') { $('status-note-prompt').classList.add('hidden'); }
    });

    // Referral toggle
    toggleReferral.addEventListener('click', () => {
      referralOn = !referralOn;
      toggleReferral.setAttribute('aria-checked', referralOn);
      referralFields.classList.toggle('hidden', !referralOn);
      if (referralOn) {
        selectedStatus = 'Referral Pending';
        updateStatusPills();
        updateFollowupVisibility();
      }
    });

    // Copy referral (template-based)
    $('btn-copy-referral').addEventListener('click', async () => {
      const msg = await generateReferralMessage();
      try {
        await navigator.clipboard.writeText(msg);
        $('btn-copy-referral').textContent = '✓ Copied!';
        setTimeout(() => { $('btn-copy-referral').textContent = '📋 Copy referral message'; }, 1500);
      } catch { /* fallback */ }
    });

    // JD Insights toggle
    jdToggle.addEventListener('click', () => {
      const isOpen = !jdPanel.classList.contains('hidden');
      jdPanel.classList.toggle('hidden', isOpen);
      jdChevron.classList.toggle('open', !isOpen);
    });

    // Job type change
    inputJobType.addEventListener('change', updateConditionalFields);

    // Save JD toggle — shows/hides preview
    $('toggle-save-jd').addEventListener('click', () => {
      saveJDOn = !saveJDOn;
      $('toggle-save-jd').setAttribute('aria-checked', saveJDOn);
      if (saveJDOn) {
        showJDPreview();
      } else {
        hideJDPreview();
      }
    });

    // JD preview edit mode
    $('jd-preview-edit')?.addEventListener('click', () => {
      const textarea = $('jd-preview-text');
      jdEditMode = !jdEditMode;
      textarea.readOnly = !jdEditMode;
      $('jd-preview-edit').textContent = jdEditMode ? 'Done editing' : 'Edit';
      if (jdEditMode) textarea.focus();
    });

    // JD preview text changes
    $('jd-preview-text')?.addEventListener('input', () => {
      updateJDCharCount();
      updateJDQuality();
    });

    // Manual JD paste
    $('jd-manual-input')?.addEventListener('input', () => {
      updateJDCharCount();
      updateJDQuality();
    });

    // Copy keywords
    $('btn-copy-keywords')?.addEventListener('click', async () => {
      if (!keywordsData) return;
      const all = [...(keywordsData.mustHave || []), ...(keywordsData.niceToHave || [])];
      const text = 'Key skills: ' + all.join(', ');
      try {
        await navigator.clipboard.writeText(text);
        $('btn-copy-keywords').textContent = '✓ Copied!';
        setTimeout(() => { $('btn-copy-keywords').textContent = '📋 Copy for resume'; }, 1500);
      } catch { /* fallback */ }
    });

    // AI prompts toggle
    $('ai-prompts-toggle')?.addEventListener('click', () => {
      const panel = $('ai-prompts-panel');
      const chevron = $('ai-chevron');
      const isOpen = !panel.classList.contains('hidden');
      panel.classList.toggle('hidden', isOpen);
      chevron.classList.toggle('open', !isOpen);
    });

    // AI prompt buttons
    $('btn-ai-cover-letter')?.addEventListener('click', () => handleAIPrompt('coverLetterPrompt'));
    $('btn-ai-resume')?.addEventListener('click', () => handleAIPrompt('resumeTailoringPrompt'));
    $('btn-ai-interview')?.addEventListener('click', () => handleAIPrompt('interviewPrepPrompt'));
    $('btn-ai-referral')?.addEventListener('click', async () => {
      const msg = await generateReferralMessage();
      try {
        await navigator.clipboard.writeText(msg);
        showAIToast('✓ Referral message copied!', 'success');
      } catch { showAIToast('Failed to copy', 'error'); }
    });

    // Snippet pills
    snippetPills?.addEventListener('click', (e) => {
      const pill = e.target.closest('.snippet-pill');
      if (!pill) return;
      const text = pill.textContent;
      const current = inputNotes.value.trim();
      inputNotes.value = current ? `${current}\n${text}` : text;
      inputNotes.rows = 3;
    });

    // Log button
    btnLog.addEventListener('click', handleSave);

    // Dup actions
    btnDupNew.addEventListener('click', () => {
      dupBanner.classList.add('hidden');
      btnLog.disabled = false;
      btnLog.style.opacity = '1';
      handleForceSave(dupResult?.match?.id || '');
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

    // Weekly banner
    $('weekly-banner-dash')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });
    $('weekly-banner-dismiss')?.addEventListener('click', async () => {
      $('weekly-banner').classList.add('hidden');
      await saveSettings({ lastWeeklyDismiss: new Date().toISOString() });
    });

    // Settings
    btnSettings.addEventListener('click', () => settingsPanel.classList.remove('hidden'));
    btnBack.addEventListener('click', () => settingsPanel.classList.add('hidden'));
    btnDashboard.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') }));

    // Open full Settings Hub
    $('btn-open-settings-hub')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') + '#settings' });
    });

    $('btn-save-settings').addEventListener('click', async () => {
      settings = await saveSettings({
        labelA: $('set-label-a').value.trim(), emailA: $('set-email-a').value.trim(),
        labelB: $('set-label-b').value.trim(), emailB: $('set-email-b').value.trim(),
        defaultEmail: $('set-default-email').value, defaultStatus: $('set-default-status').value,
        weeklyGoal: parseInt($('set-weekly-goal').value) || 5,
      });
      applySettings();
      settingsPanel.classList.add('hidden');
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
