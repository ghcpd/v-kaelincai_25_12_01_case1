# Shared Runner

## Contents
- `test_data.json`: canonical scenarios (pre/post).
- `run_all.sh`: runs legacy Node tests and new Python tests; collects artifacts.
- `compare_report.md`: pre/post comparison and rollout guidance.
- `results/`: `results_pre.json`, `results_post.json`, `aggregated_metrics.json`.

## Usage
```bash
./run_all.sh
```
(Use WSL/Git Bash on Windows or run equivalent commands manually.)

Artifacts are written to `Shared/results/` and logs to `../logs/`.
