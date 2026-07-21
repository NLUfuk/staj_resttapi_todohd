const db = require('../db');
const { notify } = require('./notify');

const AssignmentStatus = Object.freeze({
  PENDING: 'pending',
  REVISION: 'revision',
  ACCEPTED: 'accepted',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

// { currentStatus: { action: { to, by, requireComment } } }
// completed / rejected / cancelled are terminal - no outgoing transitions.
const transitions = {
  pending: {
    accept: { to: 'accepted', by: 'assignee', requireComment: false },
    reject: { to: 'rejected', by: 'assignee', requireComment: true },
    revise: { to: 'revision', by: 'assignee', requireComment: true },
    cancel: { to: 'cancelled', by: 'assigner', requireComment: false },
  },
  revision: {
    resend: { to: 'pending', by: 'assigner', requireComment: false },
    cancel: { to: 'cancelled', by: 'assigner', requireComment: false },
  },
  accepted: {
    complete: { to: 'completed', by: 'assignee', requireComment: false },
    cancel: { to: 'cancelled', by: 'assigner', requireComment: false },
  },
};

const NOTIFICATION_MESSAGES = {
  accept: (actorName) => `${actorName} atamanızı kabul etti`,
  reject: (actorName) => `${actorName} atamanızı reddetti`,
  revise: (actorName) => `${actorName} atamanız için revizyon istedi`,
  resend: (actorName) => `${actorName} revize edilen görevi tekrar gönderdi`,
  complete: (actorName) => `${actorName} atadığınız görevi tamamladı`,
  cancel: (actorName) => `${actorName} atamayı iptal etti`,
};

// Notify whoever didn't perform the action: an assignee-performed action
// (accept/reject/revise/complete) notifies the assigner, an assigner-
// performed one (resend/cancel) notifies the assignee. 'assign' itself is
// handled separately by the assign route, since no assignment row exists yet.
function notifyCounterpart(assignment, action, by, actorUsername) {
  const recipientId = by === 'assignee' ? assignment.assigner_id : assignment.assignee_id;
  notify(recipientId, 'assignment', assignment.id, NOTIFICATION_MESSAGES[action](actorUsername));
}

// Single choke point for every assignment status change. Routes never write
// `status` directly - they all call transition() so the same validity/role/
// comment/event/notify sequence applies everywhere.
//
// Returns { ok:true, assignment } or { ok:false, code, error } - the caller
// (route) maps `code` to an HTTP status, following this project's existing
// plain res.status(x).json({error}) style instead of a thrown HttpError class.
function transition({ assignmentId, actorId, actorUsername, action, comment }) {
  const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(assignmentId);
  if (!assignment) {
    return { ok: false, code: 404, error: 'assignment not found' };
  }

  const stateTransitions = transitions[assignment.status] || {};
  const rule = stateTransitions[action];
  if (!rule) {
    return {
      ok: false,
      code: 409,
      error: `cannot ${action} an assignment in status '${assignment.status}'`,
    };
  }

  const expectedActorId = rule.by === 'assignee' ? assignment.assignee_id : assignment.assigner_id;
  if (actorId !== expectedActorId) {
    return { ok: false, code: 403, error: `only the ${rule.by} can perform this action` };
  }

  if (rule.requireComment && (typeof comment !== 'string' || comment.trim().length === 0)) {
    return { ok: false, code: 400, error: 'comment is required for this action' };
  }

  const runTransition = db.transaction(() => {
    db.prepare(
      `INSERT INTO assignment_events (assignment_id, actor_id, action, from_status, to_status, comment)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(assignment.id, actorId, action, assignment.status, rule.to, comment ? comment.trim() : null);

    db.prepare(
      `UPDATE assignments SET status = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(rule.to, assignment.id);

    notifyCounterpart(assignment, action, rule.by, actorUsername);

    return db.prepare('SELECT * FROM assignments WHERE id = ?').get(assignment.id);
  });

  const updated = runTransition();
  return { ok: true, assignment: updated };
}

module.exports = { AssignmentStatus, transitions, transition };
