const db = require('../db');

const insertNotification = db.prepare(
  'INSERT INTO notifications (user_id, type, ref_id, body) VALUES (?, ?, ?, ?)'
);

function notify(userId, type, refId, body) {
  insertNotification.run(userId, type, refId, body);
}

const MENTION_PATTERN = /@([a-zA-Z0-9_]+)/g;

// Extracts unique @username mentions from a chat message body and notifies
// each one that exists (skips the sender mentioning themselves).
function notifyMentions({ senderId, senderUsername, channelName, messageId, body }) {
  const usernames = new Set();
  for (const match of body.matchAll(MENTION_PATTERN)) {
    usernames.add(match[1]);
  }
  usernames.delete(senderUsername);
  if (usernames.size === 0) return;

  const findUser = db.prepare('SELECT id FROM users WHERE username = ?');
  for (const username of usernames) {
    const mentioned = findUser.get(username);
    if (!mentioned || mentioned.id === senderId) continue;
    notify(
      mentioned.id,
      'mention',
      messageId,
      `${senderUsername} #${channelName} kanalında sizden bahsetti`
    );
  }
}

module.exports = { notify, notifyMentions };
