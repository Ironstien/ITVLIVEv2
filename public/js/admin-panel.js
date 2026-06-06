/**
 * ITVLive v2 — Admin Panel modal (accounts, XP, platform).
 */
const ITVAdminPanel = (() => {
  const MODAL_ID = 'admin-panel';

  let bodyEl = null;
  let accountUser = null;
  let onAccountRefresh = null;
  let onToast = null;
  let auditContainer = null;

  function isAdmin(user) {
    return user?.staffRole === 'admin';
  }

  function escapeHtml(value) {
    return ITVStaffAuditUI.escapeHtml(value);
  }

  function formatStaffRole(user) {
    return ITVStaffAuditUI.formatStaffRole(user);
  }

  function toast(msg, isError) {
    if (typeof onToast === 'function') onToast(msg, isError);
  }

  async function refreshAuditLog() {
    if (!auditContainer) return;
    await ITVStaffAuditUI.loadAuditLog(
      auditContainer,
      'admin',
      'No admin actions logged yet.'
    );
  }

  async function searchUsers(query) {
    const data = await ITVAuth.api(`/api/admin/users/search?q=${encodeURIComponent(query)}`);
    return data.users || [];
  }

  async function assignRole(userId, staffRole) {
    return ITVAuth.api(`/api/admin/users/${encodeURIComponent(userId)}/staff-role`, {
      method: 'PATCH',
      body: JSON.stringify({ staffRole }),
    });
  }

  async function setUserXp(userId, xp) {
    return ITVAuth.api(`/api/admin/users/${encodeURIComponent(userId)}/xp`, {
      method: 'PATCH',
      body: JSON.stringify({ xp }),
    });
  }

  async function loadPlatform() {
    return ITVAuth.api('/api/admin/platform');
  }

  async function updatePlatform(body) {
    return ITVAuth.api('/api/admin/platform', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async function blockVideo(videoId, reason) {
    return ITVAuth.api('/api/admin/videos/block', {
      method: 'POST',
      body: JSON.stringify({ videoId, reason }),
    });
  }

  async function unblockVideo(youtubeId) {
    return ITVAuth.api(`/api/admin/videos/${encodeURIComponent(youtubeId)}`, {
      method: 'DELETE',
    });
  }

  async function resetUserStats(userId) {
    return ITVAuth.api(`/api/admin/users/${encodeURIComponent(userId)}/reset-stats`, {
      method: 'POST',
    });
  }

  async function resetUserBadges(userId) {
    return ITVAuth.api(`/api/admin/users/${encodeURIComponent(userId)}/reset-badges`, {
      method: 'POST',
    });
  }

  async function resetAllUsersBadges() {
    return ITVAuth.api('/api/admin/badges/reset-all', {
      method: 'POST',
      body: JSON.stringify({ confirm: 'RESET_ALL_BADGES' }),
    });
  }

  async function setAccountBan(userId, banned, reason) {
    return ITVAuth.api(`/api/admin/users/${encodeURIComponent(userId)}/ban`, {
      method: 'PATCH',
      body: JSON.stringify({ banned, reason }),
    });
  }

  async function forceDisconnect(userId) {
    return ITVAuth.api(`/api/admin/users/${encodeURIComponent(userId)}/disconnect`, {
      method: 'POST',
    });
  }

  async function loadOnlineUsers() {
    try {
      const data = await ITVAuth.api('/api/admin/online-users');
      const map = new Map();
      for (const u of data.users || []) {
        map.set(u.userId, u);
      }
      return map;
    } catch (_err) {
      return new Map();
    }
  }

  function bindPlatformEvents() {
    if (!bodyEl) return;

    bodyEl.querySelector('#panel-maintenance-save')?.addEventListener('click', async (btn) => {
      const toggle = bodyEl.querySelector('#panel-maintenance-mode');
      const messageInput = bodyEl.querySelector('#panel-maintenance-message');
      btn.currentTarget.disabled = true;
      try {
        await updatePlatform({
          maintenanceMode: Boolean(toggle?.checked),
          maintenanceMessage: messageInput?.value?.trim() || '',
        });
        toast('Platform settings saved');
        await refreshAuditLog();
        render();
      } catch (err) {
        toast(err.message, true);
      } finally {
        btn.currentTarget.disabled = false;
      }
    });

    bodyEl.querySelector('#panel-test-dj-save')?.addEventListener('click', async (btn) => {
      const toggle = bodyEl.querySelector('#panel-test-dj-enabled');
      btn.currentTarget.disabled = true;
      try {
        const result = await updatePlatform({
          testDjEnabled: Boolean(toggle?.checked),
        });
        const started = result.testDjRoom?.started;
        const stopped = result.testDjRoom?.stopped;
        let msg = result.settings?.testDjEnabled ? 'Bob McCluckn enabled' : 'Bob McCluckn disabled';
        if (started) msg += ' — now playing';
        if (stopped) msg += ' — playback stopped';
        toast(msg);
        await refreshAuditLog();
        render();
      } catch (err) {
        toast(err.message, true);
      } finally {
        btn.currentTarget.disabled = false;
      }
    });

    bodyEl.querySelector('#panel-bug-reports-download')?.addEventListener('click', async (btn) => {
      btn.currentTarget.disabled = true;
      try {
        const res = await fetch('/api/admin/bug-reports/download', {
          headers: ITVAuth.authHeaders(),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Download failed');
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bug-reports-${new Date().toISOString().slice(0, 10)}.jsonl`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('Bug report log downloaded');
      } catch (err) {
        toast(err.message, true);
      } finally {
        btn.currentTarget.disabled = false;
      }
    });

    bodyEl.querySelector('#panel-xp-multiplier-save')?.addEventListener('click', async (btn) => {
      const input = bodyEl.querySelector('#panel-xp-multiplier');
      const raw = Number(input?.value);
      if (!Number.isFinite(raw) || raw < 1) {
        toast('XP multiplier must be at least 1', true);
        return;
      }
      btn.currentTarget.disabled = true;
      try {
        const result = await updatePlatform({
          xpMultiplier: Math.floor(raw),
        });
        toast(`XP multiplier set to x${result.settings?.xpMultiplier ?? Math.floor(raw)}`);
        await refreshAuditLog();
        render();
      } catch (err) {
        toast(err.message, true);
      } finally {
        btn.currentTarget.disabled = false;
      }
    });

    bodyEl.querySelector('#panel-alerts-banner-save')?.addEventListener('click', async (btn) => {
      const messageInput = bodyEl.querySelector('#panel-alerts-banner-message');
      btn.currentTarget.disabled = true;
      try {
        await updatePlatform({
          alertsBannerMessage: messageInput?.value?.trim() || '',
        });
        toast('Moving Alerts Banner saved');
        await refreshAuditLog();
        render();
      } catch (err) {
        toast(err.message, true);
      } finally {
        btn.currentTarget.disabled = false;
      }
    });

    bodyEl.querySelector('#panel-block-video-btn')?.addEventListener('click', async (btn) => {
      const input = bodyEl.querySelector('#panel-block-video-input');
      const reasonInput = bodyEl.querySelector('#panel-block-video-reason');
      const videoId = input?.value?.trim();
      if (!videoId) {
        toast('Enter a YouTube URL or video ID', true);
        return;
      }
      btn.currentTarget.disabled = true;
      try {
        const result = await blockVideo(videoId, reasonInput?.value?.trim() || '');
        const skipped = result.skippedNowPlaying ? ' · skipped now playing' : '';
        toast(`Blocked ${result.video?.youtubeId || 'video'}${skipped}`);
        await refreshAuditLog();
        render();
      } catch (err) {
        toast(err.message, true);
      } finally {
        btn.currentTarget.disabled = false;
      }
    });

    bodyEl.querySelectorAll('[data-unblock-video-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const youtubeId = btn.getAttribute('data-unblock-video-id');
        if (!youtubeId) return;
        btn.disabled = true;
        try {
          await unblockVideo(youtubeId);
          toast(`Unblocked ${youtubeId}`);
          await refreshAuditLog();
          render();
        } catch (err) {
          toast(err.message, true);
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  function bindPanelEvents() {
    if (!bodyEl) return;

    const searchInput = bodyEl.querySelector('#panel-role-search');
    const searchBtn = bodyEl.querySelector('#panel-role-search-btn');
    const resultsEl = bodyEl.querySelector('#panel-role-results');

    async function runSearch() {
      if (!resultsEl) return;
      const q = searchInput?.value?.trim();
      if (!q || q.length < 2) {
        toast('Enter at least 2 characters to search', true);
        return;
      }
      resultsEl.innerHTML = '<p class="admin-tools__hint muted">Searching…</p>';
      try {
        const [users, onlineUsers] = await Promise.all([searchUsers(q), loadOnlineUsers()]);
        if (!users.length) {
          resultsEl.innerHTML = '<p class="admin-tools__hint muted">No users found.</p>';
          return;
        }
        resultsEl.innerHTML = users
          .map(
            (u) => {
              const online = onlineUsers.get(u.id);
              return `
          <div class="admin-role-row" data-user-id="${escapeHtml(u.id)}">
            <div class="admin-role-row__meta">
              <strong>${escapeHtml(u.username)}</strong>
              <span class="muted">${escapeHtml(u.email)}</span>
              <span class="muted">Lv.${u.level ?? 1} · ${u.xp ?? 0} XP${
                u.staffRole
                  ? typeof ITVRank !== 'undefined'
                    ? ` · ${ITVRank.formatStaffRole(u.staffRole)}`
                    : ` · ${escapeHtml(u.staffRole)}`
                  : ''
              }${u.isBanned ? ' · <strong class="admin-ban-badge">Banned</strong>' : ''}${
                online ? ' · <span class="admin-online-badge">Online</span>' : ''
              }</span>
              ${u.isBanned && u.banReason ? `<span class="muted admin-ban-reason">${escapeHtml(u.banReason)}</span>` : ''}
            </div>
            <div class="admin-role-row__controls">
              <label class="admin-tools__label" for="panel-xp-${escapeHtml(u.id)}">XP</label>
              <input
                type="number"
                id="panel-xp-${escapeHtml(u.id)}"
                class="admin-tools__input admin-role-row__xp"
                min="0"
                step="1"
                value="${u.xp ?? 0}"
                aria-label="XP for ${escapeHtml(u.username)}"
              />
              <button type="button" class="modal-action-btn auth-submit admin-role-row__xp-save">Set XP</button>
            </div>
            <div class="admin-role-row__controls">
              <label class="admin-tools__label">Role</label>
              <select class="admin-role-row__select" aria-label="Staff role for ${escapeHtml(u.username)}">
                <option value="none"${!u.staffRole ? ' selected' : ''}>None</option>
                <option value="mod"${u.staffRole === 'mod' ? ' selected' : ''}>Mod</option>
                <option value="admin"${u.staffRole === 'admin' ? ' selected' : ''}>Admin</option>
              </select>
              <button type="button" class="modal-action-btn auth-submit admin-role-row__save">Save role</button>
            </div>
            <div class="admin-role-row__controls admin-role-row__controls--danger">
              <button type="button" class="modal-action-btn auth-submit admin-role-row__reset-badges">Reset badges</button>
              <button type="button" class="modal-action-btn auth-submit admin-role-row__reset-stats">Reset stats</button>
              ${
                u.isBanned
                  ? `<button type="button" class="modal-action-btn auth-submit admin-role-row__unban">Unban</button>`
                  : `<button type="button" class="modal-action-btn auth-submit modal-action-btn--danger admin-role-row__ban">Ban</button>`
              }
              ${
                online
                  ? `<button type="button" class="modal-action-btn auth-submit modal-action-btn--danger admin-role-row__disconnect">Force disconnect</button>`
                  : ''
              }
            </div>
          </div>`;
            }
          )
          .join('');

        resultsEl.querySelectorAll('.admin-role-row__xp-save').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const row = btn.closest('.admin-role-row');
            const userId = row?.dataset.userId;
            const input = row?.querySelector('.admin-role-row__xp');
            if (!userId || !input) return;
            btn.disabled = true;
            try {
              const result = await setUserXp(userId, input.value);
              const user = result.user;
              toast(
                `Set ${user?.username || 'user'} to ${user?.xp ?? input.value} XP (Lv.${user?.level ?? '?'})`
              );
              if (accountUser?.id === userId && typeof onAccountRefresh === 'function') {
                await onAccountRefresh();
              }
              await refreshAuditLog();
              runSearch();
            } catch (err) {
              toast(err.message, true);
            } finally {
              btn.disabled = false;
            }
          });
        });

        resultsEl.querySelectorAll('.admin-role-row__save').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const row = btn.closest('.admin-role-row');
            const userId = row?.dataset.userId;
            const select = row?.querySelector('.admin-role-row__select');
            if (!userId || !select) return;
            btn.disabled = true;
            try {
              const result = await assignRole(userId, select.value);
              toast(`Updated ${result.user?.username || 'user'} → ${result.user?.staffRole || 'none'}`);
              if (accountUser?.id === userId && typeof onAccountRefresh === 'function') {
                await onAccountRefresh();
              }
              await refreshAuditLog();
              runSearch();
            } catch (err) {
              toast(err.message, true);
            } finally {
              btn.disabled = false;
            }
          });
        });

        resultsEl.querySelectorAll('.admin-role-row__reset-badges').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const row = btn.closest('.admin-role-row');
            const userId = row?.dataset.userId;
            if (!userId) return;
            if (
              !window.confirm(
                'Clear all earned badges and badge progress for this user? XP and level are kept. They can earn badges again from scratch.'
              )
            ) {
              return;
            }
            btn.disabled = true;
            try {
              const result = await resetUserBadges(userId);
              toast(`Reset badges for ${result.user?.username || 'user'}`);
              if (accountUser?.id === userId) {
                accountUser.badges = [];
                if (typeof ITVBadges !== 'undefined') ITVBadges.clearCelebrationCache?.();
                if (typeof onAccountRefresh === 'function') await onAccountRefresh();
              }
              await refreshAuditLog();
              runSearch();
            } catch (err) {
              toast(err.message, true);
            } finally {
              btn.disabled = false;
            }
          });
        });

        resultsEl.querySelectorAll('.admin-role-row__reset-stats').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const row = btn.closest('.admin-role-row');
            const userId = row?.dataset.userId;
            if (!userId) return;
            if (!window.confirm('Reset this user to 0 XP and level 1? This cannot be undone.')) return;
            btn.disabled = true;
            try {
              const result = await resetUserStats(userId);
              toast(`Reset stats for ${result.user?.username || 'user'}`);
              if (accountUser?.id === userId && typeof onAccountRefresh === 'function') {
                await onAccountRefresh();
              }
              await refreshAuditLog();
              runSearch();
            } catch (err) {
              toast(err.message, true);
            } finally {
              btn.disabled = false;
            }
          });
        });

        resultsEl.querySelectorAll('.admin-role-row__ban').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const row = btn.closest('.admin-role-row');
            const userId = row?.dataset.userId;
            if (!userId) return;
            const reason = window.prompt('Ban reason (optional):') ?? '';
            if (reason === null) return;
            btn.disabled = true;
            try {
              const result = await setAccountBan(userId, true, reason.trim());
              toast(`Banned ${result.user?.username || 'user'}`);
              await refreshAuditLog();
              runSearch();
            } catch (err) {
              toast(err.message, true);
            } finally {
              btn.disabled = false;
            }
          });
        });

        resultsEl.querySelectorAll('.admin-role-row__unban').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const row = btn.closest('.admin-role-row');
            const userId = row?.dataset.userId;
            if (!userId) return;
            if (!window.confirm('Unban this account?')) return;
            btn.disabled = true;
            try {
              const result = await setAccountBan(userId, false);
              toast(`Unbanned ${result.user?.username || 'user'}`);
              await refreshAuditLog();
              runSearch();
            } catch (err) {
              toast(err.message, true);
            } finally {
              btn.disabled = false;
            }
          });
        });

        resultsEl.querySelectorAll('.admin-role-row__disconnect').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const row = btn.closest('.admin-role-row');
            const userId = row?.dataset.userId;
            if (!userId) return;
            if (!window.confirm('Force disconnect this user from the stage?')) return;
            btn.disabled = true;
            try {
              await forceDisconnect(userId);
              toast('User disconnected');
              await refreshAuditLog();
              runSearch();
            } catch (err) {
              toast(err.message, true);
            } finally {
              btn.disabled = false;
            }
          });
        });
      } catch (err) {
        resultsEl.innerHTML = `<p class="admin-tools__hint muted">${escapeHtml(err.message || 'Search failed')}</p>`;
      }
    }

    searchBtn?.addEventListener('click', runSearch);
    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runSearch();
      }
    });
  }

  async function render() {
    if (!bodyEl) return;

    if (!accountUser) {
      bodyEl.innerHTML =
        '<p class="modal-card__lead muted">Log in with an admin account to open the Admin Panel.</p>';
      return;
    }

    if (!isAdmin(accountUser)) {
      bodyEl.innerHTML =
        '<p class="modal-card__lead muted">The Admin Panel is limited to administrators.</p>';
      return;
    }

    bodyEl.innerHTML = '<p class="modal-card__lead muted">Loading admin panel…</p>';

    let platformData;
    try {
      platformData = await loadPlatform();
    } catch (err) {
      bodyEl.innerHTML = `<p class="modal-card__lead muted">${escapeHtml(err.message || 'Failed to load admin panel')}</p>`;
      return;
    }

    const settings = platformData.settings || {};
    const blockedVideos = platformData.blockedVideos || [];
    const bugReportCount = platformData.bugReports?.count ?? 0;
    const roleHtml = formatStaffRole(accountUser);

    bodyEl.innerHTML = `
      <p class="modal-card__lead">Signed in as <strong>${escapeHtml(accountUser.username)}</strong> (${roleHtml}).</p>

      <section class="admin-tools__section">
        <h3 class="admin-tools__heading">Manage users</h3>
        <p class="admin-tools__hint muted">Search by username or email to assign staff roles, set XP, ban, or disconnect.</p>
        <div class="admin-tools__row">
          <input type="search" id="panel-role-search" class="admin-tools__input" placeholder="Username or email" autocomplete="off" />
          <button type="button" class="modal-action-btn auth-submit" id="panel-role-search-btn">Search</button>
        </div>
        <div id="panel-role-results" class="admin-role-results"></div>
      </section>

      <section class="admin-tools__section">
        <h3 class="admin-tools__heading">Platform</h3>
        <div class="admin-tools__row admin-tools__row--checkbox">
          <label class="admin-tools__checkbox">
            <input type="checkbox" id="panel-maintenance-mode"${settings.maintenanceMode ? ' checked' : ''} />
            Maintenance mode
          </label>
        </div>
        <div class="admin-tools__row">
          <label class="admin-tools__label" for="panel-maintenance-message">Maintenance message</label>
          <input
            type="text"
            id="panel-maintenance-message"
            class="admin-tools__input"
            maxlength="280"
            placeholder="Shown on stage when maintenance is on"
            value="${escapeHtml(settings.maintenanceMessage || '')}"
          />
        </div>
        <button type="button" class="modal-action-btn auth-submit" id="panel-maintenance-save">Save platform settings</button>
      </section>

      <section class="admin-tools__section">
        <h3 class="admin-tools__heading">XP multiplier</h3>
        <p class="admin-tools__hint muted">
          Multiplies all earned XP (listen, vote, DJ play). Set to <strong>1</strong> for normal rates.
          Active multiplier is shown in the nav bar for everyone (e.g. <strong>XP x10</strong>).
        </p>
        <div class="admin-tools__row">
          <label class="admin-tools__label" for="panel-xp-multiplier">Multiplier</label>
          <input
            type="number"
            id="panel-xp-multiplier"
            class="admin-tools__input"
            min="1"
            max="100"
            step="1"
            inputmode="numeric"
            value="${escapeHtml(String(settings.xpMultiplier ?? 1))}"
          />
        </div>
        <button type="button" class="modal-action-btn auth-submit" id="panel-xp-multiplier-save">Save XP multiplier</button>
      </section>

      <section class="admin-tools__section">
        <h3 class="admin-tools__heading">Test DJ — Bob McCluckn</h3>
        <p class="admin-tools__hint muted">
          When enabled, Bob McCluckn appears as a regular user in the room and DJ queue. He rotates like any other DJ,
          earns XP and badges organically, and keeps the stage moving when listeners are present. He cannot be logged
          into — only this toggle controls him. When disabled, he leaves the room and queue entirely.
        </p>
        <div class="admin-tools__row admin-tools__row--checkbox">
          <label class="admin-tools__checkbox">
            <input type="checkbox" id="panel-test-dj-enabled"${settings.testDjEnabled ? ' checked' : ''} />
            Bob McCluckn ON
          </label>
        </div>
        <button type="button" class="modal-action-btn auth-submit" id="panel-test-dj-save">Save Test DJ setting</button>
      </section>

      <section class="admin-tools__section">
        <h3 class="admin-tools__heading">Bug reports</h3>
        <p class="admin-tools__hint muted">
          Users submit reports from <strong>Report Bug</strong> in the nav. Reports append to
          <code>data/bug-reports.jsonl</code> on the server.
        </p>
        <p class="admin-tools__hint muted">${bugReportCount} report${bugReportCount === 1 ? '' : 's'} on file.</p>
        <button type="button" class="modal-action-btn auth-submit" id="panel-bug-reports-download"${bugReportCount ? '' : ' disabled'}>
          Download bug report log
        </button>
      </section>

      <section class="admin-tools__section">
        <h3 class="admin-tools__heading">Moving Alerts Banner</h3>
        <p class="admin-tools__hint muted">
          Text scrolls across the strip above the stage for all viewers. Clear the field to hide the banner.
          Maintenance mode overrides this message.
        </p>
        <div class="admin-tools__row">
          <label class="admin-tools__label" for="panel-alerts-banner-message">Banner text</label>
          <input
            type="text"
            id="panel-alerts-banner-message"
            class="admin-tools__input"
            maxlength="500"
            placeholder="e.g. Welcome to ITVLive — next event Friday 8pm GMT"
            value="${escapeHtml(settings.alertsBannerMessage || '')}"
          />
        </div>
        <button type="button" class="modal-action-btn auth-submit" id="panel-alerts-banner-save">Save banner text</button>
      </section>

      <section class="admin-tools__section">
        <h3 class="admin-tools__heading">Blocked videos</h3>
        <div class="admin-tools__row admin-tools__row--actions">
          <input type="text" id="panel-block-video-input" class="admin-tools__input" placeholder="YouTube URL or video ID" autocomplete="off" />
          <input type="text" id="panel-block-video-reason" class="admin-tools__input" placeholder="Reason (optional)" autocomplete="off" />
          <button type="button" class="modal-action-btn auth-submit modal-action-btn--danger" id="panel-block-video-btn">Block</button>
        </div>
        ${
          blockedVideos.length
            ? `<ul class="admin-muted-list">
                ${blockedVideos
                  .map(
                    (v) => `
                  <li class="admin-muted-list__item">
                    <span>${escapeHtml(v.youtubeId)}${v.reason ? ` · ${escapeHtml(v.reason)}` : ''}</span>
                    <button type="button" class="modal-action-btn auth-submit btn-sm" data-unblock-video-id="${escapeHtml(v.youtubeId)}">Unblock</button>
                  </li>`
                  )
                  .join('')}
              </ul>`
            : '<p class="admin-tools__hint muted">No blocked videos.</p>'
        }
      </section>

      <section class="admin-tools__section admin-tools__section--danger">
        <h3 class="admin-tools__heading">Badge testing</h3>
        <p class="admin-tools__hint muted">
          Clears every account&apos;s earned badges and badge progress counters (listens, votes, streaks, etc.). XP and
          level are not changed. Use per-user <strong>Reset badges</strong> in search when you only need one account.
        </p>
        <button
          type="button"
          class="modal-action-btn auth-submit modal-action-btn--danger"
          id="panel-reset-all-badges"
        >
          Reset all users&apos; badges
        </button>
      </section>

      <section class="admin-tools__section">
        <h3 class="admin-tools__heading">Recent admin actions</h3>
        <div id="panel-audit-log" class="admin-audit-log"></div>
      </section>

      <p class="admin-tools__hint muted">Use Mod Tools for live chat and stage moderation.</p>
    `;

    auditContainer = bodyEl.querySelector('#panel-audit-log');
    bindPanelEvents();
    bindPlatformEvents();
    bodyEl.querySelector('#panel-reset-all-badges')?.addEventListener('click', async () => {
      const btn = bodyEl.querySelector('#panel-reset-all-badges');
      if (
        !window.confirm(
          "Reset badge data for ALL users? This clears every earned badge and progress counter. Type OK in the next prompt if you're sure."
        )
      ) {
        return;
      }
      const typed = window.prompt('Type RESET_ALL_BADGES to confirm:');
      if (typed !== 'RESET_ALL_BADGES') {
        toast('Reset cancelled — confirmation did not match', true);
        return;
      }
      if (btn) btn.disabled = true;
      try {
        const result = await resetAllUsersBadges();
        toast(`Reset badge data for ${result.usersModified ?? 0} user(s)`);
        if (accountUser) {
          accountUser.badges = [];
          if (typeof ITVBadges !== 'undefined') ITVBadges.clearCelebrationCache?.();
          if (typeof onAccountRefresh === 'function') await onAccountRefresh();
        }
        await refreshAuditLog();
      } catch (err) {
        toast(err.message, true);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
    refreshAuditLog();
  }

  function init(options = {}) {
    bodyEl = document.getElementById('modal-admin-panel-body');
    onAccountRefresh = options.onAccountRefresh || null;
    onToast = options.onToast || null;

    document.querySelector(`[data-open-modal="${MODAL_ID}"]`)?.addEventListener('click', () => {
      render();
    });
  }

  function setContext({ user }) {
    accountUser = user || null;
  }

  return {
    init,
    setContext,
    isAdmin,
  };
})();
