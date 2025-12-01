from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, List
import time


@dataclass
class OutboxEvent:
    topic: str
    payload: Any
    created_at: float = field(default_factory=time.time)


class Outbox:
    def __init__(self):
        self.events: List[OutboxEvent] = []

    def enqueue(self, topic: str, payload: Any):
        self.events.append(OutboxEvent(topic=topic, payload=payload))

    def drain(self) -> List[OutboxEvent]:
        evs = list(self.events)
        self.events.clear()
        return evs
