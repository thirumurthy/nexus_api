const mongoose = require('mongoose');
const env = require('./env');

// Cache the connection across serverless invocations
let cached = global._mongooseCache;
if (!cached) cached = global._mongooseCache = { conn: null, promise: null };

async function connectDB() {
  if (!env.mongoUri) throw new Error('MONGODB_URI is not set');
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    mongoose.set('strictQuery', true);
    cached.promise = mongoose.connect(env.mongoUri, {
      bufferCommands: false,
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 8000
    });
  }
  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
  return cached.conn;
}

module.exports = connectDB;
