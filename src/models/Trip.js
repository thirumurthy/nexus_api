const { Schema, model } = require('mongoose');

const tripSchema = new Schema(
  {
    deviceKey: { type: String, required: true, index: true },
    tripId: { type: String, required: true, unique: true, index: true },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, default: Date.now },
    durationMins: { type: Number, default: 0 },
    distanceKm: { type: Number, required: true },
    startOdometer: { type: Number },
    endOdometer: { type: Number },
    startSoc: { type: Number },
    endSoc: { type: Number },
    batteryUsedPct: { type: Number, default: 0 },
    avgSpeedKmh: { type: Number, default: 24 },
    topSpeedKmh: { type: Number, default: 65 },
    ridingMode: { type: String, enum: ['ECO', 'CITY', 'POWER', 'Eco', 'City', 'Power'], default: 'City' },
    efficiencyKmPerPct: { type: Number, default: 1.94 },
    energyConsumedKwh: { type: Number, default: 0.8 },
    regenRecapturedKwh: { type: Number, default: 0.12 },
    startLocation: { type: String, default: 'Indiranagar' },
    endLocation: { type: String, default: 'Whitefield' },
    aiCritique: { type: String, default: '' }
  },
  { timestamps: true }
);

tripSchema.index({ deviceKey: 1, endTime: -1 });

module.exports = model('Trip', tripSchema);
