// Supabase Edge Functions base URL
const SUPABASE_URL = 'https://frgxtqljqliaafpxgloo.supabase.co';
const FN_BASE = SUPABASE_URL + '/functions/v1';

function getToken() { return localStorage.getItem('ua_admin_token'); }
function setToken(t) { localStorage.setItem('ua_admin_token', t); }
function clearToken() { localStorage.removeItem('ua_admin_token'); }

function requireLogin() {
  if (!getToken()) window.location.href = '/admin/login.html';
}

function logout() {
  clearToken();
  window.location.href = '/admin/login.html';
}

async function fnFetch(fnName, options = {}) {
  const token = getToken();
  const url = FN_BASE + '/' + fnName;

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'sb_publishable_b5qRYxgOCwMUayJdC-flCw_GEnoL2Ue',
      ...(token ? { 'x-admin-token': token } : {}),
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

// Login function used by login.html
async function adminLogin(password) {
  const res = await fetch(FN_BASE + '/admin-auth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'sb_publishable_b5qRYxgOCwMUayJdC-flCw_GEnoL2Ue',
    },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data.token;
}
