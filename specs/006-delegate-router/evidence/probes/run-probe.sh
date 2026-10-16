#!/bin/bash
# usage: run-probe.sh <mode> [agent-input-json]   runs one headless session against the fake model, with the probe plugin
set -u
S=$(cd "$(dirname "$0")" && pwd)
REPO=$(git -C "$S" rev-parse --show-toplevel)
MODE=$1; INPUT=${2:-'{"description":"probe task","prompt":"PROBE-SUB do the probe","subagent_type":"general-purpose","model":"sonnet","effort":"xhigh","run_in_background":false}'}
R=$S/runs/$MODE; rm -rf $R; mkdir -p $R/home $R/cfg $R/fake $R/log $R/work
echo 'PROBE_ENVFILE_CONTENT=secret-free-test' > $R/envfile
node -e '
const input = JSON.parse(process.argv[1]);
require("fs").writeFileSync(process.argv[2], JSON.stringify([
  { match: "PROBE-MAIN", replies: [ { tool: "Agent", input }, { text: "main done" } ] },
  { match: "PROBE-SUB", replies: [ { text: "SUB-ANSWER from the fake model" } ] }
]))' "$INPUT" $R/script.json
node $REPO/tests/fixtures/fake-model.js --out $R/fake --script $R/script.json > $R/fake.out 2>&1 &
FAKE=$!
for i in $(seq 1 50); do [ -s $R/fake/port ] && break; sleep 0.1; done
PORT=$(cat $R/fake/port)
cd $R/work
timeout 150 env -i PATH="$(dirname $(command -v node)):/usr/local/bin:/usr/bin:/bin" TERM=dumb HOME=$R/home CLAUDE_CONFIG_DIR=$R/cfg \
  ANTHROPIC_API_KEY=sk-ant-fake-probe ANTHROPIC_BASE_URL="http://127.0.0.1:$PORT" CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 DISABLE_AUTOUPDATER=1 \
  PROBE_MODE=$MODE PROBE_LOG=$R/log PROBE_URL="http://127.0.0.1:$PORT/ping" PROBE_ENVFILE=$R/envfile \
  $(command -v claude) -p PROBE-MAIN --plugin-dir $S/plugin --dangerously-skip-permissions < /dev/null > $R/claude.out 2> $R/claude.err
echo "claude exit: $?"
kill $FAKE 2>/dev/null
echo "--- fake.log (model, effort, first, k, reply)"; node -e '
for (const l of require("fs").readFileSync(process.argv[1],"utf8").trim().split("\n").filter(Boolean)) { const j = JSON.parse(l); console.log(`  #${j.n} model=${j.model} effort=${j.effort} k=${j.k} reply=${j.reply} first="${String(j.first).replace(/\s+/g," ").slice(0,48)}"`) }' $R/fake/fake.log 2>/dev/null || echo "  (no fake.log)"
echo "--- probe logs"; for f in $R/log/*.json; do [ -f "$f" ] && { echo "  [$(basename $f)] $(tr -d '\n' < $f | tr -s ' ' | cut -c1-420)"; }; done
echo "--- claude stdout (first 300): $(head -c 300 $R/claude.out | tr '\n' ' ')"; echo "--- claude stderr (first 300): $(head -c 300 $R/claude.err | tr '\n' ' ')"
