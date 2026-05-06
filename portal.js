/**
 * Iron Platform — Trainer Portal
 * portal.js — Main controller (vanilla JS, ES modules)
 *
 * FILL IN AFTER SUPABASE SETUP — see README.md
 */

// ── Supabase Client Setup ──────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Configured 2026-05-03 — Iron Platform dogfood Supabase project
const SUPABASE_URL      = 'https://emzwoofcnqjoodbbdhvw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Pr7Di32pQ39vnv6kN3mZvA_pn57Vbgf';

// Workaround: supabase-js auth subsystem hangs on setSession with publishable keys.
// Read session from localStorage and pass the JWT as a global Authorization header
// on every request. Bypasses the broken auth client entirely for query/mutation paths.
const PROJECT_REF = 'emzwoofcnqjoodbbdhvw';
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

function readPersistedSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const sess = JSON.parse(raw);
    if (!sess?.access_token) return null;
    if (sess.expires_at && sess.expires_at * 1000 < Date.now()) return null;
    return sess;
  } catch { return null; }
}

// Hardening pass implemented 2026-05-06 — see
// docs/specs/iron-portal-auth-fragility-diagnosis.md (recommendation b).
// Decode JWT exp claim locally without touching supabase-js auth client
// (which hangs on this codebase per the diagnosis). Returns the decoded
// payload, or null if the token is malformed.
function decodeJwtPayload(jwt) {
  try {
    const parts = String(jwt).split('.');
    if (parts.length !== 3) return null;
    // base64url → base64
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    return JSON.parse(atob(padded));
  } catch { return null; }
}

// Hardening pass — visible session-expiry banner. Inline-styled so it does
// not depend on the portal CSS bundle (which may not be loaded if the user
// is bounced to login-required before it is wired in). Persistent until
// the user clicks "Sign in again."
function showExpiryBanner(message) {
  if (document.getElementById('iron-expiry-banner')) return; // idempotent
  const banner = document.createElement('div');
  banner.id = 'iron-expiry-banner';
  banner.setAttribute('role', 'alert');
  banner.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
    'background:#b91c1c', 'color:#fff', 'padding:12px 16px',
    'font:500 14px/1.4 system-ui,sans-serif',
    'display:flex', 'align-items:center', 'justify-content:center',
    'gap:12px', 'box-shadow:0 2px 6px rgba(0,0,0,0.2)',
  ].join(';');
  banner.innerHTML = `
    <span>${String(message || 'Your session expired. Please sign in again.')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>
    <button id="iron-expiry-banner-btn" style="
      background:#fff;color:#b91c1c;border:0;border-radius:4px;
      padding:6px 12px;font-weight:600;cursor:pointer;">Sign in again</button>
  `;
  document.body.appendChild(banner);
  document.getElementById('iron-expiry-banner-btn').addEventListener('click', () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    window.location.href = 'index.html';
  });
}

/**
 * requireSession — central auth gate for every page-init / data-fetcher path.
 *
 * Hardening pass implemented 2026-05-06 per recommendation (b) of
 * docs/specs/iron-portal-auth-fragility-diagnosis.md. Distinguishes three
 * states so a stale or unreachable session never produces a silent blank
 * dashboard:
 *
 *   - 'valid'       — JWT present, exp in the future, live probe returned
 *                      a user. Returns { state, user, session }.
 *   - 'expired'     — JWT decoded locally and exp is past (no round-trip).
 *                      Surfaces the expiry banner and routes to login-required.
 *   - 'unreachable' — supabase-js getUser() hung past 3s OR returned null
 *                      with a non-deterministic error. Same UX as expired:
 *                      visible banner, NOT a blank dashboard.
 *
 * Returns an object { state, user?, session? }. Callers should bail out
 * when state !== 'valid'. The banner is rendered as a side effect.
 */
const REQUIRE_SESSION_PROBE_TIMEOUT_MS = 3000;
let _requireSessionCache = null;

export async function requireSession({ force = false } = {}) {
  if (_requireSessionCache && !force) return _requireSessionCache;

  const session = readPersistedSession();

  // Init-time live probe step 1 — local exp decode. If exp is past, skip
  // the supabase-js call entirely (the diagnosis says it won't help and
  // may hang).
  if (!session) {
    showExpiryBanner('Your session expired. Please sign in again.');
    const result = { state: 'expired', user: null, session: null };
    _requireSessionCache = result;
    return result;
  }

  const payload = decodeJwtPayload(session.access_token);
  if (payload?.exp && payload.exp * 1000 < Date.now()) {
    showExpiryBanner('Your session expired. Please sign in again.');
    const result = { state: 'expired', user: null, session };
    _requireSessionCache = result;
    return result;
  }

  // Init-time live probe step 2 — supabase-js getUser() with 3s timeout.
  // The diagnosis flags this as the path that may hang on publishable-key
  // projects; the timeout is the defensive wrapper.
  let probe;
  try {
    probe = await Promise.race([
      supabase.auth.getUser(),
      new Promise(resolve => setTimeout(
        () => resolve({ data: { user: null }, error: { message: 'auth probe timeout' }, _timeout: true }),
        REQUIRE_SESSION_PROBE_TIMEOUT_MS
      )),
    ]);
  } catch (err) {
    probe = { data: { user: null }, error: err };
  }

  const probeUser = probe?.data?.user;
  if (!probeUser) {
    showExpiryBanner('We could not verify your session. Please sign in again.');
    const result = { state: 'unreachable', user: null, session };
    _requireSessionCache = result;
    return result;
  }

  const result = { state: 'valid', user: probeUser, session };
  _requireSessionCache = result;
  return result;
}

