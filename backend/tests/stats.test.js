const request = require('supertest');
const { app, resetDb, registerUser, makeAdmin, makeDeptLead, getDepartmentId } = require('./helpers');

beforeEach(resetDb);

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('GET /api/admin/stats', () => {
  it('rejects non-admin access', async () => {
    const { token } = await registerUser('statsuser1');
    const res = await request(app).get('/api/admin/stats').set(auth(token));
    expect(res.status).toBe(403);
  });

  it('rejects dept_lead access (admin only)', async () => {
    const lead = await makeDeptLead('statsdeptlead1', 'donanim');
    const res = await request(app).get('/api/admin/stats').set(auth(lead.token));
    expect(res.status).toBe(403);
  });

  it('reports ticket counts per department, todos per user and message volume', async () => {
    const admin = await makeAdmin('statsadmin1');
    const reporter = await registerUser('statsreporter1');

    await request(app)
      .post('/api/tickets')
      .set(auth(reporter.token))
      .send({ subject: 'a', message: 'a', department_id: getDepartmentId('donanim') });
    const closedTicket = await request(app)
      .post('/api/tickets')
      .set(auth(reporter.token))
      .send({ subject: 'b', message: 'b', department_id: getDepartmentId('donanim') });
    await request(app)
      .patch(`/api/admin/tickets/${closedTicket.body.id}`)
      .set(auth(admin.token))
      .send({ status: 'closed' });

    await request(app)
      .post('/api/todos')
      .set(auth(reporter.token))
      .send({ title: 'a todo' });

    const genelRes = await request(app).get('/api/channels').set(auth(reporter.token));
    const genelId = genelRes.body.find((c) => c.name === 'genel').id;
    await request(app)
      .post(`/api/channels/${genelId}/messages`)
      .set(auth(reporter.token))
      .send({ body: 'hello' });

    const res = await request(app).get('/api/admin/stats').set(auth(admin.token));
    expect(res.status).toBe(200);

    const donanim = res.body.ticketsByDepartment.find((d) => d.department === 'donanim');
    expect(donanim.open).toBe(1);
    expect(donanim.closed).toBe(1);

    expect(typeof res.body.avgTicketClosureHours).toBe('number');

    const reporterStats = res.body.todosPerUser.find((u) => u.username === 'statsreporter1');
    expect(reporterStats.todo_count).toBe(1);

    const genelVolume = res.body.messageVolumeLast7Days.find((c) => c.channel === 'genel');
    expect(genelVolume.message_count).toBe(1);
    expect(res.body.totalMessagesLast7Days).toBeGreaterThanOrEqual(1);
  });

  it('returns null average closure time when no tickets have been closed', async () => {
    const admin = await makeAdmin('statsadmin2');
    const res = await request(app).get('/api/admin/stats').set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.avgTicketClosureHours).toBeNull();
  });
});
