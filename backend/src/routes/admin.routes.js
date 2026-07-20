const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { parsePagination, setPaginationHeaders } = require('../utils/pagination');
const { notify } = require('../utils/notify');
const { audit } = require('../utils/audit');
const { getUserDepartmentId } = require('../utils/departmentAccess');

const router = express.Router();
router.use(requireAuth);

const VALID_ROLES = ['user', 'dept_lead', 'admin'];
const VALID_TICKET_STATUS = ['open', 'in_progress', 'closed'];

// dept_lead only manages tickets, and only within their own department
// (durum değiştirme, yanıtlama); user/todo/audit-log management stays
// admin-only.
const requireTicketManager = requireRole('admin', 'dept_lead');

// True if the caller may act on this specific ticket: admin always can,
// dept_lead only within their own department, nobody else reaches these
// routes at all (requireTicketManager already blocked plain 'user').
function canManageTicket(user, ticket) {
  if (user.role === 'admin') return true;
  return getUserDepartmentId(user.id) === ticket.department_id;
}

// ---- Users (admin only) ----

// GET /api/admin/users?page=&limit=
router.get('/users', requireRole('admin'), (req, res) => {
  const totalCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const { page, limit, offset } = parsePagination(req.query);

  const rows = db
    .prepare(
      'SELECT id, username, role, department_id, created_at FROM users ORDER BY id ASC LIMIT ? OFFSET ?'
    )
    .all(limit, offset);

  setPaginationHeaders(req, res, { page, limit, totalCount });
  res.json(rows);
});

// GET /api/admin/users/:id
router.get('/users/:id', requireRole('admin'), (req, res) => {
  const user = db
    .prepare('SELECT id, username, role, department_id, created_at FROM users WHERE id = ?')
    .get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'user not found' });
  }
  res.json(user);
});

// PATCH /api/admin/users/:id - promote/demote role and/or reassign department
router.patch('/users/:id', requireRole('admin'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'user not found' });
  }

  const { role, department_id } = req.body;
  if (role !== undefined && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }
  if (department_id !== undefined) {
    const department = db.prepare('SELECT id FROM departments WHERE id = ?').get(department_id);
    if (!department) {
      return res.status(400).json({ error: 'department_id must reference an existing department' });
    }
  }
  if (role === undefined && department_id === undefined) {
    return res.status(400).json({ error: 'role and/or department_id must be provided' });
  }

  db.prepare('UPDATE users SET role = ?, department_id = ? WHERE id = ?').run(
    role !== undefined ? role : user.role,
    department_id !== undefined ? department_id : user.department_id,
    user.id
  );

  if (role !== undefined && role !== user.role) {
    audit(req.user.id, 'role.change', `users:${user.id}`);
  }

  const updated = db
    .prepare('SELECT id, username, role, department_id, created_at FROM users WHERE id = ?')
    .get(user.id);
  res.json(updated);
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', requireRole('admin'), (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'admins cannot delete their own account' });
  }
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'user not found' });
  }
  audit(req.user.id, 'user.delete', `users:${req.params.id}`);
  res.status(204).send();
});

// ---- Todos (read/moderate across all users) ----

// GET /api/admin/todos?page=&limit=
router.get('/todos', requireRole('admin'), (req, res) => {
  const totalCount = db.prepare('SELECT COUNT(*) AS c FROM todos').get().c;
  const { page, limit, offset } = parsePagination(req.query);

  const rows = db
    .prepare(
      `SELECT todos.*, users.username AS owner_username
       FROM todos JOIN users ON users.id = todos.user_id
       ORDER BY todos.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset);

  setPaginationHeaders(req, res, { page, limit, totalCount });
  res.json(rows);
});

// DELETE /api/admin/todos/:id
router.delete('/todos/:id', requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM todos WHERE id = ?').run(req.params.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'todo not found' });
  }
  audit(req.user.id, 'todo.delete', `todos:${req.params.id}`);
  res.status(204).send();
});

// ---- Tickets (helpdesk queue) ----

// GET /api/admin/tickets?page=&limit=&department=<slug>
// dept_lead is always scoped to their own department - the ?department
// filter is only meaningful for admin, and must match the dept_lead's own
// department if given at all.
router.get('/tickets', requireTicketManager, (req, res) => {
  const { department } = req.query;
  const { page, limit, offset } = parsePagination(req.query);

  let whereClause = '';
  const params = [];
  if (req.user.role === 'dept_lead') {
    const ownDeptId = getUserDepartmentId(req.user.id);
    if (department !== undefined) {
      const dept = db.prepare('SELECT id FROM departments WHERE slug = ?').get(department);
      if (!dept || dept.id !== ownDeptId) {
        return res.status(403).json({ error: 'dept_lead can only view tickets in their own department' });
      }
    }
    whereClause = 'WHERE tickets.department_id = ?';
    params.push(ownDeptId);
  } else if (department !== undefined) {
    const dept = db.prepare('SELECT id FROM departments WHERE slug = ?').get(department);
    if (!dept) {
      return res.status(400).json({ error: 'unknown department slug' });
    }
    whereClause = 'WHERE tickets.department_id = ?';
    params.push(dept.id);
  }

  const totalCount = db
    .prepare(`SELECT COUNT(*) AS c FROM tickets ${whereClause}`)
    .get(...params).c;

  const rows = db
    .prepare(
      `SELECT tickets.*, users.username AS reporter_username
       FROM tickets JOIN users ON users.id = tickets.user_id
       ${whereClause}
       ORDER BY tickets.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  setPaginationHeaders(req, res, { page, limit, totalCount });
  res.json(rows);
});

// GET /api/admin/tickets/:id
router.get('/tickets/:id', requireTicketManager, (req, res) => {
  const ticket = db
    .prepare(
      `SELECT tickets.*, users.username AS reporter_username
       FROM tickets JOIN users ON users.id = tickets.user_id
       WHERE tickets.id = ?`
    )
    .get(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: 'ticket not found' });
  }
  if (!canManageTicket(req.user, ticket)) {
    return res.status(403).json({ error: 'dept_lead can only view tickets in their own department' });
  }
  res.json(ticket);
});

