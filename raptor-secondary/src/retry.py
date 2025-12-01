from __future__ import annotations
import time
from typing import Callable, Any, Tuple


class RetryError(Exception):
    def __init__(self, last_exception: Exception, attempts: int):
        super().__init__(str(last_exception))
        self.last_exception = last_exception
        self.attempts = attempts


def retry_with_backoff(func: Callable, max_attempts: int = 3, base_delay: float = 0.05, multiplier: float = 2.0) -> Tuple[Any, int]:
    """
    Calls func with exponential backoff. Returns (result, attempts).
    Raises RetryError on exhaustion.
    """
    attempt = 0
    while True:
        try:
            attempt += 1
            return func(), attempt
        except Exception as exc:  # pragma: no cover - exercise in tests
            if attempt >= max_attempts:
                raise RetryError(exc, attempt)
            sleep_for = base_delay * (multiplier ** (attempt - 1))
            time.sleep(sleep_for)
