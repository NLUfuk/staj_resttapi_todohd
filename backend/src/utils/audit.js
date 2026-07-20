const db = require('../db');

const insertAuditLog = db.prepare(
  'INSERT INTO audit_logs (user_id, action, target) VALUES (?, ?, ?)'
);

// Only write-critical actions are logged (deletion, role changes, ticket
// closure) - not every read/update, to keep the log meaningful.
function audit(userId, action, target) {
  insertAuditLog.run(userId, action, target);
}

module.exports = { audit };
