/**
 * Iron Platform — Trainer Portal
 * screens/programs.js — Program Builder (Screen 4)
 *
 * Renders:
 *  - List view: trainer's program_templates with active assignment counts
 *  - Edit view: template metadata form + program_days accordion
 *  - Per-day: label/sublabel/suggested_day/warmup_notes + exercise list
 *  - Add Day, Add Exercise (panel picker), Remove Day/Exercise
 *  - New Program: Initialize panel (blank | clone GLP-1 seed)
 *
 * v0.2 note: drag-reorder is explicitly excluded; sort_order is an
 * editable integer field on each day row.
 */

import { supabase } from '../portal.js';

// ── Module state ───────────────────────────────────────
let currentTemplateId = null;   // UUID of the template open in edit view
let programDays       = [];     // Sorted array of program_day rows for current template
let expandedDays      = new Set(); // day IDs currently expanded

// ── Entry point ────────────────────────────────────────

export async function renderPrograms() {
  currentTemplateId = null;
  programDays       = [];
  expandedDays      = new Set();
  await showListView();
}

// ──────────────────────────────────────────────────────
// LIST VIEW
// ──────────────────────────────────────────────────────

async function showListView() {
  const section = document.getElementById('view-programs');

  section.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Programs</h1>
        <div class="page-subtitle">Build and manage your program templates</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" id="btn-new-program">+ New Program</button>
      </div>
    </div>
    <div id="programs-list-wrap">
      <div class="loading-state">
        <div class="spinner"></div>
        <span>Loading programs…</span>
      </div>
    </div>
  `;

  document.getElementById('btn-new-program').addEventListener('click', openNewProgramPanel);

  await loadProgramList();
}

async function loadProgramList() {
  const wrap = document.getElementById('programs-list-wrap');
  const { data: user } = await supabase.auth.getUser();
  const trainerId = user?.user?.id;

  const { data: templates, error } = await supabase
    .from('program_templates')
    .select(`
      id,
      name,
      duration_weeks,
      days_per_week,
      focus,
      is_glp1_template,
      is_archived,
      program_assignments ( id, status )
    `)
    .eq('trainer_id', trainerId)
    .eq('is_archived', false)
    .order('name', { ascending: true });

  if (error) {
    wrap.innerHTML = `
      <div class="alert-banner alert-banner-error" role="alert">
        Could not load programs: ${escHtml(error.message)}
      </div>
    `;
    return;
  }

  if (!templates || templates.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state" style="padding:48px 24px;">
        <div class="empty-icon">📋</div>
        <h3>No programs yet</h3>
        <p>Start by cloning the GLP-1 Protocol or creating a blank template.</p>
        <button class="btn btn-primary" onclick="document.getElementById('btn-new-program').click()">
          + New Program
        </button>
      </div>
    `;
    return;
  }

  const rows = templates.map(t => {
    const activeCount = t.program_assignments?.filter(a => a.status === 'active').length ?? 0;
    const glp1Badge   = t.is_glp1_template
      ? `<span class="glp1-badge" title="GLP-1 template">💊</span>`
      : '';
    const metaStr = [
      t.duration_weeks ? `${t.duration_weeks}wk` : null,
      t.days_per_week  ? `${t.days_per_week}d/wk` : null,
      t.focus          ? escHtml(t.focus) : null,
    ].filter(Boolean).join(' · ');

    return `
      <div class="table-row" style="align-items:center;" data-template-id="${t.id}">
        <div class="client-name-cell" style="flex:2;">
          ${glp1Badge}
          <span>${escHtml(t.name)}</span>
        </div>
        <div class="cell-secondary" style="flex:2;">${metaStr || '—'}</div>
        <div class="cell-secondary" style="flex:1;">${activeCount} active</div>
        <div class="cell-actions" style="flex:0 0 auto;gap:8px;display:flex;">
          <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${t.id}" aria-label="Edit ${escHtml(t.name)}">
            ✏ Edit
          </button>
          <button class="btn btn-ghost btn-sm" data-action="archive" data-id="${t.id}" aria-label="Archive ${escHtml(t.name)}">
            Archive
          </button>
        </div>
      </div>
    `;
  }).join('');

  wrap.innerHTML = `
    <div class="table-container" role="table" aria-label="Program templates">
      <div class="table-header" role="row">
        <div style="flex:2;" role="columnheader">Name</div>
        <div style="flex:2;" role="columnheader">Details</div>
        <div style="flex:1;" role="columnheader">Clients</div>
        <div style="flex:0 0 auto;min-width:140px;" role="columnheader"><span class="sr-only">Actions</span></div>
      </div>
      ${rows}
    </div>
  `;

  // Bind actions
  wrap.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showEditView(btn.dataset.id);
    });
  });

  wrap.querySelectorAll('[data-action="archive"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tmpl = templates.find(t => t.id === btn.dataset.id);
      window.iron.confirmDialog(
        `Archive "${tmpl?.name ?? 'this program'}"? It will no longer appear in your list or be available for assignment.`,
        async () => {
          const { error: archErr } = await supabase
            .from('program_templates')
            .update({ is_archived: true })
            .eq('id', btn.dataset.id)
            .eq('trainer_id', (await supabase.auth.getUser()).data?.user?.id);
          if (archErr) {
            window.iron.showToast(`Archive failed: ${archErr.message}`, 'error');
          } else {
            window.iron.showToast('Program archived.', 'success');
            await loadProgramList();
          }
        },
        'Archive'
      );
    });
  });
}

// ── New Program Panel ──────────────────────────────────

