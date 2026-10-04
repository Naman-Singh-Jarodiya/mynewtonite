import { 
  OperationDirectiveEnriched, 
  AuditEntry, 
  OperationNote, 
  UserWithProfile, 
  TeamWithMembers, 
  OutboxQueueStats, 
  OutboxEventRecord,
  DirectiveStatus,
  SeverityLevel,
  DirectiveCategory
} from './types';

let currentActorId = 'usr-marcus-lead';

export function setActorId(id: string) {
  currentActorId = id;
}

export function getActorId(): string {
  return currentActorId;
}

export class ApiConflictError extends Error {
  public currentVersion: number;
  public currentItem: OperationDirectiveEnriched;
  constructor(message: string, currentVersion: number, currentItem: OperationDirectiveEnriched) {
    super(message);
    this.name = 'ApiConflictError';
    this.currentVersion = currentVersion;
    this.currentItem = currentItem;
  }
}

export class ApiError extends Error {
  public status: number;
  public data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export function buildApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Actor-Id', currentActorId);
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const url = buildApiUrl(endpoint);
  const res = await fetch(url, {
    ...options,
    headers
  });

  if (res.status === 409) {
    const errorBody = await res.json().catch(() => ({}));
    if (errorBody.current_version && errorBody.current_item) {
      throw new ApiConflictError(
        errorBody.message || 'Concurrency conflict detected on this directive.',
        errorBody.current_version,
        errorBody.current_item
      );
    }
    throw new ApiError(errorBody.message || errorBody.error || 'Conflict detected', 409, errorBody);
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(errorBody.message || errorBody.error || `HTTP error ${res.status}`, res.status, errorBody);
  }

  return res.json();
}

export const api = {
  // Directives
  async listOperations(params: Record<string, any> = {}): Promise<{
    items: OperationDirectiveEnriched[];
    metadata: { total_records: number; current_page: number; page_size: number; total_pages: number };
  }> {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        query.set(k, String(v));
      }
    }
    return request(`/api/operations?${query.toString()}`);
  },

  async getOperation(id: string): Promise<{
    item: OperationDirectiveEnriched;
    auditTrail: AuditEntry[];
    notes: OperationNote[];
    viewers: { userId: string; userName: string }[];
  }> {
    return request(`/api/operations/${id}`);
  },

  async createOperation(
    payload: {
      title: string;
      description: string;
      category: DirectiveCategory;
      severity: SeverityLevel;
      assigned_team_id: string;
      assigned_user_id?: string;
      requires_dual_signoff?: boolean;
      metadata?: Record<string, any>;
    },
    customIdempotencyKey?: string
  ): Promise<OperationDirectiveEnriched> {
    const key = customIdempotencyKey || 'idem-key-' + Math.random().toString(36).substring(2, 10);
    return request(`/api/operations`, {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: JSON.stringify(payload)
    });
  },

  async claimOperation(id: string, expectedVersion: number): Promise<OperationDirectiveEnriched> {
    return request(`/api/operations/${id}/claim`, {
      method: 'POST',
      body: JSON.stringify({ expected_version: expectedVersion })
    });
  },

  async transitionStatus(
    id: string,
    targetStatus: DirectiveStatus,
    expectedVersion: number,
    details?: { resolution_notes?: string; root_cause_category?: string; reason?: string }
  ): Promise<OperationDirectiveEnriched> {
    return request(`/api/operations/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({
        target_status: targetStatus,
        expected_version: expectedVersion,
        ...details
      })
    });
  },

  async recordSignoff(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    notes: string,
    expectedVersion: number
  ): Promise<OperationDirectiveEnriched> {
    return request(`/api/operations/${id}/signoff`, {
      method: 'POST',
      body: JSON.stringify({
        decision,
        notes,
        expected_version: expectedVersion
      })
    });
  },

  async patchDetails(
    id: string,
    updates: Partial<OperationDirectiveEnriched>,
    expectedVersion: number
  ): Promise<OperationDirectiveEnriched> {
    return request(`/api/operations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...updates,
        expected_version: expectedVersion
      })
    });
  },

  async addNote(id: string, content: string, isConfidential: boolean = false): Promise<OperationNote> {
    return request(`/api/operations/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content, is_confidential: isConfidential })
    });
  },

  async sendPresence(id: string): Promise<{ ok: boolean; active_viewers: { userId: string; userName: string }[] }> {
    return request(`/api/operations/${id}/presence`, {
      method: 'POST'
    });
  },

  // Teams & Users
  async listTeams(): Promise<TeamWithMembers[]> {
    return request('/api/teams');
  },

  async listUsers(): Promise<UserWithProfile[]> {
    return request('/api/users');
  },

  // Outbox & Watchdog
  async getOutboxStats(): Promise<OutboxQueueStats> {
    return request('/api/outbox/stats');
  },

  async listOutboxEvents(limit: number = 30): Promise<OutboxEventRecord[]> {
    return request(`/api/outbox/events?limit=${limit}`);
  },

  async retryOutboxEvent(id: string): Promise<{ ok: boolean; message: string }> {
    return request(`/api/outbox/retry/${id}`, { method: 'POST' });
  },

  async triggerSlaWatchdog(): Promise<{ ok: boolean; breached_directives_count: number }> {
    return request('/api/outbox/watchdog/sla', { method: 'POST' });
  }
};
