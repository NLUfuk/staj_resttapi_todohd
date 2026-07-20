const request = require('supertest');
const { app, resetDb, registerUser, makeAdmin, getDepartmentId } = require('./helpers');

beforeEach(resetDb);

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('GET /api/admin/audit-logs', () => {
  it('rejects non-admin access', async () => {
    const { token } = await registerUser('audituser1');
    const res = await request(app).get('/api/admin/audit-logs').set(auth(token));
    expect(res.status).toBe(403);
  });

  it('logs a role change', async () => {
    const admin = await makeAdmin('auditadmin1');
    const { user } = await registerUser('audittarget1');

    await request(app)
      .patch(`/api/admin/users/${user.id}`)
      .set(auth(admin.token))
      .send({ role: 'admin' });

    const res = await request(app).get('/api/admin/audit-logs').set(auth(admin.token));
    expect(res.status).toBe(200);
    const entry = res.body.find((l) => l.action === 'role.change');
    expect(entry).toBeDefined();
    expect(entry.target).toBe(`users:${user.id}`);
    expect(entry.actor_username).toBe('auditadmin1');
  });

  it('does not log a no-op department reassignment as a role change', async () => {
    const admin = await makeAdmin('auditadmin2');
    const { user } = await registerUser('audittarget2');

    await request(app)
      .patch(`/api/admin/users/${user.id}`)
      .set(auth(admin.token))
      .send({ department_id: getDepartmentId('donanim') });

    const res = await request(app).get('/api/admin/audit-logs').set(auth(admin.token));
    expect(res.body.find((l) => l.action === 'role.change')).toBeUndefined();
  });

  it('logs a user deletion', async () => {
    const admin = await makeAdmin('auditadmin3');
    const { user } = await registerUser('audittarget3');

    await request(app).delete(`/api/admin/users/${user.id}`).set(auth(admin.token));

    const res = await request(app).get('/api/admin/audit-logs').set(auth(admin.token));
    expect(res.body.find((l) => l.action === 'user.delete' && l.target === `users:${user.id}`)).toBeDefined();
  });

  it('logs a ticket close but not other status changes', async () => {
    const admin = await makeAdmin('auditadmin4');
    const reporter = await registerUser('auditreporter1');
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

    const res = await request(app).get('/api/admin/audit-logs').set(auth(admin.token));
    const closeEntries = res.body.filter((l) => l.action === 'ticket.close');
    expect(closeEntries).toHaveLength(1);
  });

  it('logs a department deletion', async () => {
    const admin = await makeAdmin('auditadmin5');
    const created = await request(app)
      .post('/api/departments')
      .set(auth(admin.token))
      .send({ name: 'Gecici' });

    await request(app).delete(`/api/departments/${created.body.id}`).set(auth(admin.token));

    const res = await request(app).get('/api/admin/audit-logs').set(auth(admin.token));
    expect(
      res.body.find((l) => l.action === 'department.delete' && l.target === `departments:${created.body.id}`)
    ).toBeDefined();
  });

  it('paginates audit log entries', async () => {
    const admin = await makeAdmin('auditadmin6');
    for (let i = 0; i < 3; i += 1) {
      const created = await request(app)
        .post('/api/departments')
        .set(auth(admin.token))
        .send({ name: `Temp${i}` });
      await request(app).delete(`/api/departments/${created.body.id}`).set(auth(admin.token));
    }

    const res = await request(app)
      .get('/api/admin/audit-logs?page=1&limit=2')
      .set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.headers['x-total-count']).toBe('3');
  });
});
