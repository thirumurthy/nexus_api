const Scooter = require('../models/Scooter');
const DailyUsage = require('../models/DailyUsage');
const { dailyQuerySchema, monthlyQuerySchema } = require('../middleware/validate');
const { toDeviceKey } = require('../utils/hash');
const { daysAgoKey, dayKey } = require('../utils/date');
const { buildInsights } = require('../services/insightsService');

const round1 = (n) => Math.round(n * 10) / 10;

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
      .select('date distanceKm socConsumed -_id')
      .lean();

    res.json({
      status: 'success',
      device_id: ctx.deviceId,
      from,
      to,
      days: rows.map((r) => ({
        date: r.date,
        distance_km: round1(r.distanceKm),
        soc_consumed: Math.round(r.socConsumed)
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
