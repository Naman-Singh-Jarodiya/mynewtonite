# myNewtonite Operations Control Plane — Operations Under Pressure

> An enterprise operational coordination and incident orchestration platform built for high-throughput teams, multi-stakeholder workflows, and strict data consistency under concurrent load.

---

## 🌟 System Highlights & Critical Behaviors

This application provides a resilient operational cockpit designed to replace unstructured messaging threads, spreadsheets, and emails with an auditable, high-performance platform:

1. **Optimistic Concurrency Control (OCC) & Versioning**:
   * Every operational directive maintains a monotonic `version` counter.
   * State updates, ownership claims, and approvals use atomic conditional queries (`WHERE id = ? AND version = ?`).
   * Stale updates are intercepted with **HTTP 409 Conflict**, triggering a side-by-side **Conflict Resolution Dialog** allowing the operator to inspect changes and reconcile safely without silent overwrites.
2. **Idempotency Keys & Safe Deduplication**:
   * All mutating requests support the `Idempotency-Key` header with payload hashing (`SHA-256`).
   * Accidental double-clicks and network retries return the original cached response with `X-Idempotent-Replay: true` without duplicating directives or audit entries.
   * Tamper protection returns **HTTP 422 Unprocessable Entity** if a key is reused with altered parameters.
3. **Guarded State Machine with Dual-Signoff & Segregation of Duties**:
   * Lifecycle stages: `INTAKE` → `TRIAGED` → `ACTIVE` → `AWAITING_APPROVAL` → `RESOLVED` / `CLOSED_ABORTED`.
   * High-risk actions flagged with `requires_dual_signoff = true` cannot bypass formal approval.
   * **Segregation of Duties Enforced**: The creator or assigned owner of a directive cannot authorize their own signoff; an independent authorized team approver or lead must approve.
   * Completeness guard enforces that resolving a directive requires detailed resolution notes (minimum 5 characters) and root-cause classification.
4. **Transactional Outbox Pattern for Background Resilience**:
   * Notifications, SLA evaluations, and audit enrichments are persisted in an `outbox_events` table inside the exact same ACID transaction as the primary directive mutation.
   * A background worker daemon continuously processes events with **jittered exponential backoff** and an automated **Dead-Letter Queue (DLQ)**.
5. **Real-time Live Sync & Active Viewer Presence**:
   * Server-Sent Events (SSE) stream broadcasts updates in real-time across all connected clients.
   * Active viewer presence indicator shows who is currently viewing an item, alerting operators to avoid concurrent editing collisions.
6. **Scalable Querying & Server-Side Pagination**:
   * SQLite with Write-Ahead Logging (`WAL` mode) and composite indexing on `(status, severity)`, `(assigned_team_id, status)`, `(sla_target_at, sla_breached)`, and `(created_at)`.
   * Paginated, indexed search across tracking codes, titles, and descriptions designed to handle tens of thousands of items without client-side memory bloat.

---

## 🚀 Quick Start Instructions

### Prerequisites
* **Node.js** (v18+; verified on v24)
* **npm** (v9+)

### Installation
Clone or navigate to the `mynewtonite/` directory:
```bash
# In repository root (mynewtonite/)
npm run install:all
```
*(Or install inside each folder: `cd server && npm install`, then `cd ../client && npm install`)*

### Seed Database
Seed rich, realistic operational data across 5 cross-functional teams, 8 user personas, and active operational directives (including critical incidents and approval-gated payments):
```bash
npm run seed
```

### Running the Application

To run the backend server and frontend client concurrently:

**Terminal 1 — Backend API Server:**
```bash
npm run dev:server
```
*Backend runs on: `http://localhost:3001`*

**Terminal 2 — Frontend Client:**
```bash
npm run dev:client
```
*Frontend runs on: `http://localhost:5173`*

Open **http://localhost:5173** in your browser.

---

## 🧪 Running Automated Tests

A comprehensive Vitest test suite covers all critical concurrency edge cases, race conditions, and failure modes:

```bash
npm test
```

### Verified Test Cases:
* ✅ **OCC Race Conditions:** Stale claim or update rejection with HTTP 409 and fresh version payload.
* ✅ **Idempotency Deduplication:** Replaying identical requests with the same key returns cached responses without duplicate side-effects.
* ✅ **Idempotency Tamper Protection:** Reusing a key with a modified payload returns HTTP 422 Unprocessable Entity.
* ✅ **Approval Gates:** Blocks direct resolution of approval-gated items without formal signoff.
* ✅ **Segregation of Duties:** Rejects self-approval attempts by ticket creators/owners with HTTP 403 Forbidden.
* ✅ **Resolution Completeness:** Validates that resolving a directive requires a detailed resolution summary.
* ✅ **Outbox Exponential Backoff:** Re-schedules transient failures with jittered exponential backoff.
* ✅ **Dead Letter Queue:** Transitions jobs to `DEAD_LETTER` after exceeding max attempts.
* ✅ **SLA Breach Monitoring:** Identifies overdue items, sets `sla_breached = 1`, and creates automated system audit logs.

---

## 🧭 How to Test & Demo Key Behaviors in the UI

### 1. Test Concurrency Conflict (OCC 409)
* In the top bar, click the **"Simulate OCC Collision"** button.
* The system intentionally triggers a simulated simultaneous write collision on a stale version.
* The **Optimistic Concurrency Conflict Dialog** immediately appears, showing:
  * Your stale version vs current server state.
  * Details of what changed on the server.
  * A 1-click **"Reconcile & Reload"** button to refresh safely.

