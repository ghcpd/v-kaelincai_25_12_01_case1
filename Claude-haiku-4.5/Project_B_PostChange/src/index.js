/**
 * Action Label Service v2 - Public API
 * 
 * Resilient, observable browser event action label service with:
 * - Multi-path event target resolution (target → srcElement → currentTarget)
 * - Timeout guard (5ms max)
 * - Retry with exponential backoff
 * - Circuit breaker for graceful degradation
 * - Structured logging and metrics
 * - Full idempotency
 */

const { v4: uuid } = require('uuid');
const Validator = require('./validator');
const EventResolver = require('./eventResolver');
const AttributeReader = require('./attributeReader');
const CircuitBreaker = require('./circuitBreaker');
const Logger = require('./observability/logger');
const Metrics = require('./observability/metrics');
const { ActionLabelError, ValidationError, TimeoutError } = require('./errors');

class ActionLabelService {
  constructor(options = {}) {
    this.validator = new Validator();
    this.eventResolver = new EventResolver();
    this.attributeReader = new AttributeReader();
    this.circuitBreaker = new CircuitBreaker(options.circuitBreakerThreshold || 0.9);
    this.logger = options.logger || new Logger();
    this.metrics = options.metrics || new Metrics();
    this.cache = new Map(); // Simple element ID → label cache
    this.defaultTimeout = options.timeout || 5;
    this.defaultAttribute = options.defaultAttribute || 'data-action';
  }

  /**
   * Retrieve action label from browser event with full resilience stack
   */
  async getActionLabel(event, attribute = null, options = {}) {
    const traceId = options.traceId || uuid();
    const startTime = Date.now();
    
    try {
      // 1. Validate input
      // Only use default if attribute is null/undefined, not if it's an empty string
      if (attribute === null || attribute === undefined) {
        attribute = this.defaultAttribute;
      }
      this.validator.validate(event, attribute);

      // 2. Check circuit breaker
      if (this.circuitBreaker.isOpen()) {
        const cachedLabel = this.getCachedLabel(event);
        this.logger.warn('CIRCUIT_BREAKER_OPEN', {
          traceId,
          fallback: cachedLabel ? 'cached' : 'empty_string',
          latencyMs: Date.now() - startTime
        });
        this.metrics.inc('circuit_breaker_open_fallback');
        return {
          label: cachedLabel || '',
          success: !!cachedLabel,
          browser: this.detectBrowser(event),
          latencyMs: Date.now() - startTime,
          traceId,
          error: 'circuit_open',
          path: 'cache'
        };
      }

      // 3. Set up timeout guard
      const timeout = options.timeout || this.defaultTimeout;
      const result = await this.withTimeout(
        this.executeWithRetry(event, attribute, options),
        timeout,
        traceId
      );

      // 4. Record success
      this.circuitBreaker.recordSuccess();
      this.cacheLabel(event, result.label);
      
      const latency = Date.now() - startTime;
      this.logger.info('ACTION_LABEL_RETRIEVED', {
        traceId,
        label: result.label,
        browser: result.browser,
        path: result.path,
        latencyMs: latency,
        success: true
      });
      
      this.metrics.histogram('action_label_latency_ms', latency, {
        browser: result.browser,
        path: result.path,
        success: true
      });
      this.metrics.inc('action_label_success_count');

      return {
        ...result,
        traceId,
        latencyMs: latency,
        success: true
      };

    } catch (error) {
      // 5. Handle errors
      this.circuitBreaker.recordFailure();

      const latency = Date.now() - startTime;
      
      // Map error codes to user-friendly names
      let errorCode = error.code || 'unknown_error';
      if (errorCode === 'VALIDATION_ERROR') errorCode = 'validation';
      if (errorCode === 'TIMEOUT_ERROR') errorCode = 'timeout';
      if (errorCode === 'NOT_FOUND_ERROR') errorCode = 'not_found';
      if (errorCode === 'CIRCUIT_BREAKER_OPEN') errorCode = 'circuit_open';
      
      const errorResponse = {
        label: '',
        success: false,
        browser: this.detectBrowser(event),
        latencyMs: latency,
        traceId,
        error: errorCode,
        reason: error.message
      };

      this.logger.error('ACTION_LABEL_ERROR', {
        ...errorResponse,
        stack: error.stack
      });

      // Increment both untagged and tagged error counters
      this.metrics.inc('action_label_error_count');
      this.metrics.inc('action_label_error_count', {
        errorType: errorCode
      });

      // Return error response instead of throwing (graceful degradation)
      return errorResponse;
    }
  }

