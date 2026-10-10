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

Version 0.7: the Lead on Sonnet holds the conversation and decides as the owner's delegate, the Designer on Opus writes specs and plans, each plan task sets its implementer's effort, and lanes run the swarm's calls and the Designer's rounds on other coding plans while their quota lasts. With the owner's permission, the Lead works for hours within ceilings of time and cost and ends with a brief, and it never asks again for what the owner authorized ([autonomy spec](docs/superpowers/specs/2026-10-09-lead-autonomy-design.md)). Since 0.7, Aether installs with Claude Code's own plugin commands and starts with `claude --agent aether:lead --effort xhigh`; plain `claude` stays normal mode ([installable plugin spec](docs/superpowers/specs/2026-10-09-installable-plugin-design.md)).

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
| `aether-guard` | A PreToolUse hook that, in an Aether session, refuses Write, Edit, MultiEdit and NotebookEdit under `docs/superpowers/specs/` and `docs/superpowers/plans/` to every agent but the Designer, and on the autonomy registry and run states to every agent. In any other session it allows everything |
| `aether-autonomy` | The owner's standing authorizations, verified against their own words (`grant`, `revoke`, `check`, `list`), and an autonomous run's state and ceilings (`start`, `spend`, `status`, `end`) |
| `swarm` skill | The Lead's procedure: compile, launch, read the result, report, relaunch, finalize |
| `aether-plan` | Checks a plan and compiles it into briefs and a dependency graph of waves. It refuses chain-shaped plans, and waves whose tasks own overlapping files |
| `aether-wt` | Unit worktrees and branches: `ensure`, `diff`, `merge` (ownership check, then the tests; undone if they fail), `remove` (saves unmerged work as a patch), `sweep` |
| `/aether:run` | The workflow: waves, the escalation ladder, the agent budget, the merge queue, the final review, and cleanup in `finally` |
| Agents | `implementer`, `supervisor`, `reviewer` (adapted from superpowers' templates, MIT) and `ops` |
| Usage meter and ops | A mod that records every model request of an Aether session: agent, model, tokens and time. It also runs the workflow's own `aether-wt` and `aether-lane` commands itself, without a model (see below). In any other session it records and runs nothing, and does not offer Aether's agents |
| `aether-report` | Reports a run's speed, cost and quality; `finalize` records the run; `price` prices any `claude -p` JSON output |
| SessionStart hook | In an Aether session: marks the session, passes the lanes option to its commands, injects the bootstrap, sweeps runs left untouched for 24 hours, deletes usage files not written to for 30 days, and points a new Lead to an open autonomous run. In any other session it does nothing |

**Ops without a model.** The workflow has no shell, so it hands each of its own `aether-wt` and `aether-lane` commands (`merge`, `remove`, `diff --final`, `sweep` and the lane commands) to an `ops` agent. In an Aether session the mod answers that agent itself, with no model request:
- it checks the prompt against the closed list of commands the workflow sends (`hooks/ops-command.mjs`);
- it runs the command with `node` and `$.process.run`, with no shell;
- it returns the command's exit code and output.

Anything else falls back to the Haiku `ops` agent, as before: another prompt, a refused `$.process.run`, a command it cannot start, or a bin that fails without printing anything. Implementers still run `aether-wt ensure` and `diff` with their own Bash tool. What changes for these commands:
- **Permissions.** The session's permission rules and mode, and Bash `PreToolUse` hooks, no longer apply to them.
- **Environment.** They run in Claude Code's own environment, and so does what they start: the plan's test command, inside a merge, and agy. Exports from `CLAUDE_ENV_FILE` and `PATH` entries only your shell profile adds do not reach them. Make the test command work without them.
- **The 10-minute limit.** A merge whose tests outlast 10 minutes is stopped after its merge commit and before its revert, and the error says so.
- **The capability.** The mod now calls `$.process.run`, and `claude plugin validate` lists it. If your organization's policy refuses that call, the agent path runs. A policy that refuses the whole mod also turns off the usage meter, lanes (the mod saves their prompts), and the hiding of Aether's agents in other sessions.

See [decision A30](docs/decisions.md).

### Lanes

A lane runs Aether's own calls on another coding plan the owner pays for, while that plan's quota lasts. The first is agy, the Antigravity CLI. See the [lanes spec](docs/superpowers/specs/2026-10-08-lanes-design.md).

- **Who takes a call.** `plugins/aether/config/lanes.json` names one external model per native model and role: Gemini 3.8 Flash for Haiku implementers, and agy's own Sonnet 5.5 and Opus 5.5 for the rest. agy's `high` runs Claude's `high` and `xhigh`; calls at `max`, and `ops`, are always native.
- **Quota.** A group is used while both its windows, 5 hours and weekly, stay above a 5% reserve.
- **Fallback.** When agy is missing, out of quota or fails, the same call runs on Aether's own agent, without spending the ladder.
- **Containment.** agy runs with `--dangerously-skip-permissions` in the unit's worktree. Git checks catch changes outside the task's Owns, to the integration worktree and branch, and from read-only roles. It is not contained beyond that; the owner accepted this for 0.4.0.
- **The Designer** can run its rounds on agy too, each round a transaction that may change only specs and plans.
- **Report.** `aether-report` shows each group's quota consumed and the dollars at list price, apart from native Claude.
- **Off for one run:** `aether-plan compile <plan.md> --no-lanes`.
- **Off by default.** Lanes run only when the plugin's `lanes` option is on (see Options).
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

### Requirements

- Claude Code 2.1.294 or later;
- Node.js 22;
- git 2.36 or later;
- superpowers, which Claude Code installs with Aether from its official marketplace.

### Install

    claude plugin install aether --marketplace DarkArty07/aether-plugin

Add `--config lanes=true` to turn the lanes on (see Options). In a session, `/plugin install aether --marketplace DarkArty07/aether-plugin` does the same and lets you choose the scope.

If Claude Code says that `superpowers@claude-plugins-official` is not installed, add Claude Code's official marketplace, which it adds by itself at your first interactive session, and install again:

    claude plugin marketplace add anthropics/claude-plugins-official

### Start

Aether mode is chosen per session:

    claude --agent aether:lead --effort xhigh

The Lead is the agent `aether:lead`, on Sonnet. `--effort xhigh` sets its effort, because a plugin cannot. The command is the same in every shell.

To make Aether mode the default in one repository, put this in its `.claude/settings.local.json`:

    { "agent": "aether:lead", "effortLevel": "xhigh" }

Plain `claude` then starts Aether mode there, and `claude --agent claude` starts normal mode, with the repository's `effortLevel`.

Plain `claude` stays normal mode: the plugin is dormant there. Its hooks do nothing, its usage meter records nothing, and its agents are not offered.

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

### What Aether adds to a normal session

Measured on Claude Code 2.1.296 with Aether 0.7.0, in a session started without `--agent aether:lead`, against the same session with Aether disabled:
- the first request grows by 431 characters, all in the first message: the `aether:run` and `aether:swarm` entries of the skills list;
- the system prompt and the tools are unchanged;
- `claude plugin details` estimates about 100 tokens always on;
- the eight commands of `bin/` are on the Bash tool's `PATH`;
- each session start, and each `Write`, `Edit`, `MultiEdit` or `NotebookEdit` call, runs one short `node` process that finds no Aether session and exits.

Nothing is injected, refused, recorded or written.

### Options

`lanes`, off by default, runs Aether's calls on agy while its quota lasts. agy runs with `--dangerously-skip-permissions` and spends another plan's quota, so you turn it on yourself. Lanes run only on Linux. Turn it on at install with `--config lanes=true`, or later in `/plugin` → Installed → aether → Configure options. `claude plugin configure aether@aether-plugin` shows the options and which are unset.

### What you set yourself

A plugin cannot set these, so you do:

| Need | Step |
|---|---|
| The Lead at `xhigh` | `--effort xhigh` in the start command, or `effortLevel` in the repository's settings |
| Dynamic workflows, for the swarm | Nothing on most paid plans. On Pro, turn on Dynamic workflows in `/config` once |
| No advisor in Aether mode (each call rereads the whole conversation, uncached) | Nothing unless you configured one. If you did, run `/advisor off` |
| Permissions for the swarm | Allow rules for `git`, `aether-wt`, `aether-lane` and the test command, and edits under `.aether/worktrees/` |
| superpowers | Nothing when Claude Code's official marketplace is added, as it is after your first interactive session. Otherwise: `claude plugin marketplace add anthropics/claude-plugins-official` |

### Platforms

| Platform | Status | What degrades |
|---|---|---|
| Linux, WSL included | Supported, verified | Nothing. Lanes run when the option is on and `agy` is installed |
| macOS | Supported by design: Aether needs only Node.js 22 and git. Not verified on a Mac | Lanes stay off: they read `/proc` |
| Windows, native | Not verified, not claimed. Hooks run through Git Bash | Lanes stay off |

### Update, pin, roll back and uninstall

- **Update:** `claude plugin update aether@aether-plugin`, then start a new session. To update on its own, turn on auto-update for the `aether-plugin` marketplace in `/plugin` → Marketplaces.
- **Pin a release, or roll back:** in `~/.claude/settings.json`, give the marketplace's source a `ref`, a release tag:

      "extraKnownMarketplaces": {
        "aether-plugin": { "source": { "source": "github", "repo": "DarkArty07/aether-plugin", "ref": "aether--v0.7.0" } }
      }

  Edit that entry in place: after an install Claude Code adds `enabledPlugins` and the official marketplace to the same file, and replacing the file would drop them. Then start a session, which fetches that tag, and run `claude plugin update aether@aether-plugin`. Set the `ref` to a newer tag, or remove it, to move forward again.
  - **The session must have network traffic on.** In Aether's acceptance runs, a session started with `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` did not fetch a changed `ref`, and the same session without that variable did at once. The variable is the probable cause; the runs did not isolate it. If the update does not move the plugin, start one session with the variable unset and run `claude plugin update` again.
- **Never remove the marketplace to change versions:** removing it uninstalls Aether and deletes its data.
- **Uninstall:** `claude plugin uninstall aether@aether-plugin` also deletes Aether's data directory. Add `--keep-data` to keep it.

### Data

Aether keeps its data in `~/.claude/plugins/data/aether-aether-plugin/`. Set `AETHER_DATA_DIR` to use another directory.
- `usage/<session>/` holds the usage meter's files, kept for 30 days;
- `runs.jsonl` holds one record per finalized or abandoned run;
- the lane log is kept for 30 days;
- `sessions/` marks the Aether sessions, kept for 30 days.

The autonomy registry and run states live in the repository itself, under `.aether/autonomy/` in its main checkout.

### Upgrading from 0.6

Version 0.6 ran from `aether-mode`, a fish function that loaded a copy installed by `scripts/aether-install.js` under `~/.local/share/aether-plugin/installed/`. Both are gone from the repository, and your installed 0.6 copy keeps working until you remove it.

- **Installing from your clone's path works, but is not a release:** `claude plugin marketplace add <clone>` loads the working tree in place. Every edit or branch switch changes Aether at the next session, and a path cannot be pinned to a tag.
- **A pinned copy from your clone, with no push:** once the release is merged and tagged locally (`claude plugin tag plugins/aether`), add to `~/.claude/settings.json`:

      "extraKnownMarketplaces": {
        "aether-plugin": {
          "source": { "source": "git", "url": "file:///path/to/aether-plugin", "ref": "aether--v0.7.0" }
        }
      }

  Start a `claude` session with network traffic on (`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` unset), which clones it, then run:

      claude plugin install aether@aether-plugin --config lanes=true

  Move between releases by changing `ref`, as in "Update, pin, roll back and uninstall". Once the repository is pushed, the source may become `{ "source": "github", "repo": "DarkArty07/aether-plugin", "ref": "aether--v<version>" }`.
- **Meanwhile `aether-mode` keeps loading 0.6:** it passes `--plugin-dir`, which replaces the installed plugin for that session.
- **Your history stays in `~/.local/share/aether-plugin/`:** `runs.jsonl`, `usage/` and the lane log. Move them into `~/.claude/plugins/data/aether-aether-plugin/` to keep one history.
- **Removing the old copy is your call:** delete `~/.config/fish/functions/aether-mode.fish` and `~/.local/share/aether-plugin/installed/` when you no longer need them.
- **The advisor:** `aether-mode` turned it off for Aether sessions. If you configured an advisor, run `/advisor off`.

## Development

The plugin is `plugins/aether/`, and the repository's `.claude-plugin/marketplace.json` lists it. An installed release is a copy in Claude Code's plugin cache, so work in the repository never changes it until you update. To try a branch:

    claude --plugin-dir <worktree>/plugins/aether --agent aether:lead --effort xhigh

That loads the tree for one session, in place of the installed release. Its data goes to `~/.claude/plugins/data/aether-inline/`, and its options are set apart, under `pluginConfigs["aether@inline"]` in your settings. The bins of a branch run by path: `node <worktree>/plugins/aether/bin/aether-plan check <plan>`.

    npm test              # node --test "tests/*.test.js": bins, libraries, workflow scenarios and the fake model
    npm run test:mod      # claude plugin test plugins/aether: the mod (usage meter and ops)
    npm run validate      # claude plugin validate, on the plugin and on the marketplace
    npm run check         # all three

Node.js 22 with no dependencies. The workflow's tests run its script in a harness with stubbed agents, so they spend no tokens. `scripts/refresh-lanes.js` updates the lane table from Artificial Analysis; it reads `ARTIFICIAL_ANALYSIS_API_KEY`, or else the `.env` file its header comment names.

### Release

1. bump `"version"` in `plugins/aether/.claude-plugin/plugin.json`, the version that `tests/launcher.test.js` pins, and the `Version 0.x` status line of this README;
2. run `npm run check`;
3. merge to `main`;
4. in the main checkout, run `claude plugin tag plugins/aether`, which creates the tag `aether--v<version>`;
5. push `main` and the tag;
6. users update with `claude plugin update aether@aether-plugin`.

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