function openNewProgramPanel() {
  const bodyHtml = `
    <p style="margin-bottom:16px;">How would you like to start?</p>
    <div class="radio-list" id="new-prog-type">
      <label class="radio-row">
        <input type="radio" name="prog-init" value="blank" checked>
        <div>
          <strong>Blank Template</strong>
          <div class="form-hint">Start from scratch and build your own day/exercise structure.</div>
        </div>
      </label>
      <label class="radio-row" style="margin-top:12px;">
        <input type="radio" name="prog-init" value="glp1">
        <div>
          <strong>Clone GLP-1 Protocol 💊</strong>
          <div class="form-hint">Pre-built 8-week, 4-day template optimised for GLP-1 patients. Fully editable after cloning.</div>
        </div>
      </label>
    </div>
    <div class="form-group" style="margin-top:20px;">
      <label for="new-prog-name">Program Name <span class="req">*</span></label>
      <input type="text" id="new-prog-name" placeholder="e.g., Maximum Hypertrophy Plan" autocomplete="off">
      <span class="field-error" id="err-new-prog-name" style="display:none;" role="alert"></span>
    </div>
  `;
  const footerHtml = `
    <button class="btn btn-secondary" onclick="window.iron.closePanel()">Cancel</button>
    <button class="btn btn-primary" id="new-prog-create-btn">Create</button>
  `;
  window.iron.openPanel('New Program', bodyHtml, footerHtml);

  document.getElementById('new-prog-create-btn').addEventListener('click', async () => {
    const nameInput = document.getElementById('new-prog-name');
    const name      = nameInput.value.trim();
    const errEl     = document.getElementById('err-new-prog-name');
    const type      = document.querySelector('input[name="prog-init"]:checked')?.value;

    if (!name) {
      nameInput.classList.add('input-error');
      errEl.textContent = 'Program name is required.';
      errEl.style.display = '';
      nameInput.focus();
      return;
    }
    nameInput.classList.remove('input-error');
    errEl.style.display = 'none';

    const btn = document.getElementById('new-prog-create-btn');
    btn.disabled = true;
    btn.textContent = 'Creating…';

    const { data: user } = await supabase.auth.getUser();
    const trainerId = user?.user?.id;

    let newTemplateId = null;

    if (type === 'glp1') {
      // Call seed function
      const { data, error } = await supabase
        .rpc('seed_glp1_program_for_trainer', { p_trainer_id: trainerId, p_name: name });
      if (error) {
        window.iron.showToast(`Clone failed: ${error.message}`, 'error');
        btn.disabled = false;
        btn.textContent = 'Create';
        return;
      }
      newTemplateId = data; // function returns new template UUID
    } else {
      // Blank template
      const { data, error } = await supabase
        .from('program_templates')
        .insert([{
          trainer_id: trainerId,
          name,
          is_glp1_template: false,
          is_archived: false,
        }])
        .select('id')
        .single();
      if (error) {
        window.iron.showToast(`Create failed: ${error.message}`, 'error');
        btn.disabled = false;
        btn.textContent = 'Create';
        return;
      }
      newTemplateId = data.id;
    }

    window.iron.closePanel();
    window.iron.showToast('Program created.', 'success');
    await showEditView(newTemplateId);
  });
}

// ──────────────────────────────────────────────────────
// EDIT VIEW
// ──────────────────────────────────────────────────────

async function showEditView(templateId) {
  currentTemplateId = templateId;
  expandedDays      = new Set();

  const section = document.getElementById('view-programs');
  section.innerHTML = `
    <div class="loading-state" style="margin-top:48px;">
      <div class="spinner"></div>
      <span>Loading program…</span>
    </div>
  `;

  const { data: user }     = await supabase.auth.getUser();
  const trainerId          = user?.user?.id;

  // Fetch template + days + exercises in parallel
  const [tmplResult, daysResult] = await Promise.all([
    supabase
      .from('program_templates')
      .select('*')
      .eq('id', templateId)
      .eq('trainer_id', trainerId)
      .single(),
    supabase
      .from('program_days')
      .select(`
        id, template_id, day_key, label, sub_label, suggested_day, warmup_notes, sort_order,
        program_day_exercises (
          id, sort_order, prescribed_sets, prescribed_reps, prescribed_tempo, prescribed_rest_sec, coaching_cue, exercise_id,
          exercises ( id, name, category )
        )
      `)
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true }),
  ]);

  if (tmplResult.error) {
    window.iron.showToast(`Load failed: ${tmplResult.error.message}`, 'error');
    await showListView();
    return;
  }

  const tmpl = tmplResult.data;
  programDays = (daysResult.data ?? []).map(d => ({
    ...d,
    program_day_exercises: (d.program_day_exercises ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order),
  }));

  renderEditView(tmpl);
}

