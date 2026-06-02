/**
 * ITVLive v2 — overlay modals (login, about, admin) without leaving Main Stage.
 */
const ITVModal = (() => {
  const modals = new Map();
  let initialized = false;

  function register(el) {
    const id = el.dataset.modalId;
    if (id) modals.set(id, el);
  }

  function open(id) {
    const el = modals.get(id);
    if (!el) return false;
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
    const focusable = el.querySelector(
      'input:not([disabled]), button:not(.modal-close), [href], textarea'
    );
    if (focusable) focusable.focus();
    return true;
  }

  function close(id) {
    const el = modals.get(id);
    if (!el) return;
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
  }

  function closeAll() {
    modals.forEach((_el, id) => close(id));
  }

  function isOpen(id) {
    const el = modals.get(id);
    return el && !el.classList.contains('hidden');
  }

  function init() {
    if (initialized) return;
    initialized = true;

    document.querySelectorAll('.modal[data-modal-id]').forEach((modal) => {
      register(modal);
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');

      modal.addEventListener('click', (e) => {
        if (e.target === modal) close(modal.dataset.modalId);
      });

      modal.querySelectorAll('[data-modal-close]').forEach((btn) => {
        btn.addEventListener('click', () => close(modal.dataset.modalId));
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAll();
    });

    document.querySelectorAll('[data-open-modal]').forEach((trigger) => {
      trigger.addEventListener('click', (e) => {
        const id = trigger.getAttribute('data-open-modal');
        if (!id) return;
        if (trigger.tagName === 'A') e.preventDefault();
        open(id);
      });
    });
  }

  return { init, open, close, closeAll, isOpen };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ITVModal.init());
} else {
  ITVModal.init();
}
