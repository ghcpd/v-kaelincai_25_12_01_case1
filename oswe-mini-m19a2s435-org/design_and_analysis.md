# Design and Analysis for Greenfield Replacement

## 1. Clarifications & Missing Data / Assumptions

Missing Data (explicit list):
- Production load: QPS, peak loads, expected events per second for normal and peak times.
- Latency budget for synchronous extraction and external normalization (SLA expectations).
- External normalization service SLA (timeout thresholds, error rates, retry behaviour).
- Persistence: whether idempotency must be durable across restarts (Redis, DB) or memory is acceptable.
- Security and compliance: PII rules, encryption at rest, PI identifiers to be masked in logs.
- Authz/authn mechanisms for API access (OAuth, mTLS, API Key).
- Transaction boundaries: side effects that must be compensated on failure (e.g., billing, seat allocation).
- Observability: logging/metrics ingestion endpoints, sample dashboards, and tracing sample.
- Test harness availability and sandbox of remote services.

Assumptions made for the design:
- The extraction function must be safe to call within a UI flow; heavy external operations are optional.
- Idempotency must be durable and survive restarts — we’ll recommend Redis-backed idempotency store.
- External normalization is optional; if used, it must be invoked with timeouts and fallbacks; circuit breaker patterns apply.
- No direct DB transaction across external service calls; prefer event-driven or Saga/outbox for side effects with compensation.
- The system must be deployed as stateless microservice(s) with sidecars for circuit-breakers or external libs.
- Logging must be structured JSON with requestId and masked sensitive fields.

### Data Collection Checklist
- [ ] Code artifacts: existing libs, event shape and test harnesses (we have `issue_project` and `oswe-mini-prime`).
- [ ] Existing logs and failure snippets (collect `logs/` from production and test runs).
- [ ] Traffic profile: sample payloads at p50/p95/p99, request rates/time windows.
- [ ] DB snapshots or schema for idempotency store and audit/log tables.
- [ ] External service metrics: latency/availability/error rate.
- [ ] Test coverage and flaky test history.
- [ ] SLO/SLA requirements for latency, error budget, and availability.
- [ ] Secrets and keys handling for external services and encryption-at-rest.

## 2. Background Reconstruction (Inferred from assets)

From `issue_project` and `oswe-mini-prime` projects we infer:
- Legacy function `getActionLabel` extracts UI `data-action` labels from DOM events but ignored legacy `srcElement` so IE11 compatibility fails.
- Post-change (Project_B_PostChange) includes an evolved `getActionLabelV2` with:
  - Search across `event.target`, `event.srcElement`, `event.currentTarget`.
  - Dataset handling via `toDatasetKey`.
  - Optional external normalization service for label normalization.
  - Idempotency using an in-memory Map, which may be replaced by a persistent cache.
  - Circuit-breaker and timeout handling for external calls.
  - Saga logic to handle side effects and compensation.

Boundaries / Dependencies:
- Aggregator/consumers expect a deterministic label value per request.
- External normalization service provides domain normalization (e.g., uppercasing, canonical IDs).
- Side-effectful operations (e.g., seat assignment, reservation writes) should employ Saga/compensation.

Uncertainties:
- Persistence durability and how many unique requestIds may exist.
- Whether clients always pass `requestId` for idempotency or server must generate/return one.
- Security/authorization for calling external services in production.

## 3. Current-State Scan & Root-Cause Analysis

Category | Symptom | Likely Root Cause | Evidence / Needed Evidence
---|---:|---|---
Functionality | IE11 fails to read label | Implementation only used `event.target` and ignored `event.srcElement` | `issue_project/compatActionLabel.js` shows `event.srcElement` not considered. Tests failing in `tests/compatActionLabel.test.js`.
Performance | External normalize can be slow, leading to delayed UI responses | Synch blocking external calls with no timeout/backoff | `Project_B_PostChange` external calls aware of timeout but not always applied; tests simulate slow/timeout scenarios.
Reliability | Non-durable idempotency store can lead to multiple side effects on restart | Memory Map used; no external persistence | `idempotencyStore` Map in `index.js` (Project_B_PostChange)
Security | Logs may contain PII or requestIds without masking | Logging writes entire objects with `requestId` sometimes not masked | `safeLog` currently masks requestId but may not cover all sensitive fields; requirement gaps exist.
Maintainability | Logic mixed across modules; duplicate implementations across projects | Minimal separation between core extractor and side-effect orchestration | `getActionLabel` vs `getActionLabelV2` duplication; need modularization and proper boundaries.
Cost | Frequent external calls with no caching or rate-limiting can be expensive | No cache for normalized labels and no rate-limiting | External normalization calls performed per request unless idempotency prevents re-call for same requestId only.