function renderEditView(tmpl) {
  const section = document.getElementById('view-programs');

  section.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:12px;">
        <button class="btn btn-ghost btn-sm" id="btn-back-to-list" aria-label="Back to programs list">← Programs</button>
        <div>
          <h1 id="edit-prog-title">${escHtml(tmpl.name)}</h1>
          <div class="page-subtitle">Program Builder</div>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" id="btn-save-template">Save Template</button>
      </div>
    </div>

    <!-- Template metadata -->
    <div class="card" style="margin-bottom:24px;">
      <div class="card-body">
        <form id="tmpl-meta-form" novalidate>
          <div class="form-row" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;">
            <div class="form-group" style="margin:0;">
              <label for="tmpl-name">Program Name <span class="req">*</span></label>
              <input type="text" id="tmpl-name" value="${escHtml(tmpl.name)}" placeholder="Program name" required>
              <span class="field-error" id="err-tmpl-name" style="display:none;" role="alert"></span>
            </div>
            <div class="form-group" style="margin:0;">
              <label for="tmpl-duration">Duration (weeks)</label>
              <input type="number" id="tmpl-duration" min="1" max="52"
                     value="${tmpl.duration_weeks ?? ''}" placeholder="e.g., 12">
            </div>
            <div class="form-group" style="margin:0;">
              <label for="tmpl-dpw">Days / Week</label>
              <input type="number" id="tmpl-dpw" min="1" max="7"
                     value="${tmpl.days_per_week ?? ''}" placeholder="e.g., 4">
            </div>
            <div class="form-group" style="margin:0;">
              <label for="tmpl-focus">Focus</label>
              <input type="text" id="tmpl-focus" value="${escHtml(tmpl.focus ?? '')}"
                     placeholder="e.g., Muscle Preservation">
            </div>
          </div>
          <div class="checkbox-row" style="margin-top:12px;">
            <input type="checkbox" id="tmpl-glp1" ${tmpl.is_glp1_template ? 'checked' : ''}>
            <label for="tmpl-glp1">GLP-1 Template 💊</label>
          </div>
        </form>
      </div>
    </div>

    <!-- Program Days -->
    <div class="section-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <h2 style="margin:0;font-size:1rem;font-weight:600;color:var(--text-primary);">Program Days</h2>
      <button class="btn btn-secondary btn-sm" id="btn-add-day">+ Add Day</button>
    </div>

    <div id="days-container">
      ${renderDaysList()}
    </div>
  `;

  // Bind
  document.getElementById('btn-back-to-list').addEventListener('click', () => showListView());
  document.getElementById('btn-save-template').addEventListener('click', saveTemplate);
  document.getElementById('btn-add-day').addEventListener('click', addDay);

  bindDayEvents();
}

// ── Days list HTML ─────────────────────────────────────

function renderDaysList() {
  if (programDays.length === 0) {
    return `
      <div class="empty-state" style="padding:32px 24px;">
        <div class="empty-icon">📅</div>
        <h3>No days yet</h3>
        <p>Add a day to start building the program structure.</p>
      </div>
    `;
  }

  return programDays.map(day => renderDayCard(day)).join('');
}

function renderDayCard(day) {
  const isExpanded  = expandedDays.has(day.id);
  const exCount     = day.program_day_exercises?.length ?? 0;
  const totalSets   = day.program_day_exercises?.reduce((s, e) => s + (e.prescribed_sets || 0), 0) ?? 0;
  const summaryText = `${exCount} exercise${exCount !== 1 ? 's' : ''} · ${totalSets} total sets`;

  const exercisesHtml = isExpanded ? renderExercisesForDay(day) : '';

  return `
    <div class="card day-card" style="margin-bottom:12px;" data-day-id="${day.id}">
      <div class="day-card-header" style="display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;" data-day-toggle="${day.id}">
        <!-- Sort order (shown only when 4+ days) -->
        ${programDays.length >= 4 ? `
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
          <label class="sr-only" for="sort-${day.id}">Order</label>
          <input type="number" id="sort-${day.id}" class="day-sort-input"
                 value="${day.sort_order}"
                 min="0" max="999"
                 style="width:52px;text-align:center;"
                 data-day-id="${day.id}"
                 aria-label="Sort order for ${escHtml(day.label)}">
        </div>` : ''}

        <!-- Label + sub_label -->
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;color:var(--text-primary);">${escHtml(day.label)}</div>
          ${day.sub_label
            ? `<div class="cell-secondary" style="font-size:0.8rem;">${escHtml(day.sub_label)}</div>`
            : ''}
          ${day.suggested_day
            ? `<div class="cell-secondary" style="font-size:0.75rem;color:var(--text-muted);">${escHtml(day.suggested_day)}</div>`
            : ''}
        </div>

        <!-- Summary -->
        <div class="cell-secondary" style="flex-shrink:0;font-size:0.8rem;">${summaryText}</div>

        <!-- Actions -->
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn btn-ghost btn-icon btn-sm" data-day-edit="${day.id}" aria-label="Edit day ${escHtml(day.label)}">✏</button>
          <button class="btn btn-ghost btn-icon btn-sm toggle-day-btn"
                  data-day-id="${day.id}"
                  aria-label="${isExpanded ? 'Collapse' : 'Expand'} ${escHtml(day.label)}"
                  aria-expanded="${isExpanded}">
            ${isExpanded ? '▲' : '▼'}
          </button>
          <button class="btn btn-ghost btn-icon btn-sm" data-day-remove="${day.id}" aria-label="Remove day ${escHtml(day.label)}" style="color:var(--alert);">✕</button>
        </div>
      </div>

      ${isExpanded ? `
        <!-- Warmup notes -->
        <div style="padding:0 16px 8px;border-top:1px solid var(--border);">
          <div class="form-group" style="margin-top:12px;margin-bottom:8px;">
            ${day.warmup_notes ? `
            <label for="warmup-${day.id}" style="font-size:0.8rem;">Warmup Notes</label>
            <textarea id="warmup-${day.id}" rows="2" class="day-warmup"
                      data-day-id="${day.id}"
                      style="font-size:0.85rem;"
                      placeholder="e.g., 5 min cardio + band pull-aparts">${escHtml(day.warmup_notes)}</textarea>
            ` : `
            <button class="btn btn-ghost btn-sm day-warmup-add" data-day-id="${day.id}"
                    style="font-size:0.8rem;padding:2px 6px;color:var(--text-muted);">+ Add warmup notes</button>
            <textarea id="warmup-${day.id}" rows="2" class="day-warmup"
                      data-day-id="${day.id}"
                      style="font-size:0.85rem;display:none;"
                      placeholder="e.g., 5 min cardio + band pull-aparts"></textarea>
            `}
          </div>

          <!-- Exercises -->
          <div class="section-header" style="display:flex;align-items:center;justify-content:space-between;margin:8px 0;">
            <h3 style="margin:0;font-size:0.85rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.04em;">Exercises</h3>
            <button class="btn btn-ghost btn-sm" data-add-exercise="${day.id}">+ Add Exercise</button>
          </div>

          ${exercisesHtml}
        </div>
      ` : ''}
    </div>
  `;
}

function renderExercisesForDay(day) {
  const exes = day.program_day_exercises ?? [];

  if (exes.length === 0) {
    return `<p style="font-size:0.85rem;color:var(--text-muted);padding:4px 0 12px;">No exercises yet — click + Add Exercise to get started.</p>`;
  }

  const rows = exes.map(ex => {
    const name    = ex.exercises?.name ?? '[deleted exercise]';
    const cat     = ex.exercises?.category ? `<span class="cell-secondary" style="font-size:0.75rem;">${escHtml(ex.exercises.category)}</span>` : '';
    const sets    = ex.prescribed_sets   ?? '?';
    const reps    = ex.prescribed_reps   ?? '?';
    const tempo   = ex.prescribed_tempo  ? ` · ${escHtml(ex.prescribed_tempo)}` : '';
    const rest    = ex.prescribed_rest_sec
      ? ` · ${formatRestSec(ex.prescribed_rest_sec)}`
      : '';
    const cue     = ex.coaching_cue
      ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;font-style:italic;">${escHtml(ex.coaching_cue)}</div>`
      : '';

    return `
      <div class="exercise-row" style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);" data-ex-id="${ex.id}">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:500;font-size:0.9rem;color:var(--text-primary);">${escHtml(name)} ${cat}</div>
          <div class="cell-secondary" style="font-size:0.82rem;">${sets}×${escHtml(reps)}${tempo}${rest}</div>
          ${cue}
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          <button class="btn btn-ghost btn-icon btn-sm"
                  data-ex-edit="${ex.id}" data-day-id="${day.id}"
                  aria-label="Edit exercise ${escHtml(name)}">✏</button>
          <button class="btn btn-ghost btn-icon btn-sm"
                  data-ex-remove="${ex.id}" data-day-id="${day.id}"
                  aria-label="Remove exercise ${escHtml(name)}"
                  style="color:var(--alert);">✕</button>
        </div>
      </div>
    `;
  }).join('');

  return `<div class="exercises-list">${rows}</div>`;
}

