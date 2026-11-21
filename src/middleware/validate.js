const { z } = require('zod');

const syncSchema = z.object({
  device_id: z.string().min(8).max(100),
  sync_timestamp: z.number().int().positive(),
  trigger: z.enum(['DISCONNECT', 'CONNECT', 'PERIODIC', 'MANUAL']).default('DISCONNECT'),
  odometer_km: z.number().min(0).max(1000000),
  trip_km: z.number().min(0).max(2000).default(0),
  soc_percent: z.number().min(0).max(100),
  remaining_range_km: z.number().min(0).max(1000).optional(),
  riding_mode: z.string().max(30).optional(),
  app_version: z.string().max(20).optional()
});

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const dailyQuerySchema = z.object({
  from: dateStr.optional(),
  to: dateStr.optional()
});

const monthlyQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6)
});

module.exports = { syncSchema, dailyQuerySchema, monthlyQuerySchema };
