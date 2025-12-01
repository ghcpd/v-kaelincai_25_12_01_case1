# 3.5 Testing & Acceptance Criteria

## Integration Test Suite (5+ Repeatable Tests)

### **Test Case 1: Modern Browser Happy Path (Chrome)**

**Target Issue**: Baseline functionality; ensure modern browsers work correctly

**Preconditions**:
- Mock Chrome event with `event.target`
- Target element has `data-action="submit"`
- No timeout or circuit breaker conditions

**Steps**:
1. Create mock click event (Chrome): `{ target: { dataset: { action: 'submit' } } }`
2. Call `getActionLabel(event, 'data-action')`
3. Capture result and latency

**Expected Outcome**:
- `label === 'submit'`
- `success === true`
- `browser === 'Chrome'`
- `latencyMs < 2ms` (p99)
- `path === 'target'`

**Observability Assertions**:
- Structured log emitted with traceId, browser, label
- Metric `action_label_success_count` incremented
- Metric `action_label_latency_ms` recorded with 'Chrome' label

**Acceptance Criteria**:
```gherkin
Given a Click event from Chrome browser
  And the target element has data-action="submit"
When getActionLabel is called
Then the returned label should be "submit"
  And success should be true
  And latency should be < 2ms
  And no error should be set
```

---

### **Test Case 2: Legacy Browser Fallback (IE11 via srcElement)**

**Target Issue**: **CRITICAL** - IE11 compatibility regression

**Preconditions**:
- Mock IE11 event with `event.srcElement` (no `event.target`)
- Target element has `getAttribute('data-action') = 'confirm'`
- No modern fallbacks available

**Steps**:
1. Create mock IE11 event: `{ srcElement: { getAttribute: () => 'confirm' } }`
2. Call `getActionLabel(event, 'data-action')`
3. Verify resolution path and result

**Expected Outcome**:
- `label === 'confirm'`
- `success === true`
- `browser === 'IE11'`
- `path === 'srcElement'` (fallback used)
- `latencyMs < 2ms`

**Observability Assertions**:
- Structured log shows `path: 'srcElement'` (indicating fallback)
- Metric `action_label_fallback_srcElement_count` incremented
- No error logged

**Acceptance Criteria**:
```gherkin
Given a Click event from IE11 browser (event.target is undefined)
  And only event.srcElement is available
  And the srcElement has data-action="confirm"
When getActionLabel is called
Then the returned label should be "confirm"
  And path should be "srcElement"
  And no error should occur
```

**Validation Method**: Run on actual IE11 VM or use Browserstack/Sauce Labs for real browser testing.

---

### **Test Case 3: Timeout Guard (5ms Max)**

**Target Issue**: Timeout propagation; circuit-breaker trigger

**Preconditions**:
- Create mock element with slow `getAttribute()` (10ms delay)
- Timeout set to 5ms
- Timeout guard active

**Steps**:
1. Create mock event with delayed attribute reader
2. Call `getActionLabel(event, 'data-action', { timeout: 5 })`
3. Measure actual time before timeout is triggered

**Expected Outcome**:
- Call returns error response (not throw)
- `success === false`
- `error === 'timeout'`
- `latencyMs ≈ 5ms` (± 1ms jitter)
- Fallback to cache if available

**Observability Assertions**:
- Structured log with `error: 'timeout'`, traceId
- Metric `action_label_timeout_count` incremented
- Metric `action_label_latency_ms` shows spike to 5ms

**Acceptance Criteria**:
```gherkin
Given a Click event where getAttribute() takes 10ms
  And timeout is set to 5ms
When getActionLabel is called
Then it should return within 6ms (5ms + 1ms jitter)
  And error should be "timeout"
  And no exception should be thrown
```

---

### **Test Case 4: Retry with Exponential Backoff**

**Target Issue**: Transient failures; improve success rate via retry

