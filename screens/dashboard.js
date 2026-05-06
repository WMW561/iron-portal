/**
 * Iron Platform — Trainer Portal
 * screens/dashboard.js — Dashboard (Screen 1)
 *
 * Renders:
 *  - Greeting + week label
 *  - 3 stat tiles: active clients, workouts this week, 30-day compliance
 *  - Alerts list (inactive >7d, programs ending <5d)
 *  - Recent activity feed (last 10 completed sessions)
 *  - Quick action buttons
 */

import { supabase } from '../portal.js';

export async function renderDashboard() {
  const section = document.getElementById('view-dashboard');
  const trainer = window.iron.trainer;

  // ── Greeting ─────────────────────────────────────────────
  const firstName = trainer?.full_name?.split(' ')[0] ?? 'there';
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? 'Good morning' :
    hour < 17 ? 'Good afternoon' :
                'Good evening';

  const weekStart = getWeekStart(now);
  const weekEnd   = getWeekEnd(now);
  const weekLabel = `Week of ${fmt(weekStart)} – ${fmtDay(weekEnd)}`;

  // ── Loading skeleton ─────────────────────────────────────
  section.innerHTML = `
    <div class="greeting-block">
      <h2>${greeting}, ${escHtml(firstName)}</h2>
      <div class="week-label">${weekLabel}</div>
    </div>
    <div class="loading-state">
      <div class="spinner"></div>
      <span>Loading your dashboard…</span>
    </div>
  `;

  // ── Fetch all data in parallel ────────────────────────────
  const [activeClients, workoutsThisWeek, complianceData, alerts, recentActivity] =
    await Promise.all([
      fetchActiveClients(),
      fetchWorkoutsThisWeek(),
      fetchComplianceRate(),
      fetchAlerts(),
      fetchRecentActivity(),
    ]);

  // ── Render ────────────────────────────────────────────────
  section.innerHTML = `
    <div class="greeting-block">
      <h2>${greeting}, ${escHtml(firstName)}</h2>
      <div class="week-label">${weekLabel}</div>
    </div>

    <!-- Stat Tiles -->
    <div class="stat-grid">
      <div class="stat-tile">
        <div class="stat-label">Active Clients</div>
        <div class="stat-value">${activeClients.count ?? '—'}</div>
        <div class="stat-sub">Currently active</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Workouts This Week</div>
        <div class="stat-value">${workoutsThisWeek.count ?? '—'}</div>
        <div class="stat-sub">Completed sessions</div>
      </div>
      <div class="stat-tile ${complianceData.rate < 60 ? 'alert-tile' : complianceData.rate >= 80 ? 'ok-tile' : ''}">
        <div class="stat-label">Compliance Rate (30d)</div>
        <div class="stat-value">${complianceData.rate != null ? complianceData.rate + '%' : '—'}</div>
        <div class="stat-sub">Sessions logged vs. prescribed</div>
      </div>
    </div>

    <!-- Alerts -->
    <div class="card mb-4" style="margin-bottom:20px;">
      <div class="card-header">
        <h3>Alerts</h3>
        <span class="text-sm text-muted">${alerts.length} issue${alerts.length !== 1 ? 's' : ''}</span>
      </div>
      ${renderAlerts(alerts)}
    </div>

    <!-- Recent Activity -->
    <div class="card mb-4" style="margin-bottom:20px;">
      <div class="card-header">
        <h3>Recent Activity</h3>
      </div>
      ${renderActivity(recentActivity)}
    </div>

    <!-- Quick Actions -->
    <div class="card">
      <div class="card-header">
        <h3>Quick Actions</h3>
      </div>
      <div class="quick-actions">
        <button class="btn btn-primary" id="qa-add-client">
          + Add Client
        </button>
        <button class="btn btn-navy" onclick="window.location.hash='#assign'">
          + Assign Program
        </button>
        <button class="btn btn-secondary"
                onclick="window.iron.showToast('Reports coming in Phase 2 (Pro tier)', 'info')">
          📄 Reports
        </button>
      </div>
    </div>
  `;

  // Bind "Add Client" quick action → open the client panel
  document.getElementById('qa-add-client').addEventListener('click', () => {
    // Navigate to clients screen and trigger add panel
    window.location.hash = '#clients';
    // After navigation, fire the open-panel event
    window.addEventListener('hashchange', () => {
      window.iron._openAddClientPanel?.();
    }, { once: true });
  });
}

// ── Data Fetchers ──────────────────────────────────────────

async function fetchActiveClients() {
  const { count, error } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('trainer_id', (await supabase.auth.getUser()).data.user?.id)
    .eq('status', 'active');

  if (error) {
    console.error('[dashboard] fetchActiveClients:', error.message);
    return { count: null };
  }
  return { count };
}

