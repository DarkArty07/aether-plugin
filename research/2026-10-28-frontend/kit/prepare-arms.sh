#!/usr/bin/env bash
# Copies the approved design (d-design, main) into the three Aether arms and adds what each arm has:
#   s2-normal: nothing; s3-skills: the 298 skills in .claude/skills/; s4-guided: look.md, the shots tool and preview,
#   the threejs-game skill, and the guided test command (applied by guide-tasks.mjs).
# Each arm gets an integration worktree .worktrees/integration on branch feature/snake.
set -euo pipefail
E=$HOME/.cache/aether-exp-frontend
for arm in s2-normal s3-skills s4-guided; do
  test ! -e "$E/$arm" || { echo "exists: $E/$arm"; exit 1; }
  git clone -q "$E/d-design" "$E/$arm"
  cd "$E/$arm"
  git remote remove origin
  git config user.name 'Aether Experiment'; git config user.email 'aether-exp@example.invalid'; git config commit.gpgsign false
  case $arm in
    s3-skills)
      mkdir -p .claude/skills && cp -r "$E/skills-all/." .claude/skills/
      echo '.claude/skills/' >> .git/info/exclude
      ;;
    s4-guided)
      mkdir -p .claude/skills scripts && cp -r "$E/guided/skill/threejs-game" .claude/skills/
      echo '.claude/skills/' >> .git/info/exclude
      cp "$E/guided/look.md" specs/001-snake-3d/look.md
      cp "$E/guided/scripts/shots.cjs" "$E/guided/scripts/preview.html" "$E/guided/scripts/preview.mjs" scripts/
      node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));p.scripts.shots="node scripts/shots.cjs";p.scripts["check:visual"]="node scripts/shots.cjs --check";fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")'
      node "$E/guided/guide-tasks.mjs" specs/001-snake-3d/tasks.md
      git add -A && git commit -q -m 'Add the shots tool, the preview page, look.md and the guided test command'
      ;;
  esac
  npm ci --silent --no-audit --no-fund
  git worktree add -q .worktrees/integration -b feature/snake
  (cd .worktrees/integration && npm ci --silent --no-audit --no-fund)
  echo "$arm ready: $(git log --oneline -1)"
done
