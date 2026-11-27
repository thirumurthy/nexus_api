const { Schema, model } = require('mongoose');

const scooterSchema = new Schema(
  {
    deviceKey: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: '', trim: true },
    vin: { type: String, default: '' },
    modelName: { type: String, default: 'Ampere Nexus EX' },
    firmwareVersion: { type: String, default: 'EX v4.2' },
    tftFirmwareVersion: { type: String, default: '4.2.1' },

    firstSeenAt: { type: Date, default: Date.now },
    lastSyncTimestamp: { type: Number, default: 0 },
    lastOdometer: { type: Number, default: 0 },
    lastSoc: { type: Number, default: 68 },
    lastRangeKm: { type: Number, default: 54 },
    lastRidingMode: { type: String, default: 'City' },
    appVersion: { type: String },

    // Hardware & Remote Control States (Stitch Scooter Tab)
    isLocked: { type: Boolean, default: false },
    bootOpen: { type: Boolean, default: false },
    headlampActive: { type: Boolean, default: false },
    sirenActive: { type: Boolean, default: false },
    clusterMode: { type: String, enum: ['OFF', 'TBT_BLE', 'MIRROR_WIFI'], default: 'TBT_BLE' },

    // LFP Battery 16-Cell Telemetry Deep Dive
    batteryVoltage: { type: Number, default: 51.2 },
    batteryCurrent: { type: Number, default: 4.2 },
    batteryTemp: { type: Number, default: 29.4 },
    cellDeltaV: { type: Number, default: 0.008 },
    batterySoh: { type: Number, default: 98 },
    cycleCount: { type: Number, default: 44 },
    fastChargeEnabled: { type: Boolean, default: true },

    // Subsystem Health Diagnostics
    mcuTemp: { type: Number, default: 32.0 },
    mcuHealth: { type: String, default: 'OPTIMAL' },
    regenUnitHealth: { type: String, default: 'CALIBRATED' },

    // Preferences & Settings (Stitch Settings Tab)
    defaultRidingMode: { type: String, enum: ['Eco', 'City', 'Power', 'Limpmode'], default: 'City' },
    regenStrength: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
    hillHoldEnabled: { type: Boolean, default: true },
    reverseCrawlEnabled: { type: Boolean, default: true },
    antiTheftEnabled: { type: Boolean, default: true },
    selectedMusicApp: { type: String, default: 'YouTube' },

    // Geolocation for "Share Location" & Find My Scooter
    lastKnownLocation: {
      lat: { type: Number, default: 12.9716 },
      lng: { type: Number, default: 77.5946 },
      address: { type: String, default: 'Bangalore, Karnataka' },
      updatedAt: { type: Date, default: Date.now }
    },

    // AI Dynamic Analytics & Coach Cache
    ecoScore: { type: Number, default: 95 },
    cachedAiCoach: { type: Schema.Types.Mixed },

    // Snapshot of latest completed trip
    lastTrip: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

module.exports = model('Scooter', scooterSchema);
