# Legacy System Analysis & Greenfield Replacement Design

**Project**: Browser Compatibility Event Handler System  
**Date**: December 1, 2025  
**Engineer**: Senior Architecture & Delivery Team  
**Mission**: Greenfield replacement for `issue_project`

---

## 1. CLARIFICATION & DATA COLLECTION

### 1.1 Missing Data / Assumptions

| **Category** | **Missing Data** | **Assumption Made** | **Impact** |
|-------------|------------------|---------------------|-----------|
| Usage Metrics | Production traffic volume, browser distribution | ~20% IE11/Legacy Edge users; ~500K events/day | Sizing for compatibility layer |
| Error Rates | Current failure rate, user impact | ~20% click failures in legacy browsers | High priority for fix |
| Performance | Current latency, SLA requirements | <5ms p95 for event handling | Design for zero overhead |
| Integration | Downstream systems consuming labels | Direct UI event handlers only | Isolated scope |
| Logging | Existing observability | None currently | Must add comprehensive logging |
| Security | Attribute validation, XSS risks | Untrusted input possible | Add input validation |
| Deployment | Rollout strategy, A/B testing capability | Gradual rollout with feature flags | Design for safe migration |

### 1.2 Data Collection Checklist

```
✓ Source code (compatActionLabel.js)
✓ Test suite (compatActionLabel.test.js)
✓ Known issues documentation (KNOWN_ISSUE.md)
✗ Production logs (simulated in new design)
✗ Browser analytics/RUM data (will instrument)
✗ Error monitoring (will add Sentry/equivalent)
✗ Performance traces (will add timing)
✗ User session recordings (assumed unavailable)
✗ Security audit results (will design with security first)
```

---

## 2. BACKGROUND RECONSTRUCTION

### 2.1 Business Context (Inferred)

**Domain**: Web application with interactive UI requiring cross-browser compatibility  
**Core Flow**: User clicks UI elements → JavaScript extracts semantic action label from event → Handler executes business logic

```
┌─────────────┐      click       ┌──────────────────┐     label      ┌──────────────┐
│   Browser   │ ─────────────> │ Event Handler    │ ──────────> │ Business     │
│   (varies)  │   event object   │ (getActionLabel) │  "submit"     │ Logic        │
└─────────────┘                  └──────────────────┘               └──────────────┘
     ▲                                    │
     │                                    │ failure in IE11
     │                                    ▼
     │                           ❌ Empty string returned
     │                           ❌ Button does nothing
     └──────────────────────────────── User confusion
```

**Boundaries**:
- **In-scope**: Event object normalization, attribute extraction, browser compatibility
- **Out-of-scope**: Business logic handlers, UI rendering, analytics

**Dependencies**:
- Node.js runtime (testing)
- Browser DOM APIs (production)
- No external libraries (intentional minimal design)

### 2.2 Uncertainties

1. **User Impact Severity**: Unknown how many users affected; assuming 20% based on typical IE11 market share
2. **Performance Budget**: No explicit SLA; assuming <5ms overhead is acceptable
3. **Security Requirements**: No explicit validation requirements; assuming untrusted input
4. **Scalability**: Unknown event volume; assuming high-frequency calls (millions/day)
5. **Migration Timeline**: No deadline specified; assuming gradual rollout over 2-4 weeks

---

## 3. CURRENT-STATE SCAN & ROOT-CAUSE ANALYSIS

### 3.1 Issue Inventory

| **Category** | **Symptom** | **Likely Root Cause** | **Evidence** | **Severity** |
|-------------|------------|----------------------|-------------|-------------|
| **Functionality** | Click handlers fail in IE11/Legacy Edge | `getActionLabel` never checks `event.srcElement` | Tests fail; KNOWN_ISSUE.md confirms | 🔴 **Critical** |
| **Reliability** | Silent failures (returns empty string) | No error logging or telemetry | No logging in code | 🟠 **High** |
| **Security** | No input validation on attributes | Direct attribute access without sanitization | Code inspection | 🟡 **Medium** |
| **Maintainability** | Tight coupling to event structure | No abstraction layer for event normalization | Monolithic function | 🟡 **Medium** |
| **Performance** | String manipulation on hot path | `toDatasetKey` runs on every call | Code inspection | 🟢 **Low** |
| **Observability** | No metrics, logs, or traces | Zero instrumentation | Code inspection | 🟠 **High** |

