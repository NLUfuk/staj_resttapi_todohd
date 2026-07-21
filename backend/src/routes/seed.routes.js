const express = require('express');
const { seed } = require('../seed');

const router = express.Router();

// POST /api/admin/seed - re-seeds the full demo dataset (wipes and rebuilds
// users/todos/tickets/etc, see src/seed.js). Not behind requireAuth: on a
// fresh deploy there is no admin account yet to authenticate as, and hosts
// like Render's free tier don't offer shell access to run `npm run seed`
// directly. Gated by a shared secret instead - set SEED_SECRET and it's
// otherwise unreachable (unset entirely disables the route).
router.post('/', (req, res) => {
  const secret = process.env.SEED_SECRET;
  if (!secret) {
    return res.status(404).json({ error: 'not found' });
  }
  if (req.get('X-Seed-Secret') !== secret) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const result = seed();
  res.json({ message: 'seed complete', ...result });
});

module.exports = router;
