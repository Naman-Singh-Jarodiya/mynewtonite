import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { IdempotencyEntry } from '../types.js';

export function idempotencyGuard(req: Request, res: Response, next: NextFunction): void {
  // Only apply to mutating HTTP methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  const idempotencyKey = req.headers['idempotency-key'] as string;
  if (!idempotencyKey) {
    next();
    return;
  }

  const actorId = req.actor?.id || 'anonymous';
  const requestPath = req.originalUrl || req.url;
  const payloadString = JSON.stringify({
    method: req.method,
    url: requestPath,
    body: req.body || {}
  });

  const requestHash = crypto.createHash('sha256').update(payloadString).digest('hex');
  const db = req.db;
  const selectStmt = db.prepare('SELECT * FROM idempotency_store WHERE idempotency_key = ?');
  const existing = selectStmt.get(idempotencyKey) as IdempotencyEntry | undefined;

  if (existing) {
    // 1. Reject if key is reused with a altered payload
    if (existing.request_hash !== requestHash) {
      res.status(422).json({
        error: 'Idempotency key reused with mismatched request payload.',
        details: 'The provided Idempotency-Key was previously submitted with different request parameters.'
      });
      return;
    }

    // 2. Reject if concurrent execution is currently in flight
    if (existing.state === 'IN_FLIGHT') {
      res.status(409).json({
        error: 'A concurrent request with this Idempotency-Key is currently being processed. Please retry shortly.'
      });
      return;
    }

    // 3. Replay cached response without repeating side-effects
    if (existing.state === 'PROCESSED' && existing.status_code && existing.response_payload) {
      res.setHeader('X-Idempotent-Replay', 'true');
      res.status(existing.status_code);
      try {
        const parsed = JSON.parse(existing.response_payload);
        res.json(parsed);
      } catch {
        res.send(existing.response_payload);
      }
      return;
    }
  }

  // Record initial IN_FLIGHT state
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  try {
    const insertStmt = db.prepare(`
      INSERT INTO idempotency_store (
        idempotency_key, actor_id, endpoint, request_hash, state, created_at, expires_at
      ) VALUES (?, ?, ?, ?, 'IN_FLIGHT', ?, ?)
    `);
    insertStmt.run(idempotencyKey, actorId, requestPath, requestHash, now, expiresAt);
  } catch (err: any) {
    // Concurrent race condition on insert
    const doubleCheck = selectStmt.get(idempotencyKey) as IdempotencyEntry | undefined;
    if (doubleCheck && doubleCheck.state === 'PROCESSED' && doubleCheck.status_code && doubleCheck.response_payload) {
      res.setHeader('X-Idempotent-Replay', 'true');
      res.status(doubleCheck.status_code);
      res.json(JSON.parse(doubleCheck.response_payload));
      return;
    }
    res.status(409).json({ error: 'Concurrent conflicting operation detected with identical key.' });
    return;
  }

  // Intercept response to store completed payload
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = function (body: any): Response {
    try {
      const updateStmt = db.prepare(`
        UPDATE idempotency_store 
        SET state = 'PROCESSED', status_code = ?, response_payload = ? 
        WHERE idempotency_key = ?
      `);
      updateStmt.run(res.statusCode, JSON.stringify(body), idempotencyKey);
    } catch (e) {
      console.error('[IdempotencyGuard] Error caching JSON response:', e);
    }
    return originalJson(body);
  };

  res.send = function (body: any): Response {
    try {
      const updateStmt = db.prepare(`
        UPDATE idempotency_store 
        SET state = 'PROCESSED', status_code = ?, response_payload = ? 
        WHERE idempotency_key = ?
      `);
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      updateStmt.run(res.statusCode, bodyStr, idempotencyKey);
    } catch (e) {
      console.error('[IdempotencyGuard] Error caching send response:', e);
    }
    return originalSend(body);
  };

  next();
}