### 3.2 Root-Cause Deep Dive: IE11 Compatibility Bug

**Issue Chain**:
```
User clicks button in IE11
  ↓
Event object created with only `srcElement` property
  ↓
getActionLabel(event) called
  ↓
Line 17: target = event.target || event.currentTarget || null
  ↓
Both event.target and event.currentTarget are undefined
  ↓
target = null
  ↓
Line 19: if (!target) return ''
  ↓
Empty string returned → Handler doesn't execute
  ↓
User sees broken button
```

**Evidence**:
```javascript
// Line 17 in compatActionLabel.js - THE BUG
const target = event.target || event.currentTarget || null; 
// ❌ Missing: || event.srcElement
```

**Fix Path (Causal Chain)**:
1. **Root Cause**: Missing `srcElement` in fallback chain
2. **Immediate Fix**: Add `|| event.srcElement` to line 17
3. **Validation**: Existing tests should pass
4. **Verification**: Run in IE11 test environment
5. **Monitoring**: Add browser type to telemetry

### 3.3 Additional Issues - Hypothesis Chains

#### Issue #2: Silent Failures (No Observability)

**Hypothesis**: Failures go undetected in production
**Validation Method**:
1. Add structured logging with correlation IDs
2. Deploy to 1% traffic with logging enabled
3. Measure error rates vs. browser type
4. Confirm correlation between IE11 and empty labels

**Fix Path**:
```
Add logging → Deploy with feature flag → Monitor error rates →
Correlate with browser analytics → Validate hypothesis → Rollout
```

#### Issue #3: Security - No Attribute Validation

**Hypothesis**: Malicious attributes could cause XSS or data leakage
**Validation Method**:
1. Inject test attributes: `onclick`, `onerror`, `data-<script>`
2. Verify if values are sanitized before use
3. Review downstream handlers for eval/innerHTML usage

**Fix Path**:
```
Define allowlist of safe attributes → Validate input →
Sanitize output → Add CSP headers → Audit handlers
```

---

## 4. NEW SYSTEM DESIGN (GREENFIELD REPLACEMENT)

### 4.1 Target State Architecture

#### 4.1.1 Capability Boundaries

```
┌────────────────────────────────────────────────────────────────┐
│                  Event Label Extraction Service                 │
│                                                                  │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────┐   │
│  │   Event      │  │  Attribute  │  │    Observability   │   │
│  │ Normalizer   │→ │  Extractor  │→ │    & Logging       │   │
│  └──────────────┘  └─────────────┘  └────────────────────┘   │
│         ↓                  ↓                    ↓              │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────┐   │
│  │ Browser      │  │ Validation  │  │    Metrics         │   │
│  │ Compatibility│  │ & Security  │  │    Collector       │   │
│  └──────────────┘  └─────────────┘  └────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

#### 4.1.2 Unified State Machine

```
                    ┌─────────────┐
                    │   INITIAL   │
                    └──────┬──────┘
                           │ event received
                           ▼
                  ┌─────────────────┐
                  │  NORMALIZING    │◄────┐
                  └────┬────────────┘     │
                       │                  │ retry (transient error)
                       ├─► event.target exists     │
                       ├─► event.srcElement exists │
                       └─► fallback to currentTarget
                           │
                           ▼
                  ┌─────────────────┐
                  │   EXTRACTING    │
                  └────┬────────────┘
                       │
                       ├─► getAttribute() method
                       ├─► dataset property
                       └─► direct property access
                           │
                           ▼
                  ┌─────────────────┐
                  │   VALIDATING    │
                  └────┬────────────┘
                       │
                       ├─► type check (string)
                       ├─► allowlist check
                       └─► sanitization
                           │
                           ▼
                  ┌─────────────────┐
                  │    LOGGING      │
                  └────┬────────────┘
                       │
                       ▼
            ┌──────────┴──────────┐
            ▼                     ▼
     ┌───────────┐         ┌───────────┐
     │  SUCCESS  │         │   FAILED  │
     └───────────┘         └───────────┘
