const env = require('../config/env');
const Scooter = require('../models/Scooter');
const DailyUsage = require('../models/DailyUsage');
const Trip = require('../models/Trip');
const fallbackEngine = require('../ai/providers/fallbackEngine');
const { buildMaintenanceReport } = require('./maintenanceService');
const { dayKey, monthKey, daysAgoKey } = require('../utils/date');
const { inferTripMetadata, clusterRawTrips } = require('../utils/tripHelper');
const { getDynamicVin } = require('../utils/deviceResolver');

const round = (n, d = 1) => {
  const f = 10 ** d;
  return Math.round((Number(n || 0) + Number.EPSILON) * f) / f;
};

function nextServiceKm(odometer) {
  const milestone = env.serviceMilestonesKm.find((m) => m > odometer);
  if (milestone) return milestone;
  return (Math.floor(odometer / env.serviceRepeatKm) + 1) * env.serviceRepeatKm;
}

async function buildInsights(deviceKey, deviceId, now = Date.now()) {
  const today = dayKey(now);
  const yesterday = daysAgoKey(now, 1);
  const month = monthKey(now);

  const [scooter, daily, yesterdayDaily, monthlyAgg, effAgg, recentTripsRaw, recentDailyLogs] = await Promise.all([
    Scooter.findOne({ deviceKey }).lean(),
    DailyUsage.findOne({ deviceKey, date: today }).lean(),
    DailyUsage.findOne({ deviceKey, date: yesterday }).lean(),
    DailyUsage.aggregate([
      { $match: { deviceKey, date: { $regex: `^${month}-` } } },
      {
        $group: {
          _id: null,
          km: { $sum: '$distanceKm' },
          days: { $sum: { $cond: [{ $gt: ['$distanceKm', 0] }, 1, 0] } },
          consumedKwh: { $sum: '$energyConsumedKwh' },
          regenKwh: { $sum: '$regenRecapturedKwh' }
        }
      }
    ]),
    DailyUsage.aggregate([
      { $match: { deviceKey, date: { $gte: daysAgoKey(now, 30) } } },
      { $group: { _id: null, km: { $sum: '$distanceKm' }, soc: { $sum: '$socConsumed' } } }
    ]),
    Trip.find({
      deviceKey,
      $or: [
        { startTime: { $gte: new Date(now - 7 * 86400000) } },
        { endTime: { $gte: new Date(now - 7 * 86400000) } }
      ]
    }).sort({ endTime: -1 }).limit(100).lean(),
    DailyUsage.find({ deviceKey }).sort({ date: -1 }).limit(7).lean()
  ]);

  const monthKm = monthlyAgg[0]?.km || 0;
  const daysActive = monthlyAgg[0]?.days || 0;

  // Reliable Today's Distance (Today Odometer - Yesterday Odometer)
  let todayKm = daily?.distanceKm || 0;
  const currentOdo = scooter?.lastOdometer || 0;
  const yesterdayOdo = (yesterdayDaily && yesterdayDaily.endOdometer > 0) ? yesterdayDaily.endOdometer : null;

  if (currentOdo > 0 && yesterdayOdo && yesterdayOdo > 0) {
    const odoDiff = Number((currentOdo - yesterdayOdo).toFixed(1));
    if (odoDiff >= 0 && odoDiff <= 300) {
      todayKm = odoDiff;
    }
  } else if (currentOdo > 0 && daily?.startOdometer && daily.startOdometer > 0) {
    const odoDiff = Number((currentOdo - daily.startOdometer).toFixed(1));
    if (odoDiff >= 0 && odoDiff <= 300) {
      todayKm = odoDiff;
    }
  } else if (todayKm > 300) {
    todayKm = 0;
  }

  let yesterdayKm = yesterdayDaily?.distanceKm || 0;
  if (yesterdayKm > 300) {
    // Sanitize impossible historical spikes
    if (yesterdayDaily?.endOdometer > 0 && yesterdayDaily?.startOdometer > 0) {
      const yDiff = Number((yesterdayDaily.endOdometer - yesterdayDaily.startOdometer).toFixed(1));
      yesterdayKm = (yDiff >= 0 && yDiff <= 300) ? yDiff : 0;
    } else {
      yesterdayKm = 0;
    }
  }

  // Comparison vs yesterday
  let vsYesterdayPct = 0;
  if (yesterdayKm > 0) {
    vsYesterdayPct = Math.round(((todayKm - yesterdayKm) / yesterdayKm) * 100);
  } else if (todayKm > 0) {
    vsYesterdayPct = 100;
  }

  const goalKm = daily?.goalKm || 25;
  const goalProgressPct = Math.min(100, Math.round((todayKm / goalKm) * 100));

  // Real-world efficiency over last 30 days
  let efficiency = null;
  let effKmPerPct = 1.94;
  const e = effAgg[0];
  if (e && e.soc >= 5 && e.km > 0) {
    effKmPerPct = Number((e.km / e.soc).toFixed(2));
    efficiency = {
      km_per_percent: effKmPerPct,
      estimated_full_range_km: Math.round(effKmPerPct * 100)
    };
  }

  const liters = monthKm / env.petrolKmPerLiter;
  const odometer = scooter?.lastOdometer || 0;
  const nextService = nextServiceKm(odometer);
  const kmUntilService = round(nextService - odometer);
  const serviceUrgency = kmUntilService <= 100 ? 'CRITICAL' : kmUntilService <= 300 ? 'UPCOMING' : 'GOOD';

  const co2Kg = round(Math.max(0, liters * env.petrolCo2KgPerLiter - monthKm * env.evCo2KgPerKm));
  const treeEquiv = round(co2Kg / 21.77, 2);
  const totalLifetimeSavedInr = Math.round((odometer / env.petrolKmPerLiter) * env.petrolPriceInr);

  // Energy dynamics
  const totalConsumedKwh = round(monthlyAgg[0]?.consumedKwh || monthKm * 0.042, 1);
  const totalRegenKwh = round(monthlyAgg[0]?.regenKwh || monthKm * 0.007, 1);
  const totalEnergy = totalConsumedKwh + totalRegenKwh;
  const driveExpenditurePct = totalEnergy > 0 ? Math.round((totalConsumedKwh / totalEnergy) * 100) : 84;
  const regenRecapturedPct = totalEnergy > 0 ? 100 - driveExpenditurePct : 16;

  // AI Coach: use cached AI coach if fresh, otherwise use physics engine baseline
  let aiCoach = scooter?.cachedAiCoach?.data;
  if (!aiCoach) {
    aiCoach = fallbackEngine.generateCoachingInsights({
      odometerKm: odometer,
      socPercent: scooter?.lastSoc ?? 68,
      efficiencyKmPerPct: effKmPerPct,
      recentKm: todayKm
    });
  }

  let aiTip = 'Maintain smooth throttle between 35-45 km/h in ECO/City mode for maximum range.';
  if (serviceUrgency === 'CRITICAL') {
    aiTip = `Service milestone due in only ${kmUntilService} km! Schedule brake and belt inspection soon.`;
  } else if (efficiency && efficiency.km_per_percent >= 1.2) {
    aiTip = `Outstanding riding efficiency (${efficiency.km_per_percent} km/%)! You are in the top 10% of eco-friendly riders.`;
  } else if (todayKm > 30) {
    aiTip = 'High-mileage commute today. Consider recharging up to 80-90% overnight to preserve battery longevity.';
  }

  // ─── Intelligently Clustered Recent Trips (1 Week, Charge-Aware) ────────
  let recentTrips = [];
  if (recentTripsRaw && recentTripsRaw.length > 0) {
    recentTrips = clusterRawTrips(recentTripsRaw, now);
  }
  
  if (recentTrips.length === 0 && recentDailyLogs && recentDailyLogs.length > 0) {
    recentTrips = recentDailyLogs
      .filter((d) => d.distanceKm > 0.2)
      .slice(0, 5)
      .map((d) => {
        const fakeDate = new Date(`${d.date}T18:30:00+05:30`);
        const dur = d.rideTimeMins || Math.round((d.distanceKm / (d.avgSpeedKmh || 25)) * 60) || 20;
        const meta = inferTripMetadata({
          startTime: new Date(fakeDate.getTime() - dur * 60000),
          endTime: fakeDate,
          distanceKm: d.distanceKm,
          durationMins: dur,
          avgSpeedKmh: d.avgSpeedKmh || 24,
          topSpeedKmh: d.maxSpeedKmh || 55,
          ridingMode: 'City',
          efficiencyKmPerPct: d.socConsumed > 0 ? Number((d.distanceKm / d.socConsumed).toFixed(2)) : 1.94
        }, new Date(now));
        return {
          trip_id: `DAILY_TRIP_${d.date}`,
          title: meta.title,
          tag: meta.tag,
          session_summary: meta.sessionSummary,
          distance_km: round(d.distanceKm),
          duration_mins: dur,
          avg_speed_kmh: d.avgSpeedKmh || 24,
          top_speed_kmh: d.maxSpeedKmh || 55,
          battery_used_pct: round(d.socConsumed || 0),
          start_soc: d.startSoc || 85,
          end_soc: d.endSoc || Math.max(10, 85 - (d.socConsumed || 10)),
          riding_mode: 'City',
          efficiencyKmPerPct: round(d.socConsumed > 0 ? d.distanceKm / d.socConsumed : 1.94, 2),
          energy_consumed_kwh: round(d.energyConsumedKwh || d.distanceKm * 0.038, 2),
          regen_recaptured_kwh: round(d.regenRecapturedKwh || d.distanceKm * 0.006, 2),
          money_saved_inr: meta.moneySavedInr,
          co2_saved_kg: meta.co2SavedKg,
          start_time: new Date(fakeDate.getTime() - dur * 60000),
          end_time: fakeDate,
          ai_critique: `Great consistency! Covered ${round(d.distanceKm)} km on ${d.date}.`
        };
      });
  }

  return {
    status: 'success',
    device_id: deviceId,
    recent_trips: recentTrips,

    // Stitch Home Tab Hero Telemetry
    hero_telemetry: {
      distance_today_km: round(todayKm),
      avg_speed_kmh: daily?.avgSpeedKmh || 24,
      ride_time_mins: daily?.rideTimeMins || 38,
      battery_used_pct: daily?.socConsumed || 0,
      today_energy_kwh: Number(((daily?.socConsumed || 0) * 0.033).toFixed(2)),
      yesterday_distance_km: round(yesterdayKm),
      yesterday_battery_used_pct: Math.round(yesterdayDaily?.socConsumed || 0),
      yesterday_energy_kwh: Number(((yesterdayDaily?.socConsumed || 0) * 0.033).toFixed(2)),
      vs_yesterday_pct: vsYesterdayPct,
      daily_goal_km: goalKm,
      goal_progress_pct: goalProgressPct
    },

    daily_usage: {
      date: today,
      distance_km: round(todayKm),
      soc_consumed: Math.round(daily?.socConsumed || 0),
      energy_kwh: Number(((daily?.socConsumed || 0) * 0.033).toFixed(2)),
      avg_speed_kmh: daily?.avgSpeedKmh || 24,
      ride_time_mins: daily?.rideTimeMins || 0,
      trip_count: daily?.tripCount || 0
    },

    yesterday_usage: {
      date: yesterday,
      distance_km: round(yesterdayKm),
      soc_consumed: Math.round(yesterdayDaily?.socConsumed || 0),
      energy_kwh: Number(((yesterdayDaily?.socConsumed || 0) * 0.033).toFixed(2)),
      avg_speed_kmh: yesterdayDaily?.avgSpeedKmh || 24,
      ride_time_mins: yesterdayDaily?.rideTimeMins || 0
    },

    monthly_usage: {
      month,
      total_distance_km: round(monthKm),
      days_active: daysActive,
      avg_daily_km: daysActive ? round(monthKm / daysActive) : 0
    },

    // Stitch Ownership Savings Matrix
    ownership_savings: {
      this_month_inr: Math.round(liters * env.petrolPriceInr),
      fuel_avoided_liters: round(liters),
      co2_offset_kg: co2Kg,
      total_lifetime_saved_inr: totalLifetimeSavedInr
    },

    // Stitch Energy Dynamics Split
    energy_dynamics: {
      consumed_kwh: totalConsumedKwh || 42.6,
      recaptured_regen_kwh: totalRegenKwh || 6.8,
      drive_expenditure_pct: driveExpenditurePct,
      regen_recaptured_pct: regenRecapturedPct,
      efficiency_index: effKmPerPct
    },

    // Stitch Insights AI Neural Copilot
    ai_coach: aiCoach,

    // Stitch LFP Battery Deep Dive Matrix
    battery_matrix: {
      soc_percent: scooter?.lastSoc ?? 68,
      soh_percent: scooter?.batterySoh || 98,
      pack_voltage: scooter?.batteryVoltage || 51.2,
      pack_current_a: scooter?.batteryCurrent || 4.2,
      pack_temp_c: scooter?.batteryTemp || 29.4,
      cell_delta_v: scooter?.cellDeltaV || 0.008,
      cycle_count: scooter?.cycleCount || 44,
      fast_charge_enabled: scooter?.fastChargeEnabled ?? true
    },

    // Vehicle hardware & control states
    vehicle_state: {
      vin: scooter?.vin || getDynamicVin(deviceId, deviceKey),
      model_name: scooter?.modelName || 'Ampere Nexus EX',
      firmware_version: scooter?.firmwareVersion || 'EX v4.2',
      tft_firmware_version: scooter?.tftFirmwareVersion || '4.2.1',
      is_locked: scooter?.isLocked ?? false,
      boot_open: scooter?.bootOpen ?? false,
      siren_active: scooter?.sirenActive ?? false,
      cluster_mode: scooter?.clusterMode || 'TBT_BLE',
      selected_music_app: scooter?.selectedMusicApp || 'YouTube',
      default_riding_mode: scooter?.defaultRidingMode || 'City',
      regen_strength: scooter?.regenStrength || 'MEDIUM',
      hill_hold_enabled: scooter?.hillHoldEnabled ?? true,
      reverse_crawl_enabled: scooter?.reverseCrawlEnabled ?? true,
      anti_theft_enabled: scooter?.antiTheftEnabled ?? true,
      last_location: scooter?.lastKnownLocation
    },

    // Official Ampere Maintenance Timeline & Care Matrix
    maintenance: buildMaintenanceReport(odometer),

    // Legacy fields preserved for backward compatibility
    insights: {
      real_world_efficiency: efficiency
        ? `${efficiency.km_per_percent} km/% (est. ${efficiency.estimated_full_range_km} km full range)`
        : null,
      petrol_saved_liters: round(liters),
      money_saved_inr: Math.round(liters * env.petrolPriceInr),
      co2_saved_kg: co2Kg,
      odometer_km: round(odometer),
      next_service_km: nextService,
      km_until_service: kmUntilService,
      ai_service_urgency: serviceUrgency,
      ai_smart_tip: aiTip,
      ai_trees_equivalent: treeEquiv,
      ai_cost_per_km_inr: 0.22
    }
  };
}

module.exports = { buildInsights };
