# Acceptance A6: nothing published, and the owner's 0.6.0 intact

Date: 2026-10-09
Run: 20261009-181450-2c4e, task-16
Scope: read-only. No `claude` command, no `git push`, `git tag`, `git fetch` or `git merge` was run. Nothing outside this unit's worktree was written.

Context: `git log --oneline -3` in the unit worktree, taken before the checks:

```
35e7aa8 Merge aether/20261009-181450-2c4e/task-10
421ecc4 docs(aether): 0.7.0, the install guide, the records, and the installer and fish launcher retired
2df7681 docs(aether): acceptance A2 checks that the Lead is offered Aether's agents
```

## Check 1: release tags

Command:

```
git tag --list 'aether--v*'
```

Output:

```
aether--v0.1.0
aether--v0.2.0
aether--v0.3.0
aether--v0.4.0
aether--v0.5.0
aether--v0.6.0
```

Expected: exactly `aether--v0.1.0`, `aether--v0.2.0`, `aether--v0.3.0`, `aether--v0.4.0`, `aether--v0.5.0` and `aether--v0.6.0`, one per line. No tag was added.

Result: PASS

## Check 2: the 0.6.0 tag commit

Command:

```
git rev-parse 'aether--v0.6.0^{commit}'
```

Output: `0d2dd38d49448f871d8b03c6414a050962bc7090`

Expected: `0d2dd38d49448f871d8b03c6414a050962bc7090`

Result: PASS

## Check 3: the remote main ref (nothing published)

Command:

```
git rev-parse refs/remotes/origin/main
```

Output: `4130f868357dcca13aadea594fc78eb765d6df49`

Expected: `4130f868357dcca13aadea594fc78eb765d6df49`. The remote main is still at 0.5.0; the 0.6.0 commits and tag have not been pushed.

Result: PASS

## Check 4: installed current link

Command:

```
readlink ~/.local/share/aether-plugin/installed/current
```

Output: `0.6.0-0d2dd38` (the link target exists on this machine)

Expected: `0.6.0-0d2dd38`

Result: PASS

## Check 5: installed previous link

Command:

```
readlink ~/.local/share/aether-plugin/installed/previous
```

Output: `0.5.0-4130f86`

Expected: `0.5.0-4130f86`

Result: PASS

## Check 6: installed 0.6.0 copy content hash

Command:

```
(cd ~/.local/share/aether-plugin/installed/0.6.0-0d2dd38 && find . -type f | LC_ALL=C sort | xargs sha256sum | sha256sum)
```

Output: `976dd3fdb212b5d107c137dca1648b691e0fddb29396f4891327f80b2b2bf166  -`

Expected: `976dd3fdb212b5d107c137dca1648b691e0fddb29396f4891327f80b2b2bf166  -`

Result: PASS

## Check 7: fish launcher link

Command:

```
readlink ~/.config/fish/functions/aether-mode.fish
```

Output: `/home/darkarty/.local/share/aether-plugin/installed/current/scripts/aether-mode.fish` (the link path and its target exist on this machine)

Expected: `/home/darkarty/.local/share/aether-plugin/installed/current/scripts/aether-mode.fish`

Result: PASS

## Summary

All seven checks match their expected values. No difference was found, so nothing was fixed or changed.

Result: PASS

## Re-run after the whole run merged

The checks above ran when only task-10 had merged. The final review (important finding) asked for them again once every task had merged, so that C6 covers the riskier acceptance probes of tasks 11 to 15.

Context: HEAD `c005ef4` (the merge of task-14), the integration branch with all sixteen tasks merged. The same seven commands, read-only, run by the Lead:

| # | Command | Output | Matches the expected value of its check above |
|---|---|---|---|
| 1 | `git tag --list 'aether--v*'` | `aether--v0.1.0` to `aether--v0.6.0`, six tags, no `aether--v0.7*` | yes |
| 2 | `git rev-parse 'aether--v0.6.0^{commit}'` | `0d2dd38d49448f871d8b03c6414a050962bc7090` | yes |
| 3 | `git rev-parse refs/remotes/origin/main` | `4130f868357dcca13aadea594fc78eb765d6df49` | yes |
| 4 | `readlink ~/.local/share/aether-plugin/installed/current` | `0.6.0-0d2dd38` | yes |
| 5 | `readlink ~/.local/share/aether-plugin/installed/previous` | `0.5.0-4130f86` | yes |
| 6 | the content hash of `installed/0.6.0-0d2dd38` | `976dd3fdb212b5d107c137dca1648b691e0fddb29396f4891327f80b2b2bf166  -` | yes |
| 7 | `readlink ~/.config/fish/functions/aether-mode.fish` | `/home/darkarty/.local/share/aether-plugin/installed/current/scripts/aether-mode.fish` | yes |

Nothing was published, pushed or tagged by the run, and the owner's installed 0.6.0 copy is intact after tasks 11 to 15.

Result: PASS
