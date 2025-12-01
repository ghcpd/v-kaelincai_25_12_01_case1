/**
 * Structured Logger
 * Logs with standardized schema: timestamp, traceId, level, component, event, details
 */

const fs = require('fs');
const path = require('path');

class Logger {
  constructor(options = {}) {
    this.component = 'getActionLabel';
    this.logDir = options.logDir || './logs';
    this.enableConsole = options.enableConsole !== false;
    this.enableFile = options.enableFile !== false;

    // Create logs directory if needed
    if (this.enableFile && !fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.logBuffer = [];
  }

  /**
   * Mask sensitive fields
   */
  maskSensitiveFields(obj) {
    const masked = { ...obj };
    const sensitiveFields = ['userId', 'sessionId', 'email', 'phone'];

    for (const field of sensitiveFields) {
      if (field in masked) {
        masked[field] = '**MASKED**';
      }
    }

    return masked;
  }

  /**
   * Create log entry
   */
  createEntry(level, event, details = {}) {
    return {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      event,
      details: this.maskSensitiveFields(details)
    };
  }

  /**
   * Emit log entry
   */
  emit(entry) {
    this.logBuffer.push(entry);

    if (this.enableConsole) {
      console.log(JSON.stringify(entry));
    }

    if (this.enableFile && this.logBuffer.length >= 100) {
      this.flush();
    }
  }

  /**
   * Log info level
   */
  info(event, details) {
    this.emit(this.createEntry('INFO', event, details));
  }

  /**
   * Log warn level
   */
  warn(event, details) {
    this.emit(this.createEntry('WARN', event, details));
  }

  /**
   * Log error level
   */
  error(event, details) {
    this.emit(this.createEntry('ERROR', event, details));
  }

  /**
   * Flush logs to file
   */
  flush() {
    if (this.enableFile && this.logBuffer.length > 0) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = path.join(this.logDir, `action_label_${timestamp}.jsonl`);

      const content = this.logBuffer
        .map(entry => JSON.stringify(entry))
        .join('\n') + '\n';

      fs.appendFileSync(logFile, content);
      this.logBuffer = [];
    }
  }

  /**
   * Get buffered logs
   */
  getLogs() {
    return [...this.logBuffer];
  }

  /**
   * Clear buffer
   */
  clear() {
    this.logBuffer = [];
  }
}

module.exports = Logger;
