const Scooter = require('../models/Scooter');
const Trip = require('../models/Trip');
const aiCoachService = require('../ai/aiCoachService');
const { tripCreateSchema } = require('../middleware/validate');
const { resolveDevice: resolve } = require('../utils/deviceResolver');
const { inferTripMetadata, clusterRawTrips } = require('../utils/tripHelper');

const round1 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 10) / 10;
const round2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

// GET /api/scooter/:deviceId/trips  -> List recent trips + latest completed ride spotlight
exports.listTrips = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const [rawTrips, scooter] = await Promise.all([
      Trip.find({
        deviceKey: ctx.deviceKey,
        $or: [
          { startTime: { $gte: new Date(Date.now() - 7 * 86400000) } },
          { endTime: { $gte: new Date(Date.now() - 7 * 86400000) } }
        ]
      })
        .sort({ endTime: -1 })
        .limit(100)
        .lean(),
      Scooter.findOne({ deviceKey: ctx.deviceKey }).lean()
    ]);

    const clustered = clusterRawTrips(rawTrips, Date.now());
    const totalCount = clustered.length;
    const paginatedTrips = clustered.slice(skip, skip + limit);

    const latestSpotlight = paginatedTrips[0] || null;

    res.json({
      status: 'success',
      device_id: ctx.deviceId,
      total_odometer_km: round1(scooter?.lastOdometer || 0),
      latest_completed_ride: latestSpotlight,
      pagination: {
        page,
        limit,
        total_trips: totalCount,
        has_more: skip + paginatedTrips.length < totalCount
      },
      trips: paginatedTrips
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
    const batteryUsed = body.start_soc != null && body.end_soc != null ? Math.max(0, body.start_soc - body.end_soc) : (body.battery_used_pct || 5);
    const efficiency = batteryUsed > 0 ? Number((body.distance_km / batteryUsed).toFixed(2)) : 1.94;

    const meta = inferTripMetadata({
      startTime,
      endTime,
      durationMins: duration,
      distanceKm: body.distance_km,
      avgSpeedKmh: body.avg_speed_kmh || 24,
      topSpeedKmh: body.top_speed_kmh || 55,
      ridingMode: body.riding_mode || 'City',
      efficiencyKmPerPct: efficiency,
      title: body.title,
      tag: body.tag,
      sessionSummary: body.session_summary
    });

    const tripDoc = {
      deviceKey: ctx.deviceKey,
      tripId,
      title: meta.title,
      tag: meta.tag,
      sessionSummary: meta.sessionSummary,
      startTime,
      endTime,
      durationMins: duration,
      distanceKm: body.distance_km,
      startSoc: body.start_soc,
      endSoc: body.end_soc,
      batteryUsedPct: batteryUsed,
      avgSpeedKmh: body.avg_speed_kmh || 24,
      topSpeedKmh: body.top_speed_kmh || 55,
      ridingMode: body.riding_mode || 'City',
      efficiencyKmPerPct: efficiency,
      energyConsumedKwh: body.energy_consumed_kwh || Number((body.distance_km * 0.038).toFixed(2)),
      regenRecapturedKwh: body.regen_recaptured_kwh || Number((body.distance_km * 0.006).toFixed(2)),
      moneySavedInr: meta.moneySavedInr,
      co2SavedKg: meta.co2SavedKg
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

    const meta = inferTripMetadata(trip);
    trip.title = meta.title;
    trip.tag = meta.tag;
    trip.sessionSummary = meta.sessionSummary;
    trip.moneySavedInr = meta.moneySavedInr;
    trip.co2SavedKg = meta.co2SavedKg;

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
