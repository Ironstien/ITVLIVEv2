/**
 * ITVLive v2 — Song Data modal (lifetime play & vote stats per track).
 */
const ITVSongData = (() => {
  const MODAL_ID = 'song-data';
  const SORT_COLUMNS = [
    { key: 'title', label: 'Song', numeric: false },
    { key: 'playCount', label: 'Plays', numeric: true },
    { key: 'voteCount', label: 'Votes', numeric: true },
    { key: 'avgScore', label: 'Avg', numeric: true },
    { key: 'highScore', label: 'High', numeric: true },
    { key: 'lowScore', label: 'Low', numeric: true },
  ];

  let bodyEl = null;
  let loading = false;
  let songsCache = [];
  let sortKey = null;
  let sortDir = 'asc';

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

  function compareSongs(a, b, key, dir) {
    const mult = dir === 'asc' ? 1 : -1;

    if (key === 'title') {
      return mult * String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
    }

    const av = a[key];
    const bv = b[key];
    const aNull = av == null || av === '';
    const bNull = bv == null || bv === '';
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    return mult * (Number(av) - Number(bv));
  }

  function sortSongs(songs) {
    if (!sortKey) return songs;
    return [...songs].sort((a, b) => compareSongs(a, b, sortKey, sortDir));
  }

  function getSortIcon(key) {
    if (sortKey !== key) return '⇅';
    return sortDir === 'asc' ? '↑' : '↓';
  }

  function buildSortHeader(col) {
    const icon = getSortIcon(col.key);
    const active = sortKey === col.key;
    const activeClass = active ? ` song-data-sort-btn--active song-data-sort-btn--${sortDir}` : '';
    const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';

    return `
      <th scope="col" aria-sort="${ariaSort}">
        <span class="song-data-sort-header${col.numeric ? ' song-data-sort-header--numeric' : ''}">
          <span class="song-data-sort-label">${escapeHtml(col.label)}</span>
          <button
            type="button"
            class="song-data-sort-btn${activeClass}"
            data-sort-key="${escapeHtml(col.key)}"
            aria-label="Sort by ${escapeHtml(col.label)}${active ? `, ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}"
          >
            <span class="song-data-sort-icon" aria-hidden="true">${icon}</span>
          </button>
        </span>
      </th>
    `;
  }

  function handleSortClick(e) {
    const btn = e.target.closest('.song-data-sort-btn');
    if (!btn || !bodyEl?.contains(btn)) return;
    e.preventDefault();

    const key = btn.dataset.sortKey;
    if (!key) return;

    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      const col = SORT_COLUMNS.find((c) => c.key === key);
      sortDir = col?.numeric ? 'desc' : 'asc';
    }

    renderList(songsCache);
  }

  function renderList(songs) {
    if (!bodyEl) return;

    songsCache = Array.isArray(songs) ? songs : [];

    if (!songsCache.length) {
      bodyEl.innerHTML =
        '<p class="modal-card__lead muted">No songs have been played on the stage yet. Stats appear here after tracks finish with the database connected.</p>';
      return;
    }

    const sorted = sortSongs(songsCache);

    const rows = sorted
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
      <p class="modal-card__lead">${songsCache.length} track${songsCache.length === 1 ? '' : 's'} with stage history. Lifetime stats across all plays.</p>
      <div class="song-data-scroll">
        <table class="song-data-table">
          <thead>
            <tr>${SORT_COLUMNS.map(buildSortHeader).join('')}</tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  async function load() {
    if (loading || !bodyEl) return;
    loading = true;
    sortKey = null;
    sortDir = 'asc';
    songsCache = [];
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
    bodyEl?.addEventListener('click', handleSortClick);
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
