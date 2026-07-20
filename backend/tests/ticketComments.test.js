const request = require('supertest');
const { app, resetDb, registerUser, makeAdmin, getDepartmentId } = require('./helpers');

beforeEach(resetDb);

async function createTicket(auth, overrides = {}) {
  return request(app)
    .post('/api/tickets')
    .set(auth)
    .send({ subject: 'help', message: 'please help', department_id: getDepartmentId(), ...overrides });
}

describe('Ticket comments', () => {
  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/tickets/1/comments');
    expect(res.status).toBe(401);
  });

  it('lets the reporter post and list comments on their own ticket', async () => {
    const { token } = await registerUser('commenter1');
    const auth = { Authorization: `Bearer ${token}` };
    const ticket = await createTicket(auth);

    const post = await request(app)
      .post(`/api/tickets/${ticket.body.id}/comments`)
      .set(auth)
      .send({ body: 'any update?' });
    expect(post.status).toBe(201);
    expect(post.body.body).toBe('any update?');
    expect(post.body.username).toBe('commenter1');

    const list = await request(app).get(`/api/tickets/${ticket.body.id}/comments`).set(auth);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  it('lets an admin comment on and read comments for a ticket they do not own', async () => {
    const admin = await makeAdmin('commentadmin1');
    const reporter = await registerUser('commentreporter1');
    const ticket = await createTicket({ Authorization: `Bearer ${reporter.token}` });

    const post = await request(app)
      .post(`/api/tickets/${ticket.body.id}/comments`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ body: 'looking into it' });
    expect(post.status).toBe(201);

    const list = await request(app)
      .get(`/api/tickets/${ticket.body.id}/comments`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  it('isolates comments: another user cannot see or post to a ticket they do not own (404)', async () => {
    const owner = await registerUser('commentowner1');
    const stranger = await registerUser('commentstranger1');
    const ticket = await createTicket({ Authorization: `Bearer ${owner.token}` });

    const readAttempt = await request(app)
      .get(`/api/tickets/${ticket.body.id}/comments`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(readAttempt.status).toBe(404);

    const postAttempt = await request(app)
      .post(`/api/tickets/${ticket.body.id}/comments`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ body: 'sneaky' });
    expect(postAttempt.status).toBe(404);
  });

  it('rejects an empty comment body', async () => {
    const { token } = await registerUser('commenter2');
    const auth = { Authorization: `Bearer ${token}` };
    const ticket = await createTicket(auth);

    const res = await request(app)
      .post(`/api/tickets/${ticket.body.id}/comments`)
      .set(auth)
      .send({ body: '   ' });
    expect(res.status).toBe(400);
  });

  it('refuses new comments on a closed ticket (409)', async () => {
    const admin = await makeAdmin('commentadmin2');
    const reporter = await registerUser('commentreporter2');
    const ticket = await createTicket({ Authorization: `Bearer ${reporter.token}` });

    await request(app)
      .patch(`/api/admin/tickets/${ticket.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'closed' });

    const res = await request(app)
      .post(`/api/tickets/${ticket.body.id}/comments`)
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ body: 'still there?' });
    expect(res.status).toBe(409);
  });

  it('lets the comment author delete their own comment', async () => {
    const { token } = await registerUser('commenter3');
    const auth = { Authorization: `Bearer ${token}` };
    const ticket = await createTicket(auth);
    const comment = await request(app)
      .post(`/api/tickets/${ticket.body.id}/comments`)
      .set(auth)
      .send({ body: 'to be deleted' });

    const del = await request(app)
      .delete(`/api/tickets/${ticket.body.id}/comments/${comment.body.id}`)
      .set(auth);
    expect(del.status).toBe(204);
  });

  it('lets an admin delete another user\'s comment', async () => {
    const admin = await makeAdmin('commentadmin3');
    const reporter = await registerUser('commentreporter3');
    const auth = { Authorization: `Bearer ${reporter.token}` };
    const ticket = await createTicket(auth);
    const comment = await request(app)
      .post(`/api/tickets/${ticket.body.id}/comments`)
      .set(auth)
      .send({ body: 'to be moderated' });

    const del = await request(app)
      .delete(`/api/tickets/${ticket.body.id}/comments/${comment.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(del.status).toBe(204);
  });

  it('forbids the ticket owner from deleting a comment posted by an admin (not the author, not an admin)', async () => {
    const admin = await makeAdmin('commentadmin4');
    const reporter = await registerUser('commentreporter4');
    const ticket = await createTicket({ Authorization: `Bearer ${reporter.token}` });
    const comment = await request(app)
      .post(`/api/tickets/${ticket.body.id}/comments`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ body: 'admin note' });

    const del = await request(app)
      .delete(`/api/tickets/${ticket.body.id}/comments/${comment.body.id}`)
      .set('Authorization', `Bearer ${reporter.token}`);
    expect(del.status).toBe(403);
  });

  it('an unrelated authenticated user gets 404 (not 403) when trying to reach a ticket they cannot access', async () => {
    const reporter = await registerUser('commentreporter5');
    const other = await registerUser('commentother5');
    const ticket = await createTicket({ Authorization: `Bearer ${reporter.token}` });

    const del = await request(app)
      .delete(`/api/tickets/${ticket.body.id}/comments/1`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(del.status).toBe(404);
  });
});
