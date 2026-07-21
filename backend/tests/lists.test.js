const request = require('supertest');
const { app, db, resetDb, registerUser } = require('./helpers');

beforeEach(resetDb);

describe('Todo lists', () => {
  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/lists');
    expect(res.status).toBe(401);
  });

  it('creates, lists, reads, renames and deletes a list', async () => {
    const { token } = await registerUser('listuser');
    const auth = { Authorization: `Bearer ${token}` };

    const create = await request(app)
      .post('/api/lists')
      .set(auth)
      .send({ name: 'Elektrik' });
    expect(create.status).toBe(201);
    expect(create.body.name).toBe('Elektrik');
    const listId = create.body.id;

    const list = await request(app).get('/api/lists').set(auth);
    expect(list.status).toBe(200);
    // one "Genel" default list is created lazily on first todo, not on
    // register, so only the explicitly created list shows up here
    expect(list.body).toHaveLength(1);

    const read = await request(app).get(`/api/lists/${listId}`).set(auth);
    expect(read.status).toBe(200);
    expect(read.body.name).toBe('Elektrik');

    const rename = await request(app)
      .patch(`/api/lists/${listId}`)
      .set(auth)
      .send({ name: 'Elektrik Isleri' });
    expect(rename.status).toBe(200);
    expect(rename.body.name).toBe('Elektrik Isleri');

    const del = await request(app).delete(`/api/lists/${listId}`).set(auth);
    expect(del.status).toBe(204);

    const readAfterDelete = await request(app).get(`/api/lists/${listId}`).set(auth);
    expect(readAfterDelete.status).toBe(404);
  });

  it('rejects creating a list without a name', async () => {
    const { token } = await registerUser('noname');
    const res = await request(app)
      .post('/api/lists')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('isolates lists between users - user B cannot see, rename or delete user A list', async () => {
    const userA = await registerUser('ownerA');
    const userB = await registerUser('otherB');

    const create = await request(app)
      .post('/api/lists')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ name: 'Alışveriş' });
    const listId = create.body.id;

    const readAsB = await request(app)
      .get(`/api/lists/${listId}`)
      .set('Authorization', `Bearer ${userB.token}`);
    expect(readAsB.status).toBe(404);

    const renameAsB = await request(app)
      .patch(`/api/lists/${listId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ name: 'hacked' });
    expect(renameAsB.status).toBe(404);

    const deleteAsB = await request(app)
      .delete(`/api/lists/${listId}`)
      .set('Authorization', `Bearer ${userB.token}`);
    expect(deleteAsB.status).toBe(404);

    const itemsAsB = await request(app)
      .get(`/api/lists/${listId}/items`)
      .set('Authorization', `Bearer ${userB.token}`);
    expect(itemsAsB.status).toBe(404);
  });

  it('deleting a list cascades to its todos', async () => {
    const { token } = await registerUser('cascadeuser');
    const auth = { Authorization: `Bearer ${token}` };

    const create = await request(app).post('/api/lists').set(auth).send({ name: 'Alışveriş' });
    const listId = create.body.id;

    const todo = await request(app)
      .post('/api/todos')
      .set(auth)
      .send({ title: 'Süt al', list_id: listId });
    expect(todo.status).toBe(201);
    expect(todo.body.list_id).toBe(listId);

    const items = await request(app).get(`/api/lists/${listId}/items`).set(auth);
    expect(items.body).toHaveLength(1);

    await request(app).delete(`/api/lists/${listId}`).set(auth);

    const readTodo = await request(app).get(`/api/todos/${todo.body.id}`).set(auth);
    expect(readTodo.status).toBe(404);
  });

  it('POST /api/todos without list_id falls back to the user default "Genel" list', async () => {
    const { token } = await registerUser('defaultlistuser');
    const auth = { Authorization: `Bearer ${token}` };

    const todo = await request(app).post('/api/todos').set(auth).send({ title: 'x' });
    expect(todo.status).toBe(201);
    expect(todo.body.list_id).not.toBeNull();

    const list = db.prepare('SELECT * FROM todo_lists WHERE id = ?').get(todo.body.list_id);
    expect(list.name).toBe('Genel');
  });

  it('rejects creating a todo with another user\'s list_id', async () => {
    const userA = await registerUser('listOwnerA');
    const userB = await registerUser('listOtherB');

    const list = await request(app)
      .post('/api/lists')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ name: 'A private list' });

    const res = await request(app)
      .post('/api/todos')
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ title: 'sneaky', list_id: list.body.id });
    expect(res.status).toBe(404);
  });
});
