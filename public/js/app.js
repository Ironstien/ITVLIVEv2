/**
 * ITVLive v2 — client bootstrap.
 * Wires guest or authenticated session, chat, player, and room UI modules.
 * Login / About / staff panels open as modals so playback is never interrupted.
 */
(function () {
  const GUEST_NAME_KEY = 'itv-guest-name';
  const navUser = document.getElementById('nav-user');
  const navAuthLink = document.getElementById('nav-auth-link');
  const siteVersion = document.getElementById('site-version');
  const navModToolsWrap = document.getElementById('nav-mod-tools-wrap');
  const navAdminPanelWrap = document.getElementById('nav-admin-panel-wrap');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const queueBtn = document.querySelector('.btn-queue-action');
  const ripBtn = document.getElementById('btn-playlist-rip');
  const volumeSlider = document.querySelector('.volume-block input[type="range"]');
  const volumeMuteBtn = document.querySelector('.volume-mute');

  let hadConnectedOnce = false;
  let accountUser = null;
  let activeSocket = null;
  let wasPlayingAsDj = false;

  function getGuestName() {
    const stored = localStorage.getItem(GUEST_NAME_KEY);
    if (stored && stored.trim().length >= 2) return stored.trim().slice(0, 24);
    const fallback = `Guest-${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem(GUEST_NAME_KEY, fallback);
    return fallback;
  }

  function toast(msg, isError) {
    console[isError ? 'warn' : 'log'](`[itv] ${msg}`);
  }

  function socketLog(kind, detail) {
    if (localStorage.getItem('itv-socket-log') !== '1') return;
    console.log(`[ITV ${kind}]`, detail);
  }

  function applyPlayerSync(payload, source) {
    if (!payload) return;
    socketLog('player:sync', { source: source || 'event', videoId: payload.videoId || 'idle' });
    if (typeof ITVVote !== 'undefined' && payload.playSessionId) {
      ITVVote.onNewTrack(payload.playSessionId);
    }
    const vol = ITVPlayer.getVolume();
    const sliderLevel = Number(volumeSlider?.value);
    const level = Number.isFinite(sliderLevel) ? sliderLevel : vol.volume;
    const muted = volumeMuteBtn?.getAttribute('aria-pressed') === 'true';
    ITVPlayer.setVolume(level, muted);
    ITVPlayer.sync(payload);
    if (typeof ITVNavProgress !== 'undefined') {
      ITVNavProgress.sync(payload);
    }
  }

  function updateNavLabel(content, asHtml = false) {
    if (!navUser) return;
    if (asHtml) navUser.innerHTML = content;
    else navUser.textContent = content;
  }

  function formatAccountNavHtml(user, suffix = '') {
    const level = user.level ?? 1;
    const xp = user.xp ?? 0;
    const esc = typeof ITVRank !== 'undefined' ? ITVRank.escapeHtml.bind(ITVRank) : (s) => String(s ?? '');
    const suffixText = suffix ? ` · ${esc(suffix)}` : '';
    const rankPart =
      typeof ITVRank !== 'undefined' ? ITVRank.formatRankForLevel(level) : esc(getRankFallbackName(level));
    const staffHtml =
      user.staffRole && typeof ITVRank !== 'undefined'
        ? ` · ${ITVRank.formatStaffRole(user.staffRole)}`
        : user.staffRole
          ? ` · ${esc(user.staffRole)}`
          : '';
    return `${esc(user.username)} · Lv.${level} · ${rankPart} · ${xp} XP${staffHtml}${suffixText}`;
  }

  function getRankFallbackName(level) {
    const n = Math.max(1, Math.min(60, Math.floor(Number(level) || 1)));
    if (n >= 60) return 'Legend';
    if (n >= 50) return 'Champion';
    if (n >= 40) return 'Elite';
    if (n >= 30) return 'Veteran';
    if (n >= 20) return 'Member';
    if (n >= 10) return 'Regular';
    return 'Novice';
  }

  function setNavAccount(user, suffix = '') {
    if (typeof ITVRank !== 'undefined') {
      updateNavLabel(formatAccountNavHtml(user, suffix), true);
    } else {
      updateNavLabel(
        `${user.username} · Lv.${user.level ?? 1} · ${getRankFallbackName(user.level)} · ${user.xp ?? 0} XP${suffix ? ` · ${suffix}` : ''}`
      );
    }
  }

  function navShowsConnected() {
    if (!navUser) return false;
    const text = navUser.textContent || '';
    const html = navUser.innerHTML || '';
    return text.includes('connected') || html.includes('connected');
  }

  function isStaff(user) {
    const role = user?.staffRole;
    return role === 'mod' || role === 'admin';
  }

  function isAdmin(user) {
    return user?.staffRole === 'admin';
  }

  function updateStaffNav() {
    if (navModToolsWrap) {
      navModToolsWrap.classList.toggle('hidden', !isStaff(accountUser));
    }
    if (navAdminPanelWrap) {
      navAdminPanelWrap.classList.toggle('hidden', !isAdmin(accountUser));
    }
    if (typeof ITVModTools !== 'undefined') {
      ITVModTools.setContext({ user: accountUser, activeSocket });
    }
    if (typeof ITVAdminPanel !== 'undefined') {
      ITVAdminPanel.setContext({ user: accountUser });
    }
  }

  function updateNavAuthLink() {
    if (!navAuthLink) return;
    if (accountUser) {
      navAuthLink.textContent = 'Log out';
      navAuthLink.removeAttribute('data-open-modal');
      navAuthLink.onclick = async (e) => {
        e.preventDefault();
        ITVAuth.logout();
        accountUser = null;
        updateNavAuthLink();
        updateStaffNav();
        updateQueueButton();
        updateNavLabel(`${getGuestName()} · guest`);
        await reconnectSocket();
      };
    } else {
      navAuthLink.textContent = 'Log in';
      navAuthLink.setAttribute('data-open-modal', 'login');
      navAuthLink.onclick = null;
    }
  }

  function getMyQueueState() {
    const state = ITVRoom.getState();
    if (!accountUser || !state) {
      return { inQueue: false, isPlaying: false, mode: 'guest' };
    }
    const me = (state.users || []).find((u) => u.userId === accountUser.id);
    const inQueue = Boolean(me?.inQueue);
    const isPlaying = state.nowPlaying?.userId === accountUser.id;
    let mode = 'join';
    if (inQueue && isPlaying) mode = 'skip';
    else if (inQueue) mode = 'leave';
    return { inQueue, isPlaying, mode };
  }

  function syncAccountFromRoomState() {
    if (!accountUser) return;
    const state = ITVRoom.getState();
    const me = (state?.users || []).find((u) => u.userId === accountUser.id);
    if (!me) return;
    let changed = false;
    if (me.level != null && me.level !== accountUser.level) {
      accountUser.level = me.level;
      changed = true;
    }
    if (me.xp != null && me.xp !== accountUser.xp) {
      accountUser.xp = me.xp;
      changed = true;
    }
    if (me.staffRole !== accountUser.staffRole) {
      accountUser.staffRole = me.staffRole ?? null;
      changed = true;
    }
    if (changed) {
      if (typeof ITVVote !== 'undefined') ITVVote.setAccount(accountUser);
      if (navShowsConnected()) {
        setNavAccount(accountUser, 'connected');
      }
      updateStaffNav();
    }
  }

  function updateQueueControls() {
    syncAccountFromRoomState();
    const { inQueue, isPlaying, mode } = getMyQueueState();
    const np = ITVRoom.getState()?.nowPlaying;

    if (wasPlayingAsDj && !isPlaying && accountUser && typeof ITVPlaylist !== 'undefined') {
      ITVPlaylist.refreshList().catch(() => {});
    }
    wasPlayingAsDj = isPlaying;

    if (queueBtn) {
      if (mode === 'guest') {
        queueBtn.disabled = true;
        queueBtn.textContent = 'Join Queue';
        queueBtn.title = 'Log in to join the DJ queue';
      } else if (mode === 'skip') {
        queueBtn.disabled = false;
        queueBtn.textContent = 'Skip Song';
        queueBtn.title = 'Skip your current song';
      } else if (mode === 'leave') {
        queueBtn.disabled = false;
        queueBtn.textContent = 'Leave Queue';
        queueBtn.title = 'Remove yourself from the waiting list';
      } else {
        queueBtn.disabled = false;
        queueBtn.textContent = 'Join Queue';
        queueBtn.title = 'Join the DJ queue with your active playlist';
      }
    }

    if (ripBtn) {
      ripBtn.disabled = !accountUser || !np?.videoId;
      ripBtn.title =
        accountUser && np?.videoId
          ? 'Add now playing to your active playlist'
          : 'Log in while a song is playing to rip';
    }

    if (typeof ITVPlaylist !== 'undefined') {
      ITVPlaylist.updateFromRoomState();
    }

    const state = ITVRoom.getState();
    const chatLocked = Boolean(state?.chatLocked);
    const staff = isStaff(accountUser);
    if (chatInput) {
      if (chatLocked && !staff) {
        chatInput.disabled = true;
        chatInput.placeholder = 'Chat is locked';
      } else {
        chatInput.disabled = false;
        chatInput.placeholder = 'Say something…';
      }
    }
    if (chatForm) {
      const submitBtn = chatForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = chatLocked && !staff;
    }
  }

  function updateQueueButton() {
    updateQueueControls();
  }

  async function setAccountUser(user) {
    accountUser = user;
    if (typeof ITVVote !== 'undefined') {
      ITVVote.setAccount(user);
    }
    updateNavAuthLink();
    updateStaffNav();
    updateQueueButton();
    if (typeof ITVPlaylist !== 'undefined') {
      await ITVPlaylist.onUserReady(user);
    }
    if (user) {
      setNavAccount(user);
    } else {
      updateNavLabel(`${getGuestName()} · guest`);
    }
  }

  async function reconnectSocket() {
    if (activeSocket) {
      activeSocket.io.opts.reconnection = false;
      activeSocket.removeAllListeners();
      activeSocket.disconnect();
      activeSocket = null;
    }
    hadConnectedOnce = false;
    startSocket();
  }

  document.querySelectorAll('.chat-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab;
      document.querySelectorAll('.chat-tab').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.chat-pane').forEach((pane) => {
        pane.classList.toggle('active', pane.dataset.pane === name);
      });
    });
  });

  ITVPlayer.initUnblock();
  updateQueueButton();

  ITVAuthUI.init({
    onSuccess: async (user) => {
      await setAccountUser(user);
      await reconnectSocket();
      toast('Logged in — stage still playing');
    },
  });

  if (typeof ITVModTools !== 'undefined') {
    ITVModTools.init({ onToast: toast });
  }
  if (typeof ITVAdminPanel !== 'undefined') {
    ITVAdminPanel.init({
      onToast: toast,
      onAccountRefresh: async () => {
        const user = await ITVAuth.fetchMe();
        if (user) await setAccountUser(user);
      },
    });
  }

  function wireSocket(socket) {
    if (typeof ITVVote !== 'undefined') {
      ITVVote.init(socket);
    }
    if (typeof ITVModTools !== 'undefined') {
      ITVModTools.setContext({ user: accountUser, activeSocket: socket });
    }
    let sessionReplaced = false;

    socket.on('connect_error', async (err) => {
      if (err?.message?.includes('token')) {
        toast('Session expired — log in again', true);
        ITVAuth.logout();
        await setAccountUser(null);
        await reconnectSocket();
        ITVModal.open('login');
      }
    });

    socket.on('session:replaced', (payload) => {
      sessionReplaced = true;
      toast(payload?.message || 'Logged in elsewhere — this tab disconnected.', true);
      updateNavLabel('Session replaced — open another tab');
      socket.io.opts.reconnection = false;
      socket.disconnect();
    });

    socket.on('player:sync', (payload) => {
      applyPlayerSync(payload, 'socket');
    });

    socket.on('user:progress', (progress) => {
      if (!progress || !accountUser || progress.userId !== accountUser.id) return;
      accountUser.xp = progress.xp ?? accountUser.xp;
      accountUser.level = progress.level ?? accountUser.level;
      setNavAccount(accountUser, 'connected');
      if (typeof ITVVote !== 'undefined') {
        ITVVote.setAccount(accountUser);
      }
      if (progress.leveledUp) {
        toast(`Level up! You are now level ${progress.level}`);
      } else if (progress.leveledDown) {
        toast(`Level changed to ${progress.level}`);
      } else if (progress.delta) {
        const sign = progress.delta > 0 ? '+' : '';
        toast(`${sign}${progress.delta} XP (${progress.reason || 'reward'})`);
      }
    });

    socket.on('connect', () => {
      if (typeof ITVModTools !== 'undefined') {
        ITVModTools.setContext({ user: accountUser, activeSocket: socket });
      }
      const reconnected = hadConnectedOnce;
      hadConnectedOnce = true;

      const joinPayload = accountUser ? {} : { displayName: getGuestName() };

      socket.emit('room:join', joinPayload, (res) => {
        if (res?.error) {
          toast(res.error, true);
          return;
        }
        if (res.authenticated && accountUser) {
          setNavAccount(accountUser, 'connected');
        } else if (navUser) {
          updateNavLabel(`${res.displayName} · connected`);
        }
        ITVRoom.init(socket, res.socketId, { onUpdate: updateQueueControls });
        if (res.roomState) {
          ITVRoom.render(res.roomState);
          updateQueueControls();
        }
        applyPlayerSync(res.playerSync, 'join-ack');
      });

      if (reconnected) {
        socket.emit('room:requestSync', {}, (res) => {
          applyPlayerSync(res?.playerSync, 'requestSync-ack');
        });
      }
    });

    socket.on('disconnect', () => {
      if (sessionReplaced) return;
      if (accountUser) {
        setNavAccount(accountUser, 'reconnecting…');
      } else if (navUser) {
        updateNavLabel('Reconnecting…');
      }
    });

    if (chatForm) {
      chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = chatInput?.value?.trim();
        if (!text) return;
        socket.emit('chat:send', { text }, (res) => {
          if (res?.error) toast(res.error, true);
          else if (chatInput) chatInput.value = '';
        });
      });
    }

    if (queueBtn) {
      queueBtn.addEventListener('click', () => {
        if (!accountUser) return;
        const { mode } = getMyQueueState();
        if (mode === 'guest') return;

        if (mode === 'join') {
          socket.emit('queue:join', {}, (res) => {
            if (res?.error) {
              toast(res.error, true);
              return;
            }
            toast(
              res.started ? 'Your turn — now playing' : `Joined queue · position ${res.position}`
            );
          });
          return;
        }

        if (mode === 'skip') {
          socket.emit('queue:skipPlaying', {}, (res) => {
            if (res?.error) toast(res.error, true);
            else toast('Skipped your song');
          });
          return;
        }

        if (mode === 'leave') {
          socket.emit('queue:leave', {}, (res) => {
            if (res?.error) toast(res.error, true);
            else toast('Left the queue');
          });
        }
      });
    }

    if (ripBtn) {
      ripBtn.addEventListener('click', () => {
        socket.emit('queue:rip', {}, (res) => {
          if (res?.error) {
            toast(res.error, true);
            return;
          }
          toast(`Ripped "${res.item?.title || 'track'}" to your active playlist`);
          if (typeof ITVPlaylist !== 'undefined') {
            ITVPlaylist.refreshAfterRip?.(res.playlistId);
          }
        });
      });
    }
  }

  function startSocket() {
    if (typeof io === 'undefined') {
      toast('Socket.io unavailable', true);
      return;
    }
    activeSocket = io({
      auth: typeof ITVAuth !== 'undefined' ? ITVAuth.socketAuthPayload() : {},
    });
    wireSocket(activeSocket);
  }

  const savedMuted = localStorage.getItem('itv-muted') === '1';

  if (volumeSlider) {
    volumeSlider.disabled = false;
    const savedVol = localStorage.getItem('itv-volume');
    if (savedVol != null) volumeSlider.value = savedVol;
    volumeSlider.addEventListener('input', () => {
      const level = Number(volumeSlider.value);
      ITVPlayer.setVolume(level, volumeMuteBtn?.getAttribute('aria-pressed') === 'true');
    });
  }

  if (volumeMuteBtn) {
    volumeMuteBtn.disabled = false;
    volumeMuteBtn.setAttribute('aria-pressed', savedMuted ? 'true' : 'false');
    volumeMuteBtn.addEventListener('click', () => {
      const pressed = volumeMuteBtn.getAttribute('aria-pressed') === 'true';
      const next = !pressed;
      volumeMuteBtn.setAttribute('aria-pressed', next ? 'true' : 'false');
      ITVPlayer.setVolume(Number(volumeSlider?.value || 80), next);
    });
  }

  ITVPlayer.setVolume(
    Number(volumeSlider?.value || localStorage.getItem('itv-volume') || 80),
    savedMuted
  );

  function openModalFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const modal = params.get('modal');
    if (modal === 'login' && !accountUser) {
      ITVModal.open('login');
      const url = new URL(window.location.href);
      url.searchParams.delete('modal');
      window.history.replaceState({}, '', url.pathname + url.hash);
    }
  }

  function updateSiteVersion(version) {
    if (!siteVersion || !version) return;
    siteVersion.textContent = `v${version}`;
  }

  Promise.all([
    fetch('/health').then((r) => r.json()),
    typeof ITVAuth !== 'undefined' ? ITVAuth.fetchMe() : Promise.resolve(null),
  ])
    .then(async ([health, user]) => {
      updateSiteVersion(health?.version);
      await setAccountUser(user);
      if (!user && navUser && health.ok) {
        updateNavLabel(`${getGuestName()} · guest`);
      }
      startSocket();
      openModalFromQuery();
      if (user) {
        const hash = window.location.hash.replace('#', '');
        if (hash === 'login') {
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
    })
    .catch(() => {
      if (navUser) updateNavLabel('Offline');
      startSocket();
      openModalFromQuery();
    });
})();
