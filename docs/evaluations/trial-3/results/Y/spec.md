# Aether: effort per task (design spec, v0.2)

- **Date:** 2026-10-08
- **Status:** Designed with the owner on 2026-10-08, section by section, and approved by the owner the same day. Plan 4 implements it.
- **Method:** superpowers brainstorming (architectural path), then superpowers `writing-plans`.
- **Amends:** the [v0.1 design spec](2026-10-07-aether-plugin-design.md), §6, §7, §8, §10 and §12. Plan 4's documents task folds these changes into it.
- **Background:** [Claude Code research](../../claude-code-research.md), [Decisions](../../decisions.md), [Trial 1](../../evaluations/2026-10-08-trial-1.md)

## 1. Summary

Each plan task declares the reasoning effort its implementer starts at, next to its model, and may raise the effort of its supervisor. The swarm passes the effort on every implementer and supervisor call, and its ladder raises the effort before it raises the model.

- The defaults come from Artificial Analysis data: Haiku implements at `xhigh`, Sonnet at `high` and Opus at `xhigh`, and supervisors review at `high`.
- `max` runs only where a plan declares it.
- Plans written for v0.1 run unchanged, on the defaults.
- The usage meter records the effort of every request, and `aether-report` shows cost and time by effort.
- A real run checks, from the transcripts, that each call's effort reaches its agent.

## 2. Requirements

Set by the owner on 2026-10-08:

| ID | Requirement |
|---|---|
| R1 | Haiku implements at `xhigh` by default. |
| R2 | Sonnet never implements at `low` or `medium`: Haiku at `xhigh` does as well for much less. |
| R3 | Each task's effort is chosen by its complexity, and the plan declares it. |
| R4 | The ladder raises the effort first and the model second, where the data supports it. |
| R5 | `max` is never a default, because of its latency. A plan may declare it. |
| R6 | The supervisor's effort can be raised, to close the review-depth gap that trial 1 found. It is not fixed. |
| R7 | Plans that only give a tier keep working, on defaults. |
| R8 | The usage meter records each agent's effort, and `aether-report` shows it. |
| R9 | A minimal real run checks, from the transcripts, that each call's effort reaches the agent. An agent file's effort is only the default. |
| R10 | Ops stays at `low`. The design stays as simple as it can, and superpowers stays the method. |

## 3. Evidence

**Today.** `implementer.md` sets `effort: medium`, and the workflow changes only the model per tier. So every implementer runs at `medium`, on Sonnet and Opus too. The transcripts of the trial 2 swarm run (2026-10-08) confirm it:

| Agent | Model | Effort recorded |
|---|---|---|
| implementer | Haiku, Sonnet | medium |
| supervisor | Sonnet | high |
| final reviewer | Opus | high |
| ops | Haiku | low |

In that run, five units ran on Sonnet at `medium`. The supervisors approved all of them, one after a retry. The Opus final review returned `not-ready`, with 2 critical and 3 important findings. This does not prove the cause, but it is the case this design addresses.

**Data.** Artificial Analysis, as given by the owner on 2026-10-08. Each cell gives the Intelligence Index, the Terminal-Bench 4 score (TB4) and the seconds of thinking before the answer.

| | low | medium | high | xhigh | max |
|---|---|---|---|---|---|
| Haiku 5.5 | 29.4 / 13 / 4 | 34.5 / 15 / 9 | 37.8 / 22 / 15 | 41.2 / 29 / 47 | 43.4 / 33 / 278 |
| Sonnet 5.5 | 35.9 / 21 / 1 | 40.8 / 30 / 1 | 46.8 / 44 / 7 | 51.9 / 57 / 15 | 56.0 / 64 / 271 |
| Opus 5.5 | 42.3 / 31 / 5 | 51.2 / 53 / 13 | 53.6 / 57 / 20 | 56.0 / 60 / 78 | 57.6 / 60 / 561 |

