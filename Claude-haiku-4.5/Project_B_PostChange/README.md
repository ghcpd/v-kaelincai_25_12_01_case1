# Action Label Service v2 - Implementation Guide

## Overview

This is a **greenfield replacement** for the legacy browser event action label service. The v2 implementation adds:

- **Multi-path event target resolution** (modern browsers + IE11 + legacy Edge)
- **Timeout guard** (5ms max)
- **Retry with exponential backoff** (for transient failures)
- **Circuit breaker** (graceful degradation)
- **Structured logging & metrics** (observability)
- **Full idempotency** (safe for retries)

## Quick Start

```bash
# Install dependencies
npm install

# Run tests
npm test

# Setup project
bash setup.sh
```

## Architecture

### Module Structure

```
src/
├── index.js                           # Main API
├── validator.js                       # Input validation
├── eventResolver.js                   # Event target resolution (5 paths)
├── attributeReader.js                 # Attribute lookup (3 paths)
├── circuitBreaker.js                  # Circuit breaker state machine
├── errors.js                          # Custom error classes
└── observability/
    ├── logger.js                      # Structured logging
    └── metrics.js                     # Metrics collection
```

### Request Flow

```
Input: event + attribute + options
  ↓
Validator (check event type, attribute format)
  ↓
Circuit Breaker Check (if OPEN, use cache)
  ↓
Event Target Resolver (5-path chain)
  ↓
Timeout Guard (5ms max)
  ↓
Retry with Backoff (up to 3 attempts)
  ↓
Attribute Reader (3-path chain)
  ↓
Metrics & Logging
  ↓
Output: { label, success, browser, path, latencyMs, traceId }
```

## Key Features

### 1. Multi-Path Event Resolution

```javascript
// Path 1: event.target (modern browsers)
// Path 2: event.srcElement (IE11, Edge <79)
// Path 3: event.currentTarget (capture phase)
// Path 4: event.relatedTarget (delegation)
// Path 5: cache lookup
```

### 2. Resilience Patterns

**Timeout**:
```javascript
await getActionLabel(event, 'data-action', { timeout: 5 });
// Aborts if takes > 5ms, returns error response
```

**Retry with Backoff**:
```javascript
// Automatic retry on transient failures
// Exponential backoff: 10ms, 20ms, 40ms
// Up to 3 attempts by default
```

**Circuit Breaker**:
```javascript
// Opens if success_rate < 90% for 60s window
// Falls back to cached labels
// Auto-transitions to HALF_OPEN after 60s
```

### 3. Structured Observability

**Logging**:
```json
{
  "timestamp": "2025-12-01T14:32:45.123Z",
  "traceId": "550e8400-e29b-41d4-a716-446655440000",
  "level": "INFO",
  "component": "getActionLabel",
  "event": "ACTION_LABEL_RETRIEVED",
  "details": {
    "label": "submit",
    "browser": "Chrome",
    "path": "target",
    "latencyMs": 0.5,
    "success": true
  }
}
```

**Metrics**:
- `action_label_success_count` (counter)
- `action_label_error_count` (counter by error type)
- `action_label_latency_ms` (histogram)
- `circuit_breaker_state` (gauge)

## API Reference

### `getActionLabel(event, attribute?, options?)`

**Parameters**:
- `event` (object, required): Browser click event
- `attribute` (string, optional): Data attribute name (default: `'data-action'`)
- `options` (object, optional):
  - `timeout` (number): Max time in ms (default: 5)
  - `traceId` (string): Correlation ID
  - `useCache` (boolean): Enable caching (default: false)
  - `maxRetries` (number): Max retry attempts (default: 3)
  - `baseDelayMs` (number): Base retry delay (default: 10)

**Returns**:
```javascript
Promise<{
  label: string,                // Action label (e.g., 'submit')
  success: boolean,             // Whether retrieval succeeded
  browser: string,              // Browser family (Chrome, IE11, etc.)
  latencyMs: number,            // Time taken in ms
  traceId: string,              // Correlation ID
  path?: string,                // Resolution path used
  error?: string,               // Error code if failed
  reason?: string               // Human-readable error message
}>
```

**Example**:
```javascript
const { getActionLabel } = require('action-label-service-v2');

const event = { target: { dataset: { action: 'submit' } } };
const result = await getActionLabel(event, 'data-action');

if (result.success) {
  console.log(`Action: ${result.label}`);
  console.log(`Browser: ${result.browser}`);
  console.log(`Latency: ${result.latencyMs}ms`);
} else {
  console.error(`Error: ${result.error}`);
}
```

