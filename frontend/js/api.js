const API_BASE = 'http://localhost:3000/api';

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

function requireRole(role, redirectTo = 'dashboard.html') {
  const user = requireAuth();
  if (user && user.role !== role) {
    window.location.href = redirectTo;
    return null;
  }
  return user;
}

function logout() {
  clearSession();
  window.location.href = 'index.html';
}
