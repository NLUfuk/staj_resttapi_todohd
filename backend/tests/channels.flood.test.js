const request = require('supertest');
const { app, resetDb, registerUser, db } = require('./helpers');

// Isolated in its own file: the per-user message rate limiter is a
// module-level (process-lifetime) in-memory store, and this suite's
// resetDb() resets the users' AUTOINCREMENT sequence between tests, so a
// later test's user can reuse an earlier test's user id and inherit its
// leftover hit count. Keeping this the only test in the file sidesteps that
// (Jest gives each test file its own module registry, so the limiter store
// starts fresh here regardless of what ran in channels.test.js).
beforeEach(resetDb);

describe('Message flood rate limiting', () => {
  it('returns 429 after 30 messages/minute from the same user', async () => {
    const { token } = await registerUser('floodchanuser');
    const genelId = db.prepare('SELECT id FROM channels WHERE name = ?').get('genel').id;

    let lastStatus;
    for (let i = 0; i < 30; i += 1) {
      const res = await request(app)
        .post(`/api/channels/${genelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: `flood ${i}` });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(201);

    const blocked = await request(app)
      .post(`/api/channels/${genelId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'one too many' });
    expect(blocked.status).toBe(429);
  });
});
