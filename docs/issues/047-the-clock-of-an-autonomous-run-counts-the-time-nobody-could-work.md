# The clock of an autonomous run counts the time nobody could work

**Type:** bug (autonomy; ceilings)
**Date:** 2026-10-21
**Found in:** the run `auto-20261021-000725-3cae`
**Status:** open; spec 011 (the 5-hour brake) is the place to fix it
**GitHub:** none yet. This file is the local record.

## What happened

The run ended on its 8-hour ceiling after 9.86 hours of clock, of which 6.4 hours were `idleMinutes`: the session limit of Claude had run out and nothing could wake the Lead. The `aether-autonomy status` of that moment had `idle: true`, `stop: "time"`. The hours the owner granted were spent waiting, and the run closed with work unfinished that the budget in real work (about 3.4 hours) would have covered.

## Ideas

A run does not count time while it is paused (by the brake, or by a quota the Lead cannot get past), and `idleMinutes` is not part of `hours.elapsed` for the ceiling; or the ceiling counts only the time between the first and the last model request of the Lead. The brake of spec 011 needs a state of pause for this reason.

## Impact

A run that ends early for no work done; the owner has to start another and say so.
