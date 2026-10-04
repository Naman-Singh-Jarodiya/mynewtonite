import Database from 'better-sqlite3';
import { 
  OperationDirective, 
  OperationDirectiveEnriched, 
  DirectiveQueryFilter, 
  PagedResponse, 
  UserWithProfile, 
  DirectiveStatus, 
  AuditEntry, 
  OperationNote, 
  SeverityLevel, 
  DirectiveCategory 
} from '../types.js';
import { WorkflowStateMachine } from '../domain/workflowStateMachine.js';
import { StreamHub } from '../events/streamHub.js';
import { config } from '../config/index.js';

export class ConcurrencyConflictError extends Error {
  public currentVersion: number;
  public currentItem: OperationDirectiveEnriched;
  constructor(message: string, currentVersion: number, currentItem: OperationDirectiveEnriched) {
    super(message);
    this.name = 'ConcurrencyConflictError';
    this.currentVersion = currentVersion;
    this.currentItem = currentItem;
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class OperationService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  static computeSlaTarget(severity: SeverityLevel, baseDate: Date = new Date()): string {
    const hours = config.slaHours[severity] || 24;
    return new Date(baseDate.getTime() + hours * 60 * 60 * 1000).toISOString();
  }

  /**
   * Filter, search, and page through operations directives
   */
  listOperations(filter: DirectiveQueryFilter = {}): PagedResponse<OperationDirectiveEnriched> {
    const clauses: string[] = [];
    const params: any[] = [];

    if (filter.query) {
      clauses.push(`(
        o.directive_code LIKE ? OR
        o.title LIKE ? OR
        o.description LIKE ?
      )`);
      const wild = `%${filter.query}%`;
      params.push(wild, wild, wild);
    }

    if (filter.team_id) {
      clauses.push('o.assigned_team_id = ?');
      params.push(filter.team_id);
    }

    if (filter.user_id) {
      clauses.push('o.assigned_user_id = ?');
      params.push(filter.user_id);
    }

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        if (filter.status.length > 0) {
          clauses.push(`o.status IN (${filter.status.map(() => '?').join(',')})`);
          params.push(...filter.status);
        }
      } else {
        clauses.push('o.status = ?');
        params.push(filter.status);
      }
    }

    if (filter.category) {
      clauses.push('o.category = ?');
      params.push(filter.category);
    }

    if (filter.severity) {
      clauses.push('o.severity = ?');
      params.push(filter.severity);
    }

    if (filter.unassigned) {
      clauses.push('o.assigned_user_id IS NULL');
    }

    if (filter.pending_signoff) {
      clauses.push("o.requires_dual_signoff = 1 AND o.approval_status = 'PENDING'");
    }

