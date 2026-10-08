# Aether: design spec (v0.1)

- **Date:** 2026-10-07
- **Status:** Approved by the owner on 2026-10-07. Amended the same day (A10), and on 2026-10-08 by Plan 2 (§7, §8, §9 and §11) and Plan 3 (§3, §4, §5, §9, §10 and §12).
- **Method:** superpowers brainstorming (architectural path). After approval, Phase 0 checks (§13), then superpowers `writing-plans`.
- **Background:** [README](../../../README.md), [Aether retrospective](../../aether-retrospective.md), [Claude Code research](../../claude-code-research.md), [Decisions](../../decisions.md)

## 1. Summary

Aether is a Claude Code plugin that adds an opt-in **Aether mode** on top of superpowers. The main session, the Designer, runs on Opus and designs with superpowers. When it pays off, the Designer hands an approved plan to a parallel swarm:

- implementers run on Haiku 5.5 by default, and move up to Sonnet or Opus when a task is critical or fails review;
- a supervisor on Sonnet reviews each attempt independently and rules on it;
- a serialized queue merges approved units;
- code deletes each unit's worktree as soon as the unit is done.

Without the plugin, the owner works in normal mode with superpowers alone.

The goal is quality, cost and speed together. Success is measured against normal mode on the same objective (§10, §13).

## 2. Decisions

Taken by the owner on 2026-10-07.

| ID | Decision |
|---|---|
| A1 | Project name **Aether Plugin**. Plugin id `aether`. Folder and future repository slug `aether-plugin`. The name leaves out "Claude Code", following Anthropic's branding guidelines and D15; descriptions may say "a plugin for Claude Code". |
| A2 | superpowers is the base, and the authority on engineering practice and on owner approval gates. Aether adds only the multi-agent organization that superpowers does not cover. When the two conflict, superpowers wins, with two exceptions. First, Aether implements units in parallel, because per-unit worktrees and disjoint file ownership remove the conflict that superpowers guards against. Second, swarm plans leave out the implementation code (A10). |
| A3 | ECC is out for now. |
| A4 | Roles, top down: owner; Designer (main session, Opus, final authority among agents); supervisors (Sonnet); implementers (Haiku by default, Sonnet or Opus when escalated); reviewers (Sonnet, and Opus for the final review). Plugin code enforces whatever must always happen the same way. |
| A5 | The Designer may implement, review and fix work itself. Handing work to the swarm is a quality, cost and speed decision, not a rule. superpowers' paths (spike, bounded, architectural) and its approval gates apply unchanged: bounded work still gets a short in-chat design and the owner's yes. |
| A6 | Cost is judged at API list prices from OpenRouter, even though the owner uses a subscription. |
| A7 | Hard requirement: unit worktrees, unit branches and temporary files are deleted as soon as they stop being used. Code enforces this. |
| A8 | Aether mode is chosen per session by loading the plugin with `claude --plugin-dir`, through an `aether-mode` shell function (not `aether`, which is the installed Aether Agents CLI). The function also passes `--settings '{"enableWorkflows": true}'`, because dynamic workflows are off by default on the owner's plan (Phase 0). Normal mode loads neither. |
| A9 | The prototype becomes the published project only if a trial shows lower cost and lower wall-clock time than normal mode, at equal quality (§13). |
| A10 | Each task in a plan meant for the swarm states the contract: its Interfaces block, its exact failing tests and its acceptance. The implementation code itself is written by the implementer, not by the Designer in the plan (§6). Complete code in the plan concentrates the work in the Designer and leaves the swarm only copying, which gains neither speed nor cost. Code that is already written and verified is applied directly by the Designer. |

## 3. Repository and versioning

