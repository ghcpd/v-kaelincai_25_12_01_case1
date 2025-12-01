#!/usr/bin/env bash
set -euo pipefail

PW=$(pwd)

# Run original project tests
cd "$PW/../issue_project"
echo "Running original issue_project tests" 
node --test 2>&1 | tee "$PW/results_pre_test_output.txt" || true

# Run post-change project tests
cd "$PW/Project_B_PostChange"
echo "Running post change tests"
node --test 2>&1 | tee "$PW/results_post_test_output.txt" || true

# Compare simple outputs (both are node test outputs)
echo "Collecting summary..."

echo "Done"
