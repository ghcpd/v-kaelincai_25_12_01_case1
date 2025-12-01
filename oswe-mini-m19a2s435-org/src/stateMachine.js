// Lifecycle state machine

const STATES = {
  INIT: 'init',
  IN_PROGRESS: 'in-progress',
  SUCCESS: 'success',
  FAILURE: 'failure',
  COMPENSATING: 'compensating'
};

function nextState(current, event) {
  switch (current) {
    case STATES.INIT:
      if (event === 'start') return STATES.IN_PROGRESS;
      return current;
    case STATES.IN_PROGRESS:
      if (event === 'complete') return STATES.SUCCESS;
      if (event === 'error') return STATES.FAILURE;
      return current;
    case STATES.FAILURE:
      if (event === 'compensate') return STATES.COMPENSATING;
      return current;
    case STATES.COMPENSATING:
      if (event === 'compensated') return STATES.SUCCESS;
      return current;
    default:
      return current;
  }
}

module.exports = { STATES, nextState };
