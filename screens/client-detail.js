/**
 * Iron Platform — Trainer Portal
 * screens/client-detail.js — Client Detail View (Screen 6)
 *
 * Renders:
 *  - Header: name + GLP-1 badge + back + edit button
 *  - Profile row: status, on_glp1, primary_goal, age, biological_sex
 *  - 4 stat tiles: compliance %, workouts, avg duration, last workout
 *  - Current Program section
 *  - Workout History (last 30d default, expandable rows, date range filter)
 *  - Physician Reports placeholder
 *  - PWA link if no workouts logged yet
 *
 * @param {string} clientId  UUID from the #client/<id> hash route.
 */

import { supabase, requireSession } from '../portal.js';

// ── Configuration ──────────────────────────────────────
// Base URL for the client-facing PWA. Override per-deployment by setting
// `window.IRON_PWA_BASE_URL = 'https://your-fork.example.com/iron-pwa/'` in
// portal.html before the portal.js module loads. Trailing slash optional.
const IRON_PWA_BASE_URL =
  (typeof window !== 'undefined' && window.IRON_PWA_BASE_URL) ||
  'https://wmw561.github.io/iron-pwa/';

// ── Module state ───────────────────────────────────────
let currentClient    = null;
let workoutSessions  = [];        // All sessions for current range
let expandedSessions = new Set(); // session IDs with expanded set-level detail
let currentRange     = '30d';     // '30d' | '90d' | 'all'

// ── Entry point ────────────────────────────────────────

export async function renderClientDetail(clientId) {
  currentClient    = null;
  workoutSessions  = [];
  expandedSessions = new Set();
  currentRange     = '30d';

  const section = document.getElementById('view-client-detail');

  section.innerHTML = `
    <div class="loading-state" style="margin-top:48px;">
      <div class="spinner"></div>
      <span>Loading client…</span>
    </div>
  `;

  // Hardening pass 2026-05-06 — see
  // docs/specs/iron-portal-auth-fragility-diagnosis.md (recommendation b).
  // Use the central requireSession() gate instead of a raw supabase.auth.getUser()
  // here; on expired / unreachable, it surfaces the banner and we bail out
  // rather than rendering a "Client not found" empty state that masks an
  // auth failure as a data failure.
  const auth = await requireSession();
  if (auth.state !== 'valid') {
    section.innerHTML = '';
    return;
  }
  const trainerId = auth.user.id;

  // Fetch client profile
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('trainer_id', trainerId)
    .single();

  if (clientErr || !client) {
    section.innerHTML = `
      <div class="empty-state" style="margin-top:40px;">
        <div class="empty-icon">⚠</div>
        <h3>Client not found</h3>
        <p>This client may have been removed or you don't have access.</p>
        <a href="#clients" class="btn btn-secondary">← Back to Clients</a>
      </div>
    `;
    return;
  }

  currentClient = client;
  await renderFullDetail();
}

// ── Full detail render ─────────────────────────────────

