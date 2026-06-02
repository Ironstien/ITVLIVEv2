/**
 * ITVLive v2 — badge catalog + grid renderer (My Data & user profile only).
 */
const ITVBadges = (() => {
  let catalog = null;
  let catalogPromise = null;

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
        return `
          <li class="badge-grid__item${locked ? ' badge-grid__item--locked' : ''}" title="${escapeHtml(b.name)}${b.description ? ` — ${escapeHtml(b.description)}` : ''}">
            <span class="badge-icon badge-icon--tier-${b.tier || 0}">${img}</span>
            <span class="badge-grid__label">${escapeHtml(b.name)}</span>
          </li>`;
      })
      .join('');

    return `<ul class="badge-grid" role="list">${cells}</ul>`;
  }

  return {
    loadCatalog,
    setCatalog,
    renderBadgeGrid,
    mergeEarnedWithCatalog,
    resolveFromDetails,
    escapeHtml,
  };
})();
