const env = require('../config/env');

const shift = (ts) => new Date(ts + env.tzOffsetMinutes * 60000);

const dayKey = (ts) => shift(ts).toISOString().slice(0, 10); // YYYY-MM-DD
const monthKey = (ts) => dayKey(ts).slice(0, 7); // YYYY-MM
const daysAgoKey = (ts, n) => dayKey(ts - n * 86400000);

module.exports = { dayKey, monthKey, daysAgoKey };
