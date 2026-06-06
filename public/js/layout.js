/**
 * ITVLive v2 — responsive stage layout.
 * Desktop: collapsible side panels (48px strip), auto-collapse playlist first,
 * collapsible pit (48px strip), fluid 16:9 player, DJ flanks on player edges.
 * Mobile (≤768px): vertical stack, scrollable stage, one panel open at a time.
 */
(function () {
  const STORAGE_KEY = 'itv-panel-layout';
  const MOBILE_MQ = window.matchMedia('(max-width: 768px)');

  const state = {
    userCollapsed: { playlist: false, chat: false, pit: false },
    autoCollapsed: { playlist: false, chat: false, pit: false },
    /** User expanded pit on a short viewport — block auto-collapse until they collapse again */
    pitPinnedOpen: false,
    mobileDefaultsApplied: false,
  };

  const playerZone = document.querySelector('.player-zone');
  const root = document.documentElement;

  function readCssPx(name, fallback) {
    const raw = getComputedStyle(root).getPropertyValue(name).trim();
    if (!raw) return fallback;
    if (raw.endsWith('px')) return parseFloat(raw);
    const probe = document.createElement('div');
    probe.style.width = raw;
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);
    const px = probe.getBoundingClientRect().width;
    probe.remove();
    return px || fallback;
  }

  function isMobileLayout() {
    return MOBILE_MQ.matches;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.userCollapsed?.playlist === 'boolean') {
        state.userCollapsed.playlist = parsed.userCollapsed.playlist;
      }
      if (typeof parsed?.userCollapsed?.chat === 'boolean') {
        state.userCollapsed.chat = parsed.userCollapsed.chat;
      }
      if (typeof parsed?.userCollapsed?.pit === 'boolean') {
        state.userCollapsed.pit = parsed.userCollapsed.pit;
      } else if (typeof parsed?.userCollapsed?.vinylPit === 'boolean') {
        state.userCollapsed.pit = parsed.userCollapsed.vinylPit;
      }
      if (typeof parsed?.pitPinnedOpen === 'boolean') {
        state.pitPinnedOpen = parsed.pitPinnedOpen;
      } else if (typeof parsed?.vinylPitPinnedOpen === 'boolean') {
        state.pitPinnedOpen = parsed.vinylPitPinnedOpen;
      }
      if (typeof parsed?.mobileDefaultsApplied === 'boolean') {
        state.mobileDefaultsApplied = parsed.mobileDefaultsApplied;
      }
    } catch (_) {
      /* ignore corrupt storage */
    }
  }

  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          userCollapsed: {
            playlist: state.userCollapsed.playlist,
            chat: state.userCollapsed.chat,
            pit: state.userCollapsed.pit,
          },
          pitPinnedOpen: state.pitPinnedOpen,
          mobileDefaultsApplied: state.mobileDefaultsApplied,
        })
      );
    } catch (_) {
      /* ignore quota errors */
    }
  }

  function isPanelCollapsed(side) {
    return state.userCollapsed[side] || state.autoCollapsed[side];
  }

  function isPitCollapsed() {
    return state.userCollapsed.pit || state.autoCollapsed.pit;
  }

  function requiredStageWidth(playlistCollapsed, chatCollapsed) {
    const panelOpen = readCssPx('--left-playlist-width', 312);
    const panelStrip = readCssPx('--panel-strip-width', 48);
    const playerMinW = readCssPx('--player-min-width', (320 * 16) / 9);
    const stageGap = readCssPx('--stage-gap', 8);
    const stagePadding = readCssPx('--stage-padding', 8);

    const left = playlistCollapsed ? panelStrip : panelOpen;
    const right = chatCollapsed ? panelStrip : panelOpen;
    const chrome = stagePadding * 2 + stageGap * 2;

    return left + right + playerMinW + chrome;
  }

  function applyMobileDefaultsOnce() {
    if (!isMobileLayout() || state.mobileDefaultsApplied) return;
    state.userCollapsed.playlist = true;
    state.userCollapsed.chat = true;
    state.mobileDefaultsApplied = true;
    saveState();
  }

  function updateAutoCollapse() {
    if (isMobileLayout()) {
      state.autoCollapsed.playlist = false;
      state.autoCollapsed.chat = false;
      state.autoCollapsed.pit = false;
      return;
    }

    const viewportW = document.documentElement.clientWidth;
    const viewportH = window.innerHeight;
    const pitAutoMaxH = readCssPx('--pit-auto-collapse-max-height', 800);

    state.autoCollapsed.playlist = false;
    state.autoCollapsed.chat = false;
    state.autoCollapsed.pit = false;

    const userPl = state.userCollapsed.playlist;
    const userCh = state.userCollapsed.chat;

    if (requiredStageWidth(userPl, userCh) > viewportW && !userPl) {
      state.autoCollapsed.playlist = true;
    }

    const plEff = isPanelCollapsed('playlist');
    const chEff = isPanelCollapsed('chat');

    if (requiredStageWidth(plEff, chEff) > viewportW && !userCh) {
      state.autoCollapsed.chat = true;
    }

    if (viewportH <= pitAutoMaxH && !state.userCollapsed.pit && !state.pitPinnedOpen) {
      state.autoCollapsed.pit = true;
    }
  }

  function applyLayoutClasses() {
    document.body.classList.toggle('layout-mobile-stack', isMobileLayout());
    document.body.classList.toggle('panel-playlist-collapsed', isPanelCollapsed('playlist'));
    document.body.classList.toggle('panel-chat-collapsed', isPanelCollapsed('chat'));
    document.body.classList.toggle('pit-collapsed', isPitCollapsed());
  }

  function updatePlayerSize() {
    if (!playerZone) return;

    const zoneW = playerZone.clientWidth;
    const zoneH = playerZone.clientHeight;

    const minW = readCssPx('--player-min-width', (320 * 16) / 9);
    const minH = readCssPx('--player-min-height', 320);

    if (zoneW <= 0) return;

    let playerW = Math.max(minW, zoneW);
    let playerH = (playerW * 9) / 16;
    playerH = Math.max(minH, playerH);

    if (!isMobileLayout() && zoneH > 0 && playerH > zoneH) {
      playerH = Math.max(minH, zoneH);
      playerW = Math.max(minW, (playerH * 16) / 9);
    }

    if (isMobileLayout() && zoneW > 0) {
      playerW = Math.min(playerW, zoneW);
      playerH = Math.max(minH, (playerW * 9) / 16);
    }

    root.style.setProperty('--player-video-width', `${Math.round(playerW * 100) / 100}px`);
    root.style.setProperty('--player-video-height', `${Math.round(playerH * 100) / 100}px`);
  }

  function layout() {
    applyMobileDefaultsOnce();
    updateAutoCollapse();
    applyLayoutClasses();
    requestAnimationFrame(updatePlayerSize);
  }

  function setUserPanelCollapsed(side, collapsed) {
    if (side !== 'playlist' && side !== 'chat') return;

    if (isMobileLayout() && !collapsed) {
      const other = side === 'playlist' ? 'chat' : 'playlist';
      state.userCollapsed[other] = true;
      state.autoCollapsed[other] = false;
    }

    state.userCollapsed[side] = collapsed;
    if (!collapsed) state.autoCollapsed[side] = false;
    saveState();
    layout();
  }

  function setUserPitCollapsed(collapsed) {
    state.userCollapsed.pit = collapsed;
    if (collapsed) {
      state.autoCollapsed.pit = false;
      state.pitPinnedOpen = false;
    } else {
      state.autoCollapsed.pit = false;
      state.pitPinnedOpen = !isMobileLayout();
    }
    saveState();
    layout();
  }

  function setupMobilePanelHeaderExpand() {
    const chatHeader = document.querySelector('.panel-chat .panel-side__header');
    const playlistHeader = document.querySelector('.panel-playlist .panel-header-with-action');

    function onHeaderActivate(side, el) {
      if (!el) return;
      el.addEventListener('click', (e) => {
        if (!isMobileLayout()) return;
        if (e.target.closest('[data-panel-collapse], button, a, input, select, textarea')) return;
        if (!isPanelCollapsed(side)) return;
        setUserPanelCollapsed(side, false);
      });
    }

    onHeaderActivate('chat', chatHeader);
    onHeaderActivate('playlist', playlistHeader);

    const pitHeader = document.querySelector('.the-pit__header');
    if (pitHeader) {
      pitHeader.addEventListener('click', (e) => {
        if (!isMobileLayout()) return;
        if (e.target.closest('[data-pit-collapse], button')) return;
        if (!isPitCollapsed()) return;
        setUserPitCollapsed(false);
      });
    }
  }

  document.querySelectorAll('[data-panel-collapse]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const side = btn.getAttribute('data-panel-collapse');
      if (!side) return;
      if (isMobileLayout() && isPanelCollapsed(side)) {
        setUserPanelCollapsed(side, false);
        return;
      }
      setUserPanelCollapsed(side, true);
    });
  });

  document.querySelectorAll('[data-panel-expand]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const side = btn.getAttribute('data-panel-expand');
      if (side) setUserPanelCollapsed(side, false);
    });
  });

  document.querySelectorAll('[data-pit-collapse]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (isMobileLayout() && isPitCollapsed()) {
        setUserPitCollapsed(false);
        return;
      }
      setUserPitCollapsed(true);
    });
  });

  document.querySelectorAll('[data-pit-expand]').forEach((btn) => {
    btn.addEventListener('click', () => setUserPitCollapsed(false));
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 50);
  });

  if (typeof MOBILE_MQ.addEventListener === 'function') {
    MOBILE_MQ.addEventListener('change', layout);
  } else if (typeof MOBILE_MQ.addListener === 'function') {
    MOBILE_MQ.addListener(layout);
  }

  if (typeof ResizeObserver !== 'undefined' && playerZone) {
    new ResizeObserver(() => updatePlayerSize()).observe(playerZone);
  }

  loadState();
  setupMobilePanelHeaderExpand();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', layout);
  } else {
    layout();
  }
})();
