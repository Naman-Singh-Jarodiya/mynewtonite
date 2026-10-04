import { Router, Request, Response } from 'express';
import { OutboxProcessor } from '../domain/outboxProcessor.js';

export function createOutboxRouter(worker: OutboxProcessor): Router {
  const router = Router();

  // GET /api/outbox/stats - Queue metrics
  router.get('/stats', (req: Request, res: Response) => {
    const stats = worker.getQueueStats();
    res.json(stats);
  });

  // GET /api/outbox/events - Recent jobs list
  router.get('/events', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const stmt = req.db.prepare(`
      SELECT * FROM outbox_events 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    const events = stmt.all(limit);
    res.json(events);
  });

  // POST /api/outbox/retry/:id - Reset failed job for immediate retry
  router.post('/retry/:id', (req: Request, res: Response) => {
    const success = worker.retryEvent(req.params.id);
    if (!success) {
      res.status(404).json({ error: 'Outbox event not found' });
      return;
    }
    res.json({ ok: true, message: 'Event reset to PENDING for immediate processing.' });
  });

  // POST /api/outbox/watchdog/sla - Trigger immediate SLA evaluation
  router.post('/watchdog/sla', (req: Request, res: Response) => {
    const breachedCount = worker.evaluateSlaWatchdog();
    res.json({ ok: true, breached_directives_count: breachedCount });
  });

  return router;
}
