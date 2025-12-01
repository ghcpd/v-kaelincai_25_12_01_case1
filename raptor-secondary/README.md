# Raptor Secondary (Greenfield Replacement)

## 1. Clarifications & Assumptions
- Domain: appointment actions triggered by UI click events carrying `data-action` labels.
- Legacy issue: IE11 events expose `srcElement` only; action parsing fails → appointments not created.
- No real DB/queue; in-memory stores used for demo/testing.
- Idempotency uses an in-memory store keyed by `Idempotency-Key`.

## 2. Background Reconstruction
- Core flow: UI click → `getActionLabel` → action router → appointment create call to external calendar provider.
- Boundaries:
  - **Ingress**: event handler parsing `data-action`.
  - **Domain**: appointment state machine (`init → in_progress → success|failure`).
  - **Egress**: calendar provider, outbox (event bus), audit logs.
- Dependencies: calendar provider API, logging, idempotency store.

## 3. Current-State Scan (Legacy)
| Category | Symptom | Likely Root Cause | Evidence / Needed |
|----------|---------|------------------|-------------------|
| Functionality | IE11 clicks no-op | `getActionLabel` ignores `srcElement` | Failing tests `compatActionLabel.test.js` |
| Reliability | No idempotency | Replays call provider multiple times | Missing idempotency store |
| Observability | Unstructured logs | No correlation IDs | N/A |
| Resilience | No retries/CB | Transient provider failures bubble up | N/A |
| Maintainability | Single function, no tests for states | Tight coupling | Minimal tests |

## 4. Target Architecture (Greenfield)
```
[UI Event]
   |
   v
[action_label extractor]
   |
   v
[AppointmentService]
   |--(idempotency store)
   |--(state machine)
   |--(retry + circuit breaker)
   |--(outbox / audit log)
   |
   v
[Calendar Provider]
```

**Service decomposition**
- `action_label`: parses events (target/srcElement/currentTarget).
- `AppointmentService`: orchestrates state, idempotency, retries, compensation.
- `Outbox`: transactional outbox for follow-up events.
- `CircuitBreaker` + `retry_with_backoff`: resilience layer.

**State Machine**
- `init → in_progress → completed|failed`.
- Crash points: missing idempotency, provider timeout, outbox failure, circuit open.

**Resilience**
- Idempotency key required; returns stored result on replay.
- Retries with exponential backoff (default 3 attempts).
- Circuit breaker opens after N consecutive failures (default 3, 5s cool-down).
- Compensation: `cancel_appointment` if downstream failures after creation.

**Structured logging**
- JSON logs with `{correlation_id, idempotency_key, action_label, retries, appointment_id}`.
- Sensitive fields masked.

## 5. Migration & Parallel Run
- **Read**: shadow traffic to new service; compare responses.
- **Write**: dual-write with idempotency keys; primary remains legacy until parity proven.
- **Backfill**: replay recent events with same idempotency keys to avoid duplicates.
- **Rollback**: flip traffic splitter; idempotency ensures safe replays.

## 6. Testing & Acceptance
Integration tests (see `tests/test_post_change.py`):
1. Healthy path (immediate success).
2. Retry with backoff + idempotent replay.
3. Timeout propagation + circuit breaking.
4. Compensation when outbox fails.
5. Legacy `srcElement` extraction.

**Acceptance criteria**
- Idempotent replay returns stored result (no extra provider calls).
- Retries capped; error `retry_exhausted` on failure.
- Circuit opens after threshold; subsequent calls short-circuit.
- Compensation invoked on partial failure.
- Logs contain correlation & idempotency IDs per request.

## 7. How to Run
```bash
# from raptor-secondary
./setup.sh
./run_tests.sh
# one-click (legacy + new)
./Shared/run_all.sh
```

## 8. Deliverables
- `src/`: implementation (action_label, service, idempotency, circuit, retry, outbox).
- `mocks/`: `FakeCalendarProvider` with scenarios.
- `data/`: `test_data.json`, `expected_postchange.json`.
- `tests/`: integration tests, results/write hooks.
- `logs/log_post.txt`: structured logs.
- `results/results_post.json`: per-scenario outcomes.
- `Shared/`: cross-project scripts, test data, reports.

## 9. Limitations
- In-memory stores (non-persistent), single-process demo.
- No real HTTP API; orchestration shown as module calls.
- Simplified circuit breaker and retry logic.
