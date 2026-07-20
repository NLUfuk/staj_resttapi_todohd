const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');

function resetDb() {
  db.exec('DELETE FROM tickets; DELETE FROM todos; DELETE FROM users;');
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('tickets', 'todos', 'users');");
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

module.exports = { app, db, resetDb, registerUser, makeAdmin };
