#!/bin/bash
set -e

SKILL_NAME=$1
shift

# 1. Is the stockmarket project in local context?
SM_LOCAL="$(find /sessions -maxdepth 6 -type d -name 'stock-api' -path '*packages/*' 2>/dev/null | grep -v node_modules | head -1 | sed 's#/packages/stock-api##')"
# fallback for local mac testing
if [ -z "$SM_LOCAL" ]; then
  SM_LOCAL="$(pwd | sed -n 's#\(.*/stockmarket\).*#\1#p')"
fi

if [ -n "$SM_LOCAL" ] && [ -d "$SM_LOCAL/.git" ]; then
  MODE=local
  SKILL_ROOT="$SM_LOCAL"
else
  MODE=remote
fi

# 2. Resolve the skill entrypoint
if [ "$MODE" = "local" ]; then
  ENTRY="$SKILL_ROOT/packages/stock-api/bin/$SKILL_NAME.js"
  if [ ! -f "$ENTRY" ]; then
    MODE=remote
  fi
fi

if [ "$MODE" = "remote" ]; then
  # Check if bundle or clone is in /tmp
  if [ -f "/tmp/$SKILL_NAME.cjs" ]; then
    ENTRY="/tmp/$SKILL_NAME.cjs"
  elif [ -f "/tmp/sm-clone/packages/stock-api/bin/$SKILL_NAME.js" ]; then
    ENTRY="/tmp/sm-clone/packages/stock-api/bin/$SKILL_NAME.js"
  else
    echo "Error: remote entrypoint for $SKILL_NAME not found in /tmp. Did github-skill-invoker fetch it?"
    exit 1
  fi
fi

node "$ENTRY" "$@"
