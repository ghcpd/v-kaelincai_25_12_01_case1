from __future__ import annotations
import json
import logging
from logging import Logger
from typing import Any, Dict

try:
    from pythonjsonlogger import jsonlogger  # type: ignore
except ImportError:  # pragma: no cover
    jsonlogger = None


def configure_logging(log_file: str | None = None, level: int = logging.INFO) -> Logger:
    logger = logging.getLogger("raptor_secondary")
    logger.setLevel(level)
    logger.handlers.clear()

    if jsonlogger:
        formatter = jsonlogger.JsonFormatter()
    else:
        formatter = logging.Formatter("%(asctime)s %(name)s %(levelname)s %(message)s")

    handler = logging.StreamHandler()
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    if log_file:
        fhandler = logging.FileHandler(log_file)
        fhandler.setFormatter(formatter)
        logger.addHandler(fhandler)

    return logger


def masked(data: Dict[str, Any], sensitive_fields = ("ssn", "password", "token")) -> Dict[str, Any]:
    out = {}
    for k, v in data.items():
        if k in sensitive_fields and isinstance(v, str):
            out[k] = "***"
        else:
            out[k] = v
    return out
