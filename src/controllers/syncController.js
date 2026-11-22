const Scooter = require('../models/Scooter');
const DailyUsage = require('../models/DailyUsage');
const SyncLog = require('../models/SyncLog');
const Trip = require('../models/Trip');
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

  // Daily usage updates
  const dailySet = {
    endOdometer: b.odometer_km,
    endSoc: b.soc_percent
  };
  if (b.avg_speed_kmh) dailySet.avgSpeedKmh = b.avg_speed_kmh;
  if (b.top_speed_kmh) dailySet.maxSpeedKmh = b.top_speed_kmh;

  const dailyInc = {
    distanceKm: distance,
    socConsumed: socDrop,
    syncCount: 1
  };
  if (b.ride_time_mins) dailyInc.rideTimeMins = b.ride_time_mins;
  if (b.trip_km > 0) dailyInc.tripCount = 1;

  await DailyUsage.updateOne(
    { deviceKey, date: dayKey(b.sync_timestamp) },
    {
      $inc: dailyInc,
      $set: dailySet,
      $setOnInsert: { startOdometer: prevOdo, startSoc: prevSoc ?? b.soc_percent }
    },
    { upsert: true }
  );

  // Scooter hardware & live state updates
  const scooterSet = {
    lastSyncTimestamp: b.sync_timestamp,
    lastOdometer: b.odometer_km,
    lastSoc: b.soc_percent,
    lastRangeKm: b.remaining_range_km ?? Math.round(b.soc_percent * 1.4),
    lastRidingMode: b.riding_mode || scooter?.lastRidingMode || 'City',
    appVersion: b.app_version
  };

  if (b.battery_voltage) scooterSet.batteryVoltage = b.battery_voltage;
  if (b.battery_current) scooterSet.batteryCurrent = b.battery_current;
  if (b.battery_temp) scooterSet.batteryTemp = b.battery_temp;
  if (b.cell_delta_v) scooterSet.cellDeltaV = b.cell_delta_v;
  if (b.battery_soh) scooterSet.batterySoh = b.battery_soh;

  // If a trip is reported during this sync, record it
  if (b.trip_km > 0.1) {
    const tripId = b.trip_id || `TRIP_${b.sync_timestamp}`;
    const rideDuration = b.ride_time_mins || Math.round((b.trip_km / (b.avg_speed_kmh || 25)) * 60) || 15;
    const efficiency = socDrop > 0 ? Number((b.trip_km / socDrop).toFixed(2)) : 1.94;

    const tripSnapshot = {
      tripId,
      distanceKm: b.trip_km,
      durationMins: rideDuration,
      avgSpeedKmh: b.avg_speed_kmh || 24,
      topSpeedKmh: b.top_speed_kmh || 67,
      batteryUsedPct: socDrop,
      startSoc: prevSoc ?? b.soc_percent,
      endSoc: b.soc_percent,
      ridingMode: b.riding_mode || 'City',
      efficiencyKmPerPct: efficiency,
      energyConsumedKwh: Number((b.trip_km * 0.042).toFixed(2)),
      regenRecapturedKwh: Number((b.trip_km * 0.007).toFixed(2)),
      endTime: new Date(b.sync_timestamp)
    };

    scooterSet.lastTrip = tripSnapshot;

    // Persist to Trip collection
    await Trip.updateOne(
      { deviceKey, tripId },
      { $setOnInsert: { deviceKey, ...tripSnapshot, startTime: new Date(b.sync_timestamp - rideDuration * 60000) } },
      { upsert: true }
    ).catch(() => {});
  }

  await Scooter.updateOne(
    { deviceKey },
    {
      $set: scooterSet,
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
        appVersion: body.app_version,
        batteryVoltage: body.battery_voltage,
        batteryTemp: body.battery_temp,
        cellDeltaV: body.cell_delta_v,
        avgSpeedKmh: body.avg_speed_kmh
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
