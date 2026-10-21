# Small faults of the delegate chain and of the reading of agy's refusal

**Type:** bug (robustness; delegate router)
**Date:** 2026-10-21
**Found in:** reviews of the 0.14.2 code made by delegates in the Lead's sessions 7c77db6f and 7cb8acca; the `quota-refusal.js` ones were reproduced with `node -e`
**Status:** fixed in 0.14.3 (2026-10-21), branch `fix/delegate-time-limits`, decision [A68](../decisions.md): the chain guards its attempts and the refusal reader takes either case and spaces
**GitHub:** none yet. This file is the local record.

## What happened

1. `runChain` (`lib/delegate-chain.js`) does not guard an exception of `runDelegate` or of `markRefusal` (the mark file can fail to write). The attempt leaves no outcome entry; the mod still runs the agent on Claude, because the bin exits with an error.
2. `isStartRefusal` ignores whether the attempt was killed at its limit. A call killed by the timeout, with zero tokens recorded and the group already under the reserve, ends as `quota` and looks like a refusal at the start. The time budget stops the chain in practice, but the rule is wrong on its face.
3. `lib/quota-refusal.js` reads `Resets in 163H22M27S` as 0 ms (the unit pattern lacks the `i` flag), `Resets in 2h 30m` as 2 h, and `Resets in 1.5h` as none. The refusal is still recognized and the mark always holds 60 minutes, so the effect is only a lost `statedResetMs`.

## Acceptance

- A throw inside an attempt becomes a failed attempt with its outcome entry; the chain goes on to Claude as for any failure.
- An attempt killed at its limit is never a refusal at the start.
- The stated reset is read whatever the case of the units, and with spaces between the parts; a duration the reader cannot place gives none, as today.
- Tests for each.

## Impact

None visible today; each one hides a failure from the journal or reads a refusal wrongly if agy changes its wording.
