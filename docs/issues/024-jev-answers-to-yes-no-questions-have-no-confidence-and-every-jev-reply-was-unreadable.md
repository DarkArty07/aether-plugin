# Jev's answers to a yes/no question carry no confidence, and the router read every Jev reply as unreadable

**Type:** bug (router, Jev decider)
**Date:** 2026-10-16
**Found in:** the first real call of the Jev decider with the owner's OpenRouter key, in the Lead's session 56b71739, after 0.12.0 was released
**Status:** fixed in 0.12.1
**GitHub:** not filed (found and fixed in the same session)

## What happened

- `aether-route replay --decider jev --paid` on one real delegation answered `decider: unreadable`. The reply of `typesafe/jev-1.14-20261014` had an answer for each of the seven questions, but a `noul` question carries the probability alone: `"edits_files":{"type":"noul","noul":0.95}`, with no `confidence`. `normalizeAnswer` in `lib/router-deciders.js` asked every answer for a finite `confidence`, so `pinned_by_checks`, the first yes/no question, made the whole reply unreadable.
- With `decider=jev`, every call of the router would have failed to its fallback. In `command` mode that is a delegate on `sonnet:high`; in `record` and `advise` it is an empty log. The default decider, Haiku, was not affected.
- The tests could not see it. `tests/router-deciders.test.js`, the other router tests and the exam's simulated Jev all gave a `noul` answer a `confidence`, written by hand from the plan's normalized shape and not copied from a reply of the service. The design's own evidence (`evidence/replay/jev-run.js`) read Jev's `noul` values without a confidence, so it never needed one.

## What the fix does

- A `noul` answer from Jev with no confidence gets one from its probability: how far it is from a coin flip, `|2p - 1|`. A confidence that Jev does give is kept. Haiku is asked for a confidence on every question, and an answer without it is still unreadable.
- Only `edits_files` uses a confidence of a yes/no question: a task is read-only when the probability of editing is under 0.5 and the confidence at least 0.5. With Jev that means a probability of editing of 0.25 or less, stricter than the bare 0.5, which is the safe side for a task that may leave Claude.
- The test now reads a reply saved from the real service (`tests/fixtures/router/jev-reply.json`), and it was checked to fail on the old code.

## Impact

- 0.12.0 shipped with a Jev decider that never decided. Nobody had it on: `decider` is `haiku` by default and `router` is `record`.

## Proposals

1. A decider's test fixture is a reply saved from the real service, not one written from the plan. The exam's rules for the Examiner could say the same for any outside service (see [issue 023](023-examiner-tests-wrong-in-three-places-and-one-could-never-fail.md)).
2. A paid call on purpose before a release: one real call per decider, which costs cents.

## Acceptance

- `aether-route replay --decider jev --paid` on the owner's real history decides all of its delegations. Done: 327 of 327.
- A real session in `command` mode with `decider=jev` rewrites a delegate. Done: the usage meter shows the delegates on the decided models and efforts.

## Environment

Claude Code 2.1.301, Aether plugin 0.12.0, `typesafe/jev-1.14-20261014` through OpenRouter, Linux (WSL2).
