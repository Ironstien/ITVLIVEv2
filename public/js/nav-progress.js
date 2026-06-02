/**
 * ITVLive v2 — top nav song progress (server-timed, full nav height).
 * Driven by player:sync only; uses startedAt + durationSec + serverTime.
 */
const ITVNavProgress = (() => {
  let fillEl = null;
  let rafId = null;
  let clockOffsetMs = 0;
  let startedAt = null;
  let durationSec = null;

  function init() {
    fillEl = document.getElementById('nav-progress-fill');
  }

  function serverNowMs() {
    return Date.now() - clockOffsetMs;
  }

  function stopLoop() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function setProgress(ratio) {
    if (!fillEl) return;
    const p = Math.max(0, Math.min(1, ratio));
    fillEl.style.transform = `scaleX(${p})`;
  }

  function tick() {
    if (startedAt == null || !durationSec) {
      setProgress(0);
      stopLoop();
      return;
    }

    const elapsed = serverNowMs() - startedAt;
    const totalMs = durationSec * 1000;
    if (totalMs <= 0) {
      setProgress(0);
      stopLoop();
      return;
    }

    const ratio = elapsed / totalMs;
    if (ratio >= 1) {
      setProgress(1);
      stopLoop();
      return;
    }

    setProgress(ratio);
    rafId = requestAnimationFrame(tick);
  }

  function sync(payload) {
    if (!fillEl) init();
    stopLoop();

    if (payload?.serverTime != null && Number.isFinite(Number(payload.serverTime))) {
      clockOffsetMs = Date.now() - Number(payload.serverTime);
    }

    if (!payload?.videoId || payload.startedAt == null) {
      startedAt = null;
      durationSec = null;
      setProgress(0);
      return;
    }

    const dur = Number(payload.durationSec);
    if (!Number.isFinite(dur) || dur <= 0) {
      startedAt = null;
      durationSec = null;
      setProgress(0);
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
