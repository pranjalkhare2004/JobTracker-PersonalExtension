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
  const statGoalNum = $('stat-goal-num');
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
    statGoalNum.textContent = stats.weeklyGoal;
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
      jobUrl: $('edit-url').value.trim()
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

  /* ─── Init ─── */
  init();
})();
