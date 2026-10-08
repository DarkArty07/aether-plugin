#!/usr/bin/env bash
# Trial 3: builds one configuration's fixture and runs its session with the smoke harness's driver.
# usage: run.sh <baseline|new> <results dir>
# The fixture is a clone of main reset to BASE, the commit both configurations design on, with no
# remote and no unreachable objects: the session cannot see this branch, where the hidden brief lives,
# nor anything committed to main after BASE. No command changes the caller's directory.
set -euo pipefail
CONFIG=${1:?usage: run.sh <baseline|new> <results dir>}
OUT=${2:?usage: run.sh <baseline|new> <results dir>}
REPO=/home/darkarty/Desktop/03_PROYECTOS/01_ACTIVOS/aether-plugin
BASE=1597ac7
TRIAL=$(dirname "$(dirname "$(realpath "$0")")")
DRIVE=$(dirname "$TRIAL")/lead-designer-smoke/drive.py
F=$HOME/.cache/aether-trial3/$CONFIG
case "$CONFIG" in
  baseline)
    # The plugin of main (v0.1): an Opus main session that designs itself.
    [ -d "$REPO/.worktrees/trial3-baseline" ] || git -C "$REPO" worktree add -q --detach "$REPO/.worktrees/trial3-baseline" "$BASE"
    PLUGIN=$REPO/.worktrees/trial3-baseline/plugins/aether MODEL=opus EFFORT=max ;;
  new)
    # This branch: the Lead on Sonnet and the Designer on Opus.
    PLUGIN=$REPO/.worktrees/lead-designer/plugins/aether MODEL=sonnet EFFORT=xhigh ;;
  *) echo "usage: run.sh <baseline|new> <results dir>" >&2; exit 2 ;;
esac
rm -rf "$F"
mkdir -p "$F/data" "$OUT"
git clone -q --single-branch --branch main --no-tags "$REPO" "$F/repo"
git -C "$F/repo" reset -q --hard "$BASE"
git -C "$F/repo" remote remove origin
git -C "$F/repo" reflog expire --expire=now --all
git -C "$F/repo" gc -q --prune=now
git -C "$F/repo" config user.name "Aether Trial"
git -C "$F/repo" config user.email "aether-trial@example.invalid"
git -C "$F/repo" config commit.gpgsign false
git -C "$F/repo" worktree add -q "$F/repo/.worktrees/trial" -b feature/trial
cat > "$F/config.json" <<EOF
{"name": "$CONFIG", "cwd": "$F/repo/.worktrees/trial", "plugin_dir": "$PLUGIN", "model": "$MODEL", "effort": "$EFFORT",
 "max_budget_usd": 40, "max_turns": 30, "turn_timeout_s": 3600, "data_dir": "$F/data",
 "brief": "$TRIAL/brief.md", "opening": "$TRIAL/opening.md", "probe": null, "results": "$OUT"}
EOF
python3 -I "$DRIVE" "$F/config.json"
