from __future__ import annotations
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class IdempotencyRecord:
    key: str
    status: str  # init, in_progress, completed, failed
    response: Any = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    retries: int = 0
    error: Optional[str] = None


class IdempotencyStore:
    """
    Simple in-memory idempotency store. Suitable for tests/demo only.
    """

    def __init__(self):
        self._records: Dict[str, IdempotencyRecord] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[IdempotencyRecord]:
        with self._lock:
            return self._records.get(key)

    def begin(self, key: str) -> IdempotencyRecord:
        with self._lock:
            rec = self._records.get(key)
            if rec:
                # Return existing (could be in_progress/completed/failed)
                return rec
            rec = IdempotencyRecord(key=key, status="in_progress")
            self._records[key] = rec
            return rec

    def complete(self, key: str, response: Any, status: str = "completed", error: Optional[str] = None) -> IdempotencyRecord:
        with self._lock:
            rec = self._records.get(key)
            if not rec:
                rec = IdempotencyRecord(key=key, status=status, response=response)
                self._records[key] = rec
            rec.response = response
            rec.status = status
            rec.error = error
            rec.updated_at = time.time()
            return rec

    def bump_retry(self, key: str) -> IdempotencyRecord:
        with self._lock:
            rec = self._records.get(key)
            if not rec:
                rec = IdempotencyRecord(key=key, status="in_progress")
                self._records[key] = rec
            rec.retries += 1
            rec.updated_at = time.time()
            return rec

    def all(self):
        with self._lock:
            return list(self._records.values())
