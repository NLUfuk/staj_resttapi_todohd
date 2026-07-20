const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { notifyMentions } = require('../utils/notify');
const { getUserDepartmentId } = require('../utils/departmentAccess');

const router = express.Router();
router.use(requireAuth);

// Per-user (not per-IP) flood protection: 30 messages/minute. Kept the same
// in test as in prod (unlike the global/login limiters) because the flood
// test exercises this exact threshold.
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user.id),
  message: { error: 'too many messages, please slow down' },
});

// A channel is visible/writable if: caller is admin, the channel is the
// public NULL-department channel, or the channel's department matches the
// caller's own department.
function canAccessChannel(user, channel) {
  if (user.role === 'admin') return true;
  if (channel.department_id === null) return true;
  return getUserDepartmentId(user.id) === channel.department_id;
}

// GET /api/channels - channels visible to the caller
router.get('/', (req, res) => {
  let rows;
  if (req.user.role === 'admin') {
    rows = db.prepare('SELECT * FROM channels ORDER BY name ASC').all();
  } else {
    const deptId = getUserDepartmentId(req.user.id);
    rows = db
      .prepare('SELECT * FROM channels WHERE department_id IS NULL OR department_id = ? ORDER BY name ASC')
      .all(deptId);
  }
  res.json(rows);
});

// GET /api/channels/:id/messages?before=<id>&after=<id>&limit=
// Cursor-based (not page-based): a stream of new messages would shift
// offset-based pages out from under a paginating client.
router.get('/:id/messages', (req, res) => {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
  if (!channel) {
    return res.status(404).json({ error: 'channel not found' });
  }
  if (!canAccessChannel(req.user, channel)) {
    return res.status(403).json({ error: 'not a member of this channel' });
  }

  let limit = Number.parseInt(req.query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;

  const { before, after } = req.query;
  const selectCols = `messages.*, users.username
       FROM messages JOIN users ON users.id = messages.user_id`;

  let rows;
  if (after !== undefined) {
    const afterId = Number.parseInt(after, 10);
    if (!Number.isInteger(afterId)) {
      return res.status(400).json({ error: 'after must be an integer message id' });
    }
    rows = db
      .prepare(
        `SELECT ${selectCols} WHERE channel_id = ? AND messages.id > ? ORDER BY messages.id ASC LIMIT ?`
      )
      .all(channel.id, afterId, limit);
  } else if (before !== undefined) {
    const beforeId = Number.parseInt(before, 10);
    if (!Number.isInteger(beforeId)) {
      return res.status(400).json({ error: 'before must be an integer message id' });
    }
    rows = db
      .prepare(
        `SELECT ${selectCols} WHERE channel_id = ? AND messages.id < ? ORDER BY messages.id DESC LIMIT ?`
      )
      .all(channel.id, beforeId, limit)
      .reverse();
  } else {
    rows = db
      .prepare(`SELECT ${selectCols} WHERE channel_id = ? ORDER BY messages.id DESC LIMIT ?`)
      .all(channel.id, limit)
      .reverse();
  }

  res.json(rows);
});

// POST /api/channels/:id/messages
router.post('/:id/messages', messageLimiter, (req, res) => {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
  if (!channel) {
    return res.status(404).json({ error: 'channel not found' });
  }
  if (!canAccessChannel(req.user, channel)) {
    return res.status(403).json({ error: 'not a member of this channel' });
  }

  const { body } = req.body;
  if (typeof body !== 'string' || body.trim().length === 0) {
    return res.status(400).json({ error: 'body is required' });
  }

  const info = db
    .prepare('INSERT INTO messages (channel_id, user_id, body) VALUES (?, ?, ?)')
    .run(channel.id, req.user.id, body.trim());

  notifyMentions({
    senderId: req.user.id,
    senderUsername: req.user.username,
    channelName: channel.name,
    messageId: info.lastInsertRowid,
    body: body.trim(),
  });

  const message = db
    .prepare(
      `SELECT messages.*, users.username
       FROM messages JOIN users ON users.id = messages.user_id
       WHERE messages.id = ?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json(message);
});

// DELETE /api/channels/:id/messages/:mid - the message's author or an admin
router.delete('/:id/messages/:mid', (req, res) => {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
  if (!channel) {
    return res.status(404).json({ error: 'channel not found' });
  }
  if (!canAccessChannel(req.user, channel)) {
    return res.status(403).json({ error: 'not a member of this channel' });
  }

  const message = db
    .prepare('SELECT * FROM messages WHERE id = ? AND channel_id = ?')
    .get(req.params.mid, channel.id);
  if (!message) {
    return res.status(404).json({ error: 'message not found' });
  }
  if (req.user.role !== 'admin' && message.user_id !== req.user.id) {
    return res.status(403).json({ error: 'only the author or an admin can delete this message' });
  }

  db.prepare('DELETE FROM messages WHERE id = ?').run(message.id);
  res.status(204).send();
});

module.exports = router;
