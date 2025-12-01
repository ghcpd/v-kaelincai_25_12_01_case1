// mock external normalization service

function makeMockService({ delayMs = 0, failForAttempts = 0, succeedValue = null } = {}) {
  let attempt = 0;
  return {
    call(label, { timeoutMs } = {}) {
      attempt += 1;
      return new Promise((resolve, reject) => {
        if (delayMs > 0 && delayMs > timeoutMs) {
          // cause a timeout simulated by never resolving within test harness; we'll simulate by rejecting
          setTimeout(() => reject(new Error('timeout')), timeoutMs);
          return;
        }

        setTimeout(() => {
          if (attempt <= failForAttempts) {
            reject(new Error('transient failure'));
          } else {
            resolve(succeedValue || label.toUpperCase());
          }
        }, delayMs);
      });
    },
    getAttemptCount() { return attempt; }
  };
}

module.exports = { makeMockService };
