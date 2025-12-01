# Design & Analysis: Browser Action Label Replacement (Greenfield)

## 1) Information clarification & data collection checklist

Required artifacts to validate my analysis (what to collect):

- Production/Canary logs near event processing points containing `requestId` and timestamps and raw event shapes.
- End-to-end request traces: client -> backend -> side effects for a few representatives to show timings (e.g., OpenTelemetry spans).
- Traffic distribution by browser/user-agent from analytics for discovery of legacy clients (IE11/legacy Edge): number of events and success/failure percent.
- Access to the UI handlers that call `getActionLabel` to map event flows (code calling `getActionLabel`), front-end asset versions, and bundle distribution.
- DB snapshots if side effects are stored: to see idempotency issues or duplicate writes.
- Error budgets and SLOs currently used by the product (latency thresholds, success rate SLOs, business impact metrics).
- Any existing circuit-breaker metrics or external dependency timeouts and retry logic.

Checklist to collect (code, logs, flow, DB snapshots):

- repo: `issue_project` code, tests (done) and any production repo using this code.
- logs: retrieve production logs for the endpoints that use the label extraction.
- traffic: user-agent distribution (to quantify the need for IE support)
- DB: if actions result in writes, snapshot or event logs for potential duplicate entries from repeated label reads.
- Tests: run the function’s tests both pre-change and post-change to capture behavior.

Assumptions (short-term):

- Event handler `getActionLabel` is used by client-side click handlers to route or process specific actions.
- There are no centralized servers that rewrite event shapes; extraction logic only runs on clients.
- Idempotency across action handling is desirable to avoid duplicate side-effects.
- External normalization service (optional) may exist in the real system to standardize action labels across different clients (we simulated it).


## 2) Background reconstruction — inferred behavior and dependencies

- Business background: The system extracts a semantic label (e.g., 'data-action') from DOM click events, used by UI event handlers to dispatch actions. Legacy browsers (IE11) report `srcElement` not `target`; modern browsers use `target`.
- Core flow: On click, call `getActionLabel(event, attribute)`; extract value via `getAttribute` or dataset and return the label; then the label is used to route or trigger a side effect (e.g., submit form, create request).
- Boundaries and dependencies:
  - Inputs: DOM `event` object (shapes vary by browser), optional `requestId`, attribute name.
  - Outputs: action label string.
  - External dependencies: (optionally) label normalization service, analytics, database writes downstream.
- Uncertainties:
  - The full path from label to write path or external effect: is label used in only UI logic or backend call? Not fully known.
  - Whether idempotency is desirable at label extraction or at action execution level: we assume action execution needs idempotency.
  - How state and side effects are recorded (DB schema) — not given.


## 3) Current-state scan & root-cause analysis table

| Category | Symptom | Possible root cause | Evidence/Needed evidence |
|---|---|---|---|
| Functional correctness | Tests fail for legacy IE style events | `getActionLabel` only inspects `event.target` and `event.currentTarget`; ignores `event.srcElement` | Tests in `tests/compatActionLabel.test.js` and code; unit test failure logs. Also production UA logs showing IE clients failing event handlers. |
| Performance | Slight increase in runtime when external normalization is used | External calls & retries cause latency; synchronous or blocking wait in current code causes higher p95 | Runtime analysis from tests; need production tracing. |
| Reliability | Potential duplicate operations if event handlers re-run due to retry/timeouts | Lack of idempotency mechanism for side effects; extraction is stateless and may cause non-deduplicated writes | Need DB logs to confirm duplicates; store/queue logs for writes. |
| Security | No immediate vulnerabilities found; user-controlled attribute access could leak sensitive keys? | If extract stores raw values directly to logs or server, could expose sensitive fields; need to redact | Audit logs for sensitive attributes; currently we redact requestId. |
| Maintainability | Tiny function with accidental omission of IE fallbacks | Old code likely not covered by test cases in CI for legacy browsers; tests catch it but code not fixed in main branch | Tests and code show intended fix in KNOWN_ISSUE.md. |
| Cost | Using remote normalization or adding external dependencies increases runtime & cost | If external normalizer is called per event for frequent UI actions, it may increase requests and backend load | Monitor metrics to detect spike in downstream calls. |


High-priority item: legacy compatibility bug causing feature regressions for IE clients. Hypothesis chain & validation:

