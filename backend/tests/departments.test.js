const request = require('supertest');
const { app, resetDb, registerUser, makeAdmin, getDepartmentId } = require('./helpers');

beforeEach(resetDb);

describe('GET /api/departments', () => {
  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/departments');
    expect(res.status).toBe(401);
  });

  it('lists the seeded departments for any authenticated user', async () => {
    const { token } = await registerUser('deptviewer');
    const res = await request(app)
      .get('/api/departments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const slugs = res.body.map((d) => d.slug).sort();
    expect(slugs).toEqual(['donanim', 'genel', 'muhasebe', 'yazilim']);
  });
});

describe('Department CRUD (admin only)', () => {
  it('rejects a non-admin from creating a department', async () => {
    const { token } = await registerUser('notadmin1');
    const res = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Pazarlama' });
    expect(res.status).toBe(403);
  });

  it('creates a department with a derived slug', async () => {
    const admin = await makeAdmin('deptadmin1');
    const res = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'İnsan Kaynakları' });

    expect(res.status).toBe(201);
    expect(res.body.slug).toBe('insan-kaynaklari');
  });

  it('rejects a duplicate department name', async () => {
    const admin = await makeAdmin('deptadmin2');
    const res = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Genel' });
    expect(res.status).toBe(409);
  });

  it('renames a department', async () => {
    const admin = await makeAdmin('deptadmin3');
    const created = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Lojistik' });

    const renamed = await request(app)
      .patch(`/api/departments/${created.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Lojistik ve Depo' });

    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('Lojistik ve Depo');
    expect(renamed.body.slug).toBe('lojistik-ve-depo');
  });

  it('refuses to delete a department that still has members', async () => {
    const admin = await makeAdmin('deptadmin4');
    const res = await request(app)
      .delete(`/api/departments/${getDepartmentId('genel')}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(409);
  });

  it('deletes an empty department', async () => {
    const admin = await makeAdmin('deptadmin5');
    const created = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Gecici Departman' });

    const del = await request(app)
      .delete(`/api/departments/${created.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(del.status).toBe(204);
  });

  it('returns 404 when renaming a non-existent department', async () => {
    const admin = await makeAdmin('deptadmin6');
    const res = await request(app)
      .patch('/api/departments/999999')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('Admin: assigning a user to a department', () => {
  it('updates a user\'s department_id', async () => {
    const admin = await makeAdmin('deptadmin7');
    const { user } = await registerUser('deptassignee');

    const res = await request(app)
      .patch(`/api/admin/users/${user.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ department_id: getDepartmentId('yazilim') });

    expect(res.status).toBe(200);
    expect(res.body.department_id).toBe(getDepartmentId('yazilim'));
  });

  it('rejects an unknown department_id', async () => {
    const admin = await makeAdmin('deptadmin8');
    const { user } = await registerUser('deptassignee2');

    const res = await request(app)
      .patch(`/api/admin/users/${user.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ department_id: 999999 });
    expect(res.status).toBe(400);
  });
});

describe('Ticket department filter (admin)', () => {
  it('filters tickets by department slug', async () => {
    const admin = await makeAdmin('deptadmin9');
    const user = await registerUser('deptreporter');

    await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ subject: 'printer', message: 'jam', department_id: getDepartmentId('donanim') });
    await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ subject: 'invoice', message: 'late', department_id: getDepartmentId('muhasebe') });

    const res = await request(app)
      .get('/api/admin/tickets?department=donanim')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].subject).toBe('printer');
  });

  it('rejects an unknown department slug filter', async () => {
    const admin = await makeAdmin('deptadmin10');
    const res = await request(app)
      .get('/api/admin/tickets?department=nonexistent')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(400);
  });
});
