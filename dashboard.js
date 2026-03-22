/* ═══════════════════════════════════════
   dashboard.js — Dashboard Logic V2
   Stats, Top Skills, Filterable Table, Re-post Grouping, CSV Export
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
  const tableWrap = document.querySelector('.table-wrap');
  const skillsCard = $('skills-card');

  const filterSearch = $('filter-search');
  const filterPlatform = $('filter-platform');
  const filterEmail = $('filter-email');
  const filterStatus = $('filter-status');
  const filterSource = $('filter-source');
  const filterSort = $('filter-sort');

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

  /* ═══════════════════════════════
     Init
     ═══════════════════════════════ */

  async function init() {
    settings = await getSettings();
    await loadData();
    wireEvents();
  }

  async function loadData() {
    allApps = await getAllApplications();
    const stats = await getStats();
    renderStats(stats);
    renderSkillsCard();
    renderTable();
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
  }

  /* ─── Top Skills Card ─── */
  function renderSkillsCard() {
    const freq = {};
    allApps.forEach(a => {
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

  /* ─── Filter & Sort ─── */
  function getFilteredApps() {
    let filtered = [...allApps];
    const q = filterSearch.value.toLowerCase().trim();
    if (q) filtered = filtered.filter(a => (a.company || '').toLowerCase().includes(q) || (a.role || '').toLowerCase().includes(q) || (a.notes || '').toLowerCase().includes(q));
    const plat = filterPlatform.value; if (plat) filtered = filtered.filter(a => a.platform === plat);
    const email = filterEmail.value; if (email) filtered = filtered.filter(a => a.email === email);
    const status = filterStatus.value; if (status) filtered = filtered.filter(a => a.status === status);
    const source = filterSource.value; if (source) filtered = filtered.filter(a => a.source === source);

    switch (filterSort.value) {
      case 'date-desc': filtered.sort((a, b) => new Date(b.dateApplied) - new Date(a.dateApplied)); break;
      case 'date-asc': filtered.sort((a, b) => new Date(a.dateApplied) - new Date(b.dateApplied)); break;
      case 'company': filtered.sort((a, b) => (a.company || '').localeCompare(b.company || '')); break;
      case 'status': filtered.sort((a, b) => (a.status || '').localeCompare(b.status || '')); break;
    }
    return filtered;
  }

  /* ─── Re-post Grouping ─── */
  function buildRepostGroups(apps) {
    // Build map of id → app for linked lookups
    const idMap = {};
    allApps.forEach(a => { idMap[a.id] = a; });

    // Group apps by normalized company+role
    const groups = {};
    apps.forEach(app => {
      const key = _normCo(app.company) + '||' + _normRole(app.role);
      if (!groups[key]) groups[key] = [];
      groups[key].push(app);
    });

    // Build render order: for groups with >1 entry (re-posts), show most recent on top with linked entries below
    const result = [];
    const shown = new Set();
    apps.forEach(app => {
      if (shown.has(app.id)) return;
      const key = _normCo(app.company) + '||' + _normRole(app.role);
      const group = groups[key];

      if (group.length > 1 && !shown.has(group[0].id)) {
        // Sort group by date desc
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

  /* ─── Render Table ─── */
  function renderTable() {
    const filtered = getFilteredApps();
    tableBody.innerHTML = '';
    expandedRow = null;

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

      if (item.type === 'linked') {
        tr.classList.add('linked-row');
      }

      const daysOld = Math.floor((Date.now() - new Date(app.dateApplied).getTime()) / 86400000);
      const isStale = daysOld > 30 && app.status === 'Applied';
      const emailLabel = app.email === 'A' ? (settings.labelA || 'A') : (settings.labelB || 'B');

      tr.innerHTML = `
        <td class="date-cell">
          ${item.type === 'linked' ? '<span class="linked-prefix">└─</span>' : ''}
          <span class="date-relative">${relativeDate(app.dateApplied)}</span>
          <span class="date-exact">${formatDate(app.dateApplied)}</span>
          ${isStale ? '<span class="age-indicator age-stale" title="30+ days, no update"></span>' : ''}
        </td>
        <td>${esc(app.company || '—')}${item.isRepost ? '<span class="repost-badge">Re-post</span>' : ''}</td>
        <td>${esc(app.role || '—')}</td>
        <td>${esc(app.location || '—')}</td>
        <td><span class="badge badge-platform" data-platform="${escA(app.platform)}">${esc(app.platform)}</span></td>
        <td><span class="badge badge-source">${esc(app.source || 'Direct')}</span></td>
        <td><span class="badge badge-email">${esc(emailLabel)}</span></td>
        <td><span class="badge badge-status" data-status="${escA(app.status)}">${esc(app.status)}</span></td>
        <td class="jobid-cell">${esc(app.rawJobId || '—')}</td>
        <td>
          <span class="referral-icon ${app.referral ? 'referral-yes' : 'referral-no'}"
                title="${app.referral && app.referralPerson ? escA(app.referralPerson) : ''}">
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

      tr.addEventListener('click', (e) => {
        if (e.target.closest('.action-btn')) return;
        toggleExpandRow(app, tr);
      });

      tableBody.appendChild(tr);
    });
  }

  /* ─── Expand Row ─── */
  function toggleExpandRow(app, tr) {
    if (expandedRow) {
      expandedRow.remove();
      if (expandedRow._appId === app.id) { expandedRow = null; return; }
    }
    const expandTr = document.createElement('tr');
    expandTr.className = 'expand-row';
    expandTr._appId = app.id;

    // Keyword pills
    let keyPills = '';
    if (app.keywords?.mustHave?.length > 0) {
      keyPills = '<div class="expand-keywords">' +
        app.keywords.mustHave.map(s => `<span class="expand-skill">${esc(s)}</span>`).join('') +
        '</div>';
    }

    expandTr.innerHTML = `
      <td colspan="11">
        <div class="expand-content">
          <div class="notes"><strong>Notes:</strong> ${esc(app.notes || 'No notes')}</div>
          ${app.referralPerson ? `<div><strong>Referred by:</strong> ${esc(app.referralPerson)}</div>` : ''}
          ${app.jobUrl ? `<div class="job-link"><a href="${escA(app.jobUrl)}" target="_blank" rel="noopener">Open job listing →</a></div>` : ''}
          ${keyPills}
          <div><strong>Updated:</strong> ${formatDate(app.dateUpdated)}  •  <strong>Logged from:</strong> ${app.loggedFrom || 'popup'}</div>
        </div>
      </td>`;
    tr.after(expandTr);
    expandedRow = expandTr;
  }

  /* ─── Edit Modal ─── */
  function openEditModal(app) {
    editingApp = app;
    $('edit-company').value = app.company || '';
    $('edit-role').value = app.role || '';
    $('edit-location').value = app.location || '';
    $('edit-source').value = app.source || '';
    $('edit-status').value = app.status || 'Applied';
    $('edit-email').value = app.email || 'A';
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
      referralPerson: $('edit-referral').value.trim(),
      referral: !!$('edit-referral').value.trim(),
      notes: $('edit-notes').value.trim(),
      jobUrl: $('edit-url').value.trim()
    };
    try {
      await updateApplication(editingApp.id, patch);
      closeEditModal();
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
      await loadData();
    } catch (e) { console.error('Delete failed:', e); alert('Failed to delete.'); }
  }

  /* ─── CSV Export ─── */
  function handleExport() {
    const csv = exportAsCSV(allApps, settings);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jobtrackr_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    btnExport.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Exported!';
    setTimeout(() => {
      btnExport.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> Export CSV';
    }, 1500);
  }

  /* ─── Wire Events ─── */
  function wireEvents() {
    filterSearch.addEventListener('input', debounce(renderTable, 200));
    filterPlatform.addEventListener('change', renderTable);
    filterEmail.addEventListener('change', renderTable);
    filterStatus.addEventListener('change', renderTable);
    filterSource.addEventListener('change', renderTable);
    filterSort.addEventListener('change', renderTable);

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

    $('modal-close').addEventListener('click', closeEditModal);
    $('modal-cancel').addEventListener('click', closeEditModal);
    $('modal-save').addEventListener('click', handleSaveEdit);
    editModal.addEventListener('click', e => { if (e.target === editModal) closeEditModal(); });
    $('delete-cancel').addEventListener('click', closeDeleteModal);
    $('delete-confirm').addEventListener('click', handleDelete);
    deleteModal.addEventListener('click', e => { if (e.target === deleteModal) closeDeleteModal(); });
    btnExport.addEventListener('click', handleExport);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && (changes.jt_apps || changes.jt_settings)) loadData();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeEditModal(); closeDeleteModal(); }
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
