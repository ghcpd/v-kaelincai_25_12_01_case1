import json
import os
import sys
import pytest

from src.logger import configure_logging

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)
LOG_FILE = os.path.join(BASE_DIR, "logs", "log_post.txt")
RESULTS_FILE = os.path.join(BASE_DIR, "results", "results_post.json")
SHARED_RESULTS_FILE = os.path.join(BASE_DIR, "Shared", "results", "results_post.json")
AGGREGATED_FILE = os.path.join(BASE_DIR, "Shared", "results", "aggregated_metrics.json")


class ResultsRecorder:
    def __init__(self):
        self.records = []

    def record(self, rec):
        self.records.append(rec)

    def finalize(self):
        os.makedirs(os.path.dirname(RESULTS_FILE), exist_ok=True)
        with open(RESULTS_FILE, "w", encoding="utf-8") as f:
            json.dump(self.records, f, indent=2)
        os.makedirs(os.path.dirname(SHARED_RESULTS_FILE), exist_ok=True)
        with open(SHARED_RESULTS_FILE, "w", encoding="utf-8") as f:
            json.dump(self.records, f, indent=2)
        # aggregated metrics
        agg = {
            "total": len(self.records),
            "passed": sum(1 for r in self.records if r.get("passed")),
            "failed": sum(1 for r in self.records if not r.get("passed")),
            "success_rate": None,
            "retries": {
                "avg": None,
                "max": None,
            },
        }
        if agg["total"]:
            agg["success_rate"] = agg["passed"] / agg["total"]
            retries = [r.get("retries", 0) or 0 for r in self.records]
            agg["retries"]["avg"] = sum(retries) / len(retries)
            agg["retries"]["max"] = max(retries) if retries else None
        with open(AGGREGATED_FILE, "w", encoding="utf-8") as f:
            json.dump(agg, f, indent=2)


@pytest.fixture(scope="session")
def results_recorder():
    return ResultsRecorder()


@pytest.fixture(scope="session", autouse=True)
def setup_logging():
    configure_logging(log_file=LOG_FILE)
    yield


def pytest_sessionfinish(session, exitstatus):
    recorder: ResultsRecorder = session.config._results_recorder  # type: ignore
    recorder.finalize()


def pytest_configure(config):
    # stash the recorder in config for sessionfinish hook
    config._results_recorder = ResultsRecorder()


@pytest.fixture
def recorder(pytestconfig):
    return pytestconfig._results_recorder
