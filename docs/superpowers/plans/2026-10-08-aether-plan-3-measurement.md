# Aether Plan 3: Measurement and Trial Implementation Plan

> Executed inline by the Designer with TDD, without delegation, as the owner asked (2026-10-08). On the same night the owner asked for the whole plan to be finished autonomously: "todo terminado, documentado y funcional". Like Plan 2, this plan states the contract (files, interfaces, tests, acceptance), and the code lives in the commits.

**Goal:** Measure Aether mode and decide the v0.1 gate (A9):
- a usage meter records every model request;
- `aether-report` turns a run into speed, cost and quality, and `finalize` keeps a record;
- a trial compares Aether mode with normal mode on the same plan;
- the documents and the `aether--v0.1.0` tag close v0.1.

**Architecture:**
- **Usage meter:** a Claude Code mod in the plugin (`hooks/register.js`, an ES module declared by `hooks.json` `modules`). It observes `turn.step` for every request of the main session, subagents and workflow agents, and `agent.spawn` to learn each agent's type. It writes per-session part files to the data directory.
- **Prices:** `config/prices.json` holds the OpenRouter snapshot. `lib/prices.js` prices one request, including Haiku's long-prompt tier.
- **Report:** `lib/report.js` and `bin/aether-report` read a run's directory, the usage files and the result. `finalize` appends to `runs.jsonl`, then deletes the run's leftovers and directory.

**Spec:** `docs/superpowers/specs/2026-10-07-aether-plugin-design.md`, §9, §10 and §13, plus the amendment in Task 7.

## Global Constraints

- **Plan 1 and 2 constraints:**
  - Node.js 22 with no dependencies; the bins and libs are CommonJS;
  - Aether only touches `.aether/` paths, `aether/` branches and its data directory.
- **Mods** (verified on Claude Code 2.1.294):
  - The hooks module is an ES module exporting `register(on)`.
  - `turn.step` hooks are async generators: `const r = yield* next(e)`, where `r.usage` has `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` and `model`. `e.agentId` is set for agents.
  - `agent.spawn` resolves to `{ model, agentId }`. A gating hook carries `.catch(($, e, next) => next(e))`, which is replay-safe.
  - `$.session.id()`, `$.session.version()` and `$.clock.now()` are async. `$.fs.write(path, text)` creates directories, is not atomic, and is limited to 4 MiB per file.
  - Each hook has a 10-second budget of its own time.
  - A meter failure must never change or break a request.
- **Data directory:** `AETHER_DATA_DIR`, or `~/.local/share/aether-plugin/`.
- **Prices** (OpenRouter, Anthropic endpoint, USD per million tokens, rechecked 2026-10-08, unchanged since 2026-10-07):

  | Model | Input | Output | Cache read | Cache write 5 min | Cache write 1 h |
  |---|---|---|---|---|---|
  | Opus 5.5 | 4 | 20 | 0.20 | 5 | 8 |
  | Sonnet 5.5 | 2 | 10 | 0.10 | 2.5 | 4 |
  | Haiku 5.5 | 0.10 | 0.50 | 0.01 | 0.125 | 0.20 |
  | Haiku 5.5, prompt ≥ 100,000 tokens | 0.50 | 2.50 | 0.05 | 0.625 | 1.00 |

## Tasks

### Task 1: The usage meter mod
- **Files:**
  - `plugins/aether/hooks/register.js`;
  - `plugins/aether/hooks/hooks.json` (adds `"modules": ["./register.js"]`);
  - `plugins/aether/hooks/usage.test.ts`;
  - `.gitignore` (the types and `tsconfig.json` that Claude Code generates in the plugin directory).
- **Contract:**
  - One entry per request: `{ t, ms, agent, model, input, output, cacheRead, cacheWrite }`. `t` is the time the request ended, `ms` its duration, and `agent` the agent id, or `null` for the main session.
  - Part files live at `<dataDir>/usage/<session>/<n>.json`, as `{ session, part, claudeCode, agents, entries }`, with up to 1,000 entries per part. `agents` maps an agent id to `{ type, description }`, learned from `agent.spawn`.
  - A module instance starts after the parts already on disk, so a reload never overwrites them.
  - Flushes are serialized. They happen on `turn.complete`, on `session.end`, and after every 20 new entries.
  - A failing write is logged nowhere and changes nothing.
