const request = require('supertest');
const { app, resetDb, registerUser } = require('./helpers');

beforeEach(resetDb);

describe('POST /api/auth/register', () => {
  it('creates an unverified user and does not return a token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'newuser', email: 'newuser@example.test', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeUndefined();
    expect(res.body.message).toBeDefined();
  });

  it('rejects registration without a valid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'bademail', email: 'not-an-email', password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate usernames', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'dupe', email: 'dupe@example.test', password: 'password123' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'dupe', email: 'dupe2@example.test', password: 'password123' });

    expect(res.status).toBe(409);
  });

  it('rejects duplicate emails', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'emaildupe1', email: 'shared@example.test', password: 'password123' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'emaildupe2', email: 'shared@example.test', password: 'password123' });

    expect(res.status).toBe(409);
  });

  it('rejects short passwords', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'shortpw', email: 'shortpw@example.test', password: '123' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials after verification', async () => {
    const { token } = await registerUser('loginuser');
    expect(token).toBeDefined();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'loginuser', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('rejects wrong password', async () => {
    await registerUser('wrongpw');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'wrongpw', password: 'nope12345' });

    expect(res.status).toBe(401);
  });

  it('rejects unknown username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ghost', password: 'password123' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('requires a valid token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the authenticated user', async () => {
    const { token, user } = await registerUser('meuser');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.username).toBe('meuser');
    expect(res.body.is_verified).toBe(1);
  });

  it('rejects a malformed token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
  });
});
