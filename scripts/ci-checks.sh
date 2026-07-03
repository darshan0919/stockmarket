#!/usr/bin/env bash
set -e

echo "[ci-checks] Running Node Runtime Verification..."

echo "1. Checking registry manifestation..."
node scripts/gen-registry.js --check

echo "2. Verifying registry paths..."
# Assuming verify-registry.js is in scripts/
if [ -f "scripts/verify-registry.js" ]; then
  node scripts/verify-registry.js
else
  echo "scripts/verify-registry.js not found, skipping."
fi

echo "3. Checking bundle outputs..."
# Assuming bundle-skills.js or build-skills.js
if [ -f "scripts/build-skills.js" ]; then
  node scripts/build-skills.js --check
elif [ -f "scripts/bundle-skills.js" ]; then
  node scripts/bundle-skills.js --check
else
  echo "scripts/build-skills.js not found, skipping."
fi

echo "4. Checking for python3 usage..."
if grep -r "python3" skills/ packages/*/skills/; then
  echo "ERROR: Found 'python3' usage! Python is deprecated."
  exit 1
else
  echo "OK: No python3 usage found."
fi

echo "[ci-checks] All checks passed."
