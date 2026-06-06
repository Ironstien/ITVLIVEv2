/**
 * ITVLive v2 — shared staff audit log rendering (mod vs admin scope).
 */
const ITVStaffAuditUI = (() => {
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatActionLabel(action) {
    const labels = {
      clearChat: 'Clear chat',
      skipAnySong: 'Skip song',
      muteUser: 'Mute',
      unmuteUser: 'Unmute',
      timeoutUser: 'Mute',
      kickUser: 'Kick',
      removeFromQueue: 'Remove from queue',
      deleteChatMessage: 'Delete message',
      lockChat: 'Lock chat',
      unlockChat: 'Unlock chat',
      assignStaffRole: 'Assign role',
      setUserXp: 'Set XP',
      resetUserStats: 'Reset stats',
      resetUserBadges: 'Reset badges',
      resetAllUserBadges: 'Reset all badges',
      forceDisconnect: 'Force disconnect',
      blockVideo: 'Block video',
      unblockVideo: 'Unblock video',
      accountBan: 'Ban account',
      unbanAccount: 'Unban account',
      managePlatform: 'Platform settings',
    };
    return labels[action] || action;
  }

  function formatAuditDetails(entry) {
    if (!entry.details) return '';
    const d = entry.details;
    if (entry.action === 'assignStaffRole') {
      return `${d.previousRole || 'none'} → ${d.newRole || 'none'}`;
    }
    if (entry.action === 'setUserXp') {
      const xpPart = `${d.previousXp ?? 0} → ${d.newXp ?? 0} XP`;
      if (d.previousLevel != null && d.newLevel != null && d.previousLevel !== d.newLevel) {
        return `${xpPart} (Lv.${d.previousLevel} → Lv.${d.newLevel})`;
      }
      return xpPart;
    }
    if (entry.action === 'clearChat' && d.cleared != null) {
      return `${d.cleared} message${d.cleared === 1 ? '' : 's'}`;
    }
    if ((entry.action === 'muteUser' || entry.action === 'timeoutUser') && d.durationMinutes) {
      return `${d.durationMinutes} min`;
    }
    if (entry.action === 'skipAnySong') {
      const parts = [];
      if (d.djName) parts.push(d.djName);
      if (d.videoId) parts.push(d.videoId);
      return parts.join(' · ');
    }
    if (entry.action === 'deleteChatMessage' && d.preview) {
      return d.preview;
    }
    if (entry.action === 'lockChat') return 'Locked';
    if (entry.action === 'unlockChat') return 'Unlocked';
    if (entry.action === 'managePlatform') {
      const parts = [];
      if (d.previousMaintenanceMode !== d.maintenanceMode) {
        parts.push(d.maintenanceMode ? 'Maintenance on' : 'Maintenance off');
      }
      if (d.previousTestDjEnabled !== d.testDjEnabled) {
        parts.push(d.testDjEnabled ? 'Bob ON' : 'Bob OFF');
      }
      if (parts.length) return parts.join(' · ');
      return d.maintenanceMode ? 'Maintenance on' : 'Maintenance off';
    }
    if (entry.action === 'resetUserStats') {
      return `${d.previousXp ?? 0} XP → 0`;
    }
    if (entry.action === 'resetUserBadges' && d.previousBadgeCount != null) {
      return `${d.previousBadgeCount} badge(s) cleared`;
    }
    if (entry.action === 'resetAllUserBadges' && d.usersModified != null) {
      return `${d.usersModified} user(s)`;
    }
    if (entry.action === 'blockVideo' && d.youtubeId) {
      return d.youtubeId;
    }
    if (entry.action === 'accountBan' && d.reason) {
      return d.reason;
    }
    return '';
  }

  function formatAuditTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  }

  async function loadAuditLog(container, scope, emptyMessage) {
    if (!container) return;
    container.innerHTML = '<p class="admin-tools__hint muted">Loading audit log…</p>';
    try {
      const data = await ITVAuth.api(
        `/api/admin/audit-log?limit=50&scope=${encodeURIComponent(scope)}`
      );
      const entries = data.entries || [];
      if (!entries.length) {
        container.innerHTML = `<p class="admin-tools__hint muted">${escapeHtml(emptyMessage)}</p>`;
        return;
      }
      container.innerHTML = `
        <ul class="admin-audit-list">
          ${entries
            .map(
              (entry) => `
            <li class="admin-audit-list__item">
              <span class="admin-audit-list__time">${escapeHtml(formatAuditTime(entry.createdAt))}</span>
              <span class="admin-audit-list__action">${escapeHtml(formatActionLabel(entry.action))}</span>
              <span class="admin-audit-list__actor">${escapeHtml(entry.actorUsername)}</span>
              ${
                entry.targetUsername
                  ? `<span class="admin-audit-list__target">→ ${escapeHtml(entry.targetUsername)}</span>`
                  : ''
              }
              ${
                formatAuditDetails(entry)
                  ? `<span class="admin-audit-list__detail muted">${escapeHtml(formatAuditDetails(entry))}</span>`
                  : ''
              }
            </li>`
            )
            .join('')}
        </ul>
      `;
    } catch (err) {
      container.innerHTML = `<p class="admin-tools__hint muted">${escapeHtml(err.message || 'Could not load audit log')}</p>`;
    }
  }

  function formatStaffRole(user) {
    if (typeof ITVRank !== 'undefined') {
      return ITVRank.formatStaffRole(user.staffRole);
    }
    return escapeHtml(user.staffRole || 'Staff');
  }

  return {
    escapeHtml,
    formatStaffRole,
    loadAuditLog,
  };
})();
