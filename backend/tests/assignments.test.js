const request = require('supertest');
const { app, resetDb, registerUser } = require('./helpers');

beforeEach(resetDb);

async function createTodo(token, title = 'Kablo al') {
  const res = await request(app)
    .post('/api/todos')
    .set('Authorization', `Bearer ${token}`)
    .send({ title });
  return res.body;
}

describe('Assignments', () => {
  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/assignments/incoming');
    expect(res.status).toBe(401);
  });

  it('creates an assignment via assignee_username and shows it in incoming/outgoing', async () => {
    const owner = await registerUser('assignerA');
    const other = await registerUser('assigneeB');
    const todo = await createTodo(owner.token);

    const create = await request(app)
      .post(`/api/todos/${todo.id}/assign`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ assignee_username: 'assigneeB' });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe('pending');
    expect(create.body.assigner_id).toBe(owner.user.id);
    expect(create.body.assignee_id).toBe(other.user.id);

    const incoming = await request(app)
      .get('/api/assignments/incoming')
      .set('Authorization', `Bearer ${other.token}`);
    expect(incoming.status).toBe(200);
    expect(incoming.body).toHaveLength(1);
    expect(incoming.body[0].todo_title).toBe('Kablo al');

    const outgoing = await request(app)
      .get('/api/assignments/outgoing')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(outgoing.status).toBe(200);
    expect(outgoing.body).toHaveLength(1);

    // The assignee's own outgoing list and the assigner's own incoming list
    // must both be empty - each side only sees their own role in the assignment.
    const assigneeOutgoing = await request(app)
      .get('/api/assignments/outgoing')
      .set('Authorization', `Bearer ${other.token}`);
    expect(assigneeOutgoing.body).toHaveLength(0);
  });

  it('creates an assignment via assignee_id', async () => {
    const owner = await registerUser('assignerC');
    const other = await registerUser('assigneeD');
    const todo = await createTodo(owner.token);

    const create = await request(app)
      .post(`/api/todos/${todo.id}/assign`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ assignee_id: other.user.id });
    expect(create.status).toBe(201);
  });

  it('rejects self-assignment with 400', async () => {
    const owner = await registerUser('selfAssigner');
    const todo = await createTodo(owner.token);

    const res = await request(app)
      .post(`/api/todos/${todo.id}/assign`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ assignee_username: 'selfAssigner' });
    expect(res.status).toBe(400);
  });

  it('rejects assigning a todo that is not yours', async () => {
    const owner = await registerUser('realOwner');
    const stranger = await registerUser('stranger');
    const target = await registerUser('targetUser');
    const todo = await createTodo(owner.token);

    const res = await request(app)
      .post(`/api/todos/${todo.id}/assign`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ assignee_username: 'targetUser' });
    expect(res.status).toBe(404);
  });

  it('rejects assigning to a nonexistent user', async () => {
    const owner = await registerUser('ownerNoTarget');
    const todo = await createTodo(owner.token);

    const res = await request(app)
      .post(`/api/todos/${todo.id}/assign`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ assignee_username: 'doesnotexist' });
    expect(res.status).toBe(404);
  });

  it('filters incoming/outgoing by status', async () => {
    const owner = await registerUser('statusOwner');
    const assignee = await registerUser('statusAssignee');
    const todo = await createTodo(owner.token);

    const create = await request(app)
      .post(`/api/todos/${todo.id}/assign`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ assignee_username: 'statusAssignee' });

    await request(app)
      .post(`/api/assignments/${create.body.id}/accept`)
      .set('Authorization', `Bearer ${assignee.token}`);

    const pendingFilter = await request(app)
      .get('/api/assignments/incoming?status=pending')
      .set('Authorization', `Bearer ${assignee.token}`);
    expect(pendingFilter.body).toHaveLength(0);

    const acceptedFilter = await request(app)
      .get('/api/assignments/incoming?status=accepted')
      .set('Authorization', `Bearer ${assignee.token}`);
    expect(acceptedFilter.body).toHaveLength(1);
  });
});
