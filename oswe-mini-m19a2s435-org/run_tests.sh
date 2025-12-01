#!/usr/bin/env bash
# Simple bash wrapper for linux/mac
npm install >/dev/null
START=$(date +%s)
node --test | tee results/results_post_test_output.txt
END=$(date +%s)
echo "Tests completed in $((END-START)) seconds"
