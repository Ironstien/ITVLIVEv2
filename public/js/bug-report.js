/**
 * ITVLive v2 — Report Bug modal (all users).
 */
const ITVBugReport = (() => {
  const MODAL_ID = 'bug-report';
  const GUEST_NAME_KEY = 'itv-guest-name';

  let formEl = null;
  let errEl = null;
  let successEl = null;
  let submitBtn = null;
  let onToast = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg, isError) {
    if (typeof onToast === 'function') onToast(msg, isError);
  }

  function getGuestName() {
    const stored = localStorage.getItem(GUEST_NAME_KEY);
    if (stored && stored.trim().length >= 2) return stored.trim().slice(0, 24);
    return null;
  }

  function resetForm() {
    if (!formEl) return;
    formEl.reset();
    if (errEl) {
      errEl.classList.add('hidden');
      errEl.textContent = '';
    }
    if (successEl) successEl.classList.add('hidden');
  }

  function showError(message) {
    if (!errEl) return;
    errEl.textContent = message;
    errEl.classList.remove('hidden');
    if (successEl) successEl.classList.add('hidden');
  }

  function showSuccess() {
    if (successEl) successEl.classList.remove('hidden');
    if (errEl) errEl.classList.add('hidden');
  }

  async function submitReport(event) {
    event.preventDefault();
    if (!formEl) return;

    const description = formEl.querySelector('#bug-report-description')?.value?.trim();
    const steps = formEl.querySelector('#bug-report-steps')?.value?.trim() || '';

    if (!description) {
      showError('Please describe what went wrong.');
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    const headers = { 'Content-Type': 'application/json' };
    if (typeof ITVAuth !== 'undefined') {
      Object.assign(headers, ITVAuth.authHeaders());
    }

    const body = {
      description,
      steps,
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
      guestName: getGuestName(),
    };

    try {
      const res = await fetch('/api/bug-reports', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not send report');
      }
      showSuccess();
      formEl.querySelector('#bug-report-description').value = '';
      formEl.querySelector('#bug-report-steps').value = '';
      toast('Bug report sent — thank you!');
    } catch (err) {
      showError(err.message || 'Could not send report');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function bindEvents() {
    formEl = document.getElementById('bug-report-form');
    errEl = document.getElementById('bug-report-error');
    successEl = document.getElementById('bug-report-success');
    submitBtn = document.getElementById('bug-report-submit');

    formEl?.addEventListener('submit', submitReport);

    document.querySelector(`[data-modal-id="${MODAL_ID}"]`)?.addEventListener('click', (e) => {
      if (e.target.matches('[data-modal-close]') || e.target === e.currentTarget) {
        resetForm();
      }
    });

    document.querySelectorAll('[data-open-modal="bug-report"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        resetForm();
      });
    });
  }

  function init(options = {}) {
    onToast = options.onToast || null;
    bindEvents();
  }

  return { init, MODAL_ID };
})();
