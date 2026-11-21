const env = require('../config/env');
const Scooter = require('../models/Scooter');
const DailyUsage = require('../models/DailyUsage');
const { dayKey, monthKey, daysAgoKey } = require('../utils/date');

const round = (n, d = 1) => {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
};

function nextServiceKm(odometer) {
  const milestone = env.serviceMilestonesKm.find((m) => m > odometer);
  if (milestone) return milestone;
  return (Math.floor(odometer / env.serviceRepeatKm) + 1) * env.serviceRepeatKm;
}

async function buildInsights(deviceKey, deviceId, now = Date.now()) {
  const today = dayKey(now);
  const month = monthKey(now);

  const [scooter, daily, monthlyAgg, effAgg] = await Promise.all([
    Scooter.findOne({ deviceKey }).lean(),
    DailyUsage.findOne({ deviceKey, date: today }).lean(),
    DailyUsage.aggregate([
      { $match: { deviceKey, date: { $regex: `^${month}-` } } },
      {
        $group: {
          _id: null,
          km: { $sum: '$distanceKm' },
          days: { $sum: { $cond: [{ $gt: ['$distanceKm', 0] }, 1, 0] } }
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

  // Real-world efficiency over last 30 days (needs a meaningful SoC sample)
  let efficiency = null;
  const e = effAgg[0];
  if (e && e.soc >= 5 && e.km > 0) {
    const kmPerPct = e.km / e.soc;
    efficiency = {
      km_per_percent: round(kmPerPct, 2),
      estimated_full_range_km: Math.round(kmPerPct * 100)
    };
  }

  const liters = monthKm / env.petrolKmPerLiter;
  const odometer = scooter?.lastOdometer || 0;
  const nextService = nextServiceKm(odometer);
  const kmUntilService = round(nextService - odometer);

  // AI & Smart Health Diagnostics
  const serviceUrgency = kmUntilService <= 100 ? 'CRITICAL' : kmUntilService <= 300 ? 'UPCOMING' : 'GOOD';
  
  // Smart AI Tip generation
  let aiTip = 'Maintain smooth throttle between 35-45 km/h in ECO/City mode for maximum range.';
  if (serviceUrgency === 'CRITICAL') {
    aiTip = `Service milestone due in only ${kmUntilService} km! Schedule brake and belt inspection soon.`;
  } else if (efficiency && efficiency.km_per_percent >= 1.2) {
    aiTip = `Outstanding riding efficiency (${efficiency.km_per_percent} km/%)! You are in the top 10% of eco-friendly riders.`;
  } else if (daily && daily.distanceKm > 30) {
    aiTip = 'High-mileage commute today. Consider recharging up to 80-90% overnight to preserve battery longevity.';
  }

  // Estimated tree absorption (approx 21.77 kg CO2 / tree / year)
  const co2Kg = round(Math.max(0, liters * env.petrolCo2KgPerLiter - monthKm * env.evCo2KgPerKm));
  const treeEquiv = round(co2Kg / 21.77, 2);

  return {
    status: 'success',
    device_id: deviceId,
    daily_usage: {
      date: today,
      distance_km: round(daily?.distanceKm || 0),
      soc_consumed: Math.round(daily?.socConsumed || 0)
    },
    monthly_usage: {
      month,
      total_distance_km: round(monthKm),
      days_active: daysActive,
      avg_daily_km: daysActive ? round(monthKm / daysActive) : 0
    },
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
