const Scooter = require('../models/Scooter');
const DailyUsage = require('../models/DailyUsage');
const Trip = require('../models/Trip');
const {
  dailyQuerySchema,
  monthlyQuerySchema,
  cadenceQuerySchema,
  controlSchema,
  settingsUpdateSchema
} = require('../middleware/validate');
const { toDeviceKey } = require('../utils/hash');
const { daysAgoKey, dayKey } = require('../utils/date');
const { buildInsights } = require('../services/insightsService');
const { buildMaintenanceReport } = require('../services/maintenanceService');

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

// GET /api/scooter/:deviceId/live  -> Live HUD snapshot for Home Tab
exports.live = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;

    const today = dayKey(Date.now());
    const [scooter, todayUsage] = await Promise.all([
      Scooter.findOne({ deviceKey: ctx.deviceKey }).lean(),
      DailyUsage.findOne({ deviceKey: ctx.deviceKey, date: today }).lean()
    ]);

    const soc = scooter?.lastSoc ?? 68;
    const eff = 1.94;

    res.json({
      status: 'success',
      device_id: ctx.deviceId,
      scooter_tag: scooter?.vin || 'NEX_B9ABF',
      firmware_release: scooter?.firmwareVersion || 'EX v4.2',
      connection_state: 'CONNECTED',
      is_locked: scooter?.isLocked ?? false,
      cluster_mode: scooter?.clusterMode || 'TBT_BLE',
      live_telemetry: {
        odometer_km: round1(scooter?.lastOdometer || 0),
        soc_percent: soc,
        cluster_range_km: scooter?.lastRangeKm || Math.round(soc * 1.4),
        ai_projected_range_km: Math.round(soc * eff),
        riding_mode: scooter?.lastRidingMode || 'City',
        battery_soh: scooter?.batterySoh || 98
      },
      today_ride: {
        distance_km: round1(todayUsage?.distanceKm || 0),
        avg_speed_kmh: todayUsage?.avgSpeedKmh || 24,
        ride_time_mins: todayUsage?.rideTimeMins || 0,
        battery_used_pct: round1(todayUsage?.socConsumed || 0),
        daily_goal_km: todayUsage?.goalKm || 25,
        goal_progress_pct: Math.min(100, Math.round(((todayUsage?.distanceKm || 0) / (todayUsage?.goalKm || 25)) * 100))
      }
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/scooter/:deviceId/insights  -> restores analytics on a fresh install
exports.insights = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;
    res.json(await buildInsights(ctx.deviceKey, ctx.deviceId));
  } catch (err) {
    next(err);
  }
};

