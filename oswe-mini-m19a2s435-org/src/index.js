/*
 Greenfield replacement: resilient action label extraction and normalization
 - Resilient to event shapes (target, srcElement, currentTarget)
 - Dataset handling
 - Idempotency (via requestId) with pluggable backend (in-memory/Redis-like)
 - Optional external normalization service with timeout and circuit breaker
 - Structured JSON logging
*/

const { v4: uuidv4 } = require('uuid');

let idempotencyStore = new Map(); // in-memory default

const DEFAULT_ATTRIBUTE = 'data-action';

function toDatasetKey(attribute) {
  if (!attribute.startsWith('data-')) return attribute;
  return attribute
    .slice(5)
    .split('-')
    .map((chunk, index) => (index === 0 ? chunk : chunk.charAt(0).toUpperCase() + chunk.slice(1)))
    .join('');
}

function findTarget(event, extraTargets = []) {
  if (!event) return null;
  const candidates = [event.target, event.srcElement, event.currentTarget, ...extraTargets];
  for (const c of candidates) {
    if (c) return c;
  }
  return null;
}

function extractFromTarget(target, attribute) {
  if (!target) return '';
  if (typeof target.getAttribute === 'function') {
    const value = target.getAttribute(attribute);
    return typeof value === 'string' ? value : '';
  }
  if (target.dataset && attribute.startsWith('data-')) {
    const key = toDatasetKey(attribute);
    return typeof target.dataset[key] === 'string' ? target.dataset[key] : '';
  }
  if (attribute in target) {
    const value = target[attribute];
    return typeof value === 'string' ? value : '';
  }
  return '';
}

function safeLog(logObj) {
  // Structured logging as JSON; ensure sensitive values are redacted
  const redactRequestId = (v) => {
    if (v && typeof v === 'object' && v.requestId) {
      return { ...v, requestId: 'REDACTED' };
    }
    return v;
  };
  try {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(redactRequestId(logObj)));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('log failure', e);
  }
}

async function getActionLabelV2(event, attribute = DEFAULT_ATTRIBUTE, options = {}) {
  const { requestId: passedRequestId, externalNormalizeFn, timeoutMs = 1000, circuitBreaker } = options;
  const start = Date.now();
  const requestId = passedRequestId || uuidv4();
  const lifecycle = { init: true, inProgress: false, success: false, failure: false };
  lifecycle.inProgress = true;

  try {
    // Idempotent check
    if (requestId && idempotencyStore.has(requestId)) {
      safeLog({ event: 'idempotent_hit', requestId, start: new Date(start).toISOString() });
      lifecycle.success = true;
      lifecycle.inProgress = false;
      return idempotencyStore.get(requestId);
    }

    const target = findTarget(event);
    const rawLabel = extractFromTarget(target, attribute);
    let label = rawLabel || '';

    if (externalNormalizeFn && typeof externalNormalizeFn === 'function' && label) {
      lifecycle.externalCall = { started: true };
      if (circuitBreaker && circuitBreaker.open) {
        safeLog({ event: 'circuit_open', requestId, elapsed: Date.now() - start });
      } else {
        try {
          const result = externalNormalizeFn(label, { timeoutMs });
          if (result && typeof result.then === 'function') {
            const v = await Promise.race([
              result,
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
            ]).catch((e) => {
              safeLog({ event: 'external_normalize_error', error: '' + e, requestId });
              return null;
            });
            label = v || label;
          } else {
            label = result || label;
          }
        } catch (e) {
          safeLog({ event: 'external_call_fail', requestId, error: '' + e });
        }
      }
    }

    label = label.trim();

    if (requestId) {
      idempotencyStore.set(requestId, label);
      safeLog({ event: 'idempotency_set', requestId });
    }

    lifecycle.success = true;
    lifecycle.inProgress = false;
    safeLog({ event: 'extracted_label', requestId, label, elapsed: Date.now() - start });
    return label;
  } catch (e) {
    lifecycle.failure = true;
    lifecycle.inProgress = false;
    safeLog({ event: 'extraction_failure', requestId, error: '' + e });
    throw e;
  }
}

function resetIdempotencyStore() {
  idempotencyStore.clear();
}

function setIdempotencyBackend(backend) {
  idempotencyStore = backend || new Map();
}

module.exports = { getActionLabelV2, resetIdempotencyStore, setIdempotencyBackend, toDatasetKey, findTarget, extractFromTarget, safeLog };
