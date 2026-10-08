# Aether Plan 2: Swarm Implementation Plan

> Executed inline by the Designer with TDD. The owner asked for direct work without delegation (2026-10-08), so this plan lists the contract (files, interfaces, tests, acceptance) and the code lives in the commits, not here.

**Goal:** Make the swarm run: `/aether:run` executes a compiled plan in parallel waves, with escalation, supervision, serialized merges, a final review, and cleanup.

**Architecture:**
- A plugin workflow (`workflows/run.workflow.js`) holds the loop in code.
- Four plugin agents do the judgment and the shell work:
  - `implementer` (Haiku by default);
  - `supervisor` (Sonnet, per unit);
  - `reviewer` (Opus, final review);
  - `ops` (Haiku, runs one `aether-wt` command, because a workflow script has no shell).
- A Node harness runs the script body with stubbed runtime functions, so the loop is tested without tokens.

**Spec:** `docs/superpowers/specs/2026-10-07-aether-plugin-design.md`, §4, §7 and §8, plus the amendment in Task 5.

## Global Constraints

- The Plan 1 constraints still apply:
  - Node.js 22, CommonJS, no dependencies;
  - Aether only touches `.aether/` paths and `aether/` branches.
- Workflow runtime rules (Phase 0):
  - `agent(prompt, { agentType, model, phase, label, schema })`, with an `agentType` on every call;
  - `parallel([thunks])`;
  - `phase(title)`, `log(msg)` and `args`;
  - no `Date.now()`, `Math.random()`, `import()` or file system access in the script;
  - `export const meta` must be the first statement.
- Ladder per unit: the plan's `ladder` (default haiku 2, sonnet 2, opus 1), then blocked. A merge conflict or a test failure retries once, then blocks.

## Tasks

### Task 1: Record the integration base at compile time
- **Files:** `plugins/aether/bin/aether-plan`, `tests/aether-plan.test.js`.
- **Contract:** `compile` adds `integration.base`, the integration worktree's HEAD SHA. The final reviewer diffs `base..HEAD`.
- **Test:** the compile test asserts `integration` deep-equals `{ branch, worktree, base: <HEAD sha> }`.

### Task 2: `aether-wt sweep --run <id> --finish`
- **Files:** `plugins/aether/lib/worktrees.js`, `plugins/aether/bin/aether-wt`, `tests/worktrees-cleanup.test.js`, `tests/aether-wt.test.js`.
- **Contract:** `sweepRun(cwd, runId, { finish })`. With `finish`, it also deletes `.aether/runs/<id>/`, after `assertInside`. This closes A7 for a finished run until Plan 3's `finalize`.
- **Tests:**
  - `sweepRun` with `finish` removes the run directory;
  - without it, the run directory stays.

### Task 3: The workflow and its harness
- **Files:** `plugins/aether/workflows/run.workflow.js`, `tests/workflow-harness.js`, `tests/workflow.test.js`.
- **Contract:**
  - **Input:** the compile args, as an object or a JSON string. Missing fields throw before any agent runs.
  - **Waves:** waves run in order and the units of a wave in parallel. A unit whose dependency is not merged is `skipped`.
  - **Unit loop:**
    - The implementer runs on the current tier.
    - `NEEDS_CONTEXT` or `BLOCKED` blocks the unit with the implementer's question.
    - Otherwise the supervisor returns `approve | retry | escalate | block`, plus findings, a ruling and an optional question.
    - The script enforces the ladder: a retry beyond the tier's budget escalates, and an escalation past the last tier with budget blocks.
  - **Merge:** approved units merge through `ops` with `aether-wt merge`, serialized by a promise chain.
    - `conflict` or `tests`: one retry with that context, then block.
    - `ownership` or `empty`: a failed attempt, handled by the ladder.
    - `dirty-integration`, `wrong-branch` or an ops failure: block.
  - **Close:** every unit that started is closed with `aether-wt remove`, which saves a patch automatically for unmerged work.
  - **Final review:** the reviewer (Opus) runs once if any unit merged and the budget allows.
  - **Cleanup:** `aether-wt sweep --run <id>` runs in `finally`.
  - **Result:** `{ runId, units: [...], finalReview, cleanup, agents, error }`.
  - **Budget:** after `maxAgents` agents, no new attempt starts and units become `not-run`. Cleanup still runs.