**Preconditions**:
- Mock getAttribute that fails on first 2 attempts (returns null)
- Succeeds on 3rd attempt (returns 'edit')
- Max retries: 3
- Base delay: 10ms

**Steps**:
1. Create event with flaky attribute reader
2. Call `getActionLabelWithRetry(event, 'data-action', { retries: 3 })`
3. Log retry attempts and final result

**Expected Outcome**:
- After 3 attempts, `label === 'edit'`
- `success === true`
- Retry count metrics show 2 failures + 1 success
- Total latency ≈ 10ms + 20ms (backoff) + attribute read = ~35ms

**Observability Assertions**:
- Structured log shows `retry_count: 2` (2 failures before success)
- Metric `action_label_retry_count` histogram with value 2
- Metric `action_label_retry_success` incremented
- No circuit breaker opened

**Acceptance Criteria**:
```gherkin
Given a transient failure in getAttribute (fails 2x, succeeds on 3rd)
  And max retries set to 3
  And exponential backoff enabled
When getActionLabelWithRetry is called
Then it should retry 2 times
  And eventually return "edit"
  And total latency should be < 50ms
  And success_rate should improve
```

---

### **Test Case 5: Circuit Breaker (Graceful Degradation)**

**Target Issue**: Cascading failures; prevent thundering herd

**Preconditions**:
- Simulate 100 consecutive failures (e.g., element not found)
- Failure rate: 100%
- Circuit breaker threshold: 90% success rate
- Window: 60s

**Steps**:
1. Execute 100 calls to `getActionLabel` with failing conditions
2. Monitor circuit breaker state transitions
3. After circuit opens, attempt more calls
4. Verify fallback to cache

**Expected Outcome**:
- After ~20 failures, circuit breaker transitions to `OPEN`
- Subsequent calls return cached label (if available) without executing
- Latency drops to <1ms (cache hit)
- `success` field shows `true` (from cache), not error
- After 60s, circuit transitions to `HALF_OPEN` (allows 1 test request)
- If test request succeeds, circuit closes

**Observability Assertions**:
- Structured log shows `circuit_state: 'OPEN'`
- Metric `circuit_breaker_state_change` emitted (CLOSED → OPEN)
- Metric `circuit_breaker_fallback_cache_hits` incremented
- Metric `circuit_breaker_reset_attempt` when transitioning to HALF_OPEN

**Acceptance Criteria**:
```gherkin
Given a sustained failure rate > threshold (90%)
  And circuit breaker window is 60s
When getActionLabel is called repeatedly (100x)
Then circuit breaker should transition to OPEN after ~20 failures
  And subsequent calls should return cached label
  And latency should drop to <1ms (no execution)
  And after 60s, circuit should transition to HALF_OPEN
  And next call should attempt execution
```

---

### **Test Case 6: Input Validation (Edge Cases)**

**Target Issue**: Maintainability; prevent crashes from malformed input

**Preconditions**:
- Various invalid inputs: null event, undefined attribute, empty string, etc.

**Steps**:
1. Call `getActionLabel(null, 'data-action')` → Should throw ValidationError
2. Call `getActionLabel(event, '')` → Should throw ValidationError
3. Call `getActionLabel(event, 123)` → Should throw ValidationError
4. Call `getActionLabel(event, 'data-action')` with corrupted event → Should return error response

**Expected Outcome**:
- Invalid inputs throw `ActionLabelError` (or return error response)
- Error message clearly indicates what validation failed
- No partial execution or side effects

**Observability Assertions**:
- Structured log with `error: 'validation'`, `reason: 'event must be object'`
- Metric `action_label_validation_error_count` incremented

**Acceptance Criteria**:
```gherkin
Given invalid input (null event, empty attribute, etc.)
When getActionLabel is called
Then it should throw ActionLabelError
  And error message should describe the problem
  And no downstream code should execute
```

---

### **Test Case 7: Idempotency Assertion**

