import { OperationDirective, DirectiveStatus, UserWithProfile } from '../types.js';

export interface WorkflowTransitionCheck {
  allowed: boolean;
  reason?: string;
}

const ALLOWED_GRAPH: Record<DirectiveStatus, DirectiveStatus[]> = {
  INTAKE: ['TRIAGED', 'CLOSED_ABORTED'],
  TRIAGED: ['ACTIVE', 'INTAKE', 'CLOSED_ABORTED'],
  ACTIVE: ['AWAITING_APPROVAL', 'RESOLVED', 'TRIAGED', 'CLOSED_ABORTED'],
  AWAITING_APPROVAL: ['ACTIVE', 'RESOLVED', 'CLOSED_ABORTED'],
  RESOLVED: ['ACTIVE', 'CLOSED_ABORTED'],
  CLOSED_ABORTED: ['INTAKE']
};

export class WorkflowStateMachine {
  /**
   * Enforces transition graph rules, authorization, and resolution completeness
   */
  static validateTransition(
    item: OperationDirective,
    targetStatus: DirectiveStatus,
    actor: UserWithProfile,
    resolutionData?: { resolution_notes?: string; root_cause_category?: string }
  ): WorkflowTransitionCheck {
    // 1. Graph edge check
    const allowedTargets = ALLOWED_GRAPH[item.status] || [];
    if (!allowedTargets.includes(targetStatus)) {
      return {
        allowed: false,
        reason: `Invalid transition path: Cannot move directive from '${item.status}' to '${targetStatus}'. Permitted targets: ${allowedTargets.join(', ')}`
      };
    }

    // 2. Dual-Signoff Gate Check:
    // If directive requires dual signoff, it CANNOT be directly resolved unless approval is granted
    if (targetStatus === 'RESOLVED' && item.requires_dual_signoff) {
      if (item.status !== 'AWAITING_APPROVAL' && item.approval_status !== 'APPROVED') {
        return {
          allowed: false,
          reason: `Dual-Signoff Required: This directive requires formal authorization. Transition to AWAITING_APPROVAL before resolving.`
        };
      }
      if (item.approval_status !== 'APPROVED') {
        return {
          allowed: false,
          reason: `Dual-Signoff Required: Directive is pending signoff. An authorized Team Approver or Lead must approve before resolution.`
        };
      }
    }

    // 3. Resolution completeness check
    if (targetStatus === 'RESOLVED') {
      const notes = resolutionData?.resolution_notes || item.resolution_notes;
      if (!notes || notes.trim().length < 5) {
        return {
          allowed: false,
          reason: `Resolution notes required: Please document the resolution steps (minimum 5 characters).`
        };
      }
    }

    // 4. Role & Team Membership authorization
    const isTeamMember = actor.memberships.some(m => m.team_id === item.assigned_team_id);
    const isTeamLeadOrAdmin = actor.is_admin || actor.memberships.some(m => m.team_id === item.assigned_team_id && m.role === 'LEAD');

    if (!actor.is_admin && !isTeamMember) {
      return {
        allowed: false,
        reason: `Permission denied: Actor is not a member of assigned team (${item.assigned_team_id}).`
      };
    }

    // Reopening resolved or closed items requires Lead or Admin privileges
    if ((item.status === 'RESOLVED' || item.status === 'CLOSED_ABORTED') && !isTeamLeadOrAdmin) {
      return {
        allowed: false,
        reason: `Reopening closed or resolved directives requires Team Lead or Admin credentials.`
      };
    }

    return { allowed: true };
  }

  /**
   * Enforces Segregation of Duties and Role Verification for Approvals
   */
  static validateSignoff(
    item: OperationDirective,
    actor: UserWithProfile
  ): WorkflowTransitionCheck {
    if (item.status !== 'AWAITING_APPROVAL') {
      return {
        allowed: false,
        reason: `Directive is currently in '${item.status}' state, not awaiting signoff.`
      };
    }

    const teamRole = actor.memberships.find(m => m.team_id === item.assigned_team_id)?.role;
    const isAuthorizedApprover = actor.is_admin || teamRole === 'APPROVER' || teamRole === 'LEAD';

    if (!isAuthorizedApprover) {
      return {
        allowed: false,
        reason: `Unauthorized: User lacks signoff authority for team ${item.assigned_team_id}. Requires APPROVER, LEAD, or ADMIN role.`
      };
    }

    // Segregation of Duties Rule:
    // The creator or assigned owner of an item is strictly prohibited from approving their own request!
    if (!actor.is_admin) {
      if (item.created_by_user_id === actor.id) {
        return {
          allowed: false,
          reason: `Segregation of Duties Violation: You cannot approve a directive that you created.`
        };
      }
      if (item.assigned_user_id === actor.id) {
        return {
          allowed: false,
          reason: `Segregation of Duties Violation: You cannot sign off on work assigned to yourself.`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Enforces Ownership Claim rules
   */
  static validateClaim(
    item: OperationDirective,
    actor: UserWithProfile
  ): WorkflowTransitionCheck {
    const isTeamMember = actor.memberships.some(m => m.team_id === item.assigned_team_id);
    const isLeadOrAdmin = actor.is_admin || actor.memberships.some(m => m.team_id === item.assigned_team_id && m.role === 'LEAD');

    if (!actor.is_admin && !isTeamMember) {
      return {
        allowed: false,
        reason: `Cannot claim directive: Actor is not a member of assigned team.`
      };
    }

    if (item.assigned_user_id && item.assigned_user_id !== actor.id && !isLeadOrAdmin) {
      return {
        allowed: false,
        reason: `Directive is already claimed by another team member. Reassignment requires Team Lead or Admin role.`
      };
    }

    return { allowed: true };
  }
}
