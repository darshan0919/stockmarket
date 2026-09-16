#!/bin/bash
set -e

SKILL_NAME=$1
shift

# 1. Is the stockmarket project in local context?
SM_LOCAL="$(find /sessions -maxdepth 6 -type d -name 'stock-api' -path '*packages/*' 2>/dev/null | grep -v node_modules | head -1 | sed 's#/stock-api##')"
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
  ENTRY="$SKILL_ROOT/stock-api/bin/$SKILL_NAME.js"
  if [ ! -f "$ENTRY" ]; then
    MODE=remote
  fi
fi

if [ "$MODE" = "remote" ]; then
  # Bundle mode (stock-api/dist-skills/*.cjs + the github-skill-invoker meta-
  # skill that fetched it to /tmp) was retired 2026-09-16 — no local checkout
  # is mounted, so shallow-clone the repo instead and run its real bin/*.js
  # source. See skills/tooling/render-pdf/SKILL.md's clone-mode section for
  # the canonical form of this same fallback used elsewhere in the repo.
  if [ -f "/tmp/sm-clone/stock-api/bin/$SKILL_NAME.js" ]; then
    ENTRY="/tmp/sm-clone/stock-api/bin/$SKILL_NAME.js"
  else
    if [ ! -d /tmp/sm-clone ]; then
      git clone --depth 1 https://github.com/darshan0919/stockmarket.git /tmp/sm-clone
      (cd /tmp/sm-clone/stock-api && npm ci)
    fi
    ENTRY="/tmp/sm-clone/stock-api/bin/$SKILL_NAME.js"
    if [ ! -f "$ENTRY" ]; then
      echo "Error: remote entrypoint for $SKILL_NAME not found at $ENTRY after cloning."
      exit 1
    fi
  fi
fi

node "$ENTRY" "$@"