- **Tests** (`claude plugin test plugins/aether`):
  1. Main and agent requests are recorded, the agent's type comes from `agent.spawn`, and `turn.complete` writes part 0.
  2. `AETHER_DATA_DIR` overrides the directory.
  3. Existing parts are kept: the next part number follows them.
  4. More than 1,000 entries roll over to a second part.
  5. A failing `fs.write` leaves the request's result unchanged.
- **Check:** `claude plugin validate plugins/aether --strict`.

### Task 2: Prices
- **Files:** `plugins/aether/config/prices.json`, `plugins/aether/lib/prices.js`, `tests/prices.test.js`.
- **Contract:**
  - `priceEntry(entry, prices)` returns USD. The prompt is `input + cacheRead + cacheWrite`. A model's `longPrompt` tier applies when the prompt reaches its `minPromptTokens`.
  - Cache writes use the 1-hour price for the main session and the 5-minute price for agents (`cacheWriteTtl`), as Claude Code bills them (Phase 0). The usage does not split them.
  - Model ids are matched by family (`opus`, `sonnet`, `haiku`) when no exact id is listed. An unknown model costs `null` and is reported.
- **Tests:**
  - The prices of each model and of each cache TTL;
  - the Haiku tier at 99,999 and at 100,000 prompt tokens;
  - an unknown model.

### Task 3: `aether-report`
- **Files:** `plugins/aether/lib/report.js`, `plugins/aether/bin/aether-report`, `tests/report.test.js`, `tests/aether-report.test.js`.
- **Contract:**
  - `aether-report --run <id> [--session <id>] [--no-tests]` prints JSON:
    - `speed`: the run window and the session's span;
    - `cost`: USD and tokens by model and by role, for the run window and for the whole session;
    - `quality`: unit counts, escalations, supervisor findings by severity, the final review, and tests at integration;
    - `usage`: the session and the entry count.
  - The run window runs from `state.json` `compiledAt` to the time `result.json` was saved, or to now.
  - Without `--session`, the report picks the usage session with the most `aether:` agent requests in the window.
  - Tests at integration run the plan's test command in the integration worktree, unless `--no-tests`.
  - `aether-report finalize --run <id>` computes the report, appends a record to `<dataDir>/runs.jsonl`, then runs `sweepRun(..., { finish: true })`. The record holds `status: "finalized"`, the report, and the aether, superpowers and Claude Code versions.
  - `aether-report price <claude-json>` prices the `modelUsage` of a `claude -p --output-format json` output at OpenRouter prices, next to Claude Code's own `costUSD`. It is the cross-check, and it measures sessions without the plugin.
- **Tests:** a fixture run with a saved result and synthetic usage files covers:
  - the window and the session choice;
  - costs by model and by role;
  - quality counts;
  - test results at integration;
  - finalize writing the record and leaving nothing behind;
  - `price` on a sample output;
  - errors: a missing run and missing usage.

### Task 4: Skills and spec
- **Files:**
  - `plugins/aether/skills/swarm/SKILL.md`: report after a run; `finalize` replaces `sweep --finish`;
  - `plugins/aether/skills/using-aether/SKILL.md`, if it needs to change;
  - the spec (§3, §9, §10, §13).

### Task 5: Cleanup after a killed run (v0.1 acceptance)
- **Procedure:**
  1. Run a real headless swarm on a throwaway fixture, and kill the session while units are working.
  2. Record what is left behind.
  3. Age the leftovers past 24 hours, start a new session with the plugin, and check that the SessionStart sweep removes them and writes an `abandoned` record.
- **Rules:**
  - Never `cd` into the fixture, so that it can be deleted afterwards.
  - Delete the fixture and the session folders when done.