### High-Priority Issues and Hypotheses
1. IE11 Compatibility Bug (High):
   - Hypothesis: Code only checks `event.target` and `event.currentTarget`, ignoring `event.srcElement`, causing events from older browsers to miss attribute lookups.
   - Validation: Run failing tests; reproduce IE11-style events using `srcElement` in test harness.
   - Fix path: Add `srcElement` to precedence or normalize event shape before extraction.

2. Idempotency Durability (High):
   - Hypothesis: In-memory idempotency store leads to duplicate side effects after process restart or scale-out.
   - Validation: Simulate restart or concurrent duplicate requests; observe calls to external service and side effects.
   - Fix path: Persist idempotency keys in Redis (with TTL) or DB-backed dedup table; update code to check persistent store.

3. External Normalization Reliability (High):
   - Hypothesis: External service can fail or be slow; if synchronous, will cause UI timeouts and cascading failures.
   - Validation: Use mock to emulate latency, failure rates; measure response and error surface.
   - Fix path: Add retries with exponential backoff and circuit breaker with fallback to local normalization.

4. Observability & Auditing (Medium):
   - Hypothesis: Insufficient structured logging and request correlation makes RCA difficult.
   - Validation: Inspect logs for requestId and masked sensitive fields; test logs for structured JSON.
   - Fix path: Apply structured logging standard; include request ID and event fingerprints; implement audit logs in append-only store.

5. Cost/Rate Limiting (Medium):
   - Hypothesis: No caching on normalized labels leads to repeated external calls for same labels, incurring cost.
   - Validation: Simulate repeated requests and inspect external calls count.
   - Fix path: Add LRU cache for normalized labels with TTL and rate limit external calls.

## 4. New System Design (Greenfield Replacement)

### Target State: Capability boundaries
- API Layer: Accept event payloads and return normalized label; quick path for non-normalized responses.
- Extractor Service: Pure function or library that determines target element and extracts raw label(s).
- Normalization Service: Optional microservice to canonify labels; called with timeout and pattern.
- Idempotency Store: Durable Redis-backed store keyed by requestId for dedup and idempotency.
- Saga/Outbox Service: For long-running side effects or operations requiring consistency. Use outbox pattern and a queue (e.g., Kafka, RabbitMQ) for reliable delivery with idempotency.
- Observability & Security: Structured logging, tracing (OpenTelemetry), metrics (Prometheus), RBAC/MTLS for services.

### Service Decomposition
- ui-event-proxy: HTTP endpoint that receives event payloads, returns label; performs extraction and optional normalization.
- normalization-service: optional microservice for domain normalization (async or sync with timeout).
- idempotency-store: Redis or database cluster.
- saga-processor: background process that picks outbox records and runs side-effects; supports compensation.

### Unified State Machine
- Implement single deterministic lifecycle: INIT -> IN_PROGRESS -> SUCCESS/FAILURE -> COMPENSATING -> COMPENSATED
- Each API call attaches a `requestId` and logs state transitions.

### Idempotency / Retry / Timeout / Circuit-breaker Strategies
- Idempotency: Persist `requestId` -> label mapping with TTL in Redis at SUCCESS. For requests without `requestId`, generate a UUID and return it for follow-up idempotency.
- Retry: For external normalization attempts use exponential backoff with jitter; max attempts cap (e.g., 3 attempts).
- Timeout: Enforce timeouts for external calls (e.g., 200–500 ms depending on SLA) and fallback to local normalization.
- Circuit Breaker: Implement CB that opens after N consecutive failures and returns a safe fallback (raw label) while open.
- Compensation: Saga/outbox to handle side-effectful operations with an explicit compensation function and a retry/ttl for failures.

### Architecture & Data Flow (ASCII)

Client(UI) -> ui-event-proxy (HTTP) -> Extractor -> (optionally call) Normalization -> Return label
                                                |                               ^
                                                v                               |
                                         Write audit/event to Outbox -> Saga -> side effects


