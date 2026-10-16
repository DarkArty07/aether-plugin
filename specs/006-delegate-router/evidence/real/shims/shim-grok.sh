#!/bin/sh
# A grok whose delegate call fails (the quota readings and the refresh go to the real CLI).
for a in "$@"; do
  if [ "$a" = "--always-approve" ]; then
    echo "error: simulated failure of the grok CLI (test shim)" >&2
    exit 1
  fi
done
exec ${REAL_GROK:-$HOME/.local/bin/grok} "$@"
