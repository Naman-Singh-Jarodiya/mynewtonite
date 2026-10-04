import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  dbPath: process.env.DB_PATH || './mynewtonite.db',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  slaHours: {
    SEV1_CRITICAL: 1,  // 1 hour
    SEV2_HIGH: 4,      // 4 hours
    SEV3_MEDIUM: 24,   // 24 hours
    SEV4_LOW: 72       // 72 hours
  },
  outbox: {
    pollIntervalMs: 2000,
    maxRetries: 5,
    baseBackoffMs: 1000
  }
};
