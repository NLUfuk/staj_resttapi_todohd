const path = require('path');
const Database = require('better-sqlite3');

// NODE_ENV=test -> in-memory DB so tests never touch real data.
const dbPath =
  process.env.NODE_ENV === 'test'
    ? ':memory:'
    : path.join(__dirname, '..', 'data.sqlite');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    todo_id INTEGER REFERENCES todos(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','closed')),
    admin_response TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id INTEGER REFERENCES departments(id),
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    ref_id INTEGER,
    body TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read_at);

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
`);

const TICKET_COMMENTS_TABLE_SQL = `
  CREATE TABLE ticket_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

const MESSAGES_TABLE_SQL = `
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

// SQLite has no "ADD COLUMN IF NOT EXISTS" - guard manually so this file
// stays safe to re-run against an existing data.sqlite (no separate
// migration tool in this project; schema evolution lives here).
function columnExists(table, column) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === column);
}

function addColumnIfMissing(table, column, definition) {
  if (!columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// SQLite can't ALTER a foreign key's ON DELETE action in place - the only
// way to change it is to rebuild the table. Used to retrofit ON DELETE
// CASCADE onto ticket_comments.user_id / messages.user_id for any
// data.sqlite created before that was added, so deleting a user who has
// posted a comment/message doesn't throw a raw FOREIGN KEY constraint error.
function ensureTableSchema(table, createTableSql) {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  if (!exists) {
    db.exec(createTableSql);
    return;
  }

  const fks = db.prepare(`PRAGMA foreign_key_list(${table})`).all();
  const userFk = fks.find((fk) => fk.from === 'user_id');
  if (userFk && userFk.on_delete === 'CASCADE') return;

  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name)
    .join(', ');

  const wasForeignKeysOn = db.pragma('foreign_keys', { simple: true }) === 1;
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    db.exec(`ALTER TABLE ${table} RENAME TO ${table}_old`);
    db.exec(createTableSql);
    db.exec(`INSERT INTO ${table} (${columns}) SELECT ${columns} FROM ${table}_old`);
    db.exec(`DROP TABLE ${table}_old`);
  })();
  if (wasForeignKeysOn) db.pragma('foreign_keys = ON');
}

ensureTableSchema('ticket_comments', TICKET_COMMENTS_TABLE_SQL);
ensureTableSchema('messages', MESSAGES_TABLE_SQL);
db.exec('CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel_id, created_at)');

addColumnIfMissing('users', 'department_id', 'INTEGER REFERENCES departments(id)');

// Widen users.role's CHECK constraint to allow 'dept_lead'. SQLite can't
// ALTER a CHECK constraint in place, so the table must be rebuilt. Unlike
// ticket_comments/messages (no incoming FK references), many tables
// reference users(id) - a plain RENAME TO would make SQLite rewrite those
// other tables' REFERENCES clauses to point at "users_old" instead of
// following the name to the newly created "users" table. legacy_alter_table
// disables that rewrite, so other tables' FKs keep resolving to "users" by
// name and transparently pick up the rebuilt table (verified: cascades and
// other tables' schema text are unaffected by the rename under this mode).
function ensureUsersRoleAllowsDeptLead() {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get();
  if (row.sql.includes('dept_lead')) return;

  const columns = db
    .prepare('PRAGMA table_info(users)')
    .all()
    .map((c) => c.name)
    .join(', ');

  const wasForeignKeysOn = db.pragma('foreign_keys', { simple: true }) === 1;
  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');
  db.transaction(() => {
    db.exec('ALTER TABLE users RENAME TO users_old');
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','dept_lead','admin')),
        department_id INTEGER REFERENCES departments(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`INSERT INTO users (${columns}) SELECT ${columns} FROM users_old`);
    db.exec('DROP TABLE users_old');
  })();
  db.pragma('legacy_alter_table = OFF');
  if (wasForeignKeysOn) db.pragma('foreign_keys = ON');
}
ensureUsersRoleAllowsDeptLead();
addColumnIfMissing('tickets', 'department_id', 'INTEGER REFERENCES departments(id)');
addColumnIfMissing('todos', 'due_date', 'TEXT');
addColumnIfMissing(
  'todos',
  'priority',
  "TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high'))"
);

// Seed the fixed department set (idempotent) and backfill any pre-existing
// user/ticket rows that predate this column into the catch-all "Genel"
// department, so older data never ends up in a broken NULL-department state.
const DEFAULT_DEPARTMENTS = [
  { name: 'Donanım', slug: 'donanim' },
  { name: 'Yazılım', slug: 'yazilim' },
  { name: 'Muhasebe', slug: 'muhasebe' },
  { name: 'Genel', slug: 'genel' },
];
const insertDepartment = db.prepare(
  'INSERT OR IGNORE INTO departments (name, slug) VALUES (?, ?)'
);
for (const dept of DEFAULT_DEPARTMENTS) {
  insertDepartment.run(dept.name, dept.slug);
}

const genelDepartmentId = db
  .prepare('SELECT id FROM departments WHERE slug = ?')
  .get('genel').id;
db.prepare('UPDATE users SET department_id = ? WHERE department_id IS NULL').run(
  genelDepartmentId
);
db.prepare('UPDATE tickets SET department_id = ? WHERE department_id IS NULL').run(
  genelDepartmentId
);

// One channel per non-catch-all department, plus a NULL-department "genel"
// channel that is public to everyone regardless of their own department
// (distinct from the "Genel" department row above - a user whose own
// department is "Genel" still only sees this public channel, not a
// dedicated department channel, since none exists for it).
const insertChannel = db.prepare(
  'INSERT OR IGNORE INTO channels (department_id, name) VALUES (?, ?)'
);
for (const dept of DEFAULT_DEPARTMENTS) {
  if (dept.slug === 'genel') continue;
  const deptId = db.prepare('SELECT id FROM departments WHERE slug = ?').get(dept.slug).id;
  insertChannel.run(deptId, dept.slug);
}
insertChannel.run(null, 'genel');

module.exports = db;
module.exports.genelDepartmentId = genelDepartmentId;
module.exports.columnExists = columnExists;
module.exports.addColumnIfMissing = addColumnIfMissing;
