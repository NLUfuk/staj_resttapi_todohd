const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { parsePagination, setPaginationHeaders } = require('../utils/pagination');

const router = express.Router();
router.use(requireAuth);

// GET /api/notifications?unread=true&page=&limit=
router.get('/', (req, res) => {
  const { unread } = req.query;
  const whereClause = unread === 'true' ? 'AND read_at IS NULL' : '';

  const totalCount = db
    .prepare(`SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? ${whereClause}`)
    .get(req.user.id).c;
  const { page, limit, offset } = parsePagination(req.query);

  const rows = db
    .prepare(
      `SELECT * FROM notifications WHERE user_id = ? ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(req.user.id, limit, offset);

  setPaginationHeaders(req, res, { page, limit, totalCount });
  res.json(rows);
});

// PATCH /api/notifications/read-all - must be registered before /:id/read
router.patch('/read-all', (req, res) => {
  db.prepare(
    `UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`
  ).run(req.user.id);
  res.status(204).send();
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', (req, res) => {
  const notification = db
    .prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!notification) {
    return res.status(404).json({ error: 'notification not found' });
  }

  db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ?`).run(
    notification.id
  );
  const updated = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notification.id);
  res.json(updated);
});

module.exports = router;
