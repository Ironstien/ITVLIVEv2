/**
 * ITVLive v2 — rank & staff role name colours (client UI).
 * Keep in sync with server/config/levels.js colour maps.
 */
const ITVRank = (() => {
  const MAX_LEVEL = 60;

  const RANK_NAMES = [
    '',
    'Novice',
    'Novice',
    'Novice',
    'Novice',
    'Novice',
    'Novice',
    'Novice',
    'Novice',
    'Novice',
    'Regular',
    'Regular',
    'Regular',
    'Regular',
    'Regular',
    'Regular',
    'Regular',
    'Regular',
    'Regular',
    'Regular',
    'Member',
    'Member',
    'Member',
    'Member',
    'Member',
    'Member',
    'Member',
    'Member',
    'Member',
    'Member',
    'Veteran',
    'Veteran',
    'Veteran',
    'Veteran',
    'Veteran',
    'Veteran',
    'Veteran',
    'Veteran',
    'Veteran',
    'Veteran',
    'Elite',
    'Elite',
    'Elite',
    'Elite',
    'Elite',
    'Elite',
    'Elite',
    'Elite',
    'Elite',
    'Elite',
    'Champion',
    'Champion',
    'Champion',
    'Champion',
    'Champion',
    'Champion',
    'Champion',
    'Champion',
    'Champion',
    'Champion',
    'Legend',
  ];

  const STAFF_ROLE_LABELS = {
    mod: 'Mod',
    admin: 'Admin',
  };

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getRankNameForLevel(level) {
    const n = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(level) || 1)));
    return RANK_NAMES[n] || 'Novice';
  }

  function rankClassKey(nameOrRole) {
    return String(nameOrRole || 'novice')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');
  }

  function formatRankName(rankName, { className = 'rank-name' } = {}) {
    const name = rankName || 'Novice';
    const key = rankClassKey(name);
    return `<span class="${escapeHtml(className)} rank-name--${escapeHtml(key)}">${escapeHtml(name)}</span>`;
  }

  function formatRankForLevel(level, options) {
    return formatRankName(getRankNameForLevel(level), options);
  }

  function formatStaffRole(staffRole, { className = 'rank-name rank-name--staff' } = {}) {
    if (!staffRole) return '';
    const key = rankClassKey(staffRole);
    const label = STAFF_ROLE_LABELS[staffRole] || staffRole;
    return `<span class="${escapeHtml(className)} rank-name--${escapeHtml(key)}">${escapeHtml(label)}</span>`;
  }

  function formatLevelRankLine(level, { levelPrefix = 'Lv.' } = {}) {
    const n = Math.max(1, Math.floor(Number(level) || 1));
    return `${levelPrefix}${n} · ${formatRankForLevel(n)}`;
  }

  function formatChatName(displayName, { level = 1, staffRole = null, asButton = false } = {}) {
    const name = escapeHtml(displayName || 'Guest');
    const innerClass = asButton ? 'chat-name' : 'chat-name';
    if (staffRole === 'mod' || staffRole === 'admin') {
      const key = rankClassKey(staffRole);
      if (asButton) {
        return `<span class="${innerClass} rank-name rank-name--${escapeHtml(key)}">${name}</span>`;
      }
      return `<strong class="chat-name rank-name rank-name--${escapeHtml(key)}">${name}</strong>`;
    }
    const key = rankClassKey(getRankNameForLevel(level));
    if (asButton) {
      return `<span class="${innerClass} rank-name rank-name--${escapeHtml(key)}">${name}</span>`;
    }
    return `<strong class="chat-name rank-name rank-name--${escapeHtml(key)}">${name}</strong>`;
  }

  return {
    getRankNameForLevel,
    formatRankName,
    formatRankForLevel,
    formatStaffRole,
    formatLevelRankLine,
    formatChatName,
    escapeHtml,
  };
})();
