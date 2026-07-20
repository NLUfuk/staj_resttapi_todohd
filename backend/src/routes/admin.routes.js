const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const VALID_ROLES = ['user', 'admin'];
const VALID_TICKET_STATUS = ['open', 'in_progress', 'closed'];

// ---- Users ----

// GET /api/admin/users
router.get('/users', (req, res) => {
  const rows = db
    .prepare('SELECT id, username, role, created_at FROM users ORDER BY id ASC')
    .all();
  res.json(rows);
});

// GET /api/admin/users/:id
router.get('/users/:id', (req, res) => {
  const user = db
    .prepare('SELECT id, username, role, created_at FROM users WHERE id = ?')
    .get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'user not found' });
  }
  res.json(user);
});

// PATCH /api/admin/users/:id - promote/demote role
router.patch('/users/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'user not found' });
  }

  const { role } = req.body;
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
  const updated = db
    .prepare('SELECT id, username, role, created_at FROM users WHERE id = ?')
    .get(user.id);
  res.json(updated);
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'admins cannot delete their own account' });
  }
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'user not found' });
  }
  res.status(204).send();
});

// ---- Todos (read/moderate across all users) ----

// GET /api/admin/todos
router.get('/todos', (req, res) => {
  const rows = db
    .prepare(
      `SELECT todos.*, users.username AS owner_username
       FROM todos JOIN users ON users.id = todos.user_id
       ORDER BY todos.created_at DESC`
    )
    .all();
  res.json(rows);
});

// DELETE /api/admin/todos/:id
router.delete('/todos/:id', (req, res) => {
  const info = db.prepare('DELETE FROM todos WHERE id = ?').run(req.params.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'todo not found' });
  }
  res.status(204).send();
});

// ---- Tickets (helpdesk queue) ----

// GET /api/admin/tickets
router.get('/tickets', (req, res) => {
  const rows = db
    .prepare(
      `SELECT tickets.*, users.username AS reporter_username
       FROM tickets JOIN users ON users.id = tickets.user_id
       ORDER BY tickets.created_at DESC`
    )
    .all();
  res.json(rows);
});

// GET /api/admin/tickets/:id
router.get('/tickets/:id', (req, res) => {
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
  res.json(ticket);
});

// PATCH /api/admin/tickets/:id - update status and/or respond
router.patch('/tickets/:id', (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: 'ticket not found' });
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

  const updated = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id);
  res.json(updated);
});

// DELETE /api/admin/tickets/:id
router.delete('/tickets/:id', (req, res) => {
  const info = db.prepare('DELETE FROM tickets WHERE id = ?').run(req.params.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'ticket not found' });
  }
  res.status(204).send();
});

module.exports = router;
