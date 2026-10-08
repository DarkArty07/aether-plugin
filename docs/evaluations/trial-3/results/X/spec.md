# Effort routing for the Aether swarm: design spec

- **Date:** 2026-10-08
- **Status:** Design approved by the owner on 2026-10-08, section by section. This spec awaits the owner's review.
- **Method:** superpowers brainstorming (architectural path), then superpowers `writing-plans`.
- **Amends, once built:** the [plugin design spec](2026-10-07-aether-plugin-design.md), §6, §7, §8, §10 and §12 (see §13).
- **Background:** [trial 1](../../evaluations/2026-10-08-trial-1.md), [Claude Code research](../../claude-code-research.md), [decisions](../../decisions.md) D5.

## 1. Summary

Today the swarm routes by model alone:
- every implementer runs at the effort in its agent file (`medium`), whatever its tier;
- the ladder counts attempts per model.

This change routes by model and effort together:
- Haiku implementers run at `xhigh` by default;
- the Designer chooses each task's effort in the plan, by the task's complexity;
- the escalation ladder becomes a list of model+effort rungs, written in the plan. It raises the effort before the model where the data supports it;
- the supervisor runs on Sonnet `xhigh`. Trial 1 found Aether's per-attempt review shallower than normal mode's, and this deepens it;
- the workflow passes the effort on every agent call;
- the usage meter and `aether-report` show the effort each agent ran at.

## 2. Decisions

Taken by the owner on 2026-10-08.

| ID | Decision |
|---|---|
| E1 | Haiku implementers run at `xhigh` by default. |
| E2 | Each task's effort is set now, in the plan. The Designer chooses it by the task's complexity, on the task's Tier line. There is no complexity detection at run time. |
| E3 | Sonnet and Opus never implement below `high`. `sonnet low`, `sonnet medium`, `opus low` and `opus medium` are refused, because Haiku at `xhigh` does that work for a fraction of the price. |
| E4 | The ladder is a list of model+effort rungs, written in the plan. It raises the effort first and then the model, where the data supports it (§3). |
| E5 | No default uses `max`, because of its latency. A plan may name it for a task, with the reason. |
| E6 | The supervisor runs on Sonnet `xhigh` for every attempt. The final reviewer stays on Opus `high`, and ops stays on Haiku `low`. A task's effort applies to its implementer only. |
| E7 | The workflow passes the model and the effort on every `agent()` call. The effort in an agent file is only its default. |
| E8 | Plans that carry only a tier keep working with defaults, and so does the old ladder form. |
| E9 | The usage meter records each request's effort. `aether-report` shows each agent's effort, and the cost by model and effort. |
| E10 | A real smoke run checks, in the agents' transcripts, that the effort reaches each agent. |
| E11 | Out of scope: the effort of the swarm's Designer, the main session. |

## 3. The data and the default ladder

The owner's data comes from Artificial Analysis. Each cell gives the intelligence index, the Terminal-Bench 4 score, and the seconds of thinking before an answer.

| Effort | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
|---|---|---|---|
| low | 29.4 / 13 / 4 | 35.9 / 21 / 1 | 42.3 / 31 / 5 |
| medium | 34.5 / 15 / 9 | 40.8 / 30 / 1 | 51.2 / 53 / 13 |
| high | 37.8 / 22 / 15 | 46.8 / 44 / 7 | 53.6 / 57 / 20 |
| xhigh | 41.2 / 29 / 47 | 51.9 / 57 / 15 | 56.0 / 60 / 78 |
| max | 43.4 / 33 / 278 | 56.0 / 64 / 271 | 57.6 / 60 / 561 |

List prices, in USD per million input/output tokens: Opus 4/20, Sonnet 2/10, Haiku 0.10/0.50.

**The default ladder:** `haiku xhigh 2, sonnet high 1, sonnet xhigh 1, opus xhigh 1`.

| Rung | Attempts | Why |
|---|---|---|
| haiku xhigh | 2 | Haiku `max` adds 2.2 points of index and 4 of Terminal-Bench for 231 s more per answer. That is not worth it by default |
| sonnet high | 1 | The first real step up. Sonnet `low` and `medium` are no better than Haiku `xhigh`, at 20 times the price |
| sonnet xhigh | 1 | Effort before model: 5.1 points and 13 on Terminal-Bench, for 8 s more |
| opus xhigh | 1 | Opus `high` (53.6 / 57) barely improves on Sonnet `xhigh` (51.9 / 57), at twice the price. So the Opus rung goes straight to `xhigh` |

