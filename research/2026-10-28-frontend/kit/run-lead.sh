#!/usr/bin/env bash
# Runs one headless Aether Lead session: run-lead.sh <arm dir> <prompt file> [<plugin dir>] [extra claude args...]
# Same flags as the plugin's launcher (agent aether:lead, xhigh, permissions bypassed, superpowers off,
# AETHER_IRREVERSIBLE=enforce), plus: superdelegation, observedev and autoissue off for this session only,
# ECC off, MCP connectors off, its own data dir, and CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 so claude -p
# does not stop the swarm 10 minutes after the last turn.
ARM=$1; PROMPT=$2; PLUGIN=${3:-}; shift 3 2>/dev/null || shift $#
E=$HOME/.cache/aether-exp-frontend; NAME=$(basename "$ARM")
mkdir -p "$ARM/../data-$NAME"
DATA=$(cd "$ARM/../data-$NAME" && pwd)
SETTINGS='{"enabledPlugins":{"superpowers@claude-plugins-official":false,"ecc@ecc":false},"pluginConfigs":{"aether@aether-plugin":{"options":{"lanes":false,"harnesses":"agy,grok,muse","ops":true,"router":"command","observedev":false,"autoissue":false,"superdelegation":false}},"aether@inline":{"options":{"lanes":false,"superdelegation":false,"observedev":false,"autoissue":false}}},"enableWorkflows":true}'
EXTRA=()
[ -n "$PLUGIN" ] && EXTRA=(--plugin-dir "$PLUGIN")
cd "$ARM" || exit 9
start=$(date +%s.%N)
CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 ENABLE_CLAUDEAI_MCP_SERVERS=false AETHER_DATA_DIR="$DATA" AETHER_IRREVERSIBLE=enforce \
  timeout 14400 claude -p "$(cat "$PROMPT")" --agent aether:lead --effort xhigh --permission-mode bypassPermissions \
  --settings "$SETTINGS" --strict-mcp-config --max-budget-usd 60 --output-format json "${EXTRA[@]}" "$@" \
  > "$E/out/$NAME.json" 2> "$E/out/$NAME.err"
code=$?
end=$(date +%s.%N)
printf '{"arm": "%s", "exit": %s, "start": %s, "end": %s}\n' "$NAME" "$code" "$start" "$end" > "$E/out/$NAME.timing.json"
