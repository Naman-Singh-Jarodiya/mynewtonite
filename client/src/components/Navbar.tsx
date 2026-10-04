import React from 'react';
import { 
  Zap, 
  Activity, 
  PlusCircle, 
  Layers, 
  ShieldAlert, 
  Users, 
  RotateCw,
  Cpu
} from 'lucide-react';
import { UserWithProfile } from '../types';

interface NavbarProps {
  users: UserWithProfile[];
  currentActorId: string;
  onSelectActor: (userId: string) => void;
  isConnected: boolean;
  onOpenCreate: () => void;
  onOpenOutbox: () => void;
  onSimulateConflict: () => void;
  viewMode: 'table' | 'kanban';
  onToggleViewMode: (mode: 'table' | 'kanban') => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  users,
  currentActorId,
  onSelectActor,
  isConnected,
  onOpenCreate,
  onOpenOutbox,
  onSimulateConflict,
  viewMode,
  onToggleViewMode,
  onRefresh,
  isRefreshing
}) => {
  const currentActor = users.find(u => u.id === currentActorId);

  return (
    <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur sticky top-0 z-40 px-4 lg:px-8 py-3">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Logo and Brand */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white tracking-tight">myNewtonite</span>
              <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Ops Control Plane
              </span>
            </div>
            <p className="text-xs text-slate-400">Resilient High-Pressure Operations & Incident Workflow</p>
          </div>
        </div>

        {/* Action Controls & Simulator Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Live Sync Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-xs text-slate-300">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isConnected ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            </span>
            <span className="font-mono">{isConnected ? 'LIVE SYNC' : 'OFFLINE'}</span>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => onToggleViewMode('table')}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                viewMode === 'table' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Dense Queue
            </button>
            <button
              onClick={() => onToggleViewMode('kanban')}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                viewMode === 'kanban' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Matrix Board
            </button>
          </div>

          {/* Simulate OCC Conflict Trigger */}
          <button
            onClick={onSimulateConflict}
            title="Simulate concurrent write collision to demonstrate HTTP 409 OCC intercept"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium transition"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
            <span>Simulate OCC Collision</span>
          </button>

          {/* Outbox & Watchdog Inspector */}
          <button
            onClick={onOpenOutbox}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition"
          >
            <Cpu className="h-3.5 w-3.5 text-indigo-400" />
            <span>Outbox Daemon</span>
          </button>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition disabled:opacity-50"
            title="Reload Directives"
          >
            <RotateCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Log New Directive */}
          <button
            onClick={onOpenCreate}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition active:scale-95"
          >
            <PlusCircle className="h-4 w-4" />
            <span>New Directive</span>
          </button>

          {/* Active Persona Switcher */}
          <div className="relative flex items-center pl-2 border-l border-slate-800">
            <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 px-2.5 py-1.5 rounded-lg">
              {currentActor?.avatar_url && (
                <img
                  src={currentActor.avatar_url}
                  alt={currentActor.name}
                  className="h-6 w-6 rounded-full object-cover ring-1 ring-indigo-500"
                />
              )}
              <div className="text-left hidden sm:block">
                <p className="text-xs font-medium text-white leading-none">{currentActor?.name}</p>
                <p className="text-[10px] text-slate-400 truncate max-w-[120px]">{currentActor?.role_title}</p>
              </div>
              <select
                value={currentActorId}
                onChange={(e) => onSelectActor(e.target.value)}
                className="bg-transparent text-xs text-indigo-300 font-medium focus:outline-none cursor-pointer border-none pl-1"
                title="Switch Operational Persona"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id} className="bg-slate-900 text-white">
                    {u.name} — {u.role_title} ({u.is_admin ? 'Admin' : u.memberships[0]?.role || 'Member'})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
