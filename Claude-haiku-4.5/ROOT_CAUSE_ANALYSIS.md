# 3.3 Current-State Scan & Root-Cause Analysis

## Issues Classification Matrix

| Category | Symptom | Likely Root Cause | Evidence | Priority | Needed Evidence |
|----------|---------|-------------------|----------|----------|-----------------|
| **Functionality** | Shortcut buttons non-functional on IE11/Edge <79 | Missing `event.srcElement` fallback | Test cases fail; KNOWN_ISSUE.md documents this | **CRITICAL** | Production error logs from IE11 traffic; user session analytics |
| **Reliability** | No error logging when target not found | Silent failure; no observability | Returns empty string, no side effects | **HIGH** | Monitoring data on action label retrieval success rate |
| **Resilience** | No retry or circuit-breaker strategy | Function is pure, stateless | Code shows no timeout/retry logic | **MEDIUM** | Load testing results; P95/P99 latency metrics |
| **Security** | Potential XSS if attribute contains malicious code | `getAttribute` returns raw HTML attribute | No HTML escaping visible; depends on consuming code | **LOW** | OWASP code review; XSS testing |
| **Maintainability** | Only 2 test cases cover 2 browser families | Limited test coverage for edge cases | `compatActionLabel.test.js` has 2 tests | **MEDIUM** | Code coverage reports; regression test suite |
| **Performance** | Unknown latency impact on event handling | No benchmarking or profiling data | No timing assertions in tests | **LOW** | Chrome DevTools profiles; P50/P95/P99 latency |
| **Cost** | Browser support matrix unclear (drop IE11?) | No documented browser support strategy | README mentions IE11 but no SLA | **MEDIUM** | Market share analysis; customer support tickets |

---

## High-Priority Issues: Deep Dive

### **ISSUE #1: Browser Compatibility Regression (CRITICAL)**

#### **Detailed Symptom**
Users on Internet Explorer 11 and legacy Microsoft Edge (<79) cannot interact with UI elements that rely on `getActionLabel` for semantic action identification. Clicking shortcut buttons produces no response.

#### **Root-Cause Hypothesis Chain**

```
Step 1: Event Shape Divergence
├─ Modern Browsers (Chrome, Firefox, Safari, Edge 79+)
│  └─ Click event.target = clicked element (W3C standard)
│
Step 2: Legacy Browsers (IE11, Edge <79)
│  └─ Click event.target = undefined
│  └─ Click event.srcElement = clicked element (pre-W3C)
│
Step 3: Code Logic
│  ├─ const target = event.target || event.currentTarget || null
│  └─ currentTarget often undefined for click handlers
│  └─ Result: target = null (IE11 case)
│
Step 4: Attribute Lookup Fails
│  ├─ All three branches (getAttribute, dataset, direct access) skip
│  └─ Return empty string ''
│
Step 5: Handler Receives Empty String
│  └─ if (!actionLabel) { /* skip action */ }
│  └─ Button does nothing
│
OUTCOME: Silent failure; no error thrown; user frustration
```

#### **Evidence Collected**

**Code Analysis**:
```javascript
// Line 19: Missing srcElement fallback
const target = event.target || event.currentTarget || null;  // ← BUG
```

**Test Failures**:
```
✗ falls back to srcElement in legacy browsers
✗ reads dataset from srcElement when target missing
```

**Reproduction**:
```javascript
// IE11 event (no target property)
const ieEvent = { srcElement: element };
getActionLabel(ieEvent, 'data-action');  // Returns '' (WRONG)
```

#### **Validation Methods**

1. **Immediate**: Fix code + run tests (2 hours)
2. **Short-term**: Add production telemetry to log event shapes (1 week)
3. **Long-term**: A/B test with users on IE11; measure button click success rate (2 weeks)

#### **Fix Path (Causal Chain)**

