/**
 * ITVLive v2 — user settings modal (nav username click).
 */
const ITVUserSettings = (() => {
  const MODAL_ID = 'user-settings';
  const GUEST_NAME_KEY = 'itv-guest-name';

  let bodyEl = null;
  let ctx = null;
  let draft = null;
  let deleteConfirmOpen = false;

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch (_err) {
      return escapeHtml(iso);
    }
  }

  function getGuestName() {
    if (ctx?.getGuestName) return ctx.getGuestName();
    const stored = localStorage.getItem(GUEST_NAME_KEY);
    if (stored && stored.trim().length >= 2) return stored.trim().slice(0, 24);
    return 'Guest';
  }

  function setGuestName(name) {
    const trimmed = String(name || '').trim().slice(0, 24);
    if (trimmed.length >= 2) {
      localStorage.setItem(GUEST_NAME_KEY, trimmed);
    }
    if (ctx?.setGuestNav) ctx.setGuestNav(trimmed);
  }

  function buildAvatarPreviewHtml(url, username, { pit = false } = {}) {
    const initial = escapeHtml((username || '?').charAt(0).toUpperCase());
    const labelContent = url
      ? `<img class="vinyl-record__avatar" src="${escapeHtml(url)}" alt="" loading="lazy" />`
      : `<span class="vinyl-record__initial" aria-hidden="true">${initial}</span>`;

    if (pit) {
      return `
        <div class="vinyl-record user-settings__pit-disc" aria-hidden="true">
          <div class="vinyl-record__label">${labelContent}</div>
        </div>
      `;
    }

    if (url) {
      return `<img class="user-settings__chat-avatar" src="${escapeHtml(url)}" alt="" loading="lazy" />`;
    }
    return `<span class="user-settings__chat-initial" aria-hidden="true">${initial}</span>`;
  }

  function updateAvatarPreviews(root) {
    const url = root.querySelector('#settings-avatar-url')?.value?.trim() || '';
    const username = ctx?.getAccountUser?.()?.username || getGuestName();
    const chatEl = root.querySelector('#settings-avatar-chat-preview');
    const pitEl = root.querySelector('#settings-avatar-pit-preview');
    if (chatEl) chatEl.innerHTML = buildAvatarPreviewHtml(url, username, { pit: false });
    if (pitEl) pitEl.innerHTML = buildAvatarPreviewHtml(url, username, { pit: true });
  }

  function renderToggle(id, label, checked, hint = '') {
    return `
      <label class="user-settings__toggle" for="${id}">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} />
        <span class="user-settings__toggle-text">
          <span class="user-settings__toggle-label">${escapeHtml(label)}</span>
          ${hint ? `<span class="user-settings__toggle-hint muted">${escapeHtml(hint)}</span>` : ''}
        </span>
      </label>
    `;
  }

  function renderSection(title, innerHtml) {
    return `
      <section class="user-settings__section">
        <h3 class="user-settings__section-title">${escapeHtml(title)}</h3>
        ${innerHtml}
      </section>
    `;
  }

  function renderGuest() {
    const name = getGuestName();
    const prefs = typeof ITVAppPrefs !== 'undefined' ? ITVAppPrefs.getAll() : {};

    bodyEl.innerHTML = `
      <p class="modal-card__lead">Guests can listen and chat. Create an account to DJ, build playlists, and earn badges.</p>
      ${renderSection(
        'Display name',
        `
        <div class="auth-field">
          <label for="settings-guest-name">Chat name</label>
          <input id="settings-guest-name" type="text" minlength="2" maxlength="24" value="${escapeHtml(name)}" autocomplete="nickname" />
        </div>
      `
      )}
      <div class="user-settings__cta">
        <button type="button" class="btn-primary btn-sm" id="settings-guest-register">Create account</button>
        <button type="button" class="btn-ghost btn-sm" id="settings-guest-login">Log in</button>
      </div>
      <p id="settings-error" class="form-error hidden" role="alert"></p>
      <div class="user-settings__footer">
        <button type="button" class="btn-primary auth-submit" id="settings-save">Save</button>
      </div>
    `;

    bodyEl.querySelector('#settings-guest-register')?.addEventListener('click', () => {
      ITVModal.close(MODAL_ID);
      if (typeof ITVAuthUI !== 'undefined') {
        ITVAuthUI.setMode('register');
        const email = document.getElementById('auth-email');
        email?.focus();
      }
      ITVModal.open('login');
    });

    bodyEl.querySelector('#settings-guest-login')?.addEventListener('click', () => {
      ITVModal.close(MODAL_ID);
      if (typeof ITVAuthUI !== 'undefined' && ITVAuthUI.prepareLogin) ITVAuthUI.prepareLogin();
      ITVModal.open('login');
    });

    bodyEl.querySelector('#settings-save')?.addEventListener('click', () => saveGuest());
  }

  function renderLoggedIn(user) {
    const prefs = typeof ITVAppPrefs !== 'undefined' ? ITVAppPrefs.getAll() : {};
    const isStaff = user.staffRole === 'mod' || user.staffRole === 'admin';
    const staffRoleHtml =
      isStaff && typeof ITVRank !== 'undefined'
        ? ITVRank.formatStaffRole(user.staffRole)
        : isStaff
          ? escapeHtml(user.staffRole)
          : '';

    draft = {
      avatarUrl: user.avatarUrl || '',
      customSaying: user.customSaying || '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      ...prefs,
    };
    deleteConfirmOpen = false;

    bodyEl.innerHTML = `
      ${renderSection(
        'Profile',
        `
        <div class="user-settings__avatar-previews">
          <div class="user-settings__preview">
            <span class="user-settings__preview-label muted">Chat</span>
            <div id="settings-avatar-chat-preview" class="user-settings__preview-box"></div>
          </div>
          <div class="user-settings__preview">
            <span class="user-settings__preview-label muted">Vinyl Pit</span>
            <div id="settings-avatar-pit-preview" class="user-settings__preview-box user-settings__preview-box--pit"></div>
          </div>
        </div>
        <div class="auth-field">
          <label for="settings-avatar-url">Avatar image URL</label>
          <input id="settings-avatar-url" type="url" inputmode="url" placeholder="https://…" value="${escapeHtml(draft.avatarUrl)}" autocomplete="off" />
        </div>
        <div class="auth-field">
          <label for="settings-custom-saying">Quote</label>
          <input id="settings-custom-saying" type="text" maxlength="200" value="${escapeHtml(draft.customSaying)}" placeholder="Optional tagline shown on your profile" />
        </div>
      `
      )}
      ${renderSection(
        'App settings',
        `
        <div class="auth-field">
          <label for="settings-volume">Default volume</label>
          <input id="settings-volume" type="range" min="0" max="100" step="1" value="${escapeHtml(prefs.volume)}" />
        </div>
        <div class="user-settings__toggles">
          ${renderToggle('settings-chat-timestamps', 'Show chat timestamps', prefs.chatTimestamps)}
          ${renderToggle('settings-chat-compact', 'Compact chat', prefs.chatCompact, 'Less vertical spacing between messages')}
          ${renderToggle('settings-chat-hide-system', 'Hide system messages', prefs.chatHideSystem, 'Hides badge-earned announcements in chat')}
          ${renderToggle('settings-chat-mention', 'Highlight mentions', prefs.chatMentionHighlight, 'When your username appears in a message')}
          ${renderToggle('settings-badge-toasts', 'Badge earned popup', prefs.badgeToasts, 'Show celebration modal when you earn a badge')}
        </div>
      `
      )}
      ${renderSection(
        'Account',
        `
        <table class="my-data-table user-settings__meta-table">
          <tr><th scope="row">Username</th><td>${escapeHtml(user.username)}</td></tr>
          <tr><th scope="row">Email</th><td>${escapeHtml(user.email)}</td></tr>
          <tr><th scope="row">User ID</th><td>${escapeHtml(user.id)}</td></tr>
          <tr><th scope="row">Member since</th><td>${formatDate(user.createdAt)}</td></tr>
          <tr><th scope="row">Last updated</th><td>${formatDate(user.updatedAt)}</td></tr>
        </table>
      `
      )}
      ${
        isStaff
          ? renderSection(
              'Staff',
              `<p class="user-settings__staff-role">${staffRoleHtml}</p>`
            )
          : ''
      }
      ${renderSection(
        'Security',
        `
        <div class="auth-field">
          <label for="settings-current-password">Current password</label>
          <input id="settings-current-password" type="password" autocomplete="off" data-lpignore="true" />
        </div>
        <div class="auth-field">
          <label for="settings-new-password">New password</label>
          <input id="settings-new-password" type="password" autocomplete="off" data-lpignore="true" minlength="8" />
        </div>
        <div class="auth-field">
          <label for="settings-confirm-password">Confirm new password</label>
          <input id="settings-confirm-password" type="password" autocomplete="off" data-lpignore="true" minlength="8" />
        </div>
        <p class="user-settings__hint muted">Leave password fields blank to keep your current password.</p>
        <div class="user-settings__danger-zone">
          <p class="user-settings__danger-lead">Deactivate your account. Your data is retained and an admin can restore access.</p>
          <button type="button" class="btn-ghost btn-sm user-settings__danger-btn" id="settings-delete-toggle">Deactivate account</button>
          <div class="user-settings__delete-confirm hidden" id="settings-delete-confirm">
            <p class="muted">This will log you out immediately. Are you sure?</p>
            <div class="user-settings__cta">
              <button type="button" class="btn-ghost btn-sm" id="settings-delete-cancel">Cancel</button>
              <button type="button" class="btn-sm modal-action-btn--danger user-settings__danger-btn" id="settings-delete-submit">Yes, deactivate</button>
            </div>
          </div>
        </div>
      `
      )}
      ${renderSection(
        'Session',
        `<button type="button" class="btn-ghost btn-sm" id="settings-logout">Log out</button>`
      )}
      <p id="settings-error" class="form-error hidden" role="alert"></p>
      <div class="user-settings__footer">
        <button type="button" class="btn-primary auth-submit" id="settings-save">Save</button>
      </div>
    `;

    updateAvatarPreviews(bodyEl);

    bodyEl.querySelector('#settings-avatar-url')?.addEventListener('input', () => updateAvatarPreviews(bodyEl));
    bodyEl.querySelector('#settings-save')?.addEventListener('click', () => saveLoggedIn(user));
    bodyEl.querySelector('#settings-logout')?.addEventListener('click', () => logout());
    bodyEl.querySelector('#settings-delete-toggle')?.addEventListener('click', () => {
      deleteConfirmOpen = true;
      bodyEl.querySelector('#settings-delete-confirm')?.classList.remove('hidden');
      bodyEl.querySelector('#settings-delete-toggle')?.classList.add('hidden');
    });
    bodyEl.querySelector('#settings-delete-cancel')?.addEventListener('click', () => {
      deleteConfirmOpen = false;
      bodyEl.querySelector('#settings-delete-confirm')?.classList.add('hidden');
      bodyEl.querySelector('#settings-delete-toggle')?.classList.remove('hidden');
    });
    bodyEl.querySelector('#settings-delete-submit')?.addEventListener('click', () => deactivateAccount());
  }

  function showError(message) {
    const el = bodyEl?.querySelector('#settings-error');
    if (!el) return;
    if (message) {
      el.textContent = message;
      el.classList.remove('hidden');
    } else {
      el.textContent = '';
      el.classList.add('hidden');
    }
  }

  async function saveGuest() {
    showError('');
    const nameInput = bodyEl.querySelector('#settings-guest-name');
    const name = nameInput?.value?.trim() || '';
    if (name.length < 2) {
      showError('Display name must be at least 2 characters');
      return;
    }
    setGuestName(name);
    if (ctx?.reconnectSocket) await ctx.reconnectSocket();
    ctx?.toast?.('Settings saved');
    ITVModal.close(MODAL_ID);
  }

  async function saveLoggedIn(user) {
    showError('');
    const saveBtn = bodyEl.querySelector('#settings-save');
    if (saveBtn) saveBtn.disabled = true;

    try {
      const avatarUrl = bodyEl.querySelector('#settings-avatar-url')?.value?.trim() || '';
      const customSaying = bodyEl.querySelector('#settings-custom-saying')?.value?.trim() || '';
      const currentPassword = bodyEl.querySelector('#settings-current-password')?.value || '';
      const newPassword = bodyEl.querySelector('#settings-new-password')?.value || '';
      const confirmPassword = bodyEl.querySelector('#settings-confirm-password')?.value || '';
      const volume = Number(bodyEl.querySelector('#settings-volume')?.value);
      const prefs = {
        chatTimestamps: bodyEl.querySelector('#settings-chat-timestamps')?.checked ?? false,
        chatCompact: bodyEl.querySelector('#settings-chat-compact')?.checked ?? false,
        chatHideSystem: bodyEl.querySelector('#settings-chat-hide-system')?.checked ?? false,
        chatMentionHighlight: bodyEl.querySelector('#settings-chat-mention')?.checked ?? false,
        badgeToasts: bodyEl.querySelector('#settings-badge-toasts')?.checked ?? false,
        volume,
      };

      const wantsPasswordChange = Boolean(newPassword || confirmPassword);
      if (wantsPasswordChange) {
        if (!currentPassword || !newPassword) {
          showError('Enter current and new password to change it');
          return;
        }
        if (newPassword !== confirmPassword) {
          showError('New passwords do not match');
          return;
        }
        await ITVAuth.api('/api/auth/password', {
          method: 'PATCH',
          body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
        });
        bodyEl.querySelector('#settings-current-password').value = '';
        bodyEl.querySelector('#settings-new-password').value = '';
        bodyEl.querySelector('#settings-confirm-password').value = '';
      }

      const profileData = await ITVAuth.api('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ avatarUrl, customSaying }),
      });

      if (typeof ITVAppPrefs !== 'undefined') {
        ITVAppPrefs.saveAll(prefs);
      }

      if (profileData.user && ctx?.setAccountUser) {
        await ctx.setAccountUser(profileData.user);
      }
      if (ctx?.reconnectSocket) await ctx.reconnectSocket();

      ctx?.toast?.('Settings saved');
      ITVModal.close(MODAL_ID);
    } catch (err) {
      showError(err.message || 'Could not save settings');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function logout() {
    ITVModal.close(MODAL_ID);
    if (ctx?.logout) await ctx.logout();
  }

  async function deactivateAccount() {
    const confirmBtn = bodyEl.querySelector('#settings-delete-submit');
    if (confirmBtn) confirmBtn.disabled = true;
    showError('');
    try {
      await ITVAuth.api('/api/auth/account', { method: 'DELETE' });
      ITVModal.close(MODAL_ID);
      if (ctx?.logout) await ctx.logout();
      ctx?.toast?.('Account deactivated');
    } catch (err) {
      showError(err.message || 'Could not deactivate account');
    } finally {
      if (confirmBtn) confirmBtn.disabled = false;
    }
  }

  function open() {
    if (!bodyEl) return;
    showError('');
    const user = ctx?.getAccountUser?.();
    if (user) {
      renderLoggedIn(user);
    } else {
      renderGuest();
    }
    ITVModal.open(MODAL_ID);
  }

  function bindNavTrigger() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#nav-user-settings-btn');
      if (!btn) return;
      e.preventDefault();
      open();
    });
  }

  function init(options = {}) {
    ctx = options;
    bodyEl = document.getElementById('modal-user-settings-body');
    bindNavTrigger();
  }

  return { init, open };
})();
