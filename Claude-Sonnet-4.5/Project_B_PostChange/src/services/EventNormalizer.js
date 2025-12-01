/**
 * EventNormalizer Service
 * 
 * Handles browser-specific event object normalization.
 * Primary responsibility: Extract target element from various browser event structures.
 * 
 * Browser Compatibility Matrix:
 * - Modern (Chrome, Firefox, Safari, Edge Chromium): event.target
 * - IE11/Legacy Edge: event.srcElement
 * - Fallback: event.currentTarget
 */

class EventNormalizer {
  constructor(config) {
    this.config = config;
  }

  /**
   * Normalize a browser event to extract the target element
   * 
   * @param {Object} rawEvent - Raw browser event object
   * @param {string} requestId - Unique request identifier
   * @returns {Object} Normalized event with target and metadata
   */
  normalizeEvent(rawEvent, requestId) {
    const result = {
      target: null,
      browser: this._detectBrowser(rawEvent),
      method: 'none',
      requestId,
      timestamp: Date.now()
    };

    // CRITICAL FIX: Add srcElement fallback for IE11 compatibility
    // Priority order: target > srcElement > currentTarget
    
    if (rawEvent.target) {
      result.target = rawEvent.target;
      result.method = 'target';
    } else if (this.config.featureFlags.enableIE11Support && rawEvent.srcElement) {
      // IE11/Legacy Edge fallback
      result.target = rawEvent.srcElement;
      result.method = 'srcElement';
    } else if (rawEvent.currentTarget) {
      // Last resort fallback
      result.target = rawEvent.currentTarget;
      result.method = 'currentTarget';
    }

    return result;
  }

  /**
   * Detect browser type from event object characteristics
   * 
   * @param {Object} event - Browser event object
   * @returns {string} Browser type identifier
   */
  _detectBrowser(event) {
    // Heuristic detection based on available properties
    if (event.srcElement && !event.target) {
      return 'ie11'; // IE11 or Legacy Edge
    }
    
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      
      if (ua.includes('Chrome') && !ua.includes('Edge')) {
        return 'chrome';
      } else if (ua.includes('Firefox')) {
        return 'firefox';
      } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
        return 'safari';
      } else if (ua.includes('Edg/')) {
        return 'edge-chromium';
      } else if (ua.includes('Trident') || ua.includes('MSIE')) {
        return 'ie11';
      }
    }

    return 'unknown';
  }
}

module.exports = { EventNormalizer };
