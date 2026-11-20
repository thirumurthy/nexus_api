const crypto = require('crypto');
const env = require('../config/env');

const MAC_RE = /^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/i;

/**
 * Raw MAC  -> SHA-256(salt + MAC)  (server-side privacy hashing)
 * Anything else (already hashed by the app, e.g. "nx_a9b8...") -> used as-is, lowercased.
 * Pick ONE scheme in the app and stick with it so the ID stays 1:1 stable.
 */
function toDeviceKey(deviceId) {
  const id = String(deviceId).trim();
  if (MAC_RE.test(id)) {
    const mac = id.toUpperCase().replace(/-/g, ':');
    return crypto.createHash('sha256').update(env.deviceSalt + mac).digest('hex');
  }
  return id.toLowerCase();
}

module.exports = { toDeviceKey };
