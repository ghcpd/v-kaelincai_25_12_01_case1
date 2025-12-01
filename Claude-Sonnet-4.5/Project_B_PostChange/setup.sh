#!/usr/bin/env bash

# setup.sh - Project B Post-Change Setup Script
# Initializes the v2 greenfield implementation environment

set -euo pipefail

echo "════════════════════════════════════════════════════════════"
echo "  Event Label Extractor v2.0 - Setup Script"
echo "════════════════════════════════════════════════════════════"
echo ""

# Check Node.js version
echo "[1/5] Checking Node.js version..."
NODE_VERSION=$(node --version)
echo "  ✓ Node.js $NODE_VERSION detected"

if ! node -e "process.exit(parseInt(process.version.slice(1)) >= 18 ? 0 : 1)"; then
    echo "  ✗ Error: Node.js 18+ required"
    exit 1
fi

# Install dependencies
echo ""
echo "[2/5] Installing dependencies..."
if [ -f "package.json" ]; then
    npm install
    echo "  ✓ Dependencies installed"
else
    echo "  ✓ No package.json, skipping npm install"
fi

# Create output directories
echo ""
echo "[3/5] Creating output directories..."
mkdir -p logs
mkdir -p results
mkdir -p mocks
echo "  ✓ Directories created: logs/, results/, mocks/"

# Validate project structure
echo ""
echo "[4/5] Validating project structure..."
REQUIRED_DIRS=("src" "tests" "data")
REQUIRED_FILES=(
    "src/eventLabelExtractor.js"
    "src/services/EventNormalizer.js"
    "src/services/AttributeExtractor.js"
    "src/services/Validator.js"
    "src/services/Logger.js"
    "src/services/MetricsCollector.js"
    "tests/integration.test.js"
    "data/test_data.json"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo "  ✓ Directory exists: $dir/"
    else
        echo "  ✗ Missing directory: $dir/"
        exit 1
    fi
done

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ File exists: $file"
    else
        echo "  ✗ Missing file: $file"
        exit 1
    fi
done

# Run quick validation test
echo ""
echo "[5/5] Running validation tests..."
if npm test > /dev/null 2>&1; then
    echo "  ✓ All tests passed"
else
    echo "  ⚠ Some tests failed (this may be expected during setup)"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  ✅ Setup Complete!"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Run tests:           ./run_tests.sh"
echo "  2. View results:        cat results/results_post.json"
echo "  3. Check logs:          cat logs/log_post.txt"
echo ""
