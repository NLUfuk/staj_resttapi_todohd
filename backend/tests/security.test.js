const request = require('supertest');
const { app, resetDb, registerUser } = require('./helpers');

beforeEach(resetDb);

describe('Security headers (helmet)', () => {
  it('sets Strict-Transport-Security and X-Content-Type-Options on responses', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('CORS', () => {
  it('does not send an Access-Control-Allow-Origin header for a disallowed origin', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil-origin.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sends an Access-Control-Allow-Origin header for an allowed origin', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5500');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5500');
  });
});

describe('Login rate limiting (brute-force protection)', () => {
  it('returns 429 with RateLimit/Retry-After headers on the 11th attempt within the window', async () => {
    await registerUser('bruteforced', 'correctpassword');

    let lastRes;
    for (let i = 0; i < 10; i += 1) {
      lastRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'bruteforced', password: 'wrongpassword' });
      expect(lastRes.status).toBe(401);
    }

    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ username: 'bruteforced', password: 'wrongpassword' });

    expect(blocked.status).toBe(429);
    expect(blocked.headers['ratelimit-limit']).toBeDefined();
    expect(blocked.headers['ratelimit-remaining']).toBeDefined();
    expect(blocked.headers['ratelimit-reset']).toBeDefined();
    expect(blocked.headers['retry-after']).toBeDefined();
  });
});