- **Tests (harness, scripted agents):**
  1. Two waves, all approved: every unit is merged, the dependent unit runs after its dependency merged, at most one merge runs at a time, there is one final review on Opus, and cleanup comes last.
  2. Escalation: the supervisor asks for two retries on Haiku, so the unit escalates to Sonnet and merges, with tiers `['haiku', 'sonnet']`.
  3. `NEEDS_CONTEXT` blocks with the question, the dependent unit is skipped, and the blocked unit is removed with its patch reported.
  4. A conflict twice gives one retry, then blocked.
  5. A small `maxAgents` leaves units `not-run`, and cleanup still runs.
  6. A failing final reviewer still yields a result and cleanup; missing args throw.

### Task 4: Agents, notice and skills
- **Files:**
  - `plugins/aether/agents/{implementer,supervisor,reviewer,ops}.md`;
  - `plugins/aether/NOTICE`;
  - `plugins/aether/skills/swarm/SKILL.md`;
  - `plugins/aether/skills/using-aether/SKILL.md`.
- **Contract:**
  - Agent frontmatter per spec §8 (model, effort, maxTurns, tools). The `ops` agent has Bash only. `supervisor` and `reviewer` are read-only.
  - `NOTICE` credits superpowers (MIT, Copyright (c) 2025 Jesse Vincent) for the adapted implementer statuses and review structure.
  - The `swarm` skill gives the Designer's procedure: prepare, check, compile, launch, read the result, relaunch, finish.
  - `using-aether` offers the swarm at the plan handoff.
- **Checks:**
  - `claude plugin validate plugins/aether --strict`;
  - the session-start test still passes.

### Task 5: Spec amendment and a real smoke run
- **Files:** the spec (§4, §7), and the README status line.
- **Contract:** the spec records the simplifications:
  - one supervisor call per attempt, which merges review and triage;
  - the supervisor's memory is the script state, not ledger files;
  - the merge-failure routing listed above;
  - `integration.base`;
  - `sweep --finish`.
- **Smoke run:**
  - Set up a throwaway fixture repository with two independent tasks.
  - Run `/aether:run` through a headless session with `enableWorkflows`.
  - Expect both units merged, tests green on the integration branch, no Aether worktrees or `aether/*` branches left, and the run directory removed by `sweep --finish`.
  - Delete the fixture afterwards.

## Done when

- `node --test "tests/*.test.js"` is green.
- Strict validation passes.
- The smoke run meets its expectations.
- The Designer has self-reviewed the branch, and the branch is merged to `main`.

## Smoke run record (2026-10-08)

- **Fixture:** a throwaway Node.js repository with a two-task contract plan (`slugify` and `countWords`), in one wave, on Haiku, in area `text`. The integration worktree was separate from the main checkout, as superpowers creates one.
- **Session:** headless `claude -p` on Sonnet, with the plugin, `enableWorkflows` and bypassed permissions. superpowers and the MCP connectors were off.
- **Outcome:**
  - Both units merged on their first Haiku attempt. The supervisor approved both, with one minor finding.
  - The Opus final review returned `ready-with-fixes`, with three minor findings and five declined-to-judge lines.
  - `node --test` passed 5/5 on the integration branch.
  - No Aether worktree or `aether/*` branch was left, and `aether-wt sweep --run <id> --finish` emptied `.aether/runs/`.