```
Implement srcElement fallback
    ↓
const target = event.target || event.srcElement || event.currentTarget || null;
    ↓
All tests pass (green)
    ↓
Deploy to production
    ↓
Monitor IE11 action label retrieval success rate
    ↓
If success rate improves: Rollout complete
If regression occurs: Rollback to previous version
```

#### **SLA/Acceptance Criteria**
- **Success Rate**: ≥99.9% of IE11 clicks produce valid action labels
- **Latency**: p95 < 2ms (no noticeable impact on click handling)
- **Rollback**: Automatic if success rate drops below 99%

---

### **ISSUE #2: Lack of Observability (HIGH)**

#### **Symptom**
When `getActionLabel` fails to retrieve a label, there is no logging, monitoring, or audit trail. This makes debugging production incidents impossible.

#### **Root Cause**
- Pure function design (no side effects) is good for testing but bad for observability
- No structured logging schema
- No metrics emission (success/failure rate, latency)
- No request tracking (can't correlate action labels with user sessions)

#### **Evidence**
- No `console.log`, `logger.*` calls in code
- No metrics (e.g., `prometheus.histogram`) calls
- No request ID or trace ID context

#### **Validation Methods**
1. Query production logs: How many action label retrievals fail daily?
2. Correlate with user sessions: Do failed labels correlate with button clicks?
3. A/B test: Add logging to 10% of traffic; compare error rates

#### **Fix Path**
1. Add structured logging with request ID, browser fingerprint, attribute name, result
2. Emit metrics: success rate, latency percentiles, target type (target vs. srcElement)
3. Create dashboard: Real-time failure rate by browser/OS
4. Alert on threshold: If IE11 failure rate > 5%, page on-call engineer

---

### **ISSUE #3: Limited Test Coverage (MEDIUM)**

#### **Symptom**
Only 2 test cases; multiple edge cases not covered (e.g., nested targets, event bubbling, missing dataset, null events).

#### **Root Cause**
Minimal test suite; TDD but not comprehensive.

#### **Evidence**
```
✓ falls back to srcElement in legacy browsers
✓ reads dataset from srcElement when target missing
✗ (No other tests)
```

#### **Missing Test Cases**
1. Event bubbling: Click on child element, read parent's data-action
2. Null/undefined event: getActionLabel(null) should throw or return ''
3. Target without getAttribute: Custom object with only dataset
4. Timeout handling: Large DOMs or slow attribute lookups
5. XSS edge case: Attribute containing `<script>` (should not execute)

#### **Fix Path**
1. Add 5+ integration tests (see section 3.5 below)
2. Achieve ≥95% code coverage
3. Add E2E browser tests (Selenium/Puppeteer) for real IE11, Chrome, Firefox

---

## Performance & Reliability Risks

| Risk | Current State | Mitigation |
|------|---------------|-----------|
| Timeout on large DOMs | Unknown; no timeout | Add 5ms timeout; return '' if exceeded |
| Memory leak (event listeners) | Pure function; no leak | Verify no circular references in tests |
| Cascading failures | Silent failure | Add circuit-breaker; fallback to cached labels |
| Browser version fragmentation | 100+ variants | Test on IE11, Edge 18, Edge 79+, Chrome, Firefox, Safari |
| Nested/captured events | May read wrong target | Test event bubbling + capturing phases |

---

## Recommended Immediate Actions (Pre-Design)

1. **Enable IE11 traffic monitoring** (1 day):
   - Add conditional logging: `if (event.srcElement && !event.target)`
   - Log event shape + action label result + user session ID

2. **Expand test suite** (2 days):
   - Add 10 test cases covering edge cases
   - Validate no regressions before deployment

3. **Create browser compatibility matrix** (3 days):
   - Test on real IE11, Edge 18, Edge 79+, latest Chrome/Firefox/Safari
   - Document supported browser versions in README

4. **Plan rollout strategy** (1 week):
   - Canary: 5% of traffic → monitor IE11 failure rate
   - Ramp: 50% → 100% if no regression
   - Rollback plan: < 5 min to previous version

