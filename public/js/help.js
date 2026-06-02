/**
 * ITVLive v2 — Help & FAQ modal (progression table, ranks, staff roles, badges).
 */
const ITVHelp = (() => {
  const MODAL_ID = 'help';
  const bodyEl = () => document.getElementById('modal-help-body');

  let progressionCache = null;
  let loadPromise = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatRank(name) {
    if (typeof ITVRank !== 'undefined' && ITVRank.formatRankName) {
      return ITVRank.formatRankName(name);
    }
    return escapeHtml(name);
  }

  async function loadProgression() {
    if (progressionCache) return progressionCache;
    if (loadPromise) return loadPromise;
    loadPromise = fetch('/api/help/progression')
      .then((r) => {
        if (!r.ok) throw new Error('Could not load progression data');
        return r.json();
      })
      .then((data) => {
        progressionCache = data;
        return data;
      })
      .finally(() => {
        loadPromise = null;
      });
    return loadPromise;
  }

  function renderXpRewards(data) {
    const r = data.xpRewards;
    return `
      <ul class="help-list">
        <li><strong>+${r.listen} XP</strong> — you were listening when a track ended (not as the DJ).</li>
        <li><strong>+${r.dj} XP</strong> — your song finished playing on stage.</li>
        <li><strong>+${r.vote} XP</strong> — you voted on a track (slider moved before the song ended).</li>
      </ul>
      <p class="help-note muted">XP is the only currency on ITV — there are no tokens or a shop. Levels run from <strong>1</strong> to <strong>${data.maxLevel}</strong>.</p>`;
  }

  function renderRankTiers(data) {
    return `
      <div class="help-table-scroll">
        <table class="help-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Levels</th>
              <th class="help-table__num">XP range</th>
            </tr>
          </thead>
          <tbody>
            ${data.rankTiers
              .map(
                (t) => `
              <tr>
                <td>${formatRank(t.name)}</td>
                <td>${t.levelFrom}–${t.levelTo}</td>
                <td class="help-table__num">${t.xpFrom.toLocaleString()} – ${t.xpTo.toLocaleString()}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderLevelTable(data) {
    return `
      <div class="help-table-scroll help-table-scroll--tall">
        <table class="help-table help-table--levels">
          <thead>
            <tr>
              <th class="help-table__num">Lv</th>
              <th>Rank</th>
              <th class="help-table__num">Total XP</th>
              <th class="help-table__num">XP to next</th>
            </tr>
          </thead>
          <tbody>
            ${data.levels
              .map(
                (row) => `
              <tr>
                <td class="help-table__num">${row.level}</td>
                <td>${formatRank(row.rank)}</td>
                <td class="help-table__num">${row.xpRequired.toLocaleString()}</td>
                <td class="help-table__num">${row.level >= data.maxLevel ? '—' : row.xpToNext.toLocaleString()}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderStaffRoles(data) {
    return `
      <ul class="help-staff-roles">
        ${data.staffRoles
          .map(
            (role) => `
          <li class="help-staff-role">
            <span class="help-staff-role__label" style="color:${escapeHtml(role.color)}">${escapeHtml(role.label)}</span>
            <p>${escapeHtml(role.summary)}</p>
          </li>`
          )
          .join('')}
      </ul>
      <p class="help-note muted"><strong>Level</strong> is earned through XP. <strong>Staff roles</strong> are assigned by admins — they are separate from your level rank.</p>`;
  }

  function renderBadges(data) {
    const placeholder =
      data.badges.placeholder != null
        ? `<div class="help-badges-placeholder" role="status">
        <span class="help-badges-placeholder__icon" aria-hidden="true">◇</span>
        <p class="muted">${escapeHtml(data.badges.placeholder)}</p>
      </div>`
        : '';
    return `
      <p>${escapeHtml(data.badges.intro)}</p>
      ${placeholder}
      <p class="help-note muted">Badges are <strong>not</strong> shown inline in chat — only in <strong>My Data</strong> and the profile popup when you click a username.</p>`;
  }

  function renderFaqBlock() {
    return `
      <details class="help-faq">
        <summary>Do I need an account?</summary>
        <p>Guests can <strong>chat</strong> and <strong>listen</strong> for free. Playlists, the DJ queue, ripping tracks, and voting require a registered account.</p>
      </details>
      <details class="help-faq">
        <summary>How does the Main Stage layout work?</summary>
        <ul class="help-list">
          <li><strong>Left — Your Playlist</strong> — build sets (account only).</li>
          <li><strong>Centre — Player</strong> — everyone hears the same synced track.</li>
          <li><strong>Right — Live Chat / Online / DJ Queue</strong> — talk, see who is here, view the line-up.</li>
          <li><strong>Bottom — The Vinyl Pit</strong> — visual queue row and who is listening.</li>
        </ul>
      </details>
      <details class="help-faq">
        <summary>How do I become a DJ?</summary>
        <ol class="help-list help-list--ordered">
          <li>Log in and create at least one playlist with YouTube tracks.</li>
          <li>Set one playlist as <strong>active</strong> (★ in the playlist toolbar).</li>
          <li>Click <strong>Join Queue</strong>. When it is your turn, tracks play from your active playlist in order.</li>
        </ol>
      </details>
      <details class="help-faq">
        <summary>Playlist import format</summary>
        <p>One track per line — title, then a space, then the YouTube URL:</p>
        <pre class="help-code">Track Title https://www.youtube.com/watch?v=VIDEO_ID
Another Title https://youtu.be/VIDEO_ID</pre>
      </details>
      <details class="help-faq">
        <summary>How does voting work?</summary>
        <p>You need <strong>level ${progressionCache?.minVoteLevel ?? 2}+</strong> and must be logged in. Move the vote slider during the song — if you never slide, no vote is recorded. You can adjust your score until the track ends; the server locks in your final value when the song finishes.</p>
      </details>
      <details class="help-faq">
        <summary>One account, one tab</summary>
        <p>Only one live connection per account. Opening ITV in another tab replaces the previous session. Use a single tab if you are DJing so you do not drop from the queue unexpectedly.</p>
      </details>
      <details class="help-faq">
        <summary>No sound?</summary>
        <p>Check your local volume and mute button. If the player shows <strong>Click to start playback</strong>, your browser blocked autoplay — click it once. Music keeps playing while you read Help in this window.</p>
      </details>
      <details class="help-faq">
        <summary>Disconnected or stuck on Connecting…</summary>
        <p>Refresh the page and stay on one tab. If you were logged in, use <strong>Log in</strong> again. Still stuck? Ask in chat or contact a mod.</p>
      </details>`;
  }

  function renderQuickStart() {
    return `
      <div class="help-quick-grid">
        <article class="help-quick-card">
          <h3 class="help-quick-card__title">Guest</h3>
          <ol class="help-list help-list--ordered">
            <li>Land on the Main Stage and listen along.</li>
            <li>Open <strong>Live Chat</strong> and say hi.</li>
            <li>Register when you want to DJ or vote.</li>
          </ol>
        </article>
        <article class="help-quick-card">
          <h3 class="help-quick-card__title">Listener</h3>
          <ol class="help-list help-list--ordered">
            <li>Log in — check <strong>My Data</strong> for your level and XP.</li>
            <li>Reach level ${progressionCache?.minVoteLevel ?? 2}+ to unlock voting.</li>
            <li>Slide the vote control while a track plays.</li>
          </ol>
        </article>
        <article class="help-quick-card">
          <h3 class="help-quick-card__title">DJ</h3>
          <ol class="help-list help-list--ordered">
            <li>Build an <strong>active playlist</strong> with YouTube URLs.</li>
            <li>Hit <strong>Join Queue</strong> and wait your turn.</li>
            <li>Use <strong>Rip current song</strong> to save what is playing to your playlist.</li>
          </ol>
        </article>
      </div>`;
  }

  async function render() {
    const el = bodyEl();
    if (!el) return;

    el.innerHTML = '<p class="modal-card__lead muted">Loading guide…</p>';

    try {
      const data = await loadProgression();
      el.innerHTML = `
        <p class="modal-card__lead">
          Welcome to the Main Stage — one live room where DJs rotate, listeners vote, and everyone earns XP together.
          This guide stays open while the music keeps playing.
        </p>

        <nav class="help-toc" aria-label="Help sections">
          <a href="#help-quick">Quick start</a>
          <a href="#help-faq">FAQ</a>
          <a href="#help-xp">XP &amp; levels</a>
          <a href="#help-ranks">User ranks</a>
          <a href="#help-levels">Level table</a>
          <a href="#help-staff">Staff roles</a>
          <a href="#help-badges">Badges</a>
        </nav>

        <section class="help-section" id="help-quick">
          <h3 class="help-section__title">Quick start</h3>
          ${renderQuickStart()}
        </section>

        <section class="help-section" id="help-faq">
          <h3 class="help-section__title">FAQ</h3>
          ${renderFaqBlock()}
        </section>

        <section class="help-section" id="help-xp">
          <h3 class="help-section__title">XP &amp; leveling</h3>
          ${renderXpRewards(data)}
          <p class="help-note">Voting unlocks at <strong>level ${data.minVoteLevel}</strong> (${data.levels[1]?.rank || 'Novice'}).</p>
        </section>

        <section class="help-section" id="help-ranks">
          <h3 class="help-section__title">User ranks</h3>
          <p>Your rank title follows your level tier. There are seven rank names across 60 levels:</p>
          ${renderRankTiers(data)}
        </section>

        <section class="help-section" id="help-levels">
          <h3 class="help-section__title">Level threshold table</h3>
          <p class="help-note muted">Total XP required to <em>reach</em> each level. Scroll for all ${data.maxLevel} levels.</p>
          ${renderLevelTable(data)}
        </section>

        <section class="help-section" id="help-staff">
          <h3 class="help-section__title">Staff roles</h3>
          ${renderStaffRoles(data)}
        </section>

        <section class="help-section" id="help-badges">
          <h3 class="help-section__title">Badges</h3>
          ${renderBadges(data)}
        </section>

        <p class="help-footer muted">Need the short version? See <button type="button" class="help-inline-link" data-open-modal="about">About Us</button> in the nav.</p>`;
    } catch (err) {
      el.innerHTML = `<p class="modal-card__lead muted">${escapeHtml(err.message || 'Failed to load help')}</p>`;
    }
  }

  function init() {
    const trigger = document.querySelector(`[data-open-modal="${MODAL_ID}"]`);
    trigger?.addEventListener('click', () => {
      render();
    });

    document.getElementById('modal-help-body')?.addEventListener('click', (e) => {
      const link = e.target.closest('.help-inline-link[data-open-modal]');
      if (!link) return;
      const id = link.getAttribute('data-open-modal');
      if (id && typeof ITVModal !== 'undefined') {
        ITVModal.open(id);
      }
    });
  }

  return { init, render, loadProgression };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ITVHelp.init());
} else {
  ITVHelp.init();
}
