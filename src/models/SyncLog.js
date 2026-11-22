const { Schema, model } = require('mongoose');

const syncLogSchema = new Schema(
  {
    deviceKey: { type: String, required: true },
    syncTimestamp: { type: Number, required: true },
    trigger: { type: String },
    odometerKm: Number,
    tripKm: Number,
    socPercent: Number,
    remainingRangeKm: Number,
    ridingMode: String,
    appVersion: String,
    batteryVoltage: Number,
    batteryTemp: Number,
    cellDeltaV: Number,
    avgSpeedKmh: Number,
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 } // keep raw logs 90 days
  },
  { versionKey: false }
);

// Idempotency: WorkManager retries must not double count
syncLogSchema.index({ deviceKey: 1, syncTimestamp: 1 }, { unique: true });

module.exports = model('SyncLog', syncLogSchema);
