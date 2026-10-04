import React from 'react';
import { 
  AlertTriangle, 
  Clock, 
  ShieldCheck, 
  Inbox, 
  Flame 
} from 'lucide-react';
import { OperationDirectiveEnriched } from '../types';

interface MetricsOverviewProps {
  directives: OperationDirectiveEnriched[];
  totalRecords: number;
  onFilterChange: (filters: { status?: any; severity?: any; pending_signoff?: boolean; unassigned?: boolean; sla_breached?: boolean }) => void;
}

export const MetricsOverview: React.FC<MetricsOverviewProps> = ({
  directives,
  totalRecords,
  onFilterChange
}) => {
  const activeCount = directives.filter(d => !['RESOLVED', 'CLOSED_ABORTED'].includes(d.status)).length;
  const sev1Count = directives.filter(d => d.severity === 'SEV1_CRITICAL' && !['RESOLVED', 'CLOSED_ABORTED'].includes(d.status)).length;
  const breachedCount = directives.filter(d => d.sla_breached && !['RESOLVED', 'CLOSED_ABORTED'].includes(d.status)).length;
  const signoffCount = directives.filter(d => d.requires_dual_signoff && d.approval_status === 'PENDING').length;
  const unassignedCount = directives.filter(d => !d.assigned_user_id && !['RESOLVED', 'CLOSED_ABORTED'].includes(d.status)).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {/* Active Workload */}
      <button
        onClick={() => onFilterChange({ status: ['INTAKE', 'TRIAGED', 'ACTIVE', 'AWAITING_APPROVAL'] })}
        className="bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 p-3.5 rounded-xl text-left transition flex items-center justify-between group"
      >
        <div>
          <p className="text-xs font-medium text-slate-400">Active Workload</p>
          <p className="text-2xl font-bold text-white tracking-tight mt-0.5">{activeCount}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Across all teams</p>
        </div>
        <div className="h-9 w-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition">
          <Inbox className="h-4.5 w-4.5" />
        </div>
      </button>

      {/* SEV1 Critical */}
      <button
        onClick={() => onFilterChange({ severity: 'SEV1_CRITICAL' })}
        className="bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 p-3.5 rounded-xl text-left transition flex items-center justify-between group"
      >
        <div>
          <p className="text-xs font-medium text-rose-400">SEV1 Incidents</p>
          <p className="text-2xl font-bold text-rose-300 tracking-tight mt-0.5">{sev1Count}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Immediate attention</p>
        </div>
        <div className="h-9 w-9 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 group-hover:scale-105 transition">
          <Flame className="h-4.5 w-4.5" />
        </div>
      </button>

      {/* Breached SLA */}
      <button
        onClick={() => onFilterChange({ sla_breached: true })}
        className="bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 p-3.5 rounded-xl text-left transition flex items-center justify-between group"
      >
        <div>
          <p className="text-xs font-medium text-amber-400">SLA Violations</p>
          <p className="text-2xl font-bold text-amber-300 tracking-tight mt-0.5">{breachedCount}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Over target threshold</p>
        </div>
        <div className="h-9 w-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-105 transition">
          <AlertTriangle className="h-4.5 w-4.5" />
        </div>
      </button>

      {/* Dual-Signoff Pending */}
      <button
        onClick={() => onFilterChange({ pending_signoff: true })}
        className="bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 p-3.5 rounded-xl text-left transition flex items-center justify-between group"
      >
        <div>
          <p className="text-xs font-medium text-cyan-400">Awaiting Signoff</p>
          <p className="text-2xl font-bold text-cyan-300 tracking-tight mt-0.5">{signoffCount}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Segregated duties gate</p>
        </div>
        <div className="h-9 w-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition">
          <ShieldCheck className="h-4.5 w-4.5" />
        </div>
      </button>

      {/* Unassigned Intake */}
      <button
        onClick={() => onFilterChange({ unassigned: true })}
        className="bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 p-3.5 rounded-xl text-left transition flex items-center justify-between group col-span-2 sm:col-span-1"
      >
        <div>
          <p className="text-xs font-medium text-violet-400">Unassigned</p>
          <p className="text-2xl font-bold text-violet-300 tracking-tight mt-0.5">{unassignedCount}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Available for claim</p>
        </div>
        <div className="h-9 w-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 group-hover:scale-105 transition">
          <Clock className="h-4.5 w-4.5" />
        </div>
      </button>
    </div>
  );
};
