# A design seat that fails goes to the native agent without trying the next pair

**Type:** bug (design; design seats)
**Date:** 2026-10-21
**Found in:** the design run `wf_d46ae949-355` of spec 010, in the Lead's session 7c77db6f
**Status:** fixed in 0.14.5 (2026-10-21), branch `fix/external-seats`, decision [A70](../decisions.md)
**GitHub:** none yet. This file is the local record.

## What happened

The Writer seat of round 1 was picked on `agy/gemini-4-argon@high`, which refused at its start («Individual quota reached», 133 h); the native Sonnet Writer wrote the spec although the decision had ranked Grok and Muse next. The same rule that [issue 034](034-an-external-delegate-refused-at-its-start-goes-to-claude-not-to-the-next-candidate.md) fixed for the Lead's delegates was missing in the design seats: a round that fails goes to the native agent.

## Fix

`aether-lane seat-start` and `seat` take `--exclude <id>[,<id>...]` (validated like `pick`'s, accepted by the mod's allowlist on `seat-start` only), and `seatRound` of `workflows/design.workflow.js` asks for the next pair, with the pairs already tried excluded, up to three external tries in all, before the native agent takes the round. A failed start and a round that broke count as tries; a round that did not finish by its deadline, and `no pair left`, still go native. The record of the round lists each try.

## Impact

Every design round that failed on an external harness spent Claude's quota when other plans were free.
