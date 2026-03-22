/* ═══════════════════════════════════════
   dashboard.js — Dashboard Logic
   ═══════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── State ─── */
  let allApps = [];
  let settings = {};
  let editingApp = null;
  let deletingApp = null;
  let expandedRow = null;

  /* ─── DOM Refs ─── */
  const $ = id => document.getElementById(id);
  const tableBody = $('table-body');
  const emptyState = $('empty-state');
  const appTable = $('app-table');

  // Filters
  const filterSearch = $('filter-search');
  const filterPlatform = $('filter-platform');
  const filterEmail = $('filter-email');
  const filterStatus = $('filter-status');
  const filterSort = $('filter-sort');

  // Stats
  const statTotal = $('stat-total');
  const statWeek = $('stat-week');
  const statGoalNum = $('stat-goal-num');
  const statPipeline = $('stat-pipeline');
  const statReferrals = $('stat-referrals');
  const progressFill = $('progress-fill');

  // Export
  const btnExport = $('btn-export');

  // Edit Modal
  const editModal = $('edit-modal');
  const modalClose = $('modal-close');
  const modalCancel = $('modal-cancel');
  const modalSave = $('modal-save');

  // Delete Modal
  const deleteModal = $('delete-modal');
  const deleteCancel = $('delete-cancel');
  const deleteConfirm = $('delete-confirm');
  const deleteInfo = $('delete-info');

  /* ═══════════════════════════════════════
     Init
     ═══════════════════════════════════════ */

  async function init() {
    settings = await getSettings();
    await loadData();
    wireEvents();
  }

  async function loadData() {
    allApps = await getAllApplications();
    const stats = await getStats();
    renderStats(stats);
    renderTable();
  }

  /* ─── Render Stats ─── */
  function renderStats(stats) {
    statTotal.textContent = stats.total;
    statWeek.textContent = stats.thisWeek;
    statGoalNum.textContent = stats.weeklyGoal;
    statPipeline.textContent = stats.activePipeline;
    statReferrals.textContent = stats.referralCount;

    const pct = stats.weeklyGoal > 0 ? Math.min((stats.thisWeek / stats.weeklyGoal) * 100, 100) : 0;
    progressFill.style.width = `${pct}%`;
    if (pct >= 100) {
      progressFill.style.background = 'var(--color-success)';
    } else {
      progressFill.style.background = 'var(--color-primary)';
    }
  }

  /* ─── Filter & Sort ─── */
  function getFilteredApps() {
    let filtered = [...allApps];

    // Search
    const q = filterSearch.value.toLowerCase().trim();
    if (q) {
      filtered = filtered.filter(a =>
        (a.company || '').toLowerCase().includes(q) ||
        (a.role || '').toLowerCase().includes(q) ||
        (a.notes || '').toLowerCase().includes(q)
      );
    }

    // Platform
    const plat = filterPlatform.value;
    if (plat) filtered = filtered.filter(a => a.platform === plat);

    // Email
    const email = filterEmail.value;
    if (email) filtered = filtered.filter(a => a.email === email);

    // Status
    const status = filterStatus.value;
    if (status) filtered = filtered.filter(a => a.status === status);

    // Sort
    const sort = filterSort.value;
    switch (sort) {
      case 'date-desc':
        filtered.sort((a, b) => new Date(b.dateApplied) - new Date(a.dateApplied));
        break;
      case 'date-asc':
        filtered.sort((a, b) => new Date(a.dateApplied) - new Date(b.dateApplied));
        break;
      case 'company':
        filtered.sort((a, b) => (a.company || '').localeCompare(b.company || ''));
        break;
      case 'status':
        filtered.sort((a, b) => (a.status || '').localeCompare(b.status || ''));
        break;
    }

    return filtered;
  }

  /* ─── Render Table ─── */
  function renderTable() {
    const filtered = getFilteredApps();
    tableBody.innerHTML = '';
    expandedRow = null;

    if (filtered.length === 0) {
      appTable.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    appTable.classList.remove('hidden');
    emptyState.classList.add('hidden');

    filtered.forEach(app => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-id', app.id);

      // Check age for link health indicator
      const daysOld = Math.floor((Date.now() - new Date(app.dateApplied).getTime()) / 86400000);
      const isStale = daysOld > 30 && app.status === 'Applied';

      const emailLabel = app.email === 'A' ? (settings.labelA || 'A') : (settings.labelB || 'B');

      tr.innerHTML = `
        <td class="date-cell">
          <span class="date-relative">${relativeDate(app.dateApplied)}</span>
          <span class="date-exact">${formatDate(app.dateApplied)}</span>
          ${isStale ? '<span class="age-indicator age-stale" title="Applied over 30 days ago — consider following up"></span>' : ''}
        </td>
        <td class="company-cell">${escapeHtml(app.company || '—')}</td>
        <td class="role-cell">${escapeHtml(app.role || '—')}</td>
        <td><span class="badge badge-platform" data-platform="${escapeAttr(app.platform)}">${escapeHtml(app.platform)}</span></td>
        <td><span class="badge badge-email" data-email="${escapeAttr(app.email)}">${escapeHtml(emailLabel)}</span></td>
        <td><span class="badge badge-status" data-status="${escapeAttr(app.status)}">${escapeHtml(app.status)}</span></td>
        <td>
          <span class="referral-icon ${app.referral ? 'referral-yes' : 'referral-no'}" 
                title="${app.referral && app.referralPerson ? escapeAttr(app.referralPerson) : (app.referral ? 'Referral' : 'No referral')}">
            ${app.referral ? '✓' : '—'}
          </span>
        </td>
        <td>
          <div class="action-btns">
            <button class="action-btn" data-action="edit" data-id="${app.id}">Edit</button>
            <button class="action-btn action-btn-danger" data-action="delete" data-id="${app.id}">Delete</button>
          </div>
        </td>
      `;

      // Row click to expand
      tr.addEventListener('click', (e) => {
        if (e.target.closest('.action-btn')) return;
        toggleExpandRow(app, tr);
      });

      tableBody.appendChild(tr);
    });
  }

  /* ─── Expand Row ─── */
  function toggleExpandRow(app, tr) {
    // Remove existing expansion
    if (expandedRow) {
      expandedRow.remove();
      if (expandedRow._appId === app.id) {
        expandedRow = null;
        return;
      }
    }

    const expandTr = document.createElement('tr');
    expandTr.className = 'expand-row';
    expandTr._appId = app.id;
    expandTr.innerHTML = `
      <td colspan="8">
        <div class="expand-content">
          <div class="notes">
            <strong>Notes:</strong> ${escapeHtml(app.notes || 'No notes')}
          </div>
          ${app.referralPerson ? `<div><strong>Referred by:</strong> ${escapeHtml(app.referralPerson)}</div>` : ''}
          ${app.jobUrl ? `<div class="job-link"><a href="${escapeAttr(app.jobUrl)}" target="_blank" rel="noopener">Open job listing →</a></div>` : ''}
          <div><strong>Updated:</strong> ${formatDate(app.dateUpdated)}</div>
        </div>
      </td>
    `;

    tr.after(expandTr);
    expandedRow = expandTr;
  }

  /* ─── Edit Modal ─── */
  function openEditModal(app) {
    editingApp = app;
    $('edit-company').value = app.company || '';
    $('edit-role').value = app.role || '';
    $('edit-status').value = app.status || 'Applied';
    $('edit-email').value = app.email || 'A';
    $('edit-referral').value = app.referralPerson || '';
    $('edit-notes').value = app.notes || '';
    $('edit-url').value = app.jobUrl || '';
    editModal.classList.remove('hidden');
  }

  function closeEditModal() {
    editModal.classList.add('hidden');
    editingApp = null;
  }

  async function handleSaveEdit() {
    if (!editingApp) return;

    const patch = {
      company: $('edit-company').value.trim(),
      role: $('edit-role').value.trim(),
      status: $('edit-status').value,
      email: $('edit-email').value,
      referralPerson: $('edit-referral').value.trim(),
      referral: !!$('edit-referral').value.trim(),
      notes: $('edit-notes').value.trim(),
      jobUrl: $('edit-url').value.trim()
    };

    try {
      await updateApplication(editingApp.id, patch);
      closeEditModal();
      await loadData();
    } catch (e) {
      console.error('Update failed:', e);
      alert('Failed to update application. Please try again.');
    }
  }

  /* ─── Delete Modal ─── */
  function openDeleteModal(app) {
    deletingApp = app;
    deleteInfo.textContent = `${app.company} — ${app.role}`;
    deleteModal.classList.remove('hidden');
  }

  function closeDeleteModal() {
    deleteModal.classList.add('hidden');
    deletingApp = null;
  }

  async function handleDelete() {
    if (!deletingApp) return;

    try {
      await deleteApplication(deletingApp.id);
      closeDeleteModal();
      await loadData();
    } catch (e) {
      console.error('Delete failed:', e);
      alert('Failed to delete application. Please try again.');
    }
  }

  /* ─── CSV Export ─── */
  function handleExport() {
    const csv = exportAsCSV(allApps, settings);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().split('T')[0];

    const a = document.createElement('a');
    a.href = url;
    a.download = `jobtrackr_export_${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    btnExport.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      Exported!
    `;
    setTimeout(() => {
      btnExport.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        Export CSV
      `;
    }, 1500);
  }

  /* ─── Wire Events ─── */
  function wireEvents() {
    // Filters
    filterSearch.addEventListener('input', debounce(renderTable, 200));
    filterPlatform.addEventListener('change', renderTable);
    filterEmail.addEventListener('change', renderTable);
    filterStatus.addEventListener('change', renderTable);
    filterSort.addEventListener('change', renderTable);

    // Table actions (delegated)
    tableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('.action-btn');
      if (!btn) return;

      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      const app = allApps.find(a => a.id === id);
      if (!app) return;

      if (action === 'edit') openEditModal(app);
      if (action === 'delete') openDeleteModal(app);
    });

    // Edit modal
    modalClose.addEventListener('click', closeEditModal);
    modalCancel.addEventListener('click', closeEditModal);
    modalSave.addEventListener('click', handleSaveEdit);
    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) closeEditModal();
    });

    // Delete modal
    deleteCancel.addEventListener('click', closeDeleteModal);
    deleteConfirm.addEventListener('click', handleDelete);
    deleteModal.addEventListener('click', (e) => {
      if (e.target === deleteModal) closeDeleteModal();
    });

    // Export
    btnExport.addEventListener('click', handleExport);

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && (changes.jt_apps || changes.jt_settings)) {
        loadData();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeEditModal();
        closeDeleteModal();
      }
    });
  }

  /* ─── Helpers ─── */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  /* ─── Init ─── */
  init();
})();
