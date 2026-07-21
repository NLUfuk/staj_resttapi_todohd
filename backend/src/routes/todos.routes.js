const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { parsePagination, setPaginationHeaders } = require('../utils/pagination');
const { notify } = require('../utils/notify');

const router = express.Router();
router.use(requireAuth);

const VALID_STATUS = ['pending', 'done'];
const VALID_PRIORITY = ['low', 'medium', 'high'];
const VALID_SORT_FIELDS = ['created_at', 'updated_at', 'due_date', 'priority', 'title'];
const VALID_ORDER = ['asc', 'desc'];

function isValidDueDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

// All routes here are scoped to req.user.id - users only ever see/modify their own todos.

// GET /api/todos?page=&limit=&status=&priority=&sort=&order=
router.get('/', (req, res) => {
  const { status, priority, sort, order } = req.query;

  if (status !== undefined && !VALID_STATUS.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUS.join(', ')}` });
  }
  if (priority !== undefined && !VALID_PRIORITY.includes(priority)) {
    return res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITY.join(', ')}` });
  }
  if (sort !== undefined && !VALID_SORT_FIELDS.includes(sort)) {
    return res.status(400).json({ error: `sort must be one of: ${VALID_SORT_FIELDS.join(', ')}` });
  }
  if (order !== undefined && !VALID_ORDER.includes(order)) {
    return res.status(400).json({ error: `order must be one of: ${VALID_ORDER.join(', ')}` });
  }

  const where = ['user_id = ?'];
  const params = [req.user.id];
  if (status !== undefined) {
    where.push('status = ?');
    params.push(status);
  }
  if (priority !== undefined) {
    where.push('priority = ?');
    params.push(priority);
  }
  const whereClause = where.join(' AND ');

  const totalCount = db
    .prepare(`SELECT COUNT(*) AS c FROM todos WHERE ${whereClause}`)
    .get(...params).c;

  const { page, limit, offset } = parsePagination(req.query);
  const sortField = sort || 'created_at';
  const sortOrder = (order || 'desc').toUpperCase();

  const rows = db
    .prepare(
      `SELECT * FROM todos WHERE ${whereClause}
       ORDER BY ${sortField} ${sortOrder}
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  setPaginationHeaders(req, res, { page, limit, totalCount });
  res.json(rows);
});

// POST /api/todos
router.post('/', (req, res) => {
  const { title, description, due_date, priority, list_id } = req.body;

  if (typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (due_date !== undefined && due_date !== null && !isValidDueDate(due_date)) {
    return res.status(400).json({ error: 'due_date must be a valid ISO 8601 date string' });
  }
  if (priority !== undefined && !VALID_PRIORITY.includes(priority)) {
    return res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITY.join(', ')}` });
  }

  let listId;
  if (list_id !== undefined && list_id !== null) {
    if (!Number.isInteger(list_id)) {
      return res.status(400).json({ error: 'list_id must be an integer' });
    }
    const list = db
      .prepare('SELECT id FROM todo_lists WHERE id = ? AND owner_id = ?')
      .get(list_id, req.user.id);
    if (!list) {
      return res.status(404).json({ error: 'list not found' });
    }
    listId = list.id;
  } else {
    listId = db.ensureDefaultListForUser(req.user.id);
  }

  const info = db
    .prepare(
      `INSERT INTO todos (user_id, title, description, due_date, priority, list_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user.id,
      title.trim(),
      description || null,
      due_date || null,
      priority || 'medium',
      listId
    );

  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(todo);
});

// GET /api/todos/:id
router.get('/:id', (req, res) => {
  const todo = db
    .prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!todo) {
    return res.status(404).json({ error: 'todo not found' });
  }
  res.json(todo);
});

// PUT /api/todos/:id
router.put('/:id', (req, res) => {
  const todo = db
    .prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!todo) {
    return res.status(404).json({ error: 'todo not found' });
  }

  const { title, description, status, due_date, priority } = req.body;
  if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
    return res.status(400).json({ error: 'title must be a non-empty string' });
  }
  if (status !== undefined && !VALID_STATUS.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUS.join(', ')}` });
  }
  if (due_date !== undefined && due_date !== null && !isValidDueDate(due_date)) {
    return res.status(400).json({ error: 'due_date must be a valid ISO 8601 date string' });
  }
  if (priority !== undefined && !VALID_PRIORITY.includes(priority)) {
    return res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITY.join(', ')}` });
  }

  db.prepare(
    `UPDATE todos
     SET title = ?, description = ?, status = ?, due_date = ?, priority = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    title !== undefined ? title.trim() : todo.title,
    description !== undefined ? description : todo.description,
    status !== undefined ? status : todo.status,
    due_date !== undefined ? due_date : todo.due_date,
    priority !== undefined ? priority : todo.priority,
    todo.id
  );

  const updated = db.prepare('SELECT * FROM todos WHERE id = ?').get(todo.id);
  res.json(updated);
});

// DELETE /api/todos/:id
router.delete('/:id', (req, res) => {
  const info = db
    .prepare('DELETE FROM todos WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'todo not found' });
  }
  res.status(204).send();
});

// POST /api/todos/:id/assign - { assignee_username } or { assignee_id }.
// Only the todo owner can assign; creates the assignment + its opening
// 'assign' timeline event and notifies the assignee, all in one transaction.
router.post('/:id/assign', (req, res) => {
  const todo = db
    .prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!todo) {
    return res.status(404).json({ error: 'todo not found' });
  }

  const { assignee_username, assignee_id } = req.body;
  let assignee;
  if (assignee_id !== undefined) {
    if (!Number.isInteger(assignee_id)) {
      return res.status(400).json({ error: 'assignee_id must be an integer' });
    }
    assignee = db.prepare('SELECT id, username FROM users WHERE id = ?').get(assignee_id);
  } else if (typeof assignee_username === 'string' && assignee_username.trim().length > 0) {
    assignee = db
      .prepare('SELECT id, username FROM users WHERE username = ?')
      .get(assignee_username.trim());
  } else {
    return res.status(400).json({ error: 'assignee_username or assignee_id is required' });
  }

  if (!assignee) {
    return res.status(404).json({ error: 'assignee not found' });
  }
  if (assignee.id === req.user.id) {
    return res.status(400).json({ error: 'cannot assign a task to yourself' });
  }

  const createAssignment = db.transaction(() => {
    const info = db
      .prepare(
        'INSERT INTO assignments (todo_id, assigner_id, assignee_id) VALUES (?, ?, ?)'
      )
      .run(todo.id, req.user.id, assignee.id);

    db.prepare(
      `INSERT INTO assignment_events (assignment_id, actor_id, action, from_status, to_status, comment)
       VALUES (?, ?, 'assign', NULL, 'pending', NULL)`
    ).run(info.lastInsertRowid, req.user.id);

    notify(
      assignee.id,
      'assignment',
      info.lastInsertRowid,
      `${req.user.username} size "${todo.title}" görevini atadı`
    );

    return db.prepare('SELECT * FROM assignments WHERE id = ?').get(info.lastInsertRowid);
  });

  const assignment = createAssignment();
  res.status(201).json(assignment);
});

module.exports = router;
