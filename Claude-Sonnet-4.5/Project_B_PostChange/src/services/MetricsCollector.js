/**
 * MetricsCollector Service
 * 
 * Collects performance and success metrics:
 * - Extraction success/failure rates
 * - Latency histograms (p50, p95, p99)
 * - Browser distribution
 * - Method usage statistics
 */

class MetricsCollector {
  constructor(config) {
    this.config = config;
    this.metrics = {
      extractions: [],
      counters: {
        total: 0,
        success: 0,
        failure: 0
      },
      byBrowser: {},
      byMethod: {},
      latencies: []
    };
  }

  /**
   * Record an extraction attempt
   * 
   * @param {Object} context - Extraction context
   */
  recordExtraction(context) {
    if (!this.config.metrics.enabled) {
      return;
    }

    // Sample rate check
    if (Math.random() > this.config.metrics.sampleRate) {
      return;
    }

    const metric = {
      timestamp: Date.now(),
      browser: context.browser,
      method: context.method,
      success: context.success,
      durationMs: context.durationMs
    };

    // Store metric
    this.metrics.extractions.push(metric);

    // Update counters
    this.metrics.counters.total++;
    if (context.success) {
      this.metrics.counters.success++;
    } else {
      this.metrics.counters.failure++;
    }

    // Update browser stats
    if (!this.metrics.byBrowser[context.browser]) {
      this.metrics.byBrowser[context.browser] = { success: 0, failure: 0 };
    }
    if (context.success) {
      this.metrics.byBrowser[context.browser].success++;
    } else {
      this.metrics.byBrowser[context.browser].failure++;
    }

    // Update method stats
    if (!this.metrics.byMethod[context.method]) {
      this.metrics.byMethod[context.method] = { success: 0, failure: 0 };
    }
    if (context.success) {
      this.metrics.byMethod[context.method].success++;
    } else {
      this.metrics.byMethod[context.method].failure++;
    }

    // Store latency
    this.metrics.latencies.push(context.durationMs);
  }

  /**
   * Get current metrics snapshot
   * 
   * @returns {Object} Metrics summary
   */
  getMetrics() {
    return {
      counters: this.metrics.counters,
      successRate: this._calculateSuccessRate(),
      byBrowser: this.metrics.byBrowser,
      byMethod: this.metrics.byMethod,
      latency: this._calculateLatencyStats()
    };
  }

  /**
   * Calculate success rate
   */
  _calculateSuccessRate() {
    const total = this.metrics.counters.total;
    if (total === 0) return 0;
    return (this.metrics.counters.success / total) * 100;
  }

  /**
   * Calculate latency statistics
   */
  _calculateLatencyStats() {
    if (this.metrics.latencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0, avg: 0 };
    }

    const sorted = [...this.metrics.latencies].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      p50: sorted[Math.floor(len * 0.5)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)],
      avg: sorted.reduce((a, b) => a + b, 0) / len
    };
  }

  /**
   * Reset metrics (for testing)
   */
  reset() {
    this.metrics = {
      extractions: [],
      counters: { total: 0, success: 0, failure: 0 },
      byBrowser: {},
      byMethod: {},
      latencies: []
    };
  }
}

module.exports = { MetricsCollector };
