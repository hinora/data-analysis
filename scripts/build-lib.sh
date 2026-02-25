#!/bin/bash

# Build the core.lib library for production

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
LIB_DIR="$ROOT_DIR/lib"

echo "🔨 Building core.lib..."

cd "$LIB_DIR"

# Use build package.json (points to dist/ compiled files)
cp ./package.build.json ./package.json

# Run build
npm run build

echo "✅ core.lib built successfully!"
echo "📦 package.json now points to dist/ for production use"
echo "💡 To restore development mode, run: cp lib/package.dev.json lib/package.json"
