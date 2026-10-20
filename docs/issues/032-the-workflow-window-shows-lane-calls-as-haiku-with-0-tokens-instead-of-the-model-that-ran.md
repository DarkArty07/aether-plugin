# The workflow window shows lane calls as Haiku with 0 tokens, not the model that ran

**Type:** bug (observability, workflows, lanes)
**Date:** 2026-10-19
**Found in:** the owner's view of the `run` workflow of spec 008 in the Lead's session 4cb63536 (a screenshot of the workflow window, 15m53s into the run, 60 of 61 agents)
**Status:** open
**GitHub:** not filed

## What happened

- The owner: «en la ventana de workflow no dice que modelo ocupo realmente siguen heredando lo de haiku y sonnet pero aparece en 0».
- In the window, the rows of the implement phase read, for example, `task-1: implement on sonnet xhigh via a…` with `Haiku 5.5 · 0 tok`, and `task-3: implement on haiku high via agy…` with `Haiku 5.5 · 0 tok`, some of them lasting minutes (`8m15s`). The rows of native attempts read `Sonnet 5.5 · 91k tok`. The first row, `wave 1: lane quota`, is also `Haiku 5.5 · 0 tok`.
- The model column is the label of the agent that the workflow started, and a lane call is started through the `aether:ops` agent, which is declared on Haiku and which the mod answers without a model. So a call that ran for 8 minutes on agy (Gemini Flash or Claude Sonnet on agy) is shown as a Haiku agent with no tokens, the same as a 0-second `aether-wt` step. The window cannot tell a lane call from an ops step, and it never names the harness or the model that did the work, nor its tokens. The same holds in the design workflow, whose external Judge and Examiner rounds are `aether:ops` agents on Haiku.
- The real data exists: the lane log records the harness, the model, the effort, the status, the duration and the usage of each call, and the workflow result has `provider` and `reviewProvider` per round.

## Impact

- The owner cannot see in the window how much of a run went to other harnesses, which is the point of RADAR C3, and reads «Haiku, 0 tok» as work that cost nothing or ran on Claude.

## Proposals

1. Put the harness and model in the row's label once the call has started (`via agy gemini-3.8-flash-high`) or when it ends, from the call's result.
2. Show the lane call's usage in the tokens column in place of the ops agent's 0, or mark the row as a lane call.
3. Make the ops steps and the lane calls look different (an ops step is instant and has no model; a lane call is the model's work).
4. If the window cannot be changed, put the same line in the workflow's progress output and in `aether-lane status <runId>`.

## Acceptance

- In the window of a run with lanes, each row says which harness and model took the call and how many tokens it used, and a row of an ops step says it uses no model.

## Environment

Claude Code 2.1.303, Aether plugin 0.12.5 installed, Sonnet 5.5 as the Lead, agy 1.4.2, grok 1.0.62, Linux (WSL2).
