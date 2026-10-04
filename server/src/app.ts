import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { config } from './config/index.js';
import { authContextMiddleware } from './security/authContext.js';
import { idempotencyGuard } from './security/idempotencyGuard.js';
import { createOperationsRouter } from './routes/operationsRouter.js';
import { createTeamsRouter } from './routes/teamsRouter.js';
import { createUsersRouter } from './routes/usersRouter.js';
import { createOutboxRouter } from './routes/outboxRouter.js';
import { createEventsRouter } from './routes/eventsRouter.js';
import { OutboxProcessor } from './domain/outboxProcessor.js';

export function createApp(db: Database.Database, worker: OutboxProcessor): Express {
  const app = express();

  // CORS configuration
  app.use(cors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin,
    exposedHeaders: ['X-Idempotent-Replay', 'ETag']
  }));

  app.use(express.json());

  // Attach database instance to request
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.db = db;
    next();
  });

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'HEALTHY',
      service: 'myNewtonite Operations Control Plane',
      timestamp: new Date().toISOString()
    });
  });

  // Authentication and Actor Context Middleware
  app.use('/api', authContextMiddleware);

  // Idempotency Middleware for mutating endpoints
  app.use('/api', idempotencyGuard);

  // Mount API routers
  app.use('/api/operations', createOperationsRouter());
  app.use('/api/teams', createTeamsRouter());
  app.use('/api/users', createUsersRouter());
  app.use('/api/outbox', createOutboxRouter(worker));
  app.use('/api/events', createEventsRouter());

  // Global Error Handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Unhandled Server Error]:', err);
    res.status(err.status || 500).json({
      error: 'Internal Server Error',
      message: err.message || 'An unexpected failure occurred while processing the operational directive.'
    });
  });

  return app;
}
