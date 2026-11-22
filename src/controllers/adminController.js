const path = require('path');
const fs = require('fs');
const env = require('../config/env');
const Scooter = require('../models/Scooter');
const DailyUsage = require('../models/DailyUsage');
const SyncLog = require('../models/SyncLog');
const Trip = require('../models/Trip');
const { buildInsights } = require('../services/insightsService');
const { dayKey, daysAgoKey } = require('../utils/date');

const round = (n, d = 1) => {
  const f = 10 ** d;
  return Math.round((Number(n || 0) + Number.EPSILON) * f) / f;
};

// GET /api/admin/overview  -> Fleet-wide analytics & travel habits
exports.overview = async (req, res, next) => {
  try {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 86400000;
    const thirtyDaysAgo = now - 30 * 86400000;
    const fourteenDaysAgoKey = daysAgoKey(now, 14);

    const [
      totalScooters,
      active7d,
      active30d,
      scooterOdoAgg,
      usageAgg,
      distributionAgg,
      modesAgg,
      trendAgg
    ] = await Promise.all([
      Scooter.countDocuments(),
      Scooter.countDocuments({ lastSyncTimestamp: { $gte: sevenDaysAgo } }),
      Scooter.countDocuments({ lastSyncTimestamp: { $gte: thirtyDaysAgo } }),
      Scooter.aggregate([{ $group: { _id: null, totalOdo: { $sum: '$lastOdometer' } } }]),
      DailyUsage.aggregate([
        {
          $group: {
            _id: null,
            totalDistance: { $sum: '$distanceKm' },
            totalSoc: { $sum: '$socConsumed' },
            activeDays: { $sum: { $cond: [{ $gt: ['$distanceKm', 0] }, 1, 0] } }
          }
        }
      ]),
      DailyUsage.aggregate([
        { $match: { distanceKm: { $gt: 0 } } },
        {
          $bucket: {
            groupBy: '$distanceKm',
            boundaries: [0, 5, 15, 30, 1000],
            default: 'other',
            output: {
              count: { $sum: 1 },
              totalKm: { $sum: '$distanceKm' }
            }
          }
        }
      ]),
      SyncLog.aggregate([
        { $match: { ridingMode: { $exists: true, $ne: '' } } },
        { $group: { _id: '$ridingMode', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      DailyUsage.aggregate([
        { $match: { date: { $gte: fourteenDaysAgoKey } } },
        {
          $group: {
            _id: '$date',
            totalKm: { $sum: '$distanceKm' },
            socConsumed: { $sum: '$socConsumed' },
            activeUsers: { $addToSet: '$deviceKey' }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    const totalFleetOdoKm = scooterOdoAgg[0]?.totalOdo || 0;
    const totalTrackedKm = usageAgg[0]?.totalDistance || 0;
    const activeDaysCount = usageAgg[0]?.activeDays || 0;
    const avgDailyKm = activeDaysCount ? round(totalTrackedKm / activeDaysCount) : 0;

    const liters = totalFleetOdoKm / env.petrolKmPerLiter;
    const moneySavedInr = Math.round(liters * env.petrolPriceInr);
    const co2SavedKg = round(Math.max(0, liters * env.petrolCo2KgPerLiter - totalFleetOdoKm * env.evCo2KgPerKm));

    // Efficiency: total km / total soc consumed
    const totalSoc = usageAgg[0]?.totalSoc || 0;
    const fleetKmPerSoc = totalSoc >= 5 && totalTrackedKm > 0 ? round(totalTrackedKm / totalSoc, 2) : null;

    // Format bucket labels
    const bucketLabels = {
      0: '< 5 km (Short / Errands)',
      5: '5 - 15 km (Daily Commute)',
      15: '15 - 30 km (Medium Range)',
      30: '30+ km (Long Distance)'
    };

    const tripDistanceDistribution = distributionAgg.map((b) => ({
      range: bucketLabels[b._id] || `${b._id} km`,
      count: b.count,
      total_km: round(b.totalKm)
    }));

    // Riding modes fallback to scooter lastRidingMode if sync logs are clean
    let ridingModes = modesAgg.map((m) => ({ mode: m._id, count: m.count }));
    if (!ridingModes.length) {
      const fallbackModes = await Scooter.aggregate([
        { $match: { lastRidingMode: { $exists: true, $ne: '' } } },
        { $group: { _id: '$lastRidingMode', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);
      ridingModes = fallbackModes.map((m) => ({ mode: m._id, count: m.count }));
    }

    // Build trend with empty days filled
    const trendMap = new Map();
    trendAgg.forEach((t) => {
      trendMap.set(t._id, {
        date: t._id,
        total_km: round(t.totalKm),
        active_users: t.activeUsers ? t.activeUsers.length : 0,
        soc_consumed: Math.round(t.socConsumed || 0)
      });
    });

    const recentTrend = [];
    for (let i = 13; i >= 0; i--) {
      const d = daysAgoKey(now, i);
      recentTrend.push(trendMap.get(d) || { date: d, total_km: 0, active_users: 0, soc_consumed: 0 });
    }

    res.json({
      status: 'success',
      data: {
        fleet: {
          total_scooters: totalScooters,
          active_7d: active7d,
          active_30d: active30d,
          total_odometer_km: round(totalFleetOdoKm),
          total_tracked_km: round(totalTrackedKm),
          avg_daily_km: avgDailyKm,
          fleet_km_per_soc: fleetKmPerSoc,
          estimated_full_range_km: fleetKmPerSoc ? Math.round(fleetKmPerSoc * 100) : null
        },
        savings: {
          petrol_saved_liters: round(liters),
          money_saved_inr: moneySavedInr,
          co2_saved_kg: co2SavedKg
        },
        travel_patterns: {
          trip_distance_distribution: tripDistanceDistribution,
          riding_modes: ridingModes
        },
        trend: recentTrend
      }
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/scooters?search=  -> List scooters
exports.listScooters = async (req, res, next) => {
  try {
    const { search } = req.query;
    const filter = {};

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { deviceKey: { $regex: q, $options: 'i' } },
        { appVersion: { $regex: q, $options: 'i' } }
      ];
    }

    const scooters = await Scooter.find(filter)
      .sort({ lastSyncTimestamp: -1, createdAt: -1 })
      .limit(100)
      .lean();

    res.json({
      status: 'success',
      count: scooters.length,
      scooters: scooters.map((s) => ({
        device_key: s.deviceKey,
        name: s.name || '',
        vin: s.vin || 'NEX_B9ABF',
        model_name: s.modelName || 'Ampere Nexus EX',
        eco_score: s.ecoScore || 95,
        battery_soh: s.batterySoh || 98,
        is_locked: s.isLocked ?? false,
        last_odometer: round(s.lastOdometer),
        last_soc: s.lastSoc ?? null,
        last_range_km: s.lastRangeKm ? round(s.lastRangeKm) : null,
        last_riding_mode: s.lastRidingMode || 'Unknown',
        app_version: s.appVersion || 'N/A',
        first_seen_at: s.firstSeenAt,
        last_sync_timestamp: s.lastSyncTimestamp || 0
      }))
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/scooter/:deviceKey  -> Single scooter insights & history
exports.scooterDetail = async (req, res, next) => {
  try {
    const deviceKey = req.params.deviceKey.trim();
    const scooter = await Scooter.findOne({ deviceKey }).lean();

    if (!scooter) {
      return res.status(404).json({ status: 'error', message: 'Scooter not found' });
    }

    const [insightsData, dailyUsage, syncLogs, trips] = await Promise.all([
      buildInsights(deviceKey, scooter.name || deviceKey),
      DailyUsage.find({ deviceKey }).sort({ date: -1 }).limit(30).lean(),
      SyncLog.find({ deviceKey }).sort({ syncTimestamp: -1 }).limit(25).lean(),
      Trip.find({ deviceKey }).sort({ endTime: -1 }).limit(10).lean()
    ]);

    res.json({
      status: 'success',
      scooter: {
        device_key: scooter.deviceKey,
        name: scooter.name || '',
        vin: scooter.vin || 'NEX_B9ABF',
        model_name: scooter.modelName || 'Ampere Nexus EX',
        firmware_version: scooter.firmwareVersion || 'EX v4.2',
        is_locked: scooter.isLocked ?? false,
        boot_open: scooter.bootOpen ?? false,
        cluster_mode: scooter.clusterMode || 'TBT_BLE',
        eco_score: scooter.ecoScore || 95,
        battery_soh: scooter.batterySoh || 98,
        battery_voltage: scooter.batteryVoltage || 51.2,
        battery_temp: scooter.batteryTemp || 29.4,
        cell_delta_v: scooter.cellDeltaV || 0.008,
        last_odometer: round(scooter.lastOdometer),
        last_soc: scooter.lastSoc ?? null,
        last_range_km: scooter.lastRangeKm ? round(scooter.lastRangeKm) : null,
        last_riding_mode: scooter.lastRidingMode || 'Unknown',
        app_version: scooter.appVersion || 'N/A',
        first_seen_at: scooter.firstSeenAt,
        last_sync_timestamp: scooter.lastSyncTimestamp || 0
      },
      insights: insightsData,
      recent_trips: trips.map((t) => ({
        trip_id: t.tripId,
        distance_km: round(t.distanceKm),
        duration_mins: t.durationMins,
        avg_speed_kmh: t.avgSpeedKmh,
        top_speed_kmh: t.topSpeedKmh,
        battery_used_pct: round(t.batteryUsedPct),
        riding_mode: t.ridingMode,
        efficiency_km_per_pct: round(t.efficiencyKmPerPct),
        end_time: t.endTime
      })),
      daily_history: dailyUsage.map((d) => ({
        date: d.date,
        distance_km: round(d.distanceKm),
        soc_consumed: Math.round(d.socConsumed),
        start_odometer: round(d.startOdometer),
        end_odometer: round(d.endOdometer),
        start_soc: d.startSoc,
        end_soc: d.endSoc,
        sync_count: d.syncCount
      })),
      recent_syncs: syncLogs.map((l) => ({
        timestamp: l.syncTimestamp,
        trigger: l.trigger,
        odometer_km: round(l.odometerKm),
        trip_km: round(l.tripKm),
        soc_percent: l.socPercent,
        remaining_range_km: l.remainingRangeKm,
        riding_mode: l.ridingMode,
        app_version: l.appVersion
      }))
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/scooter/:deviceKey/name  -> Label / rename a scooter
exports.updateName = async (req, res, next) => {
  try {
    const deviceKey = req.params.deviceKey.trim();
    const name = String(req.body.name || '').trim();

    const result = await Scooter.findOneAndUpdate(
      { deviceKey },
      { $set: { name } },
      { new: true }
    ).lean();

    if (!result) {
      return res.status(404).json({ status: 'error', message: 'Scooter not found' });
    }

    res.json({
      status: 'success',
      message: 'Scooter name updated successfully',
      device_key: deviceKey,
      name: result.name
    });
  } catch (err) {
    next(err);
  }
};

// Serve Dashboard UI HTML
let cachedHtml = null;
exports.renderDashboard = (req, res) => {
  try {
    const htmlPath = path.join(__dirname, '../views/dashboard.html');
    if (!cachedHtml || process.env.NODE_ENV !== 'production') {
      if (fs.existsSync(htmlPath)) {
        cachedHtml = fs.readFileSync(htmlPath, 'utf8');
      }
    }
    if (cachedHtml) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(cachedHtml);
    }
    res.status(500).send('Dashboard view not found');
  } catch (err) {
    res.status(500).send('Error loading dashboard: ' + err.message);
  }
};
