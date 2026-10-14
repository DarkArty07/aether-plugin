# Aether Plugin

A plugin for Claude Code that adds an opt-in **Aether mode**: an accountable orchestrator, the Lead, that turns the owner's intent into a reviewed spec and plan, builds it with a parallel swarm of agents and with the other coding plans the owner pays for, and reports in one brief.

Aether serves five goals, **RADAR**:
- **Rápido** (fast): fast, cheap models do the bulk of the work, and nothing iterates without end;
- **Autónomo** (autonomous): the owner is not asked about trivial things, and every irreversible step reaches them in one list;
- **Delegación** (delegation): work goes to other coding harnesses (agy, Codex, Grok, Cursor) while their quota lasts;
- **Asequible** (affordable): each role runs on the cheapest model and effort that does it well;
- **Robusto** (robust): quality code, checked by tests, evidence and independent reviews.

The roles:
- **The Lead** is the main session, starting on Sonnet at `xhigh` (the owner may switch with `/model` or `/effort`), and the owner's right hand, not a messenger. It owns the outcome: a good design, a correct implementation and a correct deployment. It understands the intent, writes the spec, decides as the owner's delegate, chooses whether to do the work itself or hand it to the system, and tells the owner of better options, scope and costs. Its work shows in its briefs and reports.
- **The Writer** (`aether:writer`, Sonnet at `xhigh`) writes the plan and the tasks from the Lead's spec.
- **The Judge** (`aether:judge`, Opus at `high`, read-only) reviews the spec, the plan and the tasks, and rules `approve`, `revise` or `reject`. Sonnet writes; Opus decides.
- **The swarm:** when parallel work pays off, the Lead hands the plan to `/aether:run`. In the swarm:
  - implementers work on Haiku by default and move up to Sonnet or Opus when a task is critical or keeps failing;
  - a supervisor on Sonnet reviews every attempt, and grades each criterion from evidence;
  - approved units merge one at a time, and only a test failure that is new undoes a merge;
  - a unit that fails the same way again stops, and asks for a split;
  - a final review, on Opus or Sonnet by the run's risk, covers the whole run;
  - code deletes every unit worktree and branch as soon as it is no longer used.
- **Lanes** run the swarm's calls on other coding harnesses while their quota lasts: agy today, and Codex, Grok and Cursor once the owner turns each one on.

