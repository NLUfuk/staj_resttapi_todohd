const request = require('supertest');
const { app, resetDb, registerUser, makeAdmin, getDepartmentId, db } = require('./helpers');

beforeEach(resetDb);

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function assignDepartment(adminToken, userId, slug) {
  return request(app)
    .patch(`/api/admin/users/${userId}`)
    .set(auth(adminToken))
    .send({ department_id: getDepartmentId(slug) });
}

function channelId(slug) {
  return db.prepare('SELECT id FROM channels WHERE name = ?').get(slug).id;
}

describe('GET /api/channels', () => {
  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/channels');
    expect(res.status).toBe(401);
  });

  it('an admin sees every channel', async () => {
    const admin = await makeAdmin('chanadmin1');
    const res = await request(app).get('/api/channels').set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.map((c) => c.name).sort()).toEqual(['donanim', 'genel', 'muhasebe', 'yazilim']);
  });

  it('a regular user sees only their department channel plus #genel', async () => {
    const admin = await makeAdmin('chanadmin2');
    const { token, user } = await registerUser('chanuser1');
    await assignDepartment(admin.token, user.id, 'donanim');

    const res = await request(app).get('/api/channels').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.map((c) => c.name).sort()).toEqual(['donanim', 'genel']);
  });
});

describe('Channel access control', () => {
  it('a Muhasebe user cannot read or write to #yazilim (403)', async () => {
    const admin = await makeAdmin('chanadmin3');
    const { token, user } = await registerUser('chanuser2');
    await assignDepartment(admin.token, user.id, 'muhasebe');

    const yazilimId = channelId('yazilim');
    const readRes = await request(app).get(`/api/channels/${yazilimId}/messages`).set(auth(token));
    expect(readRes.status).toBe(403);

    const writeRes = await request(app)
      .post(`/api/channels/${yazilimId}/messages`)
      .set(auth(token))
      .send({ body: 'sneaking in' });
    expect(writeRes.status).toBe(403);
  });

  it('any authenticated user can read and write #genel', async () => {
    const { token } = await registerUser('chanuser3');
    const genelId = channelId('genel');

    const post = await request(app)
      .post(`/api/channels/${genelId}/messages`)
      .set(auth(token))
      .send({ body: 'hello everyone' });
    expect(post.status).toBe(201);

    const read = await request(app).get(`/api/channels/${genelId}/messages`).set(auth(token));
    expect(read.status).toBe(200);
    expect(read.body).toHaveLength(1);
  });

  it('returns 404 for a non-existent channel', async () => {
    const { token } = await registerUser('chanuser4');
    const res = await request(app).get('/api/channels/999999/messages').set(auth(token));
    expect(res.status).toBe(404);
  });

  it('an admin can post to and read any department channel', async () => {
    const admin = await makeAdmin('chanadmin4');
    const donanimId = channelId('donanim');

    const post = await request(app)
      .post(`/api/channels/${donanimId}/messages`)
      .set(auth(admin.token))
      .send({ body: 'admin broadcast' });
    expect(post.status).toBe(201);
  });
});

describe('Message CRUD', () => {
  it('rejects an empty message body', async () => {
    const { token } = await registerUser('chanuser5');
    const genelId = channelId('genel');
    const res = await request(app)
      .post(`/api/channels/${genelId}/messages`)
      .set(auth(token))
      .send({ body: '  ' });
    expect(res.status).toBe(400);
  });

  it('lets the author delete their own message', async () => {
    const { token } = await registerUser('chanuser6');
    const genelId = channelId('genel');
    const posted = await request(app)
      .post(`/api/channels/${genelId}/messages`)
      .set(auth(token))
      .send({ body: 'to delete' });

    const del = await request(app)
      .delete(`/api/channels/${genelId}/messages/${posted.body.id}`)
      .set(auth(token));
    expect(del.status).toBe(204);
  });

  it('lets an admin delete someone else\'s message', async () => {
    const admin = await makeAdmin('chanadmin5');
    const { token } = await registerUser('chanuser7');
    const genelId = channelId('genel');
    const posted = await request(app)
      .post(`/api/channels/${genelId}/messages`)
      .set(auth(token))
      .send({ body: 'to be moderated' });

    const del = await request(app)
      .delete(`/api/channels/${genelId}/messages/${posted.body.id}`)
      .set(auth(admin.token));
    expect(del.status).toBe(204);
  });

  it('forbids a non-author non-admin from deleting someone else\'s message', async () => {
    const { token: authorToken } = await registerUser('chanuser8');
    const { token: otherToken } = await registerUser('chanuser9');
    const genelId = channelId('genel');
    const posted = await request(app)
      .post(`/api/channels/${genelId}/messages`)
      .set(auth(authorToken))
      .send({ body: 'mine' });

    const del = await request(app)
      .delete(`/api/channels/${genelId}/messages/${posted.body.id}`)
      .set(auth(otherToken));
    expect(del.status).toBe(403);
  });
});

describe('Cursor-based pagination', () => {
  it('stays consistent when new messages arrive after a "before" cursor was taken', async () => {
    const { token } = await registerUser('chanuser10');
    const genelId = channelId('genel');
    const ids = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app)
        .post(`/api/channels/${genelId}/messages`)
        .set(auth(token))
        .send({ body: `msg ${i}` });
      ids.push(res.body.id);
    }

    // Take a "before" cursor at the 4th message (load older messages 1-3).
    const page1 = await request(app)
      .get(`/api/channels/${genelId}/messages?before=${ids[3]}&limit=10`)
      .set(auth(token));
    expect(page1.body.map((m) => m.body)).toEqual(['msg 0', 'msg 1', 'msg 2']);

    // A new message arrives after the cursor was taken.
    await request(app)
      .post(`/api/channels/${genelId}/messages`)
      .set(auth(token))
      .send({ body: 'msg 5 (new)' });

    // Re-fetching the same "before" cursor still returns the same page -
    // it did not shift because of the new message (unlike offset pagination).
    const page1Again = await request(app)
      .get(`/api/channels/${genelId}/messages?before=${ids[3]}&limit=10`)
      .set(auth(token));
    expect(page1Again.body.map((m) => m.body)).toEqual(['msg 0', 'msg 1', 'msg 2']);
  });

  it('polls new messages with ?after=<last_id>', async () => {
    const { token } = await registerUser('chanuser11');
    const genelId = channelId('genel');
    const first = await request(app)
      .post(`/api/channels/${genelId}/messages`)
      .set(auth(token))
      .send({ body: 'first' });
    await request(app)
      .post(`/api/channels/${genelId}/messages`)
      .set(auth(token))
      .send({ body: 'second' });

    const res = await request(app)
      .get(`/api/channels/${genelId}/messages?after=${first.body.id}`)
      .set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.map((m) => m.body)).toEqual(['second']);
  });
});
