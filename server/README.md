# Task 1: Backend Usage Metering Service

A high-performance, fault-tolerant telephony usage metering service built with **Node.js, Express, PostgreSQL, and Prisma**. The service accepts webhook call events from telephony providers, validates cryptographic signatures, handles duplicate/out-of-order/late delivery, enforces monthly account caps, and provides authenticated usage APIs with automated background retries and reconciliation.

---

## 🚀 Quick Start (Docker)

To start the entire backend stack (PostgreSQL, migrations, database seeding, API, background retry worker, and webhook simulator):

```bash
cd server
docker compose up
```

This single command:
1. Boots PostgreSQL 17 on port `5432` with built-in health checks.
2. Applies Prisma migrations automatically (`callzo-migrate`).
3. Seeds default accounts (`acct_001` through `acct_010`) with configured caps (`callzo-seed`).
4. Starts the Express API server on port `3000` (`callzo-api`).
5. Launches the background retry worker (`callzo-worker`).
6. Starts the telephony webhook simulator (`callzo-simulator`), which executes the `--scenario all` test suite against the API.

### Sanity Check
Check API health:
```bash
curl http://localhost:3000/health
# Response: {"success":true,"status":"ok","database":"connected"}
```

---

## 🛠️ Architecture & Database Schema

The database schema is designed for correctness, auditability, and immutability:

1. **`accounts`**:
   - Stores account metadata and `monthly_cap_seconds` (integer seconds).
2. **`call_events` (Append-Only Event Store)**:
   - Raw immutable event log received from webhooks.
   - Unique constraint on `event_id` ensures delivery idempotency.
   - Indexed by `[account_id, call_id]` and `[account_id, event_timestamp]`.
3. **`calls` (Lifecycle State Machine)**:
   - Maintains the canonical lifecycle (`STARTED`, `ENDED`, `FAILED`).
   - Tracks duration, cost, destination country, and usage month attribution.
4. **`monthly_usage` (Pre-Aggregated Metering Ledger)**:
   - Aggregates billable usage per account and month.
   - Enforces unique constraint on `[account_id, month]`.
   - Stores integer units: `total_duration_seconds`, `total_cost_cents`, `actual_duration_seconds`, `excess_duration_seconds`, `excess_cost_cents`, `completed_calls`, `cap_seconds`, and `cap_exceeded_at`.
5. **`retry_jobs` (Persistent Queue)**:
   - Database-backed retry queue with `attempts`, `next_retry_at`, and status (`PENDING`, `PROCESSING`, `COMPLETED`, `DEAD`).
   - Employs PostgreSQL `FOR UPDATE SKIP LOCKED` for concurrent worker processing without race conditions.

---

## 📋 Key Design Decisions & Failure Behavior

### 1. Signature Verification
- Ingested at `POST /webhooks/calls`.
- Body is captured as raw bytes using `express.raw({ type: "application/json" })` before any JSON parsing.
- HMAC-SHA256 signature is verified in constant time using `crypto.timingSafeEqual` against the shared secret (`callzo_test_secret_change_me`).
- Requests with missing or invalid signatures are rejected immediately with `401 Unauthorized` before parsing payload JSON.

### 2. Idempotency & Deduplication
- Telephony networks frequently resend events. `call_events.event_id` is unique.
- Ingestion verifies uniqueness before insertion and handles concurrent race conditions via Prisma unique constraint collision (`P2002`).
- Duplicate events are logged and return `200 OK` with `{ duplicate: true }`, ensuring usage is never double-counted.

### 3. Out-of-Order Delivery (`call.ended` before `call.started`)
- Network delays can cause terminal events to arrive before start events.
- When `call.ended` arrives first, the service locks the call key via `pg_advisory_xact_lock`, upserts the `Call` record, applies duration/cost, and marks status as `ENDED`.
- When the late `call.started` event arrives later, it updates `started_at` without reverting or mutating the terminal status.

### 4. Late Events Policy (~35 Days in the Past)
- **Stated Policy**: Late-arriving events are bucketed into the **calendar month corresponding to their original `event_timestamp`**, rather than the reception time.
- **Rationale**: Telephony billing models require calls to be metered against the billing plan and caps active at the moment the call took place. Retroactive events update that historical month's aggregate and record excess if that month's cap is crossed. This maintains an auditable, replayable ledger without corrupting current month billing metrics.

