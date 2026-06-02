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

  function buildVinylRecord(u) {
    const labelContent = u.avatarUrl
      ? `<img class="vinyl-record__avatar" src="${escapeHtml(u.avatarUrl)}" alt="" loading="lazy" />`
      : `<span class="vinyl-record__initial" aria-hidden="true">${escapeHtml((u.displayName || '?').charAt(0).toUpperCase())}</span>`;
    return `
      <div class="vinyl-record" aria-label="${escapeHtml(u.displayName)}">
        <div class="vinyl-record__label">${labelContent}</div>
      </div>
    `;
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

  function renderCurrentDj(state) {
    const avatarEl = $('current-dj-avatar');
    const statsEl = $('current-dj-stats');
    if (!avatarEl || !statsEl) return;

    const np = state?.nowPlaying;
    const djSocketId = np?.socketId;
    const dj = djSocketId ? (state.users || []).find((u) => u.socketId === djSocketId) : null;

    if (!np?.videoId) {
      avatarEl.innerHTML = '<p class="current-dj__empty muted">No DJ</p>';
      statsEl.innerHTML = '<p class="current-dj__empty muted">—</p>';
      return;
    }

    if (dj) {
      avatarEl.innerHTML = buildVinylRecord(dj);
      const rankLine =
        typeof ITVRank !== 'undefined'
          ? ITVRank.formatLevelRankLine(dj.level ?? 1, { levelPrefix: 'Level ' })
          : `Level ${dj.level ?? 1}`;
      statsEl.innerHTML = `
        <div class="current-dj-panel current-dj-panel--stats">
          <h3 class="current-dj-stats__name">${escapeHtml(dj.displayName)}</h3>
          <p class="current-dj-stats__rank">${rankLine}</p>
          <p class="current-dj-stats__track"><strong>Now:</strong> ${escapeHtml(np.title)}</p>
        </div>
      `;
    } else {
      avatarEl.innerHTML = `<p class="current-dj__empty">${escapeHtml(np.djName || 'Stage')}</p>`;
      statsEl.innerHTML = `
        <div class="current-dj-panel current-dj-panel--stats">
          <p class="current-dj-stats__track"><strong>Now:</strong> ${escapeHtml(np.title)}</p>
        </div>
      `;
    }
  }

  function updateRoomBanner(banner) {
    const bannerEl = $('alerts-banner');
    const textEl = bannerEl?.querySelector('.alerts-banner__text');
    if (!textEl) return;
    if (banner?.message) {
      textEl.textContent = banner.message;
      bannerEl?.classList.add('alerts-banner--active');
    } else {
      textEl.textContent = 'Moving Alerts Banner';
      bannerEl?.classList.remove('alerts-banner--active');
    }
  }

  function renderChat(chat) {
    const chatEl = $('chat-messages');
    if (!chatEl) return;
    chatEl.innerHTML = '';
    if (!chat?.length) {
      chatEl.innerHTML = '<p class="muted">Say hello…</p>';
      return;
    }
    chat.forEach((m) => {
      const div = document.createElement('div');
      div.className = 'chat-msg';
      if (m.id != null) div.dataset.messageId = String(m.id);
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
      div.innerHTML = `${av}<span>${nameHtml} ${escapeHtml(m.text)}</span>`;
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
      const you = u.socketId === mySocketId ? ' (you)' : '';
      li.textContent = `${u.displayName}${you}`;
      onlineEl.appendChild(li);
    });
  }

  function renderQueue(globalQueue, nowPlaying) {
    const queueEl = document.querySelector('[data-pane="queue"] .queue-list');
    if (!queueEl) return;
    queueEl.innerHTML = '';

    if (nowPlaying?.videoId) {
      const nowLi = document.createElement('li');
      nowLi.className = 'queue-now-playing';
      nowLi.textContent = `Now: ${nowPlaying.djName} — ${nowPlaying.title}`;
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
      li.textContent = entry.title
        ? `${prefix}${entry.djName} — ${entry.title}`
        : `${prefix}${entry.djName}`;
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
        if (roomState) renderVinylPit(roomState);
      }, 100);
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
  }

  function getState() {
    return roomState;
  }

  return { init, render, getState };
})();