```text
aether-plugin/
├── README.md
├── docs/
│   ├── aether-retrospective.md, claude-code-research.md, decisions.md
│   ├── evaluations/                  # trial reports
│   └── superpowers/specs/, plans/
├── plugins/aether/                   # the plugin; only this directory is loaded
│   ├── .claude-plugin/plugin.json    # name "aether", version "0.1.0"
│   ├── NOTICE                        # superpowers MIT notice for adapted prompts
│   ├── hooks/hooks.json              # SessionStart hook and the mods module
│   ├── hooks/register.js             # usage meter mod, with its usage.test.ts
│   ├── skills/using-aether/SKILL.md
│   ├── skills/swarm/SKILL.md
│   ├── agents/implementer.md, reviewer.md, supervisor.md, ops.md
│   ├── workflows/run.workflow.js     # /aether:run
│   ├── bin/aether-plan, aether-wt, aether-report, aether-session-start
│   ├── lib/                          # plan, git, globs, run, worktrees, prices, report
│   └── config/prices.json
└── tests/                            # bin, mod and workflow tests, fixtures; not shipped
```

- **Daily use:** `aether-mode` runs `claude --plugin-dir <repo>/plugins/aether --settings '{"enableWorkflows": true}'`. The main checkout stays on `main`, so the function always loads the reviewed version.
- **Data directory:** `~/.local/share/aether-plugin/` holds usage files and run records. It is a fixed path because mods cannot read `CLAUDE_PLUGIN_DATA` (Phase 0). It is kept apart from `~/.local/share/aether/`, which belongs to the installed Aether Agents.
- **Development:** changes are made in superpowers worktrees and tried by pointing `--plugin-dir` at the worktree's `plugins/aether`. Mods reload on save; skills, agents and hooks reload with `/reload-plugins`.
- **Versions:** semver in `plugin.json`, starting at 0.1.0. Tags are made with `claude plugin tag plugins/aether` (`aether--v0.1.0`). No release candidates or release locks.
- **Publishing (later):** a root `.claude-plugin/marketplace.json` that lists `./plugins/aether`.
- The bin tools are Node.js scripts with no dependencies. Node 22 is installed.

## 4. Components

| Component | Kind | Responsibility |
|---|---|---|
| `using-aether` | Skill, injected at SessionStart (`startup`, `clear`, `compact`) | Mode bootstrap: route judgment, plan fields, tier rubric, the third execution option, and a pointer to `swarm` |
| `swarm` | Skill, loaded by the Designer on demand | Procedure to compile a plan, launch a run, handle its report, relaunch pending units and finish |
| `aether-session-start` | bin, run by the SessionStart hook | Prints the bootstrap as `additionalContext` and runs `aether-wt sweep --stale` in the current repository |
| `aether-plan` | bin | Parses a superpowers plan with Aether fields, validates it, computes waves, writes briefs and `graph.json`, and prints the run arguments |
| `aether-wt` | bin | Unit worktrees and branches: `ensure`, `diff` (a unit's review package, or the whole run's with `--final`), `merge`, `remove`, `sweep` (`--finish` also deletes the run directory). Keeps `.aether/` out of git |
| `aether-report` | bin | Quality, cost and speed report for a run, over every launch of it. `finalize` writes the persistent record, then deletes the run's leftovers and directory. `price` prices any `claude -p` JSON output |
| `implementer`, `supervisor`, `reviewer` | Agents | Role prompts, adapted from superpowers' implementer, task-reviewer and code-reviewer templates (MIT, notice kept in `NOTICE`). The supervisor reviews each attempt and rules on it; the reviewer does the final review |
| `ops` | Agent | The workflow's hands: runs one given `aether-wt` command and returns its JSON. A workflow script has no shell of its own. It is a mechanism, not a role |
| `/aether:run` | Workflow | The swarm: waves, unit pipeline, escalation ladder, merge queue, final review, cleanup |
| Usage meter | Mod on `turn.step` and `turn.complete` | Records each model request: agent, model, tokens, time |

## 5. End-to-end flow

1. The owner runs `aether-mode`. The SessionStart hook injects `using-aether` and reports any stale-run cleanup it did.
2. superpowers brainstorming classifies the objective:
   - **Spike:** investigate, then recommend.
   - **Bounded:** short design and the owner's yes. The Designer then implements it itself with TDD, or hands it to one implementer when the work is mechanical and large.
   - **Architectural:** spec (owner approval), plan with Aether fields (owner approval), then the execution choice. superpowers already offers subagent-driven and native execution; Aether mode adds the swarm. The Designer recommends one with a quality, cost and speed reason, and the owner confirms.
