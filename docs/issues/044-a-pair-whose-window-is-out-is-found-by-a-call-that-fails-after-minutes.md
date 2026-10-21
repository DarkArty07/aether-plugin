# A pair whose window is out is found by a call that fails after minutes

**Type:** performance (design, swarm; lane choice)
**Date:** 2026-10-21
**Found in:** the design run `wf_26e31ce5-b93` of spec 011, round 2 of the plan Writer
**Status:** open
**GitHub:** none yet. This file is the local record.

## What happened

At 12:49 the plan Writer was picked on Muse. It ran for 16 minutes and ended at 13:05 with `API error 429: Subscription quota exhausted. Your usage window resets at ...`. Muse's 5-hour window ran out during the call: `lanes/quota/muse-observed.json` of the data directory was written at 13:05, when the call failed, and says 100 % used, resetting at 21:09 UTC (15:09 local), with 83 % of the weekly one. Muse has no `/usage` of its own, so Aether has only what its calls observe; the 22-minute plan Writer before it, and the swarm earlier in the day, had spent the window. What the pick read at 12:49 was not checked; the point is that nothing kept a low window from taking a 16-minute round.

Argon, in the same run, refused twice for quota at the start of a Judge round (12:15 and 13:34, 12 to 17 seconds each) although its refusal said «Resets in 119h»: marks last 60 minutes by design (A60), so the pair is asked again each hour.

## Ideas

Treat a pair whose observed window is low as unfit for a long round (a Writer's), not only a dry one as unfit at all, since a round of 20 minutes can spend what is left; treat 100 % as dry until its stated reset; when a refusal states its reset, keep the mark until then if the statement is a long one (the 60-minute mark exists because an estimate failed once, so keep a recheck, but a long one, not one per round); and, when a call fails for quota after minutes, mark the pair from the error's own reset time (`quota-refusal.js` reads «Resets in ...» for agy; the 429 text of Muse carries a reset too).

## Impact

16 minutes lost in one round, and the same loss waiting in every design or swarm that starts while Muse's window is out.
