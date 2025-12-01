/**
 * Request ID Generator
 * 
 * Generates unique identifiers for request tracing
 */

/**
 * Generate a unique request ID (UUID v4 format)
 * 
 * @returns {string} UUID v4 string
 */
function generateRequestId() {
  // Simple UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = { generateRequestId };
