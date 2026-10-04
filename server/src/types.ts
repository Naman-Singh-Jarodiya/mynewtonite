export type UserRole = 'ADMIN' | 'LEAD' | 'OPERATOR' | 'APPROVER' | 'AUDITOR';

export type DirectiveCategory = 
  | 'SYSTEM_INCIDENT' 
  | 'FINANCIAL_TX' 
  | 'CUSTOMER_ESCALATION' 
  | 'SECURITY_COMPLIANCE' 
  | 'INFRA_MAINTENANCE' 
  | 'DATA_PIPELINE';

export type SeverityLevel = 'SEV1_CRITICAL' | 'SEV2_HIGH' | 'SEV3_MEDIUM' | 'SEV4_LOW';

export type DirectiveStatus = 
  | 'INTAKE' 
  | 'TRIAGED' 
  | 'ACTIVE' 
  | 'AWAITING_APPROVAL' 
  | 'RESOLVED' 
  | 'CLOSED_ABORTED';

export type SignoffDecision = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NOT_REQUIRED';

export interface User {
  id: string;
  name: string;
  email: string;
  role_title: string;
  avatar_url?: string;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  code: string;
  description: string;
  created_at: string;
}

export interface TeamMembership {
  id: string;
  user_id: string;
  team_id: string;
  role: UserRole;
  created_at: string;
}

export interface UserWithProfile extends User {
  memberships: {
    team_id: string;
    team_name: string;
    team_code: string;
    role: UserRole;
  }[];
  is_admin: boolean;
}

export interface OperationDirective {
  id: string;
  directive_code: string; // e.g. NEWTON-1001
  title: string;
  description: string;
  category: DirectiveCategory;
  severity: SeverityLevel;
  status: DirectiveStatus;
  assigned_team_id: string;
  assigned_user_id: string | null;
  created_by_user_id: string;
  requires_dual_signoff: boolean;
  approval_status: SignoffDecision;
  approval_requested_at: string | null;
  approved_by_user_id: string | null;
  approval_decision_notes: string | null;
  resolution_notes: string | null;
  root_cause_category: string | null;
  sla_target_at: string;
  sla_breached: boolean;
  version: number; // Monotonic counter for Optimistic Concurrency Control (OCC)
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

export interface OperationDirectiveEnriched extends OperationDirective {
  assigned_team_name?: string;
  assigned_team_code?: string;
  assigned_user_name?: string;
  created_by_user_name?: string;
  approved_by_user_name?: string;
  parsed_metadata?: Record<string, any>;
  notes_count?: number;
}

export interface AuditEntry {
  id: string;
  operation_id: string;
  actor_id: string | null;
  actor_name?: string;
  action_type: 
    | 'CREATED'
    | 'STATUS_TRANSITION'
    | 'OWNERSHIP_CLAIMED'
    | 'REASSIGNED'
    | 'SEVERITY_UPDATED'
    | 'SIGNOFF_REQUESTED'
    | 'SIGNOFF_APPROVED'
    | 'SIGNOFF_REJECTED'
    | 'RESOLVED'
    | 'CLOSED_ABORTED'
    | 'NOTE_RECORDED'
    | 'METADATA_UPDATED'
    | 'SLA_VIOLATION_RECORDED';
  diff_before: string | null; // JSON string
  diff_after: string | null;  // JSON string
  reason: string | null;
  created_at: string;
}

export interface OperationNote {
  id: string;
  operation_id: string;
  author_id: string;
  author_name?: string;
  author_avatar?: string;
  content: string;
  is_confidential: boolean;
  created_at: string;
}

export interface IdempotencyEntry {
  idempotency_key: string;
  actor_id: string;
  endpoint: string;
  request_hash: string;
  state: 'IN_FLIGHT' | 'PROCESSED' | 'FAILED';
  status_code: number | null;
  response_payload: string | null;
  created_at: string;
  expires_at: string;
}

export interface OutboxEvent {
  id: string;
  event_name: 'DISPATCH_ALERT' | 'EVALUATE_SLA' | 'ENRICH_AUDIT' | 'WEBHOOK_OUTBOUND';
  payload_json: string;
  status: 'PENDING' | 'IN_FLIGHT' | 'PROCESSED' | 'FAILED' | 'DEAD_LETTER';
  attempt_count: number;
  max_attempts: number;
  error_details: string | null;
  scheduled_at: string;
  created_at: string;
  updated_at: string;
}

export interface DirectiveQueryFilter {
  query?: string;
  team_id?: string;
  user_id?: string;
  status?: DirectiveStatus | DirectiveStatus[];
  category?: DirectiveCategory;
  severity?: SeverityLevel;
  unassigned?: boolean;
  pending_signoff?: boolean;
  sla_breached?: boolean;
  page?: number;
  page_size?: number;
  order_by?: 'created_at' | 'updated_at' | 'severity' | 'sla_target_at' | 'directive_code';
  order_direction?: 'asc' | 'desc';
}

export interface PagedResponse<T> {
  items: T[];
  metadata: {
    total_records: number;
    current_page: number;
    page_size: number;
    total_pages: number;
  };
}
