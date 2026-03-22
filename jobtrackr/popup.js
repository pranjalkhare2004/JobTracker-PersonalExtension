/* ═══════════════════════════════════════
   popup.js — Popup Logic
   ═══════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── State ─── */
  let currentSettings = null;
  let selectedEmail = 'A';
  let selectedStatus = 'Applied';
  let referralEnabled = false;
  let currentJobData = null;
  let existingMatch = null;
  let existingMatchTier = null;
  let isUpdating = false; // true if user chose "Update existing"

  /* ─── DOM References ─── */
  const $ = id => document.getElementById(id);
  const mainView = $('main-view');
  const settingsPanel = $('settings-panel');

  // Form
  const inputRole = $('input-role');
  const inputCompany = $('input-company');
  const inputUrl = $('input-url');
  const platformBadge = $('platform-badge');
  const scrapeIndicator = $('scrape-indicator');
  const inputNotes = $('input-notes');
  const inputReferralPerson = $('input-referral-person');

  // Buttons
  const btnLog = $('btn-log');
  const btnLogText = $('btn-log-text');
  const btnLogSpinner = $('btn-log-spinner');
  const btnSettings = $('btn-settings');
  const btnDashboard = $('btn-dashboard');
  const btnBack = $('btn-back');
  const btnSaveSettings = $('btn-save-settings');
  const btnExportCSV = $('btn-export-csv');
  const btnClearData = $('btn-clear-data');
  const btnCopyReferral = $('btn-copy-referral');

  // Duplicate
  const dupBanner = $('dup-banner');
  const dupTitle = $('dup-title');
  const dupDetail = $('dup-detail');
  const btnDupUpdate = $('btn-dup-update');
  const btnDupNew = $('btn-dup-new');
  const softWarning = $('soft-warning');
  const softWarningText = $('soft-warning-text');
  const btnSoftDismiss = $('btn-soft-dismiss');

  // Quick update
  const quickUpdateBar = $('quick-update-bar');
  const quickStatusPills = $('quick-status-pills');

  // Success
  const successState = $('success-state');
  const successDetail = $('success-detail');
  const successDashboard = $('success-dashboard');

  // Referral
  const toggleReferral = $('toggle-referral');
  const referralFields = $('referral-fields');

  /* ═══════════════════════════════════════
     Initialization
     ═══════════════════════════════════════ */

  async function init() {
    // Load settings first
    currentSettings = await getSettings();
    applySettingsToUI(currentSettings);

    // Set defaults
    selectedEmail = currentSettings.defaultEmail || 'A';
    selectedStatus = currentSettings.defaultStatus || 'Applied';
    activatePill('email-pills', selectedEmail);
    activatePill('status-pills', selectedStatus);

    // Try to get job data from content script
    await fetchJobData();

    // Wire up events
    wireEvents();
  }

  function applySettingsToUI(s) {
    $('pill-label-a').textContent = s.labelA || 'Primary';
    $('pill-label-b').textContent = s.labelB || 'Referral';
    $('pill-addr-a').textContent = s.emailA || 'Not set';
    $('pill-addr-b').textContent = s.emailB || 'Not set';

    // Settings panel
    $('set-label-a').value = s.labelA || '';
    $('set-email-a').value = s.emailA || '';
    $('set-label-b').value = s.labelB || '';
    $('set-email-b').value = s.emailB || '';
    $('set-default-email').value = s.defaultEmail || 'A';
    $('set-default-status').value = s.defaultStatus || 'Applied';
    $('set-weekly-goal').value = s.weeklyGoal || 5;
  }

  /* ─── Fetch Job Data from Content Script ─── */
  async function fetchJobData() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return setManualMode();

      // Try sending message with timeout
      const response = await Promise.race([
        new Promise((resolve) => {
          chrome.tabs.sendMessage(tab.id, { type: 'GET_JOB_DATA' }, (resp) => {
            if (chrome.runtime.lastError) resolve(null);
            else resolve(resp);
          });
        }),
        new Promise(resolve => setTimeout(() => resolve(null), 300))
      ]);

      if (response && response.success && response.data) {
        currentJobData = response.data;
        populateForm(response.data);
        await checkExistingEntry(response.data);
      } else {
        // Fallback: try to extract data from URL alone
        const urlData = extractFromUrl(tab.url);
        if (urlData) {
          currentJobData = urlData;
          populateForm(urlData);
          await checkExistingEntry(urlData);
        } else {
          setManualMode();
        }
      }
    } catch {
      setManualMode();
    }
  }

  function extractFromUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      const host = u.hostname;
      let platform = 'Other';
      if (host.includes('linkedin.com')) platform = 'LinkedIn';
      else if (host.includes('wellfound.com') || host.includes('angel.co')) platform = 'Wellfound';
      else if (host.includes('indeed.com')) platform = 'Indeed';
      else if (host.includes('naukri.com')) platform = 'Naukri';

      // Try to extract job ID
      let jobId = null;
      const path = u.pathname;
      if (platform === 'LinkedIn') {
        const m = path.match(/\/jobs\/view\/(\d+)/);
        jobId = m ? `li_${m[1]}` : null;
      } else if (platform === 'Indeed') {
        const jk = u.searchParams.get('jk');
        jobId = jk ? `in_${jk}` : null;
      } else if (platform === 'Wellfound') {
        const m = path.match(/\/jobs\/(\d+)/) || path.match(/\/l\/(\d+)/);
        jobId = m ? `wf_${m[1]}` : null;
      } else if (platform === 'Naukri') {
        const m = path.match(/-(\d+)\.html$/);
        jobId = m ? `nk_${m[1]}` : null;
      }

      // Normalize URL
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'refId', 'trackingId', 'from', 'src', 'lipi', 'trk', 'trkInfo',
        'ref', 'referrer', 'source', 'campaign', 'medium', 'fbclid', 'gclid'
      ];
      trackingParams.forEach(p => u.searchParams.delete(p));
      u.hash = '';
      const canonicalUrl = u.origin + u.pathname.replace(/\/+$/, '') + (u.search || '');

      if (platform !== 'Other' || jobId) {
        return { company: '', role: '', jobId, platform, canonicalUrl, scrapeQuality: 'failed' };
      }
      return null;
    } catch { return null; }
  }

  function populateForm(data) {
    inputRole.value = data.role || '';
    inputCompany.value = data.company || '';
    inputUrl.value = data.canonicalUrl || '';

    platformBadge.textContent = data.platform || 'Other';
    platformBadge.setAttribute('data-platform', data.platform || 'Other');

    scrapeIndicator.setAttribute('data-quality', data.scrapeQuality || 'failed');
    const qualityTitles = { full: 'All fields detected', partial: 'Partial detection', failed: 'Manual entry needed' };
    scrapeIndicator.title = qualityTitles[data.scrapeQuality] || 'Unknown';
  }

  function setManualMode() {
    platformBadge.textContent = 'Manual';
    platformBadge.setAttribute('data-platform', 'Other');
    scrapeIndicator.setAttribute('data-quality', 'failed');
    scrapeIndicator.title = 'Manual entry mode';
  }

  /* ─── Duplicate Check ─── */
  async function checkExistingEntry(data) {
    try {
      const apps = await getAllApplications();
      const result = await checkDuplicate(data, apps);

      if (result.tier === 1 || result.tier === 2) {
        existingMatch = result.match;
        existingMatchTier = result.tier;
        showDupBanner(result.match, result.tier);
        showQuickUpdateBar(result.match);
      } else if (result.tier === 3) {
        showSoftWarning(result.match);
      }
    } catch { /* silently ignore dedup errors */ }
  }

  function showDupBanner(match, tier) {
    dupBanner.classList.remove('hidden');
    const tierLabel = tier === 1 ? 'Exact job match' : 'URL match';
    dupTitle.textContent = `${tierLabel} — Already Logged`;
    const emailLabel = match.email === 'A' ? (currentSettings.labelA || 'A') : (currentSettings.labelB || 'B');
    dupDetail.textContent = `Logged on ${formatDate(match.dateApplied)} via ${emailLabel} — Status: ${match.status}`;
    btnLogText.textContent = 'Log Application';
  }

  function showQuickUpdateBar(match) {
    quickUpdateBar.classList.remove('hidden');
    const statuses = ['Applied', 'Interviewing', 'Rejected', 'Offer', 'Withdrawn'];
    quickStatusPills.innerHTML = statuses.map(s =>
      `<button class="pill pill-status ${s === match.status ? 'active' : ''}" data-value="${s}" data-quick="true">${s}</button>`
    ).join('');

    quickStatusPills.querySelectorAll('.pill').forEach(p => {
      p.addEventListener('click', async () => {
        const newStatus = p.getAttribute('data-value');
        try {
          await chrome.runtime.sendMessage({
            type: 'UPDATE_APPLICATION',
            id: match.id,
            patch: { status: newStatus }
          });
          showSuccess(`${match.company} — Updated to ${newStatus}`);
        } catch (e) {
          console.error('Quick update failed:', e);
        }
      });
    });
  }

  function showSoftWarning(match) {
    softWarning.classList.remove('hidden');
    const emailLabel = match.email === 'A' ? (currentSettings.labelA || 'A') : (currentSettings.labelB || 'B');
    softWarningText.textContent = `You may have applied to a similar role at ${match.company} on ${formatDate(match.dateApplied)}. Applied as ${emailLabel}. Continue anyway?`;
  }

  /* ─── Wire Events ─── */
  function wireEvents() {
    // Email pills
    document.querySelectorAll('.pill-email').forEach(pill => {
      pill.addEventListener('click', () => {
        selectedEmail = pill.getAttribute('data-value');
        activatePill('email-pills', selectedEmail);
      });
    });

    // Status pills
    document.querySelectorAll('#status-pills .pill-status').forEach(pill => {
      pill.addEventListener('click', () => {
        selectedStatus = pill.getAttribute('data-value');
        activatePill('status-pills', selectedStatus);

        // Auto-expand referral if Re-applied
        if (selectedStatus === 'Re-applied (Referral)' && !referralEnabled) {
          toggleReferralSection(true);
        }
      });
    });

    // Referral toggle
    toggleReferral.addEventListener('click', () => {
      toggleReferralSection(!referralEnabled);
    });

    // Copy referral message
    btnCopyReferral.addEventListener('click', () => {
      const person = inputReferralPerson.value.trim();
      const company = inputCompany.value.trim();
      const role = inputRole.value.trim();
      const name = person.split('/').pop().split('?')[0] || person; // handle LinkedIn URLs
      const msg = `Hi ${name || 'there'}, I noticed you work at ${company || '[Company]'}. I'm applying for the ${role || '[Role]'} position and would love a referral if you're comfortable. Would really appreciate your help!`;
      navigator.clipboard.writeText(msg).then(() => {
        btnCopyReferral.textContent = '✓ Copied!';
        setTimeout(() => { btnCopyReferral.textContent = '📋 Copy referral message'; }, 1500);
      });
    });

    // Log button
    btnLog.addEventListener('click', handleLog);

    // Duplicate actions
    btnDupUpdate.addEventListener('click', () => {
      isUpdating = true;
      dupBanner.classList.add('hidden');
      btnLogText.textContent = 'Update Application';
    });

    btnDupNew.addEventListener('click', async () => {
      isUpdating = false;
      dupBanner.classList.add('hidden');
      existingMatch = null;
      existingMatchTier = null;

      // Pre-fill for re-apply flow
      selectedStatus = 'Re-applied (Referral)';
      activatePill('status-pills', selectedStatus);

      // Switch email to referral email
      if (selectedEmail === 'A') {
        selectedEmail = 'B';
        activatePill('email-pills', 'B');
      }

      // Expand referral section
      toggleReferralSection(true);
      btnLogText.textContent = 'Log Application';
    });

    // Soft warning dismiss
    btnSoftDismiss.addEventListener('click', () => {
      softWarning.classList.add('hidden');
    });

    // Settings
    btnSettings.addEventListener('click', () => {
      settingsPanel.classList.remove('hidden');
      mainView.style.display = 'none';
    });

    btnBack.addEventListener('click', () => {
      settingsPanel.classList.add('hidden');
      mainView.style.display = '';
    });

    btnSaveSettings.addEventListener('click', handleSaveSettings);

    // Dashboard
    btnDashboard.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });

    successDashboard.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });

    // CSV Export
    btnExportCSV.addEventListener('click', handleExportCSV);

    // Clear Data
    btnClearData.addEventListener('click', handleClearData);
  }

  /* ─── Pill Activation Helper ─── */
  function activatePill(groupId, value) {
    const group = $(groupId);
    group.querySelectorAll('.pill').forEach(p => {
      p.classList.toggle('active', p.getAttribute('data-value') === value);
    });
  }

  /* ─── Toggle Referral ─── */
  function toggleReferralSection(state) {
    referralEnabled = state;
    toggleReferral.setAttribute('aria-checked', String(state));
    referralFields.classList.toggle('hidden', !state);
  }

  /* ─── Handle Log / Save ─── */
  async function handleLog() {
    const role = inputRole.value.trim();
    const company = inputCompany.value.trim();
    const url = inputUrl.value.trim();

    // Validate
    if (!role && !company) {
      shakeButton(btnLog);
      inputRole.focus();
      return;
    }

    setLoading(true);

    const data = {
      jobId: currentJobData?.jobId || null,
      platform: currentJobData?.platform || 'Other',
      company,
      role,
      jobUrl: url,
      email: selectedEmail,
      emailA: currentSettings.emailA,
      emailB: currentSettings.emailB,
      status: selectedStatus,
      referral: referralEnabled,
      referralPerson: inputReferralPerson.value.trim(),
      notes: inputNotes.value.trim(),
      source: 'popup'
    };

    try {
      if (isUpdating && existingMatch) {
        // Update existing entry
        const result = await chrome.runtime.sendMessage({
          type: 'UPDATE_APPLICATION',
          id: existingMatch.id,
          patch: {
            status: selectedStatus,
            email: selectedEmail,
            referral: referralEnabled,
            referralPerson: data.referralPerson,
            notes: data.notes
          }
        });

        if (result.error) throw new Error(result.error);
        showSuccess(`${company} — ${role} (Updated)`);

      } else if (existingMatchTier === 1 || existingMatchTier === 2) {
        // Force save (user already clicked "Log as new")
        // This path shouldn't normally be reached because btnDupNew clears existingMatch
        const result = await chrome.runtime.sendMessage({
          type: 'FORCE_SAVE_APPLICATION',
          data
        });
        if (result.error) throw new Error(result.error);
        showSuccess(`${company} — ${role}`);

      } else {
        // Normal save
        const result = await chrome.runtime.sendMessage({
          type: 'SAVE_APPLICATION',
          data
        });

        if (result.error) throw new Error(result.error);

        if (result.duplicate) {
          setLoading(false);
          existingMatch = result.existing;
          existingMatchTier = result.tier;
          showDupBanner(result.existing, result.tier);
          return;
        }

        showSuccess(`${company} — ${role}`);
      }
    } catch (e) {
      setLoading(false);
      console.error('Save failed:', e);
      btnLogText.textContent = 'Error — Try again';
      setTimeout(() => { btnLogText.textContent = isUpdating ? 'Update Application' : 'Log Application'; }, 2000);
    }
  }

  function setLoading(loading) {
    btnLog.disabled = loading;
    btnLogText.classList.toggle('hidden', loading);
    btnLogSpinner.classList.toggle('hidden', !loading);
  }

  function showSuccess(detail) {
    setLoading(false);
    mainView.querySelectorAll('.form-section, .header, .quick-update-bar, .dup-banner, .soft-warning, #btn-log').forEach(
      el => el.classList.add('hidden')
    );
    successState.classList.remove('hidden');
    successDetail.textContent = detail;

    // Auto-close after 1.5s
    setTimeout(() => { window.close(); }, 1500);
  }

  function shakeButton(btn) {
    btn.style.animation = 'none';
    btn.offsetHeight; // trigger reflow
    btn.style.animation = 'shake 300ms ease';
    setTimeout(() => { btn.style.animation = ''; }, 300);
  }

  /* ─── Settings Handlers ─── */
  async function handleSaveSettings() {
    const patch = {
      labelA: $('set-label-a').value.trim() || 'Primary',
      emailA: $('set-email-a').value.trim(),
      labelB: $('set-label-b').value.trim() || 'Referral',
      emailB: $('set-email-b').value.trim(),
      defaultEmail: $('set-default-email').value,
      defaultStatus: $('set-default-status').value,
      weeklyGoal: parseInt($('set-weekly-goal').value) || 5
    };

    try {
      currentSettings = await saveSettings(patch);
      applySettingsToUI(currentSettings);
      btnSaveSettings.textContent = '✓ Saved!';
      setTimeout(() => {
        btnSaveSettings.textContent = 'Save Settings';
        settingsPanel.classList.add('hidden');
        mainView.style.display = '';
      }, 800);
    } catch (e) {
      console.error('Settings save failed:', e);
      btnSaveSettings.textContent = 'Error — Try again';
      setTimeout(() => { btnSaveSettings.textContent = 'Save Settings'; }, 2000);
    }
  }

  async function handleExportCSV() {
    try {
      const apps = await getAllApplications();
      const settings = await getSettings();
      const csv = exportAsCSV(apps, settings);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().split('T')[0];

      const a = document.createElement('a');
      a.href = url;
      a.download = `jobtrackr_export_${date}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      btnExportCSV.textContent = '✓ Exported!';
      setTimeout(() => { btnExportCSV.textContent = '📥 Export all as CSV'; }, 1500);
    } catch (e) {
      console.error('Export failed:', e);
    }
  }

  async function handleClearData() {
    if (!confirm('Are you sure you want to delete ALL application data? This cannot be undone.')) return;
    if (!confirm('Really? This will permanently delete ALL entries.')) return;

    try {
      await clearAllData();
      btnClearData.textContent = '✓ Cleared!';
      setTimeout(() => { btnClearData.textContent = '🗑️ Clear all data'; }, 1500);
    } catch (e) {
      console.error('Clear failed:', e);
    }
  }

  /* ─── Format Helpers ─── */
  // formatDate is defined in storage.js

  /* ─── Init ─── */
  init();
})();
