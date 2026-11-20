const crypto = require('crypto');
const env = require('../config/env');

module.exports = function apiKey(req, res, next) {
  if (!env.apiKey) return next(); // disabled
  const given = Buffer.from(String(req.get('x-api-key') || ''));
  const expected = Buffer.from(env.apiKey);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return res.status(401).json({ status: 'error', message: 'Invalid API key' });
  }
  next();
};
