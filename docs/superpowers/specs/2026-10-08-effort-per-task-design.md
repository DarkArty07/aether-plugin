# Effort per task in the Aether swarm: design spec

- **Date:** 2026-10-08
- **Status:** approach A, approved by the owner on 2026-10-08: "Yo también digo que es mejor xhigh por defecto y bajarlo o subirlo o cambiar de modelo de acuerdo a la tarea. Ya comienza a implementarlo". The owner asked to start at once, so this spec and its plan go to the owner together. Built on 2026-10-08 as version 0.3.0, on `feature/effort-per-task`. The effort probe and the end-to-end check passed; see the plan's execution record.
- **Method:** superpowers brainstorming (architectural path), then superpowers `writing-plans`.
- **Plan:** [2026-10-08-effort-per-task.md](../plans/2026-10-08-effort-per-task.md)
- **Amends, once built:** the [plugin design spec](2026-10-07-aether-plugin-design.md), §6, §7, §8, §10 and §12 (see §13).
- **Background:**
  - [Trial 2](../../evaluations/2026-10-08-trial-2.md) found the implementers' fixed effort to be one of the two causes of its quality gap.
  - [Trial 3](../../evaluations/2026-10-08-trial-3.md) left two candidate designs, X and Y. This design takes the best of each.
  - [Decisions](../../decisions.md) D5, A6 and A10.

## 1. Summary

Today every implementer runs at `xhigh`, set in its agent file, and every supervisor at `high`, whatever the task. The ladder counts attempts per model.

This change lets each task set its implementer's effort, and keeps the rest as it is:
- **The plan sets each task's effort,** on its Tier line, by the task's complexity.
  - The default stays `xhigh` on every model.
  - The Designer lowers it where the tests pin the work, raises it to `max` with a reason, or picks another model.
- **The run raises it when an attempt fails.**
  - The first attempt on the task's own model runs at the task's effort.
  - Every later attempt runs at `xhigh`: a retry, and every attempt on a model the unit escalated to.
  - A declared `max` stays `max` on the task's model.
- **The supervisor** reviews at `high`. A task's optional Review line raises it.
- **The workflow passes the effort on every `agent()` call.** Ops stays at `low`, and the final reviewer at `high`.
- **Attempts are named by rung,** a model and an effort such as `haiku xhigh`, in labels, prompts, logs and results.
- **Measurement:**
  - the usage meter records each request's effort;
  - `aether-report` shows cost, output tokens and time by role, model and effort, lists each agent with its effort, and counts climbs apart from escalations;
  - `scripts/check-effort.js` checks a run's transcripts.
- **Verification first:**
  - before the swarm builds anything, a probe in the Lead's session checks that a call's effort overrides the agent file's;
  - a real run checks the whole chain once the swarm has built it.

Plans written for version 0.2.0 run unchanged, and behave exactly as today.

## 2. Decisions

| ID | Decision |
|---|---|
| E1 | Every implementer runs at `xhigh` unless its task says otherwise, on Haiku, Sonnet and Opus. |
| E2 | The plan sets each task's effort by its complexity: lower it, raise it, or change the model. Nothing is detected at run time. |
| E3 | The first attempt on the task's own model runs at the task's effort. Every later attempt runs at `xhigh`. A declared `max` stays `max` on the task's model. |
| E4 | Sonnet and Opus never implement below `high`: Haiku at `xhigh` does that work for far less. |
| E5 | `max` is never a default. A plan may name it for an implementer or a review, with the reason. |
| E6 | The supervisor reviews at `high`. A task's optional Review line raises it, for every attempt at the task. |
| E7 | Ops runs at `low`, and the final reviewer at `high`. |
| E8 | The workflow passes the model and the effort on every `agent()` call. The agent files keep their efforts as defaults: implementer `xhigh`, supervisor and reviewer `high`, ops `low`. |
| E9 | The `Ladder:` line keeps its form and its meaning: attempts per model. |
| E10 | Plans written for version 0.2.0 run unchanged, with the same models, efforts and attempts as today. |
| E11 | The meter records each request's effort. The report shows cost, output tokens and time by role, model and effort, each agent's effort, and the climbs. `check-effort.js` checks the transcripts. |
| E12 | A probe in the Lead's session checks that a call's effort overrides the agent file's, before the swarm starts. A real run checks the built chain after the merges. |