// ── Bind events on the days container ─────────────────

function bindDayEvents() {
  const container = document.getElementById('days-container');
  if (!container) return;

  // Toggle expand/collapse
  container.addEventListener('click', (e) => {
    // Whole-header toggle — skip if click landed on a control or action button
    const headerToggle = e.target.closest('[data-day-toggle]');
    if (headerToggle && !e.target.closest('button, input, textarea, select, a, [contenteditable]')) {
      const dayId = headerToggle.dataset.dayToggle;
      if (expandedDays.has(dayId)) {
        expandedDays.delete(dayId);
      } else {
        expandedDays.add(dayId);
      }
      refreshDaysContainer();
      return;
    }

    const toggleBtn = e.target.closest('[data-day-id].toggle-day-btn');
    if (toggleBtn) {
      const dayId = toggleBtn.dataset.dayId;
      if (expandedDays.has(dayId)) {
        expandedDays.delete(dayId);
      } else {
        expandedDays.add(dayId);
      }
      refreshDaysContainer();
      return;
    }

    // Warmup notes reveal button
    const warmupAdd = e.target.closest('.day-warmup-add');
    if (warmupAdd) {
      const btn = warmupAdd;
      const textarea = btn.nextElementSibling;
      btn.style.display = 'none';
      textarea.style.display = '';
      textarea.focus();
      return;
    }

    // Edit day metadata
    const editBtn = e.target.closest('[data-day-edit]');
    if (editBtn) {
      openEditDayPanel(editBtn.dataset.dayEdit);
      return;
    }

    // Remove day
    const removeBtn = e.target.closest('[data-day-remove]');
    if (removeBtn) {
      removeDayConfirm(removeBtn.dataset.dayRemove);
      return;
    }

    // Add exercise
    const addExBtn = e.target.closest('[data-add-exercise]');
    if (addExBtn) {
      openExercisePickerPanel(addExBtn.dataset.addExercise);
      return;
    }

    // Edit exercise
    const exEditBtn = e.target.closest('[data-ex-edit]');
    if (exEditBtn) {
      openEditExercisePanel(exEditBtn.dataset.exEdit, exEditBtn.dataset.dayId);
      return;
    }

    // Remove exercise
    const exRemoveBtn = e.target.closest('[data-ex-remove]');
    if (exRemoveBtn) {
      removeExerciseConfirm(exRemoveBtn.dataset.exRemove, exRemoveBtn.dataset.dayId);
      return;
    }
  });

  // Sort order change (debounced)
  let sortTimer;
  container.addEventListener('change', (e) => {
    if (e.target.classList.contains('day-sort-input')) {
      const dayId   = e.target.dataset.dayId;
      const newSort = parseInt(e.target.value, 10);
      clearTimeout(sortTimer);
      sortTimer = setTimeout(() => updateDaySortOrder(dayId, newSort), 300);
    }
    if (e.target.classList.contains('day-warmup')) {
      const dayId = e.target.dataset.dayId;
      clearTimeout(sortTimer);
      sortTimer = setTimeout(() => updateDayWarmupNotes(dayId, e.target.value), 300);
    }
  });
}

function refreshDaysContainer() {
  const container = document.getElementById('days-container');
  if (container) {
    container.innerHTML = renderDaysList();
    bindDayEvents();
  }
}

// ── Save Template metadata ─────────────────────────────

async function saveTemplate() {
  const nameInput = document.getElementById('tmpl-name');
  const name      = nameInput.value.trim();
  const errEl     = document.getElementById('err-tmpl-name');

  if (!name) {
    nameInput.classList.add('input-error');
    errEl.textContent = 'Program name is required.';
    errEl.style.display = '';
    nameInput.focus();
    return;
  }
  nameInput.classList.remove('input-error');
  errEl.style.display = 'none';

  const btn = document.getElementById('btn-save-template');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  const { data: user } = await supabase.auth.getUser();
  const trainerId = user?.user?.id;

  const payload = {
    name,
    duration_weeks:   parseInt(document.getElementById('tmpl-duration').value, 10) || null,
    days_per_week:    parseInt(document.getElementById('tmpl-dpw').value, 10)      || null,
    focus:            document.getElementById('tmpl-focus').value.trim()           || null,
    is_glp1_template: document.getElementById('tmpl-glp1').checked,
    updated_at:       new Date().toISOString(),
  };

  const { error } = await supabase
    .from('program_templates')
    .update(payload)
    .eq('id', currentTemplateId)
    .eq('trainer_id', trainerId);

  btn.disabled    = false;
  btn.textContent = 'Save Template';

  if (error) {
    window.iron.showToast(`Save failed: ${error.message}`, 'error');
    return;
  }

  window.iron.showToast('Template saved.', 'success');
  document.getElementById('edit-prog-title').textContent = name;
}

// ── Add Day ────────────────────────────────────────────