async function renderFullDetail() {
  const section = document.getElementById('view-client-detail');
  const client  = currentClient;

  // Fetch active assignment + sessions in parallel
  const [assignResult, sessionsResult] = await Promise.all([
    fetchActiveAssignment(client.id),
    fetchSessions(client.id, currentRange),
  ]);

  workoutSessions = sessionsResult ?? [];

  const activeAssignment = assignResult;

  // ── Stat computations ────────────────────────────────
  const stats = computeStats(workoutSessions, activeAssignment);

  // ── Protein adherence (subtle ambient signal — last 7 days) ─────────
  // Constraint: NO tile, NO chart, NO drill-down, NO call-to-action.
  // Single secondary-text line in the profile row. Trainer sees it if they look.
  const proteinAdherence = await fetchProteinAdherence(client.id);

  // ── Age ───────────────────────────────────────────────
  const age = computeAge(client.date_of_birth);

  // ── Render ────────────────────────────────────────────
  section.innerHTML = `
    <!-- Header -->
    <div class="page-header" style="flex-wrap:wrap;gap:8px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <a href="#clients" class="btn btn-ghost btn-sm" aria-label="Back to clients">← Clients</a>
        <div>
          <h1 style="display:flex;align-items:center;gap:8px;">
            ${escHtml(client.full_name)}
            ${client.on_glp1 ? `<span class="glp1-badge" title="GLP-1 patient">💊</span>` : ''}
          </h1>
          <div class="page-subtitle">Client Detail</div>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" id="btn-edit-client-detail">Edit</button>
      </div>
    </div>

    <!-- Profile row -->
    <div class="profile-row card" style="margin-bottom:20px;">
      <div class="card-body" style="display:flex;flex-wrap:wrap;gap:16px;">
        ${profilePill('Status',  capitalize(client.status), client.status === 'active' ? 'ok' : 'muted')}
        ${client.on_glp1    ? profilePill('GLP-1',   'Yes 💊',         'teal')  : ''}
        ${client.primary_goal ? profilePill('Goal',   escHtml(client.primary_goal), null) : ''}
        ${profilePill('Age',            age,                               null)}
        ${client.biological_sex ? profilePill('Sex', capitalize(client.biological_sex), null) : ''}
      </div>
      <!-- Protein adherence: deliberately ambient — secondary text, no chart, no CTA. -->
      <div style="padding:0 16px 12px;font-size:0.8rem;color:var(--text-muted);">
        ${proteinAdherence}
      </div>
    </div>

    <!-- Stat Tiles -->
    <div class="stat-grid" style="margin-bottom:24px;">
      <div class="stat-tile ${stats.complianceClass}">
        <div class="stat-label">Compliance</div>
        <div class="stat-value">${stats.compliancePct}</div>
        <div class="stat-sub">Sessions (30d)</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Workouts</div>
        <div class="stat-value">${stats.workoutsLabel}</div>
        <div class="stat-sub">Logged / prescribed (30d)</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Avg Duration</div>
        <div class="stat-value">${stats.avgDuration}</div>
        <div class="stat-sub">Completed sessions (30d)</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Last Workout</div>
        <div class="stat-value" style="font-size:1.2rem;">${stats.lastWorkout}</div>
        <div class="stat-sub">Most recent completed</div>
      </div>
    </div>

    <!-- Current Program -->
    <div class="card" style="margin-bottom:24px;">
      <div class="card-body">
        <h2 class="section-title">Current Program</h2>
        ${renderCurrentProgram(activeAssignment, client.id)}
      </div>
    </div>

    <!-- Workout History -->
    <div class="card" style="margin-bottom:24px;">
      <div class="card-body">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
          <h2 class="section-title" style="margin:0;">Workout History</h2>
          <select id="history-range" class="form-select" style="width:auto;font-size:0.85rem;" aria-label="Date range filter">
            <option value="30d"  ${currentRange === '30d'  ? 'selected' : ''}>Last 30 days</option>
            <option value="90d"  ${currentRange === '90d'  ? 'selected' : ''}>Last 90 days</option>
            <option value="all"  ${currentRange === 'all'  ? 'selected' : ''}>All time</option>
          </select>
        </div>
        <div id="history-list">
          ${renderHistoryList()}
        </div>
      </div>
    </div>

    <!-- Physician Reports (Phase 2 placeholder) -->
    <div class="card" style="margin-bottom:40px;">
      <div class="card-body">
        <h2 class="section-title">Physician Reports</h2>
        <div class="empty-state" style="padding:24px 12px;">
          <div class="empty-icon" style="font-size:1.5rem;">🩺</div>
          <p style="color:var(--text-muted);font-size:0.9rem;">
            Physician reports activate in Phase 2 (Pro tier feature).
          </p>
        </div>
      </div>
    </div>
  `;

  // ── Bind events ────────────────────────────────────────
  document.getElementById('btn-edit-client-detail').addEventListener('click', () => {
    openEditClientDetailPanel(currentClient);
  });

  document.getElementById('history-range').addEventListener('change', async (e) => {
    currentRange    = e.target.value;
    expandedSessions = new Set();
    const sessions  = await fetchSessions(currentClient.id, currentRange);
    workoutSessions = sessions ?? [];
    document.getElementById('history-list').innerHTML = renderHistoryList();
    bindHistoryRowEvents();
  });

  bindHistoryRowEvents();
}

// ── Current Program section ────────────────────────────

