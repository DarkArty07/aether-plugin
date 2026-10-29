#!/usr/bin/env bash
# Builds arm s5-rich from the approved rich design (d5-rich, main), the same way prepare-arms.sh built s4-guided:
# the guided tools (shots with the horizon preview, look.md for the rich plan), the threejs-game skill, and the
# guided test command; then an integration worktree .worktrees/integration on feature/snake.
set -euo pipefail
E=$HOME/.cache/aether-exp-frontend
test ! -e "$E/s5-rich" || { echo "exists: $E/s5-rich"; exit 1; }
git clone -q "$E/d5-rich" "$E/s5-rich"
cd "$E/s5-rich"
git remote remove origin
git config user.name 'Aether Experiment'; git config user.email 'aether-exp@example.invalid'; git config commit.gpgsign false
mkdir -p .claude/skills scripts && cp -r "$E/guided/skill/threejs-game" .claude/skills/
echo '.claude/skills/' >> .git/info/exclude
cp "$E/rich/look.md" specs/001-snake-3d/look.md
cp "$E/rich/scripts/shots.cjs" "$E/rich/scripts/preview.html" "$E/rich/scripts/preview.mjs" scripts/
node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));p.scripts.shots="node scripts/shots.cjs";p.scripts["check:visual"]="node scripts/shots.cjs --check";fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")'
node "$E/guided/guide-tasks.mjs" specs/001-snake-3d/tasks.md
git add -A && git commit -q -m 'Add the shots tool, the preview page, look.md and the guided test command'
npm ci --silent --no-audit --no-fund
git worktree add -q .worktrees/integration -b feature/snake
(cd .worktrees/integration && npm ci --silent --no-audit --no-fund)
echo "s5-rich ready: $(git log --oneline -1)"
