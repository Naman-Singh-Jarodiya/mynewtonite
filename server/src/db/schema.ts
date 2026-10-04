import Database from 'better-sqlite3';

export function initializeDatabaseSchema(db: Database.Database): void {
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role_title TEXT NOT NULL,
      avatar_url TEXT,
      created_at TEXT NOT NULL
    );

    -- Teams table
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Team Memberships (Users can belong to multiple teams with distinct permissions)
    CREATE TABLE IF NOT EXISTS team_memberships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'LEAD', 'OPERATOR', 'APPROVER', 'AUDITOR')),
      created_at TEXT NOT NULL,
      UNIQUE(user_id, team_id)
    );

    -- Operations Directives Table (Work Items)
    CREATE TABLE IF NOT EXISTS operations (
      id TEXT PRIMARY KEY,
      directive_code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('SYSTEM_INCIDENT', 'FINANCIAL_TX', 'CUSTOMER_ESCALATION', 'SECURITY_COMPLIANCE', 'INFRA_MAINTENANCE', 'DATA_PIPELINE')),
      severity TEXT NOT NULL CHECK(severity IN ('SEV1_CRITICAL', 'SEV2_HIGH', 'SEV3_MEDIUM', 'SEV4_LOW')),
      status TEXT NOT NULL CHECK(status IN ('INTAKE', 'TRIAGED', 'ACTIVE', 'AWAITING_APPROVAL', 'RESOLVED', 'CLOSED_ABORTED')),
      assigned_team_id TEXT NOT NULL REFERENCES teams(id),
      assigned_user_id TEXT REFERENCES users(id),
      created_by_user_id TEXT NOT NULL REFERENCES users(id),
      requires_dual_signoff INTEGER NOT NULL DEFAULT 0,
      approval_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED' CHECK(approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'NOT_REQUIRED')),
      approval_requested_at TEXT,
      approved_by_user_id TEXT REFERENCES users(id),
      approval_decision_notes TEXT,
      resolution_notes TEXT,
      root_cause_category TEXT,
      sla_target_at TEXT NOT NULL,
      sla_breached INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- High-performance composite indexes
    CREATE INDEX IF NOT EXISTS idx_ops_status_severity ON operations(status, severity);
    CREATE INDEX IF NOT EXISTS idx_ops_team_status ON operations(assigned_team_id, status);
    CREATE INDEX IF NOT EXISTS idx_ops_user_status ON operations(assigned_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_ops_sla ON operations(sla_target_at, sla_breached);
    CREATE INDEX IF NOT EXISTS idx_ops_created ON operations(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ops_code ON operations(directive_code);

    -- Immutable Audit Trail
    CREATE TABLE IF NOT EXISTS audit_trail (
      id TEXT PRIMARY KEY,
      operation_id TEXT NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
      actor_id TEXT REFERENCES users(id),
      action_type TEXT NOT NULL,
      diff_before TEXT,
      diff_after TEXT,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_operation ON audit_trail(operation_id, created_at ASC);

    -- Operation Notes & Discussions
    CREATE TABLE IF NOT EXISTS operation_notes (
      id TEXT PRIMARY KEY,
      operation_id TEXT NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      is_confidential INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notes_operation ON operation_notes(operation_id, created_at ASC);

    -- Idempotency Records (for duplicate suppression & safe retries)
    CREATE TABLE IF NOT EXISTS idempotency_store (
      idempotency_key TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('IN_FLIGHT', 'PROCESSED', 'FAILED')),
      status_code INTEGER,
      response_payload TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- Transactional Outbox Events (guaranteed asynchronous processing)
    CREATE TABLE IF NOT EXISTS outbox_events (
      id TEXT PRIMARY KEY,
      event_name TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'IN_FLIGHT', 'PROCESSED', 'FAILED', 'DEAD_LETTER')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      error_details TEXT,
      scheduled_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_outbox_queue ON outbox_events(status, scheduled_at);
  `);
}
