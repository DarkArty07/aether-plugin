#!/bin/sh
# An agy that refuses every call except its /usage reading, as the real one does: a JSON object with the error on stdout and exit 3.
for a in "$@"; do
  if [ "$a" = "/usage" ]; then exec ${REAL_AGY:-$HOME/.local/bin/agy} "$@"; fi
done
echo '{"status":"ERROR","error":"Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 2h10m."}'
exit 3
