/**
 * Input Validator
 * Validates event object and attribute name
 */

const { ValidationError } = require('./errors');

class Validator {
  /**
   * Validate event and attribute
   */
  validate(event, attribute) {
    // Validate event
    if (event === null || event === undefined) {
      throw new ValidationError('event must be an object or event-like object');
    }

    if (typeof event !== 'object') {
      throw new ValidationError('event must be an object');
    }

    // Validate attribute
    if (typeof attribute !== 'string') {
      throw new ValidationError('attribute must be a string');
    }

    if (attribute.trim().length === 0) {
      throw new ValidationError('attribute must not be empty');
    }

    // Validate attribute format (alphanumeric, dash, underscore)
    if (!/^[a-z][a-z0-9-_]*$/i.test(attribute)) {
      throw new ValidationError('attribute must be alphanumeric with dash/underscore');
    }

    return true;
  }

  /**
   * Validate event has valid target properties
   */
  hasValidTarget(event) {
    return !!(
      (event.target && typeof event.target === 'object') ||
      (event.srcElement && typeof event.srcElement === 'object') ||
      (event.currentTarget && typeof event.currentTarget === 'object')
    );
  }

  /**
   * Validate retrieved label
   */
  validateLabel(label) {
    if (typeof label !== 'string') {
      return false;
    }
    if (label.length > 256) {
      return false;
    }
    // Labels should be semantic (alphanumeric, dash, underscore)
    return /^[a-z0-9_-]*$/i.test(label);
  }
}

module.exports = Validator;
