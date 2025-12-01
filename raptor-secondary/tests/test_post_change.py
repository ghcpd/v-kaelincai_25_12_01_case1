import json
import os
import uuid

import pytest

from src.service import AppointmentService
from src.idempotency import IdempotencyStore
from src.outbox import Outbox
from src.logger import configure_logging
from mocks.mock_calendar_provider import FakeCalendarProvider

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LOG_FILE = os.path.join(BASE_DIR, "logs", "log_post.txt")
DATA_FILE = os.path.join(BASE_DIR, "data", "test_data.json")


class FailingOutbox(Outbox):
    def __init__(self, fail_first: bool = True):
        super().__init__()
        self.fail_first = fail_first
        self.calls = 0

    def enqueue(self, topic: str, payload):
        self.calls += 1
        if self.fail_first and self.calls == 1:
            raise RuntimeError("outbox failure")
        return super().enqueue(topic, payload)


with open(DATA_FILE, "r", encoding="utf-8") as f:
    SCENARIOS = json.load(f)


def make_service(provider_scenario: str, outbox=None, idempotency_store=None):
    provider = FakeCalendarProvider(scenario=provider_scenario)
    store = idempotency_store or IdempotencyStore()
    logger = configure_logging(log_file=LOG_FILE)
    return AppointmentService(calendar_provider=provider, outbox=outbox, idempotency_store=store, logger=logger), provider


@pytest.mark.parametrize("scenario", SCENARIOS, ids=[s["scenario"] for s in SCENARIOS])
def test_scenarios(scenario, recorder):
    service, provider = make_service(scenario.get("provider_scenario"))
    request = {
        "event": scenario.get("event"),
        "payload": scenario.get("payload"),
        "idempotency_key": scenario.get("idempotency_key"),
        "correlation_id": str(uuid.uuid4()),
    }

    # Special handling for compensation scenario
    if scenario["scenario"] == "compensation_on_partial_success":
        failing_outbox = FailingOutbox(fail_first=True)
        service, provider = make_service(scenario.get("provider_scenario"), outbox=failing_outbox)

    response = service.handle_event(request)

    rec = {
        "scenario": scenario["scenario"],
        "response": response,
        "provider_calls": provider.call_count,
        "passed": True,
    }

    expected_state = scenario.get("expected", {}).get("state")
    if expected_state:
        assert response.get("state") == expected_state
    if scenario["scenario"] == "idempotent_retry_success":
        # Should have retried once (2 attempts total) due to transient failure
        assert (response.get("retries") or 0) >= 2
        # Replay with same idempotency key should not call provider again
        calls_before = provider.call_count
        response2 = service.handle_event(request)
        # call_count unchanged
        assert provider.call_count == calls_before
        assert response2.get("state") == "completed"
        rec["replayed_state"] = response2.get("state")
    if scenario["scenario"] == "timeout_and_circuit_breaker":
        assert response.get("state") == "failed"
        assert response.get("error") in ("retry_exhausted", "circuit_open")
        # Second call should surface failure quickly (idempotency store)
        calls_before = provider.call_count
        response2 = service.handle_event(request)
        assert provider.call_count == calls_before
        assert response2.get("state") == "failed"
        rec["replayed_state"] = response2.get("state")
    if scenario["scenario"] == "compensation_on_partial_success":
        # outbox failure should trigger compensation (cancel)
        assert response.get("state") == "failed"
        assert provider.cancel_count >= 1
    if scenario["scenario"] == "legacy_event_srcElement":
        assert response.get("state") == "completed"

    rec["retries"] = response.get("retries") or 0
    recorder.record(rec)
