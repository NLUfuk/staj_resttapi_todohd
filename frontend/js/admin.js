const user = requireRole('admin');
if (user) {
  document.getElementById('whoami').textContent = `${user.username} (${user.role})`;
}
document.getElementById('logoutBtn').addEventListener('click', logout);

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
const tabs = {
  users: { btn: document.getElementById('tabUsers'), panel: document.getElementById('panelUsers'), load: loadUsers },
  todos: { btn: document.getElementById('tabTodos'), panel: document.getElementById('panelTodos'), load: loadAdminTodos },
  tickets: { btn: document.getElementById('tabTickets'), panel: document.getElementById('panelTickets'), load: loadAdminTickets },
};

function activateTab(name) {
  Object.entries(tabs).forEach(([key, t]) => {
    t.btn.classList.toggle('active', key === name);
    t.panel.classList.toggle('hidden', key !== name);
  });
  tabs[name].load();
}

Object.entries(tabs).forEach(([key, t]) => t.btn.addEventListener('click', () => activateTab(key)));

// ---- Users ----
const usersError = document.getElementById('usersError');

async function loadUsers() {
  clearError(usersError);
  try {
    const users = await api('/admin/users');
    const tbody = document.getElementById('usersList');
    tbody.innerHTML = users
      .map(
        (u) => `
      <tr>
        <td>${u.id}</td>
        <td>${escapeHtml(u.username)}</td>
        <td><span class="badge ${u.role}">${u.role}</span></td>
        <td class="muted">${escapeHtml(u.created_at)}</td>
        <td class="row-actions">
          <button class="secondary" data-action="toggleRole" data-id="${u.id}" data-role="${u.role}">
            ${u.role === 'user' ? 'Admin yap' : 'Kullanıcı yap'}
          </button>
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
  try {
    if (btn.dataset.action === 'delete') {
      if (!confirm('Bu kullanıcı silinsin mi?')) return;
      await api(`/admin/users/${id}`, { method: 'DELETE' });
    } else if (btn.dataset.action === 'toggleRole') {
      const newRole = btn.dataset.role === 'user' ? 'admin' : 'user';
      await api(`/admin/users/${id}`, { method: 'PATCH', body: { role: newRole } });
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

// ---- Tickets (helpdesk queue) ----
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
        <td><button class="danger" data-action="delete" data-id="${t.id}">Sil</button></td>
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

if (user) {
  loadUsers();
}
