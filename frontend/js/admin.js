const user = requireAnyRole(['admin', 'dept_lead']);
if (user) {
  document.getElementById('whoami').textContent = user.username;
  if (user.role === 'dept_lead') {
    document.getElementById('roleBadge').innerHTML = '<span class="badge dept_lead">Departman Yöneticisi</span>';
  }
  loadMyDepartment();
}
document.getElementById('logoutBtn').addEventListener('click', logout);

const VALID_ROLES = ['user', 'dept_lead', 'admin'];

// JWT payload doesn't carry department_id, so it's resolved from /auth/me
// once on load and appended to the header (mainly useful for dept_lead, to
// confirm which department's queue they're scoped to).
async function loadMyDepartment() {
  try {
    const [me, departments] = await Promise.all([api('/auth/me'), api('/departments')]);
    const dept = departments.find((d) => d.id === me.department_id);
    if (dept) {
      document.getElementById('whoami').textContent = `${user.username} · ${dept.name}`;
    }
  } catch {
    // non-critical - header just keeps showing username/role without the department suffix
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
function showError(el, message) {
  el.textContent = message;
  el.classList.remove('hidden');
}
function clearError(el) {
  el.classList.add('hidden');
}

// ---- Tabs ----
// dept_lead only manages their own department's helpdesk queue - the
// backend already blocks them from /admin/users, /admin/todos and
// /api/departments writes, so those tabs are hidden rather than shown and 403ing.
const tabs = {
  users: { btn: document.getElementById('tabUsers'), panel: document.getElementById('panelUsers'), load: loadUsers, adminOnly: true },
  todos: { btn: document.getElementById('tabTodos'), panel: document.getElementById('panelTodos'), load: loadAdminTodos, adminOnly: true },
  departments: { btn: document.getElementById('tabDepartments'), panel: document.getElementById('panelDepartments'), load: loadDepartments, adminOnly: true },
  tickets: { btn: document.getElementById('tabTickets'), panel: document.getElementById('panelTickets'), load: loadAdminTickets, adminOnly: false },
};

function activateTab(name) {
  Object.entries(tabs).forEach(([key, t]) => {
    t.btn.classList.toggle('active', key === name);
    t.panel.classList.toggle('hidden', key !== name);
  });
  tabs[name].load();
}

Object.entries(tabs).forEach(([key, t]) => t.btn.addEventListener('click', () => activateTab(key)));

if (user && user.role === 'dept_lead') {
  Object.values(tabs)
    .filter((t) => t.adminOnly)
    .forEach((t) => t.btn.classList.add('hidden'));
}

// ---- Departments (shared cache: users table needs it for the department picker) ----
let departmentsCache = [];

async function fetchDepartments() {
  departmentsCache = await api('/departments');
  return departmentsCache;
}

const departmentsError = document.getElementById('departmentsError');

async function loadDepartments() {
  clearError(departmentsError);
  try {
    await fetchDepartments();
    const tbody = document.getElementById('departmentsList');
    tbody.innerHTML = departmentsCache
      .map(
        (d) => `
      <tr>
        <td>${escapeHtml(d.name)}</td>
        <td class="muted">${escapeHtml(d.slug)}</td>
        <td class="row-actions">
          <button class="secondary" data-action="rename" data-id="${d.id}" data-name="${escapeHtml(d.name)}">Yeniden adlandır</button>
          <button class="danger" data-action="delete" data-id="${d.id}">Sil</button>
        </td>
      </tr>`
      )
      .join('');
  } catch (err) {
    showError(departmentsError, err.message);
  }
}

document.getElementById('departmentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError(departmentsError);
  const input = document.getElementById('departmentName');
  const name = input.value.trim();
  if (!name) return;
  try {
    await api('/departments', { method: 'POST', body: { name } });
    input.value = '';
    await loadDepartments();
  } catch (err) {
    showError(departmentsError, err.message);
  }
});

document.getElementById('departmentsList').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  try {
    if (btn.dataset.action === 'delete') {
      if (!confirm('Bu departman silinsin mi? (üyesi veya talebi varsa reddedilir)')) return;
      await api(`/departments/${id}`, { method: 'DELETE' });
    } else if (btn.dataset.action === 'rename') {
      const newName = prompt('Yeni departman adı:', btn.dataset.name);
      if (newName === null || newName.trim() === '') return;
      await api(`/departments/${id}`, { method: 'PATCH', body: { name: newName.trim() } });
    }
    await loadDepartments();
  } catch (err) {
    showError(departmentsError, err.message);
  }
});

// ---- Users ----
const usersError = document.getElementById('usersError');

