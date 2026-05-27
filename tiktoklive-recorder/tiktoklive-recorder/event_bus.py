from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from threading import Lock
from typing import Dict

Event = Dict[str, object]
Subscriber = Callable[[Event], None]


def build_event(event_type: str, **payload: object) -> Event:
    return {
        "type": event_type,
        "emittedAt": datetime.now().isoformat(),
        "payload": payload,
    }


class EventBus:
    """Thread-safe in-memory event bus for recorder state changes."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._next_token = 1
        self._subscribers: dict[int, Subscriber] = {}

    def publish(self, event: Event) -> None:
        event_copy = dict(event)
        event_copy.setdefault("emittedAt", datetime.now().isoformat())

        with self._lock:
            subscribers = list(self._subscribers.values())

        for subscriber in subscribers:
            try:
                subscriber(event_copy)
            except Exception:
                # Never let one subscriber break recorder threads.
                continue

    def subscribe(self, subscriber: Subscriber) -> int:
        with self._lock:
            token = self._next_token
            self._next_token += 1
            self._subscribers[token] = subscriber
            return token

    def unsubscribe(self, token: int) -> None:
        with self._lock:
            self._subscribers.pop(token, None)


_default_bus = EventBus()


def publish(event: Event) -> None:
    _default_bus.publish(event)


def subscribe(subscriber: Subscriber) -> int:
    return _default_bus.subscribe(subscriber)


def unsubscribe(token: int) -> None:
    _default_bus.unsubscribe(token)
