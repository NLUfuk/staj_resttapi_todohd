const db = require('../db');

// JWT payloads only carry { id, username, role } - department assignment
// can change after a token is issued, so it's always read fresh from the DB
// rather than trusted from the token.
function getUserDepartmentId(userId) {
  return db.prepare('SELECT department_id FROM users WHERE id = ?').get(userId).department_id;
}

module.exports = { getUserDepartmentId };