function renderCurrentProgram(assignment, clientId) {
  if (!assignment) {
    return `
      <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:12px;">No active program assigned.</p>
      <a href="#assign?client=${clientId}" class="btn btn-primary btn-sm">Assign Program</a>
    `;
  }

  const weekNum   = computeWeekNumber(assignment.start_date);
  const totalWeeks = assignment.program_templates?.duration_weeks;
  const weekLabel = totalWeeks
    ? `Week ${weekNum} of ${totalWeeks}`
    : `Week ${weekNum}`;
  const endLabel  = assignment.end_date
    ? `Ends ${window.iron.formatDate(assignment.end_date)}`
    : 'Open-ended';

  return `
    <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;">
      <div>
        <div style="font-weight:600;font-size:1rem;">${escHtml(assignment.program_templates?.name ?? '—')}</div>
        <div class="cell-secondary" style="margin-top:2px;">${weekLabel} · ${escHtml(endLabel)}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <a href="#programs" class="btn btn-ghost btn-sm">View Program</a>
        <a href="#assign?client=${clientId}" class="btn btn-secondary btn-sm">Change Program</a>
      </div>
    </div>
  `;
}

// ── Workout History list ───────────────────────────────

function renderHistoryList() {
  if (!workoutSessions.length) {
    const client = currentClient;
    // Show PWA token link as copyable
    const base = IRON_PWA_BASE_URL.endsWith('/') ? IRON_PWA_BASE_URL : IRON_PWA_BASE_URL + '/';
    const pwaUrl = `${base}?token=${encodeURIComponent(client.pwa_access_token ?? '')}`;
    return `
      <div class="empty-state" style="padding:24px 12px;">
        <div class="empty-icon" style="font-size:1.5rem;">🏋️</div>
        <p style="color:var(--text-muted);font-size:0.9rem;">
          No workouts logged yet. ${escHtml(client.full_name)} can begin by opening their PWA link.
        </p>
        <div style="display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap;">
          <code id="pwa-url-display" style="font-size:0.75rem;background:var(--bg);padding:6px 10px;border-radius:4px;border:1px solid var(--border);word-break:break-all;">${escHtml(pwaUrl)}</code>
          <button class="btn btn-secondary btn-sm" id="btn-copy-pwa-url" aria-label="Copy PWA link">
            Copy Link
          </button>
        </div>
      </div>
    `;
  }

  return workoutSessions.map(s => renderSessionRow(s)).join('');
}

function renderSessionRow(session) {
  const isExpanded   = expandedSessions.has(session.id);
  const isInProgress = session.status === 'in_progress';
  const dayLabel     = session.program_days?.label ?? (session.is_free_workout ? 'Free Workout' : '—');
  const durationMin  = session.duration_sec
    ? Math.round(session.duration_sec / 60)
    : null;
  const totalSets    = session.total_sets ?? '—';
  const volumeLbs    = session.total_volume_lbs
    ? `${Number(session.total_volume_lbs).toLocaleString()}lbs`
    : '—';
  const statusIcon   = isInProgress
    ? `<span style="color:var(--warning);font-size:0.85rem;" title="In progress">● Live</span>`
    : `<span style="color:var(--ok);font-size:0.85rem;" title="Completed">✓</span>`;

  const detailHtml = isExpanded ? renderSessionDetail(session) : '';

  return `
    <div class="session-row" data-session-id="${session.id}" style="border-bottom:1px solid var(--border);">
      <div class="table-row"
           style="cursor:pointer;align-items:center;"
           tabindex="0" role="button"
           aria-expanded="${isExpanded}"
           aria-label="${escHtml(dayLabel)} on ${window.iron.formatDate(session.started_at)}"
           data-toggle-session="${session.id}"
           onkeydown="if(event.key==='Enter'||event.key===' ')this.click()">
        <div style="flex:0 0 auto;width:18px;">${statusIcon}</div>
        <div style="flex:1;min-width:0;">
          <span style="font-weight:500;font-size:0.9rem;">${escHtml(dayLabel)}</span>
        </div>
        <div class="cell-secondary" style="flex:0 0 auto;text-align:right;margin-right:8px;">
          ${window.iron.formatRelative(session.started_at)}
        </div>
        <div class="cell-secondary" style="flex:0 0 auto;text-align:right;margin-right:8px;">
          ${durationMin != null ? `${durationMin}min` : '—'}
        </div>
        <div class="cell-secondary" style="flex:0 0 auto;text-align:right;margin-right:8px;">
          ${escHtml(String(totalSets))} sets
        </div>
        <div class="cell-secondary" style="flex:0 0 auto;text-align:right;margin-right:8px;">
          ${escHtml(volumeLbs)}
        </div>
        <div style="flex:0 0 auto;color:var(--text-muted);">${isExpanded ? '▲' : '▼'}</div>
      </div>
      ${detailHtml}
    </div>
  `;
}

