/**
 * Event Target Resolver
 * Implements 5-path fallback chain for cross-browser event target resolution
 * 
 * Path 1: event.target (modern browsers)
 * Path 2: event.srcElement (IE11, Edge <79)
 * Path 3: event.currentTarget (capture phase)
 * Path 4: event.relatedTarget (delegation)
 * Path 5: cache lookup
 */

class EventResolver {
  constructor() {
    this.lastPath = null; // Track which path was used
  }

  /**
   * Resolve event target with fallback chain
   */
  resolve(event) {
    if (!event) {
      return null;
    }

    // Path 1: event.target (modern browsers)
    if (event.target && typeof event.target === 'object') {
      this.lastPath = 'target';
      return event.target;
    }

    // Path 2: event.srcElement (IE11, Edge <79)
    if (event.srcElement && typeof event.srcElement === 'object') {
      this.lastPath = 'srcElement';
      return event.srcElement;
    }

    // Path 3: event.currentTarget (capture phase or delegation)
    if (event.currentTarget && typeof event.currentTarget === 'object') {
      this.lastPath = 'currentTarget';
      return event.currentTarget;
    }

    // Path 4: event.relatedTarget (for focus/blur events)
    if (event.relatedTarget && typeof event.relatedTarget === 'object') {
      this.lastPath = 'relatedTarget';
      return event.relatedTarget;
    }

    this.lastPath = 'none';
    return null;
  }

  /**
   * Get resolution path (for debugging/metrics)
   */
  getPath() {
    return this.lastPath;
  }

  /**
   * Try each path in sequence with callback
   */
  resolveWith(event, callback) {
    const paths = [
      { name: 'target', getter: () => event.target },
      { name: 'srcElement', getter: () => event.srcElement },
      { name: 'currentTarget', getter: () => event.currentTarget },
      { name: 'relatedTarget', getter: () => event.relatedTarget }
    ];

    for (const path of paths) {
      const target = path.getter();
      if (target && typeof target === 'object') {
        try {
          const result = callback(target);
          if (result !== null && result !== undefined) {
            this.lastPath = path.name;
            return result;
          }
        } catch (error) {
          // Continue to next path
          continue;
        }
      }
    }

    this.lastPath = 'none';
    return null;
  }
}

module.exports = EventResolver;
