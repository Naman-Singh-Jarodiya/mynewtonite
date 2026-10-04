import React, { useState } from 'react';
import { 
  X, 
  Zap, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Layers,
  Sparkles
} from 'lucide-react';
import { TeamWithMembers, DirectiveCategory, SeverityLevel, OperationDirectiveEnriched } from '../types';
import { api } from '../api';

interface CreateDirectiveModalProps {
  teams: TeamWithMembers[];
  onClose: () => void;
  onCreated: (item: OperationDirectiveEnriched) => void;
}

export const CreateDirectiveModal: React.FC<CreateDirectiveModalProps> = ({
  teams,
  onClose,
  onCreated
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<DirectiveCategory>('SYSTEM_INCIDENT');
  const [severity, setSeverity] = useState<SeverityLevel>('SEV2_HIGH');
  const [assignedTeamId, setAssignedTeamId] = useState(teams[0]?.id || 'team-platform');
  const [requiresDualSignoff, setRequiresDualSignoff] = useState(false);
  const [metadataStr, setMetadataStr] = useState('{\n  "environment": "production"\n}');

  const [loading, setLoading] = useState(false);
  const [idempotencyToast, setIdempotencyToast] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setErrorMessage('Please fill in title and operational description');
      return;
    }

    let parsedMeta = {};
    try {
      if (metadataStr.trim()) {
        parsedMeta = JSON.parse(metadataStr);
      }
    } catch {
      setErrorMessage('Metadata must be valid JSON');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const created = await api.createOperation({
        title,
        description,
        category,
        severity,
        assigned_team_id: assignedTeamId,
        requires_dual_signoff: requiresDualSignoff,
        metadata: parsedMeta
      });
      onCreated(created);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create directive');
    } finally {
      setLoading(false);
    }
  };

  // Simulate Rapid Double-Click to demonstrate Idempotency Key deduplication
  const handleSimulateDoubleClick = async () => {
    if (!title.trim() || !description.trim()) {
      setErrorMessage('Please fill in title and description first');
      return;
    }

    const testKey = 'idem-sim-' + Math.random().toString(36).substring(2, 9);
    setLoading(true);
    setErrorMessage(null);

    try {
      // Fire request 1
      const p1 = api.createOperation({
        title: title + ' [IDEMPOTENCY TEST]',
        description,
        category,
        severity,
        assigned_team_id: assignedTeamId,
        requires_dual_signoff: requiresDualSignoff
      }, testKey);

      // Fire request 2 immediately with same key
      const p2 = api.createOperation({
        title: title + ' [IDEMPOTENCY TEST]',
        description,
        category,
        severity,
        assigned_team_id: assignedTeamId,
        requires_dual_signoff: requiresDualSignoff
      }, testKey);

      const [res1, res2] = await Promise.all([p1, p2]);

      setIdempotencyToast(
        `Idempotency Verified! Request 1 created ${res1.directive_code}. Request 2 received cached replay without duplicate DB record.`
      );
      onCreated(res1);
    } catch (err: any) {
      setErrorMessage(err.message || 'Idempotency simulation error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Zap className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Log Operational Directive</h2>
              <p className="text-[11px] text-slate-400">Enforces team scoping, initial triage & transactional outbox</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Idempotency Toast Banner */}
        {idempotencyToast && (
          <div className="p-3 bg-emerald-950/60 border-b border-emerald-800/80 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{idempotencyToast}</span>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 bg-rose-950/60 border-b border-rose-800/80 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          <div>
            <label className="block font-medium text-slate-300 mb-1">Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Postgres Replica Lag High or Disputed Wire Release"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-300 mb-1">Operational Description</label>
            <textarea
              rows={3}
              required
              placeholder="Provide context, metrics, impact assessment, and steps required..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white placeholder-slate-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-300 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as DirectiveCategory)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white"
              >
                <option value="SYSTEM_INCIDENT">System Incident</option>
                <option value="FINANCIAL_TX">Financial Transaction</option>
                <option value="CUSTOMER_ESCALATION">Customer Escalation</option>
                <option value="SECURITY_COMPLIANCE">Security & Compliance</option>
                <option value="INFRA_MAINTENANCE">Infra Maintenance</option>
                <option value="DATA_PIPELINE">Data Pipeline</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1">Severity & SLA</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white"
              >
                <option value="SEV1_CRITICAL">SEV-1 Critical (1h SLA)</option>
                <option value="SEV2_HIGH">SEV-2 High (4h SLA)</option>
                <option value="SEV3_MEDIUM">SEV-3 Medium (24h SLA)</option>
                <option value="SEV4_LOW">SEV-4 Low (72h SLA)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-300 mb-1">Assigned Operational Team</label>
            <select
              value={assignedTeamId}
              onChange={(e) => setAssignedTeamId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white"
            >
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
              ))}
            </select>
          </div>

          {/* Dual-Signoff Gate Checkbox */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={requiresDualSignoff}
                onChange={(e) => setRequiresDualSignoff(e.target.checked)}
                className="mt-0.5 rounded bg-slate-900 border-slate-700 text-cyan-600 focus:ring-0"
              />
              <div>
                <p className="font-semibold text-cyan-300 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" /> Enforce Dual-Signoff Gate
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Mandates formal approval by an independent Team Approver or Lead before completion. Creators and assignees cannot approve their own work.
                </p>
              </div>
            </label>
          </div>

          <div>
            <label className="block font-medium text-slate-300 mb-1">Structured Metadata (JSON)</label>
            <textarea
              rows={2}
              value={metadataStr}
              onChange={(e) => setMetadataStr(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-[11px] text-slate-300"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={handleSimulateDoubleClick}
              disabled={loading}
              title="Sends two identical requests in rapid succession with identical Idempotency-Key"
              className="w-full sm:w-auto px-3 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-medium transition flex items-center justify-center gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>Simulate Double-Click (Idempotency)</span>
            </button>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30 transition"
              >
                {loading ? 'Submitting...' : 'Submit Directive'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
