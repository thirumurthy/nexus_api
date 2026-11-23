const Scooter = require('../models/Scooter');
const DailyUsage = require('../models/DailyUsage');
const SyncLog = require('../models/SyncLog');
const Trip = require('../models/Trip');
const { syncSchema } = require('../middleware/validate');
const { toDeviceKey } = require('../utils/hash');
const { dayKey, daysAgoKey } = require('../utils/date');
const { buildInsights } = require('../services/insightsService');

async function applySync(deviceKey, b) {
  const scooter = await Scooter.findOne({ deviceKey }).lean();

  // Out-of-order (older) offline syncs are logged but don't rewind aggregates
  if (scooter && b.sync_timestamp < scooter.lastSyncTimestamp) return;

  const today = dayKey(b.sync_timestamp);
  const yesterday = daysAgoKey(b.sync_timestamp, 1);
  const prevSoc = scooter?.lastSoc;

  // ─── 1. Reliable Baseline & Today's Distance Calculation ──────────────────
  // Per Ampere Nexus cluster specifications:
  // - Cluster Trip meter is cumulative/non-resettable in hardware.
  // - Cluster Odometer reading is the ONLY reliable absolute truth.
  // - Distance driven today = today's odometer reading - yesterday's final odometer reading.
  // - If the difference is > 300 km or < 0 km, ignore (charging takes ~3 hrs, 90 km per charge max).
  // - Ignore any packet reporting odometer <= 0 (uninitialized / disconnected fallback).

  const isValidOdo = typeof b.odometer_km === 'number' && b.odometer_km > 0;
  let reliableTodayDistance = null;

  if (isValidOdo) {
    // 1. Locate yesterday's odometer
    let yesterdayUsage = await DailyUsage.findOne({ deviceKey, date: yesterday }).lean();
    let baselineOdo = (yesterdayUsage && yesterdayUsage.endOdometer > 0) ? yesterdayUsage.endOdometer : null;

    // 2. If yesterday has no valid endOdometer, find the most recent prior day with endOdometer > 0
    if (!baselineOdo) {
      const priorDay = await DailyUsage.findOne({
        deviceKey,
        date: { $lt: today },
        endOdometer: { $gt: 0 }
      }).sort({ date: -1 }).lean();
      if (priorDay && priorDay.endOdometer > 0) {
        baselineOdo = priorDay.endOdometer;
      }
    }

    // 3. Fallback to startOdometer of today if already recorded
    const existingToday = await DailyUsage.findOne({ deviceKey, date: today }).lean();
    if (!baselineOdo && existingToday && existingToday.startOdometer > 0) {
      baselineOdo = existingToday.startOdometer;
    }

    if (baselineOdo && baselineOdo > 0) {
      const odoDiff = b.odometer_km - baselineOdo;
      if (odoDiff >= 0 && odoDiff <= 300) {
        reliableTodayDistance = Number(odoDiff.toFixed(1));
      } else {
        // Difference > 300km is impossible on a single day, or negative roll. Keep existing today distance.
        reliableTodayDistance = existingToday?.distanceKm ?? 0;
      }
    } else {
      // First ever sync with valid odometer
      reliableTodayDistance = 0;
    }
  }

  // ─── 2. Daily Usage Persistence ──────────────────────────────────────────
  const dailySet = {
    endSoc: b.soc_percent
  };
  if (isValidOdo) {
    dailySet.endOdometer = b.odometer_km;
    if (reliableTodayDistance !== null) {
      dailySet.distanceKm = reliableTodayDistance;
    }
  }
  if (b.avg_speed_kmh) dailySet.avgSpeedKmh = b.avg_speed_kmh;
  if (b.top_speed_kmh) dailySet.maxSpeedKmh = b.top_speed_kmh;

  const socDrop = (prevSoc != null && b.soc_percent < prevSoc) ? (prevSoc - b.soc_percent) : 0;
  const dailyInc = {
    syncCount: 1,
    socConsumed: socDrop
  };
  if (b.ride_time_mins) dailyInc.rideTimeMins = b.ride_time_mins;

  await DailyUsage.updateOne(
    { deviceKey, date: today },
    {
      $inc: dailyInc,
      $set: dailySet,
      $setOnInsert: {
        startOdometer: isValidOdo ? b.odometer_km : (scooter?.lastOdometer || 0),
        startSoc: prevSoc ?? b.soc_percent
      }
    },
    { upsert: true }
  );

  // ─── 3. Scooter Hardware & Live State Updates ────────────────────────────
  const scooterSet = {
    lastSyncTimestamp: b.sync_timestamp,
    lastSoc: b.soc_percent,
    lastRangeKm: b.remaining_range_km ?? Math.round(b.soc_percent * 1.4),
    lastRidingMode: b.riding_mode || scooter?.lastRidingMode || 'City',
    appVersion: b.app_version
  };

  // Only update lastOdometer if incoming reading is positive and valid
  if (isValidOdo) {
    scooterSet.lastOdometer = b.odometer_km;
  }

  if (b.battery_voltage) scooterSet.batteryVoltage = b.battery_voltage;
  if (b.battery_current) scooterSet.batteryCurrent = b.battery_current;
  if (b.battery_temp) scooterSet.batteryTemp = b.battery_temp;
  if (b.cell_delta_v) scooterSet.cellDeltaV = b.cell_delta_v;
  if (b.battery_soh) scooterSet.batterySoh = b.battery_soh;

  // ─── 4. Trip Processing (Reliable Odo Delta / Clamped) ───────────────────
  // Since cluster trip meter is non-resettable, a ride's distance is calculated from odometer advance
  if (isValidOdo && scooter?.lastOdometer && scooter.lastOdometer > 0) {
    const tripDist = Number((b.odometer_km - scooter.lastOdometer).toFixed(1));
    // Record trip only if distance is realistic (between 0.1 and 100 km)
    if (tripDist >= 0.1 && tripDist <= 100) {
      const tripId = b.trip_id || `TRIP_${b.sync_timestamp}`;
      const rideDuration = b.ride_time_mins || Math.round((tripDist / (b.avg_speed_kmh || 25)) * 60) || 5;
      const efficiency = socDrop > 0 ? Number((tripDist / socDrop).toFixed(2)) : 1.94;

      const tripSnapshot = {
        tripId,
        distanceKm: tripDist,
        durationMins: rideDuration,
        avgSpeedKmh: b.avg_speed_kmh || 24,
        topSpeedKmh: b.top_speed_kmh || 67,
        batteryUsedPct: socDrop,
        startSoc: prevSoc ?? b.soc_percent,
        endSoc: b.soc_percent,
        ridingMode: b.riding_mode || 'City',
        efficiencyKmPerPct: efficiency,
        energyConsumedKwh: Number((tripDist * 0.042).toFixed(2)),
        regenRecapturedKwh: Number((tripDist * 0.007).toFixed(2)),
        endTime: new Date(b.sync_timestamp)
      };

      scooterSet.lastTrip = tripSnapshot;

      await Trip.updateOne(
        { deviceKey, tripId },
        { $setOnInsert: { deviceKey, ...tripSnapshot, startTime: new Date(b.sync_timestamp - rideDuration * 60000) } },
        { upsert: true }
      ).catch(() => {});

      await DailyUsage.updateOne(
        { deviceKey, date: today },
        { $inc: { tripCount: 1 } }
      ).catch(() => {});
    }
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
