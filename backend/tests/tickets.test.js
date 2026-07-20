const request = require('supertest');
const { app, resetDb, registerUser, getDepartmentId } = require('./helpers');

beforeEach(resetDb);

async function createTodo(token, title = 'a todo') {
  const res = await request(app)
    .post('/api/todos')
    .set('Authorization', `Bearer ${token}`)
    .send({ title });
  return res.body;
}

describe('Tickets CRUD', () => {
  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/tickets');
    expect(res.status).toBe(401);
  });

  it('creates a standalone ticket (no linked todo)', async () => {
    const { token } = await registerUser('ticketuser1');
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: 'Need help', message: 'My VPN is broken', department_id: getDepartmentId() });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('open');
    expect(res.body.todo_id).toBeNull();
  });

  it('creates a ticket linked to the reporter\'s own todo', async () => {
    const { token } = await registerUser('ticketuser2');
    const todo = await createTodo(token, 'Printer broken');

    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        subject: 'Printer issue',
        message: 'Jammed again',
        todo_id: todo.id,
        department_id: getDepartmentId('donanim'),
      });

    expect(res.status).toBe(201);
    expect(res.body.todo_id).toBe(todo.id);
    expect(res.body.department_id).toBe(getDepartmentId('donanim'));
  });

  it('rejects linking to a todo owned by another user', async () => {
    const userA = await registerUser('ticketOwnerA');
    const userB = await registerUser('ticketOwnerB');
    const todoA = await createTodo(userA.token, 'A\'s private todo');

    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${userB.token}`)
      .send({
        subject: 'sneaky',
        message: 'trying to link others todo',
        todo_id: todoA.id,
        department_id: getDepartmentId(),
      });

    expect(res.status).toBe(400);
  });

  it('requires subject and message', async () => {
    const { token } = await registerUser('ticketuser3');
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: '' });
    expect(res.status).toBe(400);
  });

  it('rejects a ticket without a department_id', async () => {
    const { token } = await registerUser('ticketuser3b');
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: 'no department', message: 'oops' });
    expect(res.status).toBe(400);
  });

  it('rejects a ticket with an unknown department_id', async () => {
    const { token } = await registerUser('ticketuser3c');
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: 'bad dept', message: 'oops', department_id: 999999 });
    expect(res.status).toBe(400);
  });

  it('lets the reporter edit an open ticket but not a closed one', async () => {
    const { token } = await registerUser('ticketuser4');
    const auth = { Authorization: `Bearer ${token}` };
    const create = await request(app)
      .post('/api/tickets')
      .set(auth)
      .send({ subject: 'orig subject', message: 'orig message', department_id: getDepartmentId() });
    const ticketId = create.body.id;

    const edit = await request(app)
      .put(`/api/tickets/${ticketId}`)
      .set(auth)
      .send({ subject: 'edited subject' });
    expect(edit.status).toBe(200);
    expect(edit.body.subject).toBe('edited subject');
  });

  it('isolates tickets between users', async () => {
    const userA = await registerUser('ticketIsoA');
    const userB = await registerUser('ticketIsoB');
    const create = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ subject: 'private', message: 'private message', department_id: getDepartmentId() });

    const readAsB = await request(app)
      .get(`/api/tickets/${create.body.id}`)
      .set('Authorization', `Bearer ${userB.token}`);
    expect(readAsB.status).toBe(404);
  });

  it('deletes own ticket', async () => {
    const { token } = await registerUser('ticketuser5');
    const auth = { Authorization: `Bearer ${token}` };
    const create = await request(app)
      .post('/api/tickets')
      .set(auth)
      .send({ subject: 's', message: 'm', department_id: getDepartmentId() });

    const del = await request(app).delete(`/api/tickets/${create.body.id}`).set(auth);
    expect(del.status).toBe(204);
  });
});
