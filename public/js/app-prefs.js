/**
 * ITVLive v2 — client-side app preferences (localStorage).
 */
const ITVAppPrefs = (() => {
  const KEYS = {
    chatTimestamps: 'itv-pref-chat-timestamps',
    chatCompact: 'itv-pref-chat-compact',
    chatHideSystem: 'itv-pref-chat-hide-system',
    chatMentionHighlight: 'itv-pref-chat-mention-highlight',
    badgeToasts: 'itv-pref-badge-toasts',
    volume: 'itv-volume',
  };

  const DEFAULTS = {
    chatTimestamps: false,
    chatCompact: false,
    chatHideSystem: false,
    chatMentionHighlight: true,
    badgeToasts: true,
    volume: 80,
  };

  let myUsername = '';

  function readBool(key, fallback) {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === '1';
  }

  function writeBool(key, value) {
    localStorage.setItem(key, value ? '1' : '0');
  }

  function getAll() {
    const savedVol = localStorage.getItem(KEYS.volume);
    const volume = savedVol != null && Number.isFinite(Number(savedVol)) ? Number(savedVol) : DEFAULTS.volume;
    return {
      chatTimestamps: readBool(KEYS.chatTimestamps, DEFAULTS.chatTimestamps),
      chatCompact: readBool(KEYS.chatCompact, DEFAULTS.chatCompact),
      chatHideSystem: readBool(KEYS.chatHideSystem, DEFAULTS.chatHideSystem),
      chatMentionHighlight: readBool(KEYS.chatMentionHighlight, DEFAULTS.chatMentionHighlight),
      badgeToasts: readBool(KEYS.badgeToasts, DEFAULTS.badgeToasts),
      volume,
    };
  }

  function saveAll(prefs) {
    writeBool(KEYS.chatTimestamps, Boolean(prefs.chatTimestamps));
    writeBool(KEYS.chatCompact, Boolean(prefs.chatCompact));
    writeBool(KEYS.chatHideSystem, Boolean(prefs.chatHideSystem));
    writeBool(KEYS.chatMentionHighlight, Boolean(prefs.chatMentionHighlight));
    writeBool(KEYS.badgeToasts, Boolean(prefs.badgeToasts));
    const vol = Math.max(0, Math.min(100, Math.round(Number(prefs.volume) || DEFAULTS.volume)));
    localStorage.setItem(KEYS.volume, String(vol));
    applyAll();
    return getAll();
  }

  function applyAll() {
    const prefs = getAll();
    document.body.classList.toggle('chat-pref-compact', prefs.chatCompact);
    document.body.classList.toggle('chat-pref-timestamps', prefs.chatTimestamps);
    document.body.classList.toggle('chat-pref-mention-highlight', prefs.chatMentionHighlight);

    const slider = document.querySelector('.volume-block input[type="range"]');
    if (slider && document.activeElement !== slider) {
      slider.value = String(prefs.volume);
    }
    if (typeof ITVPlayer !== 'undefined') {
      const muteBtn = document.querySelector('.volume-mute');
      const muted = muteBtn?.getAttribute('aria-pressed') === 'true';
      ITVPlayer.setVolume(prefs.volume, muted);
    }

    if (typeof ITVRoom !== 'undefined') {
      const state = ITVRoom.getState();
      if (state) ITVRoom.render(state);
    }
  }

  function shouldShowBadgeToasts() {
    return readBool(KEYS.badgeToasts, DEFAULTS.badgeToasts);
  }

  function setMyUsername(name) {
    myUsername = String(name || '').trim();
  }

  function getMyUsername() {
    return myUsername;
  }

  function messageMentionsMe(text) {
    if (!myUsername || !text) return false;
    if (typeof ITVChatMentions !== 'undefined') {
      return ITVChatMentions.messageMentionsUser(text, myUsername);
    }
    const user = myUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`@${user}(?![a-zA-Z0-9_-])`, 'i').test(String(text));
  }

  function init() {
    applyAll();
  }

  return {
    KEYS,
    DEFAULTS,
    getAll,
    saveAll,
    applyAll,
    shouldShowBadgeToasts,
    setMyUsername,
    getMyUsername,
    messageMentionsMe,
    init,
  };
})();
