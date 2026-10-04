import { createApp } from './app.js';
import { createDatabaseConnection } from './db/connection.js';
import { initializeDatabaseSchema } from './db/schema.js';
import { seedDatabase } from './db/seed.js';
import { OutboxProcessor } from './domain/outboxProcessor.js';
import { config } from './config/index.js';

async function bootstrap() {
  console.log(`[myNewtonite] Starting server in ${config.env} mode...`);

  const db = createDatabaseConnection();
  initializeDatabaseSchema(db);

  // Auto-seed if database is fresh / empty
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
  if (userCount === 0) {
    console.log('[myNewtonite] Fresh database detected. Auto-seeding initial enterprise operational data...');
    seedDatabase(db);
  }

  // Start asynchronous Outbox background processor
  const outboxProcessor = new OutboxProcessor(db);
  outboxProcessor.start(config.outbox.pollIntervalMs);
  console.log(`[myNewtonite] Outbox background processor daemon started (interval: ${config.outbox.pollIntervalMs}ms).`);

  const app = createApp(db, outboxProcessor);

  const server = app.listen(config.port, () => {
    console.log(`=======================================================`);
    console.log(`🚀 myNewtonite Operations Control Plane Online`);
    console.log(`📡 API Base: http://localhost:${config.port}`);
    console.log(`⚡ Concurrency OCC, Idempotency & Outbox Daemon ACTIVE`);
    console.log(`=======================================================`);
  });

  const shutdown = () => {
    console.log('\n[myNewtonite] Gracefully shutting down server...');
    outboxProcessor.stop();
    server.close(() => {
      db.close();
      console.log('[myNewtonite] Database connection closed. Clean exit.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch(err => {
  console.error('[myNewtonite] Fatal bootstrap error:', err);
  process.exit(1);
});
