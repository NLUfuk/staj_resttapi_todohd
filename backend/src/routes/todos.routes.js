const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const VALID_STATUS = ['pending', 'done'];

// All routes here are scoped to req.user.id - users only ever see/modify their own todos.

// GET /api/todos
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  res.json(rows);
});

// POST /api/todos
router.post('/', (req, res) => {
  const { title, description } = req.body;

  if (typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'title is required' });
  }

  const info = db
    .prepare('INSERT INTO todos (user_id, title, description) VALUES (?, ?, ?)')
    .run(req.user.id, title.trim(), description || null);

  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(todo);
});

// GET /api/todos/:id
router.get('/:id', (req, res) => {
  const todo = db
    .prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!todo) {
    return res.status(404).json({ error: 'todo not found' });
  }
  res.json(todo);
});

// PUT /api/todos/:id
router.put('/:id', (req, res) => {
  const todo = db
    .prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!todo) {
    return res.status(404).json({ error: 'todo not found' });
  }

  const { title, description, status } = req.body;
  if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
    return res.status(400).json({ error: 'title must be a non-empty string' });
  }
  if (status !== undefined && !VALID_STATUS.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUS.join(', ')}` });
  }

  db.prepare(
    `UPDATE todos
     SET title = ?, description = ?, status = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    title !== undefined ? title.trim() : todo.title,
    description !== undefined ? description : todo.description,
    status !== undefined ? status : todo.status,
    todo.id
  );

  const updated = db.prepare('SELECT * FROM todos WHERE id = ?').get(todo.id);
  res.json(updated);
});

// DELETE /api/todos/:id
router.delete('/:id', (req, res) => {
  const info = db
    .prepare('DELETE FROM todos WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'todo not found' });
  }
  res.status(204).send();
});

module.exports = router;
