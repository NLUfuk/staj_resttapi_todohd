const request = require('supertest');
const { app, resetDb, registerUser } = require('./helpers');

beforeEach(resetDb);

describe('Refresh token issuance', () => {
  it('returns a refreshToken alongside the access token on login', async () => {
    const { refreshToken } = await registerUser('refreshuser2');
    expect(typeof refreshToken).toBe('string');
    expect(refreshToken.length).toBeGreaterThan(20);
  });
});

describe('POST /api/auth/refresh', () => {
  it('exchanges a valid refresh token for a new access token', async () => {
    const { refreshToken } = await registerUser('refreshuser3');

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.refreshToken).not.toBe(refreshToken);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.token}`);
    expect(meRes.status).toBe(200);
  });

  it('rotates the token: the old refresh token can no longer be used', async () => {
    const { refreshToken } = await registerUser('refreshuser4');

    await request(app).post('/api/auth/refresh').send({ refreshToken });

    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken });
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
    const { refreshToken } = await registerUser('refreshuser5');

    const logout = await request(app).post('/api/auth/logout').send({ refreshToken });
    expect(logout.status).toBe(204);

    const refreshAttempt = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(refreshAttempt.status).toBe(401);
  });

  it('is idempotent for an already-revoked or unknown token', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: 'unknown-token' });
    expect(res.status).toBe(204);
  });
});
