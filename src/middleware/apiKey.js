const crypto = require('crypto');
const env = require('../config/env');

module.exports = function apiKey(req, res, next) {
  if (!env.apiKey) return next(); // disabled if no API_KEY configured
  const givenKey = req.get('x-api-key') || req.query.apiKey || '';
  const given = Buffer.from(String(givenKey));
  const expected = Buffer.from(env.apiKey);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return res.status(401).json({ status: 'error', message: 'Invalid API key' });
  }
  next();
};
