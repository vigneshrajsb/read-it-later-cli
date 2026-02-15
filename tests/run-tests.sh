#!/bin/bash
#
# RIL CLI Test Runner - Automated feedback loop
# Usage: ./run-tests.sh [--watch]
#

set -e

echo "🧪 Running RIL CLI tests..."
echo ""

# Ensure we're in test mode (uses in-memory DB)
export RIL_TEST=1

cd "$(dirname "$0")/.."

if [ "$1" = "--watch" ]; then
    echo "👀 Watch mode enabled. Press Ctrl+C to stop."
    bun test --watch
else
    # Run tests once
    if bun test 2>&1; then
        echo ""
        echo "✅ All tests passed!"
        exit 0
    else
        echo ""
        echo "❌ Tests failed!"
        exit 1
    fi
fi
