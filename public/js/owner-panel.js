/**
 * ITVLive v2 — Owner panel (founder-only nav modal).
 */
const ITVOwnerPanel = (() => {
  const MODAL_ID = 'owner';

  let bodyEl = null;
  let accountUser = null;
  let onToast = null;
  let onAccountRefresh = null;
  let onNuclearWipe = null;
  let lastStatus = '';

  function isFounder(user) {
    return Boolean(user?.isFounder);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg, isError) {
    if (typeof onToast === 'function') onToast(msg, isError);
  }

  function setStatus(msg) {
    lastStatus = msg;
    const el = bodyEl?.querySelector('#owner-status');
    if (el) el.textContent = msg;
  }

  async function api(path, options = {}) {
    return ITVAuth.api(`/api/founder${path}`, options);
  }

  function confirmPhrase(expected, label) {
    const typed = window.prompt(`Type ${expected} to confirm ${label}:`);
    if (typed !== expected) {
      toast('Cancelled — confirmation did not match', true);
      return false;
    }
    return true;
  }

  function bindResetRow(key, endpoint, confirm, label) {
    const btn = bodyEl?.querySelector(`[data-owner-reset="${key}"]`);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (
        !window.confirm(
          `${label}?\n\nThis cannot be undone. You will be asked to type a confirmation phrase next.`
        )
      ) {
        return;
      }
      if (!confirmPhrase(confirm, label)) return;

      btn.disabled = true;
      try {
        const result = await api(endpoint, {
          method: 'POST',
          body: JSON.stringify({ confirm }),
        });
        const deleted = result.deleted;
        const summary =
          deleted != null
            ? `Deleted ${deleted} record(s)`
            : result.usersModified != null
              ? `Updated ${result.usersModified} user(s); cleared ${result.votesDeleted ?? 0} votes and ${result.xpTransactionsDeleted ?? 0} XP rows`
              : 'Done';
        setStatus(`${label}: ${summary}`);
        toast(summary);
        await render();
      } catch (err) {
        toast(err.message, true);
        setStatus(`${label} failed: ${err.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function bindLiveActions() {
    bodyEl.querySelector('#owner-clear-chat')?.addEventListener('click', async (btn) => {
      if (!window.confirm('Clear all live chat messages on stage?')) return;
      btn.currentTarget.disabled = true;
      try {
        const result = await api('/live/clear-chat', { method: 'POST' });
        setStatus(`Cleared ${result.cleared ?? 0} chat message(s)`);
        toast(`Cleared ${result.cleared ?? 0} chat message(s)`);
        await render();
      } catch (err) {
        toast(err.message, true);
      } finally {
        btn.currentTarget.disabled = false;
      }
    });

    bodyEl.querySelector('#owner-skip-song')?.addEventListener('click', async (btn) => {
      if (!window.confirm('Force-skip the song that is playing now?')) return;
      btn.currentTarget.disabled = true;
      try {
        const result = await api('/live/skip-song', { method: 'POST' });
        setStatus(`Skipped ${result.skipped?.djName || 'current DJ'} — ${result.skipped?.videoId || ''}`);
        toast('Song skipped');
        await render();
      } catch (err) {
        toast(err.message, true);
      } finally {
        btn.currentTarget.disabled = false;
      }
    });

    bodyEl.querySelector('#owner-reset-queue')?.addEventListener('click', async (btn) => {
      if (!window.confirm('Remove everyone waiting in the DJ queue?')) return;
      btn.currentTarget.disabled = true;
      try {
        const result = await api('/live/reset-queue', { method: 'POST' });
        setStatus(`Removed ${result.removed ?? 0} queue entr${result.removed === 1 ? 'y' : 'ies'}`);
        toast(`Queue cleared (${result.removed ?? 0})`);
        await render();
      } catch (err) {
        toast(err.message, true);
      } finally {
        btn.currentTarget.disabled = false;
      }
    });

    bodyEl.querySelector('#owner-maintenance-toggle')?.addEventListener('change', async (e) => {
      const toggle = e.currentTarget;
      toggle.disabled = true;
      try {
        await api('/platform', {
          method: 'PATCH',
          body: JSON.stringify({ maintenanceMode: toggle.checked }),
        });
        setStatus(`Maintenance mode ${toggle.checked ? 'on' : 'off'}`);
        toast(`Maintenance mode ${toggle.checked ? 'enabled' : 'disabled'}`);
      } catch (err) {
        toggle.checked = !toggle.checked;
        toast(err.message, true);
      } finally {
        toggle.disabled = false;
      }
    });

    bodyEl.querySelector('#owner-test-dj-toggle')?.addEventListener('change', async (e) => {
      const toggle = e.currentTarget;
      toggle.disabled = true;
      try {
        await api('/platform', {
          method: 'PATCH',
          body: JSON.stringify({ testDjEnabled: toggle.checked }),
        });
        setStatus(`Test DJ ${toggle.checked ? 'enabled' : 'disabled'}`);
        toast(`Test DJ ${toggle.checked ? 'on' : 'off'}`);
        await render();
      } catch (err) {
        toggle.checked = !toggle.checked;
        toast(err.message, true);
      } finally {
        toggle.disabled = false;
      }
    });
  }

  function bindNuclearWipe() {
    bodyEl.querySelector('#owner-nuclear-wipe')?.addEventListener('click', async (btn) => {
      if (
        !window.confirm(
          'NUCLEAR WIPE deletes ALL users, playlists, songs, votes, and history, then recreates only your founder account.\n\nContinue?'
        )
      ) {
        return;
      }
      if (!confirmPhrase('DELETE_ALL_USERS', 'nuclear wipe')) return;

      const password = window.prompt('Enter a new password for your founder account (min 8 characters):');
      if (!password || password.length < 8) {
        toast('Password must be at least 8 characters', true);
        return;
      }

      btn.disabled = true;
      try {
        await api('/reset/nuclear', {
          method: 'POST',
          body: JSON.stringify({ confirm: 'DELETE_ALL_USERS', password }),
        });
        setStatus('Nuclear wipe complete — log in with your new password');
        toast('Platform wiped. Log in again with your new password.');
        if (typeof onNuclearWipe === 'function') await onNuclearWipe();
      } catch (err) {
        toast(err.message, true);
        setStatus(`Nuclear wipe failed: ${err.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function renderResetRow(key, label, description, count, confirm) {
    const countLabel = count == null ? '—' : String(count);
    return `
      <div class="owner-reset-row">
        <div class="owner-reset-row__info">
          <strong>${escapeHtml(label)}</strong>
          <span class="admin-tools__hint muted">${escapeHtml(description)}</span>
          <span class="admin-tools__hint muted">${escapeHtml(countLabel)} record(s)</span>
        </div>
        <button
          type="button"
          class="modal-action-btn auth-submit modal-action-btn--danger"
          data-owner-reset="${escapeHtml(key)}"
          data-confirm="${escapeHtml(confirm)}"
        >Reset</button>
      </div>
    `;
  }

  async function render() {
    if (!bodyEl) return;

    if (!accountUser) {
      bodyEl.innerHTML =
        '<p class="modal-card__lead muted">Log in with the founder account to open Owner settings.</p>';
      return;
    }

    if (!isFounder(accountUser)) {
      bodyEl.innerHTML =
        '<p class="modal-card__lead muted">This panel is only available to the platform owner.</p>';
      return;
    }

    bodyEl.innerHTML = '<p class="modal-card__lead muted">Loading owner panel…</p>';

    let data;
    try {
      data = await api('/stats');
    } catch (err) {
      bodyEl.innerHTML = `<p class="modal-card__lead muted">${escapeHtml(err.message || 'Failed to load owner panel')}</p>`;
      return;
    }

    const counts = data.counts || {};
    const platform = data.platform || {};
    const room = data.room || {};
    const np = room.nowPlaying;
    const nowPlayingLabel = np
      ? `${np.djName || 'DJ'} — ${np.title || np.videoId || ''}`
      : 'Nothing playing';

    bodyEl.innerHTML = `
      <p class="modal-card__lead">
        Signed in as <strong>${escapeHtml(accountUser.username)}</strong> (owner).
        Accounts and playlists are kept unless you run a nuclear wipe.
      </p>

      <section class="admin-tools__section">
        <h3 class="admin-tools__heading">Live room</h3>
        <p class="admin-tools__hint muted">Now playing: ${escapeHtml(nowPlayingLabel)} · Queue: ${escapeHtml(String(room.queueLength ?? 0))} · Chat: ${escapeHtml(String(room.chatLength ?? 0))} message(s)</p>
        <div class="admin-tools__actions">
          <button type="button" class="modal-action-btn auth-submit" id="owner-clear-chat">Clear chat</button>
          <button type="button" class="modal-action-btn auth-submit modal-action-btn--danger" id="owner-skip-song"${np ? '' : ' disabled'}>Skip now playing</button>
          <button type="button" class="modal-action-btn auth-submit modal-action-btn--danger" id="owner-reset-queue">Reset DJ queue</button>
        </div>
        <div class="admin-tools__row admin-tools__row--checkbox">
          <label class="admin-tools__checkbox">
            <input type="checkbox" id="owner-maintenance-toggle"${platform.maintenanceMode ? ' checked' : ''} />
            Maintenance mode
          </label>
        </div>
        <div class="admin-tools__row admin-tools__row--checkbox">
          <label class="admin-tools__checkbox">
            <input type="checkbox" id="owner-test-dj-toggle"${platform.testDjEnabled ? ' checked' : ''} />
            Test DJ (Bob McCluckn)
          </label>
        </div>
      </section>

      <section class="admin-tools__section admin-tools__section--danger">
        <h3 class="admin-tools__heading">Database resets</h3>
        <p class="admin-tools__hint muted">Each action needs a typed confirmation. User progress reset keeps logins and playlists.</p>
        <div class="owner-reset-list">
          ${renderResetRow(
            'songs',
            'Song data',
            'Wipe aggregated play and vote stats per track.',
            counts.songs,
            'RESET_SONGS'
          )}
          ${renderResetRow(
            'votes',
            'Vote data',
            'Delete every stored vote score.',
            counts.votes,
            'RESET_VOTES'
          )}
          ${renderResetRow(
            'play-sessions',
            'Play sessions',
            'Delete DJ play session history.',
            counts.playSessions,
            'RESET_PLAY_SESSIONS'
          )}
          ${renderResetRow(
            'xp-transactions',
            'XP transactions',
            'Delete XP earn/spend history (user XP totals unchanged).',
            counts.xpTransactions,
            'RESET_XP_TRANSACTIONS'
          )}
          ${renderResetRow(
            'user-progress',
            'User progress',
            'Reset XP, level, stats, and badges for all accounts. Playlists stay.',
            counts.users,
            'RESET_USER_PROGRESS'
          )}
        </div>
      </section>

      <section class="admin-tools__section admin-tools__section--danger">
        <h3 class="admin-tools__heading">Nuclear wipe</h3>
        <p class="admin-tools__hint muted">
          Deletes all users, playlists (${escapeHtml(String(counts.playlists ?? 0))}), songs, votes, and history.
          Recreates only the founder account with a new password.
        </p>
        <button type="button" class="modal-action-btn auth-submit modal-action-btn--danger" id="owner-nuclear-wipe">Nuclear wipe</button>
      </section>

      <p class="admin-tools__hint muted" id="owner-status" aria-live="polite">${escapeHtml(lastStatus || 'No actions run yet this session.')}</p>
    `;

    bindLiveActions();
    bindNuclearWipe();
    bindResetRow('songs', '/reset/songs', 'RESET_SONGS', 'Song data');
    bindResetRow('votes', '/reset/votes', 'RESET_VOTES', 'Vote data');
    bindResetRow('play-sessions', '/reset/play-sessions', 'RESET_PLAY_SESSIONS', 'Play sessions');
    bindResetRow('xp-transactions', '/reset/xp-transactions', 'RESET_XP_TRANSACTIONS', 'XP transactions');
    bindResetRow('user-progress', '/reset/user-progress', 'RESET_USER_PROGRESS', 'User progress');
  }

  function init(options = {}) {
    bodyEl = document.getElementById('modal-owner-body');
    onToast = options.onToast || null;
    onAccountRefresh = options.onAccountRefresh || null;
    onNuclearWipe = options.onNuclearWipe || null;

    document.querySelector(`[data-open-modal="${MODAL_ID}"]`)?.addEventListener('click', () => {
      render();
    });
  }

  function setContext({ user }) {
    accountUser = user || null;
  }

  function updateFounderNav(navWrap) {
    if (!navWrap) return;
    navWrap.classList.toggle('hidden', !isFounder(accountUser));
  }

  return {
    init,
    setContext,
    isFounder,
    updateFounderNav,
  };
})();