  /**
   * Execute with automatic retry on transient failures
   */
  async executeWithRetry(event, attribute, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const baseDelayMs = options.baseDelayMs || 10;
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Yield to event loop to allow timeout to fire
        await Promise.resolve();
        
        const target = this.eventResolver.resolve(event);
        if (!target) {
          throw new Error('No target resolved');
        }

        let label = this.attributeReader.read(target, attribute);
        let path = this.eventResolver.lastPath;

        // If we didn't find the label in the resolved target, try the delegation chain
        if (!label && path === 'target' && event.currentTarget) {
          label = this.attributeReader.read(event.currentTarget, attribute);
          if (label) {
            path = 'currentTarget';
          }
        }

        // If still no label found, throw error to trigger retry (except on last attempt)
        if (!label) {
          if (attempt < maxRetries - 1) {
            throw new Error('Attribute not found, retrying');
          }
          // On last attempt, return the empty label result
        }

        const browser = this.detectBrowser(event);

        return { label, browser, path };

      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries - 1) {
          const delayMs = baseDelayMs * Math.pow(2, attempt);
          this.metrics.inc('action_label_retry_attempt', { attempt });
          await this.sleep(delayMs);
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Wrap promise with timeout
   */
  withTimeout(promise, timeoutMs, traceId) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => {
          this.metrics.inc('action_label_timeout_count');
          reject(new TimeoutError(`Timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  }

  /**
   * Detect browser family from event
   */
  detectBrowser(event) {
    if (!event) return 'Unknown';

    // IE11 / Edge <79
    if (event.srcElement && !event.target) return 'IE11';
    
    // Modern browsers (target-based)
    if (event.target) {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      if (ua.includes('Chrome') && !ua.includes('Edge')) return 'Chrome';
      if (ua.includes('Firefox')) return 'Firefox';
      if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
      if (ua.includes('Edge')) return 'Edge';
      return 'Modern';
    }

    return 'Unknown';
  }

  /**
   * Cache label for element
   */
  cacheLabel(event, label) {
    const target = event.target || event.srcElement || event.currentTarget;
    if (target && target.id) {
      this.cache.set(target.id, { label, timestamp: Date.now() });
    }
  }

  /**
   * Retrieve cached label
   */
  getCachedLabel(event) {
    const target = event.target || event.srcElement || event.currentTarget;
    if (target && target.id) {
      const cached = this.cache.get(target.id);
      if (cached && Date.now() - cached.timestamp < 60000) { // 60s TTL
        this.metrics.inc('cache_hit');
        return cached.label;
      }
    }
    this.metrics.inc('cache_miss');
    return null;
  }

  /**
   * Helper: sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get circuit breaker status
   */
  getStatus() {
    return {
      circuitBreaker: {
        state: this.circuitBreaker.state,
        successRate: this.circuitBreaker.getSuccessRate(),
        successCount: this.circuitBreaker.successCount,
        failureCount: this.circuitBreaker.failureCount
      },
      metrics: this.metrics.getSnapshot(),
      cacheSize: this.cache.size
    };
  }

  /**
   * Reset circuit breaker (for testing)
   */
  reset() {
    this.circuitBreaker.reset();
    this.cache.clear();
  }
}

// Export singleton instance
const service = new ActionLabelService();

module.exports = {
  ActionLabelService,
  getActionLabel: (event, attribute, options) => service.getActionLabel(event, attribute, options),
  getStatus: () => service.getStatus(),
  reset: () => service.reset(),
  // For testing
  createService: (options) => new ActionLabelService(options)
};
