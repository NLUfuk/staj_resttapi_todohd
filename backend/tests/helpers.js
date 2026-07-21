const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const db = require('../src/db');
const mailer = require('../src/utils/mailer');
const { jwtSecret, jwtExpiresIn } = require('../src/config');
const { issueRefreshToken } = require('../src/utils/refreshToken');

function resetDb() {
  // messages/notifications/audit_logs.user_id have no ON DELETE CASCADE (or,
  // for audit_logs, deliberately SET NULL) tying them to a table that itself
  // gets cascade-cleared here - clear them explicitly before users, or
  // deleting users throws a FOREIGN KEY constraint error. notifications and
  // audit_logs also aren't touched by any other table's cascade, so without
  // this they'd silently leak rows across tests within the same file.
  // assignment_events/assignments/todo_lists/email_verifications are cleared
  // explicitly too (children before parents) so no assignment/list state
  // leaks between tests even though they do cascade from users/todos.
  db.exec(
    `DELETE FROM assignment_events; DELETE FROM assignments;
     DELETE FROM email_verifications; DELETE FROM notifications;
     DELETE FROM audit_logs; DELETE FROM messages;
     DELETE FROM tickets; DELETE FROM todos; DELETE FROM todo_lists;
     DELETE FROM users;`
  );
  db.exec(
    `DELETE FROM sqlite_sequence WHERE name IN
     ('assignment_events', 'assignments', 'email_verifications', 'notifications',
      'audit_logs', 'messages', 'tickets', 'todos', 'todo_lists', 'users');`
  );
}

// Finds the verification link mailer.js "sent" (test-only outbox, see
// utils/mailer.js) for the given address and pulls the token out of it -
// verification tokens are deliberately never returned in any API response.
function extractVerificationToken(email) {
  for (let i = mailer.outbox.length - 1; i >= 0; i--) {
    const mail = mailer.outbox[i];
    if (mail.to === email) {
      const match = mail.html.match(/token=([a-f0-9]+)/);
      if (match) return match[1];
    }
  }
  return null;
}

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, jwtSecret, {
    expiresIn: jwtExpiresIn,
  });
}

// Registers and verifies (via the mailer outbox) over real HTTP - that part
// exercises the actual register/verify endpoints. Token issuance is then
// done in-process the same way POST /api/auth/login does it, instead of
// calling that route over HTTP: /api/auth/login sits behind a strict 10-
// per-15-minutes-per-IP rate limiter that stays tight even in NODE_ENV=test
// (see security.test.js's brute-force test, which depends on that), and
// every test file that creates more than ~10 users via this helper would
// otherwise start tripping it.
async function registerUser(username, password = 'password123') {
  const email = `${username}@example.test`;
  await request(app).post('/api/auth/register').send({ username, email, password });
  const verifyToken = extractVerificationToken(email);
  await request(app).get('/api/auth/verify').query({ token: verifyToken });

  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  const user = { id: row.id, username: row.username, role: row.role };
  return {
    token: signToken(user),
    refreshToken: issueRefreshToken(row.id),
    user,
  };
}

async function makeAdmin(username, password = 'password123') {
  const { token, user } = await registerUser(username, password);
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', user.id);
  // role changed directly in DB, so re-login to get a token with role=admin
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res.body;
}

async function makeDeptLead(username, deptSlug, password = 'password123') {
  const { token, user } = await registerUser(username, password);
  const deptId = db.prepare('SELECT id FROM departments WHERE slug = ?').get(deptSlug).id;
  db.prepare('UPDATE users SET role = ?, department_id = ? WHERE id = ?').run(
    'dept_lead',
    deptId,
    user.id
  );
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res.body;
}

function getDepartmentId(slug = 'genel') {
  return db.prepare('SELECT id FROM departments WHERE slug = ?').get(slug).id;
}

module.exports = {
  app,
  db,
  resetDb,
  registerUser,
  makeAdmin,
  makeDeptLead,
  getDepartmentId,
};