```

**State Transitions & Crash Points**:

| **State** | **Crash Point** | **Recovery** |
|-----------|----------------|--------------|
| INITIAL → NORMALIZING | `event = null/undefined` | Throw TypeError (fast-fail) |
| NORMALIZING → EXTRACTING | No valid target found | Return empty string (safe default) |
| EXTRACTING → VALIDATING | `getAttribute` throws | Catch & try next method |
| VALIDATING → LOGGING | Invalid type | Log warning, return empty string |
| LOGGING → SUCCESS/FAILED | Logging service down | Continue (non-blocking) |

#### 4.1.3 Reliability Patterns

**Idempotency**: ✅ N/A (pure function, no state mutations)  
**Retry**: ✅ N/A (synchronous operation, no network calls)  
**Timeout**: ✅ N/A (sub-millisecond execution)  
**Circuit Breaker**: ✅ N/A (no external dependencies)  
**Compensation/Saga**: ✅ N/A (read-only operation)

**Rationale**: This is a pure, stateless, synchronous function. Distributed system patterns (retry, circuit breaker, Saga) are not applicable. Focus is on:
- **Defensive programming**: Null checks, type validation
- **Graceful degradation**: Multiple extraction strategies
- **Observability**: Comprehensive logging for debugging

### 4.2 Service Decomposition

```javascript
// Core Services (Modular Design)

1. EventNormalizer
   - normalizeEvent(rawEvent): NormalizedEvent
   - getTargetElement(event): HTMLElement | null
   - Browser-specific logic encapsulated

2. AttributeExtractor
   - extractAttribute(element, attr): string
   - Strategies: getAttribute > dataset > property access
   - Strategy pattern for extensibility

3. Validator
   - validateAttributeName(attr): boolean
   - sanitizeValue(value): string
   - Security-first design

4. Logger
   - logExtraction(context): void
   - Structured logging with correlation IDs
   - Non-blocking (async where possible)

5. MetricsCollector
   - recordExtractionSuccess(browser, method): void
   - recordExtractionFailure(browser, reason): void
   - Push to telemetry service
```

### 4.3 Data Flow & Interfaces

```
┌───────────────────────────────────────────────────────────────┐
│                      REQUEST FLOW                              │
└───────────────────────────────────────────────────────────────┘

1. Client Event
   ↓
   {
     type: "click",
     target: HTMLElement | undefined,
     srcElement: HTMLElement | undefined,
     currentTarget: HTMLElement | undefined,
     timestamp: DOMHighResTimeStamp
   }

2. → EventNormalizer.normalizeEvent()
   ↓
   {
     target: HTMLElement,
     browser: "chrome" | "firefox" | "ie11" | "safari",
     method: "target" | "srcElement" | "currentTarget",
     requestId: "uuid-v4"
   }

3. → AttributeExtractor.extractAttribute()
   ↓
   {
     value: string,
     method: "getAttribute" | "dataset" | "property",
     durationMs: number
   }

4. → Validator.validateAttributeName() & sanitizeValue()
   ↓
   {
     value: string,
     isValid: boolean,
     sanitized: boolean
   }

5. → Logger.logExtraction()
   ↓
   {
     timestamp: ISO8601,
     requestId: string,
     browser: string,
     attribute: string,
     value: string (masked if sensitive),
     method: string,
     durationMs: number,
     success: boolean
   }

6. → MetricsCollector.recordExtraction()
   ↓
   {
     metric: "event_label_extraction",
     tags: {
       browser: string,
       method: string,
       success: boolean
     },
     value: number (duration),
     timestamp: number
   }

7. ← Return to Client
   ↓
   string (label) or "" (empty on failure)
```

### 4.4 Key Interfaces & Schemas

#### 4.4.1 Core Interfaces (TypeScript Definitions)

```typescript
// Event Normalization
interface NormalizedEvent {
  target: HTMLElement;
  browser: BrowserType;
  method: TargetMethod;
  requestId: string;
  timestamp: number;
}

type BrowserType = "chrome" | "firefox" | "safari" | "ie11" | "edge-legacy" | "unknown";
type TargetMethod = "target" | "srcElement" | "currentTarget" | "none";

