from __future__ import annotations
import time
from typing import Callable, Any


class CircuitOpenError(Exception):
    pass


class CircuitBreaker:
    """
    Simple circuit breaker.
    - fail_threshold: number of consecutive failures to open the circuit
    - reset_timeout: seconds to stay open before half-open trials
    """

    def __init__(self, fail_threshold: int = 3, reset_timeout: float = 5.0):
        self.fail_threshold = fail_threshold
        self.reset_timeout = reset_timeout
        self._fail_count = 0
        self._opened_at: float | None = None

    def _is_open(self) -> bool:
        if self._opened_at is None:
            return False
        if (time.time() - self._opened_at) >= self.reset_timeout:
            # half-open
            self._opened_at = None
            self._fail_count = 0
            return False
        return True

    def call(self, func: Callable, *args, **kwargs) -> Any:
        if self._is_open():
            raise CircuitOpenError("Circuit is open")
        try:
            result = func(*args, **kwargs)
            self._fail_count = 0
            return result
        except Exception:
            self._fail_count += 1
            if self._fail_count >= self.fail_threshold:
                self._opened_at = time.time()
            raise

    def closed(self) -> bool:
        return not self._is_open()
