#!/usr/bin/env bash
set -e
./setup.sh
npm run test:unit
UNIT_STATUS=$?
npm run test:integration
INT_STATUS=$?

cat > results/results_post.json <<EOF
{
  "unit_status": $UNIT_STATUS,
  "integration_status": $INT_STATUS
}
EOF

echo "All tests run. Results written to results/results_post.json"