function renderSessionDetail(session) {
  const logs = session._exerciseLogs;

  if (!logs) {
    // Show loading state; actual data is fetched lazily on expand
    return `
      <div id="session-detail-${session.id}" style="padding:8px 16px 12px;">
        <div class="loading-state" style="justify-content:flex-start;gap:8px;">
          <div class="spinner" style="width:16px;height:16px;"></div>
          <span style="font-size:0.85rem;">Loading sets…</span>
        </div>
      </div>
    `;
  }

  if (!logs.length) {
    return `
      <div id="session-detail-${session.id}" style="padding:8px 16px 12px;">
        <p style="color:var(--text-muted);font-size:0.85rem;">No exercise logs recorded.</p>
      </div>
    `;
  }

  const exerciseBlocks = logs.map(log => {
    const exName = log.exercises?.name ?? '[deleted exercise]';
    const sets   = log.set_logs ?? [];
    const setsHtml = sets.length > 0
      ? sets.map(sl => {
          const weight  = (sl.weight_lbs === 0 || sl.weight_lbs === null)
            ? 'BW'
            : `${sl.weight_lbs}lbs`;
          const reps    = sl.reps_completed != null ? sl.reps_completed : '—';
          const setType = sl.set_type !== 'working' ? ` <span style="font-size:0.7rem;color:var(--text-muted);">${escHtml(sl.set_type)}</span>` : '';
          const prescribed = sl.prescribed_reps
            ? ` <span style="color:var(--text-muted);font-size:0.75rem;">(pres. ${escHtml(sl.prescribed_reps)})</span>`
            : '';
          return `<div style="font-size:0.82rem;padding:2px 0;">
            Set ${sl.set_number}: ${escHtml(weight)} × ${reps}${setType}${prescribed}
          </div>`;
        }).join('')
      : `<div style="font-size:0.82rem;color:var(--text-muted);">No sets logged.</div>`;

    return `
      <div style="margin-bottom:10px;">
        <div style="font-weight:500;font-size:0.88rem;">${escHtml(exName)}</div>
        <div style="padding-left:8px;">${setsHtml}</div>
      </div>
    `;
  }).join('');

  return `
    <div id="session-detail-${session.id}" style="padding:8px 16px 16px;background:var(--bg);border-top:1px solid var(--border);">
      ${exerciseBlocks}
    </div>
  `;
}

// ── Bind history row click events ──────────────────────

function bindHistoryRowEvents() {
  const historyList = document.getElementById('history-list');
  if (!historyList) return;

  // Remove old listener by replacing node — safer for dynamic re-renders
  historyList.addEventListener('click', handleHistoryClick);

  // PWA copy button (only exists in empty state)
  const copyBtn = document.getElementById('btn-copy-pwa-url');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const url = document.getElementById('pwa-url-display')?.textContent?.trim();
      if (url) {
        navigator.clipboard.writeText(url).then(() => {
          window.iron.showToast('PWA link copied to clipboard.', 'success');
        }).catch(() => {
          window.iron.showToast('Copy failed — please copy the link manually.', 'error');
        });
      }
    });
  }
}

