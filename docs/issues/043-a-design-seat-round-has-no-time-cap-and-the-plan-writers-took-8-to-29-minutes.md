# A design seat round has no time cap, and the plan Writers took 8 to 29 minutes

**Type:** performance (design; design seats)
**Date:** 2026-10-21
**Found in:** the design run `wf_26e31ce5-b93` of spec 011, in the Lead's session 7c77db6f; the owner asked why it took 1 h 36 min
**Status:** open
**GitHub:** none yet. This file is the local record.

## What happened

The design took about 95 minutes. The seat rounds, from the files in `.aether/seats/` (start to result):

| Document | Round | Seat | Pair | Time |
|---|---|---|---|---|
| spec | 1, 2, 3 | Writer | Muse | 3, 2, 2 min |
| spec | 1, 2, 3 | Judge | native Opus (no external pair) | about 1 to 3 min each |
| plan and tasks | 1 | Writer | Muse | 22 min |
| plan and tasks | 2 | Writer | Muse, failed for quota after 16 min; then Grok | 16 + 29 min |
| plan and tasks | 3 | Writer | Grok | 8 min |
| plan and tasks | 1, 2, 3 | Judge | native Opus | about 3 min each |

The spec phase took 11 minutes; the plan phase, 84, of which the Writers took 75. `awaitSeat` of `workflows/design.workflow.js` waits up to `MAX_WAITS` = 12 waits of 540 seconds (108 minutes) for one round, and nothing else limits a Writer: a pair that is slow is not marked slow, as the delegates' pairs are since [issue 035](035-grok-at-high-never-finishes-an-audit-it-is-killed-at-420-seconds-and-claude-reruns-it.md) (`lib/router-slow.js`).

## Ideas

A time cap per seat round that scales with the document (a plan with 7 tasks is not a spec), after which the round is stopped and the next pair is asked (the retry loop of [issue 040](040-a-design-seat-that-fails-goes-to-the-native-agent-without-trying-the-next-pair.md) exists); a slow mark per pair for seats, as for delegates; and, to know the real figure, the duration of each round in its record in the workflow's result (today only the files of the round have it).

## Impact

An hour of waiting per design, with the autonomous run's clock running. The number to beat: 84 minutes for the plan of a seven-task feature.
