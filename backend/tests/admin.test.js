const request = require('supertest');
const { app, resetDb, registerUser, makeAdmin } = require('./helpers');

beforeEach(resetDb);

describe('Admin authorization', () => {
  it('rejects unauthenticated access to admin routes', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });

  it('rejects regular users from admin routes', async () => {
    const { token } = await registerUser('plainuser');
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('Admin: user management', () => {
  it('lists all users', async () => {
    const admin = await makeAdmin('adminuser1');
    await registerUser('regular1');

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body[0].password_hash).toBeUndefined();
  });

  it('promotes a user to admin', async () => {
    const admin = await makeAdmin('adminuser2');
    const { user } = await registerUser('promoteMe');

    const res = await request(app)
      .patch(`/api/admin/users/${user.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('admin');
  });

  it('rejects an invalid role value', async () => {
    const admin = await makeAdmin('adminuser3');
    const { user } = await registerUser('badrole');

    const res = await request(app)
      .patch(`/api/admin/users/${user.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ role: 'superuser' });
    expect(res.status).toBe(400);
  });

  it('deletes a user', async () => {
    const admin = await makeAdmin('adminuser4');
    const { user } = await registerUser('deleteMe');

    const res = await request(app)
      .delete(`/api/admin/users/${user.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(204);
  });

  it('prevents an admin from deleting their own account', async () => {
    const admin = await makeAdmin('adminuser5');
    const res = await request(app)
      .delete(`/api/admin/users/${admin.user.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(400);
  });
});

describe('Admin: todos oversight', () => {
  it('lists todos from every user', async () => {
    const admin = await makeAdmin('adminuser6');
    const user = await registerUser('todoowner');
    await request(app)
      .post('/api/todos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'owned by user' });

    const res = await request(app)
      .get('/api/admin/todos')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].owner_username).toBe('todoowner');
  });

  it('lets admin delete any user\'s todo', async () => {
    const admin = await makeAdmin('adminuser7');
    const user = await registerUser('todoowner2');
    const created = await request(app)
      .post('/api/todos')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'to be moderated' });

    const res = await request(app)
      .delete(`/api/admin/todos/${created.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(204);
  });
});

describe('Admin: helpdesk ticket handling', () => {
  it('lists tickets from every user', async () => {
    const admin = await makeAdmin('adminuser8');
    const user = await registerUser('reporter1');
    await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ subject: 'help', message: 'please help' });

    const res = await request(app)
      .get('/api/admin/tickets')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].reporter_username).toBe('reporter1');
  });

  it('lets admin respond to and close a ticket, after which the reporter can no longer edit it', async () => {
    const admin = await makeAdmin('adminuser9');
    const user = await registerUser('reporter2');
    const created = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ subject: 'help', message: 'please help' });

    const patch = await request(app)
      .patch(`/api/admin/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'closed', admin_response: 'Resolved, see instructions.' });

    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe('closed');
    expect(patch.body.admin_response).toBe('Resolved, see instructions.');

    const editAttempt = await request(app)
      .put(`/api/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ subject: 'trying to edit after close' });
    expect(editAttempt.status).toBe(409);
  });

  it('rejects an invalid ticket status', async () => {
    const admin = await makeAdmin('adminuser10');
    const user = await registerUser('reporter3');
    const created = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ subject: 'help', message: 'please help' });

    const res = await request(app)
      .patch(`/api/admin/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'archived' });
    expect(res.status).toBe(400);
  });
});
