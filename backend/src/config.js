require('dotenv').config();

// Frontend is static and served separately (see README) - default covers the
// documented `http-server -p 5500` workflow plus the common Vite dev port.
// Override with a comma-separated CORS_ORIGINS env var for other setups.
const defaultCorsOrigins = ['http://localhost:5500', 'http://localhost:5173'];

module.exports = {
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: '15m',
  refreshTokenExpiresInDays: 30,
  port: process.env.PORT || 3000,
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : defaultCorsOrigins,
  appUrl: process.env.APP_URL || 'http://localhost:5500',
};
