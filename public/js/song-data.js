/**
 * ITVLive v2 — Song Data modal (lifetime play & vote stats per track).
 */
const ITVSongData = (() => {
  const MODAL_ID = 'song-data';
  let bodyEl = null;
  let loading = false;

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatStat(value, digits) {
    if (value == null || value === '') return '—';
    if (typeof value === 'number' && Number.isFinite(value)) {
      return digits != null ? value.toFixed(digits) : String(value);
    }
    return String(value);
  }

  function youtubeUrl(youtubeId) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`;
  }

  function renderLoading() {
    if (!bodyEl) return;
    bodyEl.innerHTML = '<p class="modal-card__lead muted">Loading song data…</p>';
  }

  function renderError(message) {
    if (!bodyEl) return;
    bodyEl.innerHTML = `<p class="modal-card__lead muted">${escapeHtml(message)}</p>`;
  }

  function renderList(songs) {
    if (!bodyEl) return;

    if (!songs.length) {
      bodyEl.innerHTML =
        '<p class="modal-card__lead muted">No songs have been played on the stage yet. Stats appear here after tracks finish with the database connected.</p>';
      return;
    }

    const rows = songs
      .map(
        (song) => `
      <tr>
        <td class="song-data__title">
          <a href="${escapeHtml(youtubeUrl(song.youtubeId))}" target="_blank" rel="noopener noreferrer">${escapeHtml(song.title)}</a>
        </td>
        <td class="song-data__num">${formatStat(song.playCount)}</td>
        <td class="song-data__num">${formatStat(song.voteCount)}</td>
        <td class="song-data__num">${formatStat(song.avgScore, 1)}</td>
        <td class="song-data__num">${formatStat(song.highScore)}</td>
        <td class="song-data__num">${formatStat(song.lowScore)}</td>
      </tr>
    `
      )
      .join('');

    bodyEl.innerHTML = `
      <p class="modal-card__lead">${songs.length} track${songs.length === 1 ? '' : 's'} with stage history. Lifetime stats across all plays.</p>
      <div class="song-data-scroll">
        <table class="song-data-table">
          <thead>
            <tr>
              <th scope="col">Song</th>
              <th scope="col">Plays</th>
              <th scope="col">Votes</th>
              <th scope="col">Avg</th>
              <th scope="col">High</th>
              <th scope="col">Low</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  async function load() {
    if (loading || !bodyEl) return;
    loading = true;
    renderLoading();
    try {
      const res = await fetch('/api/songs');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        renderError(data.error || 'Could not load song data');
        return;
      }
      renderList(Array.isArray(data.songs) ? data.songs : []);
    } catch (_err) {
      renderError('Could not load song data');
    } finally {
      loading = false;
    }
  }

  function init() {
    bodyEl = document.getElementById('modal-song-data-body');
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
  document.addEventListener('DOMContentLoaded', () => ITVSongData.init());
} else {
  ITVSongData.init();
}