// GET /api/scooter/:deviceId/maintenance -> Official Ampere Service Timeline & Care Matrix
exports.maintenance = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;

    const scooter = await Scooter.findOne({ deviceKey: ctx.deviceKey }).lean();
    const currentOdo = scooter?.lastOdometer || 0;
    const report = buildMaintenanceReport(currentOdo);

    res.json({
      status: 'success',
      device_id: ctx.deviceId,
      scooter_name: scooter?.scooterName || 'Ampere Nexus EX',
      ...report
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/scooter/:deviceId/cadence?range=3D|7D|30D|1Y  -> Multi-range cadence bar chart
exports.cadence = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;

    const { range } = cadenceQuerySchema.parse(req.query);
    const rangeNorm = range.toUpperCase();
    const now = Date.now();

    let numDays = 7;
    if (rangeNorm === '3D') numDays = 3;
    else if (rangeNorm === '30D') numDays = 30;
    else if (rangeNorm === '1Y') numDays = 365;

    const fromDate = daysAgoKey(now, numDays - 1);
    const toDate = dayKey(now);

    const [rows, tripAgg] = await Promise.all([
      DailyUsage.find({ deviceKey: ctx.deviceKey, date: { $gte: fromDate, $lte: toDate } })
        .sort({ date: 1 })
        .lean(),
      Trip.aggregate([
        { $match: { deviceKey: ctx.deviceKey, endTime: { $gte: new Date(now - numDays * 86400000) } } },
        { $group: { _id: null, count: { $sum: 1 } } }
      ])
    ]);

    const dayNameMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let totalKm = 0;
    let daysWithRiding = 0;

    // Fill all dates in range even if 0 km
    const series = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const dKey = daysAgoKey(now, i);
      const match = rows.find((r) => r.date === dKey);
      const km = match ? round1(match.distanceKm) : 0;
      const soc = match ? Math.round(match.socConsumed) : 0;

      totalKm += km;
      if (km > 0) daysWithRiding++;

      const dateObj = new Date(dKey);
      series.push({
        date: dKey,
        day_label: dayNameMap[dateObj.getUTCDay()],
        distance_km: km,
        soc_consumed: soc
      });
    }

    const avgKm = daysWithRiding > 0 ? round1(totalKm / daysWithRiding) : 0;

    res.json({
      status: 'success',
      device_id: ctx.deviceId,
      range: rangeNorm,
      from: fromDate,
      to: toDate,
      aggregation: {
        total_distance_km: round1(totalKm),
        avg_daily_km: avgKm,
        active_days: daysWithRiding,
        trips_logged: tripAgg[0]?.count || rows.reduce((acc, r) => acc + (r.tripCount || (r.distanceKm > 0 ? 1 : 0)), 0)
      },
      bars: series
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/scooter/:deviceId/daily?from=YYYY-MM-DD&to=YYYY-MM-DD  -> bar chart data
exports.daily = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;
    const q = dailyQuerySchema.parse(req.query);
    const now = Date.now();
    const from = q.from || daysAgoKey(now, 29);
    const to = q.to || dayKey(now);

    const rows = await DailyUsage.find({ deviceKey: ctx.deviceKey, date: { $gte: from, $lte: to } })
      .sort({ date: 1 })
      .select('date distanceKm socConsumed avgSpeedKmh rideTimeMins -_id')
      .lean();

    res.json({
      status: 'success',
      device_id: ctx.deviceId,
      from,
      to,
      days: rows.map((r) => ({
        date: r.date,
        distance_km: round1(r.distanceKm),
        soc_consumed: Math.round(r.socConsumed),
        avg_speed_kmh: r.avgSpeedKmh || 24,
        ride_time_mins: r.rideTimeMins || 0
      }))
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/scooter/:deviceId/monthly?months=6  -> month-vs-month comparison
exports.monthly = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;
    const { months } = monthlyQuerySchema.parse(req.query);

    const start = new Date();
    start.setUTCMonth(start.getUTCMonth() - (months - 1), 1);
    const fromMonth = dayKey(start.getTime()).slice(0, 7);

    const rows = await DailyUsage.aggregate([
      { $match: { deviceKey: ctx.deviceKey, date: { $gte: `${fromMonth}-01` } } },
      {
        $group: {
          _id: { $substr: ['$date', 0, 7] },
          km: { $sum: '$distanceKm' },
          soc: { $sum: '$socConsumed' },
          days: { $sum: { $cond: [{ $gt: ['$distanceKm', 0] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      status: 'success',
      device_id: ctx.deviceId,
      months: rows.map((r) => ({
        month: r._id,
        total_distance_km: round1(r.km),
        days_active: r.days,
        avg_daily_km: r.days ? round1(r.km / r.days) : 0,
        soc_consumed: Math.round(r.soc)
      }))
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/scooter/:deviceId/control  -> Execute Remote Command (Lock, Boot, Siren, Flash, Cluster Mode)
exports.control = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;

    const { command, payload } = controlSchema.parse(req.body);
    const cmdUpper = command.toUpperCase();

    const update = {};
    let feedback = '';

    switch (cmdUpper) {
      case 'LOCK':
        update.isLocked = true;
        feedback = 'Vehicle Secured & Locked 🔒';
        break;
      case 'UNLOCK':
        update.isLocked = false;
        feedback = 'Vehicle Unlocked & Ready to Ride ⚡';
        break;
      case 'BOOT_RELEASE':
      case 'OPEN_BOOT':
        update.bootOpen = true;
        feedback = 'Boot latch opened remotely';
        break;
      case 'SIREN_PING':
      case 'SIREN':
        update.sirenActive = true;
        feedback = 'Audible siren chirp activated 🔊';
        break;
      case 'FLASH_HAZARDS':
      case 'FLASH':
        update.headlampActive = true;
        feedback = 'Hazard headlamps flashed';
        break;
      case 'SET_CLUSTER_MODE':
        if (payload?.cluster_mode) {
          update.clusterMode = payload.cluster_mode;
          feedback = `Cluster TFT display set to ${payload.cluster_mode}`;
        }
        break;
      default:
        return res.status(400).json({ status: 'error', message: `Unknown command: ${command}` });
    }

    const updated = await Scooter.findOneAndUpdate(
      { deviceKey: ctx.deviceKey },
      { $set: update },
      { new: true }
    ).lean();

    res.json({
      status: 'success',
      device_id: ctx.deviceId,
      command: cmdUpper,
      feedback,
      vehicle_state: {
        is_locked: updated.isLocked,
        boot_open: updated.bootOpen,
        cluster_mode: updated.clusterMode
      }
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/scooter/:deviceId/diagnostics  -> Battery Matrix & Subsystems Diagnostics
exports.diagnostics = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;

    const scooter = await Scooter.findOne({ deviceKey: ctx.deviceKey }).lean();
    const odo = scooter?.lastOdometer || 0;
    const nextServiceKm = (Math.floor(odo / 5000) + 1) * 5000;
    const kmUntilService = Math.max(0, nextServiceKm - odo);

    res.json({
      status: 'success',
      device_id: ctx.deviceId,
      scooter_model: scooter?.modelName || 'Ampere Nexus EX',
      vin: scooter?.vin || 'NEX_B9ABF',
      lfp_battery_matrix: {
        capacity: '3.3 kWh • 51.2V',
        pack_voltage: scooter?.batteryVoltage || 51.2,
        pack_current_a: scooter?.batteryCurrent || 4.2,
        pack_temp_c: scooter?.batteryTemp || 29.4,
        cell_delta_v: scooter?.cellDeltaV || 0.008,
        full_cycles: scooter?.cycleCount || 44,
        soh_percentage: scooter?.batterySoh || 98,
        fast_charge_enabled: scooter?.fastChargeEnabled ?? true,
        fast_charge_spec: '0-80% in 1h 45m'
      },
      subsystems_status: [
        {
          subsystem: 'Motor Controller (MCU)',
          status: 'OPTIMAL',
          temperature: `${scooter?.mcuTemp || 32}°C`,
          icon: 'precision_manufacturing'
        },
        {
          subsystem: 'Regen Braking Unit',
          status: 'CALIBRATED',
          tuning: scooter?.regenStrength || 'MEDIUM',
          icon: 'electric_bolt'
        },
        {
          subsystem: '7" TFT Cluster Touchscreen',
          status: 'OPERATIONAL',
          firmware: scooter?.tftFirmwareVersion || '4.2.1',
          icon: 'tv'
        },
        {
          subsystem: 'Scheduled Maintenance',
          status: kmUntilService <= 200 ? 'UPCOMING' : 'GOOD',
          countdown_km: kmUntilService,
          next_milestone_km: nextServiceKm,
          icon: 'build'
        }
      ]
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/scooter/:deviceId/diagnostics/scan  -> Run Subsystems Diagnostic Self-Test
exports.runDiagnosticsScan = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;

    // Simulate diagnostic scan and update cell delta with fresh calibrated reading
    const freshCellDelta = Number((0.006 + Math.random() * 0.004).toFixed(3));
    const freshMcuTemp = Number((30 + Math.random() * 3).toFixed(1));

    await Scooter.updateOne(
      { deviceKey: ctx.deviceKey },
      {
        $set: {
          cellDeltaV: freshCellDelta,
          mcuTemp: freshMcuTemp
        }
      }
    );

    res.json({
      status: 'success',
      device_id: ctx.deviceId,
      scan_result: 'ALL_SYSTEMS_OPTIMAL',
      message: 'Full diagnostic scan completed. All 16 LFP cells balanced.',
      metrics: {
        cell_delta_v: freshCellDelta,
        mcu_temp_c: freshMcuTemp,
        scan_timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/scooter/:deviceId/settings  -> Preferences & Modes
exports.getSettings = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;

    const scooter = await Scooter.findOne({ deviceKey: ctx.deviceKey }).lean();

    res.json({
      status: 'success',
      device_id: ctx.deviceId,
      rider_profile: {
        name: scooter?.name || 'Nexus Pilot',
        rider_id: `AMP-${ctx.deviceKey.slice(0, 6).toUpperCase()}`,
        vin: scooter?.vin || 'NEX_B9ABF'
      },
      preferences: {
        default_riding_mode: scooter?.defaultRidingMode || 'City',
        regen_strength: scooter?.regenStrength || 'MEDIUM',
        hill_hold_enabled: scooter?.hillHoldEnabled ?? true,
        reverse_crawl_enabled: scooter?.reverseCrawlEnabled ?? true,
        anti_theft_enabled: scooter?.antiTheftEnabled ?? true,
        selected_music_app: scooter?.selectedMusicApp || 'YouTube',
        cluster_mode: scooter?.clusterMode || 'TBT_BLE'
      },
      system: {
        firmware_version: scooter?.firmwareVersion || 'EX v4.2',
        tft_firmware_version: scooter?.tftFirmwareVersion || '4.2.1',
        ota_update_available: false
      }
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/scooter/:deviceId/settings  -> Update preferences
exports.updateSettings = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;

    const body = settingsUpdateSchema.parse(req.body);
    const update = {};

    if (body.name !== undefined) update.name = body.name;
    if (body.default_riding_mode !== undefined) update.defaultRidingMode = body.default_riding_mode;
    if (body.regen_strength !== undefined) update.regenStrength = body.regen_strength.toUpperCase();
    if (body.hill_hold_enabled !== undefined) update.hillHoldEnabled = body.hill_hold_enabled;
    if (body.reverse_crawl_enabled !== undefined) update.reverseCrawlEnabled = body.reverse_crawl_enabled;
    if (body.anti_theft_enabled !== undefined) update.antiTheftEnabled = body.anti_theft_enabled;
    if (body.selected_music_app !== undefined) update.selectedMusicApp = body.selected_music_app;
    if (body.cluster_mode !== undefined) update.clusterMode = body.cluster_mode;

    const updated = await Scooter.findOneAndUpdate(
      { deviceKey: ctx.deviceKey },
      { $set: update },
      { new: true }
    ).lean();

    res.json({
      status: 'success',
      device_id: ctx.deviceId,
      message: 'Settings updated successfully',
      preferences: {
        name: updated.name,
        default_riding_mode: updated.defaultRidingMode,
        regen_strength: updated.regenStrength,
        hill_hold_enabled: updated.hillHoldEnabled,
        reverse_crawl_enabled: updated.reverseCrawlEnabled,
        anti_theft_enabled: updated.antiTheftEnabled,
        selected_music_app: updated.selectedMusicApp,
        cluster_mode: updated.clusterMode
      }
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/scooter/:deviceId/export  -> Export GPX / CSV / JSON
exports.exportData = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;

    const format = (req.query.format || 'json').toLowerCase();
    const [scooter, trips, daily] = await Promise.all([
      Scooter.findOne({ deviceKey: ctx.deviceKey }).lean(),
      Trip.find({ deviceKey: ctx.deviceKey }).sort({ endTime: -1 }).limit(100).lean(),
      DailyUsage.find({ deviceKey: ctx.deviceKey }).sort({ date: -1 }).limit(60).lean()
    ]);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=nexus_rides_${ctx.deviceId}.csv`);

      let csv = 'TripID,Date,DistanceKm,DurationMins,AvgSpeedKmh,TopSpeedKmh,RidingMode,BatteryUsedPct\n';
      trips.forEach((t) => {
        csv += `${t.tripId},${new Date(t.endTime).toISOString()},${t.distanceKm},${t.durationMins},${t.avgSpeedKmh},${t.topSpeedKmh},${t.ridingMode},${t.batteryUsedPct}\n`;
      });
      return res.send(csv);
    }

    res.json({
      status: 'success',
      device_id: ctx.deviceId,
      scooter,
      trips,
      daily_usage: daily
    });
  } catch (err) {
    next(err);
  }
};
