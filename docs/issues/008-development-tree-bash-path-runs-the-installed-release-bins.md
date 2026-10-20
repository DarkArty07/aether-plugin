# With --plugin-dir, the Bash PATH runs the installed release's bins, so a development tree's swarm mixes two versions

**Type:** bug (development tree, `--plugin-dir`)
**Date:** 2026-10-14
**Found in:** the swarm run that built spec 002 (run `20261014-105117-b854`), in a session started with `aether-lead --plugin-dir <repo>/plugins/aether` while the marketplace release 0.9.0 was installed and enabled
**Status:** open
**Update 2026-10-19, branch `fix/bug-issues`:** proposals 1 and 2 are built. `aether-plan compile` passes its own bin directory as `binDir` in the run's args; the implementer runs `<binDir>/aether-wt ensure` and `diff` by path; the ops prompt prepends it to PATH in the one exact form `cd '<repo>' && PATH='<bin>':"$PATH" aether-…`, which `COMMAND_LINE` accepts and the mod answers only when that directory is its own `bin` (otherwise the model runs it, with the right bin first). `/aether:design` takes the same optional `binDir`, and the bootstrap's launch args name `${CLAUDE_PLUGIN_ROOT}/bin`. Args of an older compile, with no `binDir`, keep the bare names as before. Proposal 3 (turning the installed release off by hand) is no longer needed for the workflow's own commands; a Lead that runs the installed `aether-plan` by name still compiles a run of that version, now consistently.
**GitHub:** [#13](https://github.com/DarkArty07/aether-plugin/issues/13) (private repository)

## Summary

A session started with `--plugin-dir` loads the development tree's plugin (`aether@inline`, 0.9.1 here) in place of the installed release: its skills, agents, hooks and mod. Its Bash tool's `PATH` still resolves `aether-plan`, `aether-wt`, `aether-lane` and the other bins to the installed release, `~/.claude/plugins/cache/aether-plugin/aether/0.9.0/bin/`. Any command that names a bin without its path runs the older version.

## What happened

- In the Lead's session, `which aether-autonomy aether-plan aether-wt aether-lane aether-report aether-exam aether-voice` printed seven paths under `.../aether/0.9.0/bin/`. The session's init listed only `aether@inline` 0.9.1 as loaded.
- The workflow tells each implementer to run `aether-wt ensure` and `aether-wt diff` by name, so a development run would use 0.9.0's `aether-wt` for them.
- The Lead noticed it, and ran a copy of `run.workflow.js` with the tree's absolute bin path in the implementer's prompt and in the ops prompt.
- The ops prompt's change had a cost the Lead did not see. The mod answers an ops command only when its line is `cd '<path>' && aether-wt|aether-lane <args>` (`COMMAND_LINE` in `hooks/ops-command.mjs`), and it already runs its own plugin's bin, `${$.plugin.root}/bin`. With an absolute path in the line, no ops command matched, and every one of them went to the Haiku `ops` agent: slower, and exposed to the refusal of issue 004.

## Impact

- A development run silently mixes two versions of the bins. The run that builds a change to `aether-wt` or `aether-lane` would test the installed version, not the change.
- The workaround, absolute paths in the prompts, turns off the mod's answers to the ops commands.

## Proposals

1. `aether-plan compile` passes the plugin's own bin directory in the run's arguments, and the workflow names it in the implementer's prompt (`<bin>/aether-wt ensure`, `<bin>/aether-wt diff`).
2. The ops prompt keeps the bare bin name, which the mod already runs from its own root. On the model path (ops option off, or a mod that cannot run it), the prompt prepends the bin directory to `PATH` instead: `cd '<repo>' && PATH='<bin>':"$PATH" aether-wt …`, and `COMMAND_LINE` accepts that exact form when `<bin>` is the mod's own `${$.plugin.root}/bin`.
3. Until then, the README's Development section says to turn the installed release off for a development session: `--settings '{"enabledPlugins":{"aether@aether-plugin":false}}'`, merged with the launcher's own `--settings`.

## Acceptance

- In a session started with `--plugin-dir`, every `aether-*` command the workflow asks for, from an implementer, an ops agent or the mod, runs the development tree's bin.
- The mod still answers the ops commands of such a run, without a model.

## Environment

Claude Code 2.1.299, Aether 0.9.1 (`feat/grok-lane` at 9f0370c) loaded with `--plugin-dir`, Aether 0.9.0 installed from the marketplace, Linux (WSL2).
