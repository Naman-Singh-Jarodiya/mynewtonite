import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { createDatabaseConnection } from '../src/db/connection.js';
import { initializeDatabaseSchema } from '../src/db/schema.js';
import { seedDatabase } from '../src/db/seed.js';
import { OutboxProcessor } from '../src/domain/outboxProcessor.js';

describe('myNewtonite Operations Control Plane — Critical Behaviors & Concurrency Tests', () => {
  let db: Database.Database;
  let outboxProcessor: OutboxProcessor;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    // In-memory isolated DB for deterministic, rapid test execution
    db = createDatabaseConnection(':memory:');
    seedDatabase(db);
    outboxProcessor = new OutboxProcessor(db);
    app = createApp(db, outboxProcessor);
  });

  afterEach(() => {
    outboxProcessor.stop();
    db.close();
  });

  describe('1. Optimistic Concurrency Control (OCC) & Race Conditions', () => {
    it('prevents two users from taking the same directive blindly (HTTP 409 Conflict on stale version)', async () => {
      // op-1004 (NEWTON-1004) is currently unassigned at version 1
      const initialRes = await request(app)
        .get('/api/operations/op-1004')
        .set('x-actor-id', 'usr-devon-eng');
      
      expect(initialRes.status).toBe(200);
      expect(initialRes.body.item.version).toBe(1);
      expect(initialRes.body.item.assigned_user_id).toBeNull();

      // User A (Devon) claims the directive with expected_version: 1
      const claimA = await request(app)
        .post('/api/operations/op-1004/claim')
        .set('x-actor-id', 'usr-devon-eng')
        .send({ expected_version: 1 });

      expect(claimA.status).toBe(200);
      expect(claimA.body.assigned_user_id).toBe('usr-devon-eng');
      expect(claimA.body.version).toBe(2);

      // User B (Aiden - Admin) was viewing version 1 concurrently and attempts to assign/claim it
      const claimB = await request(app)
        .post('/api/operations/op-1004/claim')
        .set('x-actor-id', 'usr-aiden-admin')
        .send({ expected_version: 1 }); // Stale version!

      // Server catches the collision and returns 409 Conflict with fresh current state
      expect(claimB.status).toBe(409);
      expect(claimB.body.error).toBe('Concurrency conflict detected');
      expect(claimB.body.current_version).toBe(2);
      expect(claimB.body.current_item.assigned_user_id).toBe('usr-devon-eng');
    });

    it('rejects stale status progression if another operator updated metadata concurrently', async () => {
      // op-1001 is ACTIVE at version 1
      // Operator A updates severity or metadata (bumps version to 2)
      const patchRes = await request(app)
        .patch('/api/operations/op-1001')
        .set('x-actor-id', 'usr-elena-sre')
        .send({
          expected_version: 1,
          title: 'Critical Redis Cluster Failover Timeout in eu-west-1 (ESCALATED TO INFRA LEAD)'
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.version).toBe(2);

      // Operator B submits a status transition using obsolete version 1
      const transitionRes = await request(app)
        .post('/api/operations/op-1001/transition')
        .set('x-actor-id', 'usr-elena-sre')
        .send({
          expected_version: 1,
          target_status: 'RESOLVED',
          resolution_notes: 'Replica nodes forced reboot.'
        });

      expect(transitionRes.status).toBe(409);
      expect(transitionRes.body.current_version).toBe(2);
    });
  });

  describe('2. Idempotency & Safe Request Deduplication', () => {
    it('returns identical cached response with X-Idempotent-Replay header and prevents duplicate creations', async () => {
      const idempotencyKey = 'idem-req-' + Math.random().toString(36).substring(2, 9);

      const directivePayload = {
        title: 'Kubernetes Ingress Controller CPU Throttling Alert',
        description: 'Ingress nginx pods experiencing sustained CPU saturation above 95% across cluster green.',
        category: 'SYSTEM_INCIDENT',
        severity: 'SEV1_CRITICAL',
        assigned_team_id: 'team-sre'
      };

      // First request
      const res1 = await request(app)
        .post('/api/operations')
        .set('x-actor-id', 'usr-elena-sre')
        .set('idempotency-key', idempotencyKey)
        .send(directivePayload);

      expect(res1.status).toBe(201);
      const createdItem = res1.body;
      expect(createdItem.directive_code).toBeDefined();

      // Check DB count for this title
      const count1 = db.prepare('SELECT COUNT(*) as count FROM operations WHERE title = ?').get(directivePayload.title) as any;
      expect(count1.count).toBe(1);

      // Second identical request (e.g. accidental double-click or network retry)
      const res2 = await request(app)
        .post('/api/operations')
        .set('x-actor-id', 'usr-elena-sre')
        .set('idempotency-key', idempotencyKey)
        .send(directivePayload);

      // Must return identical cached 201 response with replay header
      expect(res2.status).toBe(201);
      expect(res2.headers['x-idempotent-replay']).toBe('true');
      expect(res2.body.id).toBe(createdItem.id);
      expect(res2.body.directive_code).toBe(createdItem.directive_code);

      // DB record must NOT be duplicated
      const count2 = db.prepare('SELECT COUNT(*) as count FROM operations WHERE title = ?').get(directivePayload.title) as any;
      expect(count2.count).toBe(1);
    });

    it('rejects reusing an Idempotency-Key with a modified payload (HTTP 422 Unprocessable Entity)', async () => {
      const idempotencyKey = 'idem-tamper-' + Math.random().toString(36).substring(2, 9);

      // Initial request
      await request(app)
        .post('/api/operations')
        .set('x-actor-id', 'usr-elena-sre')
        .set('idempotency-key', idempotencyKey)
        .send({
          title: 'Database connection pool saturation',
          description: 'Connection pool exhausted on main ledger',
          category: 'INFRA_MAINTENANCE',
          severity: 'SEV2_HIGH',
          assigned_team_id: 'team-platform'
        });

      // Reuse key with altered parameters
      const tamperedRes = await request(app)
        .post('/api/operations')
        .set('x-actor-id', 'usr-elena-sre')
        .set('idempotency-key', idempotencyKey)
        .send({
          title: 'Different title attempted with same key',
          description: 'Connection pool exhausted on main ledger',
          category: 'INFRA_MAINTENANCE',
          severity: 'SEV2_HIGH',
          assigned_team_id: 'team-platform'
        });

      expect(tamperedRes.status).toBe(422);
      expect(tamperedRes.body.error).toContain('mismatched request payload');
    });
  });

  describe('3. Workflow State Machine, Dual-Signoff Gates & Segregation of Duties', () => {
    it('blocks resolving a dual-signoff gated directive directly without formal approval', async () => {
      // op-1002 requires dual signoff and is currently AWAITING_APPROVAL with PENDING status
      const directResolve = await request(app)
        .post('/api/operations/op-1002/transition')
        .set('x-actor-id', 'usr-marcus-lead')
        .send({
          expected_version: 1,
          target_status: 'RESOLVED',
          resolution_notes: 'Wire transferred manually without formal authorization.'
        });

      expect(directResolve.status).toBe(400);
      expect(directResolve.body.message).toContain('Dual-Signoff Required');
    });

    it('enforces Segregation of Duties: Creator/Assignee cannot approve their own directive (HTTP 403 Forbidden)', async () => {
      // op-1002 was created by Marcus Vance (usr-marcus-lead) and is assigned to him.
      // Marcus attempts to grant signoff to his own escrow release
      const selfApproval = await request(app)
        .post('/api/operations/op-1002/signoff')
        .set('x-actor-id', 'usr-marcus-lead')
        .send({
          expected_version: 1,
          decision: 'APPROVED',
          notes: 'Self-authorizing wire transfer.'
        });

      expect(selfApproval.status).toBe(403);
      expect(selfApproval.body.message).toContain('Segregation of Duties Violation');
    });

    it('allows an independent authorized Approver (Sophia Chen) to sign off on the directive', async () => {
      // Sophia Chen (usr-sophia-approver) has APPROVER role in team-payments and did not create op-1002
      const legitimateSignoff = await request(app)
        .post('/api/operations/op-1002/signoff')
        .set('x-actor-id', 'usr-sophia-approver')
        .send({
          expected_version: 1,
          decision: 'APPROVED',
          notes: 'Beneficiary wire credentials corroborated with corporate banking token.'
        });

      expect(legitimateSignoff.status).toBe(200);
      expect(legitimateSignoff.body.approval_status).toBe('APPROVED');
      expect(legitimateSignoff.body.status).toBe('ACTIVE');
      expect(legitimateSignoff.body.approved_by_user_id).toBe('usr-sophia-approver');
      expect(legitimateSignoff.body.version).toBe(2);

      // Now that approval has been granted, the item can be cleanly resolved
      const resolution = await request(app)
        .post('/api/operations/op-1002/transition')
        .set('x-actor-id', 'usr-marcus-lead')
        .send({
          expected_version: 2,
          target_status: 'RESOLVED',
          resolution_notes: 'Federal reserve wire sequence #99281 confirmed and logged in banking ledger.',
          root_cause_category: 'ESCROW_SETTLED'
        });

      expect(resolution.status).toBe(200);
      expect(resolution.body.status).toBe('RESOLVED');
    });

    it('rejects resolution without mandatory resolution notes (completeness guard)', async () => {
      // op-1001 is ACTIVE
      const emptyResolution = await request(app)
        .post('/api/operations/op-1001/transition')
        .set('x-actor-id', 'usr-elena-sre')
        .send({
          expected_version: 1,
          target_status: 'RESOLVED',
          resolution_notes: '   ' // empty whitespace
        });

      expect(emptyResolution.status).toBe(400);
      expect(emptyResolution.body.message).toContain('Resolution notes required');
    });
  });

  describe('4. Transactional Outbox Pattern & Background Resilience', () => {
    it('dispatches pending outbox events asynchronously', async () => {
      // Directives created insert outbox_events inside the same transaction
      const pendingCount = db.prepare("SELECT COUNT(*) as count FROM outbox_events WHERE status = 'PENDING'").get() as any;
      expect(pendingCount.count).toBeGreaterThanOrEqual(1);

      const processedCount = await outboxProcessor.processBatch(10);
      expect(processedCount).toBeGreaterThanOrEqual(1);

      const remainingPending = db.prepare("SELECT COUNT(*) as count FROM outbox_events WHERE status = 'PENDING'").get() as any;
      expect(remainingPending.count).toBe(0);
    });

    it('schedules exponential backoff on transient failure and moves to DEAD_LETTER on max attempts', async () => {
      const now = new Date().toISOString();
      const testJobId = 'out-fail-test-1';

      // Insert job configured to trigger simulated failure
      db.prepare(`
        INSERT INTO outbox_events (
          id, event_name, payload_json, status, attempt_count, max_attempts, scheduled_at, created_at, updated_at
        ) VALUES (?, 'DISPATCH_ALERT', ?, 'PENDING', 0, 3, ?, ?, ?)
      `).run(
        testJobId,
        JSON.stringify({ operationId: 'op-1001', simulateFailure: true }),
        now, now, now
      );

      // Process attempt 1
      await outboxProcessor.processBatch(10);
      let job = db.prepare('SELECT * FROM outbox_events WHERE id = ?').get(testJobId) as any;
      expect(job.status).toBe('FAILED');
      expect(job.attempt_count).toBe(1);
      expect(job.error_details).toContain('Simulated upstream gateway delivery timeout');

      // Fast-forward scheduled_at for attempt 2
      db.prepare('UPDATE outbox_events SET scheduled_at = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), testJobId);
      await outboxProcessor.processBatch(10);
      job = db.prepare('SELECT * FROM outbox_events WHERE id = ?').get(testJobId) as any;
      expect(job.status).toBe('FAILED');
      expect(job.attempt_count).toBe(2);

      // Fast-forward for attempt 3 (should transition to DEAD_LETTER because max_attempts = 3)
      db.prepare('UPDATE outbox_events SET scheduled_at = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), testJobId);
      await outboxProcessor.processBatch(10);
      job = db.prepare('SELECT * FROM outbox_events WHERE id = ?').get(testJobId) as any;
      expect(job.status).toBe('DEAD_LETTER');
      expect(job.attempt_count).toBe(3);

      // Verify manual retry functionality
      const retrySuccess = outboxProcessor.retryEvent(testJobId);
      expect(retrySuccess).toBe(true);
      job = db.prepare('SELECT * FROM outbox_events WHERE id = ?').get(testJobId) as any;
      expect(job.status).toBe('PENDING');
      expect(job.attempt_count).toBe(0);
    });

    it('evaluates SLA watchdog and automatically flags overdue directives', async () => {
      // op-1007 was seeded with SLA target in the past and status ACTIVE
      const breachedCount = outboxProcessor.evaluateSlaWatchdog();
      expect(breachedCount).toBeGreaterThanOrEqual(1);

      const op = db.prepare('SELECT * FROM operations WHERE id = ?').get('op-1007') as any;
      expect(op.sla_breached).toBe(1);

      // Check audit trail record
      const audit = db.prepare("SELECT * FROM audit_trail WHERE operation_id = ? AND action_type = 'SLA_VIOLATION_RECORDED'").get('op-1007') as any;
      expect(audit).toBeDefined();
      expect(audit.reason).toContain('Automated Watchdog');
    });
  });

  describe('5. Server-Side Filtering, Searching & Pagination', () => {
    it('searches across directive code, title, and description with correct pagination counts', async () => {
      const searchRes = await request(app)
        .get('/api/operations')
        .query({ query: 'Redis', page: 1, page_size: 5 });

      expect(searchRes.status).toBe(200);
      expect(searchRes.body.items.length).toBe(1);
      expect(searchRes.body.items[0].directive_code).toBe('NEWTON-1001');
      expect(searchRes.body.metadata.total_records).toBe(1);
      expect(searchRes.body.metadata.total_pages).toBe(1);
    });

    it('filters by status, severity, unassigned, and pending signoff', async () => {
      const filterRes = await request(app)
        .get('/api/operations')
        .query({ pending_signoff: 'true' });

      expect(filterRes.status).toBe(200);
      expect(filterRes.body.items.length).toBe(1);
      expect(filterRes.body.items[0].directive_code).toBe('NEWTON-1002');
      expect(filterRes.body.items[0].approval_status).toBe('PENDING');
    });
  });
});