    if (filter.sla_breached !== undefined) {
      clauses.push('o.sla_breached = ?');
      params.push(filter.sla_breached ? 1 : 0);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    // Total Count
    const countSql = `SELECT COUNT(*) as total FROM operations o ${whereClause}`;
    const totalCount = (this.db.prepare(countSql).get(...params) as any).total;

    // Sorting
    const sortMap: Record<string, string> = {
      created_at: 'o.created_at',
      updated_at: 'o.updated_at',
      severity: `CASE o.severity 
        WHEN 'SEV1_CRITICAL' THEN 1 
        WHEN 'SEV2_HIGH' THEN 2 
        WHEN 'SEV3_MEDIUM' THEN 3 
        WHEN 'SEV4_LOW' THEN 4 
        ELSE 5 END`,
      sla_target_at: 'o.sla_target_at',
      directive_code: 'o.directive_code'
    };

    const sortBy = sortMap[filter.order_by || 'created_at'] || 'o.created_at';
    const sortDirection = filter.order_direction === 'asc' ? 'ASC' : 'DESC';

    // Pagination
    const page = Math.max(1, filter.page || 1);
    const pageSize = Math.min(100, Math.max(1, filter.page_size || 20));
    const offset = (page - 1) * pageSize;

    const selectSql = `
      SELECT 
        o.*,
        t.name as assigned_team_name,
        t.code as assigned_team_code,
        u_assignee.name as assigned_user_name,
        u_creator.name as created_by_user_name,
        u_approver.name as approved_by_user_name,
        (SELECT COUNT(*) FROM operation_notes n WHERE n.operation_id = o.id) as notes_count
      FROM operations o
      JOIN teams t ON o.assigned_team_id = t.id
      LEFT JOIN users u_assignee ON o.assigned_user_id = u_assignee.id
      LEFT JOIN users u_creator ON o.created_by_user_id = u_creator.id
      LEFT JOIN users u_approver ON o.approved_by_user_id = u_approver.id
      ${whereClause}
      ORDER BY ${sortBy} ${sortDirection}
      LIMIT ? OFFSET ?
    `;

    const rawRows = this.db.prepare(selectSql).all(...params, pageSize, offset) as any[];

    const items: OperationDirectiveEnriched[] = rawRows.map(r => ({
      ...r,
      requires_dual_signoff: Boolean(r.requires_dual_signoff),
      sla_breached: Boolean(r.sla_breached),
      parsed_metadata: r.metadata_json ? JSON.parse(r.metadata_json) : {}
    }));

    return {
      items,
      metadata: {
        total_records: totalCount,
        current_page: page,
        page_size: pageSize,
        total_pages: Math.ceil(totalCount / pageSize) || 1
      }
    };
  }

  /**
   * Retrieves single directive with full audit trail and notes
   */
  getOperationById(idOrCode: string): {
    item: OperationDirectiveEnriched;
    auditTrail: AuditEntry[];
    notes: OperationNote[];
    viewers: { userId: string; userName: string }[];
  } {
    const sql = `
      SELECT 
        o.*,
        t.name as assigned_team_name,
        t.code as assigned_team_code,
        u_assignee.name as assigned_user_name,
        u_creator.name as created_by_user_name,
        u_approver.name as approved_by_user_name
      FROM operations o
      JOIN teams t ON o.assigned_team_id = t.id
      LEFT JOIN users u_assignee ON o.assigned_user_id = u_assignee.id
      LEFT JOIN users u_creator ON o.created_by_user_id = u_creator.id
      LEFT JOIN users u_approver ON o.approved_by_user_id = u_approver.id
      WHERE o.id = ? OR o.directive_code = ?
    `;

    const raw = this.db.prepare(sql).get(idOrCode, idOrCode) as any;
    if (!raw) {
      throw new NotFoundError(`Operational directive '${idOrCode}' not found`);
    }

    const item: OperationDirectiveEnriched = {
      ...raw,
      requires_dual_signoff: Boolean(raw.requires_dual_signoff),
      sla_breached: Boolean(raw.sla_breached),
      parsed_metadata: raw.metadata_json ? JSON.parse(raw.metadata_json) : {}
    };

    const auditSql = `
      SELECT a.*, u.name as actor_name
      FROM audit_trail a
      LEFT JOIN users u ON a.actor_id = u.id
      WHERE a.operation_id = ?
      ORDER BY a.created_at DESC
    `;
    const auditTrail = this.db.prepare(auditSql).all(item.id) as AuditEntry[];

    const notesSql = `
      SELECT n.*, u.name as author_name, u.avatar_url as author_avatar
      FROM operation_notes n
      LEFT JOIN users u ON n.author_id = u.id
      WHERE n.operation_id = ?
      ORDER BY n.created_at ASC
    `;
    const rawNotes = this.db.prepare(notesSql).all(item.id) as any[];
    const notes: OperationNote[] = rawNotes.map(n => ({
      ...n,
      is_confidential: Boolean(n.is_confidential)
    }));

    const viewers = StreamHub.getPresence(item.id);

    return { item, auditTrail, notes, viewers };
  }

