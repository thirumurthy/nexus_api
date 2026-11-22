const aiProviderManager = require('./aiProviderManager');
const fallbackEngine = require('./providers/fallbackEngine');
const Scooter = require('../models/Scooter');
const DailyUsage = require('../models/DailyUsage');
const Trip = require('../models/Trip');
const { dayKey, daysAgoKey } = require('../utils/date');

class AICoachService {
  async getCoachingInsights(deviceKey, deviceId, forced = false) {
    const now = Date.now();
    const today = dayKey(now);

    const [scooter, daily, recentTrips, effAgg] = await Promise.all([
      Scooter.findOne({ deviceKey }),
      DailyUsage.findOne({ deviceKey, date: today }).lean(),
      Trip ? Trip.find({ deviceKey }).sort({ endTime: -1 }).limit(5).lean() : [],
      DailyUsage.aggregate([
        { $match: { deviceKey, date: { $gte: daysAgoKey(now, 30) } } },
        { $group: { _id: null, km: { $sum: '$distanceKm' }, soc: { $sum: '$socConsumed' } } }
      ])
    ]);

    // Check cached AI coaching (valid for 30 minutes if not forced)
    if (!forced && scooter?.cachedAiCoach && scooter.cachedAiCoach.generatedAt) {
      const ageMs = now - new Date(scooter.cachedAiCoach.generatedAt).getTime();
      if (ageMs < 30 * 60 * 1000) {
        return {
          ...scooter.cachedAiCoach.data,
          cached: true,
          provider: scooter.cachedAiCoach.provider || 'cached',
          generated_at: scooter.cachedAiCoach.generatedAt
        };
      }
    }

    const odo = scooter?.lastOdometer || 4812;
    const soc = scooter?.lastSoc ?? 68;
    const mode = scooter?.lastRidingMode || 'City';
    const dayKm = daily?.distanceKm || 18.6;

    let effKmPerPct = 1.94;
    const e = effAgg[0];
    if (e && e.soc >= 5 && e.km > 0) {
      effKmPerPct = Number((e.km / e.soc).toFixed(2));
    }

    const telemetryContext = {
      vehicleModel: 'Ampere Nexus EX v4.2',
      odometerKm: odo,
      socPercent: soc,
      efficiencyKmPerPct: effKmPerPct,
      recentKm: dayKm,
      ridingMode: mode,
      batteryTemp: scooter?.batteryTemp || 29.4,
      cellDeltaV: scooter?.cellDeltaV || 0.008,
      recentTripsCount: recentTrips.length
    };

    const prompt = `You are the Nexus Neural Copilot AI Engine for the Ampere Nexus EX v4.2 electric scooter.
Analyze the following telemetry and generate high-tech, actionable EV coaching insights matching this exact JSON schema:

Telemetry:
- Vehicle: ${telemetryContext.vehicleModel}
- Odometer: ${telemetryContext.odometerKm} km
- Battery SoC: ${telemetryContext.socPercent}%
- 30-Day Efficiency: ${telemetryContext.efficiencyKmPerPct} km/%
- Today's Distance: ${telemetryContext.recentKm} km
- Active Mode: ${telemetryContext.ridingMode}
- Battery Temp: ${telemetryContext.batteryTemp} °C
- Cell Delta: ${telemetryContext.cellDeltaV} V

Return ONLY valid JSON matching this structure:
{
  "eco_score": 96,
  "eco_rating": "Master Throttle Flow",
  "fleet_rank": "Top 5% Rider",
  "smooth_accel_pct": 94,
  "bonus_range_km": 18,
  "throttle_lag_sec": 0.04,
  "consumed_kwh": 42.6,
  "recaptured_regen_kwh": 6.8,
  "drive_expenditure_pct": 84,
  "regen_recaptured_pct": 16,
  "efficiency_index": 1.94,
  "ai_projected_range_km": {
    "eco_mode": 108,
    "city_mode": 96,
    "sport_mode": 84
  },
  "speed_zones": {
    "eco_pct": 68,
    "cruise_pct": 24,
    "power_pct": 8
  },
  "peak_commute_windows": "8:15 AM & 6:20 PM",
  "dynamic_recommendations": [
    {
      "id": "rec_highway_speed",
      "title": "Optimal Highway Speed",
      "badge": "+12% RANGE",
      "icon": "navigation",
      "description": "Maintain 42 km/h on Outer Ring Road to reduce aerodynamic drag surge."
    },
    {
      "id": "rec_charge_health",
      "title": "Smart Charge Health",
      "badge": "CELL GUARD",
      "icon": "battery_charging_full",
      "description": "Cap charging at 80% before 8:00 AM to preserve battery chemistry life."
    },
    {
      "id": "rec_tire_pressure",
      "title": "Tire Pressure Optimization",
      "badge": "+4 KM / CHARGE",
      "icon": "tire_repair",
      "description": "Rear pressure is 28 PSI (recommended 32 PSI). Adjusting will yield +4 km per charge."
    },
    {
      "id": "rec_regen_tuning",
      "title": "Regen Level Recommendation",
      "badge": "CITY REGEN",
      "icon": "bolt",
      "description": "Your braking pattern suits High Regen in city stop-and-go traffic."
    }
  ]
}`;

    const messages = [
      {
        role: 'system',
        content: 'You are an advanced EV telemetry analytics system. Output pure JSON without markdown or explanations.'
      },
      { role: 'user', content: prompt }
    ];

    let result;
    try {
      const res = await aiProviderManager.generateJson(messages, {
        telemetry: telemetryContext,
        temperature: 0.4
      });

      result = {
        ...res.data,
        provider: res.provider,
        model: res.model,
        latency_ms: res.latency_ms,
        cached: false,
        generated_at: new Date().toISOString()
      };
    } catch (err) {
      result = {
        ...fallbackEngine.generateCoachingInsights(telemetryContext),
        provider: 'fallback-rules',
        cached: false,
        generated_at: new Date().toISOString()
      };
    }

    // Save to cache asynchronously if scooter exists
    if (scooter) {
      Scooter.updateOne(
        { deviceKey },
        {
          $set: {
            ecoScore: result.eco_score || 95,
            cachedAiCoach: {
              data: result,
              provider: result.provider,
              generatedAt: new Date()
            }
          }
        }
      ).exec().catch(() => {});
    }

    return result;
  }

