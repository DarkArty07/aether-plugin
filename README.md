# Aether Plugin

A plugin for Claude Code that adds an opt-in **Aether mode**: a parallel swarm of agents that implements an approved plan.

- **The Designer** is the main session, on Opus. It designs with [superpowers](https://github.com/obra/superpowers) and has the final say among the agents.
- **Handing work to the swarm:** when parallel work pays off, the Designer hands the plan to `/aether:run`. In the swarm:
  - implementers work on Haiku by default and move up to Sonnet or Opus when a task is critical or keeps failing;
  - a supervisor on Sonnet reviews every attempt;
  - approved units merge one at a time;
  - Opus reviews the whole run;
  - code deletes every unit worktree and branch as soon as it is no longer used.

Without the plugin, Claude Code keeps working in normal mode, with superpowers alone. Aether Plugin is the successor to [Aether Agents](https://github.com/DarkArty07/Aether-Agents): the same method, rebuilt on a harness made for software.

## Status

Version 0.1.

- **Plan 1, foundation:** plan checking, unit worktrees and their cleanup.
- **Plan 2, the swarm:** the workflow and its agents.
- **Plan 3, measurement and the trial:** the usage meter, `aether-report`, and a trial against normal mode.

**Trial 1** ([evaluation](docs/evaluations/2026-10-08-trial-1.md)) ran the same 7-task plan in Aether mode and in normal mode (superpowers' subagent-driven development, with the same models per task):

| | Aether mode | Normal mode |
|---|---|---|
| Wall clock | 6 min 11 s | 24 min 25 s |
| Cost (list prices, the same rates as OpenRouter) | $1.98 | $5.60 |
| Hidden acceptance suite | 33/33 | 33/33 |
| Open critical or important findings | 0 | 0 |

The gate to the published project (A9) passes: Aether mode was 3.9 times faster and 2.8 times cheaper, at equal quality on the spec. Normal mode's heavier review left its build somewhat more hardened beyond the spec. One trial on a small fixture is a first data point, not a proof.

The design is [docs/superpowers/specs/2026-10-07-aether-plugin-design.md](docs/superpowers/specs/2026-10-07-aether-plugin-design.md).

## How it works

```text
owner ── approves the spec and the plan
  │
Designer (main session, Opus, superpowers)
  │  writes the plan with Aether fields: tier, area, owned files, dependencies
  │  aether-plan check / compile
  ▼
/aether:run (dynamic workflow)
  ├─ wave 1: units in parallel, each in its own git worktree
  │    implementer (haiku → sonnet → opus) ⇄ supervisor (sonnet): approve, retry, escalate or block
  ├─ merges, one at a time, with the tests run at every merge
  ├─ wave 2 …
  ├─ final review (opus) of everything merged
  └─ cleanup: no unit worktree or aether/* branch is left behind
  │
aether-report: speed, cost (OpenRouter prices) and quality
aether-report finalize: a record in runs.jsonl, and the run's directory deleted
```

| Piece | What it does |
|---|---|
| `using-aether` skill | Injected at session start. The Designer's rules: route each task by quality, cost and speed; add Aether fields to plans; offer the swarm at the plan handoff |
| `swarm` skill | The Designer's procedure: compile, launch, read the result, report, relaunch, finalize |
| `aether-plan` | Checks a plan and compiles it into briefs and a dependency graph of waves. It refuses chain-shaped plans, and waves whose tasks own overlapping files |
| `aether-wt` | Unit worktrees and branches: `ensure`, `diff`, `merge` (ownership check, then the tests; undone if they fail), `remove` (saves unmerged work as a patch), `sweep` |
| `/aether:run` | The workflow: waves, the escalation ladder, the agent budget, the merge queue, the final review, and cleanup in `finally` |
| Agents | `implementer`, `supervisor`, `reviewer` (adapted from superpowers' templates, MIT) and `ops` |
| Usage meter | A mod that records every model request: agent, model, tokens and time |
| `aether-report` | Reports a run's speed, cost and quality; `finalize` records the run; `price` prices any `claude -p` JSON output |
| SessionStart hook | Injects the bootstrap, sweeps runs left untouched for 24 hours, and deletes usage files not written to for 30 days |

## Use Aether mode

**Requirements:**
- Claude Code 2.1.294 or later;
- Node.js 22;
- git 2.36 or later;
- the superpowers plugin.

Aether mode is chosen per session. `aether-mode` loads the plugin and turns on dynamic workflows. `claude` stays in normal mode.

In fish:

    ln -s (realpath scripts/aether-mode.fish) ~/.config/fish/functions/aether-mode.fish

In bash or zsh:

    aether-mode() { claude --plugin-dir /path/to/aether-plugin/plugins/aether --settings '{"enableWorkflows": true}' "$@"; }

Then work as you would with superpowers. When a plan is ready, the Designer offers three ways to execute it: superpowers' two (subagent-driven or native) and the swarm, and recommends one. The swarm needs:
- **a plan with Aether fields** on every task:

      **Aether:**
      - Tier: haiku — exact tests and interfaces pin the task down
      - Area: backend
      - Owns: `src/api/**`, `tests/api.test.js`
      - Depends on: none

- **an `## Aether Execution` section**, holding the test command, the ladder and the agent budget;
- **a separate integration worktree on a feature branch.** The Designer creates it with superpowers' `using-git-worktrees`;
- **permissions that let the agents run `git`, `aether-wt` and the tests**, and edit files under `.aether/worktrees/`, without asking each time.

Data lives in `~/.local/share/aether-plugin/` (or `AETHER_DATA_DIR`):
- `usage/<session>/` holds the usage meter's files, kept for 30 days;
- `runs.jsonl` holds one record per finalized or abandoned run.

## Development

The plugin is `plugins/aether/`; nothing outside it is loaded. To try a change, point `--plugin-dir` at a worktree's `plugins/aether`.

    node --test "tests/*.test.js"                # bins, libraries and workflow scenarios
    claude plugin test plugins/aether            # the usage meter mod
    claude plugin validate plugins/aether --strict

Node.js 22 with no dependencies. The workflow's tests run its script in a harness with stubbed agents, so they spend no tokens.

## Documentation

- [Design spec](docs/superpowers/specs/2026-10-07-aether-plugin-design.md): components, the swarm executor, routing, cleanup and measurement.
- [Plans](docs/superpowers/plans/): Plan 1 (foundation), Plan 2 (swarm) and Plan 3 (measurement and trial), each with its review and execution record.
- [Evaluations](docs/evaluations/): the trial against normal mode.
- [Claude Code research](docs/claude-code-research.md): the verified capabilities and limits this design relies on, and the prices.
- [Decisions](docs/decisions.md): D1–D15 from the first design session, with their updates, and A1–A10 from the spec.
- [Aether Agents retrospective](docs/aether-retrospective.md): what Aether was, and what failed and why.

## Lessons from Aether Agents

The method worked: specs, exploration notes, saved learnings and visible order. The infrastructure did not:
- A general personal-assistant harness offered many equivalent tools, so the model took a different path for the same request each time.
- Autonomy had no hard budget and no independent check of "done", and it turned into more than 20 hours of over-engineering.
- Blocked work failed silently.
- Each role had a fixed model, but critical units, especially frontend work, need a strong one.
- The supervisor chained its tasks, so the intended swarm never ran in parallel.

Aether Plugin answers each failure:
- Claude Code is the harness.
- The workflow enforces budgets, the ladder and serialized merges in code.
- Blocked units come back with their question.
- Each task's tier picks its model.
- `aether-plan` refuses chain-shaped plans.

## Principles

1. **Mechanism in code, judgment in the model.** Anything that must always happen the same way (status, retries, budgets, cleanup) is code, never a prompt instruction.
2. **Bounded autonomy.** Every run has an agent budget and a verifiable definition of done. Work that hits a real question comes back blocked, with the question.
3. **The task chooses the model.** Tiers in the plan set the start, and failures move a unit up the ladder.
4. **Contracts first, then the swarm.** Plans give interfaces, failing tests and file ownership. Units are independent by default, and every dependency needs a reason.
5. **superpowers is the method.** Aether adds only the multi-agent organization.

## Roadmap

These are deferred until the trial justifies them:
- non-Anthropic models through the Aether Router;
- notifications;
- several parallel attempts on critical units;
- risk-based review;
- marketplace publishing.