- Hypothesis: `getActionLabel` doesn't inspect `srcElement` (false-negative for legacy events) causing handlers not to dispatch actions.
- Validation: Unit tests in `issue_project` fail for `srcElement` event shape; implementing a fallback to `srcElement` causes tests to pass. Additionally, production UA logs showing IE clients exhibit zero action events.
- Fix path: Add a robust event shape handler `findTarget(event) -> event.target || event.srcElement || event.currentTarget` and unify extraction logic to read attribute or dataset; tests pass and production use-cases covered.


## 4) New System (Greenfield) — Goals & Capabilities

**Goal**: Replace the old in-place code with a greenfield, resilient, and auditable `getActionLabelV2` library/service that:
- Handles all event shapes (target, srcElement, currentTarget), dataset, attributes, and property fallbacks.
- Is asynchronous, supports external normalization, idempotency, and optional offloading to services.
- Exposes standardized, schema-validated responses with structured logs.
- Provides resilience patterns: idempotency, retries with exponential backoff (for transient dependencies), timeouts, and circuit-breaker behavior.
- Supports compensation for failed side-effects and auditing.

**Service & capability boundaries**:
- Capability: Deterministic label extraction and idempotent label-handling operations that are safe for downstream invocation.
- Responsibility: Normalize and return label, not the downstream action execution; provide hooks for side effects or external normalization.
- Non-goal: Implementing business-side side effects such as DB writes or external API calls (only simulated/hooked in through adapters).

**Design decisions**:
- Provide a library that can be consumed in SDKs and at server-side endpoints if necessary OR operate as an optional remote normalization service.
- Use idempotency store (Redis or a small in-memory cache) to enforce single processing per requestId.
- Implement an optional external normalize function that can be synchronous or async, respect timeouts, and be wrapped by a circuit breaker.
- Implement Saga pattern to support compensation when downstream side effects fail.


## 5) Architecture & Data Flow (ASCII diagram)

Legend: Client -> (v2 extractor) -> external normalize (optional) -> action dispatcher -> side effect (DB, API)

Client (frontend click handler)
  |
  v (event object)
getActionLabelV2 (library)
  |
  |-- internal extraction (target/srcElement/dataset)
  |-- idempotency (requestId)
  |-- optional external normalize (with timeout / circuit-breaker)
  |
  v
Normalized label --> (delivered to action dispatcher; side effects occur) -> Saga/compensation if needed


## 6) API / Schema / Validation

- Request object (JS event-like shape):
{
  event: {
    target?: DOM-like object,
    srcElement?: DOM-like object,
    currentTarget?: DOM-like object,
    ... extra props
  },
  attribute: string (optional, default: 'data-action'),
  requestId?: string (unique id for idempotency)
}

- Response: { label: string }

Field constraints / validation logic:
- `attribute` must be a non-empty string.
- `event` must contain at least one of: `target`, `srcElement`, `currentTarget` or an adapter-supplied additional target.
- `requestId` if present should be a unique token (UUID recommended), stored/redacted in logs.

Validation examples:
- JSON representation of `event` should be sanitized: property `dataset` is an object with keys alphanumeric.


## 7) Migration & Parallel strategy

- Initial rollout: Publish `getActionLabelV2` and keep v1 in place.
- Shadow/dual-run: Add a flag in the client to send the extracted label back to servers (or log locally) and compare results between v1 and v2. Use event `requestId` to map pairs; run this for ~2-4 weeks depending on UA frequency.
- Dual-write: For backend pipelines, write to both v1-based and v2 normalized flows in a shadow mode (no user-visible change) while gathering metrics.
- Read/write switch: Once v2 error rates are low and compatibility is validated, shift traffic to v2 for active flows; keep v1 in fallback mode for an extra week.
- Data migration: No DB changes are required for label format; if we standardize on uppercase or normalized labels, consider a background job to transition data format.
- Rollback: Use feature flags to turn off v2 and re-enable v1. All data writes should be idempotent to avoid duplicate effects.


## 8) Testing & Acceptance (auto-generated scenarios)

We generate >=5 integration tests covering key risk points and SLOs. Each test includes Target issue, Precondition/Data, Steps, Expected outcomes, Observability assertions.

1) Target: `srcElement` fallback
- Preconditions: Event with `srcElement.getAttribute('data-action') === 'legacy-submit'`, no `target`.
- Steps: call `getActionLabelV2(event, 'data-action')`.
- Expected: returns 'legacy-submit'.
- Observability: log `extracted_label` event with label, idempotency set.

