"""
Cross-platform action label extraction similar to the legacy getActionLabel in JS.
Supports event shapes with target/srcElement/currentTarget and dataset/attributes.
"""
from __future__ import annotations
from typing import Any, Mapping


def _to_dataset_key(attribute: str) -> str:
    if not attribute.startswith("data-"):
        return attribute
    chunks = attribute[5:].split("-")
    # camelCase the parts after the first
    return chunks[0] + "".join(chunk[:1].upper() + chunk[1:] for chunk in chunks[1:])


def _get_attr_from_target(target: Any, attribute: str) -> str:
    # If has get_attribute / getAttribute-like
    if hasattr(target, "get") and callable(getattr(target, "get")):
        # Dict-like
        try:
            value = target.get(attribute)
            if isinstance(value, str):
                return value
        except Exception:
            pass
    if hasattr(target, "getAttribute"):
        try:
            value = target.getAttribute(attribute)
            if isinstance(value, str):
                return value
        except Exception:
            pass
    # dataset
    if attribute.startswith("data-"):
        dataset_key = _to_dataset_key(attribute)
        # Mapping-style container
        if isinstance(target, Mapping):
            ds = target.get("dataset")
            if isinstance(ds, Mapping):
                val = ds.get(dataset_key)
                if isinstance(val, str):
                    return val
        # attribute-style container
        dataset = getattr(target, "dataset", None)
        if isinstance(dataset, Mapping):
            value = dataset.get(dataset_key)
            if isinstance(value, str):
                return value
    # direct attribute
    if hasattr(target, attribute):
        value = getattr(target, attribute)
        if isinstance(value, str):
            return value
    # dictionary style
    if isinstance(target, Mapping) and attribute in target:
        value = target[attribute]
        if isinstance(value, str):
            return value
    return ""


def get_action_label(event: Any, attribute: str = "data-action") -> str:
    """
    Extracts an action label from an event-like object.

    Order of precedence for the target: event.target -> event.srcElement -> event.currentTarget.
    Returns empty string if not found or if target/attribute missing.
    """
    if event is None:
        raise TypeError("An event-like object is required")

    # event may be dict-like or object-like
    def pick(*names: str):
        for n in names:
            if isinstance(event, Mapping) and n in event:
                return event[n]
            if hasattr(event, n):
                return getattr(event, n)
        return None

    target = pick("target", "srcElement", "currentTarget")
    if target is None:
        return ""

    return _get_attr_from_target(target, attribute)


__all__ = ["get_action_label"]
