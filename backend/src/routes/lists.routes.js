const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { parsePagination, setPaginationHeaders } = require('../utils/pagination');

const router = express.Router();
router.use(requireAuth);

// All routes here are scoped to req.user.id - users only ever see/modify their own lists.

// GET /api/lists?page=&limit=
router.get('/', (req, res) => {
  const totalCount = db
    .prepare('SELECT COUNT(*) AS c FROM todo_lists WHERE owner_id = ?')
    .get(req.user.id).c;
  const { page, limit, offset } = parsePagination(req.query);

  const rows = db
    .prepare(
      `SELECT * FROM todo_lists WHERE owner_id = ?
       ORDER BY created_at ASC
       LIMIT ? OFFSET ?`
    )
    .all(req.user.id, limit, offset);

  setPaginationHeaders(req, res, { page, limit, totalCount });
  res.json(rows);
});

// POST /api/lists
router.post('/', (req, res) => {
  const { name } = req.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'name is required' });
  }

  const info = db
    .prepare('INSERT INTO todo_lists (owner_id, name) VALUES (?, ?)')
    .run(req.user.id, name.trim());

  const list = db.prepare('SELECT * FROM todo_lists WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(list);
});

// GET /api/lists/:id
router.get('/:id', (req, res) => {
  const list = db
    .prepare('SELECT * FROM todo_lists WHERE id = ? AND owner_id = ?')
    .get(req.params.id, req.user.id);
  if (!list) {
    return res.status(404).json({ error: 'list not found' });
  }
  res.json(list);
});

// PATCH /api/lists/:id - rename
router.patch('/:id', (req, res) => {
  const list = db
    .prepare('SELECT * FROM todo_lists WHERE id = ? AND owner_id = ?')
    .get(req.params.id, req.user.id);
  if (!list) {
    return res.status(404).json({ error: 'list not found' });
  }

  const { name } = req.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'name is required' });
  }

  db.prepare('UPDATE todo_lists SET name = ? WHERE id = ?').run(name.trim(), list.id);
  const updated = db.prepare('SELECT * FROM todo_lists WHERE id = ?').get(list.id);
  res.json(updated);
});

// DELETE /api/lists/:id - cascades to the list's todos (ON DELETE CASCADE)
router.delete('/:id', (req, res) => {
  const info = db
    .prepare('DELETE FROM todo_lists WHERE id = ? AND owner_id = ?')
    .run(req.params.id, req.user.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'list not found' });
  }
  res.status(204).send();
});

// GET /api/lists/:id/items?page=&limit= - the list's todos
router.get('/:id/items', (req, res) => {
  const list = db
    .prepare('SELECT * FROM todo_lists WHERE id = ? AND owner_id = ?')
    .get(req.params.id, req.user.id);
  if (!list) {
    return res.status(404).json({ error: 'list not found' });
  }

  const totalCount = db
    .prepare('SELECT COUNT(*) AS c FROM todos WHERE list_id = ?')
    .get(list.id).c;
  const { page, limit, offset } = parsePagination(req.query);

  const rows = db
    .prepare(
      `SELECT * FROM todos WHERE list_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(list.id, limit, offset);

  setPaginationHeaders(req, res, { page, limit, totalCount });
  res.json(rows);
});

module.exports = router;