### Task 6: Trial
- **Fixture:** a Node.js project with no dependencies, a spec, and a contract plan of at least 6 tasks in at least 2 waves across 2 areas.
  - A hidden acceptance suite, written by the Designer and kept outside the fixture during the runs, measures quality the same way for both modes.
  - The integration branch and worktree are created before each run.
- **Runs:** two fresh headless sessions on Opus, with superpowers on, MCP connectors off, bypassed permissions, a timeout and `--max-budget-usd`.
  - **Aether mode:** the plugin and `enableWorkflows`. The Designer follows the `swarm` skill up to `finalize`, then stops before `finishing-a-development-branch`.
  - **Normal mode:** without the plugin. superpowers `subagent-driven-development`, including its final review and fixes; no merge.
- **Measures:**
  - wall-clock time;
  - cost at OpenRouter prices, from `aether-report price` for both runs, with the meter's per-role breakdown for Aether mode;
  - quality: the hidden suite, the fixture's own tests, and the open final-review findings.
- **Output:** `docs/evaluations/2026-10-08-trial-1.md`, with the A9 verdict.

### Task 7: Documents, review and release
- **Documents:**
  - README rewrite: what Aether Plugin is, how to use it, status and trial results;
  - `docs/decisions.md` (§15 list);
  - the research doc: prices and the runtime findings of Plans 2 and 3;
  - the spec amendment.
- **Review and merge:** a self-review of the whole branch, fixes made with TDD, and the merge to `main`.
- **Release:** `claude plugin tag plugins/aether` (`aether--v0.1.0`).

## Done when

- `node --test "tests/*.test.js"` and `claude plugin test plugins/aether` are green.
- Strict validation passes.
- The killed-run cleanup and the trial are recorded.
- The documents are current.
- `main` holds the work, and the tag exists.

## Execution record

### Measurement smoke run (2026-10-08)

A real headless swarm ran on a two-task fixture, with the plugin, a Sonnet main session, and `AETHER_DATA_DIR` inside the fixture.

- **The meter:**
  - It recorded 34 requests and learned every workflow agent's type (`aether:implementer`, `aether:supervisor`, `aether:ops`, `aether:reviewer`) and its label from `agent.spawn`.
  - Its token totals match Claude Code's `modelUsage` exactly, model by model.
- **The report:**
  - It picked the right session and timed the swarm at 58.5 s, inside a session of 88 s.
  - It priced the run at $0.298, against Claude Code's list cost of $0.307. The rates are the same as OpenRouter's. The 3% gap is the cache-write lifetime, which the usage does not split: Claude Code bills some agents' cache writes at the 1-hour rate as well.
  - Decision: comparisons use Claude Code's `costUSD`, which knows the real lifetimes, and the meter supplies the breakdown by role.
- **`finalize`:** it wrote the record with the aether 0.1.0, superpowers 6.4.1 and Claude Code 2.1.294 versions, and left no run directory, worktree or `aether/*` branch.

### Cleanup after a killed run (v0.1 acceptance)

- **A run killed while its units worked:**
  - The session's process group got SIGTERM 17 s after launch.
  - It left two unit worktrees, each with one unmerged commit, their two `aether/*` branches, and the run directory. The workflow's `finally` does not run when the process dies.
  - Nothing moved afterwards.
- **Swept by a new session:** the leftovers were aged past 24 hours, and a new headless session with the plugin was started in the repository. Its SessionStart sweep removed both worktrees, both branches and the run directory. It wrote an `abandoned` record with both branch tips, and both commits stay recoverable.
- **A run killed late:** this run was killed after its units had merged and closed. It left only its run directory and an empty worktrees folder, and the same sweep removed both.
- **An active run is kept:** in the first attempt the kill missed (`setsid` had forked), so the run kept working. The sweep left that run alone because its files were still changing. This is the intended protection.
- **Not Aether's files:** Claude Code keeps each workflow's state under `~/.claude/projects/<project>/<session>/workflows/`, even with `--no-session-persistence`. It cleans them by `cleanupPeriodDays`. The trial's harness deletes the folders its sessions create.

## Post-review record (2026-10-08)

