/**
 * AttributeExtractor Service
 * 
 * Handles attribute extraction with multiple fallback strategies:
 * 1. getAttribute() method (most reliable)
 * 2. dataset property (for data-* attributes)
 * 3. Direct property access (legacy fallback)
 * 
 * Strategy Pattern: Try each method in order until one succeeds
 */

class AttributeExtractor {
  constructor(config) {
    this.config = config;
  }

  /**
   * Extract attribute value from element using multiple strategies
   * 
   * @param {HTMLElement} element - DOM element
   * @param {string} attribute - Attribute name
   * @param {string} requestId - Request identifier for logging
   * @returns {Object} Extraction result with value and metadata
   */
  extractAttribute(element, attribute, requestId) {
    const result = {
      value: '',
      method: 'failed',
      success: false,
      requestId
    };

    // Strategy 1: getAttribute() - Most reliable
    const getAttributeResult = this._tryGetAttribute(element, attribute);
    if (getAttributeResult.success) {
      return getAttributeResult;
    }

    // Strategy 2: dataset - For data-* attributes
    if (attribute.startsWith('data-')) {
      const datasetResult = this._tryDataset(element, attribute);
      if (datasetResult.success) {
        return datasetResult;
      }
    }

    // Strategy 3: Direct property access - Legacy fallback
    const propertyResult = this._tryPropertyAccess(element, attribute);
    if (propertyResult.success) {
      return propertyResult;
    }

    // All strategies failed
    return result;
  }

  /**
   * Strategy 1: Try getAttribute() method
   */
  _tryGetAttribute(element, attribute) {
    try {
      if (typeof element.getAttribute === 'function') {
        const value = element.getAttribute(attribute);
        
        if (typeof value === 'string' && value !== '') {
          return {
            value,
            method: 'getAttribute',
            success: true
          };
        }
      }
    } catch (error) {
      // Ignore errors, try next strategy
    }

    return { success: false };
  }

  /**
   * Strategy 2: Try dataset property access
   */
  _tryDataset(element, attribute) {
    try {
      if (element.dataset && attribute.startsWith('data-')) {
        const datasetKey = this._toDatasetKey(attribute);
        const value = element.dataset[datasetKey];
        
        if (typeof value === 'string' && value !== '') {
          return {
            value,
            method: 'dataset',
            success: true
          };
        }
      }
    } catch (error) {
      // Ignore errors, try next strategy
    }

    return { success: false };
  }

  /**
   * Strategy 3: Try direct property access
   */
  _tryPropertyAccess(element, attribute) {
    try {
      if (attribute in element) {
        const value = element[attribute];
        
        if (typeof value === 'string' && value !== '') {
          return {
            value,
            method: 'property',
            success: true
          };
        }
      }
    } catch (error) {
      // Ignore errors, return failure
    }

    return { success: false };
  }

  /**
   * Convert data-* attribute name to dataset key
   * Example: 'data-action-label' -> 'actionLabel'
   */
  _toDatasetKey(attribute) {
    if (!attribute.startsWith('data-')) {
      return attribute;
    }

    return attribute
      .slice(5) // Remove 'data-'
      .split('-')
      .map((chunk, index) => 
        index === 0 
          ? chunk 
          : chunk.charAt(0).toUpperCase() + chunk.slice(1)
      )
      .join('');
  }
}

module.exports = { AttributeExtractor };