**Reading.**
- `max` adds 0 to 7 TB4 points for 6 to 18 times the thinking time. It does not suit a swarm by default.
- Haiku at `xhigh` matches Sonnet at `medium` (41.2 / 29 against 40.8 / 30) at a twentieth of the token price, but thinks for 47 s against 1 s. Raising Haiku costs time and almost no money: in trial 1, all implementers together cost $0.10.
- Four options are dominated: a cheaper option scores as well or better.
  - Sonnet at `low` or `medium`: Haiku at `xhigh`.
  - Opus at `low` or `medium`: Sonnet at `high` or `xhigh`, at half Opus's price.
- Sonnet at `xhigh` ties Opus at `high` on TB4 (57), at half the price. Escalating from Sonnet `xhigh` to Opus `high` would gain little. Opus at `xhigh` gains 3 TB4 points and 4.1 index points.

**The default ladder.** With the v0.1 budgets (haiku 2, sonnet 2, opus 1), a unit that keeps failing runs haiku/xhigh, haiku/xhigh, sonnet/high, sonnet/xhigh and opus/xhigh. TB4 along it: 29, 29, 44, 57, 60.

## 4. Effort policy

The policy lives only in `lib/plan.js`. `aether-plan` validates plans against it and passes it to the workflow in the run arguments.

| Role | Allowed, in climbing order | Default |
|---|---|---|
| Implementer on haiku | medium, high, xhigh | xhigh |
| Implementer on sonnet | high, xhigh | high |
| Implementer on opus | high, xhigh | xhigh |
| Supervisor (Sonnet) | high, xhigh | high |

- The levels are Claude Code's: `low`, `medium`, `high`, `xhigh` and `max`.
- `max` is accepted in every row, but only when the plan declares it. It is never a default and never a climbing step.
- Haiku has no step above `xhigh`, because `max`'s latency rules it out. A Haiku unit at `xhigh` therefore retries at `xhigh`, then moves to Sonnet.
- Ops (`low`) and the final reviewer (`high`) keep the efforts of their agent files. They are outside the policy.

## 5. Plan format

The Aether block of each task:

