const crypto = require('crypto');
const env = require('../config/env');

module.exports = function apiKey(req, res, next) {
  const expectedKey = String(env.apiKey || '').trim().replace(/^["']|["']$/g, '');
  if (!expectedKey) return next(); // auth disabled if API_KEY is not set

  // Accept key from header x-api-key, Bearer token, or query parameter apiKey / api_key
  const bearerToken = req.headers['authorization']?.replace(/^Bearer\s+/i, '') || '';
  const givenKey = String(req.get('x-api-key') || bearerToken || req.query.apiKey || req.query.api_key || '')
    .trim()
    .replace(/^["']|["']$/g, '');

  if (givenKey.length !== expectedKey.length || !crypto.timingSafeEqual(Buffer.from(givenKey), Buffer.from(expectedKey))) {
    return res.status(401).json({ status: 'error', message: 'Invalid API key' });
  }

  next();
};
