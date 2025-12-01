#!/usr/bin/env bash
# Run tests and collect artifacts
set -e
npm install >/dev/null
npm test | tee results/results_post_test_output.txt

# make a JSON results wrapper
jq -n '{tests: input}' results/results_post_test_output.txt > results/results_post.json || echo 'jq missing'

echo 'Completed run_all for oswe-mini-m19a2s435-org'
