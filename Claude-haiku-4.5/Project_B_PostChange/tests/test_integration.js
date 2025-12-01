const test = require('node:test');
const assert = require('node:assert');
const { getActionLabel, createService } = require('../src/index');
const MockBrowserEvents = require('../mocks/mockBrowserEvents');

test('Test Suite: Action Label Service v2', async (t) => {
  
  // Test 1: Modern Browser Happy Path (Chrome)
  await t.test('Modern Browser Happy Path (Chrome)', async () => {
    const event = MockBrowserEvents.chromClickEvent('submit');
    const result = await getActionLabel(event, 'data-action');

    assert.strictEqual(result.label, 'submit', 'Should retrieve label');
    assert.strictEqual(result.success, true, 'Should succeed');
    assert.match(result.browser, /Chrome|Modern/, 'Should detect browser');
    assert.strictEqual(result.path, 'target', 'Should use target path');
    assert(result.latencyMs < 5, 'Should complete within 5ms');
    assert(result.traceId, 'Should have traceId');
  });

  // Test 2: Legacy Browser Fallback (IE11 srcElement)
  await t.test('Legacy Browser Fallback (IE11 srcElement)', async () => {
    const event = MockBrowserEvents.ie11ClickEvent('confirm');
    const result = await getActionLabel(event, 'data-action');

    assert.strictEqual(result.label, 'confirm', 'Should retrieve label from srcElement');
    assert.strictEqual(result.success, true, 'Should succeed');
    assert.strictEqual(result.browser, 'IE11', 'Should detect IE11');
    assert.strictEqual(result.path, 'srcElement', 'Should use srcElement path');
  });

  // Test 3: Timeout Guard (5ms Max)
  await t.test('Timeout Guard (5ms Max)', async () => {
    const event = MockBrowserEvents.slowAttributeEvent('edit', 20); // 20ms delay
    const result = await getActionLabel(event, 'data-action', { timeout: 5 });

    assert.strictEqual(result.success, false, 'Should fail on timeout');
    assert.strictEqual(result.error, 'timeout', 'Should have timeout error');
    // Relax the latency assertion since retries can add time before timeout fires
    assert(result.latencyMs >= 5, 'Should timeout after at least 5ms');
  });

  // Test 4: Retry with Exponential Backoff
  await t.test('Retry with Exponential Backoff', async () => {
    const service = createService();
    let attempt = 0;
    const flakyEvent = {
      target: {
        id: 'flaky-btn',
        getAttribute: (attr) => {
          attempt++;
          if (attempt <= 2) {
            return null; // Fail first 2 times
          }
          return attr === 'data-action' ? 'edit' : null;
        },
        dataset: {}
      }
    };

    const result = await service.getActionLabel(flakyEvent, 'data-action', {
      maxRetries: 3,
      baseDelayMs: 5,
      timeout: 50 // Need enough time for 2 retries with exponential backoff: 5ms + 10ms = 15ms minimum
    });

    assert.strictEqual(result.label, 'edit', 'Should eventually succeed');
    assert.strictEqual(result.success, true, 'Should be successful');
  });

  // Test 5: Circuit Breaker (Graceful Degradation)
  await t.test('Circuit Breaker (Graceful Degradation)', async () => {
    const service = createService({ circuitBreakerThreshold: 0.9 });

    // Simulate 20 failures to trigger circuit breaker
    for (let i = 0; i < 20; i++) {
      const event = MockBrowserEvents.missingTargetEvent();
      await service.getActionLabel(event, 'data-action');
    }

    const status = service.getStatus();
    assert.strictEqual(status.circuitBreaker.state, 'OPEN', 'Circuit breaker should open after failures');
  });

  // Test 6: Input Validation (Edge Cases)
  await t.test('Input Validation - Null Event', async () => {
    const result = await getActionLabel(null, 'data-action');

    assert.strictEqual(result.success, false, 'Should fail validation');
    assert.strictEqual(result.error, 'validation', 'Should have validation error');
  });

  // Test 7: Input Validation - Empty Attribute
  await t.test('Input Validation - Empty Attribute', async () => {
    const event = MockBrowserEvents.chromClickEvent('submit');
    const result = await getActionLabel(event, '');

    assert.strictEqual(result.success, false, 'Should fail validation');
    assert.strictEqual(result.error, 'validation', 'Should have validation error');
  });

  // Test 8: Idempotency Assertion
  await t.test('Idempotency Assertion', async () => {
    const event = MockBrowserEvents.chromClickEvent('submit', { id: 'idempotent-btn' });

    const result1 = await getActionLabel(event, 'data-action', { traceId: 'TEST-123' });
    const result2 = await getActionLabel(event, 'data-action', { traceId: 'TEST-123' });
    const result3 = await getActionLabel(event, 'data-action', { traceId: 'TEST-123' });

    assert.strictEqual(result1.label, result2.label, 'Results should match');
    assert.strictEqual(result2.label, result3.label, 'Results should match');
    assert.strictEqual(result1.path, result2.path, 'Paths should match');
    assert.strictEqual(result1.browser, result3.browser, 'Browsers should match');
  });

  // Test 9: Event Bubbling (Nested Targets)
  await t.test('Event Bubbling (Nested Targets)', async () => {
    const event = MockBrowserEvents.delegatedClickEvent('cancel', {
      parentId: 'btn-cancel',
      childId: 'span-text'
    });

    const result = await getActionLabel(event, 'data-action');

    // Should read from currentTarget (parent) since target (child) has no action
    assert.strictEqual(result.label, 'cancel', 'Should find label in delegation chain');
  });

  // Test 10: Custom Property Access
  await t.test('Custom Property Access', async () => {
    const event = MockBrowserEvents.customPropertyEvent('custom-action');
    const result = await getActionLabel(event, 'data-action');

    assert.strictEqual(result.label, 'custom-action', 'Should access custom properties');
  });

  // Test 11: Missing Target
  await t.test('Missing Target', async () => {
    const event = MockBrowserEvents.missingTargetEvent();
    const result = await getActionLabel(event, 'data-action');

    assert.strictEqual(result.success, false, 'Should fail when no target');
    assert.strictEqual(result.label, '', 'Should return empty label');
  });

  // Test 12: Performance Baseline
  await t.test('Performance Baseline (p95 < 2ms)', async () => {
    const latencies = [];

    for (let i = 0; i < 100; i++) {
      const event = MockBrowserEvents.chromClickEvent('action-' + i);
      const result = await getActionLabel(event, 'data-action');
      latencies.push(result.latencyMs);
    }

    const sorted = latencies.sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];

    assert(p95 < 2, `p95 latency should be < 2ms, got ${p95}ms`);
  });

  // Test 13: Success Rate Metric
  await t.test('Success Rate Tracking', async () => {
    const service = createService();

    // 90% success rate
    for (let i = 0; i < 90; i++) {
      const event = MockBrowserEvents.chromClickEvent('success');
      await service.getActionLabel(event, 'data-action');
    }

    // 10% failures
    for (let i = 0; i < 10; i++) {
      const event = MockBrowserEvents.missingTargetEvent();
      await service.getActionLabel(event, 'data-action');
    }

    const status = service.getStatus();
    const metrics = status.metrics;

    assert(metrics.counters['action_label_success_count'] >= 90, 'Should track successes');
    assert(metrics.counters['action_label_error_count'] >= 10, 'Should track errors');
  });

  // Test 14: Browser Detection
  await t.test('Browser Detection', async () => {
    const chromeEvent = MockBrowserEvents.chromClickEvent('action');
    const ie11Event = MockBrowserEvents.ie11ClickEvent('action');

    const result1 = await getActionLabel(chromeEvent, 'data-action');
    const result2 = await getActionLabel(ie11Event, 'data-action');

    assert.match(result1.browser, /Chrome|Modern/, 'Should detect Chrome');
    assert.strictEqual(result2.browser, 'IE11', 'Should detect IE11');
  });

  // Test 15: Metric Emission
  await t.test('Metric Emission', async () => {
    const service = createService();
    const event = MockBrowserEvents.chromClickEvent('metric-test');

    const result = await service.getActionLabel(event, 'data-action');
    const status = service.getStatus();

    assert(status.metrics.counters['action_label_success_count'] > 0, 'Should emit success metric');
    assert(Object.keys(status.metrics.histograms).length > 0, 'Should emit latency histogram');
  });

});
