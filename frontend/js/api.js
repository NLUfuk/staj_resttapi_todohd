// Local dev keeps frontend/backend on separate origins/ports (see README -
// http-server on :5500, backend on :3000), so that combination needs an
// absolute URL. Any other origin (a deployed Render service, where
// backend/src/app.js serves this frontend itself) is same-origin with the
// API, so a relative path works and needs no per-environment configuration.
const API_BASE = window.location.port === '5500' ? 'http://localhost:3000/api' : '/api';

function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

function setSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

// Thin fetch wrapper: adds JSON headers + bearer token, throws Error(message) on non-2xx.
async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

function requireAuth(redirectTo = 'index.html') {
  if (!getToken()) {
    window.location.href = redirectTo;
    return null;
  }
  return getUser();
}

function requireAnyRole(roles, redirectTo = 'dashboard.html') {
  const user = requireAuth();
  if (user && !roles.includes(user.role)) {
    window.location.href = redirectTo;
    return null;
  }
  return user;
}

function logout() {
  clearSession();
  window.location.href = 'index.html';
}