// Expose on window.iron so non-module code paths and the console can use it
// during dogfood. Module imports should still use the named export.
window.iron = window.iron || {};
window.iron.requireSession = requireSession;

const persistedSession = readPersistedSession();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: false,        // workaround: refresh hangs on this version
    detectSessionInUrl: false,      // we handle redirects manually
    storageKey: STORAGE_KEY,
  },
  global: {
    headers: persistedSession?.access_token
      ? { Authorization: `Bearer ${persistedSession.access_token}` }
      : {}
  }
});

// ── Screen Module Imports ──────────────────────────────────
import { renderDashboard } from './screens/dashboard.js';
import { renderClients   } from './screens/clients.js';
import { renderSettings  } from './screens/settings.js';
// Portal-Half-B stubs — imported but not yet implemented:
import { renderPrograms  } from './screens/programs.js';
import { renderAssign    } from './screens/assign.js';
import { renderClientDetail } from './screens/client-detail.js';

// ── Global State ───────────────────────────────────────────
window.iron = window.iron || {};
window.iron.trainer   = null;    // Set after auth check
window.iron.session   = null;    // Supabase auth session
window.iron.supabase  = supabase; // Exposed for console debugging during dogfood

// ── Helpers ────────────────────────────────────────────────

/**
 * Show a toast notification (top-right, auto-dismiss 3s).
 * @param {string} msg   Message text.
 * @param {'success'|'error'|'info'|'warning'} type
 */
