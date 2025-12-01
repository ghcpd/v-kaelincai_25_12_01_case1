// Simple saga helper to simulate compensation if side effects fail

async function runSaga({ doWorkFn, compensationFn }) {
  // Steps: doWorkFn -> success or failure -> if failure call compensation
  try {
    const result = await doWorkFn();
    return { success: true, result };
  } catch (e) {
    try {
      await compensationFn();
      return { success: false, compensated: true, error: '' + e };
    } catch (cErr) {
      return { success: false, compensated: false, error: '' + e, compensationError: '' + cErr };
    }
  }
}

module.exports = { runSaga };
