/**
 * ITVLive v2 — room UI module.
 * Subscribes to room:state only; never touches the YouTube player.
 */
const ITVRoom = (() => {
  let socket = null;
  let mySocketId = null;
  let roomState = null;

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildUserNameButtonHtml(user = {}) {
    const name = user.displayName || user.djName || 'Guest';
    const nameInner =
      typeof ITVRank !== 'undefined'
        ? ITVRank.formatChatName(name, {
            level: user.level ?? 1,
            staffRole: user.staffRole ?? null,
            asButton: true,
          })
        : escapeHtml(name);
    const userIdAttr = user.userId ? ` data-user-id="${escapeHtml(user.userId)}"` : '';
    const levelAttr = ` data-level="${escapeHtml(user.level ?? 1)}"`;
    const displayAttr = ` data-display-name="${escapeHtml(name)}"`;
    return `<button type="button" class="chat-name-btn"${userIdAttr}${levelAttr}${displayAttr}>${nameInner}</button>`;
  }

  function findUserMeta(users, { socketId, userId, djName } = {}) {
    if (!users?.length) return null;
    if (socketId) {
      const match = users.find((u) => u.socketId === socketId);
      if (match) return match;
    }
    if (userId) {
      const match = users.find((u) => u.userId === userId);
      if (match) return match;
    }
    if (djName) {
      const match = users.find((u) => u.displayName === djName);
      if (match) return match;
    }
    return null;
  }

  function buildVinylRecord(u, { spinning = false, onAir = false } = {}) {
    const labelContent = u.avatarUrl
      ? `<img class="vinyl-record__avatar" src="${escapeHtml(u.avatarUrl)}" alt="" loading="lazy" />`
      : `<span class="vinyl-record__initial" aria-hidden="true">${escapeHtml((u.displayName || '?').charAt(0).toUpperCase())}</span>`;
    const spinClass = spinning ? ' vinyl-record--spinning' : '';
    const onAirClass = onAir || spinning ? ' vinyl-record--on-air' : '';
    return `
      <div class="vinyl-record${spinClass}${onAirClass}" aria-label="${escapeHtml(u.displayName)}">
        <div class="vinyl-record__label">${labelContent}</div>
      </div>
    `;
  }

  function syncCurrentDjSpin(playing) {
    const record = $('current-dj-avatar')?.querySelector('.vinyl-record--spinning');
    if (!record) return;
    record.classList.toggle('vinyl-record--spin-paused', !playing);
  }

  function buildVinylTooltip(u) {
    const rankLine =
      typeof ITVRank !== 'undefined'
        ? ITVRank.formatLevelRankLine(u.level ?? 1)
        : `Level ${u.level ?? 1}`;
    return `
      <div class="vinyl-tooltip" role="tooltip">
        <p class="vinyl-tooltip__name">${escapeHtml(u.displayName)}</p>
        <p class="vinyl-tooltip__rank">${rankLine}</p>
      </div>
    `;
  }

  function createVinylUserEl(u, { isCurrentDj = false, inQueue = false } = {}) {
    const disc = document.createElement('div');
    disc.className = 'vinyl-user';
    if (isCurrentDj) disc.classList.add('vinyl-user--current-dj');
    else if (inQueue) disc.classList.add('vinyl-user--queued');
    if (!isCurrentDj) disc.tabIndex = 0;
    disc.innerHTML =
      buildVinylRecord(u) + (isCurrentDj ? '' : buildVinylTooltip(u, { inQueue }));
    return disc;
  }

  function renderVinylRow(container, users, { inQueue = false } = {}) {
    if (!container) return;
    container.innerHTML = '';
    if (!users.length) {
      container.innerHTML = `<p class="vinyl-pit-empty muted">${inQueue ? 'No one queued' : 'No listeners yet'}</p>`;
      return;
    }

    const maxDiscs = getVinylPitMaxDiscs();
    const visible = Number.isFinite(maxDiscs) ? users.slice(0, maxDiscs) : users;
    const overflow = users.length - visible.length;

    visible.forEach((u) => {
      container.appendChild(createVinylUserEl(u, { inQueue }));
    });

    if (overflow > 0) {
      const more = document.createElement('p');
      more.className = 'vinyl-pit-overflow muted';
      more.textContent = `+${overflow} more`;
      more.setAttribute('aria-label', `${overflow} more ${inQueue ? 'in queue' : 'listening'}`);
      container.appendChild(more);
    }
  }

  function getVinylPitMaxDiscs() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--vinyl-pit-max-discs').trim();
    if (!raw) return Infinity;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : Infinity;
  }

  function updateDjBanner(nowPlaying) {
    const dj = $('dj-name');
    const title = $('now-title');
    if (!nowPlaying?.videoId) {
      if (dj) dj.textContent = '—';
      if (title) title.textContent = '—';
      return;
    }
    if (dj) dj.textContent = nowPlaying.djName || '—';
    if (title) title.textContent = nowPlaying.title || '—';
  }

  let currentDjProfileUserId = null;
  let currentDjProfileRequest = 0;
  let currentDjProfileCache = null;

  function formatDjNameHtml(dj) {
    if (typeof ITVRank !== 'undefined') {
      return ITVRank.formatChatName(dj.displayName, {
        level: dj.level ?? 1,
        staffRole: dj.staffRole ?? null,
      });
    }
    return escapeHtml(dj.displayName);
  }

  function buildStageStatItem(label, value) {
    return `
      <div class="current-dj-stats__item">
        <p class="current-dj-stats__label">${escapeHtml(label)}</p>
        <p class="current-dj-stats__value">${escapeHtml(value)}</p>
      </div>
      <hr class="current-dj-stats__rule" aria-hidden="true" />
    `;
  }

  function buildStageStatsSection(profile, { loading = false } = {}) {
    const highlights = profile?.stageHighlights || {};
    const most = loading ? '…' : highlights.mostPlayedSong?.title || '—';
    const highest = loading ? '…' : highlights.highestVotedSong?.title || '—';
    const earned = profile?.badgesEarned ?? profile?.badges?.length ?? 0;
    const total = profile?.badgesTotal;
    const badgesLine = loading ? '…' : total != null ? `${earned} of ${total}` : '—';

    return `
      <section class="current-dj-stats__section">
        <h4 class="current-dj-stats__heading">Stage stats</h4>
        <hr class="current-dj-stats__rule" aria-hidden="true" />
        ${buildStageStatItem('Most played', most)}
        ${buildStageStatItem('Highest voted', highest)}
        ${buildStageStatItem('Badges', String(badgesLine))}
      </section>
    `;
  }

  function buildCurrentDjStatsHtml(dj, { stageStatsHtml = '' } = {}) {
    const rankLine =
      typeof ITVRank !== 'undefined'
        ? ITVRank.formatLevelRankLine(dj.level ?? 1, { levelPrefix: 'Level ' })
        : `Level ${dj.level ?? 1}`;
    return `
      <div class="current-dj-panel current-dj-panel--stats">
        <h3 class="current-dj-stats__name">${formatDjNameHtml(dj)}</h3>
        <p class="current-dj-stats__rank">${rankLine}</p>
        ${stageStatsHtml}
      </div>
    `;
  }

  function updateCurrentDjStageStats(statsEl, dj, profile) {
    const panel = statsEl.querySelector('.current-dj-panel--stats');
    if (!panel) return;
    panel.querySelector('.current-dj-stats__section')?.remove();
    if (dj.userId) {
      panel.insertAdjacentHTML('beforeend', buildStageStatsSection(profile));
    }
  }

  async function loadCurrentDjStageStats(userId, statsEl, djSocketId) {
    const requestId = ++currentDjProfileRequest;
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}/profile`);
      const data = await res.json();
      if (requestId !== currentDjProfileRequest) return;
      if (roomState?.nowPlaying?.socketId !== djSocketId) return;

      const profile = res.ok && data.profile ? data.profile : null;
      if (profile) {
        currentDjProfileCache = { userId, profile };
      }
      updateCurrentDjStageStats(statsEl, { userId }, profile);
    } catch (_err) {
      if (requestId !== currentDjProfileRequest) return;
      updateCurrentDjStageStats(statsEl, { userId }, null);
    }
  }

  function renderCurrentDj(state) {
    const avatarEl = $('current-dj-avatar');
    const statsEl = $('current-dj-stats');
    if (!avatarEl || !statsEl) return;

    const np = state?.nowPlaying;
    const djSocketId = np?.socketId;
    const dj = djSocketId ? (state.users || []).find((u) => u.socketId === djSocketId) : null;

    if (!np?.videoId) {
      currentDjProfileUserId = null;
      currentDjProfileCache = null;
      avatarEl.innerHTML = '<p class="current-dj__empty muted">No DJ</p>';
      statsEl.innerHTML = '<p class="current-dj__empty muted">—</p>';
      return;
    }

    if (dj) {
      avatarEl.innerHTML = buildVinylRecord(dj, { spinning: true, onAir: true });
      syncCurrentDjSpin(true);

      let stageStatsHtml = '';
      if (dj.userId) {
        const cached = currentDjProfileCache?.userId === dj.userId ? currentDjProfileCache.profile : null;
        stageStatsHtml = buildStageStatsSection(cached, { loading: !cached });
      }
      statsEl.innerHTML = buildCurrentDjStatsHtml(dj, { stageStatsHtml });

      if (dj.userId) {
        if (currentDjProfileUserId !== dj.userId) {
          currentDjProfileUserId = dj.userId;
          loadCurrentDjStageStats(dj.userId, statsEl, dj.socketId);
        }
      } else {
        currentDjProfileUserId = null;
        currentDjProfileCache = null;
      }
    } else {
      currentDjProfileUserId = null;
      currentDjProfileCache = null;
      avatarEl.innerHTML = `<p class="current-dj__empty">${escapeHtml(np.djName || 'Stage')}</p>`;
      statsEl.innerHTML = `
        <div class="current-dj-panel current-dj-panel--stats">
          <h3 class="current-dj-stats__name">${escapeHtml(np.djName || 'Stage')}</h3>
        </div>
      `;
    }
  }

  function buildAlertsBannerTrack(trackEl, bodyEl, message) {
    const safeMessage = escapeHtml(message);
    trackEl.innerHTML = `<span class="alerts-banner__text">${safeMessage}</span>`;
    const segmentWidth = trackEl.firstElementChild?.offsetWidth || 0;
    if (!segmentWidth) return;

    const containerWidth = bodyEl?.offsetWidth || segmentWidth;
    const copiesPerHalf = Math.max(1, Math.ceil(containerWidth / segmentWidth) + 1);
    const totalCopies = copiesPerHalf * 2;

    trackEl.innerHTML = Array.from({ length: totalCopies }, (_, index) => {
      const hidden = index > 0 ? ' aria-hidden="true"' : '';
      return `<span class="alerts-banner__text"${hidden}>${safeMessage}</span>`;
    }).join('');

    const spans = [...trackEl.querySelectorAll('.alerts-banner__text')];
    const halfWidth = spans
      .slice(0, copiesPerHalf)
      .reduce((sum, span) => sum + span.offsetWidth, 0);
    const duration = Math.max(12, halfWidth / 35);
    trackEl.style.setProperty('--alerts-scroll-offset', `-${halfWidth}px`);
    trackEl.style.setProperty('--alerts-scroll-duration', `${duration}s`);
  }

  function updateRoomBanner(banner) {
    const bannerEl = $('alerts-banner');
    const bodyEl = bannerEl?.querySelector('.alerts-banner__body');
    const trackEl = bannerEl?.querySelector('.alerts-banner__track');
    if (!trackEl) return;

    const message = String(banner?.message || '').trim();
    if (message) {
      buildAlertsBannerTrack(trackEl, bodyEl, message);
      bannerEl.classList.add('alerts-banner--active', 'alerts-banner--scrolling');
      bannerEl.setAttribute('aria-live', 'polite');
      return;
    }

    trackEl.innerHTML = '<span class="alerts-banner__text">Moving Alerts Banner</span>';
    trackEl.style.removeProperty('--alerts-scroll-duration');
    trackEl.style.removeProperty('--alerts-scroll-offset');
    bannerEl.classList.remove('alerts-banner--active', 'alerts-banner--scrolling');
    bannerEl.removeAttribute('aria-live');
  }

  function renderChat(chat) {
    const chatEl = $('chat-messages');
    if (!chatEl) return;
    chatEl.innerHTML = '';
    if (!chat?.length) {
      chatEl.innerHTML = '<p class="muted">Say hello…</p>';
      return;
    }

    const prefs = typeof ITVAppPrefs !== 'undefined' ? ITVAppPrefs.getAll() : {};
    const myUsername = typeof ITVAppPrefs !== 'undefined' ? ITVAppPrefs.getMyUsername() : '';

    chat.forEach((m) => {
      if (m.kind === 'badge-earned' && prefs.chatHideSystem) return;

      const div = document.createElement('div');
      if (m.kind === 'badge-earned') {
        div.className = 'chat-msg chat-msg--badge-earned chat-msg--system';
        if (m.id != null) div.dataset.messageId = String(m.id);
        div.innerHTML = `<span class="chat-badge-earned">${escapeHtml(m.text || '')}</span>`;
        chatEl.appendChild(div);
        return;
      }

      div.className = 'chat-msg';
      if (m.id != null) div.dataset.messageId = String(m.id);
      if (prefs.chatMentionHighlight && myUsername) {
        const mentionsMe =
          typeof ITVChatMentions !== 'undefined'
            ? ITVChatMentions.messageMentionsUser(m.text, myUsername)
            : ITVAppPrefs.messageMentionsMe(m.text);
        if (mentionsMe) div.classList.add('chat-msg--mentioned');
      }

      const av = m.avatarUrl
        ? `<img class="chat-avatar" src="${escapeHtml(m.avatarUrl)}" alt="" loading="lazy" />`
        : '';
      const nameInner =
        typeof ITVRank !== 'undefined'
          ? ITVRank.formatChatName(m.displayName, {
              level: m.level ?? 1,
              staffRole: m.staffRole ?? null,
              asButton: true,
            })
          : escapeHtml(m.displayName);
      const userIdAttr = m.userId ? ` data-user-id="${escapeHtml(m.userId)}"` : '';
      const levelAttr = ` data-level="${escapeHtml(m.level ?? 1)}"`;
      const displayAttr = ` data-display-name="${escapeHtml(m.displayName || '')}"`;
      const nameHtml = `<button type="button" class="chat-name-btn"${userIdAttr}${levelAttr}${displayAttr}>${nameInner}</button>`;
      const timeHtml =
        prefs.chatTimestamps && m.at
          ? `<time class="chat-msg__time muted" datetime="${new Date(m.at).toISOString()}">${escapeHtml(
              new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            )}</time>`
          : '';
      const bodyHtml =
        typeof ITVChatMentions !== 'undefined'
          ? ITVChatMentions.formatMessageText(m.text)
          : escapeHtml(m.text);
      div.innerHTML = `${av}<span>${timeHtml}${nameHtml} ${bodyHtml}</span>`;
      chatEl.appendChild(div);
    });
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function renderOnline(users) {
    const onlineEl = $('online-list');
    if (!onlineEl) return;
    onlineEl.innerHTML = '';
    if (!users?.length) {
      onlineEl.innerHTML = '<li class="muted">—</li>';
      return;
    }
    users.forEach((u) => {
      const li = document.createElement('li');
      li.innerHTML = buildUserNameButtonHtml(u);
      onlineEl.appendChild(li);
    });
  }

  function renderQueue(globalQueue, nowPlaying) {
    const queueEl = document.querySelector('[data-pane="queue"] .queue-list');
    if (!queueEl) return;
    queueEl.innerHTML = '';
    const users = roomState?.users || [];

    if (nowPlaying?.videoId) {
      const nowLi = document.createElement('li');
      nowLi.className = 'queue-now-playing';
      const dj =
        findUserMeta(users, {
          socketId: nowPlaying.socketId,
          userId: nowPlaying.userId,
          djName: nowPlaying.djName,
        }) || { displayName: nowPlaying.djName, userId: nowPlaying.userId, level: 1 };
      nowLi.innerHTML = `Now: ${buildUserNameButtonHtml(dj)}`;
      queueEl.appendChild(nowLi);
    }

    if (!globalQueue?.length) {
      if (!nowPlaying?.videoId) {
        queueEl.innerHTML = '<li class="muted">Queue empty</li>';
      }
      return;
    }

    globalQueue.forEach((entry) => {
      const li = document.createElement('li');
      const prefix = entry.position ? `${entry.position}. ` : '';
      const user =
        findUserMeta(users, {
          socketId: entry.socketId,
          userId: entry.userId,
          djName: entry.djName,
        }) || { displayName: entry.djName, userId: entry.userId, level: 1 };
      li.innerHTML = `${escapeHtml(prefix)}${buildUserNameButtonHtml(user)}`;
      queueEl.appendChild(li);
    });
  }

  function renderVinylPit(state) {
    const queueRow = $('vinyl-pit-queue');
    const listenersRow = $('vinyl-pit-listeners');
    if (!queueRow || !listenersRow) return;

    if (state.vinylPit) {
      renderVinylRow(queueRow, state.vinylPit.queue || [], { inQueue: true });
      renderVinylRow(listenersRow, state.vinylPit.listeners || [], { inQueue: false });
      return;
    }

    const activeSocketId = state.nowPlaying?.socketId || null;
    const users = state.users || [];

    const queuedUsers = (state.globalQueue || [])
      .map((entry) => ({
        socketId: entry.socketId || entry.id,
        displayName: entry.djName,
        level: 1,
        avatarUrl: entry.avatarUrl || null,
      }))
      .filter((u) => u.displayName);

    const listeners = users
      .filter((u) => u.socketId !== activeSocketId && !u.inQueue)
      .sort(
        (a, b) =>
          (a.connectedAt || 0) - (b.connectedAt || 0) ||
          a.displayName.localeCompare(b.displayName)
      );

    renderVinylRow(queueRow, queuedUsers, { inQueue: true });
    renderVinylRow(listenersRow, listeners, { inQueue: false });
  }

  function render(state) {
    if (!state) return;
    roomState = state;
    updateDjBanner(state.nowPlaying);
    renderCurrentDj(state);
    renderChat(state.chat);
    updateRoomBanner(state.roomBanner);
    renderOnline(state.users);
    renderQueue(state.globalQueue, state.nowPlaying);
    renderVinylPit(state);
    if (typeof ITVVote !== 'undefined') {
      ITVVote.onRoomState(state);
    }
  }

  let onRoomState = null;
  let onStateUpdate = null;
  let vinylPitLayoutListenerBound = false;

  function bindVinylPitLayoutListener() {
    if (vinylPitLayoutListenerBound || typeof window === 'undefined') return;
    vinylPitLayoutListenerBound = true;
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!roomState) return;
        renderVinylPit(roomState);
        updateRoomBanner(roomState.roomBanner);
      }, 100);
    });
  }

  function bindPlaybackSpinListener() {
    if (typeof window === 'undefined' || window.__itvPlaybackSpinBound) return;
    window.__itvPlaybackSpinBound = true;
    document.addEventListener('itv:playback-playing', (e) => {
      syncCurrentDjSpin(Boolean(e.detail?.playing));
    });
  }

  function init(sock, socketId, options = {}) {
    if (socket && onRoomState) {
      socket.off('room:state', onRoomState);
    }
    socket = sock;
    mySocketId = socketId;
    onStateUpdate = typeof options.onUpdate === 'function' ? options.onUpdate : null;
    onRoomState = (state) => {
      if (localStorage.getItem('itv-socket-log') === '1') {
        console.log('[ITV room:state]', {
          chatCount: state?.chat?.length ?? 0,
          online: state?.users?.length ?? 0,
          nowPlaying: state?.nowPlaying?.videoId || null,
        });
      }
      render(state);
      if (onStateUpdate) onStateUpdate(state);
    };
    socket.on('room:state', onRoomState);
    bindVinylPitLayoutListener();
    bindPlaybackSpinListener();
  }

  function getState() {
    return roomState;
  }

  return { init, render, getState };
})();
