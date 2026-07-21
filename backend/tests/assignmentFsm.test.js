const request = require('supertest');
const { app, resetDb, registerUser } = require('./helpers');

beforeEach(resetDb);

async function setupAssignment() {
  const assigner = await registerUser('fsmAssigner');
  const assignee = await registerUser('fsmAssignee');
  const todo = await request(app)
    .post('/api/todos')
    .set('Authorization', `Bearer ${assigner.token}`)
    .send({ title: 'Kablo al' });

  const assignment = await request(app)
    .post(`/api/todos/${todo.body.id}/assign`)
    .set('Authorization', `Bearer ${assigner.token}`)
    .send({ assignee_username: 'fsmAssignee' });

  return { assigner, assignee, assignmentId: assignment.body.id };
}

describe('Assignment FSM', () => {
  it('rejects an invalid transition (pending -> complete) with 409', async () => {
    const { assignee, assignmentId } = await setupAssignment();
    const res = await request(app)
      .post(`/api/assignments/${assignmentId}/complete`)
      .set('Authorization', `Bearer ${assignee.token}`);
    expect(res.status).toBe(409);
  });

  it('rejects reject/revise without a comment (400)', async () => {
    const { assignee, assignmentId } = await setupAssignment();

    const reject = await request(app)
      .post(`/api/assignments/${assignmentId}/reject`)
      .set('Authorization', `Bearer ${assignee.token}`)
      .send({});
    expect(reject.status).toBe(400);

    const revise = await request(app)
      .post(`/api/assignments/${assignmentId}/revise`)
      .set('Authorization', `Bearer ${assignee.token}`)
      .send({ comment: '   ' });
    expect(revise.status).toBe(400);
  });

  it('rejects an action performed by someone who is not the required party (403)', async () => {
    const { assigner, assignmentId } = await setupAssignment();
    const outsider = await registerUser('fsmOutsider');

    // accept requires the assignee - the assigner cannot accept their own assignment
    const asAssigner = await request(app)
      .post(`/api/assignments/${assignmentId}/accept`)
      .set('Authorization', `Bearer ${assigner.token}`);
    expect(asAssigner.status).toBe(403);

    // a completely unrelated user cannot act on it either
    const asOutsider = await request(app)
      .post(`/api/assignments/${assignmentId}/accept`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(asOutsider.status).toBe(403);
  });

  it('rejects any transition out of a terminal state (409)', async () => {
    const { assigner, assignee, assignmentId } = await setupAssignment();

    await request(app)
      .post(`/api/assignments/${assignmentId}/reject`)
      .set('Authorization', `Bearer ${assignee.token}`)
      .send({ comment: 'not interested' });

    const res = await request(app)
      .post(`/api/assignments/${assignmentId}/cancel`)
      .set('Authorization', `Bearer ${assigner.token}`);
    expect(res.status).toBe(409);
  });

  it('happy path: assign -> accept -> complete', async () => {
    const { assignee, assignmentId } = await setupAssignment();

    const accept = await request(app)
      .post(`/api/assignments/${assignmentId}/accept`)
      .set('Authorization', `Bearer ${assignee.token}`);
    expect(accept.status).toBe(200);
    expect(accept.body.status).toBe('accepted');

    const complete = await request(app)
      .post(`/api/assignments/${assignmentId}/complete`)
      .set('Authorization', `Bearer ${assignee.token}`);
    expect(complete.status).toBe(200);
    expect(complete.body.status).toBe('completed');
  });

  it('revision cycle: revise -> resend -> accept', async () => {
    const { assigner, assignee, assignmentId } = await setupAssignment();

    const revise = await request(app)
      .post(`/api/assignments/${assignmentId}/revise`)
      .set('Authorization', `Bearer ${assignee.token}`)
      .send({ comment: 'wrong cable type' });
    expect(revise.status).toBe(200);
    expect(revise.body.status).toBe('revision');

    // assignee cannot resend - only the assigner can
    const wrongResend = await request(app)
      .post(`/api/assignments/${assignmentId}/resend`)
      .set('Authorization', `Bearer ${assignee.token}`);
    expect(wrongResend.status).toBe(403);

    const resend = await request(app)
      .post(`/api/assignments/${assignmentId}/resend`)
      .set('Authorization', `Bearer ${assigner.token}`);
    expect(resend.status).toBe(200);
    expect(resend.body.status).toBe('pending');

    const accept = await request(app)
      .post(`/api/assignments/${assignmentId}/accept`)
      .set('Authorization', `Bearer ${assignee.token}`);
    expect(accept.status).toBe(200);
    expect(accept.body.status).toBe('accepted');
  });
});