// PATCH /api/admin/tickets/:id - update status and/or respond
router.patch('/tickets/:id', requireTicketManager, (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: 'ticket not found' });
  }
  if (!canManageTicket(req.user, ticket)) {
    return res.status(403).json({ error: 'dept_lead can only manage tickets in their own department' });
  }

  const { status, admin_response } = req.body;
  if (status !== undefined && !VALID_TICKET_STATUS.includes(status)) {
    return res
      .status(400)
      .json({ error: `status must be one of: ${VALID_TICKET_STATUS.join(', ')}` });
  }
  if (admin_response !== undefined && typeof admin_response !== 'string') {
    return res.status(400).json({ error: 'admin_response must be a string' });
  }

  db.prepare(
    `UPDATE tickets SET status = ?, admin_response = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(
    status !== undefined ? status : ticket.status,
    admin_response !== undefined ? admin_response : ticket.admin_response,
    ticket.id
  );

  if (status !== undefined && status !== ticket.status) {
    notify(ticket.user_id, 'ticket_status', ticket.id, `"${ticket.subject}" talebinizin durumu "${status}" olarak değişti`);
    if (status === 'closed') {
      audit(req.user.id, 'ticket.close', `tickets:${ticket.id}`);
    }
  }

  const updated = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id);
  res.json(updated);
});

// DELETE /api/admin/tickets/:id - admin only (dept_lead's scope is status
// changes/replies, not deletion)
router.delete('/tickets/:id', requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM tickets WHERE id = ?').run(req.params.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'ticket not found' });
  }
  audit(req.user.id, 'ticket.delete', `tickets:${req.params.id}`);
  res.status(204).send();
});

// ---- Audit log (admin only) ----

// GET /api/admin/audit-logs?page=&limit=
router.get('/audit-logs', requireRole('admin'), (req, res) => {
  const totalCount = db.prepare('SELECT COUNT(*) AS c FROM audit_logs').get().c;
  const { page, limit, offset } = parsePagination(req.query);

  const rows = db
    .prepare(
      `SELECT audit_logs.*, users.username AS actor_username
       FROM audit_logs LEFT JOIN users ON users.id = audit_logs.user_id
       ORDER BY audit_logs.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset);

  setPaginationHeaders(req, res, { page, limit, totalCount });
  res.json(rows);
});

// ---- Stats (admin only) ----

// GET /api/admin/stats
router.get('/stats', requireRole('admin'), (req, res) => {
  const ticketsByDepartment = db
    .prepare(
      `SELECT departments.slug AS department,
              SUM(CASE WHEN tickets.status = 'open' THEN 1 ELSE 0 END) AS open,
              SUM(CASE WHEN tickets.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
              SUM(CASE WHEN tickets.status = 'closed' THEN 1 ELSE 0 END) AS closed
       FROM departments
       LEFT JOIN tickets ON tickets.department_id = departments.id
       GROUP BY departments.id
       ORDER BY departments.name ASC`
    )
    .all();

  // updated_at doubles as "closed at" here - there's no dedicated closed_at
  // column, but every status change (including -> closed) stamps updated_at.
  const avgClosure = db
    .prepare(
      `SELECT AVG((julianday(updated_at) - julianday(created_at)) * 24) AS avg_hours
       FROM tickets WHERE status = 'closed'`
    )
    .get();

  const todosPerUser = db
    .prepare(
      `SELECT users.username, COUNT(todos.id) AS todo_count
       FROM users LEFT JOIN todos ON todos.user_id = users.id
       GROUP BY users.id
       ORDER BY todo_count DESC, users.username ASC`
    )
    .all();

  const messageVolumeLast7Days = db
    .prepare(
      `SELECT channels.name AS channel, COUNT(messages.id) AS message_count
       FROM channels
       LEFT JOIN messages
         ON messages.channel_id = channels.id
         AND messages.created_at >= datetime('now', '-7 days')
       GROUP BY channels.id
       ORDER BY channels.name ASC`
    )
    .all();

  res.json({
    ticketsByDepartment,
    avgTicketClosureHours: avgClosure.avg_hours,
    todosPerUser,
    messageVolumeLast7Days,
    totalMessagesLast7Days: messageVolumeLast7Days.reduce((sum, r) => sum + r.message_count, 0),
  });
});

module.exports = router;
