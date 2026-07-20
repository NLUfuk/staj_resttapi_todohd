const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// All routes here are scoped to req.user.id - users only ever see/modify their own tickets.
// Admin-wide ticket management lives under /api/admin/tickets.

// GET /api/tickets
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  res.json(rows);
});

// POST /api/tickets - optionally references one of the user's own todos.
router.post('/', (req, res) => {
  const { subject, message, todo_id } = req.body;

  if (typeof subject !== 'string' || subject.trim().length === 0) {
    return res.status(400).json({ error: 'subject is required' });
  }
  if (typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'message is required' });
  }

  let todoId = null;
  if (todo_id !== undefined && todo_id !== null) {
    const todo = db
      .prepare('SELECT id FROM todos WHERE id = ? AND user_id = ?')
      .get(todo_id, req.user.id);
    if (!todo) {
      return res.status(400).json({ error: 'todo_id does not reference one of your todos' });
    }
    todoId = todo.id;
  }

  const info = db
    .prepare('INSERT INTO tickets (user_id, todo_id, subject, message) VALUES (?, ?, ?, ?)')
    .run(req.user.id, todoId, subject.trim(), message.trim());

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(ticket);
});

// GET /api/tickets/:id
router.get('/:id', (req, res) => {
  const ticket = db
    .prepare('SELECT * FROM tickets WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!ticket) {
    return res.status(404).json({ error: 'ticket not found' });
  }
  res.json(ticket);
});

// PUT /api/tickets/:id - the reporter may only edit subject/message while the ticket is still open.
router.put('/:id', (req, res) => {
  const ticket = db
    .prepare('SELECT * FROM tickets WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!ticket) {
    return res.status(404).json({ error: 'ticket not found' });
  }
  if (ticket.status !== 'open') {
    return res.status(409).json({ error: 'only open tickets can be edited by the reporter' });
  }

  const { subject, message } = req.body;
  if (subject !== undefined && (typeof subject !== 'string' || subject.trim().length === 0)) {
    return res.status(400).json({ error: 'subject must be a non-empty string' });
  }
  if (message !== undefined && (typeof message !== 'string' || message.trim().length === 0)) {
    return res.status(400).json({ error: 'message must be a non-empty string' });
  }

  db.prepare(
    `UPDATE tickets SET subject = ?, message = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(
    subject !== undefined ? subject.trim() : ticket.subject,
    message !== undefined ? message.trim() : ticket.message,
    ticket.id
  );

  const updated = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id);
  res.json(updated);
});

// DELETE /api/tickets/:id
router.delete('/:id', (req, res) => {
  const info = db
    .prepare('DELETE FROM tickets WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'ticket not found' });
  }
  res.status(204).send();
});

module.exports = router;
