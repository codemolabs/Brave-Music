#!/bin/bash
# Brave Music Desktop Runner
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=== Launching Brave Music Desktop ==="
export NODE_ENV=production
exec npx electron . --no-sandbox "$@"