- **Agents:** 11 in total: 2 implementers, 2 supervisors, 6 ops and 1 reviewer. By model: 8 Haiku, 2 Sonnet and 1 Opus.
- **Time:** about 1 min 40 s of wall clock, from compile to result.
- **Cost at list prices** (Claude Code's `costUSD`): $0.315 in total.
  - Sonnet $0.191: the main session and the supervisors.
  - Opus $0.117: the final review.
  - Haiku $0.007: the implementers and ops.
- **For Plan 3:** on a plan this small, review is the cost. The supervisors and the final review cost about 40 times what the Haiku implementers did, which matches the risk in spec §14. The trial must measure this on a larger plan before the review policy changes.

## Post-review record (2026-10-08)

**Execution.** The Designer implemented every task inline, with TDD and without delegation, as the owner asked. Each test was watched failing first. For the workflow, three deliberate mutations confirmed that its tests catch defects:
- merges not serialized;
- no approval gate;
- a merge retry that spends the ladder.

**Rulings made during execution.** Each ruling ends with its cost if it proves wrong.
- `aether-wt diff <run> --final` was added, though the plan did not list it, so the read-only Opus reviewer can see `base..HEAD`. *Cost if wrong:* one small command to drop.
- `NEEDS_CONTEXT` and `BLOCKED` reports go to the supervisor (spec §7) instead of blocking at once. A supervisor can answer from the brief or the repository, or escalate. *Cost if wrong:* one Sonnet call per such report.
- There are no report or area-ledger files. Reports travel in the implementers' structured output, and each area's memory is its last ten rulings, kept by the script. *Cost if wrong:* per-attempt reports are not on disk for a relaunch, though the result carries them.
- The implementer writes its own review package, and the read-only supervisor checks that the package's Head matches the reported commit. This saves one ops agent per attempt. *Cost if wrong:* a stale package costs one retry.
- The one retry after a conflict or failing merge tests runs on the same tier, outside the ladder. *Cost if wrong:* at most one extra attempt per unit.
- Merges and closes share one queue. A failed close or sweep is retried once. The workflow's sweep keeps the run directory, so blocked units' patches survive. *Cost if wrong:* closes wait behind a merge's test run.
- Agent budgets differ from the first draft of spec §8: supervisor 25 turns, final reviewer 30, ops effort `low`. The spec now records them. *Cost if wrong:* a few turns or a little reasoning per call.

**Review.** A self-review of the whole branch, `f9f91d1..089afc6`, by the Designer: the owner asked for no delegation. An author's self-review is weaker than an independent one; the owner can ask for an independent review before relying on the swarm.

**Fixes** (`1ad09fc`, suite 87/87):

| Id | Fix |
|---|---|
| R1 | `aether-plan compile` warns when the integration worktree is the main checkout. In that case the unit worktrees under `.aether/worktrees/` sit inside it, and a test command that searches the whole tree runs their unfinished tests at merge time. Test: "compile warns when the integration worktree is the main checkout, and not from a linked worktree" (RED → GREEN) |
| R2 | The implementer sets up its fresh worktree before it runs any test, for example with `npm ci`. This fix is in the prompt only: plans have no setup-command field yet |
| R3 | The `swarm` skill asks for a separate integration worktree. When the session started inside the integration worktree, it also asks to add the main checkout with `/add-dir`. Behavior outside bypass mode is unverified |

**Deferred minors** (for Plan 3 or later):
- **Duplicate task ids:** duplicate ids in the args are not rejected.
- **Failed closes:** `closeError` is not described in the skill or the spec. After two failed closes, the final sweep deletes the unit's branch without a patch.
- **Permissions:** workflow agents' behavior outside bypass mode is not yet verified. Plan 3's trial should run in the owner's normal permission mode.
- **Timing:** `claude -p` reports the main turn's `duration_ms`, not the workflow's wall clock. `aether-report` must time the run itself.
- **Review cost:** on small plans, review dominates the cost. In the smoke run, the supervisors and the final review cost about 40 times what the implementers did. The trial measures this on a larger plan.
- **Setup command:** a `Setup command` field in Aether Execution would let `ensure` prepare unit worktrees in code instead of by prompt.