  /**
   * Atomically create operational directive, record audit entry, and dispatch outbox event
   */
  createOperation(
    payload: {
      title: string;
      description: string;
      category: DirectiveCategory;
      severity: SeverityLevel;
      assigned_team_id: string;
      assigned_user_id?: string;
      requires_dual_signoff?: boolean;
      metadata?: Record<string, any>;
    },
    creator: UserWithProfile
  ): OperationDirectiveEnriched {
    const id = 'op-' + Math.random().toString(36).substring(2, 10);
    const now = new Date().toISOString();
    const slaTarget = OperationService.computeSlaTarget(payload.severity);
    const metaJson = JSON.stringify(payload.metadata || {});

    // Compute next code
    const maxRow = this.db.prepare(`
      SELECT directive_code FROM operations ORDER BY rowid DESC LIMIT 1
    `).get() as any;

    let seq = 1001;
    if (maxRow && maxRow.directive_code) {
      const match = maxRow.directive_code.match(/NEWTON-(\d+)/);
      if (match) seq = parseInt(match[1], 10) + 1;
    }
    const directiveCode = `NEWTON-${seq}`;

    const requiresSignoff = payload.requires_dual_signoff ? 1 : 0;
    const initialStatus: DirectiveStatus = 'INTAKE';

    const insertOp = this.db.prepare(`
      INSERT INTO operations (
        id, directive_code, title, description, category, severity, status,
        assigned_team_id, assigned_user_id, created_by_user_id,
        requires_dual_signoff, approval_status, sla_target_at, sla_breached,
        version, metadata_json, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, 'NOT_REQUIRED', ?, 0,
        1, ?, ?, ?
      )
    `);

    const insertAudit = this.db.prepare(`
      INSERT INTO audit_trail (
        id, operation_id, actor_id, action_type, diff_before, diff_after, reason, created_at
      ) VALUES (?, ?, ?, 'CREATED', NULL, ?, 'Directive logged into operations platform', ?)
    `);

    const insertOutbox = this.db.prepare(`
      INSERT INTO outbox_events (
        id, event_name, payload_json, status, attempt_count, max_attempts, scheduled_at, created_at, updated_at
      ) VALUES (?, 'DISPATCH_ALERT', ?, 'PENDING', 0, 5, ?, ?, ?)
    `);

    const executeTx = this.db.transaction(() => {
      insertOp.run(
        id, directiveCode, payload.title, payload.description, payload.category, payload.severity, initialStatus,
        payload.assigned_team_id, payload.assigned_user_id || null, creator.id,
        requiresSignoff, slaTarget,
        metaJson, now, now
      );

      const auditId = 'aud-' + Math.random().toString(36).substring(2, 9);
      insertAudit.run(
        auditId, id, creator.id,
        JSON.stringify({ status: initialStatus, severity: payload.severity }),
        now
      );

      const outboxId = 'out-' + Math.random().toString(36).substring(2, 9);
      const outboxPayload = JSON.stringify({
        operationId: id,
        directiveCode,
        title: payload.title,
        teamId: payload.assigned_team_id
      });
      insertOutbox.run(outboxId, outboxPayload, now, now, now);
    });

    executeTx();

    const created = this.getOperationById(id).item;
    StreamHub.broadcast('DIRECTIVE_CREATED', { item: created });
    return created;
  }

