/**
 * ITVLive v2 — Mod Help & Admin Help modals (staff-only).
 */
const ITVStaffHelp = (() => {
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderModHelp() {
    const el = document.getElementById('modal-mod-help-body');
    if (!el) return;
    el.innerHTML = `
      <p class="modal-card__lead">
        Mod Tools live in the nav next to this guide. Use them calmly — every action is logged in the audit trail at the bottom of Mod Tools.
      </p>

      <section class="help-section">
        <h3 class="help-section__title">Stage</h3>
        <ul class="help-list">
          <li><strong>Clear chat</strong> — removes all messages from the live chat buffer.</li>
          <li><strong>Skip now playing</strong> — advances the current track (only when something is playing).</li>
        </ul>
      </section>

      <section class="help-section">
        <h3 class="help-section__title">Chat moderation</h3>
        <ul class="help-list">
          <li><strong>Mute</strong> — pick an online user and duration (5–60 minutes). They cannot send chat until it expires.</li>
          <li><strong>Unmute</strong> — lift a mute early (select a muted user if none are online).</li>
          <li><strong>Lock chat</strong> — only staff can chat; listeners see the room as locked.</li>
          <li><strong>Unlock chat</strong> — restore chat for everyone.</li>
          <li><strong>Delete message</strong> — remove a single recent chat line from the log.</li>
        </ul>
      </section>

      <section class="help-section">
        <h3 class="help-section__title">Queue</h3>
        <ul class="help-list">
          <li><strong>Remove from queue</strong> — drops a waiting DJ without banning their account.</li>
        </ul>
      </section>

      <section class="help-section">
        <h3 class="help-section__title">Tips</h3>
        <ul class="help-list">
          <li>Targets are chosen from <strong>online account users</strong> (guests use display names only).</li>
          <li>Prefer short mutes for first offenses; escalate if behaviour continues.</li>
          <li>Admins can do everything listed here plus platform actions — see <strong>Admin Help</strong> if you are an admin.</li>
        </ul>
      </section>`;
  }

  function renderAdminHelp() {
    const el = document.getElementById('modal-admin-help-body');
    if (!el) return;
    el.innerHTML = `
      <p class="modal-card__lead">
        The Admin Panel is for platform-wide control. You also have full access to <strong>Mod Tools</strong> and <strong>Mod Help</strong>.
      </p>

      <section class="help-section">
        <h3 class="help-section__title">Manage users</h3>
        <ul class="help-list">
          <li>Search by username or email (at least 2 characters).</li>
          <li><strong>Set XP</strong> — overwrites total XP; level recalculates from the threshold table.</li>
          <li><strong>Save role</strong> — assign <em>None</em>, <em>Mod</em>, or <em>Admin</em>.</li>
          <li><strong>Reset stats</strong> — clears stage stats for that user (plays, votes, listens, etc.).</li>
          <li><strong>Ban / Unban</strong> — banned users cannot log in; optional reason is stored.</li>
          <li><strong>Force disconnect</strong> — kicks an online user from the stage (one-tab session ends).</li>
        </ul>
      </section>

      <section class="help-section">
        <h3 class="help-section__title">Platform</h3>
        <ul class="help-list">
          <li><strong>Maintenance mode</strong> — limits access; pair with a banner message shown on stage.</li>
          <li><strong>Save platform settings</strong> — persists maintenance toggle and message.</li>
        </ul>
      </section>

      <section class="help-section">
        <h3 class="help-section__title">Blocked videos</h3>
        <ul class="help-list">
          <li><strong>Block</strong> — paste a YouTube URL or ID; optional reason. If the video is playing, the stage may skip it.</li>
          <li><strong>Unblock</strong> — remove a block from the list below the form.</li>
        </ul>
      </section>

      <section class="help-section">
        <h3 class="help-section__title">Audit log</h3>
        <p class="help-note muted">Admin Panel and Mod Tools both show recent staff actions. Use them to confirm what changed and when.</p>
      </section>

      <section class="help-section">
        <h3 class="help-section__title">Badges &amp; XP</h3>
        <p>Badges are not assigned in the Admin Panel UI yet — award them through your team process until a tool ships. XP and roles are the primary levers here.</p>
      </section>`;
  }

  function init() {
    document.querySelector('[data-open-modal="mod-help"]')?.addEventListener('click', renderModHelp);
    document.querySelector('[data-open-modal="admin-help"]')?.addEventListener('click', renderAdminHelp);
  }

  return { init, renderModHelp, renderAdminHelp };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ITVStaffHelp.init());
} else {
  ITVStaffHelp.init();
}
