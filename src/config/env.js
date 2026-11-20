require('dotenv').config();

const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

module.exports = {
  port: num(process.env.PORT, 3000),
  mongoUri: process.env.MONGODB_URI,
  deviceSalt: process.env.DEVICE_SALT || 'nx_default_salt',
  apiKey: process.env.API_KEY || '',
  tzOffsetMinutes: num(process.env.TZ_OFFSET_MINUTES, 330),
  petrolKmPerLiter: num(process.env.PETROL_KM_PER_LITER, 45),
  petrolPriceInr: num(process.env.PETROL_PRICE_INR, 102),
  petrolCo2KgPerLiter: num(process.env.PETROL_CO2_KG_PER_LITER, 2.31),
  evCo2KgPerKm: num(process.env.EV_CO2_KG_PER_KM, 0.011),
  serviceMilestonesKm: [1000, 5000, 10000],
  serviceRepeatKm: 5000
};
