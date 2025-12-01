/**
 * Logger Service
 * 
 * Structured logging with:
 * - JSON output for machine parsing
 * - Correlation IDs for request tracing
 * - Sensitive data masking
 * - Configurable log levels
 */

class Logger {
  constructor(config) {
    this.config = config;
    this.logs = []; // In-memory storage for testing
  }

  /**
   * Log an extraction attempt
   * 
   * @param {Object} context - Extraction context
   */
  logExtraction(context) {
    if (!this.config.logging.enabled) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: context.success ? 'info' : (context.error ? 'error' : 'warn'),
      service: 'event-label-extractor',
      version: '2.0.0',
      requestId: context.requestId,
      event: {
        type: 'extraction',
        browser: context.browser,
        attribute: context.attribute,
        value: context.value,
        method: context.method,
        durationMs: context.durationMs,
        success: context.success
      }
    };

    // Add optional fields
    if (context.reason) {
      logEntry.event.reason = context.reason;
    }

    if (context.warnings) {
      logEntry.event.warnings = context.warnings;
    }

    if (context.error) {
      logEntry.error = context.error;
    }

    if (context.stack) {
      logEntry.stack = context.stack;
    }

    // Store log entry
    this.logs.push(logEntry);

    // Output to console (would be replaced with proper logging service in production)
    if (this._shouldLog(logEntry.level)) {
      console.log(JSON.stringify(logEntry));
    }
  }

  /**
   * Mask sensitive values based on attribute name
   * 
   * @param {string} attribute - Attribute name
   * @param {string} value - Attribute value
   * @returns {string} Masked value if sensitive
   */
  maskSensitiveValue(attribute, value) {
    if (this.config.logging && this.config.logging.sensitiveAttributes && 
        this.config.logging.sensitiveAttributes.includes(attribute)) {
      // Partial masking: show first 4 chars
      if (value.length <= 4) {
        return '****';
      }
      return value.slice(0, 4) + '****' + value.slice(-4);
    }
    return value;
  }

  /**
   * Get all logs (for testing)
   */
  getLogs() {
    return this.logs;
  }

  /**
   * Clear logs (for testing)
   */
  clearLogs() {
    this.logs = [];
  }

  /**
   * Check if log level should be output
   */
  _shouldLog(level) {
    const levels = ['debug', 'info', 'warn', 'error'];
    const configLevel = this.config.logging.level;
    
    return levels.indexOf(level) >= levels.indexOf(configLevel);
  }
}

module.exports = { Logger };
