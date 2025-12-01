# 3.4 Greenfield Replacement: New System Design (v2)

## Target State & Capability Boundaries

### **High-Level Vision**

Replace the current monolithic `getActionLabel` function with a resilient, observable, and testable **Action Label Service v2** that:

1. **Handles all browser event shapes** (modern + legacy) with fallback chains
2. **Provides structured observability** (logging, metrics, tracing)
3. **Implements resilience patterns** (timeout, retry, circuit-breaker, fallback)
4. **Enables validation & audit** (input validation, schema enforcement, audit logs)
5. **Supports zero-downtime rollout** (shadow reads, dual-write, canary deployment)

### **Capability Boundaries**

| Boundary | v1 (Legacy) | v2 (Greenfield) | Change |
|----------|-----------|-----------------|--------|
| **Input Validation** | None (throws TypeError) | Comprehensive (type + shape) | ✓ ADD |
| **Browser Support** | Implicit (broken on IE11) | Explicit (IE11, Edge, Chrome, Firefox, Safari) | ✓ ADD |
| **Event Shape Handling** | 1 path (target only) | 5 paths (target → srcElement → currentTarget → ...) | ✓ EXTEND |
| **Error Handling** | Silent fail (return '') | Categorized errors (validation, timeout, not-found) | ✓ IMPROVE |
| **Observability** | None | Structured logs + metrics + traces | ✓ ADD |
| **Timeout** | None | 5ms timeout + metrics | ✓ ADD |
| **Retry Logic** | None | Exponential backoff (for transient failures) | ✓ ADD |
| **Circuit Breaker** | None | Track success rate; disable if degraded | ✓ ADD |
| **Caching** | None | Optional: cache labels by element ID | ✓ ADD |
| **API Contract** | Implicit | Explicit OpenAPI schema | ✓ ADD |

---

## Service Decomposition

### **Architecture Diagram**

```
┌────────────────────────────────────────────────────────────────────┐
│                     Action Label Service v2                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ PUBLIC API: getActionLabel(event, attribute, options?)      │ │
│  │ • Returns: { label, browser, success, latencyMs, traceId }  │ │
│  │ • Throws: ActionLabelError (validation, timeout)            │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                          │                                         │
│  ┌──────────────────────┴─────────────────────────────────────┐  │
│  │ Input Validator                                             │  │
│  ├─ Validate event object shape                              │  │
│  ├─ Validate attribute name (string, non-empty)              │  │
│  ├─ Normalize input (trim, lowercase)                        │  │
│  └─ Return ValidationError if invalid                        │  │
│                          │                                         │
│  ┌──────────────────────┴─────────────────────────────────────┐  │
│  │ Event Target Resolver (5-Path Chain)                       │  │
│  ├─ Path 1: event.target (modern browsers)                   │  │
│  ├─ Path 2: event.srcElement (IE11/Edge <79)                │  │
│  ├─ Path 3: event.currentTarget (capture phase)             │  │
│  ├─ Path 4: event.relatedTarget (delegation use case)       │  │
│  ├─ Path 5: Cache lookup (if enabled)                       │  │
│  └─ Return: { target, browser, path }                       │  │
│                          │                                         │
│  ┌──────────────────────┴─────────────────────────────────────┐  │
│  │ Attribute Lookup (3-Path Chain)                            │  │
│  ├─ Path 1: getAttribute() → W3C standard                    │  │
│  ├─ Path 2: dataset[datasetKey] → HTML5 standard            │  │
│  ├─ Path 3: target[attribute] → Dynamic property access     │  │
│  └─ Return: { label, method }                               │  │
│                          │                                         │
│  ┌──────────────────────┴─────────────────────────────────────┐  │
│  │ Timeout Guard (5ms)                                        │  │
│  ├─ Abort if any path exceeds 5ms                            │  │
│  ├─ Emit metric: timeout_count                               │  │
│  └─ Return: TimeoutError                                     │  │
│                          │                                         │
│  ┌──────────────────────┴─────────────────────────────────────┐  │
│  │ Response Builder                                            │  │
│  ├─ Success: { label, browser, path, latencyMs, traceId }   │  │
│  ├─ Failure: { error, reason, traceId }                     │  │
│  └─ Side effect: Emit structured log + metrics              │  │
│                          │                                         │
│  ┌──────────────────────┴─────────────────────────────────────┐  │
│  │ Observability Layer                                        │  │
│  ├─ Structured Logger: { traceId, browser, label, latency }  │  │
│  ├─ Metrics: success_rate, p50/p95/p99 latency              │  │
│  ├─ Circuit Breaker: disable if success_rate < 90% for 1m   │  │
│  └─ Fallback: cache last known label for element            │  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### **Module Breakdown**

```
src/
├── index.js                           # Public API entry point
├── validator.js                       # Input validation
├── eventResolver.js                   # Event target resolution (5 paths)
├── attributeReader.js                 # Attribute lookup (3 paths)
├── timeout.js                         # Timeout guard
├── observability.js                   # Logging, metrics, traces
├── circuitBreaker.js                  # Failure rate tracking
└── errors.js                          # Custom error classes

