#!/usr/bin/env bash
# Builds one trial-2 fixture: ~/.cache/aether-trial2/<mode>/repo on main, with the integration worktree
# .worktrees/trial on branch feature/trial and its node_modules. Runs as a child process, so its cd never
# reaches the caller.
set -euo pipefail
MODE=$1
T=$(cd "$(dirname "$0")/.." && pwd)
F=$HOME/.cache/aether-trial2/$MODE
test ! -e "$F" || { echo "fixture exists: $F"; exit 1; }
mkdir -p "$F/repo/docs" "$F/data"
cd "$F/repo"
git init -q -b main
git config user.name 'Aether Trial'
git config user.email 'aether-trial@example.invalid'
git config commit.gpgsign false
cp -r "$T/fixture/base/." .
cp "$T/fixture/spec.md" docs/spec.md
cp "$T/fixture/plan.md" docs/plan.md
git add -A
git commit -q -m 'Add the spec, the approved plan and the project skeleton'
git worktree add -q .worktrees/trial -b feature/trial
cd .worktrees/trial
npm ci --silent --no-audit --no-fund
npm test --silent > /dev/null 2>&1 && echo "baseline npm test: pass (no tests yet)"
echo "fixture ready: $F"
