const Scooter = require('../models/Scooter');
const { toDeviceKey } = require('./hash');

function getDynamicVin(deviceId, deviceKey) {
  const clean = String(deviceId || deviceKey || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const suffix = clean.length >= 6 ? clean.slice(-6) : (clean || 'SCOOT');
  return `NEX_${suffix}`;
}

/**
 * Resolves deviceId and deviceKey dynamically from URL param, request body, query, or headers.
 * Automatically provisions/upserts a record for new scooters so any scooty works immediately without 404.
 */
async function resolveDevice(req, res) {
  const rawId = req.params?.deviceId || req.body?.device_id || req.query?.deviceId || req.headers?.['x-device-id'];
  if (!rawId) {
    res.status(400).json({ status: 'error', message: 'Missing deviceId parameter' });
    return null;
  }

  const deviceId = decodeURIComponent(String(rawId)).trim();
  const deviceKey = toDeviceKey(deviceId);

  // Auto-provision scooter on first contact so any new scooter works immediately
  let scooter = await Scooter.findOne({ deviceKey }).lean();
  if (!scooter) {
    const dynamicVin = getDynamicVin(deviceId, deviceKey);
    await Scooter.updateOne(
      { deviceKey },
      {
        $setOnInsert: {
          deviceKey,
          vin: dynamicVin,
          name: '',
          firstSeenAt: new Date(),
          defaultRidingMode: 'City',
          lastOdometer: 0
        }
      },
      { upsert: true }
    ).catch(() => {});
  }

  return { deviceId, deviceKey };
}

module.exports = {
  resolveDevice,
  getDynamicVin
};
