/**
 * Custom Error Classes
 */

class ActionLabelError extends Error {
  constructor(message, code = 'UNKNOWN') {
    super(message);
    this.name = 'ActionLabelError';
    this.code = code;
  }
}

class ValidationError extends ActionLabelError {
  constructor(message) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

class TimeoutError extends ActionLabelError {
  constructor(message) {
    super(message, 'TIMEOUT_ERROR');
    this.name = 'TimeoutError';
  }
}

class NotFoundError extends ActionLabelError {
  constructor(message) {
    super(message, 'NOT_FOUND_ERROR');
    this.name = 'NotFoundError';
  }
}

class CircuitBreakerOpenError extends ActionLabelError {
  constructor(message) {
    super(message, 'CIRCUIT_BREAKER_OPEN');
    this.name = 'CircuitBreakerOpenError';
  }
}

module.exports = {
  ActionLabelError,
  ValidationError,
  TimeoutError,
  NotFoundError,
  CircuitBreakerOpenError
};