## Testing

### Run All Tests

```bash
npm test
```

### Test Coverage

```bash
npm run test:coverage
```

### Watch Mode

```bash
npm run test:watch
```

### Test Cases

| # | Name | Issue | Status |
|---|------|-------|--------|
| 1 | Modern Browser Happy Path | Baseline | ✓ |
| 2 | IE11 Legacy Fallback | CRITICAL | ✓ |
| 3 | Timeout Guard | Reliability | ✓ |
| 4 | Retry with Backoff | Resilience | ✓ |
| 5 | Circuit Breaker | Cascading failures | ✓ |
| 6 | Input Validation | Maintainability | ✓ |
| 7 | Idempotency | Correctness | ✓ |
| 8 | Event Bubbling | Edge case | ✓ |

## Migration Strategy

### Phase 1: Shadow Read (Week 1)
- v1 returns response
- v2 executes in background
- Compare results; alert on mismatch

### Phase 2: Canary (Week 2)
- 5% traffic to v2
- Monitor: success_rate, latency p95, errors
- Auto-rollback if degradation detected

### Phase 3: Full Rollout (Week 3)
- 100% traffic to v2
- Monitor dashboards
- Instant rollback available

## Performance SLOs

| Metric | Target | Alert |
|--------|--------|-------|
| Latency p50 | < 1ms | > 1.5ms |
| Latency p95 | < 2ms | > 3ms |
| Latency p99 | < 5ms | > 10ms |
| Success rate | ≥ 99.9% | < 99% |
| Timeout rate | < 0.1% | > 1% |

## Troubleshooting

### Circuit Breaker Keeps Opening

**Symptom**: Many calls return cached results

**Cause**: Success rate dropped below 90%

**Solution**:
1. Check logs for error patterns
2. Investigate root cause (DOM bloat? Performance regression?)
3. Call `reset()` to manually close circuit

### Timeouts Frequent

**Symptom**: 5ms timeout being triggered

**Cause**: Large DOM or slow attribute reads

**Solution**:
1. Increase timeout: `{ timeout: 10 }`
2. Optimize DOM queries (use IDs instead of classes)
3. Cache frequently-read attributes

### Cache Misses

**Symptom**: Fallback to empty string when circuit open

**Cause**: Element ID not set or cache expired

**Solution**:
1. Ensure elements have `id` attribute
2. Increase cache TTL (default: 60s)
3. Use `useCache: true` in options

## Monitoring & Dashboards

### Key Metrics to Track

1. **Success Rate by Browser**
   - Chrome: target % success
   - IE11: srcElement % success
   - Overall: ≥ 99.9%

2. **Latency Percentiles**
   - p50: < 1ms
   - p95: < 2ms
   - p99: < 5ms

3. **Circuit Breaker State**
   - Time spent in OPEN
   - Fallback to cache % of traffic

4. **Error Breakdown**
   - Validation errors
   - Timeout errors
   - Not-found errors
   - Retry success rate

### Alerts

- **CRITICAL**: Success rate < 99%
- **WARNING**: Latency p95 > 3ms
- **INFO**: Circuit breaker state change

## Browser Support Matrix

| Browser | Version | Status | Path |
|---------|---------|--------|------|
| Chrome | Latest | ✓ | target |
| Firefox | Latest | ✓ | target |
| Safari | Latest | ✓ | target |
| Edge | 79+ | ✓ | target |
| Edge | <79 | ✓ | srcElement |
| IE11 | All | ✓ | srcElement |

## Files

- `src/index.js` - Main API
- `src/validator.js` - Input validation
- `src/eventResolver.js` - Event resolution
- `src/attributeReader.js` - Attribute reading
- `src/circuitBreaker.js` - Circuit breaker
- `src/errors.js` - Custom errors
- `src/observability/logger.js` - Logging
- `src/observability/metrics.js` - Metrics
- `tests/test_integration.js` - Integration tests
- `mocks/mockBrowserEvents.js` - Mock events
- `data/test_data.json` - Test fixtures

## Related Documents

- `GREENFIELD_DESIGN.md` - Full architecture & design
- `TESTING_ACCEPTANCE.md` - Test cases & acceptance criteria
- `ROOT_CAUSE_ANALYSIS.md` - Issue analysis
- `LEGACY_ANALYSIS.md` - Legacy system analysis
- `CLARIFICATION.md` - Data collection & assumptions

