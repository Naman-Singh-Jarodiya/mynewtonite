import React, { useState, useEffect } from 'react';
import { 
  X, 
  Clock, 
  ShieldCheck, 
  ShieldAlert, 
  UserCheck, 
  History, 
  MessageSquare, 
  AlertTriangle, 
  Send, 
  CheckCircle2, 
  Flame, 
  FileText, 
  Layers, 
  Lock,
  Eye,
  RefreshCw
} from 'lucide-react';
import { 
  OperationDirectiveEnriched, 
  AuditEntry, 
  OperationNote, 
  UserWithProfile, 
  DirectiveStatus, 
  SeverityLevel 
} from '../types';
import { api, ApiConflictError, ApiError } from '../api';

interface DirectiveDrawerProps {
  directiveId: string;
  currentActor: UserWithProfile;
  onClose: () => void;
  onDirectiveUpdated: (updated: OperationDirectiveEnriched) => void;
  onConflictDetected: (error: ApiConflictError) => void;
}

export const DirectiveDrawer: React.FC<DirectiveDrawerProps> = ({
  directiveId,
  currentActor,
  onClose,
  onDirectiveUpdated,
  onConflictDetected
}) => {
  const [data, setData] = useState<{
    item: OperationDirectiveEnriched;
    auditTrail: AuditEntry[];
    notes: OperationNote[];
    viewers: { userId: string; userName: string }[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tab: 'audit' or 'notes'
  const [activeTab, setActiveTab] = useState<'audit' | 'notes'>('audit');

  // New Note state
  const [noteContent, setNoteContent] = useState('');
  const [isConfidentialNote, setIsConfidentialNote] = useState(false);

  // Resolution Modal Prompt state
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [rootCause, setRootCause] = useState('CODE_DEFECT');

  // Signoff note state
  const [signoffNotes, setSignoffNotes] = useState('');

  // Fetch full details
  const loadDetails = async () => {
    try {
      setLoading(true);
      const res = await api.getOperation(directiveId);
      setData(res);
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load directive details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();

    // Send active presence heartbeat every 15s
    api.sendPresence(directiveId).catch(() => {});
    const heartbeatInterval = setInterval(() => {
      api.sendPresence(directiveId).catch(() => {});
    }, 15000);

    return () => clearInterval(heartbeatInterval);
  }, [directiveId]);

  if (loading || !data) {
    return (
      <div className="fixed inset-y-0 right-0 w-full sm:w-[580px] lg:w-[680px] bg-slate-900 border-l border-slate-800 shadow-2xl z-50 p-6 flex flex-col justify-center items-center">
        <RefreshCw className="h-8 w-8 text-indigo-500 animate-spin mb-3" />
        <p className="text-sm text-slate-400">Loading operational directive context...</p>
      </div>
    );
  }

  const { item, auditTrail, notes, viewers } = data;

  // Segregation of Duties evaluation
  const isCreator = item.created_by_user_id === currentActor.id;
  const isAssignee = item.assigned_user_id === currentActor.id;
  const isTeamMember = currentActor.memberships.some(m => m.team_id === item.assigned_team_id);
  const teamRole = currentActor.memberships.find(m => m.team_id === item.assigned_team_id)?.role;
  const isApproverOrLead = currentActor.is_admin || teamRole === 'APPROVER' || teamRole === 'LEAD';
  const hasSelfApprovalConflict = !currentActor.is_admin && (isCreator || isAssignee);

  // 1. Claim Responsibility
  const handleClaim = async () => {
    try {
      setActionLoading(true);
      setErrorMessage(null);
      const updated = await api.claimOperation(item.id, item.version);
      onDirectiveUpdated(updated);
      await loadDetails();
    } catch (err: any) {
      if (err instanceof ApiConflictError) {
        onConflictDetected(err);
      } else {
        setErrorMessage(err.message || 'Failed to claim directive');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // 2. Transition Status
  const handleTransition = async (targetStatus: DirectiveStatus) => {
    if (targetStatus === 'RESOLVED') {
      setShowResolveDialog(true);
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);
      const updated = await api.transitionStatus(item.id, targetStatus, item.version);
      onDirectiveUpdated(updated);
      await loadDetails();
    } catch (err: any) {
      if (err instanceof ApiConflictError) {
        onConflictDetected(err);
      } else {
        setErrorMessage(err.message || 'Transition blocked by state machine rules');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // 3. Confirm Resolution
  const confirmResolution = async () => {
    if (!resolutionNotes || resolutionNotes.trim().length < 5) {
      setErrorMessage('Resolution requires a detailed explanation (minimum 5 characters)');
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);
      const updated = await api.transitionStatus(item.id, 'RESOLVED', item.version, {
        resolution_notes: resolutionNotes,
        root_cause_category: rootCause
      });
      setShowResolveDialog(false);
      onDirectiveUpdated(updated);
      await loadDetails();
    } catch (err: any) {
      if (err instanceof ApiConflictError) {
        onConflictDetected(err);
      } else {
        setErrorMessage(err.message || 'Resolution validation error');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // 4. Record Dual-Signoff
  const handleSignoffDecision = async (decision: 'APPROVED' | 'REJECTED') => {
    try {
      setActionLoading(true);
      setErrorMessage(null);
      const updated = await api.recordSignoff(item.id, decision, signoffNotes, item.version);
      setSignoffNotes('');
      onDirectiveUpdated(updated);
      await loadDetails();
    } catch (err: any) {
      if (err instanceof ApiConflictError) {
        onConflictDetected(err);
      } else {
        setErrorMessage(err.message || 'Signoff processing error');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // 5. Submit Note
  const handleSubmitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;

    try {
      setActionLoading(true);
      await api.addNote(item.id, noteContent.trim(), isConfidentialNote);
      setNoteContent('');
      await loadDetails();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit note');
    } finally {
      setActionLoading(false);
    }
  };

  // 6. Update Severity with OCC
  const handleSeverityChange = async (newSev: SeverityLevel) => {
    try {
      setActionLoading(true);
      setErrorMessage(null);
      const updated = await api.patchDetails(item.id, { severity: newSev }, item.version);
      onDirectiveUpdated(updated);
      await loadDetails();
    } catch (err: any) {
      if (err instanceof ApiConflictError) {
        onConflictDetected(err);
      } else {
        setErrorMessage(err.message || 'Failed to update severity');
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[600px] lg:w-[720px] bg-slate-900 border-l border-slate-800 shadow-2xl z-50 flex flex-col">
      {/* Drawer Header */}
      <div className="p-5 border-b border-slate-800 bg-slate-950/70 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-mono text-base font-bold text-indigo-400">{item.directive_code}</span>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
              OCC v{item.version}
            </span>
            {item.requires_dual_signoff && (
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                Dual-Signoff Required
              </span>
            )}
          </div>
          <h2 className="text-base font-bold text-white leading-snug">{item.title}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Realtime Active Viewers Bar */}
      {viewers.length > 0 && (
        <div className="bg-indigo-950/40 border-b border-indigo-900/40 px-5 py-2 flex items-center gap-2 text-xs text-indigo-300">
          <Eye className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
          <span className="font-medium">Active viewers:</span>
          <span className="text-indigo-200">
            {viewers.map(v => v.userName).join(', ')}
          </span>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="bg-rose-950/60 border-b border-rose-800/80 px-5 py-2.5 flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-200">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Drawer Body (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Core Attributes Card */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {/* Status */}
            <div>
              <p className="text-slate-500 font-medium mb-1">Current Status</p>
              <span className="inline-block px-2.5 py-1 rounded font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20">
                {item.status}
              </span>
            </div>

            {/* Severity Switcher */}
            <div>
              <p className="text-slate-500 font-medium mb-1">Severity (OCC)</p>
              <select
                value={item.severity}
                onChange={(e) => handleSeverityChange(e.target.value as SeverityLevel)}
                disabled={actionLoading}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
              >
                <option value="SEV1_CRITICAL">SEV1 — Critical</option>
                <option value="SEV2_HIGH">SEV2 — High</option>
                <option value="SEV3_MEDIUM">SEV3 — Medium</option>
                <option value="SEV4_LOW">SEV4 — Low</option>
              </select>
            </div>

            {/* Assigned Team */}
            <div>
              <p className="text-slate-500 font-medium mb-1">Assigned Team</p>
              <p className="font-semibold text-slate-200">{item.assigned_team_name}</p>
            </div>

            {/* Owner / Assignee */}
            <div>
              <p className="text-slate-500 font-medium mb-1">Assigned Owner</p>
              {item.assigned_user_name ? (
                <p className="font-semibold text-emerald-300">{item.assigned_user_name}</p>
              ) : (
                <button
                  onClick={handleClaim}
                  disabled={actionLoading}
                  className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[11px] transition inline-flex items-center gap-1 shadow"
                >
                  <UserCheck className="h-3 w-3" />
                  <span>Claim Now</span>
                </button>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="pt-3 border-t border-slate-800/80">
            <p className="text-xs font-medium text-slate-400 mb-1">Operational Description</p>
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/80 p-3 rounded-lg border border-slate-800">
              {item.description}
            </p>
          </div>

          {/* SLA Target Info */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              SLA Deadline: {new Date(item.sla_target_at).toLocaleString()}
            </span>
            {item.sla_breached ? (
              <span className="font-bold text-rose-400 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> SLA Breached
              </span>
            ) : (
              <span className="text-emerald-400 font-medium">Within SLA Target</span>
            )}
          </div>
        </div>

        {/* Dual-Signoff Authorization Card */}
        {item.requires_dual_signoff && (
          <div className="bg-slate-950/80 border border-cyan-900/50 rounded-xl p-4 shadow-lg">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-cyan-900/30">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-cyan-400" />
                <h3 className="text-xs font-bold text-cyan-200 uppercase tracking-wider">
                  Dual-Signoff Gate
                </h3>
              </div>
              <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                item.approval_status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-300' :
                item.approval_status === 'REJECTED' ? 'bg-rose-500/20 text-rose-300' :
                'bg-amber-500/20 text-amber-300 animate-pulse'
              }`}>
                {item.approval_status}
              </span>
            </div>

            {/* Segregation of Duties Warning */}
            {hasSelfApprovalConflict && (
              <div className="bg-amber-950/40 border border-amber-800/50 rounded-lg p-3 text-xs text-amber-300 mb-3 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Segregation of Duties Enforced</p>
                  <p className="text-amber-300/80 mt-0.5 text-[11px]">
                    As the creator or assigned owner of this directive, you are structurally prohibited from approving your own request.
                    An independent Team Approver, Lead, or Global Admin must grant signoff.
                  </p>
                </div>
              </div>
            )}

            {/* Approval Info / Action Box */}
            {item.approval_status === 'APPROVED' ? (
              <div className="text-xs text-slate-300 space-y-1">
                <p>Approved by: <span className="font-semibold text-emerald-300">{item.approved_by_user_name}</span></p>
                {item.approval_decision_notes && <p className="italic text-slate-400">"{item.approval_decision_notes}"</p>}
              </div>
            ) : item.status === 'AWAITING_APPROVAL' && isApproverOrLead && !hasSelfApprovalConflict ? (
              <div className="space-y-3 pt-1">
                <input
                  type="text"
                  placeholder="Enter signoff verification notes..."
                  value={signoffNotes}
                  onChange={(e) => setSignoffNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSignoffDecision('APPROVED')}
                    disabled={actionLoading}
                    className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition"
                  >
                    Grant Approval
                  </button>
                  <button
                    onClick={() => handleSignoffDecision('REJECTED')}
                    disabled={actionLoading}
                    className="px-4 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white font-medium text-xs transition"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : item.status === 'AWAITING_APPROVAL' ? (
              <p className="text-xs text-slate-400 italic">
                Awaiting signoff by an authorized member of {item.assigned_team_name}.
              </p>
            ) : null}
          </div>
        )}

        {/* State Machine Transition Actions */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
            Workflow Progression (State Machine Protected)
          </p>
          <div className="flex flex-wrap gap-2">
            {item.status === 'INTAKE' && (
              <button
                onClick={() => handleTransition('TRIAGED')}
                disabled={actionLoading}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition"
              >
                Mark as Triaged
              </button>
            )}

            {item.status === 'TRIAGED' && (
              <button
                onClick={() => handleTransition('ACTIVE')}
                disabled={actionLoading}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition"
              >
                Begin Active Work
              </button>
            )}

            {item.status === 'ACTIVE' && item.requires_dual_signoff && item.approval_status !== 'APPROVED' && (
              <button
                onClick={() => handleTransition('AWAITING_APPROVAL')}
                disabled={actionLoading}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition flex items-center gap-1.5"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Submit for Dual-Signoff
              </button>
            )}

            {(item.status === 'ACTIVE' || (item.status === 'AWAITING_APPROVAL' && item.approval_status === 'APPROVED')) && (
              <button
                onClick={() => handleTransition('RESOLVED')}
                disabled={actionLoading}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Complete & Resolve
              </button>
            )}

            {!['RESOLVED', 'CLOSED_ABORTED'].includes(item.status) && (
              <button
                onClick={() => handleTransition('CLOSED_ABORTED')}
                disabled={actionLoading}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition ml-auto"
              >
                Abort / Cancel
              </button>
            )}

            {(item.status === 'RESOLVED' || item.status === 'CLOSED_ABORTED') && (
              <button
                onClick={() => handleTransition('ACTIVE')}
                disabled={actionLoading}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition"
              >
                Reopen Directive
              </button>
            )}
          </div>
        </div>

        {/* Tabs: Immutable Audit Trail vs Collaboration Notes */}
        <div>
          <div className="flex border-b border-slate-800 mb-4">
            <button
              onClick={() => setActiveTab('audit')}
              className={`pb-2.5 px-4 text-xs font-semibold uppercase tracking-wider transition border-b-2 flex items-center gap-1.5 ${
                activeTab === 'audit'
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Immutable Audit Trail ({auditTrail.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`pb-2.5 px-4 text-xs font-semibold uppercase tracking-wider transition border-b-2 flex items-center gap-1.5 ${
                activeTab === 'notes'
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Operational Notes ({notes.length})</span>
            </button>
          </div>

          {/* Audit Trail List */}
          {activeTab === 'audit' && (
            <div className="space-y-3">
              {auditTrail.map((ev) => (
                <div key={ev.id} className="bg-slate-950/40 border border-slate-800/80 rounded-lg p-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-indigo-300">{ev.actor_name || 'System Daemon'}</span>
                    <span className="text-[10px] text-slate-500">{new Date(ev.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300">
                      {ev.action_type}
                    </span>
                    {ev.reason && <span className="text-slate-400 italic">"{ev.reason}"</span>}
                  </div>
                  {ev.diff_after && (
                    <div className="mt-2 text-[10px] font-mono bg-slate-900 p-2 rounded text-slate-400 overflow-x-auto">
                      {ev.diff_after}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Discussion Notes */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div className="space-y-3">
                {notes.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No collaboration notes recorded yet.</p>
                ) : (
                  notes.map((n) => (
                    <div key={n.id} className="bg-slate-950/40 border border-slate-800/80 rounded-lg p-3 text-xs">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200">{n.author_name}</span>
                          {n.is_confidential && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-0.5">
                              <Lock className="h-2.5 w-2.5" /> Confidential
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500">{new Date(n.created_at).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed">{n.content}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Note input form */}
              <form onSubmit={handleSubmitNote} className="space-y-2 pt-2">
                <textarea
                  rows={2}
                  placeholder="Record an operational investigation note..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-indigo-500"
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isConfidentialNote}
                      onChange={(e) => setIsConfidentialNote(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0"
                    />
                    <span>Mark as Confidential / Internal-Only</span>
                  </label>
                  <button
                    type="submit"
                    disabled={actionLoading || !noteContent.trim()}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium transition flex items-center gap-1"
                  >
                    <Send className="h-3 w-3" />
                    <span>Post Note</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Resolution Confirmation Modal */}
      {showResolveDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-60">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-md w-full shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Complete Directive Resolution
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Operational policy mandates documentation of the resolution summary and root-cause classification before closing.
            </p>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Root Cause Category
                </label>
                <select
                  value={rootCause}
                  onChange={(e) => setRootCause(e.target.value)}
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="CODE_DEFECT">Code Defect / Regression</option>
                  <option value="INFRA_OUTAGE">Cloud Infrastructure Outage</option>
                  <option value="THIRD_PARTY_API">Third-Party Gateway API Timeout</option>
                  <option value="HUMAN_ERROR">Operational Procedure Oversight</option>
                  <option value="SECURITY_VIOLATION">Security Policy Violation</option>
                  <option value="ROUTINE_AUDIT_PASS">Routine Audit Complete</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Resolution Summary (min 5 characters)
                </label>
                <textarea
                  rows={3}
                  placeholder="Detail the technical resolution and preventive actions..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder-slate-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowResolveDialog(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmResolution}
                disabled={actionLoading}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow"
              >
                Confirm Resolution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
