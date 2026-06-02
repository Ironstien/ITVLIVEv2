/**
 * ITVLive v2 — vote slider (intent during song; persisted server-side at track end).
 * No slider movement = no vote. First slide enables the vote for this track.
 */
const ITVVote = (() => {
  const MIN_VOTE_LEVEL = 2;
  let socket = null;
  let accountUser = null;
  let activePlaySessionId = null;
  let hasInteractedThisSession = false;
  let emitTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  const block = () => $('vote-block');
  const slider = () => $('vote-slider');
  const valueEl = () => $('vote-value');

  function canVoteNow(state) {
    if (!accountUser) return { ok: false, hint: 'Log in to vote' };
    const level = accountUser.level ?? 1;
    if (level < MIN_VOTE_LEVEL) {
      return { ok: false, hint: `Level ${MIN_VOTE_LEVEL}+ required` };
    }
    const np = state?.nowPlaying;
    if (!np?.playSessionId) return { ok: false, hint: 'Nothing playing' };
    return { ok: true, playSessionId: np.playSessionId };
  }

  function setBlockState(mode) {
    const el = block();
    if (!el) return;
    el.classList.remove('vote-block--awaiting', 'vote-block--active', 'vote-block--disabled');
    if (mode) el.classList.add(`vote-block--${mode}`);
  }

  function updateSliderUi() {
    const input = slider();
    const label = valueEl();
    if (!input || !label) return;

    const state = typeof ITVRoom !== 'undefined' ? ITVRoom.getState() : null;
    const check = canVoteNow(state);

    if (!check.ok) {
      input.disabled = true;
      hasInteractedThisSession = false;
      setBlockState('disabled');
      label.innerHTML = `${input.value} <small>(${check.hint})</small>`;
      return;
    }

    input.disabled = false;

    if (hasInteractedThisSession) {
      setBlockState('active');
      label.textContent = String(input.value);
    } else {
      setBlockState('awaiting');
      label.innerHTML = '— <small>(not set)</small>';
    }
  }

  function onSliderInput() {
    if (!hasInteractedThisSession) {
      hasInteractedThisSession = true;
    }
    updateSliderUi();
    scheduleEmit();
  }

  function scheduleEmit() {
    if (emitTimer) clearTimeout(emitTimer);
    emitTimer = setTimeout(() => {
      emitTimer = null;
      sendVoteIntent();
    }, 200);
  }

  function sendVoteIntent() {
    if (!socket || !hasInteractedThisSession) return;
    const state = typeof ITVRoom !== 'undefined' ? ITVRoom.getState() : null;
    const check = canVoteNow(state);
    if (!check.ok) return;

    const input = slider();
    if (!input) return;

    const score = Number(input.value);
    socket.emit(
      'vote:set',
      { score, playSessionId: check.playSessionId },
      (res) => {
        if (res?.error && localStorage.getItem('itv-socket-log') === '1') {
          console.warn('[ITV vote]', res.error);
        }
      }
    );
  }

  function onNewTrack(playSessionId) {
    if (playSessionId && playSessionId === activePlaySessionId) return;
    activePlaySessionId = playSessionId || null;
    hasInteractedThisSession = false;

    const input = slider();
    if (input) {
      input.value = '50';
    }
    updateSliderUi();
  }

  function onRoomState(state) {
    const np = state?.nowPlaying;
    onNewTrack(np?.playSessionId || null);
    updateSliderUi();
  }

  function setAccount(user) {
    accountUser = user;
    updateSliderUi();
  }

  function init(sock) {
    socket = sock;
    const input = slider();
    if (input) {
      input.addEventListener('input', onSliderInput);
    }
    updateSliderUi();
  }

  return { init, setAccount, onRoomState, onNewTrack, updateSliderUi };
})();
