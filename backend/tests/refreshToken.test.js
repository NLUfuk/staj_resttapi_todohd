const request = require('supertest');
const { app, resetDb, registerUser } = require('./helpers');

beforeEach(resetDb);

describe('Refresh token issuance', () => {
  it('returns a refreshToken alongside the access token on register', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'refreshuser1', password: 'password123' });
    expect(res.status).toBe(201);
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.refreshToken.length).toBeGreaterThan(20);
  });

  it('returns a refreshToken alongside the access token on login', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'refreshuser2', password: 'password123' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'refreshuser2', password: 'password123' });
    expect(res.status).toBe(200);
    expect(typeof res.body.refreshToken).toBe('string');
  });
});

describe('POST /api/auth/refresh', () => {
  it('exchanges a valid refresh token for a new access token', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ username: 'refreshuser3', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: registerRes.body.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.refreshToken).not.toBe(registerRes.body.refreshToken);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.token}`);
    expect(meRes.status).toBe(200);
  });

  it('rotates the token: the old refresh token can no longer be used', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ username: 'refreshuser4', password: 'password123' });

    await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: registerRes.body.refreshToken });

    const reuse = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: registerRes.body.refreshToken });
    expect(reuse.status).toBe(401);
  });

  it('rejects an unknown refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'not-a-real-token' });
    expect(res.status).toBe(401);
  });

  it('rejects a missing refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the refresh token so it can no longer be used', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ username: 'refreshuser5', password: 'password123' });

    const logout = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: registerRes.body.refreshToken });
    expect(logout.status).toBe(204);

    const refreshAttempt = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: registerRes.body.refreshToken });
    expect(refreshAttempt.status).toBe(401);
  });

  it('is idempotent for an already-revoked or unknown token', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: 'unknown-token' });
    expect(res.status).toBe(204);
  });
});