// Extraction Result
interface ExtractionResult {
  value: string;
  method: ExtractionMethod;
  durationMs: number;
  success: boolean;
  error?: Error;
}

type ExtractionMethod = "getAttribute" | "dataset" | "property" | "failed";

// Validation
interface ValidationResult {
  isValid: boolean;
  sanitized: boolean;
  originalValue: string;
  sanitizedValue: string;
  warnings: string[];
}

// Logging Schema
interface LogEntry {
  timestamp: string; // ISO8601
  level: "debug" | "info" | "warn" | "error";
  requestId: string;
  browser: BrowserType;
  attribute: string;
  value: string; // masked if sensitive
  method: ExtractionMethod;
  durationMs: number;
  success: boolean;
  error?: string;
  metadata: Record<string, unknown>;
}

// Metrics
interface Metric {
  name: string;
  type: "counter" | "gauge" | "histogram";
  value: number;
  tags: Record<string, string>;
  timestamp: number;
}
```

#### 4.4.2 Configuration Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "logging": {
      "type": "object",
      "properties": {
        "enabled": { "type": "boolean", "default": true },
        "level": { "enum": ["debug", "info", "warn", "error"], "default": "info" },
        "sensitiveAttributes": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["data-user-id", "data-token", "data-password"]
        }
      }
    },
    "validation": {
      "type": "object",
      "properties": {
        "attributeAllowlist": {
          "type": "array",
          "items": { "type": "string", "pattern": "^data-[a-z0-9-]+$" },
          "default": ["data-action", "data-testid", "data-label"]
        },
        "maxValueLength": { "type": "number", "minimum": 1, "default": 256 }
      }
    },
    "metrics": {
      "type": "object",
      "properties": {
        "enabled": { "type": "boolean", "default": true },
        "endpoint": { "type": "string", "format": "uri" },
        "sampleRate": { "type": "number", "minimum": 0, "maximum": 1, "default": 1.0 }
      }
    },
    "featureFlags": {
      "type": "object",
      "properties": {
        "enableIE11Support": { "type": "boolean", "default": true },
        "enableValidation": { "type": "boolean", "default": true },
        "enableMetrics": { "type": "boolean", "default": true }
      }
    }
  }
}
```

### 4.5 Migration & Parallel Run Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    MIGRATION PHASES                              │
└─────────────────────────────────────────────────────────────────┘

Phase 1: DARK LAUNCH (Week 1)
  - Deploy v2 alongside v1
  - v2 runs in shadow mode (no production traffic)
  - Log v1 vs v2 results for comparison
  - Target: 0% production traffic, 100% shadow traffic

Phase 2: CANARY (Week 2)
  - Route 1% traffic to v2
  - Monitor error rates, latency, browser distribution
  - Alert on >0.1% regression in success rate
  - Target: 1% → 5% → 10% production traffic

Phase 3: GRADUAL ROLLOUT (Week 3)
  - Increase to 50% traffic
  - A/B test by browser: IE11/Legacy Edge first
  - Validate compatibility improvements
  - Target: 50% production traffic

Phase 4: FULL ROLLOUT (Week 4)
  - Route 100% traffic to v2
  - Keep v1 code for quick rollback (1-click)
  - Monitor for 7 days before deprecating v1
  - Target: 100% production traffic

Phase 5: CLEANUP (Week 5+)
  - Remove v1 code
  - Remove feature flags
  - Archive migration artifacts
```

#### 4.5.1 Dual-Write Strategy

✅ **N/A** - Read-only operation, no writes to persist

#### 4.5.2 Shadow Traffic

```javascript
// Parallel execution for validation
function getActionLabelWithShadow(event, attribute) {
  const v1Result = getActionLabel_v1(event, attribute);
  
  // Non-blocking shadow call
  Promise.resolve().then(() => {
    const v2Result = getActionLabel_v2(event, attribute);
    logComparison({
      requestId: generateUUID(),
      v1: v1Result,
      v2: v2Result,
      match: v1Result === v2Result,
      browser: detectBrowser(),
      timestamp: Date.now()
    });
  });
  
  return v1Result; // Use v1 result in production
}
```

#### 4.5.3 Rollback Paths

```
┌──────────────────────────────────────────────────────────────┐
│                    ROLLBACK TRIGGERS                          │
└──────────────────────────────────────────────────────────────┘

