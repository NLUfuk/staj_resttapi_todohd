const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { jwtSecret, jwtExpiresIn, appUrl } = require('../config');
const { requireAuth } = require('../middleware/auth');
const mailer = require('../utils/mailer');
const {
  issueRefreshToken,
  findValidRefreshToken,
  revokeRefreshToken,
} = require('../utils/refreshToken');

const router = express.Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );
}

function hashVerificationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Generates+stores a verification token and emails its link. Token itself is
// never returned from any route - only the (hashed) DB row and the outgoing
// email know it, same threat model as the refresh token (utils/refreshToken.js).
function issueEmailVerification(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MS).toISOString();

  db.prepare(
    'INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
  ).run(user.id, hashVerificationToken(token), expiresAt);

  const verifyUrl = `${appUrl}/verify.html?token=${token}`;
  mailer.send({
    to: user.email,
    subject: 'E-posta adresinizi onaylayın',
    html: `<p>Merhaba ${user.username},</p><p>Hesabınızı onaylamak için <a href="${verifyUrl}">buraya tıklayın</a>.</p><p>${verifyUrl}</p>`,
  });
}

// POST /api/auth/register - always creates a 'user' role account.
// Promoting to admin is an explicit admin-only action (PATCH /api/admin/users/:id).
// Account starts unverified (is_verified=0) - login is blocked until the
// emailed link is followed (GET /api/auth/verify), so no token is issued here.
router.post('/register', (req, res) => {
  const { username, email, password } = req.body;

  if (
    typeof username !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string'
  ) {
    return res.status(400).json({ error: 'username, email and password are required strings' });
  }
  if (username.trim().length < 3) {
    return res.status(400).json({ error: 'username must be at least 3 characters' });
  }
  const trimmedEmail = email.trim();
  if (!EMAIL_PATTERN.test(trimmedEmail)) {
    return res.status(400).json({ error: 'email must be a valid email address' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }

  const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existingUsername) {
    return res.status(409).json({ error: 'username already taken' });
  }
  const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(trimmedEmail);
  if (existingEmail) {
    return res.status(409).json({ error: 'email already registered' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare(
      `INSERT INTO users (username, email, password_hash, role, department_id, is_verified)
       VALUES (?, ?, ?, 'user', ?, 0)`
    )
    .run(username, trimmedEmail, passwordHash, db.genelDepartmentId);

  issueEmailVerification({ id: info.lastInsertRowid, username, email: trimmedEmail });

  res.status(201).json({ message: 'onay maili gönderildi, hesabınızı onaylamadan giriş yapamazsınız' });
});

// GET /api/auth/verify?token=... - follows the emailed link, marks the
// account verified. Idempotency guard (used_at) stops a leaked/re-clicked
// link from being replayed after the first successful verification.
router.get('/verify', (req, res) => {
  const { token } = req.query;
  if (typeof token !== 'string' || token.length === 0) {
    return res.status(400).json({ error: 'token is required' });
  }

  const row = db
    .prepare('SELECT * FROM email_verifications WHERE token_hash = ?')
    .get(hashVerificationToken(token));

  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'invalid or expired token' });
  }

  db.transaction(() => {
    db.prepare(`UPDATE email_verifications SET used_at = datetime('now') WHERE id = ?`).run(row.id);
    db.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(row.user_id);
  })();

  res.json({ message: 'e-posta onaylandı, artık giriş yapabilirsiniz' });
});

// POST /api/auth/resend-verification - { email }. Always returns the same
// generic response regardless of whether the email exists or is already
// verified, so this endpoint can't be used to enumerate registered accounts.
router.post('/resend-verification', (req, res) => {
  const { email } = req.body;
  if (typeof email !== 'string' || email.trim().length === 0) {
    return res.status(400).json({ error: 'email is required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim());
  if (user && !user.is_verified) {
    issueEmailVerification(user);
  }

  res.json({ message: 'hesap onaylanmamışsa yeni bir onay maili gönderildi' });
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
  if (!row.is_verified) {
    return res.status(403).json({ error: 'e-postanızı onaylamadan giriş yapamazsınız' });
  }

  const user = { id: row.id, username: row.username, role: row.role };
  const token = signToken(user);
  const refreshToken = issueRefreshToken(user.id);
  res.json({ token, refreshToken, user });
});

// POST /api/auth/refresh - exchanges a valid refresh token for a new access
// token. Rotates the refresh token too (revoke old, issue new) so a stolen
// token can't be replayed indefinitely alongside the legitimate client.
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    return res.status(400).json({ error: 'refreshToken is required' });
  }

  const stored = findValidRefreshToken(refreshToken);
  if (!stored) {
    return res.status(401).json({ error: 'invalid, expired or revoked refresh token' });
  }

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(stored.user_id);
  if (!row) {
    return res.status(401).json({ error: 'invalid, expired or revoked refresh token' });
  }

  revokeRefreshToken(refreshToken);
  const user = { id: row.id, username: row.username, role: row.role };
  const token = signToken(user);
  const newRefreshToken = issueRefreshToken(user.id);
  res.json({ token, refreshToken: newRefreshToken, user });
});

// POST /api/auth/logout - revokes the given refresh token (idempotent; an
// already-revoked or unknown token still returns 204, since the end state
// the caller wants - "this token no longer works" - already holds).
router.post('/logout', (req, res) => {
  const { refreshToken } = req.body;
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    return res.status(400).json({ error: 'refreshToken is required' });
  }

  revokeRefreshToken(refreshToken);
  res.status(204).send();
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const row = db
    .prepare(
      'SELECT id, username, role, department_id, email, is_verified, created_at FROM users WHERE id = ?'
    )
    .get(req.user.id);
  if (!row) {
    return res.status(404).json({ error: 'user not found' });
  }
  res.json(row);
});

module.exports = router;
