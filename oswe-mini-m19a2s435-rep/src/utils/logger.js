function maskSensitive(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const k of Object.keys(obj)) {
    if (/token|secret|password|ssn|credit/i.test(k)) out[k] = '***REDACTED***';
    else out[k] = obj[k];
  }
  return out;
}

const logger = {
  info: (msg, obj) => console.log(JSON.stringify({ level: 'info', msg, payload: maskSensitive(obj || {}), timestamp: new Date().toISOString() })),
  warn: (msg, obj) => console.warn(JSON.stringify({ level: 'warn', msg, payload: maskSensitive(obj || {}), timestamp: new Date().toISOString() })),
  error: (msg, obj) => console.error(JSON.stringify({ level: 'error', msg, payload: maskSensitive(obj || {}), timestamp: new Date().toISOString() })),
};

module.exports = logger;