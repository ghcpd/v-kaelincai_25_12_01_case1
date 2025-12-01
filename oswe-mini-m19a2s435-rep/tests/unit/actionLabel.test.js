const test = require('node:test');
const assert = require('node:assert');
const { getActionLabel } = require('../../src/actionLabel');

function makeLegacyEvent(overrides = {}) {
  const element = overrides.element || {
    getAttribute: (attr) => (attr === 'data-action' ? 'legacy-submit' : null),
    dataset: { action: 'legacy-dataset' },
  };

  return {
    srcElement: element,
    ...overrides.eventProps,
  };
}

test('falls back to srcElement in legacy browsers', () => {
  const event = makeLegacyEvent();
  const label = getActionLabel(event, 'data-action');
  assert.strictEqual(label, 'legacy-submit');
});

test('reads dataset from srcElement when getAttribute missing', () => {
  const event = makeLegacyEvent({
    element: {
      dataset: { action: 'legacy-dataset-only' },
    },
  });

  const label = getActionLabel(event, 'data-action');
  assert.strictEqual(label, 'legacy-dataset-only');
});

// ensure we still support modern target
test('reads attribute from target.getAttribute when present', () => {
  const event = { target: { getAttribute: (a) => (a === 'data-action' ? 'modern' : null) } };
  const label = getActionLabel(event, 'data-action');
  assert.strictEqual(label, 'modern');
});

// malformed event
test('throws if no event', () => {
  assert.throws(() => getActionLabel(null), { name: 'TypeError' });
});