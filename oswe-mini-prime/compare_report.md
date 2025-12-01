# Compare Report (Pre vs Post Change)

This document summarizes correctness diffs, latency p50/p95, retries, and rollout recommendations between `issue_project` (pre-change) and `Project_B_PostChange` (post-change) when run in the test harness.

TODO: After running tests, populate details:

- Correctness: Which tests pass vs fail
- p50/p95: Compare timings from `results_pre_test_output.txt` and `results_post_test_output.txt`
- Error & Retry Summary: Count of transient errors, forced retries
- Gray release suggestions: start with shadow traffic, collect telemetry.
## Summary

- Correctness: Pre-change project had 0/2 passing tests (both legacy bot-handling failed). Post-change project has 6/6 passing tests including legacy paths, idempotency, retry/backoff, circuit breaker, and compensation.
- Performance: Post-change tests runtime ~285ms (multiple scenarios) vs pre-change ~76ms. The extra time is due to simulated external normalizer and retries. Critical path p50/p95 from logs can be computed from `results` files.
- Errors & Retries: Post change included a test where the external normalizer failed once before succeeding (2 attempts). Timeout scenario logged external_normalize_error (timeout). All external failures did not escalate to process-level errors.

## Recommendations

1. Start rollout in shadow/dual-write mode: send 5-10% traffic to the new v2 extractor while keeping existing flows unchanged.
2. Collect metrics for extraction success rate, retry counts, latency p50/p95, idempotency hits, circuit-breaker opens, and compensation events.
3. If metrics stable for 1 week and error rates under threshold (e.g., <0.1% errors, p95 within acceptable range), consider switching default.
4. Keep the v1 library available as a fallback and add monitoring around the migration.

## Observed test artifacts

- logs/log_post.txt: structured JSON lines for events; requestId is redacted in logs.
- results_post.json & results_pre.json: summarized test executions and durations.

## Next steps for the migration plan

1. Implement a small feature flag + shadow traffic system
2. Add production-grade persistent idempotency storage (e.g., Redis) and external normalize circuit-breaker (e.g., Hystrix-like)
3. Add integration tests in CI, expand test scenarios with real DOM scenarios
4. Implement metrics reporting to monitoring system (examples in docs)
