require('dotenv').config();

module.exports = {
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: '2h',
  port: process.env.PORT || 3000,
};
