# Compare Report: Pre vs Post

This file is a template to compare the legacy system vs the proposed greenfield replacement.

Metrics to gather:
- Correctness: pass/fail by test case
- Latency: p50/p95 request latency
- Retries: count of retries per operation
- Idempotency pass/fail
- Errors/Exceptions

Example summary table:

| Metric | Legacy | Replacement | Notes |
|---|---:|---:|---|
| Unit tests pass | 80% | 100% | New fallback fixes IE11 issues |
| p95 latency (ms) | 150 | 120 | Simplified service reduces overhead |
| Retries | 5% | 0.5% | Outbox + idempotency reduces duplicates |

Rollout guidance: start with shadow traffic + dual-write, enable read-from-backend feature flag, failover to legacy if critical thresholds exceeded.
