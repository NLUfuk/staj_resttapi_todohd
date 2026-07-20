const request = require('supertest');
const { app, resetDb, registerUser, makeAdmin, makeDeptLead, getDepartmentId } = require('./helpers');

beforeEach(resetDb);

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function createTicket(reporterToken, deptSlug) {
  return request(app)
    .post('/api/tickets')
    .set(auth(reporterToken))
    .send({ subject: 'help', message: 'please', department_id: getDepartmentId(deptSlug) });
}

describe('dept_lead: ticket scope', () => {
  it('rejects plain users from admin ticket routes', async () => {
    const { token } = await registerUser('deptlead_plain1');
    const res = await request(app).get('/api/admin/tickets').set(auth(token));
    expect(res.status).toBe(403);
  });

  it('rejects dept_lead from user/todo management routes', async () => {
    const lead = await makeDeptLead('deptlead1', 'donanim');
    const usersRes = await request(app).get('/api/admin/users').set(auth(lead.token));
    expect(usersRes.status).toBe(403);

    const todosRes = await request(app).get('/api/admin/todos').set(auth(lead.token));
    expect(todosRes.status).toBe(403);

    const auditRes = await request(app).get('/api/admin/audit-logs').set(auth(lead.token));
    expect(auditRes.status).toBe(403);
  });

  it('lets a dept_lead list only tickets in their own department', async () => {
    const lead = await makeDeptLead('deptlead2', 'donanim');
    const reporter = await registerUser('deptleadreporter1');
    await createTicket(reporter.token, 'donanim');
    await createTicket(reporter.token, 'muhasebe');

    const res = await request(app).get('/api/admin/tickets').set(auth(lead.token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('rejects a dept_lead requesting a department filter that is not their own', async () => {
    const lead = await makeDeptLead('deptlead3', 'donanim');
    const res = await request(app)
      .get('/api/admin/tickets?department=muhasebe')
      .set(auth(lead.token));
    expect(res.status).toBe(403);
  });

  it('lets a dept_lead view and update a ticket in their own department', async () => {
    const lead = await makeDeptLead('deptlead4', 'donanim');
    const reporter = await registerUser('deptleadreporter2');
    const ticket = await createTicket(reporter.token, 'donanim');

    const read = await request(app)
      .get(`/api/admin/tickets/${ticket.body.id}`)
      .set(auth(lead.token));
    expect(read.status).toBe(200);

    const patch = await request(app)
      .patch(`/api/admin/tickets/${ticket.body.id}`)
      .set(auth(lead.token))
      .send({ status: 'in_progress' });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe('in_progress');
  });

  it('forbids a dept_lead from viewing or updating a ticket in another department (403)', async () => {
    const lead = await makeDeptLead('deptlead5', 'donanim');
    const reporter = await registerUser('deptleadreporter3');
    const ticket = await createTicket(reporter.token, 'muhasebe');

    const read = await request(app)
      .get(`/api/admin/tickets/${ticket.body.id}`)
      .set(auth(lead.token));
    expect(read.status).toBe(403);

    const patch = await request(app)
      .patch(`/api/admin/tickets/${ticket.body.id}`)
      .set(auth(lead.token))
      .send({ status: 'closed' });
    expect(patch.status).toBe(403);
  });

  it('forbids a dept_lead from deleting a ticket even in their own department', async () => {
    const lead = await makeDeptLead('deptlead6', 'donanim');
    const reporter = await registerUser('deptleadreporter4');
    const ticket = await createTicket(reporter.token, 'donanim');

    const res = await request(app)
      .delete(`/api/admin/tickets/${ticket.body.id}`)
      .set(auth(lead.token));
    expect(res.status).toBe(403);
  });

  it('lets an admin promote a user to dept_lead', async () => {
    const admin = await makeAdmin('deptleadadmin1');
    const { user } = await registerUser('futuredeptlead1');

    const res = await request(app)
      .patch(`/api/admin/users/${user.id}`)
      .set(auth(admin.token))
      .send({ role: 'dept_lead' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('dept_lead');
  });

  it('lets a dept_lead comment on a ticket in their own department', async () => {
    const lead = await makeDeptLead('deptlead7', 'donanim');
    const reporter = await registerUser('deptleadreporter5');
    const ticket = await createTicket(reporter.token, 'donanim');

    const res = await request(app)
      .post(`/api/tickets/${ticket.body.id}/comments`)
      .set(auth(lead.token))
      .send({ body: 'we are on it' });
    expect(res.status).toBe(201);
  });
});
