const request = require('supertest');
const { app, resetDb, registerUser, makeAdmin, getDepartmentId, db } = require('./helpers');

beforeEach(resetDb);

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('Notification: ticket comment', () => {
  it('notifies the reporter when an admin comments on their ticket', async () => {
    const admin = await makeAdmin('notifyadmin1');
    const reporter = await registerUser('notifyreporter1');
    const ticket = await request(app)
      .post('/api/tickets')
      .set(auth(reporter.token))
      .send({ subject: 'help', message: 'please', department_id: getDepartmentId() });

    await request(app)
      .post(`/api/tickets/${ticket.body.id}/comments`)
      .set(auth(admin.token))
      .send({ body: 'looking into it' });

    const res = await request(app).get('/api/notifications').set(auth(reporter.token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe('ticket_comment');
    expect(res.body[0].read_at).toBeNull();
  });

  it('does not notify anyone when the reporter comments on their own ticket', async () => {
    const reporter = await registerUser('notifyreporter2');
    const ticket = await request(app)
      .post('/api/tickets')
      .set(auth(reporter.token))
      .send({ subject: 'help', message: 'please', department_id: getDepartmentId() });

    await request(app)
      .post(`/api/tickets/${ticket.body.id}/comments`)
      .set(auth(reporter.token))
      .send({ body: 'still waiting' });

    const res = await request(app).get('/api/notifications').set(auth(reporter.token));
    expect(res.body).toHaveLength(0);
  });
});

describe('Notification: ticket status change', () => {
  it('notifies the reporter when an admin changes the ticket status', async () => {
    const admin = await makeAdmin('notifyadmin2');
    const reporter = await registerUser('notifyreporter3');
    const ticket = await request(app)
      .post('/api/tickets')
      .set(auth(reporter.token))
      .send({ subject: 'help', message: 'please', department_id: getDepartmentId() });

    await request(app)
      .patch(`/api/admin/tickets/${ticket.body.id}`)
      .set(auth(admin.token))
      .send({ status: 'in_progress' });

    const res = await request(app).get('/api/notifications').set(auth(reporter.token));
    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe('ticket_status');
  });
});

describe('Notification: chat mention', () => {
  it('notifies a mentioned user in a public channel message', async () => {
    const { token: senderToken } = await registerUser('mentionsender');
    const { token: mentionedToken } = await registerUser('mentionedUser');
    const genelId = db.prepare('SELECT id FROM channels WHERE name = ?').get('genel').id;

    await request(app)
      .post(`/api/channels/${genelId}/messages`)
      .set(auth(senderToken))
      .send({ body: 'hey @mentionedUser can you check this?' });

    const res = await request(app).get('/api/notifications').set(auth(mentionedToken));
    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe('mention');
  });

  it('does not notify the sender for mentioning themselves', async () => {
    const { token } = await registerUser('mentionself');
    const genelId = db.prepare('SELECT id FROM channels WHERE name = ?').get('genel').id;

    await request(app)
      .post(`/api/channels/${genelId}/messages`)
      .set(auth(token))
      .send({ body: '@mentionself note to self' });

    const res = await request(app).get('/api/notifications').set(auth(token));
    expect(res.body).toHaveLength(0);
  });

  it('silently ignores a mention of a non-existent username', async () => {
    const { token } = await registerUser('mentionghost');
    const genelId = db.prepare('SELECT id FROM channels WHERE name = ?').get('genel').id;

    const res = await request(app)
      .post(`/api/channels/${genelId}/messages`)
      .set(auth(token))
      .send({ body: '@nosuchuser hello?' });
    expect(res.status).toBe(201);
  });
});

describe('Notification read state', () => {
  it('filters unread notifications with ?unread=true', async () => {
    const admin = await makeAdmin('notifyadmin3');
    const reporter = await registerUser('notifyreporter4');
    const ticket = await request(app)
      .post('/api/tickets')
      .set(auth(reporter.token))
      .send({ subject: 'help', message: 'please', department_id: getDepartmentId() });
    await request(app)
      .patch(`/api/admin/tickets/${ticket.body.id}`)
      .set(auth(admin.token))
      .send({ status: 'in_progress' });

    const list = await request(app).get('/api/notifications').set(auth(reporter.token));
    const notifId = list.body[0].id;

    await request(app).patch(`/api/notifications/${notifId}/read`).set(auth(reporter.token));

    const unread = await request(app)
      .get('/api/notifications?unread=true')
      .set(auth(reporter.token));
    expect(unread.body).toHaveLength(0);
  });

  it('marks a single notification as read', async () => {
    const admin = await makeAdmin('notifyadmin4');
    const reporter = await registerUser('notifyreporter5');
    const ticket = await request(app)
      .post('/api/tickets')
      .set(auth(reporter.token))
      .send({ subject: 'help', message: 'please', department_id: getDepartmentId() });
    await request(app)
      .patch(`/api/admin/tickets/${ticket.body.id}`)
      .set(auth(admin.token))
      .send({ status: 'closed' });

    const list = await request(app).get('/api/notifications').set(auth(reporter.token));
    const notifId = list.body[0].id;

    const res = await request(app)
      .patch(`/api/notifications/${notifId}/read`)
      .set(auth(reporter.token));
    expect(res.status).toBe(200);
    expect(res.body.read_at).not.toBeNull();
  });

  it('rejects marking another user\'s notification as read (404)', async () => {
    const admin = await makeAdmin('notifyadmin5');
    const reporter = await registerUser('notifyreporter6');
    const stranger = await registerUser('notifystranger1');
    const ticket = await request(app)
      .post('/api/tickets')
      .set(auth(reporter.token))
      .send({ subject: 'help', message: 'please', department_id: getDepartmentId() });
    await request(app)
      .patch(`/api/admin/tickets/${ticket.body.id}`)
      .set(auth(admin.token))
      .send({ status: 'in_progress' });

    const list = await request(app).get('/api/notifications').set(auth(reporter.token));
    const notifId = list.body[0].id;

    const res = await request(app)
      .patch(`/api/notifications/${notifId}/read`)
      .set(auth(stranger.token));
    expect(res.status).toBe(404);
  });

  it('marks all notifications as read with read-all', async () => {
    const admin = await makeAdmin('notifyadmin6');
    const reporter = await registerUser('notifyreporter7');
    const ticket = await request(app)
      .post('/api/tickets')
      .set(auth(reporter.token))
      .send({ subject: 'help', message: 'please', department_id: getDepartmentId() });
    await request(app)
      .patch(`/api/admin/tickets/${ticket.body.id}`)
      .set(auth(admin.token))
      .send({ status: 'in_progress' });
    await request(app)
      .patch(`/api/admin/tickets/${ticket.body.id}`)
      .set(auth(admin.token))
      .send({ status: 'closed' });

    const readAll = await request(app)
      .patch('/api/notifications/read-all')
      .set(auth(reporter.token));
    expect(readAll.status).toBe(204);

    const unread = await request(app)
      .get('/api/notifications?unread=true')
      .set(auth(reporter.token));
    expect(unread.body).toHaveLength(0);
  });
});