async function addDay() {
  const nextOrder = programDays.length > 0
    ? Math.max(...programDays.map(d => d.sort_order)) + 1
    : 0;

  const { data, error } = await supabase
    .from('program_days')
    .insert([{
      template_id:   currentTemplateId,
      day_key:       `day_${nextOrder}`,
      label:         `Day ${nextOrder + 1}`,
      sort_order:    nextOrder,
    }])
    .select(`
      id, template_id, day_key, label, sub_label, suggested_day, warmup_notes, sort_order
    `)
    .single();

  if (error) {
    window.iron.showToast(`Add day failed: ${error.message}`, 'error');
    return;
  }

  const newDay = { ...data, program_day_exercises: [] };
  programDays.push(newDay);
  expandedDays.add(newDay.id);
  refreshDaysContainer();
  // Open edit panel so trainer can set label immediately
  openEditDayPanel(newDay.id);
}

// ── Edit Day panel ─────────────────────────────────────

function openEditDayPanel(dayId) {
  const day = programDays.find(d => d.id === dayId);
  if (!day) return;

  const bodyHtml = `
    <form id="day-edit-form" novalidate>
      <div class="form-group">
        <label for="day-label">Label <span class="req">*</span></label>
        <input type="text" id="day-label" value="${escHtml(day.label)}"
               placeholder="e.g., Upper A" required>
        <span class="field-error" id="err-day-label" style="display:none;" role="alert"></span>
      </div>
      <div class="form-group">
        <label for="day-sub-label">Sub Label</label>
        <input type="text" id="day-sub-label" value="${escHtml(day.sub_label ?? '')}"
               placeholder="e.g., Push Emphasis">
      </div>
      <div class="form-group">
        <label for="day-suggested">Suggested Day</label>
        <input type="text" id="day-suggested" value="${escHtml(day.suggested_day ?? '')}"
               placeholder="e.g., Monday">
      </div>
      <div class="form-group">
        <label for="day-warmup">Warmup Notes</label>
        <textarea id="day-warmup" rows="3"
                  placeholder="e.g., 5 min cardio + band pull-aparts">${escHtml(day.warmup_notes ?? '')}</textarea>
      </div>
      <div class="form-group">
        <label for="day-sort">Sort Order</label>
        <input type="number" id="day-sort" min="0" max="999" value="${day.sort_order}">
        <span class="form-hint">Lower numbers appear first.</span>
      </div>
    </form>
  `;
  const footerHtml = `
    <button class="btn btn-secondary" onclick="window.iron.closePanel()">Cancel</button>
    <button class="btn btn-primary" id="day-edit-save-btn">Save Day</button>
  `;
  window.iron.openPanel('Edit Day', bodyHtml, footerHtml);

  document.getElementById('day-edit-save-btn').addEventListener('click', async () => {
    const label = document.getElementById('day-label').value.trim();
    const errEl = document.getElementById('err-day-label');
    if (!label) {
      document.getElementById('day-label').classList.add('input-error');
      errEl.textContent = 'Label is required.';
      errEl.style.display = '';
      document.getElementById('day-label').focus();
      return;
    }
    document.getElementById('day-label').classList.remove('input-error');
    errEl.style.display = 'none';

    const saveBtn = document.getElementById('day-edit-save-btn');
    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';

    const updatedFields = {
      label,
      sub_label:     document.getElementById('day-sub-label').value.trim()  || null,
      suggested_day: document.getElementById('day-suggested').value.trim()  || null,
      warmup_notes:  document.getElementById('day-warmup').value.trim()     || null,
      sort_order:    parseInt(document.getElementById('day-sort').value, 10) ?? day.sort_order,
    };

    const { error } = await supabase
      .from('program_days')
      .update(updatedFields)
      .eq('id', dayId);

    if (error) {
      window.iron.showToast(`Save failed: ${error.message}`, 'error');
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save Day';
      return;
    }

    // Update local state
    const idx = programDays.findIndex(d => d.id === dayId);
    if (idx !== -1) {
      programDays[idx] = { ...programDays[idx], ...updatedFields };
    }
    // Re-sort by sort_order
    programDays.sort((a, b) => a.sort_order - b.sort_order);

    window.iron.closePanel();
    window.iron.showToast('Day saved.', 'success');
    refreshDaysContainer();
  });
}

// ── Update day sort order inline ───────────────────────

async function updateDaySortOrder(dayId, newSort) {
  if (isNaN(newSort)) return;
  const { error } = await supabase
    .from('program_days')
    .update({ sort_order: newSort })
    .eq('id', dayId);
  if (error) {
    window.iron.showToast(`Reorder failed: ${error.message}`, 'error');
    return;
  }
  const idx = programDays.findIndex(d => d.id === dayId);
  if (idx !== -1) programDays[idx].sort_order = newSort;
  programDays.sort((a, b) => a.sort_order - b.sort_order);
  refreshDaysContainer();
}

// ── Update day warmup notes inline ────────────────────

async function updateDayWarmupNotes(dayId, value) {
  const { error } = await supabase
    .from('program_days')
    .update({ warmup_notes: value.trim() || null })
    .eq('id', dayId);
  if (error) {
    window.iron.showToast(`Save failed: ${error.message}`, 'error');
  } else {
    const idx = programDays.findIndex(d => d.id === dayId);
    if (idx !== -1) programDays[idx].warmup_notes = value.trim() || null;
  }
}

// ── Remove Day ─────────────────────────────────────────

function removeDayConfirm(dayId) {
  const day = programDays.find(d => d.id === dayId);
  window.iron.confirmDialog(
    `Remove "${day?.label ?? 'this day'}" and all its exercises? This cannot be undone.`,
    async () => {
      const { error } = await supabase
        .from('program_days')
        .delete()
        .eq('id', dayId);
      if (error) {
        window.iron.showToast(`Remove failed: ${error.message}`, 'error');
        return;
      }
      programDays = programDays.filter(d => d.id !== dayId);
      expandedDays.delete(dayId);
      window.iron.showToast('Day removed.', 'success');
      refreshDaysContainer();
    },
    'Remove'
  );
}

// ── Exercise Picker Panel ──────────────────────────────

