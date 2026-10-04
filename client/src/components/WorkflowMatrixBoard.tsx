import React from 'react';
import { 
  Clock, 
  AlertTriangle, 
  ShieldCheck, 
  CheckCircle2, 
  Flame 
} from 'lucide-react';
import { OperationDirectiveEnriched, DirectiveStatus, SeverityLevel } from '../types';

interface WorkflowMatrixBoardProps {
  directives: OperationDirectiveEnriched[];
  selectedId: string | null;
  onSelectDirective: (id: string) => void;
}

const COLUMNS: { id: DirectiveStatus; title: string; countColor: string }[] = [
  { id: 'INTAKE', title: 'Intake / Inflow', countColor: 'text-slate-400 bg-slate-800' },
  { id: 'TRIAGED', title: 'Triaged & Scoped', countColor: 'text-blue-400 bg-blue-500/10' },
  { id: 'ACTIVE', title: 'Active In-Progress', countColor: 'text-emerald-400 bg-emerald-500/10' },
  { id: 'AWAITING_APPROVAL', title: 'Dual-Signoff Gate', countColor: 'text-cyan-400 bg-cyan-500/10' },
  { id: 'RESOLVED', title: 'Resolved & Attested', countColor: 'text-purple-400 bg-purple-500/10' }
];

export const WorkflowMatrixBoard: React.FC<WorkflowMatrixBoardProps> = ({
  directives,
  selectedId,
  onSelectDirective
}) => {
  const getSeverityStripe = (sev: SeverityLevel) => {
    switch (sev) {
      case 'SEV1_CRITICAL': return 'border-l-rose-500';
      case 'SEV2_HIGH': return 'border-l-amber-500';
      case 'SEV3_MEDIUM': return 'border-l-indigo-500';
      default: return 'border-l-slate-600';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-start">
      {COLUMNS.map(col => {
        const columnItems = directives.filter(d => d.status === col.id);

        return (
          <div key={col.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-col min-h-[500px]">
            {/* Column Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">{col.title}</h3>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${col.countColor}`}>
                {columnItems.length}
              </span>
            </div>

            {/* Cards List */}
            <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[750px] pr-1">
              {columnItems.length === 0 ? (
                <div className="h-32 border border-dashed border-slate-800 rounded-lg flex items-center justify-center text-[11px] text-slate-600">
                  No directives
                </div>
              ) : (
                columnItems.map(item => {
                  const isSelected = item.id === selectedId;
                  const isSlaBreached = item.sla_breached;

                  return (
                    <div
                      key={item.id}
                      onClick={() => onSelectDirective(item.id)}
                      className={`cursor-pointer rounded-lg p-3 bg-slate-900 border transition shadow-sm border-l-4 ${getSeverityStripe(item.severity)} ${
                        isSelected 
                          ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-950/20 shadow-md' 
                          : 'border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                      }`}
                    >
                      {/* Code and Dual-Signoff Flag */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-[11px] font-bold text-indigo-400">{item.directive_code}</span>
                        <div className="flex items-center gap-1">
                          {item.requires_dual_signoff && (
                            <span className="p-0.5 rounded bg-cyan-500/10 text-cyan-400" title="Dual-Signoff Gate Required">
                              <ShieldCheck className="h-3 w-3" />
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-slate-500">v{item.version}</span>
                        </div>
                      </div>

                      {/* Title */}
                      <h4 className="text-xs font-semibold text-slate-100 line-clamp-2 mb-2">
                        {item.title}
                      </h4>

                      {/* Team & Category */}
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-medium border border-slate-700">
                          {item.assigned_team_code || item.assigned_team_name}
                        </span>
                        <span className="text-[10px] text-slate-500 uppercase tracking-tight">
                          {item.category.replace('_', ' ')}
                        </span>
                      </div>

                      {/* Footer: Assignee & SLA */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px]">
                        {item.assigned_user_name ? (
                          <span className="text-slate-300 font-medium truncate max-w-[100px]">
                            {item.assigned_user_name}
                          </span>
                        ) : (
                          <span className="text-amber-400/90 font-medium">Unassigned</span>
                        )}

                        {isSlaBreached ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-400">
                            <AlertTriangle className="h-3 w-3" />
                            Breached
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                            <Clock className="h-3 w-3" />
                            {new Date(item.sla_target_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
