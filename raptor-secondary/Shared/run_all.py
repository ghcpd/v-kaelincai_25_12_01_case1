import subprocess
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ISSUE = ROOT.parent / "issue_project"
SHARED_RESULTS = ROOT / "Shared" / "results"
SHARED_RESULTS.mkdir(parents=True, exist_ok=True)


def run(cmd, cwd=None, use_shell=False):
    proc = subprocess.Popen(
        cmd if not use_shell else " ".join(cmd) if isinstance(cmd, (list, tuple)) else cmd,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        shell=use_shell,
    )
    out, _ = proc.communicate()
    return proc.returncode, out


# Legacy tests
use_shell = os.name == "nt"
legacy_ret, out = run(["npm", "test"], cwd=str(ISSUE), use_shell=use_shell)
(SHARED_RESULTS / "results_pre.log").write_text(out, encoding="utf-8")
fails = []
for line in out.splitlines():
    if any(x in line.lower() for x in ["fail", "assertionerror", "not ok"]):
        fails.append(line.strip())
results_pre = {
    "passed": legacy_ret == 0 and not fails,
    "failures": fails,
}
(SHARED_RESULTS / "results_pre.json").write_text(json.dumps(results_pre, indent=2), encoding="utf-8")

# New tests
post_ret, out = run(["python", "-m", "pytest", "tests"], cwd=str(ROOT), use_shell=use_shell)
(SHARED_RESULTS / "results_post.log").write_text(out, encoding="utf-8")

print("Legacy exit:", legacy_ret)
print("New exit:", post_ret)
