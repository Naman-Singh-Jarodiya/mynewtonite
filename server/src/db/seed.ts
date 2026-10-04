import Database from 'better-sqlite3';
import { initializeDatabaseSchema } from './schema.js';
import { createDatabaseConnection } from './connection.js';

export function seedDatabase(db: Database.Database): void {
  initializeDatabaseSchema(db);

  // Clear existing records if re-seeding
  db.exec(`
    DELETE FROM outbox_events;
    DELETE FROM idempotency_store;
    DELETE FROM operation_notes;
    DELETE FROM audit_trail;
    DELETE FROM operations;
    DELETE FROM team_memberships;
    DELETE FROM teams;
    DELETE FROM users;
  `);

  const now = new Date();
  const isoNow = now.toISOString();

  // 1. Seed Teams
  const teams = [
    {
      id: 'team-platform',
      name: 'Platform Engineering',
      code: 'ENG',
      description: 'Core infrastructure, platform services, API gateways, and distributed databases.'
    },
    {
      id: 'team-payments',
      name: 'Payment Operations',
      code: 'PAY',
      description: 'Escrow clearances, high-value wire releases, fraud analysis, and banking rails.'
    },
    {
      id: 'team-compliance',
      name: 'Risk & Compliance',
      code: 'SEC',
      description: 'Regulatory audit, GDPR data erasures, PCI-DSS compliance, and privacy governance.'
    },
    {
      id: 'team-customer-tier3',
      name: 'Tier 3 Operations Support',
      code: 'OPS',
      description: 'High-severity customer escalations, enterprise partner issues, and mission-critical incidents.'
    },
    {
      id: 'team-sre',
      name: 'Site Reliability Engineering',
      code: 'SRE',
      description: '24/7 production uptime, latency anomaly mitigation, failovers, and disaster recovery.'
    }
  ];

  const insertTeam = db.prepare(`
    INSERT INTO teams (id, name, code, description, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const t of teams) {
    insertTeam.run(t.id, t.name, t.code, t.description, isoNow);
  }

  // 2. Seed Users
  const users = [
    {
      id: 'usr-marcus-lead',
      name: 'Marcus Vance',
      email: 'marcus.vance@mynewtonite.internal',
      role_title: 'Payment Operations Lead',
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'
    },
    {
      id: 'usr-sophia-approver',
      name: 'Sophia Chen',
      email: 'sophia.chen@mynewtonite.internal',
      role_title: 'Financial Authorizer & Approver',
      avatar_url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=120&auto=format&fit=crop&q=80'
    },
    {
      id: 'usr-elena-sre',
      name: 'Elena Rostova',
      email: 'elena.rostova@mynewtonite.internal',
      role_title: 'Incident Commander & SRE Lead',
      avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80'
    },
    {
      id: 'usr-devon-eng',
      name: 'Devon Miller',
      email: 'devon.miller@mynewtonite.internal',
      role_title: 'Senior Systems Engineer',
      avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80'
    },
    {
      id: 'usr-clara-compliance',
      name: 'Clara Thorne',
      email: 'clara.thorne@mynewtonite.internal',
      role_title: 'Chief Compliance Auditor',
      avatar_url: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=120&auto=format&fit=crop&q=80'
    },
    {
      id: 'usr-zack-tier3',
      name: 'Zack Larson',
      email: 'zack.larson@mynewtonite.internal',
      role_title: 'Tier 3 Support Specialist',
      avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80'
    },
    {
      id: 'usr-aiden-admin',
      name: 'Aiden Patel',
      email: 'aiden.patel@mynewtonite.internal',
      role_title: 'Director of Operations (Global Admin)',
      avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80'
    },
    {
      id: 'usr-rachel-operator',
      name: 'Rachel Adams',
      email: 'rachel.adams@mynewtonite.internal',
      role_title: 'Operations Analyst',
      avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80'
    }
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, role_title, avatar_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const u of users) {
    insertUser.run(u.id, u.name, u.email, u.role_title, u.avatar_url, isoNow);
  }

  // 3. Seed Team Memberships
  const memberships = [
    // Marcus Vance: Lead in Payments, Operator in Platform
    { id: 'tm-1', user_id: 'usr-marcus-lead', team_id: 'team-payments', role: 'LEAD' },
    { id: 'tm-2', user_id: 'usr-marcus-lead', team_id: 'team-platform', role: 'OPERATOR' },

    // Sophia Chen: Approver in Payments
    { id: 'tm-3', user_id: 'usr-sophia-approver', team_id: 'team-payments', role: 'APPROVER' },

    // Elena Rostova: Lead in SRE, Operator in Platform
    { id: 'tm-4', user_id: 'usr-elena-sre', team_id: 'team-sre', role: 'LEAD' },
    { id: 'tm-5', user_id: 'usr-elena-sre', team_id: 'team-platform', role: 'OPERATOR' },

    // Devon Miller: Operator in Platform, Operator in SRE
    { id: 'tm-6', user_id: 'usr-devon-eng', team_id: 'team-platform', role: 'OPERATOR' },
    { id: 'tm-7', user_id: 'usr-devon-eng', team_id: 'team-sre', role: 'OPERATOR' },

    // Clara Thorne: Lead/Approver in Compliance, Auditor in Payments
    { id: 'tm-8', user_id: 'usr-clara-compliance', team_id: 'team-compliance', role: 'APPROVER' },
    { id: 'tm-9', user_id: 'usr-clara-compliance', team_id: 'team-payments', role: 'AUDITOR' },

    // Zack Larson: Operator in Tier 3
    { id: 'tm-10', user_id: 'usr-zack-tier3', team_id: 'team-customer-tier3', role: 'OPERATOR' },

    // Aiden Patel: Global Admin
    { id: 'tm-11', user_id: 'usr-aiden-admin', team_id: 'team-platform', role: 'ADMIN' },
    { id: 'tm-12', user_id: 'usr-aiden-admin', team_id: 'team-payments', role: 'ADMIN' },
    { id: 'tm-13', user_id: 'usr-aiden-admin', team_id: 'team-sre', role: 'ADMIN' },

    // Rachel Adams: Operator in Tier 3
    { id: 'tm-14', user_id: 'usr-rachel-operator', team_id: 'team-customer-tier3', role: 'OPERATOR' }
  ];

  const insertMembership = db.prepare(`
    INSERT INTO team_memberships (id, user_id, team_id, role, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const m of memberships) {
    insertMembership.run(m.id, m.user_id, m.team_id, m.role, isoNow);
  }

  // 4. Seed Operations Directives
  const operationsData = [
    {
      id: 'op-1001',
      directive_code: 'NEWTON-1001',
      title: 'Critical Redis Cluster Failover Timeout in eu-west-1',
      description: 'Primary node redis-prod-02 failed health checks. Automated sentinel failover stalled on replica synchronization. Session storage cache misses spiked to 48%.',
      category: 'SYSTEM_INCIDENT',
      severity: 'SEV1_CRITICAL',
      status: 'ACTIVE',
      assigned_team_id: 'team-sre',
      assigned_user_id: 'usr-elena-sre',
      created_by_user_id: 'usr-devon-eng',
      requires_dual_signoff: 0,
      approval_status: 'NOT_REQUIRED',
      approval_requested_at: null,
      approved_by_user_id: null,
      approval_decision_notes: null,
      resolution_notes: null,
      root_cause_category: null,
      sla_target_at: new Date(now.getTime() + 45 * 60 * 1000).toISOString(), // 45 mins left
      sla_breached: 0,
      version: 1,
      metadata: { environment: 'eu-west-1', affected_services: ['auth-gateway', 'session-cache'], cluster_nodes: 6 }
    },
    {
      id: 'op-1002',
      directive_code: 'NEWTON-1002',
      title: 'High-Value Transaction Release: $620,000 Corporate Escrow',
      description: 'Manual wire clearance mandated for enterprise acquisition escrow release. Transaction velocity filters flagged anomalous account destination switch.',
      category: 'FINANCIAL_TX',
      severity: 'SEV1_CRITICAL',
      status: 'AWAITING_APPROVAL',
      assigned_team_id: 'team-payments',
      assigned_user_id: 'usr-marcus-lead',
      created_by_user_id: 'usr-marcus-lead', // Marcus created and owns this!
      requires_dual_signoff: 1,
      approval_status: 'PENDING',
      approval_requested_at: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
      approved_by_user_id: null,
      approval_decision_notes: null,
      resolution_notes: null,
      root_cause_category: null,
      sla_target_at: new Date(now.getTime() + 120 * 60 * 1000).toISOString(),
      sla_breached: 0,
      version: 1,
      metadata: { transaction_amount: 620000, currency: 'USD', beneficiary_iban: 'GB82WEST12345678901234', anti_fraud_score: 89 }
    },
    {
      id: 'op-1003',
      directive_code: 'NEWTON-1003',
      title: 'GDPR Article 17 Erasure Mandate: User #88219 Customer Profile',
      description: 'Formal European Data Protection Authority erasure request received for enterprise account #88219. Mandatory deletion across operational stores, backups, and analytical pipelines.',
      category: 'SECURITY_COMPLIANCE',
      severity: 'SEV2_HIGH',
      status: 'ACTIVE',
      assigned_team_id: 'team-compliance',
      assigned_user_id: 'usr-clara-compliance',
      created_by_user_id: 'usr-zack-tier3',
      requires_dual_signoff: 1,
      approval_status: 'APPROVED',
      approval_requested_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      approved_by_user_id: 'usr-aiden-admin',
      approval_decision_notes: 'Authorized by Compliance Legal Council. Retention period verified.',
      resolution_notes: null,
      root_cause_category: null,
      sla_target_at: new Date(now.getTime() + 180 * 60 * 1000).toISOString(),
      sla_breached: 0,
      version: 2,
      metadata: { legal_reference: 'DPA-EU-2026-0981', target_user_id: '88219', dpo_contact: 'legal@mynewtonite.internal' }
    },
    {
      id: 'op-1004',
      directive_code: 'NEWTON-1004',
      title: 'API Rate-Limiting Storm Triggered by Enterprise Partner Webhook',
      description: 'Inbound webhooks from Partner ApexCorp are generating 12,000 requests/sec, causing rate limit cascades and blocking other tenant webhooks.',
      category: 'CUSTOMER_ESCALATION',
      severity: 'SEV2_HIGH',
      status: 'INTAKE',
      assigned_team_id: 'team-platform',
      assigned_user_id: null, // Unassigned! Perfect for claiming conflict test
      created_by_user_id: 'usr-zack-tier3',
      requires_dual_signoff: 0,
      approval_status: 'NOT_REQUIRED',
      approval_requested_at: null,
      approved_by_user_id: null,
      approval_decision_notes: null,
      resolution_notes: null,
      root_cause_category: null,
      sla_target_at: new Date(now.getTime() + 210 * 60 * 1000).toISOString(),
      sla_breached: 0,
      version: 1,
      metadata: { tenant_id: 'tenant-apex-99', webhook_burst_rate: '12k rps', error_code: 'HTTP 429' }
    },
    {
      id: 'op-1005',
      directive_code: 'NEWTON-1005',
      title: 'Kafka Consumer Lag Surge on Payment Settlement Topic',
      description: 'Consumer group settlement-worker-pool lag has risen past 42,000 messages. Financial settlement delays impacting daily automated reconciliation ledger.',
      category: 'DATA_PIPELINE',
      severity: 'SEV2_HIGH',
      status: 'TRIAGED',
      assigned_team_id: 'team-sre',
      assigned_user_id: null,
      created_by_user_id: 'usr-elena-sre',
      requires_dual_signoff: 0,
      approval_status: 'NOT_REQUIRED',
      approval_requested_at: null,
      approved_by_user_id: null,
      approval_decision_notes: null,
      resolution_notes: null,
      root_cause_category: null,
      sla_target_at: new Date(now.getTime() + 150 * 60 * 1000).toISOString(),
      sla_breached: 0,
      version: 1,
      metadata: { kafka_topic: 'payments.settlement.v2', lag_count: 42100, cluster: 'kafka-prod-green' }
    },
    {
      id: 'op-1006',
      directive_code: 'NEWTON-1006',
      title: 'PostgreSQL Read Replica Replication Delay Spike (>45s)',
      description: 'Long-running vacuum process on reporting replica postgres-ro-03 saturated I/O bandwidth, causing replication delay to exceed SLA threshold.',
      category: 'INFRA_MAINTENANCE',
      severity: 'SEV3_MEDIUM',
      status: 'ACTIVE',
      assigned_team_id: 'team-platform',
      assigned_user_id: 'usr-devon-eng',
      created_by_user_id: 'usr-elena-sre',
      requires_dual_signoff: 0,
      approval_status: 'NOT_REQUIRED',
      approval_requested_at: null,
      approved_by_user_id: null,
      approval_decision_notes: null,
      resolution_notes: null,
      root_cause_category: null,
      sla_target_at: new Date(now.getTime() + 18 * 60 * 60 * 1000).toISOString(),
      sla_breached: 0,
      version: 1,
      metadata: { replica_host: 'postgres-ro-03', disk_io_utilization: '99.4%', replication_delay_sec: 48 }
    },
    {
      id: 'op-1007',
      directive_code: 'NEWTON-1007',
      title: 'Enterprise SLA Incident: Checkout Latency Degradation (Past SLA Target)',
      description: 'North American checkout flow p99 latency exceeded 2.4 seconds due to third-party address verification API timeout. Target SLA has been breached.',
      category: 'SYSTEM_INCIDENT',
      severity: 'SEV1_CRITICAL',
      status: 'ACTIVE',
      assigned_team_id: 'team-customer-tier3',
      assigned_user_id: 'usr-zack-tier3',
      created_by_user_id: 'usr-zack-tier3',
      requires_dual_signoff: 0,
      approval_status: 'NOT_REQUIRED',
      approval_requested_at: null,
      approved_by_user_id: null,
      approval_decision_notes: null,
      resolution_notes: null,
      root_cause_category: null,
      sla_target_at: new Date(now.getTime() - 25 * 60 * 1000).toISOString(), // Breached in past!
      sla_breached: 0,
      version: 1,
      metadata: { p99_latency_ms: 2450, affected_region: 'us-east-1', third_party_provider: 'PostalVerify-API' }
    },
    {
      id: 'op-1008',
      directive_code: 'NEWTON-1008',
      title: 'Quarterly PCI-DSS Audit Artifact Verification & Attestation',
      description: 'Routine quarterly verification of encryption key rotations and tokenization gateway certificates.',
      category: 'SECURITY_COMPLIANCE',
      severity: 'SEV3_MEDIUM',
      status: 'RESOLVED',
      assigned_team_id: 'team-compliance',
      assigned_user_id: 'usr-clara-compliance',
      created_by_user_id: 'usr-clara-compliance',
      requires_dual_signoff: 0,
      approval_status: 'NOT_REQUIRED',
      approval_requested_at: null,
      approved_by_user_id: null,
      approval_decision_notes: null,
      resolution_notes: 'All cryptographic key rotation logs and IAM access matrices validated and signed off in compliance repository.',
      root_cause_category: 'ROUTINE_AUDIT_PASS',
      sla_target_at: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
      sla_breached: 0,
      version: 2,
      metadata: { compliance_framework: 'PCI-DSS v4.0', audit_scope: 'Cardholder Data Environment' }
    }
  ];

  const insertOp = db.prepare(`
    INSERT INTO operations (
      id, directive_code, title, description, category, severity, status,
      assigned_team_id, assigned_user_id, created_by_user_id,
      requires_dual_signoff, approval_status, approval_requested_at,
      approved_by_user_id, approval_decision_notes, resolution_notes,
      root_cause_category, sla_target_at, sla_breached, version,
      metadata_json, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?
    )
  `);

  const insertAudit = db.prepare(`
    INSERT INTO audit_trail (id, operation_id, actor_id, action_type, diff_before, diff_after, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertNote = db.prepare(`
    INSERT INTO operation_notes (id, operation_id, author_id, content, is_confidential, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const op of operationsData) {
    insertOp.run(
      op.id,
      op.directive_code,
      op.title,
      op.description,
      op.category,
      op.severity,
      op.status,
      op.assigned_team_id,
      op.assigned_user_id,
      op.created_by_user_id,
      op.requires_dual_signoff,
      op.approval_status,
      op.approval_requested_at,
      op.approved_by_user_id,
      op.approval_decision_notes,
      op.resolution_notes,
      op.root_cause_category,
      op.sla_target_at,
      op.sla_breached,
      op.version,
      JSON.stringify(op.metadata),
      isoNow,
      isoNow
    );

    // Initial creation audit entry
    insertAudit.run(
      'aud-' + Math.random().toString(36).substring(2, 9),
      op.id,
      op.created_by_user_id,
      'CREATED',
      null,
      JSON.stringify({ status: op.status, severity: op.severity }),
      `Operational directive logged with code ${op.directive_code}`,
      isoNow
    );

    // Sample comment
    insertNote.run(
      'not-' + Math.random().toString(36).substring(2, 9),
      op.id,
      op.created_by_user_id,
      `Directive initiated. Target SLA due at ${new Date(op.sla_target_at).toLocaleTimeString()}.`,
      0,
      isoNow
    );
  }

  // Add specific notes for approval item (NEWTON-1002)
  insertNote.run(
    'not-escrow-1',
    'op-1002',
    'usr-marcus-lead',
    'Bank account confirmation verified via secondary callback. Ready for Dual-Signoff approval by Lead/Approver.',
    1,
    isoNow
  );

  insertAudit.run(
    'aud-escrow-approval-req',
    'op-1002',
    'usr-marcus-lead',
    'SIGNOFF_REQUESTED',
    JSON.stringify({ approval_status: 'NOT_REQUIRED' }),
    JSON.stringify({ approval_status: 'PENDING', status: 'AWAITING_APPROVAL' }),
    'Formal dual-signoff authorization requested by Marcus Vance.',
    isoNow
  );

  // Initial Outbox Events
  const insertOutbox = db.prepare(`
    INSERT INTO outbox_events (
      id, event_name, payload_json, status, attempt_count, max_attempts, scheduled_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertOutbox.run(
    'out-init-1',
    'DISPATCH_ALERT',
    JSON.stringify({
      operationId: 'op-1001',
      directiveCode: 'NEWTON-1001',
      title: 'Critical Redis Cluster Failover Timeout in eu-west-1',
      teamId: 'team-sre'
    }),
    'PENDING',
    0,
    5,
    isoNow,
    isoNow,
    isoNow
  );

  insertOutbox.run(
    'out-init-2',
    'DISPATCH_ALERT',
    JSON.stringify({
      operationId: 'op-1008',
      directiveCode: 'NEWTON-1008',
      title: 'Quarterly PCI-DSS Audit Artifact Verification & Attestation',
      teamId: 'team-compliance'
    }),
    'PROCESSED',
    1,
    5,
    isoNow,
    isoNow,
    isoNow
  );

  console.log(`[Seed] Successfully seeded myNewtonite database with ${teams.length} teams, ${users.length} users, and ${operationsData.length} operations directives.`);
}

// If executed directly via CLI
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  const db = createDatabaseConnection();
  seedDatabase(db);
  db.close();
}
