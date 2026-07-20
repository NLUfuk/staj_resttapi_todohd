const crypto = require('crypto');
const db = require('../db');
const { refreshTokenExpiresInDays } = require('../config');

// Opaque (not JWT) so it can be revoked server-side immediately - the report
// this project follows compares JWT vs opaque tokens: stateless verification
// on the short-lived access token, instant revocability on the refresh
// token. Only a hash is stored, same rationale as password hashing: a
// leaked DB shouldn't hand out usable tokens.
function generateRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function issueRefreshToken(userId) {
  const token = generateRefreshToken();
  const expiresAt = new Date(
    Date.now() + refreshTokenExpiresInDays * 24 * 60 * 60 * 1000
  ).toISOString();

  db.prepare(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
  ).run(userId, hashToken(token), expiresAt);

  return token;
}

// Returns the refresh_tokens row if the token is present, unrevoked and
// unexpired; null otherwise (caller doesn't need to know which).
function findValidRefreshToken(token) {
  const row = db
    .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?')
    .get(hashToken(token));
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

function revokeRefreshToken(token) {
  db.prepare(
    `UPDATE refresh_tokens SET revoked_at = datetime('now')
     WHERE token_hash = ? AND revoked_at IS NULL`
  ).run(hashToken(token));
}

module.exports = { issueRefreshToken, findValidRefreshToken, revokeRefreshToken };
