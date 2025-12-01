/**
 * Mock Browser Events
 * Simulates different browser event shapes (Chrome, Firefox, Safari, IE11, Edge <79)
 */

class MockBrowserEvents {
  /**
   * Chrome / Modern Browsers (target-based)
   */
  static chromClickEvent(actionLabel, options = {}) {
    return {
      target: {
        id: options.id || 'btn-action',
        getAttribute: (attr) => attr === 'data-action' ? actionLabel : null,
        dataset: { action: actionLabel },
        tagName: 'BUTTON',
        className: options.className || 'button'
      },
      currentTarget: null,
      srcElement: null,
      type: 'click',
      bubbles: true,
      cancelable: true,
      timestamp: Date.now()
    };
  }

  /**
   * IE11 / Edge <79 (srcElement-based, no target)
   */
  static ie11ClickEvent(actionLabel, options = {}) {
    return {
      target: undefined,
      srcElement: {
        id: options.id || 'btn-action',
        getAttribute: (attr) => attr === 'data-action' ? actionLabel : null,
        dataset: { action: actionLabel },
        tagName: 'BUTTON',
        className: options.className || 'button'
      },
      currentTarget: null,
      type: 'click',
      bubbles: true,
      cancelable: true,
      timestamp: Date.now()
    };
  }

  /**
   * Event Delegation (target is child, currentTarget is parent)
   */
  static delegatedClickEvent(actionLabel, options = {}) {
    return {
      target: {
        id: options.childId || 'span-child',
        tagName: 'SPAN',
        textContent: options.childText || 'Click me'
      },
      currentTarget: {
        id: options.parentId || 'btn-parent',
        getAttribute: (attr) => attr === 'data-action' ? actionLabel : null,
        dataset: { action: actionLabel },
        tagName: 'BUTTON',
        className: 'button'
      },
      type: 'click',
      bubbles: true,
      cancelable: true,
      timestamp: Date.now()
    };
  }

  /**
   * Slow Attribute Reader (timeout simulation)
   * Throws error repeatedly to force retries with delays
   */
  static slowAttributeEvent(actionLabel, delayMs = 10) {
    let attempts = 0;
    return {
      target: {
        id: 'slow-button',
        getAttribute: (attr) => {
          attempts++;
          // Always throw to force retries
          throw new Error('Simulated slow read');
        },
        dataset: {}
      },
      type: 'click',
      timestamp: Date.now()
    };
  }

  /**
   * Missing Target (error condition)
   */
  static missingTargetEvent() {
    return {
      target: null,
      srcElement: null,
      currentTarget: null,
      type: 'click',
      timestamp: Date.now()
    };
  }

  /**
   * Flaky Target (sometimes fails)
   */
  static createFlakyTargetEvent(actionLabel, failCount = 2) {
    let attempts = 0;

    return {
      target: {
        id: 'flaky-button',
        getAttribute: (attr) => {
          attempts++;
          if (attempts <= failCount) {
            throw new Error('Temporary failure');
          }
          return attr === 'data-action' ? actionLabel : null;
        },
        dataset: {}
      },
      type: 'click',
      timestamp: Date.now()
    };
  }

  /**
   * Custom Property Target (non-standard)
   */
  static customPropertyEvent(actionLabel) {
    return {
      target: {
        id: 'custom-button',
        'data-action': actionLabel,
        getAttribute: () => null,
        dataset: {}
      },
      type: 'click',
      timestamp: Date.now()
    };
  }

  /**
   * Invalid Event (null/undefined)
   */
  static invalidEvent() {
    return null;
  }
}

module.exports = MockBrowserEvents;
