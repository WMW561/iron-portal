/**
 * Iron Platform — Trainer Portal
 * screens/clients.js — Client Management (Screen 2)
 *
 * Renders:
 *  - Filter tabs (All / Active / Paused / GLP-1)
 *  - Search input
 *  - Sortable client table (name, program, last workout, status)
 *  - Add/Edit client slide-in panel
 *  - Click row → navigate to #client/<id> (Portal-Half-B)
 */

import { supabase } from '../portal.js';

let allClients  = [];   // Full dataset from last fetch
let activeFilter = 'all'; // Current tab filter
let searchQuery  = '';    // Current search string

export async function renderClients() {
  const section = document.getElementById('view-clients');

  section.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Clients</h1>
        <div class="page-subtitle">Manage your client roster</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" id="btn-add-client">+ Add Client</button>
      </div>
    </div>

    <!-- Toolbar: filters + search -->
    <div class="flex items-center gap-3 mb-4" style="margin-bottom:16px;flex-wrap:wrap;">
      <div class="filter-tabs" role="tablist" aria-label="Client filter">
        <button class="filter-tab active" data-filter="all"    role="tab" aria-selected="true">All</button>
        <button class="filter-tab"        data-filter="active" role="tab" aria-selected="false">Active</button>
        <button class="filter-tab"        data-filter="paused" role="tab" aria-selected="false">Paused</button>
        <button class="filter-tab"        data-filter="glp1"   role="tab" aria-selected="false">💊 GLP-1</button>
      </div>
      <div class="search-wrap" style="flex:1;min-width:200px;max-width:320px;">
        <span class="search-icon" aria-hidden="true">🔍</span>
        <input
          type="search"
          class="search-input"
          id="clients-search"
          placeholder="Search clients…"
          aria-label="Search clients"
          autocomplete="off"
        >
      </div>
    </div>

    <!-- Clients table -->
    <div id="clients-table-wrap">
      <div class="loading-state">
        <div class="spinner"></div>
        <span>Loading clients…</span>
      </div>
    </div>

    <!-- Legend -->
    <p class="text-xs text-muted" style="margin-top:12px;">
      💊 = GLP-1 flag &nbsp;·&nbsp;
      <span style="color:var(--ok);">●</span> Active &nbsp;·&nbsp;
      <span style="color:var(--warning);">⚠</span> Inactive &gt;7 days
    </p>
  `;

  // Expose hook for dashboard quick-action
  window.iron._openAddClientPanel = () => openAddClientPanel();

  // ── Bind UI events ─────────────────────────────────────────
  document.getElementById('btn-add-client').addEventListener('click', openAddClientPanel);

  // Filter tabs
  section.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      section.querySelectorAll('.filter-tab').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      activeFilter = btn.dataset.filter;
      renderTable();
    });
  });

  // Search input — debounced
  let searchTimer;
  document.getElementById('clients-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderTable();
    }, 200);
  });

  // ── Fetch data ─────────────────────────────────────────────
  await loadClients();
}

// ── Data ───────────────────────────────────────────────────

async function loadClients() {
  const { data: user } = await supabase.auth.getUser();
  const trainerId = user?.user?.id;

  // Fetch clients + their active program assignment (if any)
  const { data, error } = await supabase
    .from('clients')
    .select(`
      id,
      full_name,
      email,
      status,
      on_glp1,
      last_active_at,
      program_assignments (
        id,
        status,
        end_date,
        program_templates ( name )
      )
    `)
    .eq('trainer_id', trainerId)
    .order('full_name', { ascending: true });

  if (error) {
    document.getElementById('clients-table-wrap').innerHTML = `
      <div class="alert-banner alert-banner-error" role="alert">
        Could not load clients: ${escHtml(error.message)}
      </div>
    `;
    return;
  }

  allClients = data ?? [];
  renderTable();
}

function renderTable() {
  const wrap = document.getElementById('clients-table-wrap');

  // Apply filters
  let filtered = allClients.filter(c => {
    if (activeFilter === 'active')  return c.status === 'active';
    if (activeFilter === 'paused')  return c.status === 'paused';
    if (activeFilter === 'glp1')    return c.on_glp1 === true;
    return true; // 'all'
  });

  // Apply search
  if (searchQuery) {
    filtered = filtered.filter(c =>
      c.full_name?.toLowerCase().includes(searchQuery) ||
      c.email?.toLowerCase().includes(searchQuery)
    );
  }

  if (!filtered.length) {
    const msg = searchQuery
      ? `No clients match "${escHtml(searchQuery)}".`
      : allClients.length === 0
        ? null   // Show full empty state
        : `No clients in this filter.`;

    if (!allClients.length) {
      wrap.innerHTML = `
        <div class="empty-state" style="padding:48px 24px;">
          <div class="empty-icon">👥</div>
          <h3>No clients yet</h3>
          <p>Add your first client to get started. You can assign a program once they're added.</p>
          <button class="btn btn-primary" onclick="document.getElementById('btn-add-client').click()">
            + Add Client
          </button>
        </div>
      `;
    } else {
      wrap.innerHTML = `
        <div class="empty-state" style="padding:32px 24px;">
          <div class="empty-icon">🔍</div>
          <h3>No results</h3>
          <p>${msg}</p>
        </div>
      `;
    }
    return;
  }

  const rows = filtered.map(c => {
    const activeAssignment = c.program_assignments?.find(a => a.status === 'active');
    const programName = activeAssignment?.program_templates?.name ?? '—';
    const lastWorkout = window.iron.formatRelative(c.last_active_at);
    const isAlert = c.last_active_at
      ? (Date.now() - new Date(c.last_active_at).getTime()) > 7 * 86_400_000
      : true;
    const statusDot = c.status === 'active'
      ? `<span style="color:var(--ok);" title="Active">●</span>`
      : `<span style="color:var(--text-muted);" title="${escHtml(c.status)}">●</span>`;

    return `
      <div class="table-row" tabindex="0" role="row"
           aria-label="View ${escHtml(c.full_name)}"
           onclick="window.location.hash='#client/${c.id}'"
           onkeydown="if(event.key==='Enter')window.location.hash='#client/${c.id}'"
           data-client-id="${c.id}">

        <div class="client-name-cell">
          ${c.on_glp1 ? '<span class="glp1-badge" title="GLP-1 patient" aria-label="GLP-1 patient">💊</span>' : ''}
          <span>${escHtml(c.full_name)}</span>
        </div>

        <div class="cell-secondary col-program">${escHtml(programName)}</div>

        <div class="${isAlert ? 'cell-secondary' : 'cell-secondary'}">
          ${isAlert && c.status === 'active'
            ? `<span title="No workout in over 7 days" style="color:var(--warning);">⚠</span> `
            : statusDot + ' '}
          ${escHtml(lastWorkout)}
        </div>

        <div>
          <span class="pill pill-${c.status === 'active' ? 'active' : c.status === 'paused' ? 'paused' : 'inactive'}">
            ${escHtml(c.status.charAt(0).toUpperCase() + c.status.slice(1))}
          </span>
        </div>

        <div class="cell-actions">
          <button class="btn btn-ghost btn-icon btn-sm"
                  aria-label="Edit ${escHtml(c.full_name)}"
                  title="Edit client"
                  onclick="event.stopPropagation(); window.iron._editClient('${c.id}')">
            ✏
          </button>
        </div>
      </div>
    `;
  }).join('');

  wrap.innerHTML = `
    <div class="table-container clients-table" role="table" aria-label="Client roster">
      <div class="table-header" role="row">
        <div role="columnheader">Name</div>
        <div class="hdr-program" role="columnheader">Program</div>
        <div role="columnheader">Last Workout</div>
        <div role="columnheader">Status</div>
        <div role="columnheader"><span class="sr-only">Actions</span></div>
      </div>
      ${rows}
    </div>
  `;

  // Bind edit callbacks
  window.iron._editClient = (clientId) => {
    const client = allClients.find(c => c.id === clientId);
    if (client) openEditClientPanel(client);
  };
}

// ── Add / Edit Panel ───────────────────────────────────────

function clientFormHtml(client = null) {
  const v = (field, fallback = '') => escHtml(client?.[field] ?? fallback);
  const checked = (field) => client?.[field] ? 'checked' : '';
  const sel = (field, value) => (client?.[field] === value) ? 'selected' : '';

  return `
    <form id="client-form" novalidate>
      <div class="form-group">
        <label for="cf-full-name">Full Name<span class="req" aria-hidden="true">*</span></label>
        <input type="text" id="cf-full-name" name="full_name"
               value="${v('full_name')}" required
               placeholder="Jane Smith" autocomplete="name">
        <span class="field-error" id="err-full-name" role="alert" style="display:none;"></span>
      </div>

      <div class="form-group">
        <label for="cf-email">Email</label>
        <input type="email" id="cf-email" name="email"
               value="${v('email')}" placeholder="jane@example.com" autocomplete="email">
        <span class="field-error" id="err-email" role="alert" style="display:none;"></span>
      </div>

      <div class="form-group">
        <label for="cf-phone">Phone</label>
        <input type="tel" id="cf-phone" name="phone"
               value="${v('phone')}" placeholder="+1 (555) 000-0000" autocomplete="tel">
      </div>

      <div class="form-group">
        <label for="cf-dob">Date of Birth</label>
        <input type="date" id="cf-dob" name="date_of_birth"
               value="${v('date_of_birth')}">
        <span class="form-hint">Used for age context in programming — not stored as PHI</span>
      </div>

      <div class="form-group">
        <label for="cf-bio-sex">Biological Sex</label>
        <select id="cf-bio-sex" name="biological_sex">
          <option value="">Select…</option>
          <option value="male"              ${sel('biological_sex','male')}>Male</option>
          <option value="female"            ${sel('biological_sex','female')}>Female</option>
          <option value="other"             ${sel('biological_sex','other')}>Other</option>
          <option value="prefer_not_to_say" ${sel('biological_sex','prefer_not_to_say')}>Prefer not to say</option>
        </select>
      </div>

      <div class="form-group">
        <label for="cf-goal">Primary Goal</label>
        <input type="text" id="cf-goal" name="primary_goal"
               value="${v('primary_goal')}"
               placeholder="e.g., muscle preservation, weight loss">
      </div>

      <div class="form-group">
        <div class="checkbox-row">
          <input type="checkbox" id="cf-glp1" name="on_glp1" ${checked('on_glp1')}>
          <label for="cf-glp1">GLP-1 patient 💊</label>
        </div>
        <span class="form-hint">Boolean flag only — no medication names or dosages stored</span>
      </div>

      <div class="form-group" id="glp1-date-group" style="${client?.on_glp1 ? '' : 'display:none;'}">
        <label for="cf-glp1-start">GLP-1 Start Date</label>
        <input type="date" id="cf-glp1-start" name="glp1_start_date"
               value="${v('glp1_start_date')}"
               placeholder="Approximate month/year is fine">
      </div>

      <div class="form-group">
        <label for="cf-status">Status</label>
        <select id="cf-status" name="status">
          <option value="active"   ${sel('status','active')   || (!client ? 'selected' : '')}>Active</option>
          <option value="paused"   ${sel('status','paused')}>Paused</option>
          <option value="inactive" ${sel('status','inactive')}>Inactive</option>
        </select>
      </div>

      <div class="form-group">
        <label for="cf-notes">Notes</label>
        <textarea id="cf-notes" name="notes" rows="3"
                  placeholder="General trainer notes (non-medical)">${escHtml(client?.notes ?? '')}</textarea>
      </div>
    </form>
  `;
}

function openAddClientPanel() {
  const formHtml = clientFormHtml(null);
  const footerHtml = `
    <button class="btn btn-secondary" onclick="window.iron.closePanel()">Cancel</button>
    <button class="btn btn-primary" id="panel-save-btn">Save Client</button>
  `;
  window.iron.openPanel('Add Client', formHtml, footerHtml);
  bindPanelForm(null);
}

function openEditClientPanel(client) {
  const formHtml = clientFormHtml(client);
  const footerHtml = `
    <button class="btn btn-secondary" onclick="window.iron.closePanel()">Cancel</button>
    <button class="btn btn-primary" id="panel-save-btn">Save Changes</button>
  `;
  window.iron.openPanel(`Edit: ${client.full_name}`, formHtml, footerHtml);
  bindPanelForm(client);
}

function bindPanelForm(existingClient) {
  // Toggle GLP-1 start date visibility
  const glp1Check = document.getElementById('cf-glp1');
  const glp1Group = document.getElementById('glp1-date-group');
  glp1Check.addEventListener('change', () => {
    glp1Group.style.display = glp1Check.checked ? '' : 'none';
  });

  // Save button
  document.getElementById('panel-save-btn').addEventListener('click', async () => {
    await submitClientForm(existingClient);
  });

  // Enter key on non-textarea inputs submits
  document.getElementById('client-form').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      document.getElementById('panel-save-btn').click();
    }
  });
}

async function submitClientForm(existingClient) {
  // Collect values
  const fullName   = document.getElementById('cf-full-name').value.trim();
  const email      = document.getElementById('cf-email').value.trim();
  const phone      = document.getElementById('cf-phone').value.trim();
  const dob        = document.getElementById('cf-dob').value || null;
  const bioSex     = document.getElementById('cf-bio-sex').value || null;
  const goal       = document.getElementById('cf-goal').value.trim() || null;
  const onGlp1     = document.getElementById('cf-glp1').checked;
  const glp1Start  = onGlp1
    ? (document.getElementById('cf-glp1-start').value || null)
    : null;
  const status     = document.getElementById('cf-status').value;
  const notes      = document.getElementById('cf-notes').value.trim() || null;

  // ── Validation ──────────────────────────────────────────
  let valid = true;

  clearFieldError('cf-full-name', 'err-full-name');
  clearFieldError('cf-email', 'err-email');

  if (!fullName) {
    setFieldError('cf-full-name', 'err-full-name', 'Full name is required.');
    valid = false;
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFieldError('cf-email', 'err-email', 'Please enter a valid email address.');
    valid = false;
  }

  if (!valid) return;

  // ── Save ────────────────────────────────────────────────
  const saveBtn = document.getElementById('panel-save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  const { data: user } = await supabase.auth.getUser();
  const trainerId = user?.user?.id;

  const payload = {
    trainer_id:      trainerId,
    full_name:       fullName,
    email:           email || null,
    phone:           phone || null,
    date_of_birth:   dob,
    biological_sex:  bioSex,
    primary_goal:    goal,
    on_glp1:         onGlp1,
    glp1_start_date: glp1Start,
    status,
    notes,
    updated_at:      new Date().toISOString(),
  };

  let error;

  if (existingClient) {
    // UPDATE
    ({ error } = await supabase
      .from('clients')
      .update(payload)
      .eq('id', existingClient.id)
      .eq('trainer_id', trainerId));
  } else {
    // INSERT
    delete payload.updated_at;
    ({ error } = await supabase.from('clients').insert([payload]));
  }

  saveBtn.disabled = false;
  saveBtn.textContent = existingClient ? 'Save Changes' : 'Save Client';

  if (error) {
    window.iron.showToast(`Save failed: ${error.message}`, 'error');
    return;
  }

  window.iron.closePanel();
  window.iron.showToast(
    existingClient ? 'Client updated.' : 'Client added.',
    'success'
  );

  // Reload the list
  await loadClients();
}

// ── Field Validation Helpers ───────────────────────────────

function setFieldError(inputId, errorId, msg) {
  const input = document.getElementById(inputId);
  const errEl = document.getElementById(errorId);
  if (input) input.classList.add('input-error');
  if (errEl) { errEl.textContent = msg; errEl.style.display = ''; }
  input?.focus();
}

function clearFieldError(inputId, errorId) {
  const input = document.getElementById(inputId);
  const errEl = document.getElementById(errorId);
  if (input) input.classList.remove('input-error');
  if (errEl) errEl.style.display = 'none';
}

// ── Escape helper ──────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
