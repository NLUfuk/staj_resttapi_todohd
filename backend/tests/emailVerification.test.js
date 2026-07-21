const request = require('supertest');
const { app, db, resetDb } = require('./helpers');
const mailer = require('../src/utils/mailer');

beforeEach(resetDb);

function extractToken(email) {
  for (let i = mailer.outbox.length - 1; i >= 0; i--) {
    const mail = mailer.outbox[i];
    if (mail.to === email) {
      const match = mail.html.match(/token=([a-f0-9]+)/);
      if (match) return match[1];
    }
  }
  return null;
}

describe('Email verification', () => {
  it('blocks login before verification (403)', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'unverified', email: 'unverified@example.test', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'unverified', password: 'password123' });
    expect(res.status).toBe(403);
  });

  it('allows login after following the verification link', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'toverify', email: 'toverify@example.test', password: 'password123' });

    const token = extractToken('toverify@example.test');
    expect(token).toBeTruthy();

    const verify = await request(app).get('/api/auth/verify').query({ token });
    expect(verify.status).toBe(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'toverify', password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeDefined();
  });

  it('rejects an invalid token', async () => {
    const res = await request(app).get('/api/auth/verify').query({ token: 'not-a-real-token' });
    expect(res.status).toBe(400);
  });

  it('rejects an expired token', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'expireduser', email: 'expired@example.test', password: 'password123' });
    const token = extractToken('expired@example.test');

    db.prepare(
      "UPDATE email_verifications SET expires_at = datetime('now', '-1 hour') WHERE token_hash = ?"
    ).run(require('crypto').createHash('sha256').update(token).digest('hex'));

    const res = await request(app).get('/api/auth/verify').query({ token });
    expect(res.status).toBe(400);
  });

  it('rejects a token that was already used', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'reuseuser', email: 'reuse@example.test', password: 'password123' });
    const token = extractToken('reuse@example.test');

    await request(app).get('/api/auth/verify').query({ token });
    const second = await request(app).get('/api/auth/verify').query({ token });
    expect(second.status).toBe(400);
  });

  it('lets a pre-existing (email-less, grandfathered) user log in without verifying', async () => {
    const bcrypt = require('bcryptjs');
    const info = db
      .prepare(
        `INSERT INTO users (username, password_hash, role, department_id, is_verified)
         VALUES (?, ?, 'user', ?, 1)`
      )
      .run('legacyuser', bcrypt.hashSync('password123', 10), db.genelDepartmentId);
    expect(info.lastInsertRowid).toBeGreaterThan(0);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'legacyuser', password: 'password123' });
    expect(res.status).toBe(200);
  });

  it('resend-verification issues a new token and does not leak whether the email exists', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'resenduser', email: 'resend@example.test', password: 'password123' });

    const firstToken = extractToken('resend@example.test');

    const resend = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'resend@example.test' });
    expect(resend.status).toBe(200);

    const secondToken = extractToken('resend@example.test');
    expect(secondToken).not.toBe(firstToken);

    const verify = await request(app).get('/api/auth/verify').query({ token: secondToken });
    expect(verify.status).toBe(200);

    const unknown = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'nobody@example.test' });
    expect(unknown.status).toBe(200);
  });
});