Key Interfaces/Schemas
- Request (POST /v1/label)
  - requestId: string (optional) - unique idempotency key
  - event: object
    - target, srcElement, currentTarget, dataset
  - attribute: string (optional, default 'data-action')
  - metadata: object (optional) - client, origin, auth

- Response
  - requestId: string
  - label: string
  - normalized: boolean
  - elapsedMs: number

Field Constraints
- requestId: GUID <= 64 chars
- attribute: string <= 100 chars, ASCII only; must match pattern /^[a-z0-9-]+$/
- label: string, max 256 chars


### Migration and Parallel Run Plan
- Phase 0: Deploy `ui-event-proxy` behind feature-flag/route; keep legacy function in place.
- Phase 1: Start redirecting a small % of traffic to new proxy (shadow traffic) with dual-write to legacy process and outbox for reconciliation.
- Phase 2: Monitor normalized label distribution against legacy outputs; validate v2 correctness via `compare_report.md` metrics (p50/p95 latency, error rates, retry counts).
- Phase 3: Increase traffic percentage to 50%, then 100%; maintain dual-write for auditing/backfill.
- Cutover: Switch DNS / load-balancer target to new proxy; disable legacy path after full validation.
- Rollback: Re-enable legacy endpoint in LB if SLOs are violated; maintain backward compatibility with requestId.

Backfill
- If v2 is the canonical source of normalized labels, run a backfill job that scans legacy audit records and replays them through v2 extraction; use idempotency keys to avoid duplicates.

## 5. Testing & Acceptance

Five repeatable integration tests derived from crash points/risks:

1) Compatibility: Legacy srcElement path
- Target issue: Browser compatibility for IE11 event shapes.
- Preconditions: `event` contains `srcElement` with `getAttribute` returning label.
- Steps: POST to API with `srcElement` payload.
- Expected: Response contains label 'legacy-submit'.
- Observability: Logs include requestId, elapsedMs, `extracted_label` event.

2) Idempotency: Duplicate Request Prevention
- Issue: duplicate side-effects caused by retry.
- Preconditions: Request with `requestId`=uuid; first call invokes external normalization and is successful.
- Steps: Repost same requestId.
- Expected: second call returns the previously stored label; external normalization is not invoked again.
- Observability: Log event `idempotent_hit` and external service record count unchanged.

3) Retry with Backoff: Transient external failure
- Issue: external transient error
- Preconditions: external service fails first attempt then succeeds.
- Steps: Call API; ext service fails then succeds.
- Expected: API returns normalized label; external called multiple times up to the success attempt.
- Observability: Retry counts and timing metrics reflect backoff and success.

4) Timeout/Circuit-Breaker: Slow external -> fallback
- Issue: slow external, circuit breaker open
- Preconditions: external service is slow and triggers timeout; circuit breaker should open after threshold.
- Steps: Repeated calls to cause N failures.
- Expected: circuit opens; subsequent calls return raw label and external not invoked.
- Observability: circuit_open logs, `external_normalize_error` logs, fallback responses.

5) Saga compensation: Side-effect fails -> compensation occurs
- Issue: side-effect after label extraction fails
- Preconditions: Side-effect (e.g., allocate seat) fails, compensation must run
- Steps: Simulate side-effect throw, verify compensation is called
- Expected: Saga returns compensated=true; side-effect is not left inconsistent.
- Observability: Saga traces in logs; outbox entries for both try and compensation.

Acceptance Criteria (Given-When-Then / SLOs)
- Given: A well-formed event POST request with requestId
- When: System receives event
- Then: Within 200ms (p95), returns label and audit/log written; external normalization is called only when circuit closed; idempotent requests return cached value.

Quantified SLOs:
- Latency: p50 < 15ms, p95 < 200ms for extraction without external calls; p95 < 1s for extraction with normalization.
- Error budget: < 0.1% 5xx.
- Idempotency: 100% dedup within TTL window (consistent across restarts).


# Audit & Structured Logging Schema
- Use JSON logs with top-level fields: timestamp, level, service, requestId (masked), event, eventPayloadHash, lifecycle, elapsedMs, externalAttempt, success.
- Masking: `requestId` must be redacted when logged externally; PII fields should be excluded or hashed.


## 6. One-click Test Fixture
- `run_tests.ps1` / `run_tests.sh`: runs `node --test` across tests; collects metrics to `results/` and logs to `logs/`.

