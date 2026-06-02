/**
 * ITVLive v2 — personal playlist panel (logged-in users only).
 */
const ITVPlaylist = (() => {
  const panel = document.getElementById('panel-playlist');
  const selectEl = document.getElementById('playlist-select');
  const itemsEl = document.getElementById('playlist-items');
  const formEl = document.getElementById('playlist-add-form');
  const urlInput = document.getElementById('playlist-url-input');
  const statusEl = document.getElementById('playlist-status');
  const importFile = document.getElementById('playlist-import-file');

  const btnNew = document.getElementById('btn-playlist-new');
  const btnActive = document.getElementById('btn-playlist-active');
  const btnRename = document.getElementById('btn-playlist-rename');
  const btnDelete = document.getElementById('btn-playlist-delete');
  const btnAdd = document.getElementById('btn-playlist-add');
  const btnImport = document.getElementById('btn-playlist-import');
  const btnExport = document.getElementById('btn-playlist-export');

  let enabled = false;
  let playlists = [];
  let items = [];
  let selectedId = null;
  let accountUserId = null;
  let dragId = null;
  let pendingImportText = null;
  let createForImport = false;
  let importBusy = false;
  let progressTimer = null;
  let progressValue = 0;
  let blockEscapeHandler = null;

  const newForm = document.getElementById('playlist-new-form');
  const newNameInput = document.getElementById('playlist-new-name');
  const newErrorEl = document.getElementById('playlist-new-error');
  const newSubmitBtn = document.getElementById('playlist-new-submit');
  const newTitleEl = document.getElementById('modal-playlist-new-title');
  const renameForm = document.getElementById('playlist-rename-form');
  const renameNameInput = document.getElementById('playlist-rename-name');
  const renameErrorEl = document.getElementById('playlist-rename-error');
  const renameSubmitBtn = document.getElementById('playlist-rename-submit');
  const importOverwriteBtn = document.getElementById('playlist-import-overwrite');
  const importAppendBtn = document.getElementById('playlist-import-append');
  const importNewBtn = document.getElementById('playlist-import-new');
  const deleteNameEl = document.getElementById('playlist-delete-name');
  const deleteCancelBtn = document.getElementById('playlist-delete-cancel');
  const deleteConfirmBtn = document.getElementById('playlist-delete-confirm');
  const importModalEl = document.querySelector('[data-modal-id="playlist-import"]');
  const createModalEl = document.querySelector('[data-modal-id="playlist-new"]');

  function thumbUrl(youtubeId) {
    return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
  }

  function setStatus(msg, isError) {
    if (!statusEl) return;
    if (!msg) {
      statusEl.classList.add('hidden');
      statusEl.textContent = '';
      return;
    }
    statusEl.textContent = msg;
    statusEl.classList.remove('hidden');
    statusEl.style.color = isError ? 'var(--danger)' : '';
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...ITVAuth.authHeaders(),
        ...(options.headers || {}),
      },
    });
    if (options.raw) return res;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText || 'Request failed');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function setGuestMode(isGuest) {
    enabled = !isGuest;
    if (panel) panel.classList.toggle('panel-playlist--guest', isGuest);

    [selectEl, urlInput, btnAdd, btnNew, btnActive, btnRename, btnDelete, btnImport, btnExport].forEach((el) => {
      if (el) el.disabled = isGuest;
    });

    if (isGuest) {
      accountUserId = null;
      playlists = [];
      items = [];
      selectedId = null;
      renderSelect();
      renderItems();
      if (itemsEl) {
        itemsEl.innerHTML = '<li class="muted">Playlists require an account.</li>';
      }
      setStatus('');
    }
  }

  function renderSelect() {
    if (!selectEl) return;
    selectEl.innerHTML = '';

    if (!playlists.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No playlists yet';
      selectEl.appendChild(opt);
      selectEl.disabled = true;
      return;
    }

    selectEl.disabled = !enabled;
    playlists.forEach((pl) => {
      const opt = document.createElement('option');
      opt.value = pl.id;
      opt.textContent = pl.isActive ? `${pl.name} ★` : pl.name;
      if (pl.id === selectedId) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  function updateActiveButton() {
    if (!btnActive) return;
    const current = playlists.find((p) => p.id === selectedId);
    const isActive = !!current?.isActive;
    btnActive.classList.toggle('is-active', isActive);
    btnActive.disabled = !enabled || !selectedId || isActive;
    btnActive.title = isActive ? 'Active playlist' : 'Set as active playlist';
  }

  function updateRenameButton() {
    if (!btnRename) return;
    btnRename.disabled = !enabled || !selectedId;
    btnRename.title = selectedId ? 'Rename playlist' : 'Select a playlist to rename';
  }

  function updateDeleteButton() {
    if (!btnDelete) return;
    btnDelete.disabled = !enabled || !selectedId;
    btnDelete.title = selectedId ? 'Delete playlist' : 'Select a playlist to delete';
  }

  function updateToolbarButtons() {
    updateActiveButton();
    updateRenameButton();
    updateDeleteButton();
  }

  function getDjQueueMarkerState() {
    if (!enabled || !accountUserId || typeof ITVRoom === 'undefined') return null;

    const active = playlists.find((p) => p.isActive);
    if (!active || active.id !== selectedId) return null;

    const state = ITVRoom.getState();
    if (!state) return null;

    const me = (state.users || []).find((u) => u.userId === accountUserId);
    if (!me?.inQueue) return null;

    const isPlaying = state.nowPlaying?.userId === accountUserId;
    return {
      isPlaying,
      label: isPlaying ? 'Now playing' : 'Your next song',
    };
  }

  function createDjMarkerLi(text) {
    const li = document.createElement('li');
    li.className = 'playlist-dj-marker';
    li.setAttribute('role', 'separator');
    li.setAttribute('aria-label', text);
    li.innerHTML = `
      <span class="playlist-dj-marker__line" aria-hidden="true"></span>
      <span class="playlist-dj-marker__text">${escapeHtml(text)}</span>
      <span class="playlist-dj-marker__line" aria-hidden="true"></span>
    `;
    return li;
  }

  function createPlaylistItemElement(item, index) {
    const li = document.createElement('li');
    li.className = 'playlist-item';
    li.draggable = true;
    li.dataset.id = item.id;

    li.innerHTML = `
      <img class="pl-thumb" src="${thumbUrl(item.youtubeId)}" alt="" width="64" height="36" loading="lazy" />
      <div class="pl-info">
        <span class="pl-title">${escapeHtml(item.title)}</span>
        <span class="pl-meta">#${index + 1} · ${item.youtubeId}</span>
      </div>
      <div class="pl-actions">
        ${
          index > 0
            ? `<button type="button" class="btn-ghost btn-sm pl-move-top" title="Move to top" aria-label="Move to top">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l-7.5 7.5H9V20h6v-8.5h4.5L12 4z" /></svg>
        </button>`
            : ''
        }
        <button type="button" class="btn-ghost btn-sm pl-remove" title="Remove" aria-label="Remove">×</button>
      </div>
    `;

    li.addEventListener('dragstart', (e) => {
      dragId = item.id;
      li.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      dragId = null;
      li.classList.remove('is-dragging');
      itemsEl.querySelectorAll('.playlist-item').forEach((row) => {
        row.classList.remove('drag-over-above', 'drag-over-below');
      });
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragId || dragId === item.id) return;
      const rect = li.getBoundingClientRect();
      const above = e.clientY < rect.top + rect.height / 2;
      li.classList.toggle('drag-over-above', above);
      li.classList.toggle('drag-over-below', !above);
    });
    li.addEventListener('dragleave', () => {
      li.classList.remove('drag-over-above', 'drag-over-below');
    });
    li.addEventListener('drop', async (e) => {
      e.preventDefault();
      li.classList.remove('drag-over-above', 'drag-over-below');
      if (!dragId || dragId === item.id) return;

      const rect = li.getBoundingClientRect();
      const insertBefore = e.clientY < rect.top + rect.height / 2;
      const order = items.map((i) => i.id);
      const from = order.indexOf(dragId);
      let to = order.indexOf(item.id);
      if (from < 0 || to < 0) return;

      order.splice(from, 1);
      if (from < to) to -= 1;
      if (!insertBefore) to += 1;
      order.splice(to, 0, dragId);

      try {
        const data = await api(`/api/playlists/${selectedId}/items/reorder`, {
          method: 'PUT',
          body: JSON.stringify({ order }),
        });
        items = data.items || [];
        renderItems();
      } catch (err) {
        setStatus(err.message, true);
      }
    });

    li.querySelector('.pl-move-top')?.addEventListener('click', async () => {
      try {
        await moveItemToTop(item.id);
      } catch (err) {
        setStatus(err.message, true);
      }
    });

    li.querySelector('.pl-remove')?.addEventListener('click', async () => {
      try {
        await api(`/api/playlists/${selectedId}/items/${item.id}`, { method: 'DELETE' });
        items = items.filter((i) => i.id !== item.id);
        renderItems();
        setStatus('Track removed');
      } catch (err) {
        setStatus(err.message, true);
      }
    });

    return li;
  }

  function renderItems() {
    if (!itemsEl) return;
    itemsEl.innerHTML = '';

    if (!enabled) return;

    if (!selectedId) {
      itemsEl.innerHTML = '<li class="muted">Create a playlist to get started.</li>';
      return;
    }

    if (!items.length) {
      itemsEl.innerHTML = '<li class="muted">No tracks yet — paste a URL or import a .txt file.</li>';
      return;
    }

    const marker = getDjQueueMarkerState();

    items.forEach((item, index) => {
      const li = createPlaylistItemElement(item, index);

      if (index === 0 && marker?.isPlaying) {
        li.classList.add('playlist-item--dj-now-playing');
        const label = document.createElement('div');
        label.className = 'playlist-dj-marker-label';
        label.textContent = marker.label;
        li.prepend(label);
      }

      itemsEl.appendChild(li);

      if (index === 0 && marker && !marker.isPlaying) {
        itemsEl.appendChild(createDjMarkerLi(marker.label));
      }
    });
  }

  function updateFromRoomState() {
    if (!enabled || !items.length) return;
    renderItems();
  }

  async function moveItemToTop(itemId) {
    const order = items.map((i) => i.id);
    const from = order.indexOf(itemId);
    if (from <= 0) return;

    order.splice(from, 1);
    order.unshift(itemId);

    const data = await api(`/api/playlists/${selectedId}/items/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ order }),
    });
    items = data.items || [];
    renderItems();
    setStatus('Moved to top');
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function loadPlaylist(id) {
    if (!id) {
      items = [];
      renderItems();
      return;
    }
    const data = await api(`/api/playlists/${id}`);
    items = data.items || [];
    const pl = data.playlist;
    if (pl) {
      const idx = playlists.findIndex((p) => p.id === pl.id);
      if (idx >= 0) playlists[idx] = pl;
    }
    renderSelect();
    renderItems();
    updateToolbarButtons();
  }

  async function refreshList(preferredId) {
    const data = await api('/api/playlists');
    playlists = data.playlists || [];

    if (!playlists.length) {
      selectedId = null;
      items = [];
      renderSelect();
      renderItems();
      updateToolbarButtons();
      return;
    }

    const active = playlists.find((p) => p.isActive);
    if (preferredId && playlists.some((p) => p.id === preferredId)) {
      selectedId = preferredId;
    } else if (active) {
      selectedId = active.id;
    } else {
      selectedId = playlists[0].id;
    }

    renderSelect();
    await loadPlaylist(selectedId);
  }

  async function onUserReady(user) {
    accountUserId = user?.id || null;
    if (!user) {
      setGuestMode(true);
      return;
    }
    setGuestMode(false);
    try {
      await refreshList(user.activePlaylistId || null);
      setStatus('');
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  function countImportLines(text) {
    return String(text || '')
      .split(/\r?\n/)
      .filter((line) => {
        const trimmed = line.trim();
        return trimmed && !trimmed.startsWith('#');
      }).length;
  }

  function getModalCard(modalEl) {
    return modalEl?.querySelector('.modal-card') || null;
  }

  function setImportProgressLabel(modalEl, text) {
    const label = modalEl?.querySelector('.modal-import-progress__label');
    if (label) label.textContent = text;
  }

  function enterIndeterminateProgress(modalEl, lineCount) {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }

    const track = modalEl?.querySelector('.modal-import-progress__track');
    const bar = modalEl?.querySelector('.modal-import-progress__bar');
    if (track) {
      track.classList.add('is-indeterminate');
      track.removeAttribute('aria-valuenow');
      track.setAttribute('aria-busy', 'true');
    }
    if (bar) bar.style.width = '';

    const msg =
      lineCount > 15
        ? `Still working — importing ${lineCount} tracks may take a minute.`
        : 'Still working — hang tight…';
    setImportProgressLabel(modalEl, msg);
  }

  function resetImportProgress(modalEl) {
    const card = getModalCard(modalEl);
    const progress = modalEl?.querySelector('.modal-import-progress');
    const bar = modalEl?.querySelector('.modal-import-progress__bar');
    const track = modalEl?.querySelector('.modal-import-progress__track');

    if (card) card.classList.remove('is-importing');
    if (progress) progress.classList.add('hidden');
    if (bar) {
      bar.style.width = '0%';
      bar.style.marginLeft = '';
    }
    if (track) {
      track.classList.remove('is-indeterminate');
      track.removeAttribute('aria-busy');
      track.setAttribute('aria-valuenow', '0');
    }
    setImportProgressLabel(modalEl, 'Importing tracks…');
    progressValue = 0;

    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }

    if (blockEscapeHandler) {
      document.removeEventListener('keydown', blockEscapeHandler, true);
      blockEscapeHandler = null;
    }

    importBusy = false;
  }

  function startImportProgress(modalEl, text) {
    const card = getModalCard(modalEl);
    const progress = modalEl?.querySelector('.modal-import-progress');
    const bar = modalEl?.querySelector('.modal-import-progress__bar');
    const track = modalEl?.querySelector('.modal-import-progress__track');

    importBusy = true;
    if (card) card.classList.add('is-importing');
    if (progress) progress.classList.remove('hidden');
    setImportProgressLabel(modalEl, 'Importing tracks…');

    blockEscapeHandler = (e) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', blockEscapeHandler, true);

    const lineCount = Math.max(1, countImportLines(text));
    const initialTarget = 45;
    const initialMs = 1500;
    const tickMs = 120;
    const startTime = Date.now();
    let indeterminate = false;

    progressTimer = setInterval(() => {
      if (indeterminate) return;

      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / initialMs);
      progressValue = initialTarget * t;
      const rounded = Math.round(progressValue);
      if (bar) bar.style.width = `${rounded}%`;
      if (track) track.setAttribute('aria-valuenow', String(rounded));

      if (t >= 1) {
        indeterminate = true;
        enterIndeterminateProgress(modalEl, lineCount);
      }
    }, tickMs);
  }

  async function finishImportProgress(modalEl, modalId, success) {
    const bar = modalEl?.querySelector('.modal-import-progress__bar');
    const track = modalEl?.querySelector('.modal-import-progress__track');

    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }

    if (track) {
      track.classList.remove('is-indeterminate');
      track.removeAttribute('aria-busy');
    }
    if (bar) {
      bar.style.marginLeft = '';
      bar.style.width = '100%';
    }
    if (track) track.setAttribute('aria-valuenow', '100');
    setImportProgressLabel(modalEl, 'Import complete');
    progressValue = 100;

    await new Promise((resolve) => setTimeout(resolve, 400));

    resetImportProgress(modalEl);

    if (success) {
      ITVModal.close(modalId);
    } else if (modalId === 'playlist-import') {
      const hasPlaylist = !!selectedId;
      if (importOverwriteBtn) importOverwriteBtn.disabled = !hasPlaylist;
      if (importAppendBtn) importAppendBtn.disabled = !hasPlaylist;
      if (importNewBtn) importNewBtn.disabled = false;
    } else if (modalId === 'playlist-new' && newSubmitBtn) {
      newSubmitBtn.disabled = false;
    }
  }

  async function runImportWithProgress(modalId, text, work) {
    const modalEl = modalId === 'playlist-import' ? importModalEl : createModalEl;
    if (!modalEl) return;

    startImportProgress(modalEl, text);
    try {
      await work();
      await finishImportProgress(modalEl, modalId, true);
    } catch (err) {
      await finishImportProgress(modalEl, modalId, false);
      setStatus(err.message, true);
      if (modalId === 'playlist-new' && newErrorEl) {
        newErrorEl.textContent = err.message;
        newErrorEl.classList.remove('hidden');
      }
      throw err;
    }
  }
  function openCreateModal(forImport = false) {
    createForImport = forImport;
    if (newNameInput) newNameInput.value = '';
    if (newErrorEl) {
      newErrorEl.textContent = '';
      newErrorEl.classList.add('hidden');
    }
    if (newTitleEl) {
      newTitleEl.textContent = forImport ? 'New playlist from import' : 'New playlist';
    }
    if (newSubmitBtn) {
      newSubmitBtn.textContent = forImport ? 'Create and import' : 'Create playlist';
    }
    resetImportProgress(createModalEl);
    ITVModal.open('playlist-new');
  }

  function resetCreateModal() {
    createForImport = false;
    if (newTitleEl) newTitleEl.textContent = 'New playlist';
    if (newSubmitBtn) {
      newSubmitBtn.textContent = 'Create playlist';
      newSubmitBtn.disabled = false;
    }
    resetImportProgress(createModalEl);
  }

  async function submitCreatePlaylist(e) {
    e.preventDefault();
    const name = newNameInput?.value?.trim();
    if (!name) return;

    if (newErrorEl) newErrorEl.classList.add('hidden');
    if (newSubmitBtn) newSubmitBtn.disabled = true;

    const textToImport = createForImport ? pendingImportText : null;

    try {
      const data = await api('/api/playlists', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });

      if (textToImport) {
        const playlistId = data.playlist.id;
        const playlistName = data.playlist.name;
        pendingImportText = null;
        createForImport = false;

        await runImportWithProgress('playlist-new', textToImport, async () => {
          await importTextToPlaylist(playlistId, textToImport, 'replace');
          await refreshList(playlistId);
        });

        if (newForm) newForm.reset();
        resetCreateModal();
        setStatus(`Created "${playlistName}" and imported tracks`);
      } else {
        ITVModal.close('playlist-new');
        if (newForm) newForm.reset();
        resetCreateModal();
        await refreshList(data.playlist?.id);
        setStatus(`Created "${data.playlist.name}"`);
        if (newSubmitBtn) newSubmitBtn.disabled = false;
      }
    } catch (err) {
      if (newErrorEl) {
        newErrorEl.textContent = err.message;
        newErrorEl.classList.remove('hidden');
      }
      if (newSubmitBtn && !importBusy) newSubmitBtn.disabled = false;
    }
  }

  function openImportModal(text) {
    pendingImportText = text;
    resetImportProgress(importModalEl);
    const hasPlaylist = !!selectedId;
    if (importOverwriteBtn) importOverwriteBtn.disabled = !hasPlaylist;
    if (importAppendBtn) importAppendBtn.disabled = !hasPlaylist;
    if (importNewBtn) importNewBtn.disabled = false;
    ITVModal.open('playlist-import');
  }

  async function confirmImport(mode) {
    const text = pendingImportText;
    if (!text) return;
    if (!selectedId) {
      setStatus('Select or create a playlist first', true);
      return;
    }

    const playlistId = selectedId;
    pendingImportText = null;

    try {
      await runImportWithProgress('playlist-import', text, async () => {
        await importTextToPlaylist(playlistId, text, mode);
      });
    } catch (_err) {
      pendingImportText = text;
    }
  }

  function confirmImportNew() {
    if (!pendingImportText || importBusy) return;
    ITVModal.close('playlist-import');
    openCreateModal(true);
  }

  async function setActive() {
    if (!selectedId) return;
    try {
      await api(`/api/playlists/${selectedId}/activate`, { method: 'POST' });
      await refreshList(selectedId);
      setStatus('Active playlist updated');
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  function openRenameModal() {
    if (!selectedId) return;
    const current = playlists.find((p) => p.id === selectedId);
    if (renameNameInput) {
      renameNameInput.value = current?.name || '';
      renameNameInput.focus();
      renameNameInput.select();
    }
    if (renameErrorEl) {
      renameErrorEl.textContent = '';
      renameErrorEl.classList.add('hidden');
    }
    ITVModal.open('playlist-rename');
  }

  async function submitRenamePlaylist(e) {
    e.preventDefault();
    if (!selectedId) return;
    const name = renameNameInput?.value?.trim();
    if (!name) return;

    if (renameErrorEl) renameErrorEl.classList.add('hidden');
    if (renameSubmitBtn) renameSubmitBtn.disabled = true;

    try {
      const data = await api(`/api/playlists/${selectedId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      ITVModal.close('playlist-rename');
      if (renameForm) renameForm.reset();
      const idx = playlists.findIndex((p) => p.id === selectedId);
      if (idx >= 0) playlists[idx] = data.playlist;
      renderSelect();
      updateToolbarButtons();
      setStatus(`Renamed to "${data.playlist.name}"`);
    } catch (err) {
      if (renameErrorEl) {
        renameErrorEl.textContent = err.message;
        renameErrorEl.classList.remove('hidden');
      }
    } finally {
      if (renameSubmitBtn) renameSubmitBtn.disabled = false;
    }
  }

  function openDeleteModal() {
    if (!selectedId) return;
    const current = playlists.find((p) => p.id === selectedId);
    if (deleteNameEl) deleteNameEl.textContent = current?.name || 'this playlist';
    ITVModal.open('playlist-delete');
  }

  async function confirmDeletePlaylist() {
    if (!selectedId) return;
    const deletedName = playlists.find((p) => p.id === selectedId)?.name || 'Playlist';
    const playlistId = selectedId;

    if (deleteConfirmBtn) deleteConfirmBtn.disabled = true;
    try {
      await api(`/api/playlists/${playlistId}`, { method: 'DELETE' });
      ITVModal.close('playlist-delete');
      await refreshList();
      setStatus(`Deleted "${deletedName}"`);
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      if (deleteConfirmBtn) deleteConfirmBtn.disabled = false;
    }
  }

  async function addTrack(url) {
    if (!selectedId) {
      setStatus('Create a playlist first', true);
      return;
    }
    try {
      btnAdd.disabled = true;
      const data = await api(`/api/playlists/${selectedId}/items`, {
        method: 'POST',
        body: JSON.stringify({ url }),
      });
      items.push(data.item);
      renderItems();
      setStatus(`Added "${data.item.title}"`);
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      btnAdd.disabled = !enabled;
    }
  }

  async function exportPlaylist() {
    if (!selectedId) return;
    try {
      const res = await api(`/api/playlists/${selectedId}/export`, { raw: true });
      const blob = await res.blob();
      const pl = playlists.find((p) => p.id === selectedId);
      const name = (pl?.name || 'playlist').replace(/[^\w\-]+/g, '_');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${name}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus('Playlist exported');
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  async function importTextToPlaylist(playlistId, text, mode) {
    if (!playlistId) {
      setStatus('Create a playlist first', true);
      return;
    }
    try {
      const data = await api(`/api/playlists/${playlistId}/import`, {
        method: 'POST',
        body: JSON.stringify({ text, mode }),
      });
      if (playlistId === selectedId) {
        items = data.items || [];
        renderItems();
      }
      const skipped = data.skipped ? ` (${data.skipped} line(s) skipped)` : '';
      const label = mode === 'replace' ? 'Imported' : 'Added';
      setStatus(`${label} ${data.imported} track(s)${skipped}`);
      return data;
    } catch (err) {
      setStatus(err.message, true);
      throw err;
    }
  }

  function bindEvents() {
    selectEl?.addEventListener('change', async () => {
      selectedId = selectEl.value || null;
      updateToolbarButtons();
      try {
        await loadPlaylist(selectedId);
        setStatus('');
      } catch (err) {
        setStatus(err.message, true);
      }
    });

    btnNew?.addEventListener('click', () => openCreateModal(false));
    btnActive?.addEventListener('click', setActive);
    btnRename?.addEventListener('click', openRenameModal);
    renameForm?.addEventListener('submit', submitRenamePlaylist);
    btnDelete?.addEventListener('click', openDeleteModal);
    deleteCancelBtn?.addEventListener('click', () => ITVModal.close('playlist-delete'));
    deleteConfirmBtn?.addEventListener('click', confirmDeletePlaylist);
    newForm?.addEventListener('submit', submitCreatePlaylist);
    importOverwriteBtn?.addEventListener('click', () => confirmImport('replace'));
    importAppendBtn?.addEventListener('click', () => confirmImport('append'));
    importNewBtn?.addEventListener('click', confirmImportNew);

    formEl?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = urlInput?.value?.trim();
      if (!url) return;
      await addTrack(url);
      if (urlInput) urlInput.value = '';
    });

    btnExport?.addEventListener('click', exportPlaylist);

    btnImport?.addEventListener('click', () => {
      importFile?.click();
    });

    importFile?.addEventListener('change', async () => {
      const file = importFile.files?.[0];
      if (!file) return;
      const text = await file.text();
      importFile.value = '';
      openImportModal(text);
    });

    [importModalEl, createModalEl].forEach((modalEl) => {
      modalEl?.addEventListener(
        'click',
        (e) => {
          if (importBusy && e.target === modalEl) {
            e.stopImmediatePropagation();
            e.preventDefault();
          }
        },
        true
      );
    });

    const importModal = importModalEl;
    importModal?.querySelector('[data-modal-close]')?.addEventListener('click', () => {
      if (importBusy) return;
      pendingImportText = null;
    });
    importModal?.addEventListener('click', (e) => {
      if (importBusy) return;
      if (e.target === importModal) pendingImportText = null;
    });

    const createModal = createModalEl;
    createModal?.querySelector('[data-modal-close]')?.addEventListener('click', () => {
      if (importBusy) return;
      if (createForImport) {
        pendingImportText = null;
        resetCreateModal();
      }
    });
    createModal?.addEventListener('click', (e) => {
      if (importBusy) return;
      if (e.target === createModal && createForImport) {
        pendingImportText = null;
        resetCreateModal();
      }
    });
  }

  async function refreshAfterRip(playlistId) {
    if (!enabled || !playlistId) return;
    if (String(playlistId) === String(selectedId)) {
      await loadPlaylist(selectedId);
    } else {
      await refreshList(selectedId);
    }
  }

  bindEvents();

  return { onUserReady, setGuestMode, refreshList, refreshAfterRip, updateFromRoomState };
})();
