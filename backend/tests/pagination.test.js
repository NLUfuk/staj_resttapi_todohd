const request = require('supertest');
const { app, resetDb, registerUser, makeAdmin } = require('./helpers');

beforeEach(resetDb);

async function createTodo(auth, overrides = {}) {
  return request(app)
    .post('/api/todos')
    .set(auth)
    .send({ title: 'todo', ...overrides });
}

describe('Todos: due_date + priority', () => {
  it('defaults priority to medium and accepts a due_date', async () => {
    const { token } = await registerUser('todopr1');
    const auth = { Authorization: `Bearer ${token}` };

    const res = await createTodo(auth, { due_date: '2026-08-01' });
    expect(res.status).toBe(201);
    expect(res.body.priority).toBe('medium');
    expect(res.body.due_date).toBe('2026-08-01');
  });

  it('rejects an invalid priority value', async () => {
    const { token } = await registerUser('todopr2');
    const res = await createTodo({ Authorization: `Bearer ${token}` }, { priority: 'urgent' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid due_date value', async () => {
    const { token } = await registerUser('todopr3');
    const res = await createTodo({ Authorization: `Bearer ${token}` }, { due_date: 'not-a-date' });
    expect(res.status).toBe(400);
  });
});

describe('Todos: filtering and sorting', () => {
  it('filters by status and priority together', async () => {
    const { token } = await registerUser('todofilt1');
    const auth = { Authorization: `Bearer ${token}` };
    await createTodo(auth, { title: 'low pending', priority: 'low' });
    const highTodo = await createTodo(auth, { title: 'high pending', priority: 'high' });
    await request(app)
      .put(`/api/todos/${highTodo.body.id}`)
      .set(auth)
      .send({ status: 'done' });

    const res = await request(app)
      .get('/api/todos?status=pending&priority=low')
      .set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('low pending');
  });

  it('sorts by due_date ascending', async () => {
    const { token } = await registerUser('todosort1');
    const auth = { Authorization: `Bearer ${token}` };
    await createTodo(auth, { title: 'later', due_date: '2026-09-01' });
    await createTodo(auth, { title: 'sooner', due_date: '2026-08-01' });

    const res = await request(app)
      .get('/api/todos?sort=due_date&order=asc')
      .set(auth);
    expect(res.status).toBe(200);
    expect(res.body.map((t) => t.title)).toEqual(['sooner', 'later']);
  });

  it('rejects an invalid sort field', async () => {
    const { token } = await registerUser('todosort2');
    const res = await request(app)
      .get('/api/todos?sort=password_hash')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe('Pagination headers', () => {
  it('returns X-Total-Count and a Link header with first/last/next on /api/todos', async () => {
    const { token } = await registerUser('pageuser1');
    const auth = { Authorization: `Bearer ${token}` };
    for (let i = 0; i < 5; i += 1) {
      await createTodo(auth, { title: `todo ${i}` });
    }

    const res = await request(app).get('/api/todos?page=1&limit=2').set(auth);
    expect(res.status).toBe(200);
    expect(res.headers['x-total-count']).toBe('5');
    expect(res.body).toHaveLength(2);
    expect(res.headers.link).toContain('rel="first"');
    expect(res.headers.link).toContain('rel="last"');
    expect(res.headers.link).toContain('rel="next"');
    expect(res.headers.link).not.toContain('rel="prev"');
  });

  it('includes rel="prev" on a later page and omits rel="next" on the last page', async () => {
    const { token } = await registerUser('pageuser2');
    const auth = { Authorization: `Bearer ${token}` };
    for (let i = 0; i < 5; i += 1) {
      await createTodo(auth, { title: `todo ${i}` });
    }

    const res = await request(app).get('/api/todos?page=3&limit=2').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.headers.link).toContain('rel="prev"');
    expect(res.headers.link).not.toContain('rel="next"');
  });

  it('caps limit at 100 even if a larger value is requested', async () => {
    const { token } = await registerUser('pageuser3');
    const res = await request(app)
      .get('/api/todos?limit=9999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers.link).toContain('limit=100');
  });

  it('paginates /api/admin/users', async () => {
    const admin = await makeAdmin('pageadmin1');
    await registerUser('pageadminuser1');
    await registerUser('pageadminuser2');

    const res = await request(app)
      .get('/api/admin/users?page=1&limit=2')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.headers['x-total-count']).toBe('3');
  });

  it('paginates /api/tickets for the authenticated user only', async () => {
    const { token } = await registerUser('pageticketuser');
    const auth = { Authorization: `Bearer ${token}` };
    const deptRes = await request(app).get('/api/departments').set(auth);
    const genelId = deptRes.body.find((d) => d.slug === 'genel').id;

    for (let i = 0; i < 3; i += 1) {
      await request(app)
        .post('/api/tickets')
        .set(auth)
        .send({ subject: `s${i}`, message: `m${i}`, department_id: genelId });
    }

    const res = await request(app).get('/api/tickets?page=1&limit=2').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.headers['x-total-count']).toBe('3');
  });
});