### 5. Monthly Cap Enforcement & Boundary Behavior
- **Strategy**: **Hard Billable Cap with Soft Excess Tracking and Proration**.
- The cap is hard for billable usage: counted usage never exceeds
  `monthly_cap_seconds`. It is soft for ingestion: calls are accepted and
  excess usage is retained for audit and reporting rather than rejected.
- When an account's usage is below the cap, calls are 100% billable.
- When a call crosses the monthly cap boundarypartway through:
  - The call's duration is split into **billable duration** (up to cap) and **excess duration** (beyond cap).
  - The call's cost is prorated: $\text{billable\_cost} = \text{round}\left(\frac{\text{cost} \times \text{billable\_duration}}{\text{duration}}\right)$.
  - Excess duration and excess cost are recorded in `monthly_usage` for auditing and overage reporting.
  - The crossing call is partially billable and partially excess; it is not rejected.
  - `cap_exceeded_at` is recorded when the first excess usage is applied.
  - Subsequent calls within that month have `0` billable duration, with 100% of duration and cost tracked in excess fields.
- The webhook response remains an accepted event response. Account usage
  consumers can detect the cap through `capExceededAt`, `excessDurationSeconds`,
  and `excessCostCents` in the authenticated usage APIs.

### 6. Background Retry Worker
- Webhook events are queued into `retry_jobs`.
- A retry job is the normal asynchronous processing queue record; its creation
  does not indicate a failure. Successfully processed events transition to
  `COMPLETED`.
- Background worker polls using `FOR UPDATE SKIP LOCKED` to lock and claim jobs atomically.
- **Exponential Backoff**: $5\text{s} \times 2^{(\text{attempt} - 1)}$ (5s, 10s, 20s, 40s, 60s max).
- After 5 failed attempts, jobs transition to `DEAD` for engineer inspection and dead-letter monitoring.

### 7. Reconciliation Step
- Triggered on demand via `npm run db:reconcile [YYYY-MM]`.

- Recomputes usage totals directly from raw, immutable `call_events` using a clean, chronological event loop.
- Deduplicates events by arrival time, prioritizes initial terminal outcomes (e.g. `CALL_FAILED`), and recalculates exact billable versus excess usage.
- Replaces drifted aggregates with guaranteed ground-truth numbers while maintaining exact boundary proration.

---

## 🔒 Authenticated API & Optimizations

- **JWT Authentication**: `Authorization: Bearer <token>` required on `/api/accounts/*`.
- **Token Generation**: `POST /api/auth/token` with `{ "adminKey": "callzo_admin_key_change_me" }`.
- **Single-Query Optimization**: `GET /api/accounts/:id/usage` retrieves account and monthly usage in a single relational database query, halving database latency.
- **N+1 Prevention**: `GET /api/accounts?include_usage=true&month=YYYY-MM` fetches accounts with pre-joined monthly usage in a single query, preventing N+1 client API loops.
- **Sorting & Filtering**: Full server-side pagination with `page`, `limit`, `search`, `sort_by` (`accountId`, `monthlyCapSeconds`, `createdAt`), and `sort_dir`.

---

## 🧪 Testing

Run the automated test suite:
```bash
npm test
```
Runs unit tests covering:
- Exact boundary usage allocation and cost proration.
- Fully excess call handling.
- Input validation (event types, account IDs, non-negative integers, missing fields).

Run integration simulation:
```bash
docker compose exec api node scripts/simulate.js
```
Run this from the `server/` directory after the stack is healthy. Running the
script inside the API container is intentional: it uses the same
`DATABASE_URL` as the API and worker, avoiding a host `.env` database mismatch.
The simulation covers normal, duplicate, out-of-order, late, malformed,
bad-signature, and cap-burst scenarios.

For a clean end-to-end run against the provided simulator:
```bash
docker compose down -v
docker compose up --build -d
docker compose logs simulator
```
The simulator is ARM64-only; follow the emulation setup in the repository
root README when running on an AMD64/x86-64 Docker host.
Simulates all 7 telephony scenarios: `normal`, `duplicate`, `out_of_order`, `late`, `malformed`, `bad_signature`, and `cap_burst`.
