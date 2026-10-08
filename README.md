# Aether Plugin

A plugin for Claude Code that adds an opt-in **Aether mode**: a parallel swarm of agents that implements an approved plan.

- **The Lead** is the main session, on Sonnet at `xhigh`. It holds the conversation with the owner, explores, chooses the route and runs the execution. It may design and implement spikes and bounded work.
- **The Designer** is the agent `aether:designer`, on Opus at `max`, in its own context. It designs with [superpowers](https://github.com/obra/superpowers): approaches, design, spec and plan. Among the agents it has the final say on design. Only the Designer writes specs and plans.
- **The swarm:** when parallel work pays off, the Lead hands the plan to `/aether:run`. In the swarm:
  - implementers work on Haiku by default and move up to Sonnet or Opus when a task is critical or keeps failing;
  - a supervisor on Sonnet reviews every attempt;
  - approved units merge one at a time;
  - Opus reviews the whole run;
  - code deletes every unit worktree and branch as soon as it is no longer used.

Without the plugin, Claude Code keeps working in normal mode, with superpowers alone. Aether Plugin is the successor to [Aether Agents](https://github.com/DarkArty07/Aether-Agents): the same method, rebuilt on a harness made for software.

## Status

Version 0.2: the Lead on Sonnet holds the conversation, and the Designer on Opus writes specs and plans.

**Trial 3** ([evaluation](docs/evaluations/2026-10-08-trial-3.md)) ran the same design request with the Lead and Designer split and with an Opus main session:
- the split's design captured all ten items of the owner's hidden intent, against nine;
- the blind pairwise judgment was a tie;
- in that short design session it cost the same at OpenRouter prices: $10.67 against $10.23.

No quality drop was found, and the owner kept the split. Its saving is meant for long sessions, which the trial does not measure.

- **Plan 1, foundation:** plan checking, unit worktrees and their cleanup.
- **Plan 2, the swarm:** the workflow and its agents.
- **Plan 3, measurement and the trial:** the usage meter, `aether-report`, and a trial against normal mode.

**Trial 1** ([evaluation](docs/evaluations/2026-10-08-trial-1.md)) ran the same 7-task plan in Aether mode and in normal mode (superpowers' subagent-driven development, with the same models per task):

| | Aether mode | Normal mode |
|---|---|---|
| Wall clock | 6 min 11 s | 24 min 25 s |
| Cost, Claude Code's list prices | $1.98 | $5.60 |
| Hidden acceptance suite | 33/33 | 33/33 |
| Open critical or important findings | 0 | 0 |

The gate to the published project (A9) passes: Aether mode was 3.9 times faster and 2.8 times cheaper, at equal quality on the spec. Normal mode's heavier review left its build somewhat more hardened beyond the spec. One trial on a small fixture is a first data point, not a proof.

**Trial 2** ([evaluation](docs/evaluations/2026-10-08-trial-2.md)) ran an 8-task plan for a three.js snake game, judged on graphics quality, creativity, playability and 3D quality:

| | Aether mode | Normal mode |
|---|---|---|
| Wall clock | 18 min 06 s | 2 h 18 min |
| Cost at OpenRouter prices | $4.17 | $21.95 |
| Hidden suite | 25/25 | 24/25 |
| Browser checks | 12/13 | 13/13 |
| Grade on the four criteria | 23/40 | 32/40 |

Aether mode was faster and cheaper again, but its quality was not equal. The transcripts point to two plugin settings:
- Aether's implementers run at a fixed `medium` effort, where normal mode's ran at `xhigh`;
- its briefs carry the plan's contract without the spec's quality bar.

The owner judged that the normal build's extra quality does not justify its time and cost. The next work raises Aether's quality with techniques that keep its time and cost. The evaluation [lists them](docs/evaluations/2026-10-08-trial-2.md#next-better-results-at-the-same-time-and-cost).

The design is [docs/superpowers/specs/2026-10-07-aether-plugin-design.md](docs/superpowers/specs/2026-10-07-aether-plugin-design.md).

## How it works

```text
owner ── confirms the Lead's understanding, approves the spec and the plan
  │
Lead (main session, Sonnet, xhigh): conversation, route, relay, execution
  │  hand-off once the owner confirms the understanding
  ▼
Designer (aether:designer, Opus, max): approaches, design, spec, plan
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
| `using-aether` skill | Injected at session start. The Lead's rules: the routes, the hand-off to the Designer, the relay of both sides, and when to offer the swarm |
| `aether:designer` | The Designer agent: Opus at `max`, with a 1-hour prompt cache. It does the architectural design and writes the specs and plans |
| `aether-voice` | Prints the owner's own words from a session, for the Designer to read; it writes no file |
| `aether-guard` | A PreToolUse hook that refuses Write, Edit, MultiEdit and NotebookEdit under `docs/superpowers/specs/` and `docs/superpowers/plans/` to every agent but the Designer |
| `swarm` skill | The Lead's procedure: compile, launch, read the result, report, relaunch, finalize |
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

Aether mode is chosen per session. `aether-mode` loads the plugin, turns on dynamic workflows, starts the Lead on Sonnet at `xhigh`, and turns the advisor tool off. `claude` stays in normal mode.

In fish:

    ln -s (realpath scripts/aether-mode.fish) ~/.config/fish/functions/aether-mode.fish

In bash or zsh:

    aether-mode() { CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1 claude --plugin-dir /path/to/aether-plugin/plugins/aether --settings '{"enableWorkflows": true}' --model sonnet --effort xhigh "$@"; }

Then work as you would with superpowers. When a plan is ready, the Lead offers three ways to execute it: superpowers' two (subagent-driven or native) and the swarm, and recommends one. The swarm needs:
- **a plan with Aether fields** on every task:

      **Aether:**
      - Tier: haiku — exact tests and interfaces pin the task down
      - Area: backend
      - Owns: `src/api/**`, `tests/api.test.js`
      - Depends on: none

- **an `## Aether Execution` section**, holding the test command, the ladder and the agent budget;
- **a separate integration worktree on a feature branch.** The Lead creates it with superpowers' `using-git-worktrees`;
- **permissions that let the agents run `git`, `aether-wt` and the tests**, and edit files under `.aether/worktrees/`, without asking each time.

Data lives in `~/.local/share/aether-plugin/` (or `AETHER_DATA_DIR`):
- `usage/<session>/` holds the usage meter's files, kept for 30 days;
- `runs.jsonl` holds one record per finalized or abandoned run.

## Development

The plugin is `plugins/aether/`; nothing outside it is loaded. To try a change, point `--plugin-dir` at a worktree's `plugins/aether`.

    npm test              # node --test "tests/*.test.js": bins, libraries and workflow scenarios
    npm run test:mod      # claude plugin test plugins/aether: the usage meter mod
    npm run validate      # claude plugin validate plugins/aether --strict
    npm run check         # all three

Node.js 22 with no dependencies. The workflow's tests run its script in a harness with stubbed agents, so they spend no tokens.

## Documentation

- [Design spec](docs/superpowers/specs/2026-10-07-aether-plugin-design.md): components, the swarm executor, routing, cleanup and measurement.
- [Plans](docs/superpowers/plans/): Plan 1 (foundation), Plan 2 (swarm) and Plan 3 (measurement and trial), each with its review and execution record.
- [Evaluations](docs/evaluations/): the trials against normal mode, with their fixtures, harnesses and results. Trial 2 keeps both builds, playable.
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

**Next:** raise Aether's quality at its current time and cost, with [trial 2's techniques](docs/evaluations/2026-10-08-trial-2.md#next-better-results-at-the-same-time-and-cost), then rerun trial 2 in Aether mode.

**Effort.**
- Since 2026-10-08, implementers run at `xhigh` on every tier; before, they ran at `medium`.
- Effort per task is the next sub-project. [Trial 3](docs/evaluations/2026-10-08-trial-3.md) left two complete candidate designs for it.

These are deferred until the trials justify them:
- non-Anthropic models through the Aether Router;
- notifications;
- several parallel attempts on critical units;
- risk-based review;
- marketplace publishing.
