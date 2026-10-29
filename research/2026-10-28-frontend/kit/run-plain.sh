#!/usr/bin/env bash
# Runs one plain Claude Code session headless (no Aether mode): run-plain.sh <arm dir> <prompt file> <model> <effort>
ARM=$1; PROMPT=$2; MODEL=$3; EFFORT=$4
E=$HOME/.cache/aether-exp-frontend; NAME=$(basename "$ARM")
cd "$ARM" || exit 9
start=$(date +%s.%N)
CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 ENABLE_CLAUDEAI_MCP_SERVERS=false timeout 14400 \
  claude -p "$(cat "$PROMPT")" --model "$MODEL" --effort "$EFFORT" --permission-mode bypassPermissions \
  --strict-mcp-config --max-budget-usd 60 --output-format json > "$E/out/$NAME.json" 2> "$E/out/$NAME.err"
code=$?
end=$(date +%s.%N)
printf '{"arm": "%s", "exit": %s, "start": %s, "end": %s}\n' "$NAME" "$code" "$start" "$end" > "$E/out/$NAME.timing.json"
