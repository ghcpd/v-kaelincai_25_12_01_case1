#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ISSUE_PROJECT="$ROOT/../issue_project"
SHARED_RESULTS="$ROOT/Shared/results"
mkdir -p "$SHARED_RESULTS"

# Run legacy tests
pushd "$ISSUE_PROJECT" >/dev/null
npm test > "$SHARED_RESULTS/results_pre.log" 2>&1 || true
python - "$SHARED_RESULTS" <<'PY'
import json, sys, re
from pathlib import Path
root = Path(sys.argv[1])
log = (root / 'results_pre.log').read_text(encoding='utf-8')
passed = 'ok' in log.lower() and 'fail' not in log.lower()
fails = []
for line in log.splitlines():
    if re.search(r'not ok|fail|AssertionError', line, re.IGNORECASE):
        fails.append(line.strip())
result = {
    'passed': len(fails) == 0,
    'failures': fails,
}
(root / 'results_pre.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
PY
popd >/dev/null

# Run new tests
pushd "$ROOT" >/dev/null
./setup.sh
./run_tests.sh || true
popd >/dev/null
