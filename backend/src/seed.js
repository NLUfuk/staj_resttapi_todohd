const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { notify, notifyMentions } = require('./utils/notify');
const { audit } = require('./utils/audit');

// Full cartesian demo dataset: every role x department combination, every
// todo status x priority combination, every assignment FSM status, every
// ticket status x department combination, and one of every notification
// type (read + unread) - so every screen/filter in the app has something
// to show out of the box. Re-runnable: wipes and reseeds everything below.
//
// Wrapped in a function (rather than running at require-time) so it can
// also be invoked from POST /api/admin/seed (see routes/adminSeed.routes.js)
// for hosts without shell access (e.g. Render free tier) - `npm run seed`
// below still works unchanged via the require.main guard at the bottom.
function seed() {

// ---- Wipe (children before parents, FK-safe - same order as tests/helpers.js resetDb()) ----
db.exec(`
  DELETE FROM assignment_events;
  DELETE FROM assignments;
  DELETE FROM ticket_comments;
  DELETE FROM tickets;
  DELETE FROM messages;
  DELETE FROM notifications;
  DELETE FROM audit_logs;
  DELETE FROM email_verifications;
  DELETE FROM todo_lists;
  DELETE FROM todos;
  DELETE FROM users;
`);
db.exec(`
  DELETE FROM sqlite_sequence WHERE name IN (
    'assignment_events', 'assignments', 'ticket_comments', 'tickets', 'messages',
    'notifications', 'audit_logs', 'email_verifications', 'todo_lists', 'todos', 'users'
  );
`);

const hash = (pw) => bcrypt.hashSync(pw, 10);
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function fmt(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
// Stagger timestamps into the past so timelines/message lists read
// chronologically instead of every row sharing the exact same instant.
function ago(days, minutes = 0) {
  return fmt(new Date(Date.now() - days * 24 * 60 * 60 * 1000 - minutes * 60 * 1000));
}

const departmentIdBySlug = (slug) =>
  db.prepare('SELECT id FROM departments WHERE slug = ?').get(slug).id;
const channelIdByName = (name) =>
  db.prepare('SELECT id FROM channels WHERE name = ?').get(name).id;

const DEPT = {
  donanim: departmentIdBySlug('donanim'),
  yazilim: departmentIdBySlug('yazilim'),
  muhasebe: departmentIdBySlug('muhasebe'),
  genel: departmentIdBySlug('genel'),
};

// ---- Users: role x department cartesian (admin is dept-agnostic; dept_lead
// and user each cover all 4 departments, user with 2 per department so
// there's always a same-department pair available for assignments) ----

const insertUser = db.prepare(
  `INSERT INTO users (username, email, password_hash, role, department_id, is_verified)
   VALUES (?, ?, ?, ?, ?, 1)`
);

function createUser(username, email, password, role, deptId) {
  const id = insertUser.run(username, email, hash(password), role, deptId).lastInsertRowid;
  return { id, username, email, password, role, deptId };
}

const admin = createUser('admin', 'admin@example.com', 'admin123', 'admin', DEPT.genel);

const leads = {
  donanim: createUser('lead_donanim', 'lead_donanim@example.com', 'lead123', 'dept_lead', DEPT.donanim),
  yazilim: createUser('lead_yazilim', 'lead_yazilim@example.com', 'lead123', 'dept_lead', DEPT.yazilim),
  muhasebe: createUser('lead_muhasebe', 'lead_muhasebe@example.com', 'lead123', 'dept_lead', DEPT.muhasebe),
  genel: createUser('lead_genel', 'lead_genel@example.com', 'lead123', 'dept_lead', DEPT.genel),
};

const alice = createUser('alice', 'alice@example.com', 'alice123', 'user', DEPT.donanim);
const bob = createUser('bob', 'bob@example.com', 'bob123', 'user', DEPT.muhasebe);
const userDonanim2 = createUser('user_donanim2', 'user_donanim2@example.com', 'user123', 'user', DEPT.donanim);
const userYazilim1 = createUser('user_yazilim1', 'user_yazilim1@example.com', 'user123', 'user', DEPT.yazilim);
const userYazilim2 = createUser('user_yazilim2', 'user_yazilim2@example.com', 'user123', 'user', DEPT.yazilim);
const userMuhasebe2 = createUser('user_muhasebe2', 'user_muhasebe2@example.com', 'user123', 'user', DEPT.muhasebe);
const userGenel1 = createUser('user_genel1', 'user_genel1@example.com', 'user123', 'user', DEPT.genel);
const userGenel2 = createUser('user_genel2', 'user_genel2@example.com', 'user123', 'user', DEPT.genel);

audit(admin.id, 'role.change', `users:${leads.donanim.id}`);
audit(admin.id, 'role.change', `users:${leads.yazilim.id}`);
audit(admin.id, 'role.change', `users:${leads.muhasebe.id}`);
audit(admin.id, 'role.change', `users:${leads.genel.id}`);

// One deliberately unverified account (US-8 demo) - login blocked until this
// token is followed via GET /api/auth/verify. Token is only ever known here
// and in the (unsent, since this bypasses mailer.send()) verification email -
// printed to the console below so it can be exercised manually.
const pendingToken = crypto.randomBytes(32).toString('hex');
const pendingUser = db
  .prepare(
    `INSERT INTO users (username, email, password_hash, role, department_id, is_verified)
     VALUES (?, ?, ?, 'user', ?, 0)`
  )
  .run('pendinguser', 'pending@example.com', hash('pending123'), DEPT.genel).lastInsertRowid;
db.prepare(
  `INSERT INTO email_verifications (user_id, token_hash, expires_at)
   VALUES (?, ?, datetime('now', '+1 day'))`
).run(pendingUser, hashToken(pendingToken));

// ---- Todo lists: everyone who gets todos has a "Genel" list; alice/bob
// additionally get a topic-specific custom list (US-1) ----

const insertList = db.prepare('INSERT INTO todo_lists (owner_id, name) VALUES (?, ?)');
function genelList(userId) {
  return insertList.run(userId, 'Genel').lastInsertRowid;
}

const aliceGenel = genelList(alice.id);
const aliceElektrik = insertList.run(alice.id, 'Elektrik').lastInsertRowid;
const bobGenel = genelList(bob.id);
const bobFatura = insertList.run(bob.id, 'Fatura Takibi').lastInsertRowid;
const leadDonanimGenel = genelList(leads.donanim.id);
const leadYazilimGenel = genelList(leads.yazilim.id);
const userDonanim2Genel = genelList(userDonanim2.id);
const userYazilim1Genel = genelList(userYazilim1.id);
const userMuhasebe2Genel = genelList(userMuhasebe2.id);
const userGenel1Genel = genelList(userGenel1.id);
const userGenel2Genel = genelList(userGenel2.id);

// ---- Todos: status x priority cartesian (2x3=6) for alice and bob, a
// couple of simple todos for everyone else so no list is ever empty ----

const insertTodo = db.prepare(
  `INSERT INTO todos (user_id, title, description, status, due_date, priority, list_id)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

// alice: donanim context
insertTodo.run(alice.id, 'Kırtasiye siparişi ver', null, 'pending', null, 'low', aliceGenel);
insertTodo.run(alice.id, 'Yedek HDMI kablosu al', 'Toplantı odası için', 'pending', '2026-08-05', 'medium', aliceElektrik);
insertTodo.run(alice.id, 'Sunucu odasını yeniden başlat', null, 'pending', '2026-07-25', 'high', aliceElektrik);
insertTodo.run(alice.id, 'Masa düzenle', 'Yeni gelen ekipmanlar için yer aç', 'done', null, 'low', aliceGenel);
insertTodo.run(alice.id, 'Yazıcı kartuşu değiştir', '3. kat yazıcısı', 'done', '2026-07-10', 'medium', aliceElektrik);
insertTodo.run(alice.id, 'Güvenlik duvarı güncelle', null, 'done', '2026-07-01', 'high', aliceGenel);

// bob: muhasebe context
insertTodo.run(bob.id, 'Ofis malzemesi listesi çıkar', null, 'pending', null, 'low', bobGenel);
insertTodo.run(bob.id, 'Aylık rapor hazırla', null, 'pending', '2026-08-01', 'medium', bobGenel);
insertTodo.run(bob.id, 'Fatura ödemesini yap', 'Tedarikçi: ABC Ltd.', 'pending', '2026-07-28', 'high', bobFatura);
insertTodo.run(bob.id, 'Arşiv düzenle', null, 'done', null, 'low', bobGenel);
insertTodo.run(bob.id, 'Vergi beyannamesi gönder', 'Son tarihe yetişti', 'done', '2026-07-15', 'medium', bobFatura);
insertTodo.run(bob.id, 'Denetim raporunu tamamla', null, 'done', '2026-07-05', 'high', bobGenel);

// everyone else: a couple of lightweight todos so their lists aren't empty
insertTodo.run(leads.donanim.id, 'Departman envanterini gözden geçir', null, 'pending', null, 'medium', leadDonanimGenel);
insertTodo.run(leads.yazilim.id, 'Kod inceleme takvimini planla', null, 'pending', '2026-07-30', 'medium', leadYazilimGenel);
insertTodo.run(userDonanim2.id, 'Klavye/mouse envanteri say', null, 'pending', null, 'low', userDonanim2Genel);
insertTodo.run(userYazilim1.id, 'Staging ortamını güncelle', null, 'done', '2026-07-12', 'high', userYazilim1Genel);
insertTodo.run(userMuhasebe2.id, 'Masraf formlarını topla', null, 'pending', null, 'low', userMuhasebe2Genel);
insertTodo.run(userGenel1.id, 'Ofis toplantısı için gündem hazırla', null, 'pending', '2026-07-27', 'medium', userGenel1Genel);
insertTodo.run(userGenel2.id, 'Yeni çalışan oryantasyon checklisti', null, 'done', null, 'medium', userGenel2Genel);

// ---- Assignments: one per FSM status (US-2..7), full event history per case ----

const insertAssignment = db.prepare(
  `INSERT INTO assignments (todo_id, assigner_id, assignee_id, status, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const insertEvent = db.prepare(
  `INSERT INTO assignment_events (assignment_id, actor_id, action, from_status, to_status, comment, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

// case 1: pending - alice assigns to bob, no response yet
{
  const todoId = insertTodo.run(alice.id, '[Atama] Kablo al', 'Ali için elektrik malzemesi', 'pending', null, 'medium', aliceElektrik).lastInsertRowid;
  const t = ago(1);
  const id = insertAssignment.run(todoId, alice.id, bob.id, 'pending', t, t).lastInsertRowid;
  insertEvent.run(id, alice.id, 'assign', null, 'pending', null, t);
  notify(bob.id, 'assignment', id, `${alice.username} size "Kablo al" görevini atadı`);
}

// case 2: accepted - full revision cycle (assign -> revise -> resend -> accept)
// to show a deeper timeline, not just the direct path
{
  const todoId = insertTodo.run(leads.donanim.id, '[Atama] Envanter sayımı yap', null, 'pending', '2026-08-10', 'medium', leadDonanimGenel).lastInsertRowid;
  const t0 = ago(6);
  const t1 = ago(5);
  const t2 = ago(4);
  const t3 = ago(3);
  const id = insertAssignment.run(todoId, leads.donanim.id, userDonanim2.id, 'accepted', t0, t3).lastInsertRowid;
  insertEvent.run(id, leads.donanim.id, 'assign', null, 'pending', null, t0);
  insertEvent.run(id, userDonanim2.id, 'revise', 'pending', 'revision', 'Hangi depo için olduğu belirtilmemiş', t1);
  insertEvent.run(id, leads.donanim.id, 'resend', 'revision', 'pending', null, t2);
  insertEvent.run(id, userDonanim2.id, 'accept', 'pending', 'accepted', null, t3);
  notify(leads.donanim.id, 'assignment', id, `${userDonanim2.username} atamanızı kabul etti`);
}

// case 3: completed - straightforward assign -> accept -> complete
{
  const todoId = insertTodo.run(bob.id, '[Atama] Fatura tarat', null, 'pending', null, 'low', bobFatura).lastInsertRowid;
  const t0 = ago(4);
  const t1 = ago(3);
  const t2 = ago(2);
  const id = insertAssignment.run(todoId, bob.id, userMuhasebe2.id, 'completed', t0, t2).lastInsertRowid;
  insertEvent.run(id, bob.id, 'assign', null, 'pending', null, t0);
  insertEvent.run(id, userMuhasebe2.id, 'accept', 'pending', 'accepted', null, t1);
  insertEvent.run(id, userMuhasebe2.id, 'complete', 'accepted', 'completed', null, t2);
  notify(bob.id, 'assignment', id, `${userMuhasebe2.username} atadığınız görevi tamamladı`);
}

// case 4: rejected - assign -> reject (comment required)
{
  const todoId = insertTodo.run(leads.yazilim.id, '[Atama] Sunucu logu incele', null, 'pending', null, 'high', leadYazilimGenel).lastInsertRowid;
  const t0 = ago(2);
  const t1 = ago(1, 30);
  const id = insertAssignment.run(todoId, leads.yazilim.id, userYazilim1.id, 'rejected', t0, t1).lastInsertRowid;
  insertEvent.run(id, leads.yazilim.id, 'assign', null, 'pending', null, t0);
  insertEvent.run(id, userYazilim1.id, 'reject', 'pending', 'rejected', 'Bu benim uzmanlık alanım değil, yazilim2 daha uygun olur', t1);
  notify(leads.yazilim.id, 'assignment', id, `${userYazilim1.username} atamanızı reddetti`);
}

// case 5: revision - assign -> revise, still waiting on the assigner to resend
{
  const todoId = insertTodo.run(userGenel1.id, '[Atama] Toplantı notlarını düzenle', null, 'pending', null, 'medium', userGenel1Genel).lastInsertRowid;
  const t0 = ago(1, 30);
  const t1 = ago(0, 90);
  const id = insertAssignment.run(todoId, userGenel1.id, userGenel2.id, 'revision', t0, t1).lastInsertRowid;
  insertEvent.run(id, userGenel1.id, 'assign', null, 'pending', null, t0);
  insertEvent.run(id, userGenel2.id, 'revise', 'pending', 'revision', 'Hangi toplantıya ait olduğunu ekleyebilir misin?', t1);
  notify(userGenel1.id, 'assignment', id, `${userGenel2.username} atamanız için revizyon istedi`);
}

// case 6: cancelled - assigner cancels while still pending
{
  const todoId = insertTodo.run(alice.id, '[Atama] Kırtasiye siparişi ver', null, 'pending', null, 'low', aliceGenel).lastInsertRowid;
  const t0 = ago(0, 200);
  const t1 = ago(0, 60);
  const id = insertAssignment.run(todoId, alice.id, bob.id, 'cancelled', t0, t1).lastInsertRowid;
  insertEvent.run(id, alice.id, 'assign', null, 'pending', null, t0);
  insertEvent.run(id, alice.id, 'cancel', 'pending', 'cancelled', null, t1);
  notify(bob.id, 'assignment', id, `${alice.username} atamayı iptal etti`);
}

// ---- Tickets: department x status cartesian (4x3=12) ----

const insertTicket = db.prepare(
  `INSERT INTO tickets (user_id, todo_id, department_id, subject, message, status, admin_response)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const insertTicketComment = db.prepare(
  'INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES (?, ?, ?)'
);

const TICKET_MATRIX = [
  { dept: 'donanim', deptId: DEPT.donanim, reporter: alice, lead: leads.donanim },
  { dept: 'yazilim', deptId: DEPT.yazilim, reporter: userYazilim1, lead: leads.yazilim },
  { dept: 'muhasebe', deptId: DEPT.muhasebe, reporter: bob, lead: leads.muhasebe },
  { dept: 'genel', deptId: DEPT.genel, reporter: userGenel1, lead: leads.genel },
];
const TICKET_SUBJECTS = {
  open: (dept) => `[${dept}] Yeni bir sorun bildirdim`,
  in_progress: (dept) => `[${dept}] Üzerinde çalışılan talep`,
  closed: (dept) => `[${dept}] Çözülmüş talep`,
};

for (const row of TICKET_MATRIX) {
  for (const status of ['open', 'in_progress', 'closed']) {
    const ticketId = insertTicket.run(
      row.reporter.id,
      null,
      row.deptId,
      TICKET_SUBJECTS[status](row.dept),
      `${row.dept} departmanı için ${status} durumunda örnek talep.`,
      status,
      null
    ).lastInsertRowid;

    if (status === 'in_progress') {
      insertTicketComment.run(ticketId, row.lead.id, 'İnceliyoruz, kısa süre içinde dönüş yapacağız.');
      notify(row.reporter.id, 'ticket_comment', ticketId, `"${TICKET_SUBJECTS[status](row.dept)}" talebinize yeni bir yorum geldi`);
    }
    if (status === 'closed') {
      insertTicketComment.run(ticketId, row.lead.id, 'Sorun giderildi, kapatıyorum.');
      notify(row.reporter.id, 'ticket_status', ticketId, `"${TICKET_SUBJECTS[status](row.dept)}" talebinizin durumu "closed" olarak değişti`);
      audit(row.lead.id, 'ticket.close', `tickets:${ticketId}`);
    }
  }
}

// ---- Channel messages, including one @mention (notifyMentions reuses the
// same extraction/notify logic the real POST /api/channels/:id/messages uses) ----

const insertMessage = db.prepare('INSERT INTO messages (channel_id, user_id, body) VALUES (?, ?, ?)');

function postMessage(channelName, sender, body) {
  const channelId = channelIdByName(channelName);
  const info = insertMessage.run(channelId, sender.id, body);
  notifyMentions({
    senderId: sender.id,
    senderUsername: sender.username,
    channelName,
    messageId: info.lastInsertRowid,
    body,
  });
  return info.lastInsertRowid;
}

postMessage('donanim', alice, 'Sunucu odası bakımı bugün 15:00te başlıyor.');
postMessage('donanim', userDonanim2, 'Notu aldım, o saatte oradayım.');
postMessage('donanim', leads.donanim, `Teşekkürler. @${alice.username} bakım sonrası durumu buraya yazar mısın?`);

postMessage('yazilim', userYazilim1, 'Staging deploy tamamlandı, test edebilirsiniz.');
postMessage('yazilim', userYazilim2, 'Harika, hemen bakıyorum.');
postMessage('yazilim', leads.yazilim, 'Prod deploy için onay bekliyoruz.');

postMessage('muhasebe', bob, 'Aylık raporlar cuma gününe kadar tamamlanmalı.');
postMessage('muhasebe', userMuhasebe2, 'Benim kısmım hazır, gönderiyorum.');

postMessage('genel', admin, `Herkese merhaba! @${userGenel1.username} yeni oryantasyon dokümanını paylaşabilir misin?`);
postMessage('genel', userGenel1, 'Tabii, birazdan paylaşıyorum.');
postMessage('genel', userGenel2, 'Ben de bekliyorum, teşekkürler.');

// ---- Notifications: ensure every type has both a read and an unread example ----
// (ticket_comment/ticket_status/mention/assignment notifications were already
// created above as their triggering events happened - here we just mark a
// representative sample of each type as read so both states are visible.)

function markOneReadPerType() {
  const types = ['ticket_comment', 'ticket_status', 'mention', 'assignment'];
  for (const type of types) {
    const row = db
      .prepare('SELECT id FROM notifications WHERE type = ? ORDER BY id ASC LIMIT 1')
      .get(type);
    if (row) {
      db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ?`).run(row.id);
    }
  }
}
markOneReadPerType();

// ---- Summary ----

console.log('Seed complete (kartezyen/tam kapsamlı veri seti):\n');
console.log('== Kullanıcılar ==');
console.log(`  admin        / admin123   / admin      / Genel      (id=${admin.id})`);
for (const [slug, lead] of Object.entries(leads)) {
  console.log(`  ${lead.username.padEnd(12)} / lead123    / dept_lead  / ${slug.padEnd(10)} (id=${lead.id})`);
}
for (const u of [alice, userDonanim2, userYazilim1, userYazilim2, bob, userMuhasebe2, userGenel1, userGenel2]) {
  console.log(`  ${u.username.padEnd(12)} / ${u.password.padEnd(10)} / user       (id=${u.id})`);
}
console.log(`  pendinguser  / pending123 / user (is_verified=0 - onaysız demo hesabı)`);
console.log(`    -> Doğrulama linki: ${require('./config').appUrl}/verify.html?token=${pendingToken}`);
console.log('\n== Kapsam ==');
console.log('  - Todos: status x priority tam kartezyen (6 kombinasyon) alice ve bob için');
console.log('  - Todo lists: her kullanıcıda "Genel" + alice/bob için ek özel liste');
console.log('  - Assignments: 6 FSM durumunun hepsi (pending/accepted/completed/rejected/revision/cancelled)');
console.log('  - Tickets: departman x status tam kartezyen (4x3=12), yorumlar + bildirimler + audit log dahil');
console.log('  - Channels: her kanalda birden fazla mesaj, biri @mention içeriyor');
console.log('  - Notifications: her tip (ticket_comment/ticket_status/mention/assignment) hem okunmuş hem okunmamış örnekle');

return {
  userCount: 11,
  pendingVerifyUrl: `${require('./config').appUrl}/verify.html?token=${pendingToken}`,
};

}

if (require.main === module) {
  seed();
}

module.exports = { seed };