- **Attempts.** The ladder keeps today's five attempts: Haiku 2, Sonnet 2, Opus 1.
- **Opus below `high`.** Opus `low` is as good as Haiku `xhigh`, at 40 times the price. Opus `medium` is below Sonnet `xhigh`, at twice the price. Hence E3 for Opus.
- **Sonnet `max`.** At 56.0 / 64 it is the strongest pair on Terminal-Bench, but it thinks 271 s per answer. It stays out by default (E5).
- **The supervisor.** Sonnet `xhigh` (51.9 / 57 / 15) replaces today's `high` (46.8 / 44 / 7), for 8 s more per answer.

## 4. Findings this design rests on

Checked on 2026-10-08:
- **`agent()` takes an effort.** The `workflow-authoring` reference that Claude Code bundles lists `opts.effort` (`'low' | 'medium' | 'high' | 'xhigh' | 'max'`). The option "overrides the reasoning effort for this agent call", and is omitted "to inherit the session effort". Phase 0 confirmed only `{ agentType, model, phase, label, schema }`.
- **Agent files' efforts reach workflow agents today.** A local swarm run's script passed no effort, and each agent ran at its file's effort: implementers `medium`, supervisors and the reviewer `high`, ops `low`.
- **Transcripts record the effort.** Each workflow agent has a transcript under its session's directory in `~/.claude/projects/`, at `subagents/workflows/<workflow>/agent-<id>.jsonl`.
  - Its message lines carry `"effort"` and `"perTurnEffort"`.
  - Beside it, `agent-<id>.meta.json` holds the `agentType`, the `description` (the call's label) and the `model`.
- **Still to verify:** that a per-call effort overrides the agent file's effort. The smoke run (§12) checks it.
- **Prompt cache.** The workflow docs say that agents share a prompt-cache prefix only when they run with the same model, effort level, agent type, tools, output schema and working directory.

## 5. Vocabulary

- A **model** is `haiku`, `sonnet` or `opus`.
- An **effort** is `low`, `medium`, `high`, `xhigh` or `max`, in that order.
- A **rung** is a model at an effort, with a number of attempts.
  - It is named `<model> <effort>`, such as `sonnet xhigh`.
  - One rung is **stronger** than another when its model comes later in the order haiku, sonnet, opus, or when its model is the same and its effort is higher.
- The **ladder** is the plan's list of rungs.
- A unit's **path** is the list of steps it may run on (§7). Each step is a rung with its attempts.
- A **tier** is what a unit runs on: a model at an effort.
  - A Tier line names a tier.
  - A unit's `tiers` lists the names of the steps it ran on.
  - In the compile args, a task's `tier` field is still its model, and its `effort` field sits beside it.

## 6. The plan

### The Tier line

`- Tier: <model> [<effort>] — <reason>`

- The effort is optional.
- Model and effort are case-insensitive, and are stored in lowercase.
- The dash forms accepted today (`—`, `–`, `--`, `-`) are still accepted.
- Without an effort, a task starts on the first rung of its model in the ladder. With the default ladder, that is `haiku xhigh`, `sonnet high` or `opus xhigh`.
- `sonnet low`, `sonnet medium`, `opus low` and `opus medium` are refused.
- `max` is allowed when a plan names it.

### The Ladder line

`- Ladder: haiku xhigh 2, sonnet high 1, sonnet xhigh 1, opus xhigh 1`

- **Entries.** They are separated by commas, and are case-insensitive.
  - Each entry is `<model> <effort> <attempts>`, or `<model> <attempts>` in the old form.
  - Attempts are a whole number, 0 or more.
- **Old-form entries.** An entry without an effort takes its model's default effort: `haiku xhigh`, `sonnet high` or `opus xhigh`.
  - So the old `haiku 2, sonnet 2, opus 1` reads as `haiku xhigh 2, sonnet high 2, opus xhigh 1`.
  - The two forms may be mixed.
- **No Ladder line.** A plan without one gets the default ladder (§3).
- **The ladder goes up.**
  - Each rung is stronger than the one before it.
  - A repeated rung does not go up.
  - Every model has at least one rung, as today.
  - A rung with 0 attempts is skipped.
- **Refused pairs.** The pairs the Tier line refuses are refused here too.

### Messages from `aether-plan check` and `compile`

| Problem | Message |
|---|---|
| A Tier line that cannot be read: an unknown model or effort, or no reason | `Task 3: Tier must be haiku, sonnet or opus, optionally followed by an effort (low, medium, high, xhigh or max), then " — reason".` |
| A refused pair in a Tier line | `Task 3: sonnet medium is not used for implementers; Sonnet and Opus run at high, xhigh or max.` |
| A ladder entry that cannot be read | `Aether Execution: cannot read ladder entry "sonnet 2 high"; use "haiku xhigh 2, sonnet high 1, sonnet xhigh 1, opus xhigh 1".` |
| A model missing from the ladder (unchanged) | `Aether Execution: the ladder has no "opus" entry.` |
| A refused pair in the ladder | `Aether Execution: opus low is not used for implementers; Sonnet and Opus run at high, xhigh or max.` |
| A ladder that does not go up | `Aether Execution: the ladder must go up, but "haiku xhigh" comes after "sonnet high". List the models from haiku to opus, and each model's efforts from low to max.` |

In these examples, the task number, the entry and the pairs stand for the values found. A refused pair is written as `<model> <effort>`, and a rung by its name. All other messages are unchanged.

### Parse and compile

- **`parsePlan`** gives each task an `effort`: the Tier line's effort, or `null`. `execution.ladder` is the list of rungs, `{ model, effort, attempts }`, in the plan's order.
- **`buildGraph`** resolves each task's effort.
  - A `null` effort becomes the effort of the first rung of the task's model in the ladder.
  - When the ladder has no rung of that model, the effort stays `null`. The plan is already refused for the missing model.
- **The brief's Tier line** names the resolved tier: `- Tier: haiku xhigh — <reason>`.
- **`aether-plan compile`** prints the args with the ladder as a list, and with each task's resolved effort. The other args are unchanged:

```json
{
  "ladder": [
    { "model": "haiku", "effort": "xhigh", "attempts": 2 },
    { "model": "sonnet", "effort": "high", "attempts": 1 },
    { "model": "sonnet", "effort": "xhigh", "attempts": 1 },
    { "model": "opus", "effort": "xhigh", "attempts": 1 }
  ],
  "tasks": {
    "task-2": {
      "number": 2,
      "title": "Store module",
      "tier": "haiku",
      "effort": "medium",
      "tierReason": "renames one field; the tests pin it down completely",
      "area": "core",
      "owns": ["src/store.js", "tests/store.test.js"],
      "dependsOn": [],
      "brief": "/home/me/project/.aether/runs/20261008-120000-abcd/briefs/task-2.md"
    }
  }
}
```

### The Designer's guidance

`using-aether` tells the Designer how to choose a task's effort by its complexity:
- **haiku:** `xhigh` by default. `high` or `medium` for mechanical work that the tests pin down completely: it answers in seconds instead of most of a minute.
- **sonnet:** `high` by default. `xhigh` for the hardest work of its kind, such as integration across several modules, or behavior the tests cannot pin down.
- **opus:** `xhigh` by default. `high` for a narrow task that the tests pin down well.
- **max:** never by default. Only when the task needs it, and the reason says why: it thinks for minutes per answer.
- Sonnet and Opus never run below `high`.

Several things are unchanged:
- the tier rubric that picks the model;
- the Area, Owns and Depends on fields;
- the contract rule (A10).

## 7. The workflow

### Input

`readArgs` also requires:
- `ladder`: a non-empty list of rungs. Each rung has a known `model`, a known `effort`, and a whole number of `attempts`, 0 or more;
- each task's `effort`: a known effort.

Args without these fail with today's messages:
- `aether:run args are missing or invalid: ladder`;
- `aether:run args: task-3 is not a complete task`.

The workflow does not check the refused pairs or the ladder's order. `aether-plan` does.

### A unit's path

- When the task's tier has the model and effort of a rung of the ladder, the path is that rung and every rung after it, in the ladder's order.
- Otherwise, the path starts with a step on the task's tier, with 1 attempt. Every rung of the ladder stronger than that tier follows it, in the ladder's order.

With the default ladder:

| Task's Tier | Path |
|---|---|
| `haiku` (resolved to `haiku xhigh`) | haiku xhigh 2, sonnet high 1, sonnet xhigh 1, opus xhigh 1 |
| `haiku medium` | haiku medium 1, haiku xhigh 2, sonnet high 1, sonnet xhigh 1, opus xhigh 1 |
| `sonnet xhigh` | sonnet xhigh 1, opus xhigh 1 |
| `opus high` | opus high 1, opus xhigh 1 |

### The ladder at run time

- **Attempts.** An attempt runs on the unit's current step, and each step counts its own attempts. A step with 0 attempts is skipped, the first step included.
- **Staying on a step.** A unit stays on its current step while the step has attempts left, then moves to the next step that has attempts. This applies to:
  - a retry;
  - an approval that still lists a blocking finding;
  - a failed implementer or supervisor;
  - a merge refused for changes outside `owns`, or for nothing committed.
- **`escalate`** moves to the next step that has attempts, at once.
- **No step left.** When no such step is left, the unit is blocked: `the ladder is spent`.
- **Merge retry.** The one retry after a merge conflict or failing merge tests stays on the same step, and counts no attempt, as today.

### Model and effort per call

| Role | Model | Effort |
|---|---|---|
| implementer | the current step's | the current step's |
| supervisor | `sonnet` | `xhigh` |
| reviewer | `opus` | `high` |
| ops | `haiku` | `low` |

Every call has the form `agent(prompt, { agentType, model, effort, phase, label, schema })`.

### Prompts, labels and logs

Wherever a tier is written today, a step is now written by its name, such as `haiku xhigh`:
- the implementer's label: `task-3: implement on haiku xhigh (attempt 1)`;
- the implementer's prompt: `Run 20261008-120000-abcd, attempt 1, on haiku xhigh.`;
- the supervisor's prompt: `Attempt 1 ran on haiku xhigh.`;
- the lines of earlier attempts;
- the escalation log, such as `task-3: escalating from haiku xhigh to sonnet high`;
- the units' lines in the final reviewer's prompt.

The supervisor's `## Ladder` section lists every step of the unit's path, then the two rules:

```text
## Ladder
Attempts used: haiku xhigh 1/2, sonnet high 0/1, sonnet xhigh 0/1, opus xhigh 0/1.
A retry stays on haiku xhigh while it has attempts left, then moves up. Escalate moves up now, to a higher effort or a stronger model.
```

### Result

- A unit's `tiers` lists the names of the steps it ran on, in order, such as `["haiku xhigh", "sonnet high"]`.
- Each round's `tier` is the name of its step.
- `agents` is unchanged: the total, by role and by model.
- In `aether-report`, a move to a later step counts as an escalation. That includes a move to a higher effort on the same model.

## 8. The agents

- **Default efforts in the agent files:**
  - implementer `xhigh` (was `medium`);
  - supervisor `xhigh` (was `high`);
  - reviewer `high` and ops `low`, unchanged.

  The models are unchanged.
- **The supervisor's rules** speak of rungs instead of tiers:
  - retry: the findings are ones another attempt on the same rung can fix;
  - escalate: the next rung is needed, a higher effort or a stronger model;
  - the workflow enforces the ladder: a retry past a rung's attempts moves up a rung, and an escalation past the last rung blocks.

## 9. Measurement

### The usage meter

Each entry gains `effort`. It is the `turn.step` event's `effort` as given, or `null` when the event has none:

`{ t, ms, agent, model, effort, input, output, cacheRead, cacheWrite }`

### `aether-report`

- **`byEffort`.** In `cost.run` and `cost.session`, each `byModel` entry gains `byEffort`: the `usd` and `requests` of each effort.
  - Entries with no effort count under `unknown`, the way `byModel` already counts a missing model.
- **`cost.run.agents`.** One item per agent that made requests in the run's window, with the main session as one item.
  - The items follow the order of each agent's first request.
  - Each item has the fields below.

| Field | Value |
|---|---|
| `agent` | The agent id, or `null` for the main session |
| `type` | `main`, the agent's type (such as `aether:implementer`), or `agent` when it is unknown |
| `label` | The label the meter learned from `agent.spawn`, or `null` |
| `model` | The model of its requests. Several models are joined with ", " in the order first used |
| `effort` | The effort of its requests, joined the same way. `null` when none is known |
| `requests`, `usd` | Its request count, and its cost priced like the rest of the report |

- **`finalize`** keeps both in the run's record, as part of the report.

## 10. Errors and compatibility

| Case | Handling |
|---|---|
| An invalid Tier or Ladder line | `aether-plan check` and `compile` refuse the plan, with one message per problem (§6) |
| A plan with only tiers, or with the old ladder form | It compiles. Tier-only tasks start on the first rung of their model |
| Args in the old form, or without efforts | The workflow refuses them before any agent starts. Every launch uses the args of a fresh compile, relaunches included |
| Usage entries written before this change | Their effort is `null` in the agents list, and `unknown` in `byEffort` |
| Results saved before this change | Their `tiers` hold model names, and escalations still count |
| The smoke run shows that a per-call effort does not win | The work stops. The Lead brings back the evidence, and the Designer puts two ways out to the owner: a `turn.step` hook that sets the effort, or one agent file per effort. Neither is built in advance |

## 11. Testing

- **`node --test`:**
  - **Plan:**
    - the Tier line with and without an effort, in any case;
    - the effort resolved from the ladder, with the default and with a custom ladder;
    - the refused pairs and an unknown effort;
    - the Ladder line in the new, old and mixed forms, and with no line;
    - each ladder message;
    - the brief's Tier line.
  - **Compile:** the args carry the ladder as a list, and every task's effort.
  - **Workflow.** The harness records each call's `effort`, and the scenarios cover:
    - every call passing its role's model and effort;
    - the full climb of a Haiku unit, and its `tiers`;
    - a start off the ladder (`haiku medium`), and a start on a later rung (`sonnet xhigh`);
    - `escalate` from `sonnet high` to `sonnet xhigh`;
    - the implementer's label, and the supervisor's `## Ladder` text;
    - an invalid ladder, and missing efforts, in the args;
    - the existing scenarios, on the new args.
  - **Report:**
    - `byEffort`;
    - the agents list: its order, labels, joined values and unknown effort;
    - entries written before this change.
- **The meter:** `claude plugin test plugins/aether`. An entry carries the event's effort, or `null` when the event has none.
- **The plugin:** `claude plugin validate plugins/aether --strict`, and `npm run check` as a whole.
- **The smoke run** (§12).

## 12. Smoke run

The Lead runs it after the swarm has merged every task and the tests pass on the integration branch.

- **The fixture:**
  - a throwaway Node project in a temporary directory, with `npm test` and a separate integration worktree on a feature branch;
  - a plan with two independent tasks in one wave. Each owns its own module and test.
    - Task 1 has `Tier: haiku`, with its reason.
    - Task 2 has `Tier: haiku medium`, with its reason.
    - The plan writes out the default Ladder line.
- **The run:**
  - one headless session, `claude -p "<prompt>" --model sonnet --permission-mode bypassPermissions --strict-mcp-config --max-budget-usd 5 --output-format json`. The plan gives the prompt in full;
  - with `--plugin-dir` pointing at this repository's integration worktree's `plugins/aether`, and `--settings '{"enableWorkflows": true}'`;
  - with `AETHER_DATA_DIR` inside the fixture, and `ENABLE_CLAUDEAI_MCP_SERVERS=false`;
  - session persistence stays on, so the agents' transcripts are kept;
  - the session compiles the plan, launches `/aether:run`, saves `result.json` and runs `aether-report`.
- **It passes when:**
  - **The transcripts match.** Take each `agent-<id>.meta.json` of the run whose `agentType` starts with `aether:`. In its `agent-<id>.jsonl`, every `effort` and `perTurnEffort` field has the expected value:
    - an implementer: the effort its `description` names;
    - a supervisor: `xhigh`;
    - the reviewer: `high`;
    - ops: `low`.
  - **The call's effort wins.** Task 2's first implementer ran at `medium`. That differs from the implementer file's `xhigh`.
  - **The report agrees.** `aether-report` shows the same effort for each agent in `cost.run.agents`, and `medium` and `xhigh` under Haiku in `byEffort`.
- **Afterwards:**
  - run `aether-report finalize`, then delete the fixture;
  - the Lead records the result in the research doc;
  - the Designer records it in the plan's execution record, and amends the plugin design spec (§13).

## 13. Documents to update

- **The Designer**, who alone writes specs and plans:
  - this spec, and the plan;
  - after the smoke run: §6, §7, §8, §10 and §12 of the plugin design spec, and the smoke run in the plan's execution record.
- **Plan tasks:**
  - `plugins/aether/skills/using-aether/SKILL.md`: the Tier line with its effort, the effort guidance (§6), and the new Ladder line;
  - `plugins/aether/skills/swarm/SKILL.md`: `tiers` as step names, and the report's efforts;
  - `README.md`: tiers pick the model and the effort, and the ladder raises the effort first;
  - `docs/decisions.md`: an update to D5;
  - `docs/claude-code-research.md`: the findings in §4.

## 14. Out of scope

- The effort of the swarm's Designer, the main session.
- Detecting a task's complexity at run time.
- A per-task effort for the supervisor, and any change to the final reviewer.
- `max` in any default.

## 15. Risks

- **Latency.** Haiku at `xhigh` thinks longer per answer than at `medium`: 47 s against 9 s in the data. Units will take longer, and trial 2 measures by how much.
- **The per-call override.** If the call's effort does not win over the agent file's, every non-default effort is wrong. The smoke run catches this before any real run (§10).
- **General data.** The index and Terminal-Bench do not measure this swarm's work. Trial 2's escalations show whether the rungs fit.
- **Prompt cache.** Implementers at different efforts in one wave do not share a cache prefix (§4), which costs a few more cache writes.