  async chatWithCopilot(deviceKey, deviceId, userMessage, history = []) {
    const scooter = await Scooter.findOne({ deviceKey }).lean();

    const soc = scooter?.lastSoc ?? 68;
    const odo = scooter?.lastOdometer ?? 4812;
    const mode = scooter?.lastRidingMode || 'City';
    const range = scooter?.lastRangeKm || Math.round(soc * 1.4);
    const temp = scooter?.batteryTemp ?? 29.4;
    const cellDelta = scooter?.cellDeltaV ?? 0.008;

    const systemPrompt = `You are Nexus Neural Copilot, the built-in AI companion for the Ampere Nexus EX v4.2 electric scooter.
Rider's live vehicle telemetry:
- Scooter ID / VIN: ${scooter?.vin || 'NEX_B9ABF'}
- Firmware: EX v4.2 (7" TFT Cluster)
- Current Battery SoC: ${soc}%
- Estimated Range: ${range} km (${mode} mode)
- Total Odometer: ${odo} km
- Battery Temperature: ${temp} °C
- LFP Cell Voltage Delta: ${cellDelta} V (Target < 0.020V is optimal)
- Vehicle Status: ${scooter?.isLocked ? 'Locked' : 'Unlocked'}, Connected via BLE 5.2

Rules:
- Be concise, high-tech, and directly helpful (1-3 paragraphs maximum).
- Give accurate advice on EV range, throttle management, LFP battery care, regenerative braking, tire pressure, and route planning.
- If asked about vehicle controls, explain that commands can be executed via the Nexus companion app.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6).map((h) => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content
      })),
      { role: 'user', content: userMessage }
    ];

    const telemetryContext = {
      socPercent: soc,
      odometerKm: odo,
      ridingMode: mode,
      remainingRangeKm: range
    };

    const res = await aiProviderManager.generateChat(messages, {
      telemetry: telemetryContext,
      temperature: 0.6
    });

    const suggestedQuestions = [
      'How to reach 100 km range?',
      'Is my battery cell delta healthy?',
      'What is my recommended tire pressure?'
    ];

    return {
      status: 'success',
      device_id: deviceId,
      reply: res.content,
      provider: res.provider,
      model: res.model,
      latency_ms: res.latency_ms,
      suggested_questions: suggestedQuestions
    };
  }

  async analyzeTrip(trip) {
    const prompt = `Analyze this completed electric scooter trip on Ampere Nexus:
Distance: ${trip.distanceKm} km
Duration: ${trip.durationMins} mins
Avg Speed: ${trip.avgSpeedKmh} km/h
Top Speed: ${trip.topSpeedKmh} km/h
Battery Used: ${trip.batteryUsedPct}%
Riding Mode: ${trip.ridingMode}
Energy Consumed: ${trip.energyConsumedKwh || 0.8} kWh
Regen Recaptured: ${trip.regenRecapturedKwh || 0.12} kWh

Provide a concise 2-sentence ride critique focusing on efficiency and throttle discipline.`;

    const messages = [
      { role: 'system', content: 'You are an automotive telemetry analyst.' },
      { role: 'user', content: prompt }
    ];

    try {
      const res = await aiProviderManager.generateChat(messages, {
        temperature: 0.5,
        maxTokens: 200
      });
      return res.content;
    } catch (e) {
      return `Solid ride at an average speed of ${trip.avgSpeedKmh} km/h. Smooth throttle in ${trip.ridingMode} mode saved energy reserve.`;
    }
  }
}

module.exports = new AICoachService();
