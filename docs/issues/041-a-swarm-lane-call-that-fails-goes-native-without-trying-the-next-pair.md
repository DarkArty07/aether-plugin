# A swarm lane call that fails goes to the native agent without trying the next pair

**Type:** bug (design; swarm lanes)
**Date:** 2026-10-21
**Found in:** the swarm runs `20261021-005105-e2cc` (two launches) of the Lead's session 7c77db6f
**Status:** open
**GitHub:** none yet. This file is the local record.

## What happened

In the first launch, the implementer of task 2 (attempt 2) and the supervisors and the final review were picked on Muse and failed on its schema (issue 039); the native agent took all four, about US$ 1.7 of Claude. In the second launch the implementer of task 3 was picked on `agy/gemini-4-argon-high`, which refused («its quota ran out»), and the native Sonnet implementer did the attempt although Grok and Muse could have taken it. The swarm asks again without a pair only when its start is `unavailable`; a call that fails after it started, or ends for quota, goes native.

## What it should do

The same rule as the delegates (A67) and the seats (A70): a call that fails with no work done, or is refused, asks again for the next pair, never the one that failed, and the native agent takes it only when no pair is left. `laneCall` and the retry around it in `workflows/run.workflow.js` and the `took` causes are where it lives.

## Impact

Claude's quota, the reserve of an autonomous run, pays for a lane's failure.
