---
title: Ops without a model
description: How the Aether mod runs the workflow's own commands without a model, what that changes, and when it falls back to the ops agent
order: 14
---

# Ops without a model

In an Aether session the mod runs the workflow's own commands without a model; `ops`, on by default, turns that on (see [Options](options.md#options)).

## How the mod answers

**Ops without a model.** The workflow has no shell, so it hands each of its own `aether-wt` and `aether-lane` commands (`merge`, `salvage`, `remove`, `diff --final`, `sweep` and the lane commands) to an `ops` agent. In an Aether session the mod answers that agent itself, with no model request:
- it checks the prompt against the closed list of commands the workflow sends (`hooks/ops-command.mjs`);
- it runs the command with `node` and `$.process.run`, with no shell;
- it returns the command's exit code and output.

With the `ops` option off, none of this happens: every ops agent runs on the model path. Any workflow in an Aether session gets that answer, for any repository and run its prompt names. Anything else falls back to the Haiku `ops` agent, as before: another prompt, a refused `$.process.run`, a command it cannot start, or a bin that fails to load. A command that ran and gave no result, stopped at the timeout or killed, is reported as an error and never handed to the model. Implementers still run `aether-wt ensure` and `diff` with their own Bash tool. What changes for these commands:
- **Permissions.** The session's permission rules and mode, and Bash `PreToolUse` hooks, no longer apply to them. What bounds them is the closed list and the Aether session's mark.
- **Environment.** They run in Claude Code's own environment, and so does what they start: the plan's test command, inside a merge, and the harnesses' CLIs. Exports from `CLAUDE_ENV_FILE` and `PATH` entries only your shell profile adds do not reach them. Make the test command work without them. `aether-lane status` also looks for each harness's CLI (`agy`, `codex`, `grok`, `cursor-agent`, `muse`) on that `PATH`; one it does not find is reported as not installed and takes no calls, and when none is found every call runs native.
- **The 10-minute limit.** A merge whose tests outlast 10 minutes is stopped after its merge commit. The unit is unverified: `aether-wt status` reports it so, and the run reruns the plan's tests on the integration branch, without a second merge commit. Tests that pass count the unit merged. Tests that fail revert the commit, and the unit gets the usual one retry. A merge cut twice leaves the unit blocked, with its commit on the integration branch and its marker kept; the reason says its merge commit is on the integration branch without a passing test run. Every later merge is refused with `unverified-other` until the Lead settles that unit. Settle that unit before relaunching it. The Lead settles it by running `aether-wt merge <run> <task>` again, which reruns the tests, or, when that commit is still the tip of the integration branch, by dropping it with `git reset --hard <commit>^1` after checking that the unit's branch was kept. When that commit is no longer the tip because something was committed on top, the Lead runs the plan's tests by hand on the integration branch; when they pass, deletes the unit's marker file in the run's `unverified/` directory (`.aether/runs/<run>/unverified/<task>.json`) and the unit counts as merged; when they fail, fixes forward; never `git reset` past work that is not the unverified commit. A marker of a task that `--only` dropped from the graph cannot be settled while it is out of the graph: recompile with that task included, then `aether-wt merge <run> <task>`. If a merge was killed inside `git merge` and later merges answer `dirty-integration`, run `aether-wt merge <run> <that task>` for the unit whose merge was killed: it aborts the leftover merge and clears its marker. A relaunch that adds commits on the unit branch first is refused with `unverified-moved`. With an unverified unit, discard or stash uncommitted changes in the integration worktree and never commit them: a commit buries the unverified merge. The error of a cut says the command was still running after 600 s and was stopped.
- **The capability.** The mod now calls `$.process.run`, and `claude plugin validate` lists it. If your organization's policy refuses that call, the agent path runs. A policy that refuses the whole mod also turns off the usage meter, lanes (the mod saves their prompts), and the hiding of Aether's agents in other sessions.

See [decision A30](../decisions.md).
