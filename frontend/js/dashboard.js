const user = requireAuth();
if (user) {
  document.getElementById('whoami').textContent = `${user.username} (${user.role})`;
  if (user.role === 'admin' || user.role === 'dept_lead') {
    document.getElementById('adminLink').classList.remove('hidden');
  }
  loadMyDepartment();
}
document.getElementById('logoutBtn').addEventListener('click', logout);

// JWT payload doesn't carry department_id (see backend/src/utils/departmentAccess.js),
// so it's fetched fresh from /auth/me and appended to the header once resolved.
async function loadMyDepartment() {
  try {
    const [me, departments] = await Promise.all([api('/auth/me'), api('/departments')]);
    const dept = departments.find((d) => d.id === me.department_id);
    if (dept) {
      document.getElementById('whoami').textContent = `${user.username} (${user.role}) · ${dept.name}`;
    }
  } catch {
    // non-critical - header just keeps showing username/role without the department suffix
  }
}

const todoError = document.getElementById('todoError');
const ticketError = document.getElementById('ticketError');
const listError = document.getElementById('listError');
const incomingError = document.getElementById('incomingError');
const outgoingError = document.getElementById('outgoingError');

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

// ---- Lists ----

let currentListId = null; // null = "Tümü" (GET /api/todos, unfiltered)

async function loadLists() {
  clearError(listError);
  try {
    const lists = await api('/lists');
    const select = document.getElementById('listSelect');
    const previous = currentListId;
    select.innerHTML = '<option value="">Tümü</option>';
    lists.forEach((l) => {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.name;
      select.appendChild(opt);
    });
    // keep the previously selected list active across reloads if it still exists
    if (previous !== null && lists.some((l) => l.id === previous)) {
      select.value = String(previous);
    } else {
      currentListId = null;
      select.value = '';
    }
  } catch (err) {
    showError(listError, err.message);
  }
}

document.getElementById('listSelect').addEventListener('change', (e) => {
  currentListId = e.target.value ? Number(e.target.value) : null;
  loadTodos();
});

document.getElementById('listForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError(listError);
  const nameInput = document.getElementById('newListName');
  const name = nameInput.value.trim();
  if (!name) return;
  try {
    const list = await api('/lists', { method: 'POST', body: { name } });
    nameInput.value = '';
    await loadLists();
    document.getElementById('listSelect').value = String(list.id);
    currentListId = list.id;
    await loadTodos();
  } catch (err) {
    showError(listError, err.message);
  }
});

// ---- Todos ----

async function loadTodos() {
  clearError(todoError);
  try {
    const todos = currentListId
      ? await api(`/lists/${currentListId}/items`)
      : await api('/todos');
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
        <button class="secondary" data-action="assign" data-id="${t.id}">Ata</button>
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
    await api('/todos', {
      method: 'POST',
      body: { title, description: description || null, list_id: currentListId || undefined },
    });
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
    } else if (action === 'assign') {
      const assignee = prompt('Kime atansın? (kullanıcı adı)');
      if (assignee === null || assignee.trim() === '') return;
      await api(`/todos/${id}/assign`, { method: 'POST', body: { assignee_username: assignee.trim() } });
      alert('Görev atandı.');
      await loadOutgoing();
      return;
    }
    await loadTodos();
  } catch (err) {
    showError(todoError, err.message);
  }
});

// ---- Assignments ----

const ASSIGNMENT_STATUS_LABELS = {
  pending: 'Bekliyor',
  accepted: 'Kabul edildi',
  completed: 'Tamamlandı',
  rejected: 'Reddedildi',
  revision: 'Revizyon istendi',
  cancelled: 'İptal edildi',
};

function assignmentActionsHtml(a, role) {
  const buttons = [];
  if (role === 'incoming') {
    if (a.status === 'pending') {
      buttons.push(`<button class="secondary" data-action="accept" data-id="${a.id}">Kabul Et</button>`);
      buttons.push(`<button class="danger" data-action="reject" data-id="${a.id}">Reddet</button>`);
      buttons.push(`<button class="secondary" data-action="revise" data-id="${a.id}">Revize İste</button>`);
    } else if (a.status === 'accepted') {
      buttons.push(`<button class="secondary" data-action="complete" data-id="${a.id}">Tamamla</button>`);
    }
  } else {
    if (a.status === 'revision') {
      buttons.push(`<button class="secondary" data-action="resend" data-id="${a.id}">Tekrar Gönder</button>`);
    }
    if (['pending', 'revision', 'accepted'].includes(a.status)) {
      buttons.push(`<button class="danger" data-action="cancel" data-id="${a.id}">İptal Et</button>`);
    }
  }
  buttons.push(`<button class="secondary" data-action="timeline" data-id="${a.id}">Geçmiş</button>`);
  return buttons.join('');
}

function renderAssignments(tbodyId, assignments, role, counterpartKey) {
  const tbody = document.getElementById(tbodyId);
  if (assignments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Henüz kayıt yok.</td></tr>`;
    return;
  }
  tbody.innerHTML = assignments
    .map(
      (a) => `
    <tr>
      <td>${escapeHtml(a.todo_title)}</td>
      <td>${escapeHtml(a[counterpartKey])}</td>
      <td><span class="badge ${a.status}">${ASSIGNMENT_STATUS_LABELS[a.status] || a.status}</span></td>
      <td class="row-actions">${assignmentActionsHtml(a, role)}</td>
    </tr>`
    )
    .join('');
}

async function loadIncoming() {
  clearError(incomingError);
  try {
    const assignments = await api('/assignments/incoming');
    renderAssignments('incomingList', assignments, 'incoming', 'assigner_username');
  } catch (err) {
    showError(incomingError, err.message);
  }
}

async function loadOutgoing() {
  clearError(outgoingError);
  try {
    const assignments = await api('/assignments/outgoing');
    renderAssignments('outgoingList', assignments, 'outgoing', 'assignee_username');
  } catch (err) {
    showError(outgoingError, err.message);
  }
}

async function showTimeline(id) {
  try {
    const events = await api(`/assignments/${id}/timeline`);
    const items = events
      .map(
        (e) =>
          `${e.to_status} - ${e.actor_username} (${e.created_at})${e.comment ? ': ' + e.comment : ''}`
      )
      .join('\n');
    alert(items || 'Geçmiş bulunamadı.');
  } catch (err) {
    alert(err.message);
  }
}

async function handleAssignmentAction(e, errEl, reload) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === 'timeline') {
    await showTimeline(id);
    return;
  }

  let body;
  if (action === 'reject' || action === 'revise') {
    const comment = prompt(action === 'reject' ? 'Red gerekçesi (zorunlu):' : 'Revizyon notu (zorunlu):');
    if (comment === null || comment.trim() === '') return;
    body = { comment: comment.trim() };
  }

  try {
    await api(`/assignments/${id}/${action}`, { method: 'POST', body });
    await loadIncoming();
    await loadOutgoing();
    await loadTodos();
  } catch (err) {
    showError(errEl, err.message);
  }
}

document
  .getElementById('incomingList')
  .addEventListener('click', (e) => handleAssignmentAction(e, incomingError));
document
  .getElementById('outgoingList')
  .addEventListener('click', (e) => handleAssignmentAction(e, outgoingError));

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
  loadLists().then(loadTodos);
  loadIncoming();
  loadOutgoing();
  loadTickets();
}