mocks/
├── mockBrowserEvents.js               # Simulate IE11, Chrome, Firefox events
└── mockLogger.js                      # Mock structured logger

tests/
├── test_validation.js                 # Input validation tests
├── test_eventResolver.js              # Event resolution tests
├── test_attributeReader.js            # Attribute lookup tests
├── test_timeout.js                    # Timeout guard tests
├── test_circuitBreaker.js             # Circuit breaker tests
├── test_integration.js                # End-to-end integration tests
└── test_resilience.js                 # Resilience pattern tests
```

---

## Unified State Machine

### **Request Lifecycle: Initialization → In-Progress → Success/Failure**

```
START: getActionLabel(event, 'data-action', { timeout: 5ms, traceId: '...' })
  │
  ├─→ VALIDATE INPUT
  │   ├─ Check event is object
  │   ├─ Check attribute is string
  │   └─ If invalid → VALIDATION_ERROR → END
  │
  ├─→ RESOLVE TARGET
  │   ├─ Try: event.target (modern)
  │   ├─ Try: event.srcElement (IE11)
  │   ├─ Try: event.currentTarget (capture)
  │   ├─ Try: cache lookup
  │   └─ If not found → NOT_FOUND_ERROR → END
  │
  ├─→ READ ATTRIBUTE [with timeout = 5ms]
  │   ├─ Try: getAttribute(attribute)
  │   ├─ Try: dataset[key]
  │   ├─ Try: target[attribute]
  │   └─ If timeout → TIMEOUT_ERROR → END
  │
  ├─→ VALIDATE RESULT
  │   ├─ Check label is string
  │   ├─ Check not empty or null
  │   └─ If invalid → RESULT_ERROR → END
  │
  ├─→ EMIT METRICS
  │   ├─ success_count++
  │   ├─ latency_histogram.observe(elapsedMs)
  │   └─ emit structured log (traceId, browser, label, latency)
  │
  └─→ SUCCESS: Return { label, success: true, browser, latencyMs, traceId }
        │
        ├─ If circuit_breaker.isOpen() → fallback to cache
        └─ END


ERROR PATHS:
  VALIDATION_ERROR → Log + emit metric → Return { label: '', error: 'validation' }
  NOT_FOUND_ERROR → Log + emit metric → Return { label: '', error: 'not_found' }
  TIMEOUT_ERROR → Log + emit metric → Fallback to cache → Return { label: cached || '', error: 'timeout' }
  CIRCUIT_BREAKER_OPEN → Skip execution → Return cached label → END
```

---

## Idempotency & Resilience Strategies

### **1. Idempotency**

**Property**: Multiple calls with identical inputs return identical results.

```javascript
// Idempotent: Pure function, no state mutation
const result1 = getActionLabel(event, 'data-action');
const result2 = getActionLabel(event, 'data-action');
// result1 === result2 (both return 'submit')
```

**Implementation**:
- No side effects in primary logic (logging is separate)
- No request ID needed (same input → same output)
- Cache is optional and transparent

---

### **2. Retry with Exponential Backoff**

**Scenario**: Attribute lookup times out due to DOM bloat.

```javascript
async function getActionLabelWithRetry(event, attribute, options = {}) {
  const maxRetries = options.retries || 3;
  const baseDelayMs = options.baseDelayMs || 10;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = getActionLabel(event, attribute, {
        timeout: 5 - (attempt * 2) // Tighten timeout on retries
      });
      if (result.success) return result;
    } catch (error) {
      if (attempt < maxRetries - 1) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        await sleep(delayMs);
      }
    }
  }
  
  // All retries exhausted
  return { label: '', success: false, error: 'max_retries_exceeded' };
}
```

**Metrics**:
- `retry_count` histogram
- `max_retries_exceeded` counter
- `retry_success_rate`

---

### **3. Timeout & Circuit Breaker**

**Timeout Implementation**:
```javascript
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new TimeoutError(`Timeout after ${ms}ms`)), ms)
    )
  ]);
}
```

**Circuit Breaker Implementation**:
```javascript
class CircuitBreaker {
  constructor(successRateThreshold = 0.9, windowSizeMs = 60000) {
    this.threshold = successRateThreshold;
    this.window = windowSizeMs;
    this.state = 'CLOSED'; // CLOSED | OPEN | HALF_OPEN
    this.successCount = 0;
    this.failureCount = 0;
  }

