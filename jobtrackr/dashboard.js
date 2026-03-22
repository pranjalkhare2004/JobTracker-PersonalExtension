/* ═══════════════════════════════════════
   dashboard.js — Dashboard Logic V3
   Stats, Top Skills (filterable), Filterable Table, Re-post Grouping,
   Inline Status Edit, Bulk Actions, JD Viewer, Column Visibility, CSV Export
   ═══════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── State ─── */
  let allApps = [];
  let settings = {};
  let editingApp = null;
  let deletingApp = null;
  let expandedRow = null;
  let selectedIds = new Set();

  /* Column visibility (persisted in localStorage) */
  const ALL_COLUMNS = [
    { key: 'check', label: '☑', default: true },
    { key: 'date', label: 'Date', default: true },
    { key: 'company', label: 'Company', default: true },
    { key: 'role', label: 'Role', default: true },
    { key: 'location', label: 'Location', default: true },
    { key: 'platform', label: 'Platform', default: true },
    { key: 'source', label: 'Source', default: true },
    { key: 'email', label: 'Email', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'jobtype', label: 'Job Type', default: true },
    { key: 'workmode', label: 'Work Mode', default: true },
    { key: 'jobid', label: 'Job ID', default: true },
    { key: 'ref', label: 'Ref', default: true },
    { key: 'followup', label: 'Follow-up', default: true },
    { key: 'actions', label: 'Actions', default: true },
  ];
  let visibleCols = loadColVisibility();

  function loadColVisibility() {
    try {
      const raw = localStorage.getItem('jt_col_vis');
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    const obj = {};
    ALL_COLUMNS.forEach(c => { obj[c.key] = c.default; });
    return obj;
  }
  function saveColVisibility() {
    try { localStorage.setItem('jt_col_vis', JSON.stringify(visibleCols)); } catch { /* ignore */ }
  }

  /* ─── DOM Refs ─── */
  const $ = id => document.getElementById(id);
  const tableBody = $('table-body');
  const emptyState = $('empty-state');
  const appTable = $('app-table');
  const tableWrap = document.querySelector('.table-wrap');
  const skillsCard = $('skills-card');

  const filterSearch = $('filter-search');
  const filterPlatform = $('filter-platform');
  const filterPlatformCat = $('filter-platform-cat');
  const filterJobType = $('filter-job-type');
  const filterWorkMode = $('filter-work-mode');
  const filterEmail = $('filter-email');
  const filterStatus = $('filter-status');
  const filterSource = $('filter-source');
  const filterReferralOnly = $('filter-referral-only');
  const filterHasJD = $('filter-has-jd');
  const filterSort = $('filter-sort');
  const filterCount = $('filter-count');
  const btnClearFilters = $('btn-clear-filters');
  const skillsFilter = $('skills-filter');

  const statTotal = $('stat-total');
  const statWeek = $('stat-week');
  const statPipeline = $('stat-pipeline');
  const statReferrals = $('stat-referrals');
  const progressFill = $('progress-fill');
  const skillsBars = $('skills-bars');

  const btnExport = $('btn-export');
  const editModal = $('edit-modal');
  const deleteModal = $('delete-modal');
  const bulkBar = $('bulk-bar');
  const toast = $('toast');

  /* ═══════════════════════════════
     Init
     ═══════════════════════════════ */

  async function init() {
    settings = await getSettings();
    await loadData();
    wireEvents();
    renderColPanel();
    applyColVisibility();
  }

  async function loadData() {
    allApps = await getAllApplications();
    const stats = await getStats();
    renderStats(stats);
    renderSkillsCard();
    renderTable();
    updateFilterCount();
  }

  /* ─── Stats ─── */
  function renderStats(stats) {
    statTotal.textContent = stats.total;
    statWeek.textContent = stats.thisWeek;
    statPipeline.textContent = stats.activePipeline;
    statReferrals.textContent = stats.referralCount;
    const pct = stats.weeklyGoal > 0 ? Math.min((stats.thisWeek / stats.weeklyGoal) * 100, 100) : 0;
    progressFill.style.width = `${pct}%`;
    progressFill.style.background = pct >= 100 ? 'var(--color-success)' : 'var(--color-primary)';

    // v3 secondary stats
    $('stat-fulltime').textContent = stats.byJobType?.['Full-time'] || 0;
    $('stat-intern').textContent = stats.byJobType?.['Internship'] || 0;
    $('stat-remote').textContent = stats.byWorkMode?.['Remote'] || 0;
    $('stat-hybrid').textContent = stats.byWorkMode?.['Hybrid'] || 0;
    $('stat-onsite').textContent = stats.byWorkMode?.['On-site'] || 0;
    $('stat-top-source').textContent = stats.topSource ? `${stats.topSource.source} (${stats.topSource.count})` : '—';
  }

  /* ─── Top Skills Card (with filter) ─── */
  function renderSkillsCard() {
    const filterType = skillsFilter.value;
    const apps = filterType === 'all' ? allApps : allApps.filter(a => a.jobType === filterType);

    const freq = {};
    apps.forEach(a => {
      if (!a.keywords) return;
      const all = [...(a.keywords.mustHave || []), ...(a.keywords.niceToHave || [])];
      all.forEach(s => { freq[s] = (freq[s] || 0) + 1; });
    });

    const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (top.length === 0) { skillsCard.classList.add('hidden'); return; }
    skillsCard.classList.remove('hidden');

    const max = top[0][1];
    skillsBars.innerHTML = top.map(([skill, count]) => {
      const pct = Math.round((count / max) * 100);
      const wide = pct > 15;
      return `
        <div class="skill-bar-row">
          <span class="skill-bar-label">${esc(skill)}</span>
          <div class="skill-bar-track">
            <div class="skill-bar-fill" style="width:${pct}%">
              ${wide ? `<span class="skill-bar-count">${count}</span>` : ''}
            </div>
          </div>
          ${!wide ? `<span class="skill-bar-count-outside">${count}</span>` : ''}
        </div>`;
    }).join('');
  }

  /* ─── Filter & Sort (v3: expanded) ─── */
  function getFilteredApps() {
    let filtered = [...allApps];
    const q = filterSearch.value.toLowerCase().trim();
    if (q) filtered = filtered.filter(a => (a.company || '').toLowerCase().includes(q) || (a.role || '').toLowerCase().includes(q) || (a.notes || '').toLowerCase().includes(q));
    const plat = filterPlatform.value; if (plat) filtered = filtered.filter(a => a.platform === plat);
    const platCat = filterPlatformCat.value; if (platCat) filtered = filtered.filter(a => (a.platformCategory || 'Other') === platCat);
    const jt = filterJobType.value; if (jt) filtered = filtered.filter(a => (a.jobType || 'Unknown') === jt);
    const wm = filterWorkMode.value; if (wm) filtered = filtered.filter(a => (a.workMode || 'Unknown') === wm);
    const email = filterEmail.value; if (email) filtered = filtered.filter(a => a.email === email);
    const status = filterStatus.value; if (status) filtered = filtered.filter(a => a.status === status);
    const source = filterSource.value; if (source) filtered = filtered.filter(a => a.source === source);
    if (filterReferralOnly.checked) filtered = filtered.filter(a => a.referral);
    if (filterHasJD.checked) filtered = filtered.filter(a => a.jobDescription && a.jobDescription.length > 0);

    switch (filterSort.value) {
      case 'date-desc': filtered.sort((a, b) => new Date(b.dateApplied) - new Date(a.dateApplied)); break;
      case 'date-asc': filtered.sort((a, b) => new Date(a.dateApplied) - new Date(b.dateApplied)); break;
      case 'company': filtered.sort((a, b) => (a.company || '').localeCompare(b.company || '')); break;
      case 'status': filtered.sort((a, b) => (a.status || '').localeCompare(b.status || '')); break;
    }
    return filtered;
  }

  function updateFilterCount() {
    const filters = [filterPlatform, filterPlatformCat, filterJobType, filterWorkMode, filterEmail, filterStatus, filterSource];
    let count = filters.filter(f => f.value !== '').length;
    if (filterSearch.value.trim()) count++;
    if (filterReferralOnly.checked) count++;
    if (filterHasJD.checked) count++;
    if (count > 0) {
      filterCount.textContent = `${count} active`;
      filterCount.classList.remove('hidden');
      btnClearFilters.classList.remove('hidden');
    } else {
      filterCount.classList.add('hidden');
      btnClearFilters.classList.add('hidden');
    }
  }

  function clearAllFilters() {
    filterSearch.value = '';
    [filterPlatform, filterPlatformCat, filterJobType, filterWorkMode, filterEmail, filterStatus, filterSource, filterSort].forEach(f => f.selectedIndex = 0);
    filterReferralOnly.checked = false;
    filterHasJD.checked = false;
    updateFilterCount();
    renderTable();
  }

  /* ─── Re-post Grouping ─── */
  function buildRepostGroups(apps) {
    const idMap = {};
    allApps.forEach(a => { idMap[a.id] = a; });
    const groups = {};
    apps.forEach(app => {
      const key = _normCo(app.company) + '||' + _normRole(app.role);
      if (!groups[key]) groups[key] = [];
      groups[key].push(app);
    });
    const result = [];
    const shown = new Set();
    apps.forEach(app => {
      if (shown.has(app.id)) return;
      const key = _normCo(app.company) + '||' + _normRole(app.role);
      const group = groups[key];
      if (group.length > 1 && !shown.has(group[0].id)) {
        group.sort((a, b) => new Date(b.dateApplied) - new Date(a.dateApplied));
        result.push({ type: 'main', app: group[0], isRepost: true, groupSize: group.length });
        shown.add(group[0].id);
        for (let i = 1; i < group.length; i++) {
          result.push({ type: 'linked', app: group[i], parentApp: group[0] });
          shown.add(group[i].id);
        }
      } else if (!shown.has(app.id)) {
        result.push({ type: 'main', app, isRepost: false });
        shown.add(app.id);
      }
    });
    return result;
  }

  /* ─── Render Table (v3: checkbox, job type, work mode, inline status) ─── */
  function renderTable() {
    const filtered = getFilteredApps();
    tableBody.innerHTML = '';
    expandedRow = null;
    selectedIds.clear();
    updateBulkBar();

    if (filtered.length === 0) {
      tableWrap.classList.add('hidden');
      emptyState.classList.remove('hidden');
      skillsCard.classList.add('hidden');
      return;
    }
    tableWrap.classList.remove('hidden');
    emptyState.classList.add('hidden');

    const renderItems = buildRepostGroups(filtered);

    renderItems.forEach(item => {
      const app = item.app;
      const tr = document.createElement('tr');
      tr.setAttribute('data-id', app.id);
      if (item.type === 'linked') tr.classList.add('linked-row');

      const daysOld = Math.floor((Date.now() - new Date(app.dateApplied).getTime()) / 86400000);
      const isStale = daysOld > 30 && app.status === 'Applied';
      const emailLabel = app.email === 'A' ? (settings.labelA || 'A') : (settings.labelB || 'B');

      tr.innerHTML = `
        <td class="col-check"><input type="checkbox" class="row-check" data-id="${app.id}"></td>
        <td class="date-cell col-date">
          ${item.type === 'linked' ? '<span class="linked-prefix">└─</span>' : ''}
          <span class="date-relative">${relativeDate(app.dateApplied)}</span>
          <span class="date-exact">${formatDate(app.dateApplied)}</span>
          ${isStale ? '<span class="age-indicator age-stale" title="30+ days, no update"></span>' : ''}
        </td>
        <td class="col-company">${esc(app.company || '—')}${item.isRepost ? '<span class="repost-badge">Re-post</span>' : ''}</td>
        <td class="col-role">${esc(app.role || '—')}</td>
        <td class="col-location">${esc(app.location || '—')}</td>
        <td class="col-platform"><span class="badge badge-platform" data-platform="${escA(app.platform)}">${esc(app.platform)}</span></td>
        <td class="col-source"><span class="badge badge-source">${esc(app.source || 'Direct')}</span></td>
        <td class="col-email"><span class="badge badge-email">${esc(emailLabel)}</span></td>
        <td class="col-status">
          <select class="inline-status" data-id="${app.id}" data-current="${escA(app.status)}">
            ${['Applied','Referral Pending','Re-applied (Referral)','Interviewing','Rejected','Offer','Withdrawn'].map(s =>
              `<option${s === app.status ? ' selected' : ''}>${s}</option>`
            ).join('')}
          </select>
        </td>
        <td class="col-jobtype"><span class="badge badge-jobtype" data-jobtype="${escA(app.jobType || 'Unknown')}">${esc(app.jobType || 'Unknown')}</span></td>
        <td class="col-workmode"><span class="badge badge-workmode" data-workmode="${escA(app.workMode || 'Unknown')}">${esc(app.workMode || 'Unknown')}</span></td>
        <td class="jobid-cell col-jobid">${esc(app.rawJobId || '—')}</td>
        <td class="col-ref">
          <span class="referral-icon ${app.referral ? 'referral-yes' : 'referral-no'}"
                title="${app.referral && app.referralPerson ? escA(app.referralPerson) : ''}">
            ${app.referral ? '✓' : '—'}
          </span>
        </td>
        <td class="col-followup">
          ${renderFollowUpBadge(app)}
        </td>
        <td class="col-actions">
          <div class="action-btns">
            <button class="action-btn" data-action="edit" data-id="${app.id}">Edit</button>
            <button class="action-btn action-btn-danger" data-action="delete" data-id="${app.id}">Delete</button>
          </div>
        </td>
      `;

      tr.addEventListener('click', (e) => {
        if (e.target.closest('.action-btn') || e.target.closest('.inline-status') || e.target.closest('.row-check')) return;
        toggleExpandRow(app, tr);
      });

      tableBody.appendChild(tr);
    });

    applyColVisibility();
  }

  /* ─── Expand Row (v3: JD viewer) ─── */
  function toggleExpandRow(app, tr) {
    if (expandedRow) {
      expandedRow.remove();
      if (expandedRow._appId === app.id) { expandedRow = null; return; }
    }
    const expandTr = document.createElement('tr');
    expandTr.className = 'expand-row';
    expandTr._appId = app.id;

    let keyPills = '';
    if (app.keywords?.mustHave?.length > 0) {
      keyPills = '<div class="expand-keywords">' +
        app.keywords.mustHave.map(s => `<span class="expand-skill">${esc(s)}</span>`).join('') +
        '</div>';
    }

    let jdSection = '';
    if (app.jobDescription && app.jobDescription.length > 0) {
      jdSection = `
        <div class="expand-jd">
          <strong>Job Description:</strong>
          <textarea class="jd-readonly" readonly rows="6">${esc(app.jobDescription)}</textarea>
          <div class="jd-actions">
            <button class="btn btn-xs btn-ghost jd-copy" data-jd="${escA(app.jobDescription.substring(0,4000))}">📋 Copy JD</button>
          </div>
        </div>`;
    }

    const colCount = Object.values(visibleCols).filter(Boolean).length;
    expandTr.innerHTML = `
      <td colspan="${colCount}">
        <div class="expand-content">
          <div class="notes"><strong>Notes:</strong> ${esc(app.notes || 'No notes')}</div>
          ${app.referralPerson ? `<div><strong>Referred by:</strong> ${esc(app.referralPerson)}</div>` : ''}
          ${app.stipend ? `<div><strong>Stipend:</strong> ${esc(app.stipend)}</div>` : ''}
          ${app.duration ? `<div><strong>Duration:</strong> ${esc(app.duration)}</div>` : ''}
          ${app.jobUrl ? `<div class="job-link"><a href="${escA(app.jobUrl)}" target="_blank" rel="noopener">Open job listing →</a></div>` : ''}
          ${keyPills}
          ${jdSection}
          <div><strong>Updated:</strong> ${formatDate(app.dateUpdated)}  •  <strong>Logged from:</strong> ${app.loggedFrom || 'popup'}</div>
        </div>
      </td>`;
    tr.after(expandTr);
    expandedRow = expandTr;
  }

  /* ─── Inline Status Edit ─── */
  async function handleInlineStatus(appId, newStatus) {
    try {
      await updateApplication(appId, { status: newStatus });
      showToast(`Status → ${newStatus}`);
      await loadData();
    } catch (e) { console.error('Inline status update failed:', e); }
  }

  /* ─── Bulk Actions ─── */
  function updateBulkBar() {
    if (selectedIds.size > 0) {
      bulkBar.classList.remove('hidden');
      $('bulk-count').textContent = `${selectedIds.size} selected`;
    } else {
      bulkBar.classList.add('hidden');
    }
  }

  async function bulkChangeStatus(status) {
    if (!status) return;
    for (const id of selectedIds) {
      try { await updateApplication(id, { status }); } catch { /* skip */ }
    }
    showToast(`Updated ${selectedIds.size} → ${status}`);
    selectedIds.clear();
    $('bulk-status').selectedIndex = 0;
    await loadData();
  }

  function bulkExport() {
    const apps = allApps.filter(a => selectedIds.has(a.id));
    const csv = exportAsCSV(apps, settings);
    downloadCSV(csv);
    showToast(`Exported ${apps.length} entries`);
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${selectedIds.size} applications? This cannot be undone.`)) return;
    for (const id of selectedIds) {
      try { await deleteApplication(id); } catch { /* skip */ }
    }
    showToast(`Deleted ${selectedIds.size} entries`);
    selectedIds.clear();
    await loadData();
  }

  /* ─── Column Visibility ─── */
  function renderColPanel() {
    const box = $('col-checkboxes');
    box.innerHTML = ALL_COLUMNS.filter(c => c.key !== 'check').map(c => `
      <label class="col-check-label">
        <input type="checkbox" class="col-vis-check" data-col="${c.key}" ${visibleCols[c.key] ? 'checked' : ''}>
        ${c.label}
      </label>
    `).join('');
  }

  function applyColVisibility() {
    ALL_COLUMNS.forEach(c => {
      const cells = document.querySelectorAll(`.col-${c.key}, th.col-${c.key}`);
      cells.forEach(cell => { cell.style.display = visibleCols[c.key] ? '' : 'none'; });
    });
    // Apply to thead
    const ths = appTable.querySelectorAll('thead th');
    const colKeys = ALL_COLUMNS.map(c => c.key);
    ths.forEach((th, i) => {
      if (i < colKeys.length) {
        th.style.display = visibleCols[colKeys[i]] ? '' : 'none';
      }
    });
  }

  /* ─── Edit Modal (v3: job type, work mode) ─── */
  function openEditModal(app) {
    editingApp = app;
    $('edit-company').value = app.company || '';
    $('edit-role').value = app.role || '';
    $('edit-location').value = app.location || '';
    $('edit-source').value = app.source || '';
    $('edit-status').value = app.status || 'Applied';
    $('edit-email').value = app.email || 'A';
    $('edit-job-type').value = app.jobType || 'Unknown';
    $('edit-work-mode').value = app.workMode || 'Unknown';
    $('edit-referral').value = app.referralPerson || '';
    $('edit-notes').value = app.notes || '';
    $('edit-url').value = app.jobUrl || '';
    const fuDate = $('edit-followup-date');
    const fuNote = $('edit-followup-note');
    if (fuDate) fuDate.value = app.followUpDate || '';
    if (fuNote) fuNote.value = app.followUpNote || '';
    editModal.classList.remove('hidden');
  }

  function closeEditModal() { editModal.classList.add('hidden'); editingApp = null; }

  async function handleSaveEdit() {
    if (!editingApp) return;
    const patch = {
      company: $('edit-company').value.trim(),
      role: $('edit-role').value.trim(),
      location: $('edit-location').value.trim(),
      source: $('edit-source').value.trim(),
      status: $('edit-status').value,
      email: $('edit-email').value,
      jobType: $('edit-job-type').value,
      workMode: $('edit-work-mode').value,
      referralPerson: $('edit-referral').value.trim(),
      referral: !!$('edit-referral').value.trim(),
      notes: $('edit-notes').value.trim(),
      jobUrl: $('edit-url').value.trim(),
      followUpDate: $('edit-followup-date')?.value || '',
      followUpNote: $('edit-followup-note')?.value || '',
    };
    try {
      await updateApplication(editingApp.id, patch);
      closeEditModal();
      showToast('Saved');
      await loadData();
    } catch (e) { console.error('Update failed:', e); alert('Failed to update.'); }
  }

  /* ─── Delete Modal ─── */
  function openDeleteModal(app) {
    deletingApp = app;
    $('delete-info').textContent = `${app.company} — ${app.role}`;
    deleteModal.classList.remove('hidden');
  }
  function closeDeleteModal() { deleteModal.classList.add('hidden'); deletingApp = null; }

  async function handleDelete() {
    if (!deletingApp) return;
    try {
      await deleteApplication(deletingApp.id);
      closeDeleteModal();
      showToast('Deleted');
      await loadData();
    } catch (e) { console.error('Delete failed:', e); alert('Failed to delete.'); }
  }

  /* ─── CSV Export ─── */
  function handleExport() {
    const csv = exportAsCSV(allApps, settings);
    downloadCSV(csv);
    btnExport.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Exported!';
    setTimeout(() => {
      btnExport.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> Export CSV';
    }, 1500);
  }

  function downloadCSV(csv) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jobtrackr_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ─── Toast ─── */
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2000);
  }

  /* ─── Wire Events ─── */
  function wireEvents() {
    // Filters
    filterSearch.addEventListener('input', debounce(() => { renderTable(); updateFilterCount(); }, 200));
    [filterPlatform, filterPlatformCat, filterJobType, filterWorkMode, filterEmail, filterStatus, filterSource, filterSort].forEach(f =>
      f.addEventListener('change', () => { renderTable(); updateFilterCount(); })
    );
    filterReferralOnly.addEventListener('change', () => { renderTable(); updateFilterCount(); });
    filterHasJD.addEventListener('change', () => { renderTable(); updateFilterCount(); });
    btnClearFilters.addEventListener('click', clearAllFilters);

    // Skills filter
    skillsFilter.addEventListener('change', renderSkillsCard);

    // Table actions (delegated)
    tableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('.action-btn');
      if (btn) {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        const app = allApps.find(a => a.id === id);
        if (!app) return;
        if (action === 'edit') openEditModal(app);
        if (action === 'delete') openDeleteModal(app);
        return;
      }
      // JD copy
      const jdCopy = e.target.closest('.jd-copy');
      if (jdCopy) {
        const jd = jdCopy.getAttribute('data-jd');
        navigator.clipboard.writeText(jd).then(() => {
          jdCopy.textContent = '✓ Copied!';
          setTimeout(() => { jdCopy.textContent = '📋 Copy JD'; }, 1500);
        });
        return;
      }
    });

    // Inline status change
    tableBody.addEventListener('change', (e) => {
      if (e.target.classList.contains('inline-status')) {
        handleInlineStatus(e.target.dataset.id, e.target.value);
      }
    });

    // Row checkboxes
    tableBody.addEventListener('change', (e) => {
      if (e.target.classList.contains('row-check')) {
        const id = e.target.dataset.id;
        if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id);
        updateBulkBar();
      }
    });

    // Select all
    $('select-all').addEventListener('change', (e) => {
      const checks = tableBody.querySelectorAll('.row-check');
      checks.forEach(c => {
        c.checked = e.target.checked;
        if (e.target.checked) selectedIds.add(c.dataset.id); else selectedIds.delete(c.dataset.id);
      });
      updateBulkBar();
    });

    // Bulk actions
    $('bulk-status').addEventListener('change', (e) => { bulkChangeStatus(e.target.value); });
    $('bulk-export').addEventListener('click', bulkExport);
    $('bulk-delete').addEventListener('click', bulkDelete);

    // Column visibility
    $('btn-col-toggle').addEventListener('click', () => { $('col-panel').classList.toggle('hidden'); });
    $('col-panel').addEventListener('change', (e) => {
      if (e.target.classList.contains('col-vis-check')) {
        visibleCols[e.target.dataset.col] = e.target.checked;
        saveColVisibility();
        applyColVisibility();
      }
    });

    // Modals
    $('modal-close').addEventListener('click', closeEditModal);
    $('modal-cancel').addEventListener('click', closeEditModal);
    $('modal-save').addEventListener('click', handleSaveEdit);
    editModal.addEventListener('click', e => { if (e.target === editModal) closeEditModal(); });
    $('delete-cancel').addEventListener('click', closeDeleteModal);
    $('delete-confirm').addEventListener('click', handleDelete);
    deleteModal.addEventListener('click', e => { if (e.target === deleteModal) closeDeleteModal(); });
    btnExport.addEventListener('click', handleExport);

    // Storage change listener
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && (changes.jt_apps || changes.jt_settings)) loadData();
    });

    // Escape key
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeEditModal(); closeDeleteModal(); $('col-panel').classList.add('hidden'); }
    });
  }

  /* ─── Helpers ─── */
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function escA(s) { return String(s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  const _CO = ['inc','ltd','llc','pvt','limited','technologies','tech','software','solutions','systems','group','corp','co'];
  const _RL = ['senior','sr','junior','jr','lead','staff','principal','associate','assoc','eng','engineer','developer','dev','software','swe','sde'];
  function _normCo(n) { if (!n) return ''; let s = n.toLowerCase(); _CO.forEach(w => { s = s.replace(new RegExp(`\\b${w}\\b`,'g'),''); }); return s.replace(/[^\w\s]/g,'').replace(/\s+/g,' ').trim(); }
  function _normRole(t) { if (!t) return ''; let s = t.toLowerCase(); _RL.forEach(w => { s = s.replace(new RegExp(`\\b${w}\\b`,'g'),''); }); return s.replace(/[^\w\s]/g,'').replace(/\s+/g,' ').trim(); }

  function formatDate(iso) {
    try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return iso || '—'; }
  }

  function relativeDate(iso) {
    try {
      const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
      if (diff === 0) return 'Today';
      if (diff === 1) return 'Yesterday';
      if (diff < 7) return `${diff}d ago`;
      if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
      return `${Math.floor(diff / 30)}mo ago`;
    } catch { return '—'; }
  }

  /* ═══════════════════════════════
     Follow-up Badge
     ═══════════════════════════════ */

  function renderFollowUpBadge(app) {
    if (app.followUpDone) return '<span class="followup-badge followup-done">✓ Done</span>';
    if (!app.followUpDate) return '—';
    const today = new Date().toISOString().split('T')[0];
    if (app.followUpDate < today) return `<span class="followup-badge followup-overdue">⚠️ Overdue</span>`;
    if (app.followUpDate === today) return `<span class="followup-badge followup-today">📅 Today</span>`;
    const d = Math.ceil((new Date(app.followUpDate) - new Date(today)) / 86400000);
    return `<span class="followup-badge followup-soon">${d}d</span>`;
  }

  /* ═══════════════════════════════
     TAB SWITCHING
     ═══════════════════════════════ */

  document.querySelectorAll('.dash-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const el = document.getElementById('tab-' + target);
      if (el) el.classList.add('active');
      if (target === 'settings') initSettingsHub();
    });
  });

  // Hash-based opening
  if (window.location.hash === '#settings') {
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('[data-tab="settings"]').classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tab-settings').classList.add('active');
    setTimeout(() => initSettingsHub(), 100);
  }

  /* Settings Hub sidebar nav */
  document.querySelectorAll('.settings-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.settings-nav').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.settings-panel-content').forEach(p => p.classList.remove('active'));
      const panel = document.getElementById('panel-' + btn.dataset.panel);
      if (panel) panel.classList.add('active');
    });
  });

  let settingsHubInited = false;
  async function initSettingsHub() {
    if (settingsHubInited) return;
    settingsHubInited = true;
    settings = await getSettings();
    await loadProfilePanel();
    await loadGeneralPanel();
    await loadTemplatesPanel();
    await loadSnippetsPanel();
    await loadSkillDictPanel();
    await loadPlatformsPanel();
    wireSettingsEvents();
    await loadStoragePanel();
  }

  /* ═══════════════════════════════
     PROFILE PANEL
     ═══════════════════════════════ */

  let profileSkills = [];

  async function loadProfilePanel() {
    const p = settings.profile || {};
    document.getElementById('prof-name').value = p.name || '';
    document.getElementById('prof-college').value = p.college || '';
    document.getElementById('prof-degree').value = p.degree || '';
    document.getElementById('prof-cgpa').value = p.cgpa || '';
    document.getElementById('prof-resume').value = p.resumeUrl || '';
    document.getElementById('prof-linkedin').value = p.linkedinUrl || '';
    profileSkills = [...(settings.mySkills || [])];
    renderProfileSkillTags();
  }

  function renderProfileSkillTags() {
    const container = document.getElementById('my-skills-tags');
    container.innerHTML = profileSkills.map((s, i) =>
      `<span class="tag-item">${esc(s)} <button class="tag-remove" data-idx="${i}">&times;</button></span>`
    ).join('');
  }

  /* ═══════════════════════════════
     GENERAL PANEL
     ═══════════════════════════════ */

  async function loadGeneralPanel() {
    document.getElementById('gen-label-a').value = settings.labelA || '';
    document.getElementById('gen-email-a').value = settings.emailA || '';
    document.getElementById('gen-label-b').value = settings.labelB || '';
    document.getElementById('gen-email-b').value = settings.emailB || '';
    document.getElementById('gen-default-email').value = settings.defaultEmail || 'A';
    document.getElementById('gen-default-status').value = settings.defaultStatus || 'Applied';
    document.getElementById('gen-weekly-goal').value = settings.weeklyGoal || 5;
    document.getElementById('gen-followup-days').value = settings.followUpDefaultDays || 7;
    document.getElementById('gen-save-jd').checked = settings.saveJD || false;
  }

  /* ═══════════════════════════════
     TEMPLATES PANEL
     ═══════════════════════════════ */

  let currentTemplates = {};

  async function loadTemplatesPanel() {
    currentTemplates = await getTemplates();
    const sel = document.getElementById('tpl-select');
    document.getElementById('tpl-editor').value = currentTemplates[sel.value] || '';
    renderPlaceholderTable();
  }

  function renderPlaceholderTable() {
    const table = document.getElementById('placeholder-table');
    if (!table || typeof PLACEHOLDER_TABLE === 'undefined') return;
    table.innerHTML = '<thead><tr><th>Placeholder</th><th>Description</th></tr></thead><tbody>' +
      PLACEHOLDER_TABLE.map(p => `<tr><td><code>{{${p.key}}}</code></td><td>${esc(p.desc)}</td></tr>`).join('') +
      '</tbody>';
  }

  /* ═══════════════════════════════
     SNIPPETS PANEL
     ═══════════════════════════════ */

  let snippetsList = [];

  async function loadSnippetsPanel() {
    snippetsList = await getSnippets();
    renderSnippetsList();
  }

  function renderSnippetsList() {
    const container = document.getElementById('snippet-list');
    container.innerHTML = snippetsList.map((s, i) =>
      `<div class="snippet-item" draggable="true" data-idx="${i}">
        <span class="snippet-drag">⠿</span>
        <span class="snippet-text">${esc(s)}</span>
        <button class="btn btn-xs btn-ghost snippet-remove" data-idx="${i}">&times;</button>
      </div>`
    ).join('');
  }

  /* ═══════════════════════════════
     SKILL DICTIONARY PANEL
     ═══════════════════════════════ */

  let skillDict = [];

  async function loadSkillDictPanel() {
    skillDict = await getSkillDict();
    renderSkillDictEditor();
  }

  function renderSkillDictEditor() {
    const container = document.getElementById('skill-dict-editor');
    container.innerHTML = skillDict.map((cat, ci) => {
      const pills = cat.skills.map((s, si) =>
        `<span class="tag-item">${esc(s)} <button class="tag-remove skill-remove" data-ci="${ci}" data-si="${si}">&times;</button></span>`
      ).join('');
      return `<div class="skill-category-card">
        <h4>${esc(cat.category)} <span class="skill-count">(${cat.skills.length})</span></h4>
        <div class="tag-list">${pills}</div>
        <div style="display:flex;gap:4px;margin-top:4px">
          <input type="text" class="skill-add-input" data-ci="${ci}" placeholder="Add skill..." style="flex:1;padding:4px 6px;font-size:11px">
          <button class="btn btn-xs btn-outline skill-add-btn" data-ci="${ci}">+</button>
        </div>
      </div>`;
    }).join('');
  }

  /* ═══════════════════════════════
     PLATFORMS PANEL
     ═══════════════════════════════ */

  let platformsList = [];

  async function loadPlatformsPanel() {
    platformsList = await getPlatforms();
    renderPlatformTable();
  }

  function renderPlatformTable() {
    const tbody = document.getElementById('platform-table-body');
    tbody.innerHTML = platformsList.map(p => `
      <tr>
        <td><input type="checkbox" class="plat-toggle" data-id="${p.id}" ${p.enabled ? 'checked' : ''}></td>
        <td>${esc(p.name)} ${p.builtIn ? '<span class="badge badge-source">Built-in</span>' : ''}</td>
        <td>${esc(p.category)}</td>
        <td>${esc(p.siteType)}</td>
        <td><code>${esc(p.matches.join(', '))}</code></td>
        <td>${p.builtIn ? '' : '<button class="btn btn-xs btn-danger plat-delete" data-id="' + p.id + '">Delete</button>'}</td>
      </tr>
    `).join('');
  }

  /* ═══════════════════════════════
     STORAGE PANEL
     ═══════════════════════════════ */

  async function loadStoragePanel() {
    try {
      const usage = await getStorageUsage();
      const pct = Math.round((usage.total / usage.limit) * 100);
      document.getElementById('storage-bar-fill').style.width = pct + '%';
      document.getElementById('storage-bar-fill').style.background = pct > 80 ? '#DC2626' : pct > 60 ? '#D97706' : '#4F46E5';
      document.getElementById('storage-total').textContent = `${usage.total.toLocaleString()} / ${usage.limit.toLocaleString()} bytes (${pct}%)`;

      const keyNames = { jt_apps: 'Applications', jt_settings: 'Settings', jt_templates: 'Templates', jt_snippets: 'Snippets', jt_platforms: 'Platforms', jt_skill_dict: 'Skill Dictionary' };
      const tbody = document.querySelector('#storage-breakdown tbody');
      tbody.innerHTML = Object.entries(usage.breakdown).map(([k, v]) =>
        `<tr><td>${keyNames[k] || k}</td><td>${v.toLocaleString()}</td><td>${usage.total > 0 ? Math.round((v / usage.total) * 100) : 0}%</td></tr>`
      ).join('');
    } catch { /* ignore */ }
  }

  /* ═══════════════════════════════
     SETTINGS HUB EVENT WIRING
     ═══════════════════════════════ */

  function wireSettingsEvents() {
    // Profile: save
    document.getElementById('btn-save-profile')?.addEventListener('click', async () => {
      settings = await saveSettings({
        profile: {
          name: document.getElementById('prof-name').value.trim(),
          college: document.getElementById('prof-college').value.trim(),
          degree: document.getElementById('prof-degree').value.trim(),
          cgpa: document.getElementById('prof-cgpa').value.trim(),
          resumeUrl: document.getElementById('prof-resume').value.trim(),
          linkedinUrl: document.getElementById('prof-linkedin').value.trim(),
        },
        mySkills: [...profileSkills],
      });
      showToast('Profile saved');
    });

    // Profile: skill tag input
    document.getElementById('my-skills-input')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const val = e.target.value.trim().toLowerCase();
      if (val && !profileSkills.includes(val)) {
        profileSkills.push(val);
        renderProfileSkillTags();
      }
      e.target.value = '';
    });

    // Profile: remove skill tag
    document.getElementById('my-skills-tags')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tag-remove');
      if (!btn) return;
      profileSkills.splice(parseInt(btn.dataset.idx), 1);
      renderProfileSkillTags();
    });

    // General: save
    document.getElementById('btn-save-general')?.addEventListener('click', async () => {
      settings = await saveSettings({
        labelA: document.getElementById('gen-label-a').value.trim(),
        emailA: document.getElementById('gen-email-a').value.trim(),
        labelB: document.getElementById('gen-label-b').value.trim(),
        emailB: document.getElementById('gen-email-b').value.trim(),
        defaultEmail: document.getElementById('gen-default-email').value,
        defaultStatus: document.getElementById('gen-default-status').value,
        weeklyGoal: parseInt(document.getElementById('gen-weekly-goal').value) || 5,
        followUpDefaultDays: parseInt(document.getElementById('gen-followup-days').value) || 7,
        saveJD: document.getElementById('gen-save-jd').checked,
      });
      showToast('General settings saved');
    });

    // Templates: load on select change
    document.getElementById('tpl-select')?.addEventListener('change', (e) => {
      document.getElementById('tpl-editor').value = currentTemplates[e.target.value] || '';
    });

    // Templates: save
    document.getElementById('btn-save-template')?.addEventListener('click', async () => {
      const key = document.getElementById('tpl-select').value;
      const val = document.getElementById('tpl-editor').value;
      currentTemplates = await saveTemplates({ [key]: val });
      showToast('Template saved');
    });

    // Templates: reset
    document.getElementById('btn-reset-template')?.addEventListener('click', async () => {
      const key = document.getElementById('tpl-select').value;
      if (!confirm(`Reset "${key}" to factory default?`)) return;
      currentTemplates = await resetTemplate(key);
      document.getElementById('tpl-editor').value = currentTemplates[key] || '';
      showToast('Template reset to default');
    });

    // Snippets: add
    document.getElementById('btn-add-snippet')?.addEventListener('click', async () => {
      const val = document.getElementById('snippet-new-input').value.trim();
      if (!val) return;
      snippetsList.push(val);
      await saveSnippets(snippetsList);
      document.getElementById('snippet-new-input').value = '';
      renderSnippetsList();
    });

    // Snippets: remove
    document.getElementById('snippet-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.snippet-remove');
      if (!btn) return;
      snippetsList.splice(parseInt(btn.dataset.idx), 1);
      saveSnippets(snippetsList);
      renderSnippetsList();
    });

    // Snippets: reset
    document.getElementById('btn-reset-snippets')?.addEventListener('click', async () => {
      if (!confirm('Reset snippets to defaults?')) return;
      snippetsList = [...DEFAULT_SNIPPETS];
      await saveSnippets(snippetsList);
      renderSnippetsList();
      showToast('Snippets reset');
    });

    // Skill dict: remove skill
    document.getElementById('skill-dict-editor')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.skill-remove');
      if (!btn) return;
      const ci = parseInt(btn.dataset.ci), si = parseInt(btn.dataset.si);
      skillDict[ci].skills.splice(si, 1);
      saveSkillDict(skillDict);
      renderSkillDictEditor();
    });

    // Skill dict: add skill
    document.getElementById('skill-dict-editor')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.skill-add-btn');
      if (!btn) return;
      const ci = parseInt(btn.dataset.ci);
      const input = document.querySelector(`.skill-add-input[data-ci="${ci}"]`);
      const val = input?.value.trim().toLowerCase();
      if (val && !skillDict[ci].skills.includes(val)) {
        skillDict[ci].skills.push(val);
        saveSkillDict(skillDict);
        renderSkillDictEditor();
      }
      if (input) input.value = '';
    });

    // Skill dict: add skill on Enter
    document.getElementById('skill-dict-editor')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const input = e.target.closest('.skill-add-input');
      if (!input) return;
      e.preventDefault();
      const ci = parseInt(input.dataset.ci);
      const val = input.value.trim().toLowerCase();
      if (val && !skillDict[ci].skills.includes(val)) {
        skillDict[ci].skills.push(val);
        saveSkillDict(skillDict);
        renderSkillDictEditor();
      }
      input.value = '';
    });

    // Skill dict: add category
    document.getElementById('btn-add-category')?.addEventListener('click', async () => {
      const val = document.getElementById('new-category-input').value.trim();
      if (!val) return;
      skillDict.push({ category: val, skills: [] });
      await saveSkillDict(skillDict);
      document.getElementById('new-category-input').value = '';
      renderSkillDictEditor();
    });

    // Skill dict: reset
    document.getElementById('btn-reset-skills')?.addEventListener('click', async () => {
      if (!confirm('Reset skill dictionary to defaults?')) return;
      skillDict = DEFAULT_SKILL_DICT.map(c => ({ ...c, skills: [...c.skills] }));
      await saveSkillDict(skillDict);
      renderSkillDictEditor();
      showToast('Skill dictionary reset');
    });

    // Platforms: toggle enable
    document.getElementById('platform-table-body')?.addEventListener('change', async (e) => {
      if (!e.target.classList.contains('plat-toggle')) return;
      const id = e.target.dataset.id;
      await updatePlatform(id, { enabled: e.target.checked });
      showToast(e.target.checked ? 'Platform enabled' : 'Platform disabled');
    });

    // Platforms: delete
    document.getElementById('platform-table-body')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.plat-delete');
      if (!btn) return;
      if (!confirm('Delete this custom platform?')) return;
      await deletePlatform(btn.dataset.id);
      platformsList = await getPlatforms();
      renderPlatformTable();
      showToast('Platform deleted');
    });

    // Platforms: add
    document.getElementById('btn-add-platform')?.addEventListener('click', async () => {
      const name = document.getElementById('new-plat-name').value.trim();
      const match = document.getElementById('new-plat-match').value.trim();
      if (!name || !match) { showToast('Name and domain required'); return; }
      await addPlatform({ name, matches: [match], category: document.getElementById('new-plat-cat').value });
      platformsList = await getPlatforms();
      renderPlatformTable();
      document.getElementById('new-plat-name').value = '';
      document.getElementById('new-plat-match').value = '';
      showToast('Platform added');
    });

    // Platforms: reset
    document.getElementById('btn-reset-platforms')?.addEventListener('click', async () => {
      if (!confirm('Reset platforms to defaults? Custom platforms will be removed.')) return;
      await savePlatforms([...DEFAULT_PLATFORMS]);
      platformsList = await getPlatforms();
      renderPlatformTable();
      showToast('Platforms reset');
    });

    // Import/Export
    document.getElementById('btn-ie-csv')?.addEventListener('click', async () => {
      const apps = await getAllApplications();
      const csv = exportAsCSV(apps, settings);
      downloadFile(csv, `jobtrackr_export_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
    });

    document.getElementById('btn-ie-tsv')?.addEventListener('click', async () => {
      const apps = await getAllApplications();
      const tsv = exportAsTSV(apps, settings);
      try {
        await navigator.clipboard.writeText(tsv);
        showToast('TSV copied to clipboard — paste into Google Sheets');
      } catch { showToast('Failed to copy', 'error'); }
    });

    document.getElementById('btn-ie-backup')?.addEventListener('click', async () => {
      const backup = await exportFullBackup();
      const json = JSON.stringify(backup, null, 2);
      downloadFile(json, `jobtrackr_backup_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
    });

    document.getElementById('import-csv-file')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const result = await importFromCSV(text);
        showToast(`Imported ${result.imported} applications (${result.skipped} skipped as duplicates)`);
        await loadData();
      } catch (err) { showToast('Import failed: ' + err.message); }
    });

    document.getElementById('import-backup-file')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const json = JSON.parse(text);
        const result = await restoreFromBackup(json);
        showToast(`Restored ${result.keys.length} data keys`);
        await loadData();
        settingsHubInited = false;
        await initSettingsHub();
      } catch (err) { showToast('Restore failed: ' + err.message); }
    });

    // Danger zone
    document.getElementById('btn-clear-apps')?.addEventListener('click', async () => {
      if (!confirm('Delete ALL applications? This cannot be undone.')) return;
      await clearAllApplications();
      showToast('All applications deleted');
      await loadData();
    });

    document.getElementById('btn-reset-all')?.addEventListener('click', async () => {
      if (!confirm('Reset ALL settings to defaults? This cannot be undone.')) return;
      await resetAllSettings();
      showToast('All settings reset to defaults');
      settingsHubInited = false;
      settings = await getSettings();
      await initSettingsHub();
    });

    // Follow-up mark done from table
    tableBody?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.followup-mark-done');
      if (!btn) return;
      const id = btn.dataset.id;
      await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'UPDATE_APPLICATION', id, patch: { followUpDone: true } }, resolve);
      });
      await loadData();
    });
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type: type + ';charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ─── Init ─── */
  init();
})();