  /**
   * Claim directive ownership using Optimistic Concurrency Control
   */
  claimOperation(id: string, actor: UserWithProfile, expectedVersion: number): OperationDirectiveEnriched {
    const current = this.getOperationById(id).item;

    const claimCheck = WorkflowStateMachine.validateClaim(current, actor);
    if (!claimCheck.allowed) {
      throw new ForbiddenError(claimCheck.reason || 'Not authorized to claim ownership');
    }

    const now = new Date().toISOString();
    // Auto-advance INTAKE or TRIAGED to ACTIVE
    const nextStatus: DirectiveStatus = (current.status === 'INTAKE' || current.status === 'TRIAGED')
      ? 'ACTIVE'
      : current.status;

    // Atomic OCC conditional update
    const updateStmt = this.db.prepare(`
      UPDATE operations
      SET assigned_user_id = ?,
          status = ?,
          version = version + 1,
          updated_at = ?
      WHERE id = ? AND version = ?
    `);

    const result = updateStmt.run(actor.id, nextStatus, now, current.id, expectedVersion);

    if (result.changes === 0) {
      const fresh = this.getOperationById(id).item;
      throw new ConcurrencyConflictError(
        `Conflict detected: Directive ${fresh.directive_code} has already been updated to version ${fresh.version} by another user.`,
        fresh.version,
        fresh
      );
    }

    // Record audit entry
    const auditId = 'aud-' + Math.random().toString(36).substring(2, 9);
    this.db.prepare(`
      INSERT INTO audit_trail (
        id, operation_id, actor_id, action_type, diff_before, diff_after, reason, created_at
      ) VALUES (?, ?, ?, 'OWNERSHIP_CLAIMED', ?, ?, ?, ?)
    `).run(
      auditId, current.id, actor.id,
      JSON.stringify({ assigned_user_id: current.assigned_user_id, status: current.status }),
      JSON.stringify({ assigned_user_id: actor.id, status: nextStatus }),
      `Claimed operational responsibility for ${current.directive_code}`,
      now
    );

    const updated = this.getOperationById(id).item;
    StreamHub.broadcast('DIRECTIVE_UPDATED', { item: updated, actorId: actor.id });
    return updated;
  }

  /**
   * Transition directive status with state machine & OCC
   */
  transitionStatus(
    id: string,
    targetStatus: DirectiveStatus,
    actor: UserWithProfile,
    expectedVersion: number,
    params?: {
      resolution_notes?: string;
      root_cause_category?: string;
      reason?: string;
    }
  ): OperationDirectiveEnriched {
    const current = this.getOperationById(id).item;

    const transitionCheck = WorkflowStateMachine.validateTransition(current, targetStatus, actor, params);
    if (!transitionCheck.allowed) {
      throw new ValidationError(transitionCheck.reason || 'Invalid state transition');
    }

    const now = new Date().toISOString();
    const resolutionNotes = targetStatus === 'RESOLVED'
      ? (params?.resolution_notes || current.resolution_notes)
      : current.resolution_notes;

    const rootCause = targetStatus === 'RESOLVED'
      ? (params?.root_cause_category || current.root_cause_category)
      : current.root_cause_category;

    const approvalStatus = targetStatus === 'AWAITING_APPROVAL'
      ? 'PENDING'
      : current.approval_status;

    const approvalRequestedAt = targetStatus === 'AWAITING_APPROVAL'
      ? now
      : current.approval_requested_at;

    // Atomic OCC update
    const updateStmt = this.db.prepare(`
      UPDATE operations
      SET status = ?,
          resolution_notes = ?,
          root_cause_category = ?,
          approval_status = ?,
          approval_requested_at = ?,
          version = version + 1,
          updated_at = ?
      WHERE id = ? AND version = ?
    `);

    const result = updateStmt.run(
      targetStatus,
      resolutionNotes,
      rootCause,
      approvalStatus,
      approvalRequestedAt,
      now,
      current.id,
      expectedVersion
    );

    if (result.changes === 0) {
      const fresh = this.getOperationById(id).item;
      throw new ConcurrencyConflictError(
        `Conflict detected: Directive ${fresh.directive_code} has already been updated to version ${fresh.version} by another user.`,
        fresh.version,
        fresh
      );
    }

    // Record audit
    const auditId = 'aud-' + Math.random().toString(36).substring(2, 9);
    this.db.prepare(`
      INSERT INTO audit_trail (
        id, operation_id, actor_id, action_type, diff_before, diff_after, reason, created_at
      ) VALUES (?, ?, ?, 'STATUS_TRANSITION', ?, ?, ?, ?)
    `).run(
      auditId, current.id, actor.id,
      JSON.stringify({ status: current.status }),
      JSON.stringify({ status: targetStatus }),
      params?.reason || `Status progressed from ${current.status} to ${targetStatus}`,
      now
    );

    // If resolving, schedule outbox event
    if (targetStatus === 'RESOLVED') {
      const outboxId = 'out-' + Math.random().toString(36).substring(2, 9);
      this.db.prepare(`
        INSERT INTO outbox_events (
          id, event_name, payload_json, status, attempt_count, max_attempts, scheduled_at, created_at, updated_at
        ) VALUES (?, 'DISPATCH_ALERT', ?, 'PENDING', 0, 5, ?, ?, ?)
      `).run(
        outboxId,
        JSON.stringify({
          operationId: current.id,
          directiveCode: current.directive_code,
          title: current.title,
          message: `Directive ${current.directive_code} has been resolved.`
        }),
        now, now, now
      );
    }

    const updated = this.getOperationById(id).item;
    StreamHub.broadcast('DIRECTIVE_UPDATED', { item: updated, actorId: actor.id });
    return updated;
  }