async function fetchWorkoutsThisWeek() {
  const weekStart = getWeekStart(new Date()).toISOString();
  const { data: user } = await supabase.auth.getUser();

  const { count, error } = await supabase
    .from('workout_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('trainer_id', user?.user?.id)
    .eq('status', 'completed')
    .gte('completed_at', weekStart);

  if (error) {
    console.error('[dashboard] fetchWorkoutsThisWeek:', error.message);
    return { count: null };
  }
  return { count };
}

async function fetchComplianceRate() {
  // 30-day window
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: user } = await supabase.auth.getUser();
  const trainerId = user?.user?.id;

  // Sessions completed in last 30 days
  const { count: completed, error: e1 } = await supabase
    .from('workout_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('trainer_id', trainerId)
    .eq('status', 'completed')
    .gte('completed_at', since);

  if (e1) {
    console.error('[dashboard] fetchComplianceRate (completed):', e1.message);
    return { rate: null };
  }

  if (!completed) return { rate: 0 };

  // Active clients × 4 workouts/wk × ~4.3 weeks ≈ expected sessions
  const { count: activeCount } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('trainer_id', trainerId)
    .eq('status', 'active');

  if (!activeCount) return { rate: 0 };

  // Simplified: assume 4 sessions/week prescribed per active client
  const prescribed = activeCount * 4 * 4; // 4 weeks
  const rate = Math.min(100, Math.round((completed / prescribed) * 100));
  return { rate };
}

async function fetchAlerts() {
  const { data: user } = await supabase.auth.getUser();
  const trainerId = user?.user?.id;
  const alerts = [];

  // Clients inactive > 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: inactive, error: e1 } = await supabase
    .from('clients')
    .select('id, full_name, last_active_at')
    .eq('trainer_id', trainerId)
    .eq('status', 'active')
    .or(`last_active_at.lt.${sevenDaysAgo},last_active_at.is.null`)
    .order('last_active_at', { ascending: true, nullsFirst: true })
    .limit(5);

  if (!e1 && inactive) {
    for (const c of inactive) {
      const days = c.last_active_at
        ? Math.floor((Date.now() - new Date(c.last_active_at).getTime()) / 86_400_000)
        : null;
      alerts.push({
        type: days != null && days > 14 ? 'critical' : 'warning',
        clientId: c.id,
        text: `${c.full_name} — no workout in ${days != null ? days + ' days' : 'unknown'}`,
        tag: 'Inactive',
      });
    }
  }

  // Programs ending in < 5 days
  const today  = new Date().toISOString().slice(0, 10);
  const inFive = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

  const { data: ending, error: e2 } = await supabase
    .from('program_assignments')
    .select('id, client_id, end_date, clients(full_name)')
    .eq('trainer_id', trainerId)
    .eq('status', 'active')
    .gte('end_date', today)
    .lte('end_date', inFive)
    .limit(5);

  if (!e2 && ending) {
    for (const a of ending) {
      const daysLeft = Math.floor(
        (new Date(a.end_date).getTime() - Date.now()) / 86_400_000
      );
      alerts.push({
        type: 'warning',
        clientId: a.client_id,
        text: `${a.clients?.full_name ?? 'Client'} — program ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
        tag: 'Program ending',
      });
    }
  }

  return alerts;
}

async function fetchRecentActivity() {
  const { data: user } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('workout_sessions')
    .select(`
      id,
      completed_at,
      duration_sec,
      clients ( full_name ),
      program_days ( label )
    `)
    .eq('trainer_id', user?.user?.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('[dashboard] fetchRecentActivity:', error.message);
    return [];
  }

  return data ?? [];
}

// ── Renderers ──────────────────────────────────────────────

function renderAlerts(alerts) {
  if (!alerts.length) {
    return `
      <div class="alerts-list">
        <div class="alert-item" style="cursor:default;">
          <span class="alert-icon">✓</span>
          <span class="alert-text" style="color:var(--ok);">All clients on track — no alerts today</span>
        </div>
      </div>
    `;
  }

  const items = alerts.map(a => `
    <a href="#client/${a.clientId}" class="alert-item">
      <span class="alert-icon ${a.type === 'critical' ? 'critical' : ''}">⚠</span>
      <span class="alert-text">${escHtml(a.text)}</span>
      <span class="alert-tag">${escHtml(a.tag)}</span>
    </a>
  `).join('');

  return `<div class="alerts-list">${items}</div>`;
}

function renderActivity(sessions) {
  if (!sessions.length) {
    return `
      <div class="empty-state">
        <div class="empty-icon">🏋️</div>
        <h3>No workouts yet</h3>
        <p>Add your first client and assign a program to start tracking workouts.</p>
        <button class="btn btn-primary" onclick="window.location.hash='#clients'">Add Client</button>
      </div>
    `;
  }

  const items = sessions.map(s => {
    const name     = s.clients?.full_name ?? 'Unknown';
    const day      = s.program_days?.label ?? 'Workout';
    const duration = s.duration_sec ? `${Math.round(s.duration_sec / 60)} min` : '';
    const rel      = window.iron.formatRelative(s.completed_at);

    return `
      <a href="#client/${s.client_id ?? ''}" class="activity-item">
        <span class="activity-check">✓</span>
        <span class="activity-name">${escHtml(name)}</span>
        <span class="activity-detail">${escHtml(day)}${duration ? ' · ' + duration : ''}</span>
        <span class="activity-time">${escHtml(rel)}</span>
      </a>
    `;
  }).join('');

  return `
    <div class="activity-list">
      ${items}
      <a href="#clients" class="view-all-link">View all clients →</a>
    </div>
  `;
}

// ── Date Utilities ─────────────────────────────────────────

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(date) {
  const d = getWeekStart(date);
  d.setDate(d.getDate() + 6);
  return d;
}

function fmt(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDay(date) {
  return date.toLocaleDateString('en-US', { day: 'numeric' });
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