**Execution.** The Designer implemented every task inline, with TDD and without delegation.
- Each test was watched failing first.
- The mod's tests run with `claude plugin test`; everything else runs with `node --test`.
- A spike on a throwaway mod confirmed the event shapes before the meter was written. The spike was deleted afterwards.

**Rulings made during execution.** Each ruling ends with its cost if it proves wrong.
- **Usage files:** one directory per session, in parts of 1,000 entries, instead of a single `usage-<session>.json`. One file would hit the mod API's 4 MiB write limit in a long session, and a reloaded mod would overwrite it. *Cost if wrong:* the report reads a directory instead of a file.
- **Measuring relaunches:** a relaunch keeps the run's first compile time and archives the previous result as `result-<k>.json`, and the report adds the launches up. The plan said nothing about relaunches, but without this a relaunch would hide the first launch's cost and outcomes. *Cost if wrong:* a small rename in `aether-plan`.
- **The trial's cost figure:** the trial compares Claude Code's `costUSD`, and the meter's OpenRouter pricing serves as the breakdown. They use the same rates, but only `costUSD` knows the real cache-write lifetimes (see the execution record). *Cost if wrong:* the two figures differ by about 3–5%.
- **`aether-report price`:** added to price sessions that run without the plugin, which the trial's normal mode needs. *Cost if wrong:* one small command to drop.

**Review.** A self-review of the whole branch by the Designer, without delegation, as the owner asked, with two findings taken from the trial itself.

**Fixes** (`a9eaf2c`, node suite 110/110, mod tests 5/5):

| Id | Fix |
|---|---|
| R1 | The usage files grew without bound, and the report read them all. The report now reads only the sessions written to since the run began, and the SessionStart hook deletes usage sessions not written to for 30 days. Tests: "report reads only the usage sessions written to since the run began", "pruneUsage deletes …" and "session start deletes usage sessions older than 30 days" (RED → GREEN) |
| R2 | In the trial, the Designer passed the compiled JSON quoted once more, and the workflow refused its first launch. The workflow now unwraps up to two layers of JSON. Test: "args encoded as JSON twice still run …" (RED → GREEN) |
| R3 | In the trial, the Designer ran `finalize` before its last fix, so the record missed that fix. The `swarm` skill now says that `finalize` records the run as it stands, so the critical and important findings come first. This fix is in the prompt only |

**Deferred minors:**
- **Meter memory:** the meter keeps every entry of the session in memory, including parts already written.
- **Cache-write lifetimes:** the report prices them with the main-session/agent heuristic, about 3% low against `costUSD`.
- **`--session`:** when it names a session last written before the run began, the report says "not found".
- **Missing integration worktree:** the tests then report exit code `null`, with no note saying why.
- **Opus fast mode:** fast-mode requests are priced at normal rates.

**Earlier deferred minors closed in Plan 3.** Each was fixed with a test that failed first, except the documentation change.

| Commit | Minor | Plan |
|---|---|---|
| `428af09` | Workflow args that list a task twice are refused | 2 |
| `e5eb72c` | A sweep saves each unit's unmerged or uncommitted work as a patch, and keeps a unit it cannot save, so two failed closes no longer lose work | 2 |
| `af5b9a1` | A merge with a missing integration worktree says so, instead of a bare `ENOENT` | 1 |
| `ad90e11` | A merge that git refuses before merging is `merge-failed`, not `conflict` | 1 |
| `d6aeffb` | The git excludes are anchored to the worktree root, and the old unanchored lines are replaced | 1 |
| `35662ca` | The `swarm` skill explains `closeError` | 2 |

**Still deferred from earlier plans:**
- **Parser strictness**, such as other dashes, the case of `Area`, and fenced `**Spec:**`.
- **Repository layouts:** bare repositories, separate git directories and submodules.
- **Git's locale:** git is not translated on this machine, so no test can fail first.
- **A `Setup command` field.**
- **Permissions outside bypass mode**, still unverified.
- **`reset --hard` after failed tests:** no change needed. The merge refuses a dirty integration worktree, so the reset only undoes the merge's own commit.
