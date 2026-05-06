/**
 * Iron Platform — Trainer Portal
 * screens/settings.js — Settings (Screen 7)
 *
 * Sections:
 *  1. Branding  — business_name, logo upload, brand_color
 *  2. Notifications — notify_email, inactive threshold, program-ending threshold
 *  3. Account — full_name, email (readonly), change password
 *  4. Subscription — "Dogfood (free)" plan badge; Stripe activates Phase 2
 *  5. Sign Out
 */

import { supabase } from '../portal.js';

export async function renderSettings() {
  const section = document.getElementById('view-settings');
  const trainer = window.iron.trainer;

  if (!trainer) {
    section.innerHTML = `
      <div class="alert-banner alert-banner-error" role="alert">
        Could not load trainer profile. Please refresh the page.
      </div>
    `;
    return;
  }

  const esc = (val) => escHtml(val ?? '');

  section.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Settings</h1>
        <div class="page-subtitle">Manage your portal and account preferences</div>
      </div>
    </div>

    <!-- 1. Branding ─────────────────────────────────────── -->
    <div class="settings-section" id="section-branding">
      <div class="settings-section-header">
        <h2>Branding</h2>
      </div>
      <div class="settings-section-body">
        <p class="text-sm text-secondary" style="margin-bottom:18px;">
          These values appear in your clients' PWA — name, logo, and accent color.
        </p>

        <div class="form-group">
          <label for="s-biz-name">Business Name</label>
          <input type="text" id="s-biz-name" value="${esc(trainer.business_name)}"
                 placeholder="e.g., Apex Fitness" maxlength="80">
        </div>

        <div class="form-group">
          <label>Logo</label>
          <div class="upload-area" id="logo-upload-area" role="button" tabindex="0"
               aria-label="Upload logo">
            <input type="file" id="s-logo-file" accept="image/png,image/svg+xml,image/webp"
                   aria-label="Choose logo file">
            <div id="logo-preview">
              ${trainer.brand_logo_url
                ? `<img src="${esc(trainer.brand_logo_url)}" alt="Current logo"
                        style="max-height:60px;max-width:180px;object-fit:contain;">`
                : `<span style="font-size:28px;">🖼</span>`
              }
            </div>
            <div class="upload-hint">
              Click to upload PNG or SVG &nbsp;·&nbsp; Max 2 MB<br>
              <span class="text-xs">Stored at <code>branding/${trainer.id}/logo.png</code> in Supabase Storage</span>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label for="s-brand-color">Brand Color</label>
          <div class="color-row">
            <input type="color" id="s-brand-color"
                   value="${esc(trainer.brand_color ?? '#dc2626')}">
            <input type="text" id="s-brand-color-hex"
                   value="${esc(trainer.brand_color ?? '#dc2626')}"
                   placeholder="#dc2626"
                   style="width:120px;"
                   maxlength="7"
                   pattern="^#[0-9a-fA-F]{6}$">
            <div class="color-swatch" id="brand-color-preview"
                 style="background:${esc(trainer.brand_color ?? '#dc2626')};"></div>
          </div>
          <span class="form-hint">Hex color used for your client PWA's theme accent</span>
        </div>
      </div>
      <div class="settings-section-footer">
        <button class="btn btn-primary" id="btn-save-branding">Save Branding</button>
      </div>
    </div>

    <!-- 2. Notifications ────────────────────────────────── -->
    <div class="settings-section" id="section-notifications">
      <div class="settings-section-header">
        <h2>Notifications</h2>
      </div>
      <div class="settings-section-body">
        <div class="form-group">
          <label for="s-notify-email">Workout summary emails to</label>
          <input type="email" id="s-notify-email"
                 value="${esc(trainer.notify_email ?? trainer.email)}"
                 placeholder="trainer@yourbusiness.com"
                 autocomplete="email">
          <span class="form-hint">Receives daily workout completion summaries</span>
        </div>

        <div class="form-group">
          <label for="s-inactive-threshold">Alert: client inactive &gt;</label>
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="number" id="s-inactive-threshold"
                   value="${esc(trainer.inactive_threshold_days ?? 7)}"
                   min="1" max="90" style="width:80px;"
                   aria-label="Days before inactive alert">
            <span class="text-secondary">days</span>
          </div>
          <span class="form-hint">Dashboard shows an alert for clients exceeding this threshold</span>
        </div>

        <div class="form-group">
          <label for="s-ending-threshold">Alert: program ending &lt;</label>
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="number" id="s-ending-threshold"
                   value="${esc(trainer.program_ending_threshold_days ?? 5)}"
                   min="1" max="30" style="width:80px;"
                   aria-label="Days before program-ending alert">
            <span class="text-secondary">days</span>
          </div>
          <span class="form-hint">Alert fires when a client's assignment is expiring soon</span>
        </div>
      </div>
      <div class="settings-section-footer">
        <button class="btn btn-primary" id="btn-save-notifications">Save Notifications</button>
      </div>
    </div>

    <!-- 3. Account ──────────────────────────────────────── -->
    <div class="settings-section" id="section-account">
      <div class="settings-section-header">
        <h2>Account</h2>
      </div>
      <div class="settings-section-body">
        <div class="form-group">
          <label for="s-full-name">Full Name</label>
          <input type="text" id="s-full-name"
                 value="${esc(trainer.full_name)}"
                 placeholder="Your name"
                 autocomplete="name">
        </div>

        <div class="form-group">
          <label for="s-email">Email</label>
          <input type="email" id="s-email"
                 value="${esc(trainer.email)}"
                 readonly
                 aria-readonly="true"
                 style="background:var(--bg);color:var(--text-secondary);cursor:not-allowed;">
          <span class="form-hint">Email cannot be changed here. Contact support to update your login email.</span>
        </div>

        <div class="form-group">
          <label>Password</label>
          <button class="btn btn-secondary" id="btn-change-password" type="button">
            Send password reset email
          </button>
          <span class="form-hint">We'll send a reset link to <strong>${esc(trainer.email)}</strong></span>
        </div>
      </div>
      <div class="settings-section-footer">
        <button class="btn btn-primary" id="btn-save-account">Save Account</button>
      </div>
    </div>

    <!-- 4. Subscription ─────────────────────────────────── -->
    <div class="settings-section" id="section-subscription">
      <div class="settings-section-header">
        <h2>Subscription</h2>
      </div>
      <div class="settings-section-body">
        <div class="plan-badge">
          ✓ Dogfood (free)
        </div>
        <p class="plan-note">
          You're on the free dogfood plan. Stripe billing activates in Phase 2.
          Full Solo ($39/mo) and Pro ($79/mo) tiers launch with Phase 2.
        </p>
        <p class="plan-note" style="margin-top:8px;">
          <strong>Clients:</strong>
          <span id="client-count-display">Loading…</span>
        </p>
      </div>
    </div>

    <!-- Sign Out ─────────────────────────────────────────── -->
    <div style="margin-top:32px;padding-top:24px;border-top:1px solid var(--border);">
      <button class="btn btn-danger" id="btn-signout" type="button">
        Sign Out
      </button>
    </div>
  `;

  // ── Bind Events ────────────────────────────────────────────
  bindBranding(trainer);
  bindNotifications(trainer);
  bindAccount(trainer);
  bindSignOut();
  loadClientCount(trainer.id);
}

// ── Branding ───────────────────────────────────────────────

function bindBranding(trainer) {
  // Color picker sync
  const picker = document.getElementById('s-brand-color');
  const hexInput = document.getElementById('s-brand-color-hex');
  const swatch = document.getElementById('brand-color-preview');

  picker.addEventListener('input', () => {
    hexInput.value = picker.value;
    swatch.style.background = picker.value;
  });

  hexInput.addEventListener('input', () => {
    const val = hexInput.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      picker.value = val;
      swatch.style.background = val;
    }
  });

  // Logo upload trigger
  const uploadArea = document.getElementById('logo-upload-area');
  const fileInput  = document.getElementById('s-logo-file');

  uploadArea.addEventListener('click', () => fileInput.click());
  uploadArea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      window.iron.showToast('Logo must be under 2 MB.', 'error');
      fileInput.value = '';
      return;
    }

    // Preview locally before save
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('logo-preview').innerHTML =
        `<img src="${e.target.result}" alt="Logo preview"
              style="max-height:60px;max-width:180px;object-fit:contain;">`;
    };
    reader.readAsDataURL(file);
  });

  // Save branding
  document.getElementById('btn-save-branding').addEventListener('click', async () => {
    await saveBranding(trainer);
  });
}

async function saveBranding(trainer) {
  const btn = document.getElementById('btn-save-branding');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  let logoUrl = trainer.brand_logo_url ?? null;

  // Upload logo if a new file was selected
  const fileInput = document.getElementById('s-logo-file');
  const file = fileInput.files?.[0];

  if (file) {
    const path = `branding/${trainer.id}/logo.${file.type === 'image/svg+xml' ? 'svg' : 'png'}`;
    const { error: uploadError } = await supabase
      .storage
      .from('trainer-assets')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      window.iron.showToast(`Logo upload failed: ${uploadError.message}`, 'error');
      btn.disabled = false;
      btn.textContent = 'Save Branding';
      return;
    }

    const { data: urlData } = supabase.storage
      .from('trainer-assets')
      .getPublicUrl(path);
    logoUrl = urlData?.publicUrl ?? null;
  }

  const brandColor = document.getElementById('s-brand-color').value;
  const bizName    = document.getElementById('s-biz-name').value.trim() || null;

  const { error } = await supabase
    .from('trainers')
    .update({
      business_name:   bizName,
      brand_color:     brandColor,
      brand_logo_url:  logoUrl,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', trainer.id);

  btn.disabled = false;
  btn.textContent = 'Save Branding';

  if (error) {
    window.iron.showToast(`Save failed: ${error.message}`, 'error');
    return;
  }

  // Update in-memory trainer object
  if (window.iron.trainer) {
    window.iron.trainer.business_name  = bizName;
    window.iron.trainer.brand_color    = brandColor;
    window.iron.trainer.brand_logo_url = logoUrl;
  }

  // Update nav biz name
  const bizEl = document.getElementById('biz-name-display');
  if (bizEl) bizEl.textContent = bizName ?? window.iron.trainer?.full_name ?? 'Trainer Portal';

  window.iron.showToast('Branding saved.', 'success');
}

// ── Notifications ──────────────────────────────────────────

function bindNotifications(trainer) {
  document.getElementById('btn-save-notifications').addEventListener('click', async () => {
    await saveNotifications(trainer);
  });
}

async function saveNotifications(trainer) {
  const btn = document.getElementById('btn-save-notifications');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const notifyEmail = document.getElementById('s-notify-email').value.trim() || null;
  const inactiveThreshold = parseInt(document.getElementById('s-inactive-threshold').value, 10) || 7;
  const endingThreshold   = parseInt(document.getElementById('s-ending-threshold').value, 10) || 5;

  if (notifyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail)) {
    window.iron.showToast('Please enter a valid notification email address.', 'error');
    btn.disabled = false;
    btn.textContent = 'Save Notifications';
    document.getElementById('s-notify-email').focus();
    return;
  }

  const { error } = await supabase
    .from('trainers')
    .update({
      notify_email:                    notifyEmail,
      inactive_threshold_days:         inactiveThreshold,
      program_ending_threshold_days:   endingThreshold,
      updated_at:                      new Date().toISOString(),
    })
    .eq('id', trainer.id);

  btn.disabled = false;
  btn.textContent = 'Save Notifications';

  if (error) {
    window.iron.showToast(`Save failed: ${error.message}`, 'error');
    return;
  }

  if (window.iron.trainer) {
    window.iron.trainer.notify_email = notifyEmail;
  }

  window.iron.showToast('Notification settings saved.', 'success');
}

// ── Account ────────────────────────────────────────────────

function bindAccount(trainer) {
  document.getElementById('btn-save-account').addEventListener('click', async () => {
    await saveAccount(trainer);
  });

  document.getElementById('btn-change-password').addEventListener('click', async () => {
    await sendPasswordReset(trainer.email);
  });
}

async function saveAccount(trainer) {
  const btn = document.getElementById('btn-save-account');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const fullName = document.getElementById('s-full-name').value.trim();

  if (!fullName) {
    window.iron.showToast('Full name is required.', 'error');
    btn.disabled = false;
    btn.textContent = 'Save Account';
    document.getElementById('s-full-name').focus();
    return;
  }

  const { error } = await supabase
    .from('trainers')
    .update({
      full_name:   fullName,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', trainer.id);

  btn.disabled = false;
  btn.textContent = 'Save Account';

  if (error) {
    window.iron.showToast(`Save failed: ${error.message}`, 'error');
    return;
  }

  if (window.iron.trainer) {
    window.iron.trainer.full_name = fullName;
  }

  window.iron.showToast('Account updated.', 'success');
}

async function sendPasswordReset(email) {
  const btn = document.getElementById('btn-change-password');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin +
      window.location.pathname.replace('portal.html', '') +
      'portal.html#settings'
  });

  btn.disabled = false;
  btn.textContent = 'Send password reset email';

  if (error) {
    window.iron.showToast(`Could not send reset email: ${error.message}`, 'error');
  } else {
    window.iron.showToast(`Password reset link sent to ${email}`, 'success');
  }
}

// ── Sign Out ───────────────────────────────────────────────

function bindSignOut() {
  document.getElementById('btn-signout').addEventListener('click', () => {
    window.iron.confirmDialog(
      'Are you sure you want to sign out?',
      async () => {
        await supabase.auth.signOut();
        window.location.href = 'index.html';
      },
      'Sign Out'
    );
  });
}

// ── Client Count ───────────────────────────────────────────

async function loadClientCount(trainerId) {
  const { count } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('trainer_id', trainerId)
    .eq('status', 'active');

  const el = document.getElementById('client-count-display');
  if (el) el.textContent = `${count ?? 0} active clients`;
}

// ── Escape helper ──────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
