import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  X, 
  RotateCw, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Flame
} from 'lucide-react';
import { OutboxQueueStats, OutboxEventRecord } from '../types';
import { api } from '../api';

interface OutboxInspectorModalProps {
  onClose: () => void;
}

export const OutboxInspectorModal: React.FC<OutboxInspectorModalProps> = ({ onClose }) => {
  const [stats, setStats] = useState<OutboxQueueStats | null>(null);
  const [events, setEvents] = useState<OutboxEventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [s, ev] = await Promise.all([
        api.getOutboxStats(),
        api.listOutboxEvents(40)
      ]);
      setStats(s);
      setEvents(ev);
    } catch (err: any) {
      console.error('Error loading outbox health:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async (id: string) => {
    try {
      await api.retryOutboxEvent(id);
      setActionMessage(`Event ${id} reset to PENDING for immediate processing.`);
      await loadData();
    } catch (err: any) {
      setActionMessage(err.message || 'Failed to retry event');
    }
  };

  const handleTriggerSlaWatchdog = async () => {
    try {
      const res = await api.triggerSlaWatchdog();
      setActionMessage(`SLA Watchdog evaluated: ${res.breached_directives_count} overdue directives flagged.`);
      await loadData();
    } catch (err: any) {
      setActionMessage(err.message || 'SLA evaluation failed');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Transactional Outbox & Worker Health</h2>
              <p className="text-[11px] text-slate-400">
                Guaranteed asynchronous dispatch with exponential backoff & Dead-Letter Queue (DLQ)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTriggerSlaWatchdog}
              className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-medium transition"
            >
              Run SLA Watchdog Now
            </button>
            <button
              onClick={loadData}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
              title="Refresh queue"
            >
              <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Action Banner */}
        {actionMessage && (
          <div className="p-3 bg-indigo-950/70 border-b border-indigo-800/80 text-xs text-indigo-300 flex items-center justify-between">
            <span>{actionMessage}</span>
            <button onClick={() => setActionMessage(null)} className="text-indigo-400 hover:text-white">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* Stats Bar */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-[10px] text-slate-500 font-semibold uppercase">Total Jobs</p>
                <p className="text-lg font-bold text-white mt-0.5">{stats.total}</p>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-[10px] text-slate-400 font-semibold uppercase">Pending</p>
                <p className="text-lg font-bold text-slate-200 mt-0.5">{stats.pending}</p>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-[10px] text-indigo-400 font-semibold uppercase">In-Flight</p>
                <p className="text-lg font-bold text-indigo-300 mt-0.5">{stats.in_flight}</p>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-[10px] text-emerald-400 font-semibold uppercase">Processed</p>
                <p className="text-lg font-bold text-emerald-300 mt-0.5">{stats.processed}</p>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-[10px] text-amber-400 font-semibold uppercase">Retrying</p>
                <p className="text-lg font-bold text-amber-300 mt-0.5">{stats.failed}</p>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-[10px] text-rose-400 font-semibold uppercase">Dead Letter</p>
                <p className="text-lg font-bold text-rose-300 mt-0.5">{stats.dead_letter}</p>
              </div>
            </div>
          )}

          {/* Events Table */}
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
            <div className="p-3 border-b border-slate-800 font-semibold text-slate-300 text-xs">
              Recent Outbox Transactions ({events.length})
            </div>
            <div className="overflow-x-auto max-h-[380px]">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                    <th className="py-2.5 px-3">Event ID</th>
                    <th className="py-2.5 px-3">Event Type</th>
                    <th className="py-2.5 px-2">Status</th>
                    <th className="py-2.5 px-2 text-center">Attempts</th>
                    <th className="py-2.5 px-3">Scheduled At</th>
                    <th className="py-2.5 px-3">Error / Diagnostics</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Outbox queue is clear. No active background jobs.
                      </td>
                    </tr>
                  ) : (
                    events.map(ev => (
                      <tr key={ev.id} className="hover:bg-slate-900/40">
                        <td className="py-2.5 px-3 font-mono text-indigo-400 font-bold">{ev.id}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-300">{ev.event_name}</td>
                        <td className="py-2.5 px-2">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            ev.status === 'PROCESSED' ? 'bg-emerald-500/20 text-emerald-300' :
                            ev.status === 'DEAD_LETTER' ? 'bg-rose-500/20 text-rose-300 font-mono' :
                            ev.status === 'FAILED' ? 'bg-amber-500/20 text-amber-300 font-mono' :
                            ev.status === 'IN_FLIGHT' ? 'bg-indigo-500/20 text-indigo-300 animate-pulse' :
                            'bg-slate-800 text-slate-300'
                          }`}>
                            {ev.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono">
                          {ev.attempt_count} / {ev.max_attempts}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 font-mono">
                          {new Date(ev.scheduled_at).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate">
                          {ev.error_details || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {(ev.status === 'FAILED' || ev.status === 'DEAD_LETTER') && (
                            <button
                              onClick={() => handleRetry(ev.id)}
                              className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[10px] transition"
                            >
                              Retry
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
