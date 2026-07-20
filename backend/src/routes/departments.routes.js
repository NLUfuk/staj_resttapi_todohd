const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { audit } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);

const TURKISH_CHAR_MAP = {
  İ: 'i',
  I: 'i',
  ı: 'i',
  ğ: 'g',
  Ğ: 'g',
  ü: 'u',
  Ü: 'u',
  ş: 's',
  Ş: 's',
  ö: 'o',
  Ö: 'o',
  ç: 'c',
  Ç: 'c',
};

// Map Turkish characters explicitly before toLowerCase(): JS's locale-unaware
// toLowerCase() turns "İ" into "i" + a combining dot above (U+0307), not
// plain "i", which corrupts slugs for capitalized Turkish department names.
function slugify(name) {
  return name
    .trim()
    .replace(/[İIığĞüÜşŞöÖçÇ]/g, (ch) => TURKISH_CHAR_MAP[ch])
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// GET /api/departments - any authenticated user
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM departments ORDER BY name ASC').all();
  res.json(rows);
});

// POST /api/departments - admin only
router.post('/', requireRole('admin'), (req, res) => {
  const { name } = req.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'name is required' });
  }

  const trimmed = name.trim();
  const slug = slugify(trimmed);
  if (!slug) {
    return res.status(400).json({ error: 'name must contain at least one alphanumeric character' });
  }

  const existing = db
    .prepare('SELECT id FROM departments WHERE name = ? OR slug = ?')
    .get(trimmed, slug);
  if (existing) {
    return res.status(409).json({ error: 'a department with this name already exists' });
  }

  const info = db
    .prepare('INSERT INTO departments (name, slug) VALUES (?, ?)')
    .run(trimmed, slug);
  const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(dept);
});

// PATCH /api/departments/:id - admin only, rename
router.patch('/:id', requireRole('admin'), (req, res) => {
  const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
  if (!dept) {
    return res.status(404).json({ error: 'department not found' });
  }

  const { name } = req.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'name is required' });
  }

  const trimmed = name.trim();
  const slug = slugify(trimmed);
  if (!slug) {
    return res.status(400).json({ error: 'name must contain at least one alphanumeric character' });
  }

  const existing = db
    .prepare('SELECT id FROM departments WHERE (name = ? OR slug = ?) AND id != ?')
    .get(trimmed, slug, dept.id);
  if (existing) {
    return res.status(409).json({ error: 'a department with this name already exists' });
  }

  db.prepare('UPDATE departments SET name = ?, slug = ? WHERE id = ?').run(trimmed, slug, dept.id);
  const updated = db.prepare('SELECT * FROM departments WHERE id = ?').get(dept.id);
  res.json(updated);
});

// DELETE /api/departments/:id - admin only, refuses if the department still has members or tickets
router.delete('/:id', requireRole('admin'), (req, res) => {
  const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
  if (!dept) {
    return res.status(404).json({ error: 'department not found' });
  }

  const memberCount = db
    .prepare('SELECT COUNT(*) AS c FROM users WHERE department_id = ?')
    .get(dept.id).c;
  const ticketCount = db
    .prepare('SELECT COUNT(*) AS c FROM tickets WHERE department_id = ?')
    .get(dept.id).c;
  if (memberCount > 0 || ticketCount > 0) {
    return res.status(409).json({
      error: 'department still has members or tickets and cannot be deleted',
    });
  }

  db.prepare('DELETE FROM departments WHERE id = ?').run(dept.id);
  audit(req.user.id, 'department.delete', `departments:${dept.id}`);
  res.status(204).send();
});

module.exports = router;
