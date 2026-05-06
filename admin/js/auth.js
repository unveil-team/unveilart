const API_BASE = (() => {
  if (typeof window === 'undefined') return 'http://localhost:3000/api';
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000/api';
  }
  return 'https://api.unveilart.com.au/api'; // update after deployment
})();

function getToken() {
  return localStorage.getItem('ua_admin_token');
}

function setToken(token) {
  localStorage.setItem('ua_admin_token', token);
}

function clearToken() {
  localStorage.removeItem('ua_admin_token');
}

function requireLogin() {
  if (!getToken()) {
    window.location.href = '/admin/login.html';
  }
}

function logout() {
  clearToken();
  window.location.href = '/admin/login.html';
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/admin/login.html';
    throw new Error('Session expired');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