Automated Rollback (Immediate):
  - Error rate > 5% above baseline
  - Latency p95 > 10ms (2x budget)
  - Crash rate > 0.1%
  - Memory leak detected (heap growth >100MB/hour)

Manual Rollback (On-call approval):
  - User reports of broken functionality
  - Browser-specific regression
  - Security incident

Rollback Process:
  1. Feature flag toggle: v2.enabled = false (< 30 seconds)
  2. Monitor error rates return to baseline
  3. Post-mortem: root cause analysis
  4. Fix, test, re-deploy
```

---

## 5. TESTING & ACCEPTANCE

### 5.1 Integration Test Suite (Minimum 5 Cases)

#### Test Case #1: IE11 Compatibility - getAttribute Method

| **Property** | **Value** |
|-------------|----------|
| **Target Issue** | Primary bug: IE11 events fail due to missing srcElement check |
| **Preconditions** | Event object with only `srcElement` property, element has `getAttribute` method |
| **Test Data** | `{ srcElement: { getAttribute: (attr) => 'legacy-submit' } }` |
| **Steps** | 1. Create IE11-style event<br>2. Call `getActionLabel(event, 'data-action')`<br>3. Verify return value |
| **Expected Outcome** | Returns `"legacy-submit"` |
| **Observability** | Log: `{ browser: "ie11", method: "srcElement->getAttribute", success: true }` |
| **Idempotency** | ✅ Multiple calls return same value |
| **Coverage** | Browser compatibility, getAttribute fallback |

#### Test Case #2: IE11 Compatibility - Dataset Method

| **Property** | **Value** |
|-------------|----------|
| **Target Issue** | Secondary bug: dataset access via srcElement |
| **Preconditions** | Event object with only `srcElement.dataset` |
| **Test Data** | `{ srcElement: { dataset: { action: 'legacy-dataset' } } }` |
| **Steps** | 1. Create IE11-style event with dataset<br>2. Call `getActionLabel(event, 'data-action')`<br>3. Verify return value |
| **Expected Outcome** | Returns `"legacy-dataset"` |
| **Observability** | Log: `{ browser: "ie11", method: "srcElement->dataset", success: true }` |
| **Idempotency** | ✅ Multiple calls return same value |
| **Coverage** | Browser compatibility, dataset fallback |

#### Test Case #3: Graceful Degradation - No Target Found

| **Property** | **Value** |
|-------------|----------|
| **Target Issue** | Crash point: all target properties undefined |
| **Preconditions** | Event object with no target, srcElement, or currentTarget |
| **Test Data** | `{ type: "click", timestamp: Date.now() }` |
| **Steps** | 1. Create minimal event object<br>2. Call `getActionLabel(event, 'data-action')`<br>3. Verify no exception thrown |
| **Expected Outcome** | Returns `""` (empty string) |
| **Observability** | Log: `{ method: "none", success: false, reason: "no-target-found" }` |
| **Retry** | ✅ N/A (deterministic failure) |
| **Coverage** | Error handling, graceful degradation |

#### Test Case #4: Security - Attribute Validation (Future Enhancement)

| **Property** | **Value** |
|-------------|----------|
| **Target Issue** | Security: malicious attribute injection |
| **Preconditions** | Event with element containing dangerous attributes |
| **Test Data** | `{ target: { getAttribute: (attr) => '<script>alert(1)</script>' } }` |
| **Steps** | 1. Create event with XSS payload<br>2. Call `getActionLabel(event, 'data-action')`<br>3. Verify sanitization |
| **Expected Outcome** | Returns sanitized value or empty string |
| **Observability** | Log: `{ success: false, reason: "validation-failed", sanitized: true }` |
| **Audit** | Record security event for review |
| **Coverage** | Input validation, security hardening |

#### Test Case #5: Performance - High-Frequency Calls

| **Property** | **Value** |
|-------------|----------|
| **Target Issue** | Performance regression under load |
| **Preconditions** | 10,000 events processed sequentially |
| **Test Data** | Array of 10k events with varying structures |
| **Steps** | 1. Generate 10k events<br>2. Time `getActionLabel` for each<br>3. Calculate p50/p95/p99 latency |
| **Expected Outcome** | p95 < 5ms, p99 < 10ms |
| **Observability** | Metrics: `{ p50: 1.2ms, p95: 3.8ms, p99: 8.1ms, success_rate: 100% }` |
| **Timeout** | ✅ N/A (synchronous, sub-millisecond) |
| **Coverage** | Performance validation, scalability |

#### Test Case #6: Browser Detection & Metrics

| **Property** | **Value** |
|-------------|----------|
| **Target Issue** | Observability: track browser-specific behavior |
| **Preconditions** | Events from Chrome, Firefox, IE11, Safari |
| **Test Data** | 4 events, one per browser type |
| **Steps** | 1. Create browser-specific events<br>2. Call `getActionLabel` for each<br>3. Verify metrics collected |
| **Expected Outcome** | Metrics show correct browser distribution |
| **Observability** | Metrics: `{ chrome: 1, firefox: 1, ie11: 1, safari: 1 }` |
| **Reconciliation** | ✅ Verify all events accounted for |
| **Coverage** | Telemetry, browser analytics |

#### Test Case #7: Logging - Structured Output

| **Property** | **Value** |
|-------------|----------|
| **Target Issue** | Observability: comprehensive logging |
| **Preconditions** | Logging enabled, event processed |
| **Test Data** | `{ target: { getAttribute: (attr) => 'test-action' } }` |
| **Steps** | 1. Enable logging<br>2. Call `getActionLabel(event, 'data-action')`<br>3. Verify log structure |
| **Expected Outcome** | Log contains all required fields |
| **Observability** | Log: `{ timestamp, requestId, browser, attribute, value, method, durationMs, success }` |
| **Audit Trail** | ✅ Unique requestId for tracing |
| **Coverage** | Logging schema validation |

### 5.2 Acceptance Criteria

#### 5.2.1 Functional Requirements (Given-When-Then)

```gherkin
Scenario: IE11 user clicks button with data-action attribute
  Given a user is using Internet Explorer 11
  And a button element has attribute data-action="submit-form"
  When the user clicks the button
  Then the event handler receives event with srcElement property
  And getActionLabel(event, 'data-action') returns "submit-form"
  And the form submission handler is called correctly

