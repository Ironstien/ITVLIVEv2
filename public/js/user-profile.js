/**
 * ITVLive v2 — user profile modal (opened from chat username click).
 */
const ITVUserProfile = (() => {
  const MODAL_ID = 'user-profile';
  let bodyEl = null;
  let titleEl = null;
  let loading = false;

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderLoading() {
    if (!bodyEl) return;
    bodyEl.innerHTML = '<p class="modal-card__lead muted">Loading profile…</p>';
  }

  function renderGuest(snapshot) {
    if (!bodyEl) return;
    const name = escapeHtml(snapshot.displayName || 'Guest');
    const level = snapshot.level ?? 1;
    const rankLine =
      typeof ITVRank !== 'undefined'
        ? ITVRank.formatLevelRankLine(level)
        : `Lv.${level}`;

    if (titleEl) titleEl.textContent = snapshot.displayName || 'Guest';

    bodyEl.innerHTML = `
      <div class="user-profile">
        <div class="user-profile__header">
          <div class="user-profile__avatar user-profile__avatar--guest" aria-hidden="true">${name.charAt(0).toUpperCase()}</div>
          <div class="user-profile__meta">
            <p class="user-profile__name">${name}</p>
            <p class="user-profile__rank muted">${rankLine}</p>
            <p class="user-profile__note muted">Guest account — no badges or saved profile.</p>
          </div>
        </div>
      </div>
    `;
  }

  async function renderProfile(profile) {
    if (!bodyEl) return;
    if (titleEl) titleEl.textContent = profile.username || 'User';

    const rankHtml =
      typeof ITVRank !== 'undefined'
        ? ITVRank.formatLevelRankLine(profile.level ?? 1)
        : `Lv.${profile.level ?? 1} · ${escapeHtml(profile.rank || '')}`;

    const staffHtml =
      profile.staffRole && typeof ITVRank !== 'undefined'
        ? ITVRank.formatStaffRole(profile.staffRole)
        : profile.staffRoleLabel
          ? escapeHtml(profile.staffRoleLabel)
          : '';

    const avatarHtml = profile.avatarUrl
      ? `<img class="user-profile__avatar-img" src="${escapeHtml(profile.avatarUrl)}" alt="" loading="lazy" />`
      : `<span class="user-profile__avatar-initial" aria-hidden="true">${escapeHtml((profile.username || '?').charAt(0).toUpperCase())}</span>`;

    const saying = profile.customSaying
      ? `<p class="user-profile__saying">“${escapeHtml(profile.customSaying)}”</p>`
      : '';

    const badgeGrid =
      typeof ITVBadges !== 'undefined'
        ? await ITVBadges.renderBadgeGrid(profile.badgeDetails || profile.badges || [], {
            emptyMessage: 'No badges earned yet.',
          })
        : '<p class="muted">—</p>';

    const stats = profile.stats || {};

    bodyEl.innerHTML = `
      <div class="user-profile">
        <div class="user-profile__header">
          <div class="user-profile__avatar">${avatarHtml}</div>
          <div class="user-profile__meta">
            <p class="user-profile__name">${escapeHtml(profile.username)}</p>
            <p class="user-profile__rank">${rankHtml}${staffHtml ? ` · ${staffHtml}` : ''}</p>
            ${saying}
          </div>
        </div>
        <section class="user-profile__section">
          <h3 class="user-profile__heading">Badges</h3>
          ${badgeGrid}
        </section>
        <section class="user-profile__section">
          <h3 class="user-profile__heading">Stage stats</h3>
          <table class="my-data-table">
            <tr><th scope="row">DJ plays</th><td>${escapeHtml(stats.totalPlays ?? 0)}</td></tr>
            <tr><th scope="row">Listens</th><td>${escapeHtml(stats.totalListens ?? 0)}</td></tr>
            <tr><th scope="row">Votes given</th><td>${escapeHtml(stats.totalVotesGiven ?? 0)}</td></tr>
            <tr><th scope="row">Votes received</th><td>${escapeHtml(stats.totalVotesReceived ?? 0)}</td></tr>
            <tr><th scope="row">Avg score received</th><td>${stats.avgScoreReceived ? escapeHtml(Number(stats.avgScoreReceived).toFixed(1)) : '—'}</td></tr>
          </table>
        </section>
      </div>
    `;
  }

  async function openForUserId(userId) {
    if (loading || !bodyEl) return;
    loading = true;
    renderLoading();
    ITVModal.open(MODAL_ID);

    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}/profile`);
      const data = await res.json();
      if (!res.ok) {
        bodyEl.innerHTML = `<p class="modal-card__lead muted">${escapeHtml(data.error || 'Could not load profile')}</p>`;
        return;
      }
      await renderProfile(data.profile);
    } catch (_err) {
      bodyEl.innerHTML = '<p class="modal-card__lead muted">Could not load profile.</p>';
    } finally {
      loading = false;
    }
  }

  function openGuest(snapshot) {
    ITVModal.open(MODAL_ID);
    renderGuest(snapshot);
  }

  function handleChatClick(e) {
    const btn = e.target.closest('.chat-name-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const userId = btn.dataset.userId;
    if (userId) {
      openForUserId(userId);
      return;
    }

    openGuest({
      displayName: btn.dataset.displayName || btn.textContent.trim(),
      level: Number(btn.dataset.level) || 1,
    });
  }

  function init() {
    bodyEl = document.getElementById('modal-user-profile-body');
    titleEl = document.getElementById('modal-user-profile-title');
    const chatEl = document.getElementById('chat-messages');
    chatEl?.addEventListener('click', handleChatClick);
  }

  return { init, openForUserId, openGuest };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ITVUserProfile.init());
} else {
  ITVUserProfile.init();
}
