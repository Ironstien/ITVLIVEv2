/* global YT */

/**
 * ITVLive v2 — YouTube player module.
 * Subscribes only to player:sync; never reads chat or queue from room:state.
 */
const ITVPlayer = (() => {
  let ytPlayer = null;
  let apiReady = false;
  let playerReady = false;
  let currentVideoId = null;
  let lastLoadedSignature = null;
  let lastSyncPayload = null;
  let pendingPayload = null;
  let clockOffsetMs = 0;
  let volumeLevel = 80;
  let volumeMuted = false;
  let unblockTimer = null;
  let volumeReinforceTimer = null;
  let socket = null;
  let reportedDurationKey = null;
  let durationReportTimer = null;

  function readStoredVolumePrefs() {
    const saved = localStorage.getItem('itv-volume');
    if (saved != null) {
      const n = Number(saved);
      if (Number.isFinite(n)) volumeLevel = Math.max(0, Math.min(100, Math.round(n)));
    }
    volumeMuted = localStorage.getItem('itv-muted') === '1' || volumeLevel === 0;
  }

  readStoredVolumePrefs();
  const apiQueue = [];

  function updateClockOffset(payload) {
    if (payload?.serverTime != null && Number.isFinite(Number(payload.serverTime))) {
      clockOffsetMs = Date.now() - Number(payload.serverTime);
    }
  }

  function serverNowMs() {
    return Date.now() - clockOffsetMs;
  }

  function syncSignature(payload) {
    if (!payload?.videoId) return 'idle';
    if (payload.playbackSessionId) {
      return `${payload.videoId}:${payload.playbackSessionId}`;
    }
    return `${payload.videoId}:${payload.startedAt || 0}`;
  }

  function resolveSeekSec(payload) {
    if (!payload?.startedAt) return 0;
    let sec = Math.max(0, Math.floor((serverNowMs() - payload.startedAt) / 1000));
    const metaDur = Number(payload.durationSec);
    if (Number.isFinite(metaDur) && metaDur > 0) {
      sec = Math.min(sec, Math.max(0, Math.floor(metaDur) - 1));
    }
    if (ytPlayer?.getDuration) {
      const ytDur = ytPlayer.getDuration();
      if (Number.isFinite(ytDur) && ytDur > 1) {
        sec = Math.min(sec, Math.max(0, Math.floor(ytDur) - 1));
      }
    }
    return sec;
  }

  function clearUnblockTimer() {
    if (unblockTimer) {
      clearTimeout(unblockTimer);
      unblockTimer = null;
    }
  }

  function showUnblockOverlay() {
    document.getElementById('btn-player-unblock')?.classList.remove('hidden');
  }

  function hideUnblockOverlay() {
    document.getElementById('btn-player-unblock')?.classList.add('hidden');
  }

  function setIdleVisible(visible) {
    const idleEl = document.getElementById('player-idle');
    if (idleEl) idleEl.classList.toggle('hidden', !visible);
  }

  function trackDurationKey(payload) {
    if (!payload) return '';
    if (payload.playbackSessionId) return String(payload.playbackSessionId);
    if (payload.playSessionId) return String(payload.playSessionId);
    return `${payload.videoId || ''}:${payload.startedAt || 0}`;
  }

  function clearDurationReportTimer() {
    if (durationReportTimer) {
      clearTimeout(durationReportTimer);
      durationReportTimer = null;
    }
  }

  function maybeReportDuration(force = false) {
    if (!socket || !lastSyncPayload?.videoId || !ytPlayer?.getDuration) return false;

    const ytDur = Math.floor(ytPlayer.getDuration());
    if (!Number.isFinite(ytDur) || ytDur < 1) return false;

    const key = trackDurationKey(lastSyncPayload);
    if (!force && reportedDurationKey === key) return true;

    const serverDur = Number(lastSyncPayload.durationSec);
    if (
      !force &&
      Number.isFinite(serverDur) &&
      serverDur > 0 &&
      Math.abs(serverDur - ytDur) <= 2
    ) {
      reportedDurationKey = key;
      return true;
    }

    reportedDurationKey = key;
    socket.emit('player:duration', {
      durationSec: ytDur,
      playbackSessionId: lastSyncPayload.playbackSessionId,
      playSessionId: lastSyncPayload.playSessionId,
    });
    return true;
  }

  function scheduleDurationReport() {
    clearDurationReportTimer();
    let attempts = 0;

    const tryReport = () => {
      attempts += 1;
      const key = trackDurationKey(lastSyncPayload);
      if (maybeReportDuration() || reportedDurationKey === key || attempts >= 24) {
        clearDurationReportTimer();
        return;
      }
      durationReportTimer = setTimeout(tryReport, 250);
    };

    tryReport();
  }

  function reportTrackEnded() {
    if (!socket || !lastSyncPayload?.videoId) return;
    socket.emit('player:ended', {
      playbackSessionId: lastSyncPayload.playbackSessionId,
      playSessionId: lastSyncPayload.playSessionId,
    });
  }

  function initSocket(sock) {
    socket = sock;
  }

  function clearVolumeReinforce() {
    if (volumeReinforceTimer) {
      clearInterval(volumeReinforceTimer);
      volumeReinforceTimer = null;
    }
  }

  function targetVolumeLevel() {
    return Math.max(0, Math.min(100, Math.round(volumeLevel)));
  }

  function isPlayerVolumeMatching() {
    if (!ytPlayer?.getVolume || !ytPlayer?.isMuted) return false;
    const wantMuted = volumeMuted || volumeLevel === 0;
    const muted = ytPlayer.isMuted();
    if (wantMuted) return muted;
    if (muted) return false;
    const cur = ytPlayer.getVolume();
    return Math.abs(cur - targetVolumeLevel()) <= 2;
  }

  /** Always set level first — loadVideoById resets YouTube to ~100% until we override. */
  function applyVolume() {
    if (!ytPlayer?.setVolume) return;
    const level = targetVolumeLevel();
    const wantMuted = volumeMuted || level === 0;

    ytPlayer.setVolume(level);
    if (wantMuted) {
      ytPlayer.mute?.();
      return;
    }
    ytPlayer.unMute?.();
    ytPlayer.setVolume(level);
  }

  /** Keep re-applying until the iframe reports our level/mute (new videos often ignore the first call). */
  function reinforceVolumeAfterTrackLoad() {
    clearVolumeReinforce();
    let attempts = 0;
    const maxAttempts = 30;

    const tick = () => {
      applyVolume();
      attempts += 1;
      if (isPlayerVolumeMatching() || attempts >= maxAttempts) {
        clearVolumeReinforce();
      }
    };

    tick();
    volumeReinforceTimer = setInterval(tick, 100);
  }

  function scheduleUnblockCheck() {
    clearUnblockTimer();
    unblockTimer = setTimeout(() => {
      unblockTimer = null;
      if (!lastSyncPayload?.videoId || !ytPlayer?.getPlayerState) return;
      const state = ytPlayer.getPlayerState();
      if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING) {
        showUnblockOverlay();
      }
    }, 2500);
  }

  function startTrack(payload) {
    if (!playerReady || !ytPlayer?.loadVideoById || !payload?.videoId) return false;

    const videoId = payload.videoId;
    const seekSec = resolveSeekSec(payload);
    const signature = syncSignature(payload);

    currentVideoId = videoId;
    lastLoadedSignature = signature;
    reportedDurationKey = null;
    clearDurationReportTimer();
    hideUnblockOverlay();
    clearUnblockTimer();
    clearVolumeReinforce();
    setIdleVisible(false);

    applyVolume();
    ytPlayer.loadVideoById({ videoId, startSeconds: seekSec });
    reinforceVolumeAfterTrackLoad();
    ytPlayer.playVideo?.();
    scheduleUnblockCheck();
    return true;
  }

  function applyPayload(payload) {
    if (!payload) return;

    bootstrapYoutubeApi();

    updateClockOffset(payload);
    lastSyncPayload = payload;

    if (!payload.videoId) {
      lastLoadedSignature = null;
      currentVideoId = null;
      reportedDurationKey = null;
      clearDurationReportTimer();
      setIdleVisible(true);
      hideUnblockOverlay();
      clearUnblockTimer();
      clearVolumeReinforce();
      if (playerReady && ytPlayer?.pauseVideo) ytPlayer.pauseVideo();
      return;
    }

    setIdleVisible(false);

    const signature = syncSignature(payload);
    const alreadyLoaded = signature === lastLoadedSignature && currentVideoId === payload.videoId;

    if (alreadyLoaded && playerReady) {
      const state = ytPlayer?.getPlayerState?.();
      if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING) {
        ytPlayer.playVideo?.();
        scheduleUnblockCheck();
      }
      return;
    }

    pendingPayload = payload;

    if (!apiReady || typeof YT === 'undefined') {
      whenApiReady(() => ensurePlayer());
      return;
    }

    ensurePlayer();

    if (playerReady) {
      startTrack(pendingPayload);
      pendingPayload = null;
    }
  }

  function onYouTubeIframeAPIReady() {
    apiReady = true;
    apiQueue.forEach((fn) => fn());
    apiQueue.length = 0;
    ensurePlayer();
  }

  window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

  function bootstrapYoutubeApi() {
    if (typeof YT === 'undefined' || typeof YT.Player !== 'function') return false;
    if (!apiReady) onYouTubeIframeAPIReady();
    else if (!ytPlayer) ensurePlayer();
    return true;
  }

  function whenApiReady(fn) {
    if (apiReady && typeof YT !== 'undefined') fn();
    else apiQueue.push(fn);
  }

  function ensurePlayer() {
    if (ytPlayer || !apiReady || typeof YT === 'undefined') return;

    ytPlayer = new YT.Player('yt-player', {
      height: '100%',
      width: '100%',
      playerVars: {
        autoplay: 1,
        mute: volumeMuted || volumeLevel === 0 ? 1 : 0,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        enablejsapi: 1,
        origin: window.location.origin,
      },
      events: {
        onReady() {
          playerReady = true;
          applyVolume();
          if (pendingPayload?.videoId) {
            startTrack(pendingPayload);
            pendingPayload = null;
          } else if (lastSyncPayload?.videoId) {
            startTrack(lastSyncPayload);
          }
        },
        onStateChange(event) {
          const state = event.data;
          if (
            state === YT.PlayerState.PLAYING ||
            state === YT.PlayerState.BUFFERING ||
            state === YT.PlayerState.CUED ||
            state === YT.PlayerState.UNSTARTED
          ) {
            applyVolume();
          }
          if (state === YT.PlayerState.PLAYING) {
            clearUnblockTimer();
            hideUnblockOverlay();
            scheduleDurationReport();
          }
          if (state === YT.PlayerState.ENDED) {
            reportTrackEnded();
          }
          if (state === YT.PlayerState.CUED && lastSyncPayload?.videoId) {
            ytPlayer?.playVideo?.();
          }
        },
        onError(event) {
          console.warn('[ITVPlayer] YouTube error', event?.data);
          showUnblockOverlay();
        },
      },
    });
  }

  function sync(payload) {
    applyPayload(payload);
  }

  function userPlay() {
    whenApiReady(() => {
      ensurePlayer();
      if (!playerReady) return;
      hideUnblockOverlay();
      clearUnblockTimer();
      if (lastSyncPayload?.videoId && currentVideoId !== lastSyncPayload.videoId) {
        startTrack(lastSyncPayload);
      }
      applyVolume();
      ytPlayer?.playVideo?.();
    });
  }

  function setVolume(level, muted) {
    volumeLevel = Math.max(0, Math.min(100, Math.round(level)));
    volumeMuted = !!muted || volumeLevel === 0;
    localStorage.setItem('itv-volume', String(volumeLevel));
    localStorage.setItem('itv-muted', volumeMuted ? '1' : '0');
    whenApiReady(() => {
      ensurePlayer();
      if (playerReady) applyVolume();
    });
    return { volume: volumeLevel, muted: volumeMuted };
  }

  function getVolume() {
    return { volume: volumeLevel, muted: volumeMuted };
  }

  function getLastSyncPayload() {
    return lastSyncPayload;
  }

  function initUnblock() {
    document.getElementById('btn-player-unblock')?.addEventListener('click', () => userPlay());
  }

  // iframe_api may finish before this script — handle both orderings.
  bootstrapYoutubeApi();

  return {
    sync,
    setVolume,
    getVolume,
    getLastSyncPayload,
    userPlay,
    initUnblock,
    initSocket,
    whenReady: whenApiReady,
  };
})();
