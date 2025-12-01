#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
node --test 2>&1 | tee results/test_output.txt || true
