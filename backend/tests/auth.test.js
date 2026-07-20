const request = require('supertest');
const { app, resetDb } = require('./helpers');

beforeEach(resetDb);

describe('POST /api/auth/register', () => {
  it('creates a new user with role=user and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'newuser', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toMatchObject({ username: 'newuser', role: 'user' });
  });

  it('rejects duplicate usernames', async () => {
    await request(app).post('/api/auth/register').send({ username: 'dupe', password: 'password123' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'dupe', password: 'password123' });

    expect(res.status).toBe(409);
  });

  it('rejects short passwords', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'shortpw', password: '123' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    await request(app).post('/api/auth/register').send({ username: 'loginuser', password: 'password123' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'loginuser', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('rejects wrong password', async () => {
    await request(app).post('/api/auth/register').send({ username: 'wrongpw', password: 'password123' });
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
    const { token, user } = await require('./helpers').registerUser('meuser');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.username).toBe('meuser');
  });

  it('rejects a malformed token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
  });
});
