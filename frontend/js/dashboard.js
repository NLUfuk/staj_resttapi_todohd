const user = requireAuth();
if (user) {
  document.getElementById('whoami').textContent = `${user.username} (${user.role})`;
}
document.getElementById('logoutBtn').addEventListener('click', logout);

const todoError = document.getElementById('todoError');
const ticketError = document.getElementById('ticketError');

function showError(el, message) {
  el.textContent = message;
  el.classList.remove('hidden');
}
function clearError(el) {
  el.classList.add('hidden');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---- Todos ----

async function loadTodos() {
  clearError(todoError);
  try {
    const todos = await api('/todos');
    renderTodos(todos);
    populateTodoSelect(todos);
  } catch (err) {
    showError(todoError, err.message);
  }
}

function renderTodos(todos) {
  const tbody = document.getElementById('todoList');
  if (todos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Henüz todo yok.</td></tr>';
    return;
  }
  tbody.innerHTML = todos
    .map(
      (t) => `
    <tr>
      <td>${escapeHtml(t.title)}</td>
      <td>${escapeHtml(t.description) || '<span class="muted">-</span>'}</td>
      <td><span class="badge ${t.status}">${t.status}</span></td>
      <td class="row-actions">
        <button class="secondary" data-action="toggle" data-id="${t.id}" data-status="${t.status}">
          ${t.status === 'pending' ? 'Tamamla' : 'Beklemeye al'}
        </button>
        <button class="secondary" data-action="edit" data-id="${t.id}">Düzenle</button>
        <button class="danger" data-action="delete" data-id="${t.id}">Sil</button>
      </td>
    </tr>`
    )
    .join('');
}

function populateTodoSelect(todos) {
  const select = document.getElementById('ticketTodoId');
  const current = select.value;
  select.innerHTML = '<option value="">(Todo\'ya bağlama)</option>';
  todos.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.title;
    select.appendChild(opt);
  });
  select.value = current;
}

document.getElementById('todoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError(todoError);
  const title = document.getElementById('todoTitle').value.trim();
  const description = document.getElementById('todoDescription').value.trim();
  try {
    await api('/todos', { method: 'POST', body: { title, description: description || null } });
    document.getElementById('todoForm').reset();
    await loadTodos();
  } catch (err) {
    showError(todoError, err.message);
  }
});

document.getElementById('todoList').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;

  try {
    if (action === 'delete') {
      if (!confirm('Bu todo silinsin mi?')) return;
      await api(`/todos/${id}`, { method: 'DELETE' });
    } else if (action === 'toggle') {
      const newStatus = btn.dataset.status === 'pending' ? 'done' : 'pending';
      await api(`/todos/${id}`, { method: 'PUT', body: { status: newStatus } });
    } else if (action === 'edit') {
      const newTitle = prompt('Yeni başlık:');
      if (newTitle === null || newTitle.trim() === '') return;
      await api(`/todos/${id}`, { method: 'PUT', body: { title: newTitle.trim() } });
    }
    await loadTodos();
  } catch (err) {
    showError(todoError, err.message);
  }
});

// ---- Tickets ----

async function loadTickets() {
  clearError(ticketError);
  try {
    const tickets = await api('/tickets');
    renderTickets(tickets);
  } catch (err) {
    showError(ticketError, err.message);
  }
}

function renderTickets(tickets) {
  const tbody = document.getElementById('ticketList');
  if (tickets.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Henüz talep yok.</td></tr>';
    return;
  }
  tbody.innerHTML = tickets
    .map(
      (t) => `
    <tr>
      <td>${escapeHtml(t.subject)}</td>
      <td>${escapeHtml(t.message)}</td>
      <td><span class="badge ${t.status}">${t.status}</span></td>
      <td>${escapeHtml(t.admin_response) || '<span class="muted">-</span>'}</td>
      <td class="row-actions">
        ${
          t.status === 'open'
            ? `<button class="secondary" data-action="edit" data-id="${t.id}">Düzenle</button>`
            : ''
        }
        <button class="danger" data-action="delete" data-id="${t.id}">Sil</button>
      </td>
    </tr>`
    )
    .join('');
}

document.getElementById('ticketForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError(ticketError);
  const subject = document.getElementById('ticketSubject').value.trim();
  const message = document.getElementById('ticketMessage').value.trim();
  const todoIdRaw = document.getElementById('ticketTodoId').value;

  try {
    await api('/tickets', {
      method: 'POST',
      body: { subject, message, todo_id: todoIdRaw ? Number(todoIdRaw) : null },
    });
    document.getElementById('ticketForm').reset();
    await loadTickets();
  } catch (err) {
    showError(ticketError, err.message);
  }
});

document.getElementById('ticketList').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;

  try {
    if (action === 'delete') {
      if (!confirm('Bu talep silinsin mi?')) return;
      await api(`/tickets/${id}`, { method: 'DELETE' });
    } else if (action === 'edit') {
      const newMessage = prompt('Yeni mesaj:');
      if (newMessage === null || newMessage.trim() === '') return;
      await api(`/tickets/${id}`, { method: 'PUT', body: { message: newMessage.trim() } });
    }
    await loadTickets();
  } catch (err) {
    showError(ticketError, err.message);
  }
});

if (user) {
  loadTodos();
  loadTickets();
}
