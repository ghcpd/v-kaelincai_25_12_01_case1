from __future__ import annotations
import time
import uuid
from typing import Optional


class ProviderTimeoutError(TimeoutError):
    pass


class ProviderPermanentError(Exception):
    pass


class FakeCalendarProvider:
    def __init__(self, scenario: str = "immediate", delay: float = 0.1):
        self.scenario = scenario
        self.delay = delay
        self.call_count = 0
        self.cancel_count = 0
        self.created_ids = []
        self.cancelled_ids = []

    def create_appointment(self, payload) -> str:
        self.call_count += 1
        # Scenario behaviors
        if self.scenario == "immediate":
            return self._success(payload)
        if self.scenario == "delay_success":
            time.sleep(self.delay)
            return self._success(payload)
        if self.scenario == "fail_once_then_success":
            if self.call_count == 1:
                raise ProviderTimeoutError("transient timeout")
            return self._success(payload)
        if self.scenario == "always_timeout":
            raise ProviderTimeoutError("timeout")
        if self.scenario == "always_fail":
            raise ProviderPermanentError("permanent failure")
        if self.scenario == "partial_success_then_fail_outbox":
            # We'll emulate success here; tests will force downstream failure separately if needed.
            return self._success(payload)
        return self._success(payload)

    def cancel_appointment(self, appointment_id: str):
        self.cancel_count += 1
        self.cancelled_ids.append(appointment_id)

    def _success(self, payload) -> str:
        appointment_id = payload.get("appointment_id") or str(uuid.uuid4())
        self.created_ids.append(appointment_id)
        return appointment_id
