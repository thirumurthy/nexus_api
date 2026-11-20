const Scooter = require('../models/Scooter');
const DailyUsage = require('../models/DailyUsage');
const SyncLog = require('../models/SyncLog');
const { syncSchema } = require('../middleware/validate');
const { toDeviceKey } = require('../utils/hash');
const { dayKey } = require('../utils/date');
const { buildInsights } = require('../services/insightsService');

async function applySync(deviceKey, b) {
  const scooter = await Scooter.findOne({ deviceKey }).lean();

  // Out-of-order (older) offline syncs are logged but don't rewind aggregates
  if (scooter && b.sync_timestamp < scooter.lastSyncTimestamp) return;

  const prevOdo = scooter ? scooter.lastOdometer : Math.max(0, b.odometer_km - b.trip_km);
  const prevSoc = scooter?.lastSoc;

  const distance = Math.max(0, b.odometer_km - prevOdo);
  const socDrop = prevSoc != null && distance > 0 ? Math.max(0, prevSoc - b.soc_percent) : 0;

  await DailyUsage.updateOne(
    { deviceKey, date: dayKey(b.sync_timestamp) },
    {
      $inc: { distanceKm: distance, socConsumed: socDrop, syncCount: 1 },
      $set: { endOdometer: b.odometer_km, endSoc: b.soc_percent },
      $setOnInsert: { startOdometer: prevOdo, startSoc: prevSoc ?? b.soc_percent }
    },
    { upsert: true }
  );

  await Scooter.updateOne(
    { deviceKey },
    {
      $set: {
        lastSyncTimestamp: b.sync_timestamp,
        lastOdometer: b.odometer_km,
        lastSoc: b.soc_percent,
        lastRangeKm: b.remaining_range_km,
        lastRidingMode: b.riding_mode,
        appVersion: b.app_version
      },
      $setOnInsert: { firstSeenAt: new Date() }
    },
    { upsert: true }
  );
}

exports.sync = async (req, res, next) => {
  try {
    const body = syncSchema.parse(req.body);
    if (body.sync_timestamp > Date.now() + 86400000) {
      return res.status(400).json({ status: 'error', message: 'sync_timestamp is in the future' });
    }

    const deviceKey = toDeviceKey(body.device_id);
    let duplicate = false;

    try {
      await SyncLog.create({
        deviceKey,
        syncTimestamp: body.sync_timestamp,
        trigger: body.trigger,
        odometerKm: body.odometer_km,
        tripKm: body.trip_km,
        socPercent: body.soc_percent,
        remainingRangeKm: body.remaining_range_km,
        ridingMode: body.riding_mode,
        appVersion: body.app_version
      });
    } catch (err) {
      if (err.code === 11000) duplicate = true;
      else throw err;
    }

    if (!duplicate) await applySync(deviceKey, body);

    const payload = await buildInsights(deviceKey, body.device_id);
    res.status(duplicate ? 200 : 201).json(payload);
  } catch (err) {
    next(err);
  }
};
