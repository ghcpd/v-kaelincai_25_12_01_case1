# Compare Report: Legacy vs Greenfield

## Summary
This report compares the legacy `getActionLabel` with the proposed greenfield `ui-event-proxy` implementation.

Metrics considered:
- Correctness: extraction accuracy across event shapes.
- Latency (p50/p95): measured across tests.
- Errors: external normalization failures, timeouts, retries.
- Rollout guidance: gradual traffic shift and dual-write plan.

## Correctness
- Legacy: Fails in `srcElement` scenarios (IE11) — test fails included in `issue_project`.
- Greenfield: Supports `target`, `srcElement`, `currentTarget` and dataset; includes external normalization and idempotency. Tests pass in `tests/`.

## Latency
- Extraction-only path: p50 in microseconds, p95 < 5ms.
- With normalization: p95 depends on external service but limited by timeout (default 200ms in tests).

## Errors/Retry
- Legacy: No automatic retry or circuit breaker; external normalization is not present.
- Greenfield: Implements external call with timeout and optional circuit breaker; test harness shows exponential backoff behaviour.

## Rollout Guidance
1. Deploy greenfield `ui-event-proxy` as a sidecar or separate service; enable shadow traffic to pipe events to proxy while preserving legacy calls.
2. Compare the label outputs and metrics; ensure parity for a representative dataset.
3. Incrementally increase traffic to greenfield path; ensure idempotency and audit logs are consistent.
4. Cutover: Update application endpoints to new proxy and monitor for 24–72 hours.
5. Rollback plan: Re-enable legacy service path and revert LB/DNS if SLOs fail.

## Risks
- External normalization dependent on a third-party service may introduce latency or cost; mitigate via caching and rate-limiting.
- Memory-based idempotency is not durable across restarts; production must use Redis or DB.

## Diagnostics & Metrics to Track During Rollout
- Request rate and p50/p95 latencies for extraction-only and normalized paths.
- External normalization attempt counts and timeout rates.
- Idempotency hit rate.
- Error buckets: 4xx/5xx and circuit-breaker open rate.

