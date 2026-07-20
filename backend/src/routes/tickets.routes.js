const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { parsePagination, setPaginationHeaders } = require('../utils/pagination');
const { notify } = require('../utils/notify');
const { getUserDepartmentId } = require('../utils/departmentAccess');

const router = express.Router();
router.use(requireAuth);

// All routes here are scoped to req.user.id - users only ever see/modify their own tickets.
// Admin-wide ticket management lives under /api/admin/tickets.

// GET /api/tickets?page=&limit=
router.get('/', (req, res) => {
  const totalCount = db
    .prepare('SELECT COUNT(*) AS c FROM tickets WHERE user_id = ?')
    .get(req.user.id).c;
  const { page, limit, offset } = parsePagination(req.query);

  const rows = db
    .prepare('SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(req.user.id, limit, offset);

  setPaginationHeaders(req, res, { page, limit, totalCount });
  res.json(rows);
});

// POST /api/tickets - optionally references one of the user's own todos.
// department_id is required: it says which department the request is aimed
// at (e.g. a printer issue -> Donanım), independent of the reporter's own
// department on their user record.
router.post('/', (req, res) => {
  const { subject, message, todo_id, department_id } = req.body;

  if (typeof subject !== 'string' || subject.trim().length === 0) {
    return res.status(400).json({ error: 'subject is required' });
  }
  if (typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'message is required' });
  }

  if (!Number.isInteger(department_id)) {
    return res.status(400).json({ error: 'department_id is required' });
  }
  const department = db.prepare('SELECT id FROM departments WHERE id = ?').get(department_id);
  if (!department) {
    return res.status(400).json({ error: 'department_id must reference an existing department' });
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
    .prepare(
      'INSERT INTO tickets (user_id, todo_id, department_id, subject, message) VALUES (?, ?, ?, ?, ?)'
    )
    .run(req.user.id, todoId, department.id, subject.trim(), message.trim());

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

// ---- Comments (conversation thread) ----
// Unlike the routes above, comments are reachable by the ticket's reporter
// OR an admin (not just the reporter) - this is the one place under
// /api/tickets/* where an admin can act on a ticket they don't own, so
// ownership is checked manually instead of via a blanket "WHERE user_id = ?".

function findTicketForRequester(req) {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return null;
  if (req.user.role === 'admin') return ticket;
  if (req.user.role === 'dept_lead') {
    return getUserDepartmentId(req.user.id) === ticket.department_id ? ticket : null;
  }
  return ticket.user_id === req.user.id ? ticket : null;
}

// GET /api/tickets/:id/comments?page=&limit=
router.get('/:id/comments', (req, res) => {
  const ticket = findTicketForRequester(req);
  if (!ticket) {
    return res.status(404).json({ error: 'ticket not found' });
  }

  const totalCount = db
    .prepare('SELECT COUNT(*) AS c FROM ticket_comments WHERE ticket_id = ?')
    .get(ticket.id).c;
  const { page, limit, offset } = parsePagination(req.query);

  const rows = db
    .prepare(
      `SELECT ticket_comments.*, users.username
       FROM ticket_comments JOIN users ON users.id = ticket_comments.user_id
       WHERE ticket_id = ?
       ORDER BY ticket_comments.created_at ASC
       LIMIT ? OFFSET ?`
    )
    .all(ticket.id, limit, offset);

  setPaginationHeaders(req, res, { page, limit, totalCount });
  res.json(rows);
});

// POST /api/tickets/:id/comments
router.post('/:id/comments', (req, res) => {
  const ticket = findTicketForRequester(req);
  if (!ticket) {
    return res.status(404).json({ error: 'ticket not found' });
  }
  if (ticket.status === 'closed') {
    return res.status(409).json({ error: 'cannot comment on a closed ticket' });
  }

  const { body } = req.body;
  if (typeof body !== 'string' || body.trim().length === 0) {
    return res.status(400).json({ error: 'body is required' });
  }

  const info = db
    .prepare('INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES (?, ?, ?)')
    .run(ticket.id, req.user.id, body.trim());

  // Notify the reporter when someone else (an admin) comments on their
  // ticket. The reporter commenting on their own ticket has no specific
  // recipient - tickets aren't assigned to an individual admin.
  if (req.user.id !== ticket.user_id) {
    notify(ticket.user_id, 'ticket_comment', ticket.id, `"${ticket.subject}" talebinize yeni bir yorum geldi`);
  }

  const comment = db
    .prepare(
      `SELECT ticket_comments.*, users.username
       FROM ticket_comments JOIN users ON users.id = ticket_comments.user_id
       WHERE ticket_comments.id = ?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json(comment);
});

// DELETE /api/tickets/:id/comments/:cid - the comment's author or an admin
router.delete('/:id/comments/:cid', (req, res) => {
  const ticket = findTicketForRequester(req);
  if (!ticket) {
    return res.status(404).json({ error: 'ticket not found' });
  }

  const comment = db
    .prepare('SELECT * FROM ticket_comments WHERE id = ? AND ticket_id = ?')
    .get(req.params.cid, ticket.id);
  if (!comment) {
    return res.status(404).json({ error: 'comment not found' });
  }
  if (req.user.role !== 'admin' && comment.user_id !== req.user.id) {
    return res.status(403).json({ error: 'only the comment author or an admin can delete this comment' });
  }

  db.prepare('DELETE FROM ticket_comments WHERE id = ?').run(comment.id);
  res.status(204).send();
});

module.exports = router;