  /**
   * Process formal signoff approval / rejection with Segregation of Duties and OCC
   */
  recordSignoff(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    notes: string,
    actor: UserWithProfile,
    expectedVersion: number
  ): OperationDirectiveEnriched {
    const current = this.getOperationById(id).item;

    const signoffCheck = WorkflowStateMachine.validateSignoff(current, actor);
    if (!signoffCheck.allowed) {
      throw new ForbiddenError(signoffCheck.reason || 'Not authorized to sign off');
    }

    const now = new Date().toISOString();
    const nextStatus: DirectiveStatus = decision === 'APPROVED' ? 'ACTIVE' : 'TRIAGED';

    const updateStmt = this.db.prepare(`
      UPDATE operations
      SET approval_status = ?,
          approved_by_user_id = ?,
          approval_decision_notes = ?,
          status = ?,
          version = version + 1,
          updated_at = ?
      WHERE id = ? AND version = ?
    `);

    const result = updateStmt.run(
      decision,
      actor.id,
      notes,
      nextStatus,
      now,
      current.id,
      expectedVersion
    );

    if (result.changes === 0) {
      const fresh = this.getOperationById(id).item;
      throw new ConcurrencyConflictError(
        `Conflict detected: Directive ${fresh.directive_code} was modified concurrently (current version: ${fresh.version}).`,
        fresh.version,
        fresh
      );
    }

    const auditId = 'aud-' + Math.random().toString(36).substring(2, 9);
    this.db.prepare(`
      INSERT INTO audit_trail (
        id, operation_id, actor_id, action_type, diff_before, diff_after, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditId, current.id, actor.id,
      decision === 'APPROVED' ? 'SIGNOFF_APPROVED' : 'SIGNOFF_REJECTED',
      JSON.stringify({ approval_status: current.approval_status }),
      JSON.stringify({ approval_status: decision, status: nextStatus }),
      notes ? `Dual-signoff decision: ${decision}. Note: ${notes}` : `Dual-signoff decision: ${decision}`,
      now
    );

    const updated = this.getOperationById(id).item;
    StreamHub.broadcast('DIRECTIVE_UPDATED', { item: updated, actorId: actor.id });
    return updated;
  }

  /**
   * Update details with OCC check
   */
  updateDirectiveDetails(
    id: string,
    updates: {
      title?: string;
      description?: string;
      severity?: SeverityLevel;
      category?: DirectiveCategory;
      assigned_team_id?: string;
      assigned_user_id?: string | null;
      requires_dual_signoff?: boolean;
      metadata?: Record<string, any>;
    },
    actor: UserWithProfile,
    expectedVersion: number
  ): OperationDirectiveEnriched {
    const current = this.getOperationById(id).item;
    const now = new Date().toISOString();

    const title = updates.title ?? current.title;
    const description = updates.description ?? current.description;
    const severity = updates.severity ?? current.severity;
    const category = updates.category ?? current.category;
    const assignedTeamId = updates.assigned_team_id ?? current.assigned_team_id;
    const assignedUserId = updates.assigned_user_id !== undefined ? updates.assigned_user_id : current.assigned_user_id;
    const requiresSignoff = updates.requires_dual_signoff !== undefined
      ? (updates.requires_dual_signoff ? 1 : 0)
      : (current.requires_dual_signoff ? 1 : 0);

    const metaJson = updates.metadata ? JSON.stringify(updates.metadata) : current.metadata_json;

    // Adjust SLA target if severity changed
    const slaTarget = updates.severity && updates.severity !== current.severity
      ? OperationService.computeSlaTarget(updates.severity)
      : current.sla_target_at;

    const updateStmt = this.db.prepare(`
      UPDATE operations
      SET title = ?,
          description = ?,
          severity = ?,
          category = ?,
          assigned_team_id = ?,
          assigned_user_id = ?,
          requires_dual_signoff = ?,
          metadata_json = ?,
          sla_target_at = ?,
          version = version + 1,
          updated_at = ?
      WHERE id = ? AND version = ?
    `);

    const result = updateStmt.run(
      title,
      description,
      severity,
      category,
      assignedTeamId,
      assignedUserId,
      requiresSignoff,
      metaJson,
      slaTarget,
      now,
      current.id,
      expectedVersion
    );

    if (result.changes === 0) {
      const fresh = this.getOperationById(id).item;
      throw new ConcurrencyConflictError(
        `Conflict detected: Directive ${fresh.directive_code} was modified concurrently (current version: ${fresh.version}).`,
        fresh.version,
        fresh
      );
    }

    // Record audit
    const auditId = 'aud-' + Math.random().toString(36).substring(2, 9);
    this.db.prepare(`
      INSERT INTO audit_trail (
        id, operation_id, actor_id, action_type, diff_before, diff_after, reason, created_at
      ) VALUES (?, ?, ?, 'METADATA_UPDATED', ?, ?, 'Directive parameters updated', ?)
    `).run(
      auditId, current.id, actor.id,
      JSON.stringify({ title: current.title, severity: current.severity, assigned_user_id: current.assigned_user_id }),
      JSON.stringify({ title, severity, assigned_user_id: assignedUserId }),
      now
    );

    const updated = this.getOperationById(id).item;
    StreamHub.broadcast('DIRECTIVE_UPDATED', { item: updated, actorId: actor.id });
    return updated;
  }

  /**
   * Add collaboration note
   */
  addNote(
    id: string,
    content: string,
    isConfidential: boolean,
    actor: UserWithProfile
  ): OperationNote {
    if (!content || content.trim().length === 0) {
      throw new ValidationError('Note content cannot be empty');
    }

    const current = this.getOperationById(id).item;
    const noteId = 'not-' + Math.random().toString(36).substring(2, 10);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO operation_notes (id, operation_id, author_id, content, is_confidential, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(noteId, current.id, actor.id, content.trim(), isConfidential ? 1 : 0, now);

    // Audit
    const auditId = 'aud-' + Math.random().toString(36).substring(2, 9);
    this.db.prepare(`
      INSERT INTO audit_trail (id, operation_id, actor_id, action_type, reason, created_at)
      VALUES (?, ?, ?, 'NOTE_RECORDED', ?, ?)
    `).run(auditId, current.id, actor.id, `Recorded operational note: "${content.substring(0, 45)}..."`, now);

    const newNote: OperationNote = {
      id: noteId,
      operation_id: current.id,
      author_id: actor.id,
      author_name: actor.name,
      author_avatar: actor.avatar_url,
      content: content.trim(),
      is_confidential: isConfidential,
      created_at: now
    };

    StreamHub.broadcast('NOTE_ADDED', { operationId: current.id, note: newNote });
    return newNote;
  }
}
