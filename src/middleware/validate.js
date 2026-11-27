const { z } = require('zod');

const syncSchema = z.object({
  device_id: z.string().min(6).max(100),
  sync_timestamp: z.number().int().positive(),
  trigger: z.enum(['DISCONNECT', 'CONNECT', 'PERIODIC', 'MANUAL']).default('DISCONNECT'),
  odometer_km: z.number().min(0).max(1000000),
  trip_km: z.number().min(0).max(2000).default(0),
  soc_percent: z.number().min(0).max(100),
  remaining_range_km: z.number().min(0).max(1000).optional(),
  riding_mode: z.string().max(30).optional(),
  app_version: z.string().max(20).optional(),

  // Extended Telemetry (Stitch BLE Spec 0xFF11, 0xFF12)
  battery_voltage: z.number().min(0).max(100).optional(),
  battery_current: z.number().min(-100).max(200).optional(),
  battery_temp: z.number().min(-20).max(100).optional(),
  cell_delta_v: z.number().min(0).max(5).optional(),
  battery_soh: z.number().min(0).max(100).optional(),
  avg_speed_kmh: z.number().min(0).max(150).optional(),
  top_speed_kmh: z.number().min(0).max(150).optional(),
  ride_time_mins: z.number().min(0).max(1440).optional(),
  trip_id: z.string().max(100).optional()
});

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const dailyQuerySchema = z.object({
  from: dateStr.optional(),
  to: dateStr.optional()
});

const monthlyQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6)
});

const cadenceQuerySchema = z.object({
  range: z.enum(['3D', '7D', '30D', '1Y', '3d', '7d', '30d', '1y']).default('7D')
});

const controlSchema = z.object({
  command: z.enum(['LOCK', 'UNLOCK', 'BOOT_RELEASE', 'SIREN_PING', 'FLASH_HAZARDS', 'SET_CLUSTER_MODE', 'lock', 'unlock', 'open_boot', 'siren', 'flash']),
  payload: z.record(z.any()).optional()
});

const settingsUpdateSchema = z.object({
  name: z.string().max(60).optional(),
  default_riding_mode: z.enum(['Eco', 'City', 'Power', 'Limpmode', 'ECO', 'CITY', 'POWER']).optional(),
  regen_strength: z.enum(['LOW', 'MEDIUM', 'HIGH', 'Low', 'Medium', 'High']).optional(),
  hill_hold_enabled: z.boolean().optional(),
  reverse_crawl_enabled: z.boolean().optional(),
  anti_theft_enabled: z.boolean().optional(),
  selected_music_app: z.string().max(50).optional(),
  cluster_mode: z.enum(['OFF', 'TBT_BLE', 'MIRROR_WIFI']).optional()
});

const tripCreateSchema = z.object({
  trip_id: z.string().min(3).max(100).optional(),
  title: z.string().max(100).optional(),
  tag: z.string().max(50).optional(),
  session_summary: z.string().max(200).optional(),
  start_time: z.number().int().positive().optional(),
  end_time: z.number().int().positive().optional(),
  distance_km: z.number().min(0.01).max(2000),
  duration_mins: z.number().min(0).max(1440).optional(),
  avg_speed_kmh: z.number().min(0).max(150).optional(),
  top_speed_kmh: z.number().min(0).max(150).optional(),
  start_soc: z.number().min(0).max(100).optional(),
  end_soc: z.number().min(0).max(100).optional(),
  riding_mode: z.string().max(30).optional(),
  energy_consumed_kwh: z.number().min(0).max(50).optional(),
  regen_recaptured_kwh: z.number().min(0).max(20).optional(),
  start_location: z.string().max(100).optional(),
  end_location: z.string().max(100).optional()
});

const copilotChatSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string()
  })).optional()
});

const aiProviderSwitchSchema = z.object({
  provider: z.string().min(2).max(50),
  model: z.string().max(100).optional()
});

const aiTestSchema = z.object({
  provider: z.string().min(2).max(50),
  prompt: z.string().max(500).optional()
});

module.exports = {
  syncSchema,
  dailyQuerySchema,
  monthlyQuerySchema,
  cadenceQuerySchema,
  controlSchema,
  settingsUpdateSchema,
  tripCreateSchema,
  copilotChatSchema,
  aiProviderSwitchSchema,
  aiTestSchema
};
