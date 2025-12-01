#!/bin/bash

# setup.sh - Initialize Action Label Service v2 project

set -e

echo "Setting up Action Label Service v2..."
echo ""

# Create directory structure
echo "Creating directories..."
mkdir -p src/observability
mkdir -p mocks
mkdir -p tests
mkdir -p data
mkdir -p logs
mkdir -p results

echo "Directories created:"
echo "  ✓ src/"
echo "  ✓ mocks/"
echo "  ✓ tests/"
echo "  ✓ data/"
echo "  ✓ logs/"
echo "  ✓ results/"
echo ""

# Install dependencies
echo "Installing npm dependencies..."
if [ ! -f "package.json" ]; then
  echo "package.json not found. Creating default..."
  cat > package.json << 'EOF'
{
  "name": "action-label-service-v2",
  "version": "2.0.0",
  "description": "Resilient, observable browser event action label service",
  "main": "src/index.js",
  "scripts": {
    "test": "node --test tests/**/*.test.js",
    "test:watch": "nodemon --exec 'npm test'",
    "test:coverage": "c8 npm test"
  },
  "dependencies": {
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "c8": "^7.12.0",
    "nodemon": "^2.0.22"
  }
}
EOF
fi

npm install

echo ""
echo "✓ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Run tests: bash run_tests.sh"
echo "  2. Review logs: ls logs/"
echo "  3. Check results: cat results/*.json"
echo ""