2) Target: dataset fallback
- Preconditions: `srcElement` with `dataset.action == 'legacy-dataset-only'` and no `getAttribute`.
- Steps: call `getActionLabelV2`.
- Expected: returns 'legacy-dataset-only'.
- Observability: `extracted_label` log; `idempotency_set` if requestId provided.

3) Target: idempotency
- Preconditions: `target.getAttribute` returns 'modern-submit', `requestId` provided.
- Steps: call `getActionLabelV2` twice with the same requestId and an external normalization function.
- Expected: The first call invokes normalize, returns normalized label; second call returns same label and doesn't call normalize again.
- Observability: `idempotency_set` log on first call and `idempotent_hit` in second.

4) Target: retry/backoff + external transient failure
- Preconditions: external normalizer fails once and succeeds on second attempt with a short backoff retry wrapper.
- Steps: call `getActionLabelV2` with ext normalizer wrapper that retries.
- Expected: label returned after eventual success; external service called multiple times.
- Observability: `extracted_label` log and external service attempt metrics.

5) Target: timeout propagation & circuit-breaker path
- Preconditions: external normalizer slow or unresponsive; circuitBreaker open.
- Steps: call `getActionLabelV2` with `timeoutMs` small and `circuitBreaker.open=true`.
- Expected: v2 returns the raw label and does not call external service; logs `circuit_open`.
- Observability: `external_normalize_error` or `circuit_open` logs; no thrown exception; label fallback returned.

6) Target: Saga compensation on side-effect failure
- Preconditions: side effect fails after label is extracted.
- Steps: run saga with doWork() that fails and a compensationFn which sets a compensating flag.
- Expected: compensation executes and returns compensated result.
- Observability: event logs indicating compensation success.


## 9) Acceptance Criteria (Given/When/Then and SLO)

- Given a valid legacy `srcElement` event, when calling `getActionLabelV2`, then it returns the expected label and logs `extracted_label`.
- Given a mid-traffic spike, when normalization external service times out, then the system should still return label without fail and log `external_normalize_error`.
- SLO: 99.99% of label extractions complete successfully within 200ms (excluding optional external normalization). For core user flows requiring normalization, SLO p95 < 500ms, and retry counts under 3.


## 10) Improvements & Actionable changes (short-term)

- Implement in production a robust fallback `findTarget` (target, srcElement, currentTarget).
- Add idempotency key across requests (e.g., `requestId`) stored in a shared cache (Redis) with TTL matching business flows.
- Add (or make optional) client-side debouncing for clicked elements to avoid duplicate click side-effects.
- Normalization: Use external normalizer with TTL, circuit breaker, and retry policies.
- Saga & compensation for side-effect failure; publish events for audit and observation.
- Structured logs with JSON and unique request ID; redact PII fields.


## 11) Deliverables created

- `oswe-mini-prime/Project_B_PostChange` — new v2 implementation and tests
  - `src/index.js` — `getActionLabelV2` implementation
  - `src/stateMachine.js`, `src/saga.js` — support code
  - `mocks/api_v2.js` — mock external normalizer
  - `tests/test_post_change.js` — integration tests (>=5 scenarios)
  - `data/test_data.json` & `expected_postchange.json` — canonical test cases
  - `logs/log_post.txt` — structured logs from test runs
  - `results/results_post.json` — test metrics
- `oswe-mini-prime` root:
  - `run_all.sh` — run pre/post tests and gather outputs
  - `compare_report.md` — comparison & summary
  - `results/*` — aggregated results


## 12) One-command test fixture and usage

- To run everything (Windows Powershell):

```powershell
cd c:\chatWorkspace\oswe-mini-prime
bash run_all.sh
# or run the individual tests
cd Project_B_PostChange
node --test tests/test_post_change.js 2>&1 | tee logs/log_post.txt
```

This will run the pre-change test suite and the post-change suite and collect logs and results into `oswe-mini-prime/results`.


## 13) What's next

- If you'd like, I can replace the `getActionLabel` in the original project with a v1 adapter that calls `getActionLabelV2` behind a feature flag, then start a shadow-run harness in CI. 
- Alternatively, we can build a microservice for live normalization if you need backend normalization for auditing and analytics.



---

This file is auto-generated by the greenfield design exercise. For finer-grained production rollout and performance testing, we recommend including the production traffic distribution and load tests under identical latency and concurrency conditions.
