# The agent budget counts commands that use no model: 97 of 144 agents were ops

**Type:** bug (swarm, agent budget)
**Date:** 2026-10-15
**Found in:** the run of spec 004 (run `20261015-011925-90a1`)
**Status:** open

## Summary

The plan's `Max agents: 150` is spent mostly by `ops` agents, the commands the workflow hands to the mod (lane choice logging, merges, closes, quota steps). In this run 97 of the 144 agents were ops, 26 were implementers, 20 supervisors and 1 a reviewer. A unit without a retry costs about 6 agents and one with a retry about 10, so a 20-task plan needs 120 to 200, not the 80 to 140 a count of models suggests.

## What happened

- At 124 agents the run had four units and its final review still to go; the projection was 145 to 150 without a retry, which would have left the last unit `not-run` and the final review `skipped` ("the agent budget is spent").
- The cap was not reached, only because the three last units ended without a report early.

## Impact

- A plan that fits its budget on paper can end with units not run, for a cost of commands that spend no tokens.
- The Writer cannot set the budget from the task count with any reliability.

## Proposals

1. Count only model agents against `maxAgents`, and report ops commands separately.
2. Or have `aether-plan compile` compute a suggested budget as tasks times 6, plus 4 per expected retry, and warn when the plan's is lower.

## Acceptance

- A 20-task plan with 4 retries does not stop for the agent budget.

## Environment

Aether 0.10.0, Claude Code 2.1.300, Linux (WSL2).
