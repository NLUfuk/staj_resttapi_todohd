const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');

function resetDb() {
  // messages/notifications/audit_logs.user_id have no ON DELETE CASCADE (or,
  // for audit_logs, deliberately SET NULL) tying them to a table that itself
  // gets cascade-cleared here - clear them explicitly before users, or
  // deleting users throws a FOREIGN KEY constraint error. notifications and
  // audit_logs also aren't touched by any other table's cascade, so without
  // this they'd silently leak rows across tests within the same file.
  db.exec(
    `DELETE FROM notifications; DELETE FROM audit_logs; DELETE FROM messages;
     DELETE FROM tickets; DELETE FROM todos; DELETE FROM users;`
  );
  db.exec(
    `DELETE FROM sqlite_sequence WHERE name IN
     ('notifications', 'audit_logs', 'messages', 'tickets', 'todos', 'users');`
  );
}

async function registerUser(username, password = 'password123') {
  const res = await request(app).post('/api/auth/register').send({ username, password });
  return res.body; // { token, user }
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
