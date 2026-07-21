const request = require('supertest');
const { app, resetDb, registerUser } = require('./helpers');

beforeEach(resetDb);

describe('Assignment timeline', () => {
  it('records the full history in chronological order with actors and comments', async () => {
    const assigner = await registerUser('timelineAssigner');
    const assignee = await registerUser('timelineAssignee');
    const todo = await request(app)
      .post('/api/todos')
      .set('Authorization', `Bearer ${assigner.token}`)
      .send({ title: 'Kablo al' });

    const assignment = await request(app)
      .post(`/api/todos/${todo.body.id}/assign`)
      .set('Authorization', `Bearer ${assigner.token}`)
      .send({ assignee_username: 'timelineAssignee' });
    const assignmentId = assignment.body.id;

    await request(app)
      .post(`/api/assignments/${assignmentId}/revise`)
      .set('Authorization', `Bearer ${assignee.token}`)
      .send({ comment: 'yanlış kablo türü' });

    await request(app)
      .post(`/api/assignments/${assignmentId}/resend`)
      .set('Authorization', `Bearer ${assigner.token}`);

    await request(app)
      .post(`/api/assignments/${assignmentId}/accept`)
      .set('Authorization', `Bearer ${assignee.token}`);

    await request(app)
      .post(`/api/assignments/${assignmentId}/complete`)
      .set('Authorization', `Bearer ${assignee.token}`);

    const timeline = await request(app)
      .get(`/api/assignments/${assignmentId}/timeline`)
      .set('Authorization', `Bearer ${assigner.token}`);

    expect(timeline.status).toBe(200);
    expect(timeline.body.map((e) => e.action)).toEqual([
      'assign',
      'revise',
      'resend',
      'accept',
      'complete',
    ]);
    expect(timeline.body.map((e) => e.to_status)).toEqual([
      'pending',
      'revision',
      'pending',
      'accepted',
      'completed',
    ]);
    expect(timeline.body[1].comment).toBe('yanlış kablo türü');
    expect(timeline.body[1].actor_username).toBe('timelineAssignee');
    expect(timeline.body[0].actor_username).toBe('timelineAssigner');
    expect(timeline.body[0].comment).toBeNull();

    // the assignee side sees the identical timeline too
    const asAssignee = await request(app)
      .get(`/api/assignments/${assignmentId}/timeline`)
      .set('Authorization', `Bearer ${assignee.token}`);
    expect(asAssignee.body).toEqual(timeline.body);
  });

  it('hides the timeline from a non-party (404)', async () => {
    const assigner = await registerUser('tlOwner');
    const assignee = await registerUser('tlAssignee');
    const outsider = await registerUser('tlOutsider');
    const todo = await request(app)
      .post('/api/todos')
      .set('Authorization', `Bearer ${assigner.token}`)
      .send({ title: 'x' });
    const assignment = await request(app)
      .post(`/api/todos/${todo.body.id}/assign`)
      .set('Authorization', `Bearer ${assigner.token}`)
      .send({ assignee_username: 'tlAssignee' });

    const res = await request(app)
      .get(`/api/assignments/${assignment.body.id}/timeline`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(res.status).toBe(404);
  });

  it('notifies the counterpart on each transition', async () => {
    const assigner = await registerUser('notifAssigner');
    const assignee = await registerUser('notifAssignee');
    const todo = await request(app)
      .post('/api/todos')
      .set('Authorization', `Bearer ${assigner.token}`)
      .send({ title: 'x' });
    const assignment = await request(app)
      .post(`/api/todos/${todo.body.id}/assign`)
      .set('Authorization', `Bearer ${assigner.token}`)
      .send({ assignee_username: 'notifAssignee' });

    const assigneeNotifs = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${assignee.token}`);
    expect(assigneeNotifs.body.some((n) => n.type === 'assignment')).toBe(true);

    await request(app)
      .post(`/api/assignments/${assignment.body.id}/accept`)
      .set('Authorization', `Bearer ${assignee.token}`);

    const assignerNotifs = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${assigner.token}`);
    expect(assignerNotifs.body.some((n) => n.type === 'assignment')).toBe(true);
  });
});