Where they come from:
- E1 to E3 are the owner's words, and the approach the owner chose.
- E4, E5, E7 and E10 come from the hand-off, where the owner did not object.
- E12 follows the owner's ruling, relayed by the Lead: the verification runs inside the plan, ahead of anything that depends on it.
- The rest are part of approach A, which the owner approved.

## 3. Evidence

**The owner's data.** Artificial Analysis, given by the owner on 2026-10-08. Each cell gives the Intelligence Index, the Terminal-Bench 4 score (TB4) and the seconds of thinking before an answer.

| Effort | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
|---|---|---|---|
| low | 29.4 / 13 / 4 | 35.9 / 21 / 1 | 42.3 / 31 / 5 |
| medium | 34.5 / 15 / 9 | 40.8 / 30 / 1 | 51.2 / 53 / 13 |
| high | 37.8 / 22 / 15 | 46.8 / 44 / 7 | 53.6 / 57 / 20 |
| xhigh | 41.2 / 29 / 47 | 51.9 / 57 / 15 | 56.0 / 60 / 78 |
| max | 43.4 / 33 / 278 | 56.0 / 64 / 271 | 57.6 / 60 / 561 |

List prices, in USD per million input/output tokens: Opus 4/20, Sonnet 2/10, Haiku 0.10/0.50 (A6).

**What decides a run.**
- In trials 1 and 2, 14 of 15 units passed on their first attempt, and none escalated.
  - So the first attempt's effort decides most of a run's quality, cost and time.
  - The ladder acts only on the few units that fail.
- Trial 2's gap was in work that passed review. The supervisors approved a correct but plain game, and the ladder never fired. Only the first attempt's effort reaches that kind of gap.

**Reading the data.**
- **Sonnet.** From `high` to `xhigh` it gains 13 TB4 points for 8 s more per answer: the best step in the table. At `xhigh` it matches Opus at `high` on TB4, at half the price.
- **Dominated pairs:**
  - Sonnet at `low` or `medium`: Haiku at `xhigh` matches Sonnet `medium`, at a twentieth of the price;
  - Opus at `low`: it scores about what Haiku at `xhigh` does, at 40 times the price;
  - Opus at `medium`: it scores below Sonnet at `xhigh`, at twice the price.
- **Haiku.** At `xhigh` it costs almost nothing more, but thinks 47 s per answer against 15 s at `high`. Lowering Haiku on mechanical work is the main speed lever.
- **`max`** adds 0 to 7 TB4 points, for 4 to 9 minutes per answer.

