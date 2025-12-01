const test = require('node:test');
const assert = require('node:assert');

const { getActionLabelV2, resetIdempotencyStore, setIdempotencyBackend } = require('../src/index');
const { makeMockService } = require('../mocks/api_v2');
const { runSaga } = require('../src/saga');

function makeElementFromSpec(spec) {
  if (spec.getAttributeImpl) {
    return {
      getAttribute: (attr) => (attr === 'data-action' ? 'legacy-submit' : null),
      dataset: { action: 'legacy-dataset' }
    };
  }
  if (spec.dataset) {
    return { dataset: spec.dataset };
  }
  if (spec.getAttribute) {
    return {
      getAttribute: (attr) => (attr === 'data-action' ? spec.getAttribute : null),
      dataset: {}
    };
  }
  return {};
}

async function runAndCapture(fn) {
  const logs = [];
  const realConsoleLog = console.log;
  console.log = (...args) => { logs.push(args.join(' ')); };
  try {
    await fn();
  } finally {
    console.log = realConsoleLog;
  }
  return logs;
}

// Test 1 - srcElement attribute fallback

test('v2: falls back to srcElement attribute', async () => {
  resetIdempotencyStore();
  const event = { srcElement: makeElementFromSpec({ getAttributeImpl: true }) };
  const label = await getActionLabelV2(event, 'data-action', { requestId: 'rid-1' });
  assert.strictEqual(label, 'legacy-submit');
});

// Test 2 - dataset fallback

test('v2: reads dataset from srcElement when target missing', async () => {
  resetIdempotencyStore();
  const event = { srcElement: makeElementFromSpec({ dataset: { action: 'legacy-dataset-only' } }) };
  const label = await getActionLabelV2(event, 'data-action', { requestId: 'rid-2' });
  assert.strictEqual(label, 'legacy-dataset-only');
});

// Test 3 - idempotency

test('v2: idempotency ensures same response and prevents duplicate external calls', async () => {
  resetIdempotencyStore();
  const event = { target: makeElementFromSpec({ getAttribute: 'modern-submit' }) };
  const mockSvc = makeMockService({ delayMs: 0, failForAttempts: 0 });
  const extFn = (label, opts) => mockSvc.call(label, opts);

  const a = await getActionLabelV2(event, 'data-action', { requestId: 'rid-3', externalNormalizeFn: extFn, timeoutMs: 200 });
  assert.strictEqual(a, 'MODERN-SUBMIT');

  const b = await getActionLabelV2(event, 'data-action', { requestId: 'rid-3', externalNormalizeFn: extFn, timeoutMs: 200 });
  assert.strictEqual(b, 'MODERN-SUBMIT');
  assert.strictEqual(mockSvc.getAttemptCount(), 1, 'external service should only be called once due to idempotency');
});

// Test 4 - retry/backoff

test('v2: external transient failure triggers eventual success via retries', async () => {
  resetIdempotencyStore();
  const event = { target: makeElementFromSpec({ getAttribute: 'retry-action' }) };
  const mockSvc = makeMockService({ delayMs: 10, failForAttempts: 1 });

  async function extFnWithRetry(label, { timeoutMs } = {}) {
    const maxAttempts = 3;
    let attempt = 0;
    while (attempt < maxAttempts) {
      try {
        const result = await mockSvc.call(label, { timeoutMs });
        return result;
      } catch (e) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, Math.min(50 * attempt, 200)));
        if (attempt >= maxAttempts) throw e;
      }
    }
    return label;
  }

  const res = await getActionLabelV2(event, 'data-action', { requestId: 'rid-4', externalNormalizeFn: extFnWithRetry, timeoutMs: 200 });
  assert.strictEqual(res, 'RETRY-ACTION');
  assert.strictEqual(mockSvc.getAttemptCount(), 2, 'should have attempted twice: fail then success');
});

// Test 5 - timeout & circuit-breaker

test('v2: slow external triggers timeout and circuit breaker path', async () => {
  resetIdempotencyStore();
  const event = { target: makeElementFromSpec({ getAttribute: 'slow-action' }) };
  const mockSvc = makeMockService({ delayMs: 500, failForAttempts: 0 });
  const circuit = { open: false };

  const extFn = (label, opts) => mockSvc.call(label, opts);

  let threw = false;
  try {
    await getActionLabelV2(event, 'data-action', { requestId: 'rid-5', externalNormalizeFn: extFn, timeoutMs: 10, circuitBreaker: circuit });
  } catch (e) {
    threw = true;
  }
  assert.strictEqual(threw, false, 'v2 should not throw due to slow external');

  circuit.open = true;
  const preAttempts = mockSvc.getAttemptCount();
  const res = await getActionLabelV2(event, 'data-action', { requestId: 'rid-5b', externalNormalizeFn: extFn, timeoutMs: 10, circuitBreaker: circuit });
  assert.strictEqual(res, 'slow-action', 'label returns a safe fallback when circuit is open and external not invoked');
  assert.strictEqual(mockSvc.getAttemptCount(), preAttempts, 'circuit open should prevent external attempts');
});

// Test 6 - Saga/compensation

test('v2: saga pattern triggers compensation on side-effect failure', async () => {
  resetIdempotencyStore();
  let sideEffectDone = false;
  let compensationDone = false;

  async function doWork() {
    sideEffectDone = true;
    throw new Error('side effect failed');
  }

  async function compensate() {
    compensationDone = true;
    return true;
  }

  const r = await runSaga({ doWorkFn: doWork, compensationFn: compensate });
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.compensated, true);
  assert.strictEqual(sideEffectDone, true);
  assert.strictEqual(compensationDone, true);
});