async function loadUsers() {
  clearError(usersError);
  try {
    const [users] = await Promise.all([api('/admin/users'), fetchDepartments()]);
    const tbody = document.getElementById('usersList');
    tbody.innerHTML = users
      .map(
        (u) => `
      <tr>
        <td>${u.id}</td>
        <td>${escapeHtml(u.username)}</td>
        <td>
          <select data-role-select data-id="${u.id}">
            ${VALID_ROLES.map((r) => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </td>
        <td>
          <select data-dept-select data-id="${u.id}">
            ${departmentsCache.map((d) => `<option value="${d.id}" ${d.id === u.department_id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
          </select>
        </td>
        <td class="muted">${escapeHtml(u.created_at)}</td>
        <td class="row-actions">
          <button class="secondary" data-action="save" data-id="${u.id}">Kaydet</button>
          <button class="danger" data-action="delete" data-id="${u.id}" ${u.id === user.id ? 'disabled' : ''}>Sil</button>
        </td>
      </tr>`
      )
      .join('');
  } catch (err) {
    showError(usersError, err.message);
  }
}

document.getElementById('usersList').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  const row = btn.closest('tr');
  try {
    if (btn.dataset.action === 'delete') {
      if (!confirm('Bu kullanıcı silinsin mi?')) return;
      await api(`/admin/users/${id}`, { method: 'DELETE' });
    } else if (btn.dataset.action === 'save') {
      const role = row.querySelector('[data-role-select]').value;
      const department_id = Number(row.querySelector('[data-dept-select]').value);
      await api(`/admin/users/${id}`, { method: 'PATCH', body: { role, department_id } });
    }
    await loadUsers();
  } catch (err) {
    showError(usersError, err.message);
  }
});

// ---- Todos (oversight) ----
const todosError = document.getElementById('todosError');

async function loadAdminTodos() {
  clearError(todosError);
  try {
    const todos = await api('/admin/todos');
    const tbody = document.getElementById('adminTodosList');
    if (todos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">Todo yok.</td></tr>';
      return;
    }
    tbody.innerHTML = todos
      .map(
        (t) => `
      <tr>
        <td>${escapeHtml(t.owner_username)}</td>
        <td>${escapeHtml(t.title)}</td>
        <td>${escapeHtml(t.description) || '<span class="muted">-</span>'}</td>
        <td><span class="badge ${t.status}">${t.status}</span></td>
        <td><button class="danger" data-id="${t.id}">Sil</button></td>
      </tr>`
      )
      .join('');
  } catch (err) {
    showError(todosError, err.message);
  }
}

document.getElementById('adminTodosList').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  try {
    if (!confirm('Bu todo silinsin mi?')) return;
    await api(`/admin/todos/${btn.dataset.id}`, { method: 'DELETE' });
    await loadAdminTodos();
  } catch (err) {
    showError(todosError, err.message);
  }
});

// ---- Tickets (helpdesk queue - admin sees all, dept_lead scoped by backend) ----
const ticketsError = document.getElementById('ticketsError');
const TICKET_STATUSES = ['open', 'in_progress', 'closed'];

async function loadAdminTickets() {
  clearError(ticketsError);
  try {
    const tickets = await api('/admin/tickets');
    const tbody = document.getElementById('adminTicketsList');
    if (tickets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">Talep yok.</td></tr>';
      return;
    }
    tbody.innerHTML = tickets
      .map(
        (t) => `
      <tr>
        <td>${escapeHtml(t.reporter_username)}</td>
        <td>${escapeHtml(t.subject)}</td>
        <td>${escapeHtml(t.message)}</td>
        <td><span class="badge ${t.status}">${t.status}</span></td>
        <td>
          <form class="respond-form" data-id="${t.id}">
            <select name="status">
              ${TICKET_STATUSES.map((s) => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
            <input name="admin_response" placeholder="Yanıt yaz" value="${escapeHtml(t.admin_response)}" />
            <button type="submit">Kaydet</button>
          </form>
        </td>
        <td>${user.role === 'admin' ? `<button class="danger" data-action="delete" data-id="${t.id}">Sil</button>` : ''}</td>
      </tr>`
      )
      .join('');
  } catch (err) {
    showError(ticketsError, err.message);
  }
}

document.getElementById('adminTicketsList').addEventListener('submit', async (e) => {
  if (!e.target.classList.contains('respond-form')) return;
  e.preventDefault();
  const id = e.target.dataset.id;
  const status = e.target.elements.status.value;
  const admin_response = e.target.elements.admin_response.value;
  try {
    await api(`/admin/tickets/${id}`, { method: 'PATCH', body: { status, admin_response } });
    await loadAdminTickets();
  } catch (err) {
    showError(ticketsError, err.message);
  }
});

document.getElementById('adminTicketsList').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action="delete"]');
  if (!btn) return;
  try {
    if (!confirm('Bu talep silinsin mi?')) return;
    await api(`/admin/tickets/${btn.dataset.id}`, { method: 'DELETE' });
    await loadAdminTickets();
  } catch (err) {
    showError(ticketsError, err.message);
  }
});

// Deferred to the end of the file (not run inline where the tabs/role
// checks above happen) because activateTab() synchronously calls the tab's
// load() function, which references consts (e.g. ticketsError) declared
// further down the file - calling it any earlier throws a temporal-dead-zone
// ReferenceError and silently leaves the tab empty (caught nowhere, since
// this file has no top-level try/catch).
if (user && user.role === 'admin') {
  loadUsers();
} else if (user && user.role === 'dept_lead') {
  activateTab('tickets');
}
