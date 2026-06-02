/**
 * ITVLive v2 — login/register form inside Main Stage modal.
 */
const ITVAuthUI = (() => {
  let mode = 'login';
  let onSuccess = null;

  function getEls() {
    return {
      form: document.getElementById('auth-form'),
      errEl: document.getElementById('auth-error'),
      usernameWrap: document.getElementById('auth-username-wrap'),
      submitBtn: document.getElementById('auth-submit'),
      passwordInput: document.getElementById('auth-password'),
    };
  }

  function setMode(next) {
    mode = next;
    const { usernameWrap, submitBtn, passwordInput, errEl } = getEls();
    const usernameInput = document.getElementById('auth-username');
    document.querySelectorAll('.auth-tabs [data-auth-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.authMode === mode);
    });
    if (usernameWrap) usernameWrap.classList.toggle('hidden', mode === 'login');
    if (usernameInput) {
      usernameInput.disabled = mode === 'login';
      if (mode === 'login') {
        usernameInput.removeAttribute('required');
        usernameInput.value = '';
      } else {
        usernameInput.disabled = false;
      }
    }
    if (submitBtn) submitBtn.textContent = mode === 'login' ? 'Log in' : 'Create account';
    if (passwordInput) {
      passwordInput.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    }
    if (errEl) {
      errEl.classList.add('hidden');
      errEl.textContent = '';
    }
  }

  function prepareLogin() {
    setMode('login');
    const email = document.getElementById('auth-email');
    if (email) {
      requestAnimationFrame(() => email.focus());
    }
  }

  function resetForm() {
    const { form, errEl } = getEls();
    if (form) form.reset();
    if (errEl) {
      errEl.classList.add('hidden');
      errEl.textContent = '';
    }
    setMode('login');
  }

  function init(options = {}) {
    onSuccess = options.onSuccess || null;
    const { form, submitBtn } = getEls();
    if (!form) return;

    document.querySelectorAll('.auth-tabs [data-auth-mode]').forEach((btn) => {
      btn.addEventListener('click', () => setMode(btn.dataset.authMode));
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { errEl } = getEls();
      if (errEl) errEl.classList.add('hidden');
      if (submitBtn) submitBtn.disabled = true;

      const email = document.getElementById('auth-email')?.value;
      const password = document.getElementById('auth-password')?.value;

      try {
        let data;
        if (mode === 'login') {
          data = await ITVAuth.login({ email, password });
        } else {
          const username = document.getElementById('auth-username')?.value?.trim();
          data = await ITVAuth.register({ email, username, password });
        }
        if (onSuccess) await onSuccess(data.user);
        ITVModal.close('login');
        resetForm();
      } catch (err) {
        if (errEl) {
          errEl.textContent = err.message || 'Something went wrong';
          errEl.classList.remove('hidden');
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    setMode('login');
  }

  return { init, resetForm, setMode, prepareLogin };
})();