```markdown
**Aether:**
- Tier: sonnet xhigh — four modules meet here, and the tests leave the order open
- Review: xhigh — file-system edge cases the tests do not cover
- Area: core
- Owns: `src/store/**`
- Depends on: none
```

- **Tier:** `<tier> [<effort>] — <reason>`. The effort is optional for the parser; without it, the tier's default applies. The reason covers both choices.
- **Review:** `<effort> — <reason>`, optional. It sets the supervisor's effort for every attempt at the task. Without it, the supervisor reviews at `high`.
- `## Aether Execution` does not change. `Ladder:` still counts attempts per model.

**Validation.** `aether-plan check` and `compile` give one message per problem, naming the task, the value, the allowed values and the reason. They refuse:
- an effort a tier does not allow:
  - Haiku at `low`: too weak to implement, at 13 on TB4;
  - Sonnet at `low` or `medium`: Haiku at `xhigh` does as well for a twentieth of the price;
  - Opus at `low` or `medium`: Sonnet at `high` or `xhigh` does better for half the price;
- a Review below `high`;
- a word that is not an effort level, or a Review line without its reason.

**Plans written for v0.1** run unchanged, on the defaults. Their behavior changes on purpose: Haiku tasks run at `xhigh` instead of `medium`, and Sonnet tasks at `high` instead of `medium`.

**The Designer's rubric** (in `using-aether`). The Designer declares the effort on every new task, so that each task's complexity is weighed:
- **haiku**, default `xhigh`: declare `high` or `medium` for mechanical work, such as constants, wiring or renames, where speed matters more.
- **sonnet**, default `high`: declare `xhigh` when several modules meet, or when the logic is subtle and the tests leave it open.
- **opus**, default `xhigh`: declare `high` when the risk is clear-cut and speed matters.
- **Review: xhigh** when behavior beyond the tests matters: the file system, input parsing, security, data loss, concurrency or UI states.
- **max** only with a reason: it thinks for 4 to 9 minutes before each answer.

## 6. Compile

- Each task in the run arguments gains two fields, both resolved to a level:
  - `effort`: its implementer's starting effort;
  - `review`: its supervisor's effort.
- The arguments gain `efforts`, the implementer policy:

  ```json
  "efforts": {
    "haiku": { "steps": ["medium", "high", "xhigh"], "default": "xhigh" },
    "sonnet": { "steps": ["high", "xhigh"], "default": "high" },
    "opus": { "steps": ["high", "xhigh"], "default": "xhigh" }
  }
  ```

  The workflow climbs with the same table that validated the plan, and `graph.json` keeps the policy each run used.
- The brief's header shows the resolved starting point, such as `- Tier: sonnet xhigh — <reason>`. The task text below it keeps the plan's own lines.

## 7. Workflow

**Effort per call.**
- **Implementer:** the effort of the unit's current attempt (below).
- **Supervisor:** the task's `review`.
- **Ops and the final reviewer:** the workflow passes no effort, so their agent files apply: `low` and `high`.
- **Agent files:** `implementer.md` changes from `medium` to `xhigh`, Haiku's default, since its model is Haiku. The other files keep their values. A file's effort applies only to a call that names none.

**The effort of an attempt** comes from what the script already counts: the current model and the attempts used on it. It needs no new state.
- The first attempt on a model runs at the task's declared effort when the model is the task's tier, and at the model's default otherwise.
- Each later attempt on the same model runs one step higher, up to the last step. This covers:
  - a retry;
  - an approval with a blocking finding;
  - a failed agent;
  - a merge refused for files outside Owns, or for no commits.
- When the model's attempts run out, or the supervisor escalates, the unit moves to the next model with attempts, at its default effort. A retry raises the effort; an escalation raises the model.
- The one retry after a merge conflict or failing merge tests stays outside the ladder, as in v0.1: same model, same effort.
- A declared `max` stays at `max` for every attempt on its model.

**Labels** carry the requested effort, such as `task-2: implement on sonnet/xhigh (attempt 2)` and `task-2: supervise attempt 2 on sonnet/high`. Ops and reviewer labels name none.

**Result.** Each round gains `effort`, the implementer's, and `reviewEffort`, the supervisor's, or null when no supervisor ran. `tiers` stays the path of models, so the report's escalation count keeps its meaning.

**Prompts.**
- The implementer's prompt and the lines on earlier attempts name the rung, such as "attempt 2 on sonnet/xhigh".
- The supervisor's prompt names the rung it reviews. Its Ladder section says what each verdict would run next, such as "A retry runs on sonnet at xhigh. Escalate runs on opus at xhigh." When a verdict would block the unit, the section says so.
- `supervisor.md` explains the new ladder: a retry stays on the same model, one effort step higher; an escalation moves to the next model, at its default.
- The final reviewer sees the rungs each unit went through.

**Argument checks.** Before any agent starts, the workflow refuses:
- `efforts` without a valid `steps` list and a `default` among them, for each tier;
- a task whose `effort` is neither one of its tier's steps nor `max`;
- a task whose `review` is not an effort level.

## 8. Measurement

**Usage meter** (`hooks/register.js`).
- Each entry gains `effort`, taken from the `turn.step` event, which carries it. So the meter records the effort each request went out with, which may differ from the one requested.
- Entries written before this change have none, and the report counts them as `unknown`. The rest of the file format does not change.

**Report** (`aether-report`).
- `cost.run` and `cost.session` gain `byEffort`, keyed `<role> <model> <effort>`, such as `aether:implementer claude-haiku-5-5 xhigh`. The main session's role is `main`, and a missing model or effort reads `unknown`. Each key gives:
  - `usd` and `requests`;
  - `outputTokens`: thinking is billed as output, so this is what the effort costs in tokens;
  - `ms`: the summed duration of its requests. This is model time, not wall-clock time, because agents run in parallel.
- `byModel` and `byRole` do not change, so the records already in `runs.jsonl` stay comparable.
- `quality` gains `climbed`: the units that, in any launch, made an attempt at a higher effort than the attempt before it on the same model. Next to `escalated`, it shows how much work each half of the ladder did.
- `finalize` records all of this in `runs.jsonl`, with no change of its own.

**The `swarm` skill** asks the Designer to report cost and time by effort, and the climbs next to the escalations.

## 9. Verification run

A minimal real run checks that each call's effort reaches its agent (R9).

- **Fixture.** A throwaway repository with a tiny Node project, its integration worktree on a feature branch, and a two-task plan in one wave:
  - task 1, `Tier: haiku` with no effort and no Review: implementer `xhigh`, supervisor `high`;
  - task 2, `Tier: sonnet high` with `Review: xhigh`: implementer `high`, supervisor `xhigh`.

  Task 2 requests efforts that differ from both agent files, so it shows that the call wins. Ops and the final reviewer request none, so they show that the file is the default.
- **Session.** Headless `claude -p` in Aether mode, as in trial 1: permissions bypassed, a spending cap, and no MCP connectors.
- **Check.** `scripts/check-effort.js <session dir>` reads the workflow agents under the session's `subagents/workflows/`:
  - from each `agent-*.meta.json`, the `agentType` and the label (`description`);
  - from each assistant row of the agent's transcript, the recorded `effort` and `message.model`.

  It expects the effort after `on <model>/` in the label, or the agent file's effort when the label names none. It prints one line of JSON with one entry per agent, and exits with an error on any mismatch, or when it finds no workflow agent. With `--report <file>`, it also checks that the `aether:` keys of the report's `cost.run.byEffort` match the role, model and effort triples of the transcripts.
- **Record.** The finding goes to the research doc. The run is finalized, and the fixture is deleted.

**Fallback.** If a call's effort does not reach its agent, the fix is one agent definition per effort level for the implementer and the supervisor, chosen by `agentType`. That would be a follow-up plan.

## 10. Testing

Test first. `npm run check` runs `node --test`, `claude plugin test` and `claude plugin validate --strict`.
- **Plans** (`plan.test.js`, `aether-plan.test.js`):
  - Tier with and without an effort, and Review;
  - the defaults, and a declared `max`;
  - each refusal and its message;
  - the existing fixtures, unchanged;
  - the brief header and the new arguments.
- **Workflow** (`workflow.test.js`; the harness records each call's `effort`):
  - a default Haiku unit: implementer `xhigh`, supervisor `high`, and no effort for ops and the reviewer;
  - `sonnet high` with `Review: xhigh`: implementer `high`, supervisor `xhigh`;
  - a retry climbs (Sonnet `high` → `xhigh`) and stops at the top (Haiku stays at `xhigh`);
  - a spent model and an escalation both move to the next model's default;
  - the merge retry keeps the model and the effort, and a declared `max` stays `max`;
  - rounds and labels carry the effort;
  - invalid efforts in the arguments are refused before any agent starts.
- **Meter** (`usage.test.ts`): an entry records the event's effort, or null.
- **Report** (`report.test.js`): `byEffort`, the `unknown` key and `climbed`.
- **Check script** (`check-effort.test.js`): a matching agent and a mismatching one, with fixture transcripts.

## 11. Risks

- **The effort may not reach the agent.** The verification run settles it, and §9 gives the fallback.
- **Wall-clock time.** Haiku at `xhigh` thinks about five times longer than at `medium` (47 s against 9 s in the data). The swarm's span grows, and `byEffort` shows by how much.
- **Cost.** Sonnet implementers start at `high` instead of `medium`, Opus implementers at `xhigh`, and declared reviews run at `xhigh`. `byEffort` shows the cost of each.
- **Transcript format.** `check-effort.js` reads Claude Code's own files, which can change between releases. It is a development tool, not part of the plugin.

## 12. Documents

- **This spec.** Plan 4's documents task amends §6, §7, §8, §10 and §12 of the v0.1 spec, as Plans 2 and 3 did.
- **`docs/decisions.md`:** A11, the effort policy, and an update to D5: the task chooses the model and its effort.
- **`docs/claude-code-research.md`:** the Artificial Analysis data with its date, the transcript fields, and the verification run's finding.
- **The plugin's documents:**
  - `using-aether`: the Tier line with an effort, the Review line, the policy and the rubric;
  - `swarm`, `implementer.md`, `supervisor.md` and the README.
- **`plugin.json`:** version 0.2.0.

## 13. Out of scope

- The effort of the final reviewer and of ops.
- Classifying complexity automatically.
- Changing the effort within an agent's session (`turn.step`).
- A trial comparing this policy with trials 1 and 2. It is the natural follow-up.