async function handleHistoryClick(e) {
  const toggleEl = e.target.closest('[data-toggle-session]');
  if (!toggleEl) return;

  const sessionId = toggleEl.dataset.toggleSession;

  if (expandedSessions.has(sessionId)) {
    expandedSessions.delete(sessionId);
    // Re-render just this row
    const session = workoutSessions.find(s => s.id === sessionId);
    if (session) {
      const rowEl = document.querySelector(`.session-row[data-session-id="${sessionId}"]`);
      if (rowEl) rowEl.outerHTML = renderSessionRow(session);
    }
    return;
  }

  expandedSessions.add(sessionId);

  // Fetch exercise logs + set logs lazily
  const session = workoutSessions.find(s => s.id === sessionId);
  if (!session) return;

  // Show loading detail immediately
  const rowEl = document.querySelector(`.session-row[data-session-id="${sessionId}"]`);
  if (rowEl) rowEl.outerHTML = renderSessionRow(session);

  // Fetch data
  const { data: exLogs, error } = await supabase
    .from('workout_exercise_logs')
    .select(`
      id, sort_order, exercise_id,
      exercises ( id, name ),
      set_logs ( id, set_number, weight_lbs, reps_completed, prescribed_reps, set_type, logged_at )
    `)
    .eq('session_id', sessionId)
    .order('sort_order', { ascending: true });

  if (error) {
    const detailEl = document.getElementById(`session-detail-${sessionId}`);
    if (detailEl) {
      detailEl.innerHTML = `<p style="color:var(--alert);font-size:0.85rem;">Failed to load: ${escHtml(error.message)}</p>`;
    }
    return;
  }

  // Sort set_logs by set_number within each exercise
  const normalised = (exLogs ?? []).map(el => ({
    ...el,
    set_logs: (el.set_logs ?? []).slice().sort((a, b) => a.set_number - b.set_number),
  }));

  // Attach to session for caching
  session._exerciseLogs = normalised;

  // Re-render the expanded row with real data
  const updatedRowEl = document.querySelector(`.session-row[data-session-id="${sessionId}"]`);
  if (updatedRowEl) updatedRowEl.outerHTML = renderSessionRow(session);
}

// ── Data loaders ───────────────────────────────────────

// ── Protein adherence (last 7 days) ────────────────────
// Subtle ambient signal only. Returns a short text line, not a component tree.
// Adherence = sum(actual grams over last 7 days) / sum(target grams over last 7 days),
// capped at 100%. If no logs exist, return "Protein logging not started" rather
// than 0% (avoids implying failure).
async function fetchProteinAdherence(clientId) {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: logs }, { data: c }] = await Promise.all([
      supabase.from('protein_logs')
        .select('grams, logged_at')
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .gte('logged_at', sevenDaysAgo),
      supabase.from('clients')
        .select('protein_target_coefficient, protein_target_override_grams, current_weight_lbs')
        .eq('id', clientId)
        .single(),
    ]);

    if (!logs || logs.length === 0) return 'Protein logging not started';

    const target = c?.protein_target_override_grams != null
      ? Number(c.protein_target_override_grams)
      : (c?.current_weight_lbs != null
          ? Number(c.current_weight_lbs) * Number(c?.protein_target_coefficient ?? 1.0)
          : null);
    if (!target) return `Protein: ${logs.length} meals logged (last 7d) — no target set`;

    const total = logs.reduce((s, r) => s + Number(r.grams), 0);
    const pct = Math.min(100, Math.round((total / (target * 7)) * 100));
    return `Protein adherence (last 7 days): ${pct}%`;
  } catch (e) {
    console.warn('[ClientDetail] fetchProteinAdherence failed', e);
    return '';
  }
}

async function fetchActiveAssignment(clientId) {
  // Hardening pass 2026-05-06 — reuse the cached requireSession() result so
  // expired/unreachable sessions don't silently filter to zero rows here.
  const auth = await requireSession();
  if (auth.state !== 'valid') return null;
  const trainerId = auth.user.id;

  const { data } = await supabase
    .from('program_assignments')
    .select(`
      id, start_date, end_date, status, trainer_notes,
      program_templates ( id, name, duration_weeks, days_per_week, focus )
    `)
    .eq('client_id', clientId)
    .eq('trainer_id', trainerId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

async function fetchSessions(clientId, range) {
  // Hardening pass 2026-05-06 — reuse the cached requireSession() result.
  const auth = await requireSession();
  if (auth.state !== 'valid') return [];
  const trainerId = auth.user.id;

  let query = supabase
    .from('workout_sessions')
    .select(`
      id, started_at, completed_at, duration_sec, status,
      total_sets, total_volume_lbs, is_free_workout,
      program_days ( id, label )
    `)
    .eq('client_id', clientId)
    .eq('trainer_id', trainerId)
    .order('started_at', { ascending: false })
    .limit(100);

  if (range === '30d') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    query = query.gte('started_at', cutoff.toISOString());
  } else if (range === '90d') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    query = query.gte('started_at', cutoff.toISOString());
  }

  const { data, error } = await query;
  if (error) {
    window.iron.showToast(`Could not load workouts: ${error.message}`, 'error');
    return [];
  }
  return data ?? [];
}

// ── Stat computation ───────────────────────────────────

