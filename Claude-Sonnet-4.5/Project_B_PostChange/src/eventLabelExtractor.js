/**
 * Event Label Extractor v2.0 - Greenfield Replacement
 * 
 * Features:
 * - IE11/Legacy browser compatibility via srcElement fallback
 * - Modular architecture with separation of concerns
 * - Comprehensive error handling and logging
 * - Input validation and security hardening
 * - Performance monitoring and metrics collection
 */

const { EventNormalizer } = require('./services/EventNormalizer');
const { AttributeExtractor } = require('./services/AttributeExtractor');
const { Validator } = require('./services/Validator');
const { Logger } = require('./services/Logger');
const { MetricsCollector } = require('./services/MetricsCollector');
const { generateRequestId } = require('./utils/requestId');

/**
 * Configuration with defaults
 */
const DEFAULT_CONFIG = {
  logging: {
    enabled: true,
    level: 'info',
    sensitiveAttributes: ['data-user-id', 'data-token', 'data-password']
  },
  validation: {
    enabled: true,
    attributeAllowlist: null, // null = allow all, array = allowlist mode
    maxValueLength: 256
  },
  metrics: {
    enabled: true,
    sampleRate: 1.0 // 100% sampling in tests, reduce in production
  },
  featureFlags: {
    enableIE11Support: true,
    enableValidation: true,
    enableMetrics: true
  }
};

/**
 * Main extraction function - Greenfield v2
 * 
 * @param {Object} event - DOM event object (browser-specific)
 * @param {string} attribute - Attribute name to extract (e.g., 'data-action')
 * @param {Object} config - Configuration overrides
 * @returns {string} Extracted attribute value or empty string
 */
function getActionLabel(event, attribute = 'data-action', config = {}) {
  const startTime = performance.now();
  const requestId = generateRequestId();
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Service initialization
  const normalizer = new EventNormalizer(mergedConfig);
  const extractor = new AttributeExtractor(mergedConfig);
  const validator = new Validator(mergedConfig);
  const logger = new Logger(mergedConfig);
  const metrics = new MetricsCollector(mergedConfig);

  try {
    // STEP 1: VALIDATE INPUT
    if (!event) {
      throw new TypeError('An event-like object is required');
    }

    // STEP 2: NORMALIZE EVENT (Browser Compatibility Layer)
    const normalizedEvent = normalizer.normalizeEvent(event, requestId);
    
    if (!normalizedEvent.target) {
      const duration = performance.now() - startTime;
      logger.logExtraction({
        requestId,
        browser: normalizedEvent.browser,
        attribute,
        value: '',
        method: 'none',
        durationMs: duration,
        success: false,
        reason: 'no-target-found'
      });
      
      metrics.recordExtraction({
        browser: normalizedEvent.browser,
        method: 'none',
        success: false,
        durationMs: duration
      });
      
      return '';
    }

    // STEP 3: EXTRACT ATTRIBUTE
    const extractionResult = extractor.extractAttribute(
      normalizedEvent.target,
      attribute,
      requestId
    );

    // STEP 4: VALIDATE & SANITIZE
    let finalValue = extractionResult.value;
    
    if (mergedConfig.featureFlags.enableValidation && extractionResult.success) {
      const validationResult = validator.validate(attribute, finalValue);
      
      if (!validationResult.isValid) {
        logger.logExtraction({
          requestId,
          browser: normalizedEvent.browser,
          attribute,
          value: finalValue,
          method: extractionResult.method,
          durationMs: performance.now() - startTime,
          success: false,
          reason: 'validation-failed',
          warnings: validationResult.warnings
        });
        
        return '';
      }
      
      finalValue = validationResult.sanitizedValue;
    }

    // STEP 5: LOG SUCCESS
    const duration = performance.now() - startTime;
    
    logger.logExtraction({
      requestId,
      browser: normalizedEvent.browser,
      attribute,
      value: logger.maskSensitiveValue(attribute, finalValue),
      method: `${normalizedEvent.method}->${extractionResult.method}`,
      durationMs: duration,
      success: true
    });

    // STEP 6: RECORD METRICS
    metrics.recordExtraction({
      browser: normalizedEvent.browser,
      method: extractionResult.method,
      success: true,
      durationMs: duration
    });

    return finalValue;

  } catch (error) {
    const duration = performance.now() - startTime;
    
    logger.logExtraction({
      requestId,
      browser: 'unknown',
      attribute,
      value: '',
      method: 'error',
      durationMs: duration,
      success: false,
      error: error.message,
      stack: error.stack
    });

    metrics.recordExtraction({
      browser: 'unknown',
      method: 'error',
      success: false,
      durationMs: duration
    });

    // Re-throw TypeError for fast-fail on invalid input
    if (error instanceof TypeError) {
      throw error;
    }

    // Swallow other errors and return empty string (graceful degradation)
    return '';
  }
}

module.exports = { 
  getActionLabel,
  DEFAULT_CONFIG
};
