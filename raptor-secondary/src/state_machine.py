from __future__ import annotations
from enum import Enum


class AppointmentState(str, Enum):
    INIT = "init"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


VALID_TRANSITIONS = {
    AppointmentState.INIT: {AppointmentState.IN_PROGRESS},
    AppointmentState.IN_PROGRESS: {AppointmentState.COMPLETED, AppointmentState.FAILED},
    AppointmentState.COMPLETED: set(),
    AppointmentState.FAILED: set(),
}


class TransitionError(Exception):
    pass


def transition(current: AppointmentState, new: AppointmentState) -> AppointmentState:
    allowed = VALID_TRANSITIONS.get(current, set())
    if new not in allowed:
        raise TransitionError(f"Invalid transition: {current} -> {new}")
    return new