function computeStats(sessions, assignment) {
  const completed = sessions.filter(s => s.status === 'completed');

  // Compliance % — completed sessions vs. prescribed in last 30d
  // Prescribed = days_per_week * (days in range / 7), clamped to reasonable value
  let compliancePct   = '—';
  let complianceClass = '';
  if (assignment?.program_templates?.days_per_week) {
    const dpw       = assignment.program_templates.days_per_week;
    const prescribed = Math.round(dpw * (30 / 7));
    const logged     = completed.length;
    if (prescribed > 0) {
      const rate = Math.round((logged / prescribed) * 100);
      compliancePct   = `${rate}%`;
      complianceClass = rate >= 80 ? 'ok-tile' : rate < 60 ? 'alert-tile' : '';
    }
  }

  // Workouts label: "X / Y" (logged / prescribed)
  let workoutsLabel = String(completed.length);
  if (assignment?.program_templates?.days_per_week) {
    const dpw        = assignment.program_templates.days_per_week;
    const prescribed = Math.round(dpw * (30 / 7));
    workoutsLabel    = `${completed.length} / ${prescribed}`;
  }

  // Avg duration
  const completedWithDuration = completed.filter(s => s.duration_sec && s.duration_sec > 0);
  let avgDuration = '—';
  if (completedWithDuration.length) {
    const avgSec = completedWithDuration.reduce((s, ws) => s + ws.duration_sec, 0)
                 / completedWithDuration.length;
    avgDuration  = `${Math.round(avgSec / 60)}min`;
  }

  // Last workout (most recent completed)
  const lastCompleted = completed[0]; // sessions are sorted DESC
  const lastWorkout   = lastCompleted
    ? window.iron.formatRelative(lastCompleted.completed_at || lastCompleted.started_at)
    : '—';

  return { compliancePct, complianceClass, workoutsLabel, avgDuration, lastWorkout };
}

// ── Edit Client Panel (reuses clients.js style inline) ─

