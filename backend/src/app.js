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

const app = express();

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

// 404 for unknown API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

// Centralized error handler (catches sync throws and next(err) calls)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

module.exports = app;
