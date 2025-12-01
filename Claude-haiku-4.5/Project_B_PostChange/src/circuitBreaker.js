/**
 * Circuit Breaker
 * Tracks success/failure rate and transitions between states:
 * CLOSED → OPEN → HALF_OPEN → CLOSED
 */

class CircuitBreaker {
  constructor(successRateThreshold = 0.9, windowSizeMs = 60000) {
    this.threshold = successRateThreshold;
    this.windowSizeMs = windowSizeMs;
    this.state = 'CLOSED'; // CLOSED | OPEN | HALF_OPEN
    this.successCount = 0;
    this.failureCount = 0;
    this.lastStateChangeTime = Date.now();
    this.testRequestCount = 0; // Requests allowed in HALF_OPEN state
    this.maxTestRequests = 1;
  }

  /**
   * Record successful call
   */
  recordSuccess() {
    this.successCount++;

    // If in HALF_OPEN, close circuit on success
    if (this.state === 'HALF_OPEN') {
      this.close();
    }
  }

  /**
   * Record failed call
   */
  recordFailure() {
    this.failureCount++;

    // Check if we should open circuit
    if (this.state === 'CLOSED' || this.state === 'HALF_OPEN') {
      const successRate = this.getSuccessRate();
      if (successRate < this.threshold && this.getTotalCount() >= 20) {
        this.open();
      }
    }
  }

  /**
   * Check if circuit is open (requests should use fallback)
   */
  isOpen() {
    // Auto-transition from OPEN to HALF_OPEN after window
    if (this.state === 'OPEN') {
      const timeSinceOpen = Date.now() - this.lastStateChangeTime;
      if (timeSinceOpen >= this.windowSizeMs) {
        this.transitionToHalfOpen();
      }
    }

    return this.state === 'OPEN';
  }

  /**
   * Check if circuit allows request (even if HALF_OPEN)
   */
  canRequest() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') return false;
    if (this.state === 'HALF_OPEN') {
      // Allow limited test requests in HALF_OPEN
      return this.testRequestCount < this.maxTestRequests;
    }
    return false;
  }

  /**
   * Transition to OPEN state
   */
  open() {
    if (this.state !== 'OPEN') {
      this.state = 'OPEN';
      this.lastStateChangeTime = Date.now();
    }
  }

  /**
   * Transition to HALF_OPEN state
   */
  transitionToHalfOpen() {
    this.state = 'HALF_OPEN';
    this.testRequestCount = 0;
    this.lastStateChangeTime = Date.now();
  }

  /**
   * Transition to CLOSED state
   */
  close() {
    this.state = 'CLOSED';
    this.successCount = 0;
    this.failureCount = 0;
    this.lastStateChangeTime = Date.now();
  }

  /**
   * Get current success rate
   */
  getSuccessRate() {
    const total = this.getTotalCount();
    if (total === 0) return 1.0;
    return this.successCount / total;
  }

  /**
   * Get total request count
   */
  getTotalCount() {
    return this.successCount + this.failureCount;
  }

  /**
   * Get circuit breaker status
   */
  getStatus() {
    return {
      state: this.state,
      successRate: this.getSuccessRate(),
      successCount: this.successCount,
      failureCount: this.failureCount,
      totalCount: this.getTotalCount(),
      threshold: this.threshold,
      timeSinceStateChange: Date.now() - this.lastStateChangeTime
    };
  }

  /**
   * Reset circuit breaker (for testing)
   */
  reset() {
    this.state = 'CLOSED';
    this.successCount = 0;
    this.failureCount = 0;
    this.lastStateChangeTime = Date.now();
    this.testRequestCount = 0;
  }
}

module.exports = CircuitBreaker;
