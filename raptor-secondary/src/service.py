from __future__ import annotations
import uuid
from typing import Any, Dict, Optional

from .action_label import get_action_label
from .idempotency import IdempotencyStore
from .state_machine import AppointmentState
from .retry import retry_with_backoff, RetryError
from .circuit_breaker import CircuitBreaker, CircuitOpenError
from .outbox import Outbox
from .logger import configure_logging, masked


class BadRequest(Exception):
    pass


class UnsupportedAction(Exception):
    pass


class CalendarProviderError(Exception):
    pass


class AppointmentService:
    def __init__(
        self,
        calendar_provider,
        idempotency_store: Optional[IdempotencyStore] = None,
        circuit_breaker: Optional[CircuitBreaker] = None,
        outbox: Optional[Outbox] = None,
        logger=None,
    ):
        self.calendar_provider = calendar_provider
        self.idempotency_store = idempotency_store or IdempotencyStore()
        self.circuit_breaker = circuit_breaker or CircuitBreaker()
        self.outbox = outbox or Outbox()
        self.logger = logger or configure_logging()

    def handle_event(self, request: Dict[str, Any]) -> Dict[str, Any]:
        # Validate request
        event = request.get("event")
        payload = request.get("payload", {})
        idempotency_key = request.get("idempotency_key") or str(uuid.uuid4())
        correlation_id = request.get("correlation_id") or str(uuid.uuid4())

        if not event:
            raise BadRequest("Missing event")

        action_label = get_action_label(event, attribute=payload.get("attribute", "data-action"))
        if not action_label:
            raise BadRequest("Missing action label")

        # Idempotency check
        record = self.idempotency_store.begin(idempotency_key)
        if record.status == "completed":
            self.logger.info(
                "idempotent_hit",
                extra={"correlation_id": correlation_id, "idempotency_key": idempotency_key, "action_label": action_label},
            )
            return {
                "state": AppointmentState.COMPLETED.value,
                "idempotency_key": idempotency_key,
                "response": record.response,
                "retries": record.retries,
            }
        if record.status == "failed":
            # short-circuit repeat failures
            return {
                "state": AppointmentState.FAILED.value,
                "idempotency_key": idempotency_key,
                "response": record.response,
                "retries": record.retries,
                "error": record.error,
            }
        if record.status == "in_progress" and record.response:
            # already processing; return prior partial response
            return {
                "state": AppointmentState.IN_PROGRESS.value,
                "idempotency_key": idempotency_key,
                "response": record.response,
                "retries": record.retries,
            }

        # Route by action
        if action_label in ("create-appointment", "createAppointment"):
            return self._create_appointment(payload, idempotency_key, correlation_id)
        else:
            raise UnsupportedAction(action_label)

    def _create_appointment(self, payload: Dict[str, Any], idempotency_key: str, correlation_id: str) -> Dict[str, Any]:
        req_data = masked(payload)
        retries = 0
        appointment_id = None
        state = AppointmentState.IN_PROGRESS
        try:
            def invoke_provider():
                return self.calendar_provider.create_appointment(req_data)

            def wrapped():
                return self.circuit_breaker.call(invoke_provider)

            result, retries = retry_with_backoff(wrapped, max_attempts=payload.get("max_attempts", 3), base_delay=0.05)
            appointment_id = result
            state = AppointmentState.COMPLETED
            response = {
                "appointment_id": appointment_id,
                "state": state.value,
                "idempotency_key": idempotency_key,
                "retries": retries,
            }
            self.idempotency_store.complete(idempotency_key, response=response, status=state.value)
            self.outbox.enqueue("appointments.created", {"appointment_id": appointment_id, "payload": req_data})
            self.logger.info(
                "appointment_created",
                extra={
                    "correlation_id": correlation_id,
                    "idempotency_key": idempotency_key,
                    "retries": retries,
                    "appointment_id": appointment_id,
                },
            )
            return response
        except CircuitOpenError as exc:
            state = AppointmentState.FAILED
            response = {
                "state": state.value,
                "idempotency_key": idempotency_key,
                "error": "circuit_open",
                "retries": retries,
            }
            self.idempotency_store.complete(idempotency_key, response=response, status=state.value, error=str(exc))
            self.logger.error(
                "circuit_open",
                extra={"correlation_id": correlation_id, "idempotency_key": idempotency_key, "retries": retries},
            )
            return response
        except RetryError as exc:
            state = AppointmentState.FAILED
            response = {
                "state": state.value,
                "idempotency_key": idempotency_key,
                "error": "retry_exhausted",
                "retries": exc.attempts,
            }
            self.idempotency_store.complete(idempotency_key, response=response, status=state.value, error=str(exc))
            self.logger.error(
                "retry_exhausted",
                extra={"correlation_id": correlation_id, "idempotency_key": idempotency_key, "retries": exc.attempts},
            )
            # compensation if appointment created but failures later
            if appointment_id:
                self._compensate(appointment_id, idempotency_key, correlation_id)
            return response
        except Exception as exc:  # generic failure path
            state = AppointmentState.FAILED
            response = {
                "state": state.value,
                "idempotency_key": idempotency_key,
                "error": str(exc),
                "retries": retries,
            }
            self.idempotency_store.complete(idempotency_key, response=response, status=state.value, error=str(exc))
            self.logger.error(
                "appointment_failed",
                extra={"correlation_id": correlation_id, "idempotency_key": idempotency_key, "error": str(exc), "retries": retries},
            )
            if appointment_id:
                self._compensate(appointment_id, idempotency_key, correlation_id)
            return response

    def _compensate(self, appointment_id: str, idempotency_key: str, correlation_id: str):
        try:
            self.calendar_provider.cancel_appointment(appointment_id)
            self.outbox.enqueue("appointments.compensated", {"appointment_id": appointment_id})
            self.logger.warning(
                "appointment_compensated",
                extra={"correlation_id": correlation_id, "idempotency_key": idempotency_key, "appointment_id": appointment_id},
            )
        except Exception as exc:
            self.logger.error(
                "compensation_failed",
                extra={"correlation_id": correlation_id, "idempotency_key": idempotency_key, "appointment_id": appointment_id, "error": str(exc)},
            )


__all__ = ["AppointmentService", "BadRequest", "UnsupportedAction", "CalendarProviderError"]