window.iron.showToast = function showToast(msg, type = 'info') {
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <span class="toast-icon">${icons[type] ?? 'ℹ'}</span>
    <span class="toast-msg">${escapeHtml(msg)}</span>
  `;
  container.appendChild(el);

  const dismiss = () => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  };
  const timer = setTimeout(dismiss, 3000);
  el.addEventListener('click', () => { clearTimeout(timer); dismiss(); });
};

/**
 * Open the slide-in panel with arbitrary HTML content.
 * @param {string} title  Panel heading.
 * @param {string} html   Inner HTML for panel body.
 * @param {string} [footerHtml]  Optional footer HTML (buttons, etc.).
 */
window.iron.openPanel = function openPanel(title, html, footerHtml = '') {
  const panel   = document.getElementById('slide-panel');
  const overlay = document.getElementById('panel-overlay');
  document.getElementById('panel-title').textContent = title;
  document.getElementById('panel-body').innerHTML = html;

  const footer = document.getElementById('panel-footer');
  if (footerHtml) {
    footer.innerHTML = footerHtml;
    footer.style.display = '';
  } else {
    footer.innerHTML = '';
    footer.style.display = 'none';
  }

  panel.classList.add('open');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  // Focus first focusable element
  requestAnimationFrame(() => {
    const first = panel.querySelector('input, select, textarea, button, [tabindex]');
    if (first) first.focus();
  });
};

/** Close the slide-in panel. */
window.iron.closePanel = function closePanel() {
  const panel   = document.getElementById('slide-panel');
  const overlay = document.getElementById('panel-overlay');
  panel.classList.remove('open');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
};

/**
 * Show a confirmation dialog.
 * @param {string}   msg       Body text.
 * @param {Function} onConfirm Callback when user clicks Confirm.
 * @param {string}   [confirmLabel] Override button label (default "Confirm").
 */
window.iron.confirmDialog = function confirmDialog(msg, onConfirm, confirmLabel = 'Confirm') {
  const overlay = document.getElementById('dialog-overlay');
  document.getElementById('dialog-message').textContent = msg;
  document.getElementById('dialog-confirm').textContent = confirmLabel;
  overlay.classList.add('open');

  const confirmBtn = document.getElementById('dialog-confirm');
  const cancelBtn  = document.getElementById('dialog-cancel');

  const close = () => { overlay.classList.remove('open'); };

  const handleConfirm = () => {
    close();
    confirmBtn.removeEventListener('click', handleConfirm);
    cancelBtn.removeEventListener('click', close);
    onConfirm();
  };

  confirmBtn.addEventListener('click', handleConfirm, { once: true });
  cancelBtn.addEventListener('click', () => {
    close();
    cancelBtn.removeEventListener('click', close);
  }, { once: true });
};

/**
 * Format an ISO date string to a human-readable date.
 * @param {string} iso  ISO 8601 date/datetime string.
 * @returns {string}    e.g., "May 3, 2026"
 */
window.iron.formatDate = function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch { return iso; }
};

/**
 * Format an ISO date string as a relative time label.
 * @param {string} iso  ISO 8601 date/datetime string.
 * @returns {string}    e.g., "Today", "Yesterday", "3d ago"
 */
window.iron.formatRelative = function formatRelative(iso) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)   return `${days}d ago`;
  if (days < 30)  return `${Math.floor(days / 7)}w ago`;
  return window.iron.formatDate(iso);
};

/** Escape HTML special chars to prevent XSS from user-supplied data in toasts/dialogs. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Router ─────────────────────────────────────────────────
const VIEW_MAP = {
  'dashboard':     { sectionId: 'view-dashboard',      render: renderDashboard     },
  'clients':       { sectionId: 'view-clients',         render: renderClients       },
  'settings':      { sectionId: 'view-settings',        render: renderSettings      },
  'programs':      { sectionId: 'view-programs',        render: renderPrograms      },
  'assign':        { sectionId: 'view-assign',          render: renderAssign        },
};

const ALL_VIEW_IDS = [
  'view-dashboard',
  'view-clients',
  'view-settings',
  'view-programs',
  'view-assign',
  'view-client-detail',
  'view-login-required',
];

function hideAllViews() {
  ALL_VIEW_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function setActiveNav(viewKey) {
  // Sidebar links
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.view === viewKey);
  });
  // Bottom nav buttons
  document.querySelectorAll('.bottom-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewKey);
  });
}

async function navigate(hash) {
  // Handle client detail route: #client/<uuid>
  if (hash.startsWith('#client/')) {
    const clientId = hash.slice('#client/'.length);
    hideAllViews();
    setActiveNav('clients');
    const section = document.getElementById('view-client-detail');
    section.style.display = 'block';
    renderClientDetail(clientId);
    return;
  }

  const viewKey = hash.replace('#', '') || 'dashboard';
  const view = VIEW_MAP[viewKey];

  if (!view) {
    // Unknown route — fall back to dashboard
    window.location.hash = '#dashboard';
    return;
  }

  hideAllViews();
  setActiveNav(viewKey);
  const section = document.getElementById(view.sectionId);
  section.style.display = 'block';

  try {
    await view.render();
  } catch (err) {
    console.error(`[iron] render error on ${viewKey}:`, err);
    section.innerHTML = `
      <div class="empty-state" style="margin-top:40px;">
        <div class="empty-icon">⚠</div>
        <h3>Something went wrong</h3>
        <p>${escapeHtml(err.message || 'An unexpected error occurred.')}</p>
        <button class="btn btn-secondary" onclick="window.location.reload()">Reload</button>
      </div>
    `;
  }
}

window.addEventListener('hashchange', () => {
  navigate(window.location.hash);
});

// ── Trainer Profile Loader ─────────────────────────────────
async function loadTrainerProfile(userId) {
  const { data, error } = await supabase
    .from('trainers')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.warn('[iron] Could not load trainer profile:', error.message);
    return null;
  }
  return data;
}

// ── Panel Close Bindings ───────────────────────────────────
document.getElementById('panel-close-btn').addEventListener('click', () => {
  window.iron.closePanel();
});

document.getElementById('panel-overlay').addEventListener('click', () => {
  window.iron.closePanel();
});

// Keyboard: Escape closes panel or dialog
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const panel = document.getElementById('slide-panel');
    if (panel.classList.contains('open')) {
      window.iron.closePanel();
      return;
    }
    const dialog = document.getElementById('dialog-overlay');
    if (dialog.classList.contains('open')) {
      dialog.classList.remove('open');
    }
  }
});

// ── Initialization ─────────────────────────────────────────
async function init() {
  // Hardening pass 2026-05-06 — see
  // docs/specs/iron-portal-auth-fragility-diagnosis.md (recommendation b).
  // requireSession() distinguishes valid / expired / unreachable so a stale
  // or hung session no longer falls through into a blank dashboard.
  const auth = await requireSession();

  if (auth.state !== 'valid') {
    hideAllViews();
    document.getElementById('view-login-required').style.display = 'block';
    // Banner already rendered by requireSession(); nothing else to do.
    return;
  }

  const session = auth.session;
  window.iron.session = session;

  // Load trainer profile before rendering any screen
  const trainer = await loadTrainerProfile(session.user.id);
  window.iron.trainer = trainer;

  // Update biz name in nav
  const bizEl = document.getElementById('biz-name-display');
  if (trainer?.business_name) {
    bizEl.textContent = trainer.business_name;
  } else if (trainer?.brand_name) {
    bizEl.textContent = trainer.brand_name;
  } else {
    bizEl.textContent = trainer?.full_name ?? 'Trainer Portal';
  }

  // Route to current hash (or default to dashboard)
  const hash = window.location.hash || '#dashboard';
  await navigate(hash);
}

// Sign-out helper (called by Settings screen). Clears localStorage + redirects.
window.iron.signOut = function signOut() {
  localStorage.removeItem(STORAGE_KEY);
  window.location.href = 'index.html';
};

// Boot
init();
