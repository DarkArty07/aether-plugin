# In `command` mode a read-only delegate waits the full 3 seconds of the quota limit for an agy reading that takes 5, and agy cannot serve the task anyway

**Type:** limit (router, quota step)
**Date:** 2026-10-16
**Found in:** the first real sessions of the router in `command` mode, the Lead's session 56b71739
**Status:** open
**GitHub:** [#35](https://github.com/DarkArty07/aether-plugin/issues/35) (private repository)

## What happened

- `quotaStep` in `lib/route.js` renews every enabled harness whose reading is missing or older than its life (10 minutes for agy, 30 for Grok), and then waits up to the `deadlines` quota limit (3 seconds) for the readings to be valid. A task that edits files never reaches it.
- Measured: agy's renewal, `agy -p /usage`, took 5.1 seconds; Grok's took 0.7 seconds. So agy's never fits in the limit, and Grok's does.
- Measured in three real `command` sessions with the default `harnesses` (agy), on a data directory with no reading: each of the four read-only decisions waited the whole limit, 3.002 to 3.004 seconds, and its delegate went out 3.9 to 4.7 seconds after the Lead's call, against 0.5 to 1.7 seconds for a task that edits files. The decider itself took 0.5 to 1.7 seconds. With Grok prewarmed (a valid reading) the wait was 0.
- The wait buys nothing for agy on the owner's data: its Gemini group carries the swarm's dry mark until 2026-10-22, and its Claude and GPT group has no rung measured through agy, so it serves no level. The decision ends on Claude after the wait, as it would without it.

## Impact

- Up to 3 seconds more on every read-only delegate launched in `command` mode, each time agy's reading expires (every 10 minutes of use), for as long as agy is among the `harnesses`. In `record` the wait is in the background and costs nothing.

## Proposals

1. Leave out of the renewal and the wait a group that cannot serve the level whatever its reading says: marked dry, with no rung at the level, or not enabled.
2. Or do not wait for a harness whose last renewal took longer than the limit; renew it in the background and let the next decision use the reading.
3. Keep the wait for a harness that fits, such as Grok (0.7 seconds).

## Acceptance

- A read-only decision in `command` mode with a stale agy reading and no group able to serve adds under 100 ms to the launch; with Grok enabled and stale it still waits for Grok's renewal.

## Environment

Claude Code 2.1.301, Aether plugin 0.12.0, agy 1.4.0, grok 1.0.60, Linux (WSL2).