3. **Swarm:** the Designer creates the integration worktree with superpowers `using-git-worktrees`, runs `aether-plan compile`, and launches `/aether:run` with the printed arguments. The run works in the background. In v0.1 the Designer does not edit the integration worktree while a run is active.
4. **Report:** the Designer reads the result and saves it as `runDir/result.json`. It then fixes small final-review findings itself or relaunches pending units with `aether-plan compile --only <tasks>`, and brings blocked questions to the owner.
5. **Finish:** `aether-report finalize`, then superpowers `finishing-a-development-branch` with the owner.

## 6. Plan extensions

Plans follow superpowers `writing-plans`, with one change for tasks that go to the swarm (A10). Each task gives:
- its files;
- its **Interfaces** block, with exact names, signatures and types;
- its **failing tests**, written out in full;
- its acceptance.

The implementation step says "make these tests pass within the Interfaces", without code. The implementer writes the tests from the plan first, watches them fail, and then writes the code. Everything else in `writing-plans` still applies, including "no placeholders" for every requirement. A part that needs the Designer's judgment down to the code is usually better done by the Designer directly.

Aether adds fields that superpowers' own executors ignore, so an Aether plan can still run in normal mode.

Per task, right after the task heading:

```markdown
### Task 3: Login form

**Aether:**
- Tier: sonnet — interactive UI states the tests cannot fully pin down
- Area: frontend
- Owns: `web/src/login/**`, `web/tests/login.test.tsx`
- Depends on: Task 1 — uses the auth client Task 1 creates
```

`Depends on: none` marks an independent task. Every dependency needs a reason.

Plan-level section, after Global Constraints:

```markdown
## Aether Execution
- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 200
```

`aether-plan compile` refuses a plan when:
- a task lacks Tier, Area, Owns or Depends on, or a dependency lacks its reason;
- a dependency names a missing task, or the dependencies form a cycle;
- two tasks in the same wave own overlapping paths;
- the plan is a chain: three or more tasks and every wave holds one task (decision D6).

It warns, without refusing, when the average wave holds fewer than 1.5 tasks.

**Tier rubric.** The Designer decides and states the reason.
- **haiku** (default): exact tests and interfaces pin the task down, and it touches few files.
- **sonnet:** frontend and UI, integration across several files, or behavior that the tests cannot pin down exactly.
- **opus:** security and auth, data migrations or destructive operations, concurrency, core architecture.

## 7. Swarm executor (`/aether:run`)

*Amended by Plan 2 (2026-10-08).* The executor below is what Plan 2 built. Compared with the first draft:
- one supervisor call per attempt both reviews and rules, replacing the separate review and triage calls;
- the supervisors' memory and the implementers' reports live in the script's state, not in ledger or report files;
- merge failures are routed by kind;
- the final review reads a package written by `aether-wt diff <run> --final`;
- the workflow's sweep keeps the run directory, which the Designer deletes with `--finish`.

**Input.** `aether-plan compile` prints the `args`, which the workflow takes as an object or as a JSON string. It checks them before any agent starts.
- Run fields: `runId`, `repoRoot`, `runDir`, `plan`, `spec`, `testCommand`, `ladder` and `maxAgents`.
- The integration `branch` and `worktree`, plus `base`: the integration branch's commit at compile time.
- `waves`: lists of task ids.
- Per task: `title`, `brief` (a file path), `tier`, `area`, `owns` and `dependsOn`.

**Waves.** Waves run in order; the units of a wave run in parallel. A unit whose dependency is not merged is skipped and reported.

**Unit pipeline.**
1. **Implement.** A fresh `implementer` agent runs on the unit's current tier.
   - It runs `aether-wt ensure <run> <task>`. The command is idempotent and prints the unit's worktree path; the branch is `aether/<run>/<task>`, created from the integration branch.
   - It works only in that worktree. It writes the brief's tests, watches them fail, writes the code until they pass, and commits.
   - It runs `aether-wt diff <run> <task>`, which writes the review package `runDir/packages/<task>.diff`.
   - It returns `{status, summary, head, tests, concerns, question}`, with status `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT` or `BLOCKED`. This structured report is the whole report; there is no report file.
   - Later attempts continue in the same worktree. Their prompt carries every earlier attempt's report, ruling, findings and merge outcome.
2. **Supervise.** One `supervisor` agent on Sonnet per attempt. It is read-only.
   - It checks that the package's Head matches the reported `head`.
   - It reviews the package against the brief, for spec compliance and for quality, after superpowers' task reviewer.
   - It returns `{verdict: approve|retry|escalate|block, findings: [{severity, title, file, evidence}], ruling, guidance, question}`.
   - `NEEDS_CONTEXT` and `BLOCKED` reports go to it too. It answers from the brief or the repository with a retry, escalates, or blocks with a question for the Designer.
   - An approval that still lists a critical or important finding counts as a retry. Minor findings go to the final review.
   - The script enforces the ladder (§8): a retry beyond the current tier's budget becomes an escalation, and an escalation past the last tier with budget becomes a block.
3. **Merge.** Approved units enter one queue, serialized by a promise chain, so only one merge runs at a time. An `ops` agent runs `aether-wt merge <run> <task>`, which:
   - refuses to start when the integration worktree has uncommitted changes, or is not on the integration branch;
   - checks that the diff touches only the unit's `owns` paths;
   - merges with `--no-ff` into the integration branch and runs the test command;
   - undoes its own merge if the tests fail, and prints JSON.

   The script routes a failed merge by its kind:
   - **A conflict or failing tests:** one retry on the same tier, outside the ladder, with the conflict or the test output. A second failure blocks the unit.
   - **Changes outside `owns`, or nothing committed:** a failed attempt; the ladder decides what follows.
   - **A dirty, switched or missing integration worktree, a merge that git refused before merging (`merge-failed`, such as an untracked file in the way), or a failed command:** the unit is blocked, with the detail.
4. **Close.** Every unit that started is closed by an `ops` agent with `aether-wt remove <run> <task>`, after a merge, a block or the end of the budget.
   - Unmerged work is saved first as `runDir/patches/<task>.patch`.
   - Closes share the merge queue, and a failed close is retried once.

**Final review.** It runs when at least one unit merged and the agent budget allows.
- An `ops` agent runs `aether-wt diff <run> --final`. It writes `runDir/packages/final.diff`, which covers everything from `base` to the tip of the integration branch.
- A read-only `reviewer` agent on Opus reviews that package against the plan and the spec, after superpowers' code reviewer.
- It returns a verdict (`ready`, `ready-with-fixes` or `not-ready`), findings, the behaviors it declined to judge, and a summary.

**Cleanup.** A `finally` block always runs an `ops` agent with `aether-wt sweep --run <id>`, retried once if it fails.
- It reports anything left behind.
- It keeps the run directory, so that blocked units' patches survive. `aether-report finalize` deletes it once the Designer is done with the run.

**Result.** The run returns `{runId, units, finalReview, cleanup, agents, error}`.
- `units`, one per task:
  - `status`: `merged`, `blocked`, `skipped` or `not-run`;
  - the tier path, such as `["haiku", "sonnet"]`;
  - `rounds`: each attempt's report, verdict, findings, ruling, guidance and merge outcome;
  - the merge `commit`, and the `reason`, `question` and `patch` of an unmerged unit.
- `finalReview`: with a `status` of `done`, `skipped` or `failed`.
- `cleanup`: what the sweep removed and what `remaining` it found.
- `agents`: the agent count, in total, by role and by model.
- `error`: set only when the script itself failed.

**Supervisors.** There is one supervisor role per area.
- Each call is a fresh Sonnet agent. Its memory is the area's last ten rulings, which the script passes to every later call in that area.
- Areas progress in parallel; merges are serialized for the whole run.

**Limits.**
- The script counts its `agent()` calls. After `maxAgents`, it starts no new attempt and no final review: the remaining units are reported as `not-run`. Work already started still finishes and is closed, and cleanup always runs.
- It never calls `Date.now()` or `Math.random()`, as the workflow runtime requires.

**Runtime API (confirmed in Phase 0).** Every call has the form `agent(prompt, { agentType, model, phase, label, schema })`, and every call passes an `agentType`, because an agent without one gets every tool, MCP connector tools included. `parallel()` takes an array of functions that return promises. `agent()` resolves to `null` on a terminal failure and can reject; both count as a failed attempt.

## 8. Model routing and escalation

- The initial tier comes from the plan.
- **Default ladder per unit:** Haiku 2 attempts, Sonnet 2, Opus 1, then blocked.
  - The supervisor may escalate early but cannot exceed the budget.
  - A tier whose budget is 0 is skipped.
  - The one retry after a merge conflict or failing merge tests does not count against the ladder.
- Every attempt is a fresh implementer. Fix rounds continue in the same worktree, and the prompt carries the earlier attempts' reports, rulings and findings, as superpowers' fix loop does.
- Unit reviews run on the Sonnet supervisor; the final review runs on Opus. Batched or risk-based review is deferred until the trial shows what reviews cost.
- **Effort** is set in each agent definition, because the owner's default `xhigh` would otherwise apply to Haiku: implementer `medium`, ops `low`, supervisor and reviewer `high`.
- **maxTurns:** implementer 60, supervisor 25, reviewer 30, ops 5. The supervisor took the unit reviewer's budget when the two merged.
- Implementer prompts point to brief files instead of embedding the plan. This keeps requests under Haiku's 100K-token price tier.

## 9. Cleanup (A7)

**Locations.** All are excluded through `.git/info/exclude`, so the project's `.gitignore` is untouched.
- Unit worktrees: `<repo>/.aether/worktrees/<run>/<task>`.
- Run directory: `<repo>/.aether/runs/<run>/`, holding `state.json`, the graph, briefs, review packages, patches and the saved result. `aether-plan compile` creates it.
- Implementer temporary files: `<unit worktree>/.aether-tmp/`, deleted with the worktree.

**Lifecycle.**
- A unit worktree and its branch live from `ensure` until a merge or a block (§7, step 5).
- The run directory lives until `aether-report finalize`, which first writes the persistent record. `aether-wt sweep --run <id> --finish` deletes it without a record.

**Safety nets.**
- `sweep --run` runs in the workflow's `finally` block.
- `sweep --stale` runs at every SessionStart. It removes the worktrees and branches of runs that were not finalized and have been untouched for 24 hours, after writing an "abandoned" record.

**Safety rules.**
- `aether-wt` only touches paths under `<repo>/.aether/` and branches under `aether/`, and refuses any other target.
- `remove` and `sweep --run` first save a unit's unmerged or uncommitted work as `runDir/patches/<task>.patch`. A sweep keeps a unit whose work it cannot save, and the run directory with it. A stale sweep records the branch tips first (Plan 3).
- It never deletes the integration branch or its worktree.

**Acceptance.** After `finalize`:
- `git worktree list` shows no Aether worktrees;
- `git branch --list 'aether/*'` is empty;
- `.aether/runs/` is empty.

## 10. Measurement

*Amended by Plan 3 (2026-10-08).*

- **Usage meter.** The mod (`hooks/register.js`) observes `turn.step` for every request of the main session, subagents and workflow agents.
  - Each entry holds the time the request ended, its duration, the agent id (`null` for the main session), the model, and the input, output, cache-read and cache-write tokens.
  - `agent.spawn` teaches it each agent's type and label, such as `aether:implementer` and `task-3: implement on haiku (attempt 1)`.
  - Entries go to `usage/<session>/<n>.json` in the data directory, in parts of up to 1,000 entries. Each part holds `{ session, part, claudeCode, agents, entries }`.
  - Writes are serialized, and happen on `turn.complete`, on `session.end` and every 20 entries. A reloaded mod starts after the parts already on disk.
  - The meter only observes: a failure never touches a request.
- **Cross-check.** The meter's tokens match Claude Code's `modelUsage` exactly. Claude Code's `costUSD` uses the same rates as OpenRouter, with the real cache-write lifetimes. The meter's usage does not split them, so the report bills the main session's writes at 1 hour and agents' at 5 minutes, which came out 3% low in the smoke run. `aether-report price` prices any `claude -p` JSON output both ways. The trial compares the two modes on `costUSD`.
- **Prices.** `config/prices.json` holds the OpenRouter snapshot of 2026-10-07 for the Anthropic endpoint, with its source URLs. It was rechecked on 2026-10-08, unchanged. Values are USD per million tokens. Haiku's higher prices apply to a whole request once its prompt (input plus cache reads and writes) reaches 100,000 tokens.

  | Model | Input | Output | Cache read | Cache write (5 min) | Cache write (1 h) |
  |---|---|---|---|---|---|
  | Opus 5.5 | 4.00 | 20.00 | 0.20 | 5.00 | 8.00 |
  | Sonnet 5.5 | 2.00 | 10.00 | 0.10 | 2.50 | 4.00 |
  | Haiku 5.5 | 0.10 | 0.50 | 0.01 | 0.125 | 0.20 |
  | Haiku 5.5, prompt over 100K | 0.50 | 2.50 | 0.05 | 0.625 | 1.00 |

- **Report** (`aether-report --run <id> [--session <id>] [--no-tests]`):
  - **The window:** from the run's first compile to the time its latest result was saved. A relaunch with `aether-plan compile --run` keeps the first compile time and archives the previous `result.json` as `result-<k>.json`.
  - **The session:** without `--session`, the report uses the usage session that ran the most `aether:` agents in the window.
  - **Speed:** the window, the swarm's own span (from its first agent request to its last), and the session's span.
  - **Cost:** USD and tokens at OpenRouter prices, by model and by role, for the window and for the whole session.
  - **Quality**, over every launch:
    - units merged, blocked, skipped and not run;
    - escalations and attempts;
    - every supervisor finding, and the final reviews, by severity;
    - the test command, run on the integration branch.
- **Persistent record.** `finalize` appends one line per run to `runs.jsonl` in the plugin data directory, with the report and the aether, superpowers and Claude Code versions. Then it sweeps the run with `--finish`.
- **Baseline.** The same objective and plan run in normal mode, Opus with superpowers `subagent-driven-development`, each mode in a fresh session. The comparison goes to `docs/evaluations/`.

## 11. Error handling

| Case | Handling |
|---|---|
| `agent()` returns null (stopped, API error) | Counts as a failed attempt on the ladder |
| Usage limit reached | The workflow pauses and resumes on its own in an interactive subscription session. In any other session the attempt fails |
| Merge conflict, or failing tests at merge | The merge is undone. The unit goes back to implement once on the same tier, with context; a second failure blocks it |
| Changes outside `owns`, or nothing committed, at merge | The merge is refused, and the attempt counts as failed on the ladder |
| Integration worktree dirty or on another branch at merge | The merge is refused and the unit is blocked, with the reason |
| Invalid plan | `aether-plan compile` refuses, with one message per problem |
| Run stopped by the owner | The `finally` block may not run. The SessionStart sweep and a manual `aether-wt sweep --run <id>` cover it |

## 12. Testing

- **bin tools:** test-first with `node --test`, run from `tests/`. Fixtures are throwaway git repositories created in temporary directories.
- **Mods:** `claude plugin test plugins/aether` runs `hooks/usage.test.ts` with stubbed events and calls.
- **Plugin:** `claude plugin validate plugins/aether --strict`.
- **Workflow logic:**
  - A Node harness runs the body of `run.workflow.js` with stubbed runtime functions (`agent`, `parallel`, `phase`, `log`, `args`), matching the signatures that Phase 0 confirms.
  - Scenarios cover parallel waves, escalation, blocked dependencies, a merge conflict and cleanup in `finally`. Each scenario compares the trace of calls with an expected trace, without spending tokens.
  - One real smoke run completes the check.
- **Behavior:** `claude plugin eval` cases check that the bootstrap adds the swarm option at the plan handoff, that bounded work still asks for approval, and that plans get Aether fields.
- **End to end:** the trial in §13.

## 13. Scope and phases

**Phase 0: check platform assumptions.** This follows superpowers' spike path. Findings go to `docs/claude-code-research.md` and may amend this spec before the plan is written.

*Done on 2026-10-07:* S1–S5 confirmed. S6 is untested, and the design does not rely on it. Workflows needed `enableWorkflows`, which led to the change in A8. Details are in the [research doc](../../claude-code-research.md#phase-0-findings-2026-10-07).
- S1. Can workflow `agent()` use a plugin agent type, and does it honor that type's tools, effort and maxTurns? What are the signatures of `agent()`, `parallel()` and `phase()`?
- S2. Do workflow agents' Bash calls see the plugin's `bin/` on `PATH`?
- S3. Does `turn.step` fire for workflow agents with an agent id, model and usage? Where can a mod write files?
- S4. Does `haiku` resolve to `claude-haiku-5-5` for workflow agents on Claude Code 2.1.293?
- S5. Do the plugin's SessionStart context and superpowers' bootstrap both arrive?
- S6. Does a workflow's `finally` block run when the owner stops the run?

**Implementation.** Three plans, each producing software that works and can be tested on its own:
- Plan 1, Foundation: steps 1–3.
- Plan 2, Swarm: steps 4 and 6.
- Plan 3, Measurement and trial: steps 5 and 7.

Each plan is written after the previous one is merged. Plans 1, 2 and 3 were built on 2026-10-08, and each plan records its smoke runs and review. The trial is in `docs/evaluations/`.
1. Skeleton: manifest, `NOTICE`, SessionStart hook, `using-aether`, the `aether-mode` shell function, validation.
2. `aether-plan`, with tests.
3. `aether-wt`, with tests: ensure, diff, merge, remove, sweep, and the safety rules.
4. Agents and `/aether:run`, with harness scenarios.
5. Usage meter, `config/prices.json` and `aether-report`.
6. The `swarm` skill, plus updates to the README, `docs/decisions.md` and the research doc.
7. Trial: a fixture project with at least 6 tasks in at least 2 waves across 2 areas, run in Aether mode and in normal mode. Results go to `docs/evaluations/`. Then tag `aether--v0.1.0`.

**v0.1 acceptance.**
- The trial plan completes, with every unit merged or blocked with a question.
- Tests pass on the integration branch.
- The cleanup acceptance in §9 holds, including after a run killed midway followed by a new session.
- The report shows time, cost and quality.

**Gate to the published project (A9).** Aether mode costs less and takes less wall-clock time than normal mode. Both runs end with tests green and no unresolved Critical or Important findings.

*Trial 1 (2026-10-08) met the v0.1 acceptance and passed the gate.*
- Every unit merged, the tests passed on the integration branch, and the cleanup acceptance held after `finalize` and after a killed run followed by a new session. The report showed time, cost and quality.
- Aether mode took 6 min 11 s and $1.98, against normal mode's 24 min 25 s and $5.60. Both passed a hidden 33-case acceptance suite.
- See `docs/evaluations/2026-10-08-trial-1.md`.

**Out of scope for v0.1:**
- notifications (Telegram, push);
- a write-time ownership guard (the merge-time check is in);
- the Designer implementing a unit while the swarm runs;
- splitting a unit mid-run;
- batched or risk-based review;
- time budgets enforced in code;
- marketplace publishing;
- non-Anthropic models and the Aether Router;
- ECC.

## 14. Risks and open items

- **superpowers updates** can change the plan format or the execution handoff. Trials record the superpowers version, and the version stays pinned during a trial.
- **Review cost** may dominate when Haiku implements: an estimated 5× the cost of a Haiku unit. The trial measures it before the review policy changes.
- **Per-merge test runs** may dominate wall-clock time on slow test suites. The trial measures it.
- **Subscription usage limits** during large runs: the workflow waits for the reset, and the report shows the wait.
- **MCP connector context.** The owner's claude.ai connectors add their instructions and tools to subagents and workflow agents, which raises every agent's cost (Phase 0). Agents with an `agentType` limit the tools, but the instructions still arrive. The trial measures the effect.
- **Phase 0 may invalidate parts of §7.** The fallbacks are prompts embedded in `agent()` calls instead of agent types, and absolute paths to the bin tools instead of `PATH`.

## 15. Documents to update

- **README:** name, status, and how to use Aether mode.
- **`docs/decisions.md`:**
  - D2: superpowers replaces Spec Kit as the specification method.
  - D3 and D10: phase 1 does not need the router.
  - D5 and D6: tiers in the plan, the escalation ladder, and the workflow as orchestrator.
  - D11: notifications are deferred.
  - D14: specs and plans live in `docs/superpowers/`.
  - D15: the new name.
  - New entries for A1–A9.
- **`docs/claude-code-research.md`:** Phase 0 findings and the OpenRouter prices.
