import { Router, Request, Response } from 'express';
import { StreamHub } from '../events/streamHub.js';

export function createEventsRouter(): Router {
  const router = Router();

  // GET /api/events/stream - Server-Sent Events subscription
  router.get('/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const actorId = req.actor?.id || 'anonymous';
    StreamHub.registerClient(res, actorId);

    // Initial handshake
    res.write(`event: CONNECTED\ndata: ${JSON.stringify({ status: 'connected', actorId, timestamp: new Date().toISOString() })}\n\n`);

    // Keep-alive heartbeat every 20 seconds
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
    });
  });

  return router;
}