async function openExercisePickerPanel(dayId) {
  window.iron.openPanel('Add Exercise', `
    <div style="margin-bottom:10px;">
      <button class="btn btn-secondary btn-sm" id="ex-create-btn" style="width:100%;justify-content:center;">
        + Create new exercise
      </button>
    </div>
    <div class="search-wrap" style="margin-bottom:12px;">
      <span class="search-icon" aria-hidden="true">🔍</span>
      <input type="search" id="ex-search" class="search-input" placeholder="Search exercises…" autocomplete="off">
    </div>
    <div id="ex-picker-list">
      <div class="loading-state"><div class="spinner"></div><span>Loading…</span></div>
    </div>
  `, '');

  const { data: user } = await supabase.auth.getUser();
  const trainerId = user?.user?.id;

  // Load exercises: global + trainer's custom
  const { data: exercises, error } = await supabase
    .from('exercises')
    .select('id, name, category, equipment, trainer_id')
    .or(`trainer_id.is.null,trainer_id.eq.${trainerId}`)
    .eq('is_archived', false)
    .order('category', { ascending: true })
    .order('name',     { ascending: true });

  if (error) {
    document.getElementById('ex-picker-list').innerHTML = `
      <div class="alert-banner alert-banner-error">Could not load exercises: ${escHtml(error.message)}</div>
    `;
    return;
  }

  let allExercises = exercises ?? [];
  renderExercisePicker(allExercises, dayId);

  // Search
  let searchTimer;
  document.getElementById('ex-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = q
        ? allExercises.filter(ex =>
            ex.name?.toLowerCase().includes(q) ||
            ex.category?.toLowerCase().includes(q))
        : allExercises;
      renderExercisePicker(filtered, dayId);
    }, 150);
  });

  // "+ Create new exercise" button — swap picker to creation form
  document.getElementById('ex-create-btn').addEventListener('click', () => {
    renderCustomExerciseForm(dayId, trainerId, allExercises);
  });
}

function renderExercisePicker(exercises, dayId, pinnedId = null) {
  const list = document.getElementById('ex-picker-list');

  // If a newly-created exercise should appear at top, pull it out first
  let pinned = null;
  let rest = exercises;
  if (pinnedId) {
    pinned = exercises.find(ex => ex.id === pinnedId) ?? null;
    rest   = exercises.filter(ex => ex.id !== pinnedId);
  }

  if (!exercises.length) {
    list.innerHTML = `<p style="color:var(--text-muted);padding:8px 0;">No exercises found.</p>`;
    return;
  }

  const rowHtml = (ex) => `
    <div class="table-row" style="cursor:pointer;padding:8px 10px;"
         tabindex="0" role="button"
         aria-label="Select ${escHtml(ex.name)}"
         data-ex-id="${ex.id}"
         data-ex-name="${escHtml(ex.name)}"
         onclick="window._ironPickExercise('${ex.id}','${dayId}')"
         onkeydown="if(event.key==='Enter')window._ironPickExercise('${ex.id}','${dayId}')">
      <span style="font-size:0.9rem;">${escHtml(ex.name)}</span>
      ${ex.trainer_id ? `<span style="font-size:0.75rem;color:var(--teal);margin-left:6px;">Custom</span>` : ''}
    </div>
  `;

  let html = '';

  // Pinned newly-created exercise at top with a highlight band
  if (pinned) {
    html += `
      <div style="margin-bottom:12px;">
        <div style="font-size:0.75rem;font-weight:600;color:var(--teal);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">New — ready to add</div>
        ${rowHtml(pinned)}
      </div>
    `;
  }

  // Group remaining exercises by category
  const byCategory = {};
  rest.forEach(ex => {
    const cat = ex.category ?? 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(ex);
  });

  html += Object.entries(byCategory).map(([cat, exes]) => `
    <div style="margin-bottom:12px;">
      <div style="font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">${escHtml(cat)}</div>
      ${exes.map(rowHtml).join('')}
    </div>
  `).join('');

  list.innerHTML = html;

  // Expose a global trampoline (cleaned up when panel closes)
  window._ironPickExercise = (exerciseId, dId) => {
    openPrescriptionPanel(exerciseId, dId);
  };
}

// ── Custom Exercise Creation Form ──────────────────────

