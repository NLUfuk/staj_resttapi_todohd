const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { parsePagination, setPaginationHeaders } = require('../utils/pagination');
const { transition } = require('../utils/assignmentFsm');

const router = express.Router();
router.use(requireAuth);

const ASSIGNMENT_SELECT = `
  SELECT a.*, t.title AS todo_title,
         ua.username AS assigner_username, ub.username AS assignee_username
  FROM assignments a
  JOIN todos t ON t.id = a.todo_id
  JOIN users ua ON ua.id = a.assigner_id
  JOIN users ub ON ub.id = a.assignee_id
`;

const VALID_STATUS = ['pending', 'accepted', 'completed', 'rejected', 'revision', 'cancelled'];

function runTransitionRoute(action) {
  return (req, res) => {
    const { comment } = req.body;
    const result = transition({
      assignmentId: req.params.id,
      actorId: req.user.id,
      actorUsername: req.user.username,
      action,
      comment,
    });
    if (!result.ok) {
      return res.status(result.code).json({ error: result.error });
    }
    res.json(result.assignment);
  };
}

router.post('/:id/accept', runTransitionRoute('accept'));
router.post('/:id/reject', runTransitionRoute('reject'));
router.post('/:id/revise', runTransitionRoute('revise'));
router.post('/:id/resend', runTransitionRoute('resend'));
router.post('/:id/complete', runTransitionRoute('complete'));
router.post('/:id/cancel', runTransitionRoute('cancel'));

// GET /api/assignments/incoming?status=&page=&limit= - assignments made TO me
router.get('/incoming', (req, res) => {
  const { status } = req.query;
  if (status !== undefined && !VALID_STATUS.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUS.join(', ')}` });
  }

  const where = ['a.assignee_id = ?'];
  const params = [req.user.id];
  if (status !== undefined) {
    where.push('a.status = ?');
    params.push(status);
  }
  const whereClause = where.join(' AND ');

  const totalCount = db
    .prepare(`SELECT COUNT(*) AS c FROM assignments a WHERE ${whereClause}`)
    .get(...params).c;
  const { page, limit, offset } = parsePagination(req.query);

  const rows = db
    .prepare(`${ASSIGNMENT_SELECT} WHERE ${whereClause} ORDER BY a.updated_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  setPaginationHeaders(req, res, { page, limit, totalCount });
  res.json(rows);
});

// GET /api/assignments/outgoing?status=&page=&limit= - assignments I made
router.get('/outgoing', (req, res) => {
  const { status } = req.query;
  if (status !== undefined && !VALID_STATUS.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUS.join(', ')}` });
  }

  const where = ['a.assigner_id = ?'];
  const params = [req.user.id];
  if (status !== undefined) {
    where.push('a.status = ?');
    params.push(status);
  }
  const whereClause = where.join(' AND ');

  const totalCount = db
    .prepare(`SELECT COUNT(*) AS c FROM assignments a WHERE ${whereClause}`)
    .get(...params).c;
  const { page, limit, offset } = parsePagination(req.query);

  const rows = db
    .prepare(`${ASSIGNMENT_SELECT} WHERE ${whereClause} ORDER BY a.updated_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  setPaginationHeaders(req, res, { page, limit, totalCount });
  res.json(rows);
});

// GET /api/assignments/:id/timeline - chronological assignment_events, parties only
router.get('/:id/timeline', (req, res) => {
  const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);
  if (
    !assignment ||
    (assignment.assigner_id !== req.user.id && assignment.assignee_id !== req.user.id)
  ) {
    // 404 either way - don't leak whether the assignment exists to a non-party.
    return res.status(404).json({ error: 'assignment not found' });
  }

  const events = db
    .prepare(
      `SELECT e.*, u.username AS actor_username
       FROM assignment_events e
       JOIN users u ON u.id = e.actor_id
       WHERE e.assignment_id = ?
       ORDER BY e.created_at ASC, e.id ASC`
    )
    .all(assignment.id);

  res.json(events);
});

module.exports = router;
