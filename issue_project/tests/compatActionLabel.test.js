const test = require('node:test');
const assert = require('node:assert');
const { getActionLabel } = require('../src/compatActionLabel');

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
  assert.strictEqual(
    label,
    'legacy-submit',
    'IE11-style events expose attributes only via srcElement'
  );
});

test('reads dataset from srcElement when target missing', () => {
  const event = makeLegacyEvent({
    element: {
      dataset: { action: 'legacy-dataset-only' },
    },
  });

  const label = getActionLabel(event, 'data-action');
  assert.strictEqual(
    label,
    'legacy-dataset-only',
    'dataset fallback should read from srcElement for compatibility'
  );
});