function renderCustomExerciseForm(dayId, trainerId, allExercises) {
  const CATEGORIES  = ['Chest','Back','Legs','Shoulders','Arms','Core','Olympic','Cardio','Other'];
  const EQUIPMENT   = ['Barbell','Dumbbell','Machine','Cable','Smith','Kettlebell','Bodyweight','Band','EZ Bar','Trap Bar','Other'];
  const MOVEMENTS   = ['Push','Pull','Squat','Hinge','Lunge','Carry','Rotate','Anti-Rotate','Iso'];

  const catOptions  = CATEGORIES.map(c  => `<option value="${c}">${c}</option>`).join('');
  const eqOptions   = EQUIPMENT.map(e   => `<option value="${e}">${e}</option>`).join('');
  const mvOptions   = `<option value="">— optional —</option>` +
                      MOVEMENTS.map(m => `<option value="${m}">${m}</option>`).join('');

  // Hide search + create button; swap list area to form
  const searchWrap = document.querySelector('#ex-search')?.closest('.search-wrap');
  const createBtn  = document.getElementById('ex-create-btn');
  if (searchWrap) searchWrap.style.display = 'none';
  if (createBtn)  createBtn.style.display  = 'none';

  document.getElementById('ex-picker-list').innerHTML = `
    <form id="cef-form" novalidate>
      <div class="form-group">
        <label for="cef-name">Exercise Name <span class="req">*</span></label>
        <input type="text" id="cef-name" placeholder="e.g. Incline DB Fly" required autocomplete="off">
        <span class="field-error" id="err-cef-name" style="display:none;" role="alert"></span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">
        <div class="form-group" style="margin:0;">
          <label for="cef-category">Category <span class="req">*</span></label>
          <select id="cef-category" required>
            <option value="">— select —</option>
            ${catOptions}
          </select>
          <span class="field-error" id="err-cef-category" style="display:none;" role="alert"></span>
        </div>
        <div class="form-group" style="margin:0;">
          <label for="cef-equipment">Equipment <span class="req">*</span></label>
          <select id="cef-equipment" required>
            <option value="">— select —</option>
            ${eqOptions}
          </select>
          <span class="field-error" id="err-cef-equipment" style="display:none;" role="alert"></span>
        </div>
      </div>

      <details id="cef-advanced" style="margin-bottom:18px;">
        <summary style="font-size:13px;font-weight:600;color:var(--text-secondary);cursor:pointer;user-select:none;margin-bottom:12px;">
          Show advanced options
        </summary>

        <div class="form-group">
          <label for="cef-muscle">Muscle Group</label>
          <input type="text" id="cef-muscle" placeholder="e.g. Upper Chest" autocomplete="off">
        </div>

        <div class="form-group">
          <label for="cef-movement">Movement Pattern</label>
          <select id="cef-movement">${mvOptions}</select>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">
          <div class="form-group" style="margin:0;">
            <label for="cef-sets">Default Sets</label>
            <input type="number" id="cef-sets" min="1" max="20" placeholder="4">
          </div>
          <div class="form-group" style="margin:0;">
            <label for="cef-reps">Default Reps</label>
            <input type="text" id="cef-reps" placeholder="8-10">
          </div>
          <div class="form-group" style="margin:0;">
            <label for="cef-tempo">Default Tempo</label>
            <input type="text" id="cef-tempo" placeholder="3-1-1">
          </div>
          <div class="form-group" style="margin:0;">
            <label for="cef-rest">Default Rest (sec)</label>
            <input type="number" id="cef-rest" min="0" max="600" placeholder="90">
          </div>
        </div>

        <div class="form-group">
          <label for="cef-cue">Coaching Cue</label>
          <textarea id="cef-cue" rows="2"
                    placeholder="e.g. Keep elbows soft; drive the weight up from the chest, not the delts."></textarea>
        </div>
      </details>

      <div style="display:flex;gap:10px;margin-top:4px;">
        <button type="button" class="btn btn-primary" id="cef-save-btn" style="flex:1;">Save &amp; Add to Day</button>
        <button type="button" class="btn btn-secondary" id="cef-cancel-btn">Cancel</button>
      </div>
    </form>
  `;

  // Cancel → restore picker
  document.getElementById('cef-cancel-btn').addEventListener('click', () => {
    if (searchWrap) searchWrap.style.display = '';
    if (createBtn)  createBtn.style.display  = '';
    renderExercisePicker(allExercises, dayId);
  });

  // Save
  document.getElementById('cef-save-btn').addEventListener('click', async () => {
    // Clear previous errors
    ['cef-name','cef-category','cef-equipment'].forEach(id => {
      document.getElementById(id).classList.remove('input-error');
      document.getElementById(`err-${id}`).style.display = 'none';
    });

    const name      = document.getElementById('cef-name').value.trim();
    const category  = document.getElementById('cef-category').value;
    const equipment = document.getElementById('cef-equipment').value;
    let valid = true;

    if (!name) {
      document.getElementById('cef-name').classList.add('input-error');
      const e = document.getElementById('err-cef-name');
      e.textContent = 'Name is required.';
      e.style.display = '';
      valid = false;
    }
    if (!category) {
      document.getElementById('cef-category').classList.add('input-error');
      const e = document.getElementById('err-cef-category');
      e.textContent = 'Category is required.';
      e.style.display = '';
      valid = false;
    }
    if (!equipment) {
      document.getElementById('cef-equipment').classList.add('input-error');
      const e = document.getElementById('err-cef-equipment');
      e.textContent = 'Equipment is required.';
      e.style.display = '';
      valid = false;
    }
    if (!valid) return;

    // Collect optional advanced fields
    const muscle   = document.getElementById('cef-muscle').value.trim()   || null;
    const movement = document.getElementById('cef-movement').value         || null;
    const sets     = parseInt(document.getElementById('cef-sets').value, 10)  || null;
    const reps     = document.getElementById('cef-reps').value.trim()     || null;
    const tempo    = document.getElementById('cef-tempo').value.trim()    || null;
    const rest     = parseInt(document.getElementById('cef-rest').value, 10)  || null;
    const cue      = document.getElementById('cef-cue').value.trim()      || null;

    const saveBtn = document.getElementById('cef-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    const { data: inserted, error: insertErr } = await supabase
      .from('exercises')
      .insert({
        name,
        category,
        equipment,
        muscle_group:      muscle,
        movement_pattern:  movement,
        default_sets:      sets,
        default_reps:      reps,
        default_tempo:     tempo,
        default_rest_sec:  rest,
        coaching_cue:      cue,
        trainer_id:        trainerId,   // scoped to this trainer — never NULL
        is_glp1_approved:  false,       // trainer-custom exercises do not claim clinical approval
        is_archived:       false,
      })
      .select('id, name, category, equipment, trainer_id')
      .single();

    if (insertErr) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save & Add to Day';
      window.iron.showToast(`Save failed: ${insertErr.message}`, 'error');
      return;
    }

    window.iron.showToast(`"${name}" created.`, 'success');

    // Prepend new exercise to in-memory list and re-render picker with it pinned at top
    allExercises = [inserted, ...allExercises];
    if (searchWrap) searchWrap.style.display = '';
    if (createBtn)  createBtn.style.display  = '';
    renderExercisePicker(allExercises, dayId, inserted.id);
  });
}

// ── Prescription Panel ─────────────────────────────────