**Why `xhigh` by default** (approach A, chosen over trial 3's "climb from the middle"):
- a missing effort then costs time and money, which the report shows, not quality, which nobody sees;
- plans written for 0.2.0 keep today's behavior;
- one rule covers the run: the first attempt uses the task's effort, and every other attempt runs at `xhigh`.

**Claude Code facts**, checked on 2026-10-08, Claude Code 2.1.295:
- **`agent()` takes an effort.** The Workflow tool's own documentation says: "opts.effort overrides the reasoning effort for this agent call ('low' | 'medium' | 'high' | 'xhigh' | 'max') — omit to inherit the session effort".
- **Agent files' efforts reach workflow agents.** Runs whose script passed no effort ran each agent at its file's effort.
- **`turn.step` carries the effort** (Phase 0; [research](../../claude-code-research.md), S3).
- **Transcripts.**
  - A workflow agent's transcript is `<session dir>/subagents/workflows/<workflow>/agent-<id>.jsonl`.
  - Each of its assistant lines carries `effort` and `perTurnEffort` at the top level.
  - Beside it, `agent-<id>.meta.json` holds `agentType`, `description` (the call's label) and `model`.
- **Ids.** The usage meter's agent ids are the transcripts' ids. This was checked on a real run's files.
- **`CLAUDE_CODE_EFFORT_LEVEL`** overrides every subagent's effort.
- **Not yet verified:** that a call's effort overrides the agent file's effort. The probe (§9) checks it first.

## 4. Vocabulary

- A **model** is `haiku`, `sonnet` or `opus`.
- An **effort** is `low`, `medium`, `high`, `xhigh` or `max`, in that order.
- A **rung** is a model at an effort, named `<model> <effort>`, such as `sonnet high`.
- A unit **climbs** when it moves to a higher effort on the same model. It **escalates** when it moves to another model.

## 5. The plan

### The Tier line

`- Tier: <model> [<effort>] — <reason>`

- The effort is optional. Model and effort are case-insensitive, and are stored in lowercase.
- The dash forms accepted today (`—`, `–`, `--`, `-`) are still accepted.
- Without an effort, the task starts at `xhigh`.
- `sonnet low`, `sonnet medium`, `opus low` and `opus medium` are refused. Haiku may run at any effort.
- The reason covers both choices.

### The Review line

`- Review: <effort> — <reason>`, optional, in the task's Aether block.
- The effort is `high`, `xhigh` or `max`. It sets the supervisor's effort for every attempt at the task.
- Without the line, the supervisor reviews at `high`.

### The Ladder line

Unchanged: `- Ladder: haiku 2, sonnet 2, opus 1` counts attempts per model.

### Messages

| Problem | Message |
|---|---|
| A Tier line that cannot be read: an unknown model or effort, or no reason | `Task 3: Tier must be haiku, sonnet or opus, optionally followed by an effort (low, medium, high, xhigh or max), then " — reason".` |
| Sonnet or Opus below `high` | `Task 3: sonnet medium is not used for implementers; Sonnet and Opus run at high, xhigh or max.` |
| A Review line that cannot be read: an effort below `high`, an unknown word, or no reason | `Task 3: Review must be high, xhigh or max, then " — reason".` |

The task number and the pair stand for the values found. Every other message is unchanged.

### The Designer's guidance

`agents/designer.md` holds the Aether plan rules. It gains the effort and Review rules, in the plan's exact text:
- the effort is `xhigh` when the Tier line names none; name one only when it should differ;
- lower it where the tests pin the work completely, for speed: `haiku high` or `haiku medium` for mechanical work, `sonnet high` or `opus high` for well-tested wiring;
- `max` only with a reason the task needs it;
- Sonnet and Opus never below `high`;
- a failed attempt runs again at `xhigh`, so a lowered effort costs one attempt at most;
- `Review: xhigh` where behavior beyond the tests matters: UI states, input parsing, the file system, security, data loss or concurrency.

## 6. Compile

- **`parsePlan`** gives each task `effort` and `review`, each the declared effort or `null`, and `reviewReason`.
- **`buildGraph`** resolves them. Each task node carries:
  - `effort`: the declared effort, or `xhigh`;
  - `review`: the declared effort, or `high`.
- **`aether-plan compile`** prints each task with both. The other args are unchanged.
- **The brief's Tier line** names the starting rung: `- Tier: haiku medium — <reason>`, or `- Tier: haiku xhigh — <reason>` when the plan names no effort.

## 7. The workflow

### Input

- Each task must carry an `effort` and a `review` that are effort levels.
- Args without them fail with today's message, `aether:run args: task-3 is not a complete task`, before any agent starts.
- Every launch compiles afresh, relaunches included.
- The workflow does not check the refused pairs; `aether-plan` does.

### Effort per call

| Role | Model | Effort |
|---|---|---|
| implementer | the attempt's model | the rule below |
| supervisor | `sonnet` | the task's `review` |
| final reviewer | `opus` | `high` |
| ops | `haiku` | `low` |

Every call has the form `agent(prompt, { agentType, model, effort, phase, label, schema })`.

### The rule

An implementer attempt runs at:
- the task's effort, when it is the first attempt on the task's own model;
- `max`, on the task's own model, when the task declared `max`;
- `xhigh` otherwise: every later attempt on the task's model, and every attempt on a model the unit escalated to.

**What stays as today:**
- Attempts are counted per model.
- The one retry after a merge conflict or failing merge tests counts no attempt. So it keeps the model and the effort of the attempt it retries.
- Escalation, the attempts per model and every other ladder rule.

With the default ladder (`haiku 2, sonnet 2, opus 1`), when every attempt fails:

| Task's Tier | Attempts |
|---|---|
| `haiku` | haiku xhigh, haiku xhigh, sonnet xhigh, sonnet xhigh, opus xhigh |
| `haiku medium` | haiku medium, haiku xhigh, sonnet xhigh, sonnet xhigh, opus xhigh |
| `sonnet high` | sonnet high, sonnet xhigh, opus xhigh |
| `sonnet max` | sonnet max, sonnet max, opus xhigh |

### Names in labels, prompts and logs

| Where | Text |
|---|---|
| Implementer label | `task-3: implement on haiku medium (attempt 1)` |
| Implementer prompt | `Run <runId>, attempt 1, on haiku medium.` |
| Supervisor label | `task-3: supervise attempt 1 on sonnet xhigh` |
| Supervisor prompt | `Attempt 1 ran on haiku medium.` |
| Earlier attempts, in both prompts | `- Attempt 1 on haiku medium: DONE. <summary>` |
| Escalation log | `task-3: escalating from haiku xhigh to sonnet xhigh` |
| The final reviewer's unit lines | `- task-3 (<title>): merged on haiku medium → haiku xhigh` |

Ops and final-review labels do not change.

### The supervisor's Ladder section

```text
## Ladder
Attempts used: haiku 1/2, sonnet 0/2, opus 0/1.
A retry runs on haiku xhigh. Escalate runs on sonnet xhigh.
```

- **The first line** is today's.
- **The retry sentence** names the rung of the next attempt, by the rule above: on the same model while it has attempts left, else on the next model with attempts. With none left: `A retry blocks the unit: the ladder is spent.`
- **The escalate sentence** names the next model with attempts, at `xhigh`. With none left: `Escalate blocks the unit: the ladder is spent.`

`supervisor.md` explains the same rules, in the plan's exact text.

### Result

- **A unit's `tiers`** lists the rungs it ran on, in order. It adds one whenever the rung changes: `["haiku medium", "haiku xhigh", "sonnet xhigh"]`.
- **Each round** has:
  - `tier`, the rung of its attempt;
  - `reviewEffort`, the supervisor's effort, or `null` when no supervisor ran.
- **`agents`** is unchanged: the total, by role and by model.

## 8. The agents

- **Models and efforts** are unchanged: implementer Haiku `xhigh`, supervisor Sonnet `high`, reviewer Opus `high`, ops Haiku `low`. The test that pins them stays.
- **`supervisor.md`** speaks of the model and the effort each verdict runs.
- **`designer.md`** gains the guidance of §5.

## 9. Verification

### The probe, before the swarm

The Lead runs it in its own session, once the owner approves the plan and before compiling. It costs cents and about a minute.
- **The script:** a throwaway workflow, run with the Workflow tool. It makes three tool-free calls:
  - `aether:ops` with `effort: 'high'`, against its file's `low`;
  - `aether:implementer` with `effort: 'medium'`, against its file's `xhigh`;
  - `aether:ops` with no effort.
- **The check:** a short command reads the three agents' transcripts in the Lead's session. It prints each label with the efforts its assistant lines recorded.
- **Pass:** the first agent ran at `high`, and the second at `medium`. The third is recorded; `low` means that the agent file is the default.
- **Record:** the Lead adds the result to `docs/claude-code-research.md`, in the plan's exact text. Then it compiles and launches the swarm.
- **Fail:** the Lead stops before compiling, and brings the output to the owner and the Designer. Nothing is built yet.
  - When all three show the same effort, `CLAUDE_CODE_EFFORT_LEVEL` is set in the session. Unsetting it comes first.
  - Otherwise there are two ways out, neither built in advance:
    - one agent file per effort, for the implementer and the supervisor, chosen by `agentType`;
    - a `turn.step` hook in the usage meter's mod that sets each agent's effort from its label.

### The end-to-end check, after the swarm

The Lead runs one real swarm on a throwaway fixture, with the integration worktree's plugin.
- **When:** every task is merged, and `npm run check` passes on the integration branch.
- **Why:** it costs about a dollar and a few minutes, and it protects `main`, from which `aether-mode` loads the plugin.
- **The fixture:** a tiny Node project with an integration worktree, and a one-task plan with `Tier: haiku medium` and `Review: xhigh`.
- **The run:** one headless session compiles the plan, runs `aether:run`, saves the result and runs `aether-report`.
- **Pass:**
  - `check-effort.js` with `--report` passes;
  - it finds the implementer at `medium`, the supervisor at `xhigh`, the final reviewer at `high` and ops at `low`;
  - the report's `byEffort` has the implementer's and the supervisor's keys.
- **Afterwards:** the fixture is deleted, and the Lead records the result in `docs/claude-code-research.md`.

## 10. Measurement

### The usage meter

Each entry gains `effort`: the `turn.step` event's effort when it is a non-empty string, else `null`.

`{ t, ms, agent, model, effort, input, output, cacheRead, cacheWrite }`

### `aether-report`

**`byEffort`,** in `cost.run` and `cost.session`, keyed `<role> <model> <effort>`, such as `aether:implementer claude-haiku-5-5 medium`.
- The role is the one `byRole` uses: `main`, the agent's type, or `agent`.
- A missing model or effort reads `unknown`.
- Each key gives:
  - `usd`, priced like the rest of the report, and `requests`;
  - `outputTokens`: thinking is billed as output, so this is what an effort costs in tokens;
  - `ms`: the summed duration of its requests, where a request without a duration adds 0. This is model time, not wall-clock time.

**`cost.run.agents`:** one item per agent with requests in the run's window, the main session included. The items follow the order of each one's first request.

| Field | Value |
|---|---|
| `agent` | the agent id, or `null` for the main session |
| `type` | `main`, the agent's type, or `agent` when it is unknown |
| `label` | the label the meter learned from `agent.spawn`, or `null` |
| `model`, `effort` | the values of its requests, in the order first used, joined with ", "; `null` when none is known |
| `requests`, `usd`, `outputTokens`, `ms` | as in `byEffort` |

**`quality.climbed`:** the units that climbed in any launch. Two entries in a row of a launch's `tiers` are on the same model, and the later one has a higher effort. Like the other counts, it is `null` when no result was saved.

**`quality.escalated`** counts a change of model:
- two entries of a launch's `tiers` on different models;
- or a relaunch that starts on another model than the unit's first launch.

The model of an entry is its first word. So results saved before this change, whose `tiers` hold bare models, count as before.

**The rest:** `byModel`, `byRole` and every other field stay as they are. `finalize` records everything in `runs.jsonl`.

### `scripts/check-effort.js`

A development script, outside the plugin.

    node scripts/check-effort.js <session-dir> [--report <report.json>]

- **It reads** each `subagents/workflows/*/agent-*.meta.json` under the session directory whose `agentType` starts with `aether:`, and the matching transcript.
- **The expected effort** is the one its label names after `on <model> `.
  - Without one, it is `low` for `aether:ops` and `high` for `aether:reviewer`.
  - Any other label without an effort is a problem.
- **The efforts seen** are the `effort` and `perTurnEffort` values of the transcript's assistant lines. The expected effort must be the only one.
- **With `--report`,** the report's `cost.run.agents` must list each agent by its id, with the expected effort.
- **Output:** one line of JSON, `{ ok, agents, problems }`, with the agents sorted by label.
  - It exits 0 when it passes, 1 on any problem, and 2 on a usage error.
  - Finding no `aether:` agent is a problem.

## 11. Errors and compatibility

| Case | Handling |
|---|---|
| An invalid Tier or Review line | `aether-plan check` and `compile` refuse the plan, one message per problem (§5) |
| A plan written for 0.2.0 | It compiles, and runs as today: implementers at `xhigh`, supervisors at `high`, the same ladder |
| Args without `effort` or `review` | The workflow refuses them before any agent starts |
| Usage entries written before this change | Their effort reads `unknown` in `byEffort`, and `null` in the agents list |
| Results saved before this change | Their `tiers` hold bare models; escalations count as before, and no unit climbed |
| The probe fails | The Lead stops before the swarm (§9) |

## 12. Testing

Test first. `npm run check` runs `node --test`, `claude plugin test` and `claude plugin validate --strict`.
- **Plans:**
  - the Tier line with and without an effort, in any case and dash form;
  - a reason that starts with an effort word;
  - each refusal and its message;
  - the Review line;
  - the resolved effort and review, the brief's Tier line, and the compiled args.
- **Workflow.** The harness records each call's `effort`. The tests cover:
  - every role's model and effort;
  - the rule: a first attempt, a retry, an escalation, a declared `max`, and the merge retry;
  - labels, prompts and logs;
  - the Ladder section in its three states;
  - `tiers`, `tier` and `reviewEffort`;
  - invalid efforts in the args.
- **Meter:** an entry records the event's effort, or `null`.
- **Report:**
  - `byEffort`, with an `unknown` key;
  - the agents list, its order and its joined efforts;
  - `climbed` and `escalated`, with old and new `tiers`.
- **`check-effort.js`:** a matching session, each kind of problem, the report check, and the command's output and exit codes.
- **Real runs:** the probe and the end-to-end check (§9).

## 13. Documents

- **The Designer,** who alone writes specs and plans:
  - this spec and its plan;
  - after the merge, when the Lead asks: §6, §7, §8, §10 and §12 of the plugin design spec, and the results of the probe and the end-to-end check in the plan.
- **Plan tasks:**
  - `agents/designer.md` and `agents/supervisor.md` (§5 and §7);
  - the `using-aether` and `swarm` skills;
  - the README;
  - `docs/decisions.md`: an update to D5, and A18;
  - `plugin.json`, to version 0.3.0.
- **The Lead:** the results of the probe and the end-to-end check, in `docs/claude-code-research.md`.

## 14. Out of scope

- Detecting a task's complexity at run time.
- The effort of the Lead and of the Designer.
- Changing the final reviewer's or ops' effort.
- Per-plan ladder rungs (trial 3's design X). No plan has needed them, and the Ladder line can already drop a model.
- Changing the effort inside an agent's session.

## 15. Risks

- **The call's effort may not win.** The probe settles it before anything is built (§9).
- **Haiku's latency.** At `xhigh` Haiku thinks about three times longer than at `high`: 47 s against 15 s in the data. The Designer lowers it on mechanical work, and `byEffort` shows the time each effort takes.
- **General data.** The index and TB4 do not measure this swarm's work. The report's `climbed`, `escalated` and `byEffort` show how well the efforts fit.
- **Prompt cache.** Agents share a cache prefix only at the same model and effort. Mixed efforts in a wave cost a few more cache writes.
- **Transcript format.** `check-effort.js` reads Claude Code's own files, which may change between releases. It is a development tool, and the probe and the end-to-end check show at once when it breaks.
