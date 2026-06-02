/**
 * ITVLive v2 — My Data modal (full account data for the logged-in user).
 */
const ITVMyData = (() => {
  const MODAL_ID = 'my-data';
  let bodyEl = null;
  let loading = false;

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatValue(value) {
    if (value == null || value === '') return '—';
    if (Array.isArray(value)) {
      return value.length ? value.join(', ') : '—';
    }
    return escapeHtml(value);
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch (_err) {
      return escapeHtml(iso);
    }
  }

  function xpReasonLabel(reason) {
    const map = {
      listen: 'Listened to a track',
      dj_play: 'DJ play',
      vote: 'Cast a vote',
    };
    return map[reason] || reason || '—';
  }

  function renderRow(label, value) {
    return `<tr><th scope="row">${escapeHtml(label)}</th><td>${value}</td></tr>`;
  }

  function renderSection(title, rowsHtml) {
    return `
      <section class="my-data-section">
        <h3 class="my-data-section__title">${escapeHtml(title)}</h3>
        <table class="my-data-table">${rowsHtml}</table>
      </section>
    `;
  }

  function renderLoginPrompt() {
    if (!bodyEl) return;
    bodyEl.innerHTML = `
      <p class="modal-card__lead">Log in to view everything stored on your account.</p>
      <button type="button" class="btn-primary auth-submit" id="my-data-login-btn">Log in</button>
    `;
    const btn = document.getElementById('my-data-login-btn');
    btn?.addEventListener('click', () => {
      ITVModal.close(MODAL_ID);
      ITVModal.open('login');
    });
  }

  function renderLoading() {
    if (!bodyEl) return;
    bodyEl.innerHTML = '<p class="modal-card__lead muted">Loading your data…</p>';
  }

  function renderError(message) {
    if (!bodyEl) return;
    bodyEl.innerHTML = `<p class="modal-card__lead muted">${escapeHtml(message)}</p>`;
  }

  function renderData(data) {
    if (!bodyEl) return;

    const { account, progression, staff, profile, stats, playlists, xpHistory, voteHistory } = data;

    const accountHtml = renderSection(
      'Account',
      [
        renderRow('Username', formatValue(account.username)),
        renderRow('Email', formatValue(account.email)),
        renderRow('User ID', formatValue(account.id)),
        renderRow('Registered', formatDate(account.createdAt)),
        renderRow('Last updated', formatDate(account.updatedAt)),
      ].join('')
    );

    const rankValue =
      typeof ITVRank !== 'undefined'
        ? ITVRank.formatRankName(progression.rank)
        : formatValue(progression.rank);

    const staffRoleValue =
      staff.staffRole && typeof ITVRank !== 'undefined'
        ? ITVRank.formatStaffRole(staff.staffRole)
        : formatValue(staff.staffRole || 'None');

    const progressionHtml = renderSection(
      'Progression',
      [
        renderRow('Level', formatValue(progression.level)),
        renderRow('Rank', rankValue),
        renderRow('Total XP', formatValue(progression.xp)),
        renderRow('XP to next level', formatValue(progression.xpToNextLevel)),
      ].join('')
    );

    const staffHtml = renderSection(
      'Staff & badges',
      [
        renderRow('Staff role', staffRoleValue),
        renderRow('Badges', formatValue(staff.badges)),
      ].join('')
    );

    const profileHtml = renderSection(
      'Profile',
      [
        renderRow('Avatar URL', profile.avatarUrl ? `<a href="${escapeHtml(profile.avatarUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(profile.avatarUrl)}</a>` : '—'),
        renderRow('Custom saying', formatValue(profile.customSaying || '—')),
        renderRow('Active playlist ID', formatValue(profile.activePlaylistId)),
      ].join('')
    );

    const statsHtml = renderSection(
      'Stage stats',
      [
        renderRow('Total DJ plays', formatValue(stats.totalPlays)),
        renderRow('Total listens', formatValue(stats.totalListens)),
        renderRow('Votes given', formatValue(stats.totalVotesGiven)),
        renderRow('Votes received (as DJ)', formatValue(stats.totalVotesReceived)),
        renderRow('Average score received', stats.avgScoreReceived ? formatValue(Number(stats.avgScoreReceived).toFixed(1)) : '—'),
      ].join('')
    );

    const playlistRows = playlists.length
      ? playlists
          .map(
            (p) =>
              `<tr><td>${escapeHtml(p.name)}${p.isActive ? ' ★' : ''}</td><td class="my-data__meta">${formatDate(p.createdAt)}</td></tr>`
          )
          .join('')
      : '<tr><td colspan="2" class="muted">No playlists</td></tr>';

    const playlistsHtml = `
      <section class="my-data-section">
        <h3 class="my-data-section__title">Playlists (${playlists.length})</h3>
        <div class="my-data-scroll">
          <table class="my-data-table">
            <thead><tr><th scope="col">Name</th><th scope="col">Created</th></tr></thead>
            <tbody>${playlistRows}</tbody>
          </table>
        </div>
      </section>
    `;

    const xpRows = xpHistory.length
      ? xpHistory
          .map(
            (row) =>
              `<tr><td>${formatDate(row.createdAt)}</td><td class="my-data__num">${row.amount > 0 ? '+' : ''}${formatValue(row.amount)}</td><td>${escapeHtml(xpReasonLabel(row.reason))}</td></tr>`
          )
          .join('')
      : '<tr><td colspan="3" class="muted">No XP history yet</td></tr>';

    const xpHtml = `
      <section class="my-data-section">
        <h3 class="my-data-section__title">Recent XP (${xpHistory.length})</h3>
        <div class="my-data-scroll">
          <table class="my-data-table">
            <thead><tr><th scope="col">When</th><th scope="col">XP</th><th scope="col">Reason</th></tr></thead>
            <tbody>${xpRows}</tbody>
          </table>
        </div>
      </section>
    `;

    const voteRows = voteHistory.length
      ? voteHistory
          .map(
            (row) =>
              `<tr><td>${formatDate(row.votedAt)}</td><td class="my-data__num">${formatValue(row.score)}</td><td>${row.youtubeId ? `<a href="https://www.youtube.com/watch?v=${escapeHtml(row.youtubeId)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.youtubeId)}</a>` : '—'}</td></tr>`
          )
          .join('')
      : '<tr><td colspan="3" class="muted">No votes cast yet</td></tr>';

    const votesHtml = `
      <section class="my-data-section">
        <h3 class="my-data-section__title">Recent votes (${voteHistory.length})</h3>
        <div class="my-data-scroll">
          <table class="my-data-table">
            <thead><tr><th scope="col">When</th><th scope="col">Score</th><th scope="col">Track</th></tr></thead>
            <tbody>${voteRows}</tbody>
          </table>
        </div>
      </section>
    `;

    bodyEl.innerHTML = `
      <p class="modal-card__lead">Everything stored on your account (password is never shown).</p>
      <div class="my-data-sections">
        ${accountHtml}
        ${progressionHtml}
        ${staffHtml}
        ${profileHtml}
        ${statsHtml}
        ${playlistsHtml}
        ${xpHtml}
        ${votesHtml}
      </div>
    `;
  }

  async function load() {
    if (loading || !bodyEl) return;

    if (!ITVAuth.getToken()) {
      renderLoginPrompt();
      return;
    }

    loading = true;
    renderLoading();
    try {
      const data = await ITVAuth.api('/api/auth/my-data');
      renderData(data);
    } catch (err) {
      if (err.status === 401) {
        renderLoginPrompt();
      } else {
        renderError(err.message || 'Could not load your data');
      }
    } finally {
      loading = false;
    }
  }

  function init() {
    bodyEl = document.getElementById('modal-my-data-body');
    const trigger = document.querySelector(`[data-open-modal="${MODAL_ID}"]`);
    if (trigger) {
      trigger.addEventListener('click', () => {
        load();
      });
    }
  }

  return { init, load };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ITVMyData.init());
} else {
  ITVMyData.init();
}