async function openPrescriptionPanel(exerciseId, dayId, existingPde = null) {
  // Look up exercise name
  let exerciseName = existingPde?.exercises?.name ?? null;
  if (!exerciseName) {
    const { data } = await supabase
      .from('exercises')
      .select('name')
      .eq('id', exerciseId)
      .single();
    exerciseName = data?.name ?? 'Exercise';
  }

  const v = (f, fb = '') => escHtml(existingPde?.[f] ?? fb);

  const bodyHtml = `
    <p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:16px;">${escHtml(exerciseName)}</p>
    <form id="prescription-form" novalidate>
      <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group" style="margin:0;">
          <label for="pf-sets">Sets <span class="req">*</span></label>
          <input type="number" id="pf-sets" min="1" max="20"
                 value="${existingPde?.prescribed_sets ?? ''}" placeholder="4" required>
          <span class="field-error" id="err-pf-sets" style="display:none;" role="alert"></span>
        </div>
        <div class="form-group" style="margin:0;">
          <label for="pf-reps">Reps <span class="req">*</span></label>
          <input type="text" id="pf-reps" value="${v('prescribed_reps')}"
                 placeholder="8-10" required>
          <span class="field-error" id="err-pf-reps" style="display:none;" role="alert"></span>
        </div>
        <div class="form-group" style="margin:0;">
          <label for="pf-tempo">Tempo</label>
          <input type="text" id="pf-tempo" value="${v('prescribed_tempo')}" placeholder="3-1-1">
        </div>
        <div class="form-group" style="margin:0;">
          <label for="pf-rest">Rest (seconds)</label>
          <input type="number" id="pf-rest" min="0" max="600"
                 value="${existingPde?.prescribed_rest_sec ?? ''}" placeholder="120">
        </div>
      </div>
      <div class="form-group">
        <label for="pf-cue">Coaching Cue</label>
        <textarea id="pf-cue" rows="2"
                  placeholder="Override or supplement default cue">${v('coaching_cue')}</textarea>
      </div>
    </form>
  `;
  const footerHtml = `
    <button class="btn btn-secondary" onclick="window.iron.closePanel()">Cancel</button>
    <button class="btn btn-primary" id="pf-save-btn">${existingPde ? 'Save Changes' : 'Add Exercise'}</button>
  `;
  const panelTitle = existingPde
    ? `Edit: ${exerciseName}`
    : `Prescribe: ${exerciseName}`;

  window.iron.openPanel(panelTitle, bodyHtml, footerHtml);

  document.getElementById('pf-save-btn').addEventListener('click', async () => {
    const sets = parseInt(document.getElementById('pf-sets').value, 10);
    const reps = document.getElementById('pf-reps').value.trim();
    let valid  = true;

    document.getElementById('pf-sets').classList.remove('input-error');
    document.getElementById('pf-reps').classList.remove('input-error');
    document.getElementById('err-pf-sets').style.display = 'none';
    document.getElementById('err-pf-reps').style.display = 'none';

    if (!sets || sets < 1) {
      document.getElementById('pf-sets').classList.add('input-error');
      const e = document.getElementById('err-pf-sets');
      e.textContent = 'Sets required (min 1).';
      e.style.display = '';
      valid = false;
    }
    if (!reps) {
      document.getElementById('pf-reps').classList.add('input-error');
      const e = document.getElementById('err-pf-reps');
      e.textContent = 'Reps required (e.g., 8-10).';
      e.style.display = '';
      valid = false;
    }
    if (!valid) return;

    const btn = document.getElementById('pf-save-btn');
    btn.disabled    = true;
    btn.textContent = 'Saving…';

    const payload = {
      program_day_id:     dayId,
      exercise_id:        exerciseId,
      prescribed_sets:    sets,
      prescribed_reps:    reps,
      prescribed_tempo:   document.getElementById('pf-tempo').value.trim() || null,
      prescribed_rest_sec:parseInt(document.getElementById('pf-rest').value, 10) || null,
      coaching_cue:       document.getElementById('pf-cue').value.trim()   || null,
    };

    let resultData, saveError;

    if (existingPde) {
      const { data, error } = await supabase
        .from('program_day_exercises')
        .update(payload)
        .eq('id', existingPde.id)
        .select(`id, sort_order, prescribed_sets, prescribed_reps, prescribed_tempo, prescribed_rest_sec, coaching_cue, exercise_id, exercises(id, name, category)`)
        .single();
      resultData = data;
      saveError  = error;
    } else {
      const day    = programDays.find(d => d.id === dayId);
      const nextSo = day
        ? Math.max(0, ...day.program_day_exercises.map(e => e.sort_order)) + 1
        : 0;
      payload.sort_order = nextSo;
      const { data, error } = await supabase
        .from('program_day_exercises')
        .insert([payload])
        .select(`id, sort_order, prescribed_sets, prescribed_reps, prescribed_tempo, prescribed_rest_sec, coaching_cue, exercise_id, exercises(id, name, category)`)
        .single();
      resultData = data;
      saveError  = error;
    }

    if (saveError) {
      window.iron.showToast(`Save failed: ${saveError.message}`, 'error');
      btn.disabled    = false;
      btn.textContent = existingPde ? 'Save Changes' : 'Add Exercise';
      return;
    }

    // Update local state
    const dayIdx = programDays.findIndex(d => d.id === dayId);
    if (dayIdx !== -1) {
      if (existingPde) {
        const exIdx = programDays[dayIdx].program_day_exercises.findIndex(e => e.id === existingPde.id);
        if (exIdx !== -1) programDays[dayIdx].program_day_exercises[exIdx] = resultData;
      } else {
        programDays[dayIdx].program_day_exercises.push(resultData);
      }
    }

    window.iron.closePanel();
    window.iron.showToast(existingPde ? 'Exercise updated.' : 'Exercise added.', 'success');
    refreshDaysContainer();
  });
}

function openEditExercisePanel(pdeId, dayId) {
  const day = programDays.find(d => d.id === dayId);
  const pde = day?.program_day_exercises.find(e => e.id === pdeId);
  if (!pde) return;
  openPrescriptionPanel(pde.exercise_id, dayId, pde);
}

// ── Remove Exercise ────────────────────────────────────

function removeExerciseConfirm(pdeId, dayId) {
  const day  = programDays.find(d => d.id === dayId);
  const pde  = day?.program_day_exercises.find(e => e.id === pdeId);
  const name = pde?.exercises?.name ?? 'this exercise';

  window.iron.confirmDialog(
    `Remove "${name}" from this day?`,
    async () => {
      const { error } = await supabase
        .from('program_day_exercises')
        .delete()
        .eq('id', pdeId);
      if (error) {
        window.iron.showToast(`Remove failed: ${error.message}`, 'error');
        return;
      }
      const dayIdx = programDays.findIndex(d => d.id === dayId);
      if (dayIdx !== -1) {
        programDays[dayIdx].program_day_exercises =
          programDays[dayIdx].program_day_exercises.filter(e => e.id !== pdeId);
      }
      window.iron.showToast('Exercise removed.', 'success');
      refreshDaysContainer();
    },
    'Remove'
  );
}

// ── Local helpers ──────────────────────────────────────

function formatRestSec(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0
    ? s > 0 ? `${m}m${s}s` : `${m}m`
    : `${s}s`;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
