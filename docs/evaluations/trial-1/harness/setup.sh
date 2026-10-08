#!/usr/bin/env bash
# Builds one trial fixture: ~/.cache/aether-trial/<mode>/repo on main, with the integration worktree
# .worktrees/trial on branch feature/trial. Runs as a child process, so its cd never reaches the caller.
set -euo pipefail
MODE=$1
T=$(cd "$(dirname "$0")/.." && pwd)
F=$HOME/.cache/aether-trial/$MODE
test ! -e "$F" || { echo "fixture exists: $F"; exit 1; }
mkdir -p "$F/repo/docs" "$F/data"
cd "$F/repo"
git init -q -b main
git config user.name 'Aether Trial'
git config user.email 'aether-trial@example.invalid'
git config commit.gpgsign false
printf '%s\n' '# tasks' '' 'A small task list for the command line. See docs/spec.md.' > README.md
printf '%s\n' '.worktrees/' 'node_modules/' > .gitignore
cat > package.json <<'JSON'
{
  "name": "tasks",
  "version": "0.1.0",
  "private": true,
  "description": "A small task list for the command line",
  "bin": { "tasks": "bin/tasks.js" },
  "scripts": { "test": "node --test" }
}
JSON
cp "$T/fixture/spec.md" docs/spec.md
cp "$T/fixture/plan.md" docs/plan.md
git add -A
git commit -q -m 'Add the spec and the approved plan'
git worktree add -q .worktrees/trial -b feature/trial
echo "fixture ready: $F"