### 2. Test Idempotency & Duplicate Prevention
* Click **"New Directive"** (+ button in header).
* Fill in details and click **"Simulate Double-Click (Idempotency)"**.
* The modal will submit two requests in rapid succession with the same `Idempotency-Key`.
* An alert will verify that the server processed the first request and returned the cached result with `X-Idempotent-Replay: true` for the second, without duplicating the item in the database!

### 3. Test Dual-Signoff & Segregation of Duties
* In the table, click **`NEWTON-1002`** (*High-Value Transaction Release: $620,000 Corporate Escrow*).
* Notice the banner: **Dual-Signoff Gate**.
* In the top header persona dropdown, select **Marcus Vance (Payment Operations Lead)**:
  * Marcus is the requester and assigned owner. Notice the warning:
    > *"Segregation of Duties Enforced: As the creator or assigned owner of this directive, you are structurally prohibited from approving your own request."*
* Now switch persona in the dropdown to **Sophia Chen (Financial Authorizer & Approver)**:
  * Sophia has approver authority and did not create the item. The approval action box immediately unlocks!
  * Enter a signoff note and click **"Grant Approval"**.
  * The item advances and unlocks the **"Complete & Resolve"** button.

### 4. Test Background Outbox Worker & Dead-Letter Queue
* In the top header, click **"Outbox Daemon"**.
* View queue statistics (Total, Pending, In-Flight, Processed, Retrying, Dead Letter).
* Click **"Run SLA Watchdog Now"** to force immediate SLA evaluation across all items.
* If any job fails, click **"Retry"** to reset it for immediate processing.

---

## 📁 Repository Structure

```
mynewtonite/
├── README.md                     # Setup, usage, and demonstration guide
├── ENGINEERING_DECISIONS.md      # In-depth architectural trade-offs document
├── package.json                  # Root orchestration scripts
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── app.ts                # Express app factory & middleware pipeline
│   │   ├── server.ts             # Server bootstrapper & Outbox daemon starter
│   │   ├── types.ts              # TypeScript domain types & interfaces
│   │   ├── config/               # Environment configuration & SLA thresholds
│   │   ├── db/
│   │   │   ├── connection.ts     # SQLite connection with WAL mode & busy timeout
│   │   │   ├── schema.ts         # Relational schema DDL & composite indexes
│   │   │   └── seed.ts           # Rich operational seed data generator
│   │   ├── domain/
│   │   │   ├── workflowStateMachine.ts # Transition graphs & segregation of duties engine
│   │   │   └── outboxProcessor.ts      # Async worker with exponential backoff & DLQ
│   │   ├── events/
│   │   │   └── streamHub.ts      # SSE event hub & presence tracker
│   │   ├── security/
│   │   │   ├── authContext.ts    # Identity & multi-team role enforcement
│   │   │   └── idempotencyGuard.ts # Request hashing & duplicate prevention
│   │   ├── services/
│   │   │   └── operationService.ts # Core service with atomic OCC transactions
│   │   └── routes/
│   │       ├── operationsRouter.ts # REST API for directives with OCC checks
│   │       ├── teamsRouter.ts    # Teams & memberships
│   │       ├── usersRouter.ts    # Identity & persona switching
│   │       ├── eventsRouter.ts   # SSE subscription endpoint
│   │       └── outboxRouter.ts   # Worker health and DLQ inspection
│   └── tests/
│       └── critical_operations.test.ts # Vitest suite for OCC, Idempotency & Outbox
└── client/
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── App.tsx               # Main operational hub with view toggles
        ├── api.ts                # API client with OCC & Idempotency handling
        ├── types.ts              # Frontend domain interfaces
        ├── hooks/
        │   └── useRealtimeStream.ts # Server-Sent Events live sync hook
        └── components/
            ├── Navbar.tsx        # Top bar with persona switcher & live status
            ├── MetricsOverview.tsx # Operational pulse workload metrics
            ├── CommandQueueTable.tsx # Dense operational table with SLA countdowns
            ├── WorkflowMatrixBoard.tsx # Visual board grouped by workflow status
            ├── DirectiveDrawer.tsx # Directive detail, approvals, audit log & notes
            ├── CreateDirectiveModal.tsx # Directive creation & idempotency tester
            ├── ConflictResolutionModal.tsx # 409 OCC collision reconciliation modal
            └── OutboxInspectorModal.tsx # Worker queue & DLQ health inspector
```

---

## 🎯 Architecture Discussion Points (For Assessment Review)

During review, the following core architectural choices can be demonstrated:
1. **How the system handles failure**: Network disconnects trigger auto-reconnection via SSE; outbox jobs handle downstream failures through exponential backoff retries and dead-lettering; mutating failures rollback completely without partial state mutations.
2. **What assumptions were made**: Assumed organizations with hundreds of employees benefit most from clear accountability (immutable audit logs, explicit ownership claiming) rather than freeform unassigned queues. Assumed high-stakes actions require segregation of duties.
3. **What would change if the company scaled to 100x**:
   * Migrate SQLite to PostgreSQL with read replicas and PgBouncer connection pooling.
   * Shift the Outbox Worker to a partitioned Kafka/RabbitMQ consumer group for multi-node worker pools.
   * Introduce Elasticsearch or OpenSearch for full-text search across millions of historical requests.
