import Database from 'better-sqlite3';
import { OutboxEvent } from '../types.js';
import { StreamHub } from '../events/streamHub.js';

export class OutboxProcessor {
  private db: Database.Database;
  private intervalHandle: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;
  private isRunning: boolean = false;

  constructor(db: Database.Database) {
    this.db = db;
  }

  start(intervalMs: number = 2000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalHandle = setInterval(() => {
      this.processBatch();
      this.evaluateSlaWatchdog();
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.isRunning = false;
  }

  /**
   * Process next batch of pending or retryable outbox events
   */
  async processBatch(batchLimit: number = 10): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        SELECT * FROM outbox_events
        WHERE status = 'PENDING'
           OR (status = 'FAILED' AND scheduled_at <= ? AND attempt_count < max_attempts)
        ORDER BY created_at ASC
        LIMIT ?
      `);

      const events = stmt.all(now, batchLimit) as OutboxEvent[];
      if (events.length === 0) {
        this.isProcessing = false;
        return 0;
      }

      for (const ev of events) {
        await this.handleEvent(ev);
      }

      return events.length;
    } catch (err) {
      console.error('[OutboxProcessor] Batch execution failure:', err);
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }

  private async handleEvent(ev: OutboxEvent): Promise<void> {
    const markInFlight = this.db.prepare(`
      UPDATE outbox_events 
      SET status = 'IN_FLIGHT', updated_at = ? 
      WHERE id = ? AND status IN ('PENDING', 'FAILED')
    `);
    markInFlight.run(new Date().toISOString(), ev.id);

    try {
      const payload = JSON.parse(ev.payload_json);

      // Unit test hook for deliberate failure verification
      if (payload?.simulateFailure) {
        throw new Error('Simulated upstream gateway delivery timeout (HTTP 504 Gateway Timeout)');
      }

      // Simulate outbound delivery
      switch (ev.event_name) {
        case 'DISPATCH_ALERT':
          StreamHub.broadcast('ALERT_DISPATCHED', {
            operationId: payload.operationId,
            directiveCode: payload.directiveCode,
            title: payload.title,
            channel: payload.channel || 'INTERNAL_OPS_FEED'
          });
          break;

        case 'EVALUATE_SLA':
        case 'ENRICH_AUDIT':
        case 'WEBHOOK_OUTBOUND':
          // Process secondary enrichment
          break;

        default:
          throw new Error(`Unrecognized event type: ${ev.event_name}`);
      }

      // Mark PROCESSED
      const markProcessed = this.db.prepare(`
        UPDATE outbox_events 
        SET status = 'PROCESSED', updated_at = ? 
        WHERE id = ?
      `);
      markProcessed.run(new Date().toISOString(), ev.id);
    } catch (err: any) {
      const newAttempts = ev.attempt_count + 1;
      const isDeadLetter = newAttempts >= ev.max_attempts;
      const nextStatus = isDeadLetter ? 'DEAD_LETTER' : 'FAILED';

      // Exponential backoff with jitter: 2^attempts * 1000ms + random 0-250ms
      const backoffMs = Math.pow(2, newAttempts) * 1000 + Math.floor(Math.random() * 250);
      const nextScheduled = new Date(Date.now() + backoffMs).toISOString();

      const markFailed = this.db.prepare(`
        UPDATE outbox_events 
        SET status = ?, 
            attempt_count = ?, 
            error_details = ?, 
            scheduled_at = ?, 
            updated_at = ? 
        WHERE id = ?
      `);
      markFailed.run(
        nextStatus,
        newAttempts,
        err?.message || 'Unknown processing error',
        nextScheduled,
        new Date().toISOString(),
        ev.id
      );

      if (isDeadLetter) {
        console.warn(`[OutboxProcessor] Event ${ev.id} exhausted max retries (${ev.max_attempts}). Moved to DEAD_LETTER.`);
      }
    }
  }

  /**
   * Evaluates active operational directives for SLA deadline breach
   */
  evaluateSlaWatchdog(): number {
    const now = new Date().toISOString();
    const findViolations = this.db.prepare(`
      SELECT id, directive_code, title, assigned_team_id, assigned_user_id, sla_target_at
      FROM operations
      WHERE sla_target_at < ?
        AND sla_breached = 0
        AND status NOT IN ('RESOLVED', 'CLOSED_ABORTED')
    `);

    const violations = findViolations.all(now) as any[];
    if (violations.length === 0) return 0;

    const updateSla = this.db.prepare(`
      UPDATE operations 
      SET sla_breached = 1, updated_at = ? 
      WHERE id = ?
    `);

    const recordAudit = this.db.prepare(`
      INSERT INTO audit_trail (id, operation_id, actor_id, action_type, diff_before, diff_after, reason, created_at)
      VALUES (?, ?, ?, 'SLA_VIOLATION_RECORDED', ?, ?, ?, ?)
    `);

    for (const item of violations) {
      updateSla.run(now, item.id);
      
      const auditId = 'aud-' + Math.random().toString(36).substring(2, 9);
      recordAudit.run(
        auditId,
        item.id,
        null,
        JSON.stringify({ sla_breached: false }),
        JSON.stringify({ sla_breached: true }),
        `Automated Watchdog: Target SLA deadline (${new Date(item.sla_target_at).toLocaleTimeString()}) has been breached.`,
        now
      );

      StreamHub.broadcast('SLA_BREACH_ALERT', {
        operationId: item.id,
        directiveCode: item.directive_code,
        title: item.title,
        breachedAt: now
      });
    }

    return violations.length;
  }

  /**
   * Retrieves summary queue metrics for operational dashboard
   */
  getQueueStats(): {
    total: number;
    pending: number;
    in_flight: number;
    processed: number;
    failed: number;
    dead_letter: number;
  } {
    const rows = this.db.prepare(`
      SELECT status, COUNT(*) as count 
      FROM outbox_events 
      GROUP BY status
    `).all() as { status: string; count: number }[];

    const stats = {
      total: 0,
      pending: 0,
      in_flight: 0,
      processed: 0,
      failed: 0,
      dead_letter: 0
    };

    for (const r of rows) {
      stats.total += r.count;
      if (r.status === 'PENDING') stats.pending = r.count;
      if (r.status === 'IN_FLIGHT') stats.in_flight = r.count;
      if (r.status === 'PROCESSED') stats.processed = r.count;
      if (r.status === 'FAILED') stats.failed = r.count;
      if (r.status === 'DEAD_LETTER') stats.dead_letter = r.count;
    }

    return stats;
  }

  /**
   * Manually resets a failed or dead-letter job for immediate reprocessing
   */
  retryEvent(eventId: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE outbox_events 
      SET status = 'PENDING', scheduled_at = ?, attempt_count = 0, error_details = NULL, updated_at = ?
      WHERE id = ?
    `);
    const now = new Date().toISOString();
    const result = stmt.run(now, now, eventId);
    return result.changes > 0;
  }
}
