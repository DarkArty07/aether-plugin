# agy refuses a call with «Individual quota reached» while `/usage` shows the group at 98 %, and nothing recognizes the refusal or leaves a mark

**Type:** bug (lanes, quota)
**Date:** 2026-10-15
**Found in:** the design of `specs/006-delegate-router`, the Lead's session 56b71739: three Judge seat rounds on Gemini 4 Argon
**Status:** open
**GitHub:** [#32](https://github.com/DarkArty07/aether-plugin/issues/32) (private repository)

## What happened

- Three Judge rounds of `/aether:design` (22:23, 22:25 and 22:27, UTC-6; seats `balanced`; the installed 0.11.0, with no mark in its data directory) called agy `gemini-4-argon`. All three were refused: `exit 3: Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 163h22m27s.` (then 163h20m6s and 163h18m24s).
- `aether-lane quota agy` from the installed release at 22:33 called the `gemini` group usable: weekly 99.2 % left (resets 2026-10-23 04:13 UTC, in 167.7 h) and 5 h 98 % left.
- After the three refusals the installed release's data directory still has no mark (`~/.claude/plugins/data/aether-aether-plugin/lanes/marks`). A dry mark of 2026-10-14 in the development data directory (`aether-inline`, until 2026-10-17 22:08 UTC) agreed with the refusals.
- Each round fell back to the native Judge, as designed, and retried the group.

## Why nothing marks it

- Swarm lane calls: `judge()` in `lib/lane-calls.js` calls a failure a quota failure only when the reading after the call is not usable (`!lanes.usable(quotaAfter, reserve)`) or the parsed reason starts with `quota: `. With a 98 % reading the refusal matches neither, so it counts as an infrastructure failure and leaves no mark.
- Design seats: `lib/seat-calls.js` never calls `markDry`.
- «Individual quota reached» and «Resets in» appear nowhere under `plugins/aether/lib`.

## Impact

- Every seat round and every swarm lane call retries an exhausted group, and each costs a failed process before it falls back. No data is lost.
- Anything that orders by readings (A49, the delegate router of spec 006) ranks a dead group first: 99 % weekly, resetting in 167 h.
- With issue 020, where the reading of a window with nothing used moves, `/usage` is shown not to include an individual limit, and that limit is the one that enforces.

## Proposals

1. One function recognizes the refusal (the message contains `Individual quota reached` and gives `Resets in XhYmZs`), and `lane-calls.js` and `seat-calls.js` call `markDry` with that reset. Marks accept up to 8 days (`MAX_MARK_MS`).
2. A mark that comes from an explicit refusal is not lifted by a later reading with balance.
3. Find out whether agy offers the individual limit in any command.

## Acceptance

- A call refused with that message leaves a mark until the reset it states, in both paths, and the next start skips the group. A test with the real message covers both.
- A reading with balance does not lift that mark.

## Environment

Aether 0.11.0 installed, agy 1.3.6, Linux (WSL2). Related: issues 015 and 020; R22 and R22b of `specs/006-delegate-router/spec.md`, which keep the router to its own quota decisions.
