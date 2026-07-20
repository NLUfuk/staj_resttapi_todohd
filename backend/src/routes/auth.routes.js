const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { jwtSecret, jwtExpiresIn } = require('../config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );
}

// POST /api/auth/register - always creates a 'user' role account.
// Promoting to admin is an explicit admin-only action (PATCH /api/admin/users/:id).
router.post('/register', (req, res) => {
  const { username, password } = req.body;

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'username and password are required strings' });
  }
  if (username.trim().length < 3) {
    return res.status(400).json({ error: 'username must be at least 3 characters' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'username already taken' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run(username, passwordHash, 'user');

  const user = { id: info.lastInsertRowid, username, role: 'user' };
  const token = signToken(user);
  res.status(201).json({ token, user });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'username and password are required strings' });
  }

  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'invalid username or password' });
  }

  const user = { id: row.id, username: row.username, role: row.role };
  const token = signToken(user);
  res.json({ token, user });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const row = db
    .prepare('SELECT id, username, role, created_at FROM users WHERE id = ?')
    .get(req.user.id);
  if (!row) {
    return res.status(404).json({ error: 'user not found' });
  }
  res.json(row);
});

module.exports = router;
