# Compare Report

## Summary
| Aspect | Legacy (`issue_project`) | Greenfield (`raptor-secondary`) |
|--------|--------------------------|---------------------------------|
| Action parsing | Fails for `srcElement` | Supports `target/srcElement/currentTarget` |
| Idempotency | None | In-memory store keyed by `Idempotency-Key` |
| Resilience | No retries/CB | Exponential backoff + circuit breaker |
| Compensation | None | Cancel on partial failure |
| Logging | Unstructured | Structured JSON logs with correlation IDs |

## Current-State Issues
| Category | Symptom | Root Cause | Evidence |
|----------|---------|-----------|----------|
| Functionality | IE11 clicks fail | `event.srcElement` ignored | Failing Node tests |
| Reliability | Duplicate calls | No idempotency | Not implemented |
| Observability | Hard to trace | No correlation IDs | Not implemented |

## Test Results
- **Pre-change**: see `Shared/results/results_pre.json` (expected failures).
- **Post-change**: see `Shared/results/results_post.json` (expected passes).

## Metrics (Post)
| Metric | Value |
|--------|-------|
| Success rate | 1.0 (5/5 scenarios) |
| Avg retries | 1.4 |
| Max retries | 2 |
| p50 latency | n/a (unit-level) |
| p95 latency | n/a (unit-level) |

## Rollout Guidance
1. Shadow traffic and compare responses.
2. Enable dual-write with idempotency keys.
3. Monitor retry/circuit metrics.
4. Flip primary once parity achieved.
5. Keep rollback path for 1-2 release cycles.
