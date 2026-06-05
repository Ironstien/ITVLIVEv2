/**
 * ITVLive v2 — badge catalog + grid renderer (My Data & user profile only).
 */
const ITVBadges = (() => {
  let catalog = null;
  let catalogPromise = null;
  let nameById = null;
  let nameMapPromise = null;
  let _nameMapLoaded = false;

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function loadCatalog() {
    if (catalog) return catalog;
    if (catalogPromise) return catalogPromise;

    catalogPromise = fetch('/api/badges/catalog')
      .then((res) => {
        if (!res.ok) throw new Error('Could not load badges');
        return res.json();
      })
      .then((data) => {
        catalog = Array.isArray(data.badges) ? data.badges : [];
        return catalog;
      })
      .catch(() => {
        catalog = [];
        return catalog;
      });

    return catalogPromise;
  }

  function setCatalog(badges) {
    catalog = Array.isArray(badges) ? badges : [];
    nameById = Object.fromEntries(catalog.map((b) => [b.id, b.name]));
    _nameMapLoaded = true;
  }

  async function loadNameMap() {
    if (nameById) return nameById;
    if (nameMapPromise) return nameMapPromise;

    nameMapPromise = fetch('/api/badges/catalog')
      .then((res) => (res.ok ? res.json() : { badges: [] }))
      .then((data) => {
        const badges = Array.isArray(data.badges) ? data.badges : [];
        nameById = Object.fromEntries(badges.map((b) => [b.id, b.name]));
        _nameMapLoaded = true;
        return nameById;
      })
      .catch(() => {
        nameById = {};
        _nameMapLoaded = true;
        return nameById;
      });

    return nameMapPromise;
  }

  function getDisplayName(id) {
    if (nameById?.[id]) return nameById[id];
    const fromCat = catalog?.find((b) => b.id === id);
    return fromCat?.name || null;
  }

  function resolveFromDetails(badgeDetails) {
    if (!Array.isArray(badgeDetails)) return [];
    return badgeDetails.map((b) => ({
      id: b.id,
      name: b.name || b.id,
      tier: b.tier ?? 0,
      image: b.image || null,
      description: b.description || '',
      earned: true,
    }));
  }

  function mergeEarnedWithCatalog(earnedIds, allBadges, { showLocked = false } = {}) {
    const earnedSet = new Set(Array.isArray(earnedIds) ? earnedIds : []);
    const byId = new Map((allBadges || []).map((b) => [b.id, b]));

    if (!showLocked) {
      return [...earnedSet]
        .map((id) => {
          const def = byId.get(id);
          return {
            id,
            name: def?.name || id,
            tier: def?.tier ?? 0,
            image: def?.image || `/img/badges/${id}.png`,
            description: def?.description || '',
            earned: true,
          };
        })
        .sort((a, b) => (a.tier || 0) - (b.tier || 0) || a.name.localeCompare(b.name));
    }

    return (allBadges || [])
      .map((def) => ({
        id: def.id,
        name: def.name,
        tier: def.tier ?? 0,
        image: def.image || `/img/badges/${def.id}.png`,
        description: def.description || '',
        earned: earnedSet.has(def.id),
      }))
      .sort((a, b) => (a.tier || 0) - (b.tier || 0) || a.name.localeCompare(b.name));
  }

  /**
   * @param {string[]|object[]} badgeIdsOrDetails
   * @param {{ showLocked?: boolean, emptyMessage?: string }} options
   */
  let previewEl = null;
  let previewAnchor = null;
  const unlockQueue = [];
  let unlockShowing = false;
  const celebratedBadgeIds = new Set();
  let badgeEarnedModalObserver = null;

  function ensureBadgeEarnedModalObserver() {
    if (badgeEarnedModalObserver) return;
    const modal = document.querySelector('.modal[data-modal-id="badge-earned"]');
    if (!modal) return;
    badgeEarnedModalObserver = new MutationObserver(() => {
      if (!modal.classList.contains('hidden') || !unlockShowing) return;
      unlockShowing = false;
      if (unlockQueue.length) {
        requestAnimationFrame(() => showNextUnlockModal());
      }
    });
    badgeEarnedModalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  function ensurePreviewEl() {
    if (previewEl) return previewEl;

    if (!window.__itvBadgePreviewListeners) {
      window.__itvBadgePreviewListeners = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hidePreview();
      });
      window.addEventListener('scroll', hidePreview, true);
    }

    previewEl = document.createElement('div');
    previewEl.id = 'badge-preview';
    previewEl.className = 'badge-preview';
    previewEl.setAttribute('role', 'tooltip');
    previewEl.setAttribute('aria-hidden', 'true');
    previewEl.innerHTML = `
      <img class="badge-preview__img" alt="" width="120" height="120" />
      <p class="badge-preview__name"></p>
      <p class="badge-preview__unlock"></p>
    `;
    document.body.appendChild(previewEl);
    return previewEl;
  }

  function hidePreview() {
    if (!previewEl) return;
    previewEl.classList.remove('badge-preview--visible');
    previewEl.setAttribute('aria-hidden', 'true');
    previewAnchor = null;
  }

  function positionPreview(anchor) {
    if (!previewEl || !anchor) return;

    previewEl.classList.add('badge-preview--visible');
    previewEl.setAttribute('aria-hidden', 'false');

    const gap = 10;
    const anchorRect = anchor.getBoundingClientRect();
    const previewRect = previewEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = anchorRect.left + anchorRect.width / 2 - previewRect.width / 2;
    let top = anchorRect.top - previewRect.height - gap;

    if (top < 8) {
      top = anchorRect.bottom + gap;
    }
    if (left < 8) left = 8;
    if (left + previewRect.width > vw - 8) {
      left = Math.max(8, vw - previewRect.width - 8);
    }
    if (top + previewRect.height > vh - 8) {
      top = Math.max(8, vh - previewRect.height - 8);
    }

    previewEl.style.left = `${Math.round(left)}px`;
    previewEl.style.top = `${Math.round(top)}px`;
  }

  function showPreview(anchor) {
    const name = anchor.dataset.badgeName || '';
    const desc = anchor.dataset.badgeDesc || '';
    const image = anchor.dataset.badgeImage || '';

    const el = ensurePreviewEl();
    previewAnchor = anchor;

    const img = el.querySelector('.badge-preview__img');
    const nameEl = el.querySelector('.badge-preview__name');
    const unlockEl = el.querySelector('.badge-preview__unlock');

    if (img) {
      img.src = image;
      img.alt = name;
    }
    if (nameEl) nameEl.textContent = name;
    if (unlockEl) unlockEl.textContent = desc || 'Achievement unlocked';

    el.classList.add('badge-preview--visible');
    el.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => positionPreview(anchor));
  }

  /**
   * Wire hover/focus preview for earned badges inside a grid container.
   * @param {HTMLElement|null} root
   */
  function bindBadgePreviews(root) {
    if (!root) return;

    hidePreview();

    const earned = root.querySelectorAll('.badge-grid__item--earned');
    earned.forEach((item) => {
      if (item.dataset.badgePreviewBound === '1') return;
      item.dataset.badgePreviewBound = '1';

      item.addEventListener('mouseenter', () => showPreview(item));
      item.addEventListener('focus', () => showPreview(item));
      item.addEventListener('mouseleave', hidePreview);
      item.addEventListener('blur', hidePreview);
    });

    if (!root.dataset.badgePreviewScrollBound) {
      root.dataset.badgePreviewScrollBound = '1';
      root.addEventListener('scroll', hidePreview, { passive: true });
    }
  }

  function resolveUnlockDetail(id, badgeUnlocks) {
    const fromPayload = Array.isArray(badgeUnlocks)
      ? badgeUnlocks.find((b) => b.id === id)
      : null;
    if (fromPayload) {
      return {
        id: fromPayload.id,
        name: fromPayload.name || id,
        image: fromPayload.image || `/img/badges/${id}.png`,
        description: fromPayload.description || '',
      };
    }
    const fromCat = catalog?.find((b) => b.id === id);
    return {
      id,
      name: fromCat?.name || getDisplayName(id) || String(id).replace(/_/g, ' '),
      image: fromCat?.image || `/img/badges/${id}.png`,
      description: fromCat?.description || '',
    };
  }

  function fillUnlockModal(detail) {
    const img = document.getElementById('badge-earned-img');
    const nameEl = document.getElementById('badge-earned-name');
    const howEl = document.getElementById('badge-earned-how');
    if (img) {
      img.src = detail.image || '';
      img.alt = detail.name || 'Badge';
    }
    if (nameEl) nameEl.textContent = detail.name || '';
    if (howEl) howEl.textContent = detail.description || 'Achievement unlocked';
  }

  function showNextUnlockModal() {
    if (unlockShowing || !unlockQueue.length) return;
    if (typeof ITVModal === 'undefined' || !ITVModal.open) {
      unlockQueue.length = 0;
      return;
    }

    const detail = unlockQueue.shift();
    unlockShowing = true;
    hidePreview();
    fillUnlockModal(detail);
    ensureBadgeEarnedModalObserver();
    ITVModal.open('badge-earned');
  }

  /**
   * Queue celebration modals for newly earned badges (logged-in user only).
   * @param {string[]} newBadgeIds
   * @param {object[]} [badgeUnlocks]
   */
  async function celebrateUnlocks(newBadgeIds, badgeUnlocks) {
    const ids = Array.isArray(newBadgeIds) ? newBadgeIds : [];
    if (!ids.length) return;

    if (typeof ITVAppPrefs !== 'undefined' && !ITVAppPrefs.shouldShowBadgeToasts()) {
      ids.forEach((id) => {
        if (id) celebratedBadgeIds.add(id);
      });
      return;
    }

    const fresh = ids.filter((id) => id && !celebratedBadgeIds.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => celebratedBadgeIds.add(id));

    if (!catalog && typeof loadCatalog === 'function') {
      await loadCatalog().catch(() => {});
    }

    for (const id of fresh) {
      unlockQueue.push(resolveUnlockDetail(id, badgeUnlocks));
    }
    showNextUnlockModal();
  }

  async function renderBadgeGrid(badgeIdsOrDetails, options = {}) {
    const { showLocked = false, emptyMessage = 'No badges earned yet.' } = options;

    let items;
    if (
      badgeIdsOrDetails?.length &&
      typeof badgeIdsOrDetails[0] === 'object' &&
      badgeIdsOrDetails[0].name
    ) {
      items = resolveFromDetails(badgeIdsOrDetails);
    } else {
      const all = await loadCatalog();
      items = mergeEarnedWithCatalog(badgeIdsOrDetails, all, { showLocked });
      if (!showLocked) {
        items = items.filter((b) => b.earned);
      }
    }

    if (!items.length) {
      return `<p class="badge-grid-empty muted">${escapeHtml(emptyMessage)}</p>`;
    }

    const cells = items
      .map((b) => {
        const locked = !b.earned;
        const img = b.image
          ? `<img class="badge-icon__img" src="${escapeHtml(b.image)}" alt="" width="32" height="32" loading="lazy" />`
          : `<span class="badge-icon__fallback" aria-hidden="true">◇</span>`;

        if (locked) {
          const title = b.description ? `${b.name} — ${b.description}` : b.name;
          return `
          <li class="badge-grid__item badge-grid__item--locked" title="${escapeHtml(title)}">
            <span class="badge-icon badge-icon--tier-${b.tier || 0}">${img}</span>
            <span class="badge-grid__label">${escapeHtml(b.name)}</span>
          </li>`;
        }

        return `
          <li class="badge-grid__item badge-grid__item--earned"
            tabindex="0"
            data-badge-name="${escapeHtml(b.name)}"
            data-badge-desc="${escapeHtml(b.description || '')}"
            data-badge-image="${escapeHtml(b.image || '')}"
            aria-label="${escapeHtml(b.name)}: ${escapeHtml(b.description || 'Unlocked')}">
            <span class="badge-icon badge-icon--tier-${b.tier || 0}">${img}</span>
            <span class="badge-grid__label">${escapeHtml(b.name)}</span>
          </li>`;
      })
      .join('');

    return `<ul class="badge-grid" role="list">${cells}</ul>`;
  }

  function clearCelebrationCache() {
    celebratedBadgeIds.clear();
    unlockQueue.length = 0;
    unlockShowing = false;
  }

  return {
    loadCatalog,
    loadNameMap,
    setCatalog,
    getDisplayName,
    renderBadgeGrid,
    bindBadgePreviews,
    hideBadgePreview: hidePreview,
    celebrateUnlocks,
    clearCelebrationCache,
    mergeEarnedWithCatalog,
    resolveFromDetails,
    escapeHtml,
    get _nameMapLoaded() {
      return _nameMapLoaded;
    },
  };
})();
