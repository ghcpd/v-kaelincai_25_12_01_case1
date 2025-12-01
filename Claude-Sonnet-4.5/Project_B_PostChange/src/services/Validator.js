/**
 * Validator Service
 * 
 * Handles input validation and sanitization for security:
 * - Attribute name validation (allowlist)
 * - Value length limits
 * - XSS prevention (basic sanitization)
 * - Type checking
 */

class Validator {
  constructor(config) {
    this.config = config;
  }

  /**
   * Validate attribute name and value
   * 
   * @param {string} attribute - Attribute name
   * @param {string} value - Attribute value
   * @returns {Object} Validation result
   */
  validate(attribute, value) {
    const result = {
      isValid: true,
      sanitized: false,
      originalValue: value,
      sanitizedValue: value,
      warnings: []
    };

    // Validate attribute name
    if (this.config.validation.attributeAllowlist) {
      if (!this.config.validation.attributeAllowlist.includes(attribute)) {
        result.isValid = false;
        result.warnings.push(`Attribute '${attribute}' not in allowlist`);
        return result;
      }
    }

    // Validate value type
    if (typeof value !== 'string') {
      result.isValid = false;
      result.warnings.push(`Value must be string, got ${typeof value}`);
      return result;
    }

    // Validate value length
    if (value.length > this.config.validation.maxValueLength) {
      result.isValid = false;
      result.warnings.push(`Value exceeds max length of ${this.config.validation.maxValueLength}`);
      return result;
    }

    // Sanitize value (basic XSS prevention)
    const sanitized = this._sanitizeValue(value);
    if (sanitized !== value) {
      result.sanitized = true;
      result.sanitizedValue = sanitized;
      result.warnings.push('Value was sanitized for security');
    }

    return result;
  }

  /**
   * Basic XSS sanitization
   * 
   * In production, use a proper library like DOMPurify
   * This is a minimal implementation for demonstration
   */
  _sanitizeValue(value) {
    // Remove script tags and event handlers
    return value
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/javascript:/gi, '')
      .trim();
  }
}

module.exports = { Validator };
