/**
 * ITVLive v2 — @mention autocomplete in chat + message formatting.
 */
const ITVChatMentions = (() => {
  const MENTION_RE = /@([a-zA-Z0-9_-]{2,24})/g;
  const MENTION_NAME_RE = /^[a-zA-Z0-9_-]{2,24}$/;

  let inputEl = null;
  let listEl = null;
  let activeIndex = 0;
  let matches = [];
  let mentionOpen = false;

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getOnlineUsers() {
    const state = typeof ITVRoom !== 'undefined' ? ITVRoom.getState() : null;
    const users = state?.users || [];
    const seen = new Set();
    const list = [];
    users.forEach((u) => {
      const name = String(u.displayName || '').trim();
      if (!name || seen.has(name.toLowerCase())) return;
      seen.add(name.toLowerCase());
      list.push({
        displayName: name,
        userId: u.userId || null,
        level: u.level ?? 1,
      });
    });
    return list.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  function getActiveMentionRange(value, cursor) {
    const before = value.slice(0, cursor);
    const at = before.lastIndexOf('@');
    if (at < 0) return null;
    if (at > 0 && !/\s/.test(before.charAt(at - 1))) return null;
    const query = before.slice(at + 1);
    if (/\s/.test(query)) return null;
    return { start: at, end: cursor, query };
  }

  function filterMatches(query) {
    const q = String(query || '').toLowerCase();
    const users = getOnlineUsers();
    if (!q) return users;
    return users.filter((u) => u.displayName.toLowerCase().startsWith(q));
  }

  function hideList() {
    mentionOpen = false;
    matches = [];
    activeIndex = 0;
    if (listEl) {
      listEl.classList.add('hidden');
      listEl.innerHTML = '';
      listEl.setAttribute('aria-hidden', 'true');
    }
  }

  function renderList() {
    if (!listEl) return;
    if (!matches.length) {
      hideList();
      return;
    }

    listEl.innerHTML = matches
      .map((u, i) => {
        const selected = i === activeIndex ? ' chat-mention-list__item--active' : '';
        return `<li><button type="button" class="chat-mention-list__item${selected}" data-index="${i}" role="option" aria-selected="${i === activeIndex}">${escapeHtml(u.displayName)}</button></li>`;
      })
      .join('');
    listEl.classList.remove('hidden');
    listEl.setAttribute('aria-hidden', 'false');
    mentionOpen = true;
  }

  function refreshFromInput() {
    if (!inputEl) return;
    const cursor = inputEl.selectionStart ?? inputEl.value.length;
    const range = getActiveMentionRange(inputEl.value, cursor);
    if (!range) {
      hideList();
      return;
    }
    matches = filterMatches(range.query);
    activeIndex = 0;
    renderList();
  }

  function applyMatch(index) {
    if (!inputEl || !matches[index]) return;
    const name = matches[index].displayName;
    const cursor = inputEl.selectionStart ?? inputEl.value.length;
    const range = getActiveMentionRange(inputEl.value, cursor);
    const mention = `@${name} `;
    if (range) {
      inputEl.value = inputEl.value.slice(0, range.start) + mention + inputEl.value.slice(range.end);
      const pos = range.start + mention.length;
      inputEl.selectionStart = pos;
      inputEl.selectionEnd = pos;
    } else {
      const start = inputEl.selectionStart ?? inputEl.value.length;
      const end = inputEl.selectionEnd ?? start;
      inputEl.value = inputEl.value.slice(0, start) + mention + inputEl.value.slice(end);
      const pos = start + mention.length;
      inputEl.selectionStart = pos;
      inputEl.selectionEnd = pos;
    }
    hideList();
    inputEl.focus();
  }

  function insertMention(displayName) {
    if (!inputEl) inputEl = document.getElementById('chat-input');
    if (!inputEl) return;
    const name = String(displayName || '').trim().slice(0, 24);
    if (!name || !MENTION_NAME_RE.test(name)) return;

    inputEl.focus();
    const cursor = inputEl.selectionStart ?? inputEl.value.length;
    const range = getActiveMentionRange(inputEl.value, cursor);
    const mention = `@${name} `;

    if (range) {
      inputEl.value = inputEl.value.slice(0, range.start) + mention + inputEl.value.slice(range.end);
      const pos = range.start + mention.length;
      inputEl.selectionStart = pos;
      inputEl.selectionEnd = pos;
    } else {
      const start = inputEl.selectionStart ?? inputEl.value.length;
      const end = inputEl.selectionEnd ?? start;
      const prefix = start > 0 && !/\s/.test(inputEl.value.charAt(start - 1)) ? ' ' : '';
      const insert = `${prefix}${mention}`;
      inputEl.value = inputEl.value.slice(0, start) + insert + inputEl.value.slice(end);
      const pos = start + insert.length;
      inputEl.selectionStart = pos;
      inputEl.selectionEnd = pos;
    }

    hideList();
    if (typeof ITVModal !== 'undefined') {
      ITVModal.close('user-profile');
    }
  }

  function messageMentionsUser(text, username) {
    if (!username || !text) return false;
    const re = new RegExp(`@${escapeRegExp(username)}(?![a-zA-Z0-9_-])`, 'i');
    return re.test(String(text));
  }

  function formatMessageText(text) {
    const raw = String(text ?? '');
    let result = '';
    let last = 0;
    MENTION_RE.lastIndex = 0;
    let match;
    while ((match = MENTION_RE.exec(raw)) !== null) {
      result += escapeHtml(raw.slice(last, match.index));
      result += `<span class="chat-mention">${escapeHtml(match[0])}</span>`;
      last = match.index + match[0].length;
    }
    result += escapeHtml(raw.slice(last));
    return result;
  }

  function onInput() {
    refreshFromInput();
  }

  function onKeyDown(e) {
    if (!mentionOpen || !matches.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % matches.length;
      renderList();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + matches.length) % matches.length;
      renderList();
      return;
    }
    if (e.key === 'Enter' && mentionOpen) {
      e.preventDefault();
      applyMatch(activeIndex);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      hideList();
    }
  }

  function onListClick(e) {
    const btn = e.target.closest('.chat-mention-list__item');
    if (!btn) return;
    e.preventDefault();
    applyMatch(Number(btn.dataset.index) || 0);
  }

  function onDocumentClick(e) {
    if (!listEl || listEl.classList.contains('hidden')) return;
    if (e.target === inputEl || listEl.contains(e.target)) return;
    hideList();
  }

  function init() {
    inputEl = document.getElementById('chat-input');
    listEl = document.getElementById('chat-mention-list');
    if (!inputEl || !listEl) return;

    inputEl.addEventListener('input', onInput);
    inputEl.addEventListener('keydown', onKeyDown);
    inputEl.addEventListener('blur', () => {
      setTimeout(hideList, 150);
    });
    listEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });
    listEl.addEventListener('click', onListClick);
    document.addEventListener('click', onDocumentClick);
  }

  return {
    init,
    insertMention,
    formatMessageText,
    messageMentionsUser,
    getOnlineUsers,
  };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ITVChatMentions.init());
} else {
  ITVChatMentions.init();
}
