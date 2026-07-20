const bcrypt = require('bcryptjs');
const db = require('./db');

// Wipe existing data so this script is safely re-runnable.
db.exec('DELETE FROM tickets; DELETE FROM todos; DELETE FROM users;');
db.exec(
  "DELETE FROM sqlite_sequence WHERE name IN ('tickets', 'todos', 'users');"
);

const insertUser = db.prepare(
  'INSERT INTO users (username, password_hash, role, department_id) VALUES (?, ?, ?, ?)'
);
const insertTodo = db.prepare(
  'INSERT INTO todos (user_id, title, description, status) VALUES (?, ?, ?, ?)'
);
const insertTicket = db.prepare(
  `INSERT INTO tickets (user_id, todo_id, department_id, subject, message, status, admin_response)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

const departmentIdBySlug = (slug) =>
  db.prepare('SELECT id FROM departments WHERE slug = ?').get(slug).id;
const genelId = departmentIdBySlug('genel');
const donanimId = departmentIdBySlug('donanim');
const muhasebeId = departmentIdBySlug('muhasebe');

const hash = (pw) => bcrypt.hashSync(pw, 10);

const adminId = insertUser.run('admin', hash('admin123'), 'admin', genelId).lastInsertRowid;
const aliceId = insertUser.run('alice', hash('alice123'), 'user', donanimId).lastInsertRowid;
const bobId = insertUser.run('bob', hash('bob123'), 'user', muhasebeId).lastInsertRowid;

const aliceTodo1 = insertTodo.run(
  aliceId,
  'Set up laptop for onboarding',
  'Install VPN client and dev tools',
  'done'
).lastInsertRowid;

const aliceTodo2 = insertTodo.run(
  aliceId,
  'Fix printer on 3rd floor',
  'Paper jam error keeps appearing',
  'pending'
).lastInsertRowid;

insertTodo.run(bobId, 'Renew software license', 'Design suite license expires end of month', 'pending');

insertTicket.run(
  aliceId,
  aliceTodo2,
  donanimId,
  'Printer stuck in paper jam loop',
  'Tried reseating the tray, still shows a jam error. Can IT take a look?',
  'open',
  null
);

insertTicket.run(
  aliceId,
  null,
  donanimId,
  'VPN access request',
  'I need VPN access for remote work starting next week.',
  'closed',
  'Access granted, credentials sent via email.'
);

insertTicket.run(
  bobId,
  null,
  muhasebeId,
  'License renewal blocked by finance',
  'Finance has not approved the PO yet, can someone follow up?',
  'in_progress',
  'Following up with finance, will update by Friday.'
);

console.log('Seed complete:');
console.log(`  admin -> username: admin, password: admin123 (id=${adminId})`);
console.log(`  user  -> username: alice, password: alice123 (id=${aliceId})`);
console.log(`  user  -> username: bob,   password: bob123   (id=${bobId})`);