**Target Issue**: Reliability; ensure repeated calls are safe

**Preconditions**:
- Same event + attribute + traceId
- No cache expiry between calls

**Steps**:
1. Call `getActionLabel(event, 'data-action', { traceId: 'TEST-123' })` → result1
2. Call `getActionLabel(event, 'data-action', { traceId: 'TEST-123' })` → result2
3. Call `getActionLabel(event, 'data-action', { traceId: 'TEST-123' })` → result3
4. Compare all results

**Expected Outcome**:
- `result1.label === result2.label === result3.label`
- All three calls return identical response
- No side effects observed (no duplicate events emitted)

**Observability Assertions**:
- Metric `idempotency_assertion_passed` incremented
- No duplicate logs for same traceId (or deduplicated)

**Acceptance Criteria**:
```gherkin
Given three identical calls with same traceId
When getActionLabel is called 3 times
Then all three results should be identical
  And label, browser, path should match exactly
  And no side effects should differ
```

---

### **Test Case 8: Event Bubbling (Nested Targets)**

**Target Issue**: Reliability; handle DOM hierarchy correctly

**Preconditions**:
- Create nested DOM: `<button data-action="cancel"><span>Cancel</span></button>`
- Click event originates on `<span>` (child)
- Read action from `<button>` (parent)

**Steps**:
1. Create event with child element as target
2. Set up event delegation (currentTarget = parent button)
3. Call `getActionLabel(event, 'data-action')`

**Expected Outcome**:
- Should read from child first: no `data-action` on span → return ''
- OR: Try currentTarget (parent): has `data-action="cancel"` → return 'cancel'
- Behavior depends on delegation strategy (target vs. currentTarget preference)

**Observability Assertions**:
- Log shows which path was used (target vs. currentTarget)
- Metric distinguishes between "target_hit" vs. "currentTarget_fallback"

**Acceptance Criteria**:
```gherkin
Given a nested button with data-action on parent
  And click event targets child element
When getActionLabel is called
Then it should follow event resolution chain
  And return action from appropriate element
```

---

## Test Coverage Matrix

| Test Case | Idempotency | Retry | Timeout | Circuit Breaker | Compensation | Audit/Reconciliation | Healthy Path |
|-----------|------------|-------|---------|-----------------|--------------|----------------------|--------------|
| 1. Happy Path (Chrome) | ✓ | - | ✓ | - | - | ✓ | ✓ |
| 2. IE11 Fallback | ✓ | - | ✓ | - | - | ✓ | ✓ |
| 3. Timeout Guard | ✓ | ✓ | ✓ | ✓ | - | ✓ | - |
| 4. Retry Backoff | ✓ | ✓ | ✓ | ✓ | - | ✓ | - |
| 5. Circuit Breaker | ✓ | - | - | ✓ | - | ✓ | - |
| 6. Input Validation | ✓ | - | - | - | - | ✓ | - |
| 7. Idempotency | ✓ | - | - | - | - | ✓ | - |
| 8. Event Bubbling | ✓ | - | ✓ | - | - | ✓ | - |

**Coverage Summary**:
- ✓ Idempotency: 8/8 (100%)
- ✓ Retry: 4/8 (50%)
- ✓ Timeout: 7/8 (87.5%)
- ✓ Circuit Breaker: 5/8 (62.5%)
- ✓ Compensation: 0/8 (0% - not needed for this domain)
- ✓ Audit: 8/8 (100%)
- ✓ Healthy Path: 2/8 (25% - others test error paths)

---

## Acceptance Criteria & SLOs

### **Functional Acceptance**

| Criterion | Target | Success Metric |
|-----------|--------|----------------|
| All test cases pass | 100% | 8/8 tests pass on CI/CD |
| Backward compatibility | v1 + v2 both work | Shadow read mismatch rate < 0.1% |
| Browser coverage | IE11, Edge, Chrome, Firefox, Safari | Pass on each browser in Browserstack |
| Error handling | No uncaught exceptions | 0 unhandled errors in tests |