Scenario: Modern browser user clicks button
  Given a user is using Chrome/Firefox/Safari
  And a button element has attribute data-action="cancel"
  When the user clicks the button
  Then the event handler receives event with target property
  And getActionLabel(event, 'data-action') returns "cancel"
  And the cancellation handler is called correctly

Scenario: Malformed event object
  Given an event object with no target, srcElement, or currentTarget
  When getActionLabel is called with the event
  Then the function returns an empty string
  And no exception is thrown
  And a warning is logged for debugging
```

#### 5.2.2 Non-Functional Requirements (SLO/SLA)

| **Metric** | **Target** | **Measurement** | **Alerting** |
|-----------|-----------|----------------|-------------|
| **Availability** | 99.99% uptime | % successful extractions | Alert if < 99.9% |
| **Latency** | p95 < 5ms, p99 < 10ms | Histogram of execution time | Alert if p95 > 10ms |
| **Error Rate** | < 0.1% failures | % empty strings returned | Alert if > 1% |
| **Browser Compat** | 100% IE11 support | % IE11 events succeeding | Alert if < 95% |
| **Security** | 0 XSS incidents | Security audit findings | Alert on any incident |
| **Observability** | 100% log coverage | % events with logs | Alert if < 99% |

---

## 6. STRUCTURED LOGGING SCHEMA

### 6.1 Log Entry Format (JSON)

```json
{
  "timestamp": "2025-12-01T10:30:45.123Z",
  "level": "info",
  "service": "event-label-extractor",
  "version": "2.0.0",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "event": {
    "type": "extraction",
    "browser": "ie11",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko",
    "attribute": "data-action",
    "value": "submit-form",
    "method": "srcElement->getAttribute",
    "durationMs": 1.234,
    "success": true
  },
  "metadata": {
    "elementTag": "button",
    "elementId": "submit-btn",
    "elementClass": "btn-primary",
    "sessionId": "sess_abc123",
    "userId": "REDACTED"
  }
}
```

### 6.2 Sensitive Field Masking Rules

| **Field** | **Masking Strategy** | **Example** |
|----------|---------------------|-------------|
| `userId` | Hash with salt | `"userId": "sha256:a3f2b9..."` |
| `data-token` | Full redaction | `"value": "REDACTED"` |
| `data-user-id` | Partial mask | `"value": "user_****1234"` |
| `data-password` | Full redaction | `"value": "REDACTED"` |
| `sessionId` | First 8 chars | `"sessionId": "sess_abc..."` |

### 6.3 Log Levels

```
DEBUG: Detailed extraction steps (method attempts, fallbacks)
INFO:  Successful extractions with metrics
WARN:  Graceful degradation (no target found, validation warnings)
ERROR: Unexpected exceptions, security violations
```

---

## 7. IMPLEMENTATION ROADMAP

### 7.1 Development Phases

```
Week 1: Foundation
  ✓ Refactor getActionLabel into modular services
  ✓ Add EventNormalizer with srcElement support
  ✓ Implement AttributeExtractor with strategy pattern
  ✓ Add comprehensive unit tests (>95% coverage)

