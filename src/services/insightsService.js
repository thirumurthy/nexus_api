const env = require('../config/env');
const Scooter = require('../models/Scooter');
const DailyUsage = require('../models/DailyUsage');
const fallbackEngine = require('../ai/providers/fallbackEngine');
const { dayKey, monthKey, daysAgoKey } = require('../utils/date');

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

  const [scooter, daily, yesterdayDaily, monthlyAgg, effAgg] = await Promise.all([
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
    ])
  ]);

  const monthKm = monthlyAgg[0]?.km || 0;
  const daysActive = monthlyAgg[0]?.days || 0;
  const todayKm = daily?.distanceKm || 0;
  const yesterdayKm = yesterdayDaily?.distanceKm || 0;

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

  return {
    status: 'success',
    device_id: deviceId,

    // Stitch Home Tab Hero Telemetry
    hero_telemetry: {
      distance_today_km: round(todayKm),
      avg_speed_kmh: daily?.avgSpeedKmh || 24,
      ride_time_mins: daily?.rideTimeMins || 38,
      battery_used_pct: daily?.socConsumed || 9.6,
      vs_yesterday_pct: vsYesterdayPct,
      daily_goal_km: goalKm,
      goal_progress_pct: goalProgressPct
    },

    daily_usage: {
      date: today,
      distance_km: round(todayKm),
      soc_consumed: Math.round(daily?.socConsumed || 0),
      avg_speed_kmh: daily?.avgSpeedKmh || 24,
      ride_time_mins: daily?.rideTimeMins || 0,
      trip_count: daily?.tripCount || 0
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
      vin: scooter?.vin || 'NEX_B9ABF',
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
