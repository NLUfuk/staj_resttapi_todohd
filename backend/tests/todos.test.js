const request = require('supertest');
const { app, resetDb, registerUser } = require('./helpers');

beforeEach(resetDb);

describe('Todos CRUD', () => {
  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/todos');
    expect(res.status).toBe(401);
  });

  it('creates, lists, reads, updates and deletes a todo', async () => {
    const { token } = await registerUser('todouser');
    const auth = { Authorization: `Bearer ${token}` };

    const create = await request(app)
      .post('/api/todos')
      .set(auth)
      .send({ title: 'Buy milk', description: 'whole milk' });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe('pending');
    const todoId = create.body.id;

    const list = await request(app).get('/api/todos').set(auth);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const read = await request(app).get(`/api/todos/${todoId}`).set(auth);
    expect(read.status).toBe(200);
    expect(read.body.title).toBe('Buy milk');

    const update = await request(app)
      .put(`/api/todos/${todoId}`)
      .set(auth)
      .send({ status: 'done' });
    expect(update.status).toBe(200);
    expect(update.body.status).toBe('done');

    const del = await request(app).delete(`/api/todos/${todoId}`).set(auth);
    expect(del.status).toBe(204);

    const readAfterDelete = await request(app).get(`/api/todos/${todoId}`).set(auth);
    expect(readAfterDelete.status).toBe(404);
  });

  it('rejects creating a todo without a title', async () => {
    const { token } = await registerUser('notitle');
    const res = await request(app)
      .post('/api/todos')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'no title here' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid status value on update', async () => {
    const { token } = await registerUser('badstatus');
    const auth = { Authorization: `Bearer ${token}` };
    const create = await request(app).post('/api/todos').set(auth).send({ title: 'x' });

    const res = await request(app)
      .put(`/api/todos/${create.body.id}`)
      .set(auth)
      .send({ status: 'archived' });
    expect(res.status).toBe(400);
  });

  it('isolates todos between users - user B cannot see or modify user A todo', async () => {
    const userA = await registerUser('ownerA');
    const userB = await registerUser('otherB');

    const create = await request(app)
      .post('/api/todos')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ title: 'private todo' });
    const todoId = create.body.id;

    const readAsB = await request(app)
      .get(`/api/todos/${todoId}`)
      .set('Authorization', `Bearer ${userB.token}`);
    expect(readAsB.status).toBe(404);

    const listAsB = await request(app)
      .get('/api/todos')
      .set('Authorization', `Bearer ${userB.token}`);
    expect(listAsB.body).toHaveLength(0);

    const deleteAsB = await request(app)
      .delete(`/api/todos/${todoId}`)
      .set('Authorization', `Bearer ${userB.token}`);
    expect(deleteAsB.status).toBe(404);
  });
});
