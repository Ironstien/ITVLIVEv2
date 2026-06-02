/**
 * ITVLive v2 — hamburger nav drawer (≤768px).
 */
(function () {
  const MOBILE_MQ = window.matchMedia('(max-width: 768px)');
  const toggle = document.getElementById('site-nav-menu-toggle');
  const drawer = document.getElementById('site-nav-drawer');
  const backdrop = document.getElementById('site-nav-drawer-backdrop');

  if (!toggle || !drawer) return;

  function isMobile() {
    return MOBILE_MQ.matches;
  }

  function setOpen(open) {
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    drawer.classList.toggle('is-open', open);
    if (backdrop) {
      backdrop.classList.toggle('is-open', open);
      backdrop.hidden = !open;
      backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    if (open) {
      const first = drawer.querySelector('.nav-link-btn:not(.hidden), .nav-links a');
      if (first && isMobile()) first.focus();
    }
  }

  function close() {
    setOpen(false);
  }

  function toggleMenu() {
    if (!isMobile()) return;
    setOpen(!drawer.classList.contains('is-open'));
  }

  toggle.addEventListener('click', toggleMenu);

  if (backdrop) {
    backdrop.addEventListener('click', close);
  }

  drawer.querySelectorAll('.nav-link-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (isMobile()) close();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) {
      close();
      toggle.focus();
    }
  });

  function onBreakpointChange() {
    if (!isMobile()) close();
  }

  if (typeof MOBILE_MQ.addEventListener === 'function') {
    MOBILE_MQ.addEventListener('change', onBreakpointChange);
  } else if (typeof MOBILE_MQ.addListener === 'function') {
    MOBILE_MQ.addListener(onBreakpointChange);
  }
})();