  recordSuccess() {
    this.successCount++;
    if (this.state === 'HALF_OPEN') this.state = 'CLOSED';
  }

  recordFailure() {
    this.failureCount++;
    const rate = this.successCount / (this.successCount + this.failureCount);
    if (rate < this.threshold) this.state = 'OPEN';
  }

  isOpen() {
    return this.state === 'OPEN';
  }

  reset() {
    this.state = 'HALF_OPEN';
    this.successCount = 0;
    this.failureCount = 0;
  }
}
```

**Fallback Strategy**:
```
If circuit breaker is OPEN:
  → Return last known label for element (from cache)
  → If cache miss: return empty string
  → After 60 seconds: transition to HALF_OPEN (allow 1 request)
  → If success in HALF_OPEN: close circuit
```

---

### **4. Compensation & Saga (Optional)**

For multi-step flows (e.g., booking an appointment after action label retrieval):

```javascript
// Saga Pattern: Distributed transaction with compensation
const appointmentSaga = async (event, appointment) => {
  const bookingId = uuid();
  const traceId = uuid();
  
  try {
    // Step 1: Get action label
    const { label } = await getActionLabel(event, 'data-action', { traceId });
    
    // Step 2: Validate action (idempotency key = bookingId)
    if (label !== 'confirm-booking') return { error: 'invalid_action', traceId };
    
    // Step 3: Book appointment (idempotent, uses bookingId)
    const booked = await bookAppointment({ ...appointment, bookingId, traceId });
    
    // Step 4: Emit event to outbox (for async notification)
    await outbox.emit('APPOINTMENT_BOOKED', { booked, traceId });
    
    return { success: true, bookingId, traceId };
  } catch (error) {
    // Compensation: Rollback if appointment was booked
    if (error.step === 'EMIT_EVENT') {
      await bookAppointment.cancel({ bookingId, traceId });
    }
    return { error: error.message, traceId };
  }
};
```

---

## API Contract & Schema

### **Function Signature (v2)**

```javascript
/**
 * Retrieve semantic action label from browser click event.
 *
 * @param {Event} event - Browser event object (target, srcElement, or currentTarget)
 * @param {string} attribute - Data attribute name (default: 'data-action')
 * @param {Object} options - Optional configuration
 * @param {number} options.timeout - Max time in ms (default: 5)
 * @param {string} options.traceId - Correlation ID for logging (default: auto-generated)
 * @param {boolean} options.useCache - Enable label caching (default: false)
 * @param {Function} options.logger - Custom logger (default: console)
 *
 * @returns {Promise<Object>} Result object:
 *   {
 *     label: string,              // Action label (e.g., 'submit', '' if not found)
 *     success: boolean,           // Whether retrieval succeeded
 *     browser: string,            // Browser family (IE11, Chrome, Firefox, Safari)
 *     latencyMs: number,          // Time taken in milliseconds
 *     traceId: string,            // Correlation ID
 *     error?: string,             // Error code if failed (validation, timeout, not_found)
 *     reason?: string,            // Human-readable error message
 *     path?: string               // Resolution path used (target, srcElement, currentTarget)
 *   }
 *
 * @throws {ActionLabelError}
 *   - ValidationError: Invalid input (event, attribute)
 *   - TimeoutError: Exceeded timeout
 *   - NotFoundError: Target not located
 */
