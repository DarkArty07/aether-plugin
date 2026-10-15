# A supervisor agent stays "running" for 30 minutes with no output, and nothing stops it

**Type:** bug (swarm, progress and cleanup)
**Date:** 2026-10-15
**Found in:** the run of spec 004 (run `20261015-011925-90a1`), `task-2: supervise attempt 1`
**Status:** open

## Summary

The supervisor of the first attempt of task 2 never returned a result. Its transcript was last written at 07:28:28 UTC, in the middle of reading `lib/baseline.js`, and the workflow's progress view listed it as running for the next 30 minutes. The unit itself went on to attempt 2 and merged, so the run was not blocked.

## What happened

- The journal has a `started` entry and no `result` for that agent; 124 agents had started and 120 had results when it was found.
- The lane table gives supervisors a 900 second timeout (`config/lanes.json`), but it applies to lane calls, not to this native agent.

## Impact

- A half-hour "running" item in the owner's view looks like a stuck merge or a hang.
- It may hold a place in the agent count and delay the end of a run that awaits it.

## Proposals

1. A native agent gets the same timeout as a lane call; at the timeout the workflow stops it and records it as abandoned.
2. The progress view shows an abandoned agent as such.

## Acceptance

- No agent of a finished unit is shown as running, and a supervisor that goes silent is stopped at its timeout.

## Environment

Aether 0.10.0, Claude Code 2.1.300, Linux (WSL2).