Week 2: Observability & Security
  ✓ Implement structured logging with Logger service
  ✓ Add MetricsCollector with Prometheus/StatsD integration
  ✓ Implement Validator with allowlist & sanitization
  ✓ Add security tests (XSS, injection)

Week 3: Testing & Migration Prep
  ✓ Build integration test suite (7 cases minimum)
  ✓ Implement shadow mode for parallel execution
  ✓ Create feature flags for gradual rollout
  ✓ Build monitoring dashboards (Grafana/Datadog)

Week 4: Deployment & Validation
  ✓ Dark launch to 0% traffic (shadow only)
  ✓ Canary rollout (1% → 5% → 10%)
  ✓ Monitor error rates & latency
  ✓ Full rollout (50% → 100%)

Week 5: Stabilization & Cleanup
  ✓ Monitor for 7 days post-rollout
  ✓ Remove v1 code & feature flags
  ✓ Document lessons learned
  ✓ Archive migration artifacts
```

### 7.2 Risk Mitigation

| **Risk** | **Likelihood** | **Impact** | **Mitigation** |
|---------|---------------|-----------|---------------|
| Regression in modern browsers | Low | High | Comprehensive tests, shadow mode |
| Performance degradation | Medium | Medium | Benchmarks, p95 SLO, alerting |
| Incomplete IE11 coverage | Low | High | User-agent testing, real device validation |
| Logging overhead | Medium | Low | Async logging, sampling (10% in prod) |
| Security vulnerability | Low | Critical | Allowlist, sanitization, CSP, audit |
| Rollback required | Low | Medium | Feature flags, 1-click rollback |

---

## 8. SUCCESS METRICS

### 8.1 Quantitative KPIs

```
✅ IE11 click success rate: 0% → 100% (target: 100%)
✅ Overall error rate: Unknown → <0.1% (target: <0.1%)
✅ Latency p95: Unknown → <5ms (target: <5ms)
✅ Code coverage: 0% → >95% (target: >90%)
✅ Browser compatibility: 80% → 100% (target: 100%)
✅ Security incidents: Unknown → 0 (target: 0)
```

### 8.2 Qualitative Goals

```
✓ Improved maintainability through modular architecture
✓ Enhanced observability for faster debugging
✓ Security-first design with validation & sanitization
✓ Confidence in deployments through comprehensive testing
✓ Knowledge transfer through documentation & runbooks
```

---

## NEXT STEPS

1. **Review & Approve**: Architecture review with stakeholders
2. **Spike Work**: Proof-of-concept for EventNormalizer (2 days)
3. **Implementation**: Follow Week 1-5 roadmap
4. **Monitoring**: Set up dashboards & alerts before deployment
5. **Deployment**: Execute migration plan with rollback readiness

**Estimated Timeline**: 5 weeks from approval to full production rollout  
**Team Size**: 2 engineers (1 senior, 1 mid-level) + QA + DevOps support

---

**Document Version**: 1.0  
**Last Updated**: December 1, 2025  
**Status**: Ready for Implementation
