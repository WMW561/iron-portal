/**
 * Iron Platform — Trainer Portal
 * screens/assign.js — Program Assignment (Screen 5)
 *
 * Renders a single-page 4-step flow (all visible, all editable):
 *   Step 1: Select Client (search + radio list)
 *   Step 2: Select Program Template (radio list)
 *   Step 3: Schedule (start_date, end_date / open-ended)
 *   Step 4: Notes (textarea)
 *   Sticky summary + Confirm & Assign button
 *
 * Called by router as renderAssign().
 * Called from Dashboard quick-action which may pass ?client=<id> in hash:
 *   window.location.hash = '#assign?client=<uuid>'
 */

import { supabase } from '../portal.js';

// ── Module state ───────────────────────────────────────
let allClients   = [];
let allTemplates = [];
let selectedClient   = null;   // client object
let selectedTemplate = null;   // template object
let preselectedClientId = null; // set from URL param

// ── Entry point ────────────────────────────────────────

export async function renderAssign() {
  // Check for preselected client param: #assign?client=<uuid>
  const hash = window.location.hash;
  const qMark = hash.indexOf('?');
  preselectedClientId = null;
  if (qMark !== -1) {
    try {
      const params = new URLSearchParams(hash.slice(qMark + 1));
      preselectedClientId = params.get('client') ?? null;
    } catch (_) { /* ignore */ }
  }

  selectedClient   = null;
  selectedTemplate = null;

  const section = document.getElementById('view-assign');
  section.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Assign Program</h1>
        <div class="page-subtitle">Assign a program template to a client</div>
      </div>
    </div>
    <div id="assign-body">
      <div class="loading-state">
        <div class="spinner"></div>
        <span>Loading…</span>
      </div>
    </div>
  `;

  // Fetch clients + templates in parallel
  const [clientsResult, templatesResult] = await Promise.all([
    loadClients(),
    loadTemplates(),
  ]);

  if (clientsResult.error || templatesResult.error) {
    document.getElementById('assign-body').innerHTML = `
      <div class="alert-banner alert-banner-error" role="alert">
        ${escHtml((clientsResult.error || templatesResult.error).message)}
      </div>
    `;
    return;
  }

  allClients   = clientsResult.data ?? [];
  allTemplates = templatesResult.data ?? [];

  // Preselect client from URL param
  if (preselectedClientId) {
    selectedClient = allClients.find(c => c.id === preselectedClientId) ?? null;
  }

  if (allClients.length === 0 && allTemplates.length === 0) {
    renderEmptyState('both');
    return;
  }
  if (allClients.length === 0) {
    renderEmptyState('clients');
    return;
  }
  if (allTemplates.length === 0) {
    renderEmptyState('templates');
    return;
  }

  renderAssignForm();
}

// ── Data loaders ───────────────────────────────────────

async function loadClients() {
  const { data: user } = await supabase.auth.getUser();
  const trainerId = user?.user?.id;
  return supabase
    .from('clients')
    .select(`
      id, full_name, on_glp1, status,
      program_assignments ( id, status, program_templates ( name ) )
    `)
    .eq('trainer_id', trainerId)
    .eq('status', 'active')
    .order('full_name', { ascending: true });
}

async function loadTemplates() {
  const { data: user } = await supabase.auth.getUser();
  const trainerId = user?.user?.id;
  return supabase
    .from('program_templates')
    .select('id, name, duration_weeks, days_per_week, focus, is_glp1_template')
    .eq('trainer_id', trainerId)
    .eq('is_archived', false)
    .order('name', { ascending: true });
}

// ── Empty states ───────────────────────────────────────

function renderEmptyState(missing) {
  const section = document.getElementById('assign-body');
  const msgs = {
    both:      'You need at least one active client and one program template before assigning.',
    clients:   'You have no active clients yet.',
    templates: 'You have no program templates yet.',
  };
  const ctas = {
    both:      `<a href="#clients" class="btn btn-primary" style="margin-right:8px;">+ Add Client</a>
                <a href="#programs" class="btn btn-secondary">+ New Program</a>`,
    clients:   `<a href="#clients" class="btn btn-primary">+ Add Client</a>`,
    templates: `<a href="#programs" class="btn btn-primary">+ New Program</a>`,
  };
  section.innerHTML = `
    <div class="empty-state" style="padding:48px 24px;">
      <div class="empty-icon">📋</div>
      <h3>Can't assign yet</h3>
      <p>${msgs[missing] ?? ''}</p>
      <div>${ctas[missing] ?? ''}</div>
    </div>
  `;
}

// ── Main form render ───────────────────────────────────

function renderAssignForm() {
  const section = document.getElementById('assign-body');
  const today   = todayIso();

  section.innerHTML = `
    <!-- Step 1: Select Client -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-body">
        <h2 class="step-heading">Step 1 — Select Client</h2>
        <div class="search-wrap" style="margin-bottom:10px;">
          <span class="search-icon" aria-hidden="true">🔍</span>
          <input type="search" id="assign-client-search" class="search-input"
                 placeholder="Search clients…" autocomplete="off" aria-label="Search clients">
        </div>
        <div id="assign-client-list" class="radio-list" role="radiogroup" aria-label="Select client">
          ${renderClientList(allClients)}
        </div>
      </div>
    </div>

    <!-- Step 2: Select Template -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-body">
        <h2 class="step-heading">Step 2 — Select Program Template</h2>
        <div id="assign-template-list" class="radio-list" role="radiogroup" aria-label="Select program template">
          ${renderTemplateList(allTemplates)}
        </div>
        <div style="margin-top:10px;">
          <a href="#programs" style="font-size:0.85rem;color:var(--teal);">+ Create new template</a>
        </div>
      </div>
    </div>

    <!-- Step 3: Schedule -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-body">
        <h2 class="step-heading">Step 3 — Schedule</h2>
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:end;">
          <div class="form-group" style="margin:0;">
            <label for="assign-start-date">Start Date <span class="req">*</span></label>
            <input type="date" id="assign-start-date" value="${today}">
          </div>
          <div class="form-group" style="margin:0;">
            <label for="assign-end-date">End Date</label>
            <input type="date" id="assign-end-date" value="${computeEndDate(today, selectedTemplate?.duration_weeks)}" ${selectedTemplate ? '' : 'disabled'}>
            <div class="checkbox-row" style="margin-top:6px;">
              <input type="checkbox" id="assign-open-ended">
              <label for="assign-open-ended" style="font-size:0.85rem;">Open-ended</label>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 4: Notes -->
    <div class="card" style="margin-bottom:80px;">
      <div class="card-body">
        <h2 class="step-heading">Step 4 — Notes (optional)</h2>
        <div class="form-group" style="margin:0;">
          <label for="assign-notes">Trainer Notes</label>
          <textarea id="assign-notes" rows="3"
                    placeholder="Notes about this assignment, e.g., modify lower body intensity week 1…"></textarea>
        </div>
      </div>
    </div>

    <!-- Sticky summary + confirm -->
    <div id="assign-summary-bar" class="assign-summary-bar" aria-live="polite">
      <div id="assign-summary-text" class="assign-summary-text">
        Select a client and program to continue.
      </div>
      <button id="btn-confirm-assign" class="btn btn-primary" disabled>
        Confirm &amp; Assign
      </button>
    </div>
  `;

  bindAssignEvents();

  // If a client was preselected, click that radio
  if (selectedClient) {
    const radio = document.querySelector(`input[name="assign-client"][value="${selectedClient.id}"]`);
    if (radio) {
      radio.checked = true;
      updateSummary();
    }
  }
}

// ── Client list HTML ───────────────────────────────────

function renderClientList(clients) {
  if (!clients.length) {
    return `<p style="color:var(--text-muted);font-size:0.9rem;">No active clients found.</p>`;
  }
  return clients.map(c => {
    const activeAssign = c.program_assignments?.find(a => a.status === 'active');
    const activeProg   = activeAssign?.program_templates?.name;
    const meta         = activeProg
      ? `<span class="form-hint" style="margin:0;">Active: ${escHtml(activeProg)}</span>`
      : `<span class="form-hint" style="margin:0;">No active program</span>`;
    const glp1 = c.on_glp1
      ? `<span class="glp1-badge" style="margin-left:4px;" title="GLP-1 patient">💊</span>`
      : '';
    const isPreselected = selectedClient?.id === c.id;
    return `
      <label class="radio-row${isPreselected ? ' selected' : ''}">
        <input type="radio" name="assign-client" value="${c.id}" ${isPreselected ? 'checked' : ''}>
        <div style="flex:1;min-width:0;">
          <span style="font-weight:500;">${escHtml(c.full_name)}</span>${glp1}
          <br>${meta}
        </div>
      </label>
    `;
  }).join('');
}

// ── Template list HTML ─────────────────────────────────

function renderTemplateList(templates) {
  if (!templates.length) {
    return `<p style="color:var(--text-muted);font-size:0.9rem;">No templates found. <a href="#programs">Create one.</a></p>`;
  }
  return templates.map(t => {
    const meta = [
      t.days_per_week  ? `${t.days_per_week}d/wk`  : null,
      t.duration_weeks ? `${t.duration_weeks} weeks` : null,
      t.focus          ? escHtml(t.focus)             : null,
    ].filter(Boolean).join(' · ');
    const glp1 = t.is_glp1_template
      ? `<span class="glp1-badge" style="margin-left:4px;" title="GLP-1 template">💊</span>`
      : '';
    const isSelected = selectedTemplate?.id === t.id;
    return `
      <label class="radio-row${isSelected ? ' selected' : ''}">
        <input type="radio" name="assign-template" value="${t.id}" ${isSelected ? 'checked' : ''}>
        <div style="flex:1;min-width:0;">
          <span style="font-weight:500;">${escHtml(t.name)}</span>${glp1}
          <br><span class="form-hint" style="margin:0;">${meta || '—'}</span>
        </div>
      </label>
    `;
  }).join('');
}

// ── Bind events ────────────────────────────────────────

function bindAssignEvents() {
  // Client search
  let searchTimer;
  document.getElementById('assign-client-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q        = e.target.value.toLowerCase().trim();
      const filtered = q
        ? allClients.filter(c => c.full_name.toLowerCase().includes(q))
        : allClients;
      document.getElementById('assign-client-list').innerHTML = renderClientList(filtered);
    }, 150);
  });

  // Client radio selection
  document.getElementById('assign-client-list').addEventListener('change', (e) => {
    if (e.target.name === 'assign-client') {
      selectedClient = allClients.find(c => c.id === e.target.value) ?? null;
      // Highlight selected row
      document.querySelectorAll('input[name="assign-client"]').forEach(r => {
        r.closest('.radio-row')?.classList.toggle('selected', r.checked);
      });
      updateSummary();
    }
  });

  // Template radio selection
  document.getElementById('assign-template-list').addEventListener('change', (e) => {
    if (e.target.name === 'assign-template') {
      selectedTemplate = allTemplates.find(t => t.id === e.target.value) ?? null;
      document.querySelectorAll('input[name="assign-template"]').forEach(r => {
        r.closest('.radio-row')?.classList.toggle('selected', r.checked);
      });
      // Recalculate end date
      const startDate = document.getElementById('assign-start-date')?.value;
      const endDateEl = document.getElementById('assign-end-date');
      const openEnded = document.getElementById('assign-open-ended')?.checked;
      if (endDateEl && selectedTemplate && !openEnded) {
        endDateEl.value    = computeEndDate(startDate, selectedTemplate.duration_weeks);
        endDateEl.disabled = false;
      }
      updateSummary();
    }
  });

  // Start date change → recompute end date
  document.getElementById('assign-start-date').addEventListener('change', (e) => {
    const openEnded = document.getElementById('assign-open-ended')?.checked;
    const endDateEl = document.getElementById('assign-end-date');
    if (endDateEl && selectedTemplate && !openEnded) {
      endDateEl.value = computeEndDate(e.target.value, selectedTemplate.duration_weeks);
    }
    updateSummary();
  });

  // Open-ended toggle
  document.getElementById('assign-open-ended').addEventListener('change', (e) => {
    const endDateEl = document.getElementById('assign-end-date');
    if (e.target.checked) {
      endDateEl.value    = '';
      endDateEl.disabled = true;
    } else {
      const startDate = document.getElementById('assign-start-date')?.value;
      endDateEl.value    = computeEndDate(startDate, selectedTemplate?.duration_weeks);
      endDateEl.disabled = false;
    }
    updateSummary();
  });

  // Confirm button
  document.getElementById('btn-confirm-assign').addEventListener('click', submitAssignment);
}

// ── Summary bar ────────────────────────────────────────

function updateSummary() {
  const summaryText = document.getElementById('assign-summary-text');
  const confirmBtn  = document.getElementById('btn-confirm-assign');
  if (!summaryText || !confirmBtn) return;

  if (!selectedClient || !selectedTemplate) {
    summaryText.textContent = 'Select a client and program to continue.';
    confirmBtn.disabled     = true;
    return;
  }

  const startDate = document.getElementById('assign-start-date')?.value;
  const openEnded = document.getElementById('assign-open-ended')?.checked;
  const weeks     = selectedTemplate.duration_weeks;
  const daysPerWk = selectedTemplate.days_per_week;

  const scheduleParts = [
    startDate ? `Start ${window.iron.formatDate(startDate)}` : null,
    weeks     ? `${weeks} weeks`  : null,
    openEnded ? 'Open-ended'      : null,
    daysPerWk ? `${daysPerWk}d/wk` : null,
  ].filter(Boolean).join(' · ');

  summaryText.innerHTML = `
    <strong>${escHtml(selectedClient.full_name)}</strong>
    &nbsp;→&nbsp;
    <strong>${escHtml(selectedTemplate.name)}</strong>
    ${selectedTemplate.is_glp1_template ? '💊' : ''}
    <span style="color:var(--text-secondary);font-size:0.85rem;margin-left:6px;">${escHtml(scheduleParts)}</span>
  `;
  confirmBtn.disabled = false;
}

// ── Submit ─────────────────────────────────────────────

async function submitAssignment() {
  if (!selectedClient || !selectedTemplate) return;

  const startDate = document.getElementById('assign-start-date').value;
  if (!startDate) {
    window.iron.showToast('Please set a start date.', 'error');
    document.getElementById('assign-start-date').focus();
    return;
  }

  const openEnded = document.getElementById('assign-open-ended').checked;
  const endDate   = openEnded
    ? null
    : (document.getElementById('assign-end-date').value || null);
  const notes     = document.getElementById('assign-notes').value.trim() || null;

  const { data: user } = await supabase.auth.getUser();
  const trainerId = user?.user?.id;

  // Check for existing active assignment on this client
  const existingActive = selectedClient.program_assignments?.find(a => a.status === 'active');

  const doInsert = async () => {
    const confirmBtn = document.getElementById('btn-confirm-assign');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Assigning…'; }

    // Close existing active assignment if any
    if (existingActive) {
      const { error: closeErr } = await supabase
        .from('program_assignments')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', existingActive.id)
        .eq('trainer_id', trainerId);
      if (closeErr) {
        window.iron.showToast(`Could not end existing assignment: ${closeErr.message}`, 'error');
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm & Assign'; }
        return;
      }
    }

    // Insert new assignment
    const { error: insertErr } = await supabase
      .from('program_assignments')
      .insert([{
        trainer_id:    trainerId,
        client_id:     selectedClient.id,
        template_id:   selectedTemplate.id,
        start_date:    startDate,
        end_date:      endDate,
        status:        'active',
        trainer_notes: notes,
      }]);

    if (insertErr) {
      window.iron.showToast(`Assignment failed: ${insertErr.message}`, 'error');
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm & Assign'; }
      return;
    }

    window.iron.showToast(`Program assigned to ${selectedClient.full_name}.`, 'success');
    window.location.hash = `#client/${selectedClient.id}`;
  };

  if (existingActive) {
    const existingName = existingActive.program_templates?.name ?? 'their current program';
    window.iron.confirmDialog(
      `${selectedClient.full_name} is already on "${existingName}". End that assignment and start the new one?`,
      doInsert,
      'Yes, reassign'
    );
  } else {
    await doInsert();
  }
}

// ── Helpers ────────────────────────────────────────────

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function computeEndDate(startIso, durationWeeks) {
  if (!startIso || !durationWeeks) return '';
  try {
    const d = new Date(startIso);
    d.setDate(d.getDate() + durationWeeks * 7);
    return d.toISOString().slice(0, 10);
  } catch (_) {
    return '';
  }
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
