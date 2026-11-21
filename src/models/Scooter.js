const { Schema, model } = require('mongoose');

const scooterSchema = new Schema(
  {
    deviceKey: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: '', trim: true },
    firstSeenAt: { type: Date, default: Date.now },
    lastSyncTimestamp: { type: Number, default: 0 },
    lastOdometer: { type: Number, default: 0 },
    lastSoc: { type: Number },
    lastRangeKm: { type: Number },
    lastRidingMode: { type: String },
    appVersion: { type: String }
  },
  { timestamps: true }
);

module.exports = model('Scooter', scooterSchema);