function openEditClientDetailPanel(client) {
  const v       = (field, fb = '') => escHtml(client?.[field] ?? fb);
  const checked = (field) => client?.[field] ? 'checked' : '';
  const sel     = (field, value) => (client?.[field] === value) ? 'selected' : '';

  const bodyHtml = `
    <form id="cd-edit-form" novalidate>
      <div class="form-group">
        <label for="cd-full-name">Full Name <span class="req">*</span></label>
        <input type="text" id="cd-full-name" value="${v('full_name')}" required placeholder="Jane Smith">
        <span class="field-error" id="err-cd-name" style="display:none;" role="alert"></span>
      </div>
      <div class="form-group">
        <label for="cd-email">Email</label>
        <input type="email" id="cd-email" value="${v('email')}" placeholder="jane@example.com">
      </div>
      <div class="form-group">
        <label for="cd-phone">Phone</label>
        <input type="tel" id="cd-phone" value="${v('phone')}">
      </div>
      <div class="form-group">
        <label for="cd-dob">Date of Birth</label>
        <input type="date" id="cd-dob" value="${v('date_of_birth')}">
      </div>
      <div class="form-group">
        <label for="cd-bio-sex">Biological Sex</label>
        <select id="cd-bio-sex">
          <option value="">Select…</option>
          <option value="male"              ${sel('biological_sex','male')}>Male</option>
          <option value="female"            ${sel('biological_sex','female')}>Female</option>
          <option value="other"             ${sel('biological_sex','other')}>Other</option>
          <option value="prefer_not_to_say" ${sel('biological_sex','prefer_not_to_say')}>Prefer not to say</option>
        </select>
      </div>
      <div class="form-group">
        <label for="cd-goal">Primary Goal</label>
        <input type="text" id="cd-goal" value="${v('primary_goal')}" placeholder="e.g., muscle preservation">
      </div>
      <div class="form-group">
        <div class="checkbox-row">
          <input type="checkbox" id="cd-glp1" ${checked('on_glp1')}>
          <label for="cd-glp1">GLP-1 patient 💊</label>
        </div>
      </div>
      <div class="form-group" id="cd-glp1-date-group" style="${client.on_glp1 ? '' : 'display:none;'}">
        <label for="cd-glp1-start">GLP-1 Start Date</label>
        <input type="date" id="cd-glp1-start" value="${v('glp1_start_date')}">
      </div>
      <div class="form-group">
        <label for="cd-status">Status</label>
        <select id="cd-status">
          <option value="active"   ${sel('status','active')}>Active</option>
          <option value="paused"   ${sel('status','paused')}>Paused</option>
          <option value="inactive" ${sel('status','inactive')}>Inactive</option>
        </select>
      </div>
      <div class="form-group">
        <label for="cd-notes">Notes</label>
        <textarea id="cd-notes" rows="3">${escHtml(client.notes ?? '')}</textarea>
      </div>
    </form>
  `;
  const footerHtml = `
    <button class="btn btn-secondary" onclick="window.iron.closePanel()">Cancel</button>
    <button class="btn btn-primary" id="cd-save-btn">Save Changes</button>
  `;
  window.iron.openPanel(`Edit: ${client.full_name}`, bodyHtml, footerHtml);

  // GLP-1 toggle
  const glp1Check = document.getElementById('cd-glp1');
  glp1Check.addEventListener('change', () => {
    document.getElementById('cd-glp1-date-group').style.display =
      glp1Check.checked ? '' : 'none';
  });

  document.getElementById('cd-save-btn').addEventListener('click', async () => {
    const fullName = document.getElementById('cd-full-name').value.trim();
    const errEl    = document.getElementById('err-cd-name');
    if (!fullName) {
      document.getElementById('cd-full-name').classList.add('input-error');
      errEl.textContent = 'Full name is required.';
      errEl.style.display = '';
      document.getElementById('cd-full-name').focus();
      return;
    }
    document.getElementById('cd-full-name').classList.remove('input-error');
    errEl.style.display = 'none';

    const saveBtn = document.getElementById('cd-save-btn');
    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';

    // Hardening pass 2026-05-06 — reuse cached requireSession() result.
    const auth = await requireSession();
    if (auth.state !== 'valid') {
      window.iron.showToast('Your session expired. Please sign in again.', 'error');
      return;
    }
    const trainerId = auth.user.id;
    const onGlp1    = document.getElementById('cd-glp1').checked;

    const payload = {
      full_name:       fullName,
      email:           document.getElementById('cd-email').value.trim()    || null,
      phone:           document.getElementById('cd-phone').value.trim()    || null,
      date_of_birth:   document.getElementById('cd-dob').value             || null,
      biological_sex:  document.getElementById('cd-bio-sex').value         || null,
      primary_goal:    document.getElementById('cd-goal').value.trim()     || null,
      on_glp1:         onGlp1,
      glp1_start_date: onGlp1
        ? (document.getElementById('cd-glp1-start').value || null)
        : null,
      status:          document.getElementById('cd-status').value,
      notes:           document.getElementById('cd-notes').value.trim()    || null,
      updated_at:      new Date().toISOString(),
    };

    const { error } = await supabase
      .from('clients')
      .update(payload)
      .eq('id', currentClient.id)
      .eq('trainer_id', trainerId);

    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save Changes';

    if (error) {
      window.iron.showToast(`Save failed: ${error.message}`, 'error');
      return;
    }

    // Update local state + re-render
    Object.assign(currentClient, payload);
    window.iron.closePanel();
    window.iron.showToast('Client updated.', 'success');
    await renderFullDetail();
  });
}

// ── Helpers ────────────────────────────────────────────

function computeAge(dob) {
  if (!dob) return '—';
  try {
    const birthDate = new Date(dob);
    const today     = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age >= 0 ? String(age) : '—';
  } catch (_) {
    return '—';
  }
}

function computeWeekNumber(startDateIso) {
  if (!startDateIso) return 1;
  try {
    const start = new Date(startDateIso);
    const today = new Date();
    const diffMs = today.getTime() - start.getTime();
    if (diffMs < 0) return 1;
    return Math.floor(diffMs / (7 * 86_400_000)) + 1;
  } catch (_) {
    return 1;
  }
}

function profilePill(label, value, colorKey) {
  const colorStyle = colorKey === 'ok'   ? 'color:var(--ok);'
                   : colorKey === 'teal' ? 'color:var(--teal);'
                   : colorKey === 'muted' ? 'color:var(--text-muted);'
                   : '';
  return `
    <div style="display:flex;flex-direction:column;gap:2px;">
      <span style="font-size:0.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);">${escHtml(label)}</span>
      <span style="font-size:0.9rem;font-weight:500;${colorStyle}">${value ?? '—'}</span>
    </div>
  `;
}

function capitalize(str) {
  if (!str) return '—';
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
