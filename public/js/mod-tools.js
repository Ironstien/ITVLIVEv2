/**
 * ITVLive v2 — Mod Tools modal (live stage moderation).
 */
const ITVModTools = (() => {
  const MODAL_ID = 'mod-tools';
  const MUTE_MINUTES = [5, 15, 30, 60];

  let bodyEl = null;
  let socket = null;
  let accountUser = null;
  let onToast = null;
  let auditContainer = null;

  function isStaff(user) {
    const role = user?.staffRole;
    return role === 'mod' || role === 'admin';
  }

  function escapeHtml(value) {
    return ITVStaffAuditUI.escapeHtml(value);
  }

  function formatStaffRole(user) {
    return ITVStaffAuditUI.formatStaffRole(user);
  }

  function getOnlineAccountUsers() {
    const state = typeof ITVRoom !== 'undefined' ? ITVRoom.getState() : null;
    const users = state?.users || [];
    return users.filter((u) => u.userId && !u.isTestDj);
  }

  function toast(msg, isError) {
    if (typeof onToast === 'function') onToast(msg, isError);
  }

  function emitMod(event, payload) {
    return new Promise((resolve, reject) => {
      if (!socket?.connected) {
        reject(new Error('Not connected to the stage'));
        return;
      }
      socket.emit(event, payload || {}, (res) => {
        if (res?.error) reject(new Error(res.error));
        else resolve(res);
      });
    });
  }

  async function loadChatMutes() {
    try {
      const data = await ITVAuth.api('/api/admin/chat-mutes');
      return { mutes: data.mutes || [], chatLocked: Boolean(data.chatLocked) };
    } catch (_err) {
      return { mutes: [], chatLocked: false };
    }
  }

  function getQueuedUsers() {
    const state = typeof ITVRoom !== 'undefined' ? ITVRoom.getState() : null;
    const queue = state?.globalQueue || [];
    return queue.filter((entry) => entry.userId);
  }

  function getRecentChatMessages(limit = 20) {
    const state = typeof ITVRoom !== 'undefined' ? ITVRoom.getState() : null;
    const chat = state?.chat || [];
    return chat.filter((m) => m.id != null).slice(-limit).reverse();
  }

  async function refreshAuditLog() {
    if (!auditContainer) return;
    await ITVStaffAuditUI.loadAuditLog(
      auditContainer,
      'mod',
      'No moderation actions logged yet.'
    );
  }

  async function handleClearChat() {
    try {
      const res = await emitMod('mod:clearChat');
      toast(`Cleared ${res.cleared ?? 0} chat message${res.cleared === 1 ? '' : 's'}`);
      await refreshAuditLog();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function handleSkipSong() {
    try {
      await emitMod('mod:skipSong');
      toast('Skipped now playing');
      await refreshAuditLog();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function handleMute(targetUserId, durationMinutes) {
    try {
      const res = await emitMod('mod:muteUser', { targetUserId, durationMinutes });
      toast(`Muted ${res.target?.displayName || 'user'} for ${durationMinutes} min`);
      await refreshAuditLog();
      render();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function handleUnmute(targetUserId) {
    try {
      const res = await emitMod('mod:unmuteUser', { targetUserId });
      toast(`Unmuted ${res.target?.displayName || 'user'}`);
      await refreshAuditLog();
      render();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function handleRemoveFromQueue(targetUserId) {
    try {
      const res = await emitMod('mod:removeFromQueue', { targetUserId });
      toast(`Removed ${res.target?.displayName || 'user'} from queue`);
      await refreshAuditLog();
      render();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function handleDeleteMessage(messageId) {
    try {
      await emitMod('mod:deleteChatMessage', { messageId });
      toast('Deleted chat message');
      await refreshAuditLog();
      render();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function handleLockChat() {
    try {
      await emitMod('mod:lockChat');
      toast('Chat locked');
      await refreshAuditLog();
      render();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function handleUnlockChat() {
    try {
      await emitMod('mod:unlockChat');
      toast('Chat unlocked');
      await refreshAuditLog();
      render();
    } catch (err) {
      toast(err.message, true);
    }
  }

  function bindPanelEvents() {
    if (!bodyEl) return;

    bodyEl.querySelector('#mod-clear-chat')?.addEventListener('click', handleClearChat);
    bodyEl.querySelector('#mod-skip-song')?.addEventListener('click', handleSkipSong);

    const targetSelect = bodyEl.querySelector('#mod-target-user');
    const muteSelect = bodyEl.querySelector('#mod-mute-duration');

    bodyEl.querySelector('#mod-mute-user')?.addEventListener('click', () => {
      const targetUserId = targetSelect?.value;
      const durationMinutes = Number(muteSelect?.value);
      if (!targetUserId) {
        toast('Select an online user', true);
        return;
      }
      handleMute(targetUserId, durationMinutes);
    });

    bodyEl.querySelector('#mod-unmute-user')?.addEventListener('click', () => {
      const targetUserId = targetSelect?.value;
      if (!targetUserId) {
        toast('Select a user to unmute', true);
        return;
      }
      handleUnmute(targetUserId);
    });

    bodyEl.querySelectorAll('[data-unmute-user-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const userId = btn.getAttribute('data-unmute-user-id');
        if (userId) handleUnmute(userId);
      });
    });

    bodyEl.querySelector('#mod-remove-queue')?.addEventListener('click', () => {
      const select = bodyEl.querySelector('#mod-queue-user');
      const targetUserId = select?.value;
      if (!targetUserId) {
        toast('Select someone in the queue', true);
        return;
      }
      handleRemoveFromQueue(targetUserId);
    });

    bodyEl.querySelectorAll('[data-delete-message-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const messageId = btn.getAttribute('data-delete-message-id');
        if (messageId) handleDeleteMessage(messageId);
      });
    });

    bodyEl.querySelector('#mod-lock-chat')?.addEventListener('click', handleLockChat);
    bodyEl.querySelector('#mod-unlock-chat')?.addEventListener('click', handleUnlockChat);
  }

  async function render() {
    if (!bodyEl) return;

    if (!accountUser) {
      bodyEl.innerHTML =
        '<p class="modal-card__lead muted">Log in with a moderator or admin account to use Mod Tools.</p>';
      return;
    }

    if (!isStaff(accountUser)) {
      bodyEl.innerHTML =
        '<p class="modal-card__lead muted">Mod Tools are limited to moderators and admins.</p>';
      return;
    }

    const online = getOnlineAccountUsers().filter((u) => u.userId !== accountUser.id);
    const { mutes: mutedUsers, chatLocked } = await loadChatMutes();
    const queuedUsers = getQueuedUsers();
    const recentMessages = getRecentChatMessages();
    const np = typeof ITVRoom !== 'undefined' ? ITVRoom.getState()?.nowPlaying : null;
    const roleHtml = formatStaffRole(accountUser);

    const mutedOptionsHtml = mutedUsers.length
      ? mutedUsers
          .map((m) => {
            const label = m.displayName
              ? `${m.displayName} (${m.remainingMinutes} min left)`
              : `User ${m.userId.slice(-6)} (${m.remainingMinutes} min left)`;
            return `<option value="${escapeHtml(m.userId)}">${escapeHtml(label)}</option>`;
          })
          .join('')
      : '';

    const userOptions = online.length
      ? online
          .map(
            (u) =>
              `<option value="${escapeHtml(u.userId)}">${escapeHtml(u.displayName)} (Lv.${u.level ?? 1})</option>`
          )
          .join('')
      : mutedOptionsHtml || '<option value="">No other users online</option>';

    const hasUserTarget = online.length > 0 || mutedUsers.length > 0;

    const queueOptions = queuedUsers.length
      ? queuedUsers
          .map(
            (entry) =>
              `<option value="${escapeHtml(entry.userId)}">${escapeHtml(entry.djName || 'DJ')}${entry.title ? ` — ${escapeHtml(entry.title)}` : ''}</option>`
          )
          .join('')
      : '<option value="">No one waiting in queue</option>';

    bodyEl.innerHTML = `
      <p class="modal-card__lead">Signed in as <strong>${escapeHtml(accountUser.username)}</strong> (${roleHtml}).</p>

      <section class="admin-tools__section">
        <h3 class="admin-tools__heading">Stage</h3>
        <div class="admin-tools__actions">
          <button type="button" class="modal-action-btn auth-submit" id="mod-clear-chat">Clear chat</button>
          <button type="button" class="modal-action-btn auth-submit modal-action-btn--danger" id="mod-skip-song"${
            np ? '' : ' disabled'
          }>Skip now playing</button>
        </div>
        ${
          np
            ? `<p class="admin-tools__hint muted">Now playing: ${escapeHtml(np.djName || 'DJ')} — ${escapeHtml(np.title || np.videoId || '')}</p>`
            : '<p class="admin-tools__hint muted">Nothing playing — skip is disabled.</p>'
        }
      </section>

      <section class="admin-tools__section">
        <h3 class="admin-tools__heading">Chat</h3>
        <div class="admin-tools__row">
          <label class="admin-tools__label" for="mod-target-user">User</label>
          <select id="mod-target-user" class="admin-tools__select"${hasUserTarget ? '' : ' disabled'}>
            ${userOptions}
          </select>
        </div>
        <div class="admin-tools__row admin-tools__row--actions">
          <label class="admin-tools__label" for="mod-mute-duration">Mute</label>
          <select id="mod-mute-duration" class="admin-tools__select">
            ${MUTE_MINUTES.map((m) => `<option value="${m}">${m} min</option>`).join('')}
          </select>
          <button type="button" class="modal-action-btn auth-submit" id="mod-mute-user"${
            online.length ? '' : ' disabled'
          }>Mute</button>
          <button type="button" class="modal-action-btn auth-submit" id="mod-unmute-user"${
            hasUserTarget ? '' : ' disabled'
          }>Unmute</button>
        </div>
        ${
          mutedUsers.length
            ? `<div class="admin-tools__muted-list">
                <p class="admin-tools__hint muted">Currently muted:</p>
                <ul class="admin-muted-list">
                  ${mutedUsers
                    .map(
                      (m) => `
                    <li class="admin-muted-list__item">
                      <span>${escapeHtml(m.displayName || `User …${String(m.userId).slice(-6)}`)} · ${m.remainingMinutes} min left</span>
                      <button type="button" class="modal-action-btn auth-submit btn-sm" data-unmute-user-id="${escapeHtml(m.userId)}">Unmute</button>
                    </li>`
                    )
                    .join('')}
                </ul>
              </div>`
            : '<p class="admin-tools__hint muted">No active chat mutes.</p>'
        }
      </section>

      <section class="admin-tools__section">
        <h3 class="admin-tools__heading">DJ queue</h3>
        <div class="admin-tools__row admin-tools__row--actions">
          <label class="admin-tools__label" for="mod-queue-user">Waiting</label>
          <select id="mod-queue-user" class="admin-tools__select"${queuedUsers.length ? '' : ' disabled'}>
            ${queueOptions}
          </select>
          <button type="button" class="modal-action-btn auth-submit modal-action-btn--danger" id="mod-remove-queue"${
            queuedUsers.length ? '' : ' disabled'
          }>Remove from queue</button>
        </div>
        ${
          queuedUsers.length
            ? '<p class="admin-tools__hint muted">Removes a waiting DJ. Use Skip now playing for the current DJ.</p>'
            : '<p class="admin-tools__hint muted">No one is waiting in the queue.</p>'
        }
      </section>

      <section class="admin-tools__section">
        <h3 class="admin-tools__heading">Chat lock</h3>
        <p class="admin-tools__hint muted">Status: <strong>${chatLocked ? 'Locked' : 'Open'}</strong> — only staff can chat when locked.</p>
        <div class="admin-tools__actions">
          <button type="button" class="modal-action-btn auth-submit modal-action-btn--danger" id="mod-lock-chat"${
            chatLocked ? ' disabled' : ''
          }>Lock chat</button>
          <button type="button" class="modal-action-btn auth-submit" id="mod-unlock-chat"${
            chatLocked ? '' : ' disabled'
          }>Unlock chat</button>
        </div>
      </section>

      <section class="admin-tools__section">
        <h3 class="admin-tools__heading">Delete messages</h3>
        ${
          recentMessages.length
            ? `<ul class="admin-muted-list">
                ${recentMessages
                  .map((m) => {
                    const preview = String(m.text || '').slice(0, 60);
                    return `
                  <li class="admin-muted-list__item">
                    <span><strong>${escapeHtml(m.displayName || 'User')}</strong>: ${escapeHtml(preview)}${preview.length < String(m.text || '').length ? '…' : ''}</span>
                    <button type="button" class="modal-action-btn auth-submit btn-sm modal-action-btn--danger" data-delete-message-id="${escapeHtml(m.id)}">Delete</button>
                  </li>`;
                  })
                  .join('')}
              </ul>`
            : '<p class="admin-tools__hint muted">No recent chat messages on stage.</p>'
        }
      </section>

      <section class="admin-tools__section">
        <h3 class="admin-tools__heading">Recent moderation actions</h3>
        <div id="mod-audit-log" class="admin-audit-log"></div>
      </section>

      <p class="admin-tools__hint muted">This panel stays on top of the stage; music keeps playing.</p>
    `;

    auditContainer = bodyEl.querySelector('#mod-audit-log');
    bindPanelEvents();
    refreshAuditLog();
  }

  function init(options = {}) {
    bodyEl = document.getElementById('modal-mod-tools-body');
    onToast = options.onToast || null;

    document.querySelector(`[data-open-modal="${MODAL_ID}"]`)?.addEventListener('click', () => {
      render();
    });
  }

  function setContext({ user, activeSocket }) {
    accountUser = user || null;
    socket = activeSocket || null;
  }

  return {
    init,
    setContext,
    isStaff,
  };
})();
