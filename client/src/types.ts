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

export interface UserWithProfile {
  id: string;
  name: string;
  email: string;
  role_title: string;
  avatar_url?: string;
  memberships: {
    team_id: string;
    team_name: string;
    team_code: string;
    role: UserRole;
  }[];
  is_admin: boolean;
}

export interface TeamWithMembers {
  id: string;
  name: string;
  code: string;
  description: string;
  members: {
    id: string;
    user_id: string;
    role: UserRole;
    user_name: string;
    user_email: string;
    role_title: string;
  }[];
}

export interface OperationDirectiveEnriched {
  id: string;
  directive_code: string;
  title: string;
  description: string;
  category: DirectiveCategory;
  severity: SeverityLevel;
  status: DirectiveStatus;
  assigned_team_id: string;
  assigned_team_name?: string;
  assigned_team_code?: string;
  assigned_user_id: string | null;
  assigned_user_name?: string;
  created_by_user_id: string;
  created_by_user_name?: string;
  requires_dual_signoff: boolean;
  approval_status: SignoffDecision;
  approval_requested_at: string | null;
  approved_by_user_id: string | null;
  approved_by_user_name?: string;
  approval_decision_notes: string | null;
  resolution_notes: string | null;
  root_cause_category: string | null;
  sla_target_at: string;
  sla_breached: boolean;
  version: number;
  metadata_json: string;
  parsed_metadata?: Record<string, any>;
  notes_count?: number;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id: string;
  operation_id: string;
  actor_id: string | null;
  actor_name?: string;
  action_type: string;
  diff_before: string | null;
  diff_after: string | null;
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

export interface OutboxEventRecord {
  id: string;
  event_name: string;
  payload_json: string;
  status: 'PENDING' | 'IN_FLIGHT' | 'PROCESSED' | 'FAILED' | 'DEAD_LETTER';
  attempt_count: number;
  max_attempts: number;
  error_details: string | null;
  scheduled_at: string;
  created_at: string;
  updated_at: string;
}

export interface OutboxQueueStats {
  total: number;
  pending: number;
  in_flight: number;
  processed: number;
  failed: number;
  dead_letter: number;
}
