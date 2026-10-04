import React from 'react';
import { 
  AlertCircle, 
  Clock, 
  Shield, 
  UserCheck, 
  CheckCircle2, 
  XCircle, 
  ChevronRight,
  Flame,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { OperationDirectiveEnriched, SeverityLevel, DirectiveStatus } from '../types';

interface CommandQueueTableProps {
  directives: OperationDirectiveEnriched[];
  selectedId: string | null;
  onSelectDirective: (id: string) => void;
  onQuickClaim: (directive: OperationDirectiveEnriched, e: React.MouseEvent) => void;
  currentPage: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
}

export const CommandQueueTable: React.FC<CommandQueueTableProps> = ({
  directives,
  selectedId,
  onSelectDirective,
  onQuickClaim,
  currentPage,
  pageSize,
  totalRecords,
  totalPages,
  onPageChange
}) => {
  const getSeverityBadge = (sev: SeverityLevel) => {
    switch (sev) {
      case 'SEV1_CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <Flame className="h-3 w-3 text-rose-400" />
            SEV-1
          </span>
        );
      case 'SEV2_HIGH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            SEV-2
          </span>
        );
      case 'SEV3_MEDIUM':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            SEV-3
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-500/15 text-slate-300 border border-slate-500/30">
            SEV-4
          </span>
        );
    }
  };

  const getStatusBadge = (status: DirectiveStatus, requiresApproval: boolean, approvalStatus: string) => {
    switch (status) {
      case 'INTAKE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">INTAKE</span>;
      case 'TRIAGED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/30">TRIAGED</span>;
      case 'ACTIVE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">ACTIVE</span>;
      case 'AWAITING_APPROVAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 animate-pulse">
            <Shield className="h-2.5 w-2.5" />
            APPROVAL
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <CheckCircle2 className="h-2.5 w-2.5" />
            RESOLVED
          </span>
        );
      case 'CLOSED_ABORTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <XCircle className="h-2.5 w-2.5" />
            CLOSED
          </span>
        );
    }
  };

  const renderSlaIndicator = (directive: OperationDirectiveEnriched) => {
    if (['RESOLVED', 'CLOSED_ABORTED'].includes(directive.status)) {
      return <span className="text-[11px] text-slate-500">Completed</span>;
    }

    const due = new Date(directive.sla_target_at).getTime();
    const now = Date.now();
    const diffMs = due - now;

    if (directive.sla_breached || diffMs <= 0) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400">
          <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
          <span>BREACHED</span>
        </span>
      );
    }

    const diffMins = Math.floor(diffMs / (60 * 1000));
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${diffMins < 60 ? 'text-amber-400 font-semibold' : 'text-slate-300'}`}>
        <Clock className="h-3 w-3 shrink-0" />
        <span>{timeStr}</span>
      </span>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="py-3 px-4">Directive</th>
              <th className="py-3 px-3">Severity</th>
              <th className="py-3 px-4">Title & Context</th>
              <th className="py-3 px-4">Team & Assignee</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3">Target SLA</th>
              <th className="py-3 px-2 text-center" title="Monotonic Version for OCC">Ver</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 text-xs text-slate-300">
            {directives.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500">
                  No operational directives match the current filter criteria.
                </td>
              </tr>
            ) : (
              directives.map((item) => {
                const isSelected = item.id === selectedId;
                return (
                  <tr
                    key={item.id}
                    onClick={() => onSelectDirective(item.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-950/40 border-l-4 border-l-indigo-500'
                        : 'hover:bg-slate-800/50 border-l-4 border-l-transparent'
                    }`}
                  >
                    {/* Code & Category */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-mono font-bold text-indigo-400 tracking-tight">{item.directive_code}</div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{item.category.replace('_', ' ')}</div>
                    </td>

                    {/* Severity */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {getSeverityBadge(item.severity)}
                    </td>

                    {/* Title */}
                    <td className="py-3 px-4 max-w-md">
                      <div className="font-semibold text-slate-100 truncate">{item.title}</div>
                      <div className="text-slate-400 text-[11px] truncate mt-0.5">{item.description}</div>
                    </td>

                    {/* Team & Assignee */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-slate-300">{item.assigned_team_name}</span>
                        <span className="text-[10px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          {item.assigned_team_code}
                        </span>
                      </div>
                      <div className="text-[11px] mt-0.5">
                        {item.assigned_user_name ? (
                          <span className="text-slate-400 flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                            {item.assigned_user_name}
                          </span>
                        ) : (
                          <span className="text-amber-400/90 font-medium">Unassigned</span>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {getStatusBadge(item.status, item.requires_dual_signoff, item.approval_status)}
                    </td>

                    {/* Target SLA */}
                    <td className="py-3 px-3 whitespace-nowrap font-mono">
                      {renderSlaIndicator(item)}
                    </td>

                    {/* OCC Version */}
                    <td className="py-3 px-2 text-center whitespace-nowrap font-mono text-[10px] text-slate-500">
                      v{item.version}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {!item.assigned_user_id && !['RESOLVED', 'CLOSED_ABORTED'].includes(item.status) ? (
                        <button
                          onClick={(e) => onQuickClaim(item, e)}
                          className="px-2.5 py-1 rounded bg-indigo-600/80 hover:bg-indigo-600 text-white text-[11px] font-medium transition inline-flex items-center gap-1 shadow"
                        >
                          <UserCheck className="h-3 w-3" />
                          <span>Claim</span>
                        </button>
                      ) : (
                        <span className="text-slate-500 hover:text-slate-300 inline-flex items-center">
                          <ChevronRight className="h-4 w-4" />
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className="py-3 px-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <div>
          Showing <span className="text-slate-200 font-semibold">{directives.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span> to{' '}
          <span className="text-slate-200 font-semibold">{Math.min(currentPage * pageSize, totalRecords)}</span> of{' '}
          <span className="text-slate-200 font-semibold">{totalRecords}</span> directives
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage <= 1}
            className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition"
            title="First page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition"
            title="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 font-mono text-slate-300">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition"
            title="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage >= totalPages}
            className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition"
            title="Last page"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