### **Performance SLOs**

| Metric | Target | Threshold |
|--------|--------|-----------|
| Latency p50 | < 1ms | Alert if > 1.5ms |
| Latency p95 | < 2ms | Alert if > 3ms |
| Latency p99 | < 5ms | Alert if > 10ms |
| Success rate | ≥ 99.9% | Alert if < 99% |
| Timeout rate | < 0.1% | Alert if > 1% |
| Retry success rate | ≥ 95% | Alert if < 90% |

### **Resilience Acceptance**

| Scenario | Expected Behavior | Acceptance |
|----------|-------------------|-----------|
| Single timeout | Return error, fallback to cache | ✓ |
| 10 consecutive timeouts | Circuit breaker opens; use cache | ✓ |
| Circuit breaker open for 1 min | Transition to HALF_OPEN; test request | ✓ |
| Test request succeeds in HALF_OPEN | Close circuit; resume normal operation | ✓ |
| Transient failure (5 retries) | Succeed on retry; emit metric | ✓ |
| Permanent failure (max retries exceeded) | Return error; don't retry further | ✓ |

---

## One-Click Test Fixture

### **Command**

```bash
npm test
```

### **Output Format**

```
Action Label Service v2 - Test Suite
=====================================

Running 8 integration tests...

✓ Test 1: Modern Browser Happy Path (Chrome)
  Duration: 0.3ms | Label: "submit" | Success: true | Path: "target"

✓ Test 2: Legacy Browser Fallback (IE11 srcElement)
  Duration: 0.2ms | Label: "confirm" | Success: true | Path: "srcElement"

✓ Test 3: Timeout Guard (5ms Max)
  Duration: 5.1ms | Error: "timeout" | Success: false | Fallback: cached

✓ Test 4: Retry with Exponential Backoff
  Duration: 34.5ms | Retries: 2 | Label: "edit" | Success: true

✓ Test 5: Circuit Breaker (Graceful Degradation)
  Duration: varies | CB State: OPEN→HALF_OPEN→CLOSED | Fallback: cached

✓ Test 6: Input Validation (Edge Cases)
  Duration: 0.1ms | Error: "validation" | Success: false

✓ Test 7: Idempotency Assertion
  Duration: 0.3ms | Calls: 3 | Match: 100% | Success: true

✓ Test 8: Event Bubbling (Nested Targets)
  Duration: 0.2ms | Label: "cancel" | Path: "currentTarget"

=====================================
SUMMARY
=====================================

Tests Passed: 8/8 (100%)
Tests Failed: 0/8
Total Duration: 41.3ms

Performance Metrics:
├─ Latency p50: 0.25ms
├─ Latency p95: 2.1ms
├─ Latency p99: 5.2ms
├─ Success Rate: 100%
├─ Timeout Rate: 0/800 (0%)
├─ Retry Success Rate: 100% (2/2)
├─ Circuit Breaker Fallback Hits: 80/100 (80%)

Idempotency Assertions:
├─ Identical Calls: 3/3 (100%)
├─ Side Effect Duplication: 0 detected
├─ Cache Coherency: ✓

Browser Coverage:
├─ Chrome: ✓ PASS
├─ Firefox: ✓ PASS
├─ Safari: ✓ PASS
├─ IE11: ✓ PASS (via srcElement fallback)
├─ Edge <79: ✓ PASS (via srcElement fallback)

Logs Generated: 8 files in logs/
├─ log_20251201_143245.json (structured logs)
├─ metrics_20251201_143245.json (metrics)
├─ trace_20251201_143245.json (trace IDs)

Results Saved:
├─ results/test_results.json
├─ results/metrics.json
├─ results/coverage.json

Recommendation: ✓ READY FOR CANARY DEPLOYMENT
```

