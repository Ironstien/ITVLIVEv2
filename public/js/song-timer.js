/**
 * ITVLive v2 — now-playing song timer pill (server-timed).
 * Driven by player:sync; uses startedAt + durationSec + serverTime.
 */
const ITVSongTimer = (() => {
  let pillEl = null;
  let textEl = null;
  let rafId = null;
  let clockOffsetMs = 0;
  let startedAt = null;
  let durationSec = null;

  function init() {
    pillEl = document.getElementById('song-timer-pill');
    textEl = document.getElementById('song-timer-text');
  }

  function serverNowMs() {
    return Date.now() - clockOffsetMs;
  }

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function setIdle() {
    if (pillEl) pillEl.classList.add('is-idle');
    if (textEl) textEl.textContent = '— / —';
  }

  function setPlaying(currentSec, totalSec) {
    if (pillEl) pillEl.classList.remove('is-idle');
    if (textEl) {
      textEl.textContent = `${formatTime(currentSec)} / ${formatTime(totalSec)}`;
    }
  }

  function stopLoop() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function tick() {
    if (startedAt == null || !durationSec) {
      setIdle();
      stopLoop();
      return;
    }

    const elapsedSec = (serverNowMs() - startedAt) / 1000;
    const totalSec = durationSec;

    if (totalSec <= 0) {
      setIdle();
      stopLoop();
      return;
    }

    const currentSec = Math.min(Math.max(0, elapsedSec), totalSec);
    setPlaying(currentSec, totalSec);

    if (currentSec >= totalSec) {
      stopLoop();
      return;
    }

    rafId = requestAnimationFrame(tick);
  }

  function sync(payload) {
    if (!pillEl || !textEl) init();
    stopLoop();

    if (payload?.serverTime != null && Number.isFinite(Number(payload.serverTime))) {
      clockOffsetMs = Date.now() - Number(payload.serverTime);
    }

    if (!payload?.videoId || payload.startedAt == null) {
      startedAt = null;
      durationSec = null;
      setIdle();
      return;
    }

    const dur = Number(payload.durationSec);
    if (!Number.isFinite(dur) || dur <= 0) {
      startedAt = null;
      durationSec = null;
      setIdle();
      return;
    }

    startedAt = Number(payload.startedAt);
    durationSec = dur;
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init, sync };
})();
