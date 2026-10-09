# Aether Plugin

A plugin for Claude Code that adds an opt-in **Aether mode**: a parallel swarm of agents that implements an approved plan.

- **The Lead** is the main session, on Sonnet at `xhigh`. It holds the conversation with the owner, explores, chooses the route and runs the execution. It decides as the owner's delegate: it closes the Designer's rounds with the owner's intent, and brings the owner only what that intent does not settle. It may design and implement spikes and bounded work.
- **The Designer** is the agent `aether:designer`, on Opus at `xhigh`, in its own context. It designs with [superpowers](https://github.com/obra/superpowers): approaches, design, spec and plan. Among the agents it has the final say on design. Only the Designer writes specs and plans.
- **The swarm:** when parallel work pays off, the Lead hands the plan to `/aether:run`. In the swarm:
  - implementers work on Haiku by default and move up to Sonnet or Opus when a task is critical or keeps failing;
  - a supervisor on Sonnet reviews every attempt;
  - approved units merge one at a time;
  - Opus reviews the whole run;
  - code deletes every unit worktree and branch as soon as it is no longer used.

Without the plugin, Claude Code keeps working in normal mode, with superpowers alone. Aether Plugin is the successor to [Aether Agents](https://github.com/DarkArty07/Aether-Agents): the same method, rebuilt on a harness made for software.

## Status

Version 0.6: the Lead on Sonnet holds the conversation and decides as the owner's delegate, the Designer on Opus writes specs and plans, each plan task sets its implementer's effort, and lanes run the swarm's calls and the Designer's rounds on other coding plans while their quota lasts. With the owner's permission, the Lead works for hours within ceilings of time and cost and ends with a brief, and it never asks again for what the owner authorized ([autonomy spec](docs/superpowers/specs/2026-10-09-lead-autonomy-design.md)). The copy the owner runs is an installed release, apart from the project: work on the plugin never changes it until the next install ([separation spec](docs/superpowers/specs/2026-10-09-separation-design.md)).

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
owner ── confirms the Lead's understanding, may give permission to work for hours, reviews the brief
  │
Lead (main session, Sonnet, xhigh): conversation, route, decisions as the owner's delegate, execution
  │  hand-off once the owner confirms the understanding
  ▼
Designer (aether:designer, Opus, xhigh): approaches, design, spec, plan
  │  writes the plan with Aether fields: tier and effort, area, owned files, dependencies
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
| `using-aether` skill | Injected at session start. The Lead's rules: the routes, the hand-off to the Designer, deciding with the Designer as the owner's delegate, fallbacks, autonomous runs and the execution method |
| `aether:designer` | The Designer agent: Opus at `xhigh`, with a 1-hour prompt cache. It does the architectural design and writes the specs and plans |
| `aether-voice` | Prints the owner's own words from a session, for the Designer to read; it writes no file |
| `aether-guard` | A PreToolUse hook that refuses Write, Edit, MultiEdit and NotebookEdit under `docs/superpowers/specs/` and `docs/superpowers/plans/` to every agent but the Designer, and on the autonomy registry and run states to every agent |
| `aether-autonomy` | The owner's standing authorizations, verified against their own words (`grant`, `revoke`, `check`, `list`), and an autonomous run's state and ceilings (`start`, `spend`, `status`, `end`) |
| `swarm` skill | The Lead's procedure: compile, launch, read the result, report, relaunch, finalize |
| `aether-plan` | Checks a plan and compiles it into briefs and a dependency graph of waves. It refuses chain-shaped plans, and waves whose tasks own overlapping files |
| `aether-wt` | Unit worktrees and branches: `ensure`, `diff`, `merge` (ownership check, then the tests; undone if they fail), `remove` (saves unmerged work as a patch), `sweep` |
| `/aether:run` | The workflow: waves, the escalation ladder, the agent budget, the merge queue, the final review, and cleanup in `finally` |
| Agents | `implementer`, `supervisor`, `reviewer` (adapted from superpowers' templates, MIT) and `ops` |
| Usage meter | A mod that records every model request: agent, model, tokens and time |
| `aether-report` | Reports a run's speed, cost and quality; `finalize` records the run; `price` prices any `claude -p` JSON output |
| SessionStart hook | Injects the bootstrap, sweeps runs left untouched for 24 hours, deletes usage files not written to for 30 days, and points a new Lead to an open autonomous run |

### Lanes

A lane runs Aether's own calls on another coding plan the owner pays for, while that plan's quota lasts. The first is agy, the Antigravity CLI. See the [lanes spec](docs/superpowers/specs/2026-10-08-lanes-design.md).

- **Who takes a call.** `plugins/aether/config/lanes.json` names one external model per native model and role: Gemini 3.8 Flash for Haiku implementers, and agy's own Sonnet 5.5 and Opus 5.5 for the rest. agy's `high` runs Claude's `high` and `xhigh`; calls at `max`, and `ops`, are always native.
- **Quota.** A group is used while both its windows, 5 hours and weekly, stay above a 5% reserve.
- **Fallback.** When agy is missing, out of quota or fails, the same call runs on Aether's own agent, without spending the ladder.
- **Containment.** agy runs with `--dangerously-skip-permissions` in the unit's worktree. Git checks catch changes outside the task's Owns, to the integration worktree and branch, and from read-only roles. It is not contained beyond that; the owner accepted this for 0.4.0.
- **The Designer** can run its rounds on agy too, each round a transaction that may change only specs and plans.
- **Report.** `aether-report` shows each group's quota consumed and the dollars at list price, apart from native Claude.
- **Off for one run:** `aether-plan compile <plan.md> --no-lanes`.
- **Linux only.** Lanes need Linux, because stopping a lane's processes reads `/proc`.

### Autonomy

The Lead decides as the owner's delegate, and the owner's reviews are two: the permission to work at the start, and the brief at the end. See the [autonomy spec](docs/superpowers/specs/2026-10-09-lead-autonomy-design.md).

- **Deciding.** The Designer's reply says who closes each round (`Decide: lead` or `owner`). The Lead closes what the owner's intent covers. Only what it does not cover, what conflicts with it, and unauthorized irreversible actions reach the owner. Failures with a defined fallback, such as a lane out of quota, never do.
- **Standing authorizations.** When the owner authorizes a class of irreversible action in general words, the Lead records it with `aether-autonomy grant`, quoting the owner. The quote is checked against the owner's own messages in the session's transcript, and checked again when read. The classes are `merge-main`, `push`, `publish`, `deploy`, `delete`, `credentials` and `paid-call`. Everything local and reversible proceeds without asking.
- **Autonomous runs.** The owner's permission to work for hours starts a run (`aether-autonomy start`), with ceilings of 8 hours and US$ 50 unless the owner names others. The Lead keeps a diary, keeps working while work remains, stops when done, at a ceiling or honestly, and writes a brief: what it did, decided and found, what waits for the owner's yes, what it did not finish, proposals, and time and cost.
- **Cost.** A run's figure covers the swarm and the lanes, as `aether-report` prices them; the Lead's own turns are not added up. The time ceiling is the real guard.
- **Permissions.** A permission prompt stops a run like a question. Start a session meant for an autonomous run with a permission mode or allow rules that cover its tools; Aether never turns permissions off.
- **Files.** `.aether/autonomy/` in the repository's main checkout holds `grants.json`, and for each run `run.json`, `diary.md` and `brief.md`. Only `aether-autonomy` writes `grants.json` and `run.json`.

## Use Aether mode

**Requirements:**
- Claude Code 2.1.294 or later;
- Node.js 22;
- git 2.36 or later;
- the superpowers plugin.

Aether mode is chosen per session. `aether-mode` loads the installed release of the plugin, turns on dynamic workflows, starts the Lead on Sonnet at `xhigh`, and turns the advisor tool off. `claude` stays in normal mode.

The copy you run is a release, installed apart from the project: work in the repository, merges to `main` included, never changes it until you install another release. From a clone, install the latest release from its tags, with no network, then link the launcher from the installed copy. In fish:

    node scripts/aether-install.js install
    ln -sfn ~/.local/share/aether-plugin/installed/current/scripts/aether-mode.fish ~/.config/fish/functions/aether-mode.fish

In bash or zsh, after the same `install`:

    aether-mode() { CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1 claude --plugin-dir "$(realpath ~/.local/share/aether-plugin/installed/current)/plugins/aether" --settings '{"enableWorkflows": true}' --model sonnet --effort xhigh "$@"; }

With `AETHER_DATA_DIR` set, use it in place of `~/.local/share/aether-plugin` in these two lines.

`node scripts/aether-install.js` has three commands:
- `install [<version>]` installs the release tagged `aether--v<version>`, or the latest one, and makes it current. The release that was current becomes the previous one. The next `aether-mode` session loads it; a running session keeps the release it started with.
- `rollback` swaps the current and the previous release.
- `status` shows the current and the previous release, and the latest tag.

`aether-mode --dev`, in fish, loads the repository's development tree instead of the installed release, to try the plugin itself on purpose.

Then work as you would with superpowers. The Lead decides the design with your intent and stops at the plan with a short brief, recommending one of three ways to execute it: superpowers' two (subagent-driven or native) and the swarm. Give it permission to work for hours, and it runs to the end, chooses the method itself, and gives you the brief. The swarm needs:
- **a plan with Aether fields** on every task:

      **Aether:**
      - Tier: haiku high — exact tests and interfaces pin the task down
      - Area: backend
      - Owns: `src/api/**`, `tests/api.test.js`
      - Depends on: none

- **an `## Aether Execution` section**, holding the test command, the ladder and the agent budget;
- **a separate integration worktree on a feature branch.** The Lead creates it with superpowers' `using-git-worktrees`;
- **permissions that let the agents run `git`, `aether-wt` and the tests**, and edit files under `.aether/worktrees/`, without asking each time.

Data lives in `~/.local/share/aether-plugin/` (or `AETHER_DATA_DIR`):
- `usage/<session>/` holds the usage meter's files, kept for 30 days;
- `runs.jsonl` holds one record per finalized or abandoned run;
- `installed/` holds the installed releases, one directory per version, and the `current` and `previous` links;
- `.env` holds the Artificial Analysis API key that `scripts/refresh-lanes.js` reads when `ARTIFICIAL_ANALYSIS_API_KEY` is not set.

The autonomy registry and run states live in the repository itself, under `.aether/autonomy/` in its main checkout.

## Development

The plugin is `plugins/aether/`; nothing outside it is loaded. The main checkout no longer feeds `aether-mode`: a session loads the installed release, and the `bin/` on its `PATH` is that release's. To try a branch, run its bins by path (`node <worktree>/plugins/aether/bin/aether-plan check <plan>`), point `--plugin-dir` at the worktree's `plugins/aether`, or start the session with `aether-mode --dev`, which loads the main checkout.

    npm test              # node --test "tests/*.test.js": bins, libraries and workflow scenarios
    npm run test:mod      # claude plugin test plugins/aether: the usage meter mod
    npm run validate      # claude plugin validate plugins/aether --strict
    npm run check         # all three

Node.js 22 with no dependencies. The workflow's tests run its script in a harness with stubbed agents, so they spend no tokens.

### Release

A release reaches `aether-mode` only when it is installed:
1. bump `"version"` in `plugins/aether/.claude-plugin/plugin.json`, and with it the version that `tests/launcher.test.js` pins and the `Version 0.x` status line of this README;
2. run `npm run check`;
3. merge to `main`;
4. in the main checkout, run `claude plugin tag plugins/aether`, which creates the tag `aether--v<version>`;
5. run `node scripts/aether-install.js install`.

`node scripts/aether-install.js rollback` goes back to the previous release. If the script cannot run, swap the links by hand: in `~/.local/share/aether-plugin/installed/`, point `current` at the directory `previous` names, and `previous` at the one `current` named. Each link's target is the bare directory name, for example `ln -sfn 0.5.0-4130f86 current` run inside `installed/`; an absolute target works for the launcher, but `status` and `rollback` cannot read it.

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
- Each task's tier picks its model and its effort.
- `aether-plan` refuses chain-shaped plans.

## Principles

1. **Mechanism in code, judgment in the model.** Anything that must always happen the same way (status, retries, budgets, cleanup) is code, never a prompt instruction.
2. **Bounded autonomy.** Every run has an agent budget and a verifiable definition of done. Work that hits a real question comes back blocked, with the question.
3. **The task chooses the model and its effort.** Each task's Tier line sets the start. A failed attempt runs again at `xhigh`, and then on a stronger model.
4. **Contracts first, then the swarm.** Plans give interfaces, failing tests and file ownership. Units are independent by default, and every dependency needs a reason.
5. **superpowers is the method.** Aether adds only the multi-agent organization.

## Roadmap

**Next:** raise Aether's quality at its current time and cost, with [trial 2's techniques](docs/evaluations/2026-10-08-trial-2.md#next-better-results-at-the-same-time-and-cost), then rerun trial 2 in Aether mode.

**Effort.** Since version 0.3.0, each plan task sets its implementer's effort on its Tier line, by the task's complexity ([spec](docs/superpowers/specs/2026-10-08-effort-per-task-design.md)).
- The default is `xhigh` on every model. The Designer lowers it where the tests pin the work, and names `max` only with a reason.
- A failed attempt runs again at `xhigh`, then moves up the ladder.
- The supervisor reviews at `high`, and a task's Review line can raise it.
- `aether-report` shows the cost and the time of each role, model and effort. `scripts/check-effort.js` checks, from a session's transcripts, that each agent ran at the effort its call asked for.

These are deferred until the trials justify them:
- non-Anthropic models through the Aether Router;
- notifications;
- several parallel attempts on critical units;
- risk-based review;
- marketplace publishing.

## License

Aether Plugin is open source under the [MIT License](LICENSE). The implementer, supervisor and reviewer agents adapt prompt templates of [superpowers](https://github.com/obra/superpowers), also under the MIT License; [`plugins/aether/NOTICE`](plugins/aether/NOTICE) has the details. The plugin directory carries its own copy of the license.