Specs, plans and tasks follow the layout of [GitHub Spec Kit](https://github.com/github/spec-kit), `specs/NNN-<topic>/`, through an Aether preset shipped in the plugin. Spec Kit's own CLI is not required, and neither is superpowers. Plain `claude` stays normal mode. Aether Plugin is the successor to [Aether Agents](https://github.com/DarkArty07/Aether-Agents): the same method, rebuilt on a harness made for software.

## Status

Version 0.9.1: the gaps that 0.8.0 left open in issues 002 to 005 ([decisions](docs/decisions.md) A44–A47). What changed since 0.9:
- **Salvage before a retry.** An implementer that ends without its report no longer costs a blind retry: `aether-wt salvage` commits what the task owns that it left uncommitted, and the supervisor reviews that work.
- **Hand-integrated units are recorded.** `aether-wt adopt <run> <task> --commit <sha> --reason <text>` makes the report count a unit the Lead integrated by hand as `adopted`, not blocked.
- **A brief carries the spec's intent and criteria,** and `aether-plan check` warns about a task that owns more than 6 paths, or the whole tree.
- **The `ops` option** turns the mod's answers to the workflow's ops commands off, for a project whose tests need the shell's environment.
- **Clearer failures.** A merge asked of the model path carries the long Bash timeout, an ops reply that is not the command's output names a refusal as the likely cause, and a reviewer that gives no answer is reported as incomplete with its reason.

Version 0.9: the design seats ([spec](specs/001-design-seats/spec.md)). What changed since 0.8:
- **Design seats.** The Judge, the Writer and a new Examiner can each be taken by a stronger model of another harness, such as Gemini 4 Argon on agy, round by round, with Aether's own agent as the fallback. The `seats` option chooses who: `native`, `balanced` (the default) or `robust`. This is superdelegation upward: RADAR's Delegación now counts the seats as well as the volume.
- **The Examiner.** It writes acceptance tests from the spec and the plan's public interfaces, which the swarm never sees, and `aether-exam` runs them at the end of a run. A failing test is a blocking finding.
- **Whoever writes a document does not judge it.** A seat never takes the model that wrote what it reviews.
- **Measured before it is trusted.** A harness compares each external seat with its native agent; the Judge's part runs on seeded defects and scores them without a model. It has not run with real models yet.
- **Fable stays out** until Fable 5.5: Opus 5.5 does this work for less than half the price.

Version 0.8 brought RADAR ([roadmap](docs/roadmap/2026-10-10-radar.md)). What changed from 0.7:
- **The Lead is the accountable orchestrator.** It writes the spec; the Writer, on Sonnet, writes the plan and the tasks; the Judge, on Opus, reviews them. The Writer and the Judge replace the Designer, the most expensive link of 0.7.
- **Spec Kit replaces superpowers.** Specs, plans and tasks live in `specs/NNN-<topic>/`, with the Aether preset, and superpowers is no longer a dependency.
- **One list for the owner.** Irreversible actions, and the choices only the owner can make, reach the owner as one list at the top of every brief («Espera tu sí»). aether-guard records every irreversible Bash command that no grant covers in that list.
- **Fewer wasted rounds.** A merge is blocked only by a test that fails and did not fail before the run. A unit stops when the same failure repeats. The final review follows the run's risk. Reviews grade each criterion from evidence, and flag added lines that look unfinished.
- **Delegation.** Lanes can run on Codex, Grok and Cursor besides agy, each turned on by the owner, with the owner's credentials kept out of their environment.
- **RADAR in the report.** `aether-report` gives a figure for each goal, and the lanes by harness.

Version 0.7 made the Lead decide as the owner's delegate and work for hours within ceilings of time and cost ([autonomy spec](docs/superpowers/specs/2026-10-09-lead-autonomy-design.md)), and made Aether install with Claude Code's own plugin commands and start with `claude --agent aether:lead --effort xhigh`; plain `claude` stays normal mode ([installable plugin spec](docs/superpowers/specs/2026-10-09-installable-plugin-design.md)).

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

The first design is [docs/superpowers/specs/2026-10-07-aether-plugin-design.md](docs/superpowers/specs/2026-10-07-aether-plugin-design.md); the [RADAR roadmap](docs/roadmap/2026-10-10-radar.md) is the current direction.

## How it works

**The three paths.** The Lead takes one of three paths for each piece of work, and chooses the model of every delegate task for quality, cost and speed:
- **Direct:** a very bounded change, about five tool calls and no edit-test-fix loop. The Lead does it inline, on the model it runs on.
- **Delegate task:** bounded work that is still a real task, such as an edit-test-fix loop, a cleanup, a research sweep, or each task of a plan of one or two tasks. One subagent in the background, with a self-contained brief, on the model and effort the Lead names for it and says why. It is never inherited from the session.
- **Swarm:** long, costly or complex work: an approved plan of three or more tasks, or with a task of Tier opus. `/aether:run`, with each task on its Tier.

```text
owner ── states the intent, may give permission to work for hours, answers one list, reviews the brief
  │
Lead (main session, starts on Sonnet, xhigh): the intent, the spec, the route and the path (direct, delegate task, swarm), decisions as the owner's delegate, the outcome
  │  specs/NNN-<topic>/spec.md
  ▼
Writer (aether:writer, Sonnet, xhigh) ⇄ Judge (aether:judge, Opus, high, read-only)
  │  each seat native or, by the seats option, on a stronger model of another harness (aether-lane seat)
  │  plan.md and tasks.md, with Aether fields: tier and effort, area, owned files, dependencies
  │  aether-plan check / compile (and the run's test baseline)
  │  Examiner (aether:examiner, Opus, high): the hidden exam, kept outside the repository (aether-exam store)
  ▼
/aether:run (dynamic workflow)
  ├─ wave 1: units in parallel, each in its own git worktree, native or on a lane
  │    implementer (haiku → sonnet → opus) ⇄ supervisor (sonnet): approve, retry, escalate or block
  │    the same findings three times, or two attempts without a report, stop the unit
  ├─ merges, one at a time; only a test failure outside the baseline undoes one
  ├─ wave 2 …
  ├─ final review of everything merged (opus or sonnet, by the run's risk)
  └─ cleanup: no unit worktree or aether/* branch is left behind
  │
aether-exam run: the hidden exam on the integration branch; a failing test is a blocking finding
  │
aether-report: speed, cost (OpenRouter prices), quality, lanes by harness, and the RADAR figures
aether-report finalize: a record in runs.jsonl, and the run's directory deleted
```

| Piece | What it does |
|---|---|
| `using-aether` skill | Injected at session start. The Lead's rules: its role, RADAR, the method on Spec Kit's layout, writing with the Writer and judging with the Judge, the design seats and the exam, assumptions, the owner's list, the three paths (direct, delegate task, swarm) and the choice of model for each delegate task, fallbacks, autonomous runs and the execution method |
| `aether:writer` | The Writer agent: Sonnet at `xhigh`. It writes `plan.md` and `tasks.md` from the Lead's spec, with the Aether fields, and checks them with `aether-plan check` |
| `aether:judge` | The Judge agent: Opus at `high`, read-only. It reviews a spec, a plan or tasks, and rules `approve`, `revise` or `reject`, with at most ten findings |
| `aether:examiner` | The Examiner agent: Opus at `high`. It writes the hidden acceptance exam of an approved spec and plan under `.aether-exam/`, one command per test, without reading `tasks.md` |
| `aether-lane seat` | One round of a design seat (`judge`, `writer` or `examiner`) on the external model the `seats` option puts first, in a disposable worktree of the commit; exit 3 or 4 hands the round to the native agent |
| `aether-exam` | Keeps an exam outside the repository (`store`), runs it on a commit in a disposable worktree (`run`), and lists the kept ones (`list`) |
| Aether preset | `plugins/aether/speckit/`: Spec Kit's specify, plan, tasks and constitution commands adapted to Aether, also shipped as the skills `aether:specify`, `aether:plan`, `aether:tasks` and `aether:constitution` |
| `aether-voice` | Prints the owner's own words from a session, so a quote can be checked; it writes no file |
| `aether-guard` | A PreToolUse hook. In an Aether session it refuses Write, Edit, MultiEdit and NotebookEdit on specs, plans and tasks (`specs/NNN-<topic>/`, and the old `docs/superpowers/`) and on the constitution to every agent but the Lead and the Writer, on the autonomy registry and run states to every agent, and on everything outside `.aether-exam/` to the Examiner. Before Bash, it records an irreversible command that no grant covers in the owner's list, `.aether/pending.jsonl`, and refuses it when `AETHER_IRREVERSIBLE=enforce`. In any other session it allows everything |
| `aether-autonomy` | The owner's standing authorizations, verified against their own words (`grant`, `revoke`, `check`, `list`), and an autonomous run's state and ceilings (`start`, `spend`, `status`, `end`) |
| `swarm` skill | The Lead's procedure: compile, launch, read the result, report, relaunch, finalize |
| `aether-plan` | Checks a plan and compiles it into briefs and a dependency graph of waves, and records the run's test baseline. It reads a Spec Kit `tasks.md`, and the `spec.md` beside it. It refuses chain-shaped plans, and waves whose tasks own overlapping files |
| `aether-wt` | Unit worktrees and branches: `ensure`, `diff`, `merge` (ownership check, then the tests; undone if they fail), `salvage` (commits what a unit that ended without its report left, and writes its package), `adopt` (records a unit the Lead integrated by hand), `remove` (saves unmerged work as a patch), `sweep` |
| `/aether:run` | The workflow: waves, the escalation ladder, the agent budget, the merge queue, the final review, and cleanup in `finally` |
| Agents | `implementer`, `supervisor`, `reviewer` (adapted from superpowers' templates, MIT) and `ops` |
| Usage meter and ops | A mod that records every model request of an Aether session: agent, model, tokens and time. It also runs the workflow's own `aether-wt` and `aether-lane` commands itself, without a model (see below). In any other session it records and runs nothing, and does not offer Aether's agents |
| `aether-report` | Reports a run's speed, cost and quality; `finalize` records the run; `--seats` counts the design seats' rounds and who answered them; `price` prices any `claude -p` JSON output |
| SessionStart hook | In an Aether session: marks the session, passes the lanes and seats options to its commands, injects the bootstrap, sweeps runs left untouched for 24 hours, deletes usage files not written to for 30 days, and points a new Lead to an open autonomous run. In any other session it does nothing |

**Ops without a model.** The workflow has no shell, so it hands each of its own `aether-wt` and `aether-lane` commands (`merge`, `remove`, `diff --final`, `sweep` and the lane commands) to an `ops` agent. In an Aether session the mod answers that agent itself, with no model request:
- it checks the prompt against the closed list of commands the workflow sends (`hooks/ops-command.mjs`);
- it runs the command with `node` and `$.process.run`, with no shell;
- it returns the command's exit code and output.

With the `ops` option off, none of this happens: every ops agent runs on the model path. Any workflow in an Aether session gets that answer, for any repository and run its prompt names. Anything else falls back to the Haiku `ops` agent, as before: another prompt, a refused `$.process.run`, a command it cannot start, or a bin that fails to load. A command that ran and gave no result, stopped at the timeout or killed, is reported as an error and never handed to the model. Implementers still run `aether-wt ensure` and `diff` with their own Bash tool. What changes for these commands:
- **Permissions.** The session's permission rules and mode, and Bash `PreToolUse` hooks, no longer apply to them. What bounds them is the closed list and the Aether session's mark.
- **Environment.** They run in Claude Code's own environment, and so does what they start: the plan's test command, inside a merge, and agy. Exports from `CLAUDE_ENV_FILE` and `PATH` entries only your shell profile adds do not reach them. Make the test command work without them. `aether-lane status` also looks for agy on that `PATH`; if it is not there, the run's lanes stay dry and every call runs native.
- **The 10-minute limit.** A merge whose tests outlast 10 minutes is stopped after its merge commit and before its revert, and the error says so.
- **The capability.** The mod now calls `$.process.run`, and `claude plugin validate` lists it. If your organization's policy refuses that call, the agent path runs. A policy that refuses the whole mod also turns off the usage meter, lanes (the mod saves their prompts), and the hiding of Aether's agents in other sessions.

See [decision A30](docs/decisions.md).

### Lanes

A lane runs Aether's own calls on another coding plan the owner pays for, while that plan's quota lasts. agy, the Antigravity CLI, was the first; Codex, Grok and Cursor have adapters too. See the [lanes spec](docs/superpowers/specs/2026-10-08-lanes-design.md) and phase 2b of the [RADAR roadmap](docs/roadmap/2026-10-10-radar.md).

- **Which harnesses.** The plugin's `harnesses` option lists the harnesses lanes may use; the default is `agy`. Every one whose CLI is installed and whose table entry has a model for the call's native model and role is a candidate for that call. `aether-plan compile` records the candidates of each role and native model.
- **The order.** The quota decides among the candidates of one call, never the level: they serve the same role and replace the same native model, and a test checks the table against the models index (`plugins/aether/config/models/models.json`: current, offered by the harness, with a profile). The candidates go in this order: first the groups with a reading, the highest priority first; in a tie, the nearer reset, then the order of `harnesses`; then the groups with no reading, in the order of `harnesses`. A group under the reserve, or with a dry mark, is left out. The priority of a group is the share left of its longest window (the weekly one) divided by the hours to its reset, at least one hour: the quota most at risk of being lost goes first, and the shares of different plans compare equal. The workflow walks the order for each call: the first candidate whose pool has room takes it; if its start is unavailable, for any reason, the next is tried; the call runs native, at its own level, only when none is left.
- **Who takes a call.** `plugins/aether/config/lanes.json` names the external models of each harness. For agy: Gemini 3.8 Flash for Haiku implementers, and agy's own Sonnet 5.5 and Opus 5.5 for the rest. agy's `high` runs Claude's `high` and `xhigh`; calls at `max`, and `ops`, are always native. For Grok: `grok-4.7` for Haiku implementers (checked against grok 1.0.41 on 2026-10-13; `grok-4.7-build-fast` is the same model faster and at twice the price, so it is not a lane). Codex and Cursor have entries without models: their model ids depend on your account and the CLI's version, so you add them once you have checked them (below).
- **Quota.** A group is used while every window of it, such as agy's 5 hours and weekly, stays above a 5% reserve (`reserve` in the table) and no dry mark holds it. A call that ends for quota, or a start that finds the group dry, leaves a dry mark in the plugin's data directory, so it outlives the wave and the run: until the group's reset when a reading with a balance shows the group under the reserve, and otherwise for 60 minutes (`dryMarkMinutes`), renewed if the next call in the group ends for quota again. A reading that launches a process, agy's, is kept for its life (`quotaLifeMinutes`: 10 minutes) and served to the starts and to `status`, so they launch none inside it; a finished agy call and `aether-lane quota` take a fresh reading, which renews the kept one. Grok's reading is not kept: its 30 minutes (`quotaLifeMinutes`) are the age after which its log line is stale and a wave refreshes it. Grok's weekly share stays valid until its week ends. Codex and Cursor report no quota, nor does Grok without a reading: each is tried after the groups that have one, until a call fails for quota.
- **Fallback.** When a harness is missing, out of quota or fails to start, the same call goes to the next candidate, and to Aether's own agent when none is left, without spending the ladder. A lane that fails after it started goes to the native agent. `aether-plan compile` names each enabled harness that takes no call, and why.
- **Containment.** A lane works without permission prompts in the unit's worktree: agy with `--dangerously-skip-permissions`, Codex in its `workspace-write` sandbox, Grok with `--always-approve`, Cursor with `--force`. Git checks catch changes outside the task's Owns, to the integration worktree and branch, and from read-only roles. The lane's environment drops variables named like tokens, keys and secrets, points `gh`, `npm`, `docker`, `gcloud`, `aws` and `kubectl` away from your credentials, and sets git's `protocol.allow` to `never`, so a plain git command in the lane cannot reach a remote. Your home directory stays, because each CLI keeps its own login there. So this prevents accidents, not an agent that overrides these settings or goes looking for your files. Nothing undoes a network action, so you turn on each harness yourself.
- **Report.** `aether-report` shows, per group, its calls, the quota consumed, the share left of each window at the start and at the end of the run and the next reset; the dollars at list price, apart from native Claude; each harness's calls; and what every lane call chose (`lanes.run.choices`: the candidates in order with their priority, the lane that took the call or none, and why). The same choices are in the lane log, one entry per call. `aether-lane status <run>` gives, per group, what `aether-lane quota` does plus its dry mark, and, per role and native model, the order of the candidates.
- **Off for one run:** `aether-plan compile <plan.md> --no-lanes`.
- **Off by default.** Lanes run only when the plugin's `lanes` option is on (see Options).
- **Linux only.** Lanes need Linux, because stopping a lane's processes reads `/proc`.

**Reading the quota.** `aether-lane quota [<harness>...] [--refresh] [--json]` needs no run. For each harness, by default the installed ones, it prints each group's windows: the share left, the reset in UTC and local time, the hours left, the priority, whether the group is usable above the reserve and with no dry mark, and where the reading came from and how old it is. agy's reading is its `/usage`. **Grok's quota is read over ACP**: grok answers the request `_x.ai/billing` on `grok agent stdio` with the config its UI logs as `billing: fetched credits config` (about a second, no UI, no session and no model call), and the request also leaves that line in `~/.grok/logs/unified.jsonl`, where `status` and `start` read it; they call it stale after 30 minutes. `aether-lane quota --refresh`, and `aether-lane status <run> --refresh`, the quota step of each wave in the workflow, ask grok over ACP (10 seconds at most); if that gives no answer, an error or no config, the fallback opens grok's UI for a few seconds (20 at most) in an empty temporary directory, with no prompt, and removes the session folder grok made for that directory, and no other. A `status` run by hand does not refresh. A line without `creditUsagePercent` is read as 0% used, and says so wherever it is shown (spec 002, A3). Aether never refreshes inside a lane call.

**Adding a harness.** A harness is an adapter, `plugins/aether/lib/harness/<name>.js`, and an entry in the table, and its name goes in `HARNESS_NAMES` and `FACTORY` of `plugins/aether/lib/harness/index.js`, or the `harnesses` option drops it; the order rule does not change. The adapter's `quota()` gives, per group, its windows (`remaining` from 0 to 1 and `resetsAt`) or `unknown` when it cannot read them, which puts the harness after the groups with a reading. An adapter whose reading launches a process sets `quotaCost: 'process'`, and Aether keeps the reading for `quotaLifeMinutes`.

**Turning on Codex, Grok or Cursor.** Their adapters follow Spec Kit's command lines. Grok's was checked with real headless calls on 2026-10-13 (its JSON fields, `--reasoning-effort`, `--json-schema`); Codex's and Cursor's have run no real call yet. For each one:
1. find its models in the CLI's own list, and make one real headless call per role with the command line of its adapter (`plugins/aether/lib/harness/<name>.js`); correct the adapter's field names if the CLI's JSON differs;
2. copy `plugins/aether/config/lanes.json`, add the models to the harness's entry, each with `group`, `replaces`, `roles` and `levels` like agy's, and set `AETHER_LANES_CONFIG` to the copy in the shell that starts Claude Code. Codex and Grok take the level as their reasoning effort; Cursor ignores it for now;
3. add the harness to the `harnesses` option, such as `agy,codex`.

### Design seats

The Judge, the Writer and the Examiner are seats. Each can be taken, one round at a time, by a stronger model of another harness the owner pays for, in place of Aether's own agent. See [spec 001](specs/001-design-seats/spec.md) and decisions A39–A43.

| `seats` | Judge | Writer | Examiner |
|---|---|---|---|
| `native` | Opus, native | Sonnet, native | off |
| `balanced` (default) | Gemini 4 Argon on agy, then Opus | Sonnet, native | Argon on agy, then Opus |
| `robust` | Opus, native | Argon on agy, then Sonnet | Opus, native |

- **What changes.** Only the design. The swarm's models and efforts still follow each task's Tier and Review, the ladder and the run's risk; the Writer, whoever takes its seat, writes those lines with the same rules.
- **Who takes a seat.** The first model on the seat's list whose harness is enabled (`lanes` on, and the harness in `harnesses`), installed and with quota left, and that is not the model that wrote what the round reviews. Otherwise the native agent. The lists are `designSeats` in `plugins/aether/config/lanes.json`; change them in your copy, with `AETHER_LANES_CONFIG`.
- **A round.** `aether-lane seat` runs it in a disposable worktree of the commit, with the lanes' environment. Git decides what it may change: the Judge nothing, the Writer `plan.md` and `tasks.md`, the Examiner `.aether-exam/`. Its answer must match the seat's schema, and an external Writer's tasks must pass `aether-plan check`. Anything else undoes the round, keeps a breaking one at `refs/aether/seat/<id>/round-1`, and the native agent does the same round from the files. That never reaches the owner.
- **The exam.** The Examiner writes it after the plan is approved, from the spec and the plan's public interfaces, never from `tasks.md`. `aether-exam` keeps it in the plugin's data directory, out of the repository and the swarm's worktrees, and runs it on the integration branch at the end. A test that fails runs once more; a failing test is a blocking finding, a flaky one a minor finding. No hook guards reads of the exam, so its protection is against accidents, not against an agent that goes looking for it.
- **Argon.** Gemini 4 Argon became generally available on 2026-10-13. On agy it needs Google AI Ultra. Its agy name (`gemini-4-argon` plus the level) and its quota group are not verified yet: a wrong one fails the round in seconds, and the native agent takes it. To put Argon on the swarm's final review too, add `"reviewer"` to its `roles` and `"replaces": "opus"`, listed before agy's Opus.
- **Measured before it is trusted.** [`docs/evaluations/seats/`](docs/evaluations/seats/README.md) compares each external seat with its native agent. Its Judge part gives both the same documents with seeded defects and scores them without a model. Until it runs, `balanced` trusts Argon as Judge on the owner's rule: if quality drops, the seat goes back to Opus.
- **Fable** stays out until Fable 5.5 (A43).

### Autonomy

The Lead decides as the owner's delegate, and the owner's reviews are two: the permission to work at the start, and the brief at the end. See the [autonomy spec](docs/superpowers/specs/2026-10-09-lead-autonomy-design.md).

- **Deciding.** The Lead closes what the owner's intent covers, and rules on the Judge's findings within it. Only what the intent does not cover, what conflicts with it, and irreversible actions that no grant covers reach the owner, as one list at the top of the brief («Espera tu sí»). Failures with a defined fallback, such as a lane out of quota, never do.
- **Standing authorizations.** When the owner authorizes a class of irreversible action in general words, the Lead records it with `aether-autonomy grant`, quoting the owner. The quote is checked against the owner's own messages in the session's transcript, and checked again when read. The classes are `merge-main`, `push`, `publish`, `deploy`, `delete`, `credentials` and `paid-call`. Everything local and reversible proceeds without asking.
- **Irreversible commands.** In an Aether session, aether-guard reads every Bash command, the agents' included. A push, a `gh pr merge`, a publish, a deploy, a forced delete or a credentials command that no grant covers is appended to `.aether/pending.jsonl`, the owner's list, with secrets in its arguments redacted. A local `git merge` is not recorded: git undoes it, and the push that would publish it is recorded. By default it only records them, while the guard is being proven; with `AETHER_IRREVERSIBLE=enforce` in the shell that starts Claude Code, it also refuses them.
- **Autonomous runs.** The owner's permission to work for hours starts a run (`aether-autonomy start`), with ceilings of 8 hours and US$ 50 unless the owner names others. The Lead keeps a diary, keeps working while work remains, stops when done, at a ceiling or honestly, and writes a brief: what it did, decided and found, what waits for the owner's yes, what it did not finish, proposals, and time and cost.
- **Cost.** A run's figure covers the swarm and the lanes, as `aether-report` prices them; the Lead's own turns are not added up. The time ceiling is the real guard.
- **Permissions.** A permission prompt stops a run like a question. Start a session meant for an autonomous run with a permission mode or allow rules that cover its tools. The plugin never turns permissions off; `scripts/aether-lead` starts the session with them bypassed, and with irreversible commands refused (see Start). The exception is the workflow's own `aether-wt` and `aether-lane` commands, which the mod runs without the session's permission rules (see Ops without a model).
- **Files.** `.aether/autonomy/` in the repository's main checkout holds `grants.json`, and for each run `run.json`, `diary.md` and `brief.md`. Only `aether-autonomy` writes `grants.json` and `run.json`.

## Use Aether mode

### Requirements

- Claude Code 2.1.294 or later;
- Node.js 22;
- git 2.36 or later;
- for lanes, the CLI of each harness you turn on: `agy`, `codex`, `grok` or `cursor-agent`.

### Install

    claude plugin install aether --marketplace DarkArty07/aether-plugin

Add `--config lanes=true` to turn the lanes on (see Options). In a session, `/plugin install aether --marketplace DarkArty07/aether-plugin` does the same and lets you choose the scope.

Aether 0.8 no longer needs superpowers. If you keep it for other work, it still enters every session where it is enabled and asks for its own skills, so turn it off for an Aether session:

    claude --agent aether:lead --effort xhigh --settings '{"enabledPlugins":{"superpowers@claude-plugins-official":false}}'

`scripts/aether-lead` runs that command for you, with permissions bypassed (see Start).

### Start

Aether mode is chosen per session:

    claude --agent aether:lead --effort xhigh

The Lead is the agent `aether:lead`, which starts on Sonnet; the owner may switch with `/model`. `--effort xhigh` sets its effort, because a plugin cannot. The command is the same in every shell.

To type less, `scripts/aether-lead` in a clone of this repository runs the command of Install, with superpowers turned off for the session, and passes on every argument. It also starts the session with `--permission-mode bypassPermissions`, so neither the Lead nor the swarm's agents stop at a permission prompt. With no prompts, aether-guard is the only check left on a push, a merge to `main` or a forced delete, so the launcher sets `AETHER_IRREVERSIBLE=enforce`: the guard refuses an irreversible command that no grant covers, instead of only recording it. A value already set in your shell is kept, so `AETHER_IRREVERSIBLE=log aether-lead` only records them. For a session that asks before each tool call, run the command of Install instead. The launcher is one `exec claude` after that default, with no setup of its own, so it is the same in bash, fish and zsh. Link it once, under any name on your `PATH`:

    ln -s "$PWD/scripts/aether-lead" ~/.local/bin/aether-lead

Then `aether-lead` starts Aether mode, `aether-lead --resume` resumes a session and `aether-lead -p "<task>"` runs one task. Without a clone, a shell alias of the same command does the same.

To make Aether mode the default in one repository, put this in its `.claude/settings.local.json`:

    { "agent": "aether:lead", "effortLevel": "xhigh" }

Plain `claude` then starts Aether mode there, and `claude --agent claude` starts normal mode, with the repository's `effortLevel`.

Plain `claude` stays normal mode: the plugin is dormant there. Its hooks do nothing, its usage meter records nothing, and its agents are not offered.

Then tell the Lead what you want. It writes back its understanding, writes the spec, has the Writer write the plan and the tasks and the Judge review them, and stops at the plan with a short brief that opens with what waits for your yes and recommends how to build it: itself, a delegate task on a model it names, or the swarm. Give it permission to work for hours, and it runs to the end, chooses the method itself, and gives you the brief. The swarm needs:
- **a plan with Aether fields** on every task:

      **Aether:**
      - Tier: haiku high — exact tests and interfaces pin the task down
      - Area: backend
      - Owns: `src/api/**`, `tests/api.test.js`
      - Depends on: none

- **an `## Aether Execution` section**, holding the test command, the ladder and the agent budget;
- **a separate integration worktree on a feature branch.** The Lead creates it with `git worktree add <path> -b <branch>`;
- **permissions that let the agents run `git`, `aether-wt` and the tests**, and edit files under `.aether/worktrees/`, without asking each time.

### What Aether adds to a normal session

Measured on Claude Code 2.1.296 with Aether 0.7.0, in a session started without `--agent aether:lead`, against the same session with Aether disabled:
- the first request grows by 431 characters, all in the first message: the `aether:run` and `aether:swarm` entries of the skills list;
- the system prompt and the tools are unchanged;
- `claude plugin details` estimates about 100 tokens always on;
- the eight commands of `bin/` are on the Bash tool's `PATH`;
- each session start, and each `Write`, `Edit`, `MultiEdit` or `NotebookEdit` call, runs one short `node` process that finds no Aether session and exits.

Nothing is injected, refused, recorded or written. Version 0.8, not yet measured this way, adds two things: the entries of the four preset skills (`aether:specify`, `aether:plan`, `aether:tasks` and `aether:constitution`) in the skills list, whose descriptions are 459 characters; and the same short `node` process before each `Bash` call.

### Options

- `lanes`, off by default, runs Aether's calls on other coding harnesses while their quota lasts. They work without permission prompts and spend another plan's quota, so you turn it on yourself. Lanes run only on Linux.
- `harnesses`, `agy` by default, lists the harnesses lanes may use, comma-separated: `agy`, `codex`, `grok`, `cursor`. The quota decides the order of the candidates; the order of this option breaks ties between equal priorities and orders the groups with no reading. Add one only once its models are in the lane table (see Lanes).
- `ops`, on by default, lets the mod run the swarm's own `aether-wt` and `aether-lane` commands without a model (see Ops without a model). Turn it off when your project's test command needs your shell's environment: the Haiku `ops` agent then runs them with the Bash tool, as before 0.8.
- `seats`, `balanced` by default, chooses who takes the design seats: `native`, `balanced` or `robust` (see Design seats). An external model takes a seat only with `lanes` on.

Set them at install with `--config lanes=true`, or later in `/plugin` → Installed → aether → Configure options. `claude plugin configure aether@aether-plugin` shows the options and which are unset.

### What you set yourself

A plugin cannot set these, so you do:

| Need | Step |
|---|---|
| The Lead at `xhigh` | `--effort xhigh` in the start command, or `effortLevel` in the repository's settings |
| Dynamic workflows, for the swarm | Nothing on most paid plans. On Pro, turn on Dynamic workflows in `/config` once |
| No advisor in Aether mode (each call rereads the whole conversation, uncached) | Nothing unless you configured one. If you did, run `/advisor off` |
| Permissions for the swarm | Allow rules for `git`, `aether-wt`, `aether-lane` and the test command, and edits under `.aether/worktrees/`; `scripts/aether-lead` bypasses permissions instead |
| superpowers off in Aether sessions, if you keep it for other work | `--settings '{"enabledPlugins":{"superpowers@claude-plugins-official":false}}'` in the start command |
| Irreversible commands refused, not only recorded | `AETHER_IRREVERSIBLE=enforce` in the shell that starts Claude Code; `scripts/aether-lead` sets it |
| Lanes on Codex, Grok or Cursor | Their models in your copy of the lane table, `AETHER_LANES_CONFIG`, and the `harnesses` option (see Lanes) |
| Gemini 4 Argon in the design seats | Google AI Ultra on agy, and `lanes` on (see Design seats) |

### Platforms

| Platform | Status | What degrades |
|---|---|---|
| Linux, WSL included | Supported, verified | Nothing. Lanes run when the option is on and a harness's CLI is installed |
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

The autonomy registry and run states live in the repository itself, under `.aether/autonomy/` in its main checkout, and so does the owner's list of irreversible commands, `.aether/pending.jsonl`.

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

That loads the tree for one session, in place of the installed release; with the launcher it is `aether-lead --plugin-dir <worktree>/plugins/aether`. Its data goes to `~/.claude/plugins/data/aether-inline/`, and its options are set apart, under `pluginConfigs["aether@inline"]` in your settings. The bins of a branch run by path: `node <worktree>/plugins/aether/bin/aether-plan check <plan>`.

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

- [RADAR roadmap](docs/roadmap/2026-10-10-radar.md): the five goals, the owner's list, and the phases of version 0.8.
- [Design spec](docs/superpowers/specs/2026-10-07-aether-plugin-design.md): components, the swarm executor, routing, cleanup and measurement.
- [Specs](docs/superpowers/specs/) and [plans](docs/superpowers/plans/) up to 0.7, written with superpowers: Plan 1 (foundation), Plan 2 (swarm) and Plan 3 (measurement and trial), each with its review and execution record, and the later specs. New work goes to `specs/NNN-<topic>/`.
- [Evaluations](docs/evaluations/): the trials against normal mode, with their fixtures, harnesses and results. Trial 2 keeps both builds, playable.
- [Claude Code research](docs/claude-code-research.md): the verified capabilities and limits this design relies on, and the prices.
- [Decisions](docs/decisions.md): D1–D15 from the first design session, with their updates, and A1–A43 from the specs and the RADAR roadmap.
- [Spec 001, design seats](specs/001-design-seats/spec.md), with its [plan](specs/001-design-seats/plan.md), and its [evaluation](docs/evaluations/seats/README.md).
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
5. **Sonnet writes, Opus decides, and a stronger model may take either seat.** The expensive model judges the spec, the plan and the work; the cheaper ones write them. Whoever writes a document never judges it.
6. **One list for the owner.** What is irreversible, and what only the owner can choose, waits for the owner's yes in one list. Everything else proceeds, and every failure with a fallback is handled without asking.
7. **RADAR.** Every change is weighed against the five goals: fast, autonomous, delegated, affordable and robust.

## Roadmap

**Now:** version 0.9 adds the design seats. What it leaves for the owner: the first real round of Argon on agy, which checks its name and quota group, and the seats' measurement ([evaluation](docs/evaluations/seats/README.md)).

The [RADAR roadmap](docs/roadmap/2026-10-10-radar.md): version 0.8 builds its phases 1, 2a and 2b. What remains waits for the owner: a real call per harness and role on Codex, Grok and Cursor, and turning each one on; a measured design session with the Writer and the Judge against the 0.7 Designer; and a rerun of trial 2 in Aether mode with [its techniques](docs/evaluations/2026-10-08-trial-2.md#next-better-results-at-the-same-time-and-cost).

**Effort.** Since version 0.3.0, each plan task sets its implementer's effort on its Tier line, by the task's complexity ([spec](docs/superpowers/specs/2026-10-08-effort-per-task-design.md)).
- The default is `xhigh` on every model. The Writer lowers it where the tests pin the work, and names `max` only with a reason.
- A failed attempt runs again at `xhigh`, then moves up the ladder.
- The supervisor reviews at `high`, and a task's Review line can raise it.
- `aether-report` shows the cost and the time of each role, model and effort. `scripts/check-effort.js` checks, from a session's transcripts, that each agent ran at the effort its call asked for.

These are deferred until the trials justify them:
- a second opinion from another provider on high-risk documents, and a rescue seat for a stopped unit;
- hiding the preset skills in normal sessions;
- notifications;
- several parallel attempts on critical units;
- marketplace publishing.

## License

Aether Plugin is open source under the [MIT License](LICENSE). The implementer, supervisor and reviewer agents adapt prompt templates of [superpowers](https://github.com/obra/superpowers), the Aether preset adapts [GitHub Spec Kit](https://github.com/github/spec-kit)'s templates, and several pieces port ideas from [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode), all under the MIT License; [`plugins/aether/NOTICE`](plugins/aether/NOTICE) has the details. The plugin directory carries its own copy of the license.
