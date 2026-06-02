/**
 * ITVLive v2 — client auth helpers (token storage + REST).
 */
const ITVAuth = (() => {
  const TOKEN_KEY = 'itv-auth-token';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, String(token));
    else localStorage.removeItem(TOKEN_KEY);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function authHeaders() {
    const token = getToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(options.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText || 'Request failed');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function fetchMe() {
    const token = getToken();
    if (!token) return null;
    try {
      const data = await api('/api/auth/me');
      return data.user || null;
    } catch (err) {
      if (err.status === 401) clearToken();
      return null;
    }
  }

  async function register({ email, username, password }) {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    });
    if (data.token) setToken(data.token);
    return data;
  }

  async function login({ email, password }) {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.token) setToken(data.token);
    return data;
  }

  function logout() {
    clearToken();
  }

  function socketAuthPayload() {
    const token = getToken();
    return token ? { token } : {};
  }

  return {
    TOKEN_KEY,
    getToken,
    setToken,
    clearToken,
    authHeaders,
    api,
    fetchMe,
    register,
    login,
    logout,
    socketAuthPayload,
  };
})();
