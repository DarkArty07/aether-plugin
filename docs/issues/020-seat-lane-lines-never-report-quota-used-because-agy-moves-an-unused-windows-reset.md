# A seat's lane line never reports the quota it used, because agy moves the reset time of a window with nothing used

**Type:** bug (lane records, quota)
**Date:** 2026-10-15
**Found in:** the Argon seat check of the Lead's session e328a606
**Status:** fixed in PR #27, not released yet. `windowUsed` in `lib/seats.js` takes a window that was full before the round as the same window after it when its reset time did not move back, and `tests/seats.test.js` covers the cases. `lanes.quotaConsumed`, which the report uses between readings, is not changed.
**GitHub:** [#26](https://github.com/DarkArty07/aether-plugin/issues/26) (private repository)

## What happened

`windowUsed` in `lib/seats.js` reports the drop in a window's remaining fraction only when the window has the same `resetsAt` before and after the round, and says `?` otherwise. agy's reading for a window with nothing used does not hold a reset time: it is the time of the read plus the window's length.

Readings of the `gemini` group on 2026-10-15, UTC:

| Read at | 5 h window resets | Weekly window | Weekly resets |
|---|---|---|---|
| 23:38 | 04:38 | 97.4 % left | 10-21 03:35 |
| 23:50 | 04:50 | 100 % left | 10-22 23:50 |
| 23:57 | 04:57 | 100 % left | 10-22 23:57 |

Every lane line read in the check (four of its six rounds) says `Gemini Models used ? % of the 5 h window and ? % of the weekly one`, for rounds that spent 44 731 to 277 841 tokens. The weekly window also went from 97.4 % left to 100 % left between two reads within the hour, and why is not known.

## Acceptance

A round that starts on a window with nothing used reports the use it made, or says that the harness gave no usable reading and why. A reset time that moves forward with a full window is not treated as a different window.

## Impact

- The brief's Delegación line and `aether-report --seats` cannot show what the seats cost in quota.
- With the reading unstable, the owner cannot tell whether Argon draws on the group the table says it does.

## Proposals

- Treat two readings as the same window when both are full and the reset time moved by about the time between the reads.
- Or compare the remaining fraction of the group across the round and say `no reading` when a window was full before.

Related: issue 015.
