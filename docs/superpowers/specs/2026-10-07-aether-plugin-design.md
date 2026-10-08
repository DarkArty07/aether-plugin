# Aether: design spec (v0.1)

- **Date:** 2026-10-07
- **Status:** Draft for owner review
- **Method:** superpowers brainstorming (architectural path). After approval, Phase 0 checks (§13), then superpowers `writing-plans`.
- **Background:** [README](../../../README.md), [Aether retrospective](../../aether-retrospective.md), [Claude Code research](../../claude-code-research.md), [Decisions](../../decisions.md)

## 1. Summary

Aether is a Claude Code plugin that adds an opt-in **Aether mode** on top of superpowers. The main session, the Designer, runs on Opus and designs with superpowers. When it pays off, the Designer hands an approved plan to a parallel swarm:

- implementers run on Haiku 5.5 by default, and move up to Sonnet or Opus when a task is critical or fails review;
- reviewers check each unit independently;
- a serialized queue merges approved units;
- code deletes each unit's worktree as soon as the unit is done.

Without the plugin, the owner works in normal mode with superpowers alone.

The goal is quality, cost and speed together. Success is measured against normal mode on the same objective (§10, §13).

## 2. Decisions

Taken by the owner on 2026-10-07.

| ID | Decision |
|---|---|
| A1 | Project name **Aether Plugin**. Plugin id `aether`. Folder and future repository slug `aether-plugin`. The name leaves out "Claude Code", following Anthropic's branding guidelines and D15; descriptions may say "a plugin for Claude Code". |
| A2 | superpowers is the base, and the authority on engineering practice and on owner approval gates. Aether adds only the multi-agent organization that superpowers does not cover. When the two conflict, superpowers wins, with one exception: Aether implements units in parallel, because per-unit worktrees and disjoint file ownership remove the conflict that superpowers guards against. |
| A3 | ECC is out for now. |
| A4 | Roles, top down: owner; Designer (main session, Opus, final authority among agents); supervisors (Sonnet); implementers (Haiku by default, Sonnet or Opus when escalated); reviewers (Sonnet, and Opus for the final review). Plugin code enforces whatever must always happen the same way. |
| A5 | The Designer may implement, review and fix work itself. Handing work to the swarm is a quality, cost and speed decision, not a rule. superpowers' paths (spike, bounded, architectural) and its approval gates apply unchanged: bounded work still gets a short in-chat design and the owner's yes. |
| A6 | Cost is judged at API list prices from OpenRouter, even though the owner uses a subscription. |
| A7 | Hard requirement: unit worktrees, unit branches and temporary files are deleted as soon as they stop being used. Code enforces this. |
| A8 | Aether mode is chosen per session by loading the plugin with `claude --plugin-dir`, through an `aether` shell function. Normal mode does not load the plugin. |
| A9 | The prototype becomes the published project only if a trial shows lower cost and lower wall-clock time than normal mode, at equal quality (§13). |

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
│   ├── hooks/register.js             # usage meter mod
│   ├── skills/using-aether/SKILL.md
│   ├── skills/swarm/SKILL.md
│   ├── agents/implementer.md, reviewer.md, supervisor.md, ops.md
│   ├── workflows/run.workflow.js     # /aether:run
│   ├── bin/aether-plan, aether-wt, aether-report, aether-session-start
│   └── config/prices.json
└── tests/                            # bin, mod and workflow tests, fixtures; not shipped
```

- **Daily use:** `aether` runs `claude --plugin-dir <repo>/plugins/aether`. The main checkout stays on `main`, so the function always loads the reviewed version.
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
| `aether-wt` | bin | Unit worktrees and branches: `ensure`, `diff`, `merge`, `remove`, `sweep`. Keeps `.aether/` out of git |
| `aether-report` | bin | Quality, cost and speed report for a run, and a persistent run record. `finalize` deletes the run directory |
| `implementer`, `reviewer`, `supervisor` | Agents | Role prompts. The implementer and reviewer prompts adapt superpowers' implementer and task-reviewer templates (MIT, notice kept in `NOTICE`) |
| `ops` | Agent | The workflow's hands: runs one given `aether-wt` command and returns its JSON. A workflow script has no shell of its own. It is a mechanism, not a role |
| `/aether:run` | Workflow | The swarm: waves, unit pipeline, escalation ladder, merge queue, final review, cleanup |
| Usage meter | Mod on `turn.step` and `turn.complete` | Records each model request: agent, model, tokens, time |

## 5. End-to-end flow

1. The owner runs `aether`. The SessionStart hook injects `using-aether` and reports any stale-run cleanup it did.
2. superpowers brainstorming classifies the objective:
   - **Spike:** investigate, then recommend.
   - **Bounded:** short design and the owner's yes. The Designer then implements it itself with TDD, or hands it to one implementer when the work is mechanical and large.
   - **Architectural:** spec (owner approval), plan with Aether fields (owner approval), then the execution choice. superpowers already offers subagent-driven and native execution; Aether mode adds the swarm. The Designer recommends one with a quality, cost and speed reason, and the owner confirms.
3. **Swarm:** the Designer creates the integration worktree with superpowers `using-git-worktrees`, runs `aether-plan compile`, and launches `/aether:run` with the printed arguments. The run works in the background. In v0.1 the Designer does not edit the integration worktree while a run is active.
4. **Report:** the Designer reads the result and saves it as `runDir/result.json`. It then fixes small final-review findings itself or relaunches pending units with `aether-plan compile --only <tasks>`, and brings blocked questions to the owner.
5. **Finish:** `aether-report finalize`, then superpowers `finishing-a-development-branch` with the owner.

## 6. Plan extensions

Plans follow superpowers `writing-plans` completely, including complete code in every step. That is what makes Haiku's "transcription plus testing" viable. Aether adds fields that superpowers' own executors ignore, so an Aether plan can still run in normal mode.

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
- **haiku** (default): the task carries complete code or an exact contract, and touches few files.
- **sonnet:** frontend and UI, integration across several files, prose-only specification, or tests that are hard to write.
- **opus:** security and auth, data migrations or destructive operations, concurrency, core architecture.

## 7. Swarm executor (`/aether:run`)

**Input.** `aether-plan compile` prints the `args`:
- run fields: `runId`, `repoRoot`, `runDir`, the integration `branch` and `worktree`, `testCommand`, `ladder`, `maxAgents`;
- `waves`: lists of task ids;
- per task: `title`, `brief` (a file path), `tier`, `area`, `owns`.

**Waves.** Waves run in order; the units of a wave run in parallel. A unit that depends on a blocked unit is skipped and reported.

**Unit pipeline.**
1. **Implement.** An `implementer` agent runs on the unit's current tier.
   - It runs `aether-wt ensure <run> <task>`. The command is idempotent and prints the unit's worktree path; the branch is `aether/<run>/<task>`, created from the integration branch.
   - It works only in that worktree, follows TDD, commits, and writes its full report to `runDir/reports/<task>.md`.
   - It returns `{status, commits, tests, concerns, question}`, with status `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT` or `BLOCKED`.
2. **Review.** A `reviewer` agent on Sonnet gets its diff package from `aether-wt diff`. It returns `{spec: PASS|FAIL, quality: APPROVED|CHANGES, findings: [{severity, title, file, evidence}]}`. A unit passes when spec is PASS and there are no Critical or Important findings. Minor findings go to the area ledger and to the final review.
3. **Triage** (on a failed review, `NEEDS_CONTEXT` or `BLOCKED`). A `supervisor` agent on Sonnet reads the area ledger and returns `{action: retry|escalate|block, reason, question}`. It records the decision as a `Ruling:` line in the area ledger. The script enforces the ladder (§8): a retry beyond the current tier's budget becomes an escalation, and an escalation past Opus becomes a block.
4. **Merge.** Approved units enter one queue, serialized by a promise chain, so only one merge runs at a time. An `ops` agent runs `aether-wt merge <run> <task>`, which:
   - refuses to start when the integration worktree has uncommitted changes;
   - checks that the diff touches only the unit's `owns` paths;
   - merges with `--no-ff` into the integration branch and runs the test command;
   - undoes its own merge if the tests fail, and prints JSON.

   A conflict or a test failure sends the unit back to step 1 once, with the conflict context. A second failure blocks it.
5. **Close.** After a merge or a block, an `ops` agent runs `aether-wt remove <run> <task>`. For a blocked unit, its diff is saved first as `runDir/patches/<task>.patch`.

**Final review.** A `reviewer` agent on Opus reviews the whole integration diff against the base, using superpowers' final code-review criteria.

**Cleanup.** A `finally` block always runs an `ops` agent with `aether-wt sweep --run <id>`, and reports anything left behind.

**Result.** The run returns:
- per unit: status, tier path (for example `haiku → sonnet`), rounds, review verdicts and merge commit;
- blocked units, with their questions;
- the final review findings;
- every `Ruling:` line;
- the agent count.

**Supervisors.** There is one supervisor role per area. Each triage call is a fresh Sonnet agent whose memory is the area ledger, `runDir/areas/<area>.md`. Areas progress in parallel; merges are serialized for the whole run.

**Limits.** The script counts its `agent()` calls and starts no new unit after `maxAgents`. It never calls `Date.now()` or `Math.random()`, as the workflow runtime requires.

## 8. Model routing and escalation

- The initial tier comes from the plan.
- **Default ladder per unit:** Haiku 2 attempts, Sonnet 2, Opus 1, then blocked. Triage may escalate early but cannot exceed the budget.
- Fix rounds continue in the same worktree. A new tier starts a fresh implementer that reads the previous report, as superpowers' fix loop does.
- Reviews run on Sonnet; the final review runs on Opus. Batched or risk-based review is deferred until the trial shows what reviews cost.
- **Effort** is set in each agent definition, because the owner's default `xhigh` would otherwise apply to Haiku: implementer and ops `medium`; reviewer and supervisor `high`.
- **maxTurns:** implementer 60, reviewer 25, supervisor 15, ops 5.
- Implementer prompts point to brief files instead of embedding the plan. This keeps requests under Haiku's 100K-token price tier.

## 9. Cleanup (A7)

**Locations.** All are excluded through `.git/info/exclude`, so the project's `.gitignore` is untouched.
- Unit worktrees: `<repo>/.aether/worktrees/<run>/<task>`.
- Run directory: `<repo>/.aether/runs/<run>/`, holding `state.json`, graph, briefs, reports, ledgers, patches and result. `aether-plan compile` creates it.
- Implementer temporary files: `<unit worktree>/.aether-tmp/`, deleted with the worktree.

**Lifecycle.**
- A unit worktree and its branch live from `ensure` until a merge or a block (§7, step 5).
- The run directory lives until `aether-report finalize`, which first writes the persistent record.

**Safety nets.**
- `sweep --run` runs in the workflow's `finally` block.
- `sweep --stale` runs at every SessionStart. It removes the worktrees and branches of runs that were not finalized and have been untouched for 24 hours, after writing an "abandoned" record.

**Safety rules.**
- `aether-wt` only touches paths under `<repo>/.aether/` and branches under `aether/`, and refuses any other target.
- It never deletes the integration branch or its worktree.

**Acceptance.** After `finalize`:
- `git worktree list` shows no Aether worktrees;
- `git branch --list 'aether/*'` is empty;
- `.aether/runs/` is empty.

## 10. Measurement

- **Usage meter.** The mod writes one entry per model request to `usage-<session>.json` in the plugin data directory, rewriting the file on each `turn.complete`. Each entry holds the agent id, model, input, output, cache read and cache write tokens, and time.
- **Prices.** `config/prices.json` holds the OpenRouter snapshot of 2026-10-07 for the Anthropic endpoint, with its source URLs. Values are USD per million tokens. Haiku's higher prices apply to requests whose prompt exceeds 100K tokens.

  | Model | Input | Output | Cache read | Cache write (5 min) | Cache write (1 h) |
  |---|---|---|---|---|---|
  | Opus 5.5 | 4.00 | 20.00 | 0.20 | 5.00 | 8.00 |
  | Sonnet 5.5 | 2.00 | 10.00 | 0.10 | 2.50 | 4.00 |
  | Haiku 5.5 | 0.10 | 0.50 | 0.01 | 0.125 | 0.20 |
  | Haiku 5.5, prompt over 100K | 0.50 | 2.50 | 0.05 | 0.625 | 1.00 |

- **Report** (`aether-report --run <id>`):
  - speed: wall-clock time of the run and of the whole session;
  - cost: tokens and USD by model;
  - quality: units merged, escalated and blocked; review findings by severity; final-review verdict; tests at integration.
- **Persistent record.** `finalize` appends one line per run to `runs.jsonl` in the plugin data directory, including the superpowers and aether versions.
- **Baseline.** The same objective and plan run in normal mode, Opus with superpowers `subagent-driven-development`, each mode in a fresh session. The comparison goes to `docs/evaluations/`.

## 11. Error handling

| Case | Handling |
|---|---|
| `agent()` returns null (stopped, API error) | Counts as a failed attempt on the ladder |
| Usage limit reached | The workflow pauses and resumes on its own in an interactive subscription session. In any other session the attempt fails |
| Merge conflict, or failing tests at merge | The merge is undone. The unit goes back to implement once, with context; a second failure blocks it |
| Ownership violation at merge | The merge is refused and the unit goes to triage |
| Invalid plan | `aether-plan compile` refuses, with one message per problem |
| Run stopped by the owner | The `finally` block may not run. The SessionStart sweep and a manual `aether-wt sweep --run <id>` cover it |

## 12. Testing

- **bin tools:** test-first with `node --test`, run from `tests/`. Fixtures are throwaway git repositories created in temporary directories.
- **Mods:** `claude plugin test` with stubbed events.
- **Plugin:** `claude plugin validate plugins/aether --strict`.
- **Workflow logic:**
  - A Node harness runs the body of `run.workflow.js` with stubbed runtime functions (`agent`, `parallel`, `phase`, `log`, `args`), matching the signatures that Phase 0 confirms.
  - Scenarios cover parallel waves, escalation, blocked dependencies, a merge conflict and cleanup in `finally`. Each scenario compares the trace of calls with an expected trace, without spending tokens.
  - One real smoke run completes the check.
- **Behavior:** `claude plugin eval` cases check that the bootstrap adds the swarm option at the plan handoff, that bounded work still asks for approval, and that plans get Aether fields.
- **End to end:** the trial in §13.

## 13. Scope and phases

**Phase 0: check platform assumptions.** This follows superpowers' spike path. Findings go to `docs/claude-code-research.md` and may amend this spec before the plan is written.
- S1. Can workflow `agent()` use a plugin agent type, and does it honor that type's tools, effort and maxTurns? What are the signatures of `agent()`, `parallel()` and `phase()`?
- S2. Do workflow agents' Bash calls see the plugin's `bin/` on `PATH`?
- S3. Does `turn.step` fire for workflow agents with an agent id, model and usage? Where can a mod write files?
- S4. Does `haiku` resolve to `claude-haiku-5-5` for workflow agents on Claude Code 2.1.293?
- S5. Do the plugin's SessionStart context and superpowers' bootstrap both arrive?
- S6. Does a workflow's `finally` block run when the owner stops the run?

**Implementation**, after Phase 0 and the written plan:
1. Skeleton: manifest, `NOTICE`, SessionStart hook, `using-aether`, the `aether` shell function, validation.
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
