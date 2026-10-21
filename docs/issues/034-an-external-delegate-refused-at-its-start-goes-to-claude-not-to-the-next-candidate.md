# An external delegate refused at its start goes to Claude, not to the next ranked candidate

**Type:** bug (design; delegate router)
**Date:** 2026-10-21
**Found in:** the Lead's session 7c77db6f, the first with 0.14.1, watching the router with `harnesses=agy,grok,muse` and `superdelegation` on
**Status:** fixed in 0.14.2 (2026-10-21), branch `fix/delegate-next-candidate`: decision [A67](../decisions.md), `lib/delegate-chain.js`, the tests of the chain
**GitHub:** [#45](https://github.com/DarkArty07/aether-plugin/issues/45) (private repository). This file is the local record.

## What happened

Two read-only delegates asked for `agy/gemini-4-argon@high`. agy refused both at their start: `exit 3: Individual quota reached ... Resets in 135h11m` after 9 s, with 0 tokens used, while `aether-lane quota` showed the Gemini group at 91 % (agy's `/usage` does not show Argon's individual limit; A60). Both then ran on Claude Sonnet high, the rescue rung, and cost about US$ 0.63.

The decision had already ranked the next candidates: `grok/grok-4.7@high` (rank 2, 93 % of its weekly window left) and `muse/muse-wonder-full-1.0@high` (rank 3). Neither was tried. The two refusals were launched 3 s apart, before the first one wrote its mark, so both paid the failed call and the Claude rerun.

The owner's words: «Un problema, si agy estaba activado porque no pasó a muse. Eso es un error de diseño no?»

## Cause

`aether-route delegate` runs one pair (`lib/delegate-calls.js runDelegate`) and, when it does not end ok, `hooks/router.mjs` lets the agent run on Claude. `docs/guide/router.md` said so: an external delegate that fails, for any reason, including a quota refusal, runs on Claude. The ranked candidates (`quota` of the decision) are journaled but nothing reads them after the first pair. The rule the Lead follows says the opposite for a lane that is out of quota at its start: the call goes to the next candidate, and runs native only when none is left.

Two details around it: the refusal is recorded as `failed`, not `quota`, because agy's text does not start with `quota: ` and its reading still shows balance; and a refusal's mark covers the whole `gemini` group (A60 (4)), so after an Argon refusal Flash is kept out for 60 minutes too (not changed here).

## Acceptance

- A refusal at the start of an external delegate (a quota refusal with no tokens used, or a harness that cannot launch) tries the next ranked candidate whose quota group has no live mark, while the delegate's time budget (570 s) allows it.
- A failure after the call started (it used tokens, ran out of time, changed files) still goes to Claude, on the rescue rung.
- The journal records every attempt, and `aether-report --delegates` shows the pair that ran and the ones that refused.
- The answer says which pair gave it.
- Documented in the router guide, with a decision (A67) and tests.

## Impact

A level C read-only delegate spent a failed process, 10 s and a Claude rerun when two other plans had quota. Delegation, the D of RADAR, stops at the first refusal.
