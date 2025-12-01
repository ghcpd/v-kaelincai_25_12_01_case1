/**
 * Attribute Reader
 * Implements 3-path fallback chain for retrieving attributes
 * 
 * Path 1: getAttribute() (W3C standard)
 * Path 2: dataset[key] (HTML5 standard)
 * Path 3: target[attribute] (dynamic property access)
 */

class AttributeReader {
  constructor() {
    this.lastMethod = null;
  }

  /**
   * Read attribute from target with fallback chain
   */
  read(target, attribute) {
    if (!target) {
      return '';
    }

    // Path 1: getAttribute() (W3C standard)
    if (typeof target.getAttribute === 'function') {
      try {
        const value = target.getAttribute(attribute);
        if (typeof value === 'string' && value.length > 0) {
          this.lastMethod = 'getAttribute';
          return value;
        }
      } catch (error) {
        // Continue to next path
      }
    }

    // Path 2: dataset[key] (HTML5 standard)
    if (target.dataset && attribute.startsWith('data-')) {
      try {
        const datasetKey = this.toDatasetKey(attribute);
        const value = target.dataset[datasetKey];
        if (typeof value === 'string' && value.length > 0) {
          this.lastMethod = 'dataset';
          return value;
        }
      } catch (error) {
        // Continue to next path
      }
    }

    // Path 3: Direct property access
    if (attribute in target) {
      try {
        const value = target[attribute];
        if (typeof value === 'string' && value.length > 0) {
          this.lastMethod = 'property';
          return value;
        }
      } catch (error) {
        // Continue to next path
      }
    }

    this.lastMethod = 'none';
    return '';
  }

  /**
   * Convert data-* attribute name to camelCase dataset key
   * e.g., 'data-action' → 'action'
   *      'data-my-action' → 'myAction'
   */
  toDatasetKey(attribute) {
    if (!attribute.startsWith('data-')) {
      return attribute;
    }

    return attribute
      .slice(5)
      .split('-')
      .map((chunk, index) => 
        index === 0 
          ? chunk 
          : chunk.charAt(0).toUpperCase() + chunk.slice(1)
      )
      .join('');
  }

  /**
   * Get read method used (for debugging/metrics)
   */
  getMethod() {
    return this.lastMethod;
  }
}

module.exports = AttributeReader;
