/**
 * Metrics Collection
 * Tracks counters, histograms, and gauge metrics
 */

class Metrics {
  constructor() {
    this.counters = new Map();
    this.histograms = new Map();
    this.gauges = new Map();
    this.startTime = Date.now();
  }

  /**
   * Increment counter
   */
  inc(name, tags = {}) {
    const key = this.makeKey(name, tags);
    this.counters.set(key, (this.counters.get(key) || 0) + 1);
  }

  /**
   * Record histogram value
   */
  histogram(name, value, tags = {}) {
    const key = this.makeKey(name, tags);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key).push(value);
  }

  /**
   * Set gauge value
   */
  gauge(name, value, tags = {}) {
    const key = this.makeKey(name, tags);
    this.gauges.set(key, value);
  }

  /**
   * Make metric key with tags
   */
  makeKey(name, tags = {}) {
    if (Object.keys(tags).length === 0) {
      return name;
    }
    const tagStr = Object.entries(tags)
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${tagStr}}`;
  }

  /**
   * Get percentile from histogram
   */
  getPercentile(name, percentile, tags = {}) {
    const key = this.makeKey(name, tags);
    const values = this.histograms.get(key) || [];
    if (values.length === 0) return 0;

    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get counter value
   */
  getCounter(name, tags = {}) {
    const key = this.makeKey(name, tags);
    return this.counters.get(key) || 0;
  }

  /**
   * Get all metrics snapshot
   */
  getSnapshot() {
    const snapshot = {
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      counters: Object.fromEntries(this.counters),
      histograms: {},
      gauges: Object.fromEntries(this.gauges)
    };

    // Convert histograms to percentiles
    for (const [key, values] of this.histograms) {
      if (values.length > 0) {
        const sorted = values.sort((a, b) => a - b);
        snapshot.histograms[key] = {
          count: values.length,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          p50: this.getPercentile(key.split('{')[0], 50),
          p95: this.getPercentile(key.split('{')[0], 95),
          p99: this.getPercentile(key.split('{')[0], 99),
          mean: values.reduce((a, b) => a + b, 0) / values.length
        };
      }
    }

    return snapshot;
  }

  /**
   * Reset metrics
   */
  reset() {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
    this.startTime = Date.now();
  }
}

module.exports = Metrics;
