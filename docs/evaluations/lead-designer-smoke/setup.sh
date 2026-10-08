#!/usr/bin/env bash
# Builds a throwaway fixture: an empty repository with a README, and its integration worktree.
# usage: setup.sh <fixture dir> <readme line>
# It never changes the caller's directory: every git command names its repository with -C.
set -euo pipefail
F=$1
case "$(basename "$F")" in aether-*) ;; *) echo "refusing: the fixture directory must be named aether-*" >&2; exit 2 ;; esac
rm -rf "$F"
mkdir -p "$F/data"
git init -q -b main "$F/repo"
git -C "$F/repo" config user.name "Aether Fixture"
git -C "$F/repo" config user.email "aether-fixture@example.invalid"
git -C "$F/repo" config commit.gpgsign false
printf '%s\n' "$2" > "$F/repo/README.md"
printf '.worktrees/\n' > "$F/repo/.gitignore"
git -C "$F/repo" add README.md .gitignore
git -C "$F/repo" commit -q -m "base"
git -C "$F/repo" worktree add -q "$F/repo/.worktrees/trial" -b feature/trial
echo "$F/repo/.worktrees/trial"
