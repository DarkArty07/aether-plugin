#!/usr/bin/env bash
# Runs one trial session headless. aether: the plugin and workflows on; normal: superpowers alone.
# CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0: without it, claude -p stops the swarm 10 minutes after the last turn.
MODE=$1
T=$(cd "$(dirname "$0")/.." && pwd)
REPO=$(cd "$T/../../.." && pwd)
F=$HOME/.cache/aether-trial2/$MODE
cd "$F/repo/.worktrees/trial" || exit 9
COMMON=(--model opus --permission-mode bypassPermissions --strict-mcp-config --max-budget-usd 120 --output-format json)
if [ "$MODE" = aether ]; then
  EXTRA=(--plugin-dir "$REPO/plugins/aether" --settings '{"enableWorkflows": true}')
else
  EXTRA=()
fi
start=$(date +%s.%N)
CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 AETHER_DATA_DIR="$F/data" ENABLE_CLAUDEAI_MCP_SERVERS=false timeout 14400 claude -p "$(cat "$T/harness/prompt-$MODE.txt")" "${COMMON[@]}" "${EXTRA[@]}" > "$F/out.json" 2> "$F/err.txt"
code=$?
end=$(date +%s.%N)
printf '{"mode": "%s", "exit": %s, "start": %s, "end": %s}\n' "$MODE" "$code" "$start" "$end" > "$F/timing.json"
