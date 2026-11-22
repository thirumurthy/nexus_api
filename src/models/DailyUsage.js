const { Schema, model } = require('mongoose');

const dailyUsageSchema = new Schema(
  {
    deviceKey: { type: String, required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    startOdometer: { type: Number },
    endOdometer: { type: Number },
    startSoc: { type: Number },
    endSoc: { type: Number },
    distanceKm: { type: Number, default: 0 },
    socConsumed: { type: Number, default: 0 },
    syncCount: { type: Number, default: 0 },

    // Stitch Revamp Daily Telemetry
    avgSpeedKmh: { type: Number, default: 24 },
    maxSpeedKmh: { type: Number, default: 67 },
    rideTimeMins: { type: Number, default: 0 },
    tripCount: { type: Number, default: 0 },
    energyConsumedKwh: { type: Number, default: 0 },
    regenRecapturedKwh: { type: Number, default: 0 },
    goalKm: { type: Number, default: 25 }
  },
  { timestamps: true }
);

dailyUsageSchema.index({ deviceKey: 1, date: 1 }, { unique: true });

module.exports = model('DailyUsage', dailyUsageSchema);
