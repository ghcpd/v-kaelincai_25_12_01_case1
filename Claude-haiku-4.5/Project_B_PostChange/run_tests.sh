#!/bin/bash

# run_tests.sh - Execute Action Label Service v2 test suite

set -e

echo "========================================"
echo "Action Label Service v2 - Test Suite"
echo "========================================"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "[1/3] Installing dependencies..."
  npm install
  echo ""
fi

echo "[2/3] Running integration tests..."
npm test

echo ""
echo "[3/3] Collecting test results..."

# Create results directory if needed
mkdir -p results logs

# Run coverage if available
if command -v c8 &> /dev/null; then
  echo "Running coverage analysis..."
  npm run test:coverage 2>/dev/null || true
fi

echo ""
echo "========================================"
echo "Test Suite Complete"
echo "========================================"
echo ""
echo "Results:"
echo "  - Tests: See output above"
echo "  - Logs: ./logs/"
echo "  - Coverage: ./coverage/ (if available)"
echo ""
echo "Next steps:"
echo "  - Review logs in ./logs/"
echo "  - Check metrics in results/"
echo "  - Run: npm run compare (to compare with v1)"
echo ""