async function getActionLabel(event, attribute = 'data-action', options = {}) {
  // Implementation (see below)
}
```

### **Input Schema (JSON)**

```json
{
  "event": {
    "type": "object",
    "required": true,
    "description": "Browser event object",
    "properties": {
      "target": { "type": ["object", "null"], "description": "Modern browser" },
      "srcElement": { "type": ["object", "null"], "description": "IE11/Edge <79" },
      "currentTarget": { "type": ["object", "null"], "description": "Capture phase" }
    },
    "example": { "target": { "dataset": { "action": "submit" } } }
  },
  "attribute": {
    "type": "string",
    "required": true,
    "minLength": 1,
    "pattern": "^[a-z][a-z0-9-]*$",
    "description": "Data attribute name",
    "example": "data-action"
  },
  "options": {
    "type": "object",
    "properties": {
      "timeout": { "type": "number", "minimum": 1, "maximum": 1000, "default": 5 },
      "traceId": { "type": "string", "pattern": "^[a-z0-9-]{36}$", "default": "auto-generated" },
      "useCache": { "type": "boolean", "default": false },
      "logger": { "type": "function", "description": "Custom logger instance" }
    }
  }
}
```

### **Output Schema (JSON)**

```json
{
  "label": {
    "type": "string",
    "description": "Action label retrieved",
    "example": "submit",
    "constraint": "max 256 chars, alphanumeric + dash/underscore"
  },
  "success": {
    "type": "boolean",
    "description": "Whether retrieval succeeded"
  },
  "browser": {
    "type": "string",
    "enum": ["IE11", "Edge<79", "Chrome", "Firefox", "Safari", "Unknown"],
    "description": "Detected browser"
  },
  "latencyMs": {
    "type": "number",
    "minimum": 0,
    "maximum": 5,
    "description": "Elapsed time in milliseconds"
  },
  "traceId": {
    "type": "string",
    "description": "Correlation ID for logging"
  },
  "error": {
    "type": "string",
    "enum": ["validation", "timeout", "not_found", "circuit_open"],
    "description": "Error code if failed"
  },
  "path": {
    "type": "string",
    "enum": ["target", "srcElement", "currentTarget", "cache"],
    "description": "Resolution path used"
  }
}
```

---

## Migration & Parallel Run Strategy

### **Phase 1: Shadow Read (Week 1, 0% Production Impact)**

```
┌─────────────────────────────┐
│ Incoming Click Event        │
└──────────────┬──────────────┘
               │
        ┌──────┴──────┐
        │             │
        ▼             ▼
    v1 (current)  v2 (shadow)
    Execute       Execute
    Return        Log result
    Response      (no effect)
        │             │
        └──────┬──────┘
               │
        Return v1 result to user
        
       Comparison: v1 vs v2 results
       If mismatch: alert on-call engineer
```

**Implementation**:
```javascript
async function getActionLabelWithShadow(event, attribute) {
  // Execute v1 (current)
  const v1Result = getActionLabel_v1(event, attribute);
  
  // Execute v2 (shadow) in background
  getActionLabel_v2(event, attribute)
    .then(v2Result => {
      if (v2Result.label !== v1Result.label) {
        logger.warn('SHADOW_MISMATCH', {
          v1: v1Result.label,
          v2: v2Result.label,
          traceId: v2Result.traceId
        });
        metrics.inc('shadow_mismatch_count');
      }
    })
    .catch(error => {
      logger.error('SHADOW_ERROR', { error, traceId: event.traceId });
    });
  
  // Return v1 result (user unaffected)
  return v1Result;
}
```

---

### **Phase 2: Canary (Week 2, 5% → 25% → 50%)**

```
Traffic: 5% to v2, 95% to v1
Metrics: success_rate, latency p50/p95, error counts
Alerts: If success_rate < 99% → rollback
        If latency p95 > 10ms → rollback
        
After 24 hours at 5%:
  - If no alerts: ramp to 25%
  - After 24 hours: ramp to 50%
```

---

### **Phase 3: Full Rollout (Week 3, 100%)**

```
Traffic: 100% to v2
Monitoring: Daily dashboards for success rate, latency, errors by browser
Rollback: 1-click revert to v1 (< 5 min)
```

---

## Structured Logging Schema

### **Log Entry Format**

```json
{
  "timestamp": "2025-12-01T14:32:45.123Z",
  "traceId": "550e8400-e29b-41d4-a716-446655440000",
  "level": "INFO",
  "component": "getActionLabel",
  "event": "ACTION_LABEL_RETRIEVED",
  "details": {
    "label": "submit",
    "attribute": "data-action",
    "browser": "Chrome",
    "path": "target",
    "latencyMs": 0.5,
    "success": true,
    "userId": "**MASKED**",
    "sessionId": "**MASKED**",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  }
}
```

### **Sensitive Field Masking**

| Field | Masked Value | Reason |
|-------|--------------|--------|
| `userId` | `**MASKED**` | PII |
| `sessionId` | `**MASKED**` | Tracking risk |
| `email` | `**MASKED**` | PII |
| `phone` | `**MASKED**` | PII |
| `userAgent` | Full (no PII) | Debugging aid |
| `label` | Full (semantic) | Business value |
| `browser` | Full (non-PII) | Debugging aid |

