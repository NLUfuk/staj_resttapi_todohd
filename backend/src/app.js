const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');

const { corsOrigins } = require('./config');
const openapiSpec = require('./openapi');
const authRoutes = require('./routes/auth.routes');
const todosRoutes = require('./routes/todos.routes');
const ticketsRoutes = require('./routes/tickets.routes');
const adminRoutes = require('./routes/admin.routes');
const departmentsRoutes = require('./routes/departments.routes');
const channelsRoutes = require('./routes/channels.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const listsRoutes = require('./routes/lists.routes');
const assignmentsRoutes = require('./routes/assignments.routes');

const app = express();

// Render (and most PaaS hosts) sit behind a reverse proxy that sets
// X-Forwarded-For; without this, express-rate-limit can't trust that header
// and throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR, plus every request would
// appear to come from the proxy's own IP, defeating per-IP rate limiting.
// `1` trusts exactly one hop (the platform's own proxy), not arbitrary
// client-supplied headers.
app.set('trust proxy', 1);

// Tests run in-band and expect no artificial slowdown/blocking from rate
// limiting - keep the limits generous there so the existing suite (and new
// ones) aren't flaky due to shared counters across test files.
const isTest = process.env.NODE_ENV === 'test';

app.use(helmet());
app.use(cors({ origin: corsOrigins }));
app.use(express.json());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 100000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', globalLimiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'çok fazla deneme, daha sonra tekrar deneyin' },
});
app.use('/api/auth/login', loginLimiter);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Serves the static frontend from the same origin as the API. Locally the
// documented workflow still runs frontend/backend as two separate dev
// servers (see README - http-server on :5500 + this on :3000), but a single
// deployed service (Render free tier, no second static site needed) needs
// them on one origin so relative fetch('/api/...') calls and the emailed
// verification link both resolve without CORS or a hardcoded backend URL.
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

// Interactive API docs: http://localhost:3000/api-docs
// Swagger UI's bundle relies on inline scripts/styles that the default
// helmet CSP blocks - relax CSP only for this route, everything else keeps
// the strict default.
app.use(
  '/api-docs',
  helmet({ contentSecurityPolicy: false }),
  swaggerUi.serve,
  swaggerUi.setup(openapiSpec)
);

app.use('/api/auth', authRoutes);
app.use('/api/todos', todosRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/departments', departmentsRoutes);
app.use('/api/channels', channelsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/lists', listsRoutes);
app.use('/api/assignments', assignmentsRoutes);

// 404 for unknown API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

// Centralized error handler (catches sync throws and next(err) calls)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

module.exports = app;
