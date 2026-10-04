import React from 'react';
import { 
  ShieldAlert, 
  RefreshCw, 
  AlertTriangle, 
  ArrowRight,
  X
} from 'lucide-react';
import { ApiConflictError } from '../api';

interface ConflictResolutionModalProps {
  conflict: ApiConflictError;
  onResolve: () => void;
  onDismiss: () => void;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  conflict,
  onResolve,
  onDismiss
}) => {
  const item = conflict.currentItem;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-60">
      <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-amber-950/60 border-b border-amber-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-200">Optimistic Concurrency Conflict (HTTP 409)</h3>
              <p className="text-[11px] text-amber-300/80">Stale write intercepted by OCC version validator</p>
            </div>
          </div>
          <button onClick={onDismiss} className="text-amber-400/80 hover:text-amber-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          <p className="text-slate-300 leading-relaxed">
            Your action was rejected because another operator modified <span className="font-mono font-bold text-indigo-400">{item.directive_code}</span> in the interim.
            To avoid corrupting changes made by colleagues, the server refused the stale mutation.
          </p>

          {/* Version delta badge */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
            <div className="text-center">
              <p className="text-[10px] text-slate-500 font-semibold uppercase">Your Stale View</p>
              <p className="font-mono font-bold text-rose-400 text-sm mt-0.5">Version {conflict.currentVersion - 1}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-600" />
            <div className="text-center">
              <p className="text-[10px] text-slate-500 font-semibold uppercase">Live Server State</p>
              <p className="font-mono font-bold text-emerald-400 text-sm mt-0.5">Version {conflict.currentVersion}</p>
            </div>
          </div>

          {/* Current Server State Details */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 space-y-2">
            <p className="font-semibold text-slate-300 text-[11px] uppercase tracking-wider">Current State on Server:</p>
            <div className="grid grid-cols-2 gap-2 text-slate-400">
              <div>
                <span className="text-slate-500">Status: </span>
                <span className="font-semibold text-slate-200">{item.status}</span>
              </div>
              <div>
                <span className="text-slate-500">Severity: </span>
                <span className="font-semibold text-slate-200">{item.severity}</span>
              </div>
              <div>
                <span className="text-slate-500">Assignee: </span>
                <span className="font-semibold text-slate-200">{item.assigned_user_name || 'Unassigned'}</span>
              </div>
              <div>
                <span className="text-slate-500">Last Updated: </span>
                <span className="font-semibold text-slate-200">{new Date(item.updated_at).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>

          <p className="text-slate-400 text-[11px]">
            Click <strong className="text-slate-200">Reconcile & Reload</strong> to refresh the directive with the current server parameters and review colleague contributions.
          </p>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-end gap-2">
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700"
          >
            Dismiss
          </button>
          <button
            onClick={onResolve}
            className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow-lg shadow-amber-600/25 flex items-center gap-1.5 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Reconcile & Reload</span>
          </button>
        </div>
      </div>
    </div>
  );
};
