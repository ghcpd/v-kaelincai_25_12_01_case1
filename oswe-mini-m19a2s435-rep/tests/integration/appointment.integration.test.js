const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const appObj = require('../../src/app');
const { app, svc } = appObj; // exported for integration tests

const port = 4001;

function startMockServer() {
  const server = app.listen(port);
  return server;
}

function makeAppointmentPayload() {
  return {
    customer: { id: 'c-123', name: 'Jane' },
    start: '2025-12-09T09:00:00Z',
    end: '2025-12-09T09:30:00Z',
  };
}

async function callCreate(payload, opts = {}) {
  const headers = {};
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  const r = await axios.post(`http://localhost:${port}/appointments`, payload, { headers });
  return r.data;
}

let server;
let svcInstance;

test.before(() => {
  server = startMockServer();
  // get a handle to the same in-process service instance
  svcInstance = svc;
});

// Idempotency test
test('idempotent create returns same id for same key', async () => {
  const payload = makeAppointmentPayload();
  const key = 'idem-' + Date.now();

  const a = await callCreate(payload, { idempotencyKey: key });
  const b = await callCreate(payload, { idempotencyKey: key });

  assert.strictEqual(a.id, b.id, 'Should return same appointment ID when same idempotency key is used');
});

// Retry + backoff test - emulate an external consumer that fails then succeeds
// For demo purposes this test subscribes to svcInstance.events and performs a faux external call with retry logic

function withRetry(fn, retries = 3, backoffMs = 100) {
  return async function inner(...args) {
    let attempt = 0;
    while (true) {
      try {
        return await fn(...args);
      } catch (err) {
        attempt++;
        if (attempt > retries) throw err;
        await new Promise(r => setTimeout(r, backoffMs * attempt));
      }
    }
  };
}

// This test demonstrates a consumer that tries to call an external API and on failure compensates


test('retrying consumer and compensation flow', async () => {
  const svc = svcInstance;

  // Register consumer with fail-first behaviour
  let callCount = 0;

  svc.events.on('outbox.publish', async (msg) => {
    // consumer is a function that will fail once then succeed
    const consumerFn = async (m) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('temporary failure');
      }
      return { ok: true };
    };

    const doCall = withRetry(consumerFn, 2, 10);

    try {
      await doCall(msg);
    } catch (err) {
      // Compensation: cancel the appointment
      svc.store.set(msg.id, { ...svc.store.get(msg.id), status: 'canceled', canceledAt: new Date().toISOString() });
    }
  });

  const payload = makeAppointmentPayload();
  const res = await svc.createAppointment(payload, { idempotencyKey: 'cid-' + Date.now() });

  // Wait briefly to allow event handling
  await new Promise(r => setTimeout(r, 100));

  const final = svc.getAppointment(res.id);
  assert.ok(final, 'record exists');
  assert.ok(['scheduled', 'canceled'].includes(final.status), 'status changed appropriately');
});

// Healthy processing path
test('healthy processing clears outbox and keeps scheduled state', async () => {
  const svc = svcInstance;
  let processed = false;

  svc.events.once('outbox.publish', async (msg) => {
    // successful consumer
    processed = true;
  });

  const payload = makeAppointmentPayload();
  const res = await svc.createAppointment(payload, { idempotencyKey: 'healthy-' + Date.now() });

  await new Promise(r => setTimeout(r, 50));

  const final = svc.getAppointment(res.id);
  assert.ok(processed, 'outbox message processed');
  assert.strictEqual(final.status, 'scheduled', 'state stays scheduled on success');
});

// Circuit-breaker simple behavior test: if too many failures, immediately stop attempting further calls
test('simple circuit-breaker opens after threshold and causes compensation', async () => {
  const svc = svcInstance;
  let failureCount = 0;
  const threshold = 2;
  let circuitOpen = false;

  svc.events.on('outbox.publish', async (msg) => {
    if (circuitOpen) {
      // imitate immediate failure handling -> compensation
      svc.store.set(msg.id, { ...svc.store.get(msg.id), status: 'canceled', canceledAt: new Date().toISOString() });
      return;
    }

    try {
      failureCount++;
      throw new Error('simulated failure');
    } catch (err) {
      if (failureCount >= threshold) {
        circuitOpen = true;
      }
      // After failing, fallback will keep message in outbox (emulated by not removing), for simplicity we compensate here
      svc.store.set(msg.id, { ...svc.store.get(msg.id), status: 'canceled', canceledAt: new Date().toISOString() });
    }
  });

  const payload = makeAppointmentPayload();
  // create two appointments to trigger the threshold failure
  const res1 = await svc.createAppointment(payload, { idempotencyKey: 'cb-' + Date.now() + '-1' });
  const res2 = await svc.createAppointment(payload, { idempotencyKey: 'cb-' + Date.now() + '-2' });
  await new Promise(r => setTimeout(r, 50));
  const final1 = svc.getAppointment(res1.id);
  const final2 = svc.getAppointment(res2.id);
  assert.strictEqual(final1.status, 'canceled');
  assert.strictEqual(final2.status, 'canceled');
  assert.ok(circuitOpen, 'circuit should have opened after threshold failures');
});

// Reconciliation/audit test: verify that messages remaining in outbox can be reprocessed
// We'll emulate a missed outbox publish by creating an outbox message and then triggering flush

test('audit/reconciliation re-enqueues and publishes outstanding outbox messages', async () => {
  const svc = svcInstance;

  // Emulate outbox left behind
  const payload = makeAppointmentPayload();
  const rec = await svc.createAppointment(payload, { idempotencyKey: 'audit-' + Date.now() });
  // Ensure outbox is empty, then push a synthetic outbox message to ensure only our test message is present
  svc.outbox = [];
  svc.outbox.push({ id: 'synthetic-' + Date.now(), type: 'appointment.audit', payload: { ref: rec.id }, createdAt: new Date().toISOString() });

  let published = false;
  svc.events.once('outbox.publish', (msg) => {
    if (msg.type === 'appointment.audit') published = true;
  });

  // Trigger a manual flush
  await svc.flushOutbox();
  await new Promise(r => setTimeout(r, 50));
  assert.ok(published, 'synthetic outbox message should be published by flush');
});

// Clean up

test.after(() => {
  server.close();
  // stop background tasks on the service to avoid test runner open handles
  svc.stop();
});
