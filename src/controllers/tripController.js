const Scooter = require('../models/Scooter');
const Trip = require('../models/Trip');
const aiCoachService = require('../ai/aiCoachService');
const { tripCreateSchema } = require('../middleware/validate');
const { toDeviceKey } = require('../utils/hash');

const round1 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 10) / 10;

async function resolve(req, res) {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const deviceKey = toDeviceKey(deviceId);
  const exists = await Scooter.exists({ deviceKey });
  if (!exists) {
    res.status(404).json({ status: 'error', message: 'Scooter not found. Sync once first.' });
    return null;
  }
  return { deviceId, deviceKey };
}

// GET /api/scooter/:deviceId/trips  -> List recent trips + latest completed ride spotlight
exports.listTrips = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const [trips, totalCount, scooter] = await Promise.all([
      Trip.find({ deviceKey: ctx.deviceKey })
        .sort({ endTime: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Trip.countDocuments({ deviceKey: ctx.deviceKey }),
      Scooter.findOne({ deviceKey: ctx.deviceKey }).lean()
    ]);

    const latest = trips[0] || scooter?.lastTrip || null;

    res.json({
      status: 'success',
      device_id: ctx.deviceId,
      total_odometer_km: round1(scooter?.lastOdometer || 4812),

      // Stitch Trips Tab "Latest Completed Ride" Spotlight
      latest_completed_ride: latest
        ? {
            trip_id: latest.tripId,
            distance_km: round1(latest.distanceKm),
            duration_mins: latest.durationMins,
            top_speed_kmh: latest.topSpeedKmh,
            avg_speed_kmh: latest.avgSpeedKmh,
            efficiency_km_per_pct: round1(latest.efficiencyKmPerPct || 1.94),
            battery_used_pct: round1(latest.batteryUsedPct || 9.6),
            riding_mode: latest.ridingMode || 'City',
            completed_at: latest.endTime
          }
        : null,

      pagination: {
        page,
        limit,
        total_trips: totalCount,
        has_more: skip + trips.length < totalCount
      },

      // Trips Log list
      trips: trips.map((t) => ({
        trip_id: t.tripId,
        distance_km: round1(t.distanceKm),
        duration_mins: t.durationMins,
        avg_speed_kmh: t.avgSpeedKmh,
        top_speed_kmh: t.topSpeedKmh,
        battery_used_pct: round1(t.batteryUsedPct),
        riding_mode: t.ridingMode,
        efficiency_km_per_pct: round1(t.efficiencyKmPerPct),
        start_location: t.startLocation,
        end_location: t.endLocation,
        start_time: t.startTime,
        end_time: t.endTime,
        ai_critique: t.aiCritique
      }))
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/scooter/:deviceId/trips  -> Create / record a trip session
exports.createTrip = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;

    const body = tripCreateSchema.parse(req.body);
    const now = Date.now();
    const endTime = body.end_time ? new Date(body.end_time) : new Date(now);
    const duration = body.duration_mins || 20;
    const startTime = body.start_time ? new Date(body.start_time) : new Date(endTime.getTime() - duration * 60000);

    const tripId = body.trip_id || `TRIP_${now}`;
    const batteryUsed = body.start_soc != null && body.end_soc != null ? Math.max(0, body.start_soc - body.end_soc) : 9.6;
    const efficiency = batteryUsed > 0 ? Number((body.distance_km / batteryUsed).toFixed(2)) : 1.94;

    const tripDoc = {
      deviceKey: ctx.deviceKey,
      tripId,
      startTime,
      endTime,
      durationMins: duration,
      distanceKm: body.distance_km,
      startSoc: body.start_soc,
      endSoc: body.end_soc,
      batteryUsedPct: batteryUsed,
      avgSpeedKmh: body.avg_speed_kmh || 24,
      topSpeedKmh: body.top_speed_kmh || 67,
      ridingMode: body.riding_mode || 'City',
      efficiencyKmPerPct: efficiency,
      energyConsumedKwh: body.energy_consumed_kwh || Number((body.distance_km * 0.042).toFixed(2)),
      regenRecapturedKwh: body.regen_recaptured_kwh || Number((body.distance_km * 0.007).toFixed(2)),
      startLocation: body.start_location || 'Indiranagar',
      endLocation: body.end_location || 'Whitefield'
    };

    // Generate AI critique
    try {
      tripDoc.aiCritique = await aiCoachService.analyzeTrip(tripDoc);
    } catch (e) {
      tripDoc.aiCritique = `Great ride! Efficiency was ${efficiency} km/% in ${tripDoc.ridingMode} mode.`;
    }

    const created = await Trip.create(tripDoc);

    // Update Scooter lastTrip
    await Scooter.updateOne(
      { deviceKey: ctx.deviceKey },
      { $set: { lastTrip: created.toObject() } }
    );

    res.status(201).json({
      status: 'success',
      device_id: ctx.deviceId,
      trip: created
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/scooter/:deviceId/trips/:tripId  -> Single trip detail
exports.getTripDetail = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;

    const trip = await Trip.findOne({ deviceKey: ctx.deviceKey, tripId: req.params.tripId }).lean();
    if (!trip) {
      return res.status(404).json({ status: 'error', message: 'Trip not found' });
    }

    res.json({
      status: 'success',
      device_id: ctx.deviceId,
      trip
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/scooter/:deviceId/trips/:tripId/analyze  -> Request AI review of trip
exports.analyzeTrip = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;

    const trip = await Trip.findOne({ deviceKey: ctx.deviceKey, tripId: req.params.tripId });
    if (!trip) {
      return res.status(404).json({ status: 'error', message: 'Trip not found' });
    }

    const critique = await aiCoachService.analyzeTrip(trip);
    trip.aiCritique = critique;
    await trip.save();

    res.json({
      status: 'success',
      device_id: ctx.deviceId,
      trip_id: trip.tripId,
      ai_critique: critique
    });
  } catch (err) {
    next(err);
  }
};
