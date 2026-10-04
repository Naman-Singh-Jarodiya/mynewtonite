import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  Filter, 
  X, 
  RotateCw,
  SlidersHorizontal,
  Flame,
  ShieldCheck,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { 
  OperationDirectiveEnriched, 
  UserWithProfile, 
  TeamWithMembers, 
  SeverityLevel, 
  DirectiveCategory, 
  DirectiveStatus 
} from './types';
import { api, setActorId, ApiConflictError } from './api';
import { useRealtimeStream } from './hooks/useRealtimeStream';
import { Navbar } from './components/Navbar';
import { MetricsOverview } from './components/MetricsOverview';
import { CommandQueueTable } from './components/CommandQueueTable';
import { WorkflowMatrixBoard } from './components/WorkflowMatrixBoard';
import { DirectiveDrawer } from './components/DirectiveDrawer';
import { CreateDirectiveModal } from './components/CreateDirectiveModal';
import { ConflictResolutionModal } from './components/ConflictResolutionModal';
import { OutboxInspectorModal } from './components/OutboxInspectorModal';

export const App: React.FC = () => {
  const [users, setUsers] = useState<UserWithProfile[]>([]);
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [currentActorId, setCurrentActorId] = useState('usr-marcus-lead');

  // Directives state
  const [directives, setDirectives] = useState<OperationDirectiveEnriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedDirectiveId, setSelectedDirectiveId] = useState<string | null>(null);

  // View Mode: 'table' or 'kanban'
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [filterUnassigned, setFilterUnassigned] = useState(false);
  const [filterPendingSignoff, setFilterPendingSignoff] = useState(false);
  const [filterSlaBreached, setFilterSlaBreached] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showOutboxModal, setShowOutboxModal] = useState(false);
  const [activeConflict, setActiveConflict] = useState<ApiConflictError | null>(null);
  const [liveBanner, setLiveBanner] = useState<string | null>(null);

  // Load Initial Metadata (Users & Teams)
  useEffect(() => {
    async function loadMeta() {
      try {
        const [u, t] = await Promise.all([api.listUsers(), api.listTeams()]);
        setUsers(u);
        setTeams(t);
        if (u.length > 0) {
          setCurrentActorId(u[0].id);
          setActorId(u[0].id);
        }
      } catch (err) {
        console.error('Failed to load initial teams or users:', err);
      }
    }
    loadMeta();
  }, []);

  // Fetch Directives with server-side filters & pagination
  const fetchDirectives = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const params: Record<string, any> = {
        query: searchQuery || undefined,
        team_id: selectedTeam || undefined,
        severity: selectedSeverity || undefined,
        category: selectedCategory || undefined,
        status: selectedStatus || undefined,
        unassigned: filterUnassigned ? true : undefined,
        pending_signoff: filterPendingSignoff ? true : undefined,
        sla_breached: filterSlaBreached ? true : undefined,
        page,
        page_size: pageSize
      };

      const res = await api.listOperations(params);
      setDirectives(res.items);
      setTotalRecords(res.metadata.total_records);
      setTotalPages(res.metadata.total_pages);
    } catch (err) {
      console.error('Error fetching directives:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [
    searchQuery,
    selectedTeam,
    selectedSeverity,
    selectedCategory,
    selectedStatus,
    filterUnassigned,
    filterPendingSignoff,
    filterSlaBreached,
    page,
    pageSize
  ]);

  useEffect(() => {
    fetchDirectives();
  }, [fetchDirectives]);

  // Handle SSE Events
  const handleRealtimeEvent = useCallback((event: string, data: any) => {
    if (event === 'DIRECTIVE_CREATED') {
      setLiveBanner(`New Directive Inflow: [${data.item.directive_code}] ${data.item.title}`);
      fetchDirectives();
    } else if (event === 'DIRECTIVE_UPDATED') {
      setDirectives(prev => prev.map(d => d.id === data.item.id ? data.item : d));
    } else if (event === 'SLA_BREACH_ALERT') {
      setLiveBanner(`⚠️ SLA Threshold Breached: [${data.directiveCode}] ${data.title}`);
      fetchDirectives();
    } else if (event === 'ALERT_DISPATCHED') {
      // Async outbox notification broadcasted
    }
  }, [fetchDirectives]);

  const { isConnected } = useRealtimeStream(handleRealtimeEvent);

  // Switch Actor
  const handleSelectActor = (actorId: string) => {
    setCurrentActorId(actorId);
    setActorId(actorId);
  };

  // Quick Claim from table
  const handleQuickClaim = async (item: OperationDirectiveEnriched, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updated = await api.claimOperation(item.id, item.version);
      setDirectives(prev => prev.map(d => d.id === updated.id ? updated : d));
    } catch (err: any) {
      if (err instanceof ApiConflictError) {
        setActiveConflict(err);
      } else {
        alert(err.message || 'Claim rejected');
      }
    }
  };

  // Simulate OCC Concurrency Collision
  const handleSimulateConflict = async () => {
    if (directives.length === 0) return;
    const target = directives[0];

    // Deliberately pass a stale version: (target.version - 1) or target.version after modifying it
    try {
      // We pass expected_version = 0 (which is always stale since versions start at 1)
      await api.patchDetails(target.id, {
        title: target.title + ' [COLLISION]'
      }, 0);
    } catch (err: any) {
      if (err instanceof ApiConflictError) {
        setActiveConflict(err);
      } else {
        alert(err.message);
      }
    }
  };

  // Metrics click shortcut filter
  const handleMetricFilter = (f: { status?: any; severity?: any; pending_signoff?: boolean; unassigned?: boolean; sla_breached?: boolean }) => {
    if (f.severity) setSelectedSeverity(f.severity);
    if (f.pending_signoff) setFilterPendingSignoff(true);
    if (f.unassigned) setFilterUnassigned(true);
    if (f.sla_breached) setFilterSlaBreached(true);
    setPage(1);
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedTeam('');
    setSelectedSeverity('');
    setSelectedCategory('');
    setSelectedStatus('');
    setFilterUnassigned(false);
    setFilterPendingSignoff(false);
    setFilterSlaBreached(false);
    setPage(1);
  };

  const hasActiveFilters = searchQuery || selectedTeam || selectedSeverity || selectedCategory || selectedStatus || filterUnassigned || filterPendingSignoff || filterSlaBreached;

  const currentActor = users.find(u => u.id === currentActorId) || {
    id: currentActorId,
    name: 'Current Actor',
    email: '',
    role_title: 'Operator',
    memberships: [],
    is_admin: false,
    created_at: ''
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <Navbar
        users={users}
        currentActorId={currentActorId}
        onSelectActor={handleSelectActor}
        isConnected={isConnected}
        onOpenCreate={() => setShowCreateModal(true)}
        onOpenOutbox={() => setShowOutboxModal(true)}
        onSimulateConflict={handleSimulateConflict}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
        onRefresh={fetchDirectives}
        isRefreshing={isRefreshing}
      />

      {/* Live SSE Alert Banner */}
      {liveBanner && (
        <div className="bg-indigo-950 border-b border-indigo-800 px-4 lg:px-8 py-2 text-xs text-indigo-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse"></span>
            <span className="font-medium">{liveBanner}</span>
          </div>
          <button onClick={() => setLiveBanner(null)} className="text-indigo-400 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8">
        {/* Executive Workload Pulse Metrics */}
        <MetricsOverview
          directives={directives}
          totalRecords={totalRecords}
          onFilterChange={handleMetricFilter}
        />

        {/* Filter and Search Bar */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl mb-5 space-y-3 shadow-lg">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search directives by tracking code, title, or description..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-slate-950 border border-slate-750 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Team Filter */}
            <select
              value={selectedTeam}
              onChange={(e) => {
                setSelectedTeam(e.target.value);
                setPage(1);
              }}
              className="bg-slate-950 border border-slate-750 rounded-lg px-3 py-2 text-xs text-slate-300"
            >
              <option value="">All Teams</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

            {/* Severity Filter */}
            <select
              value={selectedSeverity}
              onChange={(e) => {
                setSelectedSeverity(e.target.value);
                setPage(1);
              }}
              className="bg-slate-950 border border-slate-750 rounded-lg px-3 py-2 text-xs text-slate-300"
            >
              <option value="">All Severities</option>
              <option value="SEV1_CRITICAL">SEV-1 Critical</option>
              <option value="SEV2_HIGH">SEV-2 High</option>
              <option value="SEV3_MEDIUM">SEV-3 Medium</option>
              <option value="SEV4_LOW">SEV-4 Low</option>
            </select>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              className="bg-slate-950 border border-slate-750 rounded-lg px-3 py-2 text-xs text-slate-300"
            >
              <option value="">All Categories</option>
              <option value="SYSTEM_INCIDENT">System Incident</option>
              <option value="FINANCIAL_TX">Financial Transaction</option>
              <option value="CUSTOMER_ESCALATION">Customer Escalation</option>
              <option value="SECURITY_COMPLIANCE">Security & Compliance</option>
              <option value="INFRA_MAINTENANCE">Infra Maintenance</option>
              <option value="DATA_PIPELINE">Data Pipeline</option>
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="bg-slate-950 border border-slate-750 rounded-lg px-3 py-2 text-xs text-slate-300"
            >
              <option value="">All Statuses</option>
              <option value="INTAKE">Intake</option>
              <option value="TRIAGED">Triaged</option>
              <option value="ACTIVE">Active</option>
              <option value="AWAITING_APPROVAL">Awaiting Approval</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED_ABORTED">Closed</option>
            </select>
          </div>

          {/* Quick Toggle Filter Chips */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setFilterPendingSignoff(!filterPendingSignoff);
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition flex items-center gap-1.5 ${
                  filterPendingSignoff
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
                <span>Pending Signoff</span>
              </button>

              <button
                onClick={() => {
                  setFilterSlaBreached(!filterSlaBreached);
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition flex items-center gap-1.5 ${
                  filterSlaBreached
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                <Flame className="h-3.5 w-3.5 text-rose-400" />
                <span>SLA Breached</span>
              </button>

              <button
                onClick={() => {
                  setFilterUnassigned(!filterUnassigned);
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition flex items-center gap-1.5 ${
                  filterUnassigned
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                <Clock className="h-3.5 w-3.5 text-violet-400" />
                <span>Unassigned Only</span>
              </button>
            </div>

            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-medium"
              >
                Reset All Filters
              </button>
            )}
          </div>
        </div>

        {/* View Mode: Table vs Kanban */}
        {viewMode === 'table' ? (
          <CommandQueueTable
            directives={directives}
            selectedId={selectedDirectiveId}
            onSelectDirective={setSelectedDirectiveId}
            onQuickClaim={handleQuickClaim}
            currentPage={page}
            pageSize={pageSize}
            totalRecords={totalRecords}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        ) : (
          <WorkflowMatrixBoard
            directives={directives}
            selectedId={selectedDirectiveId}
            onSelectDirective={setSelectedDirectiveId}
          />
        )}
      </main>

      {/* Slide-over Inspection Drawer */}
      {selectedDirectiveId && (
        <DirectiveDrawer
          directiveId={selectedDirectiveId}
          currentActor={currentActor}
          onClose={() => setSelectedDirectiveId(null)}
          onDirectiveUpdated={(updated) => {
            setDirectives(prev => prev.map(d => d.id === updated.id ? updated : d));
          }}
          onConflictDetected={(conflict) => {
            setActiveConflict(conflict);
          }}
        />
      )}

      {/* Log New Directive Modal */}
      {showCreateModal && (
        <CreateDirectiveModal
          teams={teams}
          onClose={() => setShowCreateModal(false)}
          onCreated={(created) => {
            setShowCreateModal(false);
            setDirectives(prev => [created, ...prev]);
            setSelectedDirectiveId(created.id);
          }}
        />
      )}

      {/* OCC Conflict Resolution Dialog (HTTP 409) */}
      {activeConflict && (
        <ConflictResolutionModal
          conflict={activeConflict}
          onResolve={() => {
            setActiveConflict(null);
            fetchDirectives();
            if (selectedDirectiveId) {
              // Re-trigger drawer refresh
              setSelectedDirectiveId(selectedDirectiveId);
            }
          }}
          onDismiss={() => setActiveConflict(null)}
        />
      )}

      {/* Transactional Outbox Inspector Modal */}
      {showOutboxModal && (
        <OutboxInspectorModal onClose={() => setShowOutboxModal(false)} />
      )}
    </div>
  );
};
